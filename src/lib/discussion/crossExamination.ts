/**
 * 对立阵营交叉质证引擎
 *
 * 范式转变: 从「消除分歧」到「利用分歧」。
 *
 * 传统治理: 检测到极化 → 干预让 Agent 回到中间 (消除分歧)
 * 交叉质证: 检测到分歧 → 主动分组 → 双方充分辩论 → 综合最优解 (利用分歧)
 *
 * 灵感来源:
 * - 美国最高法院的对抗制辩论
 * - 学术 peer review 的 rebuttal 机制
 * - AI Safety 的 Red Team / Blue Team
 * - "Deliberative Alignment" (Anthropic, 2024)
 *
 * 五阶段流程:
 *  Phase 1: 检测分歧 (divergence > threshold → activate)
 *  Phase 2: 形成阵营 (belief > 0 → pro, belief < 0 → con)
 *  Phase 3: 阵营内部提炼最强论点
 *  Phase 4: 交叉质证 (互驳 Top-3 论点)
 *  Phase 5: 综合裁决 (共识 + minority report)
 */

import type { AgentOpinion } from "./types";

// DiscussionAgent 定义在 index.ts 而非 types.ts — 此处最小化引用
export interface CrossExamAgent {
  id: string;
  sendMessage(message: string): Promise<string>;
  getState(): { belief: number; confidence: number };
}

// ============================================================================
// 类型
// ============================================================================

export type Camp = "pro" | "con";

export interface CampMember {
  agentId: string;
  belief: number;
  confidence: number;
  keyArguments: string[];
}

export interface CampPosition {
  camp: Camp;
  members: CampMember[];
  /** 阵营平均信念 */
  avgBelief: number;
  /** 阵营的 Top-3 最强论点 */
  strongestArguments: string[];
  /** 阵营的支撑证据 */
  evidence: string[];
}

export interface CrossExaminationRound {
  round: number;
  /** 攻击方论点 */
  challenge: string;
  /** 攻击方阵营 */
  challenger: Camp;
  /** 防守方回应 */
  response: string;
  /** 防守方阵营 */
  respondent: Camp;
  /** 质证后信念变化 */
  beliefShift: number;
}

export interface CrossExaminationResult {
  /** 是否触发了交叉质证 */
  activated: boolean;
  /** 分歧指数 [0,1] — 触发时的信念分歧程度 */
  divergenceIndex: number;
  /** Pro 阵营 */
  proCamp: CampPosition;
  /** Con 阵营 */
  conCamp: CampPosition;
  /** 所有质证轮次 */
  rounds: CrossExaminationRound[];
  /** 综合裁决 */
  synthesis: SynthesisResult;
}

export interface SynthesisResult {
  /** 共识点 — 双方都同意的结论 */
  consensusPoints: string[];
  /** 少数派报告 — 被否决但有保留价值的观点 */
  minorityReport: string[];
  /** 最终决定 */
  finalDecision: string;
  /** 综合信念 [0,1] — 考虑了 minority report 后的加权信念 */
  synthesizedBelief: number;
  /** 分歧是否被保留 (true=同意保留分歧, false=一方被说服) */
  dissentPreserved: boolean;
}

// ============================================================================
// Phase 1: 分歧检测
// ============================================================================

/**
 * 判断当前状态是否适合启动交叉质证。
 *
 * 触发条件 (同时满足):
 * 1. Agent 信念标准差 > θ_divergence (存在实质分歧)
 * 2. 讨论还未收敛
 * 3. Agent 数量 ≥ 4 (至少每个阵营 2 人)
 */
export function shouldActivateCrossExamination(
  opinions: AgentOpinion[],
  config?: { divergenceThreshold?: number; minAgentsPerCamp?: number },
): { activate: boolean; divergenceIndex: number } {
  const threshold = config?.divergenceThreshold ?? 0.3;
  const minPerCamp = config?.minAgentsPerCamp ?? 2;

  if (opinions.length < minPerCamp * 2) {
    return { activate: false, divergenceIndex: 0 };
  }

  const beliefs = opinions.map(o => o.belief);
  const mean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
  const std = Math.sqrt(
    beliefs.reduce((s, b) => s + (b - mean) ** 2, 0) / beliefs.length
  );

  // 检查两边至少各有 minPerCamp 个 Agent
  const proCount = beliefs.filter(b => b > 0).length;
  const conCount = beliefs.filter(b => b < 0).length;

  const activate = std > threshold && proCount >= minPerCamp && conCount >= minPerCamp;

  return {
    activate,
    divergenceIndex: Math.round(std * 100) / 100,
  };
}

// ============================================================================
// Phase 2: 形成阵营
// ============================================================================

/**
 * 按信念符号分组。中立 Agent (belief ≈ 0) 分配到离自己更近的阵营。
 */
export function formCamps(opinions: AgentOpinion[]): {
  proCamp: CampPosition;
  conCamp: CampPosition;
} {
  const proMembers: CampMember[] = [];
  const conMembers: CampMember[] = [];

  for (const o of opinions) {
    const member: CampMember = {
      agentId: o.agentId,
      belief: o.belief,
      confidence: o.confidence,
      keyArguments: extractArguments(o.reasoning),
    };

    if (o.belief > 0) {
      proMembers.push(member);
    } else if (o.belief < 0) {
      conMembers.push(member);
    } else {
      // 中立项: 分配到人数少的阵营 (保证平衡)
      if (proMembers.length <= conMembers.length) {
        proMembers.push(member);
      } else {
        conMembers.push(member);
      }
    }
  }

  // 提炼阵营最强论点: 按 confidence 加权投票
  const extractTopArguments = (members: CampMember[]): string[] => {
    const argScores = new Map<string, number>();
    for (const m of members) {
      for (const arg of m.keyArguments) {
        argScores.set(arg, (argScores.get(arg) || 0) + m.confidence);
      }
    }
    return Array.from(argScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([arg]) => arg);
  };

  const extractEvidence = (members: CampMember[]): string[] => {
    return members
      .filter(m => m.confidence > 60)
      .flatMap(m => m.keyArguments.slice(0, 2));
  };

  return {
    proCamp: {
      camp: "pro",
      members: proMembers,
      avgBelief: proMembers.length > 0
        ? proMembers.reduce((s, m) => s + m.belief, 0) / proMembers.length
        : 0,
      strongestArguments: extractTopArguments(proMembers),
      evidence: extractEvidence(proMembers),
    },
    conCamp: {
      camp: "con",
      members: conMembers,
      avgBelief: conMembers.length > 0
        ? conMembers.reduce((s, m) => s + m.belief, 0) / conMembers.length
        : 0,
      strongestArguments: extractTopArguments(conMembers),
      evidence: extractEvidence(conMembers),
    },
  };
}

// ============================================================================
// Phase 3 & 4: 交叉质证
// ============================================================================

/**
 * 生成质证提示词 — Pro 阵营攻击 Con 的最强论点。
 */
export function buildChallengePrompt(
  challenger: CampPosition,
  respondent: CampPosition,
  round: number,
): { proPrompt: string; conPrompt: string } {
  const proArgs = respondent.camp === "con"
    ? respondent.strongestArguments.map((a, i) => `${i + 1}. ${a}`).join("\n")
    : challenger.strongestArguments.map((a, i) => `${i + 1}. ${a}`).join("\n");

  const conArgs = respondent.camp === "pro"
    ? respondent.strongestArguments.map((a, i) => `${i + 1}. ${a}`).join("\n")
    : challenger.strongestArguments.map((a, i) => `${i + 1}. ${a}`).join("\n");

  return {
    proPrompt:
      `⚖️ 交叉质证 第 ${round} 轮\n\n`
      + `你是 PRO 阵营的代表。对方 (CON 阵营) 提出了以下核心论点，你必须逐一回应：\n\n${proArgs}\n\n`
      + `回应要求：\n`
      + `1. 对每个论点，指出其逻辑漏洞或证据不足\n`
      + `2. 用你阵营的证据反驳\n`
      + `3. 如果对方某个论点有道理，诚实承认（这不会削弱你的立场）\n`
      + `4. 承认后，解释为什么你的总体结论仍然成立\n`
      + `\n请以 JSON 格式回复：{"emotion": 你的确信度(-100到100), "reasoning": "你的质证回应"}`,

    conPrompt:
      `⚖️ 交叉质证 第 ${round} 轮\n\n`
      + `你是 CON 阵营的代表。对方 (PRO 阵营) 提出了以下核心论点，你必须逐一回应：\n\n${conArgs}\n\n`
      + `回应要求：\n`
      + `1. 对每个论点，指出其逻辑漏洞或证据不足\n`
      + `2. 用你阵营的证据反驳\n`
      + `3. 如果对方某个论点有道理，诚实承认（这不会削弱你的立场）\n`
      + `4. 承认后，解释为什么你的总体结论仍然成立\n`
      + `\n请以 JSON 格式回复：{"emotion": 你的确信度(-100到100), "reasoning": "你的质证回应"}`,
  };
}

// ============================================================================
// Phase 5: 综合裁决
// ============================================================================

/**
 * 从交叉质证结果中综合裁决。
 *
 * 输出两部分:
 * - consensusPoints: 双方都接受的结论
 * - minorityReport: 被多数否决但值得保留的少数派观点
 */
export function synthesizeVerdict(
  proCamp: CampPosition,
  conCamp: CampPosition,
  crossExaminationRounds: CrossExaminationRound[],
): SynthesisResult {
  // 1. 找出共识点: 双方论点中有交集的部分
  const proArgs = new Set(proCamp.strongestArguments);
  const conArgs = new Set(conCamp.strongestArguments);

  // 共识不是简单的交集 — 而是质证中双方承认的部分
  const consensusPoints: string[] = [];
  const minorityReport: string[] = [];

  // 信念差异度 → 判断是否需要保留 minority report
  const beliefGap = Math.abs(proCamp.avgBelief - conCamp.avgBelief);
  const dissentPreserved = beliefGap > 0.3; // 差距 > 0.3 → 保留分歧

  // 从质证轮次提取共识和保留
  for (const round of crossExaminationRounds) {
    // 如果质证后信念移位 < 0.1, 说明双方都坚持 — 这是真正的分歧点
    if (Math.abs(round.beliefShift) < 0.1) {
      minorityReport.push(
        `${round.respondent.toUpperCase()} 阵营坚持: ${round.response.slice(0, 200)}`
      );
    } else if (Math.abs(round.beliefShift) > 0.2) {
      // 信念显著移位 → 一方被说服 → 共识点
      consensusPoints.push(
        `${round.challenger.toUpperCase()} 阵营的论点被接受: ${round.challenge.slice(0, 150)}`
      );
    }
  }

  // 确保有至少一个共识点
  if (consensusPoints.length === 0) {
    consensusPoints.push("双方同意在该问题上存在合理分歧");
  }

  // 加权综合信念: 按阵营大小和置信度计算
  const proWeight = proCamp.members.reduce((s, m) => s + m.confidence, 0);
  const conWeight = conCamp.members.reduce((s, m) => s + m.confidence, 0);
  const totalWeight = proWeight + conWeight || 1;
  const synthesizedBelief = (
    (proCamp.avgBelief * proWeight + conCamp.avgBelief * conWeight) / totalWeight
  );

  const finalDecision = dissentPreserved
    ? `综合裁决: ${consensusPoints.join("; ")}。注意: 存在少数派保留意见 — ${minorityReport.slice(0, 2).join(" | ")}`
    : `综合裁决: ${consensusPoints.join("; ")}。双方在质证后达成共识。`;

  return {
    consensusPoints,
    minorityReport: minorityReport.slice(0, 3), // Top 3 minority points
    finalDecision,
    synthesizedBelief: Math.round(synthesizedBelief * 100) / 100,
    dissentPreserved,
  };
}

// ============================================================================
// 辅助
// ============================================================================

/** 从推理文本中提取关键论点 (基于句号/分号分句 + 置信度加权) */
function extractArguments(reasoning: string): string[] {
  if (!reasoning || reasoning.length < 10) return [];
  // 按中文/英文标点分句
  const sentences = reasoning
    .split(/[。；;.\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 4 && s.length < 300);
  // 取前 5 个最长/最实质的句子作为论点；至少返回一个
  const args = sentences.sort((a, b) => b.length - a.length).slice(0, 5);
  return args.length > 0 ? args : [reasoning.slice(0, 200)];
}

/**
 * 计算质证后的信念移位。
 *
 * 如果回应中包含了承认对方的词汇 ("承认"、"同意"、"有道理"、"correct"、
 * "agree"、"valid")，则向对方方向移位；否则保持。
 */
export function computeBeliefShift(
  originalBelief: number,
  crossExamResponse: string,
  opponentBelief: number,
): number {
  const concessionPatterns = [
    "承认", "同意", "有道理", "确实", "正确",
    "concede", "agree", "valid", "correct", "fair point",
  ];

  const hasConcession = concessionPatterns.some(p =>
    crossExamResponse.toLowerCase().includes(p.toLowerCase())
  );

  if (hasConcession) {
    // 向对方方向移动 10-30%
    const shift = (opponentBelief - originalBelief) * 0.2;
    return shift;
  }

  return 0;
}
