# SwarmAlpha 架构文档

> **本文件是项目的核心架构文档。**
> 所有数字以 [`docs/SOT.md`](../SOT.md) 为单一真相源。
> 最后更新：2026-07-30（v6 Phase 2.5-2.8 完成 + 混合范式架构落地 + Pilot A/B 对照）

---

## 1. 系统概览

SwarmAlpha 是一个 **LLM 多智能体认知治理研究平台**。v6 核心贡献是**混合范式治理架构**：将 LLM 作为数学治理引擎手中的语义传感器（不是决策者，是工具），通过确定性 δ 诊断 + 可选 SemanticTool 异步验证实现分层干预。Pilot A/B 对照（单次验证）显示 δ 治理使 Δτ=+0.215，但需 Phase 3 全量实验确认统计显著性。

**一句话定位**：SwarmAlpha 之于多智能体系统，如同 `eslint` 之于 JavaScript——它不创建 agent，它检查 agent 集体决策得好不好。

### 1.1 架构分层图

```
┌──────────────────────────────────────────────────────────────┐
│                   实验层 (experiments/)                        │
│   run.ts · run_async_ab.ts · analyze_*.ts · e9_smoke_test.ts  │
└───────────────────────────────┬──────────────────────────────┘
                                │ ExperimentConfig
                                ▼
┌──────────────────────────────────────────────────────────────┐
│              治理运行时 SDK (src/runtime/)                     │
│   GovernanceRuntime · AdapterRegistry (3 个适配器)            │
└───────────────────────────────┬──────────────────────────────┘
                                │ DiscussionMessage
                                ▼
┌──────────────────────────────────────────────────────────────┐
│              讨论引擎 (src/lib/discussion/)                    │
│   DiscussionEngine · AsyncDiscussionEngine · NativeCognitive  │
│   ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐     │
│   │ 观测层       │  │ 推理层       │  │ 治理引擎          │     │
│   │ observation │→│ inference   │→│ governance       │     │
│   └─────────────┘  └─────────────┘  └────────┬─────────┘     │
│        ▲                                     ▼               │
│        │            ┌─────────────────────────────┐          │
│        └────────────┤  测量层 (Invariant)          │          │
│                     │  MeasurementLayer            │          │
│                     │  · 社会热力学 R/T/H/F         │          │
│                     │  · 认知状态 U/E/I/C/S         │          │
│                     │  · 16 个检测器                │          │
│                     └─────────────────────────────┘          │
└───────────────────────────────┬──────────────────────────────┘
                                │ LLM 调用
                                ▼
┌──────────────────────────────────────────────────────────────┐
│              LLM 抽象层 (src/lib/llm/)                         │
│   DeepSeek (默认) · OpenAI · Anthropic · Local (Ollama)        │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 关键工程指标（摘自 SOT.md §1）

| 指标 | 数值 | 备注 |
|------|------|------|
| 核心代码行数 | **~22,800 行**（src/） | 不含 test/ 和 experiments/ |
| TypeScript 文件数 | **77**（src/） | |
| 单元测试 | **616 passed, 3 skipped**（27 文件） | `npx vitest run` |
| tsc 类型错误 | **0** | `npx tsc --noEmit` |
| 技术栈 | TypeScript + DeepSeek API + Vitest | |
| 实验文件总数 | **573 JSON**（v2:487 + lunar:85 + .claude:1） | 含已弃用 lunar |
| 论文有效数据 | **169 closed-loop runs** | Crisis 80 + Supplier 89（历史数据） |
| v6 Pilot 数据 | **2 runs**（A 组 1 + B 组 1, seed=42） | 2026-07-30，单次验证，无统计显著性 |
| v6 Phase 3 计划 | **200 runs**（4 组 × 50 runs） | 待启动 |

> ⚠️ 不再使用"19,500 行"、"34,000 行"或"390 tests"等过时数字。

---

## 2. 核心模块（`src/lib/`）

| 模块 | 路径 | 职责 |
|------|------|------|
| **治理引擎** | `src/lib/governance/` | 16 检测器（4 经典 + 3 FC2 + 6 认知 + 3 FC1/FC3）+ 干预策略 + F 分解排序 + 自适应阈值/剂量 |
| **讨论引擎** | `src/lib/discussion/` | 同步/异步多轮讨论 + 拓扑层 + 交叉质证 |
| **测量层** | `src/lib/thermodynamics/` | MeasurementLayer + TerminationDecider（社会自由能诊断 + 终止决策） |
| **评估引擎** | `src/lib/evaluation/` | 5 维决策质量评分（共识/可靠性/离散度/稳定性/影响力） |
| **观测层** | `src/lib/observation/` | LLM 输出 → 结构化 `AgentOpinion`（4 层容错 JSON 解析） |
| **推理层** | `src/lib/inference/` | 规则化信念更新（同伴拉力 + 多数效应 + 影响力扩散），**非 LLM 调用** |
| **认知状态** | `src/lib/agent/cognitiveState.ts` | 5 维认知状态定义与演化 |
| **LLM 抽象** | `src/lib/llm/providers.ts` | 多提供商统一接口，3 次指数退避重试 |
| **因果分析** | `src/lib/analysis/causalEffect.ts` | 最近邻轨迹匹配 + 反事实估计 |
| **共享工具** | `src/lib/utils/` | statsUtils / jsonUtils / retry / logger |
| **安全** | `src/lib/security/` | 速率限制（token bucket）+ 输入验证（XSS/SQLi/路径穿越） |
| **框架适配器** | `src/lib/adapters/` | 内部辅助适配（核心适配器在 `src/runtime/adapters/`） |

### 2.1 关键设计原则

> **v6 混合范式：LLM 作为语义传感器，数学做决策。** 确定性 δ 诊断（零 LLM 成本）作为 Tier 1+2 筛查层；当 δ 触发且需要语义验证时，SemanticTool 作为 Tier 3 异步调用 LLM（可选）。这创造了一种新的 MAS 治理架构——LLM 不是决策者，是数学治理引擎手中的工具。关闭 Tier 3 → 退化为纯数学框架（B 组部署模式）；开启 Tier 3 → 混合范式（C 组部署模式）。

---

## 3. 治理运行时（GovernanceRuntime + AdapterRegistry）

### 3.1 GovernanceRuntime（`src/runtime/GovernanceRuntime.ts`）

可嵌入的公共 API，零 Next.js / React 依赖。提供两种使用模式：

| 模式 | 用途 | 入口 |
|------|------|------|
| **嵌入式 SDK** | `import { GovernanceRuntime }` 作为库 | 生产级多智能体系统 |
| **研究平台** | Next.js + REST API + UI | 学术研究、消融实验 |

核心方法：

```typescript
class GovernanceRuntime {
  processRound(messages: DiscussionMessage[]): GovernanceRoundResult
  onMessage(message: DiscussionMessage): void       // 流式模式
  evaluate(decisions, agents, history, finalDecision): EvaluationResult
  evaluateFromState(finalDecision): EvaluationResult
  getSessionResult(finalDecision): GovernanceSessionResult
  registerDetector(detector: BiasDetector): void     // 扩展自定义检测器
  registerStrategy(strategy: InterventionStrategy): void
  onBiasDetected(handler) / onIntervention(handler) / onRoundComplete(handler)
  reset(): void
}
```

### 3.2 AdapterRegistry（3 个适配器）

| 适配器 | 框架 | 状态 | 用途 |
|--------|------|------|------|
| `CustomAdapter` | 内置 CustomAgent | ✅ 全功能 | **所有实验基于此** |
| `StateInferenceBridge` | 任意框架 | ✅ 可用 | 通过 prompt 注入接入任意框架 |
| `AutoGenAdapter` | Microsoft AutoGen | 🔧 仅 demo | StateInferenceBridge 集成示例 |

> 🗓️ 长期愿景：A2A 协议治理层（见 `docs/architecture/AGENT_SOCIETY_VISION.md`）。CrewAI/LangGraph 已从路线图移除（与 a2a 治理定位不一致）。

---

## 4. 测量层（MeasurementLayer + 社会热力学）

### 4.1 测量层是不变层

测量层（`src/lib/thermodynamics/MeasurementLayer.ts`）是系统中**唯一的不变层**：无论讨论模式（sync/async）、拓扑结构、治理策略如何选择，R/T/H/F 和认知状态始终被计算。它从原 `AsyncDiscussionEngine.computeThermoState()` 私有方法提升为公共接口。

### 4.2 社会热力学变量（4 个，ThermoState）

| 变量 | 含义 | 计算 | 低值含义 | 高值含义 |
|------|------|------|---------|---------|
| **R** | Kuramoto 序参量 | `θ = (π/2)·b`，`R = \|Σ e^(iθ_j)\| / N` | 信念分散 | 信念同步 |
| **T** | 归一化温度 | `std(beliefs) / ((max−min)/2)` | 噪声小 | 噪声大 |
| **H** | Shannon 熵 | `−Σ p·log₂(p)`，5 bins，除以 `log₂(5)` | 信念集中 | 信念均匀 |
| **F** | 社会自由能 | `(1−R) + T·H` | 系统有序 | 系统无序 |

**F 的诚实定位**（来自 SOT.md §5.3）：
> F = (1-R) + T·H 是工程上有用的启发式综合诊断指标，**不是严格的热力学自由能**。其价值在于把三维度压缩到一个标量便于诊断，以及分解项可指导干预类型选择。当前论文不 claim 热力学理论贡献。

**F 分解的直觉**：
- `(1−R)` = 结构性无序（"势能"）——信念方向不一致带来的无序
- `T·H` = 热性无序（"耗散"）——信念波动带来的无序
- 两者**正交**，可指导干预分别降低正确的无序分量

### 4.3 H4 关键修复：Kuramoto 相位映射

> **旧映射** `θ = π·b` 会使 `b=+0.99` 和 `b=−0.99` 在单位圆上几乎重合（均落在 `(-1,0)` 附近），导致 `R≈1` 把**极化误判为共识**。
> **修复后** `θ = (π/2)·b`：`b=±0.99` 正对（位于 `(0,+1)` 和 `(0,−1)`），向量和 ≈ 0，`R≈0` 正确识别极化。
> 这是实质性修复，非表面调整——它改变了对极化状态的共识检测。

### 4.4 结晶态（异步引擎终止信号）

| 状态 | 条件 | 含义 |
|------|------|------|
| `strong_crystallized` | T < 0.10 ∧ H < 0.20 | 不可逆收敛，立即终止 |
| `crystallized` | R > 0.85 ∧ T < 0.22 ∧ H < 0.42，连续 3 次 eval | 系统冻结 |
| `quenched` | R 高 + T 骤降（>0.05）但 H 不低 | 伪结晶——agent 被强制同步但内心仍分散 |
| `hard_cap` | 发言数 ≥ 40 | 强制终止（讨论失败） |

阈值定义在 `TerminationDecider.ts` 的 `DEFAULT_TERMINATION_THRESHOLDS`。

---

## 5. 认知状态模型（5 维）

每个 agent 持有一个 `AgentCognitiveState`（`src/lib/agent/cognitiveState.ts`）：

| 维度 | 符号 | 含义 | 演化机制 |
|------|------|------|---------|
| **Utility** | U | agent 对各方案的效用评估 | DeGroot 更新：`U_i(t+1) = (1−Λ_i)·U_i(t) + Λ_i·Σ w_ij·U_j(t)` |
| **Evidence** | E | agent 持有的证据集合（items + coverage + quality） | 由观测层从 LLM 输出提取；干预可注入新证据 |
| **Inertia** | I | 信念惯性（不易改变的程度） | 根据发言与被反驳情况更新 |
| **Confidence** | C | 置信度 | 派生：`C ← f(E)` |
| **Susceptibility** | Λ | 易感性（被他人影响的程度） | 派生：`Λ ← g(I, C)` |

### 5.1 三种运行时模式

| 模式 | 引擎 | LLM 输出 | 认知状态来源 |
|------|------|---------|------------|
| **belief** | `DiscussionEngine` + `useCognitiveState=false` | belief + confidence | 无（仅标量信念） |
| **cognitive** | `DiscussionEngine` + `useCognitiveState=true` | belief + confidence + itemBeliefs | 系统 post-hoc 反推 |
| **native_cognitive** | `NativeCognitiveEngine` | cognitiveState（utility, evidenceCoverage, evidenceQuality） | **LLM 原生自省输出** |

### 5.2 兼容层

`cognitiveStateToBelief(state)` 提供向后兼容：从 5 维认知状态导出旧标量 `belief ∈ [-1, 1]`，使旧实验数据与分析脚本无需修改即可工作。

---

## 6. 检测器（16 个 = 4 经典 + 3 MAST FC2 + 6 认知状态 + 3 MAST FC1/FC3）

> ⚠️ 不再使用"4 detectors + 4 interventions"或"7 detectors"或"13 detectors"的过时口径。实际为 **16 检测器 + 3 active + 4 deprecated 干预**（2026-07-27 新增 FC1/FC3 3 个检测器）。

### 6.1 4 个经典检测器（`src/lib/governance/index.ts`）

基于标量 `belief` 检测，对应 v2.0 治理模式。

| 检测器 | 检测指标 | 默认阈值 | 触发干预（v2.0 deprecated） |
|--------|---------|---------|----------------------------|
| **Echo Chamber**（回声室） | 信息冗余度 `ρ = (1−σ)×0.5 + Jaccard×0.5` | 0.50 | `introduce_diversity` |
| **Authority Bias**（权威偏差） | 主导 agent 发言占比 | 0.25 | `reduce_weight` |
| **Polarization**（群体极化） | 信念标准差 | 0.30 | `force_reflection` |
| **Premature Consensus**（过早共识） | 轮次进度 < 0.35 ∧ 共识 > 0.55 ∧ σ < 0.20 | 0.35 | `continue_discussion`（默认禁用） |

### 6.2 3 个 MAST FC2 检测器（`src/lib/governance/index.ts`）

基于结构化字段（evidence/referencedAgents/itemBeliefs）检测，对应 MAST FM-2.4/2.5/2.6 失败模式。与经典检测器同文件，但在 `diagnose()` 中独立运行：

| 检测器 | MAST 模式 | 读取的字段 | 检测目标 |
|--------|-----------|-----------|---------|
| **Information Withholding** | FM-2.4 (9.1%) | `Evidence.items[]` | agent 隐藏关键信息 |
| **Ignored Input** | FM-2.5 (1.9%) | `referencedAgents` | 某 agent 的输入被群体忽视 |
| **Reasoning-Action Mismatch** | FM-2.6 (6.2%) | `itemBeliefs` | agent 言行不一致（推理与决策不匹配） |

### 6.3 6 个认知状态检测器（`src/lib/governance/cognitiveDetectors.ts`）

基于 5 维认知状态 $(U, E, I, C, S)$ 检测，仅 NativeCognitiveEngine 模式运行。45 个单元测试覆盖（`test/cognitive-detectors.test.ts`）：

| 检测器 | 信号 | 默认阈值 | 触发干预 |
|--------|------|---------|---------|
| **Echo Chamber (cognitive)** | 证据冗余 + 覆盖度方差 + Jaccard 重叠 | 0.75 | `rebalance_attention` |
| **Polarization (cognitive)** | 效用向量 pairwise cosine 距离 | 0.25 | `inject_evidence` |
| **Premature Consensus (cognitive)** | 轮次进度 × 效用共识 × (1−信念离散) | 0.55 | `inject_evidence` |
| **Authority Bias (cognitive)** | 惯性集中度 + 易感性不对称 | 0.60 | `rebalance_attention` |
| **Evidence Imbalance** | 证据覆盖度基尼系数 | 0.40 | `inject_evidence` |
| **Cognitive Action Mismatch** | utility.topChoice ≠ rankingTopChoice，gap > 0.4 | — | `rebalance_attention` |

> ⚠️ 6 个认知检测器仅 E9 smoke test (N=6) 有实证触发，正式实验未运行。

### 6.4 3 个 MAST FC1/FC3 检测器（`src/lib/governance/systemDesignDetectors.ts` + `taskVerificationDetectors.ts`）

2026-07-27 新增，对齐 MAST FC1（System Design）和 FC3（Task Verification）类别。基于 `MessageInfo` + `agentRoles` 检测，35 个单元测试覆盖（`test/system-design-task-verification-detectors.test.ts`）：

| 检测器 | MAST 模式 | 读取的字段 | 检测目标 | 触发干预 |
|---|---|---|---|---|
| **Role Violation** | FM-1.2 (1.5%) | `MessageInfo.content` + `agentRoles` | agent 发言与 role 职责关键词重叠度低 | `rebalance_attention` |
| **Step Repetition** | FM-1.3 (13.2%) | `MessageInfo.content`（跨轮次） | 同一 agent 跨轮发言 Jaccard 相似度高 | `inject_evidence` |
| **Premature Termination** | FM-3.1 (11.8%) | `MessageInfo.content` + `evidence[]` | agent 发出终止信号词但 evidence 数量不足 | `inject_evidence` |

**与现有检测器的严格区分**（学术诚信守护）：
- `echo_chamber`（信息层冗余，群体层）≠ FM-1.3（动作层重复，个体层）
- `premature_consensus`（早期共识前兆信号，预防性）≠ FM-3.1（已发出终止信号 + 验证不足，事后）
- `TerminationDecider`（系统级热力学终止，FM-1.5）≠ FM-3.1（agent 主动宣布完成，FC3）

> ⚠️ 3 个 FC1/FC3 检测器尚未集成到 NativeCognitiveEngine.applyCognitiveGovernance 运行时，当前仅作为独立检测函数可用。集成需扩展 MeasurementLayer.runDetectors 接受 messages 参数，留作下一步。

### 6.5 自定义检测器扩展

通过 `runtime.registerDetector()` 注册，在 `diagnose()` 中 16 个内置检测器之后运行，结果合并到 `GovernanceResult.otherIssues`：
- 带 `suggestedIntervention` → 触发对应干预，走与内置检测器相同的剂量路径
- 不带 → 仅记录（纯诊断/审计场景）
- `suggestedIntervention.type` 受 `InterventionType` 闭合联合约束（H8 修复）

---

## 7. 干预策略（3 active + 4 deprecated）

### 7.1 设计原则（核心洞察）

> **干预类型决定治理成败。** v2.0 的破坏性干预（直接修改信念权重）使效果 Δτ=-0.267；v2.1 的非破坏性干预（仅改变信息流与发言优先级）在 2026-07-25 重跑的 smoke test（N=6）中 Δτ=0.000（none 组 0.733±0.306 vs cognitive 组 0.733±0.116），早期文档引用的 +0.533 为历史值，当前数据不支持，需正式实验验证。

两类干预的本质区别：
- **破坏性（v2.0 deprecated）**：直接修改 `agentBeliefs` 标量值 → 削弱 agent 自主性
- **非破坏性（v2.1 active）**：修改信息流、注意力分配、知识顺序 → agent 仍自主决策

### 7.2 v2.1 Active 干预（`src/lib/governance/cognitiveInterventions.ts`）

| 干预 | 修改对象 | 不修改 | 数学效果 |
|------|---------|--------|---------|
| **`inject_evidence`** | `Evidence.items[]`（追加新条目） | Utility | 信息流注入，agent 自主重新评估 |
| **`rebalance_attention`** | `speakingPriority: Map<agentId, number>` | Utility | 调整下一轮发言优先级（被忽视者先发言） |
| **`shuffle_knowledge`** | 知识顺序 | Utility | 打破角色-信息一致性，强制交叉验证 |

**统一消费逻辑**：
- `SyncMode`：`priority > 0` 排在前面（先发言，后面的人能看到）；`priority < 0` 排在后面
- `AsyncContentDrivenMode`：`priority > 0` → `willingness += 0.15`；`priority < 0` → `willingness -= 0.15`

### 7.3 v2.0 Deprecated 干预（`src/lib/governance/interventions/`）

| 干预 | 触发检测器 | 数学效果 | 状态 |
|------|----------|---------|------|
| **`reduce_weight`** | Authority Bias | `W(i*→j) ← W(i*→j) × 0.5` | ⚠️ deprecated（v2.0 破坏性） |
| **`force_reflection`** | Polarization | `bᵢ ← bᵢ + (b̄ − bᵢ) × 0.2` | ⚠️ deprecated（v2.0 破坏性） |
| **`introduce_diversity`** | Echo Chamber | `bᵢ ← bᵢ + εᵢ`, `εᵢ ~ U(-0.3, 0.3)` | ⚠️ deprecated（已用 mulberry32 种子化） |
| **`continue_discussion`** | Premature Consensus | `T_max ← T_max + ⌈T_max × (θ − ρ_t)⌉` | ⚠️ deprecated（默认禁用） |

> 这些干预保留在代码库中以支持旧实验复现，但**新实验应使用 v2.1 active 干预**。

### 7.4 自适应扩展（已实现，部分未实验验证）

- **Adaptive Thresholds**：通过校准讨论自动标定每任务的检测阈值
- **Adaptive Dosage**：干预强度 = `f(severity, information_coverage, history_effectiveness)`
- **Cross-Examination**：将 agent 分为 PRO/CON 阵营对抗辩论
- **Dropout Sensitivity**：通过 agent dropout 估计结果对每个 agent 的敏感度

### 7.5 治理模式（5 种，RuntimeConfig.governanceMode）

| 模式 | 行为 |
|------|------|
| `none` | 不检测不干预（基线） |
| `detect-only` | 运行检测器，仅记录不干预 |
| `random-intervene` | 运行检测但用随机干预作对照组 |
| `full` | v2.0 完整治理（破坏性，deprecated） |
| `cognitive` | v2.1 认知治理（非破坏性，推荐） |

---

## 8. 数据流（从 LLM 输出到治理决策）

### 8.1 主循环（同步引擎）

```
┌─────────────────────────────────────────────────────────────┐
│  for round = 1..maxRounds:                                  │
│                                                             │
│    ① 观测层（Observation）                                    │
│       for each agent (顺序，非 Promise.all):                 │
│         prompt = buildPrompt(agent, memory, cognitiveState)  │
│         response = await LLM.call(prompt)                    │
│         opinion = parseResponse(response)  // 4 层容错       │
│         runtime.observe(agent.id, opinion)                   │
│                                                             │
│    ② 推理层（Inference，确定性数学，非 LLM）                  │
│       for each agent:                                       │
│         updateDerived(agent)   // C ← f(E), Λ ← g(I,C)      │
│         updateInertia(agent)                                │
│         updateUtility(agent)   // DeGroot 更新 U             │
│                                                             │
│    ③ 测量层（MeasurementLayer，确定性）                      │
│       thermoState = computeThermoState(beliefs)  // R/T/H/F │
│       cognitiveStates = getCognitiveStates()                 │
│                                                             │
│    ④ 治理引擎（Governance）                                  │
│       issues = governance.detect(states)        // 16 检测器 │
│       interventions = governance.selectInterventions(issues) │
│       for iv in interventions:                              │
│         runtime.applyIntervention(iv)                       │
│         // v2.1: 修改 Evidence/speakingPriority/knowledge   │
│         // v2.0: 直接修改 belief（deprecated）              │
│                                                             │
│    ⑤ 评估与记录                                              │
│       recordRound(roundData)                                │
│       if checkConvergence(): break                          │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 关键时序

1. **观测 → 推理**：LLM 输出先解析为结构化 `AgentOpinion`，再由推理层确定性更新信念
2. **推理 → 测量**：信念更新后立即计算热力学状态，反映本轮最新状态
3. **测量 → 治理**：检测器读取测量层快照，输出 issues
4. **治理 → 下一轮观测**：干预修改的状态在下一轮 `buildPrompt` 中对 LLM 可见（D1 修复保证）

### 8.3 异步引擎的差异

异步引擎（`AsyncDiscussionEngine`）的核心差异：
- **发言选择**：按 `willingness` 分数筛选 ≤ `maxSpeakers` 人发言，而非全体
- **意愿计算**：`raw = infoExposure×0.6 + beliefShift + consensusDeviation + dependencyTriggered×0.3 − recentlySpoke×0.5`，归一化为 `willingness = (tanh(raw)+1)/2`
- **终止机制**：热力学结晶态判定（见 §4.4），而非固定轮次

> ⚠️ **beliefShift 曾长期为零**（见 §9），导致最重要的意愿信号失效。

---

## 9. 可复现性保证

### 9.1 mulberry32 PRNG

**所有随机性必须使用 `mulberry32(seed)`，不允许 `Math.random()`。** 这是实验可复现的根本保证。

种子策略：
- `mulberry32(baseSeed + runIndex)` —— 不同 run 有不同但可复现的随机序列
- `mulberry32(42)` —— 置换检验固定种子（保证 p 值可复现）
- `mulberry32(42 + runIndex)` —— 洗牌 rotation 随机化（H2 修复）

### 9.2 已种子化的关键路径

| 路径 | 旧实现 | 修复后 |
|------|--------|--------|
| `introduceDiversity` 干预扰动 | `Math.random()`（H19） | `mulberry32(seed)` |
| `generateRandomInterventions` | `Math.random()`（H24/H25） | `mulberry32(seed)` |
| 置换检验 | `Math.random()` | `mulberry32(42)` |

### 9.3 实验设计保证

1. **被试间设计**：每组实验使用独立的新 agent 实例，不存在跨组污染
2. **洗牌对照**：将每个 agent 的独有知识旋转一个随机偏移，测量信息整合的理论上限
3. **callLLM 重试**：3 次指数退避，覆盖 TIMEOUT/NETWORK/RATE_LIMIT
4. **状态隔离**：`GovernanceEngine.reset()` 在每次实验间调用，清除 calibration/interventionHistory/rng/defaultConfig（H23 修复）

---

## 10. 已修复的关键 Bug

> 这些 bug 曾让实验结论偏了好几轮。理解它们可避免重蹈覆辙。

### 10.1 H 系列（数学与统计）

| ID | 问题 | 修复 |
|----|------|------|
| **H2** | `ablationModes` 仅 2 模式 | 扩展为 7 种完整模式（none/full/shuffle/full_diversity/full_weight/full_reflection/full_continue） |
| **H4** | Kuramoto 相位映射错误（见 §4.3） | `θ = π·b` → `θ = (π/2)·b` |
| **H6** | `convergenceSpeed` 注释方向写反 | 纠正注释（值大=慢收敛），公式本身正确 |
| **H17** | 缓存污染（失败运行留下错误占位文件） | 删除污染文件，从干净状态重跑 |
| **H18** | `interventionPrompt` 在 8 处调用点不一致 | 统一接入 `src/lib/utils/interventionPrompt.ts` |
| **H19** | `introduceDiversity` 用 `Math.random` | 替换为 `mulberry32` 种子化 PRNG |
| **H23** | `GovernanceEngine` 跨实验状态污染 | 新增 `reset()` 方法 |
| **H24/H25** | `generateRandomInterventions` 用 `Math.random` | 替换为 `mulberry32(seed)` |
| **H31/H32** | `permutationTest` 缺连续性校正 | `(count+1)/(nPerm+1)` 避免 p=0 假阳性 |
| **H35** | observation 用裸 `JSON.parse` | 替换为 `safeJsonParse` |
| **H39** | `computeDegreeCentrality` 双重计数 | 删除 `mentions + mentionsByOthers` 重复 |

### 10.2 统计方法修复

| Bug | 旧代码 | 正确代码 |
|-----|--------|---------|
| Kendall's τ 平局修正 | `t*(t+1)/2` | `count*(count-1)/2` |
| Cohen's d 未用 pooled SD | `sqrt((va+vb)/2)` | `sqrt(((n1-1)*va+(n2-1)*vb)/(n1+n2-2))` |
| 置换检验不可复现 | `Math.random()` | `mulberry32(42)` |

### 10.3 D1-D4 认知缺陷修复（commit `08b20fb`）

> 修复前所有实验结果含"治理环路断裂"——state-modification 类干预的效应被系统性低估。

| ID | 缺陷 | 修复 |
|----|------|------|
| **D1** | `buildPrompt` 未注入 belief/confidence | prompt 注入当前状态，使状态修改类干预对 LLM 可见 |
| **D2** | 无对话历史 | 个性化 memory（自己的发言 + 别人 @ 它的发言） |
| **D3** | `Promise.all` 并行发言 | 顺序 `for` 循环，后发言者可见本轮前序发言 |
| **D4** | 用 belief 差推断影响力 | 仅用显式 `referencedAgents` 建边 |

### 10.4 d=1.82 硬编码已修复

> **历史 bug**：`verifyFindings.ts:219` 曾硬编码 `d=1.82, p=0.0002`。
> **修复**：替换为实际计算的 Cohen's d 和置换检验 p 值。
> **当前正确数字**（来自 SOT.md §3.1）：
> - Crisis full vs none: **d=0.92**, p=0.0038（n=24，主证据）
> - Crisis shuffle vs none: **d=1.44**, p<0.001（n=24，最强证据）
> - Supplier full vs none: **d=0.47**, p=0.086（不显著，underpowered 43%）
> - Supplier shuffle vs none: **d=0.09**, p=0.78（天花板效应）

### 10.5 异步引擎 Bug

| Bug | 位置 | 修复 |
|-----|------|------|
| **beliefShift 始终为零** 🔥 | `asyncEngine.ts:310` | `prevCycleBeliefs` 在 belief 更新**前**保存（line 275） |
| `consensusLevel = 1−2×std` | `run.ts` | 替换为真实 Kuramoto R |
| JSON 模板英文→中文 | `run.ts` | "CompanyX (行业A)" → "方案A-全城封锁" |
| 洗牌 rotation 固定 +2 | `run.ts` | `mulberry32(42 + runIndex)` 随机化 |

---

## 11. 实验结论的稳定性

### 11.1 可靠的结论

| 结论 | 证据强度 | 备注 |
|------|---------|------|
| 治理有效（full > none） | ★★★★☆ | Crisis p=0.0038, d=0.92；跨模型验证 C 组已完成（Zhipu τ=0.680 > DeepSeek 0.640，+6.3%，差异小） |
| 非破坏性干预优于破坏性 | ★★☆☆☆ | v2.0 Δτ=-0.267（历史）；v2.1 当前 smoke test Δτ=0.000（N=6，未复现 +0.533 历史值），需正式实验验证 |
| 洗牌对照受任务难度调节 | ★★★☆☆ | Crisis d=1.44 显著；Supplier d=0.09 天花板效应 |

### 11.2 诚实标注的不显著发现

| 观察 | 数据 | 处理 |
|------|------|------|
| 虚假共识（r ≈ 0） | r=-0.10, p=0.20, n=169 | **不显著**，降级为"探索性观察"，不作为"发现"呈现 |

> ⚠️ 论文中引用 r=-0.10 时必须标注 "(p=0.20, not significant)"。

### 11.3 已弃用的叙事（SOT.md §5.2）

- ❌ "第一个开源多智能体认知治理运行时"（未开源）
- ❌ "34,000 行代码"（实际 ~22,800 src/）
- ❌ "19,500 行代码"（实际 ~22,800 src/，2026-07-30 更新）
- ❌ "640+ 实验"（实际 573，有效 169）
- ❌ "4 detectors + 4 interventions"（实际 16 + 3/4）
- ❌ "310/334/390/470/543 测试"（实际 616 passed, 3 skipped，2026-07-30 实跑）
- ❌ "False consensus 发现"（p=0.20 不显著）

---

## 12. 相关文档

| 文档 | 用途 |
|------|------|
| [`docs/SOT.md`](../SOT.md) | 单一真相源（所有数字以此为准） |
| [`docs/INTEGRATION.md`](../INTEGRATION.md) | 集成指南 |
| [`docs/GOVERNANCE_DESIGN.md`](../GOVERNANCE_DESIGN.md) | 治理引擎设计 |
| [`docs/architecture/AGENT_SOCIETY_VISION.md`](AGENT_SOCIETY_VISION.md) | 长期愿景（A2A 治理层） |
| [`docs/research/THEORY.md`](../research/THEORY.md) | 理论分析（含数学框架） |
| [`docs/research/EXPERIMENT_DESIGN.md`](../research/EXPERIMENT_DESIGN.md) | 实验设计 |
| [`docs/paper/PAPER_DRAFT.md`](../paper/PAPER_DRAFT.md) | 英文论文稿 |
| [`docs/paper/PAPER_PROFESSOR_VERSION.md`](../paper/PAPER_PROFESSOR_VERSION.md) | 中文论文稿 |
| [`docs/paper/LIMITATIONS.md`](../paper/LIMITATIONS.md) | 局限性（含历史修复记录与学术诚信审计 §26） |
| [`docs/audits/data_mining_report.md`](../archive/audits/data_mining_report.md) | 数据挖掘报告（已归档） |
| [`docs/roadmap/future.md`](../roadmap/future.md) | 未来路线图 |
| [`docs/archive/`](../archive/) | 归档文档（含 TECHNICAL_REPORT.md、academic_integrity_audit.md 等） |

---

## 13. 架构演进方向（参考，非当前状态）

> 以下内容来自 `docs/archive/architecture/ARCHITECTURE_V3.md` 与 `ARCHITECTURE_FREEZE_REPORT.md`，是**未来重构方向**，非当前实现状态。

### 13.1 当前架构的已知问题

1. **三重状态副本**：同一份 agent 状态在 `DiscussionEngine.agentStates`、`cognitiveStates`、`GovernanceRuntime.state.agentBeliefs`、`agent.getState()`、`InteractionGraph.nodes[]` 中独立维护
2. **Engine 充当 Runtime**：`DiscussionEngine` 维护 11 种状态，职责混淆
3. **双重治理实例**：`DiscussionEngine` 和 `GovernanceRuntime` 各持有一个独立的 `GovernanceEngine`
4. **AsyncEngine 继承链紧耦合**：`AsyncDiscussionEngine extends DiscussionEngine` 导致父类修改可能破坏子类
5. **实验脚本紧耦合具体引擎**：无统一 `SimulationEngine` 接口

### 13.2 目标架构：单引擎 + 四维可插拔

```
UnifiedEngine
├── 测量层（INVARIANT）—— R/T/H/F + 认知状态 + 检测器
├── 治理层（PLUGGABLE）—— None / DetectOnly / Belief / Cognitive
├── 讨论层（PLUGGABLE）—— SyncMode / AsyncMode × Flat / Grouped / Committee
└── 任务层（PLUGGABLE）—— type × difficulty × scenario
```

**核心原则**：
1. 测量层是唯一不变层
2. 四个维度（讨论模式 × 拓扑 × 治理 × 任务）彼此正交
3. 旧实验完全兼容（573 组 JSON + 435 测试通过）
4. 零侵入旧代码（旧引擎标记 deprecated 但保留）

### 13.3 架构冻结前提条件

在进入 Async Migration 之前必须完成：
1. 创建统一的 `Runtime` 类作为唯一状态持有者
2. `DiscussionEngine` 不再维护任何状态
3. `AsyncDiscussionEngine` 不再继承 `DiscussionEngine`
4. 删除 `GovernanceRuntime`（职责合并到 Runtime）
5. 创建 `SimulationEngine` 接口
6. 所有检测器停止读取标量 belief，改读认知状态

---

> **维护者**：贺孟元
> **更新规则**：当代码或实验数据变化时，先更新 `docs/SOT.md`，再更新本文档引用的数字。
