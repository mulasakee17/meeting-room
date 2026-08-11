import { loadAllConfigs } from './tasks/hiddenbench/adapter';
import * as path from 'path';

async function main() {
  const tasks = loadAllConfigs(undefined, 4, 'nohint');
  const t = tasks[1];

  // 模拟 hiddenbenchProtocol.ts 的处理
  const description = t.sharedBriefing
    .replace(/注意：.*$/m, "")
    .replace(/以上列表顺序不代表任何优先级.*$/m, "")
    .trim();

  console.log('=== 处理后 description (前 600 字符) ===');
  console.log(description.slice(0, 600));
  console.log('\n---');

  // 模拟 agentInfo 提取
  for (let i = 0; i < 4; i++) {
    const def = t.agents[i];
    const items = def.knownItems
      .split(/[；;\n]/)
      .map(s => s.replace(/^[•\-\s]+/, "").trim())
      .filter(s => s.length > 3);
    console.log(`agent ${i+1} infoLines:`, JSON.stringify(items));
  }
}

main();
