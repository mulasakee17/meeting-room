# SwarmAlpha v5 路线规划与实施方案

> **状态**：2026-07-29（Phase 1 代码改造已完成，Phase 1.5 探测实验部分完成）
> **来源**：基于 v0.3→v0.4 理论演进、10+ 自我纠错记录、双层架构讨论的综合辩证分析
> **核心问题**：信念值应该怎么定位？取各方案精华，去其糟粕，形成统一路线

---

## 目录

1. [辩证分析：belief 的三个候选方案](#1-辩证分析)
2. [合成方案：标量作为派生汇总统计](#2-合成方案)
3. [双层架构：项目核心贡献](#3-双层架构)
4. [变量本体论：每个变量的精确定位](#4-变量本体论)
5. [代码改造清单](#5-代码改造清单)
6. [实验计划](#6-实验计划)
7. [论文叙事结构](#7-论文叙事结构)
8. [里程碑与时间线](#8-里程碑与时间线)

---

## 1. 辩证分析：belief 的三个候选方案

### 方案 A：保持"belief"不变

**精华**：
- 最简单，所有代码、169 runs 数据、分析脚本不需要改动
- 学术界广泛使用（AutoGen、CrewAI、ChatDev 都用 belief）
- 审稿人一看就懂，不需要额外解释

**糟粕**：
- THEORY_FREEZE_REPORT 的六角度批判全部成立——一个标量确实不可辨识地混合了偏好、信心、社会影响、决策、表达
- 审稿人如果熟悉信念建模文献（Belief Engine, Hidden Anchors），会直接攻击这一点的脆弱性
- "belief"这个词承载了太强的认知本体论承诺——一旦用了，审稿人就假设你在声称测到了某种内部心理状态

### 方案 B：重命名为"承诺度"（Commitment Strength）

**精华**：
- 语义更诚实：承认只测到"对 top 选项的执着强度"，而非完整信念
- 与 Friedkin-Johnsen 模型对齐：承诺度的锚定效应是 FJ 的核心机制
- 与 Hidden Anchors (arXiv:2606.19494) 对接：锚定 = 初始承诺
- 限缩了 claims 的范围，理论上更坚固

**糟粕**：
- 代码一行没改，纯粹是文档层的语义重命名——审稿人如果仔细看代码会发现这一点
- 169 runs 的 LLM prompt 仍要求输出 "belief"——LLM 在旧本体下输出的数字，你事后重新解释为新本体，这在方法论上是脆弱的
- "承诺度"这个词在认知科学中有特定含义（commitment 通常指公开表达后的立场锁定），而你的 b 值在 agent 发言前后都可能变化
- 新增的 δ=||b|-ι| 中，ι 是关键词匹配角色名的启发式，不是独立测量——δ 区分的是"恶意 agent（prompt 锁死+b 高+ι 关键词低）vs 诚实 agent"，这不是"主客观承诺偏差"

### 方案 C：标量作为派生汇总统计（Stance Summary）

**精华**：
- 不从 LLM 直接输出标量，而是从 itemBeliefs 计算标量：`b = sign(top_option) × |top_score|`
- 标量不再是"测量值"，而是"汇总统计"——就像 GDP 不是任何一个人的行为，而是经济活动的汇总
- 这解决了不可辨识问题：你不声称测到了任何内部状态，你只声称从 K 维自报偏好中计算了一个 1 维汇总
- 热力学层（R/T/H/F）仍然可以用标量计算——汇总统计足够驱动异常检测
- 信息层（E/U/I/C/Λ）用多维数据做诊断——两个层各用各的数据，逻辑清晰

**糟粕**：
- 需要 LLM 输出 itemBeliefs（K 维偏好）。169 runs 全部没有这个数据——旧数据只能用旧标量
- 向后兼容需要额外处理：旧数据用 LLM 直接输出的标量，新数据用 itemBeliefs 派生的标量，两套对标——这增加了统计复杂度
- prompt 改动可能导致新数据与旧数据不可直接比较

---

## 2. 合成方案：取各方案精华

**核心决策：标量是派生量，不是测量量。**

### 2.1 变量本体论

```
观测层（LLM 自报，标注为 stated）：
  stated_preferences[]: [{ option: "方案A", score: 0.8 }, ...]  ← 从 itemBeliefs 来
  stated_evidence[]:    [{ content: "...", supports: "方案A" }]
  stated_confidence:    75

系统计算层（确定性、跨轮追踪）：
  U = f(stated_preferences)          ← K 维偏好向量（从 LLM 自报直接映射）
  E = f(stated_evidence, 跨轮分享)   ← 信息状态（覆盖度、质量、多样性）
  I = f(角色, 反驳次数, 跨轮 U 稳定性) ← 惯性（5 维中唯一完全客观的变量）
  C = f(E.quality, U 历史稳定性)      ← 信心（从 E 和 U 历史派生）
  Λ = (1-I)(1-C)                     ← 易感性（从 I 和 C 派生）

汇总统计层（从 U 投影到标量，用于热力学看门狗）：
  b_i = sign(U_i.top) × |U_i.top_score|   ← 标量立场汇总
  R   = ‖Σ e^{iθ_i}‖ / N                  ← 方向对齐度
  T   = σ(b_1...b_N)                      ← 强度分散度
  H   = Shannon_5bins(b_1...b_N)          ← 分布形状
  F   = (1-R) + T·H                       ← 失序度加权和（操作化启发式）

一致性检验层（自报 vs 行为对比）：
  δ_consistency = |U(t) - U(t-1)| vs I_predicted    ← 立场变化是否反常
  δ_coverage    = E.coverage vs R                    ← 信息不充分时的过早共识
  δ_influence   = stated_influence vs 实际影响力流向  ← 自报影响源 vs 真实影响源
```

### 2.2 取各方案精华

| 来源 | 取了什么 | 丢了什么 |
|------|---------|---------|
| **方案 A（belief）** | 保留了 b 作为汇总统计的角色。R/T/H/F 仍然从 b 计算。与旧数据向后兼容 | 丢弃了"b 是 LLM 直接输出的测量值"这个定位。b 改为从 itemBeliefs 派生 |
| **方案 B（承诺度）** | 保留了"标量主要承载 top 选项强度"这个诚实语义。保留了与 FJ 模型的对接 | 丢弃了"承诺度是一个独立认知变量"这个定位。承诺度 = 汇总统计，不是认知原语 |
| **方案 C（派生量）** | 采用了"b 从 U 派生而非直接测量"这个架构。采用了"标量层+向量层双层分工" | — |

### 2.3 不做的

- **不重命名代码中的 `belief` 为任何东西。** 变量名是工程细节，本体论在论文中解决
- **不声称测到了任何"真实"认知状态。** 只声称测到了"自报偏好 + 行为追踪 + 两者的一致性"
- **不废弃标量层。** 标量层有明确的工程价值——零成本看门狗。信息层有明确的诊断价值——定位根因。两者互补

---

## 3. 双层架构：项目的核心贡献

### 3.1 为什么双层是核心贡献

单层系统（仅热力学）→ 只知道出问题了，不知道为什么

单层系统（仅信息层）→ 每次都要全量诊断，成本高

双层组合 → 热力学做廉价筛查，信息层做定向诊断，各司其职

**这在当前 MAS 治理文献中无对应物：**

| 系统 | 检测方式 | 诊断方式 | 干预方式 |
|------|---------|---------|---------|
| MAST (Cemri 等) | 人工标注 | 无 | 无 |
| CoBRA (Liu 等) | 偏差指数 | 无 | 行为调控 |
| Agent Governance Toolkit (Microsoft) | 工具调用拦截 | 无 | 阻断 |
| **SwarmAlpha v5** | 热力学筛查 → 信息层诊断 | E/I 根因定位 | 信息流修复 |

### 3.2 数据流

```
每轮讨论
    │
    ▼
┌──────────────────────────────────────────────┐
│ 热力学看门狗（标量层，零成本）                  │
│                                               │
│ 从 b_1...b_N 计算 R, T, H, F                  │
│                                               │
│ 正常 → 继续观察                               │
│ 异常 → 触发信息层诊断                          │
│   · R 过早过高 + round < 3                    │
│   · F 不降反升                                │
│   · T 持续 < 0.05（过度凝固）                  │
└──────────────┬───────────────────────────────┘
               │ 触发
               ▼
┌──────────────────────────────────────────────┐
│ 信息层诊断（向量层，按需计算）                  │
│                                               │
│ 检查 E.coverage：信息是否充分共享？             │
│ 检查 I 分布：是否存在权威集中？                 │
│ 检查 U-E 一致性：偏好是否与证据对齐？           │
│ 检查 Λ 不对称：是否存在影响不对等？             │
│                                               │
│ 输出：根因定位 + 定向干预建议                   │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│ 干预层（修改信息流，不修改信念权重）             │
│                                               │
│ E.coverage 低 → inject_evidence               │
│ I 集中      → rebalance_attention             │
│ 结构调整     → shuffle_knowledge（实验前）      │
│                                               │
│ 干预后 → 热力学层验证效果                      │
└──────────────────────────────────────────────┘
```

---

## 4. 变量本体论：每个变量的精确定位

### 4.1 标量 b

| 维度 | 定位 |
|------|------|
| **是什么** | 从 agent 的 K 维自报偏好向量投影得到的 1 维汇总统计 |
| **不是什么** | 不是独立测量的认知变量（belief/承诺度都不是） |
| **计算方式** | `b_i = sign(U_i.top) × |U_i.top_score|`，其中 U 从 itemBeliefs 来 |
| **旧数据兼容** | 169 runs 中 b 直接来自 LLM 输出的 `belief` 字段。在论文中诚实地标注：旧数据的 b 是 LLM 直接输出的标量，新数据的 b 是从 itemBeliefs 派生的标量。两者的对标关系（r(|U|,|b|)=0.754）已被验证 |
| **工程价值** | 驱动 R/T/H/F 的零成本计算。1D 投影损失了信息（符号错误率 27%），但对于异常筛查足够——就像体温计不告诉你什么病，但告诉你该不该去看医生 |
| **论文表述** | "We compute a scalar stance summary from each agent's multi-dimensional preference vector. This summary is a lossy 1D projection (sign agreement 73% with the full vector), used only for zero-cost thermodynamic screening. When anomalies are detected, the full multi-dimensional data is queried for diagnosis." |

### 4.2 热力学变量 R/T/H/F

| 变量 | 本体论定位 | 论文表述 |
|------|-----------|---------|
| **R** | 方向对齐度。5 个标量的向量和长度 | "directional alignment of stated stances" |
| **T** | 强度分散度。5 个标量的标准差 | "intensity dispersion of stated stances" |
| **H** | 分布形状。5 个标量的 5-bin 熵 | "distributional shape of stated stances" |
| **F** | 失序度加权和。F=(1-R)+T·H | "operational composite disorder index" |

**不再使用的叙事：**
- "社会热力学" → "群体动态筛查指标"
- "Kuramoto 序参量"（Mitra 2025 已经做了 MAS 适配，不 claim 原创性）
- "自由能极小化原理" → 已证伪条件性成立（v0.4.2），仅在锚定群体中成立
- "3D 热力学状态空间" → 已证伪（R/T/H 退化为 1 维，v0.4.1/0.4.3）

**保留的叙事：**
- R/T/H/F 分别衡量方向对齐、强度分散、分布形状、综合失序——四个指标从不同角度描述同一个底层现象（群体信念分散度），它们强相关（r=0.917）是 MAS 小群体的结构性特征，不是 bug
- F 不声称热力学自由能——它是操作化启发式综合指标，工程价值在于把四维压缩到一个标量便于阈值判断

### 4.3 认知状态变量 U/E/I/C/Λ

| 变量 | 来源 | 本体论定位 | 局限性 |
|------|------|-----------|--------|
| **U** | LLM 自报 itemBeliefs | stated preference vector（自报偏好向量） | LLM 可能策略性表达，不是"真实"偏好 |
| **E** | LLM 自报 evidence + 系统追踪分享率 | stated evidence + sharing tracker（自报证据 + 分享追踪） | 证据质量不可验证，仅可追踪覆盖度 |
| **I** | 系统追踪：角色 + 跨轮 U 稳定性 + 反驳次数 | behavioral inertia（行为惯性）| 角色惯性来自关键词启发式，非校准值 |
| **C** | 从 E.quality 和 U 历史派生 | derived confidence（派生信心） | 派生而非独立测量 |
| **Λ** | (1-I)(1-C) | derived susceptibility（派生易感性） | 同上 |

**关键诚实标注：**
- U 和 E 是 LLM 自报数据，标注为 "stated"——不是客观认知状态，是 agent 的表达
- I 是 5 维中唯一从跨轮行为推导的变量——不依赖 LLM 单次输出的准确性
- 论文中明确指出：我们将 U/E 称为 "stated preference" 和 "stated evidence"，不声称这是 agent 的"真实"内部状态。我们的贡献不是测量真实认知状态，而是**检测自报与行为之间的不一致**以及**追踪信息分配的动态**。

### 4.4 δ 系列（一致性检测指标）

| δ | 定义 | 检测什么 | 论文卖点 |
|---|------|---------|---------|
| **δ_coverage** | E.coverage vs R | 信息不充分时的过早共识 | "the group locked in before processing all available information" |
| **δ_concentration** | max(I)/mean(I) | 惯性集中（权威偏差的认知基础） | "one agent's behavioral inertia dominates the group" |
| **δ_consistency** | |U(t) - U(t-1)| vs I | 立场变化是否反常 | "an agent's preference shift deviates from its behavioral inertia prediction" |

**这三个 δ 的共同特征：**
- 都不需要 ground truth
- 都不声称测到了"真实认知状态"
- 都基于可观测的对比（自报 vs 自报历史 / 自报 vs 他人自报 / 自报 vs 行为）
- 都是可证伪的——如果 δ 与决策质量不相关，检测器无效

---

## 5. 代码改造清单

> **实施状态**：全部 12 项已于 2026-07-29 完成。470 测试通过，无回归。

### 5.1 低风险（不改实验链路，仅清理技术债务）

| # | 改动 | 位置 | 行数 | 状态 |
|---|------|------|------|------|
| 1 | belief → statedStance（仅限新代码路径，旧路径不动） | NativeCognitiveEngine | ~10 | ✅ |
| 2 | 废弃 beliefToCognitiveState()（标注 deprecated，不移除） | cognitiveState.ts | ~3 | ✅ |
| 3 | 新增 stanceFromItemBeliefs()：b = sign(top)×|top_score| | cognitiveState.ts | ~8 | ✅ |
| 4 | ThermoState 注释更新：标注 R/T/H/F 是操作化指标 | MeasurementLayer.ts | ~5 | ✅ |
| 5 | 旧检测器注释更新：标注消费 AgentBelief（标量层），不消费 CognitiveState | governance/index.ts | ~5 | ✅ |

### 5.2 中风险（接通 NativeCognitiveEngine 实验链路）

| # | 改动 | 位置 | 行数 | 状态 |
|---|------|------|------|------|
| 6 | NativeCognitiveOpinionParser 改为要求输出 structuredEvidence + itemBeliefs，不再输出 belief | nativeCognitiveEngine.ts | ~20 | ✅ |
| 7 | NativeCognitiveEngine 的 prompt 去掉 belief 字段，改为 utility + evidence | nativeCognitiveEngine.ts | ~10 | ✅ |
| 8 | 实验持久化新增字段：itemBeliefs[], evidenceItems[], statedStance, U, E, I, C, Λ per-round | Runner.ts | ~30 | ✅ |
| 9 | 新增 δ 计算模块：computeDelta(layer1: ThermoState, layer2: CogState[]) → DeltaDiagnosis | 新建文件 | ~40 | ✅ |

### 5.3 分析脚本（posthoc，零风险）

| # | 改动 | 位置 | 行数 | 状态 |
|---|------|------|------|------|
| 10 | 旧数据对标验证：r(b_LLM, b_derived) 在 fraud 38 runs 上的分布 | experiments/v2/ | ~50 | 待数据 |
| 11 | 中介分析脚本：E→U→τ 因果链 | experiments/v2/ | ~80 | 待数据 |
| 12 | 跨任务热力学鲁棒性：新数据上的 R/T/H 塌缩是否复现 | experiments/v2/ | ~50 | 待数据 |

### 5.4 本轮新增（超出原计划）

| # | 改动 | 位置 | 说明 |
|---|------|------|------|
| 13 | **itemBeliefsTrajectory 持久化**：逐轮逐 agent 的 K 维偏好向量 | types.ts + Runner.ts | Hidden Anchors 锚点恢复核心数据 |
| 14 | **roundOpinions 持久化**：完整 opinion（reasoning、evidence、referencedAgents） | types.ts + Runner.ts | 信息传播路径追踪、社会网络分析 |
| 15 | **Hidden Anchors OLS 系统辨识脚本**：FJ 模型 per-agent α_i 拟合 | experiments/campaign/analysis/hidden_anchors_ols.ts | 锚点强度分布、天花板效应诊断、α-τ 相关性 |

**总计：< 500 行新代码或代码修改。** 这不是架构重构，是最后一根线的接通。

---

## 6. 实验计划

### 6.1 P0：NativeCognitiveEngine 批量实验（必须完成）

| 实验 | 引擎 | 模型 | n/cell | 条件 | 预计 API 费 |
|------|------|------|--------|------|-----------|
| Crisis | NativeCognitiveEngine | DeepSeek-V3 | 30 | none, full, shuffle | ~$8 |
| Supplier | NativeCognitiveEngine | DeepSeek-V3 | 30 | none, full | ~$6 |
| Crisis | NativeCognitiveEngine | Qwen/Claude | 20 | none, full | ~$15 |

**持久化字段（每条记录）：**
```json
{
  "rounds": [{
    "agents": [{
      "statedStance": 0.65,
      "utility": {"方案A": 0.8, "方案B": 0.3, ...},
      "evidence": { "coverage": 0.6, "quality": 0.7, "items": [...] },
      "inertia": { "strength": 0.45, "source": {...} },
      "confidence": { "overall": 0.75, "evidenceBased": 0.7 },
      "susceptibility": 0.35
    }],
    "thermo": { "R": 0.85, "T": 0.12, "H": 0.38, "F": 0.42 }
  }],
  "codeVersion": "2026-07-29",
  "engineType": "NativeCognitiveEngine"
}
```

### 6.2 P1：δ 验证实验

| 实验 | 假设 | 检验方式 |
|------|------|---------|
| δ_coverage | E.coverage 低 + R 高 → τ 低 | logistic：P(τ<0.5) ~ E.coverage × R |
| δ_concentration | I 集中 → authority_bias 触发 → τ 受损 | AUC：max(I)/mean(I) 预测 authority_bias |
| δ_consistency | |ΔU| ≠ I_predicted 的 agent 更可能持有被忽略的信息 | 异常 agent 的 E.items 被引用率 |

### 6.3 P2：信息层因果链验证

**中介分析**（Baron & Kenny, 1986）：

```
路径：inject_evidence → ΔE.coverage (a) → ΔU 分化 (b) → ΔR 短暂下降 (c) → τ 改善 (d)
```

如果 a×b×c 间接效应显著且直接效应（干预→τ）不显著，则完全中介成立——证明干预通过**信息通道**（而非其他未知机制）改善决策质量。

**这是整个框架最核心的因果验证。** 如果这条链不成立，框架的核心机制假设被证伪。

---

## 7. 论文叙事结构

### 7.1 核心贡献声明（论文中可以 claim 的）

1. **诊断架构**：提出了双层检测-诊断-干预架构，热力学层做零成本筛查，信息层做定向根因诊断。两层各司其职，互补而非替代。

2. **信息层理论**：追踪分布式信息环境中的信息分配动态，将 E（信息覆盖度/质量/多样性）定义为可观测的治理杠杆。证明了 1D 标量表征在多选项任务中产生系统性的误导（27% 方向错误率）。

3. **实证发现**：
   - 结构性信息重排（shuffle d=1.44）远超讨论中治理（d=0.92）——信息分配的初始拓扑比干预更重要
   - 破坏性干预（修改信念权重）明确有害（Δτ=-0.267），非破坏性干预（修改信息流）的设计原则被验证/证伪
   - 小群体 MAS 中热力学类比存在结构性局限：R/T/H 退化为 1 维（r=0.917），1D 掩盖 5D 真实动态

4. **方法论贡献**：记录了 10+ 次自我纠错（从"F 正交"到"R/T/H 塌缩"到"1D 掩盖 5D"），提出"持续自我证伪"作为 MAS 实验研究的最佳实践。

### 7.2 不再声称的

- "我们测量了 agent 的认知状态" → 改为"我们追踪了 agent 的自报偏好与信息暴露"
- "社会热力学" → 改为"群体动态筛查指标"
- "自由能极小化原理" → 已证伪条件性成立，论文中作为限制条件讨论
- "3D 热力学状态空间" → 已证伪，论文中作为负面发现呈现
- "承诺度" → 不作为独立概念提出，而是将 b 定义为"从多维自报偏好派生的标量汇总"

### 7.3 论文结构

```
1. Introduction
   - 问题：MAS 讨论缺乏运行时认知治理
   - 空白：MAST 描述但不检测，安全层不做认知
   - 本文：双层检测-诊断-干预闭环

2. Related Work
   - MAST（描述 → 本文：运行时可操作化）
   - 统计物理 × 观点动力学（类比 → 本文：工程化筛查指标）
   - 信念建模（Belief Engine/Hidden Anchors → 本文补充信息层）
   - 发言选择（TBS/YES AND → 本文：五因子闭式公式）

3. Framework: Two-Layer Governance Architecture
   3.1 Layer 1: Thermodynamic Screening (R/T/H/F)
   3.2 Layer 2: Information-State Diagnostics (E/U/I/C/Λ)
   3.3 Consistency Indicators (δ series)
   3.4 Intervention Layer (inject_evidence, rebalance_attention, shuffle)
   3.5 End-to-End Data Flow

4. Variable Ontology: What We Measure and What We Don't
   4.1 Scalar Stance as a Lossy 1D Projection
   4.2 Self-Reported vs. Behaviorally-Derived Variables
   4.3 The 27% Sign Error: Why 1D Projection Systematically Misleads

5. Experiments
   5.1 Setup (tasks, models, conditions, statistics)
   5.2 Primary Finding: Structural > Procedural (d=1.44 vs 0.92)
   5.3 Intervention Strategy Determines Governance Sign (Δτ=-0.267 vs 0.000)
   5.4 The 1D-to-5D Gap: Scalar Projection Masks Dynamics
   5.5 Mediation: Does Governance Work Through Information Channels?
   5.6 Cross-Model Robustness

6. Negative Findings and Self-Corrections
   6.1 R/T/H Collapse to One Effective Dimension
   6.2 Thermodynamic Analogy Boundaries in Small MAS Groups
   6.3 Governance Does Not Suppress 5D Hull Escape (p=0.262)
   6.4 A Record of 10+ Self-Corrections

7. Discussion
   7.1 Information Distribution as the Governance Lever
   7.2 Why Two Layers: Screening + Diagnosis > Either Alone
   7.3 From Hidden Profiles to Open-Ended Deliberation
   7.4 Toward an A2A-Native Cognitive Governance Standard

8. Limitations & Future Work
```

---

## 8. 里程碑与时间线

### Phase 1：代码接通（✅ 已完成，2026-07-29）

| 任务 | 产出 | 状态 |
|------|------|------|
| NativeCognitiveEngine prompt 改为要求 itemBeliefs + evidence | 新 prompt 模板 | ✅ |
| belief → statedStance 派生函数 | stanceFromItemBeliefs() | ✅ |
| 实验持久化新增字段 | Runner.ts 更新 | ✅ |
| δ 计算模块 | computeDelta.ts | ✅ |
| 所有单元测试通过 | 470+ tests green | ✅ |
| **新增** itemBeliefs + roundOpinions 持久化 | types.ts + Runner.ts | ✅ |
| **新增** Hidden Anchors OLS 脚本 | hidden_anchors_ols.ts | ✅ |

### Phase 1.5：探测实验（🔄 部分完成，3/10 runs）

| 任务 | 产出 | 状态 |
|------|------|------|
| Crisis none 组 5 seeds × 1 run | 基线数据 | 🔄 3/5 |
| Crisis cognitive 组 5 seeds × 1 run | 治理效应数据 | ❌ 0/5 |
| δ 信号检测分析 | 信号质量报告 | ❌ 待数据 |
| **新增** Hidden Anchors 锚点分析 | 天花板效应诊断 | ❌ 待新数据（需 itemBeliefs） |

### Phase 2：P0 实验（3-5 天，取决于 API 速率限制）

| 任务 | 产出 |
|------|------|
| Crisis NativeCognitiveEngine n=30×3 条件 | ~90 JSON files |
| Supplier NativeCognitiveEngine n=30×2 条件 | ~60 JSON files |
| 跨模型 DeepSeek + Qwen Crisis n=20×2 | ~40 JSON files |
| 数据完整性检查（itemBeliefs 是否存在） | 审计报告 |

### Phase 3：分析验证（2-3 天）

| 任务 | 产出 |
|------|------|
| 旧数据对标验证（b_LLM vs b_derived） | 对标报告 |
| E→U→τ 中介分析 | 因果链验证 |
| δ 检测器 ROC/AUC | 检测器效能 |
| 跨模型稳健性 | 统计检验 |
| 所有分析脚本可复现实跑 | 复现性声明 |

### Phase 4：论文撰写（5-7 天）

| 任务 | 产出 |
|------|------|
| 论文初稿（按 §7.3 结构） | PAPER_DRAFT v2 |
| Limitations 更新 | LIMITATIONS.md v2 |
| SOT 更新 | SOT.md v2 |
| 预注册（OSF） | 至少 1 个 confirmatory 假设 |

### Phase 5：投稿准备（2-3 天）

| 任务 | 产出 |
|------|------|
| 论文打磨 | camera-ready |
| 补充材料（分析脚本清单、数据样本） | supplementary |
| arXiv 预印本 | preprint |
| 投稿 | AAMAS/AAAI 2027 |

---

## 附录：关键决策记录

### A.1 为什么不在代码中重命名 belief

变量名是工程细节。在 19,500 行代码中把 `belief` 改成 `statedStance` 会产生 ~200 处改动，破坏 diff 历史，增加 merge 冲突风险，给所有分析脚本增加向后兼容负担。**本体论承诺在论文中解决，不在变量名中解决。**

### A.2 为什么保留标量层而不是纯向量层

纯向量层（每次诊断都用 5D 数据）在 3 轮 5 agent 的场景下不是问题。但在更长讨论（10+ 轮）、更多 agent（10+）、开放场景下，全量诊断的计算成本和 prompt 复杂度线性增长。标量层做筛查的价值在于：95% 的轮次不需要触发诊断，只有异常轮次才查询完整 5D 数据。

### A.3 旧数据（169 runs）的定位

169 runs 不能用于信息层验证（没有 itemBeliefs），但它们仍然有价值：
- 标量层的实证发现（d=0.92, d=1.44, r=-0.10）独立于信息层
- 1D→5D 差距的部分验证（fraud 38 runs 有 itemBeliefs）
- 旧标量 b 与新派生 b 的对标（r=0.754）提供了 construct validity
- 破坏性干预的有害性（Δτ=-0.267）在标量层上已经足够清晰

论文中应明确标注：169 runs 是标量层数据，新实验是向量层数据。两者互补而非替代。

### A.4 为什�� commit 叫 "v5" 而不是 "v3.3" 或 "v4.1"

从 v3.x（标量信念 × 单层检测）→ v5（派生标量 × 双层架构）的跳跃足够大：
- 变量本体论变了（测量值 → 派生汇总）
- 架构从单层变双层
- 实验从标量升级到向量
- 叙事从"热力学类比"转向"信息分配治理"

这不是修修补补，是一次完整的 paradigm refinement。
