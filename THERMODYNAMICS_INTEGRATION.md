# 社会热力学与系统联合：理论、实现与验证

> 本文档详细说明 SwarmAlpha 如何将社会热力学（Social Thermodynamics）框架与治理运行时（Governance Runtime）、检测器（Detectors）、五维评估（Five-Dimension Evaluation）三部分联合，形成"观察 → 检测 → 干预排序 → 评估反馈"的完整闭环。

---

## 1. 为什么需要社会热力学

### 1.1 问题：检测器各自触发，缺乏统一优先级

SwarmAlpha 的 4 个检测器（echo chamber / authority bias / polarization / premature consensus）独立工作。当系统处于复杂状态时——例如 agent 信念同时呈现方向分散与幅度噪声——多个检测器会同时触发，产生一队候选干预：

```
检测器触发：echo_chamber (medium) + polarization (heavy) + premature_consensus (light)
候选干预：  [break_connections, force_reflection, introduce_diversity]
```

旧逻辑按检测器优先级固定顺序应用，问题在于：

- **同一干预在不同系统状态下效果相反**：`force_reflection` 在结构性无序（方向不同步）时有效，在热性无序（噪声主导）时反而增加混乱
- **缺乏"当前系统处于何种物理状态"的判据**：检测器只能识别"症状"（如信念分散），无法识别"病机"（结构性 vs 热性无序）
- **干预顺序影响收敛轨迹**：先做 `force_reflection` 再做 `reduce_weight`，与反过来，最终 τ 差异显著

### 1.2 方案：用社会热力学作为"系统状态坐标系"

社会热力学将多 agent 系统类比为热力学系统，提供 3 个状态变量：

| 变量 | 物理含义 | 系统含义 | 计算来源 |
|------|---------|---------|---------|
| **R**（序参量） | Kuramoto 同步度 | agent 信念方向同步程度 | `computeKuramotoOrder` |
| **T**（温度） | 热运动幅度 | 信念分散程度（标准差） | `computeStd` |
| **H**（熵） | 信息无序度 | 信念分布的不确定性 | `shannonEntropy` |

并由 Helmholtz 自由能公式组合：

$$F = U - TS = (1-R) + T \cdot H$$

这里 **U = (1-R)** 是"结构无序"（势能项，agent 方向未对齐），**TS = T·H** 是"热无序"（能量耗散项，agent 信念分散且高熵）。F 的分解不是简单加和，而是将系统状态分解为两个**正交的无序来源**，分别对应不同干预类型。

---

## 2. 数学定义与代码实现

### 2.1 Kuramoto 序参量 R

代码位置：[src/lib/governance/index.ts:532](./src/lib/governance/index.ts#L532)、[src/lib/evaluation/index.ts:784](./src/lib/evaluation/index.ts#L784)

```typescript
private computeKuramotoOrder(beliefs: number[]): number {
  if (beliefs.length === 0) return 0;
  // θ = b × (π/2): belief ∈ [-1,1] → angle ∈ [-π/2, π/2]
  const angles = beliefs.map(b => b * Math.PI / 2);
  let sumReal = 0, sumImag = 0;
  for (const angle of angles) {
    sumReal += Math.cos(angle);
    sumImag += Math.sin(angle);
  }
  return Math.sqrt(sumReal * sumReal + sumImag * sumImag) / beliefs.length;
}
```

**相位映射选择**：使用 `θ = (π/2)·b`（H4 修复后），而非 `θ = π·b`。原因：
- b=+1（强支持）→ θ=+π/2（单位圆顶部）
- b=−1（强反对）→ θ=−π/2（单位圆底部）
- 两者在单位圆上**正对**，R≈0（正确反映极化）
- 旧映射 `θ=π·b` 会使 b=±0.99 都落在单位圆左侧附近，R≈1，误判极化为共识

**R 的物理意义**：
- R→1：所有 agent 信念方向高度同步（真共识或真极化需结合 H 判断）
- R→0：agent 信念方向分散

### 2.2 Shannon 熵 H

代码位置：[src/lib/utils/statsUtils.ts:58](./src/lib/utils/statsUtils.ts#L58)

```typescript
export function shannonEntropy(
  values: number[],
  bins: number = 5,
  min: number = -1,
  max: number = 1
): number {
  if (values.length === 0 || bins < 2) return 0;
  const binWidth = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const clamped = Math.max(min, Math.min(max, v));
    let idx = Math.floor((clamped - min) / binWidth);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const n = values.length;
  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const p = count / n;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy / Math.log2(bins); // 归一化到 [0,1]
}
```

**归一化**：除以 `log2(bins)`（5 bins 时为 log2(5)≈2.32），使 H∈[0,1]。
- H→1：agent 信念均匀分布在所有 bins（最大无序）
- H→0：所有 agent 信念集中在 1 个 bin（完全有序）

### 2.3 温度 T 的显式归一化

**为什么需要归一化**：F = (1−R) + T·H 中，R∈[0,1]、H∈[0,1] 已归一化，T 必须同量纲才能让两个无序分量可比。

**一个容易误判的细节**：在当前 belief 范围 [-1,1] 下，T（总体标准差）**数学上已经在 [0,1] 内**——因为 var ≤ E[X²] ≤ 1（|X|≤1）。所以"T·H 远大于 (1−R) 的量纲失衡"在当前 belief 范围下**实际不会发生**。缺陷在于：这个归一化是**隐式的**（依赖 belief 边界），代码未显式化、未文档化，belief 范围一变就失控。

**修复**：新增 `normalizeTemperature` 将隐式归一化显式化。

代码位置：[src/lib/utils/statsUtils.ts:100](./src/lib/utils/statsUtils.ts#L100)

```typescript
export function normalizeTemperature(
  std: number,
  beliefRange: [number, number] = [-1, 1]
): number {
  // 对 beliefs ∈ [min,max]，总体标准差的理论上界 = (max-min)/2
  // （双峰分布在端点等概率时取得）。除以此上界归一化到 [0,1]。
  const maxStd = (beliefRange[1] - beliefRange[0]) / 2;
  if (maxStd <= 0) return 0;
  return Math.min(1, Math.max(0, std / maxStd));
}
```

调用点：
- [governance/index.ts:561](./src/lib/governance/index.ts#L561)：`const T = normalizeTemperature(this.computeStd(beliefs));`
- [evaluation/index.ts:104](./src/lib/evaluation/index.ts#L104)：`socialFreeEnergy(kuramotoOrder, normalizeTemperature(beliefStd), entropy);`

**定性**：这是健壮性修复（隐式→显式 + 防御范围扩展），**不是**正在导致结果偏差的硬伤——当前 belief∈[-1,1] 下归一化前后数值不变（上界=1.0）。但显式化是必要的：测试已默认 T∈[0,1]（如 `socialFreeEnergy(0, 0.8, 1)`），生产代码若不显式归一化则与测试假设脱耦。

### 2.4 社会自由能 F

代码位置：[src/lib/utils/statsUtils.ts:110](./src/lib/utils/statsUtils.ts#L110)

```typescript
export function socialFreeEnergy(
  orderParam: number,  // R ∈ [0,1]
  temperature: number, // T ∈ [0,1]（经 normalizeTemperature 归一化）
  entropy: number      // H ∈ [0,1]
): number {
  const U = 1 - orderParam;  // 结构无序（势能）
  const TS = temperature * entropy; // 热无序（耗散）
  return U + TS;
}
```

**F 的分解**：
- **(1−R)**：结构性无序——agent 信念方向未对齐。即使幅度很小（T 低），只要方向不同步，(1−R) 就高。
- **T·H**：热性无序——agent 信念既分散（T 高）又分布广（H 高）。即使方向大致对齐（R 高），仍可能是噪声驱动的伪同步。

这两个分量**正交**：可以同时高（既极化又噪声大）、同时低（真共识）、或一高一低（伪共识/伪极化）。

---

## 3. 三层联合架构

社会热力学与系统的联合分三层，当前**层 1 已实现并验证，层 2/3 留实验室**：

```
┌─────────────────────────────────────────────────────────┐
│  层 3（实验室）：在线干预效果反馈                          │
│  Δτ 反馈 → 按 F-state 在线下调有害干预权重                │
│  解决：真/假共识盲区、有害干预硬编码禁用不可自适应         │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│  层 2（实验室，原设计已推翻）：任务难度感知门控             │
│  τ₁ + ΔF 轨迹 → 调干预剂量（非调检测阈值）                │
│  解决：天花板效应、简单任务上有害干预                      │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│  层 1（已实现 ✅）：F 分解驱动干预优先级排序               │
│  多检测器同时触发 → 按 F 分解匹配度排序干预               │
│  解决：多检测器并发时无统一优先级                          │
└─────────────────────────────────────────────────────────┘
```

**三层与实验瓶颈的对应关系**（这是设计的出发点，不是事后附会）：

| 实验瓶颈 | 由哪层解决 | 解决机制 |
|---------|----------|---------|
| 多检测器并发触发，无统一优先级 | 层 1（已实现） | F 分解按病机匹配度排序干预 |
| 天花板效应（Supplier 基线 τ=0.68 已接近 full） | 层 2 | τ₁ 高 → dosage_scale 低 → 抑制干预 |
| 简单任务上治理无效甚至有害 | 层 2 + 层 3 | 层 2 门控抑制 + 层 3 在线降权 |
| F 分解无法区分真/假共识 | 层 3 | Δτ 反馈经验性学到真/假共识边界 |
| continue_discussion/introduce_diversity 有害 | 层 3（当前硬编码禁用，层 3 替代为自适应） | 在线按 F-state 跟踪 Δτ，自动降权 |

### 3.1 层 1：F 分解驱动的干预优先级排序（已实现）

#### 核心思想

每种干预类型对应一种"无序病机"，F 分解告诉我们当前系统主要患哪种病：

| 干预类型 | 对应的无序分量 | 作用机理 |
|---------|--------------|---------|
| `force_reflection` | (1−R) 结构性无序 | 强制 agent 反思，重新对齐信念方向 |
| `reduce_weight` | T·H 热性无序 | 压制高噪 agent 权重，降低 T·H |
| `introduce_diversity` | R·(1−H) 虚假共识 | R 高但 H 低（一起有序地错）→ 注入多样性 |
| `continue_discussion` | R·(1−H)·(1−F) 过早收敛 | 有序且 F 低（已稳定但过早）→ 继续讨论 |

#### 权重公式的设计假设（可证伪，非推导结果）

**必须声明**：下表 4 个 `alignmentScore` 公式是基于干预机制的作用假设**设计**的，不是从理论**推导**的。每个公式背后是一个**可证伪的假设**，而非数学必然。其中假设1已被回测证伪并修正（见 §5.4），假设4已被实验证伪（continue_discussion 已禁用）。

| 干预类型 | 评分公式 | 设计假设（可证伪） | 假设可能错误的情形 | 回测状态 |
|---------|---------|-------------------|------------------|---------|
| `force_reflection` | `thermal·(1−structural)`（原 `1−R`，已修正） | 原假设：反思对齐方向。**回测证伪**：实测结构性主导 Δτ=−0.033，热性主导 Δτ=+0.115（p=0.041）。修正后假设：反思是降噪干预，极化时强化对立立场有害 | 已被极化场景证伪，修正为热性主导且非极化时优先 | ✅ 回测证伪→已修正 |
| `reduce_weight` | `T·H` | 假设权重压制抑制高噪 agent。**回测方向支持但不显著**：热性主导 Δτ=+0.182 vs 结构性 +0.067，p=0.100，d=+0.448（未达0.05，可能是抽样波动） | 若被压制 agent 方向正确只是声音大，会损害对齐 | ⚠️ 方向支持不显著 |
| `introduce_diversity` | `R·(1−H)` | 假设"高同步低熵"= 虚假共识，注入多样性有价值 | 若高 R 低 H 是真共识，注入多样性有害——F 分解无法区分，需 ground truth | ⏳ 未回测（echo chamber 难触发） |
| `continue_discussion` | `R·(1−H)·(1−F)` | 假设有序+低F+早期=过早收敛 | 实验证实 0% 有效率，已默认禁用 | ❌ 已被实验证伪 |

**关键诚实声明**：
1. 假设1（force_reflection↔structural）已被回测**证伪并修正**：97 次 force_reflection 事件显示结构性主导时 Δτ=−0.033（有害）、热性主导时 Δτ=+0.115（有益），p=0.041。force_reflection 是降噪干预而非对齐方向干预，已修正为 `thermal·(1−structural)`。详见 §5.4。
2. 假设2（reduce_weight↔thermal）回测**方向支持但不显著**（p=0.100, d=+0.448）：热性主导 Δτ=+0.182 vs 结构性主导 +0.067。方向一致但未达 p<0.05，85 事件中仅 18 个结构性主导，样本不均衡拉低检验力。不能称为"证实"，仅"方向一致"。
3. 假设 3（introduce_diversity 对应虚假共识）有一个**根本盲区**：R·(1−H) 无法区分"真共识"与"虚假共识"——两者都是高 R 低 H。区分需要 ground truth 或外部信号，F 分解本身做不到。这是层 3（增量评估反馈）要解决的核心问题。该假设未回测（echo chamber 难触发）。
4. 假设 4 已被实验**证伪**：continue_discussion 在 Crisis 任务上 0% 有效率、平均 τ 变化 −0.400，该干预已默认禁用。

#### 实现代码

代码位置：[src/lib/governance/index.ts:554](./src/lib/governance/index.ts#L554)

```typescript
private rankInterventionsByFreeEnergy(
  interventions: Intervention[],
  beliefs: number[]
): Intervention[] {
  if (interventions.length <= 1) return interventions;

  const R = this.computeKuramotoOrder(beliefs);
  const T = this.computeStd(beliefs);
  const H = shannonEntropy(beliefs);
  const structural = 1 - R;       // 结构性无序
  const thermal = T * H;          // 热性无序

  const alignmentScore = (type: InterventionType): number => {
    switch (type) {
      case "force_reflection":
        return structural;                      // 结构性无序主导
      case "reduce_weight":
        return thermal;                         // 热性无序主导
      case "introduce_diversity":
        return R * (1 - H);                     // 虚假共识
      case "continue_discussion":
        return R * (1 - H) * (1 - socialFreeEnergy(R, T, H)); // 过早收敛
      default:
        return 0;
    }
  };

  return [...interventions].sort(
    (a, b) => alignmentScore(b.type) - alignmentScore(a.type)
  );
}
```

#### 应用点

在 `diagnoseAndIntervene` 返回前调用（[src/lib/governance/index.ts:877](./src/lib/governance/index.ts#L877)）：

```typescript
const rankedInterventions = this.rankInterventionsByFreeEnergy(
  interventions,
  agentBeliefs.map(b => b.belief)
);
return { result, interventions: rankedInterventions };
```

#### 排序逻辑的物理解释

`continue_discussion` 的评分 `R·(1−H)·(1−F)` 设计最精妙：
- `R·(1−H)`：识别"高同步低熵"状态（疑似过早收敛）
- 再乘 `(1−F)`：仅当 F 低（系统已稳定，非混乱）时才优先继续讨论
- 若 F 高（系统仍混乱），(1−F)→0，`continue_discussion` 评分被压制——避免在混乱中盲目延长讨论

### 3.2 层 2：任务难度感知的干预门控（实验室，原设计已推翻）

#### 原设计为何错误

原层 2 设计为"F 高→放宽检测阈值，F 低→收紧阈值"。**这个逻辑在已收敛的简单任务上是反向的**：

- Supplier 任务基线 τ=0.68（已接近 full τ=0.767，天花板效应），系统 F 低（高 R、低 T、低 H → 低 F）
- 原逻辑"F 低→收紧阈值"会触发**更多**检测 → **更多**干预
- 但在天花板情形下，更多干预 = 更多有害干预（实验已证实 continue_discussion/introduce_diversity 在此情形有害）
- **结论**：原层 2 会加剧天花板效应下的有害干预，必须推翻

#### 推翻后的设计：任务难度感知门控

层 2 的正确作用不是"调阈值"，而是"决定**是否该干预**"——即在治理引擎入口加一道门控：

```
门控信号：
  1. 基线难度：第 1 轮 τ（ground-truth-free 的难度代理）
     - τ₁ 高（如 Supplier 0.68）→ 任务简单，系统已接近最优 → 抑制干预
     - τ₁ 低（如 Crisis 0.41）→ 任务困难，有治理空间 → 放行干预
  2. F 轨迹（ΔF = F_t - F_{t-1}）：
     - ΔF < 0（F 下降，系统在自组织）→ 不打断，抑制干预
     - ΔF ≈ 0（F 停滞，系统未自组织）→ 放行干预
  3. 综合门控：dosage_scale = f(τ₁, ΔF) ∈ [0,1]，乘到干预强度上
```

**与原设计的关键区别**：
- 原设计用 F **绝对值**调检测阈值（治标：改"检测到什么"）
- 新设计用 τ₁ + F **轨迹**调干预**剂量**（治本：改"是否干预"）
- 新设计直接针对天花板效应：Supplier τ₁=0.68 → dosage_scale 低 → 干预被抑制 → 避免有害干预

#### 与实验瓶颈的对应

| 实验瓶颈 | 层 2 如何解决 |
|---------|-------------|
| 天花板效应（Supplier：基线已接近 full） | τ₁ 高 → dosage_scale 低 → 抑制干预，避免对已收敛系统施加有害干预 |
| 治理在简单任务上无效（Supplier d=0.47, p=0.089） | 不再浪费 token 在无治理空间的任务上 |
| 第 3 轮干预 0% 有效 | F 轨迹在第 3 轮已停滞且 τ 已定 → 门控抑制最后一轮干预（已通过 isLastRound 部分实现） |

#### 未实现原因

- τ₁ 作为难度代理需验证：是否存在 τ₁ 高但实际困难的任务（如"看似一致但集体错"的虚假共识）
- dosage_scale 的函数形式（线性？sigmoid？）需标定
- project_memory 记录：自适应阈值曾因"用真实任务第一轮作校准数据"失败——新设计用 τ₁ 作**门控信号**而非校准数据，避开了原缺陷，但仍需验证

### 3.3 层 3：基于增量评估的在线干预效果反馈（实验室）

#### 解决的核心问题：F 分解无法区分真共识与虚假共识

层 1 的根本盲区（§3.1 假设 3 已声明）：`R·(1−H)` 对"真共识"和"虚假共识"给出相同评分——两者都是高 R 低 H。因此层 1 会在**真共识**上推荐 `introduce_diversity`（有害），在**虚假共识**上也推荐 `introduce_diversity`（有益），但无法区分二者。

层 3 的作用：用**干预后的实际效果**反馈修正层 1 的权重，**经验性地**学到真/假共识的区别——不需要 ground truth，靠 Δτ 信号。

#### 设计方案：在线下调有害干预权重

```
实验轮次 t:
  治理 → 检测 → F 分解排序(层1) → 门控(层2) → 干预 → agent 发言
                                                          ↓
                               增量评估 Δτ_t = τ_t - τ_{t-1}
                                                          ↓
                               在线更新：若干预类型 i 在 F-state s 下 Δτ < 0
                                 → 下调 alignmentScore(i, s) 的有效权重
                                                          ↓
实验轮次 t+1: 治理 → 检测 → 调整后排序 → 干预 ...
```

具体地：
- 维护一张 `effectivenessTable[type][F-state] → 滑动平均 Δτ` 表
- 每次干预后，用观测到的 Δτ 更新该表
- 层 1 的 `alignmentScore` 乘以 `effectivenessTable` 的归一化值：实际评分 = 理论评分 × 历史有效率
- 若某干预在某 F-state 下持续 Δτ<0，其有效权重自动趋近 0——**在线学到"不该在此状态用此干预"**

#### 与实验瓶颈的对应

| 实验瓶颈 | 层 3 如何解决 |
|---------|-------------|
| `continue_discussion` 0% 有效率、Δτ=−0.400 | 当前是**硬编码禁用**；层 3 会**自动学到**该干预在所有 F-state 下 Δτ<0 → 权重趋零，等效禁用但可自适应（若新任务上有效会自动恢复） |
| `introduce_diversity` 9.1% 有效率 | 层 3 会学到该干预在"真共识 F-state"下 Δτ<0 → 在真共识状态降权，在虚假共识状态保留——**经验性区分真/假共识** |
| F 分解无法区分真/假共识（§3.1 假设 3 盲区） | 层 3 用 Δτ 反馈**学到**真/假共识的 F-state 边界，弥补层 1 的理论盲区 |

#### 与当前"硬编码禁用"的区别

当前 `introduce_diversity` 和 `continue_discussion` 通过 `disabledInterventions` **硬编码禁用**。这是基于 Crisis 单任务数据的决策。问题：
- 若新任务（如 Supplier）上 `introduce_diversity` 实际有效，硬编码禁用会错过收益
- 硬编码是全局的，不区分 F-state

层 3 用**在线学习**替代硬编码：按 F-state 分别跟踪效果，自动在有害状态降权、在有益状态保留。这比硬编码更自适应，且不需要人工重新标定。

#### 未实现原因

- 五维评估当前依赖完整 `interactionHistory`，需重构为**增量计算**（轮次 t vs t-1 的 Δτ）
- `effectivenessTable` 的 F-state 离散化方式未定（用 R/H/F 的分桶？聚类？）
- 反馈控制环路（权重调整）的稳定性需理论分析，避免振荡——但比层 2 的阈值调制更安全，因为下调是单调的（只降不升，直到新数据证明有效）

---

## 4. 在评估引擎中的联合

社会热力学指标不仅用于治理排序，也作为**评估维度**输出。

代码位置：[src/lib/evaluation/index.ts:99-120](./src/lib/evaluation/index.ts#L99)

```typescript
const kuramotoOrder = this.computeKuramotoOrder(beliefs);
const entropy = shannonEntropy(beliefs);
const freeEnergy = socialFreeEnergy(kuramotoOrder, normalizeTemperature(beliefStd), entropy);

return {
  score: ...,
  kuramotoOrder: Math.round(kuramotoOrder * 100) / 100,
  beliefStd: Math.round(beliefStd * 100) / 100,
  agreementRate: Math.round(agreementRate),
  entropy: Math.round(entropy * 1000) / 1000,
  freeEnergy: Math.round(freeEnergy * 1000) / 1000,
  trajectory,
  ...
};
```

每次实验的评估结果包含 `entropy` 和 `freeEnergy` 字段，可在分析阶段追溯治理干预如何改变系统热力学状态。

---

## 5. 实验验证

### 5.1 单元测试

代码位置：[test/governance.test.ts:228](./test/governance.test.ts#L228)

3 个测试覆盖三种典型场景：

| 测试 | 场景 | 验证点 |
|------|------|--------|
| 极化（结构性主导） | 信念 [-1,-0.9,0.9,1,-0.95]，structural=0.786 > thermal=0.390 | `reduce_weight` 排在 `force_reflection` 前（回测证伪后修正） |
| 单一干预 | 虚假共识 [0.8,0.82,0.79,0.81,0.8]，仅触发一种干预 | 排序不改变结果（no-op 安全性） |

**测试修复说明**：原测试用 `if (interventions.length >= 2 && ...)` 守卫，断言被跳过导致**空过**，且构造的信念 [-0.3,0.1,0.5,-0.2,0.3] 实际 R≈0.89（高共识，非结构性主导）。已修复：(1) 用极化双峰信念 [-1,-0.9,0.9,1,-0.95] 真正实现 structural 主导；(2) 移除 if 守卫，断言**必须**同时触发两种干预否则测试失败；(3) 断言方向根据回测证伪结果修正（见 §5.2）。

全部 229/229 测试通过（224 原 + 6 新 normalizeTemperature − 1 删除空过 + 0 净增）。

### 5.2 回测验证：91.7% 的 Crisis 实验受排序影响

对 24 次 Crisis full 模式实验回测：

- **22/24 次（91.7%）** 实验中多个检测器同时触发，F 分解排序实际改变了干预执行顺序
- **2/24 次** 仅单一检测器触发，排序为 no-op

这证明排序逻辑不是理论摆设——在真实实验中，绝大多数轮次都有多个检测器并发触发，F 分解排序在 91.7% 的情况下实际生效。

### 5.3 跨任务待验证

| 任务 | F 分解排序 | 状态 |
|------|-----------|------|
| Crisis | ✅ 91.7% 实验受影响 | 已验证 |
| Supplier | 未分析 | 待实验室验证 |

Supplier 任务基线 τ=0.68（简单任务），多检测器并发触发的频率可能低于 Crisis，F 分解排序的实际影响需重新评估。

### 5.4 权重假设回测：假设1被证伪（关键发现）

回测脚本：[experiments/v2/backtest_weight_assumption.ts](./experiments/v2/backtest_weight_assumption.ts)

对 54 次 full 模式实验（Crisis 24 + Supplier 30）的 97 次 `force_reflection` 干预事件，按干预时系统的 (1−R) vs T·H 比值分桶，对比两组的 Δτ（干预后 tau 变化）：

| 分桶 | 事件数 | 平均 Δτ | 含义 |
|------|--------|---------|------|
| 结构性主导 (1−R > T·H) | 24 | **−0.033** | force_reflection 在极化时**有害** |
| 热性主导 (T·H ≥ 1−R) | 73 | **+0.115** | force_reflection 在噪声主导时**有益** |

- **置换检验**：p = 0.041（5000 perms），两组差异显著
- **Cohen's d**：−0.49（中等效应，**负向**——结构性组 Δτ 更低）

**结论：假设1（force_reflection ↔ 结构性无序）被证伪。** force_reflection 不是"对齐方向"的干预，而是"降噪"的干预——在 agent 信念方向一致但噪声大（热性主导）时帮他们理清思路；在 agent 信念极化（结构性主导）时强制反思反而强化对立立场，使 τ 下降。

**分任务一致性**：
- Crisis：结构性 Δτ=−0.100 vs 热性 Δτ=+0.236（差异更大，方向一致）
- Supplier：结构性 Δτ=−0.011 vs 热性 Δτ=+0.040（差异较小，方向一致）

**对照回测（假设2：reduce_weight ↔ 热性无序）**：85 次 reduce_weight 事件，热性主导 Δτ=+0.182 vs 结构性主导 Δτ=+0.067，差值 +0.115。**置换检验 p=0.100（未达0.05），Cohen's d=+0.448**——方向一致但可能是抽样波动，不能称为严格确证。85 事件中仅 18 个结构性主导，样本不均衡拉低检验力。

**代码修正**：已将 `alignmentScore("force_reflection")` 从 `structural` 修正为 `thermal * (1 - structural)`（热性主导且非极化时优先），并同步更新单元测试断言方向。

**局限声明**：
1. **观察性研究，非因果确证**：agent 在不同 F-state 非随机分配，存在混杂（如极化状态可能伴随其他未观测因素）
2. **Δτ 归因不完全**：Δτ 是整轮变化，除 force_reflection 外还受同轮其他干预和自然收敛影响
3. **仅验证了假设1/2**：假设3（introduce_diversity ↔ 虚假共识）和假设4（continue_discussion）未回测——echo chamber 检测器在 mock 测试中难以触发，需真实 LLM 消息数据

### 5.5 A/B 配对对照实验：F 分解排序 vs 固定排序（负面发现）

实验脚本：[experiments/v2/ab_fdecomposition_paired.ts](./experiments/v2/ab_fdecomposition_paired.ts)

**实验设计**：预注册假设 H_F——F 分解排序的 Δτ 显著高于固定排序。配对设计：同 runIndex（相同 seed），A 组（`full`，F 分解排序）vs B 组（`full_fixed`，固定排序 = 检测器触发顺序），仅在排序逻辑上不同。Pilot n=8 配对（Crisis 任务）。

**统计方法**：配对置换检验（符号翻转，10000 perms，(count+1)/(nPerms+1) 修正）+ Cohen's d_z + t 分布 95% CI。双分析：ITT（所有配对）+ per-protocol（仅排序实际改变的配对）。

**结果**（n=8，Crisis 任务，runIndex 0-7）：

| 指标 | ITT（全部 8 配对） | Per-protocol（8/8 排序改变） |
|------|-------------------|---------------------------|
| A 组 τ 均值（F 分解） | 0.6250 | 0.6250 |
| B 组 τ 均值（固定排序） | 0.6750 | 0.6750 |
| 配对差 Δτ_A − Δτ_B | **−0.0500** | **−0.0500** |
| Cohen's d_z | **−0.354** | **−0.354** |
| 配对置换检验 p-value | 0.3781 | 0.3765 |
| 95% CI | [−0.168, +0.068] | [−0.168, +0.068] |

**配对明细**：

| runIndex | τ_A (F 分解) | τ_B (固定) | diff | 排序不同 |
|----------|-------------|-----------|------|---------|
| 0 | 0.600 | 0.600 | 0.000 | 是 |
| 1 | 1.000 | 1.000 | 0.000 | 是 |
| 2 | 0.200 | 0.400 | **−0.200** | 是 |
| 3 | 0.800 | 1.000 | **−0.200** | 是 |
| 4 | 1.000 | 0.800 | **+0.200** | 是 |
| 5 | 0.600 | 0.600 | 0.000 | 是 |
| 6 | 0.400 | 0.400 | 0.000 | 是 |
| 7 | 0.400 | 0.600 | **−0.200** | 是 |

**关键发现**：

1. **H_F 不支持**：F 分解排序在 Crisis 任务上未显著优于固定排序（p=0.3781，d_z=−0.354）。更值得注意的是，**方向反转**——固定排序在配对差均值上略优于 F 分解排序（B−A=+0.050），虽然不显著。

2. **排序确实改变了（per-protocol 排除率 0%）**：8/8 配对中 F 分解改变了干预执行顺序，但**改变排序没有带来改善**。这不是"多检测器并发频率低"的边界条件（§5.2 已验证 91.7% 实验受影响），而是排序逻辑本身的改变未转化为 τ 提升。

3. **异质性**：4 个配对 τ 相同（排序改变但结果不变），3 个配对固定排序更优（diff=−0.2），1 个配对 F 分解更优（diff=+0.2）。方向不一致，说明 F 分解的效果依赖具体 seed 下的系统状态——某些状态下 F 分解选了更差的干预顺序。

**停止扩样决策**：基于预注册决策规则（d_z<0.2 或方向反转则停止），pilot 已显示 d_z=−0.354 且方向反转，扩样到 n=24 无法翻转结论。停止扩样。

**为什么 F 分解排序未改善——三个可能解释**：

1. **排序对最终 τ 的影响有限**：干预顺序影响的是"先做哪个干预"，但 Crisis 任务只有 3 轮，同轮内多个干预都会执行（只是顺序不同）。如果同轮干预集合相同，顺序对最终收敛轨迹影响有限——这解释了 4/8 配对 τ 完全相同。

2. **H1 证伪后的修正引入了新的次优**：force_reflection 修正为 `thermal·(1-structural)` 后，在极化场景（structural 高）会降权 force_reflection，转而优先 reduce_weight。但 §5.4 回测显示 force_reflection 在极化时 Δτ=−0.033（有害），所以降权它应该有益——然而实测 3/8 配对固定排序更优，说明固定排序中 force_reflection 排在后面（同样降权了它），效果类似。

3. **固定排序恰好接近 Crisis 上的最优**：固定顺序是 reduce_weight → introduce_diversity → force_reflection → continue_discussion。Crisis 任务上 authority bias 和 polarization 最常见，所以 reduce_weight 通常先触发，固定排序把 reduce_weight 排第一恰好符合热性主导场景。F 分解在热性主导时也优先 reduce_weight（alignmentScore=thermal），两者重合度高。

**对 F 分解价值的修正定性**：

| 维度 | F 分解贡献 | 证据 |
|------|-----------|------|
| 诊断价值（发现 H1 错误） | ✅ 实质贡献 | §5.4 回测，p=0.041 |
| 统一多检测器优先级（架构） | ✅ 架构合理 | §5.2 91.7% 实验受影响 |
| 提升决策质量（Δτ） | ❌ 未验证 | **§5.5 A/B 对照，d_z=−0.354，方向反转** |

**结论**：F 分解的主要价值是**诊断性**的——它提供了分析框架帮助发现 H1 错误。作为干预优先级排序的运行时机制，在 Crisis 任务上相比固定排序没有显著改善。这本身是有价值的边界条件发现，说明 F 分解的理论优势（按系统状态匹配干预）在 3 轮少次讨论中未转化为实际收益。更长讨论轮次或多任务场景下是否有效，留实验室验证。

**代码变更**（支持 A/B 对照）：
- [src/lib/governance/types.ts](./src/lib/governance/types.ts)：加 `sortingMode?: "fdecomposition" | "fixed"` 配置
- [src/lib/governance/index.ts](./src/lib/governance/index.ts)：加 `rankInterventionsByFixedOrder` 函数 + 分流逻辑
- [experiments/v2/run.ts](./experiments/v2/run.ts)：加 `full_fixed` 消融模式 + `--mode` CLI 参数
- [experiments/v2/ab_fdecomposition_paired.ts](./experiments/v2/ab_fdecomposition_paired.ts)：A/B 配对分析脚本

---

## 6. 与检测器的联合关系

F 分解排序**不替代**检测器，而是**在检测器触发后**对候选干预排序。联合关系：

```
agent 信念状态
     ↓
┌────────────────────────────────────┐
│ 检测器层（识别"症状"）               │
│  echo_chamber / authority_bias /   │
│  polarization / premature_consensus│
└────────────────────────────────────┘
     ↓ 候选干预列表（可能多个）
┌────────────────────────────────────┐
│ F 分解层（识别"病机"并排序）         │
│  R, T, H → F = (1-R) + T·H         │
│  → 按 alignmentScore 排序           │
└────────────────────────────────────┘
     ↓ 排序后的干预列表
┌────────────────────────────────────┐
│ 执行层（按序应用干预）               │
│  force_reflection / reduce_weight /│
│  introduce_diversity / continue    │
└────────────────────────────────────┘
```

**关键区分**：
- 检测器回答"是否出现问题"（是/否 + 严重程度）
- F 分解回答"当前问题的主要病机是什么"（结构性 vs 热性 vs 伪共识）
- 两者正交：同一组症状（如"信念分散"）可能由结构性无序（方向不同步）或热性无序（噪声大）引起，F 分解区分二者并选择不同干预

---

## 7. 局限性与待解决问题

### 7.1 已知局限

| 局限 | 说明 | 状态 |
|------|------|------|
| F 分解权重：假设1已被回测证伪并修正 | 原 `force_reflection↔structural` 被回测证伪（p=0.041），已修正为 `thermal·(1−structural)`；假设2方向支持；假设3/4未回测（§5.4） | 假设3待实验室验证 |
| F 分解无法区分真/假共识 | R·(1−H) 对真共识和虚假共识给相同评分，需 ground truth 或层 3 的 Δτ 反馈区分 | 层 3 解决 |
| F 分解单元测试已修复 | 原"结构性主导"测试空过（if 守卫 + 信念意图不符），已用极化双峰信念重建为非空过测试（§5.1） | ✅ 已修复 |
| 仅 Crisis 任务验证 | Supplier 任务中 F 分解排序的实际影响未分析 | 留实验室 |
| H 的 bins 数固定为 5 | 5 bins 对 5 agent 是经验选择，agent 数变化时未自适应 | 待扩展 |

> **已修复**：T 量纲不一致（原"未归一化到 [0,1]"）——已通过 `normalizeTemperature` 显式归一化（§2.3）。当前 belief∈[-1,1] 下 T 本就在 [0,1]（var≤E[X²]≤1），故此修复是健壮性改进（隐式→显式），非结果偏差修复。

### 7.2 与 project_memory 记录的已知问题

- `introduce_diversity` 已默认禁用（有效率仅 9.1%），但 F 分解仍会为其评分——禁用状态下评分无实际影响，但代码层面存在冗余。层 3 实现后可用在线学习替代硬编码禁用
- `continue_discussion` 已默认禁用（0% 有效率，有害），同理

### 7.3 层 2/3 的开放问题

- 层 2 的 τ₁ 难度代理需验证：是否存在 τ₁ 高但实际困难的任务（虚假共识会使 τ₁ 高估难度）
- 层 2 原设计（F 绝对值调阈值）已推翻，新设计（τ₁ + ΔF 调剂量）的 dosage_scale 函数形式待标定
- 层 3 增量评估需重构 EvaluationEngine，当前接口仅支持批量评估
- 层 3 `effectivenessTable` 的 F-state 离散化方式未定

---

## 8. 文件索引

| 文件 | 作用 |
|------|------|
| [src/lib/utils/statsUtils.ts](./src/lib/utils/statsUtils.ts) | `shannonEntropy` / `normalizeTemperature` / `socialFreeEnergy` 定义 |
| [src/lib/governance/index.ts](./src/lib/governance/index.ts) | `computeKuramotoOrder` / `rankInterventionsByFreeEnergy` / `diagnoseAndIntervene` |
| [src/lib/evaluation/index.ts](./src/lib/evaluation/index.ts) | 评估引擎中的 R / H / F 计算与输出 |
| [test/governance.test.ts](./test/governance.test.ts) | F 分解排序的 2 个单元测试（非空过，见 §5.1） |
| [test/stats-utils.test.ts](./test/stats-utils.test.ts) | `shannonEntropy` / `normalizeTemperature` / `socialFreeEnergy` 的单元测试 |

---

## 9. 总结

社会热力学与系统的联合**当前状态**：

- **理论框架完整但假设需标定**：F = (1−R) + T·H 分解，4 种干预类型与无序分量的映射是**可证伪假设**（§3.1 已显式声明），混合权重系数待实验反推
- **层 1 已实现，验证已修复**：F 分解排序在 91.7% 的 Crisis 实验中实际生效；单元测试空过问题已修复（§5.1），229/229 测试通过
- **层 2 原设计已推翻**：原"F 调阈值"会加剧天花板效应，改为"τ₁ + ΔF 调剂量"的任务难度门控
- **层 3 直击核心盲区**：用 Δτ 在线反馈学到真/假共识区分，替代当前硬编码禁用

这一联合的价值在于：**将"检测器触发→固定顺序干预"的规则式治理，升级为"检测器触发→系统状态诊断→病机匹配干预"的自适应治理**。但必须诚实承认：层 1 的权重是假设而非推导，层 1 无法区分真/假共识，层 2 原设计有逻辑错误已推翻——这些是实验室阶段要解决的真实问题，不是已闭合的成果。

---

## 10. 异步自适应讨论引擎（2026-07-16）

### 10.1 设计动机

同步讨论引擎（DiscussionEngine）要求所有 agent 每轮全员发言，存在三个问题：
1. **不符合真实讨论**：现实中并非所有人每轮都想发言
2. **固定轮次无法适应任务难度**：简单任务浪费 token，复杂任务讨论不足
3. **无法体现信息依赖链**：agent A 发言后，依赖 A 信息的 agent B 才有发言动机

异步引擎（AsyncDiscussionEngine）通过**内容驱动发言**和**热力学自适应终止**解决这些问题。

### 10.2 核心架构

代码位置：[src/lib/discussion/asyncEngine.ts](./src/lib/discussion/asyncEngine.ts)

继承 DiscussionEngine，复用 observeAgents、buildPrompt、applyGovernance、updateBeliefs 等核心逻辑，仅重写主循环：

```
while (totalUtterances < hardCap) {
  1. selectSpeakers()        — 内容驱动选择发言者（非全员）
  2. observeAgents()          — 发言阶段（复用父类）
  3. updateBeliefs()          — 发言者信念更新（复用父类）
  4. updateListenerBeliefs()  — 被动倾听者信念更新（DeGroot 式）  [新增]
  5. applyGovernance()        — 治理干预（复用父类）
  6. 每 K 次发言 → terminationDecider.evaluate(R, T, H)  — 热力学终止评估
}
```

### 10.3 内容驱动发言意愿（v2）

**问题**：v1 的随机概率发言（baseProb=0.5）是"伪异步"——agent 不基于内容决定是否发言，导致关键 agent 沉默、依赖链断裂。

**v2 设计**：agent 根据内部状态计算发言意愿分数：

| 因子 | 权重 | 含义 |
|------|------|------|
| 独有信息曝光度 | ×0.6 | 信息未曝光→有责任分享 |
| 信念变化 | +0.4/>0.3, +0.2/>0.1 | 听到新信息后信念变化→有新观点 |
| 共识偏离 | +0.4/>0.4, +0.2/>0.2 | 与群体意见不同→想反驳 |
| 依赖触发 | +0.3 | 依赖的信息出现了→现在能说了 |
| 刚发过言 | -0.5 | 避免独霸 |

**归一化**：原始分数范围 [-0.5, 1.7]，用 `tanh` 映射到 [0, 1]：
```typescript
return (Math.tanh(w) + 1) / 2;
```

**阈值**（归一化后）：
- ≥ 0.82 → 必须发言（依赖链触发 w=0.9 → 归一化 0.858）
- ∈ [0.40, 0.82) → 加权随机（信息未曝光 w=0.6 → 归一化 0.769）
- < 0.40 → 沉默（刚发过言 w=-0.32 → 归一化 0.345）
- 兜底：所有人沉默时选意愿最高的 1 人

### 10.4 被动倾听信念更新

**问题**：父类 `updateBeliefs` 只更新发言者信念，不发言 agent 信念永不变化。这违背了异步核心——agent 听到别人的话后，即使没发言，内心想法应该变化。

**修复**：DeGroot 式被动倾听更新：
```
delta = learning_rate × Σ(w_ij × (belief_j - belief_i)) / Σ(w_ij)
```
其中 j 遍历本轮发言且在影响图中有边指向 i 的 agent。

**confidence 更新**（v2 新增）：
- 听到的观点与自己一致（同号）→ confidence 微增（被他人确认）
- 听到的观点与自己不一致（异号）→ confidence 微减（被他人质疑）
- 学习率 0.03，远小于 belief 的 0.15

### 10.5 热力学终止决策

代码位置：[src/lib/thermodynamics/TerminationDecider.ts](./src/lib/thermodynamics/TerminationDecider.ts)

**终止优先级**：hard_cap → strong_crystallized → crystallized（连续N次）→ continue

| 判据 | 阈值 | 含义 |
|------|------|------|
| 强结晶态 | H<0.10 且 T<0.10 | 不可逆收敛，立即终止 |
| 普通结晶态 | R>0.85, T<0.20, H<0.35 | 系统冻结，连续2次终止 |
| 淬火态（伪结晶） | R高 + T骤降 + H不低 | 注入多样性干预 |
| 混沌态 | R<0.40, T>0.50, H>0.60 | 注入结构引导干预 |
| 硬上限 | 发言≥40 | 强制终止（未收敛） |

**关键修复**：
- T 骤降检测从绝对值改为方向性（只检测下降，不检测上升）
- crystallR 从 0.75 提高到 0.85（pilot 数据显示 R 始终 >0.87，旧阈值无效）
- 新增强结晶快速终止（避免错过真实收敛点）

### 10.6 确定性 PRNG

异步引擎使用 mulberry32 PRNG（从 discussionConfig.seed 派生），替换所有 Math.random() 调用，保证实验可复现。与 GovernanceEngine 和 DiscussionEngine 保持一致的 PRNG 实现。

### 10.7 实验设计（A/B/C/D 四组对照）

| 组别 | 发言模式 | 终止模式 | 假设 |
|------|---------|---------|------|
| A | 同步全员 | 固定5轮 | 基线 |
| B | 异步 | 固定5轮 | 异步本身是否影响质量 |
| C | 异步 | 热力学自适应 | H_thermo: 热力学终止优于固定轮次 |
| D | 异步 | 随机终止（匹配C分布） | H_diag: 热力学终止优于随机终止 |

C/D 组各跑 v1（random_prob）和 v2（content_driven）两种发言模式，验证异步机制改进。

**D 组匹配分布采样**：D 组的随机终止点从 C 组实际终止分布中采样（按 speakMode 过滤），确保 C/D 对比的唯一差异是终止决策质量，而非讨论总量。

