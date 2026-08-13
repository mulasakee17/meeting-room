# SwarmAlpha 战略执行规划 v1：低上下文、证据驱动的研究交付系统

日期：2026-08-12  
状态：未来工作的权威执行基线  
战略依据：[`SWARMALPHA_WHITEPAPER_V1.md`](../strategy/SWARMALPHA_WHITEPAPER_V1.md)  
理论依据：[`SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md`](../theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md)  

> 本计划的目标不是列出更多功能，而是把科学不确定性按正确顺序消掉，并让大部分实现工作可以在很小的上下文中交给高性价比模型。

---

## 0. 计划摘要

### 0.1 当前阶段判断

**FACT：**V6 的主要 deterministic kernel、真实 provider 工程纵切、schema-5 replay、binary/categorical authority 和 HiddenBench task projection 已经存在。当前阻塞论文的首要问题不是“系统能不能跑”，而是：

1. 显式报告是否是可用测量；
2. detector 是否在 held-out 数据上有预测价值；
3. 当前 verification action 是否有足够信息增量；
4. T/B/G 的差异能否在冻结设计中被识别；
5. 这些结论是否至少跨两个语义上不同的任务分层稳定。

### 0.2 六个阶段

| 阶段 | 核心问题 | 输出 | 是否允许付费 |
|---|---|---|---|
| P0 战略冻结 | 我们究竟研究什么？ | 本白皮书与执行计划 | 否 |
| P1 测量资格 | reported belief 能否作为研究仪器？ | measurement-validity report | 小规模 |
| P2 诊断资格 | risk signal 是否预测 loss？ | held-out detector report | 是，受限 |
| P3 机制资格 | action 是否提供真实信息增量？ | mechanism pilot | 是，受限 |
| P4 论文实验 | 表示、交互、治理效应如何？ | preregistered campaign | 是，冻结预算 |
| P5 Agent 社会扩展 | principal/lineage 如何改变集体认识？ | 第二篇研究纵切 | P4 后 |

社会热力学不是并行工程阶段。它作为 P1–P4 的 secondary predictive program 逐步升级；没有数据权限就不获得控制权限。

### 0.3 未来四周的唯一主线

```text
task semantic review
→ measurement validation
→ pre-action census
→ held-out detector validation
→ mechanism-strength pilot
→ freeze / go / revise / stop
→ preregistered I/T/B experiment (+ G only after mechanism release)
```

任何不能直接关闭这条链某个 Gate 的工程工作，默认延期。

---

## 1. 证据与决策顺序

### 1.1 Gate 层级

| Gate | 通过问题 | 失败后的动作 |
|---|---|---|
| G0 Integrity | artifact、authority、truth timing、replay 是否可靠？ | 修核心；禁止效果分析 |
| G1 Measurement | report 是否可解析、稳定、证据敏感、结果相关？ | 修协议或停止显式 belief 主线 |
| G2 Opportunity | detector 输入是否有足够方差和非退化触发机会？ | 重设计 task/signal，不调 confirmatory outcome |
| G3 Predictive validity | flagged 是否在 held-out 上有更高 proper loss？ | signal 降为描述性，禁止治理释放 |
| G4 Treatment fidelity | action 是否 delivered，且提供预期信息增量？ | 修/换机制；不扩样 |
| G5 Causal estimand | Stage-1 assignment、positivity、missingness、cluster 是否冻结？ | 不得做因果 claim |
| G6 External validity | 至少两个 strata/family/model 是否方向可解释？ | 收缩支持域 |

不得跳 Gate。例如 G0 replay 通过不能替代 G1；G2 trigger rate 合适不能替代 G3；G4 delivery 通过不能替代 G5 outcome effect。

### 1.2 当前 Gate 状态

| Gate | 当前判断 | 依据 |
|---|---|---|
| G0 | 工程纵切基本通过 | schema-5、真实 smoke、确定性与对抗测试 |
| G1 | 未通过 | 只有报告和小样本，没有系统 measurement validity |
| G2 | 未通过/已发现退化 | certainty 离散、0/100% trigger 刀锋；HiddenBench 机制 check 未触发 |
| G3 | 未通过 | 无冻结 held-out predictive validation |
| G4 | 部分工程通过、科学未知 | delivery lifecycle 有；action 信息增量弱/域依赖 |
| G5 | 合同就绪、实验未冻结 | Stage-1 ITT 内核有；无正式 preregistration/campaign |
| G6 | 未通过 | 真实证据仍弱且 task/model 覆盖不足 |

---

## 2. 研究架构冻结

### 2.1 近期支持域

只支持：

- binary 或 categorical 的单一 primary claim；
- 预注册、有限 outcome space；
- 明确 roster 和 controlled private information；
- discussion 后 private final elicitation；
- elicitation 后 authorized resolution；
- run-level randomization 和 proper loss。

不支持：

- open-ended synthesis 的通用质量；
- 长期真实人格或 latent belief；
- 无可信 resolution 的高风险事实判断；
- 直接经济处罚；
- 跨 episode reputation 因果效果；
- 真实社会等价模拟。

### 2.2 冻结比较

近期最小 arms：

- `I`：成本匹配、无 peer exposure 的 independent ensemble；
- `T`：普通文本通信；
- `B`：显式 claim-relative report；
- `G`：B + 冻结 selective verification policy。

主要 estimands（loss 越低越好）：

```text
interaction = E[L(I) - L(T)]
explicit    = E[L(T) - L(B)]
governance  = E[L(B) - L(G)]
```

若加入 sham `S`，它只用于 mechanism specificity，不替代 `G-B` 的 policy-package ITT。

### 2.3 冻结 primary outcome

主结果保持 registered-agent ITT operational pooled Brier；accuracy、coverage、terminal missingness、cost、false consensus、cascade/recovery 和 collective state 都是 secondary/mechanistic。

不得创建单一“治理总分”。报告顺序固定为：

```text
integrity
→ measurement validity
→ opportunity/selection
→ delivery/compliance
→ outcome
→ mechanism
→ cost/robustness
```

---

## 3. Workstream A：任务银行与语义权威（P0）

### A0 目标

建立不依赖模型输出、不会跨 split 泄漏、可供 calibration/held-out/confirmatory 使用的任务银行。

### A1 人工语义审查

每个 task family 必须记录：

- claim 与 canonical outcome space；
- private/public evidence 的方向；
- authorized resolution 来源；
- 单 Agent partial-information 难度；
- full-information upper bound 的预期；
- scenario/template/semantic leakage group；
- 是否存在答案由措辞或选项顺序泄漏；
- action 能否获得真实新增信息。

**Owner：**项目所有者 + Codex。领域事实不能交给模型自动批准。

### A2 最小 split

推荐：

- engineering canary：不进入效度证据；
- measurement development：只用于 parser/prompt/测量协议；
- detector calibration：只选 threshold；
- detector held-out：一次性检验 predictive validity；
- confirmatory：不参与任何前述选择。

同一 semantic leakage group 不得跨 scientific splits。

### A3 任务族选择

第一主族：HiddenBench K=3，可在语义 family 层分组后使用。  
第二主族：需要与 HiddenBench 在表面领域和证据结构上不同，仍保持可解析、分布式信息和相同 outcome contract。

不以现有 `network-fault@1.0.0` 作为科学任务；其 truth/evidence 构念冲突已被隔离。

### A4 验收

- split manifest 在 provider 调用前冻结；
- 所有 scientific entries 有 accepted human semantic review；
- leakage-group checker 全绿；
- 每个 task 的 action information gain 有文字审查；
- 任务不因观察模型输出而原地改 truth；
- 任何变更产生新 task/adapter/study identity。

### A5 可委派工作

高性价比模型可做：候选任务聚类、近重复扫描、表格生成、manifest 机械实现、对抗测试。  
不得做：semantic review 最终批准、truth 决定、split 泄漏风险接受。

---

## 4. Workstream B：显式报告的测量效度（P0）

权威统计与 Gate 定义已冻结于
[`MEASUREMENT_VALIDITY_PROTOCOL_V1.md`](../architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md)。
本节保留研究路线摘要；发生冲突时，以该协议的 instrument 拆分、paired unit、missingness、阈值与分级资格为准。

### B0 研究问题

reported probability 是否是一个足以支持实验的 operational instrument，而不是真实心智代理？

### B1 最小验证矩阵

对 calibration/development tasks 做以下配对扰动：

1. evidence strength 单调变化；
2. evidence direction 翻转；
3. 语义等价 paraphrase；
4. option order 置换后再映射回 canonical coordinates；
5. private information 删除/增加；
6. model/provider 或 temperature stratum；
7. repeated elicitation（禁止看到前次回答）。

### B2 指标

- parse/valid/terminal coverage；
- 证据方向与概率修订方向的一致率；
- 单调性违反率；
- paraphrase test-retest distance；
- option-order equivariance；
- argmax 与独立 private choice 的一致性（若有）；
- held-out Brier、reliability diagram、calibration slope/intercept；
- resolution 的增量预测信息；
- arm/model/task measurement invariance 诊断。

单个 Brier 值不是 calibration。校准图需要足够 episode，并报告不确定性。

冻结计算定义：

- paraphrase stability：同一 task/evidence 条件下概率向量的 pairwise Jensen–Shannon distance、argmax agreement；
- evidence sensitivity：有序 evidence-strength 与目标 outcome 概率的 Spearman 相关、单调性违反率；
- directional response：支持证据与反向证据条件间目标概率的 paired signed difference；
- option equivariance：重排选项后映回 canonical coordinates 的 L1/Jensen–Shannon error；
- predictive increment：相对 uniform/constant-report baseline 的 held-out Brier 差，或嵌套预测模型的增量 proper loss。

阈值冻结程序：v1 首轮 scientific-candidate 阈值已由 Codex 作为事前 **DESIGN DECISION** 写入权威协议。development pilot 用于检查可执行性、估计噪声和形成真实 Freeze artifact，不得根据预期 held-out 表现优化阈值；若设计不可执行，只能在开 sealed held-out 前 version bump。所有阈值均绑定 domain/version，不是跨任务通用常数。

### B3 Gate

GO：预注册 coverage 下界通过；paraphrase 内变异小于 evidence 操纵变异；evidence-response 的 bootstrap 区间符合预注册方向并排除零；option-order error 低于冻结容忍度；final reports 在 held-out 上优于预注册 baseline 或有独立增量信息。  
REVISE：格式可靠但证据/复测不稳定；版本化 prompt/elicitation contract 后重做 development。  
STOP：概率主要是模板常数、与证据无关或跨轻微 paraphrase 任意漂移。

### B4 代码需求

优先新增离线 analysis 和 fixture，不改 core belief semantics。若现有 artifact 缺必要 treatment metadata，先做最小 carrier audit，由 Codex 决定是否 version bump。

### B5 可委派工作

高性价比模型可实现扰动生成器、analysis table、plots、bootstrap/cluster 脚本和测试。  
Codex 必须冻结 measurement estimand、paired unit、missingness 和 pass/fail 规则。

**2026-08-12 状态（FACT）：**上述高风险定义已完成；carrier 审计与 36 项对抗测试规格已完成并经 Codex 复核。结论为 `EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`、不升级 raw schema-5。

**2026-08-12 实现进度（Claude Code）：**`MeasurementValidityDesignV1` / `FreezeV1` / `ResultIndexV1`、确定性分析内核与 45 项对抗测试已实现（`experiments/campaign/measurement/` + `test/measurement-validity.test.ts`），全部确定性通过。**NOT RUN：**development pilot、sealed held-out、真实 `FreezeV1` 产出与经验效度判定均尚未进行。可复现交接包见
[`CLAUDE_CODE_MEASUREMENT_VALIDITY_HANDOFF_V1.md`](CLAUDE_CODE_MEASUREMENT_VALIDITY_HANDOFF_V1.md)。

---

## 5. Workstream C：detector census 与 held-out validity（P0）

### C0 先 census，后 threshold

先在所有 B/G pre-action first-round reports 上描述：

- certainty 分布；
- top-two margin / normalized entropy（仅候选特征）；
- qualified lineage count 与 missing status；
- verifier availability；
- task、K、model、agent-position strata；
- eligibility rate 曲线。

不允许先挑一个“看起来有触发”的 threshold 再解释。

### C1 候选 signal 比较

最低比较：

1. certainty only；
2. lineage only；
3. certainty × lineage 组合；
4. pooled disagreement/simple majority；
5. `CollectiveEpistemicStateV1` 的单独维度；
6. simple task/position baselines。

新宏观态必须证明相对简单基线的增量价值，不能只报告相关性。

`CollectiveEpistemicStateV1` 在这里保持 `descriptive_macrostate_only`：它可以作为待验证 feature，但当前没有 predictive authority。候选模型只能在 development/calibration 数据拟合，在独立 held-out 一次检验；通过前不得写回 eligibility policy。

### C2 Calibration split

只在 calibration split 上：

- 选择 threshold/candidate model；
- 冻结 domain（binary、K=3、K=4 分开）；
- 冻结 selection design、coverage、IPW 或 inclusion weight；
- 冻结 missingness 和 empty-population 处理；
- 记录所有尝试，防止 researcher degrees of freedom 被隐藏。

### C3 Held-out split

主验证量：

```text
mean proper loss(flagged) - mean proper loss(unflagged)
```

同时报告：

- uncertainty / cluster bootstrap；
- flagged coverage 和 population size；
- hard-error precision/recall/specificity（次级）；
- risk-coverage curve；
- task/model/K 异质性；
- simple baseline 增量。

### C4 Gate

GO：held-out risk gap 方向正确、coverage 非退化，且相对简单基线有足够增量信息。  
REVISE：只有某 domain 有效，收缩 policy domain 并新版本化。  
STOP：风险差近零/反向/高度不稳定；signal 降为 descriptive，禁止治理控制。

### C5 可委派工作

高性价比模型可做 census、分析脚本、表格、对抗测试和只读 artifact projection。  
Codex 冻结候选集、held-out 开封顺序、统计单位与升级权限。

---

## 6. Workstream D：治理机制强度（P0）

### D0 当前问题

当前 `verification-request` 在某些任务中只看 public context、claim 和 public message，无法获得未公开的私有事实。它可能指出论证不足，却未必改变最终知识状态。

因此在大规模 G/B 实验前必须回答：**action 的预期信息增量是什么？**

**冻结决策：**当前 public verification 是工程参考 G，不自动进入正式论文 G。正式实验先保证 I/T/B 可运行；只有 C4 detector Gate 和 D4 information-gain Gate 都为 GO，才释放 G。若需要 `independent-countercheck` 或受控信息访问，必须建立新 action/adapter/study identity，旧 G artifact 保持原语义。

### D1 两条机制路线

路线 D1a（保持当前机制）：

- public countercheck；
- 适合可由公开逻辑/外部 verifier 发现问题的任务；
- 用于验证最小治理链，不保证 HiddenBench 效果。

路线 D1b（候选后续，信息访问类治理）：

- independent countercheck 或 targeted private-evidence request；
- verifier/agent 获得受控、与目标报告独立的信息；
- 需要新 adapter、truth firewall、matched sham 和版本化 estimand。

Codex 在 calibration 数据后选择是否进入 D1b，不由实现模型自行扩展。

### D2 Manipulation check

动作必须先证明改变一个冻结近端量，例如：

- 新独立 evidence 被暴露；
- target report 在 counterevidence 后发生规范 revision；
- unsupported certainty 下降；
- correct-minority information 被更多 Agent 引用；
- delivery/compliance 可观测。

近端变化仍不等于 final outcome improvement。

### D3 Matched control

sham/random 必须匹配：

- provider calls；
- token/latency opportunity；
- round timing；
- public visibility；
- target selection opportunity。

### D4 Gate

GO：action 有清楚信息增量、delivery 稳定、proximal mediator 有变化且成本可接受。  
REVISE：delivery 有但信息增量为零，换机制版本。  
STOP：action 依赖 truth leak、other-agent private leak 或无法 matched-control。

---

## 7. Workstream E：最小论文实验（P1）

### E0 前置条件

A–D 全部通过后，才冻结正式 pilot/preregistration。

若 A/B 通过但 C 或 D STOP，允许冻结 I/T/B 的 measurement/interaction 论文实验；不得为了保留 G 而降低 Gate。

### E1 设计

- unit：run/task instance；
- arms：I/T/B 必需；G 仅在 C4+D4 通过后加入，S 仅随 G 做机制控制；
- blocking：task semantic family × model composition × K × seeded-failure stratum；
- clustering：同 task template/scenario family；
- assignment：Stage-1 frozen probabilities；
- missingness：全部 randomized runs 保留在 operational estimand；
- retry：provider internal retry = none；失败显式记录；
- primary：operational pooled Brier；
- secondary：accuracy、coverage、FCR、cost；
- mechanism：trigger、delivery、revision、lineage、collective state。

### E2 样本量

先用 pilot 的 run-level variance、completion 和 trigger opportunity 做 power/simulation。不得把 Agent/report/round 当独立样本扩大 N。

预算硬上限沿用项目所有者此前给出的人民币 500 元，除非所有者书面更新。必须先分配：

- 15% engineering/recovery；
- 20% measurement + detector validation；
- 15% mechanism pilot；
- 50% confirmatory candidate。

如果前一 Gate STOP，后续预算不自动转为更多探索调用。

### E3 Preregistration bundle

至少包含：

- commit hash、环境、provider/model/config；
- task/split manifests；
- study/assignment/policy/rule registry；
- primary/secondary estimands；
- missingness/exclusion；
- power 和 stopping；
- analysis script hash；
- claim ceiling；
- detached timestamp/commitment 方法。

### E4 结果树

| 结果 | 论文主线 |
|---|---|
| B>T、G>B | 显式表示 + 选择性治理 |
| B>T、G≈B | 测量/表示贡献 + 治理边界 |
| interaction 有害、G 缓解 | 多 Agent 错误传播治理 |
| I 最优 | 交互失败与何时不该使用多 Agent |
| measurement 有效、detector 无效 | 可审计认识测量方法 |
| measurement 无效 | 停止强论文 claim，重做仪器或转系统 artifact |

---

## 8. Workstream F：社会热力学研究支线（不阻塞 P1）

### F0 原则

社会热力学只消费已经通过 authority/replay 的微观事件。它不修改 primary outcome、assignment 或 governance eligibility。

“描述性”是当前 authority 边界，不禁止把量放入一个待证伪的预测研究；它禁止在 ST-1 前把相关性写成已知风险或控制规则。

### F1 当前可做

- 将 `CollectiveEpistemicStateV1` 投影到离线分析表；
- 预注册候选宏观量，不合成 `F`；
- 在主效应分析之外的 development/held-out 支线上检验对 proper loss、FCR、cascade、recovery 的增量预测；
- 与 certainty、majority、Agent count、task difficulty 基线比较；
- 做跨 K/task/model 的尺度敏感性。

### F2 升级规则

- held-out 有增量预测 → ST-1；
- 随机治理产生稳定宏观响应 → ST-2；
- 跨规模/拓扑出现可重复缩放 → ST-3；
- 有形式模型并经对抗检验 → ST-4。

每次升级都需要新文档版本和 claim review。ST-0/1 不得用于在线控制。

### F3 可委派工作

高性价比模型可实现离线 projection、baseline comparison、plots、bootstrap 和报告。  
Codex 负责宏观构念、复合量、理论命名、相变/势函数等任何升级。

---

## 9. Workstream G：principal-aware Agent society（P4 后）

### G0 最小扩展，不做完整身份平台

只新增对外部身份事实的引用：

```text
principalRef
delegateAgentRef
organizationRef
authorityScopeRef
modelLineageRef
runtimeLineageRef
```

SwarmAlpha 不签发身份、不管理 credential；它记录并消费已验证的 identity assertions。

### G1 第一组实验

构造相同表面 Agent 数、不同真实独立性的群体：

- 多 Agent / 同 model+prompt lineage；
- 多 Agent / 不同 prompt、同 model；
- 多 model / 同 principal；
- 多 principal / 不同私有信息；
- Sybil-like 同源证据复制。

测量 false consensus、proper loss、correct-minority survival 和 lineage-aware aggregation/verification 的效果。

### G2 Normative owner decisions

项目所有者必须决定：

- 何为可接受的 principal disclosure；
- 是否允许匿名/假名 Agent；
- reputation 的 appeal、expiry、domain transfer；
- 谁承担 verifier 错误；
- 是否存在 stake/penalty；
- 是否需要跨组织 settlement。

这些不是纯技术选择，不能交给模型默认。

---

## 10. 责任与审批矩阵

| 工作 | 项目所有者 | Codex | 高性价比模型 |
|---|---|---|---|
| 战略定位 | 决策 | 主笔/质检 | 只读核对 |
| 构念与本体 | 咨询 | **负责** | 禁止自定 |
| task truth/语义 | **负责** | 审核 | 聚类/扫描 |
| schema/authority | 知情 | **负责** | 冻结后实现/测试 |
| estimand/因果设计 | 决策约束 | **负责** | 实现分析器 |
| adapter/fixture | 知情 | 接口冻结/审查 | **负责** |
| 文档同步 | 审阅关键主张 | 最终审查 | **负责** |
| 真实调用/预算 | **授权** | 放行条件 | 执行既定命令 |
| 数据汇总/plots | 知情 | 统计审查 | **负责** |
| claim 升级 | **共同批准** | **共同批准** | 禁止 |
| git commit | 可授权 | 审查后执行 | 默认禁止 |

---

## 11. 低上下文委派协议

### 11.1 每个任务包只包含七样东西

1. **Objective**：一句话可证伪目标；
2. **Evidence baseline**：一个 commit + 3–6 个必读文件/符号；
3. **Frozen semantics**：不得改变的对象和 claim boundary；
4. **Whitelist**：允许创建/修改的文件；
5. **Acceptance**：精确命令和不变量；
6. **Red zones**：发现即停止并返回；
7. **Final report schema**：修改、测试、偏离、风险、费用/git 声明。

禁止用“读完整个仓库并优化”作为委派任务。

### 11.2 标准任务包模板

```markdown
# WP-<id>: <title>

Objective:
<one falsifiable outcome>

Baseline:
- commit: <hash>
- read only: <exact files/symbols>

Frozen semantics:
- <invariants>
- <claim ceiling>

Whitelist:
- <allowed files>

Forbidden:
- <red-zone files/actions>

Deliverables:
- <code/test/doc/table>

Acceptance:
- git diff --check
- npx tsc --noEmit
- <focused tests>
- <full tests/build if applicable>

Stop and return if:
- authority/truth/estimand/randomization/replay meaning changes
- existing invariant is false
- paid/network call or credential is needed

Final report:
1. changed files
2. invariant per test/change
3. exact command results
4. deviations
5. red-zone findings
6. real/paid calls, credentials, git actions
```

### 11.3 上下文最小化规则

- 只传 commit/diff，不传聊天历史；
- 只传当前 SOT，不传多个互相冲突的旧计划；
- 旧文档只在“历史比对”任务中读取；
- 每个 work package 最大一个科学判断；
- 报告必须能由另一个模型在不读聊天记录时验收；
- 任何新公共抽象必须说明替代了什么或关闭了哪个 Gate；
- 默认不让实现模型写论文结论。

---

## 12. 首批可直接委派的工作包

### WP-A1：HiddenBench semantic-family 只读复核

目标：输出 K=3 tasks 的 near-duplicate/semantic-family 候选表，不批准 split。  
输入：pinned dataset、现有 gap audit、task adapter。  
输出：task→family、理由、相似风险、人工复核列。  
红区：不得看模型结果决定 family；不得修改 truth/source data。

### WP-B1：Measurement validity matrix 实现

目标：在冻结 task fixtures 上生成 evidence/paraphrase/order perturbation artifact 与分析表。  
红区：不得改变 belief contract、primary outcome 或把报告称 latent belief。

### WP-C1：Pre-action census 报告

目标：按 domain/task/model/position 输出 certainty、entropy、margin、lineage completeness 和 eligibility curve。  
红区：只读；不得推荐 threshold 或赋予 control authority。

### WP-C2：Detector baseline comparison

目标：实现 certainty-only、lineage-only、combined、majority 和 collective-state features 的离线对比框架。  
红区：不得开 held-out；不得自动选最优后回写 policy。

### WP-D1：Verification information-gain audit

目标：逐 task family 标注当前 action 能看到的信息、相对目标 Agent 新增的信息和理论可改变的 mediator。  
红区：只读审计；发现 truth/private leak 立即停止。

### WP-F1：Collective-state offline projection

目标：把 `CollectiveEpistemicStateV1` 作为 secondary rows 接入离线 analysis，不进入 schema-5 authority 或治理。  
红区：不得创建 composite F、threshold 或 action rule。

---

## 13. 必须由 Codex 完成的下一批高难工作

1. 冻结 measurement validity estimands 与 pass/fail gate；
2. 审批 HiddenBench semantic split；
3. 决定 current verifier 是否与任务机制匹配；
4. 若不匹配，定义 independent-countercheck v1 的最小信息/authority contract；
5. 冻结 detector candidate set、calibration/held-out 开封协议；
6. 定义 false consensus、cascade、recovery 的因果/描述边界；
7. 冻结 Stage-1 preregistration 和 cluster-aware estimator；
8. 决定 principal/model-lineage 最小身份对象，但暂不实现完整平台；
9. 审核所有 delegated output，拒绝越界 claim。

---

## 14. 项目所有者需要定夺的事项

近期必须定夺：

1. 第二科学任务族的领域与人工 truth owner；
2. 是否接受 HiddenBench 只支持 within-benchmark generalization；
3. 预算 500 元是否仍有效及每阶段上限；
4. 论文优先级：AAMAS 长文 vs 先做 workshop/arXiv artifact；
5. 是否愿意公开预注册和失败 artifact hash。

可延期：

- Web3；
- 信誉和质押；
- 匿名 Agent 权利；
- 企业产品形态；
- 社会热力学的物理命名；
- UI 与协议标准化。

---

## 15. 四周里程碑

### Week 1：任务与测量

- 完成 semantic-family 表和 owner review；
- 冻结 measurement-validity design；
- 跑最小 development pilot；
- 输出 G1 Go/Revise/Stop。

### Week 2：census 与 detector

- 完成 pre-action census；
- 冻结 candidate signals/threshold selection；
- 只在 calibration split 选择版本；
- 锁定 held-out 开封包。

### Week 3：held-out 与机制

- 一次性 held-out detector evaluation；
- 审查 verification information gain；
- 必要时只做一个新 mechanism contract；
- 跑最小 matched mechanism pilot。

### Week 4：预注册与样本量

- 根据 Gates 决定 GO/REVISE/STOP；
- GO 时至少冻结 I/T/B、power、预算和 analysis；仅在 C4+D4 通过时再冻结 G/S；
- 发布 detached preregistration commitment；
- 不在同周边跑边改 confirmatory。

如果某一周 Gate 失败，后续周不照日历硬推进，而是收缩问题或停止路线。

---

## 16. 完成判据

本执行计划成功，不以新增多少代码衡量，而以四个事实衡量：

1. 一个不读聊天历史的实现模型可以根据任务包完成机械工作；
2. 一个独立审查者可以从 artifact 追到 study、task、assignment、report、action 和 outcome；
3. detector/action 即使失败，也能得到明确的停止或收缩决策；
4. 社会热力学和 Agent 社会愿景被保留，但不再透支当前证据。

届时工程复杂度应该下降：研究语义由少数 SOT 冻结，低风险实现由工作包推进，高风险决定集中审查，旧路线只作为证据和历史保留。
