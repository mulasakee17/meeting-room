/**
 * E12 C 组快速探测: Crisis V1 + SwarmAlpha 结构化 + δ 治理, 1 seed, 5 rounds
 * 用法: npx tsx experiments/campaign/run_e12_c_quick.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runSingle } from "./pipeline/Runner";
import type { ExperimentConfig } from "./types";

const config: ExperimentConfig = {
  id: "e12_crisis_c",
  hypothesis: "H12",
  title: "Crisis δ治理 (C组)",
  scenario: "crisis",
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 1,
  seeds: [42],
  llmModel: "deepseek-chat",
  temperature: 0.0,
  isMain: false,
  description: "Crisis V1 + 结构化 + δ 认知治理",
};

async function main() {
  const outDir = path.resolve(__dirname, "output", "e12_bc", "raw");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("C 组（δ 治理，5 rounds）...");
  const data = await runSingle(config, "native_cognitive", 42, 0, outDir);

  console.log(`\nτ=${data.finalKendallTau.toFixed(3)} acc=${data.finalAccuracy} rounds=${data.totalRounds} converged=${data.converged} tokens=${((data.tokenUsage?.totalTokens ?? 0) / 1000).toFixed(1)}k`);

  const interventions = data.interventions.filter(i => i.type !== "unknown" && i.applied !== false);
  console.log(`\nInterventions: ${interventions.length} applied`);
  for (const intv of interventions) {
    console.log(`  r${intv.round} ${intv.type}${intv.targetAgents ? " → " + intv.targetAgents.join(",") : ""}${intv.effect ? " [" + intv.effect + "]" : ""}`);
  }

  if (data.deltaDiagnosis) {
    console.log(`\nδ triggers:`);
    for (const d of data.deltaDiagnosis) {
      const triggered = [d.polarization, d.oneDMask, d.evidenceSilence, d.confidenceGap, d.stanceFlip, d.noResponse, d.concentration, d.consistency]
        .filter(s => s.triggered)
        .map(s => s as any);
      if (triggered.length > 0) {
        console.log(`  r${d.round}: ${triggered.map((t: any) => {
          const name = Object.keys(d).find(k => (d as any)[k] === t);
          return `${name}=${t.value.toFixed(2)}`;
        }).join(", ")}`);
      }
    }
  }
}

main().catch(err => { console.error("失败:", err); process.exit(1); });
