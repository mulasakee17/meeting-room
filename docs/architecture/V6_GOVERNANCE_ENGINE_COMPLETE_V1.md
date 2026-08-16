# V6 完全体治理引擎 — 当前架构

日期：2026-08-15
状态：**FACT + DESIGN INTENT — 描述当前唯一有权威的治理引擎；含正在建设中的 exchange 路径**。
范围：`productionVerticalSlice.ts` + `src/lib/experimentation` + `src/lib/governance` + 实验侧 fixture/adapter。

---

## 0. 一句话

> 给一组各自掌握私有信息的 LLM agent 一个分类决策任务 → 讨论两轮并报信念 → 可被治理规则选中、随机分配一个信息动作 → 结束后私下报最终判断 → 用外部 ground truth 离线打 Brier → 全程可重放。

引擎刻意把五件事拆开、不混：**观测（报告/evidence）≠ 状态投影（描述）≠ 随机化 ≠ 动作投递 ≠ 独立结果**。治理因此是**可被随机化和独立评分证伪的干预**，不是自说自话的假设。

## 1. 完整运行流（一次 run）

1. **任务投影**（`hiddenBenchTaskAdapter`）：HiddenBench → V6 categorical task（agents 各持一条私有信息、claim+options、publicContext=shared）。
2. **预注册承诺**（manifest）：跑前写 taskDefinitionHash、publicContextHash、ground truth 的 valueHash 承诺（integrity-only，不藏明文）。no-replace。
3. **主分配**：`primaryMasterSeed` + 研究设计 → 选协议：`explicit_belief_v1`（B，无治理）/ `epistemic_governance_v1`（G，有治理）。加载预算合同。
4. **讨论（两轮）**：每轮每 agent 看 publicContext + 自己私有信息 + 可见 transcript，报 categorical 信念 + evidence（内容哈希、supports/attacks）。round-2 暴露 round-1 发言（belief_exposed）。
5. **治理（G 协议）**：见 §2。
6. **最终私密 elicitation**：两轮+治理后，每 agent 私下报最终信念（他人不可见）。
7. **离线评分**：resolution（正确答案）→ 每 agent proper loss、pooled multiclass Brier、accuracy；非应答（invalid/abstained/unavailable）按 reference distribution 插补。
8. **持久化 + replay**：事件/转换/manifest/分析单元/结果写盘；`verifyRawRunData` 全链重放，`sealed_decision_replay_verified`。

## 2. 治理机制（rule / action 解耦）

### 2.1 触发（Governance Rule 决定"何时"）

- 构造**一个**诊断（从监测选中的 round-1 报告）：`reported certainty`（max 概率）、`verifiedIndependentLineageCount`、`maxPairwiseTV`（全体 categorical 报告的两两 TV 最大值，聚合）。
- 规则判定 eligible：
  - **标准 rule（HIGH_CERTAINTY_LOW_LINEAGE）**：certainty ≥ 0.7 且独立来源数 ≤ 上限 → "高置信但证据薄"。
  - **分歧 rule（建设中）**：`maxPairwiseTV ≥ 0.8` → "明显分歧"。同一诊断属性，不同阈值语义。
  - **always-ineligible / always-eligible**：实验侧 fixture（disclosure 用过 always-ineligible，action-discovery 用过 always-eligible）。
- 任何规则都是 experiment-side GovernanceEligibilityRule，经 study.governancePolicy.eligibilityRuleRefs 绑定。

### 2.2 分配（随机化）

- eligible → Stage-2 随机：`apply 0.5 / sham 0.25 / holdout 0.25`（或按实验调 arms）。种子确定性。

### 2.3 动作（Governance Action 决定"干预什么"）

| 动作 | 时机 | 投递 | 成本 |
|---|---|---|---|
| **Verification**（apply） | 治理时（eligible） | 调 verifier → verdict（supported/contradicted/insufficient_evidence）→ 治理消息入 transcript | 1 调用 |
| **Sham** | 治理时 | matched-attention 文本（无 verdict 权威） | 1 调用 |
| **Holdout** | 治理时 | 无动作 | 0 |
| **Disclosure**（Inject） | 讨论前（任务级变体） | 把一条私有来源原文附加进 publicContext | 0 额外调用 |
| **Cross-evidence Exchange**（建设中） | round-1 后、round-2 前（eligible 时） | 注入选择器算 cross-evidence 消息 → 治理消息入 transcript（round-2 可见） | 0 额外调用 |

exchange 的投递：slice 识别 `actionRef = swarmalpha.action.cross-evidence-exchange`，调用可选 `crossEvidenceSelector` 回调（给它 round-1 报告 + evidence 注册表），得到治理消息，写入 transcript + source events。选择器是**确定性、outcome-free** 的（`crossEvidenceExchangeSelectorsV1.ts`：pairwise TV → max pair → 各侧 top-1 supporting evidence → 消息）。

## 3. 权威层（引擎的骨架）

- **Truth firewall**：ground truth 只在评分（第 7 步）进入；绝不进任何 prompt、来源选择、分配、动作。
- **no-replace**：plan/manifest 写盘后不可覆盖。
- **预算**：`V6ProviderCallBudget` 硬性限制 calls/tokens，超限停机保留现场。
- **确定性时钟**：所有时间戳确定（为 replay 服务）。
- **terminal 身份**：失败保留，不 retry、不补样本、不换题、不重抽。
- **Replay**：全链内部一致性 + 治理审计 sealed 校验。

## 4. 状态观测量（描述性，无控制权）

- 对齐 R（pairwise base-2 JSD）；
- 分歧（round-1 pairwise TV 最大值）；
- 报告集中度 C（max 概率）；
- 证据精确复用 exactReuse、verbatim 覆盖 coverage（census：有描述性变化）。
- **H_E/κ V1 不使用**（STOP：退化）。

## 5. 当前实证状态（FACT）

- verifier 复验：**DEFER**（apply−holdout=+0.0985，CI 跨零）。
- H_E/κ：**STOP**（退化）。
- disclosure screen（40 runs）+ 独立复现（32 runs）：**SCREEN_PASS**（方向一致 −0.148/−0.182，CI 跨零，non-confirmatory）。
- cross-evidence exchange：**建设中**（slice 扩展 + 选择器已就绪，实验侧 rule/contract/plan 待接线）。

## 6. 边界与限制

- 引擎是**可审计的干预运行时**，不是"治理有效"的证明；每个干预都是可证伪的实验。
- 单模型（DeepSeek）、单 prompt、HiddenBench 投影；不跨模型/任务库外推。
- 状态量目前**无预测性验证**（只有描述性变化）。
- 任何新干预进引擎 = 新的 rule/contract/plan，逐格冻结、逐次晋级，避免 action 竞赛。
