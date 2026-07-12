# Limitations

> 本文件诚实记录 SwarmAlpha 的检测器局限、未验证模块、缺失集成和样本量问题。
> 更新日期: 2026-07-12

---

## 1. 实验样本量不足

| 实验 | 条件 | n/组 | 问题 |
|------|------|------|------|
| M&A (5轮) | none, full | 15 | 勉强可用，但 full vs none p=0.36 不显著 |
| M&A (5轮) | shuffle, single-intervention | 10 | 单干预模式 n=10，统计功效有限 |
| Invest (5轮) | none, full | 15 | 功效充分，p=1.0 确认零效应 (d=+0.00) |
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

> **关键提醒**：4 个认知缺陷修复前，治理环路实际处于断裂状态。此前所有实验结论（3轮 d=+0.65 不显著、5轮 d=+0.00、full_reflection p=0.048 等）均在断裂状态下得出，**结论存疑，需在修复后重跑实验**。

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
