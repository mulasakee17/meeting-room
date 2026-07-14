import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string; ablation: string; runIndex: number;
  kendallTau: number; decisionQuality: number;
  totalRounds: number; converged: boolean;
  totalInterventions: number;
  tauTrajectory?: number[];
  interventionBreakdown?: Record<string, number>;
  rounds: Array<{ roundNumber: number; tau?: number; evalScores?: Record<string, number>; interventions: Array<{ type: string }> }>;
  evaluationScores: Record<string, number>;
}

const DATA_DIR = path.resolve(__dirname, "data");
const DATA_INVEST_DIR = path.resolve(__dirname, "data_invest");
const DATA_INVEST_3ROUND_DIR = path.resolve(__dirname, "data_invest_3round");

function loadData(dir: string): ExperimentResult[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "summary.json");
  const results = files.map(f =>
    JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"))
  );
  // 过滤掉错误实验（run.ts 错误隔离写入的占位文件）
  const valid = results.filter(r => !r.error);
  if (valid.length < results.length) {
    console.warn(`[loadData] ${results.length - valid.length} error placeholder(s) skipped in ${dir}`);
  }
  return valid;
}

function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length; }
function stdDev(v: number[]): number {
  if (v.length < 2) return 0;  // n<2 时返回 0 而非 NaN
  const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}
function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;  // 小样本无法可靠估计效应量
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

// ============================================================================
// 统计推断：Bootstrap CI（百分位法）+ 置换检验 p-value
// ============================================================================

/** 确定性 PRNG (mulberry32)，保证 bootstrap/置换结果可复现 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RNG_SEED = 42;
const N_BOOT = 10000;
const N_PERM = 10000;  // 置换次数
const ALPHA = 0.05;

/** t 分布临界值表（双侧 α=0.05），用于小样本 CI */
const T_TABLE_005: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  12: 2.179, 14: 2.145, 15: 2.131, 19: 2.093, 20: 2.086,
  24: 2.064, 25: 2.060, 29: 2.045, 30: 2.042, 40: 2.021,
  60: 2.000, 120: 1.980,
};
function tCritical(df: number): number {
  if (df <= 0) return 12.706;
  if (T_TABLE_005[df]) return T_TABLE_005[df];
  // 线性插值
  const keys = Object.keys(T_TABLE_005).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const t0 = T_TABLE_005[keys[i]], t1 = T_TABLE_005[keys[i + 1]];
      return t0 + (t1 - t0) * (df - keys[i]) / (keys[i + 1] - keys[i]);
    }
  }
  return 1.96; // df > 120 时近似 z
}

/**
 * Bootstrap 百分位 CI（用于均值）。
 * 小样本时同时输出 t 分布 CI。
 */
function bootstrapCI(samples: number[], nBoot = N_BOOT, alpha = ALPHA) {
  const n = samples.length;
  if (n === 0) return { mean: 0, ci95: [0, 0] as [number, number], ci95_t: [0, 0] as [number, number] };
  const rng = mulberry32(RNG_SEED);
  const means: number[] = [];
  for (let i = 0; i < nBoot; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += samples[Math.floor(rng() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(nBoot * alpha / 2)];
  const hi = means[Math.floor(nBoot * (1 - alpha / 2))];
  const m = mean(samples);
  // t 分布 CI（小样本校正）
  const sd = stdDev(samples);
  const tcrit = tCritical(n - 1);
  const margin = (tcrit * sd) / Math.sqrt(n);
  return { mean: m, ci95: [lo, hi] as [number, number], ci95_t: [m - margin, m + margin] as [number, number] };
}

/**
 * 置换检验（permutation test）—— 替代 bootstrap p-value。
 *
 * 原理：在零假设下（两组来自同一分布），合并后随机分配到两组，
 * 计算均值差，重复 N_PERM 次，p-value = 置换中 |diff| >= |obsDiff| 的比例。
 *
 * 这是正确的非参数假设检验方法，不依赖正态假设，不存在 bootstrap p-value 的循环推理问题。
 */
function permutationTest(a: number[], b: number[], nPerm = N_PERM) {
  if (a.length === 0 || b.length === 0) return { meanDiff: 0, pValue: 1 };
  const obsDiff = mean(a) - mean(b);
  const pooled = [...a, ...b];
  const nA = a.length;
  const rng = mulberry32(RNG_SEED + 0x50E8);  // 独立 seed 流
  let count = 0;
  for (let i = 0; i < nPerm; i++) {
    // Fisher-Yates 部分洗牌：前 nA 个作为 "组A"
    const arr = [...pooled];
    for (let j = 0; j < nA; j++) {
      const k = j + Math.floor(rng() * (arr.length - j));
      [arr[j], arr[k]] = [arr[k], arr[j]];
    }
    const permA = arr.slice(0, nA);
    const permB = arr.slice(nA);
    const permDiff = mean(permA) - mean(permB);
    if (Math.abs(permDiff) >= Math.abs(obsDiff)) count++;
  }
  // H32 修复：(count+1)/(nPerm+1) 校正，避免 p=0 假阳性
  return { meanDiff: obsDiff, pValue: (count + 1) / (nPerm + 1) };
}

/**
 * Bootstrap CI for the difference in means between two groups.
 * p-value 来自置换检验（非 bootstrap p-value）。
 * Returns { meanDiff, ci95: [lo, hi], ci95_t: [lo, hi], pValue }.
 */
function bootstrapMeanDiff(a: number[], b: number[], nBoot = N_BOOT, alpha = ALPHA) {
  if (a.length === 0 || b.length === 0) return { meanDiff: 0, ci95: [0, 0] as [number, number], ci95_t: [0, 0] as [number, number], pValue: 1 };
  const rng = mulberry32(RNG_SEED + 0x5EED);
  const diffs: number[] = [];
  const obsDiff = mean(a) - mean(b);
  for (let i = 0; i < nBoot; i++) {
    let sumA = 0, sumB = 0;
    for (let j = 0; j < a.length; j++) sumA += a[Math.floor(rng() * a.length)];
    for (let j = 0; j < b.length; j++) sumB += b[Math.floor(rng() * b.length)];
    diffs.push(sumA / a.length - sumB / b.length);
  }
  diffs.sort((x, y) => x - y);
  const lo = diffs[Math.floor(nBoot * alpha / 2)];
  const hi = diffs[Math.floor(nBoot * (1 - alpha / 2))];
  // 置换检验 p-value（正确方法）
  const permResult = permutationTest(a, b);
  // t 分布 CI（Welch 近似，不假设等方差）
  // 小样本 guard：n<2 时 stdDev 返回 0，se=0，margin=0，CI 退化为点估计
  const sdA = stdDev(a), sdB = stdDev(b);
  const se = Math.sqrt(sdA * sdA / a.length + sdB * sdB / b.length);
  let margin = 0;
  if (a.length >= 2 && b.length >= 2 && se > 0) {
    const df = Math.pow(sdA * sdA / a.length + sdB * sdB / b.length, 2) /
      (Math.pow(sdA * sdA / a.length, 2) / (a.length - 1) + Math.pow(sdB * sdB / b.length, 2) / (b.length - 1));
    const tcrit = tCritical(Math.floor(df));
    margin = tcrit * se;
  }
  return { meanDiff: obsDiff, ci95: [lo, hi] as [number, number], ci95_t: [obsDiff - margin, obsDiff + margin] as [number, number], pValue: permResult.pValue };
}

/** Format a CI as [+X.XX, +X.XX] */
function fmtCI(ci: [number, number]): string {
  const s0 = (ci[0] >= 0 ? "+" : "") + ci[0].toFixed(2);
  const s1 = (ci[1] >= 0 ? "+" : "") + ci[1].toFixed(2);
  return `[${s0}, ${s1}]`;
}

function analyze(label: string, dir: string) {
  const results = loadData(dir);
  if (results.length === 0) {
    console.log(`\n[${label}] No data in ${dir}/ — skipping.\n`);
    return;
  }

  const groups = new Map<string, ExperimentResult[]>();
  for (const r of results) {
    if (!groups.has(r.ablation)) groups.set(r.ablation, []);
    groups.get(r.ablation)!.push(r);
  }

  const baseline = groups.get("none");
  if (!baseline) {
    console.log(`\n[${label}] No \"none\" baseline found — aborting.\n`);
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // BETWEEN-GROUP — final τ comparison
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log(`  ${label} — BETWEEN-GROUP Decision Quality (Kendall's τ → 0-100)`);
  console.log("=".repeat(80));
  console.log("| Ablation          | n  | Q μ±σ        | τ μ±σ         | Intv  | d vs none | Δτ (within) |");
  console.log("|-------------------|----|--------------|---------------|-------|-----------|-------------|");

  const ablationOrder = ["none", "full", "shuffle", "full_diversity", "full_weight", "full_reflection", "full_continue"];

  for (const ablation of ablationOrder) {
    const g = groups.get(ablation);
    if (!g) continue;
    const qs = g.map(r => r.decisionQuality);
    const ts = g.map(r => r.kendallTau);
    const totalIntv = g.reduce((s, r) => s + r.totalInterventions, 0);
    const d = ablation === "none" ? 0 : cohensD(qs, baseline.map(r => r.decisionQuality));
    const dStr = ablation === "none" ? "—" : (d >= 0 ? "+" : "") + d.toFixed(2);

    // Within-group Δτ
    const deltas: number[] = [];
    for (const r of g) {
      if (r.tauTrajectory && r.tauTrajectory.length >= 2) {
        deltas.push(r.tauTrajectory[r.tauTrajectory.length - 1] - r.tauTrajectory[0]);
      }
    }
    const deltaStr = deltas.length > 0
      ? `${(mean(deltas) >= 0 ? "+" : "")}${mean(deltas).toFixed(3)}±${stdDev(deltas).toFixed(3)}`
      : "—";

    console.log(
      `| ${ablation.padEnd(17)} | ${String(g.length).padStart(2)} | ${mean(qs).toFixed(1)}±${stdDev(qs).toFixed(1).padStart(4)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${String(totalIntv).padStart(3)}   | ${dStr.padStart(7)}   | ${deltaStr.padStart(11)} |`
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // SHUFFLE CONTROL — regression-to-mean check
  // ════════════════════════════════════════════════════════════════════
  const fullG = groups.get("full");
  const shuffleG = groups.get("shuffle");
  if (fullG && shuffleG) {
    console.log("\n" + "-".repeat(80));
    console.log("  SHUFFLE CONTROL — Regression-to-Mean Check");
    console.log("-".repeat(80));

    const fullQs = fullG.map(r => r.decisionQuality);
    const shuffleQs = shuffleG.map(r => r.decisionQuality);
    const fullDeltas = fullG
      .filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
      .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]);
    const shuffleDeltas = shuffleG
      .filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
      .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]);

    const shuffleD = cohensD(shuffleQs, baseline.map(r => r.decisionQuality));
    const fullVsShuffleD = cohensD(fullQs, shuffleQs);

    console.log(`  baseline (none) τ:     ${mean(baseline.map(r => r.kendallTau)).toFixed(3)}`);
    console.log(`  shuffle τ:            ${mean(shuffleG.map(r => r.kendallTau)).toFixed(3)} (d vs none = ${shuffleD >= 0 ? "+" : ""}${shuffleD.toFixed(2)})`);
    console.log(`  full τ:               ${mean(fullG.map(r => r.kendallTau)).toFixed(3)} (d vs none = ${cohensD(fullQs, baseline.map(r => r.decisionQuality)) >= 0 ? "+" : ""}${cohensD(fullQs, baseline.map(r => r.decisionQuality)).toFixed(2)})`);
    console.log(`  full vs shuffle d:    ${fullVsShuffleD >= 0 ? "+" : ""}${fullVsShuffleD.toFixed(2)}`);
    console.log(`  shuffle Δτ:           ${mean(shuffleDeltas) >= 0 ? "+" : ""}${mean(shuffleDeltas).toFixed(3)}±${stdDev(shuffleDeltas).toFixed(3)}`);
    console.log(`  full Δτ:              ${mean(fullDeltas) >= 0 ? "+" : ""}${mean(fullDeltas).toFixed(3)}±${stdDev(fullDeltas).toFixed(3)}`);

    if (Math.abs(mean(shuffleDeltas)) < 0.1 && mean(fullDeltas) > 0.3) {
      console.log(`\n  ✓ shuffle Δτ ≈ 0 while full Δτ > 0.3 — regression to the mean is RULED OUT.`);
      console.log(`    Governance improvement is genuine, not an artifact of`);
      console.log(`    repeated measurement or discussion mechanics alone.`);
    } else if (fullVsShuffleD > 0.5) {
      console.log(`\n  → Full substantially outperforms shuffle (d=${fullVsShuffleD.toFixed(2)}).`);
      console.log(`    Directional evidence against regression-to-mean.`);
    } else {
      console.log(`\n  ⚠ Cannot rule out regression to the mean (full vs shuffle d=${fullVsShuffleD.toFixed(2)}).`);
      console.log(`    Consider increasing n or tightening the control design.`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // INTERVENTION TYPE ABLATION — which intervention matters?
  // ════════════════════════════════════════════════════════════════════
  const singleModes = ["full_diversity", "full_weight", "full_reflection", "full_continue"];
  const hasSingleModes = singleModes.some(m => groups.has(m));

  if (hasSingleModes) {
    console.log("\n" + "-".repeat(80));
    console.log("  INTERVENTION TYPE ABLATION — Which Intervention Matters?");
    console.log("-".repeat(80));

    const modeLabels: Record<string, string> = {
      full_diversity:  "introduce_diversity (echo chamber → diversity injection)",
      full_weight:     "reduce_weight (authority bias → weight reduction)",
      full_reflection: "force_reflection (polarization → belief reflection)",
      full_continue:   "continue_discussion (premature consensus → more rounds)",
    };

    console.log("| Single-intervention         | τ μ±σ         | d vs none | Δτ          |");
    console.log("|-----------------------------|---------------|-----------|-------------|");

    for (const mode of singleModes) {
      const g = groups.get(mode);
      if (!g) continue;
      const ts = g.map(r => r.kendallTau);
      const d = cohensD(g.map(r => r.decisionQuality), baseline.map(r => r.decisionQuality));
      const dStr = (d >= 0 ? "+" : "") + d.toFixed(2);

      const deltas: number[] = [];
      for (const r of g) {
        if (r.tauTrajectory && r.tauTrajectory.length >= 2) {
          deltas.push(r.tauTrajectory[r.tauTrajectory.length - 1] - r.tauTrajectory[0]);
        }
      }
      const deltaStr = deltas.length > 0
        ? `${(mean(deltas) >= 0 ? "+" : "")}${mean(deltas).toFixed(3)}`
        : "—";

      console.log(`| ${modeLabels[mode].padEnd(27)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${dStr.padStart(7)}   | ${deltaStr.padStart(11)} |`);
    }

    // Full vs each single mode
    if (fullG) {
      console.log(`\n  full (all 4):          τ = ${mean(fullG.map(r => r.kendallTau)).toFixed(3)}±${stdDev(fullG.map(r => r.kendallTau)).toFixed(3)}`);

      // Check if any single mode matches full
      for (const mode of singleModes) {
        const g = groups.get(mode);
        if (!g || g.length === 0) continue;
        const sd = cohensD(fullG.map(r => r.decisionQuality), g.map(r => r.decisionQuality));
        if (sd < 0.3) {
          console.log(`  → ${mode} alone nearly matches full (d=${sd.toFixed(2)}) — this intervention may be the dominant driver.`);
        }
      }

      // Check if continue_discussion alone explains the effect
      const contG = groups.get("full_continue");
      if (contG) {
        const contD = cohensD(fullG.map(r => r.decisionQuality), contG.map(r => r.decisionQuality));
        if (contD < 0.5) {
          console.log(`  → continue_discussion explains most of full's effect (d_full_vs_cont=${contD.toFixed(2)}).`);
          console.log(`    This suggests more discussion rounds are the primary mechanism,`);
          console.log(`    not the sophistication of targeted interventions.`);
        }
      }

      // Full intervention breakdown from full-mode runs
      const breakdown: Record<string, number[]> = {};
      for (const r of fullG) {
        if (r.interventionBreakdown) {
          for (const [k, v] of Object.entries(r.interventionBreakdown)) {
            if (!breakdown[k]) breakdown[k] = [];
            breakdown[k].push(v);
          }
        }
      }
      if (Object.keys(breakdown).length > 0) {
        console.log(`\n  Full-mode intervention distribution (per run):`);
        for (const [intvType, counts] of Object.entries(breakdown)) {
          console.log(`    ${intvType}: ${mean(counts).toFixed(1)}±${stdDev(counts).toFixed(1)}`);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STATISTICAL INFERENCE — bootstrap CI + permutation test p-value
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "-".repeat(80));
  console.log("  STATISTICAL INFERENCE (bootstrap CI + permutation test, 10000 resamples, α=0.05)");
  console.log("-".repeat(80));

  const baselineQs = baseline.map(r => r.decisionQuality);
  const baselineTs = baseline.map(r => r.kendallTau);
  const baselineCI = bootstrapCI(baselineQs);
  console.log(`\n  Baseline (none):  Q = ${baselineCI.mean.toFixed(1)}`);
  console.log(`                    95% CI (bootstrap) ${fmtCI(baselineCI.ci95)}`);
  console.log(`                    95% CI (t-dist)    ${fmtCI(baselineCI.ci95_t)}`);

  // Full vs none — the primary claim
  if (fullG) {
    const fullQs = fullG.map(r => r.decisionQuality);
    const fullTs = fullG.map(r => r.kendallTau);
    const fullCI = bootstrapCI(fullQs);
    const diffFullVsNone = bootstrapMeanDiff(fullQs, baselineQs);
    const dFullVsNone = cohensD(fullQs, baselineQs);

    console.log(`  Full governance:  Q = ${fullCI.mean.toFixed(1)}`);
    console.log(`                    95% CI (bootstrap) ${fmtCI(fullCI.ci95)}`);
    console.log(`                    95% CI (t-dist)    ${fmtCI(fullCI.ci95_t)}`);
    console.log(`  Full vs None:     ΔQ = ${diffFullVsNone.meanDiff >= 0 ? "+" : ""}${diffFullVsNone.meanDiff.toFixed(1)}`);
    console.log(`                    95% CI (bootstrap) ${fmtCI(diffFullVsNone.ci95)}`);
    console.log(`                    95% CI (t-dist)    ${fmtCI(diffFullVsNone.ci95_t)}`);
    console.log(`                    Cohen's d = ${dFullVsNone >= 0 ? "+" : ""}${dFullVsNone.toFixed(2)}`);
    console.log(`                    p = ${diffFullVsNone.pValue.toFixed(4)} (permutation test, two-sided)`);

    if (diffFullVsNone.pValue < 0.05) {
      console.log(`  ✓ Full vs None is statistically significant (p < 0.05).`);
    } else {
      console.log(`  ⚠ Full vs None is NOT statistically significant (p = ${diffFullVsNone.pValue.toFixed(4)} ≥ 0.05).`);
      console.log(`    With n=${baselineQs.length} per group, the observed effect may be noise.`);
    }
  }

  // Shuffle control — permutation test
  if (shuffleG && fullG) {
    const shuffleQs = shuffleG.map(r => r.decisionQuality);
    const diffShuffleVsNone = bootstrapMeanDiff(shuffleQs, baselineQs);
    console.log(`\n  Shuffle vs None:  ΔQ = ${diffShuffleVsNone.meanDiff >= 0 ? "+" : ""}${diffShuffleVsNone.meanDiff.toFixed(1)}`);
    console.log(`                    95% CI (t-dist) ${fmtCI(diffShuffleVsNone.ci95_t)}`);
    console.log(`                    p = ${diffShuffleVsNone.pValue.toFixed(4)} (permutation)`);

    const diffFullVsShuffle = bootstrapMeanDiff(fullG.map(r => r.decisionQuality), shuffleQs);
    console.log(`  Full vs Shuffle:  ΔQ = ${diffFullVsShuffle.meanDiff >= 0 ? "+" : ""}${diffFullVsShuffle.meanDiff.toFixed(1)}`);
    console.log(`                    95% CI (t-dist) ${fmtCI(diffFullVsShuffle.ci95_t)}`);
    console.log(`                    p = ${diffFullVsShuffle.pValue.toFixed(4)} (permutation)`);
  }

  // Within-group Δτ — 减去基线 Δτ 后的净效应
  const baselineDeltas = baseline
    .filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
    .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]);
  const baselineDeltaMean = baselineDeltas.length > 0 ? mean(baselineDeltas) : 0;

  const fullDeltas = fullG
    ?.filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
    .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]) ?? [];

  if (fullDeltas.length > 0) {
    const deltaCI = bootstrapCI(fullDeltas);
    // 净 Δτ = Full Δτ - Baseline Δτ，使用 bootstrapMeanDiff 正确处理两组方差
    const netDeltaResult = bootstrapMeanDiff(fullDeltas, baselineDeltas);
    console.log(`\n  Full within-group Δτ:        ${deltaCI.mean >= 0 ? "+" : ""}${deltaCI.mean.toFixed(3)}, 95% CI ${fmtCI(deltaCI.ci95_t)}`);
    console.log(`  Baseline within-group Δτ:    ${baselineDeltaMean >= 0 ? "+" : ""}${baselineDeltaMean.toFixed(3)} (讨论机制自然改善)`);
    console.log(`  Net Δτ (Full - Baseline):    ${netDeltaResult.meanDiff >= 0 ? "+" : ""}${netDeltaResult.meanDiff.toFixed(3)}, 95% CI ${fmtCI(netDeltaResult.ci95_t)}`);
    if (netDeltaResult.ci95_t[0] > 0) {
      console.log(`  ✓ 净 Δτ 显著为正（扣除基线后治理仍有改善）`);
    } else if (netDeltaResult.ci95_t[1] < 0) {
      console.log(`  ✗ 净 Δτ 显著为负（治理造成退化）`);
    } else {
      console.log(`  ⚠ 净 Δτ 不显著（治理的边际贡献无法与讨论机制区分）`);
    }
  }

  // Single-intervention bootstrap comparison
  if (hasSingleModes) {
    console.log(`\n  Single-intervention bootstrap (vs baseline):`);

    // 收集所有 p 值用于多重比较校正
    const pValues: { mode: string; pValue: number; meanDiff: number; ci95: [number, number] }[] = [];
    for (const mode of singleModes) {
      const g = groups.get(mode);
      if (!g || g.length === 0) continue;
      const diff = bootstrapMeanDiff(g.map(r => r.decisionQuality), baselineQs);
      pValues.push({ mode, pValue: diff.pValue, meanDiff: diff.meanDiff, ci95: diff.ci95 });
    }

    // Bonferroni 校正
    const nTests = pValues.length;
    const bonferroniAlpha = 0.05 / nTests;

    // Benjamini-Hochberg FDR 校正
    const sortedP = [...pValues].sort((a, b) => a.pValue - b.pValue);
    const bhCritical: Record<string, number> = {};
    for (let i = 0; i < sortedP.length; i++) {
      const rank = i + 1;
      bhCritical[sortedP[i].mode] = (0.05 * rank) / nTests;
    }

    console.log(`  Bonferroni-corrected α = ${bonferroniAlpha.toFixed(4)} (${nTests} tests)`);
    console.log("");

    for (const { mode, pValue, meanDiff, ci95 } of pValues) {
      const sig = ci95[0] > 0 ? "✓ sig" : ci95[1] < 0 ? "✗ sig(neg)" : "— n.s.";
      const bonfSig = pValue < bonferroniAlpha ? "✓" : "—";
      const bhSig = pValue < bhCritical[mode] ? "✓" : "—";
      console.log(
        `    ${mode.padEnd(16)} ΔQ = ${meanDiff >= 0 ? "+" : ""}${meanDiff.toFixed(1)} ${fmtCI(ci95).padStart(14)} p=${pValue.toFixed(3)} ${sig} | bonf${bonfSig} bh${bhSig}`
      );
    }
    console.log(`    Legend: sig = uncorrected 95% CI | bonf = Bonferroni | bh = Benjamini-Hochberg FDR`);
  }
}

// ════════════════════════════════════════════════════════════════════
// Run analysis on both task datasets
// ════════════════════════════════════════════════════════════════════

console.log("=".repeat(80));
console.log("  SwarmAlpha V2 — Experiment Analysis");
console.log("=".repeat(80));

analyze("M&A Task (5 rounds)", DATA_DIR);
analyze("Invest Task (5 rounds)", DATA_INVEST_DIR);
analyze("Invest Task (3 rounds)", DATA_INVEST_3ROUND_DIR);

console.log("\nDone.");
