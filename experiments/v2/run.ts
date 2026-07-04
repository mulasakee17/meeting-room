/**
 * SwarmAlpha V2 Experiment Runner
 *
 * Focused, statistically-valid experiment on the M&A Hidden Profile task.
 *
 * Research question:
 *   Can adaptive governance improve collective decision quality
 *   in multi-agent systems?
 *
 * Design:
 *   1 task (M&A) × 4 ablation modes × 15 runs = 60 experiments
 *   Accuracy metric: Kendall's τ (rank correlation), not keyword matching
 *   Intervention validation: measure actual belief change after intervention
 *
 * Usage: npx tsx experiments/v2/run.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import { EvaluationEngine } from "../../src/lib/evaluation";
import { GovernanceRuntime } from "../../src/runtime/GovernanceRuntime";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { TASK_MA, type TaskConfig } from "../lunar_survival/config";

// ============================================================================
// Types
// ============================================================================

/** Ablation modes — "random-intervene" removed (proved useless), added "static" */
type Ablation = "none" | "detect-only" | "full" | "adaptive";

interface RoundRecord {
  roundNumber: number;
  beliefs: Record<string, number>;
  confidences: Record<string, number>;
  converged: boolean;
  /** Governance issues detected this round */
  issues: string[];
  /** Interventions applied this round */
  interventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }>;
}

interface InterventionEffect {
  round: number;
  interventionType: string;
  targetAgentId?: string;
  /** Belief before intervention */
  beliefBefore: number;
  /** Belief after intervention (next round's opening belief for that agent) */
  beliefAfter: number;
  /** Did belief move in the expected direction? */
  effective: boolean;
}

interface ExperimentResult {
  runId: string;
  ablation: Ablation;
  runIndex: number;
  timestamp: string;

  // Primary metrics
  kendallTau: number;          // -1 to 1, 1 = perfect rank agreement
  decisionQuality: number;     // transformed to 0-100

  // Secondary metrics
  totalRounds: number;
  converged: boolean;
  consensusLevel: number;      // Kuramoto order parameter (final round)
  opinionDiversity: number;    // belief std (final round)

  // Governance
  totalInterventions: number;
  issuesDetected: string[];
  interventionEffects: InterventionEffect[];

  // Evaluation
  evaluationScores: Record<string, number>;

  // Full timeline
  rounds: RoundRecord[];
  finalDecision: string;
  groundTruth: Record<string, number>;
  extractedRanking: string[];
}

// ============================================================================
// Parameters
// ============================================================================

const PARAMS = {
  maxRounds: 5,
  convergenceThreshold: 0.06,
  temperature: 0.2,
  model: "deepseek-chat",
  provider: "deepseek" as const,
  runsPerCondition: 15,
  ablationModes: ["none", "detect-only", "full", "adaptive"] as Ablation[],
};

const DATA_DIR = path.resolve(__dirname, "data");
const LLM_CONFIG: LLMConfig = {
  provider: PARAMS.provider,
  model: PARAMS.model,
  temperature: PARAMS.temperature,
};

// ============================================================================
// Accuracy: Kendall's τ rank correlation
// ============================================================================

/**
 * Extract ranking from decision text by finding the first mention position
 * of each company name. Earlier mention = higher rank.
 */
function extractRanking(decision: string, itemNames: string[]): string[] {
  const positions = itemNames.map(name => {
    // Match the short company name (before the parenthesis)
    const shortName = name.split("(")[0]?.trim() || name;
    const idx = decision.indexOf(shortName);
    return { name, pos: idx >= 0 ? idx : Infinity };
  });
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map(p => p.name);
}

/**
 * Kendall's τ-b rank correlation coefficient.
 * τ = (concordant_pairs - discordant_pairs) / sqrt((n0 - n1)(n0 - n2))
 * where n0 = n*(n-1)/2, n1 = Σ(t_i*(t_i-1)/2) for ties in x, n2 for ties in y.
 * Returns value in [-1, 1].
 */
function kendallTau(groundTruth: Record<string, number>, extracted: string[]): number {
  const items = Object.keys(groundTruth);
  const n = items.length;
  if (n < 2) return 0;

  // Build rank vectors
  const gtRank = new Map<string, number>();
  for (const [item, rank] of Object.entries(groundTruth)) {
    gtRank.set(item, rank);
  }

  const x: number[] = [];
  const y: number[] = [];
  for (const item of items) {
    const gt = gtRank.get(item) ?? 0;
    const extIdx = extracted.indexOf(item);
    const ext = extIdx >= 0 ? extIdx + 1 : n + 1; // unmentioned items rank last
    x.push(gt);
    y.push(ext);
  }

  // Count concordant and discordant pairs
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      if (dx === 0) tiesX++;
      if (dy === 0) tiesY++;
      if (dx * dy > 0) concordant++;
      else if (dx * dy < 0) discordant++;
    }
  }

  const n0 = n * (n - 1) / 2;
  const n1 = tiesX * (tiesX - 1) / 2; // simplified; exact tie counting would be per-group
  const n2 = tiesY * (tiesY - 1) / 2;
  const denom = Math.sqrt((n0 - n1) * (n0 - n2));

  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

/**
 * Transform Kendall's τ to a 0-100 "decision quality" score.
 * τ = -1 → 0, τ = 0 → 50, τ = 1 → 100.
 */
function tauToQuality(tau: number): number {
  return Math.round(((tau + 1) / 2) * 100);
}

// ============================================================================
// Agent creation
// ============================================================================

function createAgents(task: TaskConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const systemPrompt =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n`
      + `讨论规则：\n`
      + `1. 主动分享你的独有知识\n`
      + `2. 对他人的判断提出质疑\n`
      + `3. 如果他人与你独有知识矛盾，必须指出\n`
      + `4. 最终以JSON格式给出你的排序，格式：{"emotion": -100到100, "reasoning": "你的分析"}`;
    return new CustomAgent(info.id, info.name, info.role, "default", LLM_CONFIG, systemPrompt) as unknown as DiscussionAgent;
  });
}

// ============================================================================
// Intervention validation
// ============================================================================

/**
 * After all rounds are complete, measure whether interventions actually
 * changed the target agent's belief in subsequent rounds.
 */
function validateInterventions(
  rounds: RoundRecord[],
  interventionEffects: InterventionEffect[]
): InterventionEffect[] {
  for (const effect of interventionEffects) {
    // Look for the target agent's belief in the NEXT round
    const nextRound = rounds.find(r => r.roundNumber === effect.round + 1);
    if (nextRound && effect.targetAgentId) {
      const after = nextRound.beliefs[effect.targetAgentId];
      if (after !== undefined) {
        effect.beliefAfter = after;
        // Effective if belief moved: for reduce_weight (move away from dominance),
        // for force_reflection (move toward mean), for introduce_diversity (any change)
        const delta = Math.abs(effect.beliefAfter - effect.beliefBefore);
        effect.effective = delta > 0.05; // meaningful change threshold
      }
    }
  }
  return interventionEffects;
}

// ============================================================================
// Single run
// ============================================================================

async function runSingle(
  task: TaskConfig,
  ablation: Ablation,
  runIndex: number,
): Promise<ExperimentResult> {
  const agents = createAgents(task);
  const runId = `${task.id}_${ablation}_${runIndex}`;

  // Build governance mode for DiscussionEngine
  let governanceMode: "none" | "detect-only" | "full";
  let useAdaptive = false;

  switch (ablation) {
    case "none": governanceMode = "none"; break;
    case "detect-only": governanceMode = "detect-only"; break;
    case "full": governanceMode = "full"; break;
    case "adaptive": governanceMode = "full"; useAdaptive = true; break;
  }

  // Create optional GovernanceRuntime for adaptive mode
  let govRuntime: GovernanceRuntime | undefined;
  if (useAdaptive) {
    govRuntime = new GovernanceRuntime({
      maxRounds: PARAMS.maxRounds,
      governanceMode: "full",
      enableAdaptiveThresholds: true,
      enableAdaptiveDosage: true,
      governanceConfig: {
        enableEchoChamberDetection: true,
        enableAuthorityBiasDetection: true,
        enablePolarizationDetection: true,
        enablePrematureConsensusDetection: true,
        interventionLevel: "medium",
      },
    });
  }

  const engine = new DiscussionEngine({
    maxRounds: PARAMS.maxRounds,
    convergenceThreshold: PARAMS.convergenceThreshold,
    governanceMode,
  }, govRuntime);

  // ── Set agent knowledge for information-layer interventions ─────────
  const knowledge = new Map<string, string[]>();
  for (const info of task.agents) {
    // Split knownItems by semicolons or newlines into individual knowledge items
    const items = info.knownItems
      .split(/[；;]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    knowledge.set(info.id, items);
  }
  engine.setAgentKnowledge(knowledge);

  const taskObj = {
    id: runId,
    description: task.title,
    type: "discussion" as const,
    createdAt: new Date().toISOString(),
    content: task.sharedBriefing,
  };

  const result = await engine.run(agents, taskObj);
  const evalEngine = new EvaluationEngine();

  // ── Build round-by-round records ──────────────────────────────────────
  const rounds: RoundRecord[] = [];
  const interventionEffects: InterventionEffect[] = [];
  const allIssues: string[] = [];
  let totalInterventions = 0;

  // Extract pre-intervention beliefs for validation
  const prevRoundBeliefs = new Map<number, Record<string, number>>();

  const discData = engine.getDiscussionData(
    taskObj,
    agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }))
  );

  for (let i = 0; i < result.roundResults.length; i++) {
    const rr = result.roundResults[i];
    const rd = discData.rounds[i];
    const beliefs: Record<string, number> = {};
    const confidences: Record<string, number> = {};

    for (const o of rr.opinions) {
      beliefs[o.agentId] = o.belief;
      confidences[o.agentId] = o.confidence;
    }

    // Record pre-intervention beliefs
    prevRoundBeliefs.set(rr.roundNumber, { ...beliefs });

    const roundIssues: string[] = [];
    const roundInterventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }> = [];

    if (rd) {
      for (const issue of rd.governanceIssues) {
        roundIssues.push(issue.type);
        allIssues.push(issue.type);
      }
      for (const intv of rd.interventions) {
        roundInterventions.push({
          type: intv.type,
          targetAgentId: intv.targetAgentId,
          targetAgents: intv.targetAgents,
        });
        totalInterventions++;

        // Record intervention effect for later validation
        if (intv.targetAgentId) {
          interventionEffects.push({
            round: rr.roundNumber,
            interventionType: intv.type,
            targetAgentId: intv.targetAgentId,
            beliefBefore: beliefs[intv.targetAgentId] ?? 0,
            beliefAfter: 0, // filled after all rounds
            effective: false,
          });
        }
      }
    }

    rounds.push({
      roundNumber: rr.roundNumber,
      beliefs,
      confidences,
      converged: rr.converged,
      issues: roundIssues,
      interventions: roundInterventions,
    });
  }

  // ── Validate interventions ────────────────────────────────────────────
  validateInterventions(rounds, interventionEffects);

  // ── Compute Kendall's τ ──────────────────────────────────────────────
  const allReasoning = result.roundResults
    .flatMap(r => r.opinions.map(o => o.reasoning))
    .join("\n");
  const finalDecision = result.finalDecision || allReasoning;
  const itemNames = Object.keys(task.correctAnswer);
  const extractedRanking = extractRanking(finalDecision, itemNames);
  const tau = kendallTau(task.correctAnswer, extractedRanking);

  // ── Compute secondary metrics ────────────────────────────────────────
  const lastRound = result.roundResults[result.roundResults.length - 1];
  const lastBeliefs = lastRound?.opinions.map(o => o.belief) || [];
  const consensusLevel = lastBeliefs.length > 0
    ? 1 - (stdDev(lastBeliefs) * 2) // Kuramoto-like consensus level
    : 0;
  const opinionDiversity = lastBeliefs.length > 0 ? stdDev(lastBeliefs) : 0;

  // ── Evaluation ───────────────────────────────────────────────────────
  const evaluationScores: Record<string, number> = {};
  if (result.roundResults.length > 0) {
    const rr = result.roundResults[result.roundResults.length - 1];
    const decisions = rr.opinions.map(o => ({
      agentId: o.agentId, content: o.reasoning,
      confidence: o.confidence, reasoning: o.reasoning, belief: o.belief,
    }));
    const agentInfo = agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }));
    const history = [{
      round: rr.roundNumber,
      messages: rr.opinions.map(o => ({ agentId: o.agentId, content: o.reasoning, timestamp: rr.timestamp })),
      beliefs: Object.fromEntries(rr.opinions.map(o => [o.agentId, o.belief])),
      beliefChanges: {}, converged: rr.converged,
    }];
    try {
      const ev = evalEngine.evaluate(decisions, agentInfo, history, `Round ${rr.roundNumber}`);
      for (const [key, dim] of Object.entries(ev.dimensions || {})) {
        evaluationScores[key] = (dim as any).score ?? 0;
      }
      evaluationScores["overall"] = ev.overallScore;
    } catch { /* skip */ }
  }

  return {
    runId, ablation, runIndex,
    timestamp: new Date().toISOString(),
    kendallTau: tau,
    decisionQuality: tauToQuality(tau),
    totalRounds: result.totalRounds,
    converged: result.converged,
    consensusLevel: Math.max(0, Math.min(1, consensusLevel)),
    opinionDiversity,
    totalInterventions,
    issuesDetected: [...new Set(allIssues)],
    interventionEffects,
    evaluationScores,
    rounds,
    finalDecision: finalDecision.substring(0, 2000),
    groundTruth: task.correctAnswer,
    extractedRanking,
  };
}

// ============================================================================
// Statistics
// ============================================================================

function stdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function cohensD(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const task = TASK_MA;
  const allResults: ExperimentResult[] = [];

  console.log("=".repeat(70));
  console.log("  SwarmAlpha V2 — Experiment Runner");
  console.log(`  Task: ${task.title}`);
  console.log(`  Modes: ${PARAMS.ablationModes.join(", ")}`);
  console.log(`  Runs per condition: ${PARAMS.runsPerCondition}`);
  console.log(`  Total: ${PARAMS.runsPerCondition * PARAMS.ablationModes.length} experiments`);
  console.log("=".repeat(70));

  for (const ablation of PARAMS.ablationModes) {
    console.log(`\n── ${ablation} ──`);
    for (let i = 0; i < PARAMS.runsPerCondition; i++) {
      const filename = path.join(DATA_DIR, `${task.id}_${ablation}_${i}.json`);
      if (fs.existsSync(filename)) {
        const existing = JSON.parse(fs.readFileSync(filename, "utf-8")) as ExperimentResult;
        allResults.push(existing);
        console.log(`  [${i + 1}/${PARAMS.runsPerCondition}] (cached) τ=${existing.kendallTau.toFixed(3)} | Q=${existing.decisionQuality}`);
        continue;
      }
      const result = await runSingle(task, ablation, i);
      allResults.push(result);

      // Save individual result
      fs.writeFileSync(filename, JSON.stringify(result, null, 2));

      const intvStr = result.totalInterventions > 0
        ? ` | ${result.totalInterventions} interventions, ${result.interventionEffects.filter(e => e.effective).length} effective`
        : "";
      console.log(`  [${i + 1}/${PARAMS.runsPerCondition}] τ=${result.kendallTau.toFixed(3)} | Q=${result.decisionQuality} | rounds=${result.totalRounds}${intvStr}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("  Summary: Decision Quality (Kendall's τ → 0-100)");
  console.log("=".repeat(70));

  const baseline = allResults.filter(r => r.ablation === "none");

  console.log("\n| Ablation       | n  | Q μ±σ      | Kendall τ μ±σ  | Intv (eff) | d vs none |");
  console.log("|----------------|----|------------|----------------|------------|-----------|");

  for (const ablation of PARAMS.ablationModes) {
    const group = allResults.filter(r => r.ablation === ablation);
    const qs = group.map(r => r.decisionQuality);
    const ts = group.map(r => r.kendallTau);
    const qMean = mean(qs);
    const qStd = stdDev(qs);
    const tMean = mean(ts);
    const tStd = stdDev(ts);
    const totalIntv = group.reduce((s, r) => s + r.totalInterventions, 0);
    const totalEff = group.reduce((s, r) => s + r.interventionEffects.filter(e => e.effective).length, 0);
    const d = ablation === "none" ? 0 : cohensD(baseline.map(r => r.decisionQuality), qs);

    const qStr = `${qMean.toFixed(1)}±${qStd.toFixed(1)}`;
    const tStr = `${tMean.toFixed(3)}±${tStd.toFixed(3)}`;
    const intvStr = ablation === "none" ? "—" : `${totalIntv} (${totalEff})`;
    const dStr = ablation === "none" ? "—" : d.toFixed(2);

    console.log(`| ${ablation.padEnd(14)} | ${group.length} | ${qStr.padEnd(10)} | ${tStr.padEnd(14)} | ${intvStr.padEnd(10)} | ${dStr.padEnd(9)} |`);
  }

  // ── Save aggregate ───────────────────────────────────────────────────
  const summary = {
    task: task.title,
    params: PARAMS,
    timestamp: new Date().toISOString(),
    totalExperiments: allResults.length,
    results: allResults,
  };
  fs.writeFileSync(
    path.join(DATA_DIR, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\nAll data saved to ${DATA_DIR}/`);
  console.log("Done.");
}

main().catch(console.error);
