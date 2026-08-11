import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import { detectLLMProvider, callLLM } from '../../src/lib/llm/providers';
import { safeJsonParse } from '../../src/lib/utils/jsonUtils';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('glm-4-flash'), model: 'glm-4-flash', temperature: 0.0 };

  for (const idx of [31, 34, 61]) {
    const t = tasks[idx];
    const options = Object.keys(t.correctAnswer);
    const correct = Object.entries(t.correctAnswer).find(([, r]: any) => r === 1)?.[0] as string;
    const allInfo = t.agents.map((a: any) => a.knownItems).filter(Boolean).join("\n");
    const HB_SYSTEM = `You are participating in a study. You have received complete information about a scenario and need to make a decision. Respond with JSON: {"vote": "<option>", "rationale": "<reason>"}`;
    const optionList = options.map((o: string) => `- ${o}`).join("\n");
    const prompt = `## Scenario\n${t.sharedBriefing}\n\n## Complete Information\n${allInfo}\n\n## Options\n${optionList}\n\nBased on ALL information above, make your decision. Respond in JSON: {"vote": "<exact option>", "rationale": "<reason>"}`;
    const response = await callLLM(HB_SYSTEM, prompt, llmConfig);
    const raw = response.rawContent;
    const parsed = safeJsonParse<{ vote?: string }>(raw);
    const vote = parsed?.vote ?? "";
    // Current buggy check
    const buggy = correct === vote || options.some(o => vote.includes(o) && o.includes(vote));
    // Correct check (one-way contains + normalized)
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const fixed = norm(vote) === norm(correct) || options.some(o => norm(vote).includes(norm(o)) || norm(o).includes(norm(vote)));
    console.log(`hb_${idx}: vote="${vote}" correct="${correct}"`);
    console.log(`  buggy=${buggy ? 'OK' : 'MISSED'}  fixed=${fixed ? 'OK' : 'MISSED'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
