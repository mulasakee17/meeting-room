import { loadAllConfigs } from '../tasks/hiddenbench/adapter';
import * as path from 'path';

async function main() {
  // 我们的分配
  const ourTasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = ourTasks[1];
  console.log('=== 我们的分配 (hb_1, 4 agents) ===');
  for (const a of t.agents) {
    console.log(`${a.id}: ${a.knownItems.replace("你掌握的信息：", "").replace(/\n1\. /, " -> ").trim()}`);
  }
}

main();
