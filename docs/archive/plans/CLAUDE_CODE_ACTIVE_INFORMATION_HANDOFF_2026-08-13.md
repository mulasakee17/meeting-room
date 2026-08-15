# Claude Code 执行提示词：无即时真值主动认知治理（中低风险工作包）

下面整段可以直接交给 Claude Code。Codex 已完成理论边界、公共对象和核心选择语义；你的职责是测试加固、机械 fixture、事实同步和只读盘点。不要修改核心算法。

---

你正在 SwarmAlpha 仓库中完成一个**有界、低至中风险、可独立验收**的后续工作包。先阅读：

1. `AGENTS.md` 中 `Persistent research-direction lesson`；
2. `docs/REASONING_PROTOCOL.md`；
3. `docs/theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md`；
4. `src/lib/governance/activeInformationGovernance.ts`；
5. `test/active-information-governance.test.ts`。

不要全仓重读。只在遇到确切类型依赖时读取 `src/lib/epistemic/collectiveState.ts`、`src/lib/epistemic/types.ts` 和 `src/lib/governance/controlContracts.ts`。

## 目标

加固 truth-blind 在线动作边界，并提供一个**零 provider、零付费、离线真值严格隔离**的确定性策略比较 fixture。不得宣称治理有效。

## 白名单

允许新建或修改：

- `test/active-information-governance.test.ts`
- 可新建 `test/active-information-governance-adversarial.test.ts`
- 可新建 `experiments/campaign/v6/truthBlindPolicyFixtureV1.ts`
- 可新建 `test/truth-blind-policy-fixture.test.ts`
- 可新建 `docs/architecture/ACTIVE_INFORMATION_GOVERNANCE_V1.md`
- 可更新 `docs/ACTIVE_RESEARCH_SURFACE.md`，但只能做与实际实现一致的状态同步
- 可新建 `docs/plans/CLAUDE_CODE_ACTIVE_INFORMATION_HANDOFF_RESULT_2026-08-13.md`

禁止修改 `src/**`、production vertical slice、raw schema、Runner、provider adapter、package.json、真实实验配置、既有 artifacts/outputs、`.env*`、凭据和 legacy runtime/E12/thermodynamics。

## 工作包 A：对抗测试

至少覆盖：

1. online risk 或 action selection 输入携带 `groundTruth`、`correctAnswer`、`resolverOutcome` 或任意额外字段时 fail-closed；
2. prompt sensitivity 缺失保持 missing，不是 0；
3. lineage partial / missing 不发数值 concentration；
4. verified-distinct identity 只影响冻结排序，不产生 independent、expected value 或 correctness 字段；
5. public-only reanalysis 即使免费，也排在可负担的 new observation 后；
6. 超预算、unavailable、跨 claim candidate 不可被选择；
7. 候选数组重排不改变结果；同级候选按 cost、latency、stable ID 确定；
8. high/critical 无可行动作时 escalate；low/moderate 时 abstain；
9. selected / abstain / escalate 可重放，source hash、budget、candidate 或 selectedAction 篡改后拒绝；
10. unexpected fields、NaN、Infinity、sparse array、duplicate IDs、空字符串和错误 enum fail-closed；
11. 返回值深冻结且与输入 mutation 隔离。

不要为了测试通过修改生产核心。发现 red-zone 缺陷时保留最小失败测试并停止相关工作。

## 工作包 B：确定性离线策略 fixture

实现纯函数 fixture，禁止网络/provider。严格分为：

- `PolicyVisiblePacket`：只含 `OnlineEpistemicRiskV1`、candidates、budget、frozen policy ID；不得含 outcome/truth/correctAnswer/resolver/loss。
- `EvaluatorOnlyEnvelope`：只在 decision 完成后接收 synthetic outcome 与 frozen utility contract；不得传入选择函数或被闭包捕获。

构造四个确定性场景：共享 lineage 且存在新外部观察；高分歧但来源已 distinct；高后果且全部超预算；public reanalysis 很便宜但新工具才带来新 observation。

fixture 可输出选择、成本、abstain/escalate 和 evaluator 揭示后的 synthetic loss，但必须标 `DETERMINISTIC FIXTURE`，不得称实验结果。certainty-only、disagreement-only、random comparator 只能在 fixture 中作为 baseline；random 使用冻结 seed 并可重放。

## 工作包 C：事实文档

新建 `ACTIVE_INFORMATION_GOVERNANCE_V1.md`，只陈述：prompt-conditioned report 不等于 latent belief；在线/离线 truth firewall；风险向量不合成总分；distinct identity 不等于 statistical independence；public reanalysis 不等于 independent verification；source-novelty 是 heuristic 而非 MCV/optimal router；kernel implemented/tested，但 production wiring、真实效果、MCV、qualified unsupportedness 均未建立。

严格使用 FACT / DESIGN INTENT / HYPOTHESIS / LIMITATION。禁用 production-ready、AAMAS-ready、improves accuracy、ground-truth-free validation、independent sources。

## 工作包 D：只读迁移盘点

只读搜索 `verifiedIndependentLineageCount`、`verified-independent-lineages`、`independent verification` 和 public-only verifier 描述。在报告中列文件、符号、当前含义、是否进入 replay/schema、机械改名风险和版本化迁移建议。不得修改这些生产符号。

## 验收

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/active-information-governance.test.ts test/active-information-governance-adversarial.test.ts test/truth-blind-policy-fixture.test.ts --reporter=dot
npx.cmd vitest run --reporter=dot
npm.cmd run build
git status --short
```

若可选测试文件未创建，从聚焦命令移除。不要跳过失败或放宽 timeout。

## Stop conditions

- policy packet 能访问/推断 evaluator truth；
- truth-like extra field 未被公共边界拒绝；
- unknown lineage 被算作独立；
- missing 变成 0；
- public reanalysis 被称为 independent verification；
- candidate 顺序改变决策；
- replay 接受自洽篡改；
- 必须修改 `src/**`、schema 或 Runner 才能继续。

## 最终报告

列出修改文件、每项测试不变量、policy/evaluator 隔离证据、聚焦/全量/build 结果、red-zone、偏离、遗留术语盘点、kernel/production/empirical/MCV 状态，并声明未运行真实/付费 LLM、未读凭据、未执行 git 写操作。

不要执行 `git add/commit/reset/checkout/clean`。

---

## Codex 保留任务

1. 审核对抗测试和 fixture 的真值隔离；
2. 设计 `verifiedIndependentLineageCount` 的版本化 V3 迁移；
3. 冻结首个真实动作 adapter；
4. 冻结 compute-matched 随机实验、primary estimand 和 delayed-outcome 更新；
5. 审核后才决定是否接 production vertical slice；
6. 真实结果前不建立 MCV 学习器和社会热力学控制器。
