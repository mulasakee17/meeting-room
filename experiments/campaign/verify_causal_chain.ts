/**
 * E12 因果链验证 (diff-in-diff)
 *
 * 对每对 (task, seed) 比较 C 组(有治理) vs B 组(无治理)：
 *   - 干预后目标 agent 的 belief/utility 相对 B 组的边际改变
 *   - 干预方向是否朝向正确选项
 *   - 最终正确率是否因治理而提升
 *
 * 核心问题: C 组的改善是 δ→干预→行为改变 的结果，还是仅仅是讨论自然收敛？
 * 设计: diff-in-diff (处理组 = 目标 agent 干预后, 对照组 = 同 seed B 组轨迹)
 *
 * 用法: npx tsx experiments/campaign/verify_causal_chain.ts
 */

import * as fs from "fs";
import * as path from "path";

const RAW_DIR = path.resolve(__dirname, "output", "e12", "raw");

interface Opinion {
  agentId: string;
  itemBeliefs: Array<{ item: string; rank: number; belief: number }>;
  reasoning?: string;
}
interface RoundOpinions { round: number; opinions: Opinion[]; }

interface RawRun {
  runId: string;
  seed: number;
  finalAccuracy: number;
  individualAccuracy: number;
  totalRounds: number;
  interventions: Array<{ round: number; type: string; targetAgents: string[]; applied?: boolean }>;
  governanceIssues: Array<{ round: number; type: string; severity: string; agents: string[]; suggestedIntervention: string }>;
  roundOpinions?: RoundOpinions[];
}

interface AgentTrajectory {
  [round: number]: number; // belief of top-ranked item
}

function loadRun(taskId: string, seed: number, phase: "B" | "C" | "D"): RawRun | null {
  const pattern = `e12_${phase}_${taskId.replace("hb_", "t")}_native_cognitive_seed${seed}_run0.json`;
  const file = path.join(RAW_DIR, pattern);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

function agentTopBeliefs(run: RawRun): Map<string, AgentTrajectory> {
  const byAgent = new Map<string, AgentTrajectory>();
  for (const ro of run.roundOpinions ?? []) {
    for (const o of ro.opinions) {
      const top = o.itemBeliefs.find(ib => ib.rank === 1) ?? o.itemBeliefs[0];
      if (!top) continue;
      if (!byAgent.has(o.agentId)) byAgent.set(o.agentId, {});
      byAgent.get(o.agentId)![ro.round] = top.belief;
    }
  }
  return byAgent;
}

/** Final consensus (avg belief) rank for the correct item */
function finalCorrectRank(run: RawRun, correct: string): number {
  const agg = new Map<string, number[]>();
  const last = run.roundOpinions?.[run.roundOpinions.length - 1];
  if (!last) return -1;
  for (const o of last.opinions) {
    for (const ib of o.itemBeliefs) {
      if (!agg.has(ib.item)) agg.set(ib.item, []);
      agg.get(ib.item)!.push(ib.belief);
    }
  }
  const means = [...agg.entries()].map(([i, v]) => [i, v.reduce((a, b) => a + b, 0) / v.length] as [string, number]);
  means.sort((a, b) => b[1] - a[1]);
  const idx = means.findIndex(([i]) => i.includes(correct) || correct.includes(i));
  return idx === -1 ? -1 : idx + 1;
}

function main() {
  const tasks = ["hb_5", "hb_7"];
  const seeds = [42, 123, 456];
  const CORRECT: Record<string, string> = { hb_5: "Candidate C", hb_7: "Eddie Sullivan" };

  console.log("E12 diff-in-diff causal verification (C vs B)");
  console.log("=".repeat(90));

  let totalTargetChanges = 0, totalTargeted = 0, convergeDiffTotal = 0;
  const rows: Array<Record<string, string | number>> = [];

  for (const tid of tasks) {
    for (const seed of seeds) {
      const b = loadRun(tid, seed, "B");
      const c = loadRun(tid, seed, "C");
      const correct = CORRECT[tid];

      console.log(`\n--- ${tid} seed=${seed} ---`);
      if (!b || !c) {
        console.log(`  MISSING run (B=${!!b}, C=${!!c})`);
        continue;
      }

      const bTraj = agentTopBeliefs(b);
      const cTraj = agentTopBeliefs(c);

      const intvs = c.interventions.filter(i => i.applied !== false);
      const targeted = new Set<string>();
      for (const iv of intvs) for (const a of iv.targetAgents) targeted.add(a);

      // For each targeted agent: C post-intervention belief minus B same-round belief
      let agentChanges: Array<{ agent: string; cBelief: number; bBelief: number; delta: number; correctRank: number }> = [];
      for (const agent of targeted) {
        const cT = cTraj.get(agent);
        const bT = bTraj.get(agent);
        if (!cT || !bT) continue;
        // Compare last common round (both trajectories have data)
        const rounds = Object.keys(cT).map(Number).filter(r => bT[r] !== undefined).sort((a, b) => a - b);
        if (rounds.length === 0) continue;
        const lastR = rounds[rounds.length - 1];
        const cBelief = cT[lastR], bBelief = bT[lastR];
        const delta = cBelief - bBelief;
        totalTargeted++;
        if (Math.abs(delta) > 0.05) totalTargetChanges++;
        agentChanges.push({ agent, cBelief, bBelief, delta, correctRank: finalCorrectRank(c, correct) });
      }

      // Group-level: does governance move consensus towards correct more than B?
      const cRank = finalCorrectRank(c, correct);
      const bRank = finalCorrectRank(b, correct);
      const convergeDiff = bRank - cRank; // positive = C more correct
      convergeDiffTotal += convergeDiff;

      const intvDesc = intvs.map(iv => `${iv.type}[${iv.targetAgents.join(",")}]`).join(" | ");

      const row: Record<string, string | number> = { task: tid, seed, intv: intvDesc };
      for (const ac of agentChanges) {
        row[`${ac.agent}.ΔC-B`] = ac.delta.toFixed(2);
      }
      row["finalRank(C)"] = cRank;
      row["finalRank(B)"] = bRank;
      row["Δrank(C-B)"] = convergeDiff;
      row["Cacc"] = c.finalAccuracy;
      row["Bacc"] = b.finalAccuracy;
      rows.push(row);

      console.log(`  interventions: ${intvDesc || "(none)"}`);
      console.log(`  targeted agents: ${[...targeted].join(",") || "(none)"}`);
      for (const ac of agentChanges) {
        console.log(`    ${ac.agent}: C=${ac.cBelief.toFixed(2)} B=${ac.bBelief.toFixed(2)} Δ(C−B)=${ac.delta >= 0 ? "+" : ""}${ac.delta.toFixed(2)}`);
      }
      console.log(`  final rank of correct: C=${cRank} B=${bRank} → governance ${convergeDiff > 0 ? "HELPS" : convergeDiff < 0 ? "HURTS" : "no-effect"} (acc C=${c.finalAccuracy} B=${b.finalAccuracy})`);
    }
  }

  console.log("\n" + "=".repeat(90));
  console.log(`Summary: ${totalTargeted} targeted agent-rounds, ${totalTargetChanges} showed belief shift vs B group (${(totalTargetChanges / Math.max(1, totalTargeted) * 100).toFixed(0)}%)`);
  console.log(`  → If most targeted agents shift vs their B-group counterpart, governance changes behavior (not just natural convergence).`);
  console.log(`Aggregate rank improvement (C vs B, across all runs): ${convergeDiffTotal > 0 ? "+" : ""}${convergeDiffTotal} rank positions`);
  console.log(`  → Positive means governance consistently pushes consensus toward correct answer.`);
}

main();
