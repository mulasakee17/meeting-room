// Final severity heterogeneity, PAIRED task-level deltas (consistent with
// analyzeForkRows and paper Sec.2). Fixes the arm-wise vs paired inconsistency.
import * as fs from "node:fs";
import * as path from "node:path";

const OUT = "experiments/campaign/pilot_output/v6-fork-confirmatory-v3-20260816";
const mean = (xs) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const percentile=(s,p)=>{const i=(s.length-1)*p;const lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?s[lo]:s[lo]*(hi-i)+s[hi]*(i-lo);};
function pooledBrier(beliefs, correct){if(!beliefs||!beliefs.length)return null;const opts=new Set();for(const b of beliefs)for(const o of Object.keys(b))opts.add(o);opts.add(correct);const p={};for(const o of opts)p[o]=mean(beliefs.map(b=>b[o]??0));return[...opts].reduce((s,o)=>s+(p[o]-(o===correct?1:0))**2,0);}
function pearson(a,b){const n=a.length;const ma=mean(a),mb=mean(b);let nu=0,da=0,db=0;for(let i=0;i<n;i++){nu+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}const d=Math.sqrt(da*db);return d===0?null:nu/d;}
function avgRank(xs){const n=xs.length;const o=xs.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]);const r=new Array(n);let k=0;while(k<n){let j=k;while(j+1<n&&o[j+1][0]===o[k][0])j++;const av=(k+1+j+1)/2;for(let t=k;t<=j;t++)r[o[t][1]]=av;k=j+1;}return r;}
function spearman(a,b){return pearson(avgRank(a),avgRank(b));}

const rows=[];
for(const name of fs.readdirSync(OUT)){if(!name.endsWith(".jsonl"))continue;for(const line of fs.readFileSync(path.join(OUT,name),"utf8").split("\n")){if(line.trim())rows.push(JSON.parse(line));}}
const byTask=new Map();
for(const r of rows){if(!byTask.has(r.taskId))byTask.set(r.taskId,new Map());const s=byTask.get(r.taskId);if(!s.has(r.seed))s.set(r.seed,{});s.get(r.seed)[r.arm]=r;}

const tasks=[];
for(const [tid,bySeed] of [...byTask.entries()].sort((a,b)=>a[0]-b[0])){
  const r1s=[],dAS=[],dAC=[];
  for(const seed of [...bySeed.keys()].sort((a,b)=>a-b)){
    const arms=bySeed.get(seed);if(!arms.CONTROL)continue;
    const r1=pooledBrier(arms.CONTROL.round1AgentBeliefs,arms.CONTROL.resolvedOption);if(r1!=null)r1s.push(r1);
    if(arms.ATTACKS?.finalBrier!=null&&arms.SUPPORTS?.finalBrier!=null)dAS.push(arms.ATTACKS.finalBrier-arms.SUPPORTS.finalBrier);
    if(arms.ATTACKS?.finalBrier!=null&&arms.CONTROL?.finalBrier!=null)dAC.push(arms.ATTACKS.finalBrier-arms.CONTROL.finalBrier);
  }
  tasks.push({tid,r1:mean(r1s),dAS:mean(dAS),dAC:mean(dAC)});
}

const p=tasks.filter(t=>t.r1!=null&&t.dAC!=null);
console.log("PAIRED Spearman(r1, dAC) =", spearman(p.map(t=>t.r1),p.map(t=>t.dAC)).toFixed(4));
console.log("PAIRED Pearson (r1, dAC) =", pearson(p.map(t=>t.r1),p.map(t=>t.dAC)).toFixed(4));
console.log("PAIRED Spearman(r1, dAS) =", spearman(tasks.filter(t=>t.r1!=null&&t.dAS!=null).map(t=>t.r1),tasks.filter(t=>t.r1!=null&&t.dAS!=null).map(t=>t.dAS)).toFixed(4));

// bootstrap CI for paired Spearman (task-cluster)
const rng=mulberry32(0x5EED0F);const draws=[];const N=p.length;
for(let i=0;i<10000;i++){const a=[],b=[];for(let j=0;j<N;j++){const k=Math.floor(rng()*N);a.push(p[k].r1);b.push(p[k].dAC);}const s=spearman(a,b);if(s!=null)draws.push(s);}
draws.sort((x,y)=>x-y);
console.log("PAIRED Spearman 95% CI:", percentile(draws,0.025).toFixed(4), percentile(draws,0.975).toFixed(4));

// severity strata (paired dAC)
function strata(label,lo,hi){const g=tasks.filter(t=>t.r1!=null&&t.r1>lo&&t.r1<=hi);const m=(k)=>mean(g.map(t=>t[k]).filter(v=>v!=null));console.log(`\n${label}: n=${g.length}`);console.log(`  r1=${mean(g.map(t=>t.r1)).toFixed(3)} dAC=${m("dAC").toFixed(3)} dAS=${m("dAS").toFixed(3)}`);}
strata("catastrophic (>1.0)",1.0,Infinity);
strata("moderate (0.3-1.0)",0.3,1.0);
strata("good (<=0.3)",-Infinity,0.3);
