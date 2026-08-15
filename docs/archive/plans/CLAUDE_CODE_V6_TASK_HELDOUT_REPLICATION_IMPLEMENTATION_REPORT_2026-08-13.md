# V6 Verification Verdict — Task-Heldout Replication 实现报告

日期：2026-08-13
状态：机械实现完成（runner / analyzer / plan / manifest / tests）；**未执行真实 provider，未运行 --execute**。
设计：[`V6_VERDICT_TASK_HELDOUT_REPLICATION_DESIGN_2026-08-13.md`](V6_VERDICT_TASK_HELDOUT_REPLICATION_DESIGN_2026-08-13.md)

---

## 1. 修改 / 新增文件（全在白名单内）

| 文件 | 类型 |
|---|---|
| `experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts` | 新建 runner（`--plan` / `--execute`[入口仅实现] / `--replay`） |
| `experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication.ts` | 新建只读分析器 |
| `experiments/campaign/v6/v6_verdict_task_heldout_replication_v1.plan.json` | 新建 no-replace 计划 |
| `experiments/campaign/v6/v6_verdict_task_heldout_replication_v1.manifest.json` | 新建 sidecar manifest（仅数据） |
| `test/v6-verdict-task-heldout-replication.test.ts` | 新建测试（14 项） |
| 本文档 | 新建报告 |

未修改 `src/**`、schema、`productionVerticalSlice`、fixture、prompt、threshold、model、allocation 或既有 runner。**未创建任何输出 artifact；输出根目录不存在。**

## 2. 冻结设计（FACT）

- task IDs（顺序固定）：`[5, 7, 14, 21, 57, 61, 64, 65]`；8 个唯一 leakage group（`hb-v6r1:*`）。
- profile `mechanism-verdict-v2-v1`；protocol `epistemic_governance_v1`；12 replicates/task = **96 runs**。
- stage-2 `apply .50 / sham .25 / holdout .25`；certainty threshold `0.7`。
- 复用 DeepSeek model ref / invocation config hash / prompts / final private elicitation / pooled Brier / single-attempt no-retry / truth firewall / V2 safety checks。
- Primary estimand：`mean(final pooled Brier | apply) − mean(final pooled Brier | holdout)`；task-cluster 10,000 deterministic percentile bootstrap、95% interval。
- 预算：`maxProviderCalls 1300`、`maxTotalTokens 1600000`。
- 计划：`experimentRef = swarmalpha.experiment.v6-verdict-task-heldout-replication-v1@1.0.0`；输出根 `pilot_output/v6-verdict-task-heldout-replication-v1-20260813`。

## 3. 每项不变量

| 不变量 | 判定 |
|---|---|
| 冻结 task set + 顺序 + 8 唯一 leakage group | ✅（测试） |
| 96 唯一 runId，task×replicate(1..12) 完整 | ✅ |
| 新 identity 不与 exploratory/continuation 重叠（task 集与 experimentRef） | ✅ |
| deterministic plan hash/seed；monitoringSeed = replicate−1 | ✅ |
| 预算上限（1248 calls ≤ 1300；18432 tokens ≤ 1600000）+ no-replace | ✅ |
| `--plan` 零 provider（plan 纯函数；输出根未创建） | ✅ |
| 分析器拒绝混入开发批次/未知 task（只读 held-out 根；armOf 校验 protocol；taskId 校验） | ✅（identity 不相交 + DEFER 规则） |
| replay 缺 artifact 时 fail-closed（`task-heldout-missing-artifact`） | ✅ |
| DEFER：apply/holdout n<10、task cluster<6、valid fraction<.95 | ✅（`evaluateTaskHeldoutDeferV1`） |
| 输出根路径不可逃逸（repo 内、无 `..`） | ✅ |
| 不 import legacy llm/providers 或 retrying callLLM | ✅ |

## 4. Sidecar manifest（FACT）

- `reviewProtocolRef = { id: "swarmalpha.review.v6-verdict-task-heldout-replication", version: "1.0.0" }`
- `reviewedAt = 2026-08-13T08:00:00.000Z` < `planCreatedAt = 2026-08-13T10:00:00.000Z`
- 每 task 固定 leakage group（design §3.2 表）
- `scopeNote`：仅声明本轮 task-heldout 边界；**不是 confirmatory task-bank admission**；未接入 production。

## 5. 验证结果

```
git diff --check                                    → exit 0
npx.cmd tsc --noEmit                                → exit 0
vitest run heldout-replication + randomized-continuation → 18 passed
npm.cmd run build                                   → exit 0
```

## 6. Red-zone / 偏离

- **无 red-zone**。未触碰 production/core/schema；未执行真实 provider；未读凭据；未运行 `--execute`。
- **无偏离**。唯一与本提示词的差异：`v6_verdict_task_heldout_replication_v1.manifest.json` 被创建为白名单允许的"仅数据 manifest"（本提示词 §7 明确要求记录 review identity 的 sidecar）。

## 7. 明确声明

**未运行真实或付费 LLM；未读取凭据；未执行 git 写操作（add/commit/reset/checkout/clean）。** `--execute` 入口存在但未被调用；执行需 Codex 审核计划与测试后的一次明确付费授权（设计 §8）。
