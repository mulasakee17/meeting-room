# SwarmAlpha V3 —— Collective Decision State Model (CDSM) Design

> 版本: 1.0  
> 更新时间: 2026-07-02  
> 状态: Research Design  
> 核心研究问题: **How can we evaluate and govern collective decision-making in LLM-based multi-agent systems?**

---

## 目录

1. [Observation Model](#1-observation-model)
2. [Collective Decision State Model (CDSM)](#2-collective-decision-state-model-cdsm)
3. [State Evolution Model](#3-state-evolution-model)
4. [Inference Pipeline Design](#4-inference-pipeline-design)
5. [Decision Trace Refactor Proposal](#5-decision-trace-refactor-proposal)
6. [Evaluation Dependency Map](#6-evaluation-dependency-map)
7. [Governance Dependency Map](#7-governance-dependency-map)
8. [Overall Architecture Proposal](#8-overall-architecture-proposal)

---

# 1. Observation Model

## 1.1 设计原则

Observation Model 的核心原则：
- **Raw Observation**: Agent 自然产生，系统直接记录，不做推断
- **System Inferred**: 系统从 Raw Observation 自动推断，不由 Agent 填写
- **Inference Feasibility Test**: 每个推断状态必须有明确的推断路径

## 1.2 Agent Native Outputs（Raw Observation）

| 类别 | 字段 | 定义 | 来源 | 推断可行性 |
|------|------|------|------|------------|
| **Claim** | `claim` | Agent 当前持有的观点/主张 | LLM 输出 | ✅ 直接提取 |
| **Reasoning** | `reasoning` | Agent 的推理过程文本 | LLM 输出 | ✅ 直接提取 |
| **Evidence** | `evidence` | Agent 引用的证据列表 | LLM 输出 | ✅ 直接提取 |
| **Confidence** | `confidence` | Agent 对自身观点的置信度 (0-100) | LLM 输出 | ✅ 直接提取 |
| **References** | `referencedAgents` | Agent 在本轮引用的其他 Agent ID | LLM 输出 | ✅ 直接提取 |
| **Questions** | `questions` | Agent 提出的问题列表 | LLM 输出 | ✅ 直接提取 |
| **CounterArguments** | `counterArguments` | Agent 提出的反驳论点 | LLM 输出 | ✅ 直接提取 |

## 1.3 System Inferred States（推断状态）

| 类别 | 字段 | 定义 | 推断方式 | 推断可行性 |
|------|------|------|----------|------------|
| **Opinion Change** | `opinionChange` | 与上一轮相比观点的变化程度 | 语义相似度对比 | ✅ 可行 |
| **Evidence Adoption** | `evidenceAdoption` | Agent 采用其他 Agent 证据的程度 | 证据文本匹配 | ✅ 可行 |
| **Belief Evolution** | `beliefEvolution` | 信念值的变化轨迹 | 数值对比 | ✅ 可行 |
| **Influence** | `influence` | Agent 对其他 Agent 的影响力 | 引用分析 + 信念变化 | ✅ 可行 |
| **Conflict** | `conflict` | Agent 之间的冲突程度 | 语义对立检测 | ✅ 可行 |
| **Consensus Trend** | `consensusTrend` | 群体共识的变化趋势 | 统计计算 | ✅ 可行 |
| **Reasoning Shift** | `reasoningShift` | 推理逻辑的变化程度 | 推理文本相似度 | ✅ 可行 |
| **Topic Focus** | `topicFocus` | 讨论主题的集中度 | 关键词分析 | ✅ 可行 |

## 1.4 Inference Feasibility 评估

| 状态 | 推断方法 | 可靠性 | 研究价值 |
|------|----------|--------|----------|
| Opinion Change | 语义相似度 (Cosine/Sentence-BERT) | 高 | 高 |
| Evidence Adoption | 文本匹配 + 引用追踪 | 中 | 高 |
| Belief Evolution | 数值差分 | 高 | 高 |
| Influence | 引用网络 + 因果推断 | 中 | 高 |
| Conflict | 语义对立检测 | 中 | 高 |
| Consensus Trend | Kuramoto Order + 标准差 | 高 | 高 |
| Reasoning Shift | 推理结构分析 | 低 | 中 |
| Topic Focus | TF-IDF / LDA | 中 | 中 |

---

# 2. Collective Decision State Model (CDSM)

## 2.1 状态模型架构

```
Collective Decision State
├── Agent State (per agent)
│   ├── OpinionState
│   ├── BeliefState
│   ├── EvidenceState
│   ├── ConfidenceState
│   └── ReasoningState
├── Interaction State
│   ├── InfluenceState
│   ├── ConflictState
│   └── ReferenceState
├── Group State
│   ├── ConsensusState
│   ├── PolarizationState
│   └── UncertaintyState
└── Evolution State
    ├── TrajectoryState
    ├── TransitionState
    └── EventState
```

## 2.2 Agent 级状态

### 2.2.1 OpinionState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `claim` | string | 当前主张 | Raw | 每轮更新 |
| `previousClaim` | string | 上一轮主张 | Inferred | 轮次切换时保存 |
| `changeScore` | number | 变化程度 (0-1) | Inferred | 语义对比 |
| `changeType` | enum | 变化类型 | Inferred | 规则判断 |
| `changeReason` | string | 变化原因 | Inferred | LLM 分析 |

**变化类型枚举**:
- `none` - 无变化
- `strengthen` - 强化
- `weaken` - 弱化
- `reverse` - 反转
- `refine` - 细化

### 2.2.2 BeliefState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `value` | number | 信念值 (-1 到 1) | Raw | 每轮更新 |
| `previousValue` | number | 上一轮信念值 | Inferred | 轮次切换时保存 |
| `delta` | number | 变化量 | Inferred | 数值差分 |
| `trajectory` | number[] | 历史轨迹 | Inferred | 累积记录 |
| `stability` | number | 稳定性 | Inferred | 统计计算 |

### 2.2.3 EvidenceState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `internal` | string[] | 内部证据（Agent 自身生成） | Raw | 每轮追加 |
| `external` | string[] | 外部证据（引用自其他来源） | Raw | 每轮追加 |
| `adopted` | string[] | 采用自其他 Agent 的证据 | Inferred | 文本匹配 |
| `citations` | Record<string, number> | 证据引用计数 | Inferred | 统计 |
| `freshness` | number | 证据新鲜度 | Inferred | 时间衰减 |

### 2.2.4 ConfidenceState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `value` | number | 置信度 (0-100) | Raw | 每轮更新 |
| `previousValue` | number | 上一轮置信度 | Inferred | 轮次切换时保存 |
| `delta` | number | 变化量 | Inferred | 数值差分 |
| `justificationScore` | number | 置信度合理性 | Inferred | 证据/推理质量 |

### 2.2.5 ReasoningState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `text` | string | 推理文本 | Raw | 每轮更新 |
| `structure` | ReasoningStructure | 推理结构 | Inferred | LLM 解析 |
| `shiftScore` | number | 推理变化程度 | Inferred | 语义对比 |
| `qualityScore` | number | 推理质量 | Inferred | LLM 评估 |

**ReasoningStructure**:
```
{
  premises: string[],
  logicType: "deductive" | "inductive" | "abductive" | "analogical",
  gaps: number,
  completeness: number
}
```

## 2.3 Interaction 级状态

### 2.3.1 InfluenceState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `sourceAgentId` | string | 影响源 | Inferred | 引用分析 |
| `targetAgentId` | string | 影响目标 | Inferred | 引用分析 |
| `type` | enum | 影响类型 | Inferred | 规则判断 |
| `strength` | number | 影响强度 (0-1) | Inferred | 综合计算 |
| `round` | number | 影响发生轮次 | Inferred | 记录 |
| `mechanism` | string | 影响机制 | Inferred | LLM 分析 |

**影响类型枚举**:
- `persuasion` - 说服
- `information` - 信息提供
- `social_proof` - 社会证明
- `authority` - 权威
- `reciprocity` - 互惠

### 2.3.2 ConflictState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `agentIds` | string[] | 冲突涉及的 Agent | Inferred | 语义对立检测 |
| `severity` | number | 冲突严重程度 (0-1) | Inferred | 综合计算 |
| `type` | enum | 冲突类型 | Inferred | 规则判断 |
| `resolved` | boolean | 是否已解决 | Inferred | 后续轮次检测 |
| `resolutionRound` | number | 解决轮次 | Inferred | 记录 |

**冲突类型枚举**:
- `belief` - 信念冲突
- `evidence` - 证据冲突
- `reasoning` - 推理冲突
- `value` - 价值冲突

### 2.3.3 ReferenceState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `sourceAgentId` | string | 被引用 Agent | Raw | 引用列表 |
| `targetAgentId` | string | 引用 Agent | Raw | 引用列表 |
| `referenceType` | enum | 引用类型 | Inferred | 语义分析 |
| `content` | string | 引用内容 | Inferred | 文本提取 |
| `round` | number | 引用轮次 | Raw | 记录 |

**引用类型枚举**:
- `agreement` - 同意引用
- `disagreement` - 反对引用
- `neutral` - 中性引用
- `question` - 质疑引用

## 2.4 Group 级状态

### 2.4.1 ConsensusState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `level` | number | 共识度 (0-1) | Inferred | Kuramoto Order |
| `trend` | enum | 趋势 | Inferred | 变化方向 |
| `agentsInAgreement` | string[] | 达成共识的 Agent | Inferred | 阈值判断 |
| `agentsInDisagreement` | string[] | 未达成共识的 Agent | Inferred | 阈值判断 |
| `converged` | boolean | 是否已收敛 | Inferred | 阈值判断 |
| `convergenceRound` | number | 收敛轮次 | Inferred | 记录 |

**趋势枚举**:
- `increasing` - 上升
- `decreasing` - 下降
- `stable` - 稳定

### 2.4.2 PolarizationState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|------|----------|
| `index` | number | 极化指数 (0-1) | Inferred | 统计计算 |
| `groups` | PolarizationGroup[] | 极化分组 | Inferred | 聚类分析 |
| `bimodality` | number | 双峰性 | Inferred | 统计计算 |
| `extremity` | number | 极端程度 | Inferred | 统计计算 |

**PolarizationGroup**:
```
{
  label: string,
  agentIds: string[],
  averageBelief: number,
  size: number
}
```

### 2.4.3 UncertaintyState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `epistemic` | number | 认知不确定性 | Inferred | 证据质量 |
| `aleatoric` | number | 随机不确定性 | Inferred | 信念分布 |
| `total` | number | 总不确定性 | Inferred | 综合计算 |
| `confidenceEntropy` | number | 置信度熵 | Inferred | 统计计算 |

## 2.5 Evolution 级状态

### 2.5.1 TrajectoryState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `rounds` | RoundState[] | 每轮状态 | Inferred | 累积记录 |
| `milestones` | Milestone[] | 关键里程碑 | Inferred | 事件检测 |
| `duration` | number | 讨论时长(ms) | Inferred | 时间计算 |

**Milestone**:
```
{
  round: number,
  type: "initial" | "conflict" | "persuasion" | "consensus" | "decision",
  description: string,
  timestamp: string
}
```

### 2.5.2 TransitionState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `fromState` | string | 起始状态 | Inferred | 状态对比 |
| `toState` | string | 目标状态 | Inferred | 状态对比 |
| `trigger` | string | 触发事件 | Inferred | 事件分析 |
| `probability` | number | 转移概率 | Inferred | 统计学习 |

### 2.5.3 EventState

| 属性 | 类型 | 定义 | 来源 | 更新方式 |
|------|------|------|------|----------|
| `events` | Event[] | 事件列表 | Inferred | 事件检测 |
| `eventGraph` | EventGraph | 事件因果图 | Inferred | 因果推断 |

**Event**:
```
{
  id: string,
  type: string,
  agentIds: string[],
  round: number,
  timestamp: string,
  payload: Record<string, unknown>
}
```

---

# 3. State Evolution Model

## 3.1 状态演化流程

```
Round N                          Round N+1
    ↓                               ↓
┌───────────────┐           ┌───────────────┐
│  Agent Output │           │  Agent Output │
│  (Raw)        │           │  (Raw)        │
└───────────────┘           └───────────────┘
        ↓                               ↓
┌───────────────┐           ┌───────────────┐
│  Observation  │           │  Observation  │
│  Layer        │           │  Layer        │
└───────────────┘           └───────────────┘
        ↓                               ↓
┌───────────────┐           ┌───────────────┐
│  Inference    │           │  Inference    │
│  Layer        │           │  Layer        │
└───────────────┘           └───────────────┘
        ↓                               ↓
┌───────────────┐           ┌───────────────┐
│  State Update │           │  State Update │
│  (Delta)      │           │  (Delta)      │
└───────────────┘           └───────────────┘
        ↓                               ↓
┌───────────────┐           ┌───────────────┐
│  Trajectory   │           │  Trajectory   │
│  Append       │           │  Append       │
└───────────────┘           └───────────────┘
```

## 3.2 状态转换规则

### 3.2.1 OpinionState 转换

| 触发事件 | 转换规则 |
|----------|----------|
| 新主张与旧主张语义相似度 > 0.85 | changeType = "none" |
| 新主张与旧主张语义相似度 0.7-0.85 | changeType = "refine" |
| 信念值增加 > 0.1 | changeType = "strengthen" |
| 信念值减少 > 0.1 | changeType = "weaken" |
| 信念值符号反转 | changeType = "reverse" |

### 3.2.2 BeliefState 转换

| 触发事件 | 转换规则 |
|----------|----------|
| Agent 接收新证据 | delta += evidence_weight * quality_factor |
| Agent 被其他 Agent 引用 | delta += influence_weight * trust_factor |
| Agent 引用其他 Agent | delta += reference_weight * similarity_factor |
| Agent 反驳其他 Agent | delta -= opposition_weight |

### 3.2.3 ConsensusState 转换

| 触发事件 | 转换规则 |
|----------|----------|
| 信念标准差 < 0.15 | converged = true |
| 共识度提升 > 0.3 | trend = "increasing", 检测冲突解决 |
| 共识度下降 > 0.2 | trend = "decreasing", 检测新冲突 |
| 新 Agent 加入讨论 | 重新计算共识度 |

### 3.2.4 ConflictState 转换

| 触发事件 | 转换规则 |
|----------|----------|
| 两个 Agent 主张语义对立 | severity += 0.3 |
| Agent 引用并反驳其他 Agent | severity += 0.2 |
| Agent 修改主张接近对手 | severity -= 0.2 |
| 冲突持续超过 2 轮 | severity += 0.1/轮 |
| 双方达成一致 | resolved = true |

### 3.2.5 InfluenceState 转换

| 触发事件 | 转换规则 |
|----------|----------|
| Agent A 引用 Agent B | strength += 0.2 |
| Agent B 修改主张接近 Agent A | strength += 0.3 |
| Agent B 明确表示受 Agent A 影响 | strength += 0.5 |
| Agent B 反驳 Agent A | strength -= 0.2 |

## 3.3 状态演化约束

1. **时间连续性**: 状态必须在每轮之间平滑过渡
2. **因果一致性**: 状态变化必须有明确的触发事件
3. **可追溯性**: 每个状态值必须能追溯到原始观察
4. **不可覆盖性**: 历史状态必须保留，只能追加
5. **可验证性**: 状态推断必须可独立验证

---

# 4. Inference Pipeline Design

## 4.1 推断管道架构

```
Raw Observations
    ↓
┌─────────────────┐
│  Preprocessing  │  → 文本清洗、标准化、分词
└─────────────────┘
    ↓
┌─────────────────┐
│  Feature Extraction  │  → 语义向量、关键词、结构特征
└─────────────────┘
    ↓
┌─────────────────┐
│  State Inference  │  → 规则引擎 + ML 模型
└─────────────────┘
    ↓
┌─────────────────┐
│  Consistency Check  │  → 跨状态一致性验证
└─────────────────┘
    ↓
Collective Decision State
```

## 4.2 推断层级

### Level 1: 文本解析层

| 任务 | 方法 | 输出 |
|------|------|------|
| 主张提取 | 规则 + LLM 解析 | claim |
| 推理结构分析 | LLM 解析 | reasoningStructure |
| 证据提取 | 规则 + 正则 | evidence[] |
| 引用识别 | 文本匹配 | referencedAgents[] |

### Level 2: 语义分析层

| 任务 | 方法 | 输出 |
|------|------|------|
| 语义相似度 | Sentence-BERT | similarity_score |
| 对立检测 | 语义向量夹角 | conflict_score |
| 证据匹配 | 文本相似度 | adoption_score |
| 主题识别 | TF-IDF / LDA | topic_distribution |

### Level 3: 状态推断层

| 任务 | 方法 | 输出 |
|------|------|------|
| Opinion Change | 语义相似度 + 信念变化 | opinionChange |
| Influence | 引用网络 + 因果推断 | influence |
| Consensus | Kuramoto Order + 标准差 | consensusLevel |
| Conflict | 对立检测 + 引用分析 | conflict |

### Level 4: 一致性验证层

| 任务 | 方法 | 输出 |
|------|------|------|
| 跨状态一致性 | 约束检查 | consistency_score |
| 因果链验证 | 逻辑推理 | causal_validity |
| 异常检测 | 统计方法 | anomalies[] |

## 4.3 关键推断规则

### 4.3.1 Opinion Change 推断

```
Input: claim_N, claim_N-1, belief_N, belief_N-1
Output: opinionChange (0-1), changeType

1. 计算语义相似度 sim = sentence_bert(claim_N, claim_N-1)
2. 计算信念变化 delta_belief = belief_N - belief_N-1
3. 
4. if sim > 0.85:
    opinionChange = 0
    changeType = "none"
5. elif sim > 0.7:
    opinionChange = 0.3 * (1 - sim)
    changeType = "refine"
6. elif delta_belief > 0.1:
    opinionChange = delta_belief * 0.5
    changeType = "strengthen"
7. elif delta_belief < -0.1:
    opinionChange = abs(delta_belief) * 0.5
    changeType = "weaken"
8. elif sign(belief_N) != sign(belief_N-1):
    opinionChange = 1.0
    changeType = "reverse"
```

### 4.3.2 Influence 推断

```
Input: reference_graph, belief_changes, interaction_history
Output: influence_record[]

1. 构建引用邻接矩阵
2. 对每个引用关系 (A → B):
    a. 计算 B 在引用后的信念变化
    b. 计算 A 的置信度权重
    c. 计算引用类型权重 (persuasion > information > social_proof)
    d. strength = belief_change * confidence_weight * type_weight
3. 返回按 strength 排序的 influence_records
```

### 4.3.3 Conflict 推断

```
Input: claims[], reasoning[], belief_values[]
Output: conflict_record[]

1. 对每对 Agent (A, B):
    a. 计算主张语义对立度 = 1 - similarity(A.claim, B.claim)
    b. 计算信念差异 = abs(A.belief - B.belief)
    c. 检测是否存在反驳引用
    d. severity = 0.4 * opposition + 0.4 * belief_diff + 0.2 * refutation
2. 返回 severity > 0.3 的冲突
```

### 4.3.4 Consensus 推断

```
Input: belief_values[], confidence_values[]
Output: consensus_state

1. kuramoto_order = compute_kuramoto(belief_values)
2. belief_std = compute_std(belief_values)
3. avg_confidence = mean(confidence_values)
4. 
5. consensus_level = 0.4 * kuramoto_order + 0.4 * (1 - belief_std) + 0.2 * (avg_confidence / 100)
6. converged = belief_std < 0.15 && consensus_level > 0.7
```

## 4.4 Inference Feasibility 矩阵

| 推断任务 | 方法 | 数据需求 | 可靠性 | 研究新颖性 |
|----------|------|----------|--------|------------|
| Opinion Change | Sentence-BERT | 两轮主张文本 | 高 | 中 |
| Evidence Adoption | 文本匹配 | 证据文本 | 中 | 高 |
| Influence | 引用网络 + 因果 | 引用关系 + 信念变化 | 中 | 高 |
| Conflict | 语义对立检测 | 主张文本 | 中 | 中 |
| Consensus | Kuramoto Order | 信念值 | 高 | 高 |
| Reasoning Shift | LLM 解析 | 推理文本 | 低 | 高 |
| Topic Focus | TF-IDF | 所有文本 | 中 | 低 |

---

# 5. Decision Trace Refactor Proposal

## 5.1 重新定义

**Decision Trace 不再是日志记录。**

**Decision Trace 是 Collective Decision State 的历史演化记录。**

核心设计原则：
- **状态完整**: 记录每个状态的完整快照
- **变化可追溯**: 记录每个状态变化的原因和触发事件
- **因果可分析**: 记录状态之间的因果关系
- **可回放**: 支持从任意轮次重新构建状态

## 5.2 决策轨迹数据结构

```typescript
interface DecisionTrace {
  experimentId: string;
  task: DiscussionTask;
  timeline: TraceTimeline[];
  stateSnapshots: StateSnapshot[];
  causalGraph: CausalGraph;
  summary: TraceSummary;
}

interface TraceTimeline {
  roundNumber: number;
  timestamp: string;
  events: TraceEvent[];
  stateChanges: StateChange[];
}

interface TraceEvent {
  id: string;
  type: TraceEventType;
  agentId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

type TraceEventType = 
  | "claim_made"
  | "evidence_added"
  | "reference_made"
  | "belief_changed"
  | "confidence_changed"
  | "conflict_detected"
  | "conflict_resolved"
  | "influence_exerted"
  | "consensus_emerged"
  | "intervention_applied";

interface StateChange {
  stateType: string;
  agentId?: string;
  property: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  triggerEventId: string;
}

interface StateSnapshot {
  roundNumber: number;
  timestamp: string;
  agentStates: Record<string, AgentStateSnapshot>;
  groupState: GroupStateSnapshot;
  interactionState: InteractionStateSnapshot;
}

interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
}

interface CausalNode {
  id: string;
  type: "event" | "state" | "decision";
  label: string;
  round: number;
}

interface CausalEdge {
  source: string;
  target: string;
  type: "causes" | "influences" | "triggers";
  weight: number;
  evidence: string;
}

interface TraceSummary {
  totalRounds: number;
  totalEvents: number;
  consensusReached: boolean;
  consensusRound: number;
  keyInfluences: InfluenceSummary[];
  conflicts: ConflictSummary[];
  trajectoryMetrics: TrajectoryMetrics;
}
```

## 5.3 决策轨迹查询能力

| 查询问题 | 实现方式 | 数据来源 |
|----------|----------|----------|
| Who influenced whom? | 遍历 influence_events | InfluenceState |
| When did influence occur? | 按 round 过滤 | TraceTimeline |
| Why did belief change? | 查找 triggerEvent | CausalGraph |
| What changed in each round? | 遍历 stateChanges | StateSnapshot |
| How did consensus emerge? | 分析 trajectory | ConsensusState |
| Where did conflict occur? | 查找 conflict_events | ConflictState |
| Which evidence was adopted? | 查找 evidence_adoption | EvidenceState |
| When was decision made? | 查找 decision_event | Timeline |

## 5.4 决策轨迹存储策略

| 存储类型 | 数据 | 存储方式 | 检索方式 |
|----------|------|----------|----------|
| 时序数据 | 每轮事件 | 时间序列数据库 | 按时间范围查询 |
| 状态快照 | 每轮状态 | 列式存储 | 按轮次查询 |
| 因果图 | 因果关系 | 图数据库 | 路径查询 |
| 索引 | 查询索引 | 倒排索引 | 关键词查询 |

---

# 6. Evaluation Dependency Map

## 6.1 评估指标与状态依赖

### Consensus Quality

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Kuramoto Order | BeliefState.value[] | 直接 | 群体信念值 |
| Belief Std | BeliefState.value[] | 直接 | 群体信念值 |
| Agreement Rate | OpinionState.claim[] | 间接 | 语义相似度 |
| Convergence Speed | ConsensusState.trajectory | 直接 | 历史轨迹 |
| Consensus Stability | ConsensusState.trend | 直接 | 趋势分析 |

### Explainability

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Reasoning Length | ReasoningState.text | 直接 | 原始输出 |
| Attribution Clarity | ReferenceState | 直接 | 引用记录 |
| Step Coverage | TrajectoryState.rounds | 直接 | 轮次记录 |
| Reasoning Quality | ReasoningState.qualityScore | 间接 | LLM 评估 |

### Reliability

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Consistency Score | OpinionState.changeScore | 间接 | 变化分析 |
| Cronbach's Alpha | ConfidenceState.value[] | 直接 | 置信度值 |
| Repeatability Score | BeliefState.trajectory | 间接 | 轨迹稳定性 |
| Confidence Interval | BeliefState.value[] | 直接 | 统计计算 |

### Robustness

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Input Noise | BeliefState.stability | 间接 | 稳定性分析 |
| Agent Dropout | ConfidenceState.value[] | 间接 | 置信度分布 |
| Parameter Variation | TrajectoryState.rounds | 间接 | 跨轮变化 |

### Stability

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Round Consistency | OpinionState.changeScore | 间接 | 变化分析 |
| Time Series Stability | BeliefState.trajectory | 间接 | 轨迹分析 |

### Manipulation Resistance

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Adversarial Test | InfluenceState.strength | 间接 | 影响力分布 |
| Bias Detection | PolarizationState.index | 直接 | 极化指数 |

### Influence Analysis

| 子指标 | 依赖状态 | 依赖类型 | 推断来源 |
|--------|----------|----------|----------|
| Gini Coefficient | InfluenceState.strength[] | 直接 | 影响力值 |
| Degree Centrality | ReferenceState | 间接 | 引用网络 |
| Co-Mention Centrality | ReferenceState | 间接 | 共引分析 |
| Influence Density | InfluenceState | 直接 | 影响网络 |

## 6.2 依赖关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Evaluation Metrics                       │
├─────────────────────────────────────────────────────────────────┤
│  Consensus  ──────────────→  BeliefState, ConsensusState       │
│  Explainability  ──────────→  ReasoningState, ReferenceState    │
│  Reliability  ─────────────→  ConfidenceState, OpinionState     │
│  Robustness  ──────────────→  BeliefState, TrajectoryState      │
│  Stability  ───────────────→  OpinionState, BeliefState         │
│  ManipulationResistance  ───→  InfluenceState, PolarizationState│
│  InfluenceAnalysis  ────────→  InfluenceState, ReferenceState   │
└─────────────────────────────────────────────────────────────────┘
```

## 6.3 数据缺口分析

| 评估指标 | 当前数据来源 | 缺口 | 解决方案 |
|----------|--------------|------|----------|
| Reasoning Quality | 无 | 需要 LLM 评估推理质量 | 新增 ReasoningState.qualityScore |
| Input Noise Test | 模拟 | 缺乏真实扰动测试 | 新增扰动测试模块 |
| Agent Dropout | 模拟 | 缺乏真实 Agent 移除测试 | 新增鲁棒性测试模块 |

---

# 7. Governance Dependency Map

## 7.1 治理问题与状态依赖

### Authority Bias

| 检测条件 | 依赖状态 | 干预策略 |
|----------|----------|----------|
| 单 Agent 影响力 > 50% | InfluenceState.strength | ReduceWeightIntervention |
| 单 Agent 引用数占比 > 40% | ReferenceState | ReduceWeightIntervention |
| 影响力分布 Gini > 0.6 | InfluenceState | ReduceWeightIntervention |

### Echo Chamber

| 检测条件 | 依赖状态 | 干预策略 |
|----------|----------|----------|
| 证据重复率 > 70% | EvidenceState | IntroduceDiversityIntervention |
| 观点相似度 > 0.85 | OpinionState | IntroduceDiversityIntervention |
| 引用网络密度 > 0.9 | ReferenceState | IntroduceDiversityIntervention |

### Premature Consensus

| 检测条件 | 依赖状态 | 干预策略 |
|----------|----------|----------|
| 共识度 > 0.7 且轮次 < 50% | ConsensusState | ContinueDiscussionIntervention |
| 信念标准差 < 0.15 且轮次 < 50% | BeliefState | ContinueDiscussionIntervention |
| 讨论深度不足 | ReasoningState | ContinueDiscussionIntervention |

### Polarization

| 检测条件 | 依赖状态 | 干预策略 |
|----------|----------|----------|
| 极化指数 > 0.6 | PolarizationState | ForceReflectionIntervention |
| 双峰性 > 0.8 | PolarizationState | ForceReflectionIntervention |
| 极端信念比例 > 30% | BeliefState | ForceReflectionIntervention |

### Hallucination Cascade

| 检测条件 | 依赖状态 | 干预策略 |
|----------|----------|----------|
| 证据新鲜度 < 0.3 | EvidenceState.freshness | FactCheckIntervention |
| 证据引用链长度 > 5 | EvidenceState | FactCheckIntervention |
| 无来源证据占比 > 40% | EvidenceState | FactCheckIntervention |

## 7.2 治理决策流程

```
Collective Decision State
    ↓
┌─────────────────────────────────────────────┐
│  状态监测 (每轮)                              │
│  - InfluenceState.strength                   │
│  - ConsensusState.level                      │
│  - PolarizationState.index                   │
│  - EvidenceState.freshness                   │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  问题检测                                    │
│  - Authority Bias                           │
│  - Echo Chamber                             │
│  - Premature Consensus                      │
│  - Polarization                             │
│  - Hallucination Cascade                    │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  干预决策                                    │
│  IF severity > threshold THEN               │
│    选择干预策略                              │
│    计算干预强度                              │
│    执行干预                                  │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  效果评估                                    │
│  - 状态变化量                                │
│  - 干预成功率                                │
│  - 副作用检测                                │
└─────────────────────────────────────────────┘
```

## 7.3 治理阈值配置

| 治理问题 | 低阈值 | 中阈值 | 高阈值 | 干预强度 |
|----------|--------|--------|--------|----------|
| Authority Bias | Gini > 0.4 | Gini > 0.5 | Gini > 0.6 | 权重降低 30%/50%/70% |
| Echo Chamber | 相似度 > 0.7 | 相似度 > 0.8 | 相似度 > 0.9 | 引入 1/2/3 个新视角 |
| Premature Consensus | 轮次 < 30% | 轮次 < 40% | 轮次 < 50% | 增加 1/2/3 轮 |
| Polarization | 指数 > 0.4 | 指数 > 0.5 | 指数 > 0.6 | 强制反思强度 |
| Hallucination | 无来源 > 20% | 无来源 > 30% | 无来源 > 40% | 事实核查深度 |

---

# 8. Overall Architecture Proposal

## 8.1 目标架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Research Application                        │
│  Experiment Management | Visualization | Research Report | API     │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Experiment Layer                            │
│  ExperimentOrchestrator | StrategyManager | ObservabilityManager    │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Analysis Layer                              │
│  EvaluationEngine | GovernanceEngine                                │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Collective Decision State (CDSM)                  │
│  AgentState | InteractionState | GroupState | EvolutionState        │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Inference Layer                             │
│  TextParser | SemanticAnalyzer | StateInferencer | Validator        │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Observation Layer                            │
│  RawOutputExtractor | DiscussionMemory | EventTracker               │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Discussion Layer                            │
│  DiscussionEngine | AgentManager | MessageTemplate                  │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Foundation Layer                            │
│  LLM Providers | Benchmark | Adapter | Security                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 8.2 数据流

```
Task
  ↓
Discussion Engine (Multi-round)
  ↓
Observation Layer
  ├→ Raw Output Extraction
  ├→ Memory Storage
  └→ Event Tracking
  ↓
Inference Layer
  ├→ Text Parsing
  ├→ Semantic Analysis
  ├→ State Inference
  └→ Consistency Validation
  ↓
Collective Decision State (CDSM)
  ├→ Agent States
  ├→ Interaction States
  ├→ Group States
  └→ Evolution States
  ↓
Decision Trace (History + Causal Graph)
  ↓
Analysis Layer
  ├→ Evaluation Engine
  │   ├→ Consensus
  │   ├→ Explainability
  │   ├→ Reliability
  │   ├→ Robustness
  │   ├→ Stability
  │   ├→ ManipulationResistance
  │   └→ InfluenceAnalysis
  └→ Governance Engine
      ├→ Issue Detection
      ├→ Intervention Planning
      ├→ Intervention Execution
      └→ Effect Evaluation
  ↓
Experiment Result
  ↓
Research Report / Visualization / API
```

## 8.3 新增模块职责

### Observation Layer

| 模块 | 职责 | Input | Output |
|------|------|-------|--------|
| RawOutputExtractor | 提取 Agent 原始输出 | LLM 响应 | RawObservation |
| DiscussionMemory | 存储讨论历史 | RoundData | MemoryEntry[] |
| EventTracker | 追踪讨论事件 | DiscussionEvent | Event[] |

### Inference Layer

| 模块 | 职责 | Input | Output |
|------|------|-------|--------|
| TextParser | 解析文本结构 | RawObservation | ParsedContent |
| SemanticAnalyzer | 语义分析 | ParsedContent | SemanticFeatures |
| StateInferencer | 状态推断 | SemanticFeatures + History | StateDelta |
| Validator | 一致性验证 | StateDelta | ValidationResult |

### CDSM Core

| 模块 | 职责 | Input | Output |
|------|------|-------|--------|
| StateManager | 状态管理 | StateDelta | StateSnapshot |
| TrajectoryManager | 轨迹管理 | StateSnapshot | Trajectory |
| CausalGraphBuilder | 因果图构建 | Events + StateChanges | CausalGraph |

## 8.4 接口设计

### Observation Layer API

```typescript
interface ObservationLayer {
  extract(rawOutput: string): RawObservation;
  store(observation: RawObservation, round: number): void;
  getByRound(round: number): RawObservation[];
  getByAgent(agentId: string): RawObservation[];
}
```

### Inference Layer API

```typescript
interface InferenceLayer {
  infer(observations: RawObservation[], history: StateSnapshot[]): StateDelta[];
  validate(deltas: StateDelta[]): ValidationResult;
  getFeatureExtraction(): SemanticFeatures[];
}
```

### CDSM API

```typescript
interface CollectiveDecisionState {
  getAgentState(agentId: string): AgentStateSnapshot;
  getGroupState(): GroupStateSnapshot;
  getInteractionState(): InteractionStateSnapshot;
  getEvolutionState(): EvolutionStateSnapshot;
  update(deltas: StateDelta[]): void;
  getSnapshot(round: number): StateSnapshot;
  getAllSnapshots(): StateSnapshot[];
}
```

## 8.5 设计原则检查

| 原则 | 实现方式 | 验证方法 |
|------|----------|----------|
| Interface First | 所有模块定义接口 | 类型检查 |
| Plugin First | 策略注册机制 | StrategyManager |
| High Cohesion | 单一职责模块 | 代码审查 |
| Low Coupling | 依赖注入 | 架构审查 |
| Research Friendly | 状态可观测、可分析 | 实验验证 |
| Future Proof | 可扩展接口 | 插件测试 |
| Testable | 单元测试 | 测试覆盖 |
| Observable | ObservabilityManager | 指标追踪 |
| Explainable | CausalGraph | 因果分析 |

---

## 附录：研究价值评估

### Inference Feasibility 总览

| 状态 | 推断可行性 | 研究价值 | 实现优先级 |
|------|------------|----------|------------|
| OpinionState | 高 | 高 | P0 |
| BeliefState | 高 | 高 | P0 |
| EvidenceState | 中 | 高 | P1 |
| InfluenceState | 中 | 高 | P1 |
| ConflictState | 中 | 高 | P1 |
| ConsensusState | 高 | 高 | P0 |
| PolarizationState | 高 | 高 | P1 |
| ReasoningState | 低 | 中 | P2 |
| UncertaintyState | 中 | 中 | P2 |

### Research Novelty 评估

| 创新点 | 新颖程度 | 科学价值 | 可行性 |
|--------|----------|----------|--------|
| 从自然讨论自动推断群体决策状态 | 高 | 高 | 中 |
| 基于语义分析的 Opinion Change 检测 | 中 | 高 | 高 |
| 引用网络 + 因果推断的 Influence 计算 | 高 | 高 | 中 |
| 动态共识追踪与预测 | 中 | 高 | 高 |
| 因果图驱动的 Decision Trace | 高 | 高 | 中 |
| 状态驱动的 Governance 干预 | 中 | 高 | 高 |

---

> **等待确认后开始实现。**