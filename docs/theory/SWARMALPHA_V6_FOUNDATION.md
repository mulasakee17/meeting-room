# SwarmAlpha v6：受治理集体推理的理论基线

> 状态：规范性定义草案（Normative Foundation）  
> 日期：2026-08-07  
> 依据：核心执行路径的代码审计与外部原始研究；不继承旧文档中的理论主张  
> 约束：本文中的“已实现”“待实现”“待验证”必须严格区分

## 0. 一句话定义

**SwarmAlpha v6 是一个研究并控制语言智能体在分布式信息、有限通信和可变交互制度下进行集体推理的因果实验平台。它的核心目标不是让智能体更快达成共识，而是识别交互何时产生净认知增益，并用可审计、成本敏感的治理使这种增益稳定为正。**

建议英文定位：

> **SwarmAlpha v6: A Causal Testbed for Governed Collective Inference under Distributed Information**

这里的研究对象是 **governed collective inference（受治理的集体推理）**，不是泛化到任意多智能体任务的“万能 agent 框架”，也不是把 LLM 自报变量当作真实心智状态的“认知模拟器”。

## 1. 为什么叫 SwarmAlpha

“Alpha”不再是品牌修辞，而是系统的中心可检验量。

设任务质量函数为 `Q`，交互式群体结果为 `D_interactive`，在相同模型调用预算下的非交互基线（独立采样、投票或集成）为 `D_independent`：

```text
swarm_alpha = Q(D_interactive) - Q(D_independent)
```

- `swarm_alpha > 0`：交互产生了超越独立集成的集体增益；
- `swarm_alpha = 0`：讨论只是昂贵的集成；
- `swarm_alpha < 0`：社会影响、信息压制或错误传播使群体变差。

治理本身的边际价值定义为：

```text
governance_alpha = Q(D_governed) - Q(D_same_protocol_ungoverned)
```

成本敏感版本为：

```text
net_alpha = delta_Q
          - lambda_token * delta_tokens
          - lambda_time  * delta_latency
          - lambda_risk  * delta_failure_risk
```

因此，v6 的中心问题是：

> **在什么任务、群体组成和交互制度下，语言智能体之间的通信能够产生正的 swarm alpha；当 alpha 正在转负时，系统能否在不知道真实答案的在线阶段及时诊断并有效干预？**

## 2. 研究边界

### 2.1 v6 首要覆盖的任务

v6 的强项应限定为：

- 多个 agent 持有互补、重叠或冲突的信息；
- agent 通过有限轮次的语言通信形成判断或行动；
- 交互可能带来信息发现，也可能带来从众、权威俘获和多样性坍缩；
- 协议、拓扑、顺序、聚合、干预和终止规则可被实验操纵；
- 结果和过程均可审计。

### 2.2 v6 不应直接宣称覆盖的任务

- 任意合作或竞争型多智能体环境；
- 具有真实长期目标、身体行动或开放世界工具链的自主 agent；
- 对人类心智或 LLM 内部认知的忠实建模；
- 没有评价契约的“通用智能涌现”；
- 仅凭观察轨迹即可得到的因果解释。

未来可以扩展到混合动机、隐私和对抗环境，但这些需要新的博弈、激励和安全假设，不能由当前 cooperative deliberation 直接外推。

## 3. v6 的形式对象

一个 SwarmAlpha 实验定义为七元组：

```text
S = <E, A, P, M, G, X, L>
```

- `E`（Epistemic Environment）：任务、候选空间、公共信息、私有信号、可选真值与成本；
- `A`（Agents）：一组随机策略 agent，而非可直接读取的心智实体；
- `P`（Protocol）：通信图、发言顺序、可见上下文、记忆、聚合和预算；
- `M`（Measurement）：从公开轨迹产生带不确定性的代理测量；
- `G`（Governance）：根据测量选择干预的控制策略；
- `X`（Exit/Decision）：聚合、接受和停止规则；
- `L`（Ledger）：不可变实验日志、随机化记录、版本与资源消耗。

### 3.1 环境契约

环境不得再把候选结构和答案真值混为同一对象：

```text
TaskSchema     = {candidate_space, public_context, action_contract}
InformationMap = {public_evidence, private_evidence_by_agent, visibility}
GroundTruth    = {answer_or_outcome, scoring_rule} | absent
```

`TaskSchema` 可进入 prompt；`GroundTruth` 只能进入评分器。任何 prompt 构造路径读取 `GroundTruth` 都是数据泄露。

### 3.2 agent 与观测

agent 的内部状态 `z_i,t` 不可观测。系统能看到的只是输出：

```text
o_i,t ~ pi_i(. | private_signal_i, visible_history_i,t, intervention_i,t)
```

所以当前代码中的 utility、confidence、evidence coverage 等首先是 **reported state（自报状态）**；经过历史行为融合后也只能称为 **estimated behavioral state（行为估计状态）**，不能称为真实认知状态。

### 3.3 单轮动力学

规范性的单轮顺序为：

```text
private state / evidence
        -> protocol selects speakers and visible context
        -> agents emit reports, claims and decisions
        -> parser validates and canonicalizes observations
        -> measurement estimates group state and diagnostic uncertainty
        -> governance selects a treatment for the next valid action window
        -> round is atomically committed
        -> stopping policy decides whether another round has positive value
```

当前 `DiscussionEngine.finalizeRound` 已经提供了重要的原子提交骨架：一旦本轮产生输出，就先完成状态更新、治理诊断和审计记录，之后才允许退出。这是 v6 应保留的核心工程不变量。

## 4. 三类评价契约

“普适”不等于让所有任务共享 accuracy 或 consensus。v6 必须根据任务本体选择评价契约。

### 4.1 可验证认识型任务（verifiable epistemic tasks）

存在外部真值或可执行验证器，例如 Hidden Profile、事实判断、排序、规划验证。

主要结果：accuracy、regret、calibration、robustness、cost。

### 4.2 偏好聚合型任务（preference aggregation tasks）

不存在唯一正确答案，各 agent 可能代表不同效用或利益。

主要结果：social welfare、fairness、strategy resistance、Pareto efficiency、minority protection。这里不能把 disagreement 当成认知缺陷。

### 4.3 开放生成型任务（open-ended synthesis tasks）

不存在封闭候选集，目标是方案发现、设计或创作。

主要结果：quality-diversity frontier、novelty、coverage、feasibility 和人工评价可靠性。这里的快速收敛可能意味着搜索空间坍缩。

平台的通用性来自 **统一实验内核 + 可替换评价契约**，而不是一个跨任务的万能分数。

## 5. 规范测量语义

### 5.1 必须区分的变量层级

| 层级 | 例子 | 可以声称什么 | 不可以声称什么 |
|---|---|---|---|
| 潜在状态 | agent 真实信念、真实推理过程 | 理论变量 | 已被系统直接测得 |
| 自报状态 | reported utility/confidence/evidence | 模型输出的结构化报告 | 真实效用、真实置信度 |
| 行为状态 | 立场变化、引用、响应、发言、暴露 | 可复现的轨迹事实 | 未控制混杂的心理原因 |
| 估计状态 | inertia/susceptibility estimates | 指定估计器下的代理量 | 稳定人格或因果特质 |
| 任务结果 | accuracy/regret/welfare | 给定评分契约下的表现 | 跨任务无条件比较 |

### 5.2 v6 的宏观可观测量

当前 R/T/H/F 应降格为 **macroscopic observables（宏观代理量）**：

- `A_t`：reported utility alignment，当前 utility 向量的群体对齐度；
- `V_t`：update volatility，连续轮次自报 utility 的变化幅度；
- `H_e,t`：evidence-support entropy，公开证据支持关系的分布熵；
- `N_t`：evidence novelty，新出现且非重复的证据比例；
- `X_t`：evidence exposure，各 agent 接触集体证据池的程度；
- `C_t`：influence concentration，影响关系的集中度；
- `K_t`：decision stability，聚合决策对扰动或重采样的稳定性。

这些量可以用于描述、预测和控制，但不具有物理单位。

### 5.3 撤销自由能本体论

当前代码存在两套同名量：旧异步路径的 `F=(1-R)+T*H`，以及 native 路径的 `F=U-T*H`。其中 `U` 是自报效用向量强度，`T` 是更新幅度，`H` 是证据支持熵；三者没有物理共轭关系，也没有温度、能量和熵的统一量纲。

因此 v6 规定：

- 不再把 `F` 称为 Helmholtz free energy；
- 不使用“不可逆结晶”“自由能耗尽”等物理结论作为论文 claim；
- 旧公式可保留为带版本命名的启发式 `legacy_disorder_score`；
- 新实验优先使用可解释的观测向量，不强行压成单标量；
- 若未来定义综合风险分数，必须在 held-out 数据上校准并报告消融，不能借用物理定律赋予合法性。

“社会热力学”可以作为启发式可视化语言，但不能作为 v6 的理论地基。

## 6. 共识、正确、接受和终止

v6 必须把四个概念彻底拆开：

1. **Surface agreement**：公开输出之间距离较小；
2. **Epistemic adequacy**：相关证据已被充分发现、传递、检验和用于决策；
3. **Procedural acceptance**：制度规则决定接受当前结果；
4. **Termination**：继续交互的预期价值不再覆盖成本或达到硬约束。

它们之间没有蕴含关系：

- agreement 不推出 truth；
- stability 不推出 adequacy；
- termination 不推出 consensus；
- disagreement 在偏好任务中可能是合法结果；
- hard cap 只表示资源耗尽，不表示成功。

建议逐步淘汰含混字段 `converged`，改为：

```text
surface_agreement_detected
epistemic_adequacy_estimate
decision_finalized
stop_reason
```

## 7. v6 的价值分解与基线阶梯

每个主要实验至少包含下列基线：

1. `partial_individual`：每个 agent 只看自己的信息；
2. `independent_ensemble`：相同调用预算但 agent 不互相看答案；
3. `vanilla_interaction`：固定讨论协议，无治理；
4. `governed_interaction`：同协议、同预算规则，启用治理；
5. `full_information_oracle`：提供全部信息的能力上界；
6. `cost_matched_strong_baseline`：把治理额外 token 用于 self-consistency、更多独立样本或更强单 agent。

在 Hidden Profile 类任务上，可将改进分为：

```text
discovery_gain   = 关键私有证据是否进入公共轨迹
integration_gain = 证据进入后，决策是否朝正确方向更新
social_loss      = 正确个体是否因错误社会影响而转错
governance_gain  = 干预相对匹配无干预对照的增量
```

这比只报告最终 accuracy 更接近机制论文。

## 8. 失败模式的最小分类

v6 首先研究可由轨迹操作化的失败，而不是为每个现象贴心理学标签。

| 失败族 | 操作化问题 | 当前名称应如何处理 |
|---|---|---|
| 信息未发现 | 关键私有证据没有进入公共轨迹 | information withholding 只能是风险，不应直接推断意图 |
| 信息未传播 | 证据出现但目标 agent 未暴露或未响应 | 使用 exposure/response 事件 |
| 信息未整合 | 关键证据已出现但决策不随之合理变化 | 需要证据—决策关联验证 |
| 冗余放大 | 重复内容挤占新信息 | echo chamber 需加入来源和语义去重 |
| 过早闭合 | 高一致发生在低证据充分度时 | premature consensus 改为 early-closure risk |
| 错误说服 | 正确判断在社会影响后变错 | 必须与独立基线比较 |
| 影响俘获 | 少数来源支配群体更新 | authority bias 不能仅由“高惯性”推断 |
| 极化 | 群体形成稳定、互离的判断簇 | 区分事实任务与偏好任务 |
| 振荡/停滞 | 反复变化或无信息增益 | 用 update 与 novelty 轨迹判断 |
| 协议失效 | 无响应、解析失败、标签歧义、数据泄露 | 属于系统可靠性，不是认知现象 |

## 9. 治理是闭环控制，不是提示词集合

治理器面对的是部分可观测系统。其输入应是失败模式的后验风险和测量置信度，而不是单个阈值命中：

```text
diagnostic_belief_t = M(history_<=t)
intervention_t      = G(diagnostic_belief_t, budget_t, treatment_history)
outcome_t+1         = observe(next_round)
```

### 9.1 干预族

- **信息干预**：请求缺失证据、核验来源、暴露反证；
- **结构干预**：改变发言者、可见上下文、拓扑或顺序；
- **审议干预**：交叉质证、反事实、反方论证；
- **聚合干预**：改变权重、投票或裁决规则；
- **资源干预**：增加一轮、提前停止、调用验证器。

“inject evidence”只有在证据来自已登记信息源或外部验证器时才可使用；由治理 LLM 临时生成的内容应叫 `generated probe` 或 `counterargument`，不能当作事实注入。

### 9.2 干预效果

同轮状态突变、下一轮 prompt 处理和最终任务质量是三个不同层级：

- `application_effect`：动作是否成功写入图、状态或 prompt 队列；
- `proximal_effect`：下一轮 novelty、exposure、influence 是否变化；
- `task_effect`：最终 accuracy/regret/welfare 是否改善。

只有随机化或可辩护的准实验对照才能支持 `task_effect` 的因果 claim。当前 dropout/sensitivity 轨迹应称为影响敏感性分析，不能直接叫因果图。

## 10. 成本敏感的终止

终止不应以“结晶”作为本体，而应近似一个 value-of-information 决策：

```text
continue iff
E[quality_gain_next_round | history]
  > communication_cost + failure_risk
```

工程上可分阶段逼近：

1. 固定轮数作为无偏主实验协议；
2. 使用 held-out 数据校准的停止分类器；
3. 报告停止规则的 accuracy-cost Pareto；
4. 最终学习条件化于任务、模型和轨迹的 stopping policy。

任何自适应停止实验都必须同时报告 hard-cap 结果，避免“容易样本早停”造成选择偏差。

## 11. 可证伪命题

v6 不是“多 agent 更好”的论证，而是一组可能被证伪的命题。

### H1：交互价值的条件性

只有当初始功能多样性与私有信息互补性足够高时，交互相对成本匹配独立集成产生正 alpha。

### H2：一致—充分度错位

无治理讨论会使 surface agreement 的增长快于 epistemic adequacy，且这种错位预测错误集体决策。

### H3：机制特异性

针对信息发现/传播的干预主要通过提高关键证据暴露与利用来改善结果，而不是仅通过增加 token 或轮数。

### H4：治理的条件平均处理效应

诊断条件化的干预相对随机干预、固定干预和无干预具有更高的质量—成本 Pareto，但效果随任务、模型和群体组成异质。

### H5：相对测量优于绝对阈值

以个体初始状态和组内轨迹为基准的相对变化指标，比跨模型共享的固定 R/T/H/F 阈值具有更好的 held-out 泛化。

### H6：拓扑调节 alpha

高密度通信提高传播速度，但在开放搜索和异质信息任务上更容易造成冗余与多样性坍缩；自适应稀疏通信在相同预算下更优。

若这些命题不成立，v6 的理论也必须相应收缩，而不是继续增加指标解释失败。

## 12. 证据等级与论文 claim 纪律

| 等级 | 允许的 claim | 所需证据 |
|---|---|---|
| C0 描述 | 指标与某轨迹现象共现 | 预注册定义、可靠测量 |
| C1 预测 | 指标在结果发生前预测失败 | held-out、校准、跨种子 |
| C2 因果 | 某干预导致结果变化 | 随机对照、成本匹配、足够样本 |
| C3 机制 | 效果通过指定中介发生 | 时间顺序、处理—中介—结果分析 |
| C4 泛化 | 机制跨模型/任务/拓扑成立 | 多域复制和异质性分析 |

现有系统的大部分检测器处于 C0，少量具备走向 C1 的条件；尚不能整体宣称 C2/C3。

## 13. 与当前实现的映射

### 13.1 已经形成的可靠骨架

- `DiscussionEngine.finalizeRound`：唯一的轮次提交与停止仲裁点；
- `surfaceConverged / acceptedConsensus / stopDecision`：开始拆分表面收敛与制度接受；
- `ObservationLayer` 与 option canonicalization：观测边界和 fail-closed 解析；
- `NativeCognitiveEngine`：结构化自报状态和可插拔治理路径；
- `MeasurementLayer`：独立测量服务的雏形；
- `EvidencePool`：集体证据账本的雏形；
- `GovernanceEngine` 和 cognitive interventions：控制动作空间；
- `Runner`：随机种子、协议、结果落盘与多条件实验入口；
- TaskSchema/GroundTruth 在 campaign/HiddenBench 主路径上的初步解耦。

### 13.2 当前最重要的概念债

1. `cognitiveState` 混合 LLM 自报、系统估计和心理术语；
2. utility、belief、preference、stance 在不同路径中互换；
3. sync 与 async 的 R/T/H/F 同名异义且阈值来源不一致；
4. evidence coverage 仍部分依赖 agent 对“全部信息”的不可验证自报；
5. evidence entropy 只按已出现 support 归一化，不能表示候选空间覆盖；
6. authority、withholding、causal 等名称超过了观测所能支持的结论；
7. immediate state effect 与 next-round/final outcome effect 尚未统一建模；
8. 缺少成本匹配 independent ensemble，使 swarm alpha 尚不可估；
9. 缺少严格 treatment assignment，governance alpha 尚不可因果识别；
10. 旧 lunar/v2 实验仍可能把答案对象兼作候选结构。

## 14. v6 工程路线

### P0：概念与实验契约

- 引入 `TaskSchema / InformationMap / GroundTruth / EvaluationContract`；
- 将 reported、estimated、behavioral、outcome 字段分命名空间；
- 将 R/T/H/F 改为版本化 descriptive metrics，主实验默认不使用 F 终止；
- 建立 independent ensemble、full-information 和 cost-matched 基线；
- 将 sensitivity/causal 命名降格，除非存在随机处理分配；
- 静态禁止 prompt 层读取 GroundTruth。

### P1：证据与治理闭环

- EvidencePool 升级为带 provenance、支持/反对关系和重复簇的 EvidenceGraph；
- 对每个干预记录 diagnosis round、assignment、application、effective window；
- 在下一轮计算 proximal effect，在最终结果计算 task effect；
- 对干预进行分层随机化，估计平均与条件处理效应；
- 用 held-out 数据校准检测器，不在测试集调阈值。

### P2：自适应制度

- 学习成本敏感 stopping policy；
- 动态选择 speaker、edge 和 context；
- 将 group composition、topology 和 aggregation 作为制度变量；
- 扩展到 preference/open-ended contract；
- 最后再研究隐私、策略行为和混合动机。

## 15. AAMAS 长文应讲的故事

论文不应是“我们构建了一个包含很多认知指标的框架”，而应是：

> 多智能体讨论并不天然产生集体智能。我们把相对于成本匹配独立集成的增量定义为 swarm alpha，并将语言智能体的分布式信息整合建模为部分可观测、可干预的集体推理过程。SwarmAlpha 提供原子化轨迹、在线诊断、治理处理和因果实验协议，用于识别负 alpha 的形成机制，并检验自适应治理能否恢复质量—成本优势。

最小论文贡献应为：

1. 一个清楚的 formal problem 与 alpha 分解；
2. 一个能把 observation、diagnosis、treatment、outcome 分开的系统；
3. 一个有独立集成、无治理、随机治理、诊断治理和 oracle 的实验设计；
4. 至少两类任务、多个模型和拓扑上的因果/异质性结果；
5. 对失败条件的诚实结论，而不是只展示平均提升。

## 16. 与相关工作的关系

v6 吸收但不复制以下思想：

- DeGroot 的共识模型说明社会学习如何收敛，但收敛本身不保证正确；
- Hidden Profile 研究说明群体会偏向共享信息并遗漏关键私有信息；
- 群体多样性理论说明功能多样性在特定条件下可以超过单纯能力选择；
- 社会影响实验表明意见变得更接近、信心变高时，群体准确性仍可能下降；
- 近期 multi-agent debate 研究表明 vanilla debate 经常不能稳定超过独立集成，收益依赖初始多样性、信心校准、模型组成和协议；
- LLM agent 研究已观察到从众、persona 不稳定、信息整合失败和通信拓扑导致的多样性坍缩。

SwarmAlpha 的差异化不应是再提出一种 debate prompt，而是建立 **在线可观测、可干预、可进行成本匹配因果比较的研究控制面**。

### 核心原始来源

1. DeGroot, M. H. (1974). [Reaching a Consensus](https://doi.org/10.1080/01621459.1974.10480137).
2. Stasser, G., & Titus, W. (1985). [Pooling of Unshared Information in Group Decision Making](https://doi.org/10.1037/0022-3514.48.6.1467).
3. Hong, L., & Page, S. E. (2004). [Groups of diverse problem solvers can outperform groups of high-ability problem solvers](https://doi.org/10.1073/pnas.0403723101).
4. Lorenz, J., Rauhut, H., Schweitzer, F., & Helbing, D. (2011). [How social influence can undermine the wisdom of crowd effect](https://doi.org/10.1073/pnas.1008636108).
5. Smit, A. P. et al. (2024). [Should we be going MAD? A Look at Multi-Agent Debate Strategies for LLMs](https://proceedings.mlr.press/v235/smit24a.html).
6. Liang, T. et al. (2024). [Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate](https://aclanthology.org/2024.emnlp-main.992/).
7. Zhang, J. et al. (2024). [Exploring Collaboration Mechanisms for LLM Agents: A Social Psychology View](https://aclanthology.org/2024.acl-long.782/).
8. Zhao, X., Wang, K., & Peng, W. (2024). [An Electoral Approach to Diversify LLM-based Multi-Agent Collective Decision-Making](https://aclanthology.org/2024.emnlp-main.158/).
9. Li, Y., Naito, A., & Shirado, H. (2025). [HiddenBench: Assessing Collective Reasoning in Multi-Agent LLMs via Hidden Profile Tasks](https://arxiv.org/abs/2505.11556).
10. Zhu, X. et al. (2026). [Demystifying Multi-Agent Debate: The Role of Confidence and Diversity](https://aclanthology.org/2026.findings-acl.1694/).
11. IFAAMAS (2026). [Proceedings of AAMAS 2026](https://www.ifaamas.org/Proceedings/aamas2026/).

## 17. v6 完成判据

只有满足以下条件，项目才应对外称为 SwarmAlpha v6：

- 理论、类型、日志和论文使用同一套 canonical vocabulary；
- schema、information 与 truth 在所有主路径物理隔离；
- 自报状态不再被表述为真实心智；
- sync/async 测量同名同义，或显式版本隔离；
- 可以计算 cost-matched swarm alpha；
- 可以追踪一次治理从 diagnosis 到 assignment、application、proximal outcome 和 task outcome；
- 至少一个核心治理效果由随机对照支持；
- 终止、共识、接受和成功被分开报告；
- 主要 claim 在 held-out 任务、多个随机种子和至少两个模型族上成立；
- 负结果和适用边界被作为理论的一部分报告。

在此之前，当前实现应称为 **v6 research candidate**，而不是已经完成理论闭环的 v6。
