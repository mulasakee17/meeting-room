# Claude Code 提示词：Post-round-1 Randomized Action Discovery

状态：**DRAFT HANDOFF — Codex 已冻结科学问题与边界；禁止真实 provider**

把以下提示词原样交给 Claude Code。它只负责低风险接线、plan、测试和事实模板；不得重定义量、挑任务、执行实验或扩大内核。

---

你在 `C:\Users\贺孟元\Desktop\swarmalpha` 工作。先完整阅读：

1. `docs/REASONING_PROTOCOL.md`
2. `docs/plans/MEASUREMENT_GOVERNANCE_CLOSED_LOOP_PROTOCOL_V1.md` 顶部 2026-08-13 Addendum
3. `docs/experiments/V6_PROCESS_STATE_FAILURE_PREDICTION_AUDIT_2026-08-13.md`
4. `experiments/campaign/v6/processStateFeaturesV2.ts`
5. `experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts`
6. `experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication.ts`
7. `experiments/campaign/v6/productionVerticalSlice.ts` 中 round-1 monitoring / eligible-event assignment / V2 delivery 部分（只读）

## 任务目标

复用现有 `mechanism-verdict-v2-v1`、single-attempt provider adapters、schema-5 vertical slice、V2 public-only verification delivery 和 final private pooled Brier，建立一个**零 provider、no-replace 的 discovery plan/runner/analysis/test 包**。

科学目的只有两个：

1. fresh task clusters 上，动作前 ProcessState V2 是否 task-held-out 预测 no-action loss；
2. eligibility 不能再由 certainty threshold 决定的前提下，随机 apply/holdout/sham 是否提供 action-benefit 学习数据。

不得实现 selective router。不得运行 provider。不得新建 schema。

## Red-zone 决策：先做 feasibility gap audit

现有 vertical slice 只在 `HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2` eligibility 后随机 apply/holdout/sham；这会让 discovery sample 被 confidence threshold 选择，无法无偏学习整个 round-1 population 的 action benefit。

因此第一步必须只读盘点：能否通过**新建实验专用的 always-eligible randomized rule/fixture profile**，在不改 `productionVerticalSlice.ts`、不改 schema、不改 provider adapters 的情况下，使每个至少有一份有效 round-1 report 的 G run 都进入原有 eligible-event assignment。它仍只随机选择一个 precommitted monitoring target，并仍复用 V2 action/sham/holdout。

若不能，立即停止并返回：最小缺口、需要 Codex 修改的具体 symbol、一个最小失败测试。不得自行修改 core/vertical slice。

## 白名单

只允许新建/修改：

- `experiments/campaign/v6/v6ActionDiscoveryFixtureV1.ts`（可选，新建；仅实验 fixture/rule）
- `experiments/campaign/v6/run_v6_action_discovery.ts`（新建）
- `experiments/campaign/v6/analyze_v6_action_discovery.ts`（新建）
- `experiments/campaign/v6/v6_action_discovery_v1.plan.json`（仅 `--plan` no-replace）
- `test/v6-action-discovery.test.ts`（新建）
- `docs/plans/V6_ACTION_DISCOVERY_SEMANTIC_REVIEW_PACKET_2026-08-13.md`（新建）
- `docs/plans/V6_ACTION_DISCOVERY_IMPLEMENTATION_REPORT_2026-08-13.md`（新建）
- `package.json`（最多增加零-provider plan/replay/analyze 命令；非必要不改）

禁止修改：`src/**`、`productionVerticalSlice.ts`、`providerAdapters.ts`、`processStateFeaturesV2.ts`、任何 schema、旧 artifact/plan/result、旧测试。

## 任务与样本：只能生成 review packet，不能自行 accepted

- discovery 任务必须与已观察开发 IDs `2,6,10,25,26,30,34,36,41,42,43,44,46,48,53,56,58,59,60,62` 分离；
- 已人工审过但从未执行的候选 `5,7,14,21,57,61,64,65` 可进入候选；
- 还需生成至少 8 个额外候选，按 task description/template/leakage group 审查，不得按 `correct_answer` 选择；
- 全部候选均标 `OWNER REVIEW REQUIRED`。Claude Code 不能签 accepted；
- plan 仅在恰好 16 个唯一 semantic leakage groups 被外部标 accepted 后生成；否则 fail-closed，provider zero calls。

## 冻结设计意图

若 feasibility audit 通过，plan 设计为：

- 16 fresh task clusters × 8 G replicates = 128 planned runs；
- 只有 `epistemic_governance_v1`；两轮 discussion、V2 verification、final private elicitation 原样复用；
- round-1 完成后、round-2 前，所有存在有效 round-1 report 的 run 都进入 `apply=.50 / holdout=.25 / sham=.25`；不得使用 certainty threshold 进行 eligibility；
- monitoring target selection 保持 deterministic random over valid round-1 reports；
- run/assignment/monitoring seeds 由 no-replace plan identity 冻结；不补样本、不换题、不挑 seed；
- provider upper bound = 1,600 calls；token upper bound = 2,000,000；这些只是 safety ceilings；
- ground truth 只在 final outcome scoring；不得出现在 rule、feature、assignment、target selection、prompt 或 request；
- failure/timeout/invalid 保留 terminal 身份，不 retry、不用成功 run 替换。

若基于 runner 的静态预算精确计算发现 1,600 calls 不足，不得擅自扩大；返回 exact calculation 给 Codex。

## 分析器

分析器只读 plan + replay-verified artifacts：

1. 对每个 run 从 round-1 ledger 计算 `deriveProcessStateFeaturesV2`；不得复制另一套公式；
2. no-action risk population：holdout；sham 单独报告，不默认等价 no action；
3. action effect：apply−holdout pooled Brier；sham−holdout 为注意力/调用对照；
4. 只做 task-cluster bootstrap；不得把 runs 当独立 task；
5. discovery 模型固定为 ridge：constant、confidence-only、V1 four-feature、V2 nine-feature，lambda=1；task-held-out prediction；不调参；
6. treatment-benefit 只做预先定义的线性 interaction model（arm、V2 features、arm×features，lambda=1），并报告 task-held-out uplift ranking。不得把训练内 CATE 当已验证；
7. 输出仅允许 `GO / DEFER`，不允许自动生成 selective policy；
8. 完整报告 call/token/latency/invalid/unavailable、arm/task counts、replay issues 与 truth-firewall checks。

## Gate

以下仅决定是否值得由 Codex 冻结下一阶段 policy，不是论文正效应结论：

- ≥12 holdout task clusters 且 ≥30 holdout runs；
- apply 与 holdout 各 ≥30 terminal runs、各覆盖 ≥12 clusters；
- replay zero issue；
- V2 risk model相对 constant 和 confidence-only 的 paired task-cluster bootstrap MSE improvement point estimate >0；95% interval 报告但 discovery 阶段不强制完全 >0；
- apply−holdout 平均 Brier <0，并报告 cluster-bootstrap interval；
- cross-fitted uplift ranking 的 top-half 与 bottom-half apply−holdout 差异方向符合“top-half benefit 更大”；只作为 discovery gate，不称 causal heterogeneity established。

任一失败输出 `DEFER`，不修改特征、不改阈值、不追加任务。

## 必测不变量

至少覆盖：

1. review 未 accepted 时 plan fail-closed；
2. 16×8=128，run IDs/seeds 唯一且 no-replace；
3. plan 无 truth/outcome/correct answer/final loss；
4. always-eligible experimental rule 不读取 certainty、outcome 或 resolution；
5. round-1 无有效 report 时不得 action；有 report 时不可因 certainty 低而 ineligible；
6. target selection 先于 assignment，且与 arm/outcome 无关；
7. apply/holdout/sham 概率严格 .50/.25/.25；
8. 特征来自 `deriveProcessStateFeaturesV2` 且在 action assignment 前；
9. replay/analysis 拒绝 feature timing drift、arm drift、task/group drift、duplicate/missing artifact；
10. exact retry zero provider；partial state provider 前拒绝；
11. timeout/invalid 不被补跑；
12. analysis 拒绝从 apply outcome 反向构造 feature；
13. bootstrap unit 为 task/leakage group；
14. gate 失败稳定输出 DEFER，不改模型或样本。

## 验收

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/v6-process-state-features-v2.test.ts test/v6-action-discovery.test.ts --reporter=dot
npx.cmd vitest run --reporter=dot
npm.cmd run build
git status --short
```

最终报告必须逐项列出：修改文件、feasibility 结论、每项测试保护的不变量、精确命令结果、red-zone、偏离、真实 kernel/runner/paid 状态。

明确声明：未运行真实/付费 LLM；未读/输出凭据；未自行 accepted semantic review；未修改白名单外文件；未执行 git add/commit/reset/checkout/clean。

---

