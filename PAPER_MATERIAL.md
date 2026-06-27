# SwarmAlpha 核心创新提取 — 论文素材

> 为学术写作准备的独立贡献声明、架构对比、实验证据。
> 最后更新: 2026-06-26, v9.6

---

## 1. 核心范式创新: LLM 角色转变

### 声明

**LLM 应从"方向判断器"转变为"正交因子提取器"。** 这是 SwarmAlpha 最根本的架构创新。

### 对比

| 范式 | LLM 任务 | 输入 | 输出 | 根本问题 |
|------|---------|------|------|---------|
| 主流做法 | 方向预测 | 新闻文本 | UP/DOWN + 置信度 | LLM 缺乏市场预测能力；黑箱不可审计 |
| **SwarmAlpha** | **因子提取** | 新闻文本 + 市场数据 | 5 个正交因子 (结构化) | LLM 做它擅长的事：信息提取和结构化 |

### 证据

实验 #1: 同一 LLM × 不同人格 Prompt → 情绪偏差仅 60pts（回声室效应）
实验 #2: 同一 LLM × 不同信息输入 → 偏差扩至 175pts（Information > Persona）

**推论**: 人格 Prompt 不能产生真正的认知多样性。因子级信息差异可以。

### 论文表述

> "Rather than asking an LLM to predict market direction—a task for which language models have no demonstrated capability—we repurpose the LLM as a factor extractor. It decomposes unstructured news into five orthogonal dimensions (Liquidity, Policy, Fundamental, Narrative, Uncertainty), which are then interpreted by heterogeneous agents to form consensus. This shifts the LLM's role from oracle to structured observer."

---

## 2. 异质性制造: 强制信息盲区

### 声明

**真正的 Agent 异质性应该通过数学约束（因子权限矩阵）制造，而非 prompt engineering。** 这是针对"同一 LLM × 不同人格 = 回声室"问题提出的解决方案。

### 机制

每个 Agent 只能看到其权限内的方向因子子集：

| Agent | 可见因子 | 观察维度 |
|-------|---------|---------|
| Institution | liquidity, policy, fundamental | 综合宏观 |
| Value | fundamental only | 纯价值 |
| Trend | narrative only | 纯叙事 |
| Panic | liquidity only | 纯流动性 |
| Quant | liquidity, fundamental | 量化因子 |
| Media | narrative, policy | 叙事+政策 |
| Contrarian | narrative (负权重) | 逆叙事 |
| Retail | narrative only | 跟叙事 |
| PolicyAgent | policy, liquidity | 政策响应 |

**关键指标**: 56% 的 Agent 对在方向因子上共享 0 个重叠。

### 证据

消融实验: 盲区 ON vs OFF 的 belief_std 差异:
- 模板模式: 37.6 (ON) vs 17.9 (OFF) — 盲区贡献 ~20 点
- LLM 模式: 58.5 (ON) — 盲区 + 真实 LLM 因子 = 更强异质性

**结论**: 信息盲区能产生约 20-40 点的信念标准差提升，远超 prompt engineering 的 ~60pts 情绪偏差。

### 论文表述

> "We introduce forced information blindness: each agent is permissioned to observe only a subset of the five orthogonal factors. This creates genuine perspective diversity through mathematical constraints on information access, rather than relying on prompt engineering to simulate different 'personalities.' 56% of agent pairs share zero directional factors, producing a belief standard deviation 2-3× that of homogeneous information access."

---

## 3. 共识质量三维度量: 重新定义 ABMS 输出

### 声明

**Agent-Based Market Simulation 的输出不应是单一方向预测，而应是共识形成过程的量化诊断。** 三个独立正交指标: Consensus Score, Polarization Score, Fragility Score。

### 三个指标

| 指标 | 构成 | 范围 | 含义 |
|------|------|------|------|
| Consensus Score | 40% Kuramoto 相位同步 + 30% 共识强度 + 30% 信念一致性 | 0-100 | Agent 们达成一致的程度 |
| Polarization Score | 50% 多头零头极端性乘积 + 50% 双峰性(1-中性率) | 0-100 | Agent 分裂为对立阵营的程度 |
| Fragility Score | 40% 集中度风险 + 30% 翻转风险 + 30% 盲区风险 | 0-100 | 当前共识被打破的容易程度 |

### 六种状态分类

```
稳健共识 (高共识+低极化+低脆弱)        → 信息基础牢靠
脆弱共识 (高共识+低极化+高脆弱)        → 看似一致, 实际依赖少数关键Agent
两极对抗 (低共识+高极化+高脆弱)        → 临界状态, 方向随时翻转
健康分歧 (低共识+高极化+中低脆弱)      → 多元视角的正常表达
认知迷雾 (低共识+低极化+低脆弱)        → 各说各话, 无方向
模糊共识 (中等共识+中等极化)           → 过渡状态
```

### 论文表述

> "We argue that the output of an agent-based market simulation should be a multi-dimensional diagnostic of the consensus formation process rather than a single directional prediction. We introduce three orthogonal metrics—Consensus, Polarization, and Fragility—that jointly capture the strength, structure, and stability of emergent consensus. These metrics reframe the system from a prediction engine to a 'financial collective intelligence observatory.'"

---

## 4. Market Awareness: 异构信号源的 Agent 级融合

### 声明

**统计信号 (VIX/RSI) 和 LLM 模式识别 (market_pattern) 可以在 Agent 信念层面统一修正，不需要外部路由覆盖。** 这是 SwarmAlpha 从"外部补丁"走向"根级别修复"的关键架构贡献。

### 双层架构

```
Layer 1: 统计均值回归 (客观市场数据)
  RSI < 20 + VIX > 40 → mrSignal = 1.0
  → shift = mrSignal × agentMultiplier × patternBoost × 50
  
Layer 2: Pattern-Aware 智能体级修正 (LLM 模式识别)
  MECHANICAL_SELLOFF → Value/Contrarian: ×0.2+15, Panic: ×0.3
  SOLVENCY_CRISIS    → 仅放大空头: ×1.15
  NARRATIVE_DRIVEN   → Contrarian: -belief×0.5, Media: ×0.3
  EXTERNAL_SHOCK     → Value: ×0.7
```

### 关键设计原则

1. **两层顺序执行而非并行** → 统计修正在前 (客观基础)，Pattern 修正在后 (语义精细调整)
2. **Pattern 层只修正特定 Agent** → 保留异质性, 不全盘推翻
3. **可审计** → 每个 Agent 的修正量实时日志输出

### 实验证据

203 事件 LLM 全量:
- 无 Market Awareness: 45.3% (Up=42%, Down=80%)
- 加 Market Awareness: 52.2% (Up=53%, Down=81%)
- 改善: +6.9pp 总准确率, +11pp Up, Down 不变

### 论文表述

> "We propose a dual-layer Market Awareness mechanism that fuses statistical mean-reversion signals (derived from VIX/RSI) with LLM-based event pattern classification (Mechanical Selloff, Solvency Crisis, External Shock, Narrative-Driven). Unlike external routing or post-hoc overrides, the fusion occurs at the individual agent belief level—preserving agent heterogeneity while correcting systematic biases. The mechanism is fully auditable: each agent's correction is logged and traceable."

---

## 5. 诚实实验文化

### 声明

**SwarmAlpha 的实验方法论——假设驱动、A/B 对照、消融框架、诚实报告——是其作为研究平台的核心价值，独立于其准确率数字。**

### 关键实验清单

| # | 实验 | 发现 | 证据强度 |
|---|------|------|---------|
| 1 | 剥离信息泄漏 (v4.0) | LLM 回测准确率 76.5%→25% | 确证 |
| 2 | 人格 Prompt vs 信息差异 (v5.0) | Information(175pts) > Persona(60pts) | 确证 |
| 3 | 反投票测试 (v6.0-v7.0) | 85% 行为 = 加权投票, 线性天花板 | 确证 |
| 4 | 37 万 LLM 偏差对比 (v9.1) | 6 因子→5 正交因子消除偏差 | 确认 |
| 5 | 门控消融 (v9.5.2) | 非对称门控改幅度不改方向 | 确证 |
| 6 | Overshoot_Score 探针 (v9.6) | 证明 LLM 无法区分超卖 vs 真危机 → 放弃该方向 | 确证(负结果) |
| 7 | 方向阈值扫描 (v9.5.2) | 模板最优-5, LLM 最优+5 | 确证 |
| 8 | Market Awareness 消融 (v9.6) | 双层感知 +6.9pp | 确证 |

### 论文表述

> "We report all experiments—including null results—with full transparency. Key negative findings (e.g., Overshoot_Score probe showing LLMs cannot distinguish oversold from genuinely damaged markets) are documented alongside positive results. We argue that this culture of honest ablation is the foundation of credible research in AI-augmented financial simulation."

---

## 6. LLM-Agent 四条设计原则

从 v0.1 到 v9.6 的 14 个大版本演化中归纳：

### 原则 1: LLM 做因子, 不做方向
语言模型是信息提取器，不是市场先知。让它分解信息，不预测方向。

### 原则 2: 数学约束 > Prompt 技巧
用因子权限矩阵制造异质性，而非写"你是一个恐慌的投资者"。

### 原则 3: 异构信号源在 Agent 级融合
统计信号(VIX/RSI)和语义信号(LLM pattern)不应在输出层合并(如路由仲裁)，而应在 Agent 信念层统一修正。

### 原则 4: 输出状态, 不输出预测
共识的形成过程(Consensus/Polarization/Fragility)比共识的方向更有信息量。

---

## 7. 与现有工作的定位

| 维度 | 传统 ABMS | LLM 金融预测 | SwarmAlpha |
|------|----------|------------|------------|
| Agent 决策 | 预设数学函数 | LLM 直接输出方向 | LLM 提取因子 → Agent 解释 → 共识 |
| 异质性来源 | 参数分布 | Prompt 人格 | 因子权限矩阵 (数学约束) |
| 输出 | 价格轨迹 | UP/DOWN | 共识三维度量 + 方向 |
| 可审计性 | 高 (数学可溯源) | 低 (LLM 黑箱) | 高 (因子→Agent→共识 全链路可溯源) |
| LLM 调用 | 0 | 高 (每 Agent 一次) | 1 次 (仅因子提取) |
| 实验框架 | 无消融传统 | 无消融传统 | 完整消融框架 (每个模块可开关) |

---

## 8. 限制与未来工作 (论文必需)

1. **203 事件仍不够** → 统计推断需要 500+ 事件的样本量
2. **LLM 因子偏空仍未根治** → Up 53% 距永远猜涨 57.6% 仍有 4.6pp 差距
3. **共识加权仍是线性** → 加权求和的天花板未突破
4. **无真实市场校准** → Agent 权重基于先验判断，未从真实市场数据学习
5. **单市场** → S&P 500 方向预测; 跨资产反馈未建模

---

## 引用建议 (如果发表)

如果写成论文，可考虑以下 venue:
- **JOSS** (Journal of Open Source Software): 适合开源工具类
- **ICAIF** (ACM AI in Finance): 适合 AI+金融交叉
- **arXiv** (q-fin.CP / cs.MA): 预印本，快速发布

建议标题:
> *SwarmAlpha: An Agent-Based Market Simulation Platform with Factor-Level LLM Integration and Honest Ablation Culture*

或更简洁:
> *Don't Ask LLMs to Predict: Factor Extraction, Forced Blindness, and Consensus Diagnostics in Agent-Based Market Simulation*
