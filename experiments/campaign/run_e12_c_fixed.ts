import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv"; dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { runSingle } from "./pipeline/Runner";
import type { ExperimentConfig } from "./types";

const config: ExperimentConfig = {
  id: "e12_crisis_c_fixed", hypothesis: "H12", title: "Crisis C组 δ治理 归一化修复",
  scenario: "crisis", runtimeModes: ["native_cognitive"], governanceMode: "cognitive",
  agentCount: 5, maxRounds: 5, runsPerSeed: 1, seeds: [42],
  llmModel: "deepseek-chat", temperature: 0.0, isMain: false,
  description: "C组 δ治理 归一化修复验证",
};

async function main() {
  const outDir = path.resolve(__dirname, "output", "e12_bc_fixed", "raw");
  fs.mkdirSync(outDir, { recursive: true });
  const d = await runSingle(config, "native_cognitive", 42, 0, outDir);
  console.log(`\nτ=${d.finalKendallTau.toFixed(3)} acc=${d.finalAccuracy} rounds=${d.totalRounds} converged=${d.converged}`);
  const lastRO = d.roundOpinions?.find(r => r.round === d.totalRounds);
  const correct = "方案C-精准疏散"; let cc = 0;
  for (const op of lastRO?.opinions || []) {
    const top = op.itemBeliefs?.find((ib: any) => ib.rank === 1);
    if (top?.item === correct) cc++;
  }
  console.log(`个体正确率: ${cc}/${lastRO?.opinions?.length || 0}`);
  const intvs = d.interventions.filter(i => i.applied !== false && i.type !== "unknown");
  console.log(`干预: ${intvs.length} applied`);
  for (const intv of intvs) console.log(`  r${intv.round} ${intv.type}${intv.effect ? ' [' + intv.effect + ']' : ''}`);
}
main().catch(e => { console.error(e); process.exit(1); });
