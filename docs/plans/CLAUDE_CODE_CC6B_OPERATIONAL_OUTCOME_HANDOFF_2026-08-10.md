# Claude Code CC-6B：Operational Outcome 对抗测试与事实文档

日期：2026-08-10
预算上限：USD 2.00
性质：低风险测试扩充与文档同步；不得修改核心语义

## 1. 背景与权威顺序

Codex 已完成 operational outcome v1 高风险核心。权威顺序：

1. `docs/theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`
2. `src/lib/experimentation/operationalOutcome.ts`
3. 本指南
4. 历史计划、gap audit 与其他说明文档

当前已验证基线：

- `npx tsc --noEmit`：pass；
- 聚焦 4 files / 77 tests：pass；
- 全量 59 files / 1187 passed / 3 skipped：pass；
- `npm run build`：pass；
- `git diff --check`：exit 0，仅既有 LF→CRLF warning。

## 2. 已冻结语义，不得重新设计

1. 主 estimand 是 `swarmalpha.estimand.operational-pooled-brier@1.0.0`。
2. 其规范所有者是 Stage-1 `PrimaryAssignmentDesignV1.primaryEstimandRef`；assignment manifest 在随机分配前后链路中承诺设计快照与 hash。
3. v1 只支持每 run 一个 primary binary/categorical claim。
4. `π0` 不由 caller 提供；v1 必须从 pre-assignment primary claim 的 outcome space 确定性派生 uniform reference：binary 为 `0.5`，categorical 为每项 `1/K`。
5. `OperationalAnalysisUnitV1` 必须在 assignment 前承诺：`runId`、`taskId`、`studyRef`、完整 `primaryClaim`、有序且唯一的 `expectedAgentIds`。
6. answered 使用实际 final probability；abstained/invalid/unavailable 数值上使用 `π0`，但 terminal identity 必须分别保留。
7. 分母永远是 pre-assignment roster 的全部 Agent，不能按回答者缩小。
8. `OperationalOutcomeArtifactV1` 必须绑定 analysis-unit hash、primary-assignment-manifest hash、assigned arm、final-outcome hash。
9. primary metric 是 operational proper loss；当前支持的 binary/categorical claim contract 均为 Brier。现有 `FinalClaimOutcome.pooledProperLoss` 保持 answered-only secondary，不得改名或替换。
10. validation 必须通过冻结输入进行 deterministic replay；只重算 artifact 自身 hash 不能使篡改通过。
11. 该内核只证明内部一致与 replay，不证明外部时间戳、真实性或 tamper-proof。
12. Runner 尚未接线，schema-5 尚未携带/验证 operational outcome；不得写成 production-ready。

## 3. 白名单

允许修改且只能修改：

- `test/operational-outcome.test.ts`
- 新建 `docs/architecture/OPERATIONAL_OUTCOME_V1.md`

允许只读：

- `src/lib/experimentation/operationalOutcome.ts`
- `src/lib/experimentation/finalOutcome.ts`
- `src/lib/experimentation/primaryAssignment.ts`
- `src/lib/experimentation/governanceStudy.ts`
- `src/lib/epistemic/contracts.ts`
- `src/lib/epistemic/scoring.ts`
- `test/final-outcome.test.ts`
- `test/primary-assignment.test.ts`
- `docs/theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`
- `docs/plans/OPERATIONAL_OUTCOME_VERTICAL_SLICE_GAP_AUDIT_2026-08-10.md`

禁止修改：

- 所有 `src/**`；
- 所有 `experiments/**`；
- 除白名单外的测试和文档；
- schema version、Runner、replay verifier、configs、manifests、生成数据；
- `.env*`、凭据或 provider 配置。

禁止 git add/commit/reset/checkout/clean，禁止移动、删除或格式化无关文件，禁止真实或付费 LLM 实验。

## 4. CC-6B-A：补充对抗测试

先检查现有测试，避免重复。新增测试至少覆盖：

### A. Analysis unit contract

1. 缺字段、额外字段、空 run/task/study ref 拒绝；
2. 重复、空或空数组 roster 拒绝；
3. primary claim 在 `committedAt` 后创建拒绝；
4. 非 canonical timestamp 拒绝；
5. contentHash 篡改拒绝；
6. 自洽重算 analysis-unit hash 后更换 roster、task、claim 或 study，在 operational replay 边界仍拒绝；
7. caller 不能通过 claim option 顺序/内容篡改改变 categorical `π0` 后仍通过；
8. sparse array、NaN/Infinity、function、class instance、cycle 等非 canonical carrier fail-closed；如现有 public boundary 已由 `structuredClone` 或 canonicalizer 稳定拒绝，只断言实际边界，不添加生产代码。

### B. Frozen estimand and missingness

1. wrong `primaryEstimandRef` 即使 manifest 自洽也拒绝；
2. contract 增删字段、改 missingness/pooling/reference policy 拒绝；
3. answered/abstained/invalid/unavailable 四状态同时出现时：身份计数分别保留，分母等于完整 roster；
4. all-unanswered binary 和 categorical 均产生有限 loss；
5. categorical uniform reference 严格按 canonical option 顺序输出；
6. 不得存在 caller-supplied `π0` 路径；可用类型或源码断言，但不要写脆弱的整文件字符串快照。

### C. Source binding and replay

1. analysisUnit run/study/task/claim/roster mismatch 分别拒绝；
2. manifest run/study/assignment mismatch 拒绝；
3. primaryAssignmentId、assignedArmRef、manifest hash、analysis-unit hash、source-final-outcome hash 任一篡改拒绝；
4. 篡改 contribution、status count、reference distribution、pool、proper loss、primary metric 后把 artifact `contentHash` 自洽重算，仍因 deterministic replay 拒绝；
5. `computedAt` 早于 final scoring 拒绝；analysis-unit commitment 晚于 assignment 拒绝；manifest 晚于 discussion completion 拒绝；
6. unexpected artifact fields 不得被静默接受；
7. 验证返回对象/输入对象的 mutation isolation，只在当前 API 明确承诺 clone 时断言，不自行发明 deep-freeze 语义。

测试要求：

- 断言 public invariant，而非私有函数实现细节；
- 对浮点使用 `toBeCloseTo`；
- 不弱化既有断言；
- 不使用任意 sleep、随机网络调用或真实 provider；
- 发现 production defect 时停止，不修改 `src/**`，写最小复现并返回 Codex。

## 5. CC-6B-B：架构事实文档

新建 `docs/architecture/OPERATIONAL_OUTCOME_V1.md`，至少写清：

1. 研究问题与为何 answered-only 会产生 post-treatment selection；
2. 五个权威对象：analysis unit、Stage-1 estimand ref、final outcome、operational outcome、schema carrier（后者尚未接入）；
3. v1 公式与 binary/categorical `π0`；
4. 四 terminal statuses 的相同数值 fallback 与不同语义；
5. 生命周期与时间顺序；
6. hash/replay binding；
7. answered-only pooled loss、accuracy taskOutcome 与 operational primary metric 的不同角色；
8. 当前实现状态：kernel yes，Runner no，schema-5 carrier no，external commitment no；
9. 明确 claim ceiling：不能声称 tamper-proof、production-ready、测量有效、治理有效或 latent belief；
10. 下一接线边界，但不得替 Codex设计 Runner/schema-5 API。

禁止复制大段代码；文档必须以接口、公式、不变量和当前状态为主。

## 6. 验证

依次运行：

```powershell
git diff --check
npx tsc --noEmit
npx vitest run test/operational-outcome.test.ts test/final-outcome.test.ts test/primary-assignment.test.ts test/governance-study-contract.test.ts --reporter=dot
npm run build
git status --short
```

不要求再次运行全量测试；Codex 本轮已经运行全量。若修改只限测试/文档且聚焦验证通过，返回 Codex 复审即可。

## 7. 最终报告格式

1. 修改文件；
2. 每个新增测试保护的不变量；
3. 精确测试数量、耗时与 build 结果；
4. red-zone 缺陷或最小复现；
5. 与指南的偏离；
6. 文档中的 kernel/production/schema/external-commitment 状态；
7. 未解决的高风险任务；
8. 明确声明未修改生产代码、未运行付费 LLM、未提交代码。

## 8. Stop boundary

遇到下列任一项立即停止编辑并返回 Codex：

- 需要改变 `π0`、proper loss 或 missingness estimand；
- 需要允许 caller-supplied/nonuniform reference；
- 需要改变 primary claim 数量；
- 需要改变 analysis-unit/assignment/final-outcome 的所有权或时序；
- 需要修改 public API、Runner、schema-5 carrier/verifier；
- 发现 roster、claim、assignment 或 final outcome 可在 self-rehash 后绕过 replay；
- 发现 operational primary metric 与 answered-only/accuracy 双重冒充主权威；
- 发现 truth/private information 泄漏。
