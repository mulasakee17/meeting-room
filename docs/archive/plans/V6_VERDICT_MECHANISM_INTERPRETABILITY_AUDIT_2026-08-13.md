# V6 Verification Verdict：机制可解释性审计

日期：2026-08-13  
状态：FACTUAL AUDIT + FROZEN INTERPRETATION BOUNDARY。本文不授权新 provider 调用或机制改动。

## 1. 审计问题

当前 V6 verdict 实验若在 task-held-out replication 中再次观察到 apply 相比 holdout 的较低最终 pooled Brier，究竟能解释为什么？哪些替代解释已被设计排除，哪些仍没有被排除？

## 2. 当前实现的最小因果对象

### FACT

在 `epistemic_governance_v1` 的 round 1 后，系统从 first-round explicit reports 中选择一个 target，基于其 reported certainty、categorical domain 和 verified lineage count 构造 diagnosis。只有该 diagnosis 符合当前规则时才形成 eligible event；随后才使用冻结的随机分配将该 event 分到 apply、sham 或 holdout。

对 eligible event：

- **apply**：一次独立 verifier 调用读取 `publicContext`、primary claim 与 target 的 public message；它只可返回 `supported`、`contradicted` 或 `insufficient_evidence` 及 explanation，且结果以 governance message 进入 round 2 的公共 transcript。
- **sham**：一次独立调用，但 prompt 明令其不得评估 task、claim、message、evidence 或答案；系统随后投递固定的 “Matched control completed; no new evidence was introduced.”，无 verdict authority。
- **holdout**：不投递 verification result。

最终 private elicitation 在第二轮讨论之后才开始。每个 agent 的 elicitation view 只含 public context、自己的 private information 与公共 transcript；final provider request 不含 ground truth 或 resolver outcome。任务 truth 在 session 关闭 elicitation 后才用于 resolution 与 proper-loss scoring。

### INFERENCE：本实验主效应实际识别的对象

在当前 eligible subpopulation、任务、模型、prompt 与预算下，apply–holdout 的随机化差异识别的是：

> **获得一段由额外单次模型调用、基于公开上下文和目标 public message 生成、且带有受限 verdict label 的公共复核消息**，相对不投递该消息，对最终 private proper loss 的比较差异。

这是一个明确但复合的干预。它不是“真实证据被验证”的效果，也不是“Agent 内在信念被纠正”的效果。

## 3. 已排除或受限的解释

| 可能解释 | 当前证据状态 | 理由 |
|---|---|---|
| 运行时直接把 task truth 送给 verifier | 结构性排除 | verification request 由显式字段重建，只含 public context、claim、target public message、action identity 与非 secret invocation config；V2 request 强制 `evidenceScope=public_only`。 |
| verifier 以“正确答案/替代答案”形式直接输出 outcome authority | 部分排除 | adapter 限制 verdict 枚举，并拒绝含 outcome-authority 模式或未出现在 target message 的 option 名的 explanation。它不证明自然语言没有其他间接诱导。 |
| sham 获得 verdict authority | 结构性排除 | sham action 的 response 只能转为固定 acknowledgement；V2 safety replay 对 sham verdict authority fail-closed。 |
| final elicitation 在请求中看到 truth/resolver | 结构性排除 | final view schema 固定为 public context、own private information、discussion transcript；collection 发生在 resolution/scoring 之前。 |
| apply 与 holdout 的选择不是随机的 | 对 eligible subset 结构性排除 | eligibility 后以 frozen event-assignment design 产生 apply/sham/holdout；审计 trail 可 decision replay。 |

这里的“结构性排除”指本地 request/trace/replay 边界，不意味着能证明远端模型、外部 provider 或训练数据在哲学意义上绝无任何先验信息。

## 4. 仍未被分解的解释

### 4.1 额外公开重推理与 verdict authority 混杂

**FACT：** apply verifier 阅读公开任务与 target message；sham verifier 刻意不阅读这些内容。

因此 sham 匹配的是一次 provider call、一个治理消息时点和部分注意力/流程存在感；它**不匹配**一段 task-conditioned re-analysis 的认知内容。若 apply 优于 sham 或 holdout，至少三种机制仍混合：

1. verifier 对同一公开证据的额外推理；
2. `supported/contradicted/insufficient_evidence` 标签的权威/元认知作用；
3. explanation 文本作为额外论证或显著性提示的作用。

所以不能写“verdict label 本身导致改善”，也不能把 apply–sham 简化为纯 attention placebo 对照。

### 4.2 新计算不是新外部信息

**FACT：** apply 的 evidence scope 固定为 `public_only`；它没有调用 tool、retrieval、外部 dataset 或新的 private source。

**INFERENCE：** 该动作目前更接近 *redundant public re-evaluation / cognitive check*，不是 active information acquisition，也不是 source-novelty policy 的实证。它可以有价值，但论文必须准确命名。

### 4.3 条件效应不是 detector validity

eligible 由 certainty-lineage rule 定义。随机化只发生在该选择之后。因此，即使 apply–holdout 有差异，也只支持该 rule 定义出的 eligible population 内的干预差异；不支持“该 detector 能识别真实错误”或“高 certainty、低 lineage 是可泛化风险信号”。

### 4.4 同模型额外调用的资源解释

当前 verifier 是一次独立的 model call，不等于异构模型、独立来源或更高质量 evidence。一个正结果也可能是固定总预算下增加结构化 critic computation 的效应；成本效益、跨模型泛化与异构资源价值仍未建立。

## 5. 对本轮 task-held-out replication 的解释纪律

若复验达到其冻结的 go gate，允许写：

> 在冻结的 HiddenBench task-held-out 条件下，对于当前规则定义的 eligible events，投递 public-only verification verdict 的复合干预与较低的最终 private pooled Brier 一致，并在随机 apply–holdout 比较中呈现可重复方向性差异。

不允许写：

- verifier 获得了新真相、纠正了错误信念；
- certainty-lineage detector 有效或已校准；
- verdict authority 本身优于 re-reasoning；
- 系统学会了何时相信谁；
- 这是异构智能、外部证据检索或现实多 Agent 社会的效果；
- 治理在一般意义上有效。

若复验 DEFER 或方向反转，最优解释是该复合干预在当前证据下不稳定或证据不足；不得通过添加新动作、重选任务或重调阈值挽救主张。

## 6. 复验之后唯一值得做的机制分解

这是后续研究设计，不进入当前复验：在同一 eligibility / task split / 模型预算下，固定四个 arm：

| future arm | verifier 读 public task/message | 带 verdict label | 目的 |
|---|---:|---:|---|
| holdout | 否 | 否 | 无治理消息。 |
| process sham | 否 | 否 | 当前流程/显著性对照。 |
| content-control | 是 | 否 | 分离 task-conditioned re-evaluation 文本。 |
| verdict apply | 是 | 是 | 当前复合干预。 |

只有 `verdict apply − content-control` 才能接近回答 label/authority 是否贡献额外效果；`content-control − process sham` 才能接近回答公开重推理的贡献。该设计还需预算对齐、新的 task split、独立复验和明确付费授权，不能在当前结果出来后临时插入。

## 7. 决策

当前最优策略是：**先完成不改机制的 task-held-out replication。** 当前机制足以检验一个窄而有用的总效应；尚不足以支撑机制归因。先通过复验再做分解，优于在尚无稳健结果时堆叠新臂和新工程。
