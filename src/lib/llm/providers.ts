import { LLM_DEFAULT_TIMEOUT_MS } from "../constants";

export type LLMProvider = "openai" | "anthropic" | "deepseek" | "local";

// 错误类型分类
export enum LLMErrorType {
  TIMEOUT = 'TIMEOUT',
  NETWORK = 'NETWORK',
  API_ERROR = 'API_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  UNKNOWN = 'UNKNOWN',
}

// 自定义错误类
export class LLMError extends Error {
  constructor(
    message: string,
    public type: LLMErrorType,
    public statusCode?: number,
    public isRetryable: boolean = true
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// 超时配置（与 constants.ts 保持同步，避免多处硬编码）
const DEFAULT_TIMEOUT = LLM_DEFAULT_TIMEOUT_MS;

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;   // 超时时间（毫秒）
  temperature?: number; // 温度参数 (0-2)
  seed?: number;       // 随机种子（DeepSeek/OpenAI 支持，用于可复现性）
}

export interface LLMResponse {
  emotion: number;
  reasoning: string;
  /** Full LLM output text — preserved for downstream parsers (V2 itemBeliefs). */
  rawContent: string;
}

// 带超时的 fetch
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  config?: LLMConfig
): Promise<LLMResponse> {
  const provider = config?.provider || "deepseek";

  switch (provider) {
    case "openai":
      return callOpenAI(systemPrompt, userPrompt, config);
    case "anthropic":
      return callAnthropic(systemPrompt, userPrompt, config);
    case "deepseek":
      return callDeepSeek(systemPrompt, userPrompt, config);
    case "local":
      return callLocalLLM(systemPrompt, userPrompt, config);
    default:
      throw new LLMError(
        `不支持的 LLM 提供商: ${provider}`,
        LLMErrorType.UNKNOWN,
        undefined,
        false
      );
  }
}

// 错误类型映射
function mapStatusToErrorType(status: number): { type: LLMErrorType; isRetryable: boolean } {
  switch (status) {
    case 401:
    case 403:
      return { type: LLMErrorType.AUTH_ERROR, isRetryable: false };
    case 429:
      return { type: LLMErrorType.RATE_LIMIT, isRetryable: true };
    case 500:
    case 502:
    case 503:
      return { type: LLMErrorType.API_ERROR, isRetryable: true };
    default:
      return { type: LLMErrorType.API_ERROR, isRetryable: status >= 500 };
  }
}

// 解析 LLM 响应
function parseLLMResponse(content: string, provider: string): LLMResponse {
  // 1. Strip markdown code fences that some models add despite instructions
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
  }

  // 2. Try JSON parse
  try {
    const parsed = JSON.parse(cleaned);

    // Accept either {emotion, reasoning} OR {belief, reasoning} as fallback
    const emotion = typeof parsed.emotion === "number"
      ? parsed.emotion
      : typeof parsed.belief === "number"
        ? Math.round(parsed.belief * 100)  // belief is -1..1, convert to -100..100
        : 0;

    const reasoning = typeof parsed.reasoning === "string"
      ? parsed.reasoning
      : typeof parsed.analysis === "string"
        ? parsed.analysis
        : typeof parsed.content === "string"
          ? parsed.content
          : JSON.stringify(parsed);

    return { emotion, reasoning, rawContent: content };
  } catch (err) {
    console.warn(`[parseLLMResponse] ${provider} JSON parse failed:`, err instanceof Error ? err.message : err);
  }

  // 3. Regex extraction from malformed JSON or plain text
  const emotionMatch = cleaned.match(/emotion["\s:]*(-?\d+(?:\.\d+)?)/);
  const reasoningMatch = cleaned.match(/reasoning["\s:]*["']([^"']{5,})["']/i);

  if (emotionMatch && reasoningMatch) {
    return {
      emotion: parseFloat(emotionMatch[1]),
      reasoning: reasoningMatch[1],
      rawContent: content,
    };
  }

  // 4. Last resort — treat entire response as reasoning with neutral emotion
  if (cleaned.length > 10) {
    return { emotion: 0, reasoning: cleaned.slice(0, 2000), rawContent: content };
  }

  throw new LLMError(
    `无法解析 ${provider} 响应: ${content.slice(0, 100)}...`,
    LLMErrorType.PARSE_ERROR,
    undefined,
    false
  );
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  config?: LLMConfig
): Promise<LLMResponse> {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
  const model = config?.model || "gpt-4o-mini";
  const timeout = config?.timeout || DEFAULT_TIMEOUT;
  const temperature = config?.temperature ?? 0.7;

  if (!apiKey) {
    throw new LLMError(
      'OpenAI API Key 未配置',
      LLMErrorType.AUTH_ERROR,
      undefined,
      false
    );
  }
  
  try {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature,
          ...(config?.seed !== undefined ? { seed: config.seed } : {}),
        }),
      },
      timeout
    );

    if (!response.ok) {
      const { type, isRetryable } = mapStatusToErrorType(response.status);
      const errorBody = await response.text().catch(() => '');
      throw new LLMError(
        `OpenAI API 错误 [${response.status}]: ${errorBody || response.statusText}`,
        type,
        response.status,
        isRetryable
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new LLMError(
        'OpenAI 返回内容为空',
        LLMErrorType.INVALID_RESPONSE,
        undefined,
        false
      );
    }
    
    return parseLLMResponse(content, 'OpenAI');
  } catch (error) {
    if (error instanceof LLMError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new LLMError(
          `OpenAI 请求超时（${timeout / 1000}秒）`,
          LLMErrorType.TIMEOUT,
          undefined,
          true
        );
      }
      
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new LLMError(
          `OpenAI 网络错误: ${error.message}`,
          LLMErrorType.NETWORK,
          undefined,
          true
        );
      }
    }
    
    throw new LLMError(
      `OpenAI 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      LLMErrorType.UNKNOWN,
      undefined,
      true
    );
  }
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  config?: LLMConfig
): Promise<LLMResponse> {
  const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = config?.model || "claude-3-haiku-20240307";
  const timeout = config?.timeout || DEFAULT_TIMEOUT;
  
  if (!apiKey) {
    throw new LLMError(
      'Anthropic API Key 未配置',
      LLMErrorType.AUTH_ERROR,
      undefined,
      false
    );
  }
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "x-api-key": apiKey,
  };

  try {
    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      },
      timeout
    );

    if (!response.ok) {
      const { type, isRetryable } = mapStatusToErrorType(response.status);
      const errorBody = await response.text().catch(() => '');
      throw new LLMError(
        `Anthropic API 错误 [${response.status}]: ${errorBody || response.statusText}`,
        type,
        response.status,
        isRetryable
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    
    if (!content) {
      throw new LLMError(
        'Anthropic 返回内容为空',
        LLMErrorType.INVALID_RESPONSE,
        undefined,
        false
      );
    }
    
    return parseLLMResponse(content, 'Anthropic');
  } catch (error) {
    if (error instanceof LLMError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new LLMError(
          `Anthropic 请求超时（${timeout / 1000}秒）`,
          LLMErrorType.TIMEOUT,
          undefined,
          true
        );
      }
      
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new LLMError(
          `Anthropic 网络错误: ${error.message}`,
          LLMErrorType.NETWORK,
          undefined,
          true
        );
      }
    }
    
    throw new LLMError(
      `Anthropic 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      LLMErrorType.UNKNOWN,
      undefined,
      true
    );
  }
}

async function callDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  config?: LLMConfig
): Promise<LLMResponse> {
  const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY;
  const model = config?.model || "deepseek-chat";
  const timeout = config?.timeout || DEFAULT_TIMEOUT;
  const temperature = config?.temperature ?? 0.7;

  if (!apiKey) {
    throw new LLMError(
      'DeepSeek API Key 未配置',
      LLMErrorType.AUTH_ERROR,
      undefined,
      false
    );
  }

  try {
    const response = await fetchWithTimeout(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature,
          ...(config?.seed !== undefined ? { seed: config.seed } : {}),
        }),
      },
      timeout
    );

    if (!response.ok) {
      const { type, isRetryable } = mapStatusToErrorType(response.status);
      const errorBody = await response.text().catch(() => '');
      throw new LLMError(
        `DeepSeek API 错误 [${response.status}]: ${errorBody || response.statusText}`,
        type,
        response.status,
        isRetryable
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new LLMError(
        'DeepSeek 返回内容为空',
        LLMErrorType.INVALID_RESPONSE,
        undefined,
        false
      );
    }

    return parseLLMResponse(content, 'DeepSeek');
  } catch (error) {
    if (error instanceof LLMError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new LLMError(
          `DeepSeek 请求超时（${timeout / 1000}秒）`,
          LLMErrorType.TIMEOUT,
          undefined,
          true
        );
      }
      
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new LLMError(
          `DeepSeek 网络错误: ${error.message}`,
          LLMErrorType.NETWORK,
          undefined,
          true
        );
      }
    }
    
    throw new LLMError(
      `DeepSeek 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      LLMErrorType.UNKNOWN,
      undefined,
      true
    );
  }
}

async function callLocalLLM(
  systemPrompt: string,
  userPrompt: string,
  config?: LLMConfig
): Promise<LLMResponse> {
  const baseUrl = config?.baseUrl || process.env.LOCAL_LLM_URL || "http://localhost:11434";
  const model = config?.model || "llama3";
  const timeout = config?.timeout || DEFAULT_TIMEOUT * 2; // 本地模型可能更慢
  
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          format: "json",
          stream: false,
        }),
      },
      timeout
    );

    if (!response.ok) {
      const { type, isRetryable } = mapStatusToErrorType(response.status);
      throw new LLMError(
        `本地 LLM 错误 [${response.status}]: ${response.statusText}`,
        type,
        response.status,
        isRetryable
      );
    }

    const data = await response.json();
    const content = data.message?.content;
    
    if (!content) {
      throw new LLMError(
        '本地 LLM 返回内容为空',
        LLMErrorType.INVALID_RESPONSE,
        undefined,
        false
      );
    }
    
    return parseLLMResponse(content, 'Local LLM');
  } catch (error) {
    if (error instanceof LLMError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new LLMError(
          `本地 LLM 请求超时（${(timeout / 1000).toFixed(0)}秒）`,
          LLMErrorType.TIMEOUT,
          undefined,
          true
        );
      }
      
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new LLMError(
          `本地 LLM 连接失败: ${error.message}`,
          LLMErrorType.NETWORK,
          undefined,
          true
        );
      }
    }
    
    throw new LLMError(
      `本地 LLM 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      LLMErrorType.UNKNOWN,
      undefined,
      true
    );
  }
}

export const availableModels: Record<LLMProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-3-haiku-20240307", "claude-3-sonnet-20240229", "claude-3-opus-20240229"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  local: ["llama3", "mistral", "qwen2"],
};