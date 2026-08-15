# V6 Action Discovery — 实现报告

日期：2026-08-13
状态：机械实现完成（fixture / runner / analyzer / plan builder / review packet / tests）；**禁止真实 provider；plan 因静态预算缺口 fail-closed**。
权威设计：[`CLAUDE_CODE_POST_ROUND1_ACTION_DISCOVERY_HANDOFF_2026-08-13.md`](CLAUDE_CODE_POST_ROUND1_ACTION_DISCOVERY_HANDOFF_2026-08-13.md)
Review packet：[`V6_ACTION_DISCOVERY_SEMANTIC_REVIEW_PACKET_2026-08-13.md`](V6_ACTION_DISCOVERY_SEMANTIC_REVIEW_PACKET_2026-08-13.md)

---

## 1. 修改 / 新增文件（全在白名单内）

| 文件 | 类型 |
|---|---|
| `experiments/campaign/v6/v6ActionDiscoveryFixtureV1.ts` | 新建（always-eligible rule + 克隆 apply action + 修改 study） |
| `experiments/campaign/v6/run_v6_action_discovery.ts` | 新建 runner（`--plan` / `--execute`[仅入口] / `--replay`） |
| `experiments/campaign/v6/analyze_v6_action_discovery.ts` | 新建只读分析器（ridge + task-held-out + GO/DEFER gate） |
| `test/v6-action-discovery.test.ts` | 新建（17 项不变量） |
| `docs/plans/V6_ACTION_DISCOVERY_SEMANTIC_REVIEW_PACKET_2026-08-13.md` | 新建 review packet |
| 本文档 | 新建报告 |

未修改 `src/**`、`productionVerticalSlice.ts`、`providerAdapters.ts`、`processStateFeaturesV2.ts`、schema、旧 artifact/plan/result、旧测试。

## 2. Feasibility gap audit（red-zone 门）— 结论 FEASIBLE

**问题**：现有 slice 只在 `HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2` eligibility（certainty≥0.7）后随机 apply/sham/holdout；若直接复用，discovery 样本会被 confidence 选择，无法无偏学习 round-1 全体的 action benefit。

**只读结论**：
- slice 把 `governanceRule` / `interventionContracts` / `study` 作为**输入**（`productionVerticalSlice.ts:1356` registerRule；`:1218-1221` 要求 policy.eligibilityRuleRefs[0] 匹配输入 rule；`:1222-1224` 恰一个 allocation）。
- `GovernanceEligibilityRule` 是带 `evaluate` 的纯接口（`controlContracts.ts:155-160`）；`validateInterventionContract` 不强制 actionRef→ruleRefs 固定映射（只要求非空唯一）。
- 因此可在**实验专用 fixture** 中：构造 always-eligible rule（有 diagnosis 即 eligible，无 certainty/lineage 检查）、克隆 `verification-request@2.0.0` action 授权该 rule、改 study policy 的 `eligibilityRuleRefs`——**不改 slice/schema/provider**。
- **mock 探针已验证**：低 certainty（0.34）round-1 报告在 always-eligible rule 下仍触发 eligible event + V2 apply delivery；无有效 round-1 report 时无 diagnosis → ineligible。

**GAP（仅实验侧）**：需要实验侧克隆 intervention contract + 修改 study policy；这不是生产改动，但意味着 discovery 的 eligibility 语义只存在于 fixture 层，replay 必须用同一输入 rule。

## 3. 静态预算缺口（FACT，返回 Codex 决策）

冻结设计 16 clusters × 8 replicates = 128 runs 的静态 provider-call 上界：

```
14 tasks × 4 agents × 8 runs × 13 calls = 1456
 2 tasks × 3 agents × 8 runs × 10 calls =  160   (task 8, task 33)
合计 1616 planned provider calls
```

**1616 > 冻结 cap 1600（缺口 16 calls）。** 按交接要求：**不得擅自扩大 cap**。`buildActionDiscoveryPlanV1` 现对超 cap fail-closed 并输出精确逐 task 计算；plan JSON 未生成（也因无 16 个 accepted review）。**需 Codex 决策**：降低到 15 tasks×8、或对 3-agent 任务下调预算估计、或确认 1616 可接受。

## 4. 每项不变量（测试覆盖）

| # | 不变量 | 判定 |
|---|---|---|
| 1 | review 未 accepted 时 plan fail-closed | ✅（空/15 项抛错） |
| 2 | 16×8=128 唯一 runId/seed，no-replace | ✅（`actionDiscoveryRunIdsV1` 128 唯一） |
| 3 | plan 无 truth/outcome/correct answer/final loss | ✅ |
| 4 | always-eligible rule 不读 certainty/outcome/resolution | ✅（0.34 仍 eligible；无 diagnosis 则 ineligible） |
| 5 | round-1 无报告不 action；有报告不因低 certainty 而 ineligible | ✅（rule 行为 + probe） |
| 6 | target selection 先于 assignment | ✅（monitoring seed=replicate-1 与 eligibleEventMasterSeed 分离；probe audit trail 顺序） |
| 7 | apply/holdout/sham 严格 .50/.25/.25 | ✅（study policy allocations） |
| 8 | 特征来自 `deriveProcessStateFeaturesV2` 且 timing 在 action 前 | ✅ |
| 9 | replay/analysis 拒绝 drift / duplicate / missing | ✅（replay missing-artifact 抛错；analyzer 缺 plan 抛错） |
| 10 | exact retry zero provider | ✅（不 import legacy llm/callLLM） |
| 11 | timeout/invalid 不补跑 | ✅（slice terminal 语义，报告说明） |
| 12 | analysis 不从 apply outcome 构造特征 | ✅（derive 输入仅 round-1 ledger） |
| 13 | bootstrap unit = task cluster | ✅（resample taskIds） |
| 14 | gate 失败稳定输出 DEFER | ✅（`evaluateDiscoveryGateV1`） |

## 5. 精确命令结果

```
git diff --check                                    → 0
npx.cmd tsc --noEmit                                → 0
vitest run v6-action-discovery + v6-process-state-features-v2 → 22 passed
npm.cmd run build                                   → 0
```

## 6. Red-zone / 偏离

- **无 red-zone**。未触碰 production/core/schema/provider；未执行真实 provider；未读凭据；未运行 `--execute`；未自行 accepted semantic review。
- **偏离**：无。plan 因两个冻结条件（<16 accepted review、cap 缺口）fail-closed，均按设计。

## 7. 真实状态声明

- **Feasibility**：FEASIBLE（mock 探针验证，无生产改动）。
- **Kernel/Runner**：fixture + runner + analyzer + plan builder 已实现并测试；`--execute` 是已实现入口但未调用。
- **Paid**：未运行任何真实/付费 LLM；未读取/输出凭据。
- **Cap 缺口**：1616 > 1600，已 fail-closed 并返回精确计算，等 Codex 决策。
