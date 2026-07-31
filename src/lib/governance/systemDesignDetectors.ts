/**
 * FC1 (MAST): System Design Issues 检测器
 *
 * 对齐 MAST (arXiv:2503.13657) FC1 类别，覆盖：
 *   - FM-1.2 Disobey role specification（不遵守角色规范）
 *   - FM-1.3 Step repetition（步骤重复）
 *
 * 设计原则（与 cognitiveDetectors.ts 一致）：
 *   - 纯函数，零 LLM 成本，确定性
 *   - 独立可测试，不依赖任何引擎
 *   - 输出 GovernanceIssue[]，可与认知检测器 issues 合并
 *
 * 与现有检测器的严格区分：
 *   - echo_chamber 检测信息层冗余（多 agent 互相复述）→ 群体层
 *   - FM-1.3 检测动作层重复（同一 agent 跨轮输出相同步骤）→ 个体层
 *   - premature_consensus 检测早期共识（前兆信号）→ 预防性
 *   - FM-3.1（在 taskVerificationDetectors.ts）检测终止信号 + 验证不足 → 事后
 */

import type {
  MessageInfo,
  GovernanceIssue,
  GovernanceConfig,
  SeverityLevel,
} from "./types";

// ============================================================================
// Utility Functions
// ============================================================================

/** 将文本拆分为小写 token 集合（用于 Jaccard 相似度） */
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2),  // 过滤短词（a, an, the 等）
  );
}

/** 计算两个集合的 Jaccard 相似度 */
function jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** 从 role 字符串中提取职责关键词 */
function extractRoleKeywords(role: string): string[] {
  const normalized = role.toLowerCase();
  const keywords: string[] = [];

  // 常见角色-行为映射（基于项目实际使用的角色定义）
  const rolePatterns: Array<{ pattern: RegExp; keywords: string[] }> = [
    { pattern: /analyst|analysis|分析/, keywords: ["analysis", "analyze", "data", "evidence", "分析", "数据", "证据"] },
    { pattern: /critic|review|质疑|审查/, keywords: ["critique", "challenge", "risk", "weakness", "质疑", "风险", "弱点"] },
    { pattern: /summar|conclud|总结/, keywords: ["summary", "conclude", "consensus", "总结", "结论", "共识"] },
    { pattern: /innovator|creative|创新/, keywords: ["novel", "creative", "alternative", "新", "创新", "替代"] },
    { pattern: /leader|moderator|协调|主持/, keywords: ["coordinate", "guide", "facilitate", "协调", "引导"] },
    { pattern: /verifier|validator|验证/, keywords: ["verify", "validate", "check", "验证", "核实"] },
    { pattern: /advocate|supporter|支持/, keywords: ["support", "endorse", "argue", "支持", "论证"] },
  ];

  for (const { pattern, keywords: kws } of rolePatterns) {
    if (pattern.test(normalized)) keywords.push(...kws);
  }

  return keywords;
}

// ============================================================================
// Detector 1: FM-1.2 Role Violation
// ============================================================================

export interface RoleViolationResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 违规 agent 列表 */
  violationAgents: string[];
  /** agentId → role 一致性分数（0=完全偏离, 1=完全符合） */
  roleAlignmentScores: Record<string, number>;
  /** 平均一致性分数 */
  meanAlignment: number;
}

/**
 * FM-1.2 Role Violation 检测。
 *
 * 信号：agent 发言内容与其 role 职责关键词的重叠度低。
 *
 * 实现：
 *   1. 从 role 字符串提取职责关键词（基于模式匹配）
 *   2. 对每个 agent 的所有 messages，计算与 role 关键词的重叠度
 *   3. 平均重叠度 < threshold → role violation
 *
 * 阈值：默认 0.15（role 关键词在 message 中出现比例低于 15%）
 *
 * 局限性：
 *   - 基于 lexicon 匹配，无法捕捉语义层偏离
 *   - role 关键词映射表有限，未覆盖的角色会返回 perfect alignment（不误报）
 *   - 不修改 agent 输出，仅作为治理信号
 */
export function detectRoleViolation(
  messages: MessageInfo[],
  agentRoles: Map<string, string>,
  config?: GovernanceConfig,
): RoleViolationResult {
  if (messages.length === 0 || agentRoles.size === 0) {
    return {
      detected: false, severity: "low", violationAgents: [],
      roleAlignmentScores: {}, meanAlignment: 1,
    };
  }

  const threshold = config?.roleViolationThreshold ?? 0.15;
  const scores: Record<string, number> = {};
  const violationAgents: string[] = [];

  // 按 agent 聚合 messages
  const messagesByAgent = new Map<string, MessageInfo[]>();
  for (const msg of messages) {
    const list = messagesByAgent.get(msg.agentId) ?? [];
    list.push(msg);
    messagesByAgent.set(msg.agentId, list);
  }

  for (const [agentId, role] of agentRoles) {
    const roleKeywords = extractRoleKeywords(role);

    // 未匹配到角色模式 → 跳过（避免误报）
    if (roleKeywords.length === 0) {
      scores[agentId] = 1;
      continue;
    }

    const agentMsgs = messagesByAgent.get(agentId) ?? [];
    if (agentMsgs.length === 0) {
      scores[agentId] = 1;
      continue;
    }

    // 计算 agent 所有 messages 与 role 关键词的平均重叠度
    const roleKeywordSet = new Set(roleKeywords);
    let totalOverlap = 0;
    for (const msg of agentMsgs) {
      const msgTokens = tokenize(msg.content);
      const overlap = jaccardSimilarity(roleKeywordSet, msgTokens);
      totalOverlap += overlap;
    }
    const meanOverlap = totalOverlap / agentMsgs.length;
    scores[agentId] = meanOverlap;

    if (meanOverlap < threshold) {
      violationAgents.push(agentId);
    }
  }

  const meanAlignment = Object.values(scores).reduce((s, v) => s + v, 0) /
    Math.max(1, Object.keys(scores).length);

  const detected = violationAgents.length > 0;
  const severity: SeverityLevel = violationAgents.length >= 2 ? "high"
    : violationAgents.length === 1 ? "medium"
    : "low";

  return {
    detected,
    severity,
    violationAgents,
    roleAlignmentScores: scores,
    meanAlignment,
  };
}

// ============================================================================
// Detector 2: FM-1.3 Step Repetition
// ============================================================================

export interface StepRepetitionResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 重复 agent 列表 */
  repetitionAgents: string[];
  /** agentId → 最大相邻轮次相似度 */
  maxSimilarityByAgent: Record<string, number>;
  /** 平均最大相似度 */
  meanMaxSimilarity: number;
}

/**
 * FM-1.3 Step Repetition 检测。
 *
 * 信号：同一 agent 跨轮次发言的 token Jaccard 相似度高。
 *
 * 与 echo_chamber 的严格区分：
 *   - echo_chamber 检测 agent 之间的信息冗余（群体层）
 *   - FM-1.3 检测同一 agent 跨轮次的动作重复（个体层）
 *
 * 实现：
 *   1. 按 agent 聚合 messages，保持时间顺序
 *   2. 对每个 agent，计算相邻发言对的 Jaccard 相似度，取最大值
 *   3. 最大相似度 > threshold → step repetition
 *
 * 阈值：默认 0.7（与 echo_chamber 一致量级，但维度不同）
 */
export function detectStepRepetition(
  messages: MessageInfo[],
  config?: GovernanceConfig,
): StepRepetitionResult {
  if (messages.length === 0) {
    return {
      detected: false, severity: "low", repetitionAgents: [],
      maxSimilarityByAgent: {}, meanMaxSimilarity: 0,
    };
  }

  const threshold = config?.stepRepetitionThreshold ?? 0.7;

  // 按 agent 聚合，保持时间顺序
  const messagesByAgent = new Map<string, MessageInfo[]>();
  for (const msg of messages) {
    const list = messagesByAgent.get(msg.agentId) ?? [];
    list.push(msg);
    messagesByAgent.set(msg.agentId, list);
  }

  const maxSimByAgent: Record<string, number> = {};
  const repetitionAgents: string[] = [];

  for (const [agentId, msgs] of messagesByAgent) {
    if (msgs.length < 2) {
      maxSimByAgent[agentId] = 0;
      continue;
    }

    // 按 timestamp 排序确保相邻轮次
    const sorted = [...msgs].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp));

    let maxSim = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prevTokens = tokenize(sorted[i - 1].content);
      const currTokens = tokenize(sorted[i].content);
      const sim = jaccardSimilarity(prevTokens, currTokens);
      if (sim > maxSim) maxSim = sim;
    }
    maxSimByAgent[agentId] = maxSim;

    if (maxSim >= threshold) {
      repetitionAgents.push(agentId);
    }
  }

  const allSims = Object.values(maxSimByAgent);
  const meanMaxSim = allSims.length > 0
    ? allSims.reduce((s, v) => s + v, 0) / allSims.length
    : 0;

  const detected = repetitionAgents.length > 0;
  const severity: SeverityLevel = repetitionAgents.length >= 2 ? "high"
    : repetitionAgents.length === 1 ? "medium"
    : "low";

  return {
    detected,
    severity,
    repetitionAgents,
    maxSimilarityByAgent: maxSimByAgent,
    meanMaxSimilarity: meanMaxSim,
  };
}

// ============================================================================
// Master: Run All FC1 Detectors
// ============================================================================

export interface SystemDesignDetectionResult {
  roleViolation: RoleViolationResult;
  stepRepetition: StepRepetitionResult;
  /** 触发检测的 issue 列表（供治理引擎消费） */
  issues: GovernanceIssue[];
}

/**
 * 运行所有 FC1 (System Design) 检测器。
 *
 * 每个检测器独立运行，触发时生成对应的 GovernanceIssue。
 * 推荐的干预类型严格使用 v2.1 非破坏性干预：
 *   - role_violation → rebalance_attention（降低违规 agent 发言优先级）
 *   - step_repetition → inject_evidence（注入新证据打破重复循环）
 */
export function runSystemDesignDetectors(
  messages: MessageInfo[],
  agentRoles: Map<string, string>,
  config?: GovernanceConfig,
): SystemDesignDetectionResult {
  const roleViolation = detectRoleViolation(messages, agentRoles, config);
  const stepRepetition = detectStepRepetition(messages, config);

  const issues: GovernanceIssue[] = [];

  if (roleViolation.detected) {
    issues.push({
      type: "fm_1_2_role_violation",
      severity: roleViolation.severity,
      description: `MAST FM-1.2: ${roleViolation.violationAgents.length} agent(s) ` +
        `disobeying role specification (mean alignment=${roleViolation.meanAlignment.toFixed(2)})`,
      agents: roleViolation.violationAgents,
      source: "custom",
      suggestedIntervention: {
        type: "rebalance_attention",
        targetAgents: roleViolation.violationAgents,
        reason: "FM-1.2 Role violation: lower speaking priority of off-role agents to let role-aligned agents guide discussion back",
      },
      detectionMetrics: {
        meanAlignment: roleViolation.meanAlignment,
        violationCount: roleViolation.violationAgents.length,
      },
    });
  }

  if (stepRepetition.detected) {
    issues.push({
      type: "fm_1_3_step_repetition",
      severity: stepRepetition.severity,
      description: `MAST FM-1.3: ${stepRepetition.repetitionAgents.length} agent(s) ` +
        `repeating previous steps (mean max similarity=${stepRepetition.meanMaxSimilarity.toFixed(2)})`,
      agents: stepRepetition.repetitionAgents,
      source: "custom",
      suggestedIntervention: {
        type: "inject_evidence",
        targetAgents: stepRepetition.repetitionAgents,
        reason: "FM-1.3 Step repetition: inject novel evidence to break the repetition loop",
      },
      detectionMetrics: {
        meanMaxSimilarity: stepRepetition.meanMaxSimilarity,
        repetitionCount: stepRepetition.repetitionAgents.length,
      },
    });
  }

  return {
    roleViolation,
    stepRepetition,
    issues,
  };
}
