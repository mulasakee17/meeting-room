import { callDeepSeekOnce } from "../../../src/lib/llm/providers";
import type {
  SingleAttemptTextInvokeRequest,
  SingleAttemptTextInvoker,
} from "./providerAdapters";
import { classifyLLMProviderError, V6ProviderInvocationError } from "./providerDiagnostics";

const DEEPSEEK_CHAT_MODEL_REF = Object.freeze({
  id: "deepseek:deepseek-chat",
  version: "1.0.0",
});

function parseInvocationConfig(config: Record<string, unknown>): {
  temperature?: number;
  seed?: number;
  maxTokens?: number;
} {
  const allowed = new Set(["temperature", "seed", "maxTokens"]);
  if (Object.keys(config).some(key => !allowed.has(key))) {
    throw new Error("deepseek_single_attempt_invocation_config_unsupported");
  }
  if (config.temperature !== undefined
    && (!Number.isFinite(config.temperature) || (config.temperature as number) < 0
      || (config.temperature as number) > 2)) {
    throw new Error("deepseek_single_attempt_temperature_invalid");
  }
  if (config.seed !== undefined && !Number.isSafeInteger(config.seed)) {
    throw new Error("deepseek_single_attempt_seed_invalid");
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || (config.maxTokens as number) < 1)) {
    throw new Error("deepseek_single_attempt_max_tokens_invalid");
  }
  return {
    ...(config.temperature !== undefined ? { temperature: config.temperature as number } : {}),
    ...(config.seed !== undefined ? { seed: config.seed as number } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens as number } : {}),
  };
}

function assertSupportedRequest(request: Readonly<SingleAttemptTextInvokeRequest>): void {
  if (request.modelRef.id !== DEEPSEEK_CHAT_MODEL_REF.id
    || request.modelRef.version !== DEEPSEEK_CHAT_MODEL_REF.version) {
    throw new Error("deepseek_single_attempt_model_ref_unsupported");
  }
  if (request.responseFormat !== "json" && request.responseFormat !== "text") {
    throw new Error("deepseek_single_attempt_response_format_invalid");
  }
}

/**
 * Real provider bridge for the v6 smoke CLI. Credentials remain inside the
 * provider module/environment boundary and are never accepted in artifacts.
 * Each invoke delegates to exactly one fetch attempt; there is no retry path.
 */
export function createDeepSeekSingleAttemptInvoker(): SingleAttemptTextInvoker {
  return {
    async invoke(request, signal) {
      assertSupportedRequest(request);
      const config = parseInvocationConfig(request.invocationConfig);
      let response;
      try {
        response = await callDeepSeekOnce(request.systemPrompt, request.userPrompt, {
          provider: "deepseek",
          model: "deepseek-chat",
          responseFormat: request.responseFormat,
          ...config,
        }, signal);
      } catch (error) {
        throw new V6ProviderInvocationError(classifyLLMProviderError(error));
      }
      return {
        rawContent: response.rawContent,
        ...(response.usage || response.latencyMs !== undefined
          ? {
              usage: {
                ...(response.usage ? {
                  promptTokens: response.usage.promptTokens,
                  completionTokens: response.usage.completionTokens,
                  totalTokens: response.usage.totalTokens,
                } : {}),
                ...(response.latencyMs !== undefined ? { latencyMs: response.latencyMs } : {}),
              },
            }
          : {}),
      };
    },
  };
}

export { DEEPSEEK_CHAT_MODEL_REF };
