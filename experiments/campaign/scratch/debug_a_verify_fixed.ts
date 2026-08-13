import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from '../pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.0 };
  // 之前全对的任务 + 之前失败的任务 + hb_61
  for (const idx of [0, 1, 5, 7, 12, 61]) {
    const r = await runHiddenBenchProtocol(tasks[idx], llmConfig, 42, 5);
    const preMaj = r.preVotes.filter(v => v.isCorrect).length > 2;
    const postMaj = r.postVotes.filter(v => v.isCorrect).length > 2;
    console.log(`hb_${idx}: pre=${(r.preAccuracy*100).toFixed(0)}% post=${(r.postAccuracy*100).toFixed(0)}% postMaj=${postMaj} | preVotes=${r.preVotes.map((v:any)=>v.isCorrect?'✓':'✗').join('')} postVotes=${r.postVotes.map((v:any)=>v.isCorrect?'✓':'✗').join('')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
