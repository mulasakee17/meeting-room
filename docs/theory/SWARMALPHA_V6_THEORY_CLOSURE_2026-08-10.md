# SwarmAlpha v6 理论收口：可审计的集体认识实验方法

日期：2026-08-10
状态：第一篇论文与最小生产纵切的权威理论合同
适用范围：论文定位、研究问题、构念、实验对照、指标、claim ceiling、复杂度预算

若本文与 `SWARMALPHA_V6_FOUNDATION.md`、执行 masterplan、`future.md` 或历史实验命名冲突，
以本文为准。架构文档仍是相应代码对象的权威接口说明；本文不改变已经冻结的代码语义。

---

## 0. 最终决定

### 0.1 一句话定义

**SwarmAlpha v6 是一套把 LLM 多智能体通信转化为 claim-relative、可评分、可追踪、可随机化和可回放的集体认识实验方法。**

它研究的不是 Agent 的“真实内心信念”，而是：

1. Agent 在已注册 claim 上报告了什么概率；
2. 它实际看到了哪些报告与证据；
3. 报告如何随通信发生修订；
4. 通信相对独立推理何时有益或有害；
5. 在不提前知道真值时，选择性信息干预能否降低错误传播。

### 0.2 第一篇论文的主导贡献类型

主导贡献是 **new experimental method + empirical characterization**，不是已经成立的新社会理论，也不是已经证明有效的治理算法。

核心贡献句冻结为：

> SwarmAlpha 将 LLM 多智能体通信操作化为带概率、证据来源、暴露历史和时间顺序的显式报告过程，并以统一私密测量、随机协议分配和可回放审计，分别检验表示、交互与治理效应。

审稿人应记住的不是“我们做了很多治理模块”，而是：

> 过去只能阅读讨论文本；现在可以在不把自报状态冒充潜在心智的前提下，对多智能体错误传播进行可评分、可对照和可复现的实验。

### 0.3 治理不是论文唯一成败开关

论文贡献按以下顺序成立：

1. **测量贡献**：显式概率报告使个体与集体认识状态可评分；
2. **描述性科学贡献**：通信相对独立推理的收益、损害与错误依赖可以被区分；
3. **干预贡献**：选择性治理是否在显式表示之上带来额外收益。

第三层允许为零、异质或有害。若第一、二层得到充分证据，治理零效应不会使整篇论文失效。

---

## 1. 研究对象与本体边界

### 1.1 一次最小实验 episode

第一篇论文把一个 episode 限定为：

```text
one resolvable task instance
+ one preregistered binary or categorical decision claim
+ a fixed set of agents with controlled private information
+ one assigned communication protocol
+ a fixed discussion budget
+ one private final elicitation per agent
+ one authorized resolution
+ one auditable run artifact
```

代码可以支持多个 claim，但第一篇论文的主分析每个 episode 只使用一个 primary claim。这样避免跨 claim 聚合、不同难度加权和 missingness 混合成为新的识别问题。

### 1.2 唯一规范 belief

对 Agent `i`、episode `r`、轮次 `t`、claim `c`：

```text
B_i,r,t,c = probability distribution over the registered outcome space Ω_c
```

- binary：`B(true)=p`，`B(false)=1-p`；
- categorical：对全部 canonical options 给出完整概率单纯形；
- belief 是模型在特定协议下的 **reported belief**；
- belief 不是 latent mental state，不保证校准，也不是 Bayesian posterior；
- legacy `belief[-1,1]`、utility、stance、confidence label 不得升级为该对象。

### 1.3 证据与来源

一个报告可以引用证据身份和 lineage：

```text
Report = <claimId, agentId, probability, evidenceRefs, createdAt, supersedes?>
```

lineage 表示统计依赖或共同来源，不表示证据为真。重复 lineage 不能被当作多份独立支持；缺 lineage 时系统必须记录未知，而不是发明独立性。

### 1.4 暴露是事实，影响是估计

```text
Exposure(i, t, x) = Agent i 在 t 前实际获得了对象 x
```

它只证明信息进入了可见上下文，不证明 Agent 阅读、相信或因此改变报告。

“影响”“说服”“级联归因”若只由观察轨迹推断，最高是 descriptive/estimated；只有随机化暴露或协议处理才能支持因果表述。

### 1.5 resolution 与 correctness

resolution 是 task-owned resolver 给出的授权结果。proper score 只能在 final elicitation 关闭后计算。

系统可以主张“报告与已记录 resolution 一致”，不能仅凭内部自洽主张 resolution 对应外部世界真值。外部数据真实性属于数据 provenance 和 commitment 问题。

---

## 2. 三层可检验问题

### RQ1：显式概率报告是否形成可用且稳定的观测工具？

> 对 claim-relative reported belief 的观测，是否具有足够的可解析性、证据敏感性、稳定性与结果相关性，从而支持后续的集体认识实验？

这里的“有效”必须由数据支持，不能由 schema 存在推出。

这不是通过 `B` arm 优于 `T` arm 自动证明的；`B-T` 同时改变了提示、认知过程和通信内容，是协议处理效应，不是测量工具本身的效度检验。

最低验证证据：

- schema compliance / invalid rate；
- final report coverage；
- 对受控证据强度与方向的单调敏感性；
- 对语义等价 prompt/paraphrase 的稳定性；
- 当任务另有独立选择行为时，argmax 与该 Agent 私密最终选择的一致性；
- held-out Brier 与 calibration；
- final reported probability 对 resolution 的增量预测信息；
- 在关键 arm/model/task strata 上的 measurement-invariance 诊断；
- 与普通文本协议使用同一个 private final elicitation，避免测量工具不同造成假差异。

这里验证的是 **operational report 的研究可用性**，不是 latent mental belief 的真实性。

### RQ2：通信何时产生正或负的 swarm effect？

> 相对成本匹配的 independent ensemble，文本交互与显式 belief 交互如何改变 pooled proper loss、decision accuracy、false consensus 和成本？

这一问题方向开放。interaction 不优于 independent ensemble 也是有效结果。

### RQ3：选择性治理是否产生额外收益？

> 在显式 belief 协议之上，对高 reported certainty、低独立 lineage 支持的未解析 claim 进行可审计、随机化的信息干预，是否改善最终认识结果？

该问题是重要但次级的。治理效果必须与 explicit-belief unguided protocol 比较；治理机制特异性还需要 cost/opportunity-matched sham 或 random-action 对照。

---

## 3. 当前允许的理论命题

### 3.1 已由定义与确定性代码支持的命题（C0）

当前可以完整主张：

1. reported belief 是 claim-relative 概率对象，与 legacy stance/utility 分离；
2. report、evidence、lineage、exposure、revision、resolution 和 score 有不同身份；
3. final elicitation 在 discussion 后、resolution 前，且每个 agent 必须有显式 terminal record；
4. Stage-1 assignment、治理 decision/action lifecycle 和 replay artifact 有确定性验证契约；
5. schema-5 载体拒绝新旧 treatment 双重权威；
6. proper loss 对高置信错误施加更大 ex-post loss，但这不等于在线阶段已检测出错误。

### 3.2 需要 held-out 数据的命题（C1）

以下目前均未成立：

- certainty、lineage、influence 或其他监测量预测错误；
- 某阈值具有稳定风险识别能力；
- explicit belief 具有跨任务 calibration validity；
- false-consensus risk 可以由在线观测可靠预测。

只有冻结训练/校准/测试切分后才能升级为 C1。

### 3.3 需要 run-level 随机化的命题（C2）

以下必须依赖 Stage-1 ITT contrast：

- 显式 belief 协议导致平均 Brier/accuracy 改变；
- 交互导致正或负 swarm effect；
- epistemic-governance protocol 导致结果变化。

Agent、report、claim 或 round 不是独立因果样本。主分析单位是 run/task instance；推断按 task/run cluster 处理。

### 3.4 机制命题（C3）

即使治理有效，也不能仅凭 mediator 同时变化宣称机制被证明。C3 至少需要：

- 预先冻结的 mediator；
- treatment → mediator → outcome 的时间顺序；
- matched opportunity；
- 对 exposure、delivery、compliance 和 missingness 的区分；
- 对多 Agent interference 的明确限制。

第一篇论文默认不把 C3 作为接收所必需的主 claim。

---

## 4. 量与指标的最终收口

### 4.0 量的语义类型系统

任一量进入论文、阈值或控制策略前，必须属于且只属于以下一层：

| 层级 | 例子 | 何时可得 | 允许用途 | 不允许偷换 |
|---|---|---|---|---|
| self-reported | probability、evidence refs、abstention | resolution 前 | 观测与协议输入 | 不得称 latent belief 或 truth |
| deterministic-derived | certainty、entropy、top-two margin、verified-lineage count、exposure count | resolution 前 | 描述、冻结 eligibility | 不得称 error probability |
| fitted-estimated | calibrated risk、influence estimate、failure propensity | 仅在独立训练数据拟合后 | C1 风险排序或异质性分析 | 不得在同一 confirmatory 集拟合并检验 |
| resolved | correctness、proper loss、false consensus、recovery | resolution 后 | outcome、scoring、离线校准 | 不得回流到同一 episode 的在线控制 |
| decision/control | eligibility、assignment、delivery、compliance | 按生命周期逐步产生 | 授权动作与 ITT/per-protocol 分解 | diagnosis 本身不得获得控制权限 |

每个新 quantity 还必须登记 observation unit、公式/算法版本、方向、可得时间、missingness、聚合方式和 claim ceiling。无法登记的量不得进入 confirmatory 表格。

### 4.1 不存在一个跨任务万能 `F`

`R/T/H/F` 只保留 legacy replay/C0 描述。第一篇论文不使用自由能、相变、结晶或热力学定律作为理论依据。

也不构造一个把 accuracy、Brier、token、latency、abstention 和风险任意加权的总分。除非权重在预注册前有外部效用依据，否则各维度分别报告。

### 4.2 主结果：operational pooled Brier loss

所有协议结束后使用相同的私密 final elicitation。为避免处理导致的 abstain/invalid/unavailable 改变入池成员，从而形成处理后选择偏差，主分析必须覆盖全部预注册 Agent。

对 claim `c` 预先冻结一个无信息 reference distribution `π0,c`；平衡 binary/categorical 任务通常使用 uniform，非均衡任务只能使用在 assignment 前冻结的 design prior。对每个预注册 Agent：

```text
p̃_i = reported probability,  if terminal status = answered
     = π0,c,                  if terminal status = abstained/invalid/unavailable

p_operational = (1 / N_registered) Σ_i p̃_i
```

四种 terminal status 仍分别报告；数值 fallback 相同不代表语义相同。它只定义“整个被分配协议在无法产出预测时退回预注册基线”的 operational estimand。

binary：

```text
L_Brier = (p_operational - y)^2
```

categorical（使用 canonical option 顺序）：

```text
L_Brier = Σ_k (p_operational,k - 1[y=k])^2
```

主结果是 run-level operational pooled Brier loss，越低越好。它同时对预测方向和过度自信敏感，并保留全部随机化 runs。

**当前实现边界（2026-08-10）：** `swarmalpha.estimand.operational-pooled-brier@1.0.0` 的确定性内核已经实现。其身份由 Stage-1 `primaryEstimandRef` 在 assignment manifest 中冻结；v1 的 `π0` 固定为从预注册 outcome space 派生的 uniform reference。`OperationalAnalysisUnitV1` 在 assignment 前承诺 run、task、唯一 primary claim 和完整 Agent roster；`OperationalOutcomeArtifactV1` 绑定 analysis-unit hash、assignment-manifest hash 与 final-outcome hash，并从全部注册 Agent 重放主结果。

这仍不是 production 闭环：schema-5 carrier/verifier 已把 analysis unit 与 operational outcome 设为必需权威并执行交叉重放，但 Runner 尚未构造或写出这些对象。现有 `FinalClaimOutcome.pooledProperLoss` 继续保持 answered-only available-case 语义，只能作为次结果。answered-only、complete-case 及按 terminal status 的 sensitivity analysis 必须同时报告。

### 4.3 关键次结果

1. pooled decision accuracy；
2. answered-only pooled loss 与 mean individual proper loss；
3. final report coverage、invalid、abstained、unavailable；
4. token、model-call 和 latency cost；
5. false consensus rate；
6. calibration curve/slope/intercept（只在足够 held-out episodes 上报告）。

### 4.4 False consensus 的操作定义

对阈值 `τ_consensus`（预注册）和已解析 primary claim：

```text
FCR_r = 1[
  在全部 N_registered Agents 中，至少 ceil(τ_consensus × N_registered)
  个有效 final reports 具有同一唯一 modal prediction
  且该 prediction 与 resolution 不一致
]
```

- 平票不是 consensus；
- abstained/invalid/unavailable 不支持任何 modal prediction，也不能缩小 FCR 的分母；
- `τ_consensus` 不能用 confirmatory test outcome 调整；
- FCR 是 episode-level outcome，不是 Agent 数量级的独立样本。

### 4.5 Error cascade 与 recovery 的边界

在非随机暴露数据上，只允许使用：

- observed wrong-adoption reach；
- rounds-to-sustained-correct-modal-state；
- right-censored recovery indicator。

它们描述时间轨迹，不自动证明某条错误报告造成了级联。只有预注册、随机化的错误源或 exposure 才允许使用 causal cascade effect 表述。

### 4.6 Reported certainty 不是 error probability

当前 geometry：

- binary certainty：`max(p, 1-p)`；
- categorical certainty：`max_k p_k`；
- top-two margin 与 normalized entropy 为不同 quantity。

在线阶段的 `high certainty + insufficient verified lineage` 只是一个 eligibility condition。它不能叫“检测到 miscalibration”，因为 resolution 尚未开放。

真正 miscalibration 只能在 resolution 后、跨一组可比较 episodes 评估。

---

## 5. 治理策略冻结

### 5.1 第一篇论文只保留一个主要治理动作

主治理动作冻结为：

```text
verification-request@2.0.0
```

Eligibility：

```text
claim unresolved
AND verifier available
AND reported certainty >= frozen threshold
AND verified independent lineage count <= frozen cap
AND observation complete
```

这个条件不判断报告错误，只判断“当前高确定性报告缺少足够独立核验支持，因而值得产生一个随机化验证机会”。

其中 `certainty` 是冻结 belief contract 上的 deterministic geometry；`verified independent lineage count` 只统计在当时已完成 provenance/independence 验证的 lineage。unknown lineage 不是零条支持，observation 不完整时必须 fail-closed。

`certainty threshold` 与 `lineage cap` 是 **policy hyperparameters**，不是自然常数：

1. 只能由理论先验或与 confirmatory test 隔离的 development/pilot split 选择；
2. 必须连同 comparator、eligible-event prevalence、action budget 和版本一起冻结；
3. 不得用 confirmatory outcomes 回调；
4. 若 pilot 中 eligibility 太稀少或几乎全触发，应判定 manipulation 不可识别，而不是事后移动阈值；
5. 阈值命中率只能称 policy opportunity rate，不能称 miscalibration detection rate。

高置信错误的 **epistemic cost** 在 resolution 后由 proper loss 给出。单个错误事件不能证明 miscalibration；miscalibration 是一组可比较 episodes 上 `reported probability` 与 empirical frequency 的偏离。第一篇论文不使用 stake-weighted punishment 作为主 outcome。

### 5.2 动作语义

治理链必须保持：

```text
observation
→ descriptive diagnosis
→ eligibility
→ randomized assignment
→ delivery attempt
→ compliance/terminal status
→ proximal observation
→ private final outcome
```

`queued != delivered != complied != effective`。

### 5.3 Stage-1 与 Stage-2

- Stage-1：run-level protocol assignment，支持论文主要 ITT contrast；
- Stage-2：eligible-event apply/holdout/sham，仅作为治理过程和机制的 exploratory 分析。

第一篇论文不依赖 Stage-2 获得 C2 主 claim。这样避免在同一 run 内重复事件、时间变化与 Agent interference 被错误当作独立 treatment units。

### 5.4 当前明确延期

以下不进入第一篇论文的生产路径：

- reputation、stake、penalty、token economy、Web3 settlement；
- online threshold learning 或 adaptive dosage；
- group-level randomization；
- 多动作仲裁的实证比较；
- lineage-capped aggregation 和 independent countercheck 的正式因果主张；
- preference/open-ended/continuous claim；
- 通用社会模拟和真实心智建模。

现有代码接口可以保留，但冻结，不继续扩展。

---

## 6. 最小实验协议

### 6.1 三个嵌套主协议

1. **Text Interaction (T)**
   普通文本讨论；不要求逐轮显式概率/evidence；结束后接受相同 private final elicitation。

2. **Explicit Belief (B)**
   在相同交互结构和预算下，逐轮强制 claim + probability + evidence refs；无选择性治理。

3. **Epistemic Governance (G)**
   在 B 上启用冻结 eligibility 与 verification-request policy。

主要 contrasts：

```text
Explicit-report protocol effect = B - T
Governance-policy package effect = G - B
```

对 loss 指标报告方向时使用：

```text
Δ_rep = L_T - L_B
Δ_gov = L_B - L_G
```

正值表示 loss 降低。

`B-T` 包含结构化输出、逐轮自我显化及其对推理/通信的共同影响，不能写成纯 measurement effect。`G-B` 包含额外验证信息、调用与机会成本，不能在没有匹配控制时写成 verification mechanism 的特异效应。

主设计优先匹配 model/provider、private information、Agent 数、轮次与 call opportunity；token 差异作为处理实施的一部分记录成本。另做固定 token budget sensitivity，检查结果是否仅由额外计算量解释。

### 6.2 两个诊断控制

- **Independent Ensemble (I)**：Agent 不互相暴露，使用同等基础推理预算与相同 final elicitation；用于估计 interaction/swarm effect。
- **Cost-matched Sham/Random (S)**：只在治理机制特异性分析需要时加入；匹配 action opportunity、model calls、token budget 与可见性，但不按冻结 eligibility 选择验证目标。

`G-B` 足以估计部署整个治理 policy package 的 ITT 效应；只有 `G-S` 才能支持“选择性规则优于相同资源的非选择性动作”的机制特异性主张。它们是诊断控制，而不是继续扩展为八臂平台。oracle、partial-individual 和其他历史 arms 不进入首轮最小纵切。

### 6.3 Swarm effect 的方向

对 loss：

```text
swarm_effect_loss = L_I - L_T
```

正值表示交互降低 loss；负值表示 interaction harm。不得把它与治理效应合并为一个不可解释总量。

`I` 必须以相同 Agent、private information、model-call 数和轮次机会运行；被移除的 peer-message context 以私密 reflection opportunity 替代。否则 `I-T` 同时混入计算预算差异。

### 6.4 任务边界

第一阶段只允许：

- 一个已注册 binary 或 categorical primary claim；
- 可控制的 public/private evidence；
- episode 结束后可获得授权 resolution；
- 固定 Agent 数、轮数上限和基础发言顺序；
- 可构造 distributed-information 与 seeded-failure strata。

最小生产纵切先跑一个 task family；正式论文证据若要主张超出该 family 的稳健性，再增加一个 held-out family，而不是先做通用 adapter 生态。

### 6.5 正式 estimand 与识别

令 Stage-1 run-level assignment 为 `Z_r ∈ {I,T,B,G,S}`，`Y_r(z)` 为该 run 在 protocol `z` 下的 operational pooled Brier loss。主 estimands 为：

```text
Δ_interaction = E[Y(I) - Y(T)]
Δ_explicit    = E[Y(T) - Y(B)]
Δ_governance  = E[Y(B) - Y(G)]
Δ_selective   = E[Y(S) - Y(G)]   # 仅在 S 实施时
```

全部主 contrasts 使用 assignment-based ITT；delivery/compliance 只用于过程分解和预注册 secondary analysis。随机化单位是 run/task instance，不得把 Agent、round、report 或 eligible event 当作主效应的独立样本。

建议按 task stratum、seeded-failure stratum 和 model composition 阻塞随机化；同一 task template 的重复实例在推断中聚类。任务难度、模型与私有信息生成在 assignment 前冻结。若某 arm 的 positivity/assignment probability 为零，就不存在对应因果 contrast。

最小因果顺序为：

```text
pre-assignment task/agent state
→ randomized protocol Z
→ exposures / reports / governance opportunities
→ terminal private reports
→ resolution (仍被 truth firewall 隔离)
→ operational outcome Y
```

中间的 report、eligibility、delivery、compliance 和 mediator 都是 post-treatment variables；不得在主 ITT 中按它们筛样本。

---

## 7. 贡献—证据矩阵

| 贡献承诺 | 必需证据 | 当前证据 | 当前允许表述 |
|---|---|---|---|
| 显式 belief 可被严格表示和评分 | contract、parser、truth firewall、proper score、replay | deterministic tests 已有 | C0：系统实现了该测量方法 |
| 显式 belief 作为 operational report 具有研究效度 | held-out compliance、受控证据敏感性、稳定性、Brier、calibration、predictive validity | 尚无真实实验 | 不得声称有效，更不得外推 latent belief |
| 通信产生可测量的收益或损害 | I/T 成本匹配随机 runs | 尚无正式 runs | 仅研究问题 |
| 治理改善认识结果 | G/B Stage-1 randomized ITT | 尚无正式 runs | 仅研究假设 |
| 治理机制具有特异性 | G/S matched opportunities + mediator order | 尚无 | exploratory/延期 |
| artifact 可外部验真 | detached commitment + schema-5 production writer | 未完成 | 只能声称内部一致与 replay |

### 7.1 当前强 claim

- SwarmAlpha 定义了一个可审计、可随机化、可回放的实验方法内核；
- 它明确区分 reported state、derived quantity、governance decision 和 resolved outcome；
- 它能在确定性测试中拒绝若干会破坏识别和 replay 的非法 artifact。

### 7.2 当前必须避免

- “平台读出了 Agent 的真实 belief”；
- “reported confidence 已校准”；
- “治理检测到了在线 miscalibration”；
- “治理已经提高 accuracy/Brier”；
- “schema-5 已在 production Runner 闭环”；
- “哈希使数据 tamper-proof”；
- “框架已对任意任务或 Agent 系统普适”；
- “Web3 stake/reputation 已实现”。

---

## 8. Null-result 生存树

### A. G 改善 Brier/FCR，accuracy 不变

论文主张认识质量与 selective reliability 改善，不要求 accuracy 必须上升。

### B. G 无效，但 B 优于 T

论文主贡献转为显式表示和测量效度；治理结果成为重要边界/负结果。

### C. B 与 G 均不改善结果，但 I/T 揭示稳定 interaction harm 或 failure strata

论文转为多智能体通信风险的实验刻画与审计方法；必须跨 seed/task split 稳定。

### D. B、G、I/T 均无稳定差异

只剩系统/测量工程贡献，不足以自动支撑强 AAMAS 长文。此时停止扩建治理，优先检查 manipulation strength、测量可靠性、统计功效与任务构造；不得用更多指标寻找偶然显著。

### E. 解析、missingness 或 replay 不稳定

不得做效果 claim。返回工程修复或降格为 artifact/system paper。

---

## 9. 普适性的最终定义

SwarmAlpha 的普适性是 **接口与识别结构的可迁移性**，不是所有任务共享同一个公式。

### 可复用内核

- claim/report/evidence/exposure/resolution identities；
- proper-score interface；
- protocol assignment；
- observation/diagnosis/decision/delivery 分层；
- final private measurement；
- audit/replay/claim ceiling。

### 必须任务适配

- outcome space 与 claim construction；
- evidence provenance 和 verifier；
- resolution；
- action delivery；
- task utility/cost；
- failure injection。

若新任务无法提供可注册 claim、可比较 final report 和可信 resolution，它不属于第一篇论文的支持域。

---

## 10. 复杂度预算与停止规则

从本文生效起，最小纵切跑通前执行以下规则：

1. 不新增公共抽象，除非现有合同无法表达 T/B/G 纵切；
2. 一个新类型必须替代至少两个临时表示，或直接关闭一个实验 Gate；
3. 不新增指标，除非写清 observation unit、公式、方向、missingness、聚合和 claim ceiling；
4. 不新增治理动作；主动作只有 verification request；
5. 不新增 task ontology；先完成一个 primary task family；
6. 不扩展 Web3、信誉、group assignment、online adaptation；
7. legacy schema 只读，不继续演化；
8. F6/F7/F8 不再作为三个通用平台分别扩建，而合并成一条薄纵切；
9. production confirmatory 路径最终只能有一个 Runner、一个 schema-5 authority 和一个 outcome chain；
10. 任何工作若不提高测量效度、识别可信度或跑通最小实验，应延期或隔离。

---

## 11. 下一阶段：最薄纵切，而非继续筑平台

### Gate V1：单 episode deterministic vertical slice

必须依次完成：

```text
frozen study
→ Stage-1 assigned protocol
→ one task adapter
→ T/B/G execution
→ final private elicitation
→ resolution/scoring
→ one schema-5 artifact
→ replay verification
```

不得引入第二 task family、第二治理动作或 Web3。

### Gate V2：mock/deterministic campaign

- T/B/G 各至少一个可重放 run；
- I 作为 interaction control；
- S 仅验证 cost/opportunity matching；
- 所有 arm 使用同一个 final outcome contract；
- assignment、delivery failure、missingness 和 cost 能进入同一分析表。

### Gate V3：免费或极小付费 smoke pilot

目标仅是检查 manipulation 和测量：

- T/B 格式差异是否真实存在；
- invalid/timeout 是否可控；
- private information 是否正确隔离；
- final elicitation 是否有足够 coverage；
- governance action 是否真实 delivered；
- artifact 是否能从头 replay。

pilot 不估计论文效应，不用来调 confirmatory test 上的阈值。

### Gate V4：冻结后实验

只有以下全部冻结后才能运行：

- task split；
- primary endpoint（operational pooled Brier）与每个 claim 的 `π0`；
- T/B/G 协议；
- Stage-1 probabilities；
- eligibility threshold 与 lineage cap；
- missingness/exclusion/sensitivity；
- sample size 与预算；
- rule registry；
- schema-5 writer 与 replay version。

---

## 12. 最终理论地基判断

当前底层已经足以支撑一个严谨的 **claim-centric collective epistemics testbed**，但尚不足以证明：

- reported belief 有测量效度；
- 通信存在稳定 swarm alpha；
- epistemic governance 有效；
- 监测阈值可以 operational deployment；
- 平台对任意任务普适。

因此，接下来的科学瓶颈不再是定义更多概念，而是用最小、成本匹配、可回放的实验验证三件事：

1. 显式表示是否真的增加信息；
2. 交互何时帮助或伤害；
3. 治理是否在前两者之上产生额外价值。

这三问构成 SwarmAlpha v6 的最终理论主线。
