# V6 Source-Disclosure 独立复现 — 执行结果

日期：2026-08-14
状态：**SCREEN_PASS（独立复现）— 方向在 8 个未触碰任务上重现；仍为 non-confirmatory，不构成效果建立**。
权威：`docs/plans/CLAUDE_CODE_SOURCE_DISCLOSURE_PHASE2_EXECUTION_HANDOFF_2026-08-14.md` §9（SCREEN_PASS → 独立任务 replication）。

---

## 1. Status

`SCREEN_PASS`（独立复现）：authority/replay/firewall 全通过（32/32）；delivery 16/16；uptake 可观测（81 次精确 source-hash 命中）；pooled paired mean D−H < 0；排除最负单一 group 后仍 < 0。

**复现结论：screen 的方向性信号在 8 个独立任务上重现（pooled −0.1821，screen 为 −0.1479），"任务采样噪声"的解释变弱。这仍不是 confirmatory 效果证据。**

## 2. FACT — 冻结设计、执行计数、artifact/replay

- frozen plan contentHash：`sha256:5f03170d72c7d7bb3b067e19959adcb4fce4f94536478ee3b171d5842ee17fd1`；
- 任务 `19,24,32,40,49,51,54,63`（8 个独立未触碰任务）；8 个 leakage groups；2 blocks/task；32 runs / 16 H/D pairs；
- 执行：**32/32 written、0 reused**；calls **384**（= 计划数，零 verification/zero governance/zero retry）；tokens **381,140**；
- replay **32/32 零 issue**，`sealed_decision_replay_verified`；
- authority：replay 32/32、publicContextCompliance 32、sourceReplayConsistent 32、sameBlockSourceConsistent 32、verificationCallsZero 32、callCountMatch 32。

## 3. FACT — paired 与 cluster-bootstrap

| leakage group | pairs | mean D−H | H mean | D mean |
|---|---|---|---:|---:|---:|
| disaster-supply-distribution | 2 | **−0.9975** | 1.1575 | 0.1600 |
| offline-data-backup | 2 | **−0.5625** | 0.5625 | 0.0000 |
| emergency-vaccine-transit | 2 | **−0.4969** | 0.7526 | 0.2557 |
| storm-shelter-siting | 2 | **−0.2025** | 0.2025 | 0.0000 |
| field-station-siting | 2 | **−0.1406** | 0.6475 | 0.5069 |
| event-relocation | 2 | **−0.0623** | 0.1614 | 0.0991 |
| island-research-base-siting | 2 | +0.0052 | 0.0625 | 0.0677 |
| emergency-hospital-transit | 2 | **+1.0000** | 1.0000 | 2.0000 |

- **pooled paired mean D−H = −0.1821**（16 pairs）；bootstrap median **−0.1915**、95% CI **[−0.5305, +0.2188]**、valid fraction **1.0000**；
- 稳健性（frozen analyzer 规则）：排除最负组（disaster-supply）后 pooled mean = **−0.0657**（仍 < 0）；
- 方向一致性：**8 组中 6 组为负、1 组≈0、1 组强反向**（emergency-hospital-transit +1.00）。相对 screen（5 负/3 正）更一致。

## 4. FACT — delivery 与描述性 uptake

- delivery：16/16 的 D run `publicContextHash` 与冻结 plan 一致；
- uptake：D 臂 exact source-hash 命中 **81 次**（描述性中介，不参与 status gate）；
- terminal：H 57 answered / 7 invalid；D 61 answered / 3 invalid（共 128 agent-final，10/128 插补，少于 screen 的 17/152）。

## 5. INFERENCE

- 在独立任务集上，pre-discussion 单来源 disclosure 的 pooled paired Brier 差再次为负（−0.1821），与 screen（−0.1479）方向一致 → **该信号不是这 8 个或那 10 个任务挑出来的；"任务采样噪声"的解释显著变弱**。
- 复现的方向一致性更高（6/8 负），插补更少；但仍有一个强反向组（emergency-hospital-transit），说明机制是 task-dependent，不是普适有利。
- 该动作因此**值得进入正式、更大样本、预注册的实验**；复现本身不是效果证明。

## 6. LIMITATION

- 两次 8-cluster screen 的 95% CI 均跨零（本复现 [−0.5305, +0.2188]）——合计仍是小样本方向证据，非 confirmatory；
- 单模型（DeepSeek `deepseek-chat`）、单 prompt；跨模型/prompt/任务库不成立；
- 效应存在明显 task 异质性（1 组强反向），不表示"披露普遍改善决策"；
- 10/128 final 报告经 reference 插补；
- exact hash uptake 非对称可解释（零命中不排除 paraphrase/隐式使用）。

## 7. 禁止主张

不主张：通用治理有效、measurement valid、source independent、production-ready、AAMAS-ready、social thermodynamics established、disclosure 普适提高准确率、causal effect established。

## 8. Red-zone 与偏离

- 无 red-zone；两臂唯一差异为 publicContext；always-ineligible 零 verification；source selection 不含 arm/runId/output/truth；
- 偏离：无（复现沿用 screen 的 runner/analyzer，仅任务集经 env `SOURCE_DISCLOSURE_TASK_SET=replication` 选择；screen plan hash 2cbb8699 未被改动）。
- 执行过程无 retry、无补样本、无换题、无重抽。

## 9. 声明

凭据仅做存在性判断（未读/未打印值）；`RUN_AUTHORIZED=yes` 由 owner 确认（"继续"）后在单次命令物化；未执行 git 写操作。

---

## 后续（不擅自执行）

两次 SCREEN_PASS（screen + 独立复现）→ 按集成指南 Phase 2，下一步候选是**正式三臂实验**（16–24 个新 clusters、更强功效、预注册主比较）。该设计、预算与执行需 Codex/owner 另行冻结并授权；本报告不授权任何扩大工程或政策改变。
