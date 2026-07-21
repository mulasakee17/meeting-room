/**
 * 发言质量因子验证脚本
 *
 * 目标：验证四层质量因子是否能区分恶意 agent 与诚实 agent。
 * 数据：E/F/G 组恶意 agent 实验数据（governanceTrace 含每轮信念变化+干预记录）。
 *
 * 数据约束说明：
 *   - governanceTrace 有每轮 beliefChanges（old→new），但无 per-utterance 粒度
 *   - 无 referencedAgents / itemBeliefs / infoKeywords
 *   - 因此 4 层方案中：citation（引用层）不可用，其余 3 层可近似计算
 *
 * 三层近似实现：
 *   1. credibility（历史信用）：累计干预次数 / 总轮次 → 负信号
 *   2. informed_alignment（信息锚定方向）：agent 信念变化方向 vs 诚实群体方向
 *      近似：诚实 agent = 非 maliciousAgentIds 的 agent
 *   3. counterfactual（反事实 DeGroot）：简化版 DeGroot 一步，模拟"没发言"的信念
 *
 * 核心验证问题：
 *   - 恶意 agent 的质量分是否显著低于诚实 agent？
 *   - 如果恶意 agent 被治理后信念被纠正，质量分是否反映这一点？
 *   - G 组共谋时，两个恶意 agent 是否同时被识别？
 *
 * 用法：npx tsx experiments/v2/quality_factor_validation.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// 类型定义
// ============================================================================

interface BeliefChange {
  old: number;
  new: number;
  reason: string;
}

interface Intervention {
  type: string;
  targetAgentId?: string;
  targetAgents?: string[];
  effect: string;
  applied: boolean;
}

interface GovernanceIssue {
  type: string;
  severity: string;
  description: string;
  agents?: string[];
}

interface GovernanceTraceEntry {
  roundNumber: number;
  timestamp: string;
  governanceIssues: GovernanceIssue[];
  interventions: Intervention[];
  beliefChanges: Record<string, BeliefChange>;
  converged: boolean;
}

interface ThermoSnapshot {
  R: number;
  T: number;
  H: number;
  F: number;
  utteranceCount: number;
  evalIndex: number;
}

interface MaliciousExperiment {
  runId: string;
  group: "E" | "F" | "G";
  runIndex: number;
  kendallTau: number;
  totalRounds: number;
  totalUtterances: number;
  finalBeliefs: Record<string, number>;
  maliciousAgentIds: string[];
  attackScenario: "single" | "collusion";
  governanceEnabled: boolean;
  governanceTrace: GovernanceTraceEntry[];
  thermoHistory: ThermoSnapshot[];
}

interface AgentQualityScore {
  agentId: string;
  isMalicious: boolean;
  /** 第 1 层：历史信用（越高越好，被干预少+被纠正少） */
  credibility: number;
  /** 第 2 层：信息锚定方向（越高越好，信念变化与诚实群体一致） */
  informedAlignment: number;
  /** 第 3 层：反事实贡献（越高越好，发言让群体更接近诚实方向） */
  counterfactual: number;
  /** 综合质量分 */
  composite: number;
  /** 各轮质量分轨迹 */
  trajectory: number[];
  /** 被干预次数 */
  interventionCount: number;
  /** 信念变化次数 */
  beliefChangeCount: number;
}

interface RunQualityReport {
  runId: string;
  group: string;
  kendallTau: number;
  maliciousAgents: string[];
  scores: AgentQualityScore[];
}

// ============================================================================
// 常量
// ============================================================================

const DGROOT_LEARNING_RATE = 0.15; // 与 src/lib/discussion/asyncEngine.ts 一致
const ALL_AGENTS = ["a1", "a2", "a3", "a4", "a5"];

// ============================================================================
// 数据加载
// ============================================================================

const DATA_DIR = path.resolve(__dirname, "data_fraud_malicious");

function loadData(): MaliciousExperiment[] {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`数据目录不存在: ${DATA_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith(".json") && (f.includes("_E_") || f.includes("_F_") || f.includes("_G_")));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8")) as MaliciousExperiment;
    } catch {
      return null;
    }
  }).filter((r): r is MaliciousExperiment => r !== null && r.governanceTrace && r.governanceTrace.length > 0);
}

// ============================================================================
// 统计工具
// ============================================================================

function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

function stdDev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// 核心计算：per-agent per-run 质量因子
// ============================================================================

function computeQualityForRun(exp: MaliciousExperiment): AgentQualityScore[] {
  const trace = exp.governanceTrace;
  const maliciousIds = exp.maliciousAgentIds;
  const honestIds = ALL_AGENTS.filter(id => !maliciousIds.includes(id));

  // 初始化每个 agent 的累积状态
  const agentStates: Record<string, {
    interventionCount: number;
    beliefTrajectory: number[];          // 每轮后的信念
    alignmentScores: number[];           // 每轮的对齐分数
    counterfactualScores: number[];      // 每轮的反事实分数
    roundsWithChange: number;            // 有信念变化的轮次
  }> = {};
  for (const id of ALL_AGENTS) {
    agentStates[id] = {
      interventionCount: 0,
      beliefTrajectory: [],
      alignmentScores: [],
      counterfactualScores: [],
      roundsWithChange: 0,
    };
  }

  // 逐轮计算
  for (let r = 0; r < trace.length; r++) {
    const round = trace[r];
    const changes = round.beliefChanges;

    // 统计干预
    for (const intv of round.interventions) {
      if (intv.targetAgentId && agentStates[intv.targetAgentId]) {
        agentStates[intv.targetAgentId].interventionCount++;
      }
      if (intv.targetAgents) {
        for (const id of intv.targetAgents) {
          if (agentStates[id]) agentStates[id].interventionCount++;
        }
      }
    }

    // 收集本轮信念
    const roundBeliefs: Record<string, number> = {};
    for (const id of ALL_AGENTS) {
      if (changes[id]) {
        roundBeliefs[id] = changes[id].new;
        // 检测信念变化（> 0.01 才算有意义的变化）
        if (Math.abs(changes[id].new - changes[id].old) > 0.01) {
          agentStates[id].roundsWithChange++;
        }
      } else {
        // 无变化记录 → 沿用上一轮信念
        const prev = agentStates[id].beliefTrajectory[agentStates[id].beliefTrajectory.length - 1];
        roundBeliefs[id] = prev ?? 0;
      }
    }

    // 记录信念轨迹
    for (const id of ALL_AGENTS) {
      agentStates[id].beliefTrajectory.push(roundBeliefs[id] ?? 0);
    }

    // 计算诚实群体方向（锚定）
    const honestBeliefs = honestIds.map(id => roundBeliefs[id] ?? 0).filter(b => !isNaN(b));
    const honestMean = honestBeliefs.length > 0 ? mean(honestBeliefs) : 0;

    // === 第 2 层：信息锚定对齐 ===
    // agent 信念 vs 诚实群体均值 → 越接近越好
    for (const id of ALL_AGENTS) {
      const belief = roundBeliefs[id] ?? 0;
      const deviation = Math.abs(belief - honestMean);
      // 归一化：deviation ∈ [0, 2]，对齐度 ∈ [1, 0]
      const alignment = clamp(1 - deviation / 2, 0, 1);
      agentStates[id].alignmentScores.push(alignment);
    }

    // === 第 3 层：反事实 DeGroot ===
    // 简化：假设没有 agent i 的发言，群体信念向诚实均值回归一步
    // 如果 agent i 的信念比"反事实"更接近诚实均值 → 发言有正面贡献
    for (const id of ALL_AGENTS) {
      const belief = roundBeliefs[id] ?? 0;
      // 反事实：如果没有 agent i，信念 = 上一轮信念 + DeGroot 向诚实均值回归
      const prevBelief = r > 0
        ? (agentStates[id].beliefTrajectory[r - 1] ?? 0)
        : belief;
      const counterfactualBelief = prevBelief + DGROOT_LEARNING_RATE * (honestMean - prevBelief);

      // 实际 vs 反事实：哪个更接近诚实均值？
      const actualDist = Math.abs(belief - honestMean);
      const cfDist = Math.abs(counterfactualBelief - honestMean);
      const contribution = cfDist - actualDist; // 正 = 发言让信念更接近诚实方向

      // 归一化到 [0, 1]
      const cfScore = clamp((contribution + 1) / 2, 0, 1);
      agentStates[id].counterfactualScores.push(cfScore);
    }
  }

  // === 汇总 ===
  const totalRounds = trace.length;
  const scores: AgentQualityScore[] = [];

  for (const id of ALL_AGENTS) {
    const state = agentStates[id];

    // 第 1 层：历史信用
    // 被干预越多 → 信用越低
    const interventionRate = totalRounds > 0
      ? state.interventionCount / totalRounds
      : 0;
    const credibility = clamp(1 - interventionRate * 2, 0, 1);

    // 第 2 层：信息锚定对齐（平均）
    const informedAlignment = state.alignmentScores.length > 0
      ? mean(state.alignmentScores)
      : 0.5;

    // 第 3 层：反事实贡献（平均）
    const counterfactual = state.counterfactualScores.length > 0
      ? mean(state.counterfactualScores)
      : 0.5;

    // 综合质量分
    const composite = 0.25 * credibility + 0.35 * informedAlignment + 0.20 * counterfactual;
    // 注意：citation 层不可用，将其 0.20 权重均匀分配给其他层
    const compositeAdjusted = 0.30 * credibility + 0.45 * informedAlignment + 0.25 * counterfactual;

    // 各轮质量分轨迹
    const trajectory: number[] = [];
    for (let r = 0; r < totalRounds; r++) {
      const roundCred = credibility; // 同一轮内信用不变
      const roundAlign = state.alignmentScores[r] ?? 0.5;
      const roundCF = state.counterfactualScores[r] ?? 0.5;
      trajectory.push(0.30 * roundCred + 0.45 * roundAlign + 0.25 * roundCF);
    }

    scores.push({
      agentId: id,
      isMalicious: maliciousIds.includes(id),
      credibility,
      informedAlignment,
      counterfactual,
      composite,
      trajectory,
      interventionCount: state.interventionCount,
      beliefChangeCount: state.roundsWithChange,
    });
  }

  return scores;
}

// ============================================================================
// 输出报告
// ============================================================================

function printHeader(title: string): void {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(80)}`);
}

function printSeparator(): void {
  console.log("-".repeat(80));
}

function analyzeGroup(
  label: string,
  experiments: MaliciousExperiment[]
): RunQualityReport[] {
  const reports: RunQualityReport[] = [];

  for (const exp of experiments) {
    const scores = computeQualityForRun(exp);
    reports.push({
      runId: exp.runId,
      group: exp.group,
      kendallTau: exp.kendallTau,
      maliciousAgents: exp.maliciousAgentIds,
      scores,
    });
  }

  return reports;
}

function printRunReport(report: RunQualityReport): void {
  console.log(`\n[${report.runId}]  τ=${report.kendallTau.toFixed(3)}  恶意: [${report.maliciousAgents.join(", ")}]`);
  printSeparator();
  console.log("Agent | 恶意 | 信用 | 对齐 | 反事实 | 综合 | 被干预 | 信念变化");
  printSeparator();

  for (const s of report.scores) {
    const tag = s.isMalicious ? "⚠️" : "✓";
    console.log(
      `${s.agentId.padEnd(5)} | ${tag.padEnd(4)} | ` +
      `${s.credibility.toFixed(3).padStart(5)} | ` +
      `${s.informedAlignment.toFixed(3).padStart(5)} | ` +
      `${s.counterfactual.toFixed(3).padStart(6)} | ` +
      `${s.composite.toFixed(3).padStart(5)} | ` +
      `${String(s.interventionCount).padStart(6)} | ` +
      `${String(s.beliefChangeCount).padStart(8)}`
    );
  }
}

function printSummary(label: string, reports: RunQualityReport[]): void {
  console.log(`\n${"─".repeat(80)}`);
  console.log(`  ${label} 汇总 (n=${reports.length})`);
  console.log("─".repeat(80));

  // 按 agent 聚合
  const agentSummaries: Record<string, {
    isMalicious: boolean;
    composites: number[];
    credibilities: number[];
    alignments: number[];
    counterfactuals: number[];
    interventionCounts: number[];
  }> = {};

  for (const id of ALL_AGENTS) {
    agentSummaries[id] = {
      isMalicious: false,
      composites: [],
      credibilities: [],
      alignments: [],
      counterfactuals: [],
      interventionCounts: [],
    };
  }

  for (const report of reports) {
    for (const s of report.scores) {
      agentSummaries[s.agentId].isMalicious = s.isMalicious;
      agentSummaries[s.agentId].composites.push(s.composite);
      agentSummaries[s.agentId].credibilities.push(s.credibility);
      agentSummaries[s.agentId].alignments.push(s.informedAlignment);
      agentSummaries[s.agentId].counterfactuals.push(s.counterfactual);
      agentSummaries[s.agentId].interventionCounts.push(s.interventionCount);
    }
  }

  console.log("\nAgent | 恶意 | 综合 μ±σ | 信用 μ±σ | 对齐 μ±σ | 反事实 μ±σ | 平均干预");
  printSeparator();

  for (const id of ALL_AGENTS) {
    const sum = agentSummaries[id];
    const tag = sum.isMalicious ? "⚠️" : "✓";
    console.log(
      `${id.padEnd(5)} | ${tag.padEnd(4)} | ` +
      `${mean(sum.composites).toFixed(3)}±${stdDev(sum.composites).toFixed(3)} | ` +
      `${mean(sum.credibilities).toFixed(3)}±${stdDev(sum.credibilities).toFixed(3)} | ` +
      `${mean(sum.alignments).toFixed(3)}±${stdDev(sum.alignments).toFixed(3)} | ` +
      `${mean(sum.counterfactuals).toFixed(3)}±${stdDev(sum.counterfactuals).toFixed(3)} | ` +
      `${mean(sum.interventionCounts).toFixed(1)}`
    );
  }

  // 恶意 vs 诚实对比
  const maliciousComposites = ALL_AGENTS
    .filter(id => agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].composites);
  const honestComposites = ALL_AGENTS
    .filter(id => !agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].composites);

  if (maliciousComposites.length > 0 && honestComposites.length > 0) {
    const malMean = mean(maliciousComposites);
    const honMean = mean(honestComposites);
    const malStd = stdDev(maliciousComposites);
    const honStd = stdDev(honestComposites);
    const diff = honMean - malMean;

    // 简单 t 检验（非配对，Welch 近似）
    const se = Math.sqrt(malStd ** 2 / maliciousComposites.length + honStd ** 2 / honestComposites.length);
    const t = se > 0 ? diff / se : 0;

    console.log(`\n恶意 agent 综合分: ${malMean.toFixed(3)}±${malStd.toFixed(3)}  (n=${maliciousComposites.length})`);
    console.log(`诚实 agent 综合分: ${honMean.toFixed(3)}±${honStd.toFixed(3)}  (n=${honestComposites.length})`);
    console.log(`差异 (诚实-恶意): ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);
    console.log(`效应量 (t 近似): ${t.toFixed(2)}`);

    if (diff > 0.1) {
      console.log(`✅ 质量因子能区分恶意 vs 诚实 agent（诚实分更高）`);
    } else if (diff > 0.03) {
      console.log(`🟡 微弱区分，信号存在但不够强`);
    } else {
      console.log(`❌ 质量因子无法区分恶意 vs 诚实 agent`);
    }
  }

  // 与被治理组（E）的比较：无治理组（F）的恶意 agent 是否更难识别？
  // 在 F 组中，恶意 agent 不会被干预，credibility 层不会提供信号
  // 但仍可通过 alignment 和 counterfactual 层识别
}

// ============================================================================
// 轨迹分析：恶意 agent 质量分随时间变化
// ============================================================================

function printTrajectoryAnalysis(label: string, reports: RunQualityReport[]): void {
  console.log(`\n${"─".repeat(80)}`);
  console.log(`  ${label} — 恶意 agent 质量分轨迹（按轮次）`);
  console.log("─".repeat(80));

  // 收集所有恶意 agent 的轨迹
  const maxRounds = Math.max(...reports.flatMap(r => r.scores.map(s => s.trajectory.length)));

  const maliciousTrajs: number[][] = [];
  const honestTrajs: number[][] = [];

  for (const report of reports) {
    for (const s of report.scores) {
      if (s.isMalicious) {
        maliciousTrajs.push(s.trajectory);
      } else {
        honestTrajs.push(s.trajectory);
      }
    }
  }

  console.log("\n轮次 | 恶意 avg | 恶意 min | 恶意 max | 诚实 avg | 诚实 min | 诚实 max");
  printSeparator();

  for (let r = 0; r < maxRounds; r++) {
    const malVals = maliciousTrajs.map(t => t[r] ?? NaN).filter(v => !isNaN(v));
    const honVals = honestTrajs.map(t => t[r] ?? NaN).filter(v => !isNaN(v));

    if (malVals.length === 0 && honVals.length === 0) continue;

    const malAvg = malVals.length > 0 ? mean(malVals) : NaN;
    const malMin = malVals.length > 0 ? Math.min(...malVals) : NaN;
    const malMax = malVals.length > 0 ? Math.max(...malVals) : NaN;
    const honAvg = honVals.length > 0 ? mean(honVals) : NaN;
    const honMin = honVals.length > 0 ? Math.min(...honVals) : NaN;
    const honMax = honVals.length > 0 ? Math.max(...honVals) : NaN;

    const malStr = !isNaN(malAvg) ? `${malAvg.toFixed(3)} ${malMin.toFixed(3)} ${malMax.toFixed(3)}` : "—";
    const honStr = !isNaN(honAvg) ? `${honAvg.toFixed(3)} ${honMin.toFixed(3)} ${honMax.toFixed(3)}` : "—";

    console.log(`  R${String(r + 1).padStart(2)}  | ${malStr.padEnd(20)} | ${honStr.padEnd(20)}`);
  }
}

// ============================================================================
// 主函数
// ============================================================================

function main(): void {
  printHeader("发言质量因子验证 — 恶意 vs 诚实 agent 区分度测试");

  const data = loadData();
  const groups = {
    E: data.filter(d => d.group === "E"),
    F: data.filter(d => d.group === "F"),
    G: data.filter(d => d.group === "G"),
  };

  console.log(`\n数据加载: E=${groups.E.length}, F=${groups.F.length}, G=${groups.G.length}`);
  console.log(`E 组: 单点恶意 + 治理开 (${groups.E.length > 0 ? groups.E[0].maliciousAgentIds.join(",") : "N/A"})`);
  console.log(`F 组: 单点恶意 + 治理关 (${groups.F.length > 0 ? groups.F[0].maliciousAgentIds.join(",") : "N/A"})`);
  console.log(`G 组: 共谋恶意 + 治理开 (${groups.G.length > 0 ? groups.G[0].maliciousAgentIds.join(",") : "N/A"})`);

  console.log("\n⚠️ 数据约束：");
  console.log("  - 无 referencedAgents → citation（引用层）不可用");
  console.log("  - 无 itemBeliefs / infoKeywords → 信息锚定用诚实 agent 均值近似");
  console.log("  - governanceTrace 为 per-round 粒度，非 per-utterance");
  console.log("  - 质量因子权重：信用 0.30 + 对齐 0.45 + 反事实 0.25");

  // ===== 逐组分析 =====
  for (const [group, experiments] of Object.entries(groups)) {
    if (experiments.length === 0) continue;

    const reports = analyzeGroup(group, experiments);

    printHeader(`${group} 组 (${experiments[0].attackScenario === "single" ? "单点" : "共谋"}攻击, 治理${experiments[0].governanceEnabled ? "开" : "关"})`);

    // 打印前 3 个 run 的详细报告
    for (const report of reports.slice(0, 3)) {
      printRunReport(report);
    }
    if (reports.length > 3) {
      console.log(`\n  ... 共 ${reports.length} 个 run，仅显示前 3 个`);
    }

    // 汇总
    printSummary(`${group} 组`, reports);

    // 轨迹分析
    printTrajectoryAnalysis(`${group} 组`, reports);
  }

  // ===== 跨组对比 =====
  printHeader("跨组对比：恶意 agent 质量分");

  console.log("\n组别 | 恶意 agent | 综合分 | 信用分 | 对齐分 | 反事实分 | 平均干预");
  printSeparator();

  for (const [group, experiments] of Object.entries(groups)) {
    if (experiments.length === 0) continue;
    const reports = analyzeGroup(group, experiments);

    const malScores = reports.flatMap(r => r.scores.filter(s => s.isMalicious));
    const honScores = reports.flatMap(r => r.scores.filter(s => !s.isMalicious));

    const malComp = mean(malScores.map(s => s.composite));
    const honComp = mean(honScores.map(s => s.composite));
    const malCred = mean(malScores.map(s => s.credibility));
    const malAlign = mean(malScores.map(s => s.informedAlignment));
    const malCF = mean(malScores.map(s => s.counterfactual));
    const malIntv = mean(malScores.map(s => s.interventionCount));

    const diff = honComp - malComp;

    console.log(
      `${group.padEnd(5)} | ${experiments[0].maliciousAgentIds.join(",").padEnd(10)} | ` +
      `${malComp.toFixed(3)} (vs ${honComp.toFixed(3)}诚) | ` +
      `${malCred.toFixed(3)} | ${malAlign.toFixed(3)} | ${malCF.toFixed(3)} | ${malIntv.toFixed(1)}`
    );
    console.log(`      差异(诚-恶): ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);
  }

  // ===== 分层贡献分析 =====
  printHeader("分层贡献分析：哪一层贡献最大？");

  console.log("\n组别 | 恶意 vs 诚实信用差 | 恶意 vs 诚实对齐差 | 恶意 vs 诚实反事实差");
  printSeparator();

  for (const [group, experiments] of Object.entries(groups)) {
    if (experiments.length === 0) continue;
    const reports = analyzeGroup(group, experiments);

    const malScores = reports.flatMap(r => r.scores.filter(s => s.isMalicious));
    const honScores = reports.flatMap(r => r.scores.filter(s => !s.isMalicious));

    const credDiff = mean(honScores.map(s => s.credibility)) - mean(malScores.map(s => s.credibility));
    const alignDiff = mean(honScores.map(s => s.informedAlignment)) - mean(malScores.map(s => s.informedAlignment));
    const cfDiff = mean(honScores.map(s => s.counterfactual)) - mean(malScores.map(s => s.counterfactual));

    console.log(
      `${group.padEnd(5)} | ${credDiff >= 0 ? "+" : ""}${credDiff.toFixed(3).padStart(18)} | ` +
      `${alignDiff >= 0 ? "+" : ""}${alignDiff.toFixed(3).padStart(18)} | ` +
      `${cfDiff >= 0 ? "+" : ""}${cfDiff.toFixed(3).padStart(18)}`
    );
  }

  // ===== 最终结论 =====
  printHeader("最终结论");

  const allReports = Object.values(groups).flat().length > 0
    ? analyzeGroup("all", Object.values(groups).flat())
    : [];

  if (allReports.length > 0) {
    const malScores = allReports.flatMap(r => r.scores.filter(s => s.isMalicious));
    const honScores = allReports.flatMap(r => r.scores.filter(s => !s.isMalicious));
    const malComp = mean(malScores.map(s => s.composite));
    const honComp = mean(honScores.map(s => s.composite));
    const diff = honComp - malComp;

    console.log(`\n全部数据 (n=${allReports.length} runs):`);
    console.log(`  恶意 agent 综合质量分: ${malComp.toFixed(3)} (n=${malScores.length})`);
    console.log(`  诚实 agent 综合质量分: ${honComp.toFixed(3)} (n=${honScores.length})`);
    console.log(`  差异 (诚实-恶意): ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);

    if (diff > 0.08) {
      console.log(`\n  ✅ 质量因子能有效区分恶意 vs 诚实 agent`);
      console.log(`     建议：可将 quality_factor 融入发言意愿公式，权重 0.3-0.4`);
      console.log(`     注意：当前仅用 governanceTrace 数据（无 per-utterance 粒度），`);
      console.log(`           实际生产应使用 utterance 级别的信念变化和引用数据`);
    } else if (diff > 0.03) {
      console.log(`\n  🟡 区分信号弱，建议改进后再测试`);
      console.log(`     可能原因：`);
      console.log(`       - governanceTrace 为 per-round 粒度，无法隔离单次发言效果`);
      console.log(`       - 无 referencedAgents 数据，引用层缺失`);
      console.log(`       - 治理组（E/G）的干预可能纠正了恶意 agent 信念，缩小了差异`);
    } else {
      console.log(`\n  ❌ 质量因子无法区分恶意 vs 诚实 agent`);
      console.log(`     可能原因：`);
      console.log(`       - 治理组（E/G）的 reduce_weight 干预成功纠正了恶意 agent`);
      console.log(`       - 信念变化在 per-round 粒度下，恶意 agent 的对齐度与诚实 agent 相近`);
      console.log(`       - 需要 per-utterance 粒度的引用网络和信念变化数据`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("  注：此脚本不修改任何实验数据，仅基于 governanceTrace 做离线分析。");
  console.log("  数据粒度限制：round 级而非 utterance 级，引用网络不可用。");
  console.log("=".repeat(80));
}

main();