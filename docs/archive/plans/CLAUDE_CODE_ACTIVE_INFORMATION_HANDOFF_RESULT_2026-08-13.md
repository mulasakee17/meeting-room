# Active Information Governance — 执行结果与只读迁移盘点

日期：2026-08-13
状态：COMPLETED（WP A–D；kernel 已加固与 fixture 化；**未接入 production，无真实实验**）
权威指南：[`CLAUDE_CODE_ACTIVE_INFORMATION_HANDOFF_2026-08-13.md`](CLAUDE_CODE_ACTIVE_INFORMATION_HANDOFF_2026-08-13.md)
规范理论：[`docs/theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md`](../theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md)
事实文档：[`docs/architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md`](../architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md)

---

## 1. 修改 / 新增文件（全在白名单内）

| 文件 | 类型 |
|---|---|
| `test/active-information-governance-adversarial.test.ts` | 新增（WP A，18 项） |
| `experiments/campaign/v6/truthBlindPolicyFixtureV1.ts` | 新增（WP B fixture） |
| `test/truth-blind-policy-fixture.test.ts` | 新增（WP B，11 项） |
| `docs/architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md` | 新增（WP C 事实文档） |
| `docs/ACTIVE_RESEARCH_SURFACE.md` | 状态同步（仅 kernel 行） |
| 本文档 | 新增（WP D 盘点 + 最终报告） |

未修改 `src/**`、production vertical slice、raw schema、Runner、provider adapter、package.json、真实实验配置、artifacts、`.env*`、凭据或 legacy 目录。

## 2. 每项测试不变量

### 对抗测试（18 项，WP-A #1–#11）

| 组 | 覆盖 |
|---|---|
| truth-like 输入（#1） | risk 投影输入 / candidate / action-selection 输入 / decision 四处 `groundTruth/correctAnswer/resolverOutcome/loss` fail-closed |
| missingness（#2/#3） | prompt sensitivity、declared source concentration、qualified unsupportedness 的 `missing` 不编码为 0 |
| distinct 身份（#4） | decision 无 `independence/expectedValue/correctness/errorCorrelation` 字段 |
| 排序（#5/#7） | same-distinctness 下 new observation 优于免费 reanalysis；candidate 重排结果不变；同级按 stable id |
| admissibility（#6） | over-budget/unavailable 不选择；cross-claim 整个边界 fail-closed |
| 后果终端（#8） | high/critical → escalate；low/moderate → abstain |
| replay（#9） | sourceRiskHash / budget / consideredCandidateIds / selectedAction 篡改均拒绝；live 输入漂移拒绝 |
| 异常值（#10） | NaN/Infinity/负 cost/budget、sparse、duplicate id、空串、wrong enum 全 fail-closed |
| 冻结/隔离（#11） | decision/risk 深冻结；输入 mutation 后 decision 不变 |

### Fixture 测试（11 项，WP-B）

packet 无 truth/outcome/loss；envelope 不入 selection 路径（decision.sourceRiskHash 绑定 packet.risk，envelope.observedDecisionHash 记录 decision）；四场景决策正确；baseline（certainty/disagreement/random）确定性且 random 可重放。

## 3. Packet / Evaluator 隔离证据（FACT）

- `TruthBlindPolicyVisiblePacketV1` 只含 `{ policyRef, risk, candidates, availableBudget, contentHash }`；JSON 序列化实测不含 `syntheticOutcome/groundTruth/correctAnswer/resolverOutcome/properLoss`。
- `TruthBlindEvaluatorOnlyEnvelopeV1` 在 decision 完成后才构建，只含 `syntheticOutcome + utilityContract + observedDecisionHash + syntheticProperLoss`；selection 函数签名只收 packet 内容，envelope 不被闭包捕获。
- 所有场景标 `DETERMINISTIC FIXTURE`。

## 4. 精确命令结果

```
git diff --check                                                    → exit 0
npx.cmd tsc --noEmit                                                → exit 0
vitest run active-information-governance + adversarial + fixture    → 36 passed
vitest run (full)                                                   → 1562 passed | 11 skipped
npm.cmd run build                                                   → exit 0
```

## 5. Red-zone / 偏离

- **无 red-zone**。kernel 的 truth firewall、missing≠0、distinct-only、reanalysis-after-observation、replay tamper 拒绝等全部通过对抗测试；唯一"更严"行为是 cross-claim candidate 使整个边界 fail-closed（比"不选择"更强）。
- **无偏离**。未修改 src；未跳过失败测试；未放宽 timeout；未执行 git 写操作。

## 6. 只读迁移盘点（WP-D）

### 6.1 `verifiedIndependentLineageCount`

| 位置 | 符号 | 当前含义 | 进入 replay/schema? |
|---|---|---|---|
| `src/lib/governance/epistemicEligibilityRules.ts:191,193` | attribute 读取 | eligibility 规则用它作为 lineage-count 门槛 | 是（diagnosis attribute → audit trail） |
| `experiments/campaign/v6/detectionValidation.ts:585,735` | attribute 读取 | detector-validation 用 | 是 |
| `experiments/campaign/v6/productionVerticalSlice.ts:1120,1142,1528,1562,1574` | 由 `deriveVerifiedIndependentLineageCountV1` 产出并存 diagnosis | 描述 lineage 计数 | **是**（schema-5 raw artifact 的 governance diagnosis） |
| `test/*` 多处 | fixture | 测试 | — |

**机械改名风险：高。** 该 key 以属性名持久化在 schema-5 governance diagnosis 中；改名会使既有 raw-run artifact 的 diagnosis replay 失败。**不得机械重命名。**

### 6.2 `swarmalpha.metric.verified-independent-lineages`

- `src/lib/governance/standardEpistemicActions.ts:95` — `VERIFICATION_REQUEST_V2` 的 mediator metricRef；`swarmalpha.measurement.verified-independent-lineage-count` 亦出现在既有 artifact 中。
- 进入 governance audit trail source events → replay 表面。

### 6.3 `independent verification` 短语

- `experiments/campaign/v6/providerAdapters.ts:210` — V1 legacy prompt "Give an independent verification…"（**仅 V1 分支存活**；V2 verdict prompt 已改为 "Judge only whether the public context supports or contradicts…"）。短语不持久化进 artifact，不进入 replay。
- theory §5 规范性纠正：public reanalysis 是 consistency check，不得称 independent verification。

### 6.4 版本化迁移建议（交 Codex 决策）

1. **保留旧 key** `verifiedIndependentLineageCount` 与旧 metric id 以维持旧 artifact replay；
2. 新增 **V3** 语义字段（如 `sourceIdentityDistinctCount` / metric `swarmalpha.metric.source-identity-distinct-relations`），只声明"来源身份/provenance distinctness"，不声明误差独立；
3. 提供 replay 兼容适配器把旧 key 映射到新语义（identity-only），供新代码消费；
4. eligibility rule 换用 V3 字段并升规则版本；detectionValidation 同步消费新字段；
5. 删除或归档 V1 "independent verification" 短语（V2 已无）。

## 7. Kernel / production / empirical / MCV 状态（FACT）

- **Kernel**：`activeInformationGovernance.ts` 已实现并经 18 项对抗测试 + 11 项 fixture 测试覆盖（本工作包）。
- **Production wiring**：未接入 production Runner（LIMITATION）。
- **Empirical**：无真实实验；fixture 为 DETERMINISTIC FIXTURE，不构成结果。
- **MCV**：未建立；`source-novelty-lexicographic` 是 heuristic（`frozen_heuristic_not_value_optimal`）。

## 8. 声明

未运行任何真实/付费 LLM；未读取凭据；未执行 git 写操作（add/commit/reset/checkout/clean）。所有测试均基于实现不变量，无 provider 调用。
