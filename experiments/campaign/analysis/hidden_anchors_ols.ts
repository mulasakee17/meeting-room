/**
 * Hidden Anchors OLS 系统辨识 —— 从 itemBeliefs 轨迹恢复每个 agent 的锚点强度 α_i。
 *
 * 理论模型（Friedkin-Johnsen）：
 *   u_i(t+1) = α_i · u_i(0) + (1-α_i) · mean_{j≠i} u_j(t)
 *
 * 其中：
 *   u_i(t)  = agent i 在第 t 轮的 K 维偏好向量（itemBeliefs[].belief）
 *   u_i(0)  = 初始偏好（round 1）
 *   α_i     = 锚点强度 ∈ [0, 1]，越大越顽固
 *
 * OLS 辨识：
 *   令 s_i(t) = mean_{j≠i} u_j(t)（社会影响）
 *   则 u_i(t+1) - s_i(t) = α_i · (u_i(0) - s_i(t))
 *   对每个 agent i，将所有轮次的所有维度拼接，做 through-origin OLS：
 *     Y = [u_i(2)-s_i(1), ..., u_i(T)-s_i(T-1)]  (每轮 K 维拼接)
 *     X = [u_i(0)-s_i(1), ..., u_i(0)-s_i(T-1)]
 *     α_i = (X^T Y) / (X^T X)
 *
 * 用途：
 *   1. 诊断 Phase 1.5 天花板效应：高 α 是否意味着 agent 根本不改变立场？
 *   2. 对比不同治理模式下的锚点分布
 *   3. 验证 Friedkin-Johnsen 模型对 LLM agent 的拟合优度
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/hidden_anchors_ols.ts
 *   npx tsx experiments/campaign/analysis/hidden_anchors_ols.ts --data-dir ./experiments/campaign/output/phase1_5_probe
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";
import { mean, sampleStd, mulberry32, PERMUTATION_SEED } from "../../v2/statsShared";
import { loadExperimentData } from "../pipeline/Runner";
import type { RawRunData } from "../types";

// ============================================================================
// 类型
// ============================================================================

interface ItemBelief {
  item: string;
  rank: number;
  belief: number;
  confidence: number;
}

/** 单次 (run, agent) 的锚点辨识结果 */
interface AnchorResult {
  runId: string;
  experimentId: string;
  scenario: string;
  agentId: string;
  agentName: string;
  /** 锚点强度 α ∈ [0, 1] */
  alpha: number;
  /** OLS R²（拟合优度，越高说明 FJ 模型越适合该 agent） */
  r2: number;
  /** 观测数（维度 × 轮次数） */
  n: number;
  /** 该 agent 的初始偏好向量 */
  u0: number[];
  /** 各选项名称 */
  itemNames: string[];
  /** 最终 Kendall τ */
  finalKendallTau: number;
  /** 治理模式 */
  governanceMode: string;
}

// ============================================================================
// 数据加载
// ============================================================================

/** 从 campaign output 目录加载所有 run 数据 */
function loadAllRuns(dataDir: string): RawRunData[] {
  const runs: RawRunData[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".json") && !entry.name.includes("summary") && !entry.name.includes("error")) {
        try {
          const raw = safeJsonParse<RawRunData>(fs.readFileSync(fullPath, "utf-8"));
          if (raw && raw.runId && raw.experimentId) {
            runs.push(raw);
          }
        } catch {
          // skip corrupted files
        }
      }
    }
  }

  scanDir(dataDir);
  return runs;
}

// ============================================================================
// 锚点辨识
// ============================================================================

/**
 * 对单个 run 的所有 agent 拟合锚点强度 α_i。
 *
 * 返回该 run 中所有 agent 的 AnchorResult 数组。
 * 要求 run 包含 itemBeliefsTrajectory（至少 2 轮数据）。
 */
function fitAnchorsForRun(run: RawRunData): AnchorResult[] {
  const trajectory = run.itemBeliefsTrajectory;
  if (!trajectory || trajectory.length === 0) return [];

  // 按 agent 分组，按轮次排序
  const byAgent = new Map<string, Array<{ round: number; itemBeliefs: ItemBelief[] }>>();
  const agentNames = new Map<string, string>();
  const itemNamesSet = new Set<string>();

  for (const entry of trajectory) {
    if (!byAgent.has(entry.agentId)) {
      byAgent.set(entry.agentId, []);
    }
    byAgent.get(entry.agentId)!.push({
      round: entry.round,
      itemBeliefs: entry.itemBeliefs,
    });
    agentNames.set(entry.agentId, entry.agentName);
    for (const ib of entry.itemBeliefs) {
      itemNamesSet.add(ib.item);
    }
  }

  const itemNames = Array.from(itemNamesSet).sort();
  const K = itemNames.length;
  if (K === 0) return [];

  const results: AnchorResult[] = [];

  for (const [agentId, entries] of byAgent) {
    // 按轮次排序
    entries.sort((a, b) => a.round - b.round);
    if (entries.length < 2) continue; // 需要至少 2 轮

    // 构建每轮的 K 维向量
    const rounds: number[] = [];
    const vectors: number[][] = [];
    for (const entry of entries) {
      const vec = itemNames.map(name => {
        const ib = entry.itemBeliefs.find(ib => ib.item === name);
        return ib ? ib.belief : 0;
      });
      rounds.push(entry.round);
      vectors.push(vec);
    }

    const u0 = vectors[0]; // 初始偏好
    const T = vectors.length;

    // 构建 OLS 数据：Y = u_i(t+1) - s_i(t), X = u_i(0) - s_i(t)
    const X: number[] = [];
    const Y: number[] = [];

    for (let t = 0; t < T - 1; t++) {
      // 计算社会影响 s_i(t) = mean_{j≠i} u_j(t)
      const sIt = new Array(K).fill(0);
      let otherCount = 0;
      for (const [otherId, otherEntries] of byAgent) {
        if (otherId === agentId) continue;
        const otherRound = otherEntries.find(e => e.round === rounds[t]);
        if (!otherRound) continue;
        otherCount++;
        for (let k = 0; k < K; k++) {
          const ib = otherRound.itemBeliefs.find(ib => ib.item === itemNames[k]);
          sIt[k] += ib ? ib.belief : 0;
        }
      }
      if (otherCount === 0) continue;
      for (let k = 0; k < K; k++) {
        sIt[k] /= otherCount;
      }

      // u_i(t+1)
      const uNext = vectors[t + 1];

      for (let k = 0; k < K; k++) {
        X.push(u0[k] - sIt[k]);
        Y.push(uNext[k] - sIt[k]);
      }
    }

    if (X.length < 2) continue;

    // OLS through origin: α = (X^T Y) / (X^T X)
    let xTx = 0, xTy = 0;
    for (let i = 0; i < X.length; i++) {
      xTx += X[i] * X[i];
      xTy += X[i] * Y[i];
    }

    if (xTx < 1e-10) {
      // 锚点与初始状态几乎一致，跳过
      results.push({
        runId: run.runId,
        experimentId: run.experimentId,
        scenario: run.scenario,
        agentId,
        agentName: agentNames.get(agentId) || agentId,
        alpha: 1.0,
        r2: 0,
        n: X.length,
        u0,
        itemNames,
        finalKendallTau: run.finalKendallTau,
        governanceMode: (run as any).governanceMode || "unknown",
      });
      continue;
    }

    const alpha = xTy / xTx;

    // R² = 1 - SS_res / SS_tot (uncentered, through-origin)
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < Y.length; i++) {
      ssRes += (Y[i] - alpha * X[i]) ** 2;
      ssTot += Y[i] * Y[i];
    }
    const r2 = ssTot < 1e-10 ? 0 : 1 - ssRes / ssTot;

    results.push({
      runId: run.runId,
      experimentId: run.experimentId,
      scenario: run.scenario,
      agentId,
      agentName: agentNames.get(agentId) || agentId,
      alpha: Math.max(0, Math.min(1, alpha)), // clamp to [0, 1]
      r2: Math.max(0, Math.min(1, r2)),
      n: X.length,
      u0,
      itemNames,
      finalKendallTau: run.finalKendallTau,
      governanceMode: (run as any).governanceMode || "unknown",
    });
  }

  return results;
}

// ============================================================================
// 分析
// ============================================================================

function printHeader(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log("  " + title);
  console.log("=".repeat(78));
}

function fmt(n: number, digits = 4): string {
  if (typeof n !== "number" || isNaN(n)) return "NaN";
  return n.toFixed(digits);
}

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dataDirArg = args.find(a => a.startsWith("--data-dir="));
  const defaultDataDir = path.resolve(__dirname, "..", "output");

  const dataDir = dataDirArg
    ? path.resolve(dataDirArg.replace("--data-dir=", ""))
    : defaultDataDir;

  console.log(`Hidden Anchors OLS 系统辨识`);
  console.log(`数据目录：${dataDir}`);
  console.log(`模型：u_i(t+1) = α_i · u_i(0) + (1-α_i) · mean_{j≠i} u_j(t)`);

  // 加载数据
  const allRuns = loadAllRuns(dataDir);
  console.log(`\n加载了 ${allRuns.length} 个 run`);

  const runsWithItemBeliefs = allRuns.filter(r =>
    r.itemBeliefsTrajectory && r.itemBeliefsTrajectory.length > 0
  );
  console.log(`其中 ${runsWithItemBeliefs.length} 个 run 包含 itemBeliefsTrajectory`);

  if (runsWithItemBeliefs.length === 0) {
    console.log("\n⚠ 没有找到包含 itemBeliefsTrajectory 的数据。");
    console.log("  请先使用修改后的 Runner 重新运行实验，或使用 --data-dir 指定数据目录。");
    console.log("\n  如果你有旧的 v2 fraud 数据（含 itemBeliefs），可以运行：");
    console.log("  npx tsx experiments/campaign/analysis/hidden_anchors_ols_v2.ts");
    return;
  }

  // 拟合所有 run
  const allResults: AnchorResult[] = [];
  for (const run of runsWithItemBeliefs) {
    const results = fitAnchorsForRun(run);
    allResults.push(...results);
  }

  console.log(`拟合了 ${allResults.length} 个 agent-anchor 结果`);

  // ── 分析 1：锚点分布 ──
  printHeader("分析 1：锚点强度 α 分布");
  const alphas = allResults.map(r => r.alpha);
  const r2s = allResults.map(r => r.r2);

  const alphaMean = mean(alphas);
  const alphaStd = sampleStd(alphas);
  const r2Mean = mean(r2s);

  console.log(`  n = ${alphas.length}`);
  console.log(`  α 分布：mean=${fmt(alphaMean)}  std=${fmt(alphaStd)}`);
  console.log(`  R² 分布：mean=${fmt(r2Mean)}（FJ 模型拟合优度）`);

  // 按 agent 聚合
  const byAgent = new Map<string, AnchorResult[]>();
  for (const r of allResults) {
    const key = `${r.experimentId}/${r.agentId}`;
    if (!byAgent.has(key)) byAgent.set(key, []);
    byAgent.get(key)!.push(r);
  }

  console.log(`\n  按 agent 聚合（跨 run 平均）：`);
  for (const [key, results] of byAgent) {
    const avgAlpha = mean(results.map(r => r.alpha));
    const avgR2 = mean(results.map(r => r.r2));
    console.log(`    ${key.padEnd(40)} α=${fmt(avgAlpha)}  R²=${fmt(avgR2)}  n_runs=${results.length}`);
  }

  // ── 分析 2：α 与 τ 的关系 ──
  printHeader("分析 2：锚点强度与决策质量");
  // 按 run 聚合平均 α
  const byRun = new Map<string, { avgAlpha: number; tau: number; scenario: string }>();
  for (const r of allResults) {
    if (!byRun.has(r.runId)) {
      byRun.set(r.runId, { avgAlpha: r.alpha, tau: r.finalKendallTau, scenario: r.scenario });
    } else {
      const entry = byRun.get(r.runId)!;
      entry.avgAlpha = (entry.avgAlpha + r.alpha) / 2; // running average approximation
    }
  }

  // 重新计算准确的 run 级平均 α
  const byRunAccurate = new Map<string, number[]>();
  for (const r of allResults) {
    if (!byRunAccurate.has(r.runId)) byRunAccurate.set(r.runId, []);
    byRunAccurate.get(r.runId)!.push(r.alpha);
  }

  const runAvgAlphas: number[] = [];
  const runTaus: number[] = [];
  for (const [runId, alphas] of byRunAccurate) {
    const run = allResults.find(r => r.runId === runId);
    if (run) {
      runAvgAlphas.push(mean(alphas));
      runTaus.push(run.finalKendallTau);
    }
  }

  // Pearson r
  function pearsonR(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return NaN;
    const mx = mean(x), my = mean(y);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx2 += (x[i] - mx) ** 2;
      dy2 += (y[i] - my) ** 2;
    }
    return dx2 === 0 || dy2 === 0 ? NaN : num / Math.sqrt(dx2 * dy2);
  }

  const rAlphaTau = pearsonR(runAvgAlphas, runTaus);
  console.log(`  n_runs = ${runAvgAlphas.length}`);
  console.log(`  r(mean α, τ) = ${fmt(rAlphaTau)}`);
  console.log(`  mean α = ${fmt(mean(runAvgAlphas))}  mean τ = ${fmt(mean(runTaus))}`);

  if (!isNaN(rAlphaTau)) {
    if (rAlphaTau < -0.3) {
      console.log(`  解读：高锚点（顽固 agent）与低决策质量相关——锚点过强阻碍共识达成`);
    } else if (rAlphaTau > 0.3) {
      console.log(`  解读：高锚点与高决策质量相关——初始专业知识锚定有助于决策`);
    } else {
      console.log(`  解读：锚点强度与决策质量无明显线性关系`);
    }
  }

  // ── 分析 3：天花板效应诊断 ──
  printHeader("分析 3：Phase 1.5 天花板效应诊断");
  if (runTaus.length > 0 && runTaus.every(t => t === 1)) {
    console.log(`  所有 run 的 τ = 1.000（天花板效应确认）`);
    console.log(`  平均 α = ${fmt(mean(runAvgAlphas))}：`);
    if (mean(runAvgAlphas) < 0.3) {
      console.log(`    → α 很低，agent 极易被说服 → 快速收敛到正确答案`);
      console.log(`    → 建议：使用更困难的任务（如 fraud）或增加 noise agent`);
    } else if (mean(runAvgAlphas) < 0.6) {
      console.log(`    → α 中等，但任务太简单导致天花板效应`);
      console.log(`    → 建议：增加 maxRounds 观察 α 的长期效应，或切换到更困难的任务`);
    } else {
      console.log(`    → α 很高，但任务仍有天花板 → 可能 ground truth 太明显`);
      console.log(`    → 建议：检查是否正确计算 τ，或使用更模糊的任务场景`);
    }
  } else {
    console.log(`  τ 范围：[${fmt(Math.min(...runTaus))}, ${fmt(Math.max(...runTaus))}]（无天花板效应）`);
    console.log(`  平均 α = ${fmt(mean(runAvgAlphas))}`);
  }

  // ── 保存结果 ──
  const outputDir = path.join(dataDir, "..", "hidden_anchors_results");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const summary = {
    meta: {
      generatedAt: new Date().toISOString(),
      model: "u_i(t+1) = α_i · u_i(0) + (1-α_i) · mean_{j≠i} u_j(t)",
      method: "OLS through origin, per-agent fit",
      dataDir,
      runsLoaded: allRuns.length,
      runsWithItemBeliefs: runsWithItemBeliefs.length,
      agentsFitted: allResults.length,
    },
    alphaDistribution: {
      mean: alphaMean,
      std: alphaStd,
      min: alphas.length ? Math.min(...alphas) : NaN,
      max: alphas.length ? Math.max(...alphas) : NaN,
      n: alphas.length,
    },
    r2Distribution: {
      mean: r2Mean,
      n: r2s.length,
    },
    perAgent: Object.fromEntries(
      Array.from(byAgent.entries()).map(([key, results]) => [
        key,
        {
          avgAlpha: mean(results.map(r => r.alpha)),
          avgR2: mean(results.map(r => r.r2)),
          nRuns: results.length,
        },
      ])
    ),
    alphaTauCorrelation: {
      r: rAlphaTau,
      nRuns: runAvgAlphas.length,
      meanAlpha: mean(runAvgAlphas),
      meanTau: mean(runTaus),
    },
    ceilingEffectDiagnosis: {
      allTauIsOne: runTaus.length > 0 && runTaus.every(t => t === 1),
      meanAlpha: runAvgAlphas.length > 0 ? mean(runAvgAlphas) : NaN,
    },
    perRun: Array.from(byRunAccurate.entries()).map(([runId, alphas]) => {
      const run = allResults.find(r => r.runId === runId);
      return {
        runId,
        experimentId: run?.experimentId || "unknown",
        scenario: run?.scenario || "unknown",
        avgAlpha: mean(alphas),
        tau: run?.finalKendallTau || 0,
        nAgents: alphas.length,
      };
    }),
  };

  const outPath = path.join(outputDir, "hidden_anchors_ols.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\n结果已保存：${outPath}`);
}

main().catch(console.error);