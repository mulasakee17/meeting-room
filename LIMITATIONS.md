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
