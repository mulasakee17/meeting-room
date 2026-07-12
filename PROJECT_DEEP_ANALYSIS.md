# SwarmAlpha 项目深度分析

> 基于对全部源代码（不含文档）的逐文件阅读，覆盖 `src/lib/governance/`、`src/runtime/`、`src/lib/discussion/`、`src/lib/evaluation/`、`experiments/v2/`、`src/lib/utils/`、`src/lib/llm/`、`src/lib/pipeline.ts`、`src/lib/constants.ts`、`src/lib/types.ts` 共 40+ 文件。
> 本文档遵循"诚实准确、避免夸大"原则，明确区分"已实现且正确"、"已实现但有缺陷"、"声明但未实现"三类状态。

> **更新（2026-07-12）**：本分析文档中的 H4、H6、H2、H19、H17、H18 已修复，H20 经审计保留现状。4 个认知缺陷（状态感知/对话历史/顺序发言/影响力网络）已全部修复（commit 08b20fb）。详见各硬伤标题后的 [已修复] 标记。

---

## 一、整体结构

### 1.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  实验层  experiments/v2/                                 │
│  run.ts · analyze.ts · task_invest.ts                    │
└────────────┬───────────────────────────┬────────────────┘
             │                            │
┌────────────▼───────────┐   ┌───────────▼────────────────┐
│  运行时层  src/runtime/ │   │  API 层  src/app/api/       │
│  GovernanceRuntime      │   │  execute · task · benchmark │
│  adapters/ (3 个)       │   └────────────────────────────┘
└────────────┬───────────┘
             │
┌────────────▼───────────────────────────────────────────┐
│  核心库  src/lib/                                        │
│  ├── governance/   治理引擎（4 检测器 + 4 干预 + 自适应）│
│  ├── discussion/   讨论引擎（13 文件，拓扑/质证/dropout）│
│  ├── evaluation/   评估引擎（5 维：Kuramoto/α/Gini 等）  │
│  ├── observation/  观察层（opinion parser）              │
│  ├── inference/    推理层（belief delta 计算）           │
│  ├── llm/          LLM 提供商（DeepSeek/OpenAI/Claude）  │
│  ├── utils/        统计工具（statsUtils）                │
│  ├── pipeline.ts   共享执行管线                          │
│  └── constants.ts  魔法数字集中管理                      │
└─────────────────────────────────────────────────────────┘
```

### 1.2 文件规模与测试覆盖

| 模块 | 文件数 | 大致行数 | 测试文件 |
|------|--------|----------|----------|
| governance/ | 9 | ~1800 | governance.test.ts, interventions.test.ts, adaptive-*.test.ts |
| runtime/ | 8 | ~1500 | runtime.test.ts, adapters.test.ts |
| discussion/ | 13 | ~3500 | discussion.test.ts, cross-examination.test.ts |
| evaluation/ | 2 | ~1000 | evaluation.test.ts |
| experiments/v2/ | 8 | ~2500 | （无单元测试，依赖端到端） |
| 其他 | ~15 | ~2000 | 多个 |
| **合计** | ~55 | ~12000 | **149 测试全部通过** |

### 1.3 模块依赖关系

```
experiments/v2/run.ts
  └── src/lib/discussion/index.ts (DiscussionEngine)
        ├── src/lib/governance/index.ts (GovernanceEngine)
        ├── src/lib/observation/index.ts (ObservationLayer)
        ├── src/lib/inference/index.ts (InferenceLayer)
        └── src/lib/evaluation/index.ts (EvaluationEngine)

src/runtime/GovernanceRuntime.ts
  ├── src/lib/governance/index.ts
  ├── src/lib/evaluation/index.ts
  └── src/runtime/adapters/* (CustomAdapter / AutoGenAdapter / StateInferenceBridge)
```

**关键观察**：实验路径（`run.ts` → `DiscussionEngine`）与生产路径（API → `pipeline.ts` → `GovernanceRuntime` + adapter）是**两套独立代码**，行为可能不一致。`pipeline.ts` 中存在 `Math.random()` 破坏可复现性，但实验路径不走 `pipeline.ts`，所以实验可复现性不受影响。

---

## 二、核心逻辑

### 2.1 治理引擎（GovernanceEngine）

**诊断-干预-评估三段式**：

```
diagnoseAndIntervene(agentBeliefs, messages, config)
  ├── detectEchoChamber        → infoRedundancyScore = (1-std/2)×0.5 + contentSim×0.5
  ├── detectAuthorityBias      → influenceRatio = max(references)/totalReferences
  ├── detectPolarization       → polarizationIndex = std; BC = (skewness²+1)/kurtosis
  ├── detectPrematureConsensus → consensusLevel = max(0, 1 - std×2); roundProgress < 0.35
  │
  ├── [自适应剂量] computeAdaptiveDosage(severity, infoCoverage, history, round, agents)
  │
  └── applyInterventions(interventions, state)
        ├── reduceWeight         → edge.weight × (1 - factor)
        ├── introduceDiversity   → belief += (random-0.5) × perturbation × 2
        ├── forceReflection      → belief += (mean-belief) × factor; confidence -= 5
        └── continueDiscussion   → 若 coverage ≥ 0.60 则沉默，否则注入未讨论信息
```

**关键设计亮点**：
- `continueDiscussion` 的 coverage 守门逻辑（≥60% 沉默）避免过度干预
- `detectAuthorityBias` 已从"消息计数"修复为"引用网络份额"
- `detectPolarization` 引入双峰系数 BC 区分真极化与均匀高方差

### 2.2 运行时与适配器

**框架无关性通过三层契约实现**：

1. **类型层**：`DiscussionMessage` / `Intervention` / `FrameworkMessage` 框架无关
2. **接口层**：`GovernanceBridge` 定义 `adaptMessages` / `applyIntervention` / `extractBeliefs` 三方法
3. **运行时层**：`GovernanceRuntime` 不感知适配器存在

**三个适配器实现状态**：

| 适配器 | adaptMessages | applyIntervention | extractBeliefs | 实际可用性 |
|--------|---------------|-------------------|----------------|-----------|
| CustomAdapter | ✓ 完整 | ✓ 修改 agent state | ✓ | 完全可用 |
| AutoGenAdapter | ✓ 完整 | ✗ 显式抛错 | ✓ | 仅 detect-only 模式 |
| StateInferenceBridge | ✓ 三级提取 | △ 静默成功风险 | ✓ 双路径 | 需 injectPrompt 回调 |

### 2.3 讨论引擎主循环

```
for round = 1 to maxRounds:
  1. [可选] Dropout 选择
  2. [可选] 拓扑分区（Flat / Grouped / Committee-stub）
  3. observeAgents → 顺序发言（后发言者可见前发言者）
     ├── 个性化记忆：只看自己说的 + 别人 @ 自己的
     └── buildPrompt 注入 belief/confidence 状态 + governancePrompts
  4. [可选] 交叉质证（仅 round ≤ 2 且分歧 std > 0.3）
  5. 记录 RoundResult + 更新交互图
  6. 收敛检查（V2 per-item std; V1 整体 std 回退）
  7. 信念更新（inferenceLayer.infer，非 beliefUpdateManager）
  8. 治理（none/detect-only/random-intervene/full 四模式）
```

### 2.4 评估引擎五维

| 维度 | 权重 | 核心指标 | 数学原理 |
|------|------|----------|----------|
| Consensus | 0.20 | Kuramoto 序参量 R | `R = |Σⱼ e^(iπbⱼ)| / N` |
| Reliability | 0.25 | Cronbach's α | `α = (k/(k-1))·(1 - Σσ²ᵢ/σ²_total)` |
| Dispersion | 0.20 | 信念/置信度/轮次标准差 | 总体标准差（÷n） |
| Stability | 0.17 | 轮间一致性 + 时间序列稳定性 | 相对第 1 轮的偏离 |
| InfluenceAnalysis | 0.18 | Gini + 密度 + 平均路径长度 | `G = Σᵢⱼ|xᵢ-xⱼ|/(2n²μ)` |

### 2.5 实验与统计

**实验流程**：
```
run.ts:
  for ablation in ["none", "full"]:        ← 注意：仅 2 模式，非注释声称的 4 模式
    for i in 0..14:
      makeLLMConfig(seed = 42 + i)
      createAgents(task_invest)             ← 单任务
      DiscussionEngine.run(5 rounds)
      extractRanking(V2 itemBeliefs 聚合 + V1 indexOf 回退)
      kendallTau(groundTruth, extracted)
      write JSON

analyze.ts:
  loadData → 过滤 r.error
  permutationTest(n=10000, mulberry32 PRNG)
  bootstrapMeanDiff(Welch t 分布 CI)
  Bonferroni + BH FDR 多重比较校正
  Δτ 组内轨迹（扣减基线点估计）
```

---

## 三、数学原理

### 3.1 偏差检测器数学

#### 回音室检测
```
infoRedundancyScore = (1 - σ_belief/2) × 0.5 + Jaccard_similarity × 0.5
触发阈值: score ≥ 0.5
```
其中 Jaccard 相似度对所有消息对计算（词长 > 2），取平均。

#### 权威偏差检测
```
influenceRatio = max(referenceCount_i) / Σ referenceCount_i
触发阈值: ratio ≥ 0.25
回退（无引用数据）: ratio = max(contentLength_i) / Σ contentLength_i
```

#### 极化检测
```
polarizationIndex = σ_belief（原始标准差，未归一化）
bimodalityCoefficient BC = (skewness² + 1) / kurtosis
触发条件: (σ ≥ 0.30 AND BC > 0.555) OR (σ ≥ 0.45)
```
BC > 0.555 是 SAS JMP 的双峰分布判定标准。

#### 过早共识检测
```
consensusLevel = max(0, 1 - σ_belief × 2)
roundProgress = currentRound / maxRounds
触发条件: roundProgress < 0.35 AND consensusLevel > 0.55 AND σ < 0.20
```

### 3.2 自适应阈值

```
θ_adapted = clamp(θ_base × scale_factor(calibration), [min, max])

scalePrematureConsensus = 0.7 + convergenceSpeed × 0.6      ∈ [0.7, 1.3]
scaleEchoChamber         = 0.85 + baseRedundancy × 0.3       ∈ [0.85, 1.15]
scaleAuthorityBias       = 0.8 + baseConcentration × 0.4     ∈ [0.8, 1.2]
scalePolarization        = 0.8 + min(baseDispersion, 1) × 0.5 ∈ [0.8, 1.3]
```

### 3.3 自适应剂量

```
continue_discussion: ΔT = ⌈T_max × max(0, 0.5 - progress) × (1 - coverage) × (1 + max(0,-hist)×0.5)⌉
reduce_weight:       reduction = 0.3 + severity × 0.4 × (2 - coverage) × (1 - hist×0.5)
force_reflection:    strength = 0.15 + severity × 0.35 × (1 - coverage) × (1 + hist×0.3)
introduce_diversity: perturbation = 0.15 + severity × 0.25 × (1 - coverage)
```
所有结果 clamp 到指定区间。

### 3.4 评估指标数学

#### Kuramoto 序参量（实现版本）
```
θ_j = π × b_j            （b ∈ [-1,1] → θ ∈ [-π,π]）
R = |Σⱼ e^(iθⱼ)| / N = √((Σcos θⱼ)² + (Σsin θⱼ)²) / N
```

#### Cronbach's α（实现版本）
```
k = 轮次数（作为 item）
σ²ᵢ = 第 i 轮内 agent 信念的样本方差
σ²_total = 所有轮次所有 agent 信念的混合方差
α = (k/(k-1)) × (1 - Σσ²ᵢ / σ²_total)
```

#### Gini 系数
```
G = Σᵢⱼ|xᵢ - xⱼ| / (2n²μ)
```
其中 xᵢ 是各 agent 的消息贡献占比。

### 3.5 统计检验数学

#### Kendall τ-b
```
τ_b = (C - D) / √((n₀ - n₁)(n₀ - n₂))
n₀ = n(n-1)/2, n₁ = Σ tₓ(tₓ-1)/2, n₂ = Σ tᵧ(tᵧ-1)/2
```

#### 置换检验
```
H₀: 两组同分布
p = #{|permDiff| ≥ |obsDiff|} / nPerm,  nPerm = 10000
PRNG: mulberry32(seed = 42 + 0x50E8)
```

#### Welch t 分布 CI
```
SE = √(sₐ²/nₐ + s_b²/n_b)
df = (sₐ²/nₐ + s_b²/n_b)² / ((sₐ²/nₐ)²/(nₐ-1) + (s_b²/n_b)²/(n_b-1))
CI = obsDiff ± t_{df, α/2} × SE
```

#### 多重比较校正
```
Bonferroni: α' = α / nTests
BH FDR: 第 i 小 p 值的临界值 = (α × i) / nTests
```

---

## 四、硬伤清单（按严重性排序）

### 致命级（影响实验结论可信度）

#### H1. 治理环路断裂 bug（已修复但实验未重跑）
- **位置**：`buildPrompt`（discussion/index.ts）
- **问题**：2026-07-12 修复前，`buildPrompt` 未注入 agent 当前 belief/confidence，导致 `reduce_weight`、`belief_perturbation`、`force_reflection` 三类 state modification 干预对 LLM 不可见。治理环路实际断裂。
- **影响**：**此前所有实验结论（3轮 d=+0.65 不显著、5轮 d=+0.00）均在环路断裂状态下得出**。代码已修复（commit 08b20fb），但实验数据未重跑。
- **状态**：代码闭合，149/149 测试通过，未跑实验验证实际效果。

#### H2. PARAMS.ablationModes 与注释不符 [已修复 2026-07-12: 扩展为 7 种]
- **位置**：`experiments/v2/run.ts` 第 120 行
- **问题**：文件头注释声称 `"1 task (M&A) × 4 ablation modes × 15 runs = 60 experiments"`，但 `PARAMS.ablationModes = ["none", "full"]` 实际只跑 2 模式×15=30 实验。
- **影响**：单干预消融（`full_diversity`/`full_weight`/`full_reflection`/`full_continue`）和 shuffle 控制的代码全部存在但从未被启用。`analyze.ts` 中对应分析分支永远走不到。

#### H3. 单任务实验
- **位置**：`run.ts` 第 581 行 `const task = TASK_INVEST`
- **问题**：整个 V2 实验只有 1 个 Hidden Profile 投资任务。结论无法推广——可能只是该任务的特殊 artifact。

#### H4. Kuramoto 序参量映射缺陷 [已修复 2026-07-12]
- **位置**：`evaluation/index.ts` 第 778-789 行
- **问题**：`θ = π × b` 将 belief ∈ [-1,1] 映射到 [-π,π]。当 b=+0.99 和 b=-0.99 时，角度为 +0.99π 和 -0.99π，在单位圆上几乎重合（都在 (-1,0) 附近），R ≈ 1（高共识）。
- **影响**：**两个极端对立的 agent 会被计算为高度同步**。在双峰极化场景下给出严重误导性的高共识分数。
- **正确做法**：应使用 `θ = (b+1)π` 映射到 [0, 2π]，或 `θ = b × π/2` 映射到 [-π/2, π/2]。

### 严重级（影响特定模块正确性）

#### H5. Cronbach's α 解释方向错误
- **位置**：`evaluation/index.ts` 第 280-314 行
- **问题**：实现将**轮次作为 item**，注释声称"High α → agents maintain consistent relative belief rankings across rounds"。但高 α 实际意味着"轮内方差之和相对总方差较小"，即轮间方差占主导——agent 信念在不同轮次间变化大。
- **影响**：要测"agent 排名一致性"，应转置矩阵（agent 作为 item）。当前实现测的是"轮次作为重复测量的一致性"，语义偏向"讨论整体稳定性"而非"个体一致性"。

#### H6. convergenceSpeed 语义反转 [已修复 2026-07-12: 注释纠正，公式方向正确]
- **位置**：`adaptiveThresholds.ts` `computeCalibrationMetrics`
- **问题**：`convergenceSpeed = convergenceRounds / maxRounds`，值大=慢收敛。但 `scalePrematureConsensus` 注释假设"speed 大 = 快收敛"，从而降低过早共识阈值。
- **影响**：收敛慢的群体被误判为快收敛，错误地降低过早共识阈值——与设计意图完全相反。

#### H7. stripGovTag 正则 bug
- **位置**：`PromptInjector.ts` 第 110 行
- **问题**：`stripGovTag` 用非贪婪 `[\s\S]*?`，而 `extractGovTag` 用贪婪 `[\s\S]*`。当 [GOV] 标签含 `itemBeliefs` 数组时，`stripGovTag` 会匹配到第一个 `}`（数组元素的闭合括号），清理后 content 残留 `}]}`。
- **影响**：所有使用 StateInferenceBridge 且 agent 输出 itemBeliefs 的场景，传给运行时的 content 字段包含 JSON 残片。

#### H8. 8 种干预类型仅 4 种实现
- **位置**：`governance/types.ts` 定义 8 种 `InterventionType`，`interventions/` 仅实现 4 种
- **问题**：`break_connections`、`introduce_dissent`、`pair_opposites`、`none` 无策略实现。但 `detectEchoChamber`（medium/heavy → break_connections）、`detectAuthorityBias`（light → introduce_dissent）、`detectPolarization`（light → pair_opposites）会推荐这些未实现类型。
- **影响**：`applyInterventions` 遇到未注册类型返回 `success: false`，形成"检测到但无法干预"的断层。

#### H9. 交叉质证让步检测无法区分否定语境
- **位置**：`crossExamination.ts` 第 352-373 行 `computeBeliefShift`
- **问题**：关键词匹配 `["承认", "同意", "有道理", "确实", "correct", "agree", ...]` 无法识别否定。`"我不同意"` 包含 `"同意"` 会触发让步；`"这不正确"` 包含 `"正确"` 会触发让步。
- **影响**：否定语境下的关键词被误判为让步，导致信念朝错误方向移位。

#### H10. 影响力图构建与影响力管理器不一致
- **位置**：`interactionGraph.ts` vs `influence.ts`
- **问题**：`InteractionGraphBuilder.updateFromOpinions` 注释说"只建 reference 边，不再用 belief/confidence 数值差推断"，但 `RuleBasedInfluence.applyAllInfluences` 仍通过 `determineInfluenceType` 的数值回退路径生成 agreement/disagreement/persuasion 边。
- **影响**：图中同时存在两类边——纯 reference 边（权重 0.5）和数值推断的四类边。`INFLUENCE_DISAGREEMENT_BELIEF_THRESHOLD` 等数值阈值仍在活跃，与"用语义引用替代数值推断"的修复目标矛盾。

### 中等级（影响精度但不阻断运行）

#### H11. Dropout SUTVA 违反
- **位置**：`discussion/index.ts` 第 213-238 行
- **问题**：先丢弃 agent 跑群体讨论，再单独跑被丢弃 agent，最后把它的意见合并回 `opinions`。最终 `opinions` 仍包含被丢弃 agent 的意见。
- **影响**：后续图更新、信念更新、治理都基于完整 agent 集合，dropout 的反事实语义被破坏。`sensitivityTrace.ts` 注释明确承认此问题。

#### H12. onMessage 是死代码
- **位置**：`GovernanceRuntime.ts` 第 403-429 行
- **问题**：方法注释声称"runs lightweight detection when enough data is available"，但实现只更新 belief 和缓冲消息，**无任何检测/干预逻辑**。
- **影响**：流式接口无法触发治理行为。`onMessage` 与 `processRound` 之间无协作契约。

#### H13. StateInferenceBridge.applyIntervention 静默成功
- **位置**：`StateInferenceBridge.ts` 第 176-185 行
- **问题**：无 `injectPrompt` 回调时仅打印日志但仍返回 `true`，并递增 `interventionsTranslated` 统计。
- **影响**：与 AutoGenAdapter 的"显式抛错"哲学不一致，虚增成功率统计，误导调用方。

#### H14. 双轨干预无同步
- **位置**：`GovernanceRuntime.ts` processRound
- **问题**：引擎内模拟（`applyInterventions` 在 `govState` 上修改 belief）与外部应用（适配器 `applyIntervention`）之间无同步机制。`evaluateEffects` 测量的是引擎内模拟效果，不是真实效果。
- **影响**：若模拟与真实效果偏差大，自适应剂量会优化错误的目标。

#### H15. 交叉质证阵营统一移位
- **位置**：`discussion/index.ts` 第 1346-1364 行 `applyCrossExaminationShifts`
- **问题**：同一阵营所有成员应用相同的 `round.beliefShift`，无视个体差异。
- **影响**：5 个阵营成员被加上同一个 shift 值，丢失个体异质性。

#### H16. Gini 衡量发言数量而非影响力
- **位置**：`evaluation/index.ts` 第 486-498 行
- **问题**：Gini 计算的是消息贡献占比（发言数量）不平等，`influenceWeight = confidence/100` 是极粗糙代理。
- **影响**：高置信度 ≠ 高影响力。真正应基于引用网络或 dropout 效应。

#### H17. 缓存污染 bug [已修复 2026-07-12]
- **位置**：`run.ts` 第 602-606 行
- **问题**：错误占位文件写入磁盘后，`fs.existsSync(filename)` 会命中缓存跳过，永不重试。
- **影响**：失败的实验永远不会被重跑。

#### H18. interventionPrompt.ts 重构未完成 [已修复 2026-07-12: 8 处接入]
- **位置**：`governance/interventionPrompt.ts`
- **问题**：提供 `formatInterventionPrompt(body)` 旨在消除重复模板，但 4 个策略文件全部手写 header/footer，**无一调用**该格式化器。
- **影响**：重构目标与实现完全脱节，重复代码仍存在。

### 轻微级（不影响核心功能）

#### H19. 非确定性随机扰动 [已修复 2026-07-12: mulberry32 seeded PRNG]
- `introduceDiversity.ts` 用 `Math.random()` 修改 belief，破坏可复现性
- `pipeline.ts` 的 `confidence` 回退值用 `Math.random()`
- `AutoGenAdapter.ts` 引用不存在的 `this.options.sidecarUrl` 字段

#### H20. 标准差不统一 [已审计 2026-07-12: 保留现状]
- `statsUtils.std` 是总体标准差（÷n）
- `statsUtils.sampleStd` 是样本标准差（÷(n-1)）
- `evaluation/index.ts` 的 Dispersion 用总体，Reliability 的 `computeVariance` 用样本
- `run.ts` 和 `analyze.ts` 各自内联实现样本标准差，未 import `statsUtils`

#### H21. T 分布表稀疏
- `analyze.ts` 的 `T_TABLE_005` 缺 11/13/16-18/21-23/26-28 等值，依赖线性插值

#### H22. seed 可复现性局限
- DeepSeek/OpenAI 的 seed 是 best-effort，非严格确定
- Anthropic 完全不支持 seed
- 所有 agent 共享同一 seed，prompt 相同时会产生相同输出

---

## 五、面向痛点

### 5.1 项目试图解决的核心痛点

**痛点：多 Agent 讨论系统存在系统性认知偏差（回音室、权威偏差、极化、过早共识），导致决策质量低下。**

SwarmAlpha 的应对策略：

| 痛点 | 检测方法 | 干预手段 | 实际有效性 |
|------|----------|----------|-----------|
| 回音室 | 信念 std + 内容 Jaccard 相似度 | 多样性注入（随机扰动 belief） | 未验证 |
| 权威偏差 | 引用网络份额 ≥ 0.25 | 权重削减 + prompt 提示 | 未验证 |
| 极化 | std + 双峰系数 BC | 强制反思（拉向均值） | 未验证 |
| 过早共识 | 共识水平 + 轮次进度 | 继续讨论 + 注入未讨论信息 | 未验证 |

### 5.2 痛点解决的实际状态

**核心结论：所有治理对比的统计检验 p ≥ 0.36，均不显著。唯一显著结果是 M&A Shuffle（p=0.0009），但这是反向证据（打乱知识破坏信息一致性）。**

这意味着：
- 治理系统**未能证明**其有效性
- 在 3 轮有限讨论中，治理有方向性正向趋势（Δτ=+0.133）但 n=5 不显著
- 在 5 轮充分讨论中，治理反而有害（full_reflection: p=0.048, ΔQ=-22.2）

**重要前提**：上述结论均在治理环路断裂状态下得出（H1）。修复后需重跑实验才能得出可靠结论。

### 5.3 痛点未覆盖的部分

1. **真实对话历史缺失**：agent 看到的是结构化记忆摘要，非真实对话文本
2. **影响力推断基于数值差而非真实说服**：`determineInfluenceType` 的回退路径仍用 belief 差值推断
3. **框架适配局限**：AutoGen 无法应用干预，CrewAI/LangGraph 未实现
4. **任务多样性不足**：仅 Hidden Profile 投资任务，未覆盖开放性决策、创意任务等
5. **单模型验证**：仅 deepseek-chat，未跨模型验证

---

## 六、统计方法正确性评估

### 6.1 正确实现的部分

| 方法 | 评价 |
|------|------|
| Kendall τ-b | ✓ 正确，含精确 tie 修正 |
| 置换检验 | ✓ 正确，Fisher-Yates 部分洗牌，独立 seed 流 |
| Welch t CI | ✓ 正确，Satterthwaite df，小样本 guard |
| Bootstrap 百分位 CI | ✓ 正确，10000 次重采样 |
| Bonferroni 校正 | ✓ 正确，α/nTests |
| BH FDR 校正 | △ 基本正确，未做阶梯调整（小 m 影响小） |
| Cohen's d | ✓ 正确，池化标准差 |
| mulberry32 PRNG | ✓ 正确，确定性可复现 |

### 6.2 存在缺陷的部分

| 问题 | 影响 |
|------|------|
| 置换检验 p=0 未做 `(count+1)/(nPerm+1)` 校正 | 过度自信 |
| Δτ 扣减基线用点估计 | CI 偏窄，低估不确定性 |
| Shuffle 阈值 0.1/0.3/0.5 缺功效分析 | 阈值经验值无依据 |
| 样本量 n=15 对 d=0.5 功效约 0.42 | 低于 0.8 惯例，需 n≈64 |

### 6.3 统计方法总评

**统计分析框架本身是严谨且方法论正确的**——使用置换检验（非参数）而非 bootstrap p-value（循环推理），使用 Welch t（不等方差）而非 Student t，同时报告 Bonferroni 和 BH FDR，扣减基线 Δτ。这些选择符合现代统计最佳实践。

**主要短板在实验设计层面**（样本量、单任务、单模型、治理环路 bug）而非统计方法层面。

---

## 七、综合评估

### 7.1 工程质量

**优点**：
- 架构分层清晰，框架无关性设计良好
- 149 测试全部通过
- 魔法数字集中管理
- 显式失败优于静默成功（AutoGenAdapter）
- 深拷贝防别名（processRound）

**缺陷**：
- 多处死代码（onMessage、beliefUpdateManager、interventionPrompt.ts）
- 多处重构未完成（stripGovTag 正则、干预类型断层）
- 非确定性随机扰动影响可复现性
- 实验路径与生产路径代码不一致

### 7.2 科学严谨性

**优点**：
- 统计方法选择正确（置换检验、Welch t、BH FDR）
- 文档诚实标注未实现功能（LIMITATIONS.md）
- Shuffle 对照组设计意图正确（识别回归均值）

**缺陷**：
- 核心假设未验证（所有 p ≥ 0.36）
- 单任务、单模型、小样本
- 治理环路断裂 bug 使此前后所有结论存疑
- Kuramoto 序参量映射缺陷使共识评估在极化场景下误导

### 7.3 数学原理评估

**正确实现**：
- Kendall τ-b 含 tie 修正
- 置换检验 Fisher-Yates
- Welch-Satterthwaite df
- Gini 系数公式
- 双峰系数 BC = (skewness²+1)/kurtosis

**存在缺陷**：
- Kuramoto 序参量映射（θ=πb 使极端对立被判为高共识）
- Cronbach's α 解释方向（轮次作为 item 测的不是个体一致性）
- convergenceSpeed 语义反转
- 自适应剂量系数为硬编码魔数，无理论依据

### 7.4 面向痛点的实际解决能力

**当前状态**：系统完整实现了"检测-干预-评估"闭环，但**未能证明治理有效性**。在修复治理环路断裂 bug（H1）并重跑实验前，无法判断治理系统是否真正解决其面向的痛点。

**最关键的待办事项**：
1. 修复 H1 后重跑全部实验（当前所有结论存疑）
2. 修复 H2（扩展 ablationModes 到完整列表）
3. 修复 H4（Kuramoto 映射）和 H6（convergenceSpeed 语义）
4. 扩展任务多样性（解决 H3）
5. 跨模型验证（解决单模型局限）

---

## 八、文件路径索引

### 核心治理引擎
- [governance/index.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts) — 4 检测器 + diagnoseAndIntervene + applyInterventions + evaluateEffects
- [governance/types.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/types.ts) — InterventionType（8 种）/ GovernanceConfig / BiasDetector
- [governance/adaptiveThresholds.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/adaptiveThresholds.ts) — 4 个 scale 函数 + computeCalibrationMetrics
- [governance/adaptiveDosage.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/adaptiveDosage.ts) — 4 个剂量公式 + computeHistoryEffectiveness
- [governance/interventions/](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/interventions/) — 4 个策略实现 + interventionPrompt.ts（未完成重构）

### 运行时层
- [runtime/GovernanceRuntime.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/GovernanceRuntime.ts) — processRound + onMessage（死代码）+ recordEffectsFromMetrics
- [runtime/adapters/CustomAdapter.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/adapters/CustomAdapter.ts) — 完整实现
- [runtime/adapters/AutoGenAdapter.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/adapters/AutoGenAdapter.ts) — applyIntervention 抛错
- [runtime/adapters/StateInferenceBridge.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/adapters/StateInferenceBridge.ts) — 三级提取 + 静默成功风险
- [runtime/adapters/PromptInjector.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/adapters/PromptInjector.ts) — stripGovTag 正则 bug

### 讨论引擎
- [discussion/index.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts) — DiscussionEngine 主循环（1397 行）
- [discussion/crossExamination.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/crossExamination.ts) — 让步检测关键词匹配缺陷
- [discussion/influenceUtils.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/influenceUtils.ts) — 4 类影响力权重公式
- [discussion/interactionGraph.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/interactionGraph.ts) — 只建 reference 边
- [discussion/beliefUpdate.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/beliefUpdate.ts) — RuleBasedBeliefUpdate（死代码）

### 评估引擎
- [evaluation/index.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts) — 5 维评估（Kuramoto 映射缺陷、α 解释错误）

### 实验框架
- [experiments/v2/run.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/run.ts) — PARAMS.ablationModes 不符 + 缓存污染 bug
- [experiments/v2/analyze.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/analyze.ts) — 置换检验 + Welch t + BH FDR
- [experiments/v2/task_invest.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/task_invest.ts) — Hidden Profile V2 单任务

### 基础设施
- [lib/constants.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/constants.ts) — 魔法数字集中管理
- [lib/utils/statsUtils.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/utils/statsUtils.ts) — std/sampleStd 不统一
- [lib/llm/providers.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/llm/providers.ts) — seed 支持不完整
- [lib/pipeline.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/pipeline.ts) — Math.random() 破坏可复现性

---

## 九、结论

SwarmAlpha 是一个**架构设计完整、统计方法严谨、但核心假设未验证**的多 Agent 治理系统。

**工程层面**：框架无关性设计良好，149 测试通过，但存在多处死代码和未完成重构。致命级硬伤 H1（治理环路断裂）已修复但实验未重跑，使当前所有实验结论存疑。

**科学层面**：统计方法选择正确（置换检验、Welch t、BH FDR），但实验设计存在根本缺陷（单任务、单模型、小样本）。核心假设"治理能改善决策质量"未得到统计支持（所有 p ≥ 0.36）。

**数学层面**：大部分公式实现正确，但 Kuramoto 序参量映射（H4）和 Cronbach's α 解释方向（H5）存在根本性缺陷，convergenceSpeed 语义反转（H6）导致自适应阈值逻辑错误。

**最紧迫的优先级**：
1. **重跑实验**（修复 H1 后，当前结论全部存疑）
2. **修复 Kuramoto 映射**（H4，影响共识评估正确性）
3. **修复 convergenceSpeed 语义**（H6，影响自适应阈值正确性）
4. **扩展 ablationModes**（H2，启用单干预消融和 shuffle 控制）
5. **增加任务多样性**（H3，解决单任务推广性问题）

在完成上述修复并重跑实验前，**不应将当前实验结论作为治理有效性的证据**。

---

### 更新（2026-07-12）

**4 个认知缺陷已修复，治理环路闭合**：状态感知、对话历史、顺序发言、影响力网络 4 个导致治理环路断裂的认知缺陷已全部修复（commit 08b20fb），149/149 测试通过。治理干预现在对 LLM 真正可见，治理环路实际闭合。

**7 个硬伤已修复**：H4（Kuramoto 映射 θ=πb → θ=πb/2）、H6（convergenceSpeed 注释纠正）、H2（ablationModes 扩展为 7 种）、H19（mulberry32 seeded PRNG）、H17（缓存污染修复）、H18（interventionPrompt 8 处接入）均已修复；H20（标准差不统一）经审计保留现状（描述用总体标准差、推断用样本标准差，语义一致）。

**所有此前实验结论存疑，待重跑**：由于 4 个认知缺陷修复前治理环路实际处于断裂状态，此前所有实验结论（3轮 d=+0.65 不显著、5轮 d=+0.00、full_reflection p=0.048 等）均在环路断裂状态下得出，**结论存疑，需在治理环路闭合后重跑全部实验**才能得出可靠结论。
