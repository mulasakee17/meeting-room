/**
 * LLM 模式验证 — 用 DeepSeek API 重跑关键假设
 *
 * 验证目标:
 *   1. LLM 模式整体准确率能否超越 baseline (永远猜涨 57.6%)
 *   2. 分歧→反转信号在 LLM 模式下是否更强
 *   3. 因子一致性信号的 LLM vs Template 对比
 *   4. Narrative Agent 优势是否在 LLM 模式下复现
 *
 * 事件选择: 30 个, 覆盖 all 8 种分类 + UP/DOWN/NEUTRAL 均衡分布
 * 预估成本: ~30 DeepSeek API 调用 ≈ $0.01-0.03
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { EVENTS, UnifiedEvent } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";
import { V9SwarmResult } from "../src/lib/agents/v9/types";

// 策略选择: 每种分类取 3-4 个代表性事件, UP/DOWN 均衡
const SELECTED: number[] = [
  // financial_crisis — 经典多空分水岭
  0,   // 1987 黑色星期一 (UP — V型反弹)
  62,  // 2008 雷曼 (DOWN — 真危机)
  4,   // 1997 亚洲金融危机 (UP)
  129, // 2011 美国债务上限 (UP)
  // bank_crisis
  140, // 2023 SVB (DOWN — 银行挤兑)
  70,  // 1995 巴林银行 (UP — 单一机构)
  144, // 2023 第一共和银行 (UP)
  // war_geopolitical
  2,   // 1991 苏联解体 (UP)
  13,  // 2003 伊拉克战争 (UP)
  178, // 2022 俄乌战争 (DOWN)
  // pandemic
  131, // 2020 COVID 崩盘 (DOWN)
  132, // 2020 COVID 反弹 (UP)
  7,   // 2001 911 (UP)
  // tech_narrative
  6,   // 2000 互联网泡沫顶 (DOWN)
  146, // 2024 AI泡沫恐慌 (DOWN)
  54,  // 2018 科技股暴跌 (UP)
  // regulatory_policy
  179, // 2022 美联储加息 (DOWN)
  98,  // 2013 Taper Tantrum (UP)
  184, // 2023 加息暂停 (UP)
  // commodity
  9,   // 2001 安然 (DOWN)
  154, // 2020 负油价 (UP)
  // flash_crash
  185, // 2018 Volmageddon (UP)
  201, // 2010 Flash Crash (UP)
  // 额外: 一些 tricky 事件
  23,  // 2008 贝尔斯登 (DOWN)
  68,  // 2016 英国脱欧 (UP)
  98,  // duplicate, skip
  180, // 2022 英国养老金危机 (DOWN)
  24,  // 2008 AIG (DOWN)
];

// 去重 + 排序
const unique = [...new Set(SELECTED)].sort((a, b) => a - b);
const sample = unique.map(i => EVENTS[i]).filter(Boolean);

console.log("=".repeat(64));
console.log("🧬 LLM 模式验证 — DeepSeek API");
console.log("=".repeat(64));
console.log(`样本: ${sample.length} 事件, 8 种分类全覆盖`);
console.log(`实际分布: UP=${sample.filter(e=>e.actual==='up').length} DOWN=${sample.filter(e=>e.actual==='down').length} NEUTRAL=${sample.filter(e=>e.actual==='neutral').length}`);
console.log(`API: ${process.env.DEEPSEEK_API_KEY ? 'DeepSeek ✓' : '❌ 未配置'}\n`);

interface RunResult {
  event: UnifiedEvent;
  llm: V9SwarmResult;
  template: V9SwarmResult;
  llmAccuracy: boolean;
  templateAccuracy: boolean;
  llmBeliefStd: number;
  templateBeliefStd: number;
  llmFactorStd: number;
  templateFactorStd: number;
  agentBeliefsLLM: Record<string, number>;
  agentBeliefsTemplate: Record<string, number>;
}

async function main() {
  const results: RunResult[] = [];
  const start = Date.now();

  for (let i = 0; i < sample.length; i++) {
    const ev = sample[i];
    const pct = ((i + 1) / sample.length * 100).toFixed(0);

    process.stdout.write(`\r[${'█'.repeat(+pct/3)}${'░'.repeat(33-+pct/3)}] ${i+1}/${sample.length} ${ev.name.slice(0,30)}...`);

    const baseConfig = {
      news: ev.news,
      marketData: {
        vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
        hasPolicyResponse: ev.hasPolicy,
        hasLeverageDamage: ev.hasLeverage,
        hasSolvencyDamage: ev.hasSolvency,
      },
      rounds: 1,
      directionThreshold: -5 as number,
      ablation: {
        disableNeutralRule1: true,
        disableNeutralRule2_3: true,
        disableNeutralRule4: true,
      },
    };

    // 并行跑 LLM 和 Template
    const [llmResult, templateResult] = await Promise.all([
      runSwarmV9(baseConfig, true),   // LLM mode
      runSwarmV9(baseConfig, false),  // Template mode
    ]);

    const llmDir = llmResult.finalDecision.direction;
    const templateDir = templateResult.finalDecision.direction;

    // 因子标准差
    const llmFactors = llmResult.rounds[0]?.factorVector?.factors ?? [];
    const templateFactors = templateResult.rounds[0]?.factorVector?.factors ?? [];
    const calculateFactorStd = (factors: {category:string, value:number}[]) => {
      const vals = factors.filter(f=>f.category!=='uncertainty').map(f=>f.value);
      const m = vals.reduce((a,b)=>a+b,0)/vals.length;
      return Math.sqrt(vals.reduce((s,v)=>s+(v-m)**2,0)/vals.length);
    };

    // Agent beliefs
    const agentLLM: Record<string, number> = {};
    const agentTemplate: Record<string, number> = {};
    for (const [id, state] of Object.entries(llmResult.rounds[0]?.agents ?? {})) {
      agentLLM[id] = (state as any).belief;
    }
    for (const [id, state] of Object.entries(templateResult.rounds[0]?.agents ?? {})) {
      agentTemplate[id] = (state as any).belief;
    }

    results.push({
      event: ev,
      llm: llmResult,
      template: templateResult,
      llmAccuracy: (llmDir==='UP'&&ev.actual==='up')||(llmDir==='DOWN'&&ev.actual==='down'),
      templateAccuracy: (templateDir==='UP'&&ev.actual==='up')||(templateDir==='DOWN'&&ev.actual==='down'),
      llmBeliefStd: llmResult.finalDecision.beliefStd,
      templateBeliefStd: templateResult.finalDecision.beliefStd,
      llmFactorStd: calculateFactorStd(llmFactors),
      templateFactorStd: calculateFactorStd(templateFactors),
      agentBeliefsLLM: agentLLM,
      agentBeliefsTemplate: agentTemplate,
    });
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n⏱ 耗时: ${elapsed}s\n`);

  // ═══════════════════════════════════════════
  // 核心对比
  // ═══════════════════════════════════════════
  const llmCorrect = results.filter(r => r.llmAccuracy).length;
  const templateCorrect = results.filter(r => r.templateAccuracy).length;
  const llmAcc = (llmCorrect / results.length) * 100;
  const templateAcc = (templateCorrect / results.length) * 100;
  const alwaysUpCount = results.filter(r => r.event.actual === 'up').length;
  const baselineAcc = (alwaysUpCount / results.length) * 100;

  console.log("═".repeat(64));
  console.log("📊 核心指标: LLM vs Template");
  console.log("═".repeat(64));
  console.log(`              LLM      Template   永远猜涨`);
  console.log("─".repeat(48));
  console.log(`  准确率      ${llmAcc.toFixed(1)}%     ${templateAcc.toFixed(1)}%      ${baselineAcc.toFixed(1)}%`);
  console.log(`  vs 永远猜涨  ${(llmAcc-baselineAcc>=0?'+':'')+(llmAcc-baselineAcc).toFixed(1)}pp   ${(templateAcc-baselineAcc>=0?'+':'')+(templateAcc-baselineAcc).toFixed(1)}pp`);

  if (llmAcc > baselineAcc) {
    console.log(`\n🟢 LLM 模式超越 baseline! 不是随机噪声。`);
  } else {
    console.log(`\n🔴 LLM 模式仍低于 baseline — 方向判断可能不是这个系统的强项。`);
  }

  // ═══════════════════════════════════════════
  // 假说 #1: 分歧→反转 (LLM 版)
  // ═══════════════════════════════════════════
  console.log("\n" + "═".repeat(64));
  console.log("🔬 #1: 分歧→反转 (LLM 模式)");
  console.log("═".repeat(64));

  // 按 LLM belief_std 中位数分组
  const sorted = [...results].sort((a,b) => a.llmBeliefStd - b.llmBeliefStd);
  const mid = Math.floor(sorted.length / 2);
  const lowDiv = sorted.slice(0, mid);
  const highDiv = sorted.slice(mid);

  const lowDown = lowDiv.filter(r => r.llm.finalDecision.direction === 'DOWN');
  const highDown = highDiv.filter(r => r.llm.finalDecision.direction === 'DOWN');
  const lowRev = lowDown.filter(r => r.event.actual === 'up').length;
  const highRev = highDown.filter(r => r.event.actual === 'up').length;
  const lowRevRate = lowDown.length > 0 ? (lowRev/lowDown.length)*100 : 0;
  const highRevRate = highDown.length > 0 ? (highRev/highDown.length)*100 : 0;

  console.log(`  低分歧 (std<${sorted[mid]?.llmBeliefStd.toFixed(0)}) 反转率: ${lowRevRate.toFixed(0)}% (${lowRev}/${lowDown.length})`);
  console.log(`  高分歧 (std>${sorted[mid]?.llmBeliefStd.toFixed(0)}) 反转率: ${highRevRate.toFixed(0)}% (${highRev}/${highDown.length})`);
  console.log(`  差异: ${(highRevRate-lowRevRate).toFixed(0)}pp`);

  if (highRevRate - lowRevRate > 15) {
    console.log(`  🟢 LLM 模式下分歧→反转假说依然成立`);
  } else {
    console.log(`  🔴 LLM 模式下分歧→反转假说不成立 — 模板模式的发现可能是 artifact`);
  }

  // ═══════════════════════════════════════════
  // 假说 #3: Agent 排名 (LLM 版)
  // ═══════════════════════════════════════════
  console.log("\n" + "═".repeat(64));
  console.log("🔬 Agent 个体准确率: LLM vs Template");
  console.log("═".repeat(64));

  const agentIds = ["trend","media","contrarian","retail","value","quant","institution","panic","policy"];

  function calcAgentAcc(beliefs: Record<string, Record<string,number>>, events: UnifiedEvent[]) {
    const stats: Record<string, {correct:number; total:number}> = {};
    for (const id of agentIds) stats[id] = {correct:0, total:0};
    for (let i = 0; i < events.length; i++) {
      const b = beliefs[i];
      if (!b) continue;
      const actual = events[i].actual;
      for (const id of agentIds) {
        const belief = b[id];
        if (belief === undefined) continue;
        const dir = belief > 0 ? 'UP' : belief < 0 ? 'DOWN' : 'NEUTRAL';
        if (dir === 'NEUTRAL') continue;
        stats[id].total++;
        if ((dir==='UP'&&actual==='up')||(dir==='DOWN'&&actual==='down')) stats[id].correct++;
      }
    }
    return stats;
  }

  const llmAgentBeliefs = results.map(r => r.agentBeliefsLLM);
  const templateAgentBeliefs = results.map(r => r.agentBeliefsTemplate);
  const llmAgentStats = calcAgentAcc(llmAgentBeliefs as any, results.map(r=>r.event));
  const templateAgentStats = calcAgentAcc(templateAgentBeliefs as any, results.map(r=>r.event));

  console.log(` Agent         LLM准确率   Template准确率   变化`);
  console.log("─".repeat(55));

  // 按 LLM 准确率排序
  const ranked = [...agentIds].sort((a,b) => {
    const aAcc = llmAgentStats[a].total>0 ? llmAgentStats[a].correct/llmAgentStats[a].total : 0;
    const bAcc = llmAgentStats[b].total>0 ? llmAgentStats[b].correct/llmAgentStats[b].total : 0;
    return bAcc - aAcc;
  });

  let narrativeAcc = 0, narrativeCount = 0;
  let fundamentalAcc = 0, fundamentalCount = 0;
  const narrativeAgents = ['trend','media','retail','contrarian'];
  const fundamentalAgents = ['value','quant','institution','panic','policy'];

  for (const id of ranked) {
    const l = llmAgentStats[id];
    const t = templateAgentStats[id];
    const lAcc = l.total > 0 ? (l.correct/l.total*100) : null;
    const tAcc = t.total > 0 ? (t.correct/t.total*100) : null;
    const delta = (lAcc !== null && tAcc !== null) ? (lAcc - tAcc) : null;

    if (lAcc !== null && narrativeAgents.includes(id)) { narrativeAcc += lAcc; narrativeCount++; }
    if (lAcc !== null && fundamentalAgents.includes(id)) { fundamentalAcc += lAcc; fundamentalCount++; }

    console.log(
      ` ${id.padEnd(13)} ${lAcc!==null?(lAcc.toFixed(0)+'%').padStart(5):' N/A'.padStart(5)}     ${tAcc!==null?(tAcc.toFixed(0)+'%').padStart(5):' N/A'.padStart(5)}       ${delta!==null?((delta>=0?'+':'')+delta.toFixed(0)+'pp').padStart(6):'  —'.padStart(6)}`
    );
  }

  const nAvg = narrativeCount > 0 ? narrativeAcc / narrativeCount : 0;
  const fAvg = fundamentalCount > 0 ? fundamentalAcc / fundamentalCount : 0;
  console.log(`\n  Narrative 组均值: ${nAvg.toFixed(0)}%  |  基本面组均值: ${fAvg.toFixed(0)}%  |  差异: ${(nAvg-fAvg>=0?'+':'')+(nAvg-fAvg).toFixed(0)}pp`);

  if (nAvg > fAvg + 5) {
    console.log(`  🟢 Narrative Agent 优势在 LLM 模式下复现!`);
  } else {
    console.log(`  🔴 Narrative Agent 优势在 LLM 模式下消失`);
  }

  // ═══════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════
  console.log("\n" + "═".repeat(64));
  console.log("🧾 LLM 验证总结");
  console.log("═".repeat(64));
  console.log(`  样本: ${results.length} 事件, 耗时 ${elapsed}s`);
  console.log(`  LLM 准确率: ${llmAcc.toFixed(1)}% vs Template ${templateAcc.toFixed(1)}% vs Baseline ${baselineAcc.toFixed(1)}%`);
  console.log(`  分歧→反转差异: ${(highRevRate-lowRevRate).toFixed(0)}pp (模板模式 29pp)`);
  console.log(`  Narrative > 基本面: ${(nAvg-fAvg>=0?'+':'')+(nAvg-fAvg).toFixed(0)}pp (模板模式 ~10pp)`);

  // 事件级的 LLM vs Template 分歧
  const bothRight = results.filter(r => r.llmAccuracy && r.templateAccuracy).length;
  const bothWrong = results.filter(r => !r.llmAccuracy && !r.templateAccuracy).length;
  const llmOnly = results.filter(r => r.llmAccuracy && !r.templateAccuracy).length;
  const templateOnly = results.filter(r => !r.llmAccuracy && r.templateAccuracy).length;

  console.log(`\n  两者都对: ${bothRight} | 两者都错: ${bothWrong} | 仅LLM对: ${llmOnly} | 仅Template对: ${templateOnly}`);
  console.log(`  LLM 净优势: ${llmOnly - templateOnly > 0 ? '+' : ''}${llmOnly - templateOnly} 个事件`);
}

main().catch(console.error);
