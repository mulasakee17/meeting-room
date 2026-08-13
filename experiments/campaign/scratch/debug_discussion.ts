import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from '../pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const llmConfig = { provider: detectLLMProvider('deepseek-chat'), model: 'deepseek-chat', temperature: 0.0 };

  // hb_12: pre=0.50 → post=1.00, 看讨论怎么让 2 个 agent 转向
  const r = await runHiddenBenchProtocol(tasks[12], llmConfig, 42, 5);
  console.log(`=== hb_12: pre=${r.preAccuracy} post=${r.postAccuracy} ===`);
  for (const m of r.discussionHistory) {
    console.log(`\n[Round ${m.round} ${m.agentLabel}] ${m.content.slice(0, 200)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
