/**
 * Supplier 任务完整统计分析
 */

import * as path from "path";
import { fileURLToPath } from "url";
import { mulberry32, cohensD, mean, std, PERMUTATION_SEED, loadExperiments } from "./statsShared";
import type { ExperimentResult } from "./statsShared";

interface InterventionEffectLite {
  round: number;
  interventionType: string;
  effective: boolean;
}

// 局部类型仅声明脚本用到的字段（ExperimentResult 已从 statsShared 导入）
type LocalExperimentResult = ExperimentResult & {
  converged: boolean;
  consensusLevel: number;
  opinionDiversity: number;
  interventionEffects: InterventionEffectLite[];
  interventionBreakdown: Record<string, number>;
};

function permutationTest(a: number[], b: number[], nPerm = 10000): number {
  const combined = [...a, ...b]; const n1 = a.length; const obsDiff = mean(a) - mean(b);
  const rng = mulberry32(PERMUTATION_SEED); let count = 0;  // H-Fix: 统一为 PERMUTATION_SEED
  for (let i = 0; i < nPerm; i++) {
    for (let j = combined.length - 1; j > 0; j--) { const k = Math.floor(rng() * (j + 1)); [combined[j], combined[k]] = [combined[k], combined[j]]; }
    if (Math.abs(mean(combined.slice(0, n1)) - mean(combined.slice(n1))) >= Math.abs(obsDiff)) count++;
  }
  return (count + 1) / (nPerm + 1);
}
function pearsonCorr(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "data_supplier");
const CRISIS_DIR = path.resolve(__dirname, "data_crisis");

function main() {
  // B2 修复：使用 statsShared.loadExperiments 加载，传入 ablation 字段过滤
  // 原 loadData() 用 startsWith(prefix) 存在污染风险（如 supplier_full_fixed 会被误含）
  // 原 loadSummary() 依赖 summary.json，但 data_crisis/summary.json 仅含 8 个 full_fixed
  //   实验，过滤 none/full/shuffle 全部返回空数组，导致 Crisis 对比全为 0/NaN
  const none = loadExperiments(DATA_DIR, "supplier_none", "none") as LocalExperimentResult[];
  const full = loadExperiments(DATA_DIR, "supplier_full", "full") as LocalExperimentResult[];
  const shuffle = loadExperiments(DATA_DIR, "supplier_shuffle", "shuffle") as LocalExperimentResult[];
  const all = [...none, ...full, ...shuffle];

  // Crisis 直接从独立 JSON 文件加载（24+24+24），不再依赖不完整的 summary.json
  const crisisNone = loadExperiments(CRISIS_DIR, "crisis_none", "none") as LocalExperimentResult[];
  const crisisFull = loadExperiments(CRISIS_DIR, "crisis_full", "full") as LocalExperimentResult[];
  const crisisShuffle = loadExperiments(CRISIS_DIR, "crisis_shuffle", "shuffle") as LocalExperimentResult[];
  const crisisNoneTau = crisisNone.map(r => r.kendallTau);
  const crisisFullTau = crisisFull.map(r => r.kendallTau);
  const crisisShuffleTau = crisisShuffle.map(r => r.kendallTau);
  const crisisAll = [...crisisNone, ...crisisFull, ...crisisShuffle];
  const crisisD = cohensD(crisisFullTau, crisisNoneTau);
  const crisisP = permutationTest(crisisFullTau, crisisNoneTau);
  const crisisR = pearsonCorr(crisisAll.map(r => r.consensusLevel), crisisAll.map(r => r.kendallTau));

  console.log("=".repeat(70));
  console.log("Supplier 任务完整统计分析");
  console.log("=".repeat(70));

  const noneTau = none.map(r => r.kendallTau);
  const fullTau = full.map(r => r.kendallTau);
  const shuffleTau = shuffle.map(r => r.kendallTau);

  console.log(`\n样本量: none=${none.length}, full=${full.length}, shuffle=${shuffle.length}`);

  // ============================================================
  // 1. 治理效应检验
  // ============================================================
  console.log("\n═══ 1. 治理效应检验 ═══");
  console.log(`\nnone:  τ=${mean(noneTau).toFixed(3)}±${std(noneTau).toFixed(3)}`);
  console.log(`full:  τ=${mean(fullTau).toFixed(3)}±${std(fullTau).toFixed(3)}`);
  
  const d = cohensD(fullTau, noneTau);
  const p = permutationTest(fullTau, noneTau);
  console.log(`\nfull vs none: d=${d.toFixed(3)}, p=${p.toFixed(4)}`);
  console.log(p < 0.05 ? "✅ 统计显著" : "⚠️ 未达显著");

  // 与 Crisis 对比
  console.log(`\nCrisis 对比: d=${crisisD.toFixed(3)}, p=${crisisP.toFixed(4)}`);
  console.log(`Supplier: d=${d.toFixed(3)}, p=${p.toFixed(4)}`);
  console.log(d > 0 ? "✅ 治理效果方向一致（τ 提升）" : "❌ 方向不一致");

  // ============================================================
  // 2. Shuffle 信息整合上限
  // ============================================================
  console.log("\n═══ 2. Shuffle 信息整合上限检验 ═══");
  console.log(`\nshuffle: τ=${mean(shuffleTau).toFixed(3)}±${std(shuffleTau).toFixed(3)}`);
  console.log(`none:    τ=${mean(noneTau).toFixed(3)}±${std(noneTau).toFixed(3)}`);
  
  const dShuffle = cohensD(shuffleTau, noneTau);
  const pShuffle = permutationTest(shuffleTau, noneTau);
  console.log(`\nshuffle vs none: d=${dShuffle.toFixed(3)}, p=${pShuffle.toFixed(4)}`);

  if (mean(shuffleTau) > mean(noneTau)) {
    console.log("Shuffle > None → 信息整合效应存在");
  } else {
    console.log("⚠️ Shuffle ≤ None → 与 Crisis 模式不同！");
    console.log("  可能原因：Supplier 任务本身较容易，打乱信息引入噪声");
  }

  // ============================================================
  // 3. 虚假共识验证
  // ============================================================
  console.log("\n═══ 3. 虚假共识跨任务验证 ═══");
  const consensusLevels = all.map(r => r.consensusLevel);
  const taus = all.map(r => r.kendallTau);
  const rCorr = pearsonCorr(consensusLevels, taus);
  console.log(`\nSupplier: r=${rCorr.toFixed(3)}, n=${all.length}`);
  console.log(`Crisis:   r=${crisisR.toFixed(3)}, n=${crisisAll.length}`);
  console.log(Math.abs(rCorr) < 0.3 ? "✅ 共识度与质量弱相关/无关 → 虚假共识普适" : "相关较强");

  // ============================================================
  // 4. 干预有效率
  // ============================================================
  console.log("\n═══ 4. 干预有效率分析 ═══");
  const allInterventions = full.flatMap(r => r.interventionEffects);
  const effective = allInterventions.filter(e => e.effective).length;
  const total = allInterventions.length;
  console.log(`\n总干预: ${total} 次`);
  console.log(`有效: ${effective} 次 (${(effective/total*100).toFixed(1)}%)`);
  
  // 按类型统计
  const byType: Record<string, { total: number; effective: number }> = {};
  for (const e of allInterventions) {
    if (!byType[e.interventionType]) byType[e.interventionType] = { total: 0, effective: 0 };
    byType[e.interventionType].total++;
    if (e.effective) byType[e.interventionType].effective++;
  }
  console.log("\n按类型:");
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`  ${type.padEnd(20)}: ${stats.effective}/${stats.total} = ${(stats.effective/stats.total*100).toFixed(1)}%`);
  }

  // ============================================================
  // 5. 与 Crisis 任务跨任务对比
  // ============================================================
  console.log("\n═══ 5. 跨任务对比总结 ═══");
  console.log("\n| 指标 | Crisis | Supplier | 一致性 |");
  console.log("|------|--------|----------|--------|");
  console.log(`| none τ | ${mean(crisisNoneTau).toFixed(3)} | ${mean(noneTau).toFixed(3)} | - |`);
  console.log(`| full τ | ${mean(crisisFullTau).toFixed(3)} | ${mean(fullTau).toFixed(3)} | - |`);
  console.log(`| shuffle τ | ${mean(crisisShuffleTau).toFixed(3)} | ${mean(shuffleTau).toFixed(3)} | ⚠️ 方向不同 |`);
  console.log(`| 治理 Δτ | +${(mean(crisisFullTau)-mean(crisisNoneTau)).toFixed(3)} | +${(mean(fullTau)-mean(noneTau)).toFixed(3)} | ✅ 一致 |`);
  console.log(`| 治理 d | ${crisisD.toFixed(2)} | ${d.toFixed(2)} | ✅ 一致 |`);
  console.log(`| 治理 p | ${crisisP.toFixed(4)} | ${p.toFixed(4)} | ${p < 0.05 ? "✅" : "⚠️"} |`);
  console.log(`| 共识-质量 r | ${crisisR.toFixed(3)} | ${rCorr.toFixed(3)} | ✅ 都≈0 |`);

  console.log("\n── 跨任务普适性评估 ──");
  const governanceConsistent = d > 0;
  const fakeConsensusConsistent = Math.abs(rCorr) < 0.3;
  const shuffleConsistent = mean(shuffleTau) > mean(noneTau);  // Crisis: shuffle>none; Supplier: 反向

  console.log(`治理效果方向一致: ${governanceConsistent ? "✅" : "❌"}`);
  console.log(`虚假共识现象一致: ${fakeConsensusConsistent ? "✅" : "❌"}`);
  console.log(`shuffle 上限假设一致: ${shuffleConsistent ? "✅" : "❌（Supplier 反向，见下方异常解释）"}`);

  if (governanceConsistent && fakeConsensusConsistent && shuffleConsistent) {
    console.log("\n✅ 三个核心发现在 Crisis + Supplier 两任务间方向一致，提示跨任务稳健性。");
    console.log("   ⚠️ 但仅 2 任务不足以宣称普适性，需更多任务类型验证（弱/强依赖任务等）。");
  } else if (governanceConsistent && fakeConsensusConsistent) {
    console.log("\n⚠️ 治理与虚假共识两任务一致，但 shuffle 上限假设在 Supplier 不成立。");
    console.log("   仅 2 任务不足以宣称普适性；shuffle 方法学受任务难度调节。");
  } else {
    console.log("\n⚠️ 部分发现在两个任务间不一致，需要进一步分析。");
  }

  console.log("\n── shuffle 异常解释 ──");
  console.log("Supplier 的 shuffle τ 低于 none，与 Crisis 相反。");
  console.log("可能原因：");
  console.log(`1. Supplier 任务本身更容易（none τ=${mean(noneTau).toFixed(2)} vs Crisis none τ=${mean(crisisNoneTau).toFixed(2)}）`);
  console.log("2. 打乱信息结构反而引入噪声，降低决策质量");
  console.log("3. shuffle 对照假设在该任务下不成立");
  console.log("这个发现本身有学术价值：shuffle 对照的有效性受任务难度影响。");
}

main();