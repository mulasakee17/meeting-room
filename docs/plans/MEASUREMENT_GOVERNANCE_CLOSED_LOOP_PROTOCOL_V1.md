# SwarmAlpha：测量—治理闭环协议 V1

日期：2026-08-13  
状态：**SUPERSEDED AS IMMEDIATE EXECUTION PRIORITY；保留为更广闭环设计与历史依据**

> **2026-08-14 integrated-route update:** `docs/plans/SWARMALPHA_INTEGRATED_RESEARCH_EXECUTION_GUIDE_2026-08-14.md` 现为执行权威。四特征/九特征 predictor、selective router 与 public-verifier 扩张继续冻结；下文已经实现的 pre-discussion source-disclosure 被重新授权为 32–48 run 的**机制筛选**，不是已验证策略、正式治理效果实验或论文贡献。其后任何正式实验仍必须经过新指南的 uptake/quality Gate。

> **2026-08-14 权威路由：**四特征 failure predictor 未通过 task-heldout 资格，随后冻结的 verification task-heldout replication 也未复现开发批次的有利方向。近期不再推进九特征 discovery、selective router 或多基线 frontier。当前路线以
> [`CURRENT_ROUTE_AND_METHODOLOGY.md`](../research/CURRENT_ROUTE_AND_METHODOLOGY.md)
> 与
> [`SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`](../theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md)
> 为准：先用现有 artifact 做零付费微观—宏观状态与随机干预响应审计。本文对 truth firewall、风险预测与 action benefit 不等价、随机化和 claim ceiling 的一般原则仍然有效；其执行顺序和九特征路线不再具有当前授权。

## 2026-08-13 权威 Addendum：预测优先，不越级做策略

本 Addendum 取代下文“当前先做第二步机制筛选”的执行顺序，但保留下文对量、truth firewall、随机化与 claim ceiling 的定义。

近期论文的主闭环冻结为：

```text
round-1 observable process state X
  -> task-held-out prediction of no-action collective loss r(X)
  -> randomized estimation of action benefit g(X)
  -> frozen selective policy
  -> cost-quality frontier against never / always /
     confidence-threshold / matched-rate random
```

必须同时保留两个不等价对象：

\[
r(X)=\mathbb E[L(Y(0))\mid X],\qquad
g_a(X)=\mathbb E[L(Y(0))-L(Y(a))\mid X].
\]

能预测失败不等于知道干预对谁有效；选择策略最终应按预先冻结的 \(g_a(X)/C_a\) 或其单调等价分数分配预算。`confidence-threshold` 是强制朴素基线，不是 proposed policy；`matched-rate random` 是识别测量增量价值的必要基线，不能省略。

### 已完成的零成本资格审计

**FACT** — `analyze_v6_process_state_failure_prediction.ts` 使用既有 40 个未经过 eligibility 筛选的 B-arm runs（20 个 task clusters），只从 round-1 reports 提取 coverage、mean certainty、pairwise TV 与 pooled margin，并以 leave-one-task-out ridge 预测独立 final pooled Brier。四维 process-state 模型 MSE 为 0.5127，差于 constant 0.3087、confidence-only 0.4169 与 disagreement-only 0.3556；三项 paired cluster-bootstrap 增益 gate 均为 `DEFER`。详见 `docs/experiments/V6_PROCESS_STATE_FAILURE_PREDICTION_AUDIT_2026-08-13.md`。

**INFERENCE** — 现有四个粗粒度标量没有获得 selective control permission。不能用 G-holdout 的 11 个 eligibility-selected 样本中较好的描述性表现覆盖主结果。

**DESIGN INTENT** — 下一次 discovery trial 的动作前表示已冻结为 `processStateFeaturesV2.ts` 的九项：coverage、mean certainty、pairwise TV、pooled margin、argmax vote concentration、minority max certainty、evidence content-hash overlap、evidence-reference coverage 与 inverse option count。新增项主要表达少数派强度、公开证据冗余和任务坐标规模；它们仍是可观测投影，不是 latent belief、verified source independence 或已验证 detector。不得在付费结果出来后增删特征或换公式。

**DESIGN INTENT** — 下一次付费执行若获批准，只允许做一个复用现有 V2 verification delivery 的随机化 discovery trial：动作在 round-1 snapshot 之后、round-2 之前分配。它同时产生无动作风险样本和随机化 treatment-benefit 样本；不实现 router、bandit、MCV 或新 schema。只有 task-held-out 风险预测与随机 action-benefit gate 均通过，才授权独立任务上的 frozen frontier evaluation。

### Source-disclosure 的位置

下文的 pre-discussion source-disclosure screen 保留为独立的**机制候选**，但不再是当前主线，也尚未获准执行。它发生在 round-1 process state 形成之前，因此不能直接检验“根据当前 process state 选择干预”。若未来恢复，必须作为单独的 pre-task policy 研究，不得与本 Addendum 的 post-round-1 selective governance 混写。

## 0. 收口决定

近期论文不再试图一次证明“通用异构智能治理”，也不把 schema 数量、重放链长度或 LLM 自报置信度本身当作贡献。论文只沿一条可证伪的闭环推进：

```text
在线可观测量是否有用
  -> 一个具体的信息访问动作是否改善独立 outcome
  -> 测量定向分配是否优于同预算随机分配
```

以下段落记录上一版的 source-disclosure 机制筛选设计；其执行优先级已被顶部 Addendum 暂停。

本协议覆盖论文主线，但只授权第一阶段工程。后续阶段必须经过本协议规定的 gate，不能提前实现。

## 1. 精确研究对象

### 1.1 Prompt-conditioned report

LLM 在提示契约 \(\Pi\) 与可见信息 \(X\) 下给出的显式概率记为：

\[
Z_{i,\Pi}=\hat p_i(y\mid X,\Pi).
\]

它是 **prompt-conditioned observable report**，不是潜在信念，也不是跨 prompt 不变的心理量。换一种问法后数值变化首先是测量条件变化；只有在预先审查为语义等价的 prompt 族中，稳定性才是可评价属性。

### 1.2 测量效度

近期论文不声称“读出 Agent 内心”。只评价三个操作性层次：

1. **报告可靠性**：语义等价复测/改写下，概率分布和 argmax 是否稳定；
2. **证据响应性**：在受控证据扰动下，报告是否按预注册方向与强度变化；
3. **结果效度**：动作前可观测量是否对无干预条件下的最终错误/损失具有 held-out 预测增益。

可靠不等于正确，能预测错误也不等于能识别谁会受益于治理。

### 1.3 治理效果

治理效果只由随机动作与动作后的独立 final private outcome 识别。主 outcome 是 pooled multiclass Brier；accuracy、abstention、invalid/unavailable 和成本为次要结果。

Ground truth 可用于所有在线动作与 final private elicitation 完成后的评分；不得进入任务变体选择、来源选择、触发、分配、prompt 或 provider 请求。

### 1.4 风险与治理机会不同

风险分数：

\[
r(X)=\Pr\{\text{final error}\mid X,\text{no action}\}.
\]

动作 \(a\) 的治理机会：

\[
g_a(X)=\mathbb E[L(Y(0))-L(Y(a))\mid X].
\]

高 \(r(X)\) 不推出高 \(g_a(X)\)。第一阶段只识别平均动作效应；只有动作通过 gate 后，才允许开发 targeted policy。

## 2. 第一阶段：信息访问机制筛选

### 2.1 研究问题

> 在同一任务、模型、提示与讨论预算下，讨论开始前强制公开一条按预注册规则选定的私有来源观察，是否降低最终 pooled Brier？

该问题比 public-only verifier 更直接。已有 public-only reanalysis 只能检验相同公开材料；本阶段操作真正改变信息访问集合。

### 2.2 两臂

| arm | 操作 |
|---|---|
| `H = holdout` | 原始 HiddenBench 分布式信息任务，不增加公开信息 |
| `D = forced_source_disclosure` | 在首次 discussion provider call 前，把一条预先冻结的 agent private information 原文、来源身份与“非正确性证书”标签附加到 public context；随后运行与 H 完全相同的协议 |

唯一允许的任务差异是 `publicContext` 中该 disclosure block。两臂的模型、agent roster、private views、两轮 discussion prompt、调用数、token ceilings、final private elicitation 与评分必须相同。D 不增加 provider call，因此若 D 更优，不能解释为额外推理调用。

### 2.3 来源选择

来源选择必须在 arm assignment 和 provider 调用之前冻结：

```text
source = SHA256(namespace, blockId, taskId, sourceSelectionSeed) mod agentCount
```

选择键不得包含 arm、runId、模型输出、correct answer、resolver outcome 或 task outcome。同一配对 block 的 H/D 必须选择同一个潜在来源；H 记录其 identity/hash 但不公开内容，D 公开它。

`experiments/campaign/v6/sourceDisclosureInterventionV1.ts` 已实现该最小任务变体，复用既有 V6 task manifest 对变更后的 public context 做承诺；不新增 raw schema、治理内核或 provider adapter。

### 2.4 随机化与样本

- 固定 16 个**未用于既有 20-task verdict 开发批次**的语义任务簇；
- 每 task 6 runs，共 96 runs；
- task 内做 3 个 pair/block，每个 block 含 H/D 各一个 run；arm 顺序由冻结 seed 决定；
- paired block 是分配块；task/leakage group 是推断 cluster；
- 无 eligibility threshold，无 certainty trigger，无事后补样本、换题或挑 seed。

**任务候选集尚未被本协议授权为 accepted semantic review。** Claude Code 只能生成 16-task 候选与 review packet，不能自行签署 `accepted`。优先复用已有人工审查过的 8 个任务 `5, 7, 14, 21, 57, 61, 64, 65`，其余 8 个须由 owner/Codex 基于描述与模板家族审查后冻结。任务 outcome 不能参与选择。

### 2.5 主效应量

令 \(L_{tbD}\) 与 \(L_{tbH}\) 为 task \(t\)、block \(b\) 的 D/H final pooled Brier：

\[
\Delta_{D-H}=\frac{1}{48}\sum_{t=1}^{16}\sum_{b=1}^{3}(L_{tbD}-L_{tbH}).
\]

负值有利于 disclosure。报告 paired point estimate，并以 task/leakage group 为唯一 bootstrap 单位，做冻结 seed 的 percentile cluster bootstrap。不能把 96 runs 当成 96 个独立任务。

### 2.6 Gate

只有同时满足以下条件，才能进入 targeted-policy 阶段：

1. 96 个预注册 run 均形成 terminal artifact；任何失败保留为预注册 missing/terminal，不用新 run 替换；
2. 所有可用 artifact 通过既有 schema-5 replay；
3. 无 truth/private firewall 或配对来源身份破坏；
4. H/D 至少各覆盖 12 个有效 task clusters；
5. bootstrap valid fraction ≥ 0.95；
6. \(\Delta_{D-H}<0\)，且 95% cluster-bootstrap interval 完全低于 0；
7. D 没有增加 provider call，token/cost 与 failure diagnostics 完整报告。

任一不满足即 `DEFER/STOP`。不得把 DEFER 改写成治理有效，也不得在同一数据上调 disclosure 选择规则后重新宣称验证成功。

### 2.7 允许与禁止主张

若 Gate 通过，只允许：

> 在冻结的 HiddenBench 任务、模型与协议条件下，随机化的 pre-discussion source disclosure 降低了独立 final pooled Brier。

仍不允许：通用治理有效、source identity 等于统计独立、LLM 自报量有效、真实组织部署有效、MCV 已实现、AAMAS-ready。

## 3. 第二阶段：测量资格（并行准备，不扩内核）

复用 `experiments/campaign/measurement/` 现有 authority/runner，不新建测量框架。最小执行单元只包含：

1. exact repeat；
2. 经人工接受的语义等价 paraphrase；
3. option permutation + canonical remap；
4. 经人工接受的三档同向证据与一档反向证据。

量化报告：

- distribution JSD、TV、argmax/tie-set agreement、paired coverage；
- 相对无扰动基线的 target-option probability shift；
- 证据强度的单调响应率与 counter-direction response；
- 无干预 H arm 中 reported certainty、between-agent disagreement 等对 final Brier/error 的 task-held-out 预测增益。

不得用 ground truth 制造在线证据文本；若 evidence ladder 必须依赖 resolution 才能写出，则它只属于 evaluator-side construct-validation task，不得回流到治理 prompt。现有机械 evidence payload 尚未通过 owner 语义审查，不能执行 paid run。

## 4. 第三阶段：策略价值（Gate 后才设计/实现）

只有第一阶段动作 gate 与第二阶段至少一项 held-out predictor gate 同时通过，才比较：

- `N`：no intervention；
- `R`：同预算随机 disclosure；
- `T`：按冻结测量规则选择 disclosure。

主比较是 \(V(T)-V(R)\)，而不是 \(V(T)-V(N)\)。它识别测量用于资源配置的增量价值；T/R 总 disclosure 数、调用数与 token ceiling 必须相同。策略阈值只可在 development split 冻结，held-out 期间不得适配。

若第一阶段动作无效，停止策略工程。若测量只能预测错误而不能产生稳定 treatment heterogeneity，则论文可以报告风险刻画，但不能声称 targeted governance 有效。

## 5. 与前沿工作的关系

- 多智能体 debate 并非天然优于 self-consistency/ensembling，且对协议超参数敏感，因此本研究必须保留 compute-matched baseline，不能把“多 Agent”本身当贡献；
- LLM 在多数压力下会发生 conformity，说明曝光结构是实质机制变量；
- 不同模型/供应商的错误仍可能高度相关，说明 source identity 不能冒充 error independence；
- verbalized confidence 不是唯一或当然最佳的不确定性信号，故 certainty 只能是候选传感器。

因此近期差异化不是发明又一种 debate，而是：**把可观测量资格、信息访问随机化、final private proper-loss outcome 和策略价值拆开识别。**

## 6. 明确不做

- 不增加 schema 6、外部签名、Web3、stake/reputation 或社会热力学控制；
- 不接 production active-information router；
- 不实现动态 MCV、bandit 或多步 stopping；
- 不修改旧 verdict artifacts；旧 96-run verifier replication plan 在 provider 执行前被本协议暂停；
- 不把 public-only verifier 称为 independent verification；
- 不为工程整洁重写 `productionVerticalSlice.ts`。

社会热力学保留为 future macro-hypothesis：只有微观 intervention/outcome 关系建立后，宏观量才有可验证对象。

## 7. 当前事实状态

**FACT** — source-disclosure 任务变体内核与 9 项确定性测试已实现；它只改 public context，不读取 outcome，不增加 provider call，不改 raw schema。

**FACT** — 尚无 runner、plan、accepted 16-task semantic review、paid artifact 或效果结果。

**DESIGN INTENT** — 下一机械工作是候选任务 review packet、paired plan/runner、分析器与测试；完成后必须回 Codex 审核，未经明确授权不得执行 provider。
