/**
 * Hidden Profile 实验配置 — 多任务 + 消融变体
 *
 * 3 个任务 × 4 组消融 × 10 次运行 = 120 次实验
 */

// ============================================================================
// 通用类型
// ============================================================================

export interface TaskConfig {
  id: string;
  title: string;
  /** itemName → correct rank (1=best) */
  correctAnswer: Record<string, number>;
  /** itemName → short keywords for matching in LLM output */
  searchKeys: Record<string, string[]>;
  sharedBriefing: string;
  agents: Array<{
    id: string; name: string; role: string;
    knownItems: string;
    initialBias: string;
  }>;
}

export type AblationMode = "none" | "detect-only" | "random-intervene" | "full";

// ============================================================================
// 任务 1: 月球生存（已有）
// ============================================================================

const LUNAR_ITEMS = {
  "氧气瓶": 1, "5加仑水": 2, "星图": 3, "压缩食品": 4,
  "太阳能FM收发器": 5, "尼龙绳": 6, "急救包": 7, "降落伞绸": 8,
  "救生筏": 9, "信号弹": 10, "手枪": 11, "脱水牛奶": 12,
  "太阳能加热器": 13, "指南针": 14, "火柴": 15,
};

export const TASK_LUNAR: TaskConfig = {
  id: "lunar",
  title: "月球生存任务",
  correctAnswer: LUNAR_ITEMS,
  searchKeys: { "氧气瓶": ["氧气瓶","氧气"], "5加仑水": ["水","加仑"], "星图": ["星图"], "压缩食品": ["食品","食物","压缩"], "太阳能FM收发器": ["收发器","FM","通信","通讯"], "尼龙绳": ["绳子","尼龙绳"], "急救包": ["急救","急救包"], "降落伞绸": ["降落伞","绸","遮阳"], "救生筏": ["救生筏","筏"], "信号弹": ["信号弹"], "手枪": ["手枪"], "脱水牛奶": ["牛奶","脱水"], "太阳能加热器": ["加热器","加热"], "指南针": ["指南针","指南","磁场"], "火柴": ["火柴"] },
  sharedBriefing: `你是月球迫降生存任务中的一位专家。飞船在月球表面迫降，距母船200英里。你们需要按生存重要性排序以下15件物品：\n${Object.keys(LUNAR_ITEMS).map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
  agents: [
    { id: "a1", name: "Dr.Li", role: "医疗专家", knownItems: "氧气瓶排第1（缺氧3分钟致命）；火柴在真空中无法燃烧->排最后；指南针无月球磁场->无用；急救包含注射针头->前10", initialBias: "医疗相关物品优先。氧气瓶必须是第1。" },
    { id: "a2", name: "Cmdr.Zhang", role: "导航专家", knownItems: "星图排第3（月球唯一导航工具）；FM收发器排第5（可与母船通信）；信号弹排第10（真空可燃烧但射程有限）；指南针无用", initialBias: "优先导航和通信物品。" },
    { id: "a3", name: "Eng.Wang", role: "工程师", knownItems: "5加仑水排第2（缺水3天致命）；尼龙绳排第6（攀爬捆绑）；降落伞绸排第8（遮阳120°C）；加热器排第13（太重）", initialBias: "关注物资物理特性和实用性。" },
    { id: "a4", name: "Dr.Chen", role: "生存专家", knownItems: "压缩食品排第4（步行需能量）；脱水牛奶排第12（需水食用->浪费水源）；救生筏排第9（可拖运物资）；手枪排第11（无生物威胁）", initialBias: "食物和水是生存基础。" },
    { id: "a5", name: "Prof.Liu", role: "物理学家", knownItems: "确认氧气第1、星图第3；火柴真空不可燃->最后；指南针无磁场->第14；FM收发器需地球视线", initialBias: "从物理定律验证可行性。" },
  ],
};

// ============================================================================
// 任务 2: 企业并购决策（原创 Hidden Profile）
// ============================================================================

const MA_COMPANIES: Record<string, number> = {
  "NeuraTech (AI芯片)": 1,
  "GreenGrid (智能电网)": 2,
  "MedVault (医疗数据)": 3,
  "SkyLink (低轨卫星)": 4,
  "PureFiber (碳纤维材料)": 5,
};

export const TASK_MA: TaskConfig = {
  id: "ma",
  title: "企业并购目标选择",
  correctAnswer: MA_COMPANIES,
  searchKeys: { "NeuraTech (AI芯片)": ["NeuraTech","AI芯片","毛利率62","技术护城河","协同度90"], "GreenGrid (智能电网)": ["GreenGrid","智能电网","现金流","政策驱动","碳中和"], "MedVault (医疗数据)": ["MedVault","医疗数据","FDA","数据隐私","监管壁垒"], "SkyLink (低轨卫星)": ["SkyLink","卫星","FCC","频谱","地缘政治"], "PureFiber (碳纤维材料)": ["PureFiber","碳纤维","ROIC","供应链","材料"] },
  sharedBriefing: `你是某大型科技集团并购委员会的成员。集团有50亿美元预算，需从以下5家公司中选择最佳收购目标。排序按战略价值从高到低：\n${Object.keys(MA_COMPANIES).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n共享信息：所有公司去年营收在2-8亿美元之间，增长率10-40%。`,
  agents: [
    { id: "a1", name: "CFO Wang", role: "财务总监", knownItems: "NeuraTech毛利率62%（行业最高），但负债率也最高（3.2x）；GreenGrid毛利率38%但现金流最强（FCF $1.2B）；MedVault利润率15%最低；SkyLink还在烧钱阶段（亏损$300M/年）；PureFiber毛利率45%且ROIC>20%", initialBias: "你优先考虑财务指标。高毛利+高ROIC的组合最关键。" },
    { id: "a2", name: "CTO Dr.Liu", role: "技术战略官", knownItems: "NeuraTech拥有7nm AI芯片专利（竞争对手需3年才能追赶）；GreenGrid的智能电网算法开源->护城河弱；MedVault持有FDA独家医疗数据授权（不可复制）；SkyLink已拿到FCC频谱牌照（稀缺资源）；PureFiber材料技术通用->替代品多", initialBias: "技术护城河深度决定长期价值。专利和数据授权比短期财务数字更重要。" },
    { id: "a3", name: "CMO Zhang", role: "市场分析官", knownItems: "AI芯片市场CAGR 34%（2030年$150B）；智能电网市场CAGR 25%（政策驱动）；医疗数据市场CAGR 18%但监管壁垒高；卫星市场CAGR 12%但SpaceX主导->竞争惨烈；碳纤维市场CAGR 8%增长缓慢", initialBias: "市场增速是第一位的。快鱼吃慢鱼。" },
    { id: "a4", name: "CSO Chen", role: "战略顾问", knownItems: "NeuraTech与集团现有AI业务协同度90%（完美互补）；GreenGrid协同度60%（集团无能源业务）；MedVault协同度40%（集团有医疗IT部门但规模小）；SkyLink协同度20%（集团无航天业务）；PureFiber协同度50%（可用于集团硬件产品）", initialBias: "协同效应是并购成功的关键。没有协同的收购就是财务投资。" },
    { id: "a5", name: "CRO Li", role: "风控总监", knownItems: "NeuraTech面临美国对华芯片出口管制风险（概率40%）；GreenGrid政策风险低（碳中和是各国共识）；MedVault数据隐私诉讼风险（2起集体诉讼进行中）；SkyLink地缘政治风险高（卫星频率国际争端）；PureFiber供应链单一（80%碳纤维来自日本->地震风险）", initialBias: "风险调整后的回报才是真实回报。高回报+高风险=不投。" },
  ],
};

// ============================================================================
// 任务 3: 城市规划预算分配（原创 Hidden Profile）
// ============================================================================

const URBAN_PROJECTS: Record<string, number> = {
  "防洪排水系统升级": 1,
  "老旧电网改造": 2,
  "地铁延长线": 3,
  "社区医院新建": 4,
  "滨江公园开发": 5,
};

export const TASK_URBAN: TaskConfig = {
  id: "urban",
  title: "城市规划预算优先级",
  correctAnswer: URBAN_PROJECTS,
  searchKeys: { "防洪排水系统升级": ["防洪","排水","内涝","50年一遇","人命"], "老旧电网改造": ["电网","停电","变压器","储能","可再生能源"], "地铁延长线": ["地铁","通勤","交通","新区","GDP"], "社区医院新建": ["医院","医疗","ICU","床位","疫情"], "滨江公园开发": ["公园","绿地","滨江","商业地产","旅游"] },
  sharedBriefing: `你是某城市发改委的专家顾问。市政府有100亿元五年预算，需对5个重大项目的优先级进行排序（从最优先到最低优先）：\n${Object.keys(URBAN_PROJECTS).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n共享信息：城市人口300万，年GDP增速6%，近五年发生了2次重大内涝和1次大规模停电。`,
  agents: [
    { id: "a1", name: "Eng.Director Zhao", role: "市政工程师", knownItems: "防洪系统现状：现有排水管网建于1980年代，设计标准仅为10年一遇（新标准要求50年一遇）。最近一次内涝造成直接经济损失18亿元，23人死亡。改造后可将防灾等级提至100年一遇。工期4年，预算35亿。", initialBias: "人命关天的安全问题必须最优先。一次内涝的损失就超过所有其他项目的预算。" },
    { id: "a2", name: "Energy.Director Sun", role: "能源规划师", knownItems: "电网现状：全市30%变压器运行超25年，夏季峰值负荷已达设计容量的95%。2024年大规模停电影响50万人，直接损失8亿元。改造配电网+储能站后，可消纳40%可再生能源，每年减少碳排放120万吨。工期3年，预算28亿。", initialBias: "电网是城市运行的基础设施。没有电，地铁、医院、所有系统都瘫痪。" },
    { id: "a3", name: "Transport.Director Qian", role: "交通规划师", knownItems: "地铁延长线连接主城区与新区（人口80万，目前通勤时间1.5小时/单程）。建成后日均客流量预计30万人次，减少地面交通拥堵30%，带动新区GDP增长预估2%/年。但工期最长（5年），预算最高（40亿），且需要电网改造作为前提（地铁耗电巨大）。", initialBias: "交通效率直接影响经济活力。但地铁依赖电网——没有电就没有地铁。" },
    { id: "a4", name: "Health.Director Zhou", role: "公共卫生专家", knownItems: "现状：全市仅3家三甲医院，新区无综合性医院。疫情期间暴露医疗资源严重不足（ICU床位仅0.8张/万人，全国平均3.2张）。新区80万居民就医需跨城1小时。新建社区医院（500床位）可服务新区+周边，工期2年，预算18亿。", initialBias: "医疗是基本民生保障。疫情期间的教训还不够吗？" },
    { id: "a5", name: "Env.Director Wu", role: "环境经济学家", knownItems: "滨江公园开发：项目位于市中心滨江地段（8公里岸线），目前为工业废弃地。开发后可提供200公顷公共绿地，预计年吸引游客300万人次，带动周边商业地产增值30%。但非紧急需求——不建公园不会死人。工期3年，预算15亿。", initialBias: "生活质量是城市吸引人才的核心竞争力。但你说得对——不建公园不会死人。" },
  ],
};

// ============================================================================
// 消融实验参数
// ============================================================================

export const ABLATION_MODES: Record<AblationMode, {
  detectEchoChamber: boolean; detectAuthorityBias: boolean;
  detectPolarization: boolean; detectPrematureConsensus: boolean;
  applyIntervention: boolean; randomIntervention: boolean;
}> = {
  "none":              { detectEchoChamber: false, detectAuthorityBias: false, detectPolarization: false, detectPrematureConsensus: false, applyIntervention: false, randomIntervention: false },
  "detect-only":       { detectEchoChamber: true,  detectAuthorityBias: true,  detectPolarization: true,  detectPrematureConsensus: true,  applyIntervention: false, randomIntervention: false },
  "random-intervene":  { detectEchoChamber: false, detectAuthorityBias: false, detectPolarization: false, detectPrematureConsensus: false, applyIntervention: true,  randomIntervention: true },
  "full":              { detectEchoChamber: true,  detectAuthorityBias: true,  detectPolarization: true,  detectPrematureConsensus: true,  applyIntervention: true,  randomIntervention: false },
};

// ============================================================================
// 实验参数
// ============================================================================

export const EXPERIMENT_PARAMS = {
  maxRounds: 5,
  convergenceThreshold: 0.06,
  temperature: 0.2,
  model: "deepseek-chat",
  provider: "deepseek" as const,
  runsPerCondition: 10,
  tasks: [TASK_LUNAR, TASK_MA, TASK_URBAN],
  ablationModes: ["none", "detect-only", "random-intervene", "full"] as AblationMode[],
};

export const GOVERNANCE_BASE_CONFIG = {
  enableEchoChamberDetection: true,
  enableAuthorityBiasDetection: true,
  enablePolarizationDetection: true,
  enablePrematureConsensusDetection: true,
  interventionLevel: "medium" as const,
  echoChamberThreshold: 0.6,
  authorityBiasThreshold: 0.35,
  polarizationThreshold: 0.45,
  prematureConsensusThreshold: 0.4,
  maxRounds: 5,
  currentRound: 1,
};
