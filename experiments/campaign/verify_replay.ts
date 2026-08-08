/**
 * verify_replay — 治理估计记录精确重放验证 CLI
 *
 * 对单个 raw JSON 文件或目录递归扫描，逐条重放 `governanceEstimateHistory`
 * 记录：用存储的精确 input/config 调用对应版本的估算器，比较指纹、输出与
 * 确定性元数据，报告 verified / mismatch / legacy-unverifiable /
 * unsupported / invalid 五类状态及 run-level 问题。
 *
 * 用法：
 *   npm run verify:replay -- <raw-file-or-directory> [--allow-legacy-unverifiable]
 *
 * 退出码：
 *   0  —— 所有发现记录均 verified（或允许 legacy-unverifiable 且无其他失败）
 *   非 0 —— 存在 mismatch / unsupported / invalid / run issue，或零记录（absent），
 *           或存在 legacy 且未允许
 *
 * 该脚本不修改任何 raw 文件。文件遍历与报告聚合均导出为函数，测试无需
 * 生成子进程即可复用。记录级 replay 在 epistemic core（replay.ts），
 * run 级验证逻辑在纯模块 `./replayVerifier.ts`，CLI 仅做文件适配与退出码决策。
 *
 * --allow-absent：零记录时放行 exit 0 的严格开关（需至少一个候选文件且无
 *   hard failure）；不影响 legacy（只由 --allow-legacy-unverifiable 控制）。
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "node:url";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import {
  verifyRawRunData,
  aggregateReplayResults,
  EMPTY_COUNTS,
  type ReplayFileResult,
  type ReplaySummary,
} from "./replayVerifier";

/**
 * 派生文件（非原始实验结果），遍历时忽略。
 * 与 generate_manifest.ts 的 EXCLUDE_FILES 保持一致；两处为独立常量，
 * 因两个脚本均可被 tsx 直接运行，不能互相导入（会触发顶层副作用）。
 */
export const EXCLUDE_FILES = new Set([
  "audit_manifest.json",
  "campaign_summary.json",
  "raw_summary.json",
  "metrics.json",
  "metrics_phase31_baseline.json",
  "tests.json",
]);

/** 按 code-point 顺序比较（非 locale 敏感），保证跨平台确定性。 */
function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 递归收集目录下（或单个文件）的候选 raw JSON 路径。
 * 忽略派生文件、.error.json，并按 code-point 顺序排序。
 */
export function collectJsonFiles(rootOrFile: string): string[] {
  const stat = fs.statSync(rootOrFile);
  if (stat.isFile()) {
    if (!rootOrFile.endsWith(".json")
      || rootOrFile.endsWith(".error.json")
      || EXCLUDE_FILES.has(path.basename(rootOrFile))) {
      return [];
    }
    return [rootOrFile];
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a file or directory: ${rootOrFile}`);
  }

  const results: string[] = [];
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => compareCodePoint(a.name, b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()
        && entry.name.endsWith(".json")
        && !entry.name.endsWith(".error.json")
        && !EXCLUDE_FILES.has(entry.name)) {
        results.push(fullPath);
      }
    }
  };
  walk(rootOrFile);
  results.sort(compareCodePoint);
  return results;
}

/**
 * 打印汇总，返回是否应 exit 0。
 *
 * `--allow-absent` 严格语义：仅当至少扫描到一个候选文件、totalRecords === 0、
 * 且无任何 hard failure（invalid_json / unreadable_file / verifier_error /
 * mismatch / unsupported / invalid / run issue）时放行 exit 0。零文件、路径
 * 不可读、invalid JSON 等任何 hard failure 一律失败。`--allow-absent` 不
 * 放行 legacy（legacy 记录使 recordCount > 0，不属于 absent）。
 */
export function printReplaySummary(
  summary: ReplaySummary,
  allowLegacyUnverifiable: boolean,
  allowAbsent: boolean,
): boolean {
  const t = summary.totals;
  console.log(`Files scanned:  ${summary.totalFiles}`);
  console.log(`Records found:  ${summary.totalRecords}`);
  console.log(`  verified:            ${t.verified}`);
  console.log(`  mismatch:            ${t.mismatch}`);
  console.log(`  legacy_unverifiable: ${t.legacy_unverifiable}`);
  console.log(`  unsupported_estimator: ${t.unsupported_estimator}`);
  console.log(`  invalid_record:      ${t.invalid_record}`);
  console.log(`  run issues:          ${summary.totalRunIssues}`);

  for (const file of summary.files) {
    for (const issue of file.runIssues) {
      console.log(
        `  ⚠ ${file.file} round=${issue.round} agent=${issue.agentId}: ${issue.code} — ${issue.message}`,
      );
    }
    for (const diag of file.diagnostics) {
      const detail = diag.mismatches.length > 0 ? ` [${diag.mismatches.join(", ")}]` : "";
      const message = diag.message ? ` — ${diag.message}` : "";
      console.log(
        `  ✗ ${file.file} round=${diag.round} agent=${diag.agentId}: ${diag.status}${detail}${message}`,
      );
    }
  }

  // Absent: no governance estimate records discovered anywhere. Fail closed by
  // default. `--allow-absent` permits exit 0 only when at least one candidate
  // file was scanned, zero records exist, and no hard failure was observed.
  if (summary.totalRecords === 0) {
    if (allowAbsent && summary.totalFiles > 0 && summary.totalRunIssues === 0) {
      console.log("No governance estimate records found; accepted by --allow-absent.");
      return true;
    }
    console.log("✗ No governance estimate records found (absent).");
    return false;
  }

  const hardFailures = t.mismatch + t.unsupported_estimator + t.invalid_record + summary.totalRunIssues;
  if (hardFailures > 0) {
    console.log(`✗ Replay verification failed: ${hardFailures} hard failure(s) (records + run issues).`);
    return false;
  }
  if (t.legacy_unverifiable > 0 && !allowLegacyUnverifiable) {
    console.log(
      `✗ ${t.legacy_unverifiable} legacy-unverifiable record(s) present; ` +
      `pass --allow-legacy-unverifiable to permit exit 0.`,
    );
    return false;
  }
  console.log("✓ All governance estimate records verified.");
  return true;
}

function parseArgs(argv: string[]): {
  target?: string;
  allowLegacyUnverifiable: boolean;
  allowAbsent: boolean;
} {
  let target: string | undefined;
  let allowLegacyUnverifiable = false;
  let allowAbsent = false;
  for (const arg of argv) {
    if (arg === "--allow-legacy-unverifiable") {
      allowLegacyUnverifiable = true;
    } else if (arg === "--allow-absent") {
      allowAbsent = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (target === undefined) {
      target = arg;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }
  return { target, allowLegacyUnverifiable, allowAbsent };
}

function main(): void {
  let args: { target?: string; allowLegacyUnverifiable: boolean; allowAbsent: boolean };
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    console.error("Usage: verify_replay <raw-file-or-directory> [--allow-legacy-unverifiable] [--allow-absent]");
    process.exit(2);
  }
  if (!args.target) {
    console.error("✗ Missing raw file or directory argument.");
    console.error("Usage: verify_replay <raw-file-or-directory> [--allow-legacy-unverifiable] [--allow-absent]");
    process.exit(2);
  }

  let files: string[];
  try {
    files = collectJsonFiles(args.target);
  } catch (err) {
    console.error(`✗ Cannot read path: ${args.target}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const results: ReplayFileResult[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (err) {
      results.push({
        file,
        recordCount: 0,
        counts: { ...EMPTY_COUNTS },
        runIssues: [{
          round: -1,
          agentId: "(file)",
          code: "unreadable_file",
          message: `unreadable file: ${err instanceof Error ? err.message : String(err)}`,
        }],
        diagnostics: [],
      });
      continue;
    }
    const data = safeJsonParse<unknown>(content);
    if (data === null) {
      results.push({
        file,
        recordCount: 0,
        counts: { ...EMPTY_COUNTS },
        runIssues: [{
          round: -1,
          agentId: "(file)",
          code: "invalid_json",
          message: "file is not parseable JSON",
        }],
        diagnostics: [],
      });
      continue;
    }
    results.push(verifyRawRunData(file, data));
  }

  const summary = aggregateReplayResults(results);
  const success = printReplaySummary(summary, args.allowLegacyUnverifiable, args.allowAbsent);
  process.exit(success ? 0 : 1);
}

/**
 * 判断当前文件是否为 CLI 直接入口。
 * 使测试可直接导入本模块的导出函数而不会触发 process.exit。
 */
function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
