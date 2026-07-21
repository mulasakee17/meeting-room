/**
 * 检测器经验统计脚本 (P0.2 选项 A)
 *
 * 目的：将 4 个经典检测器（echo_chamber, authority_bias, polarization, premature_consensus）
 * 的覆盖率从"设计值"升级为"经验值"。
 *
 * 数据范围：同步引擎 runs（data/ + data_crisis/ + data_supplier/）
 * 不含：异步引擎 runs（async 不保存 messages，且 MAST 检测器未实现于 async 路径）
 * 不含：3 个 MAST 检测器（FM-2.4/2.5/2.6）——实现于 2026-07-20，之后未重跑任何实验
 *
 * 输出：experiments/v2/detector_validation_report.md
 *
 * 准则：以假装理解为耻，以诚实无知为荣
 * 所有数字直接来自 JSON 数据文件，不做任何推断或填充。
 */

import * as fs from 'fs';
import * as path from 'path';

interface RunData {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
  totalInterventions: number;
  issuesDetected: string[];
  interventionBreakdown: Record<string, number>;
  rounds?: Array<{
    roundNumber: number;
    issues: string[];
    interventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }>;
  }>;
}

interface DetectorStats {
  triggerCount: number;       // 触发该检测器的 run 数
  totalRuns: number;          // 总 run 数
  triggerRate: number;        // triggerCount / totalRuns
  // 与 τ 的相关性
  tausWhenTriggered: number[];
  tausWhenNotTriggered: number[];
}

const DETECTOR_TYPES = [
  'echo_chamber',
  'authority_bias',
  'polarization',
  'premature_consensus',
] as const;

const INTERVENTION_TYPES = [
  'reduce_weight',
  'force_reflection',
  'introduce_diversity',
  'continue_discussion',
] as const;

// === 1. 加载数据 ===
const DATA_DIRS = [
  'data',           // M&A 任务
  'data_crisis',    // Crisis 任务
  'data_supplier',  // Supplier 任务
];

const baseDir = __dirname;

function loadAllRuns(): { runs: RunData[]; byTask: Record<string, RunData[]> } {
  const allRuns: RunData[] = [];
  const byTask: Record<string, RunData[]> = {};

  for (const dir of DATA_DIRS) {
    const fullDir = path.join(baseDir, dir);
    if (!fs.existsSync(fullDir)) {
      console.warn(`[WARN] 目录不存在: ${fullDir}`);
      continue;
    }
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.json') && f !== 'summary.json');
    const taskRuns: RunData[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(fullDir, file), 'utf8');
        const data = JSON.parse(raw) as RunData;
        // 跳过 detect-only 模式（这些 run 不触发干预，但仍记录检测）
        // 实际上 detect-only 也有 issuesDetected，保留
        allRuns.push(data);
        taskRuns.push(data);
      } catch (e) {
        console.warn(`[WARN] 解析失败: ${file}: ${(e as Error).message}`);
      }
    }
    byTask[dir] = taskRuns;
  }

  return { runs: allRuns, byTask };
}

// === 2. 统计检测器触发率 ===
function computeDetectorStats(runs: RunData[]): Record<string, DetectorStats> {
  const stats: Record<string, DetectorStats> = {};
  const totalRuns = runs.length;

  for (const det of DETECTOR_TYPES) {
    const triggered: RunData[] = [];
    const notTriggered: RunData[] = [];

    for (const run of runs) {
      // 顶层 issuesDetected 是去重后的；rounds[].issues 包含每轮所有触发
      // 这里用顶层 issuesDetected 作为"该 run 是否触发过该检测器"
      if (run.issuesDetected && run.issuesDetected.includes(det)) {
        triggered.push(run);
      } else {
        notTriggered.push(run);
      }
    }

    stats[det] = {
      triggerCount: triggered.length,
      totalRuns,
      triggerRate: triggered.length / totalRuns,
      tausWhenTriggered: triggered.map(r => r.kendallTau).filter(t => typeof t === 'number'),
      tausWhenNotTriggered: notTriggered.map(r => r.kendallTau).filter(t => typeof t === 'number'),
    };
  }

  return stats;
}

// === 3. 统计干预类型分布 ===
function computeInterventionStats(runs: RunData[]): {
  byType: Record<string, number>;
  totalInterventions: number;
  runsPerType: Record<string, number>;
  meanInterventionsPerRun: number;
} {
  const byType: Record<string, number> = {};
  const runsPerType: Record<string, number> = {};
  let totalInterventions = 0;
  let runsWithInterventions = 0;

  for (const run of runs) {
    const breakdown = run.interventionBreakdown || {};
    let runTotal = 0;
    for (const [type, count] of Object.entries(breakdown)) {
      byType[type] = (byType[type] || 0) + count;
      runTotal += count;
      if (count > 0) {
        runsPerType[type] = (runsPerType[type] || 0) + 1;
      }
    }
    totalInterventions += runTotal;
    if (runTotal > 0) runsWithInterventions++;
  }

  return {
    byType,
    totalInterventions,
    runsPerType,
    meanInterventionsPerRun: runs.length > 0 ? totalInterventions / runs.length : 0,
  };
}

// === 4. 统计每轮检测器触发（per-round） ===
function computePerRoundStats(runs: RunData[]): Record<string, { totalTriggers: number; roundCounts: number[] }> {
  const result: Record<string, { totalTriggers: number; roundCounts: number[] }> = {};
  for (const det of DETECTOR_TYPES) {
    result[det] = { totalTriggers: 0, roundCounts: [] };
  }

  for (const run of runs) {
    if (!run.rounds) continue;
    const perRoundCount: Record<string, number> = {};
    for (const det of DETECTOR_TYPES) perRoundCount[det] = 0;

    for (const round of run.rounds) {
      if (!round.issues) continue;
      for (const issue of round.issues) {
        if (DETECTOR_TYPES.includes(issue as any)) {
          perRoundCount[issue]++;
          result[issue].totalTriggers++;
        }
      }
    }
    for (const det of DETECTOR_TYPES) {
      result[det].roundCounts.push(perRoundCount[det]);
    }
  }

  return result;
}

// === 5. 共触发矩阵 ===
function computeCooccurrenceMatrix(runs: RunData[]): number[][] {
  const n = DETECTOR_TYPES.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (const run of runs) {
    const issues = new Set(run.issuesDetected || []);
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (issues.has(DETECTOR_TYPES[i]) && issues.has(DETECTOR_TYPES[j])) {
          matrix[i][j]++;
        }
      }
    }
  }
  return matrix;
}

// === 6. 统计函数 ===
function mean(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

function pearsonCorr(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return NaN;
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return NaN;
  return num / Math.sqrt(dx * dy);
}

// === 7. 生成报告 ===
function generateReport(
  allStats: Record<string, DetectorStats>,
  interventionStats: ReturnType<typeof computeInterventionStats>,
  perRoundStats: ReturnType<typeof computePerRoundStats>,
  cooccurrence: number[][],
  byTask: Record<string, { runs: RunData[]; stats: Record<string, DetectorStats> }>,
  totalRuns: number
): string {
  const lines: string[] = [];
  lines.push('# 检测器经验统计报告（P0.2 选项 A）');
  lines.push('');
  lines.push('> **状态**：AI-assisted analysis，pending human verification。');
  lines.push('> **数据范围**：同步引擎 runs（data/ + data_crisis/ + data_supplier/），共 ' + totalRuns + ' runs。');
  lines.push('> **不含**：异步引擎 runs（async 不保存 messages）；3 个 MAST 检测器（FM-2.4/2.5/2.6）——实现于 2026-07-20 之后未重跑任何实验，触发次数为 0。');
  lines.push('> **准则**：以假装理解为耻，以诚实无知为荣。所有数字直接来自 JSON 数据文件。');
  lines.push('');
  lines.push('---');
  lines.push('');

  // === §1 总体触发率 ===
  lines.push('## 1. 检测器触发率（per-run）');
  lines.push('');
  lines.push('每个 run 的 `issuesDetected` 字段是去重后的检测器列表（不是每轮触发次数）。');
  lines.push('');
  lines.push('| 检测器 | 触发 runs | 总 runs | 触发率 | 触发时 τ (mean±std) | 未触发时 τ (mean±std) | Δτ |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const det of DETECTOR_TYPES) {
    const s = allStats[det];
    const tauT = s.tausWhenTriggered;
    const tauN = s.tausWhenNotTriggered;
    const dtau = tauT.length > 0 && tauN.length > 0 ? mean(tauT) - mean(tauN) : NaN;
    lines.push(`| ${det} | ${s.triggerCount} | ${s.totalRuns} | ${(s.triggerRate * 100).toFixed(1)}% | ${tauT.length > 0 ? mean(tauT).toFixed(3) + '±' + std(tauT).toFixed(3) : 'N/A'} | ${tauN.length > 0 ? mean(tauN).toFixed(3) + '±' + std(tauN).toFixed(3) : 'N/A'} | ${isNaN(dtau) ? 'N/A' : dtau.toFixed(3)} |`);
  }
  lines.push('');

  // === §2 每轮触发次数 ===
  lines.push('## 2. 每轮触发次数（per-round）');
  lines.push('');
  lines.push('统计 `rounds[].issues` 字段中每个检测器的总触发次数（含重复）。');
  lines.push('');
  lines.push('| 检测器 | 总触发次数 | 平均每 run 触发次数 |');
  lines.push('|---|---|---|');
  for (const det of DETECTOR_TYPES) {
    const s = perRoundStats[det];
    const avg = s.roundCounts.length > 0 ? mean(s.roundCounts) : NaN;
    lines.push(`| ${det} | ${s.totalTriggers} | ${isNaN(avg) ? 'N/A' : avg.toFixed(2)} |`);
  }
  lines.push('');

  // === §3 共触发矩阵 ===
  lines.push('## 3. 共触发矩阵');
  lines.push('');
  lines.push('两个检测器在同一 run 中同时触发的次数（对角线为单检测器触发次数）。');
  lines.push('');
  let header = '| |';
  for (const det of DETECTOR_TYPES) header += ` ${det} |`;
  lines.push(header);
  let sep = '|---|';
  for (let i = 0; i < DETECTOR_TYPES.length; i++) sep += '---|';
  lines.push(sep);
  for (let i = 0; i < DETECTOR_TYPES.length; i++) {
    let row = `| ${DETECTOR_TYPES[i]} |`;
    for (let j = 0; j < DETECTOR_TYPES.length; j++) {
      row += ` ${cooccurrence[i][j]} |`;
    }
    lines.push(row);
  }
  lines.push('');

  // === §4 干预类型分布 ===
  lines.push('## 4. 干预类型分布');
  lines.push('');
  lines.push(`总干预次数：${interventionStats.totalInterventions}（${totalRuns} runs，平均 ${interventionStats.meanInterventionsPerRun.toFixed(2)} 次/run）`);
  lines.push('');
  lines.push('| 干预类型 | 总次数 | 占比 | 触发 runs | runs 占比 |');
  lines.push('|---|---|---|---|---|');
  for (const itype of INTERVENTION_TYPES) {
    const count = interventionStats.byType[itype] || 0;
    const runs = interventionStats.runsPerType[itype] || 0;
    const pct = interventionStats.totalInterventions > 0 ? (count / interventionStats.totalInterventions * 100) : 0;
    const runPct = totalRuns > 0 ? (runs / totalRuns * 100) : 0;
    lines.push(`| ${itype} | ${count} | ${pct.toFixed(1)}% | ${runs} | ${runPct.toFixed(1)}% |`);
  }
  lines.push('');

  // === §5 分任务统计 ===
  lines.push('## 5. 分任务触发率');
  lines.push('');
  lines.push('| 任务 | 总 runs | echo_chamber | authority_bias | polarization | premature_consensus |');
  lines.push('|---|---|---|---|---|---|');
  for (const [task, { runs, stats }] of Object.entries(byTask)) {
    let row = `| ${task} | ${runs.length} |`;
    for (const det of DETECTOR_TYPES) {
      const s = stats[det];
      row += ` ${s.triggerCount}/${s.totalRuns} (${(s.triggerRate * 100).toFixed(1)}%) |`;
    }
    lines.push(row);
  }
  lines.push('');

  // === §6 检测器触发与最终 τ 的相关性 ===
  lines.push('## 6. 检测器触发次数与最终 τ 的相关性');
  lines.push('');
  lines.push('对每个检测器，计算"该检测器在每 run 中的触发次数（per-round 总和）"与"该 run 的最终 τ"的 Pearson 相关系数。');
  lines.push('');
  lines.push('| 检测器 | n | Pearson r | 含义 |');
  lines.push('|---|---|---|---|');
  // 需要重新计算每 run 触发次数
  for (const det of DETECTOR_TYPES) {
    const triggerCounts: number[] = [];
    const taus: number[] = [];
    // 重新从 byTask 收集
    for (const { runs } of Object.values(byTask)) {
      for (const run of runs) {
        let count = 0;
        if (run.rounds) {
          for (const round of run.rounds) {
            if (round.issues) {
              for (const issue of round.issues) {
                if (issue === det) count++;
              }
            }
          }
        }
        triggerCounts.push(count);
        taus.push(run.kendallTau);
      }
    }
    const r = pearsonCorr(triggerCounts, taus);
    const interpretation = isNaN(r) ? '数据不足' :
      Math.abs(r) < 0.1 ? '几乎无相关' :
      Math.abs(r) < 0.3 ? '弱相关' :
      Math.abs(r) < 0.5 ? '中等相关' :
      '强相关';
    lines.push(`| ${det} | ${triggerCounts.length} | ${isNaN(r) ? 'N/A' : r.toFixed(3)} | ${interpretation} (${r < 0 ? '负相关：触发越多 τ 越低' : r > 0 ? '正相关' : '无相关'}) |`);
  }
  lines.push('');

  // === §7 关键诚实声明 ===
  lines.push('## 7. 局限与诚实声明');
  lines.push('');
  lines.push('1. **数据范围限制**：本统计仅覆盖同步引擎 runs（' + totalRuns + ' runs），不含异步引擎 80 runs（async 数据格式不保存 messages，无法事后补跑检测器）。');
  lines.push('');
  lines.push('2. **MAST 检测器完全缺失**：3 个 MAST 检测器（FM-2.4 信息隐藏 / FM-2.5 忽略输入 / FM-2.6 推理-行动不匹配）实现于 2026-07-20，**之后未重跑任何实验**。在当前 ' + totalRuns + ' runs 中，MAST 检测器触发次数为 0。论文中宣称的"5.5/14 MAST 覆盖（39.3%）"目前**仅为设计值，无经验验证**。');
  lines.push('');
  lines.push('3. **检测器无独立 ground truth**：本统计只能报告"检测器触发了多少次"，无法报告"触发是否正确"（即无 false positive / false negative 率）。要做 FP/FN 分析需要人工标注每个 round 的真实偏差状态，留作后续工作。');
  lines.push('');
  lines.push('4. **detect-only 模式的检测器统计**：M&A 任务包含 `ma_detect-only_*` runs，这些 runs 启用检测但不触发干预。它们的 `issuesDetected` 字段仍记录检测器触发，被本统计包含。这可能导致"检测器触发率"略高于"干预率"。');
  lines.push('');
  lines.push('5. **相关性非因果性**：§6 的 Pearson r 只表明统计共变，不表明检测器触发导致 τ 降低。可能的混淆变量：任务难度（难任务→更多偏差→更低 τ）。');
  lines.push('');
  lines.push('6. **AI-assisted 草稿**：本报告由 AI 协助生成，统计推断（如相关性解释）需人类合作者复核。');
  lines.push('');

  // === §8 论文宣称对照 ===
  lines.push('## 8. 论文宣称对照');
  lines.push('');
  lines.push('| 论文宣称（PAPER_DRAFT.md）| 本统计结果 | 状态 |');
  lines.push('|---|---|---|');
  lines.push('| "seven bias detectors — four classical ... and three aligned to MAST" | 4 个经典检测器有经验触发率；3 个 MAST 检测器触发次数 = 0 | ⚠️ 需修正：MAST 部分为设计值 |');
  lines.push('| "5.5/14 MAST modes (39.3%)" | 仅设计层面覆盖；经验触发率 = 0/N | ⚠️ 需明确标注 design-time |');
  lines.push('| "FC2 coverage rising from 0% to 50%" | 同上，仅设计层面 | ⚠️ 需明确标注 design-time |');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('**版本**：v0.1（2026-07-20）');
  lines.push('**作者**：AI-assisted analysis');
  lines.push('**数据**：' + totalRuns + ' sync-engine runs (data/ + data_crisis/ + data_supplier/)');
  lines.push('**准则**：以假装理解为耻，以诚实无知为荣');

  return lines.join('\n');
}

// === 主流程 ===
async function main() {
  console.log('[1/4] 加载数据...');
  const { runs, byTask: rawByTask } = loadAllRuns();
  console.log(`  共加载 ${runs.length} runs`);

  console.log('[2/4] 计算检测器统计...');
  const allStats = computeDetectorStats(runs);

  const byTask: Record<string, { runs: RunData[]; stats: Record<string, DetectorStats> }> = {};
  for (const [task, taskRuns] of Object.entries(rawByTask)) {
    byTask[task] = { runs: taskRuns, stats: computeDetectorStats(taskRuns) };
  }

  console.log('[3/4] 计算干预统计与共触发矩阵...');
  const interventionStats = computeInterventionStats(runs);
  const perRoundStats = computePerRoundStats(runs);
  const cooccurrence = computeCooccurrenceMatrix(runs);

  console.log('[4/4] 生成报告...');
  const report = generateReport(allStats, interventionStats, perRoundStats, cooccurrence, byTask, runs.length);

  const outPath = path.join(baseDir, 'detector_validation_report.md');
  fs.writeFileSync(outPath, report, 'utf8');
  console.log(`\n报告已写入: ${outPath}`);
  console.log(`\n=== 摘要 ===`);
  console.log(`总 runs: ${runs.length}`);
  console.log(`\n检测器触发率:`);
  for (const det of DETECTOR_TYPES) {
    const s = allStats[det];
    console.log(`  ${det}: ${s.triggerCount}/${s.totalRuns} = ${(s.triggerRate * 100).toFixed(1)}%`);
  }
  console.log(`\n干预分布:`);
  for (const itype of INTERVENTION_TYPES) {
    const count = interventionStats.byType[itype] || 0;
    console.log(`  ${itype}: ${count}`);
  }
  console.log(`\n⚠️ 3 个 MAST 检测器 (FM-2.4/2.5/2.6): 触发次数 = 0（实现后未重跑实验）`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
