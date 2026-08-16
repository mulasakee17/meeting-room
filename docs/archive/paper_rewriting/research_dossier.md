# SwarmAlpha AAMAS 场景研究档案

状态：PaperSpine Research Agent A 产物（2026-08-13）  
用途：为 AAMAS 长文／研究白皮书提供场景约束、目标论文结构和审稿风险；不是论文正文。  
证据纪律：以下逐项标注 **FACT** 与 **INFERENCE**。FACT 来自 AAMAS 官方页面或所列一手论文；INFERENCE 是据此对 SwarmAlpha 写作与实验的判断。

## 1. 场景结论先行

### 1.1 会议硬约束

- **FACT：**AAMAS 2026 主轨论文须以英文撰写、双盲评审、使用 LaTeX，正文不超过 8 页，参考文献页数不限；摘要约 100–300 词，并须提前一周注册。[AAMAS 2026 Submission Instructions](https://cyprusconferences.org/aamas2026/submission-instructions/)
- **FACT：**官方评审维度包括 originality、significance、soundness、reproducibility、clarity、conference relevance、presentation quality，以及对 state of the art 的理解和适当引用。[AAMAS 2025 Main Track CFP](https://aamas2025.org/index.php/conference/calls/call-for-papers-main-technical-track/)
- **FACT：**关键方法、实验与证明不能只放在补充材料；审稿人可自行决定是否阅读 supplement。补充材料适合放完整证明、数据、代码和更全面实验，但不能修正或替代正文。[AAMAS 2026 Submission Instructions](https://cyprusconferences.org/aamas2026/submission-instructions/)
- **FACT：**AAMAS 2026 增设 Generative and Agentic AI（GAAI）领域，同时保留 COINE、GTEP、RR、EMAS、SIM 等领域；超出范围可能 desk reject。[AAMAS 2026 Submission Instructions](https://cyprusconferences.org/aamas2026/submission-instructions/)
- **FACT：**AAMAS 允许生成式 AI 辅助文字润色、格式化，以及用于 proof-of-concept、演示和实验的代码/脚本，但 AI 不得列为作者。[AAMAS 2026 Submission Instructions](https://cyprusconferences.org/aamas2026/submission-instructions/)

### 1.2 对 SwarmAlpha 的场景判断

- **INFERENCE：**近期论文最稳妥的主领域是 **GAAI**；若正文把核心贡献集中在制度、规范或控制权分配，可将 **COINE** 作为次级语境；若集中于审计运行时与失败封闭的系统方法，可将 **EMAS** 作为次级语境。不能只用“异构智能”宏大叙事证明 AAMAS 相关性，摘要前两段必须把 agent、交互、信息不对称、验证行动和集体结果写成明确的多智能体问题。
- **INFERENCE：**当前最可辩护的论文形态是 **measurement-first empirical/method paper**：先检验提示词条件下的显式概率报告是否有资格作为测量工具，再把治理写成被随机评估的对象。长期的异构智能运行时、边际认知价值和社会热力学适合放在 Discussion/Future Work，不能替代近期实证主干。
- **INFERENCE：**AAMAS 8 页正文要求论文只有一条主线。推荐主线是：

  ```text
  prompt-conditioned report
    -> measurement qualification
    -> detector permission
    -> randomized verification action
    -> independently scored outcome
  ```

  authority/replay 是保证这条推断链不被静默改写的方法基础，不应独立包装成“治理有效”的证据。

## 2. 目标场景论文与官方材料分析

### 2.1 AAMAS 官方主轨要求（官方材料 1）

来源：[AAMAS 2025 CFP](https://aamas2025.org/index.php/conference/calls/call-for-papers-main-technical-track/)、[AAMAS 2026 Submission Instructions](https://cyprusconferences.org/aamas2026/submission-instructions/)、[AAMAS 2025 FAQ](https://aamas2025.org/index.php/conference/frequently-asked-questions/faq-submitting/)

- **FACT：**评审不是只看结果新颖度，而是同时看技术质量、原创性、显著性、正确性、可复现性、清晰度、领域相关性和文献掌握。
- **FACT：**AAMAS FAQ 将合格摘要描述为：交代广泛研究领域、研究问题/问题、所得结果和所用方法，使潜在审稿人可以判断是否适合评审。
- **INFERENCE：**SwarmAlpha 摘要不能以平台功能列表开头；必须依次出现研究对象、测量风险、方法、已获得的结果、结果边界。若测量 pilot 尚未完成，摘要只能报告“初步表征/效度审计”，不能预写治理改善。
- **INFERENCE：**正文中 essential information 至少包括：报告量的操作定义、prompt/信息条件、主要 estimand、随机化单位、强基线、缺失处理和主要结果；schema 字段表、长测试清单和工程历史应移入 supplement。

### 2.2 Potyka et al., Robust Knowledge Extraction from LLMs using Social Choice Theory（AAMAS 2024 Full Paper）

来源：[IFAAMAS proceedings PDF](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1593.pdf)

- **FACT：**论文把不稳定的 LLM 排序回答看作待聚合对象，以 Partial Borda Choice 为方法核心，给出形式性质，并在制造、金融、医疗三个诊断场景中测试。
- **FACT：**实验明确比较“不聚合”和平均排序两个基线，使用 Kendall/Spearman 相关衡量重复查询与句法变体下的稳健性，并报告样本效率；代码公开。
- **FACT：**该文把重复查询不确定性与句法不确定性分开，句法实验使用三个语义相同而表述不同的查询变体。
- **INFERENCE：**该文证明 AAMAS 接受“LLM 输出 + 经典 MAS/社会选择机制”的论文，但要求形式性质、基线和系统扰动实验同时存在。SwarmAlpha 不能仅因使用 Brier/JSD/ECE 就声称方法新颖；真正差异必须是报告量的资格链、控制权限与可审计随机行动。
- **INFERENCE：**该文的句法变体实验是 SwarmAlpha paraphrase validity 的直接场景参照，但它测的是输出排序稳健性，不等于概率报告的构念效度。SwarmAlpha 应进一步区分 exact repeat、semantic paraphrase、option permutation 和 evidence manipulation。

### 2.3 Dolgorukov et al., Dynamic Epistemic Logic of Resource Bounded Information Mining Agents（AAMAS 2024 Full Paper）

来源：[IFAAMAS proceedings PDF](https://ifaamas.org/Proceedings/aamas2024/pdfs/p481.pdf)

- **FACT：**论文形式化预算受限的 agent 如何向可信来源购买信息；查询成本、agent 预算、群体共享资源和半公开查询均进入逻辑语义。
- **FACT：**其主要贡献属于理论论文：给出 Kripke-style 语义、动态查询算子、完备性、可判定性和有效模型检查，而不是依靠大规模经验实验。
- **INFERENCE：**这项工作与 SwarmAlpha 的“有限预算下何时购买验证”高度邻近，说明资源、信息可见性和群体行动是正统 AAMAS 问题。
- **INFERENCE：**差异必须写清：该理论假设查询源可靠、回答正确，并在逻辑层面分配预算；SwarmAlpha 面对的是经验上可能失效的 LLM 报告、验证器与来源依赖，并试图随机估计验证行动对独立结果的影响。若不写这一差异，SwarmAlpha 的预算治理定位会显得只是现有 resource-bounded epistemic logic 的工程化。

### 2.4 Liu et al., LLM-Powered Hierarchical Language Agent for Real-time Human-AI Coordination（AAMAS 2024 Full Paper）

来源：[IFAAMAS proceedings PDF](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1219.pdf)

- **FACT：**论文提出 Slow Mind、Fast Mind 与 Executor 的层级架构，并以实时 Overcooked 协调为场景。
- **FACT：**实验同时评估响应时延、简单/复杂指令成功率与完成时间，并使用 60 名参与者进行人机实验；基线移除不同组件，另有两阶段 Slow Mind 的消融。
- **INFERENCE：**AAMAS 系统论文需要把架构变化绑定到任务结果、成本/时延和组件消融，而非只展示系统能运行。SwarmAlpha 的等价要求是：报告 qualification、detector、action assignment、delivery、final private outcome 各自有可分辨作用，并报告 provider calls/tokens/coverage。
- **INFERENCE：**若 SwarmAlpha 走系统论文路线，单纯“schema-5 全部可重放”不足；必须展示它如何阻止错误的科学结论或支持一个公平、预算匹配的治理比较。

### 2.5 Du et al., Improving Factuality and Reasoning in Language Models through Multiagent Debate（ICML 2024）

来源：[PMLR/arXiv paper](https://arxiv.org/abs/2305.14325)

- **FACT：**多个同模型实例先独立回答，再读取其他实例响应并多轮更新；作者在算术、战略推理与事实任务上报告改善，并分析 agent 数量、讨论轮数、prompt 长短和共识。
- **FACT：**文中也记录错误收敛案例，且实验固定使用 `gpt-3.5-turbo-0301`，提示词和任务细节列于论文/附录。
- **INFERENCE：**这是 SwarmAlpha 必须覆盖的正向基线和历史起点，但不能只重复“多轮讨论是否提高准确率”。SwarmAlpha 应问：哪些被观测信号有资格触发验证、讨论是否传播相关错误、以及治理行动在等预算下是否改善独立结果。
- **INFERENCE：**共识只能作为中介/描述量；Du 等在指定实验中观察到共识与正确性变化，不赋予共识跨任务的决策质量含义。

### 2.6 Zhang et al., If Multi-Agent Debate is the Answer, What is the Question?（2025）

来源：[arXiv primary paper](https://arxiv.org/abs/2502.08788)

- **FACT：**论文系统比较五类 MAD 方法、九个 benchmark 和四个 foundation model，指出现有研究存在数据集重叠不足与基线不一致问题。
- **FACT：**作者报告 MAD 未能可靠超过 Chain-of-Thought 和 Self-Consistency 等简单单 agent 基线，尽管使用更多 inference-time compute；异构模型访问在其评估中更有帮助。
- **INFERENCE：**该文构成 SwarmAlpha 最重要的竞争性审稿背景：任何治理正效应必须在预算匹配下与强单 agent、self-consistency、majority/aggregation 和普通 debate 比较。
- **INFERENCE：**“多模型/异构”本身已不是新颖贡献。SwarmAlpha 的长期异构智能主张必须落实到 conditional complementarity、来源相关性、验证价值或 action authority；近期论文只应把它作为可推广方向。

### 2.7 Kadavath et al., Language Models (Mostly) Know What They Know（2022）

来源：[arXiv primary paper](https://arxiv.org/abs/2207.05221)

- **FACT：**论文区分 `P(True)`（给定候选答案为真的概率）和 `P(IK)`（模型知道答案的概率），通过特定格式的提示询问模型自评。
- **FACT：**作者报告较大模型在部分选择题/真假题设置中具有良好校准与判别力，但 `P(IK)` 跨任务校准困难；论文明确讨论一种替代解释：信号可能主要反映“问题一般有多难”，而不是个体模型的内在知识。
- **INFERENCE：**SwarmAlpha 必须把模型输出命名为 **prompt-conditioned reported probability/belief report**，不能写成直接读取 latent belief。prompt、候选项、信息视图、模型版本和采样配置都是测量工具的一部分。
- **INFERENCE：**该论文既不支持“LLM 自报必然无效”，也不支持“LLM 自报天然有效”。正确位置是先做 domain-specific qualification：扰动稳健性、证据响应、proper loss、held-out 预测和缺失覆盖。

### 2.8 Ong et al., RouteLLM（ICLR 2025）

来源：[arXiv primary paper](https://arxiv.org/abs/2406.18665)、[OpenReview publication](https://openreview.net/pdf?id=8sSqNntaMr)

- **FACT：**RouteLLM 从偏好数据学习在强/弱 LLM 之间路由，以质量—成本权衡为目标，并评估成本节约和模型对更换后的迁移。
- **INFERENCE：**“根据任务选择模型、降低成本”已是成熟竞争方向，不能作为 SwarmAlpha 的单独新意。
- **INFERENCE：**SwarmAlpha 若未来扩展到异构智能，应与 router 区分为 claim-state-aware governance：输入不仅是 query，还包括已报告概率、证据 lineage、来源依赖、历史验证与行动权限；输出也不只选模型，还可选择验证、停止、隔离或保留少数派。但这些目前是 DESIGN INTENT，不是第一篇论文的已实现贡献。

### 2.9 Wang et al., Mixture-of-Agents Enhances LLM Capabilities（2024）

来源：[arXiv primary paper](https://arxiv.org/abs/2406.04692)、[OpenReview paper](https://openreview.net/pdf?id=Zp7dpJaLfC)

- **FACT：**MoA 使用分层多模型架构，每层模型读取上一层全部输出；论文报告 AlpacaEval 2.0、MT-Bench 和 FLASK 上的结果。
- **FACT：**论文分析 proposer 数量、aggregator 选择和模型角色，并报告异构输出的贡献高于同模型输出。
- **INFERENCE：**MoA 表明“异构输出可能互补”已被直接实验化。SwarmAlpha 的 Orthogonal Intelligence / Marginal Cognitive Value 只有在定义为 **当前 claim state 条件下、扣除成本和来源相关后的增量 proper-loss 价值**，并用 held-out outcome 验证时，才可能形成区别；当前不能把该概念写成已建立的量。

### 2.10 Jiang et al., How Can We Know When Language Models Know?（EMNLP 2021）

来源：[arXiv primary paper](https://arxiv.org/abs/2012.00955)

- **FACT：**论文以“预测概率是否对应实际正确频率”定义校准，在多个 QA 数据集和生成模型上发现原始概率普遍失准，并研究微调、后处理和输入/输出调整。
- **INFERENCE：**SwarmAlpha 不能把一次 experiment 的 ECE 或单个 Brier loss 当成“知道/不知道”的直接测量；Brier 是 proper loss，ECE 是分箱描述，它们需要与 discrimination、coverage、prompt perturbation 和 cluster-aware uncertainty 一起解释。

## 3. AAMAS 长文的常见论证结构

以下是从官方要求与上述三篇 AAMAS full paper 归纳出的结构，不是官方统一模板。

### 3.1 结构模式

1. **Problem and AAMAS relevance**：说明为什么这是 agent/MAS 问题，而非通用 LLM benchmark。
2. **Gap against strong adjacent work**：指出 debate、aggregation、routing、calibration 或 epistemic logic 已解决什么，剩下什么可证伪缺口。
3. **Stable formal objects**：定义 agent、claim、information view、report、action、outcome、budget/authority；区分可观察量与潜在构念。
4. **Mechanism/method**：给出资格门、随机化政策、算法或形式性质；说明输入、输出、时序和失败封闭。
5. **Research questions/estimands**：把 measurement validity、detector validity 和 governance effect 分开。
6. **Experimental protocol**：数据、任务簇、模型版本、prompt、randomization unit、预算、缺失与 stopping rule。
7. **Strong baselines and ablations**：预算匹配的单 agent、自一致性、投票/聚合、普通 debate、belief-only、治理；消融报告、lineage 或验证行动。
8. **Results by evidence strength**：主要结果、置信区间/cluster uncertainty、成本、coverage；中间动态与独立 outcome 分栏。
9. **Failure analysis and limitations**：负结果、反预测阈值、prompt dependence、同模型相关性、外部真实性边界。
10. **Conclusion within claim ceiling**：只回答已完成的 RQ，把 runtime、Web3、社会热力学留给后续。

### 3.2 两种可接受论文形态

- **FACT：**AAMAS 接受纯理论 full paper（如 resource-bounded dynamic epistemic logic），其说服力来自正式语义、完备性、可判定性和复杂度结果。
- **FACT：**AAMAS 也接受系统/实证 full paper（如 HLA、Robust Knowledge Extraction），其说服力来自清晰机制、强基线、多个场景/扰动、消融、任务结果和可复现性。
- **INFERENCE：**SwarmAlpha 当前不具备把主要篇幅押在完备性定理上的理论成果，因此应按实证/方法论文标准准备，不能用 schema 严谨度替代足量实验。

## 4. 审稿人会重点追问的量与术语

### 4.1 必须分开的四层

| 层 | 推荐术语 | 数学/数据对象 | 可以声称 | 不可声称 |
|---|---|---|---|---|
| L1 模型自报 | prompt-conditioned reported probability / belief report | 二元概率或 canonical option 上的概率向量 `p` | 模型在冻结提示与信息视图下产生了该报告 | 直接读取模型“内心信念”或真实置信度 |
| L2 测量条件 | elicitation/measurement contract | 逐字 prompt、选项顺序、agent view、模型/温度、输出 schema | 定义了报告如何被诱导与解析 | 条件变化后仍测量同一构念 |
| L3 系统计算量 | derived/descriptive quantity | entropy、certainty、JSD、TV、Brier、ECE、lineage count、Gini | 由冻结输入和公式重算的量 | 自动等价于不确定性、公平、独立性或决策质量 |
| L4 潜在构念/治理状态 | latent epistemic state / detector / control state | 待检验构念或策略状态 | 在资格实验后给出有限解释 | 由 L1/L3 单次值反向证明其存在或有效 |

### 4.2 自报量的写法

- **FACT：**Kadavath 等的 `P(True)`、`P(IK)` 在不同提问与任务下表现不同，并存在 OOD calibration gap。
- **INFERENCE：**论文中不要裸用 confidence。应写成：

  > 对 agent (i)、claim (c)、round (t) 和冻结 elicitation contract (e)，观测到报告分布 \hat p_{i,c,t}^{(e)}。

  这里的帽号强调它是观测报告，不是潜在概率的无偏估计。
- **INFERENCE：**若模型同时输出答案、概率、证据与解释，这些是不同字段：`answer/claim choice`、`reported probability`、`reported evidence citation`、`free-text rationale`。理由的流利度不能用作概率真实性的代理。

### 4.3 提示词的写法

- **INFERENCE：**prompt 不是实现细节，而是 measurement instrument。正文至少概括其语义，supplement 给逐字文本/hash。
- **INFERENCE：**必须冻结并报告：system/user 分工、概率格式、是否展示其他 agent 输出、选项顺序、拒答规则、round 历史、temperature、模型版本、解析失败政策。
- **INFERENCE：**paraphrase 只检验 nuisance stability；exact repeat 只检验 repeat stability；option permutation 检验 coordinate equivariance；evidence ladder/direction 检验对预期信号的响应。这四者不可相互替代。

### 4.4 计算量的解释边界

- **Entropy/certainty：**描述单个报告分布的集中程度；不自动等于正确性或知识。
- **JSD/TV：**描述两个报告在 canonical coordinates 下的差异；小值只表示稳定，不表示有效。
- **Brier score：**对 resolved outcome 的 proper loss；适合评价概率质量，但单样本 loss 不是 calibration。
- **ECE：**依赖分箱和样本分布的校准摘要；必须同时报告 bin counts、coverage 和其他 proper/discrimination 指标。
- **Influence Gini/consensus：**描述群体动力学；既不能替代最终准确率/Brier，也不能直接解释为公平或治理质量。
- **Lineage/source count：**描述记录到的来源关系；`0` 应解释为“无合格 lineage 记录”，不是“没有来源”或“独立”。
- **INFERENCE：**任何 derived quantity 获得 detector/control 权限前，都必须在冻结域上证明它对目标 outcome 有足够预测效度；阈值的类型合法性不等于经验校准。

## 5. 对 SwarmAlpha 实验的场景级最低要求

以下不是 AAMAS 官方逐项硬规则，而是由评审维度和相关论文竞争态势推导出的最低说服力要求。

### 5.1 Measurement validity

- **INFERENCE：**至少分开报告 Q0（可解析/coverage）、nuisance stability（repeat/paraphrase/permutation）、evidence responsiveness、outcome-related validity；采用非补偿式 Gate，不能用高 coverage 抵消无证据响应。
- **INFERENCE：**分析单位应是独立 semantic task cluster，而非把同一任务的 paraphrase/repeat 当独立样本；bootstrap/置信区间应在 cluster 层进行。
- **INFERENCE：**proper loss、ECE、discrimination、coverage 和 missingness 需要一起报告。invalid、timeout、unavailable 不应从分母静默删除。
- **INFERENCE：**若 instrument 未通过 Gate，论文仍可成为“效度审计/负结果”论文，但必须有足够任务簇、多个模型或严谨的 failure characterization，且治理效果主张停止。

### 5.2 Governance effect

- **INFERENCE：**应采用两级区别：protocol-arm assignment（如普通讨论/显式报告/治理协议）与 eligible-event governance-action assignment（apply/sham/holdout）；两者不得混写为同一个 intervention。
- **INFERENCE：**主要结果必须是独立 final/private elicitation 后的 accuracy 或 proper loss；共识、报错率、verification verdict 和影响集中度只能作为过程变量。
- **INFERENCE：**必须报告 ITT、action delivery/compliance、eligible coverage、apply/sham/holdout 数和 task-cluster 数；事件级重复不能冒充独立样本。
- **INFERENCE：**强基线至少包括强单 agent、compute-matched self-consistency、majority/static aggregation、普通 debate、belief-state without action；若声称异构路由，还需 static/router baseline。
- **INFERENCE：**在固定 token/call budget 下比较；否则 MAD/治理多调用带来的收益无法与简单增加采样量区分。

### 5.3 Reproducibility and authority

- **INFERENCE：**正文应给出最小 authority diagram、randomization unit、estimand 和 replay 状态；完整 schema、issue code 和测试矩阵放 supplement。
- **INFERENCE：**“80/80 sealed decision replay”只证明仓库内载体和决策重放一致，不证明 provider 确实返回该内容、artifact 未在外部被重写或 prompt 没有语义泄漏。不要使用 tamper-proof 或 externally verified。
- **INFERENCE：**冻结计划、模型版本、逐字 prompt、task split、seeds、失败样本和分析代码应可归档；付费 provider 漂移是 limitation，不能靠 deterministic replay 消除。

## 6. 推荐论文骨架（供主笔使用，不是正文）

### 6.1 题目重心

近期题目应包含 “auditable reported beliefs / measurement qualification / epistemic governance”，避免直接以 “A Governance Runtime for Heterogeneous Intelligence” 作为经验论文标题，因为当前资源 router 与 MCV 尚未验证。

候选结构：

1. **Introduction**：多 agent 讨论常把未经验证的显式置信度用于权重或触发；研究问题是何时该信号有资格获得控制权限。
2. **Related Work**：MAD 正反结果；verbalized confidence；resource-bounded epistemics；routing/aggregation；provenance。
3. **Problem and Quantity Semantics**：reported probability、prompt contract、derived metric、detector、action、outcome。
4. **Qualification and Governance Method**：Q0–Q3、Gate、两级随机化、独立 final outcome、authority/replay。
5. **Experimental Design**：任务簇、变体、模型、T/B/G、强基线、预算、missingness、estimand。
6. **Results**：measurement first；只有通过资格门后才报告 governance effect，否则报告 stop/defer。
7. **Failure Analysis and Limitations**：threshold 反预测、prompt dependence、同模型相关错误、外部真实性。
8. **Conclusion**：限定域结论；异构资源、MCV、责任/信誉、社会热力学作为下一步。

### 6.2 建议的贡献表述层级

1. **METHOD（当前可写）：**一套把 prompt-conditioned probability report 与 derived quantities、detector 和 control state 分开的操作语义。
2. **METHOD/SYSTEM（当前可写）：**一条 measurement qualification → randomized action → independent outcome 的 claim-centric authority/replay 链。
3. **EMPIRICAL（依结果写）：**在指定模型/任务域中，报告信号通过或未通过哪些扰动、证据响应与预测 Gate。
4. **EXPLORATORY（当前已有）：**80-run 工程样本显示严重过度自信和固定阈值反预测，治理 estimand 因 holdout/cluster 不足而 DEFER。
5. **HYPOTHESIS/FUTURE（不可升级）：**异构资源的条件互补性、MCV、信誉/质押与社会热力学。

## 7. 预期审稿意见与预防

| 预期意见 | 判断 | 正文必须如何预防 |
|---|---|---|
| “只是又一个 MAD protocol。” | 若治理机制是核心演示而无资格实验，则成立 | 把新意放在 signal qualification、control permission、随机验证和独立结果，而非讨论轮次 |
| “confidence 是 prompt artifact，不是 belief。” | 成立且应承认 | 使用 reported probability；冻结 prompt；做 repeat/paraphrase/permutation/evidence tests |
| “多次调用自然胜过单次调用。” | 高风险 | compute-matched self-consistency/aggregation；同时报告 tokens/calls/latency |
| “schema/replay 是工程，不是科学贡献。” | 部分成立 | 展示它实际阻止了分母、arm、阈值或时序错误；用实验回答科学问题 |
| “治理效果未建立。” | 当前成立 | 诚实写 DEFER；measurement pilot 是主实证；无平衡随机化前不写因果效果 |
| “同模型 agents 不独立。” | 成立 | 不把 agent count 当独立 n；cluster/model family 分层；长期增加异构模型 |
| “Brier/ECE 都是标准量，没有新意。” | 成立 | 新意在资格链、坐标承诺、missingness、Gate 和 action authority，不在公式 |
| “异构智能只是 RouteLLM/MoA 重命名。” | 当前若作为主贡献则成立 | 近期降为 roadmap；未来以 lineage-aware conditional marginal value 和随机 action outcome 区分 |
| “社会热力学是隐喻。” | 对当前证据成立 | 仅列 future hypothesis；先做微观测量，再做跨规模/拓扑预测与增量效度测试 |

## 8. 写作与图表建议

- **INFERENCE：**正文第一张图应是因果/资格链，而不是代码架构：`report → qualification → detector → randomized action → delivered information → private outcome`，旁标 prompt、lineage、budget。
- **INFERENCE：**第一张结果图应同时展示 nuisance stability 与 evidence response，防止只报告 repeat stability。
- **INFERENCE：**治理结果图应按 apply/sham/holdout 展示 proper loss、coverage 和 task-cluster uncertainty；共识/Gini 放次级面板。
- **INFERENCE：**主表按 `object / source / mathematical role / permission / validation status` 区分 LLM 自报量、提示词条件和系统计算量。这张表对避免构念混淆比长 schema 表更重要。
- **INFERENCE：**8 页正文不应列大量实现 issue code；应将一页左右用于定义/方法，两页左右用于实验设计与结果，确保最重要的效度结果无需 supplement 才能理解。

## 9. 来源清单

### 官方 AAMAS 来源

1. [AAMAS 2026 Submission Instructions](https://cyprusconferences.org/aamas2026/submission-instructions/)
2. [AAMAS 2025 Main Technical Track CFP](https://aamas2025.org/index.php/conference/calls/call-for-papers-main-technical-track/)
3. [AAMAS 2025 Submission FAQ](https://aamas2025.org/index.php/conference/frequently-asked-questions/faq-submitting/)
4. [IFAAMAS Proceedings Index](https://www.ifaamas.org/proceedings.html)

### 一手目标论文

5. [Potyka et al., Robust Knowledge Extraction from Large Language Models using Social Choice Theory, AAMAS 2024](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1593.pdf)
6. [Dolgorukov et al., Dynamic Epistemic Logic of Resource Bounded Information Mining Agents, AAMAS 2024](https://ifaamas.org/Proceedings/aamas2024/pdfs/p481.pdf)
7. [Liu et al., LLM-Powered Hierarchical Language Agent for Real-time Human-AI Coordination, AAMAS 2024](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1219.pdf)
8. [Du et al., Improving Factuality and Reasoning in Language Models through Multiagent Debate, ICML 2024](https://arxiv.org/abs/2305.14325)
9. [Zhang et al., If Multi-Agent Debate is the Answer, What is the Question?, 2025](https://arxiv.org/abs/2502.08788)
10. [Kadavath et al., Language Models (Mostly) Know What They Know, 2022](https://arxiv.org/abs/2207.05221)
11. [Jiang et al., How Can We Know When Language Models Know?, EMNLP 2021](https://arxiv.org/abs/2012.00955)
12. [Ong et al., RouteLLM, ICLR 2025](https://openreview.net/pdf?id=8sSqNntaMr)
13. [Wang et al., Mixture-of-Agents Enhances Large Language Model Capabilities, 2024](https://arxiv.org/abs/2406.04692)

## 10. 已知不确定项

- **UNKNOWN：**本档案未获得 SwarmAlpha 尚待执行的三日 Measurement Validity paid pilot 结果；因此不能确定近期论文最终是正向 instrument-validity 论文，还是有价值的 failure/negative-result 论文。
- **UNKNOWN：**AAMAS 下一届（2027）具体页数、领域名称、GenAI 政策和 deadline 尚未核对；本文采用当前可访问的 AAMAS 2026 官方规则作为最近场景基线，正式投稿前必须重新核对目标届官网。
- **UNKNOWN：**当前 80-run exploratory result 是否能跨模型、跨 prompt、跨 K 或跨任务族复现；现有数字只能写成指定 DeepSeek/HiddenBench 工程样本的 preliminary characterization。
- **UNKNOWN：**Orthogonal Intelligence / MCV 是否能在 held-out outcome 上提供超过 RouteLLM、MoA 或 diversity-aware baselines 的增量价值；当前仅是研究合同中的未来假设。
- **UNKNOWN：**社会热力学宏观量是否具有跨规模、拓扑和协议的预测/输运规律；当前不能作为已建立理论或第一篇论文贡献。

## 11. 场景验收结论

- 已核对 3 项 AAMAS 官方材料、3 篇 AAMAS full research paper 和 6 篇直接相关的一手论文，满足目标场景样本要求。
- AAMAS 场景允许 SwarmAlpha 的研究问题，但不奖励“平台很复杂”本身。能否成为 full paper 取决于：测量效度是否以独立任务簇和强扰动建立、治理行动是否在固定预算下被随机化评估、以及正文是否严格区分自报量、提示词条件、派生量和独立 outcome。
- 在新 pilot 结果出现前，最强可接受叙事是：**SwarmAlpha 提出并实现一条对多 Agent 显式概率报告实行测量资格与控制权限隔离的可审计实验方法，并用初步实验揭示未经资格验证的固定置信阈值可能反预测；一般测量效度与治理效果仍待检验。**
