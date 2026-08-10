# SwarmAlpha v6 最终整合研究与执行方案

> **2026-08-10 理论收口优先级声明：** 本文保留为工程历史、依赖关系与风险清单；论文定位、研究问题、主终点、最小实验臂、贡献边界和复杂度预算，以 [`SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`](../theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md) 为最高优先级。冲突处以后者为准。

**状态**：当前唯一权威的研究路线与执行顺序
**冻结日期**：2026-08-10
**适用范围**：SwarmAlpha v6 的理论、测量、治理、实验、论文与复现工作

**当前检查点（2026-08-10）**：F0–F3 的 contract/kernel 已实现，G-S
代码级 Gate 已关闭；F4 的确定性核心与 schema-5 载体门已实现（final private
outcome、truth firewall、resolution/scoring 时序，见
`docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`）。生产 Runner 仍发 schema 4，
无生产 elicitation adapter 与 detached truth commitment，因此生产 G-O/G-V 尚未
闭环。下一关键路径为 F5（Stage-1 生产桥）与 production-safe elicitation
adapter 边界，而不是付费实验。

## 0. 本方案如何取代而不是抹掉旧计划

本方案不是另起炉灶，而是把既有三条路线收束为一条依赖正确的主线：

1. 旧 `SWARMALPHA_V6_EXECUTION_MASTERPLAN.md` 提供工程、实验和论文施工骨架；
2. `SWARMALPHA_V6_FOUNDATION_GOVERNANCE_AUDIT_2026-08-09.md` 提供定位、治理链和构念效度审计；
3. `TWO_STAGE_RANDOMIZATION_GAP_AUDIT_2026-08-09.md`、`GOVERNANCE_AUDIT_TRAIL_V1.md` 与 `PRIMARY_ASSIGNMENT_V1.md` 提供随机化和审计边界；
4. 本方案补上此前缺少的前置层：**一个量是什么、如何获得、何时可比较、凭什么能触发控制**。

发生冲突时按以下规则解释：

- 理论定位、工作优先级、Gate 和论文 claim：以本方案为准；
- 当前完成状态：以代码、测试和 `SWARMALPHA_V6_EXECUTION_PROGRESS.md` 为准；
- 已实现对象的运行语义：以代码、测试和对应 architecture 文档为准；
- 旧 masterplan 保留为历史施工记录，不再单独决定下一步。

任何“完成”都必须注明层级：`contract/kernel`、`production bridge`、`deterministic validation`、`paid pilot` 或 `confirmatory evidence`。代码和 mock 通过不得写成生产闭环，更不得写成实证成立。

## 1. 冻结定位与研究问题

### 1.1 项目定位

> **SwarmAlpha v6 is an architecture-enforced, claim-centric experimental control plane for auditable multi-agent information dynamics and epistemic governance.**

中文：

> **SwarmAlpha v6 是一个以 claim 为中心、由架构强制记录的多智能体信息动力学与认识治理实验控制层。**

它不是“读取 Agent 内心信念”的系统，不是通用社会模拟器，也不是 Web3 信誉产品。它研究的是：在可解析 claim 上，如何把报告、证据、暴露、修订、治理动作和结果变成可验证、可随机化、可回放的研究对象。

### 1.2 主研究问题

> **Can architecture-enforced explicit belief reports and auditable, randomized epistemic governance reduce miscalibration, false consensus, and error propagation in LLM multi-agent systems under distributed information and adversarial epistemic failures?**

该问题包含两个可分离贡献：

1. **表示贡献**：显式、claim-relative 的概率报告是否改善可测量性、校准和集体决策；
2. **机制贡献**：在显式状态之上，随机、可审计的验证与传播治理是否带来额外收益。

### 1.3 普适性的正确含义

SwarmAlpha 不追求一个对所有任务都同义的“万能 F 值”。普适性来自三层接口：

| 层级 | 可复用对象 | 边界 |
|---|---|---|
| 机制级普适性 | assignment、ledger、audit trail、replay、policy/action lifecycle、claim ceiling | 不依赖具体任务内容 |
| 认识任务级普适性 | binary/categorical claim、probability、evidence、exposure、resolution、proper scoring | 要求 claim 可注册且可解析 |
| 领域级适配 | claim 构造、source lineage、truth resolver、action delivery、task outcome | 必须由版本化 adapter 明确提供 |

因此，第一篇论文的诚实外延是“可解析概率 claim 上的多智能体认识治理”，不是任意开放世界 autonomous agents。

## 2. 设计宪法

以下原则高于任何 detector、公式或配置：

1. **Report is not mind**：Agent 自报概率是 architecture-recorded report，不是 latent mental state。
2. **Computable is not valid**：公式可复算只证明计算可靠，不证明它测到了命名构念。
3. **Observation is not diagnosis**：原始观测、估计量和理论诊断必须分层。
4. **Diagnosis is not authority**：诊断记录本身没有控制权限；只有冻结 policy 经 assignment 后才能授权动作。
5. **Threshold is a policy**：阈值是带成本、适用域和校准来源的决策规则，不是自然常数。
6. **Missingness is data**：缺失、拒答、解析失败和不可观测必须显式记录，不能补成零或“正常”。
7. **Delivery is not compliance**：计划、生成、投递、读取/遵从和结果效应是不同状态。
8. **Replay is not authenticity**：回放能证明内部一致性；没有外部 commitment 时不能识别整套自洽伪造。
9. **No pre-resolution truth use**：resolution 前的 prompt、诊断和动作不得读取真值或派生标签。
10. **Compatibility cannot define science**：legacy confidence、`R/T/H/F`、旧 adaptive threshold 只能兼容读取，不得进入 v6 confirmatory 控制和主 claim。

## 3. 量的理论地基

### 3.1 六层语义必须互斥

```text
task-owned claim/resolution contract
  -> agent-reported belief/evidence
  -> architecture-computed observation
  -> versioned diagnosis with validity status
  -> randomized policy decision and action
  -> post-treatment outcome and ex-post settlement
```

同一字段不能跨层偷换含义。例如 `confidence` 不能同时表示自报把握、预测正确概率、估计器可靠度和 calibration quality。

### 3.2 `EpistemicQuantityContractV1`：所有可控量的准入证

任何将用于主分析、诊断、eligibility 或控制的量，都必须注册以下语义，而不是只注册一个名称和公式：

| 字段 | 必须回答的问题 |
|---|---|
| `quantityId/version` | 哪个稳定、可回放的量？ |
| `semanticLayer` | self-report、computed observation、diagnosis、outcome 还是 settlement？ |
| `constructDefinition` | 它声称测量什么，不声称测量什么？ |
| `support/domain` | 数值范围、claim 类型、任务和时间窗口是什么？ |
| `inputRefs` | 使用哪些原始账本对象和版本？ |
| `estimatorRef` | 公式、参数、排序/平票规则和缺失处理能否精确复算？ |
| `temporalAvailability` | 在讨论前、轮内、讨论后还是 resolution 后才可计算？ |
| `comparabilityKey` | 哪些样本之间有资格比较或汇总？ |
| `reliabilityStatus` | 解析与重复测量是否可靠？ |
| `constructValidityStatus` | 名称与观测之间是未验证、pilot 支持还是 held-out 支持？ |
| `calibrationArtifactRef` | 若用于预测/阈值，校准来自哪个冻结数据切分？ |
| `missingnessPolicy` | 缺失、拒答、截尾和不适用如何编码？ |
| `allowedUses` | descriptive、monitoring、eligibility、control、outcome 中允许哪些？ |
| `forbiddenInterpretations` | 明确禁止哪些过度解释？ |
| `claimCeiling` | 该量最多支持 C0/C1/C2/C3 中哪一级表述？ |

默认策略必须 fail closed：缺少 contract、输入版本、适用域或 calibration artifact 时，量可以进入诊断日志，但不得获得 confirmatory control authority。

### 3.3 规范 belief

对 Agent `i`、时刻 `t`、已注册 claim `c`：

> `b_i,t(c)` 是 Agent 在给定输出契约下显式报告的概率分布。

- binary：`p = P(c=true)`，`p ∈ [0,1]`；
- categorical：规范选项上的概率单纯形；
- revision：新 report 通过 supersession 链替代旧 report，但不得覆盖历史；
- belief 不从自由文本静默反推。文本抽取若存在，必须是带版本和不确定性的独立 estimator。

“高确定性”不得误写成 binary 的单侧 `p`。规范描述至少包括：

- binary certainty：`max(p, 1-p)`，预测类别由 `p >= 0.5` 决定；
- categorical：同时保留 top probability、top-two margin 和 normalized entropy，不能用任一单值冒充全部不确定性几何。

### 3.4 错误、校准与 epistemic cost

resolution 前系统不知道 report 是否错误，只能观察“高确定性 + 证据不足/未验证/lineage 不独立”等风险条件。此时可触发 verification eligibility，但不得记录“检测到 miscalibration”。

resolution 后才能结算：

- binary Brier：`(p - y)^2`；
- categorical Brier：预测概率向量与 one-hot outcome 的平方距离；
- calibration：跨一组可比较、已解析 claim 估计，必须报告样本选择、数量、分箱或平滑方法；
- 高置信错误自然获得更大 proper loss；额外 stake multiplier 若未来引入，必须预注册且不破坏 properness。

单个 Brier loss 不是 calibration；低平均 Brier 也不能自动证明机制校准。主结果需同时报告 proper score、reliability/calibration 图和 resolution/abstention coverage。

### 3.5 证据和传播

证据“数量”不能代替独立性。核心对象应区分：

```text
Claim <-supports/attacks- Evidence <-derived_from/duplicates- SourceLineage
Claim <-reports- BeliefReport <-supersedes- BeliefReport
BeliefReport <-exposed_to- Report/Evidence
```

verification 是对 evidence 或 claim 的新事件，不得回写原证据。Sybil-like 同源 Agent 的风险必须通过 lineage/derivation 图，而不是 agent 数量识别。

### 3.6 旧量的处置

- `confidence.stated`：仅是自报元认知 telemetry；不得当作正确概率或已校准 belief；
- coverage、quality、utility：任务相关描述量，除非有完整 quantity contract，不得跨任务比较；
- `R/T/H/F`：保留只读兼容和历史复现，最高 C0；不得进入 v6 confirmatory policy、主结果或论文理论定义；
- estimator 自身的 `confidence`：表示启发式可靠度时必须改用不混淆的字段名。

## 4. 从量到治理的完整链

权威链条是：

```text
SourceEvent
  -> Observation
  -> Diagnosis
  -> EligibilityDecision
  -> RandomizedAssignment
  -> GovernanceDecision
  -> ActionInstance
  -> DeliveryTransition
  -> ComplianceObservation
  -> Post-treatmentObservation
  -> FinalPrivateElicitation
  -> Resolution
  -> Scoring / Settlement
```

必须保持以下不变量：

- diagnosis 没有直接控制权；
- eligibility 只判断候选动作是否进入随机化，不决定最终 treatment；
- Stage-1 主分配以 run 为单位并按 ITT 分析；
- Stage-2 eligible-event apply/holdout/sham 只用于机制探索，首篇不作独立因果主张；
- decision、action instance、delivery、compliance、censoring 和 failure 都是独立、可审计状态；
- final private elicitation 对所有 arm 使用同一输出契约，且不回流讨论；
- resolution/scoring 在讨论与最终 elicitation 完成后才发生；
- legacy `applicationReceipts` 和 schema-5 action instances 不能形成双权威，confirmatory 只认 schema-5 trail。

第一篇论文只保留低歧义动作族：请求独立验证、请求反证/反方论据、限制同源证据的聚合影响。信誉、token、真实质押和动态经济博弈延期。

## 5. 当前真实状态

### 5.1 已完成，但只能按相应层级表述

| 能力 | 当前层级 | 不能声称什么 |
|---|---|---|
| WP0 理论/兼容隔离基线 | contract + tests | 不代表新测量构念已校准 |
| WP1 TaskBundle/truth firewall | code gate | 不代表 final outcome 已独立测量 |
| WP2 assignment/lifecycle | schema-4 code gate | 不代表生产已做真实随机化 |
| WP3 baseline/alpha | mock code gate | 不代表所有 arm 已在 Runner 成本匹配运行 |
| belief/evidence/exposure/resolution ledger | kernel + tests | 不代表生产数据完整产出全部 lineage |
| decision engine/action lifecycle/audit builder | kernel + adversarial tests | 不代表生产 trail 已构造、seal、持久化 |
| GovernanceStudyContract/schema-5 verifier | reserved + validated carrier | production `RAW_SCHEMA_VERSION` 仍是 `4.0` |
| Stage-1 `PrimaryAssignmentV1` | deterministic core + manifest primitives | Runner 尚未使用 |
| Stage-1 execution registry/binding + schema-5 Stage-1 gate | kernel + adversarial tests | schema-5 verifier 现强制并交叉校验 Stage-1 链并拒绝 legacy 治疗权威；Runner 仍未接线 |
| final elicitation adapter 边界 + collection artifact | kernel + adversarial tests | Runner 未调用，collection 尚未成为 schema-5 必需（F8） |

截至本方案冻结时：没有付费 pilot，没有 confirmatory experiment，没有可据此发表的效果结果。

### 5.2 关键未闭环

1. `EpistemicQuantityContractV1`、构念效度状态和允许用途尚未成为统一运行契约；
2. high-certainty、calibration artifact 和 threshold policy 未完整冻结；
3. final private elicitation 的确定性核心、truth-free per-agent adapter 边界
   与 collection artifact 已完成，task outcome 的 schema-5 强制要求已完成；
   但 Runner 未调用 adapter/collection，detached truth commitment 未完成，
   collection 尚未成为 schema-5 必需（F8）；
4. Runner 未接 Stage-1 真随机主分配（`preparePrimaryAssignedRunV1` 未被 Runner
   调用）；
5. production source-event/observation/diagnosis adapters 未完成；
6. `epistemic_governance` arm 未真正接入 decision/action/delivery；
7. schema-5 verifier 现强制并交叉校验 Stage-1 manifest/registry/binding、
   final outcome 与 task projection；schema-5 **writer** 与原子持久化仍未完成；
8. 外部 manifest/hash commitment 未完成；
9. failure injectors、metric fixtures、held-out calibration 和 paid pilot 未完成；
10. legacy 因果文案和旧 F 仍需在论文路径主动隔离。

## 6. 最终工作包与依赖

### F0 — Quantity Constitution 与语义注册表（P0，Codex）

**目标**：让任何量在被计算或控制前先证明“它是什么以及允许做什么”。

**产物**：`EpistemicQuantityContractV1`、registry、运行时校验、legacy 映射、claim-ceiling 规则。

**验收**：非法 layer/domain/时间、缺失策略、无 calibration ref 却申请控制、unknown quantity 全部 fail closed；binary/categorical 示例可精确复算；旧 F 明确不可获控制权。

### F1 — Belief geometry 与 domain adapter 边界（P0，Codex）

**目标**：修正“高置信度”的几何，确保排序任务不污染通用内核。

**产物**：binary certainty、categorical top/margin/entropy；`EpistemicDomainRegistry` 的最小接口；claim/resolution/scoring adapter contract。

**验收**：binary 对 `p` 与 `1-p` 对称；categorical 平票不受选项顺序影响；未注册 domain/claim/scorer 拒绝；排序仅作为一个 adapter。

### F2 — CalibrationArtifact 与构念效度（P0，Codex 定义；Claude 测试/文档）

**目标**：把“公式可靠”“预测校准”“理论构念有效”拆开。

**产物**：先冻结版本化 `CalibrationArtifactV1` 的 schema/validator；其具体 held-out artifact 在 F11 由 pilot 数据产生。artifact 绑定 split manifest、quantity/estimator version、domain、sample size、fit/evaluation method、validity window 和 hash。

**验收**：训练/校准/测试切分不可混用；artifact 与 quantity/domain/version 不匹配即拒绝；无 held-out 支持只能 C0 descriptive 或 exploratory。

### F3 — Cost-sensitive ThresholdPolicy（P0，Codex）

**目标**：阈值从散落常数升级为可审计决策政策。

**产物**：policy 绑定 quantity、calibration artifact、false-positive/false-negative/abstention/action cost、适用域、冻结方式与 comparator。

**验收**：阈值不能由 confirmatory 数据在线调整；missing observation 不触发默认动作；policy 输出 eligibility 而非直接动作；同时保留 threshold-free 评估。

### F4 — Final private elicitation 与 truth firewall 收口（P0，Codex）

**目标**：让所有 arm 在不污染讨论的条件下产生可比较 outcome。

**产物**：统一 final elicitation contract、独立持久化、resolution/scoring 顺序、schema-5 必填 task outcome。

**验收**：elicitation 发生在讨论后、resolution 前；所有 arm 使用同一 contract；真值在 elicitation 完成前不可达；缺失/拒答显式；重放能验证顺序。

### F5 — Stage-1 主随机化生产桥（P0，Codex）

**目标**：用 `PrimaryAssignmentV1` 替换 config 决定的单臂概率 1 路径。

**产物**：pre-provider manifest、no-redraw retry、Runner 注入、assignment/manifest carrier binding。

**验收**：任何 provider call 前持久化；重试复用同一 assignment；arm order/probability/designRef/seed 全重放；主分析仅 ITT；`group` 继续 fail closed。

### F6 — Production observation/diagnosis adapters（P0，Codex）

**目标**：把任务事件转换为带版本、完整度和构念效度边界的观测与诊断。

**产物**：source-event adapter、observation adapter、diagnosis adapter、missingness/censoring 规则。

**验收**：无真值泄漏；原始事件不可被 diagnosis 覆盖；缺失不获控制权；每个 diagnosis 可追溯到 quantity contract、输入和 estimator version。

### F7 — Delivery/compliance 与治理 arm（P0，Codex）

**目标**：让 `epistemic_governance` 从测试对象变成真实 protocol arm。

**产物**：decision-engine 接线、eligible-event assignment、action rendering/delivery、compliance observation、post-treatment window。

**验收**：apply/holdout/sham 均生成权威记录；queued 不等于 delivered；delivered 不等于 complied；失败和 censored 显式；legacy governance 主动隔离。

### F8 — Schema-5 生产纵切与外部 commitment（P0，Codex）

**目标**：一个完整 run 从预分配到结算只产生一套权威、可验证 artifact。

**产物**：schema-5 writer、builder seal、原子 no-replace 持久化、Stage-1/manifest/study/trail/taskOutcome 跨检、rule registry loader、外部时间戳 hash commitment。

**验收**：schema 5 缺任一权威对象即 fail closed；decision replay 可用；schema 4 只读兼容；整套 artifact 事后替换能被外部 commitment 检出；通过前不得 bump production writer。

### F9 — FailureMode 与 Metric Contracts（P1，Codex 定义；Claude fixtures）

**目标**：把论文问题变成可证伪实验。

**首批 failure modes**：high-confidence false report、conflicting/forged evidence、Sybil-like shared lineage。

**主结果**：final pooled proper score/Brier 的 run-level ITT contrast。
**关键次结果**：accuracy、false-consensus curve/预冻结阈值率、calibration/reliability、risk-coverage。
**机制结果**：cascade size/AUC、recovery time、revision after counterevidence、lineage concentration、influence Gini、abstention、cost。

**验收**：每个 metric 有单位、窗口、missingness、聚合、claim ceiling 和手算 fixture；report/claim/round 作为嵌套观测，推断按 run/task cluster；禁止把 mediator 当 primary outcome。

### F10 — 零成本 deterministic vertical rehearsal（P1，Claude 执行；Codex 审核）

**目标**：在花钱前证明整个协议能运行、回放、失败并恢复。

**验收**：所有 primary arms、failure modes、retry、censoring、schema-5 verifier、analysis fail-closed 和 manifest round-trip 通过；无真实 LLM；全量测试/build 稳定。

### F11 — Smoke、校准与方差 pilot（P1，Codex 决策；Claude 运行/汇总）

**目标**：只估计解析率、构念可测性、方差、成本和阈值，不检验主假设。

**预算**：smoke 是 pre-confirmatory 总额的一部分，smoke 不超过 ¥80；smoke + calibration/variance pilot 累计不超过 ¥170。

**通过条件**：schema compliance、private elicitation coverage、replay success、action delivery/compliance 可接受；无系统性 truth leak；阈值和 calibration artifact 能在 held-out split 冻结；成本/方差允许有信息量的主设计。

### F12 — Preregistration 与 confirmatory campaign（P2，Codex 冻结；Claude 机械执行）

**主对照**：

1. ordinary text communication + 公共 final elicitation；
2. explicit belief state（claim + probability + evidence）；
3. epistemic governance（在 2 上加入随机、可审计治理）。

**必要诊断控制**：independent/one-shot ensemble 与 cost-matched sham/random action；现有六臂 scaffold 保留，但论文主 contrast 聚焦上述三层嵌套协议，oracle 仅在预算允许时加入。

**预算**：confirmatory 不超过 ¥280；至少保留 ¥50 应急金，总预算封顶 ¥500。

**冻结项**：task split、model family、arm/probability、sample size、seed namespace、budget contract、policy/rules、quantity/metric/calibration refs、exclusion/retry、primary estimand、analysis code hash。

**推断边界**：Stage-1 run-level ITT 支持协议级 C2；Stage-2 事件分配仅 exploratory；多 agent 干扰下不作个体级 SUTVA 假设。

### F13 — 分析、论文与 artifact（P2，Codex）

**产物**：claim matrix、预注册主分析、negative-result branches、replay bundle、环境/manifest/hash、figure/table provenance。

**验收**：分析在缺 assignment、audit、calibration 或 task outcome 时 fail closed；`causalEffect.ts` 等旧观测性代码降格为 exploratory sensitivity；旧 F 不进入主结论；每条文字 claim 可追到 estimand 和 artifact。

## 7. 新 Gate：以前置理论约束旧工程路线

| Gate | 必须满足 | 未通过时禁止 |
|---|---|---|
| G-S Semantic | F0–F1：量、belief 几何、domain/claim 边界冻结 | 新 detector、控制阈值、论文构念 claim |
| G-O Outcome | F4：private elicitation、truth firewall、resolution 顺序闭合 | 比较 Brier/calibration/accuracy |
| G-C Control | F2–F3、F6–F7：校准契约、阈值、诊断、delivery/compliance 闭合 | detector 驱动的正式治理实验；pilot 只能用明确标记为 exploratory 的规则 |
| G-V Vertical | F5、F8：Stage-1 + schema-5 单一权威 artifact | production schema 5、confirmatory pilot |
| G-D Deterministic | F9–F10：全链零成本复演 | 真实模型付费运行 |
| G-P Pilot | F11：解析率、方差、成本、校准合格 | 冻结主实验 |
| G-F Freeze | preregistration artifact 外部 commitment 完成 | confirmatory 第一条 provider call |
| G-X Confirmatory | 预定样本、重试/排除和分析完整 | 选择性报告、事后改阈值 |
| G-A Artifact | claim matrix 与复现验证完成 | 超证据等级投稿表述 |

旧 WP0–WP3 统一记为“工程内核 gate 已完成”，但不能替代 G-S、G-O、G-C 或 G-V。

## 8. 旧计划映射

| 旧路线 | 在终版中的位置 | 处理 |
|---|---|---|
| WP0 理论收口基线 | F0–F3 的历史前置 | 旧兼容隔离保留；测量/控制理论继续收口 |
| WP1 TaskBundle/truth firewall | F4 | 代码 gate 完成，补 private outcome |
| WP2 assignment/lifecycle | F5、F7、F8 | schema-4 内核保留；production 用新权威链 |
| WP3 baseline/alpha | F10、F12 | mock 完成；补 Runner 和真实成本匹配 |
| WP4 epistemic bridge | F1、F4、F6、F7 | 拆成四个可验收工作包 |
| WP5 failures/metrics | F9 | 保留并强化 quantity/claim-ceiling contract |
| WP6 calibration/pilot | F2、F3、F11 | 校准先成为控制前置，再进入付费 pilot |
| WP7 confirmatory | F12 | 保留，增加 G-S/G-O/G-C/G-V 前置 |
| WP8 paper/artifact | F13 | 保留，强制 claim matrix 和 legacy 隔离 |
| Stage-1 audit Q1/Q2 | F5 | 核心已完成，生产桥待完成 |
| Stage-1 audit Q3/Q4/Q5/Q7/Q8 | F4、F5、F8 | 仍是 schema-5/confirmatory blocker |
| `group` randomization | future | 当前 fail closed，不阻塞 run-level 论文 |

## 9. 八周关键路径

| 周 | Codex 高风险工作 | Claude Code / DeepSeek 低风险工作 | Gate |
|---|---|---|---|
| 1 | F0–F3 语义、校准、阈值核心 | 对抗测试、文档字段同步、fixture | G-S |
| 2 | F4 private outcome；F6 adapter 定义与核心 | parser/missingness fixtures、文档 | G-O |
| 3 | F5 Stage-1 Runner；F7 governance delivery | Runner 周边测试、CLI/manifest 同步 | G-C |
| 4 | F8 schema-5 权威纵切与 commitment | replay/negative fixtures、执行清单 | G-V、G-D |
| 5 | F9 metric/failure 冻结；pilot 决策 | F10 全链复演、smoke 执行与汇总 | G-P |
| 6 | preregistration、power/预算、claim freeze | manifest 生成、机械审计 | G-F |
| 6–7 | 监控 confirmatory，不改规则 | 按冻结脚本运行、校验、汇总 | G-X |
| 8 | 主分析、论文叙事和 claim matrix | 图表/复现说明/文档同步 | G-A |

Gate 延误时，按顺序砍掉：oracle、第二模型族、第二任务 family 的高工程量版本、Stage-2 机制效应、read-only reputation projection。不得砍掉 private outcome、主 baseline、Stage-1 randomization、schema verification、held-out calibration 或 replay。

## 10. 分工边界

### Codex 必须承担

- 理论对象、概率语义、quantity/calibration/threshold contract；
- 公共 schema、状态机、随机化、因果单位、truth firewall；
- production governance 核心、schema-5 单一权威和迁移；
- 主结果、排除规则、preregistration、论文 claim；
- 所有 Claude 输出的最终审查与集成决定。

### Claude Code / DeepSeek 可承担

- 白名单内的对抗测试和 fixture 扩展；
- 文档事实同步、状态表、CLI help、manifest/replay 周边适配；
- 已冻结接口的机械 wiring；
- deterministic campaign、付费实验按冻结配置执行和结果汇总；
- 非核心目录的静态审查、测试失败分类和复现说明。

每次只下发一个有文件白名单、禁止项、验收命令和停止条件的工作包。Claude 遇到公共类型、概率语义、随机化、主结果或 red-zone 缺陷必须停止，不得自行“优化”。

## 11. 论文设计与结果分支

### 11.1 最小可发表贡献

1. claim-centric explicit belief/evidence protocol；
2. 将 observation、diagnosis、randomized decision、delivery/compliance 和 outcome 分开的可审计治理架构；
3. 在分布式信息和对抗失败下的随机协议比较；
4. schema-5 replay + claim ceiling + reproducibility artifact。

### 11.2 Claim ceiling

| 级别 | 允许证据 | 允许表述 |
|---|---|---|
| C0 | 定义、描述统计、deterministic fixture | 系统记录/计算了某量 |
| C1 | held-out prediction/calibration | 某量在冻结域内预测某结果 |
| C2 | Stage-1 随机 ITT contrast | 某协议导致平均结果变化 |
| C3 | 冻结 mediator、时间顺序和机制检验 | 证据与指定机制一致；仍避免绝对机制证明 |

### 11.3 结果不利时仍可发表的路线

- 治理改善 Brier/calibration 但不改善 accuracy：定位为认识质量和 selective reliability；
- 显式 belief 有效、治理无效或有害：贡献转为表示层价值和治理边界；
- interaction 不优于 independent ensemble：报告互动的成本和 error-cascade 风险；
- 仅部分 failure mode 有效：提出 conditional mechanism design；
- 跨模型不稳定：把模型族作为 moderator，不声称 universal governance；
- pipeline/解析不稳定：不得做效果 claim，退回 measurement-and-audit artifact 论文或继续修复。

## 12. 明确延期项

以下方向只保留文档接口或 read-only projection，不进入当前关键路径：

- Web3 链、token economy、真实资产质押与惩罚；
- 在线学习阈值、动态 dosage、策略自我改写；
- group-level assignment runtime；
- 任意开放世界 claim、连续/结构化 outcome 的全面支持；
- 大规模 UI、provider 扩张、动态 topology；
- 以旧 `F` 为中心的统一理论。

未来信誉系统若启动，只能消费 resolution 后的可审计 settlement，不得反过来定义 belief 真值；先做 read-only reputation projection，再讨论 stake。

## 13. 立即下一步

按依赖只做以下顺序：

1. F0–F3 contract/kernel 与相应 adversarial tests 已完成，G-S 代码级 Gate 已关闭；
2. F4 的确定性核心与 schema-5 载体门已完成（final private outcome、truth
   firewall、resolution/scoring 时序）；生产 Runner 仍未运行公共 final
   private elicitation，生产 G-O 尚未闭环；
3. F5 的 Stage-1 执行 registry/binding、schema-5 Stage-1 单一权威门与
   truth-free elicitation adapter 边界已完成（kernel + 对抗测试）；剩余为
   Runner 生产桥（`preparePrimaryAssignedRunV1` 接线、Runner 调用
   elicitation、schema-5 writer/原子持久化），属 F5/F8 的高风险 Codex 工作；
4. Claude Code 只在冻结接口上补对抗测试与文档事实同步，不碰 outcome 语义；
5. F6/F7/F8（production adapters、delivery/compliance、schema-5 纵切与外部
   commitment）随后；G-V 与 G-D 通过前不运行任何真实或付费 LLM 实验。

这条顺序同时提高项目下限和上限：下限来自 fail-closed、truth firewall、随机化、回放与 claim ceiling；上限来自开放 quantity/domain/action contracts，使新任务、新量和未来信誉机制能够作为插件扩展，而不重写研究内核。
