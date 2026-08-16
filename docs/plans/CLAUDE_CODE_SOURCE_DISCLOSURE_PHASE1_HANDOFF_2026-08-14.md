# Claude Code 执行指南：Source Disclosure Phase 1 最小接线

状态：**AUTHORIZED FOR WHITELIST IMPLEMENTATION AND ZERO-PROVIDER PLAN ONLY**  
日期：2026-08-14

将本文件正文原样交给 Claude Code。此任务只实现已经冻结的 40-run 机制筛选接线，不运行真实 provider，不改变研究定义。

---

你在 `C:\Users\贺孟元\Desktop\swarmalpha` 工作。

## 1. 权威上下文

先完整阅读：

1. `docs/REASONING_PROTOCOL.md`
2. `docs/plans/SWARMALPHA_INTEGRATED_RESEARCH_EXECUTION_GUIDE_2026-08-14.md`
3. `docs/plans/SOURCE_DISCLOSURE_SCREEN_TASK_AUDIT_2026-08-14.md`
4. `docs/plans/SOURCE_DISCLOSURE_SCREEN_WIRING_GAP_AUDIT_2026-08-14.md`
5. `experiments/campaign/v6/sourceDisclosureInterventionV1.ts`
6. `test/source-disclosure-intervention.test.ts`

只读参考、不得修改：

- `experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts`
- `experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication.ts`
- `experiments/campaign/v6/run_v6_smoke.ts`
- `experiments/campaign/v6/v6ActionDiscoveryFixtureV1.ts`
- `experiments/campaign/v6/hiddenBenchTaskAdapter.ts`
- `experiments/campaign/v6/productionVerticalSlice.ts`
- `experiments/campaign/v6/providerAdapters.ts`

不要机械执行 2026-08-13 的旧 96-run source-disclosure handoff。

## 2. 冻结设计，不得更改

### 任务与语义簇

任务按下列顺序冻结：

```text
13, 18, 28, 33, 38, 39, 45, 47, 50, 55
```

leakage groups：

```text
investigation: 13,47
urgent-transfer: 33,55
expedition-basecamp: 18
rescue-route: 28
relief-clinic: 38
aircraft-landing: 39
post-earthquake-lab: 45
secure-meeting-room: 50
```

### 实验单位

- 10 tasks × 2 paired blocks × 2 arms = **40 planned runs**；
- arms 只能是 `holdout` 与 `forced_source_disclosure`；
- 每个 `(taskId, blockId)` 恰好 H/D 各一；
- 同 block H/D 共享 `sourceSelectionSeed` 和潜在 source identity/hash；
- arm 执行顺序由冻结 master seed 确定性置换；
- source selection 不含 arm、runId、模型输出、truth 或 outcome；
- protocol 使用既有两轮 discussion + final private elicitation；
- 使用实验侧 always-ineligible governance rule，verification/governance provider calls 必须为 0；
- D 只改变 publicContext disclosure block，不增加 provider call；
- 单次调用、无 retry；terminal failure 不补跑、不换 task/seed/source。

### 研究边界

这是 non-confirmatory mechanism screen，不是正式治理效果实验。不得实现 certainty selector、verdict、sham、router、MCV、新 detector、新 schema 或新 runtime。

## 3. 强制写白名单

只允许新建：

- `experiments/campaign/v6/run_v6_source_disclosure_screen.ts`
- `experiments/campaign/v6/analyze_v6_source_disclosure_screen.ts`
- `experiments/campaign/v6/v6_source_disclosure_screen_v1.plan.json`
- `test/v6-source-disclosure-screen.test.ts`
- `docs/plans/SOURCE_DISCLOSURE_SCREEN_PHASE1_IMPLEMENTATION_REPORT_2026-08-14.md`

不得修改任何既有文件，包括 `src/**`、schema、`productionVerticalSlice.ts`、provider adapters、package.json、既有 test、task 数据、artifact 和其他文档。若白名单不足，停止并返回最小 gap，不扩大权限。

## 4. Runner 与 plan

实现一个文件内的最小 runner/plan builder/CLI，复用现有导出，不建立 framework。

### CLI

- `--plan`：零 provider，确定性构造并校验 40-run plan；no-replace，已有字节不同则拒绝；
- `--execute`：本任务阶段必须默认 fail-closed，除非显式注入安全 single-attempt invoker 的测试入口；真实 CLI 不读取凭据、不运行 provider；
- `--replay`：零 provider，只验证已有完整 artifact；当前无 artifact 时按明确 absent 状态返回，不伪造成功。

### Plan 必需字段

只保存实验执行所需的非 outcome 身份：

- experiment/study/plan identity 与 content hash；
- runId、taskId、leakageGroup、blockId、arm、执行顺序；
- primary/model/monitoring/source-selection seeds；
- sourceSelectionKeyHash、sourceAgentId、sourcePrivateInformationHash；
- H/D 各自 taskDefinition/publicContext commitment hash；
- protocol/model/config refs、planned provider-call ceiling、token ceiling；
- analysis identity/cluster unit。

plan 严禁保存 task outcome、correct answer、resolution value、final loss 或 private-information plaintext。H 可以保存冻结潜在 source 的 identity/hash，不能保存 private text。

### Always-ineligible fixture

在 runner 内局部定义最小、冻结、始终不产生 eligible event 的 governance rule；不得加入公共 registry。它只用于满足 existing vertical-slice 输入并保证两臂零 verification/action。测试必须证明即使 round-1 certainty 很高也不会触发 action/provider verification。

### 复用要求

逐 run：

1. `createHiddenBenchTaskProjectionV1`；
2. `createSourceDisclosureTaskVariantV1`；
3. 将 variant task 传给既有 `runV6ProductionVerticalSlice`；
4. 复用既有 adapter、预算、preflight、artifact 路径与 replay；
5. 输出使用新 identity/outputDir，不读写旧 verdict/measurement/action-discovery artifact。

不要复制 production slice，不新增 store/registry/provider wrapper。

## 5. Analyzer

分析器只接受 frozen plan 与对应 40 个 raw-run artifacts。

### Authority checks

- missing/extra/duplicate run 均 fail-closed；
- 每个 artifact 通过 `verifyRawRunData`；
- study/run/task/arm/block/leakage identity 与 plan 一致；
- 重放 source selection，H/D 同 block 的 source agent/hash/key 一致；
- H public context 等于 base；D 只增加冻结 disclosure block；
- 两臂 provider-call 数相同且 verification calls=0；
- outcome/assignment/task carrier 自洽篡改被 replay 或 analyzer 拒绝。

### Primary

对每个 task/block 计算：

```text
pairedDiff = final pooled Brier(D) - final pooled Brier(H)
```

报告 20 个 pairedDiff 的总体均值。uncertainty 只按冻结的 **8 个 leakage groups** cluster bootstrap；不得把 40 runs、20 pairs 或 Agent reports 当作独立 clusters。冻结 bootstrap seed 与 resample 数。

### Mechanism/secondary

只报告：

- public-context delivery/commitment compliance；
- 若现有 evidence events 可直接重建，报告 exact source-hash reference/uptake；无法精确重建则标 `unobserved`，不得调用 LLM judge 或用关键词猜测；
- pre→final TV、target-option mass change 只能作 post-treatment mediator；
- accuracy、invalid/unavailable、prompt/completion tokens、latency、provider calls。

### Screen status

只允许输出：

- `SCREEN_PASS`：authority/replay/firewall 通过；D 确实改变可见 public context；存在可重建 uptake（若 uptake measurement technically available）；paired mean `<0` 且不是单一 leakage group 驱动；
- `MECHANISM_STOP`：披露 delivery 未发生；
- uptake 只作为描述性中介量，不参与 status gate。exact source-hash 零命中或不可观测不能排除 paraphrase、总结或隐式使用，也不能否决随机 delivery 的 intention-to-treat 质量比较；
- `QUALITY_STOP`：机制存在但 paired mean `>=0`；
- `DEFER`：缺失、支持不足或关键机制不可观测。

小筛选不要求 CI 完全低于 0；即使 `SCREEN_PASS` 也不得输出 `effect-established`、`governance-effective` 或 `confirmatory`。

## 6. 必测不变量

至少覆盖：

1. 精确 40 runs、10 tasks、8 leakage groups、20 H/D pairs；
2. 每 block H/D 各一且 source identity/hash/key 相同；
3. arm/order/run/seed 重建确定性；
4. plan 不含 truth/outcome/private plaintext；
5. H 保持 base publicContext，D 只增加 disclosure block；
6. 两臂其他 task 字段、模型/config/protocol/round/call ceiling 相同；
7. always-ineligible 在高 certainty 下仍零 action/verification call；
8. `--plan/--replay` 与默认 blocked `--execute` 零 provider、零凭据访问；
9. partial artifact provider 前拒绝，exact retry 不重抽；
10. output path 不逃逸，plan no-replace；
11. analyzer 拒绝 missing/extra/duplicate、arm/block/group/source drift 与 replay issue；
12. paired arithmetic 用手工 fixture 对齐；bootstrap unit 为 8 个 leakage groups；
13. 单一 group 改善不能被误判为 screen-wide robust direction；
14. status gate 对 PASS/MECHANISM_STOP/QUALITY_STOP/DEFER 的合成 fixture 均确定性；
15. 不产生网络、sleep、flaky timer 或真实 provider。

## 7. Red-zone

发现以下任一情况立即停止，只写最小失败测试/报告，不改核心：

- source selection 依赖 arm/runId/output/truth；
- H/D provider calls 或除 publicContext 外的协议不同；
- private information 泄漏进 plan；
- 必须修改 `src/**`、schema、production slice 或 provider adapter；
- always-ineligible 仍产生 action/verification；
- raw carrier 无法绑定 source disclosure identity，且只能靠猜测恢复；
- analyzer 必须读取 truth 才能构造 pre-action/mechanism quantity。

## 8. 验收

只运行零 provider 命令：

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/source-disclosure-intervention.test.ts test/v6-source-disclosure-screen.test.ts --reporter=dot
npx.cmd vitest run --reporter=dot
npm.cmd run build
npx.cmd tsx experiments/campaign/v6/run_v6_source_disclosure_screen.ts --plan
git status --short
```

最终报告必须列出：

1. 修改文件；
2. 每项测试保护的不变量；
3. plan 精确任务/组/pair/run/call/token 数；
4. always-ineligible 是否真正零 action/verification；
5. plan 是否含任何 private plaintext/truth/outcome；
6. 精确命令结果；
7. red-zone 与偏离；
8. kernel/runner/analyzer/paid-experiment 的真实状态。

明确声明：未运行真实/付费 LLM、未读取凭据、未修改白名单外文件、未执行 `git add/commit/reset/checkout/clean`。

完成后停止，等待 Codex 审核。不得运行 `--execute`。
