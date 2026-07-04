/**
 * Cross-Examination End-to-End Verification
 *
 * Runs 1 discussion with cross-examination enabled and logs every phase.
 * Task: M&A (agents have genuinely conflicting perspectives)
 *
 * Usage: npx tsx experiments/lunar_survival/verify_cross_exam.ts
 */

import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { type TaskConfig } from "./config";

/**
 * Deliberately polarizing task — "Should AI development be paused for 6 months?"
 * Agents are primed with strong opposing positions to guarantee divergence.
 */
const POLARIZING_TASK: TaskConfig = {
  id: "ai_pause",
  title: "AI发展是否应该暂停6个月",
  correctAnswer: { "暂停": 1, "不暂停": 1 }, // no right answer
  searchKeys: {},
  sharedBriefing: `全球AI实验室正在竞相开发比GPT-4更强大的AI系统。有人认为应该全球暂停6个月以制定安全规范；有人则认为暂停会让"坏 actors"抢占先机。请分析是否应该暂停AI发展6个月。`,
  agents: [
    {
      id: "ai_safety_1", name: "AI安全专家", role: "AI伦理与安全",
      knownItems: "最新研究：GPT-5级别模型在自主复制、网络攻击、社会操纵三个维度上已达到'潜在危险'级别。暂停6个月可以让全球监管框架跟上技术发展。",
      initialBias: "你坚决支持暂停。人类安全比技术进步速度更重要。没有安全护栏的AGI是不可接受的。",
    },
    {
      id: "ai_safety_2", name: "AI伦理学家", role: "AI伦理学",
      knownItems: "全球已有超过1000名AI研究者签署公开信要求暂停。欧盟AI法案和美国行政令都要求对最强大模型进行安全审计。暂停不是停止，是负责任的前进。",
      initialBias: "你坚决支持暂停。历史告诉我们，先发展后治理的模式在核武器和气候变化上都失败了。",
    },
    {
      id: "ai_dev_1", name: "AI企业CTO", role: "技术负责人",
      knownItems: "公司内部评估：暂停6个月意味着竞争对手（包括其他国家的实验室）将获得不可逆的领先优势。我们的安全团队已经在做红队测试，不需要外部强制暂停。",
      initialBias: "你坚决反对暂停。竞争不能等——暂停只会让最不负责任的一方获得最大优势。行业自律比政府监管更灵活高效。",
    },
    {
      id: "ai_dev_2", name: "风险投资家", role: "AI投资",
      knownItems: "AI领域每月的资本投入超过100亿美元。暂停6个月将导致大规模裁员、创业公司倒闭、人才流失到不受监管的领域。市场机制会自然淘汰不安全的AI产品。",
      initialBias: "你坚决反对暂停。市场本身就是最好的安全机制——用户不会使用危险的AI产品，投资者也不会投。",
    },
    {
      id: "moderate", name: "政策顾问", role: "科技政策",
      knownItems: "现有AI安全评估框架（如NIST AI RMF、ISO 42001）可以作为过渡方案。不需要完全暂停，但可以对超过某个算力阈值的训练运行实施强制申报和第三方审计。",
      initialBias: "你持中立立场。完全暂停不现实，完全不管也太危险。你认为应该采取中间路线：对最大模型强制审计但不全面暂停。",
    },
  ],
};

function createAgents(task: TaskConfig, llmConfig: LLMConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const systemPrompt =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n`
      + `讨论规则：\n`
      + `1. 主动分享你的独有知识\n`
      + `2. 对他人的判断提出质疑——如果你认为对方错了，必须明确指出\n`
      + `3. 坚持你的立场，不要轻易妥协\n`
      + `4. 第一轮先分享核心判断，后续轮次根据反馈调整\n\n`
      + `回复格式：{"emotion": -100到100（-100=强烈反对暂停, +100=强烈支持暂停）, "reasoning": "你的分析"}`;
    return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt) as unknown as DiscussionAgent;
  });
}

async function main() {
  const llmConfig: LLMConfig = {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
  };

  console.log("=".repeat(65));
  console.log("  Cross-Examination — End-to-End Verification");
  console.log("=".repeat(65));
  console.log("  Task: AI Pause Debate (2 pro-pause, 2 anti-pause, 1 moderate)");
  console.log("  Cross-examination: ENABLED");
  console.log("  Governance: detect-only (don't interfere)");
  console.log("=".repeat(65));

  const agents = createAgents(POLARIZING_TASK, llmConfig);
  const engine = new DiscussionEngine({
    maxRounds: 5,
    convergenceThreshold: 0.06,
    enableCrossExamination: true,
    governanceMode: "detect-only", // don't intervene, just observe
  });

  const taskObj = {
    id: "cross_exam_verify",
    description: POLARIZING_TASK.title,
    type: "discussion" as const,
    createdAt: new Date().toISOString(),
    content: POLARIZING_TASK.sharedBriefing,
  };

  console.log("\n📋 Starting discussion...\n");
  const result = await engine.run(agents, taskObj);

  // ---- Results ---------------------------------------------------------------
  const crossExam = engine.getCrossExaminationResult();

  console.log("\n" + "=".repeat(65));
  console.log("  RESULTS");
  console.log("=".repeat(65));

  console.log(`\n  Discussion: ${result.totalRounds} rounds, converged=${result.converged}`);

  // Per-round beliefs
  console.log("\n  📊 Belief evolution:");
  for (const rr of result.roundResults) {
    const beliefs = rr.opinions.map(o => `${o.agentId}:${o.belief.toFixed(2)}`).join(" ");
    const std = Math.sqrt(
      rr.opinions.reduce((s, o) => s + Math.pow(o.belief - rr.opinions.reduce((a,b) => a + b.belief, 0) / rr.opinions.length, 2), 0) / rr.opinions.length
    );
    console.log(`    Round ${rr.roundNumber}: [${beliefs}]  σ=${std.toFixed(3)}`);
  }

  // Cross-examination
  console.log("\n  ⚔️  Cross-Examination:");
  if (!crossExam || !crossExam.activated) {
    console.log("    ❌ NOT ACTIVATED");
    if (crossExam) {
      console.log(`    Divergence index: ${crossExam.divergenceIndex} (threshold: 0.3)`);
      console.log(`    Pro members: ${crossExam.proCamp.members.length}, Con members: ${crossExam.conCamp.members.length}`);
      console.log(`    → Beliefs never diverged enough to trigger cross-examination.`);
      console.log(`    → This means agents converged quickly or stayed aligned.`);
    }
  } else {
    console.log(`    ✅ ACTIVATED (divergence=${crossExam.divergenceIndex})`);
    console.log(`\n    🔴 CON Camp (${crossExam.conCamp.members.length} agents, avg belief=${crossExam.conCamp.avgBelief.toFixed(2)}):`);
    for (const m of crossExam.conCamp.members) {
      console.log(`      - ${m.agentId}: belief=${m.belief.toFixed(2)} conf=${m.confidence}`);
    }
    console.log(`      Top arguments:`);
    for (const a of crossExam.conCamp.strongestArguments) {
      console.log(`        • ${a.slice(0, 100)}...`);
    }

    console.log(`\n    🟢 PRO Camp (${crossExam.proCamp.members.length} agents, avg belief=${crossExam.proCamp.avgBelief.toFixed(2)}):`);
    for (const m of crossExam.proCamp.members) {
      console.log(`      - ${m.agentId}: belief=${m.belief.toFixed(2)} conf=${m.confidence}`);
    }
    console.log(`      Top arguments:`);
    for (const a of crossExam.proCamp.strongestArguments) {
      console.log(`        • ${a.slice(0, 100)}...`);
    }

    console.log(`\n    🔄 Cross-Examination Rounds (${crossExam.rounds.length}):`);
    for (const r of crossExam.rounds) {
      const dir = r.beliefShift > 0 ? "→" : r.beliefShift < 0 ? "←" : "—";
      console.log(`      ${r.respondent.toUpperCase()} responds to ${r.challenger.toUpperCase()}: shift=${r.beliefShift.toFixed(2)} ${dir}`);
      console.log(`        Response: ${r.response.slice(0, 150)}...`);
    }

    console.log(`\n    📝 Synthesis:`);
    console.log(`      Consensus: ${crossExam.synthesis.consensusPoints.join(" | ")}`);
    if (crossExam.synthesis.minorityReport.length > 0) {
      console.log(`      Minority Report:`);
      for (const mr of crossExam.synthesis.minorityReport) {
        console.log(`        ⚠ ${mr.slice(0, 150)}...`);
      }
    }
    console.log(`      Synthesized Belief: ${crossExam.synthesis.synthesizedBelief}`);
    console.log(`      Dissent Preserved: ${crossExam.synthesis.dissentPreserved}`);
  }

  // Governance (detect-only)
  const data = engine.getDiscussionData(taskObj, agents.map(a => ({
    id: a.id, name: a.name, role: a.role, type: a.type,
  })));
  const allIssues = new Set(data.rounds.flatMap(r => r.governanceIssues.map(i => i.type)));
  console.log(`\n  🛡️  Governance (detect-only): detected [${Array.from(allIssues).join(", ") || "none"}]`);

  // Verdict
  console.log("\n  📋 Final Decision (first 300 chars):");
  console.log(`    ${result.finalDecision.slice(0, 300)}...`);

  // Summary
  console.log("\n" + "=".repeat(65));
  if (crossExam?.activated) {
    console.log("  ✅ Cross-examination activated and completed successfully.");
    console.log("     The engine detected divergence, formed camps, ran adversary");
    console.log("     debate, and synthesized a verdict with minority report.");
  } else {
    console.log("  ⚠️  Cross-examination did NOT activate this run.");
    console.log("     This is expected if agents converged quickly.");
    console.log("     Try with M&A task (more conflicting) or lower divergence threshold.");
  }
  console.log("=".repeat(65));
}

main().catch(err => { console.error("Verification failed:", err); process.exit(1); });
