# 社会热力学：公式参考与代码索引

> 本文档为社会热力学框架的**数学定义、代码位置、架构设计**参考。
> 实验验证和阈值标定结果见 [README_CN.md](./README_CN.md) §异步引擎；局限性见 [LIMITATIONS.md](./LIMITATIONS.md) §22。

---

## 1. 为什么需要社会热力学

4 个检测器（echo chamber / authority bias / polarization / premature consensus）独立触发时，多个干预候选缺乏统一优先级。同一干预在不同系统状态下效果可能相反（如 `force_reflection` 在结构性无序时有效，在热性无序时反而有害）。

社会热力学提供 3 个状态变量作为"系统状态坐标系"：

| 变量 | 物理含义 | 系统含义 |
|------|---------|---------|
| **R**（序参量） | Kuramoto 同步度 | agent 信念方向同步程度 |
| **T**（温度） | 热运动幅度 | 信念分散程度（标准差，归一化） |
| **H**（熵） | 信息无序度 | 信念 bin 分布的不确定性 |

由 Helmholtz 自由能组合：**F = (1−R) + T·H**，其中 (1−R) 是结构性无序，T·H 是热性无序——两个正交的无序来源。

---

## 2. 数学定义与代码实现

### 2.1 Kuramoto 序参量 R

代码：[src/lib/governance/index.ts:532](./src/lib/governance/index.ts#L532)

```
θ = belief × π/2    (belief ∈ [-1,1] → θ ∈ [-π/2, π/2])
R = |Σ e^(iθ_j)| / N
```

**相位映射**（H4 修复）：θ = (π/2)·b 而非 θ = π·b。b=+1→+π/2, b=−1→−π/2——两者在单位圆上正对，R≈0（正确反映极化）。旧映射会使极端值落在同侧误判为共识。

### 2.2 Shannon 熵 H

代码：[src/lib/utils/statsUtils.ts:58](./src/lib/utils/statsUtils.ts#L58)

将 belief ∈ [-1,1] 分 5 bins，计算 H = −Σ p·log₂(p)，除以 log₂(5) 归一化到 [0,1]。H→0=全部同 bin，H→1=均匀分布。

### 2.3 温度 T 的归一化

代码：[src/lib/utils/statsUtils.ts:100](./src/lib/utils/statsUtils.ts#L100)

`normalizeTemperature(std, beliefRange)` 将标准差除以理论上界 (max−min)/2，显式归一化到 [0,1]。当前 belief∈[-1,1] 下数值不变（上界=1.0），但显式化是健壮性需要。

### 2.4 社会自由能 F

代码：[src/lib/utils/statsUtils.ts:110](./src/lib/utils/statsUtils.ts#L110)

```typescript
F = (1 - R) + T * H
//  U = 1-R  → 结构性无序（势能）
//  TS = T*H → 热性无序（耗散）
```

---

## 3. F 分解驱动的干预优先级排序（层 1，已实现）

### 核心映射

| 干预类型 | 对应的无序分量 | 作用机理 |
|---------|--------------|---------|
| `force_reflection` | thermal·(1−structural) | 降噪干预（回测证伪原 structural 假设，p=0.041） |
| `reduce_weight` | T·H（热性无序） | 压制高噪 agent 权重 |
| `introduce_diversity` | R·(1−H) | R 高 H 低→疑似虚假共识，注入多样性 |
| `continue_discussion` | R·(1−H)·(1−F) | 有序+低F+早期→过早收敛（实验证伪，已禁用） |

代码：[src/lib/governance/index.ts:554](./src/lib/governance/index.ts#L554) `rankInterventionsByFreeEnergy()`

调用点：[src/lib/governance/index.ts:877](./src/lib/governance/index.ts#L877)——在 `diagnoseAndIntervene` 返回前排序。

### 关键诚实声明

1. `force_reflection↔structural` 假设已被回测**证伪并修正**（97 次事件，p=0.041）：反思实为降噪干预，非对齐方向干预。已修正为 `thermal·(1−structural)`。
2. `reduce_weight↔thermal` 方向支持但不显著（p=0.100, d=+0.448）。
3. `introduce_diversity` 映射假设未回测，且存在根本盲区：R·(1−H) 无法区分"真共识"与"虚假共识"。
4. `continue_discussion` 已被实验证伪（0% 有效率），默认禁用。

### 层 2/3（实验室，未实现）

- **层 2**：任务难度感知门控——用 τ₁ + ΔF 轨迹调干预剂量（原"F 调阈值"设计已推翻）
- **层 3**：在线干预效果反馈——用 Δτ 经验性学到真/假共识边界，自动降权有害干预

---

## 4. 与检测器的联合关系

检测器识别"症状"（是否出现问题），F 分解识别"病机"（结构性 vs 热性无序），两者正交：

```
agent 信念 → 检测器层（症状） → F 分解层（病机+排序） → 执行层
```

---

## 5. 实验验证现状

| 内容 | 位置 |
|------|------|
| F 分解 A/B 检验（F 排序 vs 固定排序） | [TECHNICAL_REPORT.md](./TECHNICAL_REPORT.md) §5 |
| 权重假设回测（force_reflection 证伪） | [TECHNICAL_REPORT.md](./TECHNICAL_REPORT.md) §4 |
| 异步引擎热力学终止 + 阈值标定 | [README_CN.md](./README_CN.md) §异步引擎 |
| 已知局限 | [LIMITATIONS.md](./LIMITATIONS.md) §19-22 |
| 单元测试（32 个） | [test/governance.test.ts](./test/governance.test.ts) |

---

## 6. 文件索引

| 文件 | 作用 |
|------|------|
| [src/lib/utils/statsUtils.ts](./src/lib/utils/statsUtils.ts) | `shannonEntropy` / `normalizeTemperature` / `socialFreeEnergy` |
| [src/lib/governance/index.ts](./src/lib/governance/index.ts) | `computeKuramotoOrder` / `rankInterventionsByFreeEnergy` |
| [src/lib/evaluation/index.ts](./src/lib/evaluation/index.ts) | 评估引擎中的 R/H/F 计算 |
| [src/lib/thermodynamics/TerminationDecider.ts](./src/lib/thermodynamics/TerminationDecider.ts) | 异步讨论热力学终止决策器 |
| [src/lib/discussion/asyncEngine.ts](./src/lib/discussion/asyncEngine.ts) | 异步引擎中的热力学状态计算与终止循环 |
| [test/governance.test.ts](./test/governance.test.ts) | F 分解排序单元测试 |
| [test/stats-utils.test.ts](./test/stats-utils.test.ts) | 熵/温度/自由能单元测试 |
