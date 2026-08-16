# Source-Disclosure Screen — 最小接线缺口审计

日期：2026-08-14
状态：**GO FOR MINIMAL WIRING AND ZERO-PROVIDER PLAN — 未写代码、未运行 provider**。
目标：只读判断“32–48 run forced_source_disclosure vs holdout 机制筛选”需要的最小接线，并给出最小拟议写白名单。

> **2026-08-14 Codex execution decision:** task audit 已冻结 10 tasks / 8 leakage groups / 40 runs；本审计未发现 core/schema 缺口，因此状态更新为 **GO FOR MINIMAL WIRING AND ZERO-PROVIDER PLAN**。这不授权 `--execute`、真实 provider、效果主张或扩大白名单。

---

## 1. FACT — 完整链逐项回答

### 1.1 task projection 从哪里生成

- `createHiddenBenchTaskProjectionV1({ sourceTaskId })`（`experiments/campaign/v6/hiddenBenchTaskAdapter.ts`，已导出）从 pinned `benchmark.json` 投影出 V6 task（`adapter.task`）。两臂共用同一 base task 投影。
- 无新 projection 层。

### 1.2 source-disclosure variant 在 provider 前何处调用

- 每个 run 在创建 discussion adapter / 任何 provider 调用**之前**调用 `createSourceDisclosureTaskVariantV1({ runId, blockId, task, arm, sourceSelectionSeed })`（`sourceDisclosureInterventionV1.ts`，已导出），得到 `{ task: variantTask, selection }`。
- `variantTask.publicContext` 在 D 臂追加 disclosure block、H 臂保持不变；随后把 `variantTask` 作为 `input.task` 传入 `runV6ProductionVerticalSlice`。variant 函数本身零 provider 调用（纯派生）。

### 1.3 H/D 如何绑定同一 sourceSelectionSeed/blockId

- source 选择键 = `sha256({ namespace, blockId, taskId, sourceSelectionSeed })`，**不含 arm、runId、模型输出、outcome**（`sourceSelectionKey` 已实现，测试已断言）。
- plan 为每个 `(taskId, blockId)` 冻结一个 `sourceSelectionSeed`；H 与 D 两个 run 共用同一三元组 → 同一潜在 source agent/private-hash/key。`selection.sourceAgentId` / `sourcePrivateInformationHash` / `sourceSelectionKeyHash` 在 H/D 间逐字节相同（测试已断言）。

### 1.4 task manifest 是否会承诺变更后的 publicContext

- 是。`computeV6TaskDefinitionHashV1(variantTask, taskAdapter)` 对 variant task（含变更后 publicContext）计算 hash；既有 `v6TaskManifest` 承诺 `taskDefinitionHash` 与 `publicContextHash`。D 臂的 hash 与 H 臂不同（publicContext 不同），均为已实现能力，无 schema 变更。

### 1.5 现有 vertical slice 是否可以直接执行两臂

- **基本是，但有一个实验侧 fixture 缺口。** `runV6ProductionVerticalSlice`（productionVerticalSlice.ts:1195，已导出）把 `task` / `governanceRule` / `interventionContracts` / `study` 作为输入。
- 设计要求 H/D 两臂在讨论期间**不触发任何治理动作**（不使用 eligibility/verdict）。当前 `HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2` 会在 certainty≥0.7 时产生 eligible event 并触发 verification 调用 → 必须替换为**实验侧 always-ineligible rule**（有 round-1 report 也永不 eligible），使 eligible event 数为 0，治理动作零调用。
- 该 rule 是 fixture 层定义（与 `v6ActionDiscoveryFixtureV1.ts` 的 always-eligible rule 对称），**不修改 productionVerticalSlice / schema / provider**。若用 `explicit_belief_v1`（B 协议）则天然无治理，但只有 1 轮讨论，不符合设计“两轮 discussion”→ 采用 `epistemic_governance_v1` + always-ineligible rule。

### 1.6 discussion/final provider call 数能否保持相同

- 能。D 只在 provider 前修改 publicContext 文本，不改变 protocol、agent count、round 数、prompt 结构。两臂每 run 均为 `agentCount × 3`（2 轮讨论 + 1 次 final elicitation）；always-ineligible → 无 verification call。D 的 input token 更多（更长 publicContext），但 **call 数相同**，且 D 不增加 provider call。token/cost 差异如实报告。

### 1.7 如何保证 verification/governance calls 为 0

- always-ineligible rule → 无 eligible event → 无 action lifecycle → 无 verification delivery。plan 的 `plannedProviderCalls` 应为 `agentCount × 3`；preflight 断言零 verification 调用。

### 1.8 final pooled Brier 从哪个权威 artifact 读取

- `operationalOutcome.primaryMetric.value`（`swarmalpha.estimand.operational-pooled-brier`），与 heldout 分析器一致。accuracy 从 `taskOutcome.quality`。resolution/outcome 仅在动作与 final elicitation 之后离线评分使用。

### 1.9 exact retry、partial state、no-replace 如何复用

- `preflightIncompleteRuns`（run_v6_smoke.ts:261）在 provider 前拒绝任何已存在 planned artifact（partial/fresh 状态 fail-closed）；
- `V6ProviderCallBudget`（run_v6_smoke.ts:151）+ `createMeteredSingleAttemptInvoker` 强制 calls/tokens 上限与单次调用、无 retry；
- plan/manifest no-replace（contentHash + canonical hash，`flag:"wx"`）与 heldout runner 同模式；
- exact retry 只重跑冻结 run（同一 taskId/blockId/arm/sourceSelectionSeed/primarySeed），不重抽 task、arm、source 或 seed。

### 1.10 outputDir、plan、runId 如何隔离旧实验

- 新实验身份（如 `swarmalpha.experiment.v6-source-disclosure-screen-v1`）；
- 新 outputDir：`experiments/campaign/pilot_output/v6-source-disclosure-screen-v1-2026xxxx/`；
- 新 plan JSON + manifest；runId 命名空间 `run:v6-source-disclosure-screen-v1:task-<N>:block-<b>:<H|D>`；
- 不读写任何 verdict/action/measurement 旧 artifact。

### 1.11 分析器可以复用哪些 loader/replay/bootstrap 函数

- `verifyRawRunData`（replay + `sealed_decision_replay_verified`）、`resolveV6AuditableRawRunPath`、`createV6HiddenBenchSmokeFixtureV1`（或 disclosure 专用 fixture 的 rule）；
- `taskClusterDifferenceBootstrap`（analyze_v6_verdict_task_heldout_replication）的 **task-cluster 单位约定**可复用；screen 主对比是 block 配对 `D−H`，需对该函数做**最小适配**（同 task 内多 block 的 paired 差，bootstrap 以 task/leakage cluster 为单位）。不发明新渐近 p-value；
- DEFER gate 条件（n、cluster 数、valid fraction、方向/区间）沿用 heldout gate 语义。

### 1.12 哪些现有 symbol 可以直接调用

- `createHiddenBenchTaskProjectionV1`、`createSourceDisclosureTaskVariantV1`、`runV6ProductionVerticalSlice`、`createV6Adapters`（providerAdapters.ts:313）、`createMeteredSingleAttemptInvoker`、`createDeepSeekSingleAttemptInvoker`、`V6ProviderCallBudget`、`preflightIncompleteRuns`、`resolveV6AuditableRawRunPath`、`verifyRawRunData`、`computeV6TaskDefinitionHashV1`、`primarySeedForProtocol`、`V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED`。
- 局部 helper（`deterministicV6Clock`、canonical hash）按既有 runner 惯例在 runner 内复制。

### 1.13 是否存在必须修改核心的缺口

- **否。** 不需要修改 `src/**`、schema、`productionVerticalSlice.ts` 或 provider adapter。唯一新对象是实验侧 always-ineligible rule（fixture 层，随 runner 内联）。与 action-discovery 先例一致。

---

## 2. FACT — 13 项不变量可达性

| # | 不变量 | 当前可达 | 依据 |
|---|---|---|---|
| 1 | H/D 每个 task/block 恰好各一 | 是 | plan 每 (task,block) 生成 H+D 两个 run |
| 2 | 同 block 潜在 source agent/hash/key 相同 | 是 | source key 不含 arm；测试已断言 |
| 3 | source selection 不含 arm/runId/模型输出/outcome | 是 | `sourceSelectionKey` 仅 {namespace,blockId,taskId,seed} |
| 4 | 两臂除 publicContext disclosure block 外任务字段相同 | 是 | variant 仅改 publicContext；测试“逐字段 byte-identical” |
| 5 | 模型/config/prompt/round/final elicitation/call ceiling 相同 | 是 | 同一 slice 调用、同一 adapters、always-ineligible 不改变流程 |
| 6 | D 不增加 provider call | 是 | variant 在 provider 前，纯文本追加 |
| 7 | ground truth 不进入 source selection/discussion/final-elicitation request | 是 | source key 不含 outcome；variant 不读 `task.outcome`；truth-blind 测试已断言 |
| 8 | plan 不保存 correct_answer/resolution outcome/final loss | 是（需新 plan 构建遵守） | plan 只序列化 runId/taskId/blockId/arm/seed/taskDefinitionHash，不序列化 task 对象（其含 outcome 字段）；沿用 heldout plan 的 hash-only 模式 |
| 9 | task/leakage group 是 bootstrap unit | 是 | task-cluster bootstrap 复用约定 |
| 10 | exact retry 不重抽 task/arm/source/seed | 是 | replay 用冻结 plan；无 re-draw |
| 11 | partial run 在 provider 前 fail-closed | 是 | `preflightIncompleteRuns` + no-replace |
| 12 | 不读写旧 verdict artifact | 是 | 新 identity/outputDir/runId |
| 13 | 不需要 schema 6 或新 governance runtime | 是 | 复用 schema-5 slice + fixture rule |

---

## 3. DESIGN INTENT — 最小拟议写白名单

目标：一个 runner、一个 analyzer、一个 test、一个 frozen plan，可选一个结果文档；不建 framework/store/registry/schema/adapter/通用抽象。

| 文件 | 内容 |
|---|---|
| `experiments/campaign/v6/run_v6_source_disclosure_screen.ts` | runner + plan builder + **内联 always-ineligible rule fixture** + CLI `--plan / --execute / --replay`；H/D 由 (task,block,arm) 派生；no-replace；预算；preflight |
| `experiments/campaign/v6/analyze_v6_source_disclosure_screen.ts` | 只读分析器；block-paired `D−H` 主对比；task-cluster bootstrap（对 `taskClusterDifferenceBootstrap` 最小适配）；DEFER gate；uptake/firewall/cost 表 |
| `test/v6-source-disclosure-screen.test.ts` | 确定性测试：H/D 配对来源一致、D 不改非 publicContext 字段、D 零额外调用、plan 无 outcome、partial fail-closed、预算、no-replace、DEFER gate |
| `experiments/campaign/v6/v6_source_disclosure_screen_v1.plan.json` | 冻结 plan（`--plan` 生成；不含 outcome） |
| （可选）`docs/experiments/V6_SOURCE_DISCLOSURE_SCREEN_RESULTS_2026-08-14.md` | 执行后事实报告 |
| `package.json` | **仅当确实需要命令时**；现有 `npx tsx <runner> --plan/--execute/--replay` 足够，预计不需要 |

**不新增**：schema、provider adapter、governance runtime、通用 registry、数据存储、新 action 身份（复用 `SOURCE_DISCLOSURE_INTERVENTION_V1`）。

---

## 4. INFERENCE / UNKNOWN

- **INFERENCE**：现有一切所需实验侧接线均已有实现；唯一“实验侧缺口”是 always-ineligible rule fixture（对称于 action-discovery 先例），不属于核心修改。
- **UNKNOWN**：disclosure 的 uptake 与方向（未执行，不得预测）；最终任务集（owner 语义审查后决定）。

## 5. STOP CONDITION

- 若语义审查后 fresh clusters < 8：**STOP**（见 task audit）。
- 若在接线中发现必须改 `src/**`/schema/`productionVerticalSlice.ts`/provider adapter 才能实现上述任一不变量：**STOP，返回最小 gap 与 Codex**。
- 未获 owner 批准前不执行 provider，不实现 runner/plan/analyzer。
