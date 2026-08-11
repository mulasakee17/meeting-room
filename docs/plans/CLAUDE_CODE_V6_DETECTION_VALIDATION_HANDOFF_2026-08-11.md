# Claude Code handoff: V6 detector-validation truth sync

日期：2026-08-11。预算上限：USD 2.00。任务性质：低风险、文档事实同步；不得设计或修改核心语义。

## 1. 唯一目标

依据已经冻结的实现与测试，新建：

- `docs/architecture/V6_DETECTION_VALIDATION_V1.md`

只允许创建上述文件。不得修改任何其他文件，不得执行真实或付费 LLM，不得执行 git 写操作。

## 2. 最小必读上下文

只读以下文件：

1. `docs/REASONING_PROTOCOL.md`
2. `experiments/campaign/v6/detectionValidation.ts`
3. `test/v6-detection-validation.test.ts`
4. `experiments/campaign/v6/verifiedCalibrationDataset.ts`
5. `docs/architecture/V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1.md`

不要重读仓库，不要依据 README、旧计划或论文叙述提升主张。

## 3. 必须准确写明的事实

- Agent 给出的 probability 是显式自报；`reportedCertainty = max(p, 1-p)` 是确定性几何投影，不是潜在内心信念。
- `verifiedIndependentLineageRecordCount` 只统计满足限定条件的 verification records，不代表真实世界中独立来源的数量。
- `thresholdSatisfied`、`operationalRiskPredicate`、`recordedRuleEligible` 是三个不同量：阈值满足、操作性风险谓词、考虑 verifier availability 后的规则准入。
- 风险谓词不是 false-belief oracle，也不直接等于错误、误校准或应受惩罚。
- final binary resolution 仅在事后提供 truth label；不得泄漏到在线 observation、diagnosis、selection 或 eligibility。
- 主验证量是 report-level Brier loss，以及被标记组与未标记组的加权 Brier 差；正差只表示冻结谓词标记了较高 proper loss 的报告。hard `correct / incorrect / tie` 以及 precision / recall / specificity 只是次级诊断。
- monitoring selection 在干预前发生；汇总使用 inclusion probability 的倒数权重。说明这是已冻结抽样设计下的描述性校正，不自动解决任务抽样、模型抽样或外部效度。
- 汇总拒绝混合 calibration domain、混合 allocation mode 和重复 runId。
- `calibrationDomainHash` 绑定 task family、binary belief kind、monitoring design ref/hash、rule ref/config 与 discussion adapter contract；跨域不能直接合并。
- 输出状态严格为 `descriptive_calibration_only`，不是因果估计或 confirmatory 证据。
- 只有从 verified schema-5 artifact 当场投影出的记录带进程内 source-bound brand；序列化会丢失该 brand，持久化记录必须重新绑定源 artifact 后才能用于权威汇总。
- `contentHash` 只支持内部完整性重放，不提供外部真实性、防伪造或时间戳真实性。
- 当前没有 threshold fitting、held-out validation、置信区间、production calibration 或 detector-accuracy 结论。

## 4. 文档结构

至少包含：

1. Scope and claim ceiling
2. Authority chain
3. Quantity semantics table（source / formula / role / prohibited interpretation）
4. Sampling and estimand
5. Replay and source-binding boundary
6. Validity threats
7. Evidence required before threshold freeze

逐节使用 `FACT`、`DESIGN INTENT`、`LIMITATION` 标签。禁止使用 `production-ready`、`calibrated`、`accurate`、`causal`、`tamper-proof` 或 `AAMAS-ready`。

## 5. 验收

完成后运行：

```powershell
git diff --check -- docs/architecture/V6_DETECTION_VALIDATION_V1.md
npm.cmd exec -- tsc --noEmit
npm.cmd exec -- vitest run test/v6-detection-validation.test.ts --reporter=dot
```

最终报告需列出：修改文件、逐条事实映射、任何无法由代码支持的主张（应删除而非保留）、验证结果，并明确未运行真实/付费 LLM、未执行 git 写操作。
