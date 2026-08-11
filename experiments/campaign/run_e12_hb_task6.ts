/**
 * E12: HiddenBench task 6 (graetz_et_al_1998) 三组对比
 * A组已完成: pre 50% → post 0% (HiddenBench free-text protocol)
 * 现在跑 B/C 组: SwarmAlpha structured protocol
 */
import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv"; dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { runSingle } from "./pipeline/Runner";
import type { ExperimentConfig } from "./types";

const BASE: ExperimentConfig = {
  id: "__", hypothesis: "H12", title: "__", scenario: "hiddenbench", taskIndex: 6,
  runtimeModes: ["native_cognitive"], governanceMode: "none",
  agentCount: 4, maxRounds: 8, runsPerSeed: 1, seeds: [42],
  llmModel: "deepseek-chat", temperature: 0.0, isMain: false,
  promptStyle: "nohint", description: "__",
};

async function run(label: string, gov: "none" | "cognitive", id: string) {
  const cfg: ExperimentConfig = { ...BASE, id, governanceMode: gov, title: label, description: label };
  const out = path.resolve(__dirname, "output", "e12_hb_task6", "raw");
  fs.mkdirSync(out, { recursive: true });
  console.log(`\n=== ${label} ===`);
  const d = await runSingle(cfg, "native_cognitive", 42, 0, out);
  const ro = d.roundOpinions?.find(r => r.round === d.totalRounds) || d.roundOpinions?.[d.roundOpinions.length - 1];
  const correct = "Starlight Incorporated"; // HiddenBench task 6 ground truth
  let cc = 0; const total = ro?.opinions?.length || 0;
  for (const op of ro?.opinions || []) { const top = op.itemBeliefs?.find((ib: any) => ib.rank === 1); if (top?.item === correct) cc++; }
  console.log(`  τ=${d.finalKendallTau.toFixed(3)} acc=${d.finalAccuracy} 个体=${cc}/${total} rounds=${d.totalRounds} tokens=${((d.tokenUsage?.totalTokens ?? 0) / 1000).toFixed(0)}k converged=${d.converged}`);
  const intvs = (d.interventions || []).filter((i: any) => i.applied !== false && i.type !== "unknown");
  if (intvs.length) for (const i of intvs) console.log(`  r${i.round} ${i.type}`);
  return d;
}

async function main() {
  console.log("HiddenBench task 6 (graetz_et_al_1998): A组 Pre 50% → Post 0%");
  await run("B组: 结构化 无治理", "none", "e12_hb6_b");
  await run("C组: 结构化 δ治理", "cognitive", "e12_hb6_c");
}
main().catch(e => { console.error(e); process.exit(1); });
