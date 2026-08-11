import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from './pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.0 };

  // 重跑之前全对的 hb_1 和 hb_12, 对比严格判定下结果是否变化
  for (const idx of [1, 12]) {
    const r = await runHiddenBenchProtocol(tasks[idx], llmConfig, 42, 5);
    console.log(`\n=== hb_${idx} (严格判定) ===`);
    console.log(`pre=${r.preAccuracy.toFixed(2)} post=${r.postAccuracy.toFixed(2)}`);
    console.log('pre votes:', r.preVotes.map((v: any) => `${v.agentLabel}:${v.vote}[${v.isCorrect ? "✓" : "✗"}]`));
    console.log('post votes:', r.postVotes.map((v: any) => `${v.agentLabel}:${v.vote}[${v.isCorrect ? "✓" : "✗"}]`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
