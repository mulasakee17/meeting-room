# SwarmAlpha 集成指南

> **目标读者**：希望把 SwarmAlpha 治理运行时（governance runtime）嵌入到自己的多 Agent 系统中的开发者。
>
> **入口模块**：`src/runtime/index.ts` —— 所有公共 API 从此处导出。

---

## 1. 架构概览

SwarmAlpha 把"治理"从"执行"中剥离出来，作为一个**框架无关**的运行时，可以嵌入到任何多 Agent 框架（AutoGen / CrewAI / LangGraph / 自研框架）之上。

```
┌────────────────────────────────────────────────────────────┐
│  你的多 Agent 框架（AutoGen / CrewAI / 自研）                  │
│  - agent 生命周期                                            │
│  - 消息路由                                                  │
│  - LLM 调用                                                  │
└───────────────┬────────────────────────────────────────────┘
                │  FrameworkMessage[]   ▲  Intervention[]
                │  (adapter.adaptMsg)   │  (adapter.applyIntervention)
                ▼                       │
┌────────────────────────────────────────────────────────────┐
│  GovernanceBridge (CustomAdapter / StateInferenceBridge)    │
└───────────────┬────────────────────────────────────────────┘
                │  DiscussionMessage[]   ▲  GovernanceRoundResult
                ▼                       │
┌────────────────────────────────────────────────────────────┐
│  GovernanceRuntime                                          │
│   processRound() → 检测偏误 → 应用干预 → 返回结果            │
│   evaluate() / getSessionResult() → 5 维决策质量评估         │
└────────────────────────────────────────────────────────────┘
```

**核心契约**：
- 输入：`DiscussionMessage[]`（含 `agentId / content / belief / confidence / roundNumber` 等字段）
- 输出：`GovernanceRoundResult`（含检测到的偏误 `issues[]` 和干预 `interventions[]`）
- 宿主框架负责**执行**干预（修改 agent 状态、注入 prompt、降低权重等），运行时只做**决策**。

---

## 2. 三种集成路径

### 路径 A：SDK 直接接入（推荐用于自研框架）

宿主框架自己管理 agent，每轮把消息打包成 `FrameworkMessage[]`，通过 `CustomAdapter` 转成 `DiscussionMessage[]`，喂给 `GovernanceRuntime.processRound()`。

**适用场景**：你的 agent 已经在内部跟踪 `belief` / `confidence`（或可以派生）。

```typescript
import { GovernanceRuntime, CustomAdapter } from "@/runtime";

const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",          // "none" | "detect-only" | "random-intervene" | "full"
  seed: 42,                         // 可复现性 seed
});

const adapter = new CustomAdapter();

// 每轮：
const rawMessages = agents.map(a => ({
  agentId: a.id,
  agentName: a.name,
  agentRole: a.role,
  content: a.lastMessage,
  belief: a.belief,                 // ← 你的 agent 必须提供
  confidence: a.confidence,         // ← 你的 agent 必须提供
  timestamp: new Date().toISOString(),
  metadata: { referencedAgents: a.mentionedPeers },
}));

const messages = adapter.adaptMessages(rawMessages, roundNumber);
const result = runtime.processRound(messages);

if (result.hasIntervention) {
  for (const intv of result.interventions) {
    await adapter.applyIntervention(intv, { agents });  // agents 须实现 getState/setState
  }
}

// 最后：评估决策质量
const sessionResult = runtime.getSessionResult(finalDecisionText);
console.log(sessionResult.evaluation.overallScore);   // 0-100
console.log(sessionResult.evaluation.grade);           // "excellent" | "good" | "fair" | "poor" | "critical"
```

### 路径 B：StateInferenceBridge（推荐用于外部框架）

AutoGen / CrewAI / LangGraph 等 framework 的 agent 消息**不含** `belief` / `confidence` 字段。`StateInferenceBridge` 用三级策略补全：

1. **显式字段**：`FrameworkMessage` 自带 `belief` / `confidence` → 直接使用
2. **`[GOV]` 标签**：agent 发言末尾包含 `[GOV]{...}` JSON → 解析提取（需在 agent system prompt 末尾追加 `buildGovernanceExtension(itemNames)`）
3. **默认值**：以上都失败 → `belief=0, confidence=50`

所有干预类型统一转成 **prompt 文本**返回，宿主框架只需把 prompt 追加到下一轮 agent 输入，**无需修改 agent 内部状态**。

```typescript
import { GovernanceRuntime, StateInferenceBridge, buildGovernanceExtension } from "@/runtime";

const bridge = new StateInferenceBridge({
  llmConfig: { provider: "deepseek", model: "deepseek-chat", temperature: 0.3 },
  custom: { itemNames: ["方案A", "方案B", "方案C"] },
});

// 1. 把 extension 追加到你的框架 agent 的 system prompt 末尾
const extension = buildGovernanceExtension(["方案A", "方案B", "方案C"]);
// yourAgent.systemPrompt += extension;

// 2. 把框架消息转成治理引擎能消费的格式
const messages = bridge.adaptMessages(rawAutoGenMessages, roundNumber);

// 3. 喂给治理运行时
const result = runtime.processRound(messages);

// 4. 把干预转成 prompt 注入回框架
if (result.hasIntervention) {
  for (const intv of result.interventions) {
    await bridge.applyIntervention(intv, { agentIds: ["a1","a2","a3"] });
  }
}
```

### 路径 C：DiscussionEngine 嵌入式（最高集成度）

把 `GovernanceRuntime` 作为 `DiscussionEngine` 的构造参数传入，`DiscussionEngine` 会在每轮讨论时**自动**调用 `runtime.processRound()`（见 `src/lib/discussion/index.ts:1036`）。

**适用场景**：使用 SwarmAlpha 自带的讨论引擎（含异步发言、热力学终止、DeGroot 信念更新）作为执行层。

```typescript
import { DiscussionEngine } from "@/lib/discussion";
import { GovernanceRuntime } from "@/runtime";

const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",
});

const engine = new DiscussionEngine(
  {
    maxRounds: 5,
    convergenceThreshold: 0.15,
    seed: 42,
  },
  runtime,                          // ← 第二个参数：传入 runtime
);

// engine.run() 内部会自动调用 runtime.processRound() 并应用干预
const result = await engine.run(agents, taskObj);
```

> **注意**：路径 C 是项目实验脚本 (`experiments/v2/run.ts`) 使用的方式，集成度最高但耦合也最强。如果你不需要 `DiscussionEngine` 的异步发言/热力学终止等功能，推荐用路径 A 或 B。

---

## 3. GovernanceRuntime 公共 API

完整定义见 `src/runtime/GovernanceRuntime.ts`。

### 3.1 构造与配置

```typescript
new GovernanceRuntime(config?: Partial<RuntimeConfig>)
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxRounds` | `number` | `5` | 最大讨论轮数 |
| `governanceMode` | `"none" \| "detect-only" \| "random-intervene" \| "full"` | `"full"` | 治理模式 |
| `governanceConfig` | `GovernanceConfig` | 见下 | 偏误检测开关与干预级别 |
| `enableAdaptiveThresholds` | `boolean` | `false` | 第一轮后自动校准阈值 |
| `enableAdaptiveDosage` | `boolean` | `false` | 基于历史效果自适应干预强度 |
| `seed` | `number` | `42` | PRNG 种子，保证 `random-intervene` 等可复现 |

`governanceConfig` 默认开启全部 4 类偏误检测（Echo Chamber / Authority Bias / Polarization / Premature Consensus），干预级别 `medium`。

### 3.2 核心方法

| 方法 | 说明 |
|------|------|
| `processRound(messages: DiscussionMessage[]): GovernanceRoundResult` | **主入口**：处理一轮讨论，返回检测到的偏误和干预 |
| `onMessage(message: DiscussionMessage): void` | 流式/增量处理单条消息（轻量检测） |
| `evaluate(decisions, agents, history, finalDecision): EvaluationResult` | 调用 5 维评估引擎，必须传完整 decisions/agents/history |
| `evaluateFromState(finalDecision: string): EvaluationResult` | 便捷方法：从 runtime 累积的状态构建评估输入 |
| `getSessionResult(finalDecision: string): GovernanceSessionResult` | 完整会话结果：评估 + 治理诊断 + 时间线 + 汇总 |
| `getState(): GovernanceRuntimeState` | 当前运行时状态（用于可观测性/调试） |
| `isActive(): boolean` | 是否仍在 `maxRounds` 内 |
| `finish(): void` | 标记讨论结束 |
| `reset(): void` | **重置所有状态**（包括 `GovernanceEngine` 内部缓存），用于新会话 |
| `configure(config: Partial<RuntimeConfig>): void` | 运行时更新配置 |

### 3.3 事件钩子

```typescript
runtime.onBiasDetected((event) => {
  console.log(`[Round ${event.roundNumber}] 检测到 ${event.biasType} (${event.severity})`);
  console.log(`  涉及 agent: ${event.agents.join(", ")}`);
});

runtime.onIntervention((event) => {
  console.log(`[Round ${event.roundNumber}] 应用干预: ${event.intervention.type}`);
  console.log(`  效果指标:`, event.effectMetrics);
});

runtime.onRoundComplete((event) => {
  console.log(`[Round ${event.roundNumber}] 完成，converged=${event.converged}`);
});
```

### 3.4 治理模式说明

| 模式 | 检测 | 干预 | 用途 |
|------|:----:|:----:|------|
| `none` | ❌ | ❌ | 基线对照（无治理） |
| `detect-only` | ✅ | ❌ | 只测量偏误，不干预 |
| `random-intervene` | ✅ | ✅ 随机 | 随机干预对照（验证治理效果是否来自**精准**干预而非干预本身） |
| `full` | ✅ | ✅ 精准 | 完整治理（默认） |

### 3.5 返回结构

```typescript
interface GovernanceRoundResult {
  roundNumber: number;
  issues: Array<{
    type: string;            // "echo_chamber" | "authority_bias" | "polarization" | "premature_consensus"
    severity: "low" | "medium" | "high";
    description: string;
    agents?: string[];
  }>;
  interventions: Intervention[];   // 4 种类型：reduce_weight / introduce_diversity / force_reflection / continue_discussion
  hasIntervention: boolean;
  effectMetrics?: Record<string, number>;   // 包含 "belief_diversity_change" 等
}
```

---

## 4. DiscussionMessage 契约

`GovernanceRuntime.processRound()` 接收的消息必须符合 `DiscussionMessage` 接口（`src/runtime/types.ts:23`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `agentId` | `string` | ✅ | 唯一 agent 标识 |
| `agentName` | `string` | ✅ | 显示名 |
| `agentRole` | `string` | ✅ | 角色（如 "Expert", "Critic"） |
| `content` | `string` | ✅ | 消息文本（自然语言） |
| `belief` | `number` | ✅ | 当前信念值 `[-1, 1]` |
| `confidence` | `number` | ✅ | 置信度 `[0, 100]` |
| `timestamp` | `string` | ✅ | ISO 8601 时间戳 |
| `roundNumber` | `number` | ✅ | 轮次编号（1-indexed） |
| `referencedAgents` | `string[]` | ❌ | 本消息引用的其他 agent ID（用于构建交互图） |
| `reasoning` | `string` | ❌ | 推理/证据文本 |

> **路径 A 提示**：如果你用 `CustomAdapter.adaptMessages()`，输入只需 `FrameworkMessage` 格式，`belief` / `confidence` / `referencedAgents` 都是可选的（缺失时用默认值）。

---

## 5. CustomAgent 接入

SwarmAlpha 自带的 `CustomAgent`（`src/lib/adapters/custom.ts:36`）实现了完整的 agent 生命周期，可直接用于路径 C 或独立使用。

### 5.1 构造

```typescript
import { CustomAgent } from "@/lib/adapters/custom";
import type { LLMConfig } from "@/lib/llm/providers";

const llmConfig: LLMConfig = {
  provider: "deepseek",              // "openai" | "anthropic" | "deepseek" | "zhipu" | "local"
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  temperature: 0.3,
  seed: 42,                          // 可复现性
};

const agent = new CustomAgent(
  "a1",                              // id
  "李专家",                           // name
  "Expert",                          // role: Expert | Analyst | Critic | Synthesizer | Visionary
  "default",                         // type
  llmConfig,
  customSystemPrompt,                // 可选：覆盖默认 system prompt
);
```

### 5.2 核心 API

| 方法 | 说明 |
|------|------|
| `sendMessage(message: string): Promise<string>` | 调用 LLM，返回原始输出（V2 保留 rawContent 以便下游解析 itemBeliefs） |
| `getState(): AgentState` | 返回 `{ agentId, belief, confidence, reasoning, lastMessage }` |
| `setState({ belief, confidence })` | 修改 agent 内部状态（被 `CustomAdapter.applyIntervention` 用于应用干预） |
| `getUsageStats(): AgentUsageStats` | 返回 token 用量与延迟统计（`promptTokens / completionTokens / totalLatencyMs / callCount / latencies[]`） |

### 5.3 LLM 输出格式约束

`CustomAgent` 默认 system prompt 要求 LLM 返回 JSON：

```json
{"emotion": 60, "reasoning": "基于...分析，我认为..."}
```

**实验场景**（`experiments/v2/run.ts:200`）追加的 JSON 格式约束包含 `itemBeliefs` 字段：

```json
{
  "reasoning": "...",
  "evidence": ["证据1", "证据2"],
  "belief": -1到1,
  "confidence": 0到100,
  "nextOpinion": "...",
  "referencedAgents": ["a2"],
  "itemBeliefs": [
    {"item": "方案A", "rank": 3, "belief": -0.5, "confidence": 85},
    ...
  ]
}
```

`itemBeliefs` 是实验分析阶段提取排名的核心字段（项目硬约束之一）。

### 5.4 Token 用量追踪

`CustomAgent` 在每次 `sendMessage` 调用后自动累积 token 用量和延迟：

```typescript
const stats = agent.getUsageStats();
// {
//   promptTokens: 12500,
//   completionTokens: 3200,
//   totalTokens: 15700,
//   totalLatencyMs: 45000,
//   callCount: 5,
//   latencies: [8000, 9200, 8800, 9100, 9900]
// }
```

实验脚本在会话结束时收集所有 agent 的 `getUsageStats()`，保存到 JSON 文件的 `tokenUsage.byAgent` 和 `tokenUsage.total` 字段。

---

## 6. LLM 提供商配置

`src/lib/llm/providers.ts` 支持以下 provider：

| Provider | 模型示例 | API Key 环境变量 |
|----------|----------|---------------------|
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| `anthropic` | `claude-3-5-sonnet` | `ANTHROPIC_API_KEY` |
| `zhipu` | `glm-4` | `ZHIPU_API_KEY` |
| `local` | 本地模型 | （无需 key） |

`callLLM()` 自带 3 次重试与指数退避（限流错误用 10s/20s/30s 退避，其他可重试错误用 2s/4s/6s）。

---

## 7. 5 分钟最小示例

以下示例演示路径 A 的完整流程：5 个 agent 讨论 3 个方案，3 轮，完整治理。

```typescript
import { GovernanceRuntime, CustomAdapter } from "@/runtime";
import { CustomAgent } from "@/lib/adapters/custom";
import type { LLMConfig } from "@/lib/llm/providers";

// 1. 创建 runtime 和 adapter
const runtime = new GovernanceRuntime({
  maxRounds: 3,
  governanceMode: "full",
  seed: 42,
});
const adapter = new CustomAdapter();

// 2. 创建 5 个 agent
const llmConfig: LLMConfig = {
  provider: "deepseek",
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  temperature: 0.3,
  seed: 42,
};

const agentSpecs = [
  { id: "a1", name: "李专家", role: "Expert" },
  { id: "a2", name: "王分析师", role: "Analyst" },
  { id: "a3", name: "张批判者", role: "Critic" },
  { id: "a4", name: "刘综合者", role: "Synthesizer" },
  { id: "a5", name: "陈远见者", role: "Visionary" },
];

const agents = agentSpecs.map(s =>
  new CustomAgent(s.id, s.name, s.role, "default", llmConfig)
);

// 3. 注册事件钩子（可选）
runtime.onBiasDetected(e =>
  console.log(`  ⚠️ [R${e.roundNumber}] ${e.biasType} (${e.severity}) → ${e.agents.join(", ")}`)
);
runtime.onIntervention(e =>
  console.log(`  🔧 [R${e.roundNumber}] 应用 ${e.intervention.type}`)
);

// 4. 运行 3 轮讨论
const taskPrompt = "评估以下三个投资方案的风险等级：方案A、方案B、方案C。";

for (let round = 1; round <= 3; round++) {
  console.log(`\n=== Round ${round} ===`);

  // 每个 agent 发言
  const rawMessages = [];
  for (const agent of agents) {
    const content = await agent.sendMessage(taskPrompt);
    rawMessages.push({
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      content,
      belief: agent.getState().belief,
      confidence: agent.getState().confidence,
      timestamp: new Date().toISOString(),
    });
  }

  // 喂给治理运行时
  const messages = adapter.adaptMessages(rawMessages, round);
  const result = runtime.processRound(messages);

  // 应用干预
  if (result.hasIntervention) {
    for (const intv of result.interventions) {
      await adapter.applyIntervention(intv, { agents });
    }
  }
}

// 5. 评估决策质量
const finalDecision = "方案B风险最低，方案A次之，方案C最高。";
const sessionResult = runtime.getSessionResult(finalDecision);

console.log("\n=== 评估结果 ===");
console.log(`总分: ${sessionResult.evaluation.overallScore}/100`);
console.log(`等级: ${sessionResult.evaluation.grade}`);
console.log(`5 维分数:`, sessionResult.evaluation.dimensionScores);
console.log(`总干预次数: ${sessionResult.totalInterventions}`);

// 6. Token 用量
console.log("\n=== Token 用量 ===");
for (const agent of agents) {
  const stats = agent.getUsageStats();
  console.log(`${agent.name}: ${stats.totalTokens} tokens, ${stats.callCount} 次调用, ${stats.totalLatencyMs}ms`);
}
```

---

## 8. 关键设计约束

集成时必须遵守以下项目硬约束（来自 `LIMITATIONS.md` 和 `project_memory.md`）：

1. **PRNG 可复现性**：所有随机性必须走 `mulberry32(seed)`，不能直接用 `Math.random()`。`GovernanceRuntime` 构造时传入 `seed`，内部 `random-intervene` 模式已使用持久 PRNG（`GovernanceRuntime.ts:121`）。
2. **干预效果评估无偏性**：用 `belief_diversity_change`（std 变化）作为通用效果指标，而非"belief 上升=改善"。`reduce_weight` 类干预期望压制主导 agent，其 belief 下降本应是改善，但旧启发式会误判为恶化（`GovernanceRuntime.ts:380-401`）。
3. **`reset()` 必须彻底**：`GovernanceRuntime.reset()` 会清空 `governancePrompts / agentKnowledge / eventTracker / roundDataArray / dropoutObservations`，防止跨实验状态泄漏。每个新会话开始前必须调用。
4. **JSON 解析安全**：从 agent 输出解析 JSON 必须用 `safeJsonParse`（`src/lib/utils/jsonUtils.ts`），不能用原生 `JSON.parse`——`PromptInjector` 曾有 `[GOV]` 标签伪造漏洞。
5. **实验文件不可修改**：已有的 220 个实验 JSON 文件存储**原始对话文本**，不是提取后的排名。提取逻辑变更不能影响这些文件。

---

## 9. 常见问题

### Q1: 我的框架没有 `belief` / `confidence` 字段怎么办？

→ 用 **路径 B（StateInferenceBridge）**。它在 agent system prompt 末尾追加 `[GOV]` 标签约束，从 agent 输出中自动解析。所有干预转成 prompt 注入，无需修改 agent 内部状态。

### Q2: 5 维评估器的权重能改吗？

可以。`EvaluationEngine.computeOverall()` 接受任意 `weights` 参数（`src/lib/evaluation/index.ts:715-737`）。

**但**：项目已做等权稳健性检查（`experiments/v2/weight_robustness.ts`），结论是**权重选择不影响消融组间横向排名**（4 数据集 / 17 消融组 / 100% 排名一致 / 0 等级变化）。当前权重 `(0.20/0.25/0.20/0.17/0.18)` 已验证稳健，详见 `LIMITATIONS.md §6`。

### Q3: `random-intervene` 模式有什么用？

它是**对照实验**：验证治理效果是否来自**精准**干预，而非"任何干预都有效"的混淆。如果 `full` 模式显著优于 `random-intervene`，说明治理决策本身（偏误检测 + 精准定位）是真因。

### Q4: 如何扩展新的偏误检测器？

在 `src/lib/governance/` 下实现新的 detector，注册到 `GovernanceEngine`。`GovernanceRuntime` 会自动调用 `GovernanceEngine.diagnoseAndIntervene()`，无需修改 runtime 本身。

### Q5: 路径 C 嵌入式和路径 A SDK 的区别？

| 维度 | 路径 A (SDK) | 路径 C (嵌入式) |
|------|:------------:|:---------------:|
| 执行循环归属 | 你的框架 | `DiscussionEngine` |
| 异步发言 | ❌ | ✅ |
| 热力学终止决策 | ❌ | ✅ |
| DeGroot 信念更新 | ❌ | ✅ |
| 集成复杂度 | 低 | 中 |
| 耦合度 | 低 | 高 |

路径 C 提供 `DiscussionEngine` 的全部高级功能（异步发言意愿评分、热力学 R/T/H/F 终止、被动倾听信念更新），但要求你使用 SwarmAlpha 的讨论循环而非自己的。

---

## 10. 参考文件

| 文件 | 说明 |
|------|------|
| `src/runtime/index.ts` | 公共 API 入口 |
| `src/runtime/GovernanceRuntime.ts` | 运行时核心实现 |
| `src/runtime/types.ts` | 类型定义（`DiscussionMessage`, `RuntimeConfig`, etc.） |
| `src/runtime/adapters/CustomAdapter.ts` | 自研框架桥接器 |
| `src/runtime/adapters/StateInferenceBridge.ts` | 外部框架通用桥接器 |
| `src/runtime/adapters/AutoGenAdapter.ts` | Microsoft AutoGen 桥接器 |
| `src/runtime/adapters/PromptInjector.ts` | 干预 → prompt 转换工具 |
| `src/lib/adapters/custom.ts` | `CustomAgent` 实现 |
| `src/lib/llm/providers.ts` | LLM provider 实现 |
| `src/lib/evaluation/index.ts` | 5 维评估引擎 |
| `src/lib/governance/` | 偏误检测与干预引擎 |
| `src/lib/discussion/index.ts` | `DiscussionEngine`（路径 C 执行层） |
| `experiments/v2/run.ts` | 完整实验脚本示例（路径 C 用法） |
