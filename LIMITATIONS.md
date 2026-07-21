# Limitations

> 本文件诚实记录 SwarmAlpha 的检测器局限、未验证模块、缺失集成和样本量问题。
> 更新日期: 2026-07-21（C1 撤回 + F8-F10 新发现 + B1-B8 完成 + 理论修正 + Supplier 天花板部分证伪 + A3 MAST 检测器实现 + H1/H2 回测 Round 3 bug 修复）

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

## 2. 跨模型验证

**2026-07-19 更新**：C 组跨模型验证已完成（Zhipu glm-4-flash n=10）。

| 模型 | C 组 τ | τ=1.0 达成 | 发言数 |
|------|--------|------------|--------|
| DeepSeek-V3 | 0.640 ± 0.196 | 1/10 (10%) | 18.6 |
| **Zhipu glm-4-flash** | **0.760 ± 0.215** | **4/10 (40%)** | 25.3 |

- **热力学终止跨模型方向一致有效**（+18.8%）
- A/B/D 组跨模型验证尚未完成（仅 C 组）
- 仅两个模型对比，未覆盖 GPT-4o、Claude 等
- glm-4-flash 为免费小模型，与更大模型（glm-4、GPT-4o）的对比未做

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
- ✅ 等权稳健性检查已执行（2026-07-21，`experiments/v2/weight_robustness.ts`）
  - 覆盖 4 个主实验数据集：Crisis (n=80) + Supplier (n=89) + M&A (n=110) + Invest 3-round (n=8)，共 17 个消融组
  - 统计方法：Wilcoxon 符号秩检验（精确/正态近似）+ 配对置换检验（n=5000, seed=42）+ Cohen's d
  - 结果：所有数据集排名 100% 一致、等级 0 次变化
  - 系统性偏差：等权使总分升高 +2.789 分（reliability 维度分数系统性偏低 13-17 vs 其他维度 60-75），但该偏差为单调平移，不影响横向比较结论
  - reliability 降权 50% 敏感性测试：17 组中仅 1 组等级变化（Invest 3-round none: fair→good）
  - **结论：权重选择不影响消融组间横向排名；绝对总分受 reliability 维度系统性偏低影响，建议仅用于组间比较**

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
| H1 | 治理环路修复后实验未重跑（代码已闭合，300/303 测试通过，但历史实验数据未重跑） | ✅ 已在 Crisis/Supplier 任务重新验证 |
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
- DeepSeek-V3 为主，Zhipu glm-4-flash C 组跨模型验证已完成（2026-07-19）
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

对 Crisis 数据（n=15/cell）的贝叶斯重分析（详见 [TECHNICAL_REPORT.md 附录 C](./TECHNICAL_REPORT.md)）存在以下局限：

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
| 热性无序 T·H | 分散且高熵 | `reduce_weight` | ✅ 方向确认且显著（p=0.023, d=+0.662） |
| R·(1-H) | 虚假共识（有序但可能一起错） | `introduce_diversity` | ⏳ 未回测 |
| R·(1-H)·(1-F) | 过早收敛 | `continue_discussion` | ❌ 0%有效率已禁用 |

**回测验证**（Crisis+Supplier full n=62，85 次 force_reflection 事件，排除 Round 3；2026-07-21 修复零值 bug）：

| 指标 | 数值 |
|------|------|
| 多检测器同时触发（≥2） | **22/24 = 91.7%**（Crisis） |
| 假设1证伪：结构性主导 Δτ | **−0.035**（有害，n=23） |
| 假设1证伪：热性主导 Δτ | **+0.184**（有益，n=62） |
| 置换检验 p-value | **0.0092**（显著） |
| Cohen's d | **−0.667**（中-大效应，负向） |
| 假设2确认且显著：reduce_weight 热性 Δτ | +0.247 vs 结构性 +0.071，p=0.023, d=+0.662 |

**修复记录（2026-07-21）**：原回测 `backtest_weight_assumption.ts:114-115` 对 Round 3 事件强制 `Δτ=0`，因无下一轮 tau 可参考。Round 3 零值在热性组中占比更高（11/73），拉低了热性组均值。修复后改为跳过无下一轮的事件，热性组 Δτ 从 +0.115 升至 +0.184，p 从 0.041 降至 0.0092。H1 证伪方向稳健且更强。H2（reduce_weight）方向差从 p=0.100 变为 p=0.023（显著）。

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
| 诊断价值（发现 H1 错误） | ✅ 实质贡献 | 强（p=0.0092, d=−0.667） |
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

## §22 异步自适应实验框架（2026-07-17，阈值重新标定）

### 框架状态

异步讨论引擎（AsyncDiscussionEngine）已实现并完成两轮迭代验证。第一轮（2026-07-16）暴露了热力学阈值标定问题；第二轮（2026-07-17）逐例尸检后重新标定 5 个参数，硬截断率从 40% 降至 10%。

| 模块 | 代码状态 | 实验状态 |
|------|---------|---------|
| 内容驱动发言意愿（v2） | ✅ 已实现 + 27 单元测试 | ✅ 两轮验证（C 组 n=20，旧阈值+新阈值各 10） |
| 热力学终止决策 | ✅ 已实现 + 32 单元测试 | ✅ 阈值重新标定（硬截断 40%→10%，τ 0.34→0.46） |
| 被动倾听信念更新 | ✅ 已实现 | ❌ 未独立验证（DeGroot 学习率 0.15 为启发式） |
| 被动倾听 confidence 更新 | ✅ 已实现 | ❌ 未独立验证（学习率 0.03 为启发式） |
| D组匹配分布采样 | ✅ 已实现 | ⚠️ 初步验证（D 组从 C 组分布采样） |
| mulberry32 PRNG 可复现性 | ✅ 已实现 + 3 单元测试 | ✅ 同 seed 下发言选择可复现 |

### 阈值重新标定（2026-07-17）

第一轮 C 组 4/10 硬截断的逐例尸检（详见 `experiments/v2/analysis_c_group_thermo.md`）：

| Run | τ | 失败场景 | 被挡变量 |
|-----|-----|---------|----------|
| 1 | **0.6** | 太晚——H 卡在 0.418 持续 7 eval，降到 0.311 时 hard_cap 已触发 | H（旧 0.35） |
| 2 | 0.0 | 从未达到——H/T 持续振荡 | H, T 均振荡 |
| 4 | 0.2 | 从未达到——T 最低 0.207，离阈值仅差 0.007 | T（旧 0.20） |
| 8 | 0.4 | 达到后瓦解——eval 6 首次结晶，eval 7 被发言打散 | 连续次数（旧 2） |

标定结果：

| 参数 | 旧值 | 新值 | 依据 |
|------|------|------|------|
| `crystallH` | 0.35 | 0.42 | Run 1 τ=0.6 因 H=0.418 被挡 |
| `crystallT` | 0.20 | 0.22 | Run 4 T=0.207 仅差 0.007 |
| `consecutiveCrystallRequired` | 2 | 3 | Run 8 去结晶化 |
| `strongCrystallH` | 0.10 | 0.20 | Run 1 T<0.07 但 H>0.10 无法强结晶 |
| `evalEveryKUtterances` | 3 | 2 | 更密集的状态监测 |

### 新阈值效果（C 组 10 轮，2026-07-17）

| 指标 | 旧阈值 | 新阈值 |
|------|--------|--------|
| 硬截断率 | 40% | **10%** |
| 平均 τ | 0.34 | **0.46** |
| 最高 τ | 0.6 | **0.8** |
| 平均发言 | 28.2 | **22.4** |

唯一剩余硬截断 Run 0（τ=0.4）是**真正的讨论失败**：系统在 eval 3 后主动退化（R 0.896→0.580），a2=1/a3=−1 完全极化。这是发言质量维度的缺失，非阈值可修复——发言意愿公式需增加 `quality_factor`。

### 已知局限

| 局限 | 说明 | 影响 |
|------|------|------|
| **阈值无任务难度感知** | 新阈值针对 v2 fraud 任务标定，其他任务可能需不同阈值 | 需跨任务验证或自适应阈值机制 |
| **发言意愿无质量维度** | 公式仅评估"该不该发言"而非"发言是否有用"——Run 0 的去极化化暴露了此问题 | 噪音 agent 持续获得发言权，破坏收敛 |
| **异步 B 组 τ 低于 A 组** | B 组 τ=0.72 vs A 组 τ=0.88——异步在固定轮数下牺牲了信息整合 | 异步效率优势（1.7× τ/发言）未转化为更高绝对 τ |
| **被动倾听学习率未标定** | belief 学习率 0.15、confidence 学习率 0.03 均为启发式 | 需敏感性分析 |
| **意愿分数权重未标定** | 5 个因子的权重（0.6/0.4/0.2/0.3/0.5）为设计值 | 需参数搜索或贝叶斯优化 |
| **单任务 + 跨模型验证进行中** | C 组跨模型完成（DeepSeek + Zhipu），A/B/D 组待验证 | 跨任务、跨模型全矩阵验证进行中 |
| **n=10 功效不足** | 各组仅 10 次运行 | 扩样至 n=30 可检出中等效应 |

### 实验数据

| 组别 | n | τ | 发言 | 状态 |
|------|---|------|------|------|
| A | 10 | 0.88 ± 0.10 | 25.0 | ✅ |
| B | 10 | 0.72 ± 0.22 | 12.2 | ✅ |
| C (旧阈值) | 10 | 0.34 ± 0.16 | 28.2 | ✅ 备份于 `data_fraud_old_thresholds/` |
| C (新阈值) | 10 | 0.46 ± 0.17 | 22.4 | ✅ |
| C (信念偏移修复) | 10 | 0.64 ± 0.21 | 18.6 | ✅ |
| C (**Zhipu glm-4-flash**) 🔬 | 10 | **0.76 ± 0.22** | 25.3 | ✅ 跨模型验证 |
| D | 10 | 0.46 ± 0.30 | 18.4 | ✅ |
| B (Zhipu, 未完成) | 1 | **1.00** | 20.0 | ⚠️ 仅 1 次运行 |

**结论**：热力学诊断逻辑正确，阈值需要任务难度感知。第一轮 H_thermo 被证伪是阈值标定问题，非框架问题。发言内容质量是下一轮改进的关键瓶颈。

---

## §23 结论审计与理论修正（2026-07-20）

### 23.1 C1 结论撤回（force_reflection "反向强化 +0.68" 归因错误）

**原结论 C1**：force_reflection 使恶意 a1 信念平均 +0.68，表现为"反向强化"。

**审计发现**：100% 的 force_reflection 样本（5/5）同轮都有 reduce_weight 干预打诚实 agent，**归因完全混淆**。原结论无法区分是 force_reflection 单独作用还是 reduce_weight 间接影响。

**修正**：
- 原结论 C1（+0.68）**撤回**
- 部分隔离分析（force_reflection 打 a1，reduce_weight 打别人）：n=5，5/5 上升，平均 +0.94（F9 发现）
- 但 n=5 极小，且"同轮 reduce_weight 打诚实 agent"可能间接影响 a1，**仍非严格因果隔离**

**影响范围**：TECHNICAL_REPORT.md §4.2、PAPER_DRAFT.md §5、ROADMAP.md 附录 B 中所有引用 C1 的结论需同步修正。

### 23.2 新发现 F8-F10（E 组深度分析）

| # | 发现 | 数据 | 局限 |
|---|---|---|---|
| **F8** | 失败组 token 成本是成功组的 2.9 倍（96K vs 33K） | n=6（成功 4 + 失败 2） | 样本量小，未区分 prompt/completion |
| **F9** | force_reflection 部分隔离下 5/5 反向强化（平均 +0.94） | n=5 | "部分隔离"仍非严格因果隔离 |
| **F10** | reduce_weight 部分隔离下 72% 压制率（平均 Δa1=-0.13） | n=18 | 部分隔离观察，非 RCT |

**详细数据**：见 `TECHNICAL_REPORT.md 附录 B`

### 23.3 Supplier 天花板效应部分证伪

**原结论**：Supplier 任务 shuffle 无效应（d=0.09）因天花板效应——基线 τ=0.68 已接近最优。

**证伪数据**：none 组 30 次实验中，**47% (14/30) 的 τ < 0.8**，说明治理空间存在。

**修正定性**：
- "天花板效应"可能部分是**功效不足**（n=30，43% power）而非真实天花板
- 需扩样至 n=72 达 80% 功效才能定性
- 当前 p=0.089 可能是 power 问题而非 true null

### 23.4 THEORY.md 命题 1b/1c/2 修正

经 `experiments/v2/test_theory_propositions.ts` 脚本测试，THEORY.md 中 3 个命题表述错误：

| 命题 | 原表述 | 修正后 | 状态 |
|---|---|---|---|
| 1b | 完美两极分化 → R=0 | **仅偶数 N 且完美对半分时 R=0**；奇数 N 或含中间值时 R>0（如 [1,1,-1,-1,0] R=0.2） | ✅ 已修正正文 |
| 1c | 均匀分布 → R≈2/π | **仅 N→∞ 连续极限时 R→2/π**；有限 N 下偏离（5 离散点 R=0.4828） | ✅ 已修正正文 |
| 2 | R-H 互补（隐含严格阈值） | **定性趋势**，非严格阈值（[0.5,0.5,-0.5,-0.5,0] 的 R=0.766、H=0.655 均未达原阈值） | ✅ 已修正正文 |

**影响**：THEORY.md 命题 1a、3 仍成立。理论分析整体方向正确，但部分细节（阈值、连续性假设）需更严谨。

### 23.5 B1-B8 升级项完成状态

| # | 任务 | 文件 | 状态 |
|---|---|---|---|
| B1 | run_malicious.ts 保存 roundResults（含 itemBeliefs） | experiments/v2/run_malicious.ts | ✅ |
| B2 | run_async_ab.ts 保存 governanceTrace + roundResults | experiments/v2/run_async_ab.ts | ✅ |
| B3 | C' 组设计（5 诚实 + v2 trace 单一变量对照）+ CLI 参数 | experiments/v2/run_async_ab.ts | ✅ 待跑实验 |
| B4 | F 组 governanceMode='none' 治理完全关闭核查 | src/lib/discussion/index.ts:824 | ✅ |
| B5 | R 度量共识的信息论解释（命题 1-3） | THEORY.md §2 | ✅（含修正） |
| B6 | 干预后系统不动点分析（命题 4-8） | THEORY.md §3 | ✅ |
| B7 | MAST 14 模式对齐分析（覆盖率 18%） | TECHNICAL_REPORT.md 附录 D | ✅ |
| B8 | OWASP ASI 10 风险对齐分析（覆盖率 40%） | TECHNICAL_REPORT.md 附录 E | ✅ |

### 23.6 新增文档清单（2026-07-20）

| 文档 | 内容 | 状态 |
|---|---|---|
| THEORY.md | 理论分析（R 信息论解释 + 不动点分析，含命题修正） | v0.2 |
| PAPER_DRAFT.md §5 | 7 个反常识发现（F1-F7）+ 可证伪条件 | v1.0 |
| TECHNICAL_REPORT.md 附录 D | MAST 14 模式对齐（18% 覆盖） | v0.1 |
| TECHNICAL_REPORT.md 附录 E | OWASP ASI 10 风险对齐（40% 覆盖） | v0.1 |
| UPGRADE_PLAN.md | 升级计划总览 | v1.0 |
| TECHNICAL_REPORT.md 附录 B | E 组深度分析（case study + 干预时间序列 + token 成本） | v1.0 |
| LIMITATIONS.md 附录 A | 9 个结论的可证伪条件清单 | v1.0 |
| LIMITATIONS.md 附录 B | 未来 C'/F/G 实验的预注册报告 | v1.0 |
| RESEARCH_NARRATIVE.md | 9 章研究叙事 | v1.0 |

### 23.7 项目水平评估变化

| 维度 | 2026-07-14 | 2026-07-20（B1-B8 后） | 变化原因 |
|---|---|---|---|
| 问题深度 | 5.0 | 6.0 | +理论分析 + MAST/OWASP 对齐 |
| 解决方法 | 4.4 | 4.4 | 未变（无新方法） |
| 技术路线 | 6.6 | 7.0 | +数据完整性修复 + 单一变量对照设计 |
| 未来潜力 | 6.0 | 7.0 | +MAST/OWASP 对齐明确扩展路线 |
| **加权总分** | **5.42** | **6.05** | +0.63 |

**诚实定性**：6.05 仍是"中等偏下"。要达到 7+（一流本科生科研），**必须完成 D1-D3 实验**（C'/F/G n=10 with trace）。没有完整数据，理论分析与文献对齐都是空谈。

### 23.8 仍需跑实验的待补项（不跑实验无法完成）

| # | 任务 | 依赖 |
|---|---|---|
| D1 | C' 组 n=10（5 诚实 + v2 trace） | 需跑实验 |
| D2 | F 组 n=10（v2 with trace，完整版） | 需跑实验 |
| D3 | G 组 n=10（v2 with trace） | 需跑实验 |
| D4 | 跨任务验证（crisis + supplier 恶意组） | 需跑实验 |
| D5 | 跨模型验证（DeepSeek + Zhipu + GPT-4o） | 需跑实验 |
| A1 | analyze_malicious.ts 消费 roundResults.itemBeliefs 核实攻击目标 | 依赖 D1-D3 |
| A2 | analyze_malicious.ts 加入 C' 组对照 | 依赖 D1 |

---

## 24. A3 MAST 检测器实现（2026-07-20）

### 24.1 实现内容

A3 任务（原 P1 优先级）已完成，实现 3 个 MAST FC2 检测器：

| 检测器 | MAST 模式 | 检测逻辑 | 干预 |
|---|---|---|---|
| `information_withholding` | FM-2.4 (9.1%) | ≥2 agent 有 evidence 且 ≥1 agent evidence 为空 | force_reflection |
| `ignored_input` | FM-2.5 (1.9%) | agent 被引用 ≥2 次但未回引 | force_reflection |
| `reasoning_action_mismatch` | FM-2.6 (6.2%) | itemBeliefs rank=1 的 belief 不是最高且差距 >0.3 | force_reflection |

### 24.2 MAST 覆盖率变化

| 类别 | A3 前 | A3 后 |
|---|---|---|
| FC1 System Design | 30% | 30% |
| FC2 Inter-Agent Misalignment | 0% | **50%** |
| FC3 Task Verification | 33% | 33% |
| **总计** | **17.9%** | **39.3%** |

### 24.3 A3 检测器的局限（诚实声明）

| 局限 | 说明 |
|---|---|
| 未经实验验证 | 检测器已实现但未在真实讨论中验证触发率与干预效果，待 D 组实验 |
| 阈值为初步设定 | "≥2 个有 evidence"、"≥2 次被引用"、"差距 >0.3" 均为初步阈值，需实验数据校准 |
| FM-2.4 检测简化 | 理想情况应结合 infoKeywordsMap 判断 agent 是否真有独有信息，当前仅用"他人有 evidence 你没有"作为代理 |
| FM-2.6 仅检查内部一致性 | 仅检查 itemBeliefs 内部 rank 与 belief 的矛盾，未做 reasoning 文本与 itemBeliefs 的交叉验证（NLP 复杂度高） |
| 安全降级副作用 | V1 数据（无 evidence/itemBeliefs 字段）自动返回 notDetected，这意味着 A3 检测器只在 V2 实验中生效 |
| force_reflection 效果存疑 | F9 显示 force_reflection 有反向强化风险（5/5 上升 +0.94），A3 复用此干预可能加剧该问题 |

### 24.4 字段保真修复的副作用

为支持 A3 检测器，修复了 `discussion/index.ts:843-855` 的 opinions → messages 转换，保留 evidence/itemBeliefs/reasoning 字段。此修复的影响：

- **正面**：A3 检测器在 native governance 路径下可正常工作
- **潜在风险**：MessageInfo 接口扩展为可选字段，所有消费 MessageInfo 的代码需确认不依赖字段缺失（已通过 287/290 测试验证）
- **未覆盖路径**：SDK runtime 路径（`applyGovernanceViaRuntime`）的 DiscussionMessage 转换未修复，A3 检测器在 SDK 模式下不生效（待 A4 补全）

### 24.5 项目水平评估更新

| 维度 | B1-B8 后 | A3 后 | 变化原因 |
|---|---|---|---|
| 问题深度 | 6.0 | 6.0 | 保持 |
| 解决方法 | 4.4 | **5.0** | +A3 MAST 检测器从设计到实现 |
| 技术路线 | 7.0 | 7.0 | 保持 |
| 未来潜力 | 7.0 | **7.2** | +MAST 覆盖率 18% → 39% + "观测层加规则"可行性验证 |
| **加权总分** | **6.05** | **6.20** | +0.15 |

**诚实定性**：6.20 仍是"中等偏下"。A3 提升的是"解决方法"维度（从设计到实现），但未经实验验证的检测器价值有限。

---

# 附录 A：可证伪性清单

> 本节原为独立文档 FALSIFIABILITY.md，现已合并入 LIMITATIONS.md 以集中诚实声明。

本文档列出 SwarmAlpha 所有核心结论的**可证伪条件**——即"什么数据能推翻此结论"。这是学术严谨性的核心要求。

> 状态：v1.0（2026-07-20）
> 原则：每个结论必须能被推翻，否则不是科学结论

---

## 结论清单

### F1：虚假共识（r≈0, n=169）

**结论**：最终共识度（R）与最终正确率（τ）线性相关 ≈ 0

**可证伪条件**：
1. 在新模型（GPT-4o/Claude/Zhipu）上 r > 0.3 且 p < 0.05
2. 在新任务（非 ranking）上 r > 0.3
3. 在新拓扑（GroupedTopology/CommitteeTopology）上 r > 0.3
4. 扩大样本到 n > 500 后 r 显著 > 0

**当前证据强度**：★★★★★ n=169, 跨 2 任务, p=0.66
**最可能的证伪路径**：跨模型验证——GPT-4o 上 r 可能不同

---

### F2：shuffle > governance（Crisis 任务）

**结论**：打破角色-信息绑定的效应量（d=1.44）超过实时治理干预（d=0.92）

**可证伪条件**：
1. 在 Supplier 任务上 shuffle 也显著优于 governance（目前 d=0.09, p=0.78，反证）
2. 在新任务上 governance 显著优于 shuffle（d > 0.5）
3. 使用不同的 shuffle 方式（如 -2 旋转而非 +2）后效应消失
4. 扩大 Crisis 样本到 n=72 后 d 差异不显著

**当前证据强度**：★★★★☆ n=24/cell, p<0.001
**最可能的证伪路径**：跨任务验证——在简单任务上 shuffle 无效

---

### F3：force_reflection 对恶意 agent 反向强化（部分隔离 n=5）

**结论**：force_reflection 单独作用恶意 a1 时，5/5 次信念上升，平均 +0.94

**可证伪条件**：
1. 设计严格消融组（force_reflection-only，无任何其他干预）后效果消失
2. 弱化恶意 prompt（去掉"永不认错"）后 force_reflection 使 a1 信念下降
3. 跨模型验证：GPT-4o 上 force_reflection 使恶意 agent 信念下降
4. n > 30 后上升率 < 50%

**当前证据强度**：★★★☆☆ n=5（部分隔离，非严格因果）
**最可能的证伪路径**：弱化恶意 prompt——force_reflection 的反向强化可能源于"永不认错"指令

**⚠️ 原结论撤回记录**：
- 原声称：+0.68 反向强化（100% 混合轮，归因错误）
- 修正版：归因不清
- 再修正版（E 深度分析后）：部分隔离 5/5 上升，但仍非严格因果

---

### F4：更多干预 = 更低 τ（r=-0.55）

**结论**：干预次数与决策质量负相关

**可证伪条件**：
1. C' 组（5 诚实 + v2 trace）上 r > 0（即诚实场景下干预有益）
2. 控制任务难度后相关性消失（即相关源自"困难任务同时导致高干预与低 τ"）
3. 跨模型验证：GPT-4o 上 r > 0
4. n > 30 后 |r| < 0.2

**当前证据强度**：★★★☆☆ n=10, r=-0.55
**最可能的证伪路径**：C' 组对照——相关可能是恶意场景特有的

---

### F5：依赖链误伤（a2 被附带 24 次）

**结论**：reduce_weight 误伤依赖链下游 agent

**可证伪条件**：
1. 重新设计依赖图（a2 不依赖 a1）后 a2 误伤率 < 5
2. 在 flat topology（无依赖链）上无误伤
3. 不同依赖图结构下误伤分布均匀（非 a2 集中）

**当前证据强度**：★★★☆☆ n=10, a2=24 次
**最可能的证伪路径**：无依赖链场景——误伤可能完全来自依赖结构

---

### F6：治理对简单任务无效应（Supplier 天花板）

**结论**：Supplier 任务上治理未达显著（p=0.089）

**可证伪条件**：
1. Supplier 扩样到 n=72 后 p < 0.05（当前是功效不足而非真无效）
2. 在其他简单任务（基线 τ > 0.65）上治理显著有效
3. 调整治理阈值后在 Supplier 上显著有效

**当前证据强度**：★★★★☆ n=30, p=0.089, 功效 43%
**最可能的证伪路径**：扩样——当前可能是"真有效但检测不到"

---

### F7：F 分解排序未改善 τ（d_z=-0.354）

**结论**：F 分解排序相比固定排序未显著改善决策质量

**可证伪条件**：
1. 在更长讨论（10+ 轮）上 F 分解显著优于固定排序
2. 在多任务场景下 F 分解优势显现
3. 扩大样本到 n=30 后 F 分解显著优于固定排序

**当前证据强度**：★★★☆☆ n=8, d_z=-0.354, p=0.378
**最可能的证伪路径**：长讨论场景——3 轮可能太短，排序影响不显现

---

### F8：失败组成本是成功组的 2.9 倍

**结论**：治理失败的 run 消耗 2.9 倍 token

**可证伪条件**：
1. n > 30 后倍数 < 1.5
2. 控制轮次后差异消失（即差异源自"失败组轮次多"而非"失败组每次干预更贵"）
3. 跨任务验证：Crisis/Supplier 任务上倍数 < 1.5

**当前证据强度**：★★☆☆☆ n=6（成功 4 + 失败 2）
**最可能的证伪路径**：扩大样本——n=6 太小，倍数可能不稳定

---

### F9：reduce_weight 72% 压制率（部分隔离 n=18）

**结论**：reduce_weight 单独命中 a1 时 72% 压制

**可证伪条件**：
1. 严格消融组（reduce_weight-only）后压制率 < 50%
2. 跨模型验证：GPT-4o 上压制率 < 50%
3. 弱化恶意 prompt 后压制率不变（证明压制不依赖 prompt 强度）

**当前证据强度**：★★★☆☆ n=18
**最可能的证伪路径**：严格消融——部分隔离仍可能有间接影响

---

### 结论强度分级

| 强度 | 结论 | 建议 |
|---|---|---|
| 强（★★★★★） | F1 虚假共识 | 可写入论文核心 |
| 中强（★★★★☆） | F2 shuffle>gov, F6 天花板 | 可写入论文，需声明局限 |
| 中（★★★☆☆） | F3 force_reflection, F4 干预负相关, F5 误伤, F7 F分解, F9 reduce_weight | 可写入论文 Discussion，需声明"pilot" |
| 弱（★★☆☆☆） | F8 成本倍数 | 仅作 case study，不写入论文核心 |

---

## 证伪性优先级

**最应优先验证的 3 个结论**（证伪可能性最高）：

1. **F3 force_reflection 反向强化**：弱化恶意 prompt 重测——若效果消失，则 F3 是"永不认错"指令的人为结果
2. **F4 干预-τ负相关**：C' 组对照——若诚实场景下 r > 0，则 F4 是恶意场景特有
3. **F6 Supplier 天花板**：扩样到 n=72——若 p < 0.05，则当前是功效不足而非真无效

**最稳健的 2 个结论**（证伪可能性最低）：

1. **F1 虚假共识**：n=169, 跨 2 任务, p=0.66——零发现，最稳健
2. **F2 shuffle > governance**：d=1.44 vs d=0.92，效应量大

---

## 诚实声明

1. 所有"可证伪条件"均为**理论上的证伪路径**，实际证伪需要跑实验
2. "证据强度"评分有主观成分
3. 部分结论（F3/F4/F5/F8/F9）样本量小，可能因随机波动而证伪
4. 跨模型/跨任务验证未完成，所有结论的普适性未知

---

**版本**：v1.0（2026-07-20）
**作者**：SwarmAlpha 项目
**状态**：待同行审阅

---

# 附录 B：预注册实验设计

> 本节原为独立文档 PRE_REGISTRATION.md，现已合并入 LIMITATIONS.md 以集中诚实声明。

本文档在跑 C'/F/G 实验前**预先固定**假设与分析方法，防止 p-hacking 与 HARKing（Hypothesizing After Results are Known）。

> 状态：v1.0（2026-07-20）
> 原则：在数据收集前固定假设、分析方法、决策规则

---

## 一、实验计划

### 1.1 C' 组（5 诚实 + v2 trace）

**目的**：建立 E 组的单一变量对照（仅"是否存在恶意 agent"不同）

**命令**：
```bash
npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --codeVersion=2026-07-20-ctrace-v2
```

**数据目录**：`experiments/v2/data_fraud_ctrace/`（不覆盖原 data_fraud/）

### 1.2 F 组（4 诚实 + 1 恶意 + 治理关，n=10）

**目的**：量化治理的防御价值（E vs F）

**命令**：
```bash
npx tsx experiments/v2/run_malicious.ts --group=F --count=10
```

### 1.3 G 组（3 诚实 + 2 恶意 + 治理开，n=10）

**目的**：测试共谋攻击下治理是否失效（E vs G）

**命令**：
```bash
npx tsx experiments/v2/run_malicious.ts --group=G --count=10
```

---

## 二、预先注册假设

### H1：C' vs E — 恶意 agent 的破坏力

**假设**：E 组 τ 显著低于 C' 组（单尾，p<0.05）

**原假设 H0**：E 组 τ = C' 组 τ
**备择假设 H1**：E 组 τ < C' 组 τ

**预期效应量**：基于现有 E vs C 数据（Δτ=-0.20, d_z=-0.671, p=0.0561），预期 C' 组 τ ≈ 0.64（同 C 组），E 组 τ ≈ 0.44。

**决策规则**：
- p < 0.05 且 Δτ < 0 → H1 成立（恶意 agent 显著降低 τ）
- p < 0.05 且 Δτ > 0 → 异常，需排查
- p ≥ 0.05 → 拒绝 H1（恶意 agent 无显著影响）
- 0.05 ≤ p < 0.10 → 边缘显著，记录但不强声明

### H2：E vs F — 治理的防御价值

**假设**：E 组 τ 显著高于 F 组（单尾，p<0.05）

**原假设 H0**：E 组 τ = F 组 τ
**备择假设 H1**：E 组 τ > F 组 τ

**预期效应量**：未知。现有 F 组 n=1（τ=0.800）异常高，无法预测。

**决策规则**：
- p < 0.05 且 Δτ > 0 → H1 成立（治理提供防御价值）
- p < 0.05 且 Δτ < 0 → 异常（治理反而有害），需排查
- p ≥ 0.05 → 拒绝 H2（治理无显著防御价值）

**⚠️ 风险声明**：现有 F#0 数据 τ=0.800 > E 组平均 0.440。若 F 组 n=10 维持高 τ，则 H2 被拒绝——治理在恶意场景下可能无防御价值，甚至有害。

### H3：E vs G — 共谋攻击的破坏力

**假设**：G 组 τ 显著低于 E 组（单尾，p<0.05）

**原假设 H0**：G 组 τ = E 组 τ
**备择假设 H1**：G 组 τ < E 组 τ

**预期效应量**：未知。2 个恶意 agent（40% 投毒率）可能突破治理防御。

**决策规则**：
- p < 0.05 且 Δτ < 0 → H1 成立（共谋攻击比单点更有效）
- p ≥ 0.05 → 拒绝 H3（治理对共谋攻击同样有效）

---

## 三、分析方法（预先固定）

### 3.1 统计方法

| 检验 | 方法 | 参数 |
|---|---|---|
| 配对检验 | sign-flip 置换检验 | nPerm=10000, seed=42 |
| 效应量 | Cohen's d_z（配对） | - |
| 置信区间 | t 分布（小样本校正） | df=n-1 |
| p 值修正 | (count+1)/(nPerm+1) | 避免 p=0 |
| 多重比较 | BH FDR（若同时检验 H1-H3） | q=0.05 |

### 3.2 配对设计

- C' 组 runIndex 0-9 ↔ E 组 runIndex 0-9（相同 seed）
- E 组 runIndex 0-9 ↔ F 组 runIndex 0-9（相同 seed）
- E 组 runIndex 0-9 ↔ G 组 runIndex 0-9（相同 seed）

### 3.3 分析脚本

使用现有 `experiments/v2/analyze_malicious.ts`，无需修改。

### 3.4 额外分析

实验完成后，使用 `experiments/v2/analyze_e_depth.ts` 的方法对 C'/F/G 组做：
- Case study（成功/失败模式）
- 干预时间序列（F 组除外，治理关）
- Token 成本对比

---

## 四、样本量与功效

### 4.1 当前功效（基于 E vs C 数据）

| 检验 | n | d_z | 功效 | 足够？ |
|---|---|---|---|---|
| H1 (C' vs E) | 10 | -0.671 | ~45% | ❌ 需 n=20 |
| H2 (E vs F) | 10 | 未知 | 未知 | ❓ |
| H3 (E vs G) | 10 | 未知 | 未知 | ❓ |

### 4.2 决策规则（功效不足时）

- 若 p ≥ 0.05 且功效 < 50%：**不能声称"无效应"**，只能声称"未检测到效应"
- 若 p < 0.05：即使功效低，也可声称显著（但需声明 replication 风险）

---

## 五、数据完整性检查

### 5.1 实验前检查

- [ ] codeVersion 字段正确（C'="2026-07-20-ctrace-v2", E/F/G="2026-07-20-malicious-v2"）
- [ ] governanceTrace 字段非空（C'/E/G 组）
- [ ] roundResults 字段非空（B1/B2 修复后）
- [ ] tokenUsage 字段完整
- [ ] 无 error 终止的 run（若有则重跑）

### 5.2 实验后检查

- [ ] 各组 n=10（无缺失）
- [ ] runIndex 0-9 连续（无跳号）
- [ ] seed 配对正确（同 runIndex 的 seed 相同）

---

## 六、HARKing 防护

### 6.1 禁止的行为

1. ❌ 跑完实验后修改假设（HARKing）
2. ❌ 跑完实验后修改决策规则（move the goalposts）
3. ❌ 选择性报告（只报告显著的假设）
4. ❌ 删除不利数据（除非有明确的技术原因，如 API 错误）

### 6.2 必须的行为

1. ✅ 报告所有 3 个假设的结果（无论显著与否）
2. ✅ 报告所有 10 个 run 的数据（无论好坏）
3. ✅ 若结果与预期不符，诚实记录（如 F 组 τ > E 组 τ）
4. ✅ 若发现实验设计问题，停止并记录，不"修补"

---

## 七、预期结果与意外情况

### 7.1 预期结果

| 假设 | 预期方向 | 预期显著性 |
|---|---|---|
| H1 (C' vs E) | E < C' | 边缘显著（p≈0.05-0.10） |
| H2 (E vs F) | E > F | 不确定（F#0 数据异常） |
| H3 (E vs G) | G < E | 可能显著（共谋更难防御） |

### 7.2 意外情况处理

**情况 A：F 组 τ > E 组 τ（治理有害）**
- 不删除数据
- 诚实记录："治理在恶意场景下可能有害"
- 探索性分析：可能原因是 force_reflection 反向强化 + reduce_weight 误伤

**情况 B：G 组 τ > E 组 τ（共谋反而更好）**
- 不删除数据
- 诚实记录："共谋攻击可能因内部冲突而自损"
- 探索性分析：2 个恶意 agent 信念可能互相冲突

**情况 C：C' 组 τ 显著不同于 C 组（v1 vs v2 不一致）**
- 停止分析，排查代码改动是否引入副作用
- 记录不一致，不强行解释

---

## 八、时间戳与承诺

- **预先注册时间**：2026-07-20（实验前）
- **承诺**：实验数据收集完成后，分析将严格按本报告执行。任何偏离都将在论文中明确声明。

---

**版本**：v1.1（2026-07-20，追加 S2/S3 跨任务跨模型验证设计）
**作者**：SwarmAlpha 项目
**状态**：待实验执行

---

## 九、S2 跨任务验证设计（crisis 任务恶意组）

### 9.1 目的

验证治理效果是否跨任务泛化。现有 E/F/G 组实验仅在 supplier 任务上运行，需在 crisis 任务上复制以检验泛化性。

**已知风险**：supplier 任务 τ=0.68（偏简单，天花板效应），crisis 任务 τ=0.41（偏难）。shuffle 干预在 crisis 有效但在 supplier 无效（天花板效应），说明治理效果**任务依赖**。S2 的目的是量化这种依赖程度。

### 9.2 实验设计

| 组 | 任务 | 配置 | n | 命令（待 task_crisis_malicious.ts 实现后） |
|---|---|---|---|---|
| E-crisis | crisis | 4 诚实 + 1 恶意 + 治理开 | 10 | `npx tsx experiments/v2/run_malicious.ts --group=E --count=10 --task=crisis` |
| F-crisis | crisis | 4 诚实 + 1 恶意 + 治理关 | 10 | `npx tsx experiments/v2/run_malicious.ts --group=F --count=10 --task=crisis` |

### 9.3 预先注册假设

**H4：治理效果跨任务一致性**

- **原假设 H0**：Δτ(E-crisis vs F-crisis) = Δτ(E-supplier vs F-supplier)
- **备择假设 H1**：Δτ(E-crisis vs F-crisis) ≠ Δτ(E-supplier vs F-supplier)
- **决策规则**：
  - p < 0.05 → 治理效果任务依赖，需报告任务特异性
  - p ≥ 0.05 → 治理效果跨任务一致（泛化性成立）

### 9.4 预期结果

基于现有 crisis vs supplier 数据：
- crisis 任务更难（τ=0.41），治理可能有更大空间（Δτ 可能更大）
- supplier 任务天花板效应（τ=0.68），治理空间有限
- **预期**：crisis 任务上治理效果更显著（Δτ-crisis > Δτ-supplier）

### 9.5 实现依赖

- 需创建 `experiments/v2/task_crisis_malicious.ts`（crisis 任务的恶意 agent 版本）
- 需修改 `run_malicious.ts` 支持 `--task=crisis` 参数
- **当前状态**：待实现（S2 代码任务，不依赖跑实验）

---

## 十、S3 跨模型验证设计（DeepSeek + Zhipu + GPT-4o）

### 10.1 目的

验证治理效果是否跨模型泛化。现有实验仅用 DeepSeek，需用其他模型复制以检验泛化性。

**已知限制**（诚实声明）：
- Zhipu 仅有 B(n=2) + C(n=10) 数据，A/D 组缺失，无法做完整对照
- GPT-4o 未测试，API 成本高
- 跨模型分析已有初步结果：C 组 n=10 Δτ=+0.04, d_z=0.098, p=0.86（不显著）

### 10.2 实验设计

| 组 | 模型 | 配置 | n | 命令 |
|---|---|---|---|---|
| E-deepseek | DeepSeek | 4 诚实 + 1 恶意 + 治理开 | 10 | 现有 E 组数据 |
| E-zhipu | Zhipu | 同上 | 10 | `npx tsx experiments/v2/run_malicious.ts --group=E --count=10 --provider=zhipu` |
| E-gpt4o | GPT-4o | 同上 | 10 | `npx tsx experiments/v2/run_malicious.ts --group=E --count=10 --provider=openai` |

### 10.3 预先注册假设

**H5：治理效果跨模型方向一致性**

- **原假设 H0**：不同模型上 Δτ(E vs F) 方向不一致
- **备择假设 H1**：不同模型上 Δτ(E vs F) 方向一致（均为正，治理有防御价值）
- **决策规则**：
  - 三模型方向一致且至少 2 个显著 → 跨模型泛化性成立
  - 方向不一致 → 治理效果模型依赖，需报告模型特异性

### 10.4 预期结果

- DeepSeek：现有 E vs C 数据 Δτ=-0.20（治理有效）
- Zhipu：C 组 Δτ=+0.04（治理效果不显著），E 组预期类似
- GPT-4o：未知，但 GPT-4o prompt 遵从性更高，itemBeliefs 数据质量可能更好

### 10.5 风险声明

1. **Zhipu 数据不完整**：B(n=2) + C(n=10) 不足以做完整 A/B/C/D 对照
2. **GPT-4o 成本**：10 次 E 组实验约需 $50-100 API 费用
3. **模型行为差异**：不同模型对恶意 prompt 的易感性不同，可能影响 E 组 τ 基线
4. **prompt 遵从性**：Zhipu 可能不严格输出 itemBeliefs JSON，导致 A3 FM-2.6 检测器失效

### 10.6 实现依赖

- `run_malicious.ts` 已支持 `--provider` 参数（B3 修复）
- `callLLM` 已支持 4 个提供商（deepseek/zhipu/openai/local）
- **当前状态**：命令可用，待跑实验
