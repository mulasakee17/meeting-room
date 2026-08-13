# SwarmAlpha：异构认知资源配置研究合同 v1
日期：2026-08-13
状态：P5 权威理论与实验设计基线（DESIGN INTENT；尚未进入实现或付费实验）
上位依据：[`SWARMALPHA_WHITEPAPER_V1.md`](../strategy/SWARMALPHA_WHITEPAPER_V1.md)
执行依据：[`SWARMALPHA_STRATEGIC_EXECUTION_PLAN_V1.md`](../plans/SWARMALPHA_STRATEGIC_EXECUTION_PLAN_V1.md)

> 本文吸收“SwarmAlpha: A Governance Runtime for Heterogeneous Intelligence”候选方案中关于能力异质性、错误依赖、少数派保护、外部验证、预算与停止的思想，并将其收缩为可识别、可证伪的 P5 研究合同。它不改变第一篇 AAMAS 候选论文的 RQ、arms、Gate 或 claim ceiling。

---

## 0. 决策摘要

### 0.1 长期定位与当前权限

长期愿景名称可以是：

> **SwarmAlpha: A Governance Runtime for Heterogeneous Intelligence**

正式研究术语使用 **heterogeneous epistemic governance**，因为 SwarmAlpha 治理的不是抽象智能等级，而是异构资源围绕具体 claim 产生的报告、证据、来源依赖、成本与行动权限。

当前状态：

- **FACT：**V6 已实现多 Agent 特例下的 claim/report/evidence/exposure/action/outcome/replay 主链；
- **FACT：**尚无通用 resource catalog、在线 CEC/MCV estimator、学习型 Router 或连续停止策略；
- **DESIGN INTENT：**P5 只研究固定预算下的一次额外认知行动；
- **PROHIBITED CLAIM：**不得称当前 SwarmAlpha 已是通用异构智能治理 runtime。

### 0.2 P5 主问题

> **Can claim-state-aware allocation of one additional epistemic action, using conditional complementarity and source lineage, improve independent proper loss under a fixed budget relative to static routing and uncertainty-only allocation?**

该问题比“动态治理能否系统性超过所有基线”更窄，因为第一项实验只识别一次额外行动的价值，不同时识别多步规划、长期学习、动态信誉和安全升级。

### 0.3 不改变近期论文

第一篇 AAMAS 候选论文继续回答 measurement、interaction 与经过 Gate 的 governance effect。P5 只有在 final report 达到 Q2、资源结果矩阵可建立且选择/评价数据隔离后进入。不得为了新定位暂停当前 measurement-validity development pilot。

---

## 1. 研究对象

### 1.1 Epistemic Resource

一个资源不是模型品牌，而是版本化、可追踪的调用身份：

```text
Resource = <resourceRef,
            kind,
            provider/model/tool/version/config,
            principal and authority scope,
            runtime/data lineage,
            eligible claim domain,
            observable output contract,
            cost/latency/risk contract>
```

`kind` 可以是 model、agent、retriever、deterministic tool、verifier、human expert 或 sensor。不同资源不强制输出相同对象：模型可以提交 probability report，求解器可以提交可重放 result/evidence，检索器可以提交 source，人工可以提交 review 或 authorized resolution。

### 1.2 Claim-relative Epistemic State

P5 的状态不是答案字符串集合，也不是一个全局 confidence：

```text
S_t = <task and claim,
       registered outcome space,
       reports and probability geometry,
       evidence and source lineage,
       exposure and revision history,
       unresolved disagreements,
       resources already consumed,
       remaining budget,
       authority and risk constraints>
```

当前 `CollectiveEpistemicStateV1` 只能作为候选描述投影；通过 held-out predictive validation 前不自动等于 `S_t` 的充分统计量。

### 1.3 Epistemic Action

```text
Action a = <resourceRef,
            claimRef,
            query/evidence scope,
            expected observable,
            target/delivery scope,
            cost/latency/risk commitment>
```

长期动作空间可以包含 `CALL / CHALLENGE / VERIFY / ABSTAIN / STOP`。P5 v1 只允许：

1. `CALL_ONE`：调用一个尚未消费的独立资源；
2. `VERIFY_ONE`：调用一个冻结、与任务匹配的外部验证器；
3. `STOP`：不再调用资源。

`CHALLENGE` 延期，因为它同时改变 prompt、交互和计算量，且未必提供新信息。

---

## 2. 核心构念

### 2.1 能力、校准、互补性、权限必须分开

| 构念 | 含义 | 是否直接授权行动 |
|---|---|---|
| Capability | 资源在冻结任务域上的历史 outcome performance | 否，只是候选特征 |
| Calibration | reported probability 与 resolution 的匹配 | 否，只是候选特征/适用性条件 |
| Error dependence | 控制任务条件后的错误共同变化 | 否，只是候选特征 |
| Complementarity | 给定已有 state 后的 outcome 增量 | 通过 held-out 后才可 |
| Authority | 制度允许资源读取、提交或改变什么 | 是约束，不是预测分数 |
| Budget allocation | 在候选行动间做出的策略选择 | 是待评估处理 |

不建立 `αQ + βD + γU` 型线性总分作为权威 MCV。不同量的尺度、重复信息和任意权重会让结果依赖调参。

### 2.2 Conditional Epistemic Complementarity

给定当前 state `S_t`、冻结更新规则 `A`、候选行动 `a`、授权 resolution `Y` 和 proper loss `ℓ`：

```text
CEC(a | S_t)
  = E[ ℓ(p_t, Y)
       - ℓ(A(S_t, observation_a), Y)
       | S_t, a ]
```

CEC 是尚未扣除调用代价的条件化 outcome-information gain，允许为负。它必须相对于当前 state 定义：同一个强模型在已有同源报告时可能冗余，较弱资源在特定 state 下可能提供正增量。

### 2.3 Orthogonal Intelligence

`Orthogonal Intelligence` 只作为直观名称。正式分析区分：

1. 资源身份多样性；
2. 输出或错误的统计多样性；
3. held-out 有效互补性（CEC）。

前两项不推出第三项。低相关噪声不是有价值的正交智能；不同 provider 也不证明训练数据、知识来源或推理错误独立。

### 2.4 Marginal Cognitive Value

```text
MCV(a | S_t)
  = CEC(a | S_t)
    - λ · E[cost(a)]
    - μ · E[latency(a)]
    - ρ · E[risk(a)]
```

`λ/μ/ρ` 是预注册的研究或部署偏好，不是自然常数。主要科学比较优先采用固定预算约束下的 proper loss，避免所有价值被任意货币化。MCV 作为 secondary decision quantity 时必须同时报告原始 CEC、cost、latency 与 risk components。

### 2.5 Suspicious Consensus

解析前使用：

> **insufficiently independent consensus**：多个表面支持实际共享已知 lineage，或独立性未知，因此不能按独立证据累加。

解析后才能使用：

> **false correlated consensus**：上述共识与授权 resolution 不一致。

来源相关只能降低“独立支持”的证据解释，不能在不知道真值时直接证明多数错误。少数派保护的对象是具有独立、可验证新增信息的 minority report，而不是分歧本身。

### 2.6 Reputation 边界

P5 v1 不实现跨 episode `Epistemic Reputation`。只允许使用在 development split 上估计、在 held-out 前冻结的：

```text
performanceEstimate(resourceRef, domain, version)
```

它不是人格、永久信誉或 authority。真正动态 reputation 必须处理版本漂移、选择性调用、domain transfer、expiry、appeal 与少数派锁定，归入 principal-aware P6。

---

## 3. 候选特征与禁止偷换

### 3.1 Capability map

能力地图按 `resource version × task family × claim domain` 报告 proper loss、accuracy、coverage、calibration、cost 与 latency。不得把供应商 benchmark 排名直接当作当前任务能力。

### 3.2 Error-dependence map

pairwise error correlation 只作描述起点。正式候选特征至少按 task family、K、difficulty proxy、resource version 和 lineage 分层；必须保留高阶依赖未知这一限制。不能用被策略选择后的观测均值直接排名资源。

### 3.3 Task features

第一版 Task Analyzer 只接收可验证或人工冻结的字段：task family、outcome kind/K、context length、available verifier、required resource kind、risk class 和 authority scope。

`difficulty=0.74`、`reasoning_required=true` 等模型推断字段只能作为 development candidate feature，不能冒充任务真值或直接授予权限。

### 3.4 Evidence quality

证据分析优先使用结构化 identity、lineage、verification status 和 actual exposure。语义相似或“推理路径不同”不能独立证明来源不同；LLM judge 产生的 evidence-quality label 必须有独立效度，不得成为循环评价者。

---

## 4. 最小实验设计

### 4.1 支持域

P5 v1 推荐：

- 3 个冻结 resource identities；
- 1 个主任务族 + 1 个外部复现任务族；
- binary 或固定 K categorical claim；
- 每个 episode 一个初始 report/state；
- 最多一次额外 `CALL_ONE` 或 `VERIFY_ONE`；
- final private elicitation 后再开 authorized resolution；
- development/calibration、policy held-out 和 final test 严格隔离。

300–1000 题 × 4 领域 × 多动作 × 多 ablation 不是 MVP。样本量由 run-level/cluster-level pilot variance 和预算模拟决定，不能先拍题数。

### 4.2 Arms / policies

最低比较：

| Policy | 定义 |
|---|---|
| Strong-only | 固定调用 development 上最强资源 |
| Cheap-only | 固定调用最低成本合格资源 |
| Static pair | 固定 initial + development 最佳第二资源 |
| Cost-matched ensemble/majority | 相同预算的独立并行基线 |
| Query-only router | 只看预处理 task/query features |
| Uncertainty-only | 只看当前 report uncertainty |
| Diversity-only | 使用冻结 error-dependence/resource-diversity feature |
| SwarmAlpha | claim state + lineage + frozen CEC candidate policy |
| Oracle | 看到 outcome 后选最优，只作不可达上界 |

LLM-as-Judge 和 multi-agent debate 可作 secondary baseline，但必须成本匹配，不能让它们得到不同信息或更多调用后直接比较。

### 4.3 Assignment 与内生性

资源策略决定谁被调用，因此观察到的 performance 存在选择偏差。development 阶段必须有随机 exploration 或已知 assignment probability；所有 eligible action、未选择 action、成本与 missingness 均进入审计。policy test 阶段冻结策略，final test 一次开封。

不得：

- 用同一 task outcome 选择最优资源又证明其有效；
- 只分析成功完成的调用；
- 将多个 resource outputs 当独立样本扩大 N；
- 事后筛选 minority-truth cases 作为主评价集；
- 根据 final test 修改 CEC feature、threshold 或 baseline。

### 4.4 Primary estimand

主 estimand：固定预算下，策略相对预注册 baseline 的 run-level operational proper-loss difference。

共同报告：

- cost、latency、calls、terminal missingness；
- 相对 oracle regret；
- cost–quality Pareto frontier；
- 每个 task/resource stratum 的异质性。

不使用 `accuracy / cost` 作为主指标；该比值在成本接近零、任务不平衡或 accuracy floor/ceiling 下容易误导。

### 4.5 Secondary governance metrics

- false correlated consensus rate；
- minority-truth opportunity count 与 recovery rate；
- false override rate；
- verification yield：每次 verifier 调用的 proper-loss 变化及其成本；
- abstention/stop rate；
- high-confidence error rate；
- calibration 与 coverage。

所有比例的分母必须预注册。Minority Truth Recovery 以全部预注册 minority-truth opportunities 为分母，不能只保留成功恢复或人为筛选的样本。

---

## 5. Governor v0

### 5.1 输入

Governor 只消费已经通过 authority 和 measurement Gate 的字段：

```text
task/claim contract
current valid reports
source/model/runtime lineage
actual exposure
remaining budget
eligible resources/actions
frozen development estimates
authority/risk constraints
```

reported confidence 未通过 Q1/Q2 或 domain-specific calibration 时，不得作为跨资源可比较的绝对量。

### 5.2 选择

v0 使用冻结 rule/policy，不使用 RL。它选择一个 eligible action 或 STOP，并记录：候选集、输入 feature version、assignment probability、选择理由、预算、预期 observable 和实际结果。

### 5.3 停止

理论停止条件是所有授权行动的 net MCV 不大于零，或预算/权限耗尽。v1 实证中不直接假设在线 MCV 已准确；采用在 development 冻结、在 held-out 检验的 stopping policy，并与固定调用数和 uncertainty-only stop 比较。

### 5.4 Decision Trace

现有 audit/replay 链应扩展为 `Epistemic Resource Trace`，至少绑定：

```text
stateRef
candidateActionRefs
policy/version
assignmentProbability
selectedAction or STOP
resource/config/lineage
observed contribution
cost/latency/terminal status
state update
final outcome and score
```

该 trace 支持内部审计和确定性重放，不自动提供外部真实性、因果充分性或人类可解释性。

---

## 6. 外部验证与风险

### 6.1 VERIFY 的优势与边界

数学求解器、代码执行和权威数据库可能提供比继续 LLM 互评更独立的信息。但“工具”不自动等于真值：测试可能不完备、检索可能过时、数据库可能错误、解析适配器可能失真。

每个 verifier 必须冻结：适用 task domain、输入权限、输出契约、失败状态、cost/latency、版本和 resolution 关系。Verifier 输出是 evidence 或 verdict；除非任务契约明确授权，它不是最终 resolution。

### 6.2 Risk-aware governance

风险等级必须来自任务/部署 owner 的冻结 policy，而不是 Governor 自行生成的自然事实。高风险任务需要更严格权限、abstain/escalate 和 human review，但 P5 v1 不声称建立 scalable oversight 或通用 AI Safety 系统。

风险成本可以进入 MCV 或作为硬约束；同一实验不得在看到结果后切换两种解释。

---

## 7. Gate 与停止规则

### 7.1 进入 Gate

P5 实现前必须满足：

1. final outcome report 在相应 domain 达到 Q2；
2. resource/task identity、lineage、cost 与 terminal status 可冻结；
3. 任务具有独立 resolution；
4. development 与 held-out split 无 semantic leakage；
5. 至少一个候选额外行动有真实新增信息的理论可能；
6. assignment/propensity 和 run-level analysis 可识别。

### 7.2 结果 Gate

- **GO：**SwarmAlpha policy 在 held-out 上优于 static、uncertainty-only 和 diversity-only 基线，proper-loss 增量在固定预算下仍有实际意义；
- **REVISE：**只在特定 resource/task domain 有效，收缩 domain/version 后重新冻结；
- **STOP：**简单静态组合持平或更优、CEC feature 不稳定、额外行动无信息增量，或主要收益来自更多预算/信息不匹配。

### 7.3 禁止用复杂度挽救

v0 STOP 后不得立即改成 contextual bandit、RL、复杂图网络或更多动作。只有简单机制在独立数据上证明存在可学习 signal，才允许学习型 governor。

---

## 8. 分阶段路线

### P5-0：只读资源可识别性盘点

输出 task×resource×outcome×cost×lineage 可用性表，回答现有 artifact 是否支持 P5；不改生产代码。

### P5-1：Resource map

在 development 数据上建立 capability/calibration/error-dependence 描述地图；所有量保持 descriptive，不获得控制权。

### P5-2：One-extra-action randomized study

用随机 exploration 估计额外资源在不同 state 下的增量，冻结 CEC candidate features 和 baseline。

### P5-3：Frozen Governor v0 held-out test

一次性比较静态、uncertainty-only、diversity-only 与 claim-state-aware policy。

### P5-4：Replication

至少在一个不同任务族或 resource pool 复现后，才讨论连续 `CALL/VERIFY/STOP`。

### P6+：延期事项

- 动态 reputation；
- CHALLENGE；
- 多步 sequential policy；
- contextual bandit/RL；
- 人类专家长期节点；
- principal-aware 责任与 Web3；
- 通用 Safety/Scalable Oversight 声称。

---

## 9. 与社会热力学的连接

异构资源配置为社会热力学增加一种可测微观机制：资源种类、来源依赖、成本与边际信息增益。长期可以研究：

- 随资源数增加，CEC 是否出现饱和或边际递减；
- lineage correlation 如何改变 false consensus 和恢复时间；
- 资源组合、拓扑与预算是否形成稳定 Pareto frontier；
- 随机资源注入是否产生可重复宏观响应。

在 ST-2/3 前，这些只是统计假设。不得把 CEC、MCV 或 error graph 重新包装成新的单一“社会能量”或 `F`。

---

## 10. 成功标准与 claim ceiling

### 最低科学成功

即使 Governor 不优于简单基线，只要研究能在冻结条件下回答以下问题，也形成有价值的边界证据：

- 能力异质性是否稳定；
- 错误依赖是否超出 task difficulty 和 lineage 解释；
- 一次额外调用的增量是否可预测；
- 静态组合何时已经接近 oracle；
- 外部 verifier 何时比额外模型更有价值。

“存在能力异质性”或“超过 Majority Vote”本身不足以证明 governance 成立。

### 强成功

claim-state + lineage-aware policy 在固定预算和 held-out 任务上稳定超过强静态/uncertainty/diversity baselines，并在不同 task/resource stratum 上具有可解释的支持域。

### 最大允许结论

> 在测试的任务、资源池、预算和版本域内，基于可审计 claim state 与来源依赖配置一次额外认知行动，相对预注册基线改善了独立 proper loss/成本权衡。

不得由此声称：

- 通用异构智能已经被治理；
- 系统理解模型的真实推理路径；
- reputation 可跨域迁移；
- 未测试模型/任务自然泛化；
- 系统已达到 scalable oversight 或通用 AI Safety；
- MCV 是跨部署不变的自然量。
