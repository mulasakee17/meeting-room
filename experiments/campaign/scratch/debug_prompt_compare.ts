import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import * as path from 'path';

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = tasks[1];

  console.log('=== 我们的 scenario prompt (agent 1) ===');
  console.log('sharedBriefing (前 400 字符):');
  console.log(t.sharedBriefing.slice(0, 400));
  console.log();
  console.log('knownItems (agent 1):');
  console.log(t.agents[0].knownItems);
}

main();
