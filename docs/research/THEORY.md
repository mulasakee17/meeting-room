# 理论分析（Theory）

本文档为 SwarmAlpha 的终止判定、认知状态建模与治理干预提供形式化分析。

> **状态**：v0.4（2026-07-28）。理论框架从 DeGroot 升级为 Friedkin-Johnsen（FJ），belief 本体重定义为"承诺度"（Commitment Strength）。所有数字以 [SOT.md](../SOT.md) 为准。命题分为已严格证明（Proposition）与经验猜想（Conjecture）两类。引用代码事实以现场实现为准。

> **FJ 模型的适用层级说明（v0.4.3 补丁）**：
> - FJ `b(t+1)=α·b_group+(1-α)·b(0)` 是**解释性镜头**，不是 v6 代码实现目标。
> - v6 的 `native_cognitive` 模式中，**Utility 由 LLM 原生输出**，系统不施加 FJ 公式。
>   FJ 的价值在于解释 agent 偏演化的锚定行为（§7.5 的 posthoc 近似），而非作为代码更新规则。
> - 旧 `DiscussionEngine`（[src/lib/discussion/index.ts:806](../../src/lib/discussion/index.ts#L806)）的 `InferenceLayer`
>   实现的是**成对扰动 DeGroot**（`b(t+1)=b(t)+Σw·Δ`），保留用于向后兼容。
> - 严格 FJ 仅在 `asyncEngine.ts` 路径中讨论（§7.1-§7.5），**不适用于 v6 sync 实验路径**。
> - **结论**：v6 实验不依赖 FJ 公式，FJ 仅作为理论分析框架。代码实现路径见 §11。

---

## 0. v0.3 → v0.4 变更摘要

| 维度 | v0.3（DeGroot + 热力学） | v0.4（FJ + 承诺度） | 变更理由 |
|---|---|---|---|
| belief 本体 | "整体立场"（语义不可辨识） | "对 top 选项的承诺度" | §5 不可辨识问题的语义重解释 |
| 更新规则 | DeGroot `b(t+1)=b(t)+0.15·Σw(b_j-b_i)` | FJ `b(t+1)=α·b_group+(1-α)·b(0)` | 前沿 FJ 更适合 LLM（Hidden Anchors, Belief Engine） |
| R/T/H 叙事 | "3 维热力学状态空间" | "承诺失序度的 3 个同源投影" | r=0.9175 证伪正交（SOT §5.3） |
| F 定位 | "社会自由能"（已降级为启发式） | "承诺失序度加权和"（不再声称热力学类比） | F≈2.014·(1-R) 证伪（SOT §5.3） |
| 新变量 | 无 | 主客观承诺偏差 δ=\|b-ι\| | 解释 force_reflection 反向强化 |
| 已严格证明命题 | 1a/1b/1c/4/4' | **保留**（FJ 是 DeGroot 推广，命题仍成立） | 数学独立性 |
| 5 维认知状态 | "待 Phase 3 验证" | "169 runs 无 itemBeliefs，向量层为未来工作" | 子代理审计证实数据缺失 |

**诚实标注（v0.4.3 更新）**：
- 169 sync runs 仍只有标量 belief（v6 NativeCognitiveEngine 路径才有 5 维认知状态输出）
- **旧 asyncEngine 路径**的 R/T/H（基于 scalar beliefs）仍强耦合——此路径已 `@deprecated`，仅 fraud 系列向后兼容
- **新 MeasurementLayer 路径**的 R/T/H（基于认知状态向量）已重写，F=U-T·S 三变量解耦（r=0.274，见 §0.1 验证 3）
- 5 维认知状态待 v6 全量实验验证（E1-E9 待跑，Pilot A/B 已验证 Δτ=+0.215）

### 0.1 社会热力学深化验证（2026-07-28，v0.4.1）

**脚本**：`experiments/v2/analyze_social_thermodynamics.ts`
**数据**：207 runs（169 sync + 38 async enriched），870 round-observations

#### 验证 1：Haken 协同学伺服原理——部分支持

**假设**：R 是序参量，在 R→1 时 T/H 的方差应塌缩（伺服原理）。

**实测**：
- r(R, T) = -0.960（强负相关，伺服关系成立）
- r(R, H) = -0.632（中等负相关，伺服关系部分成立）
- 但 **Var(T) 和 Var(H) 不塌缩**，反而在高 R 时增大：
  - R∈[0,0.2): Var(T)=0.0000, Var(H)=0.0601
  - R∈[0.8,1.0]: Var(T)=0.0238, Var(H)=0.3409

**裁决**：**部分支持**。R 伺服 T/H 的均值（mean-slaving 成立），但不伺服方差（variance-slaving 失败）。协同学伺服原理在 LLM agent 群体中部分成立——R 确实是序参量，但伺服不完整。

#### 验证 2：相变临界涨落——不支持

**假设**：治理触发阈值（R≈0.7-0.8）附近 σ²(b) 应异常增大（临界涨落）。

**实测**：
- σ²(b) 随 R 单调递减，**无峰值**在 R=0.7-0.8
- 所有 ablation（none/full/shuffle/full_fixed）均无临界涨落特征
- 治理不改变 σ²(b) vs R 的关系形状

**裁决**：**不支持**。LLM agent 群体未表现出相变临界涨落——治理触发不是真正的相变临界点，可能只是工程阈值。force_reflection 反向强化**不能用临界反常解释**。

#### 验证 3：修正自由能解耦——支持

**假设**：修正 F = U - T·S 中，U=L1 范数（总能量），T=时序波动，S=分布熵，三者应比旧 R/T/H 更解耦。

**实测**：
- 新 r(U, T_temporal × S_spatial) = **-0.274**（弱相关）
- 旧 r((1-R), T·H) = **0.917**（强耦合，已证伪）
- 3×3 相关矩阵：所有 |r| < 0.3
- sync 数据上 r(U, T×S) = **-0.046**（p=0.39，不显著——**近正交**）

**裁决**：**支持**。修正自由能 F = U - T·S 真正解耦——三变量来自不同信息源（总能量/时序/分布），r 从 0.917 降到 0.274。**这修复了旧 F 公式的双重计数问题**。

#### 验证 4：自由能极小化——部分支持

**假设**：F = U - T·S 应随轮次递减（自由能极小化原理）。

**实测**：
- sync runs: r(round, F) = **-0.238**（p=0.0001，F 递减）✅
- 治理加速极小化：sync-full r = -0.294 vs sync-none r = -0.146
- 但 async runs 因轮次延伸到 4-6 轮且 F 反弹，混合后 r=+0.236

**裁决**：**部分支持**。sync runs（3 轮）显示 F 递减且治理加速；async runs 因更长讨论导致 F 反弹（可能是过讨论引发的热耗散）。

#### 综合理论含义

| 验证 | 结果 | 理论含义 |
|---|---|---|
| 伺服原理 | 部分支持 | R 是序参量，但伺服不完整——LLM agent 有"部分自主性" |
| 临界涨落 | 不支持 | 治理触发不是相变临界点，force_reflection 反向强化需其他解释 |
| 自由能解耦 | 支持 | F = U - T·S 修复了双重计数，三变量近正交 |
| 自由能极小化 | 部分支持 | sync runs 支持且治理加速；async runs 因长讨论反弹 |

**对项目核心贡献的影响**：

1. **修正自由能 F = U - T·S** 是真正的理论贡献——修复了旧 F 公式的双重计数问题，r 从 0.917 降到 0.274。这是社会热力学在 LLM agent 群体中的**首次实证验证**。

2. **协同学伺服原理部分成立**——R 确实伺服 T/H 的均值，但方差不塌缩。这揭示了 LLM agent 群体的"部分自主性"：在均值层被序参量伺服，但在方差层保留自主性。

3. **相变临界涨落不成立**——这是诚实负面发现。治理触发不是真正的相变，force_reflection 反向强化需要其他机制解释（可能是 LLM 信念固着特性）。

4. **自由能极小化**在 sync runs 成立——F 随轮次递减，治理加速极小化。但 async runs 的 F 反弹提示"过讨论"可能引发热耗散。

#### 0.2 跨任务稳健性验证 + carry-forward 偏差检查（2026-07-28，v0.4.2）

**脚本**：`experiments/v2/analyze_f_free_energy_robustness.ts`
**数据**：fraud 38 async enriched runs

##### carry-forward 偏差量化

async 引擎每轮只有 1-5 人发言，用 carry-forward 重建 n=5 向量。

| 指标 | 值 |
|---|---|
| carry-forward 转换占比 | 62.08%（1007/1622） |
| T 压低程度 | 61.4%（T_all=0.044 vs T_speaking=0.113） |
| r(U, T×S) 变化 | 仅 0.016（-0.256 → -0.271） |

**裁决**：偏差在 T 层面显著，但对 r(U, T×S) 影响可忽略——因为 Pearson 相关对均匀单调缩放不变。

##### F 解耦跨任务对比

| 指标 | Sync (169) | Fraud (38, corrected) | 旧 r((1-R), T·H) |
|---|---|---|---|
| r(U, T×S) | -0.046 | -0.271 | — |
| r(U, T) | 0.025 | -0.086 | — |
| r(U, S) | -0.119 | **-0.793** | — |
| r(T, S) | 0.018 | 0.110 | — |
| 旧 r((1-R), T·H) | 0.884 | 0.869 | 双重计数确认 |

**裁决**：
- ✅ r(U, T×S) 跨任务都 < 0.3——解耦稳健
- ✅ 旧双重计数在 fraud 上也成立（0.869）——修正必要
- ⚠️ fraud 上 U-S 强耦合（-0.793）——解耦主要靠 T 的独立性，比 sync 脆弱

##### F 极小化的子集分解

| 子集 | r(round, F) | n | 状态 |
|---|---|---|---|
| sync 全部 | -0.238 | 169 | ✅ 成立 |
| fraud 恶意 | -0.359 | 26 | ✅ 成立 |
| fraud 非恶意 | **+0.423** | 12 | ❌ 失败 |
| fraud 全部 | -0.059 | 38 | ⚠️ 弱负 |

**关键发现**：F 极小化**不是普适规律**——
- 在"锚定群体"（sync + fraud 恶意）成立：agents 被锚定 → 群体收敛 → F 下降
- 在"自由探索群体"（fraud 非恶意）失败：agents 自由探索 → 信念分散 → F 上升

**理论含义**：自由能极小化原理在 LLM agent 群体中是**条件性成立**——需要 agent 存在"锚定"（无论是角色约束还是 prompt 指令）。自由讨论的群体不满足极小化。

##### 恶意 agent 对 F 的影响

| 指标 | 含恶意 | 去除恶意 | Δ |
|---|---|---|---|
| r(U, T×S) | -0.271 | -0.197 | 0.074（符号稳定） |
| r(round, F) | -0.059 | +0.006 | 0.065（符号反转但接近 0） |

**裁决**：恶意 agent 不影响 F 解耦结论（Δ 小，符号稳定）。

#### 0.3 关键验证：F 真实性 + 协同学伪发现剔除（2026-07-28，v0.4.3）

**脚本**：`experiments/v2/analyze_f_critical_verification.ts`

##### 验证 1：T 独立性（F 解耦是否真实）

**fraud 38 runs 上 3×3 相关矩阵（T_corrected, speaking-only, 无 carry-forward 偏差）**：

| | U | T_corrected | S_spatial |
|---|---|---|---|
| U | 1.000 | **-0.086** (n.s.) | -0.793 |
| T_corrected | -0.086 | 1.000 | **0.110** (p=0.048) |
| S_spatial | -0.793 | 0.110 | 1.000 |

- r(U, T) = -0.086（不显著，T 独立于 U）
- r(T, S) = 0.110（弱相关，T 基本独立于 S）
- **偏相关 r(U, S | T) = -0.791**（控制 T 后 U-S 仍强耦合）

**裁决**：**T 真正独立**——F=U-TS 解耦是真实的。T 提供了 U 和 S 之外的信息。但 U-S 强耦合（r=-0.793）在控制 T 后仍存在——这是 fraud 任务特性（agents 都极端时 U 高 S 低），不是 F 定义缺陷。

##### 验证 2：r(R,T) 是定义性耦合——协同学伺服是伪发现

**10000 次随机信念向量（n=5）的 r(R,T) 测试**：

| 分布 | mean(R) | mean(T) | r(R,T) |
|---|---|---|---|
| Uniform(-1,1) | 0.711 | 0.555 | **-0.983** |
| Normal(0,0.5) clamped | 0.796 | 0.455 | **-0.985** |
| Beta(2,5) shifted | 0.904 | 0.301 | **-0.982** |
| **实测数据（207 runs）** | — | — | **-0.960** |

**关键发现**：r(R,T) 在**所有随机分布**上都 ≈ -0.98，甚至略强于实测的 -0.96。

**裁决**：**r(R,T) = -0.96 是定义性耦合**——R（Kuramoto 序参量）和 T（标准差）都是同一信念向量的分散度函数，数学上必然强相关。

**§0.1 验证 1 的"协同学伺服原理部分支持"是伪发现，必须撤回**。r(R,T)=-0.96 不是 Haken 伺服原理的实证支持，而是 R 和 T 计算方式的数学必然。任何信念向量（随机的或真实的）都会产生这个相关性。

##### 验证 3：scalar 投影的符号问题

**fraud 38 runs 上 U_signed_max vs b 的符号分析**（n=805）：

| 指标 | 值 |
|---|---|
| r(\|U\|, \|b\|) 绝对值 | 0.754 |
| r(U_signed, b) 带符号 | 0.414 |
| 符号一致率 | **73.3%** (590/805) |
| 符号不一致时 mean\|U\| | 0.800（非零，非模糊） |
| 符号一致时 mean\|U\| | 0.885 |
| \|U\|>0.5 时 r(U_signed, b) | 0.412（无改善） |

**裁决**：LLM 投影**强度比方向好**——|r|=0.75 vs 0.41。73% 符号一致高于随机（50%），但不强。符号不一致不是因为 U 接近 0（模糊），而是 LLM 在方向上确实有噪声。

**"承诺度"应修正为"执着强度"**（无方向）——LLM 的 scalar belief 主要承载 top 选项的强度，不是有方向的承诺。

##### 验证 4：与 Belief Engine 前沿对比

| 维度 | Belief Engine | 我们 | 差距 |
|---|---|---|---|
| belief 本体 | log-odds evidential state | scalar（执着强度） | 他们更严谨 |
| stance 投影 | 定义性映射（stance = f(state)） | LLM 自由填写的标量 | 他们是确定性 |
| 更新规则 | log-odds + evidence uptake + anchoring | DeGroot/FJ + α | 他们基于证据 |
| 可审计性 | evidence-level update trail | 无（只有最终 belief） | 他们可追溯 |
| 验证方法 | human replay (DEBATE dataset) | 无 held-out | 他们有人类数据 |
| R²/效应量 | 未明确报告 RMSE baseline | r(U,T×S)=0.274 | 不可直接比 |

**诚实差距**：Belief Engine 是**定义性投影**（stance 是 evidential state 的确定函数），我们是**LLM 自由填写的弱相关**（r=0.41 带符号）。他们的方法在理论上更严谨，我们有实证数据但理论基础弱。

##### 综合裁决：修正后的正面发现清单

| 发现 | 真伪 | 状态 |
|---|---|---|
| **F=U-TS 解耦** | ✅ 真实 | r(U,T)=-0.086, r(T,S)=0.110——T 真正独立 |
| **F 极小化在锚定群体** | ✅ 真实 | sync -0.238, fraud 恶意 -0.359 |
| **scalar 是执着强度投影** | ✅ 真实 | r(\|U\|,\|b\|)=0.754，但**不是有方向的承诺** |
| ~~协同学伺服原理~~ | ❌ **伪发现** | r(R,T) 在随机数据上也是 -0.98，定义性耦合 |
| 凸包逃逸 | ⚠️ 脆弱 | 1D 简化 + 小样本，需多维验证 |
| 部分锚定 | ⚠️ 部分 | σ²(b) 差异真实，但 r(U,b) 可能是定义性的 |

#### 0.4 多维凸包逃逸：推翻 1D 结论（2026-07-28，v0.4.4）

**脚本**：`experiments/v2/analyze_multidim_hull_escape.ts`
**数据**：fraud 38 async enriched runs，5D itemBeliefs 向量

##### 三种凸包检验的逃逸率

| 方法 | 恶意 runs | 非恶意 runs | 恶意 agent | 诚实 agent |
|---|---|---|---|---|
| 1D 标量 | 10.2% | — | **0.0%** | 0.0% |
| 5D bounding box | 52.6% | — | 50.5% | 42.5% |
| **5D simplex（精确）** | **95.6%** | — | **94.8%** | **96.6%** |

**关键发现 1**：1D 标量严重**低估**逃逸率（10.2% vs 5D 95.6%）。1D 把 5 维投影到 1 维，大多数多维逃逸在投影后落入 1D 区间内。

**关键发现 2**：**1D 的"恶意 agent 0% 逃逸"完全是假象**——恶意 agent 在 5D 上逃逸率 94.8%，与诚实 agent 96.6% 几乎相同。之前的"恶意 agent 锚定不逃逸"结论是 1D 投影的副产品，必须撤回。

##### 随机基线检验

| 基线 | 5D simplex 逃逸率 |
|---|---|
| 实测数据 | **95.6%** |
| 时序打乱 | 89.5% |
| 边际保持 | 77.0% |
| Bootstrap（机会水平） | 73.8% |

**关键发现 3**：5D 凸包逃逸的基线本身很高（73-89%）——这是 5D 空间中 4-simplex 体积为零的数学性质。实测 95.6% 高于基线 6-22 个百分点，说明逃逸是真实现象，但**边际比预期小**。

##### 逃逸维度分析

5D bbox 逃逸（n=325）中各维度贡献：
- 线索5（媒体舆情监测）：48.6%（最易逃逸）
- 线索4（行业对标分析）：23.1%（最难逃逸）

##### Hidden Anchors 验证

- **100% 的 runs** 在最终轮至少有 1 个 agent 在初始 5D simplex 之外
- 平均 97.4% 的最终轮 agent 在初始 simplex 外
- 轨迹收敛到 conv{初始信念} 之外——支持 Hidden Anchors 预测（收敛到 conv{anchors}）

##### 修正后的诚实裁决

| 之前的发现 | 修正后 |
|---|---|
| 恶意 agent 0% 逃逸（1D） | ❌ **撤回**——5D 上恶意 94.8%，与诚实相同 |
| 凸包逃逸率 14-21%（1D） | ⚠️ **修正**——5D 上 95.6%，但基线也高（73-89%） |
| 治理抑制逃逸（1D） | ❌ **未在 5D 上验证**——需补做 |
| 部分锚定（scalar 冻结） | ✅ **仍成立**——恶意 agent 的 scalar b 确实冻结（σ²=0.003），但 5D 向量不冻结 |

**核心修正**：恶意 agent 的"锚定"**只在标量层**（scalar b 冻结），**不在向量层**（5D 向量自由移动）。这把"部分锚定现象"从"恶意 agent 不逃逸"重构为"恶意 agent 在标量层锚定但向量层自由"——更精确的刻画。

#### 0.5 5D 治理抑制逃逸：1D 结论不成立（2026-07-28，v0.4.5）

**脚本**：`experiments/v2/analyze_5d_governance_escape.ts`

##### 治理条件下的 5D 逃逸率

| 条件 | n runs | 5D simplex 逃逸率 | 95% CI | per-run |
|---|---|---|---|---|
| none（无治理） | 10 | **97.4%** (149/153) | [93.5%, 99.0%] | 100% |
| full（治理） | 28 | **95.1%** (442/465) | [92.7%, 96.7%] | 100% |

##### 统计检验

| 检验 | 值 | p 值 | 显著？ |
|---|---|---|---|
| Fisher exact | — | **0.262** | ❌ 不显著 |
| Chi-square (Yates) | χ²=0.99 | 0.681 | ❌ 不显著 |
| Odds ratio | 1.94 | CI [0.66, 5.70] | ❌ 含 1 |
| Relative risk | 1.025 | CI [0.991, 1.059] | ❌ 含 1 |

##### 随机基线对比

| 条件 | 实测 5D 逃逸 | 随机基线 | 实测 - 基线 |
|---|---|---|---|
| none | 97.4% | 75.2% | +22.2 pp |
| full | 95.1% | 78.5% | +16.6 pp |

**治理未使逃逸率降至基线以下**——full 的 95.1% 仍远高于随机基线 78.5%。

##### 与 1D 结论的对比

| 维度 | 1D 结论 | 5D 结论 |
|---|---|---|
| none 逃逸率 | 27.8% | 97.4% |
| full 逃逸率 | 8.4% | 95.1% |
| 差异 | 19.4 pp | **2.3 pp** |
| 显著性 | （未测） | p=0.262 ❌ |
| 结论 | 治理抑制逃逸 | **治理不抑制逃逸** |

##### 修正裁决

**1D 的"治理抑制逃逸（27.8%→8.4%）"结论必须撤回**——这是 1D 投影的假象。在 5D 精确检验下，治理与无治理的逃逸率都接近饱和（95-97%），差异仅 2.3 pp 且不显著（p=0.262）。

**根因**：5D 空间中 4-simplex 体积为零，任何轨迹都几乎必然逃逸——治理无法改变这一几何性质。1D 投影掩盖了真实逃逸，给人"治理有效"的错觉。

##### 对正面发现清单的影响

| 发现 | 之前状态 | 现状 |
|---|---|---|
| 治理抑制逃逸（1D） | ⚠️ 未在 5D 验证 | ❌ **撤回**——5D 上不成立 |
| Hidden Anchors 现象（5D） | ✅ 真实 | ✅ 仍成立——100% runs 最终轮逃逸 |
| 部分锚定（标量冻结+向量自由） | ✅ 新修正 | ✅ 仍成立——治理不改变此现象 |

**核心诚实修正**：治理对凸包逃逸**无显著影响**——这从 1D 的"治理有效"变为 5D 的"治理无效"。但这不是失败，是**更精确的边界条件**：治理改变信念值，但不改变轨迹的几何性质（逃逸是高维空间的必然）。

---

## 1. 符号与代码事实

| 符号 | 定义 | 代码位置 |
|---|---|---|
| `b_i ∈ [-1, 1]` | agent i 的**承诺度**（对 top 选项的执着强度） | `AgentOpinion.belief` |
| `b_i(0)` | agent i 的**初始承诺**（round 1 的 b_i） | 可从 JSON `rounds[0].beliefs` 重建 |
| `b_group(t)` | 轮 t 的加权群体承诺均值 | `asyncEngine.ts:494` (`avgSpeakerBelief`) |
| `α ∈ [0,1]` | **社会影响权重**（vs 承诺锚定 1-α） | 当前实现：`LEARNING_RATE=0.15`（DeGroot 特例） |
| `ι_i ∈ [0,1]` | agent i 的**客观承诺**（Inertia，从 role+evidence+refutation 算） | `cognitiveState.ts` |
| `δ_i = \|b_i - ι_i\|` | **主客观承诺偏差**（新变量，169 runs 可算） | 本文 §6 定义 |
| `θ_i = (π/2)·b_i` | 承诺度 → 相位角映射（H4 修复后） | `asyncEngine.ts:736` |
| `R = ‖Σ e^{iθ_i}‖/N` | **承诺方向对齐度**（不再称"Kuramoto 序参量"） | `asyncEngine.ts:739` |
| `T = σ_population` | **承诺强度分散度**（归一化到 [0,1]） | `statsUtils.ts:100` |
| `H = Shannon_5bins(b)` | **承诺分布熵** | `statsUtils.ts:58` |
| `F = (1-R) + T·H` | **承诺失序度加权和**（非热力学自由能） | `statsUtils.ts:110` |

**关键映射选择**：`θ = (π/2)·b`，使 b∈[-1,1] 映射到 θ∈[-π/2,π/2]（半圆）。这是 H4 修复（commit 08b20fb）的核心，保留不变。

---

## 2. 项目定位与理论范围

SwarmAlpha 是一个 LLM 多智能体认知治理研究平台。v0.4 的理论框架基于：

1. **Friedkin-Johnsen（FJ）信念动力学**：agent 承诺度受社会影响与初始锚定共同决定
2. **承诺度本体**：scalar belief 重新解释为"对 top 选项的执着强度"
3. **主客观承诺偏差**：新可观测变量 δ=\|b-ι\|，用于解释干预失败

**理论分析的两个层次**：

1. **运行时承诺层**（R/T/H/F）：在标量承诺度上计算，作为终止判定与干预优先级排序的诊断信号。已工程化、已实证。
2. **认知状态空间层**（U/E/I/C/Λ）：五维隐状态空间，理论上比标量承诺度更具解释力。**当前 169 runs 无 itemBeliefs 数据**（子代理审计证实），向量层为未来工作。

**诚实声明**：v0.4 仍是标量层理论。承诺度的"承诺"语义是**语义重解释**，不改变数据本身——169 runs 的 `belief` 字段值不变，改变的是我们对它的理论理解。

---

## 3. 承诺度本体（Commitment Strength）

### 3.1 本体论重定义

v0.3 中 `belief ∈ [-1,1]` 被定义为"整体立场"，语义不可辨识（§5 列出 5 种混合语义）。v0.4 重新定义为**承诺度**：

> **承诺度** b_i ∈ [-1,1]：agent i 对当前 top 选项的执着强度。b→+1 表示强烈执着于当前 top，b→-1 表示强烈反对，b≈0 表示未承诺。

**为什么选择"承诺度"而非其他本体**：

| 候选本体 | 语义 | 169 runs 兼容 | 理论锚点 | 选择 |
|---|---|---|---|---|
| 态度强度 | 二分议题立场 | ❌ Crisis/Supplier 非二分 | Fishbein-Ajzen | 否 |
| **承诺度** | **对 top 选项执着** | **✅ 语义重解释** | **FJ + commitment theory** | **是** |
| 贝叶斯后验 | 主观概率 | ❌ LLM 非贝叶斯 | Bayesian | 否 |
| 效用向量 | per-option 偏好 | ❌ 169 runs 无 itemBeliefs | vNE-Morgenstern | 未来工作 |

**承诺度的理论依据**：
- **FJ 模型**（Friedkin-Johnsen 1990）：agent 信念 = α·社会影响 + (1-α)·初始锚定。"锚定"即"承诺"的动力学表达
- **Hidden Anchors**（arXiv:2606.19494）：LLM agent 存在 hidden anchor，把轨迹拉回初始信念——这正是"承诺"的体现
- **Belief Engine**（arXiv:2605.15343）：区分 belief（evidential state）与 stance（scalar readout）——我们的承诺度是 stance，ι（Inertia）是 evidential state 的客观投影

### 3.2 承诺度的局限（诚实标注）

1. **丢失非 top 选项信息**：scalar 承诺度只承载 top 选项执着。缓解：决策最终是选 top，承诺度驱动决策是合理简化
2. **LLM 自报的语义漂移**：不同任务中 LLM 对"承诺度"的理解可能漂移。这是标量层的固有局限，只能靠向量层（未来工作）根治
3. **承诺度 vs ι 的关系待验证**：δ=\|b-ι\| 是否真的预测干预效果，需 169 runs 重算验证（阶段 1 任务）

---

## 4. R/T/H/F 的数学推导与物理意义（承诺度重解释）

### 4.1 承诺方向对齐度 R

将承诺度映射到单位圆相位角：

$$
\phi_i = b_i \cdot \frac{\pi}{2} \quad \Rightarrow \quad \phi_i \in \left[-\frac{\pi}{2}, \frac{\pi}{2}\right]
$$

$$
R = \frac{1}{n}\left|\sum_{i=1}^{n} e^{i\phi_i}\right|
$$

**v0.4 重解释**：R 是 agent **承诺方向对齐度**。R→1 表示所有 agent 执着于同一方向；R→0 表示承诺方向分裂。

**不再使用"Kuramoto 序参量"叙事**：Mitra 2025（arXiv:2508.12314）已将 Kuramoto 适配到 MAS，我们不再 claim 这个类比的原创性。R 在本项目是"承诺方向的对齐度量"，数学形式与 Kuramoto 相同但物理叙事不同。

**命题 1a/1b/1c 仍成立**（附录 A）：FJ 是 DeGroot 的推广，R 的数学性质不依赖于更新规则。命题 1a（完美承诺→R=1）、1b（完美两极分化→R=0 充要条件）、1c（均匀分布极限→2/π）的证明保留。

### 4.2 承诺强度分散度 T 与承诺分布熵 H

**T**（`statsUtils.ts:100`）：承诺度的归一化标准差。T→0 表示所有 agent 承诺强度相同，T→1 表示强度差异极大。

**H**（`statsUtils.ts:58`）：承诺度的 5-bins Shannon 熵。H→0 表示全部集中于同一 bin，H→1 表示均匀分布。

### 4.3 承诺失序度加权和 F

$$
F = \underbrace{(1-R)}_{\text{承诺方向失序}} + \underbrace{T \cdot H}_{\text{承诺强度失序}}
$$

**v0.4 诚实定位**（与 [SOT.md §5.3](../SOT.md) 一致）：

> F = (1-R) + T·H 是一个**承诺失序度的加权和**，不是严格的热力学自由能。
>
> - 实测 r((1-R), T·H) = 0.9175（N=259, p<10⁻⁶），两分量**强耦合**
> - 回归显示 F ≈ 0.019 + 2.014·(1-R)（R²=0.955），F 几乎是 (1-R) 的线性变换
> - 根因：R/T/H 都派生自同一 `beliefs[]` 数组（`asyncEngine.ts:401-402`），是"承诺失序度"的不同投影
>
> **不再声称**："3 维热力学状态空间"、"F 两分量正交"、"社会自由能"。

**v0.4.3 修正自由能（F 解耦）**：

> 上述强耦合问题在 v0.4.3 代码层已修复（[MeasurementLayer.ts:240-251](../../src/lib/thermodynamics/MeasurementLayer.ts#L240-L251)）：
> - 旧 F = (1-R) + T·H 已替换为 **F = U - T·S**（修正自由能）
> - U = 平均效用强度（mean ‖u_i‖），独立于 R/T/H
> - S = H（证据多样性熵复用）
> - 三变量解耦后 r 降到 0.274（验证数据见 v0.4.1 分析脚本）
> - **F 不参与任何决策阈值**（TerminationDecider 和 δ 诊断都不读 F），仅用于诊断分析
>
> 注意：asyncEngine.ts 路径仍用旧 F（向后兼容），仅 MeasurementLayer（v6 路径）用新 F。
>
> **保留**：F 作为工程诊断指标，R/T/H 分别对终止判定有不同敏感度（命题 3）。

**F 的工程价值**：
1. 把三维度压缩到一个标量便于诊断
2. 分解项（方向 vs 强度失序）可指导干预类型选择（虽然映射存在盲区，§4.4）

### 4.4 F 分解驱动的干预优先级（保留，标注盲区）

| 干预类型 | 对应失序分量 | 作用机理 | 验证状态 |
|---|---|---|---|
| `force_reflection` | 强度·(1−方向失序) | 降噪干预 | 回测证伪原假设（p=0.041），已修正 |
| `reduce_weight` | T·H（强度失序） | 压制高噪 agent 权重 | 方向支持但不显著（p=0.100, d=+0.448） |
| `introduce_diversity` | R·(1−H) | R 高 H 低→疑似虚假承诺一致 | 映射存在根本盲区（§5） |
| `continue_discussion` | R·(1−H)·(1−F) | 有序+低F+早期→过早承诺 | 实验证伪（0% 有效率），已禁用 |

**盲区诚实标注**：R·(1−H) 无法区分"真承诺一致"与"虚假承诺一致"。这是承诺度标量层的固有局限（§5）。

---

## 5. 承诺度语义的残余不可辨识性

v0.3 的 §5 列出 belief 同时编码 5 种语义。v0.4 重定义为"承诺度"后，**部分缓解但未根治**：

| v0.3 语义角色 | v0.4 状态 | 残余问题 |
|---|---|---|
| 对选项的偏好 | → 承诺度（top 选项执着） | 丢失非 top 信息 |
| 信心/确定性 | → 由 ι（Inertia）独立承载 | ι 的稳定性待验证 |
| 社会影响结果 | → FJ 更新的 b(t) | 仍与承诺度混合 |
| 决策输出 | → argmax(itemBeliefs)，但 169 runs 无 itemBeliefs | 决策-承诺关系待向量层验证 |
| 公开立场表达 | → 仍是 b 本身 | 策略性偏离未建模（Phase 4） |

**残余不可辨识性**：给定 N 个 agent 的 {b(t), b(t+1)}，仍无法严格区分：
- 新证据进入（应改变 ι）
- 社会影响（FJ 的 α·b_group 项）
- 信心下降（应改变 ι）
- 策略性表达（b ≠ 真实承诺）

**缓解**：主客观承诺偏差 δ=\|b-ι\|（§6）提供部分可辨识性——ι 是从 role+evidence+refutation 客观计算的，b 是 LLM 自报的，两者的偏差可作为"策略性偏离"的代理指标。

---

## 6. 主客观承诺偏差 δ

### 6.1 定义

**尺度对齐声明**：b ∈ [-1,1]（承诺度，含方向），ι ∈ [0,1]（Inertia，抵抗改变的能力）。两者度量不同维度，不能直接相减。δ 定义为**承诺强度偏差**：

$$
\delta_i = \left| |b_i| - \iota_i \right|
$$

其中：
- `|b_i|`：agent i 的**主观承诺强度**（LLM 自报的执着程度的绝对值，丢弃方向信息）
- `ι_i`：agent i 的**客观承诺强度**（Inertia，从 role + evidence + refutation 客观计算，`cognitiveState.ts`）

**理论解释**：
- δ≈0：主客观承诺强度一致——agent 的执着程度与其客观状态匹配
- δ 大：主客观承诺强度不匹配——agent 自报的执着与其角色/证据基础不符

**四种偏差模式**：

| |b| | ι | δ | 含义 |
|---|---|---|---|---|
| 高 | 高 | 小 | 主客观一致（强承诺 + 强基础） |
| 高 | 低 | 大 | **过度自信**（强承诺 + 弱基础）——可能是 herding 或恶意 |
| 低 | 高 | 大 | **证据不足**（弱承诺 + 强基础）——可能缺关键信息 |
| 低 | 低 | 小 | 主客观一致（弱承诺 + 弱基础） |

### 6.2 δ 对干预失败的解释力

| 干预 | 作用对象 | δ 小的 agent | δ 大的 agent | 预测 |
|---|---|---|---|---|
| `force_reflection` | 强制反思 | ι 反应正常，b 修正 | **信念固着**：高 δ agent 反思反而加固 b | 反向强化（已实测） |
| `reduce_weight` | 改客观权重 W | ι 间接变化，b 跟随 | **b 不跟随**：主观承诺锚定 | 破坏性（已实测 Δτ=-0.267） |
| `inject_evidence` | 注入证据 | ι 通过 evidence 变化 | ι 变化但 b 需多轮才跟随 | 原则正确，3 轮不足（Δτ=0.000） |
| `rebalance_attention` | 调注意力 | ι 间接变化 | 同上 | 原则正确，3 轮不足 |

**核心洞察**：
- 破坏性干预（reduce_weight）改变客观状态，但**不改变主观承诺 b** → δ 大的 agent 无视客观权重变化 → Δτ 破坏
- 非破坏性干预（inject_evidence）通过改变 evidence 改变 ι，ι 再通过多轮 FJ 更新改变 b → 原则正确但 3 轮 evidence 积累不足

### 6.3 δ 的可计算性（169 runs）

| 数据 | 现状 | δ 可算性 |
|---|---|---|
| b（scalar belief） | ✅ 169 runs 全有 | ✅ |
| ι（Inertia） | ✅ 代码已实现（`cognitiveState.ts`） | ✅，但 ι 的 evidence 分量依赖 sourceReliability=0.5 恒定（局限） |

**结论**：δ 是 169 runs 可算的新变量。阶段 1 任务：计算 δ 与 intervention effectiveness 的相关性，验证上述解释力。

### 6.4 δ 的局限

1. **ι 的 evidence 分量依赖 sourceReliability=0.5 恒定**（`cognitiveState.ts:155`）——所有 agent 的 evidence quality 永远相同，ι 的判别力部分受限
2. **δ 是观察性变量，不是因果干预**——不能直接"修改 δ"，只能通过修改 ι 或 b 间接影响
3. **δ 的预测力未验证**——§6.2 的解释力是理论推断，需 169 runs 重算验证

---

## 7. 信念更新机制（v0.4 修正：双引擎作用域）

### 7.0 关键作用域声明（2026-07-28 子代理审计）

项目存在**两套引擎**，信念更新机制不同：

| 引擎 | 文件 | 信念更新 | 169 runs 使用？ | fraud 系列使用？ |
|---|---|---|---|---|
| **SYNC** (`DiscussionEngine`) | `index.ts:770` | `inferenceLayer.infer`（类型化影响） | ✅ data_crisis + data_supplier | ❌ |
| **ASYNC** (`AsyncDiscussionEngine`) | `asyncEngine.ts:462` | DeGroot（`LEARNING_RATE=0.15`） | ❌ | ✅ data_fraud |

**关键事实**：
1. **169 runs 的 JSON beliefs 是 LLM 原始输出**，不是引擎平均值（`run.ts:395-396` 存储 `o.belief`）
2. **SYNC 引擎不用 DeGroot**——它用 `inferenceLayer.infer` 的类型化影响更新
3. **FJ 框架只适用于 ASYNC 引擎**，对 169 sync runs 不适用
4. **δ=|b-ι| 对 169 runs 仍然有效**——b 是真实 LLM 输出，ι 是角色理论理想值

### 7.1 ASYNC 引擎：DeGroot → FJ 升级（仅适用于 fraud 系列）

**当前 DeGroot 公式**（`asyncEngine.ts:462`）：

$$
b_i(t+1) = b_i(t) + 0.15 \cdot \frac{\sum_j w_{ij}(b_j - b_i)}{\sum_j w_{ij}}
$$

**FJ 升级公式**：

$$
b_i(t+1) = \alpha \cdot b_{\text{group}}(t) + (1-\alpha) \cdot b_i(0)
$$

其中：
- `b_group(t)` = 加权群体承诺均值（`asyncEngine.ts:494` 的 `avgSpeakerBelief`）
- `b_i(0)` = agent i 的初始承诺（round 1 的 b_i）
- `α ∈ [0,1]` = **社会影响权重**（vs 承诺锚定 1-α）

**DeGroot 是 FJ 在 α=1 时的特例**。当前 `LEARNING_RATE=0.15` 对应 DeGroot 形式，FJ 升级需添加 `b_i(0)` 存储和 α 参数（代码成本 ~25 行，见 §11）。

### 7.2 SYNC 引擎：类型化影响更新（适用于 169 runs）

SYNC 引擎的 `updateBeliefs`（`index.ts:770`）调用 `inferenceLayer.infer`，计算**类型化影响 delta**：

$$
\Delta b_i = \sum_j (b_j - b_i) \cdot w_{ij}^{\text{type}} \cdot \text{COEFF}_{\text{type}}
$$

其中影响类型和系数（`constants.ts:76-100`）：

| 影响类型 | COEFF | 触发条件 |
|---|---|---|
| agreement | 0.4 | 信念方向一致 |
| disagreement | 0.2 | 信念方向相反 |
| reference | 0.5 | 显式引用 |
| persuasion | 0.6 | 高置信度说服 |

**额外**：若存在高置信度影响者（weight>0.5），应用 1.1× 放大。

**与 FJ 的关系**：类型化影响更新是 FJ 的**异质系数推广**——标准 FJ 用统一 α，这里用 type-specific COEFF。但关键区别：
1. **JSON 存的是 LLM 输出，不是引擎后状态**——引擎更新内部 state，但 JSON 记录 LLM 对该 state 的响应
2. **LLM 是黑箱**——它看到内部 state 后输出的 belief 可能不符合任何参数化模型

### 7.3 对 δ 分析的影响

**δ=|b-ι| 对 169 runs 的有效性**（保留）：
- b = LLM 原始输出（JSON 中的 `rounds[].beliefs[agentId]`）—— 真实承诺
- ι = 从 role + evidence 客观计算的 Inertia（`cognitiveState.ts`）—— 客观承诺
- δ 度量 LLM 偏离角色理性的程度

**H3-FJ 的状态**（降级）：
- ❌ 不适用于 169 sync runs（无标准 FJ 参数可反推）
- ⚠️ 可改为"行为 FJ 拟合"：把 LLM 当黑箱，拟合 `b(t+1) = α·mean(others) + (1-α)·b(0)`，但这是描述性而非机制性验证
- ✅ 适用于 fraud 系列 async runs（有真实 DeGroot 参数）

### 7.4 FJ 的理论优越性（仅 async 引擎）

| 维度 | DeGroot | FJ | 理由 |
|---|---|---|---|
| 凸包逃逸 | ❌ 数学上不可能 | ✅ (1-α)>0 时 agent 拉回 b(0) | Hidden Anchors 预测 |
| 收敛点 | 加权平均 c = Σπ_i·b_i(0)/Σπ_i | c' = α·c + (1-α)·mean(b(0)) | FJ 收敛点包含初始锚定 |
| LLM 适配性 | 假设贝叶斯理性 | 允许非理性锚定 | LLM 非贝叶斯 |
| 与 δ 对接 | 无锚定概念 | b(0) 是锚定，ι 是客观锚定 | δ 可解释 FJ 参数 |

### 7.5 FJ 的 posthoc 近似（仅适用于 fraud 系列 async runs）

**严格 FJ 需要 per-utterance 更新**，但 fraud 系列 async runs 未存 per-utterance 边权。posthoc 近似：
- 用 round-1 belief 作为 b(0) ✅（已存）
- 用最终 interactionGraph 权重作为 w_ij 近似 ⚠️（非 per-utterance）
- 反推 α：`α ≈ (b(t+1) - b(0)) / (b_group(t) - b(0))`

**近似局限**：
1. 权重时变性丢失（最终图 ≠ per-utterance 图）
2. α 反推是点估计，无置信区间
3. LLM 输出的 ε 扰动未建模

**结论**：posthoc FJ 是**探索性分析**，不是严格验证。严格验证需阶段 2 的 FJ 引擎重跑实验。**不适用于 169 sync runs**（sync 引擎不用 DeGroot/FJ）。

---

## 8. 理论命题（保留，更新物理意义）

### 8.1 已严格证明的命题（v0.3 保留，数学独立性成立）

**命题 1a**（完美承诺一致 → R=1）：所有 b_i 相同 → R=1。✅ **已严格证明**（附录 A.1）

**命题 1b**（完美两极分化 → R=0 的充要条件）：R=0 当且仅当 N 为偶数且完美对半分。✅ **已严格证明**（附录 A.2）

**命题 1c**（连续均匀分布极限 → 2/π）：θ 在 [-π/2,π/2] 均匀分布时 R→2/π≈0.637。✅ **已严格证明**（附录 A.3）

**命题 4**（reduce_weight 不改变不动点存在性）：✅ **已严格证明**（附录 B.1）

**命题 4'**（reduce_weight 改变不动点位置）：✅ **已严格证明**（附录 B.2）

### 8.2 经验猜想（v0.4 更新）

**命题 2**（R-H 互补性）：R 与 H 度量承诺失序的不同维度，定性互补。⚠️ **Conjecture**

**命题 3**（R=1 ≠ 强承诺）：R=1 只代表方向一致，不代表强度。✅ **已验证**

**命题 5**（force_reflection 不动点效应不确定）：⚠️ **Conjecture**，v0.4 原用 δ 解释，但阶段 1 验证显示 δ 预测力不足（H1-δ 被证伪）：
- 原假设：δ 大的 agent 信念固着 → 反向强化
- 阶段 1 结果：δ 与 τ 在干预组无相关（r=0.013, p=0.89）
- **修正**：命题 5 仍成立（force_reflection 确实反向强化，Δτ=-0.267 已实测），但**不能用 δ 解释**——需要其他机制（可能是 LLM 的信念固着特性，与 ι_role 无关）

**命题 6**（Lyapunov V 单调递减）：⚠️ **Conjecture**，需 ε=0 假设。FJ 下 (1-α)>0 时 V 可能非单调（agent 拉回 b(0)）。

**命题 7**（更多干预 = 更低 τ）：⚠️ **Conjecture**，经验相关 r=-0.55。v0.4 原用 δ 解释，但阶段 1 验证显示 δ 不预测干预效果（H1-δ 被证伪）：
- **修正**：r=-0.55 的负相关可能由 force_reflection 的 LLM 信念固着特性驱动（命题 5），而非 δ 驱动

### 8.3 命题状态总结

| 命题 | 状态 | v0.4 更新 |
|---|---|---|
| 1a/1b/1c | ✅ 严格证明 | 物理叙事改为"承诺方向"，数学不变 |
| 4/4' | ✅ 严格证明 | FJ 下不动点位置变化，存在性仍不变 |
| 2 | Conjecture | "R-H 互补"→"承诺失序多投影" |
| 3 | ✅ 已验证 | "承诺强度不敏感" |
| 5 | Conjecture | force_reflection 反向强化已实测，但 δ 解释被证伪 |
| 6 | Conjecture | FJ 下可能非单调 |
| 7 | Conjecture | r=-0.55 已实测，但 δ 解释被证伪 |

---

## 9. 治理映射原则（v0.4 更新）

### 9.1 核心约束（保留）

治理**绝不直接修改承诺度 b**。它只能修改：
- 影响权重 W（reduce_weight）
- Inertia ι（force_reflection）
- Evidence E（inject_evidence）
- 讨论结构（continue_discussion / shuffle）

### 9.2 δ 驱动的干预选择（新）

| 干预 | 作用对象 | 对 δ 的影响 | 理论预测 |
|---|---|---|---|
| `reduce_weight` | W | 不直接改 δ | δ 大的 agent 无视 W 变化 → 破坏性 |
| `force_reflection` | ι | ι 下降，δ 可能增大 | δ 大的 agent 信念固着 → 反向强化 |
| `inject_evidence` | E → ι | ι 通过 evidence 变化，δ 间接变化 | 原则正确，多轮才见效 |
| `rebalance_attention` | 注意力 → ι | 同上 | 同上 |
| `shuffle` | 讨论结构 | 间接改变 b_group | 改变信息流，不改 b 本身 |

**理论预测**：干预效果与 agent 群体的 δ 分布相关。高 δ 群体需要"改变 ι 从而改变 b"的干预（inject_evidence），而非"改变 W 期望 b 跟随"的干预（reduce_weight）。

---

## 10. 验证假设（v0.4 更新，阶段 1 已执行）

### 10.1 阶段 1 验证结果（169 sync runs + 38 async enriched, 2026-07-28）

**脚本**：
- `experiments/v2/analyze_delta_distribution.ts`（169 sync runs）
- `experiments/v2/analyze_fraud_delta_fj.ts`（38 async enriched runs）

**数据**：
- 169 sync runs × 3 rounds × 5 agents = 2533 样本（ι_role 近似）
- 38 async enriched runs（fraud 系列，ι_approx = 0.7·role + 0.1·expression）

#### 169 sync runs 结果（ι_role 近似，8/10 agent ι=0.40）

| 假设 | 预期 | 实测 | 状态 |
|---|---|---|---|
| H1-δ | δ 预测干预效果 | r=0.013, p=0.89 | ❌ **不支持** |
| H2-δ | 恶意 agent δ 更大 | 169 runs 无恶意 agent | ❌ **不可测** |
| H3-FJ | posthoc α 分布 | sync 无 FJ 参数 | ❌ **不适用** |
| H4-δ | δ 与决策质量相关 | r=0.094, p=0.22 | ❌ **不支持** |

**根因**：ι_role 对 8/10 agent 是常数 0.40，δ 差异完全来自 |b|，无新信息。

#### 38 async enriched runs 结果（ι_approx 含 expression）

| 假设 | 预期 | 实测 | 状态 |
|---|---|---|---|
| H2-δ | 恶意 agent δ 更大 | δ_malicious=0.580 vs δ_honest=0.222, **d=2.18, p<0.0001** | ✅ **强支持** |
| H3-FJ | α ∈ [0.5, 0.9] | **α_mean=0.80**, median=0.78, 44% 在 [0.5,0.9] | ✅ **支持** |
| H4-δ | δ 与决策质量相关 | r=0.262, p=0.11（正向，非预期负向） | ⚠️ **方向相反** |
| H4-vec | scalar belief 是 utility 向量投影 | r(|u|_max, |b|)=**0.754**, p<0.0001 | ✅ **强支持** |

#### 关键发现

**1. H2-δ 强支持（但机制不明）**：恶意 agent 的 δ 显著大于诚实 agent（d=2.18，极大效应量）
- 恶意 agent δ=0.580 ± 0.161，诚实 agent δ=0.222 ± 0.165
- δ 能有效区分恶意/诚实 agent——**这是项目最重要的发现之一**
- ⚠️ **但机制不明**（见 §6.5）：δ 可能只是 |b| 的变形，而非"主客观偏差"的度量

**2. H3-FJ 支持**：行为 FJ 拟合的 α 均值 0.80，符合预测
- 44% 的拟合 α 在 [0.5, 0.9] 区间
- 意义：LLM agent 的信念更新可被 FJ 近似描述（α=0.80 意味着 80% 社会影响 + 20% 初始锚定）

**3. H4-vec 强支持**：scalar belief 是 utility 向量的合理投影
- r(|u|_max, |scalar_belief|) = 0.754（强相关）
- 意义：169 runs 的 scalar belief 确实承载了 top 选项的承诺信息——**承诺度本体论得到实证支持**

**4. H4-δ 方向相反**：δ 与 τ 正相关（r=0.262），而非预测的负相关
- 可能解释：高 δ 群体包含恶意 agent（H2-δ 已证实），而恶意 agent 群体在治理下 τ 可能更高（治理有效）
- 或者：δ 高意味着 agent 信念强烈（高 |b|），这可能帮助群体更快达成强共识

**5. ι_role vs ι_approx 的关键差异**：
- ι_role（sync 169 runs）：8/10 agent 无区分度 → δ 无预测力
- ι_approx（async 38 runs）：含 expression 项 + 角色匹配更好（fraud 任务有"审计师/分析师/专家"）→ δ 强预测力
- **结论**：δ 框架的有效性**依赖 ι 的质量**——粗糙 ι_role 无效，含 expression 的 ι_approx 有效

### 10.2 观测模型 + 残差分析（2026-07-28，v0.4 修正）

**脚本**：`experiments/v2/analyze_epsilon_observation_model.ts` + `analyze_epsilon_5d_entropy_hull.ts`

#### ε = |b - α·U|：理论更清晰的残差

**动机**：δ = ||b| - ι| 把观测层（b）和状态层（ι）直接相减，理论含义模糊（§6.5 瑕疵 1）。改用**观测模型**：

$$b_i = \alpha \cdot U_i + \varepsilon_i$$

其中 U = U_signed_max（utility 向量中绝对值最大项，保留符号），α = 0.5042（最小二乘拟合），ε 是残差。

**ε 的理论含义**：belief 偏离 Utility 预测的程度——真正的"主客观偏差"。

#### ε vs δ 的检测力对比

| 指标 | ε（残差） | δ（旧，ι_role） | δ（旧，ι_approx） |
|---|---|---|---|
| 恶意检测 d | **1.39** | 1.75 | 2.18 |
| 与 \|b\| 的相关性 | 部分 | 高 | 中 |
| 理论清晰度 | ✅ 同层残差 | ❌ 跨层相减 | ❌ 跨层相减 |
| 依赖 ι 质量 | ❌ 不依赖 | ✅ 严重依赖 | ✅ 依赖 |

**关键发现**：ε 的检测力（d=1.39）**弱于** δ（d=2.18），但 ε 不依赖 ι 质量，且提供 |b| 之外的信息：
- 偏相关 r(ε, malicious | |b|) = **0.397, p<0.0001**——ε 在控制 |b| 后仍预测恶意
- **ε 捕获了"belief-utility 失配"**，不只是"信念极端性"

#### 5 维与 ε 的关系

| 维度 | r(ε, 维度) | p 值 | 状态 |
|---|---|---|---|
| ι | 0.066 | 0.059 | ⚠️ 弱正相关（方向相反） |
| c | — | — | ❌ c=0.325 恒定，无法计算 |
| Λ | -0.066 | 0.059 | ⚠️ 弱负相关 |

**结论**：5 维认知状态**不解释 ε**。ι 与 ε 只有弱趋势（p≈0.06），且方向与预测相反。这意味着：
- 5 维认知状态与 belief-utility 残差**基本正交**
- ι（惯性）不约束 agent 的"过度承诺"——高 ι 的 agent 同样可能 ε 大
- **5 维作为 ε 的解释框架失败**

#### 个体熵 vs 群体熵

| 指标 | r(指标, Δb) | p 值 | 预测力 |
|---|---|---|---|
| 个体熵 H_ind | -0.081 | 0.189 | ❌ 不显著 |
| 群体熵 H_group | **0.156** | **0.012** | ✅ 显著 |

**关键发现**：
- 个体熵（agent 自身 itemBeliefs 的分布）**不预测** opinion shift
- 群体熵（agent 间 belief 分布）**显著预测** opinion shift
- **群体的"失序"比个体的"不确定性"更强**——与 Disentangling (2509.06858) 的发现不同

**额外发现**：恶意 agent 的 H_ind **方差为 0**——所有恶意 agent 的 itemBeliefs 塌缩到同一分布。这是恶意 prompt 的副作用，本身可作为检测信号。

#### 凸包逃逸检验（Hidden Anchors 验证）

| 数据集 | 逃逸率 |
|---|---|
| sync 全部（169 runs） | **14.2%** |
| async 全部（38 runs） | **21.1%** |
| sync: none | 27.8% |
| sync: full+shuffle | 8.4% |
| async: 恶意 runs | 0.0% |
| async: 非恶意 runs | 66.7% |

**关键发现**：
1. **LLM agent 确实逃出初始凸包**（14-21%）——DeGroot 数学上不可能，这验证了 Hidden Anchors 预测
2. **治理抑制逃逸**：none 27.8% → full+shuffle 8.4%
3. **恶意 agent 零逃逸**（0%）vs 非恶意 66.7%——恶意 agent 把信念锚定在初始 hull 内，非恶意 agent 自然探索外部

**这是对 Hidden Anchors 的独立验证**，且揭示了一个新现象：**恶意 agent 表现出更强的"锚定"（0% 逃逸），而非"偏差"**。

### 10.3 恶意 agent 零逃逸机制（E 深挖，2026-07-28）

**脚本**：`experiments/v2/analyze_malicious_anchor_mechanism.ts` + prompt 逆向工程

#### 机制完全揭示：prompt 锚定，非引擎锁定

**恶意 prompt 指令**（`task_fraud_malicious.ts:259-283` 的 `buildMaliciousDirective`）：

```
1. 始终保持 confidence ≥ 85，无论证据如何
2. 主动引用其他 agent 的发言来强化你的论点
3. 如果有人质疑线索3，立即转移话题
4. 在 itemBeliefs 中将线索3 rank=1，其他线索 rank=4-5
5. 永不承认错误，即使证据矛盾
6. 如果讨论陷入僵局，主动提出"我们应该基于最直接的证据做决策"
```

**锚定来源**：纯 prompt（LLM 行为顺从），**非引擎代码**——grep `freeze|lock|anchor|malicious` 在 `src/lib/discussion/` 零匹配。引擎对所有 agent 一视同仁。

#### 双层锚定结构

| 层 | 恶意 agent 表现 | 诚实 agent 表现 | Cohen's d | p |
|---|---|---|---|---|
| **标量层 b** | σ²(b)=0.003（冻结） | σ²(b)=0.081 | -0.54 | 0.007 |
| **b 范围** | 0.045 | 0.432 | -1.10 | 0.0001 |
| **Utility U** | \|U(t)-U(0)\|=0.003 | 0.058 | -0.79 | 0.0003 |
| **r(U,b)** | **0.711** | 0.074 | 0.99 | 0.003 |
| itemBeliefs 熵 H_ind | 2.031 | 2.110 | -1.42 | 0.0001 |
| **H_ind 方差** | 0.011 | 0.005 | 1.00 | 0.0001 |
| **rank 变化率** | 0.475 | 0.239 | 0.75 | 0.0002 |

#### 核心发现：部分锚定现象

**恶意 prompt 锁定标量层，但不锁定 item 级结构**：

1. **标量 b 被冻结**（指令 1+5：confidence≥85 + 永不认错）→ b≈0.95 恒定 → 零凸包逃逸（数学必然）
2. **itemBeliefs 持续洗牌**（指令 4 只指定 rank=1，其他 rank=4-5 留有空间）→ rank 变化率 2 倍于诚实 agent
3. **H_ind 方差反而更大**（d=1.00）——恶意 agent 的内部认知结构在"寻找最优配置"，但标量输出不变

**理论含义**：
- 恶意 agent 的"锚定"是**表层锚定**（scalar b 冻结）而非**深层锚定**（item 结构也冻结）
- 这解释了为什么 δ/ε 检测有效：标量 b 与 U 的关系在恶意 agent 中被人为锁死（r=0.711 vs 0.074），导致 ε = |b - αU| 的模式与诚实 agent 不同
- **凸包逃逸检测的不是"恶意性"，而是"标量冻结"**——任何让 b 不变的 prompt 都会产生 0% 逃逸

#### 对论文叙事的影响

**旧叙事**（已废弃）：δ 检测"主客观承诺偏差"

**中间叙事**（已修正）：ε 检测"belief-utility 失配"

**最终叙事**（基于 E 深挖）：
- 凸包逃逸检测 LLM agent 的**自然探索 vs prompt 锚定**
- ε 检测标量 b 与 U 的**关系异常**（恶意 agent r(U,b)=0.71 vs 诚实 0.07）
- 恶意 prompt 的**部分锚定**（scalar 冻结 + item 洗牌）是可观测特征

**这把发现从"检测恶意"重构为"检测 prompt 锚定异常"**——更理论清晰，也更诚实（不假设 agent "内在恶意"，只观测行为模式）。

### 10.2 阶段 2 需新实验的假设（~114 API）

| 偺设 | 内容 | 预期 | 验证方法 |
|---|---|---|---|
| H5-FJ | FJ α 参数化效果 | α=0.7 收敛快但易 herd，α=0.3 慢但决策质量高 | C' 组新实验 |
| H6-δ | 干预 δ 降低 → τ 提升 | inject_evidence 使 δ 下降，τ 上升 | 新实验 |
| H7-vector | 向量层 R/T/H 解耦 | utility 向量余弦 R 与 T·H 相关性下降 | 需 itemBeliefs 持久化 |

### 10.3 v0.3 假设的状态更新

| v0.3 偺设 | v0.4 状态 | 理由 |
|---|---|---|
| H1 (Utility 比 Belief 稳定) | ❌ 无法验证 | 169 runs 无 itemBeliefs |
| H2 (Evidence 解释 Opinion Change) | ⚠️ 降级为 ι→b 的相关性 | 标量层近似 |
| H3 (Inertia 预测权威偏差) | ✅ 保留，可算 | ι 已有代码 |
| H4 (Confidence 负向预测 ΔU) | ⚠️ 降级为 c→Δb | 标量层 |
| H5 (治理通过 Evidence) | ✅ 保留，δ 是代理 | ι 通过 evidence 变化 |
| H6 (5 维解耦) | ❌ 无法验证 | 169 runs 无 itemBeliefs |
| H7 (Cognitive F1 更高) | ❌ 无法验证 | 同上 |
| H8 (Susceptibility 中介) | ⚠️ 降级为 Λ→Δb | 标量层 |

---

## 11. 代码升级路径（FJ 引擎）

### 11.1 代码变更清单

| 文件 | 行号 | 变更 | 成本 |
|---|---|---|---|
| `asyncEngine.ts` | 462 | `LEARNING_RATE=0.15` → `ALPHA=0.85`（FJ 参数） | 1 行 |
| `asyncEngine.ts` | 484-486 | DeGroot delta → FJ 凸组合 | 5 行 |
| `index.ts` | 170 | `agentStates.set(...)` 添加 `initialBelief` | 1 行 |
| `index.ts` + `asyncEngine.ts` | 15 处 | 内联类型 `{belief, confidence}` → `{belief, confidence, initialBelief}` | ~15 行 |
| `types.ts` | 316 | `AgentState` 添加 `initialBelief?: number` | 1 行 |
| **总计** | | | **~25 行** |

### 11.2 测试影响

子代理审计确认：**0 个测试会因 FJ 升级而失败**。所有断言都是 magnitude/reproducibility/structural，不依赖具体公式。`async-engine.test.ts:567` 的注释"验证 DeGroot 更新方向"需更新为"验证 FJ 更新方向"。

### 11.3 实验重跑需求

FJ 升级**必须重跑实验**，不能 posthoc 重算。原因：
- LLM prompt 消费 internal belief（`index.ts:619,630,637`）
- 一旦 b(t) 在 cycle 1 改变，后续 LLM 输出全部改变
- posthoc FJ 是近似（§7.3），不是真 FJ

**重跑成本**：~114 API（C' 组 30 + Supplier 扩样 42 + Qwen 重跑 48，约 $1-2）

---

## 12. 与前沿工作的关系

### 12.1 差异化定位

| 维度 | 前沿最先进 | SwarmAlpha v0.4 | 差异化 |
|---|---|---|---|
| belief 本体 | Belief Engine: log-odds | 承诺度（标量投影） | 我们是多选项任务的承诺，非单议题 |
| 更新规则 | FJ（Hidden Anchors, MoE） | FJ（v0.4 升级） | 借鉴，非原创 |
| 隐变量 | Hidden Anchors: hidden anchor | 主客观承诺偏差 δ=\|b-ι\| | **延伸**：量化主客观偏差 |
| 热力学类比 | Mitra 2025: Kuramoto-for-MAS | R/T/H 承诺失序投影 | **差异化**：承认耦合，放弃热力学叙事 |
| 治理干预 | 前沿几乎无系统研究 | 5 种干预 + δ 驱动选择 | **空白点**：核心独占 |

### 12.2 借鉴的前沿工作

1. **Belief Engine**（arXiv:2605.15343）：区分 belief（evidential state）与 stance（scalar readout）——我们的承诺度是 stance，ι 是 evidential state 的客观投影
2. **Hidden Anchors**（arXiv:2606.19494）：LLM agent 存在 hidden anchor——FJ 的 b(0) 是锚定，δ=\|b-ι\| 量化主客观锚定偏差
3. **MoE = MAS**（arXiv:2605.25929, ICML 2026）：FJ 参数 input-dependent——支持我们 α 参数化的合理性
4. **Disentangling Interaction and Bias**（arXiv:2509.06858）：二维 opinion（stance + entropy）——支持我们 T/H 作为承诺失序的不同投影

### 12.3 未借鉴但相关的工作

- **Mitra 2025**（Kuramoto-for-MAS）：已抢占 Kuramoto 叙事，我们不再 claim 这个类比的原创性
- **ScioMind**（arXiv:2605.13725）：分层 memory + 动态 profile——超出当前项目范围

---

## 13. 已知理论局限（v0.4 诚实标注）

> 详细的局限性记录与历史修复见 [LIMITATIONS.md](../paper/LIMITATIONS.md)，特别是 §27（R/T/H 耦合）、§28（抉择困境）、§27.2（belief 语义模糊）。

| 局限 | 说明 | 影响范围 | 缓解 |
|---|---|---|---|
| 169 runs 无 itemBeliefs | 向量层无法验证，H6/H7 假设无法测试 | §10 | 阶段 2 新实验持久化 |
| R/T/H 仍强耦合 | FJ 升级不改同源性（仍派生自标量 b） | §4 | 承认为多投影，不强求解耦 |
| F 仍是加权和 | r=0.9175，F≈2.014·(1-R) | §4.3 | 放弃热力学叙事 |
| ι 的 evidence 分量依赖 sourceReliability=0.5 | ι 判别力部分受限 | §6.4 | 阶段 2 参数化 |
| posthoc FJ 是近似 | 用最终图权重，非 per-utterance | §7.3 | 阶段 2 真实 FJ 重跑 |
| δ 是观察性变量 | 不能直接"修改 δ" | §6.4 | 通过 ι/b 间接影响 |
| ε 项未建模 | LLM 输出随机性未纳入不动点分析 | §8 | T2 待完成 |
| 相变未验证 | 不 claim 热力学理论贡献 | - | 未来工作 |
| 单层承诺度 | R/T/H/F 仅在标量上计算 | §4 | 向量层为未来工作 |

---

## 14. 待完成的理论工作

| # | 任务 | 优先级 | 阶段 | 关联 |
|---|---|---|---|---|
| T1-δ | 计算 169 runs 的 δ 分布，验证 H1-δ/H2-δ/H4-δ | 高 | 阶段 1 | §6, §10.1 |
| T2-FJ | posthoc 反推 α 分布，验证 H3-FJ | 高 | 阶段 1 | §7, §10.1 |
| T3-FJ-code | FJ 引擎代码升级（~25 行） | 高 | 阶段 2 | §11 |
| T4-FJ-exp | C' 组 FJ α 参数化新实验 | 高 | 阶段 2 | §10.2 |
| T5-vector | itemBeliefs 持久化 + 向量层验证 | 中 | 阶段 2 | §10.2 H7 |
| T6-ε | 建模 LLM ε 项统计特性 | 中 | 未来 | §8 |
| T7-game | 博弈论建模恶意 agent 策略适应 | 低 | 未来 | §9 |
| T8-phase | 相变现象检测 | 低 | 未来 | - |

---

## 附录 A：命题 1a/1b/1c 严格证明（v0.3 保留，数学不变）

> 完整证明见 [src/lib/utils/statsUtils.ts](../../src/lib/utils/statsUtils.ts) 实现与脚本测试 `experiments/v2/test_theory_propositions.ts`。

### A.1 命题 1a 证明（完美承诺一致 → R=1）

若 b_1 = b_2 = ... = b_N = b*，则所有 θ_i = θ* 相等。

$$
R = \frac{1}{N}\sqrt{N^2 \cos^2\theta^* + N^2 \sin^2\theta^*} = \frac{1}{N}\sqrt{N^2} = 1
$$

最后一步用 Pythagorean 恒等式。证明不依赖 θ* 具体值。$\square$

### A.2 命题 1b 证明（充要条件）

R=0 当且仅当 Σsin θ_i=0 且 Σcos θ_i=0。对 θ_i∈[-π/2,π/2]，cos θ_i≥0，故 Σcos θ_i=0 当且仅当每个 cos θ_i=0，即 θ_i∈{-π/2,+π/2}（b_i∈{-1,+1}）。此时 Σsin θ_i=0 当且仅当 +1 与 -1 数量相等，即 N 为偶数且完美对半分。$\square$

**推论 1b.1**：N 为奇数时 R>0 对所有 b∈[-1,1]^N 成立。
**推论 1b.2**：若存在 i 使 |b_i|<1，则 R>0。

### A.3 命题 1c 证明（连续均匀分布极限 → 2/π）

设 θ 在 [-π/2,π/2] 上均匀分布。由强大数律：

$$
\frac{C}{N} \xrightarrow{\text{a.s.}} \mathbb{E}[\cos\theta] = \frac{1}{\pi}\int_{-\pi/2}^{\pi/2}\cos\theta\,d\theta = \frac{2}{\pi}
$$

$$
\frac{S}{N} \xrightarrow{\text{a.s.}} \mathbb{E}[\sin\theta] = 0
$$

故 R_N → 2/π ≈ 0.6366。$\square$

---

## 附录 B：命题 4/4' 严格证明（v0.3 保留，FJ 下仍成立）

### B.1 命题 4 证明（reduce_weight 不改变不动点存在性）

无噪声 FJ 更新 b_i(t+1) = α·b_group(t) + (1-α)·b_i(0)。不动点满足 b_i* = α·b_group* + (1-α)·b_i(0)，等价于 b_group* 的方程。

reduce_weight 将 w_ik ← β·w_ik，改变 b_group 的计算但不改变方程的解的存在性（图连通性不变 → Laplacian 零特征值不变）。$\square$

### B.2 命题 4' 证明（位置偏移）

FJ 下收敛值为 c' = α·c_DeGroot + (1-α)·mean(b(0))，其中 c_DeGroot 是纯 DeGroot 收敛点（命题 4' v0.3 证明适用）。reduce_weight 改变 c_DeGroot（v0.3 证明），故改变 c'。$\square$

**注**：FJ 下收敛点是 DeGroot 收敛点与初始承诺均值的凸组合，reduce_weight 通过改变 DeGroot 部分间接改变 FJ 收敛点。

---

## 附录 C：v0.4 与前沿工作的对照

| 前沿工作 | 核心贡献 | SwarmAlpha 借鉴点 | 差异化点 |
|---|---|---|---|
| Belief Engine (2605.15343) | log-odds evidential state + stance 投影 | belief vs stance 区分 → b vs ι | 多选项承诺 vs 单议题 log-odds |
| Hidden Anchors (2606.19494) | LLM agent hidden anchor → 凸包逃逸 | FJ b(0) 锚定 + δ 偏差 | δ 量化主客观偏差 |
| MoE=MAS (2605.25929) | FJ input-dependent | α 参数化合理性 | α 与 δ 的关系 |
| Mitra 2025 (2508.12314) | Kuramoto-for-MAS | 不借鉴（已抢占） | 放弃 Kuramoto 叙事 |
| Disentangling Bias (2509.06858) | stance + entropy 二维 | T/H 作为多投影 | 承认耦合而非声称独立 |

---

**版本**：v0.4（2026-07-28，FJ 框架 + 承诺度本体 + 主客观偏差 δ）
**作者**：SwarmAlpha 项目
**状态**：待阶段 1 验证（δ 分布 + posthoc α 反推）
**准则**：以假装理解为耻，以诚实无知为荣
**数字来源**：所有数字以 [SOT.md](../SOT.md) 为准
