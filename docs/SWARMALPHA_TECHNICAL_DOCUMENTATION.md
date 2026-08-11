# SwarmAlpha Technical Documentation

> **历史技术快照（2026-08-04）：**本文用于保存旧系统的实现说明，不能覆盖当前 V6 代码、schema、测试与权威架构文档；其中“可复现”只描述当时记录的工程路径，不等于当前研究结论已复现或有效。

> **版本**: v6 Phase 2.9 (2026-08-04)
> **状态**: 可复现实验系统说明文档
> **读者**: 第三方开发者 / AI Agent 研究人员 / 合作实验室成员
> **声明**: 所有参数、公式、流程均来自真实代码,行号可逐行核查。不一致处明确标注。

---

## 1. 项目背景与研究问题

### 1.1 当前解决的问题

SwarmAlpha 研究的是 LLM 多智能体系统中的**集体认知异常检测**问题。

**核心研究问题**:

> *How can collective cognitive states of LLM-based multi-agent systems be monitored during runtime without relying on ground truth?*

具体分解为:
- **RQ1**: 能否仅通过 agent 交互过程中的内部状态和群体动力学,检测正在形成的集体认知异常?
- **RQ2**: 哪些认知异常类型(信息坍缩、权威集中、错误共识、证据忽视)可以通过纯数学信号检测,哪些需要 LLM 语义传感器?
- **RQ3**: 非破坏性干预(信息注入、注意力重平衡)是否优于破坏性干预(权重降低、强制反思)?

### 1.2 传统 Multi-Agent 系统的不足

| 不足 | 说明 | 证据 |
|---|---|---|
| 依赖 Ground Truth | 传统对齐方法需要正确答案做评估,但真实决策场景无 Ground Truth | 本项目 δ 诊断纯检测行为矛盾,不需要正确答案 |
| 事后分析为主 | 多数系统只做事后审计,无法在运行时检测异常 | 本项目三层级联在每轮实时运行 |
| 单 Agent 视角 | 单 agent alignment 不处理群体层面的信息坍缩和伪共识 | 本项目检测 4 种群体级异常 |
| 破坏性干预 | 降低权重/强制反思会丢失关键信息 | v2.0 实验发现 Δτ=-0.267(破坏性);v2.1 非破坏性 Δτ=+0.533(pilot) |

### 1.3 SwarmAlpha 的关注点

不做通用多 agent 框架,而是做**运行时认知监测层**:

```
Tier 1 热力学筛查(零成本,每轮必跑)
  ├─ 正常 → 继续(跳过 Tier 2/3)
  └─ 异常 → Tier 2 δ 诊断(纯数学,检测行为矛盾)
       ├─ 根因清晰 → 直接干预
       └─ 根因模糊 → Tier 3 SemanticTool(LLM 语义传感器)
```

---

## 2. 系统整体架构

### 2.1 Agent 生命周期

从输入到最终决策的完整流程:

```
Input Scenario
  ↓
Scenario Initialization (加载任务、分配 agent 信息)
  ↓
Agent Perception (buildPrompt 构建系统/用户提示)
  ↓
LLM Reasoning (调用 DeepSeek/Qwen 生成 JSON)
  ↓
Cognitive State Extraction (解析 utility/evidence/confidence)
  ↓
State Update (DeGroot 更新 + Inertia/Confidence 计算)
  ↓
Collective Metrics Calculation (R/T/H/F 热力学量)
  ↓
Anomaly Detection (Tier 1 筛查 → Tier 2 δ 诊断)
  ↓
Governance Intervention (inject_evidence / rebalance_attention)
  ↓
Termination Check (F 进决策 + 收敛检查 + 硬上限)
  ↓
Final Decision (聚合最后一轮 itemBeliefs → Kendall τ)
```

### 2.2 每一步的输入/输出/模块/代码位置

| 步骤 | 输入 | 输出 | 模块 | 代码位置 |
|---|---|---|---|---|
| Scenario Init | ExperimentConfig | agents[], task, scenario | Runner.ts | [Runner.ts:379](../experiments/campaign/pipeline/Runner.ts) |
| Agent Perception | agent, round, cognitiveStates, governancePrompts | prompt string | NativeCognitiveEngine.buildPrompt | [nativeCognitiveEngine.ts:378-512](../src/lib/discussion/nativeCognitiveEngine.ts) |
| LLM Reasoning | prompt string | JSON (reasoning/evidence/confidence/cognitiveState/itemBeliefs) | providers.ts | [providers.ts](../src/lib/llm/providers.ts) |
| Cognitive State Extraction | parsed JSON | AgentOpinion + NativeCognitiveOutput | NativeCognitiveOpinionParser | [nativeCognitiveEngine.ts:85-202](../src/lib/discussion/nativeCognitiveEngine.ts) |
| State Update | opinions, agents, pendingModifications | updated cognitiveStates | MeasurementLayer.updateCognitiveStates | [MeasurementLayer.ts:1113-1279](../src/lib/thermodynamics/MeasurementLayer.ts) |
| Collective Metrics | cognitiveStates | ThermoState {R,T,H,F} | MeasurementLayer.computeThermoState | [MeasurementLayer.ts:261-289](../src/lib/thermodynamics/MeasurementLayer.ts) |
| Anomaly Detection | thermoState, cognitiveStates, estimates | DeltaDiagnosis (8 signals) | MeasurementLayer.diagnoseAndSuggestSync | [MeasurementLayer.ts:1712-1730](../src/lib/thermodynamics/MeasurementLayer.ts) |
| Governance Intervention | delta, suggestions, statesMap | CognitiveStateModification[] | cognitiveInterventions.generate | [cognitiveInterventions.ts](../src/lib/governance/cognitiveInterventions.ts) |
| Termination Check | thermoState, round, maxRounds | TerminationDecision | TerminationDecider.evaluateSync | [TerminationDecider.ts:247-300](../src/lib/thermodynamics/TerminationDecider.ts) |
| Final Decision | lastRound.opinions | finalRanking, finalKendallTau | Runner + statsShared | [Runner.ts:529-548](../experiments/campaign/pipeline/Runner.ts) |

### 2.3 主循环时序(2026-08-04 修复后)

每轮执行的 7 个步骤,带精确行号:

```
[index.ts:195] for round = 1..maxRounds:
  1. [L231] opinions = await runRound(participatingAgents, task, round, agentStates)
  2. [L301] if (checkConvergence(opinions)) break
  3. [L305] updateBeliefs(opinions, agentStates, round)   // 标量 belief(父类兼容)
  4. [L320] governanceResult = await applyGovernance(round, opinions, agentStates, agents)
       └─ B组: applyCognitiveGovernance → diagnoseAndSuggestSync → Tier1 → (异常)Tier2 δ → buildDeltaSuggestions
       └─ C组: applyCognitiveGovernanceAsync → diagnoseAndSuggest → Tier1 → (异常)Tier2 → (模糊)Tier3 SemanticTool
  5. [L334] updateCognitiveStatesFromRound(opinions, agents, round)
       └─ 消费 pendingCognitiveModifications(步骤4生成的干预)
       └─ 计算 post-update thermoState → push thermoHistory
  6. [L344] if (shouldTerminateEarly(round)) break   // F 进决策,用 post-update thermoState
  7. [L346] roundDataArray.push(...)
```

**关键时序决策**:
- 步骤 4(治理)在步骤 5(状态更新)之前:δ 诊断用上一轮 cognitiveStates,生成本轮干预,在步骤 5 被消费。1 轮诊断滞后可接受(cognitive state 渐进变化)。
- 步骤 6(终止)在步骤 5 之后:用当前轮 post-update 的 F 判断终止。2026-08-04 修复(B2+C3):原设计在步骤 4 之前,导致 F 跌落时 δ 诊断被终止短路。

---

## 3. Agent 模型设计

### 3.1 Agent 角色定义(v6 主任务:University Selection)

**任务文件**: [task_university.ts](../experiments/campaign/tasks/task_university.ts)

**Agent 数量**: 5

**信息分配**(每个 agent <60% 总信息,每个 ≥2 条独有数据点):

| Agent | Role | 掌握维度(精确数据) | 初始偏差 |
|---|---|---|---|
| a1 Academic Advisor | 学术顾问 | 学术声誉 + 科研经费(8所大学精确值) | 坚信学术核心,倾向推 A 第一 |
| a2 Career Counselor | 就业顾问 | 就业率(8所大学精确值) | 推 C |
| a3 Student Representative | 学生代表 | 地理位置与成本(8所大学精确值,权重0.30最高) | 推 H |
| a4 International Education Advisor | 国际教育顾问 | 国际化 + 师生比(8所大学精确值) | A/C 间犹豫 |
| a5 General Consultant | 综合顾问 | 学术+地理的粗略描述(与 a1/a3 措辞不同,测 SemanticTool 去重) | 综合平衡 |

**可观察信息**: 所有 agent 可看到其他人的发言(reasoning)、结构化证据(evidence with supports/strength)、itemBeliefs(rank/belief/confidence)。

**私有信息**: 每个 agent 的 knownItems(独有维度数据)不直接暴露,只能通过发言分享。

**认知张力设计**:
- briefing 暗示"学术声誉是核心"(锚定),但学术权重仅 0.20
- A 在学术/科研/国际 3 维第一但地理垫底(陷阱)
- H 地理最优但综合最差(反直觉)
- C/D、B/A 差距 <0.01 需语义级分辨
- a5 的信息与 a1/a3 语义等价但措辞不同(测试 SemanticTool evidence_dedup)

### 3.2 LLM Prompt 设计

#### 3.2.1 核心 Prompt: NativeCognitiveEngine.buildPrompt (v3.2 原生认知状态)

**文件**: [nativeCognitiveEngine.ts:378-512](../src/lib/discussion/nativeCognitiveEngine.ts)
**目的**: 让 LLM 直接输出认知状态(Utility/Evidence/Confidence),而非 post-hoc 反推。这是 v6 的核心范式。

**完整 Prompt 模板**:

```
You are ${agent.name}, a ${agent.role}.

Task: ${task}

Round: ${roundNumber}/${this.config.maxRounds}

${cognitiveContext}

${poolContext}${memoryContext}${currentRoundContext}${governanceContext}

Analyze the task and the previous discussion (if any). Provide your opinion with reasoning, evidence, and your internal cognitive state.

Respond in JSON format:
{
  "reasoning": "Your detailed analysis...",
  "evidence": [
    {"content": "evidence text", "supports": "Company A", "strength": 0.8},
    {"content": "evidence text", "supports": "Company B", "strength": 0.6}
  ],
  "confidence": 0 to 100,
  "cognitiveState": {
    "utility": {"Company A": 0.8, "Company B": 0.2},
    "evidenceCoverage": 0.6,
    "evidenceQuality": 0.7
  },
  "nextOpinion": "What you want to discuss next",
  "referencedAgents": ["agent_1", "agent_2"],
  "itemBeliefs": [
    {"item": "Company A", "rank": 1, "belief": 0.8, "confidence": 95},
    {"item": "Company B", "rank": 2, "belief": 0.2, "confidence": 70}
  ]
}

Field explanations:
- cognitiveState: your internal cognitive dimensions
  - utility: your preference strength for each option (-1=strongly oppose, 1=strongly support)
  - evidenceCoverage: how much of the total available information you think you have (0=none, 1=complete)
  - evidenceQuality: how reliable you think your information is (0=unreliable, 1=highly reliable)
- itemBeliefs: rank (1=best), belief (-1=oppose, 1=support) for each option.
- evidence: structured evidence items (v3.2.1). Each item MUST include:
  - content: the evidence text
  - supports: which option (from itemBeliefs) this evidence supports
  - strength: how strongly this evidence supports that option (0=weak, 1=strong)
```

**cognitiveContext 动态注入**(系统计算的认知状态作为背景参考):

```
【系统参考（仅背景，非强制）】系统基于讨论历史计算的认知状态：
- 偏好选项：${topChoice}
- 偏好清晰度：${clarity}（0=无偏好，1=极清晰）
- 偏好强度：${intensity}
- 证据覆盖：${evCoverage}（0=无证据，1=证据完整）
- 证据质量：${evQuality}（0=不可靠，1=高度可靠）
- 确信度：${confOverall}（0=不确信，1=完全确信）

以上为外部计算值，仅作背景参考，不代表你的实际判断。

【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的认知状态——
不要简单复述上述系统参考值，你的认知应反映你对证据的真实判断。
```

**设计意图**: 系统计算的 cognitiveState 作为"背景参考"注入,但明确告知 agent "不要简单复述",鼓励独立判断。这避免了 LLM 简单复制系统值。

**期望输出 JSON Schema**:

```json
{
  "reasoning": "string (minLength: 10)",
  "evidence": [{"content": "string", "supports": "string", "strength": 0-1}],
  "confidence": 0-100,
  "cognitiveState": {
    "utility": {"选项A": -1到1, "选项B": -1到1},
    "evidenceCoverage": 0-1,
    "evidenceQuality": 0-1
  },
  "nextOpinion": "string",
  "referencedAgents": ["string"],
  "itemBeliefs": [{"item": "string", "rank": integer≥1, "belief": -1到1, "confidence": 0-100}]
}
```

#### 3.2.2 SemanticTool Prompts (Tier 3 语义传感器)

**文件**: [SemanticTool.ts:66-113](../src/lib/thermodynamics/SemanticTool.ts)

**SYSTEM_PROMPT**:
```
You are a semantic analysis tool embedded in a multi-agent governance system.
Your role is strictly limited to semantic parsing. You do NOT make governance decisions.
You receive structured input from the deterministic governance engine and return structured JSON.

Rules:
1. Only reference items/agents that exist in the input
2. Do not fabricate evidence, agents, or intervention logic
3. If unsure, set confidence < 0.5 and explain why
4. Always return valid JSON matching the requested schema
```

**DEDUP_PROMPT** (证据语义去重):
```
Group the following evidence items by semantic meaning.
Items that express the same underlying claim should be in the same cluster, even if worded differently.
IMPORTANT CONSTRAINTS:
- Each item MUST appear in EXACTLY ONE cluster (no item may appear in multiple clusters).
- Assign ALL items to some cluster (no item may be omitted).
Return JSON: {"clusters":[{"label":"...","itemIds":["id1","id2"]}],"confidence":0.0-1.0}

Items:
{ITEMS}
```

**GAP_PROMPT** (信息缺口分析):
```
The multi-agent group is showing these diagnostic signals: {DELTAS}.
Group state: {STATE}.

The following evidence items have NOT been shared with the group:
{UNSHARED}

Identify which unshared items are most critical to the current discussion.
A critical item is one that, if shared, could meaningfully change the group's decision.
IMPORTANT CONSTRAINT:
- suggestedRecipients MUST ONLY contain exact agent IDs from the list above (do not invent agent names).
Return JSON:
{"criticalItems":[{"itemId":"...","reason":"...","suggestedRecipients":["agent1"]}],"nonCriticalItems":["..."],"confidence":0.0-1.0}
```

**INTERVENTION_PROMPT** (干预消息生成):
```
Generate a natural-language intervention message for a multi-agent discussion.

Intervention type: {TYPE}
Evidence to inject: {EVIDENCE}
Source agent: {SOURCE}
Target agents: {TARGETS}
Context: {CONTEXT}

The message should:
- Be concise (1-3 sentences)
- Not fabricate any information not in the evidence
- Sound natural in a group discussion context
- Not tell agents what to decide, only what information to consider

Return JSON: {"injectionMessage":"...","confidence":0.0-1.0}
```

#### 3.2.3 干预注入 Prompt

**inject_evidence** ([cognitiveInterventions.ts:66](../src/lib/governance/cognitiveInterventions.ts)):
```
[信息注入] 以下是讨论中被忽略的关键信息，请所有成员纳入判断：${injectedEvidence.join("；")}
```

**evidenceGuidance** (降级路径, [MeasurementLayer.ts:1337](../src/lib/thermodynamics/MeasurementLayer.ts)):
```
[治理建议] 请特别关注以下维度的证据：${mod.evidenceGuidance.join("、")}。尝试从不同角度评估你的判断。
```

---

## 4. LLM 生成参数

### 4.1 参数来源分类表

| 参数 | 来源 | 生成方式 | 意义 | 范围 |
|---|---|---|---|---|
| `reasoning` | LLM output | prompt extraction | 分析推理过程 | string |
| `evidence[].content` | LLM output | prompt extraction | 证据文本 | string |
| `evidence[].supports` | LLM output | prompt extraction | 证据支持的选项 | string |
| `evidence[].strength` | LLM output | prompt extraction | 证据支持强度 | 0-1 |
| `confidence` | LLM output | prompt extraction | Agent 确信程度 | 0-100 |
| `cognitiveState.utility` | LLM output | prompt extraction | 各选项偏好强度 | -1 到 1 |
| `cognitiveState.evidenceCoverage` | LLM output | prompt extraction | 信息覆盖度自评 | 0-1 |
| `cognitiveState.evidenceQuality` | LLM output | prompt extraction | 信息质量自评 | 0-1 |
| `itemBeliefs[].rank` | LLM output | prompt extraction | 选项排名 | integer≥1 |
| `itemBeliefs[].belief` | LLM output | prompt extraction | 选项偏好 | -1 到 1 |
| `itemBeliefs[].confidence` | LLM output | prompt extraction | 排名置信度 | 0-100 |
| `nextOpinion` | LLM output | prompt extraction | 下一步讨论方向 | string |
| `referencedAgents` | LLM output | prompt extraction | 引用的其他 agent | string[] |
| `utility.scores` (更新后) | 程序计算 | DeGroot 加权平均 | 更新后的偏好向量 | -1 到 1 |
| `utility.topChoice` | 程序计算 | argmax(scores) | 首选选项 | string |
| `utility.preferenceClarity` | 程序计算 | scores[0]-scores[1] | 偏好清晰度 | 0-2 |
| `utility.intensity` | 程序计算 | L2 范数 | 偏好强度 | 0-√K |
| `confidence.stated` | 程序计算 | LLM confidence/100 | LLM 自报信心 | 0-1 |
| `confidence.overall` | 程序计算 | 0.4·ev+0.6·LLM | 校准后信心 | 0-1 |
| `confidence.evidenceBased` | 程序计算 | ev.quality×ev.coverage | 证据支持信心 | 0-1 |
| `confidence.stability` | 程序计算 | 1-\|LLM-prev\| | 信心稳定性 | 0-1 |
| `evidence.diversity` | 程序计算 | Shannon 熵归一化 | 证据多样性 | 0-1 |
| `inertia.strength` (轮内) | 程序计算 | role+refutation+decay | 角色惯性 | 0.05-0.95 |
| `inertia.estimate` (跨轮) | 程序计算 | ProgressiveEstimator | 行为惯性估计 | 0.05-0.95 |
| `susceptibility.estimate` | 程序计算 | (1-ι)(1-c) 或行为估计 | 易感性 | 0.05-0.95 |
| `susceptibility.usable` | 程序计算 | exposed≥2 | 估计是否可用 | boolean |
| `R` | 程序计算 | cosine 相似度均值 | 群体对齐度 | 0-1 |
| `T` | 程序计算 | utility L2 距离均值 | 温度(波动度) | 0-1 |
| `H` | 程序计算 | Shannon 熵 | 证据多样性熵 | 0-1 |
| `F` | 程序计算 | U-T·H | 自由能 | [0,1] |
| `maxRounds` | 人工设置 | ExperimentConfig | 最大轮次 | 5 (v6) |
| `temperature` | 人工设置 | ExperimentConfig | LLM 温度 | 0.0 (v6) |
| `llmModel` | 人工设置 | ExperimentConfig | LLM 模型 | deepseek-v4-flash |
| `convergenceThreshold` | 人工设置 | ExperimentConfig | 收敛阈值 | 0.06 |
| `strongCrystallF` | 人工设置 | TerminationDecider | 强结晶 F 阈值 | 0.15 |
| `crystallF` | 人工设置 | TerminationDecider | 普通结晶 F 阈值 | 0.25 |
| `crystallR` | 人工设置 | TerminationDecider | 结晶 R 阈值 | 0.85 |
| `crystallH` | 人工设置 | TerminationDecider | 结晶 H 阈值 | 0.42 |
| `crystallT` | 人工设置 | TerminationDecider | 结晶 T 阈值 | 0.22 |

### 4.2 三个关键回答

**1. 哪些参数由 LLM 直接生成?**
- reasoning, evidence(content/supports/strength), confidence(0-100)
- cognitiveState.utility, evidenceCoverage, evidenceQuality
- itemBeliefs(item/rank/belief/confidence)
- nextOpinion, referencedAgents

**2. 哪些参数由程序计算?**
- 更新后的 utility.scores(DeGroot)、topChoice、preferenceClarity、intensity
- confidence.overall(shrinkage)、evidenceBased、stability
- evidence.diversity(Shannon 熵)
- inertia.strength(role+refutation+decay)、estimate(ProgressiveEstimator)
- susceptibility.estimate((1-ι)(1-c) 或行为估计)
- R/T/H/F(热力学量)
- Kendall τ(决策质量)

**3. 哪些参数由人工设置?**
- maxRounds, temperature, llmModel, convergenceThreshold
- 所有阈值(strongCrystallF, crystallR/H/T/F, δ 阈值等)
- seed 列表, runsPerSeed

---

## 5. 数学模型与参数计算

### 5.1 R (Kuramoto 序参量 / Utility 对齐度)

**Definition**:
$$R = \frac{\text{avg\_cosine}(U_i, U_j) + 1}{2}, \quad \text{avg\_cosine} = \frac{2}{N(N-1)} \sum_{i<j} \cos(U_i, U_j)$$

**Variables**:
- $U_i$: agent i 的 utility 向量(`utility.scores`),按选项并集构建,缺失项为 0
- $N$: agent 数量
- $\cos(U_i, U_j) = \frac{U_i \cdot U_j}{\|U_i\| \|U_j\|}$,范数为 0 时返回 0

**Intuition**: 群体偏好方向的一致性。R→1 表示所有 agent 偏好同一方向,R→0.5 表示无相关。

**Theoretical Motivation**: 启发式(操作化指标,非物理 Kuramoto)。代码注释明确指出与旧 `|Σe^(iθ)|/N` 不同实现。**[MeasurementLayer.ts:266, 339-373](../src/lib/thermodynamics/MeasurementLayer.ts)**

### 5.2 T (温度 / Utility 波动度)

**Definition**:
$$T = \frac{1}{N_{\text{valid}}} \sum_i \frac{\|U_i(t) - U_i(t-1)\|}{2\sqrt{K_i}}$$

**Variables**:
- $\|U_i(t) - U_i(t-1)\| = \sqrt{\sum_k (u_{i,k}(t) - u_{i,k}(t-1))^2}$
- $K_i$: agent i 的 utility 选项数
- 归一化: utility ∈ [-1,1]^K,最大 L2 距离 = 2√K

**Intuition**: 群体偏好的时序波动度。T→0 表示偏好冻结,T→1 表示剧烈波动。第一轮无历史 → T=0。

**Theoretical Motivation**: 启发式(替代旧 `1-mean(stabilityBased)`,避免 LLM overconfidence 偏差)。**[MeasurementLayer.ts:269, 408-441](../src/lib/thermodynamics/MeasurementLayer.ts)**

### 5.3 H (熵 / Evidence 多样性)

**Definition**:
$$H = \frac{-\sum_x p_x \log_2 p_x}{\log_2(|\text{unique supports}|)}, \quad p_x = \frac{\text{count}(supports = x)}{\text{total items}}$$

**Variables**:
- `evidence.items`: 所有 agent 的证据条目
- `item.supports`: 该证据支持的选项

**Intuition**: 证据支持方向的多样性。H→0 表示所有证据支持同一选项(回声室),H→1 表示均匀分布。

**Theoretical Motivation**: Shannon 熵。**[MeasurementLayer.ts:272, 456-481](../src/lib/thermodynamics/MeasurementLayer.ts)**

### 5.4 F (自由能 / Helmholtz 形式)

**Definition**:
$$F = U - T \cdot H, \quad U = \frac{1}{N} \sum_i \frac{\|U_i\|}{\sqrt{K}}$$

**Variables**:
- $U$: 平均效用强度(群体偏好清晰度)
- $\|U_i\| = \sqrt{\sum_k u_{i,k}^2}$ (L2 范数)
- $T$: 温度,$H$: 熵

**Intuition**: 系统自由能。F→低 表示系统过度有序(可能伪收敛),F→高 表示有能量做功(系统仍在探索)。

**Theoretical Motivation**: Helmholtz 自由能形式(操作化综合失序指标,非物理量)。2026-08-04 验证: r(U, T·H)=-0.087(n=127, p=0.33),解耦成立;但 r(U,H)=-0.739,非完全正交。**[MeasurementLayer.ts:274-286](../src/lib/thermodynamics/MeasurementLayer.ts)**

**⚠ 已知不一致**: 旧 async 路径(fraud 系列)用 `F=(1-R)+T·H`(社交自由能),r=0.917(强耦合)。v6 sync 路径用 `F=U-T·H`(Helmholtz)。两条路径的 F 语义不同,阈值不可混用。

### 5.5 δ_polarization (效用极化)

**Definition**:
$$\delta_{\text{polarization}} = \frac{2}{N(N-1)} \sum_{i<j} \text{cosineDist}(U_i, U_j), \quad \text{cosineDist} = 1 - \cos(U_i, U_j)$$

**Threshold**: 0.15 (base) + (1-minConfidence)×0.05。minConfidence=1.0(轮内 U 完全可靠)→ effectiveThreshold=0.15。

**Intuition**: 群体偏好向量两极分化程度。

**Theoretical Motivation**: 启发式(pairwise cosine 而非 k-means,避免小样本 n=5 不稳定)。**[computeDelta.ts:150-177](../src/lib/thermodynamics/computeDelta.ts)**

### 5.6 δ_1d_mask (一维掩码 / 标量共识掩盖向量分歧)

**Definition**:
$$\delta_{\text{1d\_mask}} = R \times \text{meanDist}, \quad \text{meanDist} = \frac{2}{N(N-1)} \sum_{i<j} \text{cosineDist}(U_i, U_j)$$

**Threshold**: 0.40。

**Intuition**: R 高(标量共识)+ meanDist 高(向量分歧)→ 标量共识掩盖了真实的偏好结构分歧 → 过早共识。

**Theoretical Motivation**: 启发式。这是唯一读取 thermo.R 的 δ 信号。**[computeDelta.ts:192-226](../src/lib/thermodynamics/computeDelta.ts)**

### 5.7 δ_confidence_gap (信心-效用矛盾)

**Definition**:
对每个 agent i:
- if `stated_i ≥ 0.8` AND `cosineDist(U_i, U_group_mean) > 0.5`: 标记为 overconfident
- $\delta_{\text{confidence\_gap}} = \max(\text{dist}_i)$ over overconfident agents

**Threshold**: 双重门控(stated≥0.8 且 dist>0.5)。

**Intuition**: Agent 自报高信心但效用向量偏离群体均值 → 自报信心与实际偏好位置矛盾。

**Theoretical Motivation**: 启发式(检测行为矛盾,不声称"真实信心")。**[computeDelta.ts:292-338](../src/lib/thermodynamics/computeDelta.ts)**

**⚠ 已知不一致**: 在 post-hoc 路径(cognitiveState.ts,@deprecated)下,`stated = overall ≤ 0.5`,此 δ 永不触发。Native 路径下 stated=LLM 自报,正常工作。

### 5.8 δ_concentration (惯性集中)

**Definition**:
$$\delta_{\text{concentration}} = \frac{\max(I)}{\text{mean}(I)}, \quad I = [\text{est.inertia.estimate for each agent}]$$

**Threshold**: 2.0 + (1-minC)×0.40。门控: minC < 0.25 时不触发(短对话 I 估计不可靠)。

**Intuition**: 惯性是否集中在少数 agent。值>2 表示某 agent 惯性是平均的 2 倍以上。

**Theoretical Motivation**: 启发式。**[computeDelta.ts:449-509](../src/lib/thermodynamics/computeDelta.ts)**

### 5.9 δ_consistency (立场-惯性矛盾)

**Definition**:
对每个 agent i:
$$\text{score}_i = \Delta U_i \times I_i, \quad \Delta U_i = \|U_i(t) - U_i(t-1)\|_2$$

**Threshold**: 2.0 + (1-minC)×0.35。门控: minC < 0.25 时改用严格阈值 base×1.5=3.0。

**Intuition**: 高惯性 agent 大幅翻转 → 与惯性预测矛盾。旧公式 `ΔU/I` 方向错误(高惯性大幅翻转反而不标记),已修正为 `ΔU×I`。

**Theoretical Motivation**: 启发式。**[computeDelta.ts:517-598](../src/lib/thermodynamics/computeDelta.ts)**

### 5.10 DeGroot 更新公式

**Definition**:
$$U_i(t+1) = (1 - \lambda_i) U_i(t) + \lambda_i \sum_j w_{ij} U_j(t)$$
$$\lambda_i = \max((1 - \iota_i)(1 - c_i), 0.05)$$

**Variables**:
- $\iota_i$: inertia.strength(惯性)
- $c_i$: confidence.overall(信心)
- $w_{ij}$: influence weight(默认 1,可通过治理降低)
- MIN_SUSCEPTIBILITY = 0.05(防止完全锁死)

**Intuition**: 惯性高/信心高的 agent 更少受他人影响(λ 小),惯性低/信心低的 agent 更多受影响(λ 大)。

**Theoretical Motivation**: DeGroot 加权平均模型。**[cognitiveState.ts:647-701](../src/lib/agent/cognitiveState.ts)**

**⚠ 已知设计**: `inertia.strength` 在同轮内被赋值两次(轮内 updateInertia 后 + δ 诊断 estimateAll 后覆写)。DeGroot 更新用系统 A 的值,δ 检测器用系统 B 覆写后的值。详见 §9 已知限制。

### 5.11 Inertia 计算

**Definition**:
$$\text{strength} = (0.7 \cdot \text{roleBase} + 0.2 \cdot \text{evidenceBased} + 0.1 \cdot \text{expressionBased} - 0.1 \cdot \text{refutations}) \times 0.98$$

**Variables**:
- roleBase: 角色基础惯性(expert=0.6, analyst=0.5, critic=0.4, moderator=0.3, novice=0.3, default=0.4)
- evidenceBased = evidence.coverage × 0.3
- expressionBased: 发言则 +0.05
- refutations: 反驳次数 × 0.1 惩罚
- 0.98: 每轮 2% 衰减

**Theoretical Motivation**: 启发式(角色先验 + 表达 + 证据 + 反驳 + 衰减)。**[cognitiveState.ts:584-626](../src/lib/agent/cognitiveState.ts)**

### 5.12 Confidence Shrinkage

**Definition**:
$$\text{overall} = 0.4 \times \text{evidenceBased} + 0.6 \times \text{nativeConfidence}$$
$$\text{evidenceBased} = \text{evidence.quality} \times \text{evidence.coverage}$$
$$\text{stability} = 1 - |\text{nativeConfidence} - \text{prev\_overall}|$$

**Variables**:
- nativeConfidence: LLM 自报 confidence/100
- 权重 0.4/0.6: 保留 LLM 元认知信号为主,系统客观信号为辅

**Theoretical Motivation**: Bayesian shrinkage / Platt scaling 启发式。**[MeasurementLayer.ts:1170-1188](../src/lib/thermodynamics/MeasurementLayer.ts)**

### 5.13 Kendall τ-b (决策质量)

**Definition**:
$$\tau_b = \frac{C - D}{\sqrt{(n_0 - n_1)(n_0 - n_2)}}$$
$$n_0 = \frac{n(n-1)}{2}, \quad n_1 = \sum \frac{t_i(t_i-1)}{2} \text{ (x ties)}, \quad n_2 = \sum \frac{t_i(t_i-1)}{2} \text{ (y ties)}$$

**Variables**:
- C: concordant pairs, D: discordant pairs
- $t_i$: tie group size

**Intuition**: 排名相关性。τ=1 完全一致,τ=-1 完全相反,τ=0 无关。

**Theoretical Motivation**: Kendall τ-b(标准定义,tie 修正)。2026-08-04 确认 tie 修正用 `t_i(t_i-1)/2`(正确),非旧 bug 的 `t_i(t_i+1)/2`。**[statsShared.ts:291-341](../experiments/v2/statsShared.ts)**

### 5.14 Permutation Test p 值

**Definition**:
$$p = \frac{\text{countExtreme} + 1}{n_{\text{perms}} + 1}$$

**Variables**:
- countExtreme: $|\text{permDiff}| \geq |\text{observedDiff}|$ 的置换次数
- nPerms = 10,000
- PERMUTATION_SEED = 42

**Theoretical Motivation**: Fisher 置换检验 + Phipson-Smyth +1/+1 校正(避免 p=0 假阳性)。**[StatisticalTest.ts:104-132](../experiments/campaign/pipeline/StatisticalTest.ts)**

### 5.15 Cohen's d

**Definition**:
$$d = \frac{m_a - m_b}{s_p}, \quad s_p = \sqrt{\frac{(n_a-1)s_a^2 + (n_b-1)s_b^2}{n_a + n_b - 2}}$$

**Theoretical Motivation**: Cohen's d(独立样本,pooled SD)。**[StatisticalTest.ts:175-182](../experiments/campaign/pipeline/StatisticalTest.ts)**

---

## 6. Runtime 运行流程

### Step 1: 系统初始化 Scenario

**输入**: ExperimentConfig(scenario, governanceMode, seeds, maxRounds, llmModel)
**处理**: Runner.ts 加载任务定义,创建 NativeCognitiveEngine,实例化 MeasurementLayer + TerminationDecider
**输出**: engine 实例,agents[], task, scenario
**代码**: [Runner.ts:379-420](../experiments/campaign/pipeline/Runner.ts)

### Step 2: Agent 调用 LLM

**输入**: agent, round, cognitiveStates(上一轮), governancePrompts(干预)
**Prompt**: NativeCognitiveEngine.buildPrompt(见 §3.2.1)
**处理**: 每个 agent 调用 LLM,temperature=0.0,输出 JSON
**输出**: AgentOpinion(reasoning, evidence, confidence, cognitiveState, itemBeliefs)
**代码**: [nativeCognitiveEngine.ts:231](../src/lib/discussion/nativeCognitiveEngine.ts) → [index.ts:231](../src/lib/discussion/index.ts)

### Step 3: Cognitive State Extraction

**输入**: LLM 输出的 JSON
**处理**: NativeCognitiveOpinionParser 解析,提取 cognitiveState.utility/evidenceCoverage/evidenceQuality,支持 v3.2.1 结构化 evidence(content/supports/strength)
**输出**: AgentOpinion + NativeCognitiveOutput
**代码**: [nativeCognitiveEngine.ts:85-202](../src/lib/discussion/nativeCognitiveEngine.ts)

### Step 4: Governance (δ 诊断 + 干预生成)

**输入**: round, opinions, agentStates, agents
**处理**:
- B组(cognitive + δ同步): applyCognitiveGovernance → diagnoseAndSuggestSync
  - Tier 1: isThermoAbnormal(R,T,H,F) → 正常返回 EMPTY_DELTA_DIAGNOSIS
  - Tier 2: computeDeltaDiagnosis(8 signals) → buildDeltaSuggestions
  - 生成 CognitiveStateModification(inject_evidence / rebalance_attention)
- C组(cognitive + SemanticTool): applyCognitiveGovernanceAsync → diagnoseAndSuggest
  - Tier 1 → Tier 2 → (模糊)Tier 3 SemanticTool
  - C4 修复:按 targetAgents 去重合并数学层和 SemanticTool 的 inject_evidence（MeasurementLayer.ts:1558-1566，原 targetAgentId 字段不存在导致 Set([undefined]) 全丢，08-06 fix#3 已改）
**输出**: governanceResult {hasIntervention, interventions, issues}
**代码**: [nativeCognitiveEngine.ts:565-595](../src/lib/discussion/nativeCognitiveEngine.ts), [MeasurementLayer.ts:1432-1730](../src/lib/thermodynamics/MeasurementLayer.ts)

### Step 5: Cognitive State Update (消费干预)

**输入**: opinions, agents, round, pendingCognitiveModifications
**处理**:
- MeasurementLayer.updateCognitiveStates(mode="native")
  - updateUtility(DeGroot 加权,消费 rebalance_attention 的 weight 修改)
  - updateEvidence(items 填充,diversity 计算)
  - updateConfidence(shrinkage 0.4·ev+0.6·LLM)
  - updateInertia(role+refutation+decay)
- 消费 inject_evidence(注入的证据加入 evidence pool)
- 计算 post-update thermoState → push thermoHistory
**输出**: updated cognitiveStates, thermoHistory[round]
**代码**: [nativeCognitiveEngine.ts:531-549](../src/lib/discussion/nativeCognitiveEngine.ts), [MeasurementLayer.ts:1113-1279](../src/lib/thermodynamics/MeasurementLayer.ts)

### Step 6: Termination Check

**输入**: thermoHistory[round](post-update), round, maxRounds
**处理**: TerminationDecider.evaluateSync(R,T,H,F,round,maxRounds)
  - round >= maxRounds → 硬上限终止
  - F < 0.15 → 强结晶态立即终止
  - classifyStateSync == "crystallized" 连续 3 次 → 终止
**输出**: TerminationDecision {shouldTerminate, reason, stateType, message}
**代码**: [index.ts:344](../src/lib/discussion/index.ts), [TerminationDecider.ts:247-300](../src/lib/thermodynamics/TerminationDecider.ts)

### Step 7: Final Decision

**输入**: 最后一轮的 opinions
**处理**:
- 聚合所有 agent 的 itemBeliefs
- extractRanking: normalizeItemName(精确→子串→searchKeys) → 按 avgRank 升序
- kendallTau(groundTruth, finalRanking)
**输出**: finalRanking, finalKendallTau
**代码**: [Runner.ts:529-548](../experiments/campaign/pipeline/Runner.ts), [statsShared.ts:236-341](../experiments/v2/statsShared.ts)

---

## 7. 实验设计

### 7.1 University Selection Task (v6 主任务)

**文件**: [task_university.ts](../experiments/campaign/tasks/task_university.ts)

**背景**: 8 所大学综合实力排名,6 个维度(学术0.20/就业0.15/师生比0.10/科研0.15/国际化0.10/地理0.30)

**目标**: 5 个 agent 通过讨论达成正确的大学排名

**Ground Truth**:
| 排名 | 大学 | 综合分 |
|---|---|---|
| 1 | 大学C-明德大学 | (质量+技术强) |
| 2 | 大学D-致远大学 | |
| 3 | 大学B-博雅大学 | |
| 4 | 大学A-启明大学 | (学术第一但地理垫底,陷阱) |
| 5 | 大学E-弘毅大学 | |
| 6 | 大学F-行知大学 | |
| 7 | 大学G-慎思大学 | |
| 8 | 大学H-笃行大学 | (地理最优但综合最差) |

**Agent Setting**: 见 §3.1

**Hidden Information**: 每个 agent 只掌握 1-2 个维度的精确数据(见 §3.1 信息分配表)

**Evaluation Metrics**:
- finalKendallTau(决策质量)
- δ 触发率(8 个信号)
- 干预次数和类型
- R/T/H/F 轨迹
- tokenUsage

**Experimental Procedure**:
1. 加载 E9 配置(4 组 × 10 seeds × 5 runs = 200 runs)
2. 每组: 创建 engine → 5 轮讨论 → 落盘 RawRunData
3. 分析: MetricComputer → StatisticalTest → FigureGenerator → ReportGenerator

### 7.2 E9 四组对照 (v6 Phase 3 主实验)

**配置文件**: [e9_cognitive_governance.ts](../experiments/campaign/configs/e9_cognitive_governance.ts)

| 组 | id | governanceMode | useSemanticTool | 路径 |
|---|---|---|---|---|
| A 基线 | e9_v6_a_none | none | false | 父类无治理 |
| B δ纯数学 | e9_v6_b_delta | cognitive | false | applyCognitiveGovernance(同步) |
| C δ+LLM | e9_v6_c_semantic | cognitive | true | applyCognitiveGovernanceAsync(Tier1→2→3) |
| D 旧检测器 | e9_v6_d_old | full | false | 父类旧检测器 |

**通用参数**: scenario=university, runtimeModes=[native_cognitive], agentCount=5, maxRounds=5, runsPerSeed=5, llmModel=deepseek-v4-flash, temperature=0.0, seeds=[42,123,456,789,1024,2048,4096,8192,16384,32768](10 seeds)

### 7.3 Supplier Selection Task (v2 历史任务)

**文件**: [task_supplier.ts](../experiments/v2/task_supplier.ts)

**背景**: 5 家供应商选择,5 个维度(质量0.30/交付0.25/成本0.20/技术0.15/财务0.10)

**Ground Truth**: 供应商C-精研科技=1, 供应商B-稳达制造=2, 供应商E-锐新科技=3, 供应商A-宏远工业=4, 供应商D-利通集团=5

**认知张力**: A 在成本/交付/财务 3 个低权重维度第一(表面赢家),但在质量/技术 2 个高权重维度垫底(陷阱)

**Agent Setting**: 5 个 agent,每人掌握 1 个维度:

| Agent | Role | 维度 |
|---|---|---|
| a1 Cost Analyst | 成本分析师 | 成本(0.20) |
| a2 Supply Chain Manager | 供应链经理 | 交付(0.25) |
| a3 Quality Engineer | 质量工程师 | 质量(0.30,最高) |
| a4 Technical Director | 技术总监 | 技术(0.15) |
| a5 Finance Advisor | 财务顾问 | 财务(0.10) |

### 7.4 Hazardous Region Selection Task

**⚠ 此任务不存在**。全项目扫描未发现名为 "Hazardous Region Selection" 的任务。Grep `[Hh]azardous|[Rr]egion [Ss]election` 仅命中 HiddenBench benchmark.json 中的 incidental 用词(如 "hazardous chemical leak"),并非独立任务。

### 7.5 其他实验配置

| 实验 | 配置文件 | 场景 | governanceMode | runsPerSeed | seeds |
|---|---|---|---|---|---|
| E1 稳定性 | e1_stability.ts | ma | none | 5 | [42,123,456] |
| E1 Native | e1_native.ts | ma | none | 5 | [42,123,456] |
| E2 证据 | e2_evidence.ts | ma | none | 10 | [42,123,456,789,1024] |
| E3 惯性 | e3_inertia.ts | ma | detect-only | 10 | [42,123,456,789,1024] |
| E4 信心 | e4_confidence.ts | ma | none | 10 | [42,123,456,789,1024] |
| E5 治理 | e5_governance.ts | ma | diversity_only | 10 | [42,123,456,789,1024] |
| E6 解耦 | e6_decoupling.ts | ma | none | 10 | [42,123,456,789,1024] |
| E7 检测器 | e7_detector.ts | ma | detect-only | 4 | [42,123,456,789,1024] |
| E8 易感性 | e8_susceptibility.ts | ma | none | 10 | [42,123,456,789,1024] |
| E10 证据池 | e10_evidence_pool.ts | university | none | 1 | [42] |
| E11 HiddenBench | e11_hiddenbench.ts | hiddenbench | none/cognitive/full | 5 | [42,123,456] |

---

## 8. 实验结果

### 8.1 v6 Pilot (University, seed=42, 1 run each)

**数据来源**: [pilot_output/](../experiments/campaign/pilot_output/)

| Run | Scenario | Group | Governance | τ | Rounds | Converged |
|---|---|---|---|---|---|---|
| seed42_run0 | university | A | none | 0.571 | 5 | false |
| seed42_run0 | university | B | δ cognitive | 0.643 | 5 | false |

**Δτ = +0.072(B-A)**。注意:单 seed 单 run,方差大,无统计显著性。

### 8.2 E9 Optimized A (12 选项, 3 seeds × 3 runs = 9 runs)

**数据来源**: [output/e9_optimized_a/](../experiments/campaign/output/)

| Run | Scenario | Governance | τ | Status |
|---|---|---|---|---|
| seed42_run0 | optimized | none | 0 | ⚠ 数据异常 |
| seed42_run1 | optimized | none | 0 | ⚠ 数据异常 |
| seed42_run2 | optimized | none | 0 | ⚠ 数据异常 |
| seed123_run0 | optimized | none | 0 | ⚠ 数据异常 |
| ... | ... | ... | 0 | ⚠ 数据异常 |

**⚠ 数据损坏**: 9 个 run 的 finalKendallTau 全为 0,finalRanking 为空数组,但标记 converged=true。数据实质未收敛。report.md 标注 "Sample Size=9, τ=0.000, p=1.0000, not significant"。

### 8.3 E9 V6 C Semantic (University, seed=42, 5 runs)

**数据来源**: [output/e9_v6_c_semantic/](../experiments/campaign/output/)

| Run | Scenario | Governance | τ |
|---|---|---|---|
| seed42_run0 | university | δ+SemanticTool | 0.571 |
| seed42_run1 | university | δ+SemanticTool | 0.571 |
| seed42_run2 | university | δ+SemanticTool | 0.000 ⚠️退化 |
| seed42_run3 | university | δ+SemanticTool | 0.000 ⚠️退化 |
| seed42_run4 | university | δ+SemanticTool | 0.000 ⚠️退化 |

**Mean τ = 0.229, p=0.1849, not significant**(report.md)。

> ⚠️ **数据有效性标注（2026-08-06 审计）**: 5 runs 中仅 **run0/run1** 为有效 semantic 异步路径（semanticAuditLog=8，5 轮，τ=0.571）；**run2/3/4 为旧 `checkConvergence` 伪收敛（opinions<2 → return true）直接产物**（1-2 轮即"收敛"、`finalRanking` 为空、τ=0），已由 08-06 fix#1/#2 作废。本表 mean τ=0.229 含 3 个伪收敛 run——**不可作为 C 组结论引用**。SemanticTool/δ+LLM 收益主张需用当前代码重跑（n≥10）；run0/1 仅作 n=2 有效样例保留。详见 [AUDIT_CLAIM_VERIFICATION.md §9.4](AUDIT_CLAIM_VERIFICATION.md)。

### 8.4 E12 BC (Crisis V2, 3 seeds × 1 run = 6 runs)

**数据来源**: [output/e12_bc/](../experiments/campaign/output/)

| Run | Scenario | Group | τ |
|---|---|---|---|
| seed42_run0 | crisis_v2 | B (δ) | 1.0 |
| seed123_run0 | crisis_v2 | B (δ) | 1.0 |
| seed456_run0 | crisis_v2 | B (δ) | 1.0 |
| seed42_run0 | crisis_v2 | C (δ+Semantic) | 1.0 |
| seed123_run0 | crisis_v2 | C (δ+Semantic) | 1.0 |
| seed456_run0 | crisis_v2 | C (δ+Semantic) | 1.0 |

**⚠ 天花板效应**: τ 全为 1.0,crisis_v2 任务可能过于简单。totalRounds=15, converged=false。

### 8.5 v2 历史实验 (Crisis 80 runs + Supplier 89 runs = 169 闭环)

**数据来源**: [v2/data_crisis/](../experiments/v2/data_crisis/), [v2/data_supplier/](../experiments/v2/data_supplier/)

**关键发现**(来自 README.md):
- 弱共识-质量相关 r≈-0.10(不显著)
- 结构干预 > 过程干预 d=1.44
- 任务难度是总开关(Crisis τ=0.41 困难 vs Supplier τ=0.68 简单)
- v2.0 破坏性干预 Δτ=-0.267(降低权重+强制反思)
- v2.1 非破坏性干预 Δτ=+0.533(注入证据+重平衡注意力,pilot 3 seeds × 1 run)

### 8.6 E9 Phase 3 主实验 (200 runs)

**状态**: **Data unavailable**。E9 四组(A/B/C/D)× 10 seeds × 5 runs = 200 runs 尚未执行。所有现有结论基于 pilot(2 runs)或部分组(5-9 runs),无统计效力。

### 8.7 F 解耦验证 (2026-08-04)

**数据来源**: campaign native_cognitive 数据(n=127 观测点)

| 指标 | 声称值 | 实际值 | 判定 |
|---|---|---|---|
| r(U, T·H) | 0.274 | -0.087 | ✓ 解耦成立(优于声称) |
| r(U, H) | - | -0.739 | ⚠ U-H 强相关 |
| r(T, H) | - | -0.174 | ✓ 弱相关 |
| 旧 F r(1-R, T·H) | 0.917 | 0.262(campaign) | 旧 F 在 campaign 数据上没那么强 |

**结论**: F=U-T·H 解耦成立,但代码注释 r=0.274 是标量 belief L1 范数的结果误归因到 utility 向量 L2,已修正。

---

## 9. 系统限制与未来工作

### 9.1 LLM Self-Report Reliability

**问题**: Native 路径下 evidence.coverage/quality 和 confidence.stated 依赖 LLM 自报。LLM 普遍 overconfidence(stated 常达 85-95)。

**影响**: δ_confidence_gap 检测器依赖 stated≥0.8 门控,overconfidence 导致频繁触发。

**缓解**: confidence.overall 用 0.4·ev+0.6·LLM shrinkage 校准,抑制但未消除 overconfidence。

### 9.2 Ground Truth 缺失

**问题**: δ 诊断本身不需要 Ground Truth(检测行为矛盾),但实验评估需要 Kendall τ 对比正确答案。

**影响**: 真实部署场景无 Ground Truth,τ 无法计算。但 δ 诊断仍可运行。

**缓解**: 论文需明确区分"系统设计不需 Ground Truth"和"实验评估需要 Ground Truth"。

### 9.3 Coefficient Sensitivity

**问题**: 大量阈值(strongCrystallF=0.15, crystallR=0.85, δ 阈值等)基于小样本标定。

**影响**: F 阈值标定基于 campaign 数据 F range=[0.19, 0.89],strongCrystallF=0.15 可能极少触发(最低 0.19 > 0.15)。

**缓解**: 需 Phase 3 的 200 runs 数据重新标定。ABLATION_PLAN.md 有消融实验方案。

### 9.4 Simulation Scale Limitation

**问题**: 仅 5 个 agent。叙事声称"大量 Agent"但未验证规模化。

**影响**: δ 诊断是否随 agent 数量缩放未知。R/T/H/F 在大 N 下的行为未测。

**缓解**: 论文需声明为小规模验证 + 讨论缩放路径。E1_VALIDATION_AGENT_COUNT 有 3/7 agent 对照但数据有限。

### 9.5 认知状态 5 维的跨路径不一致

**问题**: 项目存在三套认知状态更新实现(native / MeasurementLayer post-hoc / cognitiveState.ts post-hoc),字段同名不同义:

| 字段 | Native | cognitiveState.ts post-hoc |
|---|---|---|
| confidence.stated | LLM 自报 | =overall(伪一致) |
| confidence.stability | 动态 | 硬编码 0.5 |
| evidence.coverage | LLM 自报 | \|items\|/10 |
| evidence.quality | LLM 自报 | 恒=0.5 |

**影响**: 跨路径分析不可比。v6 主实验只用 native 路径,组内一致,但跨 runtime 模式的解释性分析受污染。

**缓解**: cognitiveState.ts 已标 @deprecated,MetricComputer 有混合模式告警。

### 9.6 Inertia 同轮双赋值

**问题**: `inertia.strength` 在同轮内被赋值两次:
1. updateCognitiveStatesFromRound 后:role+refutation+decay 值(系统 A)
2. diagnoseAndSuggest 的 estimateAll 后:行为事件融合值(系统 B)

**影响**: DeGroot 更新用系统 A 的值,δ 检测器用系统 B 覆写后的值。同一字段在 DeGroot 更新和检测器输入中语义不同。

**状态**: 已知设计,不修改(系统 A 用于信念更新,系统 B 用于异常检测,用途不同)。

### 9.7 Runner 落盘绕过 Tier 1

**问题**: Runner.ts 直接调 `computeDeltaDiagnosis`(绕过 Tier 1 筛查),而治理路径用 `diagnoseAndSuggestSync`(含 Tier 1 门控)。

**影响**: 落盘的 δ 触发率 > 治理路径实际触发的 δ 触发率。分析者看到的 δ 数据与治理决策用的 δ 数据不是同一份。

**缓解**: 论文分析时需区分"诊断分析用 δ"和"治理决策用 δ"。

### 9.8 δ_no_response 难触发

**问题**: 门控要求 susceptibility.usable(exposed≥2),但 maxRounds=5 的短讨论中暴露事件难达 2 次。

**影响**: δ_no_response 在 v6 主实验中可能极少触发。

### 9.9 a2 信息维度

**问题**: task_university 中 a2(就业顾问)只掌握 1 个维度(就业率),但设计目标写"每个 agent ≥ 2 条独有信息"。

**澄清**: 若"条"指数据点(8 所大学=8 点)则满足,指维度则不满足。论文表述需澄清。

### 9.10 llmModel 疑点

**问题**: E9 配置写 `deepseek-v4-flash`,但 providers.ts 默认 deepseek 是 `deepseek-chat`。memory 记录项目用 Qwen 3.7-plus。

**状态**: **需确认实际跑的模型**。这直接影响可复现性声明。

---

## 10. Developer Guide

### 10.1 环境安装

```bash
# 克隆项目
git clone <repo-url>
cd swarmalpha

# 安装依赖
npm install

# 配置 API Key
cp .env.local.example .env.local
# 编辑 .env.local,填入 DEEPSEEK_API_KEY
```

**技术栈**: TypeScript, Next.js 14, React 18, Tailwind, Vitest

### 10.2 配置 API

**文件**: `.env.local`

```env
DEEPSEEK_API_KEY=your_key_here
# 可选: ZHIPU_API_KEY, OPENAI_API_KEY
```

**模型配置**: [providers.ts](../src/lib/llm/providers.ts) 支持 DeepSeek / Zhipu / OpenAI / Ollama

### 10.3 运行实验

#### Pilot (单次验证)

```bash
# B 组(δ 治理)
npx tsx experiments/campaign/pilot_v6.ts b

# A 组(无治理基线)
npx tsx experiments/campaign/pilot_v6.ts a
```

#### 完整实验

```bash
# 跑所有主实验
npx tsx experiments/campaign/run_all.ts

# 跑特定实验
npx tsx experiments/campaign/run_all.ts --experiment=e9_v6_b_delta

# 仅分析(不跑新实验)
npx tsx experiments/campaign/run_all.ts --analyze-only

# 指定 seed
npx tsx experiments/campaign/run_all.ts --seeds=42,123

# 指定模型
npx tsx experiments/campaign/run_all.ts --model=gpt-4o
```

**成本门控**: DEFAULT_TOKEN_BUDGET=500,000(DeepSeek 约 ¥35)

### 10.4 查看结果

```bash
# 分析流水线
npx tsx experiments/campaign/pipeline/MetricComputer.ts
npx tsx experiments/campaign/pipeline/StatisticalTest.ts
npx tsx experiments/campaign/pipeline/FigureGenerator.ts
npx tsx experiments/campaign/pipeline/ReportGenerator.ts

# F 解耦验证(只读)
npx tsx experiments/campaign/analyze_f_decoupling_verification.ts
```

**输出目录**:
- `experiments/campaign/output/` — 实验原始数据(raw/) + 分析报告
- `experiments/campaign/pilot_output/` — pilot 数据

### 10.5 文件结构

```
swarmalpha/
├── src/
│   └── lib/
│       ├── discussion/          # 讨论引擎
│       │   ├── index.ts         # DiscussionEngine 基类
│       │   ├── nativeCognitiveEngine.ts  # v6 主引擎
│       │   └── asyncEngine.ts   # 异步引擎(fraud 系列)
│       ├── thermodynamics/      # 热力学 + δ 诊断
│       │   ├── MeasurementLayer.ts      # R/T/H/F + 认知状态更新
│       │   ├── computeDelta.ts          # 8 个 δ 信号
│       │   ├── TerminationDecider.ts    # F 进终止决策
│       │   ├── ProgressiveEstimator.ts  # I/C/Λ 渐进估计
│       │   └── SemanticTool.ts          # Tier 3 LLM 语义传感器
│       ├── agent/
│       │   └── cognitiveState.ts        # 认知状态更新(@deprecated post-hoc)
│       ├── governance/          # 治理引擎
│       │   ├── cognitiveInterventions.ts # inject_evidence / rebalance_attention
│       │   └── interventions/           # 旧破坏性干预(@deprecated)
│       └── llm/
│           └── providers.ts              # LLM 抽象层
├── experiments/
│   ├── campaign/                # v6 实验战役
│   │   ├── configs/             # 14 个实验配置
│   │   ├── tasks/               # 任务定义
│   │   ├── pipeline/            # 分析流水线
│   │   ├── output/              # 实验结果
│   │   ├── pilot_v6.ts          # Pilot 脚本
│   │   └── run_all.ts           # 主入口
│   └── v2/                      # v2 历史实验
│       ├── data_crisis/         # 80 runs
│       ├── data_supplier/       # 90 runs
│       └── statsShared.ts       # 共享统计工具
├── docs/                        # 文档
│   ├── architecture/            # 架构文档
│   ├── paper/                   # 论文文档
│   └── SWARMALPHA_TECHNICAL_DOCUMENTATION.md  # 本文档
└── tests/                       # 测试(630 passed)
```

### 10.6 测试

```bash
# 运行全部测试
npx vitest run

# 当前状态: 630 passed | 3 skipped | 0 failed
```

### 10.7 可复现性保证

- **确定性 PRNG**: mulberry32(PERMUTATION_SEED=42) + mulberry32(BOOTSTRAP_SEED=42+0x5EED)
- **temperature=0.0**: LLM 输出确定性(同 seed 同输入同输出)
- **p 值校正**: 所有置换/Bootstrap 检验用 (count+1)/(n+1) 校正
- **SHA-256 manifest**: 实验数据有 audit_manifest.json 校验

---

## 附录 A: 不一致与缺失信息清单

| 编号 | 问题 | 状态 | 证据 |
|---|---|---|---|
| A-1 | Hazardous Region Selection Task 不存在 | 明确标注 | 全项目扫描无此任务 |
| A-2 | E9 Phase 3 主实验 200 runs 未执行 | Data unavailable | pilot 仅 2 runs |
| A-3 | E9 Optimized A 数据损坏(τ 全为 0) | 明确标注 | finalRanking 空数组 |
| A-4 | llmModel 配置与实际可能不一致 | 需确认 | 配置写 deepseek-v4-flash,providers 默认 deepseek-chat |
| A-5 | F 注释 r=0.274 张冠李戴 | 已修正 | 实际 r=-0.087(utility 向量),0.274 是标量 belief |
| A-6 | 认知状态 5 维跨路径不一致 | 已标注 | post-hoc 已 @deprecated |
| A-7 | Runner 落盘绕过 Tier 1 筛查 | 已标注 | 分析用 δ ≠ 治理用 δ |
| A-8 | inertia.strength 同轮双赋值 | 已知设计 | 系统A(DeGroot) vs 系统B(δ检测) |
| A-9 | δ_no_response 短讨论难触发 | 已知限制 | usable 要求 exposed≥2 |
| A-10 | a2 信息维度表述歧义 | 需澄清 | "条"指数据点还是维度 |

---

## 附录 B: 代码位置索引

| 模块 | 文件 | 关键行号 |
|---|---|---|
| 主循环 | src/lib/discussion/index.ts | 195-353 |
| NativeCognitiveEngine | src/lib/discussion/nativeCognitiveEngine.ts | 217-893 |
| buildPrompt | src/lib/discussion/nativeCognitiveEngine.ts | 378-512 |
| parseNativeCognitiveOutput | src/lib/discussion/nativeCognitiveEngine.ts | 85-202 |
| MeasurementLayer | src/lib/thermodynamics/MeasurementLayer.ts | 1-1730+ |
| computeThermoState | src/lib/thermodynamics/MeasurementLayer.ts | 261-289 |
| isThermoAbnormal | src/lib/thermodynamics/MeasurementLayer.ts | 310-324 |
| updateCognitiveStatesNative | src/lib/thermodynamics/MeasurementLayer.ts | 1113-1279 |
| diagnoseAndSuggestSync | src/lib/thermodynamics/MeasurementLayer.ts | 1712-1730 |
| computeDeltaDiagnosis | src/lib/thermodynamics/computeDelta.ts | 610+ |
| EMPTY_DELTA_DIAGNOSIS | src/lib/thermodynamics/computeDelta.ts | 104-114 |
| TerminationDecider | src/lib/thermodynamics/TerminationDecider.ts | 1-334+ |
| evaluateSync | src/lib/thermodynamics/TerminationDecider.ts | 247-300 |
| ProgressiveEstimator | src/lib/thermodynamics/ProgressiveEstimator.ts | 1-368+ |
| SemanticTool | src/lib/thermodynamics/SemanticTool.ts | 1-113+ |
| cognitiveState.ts | src/lib/agent/cognitiveState.ts | 1-803+ |
| updateUtility (DeGroot) | src/lib/agent/cognitiveState.ts | 647-701 |
| updateInertia | src/lib/agent/cognitiveState.ts | 584-626 |
| cognitiveInterventions | src/lib/governance/cognitiveInterventions.ts | 1-601+ |
| Runner | experiments/campaign/pipeline/Runner.ts | 379-715 |
| MetricComputer | experiments/campaign/pipeline/MetricComputer.ts | 1-1375+ |
| StatisticalTest | experiments/campaign/pipeline/StatisticalTest.ts | 1-1000+ |
| statsShared | experiments/v2/statsShared.ts | 1-357+ |
| extractRanking | experiments/v2/statsShared.ts | 236-283 |
| kendallTau | experiments/v2/statsShared.ts | 291-341 |
| task_university | experiments/campaign/tasks/task_university.ts | 1-82+ |
| E9 配置 | experiments/campaign/configs/e9_cognitive_governance.ts | 1-100+ |
| run_all | experiments/campaign/run_all.ts | 1-200+ |
| pilot_v6 | experiments/campaign/pilot_v6.ts | 1-200+ |

---

*本文档基于 2026-08-04 代码自检生成,所有行号引用真实代码,可逐行核查。*
