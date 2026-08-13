import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from '../pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = tasks[61];
  console.log('options:', Object.keys(t.correctAnswer));
  console.log('correct:', Object.entries(t.correctAnswer).find(([,v]:any)=>v===1)?.[0]);

  const llmConfig = {
    provider: detectLLMProvider('deepseek-chat'),
    model: 'deepseek-chat',
    temperature: 0.0,
  };
  const r = await runHiddenBenchProtocol(t, llmConfig, 42, 5);
  console.log('\n=== Result ===');
  console.log('preAccuracy:', r.preAccuracy, 'postAccuracy:', r.postAccuracy);
  console.log('collectiveGain:', r.collectiveGain);
  console.log('pre votes:', r.preVotes?.map((v:any)=>`${v.agentId}:${v.vote}`));
  console.log('post votes:', r.postVotes?.map((v:any)=>`${v.agentId}:${v.vote}`));
}

main().catch(e => { console.error(e); process.exit(1); });
