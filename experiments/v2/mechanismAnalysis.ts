/**
 * 机制消融分析（Mechanism Ablation Analysis）
 *
 * 研究问题：到底是哪类干预驱动了治理效果？
 *
 * 方法：
 * 1. 按 interventionType 拆分每次干预的 Δτ（tauAfter - tauBefore）
 * 2. 对每类干预：有效 vs 无效的 Δτ 差异（置换检验）
 * 3. 对每类干预：与 baseline（无干预轮次）的 Δτ 对比
 * 4. 效应量 Cohen's d + 95% CI（t 分布，小样本校正）
 * 5. 跨任务验证：Crisis vs Supplier 是否一致
 *
 * 统计约定（遵循 project_memory）：
 * - 置换检验 p-value 使用 (count+1)/(nPerm+1) 校正
 * - 小样本 CI 使用 t 分布
 * - JSON 解析使用 safeJsonParse
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mulberry32, cohensD, mean, sampleStd, PERMUTATION_SEED } from "./statsShared";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";

// ============================================================================
// 类型定义
// ============================================================================
interface RoundIntervention {
  type: string;
  targetAgentId?: string;
  targetAgents?: string[];
}

interface RoundRecord {
  roundNumber: number;
  tau: number;
  beliefs: Record<string, number>;
  interventions: RoundIntervention[];
}

interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory: number[];
  totalRounds: number;
  totalInterventions: number;
  rounds: RoundRecord[];
}

interface InterventionRecord {
  runId: string;
  task: string;
  round: number;
  type: string;
  effective: boolean;
  tauBefore: number;
  tauAfter: number;
  deltaTau: number;
}

// ============================================================================
// 统计工具
// ============================================================================

// t 分布临界值表（双侧 α=0.05）
const T_TABLE_005: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  40: 2.021, 60: 2.000, 120: 1.980,
};

function tCritical(df: number): number {
  if (df <= 0) return 12.706;
  if (T_TABLE_005[df]) return T_TABLE_005[df];
  const keys = Object.keys(T_TABLE_005).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const t0 = T_TABLE_005[keys[i]], t1 = T_TABLE_005[keys[i + 1]];
      return t0 + (t1 - t0) * (df - keys[i]) / (keys[i + 1] - keys[i]);
    }
  }
  return 1.96;
}

/** 置换检验：(count+1)/(nPerm+1) 校正，避免 p=0 假阳性 */
function permutationTest(a: number[], b: number[], nPerm = 10000): { meanDiff: number; pValue: number } {
  if (a.length === 0 || b.length === 0) return { meanDiff: 0, pValue: 1 };
  const obsDiff = mean(a) - mean(b);
  const pooled = [...a, ...b];
  const nA = a.length;
  const rng = mulberry32(PERMUTATION_SEED);  // H-Fix: 统一为 PERMUTATION_SEED
  let count = 0;
  for (let i = 0; i < nPerm; i++) {
    const arr = [...pooled];
    for (let j = 0; j < nA; j++) {
      const k = j + Math.floor(rng() * (arr.length - j));
      [arr[j], arr[k]] = [arr[k], arr[j]];
    }
    const permDiff = mean(arr.slice(0, nA)) - mean(arr.slice(nA));
    if (Math.abs(permDiff) >= Math.abs(obsDiff)) count++;
  }
  return { meanDiff: obsDiff, pValue: (count + 1) / (nPerm + 1) };
}

/** t 分布 CI（小样本校正） */
function tCI(samples: number[], alpha = 0.05): [number, number] {
  const n = samples.length;
  if (n < 2) return [0, 0];
  const m = mean(samples);
  const sd = sampleStd(samples);
  const tcrit = tCritical(n - 1);
  const margin = (tcrit * sd) / Math.sqrt(n);
  return [m - margin, m + margin];
}

// ============================================================================
// 数据加载
// ============================================================================
function loadData(dataDir: string, prefix: string, task: string): ExperimentResult[] {
  if (!fs.existsSync(dataDir)) return [];
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json") && f.startsWith(prefix) && f !== "summary.json");
  return files.map(f => {
    const content = fs.readFileSync(path.join(dataDir, f), "utf-8");
    return safeJsonParse<ExperimentResult>(content);
  }).filter((r): r is ExperimentResult => r !== null && !r.error);
}

// ============================================================================
// 构建干预记录（按 intervention 级别，非 target 级别）
// ============================================================================
function buildInterventionRecords(results: ExperimentResult[], task: string): InterventionRecord[] {
  const records: InterventionRecord[] = [];
  for (const result of results) {
    for (let i = 0; i < result.rounds.length; i++) {
      const round = result.rounds[i];
      const nextRound = i + 1 < result.rounds.length ? result.rounds[i + 1] : null;
      for (const intv of round.interventions) {
        const targets = intv.targetAgentId ? [intv.targetAgentId] : intv.targetAgents || [];
        const tauBefore = result.tauTrajectory[i] ?? round.tau ?? 0;
        const tauAfter = nextRound ? (result.tauTrajectory[i + 1] ?? nextRound.tau ?? tauBefore) : tauBefore;

        // 判断有效性：任一目标信念变化 > 0.05
        let effective = false;
        if (nextRound) {
          for (const targetId of targets) {
            const beliefBefore = round.beliefs[targetId] ?? 0;
            const beliefAfter = nextRound.beliefs[targetId] ?? beliefBefore;
            if (Math.abs(beliefAfter - beliefBefore) > 0.05) {
              effective = true;
              break;
            }
          }
        }

        records.push({
          runId: result.runId,
          task,
          round: round.roundNumber,
          type: intv.type,
          effective,
          tauBefore,
          tauAfter,
          deltaTau: tauAfter - tauBefore,
        });
      }
    }
  }
  return records;
}

// ============================================================================
// 构建基线 Δτ（无干预轮次）
// ============================================================================
function buildBaselineDeltaTau(results: ExperimentResult[]): number[] {
  const deltas: number[] = [];
  for (const result of results) {
    for (let i = 0; i < result.rounds.length - 1; i++) {
      const round = result.rounds[i];
      if (round.interventions.length === 0) {
        const tauBefore = result.tauTrajectory[i] ?? round.tau ?? 0;
        const tauAfter = result.tauTrajectory[i + 1] ?? result.rounds[i + 1].tau ?? tauBefore;
        deltas.push(tauAfter - tauBefore);
      }
    }
  }
  return deltas;
}

// ============================================================================
// 分析
// ============================================================================
function analyzeTask(records: InterventionRecord[], baselineDeltas: number[], taskName: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`  机制消融分析 — ${taskName}`);
  console.log("=".repeat(80));

  const types = [...new Set(records.map(r => r.type))].sort();
  const totalInterventions = records.length;
  const effectiveRecords = records.filter(r => r.effective);
  const overallRate = totalInterventions > 0 ? effectiveRecords.length / totalInterventions : 0;

  console.log(`\n总干预: ${totalInterventions} | 有效: ${effectiveRecords.length} (${(overallRate * 100).toFixed(1)}%)`);
  console.log(`基线 Δτ（无干预轮次）: n=${baselineDeltas.length}, mean=${mean(baselineDeltas).toFixed(3)}, sd=${sampleStd(baselineDeltas).toFixed(3)}`);

  // ===== 表 1: 按干预类型拆分 — Δτ、有效率、效应量、显著性 =====
  console.log("\n" + "-".repeat(80));
  console.log("表 1: 干预类型 × Δτ × 有效率 × 效应量（vs 基线）");
  console.log("-".repeat(80));

  console.log("\n| 类型 | n | 有效率 | Δτ(有效) | Δτ(无效) | Cohen's d vs基线 | p-value | 95% CI (Δτ) |");
  console.log("|------|---|--------|----------|----------|------------------|---------|-------------|");

  const typeResults: { type: string; n: number; rate: number; d: number; p: number; ci: [number, number]; deltaTauEffective: number; deltaTauIneffective: number }[] = [];

  for (const type of types) {
    const typeRecs = records.filter(r => r.type === type);
    const effRecs = typeRecs.filter(r => r.effective);
    const ineffRecs = typeRecs.filter(r => !r.effective);

    const deltaTauEff = effRecs.length > 0 ? mean(effRecs.map(r => r.deltaTau)) : 0;
    const deltaTauIneff = ineffRecs.length > 0 ? mean(ineffRecs.map(r => r.deltaTau)) : 0;

    // 该类型所有干预的 Δτ vs 基线 Δτ
    const typeDeltaTaus = typeRecs.map(r => r.deltaTau);
    const { meanDiff, pValue } = permutationTest(typeDeltaTaus, baselineDeltas);
    const d = cohensD(typeDeltaTaus, baselineDeltas);
    const ci = tCI(typeDeltaTaus);

    const rate = typeRecs.length > 0 ? effRecs.length / typeRecs.length : 0;
    console.log(`| ${type} | ${typeRecs.length} | ${(rate * 100).toFixed(1)}% | ${deltaTauEff >= 0 ? "+" : ""}${deltaTauEff.toFixed(3)} | ${deltaTauIneff >= 0 ? "+" : ""}${deltaTauIneff.toFixed(3)} | ${d >= 0 ? "+" : ""}${d.toFixed(3)} | ${pValue.toFixed(4)} | [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}] |`);

    typeResults.push({ type, n: typeRecs.length, rate, d, p: pValue, ci, deltaTauEffective: deltaTauEff, deltaTauIneffective: deltaTauIneff });
  }

  // ===== 表 2: 有效 vs 无效干预的 Δτ 差异（置换检验） =====
  console.log("\n" + "-".repeat(80));
  console.log("表 2: 有效 vs 无效干预的 Δτ 差异（按类型）");
  console.log("-".repeat(80));

  console.log("\n| 类型 | Δτ(有效) n | Δτ(无效) n | 差异 | p-value | 解读 |");
  console.log("|------|-----------|-----------|------|---------|------|");

  for (const type of types) {
    const typeRecs = records.filter(r => r.type === type);
    const effDeltas = typeRecs.filter(r => r.effective).map(r => r.deltaTau);
    const ineffDeltas = typeRecs.filter(r => !r.effective).map(r => r.deltaTau);

    if (effDeltas.length < 2 || ineffDeltas.length < 2) {
      console.log(`| ${type} | ${effDeltas.length} | ${ineffDeltas.length} | — | — | 样本不足 |`);
      continue;
    }

    const { meanDiff, pValue } = permutationTest(effDeltas, ineffDeltas);
    const interpretation = pValue < 0.05
      ? (meanDiff > 0 ? "有效干预显著提升 Δτ" : "有效干预反而降低 Δτ")
      : "有效/无效无显著差异";
    console.log(`| ${type} | ${effDeltas.length} (μ=${mean(effDeltas).toFixed(3)}) | ${ineffDeltas.length} (μ=${mean(ineffDeltas).toFixed(3)}) | ${meanDiff >= 0 ? "+" : ""}${meanDiff.toFixed(3)} | ${pValue.toFixed(4)} | ${interpretation} |`);
  }

  // ===== 表 3: 干预时机 × 类型 交叉分析 =====
  console.log("\n" + "-".repeat(80));
  console.log("表 3: 干预时机 × 类型（Δτ 均值 / 有效率）");
  console.log("-".repeat(80));

  const rounds = [...new Set(records.map(r => r.round))].sort((a, b) => a - b);
  console.log("\n| 轮次 | " + types.map(t => `${t} (n/有效率/Δτ)`).join(" | ") + " |");
  console.log("|------|" + types.map(() => "---").join("|") + "|");

  for (const round of rounds) {
    const cells = types.map(type => {
      const recs = records.filter(r => r.round === round && r.type === type);
      if (recs.length === 0) return "—";
      const rate = recs.filter(r => r.effective).length / recs.length;
      const dTau = mean(recs.map(r => r.deltaTau));
      return `${recs.length} / ${(rate * 100).toFixed(0)}% / ${dTau >= 0 ? "+" : ""}${dTau.toFixed(2)}`;
    });
    console.log(`| 第${round}轮 | ${cells.join(" | ")} |`);
  }

  return typeResults;
}

// ============================================================================
// 跨任务一致性分析
// ============================================================================
function crossTaskComparison(crisisResults: { type: string; n: number; rate: number; d: number; p: number }[],
                             supplierResults: { type: string; n: number; rate: number; d: number; p: number }[]) {
  console.log("\n" + "=".repeat(80));
  console.log("  跨任务一致性分析（Crisis vs Supplier）");
  console.log("=".repeat(80));

  console.log("\n| 干预类型 | Crisis d | Crisis p | Supplier d | Supplier p | 一致性 |");
  console.log("|----------|----------|----------|------------|------------|--------|");

  const allTypes = [...new Set([...crisisResults.map(r => r.type), ...supplierResults.map(r => r.type)])].sort();
  for (const type of allTypes) {
    const c = crisisResults.find(r => r.type === type);
    const s = supplierResults.find(r => r.type === type);
    const cD = c ? c.d.toFixed(3) : "—";
    const cP = c ? c.p.toFixed(4) : "—";
    const sD = s ? s.d.toFixed(3) : "—";
    const sP = s ? s.p.toFixed(4) : "—";

    let consistency = "—";
    if (c && s) {
      const sameSign = Math.sign(c.d) === Math.sign(s.d);
      const bothSig = c.p < 0.05 && s.p < 0.05;
      const eitherSig = c.p < 0.05 || s.p < 0.05;
      if (sameSign && bothSig) consistency = "✅ 方向+显著性一致";
      else if (sameSign && eitherSig) consistency = "⚠️ 方向一致，显著性部分";
      else if (sameSign) consistency = "⚠️ 方向一致，均不显著";
      else consistency = "❌ 方向不一致";
    }
    console.log(`| ${type} | ${cD} | ${cP} | ${sD} | ${sP} | ${consistency} |`);
  }
}

// ============================================================================
// 主函数
// ============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const crisisDir = path.resolve(__dirname, "data_crisis");
  const supplierDir = path.resolve(__dirname, "data_supplier");

  // Crisis
  const crisisFull = loadData(crisisDir, "crisis_full", "crisis");
  const crisisNone = loadData(crisisDir, "crisis_none", "crisis");
  const crisisRecords = buildInterventionRecords(crisisFull, "crisis");
  const crisisBaseline = buildBaselineDeltaTau([...crisisFull, ...crisisNone]);

  // Supplier
  const supplierFull = loadData(supplierDir, "supplier_full", "supplier");
  const supplierNone = loadData(supplierDir, "supplier_none", "supplier");
  const supplierRecords = buildInterventionRecords(supplierFull, "supplier");
  const supplierBaseline = buildBaselineDeltaTau([...supplierFull, ...supplierNone]);

  console.log(`加载: Crisis ${crisisFull.length} full + ${crisisNone.length} none | Supplier ${supplierFull.length} full + ${supplierNone.length} none`);

  const crisisTypeResults = analyzeTask(crisisRecords, crisisBaseline, "Crisis");
  const supplierTypeResults = analyzeTask(supplierRecords, supplierBaseline, "Supplier");

  crossTaskComparison(crisisTypeResults, supplierTypeResults);

  // ===== 总结 =====
  console.log("\n" + "=".repeat(80));
  console.log("  关键发现总结");
  console.log("=".repeat(80));

  // 找出两个任务中 d 值都为正的类型
  const robustTypes = crisisTypeResults.filter(c => {
    const s = supplierTypeResults.find(r => r.type === c.type);
    return s && c.d > 0 && s.d > 0;
  });

  if (robustTypes.length > 0) {
    console.log("\n跨任务稳健的干预类型（两任务 d > 0）：");
    for (const c of robustTypes) {
      const s = supplierTypeResults.find(r => r.type === c.type)!;
      console.log(`  • ${c.type}: Crisis d=${c.d.toFixed(2)} (p=${c.p.toFixed(3)}) | Supplier d=${s.d.toFixed(2)} (p=${s.p.toFixed(3)})`);
    }
  }

  // 找出不一致的类型
  const inconsistent = crisisTypeResults.filter(c => {
    const s = supplierTypeResults.find(r => r.type === c.type);
    return s && Math.sign(c.d) !== Math.sign(s.d);
  });

  if (inconsistent.length > 0) {
    console.log("\n跨任务不一致的干预类型：");
    for (const c of inconsistent) {
      const s = supplierTypeResults.find(r => r.type === c.type)!;
      console.log(`  • ${c.type}: Crisis d=${c.d.toFixed(2)} vs Supplier d=${s.d.toFixed(2)} — 方向相反`);
    }
  }
}

main();
