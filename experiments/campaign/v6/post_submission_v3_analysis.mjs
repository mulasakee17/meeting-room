// v3 multi-seed replication analysis (read-only; zero provider).
// Reads the frozen v3 fork JSONL (45 tasks x 2 seeds x 3 arms) and computes:
//   (1) cross-seed task-level H1/H2 (paired deltas averaged across seeds);
//   (2) pre-treatment severity heterogeneity (task-level, seeds averaged);
//   (3) continuous heterogeneity Spearman/Pearson + 10k task-cluster bootstrap;
//   (4) within-task vs cross-task detector correlation (reuse vs CONTROL Brier);
//   (5) exposure-volume balance (SUPPORTS vs ATTACKS) across both seeds.
import * as fs from "node:fs";
import * as path from "node:path";

const OUT = "experiments/campaign/pilot_output/v6-fork-confirmatory-v3-20260816";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (xs) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
const median = (xs) => { const s = [...xs].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const percentile = (sorted, p) => { const i = (sorted.length-1)*p; const lo=Math.floor(i), hi=Math.ceil(i); return lo===hi ? sorted[lo] : sorted[lo]*(hi-i)+sorted[hi]*(i-lo); };
const sd = (xs) => { if (xs.length<2) return 0; const m=mean(xs); return Math.sqrt(mean(xs.map(x=>(x-m)**2))); };

function pearson(a, b) {
  const n = a.length; if (n < 2) return null;
  const ma = mean(a), mb = mean(b);
  let num=0, da=0, db=0;
  for (let i=0;i<n;i++){ num+=(a[i]-ma)*(b[i]-mb); da+=(a[i]-ma)**2; db+=(b[i]-mb)**2; }
  const den = Math.sqrt(da*db); return den===0 ? null : num/den;
}
function avgRank(xs) { const n=xs.length; const order=xs.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r=new Array(n); let k=0; while(k<n){ let j=k; while(j+1<n && order[j+1][0]===order[k][0]) j++; const avg=(k+1+j+1)/2; for(let t=k;t<=j;t++) r[order[t][1]]=avg; k=j+1; } return r; }
function spearman(a, b) { return pearson(avgRank(a), avgRank(b)); }

function pooledBrier(beliefs, correct) {
  if (!beliefs || beliefs.length === 0) return null;
  const options = new Set();
  for (const b of beliefs) for (const o of Object.keys(b)) options.add(o);
  options.add(correct);
  const pooled = {};
  for (const o of options) pooled[o] = mean(beliefs.map(b => b[o] ?? 0));
  let s = 0;
  for (const o of options) s += (pooled[o] - (o === correct ? 1 : 0)) ** 2;
  return s;
}

function loadRows() {
  const rows = [];
  for (const name of fs.readdirSync(OUT)) {
    if (!name.endsWith(".jsonl")) continue;
    const text = fs.readFileSync(path.join(OUT, name), "utf8");
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      rows.push(JSON.parse(line));
    }
  }
  return rows;
}

const rows = loadRows();
console.log(`loaded ${rows.length} rows`);

// Group by taskId -> seed -> arm.
const byTask = new Map();
for (const r of rows) {
  if (!byTask.has(r.taskId)) byTask.set(r.taskId, new Map());
  const bySeed = byTask.get(r.taskId);
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, {});
  bySeed.get(r.seed)[r.arm] = r;
}
const taskIds = [...byTask.keys()].sort((a,b)=>a-b);
const seeds = new Set(rows.map(r => r.seed));
console.log(`tasks=${taskIds.length}, seeds=[${[...seeds].join(",")}]`);

// Per (task, seed) block: round-1 pooled Brier + per-arm final Brier.
const blocks = []; // {taskId, seed, r1Brier, final:{CONTROL,SUPPORTS,ATTACKS}, reuse, align}
for (const tid of taskIds) {
  for (const seed of [...seeds].sort((a,b)=>a-b)) {
    const arms = byTask.get(tid).get(seed);
    if (!arms || !arms.CONTROL) continue;
    const correct = arms.CONTROL.resolvedOption;
    const r1Brier = pooledBrier(arms.CONTROL.round1AgentBeliefs, correct);
    blocks.push({
      taskId: tid, seed,
      r1Brier,
      reuse: arms.CONTROL.evidenceReuse,
      align: arms.CONTROL.alignmentR,
      final: {
        CONTROL: arms.CONTROL.finalBrier,
        SUPPORTS: arms.SUPPORTS?.finalBrier ?? null,
        ATTACKS: arms.ATTACKS?.finalBrier ?? null,
      },
    });
  }
}
console.log(`blocks (task,seed) = ${blocks.length}`);

// Task-level (average across seeds).
const tasks = taskIds.map(tid => {
  const bs = blocks.filter(b => b.taskId === tid);
  const m = (k) => mean(bs.map(b => b.final[k]).filter(v => v != null));
  const r1 = mean(bs.map(b => b.r1Brier).filter(v => v != null));
  const finalC = m("CONTROL"), finalS = m("SUPPORTS"), finalA = m("ATTACKS");
  return {
    taskId: tid,
    nSeeds: bs.length,
    r1Brier: r1,
    final: { CONTROL: finalC, SUPPORTS: finalS, ATTACKS: finalA },
    deltaAC: (finalA != null && finalC != null) ? finalA - finalC : null,
    deltaAS: (finalA != null && finalS != null) ? finalA - finalS : null,
  };
});

// (1) cross-seed H1/H2 (task-level, seed-averaged).
console.log("\n=== (1) cross-seed H1/H2 (task-level, seeds averaged) ===");
const h1 = tasks.map(t => t.deltaAS).filter(v => v != null);
const h2 = tasks.map(t => t.deltaAC).filter(v => v != null);
console.log(`H1 (ATTACKS-SUPPORTS): mean=${mean(h1).toFixed(4)} median=${median(h1).toFixed(4)} n=${h1.length}`);
console.log(`  neg/pos/zero = ${h1.filter(v=>v<0).length}/${h1.filter(v=>v>0).length}/${h1.filter(v=>v===0).length}`);
console.log(`H2 (ATTACKS-CONTROL): mean=${mean(h2).toFixed(4)} median=${median(h2).toFixed(4)} n=${h2.length}`);
console.log(`  neg/pos/zero = ${h2.filter(v=>v<0).length}/${h2.filter(v=>v>0).length}/${h2.filter(v=>v===0).length}`);

function bootCI(xs, fn, reps, seed) {
  const rng = mulberry32(seed);
  const draws = [];
  for (let i=0;i<reps;i++){ const s=[]; for(let j=0;j<xs.length;j++) s.push(xs[Math.floor(rng()*xs.length)]); const v=fn(s); if(v!=null) draws.push(v); }
  draws.sort((a,b)=>a-b); return [percentile(draws,0.025), percentile(draws,0.975)];
}
const ciH1 = bootCI(h1, mean, 10000, 0x5EED0F);
const ciH2 = bootCI(h2, mean, 10000, 0x5EED0F);
console.log(`H1 95% CI (task-cluster bootstrap): [${ciH1[0].toFixed(4)}, ${ciH1[1].toFixed(4)}]`);
console.log(`H2 95% CI (task-cluster bootstrap): [${ciH2[0].toFixed(4)}, ${ciH2[1].toFixed(4)}]`);

// (2) pre-treatment severity strata (task-level r1 Brier).
console.log("\n=== (2) pre-treatment severity strata (task-level, seeds averaged) ===");
function stratify(label, lo, hi) {
  const g = tasks.filter(t => t.r1Brier != null && t.r1Brier > lo && t.r1Brier <= hi);
  const m = (k) => mean(g.map(t => t.final[k]).filter(v => v != null));
  console.log(`\n${label}: n=${g.length}`);
  console.log(`  r1 Brier=${mean(g.map(t=>t.r1Brier)).toFixed(3)} | CONTROL=${m("CONTROL").toFixed(3)} SUPPORTS=${m("SUPPORTS").toFixed(3)} ATTACKS=${m("ATTACKS").toFixed(3)}`);
  console.log(`  ATTACKS-CONTROL=${mean(g.map(t=>t.deltaAC).filter(v=>v!=null)).toFixed(3)}  ATTACKS-SUPPORTS=${mean(g.map(t=>t.deltaAS).filter(v=>v!=null)).toFixed(3)}`);
}
stratify("catastrophic (r1 Brier > 1.0)", 1.0, Infinity);
stratify("moderate (0.3 < r1 Brier <= 1.0)", 0.3, 1.0);
stratify("good (r1 Brier <= 0.3)", -Infinity, 0.3);

// (3) continuous heterogeneity (task-level).
console.log("\n=== (3) continuous heterogeneity (task-level) ===");
const pAC = tasks.filter(t => t.r1Brier != null && t.deltaAC != null);
const r1 = pAC.map(t => t.r1Brier), dAC = pAC.map(t => t.deltaAC);
console.log(`n=${pAC.length}`);
console.log(`Spearman(r1Brier, ATTACKS-CONTROL) = ${spearman(r1, dAC).toFixed(4)}`);
console.log(`Pearson(r1Brier, ATTACKS-CONTROL)  = ${pearson(r1, dAC).toFixed(4)}`);
const ciSp = bootCI(pAC, (s) => spearman(s.map(t=>t.r1Brier), s.map(t=>t.deltaAC)), 10000, 0x5EED0F);
console.log(`Spearman 95% CI: [${ciSp[0].toFixed(4)}, ${ciSp[1].toFixed(4)}]`);
const pAS = tasks.filter(t => t.r1Brier != null && t.deltaAS != null);
console.log(`Spearman(r1Brier, ATTACKS-SUPPORTS) = ${spearman(pAS.map(t=>t.r1Brier), pAS.map(t=>t.deltaAS)).toFixed(4)}`);

// (4) within-task vs cross-task detector correlation (reuse vs CONTROL Brier).
console.log("\n=== (4) detector: within-task vs cross-task (reuse vs CONTROL final Brier) ===");
const dpts = blocks.filter(b => b.reuse != null && b.final.CONTROL != null).map(b => ({ taskId: b.taskId, reuse: b.reuse, brier: b.final.CONTROL }));
const taskMean = new Map();
for (const b of dpts) { if(!taskMean.has(b.taskId)) taskMean.set(b.taskId, {reuse:0,brier:0,n:0}); const t=taskMean.get(b.taskId); t.reuse+=b.reuse; t.brier+=b.brier; t.n++; }
for (const [tid,t] of taskMean) { t.reuse/=t.n; t.brier/=t.n; }
const totalR = pearson(dpts.map(b=>b.reuse), dpts.map(b=>b.brier));
const withinR = pearson(dpts.map(b=>b.reuse - taskMean.get(b.taskId).reuse), dpts.map(b=>b.brier - taskMean.get(b.taskId).brier));
console.log(`points (task,seed) = ${dpts.length}; tasks = ${taskMean.size}`);
console.log(`TOTAL (cross-task) Pearson(reuse, CONTROL Brier) = ${totalR.toFixed(4)}`);
console.log(`WITHIN-TASK Pearson(reuse, CONTROL Brier) = ${withinR.toFixed(4)} (2 seeds/task -> weak)`);
// alignment analog
const apts = blocks.filter(b => b.align != null && b.final.CONTROL != null).map(b => ({ taskId: b.taskId, align: b.align, brier: b.final.CONTROL }));
const aMean = new Map();
for (const b of apts) { if(!aMean.has(b.taskId)) aMean.set(b.taskId, {align:0,brier:0,n:0}); const t=aMean.get(b.taskId); t.align+=b.align; t.brier+=b.brier; t.n++; }
for (const [tid,t] of aMean) { t.align/=t.n; t.brier/=t.n; }
console.log(`TOTAL Pearson(alignment, CONTROL Brier) = ${pearson(apts.map(b=>b.align), apts.map(b=>b.brier)).toFixed(4)}`);
console.log(`WITHIN-TASK Pearson(alignment, CONTROL Brier) = ${pearson(apts.map(b=>b.align - aMean.get(b.taskId).align), apts.map(b=>b.brier - aMean.get(b.taskId).brier)).toFixed(4)}`);

// (5) exposure volume balance.
console.log("\n=== (5) exposure volume: SUPPORTS vs ATTACKS (all task,seed blocks) ===");
const vol = (arm) => {
  const rs = blocks.map(b => byTask.get(b.taskId).get(b.seed)[arm]).filter(r => r);
  return { count: mean(rs.map(r=>r.disclosedEvidenceCount)), token: mean(rs.map(r=>r.disclosedTokenCount)), src: mean(rs.map(r=>r.disclosedSourceAgentCount)) };
};
const vS = vol("SUPPORTS"), vA = vol("ATTACKS");
console.log(`SUPPORTS: items=${vS.count.toFixed(2)} chars=${vS.token.toFixed(1)} srcAgents=${vS.src.toFixed(2)}`);
console.log(`ATTACKS : items=${vA.count.toFixed(2)} chars=${vA.token.toFixed(1)} srcAgents=${vA.src.toFixed(2)}`);
const dCount = blocks.map(b => byTask.get(b.taskId).get(b.seed).ATTACKS.disclosedEvidenceCount - byTask.get(b.taskId).get(b.seed).SUPPORTS.disclosedEvidenceCount);
console.log(`paired mean delta items = ${mean(dCount).toFixed(2)} (median ${median(dCount).toFixed(2)})`);
