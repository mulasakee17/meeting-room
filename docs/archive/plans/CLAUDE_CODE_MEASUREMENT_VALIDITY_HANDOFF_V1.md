# Claude Code 执行指南：Measurement Validity v1 事实审计与测试规格

日期：2026-08-12

任务性质：低风险、只读优先、不得定义核心语义

执行状态：COMPLETED；Claude 初稿已由 Codex 复核并修正，权威产出为
[`MEASUREMENT_VALIDITY_WIRING_GAP_AUDIT_2026-08-12.md`](MEASUREMENT_VALIDITY_WIRING_GAP_AUDIT_2026-08-12.md)
与 [`MEASUREMENT_VALIDITY_TEST_MATRIX_V1.md`](MEASUREMENT_VALIDITY_TEST_MATRIX_V1.md)。本指南保留为可复现任务包，不应重复执行。

权威协议：[`MEASUREMENT_VALIDITY_PROTOCOL_V1.md`](../architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md)

## 1. 任务目标

在不修改核心生产语义的前提下，完成两个可独立验收的工作包：

1. 现有 V6 carrier 对 Measurement Validity v1 的接线 gap audit；
2. 基于冻结协议撰写 deterministic/adversarial test matrix。

本任务不实现 production contract，不运行真实 LLM，不选择或修改 Gate 数值。

## 2. 最小阅读包

必须读取：

- `docs/REASONING_PROTOCOL.md`
- `docs/architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md`
- `src/lib/epistemic/types.ts`
- `src/lib/epistemic/contracts.ts`
- `src/lib/epistemic/scoring.ts`
- `src/lib/experimentation/finalElicitationAdapter.ts`
- `src/lib/experimentation/finalOutcome.ts`
- `src/lib/experimentation/operationalOutcome.ts`
- `experiments/campaign/v6/v6TaskManifest.ts`
- `experiments/campaign/v6/taskBank.ts`
- `experiments/campaign/v6/productionVerticalSlice.ts`
- `experiments/campaign/types.ts`
- `experiments/campaign/replayVerifier.ts`

只在遇到明确符号引用时继续追踪；不得泛读 docs 或全仓重新理解项目。

## 3. 白名单

允许新建：

- `docs/plans/MEASUREMENT_VALIDITY_WIRING_GAP_AUDIT_2026-08-12.md`
- `docs/plans/MEASUREMENT_VALIDITY_TEST_MATRIX_V1.md`

允许修改：无。

任何生产代码、既有测试、schema、配置、package.json 都是 red zone。

## 4. Work Package A：carrier gap audit

逐项回答，并给文件/符号/行号证据：

1. 现有 schema-5 raw artifact 是否唯一携带 runId、taskDefinitionHash、taskManifest hash、model/config identity、instrument prompt identity、final outcome hash？
2. 同一 base semantic task 的多个 variant 能否仅靠现有 artifact 建立权威配对？若不能，最小缺口是什么？
3. option permutation 的 canonical bijection 当前是否有 carrier？
4. evidence ladder 的 level、designated target、payload hash、signed likelihood ratio 当前是否有 carrier？
5. exact repeat 与 retry 能否在 artifact 中区分？
6. registered request denominator 和 terminal status 是否足以重建 valid/pair coverage？
7. final instrument 与 in-process explicit instrument 能否不混淆地定位？
8. task bank 当前 split 是否包含 measurement development；若没有，能否用既有 split 而不改变语义？
9. raw schema-5 不变、另建调用前 design/freeze 与调用后 result index 是否足以形成唯一 source binding？
10. 哪些字段必须在首次 provider call 前持久化？
11. 哪些自洽重算篡改仅靠内部 hash 无法识别？no-replace result index 能提供何种仓库内完整性、又不能提供何种外部真实性？
12. 是否存在 truth/private information 泄漏风险？

结论必须在以下四项中选择：

- `NO_SCHEMA_CHANGE_REQUIRED`
- `EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`
- `RAW_CARRIER_VERSION_BUMP_REQUIRED`
- `BLOCKED_BY_EXISTING_DEFECT`

可以同时选择第二项和第三项，但必须说明不可替代的理由。

## 5. Work Package B：test matrix

只写测试规格，不写测试代码。每项包括 fixture、单点篡改、预期、boundary、建议稳定 issue code、是否 red zone。

至少覆盖：

### B1 Design authority

- duplicate block/cell/variant identity；
- base task/variant manifest hash 漂移；
- model/config/prompt ref 漂移；
- condition assignment 晚于 provider call；
- exact retry 与新 replicate 混淆；
- unexpected field、NaN/Infinity、cycle、class instance、sparse array；
- no-replace store 与 read isolation。

### B2 Perturbation semantics

- paraphrase 改变 option/truth/private fact；
- option map 非双射、漏项、多项或映回后 claim 漂移；
- evidence level 不连续、重复或 target 不一致；
- natural task 被伪装成 known-strength fixture；
- information add/remove 被误标成 nuisance；
- model/protocol stratum 被误合并为 repeat。

### B3 Missingness

- 一个 request 多个 terminal record；
- registered request 无 terminal record；
- invalid/unavailable 被移出分母；
- retry 覆盖原失败；
- incomplete pair 进入 paired effect；
- stratum failure 被 overall average 掩盖。

### B4 Analysis replay

- JSD 未用 log2；
- categorical 未映回 canonical coordinates；
- tie 被 option order 打破；
- TV 少乘/多乘 0.5；
- evidence direction sign 反转；
- SNR 只存比值不存分子分母；
- baseline 使用 held-out label；
- report/Agent 被当独立 bootstrap unit；
- threshold 或 bootstrap seed 在 held-out 后变化；
- metric 篡改后自洽重算仍被 source replay 拒绝。

### B5 Gate state

- Q0/Q1/Q2/Q3 不得越级；
- insufficient cluster support 不得变 GO；
- 单项成功不得补偿另一项失败；
- explicit Q1 不得自动授权 detector/control；
- final Q2 不得声称 latent belief 或 governance effect。

## 6. Stop conditions

发现以下任一情况，建立最小书面证据后停止，不修复：

- 现有 final/raw artifact 无法唯一绑定 task/claim/resolution；
- resolution 或他 Agent private view 可进入 measurement provider request；
- terminal failure 会被内部 retry 擦除；
- schema-5 接受双重 outcome/measurement authority；
- production 路径会在 assignment/freeze 前调用 provider；
- 协议要求与实际 public API 结构性矛盾。

## 7. 验收

运行：

```powershell
git diff --check
npx.cmd tsc --noEmit
git status --short
```

不要求全量 vitest/build，因为本任务只能新增 Markdown。

## 8. 最终报告格式

1. 修改文件；
2. carrier Q1–Q12 结论；
3. 最终 stop/go 分类；
4. test matrix 项数与覆盖面；
5. red-zone 缺陷；
6. 与指南偏离；
7. 精确命令结果；
8. 明确声明：未修改生产代码、未运行真实/付费 LLM、未读取凭据、未执行 git 写操作。
