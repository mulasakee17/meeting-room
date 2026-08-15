# Claude Code 提示词：最小主动信息治理闭环（机械实现包）

Codex 已冻结并实现高风险语义：

- `src/lib/governance/activeInformationGovernance.ts`
- `src/lib/governance/activeInformationControl.ts`
- `test/active-information-control.test.ts`
- `docs/theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md`

你的任务只做中低风险的测试、fixture 和事实同步。不要修改核心 API 或 production Runner。

## 先读

1. `AGENTS.md`
2. `docs/REASONING_PROTOCOL.md`
3. 上述四个文件
4. `src/lib/governance/actionLifecycle.ts`
5. `src/lib/epistemic/evidenceGraph.ts`

不要全仓重读。

## 白名单

允许：

- `test/active-information-control.test.ts`
- 可新建 `test/active-information-control-adversarial.test.ts`
- `experiments/campaign/v6/truthBlindPolicyFixtureV1.ts`
- `test/truth-blind-policy-fixture.test.ts`
- `docs/architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md`
- 可新建 `docs/plans/CLAUDE_CODE_MINIMAL_ACTIVE_CONTROL_RESULT_2026-08-13.md`

禁止：`src/**`、Runner、schema、provider adapter、真实实验配置、package.json、artifacts、outputs、`.env*`、legacy。

## WP-A：Eligibility 对抗测试

补齐以下不变量：

1. threshold 只能在 `[0,1]`，policy 只能是 `randomized_experiment_only`；
2. candidate 必须绑定当前 eligibility ID 和同一 claim；
3. known source relation 必须在 authority snapshot，unknown 不伪装成 distinct；
4. lineage missing 只允许能新增 provenance record 的 external observation；
5. source concentration 只允许 distinct source + 非 public reanalysis；
6. disagreement 只允许能新增 evidence 的 external observation；
7. prompt sensitivity 只允许能新增 belief report 的 re-elicitation/private report；
8. high-consequence support missing 允许 evidence acquisition，但不声称当前答案错误；
9. 低风险且无匹配理由时不生成 eligible candidate，即使候选免费；
10. eligible reason 是多标签、非加权总分；candidate 输入重排不改变 eligibility artifact；
11. eligibility tamper、risk hash 漂移、authority snapshot 漂移在 selection 前拒绝。

## WP-B：Completion 对抗测试

1. 非 terminal、failed、censored、held_out 不得冒充 acquisition completed；
2. observation ID 已在 pre-action set 时拒绝；
3. observation kind 不在 candidate expected kinds 时拒绝；
4. observation 未绑定 terminal transition 时拒绝；
5. instance actionRef、targets、cost 与 candidate 漂移时拒绝；
6. public reanalysis 只能产出 `belief_report`；
7. completed lifecycle + empty observation 仍拒绝；
8. 合法 evidence / belief report / provenance record 分别通过；
9. 输入 mutation 不改变已生成的 eligibility/decision；
10. 不将 completed 写成 effective、correct、verified 或 beneficial。

若发现必须改 `src/**` 才能满足，保留最小失败测试并 STOP 返回 Codex。

## WP-C：修正 deterministic fixture

只做机械修正：

1. 外层 packet、envelope、scenario 全部 deep-freeze；
2. certainty/disagreement/random 从手填标签改成实际运行的 deterministic baseline 函数；
3. 删除或重命名当前与动作无关的 `syntheticProperLoss`。建议改成 `preActionReferenceLoss`，明确它不能比较治理效果；
4. 增加 eligibility 步骤，使只有匹配风险理由的 candidate 进入 arbitration；
5. 不模拟动作改善，不发明治理效果数字。

## WP-D：事实文档

同步 `ACTIVE_INFORMATION_GOVERNANCE_V1.md`：

- eligibility implemented/tested；
- completion invariant implemented/tested；
- production wiring no；
- authoritative source resolution 由现有上游 ledgers 负责；
- receipt 证明新记录，不证明真实性或效果；
- empirical efficacy、MCV、multi-step stopping 均未建立。

## 验收

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/active-information-governance.test.ts test/active-information-governance-adversarial.test.ts test/active-information-control.test.ts test/active-information-control-adversarial.test.ts test/truth-blind-policy-fixture.test.ts --reporter=dot
npx.cmd vitest run --reporter=dot
npm.cmd run build
git status --short
```

不存在的可选测试从命令删除。不要运行真实/付费 provider，不读凭据，不执行 git 写操作。

## Stop conditions

- 需要改变 eligibility、action lifecycle 或 truth boundary；
- fixture truth 进入 policy path；
- missing 被解释成低风险或 0；
- distinct identity 被写成 statistical independence；
- receipt 被写成 factual verification 或治理有效；
- 为了测试通过修改 production/core。

最终报告列：修改文件、每项不变量、fixture 修正、聚焦/全量/build、red-zone、偏离、真实状态声明。
