# Claude Code 提示词：V6 Authority 文档事实清理

预算上限：USD 2.00。任务仅限机械性文档同步，不得修改生产代码、测试、schema、配置或数据。

## 可直接执行的提示词

先阅读 `AGENTS.md` 与 `docs/REASONING_PROTOCOL.md`。只读核对：

- `experiments/campaign/v6/productionVerticalSlice.ts`
- `experiments/campaign/v6/monitoringDesign.ts`
- `experiments/campaign/v6/verifiedCalibrationDataset.ts`
- `experiments/campaign/v6/analyzeV6Calibration.ts`
- `test/v6-authority-adversarial.test.ts`

允许修改的文件只有：

- `docs/architecture/V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1.md`
- `docs/plans/V6_CALIBRATION_PILOT_TABLE_2026-08-11.md`
- 本提示词文件（仅附加最终报告）

完成以下事实同步：

1. 在 authority 文档中记录当前实现的 `validateV6MonitoringAuditBindingV1`：
   - 非空 selection 必须绑定恰好一个 governance `belief_report` source event；
   - source payload 的 report/claim/agent/probability/evidence count/selection hash 必须与 selected epistemic report 和 interaction trace 一致；
   - `selectedAt` 不得早于完整候选总体形成，source `recordedAt` 不得早于 selection；
   - `empty_population` 不得产生 governance belief source event；
   - 这些约束只证明 artifact 内部跨 carrier 一致性，不证明外部时间真实性，也不能阻止攻击者整体重造 artifact 链。

2. 修正 authority 文档末尾的历史触发率表述。旧 `v6-smoke-cal*` / `v6-network-fault-cal` artifact：
   - 产生于固定 Agent A 监测逻辑；当前实现已改为 seeded uniform selection；
   - 缺少当前 task manifest / monitoring design 权威 carrier，因此会被新 verified calibration admission 拒绝；
   - 只能标记为 `LEGACY OBSERVATION`，不得作为当前 V6 threshold、触发率或 go/no-go 的可准入证据；
   - “Agent A 恒为 0.70、健康触发率结构性不可达”不得继续写成当前设计事实。

3. 更新 `V6_CALIBRATION_PILOT_TABLE_2026-08-11.md` 的陈旧 API：
   - 删除已不存在的 `analyzeV6RawRun(artifact)`；
   - 单 run 分析入口是 `analyzeVerifiedV6Run(record)`，只接受 verified branded record；
   - 目录入口是 `analyzeV6CalibrationDir(dir, spec)`，必须提供冻结的 dataset spec；
   - 数据必须先经 `loadVerifiedV6CalibrationDatasetV1` / `verifyV6CalibrationArtifactsV1`；
   - 旧表中真实数据基线整体改标为 legacy/pre-authority，不得与当前-schema calibration 混合。

4. 不删除历史数字，但必须把它们与当前权威证据明确隔离。不得发明新运行结果，不得声称 confirmatory-ready、治理有效或 AAMAS-ready。

验收：`git diff --check`、`npm.cmd exec -- tsc --noEmit`。文档任务不得运行真实/付费 LLM，不得读取凭据，不得执行 git 写操作。最终报告列出逐项修改、事实来源和任何无法核实的历史主张；如发现代码/文档的新冲突，只报告给 Codex，不修改生产代码。
