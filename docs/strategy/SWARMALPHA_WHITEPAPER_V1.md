# SwarmAlpha 白皮书 v1：私人 Agent 社会的可审计认知治理层

日期：2026-08-12  
状态：战略权威（Strategic Source of Truth）  
适用范围：项目定位、研究主线、长期架构、贡献边界、发展顺序  

> 本文回答“SwarmAlpha 为什么存在、当前是什么、未来要成为什么”。
> 论文的近期 estimand、实验臂与 claim ceiling 仍以
> [`SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`](../theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md)
> 为权威；具体对象语义以代码、测试和对应 architecture 文档为权威。

---

## 0. 执行摘要

### 0.1 一句话定位

**SwarmAlpha 当前是一套面向多 Agent 集体推理的可审计认识测量与实验底座：它把自然语言互动转化为可评分、可追踪和可回放的认识事件，把“治理”作为待检验的实验处理，而不是预设有效的系统能力。中期目标是在测量效度和治理效果获得证据后，发展为异质、带委托关系和私有信息的 AI Agent 社会认知治理层。**

这一定义同时包含三个时间尺度，但三者的证据权限不同：

1. **当前研究工具（FACT，测量优先）**：claim-centric collective epistemics testbed；
2. **中期平台方向（DESIGN INTENT）**：私人 Agent 社会的 cognitive-governance control plane；
3. **长期科学计划（HYPOTHESIS）**：从微观认识事件建立可预测、可干预的“社会热力学”。

三者不能互相冒充。当前代码已经支持第一层的主要内核和一条 V6 纵切；第二层还缺 principal/authority、跨组织身份和多 episode 制度状态；第三层目前只有描述性宏观态，没有规律、相变或控制定律证据。

近期论文的主角是**测量方法与实验识别**；治理只是使用这套方法被测量、被随机化、也允许被证伪的对象。只有到中期平台阶段，治理才成为产品和制度主角。

### 0.2 项目不是什么

SwarmAlpha 当前不是：

- 读取 Agent “内心真实信念”的系统；
- 任意任务通吃的多 Agent 编排框架；
- 模拟真实人类社会的通用社会模拟器；
- 已经证明有效的在线治理产品；
- Web3 信誉、质押或惩罚协议；
- 由一个 `F` 值判断群体健康的物理理论。

这些边界不是自我削弱，而是项目可信度的来源。

### 0.3 核心判断

**INFERENCE：**项目最有价值的资产不是已有代码量、某个 detector、某个热力学符号或某次正向实验，而是逐渐形成的五个组合能力：

1. claim-relative 的显式概率报告；
2. evidence / lineage / exposure / revision 的身份和时间结构；
3. diagnosis 与 control authority 的分离；
4. 随机分配、动作生命周期、统一私密终局测量；
5. schema-5 权威链和确定性 replay。

单独看，每一项都有相邻工作；把它们合成一个可用于认识传播实验、而又不偷换心智或因果含义的系统，才是 SwarmAlpha 的潜在壁垒。

### 0.4 当前阶段

**FACT：**项目处于“工程纵切完成，经验效度校准尚未完成”的阶段。

- V6 已有 T/B/G 的 provider-injectable production vertical slice；
- 已有 binary/categorical belief、final private elicitation、operational pooled Brier、Stage-1/Stage-2 assignment、治理 action lifecycle、schema-5 replay；
- 已完成真实 DeepSeek 工程 smoke 和探索性 canary，但没有 confirmatory campaign；
- HiddenBench 的固定数据投影与 categorical authority 已实现，但 V6 路径不是官方 HiddenBench 协议复现；
- 当前主风险谓词“高 reported certainty + 低合格 lineage”尚无 held-out predictive validity；
- 当前真实样本暴露出 certainty 离散化、触发率刀锋和任务构造 floor/ceiling；
- 新 `CollectiveEpistemicStateV1` 是描述性宏观态，不具有控制权限。

因此下一步的首要任务不是继续扩建平台，而是验证：**这些量是否真的携带与错误、传播和治理机会有关的信息。**

---

## 1. 为什么私人 Agent 社会需要认知治理

### 1.1 多 Agent 的持久理由不是上下文窗口

更长上下文、更强单模型会削弱“为了塞下更多信息而使用多 Agent”的必要性，却不会消除以下结构性需求：

- 信息由不同个人、组织和权限域持有，不能汇入同一个上下文；
- 不同 Agent 代表不同 principal，目标和责任天然不一致；
- 数据最小化、隐私、商业秘密与监管要求禁止全信息集中；
- 不同角色拥有不同的授权、技能、记忆和风险预算；
- 多个 Agent 可能共享同一模型、训练来源或 prompt，形成隐蔽相关错误；
- 一次判断会跨 Agent、跨工具、跨 episode 进入共享记忆与现实行动。

**INFERENCE：**未来多 Agent 系统的本质不会只是“多个模型一起答题”，而是“多个代表不同主体的认知代理在有限授权和部分信息下形成制度化集体决定”。这正是治理问题，而非单纯编排问题。

### 1.2 四类治理不能混成一个“安全层”

未来 Agent 社会至少有四层治理：

| 层 | 核心问题 | 典型对象 | SwarmAlpha 的责任 |
|---|---|---|---|
| 身份治理 | 谁代表谁？ | principal、delegate、credential、scope | 未来接入，不重造身份协议 |
| 信息治理 | 谁可以看到什么？ | access、privacy、data boundary | 记录 exposure 与边界，依赖外部授权层 |
| 认知治理 | 群体凭什么相信、如何修订？ | claim、report、evidence、lineage、confidence | **核心责任** |
| 行动治理 | 谁可以做什么、谁承担后果？ | tool call、approval、transaction、liability | 对接 action authority，不包办业务执行 |

[A2A](https://a2a-protocol.org/latest/topics/agent-discovery/) 和
[NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)
正在推进互操作、身份和授权。SwarmAlpha 不应复制这些层；它应回答它们留下的一个不同问题：

> 一个身份合法、权限合规的 Agent 所提出的判断，是否有足够独立证据？它的影响如何扩散？系统在不知道答案时，凭什么获得干预权限？

### 1.3 认知治理的最小对象不是 Agent，而是有上下文的 claim

“这个 Agent 可信”通常过于粗糙。Agent 可能在某领域可靠、在另一领域无知；同一模型实例可能在不同证据下做出完全不同的报告。

**DESIGN INTENT（中期）：**当 principal-aware 身份层接入后，SwarmAlpha 的完整治理单元应扩展为：

```text
<principal context,
 agent delegation,
 task,
 claim,
 report,
 evidence lineage,
 exposure history,
 protocol,
 time,
 resolution>
```

当前 V6 的实际最小分析单元仍是 `<task, claim, agent, report, evidence, exposure, protocol, time, resolution>`；`principal context` 与 `agent delegation` 尚未进入权威 carrier。信誉若未来存在，也必须是完整事件的可重算投影，而不是一个永久的全局人格分数。

---

## 2. 从旧版本到新主线：继承什么，废止什么

### 2.1 版本演化不是直线上升

下表是概念史，不是 release-note 精确版本表：

| 阶段 | 主对象 | 主要优点 | 暴露的问题 | 新体系处置 |
|---|---|---|---|---|
| v1–v2：结果/偏差治理 | ranking、scalar belief、7 类 detector、直接干预 | 首次形成监测→干预闭环；发现干预可反噬 | 排序任务依赖强；共识易被当质量；压权/强反思可能破坏信息 | 保留失败数据和非破坏性原则，退出权威主路径 |
| v3–v4：社会热力学与运行时 | R/T/H/F、终止、发言意愿、治理 runtime | 把群体视为动力系统；强调在线、低成本和系统层 | 旧 R/T/H 强耦合；物理类比超过证据；终止与生命周期曾有语义缺陷 | 只作 legacy replay 和假说生成 |
| v5：双层认知诊断 | U/E/I/C/Λ、δ 系列、语义工具 | 意识到“宏观异常≠根因”；提出测量层与诊断层分离 | 大量量依赖自报/启发式；部分 δ 无预测力；心理化命名过强 | 吸收分层思想，废止未校准控制权 |
| v6：claim-centric epistemics | 概率报告、证据、暴露、resolution、proper loss、随机治理、replay | 本体清楚、可评分、可识别、可迁移 | 范围变窄；经验效度和治理效果未知 | 当前论文与工程主线 |
| v6.1：微观到宏观 | collective epistemic state | 在规范微观事件上重新建立宏观量 | 仅描述性；未接生产 carrier；无预测/控制证据 | 社会热力学的新起点 |

### 2.2 必须继承的旧设计哲学

1. **测量先于干预。** 没有可靠状态，治理只是 prompt engineering。
2. **在线计算应尽量低成本。** 一旦输入经过权威校验，派生量应确定、可重放、少依赖额外 LLM judge。
3. **治理是闭环。** 监测、诊断、决策、交付、合规、结果与反馈必须分层。
4. **非破坏性优先。** 优先增加独立信息、暴露反证和保护正确少数派，而不是直接压低发言权或强迫改信。
5. **结构比话术重要。** 历史结果提示信息分配、发言机会和来源结构可能比“多说一句反思”更有效。
6. **成本属于效果。** token、延迟、失败和人工审查不是附录，而是治理可行性的组成。
7. **负结果是资产。** 破坏性干预、R/T/H/F 退化、δ 失效和触发率刀锋都应转化为边界知识。

### 2.3 必须明确废止的旧叙事

- “达到共识就是健康”；
- “数学量不会被欺骗”；
- “结构化自报等于真实认知状态”；
- “固定阈值是跨模型自然常数”；
- “一个 F 能跨任务总结系统健康”；
- “相似时间轨迹自动证明影响或级联因果”；
- “代码可插拔就等于构念普适”；
- “更多 detector、更多 action 等于更强治理”。

数学函数不能被语言说服，但它的**输入可以被策略性操纵、遗漏或伪造**。因此准确说法应是：

> SwarmAlpha 把可验证结构留给确定性内核，把语义与数据来源的不确定性显式暴露，而不是宣称消灭欺骗。

### 2.4 社会热力学没有被废弃，而是被降到正确起点

旧路径先定义宏观量，再寻找微观解释；新路径先建立可审计微观事件，再问是否存在稳定宏观规律。

用户提出“先做量子力学，再做大一统理论”的比喻抓住了层级关系，但更准确的类比是：

> 当前正在建立“微观状态空间与统计力学数据基础”，尚未得到动力学方程，更没有热力学定律。

社会热力学若要成为项目最大的一张牌，必须经历五级证据跃迁：

| 级别 | 内容 | 当前状态 |
|---|---|---|
| ST-0 描述 | 从规范微观事件计算宏观态 | `CollectiveEpistemicStateV1` 已实现 |
| ST-1 预测 | 宏观态在 held-out 数据预测错误、级联或恢复 | 未建立 |
| ST-2 响应 | 随机干预引起可重复的宏观响应 | 未建立 |
| ST-3 尺度 | 规律跨 Agent 数、拓扑、模型、任务保持或有明确缩放 | 未建立 |
| ST-4 理论 | 相变、临界减速、势函数或控制界有形式模型与证据 | 长期假说 |

在 ST-2 前不得用宏观量直接授权治理；在 ST-3 前不得声称普适类；在 ST-4 前不得使用物理定律口吻。

---

## 3. 相关工作定位：不是“无人做”，而是缺少统一识别链

### 3.1 多 Agent debate 与协作

[Should we be going MAD?](https://openreview.net/forum?id=CrUmgUaAQp) 发现，多 Agent debate 并不稳定优于 self-consistency 或 ensemble，且对协议和超参数敏感。
[ReConcile](https://openreview.net/pdf?id=Yol6nUVIJD) 使用置信度加权的多模型讨论提升推理表现。

这些工作主要优化协议与最终准确率。SwarmAlpha 应吸收两点：

- 独立 ensemble 和成本匹配必须是强基线；
- confidence 不能未经校准就成为影响权重。

SwarmAlpha 的区别不应写成“我们也有 debate”，而是：它把协议效果拆成显式表示、交互、治理三层，并为 report/evidence/exposure/action/outcome 建立统一审计链。

### 3.2 分布式信息与 HiddenBench

[HiddenBench 官方仓库](https://github.com/Yassellee/HiddenBench_ICML) 提供 65 个 hidden-profile 任务，用于区分个体推理与群体信息整合。它直接支持 SwarmAlpha 的核心前提：强单模型不自动解决分布式私有信息下的集体失败。

SwarmAlpha 对 HiddenBench 的正确关系是：

- 复用固定任务内容作为外部任务银行；
- 单独保留官方协议复现路径；
- V6 路径只称 task projection，不冒充官方 protocol；
- 在相同任务上检验 T/B/G，而不是用新 prompt 刷榜后称治理有效。

### 3.3 显式 belief 与集体信念控制

[Belief Engine](https://arxiv.org/abs/2605.15343) 把 stance 更新变成可检查的证据状态与 log-odds 规则；
[Programmable Collective Belief Control](https://arxiv.org/abs/2605.19915)
指出 LLM Agent 使群体信念转移可以被规模化操纵，并提出检测和干预研究议程。

这说明“collective belief dynamics”正在迅速成为竞争区。SwarmAlpha 不能只靠“显式 belief”宣称新颖性。其可防守差异应是：

- 不把设计者指定的更新规则当作 Agent 内在更新；
- 同时记录自报概率、来源、实际暴露、修订、治理权限和独立终局结果；
- 用随机协议与 replay 识别表示、交互和治理的增量作用。

### 3.4 制度化多 Agent 治理

[Institutional AI](https://arxiv.org/abs/2601.11369) 用公开 governance graph、制度状态和审计日志约束多 Agent 市场中的合谋。这是最接近 SwarmAlpha 长期制度方向的工作之一。

两者可形成正交分工：

- Institutional AI 更接近“哪些状态/行为合法，如何施加后果”；
- SwarmAlpha 聚焦“哪些认识报告受什么证据支持，错误依赖如何传播，何时获得信息干预权限”。

未来可集成：SwarmAlpha 产生 epistemic diagnosis 和证据，制度图决定业务层 action、appeal 与 sanction。

### 3.5 社会模拟与意见动力学

[Towards Simulating Social Influence Dynamics](https://arxiv.org/abs/2507.22467)、
[ScioMind](https://arxiv.org/abs/2605.13725) 等工作关注 conformity、polarization、人格、记忆和行为保真度；经典
[DeGroot 共识模型](https://doi.org/10.1080/01621459.1974.10480137)
与[信息级联理论](https://doi.org/10.1086/261849)提供了群体更新与跟随私有信息被压制的理论母体。

SwarmAlpha 近期不应竞争“最像人类的模拟器”。它应使用社会科学理论产生可证伪的 failure mode 和实验设计，同时以可解析任务、授权 resolution 和 proper loss 保持结果锚定。

### 3.6 身份、授权和 Agent 安全

[NIST 的 Agent 身份与授权工作](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)
强调 Agent 代表关系、权限、审计和不可抵赖；A2A 负责 discovery、skills、authentication 与任务通信。

**DESIGN DECISION：**SwarmAlpha 不另造身份认证协议，而是未来要求外部身份层提供可验证的：

- `principalRef`；
- `delegateAgentRef`；
- `organizationRef`；
- `authorityScope`；
- `model/runtime lineage`；
- `credential assurance level`。

SwarmAlpha 消费这些身份事实，用来判断“多个报告是否可能只是同一主体或同源模型的 Sybil-like 放大”。

### 3.7 因果推断与网络干扰

Agent 在同一讨论中互相影响，report 或 round 不是独立实验单位。网络干扰研究明确要求特殊设计与 estimand；例如
[peer encouragement designs](https://arxiv.org/abs/1609.04464)
处理不完全合规和同伴效应。

因此 V6 的 Stage-1 run-level ITT 是近期主效应的正确下限；Stage-2 eligible-event assignment 只能先作机制探索。长期若要声称“某条报告造成级联”，需要 edge-level encouragement、cluster randomization 或明确结构模型。

### 3.8 竞争矩阵

| 方向 | 强项 | 常见缺口 | SwarmAlpha 应贡献 |
|---|---|---|---|
| Agent 编排 | 工具执行、工作流、协作 | 认识状态和因果评价弱 | 不竞争编排，提供治理 sidecar/contract |
| MAD / ensemble | 提升任务性能 | 置信权重未必校准，过程难审计 | 表示/交互/治理分解与强基线 |
| HiddenBench | 分布式信息 benchmark | 不提供认知治理制度 | 外部任务基座上的可审计 T/B/G |
| Belief dynamics | 显式更新、群体操纵 | 容易把规则状态当真实 belief | reported-state 本体与 outcome validity |
| Institutional governance | 规则、制裁、制度状态 | 对证据依赖和 miscalibration 较弱 | epistemic evidence/diagnosis 层 |
| Social simulation | 规模、行为保真、社会现象 | resolution 和因果结果锚定弱 | 可解析任务与干预实验 |
| Identity/security | 谁能做什么 | 不判断认识依据是否可靠 | 消费身份事实，治理信念传播 |

**INFERENCE：**竞争窗口存在，但已经不是空白市场。项目必须用实验质量而不是概念口号建立先发优势。

---

## 4. SwarmAlpha 的统一理论骨架

### 4.1 七层对象

```text
L0 Principal / Role / Authority
  ↓
L1 Task / Claim / Outcome Space
  ↓
L2 Report / Evidence / Lineage / Exposure / Revision
  ↓
L3 Collective Epistemic State (descriptive projection)
  ↓
L4 Validated Diagnosis / Eligibility
  ↓
L5 Randomized Policy / Delivery / Compliance
  ↓
L6 Private Final Outcome / Resolution / Proper Loss
  ↓
L7 Causal Learning / Institutional Memory
```

当前内核覆盖 L1–L6 的主要 deterministic contracts；L0 只有 Agent ID 和任务 roster 的弱形式；L7 目前是离线分析而非持续制度学习。

### 4.2 四种 authority 必须分离

1. **身份权威**：谁在代表谁；
2. **认识权威**：报告引用了哪些证据、来源是否合格；
3. **程序权威**：谁根据什么预注册规则获得干预权限；
4. **结果权威**：谁有权给出 resolution，何时可以评分。

同一模型、Agent 或 Runner 不应默认同时拥有四种权威。

### 4.3 核心链条

```text
Text communication
→ explicit claim-relative report
→ append-only epistemic ledger
→ evidence / lineage / exposure / revision
→ descriptive collective state
→ empirically validated risk diagnosis
→ preregistered eligibility
→ randomized intervention opportunity
→ delivery / compliance / censoring
→ private final elicitation
→ authorized resolution and proper loss
→ run-level causal comparison
```

这条链的价值在于每个箭头都可以失败，而且失败会被保留；系统不把 queued 当 delivered，不把 delivered 当 effective，不把 exposure 当 persuasion，不把 hash 当外部真实性。

### 4.4 规范 belief 与高置信错误成本

对 claim `c`，Agent `i` 在时刻 `t` 的规范对象是 outcome space 上的自报概率分布：

```text
B_i,t,c ∈ Δ(Ω_c)
```

它是 operational report，不是 latent belief。高置信错误通过 proper loss 承担更大 ex-post epistemic cost；在线阶段没有 resolution，不能直接叫 miscalibration detection。

因此当前已经实现的**参考治理策略**应表述为：

> 当一个未解析 claim 上出现高确定性报告，而系统缺少足够合格、可区分的证据 lineage 时，随机产生一次独立核验机会。

它治理的是“验证不足的高承诺状态”，不是预知错误。但它当前存在两个独立限制：risk signal 尚未取得 held-out predictive validity；public verifier 在 HiddenBench 一类任务上也未必获得任何未公开私有信息。

**DESIGN DECISION：**该参考策略保留用于工程回放和机制基线，**不自动成为第一篇论文的正式 G 臂**。第一篇论文的正式 G 必须先通过两道 Gate：

1. eligibility signal 在 held-out 数据上具有非退化、增量的风险区分；
2. governance action 相对目标 Agent 的既有上下文提供可审计的信息增量，并在 matched control 下改变预注册近端量。

若第一道 Gate 失败，近期论文收缩为 I/T/B，不以选择性治理作主比较；若 signal 有效但 public verification 没有信息增量，则另行版本化 `independent-countercheck` 或受控信息访问策略，不能静默替换现有 G。旧 shuffle 结果只支持“信息结构值得检验”的假设，不授权直接把知识重排写进正式治理臂。

### 4.5 普适性的正确含义

SwarmAlpha 的普适性来自**语义接口和识别结构可迁移**：

可复用：

- claim/report/evidence/exposure/resolution identity；
- probability geometry 与 proper-score interface；
- observation→diagnosis→decision→delivery 分层；
- randomization、missingness、cost 与 replay；
- micro-to-macro projection protocol。

必须适配：

- outcome space；
- evidence provenance 和 verifier；
- resolution authority；
- private information；
- action delivery；
- task utility 与 failure injection。

因此“需要 adapter”不是不普适；偷偷把任务特定量命名成通用量才是不普适。

---

## 5. 当前系统的真实资产与真实缺口

### 5.1 已实现且可作工程事实的能力

- binary/categorical claim 与概率报告校验；
- append-only epistemic ledger、evidence graph、exposure 与 revision 语义；
- equal-weight aggregation、proper scoring、final private elicitation；
- Stage-1 protocol assignment 与 Stage-2 eligible-event assignment；
- observation、diagnosis、decision、action、delivery、compliance/censoring 生命周期；
- operational analysis unit 与 registered-agent pooled Brier；
- schema-5 载体、交叉验证与 deterministic replay；
- single-attempt provider boundary、预算中止和 no-replace artifact store；
- binary/categorical V6 纵切与 HiddenBench pinned-data projection；
- 描述性 `CollectiveEpistemicStateV1`。

### 5.2 已有但只能作探索证据的资产

- legacy E12/历史实验揭示群体协议显著低于全信息个体上限；
- 不同治理方式可能跨模型方向不一致；
- 破坏性干预有反噬案例；
- 旧 R/T/H/F 存在强耦合/退化；
- 某些 δ 或心理化 detector 没有稳定预测力；
- 新真实 smoke 证明 provider 纵切能完成与 replay，但不证明效果；
- 小规模 HiddenBench canary 暴露 trigger 稀疏和机制弱度。

这些结果适合支持“为什么需要更严格方法”，不应与新 V6 的因果效果合并。

### 5.3 当前最关键的科学缺口

1. **测量效度**：显式概率是否稳定、证据敏感、跨 prompt/model/task 可比较？
2. **诊断效度**：当前 eligibility signal 是否在 held-out 数据预测更高 proper loss？
3. **干预强度**：public-only verifier 能否改变 HiddenBench 这种需要私有信息整合的失败？
4. **非退化机会**：certainty 和 lineage 是否有足够变化支持选择性治理？
5. **外部效度**：结果能否跨至少两个有语义差异的可解析任务族？
6. **身份依赖**：多个 Agent 的报告是否实际来自同模型、同 prompt、同 principal？
7. **宏观效度**：collective state 是否比简单基线增加 held-out 预测信息？

### 5.4 当前最关键的工程缺口

工程不再是主要瓶颈，但仍有少数研究关键缺口：

- scientific task-bank 的人工语义 review 与防泄漏 split；
- official HiddenBench reference protocol 的独立可复现路径；
- calibration/held-out 分析中的 cluster-aware uncertainty；
- false consensus、cascade、recovery 的冻结分析定义；
- principal/model-lineage identity carrier；
- detached external commitment（若论文需要外部时间承诺）。

除此以外的大规模重构、UI、通用 registry 和新 action 都应延期。

---

## 6. 三层研究计划

### 6.1 近期论文：可审计的集体认识实验方法

主问题：

> Can claim-relative explicit reports make collective belief formation measurable and reproducible, and—conditional on a separately validated policy—can a randomized governance protocol reduce unsupported consensus under distributed information?

三个可分离研究问题：

1. explicit report 是否形成有研究效度的测量工具？
2. interaction 相对 independent ensemble 何时帮助或伤害？
3. selective epistemic governance 相对 explicit-belief baseline 是否增加价值？

最小贡献顺序：

1. measurement；
2. empirical characterization；
3. governance effect（允许为零或负）。

术语冻结：`protocol-arm assignment` 只指 run-level 的 I/T/B/G 分配；`governance-action assignment/delivery` 只指 G 内部某个 eligible event 的 apply/holdout/sham 与实际投递。本文不再用未限定的 “epistemic intervention” 同时指代两者。

### 6.2 中期论文：principal-aware Agent society

研究对象从同一实验中的匿名 Agent 扩展到：

```text
principal
→ delegated agent
→ organizational role / authority scope
→ private data boundary
→ model/runtime lineage
→ claim/report/action responsibility
```

核心问题：

- 同一模型或同一组织的多个 Agent 如何形成 Sybil-like false consensus？
- 领域信誉、来源独立性和授权范围如何影响聚合？
- 如何保护正确低信誉少数派，避免信誉锁定？
- 哪些责任属于 principal、agent runtime、model provider、verifier 或 institution？

这才是 Web3/信誉/质押可能有意义的前置问题。

### 6.3 长期计划：社会热力学

社会热力学不再追求一个漂亮的 `F`，而研究以下可证伪问题：

- 微观报告、来源与暴露结构能否压缩成具有预测充分性的宏观态？
- 某些宏观变量是否存在跨尺度响应曲线？
- 错误级联前是否存在临界减速、方差上升或恢复时间延长？
- 不同治理制度是否改变稳态、吸引域或扰动恢复能力？
- 是否存在 outcome–cost–diversity 的 Pareto frontier？

只有比简单基线产生稳定 out-of-sample 增益的宏观量，才有资格进入理论。

---

## 7. 未来产品形态：认知治理控制平面

### 7.1 目标形态

中长期 SwarmAlpha 可以成为一个与 Agent 编排框架解耦的 sidecar/control plane：

```text
Agent runtimes / A2A / MCP / enterprise workflows
                    ↓ events
          SwarmAlpha epistemic plane
    ├─ claim and evidence registry
    ├─ exposure and lineage ledger
    ├─ collective-state monitor
    ├─ policy eligibility engine
    ├─ audit / replay / challenge
    └─ outcome and institutional learning
                    ↓ decisions
       external authorization / workflow layer
```

### 7.2 产品价值不应承诺“自动判断真相”

更现实的产品价值是：

- 让组织知道一个集体决定基于哪些来源；
- 发现多个 Agent 其实共享同一来源或同一 principal；
- 在高承诺、低验证状态出现时触发额外审查；
- 保留谁看见了什么、何时修订、何时采取行动；
- 评价治理制度在历史结果上的 calibration、成本和失败率；
- 支持 appeal、human review 和责任分配。

### 7.3 与 Web3 的关系

Web3 只在同时满足以下条件时进入：

1. 多组织之间确实没有共同可信数据库；
2. principal/agent identity 与签名已经可验证；
3. 中心化 proper-score/reputation 机制已证明有正向价值；
4. 需要跨组织共享 commitment、结算或争议证据；
5. Sybil、串谋、身份洗白和 verifier corruption 有可接受防线。

否则 append-only database + signed manifest 更简单。链不是论文新颖性的替代品。

---

## 8. 科学假设与证伪条件

### H1：显式报告的测量增益

H1 必须拆成两个不循环的命题：

- **H1a（measurement qualification）：**在不利用 I/T/B/G 效果的独立配对扰动中，统一 final private report 达到 Q2；B 的 in-process explicit report 至少达到 Q1。G 只有在 pre-action report 完全复用已通过的 B elicitation contract/信息视图/config 时才能继承，否则单独验证。
- **H1b（representation effect）：**在 final instrument 已独立达到 Q2 后，B 相对 T 改变 collective outcome proper loss。H1b 是 protocol-arm treatment effect，不是测量效度证据；允许为零或负。

证伪/收缩：判据采用预先冻结的配对扰动量，而不是事后形容词。开发阶段至少计算：解析覆盖率；同一语义 paraphrase 下的 Jensen–Shannon distance 与 argmax 一致率；有序证据强度下概率变化的 Spearman 相关与单调性违反率；证据方向翻转后的 signed response；canonical option 重排再映射后的等变误差；以及相对 uniform/constant-report baseline 的 held-out Brier 增量。v1 首轮候选阈值已作为事前 **DESIGN DECISION** 冻结于权威协议；它们不是由现有数据估出的自然常数。development 若证明设计不可执行，只能在 held-out 前 version bump 后重冻，不能事后调阈值。

Measurement Gate 至少要求（权威定义见 [`MEASUREMENT_VALIDITY_PROTOCOL_V1.md`](../architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md)）：

1. 覆盖率达到预注册下界，且 invalid/unavailable 不集中于某一 arm/model/task；
2. paraphrase 变异显著小于证据方向或强度操纵引起的变异；
3. evidence-response 的 bootstrap 区间排除零并符合预注册方向；
4. option-order 等变误差不超过 development 阶段冻结容忍度；
5. held-out proper loss 优于预注册的 uniform/constant-report baseline，或提供独立结果的增量预测信息。

任一数值阈值都必须带 domain 和版本；它不是跨模型自然常数。

### H2：交互具有条件性 swarm effect

**HYPOTHESIS：**T 相对成本匹配的 independent ensemble 的增益依赖任务的私有信息互补性、Agent 相关性和协议。

证伪/收缩：若交互普遍不如独立聚合，项目转向 interaction-harm 监测，不再以“群体智慧”作为前提。

### H3：lineage-aware risk signal

**HYPOTHESIS：**高 reported certainty 与低合格独立 lineage 的组合，在 held-out 数据上标记更高 proper loss。

证伪/收缩：若 risk gap 近零、反向或跨任务不稳定，该 signal 永久降为描述性量，不通过移动阈值挽救。

### H4：选择性验证治理

**HYPOTHESIS：**在存在非退化 eligibility 的任务上，G 相对 B 降低 operational pooled Brier 或 false consensus，并具有可接受成本。

证伪/收缩：若 public verifier 无法获得新增信息，应判定机制不足，而不是泛化为所有 epistemic governance 无效。

### H5：宏观态的增量预测

**HYPOTHESIS：**disagreement、declared lineage diversity、exposure-conditioned revision 与 response concentration 对 error cascade/recovery 提供超过简单 certainty/majority 基线的 held-out 预测增益。

证伪/收缩：若无增量预测，保留可视化，不发展热力学理论。

这里不存在“描述性”与“可作预测器”的矛盾：`descriptive_macrostate_only` 规定的是**当前推理权限**——定义本身不携带预测或控制结论；ST-1 是一个待检验升级。允许在与 detector calibration 隔离的 exploratory/development 数据上拟合候选预测关系，并在独立 held-out split 上一次性检验；在 ST-1 通过前，它不得进入正式 G 的 eligibility、threshold 或主实验调参。主实验中若携带该投影，只能作为冻结的 secondary/exploratory covariate。

### H6：principal/model correlation 是 false consensus 的关键来源

**HYPOTHESIS：**表面多 Agent、实际同 principal/model/prompt lineage 的群体比真正异质群体更易形成错误一致；lineage-aware aggregation 或核验可降低该风险。

这是 Agent 社会论文的核心假设，当前尚无实现或数据。

---

## 9. 战略优先级与停止规则

### 9.1 现在必须做

1. 测量效度实验；
2. task-bank 语义审查与 split；
3. detector census、校准与 held-out 检验；
4. 最小 I/T/B pilot；只有 signal validity 与 action information-gain Gate 均通过后才加入 G；
5. 明确当前 verification action 的信息增量；
6. 预注册与 cluster-aware analysis；
7. 把新宏观态只作为预注册的 secondary/exploratory predictor 候选，不授权控制。

### 9.2 现在值得做但不阻塞

- official HiddenBench reference reproduction；
- 第二种可解析任务族；
- false-consensus/cascade/recovery 分析器；
- principal/model-lineage 最小设计文档；
- detached experiment manifest；
- legacy 结果的版本化 meta-analysis。

### 9.3 现在禁止继续扩张

- 新 detector 动物园；
- 新治理 action 竞赛；
- 在线 adaptive threshold；
- reputation/stake/Web3 实现；
- 真实社会人格模拟；
- 通用 UI 或 marketplace；
- 以测试数、代码量或抽象层数衡量进展；
- 把 social thermodynamics 直接接入控制。

### 9.4 三条停止线

1. **Measurement stop：**预注册的覆盖、paraphrase-vs-evidence signal-to-noise、evidence-response、option-order equivariance 或 held-out baseline Gate 未通过，停止治理效果实验；
2. **Detector stop：**held-out risk discrimination 不成立，冻结当前 detector；
3. **Mechanism stop：**治理动作没有信息增量或成本不可接受，不扩样该机制。

停止一条路线不等于停止项目；它要求回到更低一层贡献，而不是增加复杂度遮盖失败。

---

## 10. 贡献与护城河

### 10.1 近期可形成的论文贡献

在治理结果未知时，最稳的贡献组合是：

1. 一套不冒充 latent belief 的显式集体认识测量方法；
2. 表示、交互、治理效应的嵌套实验设计；
3. report/evidence/exposure/action/outcome 的可回放 artifact；
4. 对分布式信息失败、错误依赖与 missingness 的经验刻画；
5. 对选择性治理何时有效/无效的诚实结果。

### 10.2 真正的护城河

护城河不会来自一个公式，而来自四类积累：

- **语义资产**：边界清楚、版本化的对象与 authority；
- **实验资产**：冻结任务、失败注入、强基线、真实 artifact；
- **效度资产**：哪些量在何种域有效，哪些已经证伪；
- **制度资产**：可审计 intervention 和责任链。

这些资产随负结果也会增值；单纯代码功能不会。

### 10.3 论文与平台的关系

第一篇论文不需要证明完整 Agent 社会。它要证明：

> 我们有一套比“读文本和算 accuracy”更严谨的方法，能把多 Agent 认识传播变成可测量、可干预、可复现的研究对象。

如果这一步成立，principal-aware governance 与社会热力学才有可信地基；如果不成立，越早知道越好。

---

## 11. 责任宪法

### 11.1 Codex / 高能力审查者

负责：

- 本体、authority、estimand、因果识别；
- 核心 schema 和状态机语义；
- detector/action 的控制权限；
- task split 与预注册冻结；
- red-zone 代码和最终审查；
- 社会热力学的理论升级条件。

### 11.2 高性价比实现模型

负责：

- 在冻结 contract 下实现 adapter、fixture 和测试；
- 文档事实同步；
- 只读盘点、数据表、CLI 与机械重构；
- 运行既定命令并汇总结果；
- 对抗测试和 issue-code 覆盖。

不得自行决定：新构念、阈值意义、因果样本单位、主 estimand、truth timing、authority 合并或 claim 升级。

### 11.3 项目所有者

负责：

- 研究愿景和价值取舍；
- 预算、真实 provider 调用与凭据；
- task 的领域语义和人工 review；
- 对外承诺、预注册、论文提交和伦理/许可；
- reputation、惩罚、appeal 等规范性制度选择。

详细低上下文协作方式见
[`SWARMALPHA_STRATEGIC_EXECUTION_PLAN_V1.md`](../plans/SWARMALPHA_STRATEGIC_EXECUTION_PLAN_V1.md)。

---

## 12. 最终定义

SwarmAlpha 的最低成功不是“治理显著提升 accuracy”，而是让以下问题第一次可以被严格回答：

- 多 Agent 交流究竟增加了信息，还是只增加了相关性？
- 一致意见来自独立证据，还是同源复制？
- Agent 在看到什么之后改变了什么报告？
- 在线系统在不知道答案时，凭什么干预？
- 干预真的被交付、采纳并改善终局结果了吗？
- 哪些宏观状态能够跨任务预测级联与恢复？

**DESIGN INTENT：**如果近期实验地基成立，SwarmAlpha 将从“多 Agent 讨论评估器”发展为私人 Agent 社会的认知治理控制平面。

**HYPOTHESIS：**如果微观事件到宏观结果的关系能跨规模、拓扑和制度复现，社会热力学可能成为它最具原创性的长期理论。

**FACT：**现在最重要的不是继续把未来写进代码，而是用最少的实验验证这条道路是否真实存在。
