# Decision Trace Refactor Proposal

> 版本: 1.0  
> 更新时间: 2026-07-01  
> 状态: 待确认

---

## 一、当前状态分析

### 1.1 当前 DecisionTraceBuilder 能力评估

| 研究问题 | 当前能力 | 评分 |
|----------|----------|------|
| Who influenced whom? | 部分支持（通过 influencers 数组） | ⚠️ 6/10 |
| When? | 部分支持（timestamp） | ⚠️ 5/10 |
| Why? | 基本不支持 | ❌ 2/10 |
| Belief changed because of what? | 不支持 | ❌ 1/10 |
| Consensus emerged at which step? | 不支持 | ❌ 1/10 |

### 1.2 当前数据结构缺陷

**当前类型定义**：[types.ts#L71-L80](file:///C:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/types.ts#L71-L80)

```typescript
export interface DecisionTraceEntry {
  agentId: string;
  roundNumber: number;
  decision: string;
  belief: number;
  beliefChange: number;
  influencers: string[];
  reasoning: string;
  timestamp: string;
}
```

**缺陷分析**：

| 字段 | 问题 | 影响 |
|------|------|------|
| `influencers` | 仅存储 Agent ID，缺少影响权重和类型 | 无法量化影响程度 |
| `decision` | 简单文本提取，缺少结构化表示 | 难以进行决策分析 |
| `beliefChange` | 仅数值，缺少变化原因 | 无法回答 "why" |
| `reasoning` | 原始文本，未关联到影响因素 | 难以追溯推理链 |
| 缺少 `causalFactors` | 完全缺失 | 无法回答 "because of what" |
| 缺少 `consensusEvent` | 完全缺失 | 无法追踪共识形成时刻 |

---

## 二、核心问题：Decision Trace 是否能够回答研究问题？

### 2.1 逐项检查

#### 问题 1：Who influenced whom?

**当前状态**：部分支持

- ✅ 记录了 `influencers` 数组
- ❌ 缺少影响类型（agreement/disagreement/reference/persuasion）
- ❌ 缺少影响权重
- ❌ 缺少方向（谁影响了谁）

**改进方向**：将 `influencers` 从字符串数组升级为包含权重和类型的对象数组。

#### 问题 2：When?

**当前状态**：部分支持

- ✅ 记录了 `timestamp`
- ❌ 缺少相对时间（距上一次变化的时间）
- ❌ 缺少讨论阶段标记（开始/中间/收敛）
- ❌ 缺少事件类型（初始观点/回应/反驳/共识）

**改进方向**：增加时间分析维度和事件类型标记。

#### 问题 3：Why?

**当前状态**：基本不支持

- ❌ 缺少信念变化的原因说明
- ❌ 缺少证据引用
- ❌ 缺少逻辑推理链
- ❌ 缺少外部信息影响

**改进方向**：增加因果分析字段，记录信念变化的直接原因。

#### 问题 4：Belief changed because of what?

**当前状态**：不支持

- ❌ 缺少因果因素追踪
- ❌ 缺少影响源类型（Agent/Evidence/External）
- ❌ 缺少影响路径
- ❌ 缺少置信度变化原因

**改进方向**：建立因果因素模型，追踪信念变化的完整原因链。

#### 问题 5：Consensus emerged at which step?

**当前状态**：不支持

- ❌ 缺少共识形成事件
- ❌ 缺少共识度追踪
- ❌ 缺少收敛检测记录
- ❌ 缺少转折点标记

**改进方向**：增加共识追踪机制，标记共识形成的关键步骤。

---

## 三、重构方案

### 3.1 新类型定义

```typescript
export interface InfluenceRecord {
  sourceAgentId: string;
  targetAgentId: string;
  type: InfluenceType;
  weight: number;
  round: number;
  timestamp: string;
  reasoning: string;
}

export interface CausalFactor {
  type: "agent_influence" | "evidence" | "external" | "self_reflection" | "discussion";
  sourceId?: string;
  description: string;
  weight: number;
}

export interface DecisionEvent {
  type: "initial_opinion" | "response" | "refutation" | "agreement" | "disagreement" | 
        "consensus" | "convergence" | "divergence" | "persuasion";
  agentId: string;
  roundNumber: number;
  timestamp: string;
  description: string;
  involvedAgents: string[];
}

export interface DecisionTraceEntry {
  agentId: string;
  roundNumber: number;
  timestamp: string;
  
  belief: number;
  beliefChange: number;
  beliefChangeReasons: CausalFactor[];
  
  confidence: number;
  confidenceChange: number;
  
  decision: string;
  decisionType: "affirmative" | "negative" | "neutral" | "conditional";
  
  reasoning: string;
  evidence: string[];
  
  influencesReceived: InfluenceRecord[];
  influencesExerted: InfluenceRecord[];
  
  referencedAgents: string[];
  referencedEvidence: string[];
  
  eventType: DecisionEvent["type"];
}

export interface ConsensusEvent {
  roundNumber: number;
  timestamp: string;
  consensusLevel: number;
  agentsInAgreement: string[];
  agentsInDisagreement: string[];
  beliefStd: number;
  triggerDescription: string;
}

export interface DecisionTrace {
  entries: DecisionTraceEntry[];
  consensusEvents: ConsensusEvent[];
  influenceGraph: InfluenceRecord[];
  beliefTrajectories: Record<string, { round: number; belief: number; confidence: number }[]>;
}
```

### 3.2 新 DecisionTraceBuilder 接口

```typescript
export interface DecisionTraceBuilder {
  addRound(opinions: AgentOpinion[], memory: DiscussionMemoryEntry[], graph: InteractionGraph): void;
  
  addInfluence(sourceAgentId: string, targetAgentId: string, type: InfluenceType, weight: number): void;
  
  recordBeliefChange(
    agentId: string,
    roundNumber: number,
    oldBelief: number,
    newBelief: number,
    reasons: CausalFactor[]
  ): void;
  
  recordConsensusEvent(roundNumber: number, description: string): void;
  
  getTrace(): DecisionTrace;
  
  getBeliefTrajectory(agentId: string): { round: number; belief: number; confidence: number }[];
  
  getInfluenceChain(agentId: string): InfluenceRecord[];
  
  getConsensusTimeline(): ConsensusEvent[];
  
  answerWhoInfluencedWhom(): { source: string; target: string; weight: number; type: string }[];
  
  answerWhen(agentId: string): { event: DecisionEvent; timestamp: string }[];
  
  answerWhy(agentId: string): CausalFactor[];
  
  answerBeliefChangedBecauseOf(agentId: string, roundNumber: number): CausalFactor[];
  
  answerConsensusEmergedAt(): ConsensusEvent | null;
  
  summarize(): {
    totalRounds: number;
    totalAgents: number;
    keyInfluencers: { agentId: string; influenceCount: number; totalWeight: number }[];
    beliefChanges: Record<string, { max: number; min: number; avg: number }>;
    consensusTimeline: ConsensusEvent[];
    criticalEvents: DecisionEvent[];
  };
}
```

---

## 四、重构前后对比

### 4.1 数据结构对比

| 特性 | 重构前 | 重构后 |
|------|--------|--------|
| 影响记录 | 仅 Agent ID 数组 | 完整 InfluenceRecord 对象 |
| 因果分析 | 无 | CausalFactor 数组 |
| 事件追踪 | 无 | DecisionEvent 类型系统 |
| 共识事件 | 无 | ConsensusEvent 序列 |
| 信念轨迹 | Map 存储 | 结构化轨迹记录 |
| 影响链 | 简单递归 | 完整影响路径 |

### 4.2 查询能力对比

| 研究问题 | 重构前 | 重构后 |
|----------|--------|--------|
| Who influenced whom? | 通过 influencers 字段 | `answerWhoInfluencedWhom()` |
| When? | 通过 timestamp | `answerWhen()` + 事件类型 |
| Why? | 不支持 | `answerWhy()` + CausalFactor |
| Belief changed because of what? | 不支持 | `answerBeliefChangedBecauseOf()` |
| Consensus emerged at which step? | 不支持 | `answerConsensusEmergedAt()` |

---

## 五、实施计划

### 5.1 阶段一：类型定义重构

| 步骤 | 任务 | 代码位置 |
|------|------|----------|
| 1 | 更新 `types.ts` 添加新类型 | `src/lib/discussion/types.ts` |
| 2 | 更新 `DecisionTraceBuilder` 接口 | `src/lib/discussion/decisionTrace.ts` |
| 3 | 更新 `DiscussionResult` 类型 | `src/lib/discussion/types.ts` |

### 5.2 阶段二：实现重构

| 步骤 | 任务 | 代码位置 |
|------|------|----------|
| 1 | 实现新的 `DecisionTraceBuilder` 类 | `src/lib/discussion/decisionTrace.ts` |
| 2 | 更新 `DiscussionEngine` 集成 | `src/lib/discussion/index.ts` |
| 3 | 更新 `BeliefUpdate` 传递因果因素 | `src/lib/discussion/beliefUpdate.ts` |
| 4 | 更新 `InfluenceEngine` 记录影响 | `src/lib/discussion/influence.ts` |

### 5.3 阶段三：API 对接

| 步骤 | 任务 | 代码位置 |
|------|------|----------|
| 1 | 更新 API 返回完整 Decision Trace | `src/app/api/v3/execute/route.ts` |
| 2 | 更新 Evaluation Engine 使用新数据 | `src/lib/evaluation/index.ts` |
| 3 | 更新 Governance Engine 使用新数据 | `src/lib/governance/index.ts` |

---

## 六、优先级与风险

### 6.1 优先级评估

| 优先级 | 改进项 | 研究价值 | 工程成本 |
|--------|--------|----------|----------|
| P0 | 因果因素追踪 | 高 | 中 |
| P0 | 影响记录完善 | 高 | 低 |
| P1 | 共识事件追踪 | 高 | 中 |
| P1 | 事件类型系统 | 中 | 中 |
| P2 | 信念轨迹优化 | 中 | 低 |
| P2 | 查询方法实现 | 高 | 低 |

### 6.2 风险评估

| 风险 | 严重程度 | 缓解措施 |
|------|----------|----------|
| 类型变更影响现有代码 | 高 | 保持向后兼容，逐步替换 |
| 数据量增加 | 中 | 提供精简模式选项 |
| 性能影响 | 低 | 优化数据结构和查询算法 |

---

## 七、预期收益

### 7.1 科研价值提升

| 指标 | 当前状态 | 重构后 |
|------|----------|--------|
| 可追溯性 | 低 | 高 |
| 因果分析能力 | 无 | 强 |
| 共识追踪 | 无 | 完整 |
| 影响量化 | 弱 | 强 |
| 实验可重复性 | 低 | 高 |

### 7.2 下游模块收益

| 模块 | 收益 |
|------|------|
| Evaluation Engine | 可基于因果因素进行更精确的评价 |
| Governance Engine | 可基于影响链进行更精准的干预 |
| Benchmark | 可追踪决策形成过程，支持对比分析 |
| Visualization | 可展示完整的决策时间线和影响网络 |

---

## 八、结论

当前 Decision Trace 仅记录了基本的信念变化和时间戳，**无法回答科研所需的关键问题**（Who/When/Why/Because of what/Consensus at which step）。

重构方案通过引入：
1. **InfluenceRecord** - 完整的影响记录
2. **CausalFactor** - 因果因素追踪
3. **DecisionEvent** - 事件类型系统
4. **ConsensusEvent** - 共识事件追踪

将 Decision Trace 从「简单日志记录」升级为「完整决策形成过程记录」，使其成为 Evaluation、Governance 和未来研究的核心数据资产。

**建议优先实施阶段一和阶段二，确保类型定义和核心实现的完整性，再进行 API 对接。**
