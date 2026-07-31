/**
 * jsonUtils.test.ts — safeJsonParse / stripCodeFences / extractNumber / extractString / extractArray 单元测试
 *
 * 项目硬约束要求"critical modules must use safeJsonParse"，但该函数本身此前无测试。
 * 本测试覆盖三级降级策略 + 辅助提取函数的边界 case。
 */

import { describe, it, expect } from "vitest";
import { safeJsonParse, stripCodeFences, extractNumber, extractString, extractArray } from "@/lib/utils/jsonUtils";

// ---- stripCodeFences -------------------------------------------------------

describe("stripCodeFences", () => {
  it("移除 ```json ... ``` 围栏", () => {
    const input = "```json\n{\"a\": 1}\n```";
    expect(stripCodeFences(input)).toBe("{\"a\": 1}");
  });

  it("移除无语言标记的 ``` ... ``` 围栏", () => {
    const input = "```\n{\"b\": 2}\n```";
    expect(stripCodeFences(input)).toBe("{\"b\": 2}");
  });

  it("无围栏时原样返回（trim 后）", () => {
    expect(stripCodeFences("  {\"c\": 3}  ")).toBe("{\"c\": 3}");
  });

  it("空字符串", () => {
    expect(stripCodeFences("")).toBe("");
  });
});

// ---- safeJsonParse ---------------------------------------------------------

describe("safeJsonParse", () => {
  // 策略 1：直接解析
  it("策略1：合法 JSON 直接解析", () => {
    const result = safeJsonParse<{ a: number }>(`{"a": 1}`);
    expect(result).toEqual({ a: 1 });
  });

  it("策略1：嵌套对象", () => {
    const result = safeJsonParse<{ outer: { inner: number } }>(`{"outer": {"inner": 42}}`);
    expect(result?.outer.inner).toBe(42);
  });

  it("策略1：含特殊字符的字符串值", () => {
    const result = safeJsonParse<{ msg: string }>(`{"msg": "hello \\"world\\" \\n tab\\t"}`);
    expect(result?.msg).toContain("hello");
  });

  // 策略 2：code fence 降级
  it("策略2：```json 围栏包裹的 JSON", () => {
    const result = safeJsonParse<{ x: number }>("```json\n{\"x\": 10}\n```");
    expect(result).toEqual({ x: 10 });
  });

  it("策略2：``` 围栏包裹的 JSON（无语言标记）", () => {
    const result = safeJsonParse<{ y: number }>("```\n{\"y\": 20}\n```");
    expect(result).toEqual({ y: 20 });
  });

  // 策略 3：正则提取
  it("策略3：混杂文本中提取 JSON", () => {
    const result = safeJsonParse<{ z: number }>("Here is the result: {\"z\": 30} done.");
    expect(result).toEqual({ z: 30 });
  });

  it("策略3：前缀文本 + code fence + JSON", () => {
    const result = safeJsonParse<{ w: number }>("Output:\n```json\n{\"w\": 40}\n```\nEnd");
    expect(result).toEqual({ w: 40 });
  });

  // 失败 case
  it("空字符串返回 null", () => {
    expect(safeJsonParse("")).toBeNull();
  });

  it("纯文本无 JSON 返回 null", () => {
    expect(safeJsonParse("hello world")).toBeNull();
  });

  it("不完整的 JSON 返回 null", () => {
    expect(safeJsonParse("{ broken")).toBeNull();
  });

  // Q4 修复：贪婪正则 bug 的回归测试
  it("多个 JSON 对象混杂时只提取第一个完整对象（非贪婪）", () => {
    // 旧贪婪正则 /\{[\s\S]*\}/ 会匹配 {"a":1}\n垃圾\n{"b":2}，导致 JSON.parse 失败
    // 新括号配平扫描遇到第一个配平的 } 即停止
    const input = 'First result: {"a": 1}\nSome garbage text\nSecond: {"b": 2}';
    const result = safeJsonParse<{ a: number }>(input);
    expect(result).toEqual({ a: 1 });
    // 泛型约束为 { a: number }，访问 .b 需显式断言以验证非贪婪提取不会泄漏第二对象的字段
    expect((result as Record<string, unknown> | null)?.b).toBeUndefined();
  });

  it("JSON 字符串内含花括号时不误判深度", () => {
    // 字符串内的 { } 不应影响括号配平
    const input = 'Here: {"msg": "hello {world} foo"}';
    const result = safeJsonParse<{ msg: string }>(input);
    expect(result?.msg).toBe("hello {world} foo");
  });

  it("嵌套对象正确配平", () => {
    const input = 'Output: {"outer": {"inner": {"deep": 42}}, "x": 1}';
    const result = safeJsonParse<{ outer: { inner: { deep: number } }; x: number }>(input);
    expect(result?.outer.inner.deep).toBe(42);
    expect(result?.x).toBe(1);
  });

  it("JSON 字符串内含转义引号", () => {
    const input = 'Result: {"msg": "say \\"hi\\""}';
    const result = safeJsonParse<{ msg: string }>(input);
    expect(result?.msg).toBe('say "hi"');
  });

  it("截断的 JSON（未配平）返回 null", () => {
    const input = 'Result: {"a": 1, "b": {"c": 2}';
    expect(safeJsonParse(input)).toBeNull();
  });

  // 泛型类型推断
  it("泛型类型参数不影响运行时解析", () => {
    const result = safeJsonParse<{ a: number; b: string }>(`{"a": 1, "b": "test"}`);
    expect(result?.a).toBe(1);
    expect(result?.b).toBe("test");
  });
});

// ---- extractNumber ---------------------------------------------------------

describe("extractNumber", () => {
  it("正常数值", () => {
    expect(extractNumber({ a: 42 }, "a", 0)).toBe(42);
  });

  it("字段不存在返回默认值", () => {
    expect(extractNumber({}, "a", 99)).toBe(99);
  });

  it("非数值类型返回默认值", () => {
    expect(extractNumber({ a: "string" }, "a", 0)).toBe(0);
  });

  it("NaN 返回默认值", () => {
    expect(extractNumber({ a: NaN }, "a", 5)).toBe(5);
  });

  it("clamp 到 min", () => {
    expect(extractNumber({ a: -5 }, "a", 0, 0, 10)).toBe(0);
  });

  it("clamp 到 max", () => {
    expect(extractNumber({ a: 15 }, "a", 0, 0, 10)).toBe(10);
  });

  it("负数无 clamp 边界", () => {
    expect(extractNumber({ a: -3.5 }, "a", 0)).toBe(-3.5);
  });
});

// ---- extractString ---------------------------------------------------------

describe("extractString", () => {
  it("正常字符串", () => {
    expect(extractString({ name: "Alice" }, "name", "default")).toBe("Alice");
  });

  it("字段不存在返回默认值", () => {
    expect(extractString({}, "name", "default")).toBe("default");
  });

  it("非字符串类型返回默认值", () => {
    expect(extractString({ name: 123 }, "name", "default")).toBe("default");
  });

  it("空字符串是合法值（不返回默认值）", () => {
    expect(extractString({ name: "" }, "name", "default")).toBe("");
  });
});

// ---- extractArray ----------------------------------------------------------

describe("extractArray", () => {
  it("正常数组", () => {
    expect(extractArray({ list: [1, 2, 3] }, "list")).toEqual([1, 2, 3]);
  });

  it("字段不存在返回空数组", () => {
    expect(extractArray({}, "list")).toEqual([]);
  });

  it("非数组类型返回默认值", () => {
    expect(extractArray({ list: "not array" }, "list")).toEqual([]);
  });

  it("自定义默认值", () => {
    expect(extractArray({}, "list", [42])).toEqual([42]);
  });

  it("泛型数组类型", () => {
    const result = extractArray<{ id: number }>({ items: [{ id: 1 }] }, "items");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});
