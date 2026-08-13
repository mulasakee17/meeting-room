# Measurement Validity v1 — 实现事实文档

日期：2026-08-12。状态：**IMPLEMENTED_BUT_NOT_CODEX_ACCEPTED**（确定性测试全部通过；尚未经 Codex 审核验收）。NOT RUN（无真实数据）。

## 范围

按 `MEASUREMENT_VALIDITY_PROTOCOL_V1.md` 实现 experiment-level authority（`EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`），**不修改 raw schema-5**。调用前 Design/Freeze 固定设计与注册分母；调用后 ResultIndex 绑定每个 cell 的 runId / terminal status / source hashes。

## 实现模块

| 文件 | 内容 |
|---|---|
| `experiments/campaign/measurement/measurementValidity.ts` | Design/Freeze/ResultIndex 对象、validators、canonical hashing、no-replace store、read/replay |
| `experiments/campaign/measurement/measurementValidityAnalysis.ts` | 确定性分析内核 + cluster bootstrap + Gate 状态机 |
| `test/measurement-validity.test.ts` | 65 项确定性对抗测试（36 项测试矩阵 + 9 项必需额外 + 20 项 Codex P0 红灯） |

## 权威语义（IMPLEMENTED）

- Design：base-task/variant 映射、option 双射、evidence ladder（≥3 级、唯一有序、target 一致）、registered cells、condition assignment 早于 provider boundary、accepted semantic review、leakage-group 隔离。
- Freeze：只承诺设计 + registered cells + 分析方法 + 冻结阈值；**不得包含未来 raw/final hash**。
- ResultIndex：cell 集与 Freeze 完全一致；全部 cell terminal 后才可 seal；绑定 runId/terminal/hashes；no-replace；**不提供外部时间戳/签名/真实性**。
- Analysis：coverage、base-2 JSD、TV、tie-aware argmax、paraphrase stability、option equivariance（先映回 canonical）、directional/strength response、SNR（含分子分母）、Brier delta、cluster-equal-weight percentile bootstrap、Gate Q0–Q3（非补偿式）。

## TESTED

65 项确定性对抗测试全部通过，命令：`npx.cmd vitest run test/measurement-validity.test.ts --reporter=dot --maxWorkers=1`（65/65）。覆盖：

- 36 项测试矩阵（B1–B5）；
- 9 项必需额外（Freeze 无未来 hash、ResultIndex 不全 terminal 不 seal、cell 集不可增删、measurement role 隔离、G 不能静默继承 Q1、natural-log JSD 闭式识别、permutation 允许概率变化、pair coverage 低于 Gate 仍算 complete-block 但不 GO、无外部真实性声明）；
- 20 项 Codex P0 红灯测试（P0-D 清单：singleton cluster bootstrap 非退化、partial argmax agreement=0、all-metrics-disabled 不 GO、null cluster/CI 不 GO、relaxed threshold 无效、Freeze/Design 漂移拒绝、ResultIndex hash 漂移拒绝、同目录 ResultIndex 不碰撞、existing-artifact 冲突拒绝、create callback 恰一次、failure cell 无伪造 hash、source hash 与实际 artifact 不一致拒绝、pair option-set drift 拒绝、非归一化概率拒绝、两级 Spearman 拒绝、binary Brier 不 fallback、Q3 方向反转不通过、unvalidated-freeze 在 Gate 层 fail-closed 等）。

全量验证亦通过：`npx.cmd vitest run`（1465 passed / 11 skipped）、`npx.cmd tsc --noEmit`、`npm.cmd run build`、`git diff --check`。

## Codex P0 复核修复（2026-08-12 晚，FACT）

在本轮复核中发现并修复三个实现缺陷，均为既有代码真实行为，非新增功能：

1. **no-replace store 写/读路径不一致**（P0-A.2）：`loadOrCreate` 曾以人类可读 kind（如 `measurement design`）作文件后缀名，而公开 `resolve*Path` 以 `measurement-design.v1` 作后缀，导致写入成功但读取路径不同、永远读不到。已拆分 `kind`（错误标签）与 `pathKind`（文件名后缀）并对齐公开 resolver；三份 status docs 中 `sealed-then-rewrite`、`collision-free`、`read isolation` 测试由此从失败转绿。
2. **firstProviderAt 边界过松**（P0-A.3）：`validateResultIndexAgainstFreezeV1` 原先只拒绝 `firstProviderAt < freezeAt`，等于 freeze 时刻也放行；已改为严格晚于（`<=` 拒绝）。
3. **Gate 未校验 Freeze**（P0-C.1）：`evaluateMeasurementGateV1` 原先直接信任传入 freeze 的 thresholds/applicableMetrics；已在该函数入口调用 `validateMeasurementValidityFreezeV1` fail-closed，未验证的 freeze 与伪造阈值无法进入判定。

以上修复均在 `experiments/campaign/measurement/measurementValidity.ts`、`measurementValidityAnalysis.ts` 与 `test/measurement-validity.test.ts` 内，未触碰 raw schema-5。

## NOT RUN / LIMITATION

- 无真实 provider 调用（零付费）；无真实 `MeasurementValidityFreezeV1` 产出；sealed held-out 未开封；无经验效度判定（Q0–Q3 未在真实数据上判定）。
- ResultIndex 是仓库内完整性锚定；外部事前承诺需 detached manifest / trusted timestamp / signature（v1 未实现）。
- 设计层无法仅凭 variant hash 检测"paraphrase 改变语义"或"option map 漏项"（需 base claim 的 option 集）；漏项由分析层 `optionEquivarianceV1` 映射漂移 fail-closed。
- 状态为 **IMPLEMENTED_BUT_NOT_CODEX_ACCEPTED**：确定性测试与全量验证通过，但尚未经 Codex 审核验收；本文档所有实现主张以通过测试为准，不宣称已获 Codex 批准。

## LIMITATION（claim ceiling）

本实现只建立确定性 authority 与可执行分析；它不证明任何报告是有效测量、任何 detector 有效、任何治理有效，也不提供 latent belief 或外部真实性。
