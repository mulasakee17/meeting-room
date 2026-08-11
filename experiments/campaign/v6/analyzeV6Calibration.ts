/**
 * Read-only v6 calibration analysis (Day 5 / Gate D5). Computes the frozen
 * calibration pilot table from raw-run schema-5 artifacts alone — no manual
 * metric copying. Deterministic: the same artifacts regenerate the same table.
 *
 * This is analysis tooling, not a confirmatory estimator. All values are
 * calibration/exploratory.
 */

import {
  isVerifiedV6CalibrationArtifactV1,
  loadVerifiedV6CalibrationDatasetV1,
  type V6CalibrationAllocationMode,
  type V6CalibrationDatasetSpecV1,
  type VerifiedV6CalibrationArtifactV1,
} from "./verifiedCalibrationDataset";

function get(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}
function getPath(obj: unknown, keys: string[]): unknown {
  let cur = obj;
  for (const key of keys) {
    cur = get(cur, key);
    if (cur === undefined) return undefined;
  }
  return cur;
}
function arr(obj: unknown): unknown[] {
  return Array.isArray(obj) ? obj : [];
}

export interface V6CalibrationRunRow {
  runId: string;
  family: string;
  protocol: string;
  assignedArm: string | null;
  allocationMode: V6CalibrationAllocationMode;
  operationalBrier: number | null;
  answeredRate: number;
  terminalCounts: { answered: number; abstained: number; invalid: number; unavailable: number };
  accuracy: number | null;
  taskOutcomeStatus: "scored" | "unresolved" | "invalid";
  totalTokens: number;
  totalLatencyMs: number;
  governanceTriggered: boolean;
  governanceArms: string[];
  delivered: boolean;
}

export interface V6CalibrationArmAggregate {
  family: string;
  protocol: string;
  allocationMode: V6CalibrationAllocationMode;
  runs: number;
  meanOperationalBrier: number | null;
  answeredRate: number;
  terminalCounts: { answered: number; abstained: number; invalid: number; unavailable: number };
  meanAccuracy: number | null;
  taskOutcomeStatusCounts: { scored: number; unresolved: number; invalid: number };
  scoredRunRate: number;
  totalTokens: number;
  meanLatencyMs: number | null;
  triggerRuns: number;
  armCounts: Record<string, number>;
  deliveredRuns: number;
}

export interface V6CalibrationContrast {
  family: string;
  contrastBMinusT: number | null;
  contrastGMinusB: number | null;
}

const TERMINAL_KEYS = ["answered", "abstained", "invalid", "unavailable"] as const;
const GROUP_SEPARATOR = "|";

function terminalCountsOf(counts: Record<string, unknown> | undefined): {
  answered: number;
  abstained: number;
  invalid: number;
  unavailable: number;
} {
  const countsOrDefault = counts ?? {};
  return {
    answered: typeof countsOrDefault.answered === "number" ? countsOrDefault.answered : 0,
    abstained: typeof countsOrDefault.abstained === "number" ? countsOrDefault.abstained : 0,
    invalid: typeof countsOrDefault.invalid === "number" ? countsOrDefault.invalid : 0,
    unavailable: typeof countsOrDefault.unavailable === "number" ? countsOrDefault.unavailable : 0,
  };
}

/** Project one already verified schema-5 raw run into a calibration row. */
export function analyzeVerifiedV6Run(record: VerifiedV6CalibrationArtifactV1): V6CalibrationRunRow {
  if (!isVerifiedV6CalibrationArtifactV1(record)) {
    throw new Error("v6 calibration analysis accepts only artifacts produced by the verified loader");
  }
  const artifact = record.artifact as unknown as Record<string, unknown>;
  const family = (getPath(artifact, ["governanceStudy", "taskFamilyRef", "id"]) as string | undefined) ?? "unknown";
  const protocol = (getPath(artifact, ["primaryArmExecution", "implementationConfig", "protocol"]) as string | undefined) ?? "unknown";
  const assignedArm = (getPath(artifact, ["primaryArmExecution", "assignedArmRef", "id"]) as string | undefined) ?? null;
  const brier = getPath(artifact, ["operationalOutcome", "primaryMetric", "value"]) as number | null;
  const terminalCounts = terminalCountsOf(
    getPath(artifact, ["operationalOutcome", "claimOutcome", "terminalStatusCounts"]) as Record<string, unknown> | undefined,
  );
  const registered = TERMINAL_KEYS.reduce((sum, key) => sum + terminalCounts[key], 0);
  const answeredRate = registered > 0 ? terminalCounts.answered / registered : 0;
  const accuracy = getPath(artifact, ["taskOutcome", "quality"]) as number | null;
  const taskOutcomeStatus = getPath(artifact, ["taskOutcome", "status"]) as "scored" | "unresolved" | "invalid";
  const usage = getPath(artifact, ["tokenUsage"]) as { totalTokens?: number; totalLatencyMs?: number } | undefined;
  const trail = (getPath(artifact, ["governanceAuditTrail"]) ?? {}) as {
    eventAssignments?: Array<{ assignedArm?: string }>;
    actionTransitions?: Array<{ to?: string }>;
  };
  const governanceArms = arr(trail.eventAssignments)
    .map(event => get(event, "assignedArm") as string | undefined)
    .filter((arm): arm is string => typeof arm === "string");
  const delivered = arr(trail.actionTransitions).some(transition => get(transition, "to") === "compliance_observed");
  return {
    runId: String(get(artifact, "runId") ?? "?"),
    family,
    protocol,
    assignedArm,
    allocationMode: record.allocationMode,
    operationalBrier: typeof brier === "number" ? brier : null,
    answeredRate,
    terminalCounts,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    taskOutcomeStatus,
    totalTokens: usage!.totalTokens!,
    totalLatencyMs: usage!.totalLatencyMs!,
    governanceTriggered: governanceArms.length > 0,
    governanceArms,
    delivered,
  };
}

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Aggregate per-run rows into the frozen (family × protocol) table. */
export function aggregateV6CalibrationTable(rows: V6CalibrationRunRow[]): V6CalibrationArmAggregate[] {
  const grouped = new Map<string, V6CalibrationRunRow[]>();
  for (const row of rows) {
    const key = `${row.family}${GROUP_SEPARATOR}${row.protocol}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  const aggregates: V6CalibrationArmAggregate[] = [];
  for (const [key, bucket] of grouped) {
    const separatorIndex = key.indexOf(GROUP_SEPARATOR);
    const family = key.slice(0, separatorIndex);
    const protocol = key.slice(separatorIndex + 1);
    const allocationModes = [...new Set(bucket.map(row => row.allocationMode))];
    if (allocationModes.length !== 1) throw new Error(`v6 calibration group ${key} mixes allocation modes`);
    const briers = bucket.map(row => row.operationalBrier).filter((value): value is number => value !== null);
    const accuracies = bucket.map(row => row.accuracy).filter((value): value is number => value !== null);
    const latencies = bucket.map(row => row.totalLatencyMs).filter((value): value is number => value !== null);
    const terminalCounts = { answered: 0, abstained: 0, invalid: 0, unavailable: 0 };
    const taskOutcomeStatusCounts = { scored: 0, unresolved: 0, invalid: 0 };
    for (const row of bucket) {
      for (const key of TERMINAL_KEYS) terminalCounts[key] += row.terminalCounts[key];
      taskOutcomeStatusCounts[row.taskOutcomeStatus] += 1;
    }
    const registered = TERMINAL_KEYS.reduce((acc, key) => acc + terminalCounts[key], 0);
    const armCounts: Record<string, number> = {};
    for (const row of bucket) {
      for (const arm of row.governanceArms) armCounts[arm] = (armCounts[arm] ?? 0) + 1;
    }
    aggregates.push({
      family,
      protocol,
      allocationMode: allocationModes[0],
      runs: bucket.length,
      meanOperationalBrier: mean(briers),
      answeredRate: registered > 0 ? terminalCounts.answered / registered : 0,
      terminalCounts,
      meanAccuracy: mean(accuracies),
      taskOutcomeStatusCounts,
      scoredRunRate: taskOutcomeStatusCounts.scored / bucket.length,
      totalTokens: sum(bucket.map(row => row.totalTokens)),
      meanLatencyMs: mean(latencies),
      triggerRuns: bucket.filter(row => row.governanceTriggered).length,
      armCounts,
      deliveredRuns: bucket.filter(row => row.delivered).length,
    });
  }
  aggregates.sort((a, b) => `${a.family}:${a.protocol}`.localeCompare(`${b.family}:${b.protocol}`));
  return aggregates;
}

/** Primary-contrast projection: B−T and G−B per family (null when a side is absent). */
export function computeV6Contrasts(aggregates: V6CalibrationArmAggregate[]): V6CalibrationContrast[] {
  const byFamily = new Map<string, Map<string, number | null>>();
  for (const aggregate of aggregates) {
    const bucket = byFamily.get(aggregate.family) ?? new Map();
    bucket.set(aggregate.protocol, aggregate.meanOperationalBrier);
    byFamily.set(aggregate.family, bucket);
  }
  const contrasts: V6CalibrationContrast[] = [];
  for (const [family, bucket] of byFamily) {
    const b = bucket.get("explicit_belief_v1") ?? null;
    const t = bucket.get("text_communication_v1") ?? null;
    const g = bucket.get("epistemic_governance_v1") ?? null;
    contrasts.push({
      family,
      contrastBMinusT: b !== null && t !== null ? b - t : null,
      contrastGMinusB: g !== null && b !== null ? g - b : null,
    });
  }
  contrasts.sort((a, b) => a.family.localeCompare(b.family));
  return contrasts;
}

/** Deterministic text rendering of the frozen calibration table. */
export function formatV6CalibrationTable(aggregates: V6CalibrationArmAggregate[], contrasts: V6CalibrationContrast[]): string {
  const lines: string[] = [];
  lines.push("family | protocol | allocation | runs | opBrier | answeredRate | abst/inv/unav | accuracy(scored/runs) | tokens | latencyMs | trigger | arms | delivered");
  for (const row of aggregates) {
    const arms = Object.keys(row.armCounts).length > 0
      ? Object.entries(row.armCounts).map(([arm, count]) => `${arm}:${count}`).join(",")
      : "-";
    lines.push([
      row.family,
      row.protocol,
      row.allocationMode,
      String(row.runs),
      row.meanOperationalBrier?.toFixed(4) ?? "n/a",
      row.answeredRate.toFixed(3),
      `${row.terminalCounts.abstained}/${row.terminalCounts.invalid}/${row.terminalCounts.unavailable}`,
      `${row.meanAccuracy?.toFixed(3) ?? "n/a"}(${row.taskOutcomeStatusCounts.scored}/${row.runs})`,
      String(row.totalTokens),
      row.meanLatencyMs?.toFixed(0) ?? "n/a",
      `${row.triggerRuns}/${row.runs}`,
      arms,
      `${row.deliveredRuns}/${row.runs}`,
    ].join(" | "));
  }
  lines.push("-- descriptive calibration contrasts (primary Brier, lower is better): B−T / G−B --");
  for (const contrast of contrasts) {
    lines.push(`${contrast.family}: B−T=${contrast.contrastBMinusT?.toFixed(4) ?? "n/a"}, G−B=${contrast.contrastGMinusB?.toFixed(4) ?? "n/a"}`);
  }
  return lines.join("\n");
}

/** Verify every raw run under a directory before rendering the frozen table. */
export function analyzeV6CalibrationDir(dir: string, spec: V6CalibrationDatasetSpecV1): string {
  const verified = loadVerifiedV6CalibrationDatasetV1({ directories: [dir], spec });
  const rows = verified.map(analyzeVerifiedV6Run);
  const aggregates = aggregateV6CalibrationTable(rows);
  const contrasts = computeV6Contrasts(aggregates);
  return formatV6CalibrationTable(aggregates, contrasts);
}

function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return import.meta.url === new URL(`file://${argv1.replace(/\\/g, "/")}`).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  console.error("analyzeV6Calibration requires a programmatic frozen study/rule registry; bare directory analysis is forbidden");
  process.exitCode = 2;
}
