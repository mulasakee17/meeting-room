# V6 Source-Disclosure Screen — 执行结果

日期：2026-08-14
状态：**SCREEN_PASS — non-confirmatory mechanism screen；该动作在冻结条件下值得独立复现；不构成治理有效、普适或因果效果成立**。
权威：`docs/plans/CLAUDE_CODE_SOURCE_DISCLOSURE_PHASE2_EXECUTION_HANDOFF_2026-08-14.md`。

---

## 1. Status

`SCREEN_PASS`：authority/replay/firewall 全通过（40/40）；disclosure delivery 实际发生（20/20 publicContext compliance）；uptake 可观测（111 次精确 source-hash 命中）；paired mean D−H < 0；负方向不只由单一 leakage group 驱动（排除最负组后仍 < 0）。

**按冻结门控，SCREEN_PASS 只表示"该动作值得独立复现"，不是效果已建立。** 不输出 `effect-established` / `governance-effective` / `confirmatory` / `AAMAS-ready`。

## 2. FACT — 冻结设计、执行计数、调用/token、artifact/replay

- frozen plan contentHash：`sha256:2cbb8699f7b008121c88dc8c29447afc9022387081f61b76a7e8b406265bd5db`；
- 任务 `13,18,28,33,38,39,45,47,50,55`；8 个 leakage groups；2 blocks/task；40 runs / 20 H/D pairs；
- 执行：**40/40 written、0 reused**；provider calls **456**（= 计划数，零 verification、零 governance action、零 retry）；tokens **441,217**（prompt/completion 含 D 披露块额外输入；远低于 912k reserve / 1.6M cap）；
- artifact：**40/40 raw-run**；replay `present=40 expected=40 issues=0 status=verified`；`sealed_decision_replay_verified`；
- authority：replay 40/40、publicContextCompliance 40、sourceReplayConsistent 40、sameBlockSourceConsistent 40、verificationCallsZero 40、callCountMatch 40；
- 顺序执行、单次调用、无补样本、无换题、无重抽 seed。

## 3. FACT — paired 与 cluster-bootstrap 数值

| leakage group | pairs | mean D−H | H mean Brier | D mean Brier |
|---|---|---|---:|---:|---:|
| aircraft-landing | 2 | **−1.0395** | 1.6250 | 0.5855 |
| post-earthquake-lab | 2 | **−0.7244** | 0.7869 | 0.0625 |
| urgent-transfer | 4 | **−0.2796** | 0.7796 | 0.5000 |
| relief-clinic | 2 | 0.0000 | 0.8359 | 0.8359 |
| expedition-basecamp | 2 | +0.0131 | 0.0337 | 0.0469 |
| investigation | 4 | +0.0508 | 0.4429 | 0.4938 |
| secure-meeting-room | 2 | +0.2170 | 0.1178 | 0.3348 |
| rescue-route | 2 | +0.5119 | 0.2231 | 0.7350 |

- **pooled paired mean D−H = −0.1479**（20 pairs；负值偏好 disclosure）；
- leakage-group cluster bootstrap（frozen seed，10,000 resamples，8 groups）：median **−0.1459**、95% CI **[−0.4541, +0.1205]**、valid fraction **1.0000**；
- 稳健性（frozen analyzer 规则）：排除最负组（aircraft-landing）后 pooled mean = **−0.0489**（仍 < 0，故非单一 group 驱动）。

> 注意：95% CI 上界 +0.1205 ≥ 0；SCREEN_PASS 不要求 CI 完全低于 0（那是正式实验的 Gate）。该区间不能当作 confirmatory significance test。

## 4. FACT — delivery 与描述性 uptake

- delivery：20/20 的 D run 的 `publicContextHash` 与冻结 plan 的 D hash 一致（披露 block 确实进入公共上下文）；H 保持 base context；
- uptake（exact source-hash reference）：D 臂 evidence 中与披露 source `privateInformationHash` 精确相等的命中 **111 次**（可观测、可重建）；仅作描述性中介，不参与 status gate；
- token/cost：H 总 207,437 / D 总 233,780（D 多 ~26k，因披露 block 增加 prompt 输入；call 数相同 456）。

## 5. INFERENCE

在冻结的 HiddenBench task-heldout、DeepSeek `deepseek-chat`、两轮讨论 + final private elicitation、pooled-Brier 条件下：

- 随机化的 pre-discussion 单来源 disclosure 的 pooled paired Brier 差为负（−0.1479），方向偏好 disclosure；**该动作值得在独立任务/模型上复现**。
- 负方向集中在 aircraft-landing（−1.04）与 post-earthquake-lab（−0.72）两个组，urgent-transfer 次之（−0.28）；**多个组方向相反**（rescue-route +0.51、secure-meeting-room +0.22）。排除最负单一组后均值仍为负（−0.0489），但**排除前两组后约 +0.04**——效应并不均匀，存在明显 task 异质性。
- 这是机制筛选中"该动作改变了信息访问且整体方向有利"的信号，**不是**任何普适治理结论。

## 6. LIMITATION

- 8 个 leakage groups 中 6 个为单任务组；cluster bootstrap 有效独立单位接近任务数（10），不确定性粗；
- 单模型（DeepSeek）、单 prompt/profile、HiddenBench 数据投影；跨模型/prompt/任务库不成立；
- **final 报告 17/152 无效（H 9 / D 8）**，经冻结 `reference_distribution_for_non_answered` 插补；relief-clinic（19 次 provider-level invalidOrFailed）与 investigation（11 次）是主要来源，其 Brier 值插补占比高，relief-clinic paired mean 恰为 0.0000 与插补强相关；
- exact hash uptake 是非对称解释：111 命中只证明逐字复述发生；零命中不能排除 paraphrase/总结/隐式使用；
- 若某 task 的披露 source 与 shared info 大量重叠，该 pair 近似 no-op（弱操纵），会稀释总效应；
- SCREEN_PASS 非 confirmatory；bootstrap interval 跨零不构成效果证据。

## 7. 禁止主张

本报告不主张：通用治理有效、measurement valid、source independent、production-ready、AAMAS-ready、social thermodynamics established、disclosure 普适提高准确率、或 causal effect established beyond the frozen experiment。

## 8. Red-zone 与偏离

- **无 red-zone**：source selection 不含 arm/runId/output/truth；两臂唯一差异为 publicContext；always-ineligible 零 verification/action；plan 不含 private/truth 明文；无泄漏。
- **偏离（WP-A 执行前修复）**：首次 `--execute` 因 WP-A gate 在 `dotenv.config` 前检查 `DEEPSEEK_API_KEY` 而提前返回（key 在 `.env.local` 中），**0 provider calls、0 成本**；已修正 gate（只查 `RUN_AUTHORIZED`，key 检查移到 dotenv 之后）并补测试；冻结 plan/analyzer 未动，执行使用同一 frozen plan。
- 执行过程无 retry、无补样本、无换题、无重抽；456 calls 恰为计划数。

## 9. 声明

- 凭据：仅检查 `DEEPSEEK_API_KEY` **存在性**，未读取/打印/记录值；`RUN_AUTHORIZED=yes` 由 owner 确认后仅在单次执行命令中物化；
- retry：0；
- git 写操作：未执行 `git add/commit/reset/checkout/clean`；
- 修改文件：仅白名单内的 runner/test/实施报告；frozen plan、analyzer、`src/**`、schema、provider 未动。

---

## 后续路线（不擅自执行）

按冻结手off §9：`SCREEN_PASS` → 返回 Codex/owner 冻结一次**独立任务或模型 replication**；不自动扩大工程、不改变 policy、不进行任何阈值/子群/后验筛选。Claude Code 不决定论文主张或理论修改。
