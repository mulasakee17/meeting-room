# 干预 × 状态 → 响应：SwarmAlpha 状态响应矩阵设计 V1

日期：2026-08-15
状态：**DESIGN CANVAS — 供 Codex/Owner 冻结主次；不授权任何执行**。
定位：把"社会热力学"以**状态响应程序**的形式回归，把治理干预组织成**机制族**，目标是回答前沿少做的那个问题：**可观测量态预测哪个干预在什么时候该用。**

---

## 0. 为什么是这个矩阵（而不是"再试一个干预"）

- FACT：信息交换改善 hidden-profile 决策是 Stasser & Titus (1985) 起的经典结论，HiddenBench 也报告 Reveal-All/结构化交换有效。**"干预 X 有效"不是我们的新主张。**
- INFERENCE：前沿空白不在"某个干预有效"，而在 **"什么状态预测干预的响应"（状态条件治疗效应 / heterogeneous treatment effect）**。这既是我们能往前走的位置，也是社会热力学作为"状态—外场—响应—尺度"纲领的合法形式（contract ST-0~ST-4）。
- DESIGN INTENT：用**不退化的可观测量**（分歧、对齐、精确复用、报告集中度）做状态轴，用**机制不同的干预族**做动作轴，逐格填充一个 **干预 × 状态 → Δ决策质量** 矩阵。每格都是可预注册、可随机化、可独立评分、可重放的实验。

## 1. 轴定义（全部冻结于任何结果之前）

### 1.1 状态轴 `s`（可观测、非退化、outcome-free）

| 状态量 | 定义 | 现状 |
|---|---|---|
| 分歧 disagreement | round-1 报告两两 TV 的最大值（`maxPairwiseTV`） | 已实现；阈值冻结 0.8 |
| 对齐 R | 1 − mean pairwise base-2 JSD | 已实现（描述性） |
| 报告集中度 C | max 选项概率 / margin | 已实现（描述性） |
| 精确证据复用 exactReuse | 1 − U_hash/N_ref | census：有描述性变化 |
| verbatim 覆盖 coverage | 引用 hash 命中私有承诺的比例 | census：有描述性变化 |

> H_E/κ V1 **不使用**（已 STOP：证据熵近恒最大、κ 退化）。若未来要热力学量进状态轴，必须先造出不退化的新量并跨任务验证。

### 1.2 干预轴 `a`（机制不同的最小族）

| 干预 | 机制 | 状态 | 投递成本 |
|---|---|---|---|
| Inject（披露） | 加一条私有信息到公共上下文 | 已筛选（方向一致、非 confirmatory） | 0 额外调用 |
| Exchange（交换） | 分歧时交叉暴露对方注册证据 | **建设中**（slice 扩展已就绪） | 0 额外调用 |
| Minority spotlight | 少数派证据注入多数派（防从众） | 待做（同投递机制） | 0 额外调用 |
| Reflection escalation | 极端顽固少数派时强制反思 | 待做（稀有、死阈值、有负证据） | 1 额外调用 |

### 1.3 响应轴 `y`

- 主：外部 ground truth 下的 final pooled Brier、accuracy；
- 中介：ΔTruth（final−pre 在 resolved 上的质量）、ΔBrier（pre→final）、信念修正 TV、exact uptake；
- 成本：calls、tokens、latency、invalid/unavailable。

## 2. 矩阵与主估计

```
响应(s, a) = E[Brier | state=s, action=a] − E[Brier | state=s, action=holdout]
```

- 每个 `(s, a)` 格是条件化随机实验：在状态 s 内，action=a 随机化 vs holdout。
- 主 headline 是**有治理 vs 无治理**（ITT）：治理策略（按状态触发动作族）整体 vs 从不干预。
- 每格用冻结 leakage-group cluster bootstrap；task/leakage group 为推断单位。
- 不把"分歧下降""共识提升"当成功（共识可一起错）。

## 3. 填充顺序（逐格，避免 kitchen-sink）

| 序号 | 格 | 理由 | 状态 |
|---|---|---|---|
| 1 | exchange（不分状态） | 先拿到一个严格正/零/负 | **建设中** |
| 2 | minority-spotlight（不分状态） | 同投递机制，几乎免费，机制不同 | 待做 |
| 3 | 状态轴校准（分歧/R/复用 → 响应） | 用 1+2 的 run + 既有 72 run 预注册"状态→响应"分析 | 待做 |
| 4 | 跨任务/模型复现（若 3 有方向） | 状态响应关系的 ST-2/ST-3 检验 | 待做 |

## 4. 门控（每格一致）

- authority/replay/firewall 全通过；
- 只给 `SCREEN_PASS / MECHANISM_STOP / QUALITY_STOP / DEFER`；
- 阈值、状态定义、干预定义、主对照全部在**看结果前冻结**；
- 负结果淘汰该格，不追加特征挽救。

## 5. 硬约束

- **任务池**：pinned 65 里未触碰仅剩 14（全 K3/A4、家族重叠）。多格矩阵需要更多任务——要么接受"机制筛选不声称 fresh"，要么需要新任务源（Codex/Owner 决定）。
- **功效**：每格 32–48 runs，逐格做才能保功效；一次性矩阵会摊薄到无意义。
- **单一动作逐次晋级**：避免 action 竞赛（集成指南 §9）。

## 6. 声明与边界

- DESIGN INTENT / HYPOTHESIS，非 FACT：状态响应关系目前**没有任何预测性验证**（census 只证明描述性变化）。
- 不主张：治理有效、detector 有效、latent belief 被测得、社会热力学定律已建立、AAMAS-ready。
- 本矩阵不授权任何执行；每一格冻结后需 owner `RUN_AUTHORIZED=yes`。
