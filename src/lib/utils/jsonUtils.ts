/**
 * jsonUtils — 统一 JSON 解析工具
 *
 * 消除 observation/index.ts、llm/providers.ts、discussion/index.ts、pipeline.ts
 * 四处分散的 JSON 容错解析逻辑。
 */

/**
 * 移除 markdown 代码块标记（```json ... ``` 或 ``` ... ```）
 */
export function stripCodeFences(text: string): string {
  let cleaned = text.trim();

  // 移除开头的 ```json 或 ```
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");

  // 移除结尾的 ```
  cleaned = cleaned.replace(/\n?```\s*$/i, "");

  return cleaned.trim();
}

/**
 * 从 LLM 输出文本中提取 JSON 对象。
 *
 * 策略：
 * 1. 先尝试直接 JSON.parse
 * 2. 移除 code fences 后再尝试
 * 3. 用括号配平扫描提取第一个完整 {...} 块
 *    （非贪婪：遇到第一个配平的 } 即停止，避免贪婪正则过度匹配）
 *
 * @returns 解析后的对象，或 null（解析失败）
 */
export function safeJsonParse<T = Record<string, unknown>>(text: string): T | null {
  // Strategy 1: direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  // Strategy 2: strip code fences
  const cleaned = stripCodeFences(text);
  if (cleaned !== text) {
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // continue
    }
  }

  // Strategy 3: 括号配平扫描（替代贪婪正则 /\{[\s\S]*\}/）
  // 旧正则会从第一个 { 匹配到最后一个 }，导致多个 JSON 对象混杂时过度匹配。
  // 新实现从第一个 { 开始，跟踪字符串嵌套和花括号深度，遇到配平的 } 即返回。
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace !== -1) {
    const extracted = extractBalancedBraces(cleaned, firstBrace);
    if (extracted) {
      try {
        return JSON.parse(extracted) as T;
      } catch {
        // give up
      }
    }
  }

  return null;
}

/**
 * 从文本的指定位置开始，用括号配平扫描提取一个完整的 JSON 对象。
 * 正确处理字符串内的花括号和转义字符。
 *
 * @param text 原始文本
 * @param start 第一个 { 的位置
 * @returns 提取的 JSON 字符串（含外层花括号），或 null（未配平）
 */
function extractBalancedBraces(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // 未配平（截断的 JSON）
}

/**
 * 从解析后的对象中安全提取数值字段，带 clamp 和默认值。
 */
export function extractNumber(
  obj: Record<string, unknown>,
  field: string,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const val = obj[field];
  if (typeof val !== "number" || isNaN(val)) return defaultValue;
  let result = val;
  if (typeof min === "number") result = Math.max(min, result);
  if (typeof max === "number") result = Math.min(max, result);
  return result;
}

/**
 * 从解析后的对象中安全提取字符串字段，带默认值。
 */
export function extractString(
  obj: Record<string, unknown>,
  field: string,
  defaultValue: string
): string {
  const val = obj[field];
  return typeof val === "string" ? val : defaultValue;
}

/**
 * 从解析后的对象中安全提取数组字段，带默认值。
 */
export function extractArray<T = unknown>(
  obj: Record<string, unknown>,
  field: string,
  defaultValue: T[] = []
): T[] {
  const val = obj[field];
  return Array.isArray(val) ? val as T[] : defaultValue;
}
