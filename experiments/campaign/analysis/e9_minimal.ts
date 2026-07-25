/**
 * E9 Minimal Validation — 单次运行验证 Cognitive Governance 端到端链路
 *
 * 用法：npx tsx experiments/campaign/analysis/e9_minimal.ts
 */

import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env.local") });

import { CustomAgent } from "../../../src/lib/adapters/custom";
import { NativeCognitiveEngine } from "../../../src/lib/discussion/nativeCognitiveEngine";
import type { DiscussionAgent } from "../../../src/lib/discussion";
import type { LLMConfig } from "../../../src/lib/llm/providers";
import { mulberry32 } from "../../v2/statsShared";

async function main() {
  console.log("=== E9 Minimal Validation ===\n");

  // 1. Load crisis scenario
  const { TASK_CRISIS } = require("../../v2/task_crisis");
  const task = TASK_CRISIS;

  // 2. Create agents
  const seed = 42;
  const rng = mulberry32(seed);
  const llmConfig: LLMConfig = {
    provider: "deepseek" as any,
    model: "deepseek-v4-flash",
    temperature: 0.0,
  };

  const agentDefs = task.agents.slice(0, 5);
  const agents: DiscussionAgent[] = [];

  for (let i = 0; i < agentDefs.length; i++) {
    const def = agentDefs[i];
    const agent = new CustomAgent(
      def.id || `agent_${i}`,
      def.name,
      def.role || "Analyst",
      "expert",
      llmConfig,
      def.knownItems ? `${task.sharedBriefing}\n\n独有知识：${def.knownItems}` : undefined,
    );
    agent.setState({
      belief: Math.max(-1, Math.min(1, rng() * 0.6 - 0.3)),
      confidence: 50 + rng() * 20,
    });
    agents.push(agent as unknown as DiscussionAgent);
  }

  const scenarioTask = {
    id: task.id,
    description: task.sharedBriefing || task.title,
    type: "ranking" as const,
    createdAt: new Date().toISOString(),
    content: task.sharedBriefing || "",
  };

  // 3. Run with cognitive governance
  console.log("Starting cognitive governance run...");
  const engine = new NativeCognitiveEngine({
    maxRounds: 5,
    governanceMode: "full",
    seed: 42,
    useCognitiveGovernance: true,
  });

  const startTime = Date.now();
  const result = await engine.run(agents, scenarioTask);
  const elapsed = Date.now() - startTime;

  console.log(`\n=== Results ===`);
  console.log(`Elapsed: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`Rounds: ${result.totalRounds}`);
  console.log(`Converged: ${result.converged}`);

  // 4. Check interventions
  const roundDataArray = engine.getRoundDataArray();
  let totalInterventions = 0;
  const interventionTypes: Record<string, number> = {};
  const detectorIssues: Record<string, number> = {};

  for (const rd of roundDataArray) {
    if (rd.interventions && rd.interventions.length > 0) {
      console.log(`\n  Round ${rd.roundNumber}: ${rd.interventions.length} interventions`);
      for (const intv of rd.interventions) {
        totalInterventions++;
        const type = intv.type || "unknown";
        interventionTypes[type] = (interventionTypes[type] || 0) + 1;
        console.log(`    - ${type}: ${intv.effect || "no description"}`);
      }
    }
    if (rd.governanceIssues && rd.governanceIssues.length > 0) {
      for (const issue of rd.governanceIssues) {
        const itype = issue.type || "unknown";
        detectorIssues[itype] = (detectorIssues[itype] || 0) + 1;
      }
    }
  }

  console.log(`\n  Total interventions: ${totalInterventions}`);
  console.log(`  Intervention types:`, interventionTypes);
  console.log(`  Detector triggers:`, detectorIssues);

  // 5. Check cognitive states
  const cognitiveStates = engine.getCognitiveStates();
  console.log(`\n  Cognitive States (final):`);
  for (const [agentId, cs] of cognitiveStates) {
    console.log(`    ${agentId}: utilityTop=${cs.utility.topChoice}, clarity=${cs.utility.preferenceClarity.toFixed(2)}, ` +
      `inertia=${cs.inertia.strength.toFixed(2)}, susceptibility=${((1 - cs.inertia.strength) * (1 - cs.confidence.overall)).toFixed(2)}`);
  }

  // 6. Check influence weights
  const influenceWeights = (engine as any).influenceWeights as Map<string, Map<string, number>>;
  if (influenceWeights && influenceWeights.size > 0) {
    console.log(`\n  Influence Weights (modified):`);
    for (const [agentId, weights] of influenceWeights) {
      for (const [targetId, weight] of weights) {
        if (weight !== 1) {
          console.log(`    ${agentId} → ${targetId}: ${weight.toFixed(1)}`);
        }
      }
    }
  }

  // 7. Extract final ranking
  if (result.roundResults.length > 0) {
    const lastRound = result.roundResults[result.roundResults.length - 1];
    const allItemBeliefs = lastRound.opinions.flatMap(o => o.itemBeliefs || []);
    if (allItemBeliefs.length > 0) {
      console.log(`\n  Final item beliefs (sample):`);
      for (const ib of allItemBeliefs.slice(0, 10)) {
        console.log(`    ${ib.item}: rank=${ib.rank}, belief=${ib.belief.toFixed(2)}, confidence=${ib.confidence}`);
      }
    }
  }

  console.log("\n=== Validation Complete ===");
}

main().catch(err => {
  console.error("Minimal test failed:", err);
  process.exit(1);
});