/**
 * 信息盲区验证脚本
 *
 * 核心检查：每个agent如果只看自己的数据，会得出什么排名？
 * 如果有agent能独立得出正确答案 → 信息盲区失效 → 实验无效
 *
 * 验证逻辑：
 * 1. 提取每个agent knownItems中的数值排序
 * 2. 用agent所在维度的权重，计算该agent会得出的排名
 * 3. 对比正确排名——如果任何agent独立得出正确答案，说明信息盲区失效
 *
 * 运行：npx tsx experiments/v2/verifyBlindSpot.ts
 */

import { TASK_SUPPLIER } from "./task_supplier";

const WEIGHTS = { quality: 0.30, delivery: 0.25, cost: 0.20, tech: 0.15, finance: 0.10 };

const SUPPLIERS = {
  "供应商A-宏远工业": { quality: 0.20, delivery: 0.90, cost: 1.00, tech: 0.15, finance: 0.85 },
  "供应商B-稳达制造": { quality: 0.65, delivery: 0.85, cost: 0.75, tech: 0.55, finance: 0.80 },
  "供应商C-精研科技": { quality: 0.95, delivery: 0.72, cost: 0.50, tech: 0.90, finance: 0.65 },
  "供应商D-利通集团": { quality: 0.20, delivery: 0.35, cost: 0.70, tech: 0.15, finance: 0.30 },
  "供应商E-锐新科技": { quality: 0.90, delivery: 0.50, cost: 0.35, tech: 0.85, finance: 0.45 },
};

// 正确排名
const CORRECT_RANKING = ["供应商C-精研科技", "供应商B-稳达制造", "供应商E-锐新科技", "供应商A-宏远工业", "供应商D-利通集团"];

// Agent与维度的对应关系
const AGENT_DIM_MAP: Record<string, keyof typeof WEIGHTS> = {
  "a1": "cost",
  "a2": "delivery",
  "a3": "quality",
  "a4": "tech",
  "a5": "finance",
};

function main() {
  console.log("=".repeat(70));
  console.log("  信息盲区验证：每个agent独立能得出什么排名？");
  console.log("=".repeat(70));

  console.log("\n正确排名（综合加权）：");
  console.log(`  1. ${CORRECT_RANKING[0]}`);
  console.log(`  2. ${CORRECT_RANKING[1]}`);
  console.log(`  3. ${CORRECT_RANKING[2]}`);
  console.log(`  4. ${CORRECT_RANKING[3]}`);
  console.log(`  5. ${CORRECT_RANKING[4]}`);

  console.log("\n── 各agent独立排序（只看自己维度）──");

  let anyAgentGetsCorrect = false;

  for (const agent of TASK_SUPPLIER.agents) {
    const dim = AGENT_DIM_MAP[agent.id];
    const dimWeight = WEIGHTS[dim];

    // 提取该维度的排名
    const scores: [string, number][] = Object.entries(SUPPLIERS).map(([name, dims]) => [name, dims[dim]]);
    scores.sort((a, b) => b[1] - a[1]); // 降序，分数高=排名靠前

    const agentRanking = scores.map(([name]) => name);

    console.log(`\n${agent.name} (${agent.role}) — 掌握${dim}维度（权重${dimWeight}）：`);
    console.log(`  该维度排名：`);
    agentRanking.forEach((name, i) => {
      const score = SUPPLIERS[name as keyof typeof SUPPLIERS][dim];
      console.log(`    ${i + 1}. ${name} (${score.toFixed(2)})`);
    });

    // 对比正确排名
    let matchCount = 0;
    for (let i = 0; i < 5; i++) {
      if (agentRanking[i] === CORRECT_RANKING[i]) matchCount++;
    }

    console.log(`  与正确排名重合：${matchCount}/5`);

    // 计算 Kendall's τ
    const tau = kendallTau(agentRanking, CORRECT_RANKING);
    console.log(`  与正确排名的 Kendall's τ：${tau.toFixed(3)}`);

    if (matchCount === 5) {
      console.log(`  ⚠️ 警告：该agent独立得出了正确排名！信息盲区失效！`);
      anyAgentGetsCorrect = true;
    }
  }

  console.log("\n── 信息盲区验证结果 ──");

  if (anyAgentGetsCorrect) {
    console.log("❌ 信息盲区失效：有agent能独立得出正确排名");
    console.log("   → 实验无效，需要重新设计数据");
    process.exit(1);
  } else {
    console.log("✅ 信息盲区有效：没有agent能独立得出正确排名");
    console.log("   → agent必须通过信息交换才能得出正确答案");
    console.log("   → 实验设计有效，可以开跑");
  }

  // 额外验证：初始偏误
  console.log("\n── 初始偏误验证 ──");

  for (const agent of TASK_SUPPLIER.agents) {
    const dim = AGENT_DIM_MAP[agent.id];
    const dimRanking = Object.entries(SUPPLIERS)
      .sort((a, b) => b[1][dim] - a[1][dim])
      .map(([name]) => name);

    const biasMentionsA = agent.initialBias.includes("A") || agent.initialBias.includes("供应商A");
    const aIsFirstInDim = dimRanking[0].includes("A");

    if (aIsFirstInDim && biasMentionsA) {
      console.log(`  ${agent.name}: 该维度A排第1，偏误提到A → 制造锚定 ✅`);
    } else if (!aIsFirstInDim && biasMentionsA) {
      console.log(`  ${agent.name}: 该维度A排${dimRanking.findIndex(n => n.includes("A")) + 1}，偏误仍提A → ⚠️ 可能不合理`);
    } else if (aIsFirstInDim && !biasMentionsA) {
      console.log(`  ${agent.name}: 该维度A排第1，但偏误未提A → ⚠️ 错失锚定机会`);
    } else {
      console.log(`  ${agent.name}: 该维度A排${dimRanking.findIndex(n => n.includes("A")) + 1}，偏误未提A → 合理`);
    }
  }

  // 共识难度估计
  console.log("\n── 共识难度估计 ──");

  // 计算各维度的排序差异度
  const dimRankings: Record<string, string[]> = {};
  for (const dim of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    dimRankings[dim] = Object.entries(SUPPLIERS)
      .sort((a, b) => b[1][dim] - a[1][dim])
      .map(([name]) => name);
  }

  // 计算维度间排序的平均 τ
  const dims = Object.keys(dimRankings) as (keyof typeof WEIGHTS)[];
  let totalTau = 0;
  let pairCount = 0;
  for (let i = 0; i < dims.length; i++) {
    for (let j = i + 1; j < dims.length; j++) {
      const tau = kendallTau(dimRankings[dims[i]], dimRankings[dims[j]]);
      totalTau += tau;
      pairCount++;
    }
  }
  const avgTau = totalTau / pairCount;

  console.log(`  各维度排序间的平均 τ：${avgTau.toFixed(3)}`);
  if (avgTau < 0.3) {
    console.log(`  τ 较低 → 维度排序差异大 → 共识难度高 → 治理更有价值 ✅`);
  } else if (avgTau < 0.6) {
    console.log(`  τ 中等 → 维度排序有一定差异 → 共识有难度`);
  } else {
    console.log(`  τ 较高 → 维度排序相似 → 共识容易 → 治理价值有限 ⚠️`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("  结论：可以开跑");
  console.log("=".repeat(70));
}

function kendallTau(ranking1: string[], ranking2: string[]): number {
  const n = ranking1.length;
  if (n < 2) return 0;

  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pos1_i = ranking1.indexOf(ranking2[i]);
      const pos1_j = ranking1.indexOf(ranking2[j]);

      if ((pos1_i < pos1_j) === (i < j)) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }

  const n0 = n * (n - 1) / 2;
  return (concordant - discordant) / n0;
}

main();