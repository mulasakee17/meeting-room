/**
 * 5维质量评估后处理脚本（零成本：对已有 E/F/G 组数据做增强分析）
 *
 * 核心思路：
 * - 不重跑实验，直接读取已有 JSON 的 roundResults
 * - 构造 EvaluationEngine 输入（AgentDecision / AgentInfo / InteractionRound / GroundTruth）
 * - 调用 evaluate() 获取 5 维评分：consensus / reliability / dispersion / stability / influenceAnalysis
 * - 对比 E vs F 的 5 维差异，看治理是否在 τ 之外的维度有效果
 *
 * LLM 纠正策略：
 * - 检查 opinions 中 belief 缺失/NaN 的比例
 * - 如果 belief 异常，用 reasoning 文本回退（belief=0, confidence=50）
 * - 不额外调用 LLM（已有数据足够），但记录异常率
 *
 * 用法：npx tsx experiments/v2/analyze_enhanced_evaluation.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { EvaluationEngine } from "../../src/lib/evaluation";
import type {
  AgentDecision,
  AgentInfo,
  InteractionRound,
  GroundTruth,
} from "../../src/lib/evaluation/types";
import { mulberry32, cohensD, mean, std, type ExperimentResult } from "./statsShared";

dotenv.config({ path: ".env.local" });

// ============================================================================
// 常量
// ============================================================================

const DATA_DIR = path.resolve(__dirname, "data_fraud_malicious");
const PERMUTATION_SEED = 42;

const CORRECT_ANSWER: Record<string, number> = {
  "线索1-关联交易调查": 1,
  "线索2-内幕交易追踪": 2,
  "线索3-审计独立性审查": 3,
  "线索4-行业对标分析": 4,
  "线索5-媒体舆情监测": 5,
};

const FINAL_DECISION_TEXT = Object.entries(CORRECT_ANSWER)
  .sort(([, a], [, b]) => a - b)
  .map(([item, rank]) => `${rank}. ${item}`)
  .join("；");

// ============================================================================
// 类型
// ============================================================================

interface RoundOpinion {
  agentId: string;
  belief: number;
  confidence: number;
  reasoning: string;
  referencedAgents?: string[];
  evidence?: string[];
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>;
}

interface RoundResultSlim {
  roundNumber: number;
  timestamp: string;
  converged: boolean;
  opinions: RoundOpinion[];
}

interface MaliciousExperimentJSON {
  runId: string;
  group: string;
  runIndex: number;
  kendallTau: number;
  decisionQuality: number;
  totalRounds: number;
  totalUtterances: number;
  maliciousAgentIds: string[];
  attackScenario: string;
  governanceEnabled: boolean;
  roundResults: RoundResultSlim[];
  finalBeliefs: Record<string, number>;
}

interface EnhancedEvaluation {
  runId: string;
  group: string;
  kendallTau: number;
  beliefAnomalyRate: number; // belief 缺失/NaN 的比例
  evaluation: {
    overallScore: number;
    grade: string;
    dimensions: {
      consensus: { score: number; kuramotoOrder: number; beliefStd: number; entropy?: number; freeEnergy?: number };
      reliability: { score: number };
      dispersion: { score: number };
      stability: { score: number };
      influenceAnalysis: { score: number; giniCoefficient: number; dominantAgent?: string };
    };
  };
}

// ============================================================================
// 构造 EvaluationEngine 输入
// ============================================================================

function buildEvaluationInput(data: MaliciousExperimentJSON): {
  decisions: AgentDecision[];
  agents: AgentInfo[];
  history: InteractionRound[];
  groundTruth: GroundTruth;
  finalDecision: string;
  anomalyCount: number;
  totalOpinions: number;
} {
  const agentIds = new Set<string>();
  let anomalyCount = 0;
  let totalOpinions = 0;

  // 构造 InteractionRound[]
  const history: InteractionRound[] = data.roundResults.map((r) => {
    const beliefs: Record<string, number> = {};
    const beliefChanges: Record<string, number> = {};

    const messages = r.opinions.map((o) => {
      agentIds.add(o.agentId);
      totalOpinions++;

      // LLM 纠正检查：belief 缺失/NaN
      let belief = o.belief;
      if (belief === undefined || belief === null || Number.isNaN(belief)) {
        anomalyCount++;
        belief = 0; // 回退默认值
      }
      beliefs[o.agentId] = belief;

      return {
        agentId: o.agentId,
        content: o.reasoning || "",
        timestamp: r.timestamp,
        referencedAgents: o.referencedAgents || [],
      };
    });

    return {
      round: r.roundNumber,
      messages,
      beliefs,
      beliefChanges,
      converged: r.converged,
    };
  });

  // 最后一轮作为 decisions
  const lastRound = data.roundResults[data.roundResults.length - 1];
  const decisions: AgentDecision[] = lastRound
    ? lastRound.opinions.map((o) => ({
        agentId: o.agentId,
        content: o.reasoning || "",
        confidence: o.confidence ?? 50,
        reasoning: o.reasoning || "",
        belief: o.belief ?? 0,
      }))
    : [];

  // AgentInfo[]
  const agents: AgentInfo[] = Array.from(agentIds).map((id) => ({
    id,
    name: id,
    role: "Agent",
    type: "default",
  }));

  const groundTruth: GroundTruth = {
    content: FINAL_DECISION_TEXT,
    confidence: 100,
  };

  return {
    decisions,
    agents,
    history,
    groundTruth,
    finalDecision: FINAL_DECISION_TEXT,
    anomalyCount,
    totalOpinions,
  };
}

// ============================================================================
// 读取数据
// ============================================================================

function loadGroupData(group: string): MaliciousExperimentJSON[] {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith(`fraud_${group}_malicious_`) && f.endsWith(".json"))
    .sort();

  const results: MaliciousExperimentJSON[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const data = JSON.parse(raw) as MaliciousExperimentJSON;
      if (data.roundResults && data.roundResults.length > 0) {
        results.push(data);
      }
    } catch {
      // 跳过损坏文件
    }
  }
  return results;
}

// ============================================================================
// 置换检验（与 analyze_malicious.ts 一致）
// ============================================================================

function pairedPermutationTest(
  a: number[],
  b: number[],
  nPerms = 10000
): { pValue: number; effectSize: number; ci95: [number, number] } {
  const n = Math.min(a.length, b.length);
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    diffs.push(a[i] - b[i]);
  }

  const observedMean = mean(diffs);
  const sampleStd = std(diffs);
  const effectSize = sampleStd > 0 ? observedMean / sampleStd : 0; // Cohen's d_z

  // t 分布 95% CI
  const tCritical = 2.776; // df=4, p=0.05 (n=5 时)；动态调整
  const df = n - 1;
  const tCritMap: Record<number, number> = {
    4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
    9: 2.262, 10: 2.228, 14: 2.145, 15: 2.131, 20: 2.086,
  };
  const tCrit = tCritMap[df] || 2.776;
  const se = sampleStd / Math.sqrt(n);
  const ci95: [number, number] = [observedMean - tCrit * se, observedMean + tCrit * se];

  // 置换检验
  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    let permMean = 0;
    for (let i = 0; i < n; i++) {
      permMean += (rng() < 0.5 ? -1 : 1) * diffs[i];
    }
    permMean /= n;
    if (Math.abs(permMean) >= Math.abs(observedMean)) {
      count++;
    }
  }

  const pValue = (count + 1) / (nPerms + 1);
  return { pValue, effectSize, ci95 };
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log("=".repeat(70));
  console.log("  SwarmAlpha 5维质量评估后处理 — E vs F vs G");
  console.log("  零成本：对已有数据做增强分析，不重跑实验");
  console.log("  维度: consensus / reliability / dispersion / stability / influenceAnalysis");
  console.log("=".repeat(70));

  const evalEngine = new EvaluationEngine();

  // 读取三组数据
  const eData = loadGroupData("E");
  const fData = loadGroupData("F");
  const gData = loadGroupData("G");

  console.log(`\n数据加载: E=${eData.length}, F=${fData.length}, G=${gData.length}`);

  if (eData.length === 0 || fData.length === 0) {
    console.error("E 或 F 组数据不足，无法对比");
    process.exit(1);
  }

  // 对每组数据做 5 维评估
  function evaluateGroup(data: MaliciousExperimentJSON[], label: string): EnhancedEvaluation[] {
    console.log(`\n--- ${label} 组 5 维评估 (n=${data.length}) ---`);
    const results: EnhancedEvaluation[] = [];

    for (const exp of data) {
      const input = buildEvaluationInput(exp);
      const evalResult = evalEngine.evaluate(
        input.decisions,
        input.agents,
        input.history,
        input.finalDecision,
        undefined,
        input.groundTruth
      );

      const anomalyRate = input.totalOpinions > 0 ? input.anomalyCount / input.totalOpinions : 0;

      results.push({
        runId: exp.runId,
        group: exp.group,
        kendallTau: exp.kendallTau,
        beliefAnomalyRate: anomalyRate,
        evaluation: {
          overallScore: evalResult.overallScore,
          grade: evalResult.grade,
          dimensions: {
            consensus: {
              score: evalResult.dimensions.consensus.score,
              kuramotoOrder: evalResult.dimensions.consensus.kuramotoOrder,
              beliefStd: evalResult.dimensions.consensus.beliefStd,
              entropy: evalResult.dimensions.consensus.entropy,
              freeEnergy: evalResult.dimensions.consensus.freeEnergy,
            },
            reliability: { score: evalResult.dimensions.reliability.score },
            dispersion: { score: evalResult.dimensions.dispersion.score },
            stability: { score: evalResult.dimensions.stability.score },
            influenceAnalysis: {
              score: evalResult.dimensions.influenceAnalysis.score,
              giniCoefficient: evalResult.dimensions.influenceAnalysis.giniCoefficient,
              dominantAgent: evalResult.dimensions.influenceAnalysis.dominantAgent,
            },
          },
        },
      });
    }

    // 汇总
    const overall = results.map((r) => r.evaluation.overallScore);
    const consensus = results.map((r) => r.evaluation.dimensions.consensus.score);
    const reliability = results.map((r) => r.evaluation.dimensions.reliability.score);
    const dispersion = results.map((r) => r.evaluation.dimensions.dispersion.score);
    const stability = results.map((r) => r.evaluation.dimensions.stability.score);
    const influence = results.map((r) => r.evaluation.dimensions.influenceAnalysis.score);
    const tau = results.map((r) => r.kendallTau);
    const anomaly = results.map((r) => r.beliefAnomalyRate);

    console.log(`  τ:                    ${mean(tau).toFixed(3)} ± ${std(tau).toFixed(3)}`);
    console.log(`  Overall Score:        ${mean(overall).toFixed(1)} ± ${std(overall).toFixed(1)}`);
    console.log(`  Consensus:            ${mean(consensus).toFixed(1)} ± ${std(consensus).toFixed(1)}`);
    console.log(`  Reliability:          ${mean(reliability).toFixed(1)} ± ${std(reliability).toFixed(1)}`);
    console.log(`  Dispersion:           ${mean(dispersion).toFixed(1)} ± ${std(dispersion).toFixed(1)}`);
    console.log(`  Stability:            ${mean(stability).toFixed(1)} ± ${std(stability).toFixed(1)}`);
    console.log(`  InfluenceAnalysis:    ${mean(influence).toFixed(1)} ± ${std(influence).toFixed(1)}`);
    console.log(`  Belief 异常率:         ${mean(anomaly).toFixed(4)} (${(mean(anomaly) * 100).toFixed(1)}%)`);

    return results;
  }

  const eResults = evaluateGroup(eData, "E（单点+治理开）");
  const fResults = evaluateGroup(fData, "F（单点+治理关）");
  const gResults = gData.length > 0 ? evaluateGroup(gData, "G（共谋+治理开）") : [];

  // ============================================================================
  // E vs F 统计对比
  // ============================================================================

  console.log("\n" + "=".repeat(70));
  console.log("  E vs F 5维对比（治理开 vs 关）");
  console.log("=".repeat(70));

  function compareDimension(dim: string, eVals: number[], fVals: number[]) {
    const stat = pairedPermutationTest(eVals, fVals);
    const eMean = mean(eVals);
    const fMean = mean(fVals);
    const delta = eMean - fMean;
    console.log(`\n  ${dim}:`);
    console.log(`    E: ${eMean.toFixed(3)} ± ${std(eVals).toFixed(3)}`);
    console.log(`    F: ${fMean.toFixed(3)} ± ${std(fVals).toFixed(3)}`);
    console.log(`    Δ(E-F): ${delta.toFixed(3)}`);
    console.log(`    Cohen's d_z: ${stat.effectSize.toFixed(3)}`);
    console.log(`    p-value: ${stat.pValue.toFixed(4)} ${stat.pValue < 0.05 ? "✅ 显著" : "❌ 不显著"}`);
    console.log(`    95% CI: [${stat.ci95[0].toFixed(3)}, ${stat.ci95[1].toFixed(3)}]`);
    return { dim, delta, d_z: stat.effectSize, p: stat.pValue, ci95: stat.ci95 };
  }

  const comparisons = [
    compareDimension("τ (Kendall)", eResults.map(r => r.kendallTau), fResults.map(r => r.kendallTau)),
    compareDimension("Overall Score", eResults.map(r => r.evaluation.overallScore), fResults.map(r => r.evaluation.overallScore)),
    compareDimension("Consensus", eResults.map(r => r.evaluation.dimensions.consensus.score), fResults.map(r => r.evaluation.dimensions.consensus.score)),
    compareDimension("Reliability", eResults.map(r => r.evaluation.dimensions.reliability.score), fResults.map(r => r.evaluation.dimensions.reliability.score)),
    compareDimension("Dispersion", eResults.map(r => r.evaluation.dimensions.dispersion.score), fResults.map(r => r.evaluation.dimensions.dispersion.score)),
    compareDimension("Stability", eResults.map(r => r.evaluation.dimensions.stability.score), fResults.map(r => r.evaluation.dimensions.stability.score)),
    compareDimension("InfluenceAnalysis", eResults.map(r => r.evaluation.dimensions.influenceAnalysis.score), fResults.map(r => r.evaluation.dimensions.influenceAnalysis.score)),
  ];

  // ============================================================================
  // E vs G 统计对比（如果有 G 组数据）
  // ============================================================================

  if (gResults.length > 0) {
    console.log("\n" + "=".repeat(70));
    console.log("  E vs G 5维对比（单点 vs 共谋，都治理开）");
    console.log("=".repeat(70));

    const minLen = Math.min(eResults.length, gResults.length);
    const eSubset = eResults.slice(0, minLen);
    const gSubset = gResults.slice(0, minLen);

    function compareDimensionEG(dim: string, eVals: number[], gVals: number[]) {
      const stat = pairedPermutationTest(eVals, gVals);
      const eMean = mean(eVals);
      const gMean = mean(gVals);
      const delta = eMean - gMean;
      console.log(`\n  ${dim}:`);
      console.log(`    E: ${eMean.toFixed(3)} ± ${std(eVals).toFixed(3)}`);
      console.log(`    G: ${gMean.toFixed(3)} ± ${std(gVals).toFixed(3)}`);
      console.log(`    Δ(E-G): ${delta.toFixed(3)}`);
      console.log(`    Cohen's d_z: ${stat.effectSize.toFixed(3)}`);
      console.log(`    p-value: ${stat.pValue.toFixed(4)} ${stat.pValue < 0.05 ? "✅ 显著" : "❌ 不显著"}`);
      console.log(`    95% CI: [${stat.ci95[0].toFixed(3)}, ${stat.ci95[1].toFixed(3)}]`);
    }

    compareDimensionEG("τ (Kendall)", eSubset.map(r => r.kendallTau), gSubset.map(r => r.kendallTau));
    compareDimensionEG("Overall Score", eSubset.map(r => r.evaluation.overallScore), gSubset.map(r => r.evaluation.overallScore));
    compareDimensionEG("Consensus", eSubset.map(r => r.evaluation.dimensions.consensus.score), gSubset.map(r => r.evaluation.dimensions.consensus.score));
    compareDimensionEG("Reliability", eSubset.map(r => r.evaluation.dimensions.reliability.score), gSubset.map(r => r.evaluation.dimensions.reliability.score));
    compareDimensionEG("Stability", eSubset.map(r => r.evaluation.dimensions.stability.score), gSubset.map(r => r.evaluation.dimensions.stability.score));
  }

  // ============================================================================
  // LLM 纠正必要性评估
  // ============================================================================

  console.log("\n" + "=".repeat(70));
  console.log("  LLM 纠正必要性评估");
  console.log("=".repeat(70));

  const eAnomaly = mean(eResults.map(r => r.beliefAnomalyRate));
  const fAnomaly = mean(fResults.map(r => r.beliefAnomalyRate));
  console.log(`\n  E 组 belief 异常率: ${(eAnomaly * 100).toFixed(2)}%`);
  console.log(`  F 组 belief 异常率: ${(fAnomaly * 100).toFixed(2)}%`);
  console.log(`  结论: ${eAnomaly < 0.05 && fAnomaly < 0.05 ? "异常率 <5%，LLM 纠正非必要" : "异常率 ≥5%，建议加 LLM 纠正"}`);

  // ============================================================================
  // 保存完整结果
  // ============================================================================

  const outputPath = path.join(DATA_DIR, "enhanced_evaluation_results.json");
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      E: { n: eResults.length, tau: mean(eResults.map(r => r.kendallTau)), overall: mean(eResults.map(r => r.evaluation.overallScore)) },
      F: { n: fResults.length, tau: mean(fResults.map(r => r.kendallTau)), overall: mean(fResults.map(r => r.evaluation.overallScore)) },
      G: gResults.length > 0 ? { n: gResults.length, tau: mean(gResults.map(r => r.kendallTau)), overall: mean(gResults.map(r => r.evaluation.overallScore)) } : null,
    },
    eVsF: comparisons.map(c => ({ dim: c.dim, delta: c.delta, d_z: c.d_z, p: c.p, ci95: c.ci95 })),
    eResults,
    fResults,
    gResults,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n完整结果已保存: ${outputPath}`);
}

main().catch(console.error);
