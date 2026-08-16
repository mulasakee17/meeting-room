// Pre-submission verification analysis (read-only; zero provider).
// Reads the frozen confirmatory fork JSONL and computes, for the paper:
//   (1) round-1 PRE-TREATMENT pooled Brier severity (shared across arms);
//   (2) severity stratification of the ATTACKS/SUPPORTS/CONTROL effects;
//   (3) continuous heterogeneity: does pre-treatment severity predict rescue
//       magnitude (ΔBrier = Brier_ATTACKS − Brier_CONTROL)? Pearson + Spearman
//       with 10k task-cluster bootstrap CI;
//   (4) exposure-volume confound check (SUPPORTS vs ATTACKS disclosure volume).
import * as fs from "node:fs";
import * as path from "node:path";

const OUT = "experiments/campaign/pilot_output/v6-fork-confirmatory-v2-20260815";

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
function spearman(a, b) {
  const n = a.length; if (n < 2) return null;
  const rank = (xs) => { const order = xs.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r = new Array(n); for (let k=0;k<n;k++){ r[order[k][1]] = k+1; } return r; };
  // handle ties by averaging ranks
  const avgRank = (xs) => { const order = xs.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r=new Array(n); let k=0; while(k<n){ let j=k; while(j+1<n && order[j+1][0]===order[k][0]) j++; const avg=(k+1+j+1)/2; for(let t=k;t<=j;t++) r[order[t][1]]=avg; k=j+1; } return r; };
  return pearson(avgRank(a), avgRank(b));
}

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

// Group by taskId -> {CONTROL, SUPPORTS, ATTACKS}
const byTask = new Map();
for (const r of rows) {
  if (!byTask.has(r.taskId)) byTask.set(r.taskId, {});
  byTask.get(r.taskId)[r.arm] = r;
}

// Sanity: round-1 state hash identical across arms, and round1AgentBeliefs identical.
let hashMismatch = 0, beliefMismatch = 0;
for (const [tid, arms] of byTask) {
  const hs = new Set(Object.values(arms).map(r => r.round1StateHash));
  if (hs.size !== 1) hashMismatch++;
  const bj = JSON.stringify(arms.CONTROL.round1AgentBeliefs);
  for (const arm of ["SUPPORTS", "ATTACKS"]) {
    if (JSON.stringify(arms[arm].round1AgentBeliefs) !== bj) beliefMismatch++;
  }
}
console.log(`round1StateHash mismatches: ${hashMismatch}; round1AgentBeliefs mismatches: ${beliefMismatch}`);

const tasks = [...byTask.entries()].map(([taskId, arms]) => {
  const correct = arms.CONTROL.resolvedOption;
  const r1Brier = pooledBrier(arms.CONTROL.round1AgentBeliefs, correct);
  const final = { CONTROL: arms.CONTROL.finalBrier, SUPPORTS: arms.SUPPORTS.finalBrier, ATTACKS: arms.ATTACKS.finalBrier };
  return {
    taskId,
    r1Brier,
    final,
    deltaAC: (final.ATTACKS != null && final.CONTROL != null) ? final.ATTACKS - final.CONTROL : null,
    deltaAS: (final.ATTACKS != null && final.SUPPORTS != null) ? final.ATTACKS - final.SUPPORTS : null,
  };
}).sort((a, b) => a.taskId - b.taskId);

// ---------- (1) pre-treatment severity strata ----------
function stratify(tasks, lo, hi) {
  const g = tasks.filter(t => t.r1Brier != null && t.r1Brier > lo && t.r1Brier <= hi);
  const m = (k) => mean(g.map(t => t.final[k]).filter(v => v != null));
  return {
    n: g.length,
    r1Brier: mean(g.map(t => t.r1Brier)),
    CONTROL: m("CONTROL"), SUPPORTS: m("SUPPORTS"), ATTACKS: m("ATTACKS"),
    deltaAC: mean(g.map(t => t.deltaAC).filter(v => v != null)),
    deltaAS: mean(g.map(t => t.deltaAS).filter(v => v != null)),
  };
}

console.log("\n=== (1) PRE-TREATMENT severity strata (round-1 pooled Brier) ===");
const strata = [
  ["catastrophic (r1 Brier > 1.0)", 1.0, Infinity],
  ["mid (0.3 < r1 Brier <= 1.0)", 0.3, 1.0],
  ["good (r1 Brier <= 0.3)", -Infinity, 0.3],
];
for (const [label, lo, hi] of strata) {
  const s = stratify(tasks, lo, hi);
  console.log(`\n${label}: n=${s.n}`);
  console.log(`  round-1 Brier=${s.r1Brier.toFixed(3)} | CONTROL=${s.CONTROL.toFixed(3)} SUPPORTS=${s.SUPPORTS.toFixed(3)} ATTACKS=${s.ATTACKS.toFixed(3)}`);
  console.log(`  ATTACKS-CONTROL=${s.deltaAC.toFixed(3)}  ATTACKS-SUPPORTS=${s.deltaAS.toFixed(3)}`);
}

// Also report the OLD outcome-based strata for direct comparison (CONTROL final Brier).
console.log("\n=== (1b) OLD outcome-based strata (CONTROL final Brier), for comparison ===");
const strata2 = [
  ["catastrophic (CONTROL > 1.0)", 1.0, Infinity],
  ["mid (0.3 < CONTROL <= 1.0)", 0.3, 1.0],
  ["good (CONTROL <= 0.3)", -Infinity, 0.3],
];
for (const [label, lo, hi] of strata2) {
  const g = tasks.filter(t => t.final.CONTROL != null && t.final.CONTROL > lo && t.final.CONTROL <= hi);
  const m = (k) => mean(g.map(t => t.final[k]).filter(v => v != null));
  console.log(`\n${label}: n=${g.length}`);
  console.log(`  CONTROL=${m("CONTROL").toFixed(3)} SUPPORTS=${m("SUPPORTS").toFixed(3)} ATTACKS=${m("ATTACKS").toFixed(3)}`);
  console.log(`  ATTACKS-CONTROL=${mean(g.map(t=>t.deltaAC).filter(v=>v!=null)).toFixed(3)}  ATTACKS-SUPPORTS=${mean(g.map(t=>t.deltaAS).filter(v=>v!=null)).toFixed(3)}`);
}

// ---------- (3) continuous heterogeneity ----------
console.log("\n=== (3) continuous heterogeneity: pre-treatment r1 Brier vs rescue magnitude ===");
const paired = tasks.filter(t => t.r1Brier != null && t.deltaAC != null);
const r1 = paired.map(t => t.r1Brier);
const dAC = paired.map(t => t.deltaAC);
console.log(`n=${paired.length}`);
console.log(`Pearson(r1Brier, ATTACKS-CONTROL) = ${pearson(r1, dAC).toFixed(4)}`);
console.log(`Spearman(r1Brier, ATTACKS-CONTROL) = ${spearman(r1, dAC).toFixed(4)}`);

// Also: pre-treatment severity vs ATTACKS-SUPPORTS (the H1 primary contrast).
const dAS = paired.map(t => t.deltaAS != null ? t.deltaAS : 0);
const pairedAS = tasks.filter(t => t.r1Brier != null && t.deltaAS != null);
console.log(`Pearson(r1Brier, ATTACKS-SUPPORTS) = ${pearson(pairedAS.map(t=>t.r1Brier), pairedAS.map(t=>t.deltaAS)).toFixed(4)}`);
console.log(`Spearman(r1Brier, ATTACKS-SUPPORTS) = ${spearman(pairedAS.map(t=>t.r1Brier), pairedAS.map(t=>t.deltaAS)).toFixed(4)}`);

// Bootstrap CI for Spearman(r1Brier, deltaAC) and Pearson(r1Brier, deltaAC).
const rng = mulberry32(0x5EED0F);
const N = paired.length;
const pearsonDraws = [], spearmanDraws = [];
for (let i = 0; i < 10000; i++) {
  const rr1 = [], rd = [];
  for (let j = 0; j < N; j++) { const k = Math.floor(rng() * N); rr1.push(r1[k]); rd.push(dAC[k]); }
  const p = pearson(rr1, rd); if (p != null) pearsonDraws.push(p);
  const s = spearman(rr1, rd); if (s != null) spearmanDraws.push(s);
}
pearsonDraws.sort((a,b)=>a-b); spearmanDraws.sort((a,b)=>a-b);
console.log(`Pearson 95% CI (bootstrap): [${percentile(pearsonDraws,0.025).toFixed(4)}, ${percentile(pearsonDraws,0.975).toFixed(4)}]`);
console.log(`Spearman 95% CI (bootstrap): [${percentile(spearmanDraws,0.025).toFixed(4)}, ${percentile(spearmanDraws,0.975).toFixed(4)}]`);

// Linear trend (simple OLS slope of deltaAC on r1Brier) + bootstrap CI.
function olsSlope(x, y) { const mx=mean(x), my=mean(y); let num=0, den=0; for(let i=0;i<x.length;i++){num+=(x[i]-mx)*(y[i]-my); den+=(x[i]-mx)**2;} return den===0?null:num/den; }
const slope = olsSlope(r1, dAC);
const slopeDraws = [];
for (let i = 0; i < 10000; i++) { const xx=[],yy=[]; for(let j=0;j<N;j++){const k=Math.floor(rng()*N); xx.push(r1[k]); yy.push(dAC[k]);} const s=olsSlope(xx,yy); if(s!=null) slopeDraws.push(s); }
slopeDraws.sort((a,b)=>a-b);
console.log(`OLS slope (deltaAC per unit r1Brier) = ${slope.toFixed(4)}; 95% CI [${percentile(slopeDraws,0.025).toFixed(4)}, ${percentile(slopeDraws,0.975).toFixed(4)}]`);

// ---------- (4) exposure-volume confound ----------
console.log("\n=== (4) exposure volume: SUPPORTS vs ATTACKS (per task, full disclosure) ===");
function volumeStats(arm) {
  const rows = tasks.map(t => byTask.get(t.taskId)[arm]).filter(r => r);
  const counts = rows.map(r => r.disclosedEvidenceCount);
  const tokens = rows.map(r => r.disclosedTokenCount);
  const meanLen = rows.map(r => r.disclosedEvidenceCount > 0 ? r.disclosedTokenCount / r.disclosedEvidenceCount : 0);
  const src = rows.map(r => r.disclosedSourceAgentCount);
  return { count: mean(counts), countSd: sd(counts), token: mean(tokens), tokenSd: sd(tokens), meanItemLen: mean(meanLen), src: mean(src) };
}
const volS = volumeStats("SUPPORTS");
const volA = volumeStats("ATTACKS");
console.log(`SUPPORTS: mean items=${volS.count.toFixed(2)} (sd ${volS.countSd.toFixed(2)}), mean message chars=${volS.token.toFixed(1)}, mean chars/item=${volS.meanItemLen.toFixed(1)}, mean source agents=${volS.src.toFixed(2)}`);
console.log(`ATTACKS : mean items=${volA.count.toFixed(2)} (sd ${volA.countSd.toFixed(2)}), mean message chars=${volA.token.toFixed(1)}, mean chars/item=${volA.meanItemLen.toFixed(1)}, mean source agents=${volA.src.toFixed(2)}`);

// Paired per-task ATTACKS - SUPPORTS differences.
const volPairs = tasks.map(t => {
  const a = byTask.get(t.taskId).ATTACKS, s = byTask.get(t.taskId).SUPPORTS;
  return {
    taskId: t.taskId,
    dCount: a.disclosedEvidenceCount - s.disclosedEvidenceCount,
    dToken: a.disclosedTokenCount - s.disclosedTokenCount,
    dRatio: s.disclosedTokenCount > 0 ? a.disclosedTokenCount / s.disclosedTokenCount : null,
  };
});
const dCount = volPairs.map(p => p.dCount);
const dToken = volPairs.map(p => p.dToken);
const dRatio = volPairs.map(p => p.dRatio).filter(v => v != null);
console.log(`\npaired ATTACKS-SUPPORTS: mean Δ items=${mean(dCount).toFixed(2)} (median ${median(dCount).toFixed(2)}); mean Δ chars=${mean(dToken).toFixed(1)} (median ${median(dToken).toFixed(1)})`);
console.log(`mean ATTACKS/SUPPORTS char ratio=${mean(dRatio).toFixed(3)}; n tasks with ATTACKS>SUPPORTS items: ${dCount.filter(v=>v>0).length}/${dCount.length}; with ATTACKS<SUPPORTS: ${dCount.filter(v=>v<0).length}`);

// Bootstrap CI for mean Δ items and mean Δ chars (task-cluster).
function bootMeanCI(xs) {
  const draws = [];
  for (let i = 0; i < 10000; i++) { const s=[]; for(let j=0;j<xs.length;j++) s.push(xs[Math.floor(rng()*xs.length)]); draws.push(mean(s)); }
  draws.sort((a,b)=>a-b); return [percentile(draws,0.025), percentile(draws,0.975)];
}
const ciCount = bootMeanCI(dCount), ciToken = bootMeanCI(dToken);
console.log(`mean Δ items 95% CI [${ciCount[0].toFixed(2)}, ${ciCount[1].toFixed(2)}]`);
console.log(`mean Δ chars 95% CI [${ciToken[0].toFixed(1)}, ${ciToken[1].toFixed(1)}]`);

// Per-task dump of pre-treatment severity + deltas for the appendix.
console.log("\n=== per-task table (taskId, r1Brier, CONTROL, SUPPORTS, ATTACKS, dAC, dAS) ===");
for (const t of tasks) {
  console.log(`${t.taskId}\t${t.r1Brier.toFixed(3)}\t${t.final.CONTROL?.toFixed(3) ?? "NA"}\t${t.final.SUPPORTS?.toFixed(3) ?? "NA"}\t${t.final.ATTACKS?.toFixed(3) ?? "NA"}\t${t.deltaAC?.toFixed(3) ?? "NA"}\t${t.deltaAS?.toFixed(3) ?? "NA"}`);
}
