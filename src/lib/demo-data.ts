/**
 * Demo 模式预计算数据
 *
 * 三个预设场景，每个场景包含 1-Agent 基线和 5-Agent Swarm 的对比结果。
 * 用于夏令营展示：
 * 1. 无 API 调用延迟 → 秒开
 * 2. 对比效果直观 → "多人讨论确实比一个人好"
 * 3. API Key 耗尽/网络故障时作为保底
 */

export interface DemoScenario {
  id: string;
  title: string;
  question: string;
  singleAgent: DemoResult;
  swarmAgents: DemoResult;
}

export interface DemoResult {
  decision: string;
  confidence: number;
  overallScore: number;
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
  summary: string;
  dimensions: Record<string, { score: number; label: string }>;
  governance?: {
    echoChamber: { detected: boolean; severity: string; info: string };
    authorityBias: { detected: boolean; severity: string; info: string };
    polarization: { detected: boolean; severity: string; info: string };
    summary: string;
  };
  agents?: Array<{ id: string; name: string; role: string; belief: number; confidence: number }>;
  trace: string[];
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "ai_medical",
    title: "🏥 AI 在医疗领域的应用前景",
    question: "分析人工智能在医疗领域的应用前景，判断总体趋势是积极还是消极。",
    singleAgent: {
      decision: "人工智能在医疗领域的前景总体积极。AI 可以提高诊断准确率、加速药物研发、优化医疗资源配置。但也存在数据隐私、监管障碍等挑战。整体来看利大于弊。",
      confidence: 72,
      overallScore: 58,
      grade: "fair",
      summary: "单人分析覆盖了主要观点但缺乏深度批判。维度评分偏低，可靠性仅 45——缺少被验证的证据支撑。",
      dimensions: {
        consensus:          { score: 100, label: "共识度（单人→满分但无意义）" },
        reliability:        { score: 45,  label: "可靠性" },
        dispersion:         { score: 52,  label: "离散度" },
        stability:          { score: 100, label: "稳定性（单人无变化）" },
        influenceAnalysis:  { score: 30,  label: "影响分析" },
      },
      governance: undefined,
      agents: [{ id: "solo", name: "Analyst 1", role: "Expert", belief: 0.65, confidence: 72 }],
      trace: ["单人接收问题", "独立分析", "输出结论"],
    },
    swarmAgents: {
      decision: "经过 5 位专家的多轮讨论与互相质疑，最终共识：AI 在医疗领域前景积极，但需要谨慎推进。关键优势包括诊断精度提升 30%+、药物研发周期缩短 50%。主要风险在于数据偏见可能放大医疗不平等、GPT-4 级别模型在罕见病上仍有 15% 误诊率。建议分阶段部署：先辅助诊断，再逐步扩展到治疗方案推荐。",
      confidence: 85,
      overallScore: 82,
      grade: "good",
      summary: "多智能体讨论显著提升了决策质量。多视角交叉验证使得可靠性从 45 提升到 78。治理引擎未检测到回音室或极化偏差。",
      dimensions: {
        consensus:          { score: 85, label: "共识度" },
        reliability:        { score: 78, label: "可靠性" },
        dispersion:         { score: 76, label: "离散度" },
        stability:          { score: 81, label: "稳定性" },
        influenceAnalysis:  { score: 84, label: "影响分析" },
      },
      governance: {
        echoChamber:    { detected: false, severity: "low",    info: "信息冗余度 0.32，远低于 0.7 阈值" },
        authorityBias:  { detected: false, severity: "low",    info: "影响力分布均匀，Gini 系数 0.21" },
        polarization:   { detected: false, severity: "low",    info: "极化指数 0.18，低于 0.5 阈值" },
        summary: "✅ 未检测到群体决策偏差。讨论过程健康、多元。",
      },
      agents: [
        { id: "agent_1", name: "Analyst",       role: "数据分析师", belief: 0.82, confidence: 88 },
        { id: "agent_2", name: "Critic",         role: "批判思考者", belief: 0.45, confidence: 75 },
        { id: "agent_3", name: "Synthesizer",    role: "综合思考者", belief: 0.71, confidence: 82 },
        { id: "agent_4", name: "Visionary",      role: "远见思考者", belief: 0.90, confidence: 91 },
        { id: "agent_5", name: "Ethicist",       role: "伦理学家",   belief: 0.38, confidence: 85 },
      ],
      trace: [
        "Round 1: 5 agents independently analyze → beliefs: [+0.7, +0.3, +0.6, +0.9, +0.2]",
        "Round 2: Critic challenges Visionary's optimism → Visionary adjusts to +0.8",
        "Round 3: Synthesizer integrates all views → consensus converges at +0.65 ± 0.18",
        "Governance: echo chamber=0.32, authority=0.21, polarization=0.18 → all clean",
        "Final: swarm confidence 85%, overall score 82/100",
      ],
    },
  },
  {
    id: "fed_rate",
    title: "📈 美联储加息对科技股的影响",
    question: "美联储宣布加息 0.25%，请分析这对科技股板块的短期和中期影响。",
    singleAgent: {
      decision: "加息对科技股是利空。高利率环境压缩科技公司估值，融资成本上升。短期看跌。",
      confidence: 68,
      overallScore: 52,
      grade: "fair",
      summary: "结论方向正确但分析过于笼统。缺少对不同类型科技公司的细分，也没有考虑市场已部分定价的因素。",
      dimensions: {
        consensus:          { score: 100, label: "共识度（单人→满分但无意义）" },
        reliability:        { score: 42,  label: "可靠性" },
        dispersion:         { score: 48,  label: "离散度" },
        stability:          { score: 100, label: "稳定性" },
        influenceAnalysis:  { score: 25,  label: "影响分析" },
      },
      governance: undefined,
      agents: [{ id: "solo", name: "Analyst 1", role: "Expert", belief: -0.55, confidence: 68 }],
      trace: ["单人接收问题", "独立分析", "输出结论"],
    },
    swarmAgents: {
      decision: "经过 5 位专家讨论，共识结论：加息 0.25% 对科技股的短期冲击有限（市场已提前定价 80%+ 概率），但中期（3-6 个月）存在结构性分化。高现金流大型科技公司（Apple, Microsoft）受影响较小，高估值未盈利 SaaS 公司可能面临 15-25% 估值回调。同时注意到 AI 投资主题可能部分对冲加息压力——AI 相关资本开支仍在加速。",
      confidence: 88,
      overallScore: 85,
      grade: "good",
      summary: "多智能体讨论通过分析师的结构性拆分、Critic 对「市场已定价」的验证，以及远见者对 AI 对冲因素的补充，将单一的空头视角拓展为分层判断。",
      dimensions: {
        consensus:          { score: 88, label: "共识度" },
        reliability:        { score: 82, label: "可靠性" },
        dispersion:         { score: 80, label: "离散度" },
        stability:          { score: 83, label: "稳定性" },
        influenceAnalysis:  { score: 86, label: "影响分析" },
      },
      governance: {
        echoChamber:    { detected: false, severity: "low",    info: "信息冗余度 0.28" },
        authorityBias:  { detected: false, severity: "low",    info: "影响力 Gini 0.19" },
        polarization:   { detected: false, severity: "low",    info: "极化指数 0.22" },
        summary: "✅ 讨论健康，无偏差检测触发。",
      },
      agents: [
        { id: "agent_1", name: "Analyst",       role: "金融分析师", belief: -0.35, confidence: 82 },
        { id: "agent_2", name: "Trader",         role: "交易员",     belief: -0.60, confidence: 78 },
        { id: "agent_3", name: "Strategist",     role: "策略师",     belief: -0.20, confidence: 85 },
        { id: "agent_4", name: "Tech Expert",    role: "科技专家",   belief: 0.15,  confidence: 88 },
        { id: "agent_5", name: "Risk Manager",   role: "风控经理",   belief: -0.45, confidence: 90 },
      ],
      trace: [
        "Round 1: beliefs spread [-0.6, -0.35, -0.2, +0.15, -0.45]",
        "Round 2: Tech Expert argues AI investment offsets rate pressure → Trader partially convinced",
        "Round 3: Strategist synthesizes: short-term priced in, mid-term divergence by sector",
        "Governance: all metrics clean — healthy disagreement without polarization",
        "Final: consensus -0.29 ± 0.22, confidence 88%",
      ],
    },
  },
  {
    id: "climate_tech",
    title: "🌍 气候科技投资的战略优先级",
    question: "一家大型企业集团正在制定未来 5 年的技术投资战略。评估气候科技是否应作为最高优先级。",
    singleAgent: {
      decision: "气候科技应该作为最高优先级之一。全球碳中和目标、政策支持和消费者需求都在推动这一趋势。但不应忽视数字化转型和 AI 等其他优先级。建议将 30% 预算分配给气候科技。",
      confidence: 70,
      overallScore: 55,
      grade: "fair",
      summary: "分析给出方向性建议但缺乏具体依据。未评估技术成熟度、ROI 时间线和替代方案。评分偏低。",
      dimensions: {
        consensus:          { score: 100, label: "共识度（单人→满分但无意义）" },
        reliability:        { score: 40,  label: "可靠性" },
        dispersion:         { score: 46,  label: "离散度" },
        stability:          { score: 100, label: "稳定性" },
        influenceAnalysis:  { score: 22,  label: "影响分析" },
      },
      governance: undefined,
      agents: [{ id: "solo", name: "Analyst 1", role: "Expert", belief: 0.55, confidence: 70 }],
      trace: ["单人接收问题", "独立分析", "输出结论"],
    },
    swarmAgents: {
      decision: "经过深入讨论，5 位专家达成共识：气候科技应作为**首要但不排他**的战略优先级。关键支撑论据：(1) 全球碳市场预计 2030 年达 $50B+，年增速 30%+；(2) 欧盟 CBAM 等监管将在 3 年内影响供应链成本 5-15%；(3) 技术成熟度曲线显示储能、碳捕获已过 Gartner 峰谷，进入实质部署期。但必须与 AI/数字化转型并行——因为 AI 本身就是气候科技（智能电网优化可降碳 5-10%）。建议分配：气候科技 35%、AI 25%、数字化 20%、其他 20%。",
      confidence: 91,
      overallScore: 88,
      grade: "excellent",
      summary: "多智能体讨论实现了从「是不是优先级」到「什么程度的优先级，如何分配资源」的认知跃迁。可靠性达 86，5 维均分在 80 以上。这是集体智慧超越个人判断的典型案例。",
      dimensions: {
        consensus:          { score: 90, label: "共识度" },
        reliability:        { score: 86, label: "可靠性" },
        dispersion:         { score: 84, label: "离散度" },
        stability:          { score: 87, label: "稳定性" },
        influenceAnalysis:  { score: 91, label: "影响分析" },
      },
      governance: {
        echoChamber:    { detected: false, severity: "low",    info: "信息冗余度 0.25" },
        authorityBias:  { detected: false, severity: "low",    info: "影响力 Gini 0.17，分布最均匀" },
        polarization:   { detected: false, severity: "low",    info: "初始分歧较大(±0.5)但经讨论收敛" },
        summary: "✅ 讨论从歧见到共识，治理引擎全程监控无异常。这是教科书级的集体决策过程。",
      },
      agents: [
        { id: "agent_1", name: "Strategist",    role: "战略顾问",   belief: 0.70, confidence: 90 },
        { id: "agent_2", name: "CFO Mind",      role: "财务视角",   belief: 0.30, confidence: 85 },
        { id: "agent_3", name: "Tech Lead",     role: "技术负责人", belief: 0.65, confidence: 88 },
        { id: "agent_4", name: "Skeptic",       role: "怀疑论者",   belief: 0.15, confidence: 78 },
        { id: "agent_5", name: "Futurist",      role: "未来学家",   belief: 0.85, confidence: 92 },
      ],
      trace: [
        "Round 1: beliefs spread widely [+0.70, +0.30, +0.65, +0.15, +0.85] — 明显分歧",
        "Round 2: CFO challenges ROI assumptions → Strategist provides carbon market data",
        "Round 3: Skeptic questions technology readiness → Tech Lead cites Gartner curve",
        "Round 4: Futurist and CFO find synergy: AI × Climate → smart grid optimization",
        "Governance: all clean — natural convergence without groupthink",
        "Final: consensus +0.53 ± 0.21, confidence 91%, overall score 88/100",
      ],
    },
  },
];
