# SwarmAlpha Experiment Readiness Report

**日期：** 2026-07-24  
**审查人：** Principal Investigator (AI-assisted)  
**审查范围：** 全项目实验就绪状态  
**最终判定：** ❌ **NOT APPROVED — 存在 3 个 Blocker，需修复后重新审查**

---

## 第一部分：Readiness Audit（模块逐项审查）

### 审查方法

对每个模块，从以下维度评估：
- 功能完整性：核心逻辑是否实现且正确
- 集成状态：是否与 Pipeline 正确连接
- 数据完整性：是否产生完整的实验数据
- 错误处理：异常情况是否有兜底

| 模块 | 判定 | 原因 |
|------|------|------|
| **Cognitive State** | ✅ Ready | 五维定义完整（U/E/I/C/Λ），更新逻辑四步顺序正确（E→C→I→U），DiscussionEngine 集成正确，`beliefToCognitiveState` 向后兼容。硬编码常量（`DEFAULT_GLOBAL_INFO_POOL_SIZE=10`、`DEFAULT_TOTAL_CATEGORIES=5`）在 Phase 2 预期内，不影响实验。 |
| **DiscussionEngine** | ✅ Ready | 同步引擎完整支持 Cognitive State，`useCognitiveState` 开关正确，`reset()` 正确清除 `cognitiveStates`。`updateCognitiveStatesFromRound` 正确提取 itemBeliefs 构建 Utility、检测反驳、调用 `updateCognitiveState`。 |
| **AsyncDiscussionEngine** | ⚠️ Minor Issue | 不支持 Cognitive State。但所有 E1-E8 主实验均使用同步引擎，Async 只在 E6 验证实验（fraud 异步场景）中可能涉及。**不影响当前 Campaign 执行。** |
| **Governance Runtime** | ✅ Ready | 治理引擎与 DiscussionEngine 集成正确，支持 4 种检测器 + 自适应阈值。`diversity_only` 模式通过 `governanceConfig` 正确禁用非 diversity 检测器。 |
| **Detector** | ✅ Ready | 4 种检测器均已实现，E3/E7 实验使用 `detect-only` 模式。E7 需要人工标注 ground truth，但这是实验设计层面的需求，非模块问题。 |
| **Evaluation** | ⚠️ Minor Issue | 评估引擎（`src/lib/evaluation/`）存在但 Pipeline 未调用。当前评估逻辑在 `MetricComputer.ts` 中独立实现。这不影响实验正确性，但意味着两套评估逻辑存在（核心引擎 vs Pipeline 侧）。 |
| **Statistical Pipeline** | 🔴 **Blocker** | **E2 p-value 是硬编码占位符**（[StatisticalTest.ts:193](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L193)：`pValue: deltaR2 > 0.05 ? 0.01 : 0.5`）。**E2 CI 计算退化**（[StatisticalTest.ts:188](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L188)：`bootstrapCI([deltaR2], 1000)` 对单值 bootstrap 无意义）。**E3/E4/E5/E7/E8 完全没有统计检验实现**（`runTests` 的 switch 仅处理 e1/e2/e6）。 |
| **Figure Generator** | ⚠️ Minor Issue | Fig 6 相关矩阵使用占位符值 `r = i === j ? 1 : 0.3`（[FigureGenerator.ts:166](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/FigureGenerator.ts#L166)）。仅 E1/E2/E6 有图表生成，E3-E5/E7-E8 无图表。Dry Run 不影响，但正式实验前需要补全。 |
| **Report Generator** | ⚠️ Minor Issue | 仅 E1/E2/E6 有专门的报告和 LaTeX 片段。E3-E5/E7-E8 会走 `default` 分支，只输出 global metrics 和 statistical tests。功能完整但报告质量不均。 |

---

## 第二部分：实验风险检查（按严重程度排序）

### 🔴 CRITICAL — 会导致整批数据失效

| # | 风险 | 位置 | 影响范围 | 说明 |
|---|------|------|----------|------|
| 1 | **E2 p-value 硬编码占位符** | [StatisticalTest.ts:193](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L193) | E2 | `pValue: deltaR2 > 0.05 ? 0.01 : 0.5` 是 fake p-value，不是从数据中计算得出的。无论实验数据如何，p-value 仅取决于 ΔR² 是否 > 0.05。**论文中引用此 p-value 将构成学术不端。** |
| 2 | **E2 Bootstrap CI 退化** | [StatisticalTest.ts:188](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L188) | E2 | `bootstrapCI([deltaR2], 1000)` 对单元素数组做 bootstrap，所有重采样值相同，CI 无意义。需要模型级别的 bootstrap（对每轮 ΔE→ΔU 数据点重采样）。 |
| 3 | **E3/E4/E5/E7/E8 无 Metric 计算** | [MetricComputer.ts:295-321](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/MetricComputer.ts#L295-L321) | E3-E5, E7-E8 | `computeMetrics` 的 switch 仅处理 e1/e2/e6，其余实验走 `default` 分支仅返回 `experimentId` + `sampleSize` + `global`。**这些实验运行后将产生原始 JSON 数据，但无法计算假设相关的度量指标。** |
| 4 | **E3/E4/E5/E7/E8 无统计检验** | [StatisticalTest.ts:269-284](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L269-L284) | E3-E5, E7-E8 | `runTests` 的 switch 仅处理 e1/e2/e6，其余返回空数组。**即使补全了 Metric 计算，也无统计检验来判断假设是否成立。** |

### 🟠 HIGH — 可能导致部分数据不可靠

| # | 风险 | 位置 | 说明 |
|---|------|------|------|
| 5 | **Runner 使用 `require()` 动态加载** | [Runner.ts:34-55](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L34-L55) | `loadScenario` 使用 `require()` 而非静态 import。TSX 运行时可能因模块解析失败而崩溃。如果场景文件不存在，错误在运行时（而非编译时）暴露。 |
| 6 | **`as any` 类型断言导致类型安全丧失** | [Runner.ts:194](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L194), [Runner.ts:280](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L280), [Runner.ts:285](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L285) | `"openai" as any`、`(engine as any).roundDataArray`、`(intv as any).type` 绕过类型检查。如果引擎内部结构变更，编译器不会报错。 |
| 7 | **tokenUsage 始终为 0** | [Runner.ts:309-313](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L309-L313) | 硬编码 `{ promptTokens: 0, completionTokens: 0, totalTokens: 0 }`，无实际 token 计数。如果后续需要成本分析，这些数据不可用。 |
| 8 | **排名提取策略可能不准确** | [Runner.ts:243-256](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L243-L256) | 从最后一个 agent 的 itemBeliefs 提取排名（`lastRound.opinions.flatMap`），而非群体聚合。如果 agent 意见分歧，排名可能偏颇。 |

### 🟡 MEDIUM — 影响数据质量但不致命

| # | 风险 | 说明 |
|---|------|------|
| 9 | **Fig 6 相关矩阵用占位符值** | `r = i === j ? 1 : 0.3` 而非实际计算的相关矩阵。E6 图表不可用于论文。 |
| 10 | **5 个 Global Metrics 为占位符 0** | polarization、diversity、calibration、governanceGain、explainability 均为 0。 |
| 11 | **E6 conditionNumber 为占位符** | `conditionNumber: 0` 而非实际计算。 |
| 12 | **E1 验证实验仅使用 Cognitive 模式** | [e1_stability.ts:35](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/configs/e1_stability.ts#L35) 跨任务验证实验 `runtimeModes: ["cognitive"]`，未同时运行 Belief 模式。无法做 Belief vs Cognitive 的跨任务对比。 |

### 🟢 LOW — 不影响实验正确性

| # | 风险 | 说明 |
|---|------|------|
| 13 | **console.log 遍布 Pipeline 代码** | 共 53 处，用于进度日志。正式实验中有用，但应确保输出到文件而非仅 stdout。 |
| 14 | **frank 场景未在 `loadScenario` 中实现** | 类型定义包含 `"fraud"`，但 `loadScenario` switch 无对应 case。 |
| 15 | **E1 验证实验 seeds 仅 5 个** | 主实验 5 seeds × 10 runs = 50 次，验证实验 5 seeds × 4 runs = 20 次。样本量较小。 |

---

## 第三部分：Dry Run 设计

### 目标

用最小成本验证完整 Pipeline 的每一环节可正常工作。

### Dry Run 配置

```
实验: E1 (State Stability)
种子: 1 个 (42)
运行次数: 2 次 (1 belief + 1 cognitive)
Agent 数: 5
最大轮次: 5
场景: M&A
模型: qwen-plus
Temperature: 0.0
治理模式: none
```

**预计 LLM 调用：** 2 runs × 5 agents × 5 rounds = 50 次  
**预计耗时：** ~5-10 分钟  
**预计成本：** ~¥0.50（qwen-plus 定价）

### Dry Run 验证清单

执行命令：
```bash
npx tsx experiments/campaign/run_all.ts --experiment=e1 --seeds=42
```

然后手动修改配置为 1 run per seed，或直接创建临时配置。

**验证点：**

| 步骤 | 验证内容 | 通过标准 |
|------|----------|----------|
| 1. Simulation | Belief 和 Cognitive 两种模式均成功运行 | 生成 2 个 JSON 文件，无 ERROR 日志 |
| 2. Raw Data | JSON 文件包含所有必填字段 | `runId`, `experimentId`, `runtimeMode`, `seed`, `finalKendallTau`, `beliefTrajectory`, `cognitiveTrajectory`（仅 cognitive）均存在 |
| 3. Metrics | `metrics.json` 生成且包含 `stateStability` | `sigmaSqDeltaB`, `sigmaSqDeltaU`, `stabilityRatio`, `perRunRatios` 均非 NaN/Infinity |
| 4. Statistics | `tests.json` 生成且 p-value 非硬编码 | `pValue` 在 (0, 1) 范围内，非固定值 {0.01, 0.5} |
| 5. Visualization | SVG 图表生成 | `fig1_stability.svg` 存在且可打开 |
| 6. Report | Markdown + LaTeX 报告生成 | `report.md` 和 `report.tex` 存在，内容完整 |
| 7. Summary | Campaign Summary 生成 | `campaign_summary.json` 和 `.md` 存在 |
| 8. Reproducibility | 相同 seed 再次运行得到相同结果 | τ 值一致（允许浮点误差 < 1e-6） |

---

## 第四部分：Acceptance Criteria（Go / No-Go Checklist）

### E1: State Stability

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 belief + 50 cognitive 共 100 个 JSON 文件 | 待验证 |
| 指标正常 | `stabilityRatio > 0`，`sigmaSqDeltaB` 和 `sigmaSqDeltaU` 非 NaN | 待验证 |
| 统计检验 | 置换检验 p-value 非硬编码，在 (0, 1] 范围 | 待验证 |
| 图表生成 | Fig 1 SVG 柱状图正确显示 | 待验证 |
| 报告生成 | report.md + report.tex 包含完整数值 | 待验证 |
| 可重复 | 相同 seed 重跑得到相同 τ | 待验证 |

### E2: Evidence Explanatory Power

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 cognitive JSON 文件 | 待验证 |
| 指标正常 | `r2Cognitive`, `r2Belief`, `deltaR2` 在合理范围 | 待验证 |
| **统计检验** | **p-value 必须从数据中计算，非硬编码** | **🔴 未满足** |
| **Bootstrap CI** | **对逐轮 ΔE→ΔU 数据点做模型级 bootstrap** | **🔴 未满足** |
| 图表生成 | Fig 2 SVG 柱状图正确显示 | 待验证 |

### E3: Inertia → Authority Bias

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 cognitive JSON 文件 | 待验证 |
| **指标计算** | **需要实现 `computeE3Inertia`：逻辑回归 AUC、odds ratio** | **🔴 未实现** |
| **统计检验** | **需要实现 `testE3`：置换检验 AUC > 0.5** | **🔴 未实现** |
| 图表生成 | 需要 ROC 曲线图 | **🔴 未实现** |

### E4: Confidence Prediction

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 cognitive JSON 文件 | 待验证 |
| **指标计算** | **需要实现 `computeE4Confidence`：混合效应模型 β₁** | **🔴 未实现** |
| **统计检验** | **需要实现 `testE4`：β₁ < 0 的显著性检验** | **🔴 未实现** |
| 图表生成 | 需要散点图 + 回归线 | **🔴 未实现** |

### E5: Governance Mechanism

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 cognitive JSON 文件 | 待验证 |
| **指标计算** | **需要实现 `computeE5Governance`：Granger 因果检验** | **🔴 未实现** |
| **统计检验** | **需要实现 `testE5`：F 检验显著性** | **🔴 未实现** |
| 图表生成 | 需要 Granger 因果路径图 | **🔴 未实现** |

### E6: State Decoupling

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 cognitive JSON 文件 | 待验证 |
| 指标正常 | `maxCorrCognitive` 和 `maxCorrBelief` 在 [0, 1] | 待验证 |
| 统计检验 | Fisher's z 检验 p-value 在 (0, 1] | 待验证 |
| **图表生成** | **Fig 6 相关矩阵必须使用实际计算值，非占位符** | **🔴 未满足** |
| 报告生成 | report.md + report.tex 包含完整数值 | 待验证 |

### E7: Detector Accuracy

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 20 cognitive JSON 文件 | 待验证 |
| **指标计算** | **需要实现 `computeE7Detector`：F1、precision、recall** | **🔴 未实现** |
| **统计检验** | **需要实现 `testE7`：McNemar 检验或配对 t 检验** | **🔴 未实现** |
| **Ground Truth** | **需要人工标注 20 个场景的偏差标签** | **🔴 未准备** |

### E8: Susceptibility Mediation

| 检查项 | 标准 | 状态 |
|--------|------|------|
| 输出完整 | 50 cognitive JSON 文件 | 待验证 |
| **指标计算** | **需要实现 `computeE8Susceptibility`：中介效应 a×b** | **🔴 未实现** |
| **统计检验** | **需要实现 `testE8`：Bootstrap 中介 CI** | **🔴 未实现** |
| 图表生成 | 需要中介路径图 | **🔴 未实现** |

---

## 第五部分：代码审查

### 发现的临时代码 / 占位符

| 位置 | 问题 | 严重程度 |
|------|------|----------|
| [StatisticalTest.ts:193](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L193) | `pValue: deltaR2 > 0.05 ? 0.01 : 0.5` — 硬编码假 p-value | 🔴 Blocker |
| [StatisticalTest.ts:188](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/StatisticalTest.ts#L188) | `bootstrapCI([deltaR2], 1000)` — 对单值 bootstrap 退化 | 🔴 Blocker |
| [MetricComputer.ts:257](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/MetricComputer.ts#L257) | `conditionNumber: 0` — 占位符 | 🟠 High |
| [MetricComputer.ts:280-287](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/MetricComputer.ts#L280-L287) | 5 个 global metric 占位符 0 | 🟡 Medium |
| [FigureGenerator.ts:166](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/FigureGenerator.ts#L166) | `const r = i === j ? 1 : 0.3` — 相关矩阵占位符 | 🟡 Medium |
| [Runner.ts:309-313](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/pipeline/Runner.ts#L309-L313) | `tokenUsage: { promptTokens: 0, ... }` — 始终为 0 | 🟢 Low |

### 发现的 Magic Number / Hardcode

| 位置 | 值 | 说明 |
|------|-----|------|
| [cognitiveState.ts:158](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/agent/cognitiveState.ts#L158) | `DEFAULT_GLOBAL_INFO_POOL_SIZE = 10` | Phase 2 硬编码，有注释说明 |
| [cognitiveState.ts:161](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/agent/cognitiveState.ts#L161) | `DEFAULT_TOTAL_CATEGORIES = 5` | Phase 2 硬编码，有注释说明 |
| [cognitiveState.ts:143](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/agent/cognitiveState.ts#L143) | `INERTIA_DECAY = 0.98` | 有合理说明 |
| [cognitiveState.ts:149-153](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/agent/cognitiveState.ts#L149-L153) | 多个惯性阈值常量 | 有合理说明 |
| Runner.ts:84 | `initialConfidence = 50 + rng() * 20` | Agent 初始置信度范围 [50, 70]，无说明 |
| Runner.ts:83 | `initialBelief = ... (rng() * 0.6 - 0.3)` | 初始信念范围 [-0.3, 0.3]，无说明 |

### 未使用 / 不完整模块

| 模块 | 状态 | 建议 |
|------|------|------|
| `src/lib/benchmarks/` | 存在但 Pipeline 未使用 | 保留，Phase 4 使用 |
| `src/lib/pipeline.ts` | 旧版流水线，Pipeline 已迁移到 campaign/ | 保留向后兼容 |
| `src/lib/evaluation/` | 存在但 Pipeline 使用独立的 MetricComputer | 不阻塞，但建议统一 |
| `experiments/v2/` 大量分析脚本 | 旧版实验，不使用 | 归档即可 |

### 未发现的问题

- ✅ 无 `test.only()` / `test.skip()` 残留
- ✅ 无显式 `TODO` / `FIXME` 注释（仅文档性注释提到 Phase 4）
- ✅ 无 `debugger` 语句
- ✅ 随机种子使用统一 `mulberry32`，可复现

---

## 第六部分：Scientific Readiness（审稿人视角）

### 风险 1：Pipeline 不完整导致实验无法验证假设

**风险描述：** 当前 Pipeline 仅对 E1、E2（部分）、E6 三个实验有完整的 Metric → Statistics → Figure → Report 链路。E3、E4、E5、E7、E8 仅能产生原始 JSON 数据，无法计算度量指标和统计检验。这意味着 8 个假设中只有 3 个能被验证。

**审稿人会问：** "你说设计了 8 个实验验证 8 个假设，但为什么只有 3 个有结果？"

**规避方案：** 在正式实验前补全 E3-E5、E7-E8 的 MetricComputer 和 StatisticalTest 实现。最低要求：每个实验至少有一个核心指标 + 一个统计检验。

### 风险 2：单任务、单模型验证的泛化性存疑

**风险描述：** 所有 8 个主实验均使用 M&A 场景 + qwen-plus 模型。跨任务验证（Crisis、Supplier）和跨模型验证（GPT-4o）被设计为"验证实验"（`isMain: false`），优先级最低。如果审稿人质疑"你的理论是否只在特定任务/模型上成立"，当前设计无法回答。

**审稿人会问：** "Cognitive State 的优势是否仅限于 M&A 排序任务？是否只在 qwen-plus 上成立？"

**规避方案：**
- 至少对 E1（最核心假设）执行完整的跨任务 + 跨模型验证
- 在论文中明确声明"本研究以 M&A 任务为主要验证场景，跨任务/跨模型验证见 Supplementary"
- 如果预算允许，将 E1 的跨任务验证提升为正式实验（与主实验同等样本量）

### 风险 3：E2 的统计方法不满足学术标准

**风险描述：** E2 当前使用硬编码 p-value 和退化 Bootstrap CI。即使修复了计算逻辑，当前方法（简单线性回归 + 单值 bootstrap）也不够严谨。

**审稿人会问：** "ΔR² 的统计推断是如何进行的？为什么不使用模型比较的 F-test 或 likelihood ratio test？"

**规避方案：**
- 修复 p-value 为数据驱动的计算（模型级 bootstrap 或 permutation test for ΔR²）
- 考虑使用嵌套模型比较（F-test for nested models）而非简单 ΔR² 阈值
- 在论文中报告完整的回归诊断（残差图、Q-Q plot、异方差检验）

---

## 第七部分：最终结论

### Go / No-Go Decision

> **❌ Scientific Campaign NOT APPROVED**

### Blocker 清单（必须修复才能开始正式实验）

| # | Blocker | 修复方案 | 预计工时 |
|---|---------|----------|----------|
| B1 | E2 p-value 硬编码占位符 | 实现模型级 Bootstrap：对逐轮 ΔE→ΔU 数据点重采样，计算每次的 R²，构建 ΔR² 的 bootstrap 分布，根据 CI 是否跨越 0 判断显著性 | 2-3h |
| B2 | E2 Bootstrap CI 退化 | 同上，合并修复 | 包含在 B1 |
| B3 | E3/E4/E5/E7/E8 无 Metric 计算 | 在 `MetricComputer.ts` 中实现 `computeE3Inertia`、`computeE4Confidence`、`computeE5Governance`、`computeE7Detector`、`computeE8Susceptibility` | 4-6h |
| B4 | E3/E4/E5/E7/E8 无统计检验 | 在 `StatisticalTest.ts` 中实现 `testE3`-`testE8` | 3-4h |
| B5 | Fig 6 相关矩阵占位符 | 使用 `computeE6Decoupling` 实际计算的相关矩阵数据填充 | 0.5h |

### 修复后重新审查流程

1. 修复 B1-B5
2. 执行 Dry Run（仅 E1，验证 Pipeline 通畅）
3. 如果 Dry Run 通过，执行 E1 完整 100 次运行
4. 验证 E1 全部 Acceptance Criteria
5. 如果 E1 通过，批准 E2-E8 正式运行

### 当前可直接执行的操作

- ✅ **Dry Run**：仅 E1，1 seed × 2 runs，验证 Pipeline 通畅
- ✅ **E1 完整运行**：修复 B3-B5 不影响 E1（E1 的 MetricComputer 和 StatisticalTest 已实现）

### 当前不可执行的操作

- ❌ E2 完整运行：p-value 和 CI 不可靠
- ❌ E3-E8 完整运行：无 Metric 计算和统计检验

---

*本文档由 AI 辅助 PI 审查生成，所有代码引用均来自实际项目文件。*  
*所有发现的问题均基于代码阅读和静态分析，未执行实际运行。*