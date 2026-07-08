# SwarmAlpha Mathematical Framework

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

高 $\alpha_{\text{round}}$ → Agent 在多轮中维持一致的相对信念排名。低 $\alpha$ → 信念排名在轮次间剧烈波动。

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
> `experiments/v2/analyze.ts` 实现 Bootstrap 统计推断（§7 实验验证）。
> `experiments/v2/sensitivity.ts` 实现参数敏感性扫描（§12 附录）。
> `src/lib/discussion/causalTrace.ts` 实现 §11（Dropout 敏感性分析）。
> `src/lib/governance/adaptiveDosage.ts` 实现 §12。
> `src/lib/discussion/crossExamination.ts` 实现 §13。
