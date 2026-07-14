# Limitations

> 本文件诚实记录 SwarmAlpha 的检测器局限、未验证模块、缺失集成和样本量问题。
> 更新日期: 2026-07-14

---

## 1. 实验样本量不足

| 实验 | 条件 | n/组 | 问题 |
|------|------|------|------|
| M&A (5轮) | none, full | 15 | 勉强可用，但 full vs none p=0.36 不显著 |
| M&A (5轮) | shuffle, single-intervention | 10 | 单干预模式 n=10，统计功效有限 |
| Invest (5轮) | none, full | 15 | 效应为零（两组 τ 完全相同 0.778 vs 0.778），无需功效论证 (d=+0.00) |
| Invest (5轮) | shuffle, single-intervention | 5 | **严重不足**，n=5 远低于统计显著性要求 |
| Invest (3轮) | none, full | 15 | p=0.152 中等效应 (d=+0.65) 但未达显著 |

- Invest none/full 条件 n=15 已达充分功效；shuffle/single-intervention 仍为 n=5，统计功效有限
- M&A 的 full vs none (p=0.36) 和所有单干预 (p>0.17) 均不显著
- 首个统计显著的治理效果：full_reflection 在 5轮 Invest 中显著有害 (p=0.048)
- M&A shuffle vs none (p=0.0009) 仍显著，但这是对照条件而非治理效果

## 2. 单模型验证

- 所有实验仅使用 DeepSeek-V3 (deepseek-chat)
- 未进行 GPT-4o、Claude 等跨模型验证
- 治理效果是否依赖特定模型未知

## 3. 自适应模块未实验验证

| 模块 | 代码状态 | 实验状态 |
|------|---------|---------|
| Adaptive Thresholds (`adaptiveThresholds.ts`) | ✅ 已实现 + 已接入 GovernanceRuntime | ❌ 未与固定阈值做对比实验 |
| Adaptive Dosage (`adaptiveDosage.ts`) | ✅ 已实现 + 已接入 GovernanceRuntime | ❌ 未与固定剂量做对比实验 |
| Cross-Examination Engine | ✅ 已实现 + 单元测试 | ❌ 未在批量实验中验证 |
| Dropout Sensitivity (`sensitivityTrace.ts`) | ✅ 已实现 | ❌ 仅为敏感性诊断，非因果识别；SUTVA 违反已在代码注释中标注 |

- 自适应开关 (`enableAdaptiveThresholds` / `enableAdaptiveDosage`) 已正确接入运行时配置
- 所有 165 次实验均使用固定阈值和固定剂量

## 4. 框架适配器

| 框架 | 适配器 | 状态 |
|------|--------|------|
| Custom (内置) | `CustomAdapter` | ✅ 完整集成，干预通过直接修改 agent 状态实现 |
| AutoGen | `AutoGenAdapter` | ⚠️ `applyIntervention` 抛出错误——需要 Python sidecar 实现 |
| CrewAI | — | ❌ 计划中，未实现 |
| LangGraph | — | ❌ 计划中，未实现 |

- AutoGenAdapter 的 `adaptMessages` 和 `extractBeliefs` 可用
- AutoGenAdapter 的 `applyIntervention` 明确抛出错误，不会静默失败

## 5. 检测器局限

| 检测器 | 已知局限 |
|--------|---------|
| Echo Chamber | 信息冗余度基于 Jaccard 相似度，可能误判深度推理重复为冗余 |
| Authority Bias | 使用引用网络份额而非消息数，但引用检测依赖 `referencedAgents` 字段的准确性 |
| Polarization | 已加入双峰系数 (bimodality coefficient) 避免误判均匀高方差，但阈值仍为启发式 |
| Premature Consensus | 收敛速度 + 共识度 + 离散度三条件启发式，未经实证校准 |

## 6. 评估权重

- 5 维度权重 (0.20/0.25/0.20/0.17/0.18) 为启发式设定，非数据驱动
- 等权稳健性检查已规划但未执行

## 7. 拓扑扩展

| 拓扑 | 状态 |
|------|------|
| FlatTopology (5 agents) | ✅ 所有 165 次实验均使用此拓扑 |
| GroupedTopology (40 agents) | 🔧 已实现 + 单元测试，未实验验证 |
| CommitteeTopology (500 agents) | 🔧 已实现 + 单元测试，未实验验证 |

## 8. 实验设计局限

- **仅 1 个 LLM 模型** (DeepSeek-V3)，无法排除模型特异性
- **仅 2 个任务** (M&A + Invest)，任务多样性不足
- **Invest none/full n=15，shuffle/single-intervention n=5**：none/full 已达充分功效，单干预模式仍不足
- **2×2 因子设计已完成**：3轮×5轮 × none×full，每格 n=15
- **full_reflection 显著有害**：在 5轮 Invest 中 p=0.048，是首个统计显著的治理效果
- **无预注册** (pre-registration)：实验假设和分析方法在数据收集后调整

## 9. 治理闭环验证

- `evaluateEffects` 已在 `processRound` 中调用，使用 `belief_diversity_change` 作为无偏效果指标
- 但该指标是否合理（多样性增加=改善）尚未经实证验证
- 治理闭环的反馈机制（上一轮效果影响下一轮检测）已实现但未实验验证

## 10. 2×2 因子设计结果

3轮×5轮 × none×full 的完整 2×2 因子设计（每格 n=15）已完成，结果如下：

| 轮数 | 条件对比 | n/组 | p值 | 效应量 d | 解读 |
|------|---------|------|-----|---------|------|
| 3轮 | Full vs None | 15 | 0.152 | +0.65 | 中等效应，方向性改善但未达显著 |
| 5轮 | Full vs None | 15 | 1.0 | +0.00 | 零效应，完全无效 |

- **3轮 Invest**：d=+0.65 中等效应，方向性改善，但 n=15 不足以达到统计显著 (p=0.152)
- **5轮 Invest**：d=+0.00 零效应，p=1.0 完全确认无效
- **模式解读**：3轮→5轮的效应衰减支持"边界条件"假设（治理仅在特定轮数下有效），但未达统计确认
- **功效分析**：要在 80% 功效下检测 d=0.65 的中等效应，需 n≈30+ 每格；当前 n=15 仅能检测大效应 (d≥0.8)

## 11. 认知缺陷修复（2026-07-12）

2026-07-12 诊断并修复了 4 个导致治理环路断裂的认知缺陷（commit 08b20fb）。这些缺陷意味着 **此前所有实验结论均在环路断裂状态下得出**，治理干预对 LLM 实际不可见，实验数据不可作为治理有效性的证据。

| # | 认知缺陷 | 修复方式 |
|---|---------|---------|
| 1 | 状态感知缺失：`buildPrompt` 未注入 agent 当前 belief/confidence，`reduce_weight`、`belief_perturbation`、`force_reflection` 三类状态修改干预对 LLM 不可见 | `buildPrompt` 注入 agent 当前 belief/confidence，状态修改干预对 LLM 可见 |
| 2 | 对话历史缺失：agent 看到的是结构化记忆摘要而非真实对话文本，无法基于真实上下文调整发言 | 接入真实对话历史，agent 可见真实对话文本 |
| 3 | 顺序发言断裂：后发言者无法基于前发言者内容调整，顺序发言逻辑未真正生效 | 修复顺序发言逻辑，后发言者可见前发言者内容 |
| 4 | 影响力网络断裂：影响力推断与实际说服路径脱节，治理干预无法沿影响力网络传导 | 修复影响力网络，治理干预可沿网络传导 |

> **关键提醒（2026-07-14 更新）**：4 个认知缺陷已于 2026-07-12 修复，并于 2026-07-14 在 Crisis 任务（45 次实验）上重新验证——治理环路现已闭合，full vs none 中等偏大正效应（d=0.84，τ 从 0.387 提升至 0.573）。此前 165 次历史实验（3轮 d=+0.65 不显著、5轮 d=+0.00、full_reflection p=0.048 等）均在断裂状态下得出，**结论存疑，仅作为历史对照保留**；Crisis 任务结果才是治理有效性的首份可靠证据。

## 12. 硬伤修复状态（2026-07-12）

截至 2026-07-12，硬伤清单（见 PROJECT_DEEP_ANALYSIS.md）中的 7 项已修复或审计，状态如下：

| 硬伤 | 状态 | 修复方式 |
|------|------|---------|
| H4 Kuramoto 序参量映射缺陷 | [已修复] | θ=πb → θ=πb/2，避免极端对立被判为高共识 |
| H6 convergenceSpeed 语义反转 | [已修复] | 注释纠正（公式方向正确） |
| H2 PARAMS.ablationModes 与注释不符 | [已修复] | 扩展为 7 种完整模式 |
| H20 标准差不统一 | [已审计] | 保留现状（描述用总体标准差、推断用样本标准差，语义一致） |
| H19 非确定性随机扰动 | [已修复] | mulberry32 seeded PRNG 替换 Math.random() |
| H17 缓存污染 bug | [已修复] | error 文件删除后重跑 |
| H18 interventionPrompt.ts 重构未完成 | [已修复] | 8 处统一接入 formatInterventionPrompt |

## 13. 仍存在的局限（未修复，留实验室）

以下硬伤截至 2026-07-12 尚未修复，留待实验室后续处理：

| 硬伤 | 简述 |
|------|------|
| H1 | 治理环路修复后实验未重跑（代码已闭合，149/149 测试通过，但实验数据未重跑） |
| H3 | 单任务实验（仅 Hidden Profile 投资任务，结论无法推广） |
| H5 | Cronbach's α 语义争议（轮次作为 item 测的不是个体一致性） |
| H7 | stripGovTag 正则 bug（非贪婪匹配残留 JSON 片段） |
| H8 | 8 种干预类型仅 4 种实现（break_connections 等无策略实现） |
| H9 | 交叉质证让步检测否定语境（"我不同意"被误判为让步） |
| H10 | 影响力图与影响力管理器不一致（reference 边与数值推断边共存） |
| H11 | Dropout SUTVA 违反（被丢弃 agent 意见仍合并回 opinions） |
| H12 | onMessage 死代码（无检测/干预逻辑） |
| H13 | StateInferenceBridge 静默成功（无回调仍返回 true） |
| H14 | 双轨干预无同步（引擎内模拟与外部应用无同步机制） |
| H15 | 交叉质证阵营统一移位（同阵营成员应用相同 shift） |
| H16 | Gini 衡量发言数量而非影响力（高置信度 ≠ 高影响力） |
| H21 | T 分布表稀疏（缺 11/13/16-18 等值，依赖线性插值） |
| H22 | seed 可复现性局限（DeepSeek/OpenAI best-effort，Anthropic 不支持） |

---

## 14. 治理环路修复后验证（2026-07-14）

2026-07-14 在 Crisis 任务上完成 45 次实验（none/full/shuffle × 15），验证治理环路修复后的有效性：

| 模式 | τ（μ±σ） | Q（μ±σ） | Cohen's d vs none |
|------|---------|---------|-------------------|
| none | 0.387 ± 0.160 | 69.3 ± 8.0 | — |
| full | 0.573 ± 0.271 | 78.7 ± 13.6 | **0.84** |
| shuffle | 0.760 ± 0.241 | 88.0 ± 12.1 | **1.82** |

**结论**：治理环路修复后，full vs none 呈中等偏大正效应（d=0.84），τ 提升 48%。shuffle 仍最强（d=1.82）。这是治理有效性的首份可靠证据。

**仍存在的局限**：
- 仅单一任务类型（Crisis 危机响应），任务多样性不足
- 仅 n=15/cell，统计效力仍有限（d=0.84 在 n=15 下仍未达 p<0.05 显著）
- 仍仅 DeepSeek-V3 单模型验证
- 165 次历史实验结论仍存疑，仅作为断裂环路下的对照保留

## 15. 干预优化已落地为默认配置（2026-07-14）

基于 Crisis 任务 68 次干预的成本效益分析，以下优化已写入代码默认配置：

| 优化项 | 实现位置 | 状态 |
|--------|---------|------|
| 默认禁用 `introduce_diversity` + `continue_discussion` | [src/lib/governance/index.ts:188](src/lib/governance/index.ts) `disabledInterventions` | ✅ 已落地 |
| 最后一轮不触发任何干预 | [src/lib/governance/index.ts:684-687](src/lib/governance/index.ts) `isLastRound` 拦截 | ✅ 已落地 |
| 真实 Token 追踪（替代估算） | [experiments/v2/run.ts:103-107](experiments/v2/run.ts) `tokenUsage` 字段 | ✅ 已落地 |
| 干预类型可配置开关 | [src/lib/governance/types.ts:153-155](src/lib/governance/types.ts) `disabledInterventions` 配置项 | ✅ 已落地 |

> **含义**：Crisis 实验分析中的"优化方案"（停用有害干预 + 第3轮停止干预，可节省 66.0% 成本）现已成为默认行为。新实验默认不触发 `introduce_diversity` 和 `continue_discussion`，且最后一轮自动停止干预。如需启用，传 `disabledInterventions: []`。

## 16. 历史实验数据的定位（2026-07-14 更新）

165 次历史实验（Invest + M&A）与 45 次 Crisis 实验的定位差异：

| 数据集 | 环路状态 | 可信度 | 用途 |
|--------|---------|--------|------|
| Crisis（45 次，2026-07-14） | 环路闭合 | ✅ 可信 | 治理有效性的主要证据 |
| 历史数据（165 次，2026-07-13 及更早） | 环路断裂 | ⚠️ 存疑 | 断裂环路下的对照，仅作历史参考 |

- 历史数据中的因果效应估计（M&A 5轮 +0.135，d=0.96）受 state-modification 类干预未到达 agent 感知影响，效应可能被低估
- 历史数据中的 `full_reflection p=0.048 显著有害` 结论需在闭合环路下重新验证——Crisis 任务中 force_reflection 有效率达 81.8%（22 次干预 18 次有效），方向已逆转

## 17. 贝叶斯重分析的局限（2026-07-14）

对 Crisis 数据（n=15/cell）的贝叶斯重分析（详见 [BAYESIAN_ANALYSIS.md](BAYESIAN_ANALYSIS.md)）存在以下局限：

| 局限 | 说明 | 影响 |
|------|------|------|
| **HDI 下界略低于 0** | Full vs None 的 95% HDI = [-0.04, 1.13]，下界 -0.03 | 治理有效的后验概率 96.7%，但未达"确定性确证" |
| **似然为正态近似** | Cohen's d 的抽样分布用 N(d, σ_d) 近似 | n=15 下近似合理但非精确，更严格应使用非中心 t 分布 |
| **多重比较保守性** | Bonferroni 校正后 Full vs None p=0.110 不显著 | 频率派与贝叶斯结论存在张力——贝叶斯支持有效，频率派校正后不支持 |
| **先验敏感性** | Full vs None 在怀疑先验 N(0,0.2) 下 P(d>0) 降至 86.5% | 结论对先验有一定敏感性，小样本下预期 |
| **不能替代扩样** | 贝叶斯分析降低了扩样紧迫性但未消除不确定性 | 扩样至 n=30 仍是确认结论的必要步骤 |

**关键边界**：
- ✅ 可报告："贝叶斯后验 P(d>0)=96.7%，结合频率派 p=0.037，证据方向一致指向治理有效"
- ❌ 不可报告："治理效应已被统计确认"——HDI 下界略低于 0
- ❌ 不可报告："贝叶斯证明治理有效"——应说"后验概率支持"

## 18. 跨任务验证的局限（2026-07-14）

新增 Supplier 任务（44 次实验）用于跨任务验证，但仍存在以下局限：

| 局限 | 说明 | 影响 |
|------|------|------|
| **单模型未变** | 仍仅 DeepSeek-V3，跨模型验证缺失 | 无法排除模型特异性 |
| **任务类型相近** | Supplier 与 Crisis 同为"5 选 1 排序"任务 | 跨任务结论限于排序型任务 |
| **Supplier p=0.15 未达显著** | full vs none d=0.55, p=0.15 | 方向一致但统计未确认 |
| **Shuffle 模式结果不同** | Supplier shuffle τ=0.67 < none τ=0.68 | 说明 shuffle 对照有效性受任务难度影响 |
| **样本量未增加** | 每个任务仍 n=15/cell | 统计效力仍偏低 |

**跨任务结论的边界**：
- ✅ 可报告："核心发现（治理方向、虚假共识）在 2 个任务间方向一致"
- ❌ 不可报告："结论已跨任务确认"——仅 2 个任务且 Supplier 单任务 p>0.05
- ❌ 不可报告："结论普适于所有 LLM multi-agent 场景"——仍需更多任务/模型验证

**仍需做的验证**：
1. 第 3 个完全不同类型的任务（分类/资源分配型）
2. 跨模型验证（GPT-4o-mini、Claude Haiku）
3. Supplier 任务扩样至 n=30/cell 确认 p<0.05

---

## §19 全链路代码审计与修复（2026-07-14）

### 已修复的问题

| 问题 | 严重度 | 修复 |
|------|--------|------|
| `bayesianAnalysis.ts` 头部注释仍写 "Half-Normal" | 文档不一致 | 改为 "Normal(0, scale)" |
| 贝叶斯似然函数遗漏 d²/(2(n1+n2)) 项 | 统计学近似偏窄（SE 低估 6-13%） | 加入 Hedges & Olkin (1985) 修正项 |
| `governance/index.ts` 检测方法报告 `applied=true` 但实际被 `disabledInterventions` 跳过 | 行为误导 | 新增 `isInterventionDisabled()` 检查，禁用的干预显示 `applied=false` |
| `sensitivity.ts` Kendall τ tie 修正公式 BUG（t=2 时完全失效） | 统计错误 | 改为按组统计 (Map) + 每组 count*(count+1)/2 |
| `lunar_survival/analyze.ts` Bootstrap 使用 `Math.random()` | 不可复现 | 改为 `mulberry32(42)` 种子化 |
| 5 处关键路径裸 `JSON.parse`（discussion, llm, pipeline, PromptInjector, StateInferenceBridge） | LLM 输出解析可能崩溃 | 统一迁移到 `safeJsonParse`（含 code fence 剥离 + regex 提取） |
| 3 处 `cohensD` 副本缺 `n<2` guard | 小样本下 NaN/Infinity | 补加 guard |

### 已知但未修复的问题（文档记录）

| 问题 | 严重度 | 未修复原因 | 影响 |
|------|--------|-----------|------|
| `mulberry32` PRNG 复制 11 份 | 中 | 纯代码重复，不影响正确性 | 维护负担 |
| `cohensD`/`mean`/`std` 在 5-9 个实验脚本中重复 | 中 | 同上 | 同上 |
| `statsUtils.ts` 7 个函数生产零调用 | 低 | 重构未完成 | 死代码 |
| `security/validation.ts` 全部用 `any` | 中 | 非竞赛数据路径 | 安全模块类型保护缺失 |
| `ExperimentResult` 接口在 9 个脚本中重复定义 | 低 | 实验脚本类型不一致 | 无运行时影响 |
| `InterventionType` 是闭合联合类型 | 低 | 架构限制 | 新增干预类型需改类型定义 |
| 自定义检测器无法触发干预（`diagnoseAndIntervene` 硬编码 4 个 if） | 中 | 架构限制 | 检测器-干预联动断裂 |
| `bayesianAnalysis.ts` Welch p 值用正态近似而非 t 分布 | 低 | n=15 下偏差小 | p 值略偏激进 |
| BH FDR 实现为逐个比较而非标准 step-down | 低 | 当前 p 值分布下结果一致 | 可能略偏保守/激进 |
| `dataPackage.ts` 使用 τ-a 而非 τ-b | 中 | 历史脚本，结果未被竞赛文档引用 | 若混用数据不可比 |
| `interventionAnalysis.ts:230` 硬编码 agent ID 列表 | 低 | 仅适配 Crisis 配置 | 无法自动适配其他实验 |
| `analyzeSupplier.ts` 是 `analyzeSupplierFull.ts` 的冗余前身 | 低 | 冗余脚本 | 维护混乱 |
