import { describe, expect, it } from "vitest";
import { DiscussionEngine, type DiscussionAgent } from "@/lib/discussion";
import type { DiscussionTask } from "@/lib/discussion/types";
import { BeliefContractRegistry, getBeliefContract } from "@/lib/epistemic";

function task(epistemic = true): DiscussionTask {
  return {
    id: "epistemic-task",
    description: "Test explicit probability reporting",
    type: "binary-verifiable",
    content: "Is proposition C true?",
    createdAt: "2026-08-07T00:00:00.000Z",
    epistemic: epistemic ? {
      reportingMode: "explicit_probability",
      requireAllClaims: true,
      claims: [{
        id: "claim-c",
        proposition: "C is true",
        domain: "test",
        createdAt: "2026-08-07T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "test-oracle" },
      }],
    } : undefined,
  };
}

function agent(
  id: string,
  probability: number,
  prompts: string[],
): DiscussionAgent {
  let state = { belief: 0, confidence: 50 };
  return {
    id,
    name: id,
    role: "analyst",
    type: "llm",
    getState: () => ({ ...state }),
    setState: next => { state = { ...next }; },
    sendMessage: async prompt => {
      prompts.push(prompt);
      return JSON.stringify({
        reasoning: `${id} assessment`,
        evidence: [],
        belief: probability * 2 - 1,
        confidence: 80,
        nextOpinion: "",
        referencedAgents: [],
        claims: [{
          claimId: "claim-c",
          probability,
          evidence: [{ content: `${id} evidence`, relation: "supports" }],
        }],
      });
    },
  };
}

function categoricalTask(): DiscussionTask {
  return {
    id: "categorical-epistemic-task",
    description: "Test explicit categorical belief reporting",
    type: "categorical-verifiable",
    content: "Which option is correct?",
    createdAt: "2026-08-07T00:00:00.000Z",
    epistemic: {
      reportingMode: "explicit_belief",
      requireAllClaims: true,
      claims: [{
        id: "claim-choice",
        proposition: "The correct option",
        domain: "test",
        createdAt: "2026-08-07T00:00:00.000Z",
        options: ["A", "B", "C"],
        resolutionPolicy: { kind: "categorical", resolverId: "test-oracle" },
      }],
    },
  };
}

function categoricalAgent(
  id: string,
  probabilities: Record<string, number>,
  prompts: string[],
): DiscussionAgent {
  let state = { belief: 0, confidence: 50 };
  return {
    id,
    name: id,
    role: "analyst",
    type: "llm",
    getState: () => ({ ...state }),
    setState: next => { state = { ...next }; },
    sendMessage: async prompt => {
      prompts.push(prompt);
      return JSON.stringify({
        reasoning: `${id} categorical assessment`,
        evidence: [],
        belief: 0,
        confidence: 80,
        claims: [{
          claimId: "claim-choice",
          probabilities,
          evidence: [],
        }],
      });
    },
  };
}

describe("epistemic runtime boundary", () => {
  it("atomically commits reports and architecture-observed same-round exposure", async () => {
    const prompts: string[] = [];
    const engine = new DiscussionEngine({ maxRounds: 1, governanceMode: "none", seed: 1 });

    await engine.run([
      agent("a1", 0.8, prompts),
      agent("a2", 0.3, prompts),
    ], task());

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("EPISTEMIC REPORTING CONTRACT");
    expect(prompts[0]).not.toContain("DeGroot");
    expect(prompts[1]).toContain("a1 assessment");
    expect(prompts[1]).toContain("claim-c=P(0.8000)");

    const events = engine.getEpistemicEvents();
    const reports = events
      .filter(event => event.type === "belief_reported")
      .map(event => event.report);
    const exposures = events
      .filter(event => event.type === "belief_exposed")
      .map(event => event.exposure);

    expect(reports).toHaveLength(2);
    expect(exposures).toHaveLength(1);
    expect(exposures[0]).toMatchObject({
      sourceReportId: reports[0].id,
      targetAgentId: "a2",
      claimId: "claim-c",
      round: 1,
      channel: "current_round",
    });
    expect(reports[1].observedReportIds).toEqual([reports[0].id]);
    expect(reports.every(report => report.stake === 0)).toBe(true);
    expect(engine.getRoundDataArray()[0].epistemicCommit).toEqual({
      evidenceCount: 2,
      reportCount: 2,
      exposureCount: 1,
    });
  });

  it("does not infer probability semantics without an explicit task contract", async () => {
    const prompts: string[] = [];
    const engine = new DiscussionEngine({ maxRounds: 1, governanceMode: "none" });

    await engine.run([
      agent("a1", 0.99, prompts),
      agent("a2", 0.01, prompts),
    ], task(false));

    expect(prompts.every(prompt => !prompt.includes("EPISTEMIC REPORTING CONTRACT"))).toBe(true);
    expect(engine.getEpistemicEvents()).toEqual([]);
    expect(engine.getRoundDataArray()[0].epistemicCommit).toBeUndefined();
    expect(engine.getRoundDataArray()[0].opinions.every(
      opinion => opinion.claimParseStatus === "not_applicable" && opinion.claimReports === undefined,
    )).toBe(true);
  });

  it("rejects unknown claims without partially committing the model payload", async () => {
    let state = { belief: 0, confidence: 50 };
    const invalidAgent: DiscussionAgent = {
      id: "a1",
      name: "a1",
      role: "analyst",
      type: "llm",
      getState: () => ({ ...state }),
      setState: next => { state = { ...next }; },
      sendMessage: async () => JSON.stringify({
        reasoning: "invalid claim",
        belief: 0,
        confidence: 50,
        claims: [{ claimId: "invented", probability: 0.9, evidence: [] }],
      }),
    };
    const engine = new DiscussionEngine({ maxRounds: 1, governanceMode: "none" });

    await engine.run([invalidAgent, agent("a2", 0.5, [])], task());

    const opinions = engine.getRoundDataArray()[0].opinions;
    expect(opinions.find(opinion => opinion.agentId === "a1")?.claimParseStatus).toBe("invalid");
    const reports = engine.getEpistemicEvents().filter(event => event.type === "belief_reported");
    expect(reports).toHaveLength(1);
    expect(reports[0].type === "belief_reported" && reports[0].report.agentId).toBe("a2");
  });

  it("links revisions across rounds and records memory exposure", async () => {
    const engine = new DiscussionEngine({
      maxRounds: 2,
      governanceMode: "none",
      terminationPolicy: "fixed_rounds",
    });

    await engine.run([
      agent("a1", 0.8, []),
      agent("a2", 0.3, []),
    ], task());

    const reports = engine.getEpistemicEvents()
      .filter(event => event.type === "belief_reported")
      .map(event => event.report);
    const a1Reports = reports.filter(report => report.agentId === "a1");
    const a2Reports = reports.filter(report => report.agentId === "a2");
    expect(a1Reports).toHaveLength(2);
    expect(a2Reports).toHaveLength(2);
    expect(a1Reports[1].supersedesReportId).toBe(a1Reports[0].id);
    expect(a2Reports[1].supersedesReportId).toBe(a2Reports[0].id);

    const memoryExposures = engine.getEpistemicEvents()
      .filter(event => event.type === "belief_exposed" && event.exposure.channel === "memory");
    expect(memoryExposures.length).toBeGreaterThanOrEqual(2);
  });

  it("fails closed when a legacy hidden communication path is enabled", async () => {
    const engine = new DiscussionEngine({
      maxRounds: 1,
      governanceMode: "none",
      enableCrossExamination: true,
    });

    await expect(engine.run([
      agent("a1", 0.8, []),
      agent("a2", 0.3, []),
    ], task())).rejects.toThrow("legacy cross-examination");
    expect(engine.getEpistemicEvents()).toEqual([]);
  });

  it("commits and renders categorical belief distributions without scalar coercion", async () => {
    const prompts: string[] = [];
    const engine = new DiscussionEngine({ maxRounds: 1, governanceMode: "none", seed: 1 });

    await engine.run([
      categoricalAgent("a1", { A: 0.2, B: 0.7, C: 0.1 }, prompts),
      categoricalAgent("a2", { A: 0.4, B: 0.4, C: 0.2 }, prompts),
    ], categoricalTask());

    expect(prompts[0]).toContain('"beliefKind":"categorical"');
    expect(prompts[0]).toContain('"options":["A","B","C"]');
    expect(prompts[1]).toContain("claim-choice=P(A)=0.2000;P(B)=0.7000;P(C)=0.1000");
    const reports = engine.getEpistemicEvents()
      .filter(event => event.type === "belief_reported")
      .map(event => event.report);
    expect(reports).toHaveLength(2);
    expect(reports[0].value).toEqual({
      kind: "categorical",
      probabilities: { A: 0.2, B: 0.7, C: 0.1 },
    });
  });

  it("rejects a categorical report that is not a complete normalized simplex", async () => {
    const engine = new DiscussionEngine({ maxRounds: 1, governanceMode: "none" });
    await engine.run([
      categoricalAgent("a1", { A: 0.7, B: 0.3 }, []),
    ], categoricalTask());

    const opinion = engine.getRoundDataArray()[0].opinions[0];
    expect(opinion.claimParseStatus).toBe("invalid");
    expect(engine.getEpistemicEvents().filter(event => event.type === "belief_reported")).toEqual([]);
  });

  it("uses the injected contract registry across engine reset boundaries", async () => {
    const base = getBeliefContract("binary");
    let normalizations = 0;
    const registry = new BeliefContractRegistry([{
      ...base,
      normalizeValue(candidate, value) {
        normalizations++;
        return base.normalizeValue(candidate, value);
      },
    }]);
    const engine = new DiscussionEngine({
      maxRounds: 1,
      governanceMode: "none",
      epistemicContractRegistry: registry,
    });

    await engine.run([agent("a1", 0.8, [])], task());
    engine.reset();
    await engine.run([agent("a1", 0.7, [])], task());

    expect(normalizations).toBeGreaterThanOrEqual(4);
  });
});
