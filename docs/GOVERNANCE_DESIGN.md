# 治理引擎架构设计：闭合"自定义检测器→干预"断裂

> 状态：**已落地**（2026-07-22 设计 + 实现完成，310 测试 307 通过 3 网络超时，零回归）
> 性质：架构决策记录（ADR），记录"为什么要改、怎么改、不改什么"
> 关联：LIMITATIONS.md §19 已标记"自定义检测器无法触发干预"为已修复

---

## 1. 背景：断裂现象

SwarmAlpha 治理引擎对外暴露 `registerDetector()` API（[types.ts:260 BiasDetector](../src/lib/governance/types.ts)），允许用户注册自定义偏差检测器。但体检发现该 API 是"半开放"的：

- **能检测**：自定义检测器在 [governance/index.ts:280-290](../src/lib/governance/index.ts) 的 `diagnose()` 中被执行，结果推入 `GovernanceResult.otherIssues`
- **不能干预**：[diagnoseAndIntervene():1006-1237](../src/lib/governance/index.ts) 只读 7 个强类型检测字段（authorityBias/echoChamber/polarization/prematureConsensus/informationWithholding/ignoredInput/reasoningActionMismatch），**从不读 `result.otherIssues`**

这意味着用户注册的自定义检测器即使检测到严重偏差，也无法触发任何干预——与 [types.ts:246-258](../src/lib/governance/types.ts) 注释暗示的"扩展性"不符。这是平台健康度的一个红色架构裂缝。

---

## 2. 断裂精确定位（双层）

### 2.1 接口层：检测器无法声明"建议什么干预"

`DetectorResult`（[types.ts:275-280](../src/lib/governance/types.ts)）当前定义：

```typescript
export interface DetectorResult {
  detected: boolean;
  severity: SeverityLevel;
  description: string;
  agents?: string[];
  // ← 缺：建议的干预类型与目标
}
```

`GovernanceIssue`（[types.ts:157-162](../src/lib/governance/types.ts)）同样无 intervention 字段。自定义检测器经 `diagnose()` 推入 `otherIssues` 后，"该用什么干预"的信息丢失。

### 2.2 执行层：diagnoseAndIntervene 不消费 otherIssues

`diagnoseAndIntervene`（[index.ts:1006-1237](../src/lib/governance/index.ts)）的 7 个 `if` 块各自读取一个强类型检测字段，构造 `Intervention` 推入数组。**没有任何代码路径读取 `result.otherIssues`**。

### 2.3 约束

- `InterventionType` 是 5 值闭合联合（[types.ts:3-8](../src/lib/governance/types.ts)，H8 有意设计）：`introduce_diversity | reduce_weight | force_reflection | continue_discussion | none`。自定义检测器只能建议已有的 4 种干预，不引入新类型。
- 已有 `strategies: Map<InterventionType, InterventionStrategy>`（[index.ts:52](../src/lib/governance/index.ts)）和 `customDetectors: Map<string, BiasDetector>`（[index.ts:54](../src/lib/governance/index.ts)）两个注册表可复用，**无需新建注册表**。

---

## 3. 选定方案：方案 A（最小改动闭合断裂）

### 3.1 设计原则

- **向后兼容**：新增字段均为可选，现有 4 个内置检测器走强类型字段路径，不受影响
- **不动 7 个 if**：避免破坏 303 测试，降低回归风险
- **复用现有 dosage 逻辑**：自定义检测器的干预走与内置检测器相同的 `computeAdaptiveDosage` 路径
- **保留观测模式**：自定义检测器可不带 `suggestedIntervention`，仅记录不触发干预（用于纯诊断场景）

### 3.2 接口扩展

```typescript
// types.ts — DetectorResult 加可选建议
export interface DetectorResult {
  detected: boolean;
  severity: SeverityLevel;
  description: string;
  agents?: string[];
  /** 自定义检测器建议的干预。留空则仅记录不触发干预（观测模式）。
   *  type 必须是 InterventionType 闭合联合的成员（H8 约束）。 */
  suggestedIntervention?: {
    type: InterventionType;
    targetAgents?: string[];       // 缺省取 result.agents
    parameters?: Record<string, unknown>;
    reason?: string;
  };
}

// GovernanceIssue 同步透传（otherIssues 的元素类型）
export interface GovernanceIssue {
  type: string;
  severity: SeverityLevel;
  description: string;
  agents?: string[];
  suggestedIntervention?: DetectorResult["suggestedIntervention"];
}
```

### 3.3 diagnose() 透传

[index.ts:283-288](../src/lib/governance/index.ts) 推入 otherIssues 时透传 `suggestedIntervention`：

```typescript
if (result.detected) {
  issues.push({
    type: detector.type,
    severity: result.severity,
    description: result.description,
    agents: result.agents,
    suggestedIntervention: result.suggestedIntervention,  // 新增
  });
}
```

### 3.4 diagnoseAndIntervene() 消费 otherIssues

在 7 个 if 之后、干预排序之前（[index.ts:1224](../src/lib/governance/index.ts) `rankInterventions` 调用前）插入统一循环：

```typescript
// 闭合自定义检测器→干预断裂：消费 otherIssues 中的建议
for (const issue of result.otherIssues) {
  const sug = issue.suggestedIntervention;
  if (!sug || !shouldTrigger(sug.type)) continue;

  const targetAgents = sug.targetAgents ?? issue.agents ?? [];
  // continue_discussion 无需 targetAgents；其他类型要求至少 1 个目标
  if (targetAgents.length === 0 && sug.type !== "continue_discussion") continue;

  // 复用与内置检测器相同的 adaptiveDosage 逻辑
  let params = { ...sug.parameters };
  if (useAdaptiveDosage) {
    const dosage = computeAdaptiveDosage({
      severity: this.severityToScore(issue.severity),
      informationCoverage,
      historyEffectiveness: this.getHistoryEffectiveness(sug.type),
      roundProgress,
      agentCount: agentIds.length,
      baseMaxRounds: maxRounds,
    });
    // 按 sug.type 合入对应剂量参数（与 7 个 if 内逻辑一致）
    params = this.mergeDosageParams(sug.type, params, dosage);
  }

  interventions.push({
    type: sug.type,
    targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
    parameters: { ...params, reason: sug.reason ?? issue.description },
    effect: "",
    applied: false,
  });
}
```

`mergeDosageParams` 是新抽的 private helper，按 `sug.type` 映射 dosage 字段（`weightReduction` / `perturbationAmount` / `reflectionStrength` / `additionalRounds`），与 7 个 if 内的字段一致。

---

## 4. 方案 B（未采用，留作演进）

抽出 `DETECTOR_INTERVENTION_MAP` 数据驱动映射表，7 个 if 替换为统一遍历。彻底消除硬编码 if，但改动 230 行核心逻辑，需回归全部 303 测试。若未来教授反馈关注代码架构整洁度，或项目开源招贡献者，再启动。

方案 A 的 `suggestedIntervention` 字段已为方案 B 的映射表铺路——未来重构时自定义检测器已有声明干预的标准方式。

---

## 5. 影响评估

| 维度 | 评估 |
|---|---|
| 向后兼容 | ✅ `suggestedIntervention` 可选，现有内置检测器与所有调用方零改动 |
| 测试风险 | ✅ 不动 7 个 if，303 测试零破坏。新增 3 个测试用例验证闭合 |
| InterventionType 闭合联合 | ✅ 不引入新类型，复用 H8 现有设计 |
| 自适应剂量 | ✅ 复用 `computeAdaptiveDosage`，与内置检测器同路径 |
| F 分解排序 | ✅ 自定义干预进入 `interventions` 数组后，统一走 `rankInterventionsByFreeEnergy`，与内置干预同等排序 |
| disabledInterventions | ✅ `shouldTrigger(sug.type)` 检查，禁用的干预类型不触发 |
| 最后一轮拦截 | ✅ `isLastRound` 在循环前 return，自定义干预也不会在最后一轮触发 |
| 文档同步 | 需更新 DEVELOPER_GUIDE §8.2（添加新检测器示例加 suggestedIntervention）+ LIMITATIONS §19（标记断裂已闭合）|

---

## 6. 落地步骤（明早执行）

1. [types.ts](../src/lib/governance/types.ts)：`DetectorResult` + `GovernanceIssue` 加 `suggestedIntervention?` 可选字段
2. [index.ts:283-288](../src/lib/governance/index.ts)：`diagnose()` 推入 otherIssues 时透传 `suggestedIntervention`
3. [index.ts:1224](../src/lib/governance/index.ts) 前：插入消费 `otherIssues` 的统一循环 + `mergeDosageParams` helper
4. [test/governance.test.ts](../test/governance.test.ts)：加 3 个用例：
   - 注册带 `suggestedIntervention` 的自定义检测器 → 验证干预被触发
   - 注册不带 `suggestedIntervention` 的自定义检测器 → 验证仅观测、不触发干预
   - `disabledInterventions` 包含建议类型 → 验证被拦截
5. DEVELOPER_GUIDE §8.2：示例代码加 `suggestedIntervention` 用法
6. LIMITATIONS §19：登记"自定义检测器→干预断裂已闭合（方案 A）"

预计改动 ~60 行（含测试），303 测试零破坏。

---

## 7. 设计决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 接口扩展 vs 映射表重构 | 接口扩展（方案 A） | 谨慎重构、低风险、向后兼容 |
| suggestedIntervention 必填 vs 可选 | 可选 | 保留纯观测模式，不强制所有自定义检测器都触发干预 |
| 是否引入新 InterventionType | 否 | H8 闭合联合是有意设计，自定义检测器复用现有 4 种干预 |
| dosage 逻辑复用 vs 独立 | 复用 `computeAdaptiveDosage` | 保证自定义与内置干预的剂量逻辑一致 |
| 是否同步做方案 B | 否 | 留作演进，等教授反馈或开源需求 |

---

**版本**：v1.0（2026-07-22 设计）
**状态**：待执行 → 明早落地后更新为"已落地"，并在 LIMITATIONS.md §19 登记
