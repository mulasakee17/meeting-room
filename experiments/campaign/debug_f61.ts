import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import { detectLLMProvider } from '../../src/lib/llm/providers';
import { callLLM } from '../../src/lib/llm/providers';
import { safeJsonParse } from '../../src/lib/utils/jsonUtils';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = tasks[61];
  const options = Object.keys(t.correctAnswer);
  const correctAnswer = Object.entries(t.correctAnswer).find(([, r]: any) => r === 1)?.[0] as string;

  const allInfo = t.agents.map((a: any) => a.knownItems).filter(Boolean).join("\n");
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.0 };
  const HB_SYSTEM = `You are participating in a study. You have received complete information about a scenario and need to make a decision. Respond with JSON: {"vote": "<option>", "rationale": "<reason>"}`;
  const optionList = options.map((o: string) => `- ${o}`).join("\n");
  const prompt = `## Scenario\n${t.sharedBriefing}\n\n## Complete Information\n${allInfo}\n\n## Options\n${optionList}\n\nBased on ALL information above, make your decision. Respond in JSON: {"vote": "<exact option>", "rationale": "<reason>"}`;

  const response = await callLLM(HB_SYSTEM, prompt, llmConfig);
  const raw = response.rawContent;
  console.log('F raw output:', raw.slice(0, 500));
  console.log('correct:', correctAnswer);
}

main().catch(e => { console.error(e); process.exit(1); });
