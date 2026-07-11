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
 * 3. 用正则提取第一个 {...} 块
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

  // Strategy 3: extract first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      // give up
    }
  }

  return null;
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
