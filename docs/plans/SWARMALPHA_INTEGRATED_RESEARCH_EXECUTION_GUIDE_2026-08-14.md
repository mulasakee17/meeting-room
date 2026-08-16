# SwarmAlpha 历代引擎融合与研究执行总指南

日期：2026-08-14  
状态：**CURRENT EXECUTION AUTHORITY — replaces obsolete execution order, not object-level contracts**  
适用范围：下一阶段研究决策、最低必要工程、实验门控、论文收口与中长期路线。

本指南不新建 runtime、schema、detector 或产品层。它把历代 SwarmAlpha 的有效思想、当前 V6 实验基础、最近真实实验结果与相关工作整合成一条可执行路线。对象的具体语义仍以代码、schema、architecture contract 和实验事实报告为准；冲突时遵循 `docs/REASONING_PROTOCOL.md` 的证据层级。

本指南取代以下文档中的**执行顺序**，但不删除其中仍成立的定义与历史记录：

- `docs/research/CURRENT_ROUTE_AND_METHODOLOGY.md` §6–§8 中“社会热力学响应审计 active”的旧顺序；
- `docs/plans/MEASUREMENT_GOVERNANCE_CLOSED_LOOP_PROTOCOL_V1.md` 顶部暂停 source-disclosure 的旧优先级；
- 任何要求继续扩张 public-only verifier、九特征 predictor、`H_E/κ` 控制器或新 detector 动物园的旧计划。

---

## 0. 决策摘要

### 0.1 项目不换题，但研究顺序必须修正

SwarmAlpha 的长期母问题仍是：

> 在有限预算、部分信息、相关错误和延迟真值下，系统应如何配置、验证和治理不同 Agent、模型、工具与信息资源？

近期论文不直接解决整个母问题。它研究一个最小、可证伪且能扩展的实例：

> **在干预时不知道答案的条件下，改变信息访问或信息暴露的非破坏性动作，能否改善独立评价的多 Agent 集体决策质量？**

如果一个动作平均无效，就不开发选择器；如果动作有效但状态不能预测响应，就报告平均机制，不发明复杂 router；只有“动作有效→响应异质性存在→held-out 状态能够预测响应”依次成立，才进入选择性治理。

### 0.2 当前立即冻结与恢复的内容

**冻结：**

- public-only verification verdict 作为当前主治理动作；
- certainty-plus-lineage 阈值继续扩张；
- 九特征 process predictor、在线 router 和动态 threshold；
- `H_E/κ V1` 作为 detector 或控制器；
- 新 schema、信誉/Web3、通用资源注册表、UI 与多步自适应策略。

**恢复：**

- v2.1/v5 的核心原则：改变信息流，不直接压制 Agent；
- `inject_evidence`、`rebalance_attention`、`shuffle_knowledge` 所代表的信息动作家族；
- `P/E/C/I/S` 五维状态，但按因果时间与观测权限重新定义；
- 当前 V6 的 claim/report/evidence/exposure/randomization/final-outcome/replay 作为实验权威层；
- 社会热力学作为“状态—外场—响应—尺度”研究纲领，而不是现成的自由能控制器。

### 0.3 唯一近期主线

```text
注册信息结构
-> 冻结 prompt 下的显式报告与来源暴露
-> 随机化非破坏性信息动作
-> 记录新增信息、报告修正与交付
-> final private elicitation
-> 延迟 resolution 与 proper loss
-> 先检验平均机制，再检验状态条件响应
```

这条路线称为**可审计信息流治理**。这是研究抽象，不授权创建同名框架或复制一套内核。

---

## 1. 当前事实基线

### 1.1 已实现并端到端运行

当前 V6 已具有：

- binary/categorical claim 与显式概率报告；
- evidence 注册、provenance/content hash、exposure 与 supersession 事件；
- Stage-1/Stage-2 随机化、action lifecycle 与 delivery 状态；
- final private elicitation、延迟 resolution、pooled multiclass Brier；
- schema-5 carrier、deterministic replay、provider-call/token budget；
- HiddenBench 固定数据投影；
- pre-discussion single-source disclosure 任务变体。

这些能力证明实验链可以运行和审计，不证明测量有效、治理有效或现实部署有效。

### 1.2 已有实验结果

**FACT — 96-run task-heldout verification replication：**

- 96/96 artifacts 完成并 replay；
- apply 30、holdout 14、sham 9、ineligible 43；
- apply pooled Brier 0.9287，holdout 0.8302；
- observed apply−holdout = `+0.0985`，方向为 apply 更差；
- task-cluster bootstrap 95% CI `[-0.3697,+0.7424]`；
- 30 个 apply verdict 中 19 个为 `insufficient_evidence`；
- 冻结结论为 `DEFER`，不支持治理效果。

**FACT — process-state predictor：**四个粗粒度 pre-action 特征的 task-heldout MSE 差于 constant baseline，未获得选择性控制权限。

**FACT — social-thermodynamic response audit：**

- `H_E` 约在 `[0.8988,1.0000]`，近退化；
- `κ=R(1-H_E)` 被 `H_E` 主导并压缩在极小范围；
- 当前 `H_E/κ V1` 得到 `STOP`，response evidence 为 `DEFER`，policy authorization 为 `NO-GO`；
- exact content reuse 与 verbatim commitment coverage 有描述性变化，但没有 detector 或 policy 权限。

### 1.3 最强合理推断

当前失败更符合以下解释：public-only verifier 往往重新处理已有公共材料，没有稳定提供独立信息；现有 detector 又未能识别其受益状态。它不证明所有治理无效，但足以停止继续围绕该动作堆叠复杂状态和阈值。

---

## 2. 历代引擎的继承、修复与退役

下表是概念谱系，不是精确 release note。

| 阶段 | 有价值资产 | 暴露的问题 | 当前处置 |
|---|---|---|---|
| v1–v2 结果/偏差治理 | Decision Trace、监测→干预闭环、共识/影响/动态指标 | 排序任务依赖；共识被误当质量；直接干预缺独立结果识别 | 保留事件轨迹与闭环问题，旧任务量退出权威主路径 |
| v2.0 直接认知干预 | `reduce_weight`、`force_reflection` 提供可证伪动作 | smoke 中 Δτ=-0.267，动作可能压制正确信息或制造锚定 | 作为历史负面对照；默认退役，不进入当前主实验 |
| v2.1–v3 非破坏性治理 | `inject_evidence`、`rebalance_attention`、`shuffle_knowledge`；“结构比话术重要” | 早期正向数字存在撤回/任务依赖；旧实验环路与当前 authority 不同 | 恢复为动作家族与机制假设，用当前 V6 重新识别，不合并旧效应 |
| v3–v4 社会热力学 | R/T/H/F、终止、发言意愿、群体作为动力系统 | R/T/H 强耦合；物理类比超过证据；F 不具跨任务效度 | 保留动力系统问题与描述量；F 不进入近期控制或主结论 |
| v5 双层认知诊断 | U/E/I/C/Λ、δ、measurement/diagnosis 分层、SemanticTool | 自报/启发式混用；部分 δ 无预测效度；心理化命名过强 | 修复为观测坐标；δ 仅候选诊断；语义工具未来作为有成本 action |
| 旧 v6 混合范式 | deterministic-first、semantic-on-demand、progressive estimator | 工程接通不等于阈值有效；可能调用昂贵但无新增信息的判断器 | 保留渐进式资源哲学；暂停未校准控制 |
| 当前 V6/schema-5 | claim-centric authority、随机化、final outcome、replay | 工程厚、科学机制仍未建立；当前 verifier 未复现收益 | 作为统一实验底座，不作为论文的主要科学贡献 |

### 2.1 不可丢失的七条设计哲学

1. 测量先于授权，但测量研究不能无限阻塞机制实验。
2. 非破坏性动作优先于压权、删权或强迫改信。
3. 信息结构通常比“再说一句反思”更值得优先验证。
4. 确定性、低成本观测优先；昂贵语义资源按需调用。
5. 治理必须闭环到独立 outcome，不以共识、稳定或触发率代替质量。
6. 成本、missingness、invalid、延迟和失败属于效果的一部分。
7. 负结果用于淘汰机制，不通过增加特征挽救假设。

### 2.2 明确退役的旧叙事

- 一个 F 能跨任务总结系统健康；
- LLM 自报 certainty 等于真实置信度；
- 来源不同自动等于错误独立；
- 数学函数存在就意味着构念有效；
- 固定阈值是跨模型自然常数；
- 更多 detector/action/schema 等于更强治理；
- 旧结果可以与当前 schema-5 结果直接混池为一个因果结论。

---

## 3. 统一方法论：观测—信息动作—响应—结果

### 3.1 观测对象

LLM 在冻结仪器契约 `Π` 下产生：

\[
P_{i,t}^{(\Pi)}(y)=\hat p_i(y\mid X_{i,t},\Pi).
\]

它是 prompt-conditioned report，不是对 latent belief 的无偏读取。prompt、选项顺序、可见 transcript、模型/config、parser 和失败策略都是测量条件。近期同臂比较必须冻结这些条件；跨 prompt 不变性需独立 qualification，不能由 replay 推出。

### 3.2 修复后的五维坐标

五维不是同一时刻的“Agent 人格向量”，而是跨因果时间的响应坐标。

| 坐标 | 当前定义 | 时间/权限 | 不能代表 |
|---|---|---|---|
| `P` position | categorical probability report | action 前/后可观测 | 内心信念、真实知识 |
| `E` evidence state | registered/exposed/referenced source identities 与关系集合 | action 前/后架构事件 | 自动的证据质量或独立性 |
| `C` concentration | 如 `max_y P(y)`、margin、entropy | action 前/后派生 | calibration、可信度 |
| `I` inertia | pre/post report 的持久性，如 `1-TV(P_pre,P_post)` | post-action mediator | 稳定人格、因果效果 |
| `S` susceptibility | 随机化下某状态 strata 的 treatment response | population/state-level estimand | 单个 Agent 自报或一次变化 |

历史 Utility `U` 不一刀切删除：在具有外部 cardinal utility 的任务中，它可以由任务 adapter 定义；在 HiddenBench categorical task 中不把概率偷偷改名为效用，而使用 `P`。

### 3.3 社会热力学的合法形式

```text
microstate: P / E / C
external field h: inject / rebalance / shuffle / verify / retrieve
response: ΔP / ΔE / update activity / final loss
susceptibility χ(s): randomized effect within a state stratum
macro description: alignment / source concentration / cascade / recovery
scaling: agent count / topology / model mix / information overlap
```

当前允许保留 `R`、exact reuse、verbatim coverage、update activity 等描述量。`H_E/κ V1` 已停止，不得换名后重返控制。社会热力学按以下证据梯度发展：

1. ST-0：规范微观事件可形成非退化描述量；
2. ST-1：宏观态对 held-out failure/response 有增量预测；
3. ST-2：随机外场产生可复验响应；
4. ST-3：关系跨规模、拓扑、模型或任务形成稳定缩放；
5. ST-4：前三层成立后才讨论临界、相变、势函数或控制界。

### 3.4 Ground truth 边界

在线动作不得读取 ground truth。系统可以使用：注册信息权限、公开/私有来源身份、实际 exposure、报告历史、预算和失败状态。resolution 仅在动作、最终私密报告完成后用于 proper-loss 评分和离线学习。

对永远没有结果反馈的场景，系统只能提供流程、来源和责任审计，不能证明决策质量改善。

---

## 4. 动作家族：复用旧版本，不新造动作动物园

| 家族 | 当前操作化 | 研究角色 | 当前授权 |
|---|---|---|---|
| Holdout | 不增加信息动作 | 因果基线 | 保留 |
| Inject | 披露一个按冻结规则选定的注册私有来源 | 最小信息增量、无额外 provider call | **立即进行小规模机制筛选** |
| Rebalance | 结构化交换未公开来源、少数来源或异议 | 改变注意/暴露结构 | 只作后续强基线；不先建新 runtime |
| Shuffle | 改变初始知识分配/网络拓扑 | 结构干预上界、社会热力学外场 | 暂不作为近期主臂，避免改变任务定义 |
| Public verify | 对公共材料给 verdict | 已测弱动作/历史对照 | 冻结扩张，不作为近期主动作 |
| Independent resource | 检索器、工具、不同模型、人工复核 | 真正异构信息资源 | 后续论文，不进入当前筛选 |
| Destructive control | reduce weight、force reflection | 历史负面对照 | 默认禁用 |

### 4.1 为什么先筛选 Inject

现有 `sourceDisclosureInterventionV1.ts` 已实现 truth-blind、no-extra-call 的 paired task variant；它改变真实信息访问集合，而不是要求模型重新解释同一材料。复用它可以用最少工程回答最关键的机制问题。

但“披露信息”本身不是新颖性主张。HiddenBench 已报告 Reveal-All 与结构化交换能够改善 hidden-profile 协作。因此当前筛选仅是机制探针。若进入正式论文，差异化必须是：**边际而非全量披露、来源/交付可审计、成本固定、独立概率 outcome、随机化边际贡献，以及后续的状态条件响应。**

---

## 5. 执行顺序与门控

### Phase 0 — 事实收口与实验面冻结（1–2 天，零 provider）

目标：防止旧路线继续产生冲突和无效工程。

必须完成：

1. 将 public verifier replication、process predictor、`H_E/κ V1` 分别标记为 `DEFER / DEFER / STOP`；
2. 盘点可用且未被近期开发/heldout 分析污染的 HiddenBench task clusters；
3. 对 source-disclosure 候选任务进行人工语义审查，不读取 outcome 选择任务；
4. 确认两臂唯一差异是 public context disclosure block；
5. 复用现有 V6 runner、manifest、final outcome 与 replay，不新增 schema；
6. 冻结调用上限、token 上限、task/block seed、失败保留规则与分析器版本。

交付物只允许是：一个 plan、一个 runner/analyzer 的最小接线、确定性测试和一页 preflight。不得新增平台模块。

### Phase 1 — 最小 Inject 机制筛选（32–48 runs）

建议设计：

- 8–12 个新 task clusters；
- 每 task 2 paired blocks；
- 每 block 含 holdout 与 forced-source-disclosure；
- 总计 32–48 runs；
- 同一 block 的两臂绑定同一个潜在 source identity；
- arm 不改变模型、roster、private views、discussion/final prompt、provider-call ceiling；
- 单次调用、无 retry、失败保留 terminal identity。

主结果：

\[
\Delta_{D-H}=\operatorname{mean}_{task,block}(L_D-L_H),
\]

其中 `L` 为 final pooled multiclass Brier，负值偏好 disclosure。

机制结果：

- disclosure block 是否实际进入可见 public context；
- 后续报告是否引用/复述该来源；
- pre→final TV 或 target-option mass 是否变化；
- invalid/unavailable、tokens、latency；
- task-level effect direction，不用 report 当独立样本。

**Screen gate：**

- 所有预注册 runs 都有 terminal 身份；
- replay 与 truth/private firewall 通过；
- D 不增加 provider calls；
- 动作确实改变 exposure，且后续报告出现可检测 uptake；
- paired mean `Δ_D-H < 0`，任务方向不由单一 cluster 驱动；
- 不要求小筛选的 CI 完全低于 0，也不得称效果成立。

若动作没有造成 uptake，判 `MECHANISM STOP`。若有 uptake 但质量方向非负，判 `QUALITY STOP`。两种情况均停止该动作，不改来源规则后在同一数据上重试。

### Phase 2 — 正式论文实验（仅 Phase 1 通过后）

正式实验最多三臂：

1. `Standard`：普通分布式信息讨论；
2. `Structured`：官方或忠实复现的强结构化信息交换基线；
3. `SwarmAlpha-Inject`：可审计的单来源边际动作。

必要时将 independent ensemble 作为 secondary compute-matched baseline；不同时增加 confidence router、九特征 policy 或多个 verifier。

设计下限：

- 16–24 个新 task/leakage clusters；
- task 内配对或 block randomization；
- task/leakage group 为推断单位；
- 冻结 cluster bootstrap、missingness、primary contrast 和多重比较顺序；
- primary：pooled Brier；secondary：accuracy、abstention/invalid、tokens、latency；
- mechanism：source uptake 与 belief revision；
-  essential evidence 能在 AAMAS 八页正文中自包含。

正式主张门：artifact/replay/firewall 全通过，主效应方向与区间满足冻结标准，并且优势不能仅由额外 provider calls 解释。否则报告 null/negative boundary，不增加实验后子群寻找正结果。

### Phase 3 — 状态条件治理（仅平均动作成立后）

顺序固定为：

```text
平均动作有效
-> 预注册少量 pre-action state
-> development 估计 response heterogeneity
-> task-heldout 验证方向和增量
-> 与 always/random/matched-budget 比较
```

初始候选只允许使用已有且直接的量：

- registered source exposure/coverage；
- exact content reuse；
- alignment/disagreement；
- report concentration；
- task option count。

不得直接恢复九特征 discovery。风险预测 `r(X)` 与动作收益 `g_a(X)` 必须分开：能预测失败不等于知道谁会从动作中受益。

---

## 6. 两周执行表

### 第 1–2 天：冻结与任务审查

- Codex：冻结 scientific question、action contrast、estimand、screen gate、claim ceiling；审核 unused-task/leakage 清单。
- Claude Code：只读盘点任务使用历史，生成候选表；核对 source-disclosure 接线缺口；不得自行接受 semantic review。
- Owner：确认任务候选和付费执行预算。

### 第 3–4 天：最小接线

- Claude Code：复用现有 runner/adapter/replay，补 plan、CLI、analyzer 和 deterministic tests；不改 `src/**`、schema 或 provider primitive。
- Codex：审查 truth firewall、paired source identity、arm 唯一差异、failure denominator、cluster unit 与 no-retry。

### 第 5 天：零调用 preflight

- `--plan` no-replace；
- 任务/seed/source/arm 数量审计；
- 预算在 provider 前生效；
- exact retry 不重抽 source/arm；
- 输出路径与 partial-state fail-closed；
- 明确 GO/STOP 后才允许真实调用。

### 第 6–7 天：32–48 run screen

- 顺序执行；
- 不换 task、seed、source 或失败 run；
- 不根据中间结果停止某臂；
- 保存 provider call/token/latency 与 terminal failures；
- 结束后独立 replay。

### 第 8 天：冻结分析

- 先报告 artifact/replay/firewall；
- 再报告 uptake；
- 最后报告 Brier/accuracy/cost；
- 只给 `SCREEN-PASS / MECHANISM-STOP / QUALITY-STOP / DEFER`；
- 不搜索阈值、子群或新复合量。

### 第 9–10 天：论文方向决策

- 若 PASS：冻结正式三臂实验与强基线 fidelity；
- 若 STOP：不扩 source action，转向负结果/方法边界并从旧动作家族选择下一个**单一**候选；
- 每次只能晋级一个动作，避免 action 竞赛。

### 第 11–14 天：论文与正式实验准备

- 重写论文 problem/method，工程 replay 压缩为可信度基础设施；
- 完成强基线协议核对；
- 冻结正式 task split、analysis 和预算；
- 未通过 screen 不执行正式付费实验。

---

## 7. 论文方案

### 7.1 论文核心问题

> Can a truth-blind, auditable marginal information intervention improve collective decision quality under asymmetric information, and what observable state predicts its response?

第二问只有 Phase 3 获准后进入主论文；否则论文只回答第一问和机制边界。

### 7.2 推荐标题

主标题候选：

> **Governing Information, Not Confidence: Auditable Marginal Interventions for LLM Agent Collectives**

如果 screen/正式实验无正效应，应改成不承诺改善的标题，例如：

> **Auditing Information Interventions in LLM Agent Collectives**

### 7.3 最多三项贡献

1. 将 prompt-conditioned report、registered source、exposure、action 和 final outcome 分离的操作性状态模型；
2. 一个 truth-blind、随机化、成本可计量的边际信息动作实验；
3. 关于信息 uptake、决策质量与状态响应的正、零或负结果，以及社会热力学的经验边界。

schema-5、hash、builder、registry 和测试数量属于可信度方法，不独立占一项科学贡献。

### 7.4 与前沿工作的关系

- [HiddenBench](https://arxiv.org/html/2505.11556v4) 已表明分布式私有信息暴露是核心瓶颈，并给出 Reveal-All/结构化交流；SwarmAlpha 不把“分享信息”本身当新意，而研究有来源、有成本、有随机边际效应的治理动作。
- [Should We Be Going MAD?](https://proceedings.mlr.press/v235/smit24a.html) 表明 debate 不稳定优于 ensemble，因此必须保留强、成本匹配的基线。
- [SELENE](https://aclanthology.org/2026.eacl-industry.7/) 与 [CascadeDebate](https://aclanthology.org/2026.acl-industry.93/) 已覆盖 confidence/disagreement 选择性 debate 和成本级联；SwarmAlpha 不应仅再造 uncertainty router。
- [MAST](https://arxiv.org/abs/2503.13657) 说明多 Agent 失败类型丰富；taxonomy 只能生成假设，不能自动赋予 detector 控制权。

### 7.5 Claim ceiling

在正式 Gate 前只能声称：

- 内核实现并可 replay；
- 当前 verifier replication 为 DEFER；
- 当前 `H_E/κ` macrostate STOP；
- single-source action 已实现/待筛选；
- social thermodynamics、heterogeneous governance 和 MCV 是设计意图或假设。

不得声称：通用治理有效、latent belief 被测得、来源独立、AAMAS-ready、现实组织效益、社会热力学定律或异构资源策略已建立。

---

## 8. 工程复杂度预算

任何新增工程必须同时回答：

1. 它关闭了哪一条研究链缺口？
2. 没有它能否用现有模块回答问题？
3. 它是否改变实验条件或增加 researcher degrees of freedom？
4. 失败后能否删除而不损坏核心？

### 8.1 当前允许

- source-disclosure 的最小 runner/plan/analyzer 接线；
- deterministic adversarial tests；
- 任务污染/semantic-review packet；
- 只读 replay 与结果表；
- 必需的事实文档同步。

### 8.2 当前禁止

- schema 6、external signature、Web3/reputation/stake；
- 新 detector/action registry；
- 在线 adaptive threshold、bandit、MCV router；
- 新 LLM judge；
- 大规模重构 `productionVerticalSlice.ts`；
- dashboard、UI、marketplace；
- 为一个 screen 新建通用 framework；
- 以测试数或对象层数当作项目进度。

### 8.3 代码与历史资产处置

- current paper kernel：保留并测试；
- 旧 action/detector：compatibility/read-only，按需要逐个通过 V6 重新实现；
- 旧 R/T/H/F：legacy replay/假设生成，不删除历史数据；
- 调试脚本/生成物：按已有 scope map 隔离，不在研究冲刺期做大规模清仓；
- 不拆多仓库，先通过入口和文档语义隔离降低认知负担。

---

## 9. 责任分工

### Codex / 高能力审查者

- 定义 research question、construct、action、estimand、gate 和 claim ceiling；
- 审核任务污染、truth firewall、随机化与因果单位；
- 审核高风险核心接线和实验结果；
- 决定 GO/STOP、论文主张和下一动作；
- 不承担机械文档同步、批量 fixture 或重复验收输出整理。

### Claude Code / 高性价比实现模型

- 在白名单内完成 runner/CLI/analyzer/tests；
- 生成任务使用史、semantic-review packet、静态事实表；
- 运行确定性测试、tsc/build、冻结实验和机械 replay；
- 不自行改变 action、task、seed、threshold、estimand、gate、schema 或 claim；
- 遇到 red-zone 只写最小复现并停止。

### Owner

- 批准付费实验预算与真实 provider 执行；
- 接受 task semantic review；
- 决定论文风险偏好与下一候选动作；
- 不以期待的正结果要求修改冻结规则。

---

## 10. 分支决策树

```text
Inject screen 是否产生真实 uptake？
├─ 否 -> MECHANISM STOP；检查 delivery/prompt，不扩大样本
└─ 是
   └─ final Brier 是否方向改善且非单任务驱动？
      ├─ 否 -> QUALITY STOP；保留负结果，换一个动作家族
      └─ 是
         └─ 正式三臂实验是否通过冻结 Gate？
            ├─ 否 -> 报告边界，不构建 selective policy
            └─ 是
               └─ pre-action state 是否 held-out 预测 treatment response？
                  ├─ 否 -> 只保留 always-action/cost result
                  └─ 是 -> 比较 selective vs always/random/matched-budget
```

下一动作优先级固定为：Inject → Rebalance/Structured Exchange → Independent Retrieval/Tool。不得回到 destructive control 挽救效果。

---

## 11. 中长期蓝图

### 0–1 个月：第一篇可审计信息治理实证论文

交付：一个有明确边界的动作、强基线、独立 outcome、fresh task clusters、成本与负结果纪律。目标不是证明平台万能，而是证明或证伪一个信息治理机制。

### 1–3 个月：异构认知资源动作

将 action 替换为模型、检索器、代码工具、人工复核或停止。定义条件边际价值：

\[
MCV(a\mid s)=\frac{E[L(Y(0))\mid s]-E[L(Y(a))\mid s]}{cost(a)}.
\]

MCV 必须由 held-out 随机机会估计，不能由模型品牌或主观能力表给出。

### 3–6 个月：principal-aware Agent society

加入 principal、delegation、organization、authority scope 和 model/runtime lineage，研究同源 Agent、Sybil-like false consensus、少数派保护和责任归属。信誉若实现，应是长期事件的可重算投影，而不是全局人格分。

### 6–12 个月：社会热力学经验理论

系统改变 Agent 数、网络拓扑、信息重叠、模型异构与外场强度，研究 response curve、cascade size、recovery time 和 scaling。只有 ST-1–ST-3 成立后才提出 ST-4 理论。

### 产品方向

产品不是“自动判断真相”，而是异构智能协作的认知治理 sidecar/control plane：记录谁掌握什么、谁看见什么、为何调用某资源、动作是否交付、最终结果与成本如何，并据此改进未来资源分配。

---

## 12. 完成定义

下一阶段不是以“又实现了多少模块”完成，而以以下四项完成：

1. 一个历代非破坏性动作在当前 V6 authority 下被公平筛选；
2. 结果能清楚区分 delivery、uptake、dynamics 与 independent quality；
3. 正结果可以晋级，负结果会真正停止该机制；
4. 论文主线在八页内可以被复述为一个问题、一个动作、一个结果和一个边界。

这条路线同时保护项目的下限和上限：下限是可信的、可复现的负/正机制实验；上限是面向异构私人 Agent 社会的信息资源治理与社会热力学响应理论。
