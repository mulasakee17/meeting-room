# SwarmAlpha v6 地基与治理链系统审计

> 日期：2026-08-09
> 状态：当前理论与治理重构的权威问题清单；若与旧 roadmap 的“已完成”措辞冲突，以本审计和实际代码为准
> 审计方法：先从核心执行代码反推真实语义，再与理论文档核对；本文不把变量名、注释或历史实验结果当作事实证明

## 0. 总判断

SwarmAlpha 已经拥有一个有研究价值的**可审计实验骨架**，但还没有形成一个可以直接支撑 confirmatory governance claim 的完整机制系统。

最稳固的是：任务与真值隔离、显式 claim 概率报告、报告修订与实际暴露记录、轮次原子收口、版本化估计器、实验 assignment/receipt/replay 骨架，以及成本匹配 baseline/alpha 合同。

最薄弱的是：当前“诊断”仍大量由任务相关自报量和启发式阈值构成；若干名称把可观测异常过度解释成了 echo chamber、authority bias、withholding、overconfidence 或 miscalibration；诊断到动作之间没有完整的机制契约；`queued`、prompt 已写入、实际 delivery、agent compliance 和 outcome effect 仍被部分压缩为一个 `applied`；真正的 eligible-event 随机 holdout 尚未进入生产治理路径。

因此当前状态应准确表述为：

> **审计与复现地基已经较强；认识治理的表示层已经成形；控制层尚处于“可实验化的规则原型”，而不是已验证的通用治理机制。**

现在不应立刻启动正式主实验。可以启动 deterministic fixture、解析率试验和小规模机制 pilot；在 P0 Gate 关闭前，不应把旧 detector 驱动的结果写成治理有效性证据。

## 1. 项目应冻结的定位

建议将 SwarmAlpha v6 定义为：

> **An architecture-enforced, claim-centric experimental control plane for auditable multi-agent information dynamics and epistemic governance.**

中文：

> **一个以 claim 为中心、由架构强制记录的多智能体信息动力学与认识治理实验控制层。**

它的普适性不来自一个跨任务通用的“信念值”或“群体自由能”，而来自一组可替换、可版本化的实验原语：

```text
Task / Claim / Evidence / Report / Exposure / Revision / Resolution
DiagnosisHypothesis / Eligibility / Assignment / PolicyDecision
ActionPlan / Delivery / ComplianceObservation / ProximalOutcome / TaskOutcome
```

任务 adapter 决定 claim 和真值如何定义；measurement contract 决定可观测量如何计算；policy contract 决定何时、为什么、以何种概率实施什么动作。核心内核只保证边界、账本、随机化、回放和因果可审计性。

这个定位比“多 agent 排序优化器”更高，也比“通用认知模拟器”更诚实。第一篇论文仍应限定在**可验证、分布式信息任务**；普适性通过至少两个不同任务 family 的同一内核复用来证明，而不是通过开放世界口号来证明。

## 2. 当前真实骨架

### 2.1 已经成立的强骨架

1. **Task/truth boundary**：prompt 侧与 scoring truth 已物理分离，适合做无泄漏实验。
2. **Epistemic observation ledger**：claim、binary/categorical probability、evidence provenance、report、exposure、supersession、resolution 都有显式对象和 fail-closed 校验。
3. **Architecture-observed exposure**：exposure 来自系统实际交付的上下文，而不是事后从文本猜测“谁影响了谁”。这是论文中最有价值的设计之一。
4. **Proper ex-post scoring**：resolved claim 可使用 proper loss；高概率错误自然承担更高 loss。
5. **Round lifecycle**：`finalizeRound` 已是状态、治理和审计的收口点，避免提前退出丢记录。
6. **Semantic separation**：reported、derived、governance estimate、telemetry、outcome 已有分层类型。
7. **Experiment control plane**：truth firewall、assignment schema、manifest-first、receipt、proximal/task outcome、replay verifier 和 paired alpha 的结构已建立。
8. **Monitoring contract**：旧宏观量已被限制为 C0 descriptive/uncalibrated，理论上不再享有物理或因果解释。

### 2.2 仍然存在的三套系统

当前不是一套统一治理系统，而是三套历史层叠：

1. **Legacy scalar governance**：`belief [-1,1]`、文本相似度、引用份额、方差/双峰等；
2. **Native cognitive governance**：reported utility、evidence coverage/quality、inertia、confidence、susceptibility 与八个 delta；
3. **Epistemic/experimentation layer**：claim probability、evidence/exposure ledger、assignment、receipt、outcome。

第三套最适合作为论文主线，前两套应降为：

- legacy compatibility telemetry；或
- 有明确版本、支持域和校准 artifact 的候选 risk signals。

它们不应继续以心理或社会机制名称直接驱动主实验干预。

## 3. “信念”到底怎么算

### 3.1 规范 belief

规范 belief 只能定义为：

```text
b_i,t(c) = agent i 在时刻 t 对已注册 claim c 的自报概率分布
```

它是 architecture-recorded report，不是系统从文本恢复出的 latent mental state。binary claim 为 `[0,1]` 概率；categorical claim 为规范选项上的概率单纯形。

该对象目前在**表示和事后评分**上是严谨的：绑定 claim、验证分布、记录可见报告、记录修订、resolution 后使用 proper scoring rule。

但要明确三个边界：

- 概率由 agent 自报，不等于已经校准；
- 单个 report 的 Brier loss 是预测损失，不等于“校准曲线”；校准必须跨一组已解析 claim 估计；
- `observedReportIds`/exposure 能证明信息可见，不能单独证明该报告导致了后续更新。

### 3.2 不再称为 belief 的对象

- `belief [-1,1]`：legacy scalar stance；
- utility vector：reported option utility/stance vector；
- `confidence.stated`：自报把握度；若已有规范概率，不应再把它解释为同一 claim 的第二个概率；
- inertia/susceptibility：给定 estimator 下的行为代理量；
- distance from group mean：dissent/discrepancy，不是 overconfidence；
- consensus/alignment：群体输出关系，不是 truth 或 epistemic adequacy。

### 3.3 miscalibration 的正确治理对象

“高置信、低证据、最终错误应承担更高 epistemic cost”可拆成两个阶段：

1. **resolution 前**：系统不知道对错，只能根据高概率、证据缺失/未验证、独立 lineage 不足等条件触发 verification eligibility；不能宣称检测到了 miscalibration。
2. **resolution 后**：使用 proper loss、校准误差和预注册 stake multiplier 结算；这时才能谈 miscalibration cost。

当前 runtime 把 `stake` 固定为 `0`，且没有 settlement/reputation 状态机。因此 stake/reputation 目前只是类型与离线 scoring primitive，不是已实现治理机制。

## 4. Evidence 与“Belief DAG”的真实边界

当前 ledger 已有两类边：

- 同一 agent 的 report supersession；
- source report 到 target agent 的 exposure。

这更准确地叫 **report–exposure revision graph**，还不是完整 Belief DAG。缺失内容包括：

- claim 与 claim 的 entailment/conflict/dependency 边；
- evidence 的 derived-from、duplicates、contradicts、verifies 边；
- evidence verification status 和验证器身份；
- source/lineage 多对多关系与相关性；
- content hash 的边界验证；
- evidence-to-report 的可核验引用语义。

P0/P1 不需要构造万能知识图谱。最小 `EpistemicGraphV1` 只需包含：

```text
Claim <-supports/attacks- Evidence <-derived_from/duplicates- SourceLineage
Claim <-reports- BeliefReport <-supersedes- BeliefReport
BeliefReport -exposed_to-> Agent
Evidence -verified_by-> VerificationRecord
```

`contentHash` 只证明内容身份，不证明内容真实；`lineageId` 只表明潜在相关来源，不自动判假。lineage cap 只能防止同源重复被当作独立 corroboration，不能成为真值裁决器。

## 5. 监测与诊断审计

### 5.1 核心错误：观测可靠不等于构念有效

若系统完整记录了一个自报 utility，最多说明该字段被可靠观测；这不意味着“极化”“权威偏差”或“信心偏差”的测量置信度为 `1.0`。当前部分 delta 把轮内可见数据直接设为 `minConfidence=1.0`，混淆了：

- 数据是否缺失；
- parser 是否可靠；
- 代理量是否稳定；
- 代理量是否真的测到目标构念；
- 该构念是否对当前任务有害。

后续 contract 必须至少拆成：`observationCompleteness`、`measurementReliability`、`constructValidityStatus`、`calibrationArtifactRef`。

### 5.2 现有 detector 的安全重命名

| 当前名称 | 代码真正观测到的内容 | 建议名称 |
|---|---|---|
| echo chamber | 低 stance 方差 + 词袋相似/utility 相似 | `content_redundancy_risk` |
| authority bias | 引用集中或 inertia concentration | `reference_or_influence_concentration` |
| polarization | stance 方差/小样本双峰或 utility distance | `stance_cluster_separation` |
| premature consensus | 早期低方差/高 utility 一致 | `early_closure_risk` |
| information withholding | 某 agent evidence 字段为空 | `missing_evidence_report` |
| ignored input | 被引用但自身没有引用 | `no_observed_cross_reference` |
| confidence gap/overconfidence | 高自报 confidence 且偏离组均值 | `high_confidence_dissent` |
| evidence silence | reported evidence `shared` 计数不均 | `reported_evidence_visibility_imbalance` |
| no response | exposure 后未观测到 utility 大幅变化 | `no_observed_revision_after_exposure` |
| stance flip | top choice 改变 | `top_choice_revision_event` |

这些名称是 descriptive。只有在 held-out 数据上预测到预注册 failure outcome 后，才能升级为 predictive risk detector；只有经过随机化策略试验，才能允许其进入控制路径。

### 5.3 目前最危险的控制逻辑

1. 把偏离群体均值的高置信 agent 当作 overconfident，可能惩罚正确少数派。
2. 把 evidence 为空称为 withholding，错误推断了 agent 的私有知识与意图。
3. `inject_evidence` 有时只是 generic prompt/counterargument，有时会暴露 private knowledge；同名动作对应不同 treatment。
4. `shuffle_knowledge` 改变了信息分配本身，属于环境 treatment，不应与普通治理动作混在一起。
5. 多个 detector 可同时产生互相冲突的动作，没有 arbitration、budget、precedence 或 contraindication。
6. 自适应阈值和最近五次“effectiveness”会在线改变 policy；confirmatory run 中会破坏 treatment stationarity。
7. 当前 effectiveness 以 belief diversity 的即时变化近似，并可能反馈到 dosage；它既不是机制特异 outcome，也不是因果效果。
8. `getMinConfidence` 在缺数据、缺目标或 estimate 缺失时返回 `1.0`，属于 fail-open。

## 6. 缺失的治理链

规范治理链必须是：

```text
Observation
  -> Versioned Risk Signal
  -> Diagnosis Hypothesis
  -> Eligibility Decision
  -> Event-level Assignment
  -> Policy Decision / Arbitration
  -> Action Plan
  -> Queued
  -> Delivered
  -> Compliance Observation (or unobservable)
  -> Proximal Mediator Outcome
  -> Resolved Task Outcome
  -> Causal Estimate / Settlement
```

当前代码大体具备 Observation、部分 Diagnosis、run-level Assignment、简化 Receipt 和 TaskOutcome；缺失的是中间的统一 `GovernanceDecisionRecord`、动作定义契约、delivery/compliance 状态，以及真实 eligible-event holdout。

### 6.1 必须新增的 GovernanceDecisionRecord

至少包含：

```ts
interface GovernanceDecisionRecord {
  id: string;
  policyRef: { id: string; version: string };
  diagnosisIds: string[];
  eligibilityRuleRef: { id: string; version: string };
  eligible: boolean;
  candidateActionRefs: Array<{ id: string; version: string }>;
  selectedActionRef?: { id: string; version: string };
  assignmentId?: string;
  arbitrationReason: string;
  budgetBefore: Record<string, number>;
  sourceEventIds: string[];
  decidedAtRound: number;
}
```

它不等于 detector result，也不等于 application receipt。它负责解释“为什么这个 diagnosis 使该动作有资格、为何从候选动作中选择它”。

### 6.2 必须新增的 InterventionContract

每个动作都要声明：

- action id/version 与 intervention family；
- eligibility rule；
- target unit；
- dose/参数与资源成本；
- 预期 mediator 和方向；
- observation window；
- contraindications；
- 与其他动作的冲突/优先级；
- control/sham 定义；
- delivery 与 compliance 的可观测边界；
- 可随机化单位。

若这些字段没有定义，detector → intervention 只是 prompt heuristic，不是 mechanism design。

### 6.3 状态机必须拆开

当前 `applied` 在部分路径中可能只表示“已生成/已排队”，Runner 又会把它写成 applied receipt。应改为：

```text
proposed -> eligible -> assigned -> queued -> delivered ->
compliance_observed | compliance_unobservable -> completed | failed
```

- prompt 写入下一轮上下文只能称 `delivered`；
- agent 是否按提示修订不能从 delivery 推断；
- graph 权重即时变更可以记录为 `executed`，但仍不能叫 effective；
- `effective` 只用于统计估计，不用于操作状态。

## 7. 干预策略应如何重构

### 7.1 按可操纵杠杆分类

1. **信息获取**：请求验证、调用工具、请求来源；
2. **信息暴露**：路由已登记 evidence、展示反证、补充未见 lineage；
3. **审议过程**：cross-examination、counterargument、独立复核、发言顺序；
4. **聚合制度**：等权、lineage cap、abstention、影响上限；
5. **参与治理**：隔离重复 lineage/Sybil cluster、限制单源带宽；
6. **资源与退出**：追加验证预算、继续一轮、停止。

“generated counterargument”与“verified evidence exposure”必须是两个动作。`shuffle_knowledge` 必须归到 task information-map treatment，而非普通在线治理。

### 7.2 第一篇论文只保留三种低歧义动作

1. **verification_request_v1**
   - eligibility：claim 概率超过阈值，且 verified independent lineage 数不足；
   - 动作：要求给出来源或调用预注册 verifier；
   - mediator：verification rate、有效 lineage coverage、revision/abstention；
   - 不注入真值。
2. **independent_countercheck_v1**
   - eligibility：高置信报告将被聚合，但独立 corroboration 不足；
   - 动作：让尚未暴露于该报告的 agent 独立判断；
   - mediator：独立报告数量与相关性下降；
   - 必须保证顺序和 token 成本匹配。
3. **lineage_capped_pool_v1**
   - eligibility：多个最新报告共享同一 lineage；
   - 动作：聚合时限制同源总权重；
   - mediator：effective independent source count、pooled probability 变化；
   - 不判断同源报告为假。

`reduce_weight`、泛化 `inject_evidence`、`shuffle_knowledge`、自适应 dosage 和基于组均值的“overconfidence correction”不进入首轮 confirmatory policy。

### 7.3 首个可证伪策略例子

```text
If max_probability >= tau_p
and verified_independent_lineages < m
and claim is unresolved
and verification budget remains,
then the event is eligible for verification_request_v1.
```

在 eligible event 上随机分配 `request` vs `holdout/sham`。预期近端机制不是“belief diversity 增加”，而是：verified lineage coverage 增加、无依据高置信下降、合理 abstention 增加。最终结果才是 Brier/accuracy/cascade/recovery。

## 8. 因果与实验设计收口

### 8.1 两级随机化

- **Primary**：run/group-level arm assignment，用于总体 governance alpha；这是首篇论文最稳的因果比较。
- **Secondary**：eligible-event micro-randomization，用于动作的 proximal mechanism effect；同一 run 有历史依赖与干扰，因此只作为 exploratory within-policy estimand，或使用明确的纵向方法后再升级。

多 agent 中一个 agent 的 treatment 会影响其他 agent，不能假设普通个体级 SUTVA。主分析单位应是 run/group；report、claim、round 只作为嵌套观测，标准误按 task/run cluster 处理。

### 8.2 必须消除的混杂

- 所有 arm 使用相同的基础发言顺序策略；治理改变顺序时必须记为显式 treatment。
- 所有最终概率测量使用同一 private final elicitation。
- prompt 长度、调用数和附加思考预算使用 cost-matched baseline 或 sham prompt。
- fixed-round 是主实验；自适应 stopping 只做后续消融。
- adaptive threshold/dosage 在 confirmatory 阶段冻结，不能根据正在评估的数据在线改写。
- failure injection 在 pre-run manifest 中冻结，不得按运行结果临时添加。

### 8.3 机制指标而非万能 proximal 指标

`meanConfidence` 与 `beliefSpread` 只能保留为描述性兼容指标。每个 intervention 必须有自己的 mediator：

- verification request → verification completion / source validity / revision / abstention；
- independent countercheck → independent lineage count / pre-exposure report availability；
- lineage cap → effective source count / pooled weight concentration；
- speaking-order intervention → actual exposure order / contribution share；
- counterargument probe → claim-specific revision，不是 generic diversity。

## 9. 普适性如何真正提高

### 9.1 不追求跨任务通用量

以下量不可能在所有任务中共享同一含义：utility、evidence coverage、consensus、accuracy、polarization、confidence。强行统一只会降低科学性。

普适性应分三层：

1. **Kernel universality**：ledger、assignment、receipt、replay、budget、version、missingness；
2. **Epistemic-task universality**：binary/categorical claim、probability、evidence、exposure、resolution、proper scoring；
3. **Domain adapters**：排序、事实核验、约束满足、规划验证、偏好聚合、开放生成各自的 ontology/evaluator。

第一篇只需证明前两层跨两个 verifiable task families 复用。例如：

- distributed-information categorical choice/ranking；
- binary claim verification 或可执行约束满足。

这已经足以证明项目不只局限于排序任务。Preference/open-ended 要求完全不同的 evaluation contract，不应为了“看起来通用”仓促加入。

### 9.2 可复用贡献应落在合同而非 detector 名称上

最可复用的论文贡献是：

- architecture-observed belief/exposure/revision ledger；
- truth-safe task/scoring split；
- diagnosis–assignment–delivery–outcome 的治理生命周期；
- lineage-aware 但不越权判真的聚合；
- event-level randomized governance evaluation；
- claim-ceiling 与 replay verifier。

某个 `polarizationThreshold=0.15` 或特定 HiddenBench evidence coverage 公式不是通用贡献，只是一个 task/policy artifact。

## 10. 分优先级执行方案

### P0 — 在任何正式实验前关闭

#### P0a：语义隔离与控制禁区

- [ ] 将 legacy/native 心理化 detector 名称降为 descriptive risk signal；保留旧字段仅用于 replay alias。
- [ ] 默认主实验不允许未校准 legacy/native detector 直接控制动作。
- [ ] 将 observation completeness、measurement reliability、construct validity、calibration status 分开。
- [ ] `getMinConfidence` 缺数据/缺目标改为 fail-closed，不得返回 1.0。
- [ ] 明确规范 belief、reported confidence、estimator meta-confidence 三者不可互换。

**Gate G4a**：任一默认控制信号都能给出 version、support domain、eligibility rule、calibration/experimental permission；否则只记录不控制。

#### P0b：治理决策与动作状态机

- [ ] 新增 `GovernanceDecisionRecord` 和 `InterventionContract`。
- [ ] 建立 diagnosis → eligibility → assignment → policy decision → action receipt 的稳定 ID 链。
- [ ] 将 `applied` 拆成 queued/delivered/compliance/completed；修复 Runner 将 queued 当 applied 的语义。
- [ ] 定义多动作 arbitration、budget、precedence、conflict 和 contraindication。
- [ ] 停止用即时 diversity change 自动更新所有动作 dosage。

**Gate G4b**：replay 能从 raw artifact 唯一恢复每个 eligible event 的候选动作、抽签、交付状态、观察窗口和缺失原因。

#### P0c：Epistemic runtime 原子桥

- [ ] 将现有显式 report/exposure 路径接入允许治理的 production condition 与 campaign arm，解除“epistemic task 只能 governance none”的阶段性限制。
- [ ] claim/evidence/report/exposure 与 round state 在同一提交边界保持原子性；commit 失败不得残留 latest-report map。
- [ ] discussion 完成前 runtime 不得读取 resolution；结束后 scorer 才解析和计分。
- [ ] final private elicitation 在所有 arm 一致执行。
- [ ] 实现 equal-weight linear pool + abstention + deterministic tie-break。

**Gate G4c**：deterministic fixture 可完整回放 false report → exposure → revision → final elicitation → resolution → proper score。

#### P0d：最小 Evidence/Lineage graph

- [ ] 建立 source lineage、evidence identity、dedup/derived-from/verification record。
- [ ] ingestion boundary 验证 content hash；原始 evidence 不被语义聚类覆盖。
- [ ] 实现 lineage-capped aggregation，且单测证明同源 Sybil 不增加独立权重。
- [ ] generic counterargument 不得登记为 verified evidence。

**Gate G4d**：同源重复、独立 corroboration、冲突 evidence、未知来源均有手算 fixture 和 fail-closed 行为。

#### P0e：真实 treatment eligibility

- [ ] 生产路径在 diagnosis 后、action 前创建 eligible-event assignment。
- [ ] 支持 apply/holdout/sham；概率、seed、unit、source diagnosis 预先记录。
- [ ] 统一各 arm 的基础发言顺序和 final measurement。
- [ ] confirmatory policy 冻结 thresholds/dosage/stopping。

**Gate G4e**：同一 manifest 重放得到相同 event assignments；held-out receipt 与 applied receipt 具有相同 action opportunity 和预声明窗口。

### P1 — 小规模机制 pilot

- [ ] 只实现 `verification_request_v1`、`independent_countercheck_v1`、`lineage_capped_pool_v1`。
- [ ] 实现三类 frozen failure injection：high-confidence false report、false/conflicting evidence、same-lineage Sybil。
- [ ] 为每个动作定义 mechanism-specific proximal metric contract。
- [ ] 统计 parser invalid/missing rate、verification availability、event eligibility rate、treatment delivery rate。
- [ ] 校准阈值只使用 calibration split，产出不可变 artifact。
- [ ] pilot 只用于可运行性、方差/效应量、预算和失败模式估计，不做结果导向调参。

**Gate G5**：invalid report < 预注册上限；每个关键 failure mode 有足够 eligible events；没有 truth leakage；成本和动作机会可匹配。

### P2 — Confirmatory campaign

- [ ] 至少包含 independent ensemble、vanilla、explicit belief、epistemic governance、random/sham governance、full-information oracle、cost-matched strong baseline。
- [ ] Primary estimand 使用 run/group-level randomization；eligible-event effect 明确标为 secondary/exploratory。
- [ ] 主结果：group accuracy/quality、group Brier、false consensus、exposure-associated cascade、recovery、abstention、cost。
- [ ] 报告 calibration curve 与 proper loss；不把单次错误称为 miscalibration。
- [ ] 预注册 exclusion、missingness、right-censoring、cluster inference、multiple comparison 和 negative result handling。
- [ ] 至少两个 verifiable task families；若做不到，论文 claim 明确收缩到 distributed categorical inference。

### P3 — 论文后或有余力再做

- [ ] 长期 reputation state 与跨任务更新。
- [ ] 非资产化 stake experiment、settlement、budget conservation 与 anti-gaming。
- [ ] Sybil/collusion 的博弈分析。
- [ ] preference aggregation 与 open-ended synthesis adapters。
- [ ] 学习型 adaptive governance/termination policy。
- [ ] Web3 链、token、公开 reputation marketplace。

Web3 现在只保留为 future mechanism-design 路线。没有长期身份、可验证 settlement、预算约束、策略 agent 和攻击模型之前，加入 token 只会增加工程表象，不会增加论文因果含金量。

## 11. 论文 claim ceiling

P0/P1 完成前可以说：

- architecture-enforced explicit belief representation；
- architecture-observed exposure and revision audit；
- reproducible governance experiment lifecycle；
- proper ex-post scoring for resolved binary/categorical claims；
- a research candidate for epistemic governance experiments。

不能说：

- 系统恢复了 agent 的真实 belief；
- 当前 detector 已识别 echo chamber/authority bias/miscalibration；
- 现有 prompt intervention 具有因果效果；
- 当前 stake/reputation 已形成责任机制；
- 已对开放世界、多种任务实现普适治理。

P2 得到真实随机实验证据后，才有资格讨论：

- explicit belief protocol 是否改变 calibration/error propagation；
- 特定治理策略是否通过预声明 mediator 改善结果；
- 效果在哪些任务、模型和 failure regimes 下成立。

## 12. 下一步唯一正确顺序

1. 先冻结术语与控制许可，禁止旧启发式继续扩大理论债务。
2. 再补 `GovernanceDecisionRecord`、`InterventionContract` 和真实动作状态机。
3. 再接通 epistemic runtime、resolution/scoring 与最小 evidence-lineage graph。
4. 再实现 eligible-event assignment 和三个低歧义动作。
5. 最后做 pilot、冻结 calibration artifact，才进入 confirmatory campaign。

这条顺序看似比“直接跑实验”慢，但它消除了最昂贵的风险：跑完大量样本后才发现 treatment 不同义、receipt 不代表交付、detector 不测目标构念、或结果只能解释为更多 token/顺序变化。

## 13. Owner 决策记录

2026-08-09 已冻结以下执行选择：

1. legacy/native 旧治理主动退出 v6 confirmatory 默认控制路径，但保留历史 replay 与只读兼容；
2. 当前优先关闭工程与方法学 P0，不提前锁死论文最终适用域；
3. binary claim verification 原则上作为第二任务族，但不阻塞 P0；
4. 接受新 schema/API 的受控升级，旧 artifact 不回填不存在的新生命周期事实；
5. 付费实验总预算为人民币 500 元，按 smoke、calibration pilot、confirmatory、应急储备分阶段释放；
6. Web3、长期 reputation 和经济 stake 延期，只允许默认关闭且不改变行为的 future-facing interface。

其中第 2、3 项应在 P0e 通过、进入付费 P1 前再次决策。其余四项视为当前实施合同，除非 owner 明确修改。
