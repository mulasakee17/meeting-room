# SwarmAlpha 单一真相源（Single Source of Truth）

> **所有文档引用数字时，必须以本文件为准。**
>
> 更新规则：当代码或实验数据变化时，先更新本文件，再更新引用文档。
> 最后更新：2026-07-31（基于代码实跑 + 文件计数 + v6 Phase 2.5-2.8 完成 + Pilot A/B 对照 + SemanticTool 审计日志补齐 + P0 统计 bug 修复 + 低风险代码清理）

---

## 1. 工程指标

| 指标 | 数值 | 验证方法 | 备注 |
|------|------|---------|------|
| 测试数 | **630 passed, 3 skipped** | `npx vitest run` | 2026-07-31 实跑确认（28 文件） |
| 测试文件数 | **28** | `npx vitest run` | |
| tsc 类型错误 | **0** | `npx tsc --noEmit` | 2026-07-30 Phase 2.8 清零 |
| 核心代码行数 | **~22,800 行**（src/） | `Get-ChildItem src -Recurse *.ts` | 不含 test/ 和 experiments/ |
| TypeScript 文件数 | **77**（src/） | 文件计数 | |
| 技术栈 | TypeScript + DeepSeek API + Vitest | | |

**注意**：不再使用"19,500 行"或"34,000 行"的过时数字。如需引用代码规模，明确标注范围（src/ / 含测试 / 含实验脚本）。

---

## 1.1 v6 Phase 2 完成状态（2026-07-30）

| Phase | 完成日期 | 核心交付 | 状态 |
|-------|---------|---------|------|
| Phase 2.5 | 2026-07-30 | evidence shared 检测（Layer 1 子串+Levenshtein + Layer 2 SemanticTool evidence_dedup）+ 异步路径接入（useSemanticTool 开关） | ✅ |
| Phase 2.6 | 2026-07-30 | 4 处反幻觉修复（δ_no_response 门控、polarization/diversity/robustness/calibration 公式独立化、E7 belief 检测器、Granger 按 (run,agent) 分组） | ✅ |
| Phase 2.7 | 2026-07-30 | 5 处数学 bug 修复（M1 Granger FWL、M2 Bimodality Ellison 1987、M3 t 分布 df=1-30、M4 β>1.0 越界、M5 dead code） | ✅ |
| Phase 2.8 | 2026-07-30 | 15 tsc 类型错误清零 + 4 项实验配置差距闭合（task_university、E9 4 组、maxRounds=5、Runner useSemanticTool） | ✅ |
| **关键 Bug 修复** | 2026-07-30 | **δ→干预类型映射断裂修复**：δ issues type（δ_1d_mask 等）与 generateCognitiveInterventions switch case 不匹配导致 0 干预；修复后 14 干预正常生成 | ✅ |
| **数据记录 Bug 修复** | 2026-07-30 | Runner.ts interventions 只保存 round/type，丢失 targetAgents/effect/applied/parameters；修复后保存完整 Intervention 对象 | ✅ |
| **SemanticTool 审计日志** | 2026-07-30 | MeasurementLayer 记录 evidence_dedup/gap_analysis 完整审计，Runner 保存到 RawRunData.semanticAuditLog | ✅ |

---

## 2. 实验数据指标

| 指标 | 数值 | 验证方法 | 备注 |
|------|------|---------|------|
| 实验文件总数 | **573 JSON**（v2:487 + lunar:85 + .claude:1） | 文件计数 | 含已弃用的 lunar_survival |
| 论文有效数据 | **169 closed-loop runs** | Crisis 80 + Supplier 89 | D1-D4 缺陷修复后的数据 |
| broken-loop 数据 | **318 个** | 573 - 169 - 85 = 319（含 .claude:1） | 仅作 provenance，不作 claim 依据 |
| E9 smoke test | **6 runs**（3 seeds × 2 modes） | e9_smoke_test.ts | v2.0 历史 + v2.1 当前 |
| **v6 Pilot A/B** | **2 runs**（A 组 1 + B 组 1, seed=42） | pilot_v6.ts | 2026-07-30，单次验证，无统计显著性 |
| **v6 Phase 3 计划** | **200 runs**（4 组 × 50 runs） | E9_V6_A/B/C/D | 未开始，待 Pilot 验证通过 |

### 2.1 Crisis 任务分组（n=80）

| 组 | 文件数 | 验证方法 | 备注 |
|----|--------|---------|------|
| none | 24 | `Get-ChildItem data_crisis\crisis_none_*.json` | 基线 |
| full | 32 | `Get-ChildItem data_crisis\crisis_full_*.json` | 含 8 个 fixed 文件 |
| shuffle | 24 | `Get-ChildItem data_crisis\crisis_shuffle_*.json` | |

**注意**：full 组 n=32（含 8 个 crisis_full_fixed_*），论文若用 n=24/cell 需说明 ablation 过滤逻辑。

### 2.2 Supplier 任务分组（n=89）

| 组 | 文件数 | 验证方法 | 备注 |
|----|--------|---------|------|
| none | 30 | `Get-ChildItem data_supplier\supplier_none_*.json` | 基线 |
| full | 30 | `Get-ChildItem data_supplier\supplier_full_*.json` | |
| shuffle | 29 | `Get-ChildItem data_supplier\supplier_shuffle_*.json` | 1 个 API 崩溃 |

### 2.3 数据字段完整性声明（2026-07-28 子代理审计）

**审计方法**：对 data_crisis/ 和 data_supplier/ 全目录执行 grep "itemBeliefs" + 读取 5 个样本文件验证结构。

**审计结论**：

| 字段 | data_crisis (80 files) | data_supplier (89 files) | data_fraud 系列 |
|---|---|---|---|
| scalar `beliefs` (per-round per-agent) | ✅ 全部存在 | ✅ 全部存在 | ✅ |
| `itemBeliefs` (per-item preference array) | ❌ **0% 文件** | ❌ **0% 文件** | ✅ 存在 |
| per-round per-agent 结构化 LLM 输出 | ❌ 仅 finalDecision 字符串 | ❌ 同左 | ✅ |
| `interactionGraph` | ✅ 最终图 | ✅ 最终图 | ✅ |
| `groundTruth` / `extractedRanking` | ✅ | ✅ | ✅ |

**影响**：
1. **向量层（utility 向量）验证无法基于 169 runs posthoc 进行**——需新实验持久化 itemBeliefs
2. **主客观承诺偏差 δ=|b-ι| 可算**（b 已有，ι 代码已实现），是阶段 1 零成本验证目标
3. **posthoc FJ α 反推可算**（用 round-1 belief 作 b(0)，最终图权重近似 b_group），是探索性分析

**历史错误声明修正**：LIMITATIONS.md §27.2 原称"169 runs 数据已有 itemBeliefs 字段"——**已证伪并修正**。

### 2.4 v6 实验矩阵（Phase 3 计划，2026-07-30）

| 组 | 配置 ID | governanceMode | useSemanticTool | 治理路径 | runs |
|----|---------|---------------|-----------------|---------|------|
| **A** | E9_V6_A_NONE | none | false | 无治理（基线） | 50 |
| **B** | E9_V6_B_DELTA | cognitive | false | δ 同步诊断 + 认知干预 | 50 |
| **C** | E9_V6_C_SEMANTIC | cognitive | true | δ + SemanticTool 异步（Tier 1→2→3） | 50 |
| **D** | E9_V6_D_OLD | full | false | 旧检测器（4 经典 + 3 FC2） | 50 |

**任务**：task_university.ts（8 大学 × 6 维度 hidden-profile）
**maxRounds**：5
**seeds**：42, 43, 44, 45, 46（每 seed 10 runs）
**总计**：4 组 × 50 runs = 200 runs

### 2.5 v6 Pilot A/B 对照结果（2026-07-30，单次验证）

> ⚠️ **单 seed 单 run，无统计显著性，仅用于验证链路通畅性。**
>
> **⚠️ 更正（2026-08-01 重跑后）**：
> - 原记录 **0.786/+0.215 是 7/30 旧代码版本**的 Pilot 结果；当前代码（8/1）B 组重跑实测 **τ=0.643、5 轮、16 干预、δ 诊断正常**（polarization/oneDMask 触发），Δτ=+0.071（vs A 组 0.571）。
> - 早期磁盘 B 组文件曾异常（totalRounds=2、interventions=0，疑似运行中断），已于 8/1 重跑替换为健康数据。
> - **Pilot 单次（seed 42）不作为统计证据**，待 E9 Phase 3 全量（200 runs）确认。
> - 下表 Token/耗时/R 趋势仍为 7/30 旧版本记录，与当前运行不一致，以重跑数据为准。

| 指标 | A 组（无治理） | B 组（δ 治理） | Δ(B-A) |
|------|---------------|---------------|--------|
| τ | 0.571 | 0.643 | +0.071 |
| 干预次数 | 0（预期） | 16（8/1 重跑实测） | - |
| δ 触发率 | 45%（18/40） | 40%（16/40） | -5% |
| RTHF R 趋势 | 0.669→0.967→0.724 | 0.561→0.903→0.728 | - |
| Token | 96K | 121K | +26% |
| 耗时 | 238s | 362s | +52% |

**关键发现**：
1. **δ→干预链路打通**：修复前 0 干预，修复后 16 干预正常生成（8/1 重跑确认）
2. **B 组 τ 高于 A 组**：Δτ=+0.071，但单次实验不能下结论
3. **干预打断过早收敛**：A 组 R4 飙到 0.967（假收敛），B 组干预后 R4 降到 0.729（保持讨论活跃）
4. **τ 偏高（天花板风险）**：university 任务后 4 名排序容易，前 4 名信息交叉多

---

## 3. 核心统计数字

### 3.1 效应量（Cohen's d）

| 比较 | d 值 | n/cell | p 值 | 来源脚本 | 备注 |
|------|------|--------|------|---------|------|
| Crisis full vs none | **d=0.92** | 24 | p=0.0038 | analyzeSupplierFull.ts（PERMUTATION_SEED=42, nPerm=10000） | 主证据；powerAnalysis.ts 同 d=0.921 功效 88% |
| Crisis shuffle vs none | **d=1.44** | 24 | p=0.0001 | verifyFindings.ts（已修复硬编码，PERMUTATION_SEED=42） | 最强证据；powerAnalysis.ts 同 d=1.439 功效 99.9% |
| Supplier full vs none | **d=0.47** | 30 | p=0.086 | analyzeSupplierFull.ts | 不显著，underpowered (43%) |
| Supplier shuffle vs none | **d=0.085** | 29 | p=0.78 | analyzeSupplierFull.ts | 天花板效应 |

**历史 bug 已修复**：verifyFindings.ts:219 注释确认 "P0-B1 修复：计算实际的 Cohen's d 和置换检验 p 值（替代原硬编码 d=1.82, p=0.0002）"。d=1.82 是历史硬编码，已不存在。

**脚本可复现性声明**（2026-07-26 实跑确认）：
- `npx tsx experiments/v2/powerAnalysis.ts` → Crisis full vs none d=0.921 功效 88%；Crisis shuffle vs none d=1.439 功效 99.9%
- `npx tsx experiments/v2/verifyFindings.ts` → Crisis shuffle vs none d=1.44, p=0.0001（n=24/cell, ablation 过滤）
- `npx tsx experiments/v2/analyzeSupplierFull.ts` → Crisis full vs none d=0.921, p=0.0038；Supplier full vs none d=0.470, p=0.0860；Supplier shuffle vs none d=0.085, p=0.7817

### 3.2 共识-质量相关

**双口径声明**（2026-07-26 recalc_consensus_corr.ts 实跑确认）：

| 口径 | 任务 | r | p | n | 显著性 | 来源 |
|------|------|---|---|---|--------|------|
| **主分析（含 full_fixed）** | 跨任务全样本 | **r=-0.0988** | **p=0.2004** | **169** | **不显著** | recalc_consensus_corr.ts §6 |
| 主分析（含 full_fixed） | Crisis 子集 | r=-0.0491 | p=0.6644 | 80 | 不显著 | 同上 |
| 主分析（含 full_fixed） | Supplier 子集 | r=-0.0291 | p=0.7844 | 89 | 不显著 | 同上 |
| 备选（排除 full_fixed） | 跨任务全样本 | r=-0.1332 | p=0.0935 | 161 | 不显著 | recalc_consensus_corr.ts §3 |
| 备选（排除 full_fixed） | Crisis 子集 | r=-0.1089 | p=0.3650 | 72 | 不显著 | 同上 |

**论文采用口径**：主分析 N=169（含 full_fixed），r=-0.10, p=0.20 不显著——与 verifyFindings.ts（Crisis only, n=72, r=-0.109, p=0.365）方向一致。

**诚实标注**：r=-0.10 数字真实，但 p=0.20 远不显著。论文中必须标注 "(p=0.20, not significant)"，不应作为"发现"呈现，应降级为"探索性观察"。两个口径方向一致（均为弱负相关且不显著），但数值有差异，论文引用时必须明确标注 N 与口径选择。

### 3.3 干预效果（E9 smoke test）

| 干预策略 | Δτ | 来源 | 备注 |
|---------|-----|------|------|
| v2.0 破坏性（reduce_weight + force_reflection） | **Δτ=-0.267** | 历史 smoke test | 脚本已更新为 v2.1，此数字来自历史运行 |
| v2.1 非破坏性（inject_evidence + rebalance_attention） | **Δτ=0.000**（当前实测） | e9_smoke_supplier/ 6 个 JSON | N=6（3 seeds × 2 modes），2026-07-25 重跑后 none=cognitive=0.733±0.306/0.116 |

**学术诚信声明**：早期文档曾引用 Δτ=+0.533，但 2026-07-25 重跑后实测 Δτ=0.000（none 组 0.733±0.306 vs cognitive 组 0.733±0.116，两组均值相同）。+0.533 为历史值，当前数据不支持。v2.1 非破坏性干预的有效性需正式实验（N≥30）验证，当前 smoke test 仅有 N=6，功效不足且 Supplier 任务存在天花板效应。

### 3.4 τ 均值（主证据）

| 任务 | 组 | τ ± σ | Q |
|------|-----|--------|---|
| Crisis | none | 0.408 ± 0.182 | 72.2 |
| Crisis | full | 0.617 ± 0.263 | 81.1 |
| Crisis | shuffle | 0.717 ± 0.243 | 85.6 |
| Supplier | none | 0.680 ± 0.186 | 82.0 |
| Supplier | full | 0.767 ± 0.183 | 91.0 |
| Supplier | shuffle | 0.697 ± 0.204 | 84.0 |

### 3.5 跨模型验证（2026-07-26 analyze_cross_model_qwen.ts 实跑）

**Section A: Fraud C 组三模型对比**（n=10/模型，配对按 runIndex）

| 模型 | τ 均值 ± σ | τ=1.0 | τ≥0.8 | 发言数 |
|------|------------|-------|-------|--------|
| DeepSeek-V3 | 0.640 ± 0.196 | 1/10 | 4/10 | 18.6 |
| Zhipu glm-4-flash | 0.680 ± 0.240 | 3/10 | 4/10 | 35.4 |
| Qwen | 0.460 ± 0.269 | 0/10 | 2/10 | 23.0 |

两两配对检验（n=10，d_z + 95%CI + p）：
- Zhipu vs DeepSeek: Δτ=+0.040, d_z=0.098, p=0.8607 ⚪不显著
- Qwen vs DeepSeek: Δτ=-0.180, d_z=-0.591, p=0.1464 ⚪不显著
- Qwen vs Zhipu: Δτ=-0.220, d_z=-0.463, p=0.2007 ⚪不显著

**Section B: Crisis 任务两模型三组对比**（治理效应跨模型验证）

| 组 | DeepSeek τ (n=24) | Qwen τ (n=10) | Δτ (Qwen-DS) | 配对 p |
|----|-------------------|---------------|--------------|--------|
| none | 0.408 ± 0.178 | 0.620 ± 0.166 | +0.212 | **p=0.0323 ✅显著** |
| full | 0.617 ± 0.258 | 0.600 ± 0.200 | -0.017 | p=0.9611 ⚪ |
| shuffle | 0.717 ± 0.237 | 0.720 ± 0.299 | +0.003 | p=0.5270 ⚪ |

**核心发现 F16（跨模型治理效应方向不一致——⚠️降级：代码版本混淆未控制）**：
- DeepSeek 治理效应（full-none）= +0.208（2026-07-14 旧代码，无 codeVersion）
- Qwen 治理效应（full-none）= -0.020（2026-07-22 新代码，codeVersion="2026-07-19"）
- **代码版本是混淆变量**：consensusLevel 公式不同（旧 1-2·std vs 新 Kuramoto R）、检测器行为不同（DS 触发 polarization+echo_chamber，Qwen 触发 premature_consensus）、干预次数不同（5 vs 1）
- **方向不一致无法归因于模型差异**——这是"跨模型 × 跨代码版本"对比，非严格跨模型验证
- shuffle 效应方向跨模型一致（DS +0.308, Qwen +0.100），但同样受代码版本混淆

**含义（已重新定性）**：F16 降级为探索性观察（★★☆☆☆）。主证据 d=0.92 是单模型结论，不受此混淆影响。控制实验需求：同代码版本重跑 DeepSeek 基线 + Qwen 扩样到 n=24。详见 LIMITATIONS.md F16 节。

---

## 4. 系统能力指标

| 指标 | 数值 | 来源 | 备注 |
|------|------|------|------|
| 检测器数 | **10 个**（4 经典 + 3 MAST FC2 + 3 MAST FC1/FC3） | src/lib/governance/{cognitiveDetectors,systemDesignDetectors,taskVerificationDetectors}.ts | 经典: echo chamber, authority bias, polarization, premature consensus; FC2: information withholding, ignored input, reasoning-action mismatch; FC1/FC3: role violation (FM-1.2), step repetition (FM-1.3), premature termination (FM-3.1) |
| 干预策略 | **3 active + 4 deprecated** | src/lib/governance/cognitiveInterventions.ts | active: inject_evidence, rebalance_attention, shuffle_knowledge; deprecated: reduce_weight, force_reflection, introduce_diversity, continue_discussion |
| 治理模式 | 5 种 | RuntimeConfig.governanceMode | none, detect-only, random-intervene, full, cognitive |
| 认知状态维度 | 5 维 | AgentCognitiveState | Utility, Evidence, Inertia, Confidence, Susceptibility |
| 热力学变量 | 4 个 | ThermoState | R, T, H, F |
| 框架适配器 | 3 个 | AdapterRegistry | CustomAdapter, AutoGenAdapter, StateInferenceBridge |

---

## 5. 统一叙事口径

### 5.1 项目定位（所有文档一致使用）

> SwarmAlpha 是一个 LLM 多智能体认知治理研究平台。核心贡献是将社会热力学从描述性理论工程化为运行时诊断信号，并实证发现"干预策略选择决定治理成败"——v2.0 破坏性干预使效果 Δτ=-0.267，v2.1 非破坏性干预在当前 smoke test（N=6）中 Δτ=0.000，需正式实验验证。测量框架已验证，治理干预策略正在扩展验证中。

### 5.2 不再使用的叙事

- ❌ "第一个开源多智能体认知治理运行时"（未开源，无人用）
- ❌ "34,000 行代码"（实际 ~22,800 src/）
- ❌ "19,500 行代码"（实际 ~22,800 src/，2026-07-30 更新）
- ❌ "640+ 实验"（实际 573，有效 169）
- ❌ "4 detectors + 4 interventions"（实际 7 + 3/4）
- ❌ "310/334/390/470/543 测试"（实际 630 passed, 3 skipped，2026-07-31 实跑）
- ❌ "False consensus 发现"（r=-0.10, p=0.20 不显著，降级为"探索性观察"）

### 5.3 F 的诚实定位

> **v6 新公式（当前主线，MeasurementLayer）**：F = U − T·H（Helmholtz 形式）。U = 平均效用强度（L2 范数，每维已 clamp 到 [−1,1]，除以 √K 归一化），T = utility 逐轮 L2 波动，H = evidence supports 分布 Shannon 熵。三变量来自不同信息源（总能量 / 时序 / 分布），已实证解耦（r(U, T·H) = −0.274，见 [THEORY.md §0.1 验证 3](research/THEORY.md)），修复了旧公式的双重计数问题。**实现：`src/lib/thermodynamics/MeasurementLayer.ts:245-273`。**

> **旧公式（已废弃/证伪）**：F = (1−R) + T·H 是工程上有用的启发式综合诊断指标，不是严格的热力学自由能。r((1-R), T·H) = 0.9175 证伪了"两分量正交"声明（R/T/H 同源自 scalar beliefs[]，数学上必然强相关）。**此公式仅存在于 asyncEngine 路径（已 @deprecated），仅供溯源，不再用于 v6 主线。**

### 5.4 理论框架声明（2026-07-28，v0.4）

> **belief 本体**：v0.4 将 `belief ∈ [-1,1]` 重定义为**承诺度**（Commitment Strength）——agent 对当前 top 选项的执着强度。这是语义重解释，不改变 169 runs 的数据值。
>
> **更新规则**：从 DeGroot 升级为 Friedkin-Johnsen（FJ）：`b(t+1) = α·b_group(t) + (1-α)·b(0)`。当前代码实现仍是 DeGroot（`asyncEngine.ts:462`, `LEARNING_RATE=0.15`），FJ 升级需 ~25 行代码变更 + 实验重跑。
>
> **新变量**：主客观承诺偏差 `δ = ||b| - ι|`（|b| = 承诺强度绝对值，ι = Inertia 客观承诺强度）。δ 度量 LLM 自报承诺与客观角色/证据基础的偏差。
>
> **R/T/H 重解释**：不再称"3 维热力学状态空间"，改为"承诺失序度的 3 个同源投影"。F 改称"承诺失序度加权和"。
>
> **阶段 1 验证结果**（2026-07-28）：
> - **H2-δ 强支持**（fraud malicious, n=551）：恶意 agent δ=0.580 vs 诚实 δ=0.222, **d=2.18, p<0.0001**
> - **H3-FJ 支持**（fraud 38 enriched）：行为 FJ 拟合 α_mean=**0.80**, 44% 在 [0.5, 0.9]
> - **H4-vec 强支持**（fraud 38 enriched）：r(|u|_max, |scalar_b|)=**0.754**, p<0.0001
> - **H4-δ 方向相反**（fraud）：r(δ, τ)=0.262, p=0.11（正向，非预期负向）
> - **H1-δ 不支持**（169 sync runs）：r=0.013, p=0.89——但 ι_role 近似太粗糙（8/10 agent ι=0.40）
>
> **详见**：[THEORY.md v0.4 §10](research/THEORY.md)、[LIMITATIONS.md §27.1/§28.1](paper/LIMITATIONS.md)

**2026-07-28 实证补充**：对 N=259 样本（8 个数据源）计算 r((1-R), T·H) = **0.9175**（p < 10⁻⁶），证伪了此前文档中"F 公式两分量正交"的声明。根因：asyncEngine.ts 的 R/T/H 都源自同一组 scalar `beliefs[]`，是"同轮内 agent 间信念分散度"的不同变换，数学上必然强相关。回归显示 F ≈ 0.019 + 2.014·(1-R)（R²=0.955），F 几乎是 (1-R) 的线性变换。

**影响**（针对旧 asyncEngine 路径的 F）：
1. 旧 F 公式存在双重计数风险，"3 维热力学状态空间"叙事不成立（R/T/H 退化为 1 个有效维度）
2. F 分解排序在 A/B 对照实验中已被证伪（d_z=-0.354，详见 LIMITATIONS.md §21）
3. TerminationDecider 的淬火态检测仍然有效（依赖 T/H 的相对变化而非绝对值独立性）
4. R/T/H 强耦合本身作为"MAS 小群体与物理系统本质差异"的负面发现呈现
5. **v6 已修复**：新 MeasurementLayer 路径的 R/T/H/F 基于认知状态向量重写，F = U − T·H，三变量解耦（r = −0.274），双重计数问题不再适用（详见 §5.3 与 THEORY.md §0.1 验证 3）

详见：LIMITATIONS.md §27.1、TECHNICAL_REPORT.md §3.1 修订说明、PAPER_DRAFT.md §3.2 修订说明、`experiments/v2/analyze_thermo_correlation.ts`

---

## 6. 文档结构（14 个活跃文档 + 归档）

```
docs/
├── SOT.md                          ← 本文件（单一真相源）
├── INTEGRATION.md                  ← 集成指南
├── GOVERNANCE_DESIGN.md            ← 治理引擎设计 ADR
├── COLLABORATION_GUIDE.md          ← 协作者指南（面向新成员）
├── PITCH.html/pdf/png              ← 项目展示（3 格式）
├── architecture/
│   ├── ARCHITECTURE.md             ← 核心架构文档
│   ├── AGENT_SIMULATION.md         ← Agent 内部机制深入
│   └── AGENT_SOCIETY_VISION.md     ← 长期愿景
├── research/
│   ├── THEORY.md                   ← 理论分析
│   └── EXPERIMENT_DESIGN.md        ← 实验设计
├── paper/
│   ├── PAPER_DRAFT.md              ← 英文论文稿（投稿版）
│   ├── PAPER_PROFESSOR_VERSION.md  ← 中文论文稿（沟通版）
│   └── LIMITATIONS.md              ← 局限性 + 历史修复记录
├── roadmap/
│   └── future.md                   ← 未来路线图
└── archive/                        ← 归档文档（不删除，仅作 provenance）
    ├── architecture/ (3 个)
    ├── audits/ (4 个，含 data_mining_report.md)
    ├── paper/ (1 个：TECHNICAL_REPORT.md)
    ├── research/ (4 个)
    └── roadmap/ (5 个)
```

根目录：
- `README.md`（英文入口）
- `README_CN.md`（中文入口，与 README 同步）
