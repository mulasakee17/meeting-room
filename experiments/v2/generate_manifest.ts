/**
 * 审计清单生成器（P1：SHA-256 + append-only manifest）
 *
 * 目的：
 *   为实验数据目录下所有 JSON 文件生成 SHA-256 哈希清单，支持第三方
 *   独立验证实验数据自生成后未被篡改。
 *
 * Append-only 语义：
 *   - 实验数据文件一旦写入本清单后，**不应再原地修改**
 *   - 如需重跑/修复，应新增文件（用 codeVersion 或后缀区分）
 *   - 清单本身可重新生成（新增文件后会包含新条目），但已存在的实验文件
 *     的 sha256 应保持不变——任何变化都意味着数据被篡改
 *   - 清单的 git 提交历史构成 append-only 审计轨迹
 *
 * 用法：
 *   npx tsx experiments/v2/generate_manifest.ts
 *
 * 输出：
 *   experiments/v2/audit_manifest.json
 *
 * 2026-07-23 新增：支持第三方独立验证治理决策的正确性
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// 排除目录（备份/已知坏数据）
const EXCLUDE_DIRS = new Set([
  "data_fraud_malicious_backup_v1", // 备份目录
]);

// 排除文件（聚合统计，非原始实验结果）
const EXCLUDE_FILES = new Set([
  "summary.json",
  "enhanced_evaluation_results.json",
]);

interface ManifestEntry {
  filename: string;
  relativePath: string;
  size: number;
  sha256: string;
  runId?: string;
  group?: string;
  speakMode?: string;
  codeVersion?: string;
  timestamp?: string;
  hasGovernanceTrace: boolean;
  governanceTraceRounds: number;
  totalIssues: number;
  totalAppliedInterventions: number;
  /** 是否含 P0 审计字段（detectionMetrics/parameters/effectMetrics） */
  hasAuditFields: boolean;
}

interface Manifest {
  manifestVersion: "1.0";
  generatedAt: string;
  generatorScript: "generate_manifest.ts";
  totalFiles: number;
  totalSizeBytes: number;
  files: ManifestEntry[];
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** 从实验 JSON 中提取审计相关元数据 */
function extractMetadata(filePath: string): Partial<ManifestEntry> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    const trace: any[] = data.governanceTrace || [];
    const hasAuditFields = trace.some(r =>
      (r.governanceIssues || []).some((i: any) => i.detectionMetrics)
      || (r.interventions || []).some((i: any) => i.parameters)
      || r.effectMetrics
    );
    return {
      runId: data.runId,
      group: data.group,
      speakMode: data.speakMode,
      codeVersion: data.codeVersion,
      timestamp: data.timestamp,
      hasGovernanceTrace: trace.length > 0,
      governanceTraceRounds: trace.length,
      totalIssues: trace.reduce((s, r) => s + (r.governanceIssues || []).length, 0),
      totalAppliedInterventions: trace.reduce(
        (s, r) => s + (r.interventions || []).filter((i: any) => i.applied).length,
        0
      ),
      hasAuditFields,
    };
  } catch {
    return {};
  }
}

function main(): void {
  const rootDir = __dirname;
  const dataDirs = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith("data"))
    .map(d => d.name)
    .filter(name => !EXCLUDE_DIRS.has(name))
    .sort();

  const files: ManifestEntry[] = [];
  let totalSize = 0;

  for (const dir of dataDirs) {
    const dirPath = path.join(rootDir, dir);
    const entries = fs.readdirSync(dirPath).sort();
    for (const f of entries) {
      if (!f.endsWith(".json")) continue;
      if (EXCLUDE_FILES.has(f)) continue;
      const fullPath = path.join(dirPath, f);
      const stat = fs.statSync(fullPath);
      const buf = fs.readFileSync(fullPath);
      const meta = extractMetadata(fullPath);
      files.push({
        filename: f,
        relativePath: path.relative(rootDir, fullPath).replace(/\\/g, "/"),
        size: stat.size,
        sha256: sha256Buffer(buf),
        ...meta,
      });
      totalSize += stat.size;
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const manifest: Manifest = {
    manifestVersion: "1.0",
    generatedAt: new Date().toISOString(),
    generatorScript: "generate_manifest.ts",
    totalFiles: files.length,
    totalSizeBytes: totalSize,
    files,
  };

  const outPath = path.join(rootDir, "audit_manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const withTrace = files.filter(f => f.hasGovernanceTrace).length;
  const withAudit = files.filter(f => f.hasAuditFields).length;
  const totalInterventions = files.reduce((s, f) => s + f.totalAppliedInterventions, 0);

  console.log(`✓ Manifest generated: ${outPath}`);
  console.log(`  Data dirs scanned:  ${dataDirs.length}`);
  console.log(`  Files indexed:      ${files.length}`);
  console.log(`  Total size:         ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`  With governanceTrace: ${withTrace}`);
  console.log(`  With P0 audit fields (post-2026-07-23): ${withAudit}`);
  console.log(`  Total applied interventions: ${totalInterventions}`);
}

main();
