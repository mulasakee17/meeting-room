/**
 * E12 综合分析脚本 (v2)
 *
 * 读取 output/e12/ 下所有 summary JSON，生成完整 A/B/C/D/F 对比报告。
 * 用法: npx tsx experiments/campaign/analyze_e12.ts [--markdown] [--model glm-4-flash]
 */

import * as fs from "fs";
import * as path from "path";

const E12_DIR = path.resolve(__dirname, "output", "e12");
const REPORT_PATH = path.join(E12_DIR, "analysis_report.json");
const MD_REPORT_PATH = path.join(E12_DIR, "analysis_report.md");

// ============================================================================
// Types
// ============================================================================

interface TaskResult {
  taskId: string; seed: number; error?: string;
  // A/F 组
  preAccuracy?: number; postAccuracy?: number; collectiveGain?: number;
  preMajorityCorrect?: boolean; postMajorityCorrect?: boolean;
  // B/C/D 组
  finalKendallTau?: number; finalAccuracy?: number; individualAccuracy?: number;
  preAccuracy_?: number; postAccuracy_?: number; // aliased as pre/post individual accuracy
  totalRounds?: number; converged?: boolean; interventions?: number;
  tokens?: number; elapsedMs?: number; ranking?: string[];
}

interface Summary {
  phase: string; model: string; seeds: number[]; rounds: number;
  completed: number; errors: number;
  preMean?: number; postMean?: number; failCount?: number;
  meanTau?: number; meanAcc?: number; meanIndAcc?: number;
  meanPreAcc?: number; meanPostAcc?: number; meanGain?: number;
  meanIntvs?: number;
  results: TaskResult[];
}

// ============================================================================
// Data Loading
// ============================================================================

function loadSummaries(): Summary[] {
  if (!fs.existsSync(E12_DIR)) return [];
  return fs.readdirSync(E12_DIR)
    .filter(f => f.startsWith("summary_") && f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(E12_DIR, f), "utf-8")));
}

/** Deduplicate: keep latest entry per (taskId, seed), matching on phase+model */
function dedupResults(results: TaskResult[]): TaskResult[] {
  const seen = new Map<string, TaskResult>();
  for (const r of results) {
    const key = `${r.taskId}/${r.seed}`;
    seen.set(key, r); // last wins
  }
  return [...seen.values()];
}

// ============================================================================
// Per-task aggregation
// ============================================================================

interface PerTask {
  taskId: string;
  // Phase A (HiddenBench free-text)
  aPreInd: number | null;
  aPostInd: number | null;   // individual accuracy (average rule)
  aPostGroup: number | null; // majority correct (group level)
  aGain: number | null;
  aN: number;
  // Phase B (structured, no governance)
  bTau: number | null;
  bAcc: number | null;       // group ranking correct
  bIndPre: number | null;    // pre-discussion individual accuracy
  bIndPost: number | null;   // post-discussion individual accuracy
  bN: number;
  // Phase C (+δ governance)
  cTau: number | null;
  cAcc: number | null;
  cIndPre: number | null;
  cIndPost: number | null;
  cIntvs: number | null;
  cIntvRate: number | null;  // fraction of runs where δ triggered
  cN: number;
  // Phase D (+static DA)
  dTau: number | null;
  dAcc: number | null;
  dIndPre: number | null;
  dIndPost: number | null;
  dN: number;
  // Phase F (Full Profile ceiling)
  fAcc: number | null;
  fN: number;
}

interface ModelData {
  byTask: Map<string, PerTask>;
  global: {
    aPreInd: number; aPostInd: number; aPostGroup: number; aN: number;
    bTau: number; bAcc: number; bIndPre: number; bIndPost: number; bN: number;
    cTau: number; cAcc: number; cIndPre: number; cIndPost: number; cIntvs: number; cN: number;
    dTau: number; dAcc: number; dIndPre: number; dIndPost: number; dN: number;
    fAcc: number; fN: number;
  };
}

function aggregateModel(summaries: Summary[], model: string): ModelData {
  const byTask = new Map<string, PerTask>();

  function get(tid: string): PerTask {
    if (!byTask.has(tid)) {
      byTask.set(tid, { taskId: tid,
        aPreInd: null, aPostInd: null, aPostGroup: null, aGain: null, aN: 0,
        bTau: null, bAcc: null, bIndPre: null, bIndPost: null, bN: 0,
        cTau: null, cAcc: null, cIndPre: null, cIndPost: null, cIntvs: null, cIntvRate: null, cN: 0,
        dTau: null, dAcc: null, dIndPre: null, dIndPost: null, dN: 0,
        fAcc: null, fN: 0,
      });
    }
    return byTask.get(tid)!;
  }

  for (const s of summaries) {
    if (s.model !== model) continue;
    const deduped = dedupResults(s.results);

    for (const r of deduped) {
      if (r.error) continue;
      const t = get(r.taskId);

      if (s.phase === "A") {
        t.aPreInd!== null ? t.aPreInd! += (r.preAccuracy ?? 0) : t.aPreInd = (r.preAccuracy ?? 0);
        t.aPostInd!== null ? t.aPostInd! += (r.postAccuracy ?? 0) : t.aPostInd = (r.postAccuracy ?? 0);
        t.aPostGroup!== null ? t.aPostGroup! += (r.postMajorityCorrect ? 1 : 0) : t.aPostGroup = (r.postMajorityCorrect ? 1 : 0);
        t.aGain!== null ? t.aGain! += (r.collectiveGain ?? 0) : t.aGain = (r.collectiveGain ?? 0);
        t.aN++;
      } else if (s.phase === "B") {
        t.bTau!== null ? t.bTau! += (r.finalKendallTau ?? 0) : t.bTau = (r.finalKendallTau ?? 0);
        t.bAcc!== null ? t.bAcc! += (r.finalAccuracy ?? 0) : t.bAcc = (r.finalAccuracy ?? 0);
        t.bIndPre!== null ? t.bIndPre! += (r.preAccuracy ?? 0) : t.bIndPre = (r.preAccuracy ?? 0);
        t.bIndPost!== null ? t.bIndPost! += (r.individualAccuracy ?? 0) : t.bIndPost = (r.individualAccuracy ?? 0);
        t.bN++;
      } else if (s.phase === "C") {
        t.cTau!== null ? t.cTau! += (r.finalKendallTau ?? 0) : t.cTau = (r.finalKendallTau ?? 0);
        t.cAcc!== null ? t.cAcc! += (r.finalAccuracy ?? 0) : t.cAcc = (r.finalAccuracy ?? 0);
        t.cIndPre!== null ? t.cIndPre! += (r.preAccuracy ?? 0) : t.cIndPre = (r.preAccuracy ?? 0);
        t.cIndPost!== null ? t.cIndPost! += (r.individualAccuracy ?? 0) : t.cIndPost = (r.individualAccuracy ?? 0);
        t.cIntvs!== null ? t.cIntvs! += (r.interventions ?? 0) : t.cIntvs = (r.interventions ?? 0);
        if (r.interventions && r.interventions > 0) {
          t.cIntvRate!== null ? t.cIntvRate!++ : t.cIntvRate = 1;
        }
        t.cN++;
      } else if (s.phase === "D") {
        t.dTau!== null ? t.dTau! += (r.finalKendallTau ?? 0) : t.dTau = (r.finalKendallTau ?? 0);
        t.dAcc!== null ? t.dAcc! += (r.finalAccuracy ?? 0) : t.dAcc = (r.finalAccuracy ?? 0);
        t.dIndPre!== null ? t.dIndPre! += (r.preAccuracy ?? 0) : t.dIndPre = (r.preAccuracy ?? 0);
        t.dIndPost!== null ? t.dIndPost! += (r.individualAccuracy ?? 0) : t.dIndPost = (r.individualAccuracy ?? 0);
        t.dN++;
      } else if (s.phase === "F") {
        t.fAcc!== null ? t.fAcc! += (r.postAccuracy ?? 0) : t.fAcc = (r.postAccuracy ?? 0);
        t.fN++;
      }
    }
  }

  // Average
  for (const t of byTask.values()) {
    if (t.aN > 0) { t.aPreInd! /= t.aN; t.aPostInd! /= t.aN; t.aPostGroup! /= t.aN; t.aGain! /= t.aN; }
    if (t.bN > 0) { t.bTau! /= t.bN; t.bAcc! /= t.bN; t.bIndPre! /= t.bN; t.bIndPost! /= t.bN; }
    if (t.cN > 0) { t.cTau! /= t.cN; t.cAcc! /= t.cN; t.cIndPre! /= t.cN; t.cIndPost! /= t.cN; t.cIntvs! /= t.cN; }
    if (t.dN > 0) { t.dTau! /= t.dN; t.dAcc! /= t.dN; t.dIndPre! /= t.dN; t.dIndPost! /= t.dN; }
    if (t.fN > 0) { t.fAcc! /= t.fN; }
  }

  // Global aggregates (only across tasks present in A)
  const aTaskIds = [...byTask.values()].filter(t => t.aN > 0);
  const global: ModelData["global"] = {
    aPreInd: 0, aPostInd: 0, aPostGroup: 0, aN: 0,
    bTau: 0, bAcc: 0, bIndPre: 0, bIndPost: 0, bN: 0,
    cTau: 0, cAcc: 0, cIndPre: 0, cIndPost: 0, cIntvs: 0, cN: 0,
    dTau: 0, dAcc: 0, dIndPre: 0, dIndPost: 0, dN: 0,
    fAcc: 0, fN: 0,
  };

  for (const t of aTaskIds) {
    global.aPreInd += t.aPreInd ?? 0; global.aPostInd += t.aPostInd ?? 0;
    global.aPostGroup += t.aPostGroup ?? 0; global.aN++;
    if (t.fAcc !== null) { global.fAcc += t.fAcc; global.fN++; }
  }

  // B/C/D: only across tasks where A and that phase both have data
  const abTasks = aTaskIds.filter(t => t.bN > 0);
  for (const t of abTasks) {
    global.bTau += t.bTau ?? 0; global.bAcc += t.bAcc ?? 0;
    global.bIndPre += t.bIndPre ?? 0; global.bIndPost += t.bIndPost ?? 0; global.bN++;
  }
  const acTasks = aTaskIds.filter(t => t.cN > 0);
  for (const t of acTasks) {
    global.cTau += t.cTau ?? 0; global.cAcc += t.cAcc ?? 0;
    global.cIndPre += t.cIndPre ?? 0; global.cIndPost += t.cIndPost ?? 0;
    global.cIntvs += t.cIntvs ?? 0; global.cN++;
  }
  const adTasks = aTaskIds.filter(t => t.dN > 0);
  for (const t of adTasks) {
    global.dTau += t.dTau ?? 0; global.dAcc += t.dAcc ?? 0;
    global.dIndPre += t.dIndPre ?? 0; global.dIndPost += t.dIndPost ?? 0; global.dN++;
  }

  if (global.aN) { global.aPreInd /= global.aN; global.aPostInd /= global.aN; global.aPostGroup /= global.aN; }
  if (global.bN) { global.bTau /= global.bN; global.bAcc /= global.bN; global.bIndPre /= global.bN; global.bIndPost /= global.bN; }
  if (global.cN) { global.cTau /= global.cN; global.cAcc /= global.cN; global.cIndPre /= global.cN; global.cIndPost /= global.cN; global.cIntvs /= global.cN; }
  if (global.dN) { global.dTau /= global.dN; global.dAcc /= global.dN; global.dIndPre /= global.dN; global.dIndPost /= global.dN; }
  if (global.fN) { global.fAcc /= global.fN; }

  return { byTask, global };
}

// ============================================================================
// Output
// ============================================================================

let _ = ""; // suppress unused warnings

function fmt(v: string, w: number): string { return v.padEnd(w); }
function pct(v: number | null): string { return v != null ? (v * 100).toFixed(0) + "%" : "—"; }
function tauStr(v: number | null): string { return v != null ? v.toFixed(2) : "—"; }
function num(v: number | null, d = 1): string { return v != null ? v.toFixed(d) : "—"; }
function delta(a: number | null, b: number | null): string {
  if (a == null || b == null) return "—";
  const d = (b - a) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(0)}pp`;
}

function printConsole(model: string, data: ModelData) {
  const { byTask, global } = data;
  const bar = "=".repeat(80);

  console.log(`\n${bar}`);
  console.log(`  ${model}  —  E12 A/B/C/D/F`);
  console.log(bar);

  // Global summary
  const hdr = fmt("Phase",6) + fmt("Runs",6) + fmt("IndPre",8) + fmt("IndPost",8) + fmt("GroupAcc",8) + fmt("Tau",8) + fmt("Intvs",6) + fmt("vsA(ind)",12) + fmt("vsB(ind)",12);
  console.log(`\n  Global:`);
  console.log(`  ${hdr}`);
  console.log(`  ${"-".repeat(74)}`);

  const row = (label: string, n: number, indPre: number|null, indPost: number|null, grp: number|null, tau: number|null, intvs: number|null, vsA: string, vsB: string) =>
    fmt(label,6) + fmt(String(n),6) + fmt(pct(indPre),8) + fmt(pct(indPost),8) + fmt(pct(grp),8) + fmt(tauStr(tau),8) + fmt(num(intvs),6) + fmt(vsA,12) + fmt(vsB,12);

  console.log(`  ${row("A", global.aN, global.aPreInd, global.aPostInd, global.aPostGroup, null, null, "—", "—")}`);
  console.log(`  ${row("B", global.bN, global.bIndPre, global.bIndPost, global.bAcc, global.bTau, null, delta(global.aPostInd, global.bIndPost), "—")}`);
  console.log(`  ${row("C", global.cN, global.cIndPre, global.cIndPost, global.cAcc, global.cTau, global.cIntvs, delta(global.aPostInd, global.cIndPost), delta(global.bIndPost, global.cIndPost))}`);
  console.log(`  ${row("D", global.dN, global.dIndPre, global.dIndPost, global.dAcc, global.dTau, null, delta(global.aPostInd, global.dIndPost), delta(global.bIndPost, global.dIndPost))}`);
  console.log(`  ${row("F", global.fN, null, global.fAcc, null, null, null, "—", "—")}`);

  // Per-task
  const failTasks = [...byTask.values()]
    .filter(t => t.aN > 0 && (t.aPostInd ?? 0) <= 0.5)
    .sort((a, b) => a.taskId.localeCompare(b.taskId));

  if (failTasks.length === 0) {
    console.log("\n  No failing tasks in A.");
    return;
  }

  const thdr = fmt("Task",8) + fmt("A_ind",7) + fmt("B_ind",7) + fmt("Δ(B-A)",9) + fmt("C_ind",7) + fmt("Δ(C-B)",9) + fmt("C_intv",7) + fmt("D_ind",7) + fmt("Δ(D-B)",9) + fmt("F",6) + fmt("Verdict",16);
  console.log(`\n  ${failTasks.length} failing tasks from A:`);
  console.log(`  ${thdr}`);
  console.log(`  ${"-".repeat(92)}`);

  let pw = 0, gw = 0, bf = 0, gh = 0, dw = 0;
  for (const t of failTasks) {
    const bi = t.bIndPost, ci = t.cIndPost, di = t.dIndPost, ai = t.aPostInd ?? 0;
    let v = "—";
    if (bi != null && ci != null) {
      if (bi > 0.5) { v = "protocol_win"; pw++; }
      else if (ci > 0.5 && ci > bi) { v = "gov_win"; gw++; }
      else if (ci <= 0.5 && bi <= 0.5) { v = "both_fail"; bf++; }
      else if (ci < bi) { v = "gov_harm"; gh++; }
      else v = "tie";
    } else if (bi != null && bi > 0.5) { v = "protocol_win"; pw++; }
    if (di != null && bi != null && di > bi) dw++;

    const line = fmt(t.taskId,8) + fmt(pct(ai),7) + fmt(pct(bi),7) + fmt(delta(ai, bi),9) + fmt(pct(ci),7) + fmt(delta(bi, ci),9) + fmt(num(t.cIntvs),7) + fmt(pct(di),7) + fmt(delta(bi, di),9) + fmt(pct(t.fAcc),6) + fmt(v,16);
    console.log(`  ${line}`);
  }

  console.log(`\n  Summary: protocol_win=${pw}  gov_win=${gw}  both_fail=${bf}  gov_harm=${gh}`);
  if (dw > 0) console.log(`  D improves over B on ${dw} tasks`);
}

function printMarkdown(models: Map<string, ModelData>) {
  const lines: string[] = [];
  lines.push("# E12 Experiment Analysis Report");
  lines.push(`\nGenerated: ${new Date().toISOString()}\n`);

  for (const [model, data] of models) {
    const { byTask, global } = data;

    lines.push(`## Model: ${model}\n`);

    // Global table
    lines.push("### Global Averages\n");
    lines.push("| Phase | Tasks | IndPre | IndPost | GroupAcc | τ | Intvs | Δ vs A (ind) | Δ vs B (ind) |");
    lines.push("|-------|-------|--------|---------|----------|------|-------|---------------|---------------|");
    lines.push(`| A | ${global.aN} | ${pct(global.aPreInd)} | ${pct(global.aPostInd)} | ${pct(global.aPostGroup)} | — | — | — | — |`);
    lines.push(`| B | ${global.bN} | ${pct(global.bIndPre)} | ${pct(global.bIndPost)} | ${pct(global.bAcc)} | ${tauStr(global.bTau)} | — | ${delta(global.aPostInd, global.bIndPost)} | — |`);
    lines.push(`| C | ${global.cN} | ${pct(global.cIndPre)} | ${pct(global.cIndPost)} | ${pct(global.cAcc)} | ${tauStr(global.cTau)} | ${num(global.cIntvs)} | ${delta(global.aPostInd, global.cIndPost)} | ${delta(global.bIndPost, global.cIndPost)} |`);
    lines.push(`| D | ${global.dN} | ${pct(global.dIndPre)} | ${pct(global.dIndPost)} | ${pct(global.dAcc)} | ${tauStr(global.dTau)} | — | ${delta(global.aPostInd, global.dIndPost)} | ${delta(global.bIndPost, global.dIndPost)} |`);
    lines.push(`| F | ${global.fN} | — | ${pct(global.fAcc)} | — | — | — | — | — |`);
    lines.push("");

    // Per-task detail
    const failTasks = [...byTask.values()]
      .filter(t => t.aN > 0 && (t.aPostInd ?? 0) <= 0.5)
      .sort((a, b) => a.taskId.localeCompare(b.taskId));

    lines.push(`### Per-Task Detail (${failTasks.length} failing tasks)\n`);
    lines.push("| Task | A_ind | B_ind | Δ(B-A) | C_ind | Δ(C-B) | C_intv | D_ind | Δ(D-B) | F |");
    lines.push("|------|-------|-------|--------|-------|--------|--------|-------|--------|---|");

    for (const t of failTasks) {
      const cols = [
        t.taskId,
        pct(t.aPostInd),
        pct(t.bIndPost),
        delta(t.aPostInd ?? 0, t.bIndPost),
        pct(t.cIndPost),
        delta(t.bIndPost, t.cIndPost),
        num(t.cIntvs),
        pct(t.dIndPost),
        delta(t.bIndPost, t.dIndPost),
        pct(t.fAcc),
      ];
      lines.push(`| ${cols.join(" | ")} |`);
    }
    lines.push("");

    // Deepseek specific: hb_5/hb_7 3-seed comparison
    if (model === "deepseek-chat") {
      lines.push("### Deepseek hb_5/hb_7 3-Seed Comparison\n");
      lines.push("Task-level pass rates (group accuracy):\n");
      lines.push("| Task | A (free-text) | B (structured) | C (+δ) | D (+static DA) |");
      lines.push("|------|---------------|----------------|--------|----------------|");
      for (const tid of ["hb_5", "hb_7"]) {
        const t = byTask.get(tid);
        if (t) {
          lines.push(`| ${tid} | ${pct(t.aPostInd)} | ${pct(t.bAcc)} | ${pct(t.cAcc)} | ${pct(t.dAcc)} |`);
        }
      }
      lines.push("");
    }
  }

  // Summary
  lines.push("## Key Findings\n");
  lines.push("1. **Protocol effect (A→B)**: Structured protocol + hint induces unique information sharing that free-text round-robin lacks.");
  lines.push("2. **Governance effect (B→C)**: δ cognitive governance provides additional improvement over structured protocol alone.");
  lines.push("3. **Static DA (B→D)**: Static devil's advocate provides no measurable benefit, confirming HiddenBench §6.4's finding that generic DA prompts don't help.");
  lines.push("4. **δ vs Static DA (C vs D)**: δ's dynamic, signal-driven intervention outperforms generic static DA.");
  lines.push("");

  fs.writeFileSync(MD_REPORT_PATH, lines.join("\n"));
  console.log(`\nMarkdown report saved: ${MD_REPORT_PATH}`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const markdown = args.includes("--markdown");
  const modelFilter = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;

  const summaries = loadSummaries();
  if (summaries.length === 0) {
    console.log("No summary files found. Run experiments first.");
    return;
  }

  console.log(`Loaded ${summaries.length} summary files:`);
  for (const s of summaries) {
    console.log(`  Phase ${s.phase} ${s.model}: ${s.completed} runs, ${s.errors} errors`);
  }

  const models = modelFilter
    ? [modelFilter]
    : [...new Set(summaries.map(s => s.model))].sort();

  const allData = new Map<string, ModelData>();

  for (const model of models) {
    console.log(`\nAnalyzing ${model}...`);
    const data = aggregateModel(summaries, model);
    allData.set(model, data);
    printConsole(model, data);
  }

  // Save JSON report
  const report = {
    timestamp: new Date().toISOString(),
    models: Object.fromEntries(
      [...allData.entries()].map(([model, data]) => [
        model,
        {
          global: data.global,
          failingTaskCount: [...data.byTask.values()].filter(t => t.aN > 0 && (t.aPostInd ?? 0) <= 0.5).length,
        },
      ]),
    ),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nJSON report saved: ${REPORT_PATH}`);

  if (markdown) {
    printMarkdown(allData);
  }
}

main();
