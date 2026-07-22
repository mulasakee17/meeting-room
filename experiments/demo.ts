/**
 * SwarmAlpha 最小演示 —— 30 秒内展示治理引擎核心能力
 *
 * 用法：npm run demo
 *
 * 展示内容：
 * 1. 7 个内置检测器检测 groupthink / authority bias / polarization
 * 2. 自定义检测器注册 + suggestedIntervention 闭合
 * 3. F 分解排序 + 自适应剂量
 * 4. 输出治理报告（纯本地，无需 LLM API）
 */

import { GovernanceEngine, AgentBelief, MessageInfo, GovernanceConfig, DetectorResult } from "../src/lib/governance";

// ── 1. 构造一个有 authority bias 的群体 ──────────────────────────
const beliefs: AgentBelief[] = [
  { agentId: "dominant_agent", belief: 0.95, confidence: 95, timestamp: new Date().toISOString() },
  { agentId: "follower_1",     belief: 0.90, confidence: 70, timestamp: new Date().toISOString() },
  { agentId: "follower_2",     belief: 0.88, confidence: 65, timestamp: new Date().toISOString() },
  { agentId: "dissenter",      belief: 0.30, confidence: 85, timestamp: new Date().toISOString() },
  { agentId: "undecided",      belief: 0.55, confidence: 40, timestamp: new Date().toISOString() },
];

// dominant_agent 被 80% 的发言引用 → 权威偏差
const messages: MessageInfo[] = [
  { agentId: "dominant_agent", content: "The answer is clearly X.", timestamp: new Date().toISOString() },
  { agentId: "follower_1",     content: "I agree with dominant_agent.", timestamp: new Date().toISOString(), referencedAgents: ["dominant_agent"] },
  { agentId: "follower_2",     content: "Following dominant_agent's lead.", timestamp: new Date().toISOString(), referencedAgents: ["dominant_agent"] },
  { agentId: "dissenter",      content: "I think Y is better because...", timestamp: new Date().toISOString() },
  { agentId: "undecided",      content: "Not sure, but dominant_agent seems confident.", timestamp: new Date().toISOString(), referencedAgents: ["dominant_agent"] },
];

const agentIds = beliefs.map(b => b.agentId);
const config: GovernanceConfig = {
  interventionLevel: "medium",
  currentRound: 1,
  maxRounds: 5,
  authorityBiasThreshold: 0.3,
  sortingMode: "fdecomposition",
  useAdaptiveDosage: true,
};

const engine = new GovernanceEngine();

// ── 2. 注册自定义检测器：检测"沉默的异议者" ──────────────────────
engine.registerDetector({
  type: "silent_dissent",
  detect: (agentBeliefs, msgs, cfg): DetectorResult => {
    // 找到信念偏离群体均值 >0.3 但发言次数 ≤1 的 agent
    const meanBelief = agentBeliefs.reduce((s, b) => s + b.belief, 0) / agentBeliefs.length;
    const silentDissenter = agentBeliefs.filter(b => {
      const msgCount = msgs.filter(m => m.agentId === b.agentId).length;
      return Math.abs(b.belief - meanBelief) > 0.3 && msgCount <= 1;
    });
    if (silentDissenter.length > 0) {
      return {
        detected: true,
        severity: "high",
        description: `${silentDissenter.length} agent(s) dissent silently (belief far from mean, low participation)`,
        agents: silentDissenter.map(a => a.agentId),
        suggestedIntervention: {
          type: "force_reflection",
          targetAgents: silentDissenter.map(a => a.agentId),
          reason: "silent dissent — force reflection to surface hidden disagreement",
        },
      };
    }
    return { detected: false, severity: "low", description: "" };
  },
});

// ── 3. 诊断 + 干预 ──────────────────────────────────────────────
const { result, interventions } = engine.diagnoseAndIntervene(beliefs, messages, agentIds, undefined, config);

// ── 4. 输出报告 ──────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log("  SwarmAlpha 治理引擎演示");
console.log("═".repeat(60));

console.log("\n📊 群体状态:");
console.log(`   Agent 数: ${beliefs.length}`);
console.log(`   信念均值: ${(beliefs.reduce((s, b) => s + b.belief, 0) / beliefs.length).toFixed(3)}`);
console.log(`   信念标准差: ${Math.sqrt(beliefs.reduce((s, b) => s + (b.belief - beliefs.reduce((ss, bb) => ss + bb.belief, 0) / beliefs.length) ** 2, 0) / beliefs.length).toFixed(3)}`);

console.log("\n🔍 检测结果:");
for (const issue of result.otherIssues) {
  const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🟢";
  const src = issue.source === "custom" ? "[自定义]" : issue.source === "builtin" ? "[内置]" : "";
  console.log(`   ${icon} ${issue.type.padEnd(25)} ${src.padEnd(6)} ${issue.description}`);
}

console.log("\n💊 干预决策:");
if (interventions.length === 0) {
  console.log("   (无干预触发)");
} else {
  for (const iv of interventions) {
    const target = iv.targetAgentId ?? (iv.targetAgents ?? []).join(",");
    console.log(`   → ${iv.type.padEnd(20)} target=${target} reason=${iv.parameters?.reason ?? "N/A"}`);
  }
}

console.log("\n📈 治理度量:");
console.log(`   检测问题数: ${result.otherIssues.length}`);
console.log(`   干预计划数: ${interventions.length}`);
console.log(`   检测器数量: 7 内置 + 1 自定义 = 8`);
console.log(`   自适应剂量: ${config.useAdaptiveDosage ? "开" : "关"}`);
console.log(`   F 分解排序: ${config.sortingMode === "fdecomposition" ? "开" : "关"}`);

console.log("\n" + "═".repeat(60));
console.log("  ✅ 演示完成 — 纯本地运行，无需 LLM API");
console.log("═".repeat(60) + "\n");
