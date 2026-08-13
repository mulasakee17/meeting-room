# Measurement Validity v1 — V6 Carrier Wiring-Gap Audit

日期：2026-08-12
状态：Work Package A — 只读 carrier 事实审计（documentation-only）。**后续实现状态（2026-08-12 晚）：本审计结论 `EXPERIMENT_LEVEL_AUTHORITY_REQUIRED` 所要求的最小动作已实现并测试（见 §4 与 §5 状态注记；`measurementValidity.ts` / `measurementValidityAnalysis.ts` / 65 项确定性测试），实现状态为 IMPLEMENTED_BUT_NOT_CODEX_ACCEPTED。本审计结论本身未变。**
权威协议：[`MEASUREMENT_VALIDITY_PROTOCOL_V1.md`](../architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md)

## 0. 范围与方法

本审计只回答一个问题：**现有 schema-5 raw carrier（V6 production 路径）能否唯一绑定 Measurement Validity v1 的 measurement cell，若不能，最小缺口是什么。**

本文件不选择、不修改任何 Gate 阈值，不定义任何新 public contract，不修改任何生产代码、schema 或既有 artifact。所有结论均以 `file:line` 引用实际实现为证据。按 `docs/REASONING_PROTOCOL.md` 纪律，结论分 FACT（实现中可直接读到）、INFERENCE（由实现推得）、DESIGN INTENT（协议或计划的意图），不把推断写成事实，不把缺失标成存在。

阅读包：`docs/REASONING_PROTOCOL.md`、`docs/architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md`、`src/lib/epistemic/types.ts`、`src/lib/epistemic/contracts.ts`、`src/lib/epistemic/scoring.ts`、`src/lib/experimentation/finalElicitationAdapter.ts`、`src/lib/experimentation/finalOutcome.ts`、`src/lib/experimentation/operationalOutcome.ts`、`experiments/campaign/v6/v6TaskManifest.ts`、`experiments/campaign/v6/taskBank.ts`、`experiments/campaign/v6/productionVerticalSlice.ts`、`experiments/campaign/types.ts`、`experiments/campaign/replayVerifier.ts`。

## 1. Carrier 事实基线

以下每条均对应实际实现。

- **FACT** 通用 campaign `Runner` 的 `RAW_SCHEMA_VERSION` 仍为 `"4.0"`（`types.ts:175`）；独立 V6 production vertical slice 使用 `V6AuditableRawRunData = AuditableRawRunDataV5 & { v6TaskManifest, v6MonitoringDesign, v6InteractionTrace }`（`productionVerticalSlice.ts:242-246`），并实际写出 `rawSchemaVersion: "5.0"`（`:1799`）。两条路径不可混称。
- **FACT** 每个 run 的 task 被持久化为独立 `V6TaskManifestV1`（`experiments/campaign/v6/v6TaskManifest.ts:55-68`），含 `taskId`（:55）、`primaryClaim`（:60）、`groundTruthCommitment`（:63）与 `taskDefinitionHash`（:68）。
- **FACT** `taskDefinitionHash` 由 `computeV6TaskDefinitionHashV1`（`v6TaskManifest.ts:220`）计算，其输入包括 `taskId`（:226）、`taskFamilyRef`（:227）、`adapterRef`（:228）、`taskSchemaRef`（:229）、`publicContextHash`（:230）、`primaryClaim`（:231）、ordered agent private-information hashes（:233-236）、`resolutionContract`（:234）与 `groundTruthCommitment.valueHash`（:237）。因此 `primaryClaim.options` 的任何变化都会改变 `taskDefinitionHash`。
- **FACT** `loadOrCreateV6TaskManifestV1`（`v6TaskManifest.ts:469`）以 no-overwrite 原子 `fs.linkSync` 发布 manifest（:490），即 no-replace store 模式；`loadOrCreate` 先读已存在文件并校验 `contentHash` 后再决定是否新建（:469-490）。
- **FACT** final instrument 的 provider 边界是 single-attempt：`finalElicitationAdapter.ts:42` 的 `retryPolicy: "none"`，契约校验强制 `retryPolicy === "none"`（`finalElicitationAdapter.ts:229`）。discussion 阶段同样不重试（见 §6 stop-condition 检查）。
- **FACT** `modelRef`/`invocationConfig` 身份位于 `finalElicitationCollection.adapterContract.agentBindings`（`finalElicitationAdapter.ts:38`，校验 `finalElicitationAdapter.ts:212`）。prompt 身份由 `promptHash`（`finalElicitationAdapter.ts:87`，值为 `hashValue(prompt)`，:453）逐 record 携带。
- **FACT** `finalElicitationCollection` 与 `finalOutcome`、`operationalOutcome` 均为**内部自洽 contentHash 自寻址** artifact：`contentHash` 由自身 body 重算（`finalElicitationAdapter.ts:100,472`），校验即重放（:283-285）。同类 self-addressed 校验也存在于 `v6TaskManifest.ts`（manifest.contentHash 校验 :281-351）与 `taskBank.ts`（:249-252）。
- **FACT** production 顺序：`runV6ProductionVerticalSliceV1` 在**任何 provider call 之前**完成 task manifest 装载/创建（`productionVerticalSlice.ts:1148-1169`）、operational analysis unit 创建（:1175-1211）、primary assigned run 装配（:1216）。首次 provider call 是 discussion `respond`（:1325）。
- **FACT** resolution 持有：final-outcome session 将 scoring task 置于 JS 私有字段（`#scoringTask`，`src/lib/experimentation/finalOutcome.ts`），`truthAccess: "forbidden_until_elicitation_closed"`，`closeElicitation`（`productionVerticalSlice.ts:1705`）之前不允许 resolution 进入请求；discussion request 只携带自身 private information（`productionVerticalSlice.ts:1315`）。
- **FACT** 无 measurement-design / variant / condition 概念存在于任何既有 carrier。`types.ts`、`v6TaskManifest.ts`、`finalOutcome.ts`、`operationalOutcome.ts` 中均无 `baseSemanticTaskRef`、`variant`、`measurementCondition`、`canonicalMapping`、`evidenceLadder` 字段。

## 2. Q1–Q12 逐项结论

### Q1. schema-5 raw artifact 是否唯一携带 runId、taskDefinitionHash、taskManifest hash、model/config identity、instrument prompt identity、final outcome hash？

**FACT 部分通过，但不集中、且对 part 不是"唯一"外部绑定。**

- `runId`：**是**。`RawRunData.runId`（`types.ts:205`），且 replay verifier 校验 `finalOutcome.runId === container.runId`（`replayVerifier.ts:511,528`）。
- `taskDefinitionHash`：**是，但经 v6TaskManifest 间接携带**。raw artifact 携带 `v6TaskManifest` 副本（`productionVerticalSlice.ts:1819`），该副本内含 `taskDefinitionHash`（`v6TaskManifest.ts:68`）。`finalOutcome` artifact 本身只含 `taskId`，不含 `taskDefinitionHash`。
- `taskManifest hash`：**是，自洽**。raw artifact 内嵌的 manifest 的 `contentHash` 与独立持久化的 manifest 文件逐字节一致，`readCompletedArtifact` 会校验该一致性（`productionVerticalSlice.ts:1144`、`v6TaskManifest.ts:469-490`）。这是 no-replace store 携带的内部 self-address，非外部 commitment。
- `model/config identity`：**是，位于 collection/response 子 artifact**。`finalElicitationCollection.adapterContract.agentBindings[].modelRef|invocationConfig`（`finalElicitationAdapter.ts:38`）。
- `instrument prompt identity`：**是**。final instrument 由 `finalOutcome.contract.promptTemplateRef` 与 collection record 的 `promptHash`（`finalElicitationAdapter.ts:87,453`）标识；`validateCompletedArtifact` 会重放 promptHash（`productionVerticalSlice.ts:869`）。
- `final outcome hash`：**是，跨 artifact 派生绑定**。`operationalOutcome.sourceFinalOutcomeHash` 携带，且 replay verifier 在 `verifyOperationalOutcomeV5` 重算并核对它（`replayVerifier.ts:578,647`）。这仍是同一 artifact 集合内的绑定，不是外部承诺。

**INFERENCE**：这些身份**都能**由 schema-5 raw artifact 唯一携带，但它们分散在 v6TaskManifest / v6InteractionTrace / finalElicitationCollection / operationalOutcome 多个子 artifact 中，且除 task manifest 外均为自洽 contentHash 自寻址，缺少指向 measurement-design 的外部绑定（见 Q11）。

### Q2. 同一 base semantic task 的多个 variant 能否仅靠现有 artifact 建立权威配对？

**NO。** 现有载体中**没有** `baseSemanticTaskRef`，也没有 variant→base 映射。

- `taskDefinitionHash` 计算包含 `taskId`、`primaryClaim`（含 `options`）、`groundTruthCommitment`（`v6TaskManifest.ts:226-237`）。因此每个 variant 都有**不同**的 `taskId` 与 `taskDefinitionHash`，且二者不可互推。
- 唯一接近的聚类信号是 task-bank entry 的 `leakageGroupId`（`taskBank.ts:45`），注释明示"源自同一 scenario/template 的任务应共享该 cluster"。但：**(a)** `leakageGroupId` 只在 task-bank 中，不被携带进 run artifact / finalOutcome / operationalOutcome；**(b)** 它按协议是泄漏聚类单位，不等于 base-semantic-task 配对权威；**(c)** 它不携带 variant↔base 的双射，也不携带 variant 在 base 语义下的身份。

**最小缺口（INFERENCE/DESIGN INTENT）**：需要一个携带 `baseSemanticTaskRef` 与 variant→base 映射的 experiment-level 权威载体，且该映射引用既有 `taskDefinitionHash`（而非重定义 task 语义）。这正是协议 §4.1 的 `baseSemanticTaskRef` 域与 §10.3 的 design/freeze artifact 所要求的。

### Q3. option permutation 的 canonical bijection 当前是否有 carrier？

**NO。** 现有载体中**没有**任何冻结的 option→canonical 双射。

- canonical option order 只存在于 claim 内部：`CategoricalEpistemicClaim.options`（`src/lib/epistemic/types.ts`）与 `CategoricalBeliefValue` 以 canonical options 为键；`categoricalContract.validateValue` 要求概率向量精确对齐该 option 集（`contracts.ts:105-125`），`normalizeValue` 按 canonical 顺序重映射（`contracts.ts:126-137`），`distance` 为 0.5·L1（`contracts.ts`）。
- 但 variant 的 option 展示顺序与 base canonical order 之间的**双射**没有在任何 artifact 中冻结。由于 `taskDefinitionHash` 包含 `primaryClaim.options`（`v6TaskManifest.ts:231`），仅 permutation 就会产生不同的 `taskDefinitionHash`，且**没有**字段把它映射回 base claim。
- **INFERENCE**：从现有 artifact 无法判断一个 `taskDefinitionHash` 是否为另一 base task 的 option-permutation variant，也无法执行协议 §4.3 要求的"先按冻结双射映回 canonical 再算任意距离/argmax/proper loss"。`normalizeValue` 只能把概率重排到**该 claim 自己的** canonical 顺序，不能跨 variant 反演。

### Q4. evidence ladder 的 level、designated target、payload hash、signed likelihood ratio 当前是否有 carrier？

**NO。** 现有载体中**没有任何** evidence-strength fixture 概念。`evidence_strength`（协议 §5.4）要求每级绑定 designated target outcome、evidence payload hash、ordinal level 与（可得时）signed log-likelihood ratio；`controlled-evidence fixtures`（协议 §2）在现有 task-bank / v6TaskManifest / production 中不存在。无 carrier。

### Q5. exact repeat 与 retry 能否在 artifact 中区分？

**部分。** 重试在结构上被禁止：`retryPolicy: "none"`（`finalElicitationAdapter.ts:42,229`），discussion/final 均为 single-attempt，terminal failure 会以 terminal record 持久化而非重试。因此"重试擦除失败"这一污染路径不存在（见 §6）。

但**区分 exact_repeat 与"新 replicate"** 无法仅靠现有 artifact：没有 `measurementCondition` 字段标记某请求是某 block 的 exact_repeat replicate。两个独立 run 的相同请求在 artifact 中无法判定它们是 same-cell replicate 还是不同 cell。**INFERENCE**：需要 design/freeze artifact 中的 `replicateIndex` 与 `measurementCondition` 登记（协议 §4.1）。

### Q6. registered request denominator 和 terminal status 是否足以重建 valid/pair coverage？

**分母不可重建；terminal status 足以计 missingness。**

- terminal status 可解析：`finalOutcome` 要求每个 expected agent 恰好一个 terminal record（`finalOutcome.ts:916-919`），`expectedAgentIds` 即注册分母的充分记录；`invalid_response`/`provider_error`/`timeout`/`unavailable` 分别计数（协议 §6.1）。
- 但 **registered measurement requests**（协议 §6.1 分母是 preregistered requests 而非成功解析报告）**没有**预注册载体：没有 measurement-condition 登记，无法从 run 反推"本应请求多少个 cell/replicate"。`expectedAgentIds` 只覆盖 single-run final 采集，不覆盖跨 run 的 block/pair/condition 预注册。
- **INFERENCE**：`terminal_coverage` 可算，`valid_coverage` 可算（分母用 expectedAgentIds），但 `pair_coverage`（协议 §6.1）需要"registered pairs/blocks"计数，而该计数当前无 carrier（见 Q2）。因此 **valid coverage 可重建，pair coverage 不可**。

### Q7. final instrument 与 in-process explicit instrument 能否不混淆地定位？

**能，物理上已分离，但缺少 instrument-kind 标签。**

- final instrument = `finalOutcome`（`finalElicitationCollection` + `finalOutcome` artifact 链）。
- in-process explicit instrument = v6 discussion 中的 belief report（`v6InteractionTrace` discussionCalls 的 belief report，经 `epistemic_governance_v1` 显式报告）。
- 两者位于不同 artifact、不同请求、不同 provider 调用，不会混淆成同一报告。
- **缺口**：协议 §1 要求设计层面区分 instrument kind；现有载体没有 `instrumentKind` 字段，无法在设计/freeze 层面断言某报告属 final 或 in-process。protocol §4.1 权威单位含 `instrumentKind`，当前无 carrier。

### Q8. task bank 当前 split 是否包含 measurement development；若没有，能否用既有 split 而不改变语义？

**没有 measurement-development split，且不能直接借用既有 split 而不改变语义。**

- 现有 split：`engineering_canary | threshold_calibration | held_out_detector | confirmatory`（`taskBank.ts:22-26`）；purpose：`engineering_only | calibration_candidate | confirmatory_candidate`（`taskBank.ts:17-20`）。
- `engineering_canary` 是唯一允许 `not_reviewed` 的 split（`taskBank.ts:185-189`），且 `engineering_only` purpose 强制全部 entry 为 `engineering_canary`、不得授予科学 authority（`taskBank.ts:233-236`）。scientific split 要求 `accepted` semantic review（`taskBank.ts:299`）。
- **DESIGN DECISION（Codex 复核后冻结）**：不修改现有 task-bank split 语义，也不借用 `engineering_canary`/detector/confirmatory 名称。`MeasurementValidityDesignV1` 单独授权 `measurement_development` 与 `sealed_measurement_heldout` 角色，只接受已有 accepted semantic review 的 source task，并禁止同一 leakage group 跨 measurement role 或进入 detector-held-out/confirmatory。**该规则已于 2026-08-12 晚实现并测试**：`validateMeasurementLeakageGroupIsolationV1`（`measurementValidity.ts`）强制跨 role 泄漏组隔离；`test/measurement-validity.test.ts` 的 `isolates measurement roles from task-bank splits and from each other` 用例覆盖（FACT，65 项确定性测试全通过）。

### Q9. raw schema-5 不变、另建 experiment-level design/freeze artifact 是否足以形成唯一 source binding？

**是，采用两阶段 experiment-level authority 即可，不需要 raw schema bump。** 这是本审计的核心结论。

- **FACT** V6 schema-5 production artifact 已在 run 内部唯一绑定 task/claim/resolution：`V6AuditableRawRunData` 额外强制 v6TaskManifest（含 `taskDefinitionHash` 与 ground-truth commitment），并携带 finalOutcome；`verifyFinalOutcomeV5` 核对 `runId`（`replayVerifier.ts:511,528`），`verifyOperationalOutcomeV5` 核对 `sourceFinalOutcomeHash`（`replayVerifier.ts:578,647`）。此结论不外推到任意通用 `AuditableRawRunDataV5` 生产者。
- **DESIGN DECISION**：调用前 `MeasurementValidityFreezeV1` 冻结 base-task ref、variant→base 映射、option 双射、evidence ladders、condition 分配与 registered blocks/replicates；调用后 `MeasurementValidityResultIndexV1` 才能绑定每个已发生 cell 的 runId/raw-artifact-hash/final-outcome-or-trace-hash。Freeze 不能承诺尚未产生的输出 hash。
- **INFERENCE**：这两个 artifact 的 cell 集精确闭合时，可以把分散的 schema-5 子 artifact 汇聚成唯一 measurement cell source binding，无需改动 schema-5 的 `never` 结构或字段集。
- 因此结论为 **`EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`**，且**不需要 `RAW_CARRIER_VERSION_BUMP_REQUIRED`**：schema-5 已满足 run 内唯一绑定；缺失的 base-task/variant/双射/ladder/condition 是 **measurement design 语义**，不是 raw-run carrier 事实，塞进 raw schema-5 既不必要也不充分（详见 §4）。

### Q10. 哪些字段必须在首次 provider call 前持久化？

现有 production 已证明该顺序模式存在：task manifest、operational analysis unit、primary assigned run 均在首次 provider call 前持久化（`productionVerticalSlice.ts:1148-1216 < 1325`）。测量上下文要求额外在 provider call 前持久化（DESIGN INTENT，依据协议 §8.1 / §3.2）：

- `measurementDesignRef` / design hash；
- `baseSemanticTaskRef` 与 variant→base 映射；
- `modelRef` / `invocationConfigHash` / prompt ref / task-family / agent·view identity；
- measurement-condition 分配与 registered blocks / conditions / replicates；
- canonical option 双射与 evidence ladders；
- baseline selection 规则（若该 run 是 baseline 相关 cell）。

**FACT 交叉核对**：v6 discussion 的 model/config 由 `v6InteractionTrace` 的 adapterContract.agentBindings 提供，且 trace 在首次 discussion provider call（:1325）前已构造好 contract（:1256-1271），故 model/config 事实上先于请求存在。缺口仅在 measurement-condition 与 design/freeze 载体。

### Q11. 哪些自洽重算篡改仅靠内部 hash 无法识别，需要 no-replace store 或外部 commitment？

**FACT**：`finalElicitationCollection`（`finalElicitationAdapter.ts:100,283-285`）、`finalOutcome`、`operationalOutcome`、`v6TaskManifest`（`v6TaskManifest.ts:281-351`）、task-bank（`taskBank.ts:249-252`）全部是**自洽 contentHash**。task manifest 的 `fs.linkSync`（`v6TaskManifest.ts:490`）与 raw run artifact 的 `fs.linkSync` 发布（`productionVerticalSlice.ts:984`）提供仓库内 no-replace 路径语义，不是外部存储或外部承诺。

**INFERENCE**：`fs.linkSync` 的 no-overwrite 只防止**覆盖已提交路径**，不防止**生成全新的自洽文件**。因此，单凭 raw artifact 内部 self-address，无法识别对 finalOutcome / operationalOutcome / collection 的整链自洽重写。调用前 Freeze 只能固定设计和注册分母；调用后 Result index 才能记录每个 cell 的 runId/raw/final hash，并以 no-replace 方式封存。它能检测封存后的仓库内重写，但仍不能证明封存时间、签署者身份或真实世界真实性；这些需要尚未实现的外部 commitment。

### Q12. 是否存在 truth/private information 泄漏风险？

**未发现（FACT）。**

- discussion request 仅携带 `ownPrivateInformation` 与公开上下文（`productionVerticalSlice.ts:1315`），无 resolution、无他 Agent private view。
- verification request 携带的是目标 agent 自身的公开 round-2 message、claim、publicContext 与 actionRef（`productionVerticalSlice.ts:1570-1583`），无 resolution、无他 Agent private info。
- final elicitation view = 自身 private info + transcript；scoring task 存于 JS 私有字段 `#scoringTask`，`truthAccess: "forbidden_until_elicitation_closed"`，resolution 仅 `closeElicitation`（:1705）后可用。
- **INFERENCE**：在现有生产路径下，resolution 与同 block 他 variant 的回答不会进入 provider request。协议 §3.2 的防污染要求（独立请求、不展示同 block 他 variant、不展示前次回答、resolution 关闭前不入请求）在实现层面成立。

## 3. Stop-condition 检查（指南 §6）

逐条核对，**均未触发**，故不停止、不修复：

| Stop condition | 判定 | 证据 |
|---|---|---|
| final/raw artifact 无法唯一绑定 task/claim/resolution | **否** | run 内由 manifest `taskDefinitionHash` + finalOutcome `claims/resolutions/expectedAgentIds` + `sourceFinalOutcomeHash` 唯一绑定（`v6TaskManifest.ts:68`、`replayVerifier.ts:511,528,578,647`）。variant→base 缺口是 **authority 缺口**，不是 unique-binding 不可能。 |
| resolution 或他 Agent private view 可进入 measurement provider request | **否** | 见 Q12。 |
| terminal failure 会被内部 retry 擦除 | **否** | `retryPolicy: "none"`（`finalElicitationAdapter.ts:42,229`），single-attempt，terminal 状态持久化。 |
| schema-5 接受双重 outcome/measurement authority | **否** | schema-5 只有 `operationalOutcome` primary + `taskOutcome` secondary（`types.ts:425`），无 measurement authority 字段；design/freeze 是 experiment-level 外部权威，不与 raw 冲突。 |
| production 在 assignment/freeze 前调用 provider | **否** | 首次 provider call（:1325）晚于 manifest/analysis-unit/assignment（:1148-1216）。 |
| 协议要求与实际 public API 结构性矛盾 | **否** | 协议 §10.3 明确把 design/freeze 委托给 experiment-level artifact，未要求 schema-5 改变；未发现结构性矛盾。 |

## 4. 结论

**`EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`。**

- 不选择 `NO_SCHEMA_CHANGE_REQUIRED`：Q2/Q3/Q4 的 variant 配对、canonical 双射、evidence ladder 当前**根本没有 carrier**，不能宣称"无需任何动作"。
- 不选择 `RAW_CARRIER_VERSION_BUMP_REQUIRED`：schema-5 已满足 run 内 task/claim/resolution 唯一绑定；缺失字段是 measurement **design 语义**（variant 映射、双射、ladder、condition 分配），协议 §10.3 明确它们属于 experiment-level design/freeze，而 bump 也会落入"未实现 MeasurementValidityDesignV1"的同一样板。故 bump 既不必要，也不足以替代 design/freeze。
- 不选择 `BLOCKED_BY_EXISTING_DEFECT`：未发现任何阻止唯一 source binding 的既有缺陷；仅发现 authority 缺口。

**所需最小动作（DESIGN INTENT，交付 Codex，本审计不实现）**：实现调用前的 `MeasurementValidityDesignV1` + `MeasurementValidityFreezeV1`，以及调用后的 `MeasurementValidityResultIndexV1`。Freeze 以 no-replace store 固定 base-task↔variant 映射、canonical option 双射、evidence ladders、condition 分配与 registered blocks/replicates；Result index 在所有 cell terminal 后固定 runId/raw/final-or-trace hashes。measurement role 由 design 单独授权，不复用现有 task-bank split 名称。raw schema-5 不改。

**后续实现状态（2026-08-12 晚，FACT）**：上述最小动作已实现为 `experiments/campaign/measurement/measurementValidity.ts`（Design/Freeze/ResultIndex + validators + no-replace store + source cross-replay）、`measurementValidityAnalysis.ts`（确定性分析内核 + Gate）与 `test/measurement-validity.test.ts`（65 项确定性测试全通过；状态 IMPLEMENTED_BUT_NOT_CODEX_ACCEPTED）。仍**未**将 design/freeze/result-index 写入 V6 production vertical slice 的实际调用前/调用后接线——那是后续 wiring 工作，本审计与 v1 实现均未触碰 raw schema-5。

## 5. 缺口清单（minimal gap list）

1. **variant 配对载体缺失**（Q2）——需 design/freeze 中的 baseSemanticTaskRef + variant→base 映射引用既有 hash。
2. **canonical option 双射缺失**（Q3）——需冻结的 option→canonical bijection，反演后才可算 JSD/TV/argmax。
3. **evidence ladder 缺失**（Q4）——需 level / designated target / payload hash / signed likelihood ratio 载体。
4. **measurement-condition 与 replicate 登记缺失**（Q5/Q6）——需 condition + replicateIndex + registered requests/pairs，否则 pair_coverage 不可重建。
5. **instrument kind 标签缺失**（Q7）——需 design 层面区分 final 与 in-process explicit instrument。
6. **measurement role 缺失**（Q8）——由 design 单独授权 development/held-out，不能借用既有 split。
7. **结果封存与外部 commitment 均缺失**（Q11）——Result index 解决仓库内跨 artifact 封存；外部真实性仍不解决。
8. **首次 provider call 前的 design/freeze 持久化**（Q10）——需在 held-out provider call 前持久化上述 design 字段。**状态（2026-08-12 晚）**：`MeasurementValidityDesignV1/FreezeV1/ResultIndexV1` 及其 no-replace store（`loadOrCreate*`、按 ref id+version+contentHash 寻址）已实现并测试，可作为该持久化载体；但**尚未接线**进 V6 production vertical slice 的实际调用前/调用后流程。

以上全部为 experiment-level authority artifact 的范围，raw schema-5 保持 `"5.0"` 不变。
