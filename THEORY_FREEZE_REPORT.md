# SwarmAlpha 理论冻结报告（Theory Freeze Report）

**作者：** 首席理论架构师（审稿人视角）
**状态：** 尚未通过 —— 存在阻塞性问题
**日期：** 2026-07-24

---

## 第一部分：为什么 belief 必须被废弃

标量 `belief ∈ [-1, 1]` 不仅仅是"模糊"——它是**语义不可辨识的**。以下从六个角度进行分析。

### 1.1 变量语义

当前代码中，`belief` 同时编码了以下含义：

| 角色 | 代码位置 | 证据 |
|------|----------|------|
| 对选项 A/B 的偏好 | `AgentOpinion.belief` | `belief > 0 → 偏好 A` |
| 信心/确定性 | `AgentState.confidence` | 与 belief 的绝对值正相关 |
| 社会影响结果 | asyncEngine 中的 `updateBeliefs()` | 通过类 DeGroot 平均修改 |
| 决策输出 | `finalDecision.belief` | 用作最终答案 |
| 公开立场表达 | `perUtteranceSnapshots[].belief` | 即 agent 公开说了什么 |

一个标量 **无法** 承载 5 种不同的语义负荷。任何审稿人都会立刻追问："当 belief 从 0.7 变成 0.5，是 agent 的偏好减弱了，还是信心下降了，还是策略性地表达了更温和的立场？"模型无法回答。

### 1.2 可辨识性

仅给定 N 个 agent 的 `{belief(t), belief(t+1)}`，**不可能** 判断变化是由以下哪种原因引起的：
- 新证据进入系统
- 来自其他 agent 的社会影响
- 对自身立场的信心下降
- 策略性表达（公开立场 ≠ 私下偏好）

这是**根本性的可辨识性失败**。任何关于治理干预的因果声明在这个模型下都无法成立。

### 1.3 可观测性

当前系统从 LLM 输出中观测 `belief`。但 LLM 本身在其回复中混淆了偏好、信心和表达。`itemBeliefs` 字段正是因为这个标量不够用才被加入的——但它被当作可选的补充，而非主要的状态表示。这是本末倒置：`itemBeliefs` 才应该是观测值，标量应该从中派生（如果还需要的话）。

### 1.4 数学建模

DeGroot 模型（`updateUtility` 中使用）需要一个**偏好向量**（对各选项的效用），而非标量。当前代码通过映射 `belief → scores[options[0]] = belief, scores[options[1]] = -belief` 来桥接这一差距——这个变换：
- 将 K 个选项压缩到一维投影
- 假设偏好完全反对称（偏好 A 就必须同等程度地反对 B）
- 丢失了选项 C、D、E 的所有信息

对于 K > 2 的选项，这在数学上是退化的。

### 1.5 控制理论

治理是一个**反馈控制器**。控制器需要：
1. 可观测的状态 → `belief` 只提供 1 个维度
2. 可控的状态 → 治理只能直接扰动 `belief`，这混淆了所有语义
3. 分离原理 → 当状态不可辨识时，估计与控制无法分离

当前治理系统在一个不可观测的系统上运行开环控制。某些干预表现出 0% 有效率（continue_discussion、introduce_diversity）并不奇怪——控制器在错误的变量上施加了力。

### 1.6 认知建模

在认知科学中，信念更新被建模为：
- **贝叶斯模型**：先验（效用）× 似然（证据）→ 后验
- **DeGroot 模型**：u_i(t+1) = (1-λ_i)u_i(t) + λ_i Σ w_ij u_j(t)
- **漂移扩散模型**：证据累积 + 决策阈值

三者都需要**分离**表示偏好、证据和可受影响程度。标量 belief 模型将三者混为一谈。

### 结论

**belief 不能作为理论核心。** 它是一个高维状态空间到一维流形的有损投影。任何关于"信念动力学"的声明，实际上都是关于至少 5 种不同认知过程之不可辨识混合物的声明。这在同行评审中无法通过。

---

## 第二部分：状态空间是否最小？

当前方案：`{Utility, Evidence, Inertia}`（隐状态）+ `{Confidence, Susceptibility}`（派生变量）。

### 2.1 冗余分析

**Confidence** 派生自 `Evidence.quality × Evidence.coverage`。不携带独立信息。✓ 归类正确。

**Susceptibility** 派生自 `λ = max((1-ι)(1-c), MIN)`。不携带独立信息。✓ 归类正确。

**Evidence 内部的潜在冗余：** `coverage`、`quality`、`diversity`、`recentGain` 是四个标量。四个都必要吗？

- `coverage`：|items| / |全局信息池| —— 必要，刻画 agent 知道多少信息
- `quality`：avg(sourceReliability) —— 当前所有来源硬编码为 0.5。**在来源可靠性评估实现之前无意义。**
- `diversity`：unique supports / total categories —— 与 `coverage` 冗余（当 categories 硬编码为 5 时）。**在动态计算之前移除。**
- `recentGain`：new items / total items —— 刻画学习速率。**对收敛检测必要。**

**结论：** Evidence 在 Phase 2 可缩减为 `{coverage, recentGain}`。`quality` 和 `diversity` 依赖尚未实现的基础设施（来源可靠性估计、动态类别检测），应推迟到 Phase 4。

### 2.2 遗漏变量分析

| 候选变量 | 是否需要 | 原因 |
|----------|---------|------|
| Trust（信任） | 否（扩展） | 动态影响权重可从交互图中派生（谁引用了谁）。引入显式信任需要"对信念的信念"——二阶状态，会破坏可辨识性。 |
| Memory（记忆） | 否（已存在） | `Evidence.items[]` 就是记忆。对话历史在 `DiscussionMemoryEntry[]` 中。 |
| Goal（目标） | 否（隐式） | Agent 在任务之外没有个人目标。任务定义了选项空间。 |
| Personality（人格） | 否（由角色覆盖） | 基于角色的惯性常量已捕捉人格差异。完整的 Big Five 模型在此领域会过度参数化。 |
| Emotion（情感） | 否（超出范围） | LLM agent 的情感建模是推测性的、未经验证的。将是一个独立的研究贡献。 |

### 2.3 最终最小状态空间

```
隐状态（Latent State）：S = {U, E, I}
  U（Utility）：    对 K 个选项的偏好向量         ∈ [-1, 1]^K
  E（Evidence）：   信息库存                       ∈ {coverage ∈ [0,1], recentGain ∈ [0,1]}
  I（Inertia）：    改变阻力                       ∈ [0, 1]

派生变量（Derived）：D = {C, Λ}
  C（Confidence）：     对自身 utility 的确定性     ∈ [0, 1]  = f(E.coverage)
  Λ（Susceptibility）：对社会影响的开放程度         ∈ [0, 1]  = g(I, C)

输出（Output）：O = {Decision, Expression}
  Decision：     选中的选项                         ∈ OptionId
  Expression：   关于 utility 的公开表达            ∈ text（Phase 4）
```

**这是最小的。** 三个隐变量，两个派生变量，两个输出。每个变量都有独特且不重叠的语义角色。

---

## 第三部分：严格变量定义

### 3.1 Utility（U）

| 属性 | 值 |
|------|-----|
| 定义 | Agent 对 K 个选项的偏好排序。每个选项 k 有一个效用值 u_k ∈ [-1, 1]，表示 agent 对该选项含意性的评估。 |
| 单位 | 无量纲偏好强度 |
| 取值范围 | [-1, 1]^K（向量），无求和约束 |
| 可观测 | 否（隐变量）。从 LLM 输出的 `itemBeliefs[].belief` 推断。 |
| 类别 | 隐状态（Latent State） |
| 更新来源 | DeGroot 加权平均：U_i(t+1) = (1-λ_i)U_i(t) + λ_i Σ_j w_ij U_j(t) |
| 治理可修改 | 是 —— 通过 Inertia 或 Evidence 间接修改 |
| LLM 输出 | 否 —— 系统从 itemBeliefs 计算 |

### 3.2 Evidence（E）

| 属性 | 值 |
|------|-----|
| 定义 | Agent 的信息库存——agent 已获取的证据条目及其聚合属性。 |
| 单位 | coverage：比例；recentGain：比例 |
| 取值范围 | coverage ∈ [0, 1]，recentGain ∈ [0, 1] |
| 可观测 | 是（间接）。LLM 输出中的 `evidence[]` 字符串是证据条目的原始观测。 |
| 类别 | 隐状态（Latent State） |
| 更新来源 | 证据累积：来自 LLM 输出的新条目 + 从其他 agent 听到的条目 |
| 治理可修改 | 是 —— `introduce_diversity` 注入新证据条目 |
| LLM 输出 | 是 —— agent 回复中的 `evidence[]` 字符串 |

### 3.3 Inertia（I）

| 属性 | 值 |
|------|-----|
| 定义 | Agent 对改变其 utility 的阻力。惯性越高，agent 越倾向于在面对社会影响时保持当前偏好结构。 |
| 单位 | 无量纲阻力 |
| 取值范围 | [0, 1]；0 = 完全可塑，1 = 完全僵化 |
| 可观测 | 否（隐变量）。从角色 + 行为历史推断。 |
| 类别 | 隐状态（Latent State） |
| 更新来源 | I = 0.7×roleBase + 0.1×expressionBonus − refutationPenalty；每轮衰减 ×0.98 |
| 治理可修改 | 是 —— `force_reflection` 临时降低惯性 |
| LLM 输出 | 否 |

### 3.4 Confidence（C）

| 属性 | 值 |
|------|-----|
| 定义 | Agent 对其当前 utility 的确定性。从 agent 拥有的证据数量和证据质量派生。 |
| 单位 | 无量纲确定性 |
| 取值范围 | [0, 1]；0 = 完全不确定，1 = 完全确定 |
| 可观测 | 部分。LLM 输出 `confidence`（0-100），但这是 agent 的自我报告信心，可能与系统计算的信心不同。 |
| 类别 | 派生变量（Derived，从 E） |
| 更新来源 | C = f(E.coverage) —— 当前 C = E.coverage（Phase 2 线性近似） |
| 治理可修改 | 否 —— 仅在 Evidence 变化时变化 |
| LLM 输出 | 否 —— 系统计算 |

### 3.5 Susceptibility（Λ）

| 属性 | 值 |
|------|-----|
| 定义 | Agent 对社会影响的开放程度。agent 在更新自身 utility 时给予他人 utility 的权重。 |
| 单位 | 无量纲开放度 |
| 取值范围 | [MIN_SUSCEPTIBILITY, 1]；通常 [0.05, 1] |
| 可观测 | 否（派生变量）。 |
| 类别 | 派生变量（Derived，从 I, C） |
| 更新来源 | Λ = max((1 − I) × (1 − C), MIN_SUSCEPTIBILITY) |
| 治理可修改 | 是 —— 通过 I（force_reflection）或 E（introduce_diversity）间接修改 |
| LLM 输出 | 否 |

### 3.6 Decision

| 属性 | 值 |
|------|-----|
| 定义 | Agent 选中的选项。效用值最高的选项 k。 |
| 单位 | 分类变量（OptionId） |
| 取值范围 | {option_1, option_2, ..., option_K} |
| 可观测 | 是 —— 在最终输出中显式给出 |
| 类别 | 输出（Output） |
| 更新来源 | Decision = argmax_k U.scores[k] |
| 治理可修改 | **否 —— 禁止。** 治理只能修改隐状态，不能直接覆盖决策。 |
| LLM 输出 | 否 —— 系统计算 |

### 3.7 Expression

| 属性 | 值 |
|------|-----|
| 定义 | Agent 关于其 utility 的公开表达。可能因策略性考虑而偏离真实 utility（Phase 4）。 |
| 单位 | 文本 |
| 取值范围 | 自然语言字符串 |
| 可观测 | 是 —— 原始 LLM 回复 |
| 类别 | 输出（Output） |
| 更新来源 | Phase 2：Expression = LLM 回复文本（无策略性偏离）。Phase 4：Expression = g(U, strategy) |
| 治理可修改 | 是 —— 治理 prompt 在 expression 生成前注入 LLM 上下文 |
| LLM 输出 | 是 —— 这就是 LLM 输出 |

---

## 第四部分：统一状态流

```
第 t 轮开始
│
├─[1] 观测（OBSERVATION）────────────────────────────────────
│   输入：Agent 当前记忆 + prompt + 治理 prompt
│   输出：LLM 回复 = {reasoning, evidence[], itemBeliefs[], referencedAgents[]}
│   规则：LLM 基于上下文生成回复
│   依据：这是 agent 内部状态唯一可被观测的通道。LLM 原始输出即为观测值。
│
├─[2] 证据提取（EVIDENCE EXTRACTION）────────────────────────
│   输入：LLM 输出中的 evidence[] 字符串 + 其他 agent 的 evidence[]
│   输出：E(t) = {coverage, recentGain}
│   规则：coverage = |去重条目| / 估计信息池大小
│         recentGain = 本轮新增条目 / 总条目数
│   依据：证据必须在信心和惯性之前提取，因为两者都依赖 evidence.coverage。
│
├─[3] 信心派生（CONFIDENCE DERIVATION）──────────────────────
│   输入：E(t).coverage
│   输出：C(t) = f(E.coverage)
│   规则：C(t) = E.coverage（Phase 2 线性近似）
│   依据：信心完全从证据派生。在此计算确保它反映最新的证据状态。
│
├─[4] 惯性更新（INERTIA UPDATE）─────────────────────────────
│   输入：I(t-1), agentRole, spokeThisRound, wasRefuted
│   输出：I(t)
│   规则：I(t) = (0.7×roleBase + 0.1×expressionBonus − refutationPenalty) × 0.98
│   依据：惯性在证据之后更新，但不再依赖 evidence.coverage（修复 Risk 1）。
│         在 utility 之前更新，因为 utility 通过 Λ 依赖惯性。
│
├─[5] 可受影响度派生（SUSCEPTIBILITY DERIVATION）─────────────
│   输入：I(t), C(t)
│   输出：Λ(t) = max((1−I(t)) × (1−C(t)), 0.05)
│   依据：Λ 是隐状态与社会影响之间的桥梁。必须在 utility 更新前计算。
│
├─[6] 效用更新（UTILITY UPDATE）─────────────────────────────
│   输入：U(t-1), {U_j(t-1) for all j}, Λ(t), 影响权重 W
│   输出：U(t)
│   规则：U_i(t) = (1−Λ_i) × U_i(t-1) + Λ_i × Σ_j w_ij × U_j(t-1)
│   依据：Utility 是最后的状态更新。它通过 Λ 依赖所有前置步骤。这是 DeGroot 共识步骤。
│
├─[7] 治理干预（GOVERNANCE INTERVENTION）─────────────────────
│   输入：所有 agent 的 S(t) = {U(t), E(t), I(t), C(t), Λ(t)}
│   输出：修改后的状态 S'(t) 和/或注入的 prompt
│   规则：检测器 → 问题检测 → 干预选择 → 状态修改
│   依据：治理在完整状态空间上运作，而非仅在标量 belief 上。
│         可以针对检测到的问题选择性地修改特定状态变量。
│
├─[8] 决策（DECISION）───────────────────────────────────────
│   输入：U(t)
│   输出：Decision = argmax_k U.scores[k]
│   规则：选择效用最高的选项
│   依据：决策是最终输出。从 utility 计算，而非直接从 LLM。治理不能覆盖它。
│
└─[9] 表达（EXPRESSION）─────────────────────────────────────
    输入：U(t), 治理 prompt, 任务上下文
    输出：公开表达（文本）
    规则：Phase 2：Expression = LLM 回复（无策略性偏离）
          Phase 4：Expression = g(U, strategy) 可能发生偏离
    依据：Expression 是其他 agent 观测到的内容。Phase 2 中等同于 LLM 输出。
         Phase 4 中可能与真实 utility 产生偏离。
```

**为什么是这个顺序：** 依赖链严格无环：Observation → Evidence → Confidence → Inertia → Susceptibility → Utility → Governance → Decision → Expression。每一步仅依赖前序步骤。不存在循环依赖。

这与当前代码顺序（Evidence → Confidence → Inertia → Utility）的差异在于：① 将 Susceptibility 派生作为显式步骤置于 Utility 之前；② 将 Governance 与 Utility 更新分离。

---

## 第五部分：治理映射（Governance Mapping）

### 5.1 reduce_weight（降低权重）

| 目标状态 | 机制 | 预期行为 |
|----------|------|----------|
| 影响权重 W | 削减来自主导 agent j 的边的 w_ij | 其他 agent 对主导 agent 的效用给予更低权重 |
| Expression（prompt） | 注入"不要盲从 {agent}" prompt | 其他 agent 在下一次表达中抵抗权威影响 |

**依据：** 权威偏差是**影响力集中**的问题，而非主导 agent 内部状态的问题。干预应降低主导 agent 对他人的影响力，而非改变主导 agent 自身的 utility。

### 5.2 force_reflection（强制反思）

| 目标状态 | 机制 | 预期行为 |
|----------|------|----------|
| Inertia I | 临时将 I 降低 `reflectionFactor` 倍 | Agent 更愿意重新考虑自身立场 |
| Susceptibility Λ | 因为 I 降低所以 Λ 升高 | Agent 对对立观点给予更高权重 |
| Expression（prompt） | 注入"陈述反对立场的最强论据" | Agent 表达对立视角 |

**依据：** 极化是**过度惯性**的问题——agent 被锁定在极端立场。干预应降低惯性，使 agent 更易接受对立观点。**不应**直接修改 utility（那将是系统覆盖 agent 的自主推理）。

### 5.3 introduce_diversity（引入多样性）

| 目标状态 | 机制 | 预期行为 |
|----------|------|----------|
| Evidence E | 向 agent 证据库存注入新的 EvidenceItem | Agent 获得之前缺失的信息 |
| Confidence C | C 可能下降（新证据 → 意识到不确定性） | Agent 变得不那么确定，更开放 |
| Expression（prompt） | 注入"陈述一个你的结论可能错误的情境" | Agent 考虑反事实 |

**依据：** 回音室是**证据同质性**的问题——所有 agent 共享相同信息。干预应注入新证据条目，而非直接扰动 utility。当前 `introduce_diversity` 实现直接扰动 belief——这是错误的。

### 5.4 continue_discussion（继续讨论）

| 目标状态 | 机制 | 预期行为 |
|----------|------|----------|
| 讨论轮次 | 延长 maxRounds | 更多时间让证据浮现 |
| Expression（prompt） | 注入未被讨论的信息条目 | Agent 处理之前被忽略的证据 |

**依据：** 过早共识是**探索不足**的问题。干预延长讨论时间，让更多证据浮现。不直接修改任何 agent 的状态。

### 5.5 总体原则

**治理绝不直接修改 Utility 或 Decision。** 它可以修改：
- **Inertia**（force_reflection）→ 改变 susceptibility → agent 重新考虑
- **Evidence**（introduce_diversity）→ 改变信息 → agent 可能更新
- **影响权重**（reduce_weight）→ 改变社会动力学
- **讨论结构**（continue_discussion）→ 改变时间动力学

Agent 的 utility 更新始终是自主的（DeGroot）。治理只改变 agent 更新的**条件**。

---

## 第六部分：检测器映射（Detector Mapping）

### 6.1 回音室检测器（Echo Chamber）

| 当前 | 建议 |
|------|------|
| 检测：belief 相似度（标量）+ 内容相似度（文本） | 检测：**Evidence 同质性**（跨 agent） |
| 指标：来自 belief std + Jaccard 的 infoRedundancyScore | 指标：**Evidence Jaccard 指数** = \|E_i ∩ E_j\| / \|E_i ∪ E_j\|，跨所有 agent 对 |
| 问题：两个 agent 可以有不同 belief 但共享相同证据（有回音室但无 belief 收敛） | 修正：回音室是关于信息的，而非偏好。两个 agent 可能对证据达成一致但对解读有分歧。 |

**检测规则：** 若平均成对 Evidence Jaccard > 阈值，则检测到回音室。

### 6.2 权威偏差检测器（Authority Bias）

| 当前 | 建议 |
|------|------|
| 检测：通过引用网络的影响力集中度 | 检测：交互图中的**影响权重集中度** |
| 指标：max(对 agent 的引用) / 总引用数 | 指标：影响权重的**Gini 系数**（每个 agent 的出边） |
| 问题：影响力与引用不同。一个 agent 可能被大量引用但影响力低（人们不同意他）。 | 修正：使用 DeGroot 模型中的实际影响权重，而非引用计数。 |

**检测规则：** 若 Gini(影响权重) > 阈值，则检测到权威偏差。

### 6.3 极化检测器（Polarization）

| 当前 | 建议 |
|------|------|
| 检测：belief 离散度 + 双峰性 | 检测：跨 agent 的 **Utility 双峰性** |
| 指标：belief std + 双峰系数 | 指标：跨 agent 的 U.scores[topChoice] 上的**Utility 双峰系数** |
| 问题：Belief std 将偏好多样性混淆为极化。 | 修正：极化特指双峰 utility 分布（两大阵营），而非仅仅是高方差。 |

**检测规则：** 若 utility 向量的双峰系数 > 0.555 且 utility 方差 > 阈值，则检测到极化。

### 6.4 过早共识检测器（Premature Consensus）

| 当前 | 建议 |
|------|------|
| 检测：早期 belief 收敛 | 检测：**早期 Utility 收敛 + 低 Evidence 覆盖率** |
| 指标：belief std + 轮次进度 | 指标：Utility std + 跨 agent 的 E.coverage |
| 问题：共识可能是真实的（所有证据已共享，所有 agent 都同意）。 | 修正：过早共识 = 低 utility 方差 AND 低 evidence 覆盖率。真实共识 = 低 utility 方差 AND 高 evidence 覆盖率。 |

**检测规则：** 若 Utility std < 阈值 AND Evidence.coverage < 阈值 AND round < maxRounds/2，则检测到过早共识。

### 6.5 信息隐藏检测器（MAST FM-2.4）

**已经正确。** 检测其他 agent 有 evidence 时某些 agent 的 evidence 为空。无需修改。运作在 Evidence 上，而非 belief。

### 6.6 忽略他人输入检测器（MAST FM-2.5）

**已经正确。** 检测非互惠引用。无需修改。运作在引用网络上，而非 belief。

### 6.7 推理-行动不匹配检测器（MAST FM-2.6）

**已经正确。** 检测 itemBeliefs 中 rank 与 belief 的不一致。在新模型下，这变为：**Utility-Expression 不匹配**——检测 agent 的公开排序与内部 utility 不一致。Phase 4。

---

## 第七部分：数学框架

### 7.1 符号约定

设有 N 个 agent，索引为 i ∈ {1, ..., N}；K 个选项，索引为 k ∈ {1, ..., K}。

### 7.2 状态向量

Agent i 在第 t 轮：

```
S_i(t) = [U_i(t), E_i(t), I_i(t)]^T
```

其中：
- U_i(t) ∈ [-1, 1]^K：效用向量
- E_i(t) ∈ [0, 1]^2：证据状态（coverage, recentGain）
- I_i(t) ∈ [0, 1]：惯性

### 7.3 派生变量

```
C_i(t) = φ_E(E_i(t))                    Confidence（信心）
Λ_i(t) = φ_Λ(I_i(t), C_i(t))           Susceptibility（可受影响度）
```

### 7.4 状态转移

**证据更新：**
```
E_i(t) = ψ_E(E_i(t-1), O_i(t), {O_j(t)}_{j≠i})
```
其中 O_i(t) 是 agent i 的观测值（LLM 输出）。

**惯性更新：**
```
I_i(t) = (α_R · I_i^role + α_X · I_i^expr(t) − β · R_i(t)) · γ
```
其中：
- I_i^role = 基于角色的惯性常量（来自 ROLE_INERTIA_RULES）
- I_i^expr(t) = 基于表达的惯性加成（从过往发言累积）
- R_i(t) = 本轮被反驳次数
- γ = 0.98（衰减因子）
- α_R = 0.7, α_X = 0.1, β = 0.1

**效用更新（DeGroot）：**
```
U_i(t) = (1 − Λ_i(t)) · U_i(t-1) + Λ_i(t) · Σ_{j≠i} w_ij(t) · U_j(t-1)
```
其中：
- Λ_i(t) = max((1 − I_i(t)) · (1 − C_i(t)), 0.05)
- w_ij(t) = agent j 对 agent i 的影响权重（Σ_j w_ij = 1）

### 7.5 观测函数

```
O_i(t) = LLM(prompt_i(t))
```
其中 prompt_i(t) 包含：任务上下文、记忆、其他 agent 的表达、治理 prompt。

从 O_i(t) 中，系统提取：
- itemBeliefs → 原始效用观测
- evidence[] → 原始证据观测
- referencedAgents → 交互图更新

### 7.6 治理算子

```
G: {S_i(t)}_{i=1}^N → {S_i'(t)}_{i=1}^N × P(t)
```
其中 P(t) 是待注入的 prompt 集合。

G 分解为：
```
G = D ∘ I
```
- D：检测器。将状态映射为检测到的问题。D: S^N → {Issue}
- I：干预器。将问题映射为状态修改 + prompt。I: {Issue} → S^N × P

**约束：** I 绝不直接修改 U_i(t)。只能修改：
- I_i(t)（force_reflection）
- E_i(t)（introduce_diversity）
- w_ij(t)（reduce_weight）
- 讨论结构（continue_discussion）

### 7.7 决策函数

```
Decision_i(t) = argmax_k U_i(t)[k]
```

### 7.8 输出函数

```
Expression_i(t) = g(U_i(t), strategy_i)
```
Phase 2：g 为恒等映射（expression = LLM 输出，无策略性偏离）。
Phase 4：g 可能引入偏离（公开 ≠ 私下 utility）。

---

## 第八部分：命名冻结

### 8.1 当前命名冲突

| 术语 | 旧含义 | 新含义 | 解决方案 |
|------|--------|--------|----------|
| `belief` | 标量偏好 [-1,1] | **已废弃** | 使用 `utility.scores[topChoice]` 进行向后兼容 |
| `confidence` | AgentOpinion 中 0-100 | Confidence 中 0-1 | 保留 AgentOpinion 中的旧 `confidence` 作为"表达信心"（Phase 4 偏离）；系统信心使用 `C` |
| `itemBeliefs[].belief` | 每个选项的分数 | ← 相同 | 重命名为 `itemBeliefs[].score` 或 `itemBeliefs[].utility` |
| `position` | 代码中未使用 | - | 保留供将来使用；不引入 |
| `preference` | 代码中未使用 | - | Utility 的别名；优先使用 `utility` |
| `commitment` | 代码中未使用 | - | 不引入；与 Inertia 重叠 |

### 8.2 冻结术语表

| 规范术语 | 符号 | 定义 |
|----------|------|------|
| Utility | U | 对选项的偏好向量 |
| Evidence | E | 信息库存 |
| Inertia | I | 改变阻力 |
| Confidence | C | 对自身 utility 的确定性（派生） |
| Susceptibility | Λ | 对社会影响的开放程度（派生） |
| Decision | D | 选中的选项 |
| Expression | Ê | 公开表达 |
| Influence weight | w_ij | Agent j 对 agent i 的权重 |
| Detection | - | 从状态中识别治理问题 |
| Intervention | - | 修改状态以解决问题 |

### 8.3 代码命名规范

```
// 旧（废弃）                     → 新（规范）
AgentOpinion.belief              → AgentOpinion.utilityScore（通过别名向后兼容）
AgentState.belief                → AgentState.utilityScore
AgentBelief                      → AgentUtility（或 AgentPreference）
itemBeliefs[].belief             → itemBeliefs[].score
BeliefUpdateStrategy             → UtilityUpdateStrategy
BeliefUpdateContext              → UtilityUpdateContext
updateBeliefs()                  → updateUtility()
finalBeliefs                     → finalUtilities
```

---

## 第九部分：理论风险分析

### 风险 1：Confidence 与 Inertia 之间的证据双重计数
**严重程度：中**

当前设计中，C 和 I 都依赖 E.coverage。公式 Λ = (1−I)(1−C) 将两者视为独立，但它们共享一个共同原因。若 E.coverage 增加，C 增大（证据越多越确定）且 I 也增大（evidence-based 分量），导致 Λ 通过两条通道减小。这是**证据对 susceptibility 影响的双重计数**。

**修复：** 从 Inertia 中移除 `evidenceBased` 分量。让 I 仅依赖 role + expression + refutation。证据对 susceptibility 的影响完全通过 C 传导。这使得 I 和 C 在给定状态下独立。

### 风险 2：不可观测的隐状态
**严重程度：高**

U、I 和 C 都是隐变量。只有 E（通过 evidence 字符串）和 Expression（通过 LLM 输出）是可观测的。系统从 itemBeliefs 推断 U，但 itemBeliefs 是 agent 的**表达**效用，在 Phase 4 中可能与真实效用偏离。这产生了**根本性的可观测性问题**：系统永远无法知道真实效用，只能知道表达效用。

**修复：** Phase 2 中假设 expression = true utility（无策略性偏离）。Phase 4 需要显式建模偏离。将此作为局限性记录在文档中。

### 风险 3：无理论依据的硬编码常量
**严重程度：中**

以下常量缺少理论或实证依据：
- `DEFAULT_GLOBAL_INFO_POOL_SIZE = 10`
- `DEFAULT_TOTAL_CATEGORIES = 5`
- `INERTIA_DECAY = 0.98`
- `EXPRESSION_INERTIA_BONUS = 0.05`
- `REFUTATION_INERTIA_PENALTY = 0.1`
- 权重组合：`0.7 * roleBase + 0.2 * evidenceBased + 0.1 * expressionBased`
- 信心组合：`0.7 * evidenceBased + 0.3 * stabilityBased`

**修复：** 要么 (a) 从理论推导，(b) 在留出数据上通过网格搜索校准，或 (c) 作为超参数记录并进行敏感性分析。推荐方案 (b)。

### 风险 4：证据提取使用启发式方法
**严重程度：高**

`extractEvidenceItems()` 通过子串匹配将 evidence 字符串与选项名称匹配。这是脆弱的：
- "Company A" 会匹配 "Company AB"
- 涉及多个选项的证据可能被错误归属
- 未提及选项名称的证据被默认分配给排名最高的选项

**修复：** 使用 LLM 本身来分类证据条目（结构化输出）。或者在 Phase 2 中接受启发式方法作为局限性并记录在文档中。审稿人会指出这个问题。

### 风险 5：DeGroot 模型假设等权重
**严重程度：低**

当前 `updateUtility` 使用统一影响权重（w_ij = 1/N）。这是将在后续阶段放宽的简化。需显式记录。

### 风险 6：Phase 2 "事后"架构是桥梁而非基础
**严重程度：高**

当前设计从旧 belief 模型下生成的 LLM 输出中计算认知状态。LLM prompt 仍然要求输出标量 "belief" 和 "confidence"。认知状态从 itemBeliefs 事后提取。这意味着 LLM 并非在新状态空间下推理——它仍然在旧标量 belief 下推理。认知状态是旧模型的**投影**，而非原生表示。

**修复：** 最终 LLM prompt 必须更新为使用新术语。这是 Phase 3 的工作。在此之前，认知状态是旧模型的派生表示，而非真正的认知状态。

### 风险 7：AsyncEngine 解耦
**严重程度：严重**

AsyncDiscussionEngine（用于全部 445 个实验）完全不使用认知状态。它完全在旧标量 belief 模型上运行。认知状态实现仅存在于同步 DiscussionEngine 中，且仅在验证脚本中使用。这意味着**零生产数据**存在于认知状态模型下。

**修复：** 这是实现问题，非理论问题。但从审稿人视角，理论与实验证据是脱节的。

---

## 第十部分：理论冻结检查清单

| # | 项目 | 状态 | 备注 |
|---|------|------|------|
| 1 | 状态空间已冻结 | ☐ | 微调：将 Evidence 缩减为 {coverage, recentGain} |
| 2 | 所有变量定义唯一 | ☐ | 风险 1：移除 Inertia 中的 evidenceBased 分量 |
| 3 | 所有变量命名统一 | ☐ | 代码中仍到处使用 "belief" |
| 4 | 状态转移已冻结 | ☐ | 风险 1：修复 Inertia 中的证据双重计数 |
| 5 | 治理映射已冻结 | ☐ | 干预必须针对新状态变量，而非标量 belief |
| 6 | 检测器映射已冻结 | ☐ | 检测器必须在新的状态空间上运作 |
| 7 | 数学符号统一 | ☐ | 已在第七部分提出；尚未在代码/文档中实现 |
| 8 | README 术语统一 | ☐ | 未检查 |
| 9 | Paper 术语统一 | ☐ | 未检查 |
| 10 | SDK 接口统一 | ☐ | 未检查 |
| 11 | 旧 belief 降级为兼容层 | ☐ | `beliefToCognitiveState` 存在但是单向桥梁 |
| 12 | 循环依赖已解决 | ☐ | 风险 1 |
| 13 | 硬编码常量有理论依据 | ☐ | 风险 3 |
| 14 | 证据提取严谨性 | ☐ | 风险 4 |
| 15 | AsyncEngine 集成 | ☐ | 风险 7（实现问题，非理论问题） |

---

## 第十一部分：最终裁决

### 理论冻结：尚未通过

认知状态空间方案**方向正确**，但在冻结前存在两个阻塞性理论问题：

**阻塞问题 1：证据双重计数。** Confidence 和 Inertia 都依赖 E.coverage，在 susceptibility 公式中产生双重计数效应。修复：从 Inertia 中移除 `evidenceBased` 分量。Inertia 应纯粹由角色 + 表达 + 反驳驱动。证据对 susceptibility 的影响完全通过 Confidence 传导。

**阻塞问题 2：治理干预针对错误变量。** 全部四个干预（`reduce_weight`、`introduce_diversity`、`force_reflection`、`continue_discussion`）直接修改标量 `belief`，而非认知状态变量。第五部分中的治理映射必须重新设计，使干预针对 I、E、W 或讨论结构——绝不直接修改 U。

### 若这两个阻塞问题解决：

> **理论冻结有条件批准**

剩余项目（风险 3-7）是实现问题，或可作为 Phase 3/4 工作记录在文档中。它们不阻塞理论冻结。

### 进入 Phase 2 的前提条件：

1. 从 Inertia 中移除 `evidenceBased` 分量（修复风险 1）
2. 重新设计全部四个干预，使其针对 I、E、W 或讨论结构（修复风险 2）
3. 记录 Phase 2 使用旧模型 LLM 输出的事后提取（风险 6）
4. 记录 asyncEngine 集成推迟到 Phase 3（风险 7）
5. 在所有代码注释中采用第七部分的数学符号
6. 在新代码中开始将 `belief` 重命名为 `utility`（不追溯修改旧代码）

---

**总结：** 五维度分解（Utility、Evidence、Inertia、Confidence、Susceptibility）是正确的方向。当前实现存在两个可修复的理论阻塞问题和若干实现差距。解决两个阻塞问题后，理论足够稳定，可以进入 Phase 2。