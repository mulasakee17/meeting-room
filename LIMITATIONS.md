# Limitations

> 本文件诚实记录 SwarmAlpha 的检测器局限、未验证模块、缺失集成和样本量问题。
> 更新日期: 2026-07-15（硬伤修复 + F 分解排序）

---

## 1. 实验样本量

### 闭合环路实验（扩样后，主要证据）

| 实验 | 条件 | n/组 | 功效 | 状态 |
|------|------|------|------|------|
| Crisis (3轮) | none, full, shuffle | 24 | 88%（full vs none） | ✅ 统计充分 |
| Supplier (3轮) | none, full | 30 | 43%（full vs none） | ⚠️ 功效不足，需 n=72 达 80% |
| Supplier (3轮) | shuffle | 29 | 6%（shuffle vs none） | ❌ shuffle 在 Supplier 无效应 |

### 历史实验（断裂环路，仅作对照）

| 实验 | 条件 | n/组 | 问题 |
|------|------|------|------|
| M&A (5轮) | none, full | 15 | p=0.36 不显著（断裂环路下） |
| M&A (5轮) | shuffle, single-intervention | 10 | 单干预模式 n=10，统计功效有限 |
| Invest (5轮) | none, full | 15 | 效应为零（d=+0.00） |
| Invest (5轮) | shuffle, single-intervention | 5 | **严重不足** |
| Invest (3轮) | none, full | 15 | p=0.152 中等效应 (d=+0.65) 但未达显著 |

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
| CommitteeTopology (500 agents) | 🔧 占位实现（仅 phase 1，phase 2-3 stubbed）+ 单元测试 |

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

> **关键提醒（2026-07-14 更新，扩样确认）**：4 个认知缺陷已于 2026-07-12 修复，并于 2026-07-14 在 Crisis 任务（72 次实验，n=24/cell）上重新验证——治理环路现已闭合，full vs none 大正效应（d=0.92, p=0.005, 功效 88%，τ 从 0.408 提升至 0.617）。此前 165 次历史实验（3轮 d=+0.65 不显著、5轮 d=+0.00、full_reflection p=0.048 等）均在断裂状态下得出，**结论存疑，仅作为历史对照保留**；Crisis 任务结果才是治理有效性的首份统计确认证据。

## 12. 硬伤修复状态（2026-07-12）

截至 2026-07-12，硬伤清单（见 docs/archive/PROJECT_DEEP_ANALYSIS.md）中的 7 项已修复或审计，状态如下：

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

以下硬伤截至 2026-07-15 尚未修复，留待实验室后续处理：

| 硬伤 | 简述 | 状态 |
|------|------|------|
| H1 | 治理环路修复后实验未重跑（代码已闭合，229/229 测试通过，但历史实验数据未重跑） | ✅ 已在 Crisis/Supplier 任务重新验证 |
| H3 | 单任务实验（仅 Hidden Profile 投资任务，结论无法推广） | ✅ 已扩展至 Crisis + Supplier 两任务 |
| H5 | Cronbach's α 语义争议（轮次作为 item 测的不是个体一致性） | 留实验室 |
| H7 | stripGovTag 正则 bug（非贪婪匹配残留 JSON 片段） | ✅ 已修复（2026-07-15，改用行首匹配） |
| H8 | InterventionType 闭联合型仅 5 成员（4 干预 + none）；break_connections/introduce_dissent/pair_opposites 为文档设想但从未实现 | 留实验室（架构限制） |
| H9 | 交叉质证让步检测否定语境（"我不同意"被误判为让步） | 留实验室 |
| H10 | 影响力图与影响力管理器不一致（reference 边与数值推断边共存） | 留实验室（架构限制） |
| H11 | Dropout SUTVA 违反（被丢弃 agent 意见仍合并回 opinions） | 留实验室（架构限制） |
| H12 | onMessage 死代码（无检测/干预逻辑） | ⚠️ 误记：onMessage 实际更新信念和缓冲消息，非死代码 |
| H13 | StateInferenceBridge 静默成功（无回调仍返回 true） | ✅ 已修复（2026-07-15，无回调时返回 false + 告警） |
| H14 | 双轨干预无同步（引擎内模拟与外部应用无同步机制） | 留实验室（架构限制） |
| H15 | 交叉质证阵营统一移位（同阵营成员应用相同 shift） | 留实验室 |
| H16 | Gini 衡量发言数量而非影响力（高置信度 ≠ 高影响力） | 留实验室（架构限制） |
| H21 | T 分布表稀疏（缺 11/13/16-18 等值，依赖线性插值） | ✅ 已修复（2026-07-15，补全 1-30 全部整数值） |
| H22 | seed 可复现性局限（DeepSeek/OpenAI best-effort，Anthropic 不支持） | 留实验室（API 限制） |

---

## 14. 治理环路修复后验证（2026-07-14，扩样确认）

2026-07-14 在 Crisis 任务上完成 72 次实验（none/full/shuffle × 24），验证治理环路修复后的有效性：

| 模式 | τ（μ±σ） | Cohen's d vs none | p 值 | 功效 |
|------|---------|-------------------|------|------|
| none | 0.408 ± 0.182 | — | — | — |
| full | 0.617 ± 0.263 | **0.92** | **0.005** | 88% ✅ |
| shuffle | 0.717 ± 0.243 | **1.44** | <0.001 | 100% |

**结论**：治理环路修复后，full vs none 呈大正效应（d=0.92, p=0.005, 功效 88%），τ 提升 51%。shuffle 仍最强（d=1.44）。扩样至 n=24 后首次达到统计充分（功效 ≥80%）。

**仍存在的局限**：
- 仅单一任务类型（Crisis 危机响应），任务多样性不足
- 仍仅 DeepSeek-V3 单模型验证
- 165 次历史实验结论仍存疑，仅作为断裂环路下的对照保留

## 15. 干预优化已落地为默认配置（2026-07-14）

基于 Crisis 任务 68 次干预的成本效益分析，以下优化已写入代码默认配置：

| 优化项 | 实现位置 | 状态 |
|--------|---------|------|
| 默认禁用 `introduce_diversity` + `continue_discussion` | [src/lib/governance/index.ts:188](src/lib/governance/index.ts) `disabledInterventions` | ✅ 已落地 |
| 最后一轮不触发任何干预 | [src/lib/governance/index.ts:688-692](src/lib/governance/index.ts) `isLastRound` 拦截 | ✅ 已落地 |
| 真实 Token 追踪（替代估算） | [experiments/v2/run.ts:109-113](experiments/v2/run.ts) `tokenUsage` 字段 | ✅ 已落地 |
| 干预类型可配置开关 | [src/lib/governance/types.ts:153-155](src/lib/governance/types.ts) `disabledInterventions` 配置项 | ✅ 已落地 |

> **含义**：Crisis 实验分析中的"优化方案"（停用有害干预 + 第3轮停止干预，可节省 66.0% 成本）现已成为默认行为。新实验默认不触发 `introduce_diversity` 和 `continue_discussion`，且最后一轮自动停止干预。如需启用，传 `disabledInterventions: []`。

## 16. 历史实验数据的定位（2026-07-14 更新，扩样后）

165 次历史实验（Invest + M&A）与 161 次扩样实验（Crisis + Supplier）的定位差异：

| 数据集 | 环路状态 | 可信度 | 用途 |
|--------|---------|--------|------|
| Crisis（72 次，n=24/cell） | 环路闭合 | ✅ 统计确认 | 治理有效性的主要证据（d=0.92, p=0.005） |
| Supplier（89 次，n=30/cell） | 环路闭合 | ✅ 方向一致 | 跨任务验证（d=0.47, p=0.089，功效不足） |
| 历史数据（165 次，2026-07-13 及更早） | 环路断裂 | ⚠️ 存疑 | 断裂环路下的对照，仅作历史参考 |

- 历史数据中的因果效应估计（M&A 5轮 +0.135，d=0.96）受 state-modification 类干预未到达 agent 感知影响，效应可能被低估
- 历史数据中的 `full_reflection p=0.048 显著有害` 结论需在闭合环路下重新验证——Crisis 任务中 force_reflection 有效率达 79.4%（34 次干预 27 次有效），方向已逆转

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

## 18. 跨任务验证的局限（2026-07-14，扩样后）

新增 Supplier 任务（89 次实验，n=30/30/29）用于跨任务验证，但仍存在以下局限：

| 局限 | 说明 | 影响 |
|------|------|------|
| **单模型未变** | 仍仅 DeepSeek-V3，跨模型验证缺失 | 无法排除模型特异性 |
| **任务类型相近** | Supplier 与 Crisis 同为"5 选 1 排序"任务 | 跨任务结论限于排序型任务 |
| **Supplier p=0.089 未达显著** | full vs none d=0.47, p=0.089, 功效 43% | 方向一致但统计未确认；需 n=72 达 80% 功效 |
| **Shuffle 边界条件** | Supplier shuffle d=0.09 (p=0.78) vs Crisis d=1.44 (p<0.001) | shuffle 对照有效性受任务难度调节（天花板效应） |
| **Crisis 已充分但 Supplier 不足** | Crisis 功效 88% ✅, Supplier 功效 43% ⚠️ | 跨任务统计确认仍需 Supplier 扩样 |

**跨任务结论的边界**：
- ✅ 可报告："Crisis 统计确认有效（d=0.92, p=0.005），Supplier 方向一致（d=0.47, p=0.089）"
- ✅ 可报告："核心发现（治理方向、虚假共识、机制消融）在 2 个任务间方向一致"
- ❌ 不可报告："结论已跨任务统计确认"——Supplier p>0.05
- ❌ 不可报告："结论普适于所有 LLM multi-agent 场景"——仍需更多任务/模型验证

**Shuffle 边界条件的理论解释**：
- Crisis none τ=0.41（低基线，任务困难）→ shuffle 通过信息整合大幅提升（d=1.44）
- Supplier none τ=0.68（高基线，任务较易）→ shuffle 无提升空间（d=0.09，天花板效应）
- 结论：shuffle 对照的有效性受任务难度调节——在困难任务中显著，在容易任务中因天花板效应而不适用

**仍需做的验证**：
1. 第 3 个完全不同类型的任务（分类/资源分配型）
2. 跨模型验证（GPT-4o-mini、Claude Haiku）
3. Supplier 任务扩样至 n=72/cell 确认 p<0.05（需 42 次新实验/cell）

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
| `PromptInjector.extractGovTag` [GOV] 标签伪造漏洞（取第一个 [GOV]，正文引用/伪造可操纵治理状态） | 安全漏洞（prompt 注入） | 改为只取最后一个行首 [GOV]，忽略正文中的 [GOV]；`stripGovTag` 同步修复；新增 2 个注入防御测试（221 测试全通过） |
| T 分布表稀疏（analyze/powerAnalysis/mechanismAnalysis 三处缺 11/13/16-18 等） | 小样本 CI 精度依赖线性插值 | 三处全部补全 1-30 整数值 |
| `analyze.ts` BH FDR 非标准 step-down（逐个比较 p < critical） | 多重比较可能偏保守/激进 | 改为标准 BH step-down（从最大 rank 向上找第一个满足 p(i)<=(i/m)*q，拒绝所有 j<=i） |
| `bayesianAnalysis.ts` Welch p 值用正态近似 | 小样本下 p 值偏激进 | 加入 t 分布校正因子（t_critical/z_critical 比值） |
| `dataPackage.ts` kendallTau 用 τ-a（无 tie 修正） | tie 时偏差 | 改为 τ-b（含 tie 修正项，与 analyze.ts 一致） |
| `interventionAnalysis.ts:230` 硬编码 agent ID `["a1".."a5"]` | 无法适配其他实验配置 | 改为 `extractAgentIds()` 从数据自动推断 |
| `StateInferenceBridge` 无 injectPrompt 回调时静默返回 true | 干预丢失但报告成功 | 改为返回 false + 告警 + interventionsFailed++ |
| `security/validation.ts` 全部用 `any` | 安全模块类型保护缺失 | 定义 LLMConfigInput/MLOptionsInput/SwarmRequestInput 接口替代 any |
| `analyzeSupplier.ts` 冗余前身（被 analyzeSupplierFull.ts 取代） | 维护混乱 | 删除 |

### §20 社会热力学 F 分解驱动的干预优先级排序（2026-07-15）

将社会热力学指标（自由能 F = (1-R) + T·H）与检测器/干预系统打通：当多个检测器同时触发时，按当前系统"物理状态"对干预排序，使最契合当前无序结构的干预排在前面。

**实现位置**：[src/lib/governance/index.ts](src/lib/governance/index.ts) `rankInterventionsByFreeEnergy()`

**F 分解→干预类型映射**（回测证伪后修正）：

| F 的分量 | 物理含义 | 对齐的干预类型 | 回测状态 |
|---------|---------|--------------|---------|
| thermal·(1-structural) | 热性主导且非极化 | `force_reflection`（原映射 structural 已证伪） | ✅ 回测证伪→已修正 |
| 热性无序 T·H | 分散且高熵 | `reduce_weight` | ⚠️ 方向支持但不显著（p=0.100） |
| R·(1-H) | 虚假共识（有序但可能一起错） | `introduce_diversity` | ⏳ 未回测 |
| R·(1-H)·(1-F) | 过早收敛 | `continue_discussion` | ❌ 0%有效率已禁用 |

**回测验证**（Crisis+Supplier full n=54，97 次 force_reflection 事件）：

| 指标 | 数值 |
|------|------|
| 多检测器同时触发（≥2） | **22/24 = 91.7%**（Crisis） |
| 假设1证伪：结构性主导 Δτ | **−0.033**（有害，n=24） |
| 假设1证伪：热性主导 Δτ | **+0.115**（有益，n=73） |
| 置换检验 p-value | **0.041**（显著） |
| Cohen's d | **−0.49**（中等效应，负向） |
| 假设2方向支持但不显著：reduce_weight 热性 Δτ | +0.182 vs 结构性 +0.067，p=0.100, d=+0.448 |

**结论**：F 分解排序在 91.7% 的实验场景中会改变干预执行顺序。回测证伪了原假设1（force_reflection↔structural），修正为 force_reflection↔thermal·(1-structural)——force_reflection 是降噪干预而非对齐方向干预，极化时强化对立立场有害。

**局限**：
- 观察性研究非因果确证（agent 在不同 F-state 非随机分配，存在混杂）
- Δτ 归因不完全（整轮变化含其他干预和自然收敛）
- 假设3（introduce_diversity↔虚假共识）未回测（echo chamber 难触发）
- 尚未通过重新实验验证 τ 是否提升（需重跑 Crisis full 对比新旧排序）
- 步骤 2（检测器阈值自适应）和步骤 3（五维度反馈）留实验室

### §21 F 分解 A/B 对照实验：排序未改善决策质量（2026-07-15，负面发现）

**实验设计**：预注册假设 H_F——F 分解排序 Δτ 显著高于固定排序。配对设计，同 seed，A 组（`full`，F 分解）vs B 组（`full_fixed`，固定排序）。Pilot n=8（Crisis 任务，runIndex 0-7）。

**结果**：

| 指标 | 值 |
|------|-----|
| A 组 τ 均值（F 分解） | 0.6250 |
| B 组 τ 均值（固定排序） | 0.6750 |
| 配对差 Δτ_A − Δτ_B | **−0.0500**（负=固定排序更优） |
| Cohen's d_z | **−0.354**（负方向，中等） |
| 配对置换检验 p-value | 0.3781（不显著） |
| 排序改变率 | 100%（8/8 配对排序不同） |

**关键发现**：H_F **不支持**。8/8 配对中 F 分解确实改变了排序顺序，但**改变排序没有改善 τ**，方向上反而略差（d_z=−0.354）。4/8 配对 τ 相同（排序改变但结果不变），3/8 固定排序更优，1/8 F 分解更优。

**停止扩样决策**：基于预注册决策规则（d_z<0.2 或方向反转则停止），pilot 已显示方向反转，扩样无法翻转结论。

**为什么未改善——三个可能解释**：
1. Crisis 仅 3 轮，同轮内多个干预都会执行（只是顺序不同），排序对最终 τ 影响有限
2. H1 证伪后的修正（force_reflection 降权）与固定排序中 force_reflection 排后面的效果重合
3. 固定排序（reduce_weight 优先）恰好接近 Crisis 上的最优，与 F 分解在热性主导时也优先 reduce_weight 重合

**F 分解价值的修正定性**：

| 维度 | F 分解贡献 | 证据强度 |
|------|-----------|---------|
| 诊断价值（发现 H1 错误） | ✅ 实质贡献 | 强（p=0.041） |
| 统一多检测器优先级（架构） | ✅ 架构合理 | 弱（无 Δτ 改善证据） |
| 提升决策质量（Δτ） | ❌ 未验证 | **A/B 对照 d_z=−0.354，方向反转** |

**结论**：F 分解的主要价值是**诊断性**的（提供分析框架发现 H1 错误）。作为运行时干预排序机制，在 Crisis 任务 3 轮讨论中相比固定排序没有显著改善。更长讨论轮次或多任务场景下是否有效，留实验室验证。

**代码变更**：
- [src/lib/governance/types.ts](src/lib/governance/types.ts)：加 `sortingMode?: "fdecomposition" | "fixed"` 配置
- [src/lib/governance/index.ts](src/lib/governance/index.ts)：加 `rankInterventionsByFixedOrder` 函数 + 分流逻辑
- [experiments/v2/run.ts](experiments/v2/run.ts)：加 `full_fixed` 消融模式 + `--mode` CLI 参数
- [experiments/v2/ab_fdecomposition_paired.ts](experiments/v2/ab_fdecomposition_paired.ts)：A/B 配对分析脚本

### 已知但未修复的问题（文档记录）

| 问题 | 严重度 | 未修复原因 | 影响 |
|------|--------|-----------|------|
| `mulberry32` PRNG 复制 11 份 | 中 | 已创建 `statsShared.ts` 公共模块，实验脚本迁移留实验室 | 维护负担（不影响正确性） |
| `cohensD`/`mean`/`std` 在 5-9 个实验脚本中重复 | 中 | 同上 | 同上 |
| `ExperimentResult` 接口在 9 个脚本中重复定义 | 低 | 同上 | 无运行时影响 |
| `InterventionType` 是闭合联合类型 | 低 | 架构限制 | 新增干预类型需改类型定义 |
| 自定义检测器无法触发干预（`diagnoseAndIntervene` 硬编码 4 个 if） | 中 | 架构限制 | 检测器-干预联动断裂 |

---

## §22 异步自适应实验框架（2026-07-16）

### 框架状态

异步讨论引擎（AsyncDiscussionEngine）已实现并完成初步验证，但存在以下局限：

| 模块 | 代码状态 | 实验状态 |
|------|---------|---------|
| 内容驱动发言意愿（v2） | ✅ 已实现 + 27 单元测试 | ⚠️ 初步验证（C组v2 τ=0.88, n=10），未达统计充分 |
| 随机概率发言（v1 对照） | ✅ 已实现 | ⚠️ 初步验证（C组v1 τ=0.72, n=10） |
| 热力学终止决策 | ✅ 已实现 + 32 单元测试 | ⚠️ 初步验证（80%结晶终止, 20%hard_cap） |
| 被动倾听信念更新 | ✅ 已实现 | ❌ 未独立验证（DeGroot 学习率 0.15 为启发式） |
| 被动倾听 confidence 更新 | ✅ 已实现 | ❌ 未独立验证（学习率 0.03 为启发式） |
| D组匹配分布采样 | ✅ 已实现 | ⚠️ 初步验证（D组从C组分布采样） |
| mulberry32 PRNG 可复现性 | ✅ 已实现 + 3 单元测试 | ✅ 同 seed 下发言选择可复现 |

### 已知局限

| 局限 | 说明 | 影响 |
|------|------|------|
| **天花板效应** | C组v2 τ=0.88 = A组0.88，任务可能仍偏简单 | 已通过 v2 难度增强（干扰项、信息盲区、对抗性偏见）缓解，待重新验证 |
| **v1 vs v2 差异不显著** | C组v1 τ=0.72 vs C组v2 τ=0.88，方向支持但 n=10 不足以达统计显著 | 需扩样至 n=30+ 确认 |
| **C vs D 差异极小** | C组v2 τ=0.88 vs D组v2 τ=0.76，Δτ=0.12 但 n=10 不显著 | 热力学终止的诊断价值需更大样本验证 |
| **被动倾听学习率未标定** | belief 学习率 0.15、confidence 学习率 0.03 均为启发式 | 需敏感性分析确定最优值 |
| **意愿分数权重未标定** | 5 个因子的权重（0.6/0.4/0.2/0.3/0.5）为设计值 | 需参数搜索或贝叶斯优化 |
| **单任务验证** | 仅 fraud 任务，任务多样性不足 | 需扩展至其他任务类型 |
| **单模型验证** | 仍仅 DeepSeek-V3 | 跨模型验证缺失 |
| **强结晶态可能误判** | H<0.10 且 T<0.10 可能是"错误收敛"（群体一致于错误答案） | C_8 实验出现 τ=0.4 但 strong_crystallized 终止 |
| **hard_cap=40 仍可能不足** | 难度增强后部分实验可能需要 >40 发言 | 需观察 hard_cap 比例，必要时调整 |

### 实验数据状态（2026-07-16）

| 组别 | speakMode | n | τ | 发言 | 状态 |
|------|-----------|---|------|------|------|
| A | 同步 | 10 | 0.88 | 25 | ✅ 完成 |
| B | content_driven | 10 | 0.72 | 12 | ✅ 完成 |
| C_v2 | content_driven | 10 | 0.88 | 21.6 | ✅ 完成（难度增强前） |
| C_v1 | random_prob | 10 | 0.72 | 26.8 | ✅ 完成（难度增强前） |
| D_v2 | content_driven | 10 | 0.76 | 18.2 | ✅ 完成（难度增强前） |
| D_v1 | random_prob | 10 | 0.74 | 26.4 | ✅ 完成（难度增强前） |

> **注意**：以上数据使用难度增强前的 task_fraud.ts。任务难度已增强（增加干扰项、信息盲区、对抗性偏见），需重新跑全部 4 组验证天花板效应是否缓解。

### 文件命名修复

2026-07-16 修复了 C/D 组文件名覆盖 bug：v1 和 v2 数据原用相同文件名 `fraud_C_0.json`，导致 v1 覆盖 v2。修复后文件名包含 speakMode：`fraud_C_content_driven_0.json` / `fraud_C_random_prob_0.json`。
