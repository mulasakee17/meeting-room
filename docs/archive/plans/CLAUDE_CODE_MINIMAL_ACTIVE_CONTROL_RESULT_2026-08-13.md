# Minimal Active Information Control — 执行结果

日期：2026-08-13
状态：COMPLETED（WP-A–D；eligibility/completion 已对抗测试、fixture 已修正；**未接入 production，无真实实验**）
权威指南：[`CLAUDE_CODE_MINIMAL_ACTIVE_CONTROL_HANDOFF_2026-08-13.md`](CLAUDE_CODE_MINIMAL_ACTIVE_CONTROL_HANDOFF_2026-08-13.md)
理论：[`docs/theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md`](../theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md)
事实文档：[`docs/architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md`](../architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md)

---

## 1. 修改 / 新增文件（全在白名单内）

| 文件 | 类型 |
|---|---|
| `test/active-information-control-adversarial.test.ts` | 新增（WP-A eligibility 11 项 + WP-B completion 10 项 = 21 项） |
| `experiments/campaign/v6/truthBlindPolicyFixtureV1.ts` | 修正（WP-C：eligibility 步骤、真实 baseline 函数、`preActionReferenceLoss` 重命名、深冻结） |
| `test/truth-blind-policy-fixture.test.ts` | 更新（WP-C，13 项） |
| `docs/architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md` | 同步（WP-D：eligibility/completion/receipt/未建立项） |
| 本文档 | 新增（最终报告） |

未修改 `src/**`、Runner、schema、provider adapter、package.json、真实配置、artifacts、`.env*`、legacy。

## 2. 每项不变量

### WP-A Eligibility（11 项）

| # | 不变量 | 判定 |
|---|---|---|
| 1 | threshold ∈ [0,1]；authority = `randomized_experiment_only` | ✅（测试） |
| 2 | candidate 绑定当前 eligibility ID 与同一 claim | ✅ |
| 3 | known source relation 必须在 authority snapshot；unknown 不伪装 distinct | ✅ |
| 4 | lineage missing 只允许能新增 provenance_record 的 external observation | ✅ |
| 5 | source concentration 只允许 distinct source + 非 public reanalysis | ✅ |
| 6 | disagreement 只允许能新增 evidence 的 external observation | ✅ |
| 7 | prompt sensitivity 只允许能新增 belief report 的 re-elicitation/private report | ✅ |
| 8 | high-consequence support missing 允许 evidence acquisition，不声称答案错误 | ✅（matched reasons 无 wrong/incorrect） |
| 9 | 低风险且无匹配理由时不生成 eligible candidate，即使免费 | ✅ |
| 10 | 多标签、非加权；candidate 重排不改变 eligibility artifact | ✅（contentHash 不变） |
| 11 | eligibility tamper / risk hash 漂移 / authority 漂移在 selection 前拒绝 | ✅ |

### WP-B Completion（10 项）

| # | 不变量 | 判定 |
|---|---|---|
| 1 | non-terminal / failed / censored / held_out 不得冒充 completed | ✅ |
| 2 | observation ID 已在 pre-action set 时拒绝 | ✅ |
| 3 | observation kind 不在 candidate expected kinds 时拒绝 | ✅ |
| 4 | observation 未绑定 terminal transition 时拒绝 | ✅ |
| 5 | instance actionRef / targets / cost 与 candidate 漂移时拒绝 | ✅ |
| 6 | public reanalysis 只能产出 belief_report | ✅ |
| 7 | completed lifecycle + empty observation 仍拒绝 | ✅ |
| 8 | 合法 evidence / belief_report / provenance_record 分别通过 | ✅ |
| 9 | 输入 mutation 不改变已生成的 eligibility/decision | ✅（深冻结 + clone） |
| 10 | completed 不写成 effective / correct / verified / beneficial | ✅（assertion 返回 void；instance 无此类字段） |

## 3. Fixture 修正（WP-C）

- 外层 packet、envelope、scenario **全部 deep-freeze**；
- certainty / disagreement / random 从手填标签改为**实际运行的确定性 baseline 函数**（`certaintyOnlyBaselineV1` / `disagreementOnlyBaselineV1` / `randomComparatorBaselineV1`，random 冻结 seed 可重放）；
- `syntheticProperLoss` → **`preActionReferenceLoss`**（动作前 pooled 参考损失，明确不能比较治理效果）；
- 增加 **eligibility 步骤**：只有匹配冻结风险理由的候选进入 arbitration（reanalysis-only 在 source-concentrated 场景不 eligible）；
- 不模拟动作改善、不发明治理效果数字。

四场景决策验证：A→new-observation；B→first-tool（stable id 破平）；C→escalate（critical 超预算）；D→new-tool（access 优先于免费 reanalysis）。

## 4. 精确命令结果

```
git diff --check                                       → exit 0
npx.cmd tsc --noEmit                                   → exit 0
vitest (5 focused files)                               → 64 passed
vitest (full)                                          → 1590 passed | 11 skipped
npm.cmd run build                                      → exit 0
```

## 5. Red-zone / 偏离

- **无 red-zone**。所有 WP-A/WP-B 不变量均被现有 kernel 满足；无需修改 `src/**` 即可通过。无缺失→0、无 distinct→independent、无 receipt→verification 偷换。
- **无偏离**。未修改 production/core；未跳过失败测试；未放宽 timeout；未执行 git 写操作。

## 6. 真实状态声明（FACT）

- **Kernel**：`activeInformationControl.ts` 的 eligibility + completion 已实现并经 21 项对抗测试覆盖（本工作包）。
- **Production wiring**：**no**（未接入 Runner）。
- **Authoritative source resolution**：由既有上游 ledgers（`actionLifecycle.ts` 的 `GovernanceActionLedger`、epistemic evidence graph）负责；本 kernel 不充当 resolution authority。
- **Receipt 语义**：completion 证明"产生一条新的、已声明类型、绑定 terminal history 的记录"，不证明真实性或效果。
- **未建立**：empirical efficacy、MCV、multi-step stopping、跨组织普适性。

## 7. 声明

未运行真实/付费 LLM；未读取凭据；未执行 git 写操作（add/commit/reset/checkout/clean）。所有测试基于实现不变量，无 provider 调用。
