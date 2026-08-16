# V6 Verification Verdict：任务簇隔离复验结果（DEFER）

状态：**FACT REPORT — 冻结 task-heldout exploratory replication，已执行、已 replay、已按冻结 gate 分析**。
日期：2026-08-14（执行与复验分析完成日；计划 createdAt 为 2026-08-13T10:00:00.000Z）。
结果：**DEFER = true**。当前证据不足以认定治理效果。

## 0. 结论先行

FACT：在冻结的 HiddenBench task-heldout、DeepSeek、prompt 与 eligibility 条件下，本轮 eligible 事件上 observed `mean(final pooled Brier | apply) − mean(final pooled Brier | holdout) = +0.0985`，且 task-cluster bootstrap 95% 区间上界为 `+0.7424`（≥ 0）。

按冻结 DEFER gate（见 §5），方向条件与区间条件均不满足，`DEFER = true`。

允许的最强结论仅为：
> “Task-heldout replication is DEFER；当前证据不足以认定治理效果。”

本轮**不构成**“在冻结条件下观察到方向稳定的 pooled-Brier 改善”；相反，observed 方向为 apply 更差（Brier 更高）。

---

## 1. FACT

### 1.1 冻结计划 / hash / commit 状态

- 计划 `experiments/campaign/v6/v6_verdict_task_heldout_replication_v1.plan.json`：
  - `contentHash = sha256:354b7774eced442f79ce9754d591b7087ae224d4e328ac7985d0651d65c397de`
  - 在 `--plan` 零 provider 模式中由冻结 runner 重建，与磁盘文件一致（no-replace 成立）。
- manifest `v6_verdict_task_heldout_replication_v1.manifest.json`：
  - `contentHash = sha256:f497bae5602c4afbfc311e79be841d5cfe82cb9ae9925dcad71f2c766814c731`
  - `--plan` 重建一致，无 no-replace 冲突。
- 以上 plan/manifest、runner、analyzer、测试与设计文档当前均为 **untracked working-tree 文件**（git 未提交），工作区 HEAD = `ae132df`（“chore: quarantine legacy campaign debug scripts”）。冻结权威由磁盘上的 no-replace 内容与 `--plan`/测试的确定性重建共同锁定，而非 commit。
- 设计文档顶部状态已更新为 **REACTIVATED FOR MINIMAL MECHANISM REPLICATION**（owner 决策），研究问题、任务、seed、模型、prompt、allocation、预算与分析口径未改变。
- 冻结属性（`--plan` 输出与测试确认）：`profile=mechanism-verdict-v2-v1`、`certaintyThreshold=0.7`、`stage2Allocation apply .50 / sham .25 / holdout .25`、`verificationResponseContract=verdict_json_v2`、`providerModelRef deepseek:deepseek-chat 1.0.0`、`providerInvocationConfigHash=sha256:6d3ec329…d2733`、`maxProviderCalls=1300`、`maxTotalTokens=1600000`、`eligibleEventMasterSeed=0`、8 frozen task × 12 G replicates = 96 runs、run identity 唯一（96/96）。
- 计划中不包含 ground truth、correct answer、final outcome 或 final loss 字段（关键字扫描 0 命中）。

### 1.2 执行与 replay 计数

- 计划 runs：96。
- 完成 artifacts：**96/96**（`*.raw-run.v5.json` 计数 96）。
- missing：**0**。
- replay：`verifyRawRunData` 零 issue，`governanceAuditStatus=sealed_decision_replay_verified`，`verified=96, expected=96`，退出码 0。
- 独立 V2 safety check（覆盖全部 96 artifacts）：**0 issue**。

### 1.3 Provider 计量（预算口径）

- 顺序执行、单次调用、无 retry、无 mid-run adaptation。
- `calls = 1191`（上限 1300，未触顶）。
- `tokens = 1,356,064`（上限 1,600,000，未触顶）；其中 prompt=1,128,018，completion=228,046。
- provider 计量口径一致性：预算 `tokenCount=1,356,064` 等于 96 个 run `taskOutcome.cost.totalTokens` 之和。
- 合计 provider latency（各 run `cost.totalLatencyMs` 之和）：2,541,050 ms ≈ 42.4 分钟（wall-clock 口径，含顺序排队）。
- `invalidOrFailed` 合计：92（按冻结 `reference_distribution_for_non_answered` 规则保留其 terminal 身份，不作重试替换）。

### 1.4 分臂数量与任务簇覆盖

| arm | runs | task clusters | 覆盖任务（runs） |
|---|---:|---:|---|
| apply | 30 | 7 | task5(1), task14(7), task21(6), task57(3), task61(6), task64(6), task65(1) |
| sham | 9 | 6 | task5(1), task14(1), task57(1), task61(1), task64(3), task65(2) |
| holdout | 14 | 6 | task14(4), task21(1), task57(2), task61(5), task64(1), task65(1) |
| ineligible | 43 | 6 | task5(10), task7(12), task21(5), task57(6), task64(2), task65(8) |
| 合计 | 96 | — | 8 |

eligible = apply + sham + holdout = **53**；ineligible = 43；eligible 率 = 53/96 ≈ 0.552。task 7 全部 12 个 run 为 ineligible；task 5 仅 2/12 eligible。

### 1.5 每臂 pooled Brier 与 accuracy

| arm | n | mean pooled Brier | mean accuracy | totalTokens | invalidOrFailed/run |
|---|---:|---:|---:|---:|---:|
| apply | 30 | **0.9287** | 0.4333 | 396,979 | 0.77 |
| sham | 9 | **0.7649** | 0.5556 | 112,162 | 1.33 |
| holdout | 14 | **0.8302** | 0.5000 | 154,195 | 1.36 |

### 1.6 Primary estimand（eligible G events）

- observed point estimate（主估计量）：
  `mean(apply) − mean(holdout) = +0.0985`。
- task-cluster bootstrap（10,000 次确定性 percentile bootstrap，seed = plan contentHash，单位 = task cluster）：
  - bootstrap median = **+0.1348**（仅报告，不替代 observed estimand）；
  - 95% CI = **[−0.3697, +0.7424]**；
  - valid fraction = **1.0000**。

### 1.7 完整 DEFER gate 逐项结果

| # | 条件 | 判定值 | PASS/FAIL |
|---|---:|---|---|
| 1 | missing runs > 0 | missing = 0 | PASS |
| 2 | apply n < 10 | 30 | PASS |
| 3 | holdout n < 10 | 14 | PASS |
| 4 | apply task clusters < 6 | 7 | PASS |
| 5 | holdout task clusters < 6 | 6 | PASS |
| 6 | bootstrap valid fraction < 0.95 | 1.0000 | PASS |
| 7 | observed naive apply−holdout 非有限 | 有限（0.0985） | PASS |
| 8 | observed naive apply−holdout ≥ 0 | 0.0985 ≥ 0 | **FAIL → DEFER** |
| 9 | bootstrap 95% upper bound ≥ 0 | 0.7424 ≥ 0 | **FAIL → DEFER** |

`DEFER = true`（条件 8、9 未通过）。分析器输出 `DEFER: true (observed naive apply-holdout>=0; bootstrap 95% upper bound>=0)`；不输出 GO / effect-established / governance-effective。

### 1.8 Secondary（仅解释，不授权机制结论）

- apply − sham = **+0.1638**（apply 更高/更差）。
- sham − holdout = **−0.0653**（sham 低于 holdout；n=9，样本小，仅辅助）。
- apply V2 verdict 分布：`supported=4`、`contradicted=7`、`insufficient_evidence=19`（合计 30）。

### 1.9 Truth / private leakage 检查（执行后独立复核）

- 每个 artifact 的 `v6TaskManifest.groundTruthCommitment` 仅含 `valueHash`（sha256）与 `confidentiality: integrity_only_not_hiding`；该承诺和 `resolutionContract`（`resolver:hiddenbench-data-…` 引用）都不向行动阶段暴露答案。
- raw-run 在动作与 final elicitation 完成后会合法记录 `v6InteractionTrace.epistemicEvents[].claim_resolved.resolution.outcome` 以及 `finalOutcome.resolutions`，以支持离线评分和 replay。因此防火墙声明是**时序与请求可见性边界**，不是“最终 artifact 不含 resolved outcome”。
- 对 pre-action state、assignment、verification request/delivery 与 final-elicitation request 的检查未发现 ground truth/correct-answer 值进入模型可见载荷；原“全 artifact truth-like string 字段命中 = 0”不能证明该命题，现予撤回。
- V2 safety（96/96 artifacts）：apply 30/30 为单一 V2 verification-result 事件（version 2.0.0、evidenceScope=public_only、verdict 在冻结枚举内、无 forbidden 字段、governance transcript 匹配）；sham 9/9 为 V1 matched-control 事件（version 1.0.0、无 verdict / 无 evidenceScope 权威、固定 matched-control 文本）；holdout 14/14 无任何 verification-result 事件且存在 `eligible → held_out` 转换。
- ground truth 仅在动作与 final elicitation 完成后用于 claim resolution、离线评分（`operationalOutcome.primaryMetric` / `taskOutcome.quality`）及其审计落盘。

### 1.10 Red-zone

无 red-zone 触发：无 ≥5 无法完成 run、无 provider/token 预算停机、无 replay failure、无 plan/hash mismatch、无 truth/private leakage、无 V2 authority violation、无 schema/contract mismatch。

---

## 2. INFERENCE

- 在本轮冻结条件下，随机分配的 public-only verification verdict（apply）相较 holdout 的 observed pooled-Brier 差为 **正值**（+0.0985），即 apply 组的 final private Brier 更高。这与开发批次探索性信号（`[-0.5813, 0.0033]`，方向偏好 apply）**方向相反**。这是事实层面描述，不代表机制已“无效”或“有害”。
- bootstrap 95% CI `[−0.3697, +0.7424]` 包含 0 与正值，说明在任务簇层面噪声范围内无法排除 apply 持平或更差；也因此**不能**支持方向稳定的改善。
- sham（n=9）meanBrier（0.7649）低于 holdout（0.8302），但 sham 样本量小、sham 对比仅 secondary，不足以形成任何注意力效应结论；且 sham 不能排除“所有注意力效应”。
- 因 gate 8、9 未通过，按冻结规则只能得到 DEFER；任何治理效果的表述都超出本轮证据。

---

## 3. LIMITATION

- 主比较仅覆盖 eligible events（53/96），task 7 全部与 task 5 大部分为 ineligible；apply/sham/holdout 实际分配为 30/9/14（计划近似为 29/14/14），sham 臂仅 9 个事件。
- holdout 覆盖 6/8 个任务簇（达到 gate 的 6 但未覆盖全部冻结簇）；apply 覆盖 7/8。
- 任务簇 bootstrap 以 6–8 个簇为单位，簇间相关性的标准误估计受簇数限制。
- 92 次 invalid/unavailable provider 调用按冻结规则以 terminal 身份进入 outcome；它们对分臂 Brier 的贡献受 `reference_distribution_for_non_answered` 规则约束。
- pooled Brier 仅是该协议下独立 final private belief report 相对任务 resolution 的 proper loss；不构成对 agent 内在信念、detector validity、通用可靠性或现实部署价值的测量。
- 仅 DeepSeek `deepseek-chat`、单一 prompt/profile/阈值；不跨模型、不跨 prompt、不跨任务库外推。
- 本轮为 task-heldout exploratory replication，非 confirmatory；结论范围严格限于冻结实验本身。

---

## 4. 执行偏离与边界

- 无执行偏离：未换题、未换 runId、未换 seed、未补样本、未按结果调整阈值或分析、未重抽。
- 授权变更：analyzer DEFER gate 按 owner 指令在执行前机械扩展（新增条件 1/7/8/9，主 point estimate 明确为 observed naive 差而非 bootstrap median）；不改变统计方法，只把设计与 owner 判定的方向/区间条件显式化。此变更已固化于 `analyze_v6_verdict_task_heldout_replication.ts` 与其确定性测试。
- 设计文档顶部状态由 SUPERSEDED 更新为 REACTIVATED FOR MINIMAL MECHANISM REPLICATION；其余设计未改。
- 新增结果文档即本文件；新增执行监控日志 `experiments/campaign/pilot_output/heldout-execute.stdout.log`（运行期 stdout/stderr 记录，不参与分析）。

## 5. Claim ceiling

- 本文件仅允许并仅作出：**“Task-heldout replication is DEFER；当前证据不足以认定治理效果。”**
- 不声称通用治理有效、detector 有效、latent belief 被测得、selective policy 有效、现实部署有效、confirmatory、AAMAS-ready，或在冻结实验范围外建立因果效应。
