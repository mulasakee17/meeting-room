/**
 * 审计验证脚本（P1：第三方独立验证治理决策的正确性）
 *
 * 目的：
 *   让第三方（实验室评审）独立验证两件事：
 *   1. 文件完整性：实验数据自清单生成后未被篡改（SHA-256 比对）
 *   2. 治理决策一致性：detectionMetrics 中的数值依据是否支持 detected=true
 *      （即 detector 是否"言行一致"——声称检测到但数值未超阈值 = 异常）
 *
 * 适用范围：
 *   - 旧实验（pre-2026-07-23）：仅做文件完整性校验（无审计字段）
 *   - 新实验（post-2026-07-23，含 detectionMetrics/parameters/effectMetrics）：
 *     额外验证检测逻辑一致性
 *
 * 用法：
 *   npx tsx experiments/v2/verify_audit.ts
 *
 * 输出：
 *   - 控制台摘要
 *   - experiments/v2/audit_report.json（详细报告）
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 发现文件篡改或缺失
 *
 * 2026-07-23 新增：支持第三方独立验证治理决策的正确性
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
// 审计脚本阈值兜底：从 constants.ts 自动读取（2026-07-23 修复硬编码问题）
import {
  GOVERNANCE_ECHO_CHAMBER_THRESHOLD,
  GOVERNANCE_AUTHORITY_BIAS_THRESHOLD,
  GOVERNANCE_POLARIZATION_THRESHOLD,
  GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD,
} from "../../src/lib/constants";

interface ManifestEntry {
  filename: string;
  relativePath: string;
  size: number;
  sha256: string;
  hasGovernanceTrace: boolean;
  hasAuditFields: boolean;
}

interface Manifest {
  manifestVersion: string;
  generatedAt: string;
  totalFiles: number;
  files: ManifestEntry[];
}

interface AuditCheck {
  totalRounds: number;
  issuesWithDetectionMetrics: number;
  interventionsWithParameters: number;
  totalAppliedInterventions: number;
  roundsWithEffectMetrics: number;
  detectionLogicValid: number;
  detectionLogicInvalid: number;
  anomalies: string[];
}

interface FileResult {
  relativePath: string;
  fileIntegrity: "ok" | "mismatch" | "missing";
  auditChecks?: AuditCheck;
}

interface Report {
  reportVersion: "1.0";
  generatedAt: string;
  manifestGeneratedAt: string;
  summary: {
    totalFiles: number;
    integrityOk: number;
    integrityMismatch: number;
    missing: number;
    withAuditChecks: number;
    totalAnomalies: number;
  };
  results: FileResult[];
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * 重算检测逻辑：detectionMetrics 中的数值是否支持 detected=true
 *
 * 核心原则：如果 detector 声称 detected=true，但 detectionMetrics 中
 * 的关键数值并未超过阈值，说明决策与依据不一致（异常）。
 *
 * 阈值优先级（2026-07-23 修复硬编码问题）：
 * 1. detectionMetrics.threshold（实验运行时实际使用的阈值，最权威）
 * 2. constants.ts 中的默认常量（兜底，确保脚本与代码同步）
 *
 * 返回 true 表示逻辑一致（或无法验证），false 表示异常。
 */
function verifyDetectionLogic(issue: any): boolean {
  if (!issue.detectionMetrics) return true; // 旧实验无此字段，跳过
  const m = issue.detectionMetrics;
  switch (issue.type) {
    case "authority_bias": {
      // influenceRatio 应超过 threshold
      const threshold = m.threshold ?? GOVERNANCE_AUTHORITY_BIAS_THRESHOLD;
      if (m.influenceRatio === undefined) return true;
      return m.influenceRatio > threshold;
    }
    case "polarization": {
      const threshold = m.threshold ?? GOVERNANCE_POLARIZATION_THRESHOLD;
      if (m.polarizationIndex === undefined) return true;
      return m.polarizationIndex > threshold;
    }
    case "echo_chamber": {
      const threshold = m.threshold ?? GOVERNANCE_ECHO_CHAMBER_THRESHOLD;
      if (m.infoRedundancyScore === undefined) return true;
      return m.infoRedundancyScore > threshold;
    }
    case "premature_consensus": {
      const threshold = m.threshold ?? GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD;
      if (m.consensusLevel === undefined) return true;
      return m.consensusLevel > threshold;
    }
    default:
      return true; // 未知检测器类型，跳过
  }
}

function verifyAuditFields(filePath: string): AuditCheck {
  const result: AuditCheck = {
    totalRounds: 0,
    issuesWithDetectionMetrics: 0,
    interventionsWithParameters: 0,
    totalAppliedInterventions: 0,
    roundsWithEffectMetrics: 0,
    detectionLogicValid: 0,
    detectionLogicInvalid: 0,
    anomalies: [],
  };

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    result.anomalies.push("JSON parse error");
    return result;
  }

  const trace: any[] = data.governanceTrace || [];
  result.totalRounds = trace.length;

  for (const round of trace) {
    if (round.effectMetrics) result.roundsWithEffectMetrics++;

    for (const issue of round.governanceIssues || []) {
      if (issue.detectionMetrics) {
        result.issuesWithDetectionMetrics++;
        if (verifyDetectionLogic(issue)) {
          result.detectionLogicValid++;
        } else {
          result.detectionLogicInvalid++;
          result.anomalies.push(
            `round ${round.roundNumber}: ${issue.type} detected=true 但 detectionMetrics 数值未超阈值`
          );
        }
      }
    }

    for (const iv of round.interventions || []) {
      if (iv.applied) {
        result.totalAppliedInterventions++;
        if (iv.parameters) result.interventionsWithParameters++;
        // 应用型干预应有 effect 描述
        if (!iv.effect) {
          result.anomalies.push(
            `round ${round.roundNumber}: ${iv.type} applied=true 但缺少 effect 描述`
          );
        }
      }
    }
  }

  return result;
}

function main(): void {
  const manifestPath = path.join(__dirname, "audit_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("✗ Manifest 未找到。请先运行：npx tsx experiments/v2/generate_manifest.ts");
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`清单生成时间: ${manifest.generatedAt}`);
  console.log(`清单文件总数: ${manifest.totalFiles}`);
  console.log("");

  const results: FileResult[] = [];
  let okCount = 0, mismatchCount = 0, missingCount = 0;
  let withAuditChecks = 0, totalAnomalies = 0;

  for (const entry of manifest.files) {
    const fullPath = path.join(__dirname, entry.relativePath);
    const fileResult: FileResult = {
      relativePath: entry.relativePath,
      fileIntegrity: "ok",
    };

    if (!fs.existsSync(fullPath)) {
      fileResult.fileIntegrity = "missing";
      results.push(fileResult);
      missingCount++;
      continue;
    }

    const buf = fs.readFileSync(fullPath);
    const currentSha = sha256Buffer(buf);
    if (currentSha !== entry.sha256) {
      fileResult.fileIntegrity = "mismatch";
      results.push(fileResult);
      mismatchCount++;
      continue;
    }

    okCount++;

    // 仅对含审计字段的新实验做深度验证
    if (entry.hasAuditFields) {
      fileResult.auditChecks = verifyAuditFields(fullPath);
      withAuditChecks++;
      totalAnomalies += fileResult.auditChecks.anomalies.length;
    }

    results.push(fileResult);
  }

  const report: Report = {
    reportVersion: "1.0",
    generatedAt: new Date().toISOString(),
    manifestGeneratedAt: manifest.generatedAt,
    summary: {
      totalFiles: results.length,
      integrityOk: okCount,
      integrityMismatch: mismatchCount,
      missing: missingCount,
      withAuditChecks,
      totalAnomalies,
    },
    results,
  };

  const reportPath = path.join(__dirname, "audit_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("=== 文件完整性 ===");
  console.log(`  OK:        ${okCount}/${results.length}`);
  console.log(`  Mismatch:  ${mismatchCount}`);
  console.log(`  Missing:   ${missingCount}`);
  console.log("");
  console.log("=== 审计字段验证（仅新实验）===");
  console.log(`  含审计字段的实验: ${withAuditChecks}`);
  console.log(`  检测逻辑异常:     ${totalAnomalies}`);
  console.log("");
  console.log(`详细报告: ${reportPath}`);

  if (mismatchCount > 0 || missingCount > 0) {
    console.error("\n✗ 发现文件完整性问题");
    process.exit(1);
  }
  if (totalAnomalies > 0) {
    console.warn(`\n⚠ 发现 ${totalAnomalies} 处审计逻辑异常（详见报告）`);
  } else {
    console.log("\n✓ 全部通过");
  }
}

main();
