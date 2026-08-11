import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from './pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.7 };
  // 0.7 下多 seed 重跑 hb_5, 看波动
  for (const idx of [5]) {
    for (const seed of [42, 123, 456]) {
      const r = await runHiddenBenchProtocol(tasks[idx], llmConfig, seed, 5);
      const postMaj = r.postVotes.filter(v => v.isCorrect).length > 2;
      console.log(`hb_${idx} seed=${seed}: pre=${(r.preAccuracy*100).toFixed(0)}% post=${(r.postAccuracy*100).toFixed(0)}% postMaj=${postMaj}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
