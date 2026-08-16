// Generate the two-panel main figure (SVG) from frozen v3 fork data.
// Panel A: identical-state fork diagram (hand-drawn).
// Panel B: state-dependent rescue scatter (45 task-level points).
import * as fs from "node:fs";
import * as path from "node:path";

const OUT = "experiments/campaign/pilot_output/v6-fork-confirmatory-v3-20260816";
const FIG_DIR = "paper_rewriting_output/final_paper";

const mean = (xs) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
function pooledBrier(beliefs, correct) {
  if (!beliefs || !beliefs.length) return null;
  const opts = new Set(); for (const b of beliefs) for (const o of Object.keys(b)) opts.add(o); opts.add(correct);
  const p = {}; for (const o of opts) p[o] = mean(beliefs.map(b => b[o] ?? 0));
  return [...opts].reduce((s, o) => s + (p[o] - (o === correct ? 1 : 0)) ** 2, 0);
}
function spearman(a, b) {
  const n = a.length; const rank = (xs) => { const o = xs.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r=new Array(n); let k=0; while(k<n){let j=k; while(j+1<n && o[j+1][0]===o[k][0]) j++; const av=(k+1+j+1)/2; for(let t=k;t<=j;t++) r[o[t][1]]=av; k=j+1;} return r; };
  const ra=rank(a), rb=rank(b); const ma=mean(ra), mb=mean(rb); let nu=0,da=0,db=0;
  for(let i=0;i<n;i++){nu+=(ra[i]-ma)*(rb[i]-mb); da+=(ra[i]-ma)**2; db+=(rb[i]-mb)**2;}
  return nu/Math.sqrt(da*db);
}

// Load rows, group by task -> seed -> arm.
const rows = [];
for (const name of fs.readdirSync(OUT)) {
  if (!name.endsWith(".jsonl")) continue;
  for (const line of fs.readFileSync(path.join(OUT, name), "utf8").split("\n")) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
}
const byTask = new Map();
for (const r of rows) { if(!byTask.has(r.taskId)) byTask.set(r.taskId, new Map()); const s=byTask.get(r.taskId); if(!s.has(r.seed)) s.set(r.seed, {}); s.get(r.seed)[r.arm]=r; }

// Task-level (seed-averaged) round-1 Brier and deltaAC.
const pts = [];
for (const [tid, bySeed] of [...byTask.entries()].sort((a,b)=>a[0]-b[0])) {
  const r1s = [], dACs = [];
  for (const seed of [...bySeed.keys()].sort((a,b)=>a-b)) {
    const arms = bySeed.get(seed); if (!arms.CONTROL) continue;
    const correct = arms.CONTROL.resolvedOption;
    const r1 = pooledBrier(arms.CONTROL.round1AgentBeliefs, correct);
    if (r1 != null) r1s.push(r1);
    if (arms.ATTACKS?.finalBrier != null && arms.CONTROL?.finalBrier != null) dACs.push(arms.ATTACKS.finalBrier - arms.CONTROL.finalBrier);
  }
  if (r1s.length) pts.push({ taskId: tid, r1: mean(r1s), dAC: mean(dACs) });
}
console.log("n points =", pts.length);
const rho = spearman(pts.map(p=>p.r1), pts.map(p=>p.dAC));
console.log("Spearman(r1, deltaAC) =", rho.toFixed(4));
console.log("data (taskId r1 dAC):");
for (const p of pts) console.log(`${p.taskId}\t${p.r1.toFixed(4)}\t${p.dAC.toFixed(4)}`);

// ---- SVG layout ----
const W = 960, H = 480;
// Panel A region: x in [30, 420]; Panel B region: x in [470, 940].
function panelB() {
  const x0 = 500, y0 = 60, w = 380, h = 360;
  const xmin = 0, xmax = 2.0, ymin = -2.0, ymax = 1.0;
  const X = (v) => x0 + (v - xmin) / (xmax - xmin) * w;
  const Y = (v) => y0 + (ymax - v) / (ymax - ymin) * h;
  let s = "";
  // axes
  s += `<line x1="${X(0)}" y1="${Y(ymin)}" x2="${X(xmax)}" y2="${Y(ymin)}" stroke="#000" stroke-width="1.5"/>`;
  s += `<line x1="${X(0)}" y1="${Y(ymin)}" x2="${X(0)}" y2="${Y(ymax)}" stroke="#000" stroke-width="1.5"/>`;
  // y=0 reference line
  s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(xmax)}" y2="${Y(0)}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
  // gridlines + ticks
  for (let gx = 0; gx <= 2.0; gx += 0.5) { s += `<line x1="${X(gx)}" y1="${Y(ymin)}" x2="${X(gx)}" y2="${Y(ymin)+4}" stroke="#000"/>`; s += `<text x="${X(gx)}" y="${Y(ymin)+18}" font-size="11" text-anchor="middle" font-family="Times,serif">${gx.toFixed(1)}</text>`; }
  for (let gy = -2; gy <= 1; gy += 0.5) { s += `<line x1="${X(0)-4}" y1="${Y(gy)}" x2="${X(0)}" y2="${Y(gy)}" stroke="#000"/>`; s += `<text x="${X(0)-8}" y="${Y(gy)+4}" font-size="11" text-anchor="end" font-family="Times,serif">${gy.toFixed(1)}</text>`; }
  // points
  for (const p of pts) s += `<circle cx="${X(p.r1)}" cy="${Y(p.dAC)}" r="3.2" fill="#000"/>`;
  // annotation
  s += `<text x="${x0 + w/2}" y="${y0 - 8}" font-size="14" text-anchor="middle" font-family="Times,serif" font-style="italic">Spearman \u03c1 = ${rho.toFixed(2)}</text>`;
  // axis labels
  s += `<text x="${x0 + w/2}" y="${Y(ymin)+40}" font-size="13" text-anchor="middle" font-family="Times,serif">pre-treatment round-1 Brier</text>`;
  s += `<text x="${x0-40}" y="${y0 + h/2}" font-size="13" text-anchor="middle" font-family="Times,serif" transform="rotate(-90 ${x0-40} ${y0+h/2})">Brier(ATTACKS) \u2212 Brier(CONTROL)</text>`;
  return s;
}

function panelA() {
  const cx = 220, top = 60;
  let s = "";
  s += `<rect x="120" y="${top-38}" width="200" height="40" rx="6" fill="#eee" stroke="#000"/>`;
  s += `<text x="${cx}" y="${top-12}" font-size="13" text-anchor="middle" font-family="Times,serif" font-weight="bold">SAME ROUND-1 STATE</text>`;
  s += `<text x="${cx}" y="${top-26}" font-size="10" text-anchor="middle" font-family="Times,serif" font-style="italic">(transcript, beliefs, registry, state hash)</text>`;
  // three branch lines
  const arms = [["CONTROL", 60, "nothing disclosed"], ["SUPPORTS", 220, "confirming"], ["ATTACKS", 380, "disconfirming"]];
  for (const [label, ax, desc] of arms) {
    s += `<line x1="${cx}" y1="${top+2}" x2="${ax}" y2="${top+70}" stroke="#000" stroke-width="1.2"/>`;
    s += `<rect x="${ax-40}" y="${top+70}" width="80" height="28" rx="4" fill="#fff" stroke="#000"/>`;
    s += `<text x="${ax}" y="${top+88}" font-size="12" text-anchor="middle" font-family="Times,serif" font-weight="bold">${label}</text>`;
  }
  // converge
  s += `<line x1="60" y1="${top+98}" x2="${cx}" y2="${top+140}" stroke="#000" stroke-width="1.2"/>`;
  s += `<line x1="220" y1="${top+98}" x2="${cx}" y2="${top+140}" stroke="#000" stroke-width="1.2"/>`;
  s += `<line x1="380" y1="${top+98}" x2="${cx}" y2="${top+140}" stroke="#000" stroke-width="1.2"/>`;
  s += `<rect x="${cx-90}" y="${top+140}" width="180" height="28" rx="4" fill="#eee" stroke="#000"/>`;
  s += `<text x="${cx}" y="${top+158}" font-size="12" text-anchor="middle" font-family="Times,serif">private final beliefs</text>`;
  s += `<line x1="${cx}" y1="${top+168}" x2="${cx}" y2="${top+200}" stroke="#000" stroke-width="1.2"/>`;
  s += `<rect x="${cx-70}" y="${top+200}" width="140" height="28" rx="4" fill="#fff" stroke="#000"/>`;
  s += `<text x="${cx}" y="${top+218}" font-size="12" text-anchor="middle" font-family="Times,serif">offline Brier</text>`;
  s += `<text x="${cx}" y="${top+250}" font-size="10" text-anchor="middle" font-family="Times,serif" font-style="italic">same realized past, different public evidence</text>`;
  return s;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<text x="220" y="20" font-size="15" text-anchor="middle" font-family="Times,serif" font-weight="bold">(a) Identical-state fork</text>
<text x="720" y="20" font-size="15" text-anchor="middle" font-family="Times,serif" font-weight="bold">(b) State-dependent rescue</text>
${panelA()}
${panelB()}
</svg>`;

fs.writeFileSync(path.join(FIG_DIR, "figure1.svg"), svg + "\n");
console.log("wrote figure1.svg");
