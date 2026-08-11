import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv"; dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { runSingle } from "./pipeline/Runner";
import type { ExperimentConfig } from "./types";

const BASE_CONFIG: ExperimentConfig = {
  id: "__", hypothesis: "H12", title: "__", scenario: "crisis_v2",
  runtimeModes: ["native_cognitive"], governanceMode: "none",
  agentCount: 5, maxRounds: 8, runsPerSeed: 1, seeds: [42],
  llmModel: "deepseek-chat", temperature: 0.0, isMain: false, description: "__",
};

async function runGroup(label: string, govMode: "none" | "cognitive", id: string) {
  const config: ExperimentConfig = { ...BASE_CONFIG, id, governanceMode: govMode, title: label, description: label };
  const outDir = path.resolve(__dirname, "output", "e12_crisis_v2", "raw");
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\n=== ${label} ===`);
  const d = await runSingle(config, "native_cognitive", 42, 0, outDir);
  const lastRO = d.roundOpinions?.find(r => r.round === d.totalRounds);
  const correct = "方案C-精准疏散"; let cc = 0;
  for (const op of lastRO?.opinions || []) {
    const top = op.itemBeliefs?.find((ib: any) => ib.rank === 1);
    if (top?.item === correct) cc++;
  }
  const total = lastRO?.opinions?.length || 0;
  console.log(`  τ=${d.finalKendallTau.toFixed(3)}  acc=${d.finalAccuracy}  个体正确率=${cc}/${total}  rounds=${d.totalRounds}  tokens=${((d.tokenUsage?.totalTokens??0)/1000).toFixed(0)}k`);
  const intvs = (d.interventions||[]).filter((i:any) => i.applied !== false && i.type !== "unknown");
  if (intvs.length) { for (const i of intvs) console.log(`  r${i.round} ${i.type}${i.targetAgents?' → '+i.targetAgents.join(','):''}`); }
  return d;
}

async function main() {
  console.log("Crisis V2 (可解任务): A组已有 Pre 40% → Post 0%");
  await runGroup("B组: 结构化 无治理", "none", "e12_cv2_b");
  await runGroup("C组: 结构化 δ治理", "cognitive", "e12_cv2_c");
  console.log("\nDone.");
}
main().catch(e => { console.error(e); process.exit(1); });
