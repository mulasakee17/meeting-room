/**
 * api-validation.test.ts — v3 公共 API 输入边界测试
 *
 * 覆盖 execute（/api/v3/execute）与 task（/api/v3/task）两条公开路由，
 * 以及两者共享的 validatePublicLLMConfig（@/lib/security/validation）：
 *
 * 1. 额外 baseUrl / apiKey / 自定义字段不会穿透 HTTP 信任边界
 * 2. agentCount / maxRounds 边界（<1、>20、非整数、数字字符串、缺省默认值）
 * 3. 非法 provider / model / temperature
 * 4. 过大（>100_000 字符）或空 input.content
 *
 * 路由测试直接用真实 NextRequest / NextResponse 调用 POST handler
 * （不 mock next/server），仅 mock @/lib/pipeline 以截获传给
 * runSwarmPipeline 的参数并避免真实 LLM 调用。每个请求使用唯一
 * X-Forwarded-For，避免共享内存速率限制器跨用例互相干扰。
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { validatePublicLLMConfig } from "@/lib/security/validation";
import { runSwarmPipeline } from "@/lib/pipeline";
import { POST as executePOST } from "@/app/api/v3/execute/route";
import { POST as taskPOST } from "@/app/api/v3/task/route";

// mock @/lib/pipeline：只替换 runSwarmPipeline，其余导出原样保留。
// 注意工厂内部自包含 mock 返回对象（vi.mock 被提升到文件顶部，
// 引用外部 const 会因 TDZ 在工厂执行时抛错）。
vi.mock("@/lib/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipeline")>();
  return {
    ...actual,
    runSwarmPipeline: vi.fn(async () => ({
      output: { finalDecision: "d", confidence: 0.5, reasoning: "r", steps: [], agentContributions: {} },
      evaluation: { overallScore: 50 },
      governance: { interventionCount: 0 },
      agents: [],
      interactionHistory: [],
      trace: { taskId: "t", startTime: "s", endTime: "e", phases: [], fullLog: "l" },
    })),
  };
});

const runSwarmPipelineMock = runSwarmPipeline as unknown as Mock;

/** 返回最近一次以 "execute" 为前缀调用管线的入参（过滤掉 task 定时器的调用）。 */
function lastExecutePipelineInput(): Record<string, any> {
  const calls = runSwarmPipelineMock.mock.calls as Array<[Record<string, any>, string?]>;
  const executeCalls = calls.filter(c => c[1] === "execute");
  expect(executeCalls.length).toBeGreaterThan(0);
  return executeCalls[executeCalls.length - 1][0];
}

// ---- 请求构造辅助 -----------------------------------------------------------

let ipCounter = 0;

function makeRequest(path: string, body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `198.51.100.${ipCounter}`,
    },
  });
}

// ============================================================================
// 1. validatePublicLLMConfig — 纯函数输入边界
// ============================================================================

describe("validatePublicLLMConfig — 纯函数输入边界", () => {
  it("接受合法配置并只保留 provider/model/temperature", () => {
    const r = validatePublicLLMConfig({ provider: "deepseek", model: "deepseek-chat", temperature: 0.7 });
    expect(r.valid).toBe(true);
    expect(r.sanitized).toEqual({ provider: "deepseek", model: "deepseek-chat", temperature: 0.7 });
  });

  it("不将 baseUrl / apiKey / timeout / 自定义字段带入 sanitized（重建对象）", () => {
    const r = validatePublicLLMConfig({
      provider: "openai",
      model: "gpt-4o",
      temperature: 1,
      apiKey: "sk-secret",
      baseUrl: "http://169.254.169.254/latest/meta-data",
      timeout: 30000,
      custom: { sneaky: true },
      headers: { authorization: "Bearer leak" },
    });
    expect(r.valid).toBe(true);
    expect(r.sanitized).toEqual({ provider: "openai", model: "gpt-4o", temperature: 1 });
    // 序列化后同样不得残留秘密字段（防御深层对象 / 原型链穿透）
    expect(JSON.stringify(r.sanitized)).not.toContain("sk-secret");
    expect(JSON.stringify(r.sanitized)).not.toContain("169.254");
  });

  it("model 去除首尾空白", () => {
    const r = validatePublicLLMConfig({ provider: "local", model: "  qwen2  " });
    expect(r.valid).toBe(true);
    expect(r.sanitized).toEqual({ provider: "local", model: "qwen2" });
  });

  it("temperature 未提供时不输出 temperature 字段", () => {
    const r = validatePublicLLMConfig({ provider: "local", model: "qwen2" });
    expect(r.valid).toBe(true);
    expect(r.sanitized).toEqual({ provider: "local", model: "qwen2" });
  });

  it("拒绝非法 provider", () => {
    expect(validatePublicLLMConfig({ provider: "evil", model: "x" }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: "", model: "x" }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: 123, model: "x" }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: undefined, model: "x" }).valid).toBe(false);
  });

  it("拒绝缺失、空白、超长或非字符串 model", () => {
    expect(validatePublicLLMConfig({ provider: "deepseek" }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: "deepseek", model: "" }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: "deepseek", model: "   " }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: "deepseek", model: "x".repeat(101) }).valid).toBe(false);
    expect(validatePublicLLMConfig({ provider: "deepseek", model: 123 }).valid).toBe(false);
  });

  it("接受恰好 100 字符的 model", () => {
    const r = validatePublicLLMConfig({ provider: "deepseek", model: "m".repeat(100) });
    expect(r.valid).toBe(true);
  });

  it("拒绝越界或非数值 temperature", () => {
    for (const t of [-0.1, 2.1, NaN, Infinity, "0.5", null, true]) {
      expect(
        validatePublicLLMConfig({ provider: "deepseek", model: "m", temperature: t as number }).valid
      ).toBe(false);
    }
  });

  it("接受 temperature 边界值 0 / 2 / 1.5", () => {
    expect(validatePublicLLMConfig({ provider: "deepseek", model: "m", temperature: 0 }).valid).toBe(true);
    expect(validatePublicLLMConfig({ provider: "deepseek", model: "m", temperature: 2 }).valid).toBe(true);
    expect(validatePublicLLMConfig({ provider: "deepseek", model: "m", temperature: 1.5 }).valid).toBe(true);
  });

  it("拒绝非对象输入（null / 数组 / 字符串 / 数字 / undefined）", () => {
    expect(validatePublicLLMConfig(undefined).valid).toBe(false);
    expect(validatePublicLLMConfig(null).valid).toBe(false);
    expect(validatePublicLLMConfig([]).valid).toBe(false);
    expect(validatePublicLLMConfig("deepseek").valid).toBe(false);
    expect(validatePublicLLMConfig(42).valid).toBe(false);
  });

  it("非法输入返回字段级错误信息", () => {
    const r = validatePublicLLMConfig({ provider: "evil", model: "", temperature: 5 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("llmConfig.provider is not supported");
    expect(r.errors).toContain("llmConfig.model must be a non-empty string of at most 100 characters");
    expect(r.errors).toContain("llmConfig.temperature must be a finite number between 0 and 2");
  });
});

// ============================================================================
// 2. POST /api/v3/execute — 输入边界
// ============================================================================

const VALID_EXECUTE = {
  version: "v3",
  input: { type: "question", content: "Should we invest in AI research?" },
  agentConfig: { provider: "custom", agentCount: 3 },
  llmConfig: { provider: "deepseek", model: "deepseek-chat" },
};

describe("POST /api/v3/execute — 输入边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("版本非法 → 400 INVALID_VERSION", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, version: "v2" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_VERSION");
  });

  it("input.type 非法 → 400 INVALID_INPUT", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, input: { type: "image", content: "x" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_INPUT");
  });

  it("空 content（空字符串）→ 400 INVALID_INPUT", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, input: { type: "text", content: "" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_INPUT");
  });

  it("content 恰为 100000 字符 → 通过", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, input: { type: "text", content: "x".repeat(100_000) } }));
    expect(res.status).toBe(200);
  });

  it("content 超过 100000 字符 → 400 INVALID_INPUT", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, input: { type: "text", content: "x".repeat(100_001) } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("100000");
  });

  it("缺少 agentConfig → 400", async () => {
    const { agentConfig, ...rest } = VALID_EXECUTE;
    const res = await executePOST(makeRequest("/api/v3/execute", rest));
    expect(res.status).toBe(400);
  });

  it("agent provider 不在注册表（crewai）→ 400", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, agentConfig: { provider: "crewai", agentCount: 3 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Invalid agent provider");
  });

  it.each([0, -1, 21, 1.5, "5"])("agentCount 非法值 %j → 400", async (agentCount) => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, agentConfig: { provider: "custom", agentCount } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("agentCount");
  });

  it("agentCount 缺省时默认 5 传给管线", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, agentConfig: { provider: "custom" } }));
    expect(res.status).toBe(200);
    expect(lastExecutePipelineInput().agentCount).toBe(5);
  });

  it.each([0, -1, 21, 1.5, "3"])("maxRounds 非法值 %j → 400", async (maxRounds) => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, maxRounds }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("maxRounds");
  });

  it("maxRounds 缺省时默认 3 传给管线", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", VALID_EXECUTE));
    expect(res.status).toBe(200);
    expect(lastExecutePipelineInput().maxRounds).toBe(3);
  });

  it("llmConfig.provider 非法 → 400", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, llmConfig: { provider: "evil", model: "x" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("llmConfig.provider is not supported");
  });

  it("llmConfig.model 为空（空白）→ 400", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, llmConfig: { provider: "deepseek", model: "   " } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("llmConfig.model");
  });

  it("llmConfig.temperature 越界 → 400", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", { ...VALID_EXECUTE, llmConfig: { provider: "deepseek", model: "m", temperature: 3 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("llmConfig.temperature");
  });

  it("llmConfig 中的 apiKey / baseUrl / 自定义字段不传给管线", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", {
      ...VALID_EXECUTE,
      llmConfig: {
        provider: "local",
        model: "qwen2",
        temperature: 0.5,
        apiKey: "sk-leak",
        baseUrl: "http://169.254.169.254/latest/meta-data",
        timeout: 99999,
        headers: { authorization: "Bearer leak" },
      },
    }));
    expect(res.status).toBe(200);
    expect(lastExecutePipelineInput().llmConfig).toEqual({ provider: "local", model: "qwen2", temperature: 0.5 });
  });

  it("顶层额外字段（apiKey / baseUrl / admin）不传给管线", async () => {
    const res = await executePOST(makeRequest("/api/v3/execute", {
      ...VALID_EXECUTE,
      apiKey: "top-level-secret",
      baseUrl: "http://attacker.example",
      admin: true,
    }));
    expect(res.status).toBe(200);
    const input = lastExecutePipelineInput();
    expect(input.apiKey).toBeUndefined();
    expect(input.baseUrl).toBeUndefined();
    expect(input.admin).toBeUndefined();
  });
});

// ============================================================================
// 3. POST /api/v3/task — 输入边界
// ============================================================================

const VALID_TASK = {
  version: "v3",
  title: "Test task",
  description: "description",
  input: { type: "text", content: "hello world" },
  agentConfig: { provider: "custom", agentCount: 3 },
  llmConfig: { provider: "deepseek", model: "deepseek-chat" },
};

describe("POST /api/v3/task — 输入边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("合法请求 → 200 + 任务元信息", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", VALID_TASK));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.taskId).toMatch(/^task_/);
    expect(body.createdAt).toBeDefined();
  });

  it("版本非法 → 400 INVALID_VERSION", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, version: "v2" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_VERSION");
  });

  it("input.type 非法 → 400", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, input: { type: "image", content: "x" } }));
    expect(res.status).toBe(400);
  });

  it("空 content（空字符串）→ 400", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, input: { type: "text", content: "" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_INPUT");
  });

  it("content 超过 100000 字符 → 400", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, input: { type: "text", content: "x".repeat(100_001) } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_INPUT");
  });

  it.each([0, -1, 21, 1.5, "5"])("agentCount 非法值 %j → 400", async (agentCount) => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, agentConfig: { provider: "custom", agentCount } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("agentCount");
  });

  it.each([0, -1, 21, 1.5, "3"])("maxRounds 非法值 %j → 400", async (maxRounds) => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, maxRounds }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("maxRounds");
  });

  it("agent provider 不在注册表（crewai）→ 400", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, agentConfig: { provider: "crewai", agentCount: 3 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Invalid agent provider");
  });

  it("llmConfig.provider 非法 → 400", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, llmConfig: { provider: "evil", model: "x" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("llmConfig.provider is not supported");
  });

  it("llmConfig.temperature 越界 → 400", async () => {
    const res = await taskPOST(makeRequest("/api/v3/task", { ...VALID_TASK, llmConfig: { provider: "deepseek", model: "m", temperature: 3 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("llmConfig.temperature");
  });
});
