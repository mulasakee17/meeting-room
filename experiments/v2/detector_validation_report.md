# 检测器经验统计报告（P0.2 选项 A）

> **状态**：AI-assisted analysis，pending human verification。
> **数据范围**：同步引擎 runs（data/ + data_crisis/ + data_supplier/），共 279 runs。
> **不含**：异步引擎 runs（async 不保存 messages）；3 个 MAST 检测器（FM-2.4/2.5/2.6）——实现于 2026-07-20 之后未重跑任何实验，触发次数为 0。
> **准则**：以假装理解为耻，以诚实无知为荣。所有数字直接来自 JSON 数据文件。

---

## 1. 检测器触发率（per-run）

每个 run 的 `issuesDetected` 字段是去重后的检测器列表（不是每轮触发次数）。

| 检测器 | 触发 runs | 总 runs | 触发率 | 触发时 τ (mean±std) | 未触发时 τ (mean±std) | Δτ |
|---|---|---|---|---|---|---|
| echo_chamber | 64 | 279 | 22.9% | 0.700±0.221 | 0.626±0.231 | 0.074 |
| authority_bias | 115 | 279 | 41.2% | 0.701±0.224 | 0.602±0.226 | 0.098 |
| polarization | 108 | 279 | 38.7% | 0.715±0.213 | 0.598±0.230 | 0.117 |
| premature_consensus | 79 | 279 | 28.3% | 0.597±0.222 | 0.661±0.232 | -0.064 |

## 2. 每轮触发次数（per-round）

统计 `rounds[].issues` 字段中每个检测器的总触发次数（含重复）。

| 检测器 | 总触发次数 | 平均每 run 触发次数 |
|---|---|---|
| echo_chamber | 154 | 0.55 |
| authority_bias | 402 | 1.44 |
| polarization | 488 | 1.75 |
| premature_consensus | 332 | 1.19 |

## 3. 共触发矩阵

两个检测器在同一 run 中同时触发的次数（对角线为单检测器触发次数）。

| | echo_chamber | authority_bias | polarization | premature_consensus |
|---|---|---|---|---|
| echo_chamber | 64 | 40 | 45 | 33 |
| authority_bias | 0 | 115 | 93 | 33 |
| polarization | 0 | 0 | 108 | 24 |
| premature_consensus | 0 | 0 | 0 | 79 |

## 4. 干预类型分布

总干预次数：495（279 runs，平均 1.77 次/run）

| 干预类型 | 总次数 | 占比 | 触发 runs | runs 占比 |
|---|---|---|---|---|
| reduce_weight | 201 | 40.6% | 115 | 41.2% |
| force_reflection | 204 | 41.2% | 95 | 34.1% |
| introduce_diversity | 35 | 7.1% | 29 | 10.4% |
| continue_discussion | 55 | 11.1% | 28 | 10.0% |

## 5. 分任务触发率

| 任务 | 总 runs | echo_chamber | authority_bias | polarization | premature_consensus |
|---|---|---|---|---|---|
| data | 110 | 24/110 (21.8%) | 0/110 (0.0%) | 15/110 (13.6%) | 46/110 (41.8%) |
| data_crisis | 80 | 30/80 (37.5%) | 56/80 (70.0%) | 42/80 (52.5%) | 22/80 (27.5%) |
| data_supplier | 89 | 10/89 (11.2%) | 59/89 (66.3%) | 51/89 (57.3%) | 11/89 (12.4%) |

## 6. 检测器触发次数与最终 τ 的相关性

对每个检测器，计算"该检测器在每 run 中的触发次数（per-round 总和）"与"该 run 的最终 τ"的 Pearson 相关系数。

| 检测器 | n | Pearson r | 含义 |
|---|---|---|---|
| echo_chamber | 279 | 0.116 | 弱相关 (正相关) |
| authority_bias | 279 | 0.205 | 弱相关 (正相关) |
| polarization | 279 | 0.181 | 弱相关 (正相关) |
| premature_consensus | 279 | -0.192 | 弱相关 (负相关：触发越多 τ 越低) |

## 7. 局限与诚实声明

1. **数据范围限制**：本统计仅覆盖同步引擎 runs（279 runs），不含异步引擎 80 runs（async 数据格式不保存 messages，无法事后补跑检测器）。

2. **MAST 检测器完全缺失**：3 个 MAST 检测器（FM-2.4 信息隐藏 / FM-2.5 忽略输入 / FM-2.6 推理-行动不匹配）实现于 2026-07-20，**之后未重跑任何实验**。在当前 279 runs 中，MAST 检测器触发次数为 0。论文中宣称的"5.5/14 MAST 覆盖（39.3%）"目前**仅为设计值，无经验验证**。

3. **检测器无独立 ground truth**：本统计只能报告"检测器触发了多少次"，无法报告"触发是否正确"（即无 false positive / false negative 率）。要做 FP/FN 分析需要人工标注每个 round 的真实偏差状态，留作后续工作。

4. **detect-only 模式的检测器统计**：M&A 任务包含 `ma_detect-only_*` runs，这些 runs 启用检测但不触发干预。它们的 `issuesDetected` 字段仍记录检测器触发，被本统计包含。这可能导致"检测器触发率"略高于"干预率"。

5. **相关性非因果性**：§6 的 Pearson r 只表明统计共变，不表明检测器触发导致 τ 降低。可能的混淆变量：任务难度（难任务→更多偏差→更低 τ）。

6. **AI-assisted 草稿**：本报告由 AI 协助生成，统计推断（如相关性解释）需人类合作者复核。

## 8. 论文宣称对照

| 论文宣称（PAPER_DRAFT.md）| 本统计结果 | 状态 |
|---|---|---|
| "seven bias detectors — four classical ... and three aligned to MAST" | 4 个经典检测器有经验触发率；3 个 MAST 检测器触发次数 = 0 | ⚠️ 需修正：MAST 部分为设计值 |
| "5.5/14 MAST modes (39.3%)" | 仅设计层面覆盖；经验触发率 = 0/N | ⚠️ 需明确标注 design-time |
| "FC2 coverage rising from 0% to 50%" | 同上，仅设计层面 | ⚠️ 需明确标注 design-time |

---

**版本**：v0.1（2026-07-20）
**作者**：AI-assisted analysis
**数据**：279 sync-engine runs (data/ + data_crisis/ + data_supplier/)
**准则**：以假装理解为耻，以诚实无知为荣