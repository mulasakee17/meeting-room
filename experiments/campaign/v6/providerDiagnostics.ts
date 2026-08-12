import { LLMError, LLMErrorType } from "../../../src/lib/llm/providers";

export type V6ProviderFailureCode =
  | "provider_timeout"
  | "provider_network"
  | "provider_rate_limit"
  | "provider_auth"
  | "provider_api_error"
  | "provider_invalid_response"
  | "provider_unknown";

/** Sanitized provider failure: artifacts retain the class, never the message/body. */
export class V6ProviderInvocationError extends Error {
  constructor(public readonly code: V6ProviderFailureCode) {
    super(code);
    this.name = "V6ProviderInvocationError";
  }
}

export function classifyLLMProviderError(error: unknown): V6ProviderFailureCode {
  if (!(error instanceof LLMError)) return "provider_unknown";
  switch (error.type) {
    case LLMErrorType.TIMEOUT: return "provider_timeout";
    case LLMErrorType.NETWORK: return "provider_network";
    case LLMErrorType.RATE_LIMIT: return "provider_rate_limit";
    case LLMErrorType.AUTH_ERROR: return "provider_auth";
    case LLMErrorType.API_ERROR: return "provider_api_error";
    case LLMErrorType.INVALID_RESPONSE:
    case LLMErrorType.PARSE_ERROR:
      return "provider_invalid_response";
    default: return "provider_unknown";
  }
}

export function providerFailureCode(error: unknown): V6ProviderFailureCode | "provider_error" {
  return error instanceof V6ProviderInvocationError ? error.code : "provider_error";
}
