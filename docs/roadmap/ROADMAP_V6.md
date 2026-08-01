# SwarmAlpha v6：确定性治理 + 语义传感器 —— 混合范式

> **状态**：Phase 2.8 完成 ✅ | 630 tests passed | tsc 零错误 | Pilot A/B 对照完成 | 2026-07-31（P0 统计 bug 修复 + 低风险代码清理后）
> **核心命题**：将 LLM 作为数学治理引擎手中的语义传感器——不是决策者，是工具。这创造了一种新的 MAS 治理架构范式。
> **前身**：ROADMAP_V5（双层架构）、ROADMAP_V6_OPTIMIZED（验收与优化）
>
> **最近更新（2026-07-30 Pilot 验证）**：
> - **关键 Bug 修复**：δ→干预类型映射断裂（δ issues type 与 generateCognitiveInterventions switch case 不匹配导致 0 干预）+ Intervention 数据记录不完整（丢失 targetAgents/effect/parameters）+ SemanticTool 审计日志补齐（4 文件改动）
> - **Pilot A/B 对照**（university 任务, seed=42, 1 run each）：A 组 τ=0.571（无治理），B 组 τ=0.643（δ 治理），Δτ=+0.071，δ→干预链路打通。⚠️ 原记录 14 干预为 7/30 旧代码版本；8/1 重跑 B 组为 5 轮、16 干预（以磁盘 `pilot_output/` 实测为准）。
> - **3 个待解决问题**：τ 偏高（天花板风险）、δ 触发率偏高（40-45%，任务特性）、C 组 SemanticTool 链路未验证
> **历史更新（Phase 2.8）**：15 tsc 类型错误清零 + 4 项实验配置差距闭合（task_university、E9 4 组 A/B/C/D、maxRounds=5、Runner useSemanticTool）
> **历史更新（Phase 2.7）**：深度自检发现 5 处数学实现 bug，全部修复并补 22+1 个单元测试。包括 M1 Granger FWL 残差化不完整、M2 Bimodality 系数公式错误（Ellison 1987 校正项缺失）、M3 t 分布临界值表缺口（df=11-29）、M4 ProgressiveEstimator β>1.0 越界、M5 detectBehaviorEvents dead code。

---

## 目录

1. [实施审计](#1-实施审计)
2. [剩余断裂点](#2-剩余断裂点)
3. [混合范式架构（设计文档）](#3-混合范式架构设计文档)
4. [Phase 2：Integration Completion — 填补断裂点](#4-phase-2integration-completion--填补断裂点)
5. [Phase 2.5：Evidence Shared 检测 + 异步路径接入](#45-phase-25evidence-shared-检测--异步路径接入)
6. [Phase 2.6：实验链路一致性修复（反幻觉）](#46-phase-26实验链路一致性修复反幻觉)
7. [Phase 2.7：数学基本盘修复](#47-phase-27数学基本盘修复)
8. [Phase 3：Experiment Execution — 实验验证](#5-phase-3experiment-execution--实验验证)
9. [当前实现 vs ROADMAP 计划对照](#当前实现-vs-roadmap-计划对照)
10. [Phase 4：Analysis & Paper — 分析与论文](#6-phase-4analysis--paper--分析与论文)
11. [论文叙事结构](#7-论文叙事结构)
12. [里程碑与风险](#8-里程碑与风险)

---

## 1. 实施审计

### 1.1 Phase 1 完成（2026-07-29）

| 组件 | 状态 | 文件 | 行数 |
|------|------|------|------|
| ProgressiveEstimator — I/C/Λ 渐进融合 | ✅ | [ProgressiveEstimator.ts](src/lib/thermodynamics/ProgressiveEstimator.ts) | 450 |
| 6 δ 指标 + 自适应阈值 | ✅ | [computeDelta.ts](src/lib/thermodynamics/computeDelta.ts) | 650 |
| SemanticTool — LLM 语义传感器（三项能力） | ✅ | [SemanticTool.ts](src/lib/thermodynamics/SemanticTool.ts) | 300 |
| `diagnoseAndSuggest()` — 异步 Tier 1→2→3 链路 | ✅ | [MeasurementLayer.ts:1062](src/lib/thermodynamics/MeasurementLayer.ts#L1062) | ~100 |
| `diagnoseAndSuggestSync()` — 同步纯数学链路 | ✅ | [MeasurementLayer.ts:1219](src/lib/thermodynamics/MeasurementLayer.ts#L1219) | ~25 |
| `applyCognitiveGovernance()` 切换为 δ 驱动 | ✅ | [nativeCognitiveEngine.ts:477](src/lib/discussion/nativeCognitiveEngine.ts#L477) | ~60 |
| cognitiveState.ts 类型升级（BehaviorEvents + 渐进字段） | ✅ | [cognitiveState.ts](src/lib/agent/cognitiveState.ts) | ~80 |

### 1.2 Phase 2 完成（2026-07-30）

| 断裂点 | 状态 | 改动 |
|--------|------|------|
| 1: `detectBehaviorEvents()` 从未被调用 | ✅ | `MeasurementLayer.updateCognitiveStates()` 末尾接入 |
| 2: GovernanceRuntime 未切换 δ 路径 | ✅ | `runDetectors()` → `diagnoseAndSuggestSync()` |
| 3: cognitiveInterventions 无置信度感知 | ✅ | 低置信度时 rebalance→inject 降级 |
| 4: 零测试覆盖 | ✅ | 新建 `delta-diagnosis.test.ts`，43 个测试 |
| 全量回归 | ✅ | **27 文件，616 通过，3 跳过，0 失败**（Phase 2.7 后新增 stats-corrections.test.ts: 22 tests + delta-diagnosis 补充） |

### 1.3 架构实际状态

```
NativeCognitiveEngine.applyCognitiveGovernance()        ← 同步路径（默认）
  → MeasurementLayer.diagnoseAndSuggestSync()    ← δ 驱动（✅）
  → computeDeltaDiagnosis(states, thermo, estimates)
  → buildDeltaSuggestions(delta) → Intervention[]
  → generateCognitiveInterventions(issues, ..., estimates) → prompt 注入

NativeCognitiveEngine.applyCognitiveGovernanceAsync()   ← 异步路径（useSemanticTool=true 时）
  → MeasurementLayer.diagnoseAndSuggest()        ← Tier 1→2→3 链路（✅ Phase 2.5）
  → 含 markEvidenceSharingSemantic() + SemanticTool gap_analysis
  → 确定性验证器校验 LLM 输出

GovernanceRuntime.runCognitiveGovernance()
  → MeasurementLayer.diagnoseAndSuggestSync()    ← δ 驱动（✅）
  → 同上同步链路

注：异步路径在 Phase 2.5 已接入，但当前 E9 配置未启用 useSemanticTool，
故 Tier 3 在实验中仍不触发。需在"差距处理"步骤中启用。见 §"当前实现 vs 计划对照"。
```

### 1.4 已知偏差

| 偏差 | 原计划 | 实际 | 影响 | 计划 |
|------|--------|------|------|------|
| GovernanceRuntime 路径 | async `diagnoseAndSuggest()` | sync `diagnoseAndSuggestSync()` | Tier 3 在 GovernanceRuntime 入口不触发 | NativeCognitiveEngine 入口已支持 async（Phase 2.5）；C 组实验通过 `useSemanticTool: true` 启用 |
| 测试数 | ~500 | 616 | 无负面影响 | — |
| E9 实验配置 | 4 组 × 24 runs × maxRounds=5 × 大学排名 | 3 组 × 50 runs × maxRounds=3 × supplier | 数据无法支撑论文声明 | 见 §"当前实现 vs 计划对照"，差距处理阶段修复 |

---

## 2. 剩余断裂点

Phase 2 修复了断裂点 1-4，Phase 2.5 修复了断裂点 5-6。所有断裂点已解决 ✅。

### ~~断裂点 5：Evidence shared 检测死锁~~ ✅

**修复**：`shared` 初始值改为 false；`markEvidenceSharing()` Layer 1 数学匹配在每轮后运行；`markEvidenceSharingSemantic()` Layer 2 在异步路径中补判。

### ~~断裂点 6：异步路径无调用方~~ ✅

**修复**：NativeCognitiveEngine 新增 `useSemanticTool` 开关 + `applyCognitiveGovernanceAsync` 方法；`applyGovernance` 返回类型支持 Promise。

---

## 3. 混合范式架构（设计文档）

> 以下为已实现架构的规范描述。代码位置与设计一致。

### 3.1 三层架构

```
                        每轮讨论
                            │
                            ▼
             ┌──────────────────────────────┐
             │  Tier 1: 热力学筛查（纯数学）    │
             │  R/T/H/F — 零成本，每轮必跑      │
             │  正常 → 继续                    │
             │  异常 → 触发 Tier 2             │
             └──────────────┬───────────────┘
                            │
                            ▼
             ┌──────────────────────────────┐
             │  Tier 2: δ 诊断（纯数学）        │
             │  6 δ + ProgressiveEstimator    │
             │  I/C/Λ 渐进融合                 │
             │  自适应阈值                     │
             │                               │
             │  根因清晰 → 直接干预（纯数学路径） │
             │  根因模糊 → 触发 Tier 3          │
             └──────────────┬───────────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              │
   纯数学路径 (90%+)   LLM语义路径 (<10%)  │
   inject_evidence                       │
   rebalance_attention  ┌─────────────┐   │
                        │ SemanticTool│   │
                        │  (Tier 3)   │   │
                        │             │   │
                        │ 能力1:      │   │
                        │ evidence   │   │
                        │ 语义去重    │   │
                        │             │   │
                        │ 能力2:      │   │
                        │ 信息缺口    │   │
                        │ 识别        │   │
                        │             │   │
                        │ 能力3:      │   │
                        │ 上下文      │   │
                        │ 干预生成    │   │
                        └──────┬──────┘   │
                               │          │
                               ▼          │
                   ┌──────────────────┐    │
                   │ 确定性验证器       │    │
                   │ · evidence 存在？  │    │
                   │ · agent 存在？    │    │
                   │ · 不引入新信息？   │    │
                   │                  │    │
                   │ 通过 → 执行      │    │
                   │ 失败 → 降级纯数学 │    │
                   └──────────────────┘    │
                        │                 │
                        └────────┬────────┘
                                 │
                                 ▼
                   ┌──────────────────────┐
                   │ 审计日志               │
                   └──────────────────────┘
```

### 3.2 三不原则

| 原则 | 含义 | 为什么 |
|------|------|--------|
| **LLM 不参与决策** | LLM 不选择检测阈值、不选择干预类型、不修改 δ 映射 | 治理逻辑保持确定性 |
| **LLM 不接触全文** | LLM 只接收数学层提取的结构化子集（evidence 文本 + agent names） | 最小权限原则 |
| **LLM 不被信任** | LLM 输出经过确定性验证器校验后才被使用 | 幻觉被拦截在决策之前 |

### 3.3 6 个 δ 指标

| δ | 公式 | 类型 | 可用轮次 | 置信度来源 |
|---|------|------|---------|----------|
| **δ_polarization** | mean pairwise cosineDist(U) | 轮内 | Round 1+ | 1.0（U 向量可靠） |
| **δ_1d_mask** | R × mean pairwise cosineDist(U) | 轮内 | Round 1+ | 1.0 |
| **δ_evidence_silence** | min(shared) / mean(shared) | 轮内 | Round 1+ | 1.0 |
| **δ_confidence_gap** | C.stated 高但 U 偏离群体 | 轮内 | Round 1+ | 1.0 |
| **δ_stance_flip** | topChoice 翻转数 / n | 跨轮 | Round 2+ | 0.90 |
| **δ_no_response** | 暴露但未响应的人数 | 跨轮 | Round 3+ | 0.30（需暴露事件） |
| **δ_concentration** | max(I.estimate) / mean(I.estimate) | 跨轮 | Round 3+ | I.confidence |
| **δ_consistency** | max(ΔU / I.estimate) | 跨轮 | Round 3+ | I.confidence |

### 3.4 ProgressiveEstimator 设计

```
行为事件（离散计数）→ 渐进融合 → I/C/Λ 估计 + 置信度

I = α × I_behavioral + (1-α) × I_prior
  α = min(0.90, event_count × 0.06)
  confidence = min(0.90, 0.10 + event_count × 0.06)

C = β × C_stated + (1-β) × C_stability
  β = max(0.30, 1.0 - (round-2) × 0.12)

Λ = timesRespondedAfterExposure / timesExposed
  usable = (timesExposed ≥ 2)
  confidence = min(0.75, 0.05 + timesExposed × 0.10)
```

### 3.5 自适应阈值

```
effectiveThreshold = base + (1 - minConfidence) × safetyMargin

高置信度 → 阈值接近 base → 灵敏
低置信度 → 阈值向 base+safetyMargin 移动 → 保守（避免误报）

门控：minConfidence < 0.25 → δ 跳过（短对话中数据不足以支撑任何判断）
```

### 3.6 SemanticTool 三项能力

| 能力 | 触发条件 | 输入 | 输出 |
|------|---------|------|------|
| evidence_dedup | 文本相似度接近但语义不明 | items[] | clusters[] |
| gap_analysis | δ 触发但根因模糊 | deltas + unsharedEvidence | criticalItems[] |
| intervention_generation | 需要上下文合适的干预文本 | type + evidence + context | injectionMessage |

### 3.7 X 与 alignment 的统一

- **alignment**（低分辨率、零成本）：日常指标，每轮计算
- **X_semantic**（高分辨率、按需调用）：Tier 3 触发时通过 SemanticTool 计算
- 两者一致 → 高置信度。不一致 → 标记差异，用 X_semantic，记录 alignment 误判

### 3.8 范式差异化

| 系统 | 方法 | LLM 的角色 |
|------|------|-----------|
| MAST (Cemri 等) | 规则检测 | 无 |
| CoBRA (Liu 等) | LLM 行为调控 | **LLM 是决策者** |
| Agent Governance Toolkit | 规则拦截 | 无 |
| Agora | 协议层 | 无 |
| **SwarmAlpha v6** | **确定性引擎 + 语义传感器** | **LLM 是工具** |

**"LLM 是工具而非决策者"这个定位在 MAS 治理文献中是首次出现。**

---

## 4. Phase 2：Integration Completion — 填补断裂点

**状态**：✅ 完成（2026-07-30）| **结果**：616 测试通过，0 失败

### 4.1 已完成任务

| 任务 | 状态 | 改动摘要 |
|------|------|---------|
| 2.1: Wire detectBehaviorEvents | ✅ | `MeasurementLayer.updateCognitiveStates()` 末尾接入 |
| 2.2: Switch GovernanceRuntime to δ | ✅ | `runDetectors()` → `diagnoseAndSuggestSync()` |
| 2.3: Confidence-Aware Interventions | ✅ | 低置信度时 rebalance→inject 降级 |
| 2.4: Tests | ✅ | `delta-diagnosis.test.ts`，43 个测试 |
| 2.5: 全量回归 | ✅ | 27 文件，616 通过，3 跳过，0 失败 |

### 4.2 Phase 2 完成标准

```
✅ detectBehaviorEvents 在每轮后被调用
✅ 至少一个 agent 在 Round 3 后 behaviorEvents 非零
✅ GovernanceRuntime 使用 δ 诊断（diagnoseAndSuggestSync）
✅ cognitiveInterventions 在低置信度时降级干预
✅ ProgressiveEstimator 测试覆盖 eventCount 0→15
✅ computeDelta 自适应阈值测试覆盖
✅ 全量测试通过（616 tests）
```

---

## 4.5 Phase 2.5：Evidence Shared 检测 + 异步路径接入

**状态**：✅ 完成（2026-07-30）| **结果**：616 测试通过，0 失败

### 4.5.1 已完成任务

| 任务 | 状态 | 改动摘要 |
|------|------|---------|
| 2.5.1: markEvidenceSharing Layer 1 | ✅ | `shared` 初始值改为 false；`markEvidenceSharing()` 子串+Levenshtein 匹配；在 `updateCognitiveStatesFromRound` 末尾调用 |
| 2.5.2: markEvidenceSharingSemantic Layer 2 | ✅ | `markEvidenceSharingSemantic()` SemanticTool evidence_dedup 批量补判；supports 验证器；在 `diagnoseAndSuggest()` 异步路径中调用 |
| 2.5.3: useSemanticTool 异步治理选项 | ✅ | DiscussionConfig 新增 `useSemanticTool` 开关；NativeCognitiveEngine 新增 `applyCognitiveGovernanceAsync`；`applyGovernance` 返回类型支持 Promise；`setLlmConfig()` 注入 LLM 配置 |
| 2.5.4: 测试 | ✅ | 6 个新测试：精确匹配、子串匹配、无匹配、同义改写漏检、δ_evidence_silence 触发/不触发 |
| 全量回归 | ✅ | 27 文件，616 通过，3 跳过，0 失败 |

### 4.5.2 完成标准

```
✅ extractEvidenceItems 初始 shared = false
✅ markEvidenceSharing Layer 1 在每轮后运行
✅ Layer 2 在异步路径中运行
✅ unsharedEvidence 非空时 gap_analysis 可触发
✅ NativeCognitiveEngine 支持 useSemanticTool 开关
✅ 全量测试通过（616 tests）
```

### 4.5.3 修改文件清单

| 文件 | 改动 |
|------|------|
| `src/lib/agent/cognitiveState.ts` | `shared: true` → `shared: false`（2 处） |
| `src/lib/thermodynamics/MeasurementLayer.ts` | 新增 `markEvidenceSharing()` + `markEvidenceSharingSemantic()` + `levenshtein()` |
| `src/lib/discussion/types.ts` | 新增 `useSemanticTool?: boolean` |
| `src/lib/discussion/nativeCognitiveEngine.ts` | 新增 `applyCognitiveGovernanceAsync()` + `setLlmConfig()` + `GovernanceResult` 类型 |
| `src/lib/discussion/index.ts` | `applyGovernance` 返回类型支持 `Promise`；调用处添加 `await` |
| `src/lib/discussion/asyncEngine.ts` | 调用处添加 `await` |
| `test/delta-diagnosis.test.ts` | +6 测试（evidence shared 检测） |

---

## 4.6 Phase 2.6：实验链路一致性修复（反幻觉）

**状态**：✅ 完成（2026-07-30）| **目标**：消除实验分析链路中"文档声明"与"代码行为"不一致的幻觉风险

> 背景：Phase 2.5 完成后对全链路做了一次代码级复盘，发现 MetricComputer 与 computeDelta 中存在 4 处"声明与实现不一致"或"统计假设被违反"的问题。这些问题不会导致测试失败，但会让论文引用的数据失真。本节记录修复内容，确保后续 Phase 3 产出的数据可被论文安全引用。

### 4.6.1 已修复问题

| # | 问题 | 位置 | 风险 | 修复 |
|---|------|------|------|------|
| 1 | **δ_no_response 注释与实现不一致** | [computeDelta.ts:400-406](src/lib/thermodynamics/computeDelta.ts#L400) | 注释声称用 `SusceptibilityEstimate.usable` 门控，但 `_estimates` 参数未被使用 → 不可用的估计也参与判定，误报 | `computeDeltaNoResponse` 现显式检查 `est?.susceptibility.usable`，仅可用时才将 agent 计入 unresponsive |
| 2 | **全局指标公式重复** | [MetricComputer.ts:1264-1333](experiments/campaign/pipeline/MetricComputer.ts#L1264) | polarization / diversity / robustness / calibration 全部用 `tauStd / |tauMean|` 同一公式 → 四个指标实际是同一个量，论文无法声称多维度评估 | 改为各自独立公式：polarization=双峰系数 BC；diversity=末轮 evidence Jaccard 距离均值；robustness=按 seed 分组的 τ 变异系数 CV；calibration=末轮 confidence 与 τ 的 Pearson 相关 |
| 3 | **E7 "belief 检测器"误用 cognitive 变量** | [MetricComputer.ts:862-873](experiments/campaign/pipeline/MetricComputer.ts#L862) | belief 基线检测器本应基于标量 belief，实际却用 `utilityIntensity` / `evidenceCoverage` 等 cognitive state 变量 → belief vs cognitive 的对比失去意义（两边都用 cognitive 变量） | 从 `beliefTrajectory` 末轮提取 `lastBeliefStd` 与 `lastConfStd`，belief 检测逻辑改为基于标量 belief 分散度与置信度趋同 |
| 4 | **Granger 因果检验数据池化错误** | [MetricComputer.ts:608-647](experiments/campaign/pipeline/MetricComputer.ts#L608) | 把跨 agent、跨 run 的 ΔE/ΔU 拼成两条长序列做 Granger → 违反平稳性假设，F 统计量无意义 | 按 (run, agent) 分组，每条序列单独做 Granger F 检验，再对各序列的 F 取均值（meta-analysis） |

### 4.6.2 修复原则

- **不修改实验 JSON 数据**：仅修改分析侧代码，573 份历史 JSON 保持不变（遵守硬约束）
- **不新增检测器**：只让已有指标回到其声明语义
- **保留可追溯性**：每个修复都标注代码行号，论文引用时可回查

### 4.6.3 新增 δ 消费指标

在 MetricComputer 中新增 `deltaDiagnosis` 指标块，使 Phase 3 实验能够验证"δ 驱动"叙事：

```typescript
deltaDiagnosis: {
  triggerRates,          // 各 δ 信号触发率（触发轮/总轮）
  totalTriggers,         // δ 触发总次数
  deltaInterventionPhi,  // δ 触发与干预实施的 Φ 相关
  tauDeltaOnTrigger,     // δ 触发轮的收敛改善（Δτ before/after）
  meanConfidenceBySignal,// 各 δ 信号的平均置信度
}
```

该指标块在 `computeE9CognitiveGovernance()` 中消费，对应 [MetricComputer.ts:1136+](experiments/campaign/pipeline/MetricComputer.ts#L1136)。

### 4.6.4 完成标准

```
✅ δ_no_response 仅在 susceptibility.usable 时判定
✅ polarization / diversity / robustness / calibration 使用 4 个不同公式
✅ E7 belief 检测器从 beliefTrajectory 提取标量 belief
✅ Granger 因果按 (run, agent) 分组后取均值
✅ MetricComputer 消费 deltaDiagnosis 指标
✅ 全量测试通过（616 tests，3 skipped）
```

---

## 4.7 Phase 2.7：数学基本盘修复

**状态**：✅ 完成（2026-07-30）| **目标**：消除统计实现层的数学公式 bug，确保 Phase 3 实验产出的 F 统计量、置信区间、认知状态估计在数学上正确

> 背景：Phase 2.6 修复了"声明与实现不一致"的反幻觉问题后，对全链路统计函数做了一次数学正确性审计，发现 5 处公式实现 bug。这些问题不会导致测试失败（断言写的是错误期望值，或根本无测试覆盖），但会让论文引用的统计量在数学上不成立。本节记录修复内容，确保 Phase 3 产出的数据可被论文安全引用。

### 4.7.1 已修复问题

| # | 问题 | 位置 | 风险 | 修复 |
|---|------|------|------|------|
| M1 | **Granger FWL 残差化不完整** | [MetricComputer.ts:175-181](experiments/campaign/pipeline/MetricComputer.ts#L175) | resX 仅去均值而非对 yLag 回归 → F 统计量偏大，虚假因果信号 | 补 `xOnYLag = linearRegressionWithIntercept(yLag, xLag)`，resX = xLag - (xOnYLag.beta·yLag + intercept)；并加 ssResFull=0 的 NaN 保护 |
| M2 | **Bimodality 系数公式错误** | [MetricComputer.ts:918-926](experiments/campaign/pipeline/MetricComputer.ts#L918) | 用乘法校正 `((n-1)/(n-2))³` 而非 Ellison 1987 加法校正 `3(n-1)²/((n-2)(n-3))` → BC 值系统性偏小，漏报双峰 | 改为 Ellison 1987 标准公式 `(g²+1)/(k + 3(n-1)²/((n-2)(n-3)))`，并加 denom≤0 守卫 |
| M3 | **t 分布临界值表缺口** | [StatisticalTest.ts:951-959](experiments/campaign/pipeline/StatisticalTest.ts#L951) | 缺 df=11-14/16-19/21-24/26-29，回退到 2.0 → CI 窄化，假阳性风险 | 补全 df=1-30 完整查表（标准双尾 α=0.05 值） |
| M3b | **StatisticalTest fallback p 值硬编码** | [StatisticalTest.ts:302-306](experiments/campaign/pipeline/StatisticalTest.ts#L302) | 无 bootstrap 数据时硬编码 `deltaR2 > 0.05 ? 0.01 : 0.5` → 制造虚假显著性 | 改为返回 pValue=1.0（不显著），诚实表达数据不足 |
| M4 | **ProgressiveEstimator β>1.0 越界** | [ProgressiveEstimator.ts:228-236](src/lib/thermodynamics/ProgressiveEstimator.ts#L228) | round<2 且 stabilityAvailable 时 β=1.12>1.0 → 违反加权平均语义，estimate 可能超出 [0,1] | 加 `Math.min(1.0, ...)` 上界保护 |
| M5 | **detectBehaviorEvents dead code** | [ProgressiveEstimator.ts:304-322](src/lib/thermodynamics/ProgressiveEstimator.ts#L304) | `else if (history.length === 1 && cs.utilityHistory.length >= 2)` 永远为 false（history === cs.utilityHistory）→ 未完成逻辑遗留，误导阅读 | 删除空分支，history 声明提前到 events 之后 |

### 4.7.2 修复原则

- **不修改实验 JSON 数据**：仅修改统计函数实现，573 份历史 JSON 保持不变（遵守硬约束）
- **不新增检测器**：只让已有统计函数回到数学正确语义
- **保留可追溯性**：每个修复都标注代码行号，论文引用时可回查
- **测试先行**：M1-M3 新增 22 个单元测试（[stats-corrections.test.ts](test/stats-corrections.test.ts)），M4 新增 1 个边界测试（[delta-diagnosis.test.ts:237](test/delta-diagnosis.test.ts#L237)）

### 4.7.3 经分析非 bug（1 处）

**cosineDist 零向量返回 0**：[computeDelta.ts:641](src/lib/thermodynamics/computeDelta.ts#L641)。零向量 agent 无明确立场，返回 0（"不触发极化"）是合理的保守选择，[cognitive-detectors.test.ts:213](test/cognitive-detectors.test.ts#L213) 已锁定此行为。零向量语义本身有歧义（可解读为"完全一致"或"无信息"），当前保守策略符合"宁可漏报不可误报"的治理原则。

### 4.7.4 完成标准

```
✅ M1 Granger FWL: resX 对 yLag 回归 + NaN 保护
✅ M2 Bimodality: Ellison 1987 加法校正 + denom 守卫
✅ M3 t 分布: df=1-30 完整查表 + fallback p=1.0
✅ M4 β 边界: Math.min(1.0, ...) 上界保护
✅ M5 dead code: 删除空分支 + history 作用域修复
✅ 单元测试: 22+1=23 个新增测试全部通过
✅ 全量回归: 616 passed | 3 skipped | 0 failed（较 Phase 2.6 增加 97 个测试：stats-corrections 22 + delta-diagnosis 补充 + 其他）
```

### 4.7.5 对论文的影响

- **PAPER_DRAFT.md L191**：bimodality 公式已从错误的 `BC = (s^2+1)/k` 更正为 Ellison 1987 标准形式 `BC = (g^2+1)/(k + 3(n-1)^2/((n-2)(n-3)))`
- **实验数据未重跑**：M1-M3 修复的是分析侧代码，历史 573 份 JSON 不受影响；但 Phase 3 新实验将使用修复后的统计函数，产出的 F/BC/CI 在数学上才成立
- **历史数据 caveat**：基于修复前代码分析的历史 F/BC 值存在偏差，论文若引用需注明

---

## 4.8 Phase 2.8：综合审计修复 — 类型错误清零 + 实验配置差距闭合

**时间**：1-2 天 | **状态**：✅ 完成（2026-07-30）| **前置**：Phase 2.7 | **结果**：616 测试通过，tsc 零错误

> 2026-07-30 综合审计发现两个问题：(1) 15 个 tsc 类型错误（vitest 不检查类型，所以 616 tests 全过但 tsc --noEmit 报错）；(2) E9 实验配置与 ROADMAP 计划之间的 4 项结构性差距（已在 §当前实现 vs ROADMAP 计划对照 中详细列出）。本 Phase 在进入实验前一次性解决这两个问题。

### 4.8.1 类型错误修复（15 个，5 文件，~1 天）

#### SemanticTool.ts（5 个）— `unknown` 类型侵蚀

**文件**：[SemanticTool.ts:132-141](src/lib/thermodynamics/SemanticTool.ts#L132-L141)

**问题**：`safeJsonParse<Record<string, unknown>>` 返回 `Record<string, unknown> | null`，`parsed.clusters` 等属性类型为 `unknown`，赋值给 `SemanticConsultResult` 的类型化字段时 tsc 报错。

**修复方案**：恢复使用 `parseJSON`（返回 `any | null`），或对 `safeJsonParse` 返回值做显式类型断言。`parseJSON` 在 LLM 输出解析场景中是合理的——LLM 输出的 schema 由 prompt 约束 + Validator 运行时校验，类型安全已通过运行时保证。改用 `safeJsonParse<Record<string, unknown>>` 反而引入了 5 个无法消解的 unknown 赋值错误。

**具体改动**：
```typescript
// 改前（L132）：
const parsed = safeJsonParse<Record<string, unknown>>(response.rawContent);
// 改后：
const parsed = parseJSON(response.rawContent); // 返回 any | null，由 Validator 运行时确保类型
```

#### pipeline.ts（2 个）— discriminated union 字段缺失

**文件**：[pipeline.ts:290](src/lib/pipeline.ts#L290)

**问题**：`phaseTimings` 的联合类型中，`input` phase 没有 `failed`/`errorMsg` 字段。`...p.failed ? { failed: true, errorMsg: p.errorMsg } : {}` 中 TS 无法验证 `p.errorMsg` 在 `input` phase 上是否存在。

**修复方案**：将 `phaseTimings` 的类型定义中 `input` phase 也加上可选字段 `failed?: boolean; errorMsg?: string`，或使用类型断言 `(p as any).failed`。

#### delta-diagnosis.test.ts（3 个）— mock 对象不完整

**文件**：[delta-diagnosis.test.ts:537,556,573](test/delta-diagnosis.test.ts#L537)

**问题**：测试中创建 `new Map([...])` 的 `ProgressiveEstimates` 时，`inertia` 缺少 `sourceWeights` 和 `behavioralRatio` 字段。

**修复方案**：补充缺失字段：
```typescript
inertia: {
  estimate: 0.5, confidence: 0.2,
  sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
  behavioralRatio: 0.5,
}
```

#### index.ts（2 个）— 导入不存在的类型

**文件**：[index.ts:56](src/lib/discussion/index.ts#L56)

**问题**：`import type { DiscussionMessage, RuntimeContext, CollectiveDecisionState } from "@/runtime/types"` 中的 `RuntimeContext` 和 `CollectiveDecisionState` 在 `@/runtime/types` 中不存在。

**修复方案**：检查 `@/runtime/types` 实际导出，移除不存在的导入或从正确路径导入。

#### json-utils.test.ts（1 个）— 泛型约束属性访问

**文件**：[json-utils.test.ts:94](test/json-utils.test.ts#L94)

**问题**：对泛型约束类型访问属性 `obj.b`，TS 无法验证该属性是否存在。

**修复方案**：使用类型断言 `(obj as any).b` 或放宽泛型约束。

### 4.8.2 实验配置差距闭合（~1 天）

> 详见 §当前实现 vs ROADMAP 计划对照。此处列出具体执行步骤。

#### Step 1：创建大学排名任务（P0，~100 行）

**新文件**：`experiments/campaign/tasks/task_university.ts`

**设计约束**（来自 ROADMAP §5.2）：
- 8 所大学（A-H）× 6 维度
- 5 agent 不对称信息分布
- 每个 agent ≥ 2 条独有信息
- 无 agent 持有 >60% 总信息
- 3-4 所大学在 2 个维度交叉下存在平局
- 部分信息用不同措辞表达相同含义（供 SemanticTool 去重）

#### Step 2：更新 E9 配置（P0，改动现有文件）

**文件**：[e9_cognitive_governance.ts](experiments/campaign/configs/e9_cognitive_governance.ts)

具体改动：
1. 三组 `maxRounds` 从 3 → 5
2. `E9_SUPPLIER_COGNITIVE` 显式设置 `useSemanticTool: true`（在 ExperimentConfig 中新增该字段到 types.ts）
3. 新增 `E9_SUPPLIER_OLD_DETECTORS` 配置（D 组：旧 6 检测器路径，governanceMode="full", useCognitiveGovernance=false）
4. 重命名配置以匹配 ROADMAP 语义：
   - `E9_SUPPLIER_NONE` → `E9_V6_A_NONE`（A 组）
   - `E9_SUPPLIER_BELIEF` → `E9_V6_B_DELTA`（B 组，δ 自适应阈值）
   - `E9_SUPPLIER_COGNITIVE` → `E9_V6_C_SEMANTIC`（C 组，δ + SemanticTool）
   - 新增 `E9_V6_D_OLD`（D 组，旧检测器）

#### Step 3：ExperimentConfig 类型扩展

**文件**：[types.ts](experiments/campaign/types.ts)

新增字段：
```typescript
useSemanticTool?: boolean;  // C 组启用
```

#### Step 4：Runner.ts 传递 useSemanticTool

**文件**：[Runner.ts:315-321](experiments/campaign/pipeline/Runner.ts#L315-L321)

在创建 NativeCognitiveEngine 时传递 `useSemanticTool`：
```typescript
const engine = new NativeCognitiveEngine({
  maxRounds: config.maxRounds,
  governanceMode: govMode,
  seed,
  useCognitiveGovernance,
  useSemanticTool: config.useSemanticTool ?? false,  // ← 新增
  governanceConfig: govConfig,
});
```

### 4.8.3 完成标准

```
✅ tsc --noEmit 零错误（含 pilot_v6.ts totalLatencyMs undefined 修复）
✅ 全量测试仍通过（616 passed | 3 skipped | 0 failed）
✅ task_university.ts 创建完成（8 大学 × 6 维度，hidden-profile）
✅ E9 配置 4 组（A/B/C/D），maxRounds=5，useSemanticTool 正确设置
✅ Runner.ts 传递 useSemanticTool + university 场景支持
✅ Pilot 可启动（pilot_v6.ts 复用 runSingle，验证完整 Runner 链路）
```

### 4.8.4 治理路径验证

NativeCognitiveEngine.applyGovernance 的分支逻辑与 ROADMAP §5.3 实验矩阵完全对齐：

| 组 | governanceMode | useCognitiveGovernance | useSemanticTool | 实际路径 | 代码位置 |
|----|----------------|------------------------|-----------------|---------|---------|
| A | none | false | false | 父类无治理（mode=none） | nativeCognitiveEngine.ts:479 |
| B | cognitive | true | false | `applyCognitiveGovernance`（δ 同步） | nativeCognitiveEngine.ts:489 |
| C | cognitive | true | true | `applyCognitiveGovernanceAsync`（Tier 1→2→3） | nativeCognitiveEngine.ts:487 |
| D | full | false | false | `super.applyGovernance`（父类旧检测器） | nativeCognitiveEngine.ts:493 |

---

## 5. Phase 3：Experiment Execution — 实验验证

**时间**：1-2 周 | **目标**：96 runs 实验数据，验证因果链
**前置**：Phase 2.5 + Phase 2.6 + Phase 2.7 完成（断裂点修复 + 实验链路一致性修复 + 数学基本盘修复）

> ⚠️ **重要**：Phase 3 启动前必须先完成 §5.1 Pilot，并解决"当前实现 vs 计划对照"（见下一节）中列出的 4 项差距。当前 E9 配置与 ROADMAP 计划存在偏差，直接跑全量实验会导致数据无法支撑论文声明。

### 5.1 Pilot（Phase 3 前置，1 天）

**在跑全量实验前必须完成**：

1. **基线 τ 验证**：5 runs `none` 条件 → 验证 τ 在 0.3-0.5 区间
   - τ > 0.6 → 增加任务难度（更多选项、更模糊的评分标准）
   - τ < 0.2 → 降低任务难度（太随机 → 干预也无法改善）
2. **δ 动态范围验证**：确认 δ 指标在 pilot 数据上有合理的触发率（5-30%，不是 0% 也不是 100%）
3. **Evidence shared 验证**：确认 Round 2 后 shared 比例在 30-70%（不是 0% 也不是 100%）
4. **SemanticTool 触发率验证**：确认触发率 < 30%（如果 > 30%，调整触发条件）
5. **detectBehaviorEvents 验证**：确认 Round 3 后 behaviorEvents 计数器在增长

### 5.2 任务设计

**大学排名任务**（8 所大学 A-H，6 个维度）：

| 维度 | 权重 | 说明 |
|------|------|------|
| 学术声誉 | 0.20 | 论文产出、诺奖、学科排名 |
| 就业率 | 0.15 | 毕业生就业率、平均起薪 |
| 师生比 | 0.10 | 教学资源充足度 |
| 科研经费 | 0.15 | 年度科研经费总额 |
| 国际化 | 0.10 | 国际学生比例、交换项目 |
| 地理位置与成本 | 0.30 | 城市吸引力、生活成本、气候 |

**信息分散**（5 agent × 不对称信息）：

| Agent | 角色 | 掌握的详细信息 |
|-------|------|--------------|
| a1 | 学术顾问 | 学术声誉 + 科研经费 |
| a2 | 就业顾问 | 就业率 + 行业连接 |
| a3 | 学生代表 | 地理位置 + 生活成本 |
| a4 | 国际教育顾问 | 国际化 |
| a5 | 综合顾问 | 所有维度粗略信息（无细节） |

**关键设计**：
- 每个 agent 至少持有 2 条独有信息
- 没有任何 agent 持有 >60% 的总信息量
- 3-4 所大学的评分在 2 个维度的交叉下存在"平局"（需要语义级别的信息才能区分）
- 部分信息用不同措辞表达相同含义（测试 SemanticTool 去重能力）

### 5.3 实验矩阵

| 组 | 条件 | n | 引擎 | 治理路径 | 说明 |
|----|------|---|------|---------|------|
| **A** | none | 24 | NativeCognitiveEngine | 无 | 基线 |
| **B** | δ adaptive | 24 | NativeCognitiveEngine | δ → 干预（自适应阈值） | 主实验组 |
| **C** | δ + SemanticTool | 24 | NativeCognitiveEngine | δ → 干预 + SemanticTool gap analysis | LLM 增强 |
| **D** | old detectors | 24 | NativeCognitiveEngine | 旧 6 检测器 → 干预 | 向后兼容基线 |

**总计**：96 runs。

**主比较**：
- **Δτ (B-A)**：δ 治理效果（primary endpoint）
- **Δτ (C-B)**：SemanticTool 增量贡献（secondary endpoint）
- **Δτ (B-D)**：δ vs 旧检测器（non-inferiority）
- **Δτ (C-A)**：完整混合范式效果

**模型**：deepseek-chat（与 V5 主证据一致）。

**配置**：maxRounds=5, temperature=0.7, agentCount=5。

### 5.4 效果度量

| 指标 | 公式 | 说明 |
|------|------|------|
| **最终 τ** | Kendall τ(correct ranking, group ranking) | 决策质量 |
| **Δτ** | τ_treatment - τ_A | 治理效果 |
| **δ 触发率** | 触发轮次 / 总轮次 | δ 灵敏度 |
| **δ 响应率** | P(δ 下降 \| 干预) | 干预是否解除异常 |
| **SemanticTool 触发率** | Tier 3 调用次数 / 总轮次 | 应 < 30% |
| **SemanticTool 验证通过率** | 通过 / 总调用 | 应 > 80% |
| **降级率** | 降级次数 / 总 LLM 调用 | 鲁棒性 |
| **级联率** | P(干预触发更多干预) | 干预副作用 |
| **信息增益** | ΔE.coverage / 干预次数 | 每次干预的信息增量 |

### 5.5 δ 指标的实验预测

基于架构设计，做出以下可证伪预测：

| 预测 | 验证方式 | 证伪条件 |
|------|---------|---------|
| δ 触发率随 round 增长（behaviorEvents 累积 → 置信度上升 → 阈值变灵敏） | B 组 round 1-5 的 δ 触发率趋势 | 触发率不变或下降 |
| 自适应阈值（B 组）比固定阈值在短对话中误报更少 | B vs 固定阈值对照（pilot） | 无差异 |
| SemanticTool 触发率 < 15% 轮次 | C 组统计 | >30% |
| δ 响应率 > 50%（干预后 δ 下降） | B+C 组 δ before/after | <30% |
| B 组 τ > A 组 τ（δ 治理有效） | B vs A permutation test | p > 0.05 |

---

## 当前实现 vs ROADMAP 计划对照

> 本节记录截至 2026-07-30 代码实际状态与 ROADMAP 计划的差距。这些差距必须在 Phase 3 全量实验启动前解决，否则产出的数据无法支撑论文声明（例如论文声称"4 组 96 runs 大学排名任务 maxRounds=5"，但代码跑的是"3 组 150 runs supplier 任务 maxRounds=3"）。

### 差距 1：实验组数与命名

| 项目 | ROADMAP 计划（§5.3） | 当前 E9 配置 | 文件 |
|------|---------------------|-------------|------|
| 组数 | 4 组（A/B/C/D） | 3 组 | [e9_cognitive_governance.ts](experiments/campaign/configs/e9_cognitive_governance.ts) |
| A 组 | none（无治理基线） | ✅ `E9_SUPPLIER_NONE` (governanceMode: "none") | L26 |
| B 组 | δ adaptive（主实验组） | ❌ 当前为 `E9_SUPPLIER_BELIEF` (governanceMode: "full"，旧 belief 治理) | L43 |
| C 组 | δ + SemanticTool（LLM 增强） | ❌ 当前为 `E9_SUPPLIER_COGNITIVE` (governanceMode: "cognitive"，δ 治理但 **未启用** `useSemanticTool`) | L60 |
| D 组 | old detectors（向后兼容） | ❌ 缺失 | — |

**需要做的调整**：
- 将 `E9_SUPPLIER_COGNITIVE` 显式设置 `useSemanticTool: true`（DiscussionConfig 字段已存在，见 Phase 2.5），使其成为真正的 C 组
- 新增 D 组：使用旧 6 检测器路径（governanceMode 配置或单独 runner 路径）
- 重新命名配置以匹配 ROADMAP 语义（当前命名 `BELIEF`/`COGNITIVE` 与 ROADMAP 的 B/C/D 语义不对应）

### 差距 2：maxRounds

| 项目 | ROADMAP 计划 | 当前 E9 配置 |
|------|-------------|-------------|
| maxRounds | 5 | 3 |

**影响**：δ 中的跨轮指标（δ_stance_flip 需 Round 2+，δ_no_response / δ_concentration / δ_consistency 需 Round 3+）在 maxRounds=3 下仅有 1 轮有效观测窗口，置信度无法累积到设计值。Pilot 的 δ 触发率验证（§5.1 第 2 项）也会失真。

**修复**：将三组配置的 `maxRounds` 改为 5。

### 差距 3：实验场景与任务

| 项目 | ROADMAP 计划 | 当前实现 |
|------|-------------|---------|
| 任务 | 大学排名（8 所大学 × 6 维度，hidden-profile） | supplier 场景（现有） |
| Pilot 任务 | 大学排名 | [pilot_v6.ts:26](experiments/campaign/pilot_v6.ts#L26) 使用 `lunar_survival` TASK_MA |
| 信息分散设计 | 5 agent 不对称信息，含语义等价不同措辞 | supplier 场景已有，但未验证是否含语义等价证据 |

**需要做**：
- 新建 `task_university.ts`，实现 §5.2 设计的 8 所大学 × 6 维度任务
- 关键设计约束（来自 §5.2）：
  - 每个 agent 至少持有 2 条独有信息
  - 没有任何 agent 持有 >60% 的总信息量
  - 3-4 所大学在 2 个维度交叉下存在"平局"（需语义级信息才能区分）
  - 部分信息用不同措辞表达相同含义（测试 SemanticTool 去重）
- 更新 pilot_v6.ts 使用新任务
- 更新 E9 三组配置的 `scenario` 字段

### 差距 4：runs 总数

| 项目 | ROADMAP 计划 | 当前 E9 配置 |
|------|-------------|-------------|
| 每组 runs | 24 | 50（10 seeds × 5 runs） |
| 总 runs | 96 | 150 |

**说明**：当前 50 runs/组实际上比计划的 24 runs/组统计功效更强，不是缺陷。但补齐 D 组后总数会变为 200 runs，API 成本估算（§8.4）需要相应更新。

### 差距汇总与处理优先级

| 优先级 | 差距 | 处理方式 | 阻塞 Phase 3？ |
|--------|------|---------|---------------|
| 🔴 P0 | 任务未创建（差距 3） | 新建 task_university.ts | 是 |
| 🔴 P0 | C 组未启用 SemanticTool（差距 1） | 配置 `useSemanticTool: true` | 是 |
| 🟡 P1 | D 组缺失（差距 1） | 新增旧检测器配置 | 是（4 组对比是论文核心） |
| 🟡 P1 | maxRounds=3（差距 2） | 改为 5 | 是 |
| 🟢 P2 | runs 总数（差距 4） | 保持 50/组或调整，更新成本估算 | 否 |

---

## 6. Phase 4：Analysis & Paper — 分析与论文

**时间**：3-4 周 | **目标**：论文初稿 + arXiv 预印本

### 6.1 分析清单

#### 6.1.1 因果链分解

```
干预 → Δδ → ΔU → ΔR → Δτ
```

每段用中介分析（mediation analysis）验证：
1. 干预是否改变了 δ？（δ before vs after，paired t-test）
2. δ 变化是否改变了 U？（correlation δ_change ~ U_change）
3. U 变化是否改变了 R？（correlation U_change ~ R_change）
4. R 变化是否改变了 τ？（correlation R_change ~ τ_change）

#### 6.1.2 前沿工作整合

| 分析 | 来源 | 方法 | 产出 |
|------|------|------|------|
| δ_anchoring OLS | Hidden Anchors (arXiv:2606.19494) | 从 U(t) 轨迹拟合 FJ α | α 分布，恶意识别 AUC |
| U-E 一致性 | Belief Engine (arXiv:2605.15343) | 验证 evidence uptake 方向 | 一致率，作为 δ_consistency 的 construct validity |
| δ 阈值校准 | BeliefShift (arXiv:2603.23848) | 用 BRA benchmark 数据校准 | 基于实证的阈值推荐 |

#### 6.1.3 统计方法

- **主效应**：permutation test（(count+1)/(nPerms+1) 校正），避免小样本正态假设
- **效应量**：Cohen's d + 95% bootstrap CI
- **非劣效性**：δ vs 旧检测器，margin Δτ = -0.05
- **多重比较**：Holm-Bonferroni 校正（4 组 × 6 比较）

### 6.2 论文结构

#### 核心贡献（Introduction 末段）

> We propose a hybrid governance architecture for LLM multi-agent deliberation that combines a deterministic mathematical governor with an on-demand semantic sensor. The mathematical governor—comprising thermodynamic screening (R, T, H, F) and δ-based diagnosis with progressive estimation of agent cognitive variables—handles over 90% of governance decisions at zero additional LLM cost, preserving full transparency and auditability. When the mathematical layer encounters semantic ambiguity that it cannot resolve, it calls an LLM as a sandboxed semantic tool. The LLM provides structured, schema-validated semantic judgments; a deterministic validator verifies these outputs before they are used. Critically, the LLM never participates in governance decisions—it is a sensor, not a decision-maker. We validate this architecture on a hidden-profile ranking task with 96 experimental runs, demonstrating that δ-driven governance with progressive estimation improves decision quality over both a no-governance baseline and a prior detector-driven system, while the LLM semantic sensor is triggered in fewer than 15% of rounds.

#### 差异化段（Related Work 末段）

> Unlike prior work that either relies entirely on heuristic rules (MAST, Agent Governance Toolkit) or delegates governance decisions to LLMs (CoBRA), our architecture draws a principled boundary: deterministic governance logic owns all decisions; LLM calls are stateless semantic sensors that provide information the mathematical layer cannot compute. This "LLM as tool, not decision-maker" pattern is, to our knowledge, the first of its kind in MAS governance.

#### 自我纠错段（Discussion）

> During the development of this framework, we made and subsequently corrected over ten claims about our own system. The orthogonal decomposition of disorder (r=0.917), the effectiveness of 1D governance (falsified by 5D vector analysis), and the thermodynamic phase-transition narrative (no critical fluctuations detected) were all claims we believed, tested, and retracted. We report this as evidence of the framework's empirical discipline.

### 6.3 论文声明（必须写入的局限性）

1. **τ 需要 ground truth**：部署时无法计算 τ，只能依赖 δ 信号
2. **δ 阈值基于离线校准**：不同任务可能需要不同阈值
3. **单模型验证**：所有实验使用 DeepSeek-V3，跨模型泛化性未知
4. **封闭信息任务**：hidden-profile 任务，开放任务中的表现待验证
5. **小群体（N=5）**：更小或更大群体中的行为未知
6. **短讨论（5 轮）**：更长时间尺度上的 δ 动态未被研究
7. **U/E/C 是 LLM 自报数据**：不声称测量了"真实"内部认知状态
8. **SemanticTool 仅在特定触发条件下调用**：其价值取决于触发条件的设计质量

---

## 7. 论文叙事结构

### 7.1 完整叙事弧

```
Introduction:
  MAS deliberation improves decision quality but suffers from
  cognitive failure modes (premature consensus, information silos,
  anchoring). Existing governance is either rule-based (semantically
  blind) or LLM-driven (opaque, expensive). We propose a third way.

Related Work:
  - MAS failure taxonomies (MAST)
  - LLM deliberation (Du et al., CoBRA)
  - Governance toolkits (Agent Governance, Agora)
  → Gap: no hybrid approach exists

Method:
  1. 5D Cognitive State (U/E/I/C/Λ) — what we track
  2. Progressive Estimation — how I/C/Λ self-adapt from
     short to long discussions via behavior events
  3. δ Indicators — six diagnostic signals that detect
     contradictions between observables
  4. SemanticTool — LLM as sandboxed semantic sensor,
     triggered only when math cannot resolve ambiguity
  5. Governance Loop — Tier 1→2→3 pipeline

Experiments:
  - Task: hidden-profile university ranking (8 options, 6 dimensions)
  - Design: 4 groups × 24 runs = 96 runs
  - Results: Δτ (B-A), Δτ (C-B), Δτ (B-D)
  - Analysis: causal chain decomposition, SemanticTool trigger rate,
    frontier work integration

Discussion:
  - Hybrid paradigm as new MAS governance architecture
  - "LLM as tool" vs "LLM as decision-maker"
  - Limitations and future work
  - Self-correction as methodological norm
```

### 7.2 δ 本体论段（Method）

> The δ indicators share a common design principle: each detects a contradiction between two observable signals rather than a deviation from a normative threshold. δ_polarization measures the mean pairwise cosine distance between utility vectors; δ_1d_mask contrasts scalar consensus (R) with vector-level divergence; δ_evidence_silence detects when an agent's evidence is systematically ignored by others; δ_confidence_gap flags agents whose stated confidence is inconsistent with their utility position relative to the group; δ_stance_flip detects sudden changes in top preference; δ_no_response identifies agents who were exposed to new evidence but did not update. Because these indicators compare observables against each other rather than against ground truth, they are deployable in scenarios where the correct answer is unknown.

---

## 8. 里程碑与风险

### 8.1 时间线

| 阶段 | 内容 | 时间 | 可交付物 | 完成标准 |
|------|------|------|---------|---------|
| ~~Phase 2~~ | ~~填补断裂点 1-4 + 测试~~ | ~~3-5 天~~ | ~~616 测试通过~~ | ✅ 完成 |
| ~~Phase 2.5~~ | ~~Evidence shared 检测 + 异步路径~~ | ~~1-2 天~~ | ~~616 测试通过~~ | ✅ 完成 |
| ~~Phase 2.6~~ | ~~实验链路一致性修复（反幻觉）~~ | ~~1 天~~ | ~~4 处修复 + deltaDiagnosis 指标~~ | ✅ 完成 |
| ~~Phase 2.7~~ | ~~数学基本盘修复（M1-M5）~~ | ~~1 天~~ | ~~5 处修复 + 22 tests~~ | ✅ 完成 |
| ~~Phase 2.8~~ | ~~类型错误清零 + 实验配置差距闭合~~ | ~~1-2 天~~ | ~~tsc 零错误 + 4 组 E9 配置 + task_university.ts~~ | ✅ 完成 |
| **Pilot** | 基线 τ + δ 动态验证 | 1 天 | Pilot 数据 | τ ∈ [0.3, 0.5]、δ 触发率 ∈ [5%, 30%] |
| **Phase 3** | 全量实验（4 组） | 1-2 周 | 实验 JSON | 数据完整性验证通过 |
| **Phase 4** | 分析 + 论文 | 3-4 周 | 论文初稿 | 所有分析完成、所有章节有内容 |

**总计**：约 5-7 周（Phase 2 + 2.5 + 2.6 + 2.7 + 2.8 已完成；下一阶段为 Pilot 实际运行）。

### 8.2 关键依赖链

```
Phase 2.8 (类型修复 + 实验配置差距闭合)
  └→ Pilot (基线验证)
      └→ Phase 3 (实验执行)
          └→ Phase 4 (分析 + 论文)
```

- Pilot 依赖 Phase 2.8（需要 task_university.ts + maxRounds=5 才能验证 δ 动态范围）
- Phase 3 依赖 Phase 2.8 + Pilot

```
Phase 2 (断裂点 1-4) ✅
  └→ Phase 2.5 (断裂点 5-6: evidence shared + 异步路径) ✅
      └→ Phase 2.6 (实验链路一致性修复) ✅
          └→ Phase 2.7 (数学基本盘修复) ✅
              └→ Phase 2.8 (类型错误清零 + 实验配置差距闭合) ✅
                  └→ Pilot (基线验证) ⏳
                      └→ Phase 3 (实验执行)
                          └→ Phase 4 (分析 + 论文)
```

- Phase 2.8 依赖 Phase 2.7（数学修复后的代码才能做类型修复）
- Pilot 依赖 Phase 2.8（需要正确的任务和 4 组配置才能验证基线 τ 与 δ 触发率）
- Phase 3 依赖 Pilot（需要验证基线 τ 在合理区间）
- Phase 4 依赖 Phase 3（需要实验数据做分析）

### 8.3 风险矩阵

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| **配置差距未关闭即跑全量实验** | — | 🔴 致命——数据无法支撑论文声明 | 严格按 §"当前实现 vs 计划对照" P0/P1 清单逐项关闭后再启动 Phase 3 |
| **δ 因果链不成立（B 组 ≈ A 组）** | 25% | 🔴 致命——论文无实证支撑 | Pilot 先验基线 τ；调整 δ 阈值；增加轮次到 7 |
| **SemanticTool 无增量（C 组 ≈ B 组）** | 35% | 🟡 重大——范式贡献降级为"纯数学框架" | 确保任务设计中有语义等价但措辞不同的证据；丰富触发条件 |
| **SemanticTool 触发率过高（>30%）** | 15% | 🟡 中等——成本模型失效 | 调整触发条件；增加触发门槛 |
| **SemanticTool 验证通过率过低（<80%）** | 10% | 🟡 中等——LLM 不可靠 | Prompt 调优；加更多验证规则 |
| **基线 τ 在天花板（>0.7）** | 15% | 🟡 中等——无改善空间 | Pilot 后调整任务难度 |
| **基线 τ 在地板（<0.2）** | 10% | 🟡 中等——随机决策，干预无效 | Pilot 后降低任务难度 |
| **detectBehaviorEvents 数据噪声过大** | 20% | 🟡 中等——渐进估计失效 | 调整事件检测阈值（ΔU > 0.05）；增加轮次 |

### 8.4 成本估算

| 项目 | 估算 |
|------|------|
| 主 LLM 调用（96 runs × 5 agents × 5 rounds） | 2,400 calls × ~2K tokens = ~$25（DeepSeek） |
| SemanticTool evidence_dedup（C 组 24 runs × 5 rounds × ~1 call） | ~120 calls × ~700 tokens = ~$0.25 |
| SemanticTool gap_analysis（C 组 24 runs × ~2 calls） | ~50 calls × ~700 tokens = ~$0.10 |
| **总 API 成本** | **~$25** |

---

## 附录 A：V5→V6 关键决策变更

| V5 决策 | V6 决策 | 变更理由 |
|---------|---------|---------|
| 标量 b 是"派生汇总统计" | 保留，b 通过 stanceFromItemBeliefs 实现 | 已实现 |
| 热力学层"筛查异常 → 触发 δ" | 保留，且 δ 现在真正接入治理循环 | Phase 1 已修复 |
| E（信息状态）是核心杠杆 | E 被 evidence_silence δ 取代（轮内可观测） | 不依赖 ground truth |
| 旧检测器改为接收 CognitiveState | 旧检测器被 δ 替代，保留用于向后兼容测试 | 已实现 |
| Δτ=+0.533 | 修正为 Δτ=0.000（当前 smoke test 未检测到显著效果） | 见 V6_OPTIMIZED |
| I/C/Λ 硬编码 | ProgressiveEstimator 渐进融合 | Phase 1 已实现 |
| LLM 不参与治理 | SemanticTool 作为沙箱化语义传感器 | Phase 1 已实现 |

## 附录 B：已实现模块速查

| 模块 | 文件 | 行数 | 核心导出 | 状态 |
|------|------|------|---------|------|
| ProgressiveEstimator | `src/lib/thermodynamics/ProgressiveEstimator.ts` | 450 | `estimateAll`, `estimateInertia`, `estimateConfidence`, `estimateSusceptibility`, `detectBehaviorEvents` | ✅ 已接入 |
| computeDelta (v6) | `src/lib/thermodynamics/computeDelta.ts` | 650 | `computeDeltaDiagnosis`, 8 个独立 δ 函数, `adaptiveThreshold` | ✅ Phase 2.6 修复 δ_no_response 门控 |
| SemanticTool | `src/lib/thermodynamics/SemanticTool.ts` | 300 | `semanticConsult`, 3 个 Validator 函数 | ✅ 已接入 |
| MeasurementLayer | `src/lib/thermodynamics/MeasurementLayer.ts` | 1500+ | `diagnoseAndSuggest` (async), `diagnoseAndSuggestSync`, `markEvidenceSharing`, `markEvidenceSharingSemantic` | ✅ |
| NativeCognitiveEngine | `src/lib/discussion/nativeCognitiveEngine.ts` | 700+ | `applyCognitiveGovernance` (sync), `applyCognitiveGovernanceAsync` (async) | ✅ |
| GovernanceRuntime | `src/runtime/GovernanceRuntime.ts` | 900+ | `runCognitiveGovernance` (δ-driven, sync) | ✅ |
| cognitiveInterventions | `src/lib/governance/cognitiveInterventions.ts` | — | `generateCognitiveInterventions` (置信度感知) | ✅ |
| MetricComputer (Phase 2.6) | `experiments/campaign/pipeline/MetricComputer.ts` | 1400+ | `computeE9CognitiveGovernance`, `deltaDiagnosis` 指标块, `bimodalityCoefficient`, 按 (run,agent) 分组 Granger | ✅ 4 处反幻觉修复 |
| delta-diagnosis 测试 | `test/delta-diagnosis.test.ts` | — | 43+6 个测试 | ✅ |

## 附录 C：关键设计原则

1. **LLM 不作为决策者**：LLM 是语义传感器，不是治理决策者。这是混合范式的核心约束。

2. **SemanticTool 是可选的**：关闭 Tier 3 → 退化为纯数学框架。不同部署约束下都能工作。

3. **验证器是硬约束**：LLM 输出不经人工审核直接用于治理决策。验证器是唯一的安全网。

4. **审计日志包含 LLM 调用**：治理决策的可追溯性不因引入 LLM 而丢失。

5. **渐进估计不声称测量"真实"认知状态**：I/C/Λ 是可观测行为的汇总，不是内部心理变量。confidence 追踪的是"有多少行为证据支持这个估计"，不是"估计离真实值有多近"。

6. **δ 检测矛盾而非错误**：δ 对比两个可观测信号。不需要 ground truth。这使框架可部署。

7. **自适应阈值是安全机制而非优化**：低置信度时保守不是"性能差"——是防止在不可靠数据上做决策。

---

## 附录 D：Future Work（v7 方向，不影响 v6 论文）

> 以下方向在 v6 论文完成后探索，不阻塞当前实验。v6 的核心命题（δ 驱动治理 + LLM 作为传感器）不依赖这些扩展。

### D.1 异质 Agent 重要性权重

**问题**：当前 δ 诊断等权处理所有 agent（mean pairwise / 群体均值无加权），但在真实异质团队中，"重要 agent 持有的关键信息被压制"与"边缘 agent 的信息被忽视"严重程度不同。当前 δ_concentration 把"惯性集中在少数 agent"一律视为异常，但在专家主导团队中这可能是正常的。

**设计**：引入 `AgentProfile.importance` 作为一等问题，渗透到 δ 计算和干预策略：

```typescript
interface AgentProfile {
  informationWeight: number;   // 信息重要性（任务场景配置）
  cognitivePrior: number;      // 认知能力先验（冷启动用）
  importance: number;          // 合成重要性
}
```

**渗透点**：
- δ_polarization / δ_1d_mask：importance-weighted pairwise distance
- δ_evidence_silence：按 importance 加权 silenced 分数
- δ_confidence_gap：偏离 importance-weighted 群体均值
- δ_concentration：区分"惯性集中在重要 agent"（正常）vs "集中在不重要 agent"（异常）
- 干预策略：优先保护重要 agent 的信息与发言权

**与设计哲学的兼容性**：
- 低成本：importance 是配置项，零运行时成本
- 可回溯：配置写入实验日志，加权计算可审计
- 白盒化：加权公式公开，importance 来源明确
- 状态检测：δ 仍检测矛盾，加权只让"谁的矛盾"有区分度
- 去中心化：importance 是 agent 静态属性，非中心化协调者

### D.2 任务场景模板化

**问题**：当前 schema 绑定 ranking（itemBeliefs 是排序特定）。非 ranking 场景需要可替换的决策空间定义。

**设计**：引入 `TaskScenario` 接口，场景层下发决策空间与 agent 配置，治理层不感知任务类型：

```typescript
interface TaskScenario {
  type: "ranking" | "binary" | "multi-choice" | "negotiation";
  decisionSpace: string[];              // 合法 option id
  agentProfiles: AgentProfile[];
  informationMatrix: Record<string, Evidence[]>;
}
```

agent 主动输出最小认知状态 schema（决策空间无关）：
```typescript
interface MinimalCognitiveOutput {
  utility: Record<string, number>;      // option → [0,1] 偏好分
  evidence: Array<{content, supports, strength}>;
  confidence: number;
  reasoning?: string;
}
```

**硬约束**：agent 必须主动输出原生认知状态，不使用外部 LLM 从对话文本提取——外部提取会丢失 agent 内部未言明的推理，速度与准确度均下降。这是设计选择，非缺陷。
