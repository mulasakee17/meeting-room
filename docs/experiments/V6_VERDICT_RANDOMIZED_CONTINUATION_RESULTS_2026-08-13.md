# V6 Verification Verdict 随机续跑结果（2026-08-13）

状态：**exploratory only**。本报告遵守 `docs/REASONING_PROTOCOL.md`；不把重放、方向性差异或单批次置信区间升级为一般治理有效性。

## 1. 研究问题与冻结边界

在既有 HiddenBench / DeepSeek / 两轮讨论 / final private elicitation 路径上，对符合现有 certainty-lineage 规则的事件随机分配：

- apply：投递 public-only verification verdict；
- sham：等预算注意力控制，不具有 verdict authority；
- holdout：不投递治理动作。

主 estimand 预先固定为 `mean(final pooled Brier | apply) - mean(final pooled Brier | holdout)`；按任务做 10,000 次 cluster bootstrap。主结果越低越支持 apply。未改变旧批次的任务、提示词、模型、阈值、终局测量或 schema。

## 2. 执行事实

### FACT

- 原计划：80 个新 G run，plan hash `sha256:bf5056c66fd5ea2e57068fc37031f0ddab2a043d4e4228f50ed5e448933e72dc`。
- 宿主进程中断导致 5 个冻结 run 缺失；没有补抽、改 seed、删除部分态或插补。
- 完成并纳入：75 个新 run，902 次单次 provider 调用，928,907 tokens。
- 响应终态：820 answered、43 invalid、1 unavailable。
- 75 个新 artifact 与原 40 个 G artifact 均通过 `verifyRawRunData`，状态为 `sealed_decision_replay_verified`。
- 一次早期沙箱内执行产生 78 个全为 `provider_network/provider_error`、零 usage 的 artifact；它们是基础设施失败批次，保留但完全排除于本分析。

## 3. 结果

### 合并分析（原 40 G + 新 75 G）

| arm | n | task clusters | mean Brier | mean accuracy |
|---|---:|---:|---:|---:|
| apply | 41 | 17 | 0.5493 | 0.5526 |
| sham | 21 | 13 | 0.7497 | 0.4286 |
| holdout | 11 | 8 | 0.8904 | 0.2727 |

- apply − holdout naive difference：**−0.3412**。
- task-cluster bootstrap median：**−0.3277**。
- 95% bootstrap interval：**[−0.5813, 0.0033]**。
- apply − sham：−0.2004；sham − holdout：−0.1407。

### 分批次稳健性

- 原批次：apply 17 / sham 7 / holdout 2；apply − holdout = −0.2358，95% interval [−1.2693, 0.7525]，支持不足。
- 新续跑：apply 24 / sham 14 / holdout 9；apply − holdout = −0.4159，95% interval [−0.7008, −0.0362]。
- 两批次 apply − holdout 方向一致；但 sham 的相对位置不一致（原批次 sham 优于 apply，新续跑 sham 明显劣于 apply）。因此不能把三臂排序解释为稳定机制分解。

## 4. 解释纪律

### INFERENCE

在本任务集、模型、提示词与 public-only verification 动作下，随机投递 verification verdict 对终局 proper loss 有**值得复验的正向信号**。该信号不是由旧批次单独驱动；新续跑方向一致且区间低于零。

### 仍不可声称

- 不能声称一般 epistemic governance 有效；
- 不能声称 certainty-lineage detector 已有效；eligible 子群由当前规则定义，检测效度仍未建立；
- 不能声称 ground-truth-free 在线 correctness detection；truth 只在终局评分阶段使用；
- 不能声称 source-novelty active information policy 有实证效果；该 policy 尚未接入生产实验；
- 不能把 sham 的不稳定表现解释为注意力或安慰剂机制；
- 不能称 confirmatory 或 AAMAS-ready causal result。

## 5. 下一步唯一高优先级实验

不再扩工程。冻结一个独立 task split 的 replication：保持同一三臂、提示词、模型与终局 Brier；提高 holdout 的任务簇数；事前决定主要分析只使用新任务，不与本探索集调参。若独立 replication 的 apply − holdout 仍为负且区间不跨零，再升级为“在冻结条件下可重复的治理效应”。

Source-novelty / active information acquisition 是下一篇或第二阶段机制，不应在完成上述独立复验前接入生产切片。
