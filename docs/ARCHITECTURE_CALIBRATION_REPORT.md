# SwarmAlpha V3 —— Runtime Architecture Calibration Report

> 版本: 1.0  
> 更新时间: 2026-07-02  
> 状态: Architecture Calibration  
> 核心研究问题: **How can we evaluate and govern collective decision-making in LLM-based multi-agent systems?**

---

## 目录

1. [Executive Summary](#1-executive-summary)
2. [Runtime Data Flow Diagram](#2-runtime-data-flow-diagram)
3. [Responsibility Matrix](#3-responsibility-matrix)
4. [State Ownership Diagram](#4-state-ownership-diagram)
5. [Research Artifact Pipeline](#5-research-artifact-pipeline)
6. [Runtime Extensibility Review](#6-runtime-extensibility-review)
7. [Runtime Readiness Checklist](#7-runtime-readiness-checklist)
8. [Recommendations](#8-recommendations)

---

# 1. Executive Summary

## 1.1 校准结果

| 维度 | 状态 | 问题数 | 风险等级 |
|------|------|--------|----------|
| 数据流 | ⚠️ 需要改进 | 3 | 中 |
| 职责边界 | ⚠️ 需要改进 | 2 | 中 |
| 状态所有权 | ❌ 不满足 | 4 | 高 |
| 研究产物 | ⚠️ 需要改进 | 2 | 中 |
| 可扩展性 | ⚠️ 需要改进 | 3 | 中 |
| 整体就绪度 | **6/10** | - | 中 |

## 1.2 核心发现

1. **DiscussionEngine 是状态孤岛**：维护了 `agentStates`、`roundDataArray`、`eventTracker` 等隐藏状态
2. **数据重复存储**：Agent 状态同时存储在 `agentStates` Map、`graphBuilder.nodes`、`memoryManager` 中
3. **职责重叠**：`InfluenceManager` 既计算影响力又修改图结构
4. **缺少统一 Artifact**：实验数据分散在各模块，无法自动生成研究报告
5. **接口不统一**：各模块 API 风格差异大，难以扩展

---

# 2. Runtime Data Flow Diagram

## 2.1 当前数据流（问题分析）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          问题数据流（当前状态）                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Task                                                                    │
│   ↓                                                                     │
│  DiscussionEngine.run()  ←─────────────────────────────────────────────│
│   │                                                                     │
│   ├──→ agentStates (本地状态)                                            │
│   ├──→ roundDataArray (本地状态)                                         │
│   ├──→ graphBuilder (本地状态)                                           │
│   ├──→ memoryManager (本地状态)                                          │
│   ├──→ traceBuilder (本地状态)                                           │
│   ├──→ eventTracker (本地状态)                                           │
│   │                                                                     │
│   ├──→ runRound() → Observation (内部)                                  │
│   │       ↓                                                             │
│   │    opinions                                                         │
│   │       ↓                                                             │
│   ├──→ updateBeliefs() → Inference (内部)                               │
│   │       ↓                                                             │
│   │    agentStates (回写本地)                                            │
│   │       ↓                                                             │
│   ├──→ applyGovernance() → GovernanceEngine (直接调用)                   │
│   │       ↓                                                             │
│   │    interventions (回写本地)                                          │
│   │       ↓                                                             │
│   └──→ checkConvergence() → 终止判断 (本地)                              │
│                                                                         │
│  EvaluationEngine.evaluate() ← 需要手动传入数据                           │
│  GovernanceEngine.diagnoseAndIntervene() ← 需要手动传入数据               │
│                                                                         │
│  问题：                                                                 │
│  1. DiscussionEngine 控制所有流程                                        │
│  2. 状态分散在多个本地变量                                               │
│  3. 模块之间直接耦合调用                                                 │
│  4. 数据重复存储                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2.2 目标数据流（校准后）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          目标数据流（校准后）                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Task                                                                    │
│   ↓                                                                     │
│  ResearchRuntime (Single Entry)                                         │
│   ↓                                                                     │
│  RuntimeContext (唯一状态源)                                             │
│   │                                                                     │
│   ├── experiment: Experiment                                            │
│   ├── session: Session                                                  │
│   ├── round: RoundContext                                               │
│   ├── state: CollectiveDecisionState                                    │
│   ├── metrics: RuntimeMetrics                                           │
│   ├── governance: GovernanceContext                                     │
│   ├── agents: AgentPool                                                 │
│   ├── config: RuntimeConfig                                             │
│   └── timeline: TimelineEntry[]                                         │
│                                                                         │
│  RuntimeScheduler (Single Scheduler)                                    │
│   ↓                                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      MAIN LOOP                                    │  │
│  │                                                                   │  │
│  │  DiscussionEngine.executeRound(context)                           │  │
│  │         ↓                                                         │  │
│  │     RoundResult                                                   │  │
│  │         ↓                                                         │  │
│  │  ObservationLayer.observe(context)                                │  │
│  │         ↓                                                         │  │
│  │     RawObservation[] → RuntimeContext (写)                        │  │
│  │         ↓                                                         │  │
│  │  InferenceLayer.infer(context)                                    │  │
│  │         ↓                                                         │  │
│  │     StateDelta[] → RuntimeContext (写)                            │  │
│  │         ↓                                                         │  │
│  │  CollectiveDecisionState.update(context)                          │  │
│  │         ↓                                                         │  │
│  │     UpdatedState → RuntimeContext (写)                            │  │
│  │         ↓                                                         │  │
│  │  EvaluationEngine.evaluate(context)                               │  │
│  │         ↓                                                         │  │
│  │     EvaluationResult → RuntimeContext (写)                        │  │
│  │         ↓                                                         │  │
│  │  GovernanceEngine.govern(context)                                 │  │
│  │         ↓                                                         │  │
│  │     GovernanceResult → RuntimeContext (写)                        │  │
│  │         ↓                                                         │  │
│  │  TerminationChecker.check(context)                                │  │
│  │         ↓                                                         │  │
│  │     TerminationDecision                                           │  │
│  │         ↓                                                         │  │
│  │  Continue? → Yes: next round / No: terminate                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Termination                                                             │
│   ↓                                                                     │
│  ResearchArtifact (自动收集)                                             │
│   ↓                                                                     │
│  ResearchReport (自动汇总)                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2.3 数据流节点详细说明

| 节点 | 输入 | 输出 | 维护者 | 读取者 | 数据重复 | 状态回写 | 双向依赖 |
|------|------|------|--------|--------|----------|----------|----------|
| **Task** | 外部输入 | Task 对象 | 用户 | Runtime | 否 | 否 | 否 |
| **ResearchRuntime** | Task | RuntimeContext | Runtime | 无 | 否 | 否 | 否 |
| **RuntimeScheduler** | RuntimeContext | 状态转换 | Scheduler | 无 | 否 | 是 | 否 |
| **RuntimeContext** | 各模块输出 | 各模块输入 | Runtime | 所有模块 | **是**（当前） | **是** | 否 |
| **DiscussionEngine** | RuntimeContext | RoundResult | Runtime | Scheduler | **是**（当前） | **是**（当前） | **是**（当前） |
| **ObservationLayer** | RoundResult | RawObservation[] | Runtime | InferenceLayer | 否 | 否 | 否 |
| **InferenceLayer** | RawObservation[], State | StateDelta[] | Runtime | CDSM | 否 | 否 | 否 |
| **CDSM** | StateDelta[] | UpdatedState | Runtime | Evaluation, Governance | 否 | 否 | 否 |
| **EvaluationEngine** | RuntimeContext | EvaluationResult | Runtime | TerminationChecker | 否 | 否 | 否 |
| **GovernanceEngine** | RuntimeContext | GovernanceResult | Runtime | TerminationChecker | 否 | 否 | 否 |
| **TerminationChecker** | RuntimeContext | TerminationDecision | Runtime | Scheduler | 否 | 否 | 否 |
| **ResearchArtifact** | 各模块快照 | Artifact | Runtime | ReportGenerator | 否 | 否 | 否 |
| **ResearchReport** | Artifact | Report | Runtime | 用户 | 否 | 否 | 否 |

---

# 3. Responsibility Matrix

## 3.1 职责边界定义

### 3.1.1 ObservationLayer

| 职责 | 描述 | 状态 |
|------|------|------|
| **负责** | 提取和记录 Agent 原始输出 | ✅ |
| **负责** | 构建 Agent 提示词 | ✅ |
| **负责** | 调用 LLM 获取响应 | ✅ |
| **负责** | 解析 Agent 响应为结构化数据 | ✅ |
| **负责** | 生成 RawObservation | ✅ |
| **绝对不负责** | 更新 Agent 状态 | ❌ |
| **绝对不负责** | 计算影响力 | ❌ |
| **绝对不负责** | 更新信念 | ❌ |
| **绝对不负责** | 修改交互图 | ❌ |
| **绝对不负责** | 存储状态 | ❌ |

### 3.1.2 InferenceLayer

| 职责 | 描述 | 状态 |
|------|------|------|
| **负责** | 从观察结果推断状态变化 | ✅ |
| **负责** | 计算 Agent 之间的影响力 | ✅ |
| **负责** | 计算信念更新量 | ✅ |
| **负责** | 生成 StateDelta | ✅ |
| **负责** | 推断因果关系 | ✅ |
| **绝对不负责** | 更新 Agent 状态 | ❌ |
| **绝对不负责** | 修改交互图结构 | ❌ |
| **绝对不负责** | 存储最终状态 | ❌ |
| **绝对不负责** | 调用 LLM | ❌ |
| **绝对不负责** | 评估决策质量 | ❌ |

### 3.1.3 CollectiveDecisionState (CDSM)

| 职责 | 描述 | 状态 |
|------|------|------|
| **负责** | 维护集体决策状态 | ✅ |
| **负责** | 存储 Agent 状态（信念、置信度） | ✅ |
| **负责** | 存储交互图 | ✅ |
| **负责** | 存储决策轨迹 | ✅ |
| **负责** | 应用 StateDelta 更新状态 | ✅ |
| **负责** | 提供状态查询接口 | ✅ |
| **绝对不负责** | 计算影响力 | ❌ |
| **绝对不负责** | 计算信念更新 | ❌ |
| **绝对不负责** | 调用 LLM | ❌ |
| **绝对不负责** | 评估决策质量 | ❌ |
| **绝对不负责** | 治理干预 | ❌ |

## 3.2 当前职责重叠分析

| 重叠区域 | 涉及模块 | 问题描述 | 解决方案 |
|----------|----------|----------|----------|
| 影响力计算 + 图修改 | InfluenceManager | `applyInfluences()` 既计算又修改图 | 拆分：计算返回 EdgeDelta，CDSM 负责修改 |
| 信念计算 + 状态更新 | BeliefUpdateManager | `update()` 返回新状态，但由外部决定是否应用 | 保持不变，但更新逻辑移至 CDSM |
| 讨论执行 + 状态管理 | DiscussionEngine | `run()` 方法包含循环、状态更新、治理调用 | 拆分：DiscussionEngine 只负责单轮执行 |
| 事件追踪 + 状态存储 | DiscussionEngine | `eventTracker` 与 `roundDataArray` 重复 | 统一到 RuntimeContext.timeline |

---

# 4. State Ownership Diagram

## 4.1 当前状态所有权

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         当前状态所有权（分散）                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  DiscussionEngine                                                       │
│  ├── agentStates: Map<string, { belief, confidence }>                  │
│  ├── roundDataArray: RoundData[]                                        │
│  ├── graphBuilder: InteractionGraphBuilder                             │
│  ├── memoryManager: MemoryManager                                       │
│  ├── traceBuilder: DecisionTraceBuilder                                 │
│  └── eventTracker: EventTracker                                         │
│                                                                         │
│  EvaluationEngine                                                       │
│  └── (无本地状态，但需要外部传入大量参数)                                  │
│                                                                         │
│  GovernanceEngine                                                       │
│  └── strategies: Map<InterventionType, InterventionStrategy>            │
│                                                                         │
│  问题：                                                                 │
│  1. DiscussionEngine 是状态孤岛                                          │
│  2. 状态无法被其他模块直接访问                                             │
│  3. 状态变更无法追踪                                                     │
│  4. 状态无法回放                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.2 目标状态所有权

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         目标状态所有权（统一）                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  RuntimeContext (唯一状态源)                                             │
│  ├── experiment: Experiment                                             │
│  │   ├── id, taskId, config, status, timestamps                         │
│  │                                                                     │
│  ├── session: Session                                                   │
│  │   ├── id, experimentId, startTime                                    │
│  │                                                                     │
│  ├── round: RoundContext                                                │
│  │   ├── current, max, startedAt, endedAt, results                      │
│  │                                                                     │
│  ├── state: CollectiveDecisionState                                     │
│  │   ├── agentStates: Map<string, AgentState>                           │
│  │   ├── interactionGraph: InteractionGraph                             │
│  │   ├── decisionTrace: DecisionTrace                                   │
│  │   └── beliefTrajectories: Record<string, BeliefTrajectory>          │
│  │                                                                     │
│  ├── metrics: RuntimeMetrics                                            │
│  │   ├── evaluation: EvaluationResult                                   │
│  │   ├── previousEvaluation: EvaluationResult                           │
│  │   ├── delta: Record<string, number>                                  │
│  │   └── history: MetricHistory[]                                       │
│  │                                                                     │
│  ├── governance: GovernanceContext                                      │
│  │   ├── issues: GovernanceIssue[]                                      │
│  │   ├── interventions: Intervention[]                                  │
│  │   ├── appliedInterventions: Intervention[]                           │
│  │   └── status: "clean" | "warning" | "critical"                      │
│  │                                                                     │
│  ├── agents: AgentPool                                                  │
│  │   ├── agents: Agent[]                                                │
│  │   └── states: Map<string, AgentState>                                │
│  │                                                                     │
│  ├── config: RuntimeConfig                                              │
│  │   ├── termination: TerminationConfig                                 │
│  │   ├── evaluation: EvaluationConfig                                   │
│  │   └── governance: GovernanceConfig                                   │
│  │                                                                     │
│  └── timeline: TimelineEntry[]                                          │
│      └── 所有事件的完整时间线                                            │
│                                                                         │
│  所有模块只读取 RuntimeContext，不维护自己的状态                            │
│  状态更新由 Runtime 通过 CDSM 统一执行                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.3 状态迁移计划

| 当前状态位置 | 目标位置 | 迁移方式 | 优先级 |
|--------------|----------|----------|--------|
| DiscussionEngine.agentStates | RuntimeContext.state.agentStates | 直接迁移 | P0 |
| DiscussionEngine.roundDataArray | RuntimeContext.timeline | 转换为 TimelineEntry | P0 |
| DiscussionEngine.graphBuilder | RuntimeContext.state.interactionGraph | 迁移图结构 | P0 |
| DiscussionEngine.memoryManager | RuntimeContext.state.decisionTrace | 合并到决策轨迹 | P1 |
| DiscussionEngine.traceBuilder | RuntimeContext.state.decisionTrace | 合并到决策轨迹 | P1 |
| DiscussionEngine.eventTracker | RuntimeContext.timeline | 统一到时间线 | P1 |
| GovernanceEngine.strategies | RuntimeContext.config.governance | 策略注册移至配置 | P2 |

---

# 5. Research Artifact Pipeline

## 5.1 当前问题

```
当前：
  实验结束 → 临时收集数据 → 生成 Research Report
  问题：报告生成依赖实时数据，无法回溯，无法增量更新
```

## 5.2 目标设计

```
目标：
  每轮结束 → 自动快照 → Research Artifact → 最终汇总 → Research Report
  优势：可回溯、可增量、可验证、可复现
```

## 5.3 Artifact Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Research Artifact Pipeline                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  每轮结束后自动执行：                                                     │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Round Snapshot                                                   │  │
│  │  ├── roundNumber: number                                          │  │
│  │  ├── timestamp: string                                            │  │
│  │  ├── opinions: AgentOpinion[]                                      │  │
│  │  ├── beliefChanges: Record<string, { old, new, reason }>          │  │
│  │  ├── influenceEvents: InfluenceEvent[]                            │  │
│  │  └── converged: boolean                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             ↓                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  State Snapshot                                                   │  │
│  │  ├── agentStates: Map<string, AgentState>                         │  │
│  │  ├── interactionGraph: InteractionGraph                           │  │
│  │  ├── beliefTrajectories: Record<string, { round, belief, conf }>  │  │
│  │  └── decisionTrace: DecisionTraceEntry[]                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             ↓                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Evaluation Snapshot                                              │  │
│  │  ├── roundNumber: number                                          │  │
│  │  ├── evaluationResult: EvaluationResult                           │  │
│  │  ├── metricsDelta: Record<string, number>                         │  │
│  │  └── grade: "excellent" | "good" | "fair" | "poor" | "critical"   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             ↓                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Governance Snapshot                                              │  │
│  │  ├── roundNumber: number                                          │  │
│  │  ├── issues: GovernanceIssue[]                                    │  │
│  │  ├── interventions: Intervention[]                                 │  │
│  │  ├── appliedInterventions: Intervention[]                          │  │
│  │  └── effectMetrics: Record<string, number>                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             ↓                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Decision Snapshot                                                │  │
│  │  ├── roundNumber: number                                          │  │
│  │  ├── finalDecision: string                                        │  │
│  │  ├── consensusLevel: number                                       │  │
│  │  ├── avgBelief: number                                            │  │
│  │  └── avgConfidence: number                                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             ↓                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Research Artifact                           │  │
│  │  ├── experimentId: string                                         │  │
│  │  ├── task: Task                                                   │  │
│  │  ├── config: ExperimentConfig                                     │  │
│  │  ├── snapshots: {                                                 │  │
│  │  │     rounds: RoundSnapshot[]                                    │  │
│  │  │     states: StateSnapshot[]                                    │  │
│  │  │     evaluations: EvaluationSnapshot[]                          │  │
│  │  │     governances: GovernanceSnapshot[]                          │  │
│  │  │     decisions: DecisionSnapshot[]                              │  │
│  │  │   }                                                            │  │
│  │  ├── timeline: TimelineEntry[]                                    │  │
│  │  ├── metadata: {                                                  │  │
│  │  │     startTime, endTime, totalRounds, converged, elapsedMs      │  │
│  │  │   }                                                            │  │
│  │  └── terminationReason: string                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             ↓                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Research Report                                 │  │
│  │  ├── 从 Artifact 自动汇总生成                                        │  │
│  │  ├── discussion_summary                                            │  │
│  │  ├── opinion_evolution                                              │  │
│  │  ├── evidence_evolution                                            │  │
│  │  ├── influence_graph                                                │  │
│  │  ├── conflict_timeline                                              │  │
│  │  ├── consensus_evolution                                            │  │
│  │  ├── evaluation_metrics                                             │  │
│  │  ├── governance_actions                                             │  │
│  │  ├── final_decision                                                 │  │
│  │  ├── experiment_metadata                                            │  │
│  │  └── future_work                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 5.4 Artifact 存储策略

| 存储方式 | 适用场景 | 实现方式 |
|----------|----------|----------|
| **内存存储** | 实验运行期间 | RuntimeContext.artifact |
| **文件存储** | 实验完成后持久化 | JSON 文件 |
| **数据库存储** | 长期归档和查询 | SQLite/Prisma |
| **快照存储** | 状态回放 | 每轮快照文件 |

---

# 6. Runtime Extensibility Review

## 6.1 新增模块分析

| 新增模块 | 当前接口是否足够 | 潜在瓶颈 | Future-Proof 建议 |
|----------|------------------|----------|-------------------|
| **新 Evaluation** | ❌ | EvaluationEngine 接口硬编码 | 设计 `EvaluationStrategy` 接口，支持动态注册 |
| **新 Governance** | ❌ | InterventionStrategy 接口有限 | 扩展 `InterventionStrategy`，支持自定义检测和干预 |
| **新 Agent Framework** | ❌ | DiscussionAgent 接口简单 | 设计 `AgentAdapter` 模式，支持多种 Agent 框架 |
| **新 Benchmark** | ✅ | 无 | Benchmark 接口已定义 |
| **新 Termination Strategy** | ✅ | 无 | TerminationStrategy 接口已设计 |
| **新 Visualization** | ❌ | 无可视化接口 | 设计 `VisualizationPlugin` 接口 |
| **新 Research Module** | ❌ | 无扩展点 | 设计 `ResearchPlugin` 接口 |

## 6.2 扩展点设计

### 6.2.1 EvaluationStrategy 接口

```typescript
interface EvaluationStrategy {
  name: string;
  evaluate(context: RuntimeContext): EvaluationMetric;
  getWeight(): number;
}
```

### 6.2.2 AgentAdapter 模式

```typescript
interface AgentAdapter {
  name: string;
  createAgent(config: AgentConfig): Promise<DiscussionAgent>;
  adaptToDiscussionAgent(rawAgent: unknown): DiscussionAgent;
}
```

### 6.2.3 VisualizationPlugin 接口

```typescript
interface VisualizationPlugin {
  name: string;
  type: "chart" | "graph" | "timeline" | "heatmap";
  render(context: RuntimeContext): VisualizationData;
}
```

### 6.2.4 ResearchPlugin 接口

```typescript
interface ResearchPlugin {
  name: string;
  type: "analysis" | "transformation" | "export";
  execute(context: RuntimeContext): ResearchResult;
}
```

## 6.3 插件注册机制

```typescript
interface PluginRegistry {
  register(type: string, plugin: Plugin): void;
  get(type: string, name: string): Plugin | undefined;
  getAll(type: string): Plugin[];
  unregister(type: string, name: string): void;
}
```

---

# 7. Runtime Readiness Checklist

## 7.1 逐项检查

| 检查项 | 状态 | 说明 | 修改建议 |
|--------|------|------|----------|
| □ Runtime 数据流明确 | ⚠️ 部分明确 | 目标数据流已设计，但当前实现不符合 | 按目标数据流重构 |
| □ RuntimeContext 唯一状态源 | ❌ 不满足 | DiscussionEngine 维护大量本地状态 | 迁移所有状态到 RuntimeContext |
| □ Scheduler 唯一调度者 | ❌ 不满足 | DiscussionEngine.run() 控制循环 | 拆分循环控制到 RuntimeScheduler |
| □ 模块职责完全解耦 | ⚠️ 部分解耦 | Evaluation 和 Governance 已解耦，Discussion 未解耦 | 拆分 DiscussionEngine |
| □ Evaluation 不依赖 Discussion | ✅ 满足 | EvaluationEngine 只接收数据参数 | 保持现状 |
| □ Governance 不依赖 Discussion | ✅ 满足 | GovernanceEngine 只接收数据参数 | 保持现状 |
| □ 所有状态可追踪 | ❌ 不满足 | 状态分散，无法统一追踪 | 使用 RuntimeContext.timeline |
| □ 所有状态可回放 | ❌ 不满足 | 无快照机制 | 实现 Research Artifact |
| □ 所有接口支持未来插件扩展 | ❌ 不满足 | 缺少通用插件接口 | 设计 PluginRegistry |
| □ Runtime 支持未来实验平台 | ⚠️ 部分支持 | 缺少与外部平台的集成接口 | 设计 PlatformAdapter |

## 7.2 未满足项分析

### 7.2.1 RuntimeContext 唯一状态源

**问题**: DiscussionEngine 内部维护了 `agentStates`、`roundDataArray`、`graphBuilder`、`memoryManager`、`traceBuilder`、`eventTracker` 等多个本地状态。

**影响**: 其他模块无法直接访问讨论状态，必须通过 DiscussionEngine 的方法获取，导致耦合。

**修改建议**: 
1. 创建 RuntimeContext 作为唯一状态容器
2. 将 DiscussionEngine 的所有本地状态迁移到 RuntimeContext
3. DiscussionEngine 只负责单轮讨论执行，不维护状态

### 7.2.2 Scheduler 唯一调度者

**问题**: DiscussionEngine.run() 方法包含完整的循环控制逻辑，包括：
- 轮次迭代
- 终止判断
- 治理调用
- 状态更新

**影响**: Runtime 无法控制讨论流程，DiscussionEngine 成为事实上的调度者。

**修改建议**:
1. 创建 RuntimeScheduler 负责循环控制
2. DiscussionEngine 新增 `executeRound()` 方法只执行单轮
3. 保留 `run()` 方法作为兼容层

### 7.2.3 所有状态可追踪

**问题**: 当前状态变更分散在各模块内部，没有统一的事件追踪机制。

**修改建议**:
1. 在 RuntimeContext 中添加 `timeline` 数组
2. 所有状态变更都通过事件发布到 timeline
3. 提供 timeline 查询接口

### 7.2.4 所有状态可回放

**问题**: 没有实验快照机制，无法重现历史实验。

**修改建议**:
1. 实现 Research Artifact 自动收集
2. 每轮结束后自动生成快照
3. 提供快照加载和回放接口

### 7.2.5 所有接口支持未来插件扩展

**问题**: 当前 Evaluation、Governance、Agent 等接口不支持动态插件注册。

**修改建议**:
1. 设计统一的 PluginRegistry 接口
2. 定义 EvaluationStrategy、InterventionStrategy、AgentAdapter 等扩展接口
3. 实现策略模式支持动态切换

---

# 8. Recommendations

## 8.1 必须修复的问题

| 优先级 | 问题 | 修复方式 | 影响范围 |
|--------|------|----------|----------|
| **P0** | RuntimeContext 唯一状态源 | 迁移 DiscussionEngine 状态 | 高 |
| **P0** | Scheduler 唯一调度者 | 拆分 DiscussionEngine.run() | 高 |
| **P0** | 状态可追踪 | 实现 RuntimeContext.timeline | 中 |
| **P1** | 状态可回放 | 实现 Research Artifact | 中 |
| **P1** | 插件扩展接口 | 设计 PluginRegistry | 低 |

## 8.2 Phase A 调整建议

在开始 Phase A（Runtime Types & Interfaces）之前，建议：

1. **扩展类型定义范围**: 不仅定义 Runtime 类型，还要定义 PluginRegistry、EvaluationStrategy、AgentAdapter 等扩展接口
2. **设计状态迁移路径**: 在 types.ts 中明确当前状态到目标状态的映射关系
3. **定义 Artifact 类型**: 提前定义 ResearchArtifact 和各快照类型

## 8.3 架构校准结论

**当前架构就绪度: 6/10**

虽然整体架构设计合理，但现有代码存在以下关键问题需要在 Phase A 之前或期间解决：

1. **状态分散**: DiscussionEngine 是状态孤岛，必须迁移到 RuntimeContext
2. **流程控制**: DiscussionEngine 控制循环，必须由 RuntimeScheduler 接管
3. **可扩展性**: 缺少通用插件接口，必须设计 PluginRegistry

**建议**: 在 Phase A 中同时解决这些问题的类型定义，为后续实现奠定基础。

---

> **Architecture Calibration 完成。**  
> **建议开始 Phase A，重点关注：**  
> 1. RuntimeContext 类型定义（包含所有状态）  
> 2. PluginRegistry 和扩展接口定义  
> 3. ResearchArtifact 类型定义
