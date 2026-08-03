# 技术附录：参数、公式、任务与实验数据（回应审阅要求）

> 目的：完整列出本论文所用参数（含 LLM 自行产生的）、其意义、计算公式、理论依据，以及实验任务定义与每次实验结果。
> 日期：2026-08-02。所有代码位置可核实。

---

## 第一部分：所有参数 + Prompt + 意义

### 1.1 模型 / 环境参数

| 参数 | 值 | 意义 | 理论依据 |
|------|-----|------|---------|
| 模型 | DeepSeek-V3（历史）/ deepseek-v4-flash（v6） | 所有 agent 的 LLM | 项目主提供商 |
| 温度 | 0.2（历史）/ 0.0（v6 E9） | 输出随机性 | 可复现性（seed） |
| LLM 超时 | 30,000 ms（`LLM_DEFAULT_TIMEOUT_MS`） | 单次调用超时 | 工程防护 |
| 最大轮数 | 3（历史）/ 5（v6 E9） | 讨论轮次上限 | 收敛控制 |
| 收敛阈值 | 0.1（`DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD`） | 信念 std 低于此视为收敛 | 启发式 |

### 1.2 信念 / 置信度参数（LLM 输出的核心）

| 参数 | 范围 | 意义 | 谁产生 |
|------|------|------|--------|
| `belief` | [-1, 1] | agent 对议题的立场强度（-1 反对 ~ +1 支持） | **LLM** |
| `confidence` | [0, 100] | agent 自报确信度 | **LLM** |
| `evidence[]` | 字符串数组 | agent 引用的证据 | **LLM** |
| `itemBeliefs[]` | {item, rank, belief, confidence} | 对每个选项的排序与偏好 | **LLM** |
| `utility`（v6） | [-1,1]^K | 对 K 个选项的偏好向量 | **LLM**（原生输出） |
| `evidenceCoverage/Quality`（v6） | [0,1] | 证据覆盖度/质量 | **LLM**（原生输出） |

### 1.3 信念更新（DeGroot 成对扰动）参数（旧路径 `influenceUtils.ts`）

| 参数 | 值 | 意义 |
|------|-----|------|
| `INFLUENCE_AGREEMENT_COEFF` | 0.8 | 意见一致时的影响力权重 |
| `INFLUENCE_DISAGREEMENT_COEFF` | 0.5 | 意见分歧时的影响力权重 |
| `INFLUENCE_REFERENCE_COEFF` | 0.7 | 显式引用时的影响力权重 |
| `INFLUENCE_PERSUASION_COEFF` | 0.6 | 高置信度说服时的影响力权重 |
| `INFLUENCE_EDGE_DECAY_FACTOR` | 0.3 | 影响边权重的衰减因子 |
| `INFLUENCE_IMPACT_*_BELIEF_COEFF` | 0.4/0.2/0.5/0.6 | 各类影响力对信念的冲击系数 |
| `INFLUENCE_IMPACT_*_CONFIDENCE_COEFF` | 3/2/4/5 | 各类影响力对置信度的冲击系数 |

**更新公式**：`b_i(t+1) = b_i(t) + Σ_j w_ij · Δ(b_j, b_i)`（成对扰动 DeGroot）。**理论依据**：DeGroot（1974）意见动态模型，经典社会心理学。

### 1.4 检测器阈值（旧路径，belief 基）

| 检测器 | 阈值 | 检测的信号 | 理论依据 |
|--------|------|-----------|---------|
| 回声室 | 0.5 | 信息冗余度 | **启发式**（无 ground truth 校准） |
| 权威偏差 | 0.25 | 引用集中度 | **启发式** |
| 极化 | 0.30 | 信念双峰分布 | **启发式**（阈值） |
| 过早共识 | 0.35 | 轮次早 + 共识高 | **启发式** |

**诚实标注**：这些阈值是人工设定的启发式值，**未经 ground truth 校准**（论文 LIMITATIONS 已声明）。

### 1.5 认知检测器阈值（v6，utility 基）

| 检测器 | 阈值 | 评分公式不同 |
|--------|------|-------------|
| 回声室（认知） | 0.75 | utility 相似度基 |
| 极化（认知） | 0.25 | utility pairwise cosine 距离 |
| 过早共识（认知） | 0.55 | (1-轮次进度)×效用共识×(1-离散度) |
| 权威偏差（认知） | 0.6 | 惯性集中信号 |

### 1.6 干预参数

| 干预 | 参数 | 值 | 意义 |
|------|------|-----|------|
| reduce_weight | `INTERVENTION_REDUCE_WEIGHT_FACTOR` | 0.5 | 目标 agent 出边权重削减比例（实际执行 `weight × (1−0.5)`，下限 0.01） |
| force_reflection | `INTERVENTION_REFLECTION_FACTOR` | 0.2 | 反思干预强度 |
| introduce_diversity | `INTERVENTION_DIVERSITY_PERTURBATION` | 0.3 | 多样性扰动幅度 |

### 1.7 Prompt（关键几类）

**Agent 输出 schema（buildPrompt 要求 LLM 返回）**：
```json
{
  "reasoning": "分析...",
  "evidence": ["证据1", "证据2"],
  "belief": -1到1,
  "confidence": 0到100,
  "nextOpinion": "...",
  "referencedAgents": ["agent_1"],
  "itemBeliefs": [{"item": "方案A", "rank": 1, "belief": 0.8, "confidence": 95}]
}
```
> 注：此 schema 为**旧路径**（DiscussionEngine）。v6 引擎（NativeCognitiveEngine）输出含 `cognitiveState` 与结构化 `evidence[]`，见下方 v6 小节。

**完整 buildPrompt 模板**（`discussion/index.ts:708-791`，每轮发给每个 agent；行号随版本可能漂移，以 `buildPrompt` 方法位置为准）：
```
You are {agent.name}, a {agent.role}.
Task: {task}
Round: {round}/{maxRounds}

【系统参考（仅背景，非强制）】系统基于讨论历史计算的群体倾向：
- 信念强度：{belief}（范围 -1 到 1）
- 置信度：{confidence}%（范围 0-100）

以上为外部计算值（DeGroot 更新），仅作背景参考，不代表你的实际判断。

【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的立场——
不要简单复述上述系统参考值，你的信念应反映你对证据的真实判断。

{memoryContext}   ← 自己的发言历史 + 引用自己的回应（窗口剪枝后）
{currentRoundOpinions}  ← 本轮其他 agent 已发言（最多 8 条）
{governanceContext}  ← 治理干预注入（若有）

Analyze the task and the previous discussion (if any). Provide your opinion with
reasoning, evidence, belief, confidence, and what you think should happen next.
Respond in JSON format: {reasoning, evidence, belief, confidence, nextOpinion,
referencedAgents, itemBeliefs}
```
**关键（2026-08-02 prompt 改写）**：注入的信念/置信度为系统外部计算值（DeGroot 更新），已从"你的当前立场"改为"仅背景参考、不代表实际判断"，并指示 LLM 独立评估、不要复述参考值——**去锚定设计**，削弱 LLM 对注入值的机械跟随。治理干预的可见性改由 `governanceContext` 注入的干预 prompt（见下）承担（旧 D1"注入信念让 LLM 跟随更新"机制已撤销）。

**v6 引擎认知状态注入 prompt**（`nativeCognitiveEngine.ts:397-408`，仅 NativeCognitiveEngine 使用）：
```
【系统参考（仅背景，非强制）】系统基于讨论历史计算的认知状态：
- 偏好选项：{topChoice}
- 偏好清晰度：{clarity}（0=无偏好，1=极清晰）
- 偏好强度：{intensity}
- 证据覆盖：{evCoverage}（0=无证据，1=证据完整）
- 证据质量：{evQuality}（0=不可靠，1=高度可靠）
- 确信度：{confOverall}（0=不确信，1=完全确信）

以上为外部计算值，仅作背景参考，不代表你的实际判断。

【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的认知状态——
不要简单复述上述系统参考值，你的认知应反映你对证据的真实判断。
```
与旧路径不同：v6 不注入 scalar belief，`currentRoundOpinions` 不含 belief/confidence 标签（Phase 4A），输出要求 `cognitiveState`（utility + evidenceCoverage + evidenceQuality）与结构化 `evidence[]`。

**v6 完整输出 schema**（`nativeCognitiveEngine.ts:431-462`，与旧路径的差异：`belief` 标量被 `cognitiveState.utility` 向量取代，`evidence` 结构化声明 supports/strength）：
```json
{
  "reasoning": "Your detailed analysis...",
  "evidence": [
    {"content": "evidence text", "supports": "Company A", "strength": 0.8}
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
    {"item": "Company A", "rank": 1, "belief": 0.8, "confidence": 95}
  ]
}
```
> `utility` 值域 [-1,1]（-1 强烈反对 ~ +1 强烈支持）；`evidenceCoverage/evidenceQuality` 值域 [0,1]；`evidence.strength` 值域 [0,1]。字段语义见 buildPrompt 内 Field explanations。

**E10 共享证据池注入**（`nativeCognitiveEngine.ts:413-417`，仅 `config.evidencePool.enabled` 时注入；见 §1.8）：
```
【他人已陈述的事实（结构化，已去重）】以下为讨论中其他 agent 已明确陈述的事实。
仅供你参考——请独立判断其可靠性，并据此核对/更新你对各选项的评估（不强制采用）。
- [维度] 陈述（⚠️冲突（与 … 数值矛盾））（来源 agent，自报置信度 N%）
```

**治理干预 prompt**（如 reduce_weight，发给非目标 agent；`src/lib/governance/interventions/reduceWeight.ts:42-47` + `interventionPrompt.ts` 的 HEADER/FOOTER）：
```
═══ GOVERNANCE INTERVENTION ═══
⚠️ CRITICAL: {target} is dominating the discussion.
DO NOT defer to {target}. Their opinion carries no more weight than yours.
MANDATORY: Form your OWN independent judgment. What would you conclude if {target} were absent?
State your independent position NOW. Do NOT simply agree with {target}.
═ END GOVERNANCE INTERVENTION ══
```
同时真实执行边权重削减：`edge.weight × (1−reductionFactor)`（下限 0.01）。

**SemanticTool prompt**（evidence_dedup，`src/lib/thermodynamics/SemanticTool.ts:76-84`）：
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
> 另两种 SemanticTool 任务：`gap_analysis`（识别未共享的关键证据）与 `intervention_generation`（生成上下文感知干预文本）。SemanticTool 结果仅用于**测量/诊断**，注入 LLM 的仅 `governanceContext`（v6 认知治理异步路径，Tier 3）。

### 1.8 EvidencePool（E10 探路，`src/lib/thermodynamics/EvidencePool.ts`）

**定位**：把"每个 agent 各自重放 prose 记忆"升级为"全局去重原子事实池"，以结构化事实块注入 v6 prompt（`nativeCognitiveEngine.ts:413-417`）。**零额外 LLM 调用**（全部确定性算法）。

| 参数 | 默认值 | 意义 | 诚实标注 |
|------|--------|------|---------|
| `similarityThreshold` | 0.75 | Jaccard char-bigram 相似度阈值，高于此判近似重复并合并 | **启发式**，需 A/B 标定（E10 未标定） |
| `maxChars` | 800 | `buildView` 注入字符预算（≈480 token） | 启发式 |
| `CONFLICT_TEXT_THRESHOLD` | 0.5 | 数值冲突的文本相似度下限（排除跨话题假阳性） | 启发式 |
| `dimensions` | 任务映射 | agentId → 维度（hidden-profile 构造已知） | 任务相关 |
| hash | FNV-1a 32bit | 去重键 = 小写化、去空白标点的 statement（**保留数值**）+ dimension + supports | 确定性 |
| 数值冲突 | 同 targetItem + textSim≥0.5 + 提取数值不同 | 双向标记 `isContradicted` / `conflictWith` | 可判定子集 |

**确定性算法**（`EvidencePool.ts`）：
1. **精确去重**：`hashKey` 保留数值 → "0.90" 与 "0.85" 走冲突而非合并（Supplier 场景实测过数值碰撞）。
2. **Jaccard 近似合并**：剔除数值的规范化文本（`canonicalize`）做 char-bigram Jaccard ≥0.75，且需**同 dimension**（防跨维度文本碰撞）。
3. **数值冲突**：同 targetItem + 文本相似 ≥0.5 + 数值不同 → 双向标记。**不 gate 在 dimension**（a1"学术+科研" 0.85 vs a5"综合粗略" 0.55 的跨维度冲突正是要标记的）。
4. **`buildView(agentId)`**：排除自身来源事实，冲突优先 → 最新优先，受 `maxChars` 预算约束；返回"【他人已陈述的事实（结构化，已去重）】"块。

**接线**：`DiscussionConfig.evidencePool` 开关 → `index.ts` 新增 `onOpinionObserved()` hook（默认 no-op）→ v6 覆写并 `addEvidence` → `buildPrompt` 注入 `poolContext`。探路结论见 §3.3。

---

## 第二部分：计算公式 + 理论依据

### 2.1 热力学测量（v6，`MeasurementLayer.ts`）

| 变量 | 公式 | 理论依据 |
|------|------|---------|
| **R** | utility 向量平均 cosine 相似度：$(avg\_cos+1)/2$ | Kuramoto 序参量（观点动力学统计物理），v6 用效用向量 |
| **T** | utility 逐轮 L2 距离的归一化均值 | 热力学"温度"类比（离散度） |
| **H** | evidence supports 分布的归一化 Shannon 熵 | Shannon 信息熵（信息论） |
| **F** | $F = U - T \cdot H$（U=效用 L2 范数归一化） | **复合失序指标（CDI）**——形式借鉴自由能 $F=U-TS$，但为工程指标、无量纲物理意义（避免 Mathwashing） |

**⚠️ 诚实标注**：R/T/H 在旧路径（belief 标量）曾塌缩为 1 维（r=0.9175 证伪正交），v6 用认知状态向量解耦（|r|=0.274，但 U-H 仍耦合 r=-0.79）。F 是工程启发式，**不是**严格热力学量。

### 2.2 认知状态（v6，`cognitiveState.ts`）

| 变量 | 公式 | 理论依据 |
|------|------|---------|
| Inertia I | $(0.7 \cdot \text{role} + 0.2 \cdot \text{evidence} + 0.1 \cdot \text{expression} - 0.1 \cdot \text{refute}) \cdot 0.98$，clamp[0.05,0.95]（`src/lib/agent/cognitiveState.ts:574-616`，`INERTIA_DECAY=0.98`，`REFUTATION_INERTIA_PENALTY=0.1`） | **启发式**（设计公式，反映认知固执） |
| Susceptibility Λ | $\max((1-I)(1-C),\, 0.05)$（`MIN_SUSCEPTIBILITY=0.05` 下限，`cognitiveState.ts:212`） | **设计公式**（固执越低、信心越低 → 越易被说服）。⚠️ **v6 起弃用公式计算**：改用行为事件 `BehaviorEvents.timesExposed / timesRespondedAfterExposure` 经 `ProgressiveEstimator` 估计（`computeSusceptibility` 已标 `@deprecated`，仅向后兼容） |

### 2.3 δ 一致性诊断（v6，`computeDelta.ts`，8 个信号）

| 信号 | 检测 | 基准阈值 base | 安全边际 | 自适应阈值公式 |
|------|------|-------------|---------|---------------|
| δ_polarization | utility 分化 | 0.15 | 0.05 | `effective = base + (1−minConfidence)×safetyMargin` |
| δ_1d_mask | 标量共识掩盖向量分歧 | 0.40 | 0.05 | 同上 |
| δ_evidence_silence | 证据被忽视 | 0.50 | 0.05 | 同上 |
| δ_confidence_gap | 自报信心 vs 行为矛盾 | 0.60 | 0.20 | 同上 |
| δ_stance_flip | 立场翻转 | 0（二进制） | 0.10 | **不适用**：base=0 时不走自适应，改由可用性门控（minConfidence 不足不触发） |
| δ_no_response | 干预后无响应 | 0（二进制） | 0.40 | **不适用**：同上 |
| δ_concentration | 惯性集中 | 2.0 | 0.40 | `effective = base + (1−minConfidence)×safetyMargin` |
| δ_consistency | 立场 vs 惯性矛盾 | 2.0 | 0.35 | 同上（另有严格阈值 `base×1.5` 的极端异常分支） |

> 自适应逻辑（`src/lib/thermodynamics/computeDelta.ts:111-119`）：高置信度 → 阈值接近 base → 灵敏；低置信度 → 阈值向 base+safetyMargin 移动 → 保守。**诚实标注**：8 个 base 阈值与安全边际均为人工设定的启发式，未经 ground truth 校准。

**理论依据**：命题 4c——矛盾检测是"可验证的证据"（自报 vs 行为的可复核矛盾），无需 ground truth。这是本项目的新理论贡献。

### 2.4 统计量

| 统计量 | 公式 | 理论依据 |
|--------|------|---------|
| Kendall τ-b | 排序一致对数/总对（含 tie 修正） | 非参数排序相关（Kendall 1938） |
| p 值 | 置换检验（10^4 次，seed 42，count+1/n+1 校正） | Fisher 精确检验思想 |
| Cohen's d | 均值差/合并标准差（n<2 guard） | 效应量（Cohen 1988） |
| 功效 | 非中心 t 分布近似 | 统计功效分析 |

---

## 第三部分：实验任务 + 每次结果

### 3.1 Crisis（危险区域）任务

**设定**：城市突发公共卫生事件（127 例，3 死），需在 2 小时内对 5 个响应方案排序。
**Ground truth**：方案C(精准疏散) > B(分阶段) > A(全城封锁) > E(社区自治) > D(军事管制)。
**5 个维度**：响应速度、覆盖范围、效果、风险、可持续性。**锚定陷阱**：briefing 强调"速度最重要"，但速度权重仅 0.10。

**Hidden-profile 结构**（5 agent 各掌握 1 个维度，需互相分享才能算出正确排序）：

| Agent | 角色 | 掌握的关键数据 |
|-------|------|---------------|
| a1 | 响应速度评估师 | 方案A 最快（2h），但速度权重仅 0.10 |
| a2 | 覆盖范围分析师 | 各方案覆盖人数/范围 |
| a3 | 效果评估师 | 方案C 效果最好（88%，风险 1/5） |
| a4 | 风险评估师 | 方案A 风险最高（5/5） |
| a5 | 可持续性顾问 | 方案A 可持续 21 天 |

**关键**：只有分享全部 5 个维度，才能算出正确排序（C > B > A > E > D）。单看任一维度都会排错（如只看速度排 A 第一，但 A 实际第 3）。

**每次结果（τ）**：

| 条件 | n | 每次 τ | 均值 |
|------|---|--------|------|
| **none**（无治理） | 24 | 0.80, 0.20, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.20, 0.40, 0.40, 0.40, 0.40, 1.00, 0.40, 0.00, 0.40, 0.40, 0.40, 0.40, 0.40 | **0.408** |
| **full**（治理） | 24 | 0.60, 1.00, 0.40, 0.40, 0.60, 0.40, 0.60, 0.40, 1.00, 0.40, 1.00, 0.80, 0.20, 0.60, 0.80, 0.40, 0.80, 0.80, 1.00, 0.60, 0.40, 0.40, 1.00, 0.20 | **0.617** |
| **shuffle**（结构重排） | 24 | 1.00, 1.00, 0.60, 0.40, 0.80, 0.40, 0.80, 0.60, 0.20, 0.80, 0.40, 0.60, 0.60, 0.60, 1.00, 0.80, 0.80, 0.60, 0.40, 1.00, 0.80, 1.00, 1.00, 1.00 | **0.717** |

> **n=24 的说明（审计口径）**：`data_crisis/crisis_full_*.json` 目录共 32 个文件（24 个 `ablation="full"` + 8 个 `ablation="full_fixed"` 对照，mean=0.675）。主效应分析（d=0.92/p=0.0038）按 `ablation` 字段**精确过滤排除 full_fixed**，n=24 vs 24（见 `statsShared.loadExperiments` B2 修复）；含 32 个文件时 full 均值为 0.631。**N=169 相关分析**（共识-质量 r）含全部 32 个 full 运行（none 24 + full 32 + shuffle 24 + Supplier 89）。早期文档与 SOT §2.1 对 n=24/n=32 已澄清，论文采用 n=24 主口径。

**关键结果**：治理使 τ 从 0.408→0.617（d=0.92, p=0.0038，功效 88%，n=24/组）；结构重排更强 0.717（d=1.44）。

### 3.2 Supplier（供应商选择）任务

**设定**：高端制造企业从 5 家供应商选核心零部件战略供应商（成本占 35%）。
**Ground truth**：供应商C(精研) > B(稳达) > E(锐新) > A(宏远) > D(利通)。
**5 个维度**：成本、供应链、质量、技术、财务。**锚定陷阱**：briefing 强调"成本最重要"，但成本权重仅 0.20。

**Hidden-profile 结构**（5 agent 各掌握 1 个维度）：

| Agent | 角色 | 掌握的关键数据 |
|-------|------|---------------|
| a1 | 成本分析师 | 供应商A 成本最低（1.00），但成本权重仅 0.20 |
| a2 | 供应链经理 | 交付周期/稳定性 |
| a3 | 质量工程师 | 质量认证/良率 |
| a4 | 技术总监 | 技术能力/研发 |
| a5 | 财务顾问 | 财务健康/账期 |

**关键**：只有分享全部 5 个维度，才能算出正确排序（C > B > E > A > D）。单看成本会排 A 第一，但 A 实际第 4。

**每次结果（τ）**：

| 条件 | n | 每次 τ | 均值 |
|------|---|--------|------|
| **none** | 30 | 1.00, 0.80, 0.40, 0.60, 0.80, 0.40, 0.80, 0.80, 0.80, 0.40, 0.80, 0.60, 0.80, 0.60, 0.80, 0.60, 0.80, 0.40, 0.60, 0.60, 1.00, 0.60, 0.80, 0.80, 0.80, 0.80, 0.20, 0.60, 0.60, 0.80 | **0.680** |
| **full** | 30 | 1.00, 0.60, 0.80, 0.80, 0.80, 0.80, 0.80, 0.60, 0.80, 0.80, 0.80, 0.80, 1.00, 1.00, 1.00, 0.80, 0.40, 0.60, 0.80, 0.40, 0.80, 0.60, 1.00, 1.00, 1.00, 0.80, 0.80, 0.60, 0.40, 0.60 | **0.767** |
| **shuffle** | 29 | 0.60, 0.60, 0.80, 0.40, 0.40, 0.80, 0.40, 0.40, 0.40, 0.80, 0.60, 0.60, 0.80, 0.80, 0.80, 1.00, 0.80, 0.60, 0.80, 0.60, 1.00, 1.00, 0.80, 1.00, 1.00, 0.60, 0.60, 0.40, 0.80 | **0.697** |

**关键结果**：治理 0.680→0.767（d=0.47, p=0.086，不显著，功效 43%）；shuffle 0.697（天花板效应，基线已高）。

### 3.3 University（大学排名，v6 E9/E10 pilot 场景）

**设定**：对 8 所大学进行排名。**Hidden-profile 构造**：5 个 agent 各掌握一个维度——a1 学术+科研、a2 就业、a3 地理、a4 国际化+师生比、a5 综合粗略（a5 信息本就粗略重叠，标记最弱，已知局限）。**Ground truth**：需分享全部维度才能算出正确排序。**配置**：`deepseek-v4-flash`、temperature 0.0、maxRounds 5、5 agents、10 seeds × 5 runs（E9 主矩阵 200 runs，**尚未全量执行**）。

**v6 探路结果**（⚠️ **探索性 n=1**，非统计证据；semantic 为 n=3）：

| 治理 | n | τ 均值 | IDR_end | token/run | 说明 |
|------|---|--------|---------|-----------|------|
| **none**（无治理） | 1 | 0.571 | 70.0% | 96,540 | baseline（university pilot） |
| **delta**（δ 自适应治理） | 1 | 0.643 | 80.0% | 187,958 | δ 治理方向正确（IDR +10pp） |
| **pool**（E10 证据池） | 1 | 0.571 | 75.0% | 193,376 | τ 无改善、IDR +5pp（低于 delta）、成本 2x |
| **semantic**（δ + SemanticTool） | 3 | 0.571 / 0.571 / 0.000 | 80.0% | — | 第三次 2 轮即收敛（τ=0） |

> **τ = Kendall τ-b**（对真实排名，见 §2.4）；**IDR_end** = 最终轮信息扩散率（非属主碎片吸收率均值，过程证据，`e9_analysis/idr_diffusion_report.md`）。IDR 匹配为词+值共现启发式，**不 claim 中介**。

**E10 探路结论**（`docs/roadmap/future.md §2.1`）：pool 作为独立全披露机制 τ=基线(0.571)、IDR +5pp 低于 δ 选择性披露(+10pp)、成本 2x、逐碎片有回退（地理 100→75%）。**决策：不投完整 E10**；有价值方向是把池降级为 δ 治理的执行载体（per-agent 视图 + 治理控制可见性 = E10b 选择性披露，暂不投入）。

---

## 附录：诚实标注（哪些有理论、哪些是启发式）

| 类别 | 项 | 状态 |
|------|-----|------|
| **有理论** | R（Kuramoto 语义对齐）、H（Shannon 熵）、F（复合失序指标 CDI）、DeGroot 更新、Kendall τ、置换检验、非中心 t 功效 | ✅ |
| **启发式（未校准）** | 检测器阈值（0.5/0.25/0.30/0.35）、认知检测器阈值（0.75/0.25/0.55/0.6）、δ base 阈值与安全边际（§2.3）、Inertia 权重、干预因子、EvidencePool 阈值（0.75/0.5/800，§1.8） | ⚠️ 人工设定，无 ground truth 校准 |
| **已证伪/边界** | 旧 F=(1−R)+T·H 两分量正交（r=0.9175 证伪）；旧 R/T/H 塌缩 1 维 | ⚠️ 旧路径，v6 已解耦（r=0.274） |
| **探路（n=1）** | E9/E10 university pilot（§3.3）：δ 方向正确但未统计检验；pool 不优于 δ | ⚠️ 非统计证据，E9 全量 pending |
| **新理论贡献** | δ 矛盾检测（命题 4c：可验证证据）、共识-质量解耦（命题 4b） | ✅ 本项目形式化 |
