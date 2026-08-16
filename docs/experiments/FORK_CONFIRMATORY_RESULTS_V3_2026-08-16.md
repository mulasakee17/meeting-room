# FORK Confirmatory v3 — Post-hoc Multi-Seed Replication (45 tasks × 2 seeds)

状态：FACT REPORT — v3 跨 seed 复现，2026-08-16。v2（1 seed，pre-registered）的
后验复现：seed=0 字节级复用 v2，seed=1 新跑。本篇是论文第二版（2-seed 口径）的
primary 证据。

- Runner：`run_v6_fork.ts`（experimentRef 3.0.0；FORK_SEEDS=[0,1]）；analyzer：`analyze_v6_fork.ts`。
- 数据：`experiments/campaign/pilot_output/v6-fork-confirmatory-v3-20260816/`
  （45 task × 2 seed × 3 臂 = 270 rows；45 seed-0 复用 + 45 seed-1 新跑；1239 calls；1.77M tokens）。
- 重放：`--replay` → `ok: true`（verified 90 files）。
- seed 探针：`seed_variation_confirmed`（seed 会改变 round-1 实现）—— 2 seed 是真实复现，非重复采样。
- v3 manifest hash：`sha256:3b8316b17549b0875c06e3d540ec0b0973142a98d9f557fbbb7f477358343e3c`。

---

## 1. Primary（跨 seed，task-level 配对 + 10k cluster bootstrap）

### H1（Δ_dir = Brier_ATTACKS − Brier_SUPPORTS，负 = ATTACKS 优）

| 量 | v2（1 seed） | v3（2 seed 平均） |
|---|---|---|
| mean | −0.343 | **−0.412** |
| median | −0.103 | −0.260 |
| 95% CI | [−0.507, −0.193] | **[−0.571, −0.267]**（完全 < 0）|
| neg / pos / zero | 24 / 9 / 12 | 28 / 7 / 10 |
| LOTO | signChanges=false | signChanges=**false** |

### H2（Δ_disc = Brier_ATTACKS − Brier_CONTROL）

| 量 | v2 | v3 |
|---|---|---|
| mean | −0.308 | **−0.330** |
| median | −0.060 | −0.100 |
| 95% CI | [−0.496, −0.147] | **[−0.497, −0.188]**（完全 < 0）|
| neg / pos / zero | 26 / 5 / 14 | 28 / 6 / 11 |
| LOTO | false | **false** |

**结论（FACT/INFERENCE）**：加第二个 seed 后，H1/H2 **双双变强且方向不变**（H1 −0.343→−0.412，
H2 −0.308→−0.330），CI 更窄或持平、仍全负、LOTO 不变号。方向效应与披露效应**跨 seed 复现**。
集中度下降（top-5 贡献 mean 从 47% 降到 39%），说明效应更均匀，不是单点主导。

---

## 2. Targeted rescue（pre-treatment severity，跨 seed task-level 平均）

按 round-1（披露前、三臂共享）pooled Brier 分档（阈值沿用 >1.0 / 0.3–1.0 / ≤0.3）：

| severity | n | r1 Brier | CONTROL | SUPPORTS | ATTACKS | ΔAC | ΔAS |
|---|---|---|---|---|---|---|---|
| catastrophic (>1.0) | 15 | 1.15 | 1.17 | 1.22 | **0.38** | **−0.79** | **−0.84** |
| moderate (0.3–1.0) | 28 | 0.63 | 0.26 | 0.39 | 0.18 | −0.09 | −0.21 |
| good (≤0.3) | 2 | 0.23 | 0.02 | 0.02 | 0.03 | +0.01 | +0.01 |

连续异质性（task-level）：
- **Spearman(r1 Brier, ΔAC) = −0.562**，95% bootstrap CI **[−0.777, −0.302]**（全负）。
- Pearson = −0.468。

**结论**：targeted rescue 跨 seed 复现——rescue 随 pre-treatment severity 单调放大，
且 severity 是 pre-treatment 协变量，不受 outcome-based subgrouping / regression-to-mean 影响。
（仍标 post-hoc exploratory，非 pre-registered。）

---

## 3. Detector：within-task 现在可算，且未复现（关键 negative result）

development（80 无治理场，8 task × 10 run）：reuse total r=0.641、**within-task r=0.388**、disagreement −0.349。

confirmatory（45 task × 2 seed，within-task 现在可算）：
- cross-task Pearson(reuse, CONTROL Brier) = **0.076**
- **within-task Pearson(reuse, CONTROL Brier) = −0.079**（vs development +0.388）→ **未复现**
- within-task Pearson(alignment, CONTROL Brier) = +0.113

**两点诚实结论**：
1. **detector 从"不可测"升级为"可测但未复现"**：v2 的盲区（seed=1 无法算 within-task）已被 v3 消除，
   结论是 development 的 within-task r=0.388 在 confirmatory 上**不成立**（−0.08 ≈ 0）。这是比 v2 更锋利的
   negative result："intervention 问题好解，routing 问题未解"现在有了直接实证。
2. **弱检验的诚实标注**：confirmatory 的 within-task 只有 2 run/task（vs development 10 run/task），
   是弱复现检验。−0.08 是"未复现"，不是"证伪到强结论"。

---

## 4. Secondary

### 4.1 accuracy（pooled vs majority）

| arm | pooled | majority | n |
|---|---|---|---|
| CONTROL | 0.629 | 0.618 | 89 |
| SUPPORTS | 0.533 | 0.500 | 90 |
| ATTACKS | **0.844** | **0.844** | 90 |

- ATTACKS 从 v2 的 0.822 升到 0.844；两口径一致。结论不依赖聚合方式。

### 4.2 H3（exploratory moderation，跨 seed）

| moderator | split | n | ATTACKS−CONTROL |
|---|---|---|---|
| evidenceReuse_R1 | high | 46 | **−0.372** |
| evidenceReuse_R1 | low | 43 | −0.292 |
| alignment_R1 | high | 45 | −0.228 |
| alignment_R1 | low | 44 | **−0.441** |

- 方向与 v2 一致：证据耦合越高效应越强；信念对齐方向相反。

### 4.3 missingness（finalReportedCount，满分 4）

| arm | mean | zeroReported |
|---|---|---|
| CONTROL | 3.68 | 1（task 60 某 seed 的 CONTROL 臂 0 报告）|
| SUPPORTS | 3.86 | 0 |
| ATTACKS | 3.83 | 0 |

- 无系统性臂偏差（唯一 0 报告在 CONTROL 臂，只会让 CONTROL 更保守，不偏向 ATTACKS）。

### 4.4 exposure volume（SUPPORTS vs ATTACKS，全 task×seed）

- items：5.34 vs 5.49（paired mean Δ = +0.14，median +1）；chars ~1691 vs ~1741；srcAgents 3.68 vs 3.46。
- **仍基本平衡** → direction interpretation 成立，不是 exposure-volume confound。

---

## 5. 对论文的含义（DESIGN INTENT）

- **主贡献（更硬）**：H1/H2 跨 seed 复现且变强 + targeted rescue 的 pre-treatment severity 单调梯度
  （Spearman −0.56，CI 全负）+ volume 平衡。
- **次贡献（负结果更锋利）**：detector 从"development 特定、within-task 未测"升级为
  "confirmatory within-task 已测且未复现（−0.08）"。这坐实了 **intervention easier than routing** 的边界。
- 论文已按 2-seed 口径更新（paper.en.md + main.tex）；v2 的 1-seed 数字作为 pre-registered 基线保留在 Method 里。
