# SwarmAlpha 理论验证报告（Theory Validation Report）

**角色：** Computational Social Science / Complex Systems / Multi-Agent Systems / AI Governance 研究科学家
**状态：** 验证框架设计完成，验证实验尚未执行
**日期：** 2026-07-24

---

## 第一部分：核心理论假设（Theory Hypotheses）

SwarmAlpha 的核心主张是：**五维认知状态空间 {Utility, Evidence, Inertia, Confidence, Susceptibility} 比标量 Belief 模型具有更强的解释能力。** 以下将这一主张分解为可验证的假设。

### H1：Utility 稳定性假设（State Stability）

**H1₀（零假设）：** Utility 向量与标量 Belief 的逐轮变化幅度无显著差异。
**H1₁（备择假设）：** Utility 向量比标量 Belief 更稳定（方差更小），因为 Utility 将偏好结构从噪声中分离出来。

**直觉：** 标量 Belief 将偏好变化、信心变化、策略性表达变化混为一谈。Utility 只编码偏好排序，因此应当更稳定——当 agent 的真正偏好不变时，Utility 不应波动。

**可观测度量：** 
- `σ²(ΔU)` = 单轮 Utility 变化（L2 距离）的方差
- `σ²(ΔB)` = 单轮标量 Belief 变化的方差
- 稳定性比 = `σ²(ΔB) / σ²(ΔU)`

**预期：** 稳定性比 > 1.0（Utility 比 Belief 更稳定），且 p < 0.05（置换检验）。

### H2：Evidence 对 Opinion Change 的解释力（Evidence Explanatory Power）

**H2₀：** Evidence 的变化（ΔE）与 Utility 的变化（ΔU）之间无显著相关性。
**H2₁：** Evidence 的变化（ΔE）与 Utility 的变化（ΔU）之间存在显著正相关，且 Evidence 的解释力优于 Belief 模型中的 confidence 对 Δbelief 的解释力。

**直觉：** 在认知科学中，观点改变主要由新证据驱动。如果 Evidence 是有效的状态变量，那么 ΔE（信息增益）应当预测 ΔU（偏好改变）。在标量 Belief 模型中，没有变量可以捕捉这一机制。

**可观测度量：**
- 回归模型：`ΔU_i(t) = β₀ + β₁ · ΔE_i(t).coverage + β₂ · ΔE_i(t).recentGain + ε`
- R² 与简化模型 `ΔB_i(t) = β₀ + β₁ · Δconfidence_i(t) + ε` 的 R² 比较
- 增量 R²（ΔR²） = R²_evidence - R²_confidence

**预期：** ΔR² > 0.10（Evidence 模型解释力显著优于 confidence 模型），且 β₁ > 0, p < 0.05。

### H3：Inertia 对 Authority Bias 的解释力（Inertia → Authority Bias）

**H3₀：** Inertia 与权威偏差（Authority Bias）的检测结果之间无显著关联。
**H3₁：** 高 Inertia agent 在权威偏差事件中扮演关键角色——高 Inertia agent 更可能成为"主导 agent"（dominant agent），而低 Inertia agent 更易受其影响。

**直觉：** 权威偏差的根源是：某些 agent 过度坚持自己的立场（高 Inertia），而其他 agent 过度接受（高 Susceptibility）。如果 Inertia 捕捉了"固执"的认知维度，那么它应当能够预测谁会成为权威偏差中的主导者。

**可观测度量：**
- 高 Inertia agent（top 33%）被检测为 dominantAgent 的概率
- 低 Inertia agent（bottom 33%）被检测为 authority bias 目标 agent 的概率
- 逻辑回归：`P(dominantAgent_i) = σ(β₀ + β₁ · I_i(t))`

**预期：** β₁ > 0, p < 0.05（Inertia 显著预测权威偏差主导者），且 AUC > 0.65。

### H4：Confidence 对观点改变的预测力（Confidence Predictive Power）

**H4₀：** Confidence 与下一轮 Utility 变化幅度之间无显著关联。
**H4₁：** Confidence 负向预测下一轮 Utility 变化幅度——低 Confidence 的 agent 更可能在下轮改变 Utility。

**直觉：** Confidence 是 agent 对自身立场的确定性。如果 Confidence 是有效的派生变量，它应当预测 agent 未来的"可塑性"：不确定的 agent 更可能改变立场。

**可观测度量：**
- 回归：`|ΔU_i(t+1)| = β₀ + β₁ · C_i(t) + ε`
- 与 Belief 模型中的 `|ΔB_i(t+1)| = β₀ + β₁ · confidence_i(t) + ε` 比较

**预期：** β₁ < 0（Confidence 越高，变化越小），p < 0.05。Cognitive model 的 |β₁| > Belief model 的 |β₁|（Cognitive model 的 Confidence 预测力更强）。

### H5：Governance 通过 Evidence 而非 Belief 发挥作用（Governance Mechanism）

**H5₀：** 治理干预对 Evidence 的修改与对 Utility 的修改之间无显著关联。
**H5₁：** 治理干预（introduce_diversity）通过增加 Evidence 间接影响 Utility，而非直接改变 Belief。干预效果在 Evidence 维度上可观测，在单独 Belief 维度上不可观测。

**直觉：** 当前 Belief 模型中，治理干预直接修改标量 Belief——无法区分"干预改变了 agent 的偏好"还是"干预改变了 agent 的信息状态"。在 Cognitive 模型中，introduce_diversity 注入 Evidence 条目，Utility 的变化是 agent 自主处理新证据后的结果。这提供了更清晰的因果链。

**可观测度量：**
- 干预前后 ΔE 与 ΔU 的交叉滞后相关性：`corr(ΔE(t), ΔU(t+1))` vs `corr(ΔU(t), ΔE(t+1))`
- Granger 因果检验：Evidence → Utility 的 F 统计量 vs Utility → Evidence 的 F 统计量
- 中介分析：Evidence（中介变量）在干预 → Utility 路径中的间接效应

**预期：** Evidence → Utility 的 Granger F 显著大于 Utility → Evidence 的 F。Evidence 的中介效应显著（间接效应 p < 0.05）。

### H6：Cognitive State 的解耦性（Decoupling Hypothesis）

**H6₀：** Utility、Evidence、Inertia 之间存在高度共线性（corr > 0.7），五维分解无实际意义。
**H6₁：** Utility、Evidence、Inertia 之间的相关性显著低于 Belief 与 confidence 之间的相关性。五维分解提供了独立的信息维度。

**直觉：** 如果三个隐变量高度相关，那么五维分解只是增加了复杂度而没有增加信息。我们预测：标量 Belief 与 confidence 高度相关（因为它们都从 LLM 的同一输出中提取），而 Utility、Evidence、Inertia 之间的相关性显著更低。

**可观测度量：**
- 成对相关矩阵：{U, E, I, C, Λ} vs {B, confidence}
- 方差膨胀因子（VIF）：用于检测多重共线性
- 条件数（Condition Number）：状态空间矩阵的奇异值比

**预期：** Cognitive 状态空间的最大成对相关 < 0.5，而 Belief 与 confidence 的成对相关 > 0.7。VIF 全部 < 2.0。

### H7：Detector 准确性提升（Detector Accuracy Improvement）

**H7₀：** 基于 Cognitive State 的检测器与基于标量 Belief 的检测器在检测准确率上无显著差异。
**H7₁：** 基于 Cognitive State 的检测器具有更高的检测准确率（更低的假阳性率）。

**直觉：** 当前 Echo Chamber 检测器基于 belief 相似度——但两个 agent 可以有相同 belief 但不同证据（不是回音室），或不同 belief 但相同证据（是回音室）。基于 Evidence 的检测器可以区分这两种情况。

**可观测度量：**
- 每个检测器的假阳性率（FPR）和假阴性率（FNR）
- 人工标注的 ground truth（20 个实验场景）vs 检测器输出
- F1 分数比较

**预期：** Cognitive 检测器的 F1 > Belief 检测器的 F1 + 0.10。

### H8：Susceptibility 的中介作用（Susceptibility Mediation）

**H8₀：** Susceptibility（Λ）在 Inertia → Utility 变化路径中无显著中介效应。
**H8₁：** Susceptibility 完全中介 Inertia 对 Utility 变化的影响（Inertia → Susceptibility → ΔU）。

**直觉：** 理论设计是：I + C → Λ → ΔU。即 Inertia 和 Confidence 通过 Susceptibility 间接影响 Utility 的改变。如果这一中介路径成立，则证明派生变量 Λ 具有实际意义，而非冗余计算。

**可观测度量：**
- 中介分析：`ΔU = c · I + b · Λ + ε`，其中 `Λ = a · I + ε`
- 直接效应（c'）vs 间接效应（a × b）
- Sobel 检验或 Bootstrap 中介检验

**预期：** 间接效应 a × b 显著（p < 0.05），直接效应 c' 不显著（完全中介）。Λ 的解释力（R²_mediation）> 0.30。

---

## 第二部分：验证矩阵（Theory Validation Matrix）

| Theory | Observable Metric | Experiment Design | Expected Result | Conclusion |
|--------|------------------|-------------------|-----------------|------------|
| **H1:** Utility 更稳定 | σ²(ΔU) vs σ²(ΔB) | 同一批实验数据，分别计算两种状态空间的逐轮变化方差 | σ²(ΔB) / σ²(ΔU) > 1.0, p < 0.05 | Utility 比 Belief 更稳定，证明了偏好与噪声的分离 |
| **H2:** Evidence 解释 Opinion Change | ΔR² (Evidence vs confidence) | 回归模型比较，同一批数据 | ΔR² > 0.10, β₁ > 0, p < 0.05 | Evidence 比 confidence 更好地解释了观点改变 |
| **H3:** Inertia 解释 Authority Bias | 逻辑回归 AUC | 提取所有 authority bias 事件，编码为分类任务 | AUC > 0.65, β₁ > 0, p < 0.05 | Inertia 可以预测权威偏差的主导者 |
| **H4:** Confidence 预测观点改变 | 回归系数 β₁（负向） | 时间序列回归，C(t) → |ΔU(t+1)| | β₁ < 0, p < 0.05, |β₁_cognitive| > |β₁_belief| | Cognitive Confidence 的预测力更强 |
| **H5:** Governance 通过 Evidence 作用 | Granger F 统计量 | 交叉滞后相关 + Granger 因果检验 | Evidence → Utility F > Utility → Evidence F, p < 0.05 | 治理改变了 Evidence，agent 自主更新了 Utility |
| **H6:** 状态解耦 | 最大成对相关 + VIF | 相关矩阵分析 | Cognitive 最大 r < 0.5, Belief 最大 r > 0.7 | 五维分解提供了独立信息维度 |
| **H7:** Detector 准确性 | F1 分数差异 | 20 场景人工标注 ground truth | F1_cognitive > F1_belief + 0.10 | Cognitive 检测器更准确 |
| **H8:** Susceptibility 中介 | 间接效应 a×b | Bootstrap 中介分析 | 间接效应显著，直接效应不显著 | Susceptibility 是有效的派生变量 |

---

## 第三部分：验证数据集分析（Validation Dataset）

### 3.1 现有数据（445 个实验）

| 数据目录 | 实验数 | 任务 | 引擎 | 变量 |
|---------|--------|------|------|------|
| `data/` | 105 | M&A | DiscussionEngine（同步） | belief, confidence, tau, interventions |
| `data_crisis/` | ~105 | Crisis | DiscussionEngine（同步） | belief, confidence, tau, interventions |
| `data_supplier/` | ~105 | Supplier | DiscussionEngine（同步） | belief, confidence, tau, interventions |
| `data_invest/` | ~70 | Invest | DiscussionEngine（同步） | belief, confidence, tau, interventions |
| `data_async_*/` | ~60 | Fraud | AsyncDiscussionEngine | belief, confidence, tau, thermo |

### 3.2 现有数据的局限性

| 局限 | 严重程度 | 说明 |
|------|---------|------|
| **零 Cognitive State 数据** | 严重 | 所有 445 个实验仅在标量 Belief 模型下运行。没有任何实验使用 `useCognitiveState=true`。Cognitive State 变量（U, E, I, C, Λ）不存在于任何生产数据中。 |
| **无 Evidence 记录** | 严重 | 现有 JSON 文件不记录 evidence 条目、inertia 值、susceptibility 值。只有 `beliefs` 和 `confidences`（标量）。 |
| **无 Utility 历史** | 严重 | 没有 `utilityHistory` 字段。无法进行逐轮 Cognitive State 分析。 |
| **LLM 输出不完整** | 中 | 原始 LLM 回复中的 `evidence[]` 和 `itemBeliefs[]` 已丢失。JSON 文件只存储了后处理结果。 |
| **无原始对话文本** | 中 | JSON 文件不存储 agent 的完整回复文本。无法重新提取 evidence 或 itemBeliefs。 |
| **仅同步引擎** | 中 | Async 实验（~60 个）在 AsyncEngine 中运行，完全不支持 Cognitive State。 |

### 3.3 结论：现有数据不足

**现有 445 个实验数据无法用于验证 Cognitive State Space 的任何假设。** 原因如下：

1. 所有数据在标量 Belief 模型下生成，Cognitive State 从未被记录
2. 原始 LLM 输出（evidence 字符串、itemBeliefs）已丢失
3. 无法对现有数据进行"事后 Cognitive State 提取"——因为缺少原始 LLM 回复

**需要新增的实验数据类型：**

| 实验类型 | 数量 | 目的 | 优先级 |
|---------|------|------|--------|
| **Cognitive State Log** | 50 次运行 × 1 任务 | 记录完整的逐轮 Cognitive State（U, E, I, C, Λ） | P0 |
| **Belief vs Cognitive 对比** | 50 次运行 × 2 模式 | 同一任务、同一配置，分别运行 Belief 和 Cognitive 模式 | P0 |
| **原始 LLM 输出** | 上述全部 | 存储完整 LLM 回复（含 evidence[], itemBeliefs[], reasoning） | P0 |
| **Multi-task** | 3 任务 × 50 次 | 验证跨任务鲁棒性 | P1 |
| **Governance 干预日志** | 上述全部 | 记录每次干预的 pre/post 状态 | P0 |

**最少新增实验数：** 150 次运行（50 Belief + 50 Cognitive + 50 Cross-task）

---

## 第四部分：Benchmark 设计（Belief Runtime vs Cognitive Runtime）

### 4.1 Benchmark 维度

| 维度 | 定义 | 度量 | Belief 模型如何测量 | Cognitive 模型如何测量 |
|------|------|------|-------------------|---------------------|
| **State Stability** | 状态变量的逐轮波动程度 | σ²(Δ) | σ²(Δbelief) | σ²(L2(ΔU)) |
| **Interpretability** | 状态变化可被归因的比例 | 可归因 Δ / 总 Δ | 无归因（标量不可分解） | ΔU = Evidence效应 + Inertia效应 + Social效应 |
| **Detector Accuracy** | 检测器 F1 分数 | F1 = 2PR/(P+R) | 基于 belief 的检测器 | 基于 Evidence/Utility 的检测器 |
| **Governance Effect** | 干预有效比例 | 有效干预 / 总干预 | 基于 belief 变化 | 基于 Evidence 变化 → Utility 变化 |
| **Consensus Quality** | 群体决策的 Kendall τ | τ 值 | 标准 τ | 标准 τ（相同） |
| **Opinion Diversity** | 观点的真实多样性 | 双峰系数 + 香农熵 | 仅 belief 方差 | Utility 向量双峰系数 + Evidence 多样性 |
| **Explainability** | 可解释的方差比例 | 总 R²（回归模型） | R²(ΔB ~ Δconfidence) | R²(ΔU ~ ΔE + I + Λ) |
| **Robustness** | 跨任务一致性 | 跨任务 τ 的变异系数 | CV(τ) | CV(τ) |
| **Reproducibility** | 同 seed 重复运行的一致性 | 同 seed 的 τ 标准差 | σ(τ) within seed | σ(τ) within seed |

### 4.2 Benchmark 实验设计

**实验：** 同一任务、同一 seed、同一 agent 配置，分别运行 Belief 模式和 Cognitive 模式。

```
对照组（Belief Runtime）：
  - 使用 DiscussionEngine（标量 belief 更新）
  - 记录：belief, confidence, tau, interventions

实验组（Cognitive Runtime）：
  - 使用带 Cognitive State 的 Runtime
  - 记录：U, E, I, C, Λ, tau, interventions
  - 同时导出 belief（用于兼容比较）

配置：50 次运行 × 5 种 seed × 1 任务 = 250 组对比数据
```

### 4.3 Benchmark 报告格式

| 维度 | Belief Runtime | Cognitive Runtime | Δ | p-value | 胜者 |
|------|---------------|-------------------|-----|---------|------|
| State Stability | μ ± σ | μ ± σ | — | — | — |
| Interpretability | μ ± σ | μ ± σ | — | — | — |
| Detector Accuracy | μ ± σ | μ ± σ | — | — | — |
| ... | ... | ... | ... | ... | ... |

---

## 第五部分：评估流水线（Evaluation Pipeline）

### 5.1 流水线架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EVALUATION PIPELINE                              │
│                                                                         │
│  [1] Simulation                                                         │
│       │                                                                 │
│       ├── Belief Runtime    ──→ raw_belief/*.json                       │
│       └── Cognitive Runtime ──→ raw_cognitive/*.json                    │
│                                                                         │
│  [2] State Extraction                                                   │
│       │                                                                 │
│       ├── From raw_belief:    {B, confidence, tau}_t                    │
│       └── From raw_cognitive: {U, E, I, C, Λ, tau}_t                    │
│                                                                         │
│  [3] State Log (HDF5/Parquet)                                           │
│       │                                                                 │
│       └── state_log.parquet                                             │
│           columns: [run_id, mode, round, agent_id,                      │
│                     U_scores, E_coverage, E_quality, I_strength,        │
│                     C_overall, Λ, B]                                    │
│                                                                         │
│  [4] Metric Computation                                                 │
│       │                                                                 │
│       ├── H1: State Stability       → stability_metrics.json            │
│       ├── H2: Evidence Explanatory  → evidence_regression.json          │
│       ├── H3: Inertia → Authority   → inertia_authority.json            │
│       ├── H4: Confidence Predictive → confidence_prediction.json        │
│       ├── H5: Governance Mechanism  → governance_mediation.json         │
│       ├── H6: State Decoupling      → correlation_matrix.json           │
│       ├── H7: Detector Accuracy     → detector_f1.json                  │
│       └── H8: Susceptibility Med.   → susceptibility_mediation.json     │
│                                                                         │
│  [5] Statistical Test                                                   │
│       │                                                                 │
│       ├── Shapiro-Wilk（正态性检验）                                     │
│       ├── Permutation Test（p-value）                                   │
│       ├── Bootstrap CI（置信区间）                                       │
│       ├── Cohen's d（效应量）                                           │
│       ├── Mixed Effects Model（跨任务）                                  │
│       └── Granger Causality（因果方向）                                  │
│                                                                         │
│  [6] Visualization                                                      │
│       │                                                                 │
│       └── paper_figures/                                                │
│           ├── fig1_stability_comparison.pdf                             │
│           ├── fig2_evidence_explanatory.pdf                             │
│           ├── fig3_inertia_authority.pdf                                │
│           ├── fig4_confidence_prediction.pdf                            │
│           ├── fig5_governance_mediation.pdf                             │
│           ├── fig6_correlation_matrix.pdf                               │
│           ├── fig7_detector_f1.pdf                                      │
│           ├── fig8_benchmark_radar.pdf                                  │
│           └── fig9_state_trajectory.pdf                                 │
│                                                                         │
│  [7] Paper Figure Generation                                            │
│       │                                                                 │
│       └── paper_figures/*.pdf（论文级，300 dpi，矢量字体）               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 流水线实现需求

- **Step 1（Simulation）：** 运行实验脚本，分别输出 Belief 和 Cognitive 格式的 JSON
- **Step 2（State Extraction）：** 从 JSON 中提取逐轮状态，写入结构化格式
- **Step 3（State Log）：** 使用 Parquet 格式存储（支持列式查询、高效过滤）
- **Step 4（Metric Computation）：** 单脚本 `compute_all_metrics.ts`，输出所有假设的度量
- **Step 5（Statistical Test）：** 单脚本 `run_all_tests.ts`，输出所有统计检验结果
- **Step 6（Visualization）：** 单脚本 `generate_all_figures.ts`，输出 PDF 图表
- **Step 7（Paper Figure）：** 确保所有图表达到论文发表标准（分辨率、字体、配色）

### 5.3 一键运行

```bash
# 完整流水线
npx tsx experiments/v2/run_validation_pipeline.ts --task=crisis --runs=50

# 输出：
#   raw_belief/          ← 50 个 Belief 模式 JSON
#   raw_cognitive/       ← 50 个 Cognitive 模式 JSON
#   state_log.parquet    ← 合并后的状态日志
#   metrics/             ← 所有假设的度量
#   tests/               ← 统计检验结果
#   paper_figures/       ← 论文图表
```

---

## 第六部分：可视化设计（Visualization）

### 6.1 论文图表排序（按论文价值从高到低）

| 优先级 | 图名 | 类型 | 证明什么 | 论文章节 |
|--------|------|------|---------|---------|
| **P0** | **State Stability Comparison** | 双面板箱线图 | H1：Utility 比 Belief 更稳定 | Results §3.1 |
| **P0** | **Evidence → Utility Regression** | 散点图 + 回归线 | H2：Evidence 解释 Opinion Change | Results §3.2 |
| **P0** | **Benchmark Radar Chart** | 雷达图 | 全维度对比，一目了然 | Results §3.5 |
| **P0** | **State Trajectory** | 多面板时间序列 | 展示状态演化的直观差异 | Results §3.4 |
| **P1** | **Inertia → Authority Bias** | ROC 曲线 + 混淆矩阵 | H3：Inertia 预测权威偏差 | Results §3.3 |
| **P1** | **Confidence Predictive Power** | 滞后散点图 | H4：Confidence 预测未来改变 | Results §3.3 |
| **P1** | **Governance Mediation Path** | 路径图（SEM 风格） | H5：治理通过 Evidence 作用 | Results §3.6 |
| **P1** | **Correlation Matrix Heatmap** | 热力图 | H6：Cognitive State 解耦 | Appendix |
| **P2** | **Detector F1 Comparison** | 分组柱状图 | H7：Detector 准确性提升 | Appendix |
| **P2** | **Susceptibility Mediation** | 中介效应图 | H8：Λ 是有效派生变量 | Appendix |
| **P2** | **Network Dynamics** | 动态网络图 | 影响力演化 | Appendix |
| **P2** | **Evidence Growth** | 累积曲线 | 信息扩散过程 | Appendix |

### 6.2 每张图的详细设计

#### Fig 1: State Stability Comparison（P0）

```
┌─────────────────────────────────────────────────────────────┐
│  (a) Belief Stability              (b) Utility Stability    │
│  ┌─────────────────────┐          ┌─────────────────────┐   │
│  │  ●●●                 │          │  ●●●                 │   │
│  │  ●●●●  ●             │          │  ●●●                 │   │
│  │  ●●●●  ●●            │          │  ●●●●  ●             │   │
│  │  ●●●●● ●●            │          │  ●●●●  ●●            │   │
│  │  ●●●●●●●●            │          │  ●●●●●●●●            │   │
│  │──┴──────────         │          │──┴──────────         │   │
│  │  σ²(ΔB) = 0.12      │          │  σ²(ΔU) = 0.04      │   │
│  └─────────────────────┘          └─────────────────────┘   │
│                                                             │
│  (c) Stability Ratio                                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■  │    │
│  │  σ²(ΔB) / σ²(ΔU) = 3.0                              │    │
│  │  p = 0.001 (permutation test)                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### Fig 2: Evidence → Utility Regression（P0）

```
┌─────────────────────────────────────────────────────────────┐
│  ΔU_i(t) = β₀ + β₁·ΔE_i(t).coverage + β₂·ΔE_i(t).recentGain│
│                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐   │
│  │  Cognitive Model        │  │  Belief Model            │   │
│  │  ●  ●                   │  │      ●                   │   │
│  │   ● ●  ●                │  │    ●  ● ●                │   │
│  │  ●  ●●● ●               │  │   ●  ●●●●●               │   │
│  │  ●●●●●●●●               │  │  ●●●●●●●●●               │   │
│  │  R² = 0.42              │  │  R² = 0.15               │   │
│  └─────────────────────────┘  └─────────────────────────┘   │
│                                                             │
│  ΔR² = 0.27, p < 0.001                                     │
└─────────────────────────────────────────────────────────────┘
```

#### Fig 3: Benchmark Radar Chart（P0）

```
┌─────────────────────────────────────────────────────────────┐
│                     Benchmark Radar                          │
│                                                             │
│              State Stability                                │
│                    ▲                                        │
│                   /|\                                       │
│                  / | \                                      │
│    Reproduc.   /  |  \  Interpretability                    │
│              /    |    \                                    │
│             /     |     \                                   │
│            /      |      \                                  │
│   Robust. ─────── + ─────── Detector Acc.                  │
│            \      |      /                                  │
│             \     |     /                                   │
│              \    |    /                                    │
│   Explainab.  \  |  /  Governance Effect                   │
│                \ | /                                        │
│                 \|/                                         │
│                   ▼                                         │
│             Opinion Diversity                                │
│                                                             │
│   ─── Cognitive Runtime                                     │
│   ─ ─ Belief Runtime                                        │
└─────────────────────────────────────────────────────────────┘
```

#### Fig 4: State Trajectory（P0）

```
┌─────────────────────────────────────────────────────────────┐
│  Single Agent State Evolution (agent "Expert Analyst")      │
│                                                             │
│  Utility ────────────────────────────────────               │
│  U[A] ●────●────●────●────●                                 │
│  U[B] ○────○────○────○────○                                 │
│                                                             │
│  Evidence ───────────────────────────────────               │
│  coverage ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄                             │
│                                                             │
│  Inertia ────────────────────────────────────               │
│  I ──────●────●────●────●────●                              │
│                                                             │
│  Confidence ─────────────────────────────────               │
│  C ──────●────●────●────●────●                              │
│                                                             │
│  Susceptibility ────────────────────────────                │
│  Λ ──────●────●────●────●────●                              │
│                                                             │
│  Round:    1    2    3    4    5                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 第七部分：统计验证方法（Statistical Validation）

### 7.1 每个假设的统计方法

| 假设 | 主要检验 | 为什么要用 | 效应量 | 置信区间 |
|------|---------|-----------|--------|---------|
| **H1: Stability** | 配对置换检验（paired permutation test） | 不假设正态分布，适应小样本 | Cohen's d | Bootstrap 95% CI |
| **H2: Evidence** | 多层回归 + 增量 F 检验 | 比较嵌套模型的解释力 | ΔR² | Bootstrap 95% CI for ΔR² |
| **H3: Inertia** | 逻辑回归 + 似然比检验 | 分类任务，需要概率输出 | Odds Ratio | Wald 95% CI |
| **H4: Confidence** | 混合效应模型（Mixed Effects） | 重复测量数据（同一 agent 多轮），需要控制 agent 随机效应 | Marginal R² | 参数 Bootstrap CI |
| **H5: Governance** | Granger 因果检验 + Bootstrap 中介分析 | 需要确定因果方向（Evidence → Utility 还是 Utility → Evidence） | 间接效应 / 总效应 | Bootstrap 95% CI |
| **H6: Decoupling** | Fisher's z 变换（相关比较）+ VIF | 比较两个独立相关矩阵 | Δr | Fisher's z CI |
| **H7: Detector** | McNemar 检验（配对分类） | 配对样本的二元分类准确率比较 | Odds Ratio | 精确二项 CI |
| **H8: Susceptibility** | Bootstrap 中介分析（Preacher & Hayes） | 非正态间接效应分布 | 间接效应 a×b | Bootstrap 95% CI |

### 7.2 为什么不能只画图

| 仅画图的问题 | 解决方案 |
|-------------|---------|
| 无法判断差异是否显著 | 置换检验 + p-value |
| 无法判断效应有多大 | Cohen's d / ΔR² / Odds Ratio |
| 无法判断估计的精度 | Bootstrap Confidence Interval |
| 无法控制混淆变量 | Mixed Effects Model（控制 agent 个体差异） |
| 无法确定因果方向 | Granger Causality Test |
| 无法分离中介效应 | Bootstrap Mediation Analysis |

### 7.3 多重比较校正

因为同时检验 8 个假设，需要使用 **Holm-Bonferroni 校正** 控制 Family-Wise Error Rate（FWER）。

```
α_adjusted = α / (m - rank + 1)  其中 m = 8
```

---

## 第八部分：审稿人视角（Reviewer Concerns）

### 8.1 审稿人可能的质疑与应对

| 审稿人质疑 | 严重程度 | 应对策略 |
|-----------|---------|---------|
| **"Cognitive State 是从 LLM 输出中事后提取的，不是原生状态。"** | 高 | 承认这是 Phase 2 的局限。Cognitive State 是 LLM 输出的**结构化表示**，而非 LLM 的原生推理。在 Phase 3 中更新 LLM prompt 后，这一局限将消除。当前阶段，我们证明的是**表示能力**，而非生成能力。 |
| **"Utility 的稳定性可能是因为你定义的更新规则更平滑，而非真实更稳定。"** | 高 | H1 的检验需要在**更新前**比较原始观测值的方差，而非更新后的状态。具体来说，比较 `U_raw(t)`（从 itemBeliefs 直接提取）的方差与 `B_raw(t)`（从 LLM 输出的 belief 字段）的方差。这排除了更新规则的影响。 |
| **"Evidence 的解释力可能只是因为 Evidence 变量更多（4 维 vs 1 维），而非真正的优势。"** | 中 | 使用调整 R²（adjusted R²）而非原始 R²，惩罚额外变量。同时报告 AIC 和 BIC（信息准则）。如果 Evidence 模型在调整 R² 和 AIC 上仍然优于 confidence 模型，则排除了维度优势。 |
| **"你的实验规模太小了（50 次运行）。"** | 中 | 使用置换检验（非参数，不依赖大样本假设）和 Bootstrap（重抽样）。报告效应量（Cohen's d）和置信区间，而非仅 p-value。如果效应量大（d > 0.8），50 次运行足够。如果效应量小（d < 0.3），诚实报告并讨论 statistical power。 |
| **"你只是在同一批数据上同时拟合了两个模型，这不是公平比较。"** | 中 | 使用交叉验证（5-fold CV），在训练集上拟合回归模型，在测试集上评估 R²。这确保了两个模型的比较是公平的。 |
| **"Granger 因果检验不能证明真正的因果关系。"** | 中 | 诚实承认 Granger 因果只是**预测性因果**（predictive causality），而非结构性因果。在讨论中明确说明这一局限。建议增加干预实验（H5 的 Governance 实验）来提供更强的因果证据。 |
| **"你的检测器 ground truth 是人工标注的，存在主观性。"** | 中 | 使用多个标注者（≥3 人），报告 Cohen's κ（标注者间一致性）。如果 κ < 0.7，讨论标注不一致性对结果的影响。 |
| **"Cognitive State 增加了 5 倍的状态变量，但只带来了 X% 的提升。值得吗？"** | 高 | 这是最关键的问题。需要在 Benchmark 中明确展示：**每个维度上的提升**，以及**总体提升**。如果某些维度无提升，诚实报告。如果总体提升 < 10%，讨论成本效益权衡。 |

### 8.2 证明"不是人为设计"的关键实验

审稿人最核心的质疑是：**你怎么证明 Utility、Evidence、Inertia 不是你们人为设计的，而是真正具有解释能力的变量？**

**关键实验 1：预测效度（Predictive Validity）**

不依赖 Cognitive State 的更新规则。仅用 LLM 原始输出中的 itemBeliefs 和 evidence 字符串来构建 Cognitive State（不经任何更新），然后用这些**原始状态**预测下一轮 LLM 的 belief 输出。如果 Cognitive State 的预测力（R²）优于上一轮 belief 的预测力，则证明 Cognitive State 携带了额外的预测信息——这不是由更新规则带来的。

```
预测模型：
  ΔB(t+1) = β₀ + β₁·B(t) + β₂·confidence(t) + ε          （Belief 模型）
  ΔB(t+1) = β₀ + β₁·U(t) + β₂·E(t) + β₃·I(t) + ε         （Cognitive 模型，无更新规则）
```

**关键实验 2：结构效度（Construct Validity）**

验证 Cognitive State 变量之间的理论关系是否在数据中成立。理论预测：
- `Λ = max((1-I)(1-C), 0.05)` → 在数据中验证：corr(Λ, (1-I)(1-C)) 是否接近 1
- `C = f(E.coverage)` → 在数据中验证：C 与 E.coverage 的相关性
- `ΔU ∝ Λ` → 在数据中验证：Susceptibility 是否真的调节了 Utility 变化

如果这些理论关系在数据中不成立，则 Cognitive State 是人为设计。如果成立，则是自然现象。

**关键实验 3：增量效度（Incremental Validity）**

在已有 Belief 模型的基础上，添加 Cognitive State 变量，看是否能提供额外的解释力。

```
层级回归：
  Step 1: ΔB(t+1) ~ B(t) + confidence(t)                   （Belief 模型基线）
  Step 2: ΔB(t+1) ~ B(t) + confidence(t) + U(t) + E(t) + I(t)  （添加 Cognitive State）
  ΔR² = R²_step2 - R²_step1
```

如果 ΔR² > 0 且显著，则证明 Cognitive State 提供了 Belief 模型无法提供的额外解释力。这是最有力的证据。

---

## 第九部分：验证路线图（Validation Roadmap）

### Priority 1：State Validation（状态验证）—— 必须完成

**目标：** 证明 Cognitive State 变量（U, E, I）是有效的、稳定的、可解释的。

| 实验 | 假设 | 最小运行次数 | 依赖 |
|------|------|------------|------|
| 1.1 State Stability（H1） | Utility 比 Belief 更稳定 | 50 次 × 1 任务 | Cognitive Runtime 能记录逐轮状态 |
| 1.2 Evidence Explanatory（H2） | Evidence 解释 Opinion Change | 同上（复用数据） | 同上 |
| 1.3 State Decoupling（H6） | 五维变量独立于彼此 | 同上（复用数据） | 同上 |
| 1.4 Construct Validity | 理论关系在数据中成立 | 同上（复用数据） | 同上 |

**何时完成：** 所有 4 个实验的 p < 0.05（经多重比较校正），且效应量（d / ΔR²）达到预设阈值。

### Priority 2：Governance Validation（治理验证）—— 必须完成

**目标：** 证明 Governance 通过 Evidence 而非 Belief 发挥作用。

| 实验 | 假设 | 最小运行次数 | 依赖 |
|------|------|------------|------|
| 2.1 Governance Mechanism（H5） | Evidence 中介治理效果 | 50 次 × 1 任务（治理开启） | Cognitive Runtime + Governance |
| 2.2 Susceptibility Mediation（H8） | Λ 完全中介 I → ΔU | 同上（复用数据） | 同上 |

**何时完成：** Granger 因果检验显著，中介效应显著。

### Priority 3：Detector Validation（检测器验证）—— 必须完成

**目标：** 证明基于 Cognitive State 的检测器优于基于 Belief 的检测器。

| 实验 | 假设 | 最小运行次数 | 依赖 |
|------|------|------------|------|
| 3.1 Detector Accuracy（H7） | Cognitive 检测器 F1 更高 | 20 场景 × 3 标注者 | 人工标注 ground truth |
| 3.2 Inertia → Authority（H3） | Inertia 预测权威偏差 | 同上（复用数据） | 同上 |

**何时完成：** F1 差异 > 0.10，逻辑回归 AUC > 0.65。

### Priority 4：Runtime Benchmark（运行时基准）—— 必须完成

**目标：** 全维度对比 Belief Runtime 和 Cognitive Runtime。

| 实验 | 假设 | 最小运行次数 | 依赖 |
|------|------|------------|------|
| 4.1 Full Benchmark（9 维度） | Cognitive 在多个维度上优于 Belief | 50 次 × 2 模式 × 1 任务 | 所有 Priority 1-3 完成 |
| 4.2 Cross-task Robustness | 结果跨任务一致 | 50 次 × 2 模式 × 3 任务 | Priority 4.1 完成 |

**何时完成：** 雷达图显示 Cognitive Runtime 在至少 6/9 维度上有显著优势。

### Priority 5：Paper Figures（论文图表）—— 必须完成

**目标：** 生产论文级图表。

| 图表 | 依赖 |
|------|------|
| Fig 1: State Stability Comparison | Priority 1.1 |
| Fig 2: Evidence → Utility Regression | Priority 1.2 |
| Fig 3: Benchmark Radar Chart | Priority 4.1 |
| Fig 4: State Trajectory | Priority 1.1 |
| Fig 5: Governance Mediation Path | Priority 2.1 |
| Fig 6: Correlation Matrix | Priority 1.3 |
| Fig 7: Detector F1 Comparison | Priority 3.1 |
| Fig 8: Inertia → Authority ROC | Priority 3.2 |
| Fig 9: Confidence Predictive Power | Priority 1.4 |

### 可以以后补充的

| 实验 | 原因 |
|------|------|
| Confidence Prediction（H4）跨任务验证 | 需要更多数据，可以推迟到 Phase 3 |
| 更大规模实验（200+ 次运行） | 当前 50 次足够检测中等效应量（d > 0.5） |
| 多模型对比（GPT-4 vs Qwen vs Claude） | 独立研究问题 |
| 真实人类实验 | 完全不同的方法论，Phase 5+ |

---

## 第十部分：最终输出

### 10.1 必须完成的实验清单

| # | 实验 | 假设 | 运行次数 | 预期工作量 |
|---|------|------|---------|-----------|
| 1 | State Stability | H1 | 50 | 运行实验 + 分析 |
| 2 | Evidence Explanatory | H2 | 复用 | 仅分析 |
| 3 | Inertia → Authority | H3 | 20（人工标注） | 标注 + 分析 |
| 4 | Confidence Prediction | H4 | 复用 | 仅分析 |
| 5 | Governance Mechanism | H5 | 50（治理模式） | 运行实验 + 分析 |
| 6 | State Decoupling | H6 | 复用 | 仅分析 |
| 7 | Detector Accuracy | H7 | 20（人工标注） | 标注 + 分析 |
| 8 | Susceptibility Mediation | H8 | 复用 | 仅分析 |
| 9 | Full Benchmark | — | 50 × 2 | 运行实验 + 分析 |
| 10 | Paper Figures | — | — | 可视化 |

**最少新增实验运行：** 约 150 次（50 基础 + 50 治理 + 50 Benchmark）

### 10.2 可以以后补充的

| 实验 | 推迟原因 |
|------|---------|
| 跨任务验证（3+ 任务） | 需要更多 compute budget |
| 大样本验证（200+ 次） | 当前样本量足够检测中等效应 |
| 多模型对比 | 独立研究问题 |
| 人类实验 | 方法论完全不同 |

### 10.3 核心结论

**SwarmAlpha 的 Cognitive State Space 在理论上具有优越性，但尚未被实验验证。** 本报告提供了完整的验证框架，包括：

1. **8 个可证伪的理论假设**（H1-H8），每个假设都有明确的零假设、可观测度量和预期结果
2. **完整的验证矩阵**，将理论映射到实验
3. **对现有 445 个实验数据的分析**——结论是现有数据不足以验证任何假设，因为 Cognitive State 从未被记录
4. **9 维 Benchmark**，全面对比 Belief Runtime 和 Cognitive Runtime
5. **自动化评估流水线**，从模拟到论文图表一键生成
6. **严格的统计验证方法**，包括置换检验、混合效应模型、Granger 因果检验、中介分析
7. **审稿人视角的预先应对**，特别是"如何证明不是人为设计"的关键实验
8. **清晰的优先级路线图**，区分必须完成和可推迟的实验

**只有完成 Priority 1-5 的全部实验，SwarmAlpha 才真正具备科研价值和论文价值。**

---

*本报告由首席研究科学家撰写，基于 SwarmAlpha Theory Freeze Report 和 Architecture Freeze Report 中确立的理论框架。所有假设均可证伪，所有实验均可复现，所有分析均可追溯。*