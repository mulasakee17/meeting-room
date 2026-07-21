# 理论分析（Theory）

本文档为 SwarmAlpha 的热力学终止判定与治理干预提供形式化分析，回应"为什么 R 能度量共识"与"干预后系统收敛到何处"两类理论问题。

> 状态：B5/B6 初版（2026-07-20）。所有命题均为**启发式论证**（heuristic argument），非严格证明。引用的代码事实以现场实现为准。

---

## 1. 符号与代码事实

| 符号 | 定义 | 代码位置 |
|---|---|---|
| `b_i ∈ [-1, 1]` | agent i 的顶层 belief | `AgentOpinion.belief` |
| `θ_i = (π/2) · b_i` | belief → 相位角映射 | `asyncEngine.ts:736` |
| `R = \|Σ e^{iθ_i}\| / N` | Kuramoto 序参量 | `asyncEngine.ts:739` |
| `T = σ_population / 1` | 归一化温度（σ 用 N 而非 N-1） | `asyncEngine.ts:746-747` |
| `H = Shannon_5bins(b)` | 归一化 Shannon 熵（5 bins, [-1,1]） | `statsUtils.ts:80` |
| `F = (1-R) + T·H` | 社会自由能 | `statsUtils.ts:132` |

**关键映射选择**：`θ = (π/2)·b`，而非 `θ = π·b`。这使 belief ∈ [-1,1] 映射到 θ ∈ [-π/2, π/2]，覆盖范围 **半圆**而非全圆。

---

## 2. R 度量共识的信息论解释（B5）

> **2026-07-20 修正**：本节原命题 1b/1c/2 经脚本测试（`experiments/v2/test_theory_propositions.ts`）发现表述错误，已修正。详见附录 A 测试结果。

### 2.1 命题

**命题 1**：在 θ ∈ [-π/2, π/2] 的半圆映射下，R 是信念一致性的度量——共识完美时 R=1。R 的下界取决于 agent 数 N 与信念分布：

- **1a**（完美共识）：所有 b_i 相同 → R = 1 ✅（已验证）
- **1b**（完美两极分化）：**偶数 N 且完美对半分**（一半 b=+1，一半 b=-1）→ R = 0。**奇数 N 或含中间值时 R > 0**（如 [1,1,-1,-1,0] 的 R=0.2）⚠️ 已修正
- **1c**（均匀分布）：当 N→∞ 且 θ 在 [-π/2,π/2] 上**连续均匀分布**时，R→2/π ≈ 0.637。**有限 N 下 R 偏离 2/π**（如 5 个离散点 R=0.4828）⚠️ 已修正

### 2.2 证明草图

**1a 完美共识**（所有 b_i 相同）：
```
所有 θ_i 相同 → e^{iθ_i} 同向 → |Σ e^{iθ_i}| = N → R = 1 ✓
```

**1b 完美两极分化**（偶数 N，一半 b=+1，一半 b=-1）：
```
θ_+ = +π/2 → e^{iθ_+} = i
θ_- = -π/2 → e^{iθ_-} = -i
Σ = (N/2)·i + (N/2)·(-i) = 0 → R = 0 ✓（仅此严格条件下成立）
```
**注意**：奇数 N 或含中间值（如 0）时，sin 项不完美抵消，R > 0。测试数据 [1,1,-1,-1,0] 的 R=0.2。

**1c 连续均匀分布极限**：θ 在 [-π/2, π/2] 连续均匀分布时：
```
Σ e^{iθ_i} = ∫_{-π/2}^{π/2} e^{iθ} dθ / π = (2 sin(π/2)) / π = 2/π ≈ 0.637
```
**注意**：2/π 是连续极限值。5 个离散点 [-1,-0.5,0,0.5,1] 的实测 R=0.4828，偏离 2/π。N 越大越接近 2/π。

### 2.3 命题的含义

**命题 1 的含义**：R 同时敏感于"方向一致性"（同号）与"强度一致性"（同 |b|）。当 agent 信念跨越 0 点时，R 急剧下降——这符合"共识需要方向一致"的直觉。但 R 的下界不是固定值，取决于 N 与分布形状。

### 2.4 与 Shannon 熵 H 的关系

**命题 2**（已修正）：R 与 H 度量共识的不同维度，二者**定性互补**而非严格阈值关系。

| 指标 | 敏感于 | 不敏感于 |
|---|---|---|
| R | 信念**方向**一致性（跨 0 点） | 分布形状（bins 内细节） |
| H | 分布**形状**（多峰/单峰） | 信念方向（H 对 b 与 -b 对称） |

**测试验证**（脚本实测，非估算）：
- `{b: [+0.5, +0.5, +0.5, +0.5, +0.5]}`：R=1.0, H=0（完美共识）
- `{b: [+0.5, +0.5, -0.5, -0.5, 0]}`：R=**0.766**, H=**0.655**（极化，但 R 不算"低"、H 不算"高"）
- `{b: [+0.9, +0.8, +0.7, +0.6, +0.5]}`：R=0.975, H=**0.311**（同向但分散，H 不算"高"）

**修正说明**：原命题 2 给出"极化时 R<0.7 且 H>0.8"的阈值，实测 [0.5,0.5,-0.5,-0.5,0] 的 R=0.766、H=0.655，均未达阈值。R-H 互补性是**定性趋势**（极化时 R 低于完美共识、H 高于完美共识），不是严格阈值。第三种情况（同向分散）R 高 H 不一定高——这是 `premature_consensus` 检测器的盲区。

### 2.5 R 作为终止判定的合理性

**命题 3**：R ≥ R_crystal（=0.85）是"信念方向收敛"的**充分非必要条件**。

- 充分性：R ≥ 0.85 → 至少 85% 的相位能量集中 → 方向一致
- 非必要性：R < 0.85 不一定未收敛（可能是合理的多解问题）

**局限**：R 不区分"自然共识"与"人造虚假共识"。恶意 agent 推动 b→+1 时 R 也会上升。这是 verifyFindings 中"R≈0 但 τ 低"反例的根源——需配合 τ 共同判定。

---

## 3. 干预后系统不动点分析（B6）

### 3.1 信念更新方程

异步引擎中，agent i 在轮次 t 的信念更新（简化）：
```
b_i^{(t+1)} = b_i^{(t)} + α · Σ_j w_{ij} · (b_j^{(t)} - b_i^{(t)}) + ε_i
```
其中：
- `α`：学习率（由 confidence 调制）
- `w_{ij}`：j 对 i 的影响权重
- `ε_i`：LLM 输出的随机扰动

### 3.2 干预的不动点位移

**reduce_weight(a_k)**：将 w_{ik} ← β·w_{ik}（β < 1），等价于在更新方程中削弱 a_k 的影响。

不动点方程（无 ε）：
```
b_i^* = b_i^* + α · Σ_j w_{ij} · (b_j^* - b_i^*)
→ Σ_j w_{ij} · (b_j^* - b_i^*) = 0
```

**命题 4**：reduce_weight(a_k) 不改变不动点的**存在性**，但改变不动点的**位置**——使 a_k 的 b_k^* 在群体不动点中的权重降低。

**推论**：若 a_k 是恶意 agent（b_k 远离诚实 agent 的 b），reduce_weight 使群体不动点向"无 a_k 时的不动点"靠拢。这是 reduce_weight 有效的理论基础。

### 3.3 force_reflection 的不动点效应

**force_reflection(a_k)**：要求 a_k 重新审视信念。在 LLM 输出层面，这等价于：
```
b_k^{(t+1)} = f_reflect(b_k^{(t)}, context) + ε
```
其中 `f_reflect` 是 LLM 的 reflection 函数。

**命题 5**：force_reflection 的不动点效应**不确定**——取决于 `f_reflect` 的行为：
- 若 f_reflect 是"向群体均值回归"：不动点向共识靠拢 → 有效
- 若 f_reflect 是"强化原有立场"：不动点不变甚至远离群体 → 无效甚至有害

**E 组 trace 数据验证**：force_reflection 后 a1 信念平均 +0.5640（80% 上升），符合"强化原有立场"模式。这**不是 bug**，而是 `f_reflect` 在恶意 prompt 下的必然行为——恶意 prompt 明确指示"永不认错"。

**推论**：force_reflection 对**诚实但偏差**的 agent 有效（因 f_reflect 倾向向证据回归），对**恶意** agent 无效（因恶意 prompt 锁定 f_reflect 输出）。这是 force_reflection 失效的理论解释。

### 3.4 干预组合的 Lyapunov 分析

定义 Lyapunov 函数：
```
V(b) = (1/2) · Σ_i (b_i - b̄)²
```
其中 b̄ 是群体均值。

**命题 6**：在无干预、无 ε 的情况下，V 单调递减（共识收敛）。

**干预对 V 的影响**：
- reduce_weight(a_k)：减少 a_k 对 b̄ 的拉扯 → V 下降更快 ✓
- force_reflection(a_k)：若 a_k 强化原有立场 → V 可能上升 ✗
- introduce_diversity：人为注入分歧 → V 上升（设计意图，打破过早收敛）

**命题 7**：E 组 trace 数据中"更多干预 = 更低 τ"（r=-0.55）的负相关，可由"force_reflection 使 V 上升"部分解释。当 force_reflection 占比高时，V 反复上升 → 系统无法收敛 → τ 低。

### 3.5 干预策略的不动点可达性

**命题 8**：reduce_weight 是"不动点位移"型干预——必定改变系统轨迹，但不保证趋向期望不动点。

**反例**：若 reduce_weight 误打到诚实 agent a2（E 组数据：a2 被附带 24 次），则 a2 的 b_2^* 在群体不动点中权重降低 → 群体不动点向"无 a2"偏移 → 可能远离 ground truth。

这是"a2 依赖链受害"现象（N3 结论）的理论解释：reduce_weight 的**目标选择**比干预本身更重要。

---

## 4. 理论分析的局限

| 局限 | 说明 |
|---|---|
| 无严格证明 | 所有命题为启发式论证，未做形式化证明 |
| ε 项未建模 | LLM 输出随机性 ε_i 未纳入不动点分析 |
| w_{ij} 时变性 | 影响权重随对话动态变化，分析假设固定 |
| 单层 belief | 仅分析顶层 belief，未涉及 itemBeliefs 多维情况 |
| 无博弈论分析 | 恶意 agent 的策略适应（如"检测到 force_reflection 后假装配合"）未建模 |

---

## 5. 与 SOTA 的理论差距

| 维度 | 本项目 | SOTA |
|---|---|---|
| 共识度量 | Kuramoto R（启发式） | DeGroot model + 频谱分析（严格） |
| 收敛性 | Lyapunov 启发式 | 马尔可夫链收敛定理 |
| 干预效果 | 不动点位移（定性） | 控制论可达性矩阵（定量） |
| 博弈建模 | 无 | 信号博弈 / 机制设计 |

**诚实结论**：本项目的理论分析处于"工程启发式"阶段，距离正式学术理论分析仍有显著差距。B5/B6 文档的目的是**为工程决策提供理论依据**，而非作为理论贡献发表。

---

## 6. 待完成的理论工作

| # | 任务 | 优先级 | 难度 |
|---|---|---|---|
| T1 | 形式化命题 1-8 的严格证明 | 低（高中阶段不必要） | 高 |
| T2 | 建模 LLM 输出 ε 项的统计特性 | 中 | 中 |
| T3 | 将 itemBeliefs 多维情况纳入分析 | 中 | 中 |
| T4 | 博弈论建模：恶意 agent 的策略适应 | 中 | 高 |
| T5 | 与 DeGroot 模型的对比分析 | 中 | 低 |

---

**版本**：v0.1（2026-07-20）
**作者**：SwarmAlpha 项目
**状态**：待北大实验室合作者审阅

---

## 附录 A：命题反例寻找测试结果（2026-07-20）

用脚本生成极端 belief 组合测试命题 1-3（命题 4-8 是理论推导，无法用脚本测试）。

**测试脚本**：`experiments/v2/test_theory_propositions.ts`

### 测试结果

| 命题 | 子命题 | 测试数据 | 预期 | 实际 | 判定 |
|---|---|---|---|---|---|
| 1 | 完美共识 → R=1 | [0.5,0.5,0.5,0.5,0.5] | R=1 | R=1.0000 | ✅ |
| 1 | 完美两极分化 → R=0 | [1,1,-1,-1,0] | R=0 | R=0.2000 | ❌ |
| 1 | 均匀分布 → R≈2/π | [-1,-0.5,0,0.5,1] | R≈0.637 | R=0.4828 | ❌ |
| 2 | 极化 → R低H高 | [0.5,0.5,-0.5,-0.5,0] | R<0.7, H>0.8 | R=0.766, H=0.655 | ❌ |
| 2 | 同向分散 → R高H高 | [0.9,0.8,0.7,0.6,0.5] | R>0.9, H>0.8 | R=0.975, H=0.311 | ❌ |
| 3 | R=1 ≠ 强共识 | [0.05,0.05,0.05,0.05,0.05] | R=1（弱共识） | R=1.0000 | ✅ |

### 命题 1 的修正

**原命题 1**："完美两极分化（一半 b=+1，一半 b=-1）→ R=0"

**问题**：该命题仅在**偶数 agent 且完美对半分**时成立。测试用 [1,1,-1,-1,0]（奇数+含0）的 R=0.2，非 0。

**修正**：命题 1 应表述为"完美对半两极分化（偶数 agent，一半+1，一半-1）→ R=0"。奇数 agent 或含中间值时 R > 0。

**原命题 1**："均匀分布 → R≈2/π"

**问题**：2/π 是 θ 在 [-π/2,π/2] 上**连续均匀分布**的极限值。5 个离散点不满足连续假设。

**修正**：命题 1 应表述为"当 agent 数 N→∞ 且 θ 连续均匀分布时，R→2/π"。有限 N 下 R 偏离 2/π。

### 命题 2 的修正

**原命题 2**："极化（一半+0.5，一半-0.5）→ R低H高"

**问题**：[0.5,0.5,-0.5,-0.5,0] 的 R=0.766（不算"低"），H=0.655（不算"高"）。

**修正**：R-H 的互补性是**定性趋势**，不是严格阈值。应表述为"极化时 R 低于完美共识，H 高于完美共识"，而非"R<0.7 且 H>0.8"。

### 命题 3 的验证

**命题 3**："R=1 不代表强共识，只代表方向一致"

**测试**：[0.05,0.05,0.05,0.05,0.05]（极弱共识）的 R=1.0000。

**结论**：✅ 命题成立。R 对"方向"敏感，对"强度"不敏感。这是 R 作为终止判定的局限——需要配合 T（温度）和 H（熵）共同判断。

### 总结

| 命题 | 原表述 | 修正后 | 状态 |
|---|---|---|---|
| 1a | 完美共识 → R=1 | 不变 | ✅ |
| 1b | 完美两极分化 → R=0 | 仅偶数完美对半分成立 | 需修正 |
| 1c | 均匀分布 → R≈2/π | 仅 N→∞ 连续极限成立 | 需修正 |
| 2 | R-H 互补 | 定性趋势，非严格阈值 | 需修正 |
| 3 | R=1 ≠ 强共识 | 不变 | ✅ |

**诚实结论**：THEORY.md 的命题 1 和 2 需修正表述，命题 3 成立。理论分析的整体方向正确，但部分细节（阈值、连续性假设）需更严谨。

---

# 附录 A：数学框架完整定义

> 本节原为独立文档 MATHEMATICAL_FRAMEWORK.md，现已合并入 THEORY.md 以集中理论定义。

> Complete formal mathematical definition of the SwarmAlpha governance runtime.
> All symbols and formulas have 1:1 implementations in `src/lib/` and `src/runtime/`.
>
> **Runtime embedding**: The governance runtime defined here can be embedded into any multi-agent framework via the `GovernanceRuntime` class in `src/runtime/GovernanceRuntime.ts`. The mathematical models operate on framework-agnostic `DiscussionMessage` streams, making them independent of any specific agent framework.

---

## 符号约定

| 符号 | 含义 | 域 |
|------|------|-----|
| $\mathcal{A} = \{a_1, \dots, a_n\}$ | $n$ 个 Agent 的集合 | $n \geq 2$ |
| $b_i^{(t)} \in [-1, 1]$ | Agent $i$ 在第 $t$ 轮后的**信念**（-1=强烈反对，1=强烈支持） | $\mathbb{R}$ |
| $c_i^{(t)} \in [0, 100]$ | Agent $i$ 在第 $t$ 轮后的**置信度** | $\mathbb{R}$ |
| $\mathbf{b}^{(t)} = (b_1^{(t)}, \dots, b_n^{(t)})$ | 第 $t$ 轮信念向量 | $[-1,1]^n$ |
| $r_i^{(t)} \in \mathbb{S}$ | Agent $i$ 在第 $t$ 轮的**推理文本**（自然语言） | $\mathbb{S}$ = 字符串空间 |
| $T$ | 总讨论轮数 | $\mathbb{N}$ |
| $T_{\max}$ | 最大允许轮数 | $\mathbb{N}$ |
| $G = (V, E, W)$ | 影响力有向图 | $V = \mathcal{A}$, $E \subseteq V \times V$, $W: E \to [0,1]$ |

---

## 1. Agent 模型

### 1.1 定义

每个 Agent $a_i$ 是一个函数 $\mathcal{M}_i: \mathbb{S} \times [-1,1] \times [0,100] \to \mathbb{S}$，它接收系统提示词、当前信念和置信度，输出自然语言推理。

Agent 的**独有知识** $\mathcal{K}_i^{\text{unique}} \subset \mathcal{I}$ 是全体信息集 $\mathcal{I}$ 的子集，满足：

$$
\mathcal{I} = \mathcal{I}^{\text{shared}} \cup \bigcup_{i=1}^{n} \mathcal{K}_i^{\text{unique}}
$$

且 $\mathcal{K}_i^{\text{unique}} \not\subseteq \mathcal{I}^{\text{shared}}$（Hidden Profile 条件）。

### 1.2 观测提取

LLM 的原始输出 $r_i^{(t)}$ 经观测层解析为结构化观点 $\hat{o}_i^{(t)}$：

$$
\hat{o}_i^{(t)} = \text{Parse}\left(\mathcal{M}_i\left(p_i, b_i^{(t-1)}, c_i^{(t-1)}\right)\right)
$$

其中 $p_i$ 是 Agent $i$ 的系统提示词（含 $\mathcal{K}_i^{\text{unique}}$），Parse 提取 $b_i^{(t)}, c_i^{(t)}, r_i^{(t)}$。

---

## 2. 影响力计算

### 2.1 影响力类型判定

对于每对 Agent $(a_s, a_t)$，影响力类型 $\tau_{s \to t}$ 由以下优先级判定：

$$
\tau_{s \to t} = \begin{cases}
\text{disagreement} & \text{if } |b_s - b_t| > \theta_{\text{dis}} \\
\text{reference}     & \text{if } a_s \in \text{refs}(a_t) \\
\text{persuasion}    & \text{if } c_s > c_t + \Delta_c \\
\text{agreement}     & \text{otherwise}
\end{cases}
$$

其中 $\theta_{\text{dis}} = 0.5$（信念分歧阈值），$\Delta_c = 20$（信心差阈值），$\text{refs}(a_t)$ 是 $a_t$ 引用的 Agent 集合。

### 2.2 四种影响力权重

**一致性 (Agreement)** — 信念相似则影响力大：

$$
w_{\text{agr}}(s, t) = \big(1 - |b_s - b_t|\big) \cdot \frac{c_s}{100} \cdot \alpha_{\text{agr}}
$$

**分歧 (Disagreement)** — 信念差异大则影响显著：

$$
w_{\text{dis}}(s, t) = |b_s - b_t| \cdot \frac{c_s}{100} \cdot \alpha_{\text{dis}}
$$

**引用 (Reference)** — 被引用即获权重，正比于推理质量：

$$
w_{\text{ref}}(s, t) = \frac{c_s}{100} \cdot \min\!\left(1, \frac{|r_s|}{L_{\max}}\right) \cdot \alpha_{\text{ref}}
$$

**说服 (Persuasion)** — 高置信对低置信的拉力：

$$
w_{\text{per}}(s, t) = \max\!\left(0, \frac{c_s - c_t}{100}\right) \cdot \big(1 - |b_s - b_t|\big) \cdot \alpha_{\text{per}}
$$

其中 $\alpha_{\text{agr}} = 0.8,\; \alpha_{\text{dis}} = 0.5,\; \alpha_{\text{ref}} = 0.7,\; \alpha_{\text{per}} = 0.6$，$L_{\max} = 500$。

### 2.3 影响力图更新

边权重的增量更新（指数衰减）：

$$
W(s \to t)^{(t)} = \min\!\left(1,\; W(s \to t)^{(t-1)} + w_{\tau}(s,t) \cdot \eta\right)
$$

其中衰减因子 $\eta = 0.3$。

---

## 3. 信念演化动力学

### 3.1 更新方程

Agent $i$ 在第 $t$ 轮的信念变化由**三股力量**驱动：

#### 力量 1：同伴均值拉力

高置信同伴和低置信同伴各自形成子群体均值，以不同强度拉动 Agent：

$$
\Delta b_i^{\text{peer}} = \underbrace{\left(\bar{b}_H^{(t)} - b_i^{(t-1)}\right) \cdot \beta_H}_{\text{高置信同伴}} \;+\; \underbrace{\left(\bar{b}_L^{(t)} - b_i^{(t-1)}\right) \cdot \beta_L}_{\text{低置信同伴}}
$$

其中 $\bar{b}_H^{(t)}$ 是置信度 > 70 的同伴均值，$\beta_H = 0.3$，$\beta_L = 0.1$。

#### 力量 2：多数效应

$$
\Delta b_i^{\text{maj}} = \begin{cases}
\bar{b}_{-i}^{(t)} \cdot \gamma_{\text{agr}} \;+\; \delta_{\text{agr}} & \text{if 一致者 > 分歧者} \\
\bar{b}_{-i}^{(t)} \cdot \gamma_{\text{dis}} \;-\; \delta_{\text{dis}} & \text{if 分歧者 > 一致者}
\end{cases}
$$

其中 $\bar{b}_{-i}^{(t)}$ 是除 $i$ 外所有 Agent 的均值，$\gamma_{\text{agr}} = 0.1$, $\delta_{\text{agr}} = 5$, $\gamma_{\text{dis}} = 0.05$, $\delta_{\text{dis}} = 3$。

#### 力量 3：影响力扩散

图中每条入边对 Agent 施加与权重成正比、与类型相关的信念改变：

$$
\Delta b_i^{\text{inf}} = \sum_{(s \to i) \in E} w_{s \to i} \cdot \big(b_s - b_i\big) \cdot \kappa_{\tau(s,i)}
$$

其中 $\kappa_{\text{agr}} = 0.4$, $\kappa_{\text{dis}} = 0.2$, $\kappa_{\text{ref}} = 0.5$, $\kappa_{\text{per}} = 0.6$。

#### 完整更新

$$
b_i^{(t)} = \text{clip}_{[-1,1]}\!\left(b_i^{(t-1)} + \Delta b_i^{\text{peer}} + \Delta b_i^{\text{maj}} + \Delta b_i^{\text{inf}}\right)
$$

置信度以类似方式更新，但对分歧减弱、对一致性增强。

### 3.2 收敛条件

讨论在 $t = T_{\max}$ 或达到以下条件时终止：

$$
\sigma(\mathbf{b}^{(t)}) = \sqrt{\frac{1}{n}\sum_{i=1}^{n}\left(b_i^{(t)} - \bar{b}^{(t)}\right)^2} < \theta_{\text{conv}}
$$

其中 $\theta_{\text{conv}} = 0.06$。

### 3.3 稳定性

当 $\sigma(\mathbf{b}^{(t)}) < \theta_{\text{conv}}$ 时，系统进入吸引子。无外部干预时，该吸引子是**吸收态**：一旦进入，信念不再显著变化。

---

## 4. 共识度量

### 4.1 Kuramoto 序参数

将信念映射到单位圆上的相位角：

$$
\phi_i = b_i \cdot \pi \quad \Rightarrow \quad \phi_i \in [-\pi, \pi]
$$

> **⚠️ 已修正（H4，commit 08b20fb）**：上述旧映射 `θ = π·b` 存在严重缺陷，已修正为：
>
> $$\phi_i = b_i \cdot \frac{\pi}{2} \quad \Rightarrow \quad \phi_i \in \left[-\frac{\pi}{2}, \frac{\pi}{2}\right]$$
>
> **旧映射的问题**：当 $b = +0.99$ 时 $\theta \approx +0.99\pi$（单位圆上接近 $(-1, 0)$ 左侧），当 $b = -0.99$ 时 $\theta \approx -0.99\pi$（同样接近 $(-1, 0)$ 左侧）。两个极端对立的信念在单位圆上**几乎重合**，导致 $R \approx 1$，把强极化误判为强共识。
>
> **新映射的合理性**：$b = -1 \Rightarrow \theta = -\pi/2$（单位圆下方），$b = +1 \Rightarrow \theta = +\pi/2$（单位圆上方），两者**正对**（相位差 $\pi$），向量和为 0，$R \approx 0$（低共识），正确反映极化状态。而 $b$ 全部一致时所有相位重合，$R \approx 1$（高共识）。

Kuramoto 序参数 $R \in [0,1]$ 衡量相位的同步程度：

$$
R = \frac{1}{n}\left|\sum_{k=1}^{n} e^{i\phi_k}\right| = \frac{1}{n}\sqrt{\left(\sum_{k=1}^{n} \cos\phi_k\right)^2 + \left(\sum_{k=1}^{n} \sin\phi_k\right)^2}
$$

- $R \to 1$：完美同步（所有 Agent 信念一致）
- $R \to 0$：完全失序
- $R = 1/\sqrt{n}$：随机相位的期望值

### 4.2 共识评分

加权综合：

$$
S_{\text{consensus}} = \min\!\left(100,\; R \cdot 30 + \left(1 - \frac{\sigma}{2}\right) \cdot 40 + \frac{\text{agreementRate}}{100} \cdot 30\right)
$$

其中 $\text{agreementRate}$ 是推理内容的 Jaccard 一致率。

---

## 5. 群体失效检测

治理引擎 $\mathcal{G}$ 监测 4 种失效条件。每种条件是一个布尔谓词。

### 5.1 回音室 (Echo Chamber)

**指标**：信息冗余度 $\rho \in [0,1]$

$$
\rho = \underbrace{(1 - \sigma_{\text{norm}}) \cdot 0.5}_{\text{信念多样性}} \;+\; \underbrace{\text{Sim}(M^{(t)}) \cdot 0.5}_{\text{内容相似度}}
$$

其中 $\sigma_{\text{norm}} = \sigma(\mathbf{b}) / 2$，$\text{Sim}(M^{(t)})$ 是所有消息对的平均 Jaccard 相似度：

$$
\text{Sim}(M) = \frac{2}{m(m-1)}\sum_{i<j} \frac{|W_i \cap W_j|}{|W_i \cup W_j|}
$$

其中 $W_i$ 是消息 $i$ 的词汇集合（排除长度 ≤ 2 的词）。

**触发条件**：

$$
\mathcal{C}_{\text{echo}}: \rho \geq \theta_{\text{echo}} \quad (\theta_{\text{echo}} = 0.70)
$$

### 5.2 权威偏差 (Authority Bias)

**指标**：影响力集中度 $\lambda \in [0,1]$

$$
\lambda = \frac{\max_i |M_i|}{\sum_i |M_i|}
$$

其中 $|M_i|$ 是 Agent $i$ 发出的消息数。

**触发条件**：

$$
\mathcal{C}_{\text{auth}}: \lambda \geq \theta_{\text{auth}} \quad (\theta_{\text{auth}} = 0.40)
$$

### 5.3 群体极化 (Polarization)

**指标**：直接用信念标准差

$$
\mathcal{C}_{\text{pol}}: \sigma(\mathbf{b}) \geq \theta_{\text{pol}} \quad (\theta_{\text{pol}} = 0.50)
$$

此外通过 $\pm 0.2$ 偏移均值聚类，将 Agent 分为 positive / negative / neutral 三组。

### 5.4 过早共识 (Premature Consensus)

**指标**：轮次进度 $\times$ 共识水平的联合条件

令 $\rho_t = t / T_{\max}$ 为轮次进度，则：

$$
\mathcal{C}_{\text{pre}}: \rho_t < \theta_{\text{pre}} \;\land\; \text{CL}(\mathbf{b}^{(t)}) > \gamma_{\text{pre}} \;\land\; \sigma(\mathbf{b}^{(t)}) < \sigma_{\min}
$$

其中 $\theta_{\text{pre}} = 0.50$, $\gamma_{\text{pre}} = 0.70$, $\sigma_{\min} = 0.15$，且共识水平：

$$
\text{CL}(\mathbf{b}) = \max\!\left(0,\; 1 - 2\sigma(\mathbf{b})\right)
$$

### 5.5 严重度分级

所有检测到的失效按阈值区间分级：

$$
\text{severity}(x) = \begin{cases}
\text{high}   & \text{if } x \geq \theta_2 \\
\text{medium} & \text{if } \theta_1 \leq x < \theta_2 \\
\text{low}     & \text{otherwise}
\end{cases}
$$

具体区间：回声室 $[0.70, 0.85]$，权威偏差 $[0.40, 0.60]$，极化 $[0.50, 0.70]$。

---

## 6. 治理干预模型

### 6.1 干预函数

治理引擎 $\mathcal{G}$ 是一个函数，将系统状态映射到干预动作：

$$
\mathcal{G}: \left(\mathbf{b}^{(t)}, M^{(t)}, G^{(t)}\right) \to \mathcal{J}
$$

其中 $\mathcal{J} \subseteq \{\text{reduce\_weight}, \text{introduce\_diversity}, \text{force\_reflection}, \text{continue\_discussion}\}$。

### 6.2 四种干预

| 干预 | 触发条件 | 数学效果 |
|------|---------|---------|
| reduce_weight | $\mathcal{C}_{\text{auth}}$ | $\forall j \neq i^*: W(i^* \to j) \leftarrow W(i^* \to j) \cdot 0.5$ |
| introduce_diversity | $\mathcal{C}_{\text{echo}}$ | $\forall i \in \text{Redundant}: b_i \leftarrow b_i + \epsilon_i, \epsilon_i \sim \mathcal{U}(-0.3, 0.3)$ |
| force_reflection | $\mathcal{C}_{\text{pol}}$ | $b_i \leftarrow b_i + (\bar{b} - b_i) \cdot \phi, \phi = 0.2$ |
| continue_discussion | $\mathcal{C}_{\text{pre}}$ | $T_{\max} \leftarrow T_{\max} + \lceil T_{\max} \cdot (\theta_{\text{pre}} - \rho_t) \rceil$ |

### 6.3 干预的效果评估

干预前后系统状态变化的量化指标：

$$
\begin{aligned}
\Delta\sigma &= \sigma_{\text{after}} - \sigma_{\text{before}} \quad &\text{(信念多样性变化)} \\
\Delta\bar{b} &= \bar{b}_{\text{after}} - \bar{b}_{\text{before}} \quad &\text{(均值变化)} \\
\Delta\text{CL} &= \text{CL}_{\text{after}} - \text{CL}_{\text{before}} \quad &\text{(共识水平变化)}
\end{aligned}
$$

---

## 7. 信息利用度框架（Hidden Profile 分析）

### 7.1 定义

设任务总信息集 $\mathcal{I} = \mathcal{I}^{\text{shared}} \cup \bigcup_i \mathcal{K}_i^{\text{unique}}$。最终决策 $D$ 使用了信息子集 $\mathcal{I}_{\text{used}} \subseteq \mathcal{I}$。

**信息利用度**：

$$
\eta = \frac{|\mathcal{I}_{\text{used}}|}{|\mathcal{I}|}
$$

### 7.2 治理与信息利用的关系

**经验观察**（基于 80 次 Hidden Profile 实验）：

在无治理条件下，Agent 围绕 $\mathcal{I}^{\text{shared}}$ 达成共识，忽略部分 $\mathcal{K}_i^{\text{unique}}$：

$$
\eta_{\text{no-gov}} \approx \frac{|\mathcal{I}^{\text{shared}}| + \varepsilon|\bigcup_i \mathcal{K}_i^{\text{unique}}|}{|\mathcal{I}|}
$$

其中 $\varepsilon < 1$ 表示独有信息的自发分享率。

治理引擎通过 $\mathcal{C}_{\text{pre}}$ 检测过早共识，触发 force_reflection 干预，强制 Agent 重新审视 $\mathcal{K}_i^{\text{unique}}$。

**引理（治理不劣性）**：对于满足 Hidden Profile 条件（$\exists i: \mathcal{K}_i^{\text{unique}} \not\subseteq \mathcal{I}^{\text{shared}}$）的任务：

$$
\eta_{\text{governed}} \geq \eta_{\text{no-gov}}
$$

严格不等式在 $\mathcal{C}_{\text{pre}}$ 触发并成功引入至少一件独有信息时成立。

### 7.3 实验验证

| 任务 | $\eta_{\text{no-gov}}$ | $\eta_{\text{full-gov}}$ | 治理效果 |
|------|----------------------|------------------------|---------|
| 月球生存 | 96.0% | 94.3% | 无差异（LLM 有先验知识，$\mathcal{K}_i^{\text{unique}} = \emptyset$ 实际） |
| 企业并购 | 98.9% | 98.9% | 持平 + 36 次干预（效率增益） |

---

## 8. 五维评价体系

> **V3 重构说明**：原 7 维评价体系中的可解释性（基于推理长度启发式，无统计依据）和抗操纵性（将高一致性误判为高抗操纵性，逻辑缺陷）已移除。鲁棒性重命名为离散度（原未执行真正的扰动测试）。可靠性中的 Cronbach's α 从无效的 k=2 修复为跨讨论轮次计算。

### 8.1 加权总分

$$
S_{\text{overall}} = \sum_{d \in \mathcal{D}} w_d \cdot S_d
$$

其中 $\mathcal{D} = \{\text{consensus}, \text{reliability}, \text{dispersion}, \text{stability}, \text{influence}\}$，权重向量：

$$
\mathbf{w} = (0.20,\; 0.25,\; 0.20,\; 0.17,\; 0.18)
$$

### 8.2 各维度计算

#### 共识度 ($S_{\text{cons}}$) — 权重 0.20

Kuramoto 序参数 + 信念标准差 + 一致率 + 收敛轨迹。公式同 §4。

#### 可靠性 ($S_{\text{rel}}$) — 权重 0.25

$$
S_{\text{rel}} = \text{avgConfidence} \cdot 0.2 + \text{CrossVal} \cdot 0.3 + \text{RoundAlpha} \cdot 0.25 + \text{Repeatability} \cdot 0.25
$$

**跨轮次 Cronbach's $\alpha$**（标准化，仅在轮次 $\geq 3$ 时计算）：

将每轮讨论作为一个测量场合，N 个 Agent 的 beliefs 作为该轮的观测值：

$$
\alpha_{\text{round}} = \frac{k}{k-1}\left(1 - \frac{\sum_{r=1}^{k}\sigma_r^2}{\sigma_{\text{total}}^2}\right)
$$

其中 $k$ = 讨论轮次数（$\geq 3$），$\sigma_r^2$ = 第 $r$ 轮 Agent beliefs 的样本方差，$\sigma_{\text{total}}^2$ = 所有轮次 beliefs 的总体方差。

高 $\alpha_{\text{round}}$ → 轮间方差占主导（Agent 信念在轮次间变化大，但变化方向一致）。低 $\alpha$ → 轮内方差占主导（信念在每轮内部离散度高）。

> **⚠️ 语义争议（H5）**：此指标将轮次作为 item 测量一致性，语义偏向"讨论整体稳定性"而非"个体排名一致性"。详见 `docs/archive/PROJECT_DEEP_ANALYSIS.md` H5 条目。

#### 离散度 ($S_{\text{disp}}$) — 权重 0.20

衡量单次讨论中的统计分散程度（非扰动测试）：

$$
S_{\text{disp}} = \text{BeliefDispersion} \cdot 0.40 + \text{ConfidenceDispersion} \cdot 0.25 + \text{RoundVariability} \cdot 0.35
$$

其中：
- $\text{BeliefDispersion} = \max(0, 100 - \sigma_b \cdot 50)$，$\sigma_b$ = 跨 Agent 信念标准差
- $\text{ConfidenceDispersion} = \max(0, 100 - \sigma_c \cdot 2)$，$\sigma_c$ = 跨 Agent 置信度标准差
- $\text{RoundVariability}$ = 轮次间平均信念差的逆变换

#### 稳定性 ($S_{\text{stab}}$) — 权重 0.17

轮次间一致性和时序平滑度：$S_{\text{stab}} = \text{RoundConsistency} \cdot 0.5 + \text{TimeSeriesStability} \cdot 0.5$。

#### 影响力分析 ($S_{\text{inf}}$) — 权重 0.18

基尼系数衡量影响力不平等：

$$
G = \frac{\sum_{i=1}^{n}\sum_{j=1}^{n}|d_i - d_j|}{2n\sum_{i=1}^{n}d_i}
$$

其中 $d_i$ 是 Agent $i$ 在图中的度中心性。复合得分：$(1-G) \cdot 40 + \text{Density} \cdot 30 + (1 - \bar{L}/3) \cdot 30$。

---

## 9. 参数表

| 参数 | 符号 | 值 | 含义 |
|------|------|-----|------|
| 收敛阈值 | $\theta_{\text{conv}}$ | 0.06 | 信念标准差低于此值→收敛 |
| 最大轮数 | $T_{\max}$ | 5 | 到达后强制终止 |
| 高置信阈值 | $\theta_{\text{high}}$ | 70 | 置信度 > 此值为"高置信" |
| 信念一致阈值 | $\theta_{\text{agr}}$ | 0.3 | 信念差 < 此为"一致" |
| 信念分歧阈值 | $\theta_{\text{dis}}$ | 0.5 | 信念差 > 此为"分歧" |
| 回音室阈值 | $\theta_{\text{echo}}$ | 0.70 | 信息冗余度超过触发 |
| 权威偏差阈值 | $\theta_{\text{auth}}$ | 0.40 | 影响力集中度超过触发 |
| 极化阈值 | $\theta_{\text{pol}}$ | 0.50 | 信念标准差超过触发 |
| 过早共识阈值 | $\theta_{\text{pre}}$ | 0.50 | 轮次进度 < 此且共识 > 0.7 触发 |
| 共识水平阈值 | $\gamma_{\text{pre}}$ | 0.70 | 过早共识检测用 |

---

---

## 10. 自适应阈值 (§A — 新增)

### 10.1 动机

固定阈值 $\theta_{\text{echo}} = 0.70, \theta_{\text{auth}} = 0.40, \dots$ 对所有任务一刀切。但 Agent 群体的基线行为因任务类型、LLM 选择、Agent 配置而异。

### 10.2 校准指标

在正式实验前跑一轮"校准讨论"（简单、有已知答案的问题），测量四个基线指标：

| 指标 | 符号 | 计算 |
|------|------|------|
| 收敛速度 | $s \in [0,1]$ | $s = t_{\text{conv}} / T_{\max}$ — 信念标准差降到 0.1 的归一化轮数 |
| 基础信息冗余度 | $\rho_0 \in [0,1]$ | 消息对间的平均 Jaccard 相似度 |
| 基础影响力集中度 | $\lambda_0 \in [0,1]$ | 发言最多 Agent 的发言占比 |
| 基础信念分散度 | $\sigma_0 \in [0,1]$ | 校准讨论中的信念标准差 |

### 10.3 自适应缩放函数

$$
\theta_{\text{echo}}' = \theta_{\text{echo}} \cdot (0.85 + 0.3 \cdot \rho_0)
$$

$$
\theta_{\text{auth}}' = \theta_{\text{auth}} \cdot (0.80 + 0.4 \cdot \lambda_0)
$$

$$
\theta_{\text{pol}}' = \theta_{\text{pol}} \cdot (0.80 + 0.5 \cdot \min(\sigma_0, 1))
$$

$$
\theta_{\text{pre}}' = \theta_{\text{pre}} \cdot (0.70 + 0.6 \cdot s)
$$

> **⚠️ 注释纠正（H6）**：上式中 $s$ 即 `convergenceSpeed`，其定义为：
>
> $$\text{convergenceSpeed} = \frac{\text{convergenceRounds}}{\text{maxRounds}}$$
>
> **值大 = 慢收敛**（需要更多轮才收敛），而非快收敛。早期代码注释曾将其误写为"值大=快收敛"，导致读者误以为慢收敛时 `scalePrematureConsensus` 应降低。
>
> 公式 `scalePrematureConsensus = 0.7 + speed × 0.6` **方向是正确的**：收敛越慢（$s$ 越大），过早共识阈值 $\theta_{\text{pre}}'$ 越高（越难触发 `continue_discussion`），因为慢收敛本身已说明讨论尚未充分，无需再追加轮数。仅注释曾写反，公式无需改动。

所有自适应阈值 clamp 到合理区间内（如 $\theta_{\text{echo}}' \in [0.40, 0.90]$）。

### 10.4 使用

```typescript
const engine = GovernanceEngine.withAdaptiveThresholds(calibration);
```

---

## 11. Dropout 敏感性分析 (§B)

### 11.1 动机

传统影响力图记录的 $W(s \to t)$ 是**相关性**：$s$ 和 $t$ 的信念相似不等于 $s$ 影响了 $t$ 的变化。Dropout 分析测量结果对每个 Agent 的存在有多敏感。

**重要限制**：这不是因果推断。SUTVA 被违反（dropout 一个 Agent 不阻止其他人引用其先前的发言），且没有识别策略。这只是一个敏感性诊断工具。

### 11.2 Agent Dropout

每轮随机选一个 Agent $a_k$ 不参与讨论。比较 "有 $a_k$" 和 "无 $a_k$" 时其他 Agent 的信念差异：

$$
\text{Diff}(a_i \to a_j)^{(t)} = b_j^{(t)} \big|_{a_i \text{ present}} - b_j^{(t)} \big|_{a_i \text{ absent}}
$$

### 11.3 平均效应

对多轮观测取均值：

$$
\text{AvgEffect}(a_i \to a_j) = \frac{1}{|T_{ij}|}\sum_{t \in T_{ij}} \text{Diff}(a_i \to a_j)^{(t)}
$$

其中 $T_{ij}$ 是有 $a_i$ 作为 dropout 的轮次集合。

### 11.4 敏感性图

与相关性图不同，敏感性图 $\mathcal{G}_s$ 的边集 $E_s$ 仅包含**有 dropout 数据支撑**且 $|\text{AvgEffect}| > 0.05$ 的边：

$$
E_s = \{(i \to j) \mid \text{AvgEffect}(a_i \to a_j) \text{ 可估计} \land |\text{AvgEffect}(a_i \to a_j)| > 0.05\}
$$

边的显著性分三级：high ($|\text{AvgEffect}| > 0.15$, ≥3 观测) / medium ($|\text{AvgEffect}| > 0.08$, ≥2 观测) / low。

### 11.5 信念变化的分解

对于 Agent $j$ 的总信念变化 $\Delta b_j$，可分解为：

$$
\Delta b_j = \underbrace{\sum_{i \neq j} \text{AvgEffect}(a_i \to a_j)}_{\text{社会影响 (social influence)}} + \underbrace{\Delta b_j^{\text{ind}}}_{\text{独立推理}}
$$

独立推理比例 = $1 - \frac{\sum_i |\text{AvgEffect}(a_i \to a_j)|}{|\Delta b_j|}$

### 11.6 查询 API

```typescript
// "哪些 Agent 对 X 的影响最大？"
answerWhatInfluencedChange("agent_2", sensitivityGraph)
// → [{ source: "agent_1", avgEffect: 0.23, significance: "high" }]

// "Agent X 的变化多少是独立思考？"
decomposeBeliefChange("agent_2", 0.5, sensitivityGraph)
// → { independentReasoning: 0.54, socialInfluence: 0.46 }
```

---

---

## 12. 自适应剂量治理 (§C — 新增)

### 12.1 动机

固定干预强度（权重削减 50%、反思因子 0.2、追加 1 轮）忽视了每个偏差的独特背景。自适应剂量根据三个维度动态计算干预强度。

### 12.2 剂量函数

**continue_discussion — 追加轮数**：

$$
\Delta T = \left\lceil T_{\max} \cdot (\theta_{\text{pre}} - \rho_t) \cdot (1 - \eta) \cdot \left(1 + \max(0, -h) \cdot 0.5\right) \right\rceil
$$

**reduce_weight — 权重削减比例**：

$$
r = \text{clamp}_{[0.2, 0.8]}\!\left(0.3 + s \cdot 0.4 \cdot (2 - \eta) \cdot \left(1 - \frac{h}{2}\right)\right)
$$

**force_reflection — 反思强度**：

$$
\phi = \text{clamp}_{[0.1, 0.6]}\!\left(0.15 + s \cdot 0.35 \cdot (1 - \eta) \cdot (1 + 0.3h)\right)
$$

**introduce_diversity — 扰动幅度**：

$$
\varepsilon = \text{clamp}_{[0.1, 0.5]}\!\left(0.15 + s \cdot 0.25 \cdot (1 - \eta)\right)
$$

其中 $s$ = 严重度 (0-1), $\eta$ = 信息利用度 (0-1), $h$ = 历史干预效果 (-1 到 1)。

### 12.3 使用

```typescript
const dosage = computeAdaptiveDosage({
  severity: severityToNumber("medium"),
  informationCoverage: 0.6,
  historyEffectiveness: 0.3,
  roundProgress: 0.4,
  agentCount: 5,
});
// → { additionalRounds: 3, weightReduction: 0.47, ... }
```

---

## 13. 交叉质证模型 (§D — 新增)

### 13.1 动机

传统治理通过消除分歧来达成共识。交叉质证反向利用分歧——将 Agent 按 belief 符号分成正反阵营，进行对抗性辩论，综合裁决。

### 13.2 激活条件

交叉质证在同时满足以下条件时激活：

$$
\sigma(\mathbf{b}) > \theta_{\text{div}} \;\land\; |\{i: b_i > 0\}| \geq n_{\min} \;\land\; |\{i: b_i < 0\}| \geq n_{\min}
$$

其中 $\theta_{\text{div}} = 0.3$（分歧阈值），$n_{\min} = 2$（最少每方人数）。

### 13.3 阵营形成

按信念符号分组：

$$
\begin{aligned}
\mathcal{C}_{\text{pro}} &= \{a_i \mid b_i > 0\} \cup \{a_i \mid b_i = 0 \land |\mathcal{C}_{\text{pro}}| \leq |\mathcal{C}_{\text{con}}|\} \\
\mathcal{C}_{\text{con}} &= \{a_i \mid b_i < 0\} \cup \{a_i \mid b_i = 0 \land |\mathcal{C}_{\text{con}}| < |\mathcal{C}_{\text{pro}}|\}
\end{aligned}
$$

中立项（belief=0）分配到人数少的阵营，保持平衡。

### 13.4 论点提取

每方按置信度加权投票提取 Top-3 论点。论点 $a$ 的得分：

$$
\text{score}(a) = \sum_{i: a \in \text{args}(i)} c_i
$$

其中 $\text{args}(i)$ 是 Agent $i$ 推理文本中提取的论点集合，$c_i$ 是其置信度。

### 13.5 信念移位

质证回应中若包含承认词（"承认"、"同意"、"有道理"等），则向对方方向移位：

$$
\Delta b_i = \begin{cases}
(\bar{b}_{\text{opp}} - b_i) \cdot 0.2 & \text{如果有承认词} \\
0 & \text{否则}
\end{cases}
$$

### 13.6 综合裁决

加权信念 = 按阵营总置信度加权的双方平均信念：

$$
b_{\text{synth}} = \frac{\bar{b}_{\text{pro}} \cdot \sum_{i \in \mathcal{C}_{\text{pro}}} c_i + \bar{b}_{\text{con}} \cdot \sum_{i \in \mathcal{C}_{\text{con}}} c_i}{\sum_{i \in \mathcal{C}_{\text{pro}}} c_i + \sum_{i \in \mathcal{C}_{\text{con}}} c_i}
$$

若 $|\bar{b}_{\text{pro}} - \bar{b}_{\text{con}}| > 0.3$，保留分歧（dissentPreserved=true），生成少数派报告。

---

> **实现对应**：所有公式均在 `src/lib/` 中有 1:1 的代码实现。
> `src/lib/constants.ts` 包含所有可调参数的集中定义。
> `src/lib/evaluation/index.ts` 实现 §8（5 维评价）。
> `src/lib/governance/adaptiveThresholds.ts` 实现 §10。
> `src/lib/discussion/causalTrace.ts` 实现 §11（Dropout 敏感性分析）。
> `experiments/v2/analyze.ts` 实现统计推断（t 分布 CI + 置换检验，§7 实验验证）。
> `experiments/v2/sensitivity.ts` 实现参数敏感性扫描（§12 附录）。
> `src/lib/discussion/causalTrace.ts` 实现 §11（Dropout 敏感性分析）。
> `src/lib/governance/adaptiveDosage.ts` 实现 §12。
> `src/lib/discussion/crossExamination.ts` 实现 §13。

---

# 附录 B：社会热力学公式参考与代码索引

> 本节原为独立文档 THERMODYNAMICS_INTEGRATION.md，现已合并入 THEORY.md 以集中理论定义。

> 本文档为社会热力学框架的**数学定义、代码位置、架构设计**参考。
> 实验验证和阈值标定结果见 [README_CN.md](./README_CN.md) §异步引擎；局限性见 [LIMITATIONS.md](./LIMITATIONS.md) §22。

---

## 1. 为什么需要社会热力学

4 个检测器（echo chamber / authority bias / polarization / premature consensus）独立触发时，多个干预候选缺乏统一优先级。同一干预在不同系统状态下效果可能相反（如 `force_reflection` 在结构性无序时有效，在热性无序时反而有害）。

社会热力学提供 3 个状态变量作为"系统状态坐标系"：

| 变量 | 物理含义 | 系统含义 |
|------|---------|---------|
| **R**（序参量） | Kuramoto 同步度 | agent 信念方向同步程度 |
| **T**（温度） | 热运动幅度 | 信念分散程度（标准差，归一化） |
| **H**（熵） | 信息无序度 | 信念 bin 分布的不确定性 |

由 Helmholtz 自由能组合：**F = (1−R) + T·H**，其中 (1−R) 是结构性无序，T·H 是热性无序——两个正交的无序来源。

---

## 2. 数学定义与代码实现

### 2.1 Kuramoto 序参量 R

代码：[src/lib/governance/index.ts:532](./src/lib/governance/index.ts#L532)

```
θ = belief × π/2    (belief ∈ [-1,1] → θ ∈ [-π/2, π/2])
R = |Σ e^(iθ_j)| / N
```

**相位映射**（H4 修复）：θ = (π/2)·b 而非 θ = π·b。b=+1→+π/2, b=−1→−π/2——两者在单位圆上正对，R≈0（正确反映极化）。旧映射会使极端值落在同侧误判为共识。

### 2.2 Shannon 熵 H

代码：[src/lib/utils/statsUtils.ts:58](./src/lib/utils/statsUtils.ts#L58)

将 belief ∈ [-1,1] 分 5 bins，计算 H = −Σ p·log₂(p)，除以 log₂(5) 归一化到 [0,1]。H→0=全部同 bin，H→1=均匀分布。

### 2.3 温度 T 的归一化

代码：[src/lib/utils/statsUtils.ts:100](./src/lib/utils/statsUtils.ts#L100)

`normalizeTemperature(std, beliefRange)` 将标准差除以理论上界 (max−min)/2，显式归一化到 [0,1]。当前 belief∈[-1,1] 下数值不变（上界=1.0），但显式化是健壮性需要。

### 2.4 社会自由能 F

代码：[src/lib/utils/statsUtils.ts:110](./src/lib/utils/statsUtils.ts#L110)

```typescript
F = (1 - R) + T * H
//  U = 1-R  → 结构性无序（势能）
//  TS = T*H → 热性无序（耗散）
```

---

## 3. F 分解驱动的干预优先级排序（层 1，已实现）

### 核心映射

| 干预类型 | 对应的无序分量 | 作用机理 |
|---------|--------------|---------|
| `force_reflection` | thermal·(1−structural) | 降噪干预（回测证伪原 structural 假设，p=0.041） |
| `reduce_weight` | T·H（热性无序） | 压制高噪 agent 权重 |
| `introduce_diversity` | R·(1−H) | R 高 H 低→疑似虚假共识，注入多样性 |
| `continue_discussion` | R·(1−H)·(1−F) | 有序+低F+早期→过早收敛（实验证伪，已禁用） |

代码：[src/lib/governance/index.ts:554](./src/lib/governance/index.ts#L554) `rankInterventionsByFreeEnergy()`

调用点：[src/lib/governance/index.ts:877](./src/lib/governance/index.ts#L877)——在 `diagnoseAndIntervene` 返回前排序。

### 关键诚实声明

1. `force_reflection↔structural` 假设已被回测**证伪并修正**（97 次事件，p=0.041）：反思实为降噪干预，非对齐方向干预。已修正为 `thermal·(1−structural)`。
2. `reduce_weight↔thermal` 方向支持但不显著（p=0.100, d=+0.448）。
3. `introduce_diversity` 映射假设未回测，且存在根本盲区：R·(1−H) 无法区分"真共识"与"虚假共识"。
4. `continue_discussion` 已被实验证伪（0% 有效率），默认禁用。

### 层 2/3（实验室，未实现）

- **层 2**：任务难度感知门控——用 τ₁ + ΔF 轨迹调干预剂量（原"F 调阈值"设计已推翻）
- **层 3**：在线干预效果反馈——用 Δτ 经验性学到真/假共识边界，自动降权有害干预

---

## 4. 与检测器的联合关系

检测器识别"症状"（是否出现问题），F 分解识别"病机"（结构性 vs 热性无序），两者正交：

```
agent 信念 → 检测器层（症状） → F 分解层（病机+排序） → 执行层
```

---

## 5. 实验验证现状

| 内容 | 位置 |
|------|------|
| F 分解 A/B 检验（F 排序 vs 固定排序） | [TECHNICAL_REPORT.md](./TECHNICAL_REPORT.md) §5 |
| 权重假设回测（force_reflection 证伪） | [TECHNICAL_REPORT.md](./TECHNICAL_REPORT.md) §4 |
| 异步引擎热力学终止 + 阈值标定 | [README_CN.md](./README_CN.md) §异步引擎 |
| 已知局限 | [LIMITATIONS.md](./LIMITATIONS.md) §19-22 |
| 单元测试（32 个） | [test/governance.test.ts](./test/governance.test.ts) |

---

## 6. 文件索引

| 文件 | 作用 |
|------|------|
| [src/lib/utils/statsUtils.ts](./src/lib/utils/statsUtils.ts) | `shannonEntropy` / `normalizeTemperature` / `socialFreeEnergy` |
| [src/lib/governance/index.ts](./src/lib/governance/index.ts) | `computeKuramotoOrder` / `rankInterventionsByFreeEnergy` |
| [src/lib/evaluation/index.ts](./src/lib/evaluation/index.ts) | 评估引擎中的 R/H/F 计算 |
| [src/lib/thermodynamics/TerminationDecider.ts](./src/lib/thermodynamics/TerminationDecider.ts) | 异步讨论热力学终止决策器 |
| [src/lib/discussion/asyncEngine.ts](./src/lib/discussion/asyncEngine.ts) | 异步引擎中的热力学状态计算与终止循环 |
| [test/governance.test.ts](./test/governance.test.ts) | F 分解排序单元测试 |
| [test/stats-utils.test.ts](./test/stats-utils.test.ts) | 熵/温度/自由能单元测试 |

---

# 附录 C：形式化证明草稿（2026-07-20）

> **状态**：AI-assisted draft，pending human verification。
> 本附录对命题 1a/1b/1c/4 给出严格数学证明。命题 2/3/5/6/7/8 涉及 LLM 黑箱性质或启发式经验断言，保持"conjecture"标注，留待实验室合作者复核或反例寻找。
> **准则**：所有证明基于 §1 的符号定义和 [src/lib/utils/statsUtils.ts](./src/lib/utils/statsUtils.ts) 的实际实现。

## C.1 前置定义

设 $N \in \mathbb{N}^+$ 为 agent 数量，每个 agent 的信念 $b_i \in [-1, 1]$。定义相位映射 $\theta_i = \frac{\pi}{2} b_i \in [-\frac{\pi}{2}, \frac{\pi}{2}]$。Kuramoto 序参量定义为：

$$
R(b_1, \ldots, b_N) := \frac{1}{N} \left\| \sum_{i=1}^{N} e^{i\theta_i} \right\| = \frac{1}{N} \sqrt{ \left( \sum_{i=1}^{N} \cos\theta_i \right)^2 + \left( \sum_{i=1}^{N} \sin\theta_i \right)^2 }
$$

其中 $i = \sqrt{-1}$。记 $C := \sum_i \cos\theta_i$，$S := \sum_i \sin\theta_i$，则 $R = \frac{1}{N}\sqrt{C^2 + S^2}$。

## C.2 命题 1a 证明（完美共识 → R=1）

**命题 1a**：若 $b_1 = b_2 = \cdots = b_N = b^*$，则 $R = 1$。

**证明**：

当所有 $b_i$ 相等时，所有 $\theta_i = \theta^* = \frac{\pi}{2} b^*$ 相等。因此：

$$
C = \sum_{i=1}^{N} \cos\theta^* = N \cos\theta^*, \quad S = \sum_{i=1}^{N} \sin\theta^* = N \sin\theta^*
$$

$$
R = \frac{1}{N}\sqrt{N^2 \cos^2\theta^* + N^2 \sin^2\theta^*} = \frac{1}{N}\sqrt{N^2(\cos^2\theta^* + \sin^2\theta^*)} = \frac{N}{N} = 1
$$

最后一步用了 $\cos^2\theta + \sin^2\theta = 1$（Pythagorean 恒等式）。$\square$

**注**：本证明不依赖 $\theta^*$ 的具体值，因此对 $b^* \in [-1,1]$ 的任意取值均成立。

## C.3 命题 1b 证明（完美两极分化 → R=0 当且仅当偶数 N 完美对半）

**命题 1b**（完整充要条件）：$R = 0$ 当且仅当 $\sum_i \sin\theta_i = 0$ **且** $\sum_i \cos\theta_i = 0$。对于 $\theta_i \in [-\frac{\pi}{2}, \frac{\pi}{2}]$（半圆映射），由于 $\cos\theta_i \geq 0$，$\sum_i \cos\theta_i = 0$ 当且仅当每个 $\cos\theta_i = 0$，即每个 $\theta_i \in \{-\frac{\pi}{2}, +\frac{\pi}{2}\}$（对应 $b_i \in \{-1, +1\}$）。此时 $\sin(\pm\frac{\pi}{2}) = \pm 1$，所以 $\sum_i \sin\theta_i = 0$ 当且仅当 $+1$ 与 $-1$ 的数量相等，即 $N$ 为偶数且完美对半分。

**证明**：

($\Rightarrow$) 设 $R = 0$。则 $C^2 + S^2 = 0$，故 $C = 0$ 且 $S = 0$。

由于 $\theta_i \in [-\frac{\pi}{2}, \frac{\pi}{2}]$，有 $\cos\theta_i \in [0, 1]$。$C = \sum_i \cos\theta_i = 0$ 且每项非负，故每项 $\cos\theta_i = 0$，即 $\theta_i \in \{-\frac{\pi}{2}, +\frac{\pi}{2}\}$，对应 $b_i \in \{-1, +1\}$。

此时 $\sin\theta_i \in \{-1, +1\}$。$S = \sum_i \sin\theta_i = 0$ 要求 $+1$ 的个数等于 $-1$ 的个数。设 $n_+$ 为 $b_i = +1$ 的 agent 数，$n_-$ 为 $b_i = -1$ 的 agent 数，则 $n_+ = n_-$，故 $N = n_+ + n_- = 2n_+$ 为偶数，且完美对半分。

($\Leftarrow$) 设 $N$ 为偶数，$n_+ = n_- = N/2$，$b_i \in \{-1, +1\}$。则 $\theta_i \in \{-\frac{\pi}{2}, +\frac{\pi}{2}\}$，$\cos\theta_i = 0$，故 $C = 0$。$\sin(+\frac{\pi}{2}) = +1$，$\sin(-\frac{\pi}{2}) = -1$，故 $S = n_+ \cdot 1 + n_- \cdot (-1) = 0$。因此 $R = \frac{1}{N}\sqrt{0 + 0} = 0$。$\square$

**推论 1b.1**：若 $N$ 为奇数，则 $R > 0$ 对所有 $b \in [-1,1]^N$ 成立。

**证明**：由 C.3 的 ($\Rightarrow$) 方向，$R = 0$ 蕴含 $N$ 偶数。逆否命题：$N$ 奇数蕴含 $R > 0$。$\square$

**推论 1b.2**：若存在 $i$ 使 $|b_i| < 1$（即 $\theta_i \in (-\frac{\pi}{2}, +\frac{\pi}{2})$），则 $\cos\theta_i > 0$，故 $C > 0$，故 $R > 0$。

**证明**：$C = \sum_j \cos\theta_j \geq \cos\theta_i > 0$（因 $\cos\theta_j \geq 0$ 对所有 $j$）。故 $R = \frac{1}{N}\sqrt{C^2 + S^2} \geq \frac{C}{N} > 0$。$\square$

**数值验证**：$b = [+1, +1, -1, -1, 0]$。$\theta = [+\frac{\pi}{2}, +\frac{\pi}{2}, -\frac{\pi}{2}, -\frac{\pi}{2}, 0]$。$C = 0+0+0+0+1 = 1$，$S = 1+1-1-1+0 = 0$。$R = \frac{1}{5}\sqrt{1+0} = 0.2$。与 [TECHNICAL_REPORT.md 附录 A](./TECHNICAL_REPORT.md) 的脚本测试结果一致。

## C.4 命题 1c 证明（连续均匀分布极限 → 2/π）

**命题 1c**：设 $\theta$ 在 $[-\frac{\pi}{2}, +\frac{\pi}{2}]$ 上服从连续均匀分布。定义 $R_N := \frac{1}{N}\left\| \sum_{i=1}^{N} e^{i\theta_i} \right\|$，其中 $\theta_1, \ldots, \theta_N$ 独立同分布。则当 $N \to \infty$ 时，$R_N \xrightarrow{\text{a.s.}} \frac{2}{\pi}$。

**证明**：

由强大数律（Strong Law of Large Numbers, SLLN），当 $N \to \infty$ 时：

$$
\frac{C}{N} = \frac{1}{N}\sum_{i=1}^{N} \cos\theta_i \xrightarrow{\text{a.s.}} \mathbb{E}[\cos\theta] = \frac{1}{\pi} \int_{-\pi/2}^{\pi/2} \cos\theta \, d\theta = \frac{1}{\pi} [\sin\theta]_{-\pi/2}^{\pi/2} = \frac{1}{\pi}(1 - (-1)) = \frac{2}{\pi}
$$

$$
\frac{S}{N} = \frac{1}{N}\sum_{i=1}^{N} \sin\theta_i \xrightarrow{\text{a.s.}} \mathbb{E}[\sin\theta] = \frac{1}{\pi} \int_{-\pi/2}^{\pi/2} \sin\theta \, d\theta = \frac{1}{\pi} [-\cos\theta]_{-\pi/2}^{\pi/2} = \frac{1}{\pi}(0 - 0) = 0
$$

（$\sin\theta$ 在 $[-\frac{\pi}{2}, \frac{\pi}{2}]$ 上是奇函数，积分为 0。）

因此：

$$
R_N = \sqrt{\left(\frac{C}{N}\right)^2 + \left(\frac{S}{N}\right)^2} \xrightarrow{\text{a.s.}} \sqrt{\left(\frac{2}{\pi}\right)^2 + 0^2} = \frac{2}{\pi} \approx 0.6366
$$

$\square$

**注 1**：本证明给出的是**几乎必然收敛**（a.s.），比依概率收敛更强。

**注 2**：对于有限 $N$，$R_N$ 是随机变量。其期望 $\mathbb{E}[R_N]$ 一般不等于 $\frac{2}{\pi}$（Jensen 不等式，因 $\sqrt{\cdot}$ 凹）。有限 $N$ 下 $R_N$ 偏离 $\frac{2}{\pi}$ 的程度由 $\cos\theta_i$ 的方差决定：$\text{Var}(\cos\theta) = \mathbb{E}[\cos^2\theta] - (\mathbb{E}[\cos\theta])^2 = \frac{1}{2} - \frac{4}{\pi^2} \approx 0.0947$，标准差 $\approx 0.308$，故 $R_N$ 的波动以 $O(1/\sqrt{N})$ 速率衰减。

**注 3**：脚本测试中 $N=5$ 等距点 $b \in \{-1, -0.5, 0, 0.5, 1\}$ 给出 $R \approx 0.4828$，偏离 $\frac{2}{\pi} \approx 0.6366$。这是因为等距离散点不是均匀分布的独立样本，而是确定性格点。确定性 Riemann 和的收敛速率是 $O(1/N^2)$（Euler-Maclaurin），但 $N=5$ 时偏差仍显著。

## C.5 命题 4 证明（reduce_weight 不改变不动点存在性）

### C.5.1 模型设定

考虑信念更新方程（无噪声 $\varepsilon = 0$）：

$$
b_i^{(t+1)} = b_i^{(t)} + \alpha \sum_{j=1}^{N} w_{ij} (b_j^{(t)} - b_i^{(t)})
$$

其中 $\alpha \in (0, 1]$ 为学习率，$w_{ij} \geq 0$ 为 agent $j$ 对 agent $i$ 的影响权重。设权重矩阵 $W = (w_{ij}) \in \mathbb{R}^{N \times N}$ 非负。

**不动点** $b^* \in \mathbb{R}^N$ 满足 $b_i^{(t+1)} = b_i^{(t)}$，即：

$$
\sum_{j=1}^{N} w_{ij} (b_j^* - b_i^*) = 0, \quad \forall i = 1, \ldots, N
$$

等价于 $(W - \text{diag}(W \mathbf{1})) b^* = 0$，其中 $\mathbf{1}$ 为全 1 向量。即 $b^*$ 是 Laplacian 矩阵 $L := D - W$ 的零特征值对应的特征向量（$D = \text{diag}(W\mathbf{1})$ 是对角度矩阵）。

### C.5.2 不动点存在性

**引理 4.1**（Laplacian 零特征值）：对任意非负权重矩阵 $W$，Laplacian $L = D - W$ 有零特征值，对应特征向量 $\mathbf{1}$（全 1 向量）。

**证明**：$L\mathbf{1} = D\mathbf{1} - W\mathbf{1} = W\mathbf{1} - W\mathbf{1} = \mathbf{0}$。故 $\mathbf{1}$ 是 $L$ 的零特征值特征向量。$\square$

**推论 4.1**：不动点集合 $\mathcal{F}(W) := \{b^* : L b^* = 0\} = \text{span}(\mathbf{1}) \cap [-1, 1]^N$（若 $W$ 不可约，即对应图连通；若 $W$ 可约，则 $\mathcal{F}$ 维数等于连通分量数）。特别地，对所有 $b^* = c \cdot \mathbf{1}$（$c \in [-1, 1]$），$b^*$ 是不动点。

### C.5.3 reduce_weight 操作

**reduce_weight($a_k$)** 操作将 $w_{ik} \leftarrow \beta \cdot w_{ik}$ 对所有 $i \neq k$，其中 $\beta \in (0, 1)$。记操作后的权重矩阵为 $W'$，Laplacian 为 $L' = D' - W'$。

**命题 4**：reduce_weight($a_k$) 不改变不动点的**存在性**。

**证明**：

需证：$L'$ 仍有零特征值。

计算 $L' \mathbf{1}$：

$$
(L' \mathbf{1})_i = (D' \mathbf{1})_i - (W' \mathbf{1})_i = \sum_j w'_{ij} - \sum_j w'_{ij} = 0
$$

对所有 $i$ 成立（因 $D' = \text{diag}(W' \mathbf{1})$ 是对角度矩阵的定义）。故 $L' \mathbf{1} = \mathbf{0}$，$L'$ 仍有零特征值，不动点存在性保持。$\square$

**注**：本证明极其一般化——对**任意**非负权重矩阵的任意行/列缩放，Laplacian 的零特征值都不变。这是图论中的标准结果（Laplacian 的零特征值重数 = 连通分量数，与边权无关）。

### C.5.4 不动点位置的偏移

**命题 4'**（位置偏移）：reduce_weight($a_k$) 后，若 $W'$ 对应的图仍连通，则不动点集合 $\mathcal{F}(W') = \text{span}(\mathbf{1}) \cap [-1, 1]^N$，即**一维共识空间不变**。但收敛到的具体不动点 $b^* = c' \cdot \mathbf{1}$ 的值 $c'$ 依赖于初始条件和 $W'$，一般 $c' \neq c$。

**证明草图**：

收敛值 $c'$ 由初始信念的加权平均决定：$c' = \frac{\sum_i \pi_i b_i^{(0)}}{\sum_i \pi_i}$，其中 $\pi$ 是 $W'$ 的左 Perron 向量（满足 $\pi^T W' = \pi^T$，$\pi \geq 0$）。

reduce_weight($a_k$) 使 $\pi_k$ 相对降低（agent $k$ 在加权平均中的权重下降），故 $c'$ 向"无 $a_k$ 时的收敛值"靠拢。若 $b_k^{(0)}$ 远离其他 $b_i^{(0)}$（恶意 agent 情形），$c'$ 向诚实 agent 的均值靠拢，这正是 reduce_weight 有效的理论基础。

严格证明需用 Perron-Frobenius 定理 + 扰动分析，留作实验室合作者的复核工作。$\square_{\text{sketch}}$

## C.6 命题状态总结

| 命题 | 状态 | 证明类型 | 备注 |
|------|------|---------|------|
| 1a | ✅ 严格证明 | Pythagorean 恒等式 | C.2 |
| 1b | ✅ 严格证明（含充要条件） | 三角函数 + 非负性论证 | C.3，比原命题更强 |
| 1c | ✅ 严格证明 | 强大数律 + Riemann 积分 | C.4，给出 a.s. 收敛 |
| 4 | ✅ 严格证明（存在性） | Laplacian 零特征值 | C.5.3，图论标准结果 |
| 4' | ⚠️ 证明草图（位置偏移） | Perron-Frobenius 草图 | C.5.4，待严格化 |
| 2 | Conjecture | 经验观察 | R-H 互补性无严格阈值 |
| 3 | Conjecture | 充分性论证 | $R \geq 0.85$ 充分非必要 |
| 5 | Conjecture | 依赖 LLM 黑箱 | $f_{\text{reflect}}$ 无闭合形式 |
| 6 | Conjecture | Lyapunov 启发式 | 需 $\varepsilon = 0$ 假设 |
| 7 | Conjecture | 经验相关 | $r = -0.55$ 非因果 |
| 8 | Conjecture | 定性论证 | 目标选择 > 干预本身 |

## C.7 局限与诚实声明

1. **AI-assisted 草稿**：本附录由 AI 协助生成，证明的严格性需经人类数学背景合作者复核。特别是 C.5.4 的草图部分，Perron-Frobenius 的扰动分析需更细致的论证。

2. **命题 1b 的范围**：C.3 证明依赖半圆映射 $\theta \in [-\frac{\pi}{2}, \frac{\pi}{2}]$。若改用全圆映射 $\theta \in [-\pi, \pi]$，$\cos\theta$ 可取负值，证明不成立——这正是 H4 修复（从全圆改半圆）的理论依据。

3. **命题 4 的范围**：C.5.3 证明的是"存在性"不变。"位置偏移"（命题 4'）仅给出草图，因为 LLM 信念更新不是严格的线性系统（$\alpha$ 由 confidence 调制，$w_{ij}$ 时变）。

4. **未覆盖的命题**：2/3/5/6/7/8 涉及 LLM 黑箱、Lyapunov 函数单调性、经验相关性等，无法用纯数学证明。这些命题在论文中应明确标注为 "conjecture" 或 "empirical observation"，而非 "proposition"。

5. **代码一致性**：本证明基于 [src/lib/utils/statsUtils.ts](./src/lib/utils/statsUtils.ts) 和 [src/lib/governance/index.ts](./src/lib/governance/index.ts) 的实际实现。若代码修改（如改变相位映射），证明需重新验证。

---

---
## 4. 发言意愿公式的形式化分析（§4, 2026-07-21 新增）

### 4.1 动机

异步引擎的 `content_driven` 发言模式使用一个**分解打分函数**来决定每个 agent 是否发言、以什么顺序发言。该公式目前是手工设计的启发式——5 个因子、6 个权重、2 个阈值——未经文献支撑或经验校准。

本节给出该公式的完整数学定义、基本性质证明、参数的临界条件分析，以及全沉默兜底的触发概率。目标不是"证明公式最优"，而是将工程直觉转化为可分析、可批评的形式化对象。

### 4.2 符号定义

设在评估周期 $c \geq 1$，有 $N$ 个 agent $\mathcal{A} = \{a_1, \ldots, a_N\}$。

**基础状态变量**（由引擎维护，非本公式定义）：

| 符号 | 含义 | 值域 |
|------|------|------|
| $b_i(c) \in [-1, 1]$ | agent $i$ 当前信念 | $\mathbb{R}$ |
| $\mu(c) = \frac{1}{N}\sum b_i(c)$ | 群体信念均值 | $[-1, 1]$ |
| $K_i = \{k_1, \ldots, k_{m_i}\}$ | agent $i$ 独有信息关键词集合 | 字符串集 |
| $\mathcal{D}(c)$ | 讨论历史文本（截至周期 $c$） | 字符串 |
| $L_i(c) \in \mathbb{N}$ | agent $i$ 最近发言的周期编号 | $\mathbb{N}$ |

**发言意愿因子**（从基础状态导出）：

| 因子 | 定义 | 值域 |
|------|------|------|
| $\varepsilon_i(c)$ | 信息未曝光度：$1 - \frac{|K_i \cap \mathcal{D}(c)|}{|K_i|}$ | $[0, 1]$ |
| $\delta_i(c)$ | 信念变化幅度：$|b_i(c) - b_i(c-1)|$ | $[0, 2]$ |
| $\gamma_i(c)$ | 共识偏离度：$|b_i(c) - \mu(c)|$ | $[0, 2]$ |
| $d_i(c)$ | 依赖触发：$\mathbb{I}[\exists\text{ dep keyword in }\mathcal{D}(c)]$ | $\{0, 1\}$ |
| $r_i(c)$ | 近期发言：$\mathbb{I}[L_i(c) \geq c - w]$ | $\{0, 1\}$ |

其中 $w = 2$（`recentSpeakWindow`），$c = 0$ 时 $b_i(0)$ 为 agent 初始信念。

### 4.3 原始意愿分数

**定义 4.1**（原始意愿分数 Raw Willingness Score）

$$
W_{\text{raw}}(i, c) = \alpha_1 \cdot \varepsilon_i(c) + S_\delta(\delta_i(c)) + S_\gamma(\gamma_i(c)) + \alpha_6 \cdot d_i(c) - \alpha_7 \cdot r_i(c)
$$

其中阶梯函数 $S_\delta, S_\gamma$ 定义如下：

$$
S_\delta(x) = \begin{cases}
0.4 & \text{if } x > 0.3 \\
0.2 & \text{if } x > 0.1 \\
0 & \text{otherwise}
\end{cases}
\quad
S_\gamma(x) = \begin{cases}
0.4 & \text{if } x > 0.4 \\
0.2 & \text{if } x > 0.2 \\
0 & \text{otherwise}
\end{cases}
$$

**当前参数值**（代码常量，手工设定，未校准）：

| 参数 | 值 | 语义 |
|------|-----|------|
| $\alpha_1$ | 0.6 | 信息未曝光权重 |
| $\alpha_6$ | 0.3 | 依赖触发加成 |
| $\alpha_7$ | 0.3 | 近期发言惩罚 |
| $w$ | 2 | 近期发言窗口（周期数） |

**命题 9**（原始分数的值域）：
$$
W_{\text{raw}} \in [-0.3, 1.7]
$$

**证明**：
- 最大值：$\varepsilon_i = 1$（信息完全未曝光），$\delta_i > 0.3$（信念大变），$\gamma_i > 0.4$（共识偏离大），$d_i = 1$（依赖触发），$r_i = 0$（近期未发言）
  - $W_{\text{raw,max}} = 0.6 \cdot 1 + 0.4 + 0.4 + 0.3 - 0 = 1.7$
- 最小值：$\varepsilon_i = 0$（信息已全部曝光），$\delta_i \leq 0.1$（无信念变化），$\gamma_i \leq 0.2$（接近共识），$d_i = 0$（无依赖触发），$r_i = 1$（刚发过言）
  - $W_{\text{raw,min}} = 0.6 \cdot 0 + 0 + 0 + 0 - 0.3 = -0.3$

∎

**推论 9.1**（近期发言惩罚不足以压低分数至信息全部曝光场景）：agent 刚发过言时 $r_i = 1$，即使其他因子均为 0，$W_{\text{raw}} = -0.3$。但若此时 agent 仍有未曝光信息（$\varepsilon_i > 0$），$W_{\text{raw}} \geq -0.3 + 0.6\varepsilon_i$，可能仍为正。这说明**信息分享的责任优先于发言节制**——这是设计选择，非数学必然。

### 4.4 归一化意愿分数

**定义 4.2**（归一化意愿分数 Normalized Willingness）

$$
W(i, c) = \frac{\tanh(W_{\text{raw}}(i, c)) + 1}{2} \in [0, 1]
$$

**命题 10**（归一化分数的值域与临界值）：
在当前参数下，
$$
W_{\min} \approx 0.3556, \quad W_{\max} \approx 0.9677
$$

**证明**：
- $\tanh(-0.3) = \frac{e^{-0.3} - e^{0.3}}{e^{-0.3} + e^{0.3}} \approx -0.2913$ → $W_{\min} = (1 - 0.2913)/2 \approx 0.3544$
- $\tanh(1.7) \approx 0.9354$ → $W_{\max} = (1 + 0.9354)/2 \approx 0.9677$

∎

**关键观察**：$W_{\min} \approx 0.356 > \theta_{\text{weak}} = 0.3$。这意味着**在当前参数下，任何 agent 的归一化意愿分数永远不会低于"沉默阈值"**——每个 agent 在每个周期都至少有概率发言。实际发言控制交由 `maxSpeakersPerEval`（上限 5）和加权随机抽样的竞争来实现。

这个性质的**副作用**：即使是"应该沉默"的 agent（信息完全曝光 + 无新观点 + 刚发过言），$W \approx 0.356$ 仍会进入加权随机池，在低竞争场景下（其他 agent 分数也低）有非零概率被选中。这是讨论中"噪音发言"的来源之一。

### 4.5 发言者选择协议

**定义 4.3**（发言者选择协议 Speaker Selection Protocol）

对于周期 $c$，给定所有 agent 的归一化意愿 $\{W(i, c)\}_{i=1}^N$：

1. **强制发言集**：$\mathcal{S}_{\text{must}} = \{i \mid W(i, c) \geq \theta_{\text{strong}}\}$，其中 $\theta_{\text{strong}} = 0.7$
2. **候选池**：$\mathcal{S}_{\text{maybe}} = \{i \mid \theta_{\text{weak}} \leq W(i, c) < \theta_{\text{strong}}\}$，其中 $\theta_{\text{weak}} = 0.3$
3. **加权随机**：对每个 $i \in \mathcal{S}_{\text{maybe}}$，以概率 $p_i = \frac{W(i, c) - \theta_{\text{weak}}}{\theta_{\text{strong}} - \theta_{\text{weak}}}$ 入选
4. **兜底**：若 $\mathcal{S}_{\text{must}} \cup \text{入选者} = \emptyset$，选 $\arg\max_i W(i, c)$
5. **上限截断**：总入选人数 $\leq K_{\max} = 5$，按 $W$ 降序取前 $K_{\max}$ 人
6. **顺序**：入选者按 $W$ 降序发言（高意愿先说）

**命题 11**（兜底条件的可达性）：在当前参数下，$\mathcal{S}_{\text{must}}$ 为空且 $\mathcal{S}_{\text{maybe}}$ 全部未通过加权随机抽样的概率非零。此时兜底机制选择 $\arg\max_i W(i, c)$——即"最不沉默"的 agent。

**证明**：$W_{\min} \approx 0.356 < \theta_{\text{strong}} = 0.7$ 恒成立（命题 10），所以 $\mathcal{S}_{\text{must}}$ 在 $\max_i W_{\text{raw}}(i, c) < \tanh^{-1}(2\theta_{\text{strong}} - 1) \approx 0.424$ 时为空。当 $\max_i W_{\text{raw}} < 0.424$ 时，所有 agent 均落入 $\mathcal{S}_{\text{maybe}}$，每个 agent 以概率 $p_i < \frac{0.7 - 0.3}{\theta_{\text{strong}} - \theta_{\text{weak}}}$ 入选。所有 agent 同时不入选的概率 $> 0$。∎

**推论 11.1**（讨论不死的保证）：兜底机制保证了**每轮至少有一人发言**——异步引擎不能因"所有人沉默"而停滞。这是讨论收敛性的必要条件。

### 4.6 因子独立性分析

**命题 12**（因子并非严格独立）：$\delta_i(c)$（信念变化）与 $\gamma_i(c)$（共识偏离）存在非零互信息，但非函数依赖。

**论证**（非严格证明）：agent $i$ 的信念变化 $\delta_i(c)$ 可能来自两个方向：(a) 向群体均值靠拢（$\gamma_i$ 减小）；(b) 远离群体均值（$\gamma_i$ 增大）。这两种情况下 $\delta_i$ 均增大，但 $\gamma_i$ 变化方向相反。因此给定 $\delta_i(c)$ 的值无法确定 $\gamma_i(c)$，反之亦然。但两个量均依赖 $\{b_i(c), b_i(c-1), \mu(c)\}$，存在统计相关性。∎

**设计含义**：$\delta_i$ 和 $\gamma_i$ 捕捉了不同的发言动机——"我学到了新东西"（信念变化）vs "我与群体意见不同"（共识偏离）——它们的非严格独立性说明这两个因子不完全冗余，但存在重叠信号。若未来从数据学习权重，需考虑共线性。

### 4.7 $\tanh$ 归一化 vs 替代方案

**命题 13**（$\tanh$ 归一化的导数性质）：$W = \frac{\tanh(x) + 1}{2}$ 在 $x = 0$ 附近近似线性，在 $|x| \gg 1$ 时饱和。具体而言：

- 在 $x = 0$ 处：$W \approx 0.5$，$W' = \frac{1}{2\cosh^2(0)} = 0.5$（斜率最大）
- 在 $x = 1.7$ 处：$W \approx 0.968$，$W' \approx 0.063$（接近饱和）
- 在 $x = -0.3$ 处：$W \approx 0.356$，$W' \approx 0.459$（远未饱和）

**推论 13.1**（正常意愿区间的近似线性）：在常见操作区间 $W_{\text{raw}} \in [-0.3, 1.0]$，$\tanh$ 接近线性映射 $W \approx 0.5 + 0.5W_{\text{raw}}$（线性回归 $R^2 > 0.97$）。这意味着 $\tanh$ 归一化在该区间内退化为简单的线性缩放——其非线性饱和区 $|W_{\text{raw}}| \gg 1$ 在正常操作中几乎不会被访问。

**设计含义**：在当前参数下，$\tanh$ 归一化的主要效果是**将值域从 $[-0.3, 1.7]$ 映射到 $[0.356, 0.968]$**，而非提供非线性变换。如果用线性截断（`clamp(W_raw / 2 + 0.5, 0, 1)` ），结果近似相同。$\tanh$ 的好处是无限可微——这对将来可能的梯度优化有用，但对当前纯手工参数无实质影响。

### 4.8 发言意愿公式在 A2A 协议栈中的位置

A2A 协议定义了 agent 之间的**发现（Agent Card）、委托（tasks/sendMessage）、返回（Artifact）**三层。发言意愿公式解决的是**A2A 没有定义的第四层：给定已发现的一组 agent、已建立的消息通道，每个 agent 如何自主决定参与度**。

```
┌─────────────────────────────┐
│  A2A 协议（Linux Foundation）│
│  ✅ Agent Card（能力声明）    │
│  ✅ Task 状态机（任务管理）   │
│  ✅ 认证/JWS（安全边界）     │
│  ❌ 多 agent 对话中的发言决策 │  ← 明确留给应用层
├─────────────────────────────┤
│  SwarmAlpha 发言意愿层       │
│  5因子分解 + tanh归一化       │
│  + 阈值门控 + 上限截断       │
│  = 去中心化发言决策          │
└─────────────────────────────┘
```

A2A Agent Card 当前没有 `speakPolicy` 字段。本节分析的公式是**对 A2A 协议能力声明的候选扩展**——未来 Agent Card 可以用类似的因子化描述来声明一个 agent 在群体讨论中的参与策略，就像它现在用 `skills` 声明功能能力一样。

---

### 4.9 文献对齐：发言选择机制对比

以下对比基于开发者文档、论文摘要和代码分析整理。各工作中"发言决策"的层级不同——有的在 agent 内部（去中心化），有的在框架协调器（中心化）。

| 维度 | **SwarmAlpha** content_driven | **MMAgents** (Nonomura & Mori, 2025) | **AutoGen** SelectorGroupChat (MS, 2025) | **LangChain** Bidding | **YES AND** (Ghosh & Rintel, 2025) |
|------|------|------|------|------|------|
| **参考文献** | 本文 | [Frontiers in AI, 2025](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1582287/full) | [microsoft.github.io/autogen](https://microsoft.github.io/autogen/0.4.9/user-guide/agentchat-user-guide/selector-group-chat.html) | LangChain Cookbook (2024) | CHI 2025 |
| **决策位置** | 每个 agent 独立计算 | 自选($S_{\text{self}}$) + 当前说话人指定($S_{\text{next}}$) | 中心化 LLM 选择器 | 每个 agent 出价 + 仲裁者选最高 | 置信度驱动自选 |
| **核心机制** | 5因子加权 → $\tanh$ 归一化 → 阈值门控 | 对话分析邻接对 + `think()` 输出重要性(0-9) | LLM 读对话全文 → 输出下一个发言人名字 | LLM 问每个 agent "你多相关?" → 选最高出价 | agent 评估自身置信度 → 自主决定是否发言 |
| **数学可分析性** | ✅ 闭式形式，因子可独立求导 | ❌ LLM 黑箱（`think()` 输出重要性值） | ❌ LLM 黑箱 | ❌ LLM 黑箱 | ❌ 闭式形式但仅置信度一维 |
| **因子数量** | 5（信息、信念Δ、共识偏离、依赖、发言惩罚） | ~3（任务重要性、对话历史、性格设定） | 无分解——统一给 LLM | 1（相关性竞价） | 1（置信度） |
| **权重来源** | 手工设定（未校准） | LLM 隐性（prompt 中隐含） | LLM 隐性 | LLM 隐性 | 手工设定 |
| **去中心化程度** | ✅ 完全去中心化（无协调者） | 🟡 半中心化（CSSN 需当前说话人判断） | ❌ 完全中心化（LLM 选择器） | ❌ 中心化（仲裁者） | ✅ 去中心化 |
| **发言顺序** | 意愿降序（高意愿先） | 邻接对约束 + 自选顺序 | 每次只选一人发言 | 每次只选一人发言 | 先到先得 |
| **兜底机制** | $\arg\max$ 选 1 人 | 如无人自选，当前说话人继续 | LLM 总选一人 | 随机打破平局 | 无明确兜底 |
| **多实验验证** | ✅ 异步 ABCD 四组 n=40 | ✅ 谋杀谜题任务 | ✅ 与固定轮次对比 | ❌ 仅演示级 | ❌ 仅用户研究 |
| **门槛** | 低（纯数学计算，无额外 LLM 调用） | 中（`think()` 需 LLM 调用） | 高（每次选发言人要 LLM 调用） | 高（每个 agent 出价要 LLM 调用） | 低 |

**SwarmAlpha 的差异点**（诚实定性）：
1. **结构优势**：去中心化 + 数学可分析 + 零额外 LLM 成本——这三个属性组合在文献中**目前没有等价物**
2. **短板**：权重未校验、因子集可能不完整、仅在一个模型上验证
3. **与 MMAgents 的互补性**：MMAgents 的邻接对机制（CSSN）可以补 SwarmAlpha 的依赖触发——当前 $d_i(c)$ 只是一个布尔加成，不如 MMAgents 的"问题→回答"配对来得精确

---

### 4.10 开放问题

1. **权重学习**：给定讨论质量和发言者选择的标注数据，能否通过最大熵逆强化学习从观察中恢复最优 $\alpha$ 和阈值？
2. **因子完备性**：当前 5 因子是否覆盖了所有显著影响发言意愿的维度？$W_{\min} > \theta_{\text{weak}}$ 意味着"沉默"在当前系统中只是概率性的，不是决定性的——是否应该考虑加入"不发言"的加分项（如 $-\beta \cdot \mathbb{I}[\text{nothing new to say}]$）？
3. **A2A 集成**：如果将发言意愿公式嵌入 Agent Card 的 `speakPolicy` 字段，不同组织的 agent 如何以不泄露内部状态的方式协商发言策略？
4. **对抗鲁棒性**：恶意 agent 可以通过调高自己的信息未曝光度（假装有新信息）来抢占发言权——当前公式没有身份验证维度。如何在不依赖全局信任的前提下检测"撒谎者"？

---

**版本**：v0.2（2026-07-21，新增 §4 发言意愿公式形式化分析）
**作者**：AI-assisted draft
**状态**：待北大实验室合作者审阅
**准则**：以假装理解为耻，以诚实无知为荣
