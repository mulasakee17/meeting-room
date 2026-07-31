# SwarmAlpha 教授审阅指引

> **文档定位**：为审阅源码的研究者提供高效阅读路径。不重复理论细节，只指路。
> **维护原则**：以诚实无知为荣——所有妥协、技术债务、未验证假设均明确标注。
> **更新日期**：2026-07-31（代码清理与文档校正后）

---

## 目录

1. [项目一句话定位](#1-项目一句话定位)
2. [核心创新点速览](#2-核心创新点速览)
3. [与现有工作的差异](#3-与现有工作的差异)
4. [推荐阅读路径](#4-推荐阅读路径)
5. [系统运行架构图](#5-系统运行架构图)
6. [术语速查表](#6-术语速查表)
7. [理论 → 代码映射表](#7-理论--代码映射表)
8. [实验配置对照表](#8-实验配置对照表e1-e9)
9. [统计方法速查](#9-统计方法速查)
10. [已知技术债务与诚实标注](#10-已知技术债务与诚实标注)
11. [测试覆盖矩阵](#11-测试覆盖矩阵)
12. [可复现性验证清单](#12-可复现性验证清单)

---

## 1. 项目一句话定位

**SwarmAlpha 是一个 LLM 多智能体认知治理研究平台**——让多个 AI agent 像人类委员会一样讨论决策，实时检测集体认知偏差（回声室、极化、权威盲从等），用非破坏性干预改善决策质量。

**v6 核心命题**：将 LLM 作为数学治理引擎手中的语义传感器（不是决策者，是工具），通过确定性 δ 诊断 + 可选 SemanticTool 异步验证实现分层干预。

**一句话类比**：SwarmAlpha 之于多智能体系统，如同 `eslint` 之于 JavaScript——它不创建 agent，它检查 agent 集体决策得好不好。

---

## 2. 核心创新点速览

审阅时请重点关注以下 5 个创新点，每个点都标注了代码位置和可证伪假设。

### 2.1 混合范式治理架构（v6 核心）

将 LLM 作为数学治理引擎手中的语义传感器——**不是决策者，是工具**。确定性 δ 诊断负责 95% 的轮次筛查，仅在异常轮次触发 SemanticTool 异步 LLM 验证。

- **代码**：[computeDelta.ts](../src/lib/thermodynamics/computeDelta.ts) + [SemanticTool.ts](../src/lib/thermodynamics/SemanticTool.ts)
- **可证伪假设**：H9（δ 治理提升 τ）——Pilot A/B 单次验证 Δτ=+0.215，需 Phase 3 全量实验确认
- **诚实标注**：C 组（SemanticTool）链路未实测，仅有 A/B 组数据

### 2.2 LLM 原生认知状态输出（v3.2）

不同于传统 belief scalar，让 LLM 直接输出 5 维认知状态（Utility/Evidence/Confidence），系统只计算 Inertia/Susceptibility。消除"系统反推 belief"的循环论证。

- **代码**：[nativeCognitiveEngine.ts](../src/lib/discussion/nativeCognitiveEngine.ts)
- **可证伪假设**：H1（认知状态比 belief 更稳定）——σ²(ΔB)/σ²(ΔU) Bootstrap CI

### 2.3 双层测量架构（v5）

标量筛查层（RTHF，零成本）→ 向量诊断层（5 维认知状态，根因定位）。95% 轮次无需触发向量层计算。

- **代码**：[MeasurementLayer.ts](../src/lib/thermodynamics/MeasurementLayer.ts)
- **诚实标注**：v6 新路径（MeasurementLayer，基于认知状态向量）已解耦——F=U-T·S 三变量 r=0.274（[THEORY.md §0.1](research/THEORY.md)）。旧 asyncEngine 路径（基于 scalar beliefs）仍耦合 r=-0.96，已 `@deprecated`，仅 fraud 系列向后兼容。

### 2.4 8 个 δ 一致性诊断信号（v6 新增）

检测"自报 vs 行为"矛盾——无需 ground truth，纯可观测信号对比。例如 `δ_confidence_gap` 检测 agent 自报高信心但 U 偏离群体。

- **代码**：[computeDelta.ts](../src/lib/thermodynamics/computeDelta.ts)
- **关键设计**：自适应阈值 `effective = base + (1-minConfidence) × safetyMargin`——置信度越低，阈值越保守

### 2.5 非破坏性干预设计

v2.0 破坏性干预（reduce_weight/force_reflection）导致 Δτ=-0.267。v2.1 改为非破坏性干预（inject_evidence/rebalance_attention），改变信息流而非信念权重。

- **代码**：[cognitiveInterventions.ts](../src/lib/governance/cognitiveInterventions.ts)
- **可证伪假设**：非破坏性干预的因果效应需 Phase 3 验证

---

## 3. 与现有工作的差异

### 3.1 与 MAST（Cemri et al., NeurIPS 2025）的差异

| 维度 | MAST | SwarmAlpha |
|------|------|------------|
| 目标 | 分类 14 种失败模式 | 检测 + 干预 6 种认知偏差 |
| 方法 | 事后标注 1642 条轨迹 | 运行时实时检测 |
| 干预 | 未来工作 | 非破坏性干预（v2.1） |
| 覆盖 | 14 模式 | 3/14 直接对齐（FM-2.4/2.5/2.6） |

### 3.2 与 LumiMAS / AcMAS 的差异

| 维度 | LumiMAS | AcMAS | SwarmAlpha |
|------|---------|-------|------------|
| 架构 | 实时监控框架 | 干预策略研究 | 测量+诊断+干预分层 |
| LLM 角色 | 决策者 | 决策者 | 语义传感器（非决策者） |
| 理论基础 | 工程驱动 | 工程驱动 | FJ 模型 + 社会热力学 |
| 统计方法 | 未明确 | 未明确 | Bootstrap CI + Bonferroni |

### 3.3 独特价值

1. **零额外 LLM 成本**：所有检测基于 agent 已输出的结构化数据
2. **理论可证伪**：6 个 Proposition + 3 个 Conjecture，每个有对应实验
3. **分层架构**：标量筛查（零成本）→ 向量诊断 → δ 一致性 → 干预
4. **诚实标注妥协**：R/T/H 强耦合、F 是加权和、H5/H6/H9 是 Conjecture——不掩饰

---

## 4. 推荐阅读路径

按重要性排序，建议按此顺序阅读。**前 5 个文件是核心**，其余按兴趣查阅。

| 优先级 | 文件 | 行数 | 为什么读 | 阅读重点 |
|--------|------|------|----------|----------|
| **P0** | [THEORY.md](research/THEORY.md) | ~760 | 理论基础与可证伪假设 | §0 v0.3→v0.4 变更、Proposition 1a/1b/1c、诚实标注部分 |
| **P0** | [EXPERIMENT_DESIGN.md](research/EXPERIMENT_DESIGN.md) | ~800 | 实验设计与统计方法 | §6 统计方法、§11 科学战役 E1-E8 |
| **P0** | [nativeCognitiveEngine.ts](../src/lib/discussion/nativeCognitiveEngine.ts) | ~800 | v3.2 核心引擎，LLM 原生认知输出 | 文件头注释（变量分工）、`applyCognitiveGovernance` |
| **P0** | [computeDelta.ts](../src/lib/thermodynamics/computeDelta.ts) | ~660 | 8 个 δ 诊断信号（v6 核心创新） | DEFAULTS、SAFETY_MARGINS、adaptiveThreshold |
| **P0** | [cognitiveDetectors.ts](../src/lib/governance/cognitiveDetectors.ts) | ~540 | 6 个认知偏差检测器 | Echo Chamber（cosine 修复）、Polarization |
| P1 | [cognitiveState.ts](../src/lib/agent/cognitiveState.ts) | ~790 | 5 维认知状态空间定义 | Utility/Evidence/Inertia/Confidence/Susceptibility |
| P1 | [MeasurementLayer.ts](../src/lib/thermodynamics/MeasurementLayer.ts) | ~1490 | 双层测量架构 | RTHF 筛查 → 认知检测器 → δ 诊断 |
| P1 | [run_all.ts](../experiments/campaign/run_all.ts) | ~360 | 实验流水线入口 | 4 阶段：run → analyze → output → summary |
| P2 | [StatisticalTest.ts](../experiments/campaign/pipeline/StatisticalTest.ts) | ~1100 | Bootstrap 检验实现 | 每个 test 的 Bootstrap 逻辑 |
| P2 | [ROADMAP_V6.md](roadmap/ROADMAP_V6.md) | ~1000 | v6 设计与 Pilot 验证 | §3 混合范式架构、Pilot A/B 对照结果 |

**快速判断要不要深读的 3 个问题**：
1. 理论是否可证伪？→ 看 THEORY.md 的 Proposition 与 Conjecture 区分
2. 统计是否严谨？→ 看 §9 统计方法速查
3. 代码是否与理论一致？→ 看 §7 理论→代码映射表

---

## 5. 系统运行架构图

下图展示从实验配置到论文报告的完整数据流。**紫色为 v6 核心创新路径**，灰色为数据流，虚线为每轮循环。

<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 540" width="100%" style="max-width:720px;font-family:sans-serif">
  <defs>
    <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M1 1 L7 4 L1 7 Z" fill="#52525B"/>
    </marker>
    <marker id="arrB" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M1 1 L7 4 L1 7 Z" fill="#4B3FE3"/>
    </marker>
  </defs>

  <rect x="130" y="32" width="180" height="56" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="220" y="56" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">ExperimentConfig</text>
  <text x="220" y="76" text-anchor="middle" font-size="12" fill="#52525B">seeds · mode · scenario</text>

  <rect x="410" y="32" width="180" height="56" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="500" y="56" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">Scenario</text>
  <text x="500" y="76" text-anchor="middle" font-size="12" fill="#52525B">MA · Crisis · ER · Fraud</text>

  <rect x="180" y="128" width="360" height="72" rx="8" fill="#F2F7FF" stroke="#4B3FE3"/>
  <text x="360" y="154" text-anchor="middle" font-size="16" font-weight="500" fill="#1A1759">NativeCognitiveEngine (v3.2)</text>
  <text x="360" y="174" text-anchor="middle" font-size="12" fill="#1A1759">LLM 原生输出 Utility / Evidence / Confidence</text>
  <text x="360" y="190" text-anchor="middle" font-size="12" fill="#1A1759">系统计算 Inertia / Susceptibility / δ</text>

  <rect x="60" y="244" width="600" height="148" rx="12" fill="none" stroke="rgba(23,23,23,0.12)" stroke-width="1.2" stroke-dasharray="6 4"/>
  <text x="76" y="266" font-size="12" fill="#52525B">Per-Round Cycle · 3-5 rounds</text>

  <rect x="92" y="284" width="156" height="76" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="170" y="310" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">1. Observe</text>
  <text x="170" y="330" text-anchor="middle" font-size="12" fill="#52525B">LLM → opinion</text>
  <text x="170" y="346" text-anchor="middle" font-size="12" fill="#52525B">+ itemBeliefs + reasoning</text>

  <rect x="282" y="284" width="156" height="76" rx="8" fill="#EAFBF8" stroke="#27D2BF"/>
  <text x="360" y="310" text-anchor="middle" font-size="16" font-weight="500" fill="#0F766E">2. Govern</text>
  <text x="360" y="330" text-anchor="middle" font-size="12" fill="#0F766E">RTHF 筛查 → 6 检测器</text>
  <text x="360" y="346" text-anchor="middle" font-size="12" fill="#0F766E">→ 8 δ 诊断 → 干预</text>

  <rect x="472" y="284" width="156" height="76" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="550" y="310" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">3. Update</text>
  <text x="550" y="330" text-anchor="middle" font-size="12" fill="#52525B">U / E / I / C 状态更新</text>
  <text x="550" y="346" text-anchor="middle" font-size="12" fill="#52525B">+ pendingModifications</text>

  <path d="M 550 360 Q 550 396 360 396 Q 170 396 170 360" stroke="#4B3FE3" stroke-width="1.4" fill="none" stroke-dasharray="5 4" stroke-linecap="round" marker-end="url(#arrB)"/>
  <text x="360" y="412" text-anchor="middle" font-size="12" fill="#4B3FE3">next round</text>

  <rect x="60" y="448" width="140" height="56" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="130" y="472" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">RawRunData</text>
  <text x="130" y="490" text-anchor="middle" font-size="12" fill="#52525B">trajectory + interventions</text>

  <rect x="220" y="448" width="140" height="56" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="290" y="472" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">MetricComputer</text>
  <text x="290" y="490" text-anchor="middle" font-size="12" fill="#52525B">E1-E9 指标</text>

  <rect x="380" y="448" width="140" height="56" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="450" y="472" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">StatisticalTest</text>
  <text x="450" y="490" text-anchor="middle" font-size="12" fill="#52525B">Bootstrap CI + p</text>

  <rect x="540" y="448" width="140" height="56" rx="8" fill="#F7F7F8" stroke="rgba(23,23,23,0.12)"/>
  <text x="610" y="472" text-anchor="middle" font-size="16" font-weight="500" fill="#171717">Report</text>
  <text x="610" y="490" text-anchor="middle" font-size="12" fill="#52525B">MD + LaTeX + 图表</text>

  <path d="M 220 88 L 300 128" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 500 88 L 420 128" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 360 200 L 360 244" stroke="#4B3FE3" stroke-width="1.8" fill="none" marker-end="url(#arrB)"/>

  <path d="M 248 322 L 282 322" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 438 322 L 472 322" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>

  <path d="M 360 392 L 360 420 Q 360 432 200 440 L 130 448" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 200 476 L 220 476" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 360 476 L 380 476" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 520 476 L 540 476" stroke="#52525B" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>

  <g transform="translate(60, 524)">
    <circle cx="6" cy="0" r="4" fill="#4B3FE3"/>
    <text x="16" y="4" font-size="12" fill="#52525B">主路径</text>
    <circle cx="80" cy="0" r="4" fill="#52525B"/>
    <text x="90" y="4" font-size="12" fill="#52525B">数据流</text>
    <rect x="148" y="-4" width="14" height="2" fill="none" stroke="#4B3FE3" stroke-width="1.4" stroke-dasharray="4 3"/>
    <text x="168" y="4" font-size="12" fill="#52525B">循环</text>
  </g>
</svg>

</div>

**三层架构解读**：
- **入口层**（灰）：`ExperimentConfig` 定义 seeds/mode/scenario，驱动 `NativeCognitiveEngine`
- **引擎层**（紫，核心创新）：LLM 原生输出 5 维认知状态，系统每轮执行 Observe → Govern → Update 三步循环
- **治理层**（青，v6 创新）：RTHF 筛查 → 6 认知检测器 → 8 δ 诊断 → 干预
- **分析层**（灰）：`RawRunData` → `MetricComputer` → `StatisticalTest` → 论文报告

---

## 6. 术语速查表

审阅源码时遇到的缩写，按类别分组。

### 6.1 认知状态变量（5 维）

| 符号 | 全称 | 含义 | 取值 | 代码位置 |
|------|------|------|------|----------|
| `U` | Utility | 效用向量（偏好结构） | `[-1,1]^K` | `cognitiveState.utility.scores` |
| `E` | Evidence | 信息状态（覆盖度/质量/多样性） | `[0,1]` 各分量 | `cognitiveState.evidence` |
| `I` / `ι` | Inertia | 认知惯性（改变阻力） | `[0,1]` | `cognitiveState.inertia.estimate` |
| `C` | Confidence | 信心（自报+行为稳定性） | `[0,1]` | `cognitiveState.confidence.estimate` |
| `Λ` | Susceptibility | 易感性（暴露后响应概率） | `[0,1]` | `cognitiveState.susceptibility.estimate` |

### 6.2 热力学信号（4 维，标量筛查层）

| 符号 | 全称 | 含义 | 代码位置 |
|------|------|------|----------|
| `R` | Resultant vector length | 方向对齐度（群体一致性） | `ThermoState.R` |
| `T` | Intensity dispersion | 强度分散度 | `ThermoState.T` |
| `H` | Distribution shape | 分布形状（熵） | `ThermoState.H` |
| `F` | Disorder index | 操作化综合失序指标 | `ThermoState.F` |

> **诚实标注**：v6 新路径（MeasurementLayer，基于认知状态向量）F=U-T·S 已解耦（r=0.274）。旧 asyncEngine 路径（scalar beliefs）仍耦合 r=-0.96，已 `@deprecated`。见 [THEORY.md §0.1](research/THEORY.md)。

### 6.3 δ 诊断信号（8 维，v6 核心创新）

| δ 名称 | 检测什么 | 触发条件 | 代码位置 |
|---------|----------|----------|----------|
| `δ_polarization` | U 向量分化严重 | pairwise cosine dist ≥ 0.15 | `computeDeltaPolarization` |
| `δ_1d_mask` | 标量共识掩盖向量分歧 | R × meanDist ≥ 0.40 | `computeDelta1DMask` |
| `δ_evidence_silence` | 证据被系统性忽视 | min/mean < 0.50 | `computeDeltaEvidenceSilence` |
| `δ_confidence_gap` | 自报信心与 U 位置矛盾 | stated>0.8 且 dist>0.5 | `computeDeltaConfidenceGap` |
| `δ_stance_flip` | topChoice 翻转 | ≥2 人同时翻转 | `computeDeltaStanceFlip` |
| `δ_no_response` | 干预后无响应 | 暴露≥1 但未响应 | `computeDeltaNoResponse` |
| `δ_concentration` | 惯性集中在少数 agent | — | `computeDeltaConcentration` |
| `δ_consistency` | 立场变化与惯性矛盾 | — | `computeDeltaConsistency` |

### 6.4 检测器（6 个，认知偏差层）

| 检测器 | 检测什么 | 代码位置 |
|--------|----------|----------|
| Echo Chamber | 回声室（效用方向趋同） | `cognitiveDetectors.ts` cosine 相似度 |
| Polarization | 极化（效用向量分化） | `cognitiveDetectors.ts` pairwise cosine 距离 |
| Authority Bias | 权威盲从 | `cognitiveDetectors.ts` 惯性集中度 |
| Premature Consensus | 过早共识 | `cognitiveDetectors.ts` beliefDispersion |
| Evidence Imbalance | 证据覆盖度不均衡 | `cognitiveDetectors.ts` 基尼系数 |
| Cognitive Action Mismatch | 推理偏好与排名行动不一致 | `cognitiveDetectors.ts` topChoice 对比 |

### 6.5 实验缩写

| 缩写 | 全称 |
|------|------|
| `RTHF` | R, T, H, F 四个热力学信号 |
| `FJ` | Friedkin-Johnsen 信念更新模型 |
| `Bootstrap CI` | Bootstrap 置信区间 |
| `A/B/C/D 组` | E9_V6 实验的 4 个条件（无治理/δ治理/δ+语义/对照） |

---

## 7. 理论 → 代码映射表

审阅时验证"代码是否与理论一致"的核心对照表。

### 7.1 理论模型 → 代码位置

| 理论概念 | 理论文档 | 代码实现 | 验证要点 |
|----------|----------|----------|----------|
| Friedkin-Johnsen 更新 | THEORY.md §1 | `discussion/index.ts:updateBeliefs` | `b(t+1)=α·b_group+(1-α)·b(0)` |
| 认知状态空间（5 维） | THEORY.md §2 | `cognitiveState.ts` | U/E/I/C/Λ 定义与取值范围 |
| 热力学筛查（RTHF） | THEORY.md §3 | `MeasurementLayer.ts:computeThermoState` | R/T/H/F 计算公式 |
| δ 一致性诊断 | ROADMAP_V6 §3 | `computeDelta.ts` | 8 个 δ 的自适应阈值 |
| 认知检测器 | THEORY.md §4 | `cognitiveDetectors.ts` | 6 检测器逻辑 |
| 干预策略 | GOVERNANCE_DESIGN.md | `cognitiveInterventions.ts` | inject_evidence / rebalance_attention |
| Progressive 估计 | THEORY.md §5 | `ProgressiveEstimator.ts` | I/C/Λ 的渐进融合 |

### 7.2 可证伪假设 → 检验代码

| 假设 | 类型 | 检验代码 | 统计方法 |
|------|------|----------|----------|
| H1: 认知状态比 belief 更稳定 | Proposition | `MetricComputer.ts:computeE1Stability` | σ²(ΔB)/σ²(ΔU) Bootstrap CI |
| H2: Evidence 增加解释力 | Proposition | `computeE2Evidence` | ΔR² Bootstrap |
| H4: Confidence 预测 ΔU | Proposition | `computeE4Confidence` | 回归 β₁ Bootstrap CI |
| H5: 治理通过 Evidence→Utility 中介 | Conjecture | `computeE5Governance` | Granger + Bootstrap 中介 |
| H6: 5 维状态解耦 | Conjecture | `computeE6Decoupling` | VIF + 条件数 |
| H9: δ 治理提升 τ | Conjecture | `computeE9CognitiveGovernance` | per-run τ Bootstrap |

> **诚实标注**：H5、H6、H9 是 Conjecture（经验猜想），需 Phase 3 全量实验确认。Pilot A/B 单次验证 Δτ=+0.215，但样本量不足。

---

## 8. 实验配置对照表（E1-E9）

一表速览所有实验。详细设计见 [EXPERIMENT_DESIGN.md §11](research/EXPERIMENT_DESIGN.md)。

| ID | 假设 | 核心问题 | 配置文件 | 当前 runs | 目标 runs |
|----|------|----------|----------|-----------|-----------|
| E1_stability | H1 | 认知状态 vs belief 稳定性 | `e1_stability.ts` | 1 | 30 |
| E1_native | H1 | LLM 原生输出验证 | `e1_native.ts` | 0 | 30 |
| E1_native_lite | H1 | 信号方向验证（精简版） | `e1_native_lite.ts` | 6 | 6 ✅ |
| E2_evidence | H2 | Evidence 解释力 | `e2_evidence.ts` | 0 | 30 |
| E3_inertia | H3 | Inertia → Authority 预测 | `e3_inertia.ts` | 0 | 30 |
| E4_confidence | H4 | Confidence 预测 ΔU | `e4_confidence.ts` | 0 | 30 |
| E5_governance | H5 | 治理中介机制 | `e5_governance.ts` | 0 | 30 |
| E6_decoupling | H6 | 5 维状态解耦 | `e6_decoupling.ts` | 0 | 30 |
| E7_detector | H7 | 检测器准确性 | `e7_detector.ts` | 0 | 30 |
| E8_susceptibility | H8 | Susceptibility 中介 | `e8_susceptibility.ts` | 0 | 30 |
| E9_smoke | — | 链路打通验证 | `e9_cognitive_governance.ts` | 6 | 6 ✅ |
| E9_medium | H9 | 中规模验证 | `e9_cognitive_governance.ts` | 6 | 50 |
| E9_V6_A_none | H9 | 无治理对照 | `e9_cognitive_governance.ts` | 0 | 50 |
| E9_V6_B_delta | H9 | δ 治理 | `e9_cognitive_governance.ts` | 0 | 50 |
| E9_V6_C_semantic | H9 | δ + SemanticTool | `e9_cognitive_governance.ts` | 0 | 50 |
| E9_V6_D_OLD | H9 | 基线对照 | `e9_cognitive_governance.ts` | 0 | 50 |

> **状态**：截至 2026-07-31，仅 E1_native_lite（6 runs）和 E9_smoke（6 runs，3 seeds × 2 modes）完成。大规模实验尚未启动。

---

## 9. 统计方法速查

项目的硬约束（见 `project_memory.md`）：
- **p-value 必须 Bootstrap 计算**，禁止硬编码
- **CI 显著性判定**：两端同号（不可跨零）
- **Granger 因果检验**：Bonferroni 校正多重比较
- **Fisher z-test**：per-run 独立 Bootstrap，禁止全局聚合

### 9.1 检验实现位置

`StatisticalTest.ts` 实际导出的函数：`bootstrapCI`、`permutationTest`、`cohensD`、`holmBonferroni`、`tDistributionCriticalValue`、`runTests`。各实验 E1-E9 的检验逻辑内联在私有 `testE1`…`testE9` 中，由 `runTests` 分发。

| 检验类型 | 文件 | 关键函数 / 位置 | Bootstrap 样本数 |
|----------|------|----------|------------------|
| 均值差异 Bootstrap CI | `StatisticalTest.ts` | `bootstrapCI`（默认 nBoot=5000） | 5000 |
| 置换检验 | `StatisticalTest.ts` | `permutationTest`（E1/E9 使用） | 10000 |
| 中介效应 Bootstrap | `MetricComputer.ts` | `bootstrapMediation`（私有，E8 使用） | 5000 |
| Granger 因果（Bonferroni） | `StatisticalTest.ts:testE5` | 内联 per-series F + Bonferroni 合并 p | per-series |
| Fisher z（per-run） | `StatisticalTest.ts:testE6` | 内联 per-run Bootstrap CI | per-run |
| Holm-Bonferroni 校正 | `StatisticalTest.ts` | `holmBonferroni` | — |

### 9.2 CI 显著性判定规则

```typescript
// 正确：两端同号才显著（不跨零）
const significant = (ciLower > 0 && ciUpper > 0) || (ciLower < 0 && ciUpper < 0);

// 错误（已修复）：XOR 逻辑会误判跨零区间为显著
// const significant = (ciLower > 0) !== (ciUpper > 0);  // ❌ 已删除
```

---

## 10. 已知技术债务与诚实标注

**以诚实无知为荣**——以下妥协和未完成项明确列出，不掩饰。

### 10.1 理论层妥协

| 项目 | 现状 | 风险 | 代码位置 |
|------|------|------|----------|
| 旧路径 R/T/H 强耦合 | asyncEngine 路径 r(R,T)=-0.96，已 `@deprecated` | 仅 fraud 系列受影响，v6 不用 | `asyncEngine.ts` |
| F 公式已修正 | v6 新路径 F=U-T·S，三变量解耦 r=0.274 | 已解决，无风险 | `MeasurementLayer.ts:240-251` |
| H5/H6/H9 是 Conjecture | 未全量验证 | 可能不成立 | THEORY.md |

### 10.2 代码层技术债务

| 项目 | 现状 | 位置 | 影响 |
|------|------|------|------|
| `runtime/types.ts` 死类型 | 496 行中仅 3 个类型在用 | `src/lib/runtime/types.ts` | 阅读干扰，已加文档标注 |
| `@deprecated` 字段 | Inertia/Confidence 有旧字段 | `cognitiveState.ts` | 向后兼容，不影响新实验 |
| SemanticTool C 组未验证 | 链路存在但无实测数据 | `SemanticTool.ts` | C 组实验可能暴露 bug |

### 10.3 已修复的关键 bug（2026-07-31）

| Bug | 影响 | 修复 |
|-----|------|------|
| Echo Chamber Jaccard 误用 | 相反立场被误判为回声室 | 改用 cosine 相似度 |
| E8 CI 显著性 XOR 逻辑 | 跨零区间误判为显著 | 改为同号判定 |
| E4 硬编码 p-value | 统计无效 | 改用 Bootstrap |
| E5 Granger df2 错误 | p-value 计算错误 | Bonferroni 校正 |
| E6 Fisher z 全局聚合 | 违反独立性假设 | per-run Bootstrap |
| loadExperimentData 重复加载 | `_phase31` 文件污染数据 | runId 去重 |
| LLM provider 子串匹配 | claude/glm 误分类为 deepseek | `detectLLMProvider` 精确匹配 |
| applyInterventions 无错误隔离 | 单个异常中断所有干预 | try-catch 隔离 |
| testE1 空数据假阳性 | ratios=[] 置换循环空转导致 pValue≈0 | n<2 守卫返回 pValue=1 |
| testE4 CI 单边判定 | ciLower>0 误判跨零区间为显著 | 同号判定 (ciLower>0)===(ciUpper>0)&&ciLower!==0 |
| mean([]) 返回 0 | 对照组数据缺失导致假阳性 deltaTau | 空数据守卫返回 NaN |
| CLI 不支持 --key=value | 教授复现命令需手动拆分参数 | 预处理拆分为 --key value |

---

## 11. 测试覆盖矩阵

28 个测试文件，630 tests passed（3 skipped，截至 2026-07-31）。

### 11.1 核心模块测试

| 模块 | 测试文件 | 测试数 | 覆盖重点 |
|------|----------|--------|----------|
| 统计检验 | `statistical-test-significance.test.ts` | 13 | Bootstrap CI、跨零判定、Bonferroni |
| 认知检测器 | `cognitive-detectors.test.ts` | 45 | Echo Chamber cosine、Polarization |
| δ 诊断 | `delta-diagnosis.test.ts` | 52 | 8 个 δ 的触发条件 |
| 认知状态 | `cognitive-state.test.ts` | 35 | 5 维变量更新规则 |
| 治理运行时 | `governance.test.ts` | 34 | applyInterventions 错误隔离 |
| LLM providers | `llm-providers.test.ts` | 9 | detectLLMProvider 分类 |

### 11.2 未覆盖的模块（诚实标注）

| 模块 | 风险 | 原因 |
|------|------|------|
| SemanticTool | C 组实验未跑 | 无实测数据 |
| FigureGenerator | 图表生成失败不影响结论 | 纯可视化 |
| ReportGenerator | 报告生成失败不影响结论 | 纯文档 |

---

## 12. 可复现性验证清单

### 12.1 运行测试

```bash
# 全量测试（28 文件，630 tests passed + 3 skipped）
npx vitest run

# 类型检查
npx tsc --noEmit
```

### 12.2 跑一次 smoke 实验

```bash
# 最小验证（1 seed，~5 分钟，~25 LLM 调用）
npx tsx experiments/campaign/run_all.ts --experiment=e9_v6_a_none --seeds=42
```

### 12.3 检查输出

- `experiments/campaign/output/<exp_id>/raw/*.json` — 原始数据
- `experiments/campaign/output/<exp_id>/metrics.json` — 计算指标
- `experiments/campaign/output/<exp_id>/tests.json` — 统计检验结果
- `experiments/campaign/output/campaign_summary.json` — 战役汇总

### 12.4 随机种子

所有实验使用 `mulberry32` PRNG（[statsUtils.ts](../src/lib/utils/statsUtils.ts)），种子在 `ExperimentConfig.seeds` 中显式指定。同一种子下结果可复现。

---

## 附录：文档导航

| 文档 | 定位 | 何时读 |
|------|------|--------|
| [THEORY.md](research/THEORY.md) | 理论基础 | 判断学术价值时 |
| [EXPERIMENT_DESIGN.md](research/EXPERIMENT_DESIGN.md) | 实验设计 | 判断实验严谨性时 |
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | 系统架构 | 深入理解模块依赖时 |
| [CODE_MAP.md](architecture/CODE_MAP.md) | 代码地图 | 定位具体文件时 |
| [ROADMAP_V6.md](roadmap/ROADMAP_V6.md) | 路线图与进度 | 了解开发历史时 |
| [SOT.md](SOT.md) | 单一真相源 | 核对数字时 |
| [PAPER_DRAFT.md](paper/PAPER_DRAFT.md) | 论文草稿 | 看叙事结构时 |
| [LIMITATIONS.md](paper/LIMITATIONS.md) | 局限性 | 看诚实标注时 |

---

*本文档由 SwarmAlpha 项目维护，遵循"以诚实无知为荣"原则。如有疑问，请直接对照源码验证。*
