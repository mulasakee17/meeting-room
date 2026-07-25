# Native Cognitive Representation Validation Report

> SwarmAlpha Phase 3.1 — Native Cognitive State 科研价值验证
>
> 生成时间: 2026-07-24
> 实验配置: E1 Native Lite (e1_native_lite)
> 场景: lunar survival (ma), agents=5, rounds=5, seeds=[42,43,44], 6 runs

---

## 0. 实验目的

验证 Native Cognitive State (Utility / Evidence / Confidence) 是否是独立、有意义、可预测的认知表示,而不是 LLM 输出的装饰字段。

**不验证**: 治理闭环、Detector 准确性。当前阶段仅验证 Cognitive State 本身的科研价值。

---

## 1. Data Flow Verification

**研究问题**: Utility 是否真正来自 LLM 原生输出,而非 belief→utility 转换?

### 数据流追踪

```
LLM Output (nativeCognitiveEngine.buildPrompt)
  → Prompt 要求输出: cognitiveState: { utility, evidenceCoverage, evidenceQuality }
  ↓
Parser (NativeCognitiveOpinionParser.parseOpinion)
  → 直接提取: opinion.cognitiveState.utility / evidenceCoverage / evidenceQuality
  ↓
State Update (updateCognitiveStatesFromRound)
  → Utility: DeGroot 更新,源数据为 LLM 原生 utility (非 belief 反推)
  → Evidence: coverage/quality 直接来自 LLM
  → Confidence: 直接来自 LLM opinion.confidence
  ↓
Metrics (MetricComputer.computeE1Stability)
  → σ²(ΔU) 消费 cognitiveTrajectory.utility
  → Consistency 比较 utilityTopChoice vs rankingTopChoice
  ↓
Decision (Runner.runSingle)
  → finalKendallTau 来自 LLM itemBeliefs.rank
```

### 结论

✅ **Utility 是 Native 的**。3 个 native_cognitive runs 中 100% 产生非空 Utility/Evidence/Confidence 字段,且:
- Utility 直接从 `opinion.cognitiveState.utility` 提取 (LLM 原生)
- Evidence.coverage/quality 直接从 `opinion.cognitiveState.evidenceCoverage/evidenceQuality` 提取
- 无 `utility = transform(belief)` 转换

### 已知局限 (循环论证残留)

`buildPrompt` 仍将 `state.belief` 和 `state.confidence` 注入 LLM 上下文 (nativeCognitiveEngine.ts:204-205)。这不构成数据层的 belief→utility 转换(Utility 字段是 LLM 独立输出的),但构成 prompt context 层面的信息泄漏。建议后续从 prompt 中移除 belief 字段。

---

## 2. Stability Result

**研究问题**: Utility 是否比 Belief 更稳定 (σ²(ΔU) < σ²(ΔB))?

### 结果

| 指标 | 值 |
|------|-----|
| σ²(ΔB) | 0.1594 |
| σ²(ΔU) | 0.2202 |
| Stability Ratio (σ²ΔB / σ²ΔU) | 0.724 |
| Permutation Test p-value | 0.8678 |
| 显著性 | ❌ 不显著 |

### Per-Run 稳定性比

| Run | Ratio | 方向 |
|-----|-------|------|
| seed42 | 1.126 | ΔU 更稳定 ✅ |
| seed43 | 0.732 | ΔB 更稳定 ❌ |
| seed44 | 0.245 | ΔB 更稳定 ❌ |

### 结论

⚠️ **H1 未通过**。聚合稳定性比 0.724 < 1,意味着 Utility 的跨轮方差略高于 Belief。3 个 run 方向不一致 (1 个支持 H1, 2 个反对)。

### 可能原因 (不声称已证实)

1. **ma 场景 ceiling effect**: 所有 6 runs τ=1.000,任务过易,信念本身就很稳定,Utility 的 DeGroot 更新反而引入额外波动
2. **尺度不可比**: ΔU 是 5 维向量的 L2 距离,ΔB 是标量绝对差,直接比方差可能不公平
3. **样本不足**: 3 paired runs 不足以区分方向性信号,perRunRatios 跨度 [0.245, 1.126] 显示高方差

---

## 3. Consistency Result

**研究问题**: Utility 是否对应实际决策 (Utility argmax == LLM ranking rank=1)?

### 结果

| 指标 | 值 |
|------|-----|
| Consistency Rate | 94.7% |
| Consistent Count | 71 / 75 |
| 阈值 | > 60% |
| 状态 | ✅ 通过 |

### 结论

✅ **Utility 与实际决策高度一致**。75 个 (agent × round) 比较中,71 个的 Utility argmax 与 LLM itemBeliefs rank=1 相同。这证明 Utility 不是装饰字段,而是真实反映 LLM 决策意图的认知表示。

---

## 4. Predictive Result

**研究问题**: 当前 Utility 状态是否包含未来 opinion change 信息?

### 方法

- 自变量: ΔUtility(t) = L2(|U(t) - U(t-1)|)
- 因变量: Decision Change(t+1) = [ranking(t+1) ≠ ranking(t)] (0/1)
- 配对: (ΔUtility(t), DecisionChange(t+1)), 样本量 n=45

### 结果

| 指标 | 值 | 解读 |
|------|-----|------|
| Pearson r | 0.171 | 弱正相关 |
| Regression β | 0.215 | ΔUtility↑ → 决策变化概率↑ |
| R² | 0.029 | 仅解释 2.9% 方差 |
| AUC (逻辑回归) | 0.762 | 中等预测力 (>0.5 随机) |
| 样本量 | 45 | — |

### 结论

⚠️ **Utility 具有弱但存在的预测力**。ΔUtility 与下一轮决策变化呈弱正相关 (r=0.171),AUC=0.762 高于随机基线。但 R²=0.029 极低,说明 Utility 变化只能解释极小部分的决策变化方差。

**不声称因果**: 这是相关性分析,ΔUtility 与 DecisionChange 可能受共同因素驱动,不能推断 Utility 变化导致决策变化。

---

## 5. Limitations

### 5.1 架构局限

- **Detector 仍基于 belief**: 当前所有 Detector (Echo Chamber / Authority Bias / Polarization / Premature Consensus) 消费标量 `o.belief`,不消费 Cognitive State。五维度 (Utility/Evidence/Inertia/Confidence/Susceptibility) 不进入检测-治理决策。
- **Governance 未闭环**: Intervention 修改 `agentStates` (旧 belief),不直接修改 `cognitiveStates`。Cognitive State 是并行观察层,非治理驱动层。

### 5.2 实验局限

- **样本不足**: 3 paired runs,无法做统计显著性推断 (p=0.8678 不显著但样本量极小)
- **ma 场景 ceiling effect**: 所有 6 runs τ=1.000,无法区分 belief vs native 的决策质量差异
- **尺度不可比**: ΔU (多维 L2) 与 ΔB (标量绝对差) 直接比方差存在尺度偏差
- **循环论证残留**: buildPrompt 注入 state.belief 给 LLM (见 Section 1)

### 5.3 数据完整性

本次实验过程中修复了两个 P0 bug:
1. **循环依赖 crash**: barrel re-export 导致 NativeCognitiveEngine 无法初始化 (已修复: 移除 re-export)
2. **σ²(ΔU)=0 假象**: Runner 在实验结束后重复提取最终状态而非逐轮历史 (已修复: NativeCognitiveEngine 存储每轮深拷贝)

---

## 6. Acceptance Criteria 对照

| 条件 | 阈值 | 实际值 | 状态 |
|------|------|--------|------|
| Native Output | 100% 产生 Utility/Evidence/Confidence | 100% (3/3 runs) | ✅ PASS |
| Consistency | > 60% | 94.7% | ✅ PASS |
| Stability | Utility variance 方向上低于 belief | ratio=0.724 (方向相反) | ❌ FAIL |
| Pipeline | 完整通过 Simulation→State→Metrics→Statistics→Report | 完整通过 | ✅ PASS |

**结果: 3/4 通过**

---

## 7. Final Decision

### 结论

**Native Cognitive Representation Validation: 条件通过 (Conditional Pass)**

### 依据

Utility 是一个**有意义的认知表示**,而非装饰字段:
- 94.7% 的 Utility-Ranking 一致率证明它真实反映决策意图
- AUC=0.762 证明它包含未来决策变化的预测信息

但 **H1 稳定性假设在当前配置下不成立**:
- 聚合 ratio<1,且 3 runs 方向不一致
- ma ceiling effect + 尺度不可比 + 样本不足是主要干扰因素

### 不扩大结论

本实验**仅证明** "Cognitive State 是一个有意义的、值得用于治理的状态表示"。
本实验**不证明** "SwarmAlpha 已经完成 Agent Governance" 或 "Utility 比 Belief 更稳定"。

### 进入下一阶段的条件

允许进入 Cognitive Governance Integration,但需在下一阶段补充验证稳定性:

1. **换更难场景** (crisis 或 supplier) 重测 H1,消除 ceiling effect
2. **增大样本量** (≥10 paired runs) 使稳定性比有统计意义
3. **尺度归一化** (ΔU/||U|| vs ΔB/|B|) 消除维度尺度偏差

---

## 附录: 实验配置与代码变更

### A. 实验配置 (e1_native_lite.ts)

```typescript
seeds: [42, 43, 44]
runsPerSeed: 1
runtimeModes: ["belief", "native_cognitive"]
governanceMode: "none"
agentCount: 5, maxRounds: 5
// 总计: 3 seeds × 2 modes × 1 run = 6 runs
```

### B. 代码变更清单

| 文件 | 变更 | 目的 |
|------|------|------|
| run_all.ts:172-174 | cognitiveData filter 加 native_cognitive | 修复 P0: 分析数据被丢弃 |
| nativeCognitiveEngine.ts | 新增 cognitiveStateHistory + getCognitiveStateHistory() | 修复 P0: σ²ΔU=0 假象 |
| nativeCognitiveEngine.ts:415-435 | updateCognitiveStatesFromRound 存深拷贝 | 同上 |
| Runner.ts:142-196 | extractCognitiveSnapshots 用历史数据 | 同上 |
| Runner.ts | 新增 rankingTopChoice 提取 | Part 3 Consistency 数据源 |
| types.ts | CognitiveStateSnapshot + ExperimentMetrics 扩展 | Part 3/4 类型支持 |
| MetricComputer.ts | computeE1Stability 新增 Consistency + Prediction | Part 3/4 指标计算 |
| e1_native_lite.ts | 新建 | Lite 实验配置 |
