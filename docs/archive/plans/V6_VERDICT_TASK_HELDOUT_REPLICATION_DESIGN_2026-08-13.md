# V6 Verification Verdict：任务簇隔离复验设计

> **REACTIVATED FOR MINIMAL MECHANISM REPLICATION（2026-08-13）** — 本设计现被 owner 重新授权为最小治理机制复验：在冻结的 task-heldout 条件下，复验 public-only verification verdict 相比 holdout 对独立 final private elicitation pooled Brier 的方向性差异。研究问题、任务集、seed、模型、prompt、allocation、预算与分析口径均不得改变；本复验为 task-heldout exploratory replication，不是 confirmatory study。

日期：2026-08-13  
状态：**FROZEN DESIGN INTENT — provider 调用前必须先完成清单中的机械实现与 no-replace plan**

## 1. 决策

先不扩展任何新治理机制，也不再把已观察开发任务加样本。下一次唯一授权的付费实验是：在一个与已观察 V2 开发集语义簇不重叠的、预先冻结的 HiddenBench 子集上，复验既有 `epistemic_governance_v1` 中 public-only verification verdict 的随机化结果。

这是一项 **task-held-out replication**，不是 confirmatory study，也不是对所有任务、模型、提示词或真实组织场景的外推。

## 2. 已有证据与本轮要检验的假设

### FACT

- 已观察开发集为 `2, 6, 10, 25, 26, 30, 34, 36, 41, 42, 43, 44, 46, 48, 53, 56, 58, 59, 60, 62`；它们及已用 engineering canary 不得进入本轮。
- 在该开发集的 115 个已完成 G runs 中，eligible 的 apply 相比 holdout 的 pooled Brier 差异为负；cluster-bootstrap 95% interval 为 `[-0.5813, 0.0033]`。该结果是探索性信号，不是已建立效果。
- 当前协议在 eligibility 后随机分配 `apply=.50`、`sham=.25`、`holdout=.25`；最终 private elicitation 在 verification delivery 之后进行，ground truth 只在离线 proper-loss 评分时使用。

### HYPOTHESIS

在以下冻结的任务簇、模型与提示词条件下，eligible event 上：

`mean(final pooled Brier | apply) - mean(final pooled Brier | holdout) < 0`。

这里的 Brier 只表示该任务协议中的独立最终 private belief report 相对于事后任务 resolution 的 proper loss；它不等于对 Agent 内在信念、通用可靠性或真实部署价值的直接测量。

## 3. 任务簇冻结与人工语义审阅

### 3.1 冻结 task IDs

```text
5, 7, 14, 21, 57, 61, 64, 65
```

每个 task ID 在本轮被视为一个候选语义簇。此集合刻意不包含：

- 已观察任务；
- `1/2/3` evacuation family；
- safe-facility/shelter、artifact transfer、data resilience、research-base、venue、missing-laboratory-item 与 sensor-placement 等已在开发集暴露的家族；
- 同一个运输/路线家族的多个任务。

### 3.2 接受的审阅结论（只约束本轮）

| task | semantic leakage group | 审阅理由 |
|---:|---|---|
| 5 | `hb-v6r1:academic-leadership-selection` | 多属性人事候选评估；与已观察 company-acquisition 仅有抽象的选项选择相似，不共享题面、证据结构或候选人构造。 |
| 7 | `hb-v6r1:requirements-proposal-evaluation` | 显式 RFP requirement matrix 与分布式 checklist。 |
| 14 | `hb-v6r1:everyday-constraint-choice` | 餐饮安全/可达性约束的日常选择，非隐蔽灾害设施模板。 |
| 21 | `hb-v6r1:emergency-transport-routing` | 路线可达性与时效选择；本轮只保留这一个 route/transport family 代表。 |
| 57 | `hb-v6r1:archaeological-site-preservation` | 文物抢救地点选择，具有独立的环境与施工约束。 |
| 61 | `hb-v6r1:infrastructure-fault-diagnosis` | 分布式观测下的故障源诊断，不是可行地点选择。 |
| 64 | `hb-v6r1:public-health-causal-diagnosis` | 分布式证据下的疾病来源诊断，不是地点或候选人选择。 |
| 65 | `hb-v6r1:medical-delivery-location-trace` | 已知投递物的去向定位；与 emergency supply-site selection 的资源可行性选择不同。 |

这是人工语义判断，不是自动证明。它只声明这些任务不会与已观察开发任务被作为同一已知家族处理；仍可能存在未识别的共同难度或 HiddenBench 生成机制相关性。因此不允许将 8 个任务簇的结果外推为 benchmark-independent 结论。

## 4. 必须保持不变的实验对象

下列对象必须从现有 `run_v6_verdict_exploratory.ts`/V2 fixture 原样复用，不得因先前结果改变：

- `profile = mechanism-verdict-v2-v1`；
- DeepSeek model reference 与 invocation configuration hash；
- 两轮 discussion、最终 private elicitation、prompt wording、parser 与 final pooled Brier；
- certainty threshold `0.7`；
- `apply=.50 / sham=.25 / holdout=.25`、同一 eligible-event randomization unit 与 master-seed derivation；
- 单次 provider 调用、顺序执行、无 retry、无 mid-run adaptation；
- replay / V2 safety checks 与 final truth firewall。

`apply` 是 public-only verification verdict delivery；`sham` 是无 verdict authority 的 matched-attention control；`holdout` 是 eligible 但不投递治理动作。不能把 arm assignment 称为 protocol-arm assignment，也不能把 sham 当成对「所有注意力效应」的充分排除。

## 5. 样本量、停止规则与预算

### DESIGN INTENT

- 8 个 frozen task clusters × 12 个 G replicates = **96 planned G runs**。
- 每个 task 的 replicate 为 `1..12`；run ID、primary seed、monitoring seed 从该身份确定性派生。不得从开发批次复用 run ID 或 seed。
- 预计约 58 个 eligible events，约 29 apply / 14 sham / 14 holdout；这是来自既有 eligible rate 的规划近似，不是承诺或结果。
- provider call upper bound：**1,300**；token upper bound：**1,600,000**。预算耗尽即停止；不得追加、换题、重抽 seed 或因 arm 不平衡补样本。

### 预先定义的缺失处理

- provider/invalid/unavailable 依既有 `reference_distribution_for_non_answered` 规则进入最终 outcome；不删除或用成功重试替换。
- 出现 ≥5 个未完成 run、任一 replay failure、contract/hash mismatch、truth/private leakage、V2 authority violation 时停止并保留全部 artifact；此时不解释效果。
- 若计划被宿主中断，未运行的 IDs 记为 missing；不得以新 task 或新 seed 填补。是否以 fresh identity 续跑只能作为一个新的、明确标识的 execution batch，不能静默并入原计划。

## 6. 冻结分析

### Primary estimand

只在 eligible G events 上报告：

`Δ = mean(final pooled Brier | apply) - mean(final pooled Brier | holdout)`。

以 task cluster 为唯一 bootstrap 单位，10,000 次 deterministic percentile bootstrap，报告 point estimate、95% interval、每臂 event 数和 task cluster 数。较低值有利于 apply。

### Go / defer interpretation

只有同时满足以下条件才可写「在冻结 task-held-out 条件下观察到可重复的方向性差异」：

1. 每个 apply、holdout 臂至少 10 个 eligible events；
2. 每个 apply、holdout 臂至少覆盖 6 个任务簇；
3. valid bootstrap fraction ≥ .95；
4. `Δ < 0` 且 95% interval 完全小于 0；
5. 全部 artifact sealed decision replay verified，且无安全停止条件。

任何一项不满足即 **DEFER**。DEFER 不是失败，也不能改写为“无效”。

### Secondary（仅解释，不授权机制结论）

- apply–sham、sham–holdout；
- final accuracy、token cost、invalid/unavailable rate、verdict 分布；
- 与开发批次方向的一致/不一致。

即使 primary 条件成立，也不能借此声称 detector validity、source-novelty policy efficacy、跨模型鲁棒性、现实部署效果或“LLM 内在 belief”被测得。

## 7. 不可替代决策已完成；可委派的机械工作

本设计已冻结任务簇、样本量、估计量、阈值、停止规则、证据与措辞上限。之后 Claude Code 仅可：

1. 复用已有 verdict runner 建立一个新的 heldout-replication runner 和 no-replace plan；
2. 将本表中的 task/group/review identity 写入一个小型、可审计的 manifest；
3. 添加确定性测试，证明 task set、预算、分析口径、种子身份、复用边界不可漂移；
4. 新建只读分析器与 factual run report 模板。

它不得改动 V2 核心、阈值、prompts、model、allocation、raw schema 或生产 vertical slice；不得执行真实 provider；不得自行扩大/缩小 task 集、解释实验结果或把本设计称为 confirmatory。

## 8. 后续人工门槛

Codex 审核计划与测试后，才可请求一次明确的付费执行授权。执行完成后先 replay，再运行冻结分析；只有该分析完毕才决定论文结果、追加跨模型复验或研究新机制。
