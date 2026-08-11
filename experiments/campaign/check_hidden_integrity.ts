import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import { detectLLMProvider, callLLM } from '../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

/**
 * 检测任务完整性：只给 shared_information（不含 hidden），看模型能否推出正确答案。
 * 如果仅 shared 就能答对，该任务不构成 hidden profile。
 */
async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('glm-4-flash'), model: 'glm-4-flash', temperature: 0.0 };
  // 用 glm 测，因为它是弱模型，如果 glm 仅用 shared 就能答对，说明任务确实太简单

  const results: Array<{ idx: number; correct: boolean; vote: string; answer: string }> = [];
  const SYSTEM = `You are making a decision based ONLY on the information provided. Choose the best option. Respond in JSON: {"vote": "<option>", "rationale": "<reason>"}`;

  for (let idx = 0; idx < 65; idx++) {
    const t = tasks[idx];
    const options = Object.keys(t.correctAnswer);
    const correct = Object.entries(t.correctAnswer).find(([, r]: any) => r === 1)?.[0] as string;

    // 只给 sharedBriefing 中"所有成员共同掌握的信息"部分
    const sharedOnly = t.sharedBriefing;
    const optionList = options.map((o: string) => `- ${o}`).join("\n");
    const prompt = `## Scenario\n${sharedOnly}\n\n## Options\n${optionList}\n\nBased ONLY on the shared information above, make your decision. Respond in JSON: {"vote": "<exact option>", "rationale": "<reason>"}`;

    const resp = await callLLM(SYSTEM, prompt, llmConfig);
    const raw = resp.rawContent;
    let vote = "";
    try {
      const parsed = JSON.parse(raw.replace(/^```json\s*/, "").replace(/```$/, "").trim());
      vote = parsed.vote ?? "";
    } catch {
      const m = raw.match(/"vote"\s*:\s*"([^"]+)"/);
      if (m) vote = m[1];
    }
    const isCorrect = vote.includes(correct) || correct.includes(vote);
    results.push({ idx, correct: isCorrect, vote, answer: correct });
  }

  const pass = results.filter(r => r.correct);
  console.log(`仅用 shared_information 可答对: ${pass.length}/65`);
  console.log(`失败任务: ${results.filter(r => !r.correct).map(r => r.idx).join(",")}`);
  console.log();
  console.log('=== 仅 shared 就答对的任务（构成"非 hidden profile"）===');
  for (const r of results) {
    if (r.correct) console.log(`  [${r.idx}] vote="${r.vote}" correct="${r.answer}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
