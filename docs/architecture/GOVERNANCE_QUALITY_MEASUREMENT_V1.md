# Governance Quality Measurement V1

日期：2026-08-11

## 1. 结论与主张上限

**DESIGN DECISION：**SwarmAlpha V6 不定义单一“治理质量总分”。治理质量是一个分层 scorecard；不同层回答不同问题，不得用加权求和掩盖失败层。

**FACT：**当前第一论文的 primary governance estimand 是 Stage-1 run-level ITT 下 `G−B` 的 operational pooled Brier contrast，而不是触发次数、共识度、delivery rate、旧 `F` 或 UI overall score。

设每个 run 的主损失为 `L_r`（registered-agent ITT pooled Brier，越低越好）：

- architecture contrast：`Δ_arch = E[L | B] - E[L | T]`；
- governance contrast：`Δ_gov = E[L | G] - E[L | B]`。

在这个方向约定下，负值表示损失下降。任何报告必须同时写出 metric direction，禁止只写“alpha 上升/下降”。

**LIMITATION：**当前尚无新 task-bank/held-out 数据，因此没有 detector validity、`Δ_gov` 或治理质量的经验结论。

## 2. 六层治理质量 scorecard

### Q0 — Integrity / identifiability gate

衡量系统是否产生可用于研究的记录：

- schema/replay pass rate；
- task/assignment/execution/outcome identity consistency；
- truth/private-information firewall；
- missing/invalid/unavailable 完整记录；
- randomization 与 preregistration binding；
- source-event、diagnosis、decision、delivery 的时间顺序。

**解释：**Q0 是必要条件，不是治理有效性。100% replay 只能说明记录内部可重放，不能说明策略改善结果或 artifact 具有外部真实性。

### Q1 — Detector validity

衡量冻结风险谓词是否识别更高 epistemic loss，而不是只统计 trigger rate：

- 主描述量：inverse-probability-weighted `mean Brier_flagged - mean Brier_unflagged`；
- coverage：candidate、selected、empty-population、invalid/unavailable；
- reliability/calibration curve 与 uncertainty；
- 次级：hard-error precision、recall、specificity、tie rate。

**方向：**正的 Brier risk gap 表示被标记组平均 proper loss 更高；这只支持冻结域内的预测关联。单个 report 的 Brier 不是 calibration，单次错误也不是 miscalibration。

### Q2 — Policy selectivity and assignment integrity

衡量策略是否在预注册机会集合中稳定、可重放地做出选择：

- eligibility rate 与 missing-observation abstention；
- apply/holdout/sham assignment balance；
- assignment probability、seed replay 与机会集合一致性；
- 重复机会、不可观测 compliance、censoring 与 failure 的比例。

**解释：**高 trigger/assignment rate 不是高质量。接近 0% 或 100% 可能意味着阈值退化；分配平衡只证明随机化执行，不证明动作有效。

### Q3 — Delivery and observed response fidelity

衡量决策是否成为实际可观察处理：

- action instance 创建率；
- delivered / failed / censored；
- compliance-observed / compliance-unobservable；
- action contract 指定的 proximal mediator。

**解释：**planned、rendered、delivered、acknowledged、behaviorally complied 和 outcome effect 必须分开。当前 operational compliance 只能按其 adapter contract 解释，不得升级为“Agent 内心接受了干预”。

### Q4 — Epistemic and task outcome

主结果：

- `Δ_gov = G−B` 的 run-level ITT pooled Brier；
- 完整报告 task/model strata、coverage、missingness 和 uncertainty。

次结果：

- pooled-decision accuracy；
- abstention、invalid、unavailable；
- reliability/calibration 与 risk-coverage；
- task-specific quality，经 versioned evaluation adapter 声明。

**因果权限：**只有冻结 Stage-1 随机分配和分析契约支持协议级因果 contrast。Stage-2 eligible-event 分配受 run 内历史依赖和多 Agent 干扰影响，当前只作 exploratory mechanism analysis。

### Q5 — Mechanism and dynamics

候选量包括：

- false-consensus rate/curve；
- error-cascade size/AUC；
- recovery time；
- revision after counterevidence；
- verified-lineage coverage/concentration；
- influence Gini；
- behavioral susceptibility（仅 schema-2 usable exposure-response estimate）。

**LIMITATION：**这些量大多尚未进入当前 V6 binary vertical slice 的冻结分析器。它们是 mediator 或 failure-mode descriptor，不得替代 Q4 outcome。

### Q6 — Cost, robustness and Pareto quality

- actual tokens、latency、provider failures；
- final-answer coverage 与 partial-run rate；
- cost-matched sham/random governance；
- `Δ outcome` 与 `Δ cost` 的 Pareto frontier；
- 预注册 lambda sensitivity 下的 net utility，缺成本时必须 unavailable。

**解释：**不存在唯一正确的 token/time/failure 汇率。不得只展示一个事后选择的净分数。

## 3. 为什么不能压成一个分数

以下系统可能获得相同总分，但科学含义完全不同：

1. detector 无效，但几乎不干预，成本很低；
2. detector 有效，但 action 经常 delivery failure；
3. action 改变近端 mediator，但不改善 final Brier；
4. Brier 改善，但 token/latency 不可接受；
5. accuracy 不变，但 calibration/abstention 改善。

因此报告顺序必须是：Q0 gate → Q1 detector → Q2/Q3 treatment fidelity → Q4 outcome → Q5 mechanism → Q6 cost。任一层失败都应保留，不得被总分抵消。

## 4. 旧体系复用矩阵

| 旧对象 | 复用等级 | V6 中允许的用途 | 禁止用途 |
|---|---|---|---|
| assignment manifest、receipt、replay、truth firewall | 强复用，且已吸收 | Q0 权威与可复现性 | 把内部 hash 称为外部真实性 |
| paired block / complete-case fail-closed | 强复用 | 同 task×model×seed 的配对估计与缺失报告 | 用 round/report 伪增样本量 |
| `computePairedAlpha` 的 contrast/cost 结构 | 条件复用 | 显式将 loss 映射为 higher-is-better quality 后做 sensitivity | 把 raw Brier 直接代入旧 higher-is-better alpha；混淆符号方向 |
| token、latency、failure、Pareto/net-alpha | 强复用 | Q6 成本与敏感性 | 事后选择单一 lambda 宣称总体最优 |
| bootstrap/statistical guards | 条件复用 | 按 run/task cluster 重抽、报告 uncertainty | 对 agent/report 当独立样本 |
| task accuracy、Kendall tau | 任务域复用 | versioned adapter 的 secondary outcome | 跨 binary/ranking/open-ended 直接比较 |
| influence Gini、consensus、belief spread | 描述性复用 | Q5 mediator/failure descriptor | 当作 correctness、quality 或治理效果 |
| schema-2 behavioral susceptibility | 条件复用 | 有合格 exposure-response 记录时的 exploratory mediator | 当作稳定人格、DeGroot 真参数或通用控制量 |
| `R/T/H/F` 与 thermodynamic composites | C0 历史复用 | 旧实验重放、描述性 trajectory、未来假说生成 | V6 primary outcome、默认控制权限、物理自由能或跨任务统一质量 |
| legacy echo/authority/premature-consensus detectors | 候选特征复用 | 在独立 labels/held-out outcomes 上重新验证 | 沿用名称即宣称检测到真实心理/社会机制 |
| E5/E8 旧观测性 mediation | exploratory sensitivity | 生成机制假说、检查方向 | 替代 Stage-1 随机 ITT 或宣称因果中介 |
| UI `overallScore` / evaluator 总分 | 不复用 | 演示兼容 | 论文估计量、治理质量或模型排名 |

## 5. old alpha 与 V6 contrast 的符号关系

旧 `governanceAlpha = Q(diagnostic) - Q(vanilla)` 假定 `Q` 越高越好。V6 primary 使用损失 `L`，越低越好。

若预先冻结 `Q = -L`，则：

`governanceAlpha_Q = Q_G - Q_B = -(L_G - L_B) = -Δ_gov`。

因此旧 alpha 的配对与成本框架可以复用，但必须通过 versioned outcome adapter 明确方向转换。不得同时把“负的 G−B loss contrast”和“正的 governance alpha”都描述成同一未标方向的数。

## 6. 当前实现状态

**IMPLEMENTED / TESTED：**

- Q0 schema-5 authority 与 replay；
- Q1 selected-report detector validation、IPW Brier risk gap、hard diagnostics；
- Q2 eligibility 与 Stage-2 assignment trail；
- Q3 action lifecycle、delivery/compliance/censoring carrier；
- Q4 operational pooled Brier、accuracy、coverage/missingness carrier；
- Q6 tokens、latency、failure carrier；
- T/B/G calibration table 的描述性聚合。

**DEFINED BUT NOT EMPIRICALLY ESTABLISHED：**

- detector held-out validity；
- threshold calibration；
- `Δ_arch`、`Δ_gov`；
- delivery/compliance 对 outcome 的机制作用。

**NOT YET FROZEN IN V6 ANALYSIS：**

- dataset-level empty-population/selection coverage；
- reliability curves 与 cluster-aware uncertainty；
- false consensus、cascade、recovery；
- V6 cost-adjusted paired estimator；
- task-bank calibration/held-out/confirmatory content。

## 7. Task-bank 对治理质量的作用

`taskBank.ts` 只建立 split authority，不自动证明任务语义正确：

- engineering task 可以显式 `not_reviewed`，但不能进入 scientific splits；
- calibration、held-out 和 confirmatory entry 必须声明 accepted semantic review；
- 同一 scenario/template 的变体共享 `leakageGroupId`，禁止跨 scientific splits；
- task ref、task ID、definition hash 唯一；
- bank purpose 不能越权授予 confirmatory split；
- admission 时与 schema-5 task manifest 的 family/adapter/schema/resolver/hash 交叉绑定。

**LIMITATION：**semantic-review declaration 是内部审计承诺，不替代人工审查，也不提供外部时间真实性。
