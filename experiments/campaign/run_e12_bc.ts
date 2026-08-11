/**
 * E12 B/C 组运行脚本
 *
 * B 组: Crisis V1 + SwarmAlpha 结构化协议 + 无治理
 * C 组: Crisis V1 + SwarmAlpha 结构化协议 + δ 认知治理
 *
 * 与 A 组对比（HiddenBench 自由文本协议，Pre 40% → Post 0%）。
 * 用法: npx tsx experiments/campaign/run_e12_bc.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runSingle } from "./pipeline/Runner";
import type { ExperimentConfig } from "./types";

const OUT_DIR = path.resolve(__dirname, "output", "e12_bc");
const SEEDS = [42, 123, 456];

const BASE_CONFIG: ExperimentConfig = {
  id: "e12_crisis_b",
  hypothesis: "H12",
  title: "Crisis 结构化 (B组)",
  scenario: "crisis",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 15,
  runsPerSeed: 1,
  seeds: SEEDS,
  llmModel: "deepseek-chat",
  temperature: 0.0,
  isMain: false,
  description: "Crisis V1 + SwarmAlpha 结构化协议 + 无治理",
};

const CONFIG_C: ExperimentConfig = {
  ...BASE_CONFIG,
  id: "e12_crisis_c",
  title: "Crisis 结构化+δ治理 (C组)",
  governanceMode: "cognitive",
  description: "Crisis V1 + SwarmAlpha 结构化协议 + δ 认知治理",
};

async function runGroup(label: string, config: ExperimentConfig) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label}: ${config.description}`);
  console.log(`${"=".repeat(60)}`);

  const results: Array<{ seed: number; tau: number; acc: number; rounds: number; tokens: number; elapsedMin: string }> = [];

  for (const seed of SEEDS) {
    const data = await runSingle(config, "native_cognitive", seed, 0, path.join(OUT_DIR, "raw"));
    results.push({
      seed,
      tau: data.finalKendallTau,
      acc: data.finalAccuracy,
      rounds: data.totalRounds,
      tokens: data.tokenUsage?.totalTokens ?? 0,
      elapsedMin: (data.tokenUsage?.totalLatencyMs ? data.tokenUsage.totalLatencyMs / 60000 : 0).toFixed(1),
    });
    console.log(`  seed=${seed}: τ=${data.finalKendallTau.toFixed(3)} acc=${data.finalAccuracy} rounds=${data.totalRounds} tokens=${((data.tokenUsage?.totalTokens ?? 0) / 1000).toFixed(1)}k`);
  }

  // 汇总
  const avgAcc = results.reduce((s, r) => s + r.acc, 0) / results.length;
  const avgRounds = results.reduce((s, r) => s + r.rounds, 0) / results.length;
  const avgTokens = results.reduce((s, r) => s + r.tokens, 0) / results.length;
  console.log(`\n  AVG: acc=${avgAcc.toFixed(2)} rounds=${avgRounds.toFixed(1)} tokens=${(avgTokens / 1000).toFixed(1)}k`);

  return { label, results, avg: { acc: avgAcc, rounds: avgRounds, tokens: avgTokens } };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "raw"), { recursive: true });

  console.log("E12 B/C 组: Crisis V1 × SwarmAlpha 协议 × deepseek-chat");
  console.log(`Seeds: ${SEEDS.join(", ")} | Runs/seed: 1`);

  const b = await runGroup("B 组（结构化，无治理）", BASE_CONFIG);
  const c = await runGroup("C 组（结构化，δ治理）", CONFIG_C);

  // 最终对比
  console.log(`\n${"=".repeat(60)}`);
  console.log("A vs B vs C 对比");
  console.log(`${"=".repeat(60)}`);
  console.log("A 组 (HiddenBench自由文本):  Pre 40% → Post 0%   (collective gain -40%)");
  console.log(`B 组 (SwarmAlpha无治理):    acc=${b.avg.acc.toFixed(2)} rounds=${b.avg.rounds.toFixed(1)} tokens=${(b.avg.tokens / 1000).toFixed(1)}k`);
  console.log(`C 组 (SwarmAlpha+δ治理):    acc=${c.avg.acc.toFixed(2)} rounds=${c.avg.rounds.toFixed(1)} tokens=${(c.avg.tokens / 1000).toFixed(1)}k`);

  // 保存汇总
  const summary = { timestamp: new Date().toISOString(), a: { preAcc: 0.40, postAcc: 0.0, gain: -0.40 }, b, c };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n保存至: ${path.join(OUT_DIR, "summary.json")}`);
}

main().catch(err => { console.error("失败:", err); process.exit(1); });
