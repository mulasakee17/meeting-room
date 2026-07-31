# SwarmAlpha v6 验收报告与优化方案

> **日期**：2026-07-29
> **前提**：V5 路线已部分执行，V6 文档已起草。本文档验收 V5 执行情况，指出 V6 的剩余问题，并给出优化后的路线。

---

## 目录

1. [V5 执行验收](#1-v5-执行验收)
2. [V6 待修正问题](#2-v6-待修正问题)
3. [前沿工作深度整合](#3-前沿工作深度整合)
4. [优化后的 V6 路线](#4-优化后的-v6-路线)
5. [δ 指标体系精修](#5-δ-指标体系精修)
6. [实验设计精修](#6-实验设计精修)
7. [论文叙事精修](#7-论文叙事精修)
8. [可执行下一步](#8-可执行下一步)

---

## 1. V5 执行验收

### 1.1 已完成的 V5 任务

| V5 任务 | 状态 | 证据 |
|---------|------|------|
| `stanceFromItemBeliefs()` — b 从 itemBeliefs 派生 | ✅ | [cognitiveState.ts:197](src/lib/agent/cognitiveState.ts#L197) |
| `beliefToCognitiveState()` 标记 deprecated | ✅ | [cognitiveState.ts:209](src/lib/agent/cognitiveState.ts#L209) |
| `computeDelta.ts` — 5 信号 δ 诊断层 | ✅ | [computeDelta.ts](src/lib/thermodynamics/computeDelta.ts)（400 行） |
| `diagnoseAndSuggest()` — Thermo→δ→干预 完整链路 | ✅ | [MeasurementLayer.ts:1049](src/lib/thermodynamics/MeasurementLayer.ts#L1049) |
| `computeExposure()` / `computeNovelty()` — 信息曝光度 | ✅ | [MeasurementLayer.ts:417](src/lib/thermodynamics/MeasurementLayer.ts#L417) |
| `GovernanceRuntime.ts` — 可嵌入运行时 | ✅ | [GovernanceRuntime.ts](src/runtime/GovernanceRuntime.ts)（320 行） |
| `measurement-layer.test.ts` — 新增测试 | ✅ | 431+ 行测试 |
| NativeCognitiveEngine 接入实验管线 | ✅ | [Runner.ts:309](experiments/campaign/pipeline/Runner.ts#L309) `runtimeMode === "native_cognitive"` |
| `structuredEvidence` 类型定义 | ✅ | [types.ts](src/lib/discussion/types.ts) `StructuredEvidenceItem` |
| ItemBeliefs 持久化到实验 JSON | ✅ | Runner.ts 已保存 roundResults |

**测试状态**：470 passed, 3 skipped, 23 test files。全部通过。

### 1.2 V5 任务中未完成或半完成的

| V5 任务 | 实际状态 | 问题 |
|---------|---------|------|
| "旧检测器改为接收 CognitiveState" | ❌ **未做** | `NativeCognitiveEngine.applyCognitiveGovernance()` 仍调用 `runDetectors()`（旧 6 检测器），不是 `diagnoseAndSuggest()`（δ 诊断） |
| "prompt 去掉 belief 字段" | ❌ **半完成** | [Native_Cognitive_Validation_Report.md](experiments/campaign/output/e1_native_lite/Native_Cognitive_Validation_Report.md:54) 审计发现 `buildPrompt` 仍注入 `state.belief` 到 LLM 上下文——信息泄漏 |
| "δ 接入治理循环" | ❌ **未做** | `diagnoseAndSuggest()` 已实现但零调用方——是死代码 |

### 1.3 核心断裂点

当前唯一工作的治理闭环：

```
NativeCognitiveEngine.applyCognitiveGovernance()
  → MeasurementLayer.runDetectors()           ← 旧 6 检测器
  → generateCognitiveInterventions(issues)    ← 旧检测器的 issue
  → CognitiveStateModification → prompt 注入
```

**diagnoseAndSuggest() 从未被调用。** δ 指标计算了、存储了，但不参与任何干预决策。这是一条"装饰性代码路径"——代码存在、测试通过、但治理循环不经过它。

---

## 2. V6 待修正问题

### 2.1 必须修正（阻塞性）

#### 问题 A：§2.3 仍引用 Δτ=+0.533

```
V6 §2.3: "v2.1 已验证 inject_evidence + rebalance_attention 的 Δτ=+0.533"
```

[SOT.md §3.3](docs/SOT.md#L110-117)：
> 2026-07-25 重跑后实测 Δτ=0.000（none 组 0.733±0.306 vs cognitive 组 0.733±0.116，两组均值相同）。+0.533 为历史值，当前数据不支持。

**修正**：
```
v2.0 破坏性干预明确有害（Δτ=-0.267）。v2.1 非破坏性干预的设计原则（改变信息流而非信念权重）
已被提出，但当前 smoke test（N=6，Supplier 天花板）未检测到显著正向效果（Δτ=0.000）。
正式验证需要更大样本（N≥30）的困难任务实验（Phase 2）。
```

#### 问题 B：X 变量语义混淆未解决

V6 正确指出了 X/N 的语义混淆，但 δ_exposure 和 δ_imbalance 仍然使用 X（CEP 曝光度），而 X 的计算仍然基于全局信息池。

`computeExposure()` 的实现需要审查——如果它依赖预定义信息分布，那么 δ_exposure 和 δ_imbalance 在部署时仍然不可用。

**修正**：在 MeasurementLayer 中明确区分两套 X 计算：
- `computeExposureLab(agentId, groundTruthInfoSet)` — 实验验证层，需要 ground truth
- `computeExposureDeploy(agentId)` — 部署层，基于 agent 之间 evidence 的 Jaccard 重叠

部署层不需要知道全局信息池——只需要比较 agent 之间谁接触了更多独特的 evidence 条目。

#### 问题 C：δ_consistency 的数值稳定性

```
δ_consistency = max_i |ΔU_i| / I_i
```

当 I_i 接近 0 时（低惯性 agent），微小扰动会产生巨大 δ。

**修正**：分母使用 `max(I_i, 0.1)`。

#### 问题 D：maxRounds=3 压制 δ 动态

δ_consistency 需要 utilityHistory（至少 2 轮才能计算 ΔU）。3 轮意味着 δ 信号只在最后一轮出现。

**修正**：实验最低配置 maxRounds=5。基准任务应设计为需要 ≥5 轮才能收敛的类型。

### 2.2 建议修正（非阻塞性）

#### 问题 E：E（信息状态）的丢失

V5 将 E 定位为"治理的核心杠杆"。V6 用 X（CEP 曝光度）替代了 E.coverage，但：

- X 测量的是"agent 被群体影响的程度"（基于 CEP），不是"agent 持有什么信息"
- E 测量的是"agent 接触了哪些证据条目"——这是一个不同的概念

两者不是替代关系。X 适合检测信息传播异常，E 适合检测信息覆盖不足。

**建议**：在 δ 体系中恢复 E 相关的指标——不是替代 X，而是作为补充：
- `δ_exposure`（基于 X）：检测信息传播异常
- `δ_coverage`（基于 E）：检测信息覆盖不足（实验层可用，部署层用相对 coverage）

#### 问题 F：δ_exposure 公式的边界条件

```
δ_exposure = (1 - mean(X)) × R
```

当 R=0.5（中等共识）且 mean(X)=0.3（低曝光度）时，δ=0.35 → 不触发（<0.5）。
但这种情况可能恰恰是"信息严重不足但群体还没锁定"——应该触发早期预警。

**建议**：分离为两个条件：
1. `R > 0.7 AND mean(X) < 0.5` → 过早共识（触发 inject_evidence）
2. `mean(X) < 0.3`（不论 R 值）→ 信息严重不足（触发早期预警）

#### 问题 G：实验功效

V6 设计 15 runs/配置。Between-subjects d=0.5 需要 n≈64/组（80% 功效）。

**修正**：n≥20/配置（至少能检测 d≥0.8，与 V5 主证据效应量对齐），n≥24/配置（与 V5 的 24/cell 一致）。

### 2.3 内容性修正总结

| 问题 | 严重度 | 修正位置 | 改动量 |
|------|--------|---------|--------|
| A: Δτ=+0.533 | 🔴 阻塞 | V6 §2.3 | 1 段 |
| B: X 语义混淆 | 🔴 阻塞 | computeExposure 双路径 | ~30 行 |
| C: δ_consistency 稳定性 | 🟡 建议 | computeDelta.ts:205 | 1 行 |
| D: maxRounds=3 | 🟡 建议 | 实验配置 | 参数 |
| E: E 层丢失 | 🟡 建议 | 新增 computeDeltaCoverage | ~30 行 |
| F: δ_exposure 边界 | 🟡 建议 | computeDelta.ts:118 | ~10 行 |
| G: 实验功效 | 🟡 建议 | 实验配置 | 参数 |

---

## 3. 前沿工作深度整合

### 3.1 四条可吸收的前沿线索

#### 线索 1：Hidden Anchors → δ_anchoring

Hidden Anchors (arXiv:2606.19494) 用 OLS 从 b(t) 轨迹中恢复 FJ 锚点参数 α：

```
b_i(t) = α_i × b_group(t) + (1-α_i) × b_i(0)
```

α→0：agent 完全锚定在初始立场，不跟随群体
α→1：agent 完全跟随群体，无独立立场

**本项目可吸收的**：
- 新增 δ_anchoring = 1 - α_i（从 U 轨迹 OLS 拟合）。α_i 异常低 → agent 是"信息黑洞"（持有信息但不根据他人信息调整立场）
- δ_anchoring 触发 → inject_evidence 注入该 agent 未分享的证据到他人
- 验证方式：δ_anchoring 是否与恶意 agent（prompt 锁死立场）的识别率相关

**整合代价**：分析脚本新增 OLS 拟合（~40 行），不增加运行时成本（posthoc）。

#### 线索 2：Belief Engine → U 更新验证

Belief Engine (arXiv:2605.15343) 的 evidence uptake 机制：

```
当 agent 接收到新证据 e 时，evidential state 按 log-odds 更新。
如果证据支持 option_k:
  U_i[k] 应增加（方向与证据一致）
如果证据反对 option_k:
  U_i[k] 应减少
```

**本项目可吸收的**：
- 在分析脚本中验证：agent 的 U 变化方向是否与其接收到的 evidence 方向一致
- 如果不一致 → δ_consistency 被验证为有效信号（检测到了真正的"言行不一"）
- 如果一致率高（>90%），说明 LLM 的 evidence uptake 基本理性，治理的杠杆在信息分配而非信念修正

**整合代价**：分析脚本（~50 行），不增加运行时成本。

#### 线索 3：BeliefShift → δ 阈值校准

BeliefShift (arXiv:2603.23848) 提供了 2,400 条人工标注的信念一致性轨迹。4 个指标中：
- BRA（Belief Revision Alignment）对应 δ_consistency
- DCS（Directional Consistency Score）对应 R 的时序稳定性

**本项目可吸收的**：
- 用 BeliefShift 的标注数据校准 δ_consistency 的阈值（替代当前启发式阈值 2.0）
- 在论文中报告"δ_consistency 阈值基于 BeliefShift benchmark 校准"——这比"我们拍了一个 2.0"强得多

**整合代价**：分析脚本（~30 行），下载 BeliefShift 数据集。**这是提升论文可信度的最高 ROI 投入之一。**

#### 线索 4：CoBRA → 检测器的心理学验证

CoBRA (Liu et al., CHI 2026) 使用经典社会心理学实验范式（Asch 从众实验、群体极化实验）来验证认知偏差指数的 construct validity。

**本项目可吸收的**：
- 构造一个已知的"Asch 从众"场景（3 个 agent 被 prompt 锁死在错误答案，1 个 agent 自由）→ 验证 δ_polarization 是否触发
- 构造一个已知的"群体极化"场景（agent 初始信念被推向极端）→ 验证 δ_polarization 是否比随机基线更敏感

**整合代价**：2 个新实验场景（~100 行配置），运行 ~10 次实验。

---

## 4. 优化后的 V6 路线

基于 V6 原始文档 + 上述修正 + 前沿工作整合，以下是优化后的 Phase 划分：

### Phase 1：V5 收尾 —— 接通诊断链路（1-2 天）

**目标**：消除断裂点。让 δ 指标真正驱动治理。

```
当前：
  applyCognitiveGovernance() → runDetectors()（旧 6 检测器）
  diagnoseAndSuggest() → 死代码

目标：
  applyCognitiveGovernance() → diagnoseAndSuggest()（δ 诊断）
  runDetectors() → 仅保留用于向后兼容测试
```

**具体任务**：

| # | 任务 | 文件 | 行数 |
|---|------|------|------|
| 1.1 | `applyCognitiveGovernance()` 改为调用 `diagnoseAndSuggest()` | nativeCognitiveEngine.ts:486 | ~10 |
| 1.2 | `GovernanceRuntime.runCognitiveGovernance()` 改为调用 `diagnoseAndSuggest()` | GovernanceRuntime.ts | ~10 |
| 1.3 | `suggestions[]` → `DetectionResult` 适配器（让 diagnoseAndSuggest 输出兼容 generateCognitiveInterventions 的输入） | MeasurementLayer.ts | ~20 |
| 1.4 | `runDetectors()` 保留 + 标记 deprecated | MeasurementLayer.ts | ~3 |
| 1.5 | 从 `buildPrompt` 中移除 `state.belief` 注入（修复信息泄漏） | nativeCognitiveEngine.ts:204-205 | ~5 |
| 1.6 | 更新单元测试：δ 驱动治理的端到端测试 | test/ | ~30 |
| 1.7 | 跑全部测试：470 必须继续通过 | — | — |

**产出**：δ 驱动的治理闭环运行中。热力学异常 → δ 诊断 → 定向干预 → 效果追踪。

### Phase 2：实验验证 —— 因果链证明（1-2 周）

**目标**：用实验数据验证因果链。

**前置条件修复**（从 V6 原始方案修改）：

| V6 原始 | 优化后 | 理由 |
|---------|--------|------|
| n=15/配置 | **n≥24/配置** | 功效对齐 V5 主证据 |
| 大学排名任务 | 大学排名任务 + 验证基线 τ | 确保基线 τ 在 0.3-0.5 |
| 仅 δ vs baseline | δ vs baseline + δ vs 旧检测器 | 证明 δ 不低于旧系统 |
| maxRounds=5 | maxRounds=5 | 保持不变 |
| deepseek-v4-flash | deepseek-chat（与 V5 主证据一致） | 模型一致性 |

**实验矩阵**：

| 组 | 条件 | n | 引擎 | 治理 |
|----|------|---|------|------|
| A | none | 24 | NativeCognitiveEngine | 无 |
| B | δ 治理 | 24 | NativeCognitiveEngine | δ→干预 |
| C | 旧检测器治理 | 24 | NativeCognitiveEngine | 旧 6 检测器→干预 |
| D | random 干预 | 24 | NativeCognitiveEngine | 随机干预（对照） |

总计：96 runs。

**验证指标**（从 V6 原始方案补充）：

| 指标 | 新增？ | 测量方式 |
|------|--------|---------|
| Δτ (B-A) | — | permutation test, (count+1)/(nPerms+1) 校正 |
| δ 触发率 | — | 触发轮次/总轮次 |
| δ 响应（干预前后 δ 变化） | — | paired t-test |
| **Δτ (B-C)** | 🆕 | δ vs 旧检测器直接对比 |
| **δ_anchoring 与恶意 agent 识别率** | 🆕 | OLS 拟合 α，ROC/AUC |
| **U-E 一致性率** | 🆕 | 分析脚本 posthoc |

### Phase 3：分析验证 —— 因果链分解 + 前沿对标（1 周）

**在 Phase 2 基础上新增的分析**：

| 分析 | 来源 | 产出 |
|------|------|------|
| 中介分析：干预→Δδ→ΔU→ΔR→Δτ | V6 原始 | 因果链每段检验 |
| δ_anchoring OLS 拟合 | Hidden Anchors 整合 | α 分布，恶意识别 AUC |
| U-E 一致性验证 | Belief Engine 整合 | evidence uptake 方向一致率 |
| δ 阈值校准 | BeliefShift 整合 | 基于 benchmark 的阈值推荐 |
| δ vs 旧检测器的 Δτ 对比 | 新增 | 非劣效性检验 |
| X(实验层) vs alignment(部署层) 相关 | V6 原始 | 部署等效性验证 |

---

## 5. δ 指标体系精修

基于上述分析，优化后的 δ 指标：

| δ | 公式（修正后） | 部署可用 | 阈值来源 | 触发干预 |
|---|--------------|---------|---------|---------|
| **δ_exposure** | `(1-mean(X))×R`，分离为两条件 | ✅ 使用部署版 X | 网格搜索 + BeliefShift 校准 | inject_evidence |
| **δ_concentration** | `max(I)/mean(I)` | ✅ | 网格搜索 | rebalance_attention |
| **δ_consistency** | `max_i(|ΔU_i|/max(I_i,0.1))` | ✅ | BeliefShift BRA 校准 | inject_evidence |
| **δ_polarization** | `mean pairwise cosine dist(U)` | ✅ | Asch 范式验证 | inject_evidence |
| **δ_imbalance** | `Gini(X_i)` | ✅ | 网格搜索 | rebalance_attention |
| **δ_coverage** 🆕 | `1 - mean(E.relative_coverage)` | ⚠️ 部署版用相对 coverage | 网格搜索 | inject_evidence |
| **δ_anchoring** 🆕 | `1 - α_i`（FJ OLS 拟合） | ✅（posthoc） | Hidden Anchors 论文 | inject_evidence |

**δ_coverage（新增）与 δ_exposure 的分工**：
- δ_exposure：检测"信息传播异常"（agent 被群体影响的程度不足）
- δ_coverage：检测"信息覆盖不足"（已出现的证据中 agent 只接触了一部分）
- 两者互补：一个 agent 可能 X 正常（跟随群体）但 E.coverage 低（没看到所有证据）

---

## 6. 实验设计精修

### 6.1 任务设计

V6 的大学排名任务设计原则保留，补充：

**基线验证（实验前必须完成）**：
- 用 `none` 条件跑 5 次 pilot → 验证 τ 基线是否在 0.3-0.5 区间
- 如果 τ > 0.6，增加难度（更多选项、更模糊的评分标准）
- 如果 τ < 0.2，降低难度（太随机 → 干预也无法改善）

**信息分散验证**：
- 确保每个 agent 至少持有 2 条独有信息
- 确保没有任何 agent 持有 >60% 的总信息量
- 在实验配置中明确标注信息分布矩阵

### 6.2 效果度量（新增项）

| 指标 | 公式 | 说明 |
|------|------|------|
| **δ 响应率** | P(δ 下降 \| 干预) | 干预是否解除异常信号 |
| **信息增益** | ΔE.coverage / 干预次数 | 每次干预平均增加多少信息覆盖 |
| **级联率** | P(干预触发更多干预) | 干预是否导致级联（旧系统的主要问题） |
| **过度干预率** | P(δ 正常但触发干预) | δ 假阳性率 |

---

## 7. 论文叙事精修

V6 的叙事结构保留，以下为关键段落的具体表述建议：

### 7.1 核心贡献段（Introduction 末段）

> We propose a two-layer governance architecture for LLM multi-agent deliberation. The thermodynamic layer uses four macroscopic statistics (R, T, H, F) computed from scalar stance summaries at zero additional LLM cost to screen for anomalous group dynamics. When an anomaly is detected, the diagnostic layer queries five δ indicators derived from multi-dimensional agent outputs (utility vectors, inertia, and information exposure) to identify the root cause—whether it is premature consensus under insufficient information exposure, concentration of behavioral inertia, anomalous preference shifts, utility polarization, or uneven information distribution. Each δ indicator maps to a specific non-destructive intervention (inject_evidence or rebalance_attention) that modifies information flow rather than belief weights. We validate this architecture on a hidden-profile task, demonstrating (1) a causal chain from intervention through δ change to decision quality improvement, (2) equivalence between laboratory information-exposure metrics and deployable alignment metrics, and (3) non-inferiority of δ-driven governance compared to prior detector-driven approaches.

### 7.2 δ 本体论段（Method 中）

> The δ indicators share a common design principle: each detects a contradiction between two observable signals rather than a deviation from a normative threshold. δ_exposure contrasts group consensus (R) with mean information exposure (X); δ_concentration contrasts the maximum behavioral inertia with the group mean; δ_consistency contrasts the magnitude of preference change with the inertia-based prediction; δ_polarization measures the mean pairwise cosine distance between utility vectors; δ_imbalance computes the Gini coefficient of information exposure across agents. Because these indicators compare observables against each other rather than against ground truth, they are deployable in scenarios where the correct answer is unknown—the common case in real-world multi-agent deliberation.

### 7.3 自我纠错段（Discussion 中）

> During the development of this framework, we made and subsequently corrected over ten claims about our own system. The orthogonal decomposition of disorder (r=0.917 between components), the effectiveness of 1D governance (falsified by 5D vector analysis), and the thermodynamic phase-transition narrative (no critical fluctuations detected) were all claims we believed, tested, and retracted. We report this not as a weakness but as evidence of the framework's empirical discipline. In a field where most published systems are evaluated once and never re-examined, we argue that systematic self-falsification should be a methodological norm.

---

## 8. 可执行下一步

### 立即（今天）

```
1. 修正 V6 文档 §2.3 的 Δτ 数字
2. 修正 δ_consistency 的数值保护（分母 max(I_i, 0.1)）
3. 在 MeasurementLayer 中区分 computeExposureLab / computeExposureDeploy
```

### Phase 1 执行（1-2 天）

```
4. applyCognitiveGovernance() 改用 diagnoseAndSuggest()
5. GovernanceRuntime 同步改造
6. buildPrompt 移除 state.belief 注入
7. 全量测试通过（470+ tests）
8. 手动跑 1 次 pilot 验证 δ 驱动的治理闭环是否正常运转
```

### Phase 1.5 预实验（1 天，Phase 1 和 Phase 2 之间）

```
9. 新任务 pilot（5 runs none 条件）→ 验证基线 τ
10. 如果 τ > 0.6，调整任务难度
11. 如果 τ < 0.2，降低任务难度
12. 确认 δ 指标在 pilot 数据上有合理的动态范围
```

### Phase 2 执行（1-2 周）

```
13. 大学排名任务 96 runs 实验
14. 持久化全部字段（itemBeliefs, structuredEvidence, U/E/I/C/Λ, δ per-round）
15. 完成后立即运行分析脚本验证数据完整性
```

### Phase 3 执行 + 论文（3-4 周）

```
16. 因果链分解 + 前沿对标分析
17. 论文初稿
18. 预注册（OSF）
19. arXiv 预印本 → 投稿
```

---

## 附录 A：V5→V6 关键决策变更

| V5 决策 | V6 决策 | 变更理由 |
|---------|---------|---------|
| 标量是"派生汇总统计" | 保留，但 b 通过 stanceFromItemBeliefs 实现 | 已实现 |
| 热力学层"筛查异常 → 触发 δ" | 保留，但 V6 发现 δ 未接入 | 需要 Phase 1 修复 |
| E（信息状态）是核心杠杆 | E 被 X 替代 | **需要在 V6 中恢复 E 作为补充指标** |
| "不重命名 belief" | 保留 | stanceFromItemBeliefs 是新的派生函数，belief 变量名保留 |
| 旧检测器改为接收 CognitiveState | **未执行** | V6 方案更优：旧检测器被 δ 替代，而非改造 |
| Δτ=+0.533（V5 中已修正为 0.000） | **V6 复现了历史数字** | 必须修正 |

## 附录 B：核心局限性（论文必须声明）

1. **τ 需要 ground truth**：部署时无法计算 τ，只能依赖 δ 信号检测异常
2. **δ 阈值基于离线校准**：不同任务可能需要不同阈值，在线自适应校准未实现
3. **单模型验证**：所有实验使用 DeepSeek-V3，跨模型泛化性未知
4. **封闭信息任务**：实验在 hidden-profile 任务上完成，开放任务中的表现待验证
5. **小群体（N=5）**：热力学统计量在更小或更大群体中的行为未知
6. **短讨论（3-5 轮）**：更长时间尺度上的 δ 动态未被研究
7. **U/E/C 是 LLM 自报数据**：不声称测量了"真实"内部认知状态，"stated" vs "observed" 的区分是本体论承诺
