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

`src/lib/discussion/index.ts:702-788`

```
You are ${agent.name}, a ${agent.role}.

Task: ${task}
Round: ${roundNumber}/${maxRounds}

【系统参考（仅背景，非强制）】系统基于讨论历史计算的群体倾向：
- 信念强度：${state.belief}（-1 到 1）
- 置信度：${state.confidence}%（0-100）

以上为外部计算值（DeGroot 更新），仅作背景参考，不代表你的实际判断。

【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的立场——
不要简单复述上述系统参考值，你的信念应反映你对证据的真实判断。

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

**特征**：向 LLM 显示 belief 数值（标注为"系统参考、仅背景"，并要求独立判断而非复述），要求输出 scalar belief，**不要求 cognitiveState**，evidence 是无结构字符串数组。

### Prompt B：Native 引擎（NativeCognitiveEngine）

`src/lib/discussion/nativeCognitiveEngine.ts:296-423`

```
You are ${agent.name}, a ${agent.role}.

Task: ${task}
Round: ${roundNumber}/${maxRounds}

${cognitiveContext}      ← 替代"判断状态"，注入 6 个认知维度
  【系统参考（仅背景，非强制）】系统基于讨论历史计算的认知状态：
  - 偏好选项：Company A
  - 偏好清晰度：0.60（0=无偏好，1=极清晰）
  - 偏好强度：0.80
  - 证据覆盖：0.65（0=无证据，1=证据完整）
  - 证据质量：0.70（0=不可靠，1=高度可靠）
  - 确信度：0.85（0=不确信，1=完全确信）

  以上为外部计算值，仅作背景参考，不代表你的实际判断。

  【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的认知状态——
  不要简单复述上述系统参考值，你的认知应反映你对证据的真实判断。

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

**特征**（`nativeCognitiveEngine.ts:305` 注释明确"移除所有 belief context leakage"）：
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

---

## 10. Evidence Pool：确定性共享证据池（E10）

> 本文档基于代码事实编写，所有引用带文件:行号。最后核对：2026-08-02

### 10.1 动机与定位

v6 Native 引擎的信息传递是 **Message-Centric**：每个 agent 每轮收到
`memoryContext`（自己的全部历史 + @ 我的回复，[nativeCognitiveEngine.ts:347](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/nativeCognitiveEngine.ts#L347) **只 filter 不 slice**）
+ `currentRoundContext`（本轮已发言者全部 reasoning，[nativeCognitiveEngine.ts:377](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/nativeCognitiveEngine.ts#L377) **无窗口限制**）。
实测（pilot raw JSON）：最终轮单 agent 注入上下文 ≈ **1082 token**（none）/ **1811 token**（delta）。

E10 引入 **State-Centric Shared Evidence Pool**（`src/lib/thermodynamics/EvidencePool.ts`）：
全局去重原子事实池，以「他人已陈述的事实（结构化，已去重）」块注入 prompt。**零额外 LLM 调用**（全确定性：canonicalize + hash + Jaccard char-bigram + 数值比较）。

### 10.2 确定性算法

| 步骤 | 算法 | 位置 |
|---|---|---|
| 数值提取 | 正则 `/(\d+(?:\.\d+)?)/g` → numericValues | EvidencePool.ts |
| 精确去重键 | hashKey = 小写、去空白/标点（**保留数值**）→ FNV-1a 32bit | EvidencePool.ts |
| 近似重复 | Jaccard(char-bigram) ≥ 阈值（默认 0.75）且同 dimension → 合并 | EvidencePool.ts |
| 数值冲突 | 同 targetItem + 文本相似 ≥ 0.5 + 数值不同 → isContradicted（双向标记） | EvidencePool.ts |

**关键设计（离线自测验证）**：
- **去重键保留数值**：`0.85` 与 `0.55` 不会被文本相似吞并——Supplier 数值碰撞教训。
- **冲突不 gate 在 dimension**：a1（学术+科研）与 a5（综合粗略）的数值冲突能触发；
  用【目标 + 文本相似 ≥0.5 + 数值不同】排除跨话题假阳性（"就业率0.90" vs "地理位置0.95" 不冲突）。
- **维度按属主映射**（同 [idr_diffusion.ts:47-81](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/analysis/idr_diffusion.ts#L47) SCENARIO_SPECS）：
  a1 学术+科研 / a2 就业 / a3 地理 / a4 国际化+师生比 / a5 综合粗略。

### 10.3 注入与诚实标注

- 池只收录 agent **实际输出**的证据（structuredEvidence，回退 evidence），**不含私有知识**——
  非全知黑板书，不摧毁 hidden-profile 构造。
- 注入块使用「仅背景参考，非强制」框架（与系统参考块同风格），见 buildView 文案。
- 视图排除自己 source 的事实；排序：冲突优先 → 最新优先；受 maxChars（默认 800 字符）预算约束。
- **诚实标注**：去重阈值/预算为启发式，需 A/B 标定；开放文本反义冲突不做（超出确定性能力）。

### 10.4 接线点

| 位置 | 改动 |
|---|---|
| `DiscussionConfig.evidencePool` | 新增可选配置（enabled / dimensions / similarityThreshold / maxChars） |
| `DiscussionEngine.observeAgents` | 新增 `onOpinionObserved()` hook（默认 no-op，[index.ts:706](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L706)），parsed 后调用（[index.ts:695](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L695)） |
| `NativeCognitiveEngine` | 覆写 hook 喂池（[nativeCognitiveEngine.ts:283](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/nativeCognitiveEngine.ts#L283)）；buildPrompt 注入 poolContext（[nativeCognitiveEngine.ts:415-416](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/nativeCognitiveEngine.ts#L415)） |
| `ExperimentConfig.evidencePool` | Runner 透传（Runner.ts 构造 NativeCognitiveEngine 时） |
| `idr_diffusion.ts` | classifyGovernance 新增 `_pool` → pool |

### 10.5 探路结果（E10 smoke，seed 42，university，探索性 n=1）

对照表（同一 seed 42，native_cognitive，5 轮；IDR 来自 `idr_diffusion.ts`）：

| 条件 | τ | IDR_end | token/run | reasoning 均值 |
|---|---|---|---|---|
| none（无治理无池，基线） | 0.571 | 70.0% | 96,540 | 200 字符 |
| **pool（无治理 + 池注入）** | **0.571** | **75.0%** | **193,376** | **330 字符** |
| delta（δ 治理，对照） | 0.643 | 80.0% | 187,958 | 335 字符 |

**接线验证 ✅**：池确实被注入并生效——pool 组 reasoning 均值 200 → 330 字符（agent 在处理结构化事实），逐碎片 IDR 模式与基线不同（就业/国际化 75%→100%）。离线自测已覆盖：精确去重、数值冲突（0.85 vs 0.55）、跨话题假阳性排除。

**结果解读（方向性，n=1 非统计结论）**：
- **τ 无改善**：pool = none = 0.571。
- **IDR_end +5pp**（75% vs 70%），但**低于 δ 治理的 +10pp**（80%）；逐碎片混杂：就业/国际化提升，**地理回退 100%→75%**。
- **成本 2x**：193K token/run ≈ δ 治理（188K），为基线（96K）2 倍——池使发言变长，无 token 收益。

**方向性解读**：全量结构化披露（pool）≈ 无治理的结果质量，且 < 选择性披露（δ 治理）；δ 治理在相近成本下 τ 与 IDR 双赢。与"披露需要选择性、全披露 ≠ 更好决策"假说一致（呼应 F2 / 共识≠正确主题）。

**决策**：**不投完整 E10**。池作为独立全披露机制成本高、不优于 δ。有价值的方向是把它降级为 **δ 治理的执行载体**（per-agent 视图 + 治理控制可见性 = 选择性披露），即治理从"散文 prompt 注入"升级为"池视图定向子集"，需单独实验验证（E10b，暂不投入）。
