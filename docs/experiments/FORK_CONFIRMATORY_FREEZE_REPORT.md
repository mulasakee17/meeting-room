# FORK Confirmatory Experiment — Freeze Report

状态：FACT / DESIGN INTENT 冻结声明，2026-08-15。本报告冻结 confirmatory 实验的设计，不作为结果证据。

> **v2 修订（2026-08-15）**：本文下文 §3–§9 主体仍为 **v1（5 臂 + K=4 cap）** 历史冻结。当前生效的是 **v2（3 臂 CONTROL/SUPPORTS/ATTACKS，全量披露，不 cap；seed=1）**。v2 权威见 `docs/experiments/EXPERIMENT_LOG.md`、`docs/experiments/FORK_CONFIRMATORY_CHECKLIST.md` 与 `v6_fork_confirmatory_v2.manifest.json`。task split（development 20 / confirmatory 45）、H1/H2 定义、bootstrap/LOTO 口径、token 不截断原则在 v2 不变。

目标：在 hidden-profile multi-agent deliberation 中，严格检验 "disconfirming evidence（ATTACKS）是否优于 confirming evidence（SUPPORTS）"，以及效应是否依赖初始 epistemic state、如何经 Round-2 改变最终 belief。

---

## 1. Task split（冻结）

**development 判据（冻结）**：任何 HiddenBench task 的 ATTACKS / SUPPORTS fork outcome 已被人工查看、比较、或用于形成当前方向假设。

- `FORK_DEVELOPMENT_TASK_IDS` = 20 = `CROSS_EVIDENCE_EXCHANGE_TASK_IDS`：
  `1,2,3,4,5,6,7,8,9,10,11,12,13,24,28,32,33,39,45,54`
- `FORK_CONFIRMATORY_TASK_IDS` = 45（HiddenBench[1..65] − development）：
  `14,15,16,17,18,19,20,21,22,23,25,26,27,29,30,31,34,35,36,37,38,40,41,42,43,44,46,47,48,49,50,51,52,53,55,56,57,58,59,60,61,62,63,64,65`

FACT：只排除看过 ATTACKS/SUPPORTS outcome 的任务。曾跑过其他机制（verdict / no-governance / source-disclosure）但不涉及 ATTACKS/SUPPORTS outcome 的任务**不自动排除**。

冻结约束：confirmatory run 开始后 task membership 不得修改；任何影响 treatment 或 estimand 的修改必须产生新 experiment version。

## 2. Seed policy（冻结 + probe 结果）

- provider seed = `providerSeedFor(taskId, forkSeed)`，注入 discussion + final 的 `invocationConfig.seed`。

**probe 结果（FACT，2026-08-15 真实 DeepSeek `--probe-seed`，development tasks 13/39 × seeds 0/1，共 16 次 round-1 调用）**：

- task 13：seed 0 stateHash `8e82bbd7…`，seed 1 stateHash `9806007d…` → 不同。
- task 39：seed 0 stateHash `a36e816f…`，seed 1 stateHash `aab2e6ef…` → 不同。
- 4/4 round-1 state hash 互不相同；`anySeedVariation = true`；conclusion = **`seed_variation_confirmed`**。

**结论（DESIGN INTENT）**：DeepSeek 温度 0 下传入不同 `seed` 会产生不同的 round-1 realization。因此 `FORK_SEEDS=[0,1,2]` 保留（seed 有实质意义，不是确定性重复）。预算原则 **task breadth > within-task seed repetition** 仍适用：45 unseen tasks × 1 seed 是基础，seed 增加需在预算内。

## 3. Disclosure bandwidth / token policy（冻结）

- 生成层只硬匹配 **evidence count**（`FORK_K=4`）；SUPPORTS/ATTACKS/RANDOM 都 cap 到 K，ALL 不 cap。
- 不截断单条 evidence 文本；不改写；不改变 polarity；不强制匹配 exact option identity。
- 完整记录：`disclosedEvidenceCount`、`disclosedTokenCount`、`disclosedCoveredOptionIds`、`disclosedCoveredOptionCount`、`disclosedSourceAgentCount`。
- confirmatory 前，在 development tasks 上运行 **token imbalance diagnostic**（ATTACKS vs SUPPORTS 的 mean/median/paired diff/ratio/per-task）。仅当出现明显系统性失衡，才实施"通过选择完整 evidence items 匹配总 token budget"的 selector；否则不改 selector。

## 4. Arm parity（冻结）

5 臂共享完全相同的 task / seed / private-info allocation / agent config / Round-1 transcript / Round-1 belief / evidence registry / Round-1 state hash：

| arm | 注入 |
|---|---|
| CONTROL | 无 |
| SUPPORTS | K 条 supports（去重）|
| ATTACKS | K 条 attacks（去重）|
| RANDOM | K 条混合（seeded shuffle）|
| ALL | 全部去重证据 |

FACT：`max_pairwise_TV >= 0.8` 门槛已废除；所有有效 Round-1 state 都 fork。maxTV 仅为 pre-treatment moderator / 分层变量，不再是干预触发门槛。

## 5. Estimand（冻结）

- **H1（primary）**：`Δ_dir = Brier_ATTACKS − Brier_SUPPORTS`，负值 = ATTACKS 更优。
- **H2（key secondary）**：`Δ_disc = Brier_ATTACKS − Brier_CONTROL`，负值 = ATTACKS 更优。
- Brier = multiclass Brier sum over canonical options vs frozen task outcome，pooled over final private belief reports。
- RANDOM / ALL 仅用于机制解释，不进入显著性主结论。

## 6. Analyzer behavior（冻结）

- 统计 unit = **task**，不是 (task, seed) 块或单行。
- 每 (task, seed) 块内先算 paired difference，同一 task 内跨 seed 平均 → 每 task 一个等权 effect。
- 95% CI = **task-cluster bootstrap**，10,000 resamples，resample unit = task，seed = `0x5EED0F`。
- 输出：mean / median / CI / negative-count / positive-count / zero-count / per-task effects / effect distribution。
- **LOTO**（leave-one-task-out）仅作 robustness：输出 min/max LOTO estimate、最影响 estimate 的 task、是否变号。
- **verdict 口径（冻结，不可事后替换）**：
  - CI 完全 < 0 → `direction effect detected in predicted direction`；
  - CI 含 0 → `direction effect was not detected`（不写 `no effect`；不事后改用 sign count 宣布 H1 成立）。
- H1 未通过但 H2 通过 → 只能支持 "ATTACKS intervention improves over CONTROL"，不能支持 "disclosure direction is decisive"。

## 7. Manifest hash（冻结）

`buildForkConfirmatoryManifest()` contentHash = `sha256:6ecf5a4070682629428b9bf205b33d7512e5b7cd38f354c86fe6677f6caf2750`

manifest 记录：development criterion、development/confirmatory task IDs、taskIdsHash、model、temperature=0、K=4、arm list、seed policy、H1/H2 定义、Brier 定义、bootstrap method/repetitions、token diagnostic policy、selector/analyzer ref。

## 8. Preflight（confirmatory 前，development tasks 上）

10 项检查（`runForkPreflight`），结构性失败 → `BLOCKED`；诊断项只记录、由人判断，不自动转成败/胜规则：

1. 5-arm fork 完整性
2. identical round-1 state hash
3. evidence count equality
4. token imbalance diagnostic
5. option coverage diagnostic
6. source-agent coverage diagnostic
7. round-2 trace completeness
8. analyzer paired-block integrity
9. bootstrap smoke test
10. seed sensitivity result

### 8.1 Preflight 实际结果（FACT，2026-08-15，development 20 task × 1 seed）

`summary = READY`（100 rows，20 blocks，全部通过结构性检查）。

| 检查 | 结果 | 关键数字 |
|---|---|---|
| five_arm_completeness | pass | 20 blocks, 0 incomplete |
| identical_round1_state_hash | pass | 0 blocks divergent |
| evidence_count_equality | **warn** | SUPPORTS≠ATTACKS in 5/20 blocks；pool asymmetry 18/20 |
| token_imbalance_diagnostic | pass | ATTACKS 1223.7 vs SUPPORTS 1152.2 tokens（ratio 1.06，paired diff +71.5）|
| option_coverage_diagnostic | pass | mean covered options ATTACKS 2.15 / SUPPORTS 1.90 |
| source_agent_coverage_diagnostic | pass | mean source agents ATTACKS 2.95 / SUPPORTS 3.20 |
| round2_trace_completeness | pass | 0/100 empty |
| analyzer_paired_block_integrity | pass | blocks=20, h1 tasks=20 |
| bootstrap_smoke_test | pass | synthetic CI [−0.110, +0.180] |
| seed_sensitivity | pass | `seed_variation_confirmed` |

**token imbalance 判定（§3 闸门）**：ATTACKS/SUPPORTS token 比 1.06、配对差 +71.5 tokens，**无系统性失衡** → 保持当前 selector（只硬匹配 evidence count K=4，不截断/改写/改 polarity），**不新增 full-item token-budget selector**。

**evidence count 的 warn 解释（INFERENCE，不 gate）**：18/20 块的 supports/attacks 证据池大小天然不对称，其中 5 块因某臂池 < K=4 导致披露 count 不同（count 差异由 `disclosedPoolSize` 完整记录）。token 总量已平衡（ratio 1.06），故不属于 §3 的"明显系统性失衡"；confirmatory 分析时以 `disclosedPoolSize` 作为 sensitivity covariate 复核 H1 是否被 count 不对称的块驱动。

## 9. 本阶段不做（明确排除）

RANDOM-COVERAGE 新 arm、mediation model、四象限 governor、dynamic governance、free energy、phase transition、Gini、Fleiss κ、Cronbach α、新 runtime abstraction、大规模架构重构。

RANDOM / ALL 保留现有机制解释地位。等 fresh confirmatory 数据回来后，再决定是否做 coverage-matched subset、RANDOM-COVERAGE、epistemic-state interaction、mediation。

---

## 实现落点

- Runner：`experiments/campaign/v6/run_v6_fork.ts`（`runFork` / `runForkExecute` / `probeForkSeedSensitivity` / `buildForkConfirmatoryManifest`）。
- Analyzer：`experiments/campaign/v6/analyze_v6_fork.ts`（`analyzeForkRows` / `runForkPreflight` / `readForkRowsFromDir`）。
- Selector（复用）：`experiments/campaign/v6/crossEvidenceExchangeSelectorsV1.ts`。
- 测试：`test/v6-fork.test.ts`、`test/v6-fork-analyzer.test.ts`。
