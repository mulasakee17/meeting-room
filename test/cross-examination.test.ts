/**
 * 对立阵营交叉质证测试
 */
import { describe, it, expect } from "vitest";
import {
  shouldActivateCrossExamination,
  formCamps,
  buildChallengePrompt,
  synthesizeVerdict,
  computeBeliefShift,
} from "@/lib/discussion/crossExamination";

describe("Cross-Examination Engine", () => {
  // -- Phase 1: 分歧检测 --
  it("高分歧+两边各2人应激活", () => {
    const result = shouldActivateCrossExamination([
      { agentId: "a1", belief: 0.8, confidence: 80, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a2", belief: 0.7, confidence: 75, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a3", belief: -0.8, confidence: 80, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a4", belief: -0.7, confidence: 75, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
    ]);
    expect(result.activate).toBe(true); // 两边都有 ≥2, std > 0.3
  });

  it("只有一方有足够人数不应激活", () => {
    const result = shouldActivateCrossExamination([
      { agentId: "a1", belief: 0.8, confidence: 80, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a2", belief: 0.7, confidence: 75, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a3", belief: 0.6, confidence: 70, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a4", belief: -0.2, confidence: 60, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
    ]);
    expect(result.activate).toBe(false);
  });

  it("信念太集中不应激活", () => {
    const result = shouldActivateCrossExamination([
      { agentId: "a1", belief: 0.2, confidence: 80, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a2", belief: 0.1, confidence: 75, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a3", belief: -0.1, confidence: 70, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a4", belief: -0.2, confidence: 65, reasoning: "ok", evidence: [], nextOpinion: "", referencedAgents: [] },
    ]);
    expect(result.activate).toBe(false);
  });

  // -- Phase 2: 形成阵营 --
  it("应该按信念符号分组", () => {
    const { proCamp, conCamp } = formCamps([
      { agentId: "a1", belief: 0.8, confidence: 90, reasoning: "AI前景积极。技术进步快。应用广泛。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a2", belief: 0.6, confidence: 80, reasoning: "确实有潜力但也需谨慎", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a3", belief: -0.5, confidence: 85, reasoning: "数据隐私是关键风险。监管不足。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a4", belief: -0.7, confidence: 90, reasoning: "过度依赖AI会削弱人的判断。安全隐患巨大。", evidence: [], nextOpinion: "", referencedAgents: [] },
    ]);
    expect(proCamp.members.length).toBe(2);
    expect(conCamp.members.length).toBe(2);
    expect(proCamp.avgBelief).toBeGreaterThan(0);
    expect(conCamp.avgBelief).toBeLessThan(0);
    expect(proCamp.strongestArguments.length).toBeGreaterThan(0);
    expect(conCamp.strongestArguments.length).toBeGreaterThan(0);
  });

  // -- Phase 3 & 4: 质证提示词 --
  it("应该生成双向质证提示词", () => {
    const { proCamp, conCamp } = formCamps([
      { agentId: "a1", belief: 0.8, confidence: 90, reasoning: "AI前景积极。技术进步快。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a2", belief: 0.6, confidence: 80, reasoning: "有潜力但需谨慎。医疗应用前景好。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a3", belief: -0.5, confidence: 85, reasoning: "隐私风险高。监管不足。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a4", belief: -0.7, confidence: 90, reasoning: "安全隐患大。过度依赖危险。", evidence: [], nextOpinion: "", referencedAgents: [] },
    ]);
    const prompts = buildChallengePrompt(proCamp, conCamp, 1);
    expect(prompts.proPrompt).toContain("交叉质证");
    expect(prompts.proPrompt).toContain("PRO");
    expect(prompts.conPrompt).toContain("CON");
  });

  // -- Phase 5: 综合裁决 --
  it("应该综合裁决并保留 minority report", () => {
    const { proCamp, conCamp } = formCamps([
      { agentId: "a1", belief: 0.9, confidence: 90, reasoning: "AI前景极好。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a2", belief: 0.5, confidence: 75, reasoning: "有潜力。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a3", belief: -0.8, confidence: 88, reasoning: "风险太大。", evidence: [], nextOpinion: "", referencedAgents: [] },
      { agentId: "a4", belief: -0.6, confidence: 82, reasoning: "不安全。", evidence: [], nextOpinion: "", referencedAgents: [] },
    ]);

    const rounds = [
      {
        round: 1,
        challenge: "数据隐私风险被夸大",
        challenger: "pro" as const,
        response: "我们承认部分隐私技术已有改善，但整体监管仍落后于技术发展",
        respondent: "con" as const,
        beliefShift: 0.15,
      },
      {
        round: 2,
        challenge: "AI 的经济效益被低估",
        challenger: "con" as const,
        response: "经济效益确实存在，但不能以牺牲安全为代价",
        respondent: "pro" as const,
        beliefShift: -0.1,
      },
    ];

    const synthesis = synthesizeVerdict(proCamp, conCamp, rounds);
    expect(synthesis.consensusPoints.length).toBeGreaterThan(0);
    expect(synthesis.dissentPreserved).toBe(true); // gap > 0.3
    expect(synthesis.finalDecision.length).toBeGreaterThan(20);
  });

  // -- 信念移位计算 --
  it("包含承认词应产生向对方的移位", () => {
    const shift = computeBeliefShift(0.8, "我承认对方的数据分析有道理", -0.5);
    expect(shift).toBeLessThan(0); // 向 negative 方向移
  });

  it("不包含承认词移位为零", () => {
    const shift = computeBeliefShift(0.8, "我坚持我的立场，对方论据不充分", -0.5);
    expect(shift).toBe(0);
  });
});
