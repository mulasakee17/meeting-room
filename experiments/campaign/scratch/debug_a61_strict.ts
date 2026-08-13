import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from '../pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.0 };
  const r = await runHiddenBenchProtocol(tasks[61], llmConfig, 42, 5);
  console.log(`=== hb_61 (严格判定) ===`);
  console.log(`pre=${r.preAccuracy.toFixed(2)} post=${r.postAccuracy.toFixed(2)}`);
  console.log('post votes:', r.postVotes.map((v: any) => `${v.agentLabel}:"${v.vote}"[${v.isCorrect ? "✓" : "✗"}]`));
}

main().catch(e => { console.error(e); process.exit(1); });
