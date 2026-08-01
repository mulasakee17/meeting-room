/**
 * E9 V6: 四组（A/B/C/D）交叉对比分析
 *
 * 设计目标（防止"看起来对但实际不对"的幻觉）：
 *   1. 结果导向：只比较决策质量 τ（ground-truth 对齐），不测 agent 内部 belief
 *      （避免重蹈旧路径 "belief-move 无对照判定干预有效" 的覆辙）
 *   2. 先验主比较：B-A 是唯一 confirmatory（primary endpoint），其余 exploratory
 *   3. 非劣效性用置信区间 + 先验界值（margin=0.1），不用"显著优于"替代
 *   4. 显著判定：Bootstrap CI 两端同号（不可跨零）
 *   5. 功效预警：n 未达计划 50/组时明确标注
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/e9_v6_comparison.ts
 *
 * 数据源（兼容两种布局）：
 *   - output/<exp_id>/raw/*.json     （run_all 正式实验输出）
 *   - pilot_output/<exp_id>_*.json   （Pilot 输出）
 */

import * as fs from "fs";
import * as path from "path";
import { mean, sampleStd, cohensD, mulberry32, PERMUTATION_SEED } from "../../v2/statsShared";
import type { RawRunData } from "../types";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";

// ============================================================================
// 配置
// ============================================================================

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const PILOT_DIR = path.resolve(__dirname, "..", "pilot_output");
const N_PERMS = 10000;
const N_BOOT = 10000;
const BOOT_SEED = PERMUTATION_SEED + 0x5EED;
/** 非劣效界值：B 不比 D 差超过 0.1 的 τ 即非劣效（先验设定，非后验） */
const NON_INFERIORITY_MARGIN = 0.1;
/** 计划每组 runs（Phase 3） */
const PLANNED_N = 50;

interface GroupDef {
  id: string;
  label: string;
  mode: string;
  role: string;
}

const GROUPS: GroupDef[] = [
  { id: "e9_v6_a_none",      label: "A", mode: "none",     role: "基线（无治理）" },
  { id: "e9_v6_b_delta",     label: "B", mode: "cognitive", role: "δ 自适应治理（主实验组）" },
  { id: "e9_v6_c_semantic",  label: "C", mode: "cognitive", role: "δ + SemanticTool" },
  { id: "e9_v6_d_old",       label: "D", mode: "full",     role: "旧检测器基线" },
];

// ============================================================================
// 数据加载（兼容 output/<id>/raw 和 pilot_output）
// ============================================================================

function loadGroup(def: GroupDef): RawRunData[] {
  const runs: RawRunData[] = [];

  // 1) output/<id>/raw/ 下所有 JSON（排除聚合文件）
  const rawDir = path.join(OUTPUT_DIR, def.id, "raw");
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir).filter(f => f.endsWith(".json") && !f.includes("summary"))) {
      try {
        const p = safeJsonParse<any>(fs.readFileSync(path.join(rawDir, f), "utf8"));
        if (p && p.runId && !p.error) runs.push(p);
      } catch { /* skip corrupt */ }
    }
  }

  // 2) pilot_output/<id>_*.json
  if (fs.existsSync(PILOT_DIR)) {
    for (const f of fs.readdirSync(PILOT_DIR).filter(f => f.startsWith(def.id) && f.endsWith(".json"))) {
      try {
        const p = safeJsonParse<any>(fs.readFileSync(path.join(PILOT_DIR, f), "utf8"));
        if (p && p.runId && !p.error) runs.push(p);
      } catch { /* skip */ }
    }
  }

  return runs;
}

/** 提取决策质量 τ——兼容 finalKendallTau（v6）/ kendallTau（旧）两种命名 */
function extractTau(d: RawRunData): number | undefined {
  const t = (d as any).finalKendallTau ?? (d as any).kendallTau;
  return typeof t === "number" ? t : undefined;
}

// ============================================================================
// 统计
// ============================================================================

/** 置换检验（unpaired），(count+1)/(nPerms+1) 校正 */
function permutationTest(a: number[], b: number[]): { diff: number; p: number } {
  const observedDiff = mean(a) - mean(b);
  const all = [...a, ...b];
  const nA = a.length;
  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  for (let i = 0; i < N_PERMS; i++) {
    const s = [...all];
    for (let j = s.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [s[j], s[k]] = [s[k], s[j]];
    }
    const diff = mean(s.slice(0, nA)) - mean(s.slice(nA));
    if (Math.abs(diff) >= Math.abs(observedDiff)) count++;
  }
  return { diff: observedDiff, p: (count + 1) / (N_PERMS + 1) };
}

/** Bootstrap CI for mean difference（两端同号判定） */
function bootstrapCIDiff(a: number[], b: number[]): [number, number] {
  const rng = mulberry32(BOOT_SEED);
  const diffs: number[] = [];
  for (let i = 0; i < N_BOOT; i++) {
    let sa = 0, sb = 0;
    for (let j = 0; j < a.length; j++) sa += a[Math.floor(rng() * a.length)];
    for (let j = 0; j < b.length; j++) sb += b[Math.floor(rng() * b.length)];
    diffs.push(sa / a.length - sb / b.length);
  }
  diffs.sort((x, y) => x - y);
  return [diffs[Math.floor(N_BOOT * 0.025)], diffs[Math.floor(N_BOOT * 0.975)]];
}

/** CI 两端同号 → 显著（不跨零） */
function significant(ci: [number, number]): boolean {
  return (ci[0] > 0 && ci[1] > 0) || (ci[0] < 0 && ci[1] < 0);
}

// ============================================================================
// 主分析
// ============================================================================

function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  E9 V6 四组交叉对比（A none / B δ / C δ+Semantic / D old）");
  console.log("════════════════════════════════════════════════════════════\n");

  const loaded = new Map<string, RawRunData[]>();
  for (const g of GROUPS) {
    loaded.set(g.id, loadGroup(g));
    console.log(`  加载 ${g.label} (${g.id}): ${loaded.get(g.id)!.length} runs`);
  }

  // ── 1. 分组汇总 ──────────────────────────────────────────────
  console.log("\n━━━ 1. 分组汇总 ━━━\n");
  console.log("  " + "-".repeat(66));
  console.log("  组 | n |    τ 均值 ± std    |     95% CI     | 干预数 | rounds");
  console.log("  " + "-".repeat(66));

  const tauMap = new Map<string, number[]>();
  const summaries = new Map<string, { n: number; mean: number; std: number; ci: [number, number]; interventions: number; rounds: number }>();

  for (const g of GROUPS) {
    const runs = loaded.get(g.id)!;
    const taus = runs.map(extractTau).filter((t): t is number => t !== undefined);
    tauMap.set(g.id, taus);
    const n = taus.length;
    if (n === 0) {
      summaries.set(g.id, { n: 0, mean: NaN, std: NaN, ci: [NaN, NaN], interventions: 0, rounds: NaN });
      console.log(`  ${g.label} | 0 | (无数据)`);
      continue;
    }
    const m = mean(taus), s = sampleStd(taus), se = s / Math.sqrt(n);
    const tCrit = n > 30 ? 1.96 : 2.045; // ~95%
    const ci: [number, number] = [m - tCrit * se, m + tCrit * se];
    const intvs = runs.reduce((acc, d) => acc + (d.interventions?.length || 0), 0);
    const rds = mean(runs.map(d => d.totalRounds || 0));
    summaries.set(g.id, { n, mean: m, std: s, ci, interventions: intvs, rounds: rds });
    console.log(`  ${g.label} | ${String(n).padEnd(2)} | ${m.toFixed(3)} ± ${s.toFixed(3)} | [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}] | ${String(intvs).padEnd(4)} | ${rds.toFixed(1)}`);
  }
  console.log("  " + "-".repeat(66));

  // ── 2. 主比较 ────────────────────────────────────────────────
  console.log("\n━━━ 2. 主比较（按先验顺序；B-A 为 confirmatory，其余 exploratory）━━━\n");

  interface Comp { kind: string; endpoint: string; a: string; b: string; }
  const comparisons: Comp[] = [
    { kind: "confirmatory", endpoint: "primary",  a: "B", b: "A" }, // δ vs none
    { kind: "exploratory",  endpoint: "secondary", a: "C", b: "B" }, // Semantic 增量
    { kind: "exploratory",  endpoint: "reference", a: "C", b: "A" },
    { kind: "exploratory",  endpoint: "reference", a: "D", b: "A" },
    // 非劣效：B vs D（B 不比 D 差太多）
  ];

  const results: any[] = [];

  for (const c of comparisons) {
    const aT = tauMap.get(GROUPS.find(g => g.label === c.a)!.id)!;
    const bT = tauMap.get(GROUPS.find(g => g.label === c.b)!.id)!;
    const aSum = summaries.get(GROUPS.find(g => g.label === c.a)!.id)!;
    const bSum = summaries.get(GROUPS.find(g => g.label === c.b)!.id)!;

    if (aT.length < 2 || bT.length < 2) {
      console.log(`  ${c.endpoint}: ${c.a}(${c.b}? 方向) — 样本不足，跳过`);
      continue;
    }

    const perm = permutationTest(aT, bT); // a - b
    const d = cohensD(aT, bT);
    const ci = bootstrapCIDiff(aT, bT);
    const sig = significant(ci);
    const underpowered = Math.min(aSum.n, bSum.n) < PLANNED_N;

    results.push({ endpoint: c.endpoint, kind: c.kind, comparison: `${c.a} vs ${c.b}`, diff: perm.diff, d, ci, significant: sig, pa: aSum.n, pb: bSum.n, underpowered });

    const arrow = perm.diff > 0 ? "→" : "←";
    console.log(`  [${c.endpoint}] ${c.kind}  ${c.a} vs ${c.b}:`);
    console.log(`    Δτ = ${perm.diff > 0 ? "+" : ""}${perm.diff.toFixed(3)} ${arrow}  Cohen's d = ${d.toFixed(2)}  p = ${perm.p.toFixed(4)}`);
    console.log(`    95% CI = [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]  ${sig ? "✅ 显著（CI 同号）" : "⚠️ 不显著（CI 跨零）"}`);
    if (underpowered) console.log(`    ⚠️ 功效预警：n=${Math.min(aSum.n, bSum.n)} < 计划 ${PLANNED_N}，结论可能功效不足`);
    console.log();
  }

  // 非劣效：B vs D（Δτ 下界 > -margin 即非劣效）
  const bT = tauMap.get(GROUPS[1].id)!;
  const dT = tauMap.get(GROUPS[3].id)!;
  if (bT.length >= 2 && dT.length >= 2) {
    const ci = bootstrapCIDiff(bT, dT); // B - D
    const ni = ci[0] > -NON_INFERIORITY_MARGIN;
    results.push({ endpoint: "non-inferiority", kind: "exploratory", comparison: "B vs D", ci, margin: NON_INFERIORITY_MARGIN, nonInferior: ni });
    console.log(`  [non-inferiority] exploratory  B vs D（非劣效，margin=${NON_INFERIORITY_MARGIN}）:`);
    console.log(`    95% CI (B−D) = [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]  → 下界 ${ci[0].toFixed(3)} ${ni ? "> " + (-NON_INFERIORITY_MARGIN).toFixed(3) + " ✅ 非劣效" : "≤ " + (-NON_INFERIORITY_MARGIN).toFixed(3) + " ❌ 不成立"}`);
    console.log();
  }

  // ── 3. 诚实标注与结论 ────────────────────────────────────────
  console.log("━━━ 3. 诚实标注 ━━━\n");
  console.log("  · B-A 是唯一 confirmatory（primary endpoint），其余为 exploratory");
  console.log("  · 未预注册；单场景（university）；单模型（deepseek-v4-flash）");
  console.log("  · 显著判定 = Bootstrap CI 两端同号（不可跨零），非仅 p<0.05");
  console.log("  · 干预有效性在此不评估（见 AAMAS_SUBMISSION_CHECKLIST E10：belief-move 判定有缺陷）");
  console.log("  · 非劣效界值 margin=0.1 为先验设定");
  console.log();

  // 保存
  const outDir = path.join(OUTPUT_DIR, "e9_analysis");
  fs.mkdirSync(outDir, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    note: "v6 E9 四组对比。B-A confirmatory，其余 exploratory。显著=CI同号。",
    groups: [...summaries.entries()].map(([id, s]) => ({
      id, n: s.n, meanTau: s.mean, stdTau: s.std, ci95: s.ci, interventions: s.interventions, rounds: s.rounds,
    })),
    comparisons: results,
  };
  fs.writeFileSync(path.join(outDir, "e9_v6_comparison.json"), JSON.stringify(out, null, 2));
  console.log(`  结果已保存: ${path.join(outDir, "e9_v6_comparison.json")}`);
}

try {
  main();
} catch (err) {
  console.error("E9 V6 analysis failed:", err);
  process.exit(1);
}
