import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import { runHiddenBenchProtocol } from './pipeline/hiddenbenchProtocol';
import { detectLLMProvider } from '../../src/lib/llm/providers';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = tasks[1];
  console.log('=== hb_1 ===');
  console.log('options:', Object.keys(t.correctAnswer));
  console.log('correct:', Object.entries(t.correctAnswer).find(([,v]:any)=>v===1)?.[0]);
  console.log('sharedBriefing:', t.sharedBriefing.slice(0, 300));
  console.log();
  for (const a of t.agents) {
    console.log(`${a.id}: ${a.knownItems.slice(0, 120)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
