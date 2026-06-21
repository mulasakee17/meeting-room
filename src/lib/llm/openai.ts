import { callLLM as callLLMProvider } from "./providers";

export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<{ emotion: number; reasoning: string }> {
  return callLLMProvider(systemPrompt, userPrompt);
}