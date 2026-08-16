# FORK Confirmatory — 完整事项清单（防上下文污染）

状态：复查于 2026-08-15。本文是 confirmatory 45-task 跑完前后的唯一行动清单；任何步骤完成后在 `[ ]` 打 `[x]`。若上下文丢失，以本文为准。

---

## 第一部分：开跑前必须修的 6 个不一致（复查发现）

这些是代码/文档现状与"要跑 3 臂 v2 confirmatory"之间的裂缝，不修会跑错或跑完对不上。

1. **[x] seed 数未钉死（最关键）** — 已修：`FORK_SEEDS=[0]`（1 seed）。
   - 现状：`FORK_SEEDS = [0,1,2]`（`run_v6_fork.ts:480`），`buildForkPlanV1` 默认 3 seeds → `--execute` 会跑 **45 task × 3 seed × 3 臂 ≈ 3780 calls**，不是预算讨论的 1260。
   - 决定：confirmatory 用 **1 seed**（task breadth > seed repetition）。改 `FORK_SEEDS=[0]`，或在 `--execute` 显式 `seeds:[0]`。

2. **[x] FORK_OUTPUT_DIR 还是 v1 目录名** — 已修：`v6-fork-confirmatory-v2-20260815`。
   - 现状：`v6-fork-v1-20260815`（`run_v6_fork.ts:483`）。
   - 决定：改为 `v6-fork-confirmatory-v2-20260815`，避免与 dev 数据混淆。

3. **[x] FORK_PLAN_PATH 还是 v1** — 已修 + 重新 `--plan`（45 runs / 1260 calls）。
   - 现状：`v6_fork_v1.plan.json`（`run_v6_fork.ts:487`）。
   - 决定：改 `v6_fork_confirmatory_v2.plan.json`，重新 `--plan` 生成。

4. **[x] FORK_DISABLED 仍为 true** — 已翻 `false`（仍需 `RUN_AUTHORIZED=yes`）。
   - 现状：`run_v6_fork.ts:492`。开跑前翻 `false`（连同 `RUN_AUTHORIZED=yes`）。

5. **[x] freeze report 停在 5 臂 + K=4** — 已加 v2 修订标注（保留 v1 历史）。
   - 现状：`FORK_CONFIRMATORY_FREEZE_REPORT.md` 的 line 43 "5 臂"、line 36 "FORK_K=4"、line 50-51 RANDOM/ALL 仍是 v1 描述。
   - 决定：更新为 3 臂 v2，或加"本文是 v1 历史，v2 见 EXPERIMENT_LOG + v2 manifest"标注。

6. **[x] manifest v1 文件残留** — 已保留 v1 作历史，v2 已重新冻结（hash `8021cf75…`）。
   - 现状：`v6_fork_confirmatory_v1.manifest.json`（旧 5 臂）与 v2 并存。
   - 决定：保留 v1 作历史，标注不删。

---

## 第二部分：跑完后立即做（审计 + 分析）

7. **[ ] 离线重放校验**：`npx tsx experiments/campaign/v6/run_v6_fork.ts --replay` → 应 `ok: true`（manifest hash + 每文件 hash + 3 臂共享 stateHash）。

8. **[ ] 运行 analyzer**：`npx tsx experiments/campaign/v6/analyze_v6_fork.ts --output-dir <confirmatory目录>`，得到 H1/H2 的 mean/CI/median/正负零计数/per-task/verdict/LOTO。

9. **[ ] preflight 复核**（可选但推荐）：对 confirmatory rows 跑 `runForkPreflight`，确认 arm_completeness / identical_state_hash / token imbalance 在 unseen 数据上仍无异常。

10. **[ ] 记录结果到 EXPERIMENT_LOG**：命令、调用数、H1/H2 数字、verdict、LOTO，时间倒序追加。

---

## 第三部分：统计收口

11. **[ ] per-task 异质性诚实呈现**：效应是否又集中在少数灾难任务？（不藏，不只在 pooled 上做结论。）

12. **[ ] H3 / H4（pre-registered secondary）**：
    - H3（coupling moderation）：ATTACKS−CONTROL 效应是否在高 evidence coupling / 高 alignment 状态更强。
    - H4（quantity insufficient）：注意——RANDOM/ALL 臂已砍，H4 的"quantity"检验需要重新表述或用 development 历史数据；不能假装 confirmatory 有 RANDOM/ALL。

13. **[ ] majority-vote accuracy**：用 `finalAgentBeliefs` 补算，与 pooled argmax 并排；对比两者是否给出不同 H1/H2 结论。

14. **[ ] missingness sensitivity**：按 `finalReportedCount` 分层，检查 H1/H2 是否被 final 缺失系统性影响（尤其 task32 这类 ATTACKS final=0 的场）。

15. **[ ] 判定口径冻结执行**：CI 全<0 → detected；含 0 → "not detected"；**不写 no effect，不事后换胜负标准**。

---

## 第四部分：理论收拢（不花钱，可并行，跑完前就能做）

16. **[ ] 写一页冻结说明**：`Evidence pool → exposure policy → public evidence topology → belief response → proper loss`。

17. **[ ] 三个发现串成一个理论**：direction / reuse detector / semantic wall → "Epistemic Exposure Governance + Coupled Consensus"。

18. **[ ] 明确 measurement 边界（论文 Limitations 必写）**：
    - relation 是模型自报标签，有误标（构念效度未独立验证）。
    - evidenceReuse 是"逐字复用"，不是"证据非独立"（coupled consensus 的测量 gap）。
    - 编号证据池（protocol v3）留作后续工作，本篇不声称已解决。

---

## 第五部分：写作定稿

19. **[ ] 结论分叉写死**：H1+H2 都成立 / 只 H2 / 都不成立，三种各一段，按实际结果选。
    - 只 H2 成立 → 只能主张"反证注入有效"，不主张"方向决定性"。

20. **[ ] related work / 方法 / limitations / reproducibility-artifact 声明**（paper-spine 流程）。

21. **[ ] 单模型局限**：DeepSeek only。要么在 limitation 写，要么补 Qwen/GLM（新增实验，不阻塞本篇）。

---

## 第六部分：版本 / 归档

22. **[ ] 冻结 confirmatory manifest 版本号**：跑完后若任何 treatment/estimand 改动，必须 bump version + 新 hash，不静默覆盖。

23. **[ ] 归档产物**：confirmatory 目录 + plan json + manifest json + 结果文档 + EXPERIMENT_LOG 条目，一次性核对齐全。

---

## 关键红线（任何时候都遵守）

- confirmatory 结果回来后，**不得**根据结果改 H1/H2 主假设或统计口径。
- **不得**把 development 的 −0.33 当作 confirmatory 结论。
- **不得**在 pooled 不显著后，回头挑 catastrophic task 当"新验证"。
- 口径统一以 `EXPERIMENT_LOG.md` + 本文为权威，遇到冲突以"代码实际输出"为准。
