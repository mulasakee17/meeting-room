# SwarmAlpha 项目整体评估

> 基于源码审计与实验脚本实际输出的客观评估。所有结论引用具体代码位置。

---

## 1. 代码规模与结构

| 指标 | 数值 |
|------|------|
| 源代码文件（.ts/.tsx） | 103 个 |
| 总代码行 | ~18,400 行 |
| src/lib（核心库） | ~13,800 行 |
| experiments（实验框架） | ~2,900 行 |
| test（测试） | ~1,600 行 |
| 测试文件 | 11 个 |
| 测试用例 | 112 个 |

### 模块分布与职责

```
src/lib/
├── discussion/     13 文件 — 讨论引擎、信念更新、影响力、交叉质证、拓扑、因果追踪
├── governance/      9 文件 — 4 检测器 + 4 干预 + 自适应阈值/剂量 + BiasDetector 接口 + 干预提示词模板
├── evaluation/      2 文件 — 五维评估（共识/可靠/离散/稳定/影响力）
├── observation/     2 文件 — LLM 输出解析（V2 已加 itemBeliefs）
├── inference/       2 文件 — 信念演化推断
├── adapters/        3 文件 — AutoGen/Custom 框架适配器
├── runtime/         7 文件 — GovernanceRuntime SDK、事件总线、调度器
├── llm/             1 文件 — 多提供商抽象（DeepSeek/OpenAI/Claude）
├── security/        3 文件 — 速率限制、输入验证
├── benchmarks/      2 文件 — 基准测试
└── utils/           6 文件 — 日志、重试、情绪 + Registry/JSON/统计工具
```

### 架构模式与代码证据

**管道架构**：DiscussionEngine.run()（[discussion/index.ts:129](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L129)）的主循环明确分为 7 个阶段：

```
initialize → observe → parse → graph → trace → converge? → belief update → govern → record
```

代码中每一步都有对应的 eventTracker 追踪（[index.ts:174-310](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L174)），形成完整的可观测管道。

**策略模式**：StrategyRegistry（[index.ts:109-116](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L109)）注册了 3 种可插拔策略：

```typescript
this.strategyRegistry.register(new RuleBasedBeliefUpdate());
this.strategyRegistry.register(new RuleBasedInfluence());
this.strategyRegistry.register(new InMemoryStrategy());
```

信念更新（[beliefUpdate.ts:30](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/beliefUpdate.ts#L30)）、影响力计算、记忆管理均通过接口注入，不绑定具体实现。

**适配器模式**：GovernanceRuntime（[runtime/GovernanceRuntime.ts:38-59](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/GovernanceRuntime.ts#L38)）通过 `AdapterRegistry` + `CustomAdapter` / `AutoGenAdapter` 桥接不同框架，核心治理引擎零框架依赖。

**事件总线**：DiscussionEvent 全流程追踪，从 `round_start` → `belief_update` → `intervention` → `round_end` → `decision`，每个事件都带 timestamp 和 payload。

---

## 2. 核心模块详解

### 2.1 讨论引擎（DiscussionEngine）

**位置**：[discussion/index.ts:63-117](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L63)

DiscussionEngine 是整个系统的中枢，持有 10 个协作组件：

```typescript
private memoryManager: MemoryManager;        // 记忆管理
private beliefUpdateManager: BeliefUpdateManager;  // 信念更新
private influenceManager: InfluenceManager;   // 影响力计算
private graphBuilder: InteractionGraphBuilder; // 交互图
private traceBuilder: DecisionTraceBuilder;    // 决策追踪
private governanceEngine: GovernanceEngine;    // 治理引擎
private eventTracker: EventTracker;            // 事件追踪
private observationLayer: ObservationLayer;    // 观察层
private inferenceLayer: InferenceLayer;        // 推断层
private opinionParser: OpinionParser;          // 输出解析器
```

**主循环**（[index.ts:166-314](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L166)）每轮执行：

1. **Dropout 分析**（[index.ts:179-184](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L179)）：可选地移除一个智能体，对比"有/无"两种条件下的信念差异
2. **拓扑分组**（[index.ts:192-210](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L192)）：如果智能体数超过 `maxGroupSize`，按拓扑策略分组讨论
3. **收集意见**（[index.ts:209](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L209)）：调用 `runRound()` 让每个智能体发言
4. **交叉质证**（[index.ts:241-254](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L241)）：如果检测到分歧且启用，触发对立阵营辩论
5. **图更新**（[index.ts:262](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L262)）：更新交互图
6. **收敛检查**（[index.ts:269](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L269)）：如果收敛则提前结束
7. **信念更新**（[index.ts:273](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L273)）：根据他人意见更新信念
8. **治理**（[index.ts:283](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L283)）：检测偏差 → 干预

**信念更新机制**（[beliefUpdate.ts:30-79](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/beliefUpdate.ts#L30)）：

RuleBasedBeliefUpdate 实现了一个加权社会影响模型：

- 高置信度智能体的影响力系数（`BELIEF_HIGH_CONF_PULL_COEFF`）大于低置信度
- 同意多数人时获得置信度加成（`BELIEF_AGREEMENT_CONFIDENCE_BONUS`），反对时受罚
- 信念变化 = Σ(他人信念差 × 系数)，受到 agreement/disagreement/convergence 三种调节

**代码评价**：信念更新模型有 16 个可调常数（[constants.ts 导入](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/beliefUpdate.ts#L5)），参数化程度高，但缺少自动校准机制——这些常数目前是手动设定的。

---

### 2.2 治理引擎（GovernanceEngine）

**位置**：[governance/index.ts:44-84](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L44)

#### 4 个偏差检测器

| 检测器 | 代码位置 | 检测逻辑 | 阈值来源 |
|--------|---------|---------|---------|
| 回声室 | [index.ts:174-210](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L174) | `(1-normalizedStd)×0.5 + contentSimilarity×0.5 ≥ threshold` | `GOVERNANCE_ECHO_CHAMBER_THRESHOLD` |
| 权威偏差 | [index.ts:212-247](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L212) | `maxMessages / totalMessages ≥ threshold` | `GOVERNANCE_AUTHORITY_BIAS_THRESHOLD` |
| 极化 | [index.ts:249-278](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L249) | `beliefStd ≥ threshold` + K-means 聚类 | `GOVERNANCE_POLARIZATION_THRESHOLD` |
| 过早共识 | [index.ts:280-324](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L280) | `roundProgress < threshold && consensusLevel > 0.8 && beliefStd < 0.1` | `GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD` |

**代码评价**：

- 回声室检测的 `computeContentSimilarity`（[index.ts:332-348](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L332)）用 Jaccard 相似度比较消息的词汇集合——这是粗糙的文本相似度，无法区分"用了相同的词但表达了相反观点"的情况
- 权威偏差检测仅看发言条数占比（[index.ts:227-231](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts#L227)），不看内容影响力——一个说废话的智能体也会被判定为"权威"
- 极化检测的聚类方法（`clusterAgentsByBelief`）未在代码中展示完整实现，但从阈值判断是简单的信念值二分法
- 过早共识检测的 `consensusLevel = 1 - beliefStd × K` 是合理的，但 `K`（`GOVERNANCE_CONSENSUS_LEVEL_FACTOR`）的值未经校准

#### 4 个干预策略

| 干预 | 代码位置 | 机制 | 副作用 |
|------|---------|------|--------|
| 多样性注入 | [introduceDiversity.ts:6-49](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/interventions/introduceDiversity.ts#L6) | 1. 信念扰动 ±0.3  2. 注入"说出一个你可能错的场景"的 prompt | 信念随机扰动可能过度干扰 |
| 权重削减 | [reduceWeight.ts:6-55](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/interventions/reduceWeight.ts#L6) | 1. 图边权重 ×0.5  2. 注入"不要听从 X"的 prompt | 削减后的权重不可恢复 |
| 强制反思 | [forceReflection.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/interventions/forceReflection.ts) | 注入"反思对立观点"的 prompt | 仅影响 prompt，不改信念值 |
| 延长讨论 | [continueDiscussion.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/interventions/continueDiscussion.ts) | 追加讨论轮数 | 增加 LLM 调用成本 |

**关键发现**：多样性注入是唯一同时修改**信念值**和**prompt**的干预（[introduceDiversity.ts:25-48](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/interventions/introduceDiversity.ts#L25)）。其他三个干预要么只改 prompt，要么只改图权重。这解释了为什么实验中 `full_diversity` 是唯一显著的单干预——它对智能体状态的修改最深入。

#### 自适应阈值

**位置**：[governance/adaptiveThresholds.ts:1-80](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/adaptiveThresholds.ts#L1)

核心思路是先跑一轮校准讨论，测量群体的自然行为特征，再据此调整阈值：

```typescript
// 快收敛群体 → 降低过早共识阈值（更容易触发，因为"快"可能是假快）
function scalePrematureConsensus(calib): number {
  return 0.7 + calib.convergenceSpeed * 0.6;  // [0.7, 1.3]
}

// 高冗余度群体 → 提高回音室阈值（更宽容，避免把风格相似误判为回声室）
function scaleEchoChamber(calib): number {
  return 0.85 + calib.baseRedundancy * 0.3;  // [0.85, 1.15]
}
```

**代码评价**：设计理念正确（"一刀切阈值不合理"），但缩放函数是线性的且范围窄（±15~30%），实际影响有限。更重要的是，`GovernanceEngine.withAdaptiveThresholds()` 需要外部传入 `CalibrationMetrics`——但实验中 `run.ts` 并未调用此方法，说明自适应阈值在实验中**未被使用**。

#### 自适应剂量

**位置**：[governance/adaptiveDosage.ts:1-80](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/adaptiveDosage.ts#L1)

三个输入维度：偏差严重度、信息利用度、历史干预效果。输出是每种干预的动态强度参数。例如：

```typescript
// 权重削减：severity 越高削减越多，信息利用度越低削减越多，历史效果越差削减越多
reduction = 0.3 + severity × 0.4 × (2 - infoCoverage) × (1 - historyEffect/2)
// 输出区间: [0.2, 0.8]
```

**代码评价**：公式设计合理，但与自适应阈值一样，实验中未被调用。这是"已实现但未验证"的功能。

---

### 2.3 交叉质证引擎

**位置**：[discussion/crossExamination.ts:1-80](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/crossExamination.ts#L1)

这是项目中最有原创性的模块之一。范式转变：从"消除分歧"到"利用分歧"。

五阶段流程：
1. 检测分歧（`shouldActivateCrossExamination`）
2. 形成阵营（`formCamps`：belief > 0 → pro, belief < 0 → con）
3. 阵营内部提炼最强论点
4. 交叉质证（互驳 Top-3 论点）
5. 综合裁决（共识 + minority report）

**代码评价**：灵感来源明确（美国最高法院对抗制、学术 peer review、AI Safety Red/Blue Team），五阶段流程逻辑清晰。但触发条件 `round <= 2 && opinions.length >= 4`（[index.ts:243-244](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts#L243)）偏保守——如果前两轮没出现足够分歧，整个讨论都不会触发交叉质证。

---

### 2.4 因果追踪（Dropout 分析）

**位置**：[discussion/causalTrace.ts:1-60](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/causalTrace.ts#L1)

用 counterfactual dropout 估计每个智能体对讨论结果的影响力：每轮移除一个智能体，对比"有/无"两种条件下其他人的信念差异。

**代码评价**：代码注释**极其坦诚地列出了三个局限**：

```
- SUTVA is violated: dropping an agent doesn't prevent others from
  referencing their prior statements
- No identification strategy: this is observational sensitivity analysis,
  not a formal causal identification with do-calculus
- Thresholds are heuristic, not statistically calibrated
```

这种"知道自己方法的边界"的意识在代码中非常少见。模块明确声明自己是"sensitivity diagnostic tool, not a causal inference method"——措辞准确。

---

### 2.5 评估引擎（EvaluationEngine）

**位置**：[evaluation/index.ts:19-67](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L19)

五维评估，每维有明确的数学定义和权重：

| 维度 | 方法 | 权重组合 | 代码位置 |
|------|------|---------|---------|
| 共识度 | Kuramoto order parameter (30%) + inverse-std (40%) + agreement rate (30%) | 3 因子加权 | [index.ts:73-113](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L73) |
| 可靠性 | avgConfidence (20%) + consistency (30%) + Cronbach's α (25%) + repeatability (25%) + groundTruth bonus (+15) | 4 因子 + bonus | [index.ts:203-263](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L203) |
| 离散度 | beliefDispersion (40%) + confidenceDispersion (25%) + roundVariability (35%) | 3 因子加权 | [index.ts:361-412](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L361) |
| 稳定性 | roundConsistency (50%) + timeSeriesStability (50%) | 2 因子均权 | [index.ts:418-454](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L418) |
| 影响力分析 | inverse-Gini (40%) + density (30%) + inverse-path-length (30%) | 3 因子加权 | [index.ts:460-546](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L460) |

**代码评价**：

- **Kuramoto order parameter**（[index.ts:98](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L98)）的使用是正确的——它测量的是"相位同步程度"，适用于连续信念值的同步性评估。但 `computeKuramotoOrder` 的实现未展示，需要确认是否正确处理了信念从 -1 到 1 的相位映射
- **Cronbach's α**（[index.ts:280-314](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L280)）的实现是正确的：把每轮当作一个测量 occasion，智能体当作 items，公式 `(k/(k-1)) × (1 - Σσ²_i / σ²_total)`。注释中明确指出"rounds < 3 时返回 null"——这是统计上正确的做法
- **Gini 系数**（[index.ts:492](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L492)）用于测量影响力分布的不均匀度——合理，但实现需要确认是否用了标准 Gini 公式
- **离散度维度的命名**：代码注释（[index.ts:358](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/evaluation/index.ts#L358)）明确说明"formerly Robustness — renamed because no perturbation tests are run"——这是一个诚实且准确的命名修正

**最大局限**：五维评估目前全部基于标量 `belief` 值。V2 已加 `itemBeliefs` 字段，但评估引擎尚未消费它——这意味着共识度、离散度等指标无法区分"对 BetaCore 的共识"和"对 GammaEdge 的共识"。

---

### 2.6 拓扑层（可扩展架构）

**位置**：[discussion/topology.ts:1-80](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/topology.ts#L1)

解决 O(n²) 治理复杂度和 LLM context 过长问题。三种内置拓扑：

| 拓扑 | 适用规模 | 机制 |
|------|---------|------|
| FlatTopology | n ≤ 10 | 全员圆桌讨论（默认） |
| GroupedTopology | n ≤ 100 | 固定大小分组，每轮重新洗牌 |
| CommitteeTopology | n ≤ 500 | 分组 → 代表 → 全体大会 |

**关键设计**：拓扑只改变讨论结构，治理管道（检测 → 干预 → 评估）在全局状态上运行，完全不变。代码注释（[topology.ts:14-17](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/topology.ts#L14)）明确说明了这一点：

```
KEY PROPERTY: The governance pipeline (diagnose → intervene → evaluate)
operates on the GLOBAL agent state and is completely unchanged.
```

**代码评价**：接口设计干净，`partition()` 方法接收 `beliefs` 参数支持信念感知分组。但实验中仅使用 FlatTopology（5 个智能体），GroupedTopology 和 CommitteeTopology **有实现但无实验验证**。

---

### 2.7 GovernanceRuntime SDK

**位置**：[runtime/GovernanceRuntime.ts:1-77](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/GovernanceRuntime.ts#L1)

这是项目的"产品化"出口——一个框架无关的可嵌入治理运行时。

```typescript
const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",
});

const result = runtime.processRound(messages);
if (result.hasIntervention) {
  // 应用干预到你的框架
}
const eval = runtime.evaluate();
```

**代码评价**：

- 默认配置（[GovernanceRuntime.ts:65-77](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/runtime/GovernanceRuntime.ts#L65)）中 `enableAdaptiveThresholds: false` 和 `enableAdaptiveDosage: false`——两个自适应模块默认关闭，说明作者认为它们还不够成熟
- `processRound()` 接收 `DiscussionMessage[]`，返回 `GovernanceRoundResult`——接口简洁
- 支持 `BiasDetectedHandler` 和 `InterventionHandler` 回调——允许宿主框架自定义干预执行方式

---

### 2.8 观察层 V2（ObservationLayer）

**位置**：[observation/index.ts:1-80](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/observation/index.ts#L1)

V2 升级后的核心变化：

**Prompt 模板**（[index.ts:32-45](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/observation/index.ts#L32)）新增 `itemBeliefs` 字段：

```json
"itemBeliefs": [
  {"item": "Company A", "rank": 1, "belief": 0.8, "confidence": 95},
  {"item": "Company B", "rank": 2, "belief": 0.2, "confidence": 70}
]
```

**解析器**（[index.ts:68-79](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/observation/index.ts#L68)）对 itemBeliefs 做了严格的类型检查和 clamp：

```typescript
itemBeliefs: Array.isArray(parsed.itemBeliefs)
  ? parsed.itemBeliefs.filter(
      (ib: any) => typeof ib.item === "string"
        && typeof ib.rank === "number"
        && typeof ib.belief === "number"
    ).map((ib: any) => ({
      item: ib.item,
      rank: ib.rank,
      belief: Math.max(-1, Math.min(1, ib.belief)),      // clamp [-1, 1]
      confidence: typeof ib.confidence === "number"
        ? Math.max(0, Math.min(100, ib.confidence)) : 50, // clamp [0, 100]
    }))
  : undefined,
```

**收敛检查**（[discussion/index.ts checkConvergence]）已升级为按选项分别检查标准差，带 V1 fallback。

**代码评价**：V2 实现是干净的——类型安全、clamp 到合法范围、向后兼容。但 `itemBeliefs` 目前只被 `extractRanking`（实验脚本）消费，评估引擎尚未使用。

---

## 3. 实验数据评估

### 3.1 统计显著性汇总（基于 analyze.ts 实际输出）

| 假设 | ΔQ | 95% CI | p 值 | Cohen's d | 结论 |
|------|-----|--------|------|-----------|------|
| Invest: full > none | +26.6 | [+0.00, +51.13] | **0.051** | +0.71 | ⚠️ 边界显著 |
| Invest: full 组内 Δτ > 0 | — | [+0.27, +1.38] | <0.01 | — | ✅ 显著 |
| Invest: full_diversity > none | +32.2 | [+11.0, +54.4] | **0.003** | +0.98 | ✅ 显著 |
| Invest: full_weight vs none | −14.6 | [−48.0, +19.8] | 0.390 | −0.34 | ❌ 不显著 |
| Invest: full_reflection vs none | +15.4 | [−19.0, +47.7] | 0.389 | +0.36 | ❌ 不显著 |
| Invest: full_continue vs none | +8.7 | [−28.0, +43.2] | 0.642 | +0.20 | ❌ 不显著 |
| Invest: shuffle ≈ none | −1.1 | [−30.0, +26.8] | 0.962 | −0.03 | ✅ 无差异 |
| MA: full > none | +4.0 | [−2.7, +11.3] | 0.280 | +0.41 | ❌ 不显著 |
| MA: shuffle > none | +18.3 | [+10.3, +25.7] | **0.000** | +1.80 | ✅ 高度显著 |
| MA: shuffle > full | +14.3 | [+6.3, +20.7] | **0.001** | +1.56 | ✅ 高度显著 |

### 3.2 方差问题

| 任务/模式 | Q 标准差 | τ 标准差 | 评估 |
|-----------|---------|---------|------|
| Invest none | 39.6 | 0.791 | 🔴 极高——τ 在 {-1, 0.33, 1} 三态分布 |
| Invest full | 34.9 | 0.698 | 🔴 极高——13% 的 run 仍然 τ=−1 |
| MA none | 10.5 | 0.209 | 🟡 可接受 |
| MA full | 8.8 | 0.177 | 🟢 较好 |

Invest 任务的高方差根因：3 选项排名的 τ 只有 3-4 个离散值（-1, -0.33, 0.33, 1），均值在极端分布下失真。这导致组间 Bootstrap CI 难以缩窄。

### 3.3 结论可靠性评级

| 结论 | 证据 | 评级 |
|------|------|------|
| 治理提升 Invest 组内决策（Δτ=+0.84, CI [+0.27, +1.38]） | CI 排除 0 | **A（可靠）** |
| 多样性注入是 Invest 核心机制（p=0.003, d=0.98） | 唯一显著单干预 | **A（可靠）** |
| 洗牌在 Invest 上使 τ 归零（d=+0.78 vs full） | 方向性证据 | **B（方向性证据）** |
| 治理在 MA 上无组间改善（p=0.28） | CI 包含 0 | **A（可靠）** |
| 洗牌在 MA 上优于完整治理（p=0.000, d=1.80） | CI 排除 0 | **A（可靠）** |
| 治理提升 Invest 组间决策（p=0.051） | CI 下限=0 | **C（边界显著）** |
| 权重削减在 Invest 上有害（p=0.39） | 方向为负但不显著 | **C（方向性证据）** |

---

## 4. 方法论评估

### 4.1 优势

| 方法 | 代码位置 | 设计质量 |
|------|---------|---------|
| Bootstrap CI（10,000 次重采样，确定性种子） | analyze.ts | ✅ 优良——百分位法，可复现 |
| Δτ 组内轨迹（首轮 vs 末轮） | analyze.ts | ✅ 优良——控制初始条件 |
| 洗牌对照（知识轮换 +2 位） | run.ts shuffleTask | ✅ 良好——打破角色-知识对应 |
| 单干预消融（4 种干预分别测试） | run.ts singleInterventionMap | ✅ 良好——精确定位机制 |
| Dropout 敏感度分析 | causalTrace.ts | ✅ 良好——且诚实标注了 SUTVA 违反 |
| Cronbach's α（rounds ≥ 3 才计算） | evaluation/index.ts:280 | ✅ 正确——统计前提检查 |

### 4.2 不足

| 问题 | 严重度 | 代码位置 | 说明 |
|------|--------|---------|------|
| 排名提取用 indexOf | 🔴 高（V2 已修复） | run.ts extractRanking | "批评某公司"也会被排第一 |
| 信念是标量而非按选项 | 🔴 高（V2 部分修复） | types.ts AgentOpinion | 五维评估无法按选项分别计算 |
| 组间对比未达显著 | 🟡 中 | analyze.ts 输出 | p=0.051，CI 下限=0 |
| Δτ 没减去基线 Δτ | 🟡 中 | analyze.ts | none 组本身 Δτ=+0.40，增量是 0.44 |
| 自适应阈值/剂量未在实验中使用 | 🟡 中 | run.ts 未调用 | 代码存在但实验中走固定阈值 |
| GroupedTopology/CommitteeTopology 无验证 | 🟡 中 | topology.ts | 有实现但实验仅用 FlatTopology |
| 交叉质证触发条件偏保守 | 🟢 低 | index.ts:243 | `round <= 2` 限制太严 |
| 信念更新的 16 个常数未校准 | 🟢 低 | beliefUpdate.ts | 手动设定的参数 |

---

## 5. 架构健康度

### 5.1 模块耦合

| 耦合关系 | 评估 | 代码证据 |
|---------|------|---------|
| discussion ↔ governance | 🟢 松耦合 | 通过 `governancePrompts` Map 注入，不直接调用 GovernanceEngine 内部方法 |
| discussion ↔ evaluation | 🟢 松耦合 | EvaluationEngine 独立运行，输入输出通过接口定义 |
| discussion ↔ observation | 🟢 松耦合 | 通过 `PromptBuilder` / `OpinionParser` 接口注入 |
| runtime ↔ discussion | 🟢 松耦合 | GovernanceRuntime 通过适配器接口桥接 |
| experiments ↔ src/lib | 🟡 中耦合 | run.ts 直接访问 DiscussionEngine 的 `setAgentKnowledge()` 等方法 |

### 5.2 类型安全

- TypeScript strict 模式
- `ItemBelief` 接口定义完整，`itemBeliefs` 为可选字段保证向后兼容
- `DefaultOpinionParser` 对 LLM 输出做了完整的类型检查 + clamp（[observation/index.ts:68-79](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/observation/index.ts#L68)）
- 已有 tsc 错误均为 pre-existing（downlevelIteration、pipeline.ts 类型不匹配），非本次改动引入

### 5.3 可测试性

- 112 个测试覆盖 discussion、governance、evaluation、observation、pipeline 核心模块
- 策略模式使单元测试可以注入 mock 策略
- 缺少 experiments/v2/run.ts 和 analyze.ts 的集成测试

### 5.4 可扩展性

- 拓扑层支持 5→500 智能体（但仅 FlatTopology 有实验验证）
- `StrategyRegistry` 允许插入新的信念更新/影响力/记忆策略
- `AdapterRegistry` 实现 `BridgeRegistry` 接口，允许接入 AutoGen / CrewAI / LangGraph
- `GovernanceEngine.registerStrategy()` 允许注册新的干预类型
- `GovernanceEngine.registerDetector()` 允许注册自定义偏差检测器（内置 4 个之外可无限扩展）
- `Registry<K,V>` 泛型基类统一了所有注册表的实现模式

---

## 6. 已知技术债

| 编号 | 技术债 | 影响 | 代码位置 | 优先级 |
|------|--------|------|---------|--------|
| TD-1 | 排名提取用 indexOf | τ 值不准确 | run.ts extractRanking | 🔴 V2 已修复 |
| TD-2 | 信念是标量而非按选项 | 五维评估精度不足 | types.ts AgentOpinion | 🔴 V2 部分修复 |
| TD-3 | 评估引擎未消费 itemBeliefs | 五维评估仍用标量 belief | evaluation/index.ts | 🟡 |
| TD-4 | 自适应阈值/剂量未在实验中使用 | adaptive 模式实验数据无法复现 | run.ts | 🟡 |
| TD-5 | 无跨模型验证 | 结论可能不泛化 | run.ts 仅用 DeepSeek | 🟡 |
| TD-6 | GroupedTopology 无实验验证 | 可扩展性声明未经验证 | topology.ts | 🟡 |
| TD-7 | pipeline.ts 类型不匹配 | tsc 报错 | pipeline.ts | 🟢 |
| TD-8 | 信念更新 16 个常数未校准 | 信念演化可能偏离实际 | beliefUpdate.ts | 🟢 |
| TD-9 | AgentInfo 接口重复定义 | 两处维护风险 | discussion/types.ts, evaluation/types.ts | ✅ 已修复（re-export） |
| TD-10 | DEFAULT_TIMEOUT 硬编码 | 修改 constants.ts 后不同步 | llm/providers.ts | ✅ 已修复（引用 LLM_DEFAULT_TIMEOUT_MS） |
| TD-11 | AdapterRegistry 未实现接口契约 | 注册表行为无类型约束 | runtime/adapters/index.ts | ✅ 已修复（implements BridgeRegistry） |
| TD-12 | JSON 解析逻辑重复 4 处 | 修改需多处同步 | observation, llm, discussion, pipeline | ✅ 已修复（提取 jsonUtils.ts） |
| TD-13 | 统计计算 inline 重复 6+ 处 | 无统一工具函数 | governance, evaluation, discussion | ✅ 已修复（提取 statsUtils.ts） |
| TD-14 | 干预提示词模板重复 4 处 | 格式不一致风险 | interventions/*.ts, PromptInjector | ✅ 已修复（提取 interventionPrompt.ts） |

### 6.1 可维护性改进（已完成）

本次改进以"不大改、不动底层逻辑"为原则，通过提取共享工具和新增扩展接口提升代码可维护性与可拓展性：

| 改进 | 文件 | 效果 |
|------|------|------|
| `Registry<K,V>` 泛型基类 | `src/lib/utils/registry.ts` | 消除 AdapterRegistry / StrategyRegistry 重复的 Map 包装代码 |
| `jsonUtils.ts` 统一 JSON 解析 | `src/lib/utils/jsonUtils.ts` | 4 处重复的 stripCodeFences + safeJsonParse 合并为一处 |
| `statsUtils.ts` 统一统计计算 | `src/lib/utils/statsUtils.ts` | 6+ 处 inline 的 mean/std/variance 合并为一处 |
| `interventionPrompt.ts` 统一提示词模板 | `src/lib/governance/interventionPrompt.ts` | 4 个干预文件 + PromptInjector 的 header/footer 格式统一 |
| `BiasDetector` 接口 + 注册机制 | `src/lib/governance/types.ts`, `index.ts` | 自定义检测器可通过 `registerDetector()` 注册，无需修改核心引擎 |
| `AgentInfo` re-export 去重 | `src/lib/evaluation/types.ts` | 消除与 `discussion/types.ts` 的重复定义 |
| `DEFAULT_TIMEOUT` 常量同步 | `src/lib/llm/providers.ts` | 引用 `constants.ts` 的 `LLM_DEFAULT_TIMEOUT_MS`，避免多处硬编码 |
| `AdapterRegistry implements BridgeRegistry` | `src/runtime/adapters/index.ts` | 注册表行为有接口契约约束 |

验证：tsc 零新增错误，112 个测试全部通过。

---

## 7. 未来规划

### 7.1 短期（1-2 周）

| 任务 | 涉及代码 | 预期收益 |
|------|---------|---------|
| 用 V2 prompt 重跑 Invest full+none 各 15 次 | run.ts, observation/index.ts | 验证 itemBeliefs 解析率 + τ 方差是否缩小 |
| 评估引擎消费 itemBeliefs | evaluation/index.ts 五个 evaluateXxx() | 五维评估从标量升级为按选项 |
| analyze.ts 覆盖 detect-only/adaptive | analyze.ts | 完整 9 模式消融矩阵 |

### 7.2 中期（1-2 月）

| 任务 | 涉及代码 | 预期收益 |
|------|---------|---------|
| Invest 加跑到 n=25-30 | run.ts | 组间 p 值降到 0.05 以下 |
| 跨模型验证（GPT-4o） | llm/providers.ts | 排除 DeepSeek 特有行为 |
| 5+ 选项排名任务 | run.ts task 定义 | τ 取值更连续，减少离散性 |
| Δτ 增量分析 | analyze.ts | full Δτ − none Δτ，消除讨论本身的混淆 |
| 启用自适应阈值实验 | run.ts + adaptiveThresholds.ts | 验证自适应 vs 固定阈值效果差异 |

### 7.3 长期（3-6 月）

| 任务 | 目标 |
|------|------|
| 接入 AutoGen/CrewAI 实际框架 | 验证跨框架治理效果 |
| GroupedTopology 实验（20-50 智能体） | 验证可扩展性声明 |
| 自适应剂量完整评估 | 动态调整干预强度效果 |
| 论文撰写 | 投稿 AI 安全/治理方向会议 |

---

## 8. 总体判断

### 优势
- **方法论严谨性远超同龄人水平**：Bootstrap CI、洗牌对照、Δτ 组内轨迹、完整消融矩阵、Cronbach's α 前提检查——这些方法在本科毕设中都不常见
- **工程质量高**：~18,400 行代码、策略模式 + 适配器模式 + 事件总线、框架无关 SDK、112 个测试、共享工具层消除重复代码
- **代码诚实**：causalTrace.ts 主动标注 SUTVA 违反、evaluation/index.ts 主动修正"Robustness"命名为"Dispersion"
- **研究问题有原创性**：治理的边界条件（任务相互依赖性 → 治理必要性），而非简单的"治理是否有效"
- **最强发现经得起审视**：MA shuffle p=0.000、Invest full_diversity p=0.003

### 短板
- **组间对比 p=0.051 未达显著**——CI 下限恰好为 0，这是最重要的待解决问题
- **排名提取的 indexOf 问题**（V2 已修复但尚未验证）
- **仅 DeepSeek 验证**，泛化性未知
- **自适应阈值/剂量已实现但未在实验中使用**——代码存在但实验走固定参数
- **V2 升级尚未完成**：评估引擎未消费 itemBeliefs

### 一句话
**方法论扎实、工程实现完整、核心统计结论尚有 0.001 差距。V2 升级验证 + 加跑样本是最短路径。**
