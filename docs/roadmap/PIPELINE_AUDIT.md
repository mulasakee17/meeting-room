# 检测-诊断-干预管线审计与优化方案

> **状态**：2026-07-29（已修复：itemBeliefs 持久化、Hidden Anchors OLS 脚本；X/N 变量、管线闭环未实现）
> **来源**：基于完整管线代码审计 + X/N 变量设计 + 第一性原理分析
> **目的**：梳理管线现状，识别断裂点，提出优化方案

---

## 目录

1. [管线全景图](#1-管线全景图)
2. [新变量设计：X（曝光度）与 N（新颖度）](#2-新变量设计)
3. [逐层审计](#3-逐层审计)
4. [断裂点汇总](#4-断裂点汇总)
5. [优化方案](#5-优化方案)
6. [实施优先级](#6-实施优先级)

---

## 1. 管线全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│ ROADMAP_V5 愿景（Aspirational）                                        │
│                                                                     │
│   Thermo 筛查 → δ 诊断 → 定向干预 → 验证效果                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 当前实现（Actual）                                                     │
│                                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│   │ Thermo 筛查   │    │ δ 诊断        │    │ 6 认知检测器          │  │
│   │ R/T/H/F      │    │ coverage      │    │ Echo Chamber         │  │
│   │ (计算+存储)   │    │ concentration │    │ Polarization         │  │
│   │              │    │ consistency   │    │ Premature Consensus  │  │
│   │              │    │ (计算+存储)    │    │ Authority Bias       │  │
│   └──────┬───────┘    └──────┬───────┘    │ Evidence Imbalance   │  │
│          │                   │            │ CogAction Mismatch   │  │
│          │         ┌─────────┘            │ (计算+触发干预)        │  │
│          │         │                      └──────────┬───────────┘  │
│          │         │                                 │              │
│          │         │  ⚠ 未连接：δ 不触发干预          │              │
│          │         │                                 ▼              │
│          │         │                      ┌──────────────────────┐  │
│          │         │                      │ 干预层                 │  │
│          │         │                      │ inject_evidence      │  │
│          │         │                      │ rebalance_attention  │  │
│          │         │                      │ shuffle_knowledge    │  │
│          │         │                      └──────────────────────┘  │
│          │         │                                 │              │
│          │         │                      ⚠ 无效果验证反馈           │
│          │         │                                                 │
│          ▼         ▼                                                 │
│   ┌──────────────────────────────────────────────┐                  │
│   │ 数据存储（thermoHistory + deltaDiagnosis）     │                  │
│   │ 仅用于实验分析，不参与运行时治理决策           │                  │
│   └──────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 新变量设计：X（曝光度）与 N（新颖度）

### 2.1 动机：E.coverage 的根本缺陷

当前 E.coverage 有三种计算路径，均存在问题：

| 路径 | 计算方式 | 问题 |
|------|---------|------|
| Native 模式 | LLM 自报 `evidenceCoverage` | 主观，overconfident 偏差 |
| Post-hoc 模式 | 永远 0.5（从未更新） | **Bug：从未调用 updateEvidence()** |
| 独立函数 | `|items| / poolSize` | poolSize 默认 10，部署场景不可知 |

**根本原因**：Coverage 的语义是"agent 掌握了全部信息的多少比例"，但"全部信息"在真实场景中不可枚举。

### 2.2 X：信息曝光度（Information Exposure）

**定义**：

```
CEP = 集体证据池（Collective Evidence Pool）
    = ∪ 所有 agent 在讨论中已表达的 evidence items

X_i = |agent_i 已接触的证据 ∩ CEP| / |CEP|
```

**语义**：不是"agent 知道多少"，而是"agent 在集体讨论中听到了多少"。

**关键特性**：
- CEP 是运行时动态构建的，不需要预定义
- 全部分母可观测（所有 agent 的 evidence items 都在追踪中）
- 实验室和部署场景均可计算

**计算流程**：

```
每轮结束后：
1. 收集所有 agent 本轮新输出的 evidence items（去重）
2. 合并到 CEP（全局去重池）
3. 对每个 agent：
   X_i = agent_i 的 evidence items 中出现在 CEP 中的唯一项数 / |CEP|
```

**X 的变动含义**：

| X 变化 | 含义 | 治理信号 |
|--------|------|---------|
| X_i 远低于群体均值 | agent_i 被信息隔离 | rebalance_attention 提高其发言优先级 |
| X_i 接近 1.0 且仍在讨论 | 信息饱和，边际收益递减 | 可能进入收敛阶段 |
| X 方差大 | 信息分布不均 | inject_evidence 向低 X agent 注入信息 |

### 2.3 N：信息新颖度（Information Novelty）

**定义**：

```
N_i(t) = 本轮 agent_i 新增的去重证据数 / agent_i 累计证据总数
```

**语义**：agent 还在学新东西吗？信息觅食收益率。

**关键特性**：
- 完全自包含，不需要任何外部参考系
- 单一 agent 可独立计算
- 直接对应 Information Foraging Theory 的收益率概念

**N 的变动含义**：

| N 值 | 含义 | 治理信号 |
|------|------|---------|
| N > 0.3 | 仍在快速获取新信息 | 讨论有收益，继续 |
| 0.05 < N < 0.3 | 信息获取放缓 | 可能接近边际收益递减 |
| N < 0.05 | 信息饱和 | 继续讨论的边际收益递减 |
| 某个 agent 的 N 持续 > 0 但 X 不升 | 该 agent 在学习但没接触到核心信息 | 信息渠道有问题 |

### 2.4 X + N 替代 E.coverage 的映射

| 旧 E 维度 | 新指标 | 计算方式 | 是否需要 total | 部署可行 |
|-----------|--------|---------|---------------|---------|
| coverage | **X（曝光度）** | \|seen\| / \|CEP\| | 否 | 是 |
| （无对应） | **N（新颖度）** | new / total_seen | 否 | 是 |
| quality | sourceReliability 均值 | 不变 | 否 | 是 |
| diversity | Shannon(supports分布) | 不变 | 否 | 是 |

### 2.5 δ 指标更新

原 δ_coverage 改为 δ_exposure：

```
δ_exposure = (1 - mean(X)) × R + max(N) × 0.5
```

- 第一部分：(1 - mean(X)) × R → 曝光度低 + 共识高 → 过早共识
- 第二部分：max(N) × 0.5 → 如果仍有新信息在涌现，说明群体确实还没充分讨论
- 加权：信息覆盖不足（70%）+ 仍有新信息（30%）

触发条件：**群体共识高 + 曝光度低 + 仍有新信息在出现**
→ 群体在信息还没充分传播时就锁定了立场

### 2.6 论文表述

> We introduce two deployment-compatible information metrics: **Exposure (X)**, the fraction of the collectively articulated evidence pool an agent has encountered, and **Novelty (N)**, the rate at which an agent is still acquiring new information. Unlike coverage—which requires knowing the total information pool and is therefore limited to controlled experiments—X and N require only tracking the discussion itself. The collective evidence pool (CEP) is the union of all evidence items articulated by any agent, making it fully observable at runtime. Together, X and N enable our governance framework to detect premature consensus—when group alignment is high but information exposure is low and novel information is still emerging—without requiring ground truth or a predefined information inventory.

---

## 3. 逐层审计

### 3.1 热力学筛查层（ThermoState）

**位置**：`MeasurementLayer.computeThermoState()`

**当前实现**：

| 变量 | 计算方式 | 部署兼容 | 问题 |
|------|---------|---------|------|
| R | utility 向量 pairwise cosine 相似度均值 | ✅ | 与 asyncEngine 的 R（基于标量）是两套实现 |
| T | utility 向量逐轮 L2 距离均值 | ✅ | Round 1 永远为 0（无历史） |
| H | 所有 evidence items 的 supports 分布 Shannon 熵 | ✅ | — |
| F | (1-R) + T·H | ✅ | 操作化启发式，非物理量 |

**第一性原理评估**：

- ✅ R：衡量"群体偏好方向的一致性"——正确
- ✅ T：衡量"偏好的波动程度"——正确
- ✅ H：衡量"证据覆盖的广度"——正确
- ⚠️ F：在大群体中 T·H 可能主导，(1-R) 被稀释。但小群体（N=5）中 R 起主导作用——这是设计范围内的

**未连接**：ThermoState 计算后仅存入 thermoHistory，不触发任何下游逻辑。95% 轮次"跳过诊断"的愿景未实现。

### 3.2 δ 诊断层

**位置**：`computeDelta.ts`

**当前实现**：

| δ | 公式 | 依赖 | 部署兼容 | 问题 |
|---|------|------|---------|------|
| coverage | (1-mean(E.coverage))×R | E.coverage（不可靠） | ⚠️ | 见 §2.1 |
| concentration | max(I)/mean(I) | I（系统计算） | ✅ | 与 AuthorityBias detector 功能重叠 |
| consistency | max(|ΔU|/I) | U history + I | ✅ | Round 1 永远为 0 |

**第一性原理评估**：

- δ_coverage → 改为 δ_exposure 后：检测"信息不充分时的过早共识"——正确
- δ_concentration：检测"群体受到单一 agent 惯性主导"——正确，但忽略了"高 I 的 agent 可能是正确的"这种情况
- δ_consistency：检测"异常立场变化"——正确，但忽略了"异常变化可能是正确的（发现了关键信息）"这种情况

**未连接**：δ 仅用于实验分析，不触发干预。`computeDelta.ts` 的注释中写了"δ_coverage 触发 → inject_evidence"，但实际干预逻辑在 `cognitiveInterventions.ts` 中，走的是 6 个检测器，不走 δ。

### 3.3 认知检测器层（6 个检测器）

**位置**：`cognitiveDetectors.ts`

| 检测器 | 信号 | 阈值 | 硬编码 | 效果 |
|--------|------|------|--------|------|
| Echo Chamber | 0.3×(1-covVar)+0.3×(1-divMean)+0.4×Jaccard | 0.75 | 是 | 分离度 0.000（无效） |
| Polarization | pairwise cosine 距离均值 | 0.25 | 否 | 分离度优化过 |
| Premature Consensus | roundProgress×utilityConsensus×(1-dispersion) | 0.55 | 否 | — |
| Authority Bias | 0.5×(inertiaConc-1)+0.5×(suscAsym-1) | 0.6 | 否 | — |
| Evidence Imbalance | 简化基尼系数 | 0.4 | 是 | 依赖 E.coverage |
| CogAction Mismatch | topChoice ≠ rankingTopChoice | gap>0.4 | 是 | — |

**第一性原理评估**：

1. **Echo Chamber**：已知分离度 0.000（项目记忆）。应**移除或完全重写**，不应继续消耗计算资源。

2. **Polarization**：用 pairwise cosine 距离替代 k-means 是正确的，pairwise 在 N=5 时比 k-means 更稳定。

3. **Premature Consensus**：`roundProgress × utilityConsensus × (1 - dispersion)` 的公式有问题——early round 时 roundProgress 小，会削弱信号。应该是"consensus 高 + round 早 → 过早共识"，但公式中 roundProgress 越小信号越弱，**与直觉相反**。

4. **Authority Bias**：inertiaConcentration 和 δ_concentration 计算的是同一件事（max(I)/mean(I)），但用了不同的阈值和 severity 分级。**功能重复**。

5. **Evidence Imbalance**：基尼系数本身是合理的，但依赖 E.coverage。改为 X 后可修复。

6. **Cognitive Action Mismatch**：topChoice ≠ rankingTopChoice 是合理的信号，但 gap > 0.4 的硬编码阈值未经验证。

**检测器与 δ 的关系**：

| 检测器 | 检测什么 | δ 对应 | 关系 |
|--------|---------|--------|------|
| Premature Consensus | 过早共识 | δ_exposure | **重叠**：两者检测同一现象 |
| Authority Bias | 权威集中 | δ_concentration | **重叠**：两者用同一信号 |
| Polarization | 偏好分化 | — | 互补：δ 没有极化检测 |
| Evidence Imbalance | 证据不均 | — | 互补：δ 没有分配公平性检测 |
| CogAction Mismatch | 言行不一 | δ_consistency | **部分重叠**：都检测"异常" |
| Echo Chamber | 信息冗余 | — | 无效，应移除 |

### 3.4 干预层

**位置**：`cognitiveInterventions.ts`

| 干预 | 机制 | 破坏性 | 证据 |
|------|------|--------|------|
| inject_evidence | 注入私有知识到 prompt | 否 | 未验证 |
| rebalance_attention | 调整发言优先级 | 否 | 未验证 |
| shuffle_knowledge | 轮转知识分配 | 否 | d=1.44（旧数据） |

**检测器 → 干预映射**（硬编码在 `generateCognitiveInterventions`）：

```
echo_chamber_cognitive  → rebalance_attention
polarization_cognitive  → inject_evidence
premature_consensus     → inject_evidence
authority_bias          → rebalance_attention
evidence_imbalance      → inject_evidence
cognitive_action_mismatch → rebalance_attention
```

**第一性原理评估**：

1. **inject_evidence 的前提条件**：需要 `agentKnowledge`（来自 task config）。如果 agentKnowledge 为空，降级为 evidenceGuidance（仅提示关注证据）。**降级路径的效能未知**。

2. **rebalance_attention 的机制**：仅调整发言顺序。"让被忽视的 agent 先发言"是好的，但如果被忽视的 agent 也没有独特信息，调整顺序没有意义。

3. **shuffle_knowledge**：最有效的干预（d=1.44），但只在实验开始时生效一次。**缺乏运行时触发机制**——当前只在 `__governance__` 标记中触发，不是由检测器驱动的。

4. **无效果验证**：干预执行后，没有反馈回路验证"干预是否真的改善了情况"。因果链（inject_evidence → ΔX → ΔU → ΔR → τ）未被系统性地测量。

5. **干预冲突**：如果两个检测器同时触发，一个要 inject_evidence，一个要 rebalance_attention，对同一个 agent 同时降低发言优先级又注入证据——**语义冲突**。

### 3.5 数据持久化层

**位置**：`Runner.ts`

**当前存储**：

- `thermoHistory`：每轮 R/T/H/F 快照
- `deltaDiagnosis`：每轮 δ 诊断
- `cognitiveTrajectory`：每轮每个 agent 的 5 维认知状态
- `beliefTrajectory`：旧标量轨迹
- `itemBeliefsTrajectory`：✅ 2026-07-29 新增——逐轮逐 agent 的 K 维偏好向量（Hidden Anchors 锚点恢复核心数据）
- `roundOpinions`：✅ 2026-07-29 新增——完整 opinion（reasoning、evidence、referencedAgents），用于信息传播路径追踪

**问题**：
- thermoHistory 和 deltaDiagnosis 仅用于事后分析，不参与运行时决策
- 缺少 X 和 N 的持久化
- 缺少干预效果的因果链追踪（干预前 X vs 干预后 X，等等）

---

## 4. 断裂点汇总

### 断裂点 1：E.coverage 不可靠
**影响范围**：δ_coverage、Evidence Imbalance detector、Echo Chamber detector、Confidence.evidenceBased
**修复**：引入 X（曝光度）+ N（新颖度）替代

### 断裂点 2：Post-hoc 模式 coverage 从未更新
**影响范围**：所有使用旧 DiscussionEngine 的实验
**修复**：在 post-hoc 更新路径中调用 X 计算（而非 updateEvidence）

### 断裂点 3：Thermo → δ → 干预 未连接
**影响范围**：ROADMAP_V5 的核心愿景未实现
**修复**：方案 A：让 δ 触发干预（激进）；方案 B：合并 δ 和检测器，消除冗余（保守）

### 断裂点 4：δ 与检测器功能重叠
**影响范围**：Premature Consensus ↔ δ_exposure、Authority Bias ↔ δ_concentration
**修复**：统一为一套诊断层，消除重复

### 断裂点 5：Echo Chamber 检测器无效
**影响范围**：分离度 0.000，浪费计算
**修复**：移除或基于 X 方差重写

### 断裂点 6：Premature Consensus 公式反向
**影响范围**：roundProgress 越小信号越弱，与直觉相反
**修复**：改为 (1 - roundProgress) × utilityConsensus × (1 - dispersion)

### 断裂点 7：无干预效果反馈回路
**影响范围**：无法验证干预是否有效
**修复**：干预前后记录 X/N/τ，计算 Δ

### 断裂点 8：干预冲突无处理
**影响范围**：同一 agent 被同时要求降低优先级和注入证据
**修复**：干预优先级排序 + 冲突检测

### 断裂点 9：硬编码阈值
**影响范围**：Evidence Imbalance (0.4)、CogAction Mismatch (gap>0.4)、Echo Chamber severity (0.90/0.75)、Polarization severity (0.40/0.25)
**修复**：全部移到 GovernanceConfig

---

## 5. 优化方案

### 5.1 统一诊断层：合并 δ 与检测器

当前状态：
```
δ 层（3 个指标）→ 仅存储，不触发干预
检测器层（6 个）→ 触发干预，但与 δ 重叠
```

优化后：
```
统一诊断层（5 个信号）→ 触发干预
  ├─ δ_exposure      (替代 δ_coverage + Premature Consensus)
  ├─ δ_concentration (替代 δ_concentration + Authority Bias)
  ├─ δ_consistency   (保留)
  ├─ δ_polarization  (新增，替代 Polarization detector)
  └─ δ_imbalance     (新增，替代 Evidence Imbalance)
```

**优势**：
- 消除冗余：δ 和检测器不再各自维护
- 统一阈值：所有阈值在 DeltaConfig 中集中管理
- 清晰语义：δ 层 = 诊断层，诊断结果直接映射到干预

### 5.2 接通 Thermo → δ → 干预

```
每轮流程：
1. Thermo 筛查：计算 R/T/H/F
2. 判断：F > threshold 或 连续两轮 F 不降反升？
   - 否 → 跳过诊断，继续讨论
   - 是 → 触发统一诊断层
3. 统一诊断：计算 5 个 δ 指标
4. 干预映射：
   δ_exposure 触发      → inject_evidence
   δ_concentration 触发 → rebalance_attention
   δ_polarization 触发  → inject_evidence（向极化双方注入对方证据）
   δ_imbalance 触发     → inject_evidence（向证据贫乏 agent 注入）
   δ_consistency 触发   → rebalance_attention（让异常 agent 先发言）
5. 干预后验证：记录 ΔX, ΔN, Δτ
```

### 5.3 修复 Premature Consensus 公式

```diff
- const score = roundProgress * utilityConsensus * (1 - beliefDispersion);
+ const score = (1 - roundProgress) * utilityConsensus * (1 - beliefDispersion);
```

新的含义：**轮次越早 + 共识越高 + 离散越低 → 过早共识**。与直觉一致。

### 5.4 新增 X 和 N 的计算与持久化

**代码改动**：

1. `MeasurementLayer` 新增方法：
   - `computeCollectiveEvidencePool()`: 返回 CEP
   - `computeExposure(agentId)`: 返回 X_i
   - `computeNovelty(agentId)`: 返回 N_i

2. `Evidence` 接口新增字段：
   - `exposure: number`（替代 coverage 的部署角色）
   - `novelty: number`

3. `Runner.ts` 持久化新增：
   - `exposureTrajectory`: 每轮每个 agent 的 X 值
   - `noveltyTrajectory`: 每轮每个 agent 的 N 值

4. `computeDelta.ts` 新增：
   - `computeDeltaExposure`: δ_exposure = (1-mean(X))×R + max(N)×0.5

### 5.5 移除 Echo Chamber 检测器

已有实验数据证明分离度 0.000，不具备检测能力。代码中标记为 deprecated 并移除调用。

### 5.6 消除硬编码阈值

所有阈值移到 `GovernanceConfig`（Evidence Imbalance 的 0.4、CogAction Mismatch 的 gap>0.4 等已在 `DeltaConfig` 中）。

### 5.7 干预冲突处理

当多个 δ 同时触发时，优先级排序：
1. δ_imbalance（信息分配不均，最根本）
2. δ_exposure（过早共识）
3. δ_polarization（偏好极化）
4. δ_concentration（权威集中）
5. δ_consistency（异常立场变化）

同一 agent 不会同时收到冲突的干预（如既降低优先级又提高优先级）。

### 5.8 干预效果反馈

干预前后记录：
```
干预前：X_before, N_before, τ_before
干预后（下一轮）：X_after, N_after, τ_after
ΔX = X_after - X_before
Δτ = τ_after - τ_before
```

如果 ΔX > 0 但 Δτ ≤ 0：信息曝光度上升但没有改善决策 → 干预无效
如果 ΔX > 0 且 Δτ > 0：信息通道有效 → 因果链验证通过

---

## 6. 实施优先级

### P0：必须修复（影响核心结论的有效性）

| # | 改动 | 影响 | 行数 |
|---|------|------|------|
| 1 | 实现 X（曝光度）和 N（新颖度）计算 | 替代不可靠的 E.coverage | ~60 |
| 2 | 修复 Post-hoc 模式 coverage 从未更新 bug | 旧实验数据质量 | ~5 |
| 3 | 修复 Premature Consensus 公式反向 | 检测器正确性 | ~1 |
| 4 | 移除 Echo Chamber 检测器调用 | 消除无效计算 | ~5 |

### P1：应尽快修复（改善管线一致性）

| # | 改动 | 影响 | 行数 |
|---|------|------|------|
| 5 | 合并 δ 与检测器为统一诊断层 | 消除冗余 | ~80 |
| 6 | 接通 Thermo → 统一诊断 → 干预 | 核心愿景实现 | ~50 |
| 7 | 消除硬编码阈值 | 可配置性 | ~20 |

### P2：增强（提升论文质量）

| # | 改动 | 影响 | 行数 |
|---|------|------|------|
| 8 | 干预效果反馈回路 | 因果链验证 | ~40 |
| 9 | 干预冲突处理 | 系统健壮性 | ~30 |
| 10 | X/N 数据持久化 | 实验分析 | ~20 |

---

## 附录：变量对照表

| 旧变量 | 新变量 | 变更原因 |
|--------|--------|---------|
| E.coverage（LLM 自报） | X（曝光度） | 部署兼容，客观可测 |
| （无） | N（新颖度） | 信息觅食收益率，不需要参考系 |
| δ_coverage | δ_exposure | 使用 X+N 替代 E.coverage |
| Echo Chamber detector | 移除 | 分离度 0.000，无效 |
| Premature Consensus detector | 合并到 δ_exposure | 功能重叠 |
| Authority Bias detector | 合并到 δ_concentration | 功能重叠 |
| Evidence Imbalance detector | δ_imbalance（新增） | 统一到 δ 框架 |
| Polarization detector | δ_polarization（新增） | 统一到 δ 框架 |