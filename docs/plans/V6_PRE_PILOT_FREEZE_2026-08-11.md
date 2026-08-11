# SwarmAlpha V6 Pre-Pilot Freeze

日期：2026-08-11

状态：**CANDIDATE FREEZE — NO RUN AUTHORIZATION**

代码基线：`679bdb261484eaf5f843eddc49ae166d4a1418ef`

本文件不授权真实或付费 provider 调用。

## 1. 冻结目的

**DESIGN INTENT：**停止继续扩展治理工程，把项目从“补内核”切换为“用数据审查测量和机制”。

**FACT：**基线已经包含 schema-5 production vertical slice、Stage-1/Stage-2 assignment、final private elicitation、operational outcome、task/monitoring authority、verified calibration admission、detector-validation projection 与 replay 边界。

**LIMITATION：**这些实现与测试证明可执行性和内部一致性，不证明 detector 准确、threshold 已校准、治理有效、因果效果成立或 artifact 具有外部真实性。

## 2. 运行环境候选

| 项 | 冻结候选 |
|---|---|
| Git baseline | `679bdb261484eaf5f843eddc49ae166d4a1418ef` |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| tsx | `4.23.1` |
| provider/model ref | `deepseek:deepseek-chat@1.0.0` |
| provider retry | `none`；single-attempt boundary |
| schema | raw run `5.0` vertical slice |
| primary operational metric | registered-agent pooled binary Brier，lower is better |
| primary protocol contrasts | `B−T`、`G−B`；仅在设计允许时解释 |

版本漂移、模型别名漂移、provider 内部行为变化或依赖升级都必须产生新候选冻结，不得静默沿用本文件。

## 3. Task admission 与数据切分

### 3.1 `distributed-binary@1.0.0`

**FACT：**当前任务、ordered roster、private views、claim、resolution contract 与 task-definition hash 能进入 schema-5 权威链。

**DECISION：**只准入后续的最小工程 canary；在任务银行扩展前，不得把该单一固定任务上的重复运行称为跨任务 calibration 或 held-out validation。

### 3.2 `network-fault@1.0.0`

**FACT：**现有 evidence 语义与冻结 truth 存在构念冲突；旧结果出现结构性 floor。

**DECISION：**隔离为 `audit/mock-replay-only`。官方 CLI 的真实 `--execute` 路径以稳定错误 `task_family_not_admitted_for_execution` 和 exit code `4` 拒绝该版本。dry-run、mock、replay 与旧 artifact 保留用于审计。

**VERSIONING RULE：**不得根据已经观察到的模型答案原地翻转 truth。若重设计 evidence、claim 或 resolution，必须创建新的 task/adapter version、task ID、study identity、preregistration identity 与 task-definition hash；旧版本不删除、不升级解释。

### 3.3 当前切分状态

| split | 当前内容 | 权限 |
|---|---|---|
| engineering canary | `distributed-binary@1.0.0` | 候选，仍需用户逐次授权 |
| threshold calibration | 空 | 不可运行 |
| held-out detector validation | 空 | 不可运行 |
| confirmatory | 空 | 不可运行 |

**STOP BOUNDARY：**在 versioned task bank 被预先拆分为互不重叠的 calibration 与 held-out manifests 之前，不得生成 `CalibrationArtifactV1`，不得宣称 threshold 获得 C1 predictive support。

## 4. Threshold 与 detector 纪律

**FACT：**当前 `certaintyLowerBound=0.65` 是 calibration fixture 的工程候选；smoke fixture 的 `0.9` 也是工程配置。二者都不是经 held-out 数据支持的科学阈值。

**FACT：**在线可见的风险谓词为：显式自报 probability 导出的 certainty、合格 verification-record count 与 verifier availability 的组合。它不是错误真值、latent belief 或 miscalibration oracle。

**DECISION：**

1. calibration split 只能用于选择或版本化 threshold；
2. held-out split 只用于一次冻结评估，不反向调参；
3. confirmatory 数据不得用于 threshold、prompt、seed、task evidence 或 missingness policy 调整；
4. threshold 必须保持版本化，不允许 confirmatory online adaptation；
5. 主 detector 检查是 flagged 与 unflagged 报告的 inverse-probability-weighted Brier risk gap；hard error precision/recall/specificity 只是次级诊断；
6. 单次 report Brier 不是 calibration；最终仍需 reliability/calibration 分析、coverage 与 uncertainty。

## 5. 分阶段释放规则

### Gate C0：非付费完整性检查

当前状态：**PASS WITH KNOWN INFRA FLAKE**。

- 聚焦 V6 回归：8 files / 63 tests passed；
- `tsc --noEmit` passed；
- production build passed；
- 全量测试的业务断言通过，但 Windows 并发子进程下仍可能出现已知 Node/tsx `uv_os_get_passwd ENOMEM`，必须与业务失败分开记录，不得通过弱化断言掩盖。

### Gate C1：真实 provider canary

当前状态：**NOT AUTHORIZED**。

候选范围仅为 `distributed-binary@1.0.0` 的 T/B/G 各一个 run；provider-call cap 20，token cap 由命令显式冻结。运行前必须再次确认 baseline、空输出目录、新 run IDs 与 credential firewall。

通过要求：

- schema/replay 100%；
- assignment/binding/task/outcome authority 100% 一致；
- 无内部 retry、truth leak、other-agent private-view leak；
- provider usage 完整，预算超限 fail closed；
- incomplete run 不被续写或覆盖。

该 gate 只证明真实 provider 接线，不估计 detector 或治理效果。

### Gate C2：detector calibration/held-out pilot

当前状态：**BLOCKED BY EMPTY SPLITS**。

释放条件：

1. 至少形成 versioned calibration task manifest 与互不重叠的 held-out task manifest；
2. 每个 task 的 claim/evidence/truth 在看模型结果前完成语义审查；
3. 冻结 selection design、model/config、threshold candidate set、missingness、analysis code 与停止规则；
4. 分析显式报告 empty population、selection coverage、invalid/unavailable 与 task/model strata；
5. detector 输出保持 `descriptive_calibration_only`，直到 held-out 支持成立。

升级为 predictive-risk evidence 至少要求：held-out 上 Brier risk gap 方向符合预注册预期，并同时报告 uncertainty、coverage 和任务/模型异质性。样本不足时标为 inconclusive，不得以 point estimate 升级主张。

### Gate C3：平衡 T/B/G 效果 pilot

当前状态：**NOT RELEASED**。

只有 Gate C1 与 C2 通过后才允许。先比较 B−T，再比较 G−B；Stage-2 apply/holdout/sham 仍只作 exploratory mechanism analysis，除非另有具备识别条件的冻结设计。

## 6. Go / Revise / Stop

| 结果 | 决策 |
|---|---|
| replay、truth firewall、assignment authority 或 outcome identity 失败 | STOP，回到核心修复 |
| 接线稳定，但回答率、coverage、触发率、成本或任务难度退化 | REVISE task/adapter/config version，重跑 calibration，不改旧 artifact |
| detector held-out Brier risk gap 近零、为负或跨任务不稳定 | 不释放治理效果主张；重新审查构念，而不是堆治理动作 |
| detector 有预测价值但 G−B 近零 | 保留测量/审计贡献；报告治理机制无增益 |
| B−T 改善、G−B 不改善 | 支持显式 belief architecture，不支持治理增量 |
| replay-clean、检测支持成立且 G−B 改善 | 才进入更大 pilot/power estimation；仍不等于 confirmatory 结论 |

## 7. 冻结期禁止事项

- 新增 reputation、stake、slashing、Web3、社会热力学控制量；
- latent-belief inference；
- online threshold/dosage adaptation；
- 为改善结果修改既有 truth、prompt、seed 或删去 failure/missingness；
- 把内部 hash 称为 tamper-proof 或外部真实性；
- 在 C1/C2 前扩展 categorical runtime、UI 或通用社会模拟器；
- 将旧 schema、旧 calibration 表或 `network-fault@1.0.0` 结果混入新 evidence bundle。

## 8. 下一项允许的工程工作

**FACT：**versioned task-bank/split authority 接口已经实现并通过对抗测试；它能够阻止未审查任务进入 scientific split、同源 scenario/template 跨 split 泄漏、calibration manifest 越权授予 confirmatory 权限，以及 task manifest 与 bank entry 的身份漂移。官方 CLI 在 task bank 未准入前拒绝真实 calibration execution。

**LIMITATION：**当前仍没有经过人工语义审查的 calibration/held-out task-bank 内容，接口本身不解除 Gate C2。

下一项只允许直接解除 Gate C2 的最小内容工作：建立经过人工语义审查的 versioned binary task entries 与冻结 split manifest，并补齐 empty-population/selection-coverage 分析。不得借此新增治理机制或新的通用框架。
