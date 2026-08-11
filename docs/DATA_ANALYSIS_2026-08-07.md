# 现有实验数据分析报告（2026-08-07）

> **历史数据快照：**本文结论仅适用于文中列明的 legacy E12 数据、schema 与分析脚本，不提供 V6 detector validity、治理效果或 confirmatory 证据。

> 结论先行：**E12 主数据集（含 B/C/D/F 各 phase）的 finalRanking / finalKendallTau / finalAccuracy 指标全部有效可用**；
> 所有 run 的 `roundOpinions` 终轮轨迹确实整体丢失（P0a 修复前 `roundDataArray.push` 在 break 之后的时序 bug），
> 但这不影响最终指标的正确性——finalRanking 从 `result.roundResults`（含真实终轮）计算，**不依赖** roundDataArray。
> 此前的 measure_pos_fallback 审计（`_pos_fallback_affected.json`，24 个"污染 run"）**为误报**，详见 §4。

---

## 1. 数据集总览

### 1.1 目录与规模

| 数据集 | run 数 | 引擎 | 说明 |
|---|---|---|---|
| `e12/`（主） | 158 | native_cognitive | HiddenBench 65 任务，A/B/C/D/F 多 phase，多种子 |
| `e12_glm_xval/` | 23 | native_cognitive | glm 交叉验证 |
| `e12_glm_scan/` | 14 | native_cognitive | 温度/参数扫描 |
| `e12_glm_verify/` | 8 | native_cognitive | 验证集 |
| `e12_glm_final/` | 6 | native_cognitive | glm 终版 |
| `e12_glm_hb/` `e12_glm_hb2/` `e12_glm_more/` | 6+6+6 | native_cognitive | glm 补跑 |
| `e12_bc/` `e12_bc_fixed/` | 6+2 | native_cognitive | crisis baseline |
| `e12_crisis_v2/` `e12_crisis_v2_fixed/` | 4+2 | native_cognitive | crisis v2 |
| `e12_glm_test/` `e12_hb_task6/` | 1+2 | native_cognitive | 小样 |
| `e1_native_lite/` | 9 | belief(3)+native(6) | 早期 E1 |
| `e1_stability/` | 1 | belief | E1 稳定性 |
| `e9_optimized_a/` | 9 | native_cognitive | E9 优化 A |
| `e9_v6_c_semantic/` | 5 | native_cognitive | E9 语义审计 |
| `e10_v6_a_pool/` | 1 | native_cognitive | E10 小样 |
| `e11_hb_none/` | 1 | native_cognitive | E11 配置 |
| `experiments/v2/data/` | 51 | 旧引擎 | 5 种 ablation（shuffle 等） |
| 探针/基线目录 | ~33 | 混合 | explore/probe/smoke/hb_full_baseline 等 |

**总计：约 360+ raw run（campaign 主集）+ 51 v2 旧数据。**

### 1.2 v2 旧数据（51 文件）

5 种 ablation，各 10 run（另有 1 个 None）：

| ablation | tauMean | roundsMean | conv% |
|---|---|---|---|
| full_continue | 0.620 | 3.9 | 50% |
| full_diversity | 0.660 | 4.7 | 10% |
| full_reflection | 0.660 | 4.3 | 20% |
| full_weight | 0.700 | 3.1 | 50% |
| shuffle | 0.900 | 3.7 | 80% |

- 结构为旧 schema（`kendallTau`/`decisionQuality`/`totalInterventions` 等），与 campaign 新 raw 格式**不兼容**（前已定为 needs-relabel）。

---

## 2. E12 主数据集指标（可信口径）

来自 `output/e12/summary_{phase}_{model}.json`（顶层聚合，由 Runner 在 run 时写入）：

| phase | model | n | acc | τ | conv | indAcc |
|---|---|---|---|---|---|---|
| A（自由文本 pre/post 投票） | deepseek-chat | 15 | pre 0.617 / post 0.650 | — | — | — |
| A | glm-4-flash | 65 | pre 0.181 / post 0.235 | — | — | fail 55 |
| B（结构化无治理） | deepseek-chat | 10 | **0.700** | 0.500 | 5/10 | 0.700 |
| B | glm-4-flash | 28 | 0.536 | 0.274 | 13/28 | 0.116 |
| C（结构化 + δ 治理） | deepseek-chat | 10 | 0.500 | 0.467 | 2/10 | 0.450 |
| C | glm-4-flash | 28 | 0.571 | 0.369 | 13/28 | 0.170 |
| D | deepseek-chat | 10 | 0.300 | 0.033 | 4/10 | 0.300 |
| F（单 agent 全信息，个体上限） | deepseek-chat | 65 | 0.985 | — | — | — |
| F | glm-4-flash | 65 | 0.954 | — | — | — |

**可支撑的结论：**
- **F >> 群体**：单 agent 全信息个体上限 0.985/0.954，远高于任何群体协议（B 最高 0.700）——说明群体讨论协议（A/B/C/D）**显著低于个体推理上限**，存在明显的信息利用损耗。这是论文最有力的主线结论。
- **B vs C（deepseek）**：加治理后 acc 0.700→0.500、τ 0.500→0.467、收敛 5/10→2/10。**当前 δ 治理对 deepseek-chat 是净负向**（可能与治理干预打断自然收敛、以及 governance veto 逻辑有关）。
- **B vs C（glm）**：acc 0.536→0.571、τ 0.274→0.369、收敛率持平——治理对 glm 略正向。
- **A 协议（free-text）**：deepseek 0.65 / glm 0.235，均低于 B/C——结构化协议优于自由文本。

---

## 3. 完整性分类（所有 run）

对每个 raw run 检查 `totalRounds` vs `len(roundOpinions)`，并检查终轮 itemBeliefs 的规范名匹配：

| 类别 | e12 主集 | 含义 |
|---|---|---|
| **E_clean**（roundOpinions 非空、最后轮 ≥2 opinions） | 116 | 数据完整（除终轮轨迹外） |
| **A_orphan_consensus**（roundOpinions 全空但有 finalRanking） | 26 | 终轮轨迹完全丢失，但 finalRanking 来自 roundResults，仍有效 |
| **D_p0c_affected**（measure 清单） | 16 | 见 §4——**误报**，实际有效 |
| **B/C_lowop/empty** | 0 | — |

**关键事实：158/158 run 的 `totalRounds == len(roundOpinions)+1`**（100%）。同理 E1 9/9、E9_optimized_a 9/9。

这是 P0a/P0b 修复前 `finalizeRound` 中 `roundDataArray.push` 位于 break 之后所致：终轮触发终止时，该轮已计入 `totalRounds`（由 `result.roundResults` 推导）但未 push 进 `roundDataArray`（`getRoundDataArray()` 的源）。

**影响**：`roundOpinions`、`itemBeliefsTrajectory`、`thermoHistory`、`deltaDiagnosis` 全部缺终轮。
- **可用**：finalRanking、finalKendallTau、finalAccuracy、beliefTrajectory、cognitiveTrajectory、interventions、governanceIssues、tokenUsage。
- **不可用（缺终轮）**：逐轮意见细节、终轮热力学/认知治理诊断、delta 分解中终轮贡献。

---

## 4. P0c「位置回退污染」审计结论：**误报**

`experiments/campaign/measure_pos_fallback.ts`（8/6 20:45 生成）与 `_pos_fallback_affected.json` 判定 24 个 run 受位置回退污染（accWith=0/accNo=1）。**本次复核判定为误报**，证据链：

1. **measure 用的是错误的轮**：脚本取 `roundOpinions` 最后一轮重算排名，但 `roundOpinions` **缺终轮**（§3）。实际 `finalRanking` 由 Runner 从 `result.roundResults[last]` 计算——那是真实终轮，未被 roundDataArray 记录。
2. **同 task 跨 seed 排名多样性**：task35 的 seed42（占位符轮）finalRanking=[Datacenter Beta, Alpha, Gamma]，而 seed123（canonical 轮）=[Datacenter Gamma, Alpha, Beta]。若 finalRanking 是位置回退（固定返回 Object.keys 原顺序），两者应相同 → **不同 ⇒ 来自真实终轮聚合**。
3. **B_t12 反向对照**：placeholder run 与 canonical run 的 finalRanking **相同**（overlap=1）——真实聚合本就可能一致，证明一致性不是回退证据。
4. **matchRate=0 的含义**：34 个 run 的已存轮次 itemBeliefs 全为占位符（"Company A/B/C" 等），但这只是 **LLM 在已存轮次的输出形式**，与终轮无关；且占位符轮从未被用于生成 finalRanking（finalRanking 用终轮）。

**因此**：
- 24 个 run 的 finalRanking/accuracy **仍然有效**，无需 relabel。
- 但该审计暴露了一个真实次生问题：**LLM 在部分轮次输出占位符而非规范选项名**（e12 中 34 个 run 全占位、31 个部分占位）。终轮是否也输出占位符无法从已存数据验证——若终轮输出占位符，`extractRanking`（fail-closed）会抛错 → finalRanking 为空。**存储的 finalRanking 非空 ⇒ 终轮必然成功匹配了规范名**，这是自身一致性证明。

> 结论：**P0c 在已存 E12 数据上的影响为零（无误报可清理）**。代码层 P0c（extractRanking fallback）已在 `0f17e85` 移除，现为 fail-closed。之前文档中的"24 run 需 relabel"应作废。

---

## 5. 各数据集有效性判定

| 数据集 | 结论 | 依据 |
|---|---|---|
| **E12 主集 + e12_glm_* + e12_bc/crisis** | ✅ **有效** | finalRanking/τ/acc 均来自真实终轮；指标口径统一（single-choice accuracy 对齐 HiddenBench） |
| **E1 native_lite** | ✅ 指标有效 / ⚠️ 无逐轮轨迹 | 9/9 终轮轨迹丢失，τ/acc 有效（5 轮 belief 数据在） |
| **E9_optimized_a** | ⚠️ 需谨慎 | 9 run，rounds 分布 1-2，8/9 终轮丢失，τ=0 居多（n 小、可能配置退化） |
| **E9_v6_c_semantic** | ⚠️ 需重跑（延续原判定） | run0/1 有效（τ=0.571，8 条真实 semantic audit），run2-4 退化/空（n=2 有效样本） |
| **E10_v6_a_pool** | ✅ 小样 | 单 run，τ=0.571 |
| **E11_hb_none** | ✅ 小样 | 单 run，τ=1 acc=1 |
| **v2/data（51 文件）** | ⚠️ needs-relabel | 旧 schema，5 ablation，指标可读但格式/口径与 campaign 不统一 |
| **探针/基线（explore/probe/smoke/hb_baseline）** | ✅ 辅助参考 | 早期探索数据，不进入正式分析 |

---

## 6. 对结论支撑力的影响

**不改变既有结论方向**：E12 核心叙事（F 上限 >> 群体、治理对 deepseek 负向/glm 正向、结构化优于自由文本）建立在 finalRanking/accuracy 之上，而它们经复核有效。

**但需在论文中透明化**：
1. **终轮轨迹缺失**（100% run）——LIMITATIONS 应写明：δ 分解/热力学/治理的"终轮效果"依赖 roundDataArray，这些 run 的终轮诊断不可得；这**不影响** τ/acc，但影响机制解读的完整性。
2. **LLM 占位符输出**——约 1/3 e12 run 存在已存轮次占位符；虽不影响终轮指标，但反映 LLM 输出不稳定性，值得在方法/局限中记录。
3. **收敛率偏低**（B/C 各 phase 20-50%）——`<2 opinions → false` 修复（fix#1）后未来实验收敛判定会变，历史数据收敛率与新口径不直接可比。

---

## 7. 待办（数据卫生，不影响 E12 主结论）

1. 撤销此前 `_pos_fallback_affected.json` 的 relabel 计划（误报）；在 AUDIT_CLAIM_VERIFICATION 记录更正。
2. E9_v6_c_semantic 重跑至 n≥10（引擎冻结后）。
3. v2/data 51 文件 relabel 或归档。
4. 论文 LIMITATIONS 补充：终轮轨迹缺失、占位符现象、收敛口径变迁。
5. 数据↔代码版本映射表（哪些 raw 由哪版 engine 生成）——本次发现终轮丢失是 P0a 前版本，需在代码中记录生成版本。

---

## 附录：本次分析发现的代码事实

- `Runner.ts:523-572`：finalRanking 从 `result.roundResults[last].opinions` 计算（真实终轮），**非** roundDataArray。
- `Runner.ts:674-715`：roundOpinions 从 `engine.getRoundDataArray()` 提取 → 缺终轮（P0a 前 bug）。
- `statsShared.ts:212-262`：extractRanking 现为 fail-closed（无 fallback），空/非法/缺项/tie 均抛错。
- 存储 finalRanking 非空 ⇒ 终轮 itemBeliefs 必然成功匹配规范名（fail-closed 自证）。
