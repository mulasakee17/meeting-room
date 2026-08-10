# SwarmAlpha v6 Execution Progress

## 2026-08-10 v6 reference slice + smoke boundary (latest authoritative addendum)

- The dedicated `experiments/campaign/v6/productionVerticalSlice.ts` now
  completes one binary T/B/G path: pre-assignment analysis unit, Stage-1
  assignment/binding, discussion, B/G epistemic ledger, G eligible-event audit
  chain, private final elicitation, operational pooled Brier, schema-5 replay,
  and atomic no-replace publication. The legacy general campaign `Runner`
  remains schema 4 and is not silently treated as this path.
- `npm run smoke:v6` is an **engineering** dry-run by default. Seed targeting is
  only for T/B/G protocol coverage; generated runs are not confirmatory evidence.
  `--execute` explicitly uses a DeepSeek-only, one-fetch primitive with no retry,
  repair, or fallback. No paid request has been run during implementation.
- Verification compliance is architecture-observed from valid delivery, never
  model self-report. It does not imply intervention effectiveness.
- A Stage-2 sham no longer reuses the active verification prompt: its matched
  call sees no claim/message/task context, authored content is discarded, and
  only a fixed neutral no-new-evidence message is delivered.
- Provider-reported usage is authoritative across discussion, verification, and
  final elicitation. Final usage is committed in the collection and included in
  raw-run totals. Call/token budget failures are fatal and prevent completed
  artifact publication; printed token counts are planning estimates only.
- The remaining engineering boundary is no longer "make schema 5 executable."
  It is: run a tiny paid engineering smoke after review, inspect its artifacts,
  then generalize through versioned task adapters. External authenticity and
  confirmatory causal evidence remain unimplemented/unestablished.
- Final validation snapshot: focused smoke/provider slice 3 files / 27 passed;
  full suite 63 files / 1256 passed / 3 skipped; TypeScript, build, diff check, and default dry-run
  passed. No real or paid LLM request was issued.

## 2026-08-10 理论收口（authoritative addendum）

- 当前论文主线冻结为 **测量（Measurement）→ 交互（Interaction）→ 治理（Governance）**；治理效果为第三层增量贡献，不再是项目成败的唯一开关。
- 每个实验 episode 只预注册一个可解析的 binary/categorical primary claim；主终点为相同私密终局测量下的 pooled Brier loss。
- 主协议只保留 `T`（普通文本交互）、`B`（显式信念）和 `G`（认识治理）；`I`（独立集成）与成本匹配 sham 仅作诊断对照。
- 首篇论文只验证 `verification-request@2.0.0` 一种治理动作；Web3、信誉/质押、在线自适应阈值、group 随机化和多动作比较全部延期。
- F6/F7/F8 不再作为并行扩张包，合并为一条最薄生产纵切：一个 Runner、一个 schema-5 权威载体、一个 outcome chain。
- **Operational outcome kernel + schema-5 carrier/verifier 已完成，production Runner 未接入。** `swarmalpha.estimand.operational-pooled-brier@1.0.0` 由 Stage-1 `primaryEstimandRef` 冻结；`OperationalAnalysisUnitV1` 在 assignment 前承诺 primary claim 与 Agent roster；`OperationalOutcomeArtifactV1` 使用 uniform `π0` 覆盖全部注册 Agent，并绑定 analysis-unit、assignment-manifest 与 final-outcome hash。schema-5 现强制携带两者并交叉重放；当前 `FinalClaimOutcome.pooledProperLoss` 仍是 answered-only secondary。Runner 尚未构造或写出这些对象。
- `B-T` 只称 explicit-report protocol package effect；`G-B` 只称 governance-policy package effect。没有 cost/opportunity-matched `S` 时，不得声称选择性验证机制本身优于等资源动作。
- 下一工程优先级收窄为两项：单 task adapter，以及 T/B/G Runner 构造 analysis unit、执行 final elicitation 并原子写出 schema-5。其他功能继续冻结。
- 完整定义、主张上限、无效结果保底路径、复杂度停止规则和 V1–V4 闸门见 [`SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`](../theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md)。与旧计划冲突时，以该文为准。

## 2026-08-10 F5 Stage-1 execution + schema-5 single authority (authoritative addendum)

本节为 F5 当前状态的权威记录；只描述可验证的实现事实，不声称生产集成或实证成立。
权威描述见 `docs/architecture/PRIMARY_ARM_EXECUTION_V1.md` 与
`docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`。

- **Stage-1 执行 registry/binding：已完成（kernel）。**
  `primaryAssignmentExecution.ts` 提供 exact-ref 执行 registry
  （`PrimaryArmExecutionRegistryV1`：canonical design order、每 arm 恰好一次、
  payload/budget hash 校验、credential-like key 拒绝）与 pre-provider binding
  （`PrimaryArmExecutionBindingV1`：manifest/registry/arm 交叉绑定、
  self-rehash 后 payload 不符仍拒绝）。`primaryArmExecutionStore.ts` 提供本地
  原子 no-replace binding 发布与 retry 复用；`preparePrimaryAssignedRunV1`
  （`experiments/campaign/primaryAssignedRun.ts`）是生产 pre-provider 边界。
- **Retry 身份：已完成（kernel）。** 精确 retry 复用 assignment+binding，不调用
  clock/create 路径；masterSeed/stratum/registry/design 变化拒绝而非重抽；
  assignment 已存在时只重建 binding；损坏 JSON fail-closed 不覆盖。
- **Schema-5 单一权威：已完成（verifier）。** schema-5 replay 现要求
  `primaryAssignmentManifest` + `primaryArmExecutionRegistry` +
  `primaryArmExecution` 并交叉校验 run/study/audit-open/taskOutcome；schema-4
  治疗字段（`treatmentAssignment`/`assignmentManifest`/`applicationReceipts`/
  `proximalOutcomes`，含 null/空）一律
  `schema5_legacy_treatment_authority_present`。稳定 issue code：
  `missing_primary_assignment_manifest`、`missing_primary_arm_execution_registry`、
  `missing_primary_arm_execution_binding`、`malformed_primary_assignment_chain`、
  `primary_assignment_run_mismatch`、`primary_assignment_study_mismatch`、
  `primary_assignment_after_audit_open`、`task_outcome_primary_assignment_mismatch`。
  `AuditableRawRunDataV5` 编译期要求 Stage-1 对象 + finalOutcome + taskOutcome，
  并以 `?: never` 禁止 schema-4 治疗字段。
- **Final elicitation adapter 边界：已完成（kernel）。** `finalElicitationAdapter.ts`
  提供 truth-free per-agent provider 边界与 `FinalElicitationCollectionArtifactV1`
  自寻址 provenance artifact（modelRef/config 预提交顺序、禁 retry、
  credential 拒绝、provider error/malformed/unavailable/timeout → 每 agent 恰好
  一个 terminal record）。**collection 是可选/reserved carrier，不是 schema-5
  verifier 必需，直到 F8。**
- **诚实状态边界：** production Runner 仍发 schema 4，未调用
  `preparePrimaryAssignedRunV1`，未执行 assigned arm / final private
  elicitation，未发 schema 5，未发布 detached commitment。schema-5 **writer**
  与原子持久化未完成。本地 hash/no-replace 只证明内部一致性与 retry 身份，
  不证明外部真实性。
- **验证快照：** `npx tsc --noEmit` pass；F5 聚焦 6 files / 222 passed；
  full suite 58 files / 1178 passed / 3 skipped；`npm run build` pass；
  `git diff --check` pass（仅 line-ending warnings）。**没有运行真实或付费 LLM 实验。**

## 2026-08-10 F4 final private outcome — deterministic core + schema-5 carrier gate (authoritative addendum)

本节为 F4 确定性核心与 schema-5 carrier 门当前状态的权威记录；下方更早的
快照保留为历史记录，若与本节冲突，以本节为准。只描述可验证的实现事实，
不声称生产集成或实证成立。权威描述见
`docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`。

- **新增核心：** `src/lib/experimentation/finalOutcome.ts`，由
  `src/lib/experimentation/index.ts` 导出。
- **F4 deterministic/core：已完成。** `FinalElicitationContractV1` 冻结
  `post_discussion_pre_resolution` 时序、`isolated_per_agent` 隐私、无讨论
  回流、elicitation 关闭前禁止真值、显式 terminal 缺失、
  require-all-claims、equal-weight linear pool、abstain-on-tie。
  `FinalOutcomeSession` 每个 expected agent 恰好一个 terminal record
  （answered / abstained / invalid / unavailable）；缺失从不补零。状态顺序：
  discussion completed → terminal elicitation records → elicitation closed →
  authorized resolution → scoring completed。`scoringTask` 持于私有字段，仅在
  closure 后交给 resolver。prompt 只经注册 belief contract 接受 binary /
  categorical claim-relative 概率；记录 strict/fenced JSON parse 来源与
  运行时生成的 canonical ID。
- **replay：已完成。** `FinalOutcomeArtifactV1` 重放重算 individual proper
  losses、equal-weight pooled belief、pooled decision、pooled proper loss、
  coverage 与 status-separated exclusions。字段名为
  `pooledDecisionMatchesResolution`，刻意不叫 `correct`：只证明与记录的
  authorized resolution 一致，不证明外部 oracle 真值。
- **schema-5 投影与载体门：已完成。** `projectFinalOutcomeTaskRecord` 是唯一
  schema-5 标量投影（跨注册 claim 的 pooled-decision accuracy）；ties /
  unavailable 使之为 `unresolved`；`TaskOutcomeRecord` 携带
  `sourceFinalOutcomeRef`。`experiments/campaign/types.ts` 在
  `AuditableRawRunDataV5` 上把 `finalOutcome` 与 `taskOutcome` 设为必填；
  `replayVerifier.ts` 对 missing/malformed/run mismatch 与 task
  projection/source/evaluation mismatch 发出稳定 schema-5 issue code
  （`missing_final_outcome`、`malformed_final_outcome`、`final_outcome_run_mismatch`、
  `missing_task_outcome`、`malformed_task_outcome`、`task_outcome_final_source_mismatch`、
  `task_outcome_final_evaluation_mismatch`、`task_outcome_final_projection_mismatch`）。
- **诚实状态边界：** 生产 Runner 仍发 schema 4，不运行公共 final private
  elicitation，不发 schema 5；无 production 专属 elicitation adapter，无
  detached truth/manifest commitment。外部真值真实性仍是 F8。不得称生产
  G-O/G-V 已完成。
- **验证快照：** `npx tsc --noEmit` pass；focused suite 3 files / 137 passed；
  full suite 56 files / 1139 passed / 3 skipped；`npm run build` pass；
  `git diff --check` pass（仅 line-ending warnings）；**没有运行真实或付费 LLM 实验**。
- **下一步（高风险 Codex）：** F5 Stage-1 primary assignment 生产桥 +
  production-safe elicitation adapter 边界；F6/F7/F8 随后。

## 2026-08-10 F0-F3 measurement/threshold contracts (authoritative addendum)

本节为 F0–F3 当前状态的权威记录；下方更早的快照保留为历史记录，若与本节
冲突，以本节为准。只描述可验证的实现事实，不对校准或实证效果作任何声称。

- **新增文件（src/lib）：** `epistemic/quantityContracts.ts`、
  `epistemic/beliefGeometry.ts`、`epistemic/domainContracts.ts`、
  `epistemic/calibration.ts`、`governance/thresholdPolicy.ts`。
- **quantity registry / 语义准入：** `quantityContracts.ts` 提供 versioned
  quantity registry；量必须先声明 `quantityRef` 语义身份并在消费边界通过
  registry lookup，否则 fail-closed；裸数值不构成可消费的观测。
  `validateEpistemicRef` 只校验引用形状，是否已注册由 registry `get` 校验。
- **belief geometry：** `beliefGeometry.ts` 只覆盖 binary 对称 certainty 与
  categorical order-independent 两类 geometry；越出该范围的构念不提供
  order/聚合语义（不伪造方向性或顺序性）。这是 F1 的代码级 kernel，不构成
  任何构念效度或测量可靠性声称。
- **domain allowlist：** `domainContracts.ts` 只允许显式 allowlist 内的
  domain 进入契约；未登记 domain 一律拒绝。
- **calibration artifact：** `calibration.ts` 定义 `CalibrationArtifactV1`
  schema（含 `quantityRef`）与 `validateCalibrationArtifact` validator。这是
  F2 的 artifact schema/validator，**没有真实的 held-out calibration
  artifact**；只有 schema 与校验逻辑，未产生任何校准参数或校准有效性结论。
- **threshold policy：** `thresholdPolicy.ts` 定义 `ScalarThresholdPolicyV1`，
  **仅用于 eligibility**（deterministic 阈值判定），不用于 dosage/adaptive
  调参。confirmatory 阶段禁用在线 adaptive threshold/dosage。
- **诊断契约：** `GovernanceDiagnosisRecord` 新增 `quantityRef` 并删除原裸
  `threshold` 字段。versioned threshold policy 由 eligibility rule config
  持有和回放，不伪装成 diagnosis 自身属性。
- **v2 升级：** high-certainty diagnosis/rule、verification action 与 minimal
  policy 已升到 v2；`minReportedProbability` 改为
  `certaintyThresholdPolicy: ScalarThresholdPolicyV1`（见
  `epistemicEligibilityRules.ts`、`standardEpistemicActions.ts`）。

状态分层：

- **G-S / contract + kernel code gate：已关闭。** 上述契约与纯函数 kernel 已
  实现并通过 tsc/测试；这是代码级 gate，不是实证结论。
- **F2：只完成 artifact schema/validator。** `CalibrationArtifactV1` 有
  schema 与 validator，但没有真实 held-out artifact，没有校准有效性证据。
- **G-C：只完成测量/阈值前置。** quantity registry、geometry、domain
  allowlist、diagnosis quantityRef、threshold policy 已就位；production
  adapters 与 delivery 未完成，`epistemic_governance` 未接 production 运行时。
- **F4：下一步。** 先完成统一 final private elicitation、truth firewall 与
  resolution/scoring 时序；production observation adapters 和 delivery 分属
  后续 F6/F7，真实 held-out calibration artifact 在 F11 pilot 产生。

Verification snapshot after F0-F3:

- `npx tsc --noEmit`: pass
- focused F0-F3 suite: 9 files / 175 passed
- full suite: 55 files / 1125 passed / 3 skipped
- `npm run build`: pass
- `git diff --check`: pass

- **没有运行真实或付费 LLM 实验。** 校准未被声称有效，任何实证成立结论均
  不成立；以上数字只来自 deterministic 测试与静态检查。

## 2026-08-10 CC-5 Stage-1 primary assignment (authoritative addendum)

- **P0-E1 已完成（真实范围）**：Stage-1 Primary Assignment v1 内核已实现并验证
  —— `PrimaryAssignmentDesignV1` / `PrimaryAssignmentRecordV1` /
  `PrimaryAssignmentManifestV1` + `primaryAssignmentManifestStore.ts` +
  `GovernanceStudyContract.primaryAssignmentDesign` 绑定。详见
  `docs/architecture/PRIMARY_ASSIGNMENT_V1.md`。这覆盖 CC-4C 盘点中列出的
  Stage-1 相关缺口。
- **Claude read-only review 的 3 个 P3 已修复**（Codex 记录，以下为可验证
  实现事实）：(1) Stage-1 主分配未在 study contract 中绑定 arms/probability/
  designRef → 现由 `primaryAssignmentDesign` + study/design prereg 匹配关闭；
  (2) 无规范化 Stage-1 单位身份 → record 强制 `unitId === runId`、
  `unit === "run"`，`"group"` fail-closed；(3) Q2 重放语义表述过强 → 已改为
  legacy 机械重放 vs PrimaryAssignmentV1 全重放的准确分层。
- **P0-E2 未完成**：schema-5 verifier 未验证 Stage-1 assignment / manifest /
  task outcome；`AuditableRawRunDataV5.taskOutcome` 仍可选。
- **P0-E3 未完成**：production Runner 未接线本模块（仍用 legacy 单臂概率 1
  `TreatmentAssignment`）；无外部 commitment / artifact store；无 private
  final elicitation。接线点见 `PRIMARY_ASSIGNMENT_V1.md` §CC-5C。
- **RAW_SCHEMA_VERSION 仍为 "4.0"**；production Runner 不得发出 schema 5。
- **没有运行付费或真实 LLM 实验**。

Verification snapshot after CC-5A:

- `npx tsc --noEmit`: pass
- focused Stage-1 suite: 4 files / 144 passed
- full suite: 51 files / 1094 passed / 3 skipped
- `npm run build`: pass
- `git diff --check`: pass

## 2026-08-09 CC-4 normalized randomization, time causality, and builder (authoritative addendum)

Codex 修复（CC-3 审核后）并已验证：

- **run-level draw 固定**：`deriveGovernanceAssignmentSeed` 对 run-level 单位
  不再包含 `candidateSetHash`（`unitKind === "run"` 时用固定 "run-level"
  标识），同一 run / 同一 action family / 同一 design / 同一 arms 下，候选集
  变化不会导致换臂。eligible-event draw 仍绑定候选集哈希。
- **unitId 规范化**：`deriveGovernanceAssignmentUnitId` 从
  `runId + unitKind + eligibilityDecisionId` 派生，调用者不能自由选择 unitId
  重抽；audit validator 重新派生并拒绝不一致的 `unitId`（即使
  derivedSeed/randomDraw/assignedArm 已自洽重算）。
- **时间/因果约束**：audit trail 新增 audit window（createdAt…sealedAt）与
  逐记录 `requireNotBefore` 约束（observation ≥ source、diagnosis ≥
  observation、assignment ≥ eligibility decision、closing decision ≥
  assignment、action instance ≥ decision、transition ≥ instance，seal ≥ 全部
  记录），并对 round 顺序严格校验。
- **GovernanceAuditTrailBuilder**：进程内 append-only + 批次原子提交 + 失败
  回滚 + snapshot 隔离 + seal 后不可变。只提供进程内批次原子性，不提供磁盘
  原子性、外部真实性或防伪造。

CC-4A 对抗测试覆盖（`test/governance-audit-trail.test.ts`，+24）：unitId
规范化派生、unitId 篡改自洽重算后仍被拒绝、run-level draw 对候选集稳定 /
eligible-event draw 对候选集敏感、eligibility decision 变化绑定新单位身份、
actionRef/seedNamespace/概率向量/概率顺序变化改变 seed commitment、12 类时间
因果篡改逐一拒绝、builder 批次回滚/空批次/snapshot 隔离/二次 seal/未分配
eligible decision seal 拒绝/非 terminal action seal 拒绝/单批全链。

关键文档：`docs/architecture/GOVERNANCE_AUDIT_TRAIL_V1.md`（更新版 §2 随机化
单位规范化、§3 builder 语义、§5 structural replay 的"历史 append-only 顺序
无法仅凭 replay 证明"caveat、§10 外部 commitment 仍未实现）。

两级随机化事实盘点：`docs/plans/TWO_STAGE_RANDOMIZATION_GAP_AUDIT_2026-08-09.md`。

Verification snapshot after CC-4A:

- `npx tsc --noEmit`: pass
- focused schema-5 carrier + governance core: 2 files / 82 passed
- full suite: 50 files / 1038 passed / 3 skipped
- `npm run build`: pass
- `git diff --check`: pass

## 2026-08-09 schema-5 edge tests and documentation truth sync (authoritative addendum)

权威描述见 `docs/architecture/GOVERNANCE_AUDIT_TRAIL_V1.md`。本节只记录与
CC-3A 验收直接相关的事实。

- 权威治理链已实现并可验证：hashed source event → versioned observation →
  diagnosis → awaiting-assignment decision → preregistered event assignment →
  closing decision → parameterized action instance → delivery/compliance →
  completed / censored / failed / held_out。
- 四种 replay 状态互斥：`open_structural_replay_verified` /
  `sealed_structural_replay_verified` / `open_decision_replay_verified` /
  `sealed_decision_replay_verified`。confirmatory schema 5 未完成决策重放时
  fail-closed 为 `governance_decision_replay_required`，不得显示为
  decision-replay 成功。
- structural replay 只验证哈希、结构、引用、预注册概率表、deterministic
  draw、跨记录关系与生命周期；**不**重新计算 observation projection、
  diagnosis 或 eligibility rules。
- decision replay 用同版本 executable rules 从已记录 diagnosis 重新执行
  `GovernanceDecisionEngine.decide`；通过后仍不重新证明 diagnosis 构念效度。
- schema 5 仍是 reserved/validated carrier；production Runner 仍写
  `RAW_SCHEMA_VERSION = "4.0"`，未由任何生产路径发出 schema 5。
- 完全伪造但内部自洽的 artifact 仅靠 replay 无法识别，必须依赖外部
  manifest/hash/signature commitment。
- 没有运行付费 LLM pilot 或 confirmatory experiment。
- CC-3A 对抗性 carrier 测试覆盖：`governanceStudy: null` /
  `governanceAuditTrail: null` fail-closed、run/study 不一致、错误
  `artifactSchemaRef`、open trail 不作为成功 schema 5、rule registry
  缺失/额外/版本/config 不一致阻断 decision replay、exploratory 停在
  sealed structural 且不冒充 decision replay、概率向量自洽重算后仍按预注册
  design 拒绝、action instance 参数/成本/actionRef/targetIds 不一致、
  sealed trail 完整性（无 closing decision / 多 closing decisions / 无唯一
  action instance / 非 terminal）、future source event、censored 显式 terminal。

Verification snapshot after CC-3A:

- `npx tsc --noEmit`: pass
- focused schema-5 carrier suite: 2 files / 96 passed
- full suite: 50 files / 1013 passed / 3 skipped
- `npm run build`: pass
- `git diff --check`: pass

## 2026-08-09 schema-5 audit-core definition (authoritative addendum)

- CC-1/CC-2 review: accepted after one correction. Explicit
  `governanceStudy: null` now fails closed instead of being treated as an absent
  legacy declaration.
- `GovernancePolicyContract` now preregisters a versioned assignment design for
  every randomized action: unit, ordered probability vector, and seed namespace.
  A replayable draw is bound to this design and the exact eligible candidate-set
  hash, preventing self-consistent post-hoc probability rewriting.
- Added full `GovernanceEventAssignment` records with policy/action/design refs,
  eligible rule refs, source diagnoses, candidate hash, master/derived seed,
  random draw, and actual assignment probability.
- Added content-addressed `GovernanceSourceEvent` and descriptive
  `GovernanceObservationRecord`; diagnoses now name `sourceObservationIds`
  explicitly.
- Added `GovernanceAuditTrail`: study/policy/rule/action snapshots, source events,
  observations, diagnoses, assignments, decisions, parameterized action
  instances, and lifecycle transitions.
- Verification levels are explicit: open/sealed structural replay is distinct
  from open/sealed executable decision replay. Confirmatory schema 5 data fails
  closed with `governance_decision_replay_required` when version-matched rule
  implementations are unavailable.
- Added `censored` as a terminal action state for runs ending before a planned
  observation window closes.
- `RawSchemaVersion` recognizes reserved `5.0`, but the active Runner writer
  remains `RAW_SCHEMA_VERSION = "4.0"`. Production does not yet emit schema 5.

Remaining high-risk boundary:

- production source-event/observation/diagnosis adapters;
- production construction and atomic persistence of the schema 5 trail;
- eligible-event assignment manifest persistence before intervention delivery;
- final private elicitation, mediator extraction, resolution/scoring order;
- external artifact commitment and confirmatory rule-registry loading.

Next bounded Claude Code guide:
`docs/plans/CLAUDE_CODE_HANDOFF_SCHEMA5_EDGE_AND_SCOPE_2026-08-09.md`.

Verification snapshot after the schema-5 audit-core definition:

- `npx tsc --noEmit`: pass
- `npx vitest run`: 50 files / 994 passed / 3 skipped
- `npm run build`: pass

## 2026-08-09 high-difficulty governance-kernel closure (authoritative addendum)

- Added versioned diagnosis/control-evidence contracts that separate observation
  completeness, measurement reliability, construct validity, calibration, and
  permission to control. Descriptive signals are observe-only; experimental
  permission is bound to the exact preregistration; operational use requires a
  calibrated record.
- Added deterministic `GovernanceDecisionEngine` arbitration with rule-config
  snapshots, assignment gates, budget/conflict checks, opt-in action contracts,
  and apply/holdout/sham semantics.
- Added append-only `GovernanceActionLedger` with explicit proposed, eligible,
  assigned, queued, delivered, compliance, and completed states. Completion is
  not effectiveness.
- Added minimal epistemic actions and pure eligibility rules for verification,
  pre-exposure independent countercheck, and lineage-capped aggregation.
- Added strict evidence content identity plus append-only lineage, derivation,
  duplicate, contradiction, and scoped verification records.
- Added equal-weight and strictly lineage-capped pooling. The overlapping-lineage
  rule uses the tightest dependency constraint and abstains on exact ties.
- Fixed round-local epistemic atomicity: failed ledger commit no longer publishes
  staged report/claim/latest-report indexes.
- Added `GovernanceStudyContract` as a scientific-claim firewall: legacy
  governance cannot be marked confirmatory; confirmatory governance requires a
  matching preregistration, frozen randomized policy, auditable architecture,
  run/group primary assignment, and exploratory-only eligible-event estimands.

Verification snapshot:

- `npx tsc --noEmit`: pass
- focused kernel suite: 6 files / 40 passed
- final full suite: 49 files / 954 passed / 3 skipped
- final production build: pass
- `git diff --check`: required again after Claude Code completes the bounded
  campaign plumbing package

Status boundary:

- P0a/P0b definitions and standalone kernels: substantially closed.
- P0c atomic report commit and aggregation kernel: closed; production campaign
  bridge, uniform final elicitation, and resolution/scoring order remain open.
- P0d evidence/lineage kernel: substantially closed; production ingestion adapter
  and complete fixture matrix remain open.
- P0e assignment gate exists in the kernel; real event assignment and delivery
  integration remain open.
- No paid pilot or confirmatory experiment is authorized yet.
- Claude Code handoff: `docs/plans/CLAUDE_CODE_HANDOFF_GOVERNANCE_PLUMBING_2026-08-09.md`.

## 2026-08-09 地基与治理链复审（下一阶段权威 TODO）

详细审计与方案见：`docs/plans/SWARMALPHA_V6_FOUNDATION_GOVERNANCE_AUDIT_2026-08-09.md`。

### Owner 决策冻结（2026-08-09）

- **旧治理路径：** 主动隔离。保留 legacy replay/read compatibility，但不得进入 v6 confirmatory 默认控制路径。
- **论文范围：** 当前不提前锁死；先关闭 P0 工程与方法学 Gate，再根据剩余时间和 pilot 事实决定是否收缩到 verifiable distributed-information tasks。
- **第二任务族：** 原则接受 binary claim verification，但当前不阻塞 P0；进入 P1/P2 前再冻结 adapter、数据集与评价契约。
- **Schema/API：** 接受受控破坏性升级。新 schema fail-closed；旧 artifact 只读兼容，不伪装为完整新生命周期。
- **实验总预算：** 人民币 500 元。工程与 deterministic/mock 阶段不得消耗付费实验预算；任何付费阶段必须使用 manifest 预算上限和 stop rule。
- **Web3/reputation/stake：** 延期。只允许低工程量、默认关闭、无行为副作用的 future-facing type/interface；不得进入主实验、默认聚合或在线治理。

### 预算护栏

- **P0 deterministic/mock：** 0 元付费实验预算。
- **P1 smoke/pilot：** 最多 80 元；先验证 parser、eligibility、delivery、failure rate 和单次运行成本，不追求显著性。
- **P1 calibration/variance pilot：** 累计最多 170 元；只有 smoke Gate 通过才释放。
- **P2 confirmatory：** 最多 280 元；只有 schema、policy、task split、分析计划冻结后才释放。
- **应急复跑储备：** 至少保留 50 元，不因结果不显著而动用；仅用于 provider failure、损坏 artifact 或预注册允许的失败替换。
- 每个阶段按实际人民币成本记账；不得用 Claude/OpenAI 的名义价格估算 DeepSeek 成本，也不得以“模型便宜”为由跳过调用数、token、latency 和失败成本记录。

### 当前判定

- **已稳固：** truth firewall、claim-relative probability contract、report/exposure/supersession ledger、proper scoring primitive、`finalizeRound` 收口、versioned estimator、manifest/assignment/receipt/replay、baseline/alpha 骨架。
- **部分稳固：** epistemic runtime 已能记录显式报告与暴露，但尚未连接 production `epistemic_governance`、统一 resolution/settlement、完整 evidence-lineage graph 和 final private elicitation。
- **未稳固：** detector 构念效度、diagnosis→intervention 机制契约、queued/delivered/compliance 状态、动作仲裁、eligible-event 真实随机 holdout、机制特异 proximal outcome。
- **实验许可：** 允许 deterministic fixture、parser audit 和小规模机制 pilot；P0 Gate 关闭前禁止正式 confirmatory campaign。
- **范围结论：** 内核具备跨任务潜力，但实证仍主要覆盖 verifiable categorical/hidden-profile。普适性必须通过第二个 verifiable task family 与 adapter 复用证明，不能由 legacy utility/stance 指标外推。

### P0 — 正式实验前必须关闭

- [ ] **P0a 语义与控制许可：** 将心理化 detector 降为 descriptive risk signal；未校准信号默认只记录；拆分 observation completeness、measurement reliability、construct validity 和 calibration status；缺数据一律 fail-closed。
- [ ] **P0b 治理决策链：** 新增 `GovernanceDecisionRecord` 与 `InterventionContract`；连接 diagnosis→eligibility→assignment→policy decision→receipt；定义 arbitration/budget/conflict/contraindication。
- [ ] **P0b 状态机：** 将 proposed/eligible/assigned/queued/delivered/compliance/completed 分开；修复 campaign Runner 将 queued prompt intervention 写成 applied receipt 的语义。
- [ ] **P0c epistemic runtime：** 连接 production `epistemic_governance`；保证 round state 与 ledger 周边 map 原子提交；统一所有 arm 的 private final probability elicitation；discussion 结束后才允许 resolution/scoring。
- [ ] **P0c aggregation：** equal-weight linear pool、abstention、deterministic tie-break；confidence/reputation weighting 不得成为默认。
- [ ] **P0d evidence/lineage：** evidence identity、source lineage、derived/duplicate/verification record、ingestion hash validation、lineage-capped aggregation；counterargument 不得伪装成 verified evidence。
- [ ] **P0e treatment：** 在 production eligibility event 上创建 apply/holdout/sham assignment；记录真实概率、seed、unit、source diagnosis；统一基础发言顺序与 cost opportunity。

### P1 — 机制 pilot

- [ ] 只保留三个低歧义策略：`verification_request_v1`、`independent_countercheck_v1`、`lineage_capped_pool_v1`。
- [ ] 冻结三类 failure injection：high-confidence false report、false/conflicting evidence、same-lineage Sybil。
- [ ] 为每种动作定义自己的 proximal mediator；`meanConfidence`/`beliefSpread` 仅保留为描述性兼容指标。
- [ ] calibration split 产出不可变 threshold/artifact；confirmatory 阶段禁用在线 adaptive threshold/dosage。
- [ ] pilot 只估计解析率、eligibility rate、delivery rate、方差、预算和效应量，不按显著性调参。

### P2 — Confirmatory readiness

- [ ] run/group-level randomization 作为 primary；eligible-event effect 仅 secondary/exploratory，直到纵向干扰模型预注册。
- [ ] cost-matched/sham、固定轮数、统一 final elicitation、统一基础顺序。
- [ ] 至少两个 verifiable task families；否则主动收缩论文适用域。
- [ ] 预注册 primary outcomes、missingness、right-censoring、cluster inference、negative results 和 claim ceiling。

### 暂缓到 P3

- [ ] 长期 reputation、stake settlement、anti-gaming、Sybil/collusion 博弈。
- [ ] preference/open-ended adapters、学习型治理与停止策略。
- [ ] Web3/token/链上机制；目前只保留为 future work。

> 说明：下方 WP3 的 `903 passed` 是 `2aeba20` 提交时快照；顶部 G1–G3 closure addendum 的 `922 passed` 包含其后尚未提交的 closure 修改，不应把两者视为同一工作树测试数。

## 2026-08-09 G1-G3 Closure Addendum (authoritative)

> 本节是 G1-G3 当前状态的权威记录；下方按 WP 书写的旧快照保留为历史记录，若与本节冲突，以本节为准。

- **G1 / truth firewall：已关闭代码级 gate。** `runHiddenBenchProtocol` 只接收 truth-free `PromptTask` 并产出 transcript；`scoreHiddenBenchTranscript` 在协议执行完成后才接收 `scoringTask`。静态边界测试会阻止 `groundTruth`、`correctAnswer`、`isCorrect` 等评分信息重新进入协议执行体。
- **G2 / auditable assignment and lifecycle：已关闭代码级 gate。** assignment schema `2.0.0` 保存完整概率向量、确定性 draw、资格规则与来源诊断 ID；manifest 在首次模型/引擎调用前持久化并可在 retry/resume 时校验复用。schema `4.0` raw artifact 显式保存 assignment、manifest hash、稳定 intervention/event IDs、application receipts、预声明窗口、近端观测和 task outcome；replay verifier 对悬空引用、重复 ID、窗口错配、缺失近端结果及非法状态 fail-closed。
- **G3 / executable baseline block：已关闭 mock 代码级 gate。** 六臂 block runner 实际调用注入式 mock LLM，执行 independent / vanilla / random / diagnostic / epistemic / oracle 六臂；arm 执行函数只持有 truth-free prompt task，评分在执行记录生成后进行；manifest-first artifact sink、逐臂 raw artifact、预算违规 fail-closed、失败工件、成本与 paired alpha 均可执行。random 与 diagnostic 的 action opportunity 已匹配。
- **近端指标解释边界：** `meanConfidence` 与 `beliefSpread` 是预声明窗口末端的描述性观测，不是单臂因果效应；只有 eligible-event 随机分配与 matched held-out receipt 才支持因果估计。
- **最终 QA：** `npx tsc --noEmit` 通过；`npx vitest run` = 44 files / 922 passed / 3 skipped；`npm run build` 通过；`git diff --check` 通过。
- **尚未完成：** 这不是付费真实 LLM confirmatory campaign。`epistemic_governance` 的生产运行时桥接、真实 eligible-event holdout、预注册分析与正式实验仍属于 WP4+；不得把 mock gate 宣称为实证结论。

> 每个 WP 完成时按 masterplan §0.3 模板追加。未通过 Gate 不写 `complete`。
> 最近更新：2026-08-09（WP1–WP3 代码级 mock Gate 同步确认）

> **状态总结（2026-08-09）**：G1–G3 的**代码级 mock gate** 已关闭——WP1 truth firewall、WP2 auditable assignment/lifecycle、WP3 baseline ladder + alpha + 6-arm mock block 均已实现并验证。但这是**代码级 mock 验证，不是真实付费 LLM 的 confirmatory campaign**；且 WP4（epistemic bridge 的运行时集成）仍未接，epistemic_governance arm 无法真正运行。任何把这些 Gate 描述为已完成真实干预实验的说法都不成立。最终需在完整 test 套件 + `npm run build` 通过后做最终 QA（full-suite/build final QA），再谈 confirmatory campaign。

## WP3 — Baseline ladder、成本合同与 alpha
- status: complete
- commit: `2aeba20`（feat: add cost-matched baseline ladder and alpha metrics）
- files changed:
  - 新增 `src/lib/experimentation/baseline.ts`（8-arm ladder + BudgetContract + BlockOutcome + validate）
  - 新增 `src/lib/experimentation/alpha.ts`（computePairedAlpha：swarm/governance/specificity/oracle_gap/net_alpha，paired block fail-closed）
  - 新增 `src/lib/experimentation/manifest.ts`（RunAssignmentManifest：per-run 持久化、deepFreeze、sha256、atomic write）
  - 修改 `src/lib/experimentation/assignment.ts`（TreatmentArm 扩展为 8 个，与 baseline 统一）
  - 修改 `src/lib/experimentation/index.ts`（导出 baseline/alpha）
  - 修改 `src/lib/experiment-contracts/categorical.ts`（aggregateApplicableAccuracy：not_applicable 不平均为 0；kendallTauApplicable：完整顺序真值才可用）
  - 新增 `test/experimentation-alpha.test.ts`（含 Gate G3 mock 6-arm block）
- contract decisions:
  - alpha 全部为 block-level paired contrast（unit = task × model × replicateSeed）；round/report 不扩大 n
  - 配对 block 完整性 fail-closed：blockKey 不一致时所有 alpha null（不跨 block 计算）
  - net_alpha 成本敏感：指定 lambda 但实际 cost 缺失 → unavailable（不补 0）
  - not_applicable 不被平均为 0；Kendall tau 仅当 rank 是 1..N 排列（单选不伪造尾部排序）
  - 8-arm ladder：partial_individual / independent_ensemble / vanilla_interaction / random_governance / diagnostic_governance / epistemic_governance / full_information_oracle / cost_matched_strong_baseline
- tests: `npx tsc --noEmit` 0 错误；`npm test -- --run` = 44 files / 903 passed / 3 skipped；`npm run build` 通过；`git diff --check` 通过
- compatibility: alpha/budget 为独立纯模块，无运行时耦合；assignment arm 类型从 6 扩到 8（WP2 用法兼容）
- deviations from master plan:
  - arms 的运行时执行（independent_ensemble 互不可见、random_governance 随机动作）未接 Runner——Gate G3 用 mock 数据构造 6-arm block 演示 manifest/alpha/cost table；真实 arms 执行留 WP7（confirmatory campaign）
- unresolved risks:
  - `epistemic_governance` arm 依赖 WP4（epistemic bridge）才可真正运行
  - 成本匹配的"调用预算完全一致"需 Runner 层控制，WP7 落实
- reviewer gate requested: G3

## WP2 — Treatment assignment 与治理生命周期账本
- status: complete
- commit: `e979ab4`（feat: add auditable treatment assignment lifecycle）
- files changed:
  - 新增 `src/lib/experimentation/assignment.ts`（TreatmentAssignment + deriveUnitSeed counter-based + assignArm 确定性累计概率 + createRunAssignment）
  - 新增 `src/lib/experimentation/lifecycle.ts`（InterventionApplicationReceipt / ProximalOutcomeRecord / TaskOutcomeRecord / CostRecord + 状态互斥校验）
  - 新增 `src/lib/experimentation/index.ts`
  - 修改 `experiments/campaign/types.ts`（RawSchemaVersion 升 `4.0`；RawRunData 加 treatmentAssignment / applicationReceipts / taskOutcome）
  - 修改 `experiments/campaign/pipeline/Runner.ts`（两条写路径生成 pre-run assignment；interventions → application receipts；scoring → task outcome）
  - 修改 `experiments/campaign/replayVerifier.ts`（verifyGovernanceLifecycle：missing assignment / dangling id / duplicate id / window 越界 / outcome 关联）
  - 新增 `test/experimentation.test.ts`；修改 `test/governance-estimator-replay.test.ts`（schema 3.0→4.0 断言 + lifecycle 校验测试）
- contract decisions:
  - counter-based seed：`hash(masterSeed, unitId, policyVersion)`，无 Math.random，跨执行顺序可复现
  - 当前实验为固定条件 → eligible arm 由 governanceMode 决定、概率 1.0（诚实记录，不伪造随机）；两级随机化的 eligible-event holdout 数据结构已就绪，运行时触发留 WP3/WP4
  - `no_action` 由 run 级 assignment arm 表达；无干预 run 得空 receipts 数组，非缺失字段
  - schema 4.0：2.0/3.0 仍可读，但不得进入 confirmatory governance ATE（replay 校验按 schema 分流）
- tests: `npx tsc --noEmit` 0 错误；`npm test -- --run` = 43 files / 895 passed / 3 skipped；`npm run build` 通过；`git diff --check` 通过
- compatibility: schema 2.0/3.0 读取兼容（hasReplayableEstimatorSchema 含 4.0）；estimator 指纹不变；既有 raw 数据无 treatmentAssignment（非 4.0）不受 lifecycle 强制检查
- deviations from master plan:
  - `ProximalOutcomeRecord` 已建但运行时未生成——proximal 指标需 metric contracts（WP3/WP5）接入；Gate G2 的"观察到了什么"由现有 trajectories + receipt effectiveWindow 覆盖。
  - `test/governance-estimator-replay.test.ts` 的 schema 3.0 断言随 WP2 升 4.0 更新（直接相关测试适配）。
- unresolved risks:
  - eligible-event holdout 的运行时分配与 receipt 生成未接（留 WP3/WP4 治理集成）。
  - mixed policy version 检查：当前架构单 run 单 assignment，无法触发；留 WP7（多 run manifest）。
- reviewer gate requested: G2

## WP1 — TaskBundle 与 truth firewall
- status: complete
- commit: `35a4185`（feat: separate prompt tasks from scoring truth）
- files changed:
  - 新增 `src/lib/experiment-contracts/contracts.ts`（TaskSchema/InformationMap/PromptTask/GroundTruthEnvelope/EvaluationContract/ExperimentTaskBundle + validateTaskBundle/freezeTaskBundle/containsForbiddenTruthKey + 递归 truth 泄漏检查）
  - 新增 `src/lib/experiment-contracts/categorical.ts`（categorical ranking contract v1 + preference/open-ended not-implemented fail-closed）
  - 新增 `src/lib/experiment-contracts/index.ts`
  - 新增 `experiments/campaign/tasks/legacyAdapter.ts`（旧 TaskConfig → ExperimentTaskBundle 单向 adapter + validateLegacyTruthCompleteness loader 校验）
  - 修改 `experiments/campaign/pipeline/hiddenbenchProtocol.ts`（resolveCandidateOptions 只用 searchKeys；runHiddenBenchProtocol 接受 bundle，prompt 用 PromptTask、评分用 scoringTask）
  - 修改 `experiments/campaign/pipeline/Runner.ts`（runSingle/runHiddenBenchSingle 构造 bundle；createAgents/buildDiscussionTaskContent 用 PromptTask；scoring 用 scoringTask.groundTruth）
  - 新增 `test/experiment-contracts.test.ts`；修改 `test/hiddenbench-schema.test.ts`（适配 WP1 边界：truth 校验移至 loader）
- contract decisions:
  - prompt 侧与 scoring 侧物理分离：PromptTask 类型 + 运行时递归校验不含 correctAnswer/groundTruth/resolution/scoringKey
  - truth 完整性校验从 prompt resolver 移至 loader（`validateLegacyTruthCompleteness`）
  - categorical evaluation contract v1（`swarmalpha.categorical.ranking@1.0.0`）；preference/open-ended 仅接口 + fail-closed
- tests: `npx tsc --noEmit` 0 错误；`npm test -- --run` = 42 files / 879 passed / 3 skipped；`npm run build` 通过；`git diff --check` 通过
- compatibility: 主路径 prompt 行为不变（候选顺序/评分口径一致，legacy adapter 候选集合等价）；schema 3.0 未升
- deviations from master plan:
  - `test/hiddenbench-schema.test.ts` 的修改超出 WP1 字面白名单——它是直接相关的既有测试，WP1 边界（resolveCandidateOptions 不再校验 truth）使其断言失效，且 tsc 必须通过；语义已适配（truth 分叉改测 loader 层抛错）。
- unresolved risks:
  - `resolveCandidateOptions` 现在只接受 `{ searchKeys }`（不再校验 truth）；任何仍依赖旧 truth 校验的调用方需改到 loader 层。
- reviewer gate requested: G1

## WP0 — 冻结理论收口基线
- status: complete
- commit: `76be652`（feat: close v6 monitoring and theory contracts）、`23c025c`（docs: add v6 execution masterplan）
- files changed:
  - theory closure 31 文件（28 tracked + `src/lib/monitoring/contracts.ts`、`src/lib/monitoring/index.ts`、`test/monitoring-contracts.test.ts` 新增）
  - masterplan 1 文件（`docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md`）
- contract decisions:
  - `RAW_SCHEMA_VERSION === "3.0"`（schema 2.0 的 estimator replay 能力保留）
  - monitoring signal-set identity 隔离新 macro signals 与旧 `R/T/H/F`（后者为兼容别名）
  - native 主路径默认 `terminationPolicy: "fixed_rounds"`；旧 belief 路径仍默认 `"surface"`（历史）
  - 未校准的 legacy macro screening 改为显式 opt-in（`MeasurementLayer`）
- tests: `npx tsc --noEmit` 0 错误；`npm test -- --run` = 41 files / 868 passed / 3 skipped；`npm run build` 通过；`git diff --check` 通过
- compatibility: schema 2.0/3.0 读取兼容；theory closure 不改变 estimator v1 指纹与 replay 语义
- deviations from master plan: none
- unresolved risks: 无（theory closure 经 tsc/test/build 验证完整）
- reviewer gate requested: G0
