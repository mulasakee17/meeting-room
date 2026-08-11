import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import * as path from 'path';

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = tasks[1];

  console.log('=== sharedBriefing 完整内容 ===');
  console.log(t.sharedBriefing);
  console.log('\n=== 每个 agent 的 knownItems 完整 ===');
  for (const a of t.agents) {
    console.log(`\n--- ${a.id} ---`);
    console.log(a.knownItems);
  }
}

main();
