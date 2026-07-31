/**
 * FC3 (MAST): Task Verification 检测器
 *
 * 对齐 MAST (arXiv:2503.13657) FC3 类别，覆盖：
 *   - FM-3.1 Premature termination（过早终止）
 *
 * 设计原则（与 cognitiveDetectors.ts / systemDesignDetectors.ts 一致）：
 *   - 纯函数，零 LLM 成本，确定性
 *   - 独立可测试，不依赖任何引擎
 *   - 输出 GovernanceIssue[]，可与认知/FC1 检测器 issues 合并
 *
 * 与现有检测器的严格区分（重要 — 修订 archive/TECHNICAL_REPORT.md 中的夸大标注）：
 *   - premature_consensus（cognitiveDetectors.ts）检测早期共识 → FM-3.1 的前兆信号（预防性）
 *   - FM-3.1 检测 agent 已发出终止信号但验证证据不足 → 事后失败检测
 *   - 两者并存：premature_consensus 防患于未然，FM-3.1 识别已发生的过早终止
 *
 * 与 TerminationDecider（thermodynamics/TerminationDecider.ts）的区分：
 *   - TerminationDecider 是系统级终止判定（基于 R/T/H 热力学状态），覆盖 FM-1.5
 *   - FM-3.1 是 agent 输出层失败检测（agent 主动宣布完成但验证不足）
 */

import type {
  MessageInfo,
  GovernanceIssue,
  GovernanceConfig,
  SeverityLevel,
} from "./types";

// ============================================================================
// Termination Signal Patterns
// ============================================================================

/**
 * 终止信号词模式。
 *
 * 匹配 agent 输出中表达"任务完成"意图的短语。
 * 基于项目实验观察 + MAST 论文 N.13 示例归纳。
 */
const TERMINATION_PATTERNS: RegExp[] = [
  // 英文
  /\bfinal\s+answer\b/i,
  /\bI'?\s*m\s+done\b/i,
  /\btask\s+is\s+complete/i,
  /\btask\s+complete/i,
  /\bwe\s+are\s+done\b/i,
  /\bwe\s+have\s+finished\b/i,
  /\bI\s+have\s+finished\b/i,
  /\bconclude(?:d|s)?\s+that\b/i,
  /\bthe\s+answer\s+is\b/i,
  /\bno\s+further\s+discussion\b/i,
  // 中文
  /最终答案/,
  /任务完成/,
  /讨论结束/,
  /我已经完成了/,
  /我们已经完成了/,
  /结论是/,
  /无需进一步讨论/,
];

// ============================================================================
// Detector: FM-3.1 Premature Termination
// ============================================================================

export interface PrematureTerminationResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 发出终止信号但验证不足的 agent 列表 */
  prematureAgents: string[];
  /** agentId → 检测细节 */
  details: Record<string, {
    /** 是否发出终止信号 */
    hasTerminationSignal: boolean;
    /** evidence 数量 */
    evidenceCount: number;
    /** 是否判定为过早终止 */
    isPremature: boolean;
  }>;
}

/**
 * 检测文本是否包含终止信号词。
 *
 * @param text agent 输出文本（content 或 reasoning）
 * @returns 匹配到的终止信号词数量（0 = 无终止信号）
 */
export function countTerminationSignals(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const pattern of TERMINATION_PATTERNS) {
    if (pattern.test(text)) count++;
  }
  return count;
}

/**
 * FM-3.1 Premature Termination 检测。
 *
 * 信号：agent 发出终止信号词（"final answer", "task complete" 等）
 *       但其 evidence 数量 < threshold（验证不充分）。
 *
 * 与 premature_consensus 的严格区分：
 *   - premature_consensus 在任务**尚未**被终止时检测早期共识（预防性）
 *   - FM-3.1 在 agent **已经**发出终止信号时检测验证不足（事后）
 *
 * 与 TerminationDecider 的严格区分：
 *   - TerminationDecider 基于 R/T/H 热力学状态判定系统级终止（FM-1.5）
 *   - FM-3.1 基于 agent 输出文本检测 agent 主动宣布完成（FM-3.1）
 *
 * 实现：
 *   1. 扫描每个 agent 的最新 message，匹配终止信号词
 *   2. 对发出终止信号的 agent，检查其 evidence 数量
 *   3. evidence 数量 < threshold → 过早终止
 *
 * 阈值：默认 evidence 数量 < 2（MAST FM-3.1 验证不充分的典型表现）
 *
 * 局限性：
 *   - 终止信号词表有限，可能漏报新表达方式
 *   - evidence 数量是粗粒度指标，不评估 evidence 质量
 *   - 不阻止 agent 输出，仅作为治理信号
 */
export function detectPrematureTermination(
  messages: MessageInfo[],
  config?: GovernanceConfig,
): PrematureTerminationResult {
  if (messages.length === 0) {
    return {
      detected: false, severity: "low", prematureAgents: [], details: {},
    };
  }

  const evidenceThreshold = config?.prematureTerminationEvidenceThreshold ?? 2;

  // 按 agent 聚合，取每个 agent 最新的一条 message（终止信号通常在最后）
  const latestMessageByAgent = new Map<string, MessageInfo>();
  for (const msg of messages) {
    const existing = latestMessageByAgent.get(msg.agentId);
    if (!existing || msg.timestamp > existing.timestamp) {
      latestMessageByAgent.set(msg.agentId, msg);
    }
  }

  const details: PrematureTerminationResult["details"] = {};
  const prematureAgents: string[] = [];

  for (const [agentId, msg] of latestMessageByAgent) {
    // 检查 content 和 reasoning 中的终止信号
    const textToCheck = `${msg.content} ${msg.reasoning ?? ""}`;
    const signalCount = countTerminationSignals(textToCheck);
    const hasTerminationSignal = signalCount > 0;

    // 统计 evidence 数量（msg.evidence 是 string[]）
    const evidenceCount = msg.evidence?.length ?? 0;

    // 过早终止判定：发出终止信号但 evidence 不足
    const isPremature = hasTerminationSignal && evidenceCount < evidenceThreshold;

    details[agentId] = {
      hasTerminationSignal,
      evidenceCount,
      isPremature,
    };

    if (isPremature) {
      prematureAgents.push(agentId);
    }
  }

  const detected = prematureAgents.length > 0;
  const severity: SeverityLevel = prematureAgents.length >= 2 ? "high"
    : prematureAgents.length === 1 ? "medium"
    : "low";

  return {
    detected,
    severity,
    prematureAgents,
    details,
  };
}

// ============================================================================
// Master: Run All FC3 Detectors
// ============================================================================

export interface TaskVerificationDetectionResult {
  prematureTermination: PrematureTerminationResult;
  /** 触发检测的 issue 列表（供治理引擎消费） */
  issues: GovernanceIssue[];
}

/**
 * 运行所有 FC3 (Task Verification) 检测器。
 *
 * 每个检测器独立运行，触发时生成对应的 GovernanceIssue。
 * 推荐的干预类型严格使用 v2.1 非破坏性干预：
 *   - premature_termination → inject_evidence（注入未验证证据，提示需要进一步验证）
 *
 * 注：FM-3.2（无/不完整验证）和 FM-3.3（错误验证）需要任务级 schema 或外部
 * 验证器，超出当前观测层检测器范围，留作 Future Work。
 */
export function runTaskVerificationDetectors(
  messages: MessageInfo[],
  config?: GovernanceConfig,
): TaskVerificationDetectionResult {
  const prematureTermination = detectPrematureTermination(messages, config);

  const issues: GovernanceIssue[] = [];

  if (prematureTermination.detected) {
    for (const agentId of prematureTermination.prematureAgents) {
      const detail = prematureTermination.details[agentId];
      issues.push({
        type: "fm_3_1_premature_termination",
        severity: prematureTermination.severity,
        description: `MAST FM-3.1: Agent ${agentId} emitted termination signal ` +
          `with insufficient evidence (count=${detail.evidenceCount}, threshold=${config?.prematureTerminationEvidenceThreshold ?? 2})`,
        agents: [agentId],
        source: "custom",
        suggestedIntervention: {
          type: "inject_evidence",
          targetAgents: [agentId],
          reason: "FM-3.1 Premature termination: inject unverified evidence to signal that verification is incomplete",
        },
        detectionMetrics: {
          evidenceCount: detail.evidenceCount,
          hasTerminationSignal: detail.hasTerminationSignal ? 1 : 0,
        },
      });
    }
  }

  return {
    prematureTermination,
    issues,
  };
}
