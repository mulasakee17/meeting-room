/**
 * Interdependent Investment Decision Task (Hidden Profile V2)
 *
 * THIS IS A GENUINE HIDDEN PROFILE. Each agent knows only 2 of 3 companies
 * on their dimension. BetaCore's strongest data is hidden from 3/5 agents.
 *
 * Without sharing → aggregate favors AlphaTech/GammaEdge (wrong answer).
 * With sharing (governance) → hidden BetaCore facts surface → correct.
 *
 * ─── Data Coverage (✓ = agent knows this company's data) ───
 *
 * | Agent | Dimension    | AlphaTech | BetaCore | GammaEdge |
 * |-------|-------------|-----------|----------|-----------|
 * | a1    | Revenue Gr.  | ✓ 35%     | ✗        | ✓ 45%     |
 * | a2    | Profit Marg. | ✓ 28%     | ✗        | ✓ 12%     |
 * | a3    | Tech Moat    | ✓ 4/5     | ✓ 2/5    | ✓ 3/5     |
 * | a4    | Reg. Risk    | ✗         | ✓ 1/5    | ✓ 3/5     |
 * | a5    | Market Size  | ✓ $12B    | ✗        | ✓ $6B     |
 *
 * Coverage:
 *   AlphaTech:  4/5 agents have data → widely known (biased toward in aggregate)
 *   GammaEdge:  5/5 agents have data → completely known
 *   BetaCore:   2/5 agents have data → MOSTLY HIDDEN (a3, a4 only)
 *
 * ─── Shared Briefing Bias ───
 *
 * The fund's stated strategy favors "high growth, high moat" tech plays.
 * The briefing lists companies in order: AlphaTech first, BetaCore last.
 * This creates a narrative bias toward AlphaTech and GammaEdge.
 *
 * ─── Ground Truth ───
 *
 * BetaCore > AlphaTech > GammaEdge
 *
 * BetaCore wins on 3/5 dimensions (profit, risk, market) with STRUCTURAL
 * advantages, but data for 2 of these 3 dimensions is hidden from most agents.
 * The shared narrative ("growth + tech") plus data availability bias favors
 * AlphaTech. Only governance can surface the hidden BetaCore data.
 */

import type { TaskConfig } from "../lunar_survival/config";

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
    `你是某风险投资基金的专家顾问。基金本期策略重点：寻找高增长、高技术壁垒的科技公司。\n` +
    `CEO在备忘录中强调："我们投资下一个计算时代——AI和边缘计算是核心赛道。"\n\n` +
    `3个候选标的（你需要综合评估后给出排名）：\n` +
    `1. AlphaTech (AI芯片)——AI芯片赛道龙头，技术壁垒深厚\n` +
    `2. GammaEdge (边缘计算)——边缘计算新锐，近两年增长最快的标的\n` +
    `3. BetaCore (企业服务)——传统企业SaaS，财务稳健但增长平缓\n\n` +
    `你需要与同事讨论，分享各自掌握的数据。注意：每个人的数据都不完整，\n` +
    `你只掌握部分公司的部分指标。只有互相分享才能拼出全貌。`,

  agents: [
    {
      id: "a1", name: "Growth Analyst", role: "营收增速专家",
      knownItems:
        `你只掌握以下公司的营收增速数据（同事都不知道这些数字）：\n` +
        `• AlphaTech: 年营收增速35%（AI芯片需求推动，连续3年30%+）\n` +
        `• GammaEdge: 年营收增速45%（边缘计算爆发，但注意：去年同期是65%——增速在减速）\n\n` +
        `你没有BetaCore的增速数据。从公开信息你只知道BetaCore增速"比较稳定但不高"。\n\n` +
        `仅看已知数据：GammaEdge增速最高。但你没有BetaCore的数据，无法完整判断。`,
      initialBias: "你倾向于高增长标的。GammaEdge的45%增速很吸引你，但你注意到了增速在下降。你没有BetaCore的数据。",
    },
    {
      id: "a2", name: "Finance Expert", role: "利润率分析师",
      knownItems:
        `你只掌握以下公司的利润率数据（同事都不知道这些数字）：\n` +
        `• AlphaTech: EBITDA利润率28%（芯片设计毛利率高，但研发费用吃掉了一半毛利）\n` +
        `• GammaEdge: EBITDA利润率12%（硬件成本占比大，过去两年从未超过15%）\n\n` +
        `你没有BetaCore的利润率数据。从行业报告你隐约知道"企业SaaS的利润率通常较高"，\n` +
        `但没有具体数字。\n\n` +
        `仅看已知数据：AlphaTech利润率优于GammaEdge，但28%也不算特别出色。`,
      initialBias: "你对利润率敏感。AlphaTech的28%还可以，GammaEdge的12%让你担忧。但你缺少BetaCore的数据——这可能是关键信息缺口。",
    },
    {
      id: "a3", name: "Strategy Advisor", role: "技术战略顾问",
      knownItems:
        `你掌握全部3家公司的技术护城河数据（你是唯一掌握完整护城河评估的人）：\n` +
        `• AlphaTech: 护城河评分4/5——拥有7nm AI训练芯片核心专利，竞品追赶需3年以上\n` +
        `• BetaCore: 护城河评分2/5——企业服务产品功能可替代，但客户迁移成本极高\n` +
        `  （企业ERP/SaaS平台切换需要6-12个月，95%的客户选择续约而非迁移）\n` +
        `• GammaEdge: 护城河评分3/5——边缘计算场景有先发优势，但开源方案正在追赶\n\n` +
        `⚠️ 关键发现：BetaCore虽然评分最低，但它的"切换成本"型护城河\n` +
        `实际上比专利型护城河更持久。而且你注意到一个模式：\n` +
        `高评分≠好投资。BetaCore的2/5是"壁垒虽低但客户跑不掉"，\n` +
        `AlphaTech的4/5高度依赖一份即将到期的专利。`,
      initialBias: "你不迷信护城河评分。BetaCore的'客户锁定'型壁垒是实实在在的。但你缺少财务数据来验证你的直觉。",
    },
    {
      id: "a4", name: "Risk Officer", role: "风控合规官",
      knownItems:
        `你只掌握以下公司的监管风险评估（同事都不知道这些信息）：\n` +
        `• BetaCore: 风险评分1/5——企业服务软件几乎不受监管，过去15年零监管事故。\n` +
        `  主要市场（美欧日）对SaaS产品无特殊管制，合规成本极低。\n` +
        `• GammaEdge: 风险评分4/5——边缘计算涉及数据本地化。欧盟正在调查其\n` +
        `  GDPR合规性（已进入第二阶段审查）。如果被认定违规，罚款最高达全球营收4%。\n\n` +
        `你没有AlphaTech的风险数据。但你从新闻中注意到中美芯片管制在升级。\n\n` +
        `仅看已知数据：BetaCore几乎零风险，GammaEdge有正在进行的监管调查。\n` +
        `AlphaTech的风险状况未知——这是一个你担心的信息缺口。`,
      initialBias: "风险是你的首要关注点。BetaCore的监管清洁记录让你放心。GammaEdge的欧盟调查让你警觉。你缺少AlphaTech的数据。",
    },
    {
      id: "a5", name: "Market Strategist", role: "市场规模分析师",
      knownItems:
        `你只掌握以下公司的市场规模数据（同事都不知道这些信息）：\n` +
        `• AlphaTech: 可触达市场规模$12B——全球AI芯片市场，但极度集中（NVIDIA占80%份额），\n` +
        `  留给AlphaTech的实际空间有限。\n` +
        `• GammaEdge: 可触达市场规模$6B——边缘计算市场，而且趋势令人担忧：\n` +
        `  2024年预测$10B→2025年预测$8B→2026年预测$6B，连续三年下调。\n\n` +
        `你没有BetaCore的市场数据。但你隐约知道"企业SaaS是最大的软件市场之一"。\n\n` +
        `仅看已知数据：AlphaTech的$12B看起来不错但NVIDIA压制严重。\n` +
        `GammaEdge的$6B在缩水——这个赛道可能根本没有想象中大。`,
      initialBias: "你关注市场天花板和趋势。GammaEdge的TAM连续下调让你非常担忧。AlphaTech的市场虽大但竞争格局恶劣。你亟需知道BetaCore的数据。",
    },
  ],
};
