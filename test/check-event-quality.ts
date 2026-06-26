/**
 * 事件库质量检测 — 203 事件完整性、一致性、异常值检测
 */
import { EVENTS, UnifiedEvent } from "./events";

const issues: string[] = [];
let warnings = 0;

// ── 1. 重复名称检测 ──
const names = new Set<string>();
for (const e of EVENTS) {
  if (names.has(e.name)) issues.push(`🔴 重复名称: "${e.name}"`);
  names.add(e.name);
}

// ── 2. 日期格式检测 ──
for (const e of EVENTS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) issues.push(`🔴 日期格式: "${e.name}" → ${e.date}`);
}

// ── 3. 值域检测 ──
for (const e of EVENTS) {
  if (e.vix < 0 || e.vix > 200) issues.push(`🔴 VIX越界: "${e.name}" → VIX=${e.vix}`);
  if (e.rsi < 0 || e.rsi > 100) issues.push(`🔴 RSI越界: "${e.name}" → RSI=${e.rsi}`);
  if (e.drop < 0 || e.drop > 100) issues.push(`🔴 drop越界: "${e.name}" → drop=${e.drop}%`);
  if (!["up", "down", "neutral"].includes(e.actual)) issues.push(`🔴 actual非法: "${e.name}" → ${e.actual}`);
  if (e.news.length < 50) issues.push(`🟡 新闻过短(${e.news.length}字): "${e.name}"`);
  if (e.news.length > 800) issues.push(`🟡 新闻过长(${e.news.length}字): "${e.name}"`);
}

// ── 4. 逻辑一致性检测 ──
for (const e of EVENTS) {
  // VIX与drop应正相关
  if (e.vix > 40 && e.drop < 3 && e.actual === "down")
    warnings++ && issues.push(`🟡 高VIX低跌幅: "${e.name}" VIX=${e.vix} drop=${e.drop}%`);

  // RSI与drop应负相关(大跌幅→低RSI)
  if (e.drop > 15 && e.rsi > 45)
    issues.push(`🟡 大跌幅高RSI: "${e.name}" drop=${e.drop}% RSI=${e.rsi}`);
  if (e.rsi < 15 && e.drop < 5)
    issues.push(`🟡 低RSI小跌幅: "${e.name}" RSI=${e.rsi} drop=${e.drop}%`);

  // 杠杆/偿付损伤应伴随较高VIX
  if ((e.hasLeverage || e.hasSolvency) && e.vix < 15 && e.drop > 5)
    issues.push(`🟡 杠杆/偿付+低VIX: "${e.name}" VIX=${e.vix} lev=${e.hasLeverage} solv=${e.hasSolvency}`);
}

// ── 5. 类别分布合理性 ──
const catCounts: Record<string, number> = {};
for (const e of EVENTS) catCounts[e.category] = (catCounts[e.category] || 0) + 1;
for (const [cat, count] of Object.entries(catCounts)) {
  if (count < 3) issues.push(`🟡 类别过小: "${cat}" 仅${count}事件`);
}

// ── 6. 日期排序检查 ──
const sorted = [...EVENTS].sort((a, b) => a.date.localeCompare(b.date));
let lastDate = "1900-01-01";
for (const e of sorted) {
  if (e.date < lastDate) issues.push(`🔴 日期乱序: "${e.name}" (${e.date}) 在上一事件 (${lastDate}) 之前`);
  lastDate = e.date;
}

// ── 7. decade 分布 ──
const decades: Record<string, number> = {};
for (const e of EVENTS) {
  const dec = e.date.slice(0, 3) + "0s";
  decades[dec] = (decades[dec] || 0) + 1;
}

// ── 输出 ──
console.log(`\n=== 事件库质量检测: ${EVENTS.length} 事件 ===\n`);

const reds = issues.filter(i => i.startsWith("🔴"));
const yellows = issues.filter(i => i.startsWith("🟡"));

if (reds.length === 0 && yellows.length === 0) {
  console.log("✅ 全部通过! 无问题发现。\n");
} else {
  if (reds.length > 0) {
    console.log(`🔴 严重 (${reds.length}):`);
    reds.forEach(i => console.log(`  ${i}`));
    console.log();
  }
  if (yellows.length > 0) {
    console.log(`🟡 警告 (${yellows.length}):`);
    yellows.forEach(i => console.log(`  ${i}`));
    console.log();
  }
}

console.log("年代分布:");
for (const [dec, count] of Object.entries(decades).sort()) {
  const bar = "█".repeat(Math.round(count / 2));
  console.log(`  ${dec}: ${String(count).padStart(3)} ${bar}`);
}

console.log(`\n最终判定: ${reds.length === 0 ? "✅ 无严重错误" : `🔴 ${reds.length}个严重错误需修复`} | ${yellows.length}个警告`);
