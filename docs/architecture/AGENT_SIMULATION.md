# Agent 对话模拟机制

> 本文档基于代码事实编写，所有引用带文件:行号。最后核对：2026-07-27

## 1. Agent 结构

**DiscussionAgent 接口**（`index.ts:68-76`）极简：

```typescript
interface DiscussionAgent {
  id: string; name: string; role: string; type: string;
  sendMessage(prompt): Promise<string>;     // 调 LLM
  getState(): { belief, confidence };         // 信念/置信度的唯一访问方式
  setState(state): void;
}
```

**关键事实**：agent 自身不持有 agentKnowledge/cognitiveState——这些在 engine 上。`belief/confidence` 不是直接字段，通过 `getState()/setState()` 间接访问。

---

## 2. 两套 Prompt（决定五维改造的核心）

项目有两套互斥的 `buildPrompt` 实现。

### Prompt A：同步引擎（DiscussionEngine）

`src/lib/discussion/index.ts:669-744`

```
You are ${agent.name}, a ${agent.role}.

Task: ${task}
Round: ${roundNumber}/${maxRounds}

你当前的判断状态：
- 信念强度：${state.belief}（-1 到 1）
- 置信度：${state.confidence}%（0-100）

${memoryContext}        ← 含 (信念: 0.30) 标签
${currentRoundContext}  ← 含 (信念: 0.30, 置信度: 70%) 标签
${governanceContext}

Respond in JSON format:
{
  "reasoning": "...",
  "evidence": ["evidence1", "evidence2"],     ← 无结构 string[]
  "belief": -1 to 1,                          ← 要求输出 scalar belief
  "confidence": 0 to 100,
  "nextOpinion": "...",
  "referencedAgents": ["agent_1"],
  "itemBeliefs": [{"item":"A","rank":1,"belief":0.8,"confidence":95}]
}
```

**特征**：向 LLM 显示 belief 数值，要求输出 scalar belief，**不要求 cognitiveState**，evidence 是无结构字符串数组。

### Prompt B：Native 引擎（NativeCognitiveEngine）

`src/lib/discussion/nativeCognitiveEngine.ts:260-335`

```
You are ${agent.name}, a ${agent.role}.

Task: ${task}
Round: ${roundNumber}/${maxRounds}

${cognitiveContext}      ← 替代"判断状态"，注入 6 个认知维度
  你当前的认知状态：
  - 偏好选项：Company A
  - 偏好清晰度：0.60（0=无偏好，1=极清晰）
  - 偏好强度：0.80
  - 证据覆盖：0.65（0=无证据，1=证据完整）
  - 证据质量：0.70（0=不可靠，1=高度可靠）
  - 确信度：0.85（0=不确信，1=完全确信）

${memoryContext}        ← 无 belief 标签（Phase 4A decoupled）
${currentRoundContext}  ← 无 belief 标签
${governanceContext}

Respond in JSON format:
{
  "reasoning": "...",
  "evidence": [                              ← 结构化
    {"content": "...", "supports": "Company A", "strength": 0.8}
  ],
  "confidence": 0 to 100,
  "cognitiveState": {                        ← 要求输出认知状态
    "utility": {"Company A": 0.8, "Company B": 0.2},
    "evidenceCoverage": 0.6,
    "evidenceQuality": 0.7
  },
  "nextOpinion": "...",
  "referencedAgents": ["agent_1"],
  "itemBeliefs": [{"item":"A","rank":1,"belief":0.8,"confidence":95}]
}
```

**特征**（`nativeCognitiveEngine.ts:268-273` 注释明确"移除所有 belief context leakage"）：
- **不向 LLM 显示 belief**
- **不要求 LLM 输出 `belief` 字段**
- memory/currentRound 移除了 `(信念: x.xx)` 标签
- 要求 LLM 输出 `cognitiveState`（utility + evidenceCoverage + evidenceQuality）
- evidence 是结构化 `{content, supports, strength}[]`

### 字段对比

| 字段 | Prompt A | Prompt B |
|------|----------|----------|
| `belief` (scalar) | ✅ 要求 | ❌ 不要求 |
| `confidence` | ✅ [0,100] | ✅ [0,100] |
| `itemBeliefs` | ✅ | ✅ |
| `cognitiveState.utility` | ❌ | ✅ `Record<string, number>` [-1,1] |
| `cognitiveState.evidenceCoverage` | ❌ | ✅ [0,1] |
| `cognitiveState.evidenceQuality` | ❌ | ✅ [0,1] |
| `evidence` 格式 | `string[]` | `{content, supports, strength}[]` |
| 注入的当前状态 | belief + confidence 数值 | 6 个认知维度 |
| memory 标签 | `(信念: x.xx)` | 无标签 |

---

## 3. Agent 间信息交换机制

Agent 之间不直接通信，通过 prompt 上下文间接交换。三个通道：

| 通道 | 时机 | 内容 | 可见性 |
|------|------|------|--------|
| **personalMemory** | 跨轮累积 | 自己说过的所有话 + 别人 @ 自己的话 | 仅自己可见 |
| **currentRoundOpinions** | 轮内累积 | 本轮已发言者的 reasoning + belief + confidence | 后发言者可见前面所有人 |
| **governancePrompts** | 上一轮治理生成 | "[信息注入]..." 等干预指令 | 按 agentId 定向注入 |

**发言顺序**：同步引擎严格按 `agents` 数组顺序（`index.ts:620` `for...of`），非随机。

**关键机制**（`index.ts:618-659`）：

```typescript
const currentRoundOpinions = [];
for (const agent of agents) {                    // 顺序遍历
  const prompt = this.buildPrompt(..., currentRoundOpinions);
  const response = await agent.sendMessage(prompt);  // LLM 调用
  const parsedOpinion = this.opinionParser.parseOpinion(response);
  currentRoundOpinions.push({...});               // push 后下一个 agent 可见
}
```

**事实**：第一个发言者看不到本轮他人；第 N 个发言者能看到前 N-1 人的所有观点。

---

## 4. 信念更新机制

### 同步引擎：Rule-based 影响力计算（非 DeGroot）

`index.ts:773-811`，**不是经典 DeGroot**，而是基于规则的影响力计算。

**影响力类型**（`influenceUtils.ts:35-51`）：优先用 `referencedAgents` 显式引用判定为 `reference`，否则按 belief 差值推断 `agreement`/`disagreement`/`persuasion`。

**权重公式**（`influenceUtils.ts:59-88`）：

```
agreement    = (1 - |Δbelief|) × (source.conf/100) × COEFF
disagreement = |Δbelief| × (source.conf/100) × COEFF
reference    = (source.conf/100) × min(1, reasoning.length/MAX) × COEFF
```

更新：`agentStates[target].belief = clamp(belief + Δbelief × weight × COEFF, -1, 1)`

### 真正的 DeGroot（异步引擎被动倾听）

`asyncEngine.ts:449-505`，注释明确"使用影响图的权重做 DeGroot 式更新"：

```
delta = 0.15 × Σ(w_ij × (belief_j - belief_i)) / Σ(w_ij)
```

### 认知状态 Utility 的 DeGroot 更新

`cognitiveState.ts:499-556`：

```
u_i(t+1) = (1 - λ_i) × u_i(t) + λ_i × Σ_j w_ij × u_j(t) / Σ w_ij
其中 λ_i = max((1 - inertia) × (1 - confidence), MIN_SUSCEPTIBILITY)
```

---

## 5. 认知状态更新机制（5 维度）

### 5 维度的来源

定义位置：`cognitiveState.ts:191-196`

| 维度 | 子字段 | 同步引擎（post-hoc）| Native 引擎（LLM 原生）|
|------|--------|-------------------|----------------------|
| **Utility** | scores, topChoice, preferenceClarity, intensity | 从 itemBeliefs 反推（有损）| LLM 直接输出 ✅ |
| **Evidence** | coverage, quality, diversity, items | coverage=items.length/poolSize; quality=avg(sourceReliability, 硬编码0.5) | coverage+quality 由 LLM 自评; diversity=Shannon熵(items); items 从 structuredEvidence 提取 |
| **Inertia** | strength, source | 系统计算（角色+反驳+衰减）| 系统计算（同左）|
| **Confidence** | overall, evidenceBased, stabilityBased | overall=evidenceBased; evidenceBased=quality×coverage | overall=shrinkage校准(0.4×evidenceBased+0.6×LLM自报); evidenceBased=quality×coverage |
| **Susceptibility** | — | 系统计算 =(1-ι)(1-c) | 系统计算（同左）|

### 关键事实

**同步引擎**：LLM 只输出 scalar belief + itemBeliefs，5 维度全部由系统 post-hoc 反推（有损）。

**Native 引擎**：LLM 直接输出 3 个认知维度（Utility/Coverage/Quality），系统计算 2 个（Inertia/Susceptibility）+ 3 个派生量（diversity/evidenceBased/overall）。

**已修复的 Native 缺陷**（2026-07-27）：
1. `diversity` 恒为 0.5 → 改为 Shannon 熵(items)（`MeasurementLayer.ts:325-341`）
2. `evidenceBased` 误用 LLM 自报 → 改为 quality×coverage（与 post-hoc 对齐）（`MeasurementLayer.ts:632-636`）
3. LLM overconfidence 未校准 → shrinkage 校准 `0.4×evidenceBased + 0.6×rawConfidence`（`MeasurementLayer.ts:629-655`）
4. evidence 归类噪声 → 改用结构化 `{content, supports, strength}`（`types.ts` + `cognitiveState.ts`）

---

## 6. 一轮对话的完整时序

```
Round N 开始
│
├─ observeAgents(agents, task, N)  ← 顺序遍历，非随机
│    │
│    ├─ Agent A 发言（agents[0]）
│    │    ├─ state = A.getState()  ← {belief: 0.3, confidence: 70}
│    │    ├─ personalMemory = A 的历史 + @A 的别人历史
│    │    ├─ currentRoundOpinions = []  ← A 第一个，看不到本轮他人
│    │    ├─ prompt = buildPrompt(A, task, memory, N, state, [])
│    │    ├─ response = A.sendMessage(prompt)  → callLLM
│    │    ├─ parsedOpinion = opinionParser.parseOpinion(response)
│    │    │    → {agentId, reasoning, evidence, belief, confidence,
│    │    │       itemBeliefs, referencedAgents, cognitiveState?, structuredEvidence?}
│    │    └─ currentRoundOpinions.push(A 的观点)
│    │
│    ├─ Agent B 发言
│    │    ├─ currentRoundOpinions = [A 的观点]  ← B 看到 A 的话
│    │    ├─ prompt = buildPrompt(B, ..., [A])
│    │    └─ currentRoundOpinions.push(B)  ← C 将看到 A+B
│    │
│    └─ Agent C, D... 同理
│
├─ memory.store(每个 opinion)  ← 跨轮累积
│
├─ graphBuilder.updateFromOpinions  ← 交互图更新
│
├─ checkConvergence(opinions)  ← 收敛则 break
│
├─ updateBeliefs(opinions, agentStates, N)  ← 影响力计算（非 DeGroot）
│    └─ agentStates 更新（clamp [-1,1] / [0,100]）→ 写回 agent.setState
│
├─ updateCognitiveStatesFromRound（若 useCognitiveState=true）
│    ├─ 同步引擎: post-hoc 从 itemBeliefs 反推 5 维度
│    └─ Native 引擎: 委托 MeasurementLayer，用 LLM 原生 cognitiveState
│
├─ applyGovernance(N, opinions, agentStates, agents)  ← 治理在信念更新之后
│    ├─ mode="none" → 跳过
│    ├─ mode="detect-only" → diagnose 不干预
│    └─ mode="full" → diagnoseAndIntervene
│         └─ governancePrompts 清空并收集本轮新 prompt → 下一轮注入
│
└─ Round N+1
```

### 关键时序事实

| 事件 | 顺序 | 代码位置 |
|------|------|---------|
| Agent 发言 | 顺序，非随机 | index.ts:620 |
| B 能看到 A 本轮的话 | A 发言后 push | index.ts:654-659, 633 |
| Memory 存储 | observeAgents 之后，updateBeliefs 之前 | index.ts:589-600 |
| 信念更新 | memory 之后 | index.ts:299 |
| 认知状态更新 | 信念更新之后 | index.ts:309-311 |
| Governance | 认知状态更新之后 | index.ts:314 |
| governancePrompts 注入 | 下一轮 buildPrompt | index.ts:697-703 |

---

## 7. 输出的各个量

### AgentOpinion（每 agent 每轮一条）

`types.ts:43-60`：

| 字段 | 类型 | 范围 | 来源 |
|------|------|------|------|
| `belief` | number | [-1,1] | LLM（Prompt A）/ 不要求（Prompt B）|
| `confidence` | number | [0,100] | LLM |
| `itemBeliefs[].rank` | number | ≥1 | LLM |
| `itemBeliefs[].belief` | number | [-1,1] | LLM |
| `cognitiveState.utility` | Record<string, number> | [-1,1] | LLM（仅 Prompt B）|
| `cognitiveState.evidenceCoverage` | number | [0,1] | LLM（仅 Prompt B）|
| `cognitiveState.evidenceQuality` | number | [0,1] | LLM（仅 Prompt B）|
| `structuredEvidence[].strength` | number | [0,1] | LLM（仅 Prompt B）|
| `reasoning` / `nextOpinion` / `referencedAgents` / `evidence` | — | — | LLM |

### ExperimentResult（最终输出）

`experiments/v2/run.ts:92-138`：

| 字段 | 计算 | 代码位置 |
|------|------|---------|
| `kendallTau` | kendallTau(correctAnswer, extractedRanking) ∈ [-1,1] | run.ts:461 |
| `decisionQuality` | `((tau+1)/2)*100` ∈ [0,100] | run.ts:202-204 |
| `consensusLevel` | `kuramotoR(lastRound.beliefs)` | run.ts:466-468 |
| `opinionDiversity` | `sampleStd(lastBeliefs)` | run.ts:469 |
| `interventionEffects` | before/after belief，`effective = |delta|>0.05` | run.ts:424-433 |

**注意**：`thermoHistory` **不在**同步 ExperimentResult，是 `AsyncDiscussionResult` 字段（`asyncEngine.ts:93`）。

---

## 8. 当前实验数据走哪套 Prompt

- [Runner.ts:290-297](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L290-L297) 当 `useNativeCognitive=true` 时用 NativeCognitiveEngine → Prompt B
- 否则用 DiscussionEngine → Prompt A
- **v2/data 下 169 个闭环数据走 Prompt A**（同步引擎，scalar belief）
- **campaign/output 下约 18 个 smoke 文件走 Prompt B**（native，5 维度中 3 个 LLM 自评）

---

## 9. 是否改成五维的关键考量

### 当前状态

- **Prompt A（已用于论文 169 数据）**：LLM 只输出 scalar belief，5 维度全部 post-hoc 反推（有损）
- **Prompt B（仅 18 个 smoke）**：LLM 输出 3 维 + 系统计算 2 维，已修复 4 个实现缺陷

### 理论优势（Prompt B）

1. **信息量**：scalar belief 是 1 维，utility 是 N 维向量（5 选项 × float32）
2. **语义清晰**：post-hoc 的 belief 语义模糊（采样 5 个 agent 中 3 个的 `belief` 与 `itemBeliefs[0].belief` 不一致），native 直接询问绕开有损转换
3. **evidence 归类**：post-hoc 用 `includes` 启发式，native 用结构化 `{content, supports, strength}`

### 未解决风险

1. **LLM overconfidence**：native 的 coverage/quality 是 LLM 自评，系统性偏高 → susceptibility 被压低（已做 shrinkage 校准，但权重 0.4/0.6 是经验值，未用数据驱动优化）
2. **无对照实验**：没有同一任务、同一种子、两种模式的并排对照。"大幅提升"是理论预期，不是测量结果
3. **历史数据不可回算**：169 个闭环数据无 utility 向量，无法用 native 重新计算

### 决策路径

1. **跑小规模对照**（同任务 × 3 种子 × 2 模式）→ 看 τ/Q/收敛速度差异
2. **若 native 显著更好** → 全面切换
3. **若相当或某些维度退化** → 保留 post-hoc 为默认，native 为可选
