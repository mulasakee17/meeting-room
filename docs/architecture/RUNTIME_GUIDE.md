# 运行时技术指南

> **历史运行时快照（2026-08-04）：**本文描述 legacy 运行路径。V6 权威实验路径、schema-5、task manifest、final private elicitation 与治理审计链应以当前实现和对应 V6 架构文档为准。

> 面向外部开发者。讲解系统当前如何运行,基于 2026-08-04 代码自检结果。
> 所有行号引用真实代码位置,可逐行核查。

## 1. 系统解决什么问题

当多个 LLM Agent 形成集体决策时,如何在不依赖 Ground Truth 的情况下,检测正在形成的集体认知异常(信息坍缩、权威集中、错误共识、证据忽视)。

系统提出三层级联监测架构:

```
Tier 1 热力学筛查(零成本,每轮必跑)
  ├─ 正常 → 继续(跳过 Tier 2/3)
  └─ 异常 → Tier 2 δ 诊断(纯数学,检测行为矛盾)
       ├─ 根因清晰 → 直接干预
       └─ 根因模糊 → Tier 3 SemanticTool(LLM 语义传感器)
```

## 2. 核心运行路径:一次讨论的完整流程

### 2.1 入口

讨论由 `NativeCognitiveEngine` 驱动,继承自 `DiscussionEngine`。

- 引擎实例化:[nativeCognitiveEngine.ts:217](../../src/lib/discussion/nativeCognitiveEngine.ts#L217) `measurementLayer: MeasurementLayer`
- 主循环:[index.ts:195](../../src/lib/discussion/index.ts#L195) `for (let round = 1; round <= this.config.maxRounds; round++)`

### 2.2 每轮执行的 7 个步骤

以 B 组(cognitive + δ 同步)为例,逐步骤标注文件:行号。

**步骤 1:收集 opinions**
- [index.ts:231](../../src/lib/discussion/index.ts#L231) `opinions = await this.runRound(participatingAgents, task, round, agentStates)`
- 每个 Agent 调用 LLM 输出 `cognitiveState`(含 utility/evidenceCoverage/evidenceQuality/confidence)
- LLM 输出解析:[nativeCognitiveEngine.ts:72-180](../../src/lib/discussion/nativeCognitiveEngine.ts#L72) `parseNativeCognitiveOutput`

**步骤 2:收敛检查**
- [index.ts:301](../../src/lib/discussion/index.ts#L301) `if (this.checkConvergence(opinions)) break`
- 收敛判据:所有 item 的 belief 标准差 < convergenceThreshold

**步骤 3:belief 更新**
- [index.ts:305](../../src/lib/discussion/index.ts#L305) `this.updateBeliefs(opinions, agentStates, round)`
- 更新标量 belief(用于父类兼容,v6 主路径用 cognitive state)

**步骤 4:治理(δ 诊断 + 干预生成)**
- [index.ts:320](../../src/lib/discussion/index.ts#L320) `const governanceResult = await this.applyGovernance(round, opinions, agentStates, agents)`
- 路径分流:[nativeCognitiveEngine.ts:565-595](../../src/lib/discussion/nativeCognitiveEngine.ts#L565)
  - mode="none" → 父类无治理(A 组)
  - mode="cognitive" + useSemanticTool=false → `applyCognitiveGovernance`(B 组,δ 同步)
  - mode="cognitive" + useSemanticTool=true → `applyCognitiveGovernanceAsync`(C 组,含 SemanticTool)
  - mode="full" + useCognitiveGovernance=false → 父类旧检测器(D 组)

**步骤 5:认知状态更新(消费干预)**
- [index.ts:334](../../src/lib/discussion/index.ts#L334) `this.updateCognitiveStatesFromRound(opinions, agents, round)`
- [nativeCognitiveEngine.ts:531-549](../../src/lib/discussion/nativeCognitiveEngine.ts#L531):调用 `measurementLayer.updateCognitiveStates`,消费 `pendingCognitiveModifications`(步骤 4 生成的干预)
- 计算本轮 post-update 的热力学状态,push 到 thermoHistory

**步骤 6:热力学终止检查**
- [index.ts:344](../../src/lib/discussion/index.ts#L344) `if (this.shouldTerminateEarly(round)) break`
- **修复后时序(2026-08-04)**:在步骤 5 之后调用,用当前轮 post-update 的 thermoState
- [nativeCognitiveEngine.ts:349-363](../../src/lib/discussion/nativeCognitiveEngine.ts#L349):读取 thermoHistory 最后一项,调 `terminationDecider.evaluateSync`

**步骤 7:记录轮次数据**
- [index.ts:346-353](../../src/lib/discussion/index.ts#L346):push 到 roundDataArray

### 2.3 时序设计的关键决策

**为什么治理(步骤 4)在认知状态更新(步骤 5)之前?**

δ 诊断用上一轮的 cognitiveStates(经上一轮步骤 5 更新),生成本轮干预。干预在步骤 5 被消费,下一轮 Agent 的 buildPrompt 能看到干预后的状态。1 轮诊断滞后可接受(cognitive state 渐进变化),但避免了 5 轮讨论中干预仅剩 2-3 轮可用的致命问题。

**为什么终止检查(步骤 6)在认知状态更新(步骤 5)之后?**

2026-08-04 修复(B2+C3):原设计在步骤 4 之前调用,用上一轮 thermoState。问题:F 在步骤 5 中(因新 opinions 纳入)从 >=0.15 跌落到 <0.15 时,当轮 δ 诊断已用旧 F 执行完(可能未触发),下一轮终止直接短路 δ 诊断 → 三层级联失效。修复后用当前轮 post-update 的 F,给 δ 干预 1 轮生效窗口。

## 3. 三层级联架构详解

### 3.1 Tier 1:热力学筛查

**入口**:[MeasurementLayer.ts:1432-1438](../../src/lib/thermodynamics/MeasurementLayer.ts#L1432) `diagnoseAndSuggest` / [L1719-1722](../../src/lib/thermodynamics/MeasurementLayer.ts#L1719) `diagnoseAndSuggestSync`

**筛查逻辑**:[MeasurementLayer.ts:310-324](../../src/lib/thermodynamics/MeasurementLayer.ts#L310) `isThermoAbnormal`

4 条异常判据(任一满足即触发 Tier 2):
1. `R > 0.85 && H < 0.42` — 结晶化风险(高同步 + 低熵 → 信息坍缩)
2. `F < 0.15` — 低自由能(系统过度有序)
3. `H > 0.95 && R < 0.50` — 高熵无序(证据分散无共识)
4. `T > 0.20` — 温度异常(效用剧烈波动)

**通过时**:返回 `EMPTY_DELTA_DIAGNOSIS`([computeDelta.ts:104-114](../../src/lib/thermodynamics/computeDelta.ts#L104)),所有 δ 信号 triggered=false,suggestions 为空。零成本跳过 Tier 2/3。

### 3.2 Tier 2:δ 诊断

**入口**:[MeasurementLayer.ts:1444](../../src/lib/thermodynamics/MeasurementLayer.ts#L1444) `computeDeltaDiagnosis(states, thermo, estimates)`

8 个 δ 信号(全部纯数学,无需 Ground Truth):

| δ 信号 | 检测什么 | 文件:行号 |
|---|---|---|
| δ_polarization | U 向量是否分化严重 | computeDelta.ts |
| δ_1d_mask | 标量共识是否掩盖向量分歧(唯一读 thermo.R 的 δ) | computeDelta.ts:201 |
| δ_evidence_silence | 是否有 agent 证据被系统性忽视 | computeDelta.ts |
| δ_confidence_gap | 自报信心与 U 位置矛盾(stated>=0.8 且偏离群体) | computeDelta.ts:322 |
| δ_stance_flip | agent 突然改变 top choice | computeDelta.ts |
| δ_no_response | 干预后 U 仍不动(门控:susceptibility.usable) | computeDelta.ts:413-417 |
| δ_concentration | 惯性集中在少数 agent | computeDelta.ts |
| δ_consistency | 立场变化幅度与惯性预测矛盾 | computeDelta.ts |

**干预生成**:[MeasurementLayer.ts:1629-1703](../../src/lib/thermodynamics/MeasurementLayer.ts#L1629) `buildDeltaSuggestions`

δ 信号映射到 2 种非破坏性干预:
- `inject_evidence` — 注入信息(信息层干预)
- `rebalance_attention` — 调整发言顺序(结构层干预)

### 3.3 Tier 3:SemanticTool

**门控**:[MeasurementLayer.ts:1521-1530](../../src/lib/thermodynamics/MeasurementLayer.ts#L1521) `shouldConsultSemanticTool`

触发条件(任一):
1. δ_1d_mask 触发
2. ≥3 个 δ 信号同时触发
3. (死代码,已被条件 1 覆盖)

**合并逻辑(2026-08-04 修复 C4)**:[MeasurementLayer.ts:1503-1514](../../src/lib/thermodynamics/MeasurementLayer.ts#L1503)

SemanticTool 返回的 `inject_evidence` 与数学层的按 `targetAgents` 去重:SemanticTool 增强的覆盖同 target 的数学层建议,保留不同 target 的数学层 inject_evidence 和所有 rebalance_attention。（字段已于 08-06 fix#3 从 `targetAgentId` 改为 `targetAgents`；旧字段不存在导致 `Set([undefined])` 合并误删。）

## 4. 热力学状态计算

### 4.1 R/T/H/F 定义(native 路径,MeasurementLayer)

**入口**:[MeasurementLayer.ts:261-289](../../src/lib/thermodynamics/MeasurementLayer.ts#L261) `computeThermoState`

| 量 | 含义 | 计算 | 行号 |
|---|---|---|---|
| R | Utility 向量平均 cosine 相似度 | 归一化到 [0,1] | L263 |
| T | Utility 逐轮 L2 距离归一化均值 | 波动度 | L266 |
| H | Evidence items 的 supports 分布 Shannon 熵 | 归一化到 [0,1] | L269 |
| F | Helmholtz 自由能 | `F = U - T·H`,U=mean(‖u_i‖/√K) | L283 |

**F 解耦验证(2026-08-04)**:用 campaign native_cognitive 数据(n=127)验证:
- r(U, T·H) = -0.087(解耦成立)
- r(U, H) = -0.739(U 与 H 强相关,非完全正交)
- 旧 F=(1-R)+T·H 的 r=0.917(fraud 数据)→ 新 F 显著更解耦

### 4.2 F 进终止决策

**入口**:[TerminationDecider.ts:247-300](../../src/lib/thermodynamics/TerminationDecider.ts#L247) `evaluateSync`

终止判据(优先级从高到低):
1. `round >= maxRounds` → 硬上限终止
2. `F < 0.15`(strongCrystallF) → 强结晶态立即终止(自由能耗尽)
3. `classifyStateSync == "crystallized"` 连续 3 次 → 终止
   - crystallized 判定:`R > 0.85 && T < 0.22 && H < 0.42 && F < 0.25`

## 5. 认知状态 5 维

### 5.1 定义(native 路径)

**入口**:[MeasurementLayer.ts:1113-1279](../../src/lib/thermodynamics/MeasurementLayer.ts#L1113) `updateCognitiveStatesNative`

| 维度 | 字段 | 来源 | 行号 |
|---|---|---|---|
| Utility | utility.scores | DeGroot 加权更新,λ=max((1-ι)(1-c), 0.05) | L1249→cognitiveState.ts:686 |
| Evidence | evidence.coverage/quality | **LLM 自报**(native 路径) | L1147-1148 |
| Evidence | evidence.diversity | Shannon 熵(从 items 的 supports 分布) | L1150 |
| Confidence | confidence.stated | LLM 自报(confidence/100) | L1182 |
| Confidence | confidence.overall | 0.4·evidenceBased + 0.6·LLM(shrinkage) | L1178 |
| Inertia | inertia.strength | 轮内:updateInertia(role+refutation+decay);δ 诊断时:estimateAll 覆写为行为估计 | L1191→cognitiveState.ts:606 / L1476→ProgressiveEstimator.ts:120 |
| Susceptibility | susceptibility.estimate | (1-ι)(1-c),usable 当 exposed≥2 | ProgressiveEstimator.ts:148 |

### 5.2 已知的语义不一致(跨路径)

项目存在三套认知状态更新实现。v6 主实验只用 native 路径,组内一致。但跨路径分析需注意:

| 字段 | Native(MeasurementLayer) | Post-hoc(cognitiveState.ts,@deprecated) |
|---|---|---|
| confidence.stated | LLM 自报 | =overall(伪一致,δ_confidence_gap 永不触发) |
| confidence.stability | 动态(1-\|LLM-prev\|) | 硬编码 0.5 |
| evidence.coverage | LLM 自报 | \|items\|/10(客观计数) |
| evidence.quality | LLM 自报 | 恒=0.5(默认可靠性) |

### 5.3 Inertia 的同轮双赋值(已知设计)

`inertia.strength` 在同轮内被赋值两次:
1. 步骤 5(updateCognitiveStatesFromRound)后:role+refutation+decay 值(系统 A)
2. 步骤 4(applyGovernance → diagnoseAndSuggest)中 estimateAll 后:行为事件融合值(系统 B)

DeGroot 更新(步骤 5 内)用系统 A 的值;δ 检测器(步骤 4 内)用系统 B 覆写后的值。同一字段在 DeGroot 更新和检测器输入中语义不同。这是已知设计,不修改。

## 6. 决策质量评估

### 6.1 Kendall τ 计算链路

```
AgentOpinion.itemBeliefs (每 agent 每轮)
  → Runner.ts:532 聚合最后一轮所有 agent 的 itemBeliefs
  → statsShared.ts:236 extractRanking(按 avgRank 升序)
    → normalizeItemName: 精确→子串→searchKeys 四级匹配
    → 匹配率 <70% 仅 console.warn,不阻断
  → statsShared.ts:291 kendallTau(groundTruth, finalRanking)
    → τ-b 公式,tie 修正 count*(count-1)/2(已修复旧 bug)
```

### 6.2 Ground Truth

university 任务:[task_university.ts:63-72](../../experiments/campaign/tasks/task_university.ts#L63) 定义 8 所大学的正确排名。

## 7. 数据落盘

### 7.1 RawRunData 字段

**定义**:[types.ts:106-267](../../experiments/campaign/types.ts#L106)

关键字段:
- `thermoHistory`:每轮 R/T/H/F(post-update)
- `terminationDecisions`:每轮终止决策(2026-08-04 新增)
- `deltaDiagnosis`:每轮 8 个 δ 信号(**注:Runner 直接调 computeDeltaDiagnosis,绕过 Tier 1 筛查,落盘的 δ 触发率 > 治理路径实际触发率**)
- `interventions`:完整 Intervention 对象(含 targetAgents/effect/applied/parameters)
- `semanticAuditLog`:SemanticTool 审计(C 组)
- `cognitiveTrajectory`:每轮每 agent 的认知状态(含 utility 向量)

### 7.2 已知的数据流不一致

**Runner 的 deltaDiagnosis 绕过 Tier 1**:
- 治理路径:[nativeCognitiveEngine.ts:612](../../src/lib/discussion/nativeCognitiveEngine.ts#L612) 调 `diagnoseAndSuggestSync`(含 Tier 1 门控)
- 落盘路径:[Runner.ts:590](../../experiments/campaign/pipeline/Runner.ts#L590) 直接调 `computeDeltaDiagnosis`(无 Tier 1 门控)

后果:MetricComputer 看到的 δ 触发数 ≥ 治理路径实际触发的 δ 触发数。分析时需区分"诊断分析用 δ"和"治理决策用 δ"。

## 8. 实验配置

### 8.1 v6 Phase 3 主实验(E9)

4 组 × 10 seeds × 5 runs = 200 runs:

| 组 | governanceMode | useSemanticTool | 路径 |
|---|---|---|---|
| A 基线 | none | false | 父类无治理 |
| B δ纯数学 | cognitive | false | applyCognitiveGovernance(同步) |
| C δ+LLM | cognitive | true | applyCognitiveGovernanceAsync(Tier1→2→3) |
| D 旧检测器 | full | false(useCognitiveGovernance=false) | 父类旧检测器 |

任务:university(8 大学 × 6 维度 hidden-profile,5 agent 不对称信息,maxRounds=5,temperature=0.0)

配置文件:[e9_cognitive_governance.ts](../../experiments/campaign/configs/e9_cognitive_governance.ts)

## 9. 已知限制

1. **F 阈值标定**:strongCrystallF=0.15 基于 campaign 数据 F range=[0.19, 0.89],实际 F<0.15 可能极少触发。需 Phase 3 数据验证。
2. **δ_no_response 难触发**:门控要求 exposed≥2,但 maxRounds=5 的短讨论中暴露事件难达 2 次。
3. **U 与 H 强相关(r=-0.739)**:F=U-T·H 的"三变量解耦"成立,但非完全正交。论文需诚实说明。
4. **5 个 agent**:小规模验证,规模化未测。
5. **a2 信息维度**:a2(就业顾问)只掌握 1 个维度(就业率),论文表述需澄清"条"指数据点(8 所大学)而非维度。

## 10. 运行实验

### 10.1 Pilot(单次验证)

```bash
npx tsx experiments/campaign/pilot_v6.ts [a|b]
```

### 10.2 完整实验

```bash
npx tsx experiments/campaign/run_all.ts
```

### 10.3 分析

```bash
npx tsx experiments/campaign/pipeline/MetricComputer.ts
npx tsx experiments/campaign/pipeline/StatisticalTest.ts
```

### 10.4 F 解耦验证(只读)

```bash
npx tsx experiments/campaign/analyze_f_decoupling_verification.ts
```

## 11. 测试

```bash
npx vitest run
```

当前:630 passed | 3 skipped | 0 failed。
