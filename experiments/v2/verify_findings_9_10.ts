/**
 * 验证"发现 9 治理测不准"和"发现 10 单点恶意高估"的具体数字
 * 输出言行一致性和对齐分的逐 agent 均值
 */
import * as fs from "fs";
import * as path from "path";

const BASE = path.resolve(process.cwd(), "experiments/v2");

function loadDir(dir: string, prefix: string): any[] {
  const full = path.join(BASE, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith(".json") && f.startsWith(prefix))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(full, f), "utf8")); } catch { return null; } })
    .filter(Boolean);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function computeConsistency(utteranceBelief: number, actualBelief: number): number {
  return clamp(1 - Math.abs(utteranceBelief - actualBelief) / 2, 0, 1);
}

function computeAnchor(beliefs: Record<string, number>, histories: Record<string, number[]>): number {
  const stableBeliefs: number[] = [];
  for (const id of Object.keys(beliefs)) {
    const h = histories[id];
    if (!h || h.length < 2) continue;
    const m = mean(h);
    const variance = h.reduce((s, v) => s + (v - m) ** 2, 0) / h.length;
    if (variance < 0.02) stableBeliefs.push(beliefs[id]);
  }
  if (stableBeliefs.length === 0) return mean(Object.values(beliefs));
  return mean(stableBeliefs);
}

function computeAlignment(
  before: Record<string, { belief: number; confidence: number }>,
  after: Record<string, { belief: number; confidence: number }>,
  anchor: number
): number {
  const ids = Object.keys(before);
  let sumCosine = 0, count = 0;
  for (const id of ids) {
    const dGroup = (after[id]?.belief ?? 0) - (before[id]?.belief ?? 0);
    const dAnchor = anchor - (before[id]?.belief ?? 0);
    if (Math.abs(dGroup) < 1e-6 && Math.abs(dAnchor) < 1e-6) { sumCosine += 1; count++; continue; }
    const cos = (dGroup * dAnchor) / (Math.abs(dGroup) * Math.abs(dAnchor) + 1e-10);
    sumCosine += cos; count++;
  }
  return count > 0 ? clamp((sumCosine / count + 1) / 2, 0, 1) : 0.5;
}

function analyzeGroup(name: string, data: any[]) {
  console.log(`\n${"=" .repeat(60)}`);
  console.log(`  ${name} (n=${data.length})`);
  console.log(`${"=" .repeat(60)}`);

  const maliciousIds = data[0]?.maliciousAgentIds || [];
  console.log(`恶意 agent: ${maliciousIds.join(", ")}`);

  // 收集所有 agent ID
  const allAgents = new Set<string>();
  for (const exp of data) {
    for (const r of exp.governanceTrace || []) {
      for (const s of (r.perUtteranceSnapshots || [])) {
        allAgents.add(s.speakerId);
        for (const id of Object.keys(s.beliefsBefore || {})) allAgents.add(id);
      }
    }
  }

  const consistencyByAgent: Record<string, number[]> = {};
  const alignmentByAgent: Record<string, number[]> = {};
  const beliefHistories: Record<string, number[]> = {};

  for (const id of allAgents) {
    consistencyByAgent[id] = [];
    alignmentByAgent[id] = [];
    beliefHistories[id] = [];
  }

  for (const exp of data) {
    for (const round of exp.governanceTrace || []) {
      for (const snap of (round.perUtteranceSnapshots || [])) {
        const sid = snap.speakerId;
        const actualBelief = snap.beliefsBefore?.[sid]?.belief ?? snap.belief;
        const consistency = computeConsistency(snap.belief, actualBelief);
        consistencyByAgent[sid].push(consistency);

        // 更新信念历史
        for (const id of allAgents) {
          const b = snap.beliefsAfter?.[id]?.belief;
          if (b !== undefined) beliefHistories[id].push(b);
        }

        const currentBeliefs: Record<string, number> = {};
        for (const id of allAgents) currentBeliefs[id] = snap.beliefsBefore?.[id]?.belief ?? 0;
        const anchor = computeAnchor(currentBeliefs, beliefHistories);
        const alignment = computeAlignment(snap.beliefsBefore || {}, snap.beliefsAfter || {}, anchor);
        alignmentByAgent[sid].push(alignment);
      }
    }
  }

  console.log("\n言行一致性（consistency）均值：");
  for (const id of allAgents) {
    const c = consistencyByAgent[id];
    const isMalicious = maliciousIds.includes(id);
    const marker = isMalicious ? " ← 恶意" : "";
    console.log(`  ${id}: ${mean(c).toFixed(4)} (n=${c.length})${marker}`);
  }

  console.log("\n对齐分（alignment）均值：");
  for (const id of allAgents) {
    const a = alignmentByAgent[id];
    const isMalicious = maliciousIds.includes(id);
    const marker = isMalicious ? " ← 恶意" : "";
    console.log(`  ${id}: ${mean(a).toFixed(4)} (n=${a.length})${marker}`);
  }

  // 恶意 vs 诚实聚合
  const maliciousCons = maliciousIds.flatMap(id => consistencyByAgent[id] || []);
  const honestCons = Array.from(allAgents).filter(id => !maliciousIds.includes(id)).flatMap(id => consistencyByAgent[id] || []);
  const maliciousAlign = maliciousIds.flatMap(id => alignmentByAgent[id] || []);
  const honestAlign = Array.from(allAgents).filter(id => !maliciousIds.includes(id)).flatMap(id => alignmentByAgent[id] || []);

  console.log("\n聚合：");
  console.log(`  恶意言行一致性: ${mean(maliciousCons).toFixed(4)} (n=${maliciousCons.length})`);
  console.log(`  诚实言行一致性: ${mean(honestCons).toFixed(4)} (n=${honestCons.length})`);
  console.log(`  差异: ${(mean(honestCons) - mean(maliciousCons)).toFixed(4)}`);
  console.log(`  恶意对齐分: ${mean(maliciousAlign).toFixed(4)}`);
  console.log(`  诚实对齐分: ${mean(honestAlign).toFixed(4)}`);
  console.log(`  差异: ${(mean(honestAlign) - mean(maliciousAlign)).toFixed(4)}`);
}

const eData = loadDir("data_fraud_malicious", "fraud_E_");
const fData = loadDir("data_fraud_malicious", "fraud_F_");

analyzeGroup("E 组（治理开）", eData);
analyzeGroup("F 组（治理关）", fData);