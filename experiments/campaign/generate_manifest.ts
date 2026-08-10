/**
 * Campaign 审计清单生成器 — 为实验数据提供 SHA-256 + codeVersion 审计轨迹
 *
 * 目的：
 *   为 experiments/campaign/output/ 下所有原始实验 JSON 文件生成 SHA-256 哈希清单，
 *   支持第三方独立验证实验数据自生成后未被篡改。对应 Top 10 Issue #3。
 *
 * Append-only 语义（与 v2/generate_manifest.ts 一致）：
 *   - 实验数据文件一旦写入本清单后，不应再原地修改
 *   - 如需重跑/修复，应新增文件（用 codeVersion 或后缀区分）
 *   - 清单本身可重新生成（新增文件后会包含新条目），但已存在的实验文件
 *     的 sha256 应保持不变——任何变化都意味着数据被篡改
 *   - 清单的 git 提交历史构成 append-only 审计轨迹
 *
 * 用法：
 *   npx tsx experiments/campaign/generate_manifest.ts
 *
 * 输出：
 *   experiments/campaign/output/audit_manifest.json
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
// 与 CLI 复用同一纯 run-level verifier 与状态派生（无 main、无副作用），
// 禁止较弱的重复实现。
import { verifyRawRunData, deriveReplayStatus } from "./replayVerifier";

// 排除文件（派生统计/聚合文件，非原始实验结果）
const EXCLUDE_FILES = new Set([
  "audit_manifest.json",      // 避免自引用
  "campaign_summary.json",    // 全局汇总
  "raw_summary.json",         // 单实验汇总
  "metrics.json",             // 指标计算结果
  "metrics_phase31_baseline.json",
  "tests.json",               // 统计检验结果
]);

interface ManifestEntry {
  filename: string;
  relativePath: string;
  size: number;
  sha256: string;
  // 从 RawRunData 提取的元数据
  runId?: string;
  experimentId?: string;
  runtimeMode?: string;
  seed?: number;
  runIndex?: number;
  timestamp?: string;
  scenario?: string;
  agentCount?: number;
  totalRounds?: number;
  converged?: boolean;
  finalKendallTau?: number;
  hasCognitiveTrajectory: boolean;
  hasThermoHistory: boolean;
  hasInterventions: boolean;
  totalInterventions: number;
  totalAppliedInterventions: number;
  hasGovernanceIssues: boolean;
  totalGovernanceIssues: number;
  // 重放审计元数据（additive；由纯重放库计算）
  rawSchemaVersion?: string;
  governanceEstimateCount: number;
  governanceReplayStatus: "verified" | "mixed" | "legacy_unverifiable" | "absent";
}

interface Manifest {
  manifestVersion: "1.0";
  generatedAt: string;
  generatorScript: "generate_manifest.ts";
  codeVersion: string;  // git commit hash
  totalFiles: number;
  totalSizeBytes: number;
  files: ManifestEntry[];
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function getGitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * 从 RawRunData JSON 中提取审计相关元数据。
 *
 * 重放状态复用 CLI 的 run-level verifier（verifyRawRunData），与 CLI 的
 * 判定保持一致；绝不把 unsupported/mismatch/run-issue 标为 verified——
 * 任一硬失败即 "mixed"。
 */
function extractMetadata(filePath: string): Partial<ManifestEntry> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = safeJsonParse<any>(raw);
    if (!data) { console.warn(`[generate_manifest] 无法解析 JSON: ${filePath}`); return {}; }
    const interventions: any[] = data.interventions || [];
    const governanceIssues: any[] = data.governanceIssues || [];
    const runResult = verifyRawRunData(filePath, data);
    return {
      runId: data.runId,
      experimentId: data.experimentId,
      runtimeMode: data.runtimeMode,
      seed: data.seed,
      runIndex: data.runIndex,
      timestamp: data.timestamp,
      scenario: data.scenario,
      agentCount: data.agentCount,
      totalRounds: data.totalRounds,
      converged: data.converged,
      finalKendallTau: data.finalKendallTau,
      hasCognitiveTrajectory: Array.isArray(data.cognitiveTrajectory) && data.cognitiveTrajectory.length > 0,
      hasThermoHistory: Array.isArray(data.thermoHistory) && data.thermoHistory.length > 0,
      hasInterventions: interventions.length > 0,
      totalInterventions: interventions.length,
      totalAppliedInterventions: interventions.filter(i => i.applied).length,
      hasGovernanceIssues: governanceIssues.length > 0,
      totalGovernanceIssues: governanceIssues.length,
      rawSchemaVersion: data.rawSchemaVersion,
      governanceEstimateCount: runResult.recordCount,
      governanceReplayStatus: deriveReplayStatus(runResult),
    };
  } catch {
    return {};
  }
}

/** 递归收集 output/ 下所有 .json 文件（排除派生文件） */
function collectJsonFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort();
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")
                 && !entry.name.endsWith(".assignment.json")
                 && !entry.name.endsWith(".error.json")
                 && !EXCLUDE_FILES.has(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

function main(): void {
  const outputDir = path.resolve(__dirname, "output");

  if (!fs.existsSync(outputDir)) {
    console.error(`✗ Output directory not found: ${outputDir}`);
    process.exit(1);
  }

  const files: ManifestEntry[] = [];
  let totalSize = 0;

  const jsonFiles = collectJsonFiles(outputDir);

  for (const fullPath of jsonFiles) {
    const stat = fs.statSync(fullPath);
    const buf = fs.readFileSync(fullPath);
    const meta = extractMetadata(fullPath);
    files.push({
      filename: path.basename(fullPath),
      relativePath: path.relative(outputDir, fullPath).replace(/\\/g, "/"),
      size: stat.size,
      sha256: sha256Buffer(buf),
      ...meta,
      hasCognitiveTrajectory: meta.hasCognitiveTrajectory ?? false,
      hasThermoHistory: meta.hasThermoHistory ?? false,
      hasInterventions: meta.hasInterventions ?? false,
      totalInterventions: meta.totalInterventions ?? 0,
      totalAppliedInterventions: meta.totalAppliedInterventions ?? 0,
      hasGovernanceIssues: meta.hasGovernanceIssues ?? false,
      totalGovernanceIssues: meta.totalGovernanceIssues ?? 0,
      governanceEstimateCount: meta.governanceEstimateCount ?? 0,
      governanceReplayStatus: meta.governanceReplayStatus ?? "absent",
    });
    totalSize += stat.size;
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const manifest: Manifest = {
    manifestVersion: "1.0",
    generatedAt: new Date().toISOString(),
    generatorScript: "generate_manifest.ts",
    codeVersion: getGitCommit(),
    totalFiles: files.length,
    totalSizeBytes: totalSize,
    files,
  };

  const outPath = path.join(outputDir, "audit_manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // 汇总统计
  const byExperiment = new Map<string, number>();
  const byMode = new Map<string, number>();
  for (const f of files) {
    const exp = f.experimentId ?? "unknown";
    const mode = f.runtimeMode ?? "unknown";
    byExperiment.set(exp, (byExperiment.get(exp) ?? 0) + 1);
    byMode.set(mode, (byMode.get(mode) ?? 0) + 1);
  }

  const withCognitive = files.filter(f => f.hasCognitiveTrajectory).length;
  const withThermo = files.filter(f => f.hasThermoHistory).length;
  const withInterventions = files.filter(f => f.hasInterventions).length;
  const totalApplied = files.reduce((s, f) => s + f.totalAppliedInterventions, 0);

  console.log(`✓ Manifest generated: ${outPath}`);
  console.log(`  Code version (git HEAD): ${manifest.codeVersion.slice(0, 12)}`);
  console.log(`  Files indexed:           ${files.length}`);
  console.log(`  Total size:              ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`  By experiment:`);
  for (const [exp, count] of [...byExperiment.entries()].sort()) {
    console.log(`    ${exp}: ${count}`);
  }
  console.log(`  By runtime mode:`);
  for (const [mode, count] of [...byMode.entries()].sort()) {
    console.log(`    ${mode}: ${count}`);
  }
  console.log(`  With cognitiveTrajectory: ${withCognitive}`);
  console.log(`  With thermoHistory:       ${withThermo}`);
  console.log(`  With interventions:        ${withInterventions} (total applied: ${totalApplied})`);
}

main();
