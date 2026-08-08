# SwarmAlpha v6 Research Candidate：后续发展总施工合同

> 状态：Executable Master Plan
> 基线日期：2026-08-08
> 理论上位文件：`docs/theory/SWARMALPHA_V6_FOUNDATION.md`
> 适用对象：Claude Code / DeepSeek 执行者、Codex 复核者、项目负责人
> 核心目标：在不牺牲可复现性和科学有效性的前提下，把 v6 Research Candidate 推进到可运行的 confirmatory campaign 与 AAMAS 长文证据包

---

## 0. 如何使用本计划

不要让任何 agent 一次性“执行整个计划”。正确方式是：**一个 Work Package（WP）一个任务、一个受限文件集合、一个提交、一个验收报告**。每完成一个 WP 就停下，等待人工或 Codex 审核；未经审核不得跨越 Gate。

Claude Code 的第一次提示词应当是：

```text
请先完整阅读：
1. docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md
2. docs/theory/SWARMALPHA_V6_FOUNDATION.md

只执行 WP0，不执行后续 WP。严格遵守白名单、禁止事项、验收命令和提交边界。
开始前输出 git status；结束时输出：修改文件、关键决定、测试结果、未解决问题、commit hash。
遇到理论语义、公共 schema、随机化、评分公式或 claim 等需要改变本计划的地方，停止并报告，不得自行改写规范。
```

后续每轮使用：

```text
基于 docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md，只执行 WP<N>。
先核对上一 Gate 已通过；只修改该 WP 白名单文件；完成测试、提交和进度记录后停止。
```

### 0.1 执行权限分级

| 等级 | Claude 可否自主优化 | 内容 |
|---|---|---|
| Green | 可以 | 文档同步、测试补齐、重复代码机械抽取、错误信息、CLI 参数、manifest 校验、分析输出格式 |
| Yellow | 只能在本计划定义内优化 | 新类型、adapter、raw schema、runner、baseline、指标实现；不得改变语义或默认值 |
| Red | 不可以，必须停下审核 | 理论对象、概率语义、treatment assignment、随机化单位、评分规则、主结果、排除规则、论文 claim、公共 API 破坏性迁移 |

“遇到可优化地方会优化”只适用于 Green；Yellow 必须有等价性测试；Red 的任何“优化”都可能改变 estimand 或破坏复现，必须写成建议而不是直接实现。

### 0.2 全局禁止事项

1. 不读取、输出或提交 `.env*`、密钥、provider credential。
2. 不批量 `git add .`；必须逐文件白名单暂存。
3. 不删除、移动或格式化与当前 WP 无关的用户文件。
4. 不改写历史 raw artifact；迁移必须生成新文件并保留 source hash。
5. 不用 `Math.random()`；所有科研路径必须使用显式 seed 和稳定 PRNG。
6. 不在 prompt builder 中读取 ground truth、correct answer、scoring key 或 resolution。
7. 不把 LLM 生成的 counterargument 称为 evidence，不把 exposure graph 称为 causal graph。
8. 不用未校准监测信号默认控制排序、停止或干预。
9. 不把一个 run 内的 round/report 当作独立样本做显著性检验。
10. 不因结果不显著而调阈值、换排除规则、增加未预注册主指标。

### 0.3 每个 WP 的完成模板

在 `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md` 追加：

```text
## WP<N> — <name>
- status: complete | partial | blocked
- commit: <hash>
- files changed: ...
- contract decisions: ...
- tests: command + exact result
- compatibility: ...
- deviations from master plan: none | ...
- unresolved risks: ...
- reviewer gate requested: G<N>
```

若未通过验收，不得写 `complete`，不得为了绿灯削弱测试。

---

## 1. 项目真实状态与战略判断

### 1.1 已经扎实的部分

- `finalizeRound` 已成为唯一轮次提交与退出仲裁点，避免提前退出丢失治理和审计记录。
- epistemic ledger 已具备 claim、probabilistic belief report、evidence provenance、exposure、supersession、resolution 和 proper scoring。
- estimator contract 已具备版本、输入快照、配置指纹、输出指纹和 replay verifier。
- monitoring signal 已有版本、公式、来源层、支持域、校准状态、claim ceiling 和默认控制许可。
- native 与 legacy 两套 macro signals 已用 signal-set identity 隔离；旧 `R/T/H/F` 仅为兼容别名。
- native 主路径默认固定轮数，未校准排序和 screening 已改成显式 opt-in。
- raw schema 3.0 已承接 macro signal identity，schema 2.0 的 estimator replay 能力得到保留。
- 当前验证基线：41 test files，868 passed，3 skipped；TypeScript 与 production build 通过。

### 1.2 论文价值最大的缺口

按优先级排序：

1. **不可计算 swarm alpha**：没有统一、成本匹配的 independent ensemble 与 interaction 配对单位。
2. **不可识别 governance alpha**：现有 `random-intervene` 是随机动作生成器，不是预先登记的 treatment assignment。
3. **任务/真值隔离不完整**：理论定义存在，但主代码没有统一 `TaskSchema / InformationMap / GroundTruth / EvaluationContract`。
4. **治理闭环只记录到 intervention**：缺少 eligibility、assignment probability、application receipt、effective window、proximal outcome 和 task outcome 的稳定关联。
5. **显式 epistemic mode 尚未接入治理**：它目前可审计、可评分，但初始化时强制 `governanceMode=none`。
6. **EvidencePool 与 EpistemicLedger 是两条平行路径**：一个服务 prompt 共享，一个服务 belief audit，尚未形成统一 evidence projection。
7. **监测信号只有 C0**：没有 held-out calibration artifact，不能作为预测或默认控制证据。
8. **现有 `causalEffect.ts` 名称和 claim 过强**：轨迹匹配依赖条件可忽略性，应降格为 exploratory sensitivity analysis。
9. **实证普适性未建立**：当前强项仍是 verifiable categorical / hidden-profile；preference 与 open-ended 只是理论接口。
10. **历史实验资产混杂**：大量 debug/E12 脚本和旧报告不能作为 confirmatory 证据入口。

### 1.3 两个月的唯一主线

不要同时追逐“通用多 agent 平台”“Web3 信誉经济”“社会热力学”“动态拓扑”“开放生成”和“大规模 benchmark”。两个月主线必须收缩为：

> **Can architecture-enforced explicit belief states and auditable, randomized epistemic governance reduce false consensus and error propagation under distributed information and adversarial epistemic failures?**

论文中 SwarmAlpha 是 **causal research control plane**；主实验研究 **verifiable distributed-information tasks**。Preference/open-ended、长期 reputation、stake economics 和策略博弈进入 future work，不进入第一篇主论文的核心实现。

---

## 2. 目标架构

最终主链必须是：

```text
Task Bundle
  ├─ PromptTask: schema + public/private information + protocol
  └─ ScoringTask: hidden truth + resolver + evaluation contract

PromptTask
  -> independent reports
  -> communication protocol
  -> claim-relative belief reports
  -> evidence / exposure / supersession ledger
  -> monitoring + diagnosis
  -> pre-registered treatment assignment
  -> intervention application receipt
  -> next-window proximal observations
  -> final decision

ScoringTask + immutable run ledger
  -> outcome evaluation
  -> swarm alpha / governance alpha / calibration / cascade metrics
  -> schema verification + analysis manifest
```

### 2.1 必须保持分离的五层

1. **Task ontology**：任务是什么、候选空间是什么、谁能看到什么。
2. **Epistemic representation**：claim、probability、evidence、exposure、revision。
3. **Monitoring/diagnosis**：从记录导出的描述或预测信号。
4. **Treatment/control**：谁在何时以何概率被分配到什么动作。
5. **Outcome/evaluation**：只有结束后才能读取的 truth、quality 和 cost。

任何实现若让同一个对象跨越两层而不带 projection method/version，应视为架构错误。

---

## 3. 八周里程碑

| 周期 | 里程碑 | 必须产物 | 决策 Gate |
|---|---|---|---|
| 第 0–1 周 | 冻结基线、任务合同 | clean commits、TaskBundle、truth firewall | G0–G1 |
| 第 1–2 周 | treatment ledger | assignment manifest、application/outcome linkage、schema 4.0 | G2 |
| 第 2–3 周 | baseline 与 alpha | independent/vanilla/random/diagnostic/oracle、paired alpha | G3 |
| 第 3–4 周 | epistemic bridge | explicit belief + evidence/exposure DAG + governance policy | G4 |
| 第 4 周 | pilot 与校准 | task audit、parser audit、power inputs、frozen calibration artifact | G5 |
| 第 5–6 周 | confirmatory campaign | immutable run manifest、完整 raw artifacts、failure ledger | G6 |
| 第 6–7 周 | 锁定分析 | schema-gated metrics、统计结果、ablation、negative results | G7 |
| 第 7–8 周 | 论文与复现包 | paper figures/tables、claim matrix、artifact instructions | G8 |

如果任何 Gate 延迟，首先砍掉 preference/open-ended、动态 topology、stake/reputation，不得砍掉 baseline、randomization、schema verification 或 held-out discipline。

---

## 4. WP0 — 冻结理论收口基线

### 目标

把当前已验证但未提交的 theory closure 与其他用户 untracked 文件隔离，形成可回退基线。

### 操作

1. 运行 `git status --short`。
2. 不触碰既有无关 untracked 文件，尤其是：`CLAUDE.md`、既有 `docs/AUDIT_*`、`docs/DATA_*`、`docs/EXPERIMENT_DESIGN_V7.md`、`docs/REASONING_PROTOCOL.md`、`docs/SWARMALPHA_TECHNICAL_DOCUMENTATION.md`、`docs/architecture/RUNTIME_GUIDE.md`、旧 E12/debug/probe/analyze 脚本。
3. 仅白名单暂存 theory closure 的 tracked diff、新增 `src/lib/monitoring/*`、`test/monitoring-contracts.test.ts`。
4. 将本 master plan 单独提交，不与核心代码混成一个 commit。

Theory closure 精确白名单：

```text
docs/theory/SWARMALPHA_V6_FOUNDATION.md
experiments/campaign/pipeline/MetricComputer.ts
experiments/campaign/pipeline/Runner.ts
experiments/campaign/replayVerifier.ts
experiments/campaign/types.ts
src/lib/discussion/asyncEngine.ts
src/lib/discussion/index.ts
src/lib/discussion/nativeCognitiveEngine.ts
src/lib/discussion/types.ts
src/lib/epistemic/semantics.ts
src/lib/evaluation/index.ts
src/lib/evaluation/types.ts
src/lib/governance/index.ts
src/lib/governance/types.ts
src/lib/monitoring/contracts.ts
src/lib/monitoring/index.ts
src/lib/thermodynamics/MeasurementLayer.ts
src/lib/thermodynamics/TerminationDecider.ts
src/lib/thermodynamics/computeDelta.ts
src/lib/thermodynamics/index.ts
src/lib/utils/statsUtils.ts
src/runtime/GovernanceRuntime.ts
test/delta-diagnosis.test.ts
test/evaluation.test.ts
test/governance-estimator-replay.test.ts
test/governance.test.ts
test/measurement-layer.test.ts
test/monitoring-contracts.test.ts
test/native-cognitive-engine.test.ts
test/stats-utils.test.ts
test/termination-decider.test.ts
```

Master plan 精确白名单只有：

```text
docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md
```

### 建议提交

```text
feat: close v6 monitoring and theory contracts
docs: add v6 execution masterplan
```

### 验收

```powershell
npx tsc --noEmit
npm test
npm run build
git diff --check
git status --short
```

预期：41 test files，868 passed，3 skipped；工作树只剩明确属于用户的历史 untracked 文件。

### Gate G0

- 两个 commit 可独立 revert。
- 没有无关文件进入 commit。
- `RAW_SCHEMA_VERSION === "3.0"`。
- 新默认：fixed governance order、fixed sync termination、legacy screening opt-in。

---

## 5. WP1 — TaskBundle 与 truth firewall

### 科学目的

让“任务可被讨论”和“答案可被评分”成为两个物理对象，而不是靠开发者自觉不读取 `correctAnswer`。

### 规范类型

新增 `src/lib/experiment-contracts/`：

```ts
type TaskKind =
  | "verifiable_epistemic"
  | "preference_aggregation"
  | "open_ended_synthesis";

interface TaskSchema {
  id: string;
  version: string;
  kind: TaskKind;
  candidateSpace: CandidateSpace;
  publicContext: string;
  actionContractId: string;
}

interface InformationMap {
  publicEvidenceIds: string[];
  privateEvidenceByAgent: Record<string, string[]>;
  visibilityPolicyId: string;
}

interface PromptTask {
  schema: TaskSchema;
  information: InformationMap;
}

interface GroundTruthEnvelope<T = unknown> {
  taskId: string;
  resolverId: string;
  resolverVersion: string;
  value: T;
}

interface EvaluationContract<Decision = unknown, Truth = unknown> {
  id: string;
  version: string;
  taskKind: TaskKind;
  validateDecision(decision: unknown): Decision;
  score(decision: Decision, truth: Truth): EvaluationRecord;
}

interface ExperimentTaskBundle {
  promptTask: PromptTask;
  scoringTask: {
    groundTruth: GroundTruthEnvelope;
    evaluationContractRef: { id: string; version: string };
  };
}
```

### 实现要求

1. `PromptTask` 类型树中不得出现 `correctAnswer`、`groundTruth`、`resolution`、`scoringKey`。
2. prompt builder 只接受 `PromptTask`，不能接受完整 bundle。
3. scorer 只在讨论结束后获得 `scoringTask`。
4. HiddenBench adapter 从 `searchKeys` 构建 candidate registry；truth-label 完整性检查放在 task loader/audit，不放在 prompt resolver。
5. 为旧 `TaskConfig` 提供单向 adapter；不得让核心新类型依赖旧类型。
6. 初期只实现 `verifiable_epistemic` 的 categorical evaluation contract；另外两类只保留接口和 fail-closed “not implemented”。

### 白名单

- `src/lib/experiment-contracts/**`（新增）
- `experiments/campaign/tasks/**` 中 adapter/loader 的必要文件
- `experiments/campaign/pipeline/hiddenbenchProtocol.ts`
- `experiments/campaign/pipeline/Runner.ts`
- `experiments/campaign/types.ts`
- 对应新增测试

### 必须新增的测试

- TaskBundle runtime validation 与 deep-freeze。
- PromptTask JSON 中不存在 truth 字段。
- prompt builder 的输入类型不接受 scoring task。
- candidate order 不受 `correctAnswer` 对象插入顺序影响。
- malformed candidate/truth mismatch 在 loader 阶段 fail closed。
- legacy adapter 输出与旧主路径候选集合等价。

### 禁止优化

- 不顺便重写所有 task 文件。
- 不把 truth hash 放进 prompt；hash 也可能泄漏候选信息。
- 不宣称 TypeScript 即安全边界；运行时 validator 仍必须存在。

### Gate G1

- 主 campaign prompt 路径无法获得 scoring task。
- 至少 HiddenBench 和一个现有本地任务通过 adapter。
- schema 3.0 仍可读取；此 WP 不升 raw schema。

建议提交：`feat: separate prompt tasks from scoring truth`

---

## 6. WP2 — Treatment assignment 与治理生命周期账本

### 科学目的

这是论文从“规则系统”走向“可因果比较实验平台”的核心。现有 `random-intervene` 只能回答随机动作表现，不能证明 diagnostic policy 的处理效应。

### 两级随机化设计

#### Primary：run-level policy assignment

在 LLM 调用前生成 immutable manifest，以 `(taskId, modelId, replicateSeed)` 为 blocking unit，分配：

- `independent_ensemble`
- `vanilla_interaction`
- `random_governance`
- `diagnostic_governance`
- `epistemic_governance`
- 可选 `full_information_oracle`

同一 block 内共享任务、模型、基础 seed、agent composition 与预算合同。不同 arm 使用由 manifest 派生的独立子 seed，不能依赖执行顺序。

#### Secondary：eligible-event holdout

当 diagnosis 产生候选动作时，可在 diagnostic/epistemic policy 内对 eligible event 做 `apply` vs `holdout` Bernoulli assignment，用于探索 proximal effect。由于同一 run 内存在干预干扰与历史依赖，此分析不得作为 primary ATE，只能标为 exploratory within-policy effect。

### 新对象

新增 `src/lib/experimentation/`：

```ts
interface TreatmentAssignment {
  id: string;
  schemaVersion: "1.0.0";
  unitId: string;
  unitKind: "run" | "eligible_event";
  stratum: Record<string, string | number | boolean>;
  eligibleArms: string[];
  assignedArm: string;
  assignmentProbability: number;
  policyId: string;
  policyVersion: string;
  seed: number;
  randomDraw: number;
  assignedAt: string;
  sourceDiagnosisIds: string[];
}

interface InterventionApplicationReceipt {
  id: string;
  assignmentId: string;
  interventionId?: string;
  status: "applied" | "held_out" | "failed" | "inapplicable";
  appliedAtRound?: number;
  effectiveWindow: { startRound: number; endRound: number } | null;
  targetAgentIds: string[];
  failureCode?: string;
  sourceEventIds: string[];
}

interface ProximalOutcomeRecord {
  id: string;
  applicationReceiptId: string;
  window: { startRound: number; endRound: number };
  metricContractRefs: Array<{ id: string; version: string }>;
  values: Record<string, number | null>;
  missingnessReason?: string;
}

interface TaskOutcomeRecord {
  runAssignmentId: string;
  evaluationContractRef: { id: string; version: string };
  quality: number | null;
  cost: CostRecord;
  status: "scored" | "unresolved" | "invalid";
}
```

### 随机化实现约束

1. 使用稳定、可单测的 counter-based seed derivation：`hash(masterSeed, unitId, policyVersion)`；禁止依赖循环调用次数。
2. assignment 在运行前写入 manifest，运行时只消费，不能现场重新抽签。
3. resume/retry 使用同一 assignment；记录 `attempt`，不能生成新 arm。
4. 概率必须是实际抽样概率，不能事后填 `0.5`。
5. `no_action/holdout` 是正式 arm，不能用“没有 intervention record”表示。
6. diagnosis、assignment、application、outcome 均用不可变 ID 关联。
7. `finalizeRound` 保持唯一 commit point；本轮产生 assignment/application 后才能退出。

### raw schema

完成后升为 `4.0`，并写迁移说明：

- 1.0：legacy/unverifiable estimator input
- 2.0：replayable estimator input
- 3.0：versioned macro signals
- 4.0：treatment lifecycle + pre-run assignment identity

2.0/3.0 仍可读，但不得进入 confirmatory governance ATE。

### 必须新增的测试

- 同 manifest 与 seed 跨执行顺序产生完全相同 assignment。
- 不同 unitId 不意外共享 draw。
- 概率和 eligible arms 验证。
- holdout 有显式 receipt。
- applied/failed/inapplicable 状态互斥。
- hard cap 和提前终止轮不丢失 lifecycle record。
- replay verifier 检查悬空 assignmentId、重复 ID、窗口越界、mixed policy version。
- schema 3 artifact 可读但 confirmatory eligibility=false。

### Gate G2

手工选择一条 run，能够仅凭 raw artifact 回答：

> 为什么该 run/事件有资格、以多大概率被分到哪个 arm、实际做了什么、动作作用于哪个窗口、观察到了什么、最终如何评分？

若任一答案需要重新运行代码或猜测默认值，G2 不通过。

建议提交：`feat: add auditable treatment assignment lifecycle`

---

## 7. WP3 — Baseline ladder、成本合同与 alpha

### 科学目的

建立能区分“通信价值”“治理价值”和“纯粹增加调用预算”的基线阶梯。

### Protocol arms

```ts
type ExperimentalArm =
  | "partial_individual"
  | "independent_ensemble"
  | "vanilla_interaction"
  | "random_governance"
  | "diagnostic_governance"
  | "epistemic_governance"
  | "full_information_oracle"
  | "cost_matched_strong_baseline";
```

定义：

- `partial_individual`：agent 仅看私有信号，单独评分，不聚合成主要群体结果。
- `independent_ensemble`：agent 相互不可见，以预注册 aggregation contract 聚合。
- `vanilla_interaction`：同预算互动，无诊断或干预。
- `random_governance`：与 diagnostic policy 匹配动作数/机会窗，但动作与 diagnosis 不匹配。
- `diagnostic_governance`：现有 behavioral/cognitive diagnosis policy。
- `epistemic_governance`：WP4 的 claim/evidence/confidence-aware policy。
- `full_information_oracle`：所有合法信息对称暴露；是能力上界，不是现实 baseline。
- `cost_matched_strong_baseline`：把治理额外调用用于额外独立样本或 self-consistency。

### BudgetContract

每个 arm 在 manifest 中预先登记：

- `maxLlmCalls`
- `maxPromptTokens`
- `maxCompletionTokens`
- `maxRounds`
- `maxWallClockMs`
- `aggregationCalls`
- `verificationCalls`

调用预算匹配是 primary design；实际 token/latency 进入 cost outcome。不得在结果出来后补调用以追平某个 arm。

### Alpha 定义

同一 block 内配对：

```text
swarm_alpha = Q(vanilla_interaction) - Q(independent_ensemble)
governance_alpha = Q(diagnostic_or_epistemic) - Q(vanilla_interaction)
specificity_alpha = Q(diagnostic_or_epistemic) - Q(random_governance)
oracle_gap = Q(full_information_oracle) - Q(target_arm)

net_alpha(lambda) = delta_Q
                  - lambda_token * delta_tokens
                  - lambda_time * delta_latency
                  - lambda_failure * delta_invalid_or_failed
```

`lambda` 不设唯一“真值”；报告预注册的 sensitivity grid 和 Pareto frontier。

### EvaluationContract v1

第一篇只需：

- categorical accuracy / negative log loss / multiclass Brier；
- ranking 仅在完整顺序真值真实存在时使用 Kendall tau；
- HiddenBench 单选任务不得用伪造的尾部排序计算 tau；
- unresolved/open-ended 返回 `not_applicable`，不是 0。

### 统计单位

primary unit = task × replicate seed × model 的 block-level paired contrast。round/report 只用于机制描述或 cluster-aware 模型，不能扩大 n。

### 必须新增的测试

- independent arm 不读取其他 agent 输出。
- paired arms 的 task/model/base seed/budget contract 一致。
- HiddenBench tau applicability fail closed。
- null/not_applicable 不被平均为 0。
- alpha 只在配对 block 完整且 evaluation contract 相同时计算。
- actual cost 缺失时 net alpha 为 unavailable。

### Gate G3

用 mock LLM 跑完一个 6-arm block，生成：

- immutable assignment manifest；
- 每 arm raw artifact；
- paired `swarm_alpha/governance_alpha/specificity_alpha`；
- cost table；
- 缺失/失败状态。

建议提交：`feat: add cost-matched baseline ladder and alpha metrics`

---

## 8. WP4 — Epistemic runtime bridge 与最小治理策略

### 科学目的

把当前“可单独使用的 epistemic ledger”接入讨论主循环，使显式 belief 真正成为架构处理对象，而不是实验后解析格式。

### 第一篇只实现的对象

1. categorical/binary claim；
2. 概率单纯形 belief report；
3. evidence provenance/content hash/lineage；
4. explicit exposure；
5. report supersession；
6. resolution 后 proper scoring；
7. source-lineage-aware aggregation；
8. high-confidence / insufficient-evidence verification request；
9. abstention。

### 暂不实现

- 可交易 token、链上资产、经济价值 stake；
- 跨用户公开 reputation；
- 长期策略 agent 与 mechanism-proofness；
- 自动事实注入；
- 声称 observedReportIds 是实际因果影响。

`stake` 字段本阶段只作为声明强度/损失权重的实验变量，不能称为资产。

### 三个实验条件

#### 所有条件共享的 final measurement

为避免 measurement confound，A/B/C 以及 independent/random governance 在结束后都必须接受同一个、不可被其他 agent 观察的 final elicitation：

```text
claim_id
final_probability_distribution
abstain
```

该 elicitation 只进入 outcome measurement，不回流讨论。这样 Brier/calibration 的差异来自协议历史，而不是某一 arm 根本没有被要求输出概率。通信阶段是否每轮显式 belief，仍是 A 与 B/C 的有效处理差异。

#### A. Text Baseline

普通文本讨论；通信期间不强制 claim/probability/evidence schema。结束后执行上述公共 final elicitation。不得把最终测量反向描述为讨论过程中已有 architecture-enforced belief。

#### B. Explicit Belief State

每次相关输出强制：

```text
claim_id
probability_distribution
evidence_ids
observed_report_ids
supersedes_report_id | null
abstain
```

只增加表示与验证，不改变 influence/reputation 权重。

#### C. Epistemic Governance

在 B 上增加：

- provenance/lineage validation；
- 同源证据去重或 lineage cap；
- 高置信且证据不足时发出 verification request；
- contradictory evidence 时请求 revision 或允许 abstention；
- aggregation 对未验证同源重复报告不重复计权；
- 所有动作经过 WP2 assignment/receipt。

### Evidence bridge

不要直接删除 `EvidencePool`。建立 adapter：

```text
Discussion evidence item
  -> canonical EpistemicEvidence
  -> EpistemicLedger append
  -> optional prompt-view projection
```

`EvidencePool` 降为 prompt projection/cache；`EpistemicLedger` 是审计来源。近似去重必须保留 cluster method/version/threshold，不得覆盖原 evidence。

### Belief aggregation v1

使用简单、透明、可消融的 aggregation：

1. 每 agent 对同 claim 只使用最新有效 report；
2. invalid distribution fail closed；
3. lineage duplication cap 只消除重复来源权重，不判断真伪；
4. baseline 为等权 linear opinion pool；
5.任何 confidence/reputation weighting 都作为显式 experimental policy，不能默认；
6. final decision = argmax pooled probability，平局规则版本化；
7. abstention agent 不被填成 uniform belief，需单独记录 missingness。

### 必须新增的测试

- epistemic task 不再无条件强制 governance none；只有 A/B/C condition 决定。
- report/exposure/supersession 与 finalizeRound 原子提交。
- malformed/unknown claim/evidence/reference fail closed。
- 同源 Sybil reports 不增加 lineage-capped aggregation mass。
- high-confidence low-evidence 触发 eligibility，但不自动证明错误。
- verification request 不包含 ground truth。
- resolution 只能发生在 discussion 完成后的 scorer 边界。
- replay 同一 ledger 得到相同 pooled decision 与 scores。

### Gate G4

一个完全离线 deterministic fixture 可以展示：

```text
false report introduced
-> exposures recorded
-> downstream reports supersede/update
-> governance eligibility
-> randomized action/holdout
-> recovery or persistence
-> resolution
-> Brier/accuracy/cascade metrics
```

建议拆成两个提交：

```text
feat: bridge epistemic ledger into discussion lifecycle
feat: add minimal auditable epistemic governance policy
```

---

## 9. WP5 — Failure modes 与指标合同

### Failure injection contracts

只实现可控、可记录、可复现的三类：

1. `high_confidence_false_claim`
   - 固定错误 outcome；
   - 预注册 probability，例如 0.9/0.99；
   - evidence condition 分为 absent / weak / fabricated。
2. `false_or_conflicting_evidence`
   - evidence 有唯一 ID、lineage、content hash；
   - resolver 在结束后判定，不在讨论时泄露。
3. `sybil_same_lineage`
   - 多 agent/persona 共享同一 source lineage；
   - 与 genuine independent corroboration 对照。

每个 injector 必须有 `id/version/seed/target/round/intensity/sourceEventIds`，并进入 pre-run manifest。

### Primary outcomes

#### Group accuracy

由 EvaluationContract 给出，run-level。

#### Brier score

按 claim/report 计算，但推断时按 run/task cluster；同时报告 final group Brier 和 individual report Brier。

#### False Consensus Rate

预注册定义：最终 pooled probability 高于阈值 `p_fc` 且 resolved outcome 与 argmax 不一致。阈值必须在 calibration split 冻结；必须同时报告 threshold-free confidence-error curve。

#### Exposure-associated Error Cascade Size

在 false report 被 exposure 后，向错误 outcome 移动超过 `delta_p` 的独立 agent 数。除非 exposure 被随机化，否则名称不得省略 `exposure-associated`，不得称 causal cascade。

#### Recovery Time

从首次 false exposure 到 group probability 连续 `k` 个 observation windows 回到正确侧所需轮数；未恢复作为 right-censored，不得删除。

### Secondary outcomes

- calibration curve / ECE（binning contract 固定）；
- abstention rate 与 selective accuracy；
- evidence verification rate；
- invalid report rate；
- influence/reference Gini；
- unique source-lineage coverage；
- token、latency、failure cost；
- oracle gap。

### Metric contract 通用字段

```ts
interface MetricContract {
  id: string;
  version: string;
  unit: "run" | "claim" | "report" | "exposure_window";
  requiredFields: string[];
  valueDomain: { min?: number; max?: number };
  missingness: string[];
  aggregationRule: string;
  claimCeiling: "C0" | "C1" | "C2" | "C3";
}
```

### Gate G5a

每个指标用手算 fixture 验证，并有：正常、缺失、右删失、invalid、边界值、重复 source、空 agent 集测试。

建议提交：`feat: define failure injection and epistemic outcome contracts`

---

## 10. WP6 — Calibration 与 pilot

### 数据切分

先按 task/template family 切分，再运行任何阈值搜索：

- development：开发 parser、修 bug；
- calibration：拟合 threshold/calibrator；
- confirmatory test：只运行一次主分析；
- robustness：其他 model/task family，不能回流调参。

同一模板变体不得跨 split。split manifest 包含 task IDs、dataset hash、生成脚本版本和 seed。

### MonitoringCalibrationArtifact

```ts
interface MonitoringCalibrationArtifact {
  id: string;
  version: string;
  signalContractRefs: Array<{ id: string; version: string }>;
  targetFailureContractRef: { id: string; version: string };
  trainManifestHash: string;
  calibrationManifestHash: string;
  method: string;
  hyperparameters: Record<string, unknown>;
  thresholds: Record<string, number>;
  heldOutMetrics: Record<string, number>;
  codeCommit: string;
  createdAt: string;
}
```

未携带该 artifact 的 signal 仍是 C0，不能升级 control permission。

### Pilot 目标

Pilot 不是找显著性，而是检查：

- parser invalid rate；
- task ceiling/floor；
- failure injector 是否改变预定状态；
- assignment balance；
- budget adherence；
- raw artifact 完整性；
- outcome variance 和配对相关，为 power 设计提供输入；
- metric missingness/right censoring；
- 模型是否真的服从 explicit belief schema。

### Pilot 通过阈值

- confirmatory-required field 缺失率 = 0；
- parser invalid rate ≤ 5%，否则先修 observation，不跑正式实验；
- run failure rate ≤ 5%，且失败原因可分类；
- assignment 与 manifest 100% 一致；
- baseline accuracy 避免明显天花板/地板：建议主任务落在 20%–85%；
- arm 间预定 call budget 完全一致，实际 token 差异可报告；
- false-injection manipulation check 有明确方向；
- 至少 80% run 能计算 primary outcomes。

### Power 与样本量

1. 用 pilot 的 paired contrast 方差做 simulation/bootstrap power。
2. primary estimand 只选一个：建议 `epistemic_governance - explicit_belief` 的 group accuracy 或 final Brier。
3. 目标 power 0.8，two-sided alpha 0.05；报告最小可检测效应。
4. 对 task/model 使用 block bootstrap 或 mixed-effects robustness；不得把 reports 当独立 n。
5. 若预算不足，减少 secondary cells，不减少主 baseline 或 replicate 完整性。

### Composite/F 决策

比较：

- 各基础信号向量；
- composite；
- 仅 outcome history；
- 简单 baseline predictor。

若 composite 对 held-out prediction 没有稳定增量，保留为 compatibility telemetry，不进入论文主图和控制策略。这是允许且健康的负结论。

### Gate G5

- split、metric、threshold、primary estimand、sample size 和 exclusion rules 全部冻结到 preregistration artifact。
- 之后只允许修会导致所有 arm 同样错误的实现 bug；修复必须 bump code/manifest 并重新开始 confirmatory campaign。

建议提交：`feat: add calibration artifacts and pilot gates`

---

## 11. WP7 — Confirmatory campaign

### 最小可发表设计

#### Task families

至少两类 **verifiable distributed-information** family：

1. HiddenBench/hidden-profile categorical decision；
2. controlled synthetic evidence-propagation benchmark，具有明确 claim、source lineage、truth 和可调 failure injection。

现有 Crisis/University 排序任务只有在 candidate/truth 契约和难度审计通过后才能作为 robustness；不得为凑“多任务”进入主结果。

#### Models

至少两个模型族，固定完整 provider/model identifier、版本或调用日期、temperature、max tokens、timeout。若 provider 不提供版本固定能力，明确记录为外部复现限制。

#### Primary arms

1. independent ensemble；
2. vanilla text interaction；
3. explicit belief state；
4. random governance；
5. epistemic governance；
6. full-information oracle（若预算允许）。

Behavioral/cognitive legacy governance 作为 ablation/bridge，不与 epistemic governance 混成一个 arm。

#### Failure strata

- no injected failure；
- high-confidence false claim；
- false/conflicting evidence；
- same-lineage Sybil。

完整 factorial 过大时，主论文优先：`no failure + high-confidence false + sybil`，把 conflicting evidence 放补充实验。

### Run manifest

confirmatory runner 在调用 LLM 前生成并冻结：

- campaign ID/version；
- clean git commit；dirty tree 必须拒绝，除非 `--pilot`；
- task/model/arm/failure/seed 全部单位；
- randomization block 与 assignment probability；
- budget contract；
- prompt/evaluation/metric/signal/calibration contract refs；
- dataset/prompt/config hashes；
- planned analysis version；
- expected raw artifact path。

### 失败与重试

- 每个 planned unit 始终存在结果：complete / failed / invalid / cancelled。
- retry 使用相同 unit ID、assignment 和 seed，增加 attempt。
- 不自动挑“成功的一次”；预注册使用 first valid attempt 或所有 attempt 的明确规则。
- provider outage 与 parser invalid 分开报告。
- 不因某 arm 成本高而中途选择性停止该 arm。

### Confirmatory analysis

Primary：block-level paired contrast 与 bootstrap/permutation CI。

建议层级：

1. `explicit belief - vanilla`：architecture representation effect；
2. `epistemic governance - explicit belief`：governance effect；
3. `epistemic governance - random governance`：diagnostic specificity；
4. `vanilla - independent ensemble`：swarm alpha；
5. failure-mode interaction：robustness/heterogeneity。

多重比较采用预注册 hierarchical gatekeeping：只有上一级 primary 支持后，才把下一级解释为 confirmatory；其他均标 exploratory。

### Gate G6

- manifest planned units 与 artifacts 一一对应；
- schema/replay verifier 通过；
- 无手工修改 raw JSON；
- exclusions 由预注册规则自动产生；
- campaign 结束前不看 arm-level主结果。

建议提交：`feat: add manifest-driven confirmatory campaign`

---

## 12. WP8 — 分析、论文与 artifact

### 先清理 claim 风险

1. `src/lib/analysis/causalEffect.ts` 改名或明确标注为 `exploratoryTrajectoryMatching`；输出不得默认使用 causal/ATE 文案。
2. `sensitivityTrace` 中 “independentReasoning/socialInfluence” 改为 “residualUpdate/observedDropoutSensitivity” 或标记 compatibility aliases。
3. `ReportGenerator` 中任何 “confirms hypothesis”“causal”“independent dimensions” 自动文案改成证据等级感知模板。
4. 旧 F decomposition 报告不得进入主论文；可作为历史 appendix/negative result。

### Analysis pipeline 必须 fail closed

- raw schema <4 不进入 confirmatory governance effect；
- replay mismatch 不进入；
- assignment/application linkage 断裂不进入；
- evaluation contract 不同不合并；
- missing value 不填 0；
- metric version 混合不合并；
- task/model/seed block 不完整时 paired estimand unavailable；
- 每个排除都输出 machine-readable reason。

### 论文贡献结构

1. **Problem**：interaction 相对 independent ensemble 的增益并不稳定，且错误会经通信放大。
2. **Formalization**：Swarm alpha、governance alpha、task/evidence/belief/treatment/outcome contract。
3. **System**：architecture-enforced belief ledger、versioned monitoring、atomic lifecycle、manifest randomization。
4. **Mechanism**：高置信低证据、同源 corroboration、exposure-associated cascades。
5. **Experiment**：cost-matched baselines、random governance、epistemic governance、failure strata。
6. **Results**：平均效应、成本 Pareto、异质性、负结果和失败边界。

### Claim matrix

为每条论文 claim 建表：

| Claim | Level | Estimand | Required artifact | Result | Allowed wording |
|---|---|---|---|---|---|
| explicit state improves calibration | C2 | paired arm contrast | run assignment + scoring | TBD | randomized protocol increased/decreased... |
| signal predicts false consensus | C1 | held-out prediction | calibration artifact | TBD | predicted, not caused |
| governance reduces error propagation | C2 | policy assignment contrast | manifest + outcomes | TBD | reduced under tested domains |
| verification mediates recovery | C3 | treatment–mediator–outcome | temporal mediation | TBD | exploratory unless assumptions hold |
| generalizes across domains | C4 | heterogeneity/replication | ≥2 task/model families | TBD | only if direction stable |

### Artifact 包

- clean commit/tag；
- dependency lock；
- task/source licensing notes；
- pre-run manifest；
- raw artifact checksums；
- verifier CLI；
- one-command mock smoke test；
- analysis-only reproduction path；
- provider-dependent full rerun instructions；
- known limitations与负结果。

### Gate G7/G8

- 论文每个数字可追溯到 manifest unit 和 metric contract。
- 所有图表由脚本生成，不手工改数值。
- abstract 不出现未达到证据等级的词。
- README 不把 v6 Research Candidate 提前写成完成态。

建议提交：

```text
refactor: quarantine exploratory causal claims
feat: add schema-gated confirmatory analysis
docs: assemble paper claim matrix and reproducibility artifact
```

---

## 13. 论文结果的分支计划

### 分支 A：实验利好

条件：

- explicit belief 相对 vanilla 改善 Brier/invalid rate；
- epistemic governance 相对 explicit belief 降低 false consensus/cascade；
- 相对 random governance 仍有优势；
- 至少两个模型或任务 family 方向一致；
- 成本 Pareto 可接受。

论文主张：架构强制的 belief/evidence audit 与 diagnosis-specific governance 在受测域减少错误传播。

### 分支 B：只改善校准，不改善 accuracy

这仍可能是好论文：说明 governance 改善 epistemic hygiene、abstention 和风险识别，但没有提高平均决策正确率。主张转向 selective prediction 和 reliability-cost tradeoff。

### 分支 C：显式 belief 有用，governance 无用或有害

论文主张：大部分收益来自 representation discipline，而不是复杂控制；未校准 intervention 可能增加成本或扰动正确群体。这是有价值的机制负结果，应删除无效治理而不是解释性补丁。

### 分支 D：interaction 本身不优于 independent ensemble

论文主张：多 agent discussion 的收益高度条件化；SwarmAlpha 提供了识别 negative alpha 的可审计基准。需要确保 cost-matched baseline 足够强，这一负结果反而可能最有影响力。

### 分支 E：结果跨模型不稳定

不要声称 universal governance。把模型族作为 effect moderator，分析 schema compliance、初始 calibration、信息共享率差异。论文定位为条件性理论与 evaluation framework。

### 分支 F：任务天花板或 pipeline 不稳定

停止 confirmatory；回到 pilot。不得把 smoke/debug 数据包装成主实验。

---

## 14. 优先级与砍项顺序

### 必须完成，不能砍

1. Task/truth firewall。
2. treatment assignment lifecycle。
3. independent ensemble + cost contract。
4. epistemic bridge。
5. schema/replay/manifest。
6. primary metric contracts。
7. pilot gate 与预注册。
8. 至少一组真正 randomized confirmatory comparison。

### 有余力再做

1. 第二 topology。
2. 更多模型。
3. learned stopping policy。
4. preference aggregation task。
5. open-ended synthesis。
6. richer evidence semantic clustering。

### 本论文明确不做

1. Web3 链、token economy、真实资产质押。
2. 通用长期 reputation marketplace。
3. mechanism-proof strategic equilibrium。
4. 物理热力学理论复活。
5. 自动生成“真实证据”。
6. 任意开放世界 autonomous agent claim。

---

## 15. 质量与风险看板

每次 Gate 必须更新：

| 风险 | 当前状态 | 触发条件 | 处理 |
|---|---|---|---|
| truth leakage | open until G1 | prompt path can access scoring task | block experiments |
| assignment ambiguity | open until G2 | no probability/unit/seed | no causal claim |
| budget mismatch | open until G3 | arm call budgets differ | no net alpha |
| belief schema invalid | open until G4 | invalid rate >5% | fix parser/protocol |
| detector uncalibrated | C0 | no held-out artifact | no default control |
| task ceiling | unknown | baseline >85% | replace/stratify task |
| provider drift | ongoing | model version unavailable | record date + replicate |
| raw schema drift | controlled | mixed version analysis | fail closed |
| pseudo-replication | ongoing | report/round used as n | block result |
| claim inflation | ongoing | wording exceeds C-level | revise paper |

---

## 16. Claude Code 自检清单

每次提交前逐项回答 yes/no：

1. 我是否只修改了本 WP 白名单？
2. 是否碰了用户已有 untracked 文件？
3. 是否改变了任何默认策略、公式、随机化单位或评分语义？若是，是否已停下审核？
4. 新数据字段是否有 schema/version/missingness？
5. 新随机过程是否显式 seed 且与执行顺序无关？
6. prompt path 是否可能读到 truth？
7. analysis 是否把 unavailable 当成 0？
8. 是否存在 round/report pseudo-replication？
9. 是否为失败和 legacy 数据提供 fail-closed 行为？
10. 是否补了 hand-calculated fixture？
11. 是否运行 targeted tests、full tests、tsc、build、diff check？
12. 是否记录 exact test counts 和 commit hash？

任一关键问题为 no，不得提交完成态。

---

## 17. Codex 重置后优先审核顺序

Codex 恢复高强度审查时，不需要重读全仓，按以下顺序读取：

1. 本 master plan 与 progress 文件；
2. 从 theory baseline 之后的 commit log；
3. 每个 WP 的 git diff/stat 与 Gate 报告；
4. `experiment-contracts`；
5. `experimentation` assignment lifecycle；
6. raw schema/replay verifier；
7. baseline/alpha metrics；
8. epistemic runtime bridge；
9. pilot/preregistration artifacts；
10. 最后才看论文和报告生成。

最需要 Codex 亲自验证的 Red 项：

- task/truth capability boundary 是否真实；
- assignment 是否在 outcome 之前且概率正确；
- estimand 与统计单位；
- explicit belief 与 legacy stance 是否再次混用；
- evidence lineage cap 是否只治理重复来源而非臆测真实性；
- random governance 是否真正成本/机会匹配；
- 任何 reputation/stake 是否意外进入主实验；
- 论文 claim 是否超过证据等级。

---

## 18. 最终完成定义

只有同时满足以下条件，才允许将项目从 **v6 Research Candidate** 改称 **SwarmAlpha v6**：

1. prompt task 与 scoring truth 在主路径物理隔离；
2. raw schema 4.0 能完整 replay treatment lifecycle；
3. independent ensemble、vanilla、random、diagnostic/epistemic governance 可在同一 manifest 配对；
4. cost-matched swarm alpha 和 governance alpha 可计算；
5. 显式 belief/evidence/exposure/supersession 与 finalizeRound 原子连接；
6. 至少一个主要治理效果来自真实随机分配；
7. calibration/test split 与 metric contract 在主实验前冻结；
8. 至少两个任务 family、两个模型族或诚实收缩后的相应 claim；
9. 所有主结果可由 raw hash + verifier + analysis commit 复现；
10. 负结果、适用边界和成本同时报告。

这条路线的核心不是让项目“功能更多”，而是让每一条论文结论都拥有明确的对象、干预、反事实、测量、版本和证据等级。做到这一点，SwarmAlpha 的下限是一个可信的研究基础设施，上限才可能是一篇真正有方法论贡献的 AAMAS 长文。
