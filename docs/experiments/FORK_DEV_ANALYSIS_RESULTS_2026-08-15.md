# FORK Development Analysis Results (8 high-disagreement tasks)

状态：FACT REPORT — development fork，只读分析，2026-08-15（**cap 修复后**）。
Runner：`run_v6_fork.ts`；analyzer：`analyze_v6_fork.ts`（`--run-dev`）。
数据：`experiments/campaign/pilot_output/v6-fork-dev-analysis-20260815/`（8 task × 1 seed × 5 arm = 40 rows，落盘 JSONL）。

> 本结果来自 development 任务（已参与形成方向假设），**不是 confirmatory**。它是 confirmatory 前的 prior 信号，不裁决 H1/H2。

---

## 0. 重要更正（cap bug 定位与修复）

首版 development fork 用 `FORK_K=4` 对 SUPPORTS/ATTACKS 也做证据数量截断，且截断顺序是 contentHash 字典序（语义任意）。这导致 task 45 的 6 条 attacks 里，唯一证伪 "Lab Beta" 的关键证据（"结构工程师发现 Beta 地板下承重梁有裂缝"）排在第 5 位、被截掉 → ATTACKS 臂无法排除 Beta → 答错 → H1 出现假反号（task45 Δ_dir = +0.461）。

修复：SUPPORTS / ATTACKS / ALL 改为全量披露（不 cap），只有 RANDOM 保留 K=4（其语义本就是信息量 arm）。修复后 task45 Δ_dir 恢复为 −1.071，H1 方向效应恢复。cap 前的错误数字已作废。

---

## 1. FACT（cap 修复后）

### 1.1 H1（primary：Δ_dir = Brier_ATTACKS − Brier_SUPPORTS）

| 量 | 值 |
|---|---|
| mean | **−0.330** |
| median | −0.113 |
| 95% CI（10k task-cluster bootstrap） | **[−0.629, −0.073]**（完全 < 0）|
| negative / positive / zero | 6 / 0 / 2 |
| task count | 8 |
| verdict | `direction effect detected in predicted direction` |

per-task Δ_dir：`task13 −0.031 · task24 0.000 · task28 −0.926 · task32 −0.169 · task33 −0.382 · task39 −0.057 · task45 −1.071 · task54 0.000`

### 1.2 H2（secondary：Δ_disc = Brier_ATTACKS − Brier_CONTROL）

| 量 | 值 |
|---|---|
| mean | −0.371 |
| median | −0.143 |
| 95% CI | [−0.810, **+0.019**]（跨 0，上界仅超 0）|
| negative / positive / zero | 5 / 1 / 2 |
| verdict | `direction effect was not detected` |

per-task Δ_disc：`task13 −0.500 · task24 −0.071 · task28 −0.215 · task32 0.000 · task33 −1.542 · task39 +0.434 · task45 −1.071 · task54 0.000`

### 1.3 LOTO（H1，robustness only）

- full = −0.330；min = −0.377；max = −0.224。
- most influential task = 45（−1.071）。
- **signChanges = false**：移除任何单个 task，H1 均值方向不变（仍为负）。

---

## 2. INFERENCE

- **H1 方向效应在干净 fork 中恢复**：ATTACKS 相对 SUPPORTS 的 CI 完全 < 0，6/8 负、0 正、2 零，LOTO 不变号。与历史"disconfirming evidence 优于 confirming evidence"方向一致。
- **效应高度集中**：task45（−1.071）和 task28（−0.926）贡献了大部分负值；其余任务接近 0（−0.03 ~ −0.38）。方向一致但量级异质。
- **H2（ATTACKS vs CONTROL）此次跨 0**（上界 +0.019），主要由 task39 的 +0.434 正号拉动（task39 的 attacks 全量披露反而略差，可能含误标 attacks）。n=8 下 H2 不稳定。
- cap bug 的教训：**用机械规则（contentHash 字典序）截断证据，会丢弃 hidden-profile 的决定性反证证据**，与历史 supports-only 过滤器是同类错误——都因"选择性证据曝光"改变结果。

## 3. LIMITATION（诚实）

- n=8 development 任务（已 prior 到方向假设），不能作为 confirmatory 结论。
- 单 seed（seed 0）、单模型（DeepSeek deepseek-chat）、temperature 0。
- 全量披露下 SUPPORTS 与 ATTACKS 的证据数量天然不对称（attacks 6 条 vs supports 4 条等），"方向"里仍可能混有"多给一条信息"的混杂，需 coverage/count-matched 子集进一步隔离。
- final elicitation 存在 missingness（受 provider 非确定性影响），已由 `finalReportedCount` 记录。

## 4. 对 confirmatory 的含义（DESIGN INTENT）

- H1 prior 恢复为"方向效应可能存在且方向正确"；confirmatory 45-task 是唯一裁决者。
- 必须诚实呈现 task 异质性（效应集中在少数灾难任务），不得只报 pooled 均值。
