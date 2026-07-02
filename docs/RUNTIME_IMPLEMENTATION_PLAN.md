# SwarmAlpha V3 —— Research Runtime Implementation Plan

> 版本: 1.0  
> 更新时间: 2026-07-02  
> 状态: **IMPLEMENTATION COMPLETE** ✅  
> 核心研究问题: **How can we evaluate and govern collective decision-making in LLM-based multi-agent systems?**

---

## 目录

1. [执行策略](#1-执行策略)
2. [Phase A — Runtime Types & Interfaces](#2-phase-a--runtime-types--interfaces)
3. [Phase B — Core Runtime Infrastructure](#3-phase-b--core-runtime-infrastructure)
4. [Phase C — Scheduler & Entry Point](#4-phase-c--scheduler--entry-point)
5. [Phase D — New Module Extraction](#5-phase-d--new-module-extraction)
6. [Phase E — DiscussionEngine Refactor](#6-phase-e--discussionengine-refactor)
7. [兼容性层设计](#7-兼容性层设计)
8. [测试策略](#8-测试策略)
9. [回滚策略](#9-回滚策略)
10. [里程碑检查](#10-里程碑检查)

---

# 1. 执行策略

## 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **Bottom-Up** | 先构建独立的 Runtime 基础设施，再逐步接入现有模块 |
| **Adapter First** | 通过适配器调用现有模块，不立即修改其 API |
| **Incremental** | 每个阶段都能运行和测试，不一次性重构所有代码 |
| **Test-Driven** | 现有测试必须在每个阶段都通过 |
| **Monolith Last** | DiscussionEngine 的重构放在最后阶段 |

## 1.2 风险分析

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| DiscussionEngine 重构引入回归 | 高 | 最后阶段实施，保留兼容层 |
| 模块接口变更影响现有功能 | 中 | 使用适配器隔离 |
| 状态管理不一致 | 中 | RuntimeContext 唯一状态源 |
| 性能下降 | 低 | 保持同步执行，后续优化 |

---

# 2. Phase A — Runtime Types & Interfaces

**目标**: 定义所有 Runtime 类型，零业务逻辑

## 2.1 创建文件

| 文件 | 内容 | 依赖 |
|------|------|------|
| `src/lib/runtime/types.ts` | 所有 Runtime 类型定义（Context, Event, State, Termination, Report） | `src/lib/types.ts` |

## 2.2 类型定义清单

```typescript
// RuntimeContext
interface RuntimeContext
interface RoundContext
interface RuntimeMetrics
interface GovernanceContext
interface AgentPool
interface TimelineEntry

// Event System
interface RuntimeEvent
interface EventBus
interface Subscription

// State Machine
type RuntimeState = "idle" | "preparing" | "running" | "evaluating" | "governed" | "checking_termination" | "completed" | "failed"

// Termination
interface TerminationCondition
interface TerminationConfig
interface TerminationStrategy
interface TerminationDecision

// Report
interface ResearchReport
interface ReportMetadata
interface ReportSection
interface SectionContent
```

## 2.3 验证标准

- TypeScript 编译通过
- 无运行时依赖

---

# 3. Phase B — Core Runtime Infrastructure

**目标**: 构建无业务依赖的核心基础设施

## 3.1 创建文件

| 文件 | 内容 | 依赖 |
|------|------|------|
| `src/lib/runtime/eventBus.ts` | 事件总线实现（publish/subscribe/unsubscribe） | `runtime/types.ts` |
| `src/lib/runtime/context.ts` | RuntimeContext 管理（创建/更新/冻结） | `runtime/types.ts` |
| `src/lib/runtime/termination.ts` | 终止检查器 + 内置策略 | `runtime/types.ts` |

## 3.2 终止策略实现

| 策略 | 实现文件 | 复杂度 |
|------|----------|--------|
| `MaximumRoundsStrategy` | `termination.ts` | 低 |
| `ConsensusStableStrategy` | `termination.ts` | 中 |
| `NoStateChangeStrategy` | `termination.ts` | 中 |
| `ConfidenceConvergedStrategy` | `termination.ts` | 中 |
| `GovernanceLimitStrategy` | `termination.ts` | 低 |
| `ExperimentTimeoutStrategy` | `termination.ts` | 低 |

## 3.3 验证标准

- 单元测试通过
- 事件总线支持基本发布/订阅
- 终止检查器正确评估条件

---

# 4. Phase C — Scheduler & Entry Point

**目标**: 构建调度器和统一入口，通过适配器调用现有模块

## 4.1 创建文件

| 文件 | 内容 | 依赖 |
|------|------|------|
| `src/lib/runtime/scheduler.ts` | RuntimeScheduler 主循环 | `context.ts`, `termination.ts`, `eventBus.ts` |
| `src/lib/runtime/adapters.ts` | 适配器函数（转换 RuntimeContext -> 现有模块参数） | 现有模块 types |
| `src/lib/runtime/index.ts` | Runtime 统一出口 | 所有 runtime 模块 |

## 4.2 适配器设计

### 4.2.1 EvaluationAdapter

```typescript
// 输入: RuntimeContext
// 输出: EvaluationEngine.evaluate() 所需参数
function adaptEvaluation(context: RuntimeContext): {
  agentDecisions: AgentDecision[];
  agents: AgentInfo[];
  interactionHistory: InteractionRound[];
  finalDecision: string;
}
```

### 4.2.2 GovernanceAdapter

```typescript
// 输入: RuntimeContext
// 输出: GovernanceEngine.diagnoseAndIntervene() 所需参数
function adaptGovernance(context: RuntimeContext): {
  agentBeliefs: AgentBelief[];
  messages: MessageInfo[];
  agentIds: string[];
  interactionGraph?: InteractionGraph;
}
```

### 4.2.3 DiscussionAdapter

```typescript
// 输入: RuntimeContext
// 输出: DiscussionEngine.run() 所需参数
function adaptDiscussion(context: RuntimeContext): {
  agents: DiscussionAgent[];
  task: DiscussionTask;
}
```

## 4.3 主循环实现

```typescript
async run(context: RuntimeContext): Promise<void> {
  const terminationChecker = new TerminationChecker(context.experiment.config.termination);
  
  while (true) {
    const decision = terminationChecker.check(context);
    if (decision.shouldTerminate) {
      // 终止
      break;
    }
    
    // 执行单轮
    await this.executeRound(context);
    context.round.current++;
  }
}

private async executeRound(context: RuntimeContext): Promise<void> {
  // 通过适配器调用现有模块
  const discussionResult = await this.discussionAdapter.run(context);
  await this.updateContextFromDiscussion(context, discussionResult);
  
  const evaluationResult = await this.evaluationAdapter.evaluate(context);
  await this.updateContextFromEvaluation(context, evaluationResult);
  
  const governanceResult = await this.governanceAdapter.govern(context);
  await this.updateContextFromGovernance(context, governanceResult);
}
```

## 4.4 验证标准

- 现有测试全部通过
- 新 Runtime 能完成端到端实验
- 事件正确发布

---

# 5. Phase D — New Module Extraction

**目标**: 从 DiscussionEngine 中提取 Observation 和 Inference 层

## 5.1 创建文件

| 文件 | 内容 | 提取来源 |
|------|------|----------|
| `src/lib/observation/index.ts` | ObservationLayer | `DiscussionEngine.runRound()`, `buildPrompt()`, `parseOpinion()` |
| `src/lib/observation/types.ts` | Observation 类型 | 新定义 |
| `src/lib/inference/index.ts` | InferenceLayer | `DiscussionEngine.updateBeliefs()`, InfluenceManager, BeliefUpdateManager |
| `src/lib/inference/types.ts` | Inference 类型 | 新定义 |

## 5.2 ObservationLayer 提取

### 5.2.1 提取逻辑

| 方法 | 来源 | 说明 |
|------|------|------|
| `buildPrompt()` | DiscussionEngine | 构建 Agent 提示词 |
| `parseOpinion()` | DiscussionEngine | 解析 Agent 响应 |
| `runObservation()` | 新方法 | 执行观察流程 |

### 5.2.2 接口设计

```typescript
interface ObservationLayer {
  observe(agents: DiscussionAgent[], task: DiscussionTask, round: number, context: RuntimeContext): Promise<RawObservation[]>;
}
```

## 5.3 InferenceLayer 提取

### 5.3.1 提取逻辑

| 方法 | 来源 | 说明 |
|------|------|------|
| `applyInfluence()` | InfluenceManager | 应用影响计算 |
| `updateBelief()` | BeliefUpdateManager | 更新信念 |
| `infer()` | 新方法 | 执行推断流程 |

### 5.3.2 接口设计

```typescript
interface InferenceLayer {
  infer(observations: RawObservation[], previousState: CollectiveDecisionState, context: RuntimeContext): Promise<StateDelta[]>;
}
```

## 5.4 验证标准

- ObservationLayer 测试通过
- InferenceLayer 测试通过
- 现有 DiscussionEngine 测试仍然通过（保留旧实现）

---

# 6. Phase E — DiscussionEngine Refactor

**目标**: 拆除 DiscussionEngine 中的循环控制、治理耦合和本地状态管理

## 6.1 需要拆除的耦合

| 耦合 | 当前位置 | 解决方案 |
|------|----------|----------|
| 循环控制 | `run()` 方法 | 由 RuntimeScheduler 控制 |
| GovernanceEngine 调用 | `applyGovernance()` | 由 Runtime 调度 |
| 本地状态管理 | `agentStates`, `roundDataArray` | 使用 RuntimeContext |
| 终止判断 | `checkConvergence()` | 使用 TerminationChecker |

## 6.2 DiscussionEngine 新接口

```typescript
class DiscussionEngine {
  // 单轮执行，不再控制循环
  async executeRound(
    agents: DiscussionAgent[],
    task: DiscussionTask,
    round: number,
    context: RuntimeContext
  ): Promise<RoundResult>;
  
  // 移除 run() 方法的循环逻辑
}
```

## 6.3 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/lib/discussion/index.ts` | 移除循环控制、治理调用、本地状态 |
| `src/lib/discussion/types.ts` | 添加新接口类型 |

## 6.4 验证标准

- 所有现有测试通过
- Runtime 调度的端到端流程正常
- DiscussionEngine 不再自行调用 Governance/Evaluation

---

# 7. 兼容性层设计

## 7.1 保留的旧接口

| 接口 | 保留原因 | 兼容策略 |
|------|----------|----------|
| `DiscussionEngine.run()` | 向后兼容 | 包装新的 `executeRound()` |
| `EvaluationEngine.evaluate()` | API 稳定 | 通过适配器调用 |
| `GovernanceEngine.diagnoseAndIntervene()` | API 稳定 | 通过适配器调用 |

## 7.2 兼容层实现

```typescript
// DiscussionEngine.run() 兼容包装
async run(agents: DiscussionAgent[], task: DiscussionTask): Promise<DiscussionResult> {
  // 创建临时 RuntimeContext
  const context = createTemporaryContext(agents, task);
  
  // 使用新的 RuntimeScheduler 执行
  await runtimeScheduler.run(context);
  
  // 转换回旧的 DiscussionResult 格式
  return convertToDiscussionResult(context);
}
```

---

# 8. 测试策略

## 8.1 测试优先级

| 优先级 | 测试类型 | 说明 |
|--------|----------|------|
| P0 | 现有单元测试 | 必须全部通过 |
| P0 | Runtime 集成测试 | 端到端流程验证 |
| P1 | 事件系统测试 | 事件发布/订阅正确性 |
| P1 | 终止策略测试 | 各策略独立验证 |
| P2 | 性能测试 | 基准对比 |

## 8.2 测试命令

```bash
npm run test          # 运行所有测试
npm run test -- --run # 运行特定测试
```

---

# 9. 回滚策略

## 9.1 每个阶段的回滚

| 阶段 | 回滚方式 | 影响 |
|------|----------|------|
| Phase A | 删除新类型文件 | 无影响 |
| Phase B | 删除基础设施文件 | 无影响 |
| Phase C | 移除 Scheduler，恢复直接调用 | 小影响 |
| Phase D | 保留旧实现，移除新模块 | 小影响 |
| Phase E | 恢复原始 DiscussionEngine | 中等影响 |

## 9.2 紧急回滚

```bash
git checkout -- src/lib/discussion/
git checkout -- src/lib/evaluation/
git checkout -- src/lib/governance/
```

---

# 10. 里程碑检查

## 10.1 阶段完成标准

| 阶段 | 完成条件 |
|------|----------|
| Phase A | TypeScript 编译通过，所有类型定义完成 |
| Phase B | EventBus、Context、Termination 单元测试通过 |
| Phase C | 端到端实验运行成功，现有测试通过 |
| Phase D | ObservationLayer、InferenceLayer 测试通过 |
| Phase E | DiscussionEngine 重构完成，所有测试通过 |

## 10.2 最终验收标准

| 标准 | 验证方法 |
|------|----------|
| Single Entry | 代码审查：只有 `ResearchRuntime` 作为入口 |
| Single Scheduler | 代码审查：只有 `RuntimeScheduler` 控制流程 |
| State Driven | 代码审查：所有状态在 `RuntimeContext` |
| Event Driven | 测试：事件正确发布和订阅 |
| Plugin Friendly | 测试：终止策略可扩展 |
| Replayable | 测试：状态快照可恢复 |
| Deterministic | 测试：相同输入产生相同输出 |

---

> **下一阶段：开始 Phase A — Runtime Types & Interfaces**
