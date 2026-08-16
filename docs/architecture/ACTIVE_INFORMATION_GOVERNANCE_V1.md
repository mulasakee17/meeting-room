# Active Information Governance V1 — 实现与主张边界

日期：2026-08-13
状态：kernel 已实现并经对抗测试与确定性 fixture 覆盖；**未接入 production Runner，无真实实验证据**。
规范理论：[`docs/theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md`](../theory/NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md)
代码：`src/lib/governance/activeInformationGovernance.ts`；fixture：`experiments/campaign/v6/truthBlindPolicyFixtureV1.ts`

本文只陈述实现事实与主张边界，严格区分 FACT / DESIGN INTENT / HYPOTHESIS / LIMITATION。**禁用词**：production-ready、AAMAS-ready、improves accuracy、ground-truth-free validation、independent sources。

---

## 1. 已经实现的边界（FACT）

### 1.1 prompt-conditioned report ≠ latent belief

**FACT** — `OnlineEpistemicRiskV1` 的维度只描述"在已记录 prompt contract 下产生的可观测报告"及其派生量；kernel 没有任何字段声称访问潜在信念。theory §3 把它记为架构诱导的可观测报告，不是 `p_i*`。

### 1.2 在线/离线 truth firewall（结构性）

**FACT** — `projectOnlineEpistemicRiskV1` 只接受 `collectiveState + consequence + promptSensitivity`；`selectTruthBlindInformationActionV1` 只接受 `risk + candidates + availableBudget`。`OnlineEpistemicRiskV1`、`ActiveInformationActionCandidateV1`、`TruthBlindActionDecisionV1` 的 schema 均无 `groundTruth / correctAnswer / resolverOutcome / loss` 字段；`requireExactKeys` 对任何多余字段 fail-closed。对抗测试覆盖了 risk 投影输入、candidate、action-selection 输入与 decision 四个边界。

**DESIGN INTENT** — 真值只允许在离线评估（evaluator-only envelope）中出现，绝不进入在线策略、诊断或动作选择路径。`TruthBlindPolicyFixtureV1` 以 `PolicyVisiblePacket` / `EvaluatorOnlyEnvelope` 两个分离对象在结构上强制这一点。

### 1.3 风险向量不是一个总分

**FACT** — 五维风险（prompt-conditioned disagreement、declared source concentration、prompt sensitivity、observed response concentration、qualified unsupportedness）各自保留 `missing` 状态与原因，不合成单一分数。missing 绝不编码为 0。

### 1.4 distinct identity ≠ statistical independence

**FACT** — `sourceDistinctness` 只在 lexicographic 排序中作为身份/来源新颖性键使用；decision 不产生 `independence / expectedValue / correctness / errorCorrelation` 字段。theory §2.2 与 AGENTS.md 明确：不同来源身份不等于误差独立。

### 1.5 public reanalysis ≠ independent verification

**FACT** — `public_reanalysis_only` 在 access 排序中最低；它只对相同公开材料再判断，是 consistency check，不是独立核验。theory §5 与 AGENTS.md 明确该语义。

### 1.6 source-novelty 是 heuristic，不是 MCV / optimal router

**FACT** — `selectTruthBlindInformationActionV1` 输出 `inferenceStatus: "frozen_heuristic_not_value_optimal"`；它只做候选间仲裁（distinctness → access → cost → latency → stable id），不估计 expected information value，不声称最优。MCV 学习器与真实验证在本工作包外。

## 2. Eligibility 与 Completion 控制闭环（FACT）

**FACT** — `src/lib/governance/activeInformationControl.ts` 实现并已测试：

- **Eligibility**：`evaluateActiveInformationEligibilityV1` 把候选按冻结风险理由匹配（lineage_identity_missing / declared_source_concentrated / prompt_conditioned_disagreement_high / prompt_sensitivity_high / high_consequence_support_missing），理由是多标签、非加权；阈值必须 ∈ [0,1]，authority 只能是 `randomized_experiment_only`；候选必须绑定当前 eligibility ID 与同一 claim；known source relation 必须在 authority snapshot；只有匹配风险理由的候选进入仲裁。对抗测试覆盖 11 项不变量。
- **Completion**：`assertActiveInformationActionCompletionV1` 只断言"acquisition"——一个已声明类型的新 observation 绑定了 terminal transition（且 non-terminal / failed / censored / held_out 不得冒充 completed）。它**不**声称 effective / correct / verified / beneficial。对抗测试覆盖 10 项不变量。
- **Authoritative source resolution 由既有上游 ledgers 负责**（`actionLifecycle.ts` 的 `GovernanceActionLedger`、epistemic evidence graph）；本 kernel 不自行充当 resolution authority。

## 3. Receipt 语义（FACT）

**FACT** — completion assertion 证明**产生了一条新的、已声明类型的记录**（evidence / belief_report / provenance_record），且该记录不 predate 动作、已绑定 terminal history。它**不**证明：该记录为真、该记录改善决策、该来源独立、或治理有效。receipt ≠ factual verification。

## 4. 确定性 fixture（FACT，DETERMINISTIC FIXTURE）

**FACT** — `truthBlindPolicyFixtureV1.ts` 提供四个冻结场景（共享 lineage 且有新外部观察 / 高分歧但来源已 distinct / 高后果且全超预算 / 便宜 public reanalysis vs 新工具），全部零 provider。流程为 **eligibility → source-novelty arbitration**。PolicyVisiblePacket 只含在线可见输入；EvaluatorOnlyEnvelope 只在 decision 完成后接收 synthetic outcome 与冻结 utility contract，其 `preActionReferenceLoss` 是动作前的参考损失，**不能用于比较治理效果**。所有输出标 `DETERMINISTIC FIXTURE`。certainty-only / disagreement-only / random 由实际运行的确定性 baseline 函数计算；random 用冻结 seed 可重放。

## 5. 尚未建立（LIMITATION）

- **FACT** — kernel 未接入 production Runner，未经过真实 provider 实验（production wiring: no）。
- **LIMITATION** — 本工作包不建立：真实治理效果、MCV、多步停止策略（multi-step stopping）、qualified unsupportedness 数值 instrument、跨组织普适性、source-error independence 的经验估计。
- **HYPOTHESIS**（来自 theory §7.4）— 在同等预算下，优先获取新来源身份与新观察的策略可能相对 certainty-only / disagreement-only / random 降低独立 proper loss。该假设**未验证**。

## 6. 术语迁移提示（FACT）

现有 `verifiedIndependentLineageCount` 与相关 metric ID 的语义过强（"independent"）。为保持旧 artifact replay，V2 字段暂不机械重命名；新工作不得据此声称统计独立。版本化 V3 迁移由 Codex 设计，见结果文档的只读迁移盘点。

## 7. 结论

**FACT** — 已冻结并测试一个不读取真值的主动信息治理内核（risk projection、eligibility、source-novelty arbitration、completion assertion）；对抗测试与确定性 fixture 证明其边界成立。

**LIMITATION** — 这**不是**：可部署的治理系统、提高准确率的证明、ground-truth-free validation 的等价物、或异构智能治理 runtime。
