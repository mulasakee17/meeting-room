/**
 * Dry Run Mock Data Generator
 * 
 * 创建合成 RawRunData 用于 Pipeline 验证（无需 LLM 调用）。
 * 模拟 5 agents × 5 rounds 的 Cognitive State 轨迹。
 */

import * as fs from "fs";
import * as path from "path";
import type { RawRunData, CognitiveStateSnapshot } from "./types";
import { mulberry32 } from "../v2/statsShared";

const OUTPUT_DIR = path.resolve(__dirname, "output", "dry_run", "e1_stability", "raw");

// 选项列表
const OPTIONS = ["方案A", "方案B", "方案C", "方案D", "方案E"];
const AGENT_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];

function generateMockData(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const modes = ["belief", "cognitive"] as const;
  const seed = 42;

  for (const mode of modes) {
    for (let runIdx = 0; runIdx < 2; runIdx++) {
      const rng = mulberry32(seed + runIdx * 100);
      const runId = `e1_stability_${mode}_seed${seed}_run${runIdx}`;
      const isCognitive = mode === "cognitive";

      // 生成信念轨迹
      const beliefTrajectory: RawRunData["beliefTrajectory"] = [];
      const cognitiveTrajectory: CognitiveStateSnapshot[] = [];

      let prevBeliefs: Record<string, number> = {};
      let prevUtilities: Map<string, Record<string, number>> = new Map();

      for (let round = 0; round < 5; round++) {
        const beliefs: Record<string, number> = {};
        const confidences: Record<string, number> = {};

        for (let a = 0; a < 5; a++) {
          const agentId = `agent_${a}`;
          // Belief: 围绕群体均值波动，随轮次收敛
          const baseBelief = 0.3 + Math.sin(a * 1.2) * 0.2;
          const noise = (rng() - 0.5) * 0.3 * (1 - round * 0.15);
          const prevB = prevBeliefs[agentId] ?? baseBelief;
          const belief = prevB * 0.6 + (baseBelief + noise) * 0.4;
          beliefs[agentId] = Math.max(-1, Math.min(1, belief));
          confidences[agentId] = 50 + rng() * 30 + round * 3;

          if (isCognitive) {
            const prevU = prevUtilities.get(agentId) || {};
            const utility: Record<string, number> = {};
            for (const opt of OPTIONS) {
              const prevVal = prevU[opt] ?? ((rng() - 0.5) * 0.5);
              utility[opt] = prevVal * 0.7 + (rng() - 0.5) * 0.3;
            }

            const evidenceCoverage = 0.3 + round * 0.12 + rng() * 0.1;
            const evidenceQuality = 0.4 + round * 0.08 + rng() * 0.15;
            const evidenceDiversity = 0.5 + rng() * 0.3;
            const evidenceRecentGain = rng() * 0.2 * (1 - round * 0.1);

            const inertiaStrength = 0.3 + rng() * 0.4;
            const confidenceOverall = 0.5 + rng() * 0.3 + round * 0.03;
            const susceptibility = 1 - inertiaStrength * 0.5 + rng() * 0.2;

            cognitiveTrajectory.push({
              round: round + 1,
              agentId,
              agentName: AGENT_NAMES[a],
              utility,
              utilityTopChoice: OPTIONS[Math.floor(rng() * OPTIONS.length)],
              utilityPreferenceClarity: 0.3 + rng() * 0.5,
              utilityIntensity: Math.abs(belief),
              evidenceCoverage,
              evidenceQuality,
              evidenceDiversity,
              evidenceRecentGain,
              inertiaStrength,
              confidenceOverall,
              susceptibility,
              belief,
              oldConfidence: confidences[agentId],
              spokeThisRound: rng() > 0.3,
            });

            prevUtilities.set(agentId, utility);
          }
        }

        beliefTrajectory.push({ round: round + 1, beliefs, confidences });
        prevBeliefs = { ...beliefs };
      }

      const finalRanking = [...OPTIONS].sort(() => rng() - 0.5);
      const correctAnswer: Record<string, number> = {
        "方案A": 1, "方案B": 2, "方案C": 3, "方案D": 4, "方案E": 5
      };
      // 计算 Kendall τ
      const tau = computeKendallTau(finalRanking, correctAnswer);

      const rawData: RawRunData = {
        runId,
        experimentId: "e1_stability",
        runtimeMode: mode,
        seed,
        runIndex: runIdx,
        timestamp: new Date().toISOString(),
        scenario: "ma",
        agentCount: 5,
        maxRounds: 5,
        totalRounds: 5,
        converged: tau > 0.5,
        finalRanking,
        finalKendallTau: tau,
        beliefTrajectory,
        cognitiveTrajectory: isCognitive ? cognitiveTrajectory : undefined,
        interventions: [],
        governanceIssues: [],
        tokenUsage: {
          promptTokens: 5000 + Math.floor(rng() * 2000),
          completionTokens: 2000 + Math.floor(rng() * 1000),
          totalTokens: 7000 + Math.floor(rng() * 3000),
        },
      };

      const outPath = path.join(OUTPUT_DIR, `${runId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(rawData, null, 2));
      console.log(`  Generated: ${outPath}`);
    }
  }

  // 保存汇总
  const summaryPath = path.join(path.dirname(OUTPUT_DIR), "raw_summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({
    experimentId: "e1_stability",
    totalRuns: 4,
    byMode: { belief: 2, cognitive: 2 },
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log(`  Summary: ${summaryPath}`);
}

function computeKendallTau(ranking: string[], correctAnswer: Record<string, number>): number {
  let concordant = 0, discordant = 0;
  const rankMap = new Map(ranking.map((item, i) => [item, i + 1]));

  const items = Object.keys(correctAnswer);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const rankA = rankMap.get(a) ?? 0;
      const rankB = rankMap.get(b) ?? 0;
      const correctA = correctAnswer[a];
      const correctB = correctAnswer[b];

      if ((rankA < rankB && correctA < correctB) || (rankA > rankB && correctA > correctB)) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }

  const n = items.length;
  const total = n * (n - 1) / 2;
  return total > 0 ? (concordant - discordant) / total : 0;
}

generateMockData();