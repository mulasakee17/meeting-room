/**
 * 生成 Supplier summary.json
 *
 * 与 Crisis summary.json 格式完全一致，便于 analyze.ts 复用
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "data_supplier");
const files = fs.readdirSync(DATA_DIR).filter(
  f => f.endsWith(".json") && f.startsWith("supplier_") && !f.includes("summary")
);

const results = files.map(f => {
  const content = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
  return JSON.parse(content);
});

const summary = {
  task: "核心零部件供应商选择",
  params: {
    maxRounds: 3,
    convergenceThreshold: 0.06,
    temperature: 0.2,
    model: "deepseek-chat",
    provider: "deepseek",
    runsPerCondition: 15,
    ablationModes: ["none", "full", "shuffle"],
  },
  timestamp: new Date().toISOString(),
  totalExperiments: results.length,
  results: results.map((r, idx) => ({
    runId: r.runId,
    ablation: r.ablation,
    runIndex: idx,
    timestamp: r.timestamp || new Date().toISOString(),
    kendallTau: r.kendallTau,
    decisionQuality: r.decisionQuality,
    tauTrajectory: r.tauTrajectory,
    totalRounds: r.totalRounds,
    converged: r.converged,
    consensusLevel: r.consensusLevel,
    opinionDiversity: r.opinionDiversity,
    totalInterventions: r.totalInterventions,
    issuesDetected: r.issuesDetected,
    interventionEffects: r.interventionEffects,
    interventionBreakdown: r.interventionBreakdown,
    evaluationScores: r.evaluationScores || {
      consensus: 0, reliability: 0, dispersion: 0, stability: 0, influenceAnalysis: 0, overall: 0,
    },
    rounds: r.rounds,
  })),
};

const summaryPath = path.join(DATA_DIR, "summary.json");
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
console.log(`Generated ${summaryPath} with ${results.length} experiments`);
