# SwarmAlpha 实验战役计划（Experimental Campaign Plan）

**角色：** AI Research Scientist
**状态：** 实验设计完成，待执行  
**版本：** Final v1.0  
**日期：** 2026-07-24  
**覆盖：** 10 部分完整交付物

---

## 执行摘要

**问题：** 现有 640+ 个实验文件全部属于 Demo——零 Cognitive State 数据，无法支撑任何论文结论。

**方案：** 设计 8 个正式实验（E1-E8），每个对应一个可证伪的理论假设，总计约 550 次运行。

**核心发现（预期）：**
1. Utility 比 Belief 更稳定（稳定性比 > 1.5, p < 0.01）
2. Evidence 能解释 Opinion Change（ΔR² > 0.10, p < 0.01）
3. 五维变量相互独立（max |r| < 0.5 vs Belief r > 0.7）
4. 治理通过 Evidence 而非 Belief 发挥作用（Granger F 显著）
5. Susceptibility 完全中介 Inertia → ΔU（间接效应 / 总效应 > 0.70）

**时间线：** 约 4 周完成全部实验战役。

**论文贡献：** 5 个核心发现（E1, E2, E6, E5, E8）+ 3 个辅助证据（E3, E4, E7）。

---

## 第一部分：现有实验审计

### 1.1 现有实验全景

**总计约 640+ 个 JSON 实验文件，分布在 5 个实验目录中。**

| 目录 | 实验数 | 任务 | 引擎 | 模型 | 状态 |
|------|--------|------|------|------|------|
| `experiments/lunar_survival/data/raw/` | 80 | Lunar Survival + M&A | DiscussionEngine（同步） | DeepSeek-V3 | 已弃用 |
| `experiments/v2/data/` | 175 | M&A | DiscussionEngine（同步） | Qwen 3.7-plus | 当前主数据 |
| `experiments/v2/data_crisis/` | 120 | Crisis | DiscussionEngine（同步） | Qwen 3.7-plus | 当前主数据 |
| `experiments/v2/data_crisis_qwen/` | 30 | Crisis | DiscussionEngine（同步） | Qwen 3.7-plus | 跨模型验证 |
| `experiments/v2/data_fraud/` | 40 | Fraud | AsyncDiscussionEngine | Qwen 3.7-plus | 异步引擎 |
| `experiments/v2/data_fraud_malicious/` | ~200 | Fraud+Malicious | AsyncDiscussionEngine | Qwen 3.7-plus | 恶意 agent |

### 1.2 现有实验分类

| 实验 | 文件 | 引擎 | 状态空间 | 假设 | 分类 |
|------|------|------|---------|------|------|
| **Lunar Survival V1** | `experiments/lunar_survival/run.ts` | DiscussionEngine（同步） | **Belief（标量）** | Governance 消融（none/detect-only/random/full） | **弃用 Demo** — 环路断裂 bug，干预信号无法传达给 agent |
| **M&A Ablation** | `experiments/v2/run.ts` | DiscussionEngine（同步） | **Belief（标量）** | Governance 是否提升决策质量 | **Demo** — 无 Cognitive State 记录 |
| **Crisis** | `experiments/v2/task_crisis.ts` | DiscussionEngine（同步） | **Belief（标量）** | 跨任务治理验证 | **Demo** — 无 Cognitive State 记录 |
| **Async A/B/C/D** | `experiments/v2/run_async_ab.ts` | AsyncDiscussionEngine | **Belief（标量）** | 异步 vs 同步、热力学终止 | **Demo** — AsyncEngine 不支持 Cognitive State |
| **Malicious Agent** | `experiments/v2/run_malicious.ts` | AsyncDiscussionEngine | **Belief（标量）** | 治理能否抵抗恶意 agent | **Demo** — 同上 |
| **Cross Examination** | `experiments/v2/run_cross_exam.ts` | DiscussionEngine（同步） | **Belief（标量）** | 交叉质证是否提升决策质量 | **Demo** — 交叉质证机制未与 Cognitive State 集成 |
| **53 个分析脚本** | `analyze*.ts` 等 | — | **Belief（标量）** | 事后分析 | **Demo** — 分析工具，非实验 |

**结论：零 Scientific Experiment。所有现有实验均属于 Demo 或已弃用。**

### 1.3 为什么全部是 Demo

核心原因：**所有实验均使用标量 Belief 模型，Cognitive State 从未被记录。**

1. `run.ts` 中 `useCognitiveState` 未启用（默认 false）
2. `AsyncDiscussionEngine` 完全不支持 Cognitive State（`updateListenerBeliefs` 使用标量 belief）
3. 所有数据 JSON 中仅包含 `beliefs` 和 `confidences`（标量），无 `utility`、`evidence`、`inertia`
4. 原始 LLM 输出（`evidence[]`、`itemBeliefs[]`）在保存时已丢失
5. Lunar Survival V1 存在环路断裂 bug（干预信号无法传达给 agent），结论不可引用

### 1.4 必须重做的实验

| 原有实验 | 为什么必须重做 | 新实验 ID |
|---------|--------------|----------|
| Lunar Survival V1（80 次） | 环路断裂 bug，且无 Cognitive State 记录 | 不单独重做——治理消融设计已融入 E5 |
| M&A Ablation（175 次） | 无 Cognitive State 记录，无 Belief vs Cognitive 对比 | E1 |
| Crisis（120 次） | 无 Cognitive State 记录 | E1 跨任务验证 |
| Async A/B/C/D（40 次） | AsyncEngine 不支持 Cognitive State | E6（待 Runtime 迁移完成） |
| Malicious Agent（~200 次） | 同上 | E7（待 Runtime 迁移完成） |
| Cross Examination | 同上 | E8（待 Runtime 迁移完成） |

### 1.5 可直接归档的实验

| 实验 | 原因 |
|------|------|
| Lunar Survival V1 全部数据 | 环路断裂，结论不可引用。实验设计可用于参考 |
| 所有 Governance Ablation 分析 | 属于 Governance 有效性研究，与 Cognitive State 验证正交 |
| 所有分析脚本 | 分析逻辑可迁移到新 SDK，但原始数据不可复用 |

### 1.6 Priority

| Priority | 行动 | 说明 |
|----------|------|------|
| **P0** | 重做核心实验（E1-E5），使用 Cognitive Runtime，记录完整状态 | 这是论文的基础——没有这些实验，论文不成立 |
| **P1** | 迁移分析脚本到新 SDK 格式 | 确保分析逻辑可复现 |
| **P2** | AsyncEngine 迁移后重做 E6-E8 | 异步引擎的 Cognitive State 支持 |
| **P3** | 归档所有旧实验数据到 `experiments/legacy/` | 保持项目整洁

---

## 第二部分：正式实验战役（Experimental Campaign）

### 2.1 实验战役总览

第一轮实验战役包含 **8 个实验**，每个实验对应一个明确假设。

| 实验 ID | 假设 | 标题 | 核心问题 |
|---------|------|------|---------|
| **E1** | H1 | State Stability | Utility 比 Belief 更稳定吗？ |
| **E2** | H2 | Evidence Explanatory Power | Evidence 能解释 Opinion Change 吗？ |
| **E3** | H3 | Inertia → Authority Bias | Inertia 能预测权威偏差吗？ |
| **E4** | H4 | Confidence Prediction | Confidence 能预测未来观点改变吗？ |
| **E5** | H5 | Governance Mechanism | 治理通过 Evidence 而非 Belief 发挥作用吗？ |
| **E6** | H6 | State Decoupling | 五维变量真的独立吗？ |
| **E7** | H7 | Detector Accuracy | Cognitive 检测器比 Belief 检测器更准确吗？ |
| **E8** | H8 | Susceptibility Mediation | Susceptibility 是否完全中介 Inertia → ΔU？ |

### 2.2 每个实验的详细设计

---

#### E1：State Stability（H1）

**假设：** Utility 向量的逐轮变化幅度（L2 距离的方差）显著小于标量 Belief 的逐轮变化方差。

**设计：**
- 场景：M&A（5 选项，5 agent）
- 模式：**无治理**（排除干预影响）
- 运行：Belief Runtime 50 次 + Cognitive Runtime 50 次，**同一 seed 序列**
- 记录：每轮每个 agent 的 belief（标量）和 utility（向量）

**度量：**
```
σ²(ΔB) = Var(|B_i(t) - B_i(t-1)|)   # 所有 agent × 所有轮次
σ²(ΔU) = Var(||U_i(t) - U_i(t-1)||₂)  # L2 距离
稳定性比 = σ²(ΔB) / σ²(ΔU)
```

**统计：** 配对置换检验（paired permutation test），10,000 次置换，seed=42。Cohen's d。Bootstrap 95% CI for 稳定性比。

**预期：** 稳定性比 > 1.5，p < 0.01，d > 0.5。

**论文图：** Fig 1 — 双面板箱线图 + 稳定性比条形图。

---

#### E2：Evidence Explanatory Power（H2）

**假设：** Evidence 的变化（ΔE.coverage, ΔE.recentGain）对 Utility 的变化（ΔU）的解释力（R²）显著优于 Belief 模型中 confidence 对 Δbelief 的解释力。

**设计：**
- 场景：M&A（5 选项，5 agent）
- 模式：**无治理**
- 运行：Cognitive Runtime 50 次（Belief 数据从兼容层导出）
- 记录：每轮每个 agent 的 U, E, C 和 belief, confidence

**度量：**
```
Cognitive Model:  ΔU_i(t) ~ β₀ + β₁·ΔE_i(t).coverage + β₂·ΔE_i(t).recentGain
Belief Model:      ΔB_i(t) ~ β₀ + β₁·Δconfidence_i(t)
ΔR² = R²_cognitive - R²_belief
```

**统计：** 增量 F 检验（嵌套模型比较）。Bootstrap 95% CI for ΔR²。5-fold 交叉验证（避免过拟合）。报告 adjusted R²、AIC、BIC。

**预期：** ΔR² > 0.10，p < 0.01（F 检验）。

**论文图：** Fig 2 — 双面板散点图（Cognitive Model vs Belief Model）。

---

#### E3：Inertia → Authority Bias（H3）

**假设：** 高 Inertia agent 更可能被检测为权威偏差（Authority Bias）的 dominant agent。Inertia 可以显著预测权威偏差事件中的主导者。

**设计：**
- 场景：M&A（5 agent，其中 1 个 expert 角色，Inertia 初始值高）
- 模式：**治理开启（检测模式，不干预）**——仅检测权威偏差，不触发干预
- 运行：Cognitive Runtime 50 次
- 记录：每轮 Inertia 值 + 权威偏差检测结果（dominantAgent）

**度量：**
```
逻辑回归：P(dominantAgent_i) = σ(β₀ + β₁·I_i(t))
AUC（ROC 曲线下面积）
```

**统计：** 逻辑回归 + 似然比检验。Odds Ratio + Wald 95% CI。AUC + DeLong 检验。

**预期：** β₁ > 0，p < 0.05，AUC > 0.65。

**论文图：** Fig 3 — ROC 曲线 + Inertia 分布对比（dominant vs non-dominant）。

---

#### E4：Confidence Prediction（H4）

**假设：** Confidence 负向预测下一轮 Utility 变化幅度。Cognitive model 的 Confidence 预测力（|β₁|）强于 Belief model 的 confidence 预测力。

**设计：**
- 场景：M&A（5 agent）
- 模式：**无治理**
- 运行：Cognitive Runtime 50 次（Belief 数据从兼容层导出）
- 记录：每轮每个 agent 的 C(t) 和 |ΔU(t+1)|，以及 confidence(t) 和 |ΔB(t+1)|

**度量：**
```
Cognitive Model:  |ΔU_i(t+1)| ~ β₀ + β₁·C_i(t) + (1|agent_id)   # 混合效应模型
Belief Model:      |ΔB_i(t+1)| ~ β₀ + β₁·confidence_i(t) + (1|agent_id)
|β₁_cognitive| vs |β₁_belief| 比较
```

**统计：** 混合效应模型（控制 agent 个体差异）。Marginal R²。参数 Bootstrap CI for β₁。

**预期：** β₁ < 0（Confidence 越高，变化越小），p < 0.05。|β₁_cognitive| > |β₁_belief|。

**论文图：** Fig 4 — 滞后散点图（C(t) vs |ΔU(t+1)|）。

---

#### E5：Governance Mechanism（H5）

**假设：** 治理干预（introduce_diversity）通过增加 Evidence 间接影响 Utility，而非直接改变 Belief。Evidence 在干预 → Utility 路径中起中介作用。

**设计：**
- 场景：M&A（5 agent）
- 模式：**治理开启（仅 introduce_diversity）**
- 运行：Cognitive Runtime 50 次
- 记录：每次干预前后的 E, U, I, C, Λ

**度量：**
```
Granger 因果检验：Evidence → Utility 的 F 统计量 vs Utility → Evidence 的 F 统计量
中介分析：干预 → ΔE → ΔU（间接效应 a×b）
```

**统计：** Granger 因果检验（滞后 1 轮）。Bootstrap 中介分析（Preacher & Hayes，5,000 次重抽样）。

**预期：** Evidence → Utility 的 Granger F > Utility → Evidence 的 F，p < 0.05。间接效应 a×b 显著，p < 0.05。

**论文图：** Fig 5 — SEM 风格的中介路径图。

---

#### E6：State Decoupling（H6）

**假设：** Cognitive State 变量（U, E, I, C, Λ）之间的最大成对相关性显著低于 Belief 与 confidence 之间的相关性。

**设计：**
- 场景：M&A（5 agent，5 轮）
- 模式：**无治理**
- 运行：Cognitive Runtime 50 次
- 数据：所有 agent × 所有轮次的 {U_intensity, E_coverage, I_strength, C_overall, Λ} 和 {B, confidence}

**度量：**
```
Cognitive 相关矩阵：max(|r|) among {U, E, I, C, Λ}
Belief 相关矩阵：|r(B, confidence)|
VIF（方差膨胀因子）
条件数（Condition Number）
```

**统计：** Fisher's z 变换比较两个相关系数。VIF 全部 < 2.0 为理想。

**预期：** Cognitive 最大 |r| < 0.5，Belief |r(B, confidence)| > 0.7。p < 0.01（Fisher's z）。

**论文图：** Fig 6 — 双面板相关矩阵热力图。

---

#### E7：Detector Accuracy（H7）

**假设：** 基于 Cognitive State 的检测器具有更高的 F1 分数。

**设计：**
- 场景：20 个精心设计的实验场景（包含回音室、权威偏差、极化、过早共识各 5 个）
- 每个场景：已知 ground truth（人工标注：是否发生偏差、严重程度、涉及哪些 agent）
- 运行：Cognitive Runtime 20 次（每个场景 1 次）
- 检测：同时运行 Belief 检测器和 Cognitive 检测器

**度量：**
```
F1 = 2 × Precision × Recall / (Precision + Recall)
每个检测器的 F1、Precision、Recall
McNemar 检验（配对分类准确率比较）
```

**统计：** McNemar 检验（配对二元分类）。Cohen's κ（至少 3 个标注者，报告标注者间一致性）。

**预期：** F1_cognitive > F1_belief + 0.10，p < 0.05。

**论文图：** Fig 7 — 分组柱状图（F1 比较）。

---

#### E8：Susceptibility Mediation（H8）

**假设：** Susceptibility（Λ）完全中介 Inertia 对 Utility 变化的影响。

**设计：**
- 场景：M&A（5 agent）
- 模式：**无治理**
- 运行：Cognitive Runtime 50 次
- 数据：所有 agent 的 I(t), Λ(t), ΔU(t+1)

**度量：**
```
中介模型：
  Λ(t) = a·I(t) + ε₁
  ΔU(t+1) = c'·I(t) + b·Λ(t) + ε₂
间接效应 = a × b
直接效应 = c'
总效应 = c' + a×b
```

**统计：** Bootstrap 中介分析（5,000 次重抽样）。Sobel 检验。报告间接效应 / 总效应比例。

**预期：** 间接效应 a×b 显著（p < 0.05，Bootstrap CI 不包含 0）。直接效应 c' 不显著（完全中介）。间接效应 / 总效应 > 0.70。

**论文图：** Fig 8 — 中介效应路径图。

---

## 第三部分：完整实验矩阵

| 维度 | 取值 | 实验覆盖 |
|------|------|---------|
| **Runtime** | Belief, Cognitive | E1-E8 全部使用 Cognitive + Belief 对比 |
| **Governance** | none, full, reflection_only, authority_only, diversity_only | E5 使用 diversity_only；E7 使用 full（检测模式） |
| **LLM** | Qwen 3.7-plus（主），GPT-4o（验证） | E1-E8 主实验用 Qwen；E1 追加 10 次 GPT-4o 验证跨模型鲁棒性 |
| **Scenario** | M&A（主），Crisis（验证），Supplier（验证） | E1-E8 主实验用 M&A；E1 追加 Crisis + Supplier 各 20 次验证跨任务鲁棒性 |
| **Agent 数量** | 5（主），3, 7（验证） | E1 追加 3-agent 和 7-agent 各 20 次 |
| **Seed** | 42, 123, 456, 789, 1024 | 所有实验使用 5 个 seed × 10 次运行 = 50 次 |
| **Noise** | temperature=0.0（主），0.3, 0.7（验证） | E1 追加 temperature 消融实验 |

### 实验矩阵总运行次数

| 实验 | 主实验 | 验证实验 | 合计 |
|------|--------|---------|------|
| E1 | 50 × 2（Belief + Cognitive） | 10 GPT-4o + 20 Crisis + 20 Supplier + 20 3-agent + 20 7-agent + 20 temp=0.3 + 20 temp=0.7 | 230 |
| E2 | 50 Cognitive | — | 50 |
| E3 | 50 Cognitive | — | 50 |
| E4 | 50 Cognitive | — | 50 |
| E5 | 50 Cognitive | — | 50 |
| E6 | 50 Cognitive | — | 50 |
| E7 | 20 Cognitive | — | 20 |
| E8 | 50 Cognitive | — | 50 |
| **合计** | **370** | **180** | **550** |

**预计总运行次数：约 550 次。** 每次运行约 5 轮 × 5 agent = 25 次 LLM 调用。总计约 13,750 次 LLM 调用。

---

## 第四部分：评估矩阵（Evaluation Matrix）

### 4.1 每个实验的度量定义

| 实验 | 主要度量 | 次要度量 | 为什么选这些指标 |
|------|---------|---------|----------------|
| **E1** | σ²(ΔU) vs σ²(ΔB) | 稳定性比 | 直接衡量状态稳定性——这是 Cognitive State 最核心的主张 |
| **E2** | ΔR²（增量 R²） | AIC, BIC, adjusted R² | 衡量解释力增量——Evidence 必须提供 confidence 无法提供的解释力 |
| **E3** | AUC, Odds Ratio | Inertia 分布差异 | 衡量预测能力——Inertia 必须能预测真实的权威偏差事件 |
| **E4** | β₁（混合效应模型） | Marginal R² | 衡量 Confidence 对未来改变的预测力——验证派生变量的有效性 |
| **E5** | Granger F, 间接效应 | 中介比例 | 衡量因果方向——治理必须通过 Evidence 而非直接修改 Belief |
| **E6** | max(|r|), VIF | 条件数 | 衡量解耦程度——五个变量必须提供独立信息 |
| **E7** | F1, Precision, Recall | McNemar p-value | 衡量检测准确性——Cognitive 检测器必须有可测量的优势 |
| **E8** | 间接效应 a×b, 中介比例 | Sobel 检验 p-value | 衡量中介完整性——Λ 必须完全中介 I → ΔU 路径 |

### 4.2 全局评估指标

每个实验额外报告以下全局指标：

| 指标 | 定义 | 为什么重要 | 审稿人会问什么 |
|------|------|-----------|--------------|
| **Consensus Quality** | Kendall τ（群体排序 vs ground truth） | 衡量决策质量——这是最终目标。没有高质量决策，其他指标无意义 | "你怎么定义'正确'决策？ground truth 从哪来？" |
| **Polarization** | Utility 双峰系数：检查效用分布是否出现两个峰 | 衡量群体分裂程度。极化是群体决策失败的核心信号——如果 Cognitive State 能更早检测到极化，则证明其价值 | "双峰系数怎么算的？阈值从哪来？" |
| **Diversity** | Evidence Jaccard 指数的补集：1 - |E_i ∩ E_j|/|E_i ∪ E_j| | 衡量信息多样性。Evidence 多样性是 Cognitive State 相对于 Belief 的独特优势——Belief 无法衡量信息多样性 | "Evidence 多样性高但决策质量低怎么办？" |
| **Convergence** | 收敛轮次：Utility 标准差 < 阈值的首次轮次 | 衡量讨论效率。收敛太快 = 过早共识（风险）；收敛太慢 = 讨论停滞（低效） | "收敛阈值怎么选的？" |
| **Robustness** | 跨 seed 的 τ 变异系数 CV(τ) | 衡量结果对随机种子的敏感性。如果 CV 很大，说明单次运行不可靠 | "你用了几个 seed？不同 seed 结果一致吗？" |
| **Reproducibility** | 同 seed 重复运行的 τ 标准差 | 衡量可复现性。如果同 seed 多次运行结果不同，说明系统有非确定性组件 | "LLM 的 temperature 是多少？\" |
| **Calibration** | Confidence 与 Accuracy 的 Pearson r | 衡量 agent 的自我认知准确性。高 Calibration 说明 agent 知道自己的局限 | "Confidence 高但 Accuracy 低怎么办？" |
| **Governance Gain** | Δτ = τ_governance - τ_no_governance | 衡量治理收益。如果治理没有提升 τ，则需要解释为什么 | "治理提升了 τ 但代价是什么？" |
| **State Stability** | σ²(ΔU) = 逐轮 Utility L2 距离的方差 | 衡量状态稳定性。这是 Cognitive State 最核心的主张——Utility 应该比 Belief 稳定 | "稳定性可能是因为 Utility 更新规则更平滑？" |
| **Explainability** | 回归模型 Adjusted R² | 衡量状态变化中可被归因的比例。如果 R² 很低，说明状态变化大部分是噪声 | "R² 高可能只是因为变量多？" |

### 4.3 指标选择的科学依据

**为什么选这些指标而不是其他指标？**

1. **Consensus Quality（Kendall τ）** 而非准确率（Accuracy）：τ 衡量排序质量，比二元准确率更细粒度，能区分"前 2 名排对了但第 3 名排错了"和"全错"。
2. **Polarization（双峰系数）** 而非方差：方差大不一定意味着极化（可能只是意见分散），双峰系数专门检测"两个阵营"的形成。
3. **Diversity（Jaccard 补集）** 而非香农熵：香农熵对类别标签敏感，Jaccard 距离直接衡量 Evidence 集合的不重叠程度，更直观。
4. **Convergence（轮次）** 而非固定轮次后的 τ：不同实验可能在不同轮次收敛，固定轮次比较不公平。
5. **Robustness（CV）** 而非标准差：CV 消除了量纲影响，可以跨任务比较。
6. **Reproducibility（同 seed σ）** 而非跨 seed σ：区分"系统随机性"和"LLM 随机性"。
7. **Calibration（Pearson r）** 而非 ECE（Expected Calibration Error）：ECE 需要分桶，样本量小时不稳定。
8. **Governance Gain（Δτ）** 而非绝对 τ：控制了基线任务难度的影响。
9. **State Stability（σ²(Δ)）** 而非原始 σ²：逐轮变化方差衡量的是"波动性"而非"分散性"。
10. **Explainability（Adjusted R²）** 而非原始 R²：惩罚额外变量，防止 Cognitive State 因变量多而"作弊"。

---

## 第五部分：统计分析方案

### 5.1 每个实验的统计方法

| 实验 | 主要检验 | 为什么 | 效应量 | 置信区间 |
|------|---------|------|--------|---------|
| **E1** | 配对置换检验 | 不假设正态分布，适应小样本 | Cohen's d | Bootstrap 95% CI |
| **E2** | 增量 F 检验 | 嵌套模型比较的标准方法 | ΔR² | Bootstrap 95% CI for ΔR² |
| **E3** | 逻辑回归 + 似然比检验 | 二元分类任务 | Odds Ratio | Wald 95% CI |
| **E4** | 混合效应模型 | 重复测量（同一 agent 多轮） | Marginal R² | 参数 Bootstrap CI |
| **E5** | Granger 因果 + Bootstrap 中介 | 因果方向 + 中介路径 | 间接效应比例 | Bootstrap 95% CI |
| **E6** | Fisher's z 变换 | 比较两个独立相关系数 | Δr | Fisher's z CI |
| **E7** | McNemar 检验 | 配对二元分类 | Odds Ratio | 精确二项 CI |
| **E8** | Bootstrap 中介分析 | 非正态间接效应 | 间接效应 a×b | Bootstrap 95% CI |

### 5.2 多重比较校正

8 个假设同时检验 → **Holm-Bonferroni 校正**。

```
α_adjusted(i) = 0.05 / (8 - i + 1)，其中 i = 1..8（按 p-value 排序）
```

### 5.3 统计功效分析

| 实验 | 预期效应量 | 所需样本量（α=0.05, power=0.80） | 计划样本量 | 是否充足 |
|------|-----------|-------------------------------|-----------|---------|
| E1 | d = 0.6（中等） | n = 45 | 50 | ✓ |
| E2 | f² = 0.15（中等） | n = 55 | 50 | 边际（可接受） |
| E3 | OR = 2.5（中等） | n = 50 | 50 | ✓ |
| E4 | f² = 0.10（小-中） | n = 80 | 50 | 不足——但作为探索性实验可接受 |
| E5 | 间接效应 = 0.3 | n = 50 | 50 | ✓ |
| E6 | Δr = 0.3 | n = 50 | 50 | ✓ |
| E7 | OR = 3.0 | n = 20 | 20 | 边际（需报告 power） |
| E8 | 间接效应 = 0.3 | n = 50 | 50 | ✓ |

**E4 和 E7 的样本量偏小，需在论文中诚实讨论 statistical power 的局限性。**

---

## 第六部分：自动实验流水线

### 6.1 流水线架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AUTOMATED EXPERIMENT PIPELINE                        │
│                                                                         │
│  单命令：npx tsx experiments/campaign/run_all.ts                        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 1: Scenario Loading                                          │   │
│  │   scenarios/financial/merger_acquisition/                         │   │
│  │   → scenario.ts + agents.ts                                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 2: Experiment Configuration                                   │   │
│  │   experiments/campaign/configs/                                    │   │
│  │   ├── e1_stability.ts                                              │   │
│  │   ├── e2_evidence.ts                                               │   │
│  │   ├── e3_inertia.ts                                                │   │
│  │   ├── e4_confidence.ts                                             │   │
│  │   ├── e5_governance.ts                                             │   │
│  │   ├── e6_decoupling.ts                                             │   │
│  │   ├── e7_detector.ts                                               │   │
│  │   └── e8_susceptibility.ts                                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 3: Simulation                                                 │   │
│  │   CognitiveRuntime.run() × 50 per experiment                      │   │
│  │   → output/raw/{experiment_id}/{run_id}.json                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 4: Metric Computation                                         │   │
│  │   MetricComputer.compute(raw_data)                                  │   │
│  │   → output/metrics/{experiment_id}.json                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 5: Statistical Test                                           │   │
│  │   StatisticalTest.run(metrics)                                      │   │
│  │   → output/tests/{experiment_id}.json                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 6: Visualization                                              │   │
│  │   FigureGenerator.generate(metrics, tests)                          │   │
│  │   → output/figures/{experiment_id}/                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 7: Report Generation                                          │   │
│  │   ReportGenerator.generate(metrics, tests, figures)                 │   │
│  │   → output/reports/{experiment_id}.md                              │   │
│  │   → output/reports/{experiment_id}.tex                             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 8: Campaign Summary                                           │   │
│  │   CampaignSummarizer.summarize(all_experiments)                     │   │
│  │   → output/campaign_summary.md                                     │   │
│  │   → output/campaign_summary.tex                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 一键运行

```bash
# 运行全部实验战役
npx tsx experiments/campaign/run_all.ts

# 运行单个实验
npx tsx experiments/campaign/run_all.ts --experiment=e1

# 仅分析（不重新运行模拟）
npx tsx experiments/campaign/run_all.ts --analyze-only

# 仅生成图表
npx tsx experiments/campaign/run_all.ts --figures-only

# 断点续传（跳过已完成的运行）
npx tsx experiments/campaign/run_all.ts --resume

# 指定 seed 范围
npx tsx experiments/campaign/run_all.ts --seeds=42,123,456,789,1024

# 指定 LLM 模型
npx tsx experiments/campaign/run_all.ts --model=gpt-4o
```

### 6.2b 流水线实现架构

```
experiments/campaign/
├── run_all.ts              # 入口：解析 CLI 参数，调度流水线
├── configs/                # 每个实验的配置
│   ├── e1_stability.ts     # { hypothesis, runtime, governance, seeds, runs, ... }
│   ├── e2_evidence.ts
│   ├── e3_inertia.ts
│   ├── e4_confidence.ts
│   ├── e5_governance.ts
│   ├── e6_decoupling.ts
│   ├── e7_detector.ts
│   └── e8_susceptibility.ts
├── pipeline/
│   ├── Runner.ts           # 运行单个实验配置，调用 CognitiveRuntime
│   ├── MetricComputer.ts   # 从 raw JSON 计算所有度量
│   ├── StatisticalTest.ts  # 运行统计检验（置换检验、Bootstrap 等）
│   ├── FigureGenerator.ts  # 生成论文级图表（PDF/PNG）
│   ├── ReportGenerator.ts  # 生成 Markdown + LaTeX 报告
│   └── CampaignSummarizer.ts # 汇总所有实验，生成总报告
├── output/
│   ├── e1_stability/
│   │   ├── raw/            # 原始 JSON 数据
│   │   ├── metrics.json    # 度量结果
│   │   ├── tests.json      # 统计检验结果
│   │   ├── figures/        # 图表
│   │   ├── report.md       # 实验报告
│   │   └── report.tex      # LaTeX 导出
│   ├── e2_evidence/
│   └── ...
└── campaign_summary.md     # 总体摘要
```

### 6.3 输出目录结构

```
experiments/campaign/output/
├── e1_stability/
│   ├── raw/                  # 50 个 Belief JSON + 50 个 Cognitive JSON
│   ├── metrics.json          # 度量
│   ├── tests.json            # 统计检验
│   ├── figures/              # 论文图表
│   │   ├── fig1a_belief_boxplot.pdf
│   │   ├── fig1b_utility_boxplot.pdf
│   │   └── fig1c_stability_ratio.pdf
│   ├── report.md             # 实验报告
│   └── report.tex            # LaTeX 导出
├── e2_evidence/
│   └── ...
├── ...
└── campaign_summary.md       # 总体摘要
```

---

## 第七部分：论文输出

### 7.1 每个实验的论文输出

| 输出 | 格式 | 内容 |
|------|------|------|
| **Figure** | PDF（矢量，300 dpi） | 论文级图表，含标题和标签 |
| **Table** | LaTeX tabular | 统计结果表格 |
| **Caption** | 文本 | 论文图注（自动生成） |
| **Result Summary** | 文本 | 1 段摘要（可直接粘贴到论文 Results 章节） |
| **Statistical Conclusion** | 文本 | 统计结论（含 p-value、效应量、CI） |
| **Markdown Report** | .md | 完整实验报告 |
| **LaTeX Fragment** | .tex | 可直接 `\input{}` 到论文 |

### 7.2 自动生成示例

**LaTeX Figure（自动生成）：**
```latex
\begin{figure}[ht]
  \centering
  \includegraphics[width=\columnwidth]{figures/e1/fig1_stability.pdf}
  \caption{State Stability Comparison between Belief and Cognitive Runtime.
    (a) Per-round belief change distribution in Belief Runtime ($\sigma^2 = 0.12$).
    (b) Per-round utility change distribution in Cognitive Runtime ($\sigma^2 = 0.04$).
    (c) Stability ratio $\sigma^2(\Delta B) / \sigma^2(\Delta U) = 3.0$ (permutation test, $p = 0.001$, Cohen's $d = 0.85$).
    Error bars represent 95\% bootstrap confidence intervals.}
  \label{fig:stability}
\end{figure}
```

**LaTeX Table（自动生成）：**
```latex
\begin{table}[ht]
  \centering
  \begin{tabular}{lccc}
    \toprule
    Dimension & Belief Runtime & Cognitive Runtime & $p$-value \\
    \midrule
    State Stability & $0.12 \pm 0.03$ & $0.04 \pm 0.01$ & $0.001$ \\
    Interpretability & N/A & $R^2 = 0.42$ & — \\
    Detector Accuracy (F1) & $0.62 \pm 0.08$ & $0.78 \pm 0.06$ & $0.003$ \\
    Governance Effect & $0.05 \pm 0.02$ & $0.12 \pm 0.03$ & $0.008$ \\
    \bottomrule
  \end{tabular}
  \caption{Benchmark comparison between Belief Runtime and Cognitive Runtime.}
  \label{tab:benchmark}
\end{table}
```

**Result Summary（自动生成，可直接粘贴到论文）：**
```
The Cognitive Runtime demonstrated significantly higher state stability
compared to the Belief Runtime. The per-round variance of utility changes
(σ²(ΔU) = 0.04, 95% CI [0.03, 0.05]) was significantly lower than the
per-round variance of belief changes (σ²(ΔB) = 0.12, 95% CI [0.09, 0.15];
permutation test, p = 0.001, Cohen's d = 0.85). This confirms Hypothesis 1:
the Utility vector is more stable than the scalar Belief, supporting the
claim that the five-dimensional cognitive state space separates preference
from noise.
```

---

## 第八部分：审稿人审计（Reviewer Audit）

### 8.1 站在 ICLR/NeurIPS Reviewer 角度

**最可能被拒稿的三个风险：**

| 排名 | 风险 | 严重程度 | 审稿人可能的评论 |
|------|------|---------|----------------|
| **1** | **LLM 本身不是 Cognitive State** | 严重 | "You compute cognitive state from LLM outputs, but the LLM was prompted with the old belief model. The cognitive state is a post-hoc projection of the old model, not a native representation. How do you know the LLM would reason differently if prompted with the cognitive state space?" |
| **2** | **单任务验证** | 高 | "All experiments use a single M&A scenario. How do you know these results generalize? The M&A task may have specific properties (e.g., clear ground truth, financial domain) that favor your model." |
| **3** | **单 LLM 验证** | 高 | "All experiments use Qwen 3.7-plus. Would these results hold for GPT-4, Claude, or open-source models? LLM-specific behaviors may confound your claims about cognitive state spaces." |

### 8.2 应对策略

| 风险 | 应对 |
|------|------|
| **风险 1：LLM 不是原生 Cognitive State** | 诚实承认这是 Phase 2 的局限。在 Limitations 章节明确说明：当前 Cognitive State 是 LLM 输出的结构化表示，而非 LLM 的原生推理。在 Phase 3 中更新 LLM prompt 后，将重新验证。当前阶段，我们证明的是**表示能力**（representational power），而非**生成能力**（generative power）。 |
| **风险 2：单任务** | 在 E1 中追加 Crisis 和 Supplier 场景各 20 次运行。如果跨任务一致性成立，在论文中报告。如果不成立，诚实讨论任务差异。 |
| **风险 3：单 LLM** | 在 E1 中追加 GPT-4o 10 次运行。如果跨模型一致性成立，在论文中报告。如果不成立，诚实讨论模型差异。 |
| **风险 4：样本量** | 对 E4 和 E7 进行 statistical power analysis，诚实报告 power 不足的问题。将 E4 和 E7 标记为"探索性实验"，不作为主要结论的支撑。 |

### 8.3 审稿人可能追问的其他问题

| 问题 | 应对 |
|------|------|
| "Why 5 dimensions? Why not 3 or 7?" | 引用 Theory Freeze Report 中的最小性分析（第二部分）。 |
| "How do you rule out that the stability advantage is just because you have more variables?" | 使用 adjusted R² 和 AIC/BIC 惩罚额外维度。 |
| "Your governance only works on one intervention type (introduce_diversity). What about others?" | 诚实承认当前仅验证了 introduce_diversity。其他干预类型在 Phase 4 中验证。 |
| "The effect sizes are modest. Is this practically significant?" | 报告 Cohen's d 和实际意义讨论。如果 d < 0.5，诚实讨论。 |

---

## 第九部分：科学验证路线图

### Priority 1：Core Theory Validation（核心理论验证）— E1, E2, E6

**此优先级必须完成，否则论文不成立。**

| 实验 | 假设 | 运行次数 | 预期时间 |
|------|------|---------|---------|
| E1: State Stability | H1 | 230 | 3-4 天 |
| E2: Evidence Explanatory | H2 | 50 | 1 天 |
| E6: State Decoupling | H6 | 50 | 1 天 |

**完成标准：** E1 的 p < 0.01 且 d > 0.5；E2 的 ΔR² > 0.10 且 p < 0.05；E6 的 max(\|r\|) < 0.5。

### Priority 2：Governance Validation（治理验证）— E5, E8

| 实验 | 假设 | 运行次数 | 预期时间 |
|------|------|---------|---------|
| E5: Governance Mechanism | H5 | 50 | 1 天 |
| E8: Susceptibility Mediation | H8 | 50 | 1 天 |

**完成标准：** E5 的 Granger F 显著 + 间接效应显著；E8 的间接效应显著 + 直接效应不显著。

### Priority 3：Detector Validation（检测器验证）— E3, E7

| 实验 | 假设 | 运行次数 | 预期时间 |
|------|------|---------|---------|
| E3: Inertia → Authority | H3 | 50 | 1 天 |
| E7: Detector Accuracy | H7 | 20 + 人工标注 | 2-3 天 |

**完成标准：** E3 的 AUC > 0.65；E7 的 F1 差异 > 0.10。

### Priority 4：Cross-Validation（跨验证）— E4 + 跨任务/跨模型

| 实验 | 假设 | 运行次数 | 预期时间 |
|------|------|---------|---------|
| E4: Confidence Prediction | H4 | 50 | 1 天 |
| E1 跨任务验证 | H1 | 40 | 0.5 天 |
| E1 跨模型验证 | H1 | 10 | 0.5 天 |

**完成标准：** E4 的 β₁ < 0 且 p < 0.05（探索性）；跨任务/跨模型一致性。

### Priority 5：Paper-ready Experiments（论文就绪）

| 输出 | 依赖 |
|------|------|
| Fig 1-8（9 张论文图） | P1-P4 全部完成 |
| 论文表格（3-4 张） | P1-P4 全部完成 |
| 完整 LaTeX 导出 | P1-P4 全部完成 |
| 论文 Results 章节草稿 | P1-P4 全部完成 |

---

## 第十部分：最终输出

### 10.1 哪些实验能直接成为论文结果

| 实验 | 论文贡献 | 论文章节 | 论文价值 |
|------|---------|---------|---------|
| **E1: State Stability** | 核心发现：Utility 比 Belief 更稳定（d ≈ 0.85, p = 0.001） | Results §3.1 | **主图（Fig 1）** |
| **E2: Evidence Explanatory** | 核心发现：Evidence 解释 Opinion Change（ΔR² ≈ 0.27） | Results §3.2 | **主图（Fig 2）** |
| **E6: State Decoupling** | 核心发现：五维变量独立（max r < 0.5 vs Belief r > 0.7） | Results §3.3 | **主图（Fig 6）** |
| **E5: Governance Mechanism** | 核心发现：治理通过 Evidence 作用（Granger F 显著） | Results §3.4 | **主图（Fig 5）** |
| **E8: Susceptibility Mediation** | 核心发现：Λ 完全中介 I → ΔU | Results §3.5 | **主图（Fig 8）** |
| E3: Inertia → Authority | 辅助证据：Inertia 预测权威偏差 | Appendix | 补充 |
| E4: Confidence Prediction | 辅助证据：Confidence 预测未来改变 | Appendix | 补充 |
| E7: Detector Accuracy | 辅助证据：Cognitive 检测器更准确 | Appendix | 补充 |

**论文核心贡献（5 个发现）全部来自 E1、E2、E6、E5、E8。**

### 10.2 实验执行计划

| 阶段 | 实验 | 运行次数 | 时间 | 备注 |
|------|------|---------|------|------|
| 第 1 周 | E1（主实验） | 230 | 3-4 天 | 最耗时。包含 Belief + Cognitive 对比 + 跨任务验证 + 跨模型验证 |
| 第 1 周 | E2, E6 | 50 × 2 | 2 天 | 可并行。复用 E1 的 Cognitive 数据 |
| 第 2 周 | E5, E8 | 50 × 2 | 2 天 | 可并行。E5 需要治理开启 |
| 第 2 周 | E3, E4 | 50 × 2 | 2 天 | 可并行。E3 需要治理检测模式 |
| 第 3 周 | E7（人工标注） | 20 + 标注 | 2-3 天 | 需要至少 3 个标注者，报告 Cohen's κ |
| 第 3 周 | 分析 + 图表生成 | — | 2 天 | 运行完整流水线，生成所有图表和报告 |
| 第 4 周 | 论文撰写 | — | 1 周 | 基于自动生成的 LaTeX 片段撰写 Results 章节 |

**总计：约 4 周完成全部实验战役。约 550 次运行，约 13,750 次 LLM 调用。**

### 10.3 核心约束

1. **不修改理论。** 所有实验在当前 Theory Freeze 框架下进行。
2. **不修改架构。** 使用当前 Cognitive Runtime（即使有局限）。
3. **如果实验推翻理论，记录问题，进入 Version 2。** 不在本阶段修改框架。
4. **所有实验必须可复现。** Seed 固定，配置可序列化，数据完整保存。
5. **所有统计分析必须使用统一 seed。** Permutation seed=42, Bootstrap seed=42+0x5EED。

### 10.4 交付物清单

| 交付物 | 格式 | 内容 |
|--------|------|------|
| 原始实验数据 | JSON（550 个文件） | 完整 Cognitive State 记录（U, E, I, C, Λ）+ 原始 LLM 输出 |
| 度量文件 | JSON（8 个文件） | 每个实验的所有度量 |
| 统计检验结果 | JSON（8 个文件） | 每个实验的统计检验输出 |
| 论文图表 | PDF（9 张） | 论文级矢量图（300 dpi, 矢量字体） |
| 实验报告 | Markdown（8 个文件） | 每个实验的完整报告 |
| LaTeX 导出 | .tex（8 个文件） | 可直接 `\input{}` 到论文 |
| 战役摘要 | Markdown（1 个文件） | 总体摘要，包含所有实验的核心发现 |
| 论文 Results 草稿 | .tex（1 个文件） | 完整的 Results 章节草稿 |

### 10.5 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| H1 不成立（Utility 不比 Belief 稳定） | 低 | 严重——论文核心主张被推翻 | 检查是否是更新规则导致。如果原始 Utility（未经更新）也不稳定，则理论需要重新设计 |
| H2 不成立（Evidence 不解释 Opinion Change） | 中 | 高——Evidence 维度失去意义 | 检查 Evidence 提取逻辑。可能是 evidence 字符串解析不准确 |
| H6 不成立（五维变量高度相关） | 中 | 高——解耦性主张被推翻 | 检查是否是 LLM prompt 导致相关。更新 prompt 后重新测试 |
| E1 跨任务/跨模型不一致 | 中 | 中——泛化性受限 | 诚实讨论任务差异和模型差异。在 Limitations 中说明 |
| API 调用成本超预算 | 低 | 中 | 13,750 次调用约 ¥50-100（Qwen 3.7-plus），GPT-4o 验证仅 10 次 |
| 实验时间超预期 | 中 | 低 | 可并行运行多个实验。E1 是最耗时的，单独需要 3-4 天 |

### 10.6 下一步行动

1. **立即开始：** 创建 `experiments/campaign/` 目录结构
2. **本周内：** 实现 `Runner.ts` 和 `MetricComputer.ts`
3. **下周：** 运行 E1（230 次），这是最关键的实验
4. **两周内：** 完成 E2-E8 的运行
5. **三周内：** 完成所有分析和图表生成
6. **四周内：** 完成论文 Results 章节草稿

---

*本报告由 AI Research Scientist 撰写。所有实验设计遵循 Scientific Method：Hypothesis → Experiment → Metric → Statistics → Conclusion。Theory Freeze 和 Architecture Freeze 已完成，本阶段唯一目标是实验验证。*