# SwarmAlpha V3 —— Research Runtime Design

> 版本: 1.0  
> 更新时间: 2026-07-02  
> 状态: Research Design  
> 核心研究问题: **How can we evaluate and govern collective decision-making in LLM-based multi-agent systems?**

---

## 目录

1. [System Lifecycle Design](#1-system-lifecycle-design)
2. [Runtime State Machine](#2-runtime-state-machine)
3. [Runtime Scheduler](#3-runtime-scheduler)
4. [Event System Design](#4-event-system-design)
5. [Runtime Context Design](#5-runtime-context-design)
6. [Termination Strategy](#6-termination-strategy)
7. [Research Report Pipeline](#7-research-report-pipeline)
8. [Architecture Refactor Proposal](#8-architecture-refactor-proposal)

---

# 1. System Lifecycle Design

## 1.1 完整生命周期流程

```
Task Submission
    ↓
Experiment Creation
    ↓
Session Initialization
    ↓
Agent Initialization
    ↓
[ MAIN LOOP ]
    ↓
Discussion Execution
    ↓
Observation
    ↓
Inference
    ↓
Collective Decision State Update
    ↓
Evaluation
    ↓
Governance
    ↓
Termination Check
    ↓
Continue? → Yes → Discussion Execution
         ↓ No
    Termination
    ↓
Research Report Generation
```

## 1.2 各阶段详细设计

### Stage 1: Task Submission

| 属性 | 说明 |
|------|------|
| **Purpose** | 接收外部任务输入，验证格式，生成任务标识 |
| **Input** | `TaskRequest` (description, type, content, context, config) |
| **Output** | `Task` (id, status="submitted", metadata) |
| **Transition Condition** | Task 验证通过 |
| **Failure Handling** | 验证失败返回错误，任务拒绝 |

```typescript
interface TaskRequest {
  description: string;
  type: string;
  content: string | Record<string, unknown>;
  context?: string;
  config?: ExperimentConfig;
}

interface Task {
  id: string;
  description: string;
  type: string;
  content: string | Record<string, unknown>;
  context?: string;
  status: "submitted" | "processing" | "completed" | "failed";
  createdAt: string;
  metadata: Record<string, unknown>;
}
```

### Stage 2: Experiment Creation

| 属性 | 说明 |
|------|------|
| **Purpose** | 创建实验配置，初始化实验资源 |
| **Input** | `Task`, `ExperimentConfig` |
| **Output** | `Experiment` (id, taskId, config, status) |
| **Transition Condition** | 配置验证通过，资源分配成功 |
| **Failure Handling** | 配置错误返回，资源不足返回 |

```typescript
interface ExperimentConfig {
  maxRounds: number;
  agentCount: number;
  agentTypes: string[];
  beliefUpdateStrategy: string;
  influenceStrategy: string;
  memoryStrategy: string;
  terminationConditions: TerminationCondition[];
  evaluationConfig: EvaluationConfig;
  governanceConfig: GovernanceConfig;
}

interface Experiment {
  id: string;
  taskId: string;
  config: ExperimentConfig;
  status: "created" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

### Stage 3: Session Initialization

| 属性 | 说明 |
|------|------|
| **Purpose** | 初始化运行时会话，建立上下文环境 |
| **Input** | `Experiment` |
| **Output** | `Session` (id, experimentId, runtimeContext) |
| **Transition Condition** | 上下文初始化完成 |
| **Failure Handling** | 上下文初始化失败，实验置为 failed |

```typescript
interface Session {
  id: string;
  experimentId: string;
  runtimeContext: RuntimeContext;
  status: "initialized" | "running" | "completed" | "failed";
  startTime: string;
}
```

### Stage 4: Agent Initialization

| 属性 | 说明 |
|------|------|
| **Purpose** | 创建 Agent 实例，初始化 Agent 状态 |
| **Input** | `Session`, `AgentConfig[]` |
| **Output** | `Agent[]` with initial beliefs/confidence |
| **Transition Condition** | 所有 Agent 初始化完成 |
| **Failure Handling** | Agent 创建失败，回滚并标记错误 |

### Stage 5: Discussion Execution

| 属性 | 说明 |
|------|------|
| **Purpose** | 执行单轮讨论，收集所有 Agent 观点 |
| **Input** | `Session`, `Agent[]`, `roundNumber` |
| **Output** | `RoundResult` (opinions, timestamp, converged) |
| **Transition Condition** | 所有 Agent 响应完成 |
| **Failure Handling** | 部分 Agent 失败重试，全部失败则终止 |

### Stage 6: Observation

| 属性 | 说明 |
|------|------|
| **Purpose** | 提取和记录 Agent 原始输出 |
| **Input** | `RoundResult` |
| **Output** | `RawObservation[]` |
| **Transition Condition** | 观察完成 |
| **Failure Handling** | 观察失败不影响主流程，记录警告 |

### Stage 7: Inference

| 属性 | 说明 |
|------|------|
| **Purpose** | 从观察结果推断状态变化 |
| **Input** | `RawObservation[]`, `PreviousState` |
| **Output** | `StateDelta[]` |
| **Transition Condition** | 推断完成 |
| **Failure Handling** | 推断失败使用默认值，记录警告 |

### Stage 8: Collective Decision State Update

| 属性 | 说明 |
|------|------|
| **Purpose** | 更新集体决策状态 |
| **Input** | `StateDelta[]` |
| **Output** | `UpdatedState` |
| **Transition Condition** | 状态更新完成 |
| **Failure Handling** | 状态更新失败回滚到上一轮状态 |

### Stage 9: Evaluation

| 属性 | 说明 |
|------|------|
| **Purpose** | 评估当前状态质量 |
| **Input** | `CollectiveDecisionState` |
| **Output** | `EvaluationResult` |
| **Transition Condition** | 评估完成 |
| **Failure Handling** | 评估失败使用缓存值，记录警告 |

### Stage 10: Governance

| 属性 | 说明 |
|------|------|
| **Purpose** | 检测问题并执行干预 |
| **Input** | `CollectiveDecisionState`, `EvaluationResult` |
| **Output** | `GovernanceResult` (issues, interventions) |
| **Transition Condition** | 治理完成 |
| **Failure Handling** | 治理失败跳过干预，记录错误 |

### Stage 11: Termination Check

| 属性 | 说明 |
|------|------|
| **Purpose** | 判断是否终止讨论 |
| **Input** | `CollectiveDecisionState`, `TerminationConditions` |
| **Output** | `TerminationDecision` (shouldTerminate, reason) |
| **Transition Condition** | 决策完成 |
| **Failure Handling** | 检查失败默认继续 |

### Stage 12: Termination

| 属性 | 说明 |
|------|------|
| **Purpose** | 终止实验，清理资源 |
| **Input** | `TerminationDecision` |
| **Output** | `TerminationResult` |
| **Transition Condition** | 资源清理完成 |
| **Failure Handling** | 资源清理失败记录错误但继续 |

### Stage 13: Research Report Generation

| 属性 | 说明 |
|------|------|
| **Purpose** | 生成结构化科研报告 |
| **Input** | `Experiment`, `CollectiveDecisionState`, `DecisionTrace` |
| **Output** | `ResearchReport` |
| **Transition Condition** | 报告生成完成 |
| **Failure Handling** | 报告生成失败返回基础结果 |

---

# 2. Runtime State Machine

## 2.1 状态定义

```
Idle → Preparing → Running → Evaluating → Governed → CheckingTermination → Completed
           ↓              ↓            ↓          ↓                      ↓
           └──────────────┴────────────┴──────────┴──────────────────────┘
                                              ↓
                                          Failed
```

## 2.2 状态转换表

| 当前状态 | 事件 | 下一状态 | 条件 |
|----------|------|----------|------|
| `Idle` | `TaskSubmitted` | `Preparing` | Task 验证通过 |
| `Idle` | `TaskSubmitted` | `Failed` | Task 验证失败 |
| `Preparing` | `ResourcesAllocated` | `Running` | 资源分配成功 |
| `Preparing` | `ResourceError` | `Failed` | 资源分配失败 |
| `Running` | `RoundCompleted` | `Evaluating` | 单轮讨论完成 |
| `Running` | `AgentError` | `Failed` | Agent 执行失败 |
| `Evaluating` | `EvaluationCompleted` | `Governed` | 评估完成 |
| `Evaluating` | `EvaluationFailed` | `Governed` | 评估失败，使用缓存 |
| `Governed` | `GovernanceCompleted` | `CheckingTermination` | 治理完成 |
| `Governed` | `GovernanceFailed` | `CheckingTermination` | 治理失败，跳过 |
| `CheckingTermination` | `ShouldContinue` | `Running` | 未达到终止条件 |
| `CheckingTermination` | `ShouldTerminate` | `Completed` | 达到终止条件 |
| `CheckingTermination` | `TerminationError` | `Running` | 终止检查失败，继续 |
| `Completed` | `ReportGenerated` | `Idle` | 报告生成完成 |
| `Failed` | `RetryRequested` | `Preparing` | 请求重试 |
| `Failed` | `CleanupCompleted` | `Idle` | 清理完成 |

## 2.3 状态详细说明

### Idle

| 属性 | 说明 |
|------|------|
| **描述** | 系统空闲，等待任务 |
| **可执行操作** | `submitTask()` |
| **进入条件** | 系统启动或前一任务完成 |
| **退出条件** | 收到 `TaskSubmitted` 事件 |

### Preparing

| 属性 | 说明 |
|------|------|
| **描述** | 实验准备中，分配资源 |
| **可执行操作** | `createExperiment()`, `initializeSession()`, `createAgents()` |
| **进入条件** | Task 验证通过 |
| **退出条件** | 资源分配完成或失败 |

### Running

| 属性 | 说明 |
|------|------|
| **描述** | 讨论执行中 |
| **可执行操作** | `runRound()`, `collectOpinions()` |
| **进入条件** | 资源分配成功 |
| **退出条件** | 单轮完成或 Agent 错误 |

### Evaluating

| 属性 | 说明 |
|------|------|
| **描述** | 评估当前状态 |
| **可执行操作** | `evaluate()` |
| **进入条件** | 单轮讨论完成 |
| **退出条件** | 评估完成 |

### Governed

| 属性 | 说明 |
|------|------|
| **描述** | 治理干预中 |
| **可执行操作** | `govern()` |
| **进入条件** | 评估完成 |
| **退出条件** | 治理完成 |

### CheckingTermination

| 属性 | 说明 |
|------|------|
| **描述** | 检查终止条件 |
| **可执行操作** | `checkTermination()` |
| **进入条件** | 治理完成 |
| **退出条件** | 终止决策完成 |

### Completed

| 属性 | 说明 |
|------|------|
| **描述** | 实验完成 |
| **可执行操作** | `generateReport()` |
| **进入条件** | 达到终止条件 |
| **退出条件** | 报告生成完成 |

### Failed

| 属性 | 说明 |
|------|------|
| **描述** | 实验失败 |
| **可执行操作** | `retry()`, `cleanup()` |
| **进入条件** | 任何阶段失败 |
| **退出条件** | 重试或清理完成 |

---

# 3. Runtime Scheduler

## 3.1 Scheduler 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Runtime Scheduler                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │  Clock      │  │  Queue      │  │  Execution Engine   │    │
│  │  (Ticker)   │  │  (Priority) │  │  (Sequential Loop) │    │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘    │
│         │                │                     │                │
│         ▼                ▼                     ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Task Loop                             │   │
│  │  Discussion → Observation → Inference → Update →        │   │
│  │  Evaluation → Governance → TerminationCheck             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 3.2 Scheduler 核心逻辑

### 3.2.1 主循环

```typescript
async run(experiment: Experiment): Promise<ExperimentResult> {
  const context = this.initializeContext(experiment);
  
  this.transitionTo("Running");
  
  while (!this.shouldTerminate(context)) {
    await this.executeRound(context);
    await this.evaluate(context);
    await this.govern(context);
    
    if (this.shouldTerminate(context)) {
      break;
    }
    
    this.incrementRound(context);
  }
  
  this.transitionTo("Completed");
  return this.generateReport(context);
}
```

### 3.2.2 调度决策规则

| 决策点 | 条件 | 动作 |
|--------|------|------|
| **开始下一轮** | `ShouldContinue = true` | 进入 `Running` 状态 |
| **进入 Governance** | 每轮讨论后固定执行 | 进入 `Governed` 状态 |
| **结束实验** | `ShouldTerminate = true` | 进入 `Completed` 状态 |
| **生成最终结果** | 实验完成后固定执行 | 生成 Research Report |

### 3.2.3 优先级队列

```typescript
interface ScheduledTask {
  id: string;
  type: "discussion" | "evaluation" | "governance" | "report";
  priority: "high" | "medium" | "low";
  dependencies: string[];
  payload: Record<string, unknown>;
}

const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
};
```

### 3.2.4 Scheduler API

```typescript
interface RuntimeScheduler {
  schedule(task: ScheduledTask): string;
  cancel(taskId: string): void;
  run(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  getStatus(): SchedulerStatus;
}

interface SchedulerStatus {
  currentState: RuntimeState;
  currentRound: number;
  queuedTasks: number;
  runningTask?: string;
  startTime: string;
  elapsedMs: number;
}
```

---

# 4. Event System Design

## 4.1 事件分类

### 4.1.1 Lifecycle Events

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `TaskSubmitted` | 任务提交 | `{ taskId, description }` |
| `ExperimentCreated` | 实验创建 | `{ experimentId, taskId }` |
| `SessionInitialized` | 会话初始化 | `{ sessionId, experimentId }` |
| `AgentsInitialized` | Agent 初始化 | `{ agentCount, agentIds }` |
| `ExperimentStarted` | 实验开始 | `{ experimentId, startTime }` |
| `ExperimentCompleted` | 实验完成 | `{ experimentId, endTime }` |
| `ExperimentFailed` | 实验失败 | `{ experimentId, error }` |

### 4.1.2 Discussion Events

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `RoundStarted` | 轮次开始 | `{ roundNumber, timestamp }` |
| `RoundCompleted` | 轮次完成 | `{ roundNumber, opinions }` |
| `AgentResponded` | Agent 响应 | `{ agentId, roundNumber, response }` |
| `AgentError` | Agent 错误 | `{ agentId, error }` |

### 4.1.3 State Events

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `ObservationCompleted` | 观察完成 | `{ observations }` |
| `InferenceCompleted` | 推断完成 | `{ deltas }` |
| `StateUpdated` | 状态更新 | `{ stateSnapshot }` |
| `BeliefChanged` | 信念变化 | `{ agentId, oldValue, newValue }` |
| `ConfidenceChanged` | 置信度变化 | `{ agentId, oldValue, newValue }` |

### 4.1.4 Analysis Events

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `EvaluationCompleted` | 评估完成 | `{ metrics }` |
| `GovernanceTriggered` | 治理触发 | `{ issues }` |
| `InterventionApplied` | 干预应用 | `{ intervention }` |
| `ConsensusDetected` | 共识检测 | `{ level, agents }` |
| `ConflictDetected` | 冲突检测 | `{ agents, severity }` |

### 4.1.5 Termination Events

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `TerminationCheck` | 终止检查 | `{ conditions }` |
| `ShouldContinue` | 继续讨论 | `{ reason }` |
| `ShouldTerminate` | 终止讨论 | `{ reason }` |
| `MaximumRoundsReached` | 达到最大轮次 | `{ maxRounds }` |
| `ConsensusStable` | 共识稳定 | `{ level }` |

## 4.2 事件流

```
TaskSubmitted
    ↓
ExperimentCreated
    ↓
SessionInitialized
    ↓
AgentsInitialized
    ↓
ExperimentStarted
    ↓
[ ROUND LOOP ]
    RoundStarted
        ↓
    AgentResponded (xN)
        ↓
    RoundCompleted
        ↓
    ObservationCompleted
        ↓
    InferenceCompleted
        ↓
    StateUpdated
        ↓
    EvaluationCompleted
        ↓
    GovernanceTriggered
        ↓
    [ If intervention ]
        InterventionApplied
        ↓
    TerminationCheck
        ↓
    ShouldContinue / ShouldTerminate
    ↓
[ END ROUND LOOP ]
    ↓
ExperimentCompleted
    ↓
ReportGenerated
```

## 4.3 事件系统 API

```typescript
interface EventBus {
  publish(event: RuntimeEvent): void;
  subscribe(eventType: string, handler: EventHandler): Subscription;
  unsubscribe(subscription: Subscription): void;
  getEvents(type?: string): RuntimeEvent[];
  clear(): void;
}

interface RuntimeEvent {
  id: string;
  type: string;
  timestamp: string;
  roundNumber?: number;
  payload: Record<string, unknown>;
  source: string;
}

type EventHandler = (event: RuntimeEvent) => void | Promise<void>;

interface Subscription {
  id: string;
  eventType: string;
  unsubscribe(): void;
}
```

## 4.4 事件使用原则

1. **事件用于可观测性**: 模块通过事件通知状态变化，不通过事件控制流程
2. **事件不携带业务逻辑**: 事件只传递数据，不包含决策逻辑
3. **事件发布者不关心订阅者**: 发布者不知道谁订阅了事件
4. **事件必须幂等**: 同一事件多次处理结果相同
5. **事件必须可追溯**: 每个事件都有唯一 ID 和时间戳

---

# 5. Runtime Context Design

## 5.1 Context 结构

```typescript
interface RuntimeContext {
  experiment: Experiment;
  session: Session;
  task: Task;
  round: RoundContext;
  state: CollectiveDecisionState;
  metrics: RuntimeMetrics;
  governance: GovernanceContext;
  agents: AgentPool;
  config: RuntimeConfig;
  timeline: TimelineEntry[];
}

interface RoundContext {
  current: number;
  max: number;
  startedAt: string;
  endedAt?: string;
  results?: RoundResult;
}

interface RuntimeMetrics {
  evaluation: EvaluationResult | null;
  previousEvaluation: EvaluationResult | null;
  delta: Record<string, number>;
  history: MetricHistory[];
}

interface GovernanceContext {
  issues: GovernanceIssue[];
  interventions: Intervention[];
  appliedInterventions: Intervention[];
  status: "clean" | "warning" | "critical";
}

interface AgentPool {
  agents: Agent[];
  states: Map<string, AgentState>;
  getAgent(id: string): Agent | undefined;
  getAllStates(): Map<string, AgentState>;
}

interface TimelineEntry {
  timestamp: string;
  roundNumber: number;
  eventType: string;
  description: string;
  payload?: Record<string, unknown>;
}
```

## 5.2 Context 访问模式

### 5.2.1 读取

```typescript
// 所有模块通过统一接口读取
const belief = context.state.getAgentState(agentId).belief;
const evaluation = context.metrics.evaluation;
const round = context.round.current;
```

### 5.2.2 更新

```typescript
// 只有 Runtime 可以直接更新 Context
context.round.current++;
context.state.update(deltas);
context.metrics.evaluation = result;

// 其他模块通过事件通知更新需求
eventBus.publish({
  type: "StateUpdateRequested",
  payload: { deltas },
});
```

## 5.3 Context 生命周期

| 阶段 | Context 状态 |
|------|-------------|
| Session Initialization | 创建空 Context |
| Agent Initialization | 填充 AgentPool |
| Round Started | 更新 RoundContext |
| State Updated | 更新 CollectiveDecisionState |
| Evaluation Completed | 更新 RuntimeMetrics |
| Governance Completed | 更新 GovernanceContext |
| Experiment Completed | 冻结 Context |

---

# 6. Termination Strategy

## 6.1 终止条件类型

### 6.1.1 内置终止策略

| 策略 | 类型 | 配置 | 说明 |
|------|------|------|------|
| `MaximumRounds` | 硬性 | `maxRounds: number` | 达到最大轮次 |
| `ConsensusStable` | 软性 | `threshold: number, stabilityRounds: number` | 共识稳定 N 轮 |
| `NoStateChange` | 软性 | `threshold: number, stabilityRounds: number` | 状态无变化 N 轮 |
| `ConfidenceConverged` | 软性 | `threshold: number` | 置信度达到阈值 |
| `GovernanceLimit` | 硬性 | `maxInterventions: number` | 干预次数达到上限 |
| `ExperimentTimeout` | 硬性 | `timeoutMs: number` | 实验超时 |

### 6.1.2 可扩展终止策略

| 策略 | 说明 | 研究价值 |
|------|------|----------|
| `ManualStop` | 手动停止 | 实验控制 |
| `CustomPlugin` | 自定义插件 | 研究扩展 |

## 6.2 终止条件配置

```typescript
interface TerminationCondition {
  type: TerminationType;
  enabled: boolean;
  params: Record<string, unknown>;
  priority: "hard" | "soft";
}

type TerminationType = 
  | "maximum_rounds"
  | "consensus_stable"
  | "no_state_change"
  | "confidence_converged"
  | "governance_limit"
  | "experiment_timeout"
  | "manual_stop"
  | "custom";

interface TerminationConfig {
  conditions: TerminationCondition[];
  strategy: "any" | "all";
}

// 示例配置
const defaultTerminationConfig: TerminationConfig = {
  conditions: [
    { type: "maximum_rounds", enabled: true, params: { maxRounds: 10 }, priority: "hard" },
    { type: "consensus_stable", enabled: true, params: { threshold: 0.7, stabilityRounds: 2 }, priority: "soft" },
    { type: "confidence_converged", enabled: true, params: { threshold: 80 }, priority: "soft" },
    { type: "experiment_timeout", enabled: true, params: { timeoutMs: 300000 }, priority: "hard" },
  ],
  strategy: "any",
};
```

## 6.3 终止检查逻辑

```typescript
interface TerminationStrategy {
  check(context: RuntimeContext): TerminationDecision;
  getType(): TerminationType;
}

interface TerminationDecision {
  shouldTerminate: boolean;
  reason: string;
  conditionType: TerminationType;
  metrics: Record<string, number>;
}

class TerminationChecker {
  private strategies: Map<TerminationType, TerminationStrategy>;
  private config: TerminationConfig;
  
  check(context: RuntimeContext): TerminationDecision {
    for (const condition of this.config.conditions) {
      if (!condition.enabled) continue;
      
      const strategy = this.strategies.get(condition.type);
      if (!strategy) continue;
      
      const decision = strategy.check(context);
      if (decision.shouldTerminate) {
        return decision;
      }
    }
    
    return {
      shouldTerminate: false,
      reason: "No termination condition met",
      conditionType: "none",
      metrics: {},
    };
  }
}
```

## 6.4 终止策略实现示例

### 6.4.1 ConsensusStableStrategy

```typescript
class ConsensusStableStrategy implements TerminationStrategy {
  private threshold: number;
  private stabilityRounds: number;
  
  check(context: RuntimeContext): TerminationDecision {
    const history = context.metrics.history;
    if (history.length < this.stabilityRounds) {
      return { shouldTerminate: false, reason: "Insufficient history", ... };
    }
    
    const recentConsensus = history.slice(-this.stabilityRounds)
      .map(h => h.consensus?.level || 0);
    
    const avgConsensus = recentConsensus.reduce((a, b) => a + b, 0) / recentConsensus.length;
    const std = Math.sqrt(recentConsensus.reduce((sum, c) => sum + Math.pow(c - avgConsensus, 2), 0) / recentConsensus.length);
    
    const stable = avgConsensus >= this.threshold && std < 0.1;
    
    return {
      shouldTerminate: stable,
      reason: stable ? `Consensus stable at ${avgConsensus.toFixed(2)}` : "Consensus not stable",
      conditionType: "consensus_stable",
      metrics: { avgConsensus, std, stabilityRounds: recentConsensus.length },
    };
  }
}
```

---

# 7. Research Report Pipeline

## 7.1 Report 结构

```typescript
interface ResearchReport {
  experimentId: string;
  taskId: string;
  generatedAt: string;
  metadata: ReportMetadata;
  sections: ReportSection[];
  summary: ReportSummary;
  rawData: RawDataReference;
}

interface ReportMetadata {
  title: string;
  description: string;
  author?: string;
  createdAt: string;
  completedAt: string;
  totalRounds: number;
  agentCount: number;
  converged: boolean;
  terminationReason: string;
}

interface ReportSection {
  id: string;
  title: string;
  type: ReportSectionType;
  content: SectionContent;
  timestamp: string;
}

type ReportSectionType = 
  | "discussion_summary"
  | "opinion_evolution"
  | "evidence_evolution"
  | "influence_graph"
  | "conflict_timeline"
  | "consensus_evolution"
  | "evaluation_metrics"
  | "governance_actions"
  | "final_decision"
  | "experiment_metadata"
  | "future_work";

interface SectionContent {
  text?: string;
  data?: Record<string, unknown>;
  charts?: ChartData[];
  tables?: TableData[];
}

interface ChartData {
  type: "line" | "bar" | "scatter" | "network" | "timeline";
  title: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}

interface TableData {
  title: string;
  headers: string[];
  rows: string[][];
}

interface ReportSummary {
  finalDecision: string;
  consensusLevel: number;
  confidence: number;
  keyFindings: string[];
  limitations: string[];
  recommendations: string[];
}

interface RawDataReference {
  trace: string;
  graph: string;
  metrics: string;
  events: string;
}
```

## 7.2 Report Generation Pipeline

```
Collective Decision State
    ↓
┌─────────────────────┐
│  DiscussionSummary  │  → 讨论概述
└─────────────────────┘
    ↓
┌─────────────────────┐
│  OpinionEvolution   │  → 观点演化图表
└─────────────────────┘
    ↓
┌─────────────────────┐
│  EvidenceEvolution  │  → 证据演化
└─────────────────────┘
    ↓
┌─────────────────────┐
│  InfluenceGraph     │  → 影响网络图
└─────────────────────┘
    ↓
┌─────────────────────┐
│  ConflictTimeline   │  → 冲突时间线
└─────────────────────┘
    ↓
┌─────────────────────┐
│  ConsensusEvolution │  → 共识演化
└─────────────────────┘
    ↓
┌─────────────────────┐
│  EvaluationMetrics  │  → 评估指标
└─────────────────────┘
    ↓
┌─────────────────────┐
│  GovernanceActions  │  → 治理动作
└─────────────────────┘
    ↓
┌─────────────────────┐
│  FinalDecision      │  → 最终决策
└─────────────────────┘
    ↓
┌─────────────────────┐
│  ReportSummary      │  → 报告摘要
└─────────────────────┘
    ↓
Research Report (JSON)
```

## 7.3 各 Section 数据来源

| Section | 数据来源 | 计算方式 |
|---------|----------|----------|
| `discussion_summary` | DecisionTrace | 文本摘要 |
| `opinion_evolution` | BeliefTrajectory | 时序分析 |
| `evidence_evolution` | EvidenceState | 证据追踪 |
| `influence_graph` | InteractionGraph | 图可视化 |
| `conflict_timeline` | ConflictState | 时间线构建 |
| `consensus_evolution` | ConsensusState | 时序分析 |
| `evaluation_metrics` | EvaluationResult | 直接提取 |
| `governance_actions` | GovernanceResult | 干预记录 |
| `final_decision` | FinalDecision | 直接提取 |
| `experiment_metadata` | Experiment | 直接提取 |
| `future_work` | LLM 分析 | 推理生成 |

---

# 8. Architecture Refactor Proposal

## 8.1 目标架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Research Application                         │
│  Experiment Management | Visualization | API | CLI                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       Research Runtime                              │
│  RuntimeScheduler | RuntimeContext | EventBus | TerminationChecker │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           Core Modules                              │
│  DiscussionEngine | EvaluationEngine | GovernanceEngine             │
│  ObservationLayer | InferenceLayer | CDSM                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Foundation Layer                            │
│  LLM Providers | Benchmark | Adapter | Security | Storage          │
└─────────────────────────────────────────────────────────────────────┘
```

## 8.2 需要移动的模块

| 当前位置 | 目标位置 | 原因 |
|----------|----------|------|
| `src/lib/discussion/` | `src/lib/` (独立模块) | Discussion 是核心模块，不应嵌套 |
| `src/lib/governance/` | `src/lib/` (独立模块) | Governance 是核心模块 |
| `src/lib/evaluation/` | `src/lib/` (独立模块) | Evaluation 是核心模块 |
| `src/lib/types.ts` | `src/lib/runtime/types.ts` | Runtime 类型独立 |

## 8.3 需要调整的接口

| 接口 | 调整内容 | 原因 |
|------|----------|------|
| `DiscussionEngine.run()` | 返回 `RoundResult[]` | 由 Runtime 控制流程 |
| `EvaluationEngine.evaluate()` | 接收 `RuntimeContext` | 从 Context 读取状态 |
| `GovernanceEngine.govern()` | 接收 `RuntimeContext` | 从 Context 读取状态 |
| `DecisionTraceBuilder` | 接收 `StateDelta[]` | 基于状态变化构建 |

## 8.4 需要拆除的耦合

| 耦合 | 问题 | 解决方案 |
|------|------|----------|
| DiscussionEngine → GovernanceEngine | 讨论引擎直接调用治理 | 通过 Runtime 调度 |
| DiscussionEngine → EvaluationEngine | 讨论引擎直接调用评估 | 通过 Runtime 调度 |
| DiscussionEngine 内部状态管理 | 讨论引擎维护全局状态 | 使用统一 RuntimeContext |
| Agent 状态分散存储 | 状态存储在多个地方 | 使用 AgentPool 统一管理 |

## 8.5 新增模块

| 模块 | 职责 | 位置 |
|------|------|------|
| `RuntimeScheduler` | 统一调度器 | `src/lib/runtime/scheduler.ts` |
| `RuntimeContext` | 统一上下文 | `src/lib/runtime/context.ts` |
| `EventBus` | 事件总线 | `src/lib/runtime/eventBus.ts` |
| `TerminationChecker` | 终止检查 | `src/lib/runtime/termination.ts` |
| `ReportGenerator` | 报告生成 | `src/lib/runtime/report.ts` |
| `ObservationLayer` | 观察层 | `src/lib/observation/` |
| `InferenceLayer` | 推断层 | `src/lib/inference/` |

## 8.6 接口设计

### 8.6.1 Runtime API

```typescript
interface ResearchRuntime {
  submitTask(task: TaskRequest): Promise<Task>;
  createExperiment(taskId: string, config: ExperimentConfig): Promise<Experiment>;
  startExperiment(experimentId: string): Promise<ExperimentResult>;
  pauseExperiment(experimentId: string): Promise<void>;
  resumeExperiment(experimentId: string): Promise<void>;
  stopExperiment(experimentId: string): Promise<void>;
  getExperimentStatus(experimentId: string): Promise<ExperimentStatus>;
  generateReport(experimentId: string): Promise<ResearchReport>;
  getEventBus(): EventBus;
  getContext(experimentId: string): RuntimeContext | undefined;
}
```

### 8.6.2 模块接口规范

```typescript
interface RuntimeModule {
  initialize(context: RuntimeContext): Promise<void>;
  execute(context: RuntimeContext): Promise<void>;
  cleanup(context: RuntimeContext): Promise<void>;
  getEvents(): RuntimeEvent[];
}
```

## 8.7 设计原则检查

| 原则 | 实现方式 | 验证方法 |
|------|----------|----------|
| **Single Entry** | `ResearchRuntime` 统一入口 | 代码审查 |
| **Single Scheduler** | `RuntimeScheduler` 统一调度 | 代码审查 |
| **State Driven** | `RuntimeContext` 唯一状态源 | 代码审查 |
| **Event Driven** | `EventBus` 事件总线 | 代码审查 |
| **Plugin Friendly** | Strategy 接口 | 插件测试 |
| **Model Agnostic** | Adapter 层 | 多模型测试 |
| **Benchmark Agnostic** | Benchmark 接口 | 多基准测试 |
| **Research Friendly** | CDSM + DecisionTrace | 实验验证 |
| **Replayable** | 完整状态快照 | 回放测试 |
| **Observable** | EventBus + Metrics | 指标追踪 |
| **Deterministic** | 固定种子 + 确定性策略 | 复现测试 |

---

## 附录：Runtime 核心代码框架

### Runtime 主类

```typescript
class ResearchRuntimeImpl implements ResearchRuntime {
  private scheduler: RuntimeScheduler;
  private contextManager: ContextManager;
  private eventBus: EventBus;
  private modules: Map<string, RuntimeModule>;
  
  async startExperiment(experimentId: string): Promise<ExperimentResult> {
    const experiment = await this.loadExperiment(experimentId);
    const context = this.contextManager.create(experiment);
    
    this.eventBus.publish({ type: "ExperimentStarted", payload: { experimentId } });
    
    try {
      await this.scheduler.run(context);
      
      const report = await this.generateReport(experimentId);
      
      this.eventBus.publish({ type: "ExperimentCompleted", payload: { experimentId } });
      
      return {
        experiment,
        report,
        context: context.freeze(),
      };
    } catch (error) {
      this.eventBus.publish({ type: "ExperimentFailed", payload: { experimentId, error } });
      throw error;
    }
  }
}
```

### 主循环

```typescript
class RuntimeSchedulerImpl implements RuntimeScheduler {
  async run(context: RuntimeContext): Promise<void> {
    const terminationChecker = new TerminationChecker(context.experiment.config.termination);
    
    while (true) {
      const decision = terminationChecker.check(context);
      if (decision.shouldTerminate) {
        context.timeline.push({
          timestamp: new Date().toISOString(),
          roundNumber: context.round.current,
          eventType: "ShouldTerminate",
          description: decision.reason,
        });
        break;
      }
      
      await this.executeRound(context);
      
      context.round.current++;
    }
  }
  
  private async executeRound(context: RuntimeContext): Promise<void> {
    await this.executeModule("discussion", context);
    await this.executeModule("observation", context);
    await this.executeModule("inference", context);
    await this.executeModule("evaluation", context);
    await this.executeModule("governance", context);
  }
}
```

---

> **等待确认后开始实现 Runtime。**