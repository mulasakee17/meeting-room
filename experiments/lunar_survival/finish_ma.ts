/**
 * 补充运行 MA 任务 full-governance 组缺失的 9 次实验
 * npx tsx experiments/lunar_survival/finish_ma.ts
 */
import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine } from "../../src/lib/discussion";
import { GovernanceEngine } from "../../src/lib/governance";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { TASK_MA, GOVERNANCE_BASE_CONFIG } from "./config";

async function main() {
  const llmConfig: LLMConfig = { provider: "deepseek", model: "deepseek-chat", temperature: 0.2 };
  const govEngine = new GovernanceEngine();
  const keys = TASK_MA.searchKeys || {};

  for (let i = 0; i < 9; i++) {
    process.stdout.write(`MA full run ${i + 1}/9...`);

    const agents = TASK_MA.agents.map(info => {
      const sp = `${TASK_MA.sharedBriefing}\n\n---\n你的独有知识：\n${info.knownItems}\n---\n${info.initialBias}\n\n讨论规则：分享独有知识，质疑他人。\n格式：{"emotion":-100到100,"reasoning":"分析"}`;
      return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, sp) as any;
    });

    const engine = new DiscussionEngine({ maxRounds: 5, convergenceThreshold: 0.06 });
    const task = { id: `ma_full_${i}`, description: "并购", type: "discussion" as const, createdAt: new Date().toISOString(), content: TASK_MA.sharedBriefing };
    const result = await engine.run(agents, task);

    // Keyword accuracy
    const allText = result.roundResults.flatMap(r => r.opinions.map(o => o.reasoning)).join("\n");
    let score = 0;
    for (const [item] of Object.entries(TASK_MA.correctAnswer)) {
      const kws = keys[item] || [item];
      const fp = Math.min(...kws.map(kw => { const idx = allText.indexOf(kw); return idx >= 0 ? idx : Infinity; }));
      if (fp < Infinity) score += 1 - fp / Math.max(allText.length, 1) * 0.5;
    }
    const accuracy = Math.round(score / Object.keys(TASK_MA.correctAnswer).length * 100);

    // Count interventions
    let interventions = 0; let issues: string[] = [];
    for (const rr of result.roundResults) {
      try {
        const beliefs = rr.opinions.map(o => ({ agentId: o.agentId, belief: o.belief, confidence: o.confidence }));
        const msgs = rr.opinions.map(o => ({ agentId: o.agentId, content: o.reasoning, timestamp: rr.timestamp }));
        const gov = govEngine.diagnose(beliefs, msgs, agents.map((a: any) => a.id), GOVERNANCE_BASE_CONFIG);
        if (gov.echoChamber?.detected || gov.authorityBias?.detected || gov.polarization?.detected || gov.prematureConsensus?.detected) interventions++;
        if (gov.echoChamber?.detected) issues.push("echo_chamber");
        if (gov.authorityBias?.detected) issues.push("authority_bias");
        if (gov.polarization?.detected) issues.push("polarization");
        if (gov.prematureConsensus?.detected) issues.push("premature_consensus");
      } catch { /* skip */ }
    }

    const r = { taskId: "ma", ablation: "full", runIndex: i + 10, accuracy, rounds: result.totalRounds, converged: result.converged, consensus: 0, reliability: 0, explainability: 0, interventions, issuesDetected: Array.from(new Set(issues)) };
    fs.writeFileSync(path.join(__dirname, "data", "raw", `ma_full_run${i + 11}.json`), JSON.stringify(r, null, 2));
    console.log(` acc=${accuracy}% rounds=${result.totalRounds} int=${interventions}`);
  }
  console.log("DONE: 9 MA full runs completed");
}
main().catch(e => { console.error(e); process.exit(1); });
