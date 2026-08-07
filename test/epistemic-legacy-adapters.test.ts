import { describe, expect, it } from "vitest";
import { latestLegacyTelemetry, observeLegacyQuantities } from "@/lib/epistemic";

describe("legacy epistemic adapters", () => {
  it("records legacy signals as telemetry with explicit source provenance", () => {
    const utility = { alpha: 0.8, beta: -0.2 };
    const records = observeLegacyQuantities({
      eventId: "observation:task-1:1:agent-1",
      observedAt: "2026-08-07T00:00:00.000Z",
      stance: 0.4,
      confidence: 82,
      utility,
      evidenceCoverage: 0.6,
      evidenceQuality: 0.7,
      sources: {
        stance: "agent_reported",
        confidence: "agent_reported",
        utility: "agent_reported",
        evidenceCoverage: "runtime_default",
        evidenceQuality: "agent_reported",
      },
    });

    expect(records).toHaveLength(5);
    expect(records.every(record => record.layer === "behavioral_telemetry")).toBe(true);
    expect(records.map(record => record.name)).toEqual([
      "legacy_stance",
      "legacy_confidence",
      "legacy_utility",
      "legacy_evidence_coverage",
      "legacy_evidence_quality",
    ]);
    expect(records[0].value).toEqual({
      semanticRole: "task_stance",
      source: "agent_reported",
      scale: "[-1,1]",
      value: 0.4,
    });
    expect(records[3].value.source).toBe("runtime_default");

    utility.alpha = -1;
    expect(records[2].value.value).toEqual({ alpha: 0.8, beta: -0.2 });
  });

  it("attaches stable method identities to derived compatibility values", () => {
    const records = observeLegacyQuantities({
      eventId: "observation:derived",
      observedAt: "2026-08-07T00:00:00.000Z",
      stance: 0.25,
      confidence: 50,
      sources: {
        stance: "derived_from_item_preferences",
        confidence: "compatibility_carry_forward",
      },
    });

    expect(records[0].value.methodId).toBe("legacy.stance_from_item_preferences.v1");
    expect(records[1].value.methodId).toBe("legacy.compatibility_carry_forward.v1");
  });

  it("keeps superseded observations auditable while selecting the latest record", () => {
    const initial = observeLegacyQuantities({
      eventId: "observation:initial",
      observedAt: "2026-08-07T00:00:00.000Z",
      confidence: 50,
      sources: { confidence: "runtime_default" },
    });
    const replacement = observeLegacyQuantities({
      eventId: "observation:inferred",
      observedAt: "2026-08-07T00:00:01.000Z",
      confidence: 80,
      sources: { confidence: "model_inferred" },
      methods: { confidence: "test.inference.v1" },
      supersedes: { confidence: initial[0].eventId },
    });
    const history = [...initial, ...replacement];

    expect(history).toHaveLength(2);
    expect(replacement[0].supersedesEventId).toBe(initial[0].eventId);
    expect(latestLegacyTelemetry(history, "legacy_confidence")).toBe(replacement[0]);
  });

  it("does not invent probability or reported-belief records", () => {
    const records = observeLegacyQuantities({
      eventId: "observation:legacy-only",
      observedAt: "2026-08-07T00:00:00.000Z",
      stance: 1,
      confidence: 100,
    });

    expect(records).toHaveLength(2);
    expect(records.every(record => record.layer !== ("reported_belief" as string))).toBe(true);
    expect(records[0].value.source).toBe("unspecified_parser_output");
    expect(records[0].value.value).toBe(1);
  });

  it.each([
    { field: "stance", stance: 1.01, confidence: 50 },
    { field: "confidence", stance: 0, confidence: 101 },
    { field: "evidenceCoverage", stance: 0, confidence: 50, evidenceCoverage: -0.1 },
    { field: "utility.alpha", stance: 0, confidence: 50, utility: { alpha: Number.NaN } },
  ])("fails closed for invalid $field", ({ stance, confidence, ...optional }) => {
    expect(() => observeLegacyQuantities({
      eventId: "observation:invalid",
      observedAt: "2026-08-07T00:00:00.000Z",
      stance,
      confidence,
      ...optional,
    })).toThrow();
  });
});
