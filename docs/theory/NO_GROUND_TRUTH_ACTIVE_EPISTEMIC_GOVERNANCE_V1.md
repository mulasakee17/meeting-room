# SwarmAlpha：无即时真值下的主动认知治理 V1

Status: normative theory and state-semantics contract  
Date: 2026-08-13

## 0. 本次收口决定

**DESIGN INTENT** — SwarmAlpha 的近期核心不再是证明某个 LLM 自报置信度“代表内心信念”，也不再是不断扩展审计 schema。项目要回答的是：

> 在无法即时获得 ground truth、来源可能相关、计算预算有限的条件下，系统应如何决定下一次获取什么信息、调用什么资源，以及何时接受、弃权或升级人工？

测量资格、重放和审计仍然保留，但它们是防止自欺的护栏，不是研究终点。

## 1. 最终用途

目标场景包括公司内不同权限的私人 Agent、模型—工具混合工作流、跨组织 Agent 协作和高风险决策辅助。这些场景的共同点不是“有多个聊天机器人”，而是：

1. 决策时通常没有即时真值；
2. 多个报告可能共享模型、训练数据、提示模板或上游资料；
3. 再调用一次模型、工具、数据库或人工都有成本和延迟；
4. 错误会因消息暴露、组织权威和重复来源而传播；
5. 结果可能延迟出现，可用于更新后续策略，但不能倒流进当前决策。

因此，SwarmAlpha 的运行时价值是管理“下一单位认知资源投向哪里”，而不是在线判断谁已经正确。

## 2. 两套严格隔离的信息集

### 2.1 在线治理可见信息

- 冻结的 claim 与可选结果空间；
- 在已记录 prompt contract 下产生的显式报告；
- 引用、证据身份、来源身份和声明的 lineage；
- 哪条消息在何时暴露给了谁；
- 工具、模型、数据库和人工通道的可用性、权限、成本与延迟；
- 由应用方事前声明的后果等级；
- 只从过去已揭示结果中冻结得到的历史性能模型。

### 2.2 只能用于离线评估的信息

- 当前任务的 ground truth、correct answer 或 resolver outcome；
- 最终 proper loss、accuracy 和错误级联标签；
- 由未来结果重建的 oracle action value；
- 测试集标签或任何可等价反推出标签的字段。

**Normative rule** — 在线策略、诊断和动作选择函数不得读取 2.2。真值用于校准检测器和比较治理策略，不用于触发当前治理动作。

## 3. LLM 自报量的正确位置

显式概率是：

\[
\hat p_{i,e}(y\mid x,\Pi_e),
\]

其中 \(i\) 是报告者，\(e\) 是 elicitation 条件，\(x\) 是当时可见信息，\(\Pi_e\) 是完整提示契约。它是架构诱导的可观测报告，不是潜在信念 \(p_i^*\)。

因此：

- 换提示后数值改变并不自动使测量失败；它首先揭示该报告对测量条件敏感；
- 单次自报 certainty 不能单独授权治理；
- prompt sensitivity 只有在冻结且通过资格审查的等价提示族上才可计算；
- 没有扰动数据时，prompt sensitivity 是 missing，不是 0；
- 自报量可作为比较基线或风险向量的一维，不再是系统主轴。

## 4. 在线风险不是一个总分

当前最小风险态是非补偿向量：

\[
R(c,t)=(D,S,P,X,U,K).
\]

### 4.1 Prompt-conditioned disagreement \(D\)

复用 `CollectiveEpistemicStateV1.betweenAgentDisagreement`。它描述在已记录提示条件下的报告分歧，不描述不可观测的“真实认知分歧”。

### 4.2 Declared-source concentration \(S\)

当所有活跃报告都有 lineage 时：

\[
S=1-\frac{H(q)}{\log L},
\]

其中 \(q\) 是报告质量在声明 lineage 上的分配，\(L\) 是不同 lineage 数。若任何活跃报告缺 lineage，\(S\) 必须为 missing。

该量只描述来源身份集中度。不同 lineage 不等于统计独立，也不等于低错误相关性。

### 4.3 Prompt sensitivity \(P\)

在一个通过资格审查的冻结提示族 \(E\) 上：

\[
P=\max_{e,e'\in E} d(\hat p_{i,e},\hat p_{i,e'}).
\]

V1 接受一个测量合格的观测工件，不自行猜测哪些 prompt 语义等价。

### 4.4 Observed response concentration \(X\)

复用架构记录的 exposure-conditioned response mass。它描述变化质量集中在少数已暴露来源上的程度，不识别因果影响。

### 4.5 Qualified unsupportedness \(U\)

当前为 missing。引用存在、来源身份通过或 lineage 不重复，都不足以证明 factual support。只有未来冻结的支持度 instrument 通过效度门后，才能发出数值。

### 4.6 Consequence \(K\)

由应用契约事前声明，不由 LLM 从措辞推测。V1 只允许 low / moderate / high / critical 四级，并绑定版本化 contract。

这些维度不能默认相加。高风险、高分歧和高来源集中代表不同问题，彼此不能用一个任意权重抵消。

## 5. 什么才算治理动作

动作必须说明它会获得什么新的可观测信息。V1 分三类：

1. `new_external_observation`：工具、数据库、搜索、传感器或人工核验；
2. `new_private_report`：在污染前从隔离模型或尚未暴露的 Agent 获取报告；
3. `public_reanalysis_only`：只对相同公开材料再次判断。

第三类是 consistency check，不得称作 independent verification。一个动作还必须声明来源关系：verified distinct identity、declared distinct identity、unknown relation 或 same declared lineage。除 unknown 外，候选必须绑定来源关系 authority record；所有候选都必须绑定上游 eligibility decision。这里的 distinct identity 仍不等于误差独立。

## 6. 当前冻结策略的含义

`source-novelty-lexicographic@1.0.0` 只是一条无需真值的实验候选启发式。输入动作必须已由另一个冻结的 eligibility rule 判为候选；本策略只做候选间仲裁，不自行判断某个 claim 是否值得花费资源：

1. 过滤不可用或超预算动作；
2. 优先 verified distinct identity，其次 declared distinct、unknown、same lineage；
3. 再优先新外部观测、新私密报告、公开重分析；
4. 再比较 compute、latency 和稳定 ID。

它不使用单一风险总分，也不声称最大化 expected value。只有在随机实验中相对 random、certainty-only、disagreement-only 和 static router 基线稳定提高独立 outcome 后，才可学习或讨论 Marginal Cognitive Value。

无可行动作时，高/关键后果任务升级人工；低/中后果任务弃权。该规则是保守运行语义，不是已经验证的最优策略。

## 7. 最小实验设计

### 7.1 比较臂

- ordinary discussion；
- random verification；
- certainty-triggered verification（遗留基线）；
- disagreement-triggered verification；
- source-novelty active information policy；
- oracle policy 仅作离线上界，不进入在线执行。

所有实验臂固定总模型调用、token、外部工具次数和最大延迟。

### 7.2 在线过程

```text
claim + reports + provenance + exposure + budget
  -> truth-blind risk vector
  -> eligible information actions
  -> randomized policy/action assignment
  -> new observation or explicit no-observation terminal state
  -> final private elicitation
```

### 7.3 离线评价

真值只在所有在线动作和 final private elicitation 完成后揭示，用于：

- final Brier / multiclass Brier；
- accuracy 与 abstention-aware utility；
- false-consensus rate；
- error cascade size 与 recovery time；
- 每单位调用、token、延迟的 loss reduction；
- 异质模型、任务、来源相关结构下的交互效应。

### 7.4 首个可证伪命题

**HYPOTHESIS** — 在同等预算下，优先获取新来源身份和新观察的策略，相比只看 certainty、disagreement 或随机抽查，可能降低最终 proper loss，尤其在重复来源造成的伪共识条件下。

若只在人工植入的同源错误上有效、对自然任务无增益，或收益不能覆盖成本与弃权代价，则该机制不具有广义治理价值。

## 8. 与当前系统的关系

### 保留

- claim / canonical outcome contract；
- BeliefReport、Evidence、lineage、exposure DAG；
- append-only ledger、动作生命周期、apply/sham/holdout；
- final private elicitation、independent outcome、replay。

### 降级

- 单 prompt reported certainty：可选传感器和基线；
- 固定 certainty threshold：未经效度确认的实验基线；
- public-only verifier：consistency-check carrier；
- schema/hash 数量：完整性机制，不是论文贡献本身；
- Q0–Q3：质量门，不再承担项目主叙事。

### 需要迁移

现有 `verifiedIndependentLineageCount` 和相关 metric ID 语义过强。为保持旧工件 replay，V2 字段暂不机械重命名；新工作不得据此声称统计独立。后续由 Codex 设计版本化 V3 迁移与兼容适配器。

## 9. 当前实现状态与主张上限

**FACT** — `activeInformationGovernance.ts` 已实现：

- 从 `CollectiveEpistemicStateV1` 投影无总分的在线风险向量；
- prompt sensitivity 与 factual support 的显式 missing；
- truth-blind、预算约束、确定性的 source-novelty 动作选择；
- 高后果无动作时升级，其他情况弃权；
- 决策重放与严格载体字段校验。

**FACT** — `activeInformationControl.ts` 以薄层方式复用现有内核：

- 依据逐维、非补偿规则生成 `randomized_experiment_only` eligibility；
- 候选必须绑定 eligibility decision，已知来源关系必须出现在冻结 authority snapshot；
- 只有 eligibility 允许的候选才进入既有 truth-blind arbitration；
- 复用 `GovernanceActionLedger` 验证 lifecycle；information-acquisition 动作只有在 terminal history 绑定至少一个此前不存在、类型匹配的 observation 时才算 acquisition completed；
- `public_reanalysis_only` 只能产出新 belief report，不能冒充外部 evidence acquisition。

该 completion 校验只证明架构记录了新 observation；它不证明 observation 真实、支持 claim 或改善决策。证据/报告真实性边界仍分别属于 EvidenceGraph、BeliefLedger 和离线 outcome evaluation。

**FACT** — 该模块尚未接入 production Runner，尚未经过真实 provider 实验。

**LIMITATION** — 当前 distinct identity 不是经验估计的 error independence；策略没有学习 expected information value；qualified unsupportedness 没有可用 instrument。

**Claim ceiling** — 当前只能声称已冻结并测试一个不读取真值的主动信息治理内核。不能声称它提高准确率、适用于一般组织、实现 MCV，或解决异构智能治理。
