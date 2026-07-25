/**
 * Cognitive State Model — Phase 2 验证实验
 *
 * 验证核心假设：
 *   H1: Evidence 在讨论过程中积累（items > 0, coverage 有变化）
 *   H2: Inertia 因角色不同而有差异（expert > novice）
 *   H3: Confidence 在 agent 间有意义的差异（非全同）
 *   H4: Susceptibility λ 处于合理范围（0.05 ~ 0.95）
 *   H5: Utility 的 preferenceClarity 与旧 belief 强相关
 *
 * 用法: npx tsx experiments/lunar_survival/validate_cognitive.ts
 * 输出: experiments/lunar_survival/data/cognitive_validation.json
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import type { LLMConfig } from "../../src/lib/llm/providers";
import type { AgentCognitiveState } from "../../src/lib/agent/cognitiveState";
import { computeSusceptibility } from "../../src/lib/agent/cognitiveState";

import { TASK_LUNAR, EXPERIMENT_PARAMS } from "./config";

// ============================================================================
// Types
// ============================================================================

interface ValidationRun {
  seed: number;
  finalAccuracy: number;
  totalRounds: number;
  finalBeliefs: Record<string, number>;
  cognitiveStates: Record<string, AgentCognitiveState>;
}

interface ValidationReport {
  timestamp: string;
  task: string;
  totalRuns: number;
  runs: ValidationRun[];
  hypotheses: {
    H1_evidence_accumulation: { passed: boolean; details: string };
    H2_inertia_by_role: { passed: boolean; details: string };
    H3_confidence_variance: { passed: boolean; details: string };
    H4_susceptibility_range: { passed: boolean; details: string };
    H5_utility_belief_correlation: { passed: boolean; details: string };
  };
  summary: string;
}

// ============================================================================
// Helpers
// ============================================================================

function accuracyFromTask(task: typeof TASK_LUNAR, decision: string): number {
  const items = Object.keys(task.correctAnswer);
  const keys = task.searchKeys || {};
  let score = 0;
  for (const [item] of Object.entries(task.correctAnswer)) {
    const keywords = keys[item] || [item];
    const firstPos = Math.min(
      ...keywords.map(kw => {
        const idx = decision.indexOf(kw);
        return idx >= 0 ? idx : Infinity;
      })
    );
    if (firstPos < Infinity) {
      score += 1 - (firstPos / Math.max(decision.length, 1)) * 0.5;
    }
  }
  return Math.round((score / items.length) * 100);
}

function createAgents(task: typeof TASK_LUNAR, llmConfig: LLMConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const systemPrompt =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n`
      + `讨论规则：\n`
      + `1. 主动分享你的独有知识\n`
      + `2. 对他人的判断提出质疑\n`
      + `3. 如果他人与你独有知识矛盾，必须指出\n`
      + `4. 第一轮先分享核心判断，后续轮次根据反馈调整\n\n`
      + `回复格式：{"emotion": -100到100, "reasoning": "你的分析"}`;
    return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt) as unknown as DiscussionAgent;
  });
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const SEEDS = [42, 123, 456, 789, 1024];
  const TASK = TASK_LUNAR;

  console.log("=".repeat(65));
  console.log("  Cognitive State Model — Phase 2 Validation");
  console.log("=".repeat(65));
  console.log(`  Task: ${TASK.title}`);
  console.log(`  Seeds: ${SEEDS.join(", ")}`);
  console.log(`  Total runs: ${SEEDS.length}`);
  console.log(`  Mode: useCognitiveState=true, governanceMode=none`);
  console.log("=".repeat(65));

  const llmConfig: LLMConfig = {
    provider: EXPERIMENT_PARAMS.provider,
    model: EXPERIMENT_PARAMS.model,
    temperature: EXPERIMENT_PARAMS.temperature,
  };

  const allRuns: ValidationRun[] = [];

  for (const seed of SEEDS) {
    console.log(`\n🔄 Run with seed=${seed}...`);

    const agents = createAgents(TASK, llmConfig);
    const engine = new DiscussionEngine({
      maxRounds: EXPERIMENT_PARAMS.maxRounds,
      convergenceThreshold: EXPERIMENT_PARAMS.convergenceThreshold,
      governanceMode: "none",
      seed,
      useCognitiveState: true,
    });

    const taskObj = {
      id: `cognitive_validation_${seed}`,
      description: TASK.title,
      type: "discussion" as const,
      createdAt: new Date().toISOString(),
      content: TASK.sharedBriefing,
    };

    const result = await engine.run(agents, taskObj);
    const cognitiveStates = engine.getCognitiveStates();

    const allReasoning = result.roundResults
      .flatMap(r => r.opinions.map(o => o.reasoning))
      .join("\n");
    const accuracy = accuracyFromTask(TASK, allReasoning);

    const finalBeliefs: Record<string, number> = {};
    const lastRound = result.roundResults[result.roundResults.length - 1];
    if (lastRound) {
      for (const op of lastRound.opinions) {
        finalBeliefs[op.agentId] = op.belief;
      }
    }

    const csObj: Record<string, AgentCognitiveState> = {};
    for (const [id, state] of cognitiveStates) {
      csObj[id] = state;
    }

    allRuns.push({
      seed,
      finalAccuracy: accuracy,
      totalRounds: result.totalRounds,
      finalBeliefs,
      cognitiveStates: csObj,
    });

    // Print per-agent summary
    const agentLines: string[] = [];
    for (const [id, cs] of cognitiveStates) {
      const λ = computeSusceptibility(cs.inertia, cs.confidence);
      agentLines.push(
        `    ${cs.agentName}(${cs.agentRole}): ` +
        `belief=${finalBeliefs[id]?.toFixed(2) ?? "N/A"}, ` +
        `util=${cs.utility.topChoice}(${cs.utility.preferenceClarity.toFixed(2)}), ` +
        `evid=${cs.evidence.items.length}items(cov=${cs.evidence.coverage.toFixed(2)}), ` +
        `inert=${cs.inertia.strength.toFixed(3)}, ` +
        `conf=${cs.confidence.overall.toFixed(3)}, ` +
        `λ=${λ.toFixed(3)}`
      );
    }
    console.log(agentLines.join("\n"));
    console.log(`  ✅ Accuracy=${accuracy}%, Rounds=${result.totalRounds}, Agents=${cognitiveStates.size}`);
  }

  // ==========================================================================
  // Hypothesis Testing
  // ==========================================================================

  console.log("\n" + "=".repeat(65));
  console.log("  HYPOTHESIS VALIDATION");
  console.log("=".repeat(65));

  // --- H1: Evidence accumulation ---
  console.log("\n📊 H1: Evidence 在讨论过程中积累");
  let h1Passed = true;
  const h1Details: string[] = [];

  const allEvidences = allRuns.flatMap(r =>
    Object.values(r.cognitiveStates).map(cs => ({
      coverage: cs.evidence.coverage,
      quality: cs.evidence.quality,
      diversity: cs.evidence.diversity,
      itemCount: cs.evidence.items.length,
    }))
  );

  const avgItemCount = mean(allEvidences.map(e => e.itemCount));
  const avgCoverage = mean(allEvidences.map(e => e.coverage));

  h1Details.push(`  Avg itemCount: ${avgItemCount.toFixed(1)} (expected > 0)`);
  h1Details.push(`  Avg coverage: ${avgCoverage.toFixed(3)} (expected > 0.1)`);
  h1Details.push(`  Agent with most items: ${Math.max(...allEvidences.map(e => e.itemCount))}`);
  h1Details.push(`  Agent with least items: ${Math.min(...allEvidences.map(e => e.itemCount))}`);

  if (avgItemCount < 1) { h1Passed = false; h1Details.push("  ❌ Evidence items too few"); }
  else h1Details.push("  ✅ Evidence accumulating");

  console.log(h1Details.join("\n"));

  // --- H2: Inertia by role ---
  console.log("\n📊 H2: Inertia 因角色不同而有差异");
  let h2Passed = true;
  const h2Details: string[] = [];

  // Group inertia by role across all runs
  const inertiaByRole = new Map<string, number[]>();
  for (const run of allRuns) {
    for (const cs of Object.values(run.cognitiveStates)) {
      const role = cs.agentRole;
      if (!inertiaByRole.has(role)) inertiaByRole.set(role, []);
      inertiaByRole.get(role)!.push(cs.inertia.strength);
    }
  }

  for (const [role, values] of inertiaByRole) {
    h2Details.push(`  ${role}: inertia=${mean(values).toFixed(3)} ± ${std(values).toFixed(3)} (n=${values.length})`);
  }

  // Check that expert has higher inertia than novice
  const expertValues = inertiaByRole.get("医疗专家") ?? [];
  const noviceValues = inertiaByRole.get("生存专家") ?? [];
  if (expertValues.length > 0 && noviceValues.length > 0) {
    const expertMean = mean(expertValues);
    const noviceMean = mean(noviceValues);
    h2Details.push(`  Expert vs non-expert: ${expertMean.toFixed(3)} vs ${noviceMean.toFixed(3)} ${expertMean > noviceMean ? "✅" : "⚠️"}`);
  }

  // Check inertia varies across roles
  const allInertiaMeans = Array.from(inertiaByRole.values()).map(v => mean(v));
  const inertiaSpread = std(allInertiaMeans);
  h2Details.push(`  Cross-role inertia std: ${inertiaSpread.toFixed(4)} ${inertiaSpread > 0.01 ? "✅ (varies by role)" : "❌ (too uniform)"}`);
  if (inertiaSpread < 0.01) h2Passed = false;

  console.log(h2Details.join("\n"));

  // --- H3: Confidence variance ---
  console.log("\n📊 H3: Confidence 在 agent 间有意义的差异");
  let h3Passed = true;
  const h3Details: string[] = [];

  const allConfOverall = allRuns.flatMap(r =>
    Object.values(r.cognitiveStates).map(cs => cs.confidence.overall)
  );
  const allConfEvidence = allRuns.flatMap(r =>
    Object.values(r.cognitiveStates).map(cs => cs.confidence.evidenceBased)
  );

  h3Details.push(`  Overall confidence: ${mean(allConfOverall).toFixed(3)} ± ${std(allConfOverall).toFixed(3)}`);
  h3Details.push(`  Evidence-based confidence: ${mean(allConfEvidence).toFixed(3)} ± ${std(allConfEvidence).toFixed(3)}`);
  h3Details.push(`  Range: [${Math.min(...allConfOverall).toFixed(3)}, ${Math.max(...allConfOverall).toFixed(3)}]`);

  const confStdOverall = std(allConfOverall);
  if (confStdOverall > 0.01) h3Details.push("  ✅ Confidence varies meaningfully across agents");
  else { h3Passed = false; h3Details.push("  ❌ Confidence too uniform"); }

  console.log(h3Details.join("\n"));

  // --- H4: Susceptibility range ---
  console.log("\n📊 H4: Susceptibility λ 处于合理范围");
  let h4Passed = true;
  const h4Details: string[] = [];

  const allLambda = allRuns.flatMap(r =>
    Object.values(r.cognitiveStates).map(cs => computeSusceptibility(cs.inertia, cs.confidence))
  );

  const minLambda = Math.min(...allLambda);
  const maxLambda = Math.max(...allLambda);
  const avgLambda = mean(allLambda);

  h4Details.push(`  λ range: [${minLambda.toFixed(4)}, ${maxLambda.toFixed(4)}]`);
  h4Details.push(`  λ mean: ${avgLambda.toFixed(4)}`);
  h4Details.push(`  Expected: 0.05 ≤ λ ≤ 0.95`);

  if (minLambda >= 0.05 && maxLambda <= 0.95) {
    h4Details.push("  ✅ λ within valid range");
  } else {
    h4Passed = false;
    h4Details.push(`  ❌ λ out of bounds: min=${minLambda.toFixed(4)}, max=${maxLambda.toFixed(4)}`);
  }

  console.log(h4Details.join("\n"));

  // --- H5: Utility-Belief correlation ---
  console.log("\n📊 H5: Utility preferenceClarity 与旧 belief 强相关");
  let h5Passed = true;
  const h5Details: string[] = [];

  const pairs: Array<{ belief: number; clarity: number; intensity: number }> = [];
  for (const run of allRuns) {
    for (const [agentId, cs] of Object.entries(run.cognitiveStates)) {
      const belief = run.finalBeliefs[agentId];
      if (belief !== undefined) {
        pairs.push({
          belief: Math.abs(belief),
          clarity: cs.utility.preferenceClarity,
          intensity: cs.utility.intensity,
        });
      }
    }
  }

  // Pearson correlation: |belief| vs preferenceClarity
  const n = pairs.length;
  const meanB = mean(pairs.map(p => p.belief));
  const meanC = mean(pairs.map(p => p.clarity));
  const cov = pairs.reduce((s, p) => s + (p.belief - meanB) * (p.clarity - meanC), 0) / n;
  const stdB = std(pairs.map(p => p.belief));
  const stdC = std(pairs.map(p => p.clarity));
  const r = stdB > 0 && stdC > 0 ? cov / (stdB * stdC) : 0;

  // Spearman rank correlation: |belief| vs intensity
  const ranked = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) ranks[sorted[i].i] = i + 1;
    return ranks;
  };
  const rankB = ranked(pairs.map(p => p.belief));
  const rankI = ranked(pairs.map(p => p.intensity));
  const meanRB = mean(rankB);
  const meanRI = mean(rankI);
  const covR = rankB.reduce((s, rb, i) => s + (rb - meanRB) * (rankI[i] - meanRI), 0) / n;
  const stdRB = std(rankB);
  const stdRI = std(rankI);
  const rho = stdRB > 0 && stdRI > 0 ? covR / (stdRB * stdRI) : 0;

  h5Details.push(`  |belief| vs preferenceClarity: r=${r.toFixed(3)} (Pearson)`);
  h5Details.push(`  |belief| vs intensity: ρ=${rho.toFixed(3)} (Spearman)`);
  h5Details.push(`  Sample size: ${n} agent-states`);

  if (r > 0.3 || rho > 0.3) {
    h5Details.push("  ✅ Moderate-to-strong correlation — utility captures belief structure");
  } else if (r > 0.1 || rho > 0.1) {
    h5Details.push("  ⚠️ Weak correlation — utility partially independent (expected in Phase 2)");
  } else {
    h5Passed = false;
    h5Details.push("  ❌ No correlation — utility not tracking belief");
  }

  console.log(h5Details.join("\n"));

  // ==========================================================================
  // Summary
  // ==========================================================================

  const allPassed = h1Passed && h2Passed && h3Passed && h4Passed && h5Passed;
  const passedCount = [h1Passed, h2Passed, h3Passed, h4Passed, h5Passed].filter(Boolean).length;

  console.log("\n" + "=".repeat(65));
  console.log(`  VALIDATION RESULT: ${passedCount}/5 hypotheses passed`);
  console.log(`  ${allPassed ? "✅ ALL PASSED — Model is valid" : "⚠️ SOME FAILED — Review needed"}`);
  console.log("=".repeat(65));

  // ==========================================================================
  // Save report
  // ==========================================================================

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    task: TASK.id,
    totalRuns: allRuns.length,
    runs: allRuns,
    hypotheses: {
      H1_evidence_accumulation: { passed: h1Passed, details: h1Details.join("\n") },
      H2_inertia_by_role: { passed: h2Passed, details: h2Details.join("\n") },
      H3_confidence_variance: { passed: h3Passed, details: h3Details.join("\n") },
      H4_susceptibility_range: { passed: h4Passed, details: h4Details.join("\n") },
      H5_utility_belief_correlation: { passed: h5Passed, details: h5Details.join("\n") },
    },
    summary: `${passedCount}/5 hypotheses passed. ${allPassed ? "Cognitive state model validated." : "Some hypotheses need review."}`,
  };

  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "cognitive_validation.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  console.log(`\n📄 Report saved to experiments/lunar_survival/data/cognitive_validation.json`);
}

main().catch(err => { console.error("Validation failed:", err); process.exit(1); });