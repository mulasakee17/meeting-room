# Claude Code 执行提示词：Source Disclosure Mechanism Screen

> **PAUSED / DO NOT EXECUTE (2026-08-13):** 顶层研究顺序已由
> `MEASUREMENT_GOVERNANCE_CLOSED_LOOP_PROTOCOL_V1.md` 的权威 Addendum 修订。
> 本提示词仅保留历史设计，不再授权实现、生成 plan 或运行 provider。
> pre-discussion disclosure 发生在 round-1 process state 之前，不能回答当前
> selective-governance 主问题。等待 Codex 提供新的 post-round-1 randomized
> action-learning 白名单提示词。

把下面整段原样交给 Claude Code。该任务是机械接线与测试，不授权改理论、内核、schema 或执行真实 provider。

---

你在 `C:\Users\贺孟元\Desktop\swarmalpha` 工作。先读且只把它们作为本任务的权威上下文：

1. `docs/REASONING_PROTOCOL.md`
2. `docs/plans/MEASUREMENT_GOVERNANCE_CLOSED_LOOP_PROTOCOL_V1.md`
3. `experiments/campaign/v6/sourceDisclosureInterventionV1.ts`
4. `test/source-disclosure-intervention.test.ts`
5. 参考但不要修改：
   - `experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts`
   - `experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication.ts`
   - `experiments/campaign/v6/v6HiddenBenchSmokeFixture.ts`
   - `experiments/campaign/v6/hiddenBenchTaskAdapter.ts`
   - `experiments/campaign/v6/productionVerticalSlice.ts`

## 任务性质与权限

这是一个**白名单、无 provider、低风险工程任务**。Codex 已冻结：研究问题、H/D 两臂、来源选择、96-run 样本、paired estimand、gate 与 claim ceiling。你不得重新设计。

你只负责：任务候选 review packet、no-replace plan、runner 接线、只读分析器、对抗测试、事实报告模板。

## 强制白名单

你只可新建/修改以下文件：

- `experiments/campaign/v6/run_v6_source_disclosure_screen.ts`（新建）
- `experiments/campaign/v6/analyze_v6_source_disclosure_screen.ts`（新建）
- `experiments/campaign/v6/v6_source_disclosure_screen_v1.plan.json`（由 `--plan` no-replace 生成或新建）
- `docs/plans/SOURCE_DISCLOSURE_SCREEN_SEMANTIC_REVIEW_PACKET_2026-08-13.md`（新建）
- `docs/plans/SOURCE_DISCLOSURE_SCREEN_IMPLEMENTATION_REPORT_2026-08-13.md`（新建）
- `test/v6-source-disclosure-screen.test.ts`（新建）
- `package.json`（最多新增 plan/test 命令；若非必要不改）

不许修改任何 `src/**`、`productionVerticalSlice.ts`、`providerAdapters.ts`、`sourceDisclosureInterventionV1.ts`、既有 test、schema、artifact、旧 plan/runner 或结果文档。若白名单不足，停止并给 Codex 一个最小 gap；不要扩大范围。

## A. Semantic review packet（只生成候选，不自行签署 accepted）

构造 16 个候选 task clusters：

- 已有人工审查身份可复用的 8 个：`5, 7, 14, 21, 57, 61, 64, 65`；
- 新候选 8 个：`4, 8, 17, 23, 28, 38, 47, 50`。

对每个候选只从 pinned HiddenBench 数据提取：task id/name、K、agent count、描述摘要、syntactic leakage group、建议 semantic leakage group、与既有 20-task verdict development 集及另外 15 个候选的潜在模板重合风险。**不要读取或记录 `correct_answer`，不要基于正确答案接受/拒绝任务。**

review packet 必须明确：

- 前 8 个沿用 `docs/plans/V6_VERDICT_TASK_HELDOUT_REPLICATION_DESIGN_2026-08-13.md` 的既有人工审查身份，但新实验仍需 owner 最终确认；
- 后 8 个全部标 `REVIEW PENDING`，你不能把自己生成的 packet 签为 accepted；
- owner/Codex 需对每项填 `accept / reject / merge / replace`；
- 若 merge 导致少于 16 个独立 leakage groups，停止，不静默补题。

## B. 冻结 plan

实现 `--plan`，只在 16 个 review 项全部由外部明确标为 accepted 且 leakage group 唯一后生成 96 个 planned runs：

- 16 task × 3 block × 2 arm（H/D）= 96；
- arms 只能是 `holdout` 与 `forced_source_disclosure`；
- 每个 task/block 恰好 H/D 各一；
- arm 执行顺序由一个 plan-level master seed 确定性置换；
- `blockId`、`sourceSelectionSeed` 在 H/D 内完全相同；
- `runId`、primary seed、monitoring seed、clock identity 确定性且全局唯一；
- no-replace：已有 plan 字节不同则拒绝，不能覆盖；
- 计划必须保存 task/leakage group、arm、block、source selection hash/agent id/private-info hash，但 H arm 不得保存 private text；
- 计划严禁任何 outcome/correct answer/resolver result/final loss 字段；
- 全部使用既有 DeepSeek single-attempt、两轮 `explicit_belief_v1` 协议与 final private elicitation；两臂 provider budgets 相同，治理/verification calls 均为 0。

不要引入第三臂、certainty threshold、eligibility、verdict、sham、动态 router 或 source-novelty policy。不要扩 schema。

## C. Runner

runner 支持：

- `--plan`：零 provider；
- `--execute`：只有显式注入/已有安全 single-attempt invoker 时才可运行；默认 CLI 若无安全边界 fail-closed；
- `--replay`：零 provider，只验证已有 artifacts；
- exact retry：完整 run 重用且 0 新调用；partial run 在 provider 前 fail-closed；
- 逐 run：从 pinned task projection 创建 base task，调用 `createSourceDisclosureTaskVariantV1`，再把返回 task 送进既有 V6 vertical slice；
- H/D 都以各自 task manifest 承诺 public context；不得把 D 伪装成 verifier/governance event；
- 顺序执行、no retry、调用/token budget 上限、provider failure 显式 terminal；
- ground truth 只由既有 task manifest/final scoring 路径持有，不得进入 source selection 或 provider request；
- 输出新目录；不读写旧 verdict exploratory/continuation/heldout artifact。

若既有 V6 vertical slice 无法在不修改 red-zone 的情况下完成这一接线，立即停止，给 Codex：具体缺口、最小失败测试、需要修改的 symbol；不要自己改核心。

## D. 冻结分析

分析器只消费 plan + 96 个 raw-run artifacts：

- 每个 run 必须 schema-5 replay 无 issue；
- 重放 source selection，H/D paired block 必须 source agent/hash 相同；
- H 的 public context hash 必须等于 base；D 必须等于 base + 冻结 disclosure block；
- 每 task/block 计算 `pairedDiff = Brier_D - Brier_H`；
- primary：48 个 pairedDiff 的均值；
- uncertainty：只按 task/leakage group cluster bootstrap，冻结 seed、10,000 resamples；
- 报告 95% percentile interval、valid fraction、H/D run/pair/task 数；
- secondary：accuracy、invalid/unavailable、prompt/completion tokens、latency、每臂 provider calls；
- Gate 必须逐项打印，任何一项失败均输出 `DEFER`，不得自动改阈值；
- 不运行按 report/certainty/lineage 子组挑选的 exploratory fishing；不解释社会热力学、MCV 或一般治理效果。

## E. 对抗测试

至少覆盖以下不变量：

1. 16×3×2=96，且每 block H/D 各一；
2. 同 block H/D 的 source identity/hash/key hash 相同；
3. plan 不含 truth/outcome/correct-answer/final-loss；
4. plan review 未 accepted 时 fail-closed；merge 后 cluster<16 fail-closed；
5. H 保持 base public context；D 只多一个 disclosure block；
6. 两臂非 publicContext task fields 完全相同；
7. 两臂 discussion/final model/config/prompt contract/budget 相同，verification calls=0；
8. dry plan/replay 0 provider；
9. partial state provider 前拒绝；exact retry 0 新调用；
10. path 不逃逸 outputDir，plan no-replace；
11. 分析器拒绝 missing/extra run、重复 pair、source mismatch、arm drift、task/leakage drift、replay issue；
12. paired arithmetic 手算对齐；bootstrap unit 是 task/leakage group，不是 run；
13. outcome 自洽篡改仍被 replay/analysis 拒绝；
14. Gate 不满足输出 DEFER，不得输出 effect-established。

不得写睡眠、网络测试、真实 provider、flaky timer 或只做源码字符串断言来代替行为测试。

## F. 验收

依次运行：

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/source-disclosure-intervention.test.ts test/v6-source-disclosure-screen.test.ts --reporter=dot
npx.cmd vitest run --reporter=dot
npm.cmd run build
git status --short
```

最终报告逐项列出：修改文件、每项测试保护的不变量、命令精确结果、任何 red-zone、与提示词偏离、kernel/runner/paid 状态。明确声明：

- 未运行任何真实/付费 LLM；
- 未读取/输出凭据；
- 未自行签署 semantic review；
- 未修改白名单外文件；
- 未执行 git add/commit/reset/checkout/clean。

发现任何 truth/private leakage、来源选择依赖 arm/outcome、两臂调用预算不一致、旧 artifact 污染、需要修改 core/schema 的情况，立即停止并返回 Codex，不做“最小修复”。

---
