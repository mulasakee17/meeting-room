# SwarmAlpha 实验设计文档

> **文档定位**：实验设计、统计方法与科学战役的统一参考。面向研究者本人及合作者。
> **数据基准**：所有数字以 [`docs/SOT.md`](../SOT.md) 为准（最后更新 2026-07-26）。
> **撰写原则**：所有结论须可追溯到代码或数据文件；不确定处明确标注；不臆造接口或数据。

---

## 目录

1. [实验设计总览](#1-实验设计总览)
2. [任务设计](#2-任务设计)
3. [三种实验条件](#3-三种实验条件)
4. [异步引擎核心机制](#4-异步引擎核心机制)
5. [治理机制](#5-治理机制)
6. [统计方法](#6-统计方法)
7. [可复现性保证](#7-可复现性保证)
8. [E9 Smoke Test 设计](#8-e9-smoke-test-设计)
9. [实验结果（基于 SOT）](#9-实验结果基于-sot)
10. [Fraud 实验设计（C/E/F/G 组）](#10-fraud-实验设计cefg-组)
11. [科学战役 E1-E8](#11-科学战役-e1-e8)
12. [Campaign Pipeline 架构](#12-campaign-pipeline-架构)
13. [跨模型验证——诚实局限](#13-跨模型验证诚实局限)
14. [已知局限与下一步方向](#14-已知局限与下一步方向)

---

## 1. 实验设计总览

### 1.1 三层实验结构

SwarmAlpha 实验体系由三层构成：

| 层级 | 设计 | 规模 | 状态 |
|------|------|------|------|
| **主数据层** | 2 任务 × 3 条件 = 6 cell | **169 closed-loop runs** | ✅ 已完成 |
| **扩展配置层** | 9 配置（E1-E8 + E9 smoke） | 6 + 8 + 1 = 15 实验单元 | 部分完成 |
| **历史数据层** | v2 + lunar + .claude | **573 JSON 总文件** | provenance 用途 |

**关键数字（以 SOT 为准）**：
- 实验文件总数：**573 JSON**（v2:487 + lunar:85 + .claude:1）
- 论文有效数据：**169 closed-loop runs**（Crisis 80 + Supplier 89）
- broken-loop 数据：318 个（仅作 provenance，不作 claim 依据）
- E9 smoke test：**6 runs**（3 seeds × 2 modes）

> ⚠️ **不再使用的表述**：~~"445 实验"~~、~~"640+ 实验"~~。正确表述为"573 total / 169 closed-loop"。

### 1.2 实验矩阵

```
                    条件 none      条件 full      条件 shuffle
                 ┌──────────────┬──────────────┬──────────────┐
  Crisis 任务    │  n=24 (基线)  │  n=32(含8fixed)│  n=24        │  → 80 runs
                 ├──────────────┼──────────────┼──────────────┤
  Supplier 任务  │  n=30 (基线)  │  n=30        │  n=29(1崩溃)  │  → 89 runs
                 └──────────────┴──────────────┴──────────────┘
                                                            合计 169 runs
```

**9 配置**：指扩展配置层的 9 个实验单元——E1 至 E8（Cognitive State 科学验证）+ E9（smoke test）。详见第 8、11 节。

---

## 2. 任务设计

### 2.1 Crisis 任务（困难，n=24/cell）

**源码**：[`experiments/v2/task_crisis.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/task_crisis.ts)

**任务结构**：
- 5 方案排序，5 维度加权决策
- 5 个 agent 角色（不同专业视角）
- Hidden Profile 设计：每个 agent 持有独有信息

**难度特征**：
- 基线 τ≈0.408（远低于 Supplier 的 0.680）
- 治理信号分离度高，适合验证治理效果
- 主证据来源：Crisis shuffle vs none **d=1.44**（最强证据）

**数据分布（SOT §2.1）**：

| 组 | 文件数 | 备注 |
|----|--------|------|
| none | 24 | 基线 |
| full | 32 | 含 8 个 `crisis_full_fixed_*` 文件 |
| shuffle | 24 | |

> ⚠️ full 组 n=32（含 8 个 fixed 文件）。论文若用 n=24/cell 需说明 ablation 过滤逻辑——即排除 fixed 文件以保持 cell 平衡。

### 2.2 Supplier 任务（简单，n=30/cell）

**任务结构**：
- 5 选项排序，决策链较短
- 5 个 agent 角色
- 信息依赖弱于 Crisis

**难度特征**：
- 基线 τ≈0.680（天花板效应）
- 治理效果不显著（d=0.47, p=0.086, underpowered 43%）
- shuffle 几乎无效（d=0.09, p=0.78）——天花板效应导致

**数据分布（SOT §2.2）**：

| 组 | 文件数 | 备注 |
|----|--------|------|
| none | 30 | 基线 |
| full | 30 | |
| shuffle | 29 | 1 个 API 崩溃导致缺失 |

### 2.3 任务难度对比

| 任务 | 基线 τ | 天花板效应 | 治理可改进空间 | 主证据强度 |
|------|--------|----------|--------------|----------|
| Crisis | 0.408 | 无 | 大（→0.717） | 强（d=1.44） |
| Supplier | 0.680 | 有 | 小（→0.697） | 弱（d=0.09） |

**设计意图**：双任务对照验证治理效果的**任务依赖性**——困难任务中治理收益大，简单任务中天花板效应抑制治理收益。这一差异本身是研究发现。

---

## 3. 三种实验条件

### 3.1 条件定义

| 条件 | 检测 | 干预 | 知识图谱 | 设计意图 |
|------|------|------|---------|---------|
| **none** | 关 | 关 | 原始 | 基线，无治理 |
| **full** | 开 | 开（精准） | 原始 | 完整治理，验证整体效果 |
| **shuffle** | 关 | 关 | **打乱** | 隔离"信息流结构"的因果作用 |

**shuffle 的关键设计**：检测和干预都关闭，但 agent 间的知识依赖图被随机打乱。这隔离了"信息流拓扑"本身的因果作用——如果 shuffle 组 τ 显著高于 none，说明信息流结构（而非干预指令）是治理收益的主要来源。

### 3.2 条件与引擎的关系

所有主数据（169 runs）使用 **AsyncDiscussionEngine + content_driven 发言模式 + 热力学自适应终止**。三条件的差异仅在治理开关和知识图谱，引擎本身一致。

---

## 4. 异步引擎核心机制

**源码**：[`src/lib/discussion/asyncEngine.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/asyncEngine.ts)

异步引擎取消"轮次"概念，改为"发言序列"。每一步通过发言意愿公式决定谁发言、发言几次，直到热力学终止条件触发或硬上限。

### 4.1 发言意愿公式（content-driven 模式）

**源码**：`computeWillingnessFactors` L664-718 + `computeWillingness` L760-783

**5 个因子**：

| 因子 | 计算 | 权重 |
|------|------|------|
| `infoExposure` | 独有信息曝光度（agent 持有但他人未提及的信息） | ×0.6 |
| `beliefShift` | 信念变化幅度 | >0.3 → +0.4; >0.1 → +0.2 |
| `consensusDeviation` | 与群体共识的偏离 | >0.4 → +0.4; >0.2 → +0.2 |
| `dependencyTriggered` | 被他人@依赖触发 | +0.3 |
| `recentlySpoke` | 最近2次发言窗口内发过言 | -0.5 |

**合成公式**（`computeWillingness` L760-783）：

```typescript
w += f.infoExposure * 0.6;
if (f.beliefShift > 0.3) w += 0.4; else if (f.beliefShift > 0.1) w += 0.2;
if (f.consensusDeviation > 0.4) w += 0.4; else if (f.consensusDeviation > 0.2) w += 0.2;
if (f.dependencyTriggered) w += 0.3;
if (f.recentlySpoke) w -= this.asyncConfig.recentSpeakPenalty;  // -0.5
return (Math.tanh(w) + 1) / 2;  // tanh 归一化到 [0,1]
```

**阈值分组**：
- `willingnessThreshold = 0.40`：意愿≥0.40 可能发言
- `strongWillingnessThreshold = 0.82`：意愿≥0.82 必须发言
- `recentSpeakPenalty = 0.5`：刚发过言扣分
- `recentSpeakWindow = 2`：最近2次发言窗口

**设计意图**：让"有独有信息要分享"、"信念发生大变化"、"与共识有分歧"的 agent 更可能发言；让"刚发过言"的 agent 暂时沉默。这是 content-driven 模式的核心——发言权由内容相关性决定，而非轮次顺序。

### 4.2 DeGroot 信念更新

**源码**：`updateListenerBeliefs` L440-497

未发言的 agent 不只是被动旁观，而是按 DeGroot 模型更新信念：

```
Δbelief_i = learning_rate × Σ(w_ij × (belief_j - belief_i)) / Σ(w_ij)
```

- `learning_rate = 0.15`（信念更新）
- `w_ij`：agent i 对 agent j 的信任权重（来自影响图）
- confidence 按 agreement 程度调整（越同意越提高 confidence，learning_rate=0.03，远小于 belief）

**与同步引擎的关键差异**：同步引擎只有发言者更新信念；异步引擎让倾听者也持续更新。这模拟了真实会议中"听到别人的话后，即使没发言，内心想法也会变化"的认知过程，从而产生后续发言意愿。

### 4.3 热力学自适应终止

**源码**：[`src/lib/thermodynamics/TerminationDecider.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/thermodynamics/TerminationDecider.ts)

**终止阈值**（`DEFAULT_TERMINATION_THRESHOLDS` L100-121）：

| 参数 | 值 | 含义 |
|------|------|------|
| `crystallR` | 0.85 | 结晶态 R 阈值 |
| `crystallT` | 0.22 | 结晶态 T 阈值 |
| `crystallH` | 0.42 | 结晶态 H 阈值 |
| `consecutiveCrystallRequired` | 3 | 连续3次结晶才终止 |
| `strongCrystallT` | 0.10 | 强结晶 T 阈值 |
| `strongCrystallH` | 0.20 | 强结晶 H 阈值 |
| `hardCapUtterances` | 40 | 硬上限 |
| `evalEveryKUtterances` | 2 | 每2次发言触发热力学评估 |

**决策逻辑**：
1. 硬上限：发言数 ≥ 40 → 立即终止（`hard_cap`）
2. 强结晶：T<0.10 且 H<0.20 → 立即终止（`strong_crystallized`）
3. 普通结晶：R>0.85 且 T<0.22 且 H<0.42 → 连续3次才终止（`crystallized`）
4. 否则继续

---

## 5. 治理机制

### 5.1 检测器（7 个）

**源码**：[`src/lib/governance/types.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/types.ts)

**4 个经典检测器**：

| 检测器 | 检测目标 |
|--------|----------|
| Echo Chamber | 相似观点互相强化 |
| Authority Bias | 高置信度 agent 压制异见 |
| Polarization | 观点向极端漂移 |
| Premature Consensus | 过早达成共识 |

**3 个 MAST FC2 检测器**：

| 检测器 | 检测目标 |
|--------|----------|
| FM-2.4 信息隐藏 | agent 持有信息但未分享 |
| FM-2.5 忽略输入 | agent 忽略他人提供的信息 |
| FM-2.6 推理-行动不一致 | agent 说的与做的矛盾 |

### 5.2 干预策略（3 active + 4 deprecated）

**源码**：[`src/lib/governance/cognitiveInterventions.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/cognitiveInterventions.ts)

**3 个 active 干预（非破坏性）**：

| 干预 | 作用 | E9 验证 |
|------|------|---------|
| `inject_evidence` | 注入证据，改变信息流 | ✅ v2.1 |
| `rebalance_attention` | 重平衡注意力分配 | ✅ v2.1 |
| `shuffle_knowledge` | 打乱知识依赖图 | ✅ shuffle 条件 |

**4 个 deprecated 干预（破坏性）**：

| 干预 | 状态 | 原因 |
|------|------|------|
| `reduce_weight` | deprecated | 破坏性，直接降权 |
| `force_reflection` | deprecated | 破坏性，强制反思 |
| `introduce_diversity` | deprecated | 有效率仅 4.7% |
| `continue_discussion` | deprecated | 有效率 0% |

**核心发现（E9 smoke test）**：v2.0 破坏性干预使效果 **Δτ=-0.267**；v2.1 非破坏性干预在 2026-07-25 重跑后实测 **Δτ=0.000**（N=6，早期文档引用的 +0.533 为历史值，当前数据不支持），需正式实验验证。

### 5.3 F 分解排序

**源码**：`rankInterventionsByFreeEnergy` L794-832

干预按"预期自由能下降量"排序：

```
F = (1 - R) + T · H

R = Kuramoto 序参量（共识度）
T = σ_population(beliefs) 归一化到 [0,1]（温度，承诺分散度，与 confidence 无关）
H = Shannon 熵（观点多样性）
```

- 结构性能量 `(1-R)` 高 → 优先 structural 干预
- 热性能量 `T·H` 高 → 优先 procedural 干预

> **F 的诚实定位**（SOT §5.3）：F 是工程上有用的启发式综合诊断指标，不是严格的热力学自由能。当前论文不 claim 热力学理论贡献，F 作为诊断指标使用。

### 5.4 治理模式

**5 种**（`RuntimeConfig.governanceMode`）：none / detect-only / random-intervene / full / cognitive

主数据（169 runs）的 full 条件使用 `full` 模式（检测 + 精准干预）。

---

## 6. 统计方法

### 6.1 Kendall τ-b（排名相关系数）

**源码**：[`experiments/v2/statsShared.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/statsShared.ts) L170-220

衡量 agent 群体最终排名与 ground truth 排名的相关性：
- τ=1：完全一致
- τ=0：无关
- τ=-1：完全相反

τ-b 含精确 tie 修正。**已修复的 bug**：tie 修正公式曾用 `count*(count+1)/2`，应为 `count*(count-1)/2`，导致 ties≥2 时 τ 退化为 0。

**计算流程**：从所有 agent 的 `itemBeliefs[].rank` 取均值聚合为群体排名，再与 ground truth 比较。

### 6.2 Permutation Test（置换检验）

**源码**：[`experiments/v2/analyze_cross_model.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/analyze_cross_model.ts) L87-100

**配对置换检验**（sign-flip）：
- 对配对差值符号进行 nPerm 次随机翻转
- p 值公式：`(count + 1) / (nPerm + 1)` —— **关键修正**，避免 p=0 假阳性
- 默认 nPerm = 10,000 次

### 6.3 Bootstrap CI（置信区间）

**配对 95% CI**：t 分布，df=n-1（L115-130）

**模型级 Bootstrap**（用于 E2 等回归分析）：对逐轮数据点重采样，而非对单值 bootstrap。已修复"单值 bootstrap 退化"问题（见第 12 节 Pipeline 修复历史）。

### 6.4 Cohen's d（效应量）

**Cohen's d_z**（配对效应量）：`mean(diffs) / sampleStd(diffs)`

**解读标准**：
- d < 0.2：微小
- d ≈ 0.5：中等
- d > 0.8：大
- d > 1.0：很大

### 6.5 多重比较校正

科学战役 E1-E8 共 8 个假设同时检验，使用 **Holm-Bonferroni 校正**：

```
α_adjusted(i) = 0.05 / (8 - i + 1)，其中 i = 1..8（按 p-value 排序）
```

---

## 7. 可复现性保证

### 7.1 统一种子

| 用途 | 种子 | 来源 |
|------|------|------|
| 置换检验 | `PERMUTATION_SEED = 42` | statsShared.ts |
| Bootstrap | `BOOTSTRAP_SEED = 42 + 0x5EED` | statsShared.ts |
| Agent 信念初始化 | `seed + hashAgentId(id)` 派生 | custom.ts L62-67 |

### 7.2 mulberry32 PRNG

**源码**：statsShared.ts L92-100

所有随机数使用 `mulberry32` PRNG，替代 `Math.random()`，确保：
- 跨脚本可复现
- 同 seed 下结果完全一致（允许浮点误差 < 1e-6）
- Agent 间 PRNG 不冲突（每个 agent 用 `seed + hashAgentId(id)` 派生独立流）

### 7.3 关键约束

> **所有置换检验必须用 `(count+1)/(nPerms+1)` 修正**，避免 p=0 假阳性。
>
> **所有脚本用统一 seed 确保跨脚本可复现**。

### 7.4 已修复的可复现性问题

- ✅ mulberry32 PRNG 替代 Math.random()（异步引擎可复现性）
- ✅ Kendall τ tie 修正公式 bug
- ✅ PromptInjector [GOV] 标签伪造漏洞
- ✅ DiscussionEngine.reset() 跨实验状态泄漏
- ✅ 实验文件名加 speakMode 防覆盖
- ✅ 配对置换检验 (count+1)/(nPerms+1) 修正
- ✅ verifyFindings.ts 硬编码 d=1.82 替换为实际计算

---

## 8. E9 Smoke Test 设计

### 8.1 设计

**源码**：[`experiments/v2/e9_smoke_test.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/e9_smoke_test.ts)

| 维度 | 取值 |
|------|------|
| Seeds | 3 个 |
| Modes | 2 个（v2.0 破坏性 / v2.1 非破坏性） |
| 总运行数 | **6 runs**（3 seeds × 2 modes） |
| 用途 | 干预策略效果验证（preliminary） |

### 8.2 两种干预模式对比

| 模式 | 干预策略 | Δτ | 来源 |
|------|---------|-----|------|
| v2.0 破坏性 | reduce_weight + force_reflection | **-0.267** | 历史 smoke test |
| v2.1 非破坏性 | inject_evidence + rebalance_attention | **0.000**（当前实测） | e9_smoke_supplier/ 6 个 JSON；历史值 +0.533 未复现 |

> ⚠️ 两个数字来自不同时期的 smoke test，不是同一脚本的直接对比。论文中应标注 **"smoke test, N=6, preliminary"**。

### 8.3 核心发现

**干预策略选择决定治理成败**：非破坏性干预（改变信息流而非信念权重）使效果从负反转到正。这是 SwarmAlpha 的核心实证发现之一。

---

## 9. 实验结果（基于 SOT）

### 9.1 τ 均值与决策质量（主证据）

**SOT §3.4**：

| 任务 | 组 | τ ± σ | Q（决策质量） |
|------|-----|--------|---|
| Crisis | none | 0.408 ± 0.182 | 72.2 |
| Crisis | full | 0.617 ± 0.263 | 81.1 |
| Crisis | shuffle | 0.717 ± 0.243 | 85.6 |
| Supplier | none | 0.680 ± 0.186 | 82.0 |
| Supplier | full | 0.767 ± 0.183 | 91.0 |
| Supplier | shuffle | 0.697 ± 0.204 | 84.0 |

### 9.2 效应量（Cohen's d）

**SOT §3.1**：

| 比较 | d 值 | n/cell | p 值 | 备注 |
|------|------|--------|------|------|
| Crisis full vs none | **d=0.92** | 24 | p=0.0038 | 主证据 |
| Crisis shuffle vs none | **d=1.44** | 24 | p<0.001 | 最强证据 |
| Supplier full vs none | d=0.47 | 30 | p=0.086 | 不显著，underpowered (43%) |
| Supplier shuffle vs none | d=0.09 | 29 | p=0.78 | 天花板效应 |

> **历史 bug 已修复**：verifyFindings.ts:219 确认 "P0-B1 修复：计算实际的 Cohen's d 和置换检验 p 值（替代原硬编码 d=1.82, p=0.0002）"。

### 9.3 共识-质量相关

**SOT §3.2**：

| 任务 | r | p | n | 显著性 |
|------|---|---|---|--------|
| 跨任务全样本 | **r=-0.10** | **p=0.20** | 169 | **不显著** |
| Crisis 子集 | r=-0.05 | p=0.66 | 80 | 不显著 |
| Supplier 子集 | r=-0.03 | p=0.78 | 89 | 不显著 |

> **诚实标注**：r=-0.10 数字真实，但 p=0.20 远不显著。论文中必须标注 **"(p=0.20, not significant)"**，不应作为"发现"呈现，应降级为"探索性观察"。

### 9.4 E9 干预效果

详见第 8 节（v2.0 破坏性 Δτ=-0.267 → v2.1 非破坏性当前 smoke test Δτ=0.000，历史 +0.533 未复现，SOT §3.3）。

---

## 10. Fraud 实验设计（C/E/F/G 组）

**入口**：[`experiments/v2/run_async_ab.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/run_async_ab.ts)（ABCD）、[`experiments/v2/run_malicious.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/run_malicious.ts)（EFG）

### 10.1 ABCD 四组对照

| 组 | 引擎 | 发言模式 | 终止 | 干预 |
|----|------|----------|------|------|
| A | 同步 DiscussionEngine | 全员顺序 | 固定5轮 | F分解排序 |
| B | 异步 AsyncDiscussionEngine | 概率/内容驱动 | 固定5轮 | F分解排序 |
| C | 异步 AsyncDiscussionEngine | content_driven | 热力学自适应 | F分解驱动 |
| D | 异步 AsyncDiscussionEngine | content_driven | 随机终止（匹配C组分布） | F分解驱动 |

**核心对比**：
- A vs B：异步本身是否影响决策质量
- B vs C：热力学自适应终止是否优于固定轮次（H_thermo）
- C vs D：热力学终止决策是否优于随机终止（H_diag）

### 10.2 EFG 恶意实验

**任务定义**：[`experiments/v2/task_fraud_malicious.ts`](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/task_fraud_malicious.ts)

| 组 | 攻击类型 | 治理 | 设计意图 |
|----|----------|------|---------|
| E | 单点攻击 | 开 | 治理能否抵抗单点恶意 |
| F | 单点攻击 | 关 | 无治理基线，对比 E |
| G | 共谋攻击 | 开 | 治理能否抵抗协同攻击 |

- 所有组用 AsyncDiscussionEngine + content_driven + adaptive 终止
- 恶意变体任务包含：信息投毒 / 权威操纵 / 依赖劫持
- 恶意 agent 注入隐藏指令（模拟 prompt injection 攻击）

### 10.3 恶意 Agent 隐藏指令

**源码**：`task_fraud_malicious.ts` L259-283 `buildMaliciousDirective()`

恶意 agent 在 system prompt 末尾被注入隐藏指令，核心策略包括：始终保持 confidence ≥ 85；主动引用他人发言强化论点；质疑时立即转移话题；itemBeliefs 中将目标选项 rank=1；永不承认错误；僵局时主动提出"基于最直接证据决策"。共谋变体（G 组）额外追加 a1-a4 之间的协同策略（附和、转移注意力、强化对方证据）。

### 10.4 Fraud 实验数据状态

**SOT 未将 Fraud 数据列入论文有效数据**（169 closed-loop runs 仅含 Crisis + Supplier）。Fraud 实验数据现状：

| 目录 | 内容 | 状态 |
|------|------|------|
| `data_fraud/` | A/B/C/D 各10 | 历史数据 |
| `data_fraud_zhipu/` | B(4) + C(10) | 跨模型，不完整 |
| `data_fraud_malicious/` | E + F（不全） | 待补跑 |
| `data_fraud_malicious_backup_v1/` | E/F/G 各0-9 | 完整但 codeVersion 不同 |

> ⚠️ 恶意实验 F 组数据不全，两套数据 codeVersion 不同，需明确哪套是当前有效数据后再纳入论文。

---

## 11. 科学战役 E1-E8

> 本节吸收自归档文档 [`docs/archive/research/EXPERIMENTAL_CAMPAIGN_PLAN.md`](../archive/research/EXPERIMENTAL_CAMPAIGN_PLAN.md)，并参考 [`docs/archive/roadmap/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT.md`](../archive/roadmap/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT.md) 的修复状态。

### 11.1 战役总览

E1-E8 是基于 **Cognitive State 五维模型**（Utility / Evidence / Inertia / Confidence / Susceptibility）的科学验证战役，每个实验对应一个可证伪假设。

| 实验 ID | 假设 | 标题 | 核心问题 |
|---------|------|------|---------|
| E1 | H1 | State Stability | Utility 比 Belief 更稳定吗？ |
| E2 | H2 | Evidence Explanatory | Evidence 能解释 Opinion Change 吗？ |
| E3 | H3 | Inertia → Authority | Inertia 能预测权威偏差吗？ |
| E4 | H4 | Confidence Prediction | Confidence 能预测未来观点改变吗？ |
| E5 | H5 | Governance Mechanism | 治理通过 Evidence 而非 Belief 发挥作用吗？ |
| E6 | H6 | State Decoupling | 五维变量真的独立吗？ |
| E7 | H7 | Detector Accuracy | Cognitive 检测器比 Belief 检测器更准确吗？ |
| E8 | H8 | Susceptibility Mediation | Susceptibility 完全中介 Inertia → ΔU 吗？ |

### 11.2 每个实验的统计方法

| 实验 | 主要检验 | 效应量 | 置信区间 |
|------|---------|--------|---------|
| E1 | 配对置换检验（10,000次） | Cohen's d | Bootstrap 95% CI |
| E2 | 增量 F 检验 + 模型级 Bootstrap | ΔR² | Bootstrap 95% CI for ΔR² |
| E3 | 逻辑回归 + 似然比检验 | Odds Ratio | Wald 95% CI |
| E4 | 混合效应模型 | Marginal R² | 参数 Bootstrap CI |
| E5 | Granger 因果 + Bootstrap 中介 | 间接效应比例 | Bootstrap 95% CI |
| E6 | Fisher's z 变换 | Δr | Fisher's z CI |
| E7 | McNemar 检验 | Odds Ratio | 精确二项 CI |
| E8 | Bootstrap 中介分析（5,000次） | 间接效应 a×b | Bootstrap 95% CI |

### 11.3 预期效应量与样本量

| 实验 | 预期效应量 | 所需样本量（α=0.05, power=0.80） | 计划样本量 | 是否充足 |
|------|-----------|-------------------------------|-----------|---------|
| E1 | d = 0.6 | n = 45 | 50 | ✓ |
| E2 | f² = 0.15 | n = 55 | 50 | 边际 |
| E3 | OR = 2.5 | n = 50 | 50 | ✓ |
| E4 | f² = 0.10 | n = 80 | 50 | 不足（探索性） |
| E5 | 间接效应 = 0.3 | n = 50 | 50 | ✓ |
| E6 | Δr = 0.3 | n = 50 | 50 | ✓ |
| E7 | OR = 3.0 | n = 20 | 20 | 边际 |
| E8 | 间接效应 = 0.3 | n = 50 | 50 | ✓ |

> E4 和 E7 样本量偏小，需在论文中诚实讨论 statistical power 局限。

### 11.4 实验矩阵

- **Runtime**：Belief / Cognitive
- **Governance**：none / full / reflection_only / authority_only / diversity_only
- **LLM**：deepseek-chat（主），GPT-4o（验证）
- **Scenario**：M&A（主），Crisis / Supplier（验证）
- **Seeds**：42, 123, 456, 789, 1024（5 seed × 10 runs = 50 次/实验）

---

## 12. Campaign Pipeline 架构

> 本节吸收自归档文档 [`docs/archive/roadmap/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT.md`](../archive/roadmap/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT.md)。

### 12.1 Pipeline 流程

```
Config (8 个配置文件)
    ↓
Runner (运行实验 → 保存 RawRunData JSON)
    ↓
MetricComputer (计算专属指标 → ExperimentMetrics)
    ↓
StatisticalTest (统计检验 → TestResult[])
    ↓
FigureGenerator (生成 SVG 图表)
    ↓
ReportGenerator (生成 Markdown + LaTeX 报告)
    ↓
CampaignSummarizer (汇总所有实验 → Campaign Summary)
```

**入口**：`npx tsx experiments/campaign/run_all.ts`

### 12.2 Metric 与 Statistical Test 覆盖

| 实验 | Metric 函数 | 核心指标 | Statistical Test |
|------|------------|----------|-----------------|
| E1 | `computeE1Stability` | σ²(ΔB), σ²(ΔU), Stability Ratio | `testE1` 配对置换检验 |
| E2 | `computeE2Evidence` | R²_Cognitive, R²_Belief, ΔR² | `testE2` 模型级 Bootstrap |
| E3 | `computeE3Inertia` | AUC, Odds Ratio, β₁ | `testE3` 逻辑回归 + 置换 |
| E4 | `computeE4Confidence` | β₁_Cognitive, β₁_Belief | `testE4` Bootstrap CI |
| E5 | `computeE5Governance` | Granger F, Δτ, Indirect Effect | `testE5` Granger + Bootstrap |
| E6 | `computeE6Decoupling` | 5×5 相关矩阵, max\|r\| | `testE6` Fisher's z |
| E7 | `computeE7Detector` | Precision, Recall, F1 | `testE7` Bootstrap ΔF1 |
| E8 | `computeE8Susceptibility` | 间接效应 a×b, 中介比例 | `testE8` Bootstrap 中介 |

### 12.3 Blocker 修复历史

`SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT` 记录了 5 个 Blocker 的修复：

| # | Blocker | 修复方案 | 状态 |
|---|---------|----------|------|
| B1 | E2 p-value 硬编码 | 模型级 Bootstrap，p = (count(ΔR²≤0)+1)/(nBoot+1) | ✅ |
| B2 | E2 Bootstrap 单值退化 | 对逐轮 (ΔE, ΔU) 数据点重采样 | ✅ |
| B3 | E3-E8 无 Metric 计算 | 新增 8 个 compute 函数 | ✅ |
| B4 | E3-E8 无统计检验 | 新增 8 个 test 函数 | ✅ |
| B5 | Fig 6 相关矩阵占位符 | 使用实际 correlationMatrix | ✅ |

**最终判定**：Scientific Campaign Approved（Pipeline 端到端验证通过）。

### 12.4 Dry Run 验证

**配置**：E1，seed=42，2 runs（1 belief + 1 cognitive），5 agents，5 rounds，M&A 场景。

**验证结果**：7 项检查全部通过（Simulation / JSON Output / Metrics / Statistics / Figures / Report / Campaign Summary）。

---

## 13. 跨模型验证——诚实局限

### 13.1 数据覆盖

| 模型 | A | B | C | D |
|------|---|---|---|---|
| DeepSeek-V3 (deepseek-chat) | n=10 ✓ | n=10 ✓ | n=10 ✓ | n=10 ✓ |
| Zhipu glm-4-flash | **缺失** | n=4 | n=10 ✓ | **缺失** |

> ⚠️ Zhipu 侧 A/D 组完全缺失，B 组仅 n=4。只有 C 组有 n=10 可做配对检验。

### 13.2 代码版本混淆问题（核心局限）

| 数据集 | 时间戳 | codeVersion | thermoHistory 评估间隔 |
|--------|--------|-------------|----------------------|
| DeepSeek C组 | 2026-07-18 | 无 | 间隔≈5（旧值） |
| Zhipu C组 | 2026-07-19 | "2026-07-19" | 间隔≈2（新值） |

**根因**：`run_async_ab.ts` L364 注释 "2026-07-19 修复：与 DEFAULT_ASYNC_CONFIG 一致"，`evalEveryKUtterances` 从 5 改为 2。DeepSeek 数据用旧值5，Zhipu 数据用新值2。

**影响**：评估间隔不同 → 热力学触发频率不同 → 终止时机不同 → τ 不可直接比较。

### 13.3 跨模型验证结论（诚实版）

> 截至当前数据，跨模型验证**不可靠**，原因如下：
> 1. 代码版本混淆（evalEveryKUtterances 5→2 跨节点）
> 2. Zhipu 侧 A/D 组缺失，B 组仅 n=4
> 3. JSON 无 model 字段，模型身份靠推断（仅能从 `run_async_ab.ts` 默认值、`analyze_cross_model.ts` 注释、目录名后缀推断）
> 4. n=10 统计效力低，"未达显著"不等于"无差异"
>
> **正确做法**：用相同代码版本重跑 DeepSeek 或 Zhipu 其中一组，使两组 codeVersion 一致后，再做配对检验。

**实验状态**：169 closed-loop runs 已完成（Crisis + Supplier），**跨模型验证待做**。

---

## 13.5 v6 混合范式实验矩阵（2026-07-30 Phase 3 计划）

> **状态**：Phase 2.5-2.8 完成（代码就绪），Phase 3 待启动（200 runs 全量实验）
> **任务**：task_university.ts（8 大学 × 6 维度 hidden-profile）
> **配置文件**：[experiments/campaign/configs/e9_cognitive_governance.ts](../../experiments/campaign/configs/e9_cognitive_governance.ts)

### 13.5.1 四组对照设计

| 组 | 配置 ID | governanceMode | useSemanticTool | 治理路径 | runs |
|----|---------|---------------|-----------------|---------|------|
| **A** | E9_V6_A_NONE | none | false | 无治理（基线） | 50 |
| **B** | E9_V6_B_DELTA | cognitive | false | δ 同步诊断 + 认知干预（Tier 1+2） | 50 |
| **C** | E9_V6_C_SEMANTIC | cognitive | true | δ + SemanticTool 异步（Tier 1→2→3） | 50 |
| **D** | E9_V6_D_OLD | full | false | 旧检测器（4 经典 + 3 FC2） | 50 |

**关键假设**：
- **H9**（主假设）：B 组 τ > A 组 τ（δ 治理有效）
- **H10**：C 组 τ ≥ B 组 τ（SemanticTool 语义验证进一步提升）
- **H11**：B 组 τ > D 组 τ（δ 治理优于旧检测器）

### 13.5.2 治理路径分支

代码位置：[nativeCognitiveEngine.ts:479-493](../../src/lib/discussion/nativeCognitiveEngine.ts#L479-L493)

```
A 组 (governanceMode="none")           → 父类无治理
B 组 (cognitive + useCognitiveGovernance) → applyCognitiveGovernance (δ 同步)
C 组 (+ useSemanticTool)                → applyCognitiveGovernanceAsync (Tier 1→2→3)
D 组 (full, useCognitiveGovernance=false) → super.applyGovernance (父类旧检测器)
```

### 13.5.3 Pilot A/B 对照结果（2026-07-30，单次验证）

> ⚠️ **单 seed 单 run，无统计显著性，仅用于验证链路通畅性。**

| 指标 | A 组（无治理） | B 组（δ 治理） | Δ(B-A) |
|------|---------------|---------------|--------|
| τ | 0.571 | 0.643 | +0.071 |
| 干预次数 | 0（预期） | 14（9 inject + 5 rebalance） | - |
| δ 触发率 | 45%（18/40） | 40%（16/40） | -5% |
| Token | 96K | 121K | +26% |
| 耗时 | 238s | 362s | +52% |

**关键发现**：
1. δ→干预链路打通（修复前 0 干预，修复后 14 干预正常生成）
2. B 组 τ 高于 A 组（Δτ=+0.071），但单次实验不能下结论
3. 干预打断过早收敛（A 组 R4=0.967 假收敛，B 组 R4=0.729 保持活跃）
4. τ 偏高（天花板风险），δ 触发率偏高（任务特性）

### 13.5.4 数据记录完整性

v6 Phase 2.8 补齐了以下数据记录字段：

| 字段 | 用途 | 文件 |
|------|------|------|
| `interventions.targetAgents` | 干预目标列表 | Runner.ts |
| `interventions.effect` | 干预效果描述（含降级信息） | Runner.ts |
| `interventions.applied` | 是否实际应用 | Runner.ts |
| `interventions.parameters` | 干预参数（deltaSource, degradedFrom, mechanism） | Runner.ts |
| `semanticAuditLog` | SemanticTool 调用审计（C 组专用） | Runner.ts |

### 13.5.5 Phase 3 执行计划

**seeds**：42, 43, 44, 45, 46（每 seed 10 runs）
**总计**：4 组 × 50 runs = 200 runs
**预计耗时**：200 runs × 5 分钟 ≈ 16.7 小时纯运行
**预计 API 成本**：~$25（基于 Pilot 平均 110K tokens/run × 200 runs × DeepSeek 定价）

**前置条件**：
1. ✅ tsc 零错误（Phase 2.8）
2. ✅ 616 tests passed（Phase 2.8）
3. ✅ Pilot A/B 链路验证通过
4. ⏳ C 组 Pilot 验证 SemanticTool 异步路径（待执行）
5. ⏳ 统计分析脚本准备（permutation test, Cohen's d, CI）

---

## 14. 已知局限与下一步方向

### 14.1 已确认的局限

| # | 局限 | 影响 | 状态 |
|---|------|------|------|
| 1 | 跨模型数据代码版本混淆 | 跨模型结论不可靠 | 待重跑 |
| 2 | JSON 无 provider/model 字段 | 模型身份靠推断 | 设计缺陷 |
| 3 | 恶意实验 F 组数据不全 | EFG 分析受影响 | 待补跑 |
| 4 | Echo Chamber 检测器无效（separation 0.000） | 治理信号有冗余 | 已识别 |
| 5 | introduce_diversity / continue_discussion 低效 | 已 deprecate | 已识别 |
| 6 | Supplier 任务天花板效应 | shuffle 条件无效（d=0.09） | 任务固有 |
| 7 | 共识-质量相关不显著（p=0.20） | 不能作为"发现" | 降级为探索性观察 |
| 8 | E9 smoke test N=6 | preliminary，非正式实验 | 需扩大样本 |

### 14.2 已修复的问题

**引擎与统计层面**：mulberry32 PRNG 替代 Math.random()；Kendall τ tie 修正公式 bug；PromptInjector [GOV] 标签伪造漏洞；DiscussionEngine.reset() 跨实验状态泄漏；实验文件名加 speakMode 防覆盖；配对置换检验 (count+1)/(nPerms+1) 修正；verifyFindings.ts 硬编码 d=1.82 替换为实际计算。

**Campaign Pipeline 层面**（详见第 12.3 节）：E2 p-value 硬编码改为模型级 Bootstrap；E2 Bootstrap 单值退化改为逐轮数据点重采样；E3-E8 Metric 和 Statistical Test 补全；Fig 6 相关矩阵占位符改为实际计算值。

### 14.3 下一步方向

**数据补全**：跨模型验证重跑（用当前代码版本 evalEveryKUtterances=2 重跑 DeepSeek C 组与 Zhipu C 组配对）；JSON 格式增强（添加 provider/model 字段）；补跑 F 组恶意实验使 EFG 数据完整且 codeVersion 一致。

**科学战役**：E1-E8 正式运行（Pipeline 已 Approved）；E7 Ground Truth 标注 20 个偏差场景。

**样本扩展**：E9 从 N=6 扩大到 n≥30/cell；关键字段实验从 n=10 提升到 n≥30。

### 14.4 项目定位（统一叙事口径）

> SwarmAlpha 是一个 LLM 多智能体认知治理研究平台。核心贡献是将社会热力学从描述性理论工程化为运行时诊断信号，并实证发现"干预策略选择决定治理成败"——v2.0 破坏性干预使效果 Δτ=-0.267，v2.1 非破坏性干预在当前 smoke test（N=6）中 Δτ=0.000，需正式实验验证。测量框架已验证，治理干预策略正在扩展验证中。

---

## 文档撰写说明

本文档所有数字均以 [`docs/SOT.md`](../SOT.md) 为准，归档精华吸收自：
- [`docs/archive/research/EXPERIMENTAL_CAMPAIGN_PLAN.md`](../archive/research/EXPERIMENTAL_CAMPAIGN_PLAN.md)（E1-E8 实验设计）
- [`docs/archive/research/EXPERIMENT_READINESS_REPORT.md`](../archive/research/EXPERIMENT_READINESS_REPORT.md)（模块审查与 Blocker）
- [`docs/archive/roadmap/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT.md`](../archive/roadmap/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT.md)（Blocker 修复与 Pipeline 验证）

**数字校验基准**（SOT §2-§3）：573 total JSON / 169 closed-loop runs / 6 E9 runs；Crisis none=24/full=32(含8 fixed)/shuffle=24；Supplier none=30/full=30/shuffle=29；Cohen's d: Crisis full=0.92/shuffle=1.44, Supplier full=0.47/shuffle=0.09；共识-质量 r=-0.10/p=0.20（不显著）；E9 Δτ=-0.267（v2.0历史）→0.000（v2.1当前实测，+0.533历史值未复现）。
