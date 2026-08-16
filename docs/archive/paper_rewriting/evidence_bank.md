# 证据库

## A. 当前可直接写入正文的 FACT

| ID | 事实 | 权威来源 | 允许解释 |
|---|---|---|---|
| E1 | V6 实现 claim、概率报告、evidence/exposure、final private elicitation、proper scoring、随机 action lifecycle 与 schema-5 replay | `src/lib/epistemic/**`、`src/lib/experimentation/**`、`experiments/campaign/v6/**` | 方法与内部可重放链已实现 |
| E2 | 80/80 raw-run artifact 通过 `verifyRawRunData`，状态为 `sealed_decision_replay_verified` | `docs/experiments/V6_VERDICT_EXPLORATORY_RESULTS_2026-08-12.md` 与冻结 artifact | 记录内部一致、随机分配与动作语义可重放；不证明外部真实性或构念效度 |
| E3 | 80 runs 使用 948 次 provider 调用、1,005,975 tokens，无 retry、补样本、换任务、挑 seed | 同上 | 可报告探索实验的执行完整性与成本 |
| E4 | B-arm round-1：154 个注册请求，142 valid、11 invalid、1 unavailable，valid coverage=0.9221 | 同上 | 结构化显式概率报告在该域大多可取得，但失败必须留在分母 |
| E5 | exact repeat：77 注册 pair、66 complete，median JSD=0.0050、P90=0.1348、argmax agreement=0.7727 | 同上 | 该冻结条件下存在初步重复稳定性；不等于语义 paraphrase 稳定或有效性 |
| E6 | K=3 报告 mean Brier=0.9275、ECE=0.4046；certainty>=0.7 时错误率 0.7436，未 flag 时 0.4884 | 同上 | 当前候选 certainty detector 初步反预测，不能获得控制权限 |
| E7 | G eligible=26；apply=17、sham=7、holdout=2；primary 因 holdout/cluster/bootstrap 支持不足判为 DEFER_INSUFFICIENT | 同上 | 治理效应未建立，负结果纪律由冻结规则执行 |
| E8 | discussion prompt 含 public context、自身 private information、可见 transcript、claim 和严格 JSON schema；不含 truth | `experiments/campaign/v6/providerAdapters.ts` | prompt 是测量仪器的一部分，信息视图可审计 |
| E9 | final elicitation 为讨论完成后的 private、arm-invariant、truth-free 概率请求，不回流讨论 | `src/lib/experimentation/finalOutcome.ts` | outcome 与在线治理信号隔离 |
| E10 | verification V2 只读 public context、claim 和 public message；输出 public-only verdict，不允许猜替代答案 | `experiments/campaign/v6/providerAdapters.ts` | 当前 action 是受限的验证投递，而非答案 oracle |
| E11 | fresh-identity 续跑计划 80 个 G runs，完成 75 个；5 个因宿主中断缺失且未替换。与原 40 个 G runs 合并后，eligible apply/sham/holdout=41/21/11，apply-minus-holdout Brier bootstrap interval 为 [-0.5813, 0.0033] | `docs/experiments/V6_VERDICT_RANDOMIZED_CONTINUATION_RESULTS_2026-08-13.md` | 当前开发任务、模型、提示词与动作下存在值得 task-held-out 复验的方向性信号；不能称一般治理有效或 confirmatory |
| E12 | 原始批次与新续跑的 apply-minus-holdout 方向相同；sham 的相对位置跨批次不稳定 | 同上 | 不能把 apply--sham 或 sham--holdout 写作稳定的机制分解 |
| E13 | apply verifier 读取 public context、claim 和目标 public message；sham 禁止读取 task、claim、message 或 evidence | `experiments/campaign/v6/providerAdapters.ts`、`docs/experiments/V6_VERDICT_RANDOMIZED_CONTINUATION_RESULTS_2026-08-13.md` | apply--holdout 估计 public-only task-conditioned re-analysis message 的局部总效应；并非纯 verdict-label 效应 |
| E14 | 任务簇隔离复验的 task set、样本、预算、分析和 DEFER gate 已冻结，但尚未执行 | `docs/plans/V6_VERDICT_TASK_HELDOUT_REPLICATION_DESIGN_2026-08-13.md` | DESIGN INTENT；不可写成实验结果或 confirmatory evidence |

## B. 已实现但尚未取得经验授权的对象

- Q0-Q3 measurement qualification 协议及 deterministic analysis kernel 已实现；真实 paraphrase、option permutation、controlled-evidence 和 held-out predictive pilot 仍需形成 sealed results。
- certainty、entropy、margin、JSD、TV、Brier、ECE、lineage 与 collective state 都可计算；“可计算”不等于“测量有效”或“适合控制”。
- apply/sham/holdout 机制可执行；原始批次按样本规则为 DEFER，合并续跑有区间跨零的探索性信号，尚不能估计一般治理效果或机制构成。
- 当前 certainty-lineage 规则仅获得预先冻结机制实验中的 eligibility-stratifier 角色；它未获得 detector 或运行时控制权限。

## C. 只能作为 HYPOTHESIS / DESIGN INTENT

- 异构资源的 Marginal Cognitive Value、Orthogonal Intelligence 与动态路由治理。
- 社会热力学宏观态、临界转变、相变或尺度律。
- reputation、stake、penalty 与 Web3 式责任结算。
- 跨任务、跨模型、跨组织身份的通用 detector 和治理规律。

## D. 外部证据锚点

最终逐句引用从 `citation_support_bank.md` 选择。核心锚点为 MAD 的正负结果（C001-C006）、MAS failure taxonomy（C007-C009）、HiddenBench（C010-C012）、verbalized confidence 与 prompt dependence（C027-C031）、semantic entropy/UQ（C032-C041）、proper scoring（后续条目）、routing/MoA（异构 future work）和 W3C provenance（审计边界）。
