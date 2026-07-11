/**
 * Observation V2 comparison test: run 2 full-mode Invest experiments
 * with new itemBeliefs prompt, compare with cached V1 data.
 * Usage: npx tsx experiments/v2/test_obs_v2.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import { TASK_INVEST } from "./task_invest";
import type { LLMConfig } from "../../src/lib/llm/providers";
import type { TaskConfig } from "../lunar_survival/config";
import * as fs from "fs";
import * as path from "path";

const LLM_CONFIG: LLMConfig = { provider: "deepseek" as const, model: "deepseek-chat", temperature: 0.2 };
const PARAMS = { maxRounds: 5, convergenceThreshold: 0.06 };

function createAgents(task: TaskConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const sp =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n` +
      `讨论规则：\n1. 主动分享你的独有知识\n2. 对他人的判断提出质疑\n3. 最终以JSON格式给出你的判断\n\n` +
      `4. 最终以JSON格式给出你的判断，格式：\n` +
      `{"reasoning":"你的分析","evidence":["证据1","证据2"],"belief":-1到1,"confidence":0到100,` +
      `"nextOpinion":"下一步方向","referencedAgents":["a2"],` +
      `"itemBeliefs":[{"item":"BetaCore (企业服务)","rank":1,"belief":0.8,"confidence":90},` +
      `{"item":"AlphaTech (AI芯片)","rank":2,"belief":0.3,"confidence":70},` +
      `{"item":"GammaEdge (边缘计算)","rank":3,"belief":-0.4,"confidence":60}]}\n\n` +
      `itemBeliefs中：rank为你认为的排名(1=最优)，belief为对该选项的独立偏好(-1=反对,1=支持)，confidence为置信度(0-100)`;
    return new CustomAgent(info.id, info.name, info.role, "default", LLM_CONFIG, sp) as unknown as DiscussionAgent;
  });
}

function extractRanking(
  decision: string,
  itemNames: string[],
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>
): string[] {
  // V2: aggregate itemBeliefs
  if (itemBeliefs && itemBeliefs.length > 0) {
    const itemRanks = new Map<string, number[]>();
    for (const ib of itemBeliefs) {
      if (!itemRanks.has(ib.item)) itemRanks.set(ib.item, []);
      itemRanks.get(ib.item)!.push(ib.rank);
    }
    const avgRanks = itemNames.map(name => {
      const ranks = itemRanks.get(name);
      return { name, avgRank: ranks && ranks.length > 0 ? ranks.reduce((a,b)=>a+b,0)/ranks.length : Infinity };
    });
    avgRanks.sort((a, b) => a.avgRank - b.avgRank);
    return avgRanks.map(r => r.name);
  }
  // V1 fallback
  const positions = itemNames.map(name => {
    const shortName = name.split("(")[0]?.trim() || name;
    const idx = decision.indexOf(shortName);
    return { name, pos: idx >= 0 ? idx : Infinity };
  });
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map(p => p.name);
}

function kendallTau(gt: Record<string, number>, extracted: string[]): number {
  const items = Object.keys(gt), n = items.length;
  if (n < 2) return 0;
  const gtRank = new Map<string, number>();
  for (const [item, rank] of Object.entries(gt)) gtRank.set(item, rank);
  const x: number[] = [], y: number[] = [];
  for (const item of items) {
    x.push(gtRank.get(item) ?? 0);
    const ei = extracted.indexOf(item);
    y.push(ei >= 0 ? ei + 1 : n + 1);
  }
  let c = 0, d = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (x[i] === x[j] || y[i] === y[j]) continue;
    if ((x[i] - x[j]) * (y[i] - y[j]) > 0) c++; else d++;
  }
  return c + d === 0 ? 0 : (c - d) / (c + d);
}

async function main() {
  console.log("=== Observation V2 Comparison Test ===\n");

  // Load V1 baseline stats
  const v1Summary = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data_invest/summary.json"), "utf-8"));
  const v1Full = v1Summary.results.filter((r: any) => r.ablation === "full");
  const v1TauMean = v1Full.reduce((s: number, r: any) => s + r.kendallTau, 0) / v1Full.length;
  const v1QMean = v1Full.reduce((s: number, r: any) => s + r.decisionQuality, 0) / v1Full.length;
  console.log(`V1 (old prompt, n=${v1Full.length}): τ=${v1TauMean.toFixed(3)}, Q=${v1QMean.toFixed(1)}`);

  // Run 2 V2 experiments
  const itemNames = Object.keys(TASK_INVEST.correctAnswer);
  const v2Results: { tau: number; q: number; hasItemBeliefs: boolean; itemBeliefCount: number }[] = [];

  for (let i = 0; i < 2; i++) {
    console.log(`\nV2 run ${i + 1}/2...`);
    const agents = createAgents(TASK_INVEST);
    const engine = new DiscussionEngine({
      maxRounds: PARAMS.maxRounds,
      convergenceThreshold: PARAMS.convergenceThreshold,
      governanceMode: "full",
    });

    const taskObj = {
      id: `v2test_${i}`, description: TASK_INVEST.title,
      type: "discussion" as const, createdAt: new Date().toISOString(),
      content: TASK_INVEST.sharedBriefing,
    };

    const t0 = Date.now();
    const result = await engine.run(agents, taskObj);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // Collect itemBeliefs from all rounds
    const allItemBeliefs = result.roundResults.flatMap(r => r.opinions).flatMap(o => o.itemBeliefs || []);
    const hasItemBeliefs = allItemBeliefs.length > 0;

    // V2 extraction
    const decision = result.finalDecision || result.roundResults.flatMap(r => r.opinions.map(o => o.reasoning)).join("\n");
    const v2Ranking = extractRanking(decision, itemNames, allItemBeliefs);
    const tau = kendallTau(TASK_INVEST.correctAnswer, v2Ranking);

    console.log(`  Rounds: ${result.totalRounds} | Time: ${elapsed}s | τ=${tau.toFixed(3)} | Q=${Math.round(((tau+1)/2)*100)}`);
    console.log(`  itemBeliefs: ${hasItemBeliefs ? '✅ ' + allItemBeliefs.length + ' extracted' : '❌ none'}`);

    if (hasItemBeliefs && allItemBeliefs.length > 0) {
      // Show sample
      const sample = allItemBeliefs[0];
      console.log(`  Sample: ${sample.item} rank=${sample.rank} belief=${sample.belief.toFixed(2)} conf=${sample.confidence}`);
    }

    v2Results.push({ tau, q: Math.round(((tau+1)/2)*100), hasItemBeliefs, itemBeliefCount: allItemBeliefs.length });
  }

  console.log("\n=== Summary ===");
  const v2TauMean = v2Results.reduce((s, r) => s + r.tau, 0) / v2Results.length;
  const v2QMean = v2Results.reduce((s, r) => s + r.q, 0) / v2Results.length;
  console.log(`V1 (n=${v1Full.length}): τ=${v1TauMean.toFixed(3)}, Q=${v1QMean.toFixed(1)}`);
  console.log(`V2 (n=${v2Results.length}): τ=${v2TauMean.toFixed(3)}, Q=${v2QMean.toFixed(1)} | itemBeliefs: ${v2Results.every(r => r.hasItemBeliefs) ? '✅' : '❌'}`);
  console.log(`\nV2 individual: ${v2Results.map(r => `τ=${r.tau.toFixed(3)}`).join(", ")}`);
  console.log("\nDone.");
}

main().catch(e => console.error(e));
