/**
 * Interdependent Investment Decision Task
 *
 * No single agent can determine the correct answer alone.
 * Each agent holds ONE metric across 3 investment options.
 * Only by combining all 5 metrics can agents compute the best investment.
 *
 * Ground truth (weighted score):
 *   BetaCore (74.75) > AlphaTech (61.75) > GammaEdge (44.25)
 *
 * Design: agent sees their metric → naturally pushes for the option
 * that scores highest on their metric alone → conflicts with others →
 * governance detects missing info → injects undiscussed metrics.
 */

import type { TaskConfig } from "../lunar_survival/config";

const OPTIONS = ["BetaCore (企业服务)", "AlphaTech (AI芯片)", "GammaEdge (边缘计算)"];

export const TASK_INVEST: TaskConfig = {
  id: "invest",
  title: "互依投资决策",
  correctAnswer: {
    "BetaCore (企业服务)": 1,
    "AlphaTech (AI芯片)": 2,
    "GammaEdge (边缘计算)": 3,
  },
  searchKeys: {
    "BetaCore (企业服务)": ["BetaCore", "企业服务"],
    "AlphaTech (AI芯片)": ["AlphaTech", "AI芯片"],
    "GammaEdge (边缘计算)": ["GammaEdge", "边缘计算"],
  },
  sharedBriefing:
    `你是某投资基金的专家顾问。基金需从以下3家公司中选择最佳投资标的。\n` +
    `每家公司都有5个维度需要评估：营收增速、利润率、技术护城河、监管风险、市场规模。\n` +
    `你只掌握其中一个维度的完整数据。其他维度的数据分散在同事手中。\n\n` +
    `你必须主动分享你的数据，同时主动询问同事的数据。\n` +
    `只有综合全部5个维度的数据，才能做出正确判断。\n\n` +
    `3个候选标的：\n` +
    `1. AlphaTech (AI芯片公司)\n` +
    `2. BetaCore (企业服务公司)\n` +
    `3. GammaEdge (边缘计算公司)`,

  agents: [
    {
      id: "a1", name: "Growth Analyst", role: "营收增速专家",
      knownItems:
        `你掌握全部3家公司的营收增速数据（这是你独有的，同事都不知道）：\n` +
        `• AlphaTech: 年营收增速35%（受益于AI芯片需求爆发）\n` +
        `• BetaCore: 年营收增速15%（成熟企业服务市场，稳定增长）\n` +
        `• GammaEdge: 年营收增速45%（边缘计算处在爆发前夜，基数低增速快）\n\n` +
        `仅看营收增速，GammaEdge最吸引人。但你需要其他维度的数据才能做出全面判断。`,
      initialBias: "你自然倾向于高增长的公司。GammaEdge的45%增速非常诱人。但你知道缺少其他维度数据。",
    },
    {
      id: "a2", name: "Finance Expert", role: "利润率分析师",
      knownItems:
        `你掌握全部3家公司的利润率数据（这是你独有的，同事都不知道）：\n` +
        `• AlphaTech: EBITDA利润率28%（芯片设计毛利率高但研发费用大）\n` +
        `• BetaCore: EBITDA利润率42%（企业服务订阅模式，利润率行业最高）\n` +
        `• GammaEdge: EBITDA利润率12%（边缘计算硬件成本高，规模效应尚未显现）\n\n` +
        `仅看利润率，BetaCore远超其他。42%的订阅利润率非常健康。`,
      initialBias: "你自然倾向于高利润率的公司。BetaCore的42%令人印象深刻。但你缺少营收增速和市场规模数据。",
    },
    {
      id: "a3", name: "Strategy Advisor", role: "技术战略顾问",
      knownItems:
        `你掌握全部3家公司的技术护城河数据（这是你独有的，同事都不知道）：\n` +
        `• AlphaTech: 护城河评分4/5（拥有7nm AI芯片核心专利，竞品需3年以上追赶）\n` +
        `• BetaCore: 护城河评分2/5（企业服务产品同质化严重，切换成本是主要壁垒）\n` +
        `• GammaEdge: 护城河评分3/5（边缘计算有场景优势但技术壁垒正在降低）\n\n` +
        `仅看技术护城河，AlphaTech最强。4/5的评分意味着可持续的竞争优势。`,
      initialBias: "你重视技术壁垒。AlphaTech的专利护城河很有说服力。但你需要财务和风险数据来验证判断。",
    },
    {
      id: "a4", name: "Risk Officer", role: "风控合规官",
      knownItems:
        `你掌握全部3家公司的监管风险数据（这是你独有的，同事都不知道）：\n` +
        `• AlphaTech: 风险评分2/5（美国对华芯片出口管制是主要风险，概率约40%）\n` +
        `• BetaCore: 风险评分1/5（企业服务几乎无监管风险，政策友好）\n` +
        `• GammaEdge: 风险评分3/5（边缘计算涉及数据本地化法规，合规成本增加）\n\n` +
        `仅看风险，BetaCore最安全。1/5的风险评分意味着几乎无政策阻力。`,
      initialBias: "你厌恶风险。AlphaTech的出口管制风险和GammaEdge的法规风险让你担忧。BetaCore看起来最安全。",
    },
    {
      id: "a5", name: "Market Strategist", role: "市场规模分析师",
      knownItems:
        `你掌握全部3家公司的市场规模数据（这是你独有的，同事都不知道）：\n` +
        `• AlphaTech: 可触达市场规模$12B（全球AI芯片市场，2030年预测$150B）\n` +
        `• BetaCore: 可触达市场规模$25B（全球企业服务SaaS市场，已成熟但体量大）\n` +
        `• GammaEdge: 可触达市场规模$6B（边缘计算早期，市场尚在培育期）\n\n` +
        `仅看市场规模，BetaCore最大。$25B的市场空间提供了充足的成长跑道。`,
      initialBias: "你关注市场天花板。BetaCore的$25B市场最有吸引力。但市场规模大不等于盈利好。",
    },
  ],
};
