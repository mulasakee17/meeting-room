# Epistemic Quantity Semantics

状态：v1 normative specification（2026-08-07）
基准实现：`0e8bfd9`

本文使用 MUST / MUST NOT / SHOULD 表示规范要求。它定义量的语义，不声明任何经验结果。

## 1. 六个互斥语义层

| Layer | 含义 | 必需 provenance |
|---|---|---|
| `reported_belief` | Agent 在 task-owned claim contract 下显式报告的概率分布 | `reportId`, `claimId`, `agentId` |
| `derived_epistemic` | 对一个或多个 reported belief 的聚合或确定性变换 | `methodId`, `sourceReportIds` |
| `governance_estimate` | utility、inertia、susceptibility 等任务相关或启发式潜变量估计 | `estimatorId`, `sourceEventIds` |
| `behavioral_telemetry` | 架构直接观测到的消息、exposure、引用、自报元认知字段等 | `eventId`, `observedAt` |
| `outcome_evaluation` | 依赖 resolution 的 proper loss、accuracy 及跨样本 calibration 统计 | `metricId`, `resolverId`, `sourceReportIds` |
| `governance_state` | reputation、stake、penalty、influence allowance 等可变政策状态 | `policyId`, `updatedFromEventIds` |

一个量 MUST 只属于一层。跨层转换 MUST 产生新记录，保留源 ID 与方法/估计器/政策 ID；MUST NOT 覆盖源记录。

`BeliefContractRegistry` 是语义基础设施，不是 `governance_state`。registry 的 seal 表示 contract 定义不可变，不表示任何 Agent 的治理状态。

## 2. Reported belief

`reported_belief` 只指任务显式注册 claim 后，Agent 按 `BeliefContract` 输出的概率分布：

- binary：`p(true) ∈ [0,1]`；
- categorical：canonical option set 上的 simplex，所有概率非负且和为 1。

以下量 MUST NOT 自动解释为 reported belief：

- legacy `belief ∈ [-1,1]`；
- `confidence ∈ [0,100]`；
- utility score；
- evidence coverage / quality；
- 文本情感、立场或排名。

只有 task contract 显式声明某个编码的概率语义时，adapter 才 MAY 转换它；adapter MUST 记录 `methodId`。不存在 contract 时，线性映射 `(belief+1)/2` 也 MUST NOT 被称为概率。

## 3. Contract-owned geometry

内建 contract 提供描述性 geometry；它不表示因果影响。

### 3.1 Binary

对于 `p,q ∈ [0,1]`：

```text
distance(p,q) = |p-q|
uncertainty(p) = [-p ln p -(1-p) ln(1-p)] / ln 2
```

边界约定 `0 ln 0 = 0`。distance 与 uncertainty 均在 `[0,1]`。

### 3.2 Categorical

只允许比较完全相同的 canonical option set：

```text
distance(p,q) = 0.5 * Σ_k |p_k-q_k|      // total variation
uncertainty(p) = -Σ_k p_k ln p_k / ln K  // K >= 2
```

非法概率、非归一分布或不同 option set MUST fail closed。

`uncertainty` 是从分布派生的量，属于 `derived_epistemic`；它 MUST NOT 被称为 self-reported confidence。

## 4. Resolution、loss 与 calibration

- proper loss MUST 只在 claim 已 resolution 后计算；
- binary 与 categorical 当前使用 Brier family loss；
- 单次 report 可以有 loss，但单个样本 MUST NOT 被称为“已校准/未校准”；
- calibration MUST 是多个可比较 resolved claims 上的统计量，并报告样本选择、数量与分箱/估计方法；
- process violation（伪造 evidence、不可追踪来源）MUST NOT 偷塞进 proper score，否则可能破坏诚实概率报告的激励性质。

## 5. Exposure、传播与影响

Exposure 只表示架构把某 report 投递到目标 Agent 的实际 prompt，属于 `behavioral_telemetry`。

Exposure MUST NOT 被解释为：

- Agent 注意到或理解了内容；
- Agent 接受了该 belief；
- 该 report 导致后续 belief 改变。

`observedReportIds` 可用于构造可审计传播图，但没有随机化 exposure、干预或其他识别设计时，只能报告 descriptive propagation association，MUST NOT 报告 causal influence。

发言次数、mention count、confidence 加权与网络中心性同样只是 descriptive telemetry/derived metrics，不是因果影响。

## 6. Collective estimate 与 consensus

Collective aggregation 当前尚未实现。未来 aggregator：

- MUST 输出 `DerivedEpistemicEstimate`；
- MUST 记录 `methodId` 与全部 `sourceReportIds`；
- MUST NOT 改写任何 `BeliefReport`；
- MUST 将 linear pool、log pool、majority、reputation-weighted 等规则视为不同机制，而不是 contract 的唯一真理。

Consensus MUST 基于 contract-owned distance 产生带 `methodId` 的派生量。旧 scalar belief 标准差、Kuramoto order 或文本完全相同率 MUST NOT 作为跨任务通用 consensus。

## 7. Legacy quantity migration

| Legacy quantity | 当前正确归类 | 禁止解释 |
|---|---|---|
| `belief[-1,1]` | legacy task-specific scalar / compatibility telemetry | 未声明 contract 时的 probability |
| `confidence[0,100]` | self-reported metacognitive telemetry | correctness probability、calibration、distributional uncertainty |
| `utility` | `governance_estimate` 或 task preference | epistemic probability |
| model-reported `evidenceCoverage/quality` | `behavioral_telemetry` | verified evidence quality、客观 coverage |
| externally computed coverage/quality | 带 `estimatorId` 的 `derived_epistemic` 或 `governance_estimate` | 无 provenance 的客观事实 |
| mention/reference count | `behavioral_telemetry` | causal influence |
| heuristic influence weight | `governance_estimate` | identified causal effect |

旧量在完成显式 adapter 与 provenance 迁移前 SHOULD 保留 `legacy`、`reported` 或 `heuristic` 命名，避免与新 protocol 同名。

## 8. BeliefContractRegistry invariants

- registry MUST 拒绝重复 kind；
- seal 后 MUST 拒绝注册并冻结 contract snapshot；
- DiscussionEngine、ledger 与 resolver MUST 使用注入 registry 的隔离 snapshot；
- engine reset MUST 保留同一套 contract semantics；
- validation、normalization、resolution、scoring、distance 与 uncertainty MUST 通过同一 registry dispatch，不得隐藏回退到另一套默认语义。

当前 registry 对 binary/categorical 是运行时可注入的；新增 ranking/continuous 等 `BeliefKind` 仍需扩展类型、parser 与 renderer，因此尚不是任意 schema 的完全插件系统。

## 9. 当前非目标

- ranking、continuous、open-ended、preference contract；
- collective aggregation policy；
- causal influence estimator；
- verified evidence oracle；
- reputation、stake、penalty settlement。

这些能力实现前 MUST NOT 写成现有系统能力。

## 10. 外部复用决策

- [scoringrules](https://github.com/frazane/scoringrules) 可作为未来 RPS、CRPS、energy score 的参考与交叉验证实现；其 Python evaluation API 不替代本项目的 TypeScript claim/ledger runtime。
- [OpenViking MetricRegistry RFC](https://github.com/volcengine/OpenViking/discussions/1219) 的“data source / collector / registry / exporter 分离”原则可借鉴；其 operational metrics registry 不提供 belief semantics。
- [Agent Forge](https://github.com/FrostLogic-AB/agent-forge) 提供通用 agent plugin lifecycle，但不提供 task-owned probability contract、proper scoring 或 exposure audit。

因此当前不引入新依赖，只复用分层与 registry 设计原则。

## 11. Legacy adapter implementation status

本节的 legacy adapter 已由 `623c236`（审计遗留认知量）与 `87eb5b1`（保留部分框架状态 provenance）落地。它把第 7 节的 legacy 量显式归类为 `behavioral_telemetry`，不引入任何新的 epistemic 语义。

`observeLegacyQuantities` 只发射 `behavioral_telemetry` 事件，其 source 标签限定为：

- `agent_reported`
- `framework_reported`
- `model_inferred`
- `derived_from_item_preferences`
- `compatibility_carry_forward`
- `runtime_default`
- `unspecified_parser_output`

Derived 量 MUST 携带 `methodId`，标明来源方法。

替换型观测保持 append-only：新观测通过 `supersedesEventId` 指向被替换的旧事件，MUST NOT 改写或删除原记录。`latestLegacyTelemetry` 按追加顺序选择最新同名观测；替代链与当前态选择是两个独立机制。

`DiscussionEngine`、独立 `ObservationLayer` 与 `StateInferenceBridge` 都在观测边界挂接记录。

`StateInferenceBridge` 对每个字段独立解析，优先级为：顶层字段 > GOV tag > metadata > runtime default，随后仅推断缺失字段。

非法时间戳做归一化处理。

显式非目标：

- 永不输出 probability 或 `reported_belief`；
- 永不声称已核验的 evidence quality；
- 除 I/C/Λ 渐进估计外，其余 downstream governance projection 尚未实现。

验证声明：截至 `87eb5b1`，全量测试 746 通过、3 跳过，typecheck 与 production build 均通过。

## 12. Governance estimator reproducibility contract

`ce8be58`、`a85319f` 与 `96ba06b` 将 legacy telemetry 到 I/C/Λ 的渐进估计显式化为可审计的 `governance_estimate`。这一层是版本化计算契约，不提升输入量的认识论地位。

每次 projection MUST：

- 从 registry 精确选择 `estimatorId + estimatorVersion`，不得按“最新版本”隐式解析；
- 使用完整 config，而不是依赖未记录的 partial merge；
- 记录 canonical JSON-compatible input、config 与 output 的 SHA-256 fingerprint；
- 保存实际 config、排序去重后的 `sourceEventIds`，以及 `deterministic` 或带 seed/seedField 的 `seeded` 声明；
- 在执行前验证输入和配置，在执行后验证输出；非法、含环、稀疏、有 accessor、Symbol key 或隐藏属性的值 MUST fail closed；
- 使用隔离并 seal 的 registry snapshot，避免调用方后续 mutation 改变本次运行语义。

这里的 canonical serializer 是项目内严格、确定性的 JSON-compatible serializer，借鉴 [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html) 的原则，但不声称完整实现或符合 JCS。`determinism` 是 estimator contract 的声明和可测试 invariant，不是对任意第三方 estimator 代码的形式证明。seeded estimator 目前只验证 seed 是安全整数；estimator 是否只消费该 seed 仍由实现者和复现实验负责。

运行时生命周期约束：

- `MeasurementLayer` 在构造时复制 exact estimator reference 并隔离 registry snapshot；
- `GovernanceRuntime.reset()` 保留同一 registry 与 exact estimator reference；
- active session 中替换 estimator registry 或 reference MUST 被拒绝，避免同一 run 混用两套语义；
- native cognitive engine 与兼容 runtime cognitive path 均通过 owned `MeasurementLayer` 估计，不得旁路到 module-level default；
- campaign raw output 持久化实际记录的 estimate；生成 `deltaDiagnosis` 时若任一 agent 的 provenance 缺失，MUST fail closed，不得用默认 estimator 静默重算；
- 记录按 round 与 agent id 稳定排序，以降低文件顺序造成的非语义差异。

`sourceEventIds` 当前主要列出本轮可审计 legacy telemetry；它可能为空，也不一定覆盖 utility history 等历史状态。`inputFingerprint` 覆盖 estimator 实际消费的完整输入状态，但 fingerprint 本身不能替代原始状态快照。需要重放时，必须同时保留 cognitive trajectory、exact estimator reference、config 与实现版本。该 provenance 设计与 [W3C PROV-DM](https://www.w3.org/TR/prov-dm/) 的 entity/activity/derivation 分离原则一致，但当前记录不是完整 PROV-DM 实现。

语义边界保持不变：

- I/C/Λ 输出是 task-specific latent-state proxy，属于 `governance_estimate`；
- 它们不是 probability、ground truth、verified evidence quality 或 identified causal effect；
- model-reported `evidenceCoverage/evidenceQuality` 仍是带 source 的 telemetry；
- `confidence` estimator 的 confidence 字段表示估计器自身的启发式可靠度，不是 agent 正确概率，也不是经过样本校准的 calibration score。

仍未消除的 semantic debt：

- susceptibility 同时存在 progressive exposure-response estimate 与旧式局部公式 `(1-I)(1-C)`，两者用途和命名仍需统一；
- progressive estimator 与 legacy `updateInertia` 仍各自维护 role prior table；
- estimator record 重复保存完整 config，优先保证单条记录可审计，尚未做 manifest-level 去重；
- ranking、continuous、open-ended belief contract 与 verified evidence oracle 仍未实现。

验证声明：截至 `96ba06b`，36 个测试文件中 767 项通过、3 项按既有设置跳过；TypeScript check 与 production build 均通过。
