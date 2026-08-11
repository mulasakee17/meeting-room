/**
 * 一次性审计脚本（非实验）：量化 statsShared.extractRanking 位置回退（P0c）
 * 对 E12 系列数据 finalRanking/finalAccuracy 的实际影响。
 *
 * 方法：对每个 run 的 lastRound itemBeliefs，模拟 Runner 流程
 *   （先 normalizeItemName 归一化 → 再 extractRanking），
 *   对比「含位置回退」与「禁用位置回退」的 finalRanking/finalAccuracy。
 * 不调用 LLM，纯本地计算。
 */
import * as fs from "fs";
import * as path from "path";
import { loadAllConfigs } from "./tasks/hiddenbench/adapter";
import { extractRanking, normalizeItemName, kendallTau } from "../v2/statsShared";

/** 复制 extractRanking 核心逻辑，但跳过 263-297 位置回退块（P0c 审计用） */
function extractRankingNoFallback(
  _decision: string,
  itemNames: string[],
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>,
  searchKeys?: Record<string, string[]>,
): string[] {
  if (!itemBeliefs || itemBeliefs.length === 0) throw new Error("empty");
  const itemRanks = new Map<string, number[]>();
  for (const ib of itemBeliefs) {
    const normalized = normalizeItemName(ib.item, itemNames, searchKeys);
    if (normalized) {
      if (!itemRanks.has(normalized)) itemRanks.set(normalized, []);
      itemRanks.get(normalized)!.push(ib.rank);
    }
  }
  const avgRanks = itemNames.map(name => {
    const ranks = itemRanks.get(name);
    return { name, avgRank: ranks && ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : Infinity };
  });
  avgRanks.sort((a, b) => a.avgRank - b.avgRank);
  return avgRanks.map(r => r.name);
}

function main() {
  const rawDir = path.resolve(__dirname, "output");
  const tasks = loadAllConfigs(undefined, 4, "nohint");
  const taskByIndex = new Map<number, any>();
  tasks.forEach((t: any, i: number) => taskByIndex.set(i, t));

  let runsTotal = 0, hbRuns = 0, fallbackTriggered = 0, rankingChanged = 0, accChanged = 0;
  let accInflated = 0, accDeflated = 0;
  const changedList: Array<{ file: string; taskIdx: number; accWith: number; accNo: number; matchRate: number }> = [];
  const samples: Array<{ file: string; taskIdx: number; withFB: string; noFB: string; correct: string; accWith: number; accNo: number; matchRate: number }> = [];

  const dirs = ["e12", "e12_bc", "e12_crisis_v2", "e12_glm_xval", "e12_glm_more", "e12_glm_final", "e12_glm_verify", "e12_glm_scan", "e12_glm_hb", "e12_glm_hb2", "e12_glm_test", "e12_hb_task6", "e12_bc_fixed", "e12_crisis_v2_fixed"];
  for (const dir of dirs) {
    const files = fs.existsSync(path.join(rawDir, dir, "raw")) ? fs.readdirSync(path.join(rawDir, dir, "raw")).filter(f => f.endsWith(".json")) : [];
    for (const f of files) {
      runsTotal++;
      const m = f.match(/t(\d+)/);
      if (!m) continue; // crisis / 非 hiddenbench run
      const taskIdx = Number(m[1]);
      const task = taskByIndex.get(taskIdx);
      if (!task) { console.log(`  WARN no task ${taskIdx} for ${f}`); continue; }
      hbRuns++;
      const data = JSON.parse(fs.readFileSync(path.join(rawDir, dir, "raw", f), "utf-8"));
      const lastRound = data.roundOpinions?.[data.roundOpinions.length - 1];
      if (!lastRound) continue;
      const allItemBeliefs = (lastRound.opinions || []).flatMap((o: any) => o.itemBeliefs || []);
      if (allItemBeliefs.length === 0) continue;

      const itemNames = Object.keys(task.correctAnswer);
      const searchKeys = task.searchKeys;
      const correctItem = Object.entries(task.correctAnswer).find(([, r]: any) => r === 1)?.[0] as string;

      // 模拟 Runner:508-529 归一化（原地改名，与 E12 生成时一致）
      let normCount = 0;
      const beliefs = allItemBeliefs.map((ib: any) => {
        const norm = normalizeItemName(ib.item, itemNames, searchKeys);
        if (norm && norm !== ib.item) { normCount++; return { ...ib, item: norm }; }
        return ib;
      });

      // 含位置回退（原版）
      let withFB: string[] = [];
      try { withFB = extractRanking("", itemNames, beliefs, searchKeys); } catch { continue; }
      // 禁用位置回退
      const noFB = extractRankingNoFallback("", itemNames, beliefs, searchKeys);

      const accWith = correctItem && withFB[0] === correctItem ? 1 : 0;
      const accNo = correctItem && noFB[0] === correctItem ? 1 : 0;
      // 检测位置回退是否实际改变了排名
      const changed = JSON.stringify(withFB) !== JSON.stringify(noFB);
      const fbUsed = JSON.stringify(withFB) !== JSON.stringify(noFB);
      const matched = beliefs.filter((b: any) => normalizeItemName(b.item, itemNames, searchKeys)).length;
      const matchRate = beliefs.length ? matched / beliefs.length : 0;

      if (fbUsed) {
        fallbackTriggered++;
        if (changed) {
          rankingChanged++;
          if (accWith !== accNo) {
            accChanged++;
            if (accWith === 1 && accNo === 0) accInflated++;
            if (accWith === 0 && accNo === 1) accDeflated++;
            changedList.push({ file: `${dir}/${f}`, taskIdx, accWith, accNo, matchRate });
          }
          if (samples.length < 15) samples.push({ file: `${dir}/${f}`, taskIdx, withFB: withFB.join("|"), noFB: noFB.join("|"), correct: correctItem, accWith, accNo, matchRate });
        } else if (samples.length < 15) {
          // 回退触发了但没改变排序
          samples.push({ file: `${dir}/${f}`, taskIdx, withFB: withFB.join("|"), noFB: noFB.join("|"), correct: correctItem, accWith, accNo, matchRate });
        }
      }
    }
  }

  console.log(`E12 系列 hiddenbench runs: ${hbRuns}/${runsTotal}`);
  console.log(`位置回退改变 finalRanking 的 run: ${rankingChanged}`);
  console.log(`  其中 finalAccuracy 被翻转的 run: ${accChanged}`);
  console.log(`    accInflated(回退制造正确): ${accInflated}`);
  console.log(`    accDeflated(回退破坏正确): ${accDeflated}`);
  console.log("");
  const listPath = path.resolve(__dirname, "output", "_pos_fallback_affected.json");
  fs.writeFileSync(listPath, JSON.stringify(changedList, null, 2));
  console.log(`污染 run 清单已写入: ${listPath} (${changedList.length} runs)`);
  console.log("");
  console.log("=== 样本（含回退 vs 禁用回退）===");
  for (const s of samples) {
    console.log(`[t${s.taskIdx}] ${s.file}`);
    console.log(`   withFB: ${s.withFB}   acc=${s.accWith}`);
    console.log(`   noFB  : ${s.noFB}   acc=${s.accNo}`);
    console.log(`   correct=${s.correct}  matchRate=${(s.matchRate * 100).toFixed(0)}%`);
  }
}

main();
