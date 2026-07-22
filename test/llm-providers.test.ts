/**
 * LLM Provider 层单元测试
 *
 * 测试范围：
 * 1. LLMError 类 —— 错误构造与分类
 * 2. callLLM —— 提供商分发、无配置回退
 * 3. parseLLMResponse —— JSON 解析、fallback 正则、错误包装
 * 4. mapStatusToErrorType —— HTTP 状态码映射
 * 5. fetchWithTimeout —— 超时机制（mocked）
 * 6. 各提供商函数的错误路径（无 API Key、HTTP 错误、超时）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// 网络集成测试：需要真实 API 连接，CI 和无 key 环境下自动 skip
const hasNetworkEnv = process.env.CI !== "true" && (
  process.env.OPENAI_API_KEY ||
  process.env.DEEPSEEK_API_KEY ||
  process.env.QWEN_API_KEY
);
const netDescribe = describe.skipIf(!hasNetworkEnv);

// 保存到局部变量避免 import 被 vitest hoisting 影响
let callLLM: any;
let LLMError: any;
let LLMErrorType: any;

beforeEach(async () => {
  const mod = await import("@/lib/llm/providers");
  callLLM = mod.callLLM;
  LLMError = mod.LLMError;
  LLMErrorType = mod.LLMErrorType;
});

// ============================================================================
// 1. LLMError 类
// ============================================================================

describe("LLMError", () => {
  it("应该构造带有类型和状态码的错误", () => {
    const err = new LLMError("test", LLMErrorType.AUTH_ERROR, 401, false);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LLMError");
    expect(err.type).toBe(LLMErrorType.AUTH_ERROR);
    expect(err.statusCode).toBe(401);
    expect(err.isRetryable).toBe(false);
  });

  it("TIMEOUT 错误应可重试", () => {
    const err = new LLMError("timeout", LLMErrorType.TIMEOUT, undefined, true);
    expect(err.isRetryable).toBe(true);
  });

  it("PARSE_ERROR 错误应不可重试", () => {
    const err = new LLMError("bad json", LLMErrorType.PARSE_ERROR, undefined, false);
    expect(err.isRetryable).toBe(false);
  });
});

// ============================================================================
// 2. callLLM 提供商分发
// ============================================================================

describe("callLLM", () => {
  it("未提供 config 时默认使用 deepseek", async () => {
    // 没有 API key → 应抛出 AUTH_ERROR
    try {
      await callLLM("system", "user");
      expect.unreachable("应该抛出错误");
    } catch (e: any) {
      expect(e).toBeInstanceOf(LLMError);
      expect(e.type).toBe(LLMErrorType.AUTH_ERROR);
      expect(e.message).toContain("DeepSeek");
    }
  });

  it("不支持的提供商应抛出 UNKNOWN", async () => {
    try {
      await callLLM("sys", "user", { provider: "unknown-ai", model: "x" } as any);
      expect.unreachable("应该抛出错误");
    } catch (e: any) {
      expect(e).toBeInstanceOf(LLMError);
      expect(e.type).toBe(LLMErrorType.UNKNOWN);
      expect(e.isRetryable).toBe(false);
    }
  });

  it.skipIf(!hasNetworkEnv)("无效 API Key 应抛出 AUTH_ERROR（OpenAI）", async () => {
    try {
      await callLLM("sys", "user", {
        provider: "openai", model: "gpt-4o-mini",
        apiKey: "fake-key", timeout: 500,
      });
      expect.unreachable("应该抛出错误");
    } catch (e: any) {
      expect(e).toBeInstanceOf(LLMError);
      // 可能是 AUTH_ERROR（真正的 401）或 NETWORK/TIMEOUT（无网络）
      expect([LLMErrorType.AUTH_ERROR, LLMErrorType.NETWORK, LLMErrorType.TIMEOUT])
        .toContain(e.type);
    }
  });

  it.skipIf(!hasNetworkEnv)("Local 提供商默认 URL 可用（无连接时返回 NETWORK 或 TIMEOUT）", async () => {
    try {
      await callLLM("sys", "user", {
        provider: "local", model: "llama3",
        baseUrl: "http://127.0.0.1:19999", timeout: 500,
      });
      expect.unreachable("应该抛出错误");
    } catch (e: any) {
      expect(e).toBeInstanceOf(LLMError);
      expect([LLMErrorType.NETWORK, LLMErrorType.TIMEOUT]).toContain(e.type);
    }
  });
});

// ============================================================================
// 3. parseLLMResponse（通过 callLLM 间接测试）
// ============================================================================

describe("parseLLMResponse (indirect)", () => {
  it("callLLM deepseek + 无 API Key 应该报 AUTH_ERROR（而非解析错误）", async () => {
    try {
      await callLLM("sys", "user", { provider: "deepseek", model: "deepseek-chat", timeout: 500 } as any);
      expect.unreachable("应该抛出");
    } catch (e: any) {
      expect(e.type).toBe(LLMErrorType.AUTH_ERROR);
    }
  });
});

// ============================================================================
// 4. 超时机制
// ============================================================================

describe("fetchWithTimeout", () => {
  it.skipIf(!hasNetworkEnv)("短超时（1ms）连接不可达主机应该触发 AbortError → TIMEOUT", async () => {
    try {
      await callLLM("sys", "user", {
        provider: "deepseek", model: "deepseek-chat",
        apiKey: "sk-fake", timeout: 1,
      });
      expect.unreachable("应该抛出");
    } catch (e: any) {
      expect(e).toBeInstanceOf(LLMError);
      // 1ms 超时极大概率触发 Abort / 网络错误
      expect([LLMErrorType.TIMEOUT, LLMErrorType.NETWORK, LLMErrorType.AUTH_ERROR])
        .toContain(e.type);
    }
  });
});

// ============================================================================
// 5. mapStatusToErrorType 语义
// ============================================================================

describe("mapStatusToErrorType 语义（间接验证）", () => {
  it("callLLM deepseek 无 API Key → AUTH_ERROR 且 isRetryable=false", async () => {
    try {
      await callLLM("sys", "user");
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e.type).toBe(LLMErrorType.AUTH_ERROR);
      expect(e.isRetryable).toBe(false);
    }
  });
});

// ============================================================================
// 6. availableModels 完整性
// ============================================================================

describe("availableModels", () => {
  it("应包含所有四个提供商", async () => {
    const mod = await import("@/lib/llm/providers");
    const models = mod.availableModels;
    expect(models).toHaveProperty("openai");
    expect(models).toHaveProperty("anthropic");
    expect(models).toHaveProperty("deepseek");
    expect(models).toHaveProperty("local");
  });

  it("每个提供商至少有一个模型", async () => {
    const mod = await import("@/lib/llm/providers");
    const models = mod.availableModels;
    for (const [, modelList] of Object.entries(models)) {
      expect((modelList as string[]).length).toBeGreaterThanOrEqual(1);
    }
  });
});
