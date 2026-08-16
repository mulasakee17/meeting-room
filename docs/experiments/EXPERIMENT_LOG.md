# Experiment Log

时间倒序的实验操作与设计变更日志。只记 **FACT（跑了什么）/ DESIGN INTENT（改了什么）/ INFERENCE（结论）**，不重复结果报告全文；细节指向对应 `docs/experiments/*.md` 或 `pilot_output/`。

约定：
- 每次 provider 实验运行记：命令、调用数/结果数字、结论。
- 每次影响 treatment/estimand 的改动记：版本 bump、manifest hash、原因。
- 正式 confirmatory 开始后，主假设与统计口径冻结，改动须产生新 version。

---

## 2026-08-15

### [FACT] confirmatory 45-task 跑完（结果：H1/H2 双通过）

- 命令：`RUN_AUTHORIZED=yes npx tsx .../run_v6_fork.ts --execute` → 45 runs / 135 rows / 1239 calls / 1.72M tokens；`--replay` ok（verified 45 files）。
- **H1（ATTACKS−SUPPORTS）**：mean −0.343，95% CI [−0.507, −0.193] 全负，24负/9正/12零，verdict `detected`，LOTO signChanges=false。
- **H2（ATTACKS−CONTROL）**：mean −0.308，CI [−0.496, −0.147] 全负，26负/5正/14零，verdict `detected`，LOTO signChanges=false。
- secondary：majority-vote ≈ pooled（ATTACKS 0.822/0.822）；missingness 无偏差；H3 耦合高→效应更强（−0.375 vs −0.237），对齐反向（低对齐 −0.420 vs 高 −0.200）。
- 详见 `docs/experiments/FORK_CONFIRMATORY_RESULTS_2026-08-15.md`。

### [FACT] confirmatory 开跑前 6 项修复（复查 → 钉死 seed=1 → 修）

- `FORK_SEEDS` 从 `[0,1,2]` 钉死为 `[0]`（1 seed，task breadth 优先）。
- `FORK_OUTPUT_DIR` → `v6-fork-confirmatory-v2-20260815`；`FORK_PLAN_PATH` → `v6_fork_confirmatory_v2.plan.json`（已重新 `--plan`）。
- `FORK_DISABLED` → `false`（confirmatory v2 owner-approved；仍需 `RUN_AUTHORIZED=yes`）。
- freeze report 加 v2 修订标注（保留 v1 历史）；manifest v1 文件保留作历史。
- 重新冻结：manifest contentHash `sha256:8021cf750990d6f4f8d491e7c6c7f35d4381874284548f08811d08c882d6ac5f`；plan contentHash `sha256:c112b677f4da09a3abdbd79f1eb0dda004ca3abaf2e5a572bb8b541a4a62933f`；**45 runs × 28 calls = 1260 calls**。
- 完整清单：`docs/experiments/FORK_CONFIRMATORY_CHECKLIST.md`。

### [DESIGN INTENT] 砍臂：5 臂 → 3 臂（fork experiment v2.0.0）

- `FORK_ARMS` 从 `[CONTROL, SUPPORTS, ATTACKS, RANDOM, ALL]` 改为 `[CONTROL, SUPPORTS, ATTACKS]`。
- 删除 `FORK_K`、`FORK_RANDOM_SALT`、RANDOM/ALL 分支；SUPPORTS/ATTACKS 改为**全量披露**（不 cap）。
- 原因：confirmatory 只需 CONTROL/SUPPORTS/ATTACKS 回答 H1/H2；RANDOM/ALL 是机制解释臂，砍掉省预算。
- 版本：`FORK_EXPERIMENT_REF` 1.0.0 → **2.0.0**。
- 涉及：`experiments/campaign/v6/run_v6_fork.ts`、`analyze_v6_fork.ts`、测试。

### [FACT] 补 per-agent final belief 落盘

- `ForkRow` 新增 `finalAgentBeliefs: Record<string, number>[]`，补全 `round1 → round2 → final` 三段 per-agent 向量。
- 目的：事后可补算 majority-vote accuracy（共识收敛口径），无需重跑 confirmatory。

### [FACT] 口径统一（数字冲突修正）

- detector：n 64→80；reuse total 0.645→**0.641**；within-task 0.456→**0.388**；对齐 R/argmax/top2 标注为 64 场口径待重算。
- cross-evidence：补 r5，attacks n=18→**n=30**（Brier 0.090/97%）。
- 论文 `main.tex` + `paper.en.md`：disclosure 从 pooled 0.58/0.09 改为 within-round 0.34–0.55；"decisive"→"matters (pending confirmatory)"。
- 涉及：`docs/experiments/V6_FALSE_CONSENSUS_DETECTOR_2026-08-15.md`、`V6_CROSS_EVIDENCE_EXCHANGE_RESULTS_2026-08-15.md`、`paper_rewriting_output/final_paper/*`。

### [FACT] development 8-task fork 重跑（cap 修复后）

- 命令：`RUN_AUTHORIZED=yes npx tsx experiments/campaign/v6/analyze_v6_fork.ts --run-dev`
- H1（ATTACKS−SUPPORTS）：mean **−0.33**，95% CI **[−0.629, −0.073]**（全负），6负/0正/2零 → `direction effect detected`。
- H2（ATTACKS−CONTROL）：mean −0.371，CI [−0.810, **+0.019**]（跨 0）→ `not detected`。
- task45 恢复 −1.071；效应集中于 task45/task28，方向一致但量级异质。
- 详见 `docs/experiments/FORK_DEV_ANALYSIS_RESULTS_2026-08-15.md`。

### [FACT + DESIGN INTENT] cap bug 定位与修复

- **根因**：`FORK_K=4` 对 SUPPORTS/ATTACKS 做 contentHash 字典序截断（语义任意），task45 的 6 条 attacks 中唯一证伪 "Lab Beta" 的关键证据（"结构工程师发现 Beta 地板下承重梁有裂缝"）排第 5 位被截 → ATTACKS 答错 → H1 假反号。
- **修复**：SUPPORTS/ATTACKS 全量披露；教训与历史 supports-only 过滤器同类（机械规则丢弃决定性证据）。

### [FACT] development 8-task fork 首版（cap K=4，已作废）

- H1 −0.151（CI 跨 0），task45 反号 +0.461 → 触发上面 cap bug 定位。

### [FACT] preflight（development 20 task × 1 seed）

- 命令：`RUN_AUTHORIZED=yes npx tsx experiments/campaign/v6/analyze_v6_fork.ts --preflight`
- summary **READY**；token imbalance ratio 1.06（无系统性失衡 → 不加 token-budget selector）；evidence count 5/20 块不对称（pool 约束）。
- 报告：`experiments/campaign/v6/FORK_PREFLIGHT_REPORT.json`。

### [FACT] seed 敏感性探针（真实 DeepSeek）

- 命令：`RUN_AUTHORIZED=yes npx tsx experiments/campaign/v6/run_v6_fork.ts --probe-seed`
- task 13/39 × seed 0/1：4/4 round-1 stateHash 互异 → `seed_variation_confirmed`。
- 结论：DeepSeek 温度 0 + 不同 seed 产生不同 round-1；`FORK_SEEDS=[0,1,2]` 保留。

---

## 待办（关键路径）

- [ ] **confirmatory 45-task × 1 seed × 3 臂（≈1260 calls）** —— 唯一裁决者，未跑。
- [ ] 对齐 R / argmax / top2 的 80 场重算。
- [ ] fork dev 结果写进论文正文（当前仅历史 within-round + detector）。
- [ ] majority-vote accuracy 口径（数据已备 `finalAgentBeliefs`，跑完再加）。
- [ ] 第二模型交叉验证（Qwen/GLM）。
