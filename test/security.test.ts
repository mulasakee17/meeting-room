/**
 * 安全模块测试 — rateLimit + validation
 */
import { describe, it, expect, beforeEach } from "vitest";

describe("Rate Limiter", () => {
  let checkRateLimit: any, clearRateLimit: any, RATE_LIMIT_PRESETS: any;

  beforeEach(async () => {
    const mod = await import("@/lib/security/rateLimit");
    checkRateLimit = mod.checkRateLimit;
    clearRateLimit = mod.clearRateLimit;
    RATE_LIMIT_PRESETS = mod.RATE_LIMIT_PRESETS;
  });

  it("首次请求应允许", () => {
    const key = "test-client-" + Date.now();
    const result = checkRateLimit(key, RATE_LIMIT_PRESETS.strict);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // strict = 5 max, 1 used
  });

  it("超过限制应拒绝", () => {
    const key = "test-client-" + Date.now();
    // strict = 5 requests per 60s
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, RATE_LIMIT_PRESETS.strict);
    }
    const result = checkRateLimit(key, RATE_LIMIT_PRESETS.strict);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("不同 client 不共享限制", () => {
    const key1 = "client-a-" + Date.now();
    const key2 = "client-b-" + Date.now();
    for (let i = 0; i < 5; i++) checkRateLimit(key1, RATE_LIMIT_PRESETS.strict);
    const result = checkRateLimit(key2, RATE_LIMIT_PRESETS.strict);
    expect(result.allowed).toBe(true);
  });

  it("clearRateLimit 应重置计数", () => {
    const key = "test-clear-" + Date.now();
    for (let i = 0; i < 5; i++) checkRateLimit(key, RATE_LIMIT_PRESETS.strict);
    clearRateLimit(key);
    const result = checkRateLimit(key, RATE_LIMIT_PRESETS.strict);
    expect(result.allowed).toBe(true);
  });

  it("预设应有合理的值", () => {
    expect(RATE_LIMIT_PRESETS.strict.maxRequests).toBe(5);
    expect(RATE_LIMIT_PRESETS.standard.maxRequests).toBe(10);
    expect(RATE_LIMIT_PRESETS.relaxed.maxRequests).toBe(30);
  });
});

describe("Validation", () => {
  let sanitizeString: any, validateSwarmRequest: any;

  beforeEach(async () => {
    const mod = await import("@/lib/security/validation");
    sanitizeString = mod.sanitizeString;
    validateSwarmRequest = mod.validateSwarmRequest;
  });

  it("sanitizeString 应移除 XSS 模式", () => {
    const result = sanitizeString('<script>alert("xss")</script>hello');
    expect(result).not.toContain("<script>");
    expect(result).toContain("hello");
  });

  it("sanitizeString 应移除危险模式", () => {
    // Script tag removal (most reliable pattern)
    const result = sanitizeString('<script>alert(1)</script>normal text');
    expect(result).not.toContain('script');
    expect(result).toContain('normal text');
  });

  it("sanitizeString 应移除命令注入模式", () => {
    const result = sanitizeString("| ls -la | cat /etc/passwd");
    expect(result).not.toContain("ls");
  });

  it("sanitizeString 应保留正常文本", () => {
    const input = "这是正常的分析文本，讨论AI在医疗领域的应用。";
    const result = sanitizeString(input);
    expect(result).toContain("AI");
    expect(result).toContain("医疗");
  });

  it("sanitizeString 应移除路径遍历", () => {
    const result = sanitizeString("../../etc/passwd");
    expect(result).not.toContain("../");
  });

  it("validateSwarmRequest 应拒绝空输入", () => {
    const result = validateSwarmRequest({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateSwarmRequest 应接受合法输入", () => {
    const result = validateSwarmRequest({
      news: "AI technology advances rapidly in healthcare applications",
      rounds: 5,
    });
    expect(result.valid).toBe(true);
  });

  it("validateSwarmRequest 应拒绝过长输入", () => {
    const result = validateSwarmRequest({
      news: "x".repeat(20000),
    });
    expect(result.valid).toBe(false);
  });
});
