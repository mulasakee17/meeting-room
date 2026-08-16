# SwarmAlpha SOTA 与真实缺口映射

状态：PaperSpine Research Agent C 产物（2026-08-13）  
用途：为 AAMAS 长文/研究白皮书确定贡献边界；不是论文正文，也不构成引用库的最终版本。  
证据纪律：本表将仓库实现、可复现实验、测试、设计合同与长期愿景分开。外部工作只采用论文或标准的一手页面；项目证据按 `docs/REASONING_PROTOCOL.md` 的层级解释。

## 1. 结论先行

SwarmAlpha 不能把“多 Agent 辩论”“让模型自报置信度”“按不确定性调用验证器”“在多个模型间路由”“记录 provenance”单独写成新贡献：这些方向均已有成熟或快速增长的研究。项目目前最可信的差异化位置是：

> **把提示词条件下的显式概率报告视为待验证的测量工具，而不是模型内心信念；把报告、证据、来源依赖、暴露、验证动作与独立结果放进同一条可重放 authority chain；只有测量资格、检测效度和随机化行动效应依次通过后，才允许信号获得控制权。**

这一位置把已有工作的几个断面连接起来：multi-agent debate 主要比较协议输出，置信度研究主要检验单模型不确定性，selective prediction 研究主要决定是否回答/升级，routing 研究主要优化质量—成本，社会学习研究主要刻画意见更新，而 provenance 标准主要描述来源结构。SwarmAlpha 的候选贡献不是替代这些方向，而是研究它们之间经常被省略的资格链：

```text
prompt / information condition
  -> explicit probability report
  -> measurement-validity qualification
  -> detector qualification
  -> randomized verification allocation
  -> delivered information and belief update
  -> independently scored collective outcome
  -> cost / coverage / missingness-aware governance claim
```

目前仓库已经较强地支持这条链的语义、载体和重放部分；只对测量与治理效果提供探索性证据。近期论文必须是 **measurement-first，governance-as-tested-object**，不能写成已建立的通用治理 runtime。

## 2. 相关工作坐标系

### 2.1 Multi-agent debate 与多 Agent 失效

- Du 等的 ICML 2024 工作表明，多模型实例通过多轮辩论在其测试任务上可改善推理和事实性，是“辩论可能有效”的代表性正结果。[Du et al., 2024](https://proceedings.mlr.press/v235/du24e.html)
- Smit 等在同届 ICML 系统比较辩论、提示和集成策略，发现当前 MAD 并不稳定优于 self-consistency 等方法，且对超参数敏感。这直接反对“增加讨论自然提高集体智能”的前提。[Smit et al., 2024](https://proceedings.mlr.press/v235/smit24a.html)
- Cemri 等从多框架任务轨迹归纳 14 类 MAS 失败，覆盖 specification/system design、inter-agent misalignment、task verification/termination，说明端到端成功率不足以定位失效。[Cemri et al., 2025](https://arxiv.org/abs/2503.13657)
- 稀疏通信拓扑、身份匿名化、人格稳定性及群体从众研究进一步表明，拓扑、身份提示和共同模型偏差会改变讨论动态；“更多消息”既可能纠错，也可能强化相关错误。[Li et al., 2024](https://aclanthology.org/2024.findings-emnlp.427/)、[Baltaji et al., 2024](https://aclanthology.org/2024.c3nlp-1.2/)、[Choi et al., 2026](https://aclanthology.org/2026.acl-long.650/)

由此可见，SwarmAlpha 的切入点不能只是再提出一种 debate protocol，而应解释并实验检验：什么信号有资格触发什么干预、干预是否真正被交付、群体动态变化是否最终改善独立结果。

### 2.2 Verbalized confidence、calibration 与 prompt dependence

- Kadavath 等研究 `P(True)` 与 `P(IK)`，发现适当格式下模型可产生有预测力的自评，但跨任务校准仍困难。[Kadavath et al., 2022](https://arxiv.org/abs/2207.05221)
- Tian 等表明，向 RLHF 模型直接询问概率、考虑其他答案等提示设计可显著影响 verbalized confidence 的校准。[Tian et al., 2023](https://openreview.net/pdf?id=g3faCfrwm7)
- Yang 等进一步系统指出 verbalized confidence 的可靠性强烈依赖数据、模型和询问方式；某些 prompt 可以改善校准，但不存在脱离 elicitation contract 的通用置信度。[Yang et al., 2025](https://openreview.net/forum?id=CVRdNQvFPE)
- Kuhn 等的 semantic entropy 通过对多次生成进行语义聚类刻画不确定性，说明“自报概率”并非唯一不确定性路径，也提醒表面文本变异与语义不确定性不同。[Kuhn et al., 2024](https://www.nature.com/articles/s41586-024-07421-0)
- Proper scoring 的理论要求概率报告在 resolution 后由 proper rule 评价；Brier 等规则可以激励诚实概率报告，但单个 loss 不等于跨样本 calibration。[Gneiting and Raftery, 2007](https://doi.org/10.1198/016214506000001437)

因此，SwarmAlpha 必须把 prompt、选项坐标、信息视图、模型版本和调用配置视为测量合同的一部分。LLM 输出的概率分布是 **prompt-conditioned reported belief**，不是直接读出的 latent belief；熵、JSD、TV、Brier、ECE 等是基于该报告或 resolution 的计算量，也不能反向证明报告具有心理表征效度。

### 2.3 Selective prediction、验证与停止

- 选择性预测把不确定性用于 abstention/deferral，并以 risk–coverage 而非单一 accuracy 评价；LLM 自评可作为 selection score，但必须在目标域验证。[Ren et al., 2023](https://aclanthology.org/anthology-files/pdf/findings/2023.findings-emnlp.345.pdf)
- 近期 verification/abstention 研究表明，选择性调用证据工具可以改善被回答样本的可靠性，但收益依赖 evidence structure，且 calibration、coverage 和成本可能相互权衡。它们支持“验证是一种有成本的行动”，不支持“高置信/高熵天然是正确触发器”。
- SwarmAlpha 自身的探索实验恰好提供反例：`certainty >= 0.7` 在当前 K=3 工程样本中与更高错误率相关；因此阈值合法性、预测效度与行动效应必须分开。

真实缺口不是发明 abstention，而是把 **触发信号效度、随机化 action assignment、实际 delivery/compliance、final private outcome、missingness 与成本** 连接在同一个可审计实验对象中。

### 2.4 Routing、cascades 与 mixture-of-experts

- FrugalGPT 学习 LLM cascade，在质量—成本约束下决定何时升级模型，证明异构 API 配置本身已有成熟研究。[Chen et al., 2024](https://openreview.net/pdf?id=cSimKw5p6R)
- RouteLLM 从偏好数据学习强/弱模型路由，在多个基准上优化成本—质量前沿。[Ong et al., 2025](https://openreview.net/pdf?id=8sSqNntaMr)
- Smoothie 等工作探索无标签模型路由，说明无需显式 agent society 也能利用模型互补性。[Smoothie, 2024](https://openreview.net/forum?id=pPSWHsgqRp)
- 模型内部的 MoE 通过 token-to-expert routing 在固定计算量下激活部分参数，但其专家、目标和训练机制与外部可调用认知资源治理不同。[Fedus et al., 2022](https://www.jmlr.org/beta/papers/v23/21-0998.html)

所以，“异构智能资源调度”不是足够窄的论文新意。SwarmAlpha 的长期候选空隙是 **claim-state-aware、lineage-aware 的边际行动配置**：不只预测哪个模型平均更强，而是估计在当前已有报告、错误依赖和证据状态下，再调用某个模型/工具能否带来新的 proper-loss 信息。然而仓库目前尚无通用 resource catalog、在线 CEC/MCV estimator 或 held-out routing 结果，这只能作为下一篇论文的 DESIGN INTENT。

### 2.5 Social learning、opinion dynamics 与错误相关性

- DeGroot 模型形式化了主体按固定权重线性更新并趋于共识；共识结果由网络权重决定，而不保证事实正确。[DeGroot, 1974](https://www.tandfonline.com/doi/abs/10.1080/01621459.1974.10480137)
- Friedkin–Johnsen 模型引入个体对初始立场的固执/易感性，提供了讨论动力学的经典参照。[Friedkin and Johnsen, 1990](https://escholarship.org/uc/item/2r82w1vs)
- 现代 MAD 研究已开始把初始观点多样性与 calibrated confidence 作为讨论成败条件，进一步压缩了“用 confidence 加权讨论”的新颖空间。[Zhu et al., 2026](https://aclanthology.org/2026.findings-acl.1694/)

SwarmAlpha 仍有可发展的缺口：传统意见动力学通常假设状态和更新规则可观察/给定，而 LLM 系统中的“观点”是提示词条件下生成的文本或概率报告，主体还可能共享参数、训练数据和提示模板。项目可以把 **来源同源性、报告暴露与提示词操纵** 纳入经验可审计对象，但只有随机化 exposure/action 才能把传播关联提升为因果影响。

### 2.6 Provenance 与可重放性

- W3C PROV-DM 区分 entity、activity、agent、derivation、delegation，并提供领域无关的 provenance 结构。[W3C PROV-DM](https://www.w3.org/2012/10/prov-dm)
- Provenance 记录能支持质量/可靠性评估，却不自动证明记录内容真实，也不等于外部防篡改承诺。
- SwarmAlpha 的内容 hash、versioned contract、source-event 引用、schema-5 carrier 和 deterministic replay 与这些原则相容，但当前不是完整 PROV-DM 实现，也没有 detached trusted timestamp/signature。

项目的可发表空隙不应写成“首次有 provenance”，而是把 provenance 具体绑定到 LLM 多 Agent 研究中的 **claim/report/exposure/verification/action/outcome** 语义，并用 fail-closed replay 阻止分析静默混用；这一点是方法与实验基础设施贡献，而不是治理效果证据。

## 3. 候选贡献—证据—缺口风险表

| 候选贡献 | 已有工作已经做到什么 | 本项目现有证据 | 真实缺口 | 当前可允许主张 | 主要风险 |
|---|---|---|---|---|---|
| **C1. 对显式概率报告实行 measurement-first 资格链** | Verbalized confidence 已被广泛研究；已有工作证明其可有预测力，也证明其高度依赖 prompt、模型和任务。Proper scoring 与 calibration 理论成熟。 | `EPISTEMIC_QUANTITY_SEMANTICS.md` 明确区分 `reported_belief`、derived quantity、governance estimate、outcome evaluation；`MEASUREMENT_VALIDITY_PROTOCOL_V1.md` 冻结 Q0–Q3、paraphrase/order/evidence-response/held-out Gate。 | 多数多 Agent 工作直接把自报 confidence 当权重或控制信号，较少把它先当作需跨扰动验证的 instrument，再限定其控制权限。 | **DESIGN + IMPLEMENTATION CLAIM：**提出并部分实现一套面向多 Agent 显式概率报告的分级资格协议；不把报告称为 latent belief。 | measurement pilot 尚未完成；如果 Q1/Q2 失败，贡献应改写为效度审计和负面发现，不能声称“测量准确”。 |
| **C2. 严格拆分 LLM 自报量、prompt-conditioned observation 与系统计算量** | 置信度、entropy、自一致性、judge score 等已有大量方法，但不同论文常用不同构念名；prompt dependence 已有强证据。 | 六层 quantity semantics、task-owned binary/categorical contracts、method/source IDs、legacy adapter 边界已经落地并有测试。 | 真缺口是统一研究语义与防止计算量认识论升级，不是新公式。该贡献有助于让 detector/action 的输入可审计。 | **METHOD CLAIM：**给出可执行语义分层，规定自报概率、派生不确定性、启发式估计、结果评分和治理状态不可互换。 | 容易被审稿人视为工程 ontology；必须用误用案例、效度实验或分析差异证明它改变科学结论。 |
| **C3. Claim-centric、可重放的治理 authority chain** | W3C PROV、实验 lineage 和事件日志已有成熟原则；MAS failure work也做轨迹分析。 | V6 已有 claim/report/evidence/exposure/decision/assignment/action/final outcome/schema-5 replay；80/80 探索 run 达到 `sealed_decision_replay_verified` 且 verifier 零 issue。 | 真实差异是将治理权与具体 claim、source、时间和随机化单位绑定，并区分 structural replay、decision replay 与外部真实性。 | **IMPLEMENTED/TESTED CLAIM：**在测试路径上，权威对象可确定性重放且语义冲突 fail-closed。 | Replay 只证明内部一致性，不证明来源真实、prompt 无隐性泄漏或实验事前不可修改；不得称 tamper-proof。 |
| **C4. 从“讨论协议”转向嵌套的 measurement → detector → action → outcome 实验设计** | Debate 研究比较协议；selective prediction 比较 abstention；routing 比较模型选择；但各自已有强基线。 | 研究合同区分 protocol-arm assignment、G 内 action assignment、measurement-condition assignment；final private outcome 与 operational Brier 已实现。 | 候选缺口是识别链：先验证 signal，再验证 detector，再随机化 action，最后用独立结果评估，避免用共识/稳定性替代质量。 | **DESIGN CLAIM：**提出避免循环论证和中介—结果混淆的嵌套实验框架。 | 如果没有跨层实证，容易成为“设计规范论文”；第一篇至少需完成 measurement validity，并给出可解释的 action pilot 或有价值的 stop 结果。 |
| **C5. 选择性验证的认知治理机制** | Selective prediction、RAG verification、fact-checking 和 abstention 已研究何时调用额外证据；MAD 也已有 evidence-weighted/verification 机制。 | Verification Verdict V2 已实现 apply/sham/holdout 及 public-only evidence scope；80 runs 可执行，17 apply/7 sham/2 holdout 安全检查通过。 | 真缺口不是“加入验证器”，而是对触发器、匹配 sham、holdout、delivery 和 proper-loss outcome 进行同链随机评估。 | **MECHANISM FEASIBILITY CLAIM：**机制与随机化载体可运行；当前不允许效果主张。 | 现有 threshold 初步反预测；holdout 只有 2 个、bootstrap 无效，治理 estimand 为 DEFER。若不改进 eligible sample 与测量资格，机制论文不成立。 |
| **C6. 对高置信错误与 miscalibration 的治理** | Calibration、selective prediction 和 confidence-modulated debate 已直接研究高置信错误；proper scoring 可评价概率质量。 | 探索样本显示严重过度自信：K=3 ECE 0.4046；certainty≥0.7 时错误率 0.7436，高于未 flag 的 0.4884；高置信 flag 在该域反预测。 | 项目可研究“信号失效时治理应 fail closed”，而不是预设高 confidence 值得惩罚/验证。 | **EXPLORATORY FINDING：**在指定 DeepSeek/HiddenBench 工程样本中，固定 certainty 阈值未获得检测资格，且表现为反预测。 | 样本与域有限；ECE 为 secondary；不能推广到其他模型、prompt、K 或称自报置信度普遍无效。 |
| **C7. 错误依赖、同源性与‘正交智能’** | Ensemble/MAD 已强调 diversity；routing/MoE 已优化专家选择；近期工作直接研究 diversity + confidence。 | 现有 evidence lineage、source IDs、suspicious-consensus/CEC/MCV 理论合同；尚无真实多资源 outcome matrix 或在线 estimator。 | 可能的真缺口是按当前 claim state 估计条件互补性，而非按模型品牌或独立 benchmark 选择资源。 | **HYPOTHESIS / FUTURE WORK：**来源依赖和条件边际 proper-loss 增量可能比单体能力排名更适合有限预算资源配置。 | 目前无 P5 实证；“Orthogonal Intelligence/MCV”若写成已实现量会严重越界，也可能与 diversity-aware routing 重合。 |
| **C8. 固定预算下的异构认知资源治理 runtime** | FrugalGPT、RouteLLM、Smoothie、MoE 已覆盖质量—成本路由与稀疏专家选择。 | `HETEROGENEOUS_EPISTEMIC_GOVERNANCE_RESEARCH_CONTRACT_V1.md` 仅冻结 one-extra-action 研究合同；当前无通用 resource catalog/router/stopping policy。 | 只有加入 claim state、source dependence、action authority、verification provenance 和 randomized outcome 后，才可能区别于普通 router。 | **DESIGN INTENT：**长期目标是治理异构资源围绕 claim 的报告、证据、成本与行动权限。 | 近期论文若把此定位放在标题/主贡献，会被 RouteLLM/FrugalGPT 直接压制，且实现证据不足。宜作为 discussion/roadmap。 |
| **C9. 社会学习与错误传播的经验桥梁** | DeGroot/Friedkin–Johnsen 已有成熟动力学；LLM debate 研究已发现从众、身份偏差、人格不稳定和 bias amplification。 | exposure events、observedReportIds、private final elicitation 和 propagation DAG 设计存在；语义协议明确 exposure≠注意/理解/接受/因果影响。 | 可研究共享模型与来源依赖下错误级联、恢复和少数派保护，但需随机 exposure 或其他识别设计。 | **DESCRIPTIVE CLAIM：**项目可构造可审计 exposure/propagation association；不得称 causal influence。 | 文本引用不等于认知采纳；同模型 Agent 非独立；未经随机化的 influence/Gini/consensus 容易被误读。 |
| **C10. 社会热力学作为跨尺度长期理论** | 统计物理与 opinion dynamics 已有大量宏观量；传统模型通常预设状态、相互作用和更新方程。 | 旧项目有热力学量与解耦分析，但被标记为 legacy；当前 V6 未允许其进入控制，且第一篇证据基线不使用 legacy outputs。 | 只有先证明微观报告和传播事件具有测量资格，再证明宏观量跨规模/拓扑预测 cascade/recovery，社会热力学才可能形成原创理论。 | **SPECULATION：**未来可检验微观可审计事件是否产生可迁移的宏观状态方程。 | 最大风险是用类比替代定义、用单一“能量/F”掩盖多构念、在没有 scaling law/transport evidence 时宣称大一统理论。第一篇不应列为已贡献。 |

## 4. 近期论文最稳的贡献组合

### 4.1 建议主贡献

第一篇 AAMAS 候选稿应以以下三项构成贡献主干：

1. **语义贡献：**区分 prompt-conditioned reported belief、派生量、治理估计、结果评价与控制状态，并把 claim/options/information view/prompt/model config 纳入测量合同。
2. **方法贡献：**提出 measurement → detector → randomized action → independent outcome 的分级资格链，给出 coverage、paraphrase/order robustness、evidence response、proper loss 与 cluster-aware Gate。
3. **系统/可复现贡献：**实现 claim-centric authority chain 和 deterministic replay，使报告、来源、暴露、分配、行动与 final private outcome 可交叉验证；以真实探索 run 说明该纪律能暴露阈值反预测与不可解释治理效应，而不是掩盖它们。

若三天 measurement pilot 达到 Q1/Q2，可把主张增强为“在指定 domain 中，显式概率 instrument 对 nuisance 扰动稳定、对证据操纵有方向响应，并在 held-out resolution 上提供 proper-loss 增量”。若未通过，论文仍可转为：

> 多 Agent 认知治理中常用的显式置信信号并非默认有效；一个可审计、非补偿式效度协议揭示了其具体失效域，并阻止无效信号获得控制权。

这是有价值的负面/方法论文方向，但需要足够任务簇、强基线和清晰 failure characterization。

### 4.2 不宜作为近期主贡献

- “首次提出 multi-agent governance/debate”；
- “LLM 可以准确自报内心信念”；
- “高置信低证据应被罚，因此治理有效”；
- “replay 证明数据真实或不可篡改”；
- “固定阈值检测高风险 Agent”；
- “已实现通用异构智能 Router/MCV”；
- “社会热力学已经解释 LLM 社会”；
- “共识更高、Gini 更低或意见更稳定意味着决策更好”。

## 5. Reviewer 视角下的最强反驳与应对

| 潜在审稿意见 | 是否成立 | 需要的应对 |
|---|---|---|
| “这只是把 verbalized confidence 加到 multi-agent debate。” | 若没有 measurement validity 与 authority chain 实证，成立。 | 把 prompt/contract/扰动/Gate 写成核心方法；比较直接 confidence threshold、entropy/semantic-entropy 类信号和不使用概率的基线。 |
| “这是 provenance 工程，不是 AAMAS 科学贡献。” | 部分成立。 | 证明 provenance/资格链改变了可接受结论：例如阻止反预测 threshold、发现 arm 分类/分母错误、使治理 estimand DEFER；再用随机实验回答机制问题。 |
| “Brier/ECE 已是标准量，没有新意。” | 成立。 | 新意不能放在指标本身，而在 instrument qualification、canonical coordinates、missingness、cluster unit 与控制权限 Gate。 |
| “多个同模型实例不构成异构智能。” | 当前成立。 | 第一篇明确研究多 Agent 特例；异构资源只作为 P5 设计合同。后续至少跨模型/工具，并报告错误依赖与版本域。 |
| “治理效果没有建立。” | 成立。 | 诚实报告 DEFER；近期先完成 measurement validity。只有 balanced holdout/sham/apply、足够独立 task clusters 和独立 outcome 后才升级主张。 |
| “Prompt 本身同时改变测量对象和被测量行为。” | 成立且关键。 | 将 prompt 定义为 instrument/protocol 的组成部分；冻结逐字 prompt/hash；以 paraphrase、option permutation、evidence ladder 分解 nuisance 与 signal。 |
| “自报概率既参与治理又用于评价，存在循环。” | 若不使用独立 final elicitation/resolution，成立。 | 将 interaction report、detector signal、final private outcome 分开；resolution 在 terminal records 后开放；proper loss 只用于独立 outcome。 |
| “社会热力学只是隐喻。” | 对近期证据成立。 | 第一篇降为 future hypothesis；未来预注册宏观量、跨规模/拓扑 transport 与增量预测基线，不建立单一总分。 |

## 6. Gap Summary

### 6.1 最可能形成 AAMAS 贡献的真实缺口

现有工作分别回答“辩论是否提高输出”“模型能否自评不确定性”“何时 abstain/verify”“调用哪个模型”“意见如何更新”。仍有空间系统回答：

> **在多 Agent 交互中，一个由提示词诱导的显式概率报告，经过什么可证伪的资格检验后才有权触发验证；验证如何被随机分配和审计；其对独立集体结果的影响如何在来源依赖、成本与缺失条件下估计？**

SwarmAlpha 已有回答该问题所需的大部分语义和审计内核，但尚缺决定论文强度的实证中段：真实 paraphrase/evidence-response/held-out validity，以及足量、平衡、cluster-aware 的治理行动实验。

### 6.2 贡献强度分级

- **现在可守住：**语义分层、资格协议、authority/replay 内核、探索性反预测结果、治理效应 DEFER。
- **完成 measurement pilot 后可能守住：**指定 domain 的 report instrument validity 或明确 failure-domain characterization。
- **完成随机治理实验后可能守住：**在指定任务/模型/预算下，某种选择性验证政策对独立 proper loss 的因果效应。
- **尚不能守住：**通用异构智能治理、MCV 优于强 Router、跨主体 reputation、社会热力学定律。

### 6.3 最终定位建议

近期论文标题和摘要应避免把 Heterogeneous Intelligence Governance 写成已经完成的系统能力。更稳的学术定位是：

> **SwarmAlpha is a measurement-first framework for auditable epistemic intervention studies in LLM multi-agent systems. It treats explicit probability reports as prompt-conditioned instruments that must earn control authority through validity tests, and evaluates interventions against independent proper-loss outcomes.**

长期白皮书可以保留：

> **SwarmAlpha: A Governance Runtime for Heterogeneous Intelligence.**

但必须明确这是由当前 multi-agent 特例、未来 claim-state-aware resource allocation 和尚待验证的社会热力学跨尺度理论组成的研究路线，而不是当前实证结论。

## 7. 一手来源清单（供后续 citation bank 扩展）

1. Du, Y. et al. *Improving Factuality and Reasoning in Language Models through Multiagent Debate*. ICML 2024. <https://proceedings.mlr.press/v235/du24e.html>
2. Smit, A. P. et al. *Should we be going MAD? A Look at Multi-Agent Debate Strategies for LLMs*. ICML 2024. <https://proceedings.mlr.press/v235/smit24a.html>
3. Cemri, M. et al. *Why Do Multi-Agent LLM Systems Fail?* 2025. <https://arxiv.org/abs/2503.13657>
4. Li, Y. et al. *Improving Multi-Agent Debate with Sparse Communication Topology*. Findings of EMNLP 2024. <https://aclanthology.org/2024.findings-emnlp.427/>
5. Baltaji, R. et al. *Conformity, Confabulation, and Impersonation: Persona Inconstancy in Multi-Agent LLM Collaboration*. C3NLP 2024. <https://aclanthology.org/2024.c3nlp-1.2/>
6. Kadavath, S. et al. *Language Models (Mostly) Know What They Know*. 2022. <https://arxiv.org/abs/2207.05221>
7. Tian, K. et al. *Just Ask for Calibration: Strategies for Eliciting Calibrated Confidence Scores from Language Models Fine-Tuned with Human Feedback*. 2023. <https://openreview.net/pdf?id=g3faCfrwm7>
8. Yang, D. et al. *On Verbalized Confidence Scores for LLMs*. 2025. <https://openreview.net/forum?id=CVRdNQvFPE>
9. Kuhn, L. et al. *Detecting Hallucinations in Large Language Models Using Semantic Entropy*. Nature, 2024. <https://www.nature.com/articles/s41586-024-07421-0>
10. Gneiting, T. and Raftery, A. E. *Strictly Proper Scoring Rules, Prediction, and Estimation*. JASA, 2007. <https://doi.org/10.1198/016214506000001437>
11. Ren, J. et al. *Adaptation with Self-Evaluation to Improve Selective Prediction in LLMs*. Findings of EMNLP 2023. <https://aclanthology.org/anthology-files/pdf/findings/2023.findings-emnlp.345.pdf>
12. Chen, L. et al. *FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance*. TMLR, 2024. <https://openreview.net/pdf?id=cSimKw5p6R>
13. Ong, I. et al. *RouteLLM: Learning to Route LLMs with Preference Data*. ICLR 2025. <https://openreview.net/pdf?id=8sSqNntaMr>
14. Fedus, W. et al. *Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity*. JMLR, 2022. <https://www.jmlr.org/beta/papers/v23/21-0998.html>
15. DeGroot, M. H. *Reaching a Consensus*. JASA, 1974. <https://www.tandfonline.com/doi/abs/10.1080/01621459.1974.10480137>
16. Friedkin, N. E. and Johnsen, E. C. *Social Influence and Opinions*. Journal of Mathematical Sociology, 1990. <https://escholarship.org/uc/item/2r82w1vs>
17. W3C. *PROV-DM: The PROV Data Model*. W3C Recommendation. <https://www.w3.org/2012/10/prov-dm>

