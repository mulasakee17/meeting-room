import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from '../pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.7 };
  // hb_5, hb_7 是之前 deepseek 的 hard task, 验证 0.7 下表现
  for (const idx of [5, 7]) {
    const r = await runHiddenBenchProtocol(tasks[idx], llmConfig, 42, 5);
    const postMaj = r.postVotes.filter(v => v.isCorrect).length > 2;
    console.log(`hb_${idx}: pre=${(r.preAccuracy*100).toFixed(0)}% post=${(r.postAccuracy*100).toFixed(0)}% postMaj=${postMaj} | postVotes=${r.postVotes.map((v:any)=>v.isCorrect?'✓':'✗').join('')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
