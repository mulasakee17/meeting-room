# V6 Task / Monitoring / Calibration Authority V1

日期：2026-08-11。状态：事实同步。所有主张按 FACT / DESIGN INTENT / LIMITATION 标注；只写代码或测试能支持的陈述。

## 1. Task manifest：预分配承诺（FACT）

- 实现：`experiments/campaign/v6/v6TaskManifest.ts` 的 `V6TaskManifestV1` 提交 public context（hash）、primary claim、有序 agent roster（private-information 的 hash）、resolution contract、ground-truth commitment（valueHash）、taskDefinitionHash、monitoring design ref/hash、`committedAt`、`contentHash`。
- 时序（FACT）：垂直切片校验 `v6TaskManifest.committedAt ≤ operationalAnalysisUnit.committedAt ≤ primaryAssignmentManifest.assignment.assignedAt`（`verifiedCalibrationDataset.ts` `validateV6CarrierForCalibration`）。commitment 发生在 analysis unit 与 Stage-1 assignment 之前。
- opening 校验（FACT）：`validateV6TaskManifestOpeningV1` 要求 manifest 与"正在打开的 task"逐字节一致；outcome/roster/private/public/claim 任一漂移均 fail-closed。
- 唯一性（FACT）：store 以 `linkSync` 原子发布，已存在的 manifest 不被替换（no-replace，`loadOrCreateV6TaskManifestV1`）；`readV6TaskManifestV1` 对损坏 JSON、contentHash 不符、runId 不匹配均拒绝。

## 2. Commitment 的边界（FACT + LIMITATION）

- FACT：`groundTruthCommitment.confidentiality = "integrity_only_not_hiding"`。commitment 是确定性 hash（`computeV6GroundTruthCommitmentV1`），只能证明"打开的 resolution 与预先承诺的 outcome 一致"（`validateV6TaskManifestResolutionV1`）。
- LIMITATION：commitment **不提供** confidentiality、外部时间戳、防篡改或加密。hash 是内部完整性绑定；不能防止 artifact 被整体重造，不构成外部真实性。不得将其描述为 hiding / encryption / tamper-proof。

## 3. Monitoring population 与 selection（FACT）

- 实现：`experiments/campaign/v6/monitoringDesign.ts`。
- population（FACT）：round-1、primary-claim、architecture-recorded 的 `belief_reported` 事件。
- selection（FACT）：diagnosis 之前、`seeded_uniform_one`、在 canonical report id 上、以设计内的 seedNamespace + runId + masterSeed 派生确定性 draw（`createV6MonitoringSelectionV1`）。
- 空总体（FACT）：`candidateReportIds` 为空时必须显式 `status: "empty_population"`、`selectedReportId: null`、`selectionProbability: 0`；不得发明 target 或静默跳过。
- 候选不变量（FACT）：candidate id 的输入顺序不影响选择；重复/空 id 拒绝；run/seed 不同则 seed commitment 变化。

## 4. Verified lineage measurement（FACT + LIMITATION）

- FACT：`deriveVerifiedIndependentLineageCountV1` 只统计**已验证、被 report 引用、来源为 tool/dataset/external** 的独立 lineage；agent 自报不计，多条证据共享 lineage 只计一次，未出现在 report 的 evidence 不计。
- FACT：当前 `missingLineageResult = 0`（design 冻结值），即缺少合格验证记录时计 0。
- LIMITATION：**当前生产切片没有预干预 evidence verification adapter**，因此 `verifiedIndependentLineageCount` 可能为 0。0 表示"缺失合格的验证记录"，**不是**观测到"没有独立来源"。不得把 0 解释为"无独立证据"。

## 5. Verified calibration loader（FACT + DESIGN INTENT）

- FACT：`loadVerifiedV6CalibrationDatasetV1` / `verifyV6CalibrationArtifactsV1` 是分析准入层：要求 schema-5、唯一冻结 study registry、rule registry 与 study 声明一致、taskDefinitionHash 在冻结 allowlist 内、manifest/monitoring carrier 一致、预分配时序、resolution 与 commitment 一致、assigned/trace/primary-arm protocol 一致、replay `sealed_decision_replay_verified`、usage/latency 有限。
- FACT：准入层返回深冻结对象（`Object.isFrozen`），只读；失败时不修改或删除任何磁盘 artifact。
- FACT：旧 V6 artifact（没有 task manifest / monitoring design）会被新准入层拒绝。
- DESIGN INTENT：旧 artifact 不被自动升级；准入是分析入口，不是数据迁移。
- DESIGN INTENT：`analyzeV6Calibration` 的 CLI 入口拒绝裸目录分析，禁止 bare raw JSON 直接进入分析。

## 6. 测量语义（FACT + LIMITATION）

- FACT：primary measurement 是 operational pooled Brier（ITT，π0=uniform，denominator=N_registered 不缩水）。
- FACT：task accuracy（`taskOutcome.quality`）是 secondary 投影；当 `taskOutcome.status` 为 unresolved/invalid 时 `quality` 无定义，且 unresolved/invalid 保留在状态计数与分母中，不静默过滤。
- LIMITATION：`taskOutcome` 若 unresolved，accuracy 在 scored 子集之外没有定义；calibration 表因此标注 accuracy 的 scored 覆盖。

## 7. 当前证据边界（LIMITATION）

- 当前证据只支持：kernel / vertical slice / replay-clean 的 **calibration readiness**。
- 不支持：治理有效、因果效果成立、构念效度已证实、confirmatory-ready、或 AAMAS-ready。
- 触发率观测（2026-08-11，两族真实数据）：阈值 0.65/0.7 下 G 触发 100%；触发刀锋在 0.70（agent A 首轮确定性恒 0.70），0.71+ 为 0%。健康中间触发率在当前冻结观察层 + temperature-0 模型下结构性不可达。这是 calibration 事实，不是治理效果。
