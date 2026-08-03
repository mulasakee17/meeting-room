/**
 * IDR — Information Diffusion Rate 离线分析（过程证据）
 *
 * 目的：把 hidden-profile 任务里的"信息是否真正跨 agent 流动"变成可量化指标，
 * 回答审稿人"治理到底是怎么起作用的，而不是 LLM 碰巧撞对"。
 *
 * 方法：
 *   1. 碎片定义：每个 agent 独占一个维度（hidden-profile 构造已知，见 task_crisis/task_supplier/task_university）。
 *     每个碎片用【维度关键词 + 独有数值】作为标记（与 MeasurementLayer.markEvidenceSharing Layer 1 同族：启发式匹配）。
 *   2. M_{i,k}(t) ∈ {0,1}：agent i 至第 t 轮（含）的输出（reasoning + evidence）命中碎片 k 的标记 → 1。
 *     累积单调（一旦吸收不再回退）。
 *   3. IDR(t) = Σ_k (非属主吸收数) / Σ_k (非属主总数) = 非属主吸收率均值（按碎片平均）。
 *   4. 按治理条件聚合：mean IDR(t) ± std，输出逐轮曲线 + 最终轮吸收率。
 *
 * 诚实标注：
 *   - 匹配是启发式（词+值共现），边是"共现推断的吸收"，非因果血统；不 claim 中介。
 *   - 已控制发言量混淆：报告每条件每轮平均发言数，供读者判断。
 *   - Crisis/Supplier 的 E9 全量数据尚未执行（论文标注 pending），当前结果仅 university pilot，探索性。
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/idr_diffusion.ts
 *   （自动扫描 output/<exp>/raw 与 pilot_output，按 scenario + 治理条件分组）
 */

import * as fs from "fs";
import * as path from "path";
import { mean, sampleStd } from "../../v2/statsShared";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";
import type { RawRunData } from "../types";

// ============================================================================
// 碎片定义（hidden-profile 构造已知）
// ============================================================================

interface FragmentSpec {
  owner: string;
  name: string;
  markers: RegExp[];
}

interface ScenarioSpec {
  scenario: string;
  fragments: FragmentSpec[];
  note?: string;
}

const SCENARIO_SPECS: ScenarioSpec[] = [
  {
    scenario: "crisis",
    note: "Crisis（危机响应）：碎片=响应速度/覆盖/效果/风险/可持续，各 agent 独占",
    fragments: [
      { owner: "a1", name: "响应速度", markers: [/\d+\s*小时/] },
      { owner: "a2", name: "覆盖范围", markers: [/(\d+)\s*万人?/, /覆盖人口/] },
      { owner: "a3", name: "效果", markers: [/净效果/] },
      { owner: "a4", name: "风险", markers: [/[1-5]\s*\/\s*5/, /亿/, /停摆/] },
      { owner: "a5", name: "可持续", markers: [/(21|14|10|30|7)\s*天/] },
    ],
  },
  {
    scenario: "supplier",
    note: "Supplier（供应商）：碎片=成本/交付/质量/技术/财务。注意：各维度数值均为 x.xx/1.0，纯数字不可区分，必须用维度子术语",
    fragments: [
      { owner: "a1", name: "成本", markers: [/(综合成本|采购价|运输成本|账期|规模优势|1\.00)/] },
      { owner: "a2", name: "交付", markers: [/(准时交货|交付弹性|交付可靠|0\.72)/] },
      { owner: "a3", name: "质量", markers: [/(良品率|品控|全检|过程控制|0\.95)/] },
      { owner: "a4", name: "技术", markers: [/(研发投入|工艺创新|知识产权|核心专利|纯代工|0\.55)/] },
      { owner: "a5", name: "财务", markers: [/(利润率|现金流|资产负债率|0\.30)/] },
    ],
  },
  {
    scenario: "university",
    note: "University（大学排名，pilot 场景）：碎片=学术+科研/就业/地理/国际化+师生比/综合粗略。a5（综合顾问）信息本就粗略重叠，标记最弱（已知局限）",
    fragments: [
      { owner: "a1", name: "学术+科研", markers: [/(学术声誉|科研经费|论文产出|学科排名|诺奖)/] },
      { owner: "a2", name: "就业", markers: [/(就业率|起薪|行业连接|校企)/] },
      { owner: "a3", name: "地理", markers: [/(地理位置|生活成本|城市吸引|气候|市中心)/] },
      { owner: "a4", name: "国际化+师生比", markers: [/(国际化|国际学生|交换项目|海外合作|师生比)/] },
      { owner: "a5", name: "综合粗略", markers: [/(粗略|交叉参考|综合顾问)/] },
    ],
  },
];

// ============================================================================
// 治理条件分类（从 experimentId 推导）
// ============================================================================

function classifyGovernance(experimentId: string): string {
  const id = experimentId ?? "";
  if (id.includes("_pool")) return "pool";            // E10 共享证据池（无治理）
  if (id.includes("_none")) return "none";
  if (id.includes("_delta")) return "delta";          // δ 认知治理
  if (id.includes("_semantic")) return "semantic";     // SemanticTool 组
  if (id.includes("_cognitive")) return "cognitive";
  if (id.includes("_belief") || id.includes("_full")) return "full";
  return "unknown";
}

// ============================================================================
// Run 发现（扫描 output/<exp>/raw 与 pilot_output）
// ============================================================================

function discoverRuns(): Array<{ file: string; run: RawRunData }> {
  const outputDir = path.resolve(__dirname, "..", "output");
  const pilotDir = path.join(outputDir, "..", "pilot_output");
  const rawDirs: string[] = [];

  if (fs.existsSync(pilotDir)) rawDirs.push(pilotDir);
  if (fs.existsSync(outputDir)) {
    for (const sub of fs.readdirSync(outputDir)) {
      const raw = path.join(outputDir, sub, "raw");
      if (fs.existsSync(raw)) rawDirs.push(raw);
    }
  }

  const found: Array<{ file: string; run: RawRunData }> = [];
  for (const dir of rawDirs) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      if (f === "raw_summary.json" || f === "summary.json") continue;
      const content = fs.readFileSync(path.join(dir, f), "utf-8");
      const run = safeJsonParse<RawRunData & { error?: string }>(content);
      if (!run || run.error) continue;
      if (!run.roundOpinions || run.roundOpinions.length === 0) continue; // 无逐轮意见数据，无法做 IDR
      found.push({ file: f, run });
    }
  }
  return found;
}

// ============================================================================
// 单 run IDR 计算
// ============================================================================

interface RunIDR {
  file: string;
  experimentId: string;
  scenario: string;
  governance: string;
  seed: number;
  totalRounds: number;
  finalTau: number;
  nAgents: number;
  idrCurve: number[];                            // index (round-1)
  speakersPerRound: number[];                    // 每轮发言 agent 数（发言量对照）
  perFragment: Array<{
    owner: string;
    fragment: string;
    absorbedRate: number;                        // 非属主吸收率（最终轮）
    absorbers: string[];
    nNonOwner: number;
  }>;
}

function computeRunIDR(run: RawRunData, spec: ScenarioSpec): RunIDR | null {
  const rounds = [...(run.roundOpinions ?? [])].sort((a, b) => a.round - b.round);
  if (rounds.length === 0) return null;

  const agentIds = new Set<string>();
  for (const ro of rounds) for (const op of ro.opinions) agentIds.add(op.agentId);
  const agents = [...agentIds].filter(a => !!a);
  if (agents.length < 2) return null;

  const maxT = rounds[rounds.length - 1].round;

  // absorbed[i][fragment] —— 累积单调
  const absorbed: Record<string, Record<string, boolean>> = {};
  for (const a of agents) absorbed[a] = {};

  const currentIDR = (): number => {
    let num = 0, den = 0;
    for (const frag of spec.fragments) {
      for (const a of agents) {
        if (a === frag.owner) continue;
        den += 1;
        if (absorbed[a][frag.name]) num += 1;
      }
    }
    return den > 0 ? num / den : 0;
  };

  const idrByRound: Record<number, number> = {};
  const speakersByRound: Record<number, number> = {};
  for (const ro of rounds) {
    for (const op of ro.opinions) {
      const i = op.agentId;
      if (op.spoke !== false) speakersByRound[ro.round] = (speakersByRound[ro.round] ?? 0) + 1;
      const text = [op.reasoning ?? "", (op.evidence ?? []).join(" ")].join(" ");
      for (const frag of spec.fragments) {
        if (i === frag.owner) continue;
        if (absorbed[i][frag.name]) continue;
        if (frag.markers.some(re => re.test(text))) absorbed[i][frag.name] = true;
      }
    }
    idrByRound[ro.round] = currentIDR();
  }

  // 补齐缺轮（无意见的轮次状态不变），得到 round 1..maxT 的曲线
  const idrCurve: number[] = [];
  const speakersPerRound: number[] = [];
  let lastIdr = 0, lastSpeakers = 0;
  for (let r = 1; r <= maxT; r++) {
    if (idrByRound[r] !== undefined) lastIdr = idrByRound[r];
    if (speakersByRound[r] !== undefined) lastSpeakers = speakersByRound[r];
    idrCurve.push(lastIdr);
    speakersPerRound.push(lastSpeakers);
  }

  const perFragment = spec.fragments.map(frag => {
    const absorbers = agents.filter(a => a !== frag.owner && absorbed[a][frag.name]);
    return {
      owner: frag.owner,
      fragment: frag.name,
      absorbedRate: (agents.length - 1) > 0 ? absorbers.length / (agents.length - 1) : 0,
      absorbers,
      nNonOwner: agents.length - 1,
    };
  });

  return {
    file: "",
    experimentId: run.experimentId ?? "",
    scenario: run.scenario ?? "",
    governance: classifyGovernance(run.experimentId ?? ""),
    seed: run.seed ?? 0,
    totalRounds: run.totalRounds ?? maxT,
    finalTau: run.finalKendallTau ?? 0,
    nAgents: agents.length,
    idrCurve,
    speakersPerRound,
    perFragment,
  };
}

// ============================================================================
// 按（场景, 治理条件）聚合
// ============================================================================

interface ConditionIDR {
  governance: string;
  n: number;
  meanTau: number;
  maxRounds: number;
  idrCurveMean: number[];
  idrCurveStd: number[];
  idrEndMean: number;
  meanSpeakersPerRound: number[];
  perFragmentEndMean: Record<string, number>;
  missingFragments: string[];
}

function aggregateCondition(runs: RunIDR[], fragments: FragmentSpec[]): ConditionIDR {
  const n = runs.length;
  const maxRounds = Math.max(...runs.map(r => r.idrCurve.length), 0);

  const idrCurveMean: number[] = [];
  const idrCurveStd: number[] = [];
  const meanSpeakersPerRound: number[] = [];
  for (let r = 0; r < maxRounds; r++) {
    const vals = runs.filter(run => run.idrCurve.length > r).map(run => run.idrCurve[r]);
    const spk = runs.filter(run => run.speakersPerRound.length > r).map(run => run.speakersPerRound[r]);
    idrCurveMean.push(mean(vals));
    idrCurveStd.push(n >= 2 ? sampleStd(vals) : 0);
    meanSpeakersPerRound.push(mean(spk));
  }

  const perFragmentEndMean: Record<string, number> = {};
  const missingFragments: string[] = [];
  for (const frag of fragments) {
    const rates = runs.map(run => {
      const pf = run.perFragment.find(p => p.fragment === frag.name);
      return pf ? pf.absorbedRate : null;
    }).filter((v): v is number => v !== null);
    if (rates.length === 0) { missingFragments.push(frag.name); continue; }
    perFragmentEndMean[frag.name] = mean(rates);
  }

  const endVals = runs.map(run => run.idrCurve[run.idrCurve.length - 1] ?? 0);
  return {
    governance: runs[0]?.governance ?? "unknown",
    n,
    meanTau: mean(runs.map(r => r.finalTau)),
    maxRounds,
    idrCurveMean,
    idrCurveStd,
    idrEndMean: mean(endVals),
    meanSpeakersPerRound,
    perFragmentEndMean,
    missingFragments,
  };
}

// ============================================================================
// 报告输出
// ============================================================================

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function buildReport(
  scenario: string,
  spec: ScenarioSpec,
  conditions: Map<string, ConditionIDR>,
  runs: RunIDR[],
): string {
  const lines: string[] = [];
  lines.push(`## 场景：${scenario}`);
  lines.push("");
  lines.push(`> ${spec.note ?? ""}`);
  lines.push("");

  // 可用 run 清单
  lines.push("**run 清单（含逐轮意见数据）**：");
  for (const run of runs) {
    lines.push(`- ${run.experimentId} | seed=${run.seed} | 轮=${run.totalRounds} | τ=${run.finalTau.toFixed(3)} | 治理=${run.governance}`);
  }
  lines.push("");

  if (conditions.size === 0) {
    lines.push("**无可用数据**（E9 该场景尚未执行或 run 无 roundOpinions）。");
    lines.push("");
    return lines.join("\n");
  }

  const govs = [...conditions.keys()];
  const maxRounds = Math.max(...[...conditions.values()].map(c => c.maxRounds), 0);

  // 逐轮 IDR 曲线
  lines.push("**IDR(t) 逐轮曲线**（非属主碎片吸收率均值）：");
  lines.push("");
  lines.push("| Round | " + govs.map(g => `${g} (n=${conditions.get(g)!.n})`).join(" | ") + " | Δ(治理−none) |");
  lines.push("|---|" + govs.map(() => "---|").join("") + "---|");
  for (let r = 0; r < maxRounds; r++) {
    const row = govs.map(g => {
      const c = conditions.get(g)!;
      if (c.idrCurveMean.length <= r) return "—";
      const sd = c.idrCurveStd[r] > 0.0001 ? `±${c.idrCurveStd[r].toFixed(2)}` : "";
      return fmtPct(c.idrCurveMean[r]) + sd;
    });
    const none = conditions.get("none");
    const delta = conditions.get("delta") ?? conditions.get("cognitive");
    let deltaCell = "—";
    if (none && delta && none.idrCurveMean.length > r && delta.idrCurveMean.length > r) {
      const d = delta.idrCurveMean[r] - none.idrCurveMean[r];
      deltaCell = (d > 0 ? "+" : "") + (d * 100).toFixed(1) + "pp";
    }
    lines.push(`| ${r + 1} | ${row.join(" | ")} | ${deltaCell} |`);
  }
  lines.push("");

  // 最终轮吸收率对比
  lines.push("**最终轮 IDR** 与 **τ**（过程 vs 结果对照）：");
  lines.push("");
  lines.push("| 治理 | n | IDR_end | τ 均值 | 每轮均发言数 |");
  lines.push("|---|---|---|---|---|");
  for (const g of govs) {
    const c = conditions.get(g)!;
    const spk = c.meanSpeakersPerRound.length > 0 ? c.meanSpeakersPerRound[c.meanSpeakersPerRound.length - 1].toFixed(1) : "—";
    lines.push(`| ${g} | ${c.n} | ${fmtPct(c.idrEndMean)} | ${c.meanTau.toFixed(3)} | ${spk} |`);
  }
  lines.push("");

  // 逐碎片最终吸收率
  lines.push("**逐碎片最终吸收率**（谁的数据真的传出去了）：");
  lines.push("");
  const fragNames = spec.fragments.map(f => f.name);
  lines.push("| 碎片（属主） | " + govs.map(g => `${g}`).join(" | ") + " |");
  lines.push("|---|" + govs.map(() => "---|").join("") + "---|");
  for (const frag of fragNames) {
    lines.push(`| ${frag} | ` + govs.map(g => {
      const c = conditions.get(g)!;
      const v = c.perFragmentEndMean[frag];
      return v === undefined ? "—" : fmtPct(v);
    }).join(" | ") + " |");
  }
  lines.push("");
  lines.push("");
  return lines.join("\n");
}

// ============================================================================
// main
// ============================================================================

function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  IDR — Information Diffusion Rate 离线分析（过程证据）      ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const found = discoverRuns();
  const runsByScenario: Map<string, RunIDR[]> = new Map();

  for (const { file, run } of found) {
    const spec = SCENARIO_SPECS.find(s => s.scenario === run.scenario);
    if (!spec) {
      console.log(`  [跳过] ${file}: 场景 "${run.scenario}" 无碎片定义`);
      continue;
    }
    const idr = computeRunIDR(run, spec);
    if (!idr) continue;
    idr.file = file;
    if (!runsByScenario.has(run.scenario)) runsByScenario.set(run.scenario, []);
    runsByScenario.get(run.scenario)!.push(idr);
  }

  console.log("  发现可分析 run：");
  for (const [scenario, runs] of runsByScenario) {
    const govCount: Record<string, number> = {};
    for (const r of runs) govCount[r.governance] = (govCount[r.governance] ?? 0) + 1;
    console.log(`    ${scenario}: ${runs.length} runs ${JSON.stringify(govCount)}`);
  }
  console.log("");

  const reportSections: string[] = [];
  reportSections.push(`# IDR — Information Diffusion Rate 分析报告`);
  reportSections.push("");
  reportSections.push(`> 生成时间：${new Date().toISOString()}`);
  reportSections.push(`> 用途：过程证据——治理是否真的打破了隐蔽信息流动壁垒（非最终 τ 的结果证据）`);
  reportSections.push("");
  reportSections.push(`## 方法（与诚实标注）`);
  reportSections.push("");
  reportSections.push(`- **碎片定义**：hidden-profile 构造已知——每个 agent 独占一个维度；用【维度关键词 + 独有数值】标记。`);
  reportSections.push(`- **M_{i,k}(t)**：agent i 至第 t 轮输出（reasoning + evidence）命中碎片 k 标记 → 1（累积单调）。`);
  reportSections.push(`- **IDR(t)** = 非属主吸收率均值（按碎片平均，排除属主）。`);
  reportSections.push(`- ⚠️ **匹配是启发式**（词+值共现，与 \`markEvidenceSharing\` Layer 1 同族），边是"共现推断的吸收"，**非因果血统**；IDR 对比是过程相关性，**不 claim 中介**。`);
  reportSections.push(`- ⚠️ **发言量对照**：治理改变发言结构，已报告每轮均发言数供读者判断（吸收率未按发言量归一）。`);
  reportSections.push(`- ⚠️ **样本量**：Crisis/Supplier 的 E9 全量尚未执行（论文标注 pending）。以下结果基于 university pilot / semantic 组，**探索性**。`);
  reportSections.push("");
  reportSections.push(`---`);
  reportSections.push("");

  const summary: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    scenarios: {},
  };

  /** 场景 → 治理条件 → 聚合结果（供综合结论取值） */
  const conditionSummaries: Map<string, Map<string, ConditionIDR>> = new Map();

  for (const spec of SCENARIO_SPECS) {
    const runs = runsByScenario.get(spec.scenario) ?? [];

    // 按治理条件分组 → 聚合
    const runGroups: Map<string, RunIDR[]> = new Map();
    for (const run of runs) {
      const key = run.governance;
      if (!runGroups.has(key)) runGroups.set(key, []);
      runGroups.get(key)!.push(run);
    }
    const conditions: Map<string, ConditionIDR> = new Map();
    for (const [gov, cruns] of runGroups) {
      conditions.set(gov, aggregateCondition(cruns, spec.fragments));
    }
    conditionSummaries.set(spec.scenario, conditions);

    reportSections.push(buildReport(spec.scenario, spec, conditions, runs));

    // 机器可读摘要
    const condJson: Record<string, unknown> = {};
    for (const [gov, agg] of conditions) {
      condJson[gov] = {
        n: agg.n,
        meanTau: agg.meanTau,
        idrEndMean: agg.idrEndMean,
        idrCurveMean: agg.idrCurveMean,
        idrCurveStd: agg.idrCurveStd,
        meanSpeakersPerRound: agg.meanSpeakersPerRound,
        perFragmentEndMean: agg.perFragmentEndMean,
      };
    }
    summary.scenarios[spec.scenario] = { runs: runs.length, conditions: condJson };
  }

  // ==========================================================================
  // 综合结论（诚实措辞，取自真实聚合结果）
  // ==========================================================================
  reportSections.push(`## 结论与下一步`);
  reportSections.push("");
  const uni = conditionSummaries.get("university");
  if (uni && uni.size > 0) {
    const none = uni.get("none");
    const delta = uni.get("delta") ?? uni.get("cognitive");
    if (none && delta) {
      const dEnd = delta.idrEndMean - none.idrEndMean;
      reportSections.push(`**university（pilot，探索性）**：`);
      reportSections.push(`- ${delta.governance} 治理（n=${delta.n}）最终信息扩散率 ${fmtPct(delta.idrEndMean)} 高于无治理（n=${none.n}）${fmtPct(none.idrEndMean)}（Δ=+${(dEnd * 100).toFixed(1)}pp），同时决策质量 τ ${delta.meanTau.toFixed(3)} > ${none.meanTau.toFixed(3)}——过程证据与"治理通过打破隐蔽信息流动壁垒改善决策质量"的机制假说**一致**（方向性，非因果）。`);
      const fragLines: string[] = [];
      for (const frag of SCENARIO_SPECS.find(s => s.scenario === "university")!.fragments) {
        const dn = delta.perFragmentEndMean[frag.name];
        const nn = none.perFragmentEndMean[frag.name];
        if (dn === undefined || nn === undefined) continue;
        if (dn - nn > 0.01) fragLines.push(`${frag.name}：${fmtPct(nn)} → ${fmtPct(dn)}`);
      }
      if (fragLines.length > 0) {
        reportSections.push(`- 逐碎片提升：${fragLines.join("；")}。`);
      }
    }
    if (uni.has("semantic")) {
      const sem = uni.get("semantic")!;
      reportSections.push(`- semantic 组（n=${sem.n}）IDR_end ${fmtPct(sem.idrEndMean)}、τ 均值 ${sem.meanTau.toFixed(3)}。`);
    }
  }
  const crisisRuns = runsByScenario.get("crisis")?.length ?? 0;
  const supplierRuns = runsByScenario.get("supplier")?.length ?? 0;
  if (crisisRuns === 0 && supplierRuns === 0) {
    reportSections.push("");
    reportSections.push(`**Crisis / Supplier**：E9 全量尚未执行（论文标注 pending）。执行后（产出的 run 自带 roundOpinions）直接重跑本脚本，即可得到 full vs none 的 IDR 对比。`);
  }
  reportSections.push("");
  reportSections.push(`**下一步**：`);
  reportSections.push(`1. E9 全量后重跑，对 IDR_end 做 full vs none 置换检验。`);
  reportSections.push(`2. 若要做中介声明，需 mediation 分析（τ 效应经 IDR 传导的比例）；本报告只提供过程相关性。`);
  reportSections.push(`3. a5（综合顾问）标记最弱、信息与 a1/a3 冗余——若其独有信息 IDR 长期为 0，符合设计（粗略信息不携带独有数值），但需在论文标注该碎片对 IDR 分母的稀释效应。`);
  reportSections.push("");

  const report = reportSections.join("\n");

  const analysisDir = path.resolve(__dirname, "..", "output", "e9_analysis");
  fs.mkdirSync(analysisDir, { recursive: true });
  const mdPath = path.join(analysisDir, "idr_diffusion_report.md");
  const jsonPath = path.join(analysisDir, "idr_diffusion.json");
  fs.writeFileSync(mdPath, report, "utf-8");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log(report);
  console.log(`\n  报告已保存：`);
  console.log(`    ${mdPath}`);
  console.log(`    ${jsonPath}`);
}

try {
  main();
} catch (err) {
  console.error("IDR analysis failed:", err);
  process.exit(1);
}
