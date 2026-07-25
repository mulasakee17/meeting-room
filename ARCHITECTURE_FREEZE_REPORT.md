# SwarmAlpha 架构冻结报告（Architecture Freeze Report）

**角色：** 首席软件架构师
**状态：** 未通过 —— 存在严重架构问题
**日期：** 2026-07-24

---

## 第一部分：模块职责分析

当前项目存在严重的职责重叠。以下是逐一分析。

### 1.1 DiscussionEngine（`src/lib/discussion/index.ts`）

**当前职责（过度膨胀）：**
- 维护 agent 状态（`agentStates: Map<id, {belief, confidence}>`）
- 维护认知状态（`cognitiveStates: Map<id, AgentCognitiveState>`）
- 维护记忆（`memoryManager`）
- 维护影响图（`graphBuilder`）
- 维护决策轨迹（`traceBuilder`）
- 维护事件追踪（`eventTracker`）
- 维护治理 prompt 累积（`governancePrompts`）
- 维护轮次数据（`roundDataArray`）
- 维护 dropout 观测（`dropoutObservations`）
- 拥有 LLM prompt 构建逻辑（`buildPrompt`）
- 拥有信念更新逻辑（`updateBeliefs`）
- 拥有收敛检测逻辑（`checkConvergence`）
- 拥有治理逻辑（`applyGovernance`，包装 GovernanceEngine）
- 拥有认知状态更新逻辑（`updateCognitiveStatesFromRound`）
- 拥有最终的 DiscussionResult 构建逻辑
- 拥有交叉质证逻辑
- 拥有拓扑分组逻辑

**应该做的：** 仅负责编排讨论循环（observe → update → govern → record），所有状态应由 Runtime 持有。

### 1.2 AsyncDiscussionEngine（`src/lib/discussion/asyncEngine.ts`）

**当前职责（继承 DiscussionEngine 后额外增加）：**
- 继承 DiscussionEngine 的全部状态（上述所有）
- 额外维护热力学状态（`thermoHistory`、`terminationDecider`）
- 额外维护发言者追踪（`lastSpokeCycle`、`prevCycleBeliefs`）
- 额外维护 PRNG（`prng`）
- 拥有发言者选择逻辑（`selectSpeakers`、`selectSpeakersContentDriven`）
- 拥有倾听者信念更新逻辑（`updateListenerBeliefs`）—— 与父类 `updateBeliefs` 并行
- 拥有异步主循环（`runAsyncMainLoop`）

**应该做的：** 仅负责异步发言者选择 + 终止决策。其余全部委托给 Runtime。

### 1.3 GovernanceEngine（`src/lib/governance/index.ts`）

**当前职责：**
- 偏差检测（7 个检测器）
- 干预策略注册与执行
- 自适应阈值校准
- 自适应剂量计算
- 干预效果评估
- 反馈信号消费

**正确。** 这是纯计算模块，不维护 agent 状态。✓

### 1.4 GovernanceRuntime（`src/runtime/GovernanceRuntime.ts`）

**当前职责：**
- 维护自己的 `state: GovernanceRuntimeState`（包含 `agentBeliefs`、`rounds`、`issues`、`interventions`）
- 包装 GovernanceEngine
- 包装 EvaluationEngine
- 提供 `processRound()` 和 `onMessage()` API
- 拥有 `updateBeliefsFromMessages()` 逻辑

**问题：** 这是第三个维护 agent 状态的地方。与 DiscussionEngine 的 `agentStates` 和 `cognitiveStates` 是完全独立的副本。

### 1.5 EvaluationEngine（`src/lib/evaluation/index.ts`）

**当前职责：** 5 维评估（accuracy、consistency、diversity、efficiency、robustness）。纯计算。✓

### 1.6 ObservationLayer（`src/lib/observation/index.ts`）

**当前职责：** LLM prompt 构建 + 意见解析。纯函数。✓

### 1.7 实验脚本（`experiments/v2/*.ts`）

**当前职责：** 直接实例化 `DiscussionEngine` 或 `AsyncDiscussionEngine`，直接操作 agent 状态。

**问题：** 实验脚本与具体引擎实现紧耦合。没有统一的 SimulationEngine 接口。

### 1.8 重新划分后的职责

| 模块 | 新职责 | 禁止 |
|------|--------|------|
| **Runtime** | 唯一的状态持有者。维护 `S_i(t)` 对所有 agent。提供 `getState()`、`updateState()`、`observe()`、`applyGovernance()`。 | - |
| **Engine** | 编排讨论循环。调用 Runtime API。 | 禁止持有状态 |
| **Governance** | 偏差检测 + 干预计算。纯函数。 | 禁止持有状态、禁止修改 Engine |
| **Detector** | 从 Runtime 读取状态，检测问题。 | 禁止读取 belief 标量、禁止读取 Engine |
| **Observation** | LLM prompt 构建 + 输出解析。 | 禁止持有状态 |
| **Experiment** | 配置实验参数，调用统一 SimulationEngine 接口。 | 禁止直接操作状态、禁止依赖具体引擎 |

---

## 第二部分：依赖关系图

### 2.1 当前依赖图（存在循环和重复）

```
Experiment
    │
    ├──→ DiscussionEngine ──→ GovernanceEngine
    │       │                      │
    │       ├── agentStates        ├── detects on scalar belief
    │       ├── cognitiveStates    └── intervenes on scalar belief
    │       ├── memoryManager
    │       ├── graphBuilder
    │       ├── traceBuilder
    │       ├── eventTracker
    │       ├── observationLayer
    │       ├── inferenceLayer
    │       └── governancePrompts
    │
    ├──→ AsyncDiscussionEngine (extends DiscussionEngine)
    │       │
    │       ├── 继承所有父类状态
    │       ├── thermoHistory
    │       ├── terminationDecider
    │       ├── lastSpokeCycle
    │       ├── prevCycleBeliefs
    │       ├── prng
    │       └── updateListenerBeliefs (独立于父类 updateBeliefs)
    │
    └──→ GovernanceRuntime (独立运行时，不被实验脚本使用)
            │
            ├── state.agentBeliefs (第三份 agent 状态副本)
            ├── state.rounds
            ├── GovernanceEngine (第二个实例)
            └── EvaluationEngine

问题：
1. DiscussionEngine 和 AsyncDiscussionEngine 共享基类但各自维护完整状态
2. GovernanceRuntime 维护第三份状态副本
3. Experiment 直接依赖具体引擎类，而非接口
4. 所有模块都通过 scalar belief 通信
```

### 2.2 目标依赖图（严格单向）

```
Experiment
    │
    └──→ SimulationEngine (接口)
            │
            ├──→ Runtime (唯一状态持有者)
            │       │
            │       ├── S_i(t) = {U_i, E_i, I_i}  for all i
            │       ├── C_i(t), Λ_i(t)  (派生)
            │       ├── Memory (对话历史)
            │       ├── InteractionGraph
            │       └── DecisionTrace
            │
            ├──→ Observation
            │       │
            │       └──→ LLM
            │
            ├──→ Governance
            │       │
            │       ├──→ Detector (读取 Runtime)
            │       └──→ Intervention (修改 Runtime)
            │
            └──→ Evaluation
                    │
                    └──→ Runtime (只读)

依赖方向：Experiment → Engine → Runtime → {Governance, Observation, Evaluation}
所有依赖单向。无循环。
```

---

## 第三部分：Single Source of Truth 分析

### 3.1 当前违反情况

**违反点 1：agent 状态三份副本**

| 位置 | 存储形式 | 读写 |
|------|---------|------|
| `DiscussionEngine.run()` 的局部变量 `agentStates` | `Map<id, {belief, confidence}>` | 读写 |
| `DiscussionEngine.cognitiveStates` | `Map<id, AgentCognitiveState>` | 读写 |
| `GovernanceRuntime.state.agentBeliefs` | `AgentBelief[]` | 读写 |
| `agent.getState()` / `agent.setState()` | 每个 agent 对象上 | 读写 |
| `InteractionGraph.nodes[].belief` | 图节点上的标量 | 只写 |

**同一份数据在 5 个不同位置以不同格式存在。** 任何一处的更新都不会自动同步到其他位置。

**违反点 2：信念更新逻辑两份**

| 位置 | 方法 | 更新对象 |
|------|------|---------|
| `DiscussionEngine.updateBeliefs()` | 通过 InferenceLayer 计算 delta | `agentStates` Map |
| `AsyncDiscussionEngine.updateListenerBeliefs()` | 独立 DeGroot 式更新 | `agentStates` Map |
| `GovernanceRuntime.updateBeliefsFromMessages()` | 简单覆盖 | `state.agentBeliefs` |

**三种不同的更新逻辑，更新三份不同的状态副本。** 没有任何机制保证一致性。

**违反点 3：治理逻辑两条路径**

| 路径 | 触发方式 | 修改对象 |
|------|---------|---------|
| DiscussionEngine 内嵌 `governanceEngine` | `applyGovernance()` 在每轮末尾调用 | 干预直接修改 `agentBeliefs`（GovernanceState） |
| GovernanceRuntime 内嵌 `governanceEngine` | `processRound()` 调用 | 干预修改 `state.agentBeliefs` |

**DiscussionEngine 内部有一个 GovernanceEngine 实例，GovernanceRuntime 内部有另一个独立的 GovernanceEngine 实例。** 两者完全不互通。

### 3.2 修复方向

**不应直接写代码，以下是架构层面的修复方案：**

1. 创建统一的 `Runtime` 类，作为唯一的状态持有者
2. `DiscussionEngine` 和 `AsyncDiscussionEngine` 不再维护任何状态，改为从 `Runtime` 读写
3. 删除 `GovernanceRuntime`（其职责被 `Runtime` + `Governance` 替代）
4. `Governance` 变为纯函数模块，接收 `Runtime` 的快照，返回干预列表
5. `updateBeliefs` 和 `updateListenerBeliefs` 合并为 `Runtime.updateUtility()` 单一入口
6. `cognitiveStates` 合并到 `Runtime` 中，不再作为独立 Map

---

## 第四部分：Runtime API 设计

```
Runtime 是系统中唯一的状态持有者。所有状态变更必须通过 Runtime API。
```

### 4.1 Runtime 接口

```text
// =========================================================================
// 状态读取（只读，所有模块均可调用）
// =========================================================================

runtime.getAgentState(agentId) → AgentCognitiveState
  // 返回完整的认知状态：{ utility, evidence, inertia, confidence, susceptibility }

runtime.getAllAgentStates() → Map<agentId, AgentCognitiveState>

runtime.getMemory() → DiscussionMemoryEntry[]
  // 对话历史

runtime.getInteractionGraph() → InteractionGraph

runtime.getDecisionTrace() → DecisionTrace

runtime.getRoundData() → RoundData[]

// =========================================================================
// 状态写入（仅 Engine 可调用，Governance 通过干预间接调用）
// =========================================================================

runtime.initializeAgents(agents: AgentInfo[], task: DiscussionTask) → void
  // 初始化所有 agent 的认知状态

runtime.observe(agentId, rawObservation: RawObservation) → void
  // 存储一轮 LLM 观测。提取 evidence、itemBeliefs

runtime.updateDerived(agentId) → void
  // 计算派生变量：Confidence ← f(Evidence), Susceptibility ← g(Inertia, Confidence)

runtime.updateUtility(agentId, roundNumber) → void
  // 执行 DeGroot 更新：U_i(t+1) = (1-Λ_i)U_i(t) + Λ_i Σ w_ij U_j(t)

runtime.updateInertia(agentId, spokeThisRound, wasRefuted) → void
  // 更新惯性

runtime.applyIntervention(intervention: Intervention) → void
  // 应用单个干预。干预只能修改 I、E、W，不能直接修改 U。

runtime.recordRound(roundData: RoundData) → void
  // 记录本轮数据

// =========================================================================
// 兼容性导出（向后兼容旧代码）
// =========================================================================

runtime.exportCompatibility() → {
  agentStates: Map<id, {belief, confidence}>,
  // 从 cognitiveState 计算旧格式
}

runtime.exportLegacyBelief(agentId) → number
  // cognitiveStateToBelief(state)
```

### 4.2 Engine 如何使用 Runtime

```text
Engine.run(agents, task):
  runtime.initializeAgents(agents, task)
  
  for round = 1..maxRounds:
    for agent in agents:
      prompt = observation.buildPrompt(agent, runtime.getMemory(), runtime.getState(agent.id))
      response = await LLM.call(prompt)
      observation = observation.parse(response)
      runtime.observe(agent.id, observation)
    
    for agent in agents:
      runtime.updateDerived(agent.id)
      runtime.updateInertia(agent.id, spokeThisRound, wasRefuted)
      runtime.updateUtility(agent.id, round)
    
    issues = governance.detect(runtime.getAllAgentStates())
    interventions = governance.selectInterventions(issues)
    for intervention in interventions:
      runtime.applyIntervention(intervention)
    
    runtime.recordRound({...})
    
    if runtime.checkConvergence(): break
  
  return runtime.buildResult()
```

### 4.3 关键原则

- **Engine 永远不直接维护 Agent State。** 所有状态读写通过 `runtime.*`。
- **Governance 不能修改 Engine。** 只能通过 `runtime.applyIntervention()` 间接修改状态。
- **Experiment 不依赖具体 Engine。** 只依赖 `SimulationEngine` 接口。

---

## 第五部分：Governance 重新设计

### 5.1 当前问题

GovernanceEngine 当前通过 `GovernanceState` 直接读写 `agentBeliefs`（标量），并通过 `InterventionResult.stateChanges` 直接修改 belief 值。这违反了架构原则。

### 5.2 目标设计

```text
Governance 模块 = Detector 集合 + Intervention 集合

Governance 是纯计算模块：
  - 输入：从 Runtime 读取的完整状态快照
  - 输出：干预列表（不直接修改状态）

// =========================================================================
// Governance API
// =========================================================================

governance.detect(states: Map<agentId, AgentCognitiveState>) → GovernanceIssue[]
  // 检测偏差。每个检测器读取相应的状态变量。

governance.selectInterventions(issues: GovernanceIssue[]) → Intervention[]
  // 根据检测到的问题选择干预。

governance.evaluateEffects(before: StateSnapshot, after: StateSnapshot) → EffectMetrics
  // 评估干预效果。

// =========================================================================
// 干预执行流程（由 Engine 编排）
// =========================================================================

Engine:
  issues = governance.detect(runtime.getAllAgentStates())
  interventions = governance.selectInterventions(issues)
  for intervention in interventions:
    runtime.applyIntervention(intervention)  // 唯一的修改点
```

### 5.3 干预类型 → 修改目标

| 干预 | 修改 Runtime 中的 | 不修改 |
|------|-------------------|--------|
| `reduce_weight` | `InteractionGraph.edges[].weight` | Utility |
| `force_reflection` | `Inertia.strength`（降低） | Utility |
| `introduce_diversity` | `Evidence.items[]`（追加新条目） | Utility |
| `continue_discussion` | `maxRounds`（延长） | 任何 agent 状态 |

**治理绝不直接修改 Utility 或 Decision。** 干预只改变 agent 更新的条件。

---

## 第六部分：Detector 重新设计

### 6.1 当前问题

全部 7 个检测器中有 4 个（Echo Chamber、Authority Bias、Polarization、Premature Consensus）基于标量 `belief` 进行检测。它们读取的是 `AgentBelief[]`（即 `{agentId, belief, confidence}`）。

### 6.2 目标设计

```text
每个 Detector 从 Runtime 中读取特定的状态变量，而非标量 belief。

// =========================================================================
// Detector API
// =========================================================================

interface Detector {
  type: string;
  detect(states: Map<agentId, AgentCognitiveState>) → DetectionResult;
}

// =========================================================================
// 每个检测器 → 读取的状态变量
// =========================================================================

EchoChamberDetector:
  读取：Evidence.items[]  (跨 agent 比较证据 Jaccard 指数)
  不读取：belief

AuthorityBiasDetector:
  读取：InteractionGraph.edges[].weight  (Gini 系数)
  不读取：belief

PolarizationDetector:
  读取：Utility.scores  (跨 agent 的双峰系数)
  不读取：belief

PrematureConsensusDetector:
  读取：Utility.scores  (方差) + Evidence.coverage  (信息覆盖率)
  不读取：belief

InformationWithholdingDetector:  ✓ 已正确 — 读取 evidence 字段
IgnoredInputDetector:            ✓ 已正确 — 读取 referencedAgents
ReasoningActionMismatchDetector: ✓ 已正确 — 读取 itemBeliefs
```

### 6.3 关键原则

- **Detector 不能读取 belief。** 这是旧模型的概念。
- **Detector 不能读取 Engine。** 只能通过 Runtime 获取状态。
- **Detector 是纯函数。** 输入状态快照，输出检测结果。

---

## 第七部分：Experiment 重新设计

### 7.1 当前问题

```typescript
// 当前实验脚本直接依赖具体引擎
import { DiscussionEngine } from "../../src/lib/discussion";
import { AsyncDiscussionEngine } from "../../src/lib/discussion/asyncEngine";

// A 组：同步引擎
const engine = new DiscussionEngine({ ... });

// B/C/D 组：异步引擎
const engine = new AsyncDiscussionEngine({ ... });
```

**问题：** 实验脚本与具体引擎实现紧耦合。任何引擎变更都需要修改所有实验脚本。

### 7.2 目标设计

```text
// =========================================================================
// SimulationEngine 接口（统一入口）
// =========================================================================

interface SimulationEngine {
  run(agents: AgentInfo[], task: DiscussionTask, config: SimulationConfig) → Promise<SimulationResult>;
}

// =========================================================================
// 实现：内部选择同步或异步
// =========================================================================

class SimulationEngineImpl implements SimulationEngine {
  private runtime: Runtime;
  private governance: Governance;
  private observation: Observation;

  async run(agents, task, config) {
    // 根据 config.mode 选择同步或异步循环
    // 同步：每轮所有 agent 发言
    // 异步：每轮部分 agent 发言，热力学终止
    // 但无论哪种模式，都通过 Runtime 读写状态
  }
}

// =========================================================================
// 实验脚本使用
// =========================================================================

const engine = new SimulationEngineImpl();
const result = await engine.run(agents, task, {
  mode: "async",           // "sync" | "async"
  speakMode: "content_driven",
  governanceMode: "full",
  useCognitiveState: true,
  ...
});
```

### 7.3 关键原则

- **Experiment 不依赖 DiscussionEngine 或 AsyncDiscussionEngine。**
- **Experiment 只依赖 SimulationEngine 接口。**
- **SimulationEngine 内部决定同步还是异步。** 这是实现细节，不应暴露给实验层。

---

## 第八部分：架构问题清单

逐项分析当前项目中的架构问题。

### □ Duplicate State（重复状态）

**严重。** 同一份 agent 状态在以下位置重复存在：
1. `DiscussionEngine.run()` 的局部变量 `agentStates`
2. `DiscussionEngine.cognitiveStates`
3. `GovernanceRuntime.state.agentBeliefs`
4. `agent.getState()` / `agent.setState()`
5. `InteractionGraph.nodes[].belief`

**修复：** 创建统一的 `Runtime` 类，所有模块通过 `runtime.getState()` 读取，通过 `runtime.updateState()` 写入。

### □ Duplicate Update Logic（重复更新逻辑）

**严重。** 信念更新逻辑在三个地方独立实现：
1. `DiscussionEngine.updateBeliefs()` — 通过 InferenceLayer
2. `AsyncDiscussionEngine.updateListenerBeliefs()` — 独立 DeGroot 式更新
3. `GovernanceRuntime.updateBeliefsFromMessages()` — 简单覆盖

**修复：** 合并为 `Runtime.updateUtility()` 单一入口。同步和异步只是调用频率不同，更新逻辑相同。

### □ Duplicate Detector Logic（重复检测器逻辑）

**不存在。** 所有检测器在 `GovernanceEngine` 中只有一份实现。✓

### □ Duplicate Governance Logic（重复治理逻辑）

**存在。** `DiscussionEngine` 内部有一个 `GovernanceEngine` 实例，`GovernanceRuntime` 内部有另一个独立的 `GovernanceEngine` 实例。两者互不通信。

**修复：** `Governance` 只实例化一次，由 `Runtime` 持有引用。Engine 通过 `Runtime` 间接调用治理。

### □ Circular Dependency（循环依赖）

**不存在直接的循环依赖。** 但存在隐式循环：
- Engine → agentStates（修改）
- agentStates → GovernanceEngine（读取）
- GovernanceEngine → Interventions（修改 agentStates）
- 这形成了一个闭环，虽然技术上不是 import 循环

**修复：** Engine → Runtime → Governance → Runtime。Engine 不直接修改状态。

### □ Tight Coupling（紧耦合）

**严重。**
- `AsyncDiscussionEngine extends DiscussionEngine`：继承链迫使子类继承父类的全部状态和行为
- 实验脚本直接 `new DiscussionEngine()` / `new AsyncDiscussionEngine()`
- `DiscussionEngine` 直接实例化 `GovernanceEngine`、`ObservationLayer`、`InferenceLayer` 等

**修复：** 依赖注入。Engine 通过构造函数接收 Runtime、Governance、Observation 接口。

### □ Runtime Leakage（运行时泄漏）

**严重。** `DiscussionEngine` 是一个 Engine，但它表现得像一个 Runtime：
- 维护 agent 状态
- 维护记忆
- 维护图
- 维护轨迹
- 维护事件

**修复：** Engine 只负责编排循环。所有状态由 Runtime 持有。

### □ Engine 管理状态

**严重。** 当前 Engine 管理了 11 种不同的状态。这是最核心的架构问题。

**修复：** 如第四部分所示，Engine 不再管理任何状态。

### □ Experiment 直接修改状态

**存在。** 实验脚本中：
```typescript
agent.setState({ belief: ..., confidence: ... });
```
以及通过 `engine.updateAgentStates()` 间接修改 agent 状态。

**修复：** 实验脚本只能通过 `SimulationEngine.run()` 启动实验，不能直接操作 agent 状态。

---

## 第九部分：架构冻结检查清单

| # | 项目 | 状态 | 备注 |
|---|------|------|------|
| 1 | Runtime 唯一 | ☐ | 需创建统一的 Runtime 类 |
| 2 | State 唯一 | ☐ | 5 处状态副本需合并 |
| 3 | Engine 不维护状态 | ☐ | DiscussionEngine 维护 11 种状态 |
| 4 | Detector 不维护状态 | ✓ | 当前已正确 |
| 5 | Governance 不维护状态 | ☐ | GovernanceEngine 正确，但 GovernanceRuntime 维护状态 |
| 6 | Experiment 不维护状态 | ☐ | 实验脚本直接操作 agent 状态 |
| 7 | Compatibility Layer 独立 | ☐ | cognitiveStateToBelief 存在但分散 |
| 8 | Legacy Belief 已降级 | ☐ | 所有模块仍在使用标量 belief |
| 9 | 所有状态更新均经过 Runtime | ☐ | 更新分散在 3 个方法中 |
| 10 | 依赖单向无循环 | ☐ | Engine → state → Engine 形成隐式循环 |
| 11 | 无紧耦合 | ☐ | AsyncEngine extends DiscussionEngine |
| 12 | 无重复更新逻辑 | ☐ | 3 处独立更新逻辑 |
| 13 | 单一治理入口 | ☐ | 两个 GovernanceEngine 实例 |
| 14 | 单一实验入口 | ☐ | 实验脚本直接 new 具体引擎类 |

---

## 第十部分：最终裁决

### 架构冻结：未通过

当前架构存在以下阻塞性问题：

**阻塞问题 1：三重状态副本。** 同一份 agent 状态在 `DiscussionEngine.agentStates`、`DiscussionEngine.cognitiveStates`、`GovernanceRuntime.state.agentBeliefs`、`agent.getState()`、`InteractionGraph.nodes[]` 中独立维护。任何一处的更新不会同步到其他位置。这是 Single Source of Truth 的根本性违反。

**阻塞问题 2：Engine 充当 Runtime。** `DiscussionEngine` 维护 11 种状态（agentStates、cognitiveStates、memoryManager、graphBuilder、traceBuilder、eventTracker、governancePrompts、roundDataArray、dropoutObservations、crossExaminationResult、randomInterveneRng）。它既是编排器，又是状态持有者，又是治理触发器。职责完全混乱。

**阻塞问题 3：双重治理实例。** `DiscussionEngine` 内部有一个 `GovernanceEngine`，`GovernanceRuntime` 内部有另一个独立的 `GovernanceEngine`。两者互不通信。治理逻辑可能产生冲突的干预。

**阻塞问题 4：AsyncEngine 继承链导致紧耦合。** `AsyncDiscussionEngine extends DiscussionEngine` 意味着异步引擎继承了同步引擎的全部状态和方法。任何对父类的修改都可能破坏子类。异步引擎的 `updateListenerBeliefs()` 与父类的 `updateBeliefs()` 是两套独立的更新逻辑，同时对同一份 `agentStates` 进行写入。

**阻塞问题 5：实验脚本紧耦合具体引擎。** 所有实验脚本直接 `new DiscussionEngine()` 或 `new AsyncDiscussionEngine()`。不存在统一的 `SimulationEngine` 接口。

### 修复路径

1. **创建 `Runtime` 类** — 唯一的状态持有者，提供 `getState()`、`updateState()`、`applyIntervention()` API
2. **重构 `DiscussionEngine`** — 移除所有状态，改为从 Runtime 读写
3. **重构 `AsyncDiscussionEngine`** — 不再继承 DiscussionEngine，改为实现 `SimulationEngine` 接口，内部使用 Runtime
4. **删除 `GovernanceRuntime`** — 其职责被 Runtime + Governance 替代
5. **创建 `SimulationEngine` 接口** — 统一实验入口
6. **将 Governance 模块化为纯函数** — 输入 Runtime 快照，输出干预列表
7. **将所有检测器迁移到新状态空间** — 不再读取标量 belief

### 不建议进入 Async Migration

当前架构的 Dual Runtime 问题（DiscussionEngine vs AsyncEngine）是更深层架构问题的症状，而非原因。在架构冻结之前进行 Async Migration 只会加深技术债务。

**必须先完成 Architecture Freeze，再进行 Async Migration。**

### 进入 Architecture Freeze 的前提条件：

1. 创建统一的 `Runtime` 类，作为唯一状态持有者
2. `DiscussionEngine` 不再维护任何状态
3. `AsyncDiscussionEngine` 不再继承 `DiscussionEngine`
4. 删除 `GovernanceRuntime`（职责合并到 Runtime）
5. 创建 `SimulationEngine` 接口
6. 所有实验脚本改为使用 `SimulationEngine` 接口
7. 所有检测器停止读取标量 belief
8. 所有干预停止直接修改标量 belief
9. `updateBeliefs`、`updateListenerBeliefs`、`updateBeliefsFromMessages` 合并为 `Runtime.updateUtility()`
10. 建立完整的 Compatibility Layer（`runtime.exportCompatibility()`）

---

**总结：** 当前架构的核心问题是 Engine 和 Runtime 的职责混淆。DiscussionEngine 同时充当编排器、状态持有者、治理触发器、记忆管理器、图构建器、轨迹构建器、事件追踪器。AsyncDiscussionEngine 通过继承复制了全部问题，并额外引入了独立的更新逻辑。必须先完成 Architecture Freeze（统一 Runtime、分离 Engine 与 State、建立单一入口），才能进行任何后续迁移。