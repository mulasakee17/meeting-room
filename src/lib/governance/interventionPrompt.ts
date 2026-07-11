/**
 * interventionPrompt — 统一干预 prompt 格式化
 *
 * 消除 4 个干预策略文件 + PromptInjector.ts 中重复的 prompt 模板。
 */

const HEADER = "\n\n═══ GOVERNANCE INTERVENTION ═══";
const FOOTER = "═ END GOVERNANCE INTERVENTION ══";

/**
 * 格式化干预 prompt。
 *
 * @param body — prompt 正文（不含 header/footer）
 * @returns 带统一 header/footer 的完整 prompt
 */
export function formatInterventionPrompt(body: string): string {
  return `${HEADER}\n${body}\n${FOOTER}`;
}
