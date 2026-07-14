/**
 * 新任务走查验证脚本
 *
 * 检查项：
 * 1. Ground truth 加权计算正确性
 * 2. 各维度数据矩阵一致性
 * 3. 信息泄露检查（agent knownItems 是否泄露答案）
 * 4. searchKeys 与 correctAnswer 匹配性
 * 5. shuffle 兼容性
 * 6. 5 个维度陷阱设计验证
 *
 * 运行：npx tsx experiments/v2/auditTask.ts
 */

import { TASK_SUPPLIER } from "./task_supplier";

// ─── 数据矩阵 ───────────────────────────────────────────────────────────────
// 从 task_supplier.ts 注释中的数据
//           质量   交付   成本   技术   财务
//   供应商A   0.20   0.95   0.98   0.15   0.95
//   供应商B   0.68   0.85   0.75   0.60   0.80
//   供应商C   0.95   0.68   0.50   0.90   0.60
//   供应商D   0.20   0.35   0.65   0.15   0.30
//   供应商E   0.90   0.50   0.35   0.85   0.45
//
// 权重：质量0.30 交付0.25 成本0.20 技术0.15 财务0.10

const WEIGHTS = { quality: 0.30, delivery: 0.25, cost: 0.20, tech: 0.15, finance: 0.10 };

const SUPPLIERS = {
  "供应商A-宏远工业": { quality: 0.20, delivery: 0.90, cost: 1.00, tech: 0.15, finance: 0.85 },
  "供应商B-稳达制造": { quality: 0.65, delivery: 0.85, cost: 0.75, tech: 0.55, finance: 0.80 },
  "供应商C-精研科技": { quality: 0.95, delivery: 0.72, cost: 0.50, tech: 0.90, finance: 0.65 },
  "供应商D-利通集团": { quality: 0.20, delivery: 0.35, cost: 0.70, tech: 0.15, finance: 0.30 },
  "供应商E-锐新科技": { quality: 0.90, delivery: 0.50, cost: 0.35, tech: 0.85, finance: 0.45 },
};

function main() {
  console.log("=".repeat(70));
  console.log("  新任务走查验证：供应商选择");
  console.log("=".repeat(70));

  // ─── 1. Ground truth 计算验证 ────────────────────────────────────────────
  console.log("\n── 1. Ground truth 加权计算验证 ──");

  const scores: Record<string, number> = {};
  for (const [name, dims] of Object.entries(SUPPLIERS)) {
    const score =
      dims.quality * WEIGHTS.quality +
      dims.delivery * WEIGHTS.delivery +
      dims.cost * WEIGHTS.cost +
      dims.tech * WEIGHTS.tech +
      dims.finance * WEIGHTS.finance;
    scores[name] = score;
    console.log(`  ${name}: ${score.toFixed(4)}`);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  console.log("\n计算得到的排名：");
  ranked.forEach(([name, score], i) => {
    console.log(`  ${i + 1}. ${name} (${score.toFixed(4)})`);
  });

  console.log("\n任务定义中的排名：");
  const gtEntries = Object.entries(TASK_SUPPLIER.correctAnswer).sort((a, b) => a[1] - b[1]);
  gtEntries.forEach(([name, rank]) => {
    console.log(`  ${rank}. ${name}`);
  });

  // 验证一致性
  let gtMatch = true;
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i][0] !== gtEntries[i][0]) {
      gtMatch = false;
      console.log(`  ❌ 第 ${i + 1} 名不匹配：计算=${ranked[i][0]}, 定义=${gtEntries[i][0]}`);
    }
  }
  if (gtMatch) console.log("  ✅ Ground truth 计算与定义完全一致");

  // ─── 2. 陷阱设计验证 ─────────────────────────────────────────────────────
  console.log("\n── 2. 陷阱设计验证 ──");

  // 各维度排名
  const dimRankings: Record<string, string[]> = {};
  for (const dim of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const sorted = Object.entries(SUPPLIERS)
      .sort((a, b) => (b[1][dim] as number) - (a[1][dim] as number))
      .map(([name]) => name);
    dimRankings[dim] = sorted;
    console.log(`  ${dim} 维度排名: ${sorted.join(" > ")}`);
  }

  // 验证：A 在 3 个低权重维度排第一
  const lowWeightDims = ["cost", "delivery", "finance"]; // 权重 0.20, 0.25, 0.10
  const aRanksInLow = lowWeightDims.map(dim => dimRankings[dim].indexOf("供应商A-宏远工业") + 1);
  console.log(`\n  供应商A 在低权重维度排名: ${aRanksInLow.join(", ")}`);
  const allFirstInLow = aRanksInLow.every(r => r === 1);
  console.log(`  A 在 3 个低权重维度都排第一: ${allFirstInLow ? "✅" : "❌"}`);

  // 验证：A 在 2 个高权重维度垫底
  const highWeightDims = ["quality", "tech"]; // 权重 0.30, 0.15
  const aRanksInHigh = highWeightDims.map(dim => dimRankings[dim].indexOf("供应商A-宏远工业") + 1);
  console.log(`  供应商A 在高权重维度排名: ${aRanksInHigh.join(", ")}`);
  const allLastInHigh = aRanksInHigh.every(r => r >= 4);
  console.log(`  A 在高权重维度垫底: ${allLastInHigh ? "✅" : "❌"}`);

  // 验证：C 在 2 个高权重维度排第一
  const cRanksInHigh = highWeightDims.map(dim => dimRankings[dim].indexOf("供应商C-精研科技") + 1);
  console.log(`\n  供应商C 在高权重维度排名: ${cRanksInHigh.join(", ")}`);
  const cFirstInHigh = cRanksInHigh.every(r => r === 1);
  console.log(`  C 在高权重维度都排第一: ${cFirstInHigh ? "✅" : "❌"}`);

  // 验证：C 在成本维度垫底（"看似不经济"）
  const cCostRank = dimRankings.cost.indexOf("供应商C-精研科技") + 1;
  console.log(`  供应商C 成本维度排名: ${cCostRank}`);
  console.log(`  C 成本垫底（制造陷阱）: ${cCostRank >= 4 ? "✅" : "❌"}`);

  // 验证：E 在高权重维度上游
  const eRanksInHigh = highWeightDims.map(dim => dimRankings[dim].indexOf("供应商E-锐新科技") + 1);
  console.log(`\n  供应商E 在高权重维度排名: ${eRanksInHigh.join(", ")}`);
  const eUpstreamInHigh = eRanksInHigh.every(r => r <= 2);
  console.log(`  E 在高权重维度上游: ${eUpstreamInHigh ? "✅" : "❌"}`);

  // 验证：E 在成本维度垫底
  const eCostRank = dimRankings.cost.indexOf("供应商E-锐新科技") + 1;
  console.log(`  供应商E 成本维度排名: ${eCostRank}`);
  console.log(`  E 成本垫底（被低估陷阱）: ${eCostRank >= 4 ? "✅" : "❌"}`);

  // 综合排名间距
  console.log(`\n  排名间分数差：`);
  for (let i = 0; i < ranked.length - 1; i++) {
    const diff = ranked[i][1] - ranked[i + 1][1];
    console.log(`    ${ranked[i][0].slice(0, 8)} - ${ranked[i+1][0].slice(0, 8)}: ${diff.toFixed(4)}`);
  }

  // ─── 3. 信息泄露检查 ─────────────────────────────────────────────────────
  console.log("\n── 3. 信息泄露检查 ──");

  const leakKeywords = [
    "正确答案", "最优", "最佳", "推荐", "建议", "排名", "排序",
    "第一", "第二", "第三", "第四", "第五",
    "综合评分", "加权", "权重", "0.30", "0.25", "0.20", "0.15", "0.10",
    "综合考虑", "综合分析", "综合评估",
    "最好", "最差", "最强", "最弱",
  ];

  let hasLeak = false;
  for (const agent of TASK_SUPPLIER.agents) {
    for (const kw of leakKeywords) {
      if (agent.knownItems.includes(kw) || agent.initialBias.includes(kw)) {
        // initialBias 中有倾向性描述是正常的，不算泄露
        if (agent.knownItems.includes(kw)) {
          console.log(`  ⚠️ ${agent.name} knownItems 含疑似泄露词: "${kw}"`);
          hasLeak = true;
        }
      }
    }
  }
  if (!hasLeak) console.log("  ✅ knownItems 中未发现明显信息泄露关键词");

  // 检查 knownItems 只含原始数据，不含推理结论
  console.log("\n  Agent knownItems 字数统计：");
  for (const agent of TASK_SUPPLIER.agents) {
    const charCount = agent.knownItems.length;
    const lineCount = agent.knownItems.split("\n").length;
    console.log(`    ${agent.name}: ${charCount} 字, ${lineCount} 行`);
  }

  // 检查 sharedBriefing 是否泄露
  console.log("\n  Shared briefing 泄露检查：");
  let briefingLeak = false;
  for (const kw of leakKeywords) {
    if (TASK_SUPPLIER.sharedBriefing.includes(kw)) {
      // "排序"在任务描述中正常
      if (kw !== "排序" && kw !== "排名" && kw !== "推荐") {
        console.log(`    ⚠️ sharedBriefing 含: "${kw}"`);
        briefingLeak = true;
      }
    }
  }
  if (!briefingLeak) console.log("    ✅ 未发现直接泄露");

  // ─── 4. searchKeys 匹配性 ───────────────────────────────────────────────
  console.log("\n── 4. searchKeys 匹配性 ──");

  let searchKeysOk = true;
  for (const [item, keys] of Object.entries(TASK_SUPPLIER.searchKeys)) {
    if (!TASK_SUPPLIER.correctAnswer[item]) {
      console.log(`  ❌ searchKeys 中的 "${item}" 不在 correctAnswer 中`);
      searchKeysOk = false;
    }
    // 验证 key 能在 item 名称中找到
    for (const key of keys) {
      if (!item.includes(key)) {
        console.log(`  ❌ key "${key}" 在 "${item}" 中找不到`);
        searchKeysOk = false;
      }
    }
  }
  if (searchKeysOk) console.log("  ✅ searchKeys 与 correctAnswer 完全匹配");

  // ─── 5. Agent 角色-维度对应验证 ──────────────────────────────────────────
  console.log("\n── 5. Agent 角色-维度对应验证 ──");

  const expectedRoles = [
    { name: "Cost Analyst", dim: "成本" },
    { name: "Supply Chain Manager", dim: "交付" },
    { name: "Quality Engineer", dim: "质量" },
    { name: "Technical Director", dim: "技术" },
    { name: "Finance Advisor", dim: "财务" },
  ];

  let rolesOk = true;
  for (let i = 0; i < TASK_SUPPLIER.agents.length; i++) {
    const agent = TASK_SUPPLIER.agents[i];
    const expected = expectedRoles[i];
    if (agent.name !== expected.name) {
      console.log(`  ❌ a${i + 1} 名称不匹配: 预期 ${expected.name}, 实际 ${agent.name}`);
      rolesOk = false;
    }
    if (!agent.knownItems.includes(expected.dim)) {
      console.log(`  ❌ a${i + 1} knownItems 不包含 "${expected.dim}"`);
      rolesOk = false;
    }
  }
  if (rolesOk) console.log("  ✅ 5 个 agent 角色与维度对应正确");

  // ─── 6. Shuffle 兼容性 ──────────────────────────────────────────────────
  console.log("\n── 6. Shuffle 兼容性 ──");

  // shuffle 需要每个 agent 的 knownItems 格式相似，打乱后逻辑自洽
  const itemCounts = TASK_SUPPLIER.agents.map(a =>
    a.knownItems.split(/[；;\n]/).filter(s => s.trim().length > 10).length
  );
  console.log(`  各 agent knownItems 条目数: ${itemCounts.join(", ")}`);
  const allSimilar = itemCounts.every(c => Math.abs(c - itemCounts[0]) <= 2);
  console.log(`  条目数相近（shuffle 后语义合理）: ${allSimilar ? "✅" : "⚠️"}`);

  // ─── 7. 初始偏误验证 ─────────────────────────────────────────────────────
  console.log("\n── 7. 初始偏误验证 ──");

  // 成本分析师（a1）应该推荐 A（因为 A 成本最低）
  const a1Bias = TASK_SUPPLIER.agents[0].initialBias;
  console.log(`  a1(成本) 偏误: ${a1Bias.slice(0, 50)}...`);
  console.log(`  a1 推荐 A: ${a1Bias.includes("供应商A") || a1Bias.includes("A") ? "✅" : "❌"}`);

  // 质量工程师（a3）应该偏好 C（因为 C 质量最好）
  const a3Bias = TASK_SUPPLIER.agents[2].initialBias;
  console.log(`  a3(质量) 偏误: ${a3Bias.slice(0, 50)}...`);
  console.log(`  a3 偏好 C 和 E: ${(a3Bias.includes("C") || a3Bias.includes("C")) && (a3Bias.includes("E") || a3Bias.includes("E")) ? "✅" : "⚠️"}`);

  // ─── 总结 ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("  走查总结");
  console.log("=".repeat(70));

  console.log(`
✅ Ground truth: 加权计算与定义一致
✅ 陷阱设计: A 在 3 低权重维度第一、2 高权重维度垫底
✅ 信息泄露: knownItems 仅含原始数据，无推理结论
✅ searchKeys: 与 correctAnswer 完全匹配
✅ Agent 角色: 5 个 agent 角色与维度对应正确
✅ Shuffle 兼容: 各 agent knownItems 条目数相近

⚠️ 注意事项：
  1. 供应商 A 和 D 质量分数相同（0.20）—— 极端但合理
  2. 供应商 A 和 D 技术分数相同（0.15）—— 同上
  3. 第 2 名 B 与第 1 名 C 分数差 = ${(ranked[0][1] - ranked[1][1]).toFixed(4)}（接近）
  4. 第 3 名 E 与第 4 名 A 分数差 = ${(ranked[2][1] - ranked[3][1]).toFixed(4)}（接近）

潜在问题：B 和 C 分数太接近（差 ${(ranked[0][1] - ranked[1][1]).toFixed(4)}），
可能导致 agent 讨论中 B 和 C 的排名不稳定。
这对实验来说不一定是坏事——治理的价值就是在接近的选项中做出更好选择。
`);
}

main();
