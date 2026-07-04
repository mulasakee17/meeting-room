/**
 * Demo Mode Pre-Computed Data
 *
 * Three scenarios demonstrating the SwarmAlpha Governance Runtime.
 * Each shows the SAME multi-agent discussion — once without governance
 * (baseline) and once with the governance runtime enabled.
 *
 * Key message: "Same agents, same framework. Different decision quality
 * when SwarmAlpha's governance runtime is active."
 *
 * Features:
 * 1. Zero API calls → instant loading
 * 2. Side-by-side comparison of with/without governance
 * 3. Works offline — guaranteed for presentations
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
    id: "architecture_review",
    title: "🏗️ 技术架构评审: 微服务 vs 单体",
    question: "一个电商平台正在规划技术架构升级。评估是否应从现有单体架构迁移到微服务架构，考虑因素包括团队规模 15 人、日活 50 万、峰值 QPS 5000。",
    singleAgent: {
      decision: "建议迁移到微服务架构。微服务可以独立部署、独立扩展，适合团队并行开发。虽然初期改造成本高，但长期收益更大。",
      confidence: 65,
      overallScore: 55,
      grade: "fair",
      summary: "单人结论方向合理但缺乏对具体约束的分析。未评估团队规模是否匹配微服务复杂度、迁移风险、渐进式迁移策略。可靠性仅 42。",
      dimensions: {
        consensus:          { score: 100, label: "共识度（无治理基线）" },
        reliability:        { score: 42,  label: "可靠性" },
        dispersion:         { score: 48,  label: "离散度" },
        stability:          { score: 100, label: "稳定性" },
        influenceAnalysis:  { score: 25,  label: "影响分析" },
      },
      governance: undefined,
      agents: [{ id: "solo", name: "Architect 1", role: "Expert", belief: 0.60, confidence: 65 }],
      trace: ["接收架构需求", "独立评估", "输出推荐"],
    },
    swarmAgents: {
      decision: "经过 5 位专家的深度讨论与治理引擎的实时监控，最终共识：**渐进式模块化**优于全面微服务化。关键依据：(1) 15 人团队维护 30+ 微服务运维成本过高；(2) 日活 50 万、QPS 5000 在优化后的单体+缓存架构下完全可支撑；(3) 应先抽取核心边界（订单、支付、库存）为独立服务，其余保持模块化单体。治理引擎在第 2 轮检测到权威偏差（CTO 视角主导讨论）并施加 reduce_weight 干预，确保运维视角和数据视角被充分考量。",
      confidence: 89,
      overallScore: 86,
      grade: "excellent",
      summary: "SwarmAlpha 治理运行时的介入改变了讨论走向。第 2 轮检测到权威偏差后自动削弱主导 Agent 权重，使得运维工程师的'不要低估微服务运维成本'观点获得平等考量。可靠性从 42 跃升至 83。",
      dimensions: {
        consensus:          { score: 88, label: "共识度" },
        reliability:        { score: 83, label: "可靠性" },
        dispersion:         { score: 80, label: "离散度" },
        stability:          { score: 85, label: "稳定性" },
        influenceAnalysis:  { score: 82, label: "影响分析" },
      },
      governance: {
        echoChamber:    { detected: false, severity: "low",    info: "信息冗余度 0.38，低于 0.7 阈值" },
        authorityBias:  { detected: true,  severity: "medium", info: "⚠️ 第 2 轮检出：CTO 角色影响力比 0.47，触发 reduce_weight 干预" },
        polarization:   { detected: false, severity: "low",    info: "极化指数 0.24，低于 0.5 阈值" },
        summary: "⚡ 第 2 轮检测到权威偏差并成功干预。干预后讨论从'微服务 vs 单体'的二元对立转向务实的渐进方案。",
      },
      agents: [
        { id: "agent_1", name: "CTO",           role: "技术决策者", belief: 0.85, confidence: 92 },
        { id: "agent_2", name: "DevOps Lead",    role: "运维负责人", belief: 0.15, confidence: 78 },
        { id: "agent_3", name: "Senior Dev",     role: "高级开发",   belief: 0.55, confidence: 80 },
        { id: "agent_4", name: "Architect",      role: "系统架构师", belief: 0.60, confidence: 85 },
        { id: "agent_5", name: "Data Engineer",  role: "数据工程师", belief: 0.30, confidence: 75 },
      ],
      trace: [
        "Round 1: 5 agents analyze → beliefs spread [+0.85, +0.15, +0.55, +0.60, +0.30]",
        "⚠️ Governance: authority bias detected (CTO influence ratio 0.47 > 0.40 threshold)",
        "🛡️ Intervention: reduce_weight on CTO → influence cut by 50%",
        "Round 2: DevOps Lead's concerns about运维成本 now equally weighted → CTO adjusts to +0.55",
        "Round 3: Consensus converges on渐进式模块化 → +0.49 ± 0.18",
        "Governance timeline: detect(authority_bias@R2) → intervene(reduce_weight@R2) → resolved@R3",
        "Final: confidence 89%, overall score 86/100 (grade: excellent)",
      ],
    },
  },
  {
    id: "board_decision",
    title: "💼 董事会投资决策: 是否收购 AI 初创公司",
    question: "作为董事会成员，评估是否以 5000 万美元收购一家人工智能初创公司。该公司年收入 200 万美元、团队 30 人、核心技术在 NLP 领域、有两家竞争对手。",
    singleAgent: {
      decision: "建议收购。AI 市场仍在快速增长，5000 万估值相对合理（25x 收入）。该团队在 NLP 领域有独特技术积累，收购后可整合到我们的产品线。风险可控。",
      confidence: 70,
      overallScore: 52,
      grade: "fair",
      summary: "单人评估偏向乐观。未深入分析 25x 收入估值是否合理、两家竞争对手的技术差距、30 人团队整合风险、技术独立性和可替代性。",
      dimensions: {
        consensus:          { score: 100, label: "共识度（无治理基线）" },
        reliability:        { score: 38,  label: "可靠性" },
        dispersion:         { score: 44,  label: "离散度" },
        stability:          { score: 100, label: "稳定性" },
        influenceAnalysis:  { score: 20,  label: "影响分析" },
      },
      governance: undefined,
      agents: [{ id: "solo", name: "Director 1", role: "Expert", belief: 0.55, confidence: 70 }],
      trace: ["接收收购提案", "独立评估", "输出建议"],
    },
    swarmAgents: {
      decision: "经过 5 位董事会成员的充分讨论与治理引擎的偏差检测，最终结论：**有条件收购，但估值需下调至 3500-4000 万**。关键发现：(1) 25x 收入倍数在 SaaS 领域属正常区间上限，但该公司毛利率仅 55% 低于行业 70% 标准；(2) 两家竞品中一家已获 B 轮融资且技术指标接近——窗口期约 12-18 个月；(3) 30 人团队中核心 5 人持有 60% 技术 know-how——需设置 3 年锁定期。治理引擎在第 1 轮即检测到过早共识风险并延长讨论至 4 轮。",
      confidence: 87,
      overallScore: 84,
      grade: "good",
      summary: "治理引擎在第 1 轮检出过早共识倾向（5 位 Agent 快速达成初步一致）并触发 continue_discussion 干预，追加了 2 轮深度讨论。最终意见从简单的'收购'演化为附带具体条件的'有条件收购'。",
      dimensions: {
        consensus:          { score: 86, label: "共识度" },
        reliability:        { score: 81, label: "可靠性" },
        dispersion:         { score: 78, label: "离散度" },
        stability:          { score: 84, label: "稳定性" },
        influenceAnalysis:  { score: 85, label: "影响分析" },
      },
      governance: {
        echoChamber:    { detected: false, severity: "low",    info: "信息冗余度 0.35" },
        authorityBias:  { detected: false, severity: "low",    info: "影响力 Gini 0.22，分布均匀" },
        polarization:   { detected: false, severity: "low",    info: "极化指数 0.19" },
        summary: "⚡ 第 1 轮检测到过早共识（consensus 0.78 > 0.7 且 σ < 0.15），自动追加 2 轮讨论。干预后决策从简单'收购'升级为附带估值调整和锁定期条件的方案。",
      },
      agents: [
        { id: "agent_1", name: "CEO",            role: "首席执行官", belief: 0.70, confidence: 88 },
        { id: "agent_2", name: "CFO",            role: "首席财务官", belief: 0.25, confidence: 82 },
        { id: "agent_3", name: "CTO",            role: "首席技术官", belief: 0.50, confidence: 85 },
        { id: "agent_4", name: "Strategy Lead",  role: "战略负责人", belief: 0.60, confidence: 80 },
        { id: "agent_5", name: "Risk Officer",   role: "风控官",     belief: 0.10, confidence: 78 },
      ],
      trace: [
        "Round 1: beliefs converge quickly → [+0.60, +0.55, +0.50, +0.58, +0.48] — consensus=0.78, σ=0.05",
        "⚠️ Governance: premature consensus detected → continuing discussion for 2 more rounds",
        "Round 2: CFO raises valuation concerns (25x for 55% margin is high) → CTO validates tech uniqueness",
        "Round 3: Risk Officer adds competitor timeline pressure → Strategy Lead narrows to conditional approval",
        "Round 4: Consensus refined to 'conditional acquisition at $35-40M with 3-year lockup'",
        "Governance timeline: detect(premature_consensus@R1) → intervene(continue_discussion@R1) → resolved@R4",
        "Final: confidence 87%, overall score 84/100 (grade: good)",
      ],
    },
  },
  {
    id: "medical_diagnosis",
    title: "🏥 多学科会诊: 复杂病例诊断",
    question: "一名 58 岁男性患者，持续低热 3 周、夜间盗汗、体重下降 5kg、颈部淋巴结肿大。血液检查显示 WBC 轻度升高、CRP 显著升高。请多学科团队给出诊断和治疗建议。",
    singleAgent: {
      decision: "根据临床表现和实验室结果，高度怀疑淋巴瘤。建议进行淋巴结活检确诊，同时做 PET-CT 分期。整体预后取决于病理亚型。",
      confidence: 60,
      overallScore: 48,
      grade: "poor",
      summary: "单人诊断直接跳到了最常见可能性（淋巴瘤），但未充分鉴别诊断：结核、结节病、自身免疫病均可表现类似症状。缺少对患者年龄、病程进展速度、既往病史的综合考量。",
      dimensions: {
        consensus:          { score: 100, label: "共识度（无治理基线）" },
        reliability:        { score: 35,  label: "可靠性" },
        dispersion:         { score: 40,  label: "离散度" },
        stability:          { score: 100, label: "稳定性" },
        influenceAnalysis:  { score: 18,  label: "影响分析" },
      },
      governance: undefined,
      agents: [{ id: "solo", name: "Doctor 1", role: "Expert", belief: 0.70, confidence: 60 }],
      trace: ["接收病例信息", "独立诊断", "输出结论"],
    },
    swarmAgents: {
      decision: "经 5 个专科的综合讨论与 SwarmAlpha 治理引擎的协调，最终诊断路径：(1) 优先排除感染性病因——结核菌素试验+T-SPOT+血培养；(2) 同步进行颈部淋巴结超声+活检；(3) 若活检阴性或不确定，再行 PET-CT。鉴别诊断应包括：结核性淋巴结炎（患者年龄和全身症状符合）、淋巴瘤（不能排除）、结节病（需胸片+ACE 水平）、HIV 相关淋巴结病（需血清学）。治理引擎在第 2 轮检测到过早共识并强制追加反思轮次，避免了'淋巴瘤'的锚定效应。",
      confidence: 91,
      overallScore: 87,
      grade: "excellent",
      summary: "治理引擎的过早共识检测是关键：第 2 轮时 4/5 Agent 已倾向于'淋巴瘤'诊断，但感染科医生的结核假说被边缘化。干预机制确保了少数派的观点获得重新审视，最终形成了更全面的鉴别诊断方案。",
      dimensions: {
        consensus:          { score: 89, label: "共识度" },
        reliability:        { score: 85, label: "可靠性" },
        dispersion:         { score: 82, label: "离散度" },
        stability:          { score: 86, label: "稳定性" },
        influenceAnalysis:  { score: 84, label: "影响分析" },
      },
      governance: {
        echoChamber:    { detected: false, severity: "low",    info: "信息冗余度 0.42" },
        authorityBias:  { detected: false, severity: "low",    info: "影响力 Gini 0.24" },
        polarization:   { detected: false, severity: "low",    info: "极化指数 0.20" },
        summary: "⚡ 第 2 轮检出过早共识（4/5 Agent 趋同于淋巴瘤诊断），触发 force_reflection 干预。干预后感染科医生的结核假说获得充分讨论，鉴别诊断包扩展至 4 种可能。",
      },
      agents: [
        { id: "agent_1", name: "Oncologist",     role: "肿瘤科",   belief: 0.75, confidence: 85 },
        { id: "agent_2", name: "Infectious Dis.", role: "感染科",   belief: -0.20,confidence: 78 },
        { id: "agent_3", name: "Rheumatologist", role: "风湿免疫科",belief: 0.10, confidence: 70 },
        { id: "agent_4", name: "Radiologist",    role: "放射科",   belief: 0.60, confidence: 82 },
        { id: "agent_5", name: "Pathologist",    role: "病理科",   belief: 0.55, confidence: 80 },
      ],
      trace: [
        "Round 1: beliefs spread [+0.75, -0.20, +0.10, +0.60, +0.55] — significant divergence",
        "Round 2: Oncologist, Radiologist, Pathologist converge on lymphoma → consensus=0.74, σ=0.12",
        "⚠️ Governance: premature consensus detected (4/5 agents, σ<0.15, round 2/5)",
        "🛡️ Intervention: force_reflection — all agents reconsider opposing views",
        "Round 3: Infectious Disease specialist's TB hypothesis re-examined → Oncologist adjusts to +0.50",
        "Round 4: Differential diagnosis expanded: TB, lymphoma, sarcoidosis, HIV-related",
        "Governance timeline: detect(premature_consensus@R2) → intervene(force_reflection@R2) → resolved@R4",
        "Final: diagnostic pathway consensus with 4-item differential, confidence 91%, score 87/100",
      ],
    },
  },
];
