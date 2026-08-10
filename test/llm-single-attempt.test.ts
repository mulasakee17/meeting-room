import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMError, callDeepSeekOnce } from "@/lib/llm/providers";
import { createDeepSeekSingleAttemptInvoker } from "../experiments/campaign/v6/deepseekSingleAttemptInvoker";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function successResponse(content = "A sufficiently long plain-text answer."): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("DeepSeek single-attempt provider primitive", () => {
  it("performs exactly one fetch and never retries an HTTP failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("provider down", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callDeepSeekOnce("system", "user", {
      provider: "deepseek", model: "deepseek-chat", apiKey: "fixture-key",
    })).rejects.toBeInstanceOf(LLMError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors text mode, provider max_tokens, and returns observed usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const result = await callDeepSeekOnce("system", "user", {
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "fixture-key",
      responseFormat: "text",
      maxTokens: 256,
      temperature: 0,
    });
    expect(result.rawContent).toBe("A sufficiently long plain-text answer.");
    expect(result.usage).toEqual({ promptTokens: 7, completionTokens: 3, totalTokens: 10 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.response_format).toBeUndefined();
    expect(body.max_tokens).toBe(256);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses strict JSON mode when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    await callDeepSeekOnce("system", "user", {
      provider: "deepseek", model: "deepseek-chat", apiKey: "fixture-key", responseFormat: "json",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("propagates external cancellation to the sole fetch", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = callDeepSeekOnce("system", "user", {
      provider: "deepseek", model: "deepseek-chat", apiKey: "fixture-key", timeout: 60_000,
    }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(LLMError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps the frozen v6 model/config boundary and rejects unsupported inputs before fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DEEPSEEK_API_KEY", "fixture-key");
    const invoker = createDeepSeekSingleAttemptInvoker();
    const result = await invoker.invoke({
      requestId: "request:fixture",
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "text",
      modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
      invocationConfig: { temperature: 0, maxTokens: 128 },
    }, new AbortController().signal);
    expect(result.usage?.totalTokens).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(invoker.invoke({
      requestId: "request:bad-model",
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "json",
      modelRef: { id: "deepseek:other", version: "1.0.0" },
      invocationConfig: {},
    }, new AbortController().signal)).rejects.toThrow("model_ref_unsupported");
    await expect(invoker.invoke({
      requestId: "request:bad-config",
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "json",
      modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
      invocationConfig: { topP: 0.9 },
    }, new AbortController().signal)).rejects.toThrow("invocation_config_unsupported");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
