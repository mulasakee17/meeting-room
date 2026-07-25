# Native Cognitive Contract — Phase 4A Part 4

> SwarmAlpha NativeCognitiveEngine 输入输出契约
>
> 定义 LLM 与系统之间的认知状态接口边界
>
> 生成时间: 2026-07-24

---

## 1. LLM Input(允许注入 LLM 的信息)

### 1.1 任务信息
- `agent.name` / `agent.role`(角色身份)
- `task`(任务描述/共享简报)
- `roundNumber` / `maxRounds`(轮次进度)

### 1.2 认知状态(Previous Cognitive State)
- `utility.topChoice`(偏好选项)
- `utility.preferenceClarity`(偏好清晰度)
- `utility.intensity`(偏好强度)
- `evidence.coverage`(证据覆盖)
- `evidence.quality`(证据质量)
- `confidence.overall`(确信度)

### 1.3 对话历史(Conversation History)
- `entry.reasoning`(自己和他人历史发言的推理文本)
- `entry.roundNumber`(发言轮次)
- `entry.agentId`(发言者身份)

### 1.4 本轮观点(Current Round Opinions)
- `op.agentId`(发言者身份)
- `op.reasoning`(本轮已发言的推理文本)

### 1.5 治理指令(Governance Prompts,当前阶段禁用)
- governance prompts(治理干预指令)

---

## 2. LLM Input(禁止注入 LLM 的信息)

### 2.1 禁止:旧 Belief 系统状态
- ❌ `state.belief`(标量信念强度)
- ❌ `state.confidence`(旧 inferenceLayer 推断的置信度)

### 2.2 禁止:对话历史中的 belief 标签
- ❌ `entry.belief`(历史发言的信念数值)
- ❌ `entry.confidence`(历史发言的置信度数值)

### 2.3 禁止:本轮观点中的 belief 标签
- ❌ `op.belief`(本轮他人观点的信念数值)
- ❌ `op.confidence`(本轮他人观点的置信度数值)

### 2.4 禁止:任何 scalar belief aggregation 产物
- ❌ DeGroot 聚合后的群体 belief
- ❌ belief 网络的 inference 结果
- ❌ belief 收敛度/极化度等派生指标

---

## 3. LLM Output(LLM 必须输出的认知状态)

### 3.1 Cognitive State(LLM 原生输出)

```json
{
  "cognitiveState": {
    "utility": { "Option A": 0.8, "Option B": 0.2 },
    "evidenceCoverage": 0.6,
    "evidenceQuality": 0.7
  }
}
```

| 字段 | 类型 | 范围 | 含义 |
|------|------|------|------|
| `utility` | Record<string, number> | -1 到 1 | 各选项偏好强度 |
| `evidenceCoverage` | number | 0 到 1 | 证据完整度 |
| `evidenceQuality` | number | 0 到 1 | 证据可靠度 |

### 3.2 Confidence(LLM 原生输出)

```json
{ "confidence": 85 }
```

| 字段 | 类型 | 范围 | 含义 |
|------|------|------|------|
| `confidence` | number | 0 到 100 | LLM 自评确信度(基于 evidence quality + coverage + self-assessment) |

### 3.3 Decision & Ranking(LLM 原生输出,用于决策质量评估)

```json
{
  "itemBeliefs": [
    { "item": "Option A", "rank": 1, "belief": 0.8, "confidence": 95 }
  ]
}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `itemBeliefs[].rank` | number | 排名(1=最优) |
| `itemBeliefs[].belief` | number | 选项偏好(用于向后兼容 belief 轨迹) |

### 3.4 Reasoning & Evidence(LLM 原生输出)

```json
{
  "reasoning": "分析推理过程...",
  "evidence": ["证据1", "证据2"],
  "nextOpinion": "下一步讨论方向",
  "referencedAgents": ["agent_1"]
}
```

---

## 4. System Computed(系统计算,非 LLM 输出)

### 4.1 Inertia(惯性)

```typescript
ι(t) = updateInertia(ι(t-1), role, spokeThisRound, evidence, wasRefuted)
```

- 输入:上一轮 Inertia、角色、是否发言、Evidence、是否被反驳
- 公式:角色基准 + 反驳检测衰减 + 轮次衰减
- 不依赖:LLM 输出、belief

### 4.2 Susceptibility(易感性)

```typescript
Λ = (1 - ι) × (1 - c)
```

- 输入:Inertia ι、Confidence c(来自 LLM 原生 confidence)
- 不依赖:belief

### 4.3 Utility 更新(DeGroot,使用 LLM 原生 utility)

```
u_i(t+1) = (1 - λ_i) × u_i(t) + λ_i × Σ_j w_ij × û_j(t)
其中 λ_i = (1 - ι_i)(1 - c_i)
```

- 输入:自身 Utility(来自 LLM)、他人 Utility(来自 LLM)、Inertia、Confidence
- 不依赖:scalar belief

---

## 5. Belief Independence Verification(信念独立性验证)

### 5.1 数据流独立性

```
LLM Output → CognitiveState (utility/evidence/confidence)
                ↑
            无 belief context leakage
                ↑
LLM Input ← cognitiveStates (utilityTopChoice/evidenceCoverage/...)
            (Phase 4A: 不再注入 state.belief)
```

### 5.2 Confidence 来源审计

| 来源 | 是否依赖 belief | 状态 |
|------|----------------|------|
| LLM 原生 `opinion.confidence` | 否(LLM 自评) | ✅ 独立 |
| `cognitiveStateToConfidence(state)` | 否(仅 `confidence.overall * 100`) | ✅ 独立 |
| 父类 `updateBeliefs` 的 `confidenceChange` | 是(基于 belief 网络) | ⚠️ Native 模式不使用,被 LLM 原生覆盖 |

### 5.3 代码审计结论

Phase 4A 修改后,buildPrompt 中:
- ✅ 无 `state.belief` 注入
- ✅ 无 `state.confidence` 注入
- ✅ 无 memory `entry.belief` 注入
- ✅ 无 currentRound `op.belief/confidence` 注入
- ✅ Confidence 来自 LLM 原生输出,非 belief sharpness

---

## 6. 兼容性说明

### 6.1 向后兼容

- LLM 仍输出 `belief` 字段(用于父类 belief 轨迹和向后兼容),但该字段不用于 Native Cognitive State 更新
- `cognitiveStateToBelief` / `cognitiveStateToConfidence` 仍存在,仅用于 snapshot 存储和与 belief 模式对比分析

### 6.2 不破坏的约束

- 不修改 Utility/Evidence/Inertia 定义
- 不修改 Inertia/Susceptibility 公式
- 不接入 Governance
- 不重构 Runtime
- DiscussionEngine 主逻辑零改动
