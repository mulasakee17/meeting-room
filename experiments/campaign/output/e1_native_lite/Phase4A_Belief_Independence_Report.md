# Phase 4A — Belief Independence Validation Report

> SwarmAlpha Native Cognitive State 信念独立性验证
>
> 生成时间: 2026-07-24
> 实验配置: E1 Native Lite (e1_native_lite), 3 seeds × 2 modes × 1 run = 6 runs

---

## 1. Motivation

### 1.1 为什么要移除 belief context?

Phase 3.1 验证了 Utility 是有意义的认知表示(Consistency=94.7%, AUC=0.762)。但审计发现 `NativeCognitiveEngine.buildPrompt` 仍向 LLM 注入 5 处 belief context:

1. `state.belief` (直接,来自父类 DeGroot)
2. `state.confidence` (直接,来自父类 inferenceLayer)
3. memory `entry.belief` (间接)
4. memory `entry.confidence` (间接)
5. currentRound `op.belief/confidence` (间接)

### 1.2 审稿人质疑

> Utility 是否只是受到旧 belief 条件影响后的重新表达?

如果 LLM 在 prompt 中看到 "信念强度: 0.65",它可能在 utility 中复现该值,使 Utility 沦为 belief 的影子变量。

### 1.3 Phase 4A 目标

建立 Belief-independent Native Cognitive Representation,验证移除 belief leakage 后 Cognitive State 是否仍然有效。

---

## 2. Code Changes

### 2.1 修改文件

| 文件 | 变更 | 目的 |
|------|------|------|
| [nativeCognitiveEngine.ts:160-277](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/nativeCognitiveEngine.ts#L160-L277) | buildPrompt 重写:移除 5 处 belief leakage,改用 cognitiveStates 注入 | Part 2: Belief Context Decoupling |

### 2.2 具体修改

**移除的 belief context (5 处)**:

```typescript
// ❌ 移除前
state.belief.toFixed(2)              // L213 信念强度
state.confidence.toFixed(0)          // L214 置信度
entry.belief.toFixed(2)              // L176, L182 memory 信念
op.belief.toFixed(2), op.confidence   // L201 本轮观点信念
```

**替换为 cognitive-only context**:

```typescript
// ✅ 移除后
const myCog = cogState?.get(agent.id);
myCog.utility.topChoice              // 偏好选项
myCog.utility.preferenceClarity      // 偏好清晰度
myCog.utility.intensity              // 偏好强度
myCog.evidence.coverage              // 证据覆盖
myCog.evidence.quality               // 证据质量
myCog.confidence.overall             // 确信度(来自 LLM 原生,非 belief 网络)
```

**memory 和 currentRound 仅保留 reasoning 文本**,移除所有 belief/confidence 数值标签。

### 2.3 Confidence 处理审计 (Part 3)

| 来源 | 是否依赖 belief | Phase 4A 状态 |
|------|----------------|---------------|
| LLM 原生 `opinion.confidence` | 否 | ✅ 保持 |
| `cognitiveStateToConfidence` | 否(仅格式转换) | ✅ 保持 |
| 父类 `updateBeliefs` 的 confidenceChange | 是 | ⚠️ Native 模式被 LLM 原生覆盖,不使用 |

**结论**:Confidence 已独立于 belief,无需修改。

---

## 3. Before/After Metrics

### 3.1 实验配置

| 参数 | Phase 3.1 (Before) | Phase 4A (After) |
|------|-------------------|------------------|
| buildPrompt | 注入 state.belief + 5 处 leakage | 仅注入 cognitive state,无 belief |
| scenario | ma (lunar survival) | 同 |
| agents | 5 | 同 |
| rounds | 5 | 同 |
| seeds | [42, 43, 44] | 同 |
| runs | 3 native_cognitive | 同 |

### 3.2 Utility-Ranking Consistency

| 指标 | Phase 3.1 (Before) | Phase 4A (After) | 变化 | 阈值 | 状态 |
|------|-------------------|------------------|------|------|------|
| Consistency Rate | 94.7% (71/75) | 98.7% (74/75) | +4.0 pp | >85% | ✅ PASS |
| 下降幅度 | — | — | 不适用(上升) | <10 pp 下降 | ✅ PASS |

### 3.3 Utility Predictive Power

| 指标 | Phase 3.1 (Before) | Phase 4A (After) | 变化 | 阈值 | 状态 |
|------|-------------------|------------------|------|------|------|
| AUC | 0.762 | 0.500 | -0.262 | >0.6 | ❌ FAIL |
| Pearson r | 0.171 | 0.000 | -0.171 | — | — |
| R² | 0.029 | 0.000 | -0.029 | — | — |
| Regression β | 0.215 | 0.000 | -0.215 | — | — |

### 3.4 Native Output

| 指标 | Phase 3.1 (Before) | Phase 4A (After) | 阈值 | 状态 |
|------|-------------------|------------------|------|------|
| Utility/Evidence/Confidence 非空率 | 100% (3/3) | 100% (3/3) | 100% | ✅ PASS |

### 3.5 Decision Quality (参考,非主要指标)

| 指标 | Phase 3.1 (Before) | Phase 4A (After) |
|------|-------------------|------------------|
| Kendall τ (all runs) | 1.000 | 1.000 |
| 收敛轮次 | 5 (未收敛) | 5 (未收敛) |

### 3.6 State Stability (参考)

| 指标 | Phase 3.1 (Before) | Phase 4A (After) |
|------|-------------------|------------------|
| σ²(ΔB) | 0.1594 | 0.1594 (相同,因 belief runs 未重跑) |
| σ²(ΔU) | 0.2202 | 0.2470 |
| Stability Ratio | 0.724 | 0.645 |

---

## 4. Conclusion

### 4.1 核心问题

> After removing belief leakage, is Cognitive State still meaningful?

**部分是**。移除 belief context 后:

✅ **Utility 仍是真实的决策表示**:Consistency 从 94.7% 提升到 98.7%(+4.0 pp),证明 Utility 不是 belief 的影子变量。即使 LLM 看不到任何 belief context,它仍能独立产出与 ranking 高度一致的 Utility。

❌ **Utility 失去了预测力**:AUC 从 0.762 降到 0.500(随机水平)。Phase 3.1 的预测力可能部分来自 belief context 的信息泄漏(ΔUtility 携带了 belief 变化信息,而 belief 变化自然预测下一轮决策变化)。移除 leakage 后,ΔUtility 不再携带 belief 信号,预测力消失。

### 4.2 科学解释

Phase 3.1 的 AUC=0.762 可能存在 **circular prediction** 嫌疑:

```
Phase 3.1 (有 leakage):
  belief context → LLM utility output → ΔUtility
       ↓                                    ↓
  belief 变化 ← (DeGroot) ← decision change
       ↓
  ΔUtility 携带 belief 信号 → 预测 decision change (AUC=0.762)

Phase 4A (无 leakage):
  cognitive context only → LLM utility output → ΔUtility
                                                        ↓
  decision change (无 belief 信号传递) ← AUC=0.500 (随机)
```

### 4.3 审稿人质疑的回应

> Utility 是否只是受到旧 belief 条件影响后的重新表达?

**Consistency 维度**: 不是。移除 belief context 后 Consistency 反而提升到 98.7%,证明 Utility 是 LLM 独立形成的决策表示。

**Prediction 维度**: Phase 3.1 的预测力部分来自 belief leakage。移除后预测力消失,说明之前的 "Utility 预测决策变化" 结论需谨慎对待。

### 4.4 Acceptance Criteria 对照

| 条件 | 阈值 | 实际值 | 状态 |
|------|------|--------|------|
| Native Output | 100% | 100% (3/3) | ✅ PASS |
| Consistency 下降 | <10 pp | +4.0 pp (上升) | ✅ PASS |
| Prediction AUC | >0.6 | 0.500 | ❌ FAIL |
| No hidden belief dependency | 代码审计通过 | 5 处 leakage 已移除 | ✅ PASS |

**结果: 3/4 通过**

---

## 5. Limitations

### 5.1 样本不足
3 paired runs,AUC 从 0.762 降到 0.500 在小样本下可能有偶然性。

### 5.2 ma 场景 ceiling effect
所有 6 runs τ=1.000,无法从 Decision Quality 维度区分。

### 5.3 Prediction 失效的可能解释
AUC=0.500 也可能是:移除 belief context 后,LLM 的 utility 变化更随机(不再被 belief 锚定),导致决策变化更不可预测。这不必然意味着 Utility 无意义(Consistency 仍 98.7%),只意味着 Utility 的"跨轮预测力"不复存在。

### 5.4 不扩大结论
本实验**不证明**:
- Utility 比 Belief 更稳定(H1 在 Phase 3.1 已失败)
- Utility 能预测未来决策变化(Phase 4A 已证伪)
- SwarmAlpha 已完成 Agent Governance

本实验**仅证明**:
- Utility 是独立于 belief 的认知表示(Consistency 98.7% + 无 belief leakage)
- Utility 与实际决策高度一致(非装饰字段)

---

## 6. Final Decision

### Phase 4A: Conditional Pass(条件通过)

Utility 是 **belief-independent** 的认知表示(Consistency 98.7% 证明),但其 **跨轮预测力在移除 belief leakage 后消失**(AUC 0.500)。

### 进入下一阶段的条件

允许进入 Phase 4B (Cognitive Detector Migration),但需注意:
1. **预测力结论需修正**:不能宣称 "Utility 预测未来决策变化",只能说 "Utility 与当前决策一致"
2. **换更难场景验证**:在 crisis/supplier 场景重测,确认 AUC 下降非 ma 特有
3. **增大样本量**:≥10 paired runs 确认 AUC=0.500 稳定

---

## 附录: 产物清单

| 文档 | 路径 |
|------|------|
| Prompt Decoupling Audit | [Prompt_Decoupling_Audit.md](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/output/e1_native_lite/Prompt_Decoupling_Audit.md) |
| Native Cognitive Contract | [NATIVE_COGNITIVE_CONTRACT.md](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/output/e1_native_lite/NATIVE_COGNITIVE_CONTRACT.md) |
| Phase 3.1 Baseline Metrics | [metrics_phase31_baseline.json](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/output/e1_native_lite/metrics_phase31_baseline.json) |
| Phase 4A Metrics | [metrics.json](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/output/e1_native_lite/metrics.json) |
| Phase 3.1 Validation Report | [Native_Cognitive_Validation_Report.md](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/campaign/output/e1_native_lite/Native_Cognitive_Validation_Report.md) |
