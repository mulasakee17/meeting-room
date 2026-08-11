# Claude Code CC-7：Schema-5 Operational Carrier 对抗测试与文档核验

日期：2026-08-10  
预算上限：USD 2.00  
性质：低风险机械扩测与事实同步；禁止修改生产语义

## 1. 当前已实现事实

Codex 已完成：

- `RawRunData` 可携带 `operationalAnalysisUnit` / `operationalOutcome`；
- `AuditableRawRunDataV5` 编译期强制要求二者；
- schema-5 verifier 强制缺失/结构/run/source/estimand/replay 校验；
- Stage-1 `primaryEstimandRef` 是唯一 primary-outcome 声明；
- `taskOutcome` 仍是 schema-5 **必需的 secondary accuracy projection**，不是 legacy 字段，不得删除或禁止；
- Runner 仍写 schema 4，未接 production。

当前验证基线：

- 聚焦 3 files / 168 tests：pass；
- 全量 59 files / 1209 passed / 3 skipped：pass；
- `npm run build`：pass；
- `git diff --check`：exit 0，仅既有 CRLF warning。

## 2. 白名单

允许修改且只能修改：

- `test/governance-audit-trail.test.ts`
- `test/governance-estimator-replay.test.ts`
- `docs/architecture/OPERATIONAL_OUTCOME_V1.md`

允许只读：

- `experiments/campaign/types.ts`
- `experiments/campaign/replayVerifier.ts`
- `src/lib/experimentation/operationalOutcome.ts`
- `src/lib/experimentation/finalOutcome.ts`
- `src/lib/experimentation/primaryAssignment.ts`
- `src/lib/experimentation/governanceStudy.ts`
- `docs/theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`
- `docs/plans/OPERATIONAL_OUTCOME_WIRING_GAP_AUDIT_2026-08-10.md`

禁止修改所有 `src/**`、`experiments/**`、其他测试/文档、Runner、schema 常量、configs/manifests 和生成数据。禁止真实/付费 LLM，禁止 git add/commit/reset/checkout/clean。

## 3. 冻结 issue codes

不得改名或合并：

- `missing_operational_analysis_unit`
- `malformed_operational_analysis_unit`
- `operational_analysis_unit_run_mismatch`
- `missing_operational_outcome`
- `malformed_operational_outcome`
- `operational_outcome_run_mismatch`
- `operational_outcome_source_mismatch`
- `operational_primary_estimand_mismatch`
- `operational_outcome_replay_mismatch`

已有最小测试覆盖其中主要路径。先审查，避免重复相同 fixture/篡改。

## 4. 测试工作包

### CC-7A：carrier presence 与 legacy isolation

补充尚未覆盖的边界：

1. schema 5 `operationalAnalysisUnit: null` 与 `operationalOutcome: null` 分别等同缺失；
2. schema 1–4 缺少两个字段保持可读，不产生 operational issue；
3. schema 4 即使存在 reserved operational 字段，也不得被错误当作 schema-5 authority；
4. 合法 schema-5 carrier 不产生任何 operational issue；
5. `taskOutcome` 必须继续存在并使用 `FINAL_OUTCOME_TASK_EVALUATION_V1`，但不得成为 primary estimand；
6. schema-5 旧 treatment authority 禁令保持，不要把合法 `taskOutcome` 误列为 legacy authority。

### CC-7B：analysis-unit carrier

1. analysis-unit runId 与 RawRunData.runId 不同 → `operational_analysis_unit_run_mismatch`；
2. analysis-unit contentHash、schema ref、时间、claim、roster 结构损坏 → `malformed_operational_analysis_unit`；
3. malformed analysis unit 不得导致公共 `verifyRawRunData` 抛出；
4. accessor/Proxy 等异常输入若进入顶层公共 verifier，应映射为既有 `verifier_error`，不要修改核心。

### CC-7C：source binding

分别自洽重算 operational artifact hash 后篡改：

1. `analysisUnitHash`；
2. `primaryAssignmentManifestHash`；
3. `sourceFinalOutcomeHash`。

每项都必须至少产生 `operational_outcome_source_mismatch`。允许同时产生 replay/malformed issue，但不得静默通过。

### CC-7D：primary 与 secondary 权威

1. operational `primaryMetric.metricRef` 错误/缺失/畸形 → `operational_primary_estimand_mismatch`；
2. Stage-1 `primaryEstimandRef` 与注册 v1 不一致的自洽 carrier fail-closed；如构造需要改变 assignment seed/design chain，只写最小复现并返回 Codex，不修改生产；
3. `taskOutcome.evaluationContractRef` 错误仍由既有 `task_outcome_final_evaluation_mismatch` 捕获；
4. 不得新增第三个 primary 标量或总分。

### CC-7E：deterministic replay

自洽重算 operational artifact contentHash 后，分别篡改：

- contribution value/source/status；
- terminalStatusCounts / registeredAgentCount / answeredAgentCount；
- referenceDistribution；
- pooledBelief；
- operationalProperLoss；
- primaryMetric.value/direction；
- computedAt；
- unexpected extra field。

应产生 `operational_outcome_replay_mismatch`；若篡改破坏基本结构而得到 `malformed_operational_outcome` 也可，但必须在报告解释分层原因，不能把所有断言弱化为通用 `.toThrow()`。

## 5. 文档工作包

只审查并必要时更新 `OPERATIONAL_OUTCOME_V1.md`：

- 加入稳定 issue-code 表；
- 明确 carrier/verifier yes、Runner no、external commitment no；
- 明确 `taskOutcome` 是 required secondary accuracy，不是 legacy；
- 明确 schema-5 验证只证明内部 replay，不证明外部真实性；
- 不设计 Runner/store API，不写 production-ready/confirmatory-ready。

## 6. Stop boundary

发现以下任一情况立即停止，不修改生产代码：

- 合法 carrier 无法验证；
- self-rehash 后 source/metric/contribution 篡改可静默通过；
- primary/secondary 权威无法区分；
- schema 4 被新 gate 错误拒绝；
- `verifyRawRunData` 对普通 malformed JSON-like carrier 直接抛出；
- 需要改变 issue code、estimand、π0、proper-loss 或 schema 类型；
- 需要接 Runner/store/provider。

## 7. 验证

```powershell
git diff --check
npx tsc --noEmit
npx vitest run test/governance-audit-trail.test.ts test/governance-estimator-replay.test.ts test/operational-outcome.test.ts --reporter=dot
npm run build
git status --short
```

不要求再次运行全量测试；Codex 已在本轮运行。

## 8. 最终报告

报告修改文件、新增测试及不变量、精确结果、red-zone 缺陷、偏离、kernel/production/schema/external 状态，并明确没有生产修改、付费实验和 git 操作。
