# 🐜 SwarmAlpha

> 一个高一学生用两个月 Vibe Coding 打造的金融多智能体共识推演系统
>
> *Built by a 15-year-old in 2 months of AI-assisted coding*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8)](https://tailwindcss.com/)
[![Lines of Code](https://img.shields.io/badge/Code-14,000_lines-orange)]()
[![Accuracy](https://img.shields.io/badge/模板-50%25_60事件_v9.2_Hybrid-brightgreen)]()
[![Best](https://img.shields.io/badge/最佳_LLM-51.7%25_60事件_仅Rule1_Down_100%25-success)]()
[![Version](https://img.shields.io/badge/version-9.6-purple)]()
[![LLM](https://img.shields.io/badge/LLM-52.2%25_203事件_Up53%25_Down81%25-brightgreen)]()
[![Events](https://img.shields.io/badge/事件库-203_1970--2025-orange)]()
[![V9.6](https://img.shields.io/badge/V9.6_MarketAware-双层感知_模式识别_均值回归-orange)]()
[![V9.5](https://img.shields.io/badge/V9.5-社交互动层_+_共识度量-blue)]()
[![V9.3](https://img.shields.io/badge/V9.3_Neutral-四规则引擎_beliefStd_LLM_58.5-blue)]()
[![Eval](https://img.shields.io/badge/评估-PROJECT__EVALUATION.md-orange)]()

---

## 🧑‍💻 谁在做这个？

我是一个**高一学生**。两个月前，我第一次打开 Cursor，写下了第一行 AI 辅助的代码。

在此之前，我没有系统学过编程。没有 CS 学位，没有金融背景，没有导师。

我有的只是：
- 对金融市场的强烈好奇心（索罗斯的《金融炼金术》读了三遍）
- 一个想法：**如果让 AI Agent 模拟市场中不同参与者的博弈，能不能推演出市场情绪的走向？**
- 以及 2026 年的 AI 工具——它让一个 15 岁的孩子可以建造过去需要整个量化团队才能建造的东西

两个月后，SwarmAlpha 诞生了。

---

## 🎯 这是什么？

输入一条金融新闻，**9 个拥有不同决策框架和资本权重的 AI Agent** 进行涌现式市场共识推演——机构投资者、价值投资者、趋势交易者、恐慌投资者、量化基金、媒体叙事者、逆向投资者、散户、政策响应分析师——不是简单投票，而是通过影响力网络、信念扩散、资金流模拟形成市场共识。

**v9.6 现状**：经过 14 个大版本的假设驱动演化，系统已升级为**正交五因子 × 强制信息盲区 × 非对称门控 × 四规则 Neutral × Agent 社交互动 × 共识度量 × 动态权重 × 🆕 Market Awareness 双层感知**的 ABMS 平台。LLM 不仅提取 5 个正交因子——还识别事件模式（机械抛售/偿付危机/外部冲击/叙事驱动），结合 VIX/RSI 统计信号，在 Agent 级别执行精细化信念修正。203 事件 LLM 全量 52.2%（Up 53%, Down 81%），首次在**不依赖外部路由覆盖**的情况下接近永远猜涨基线。

[📋 完整项目评估](PROJECT_EVALUATION.md) — 7版本演化、13项实验发现、理论上限、诚实判定

```
输入："2020年3月，新冠疫情全球爆发，美股四次熔断..."

  🏦 Institution (机构): "估值分位进入历史底部，等待政策信号"  信念: +15  (资本95 影响力90)
  💎 Value      (价值): "RSI<20 = 历史胜率78%，恐慌折价显著"   信念: +65  (资本80 影响力60)
  🏄 Trend      (趋势): "趋势明确向下，均线死叉，不接飞刀"      信念: -70  (资本50 影响力45)
  😱 Panic      (恐慌): "完了完了！所有人都在卖！！！"           信念: -90  (资本40 影响力25)
  🤖 Quant      (量化): "RSI<25+VIX>35 = 强买入信号(胜率72%)"  信念: +45  (资本75 影响力55)
  📡 Media      (媒体): "崩盘叙事加速传播，但饱和度已近极值"     信念: -55  (资本10 影响力70)
  🦉 Contrarian (逆向): "共识极度看空——历史上反转概率升高"     信念: +50  (资本60 影响力40)
  🐜 Retail     (散户): "社交媒体都在说崩了...我也好慌"          信念: -40  (资本20 影响力10)

  ↓ 影响力网络扩散 + 信念更新 (纯数学，3轮)...

  共识: -8 (中性偏空)  ← 影响力加权: Institution+Value+Quant+Contrarian 制衡空头联盟
  资金流: -18.5 (净卖出压力有限)
  价格Δ: -1.8%
  Regime: SYSTEMIC_COLLAPSE
  涌现: PANIC_SELLING + CONTRARIAN_SURGE
```
- 旧版 5 Agent 投票 → 共识 -56（严重偏空，被空头联盟绑架）
- **v9.5.2 9 Agent + 动态权重 → 共识 -5**（PolicyAgent 制衡 + 恐慌模式下权重自适应调整）

**灵感来源：索罗斯的反思性理论（Reflexivity）**——市场参与者的认知会反过来影响市场本身。这个项目试图用 AI Agent 来模拟这个反馈循环。

---

## ✨ 为什么这件事值得关注？

### 1. AI-Native 开发者的崛起

我不需要理解 Transformer 的数学原理就能搭建一个使用 5 个 LLM Agent 的系统。我不需要学量化金融就能实现 LSTM 价格预测。AI 工具抹平了知识和执行之间的鸿沟。

**两个月、一个人、14000 行代码**。这在两年前是不可能的。

### 2. 诚实的实验精神

市面上大多数 AI 金融工具会夸大准确率。SwarmAlpha 的不同在于：

| 常见做法 | SwarmAlpha |
|---------|-----------|
| 用信息泄漏制造虚高数字 | 严格回测，剥离一切事后信息 |
| 隐藏失败案例 | 公开三个系统全部结果（0%、0%、25%） |
| 声称"AI 预测市场" | 坦诚"不如抛硬币，这是学习项目" |
| 准确率数字是营销 | 准确率数字是工程反馈 |

在严格回测中，混合预测准确率 25%（随机 33%）。旧版曾报告"76.5%"，经自查发现来自信息泄漏，已在 v4.0 中剥离并公开纠正。这个诚实的过程比虚高的数字更有价值。

### 3. 从"玩具"到"工具"的路径清晰

- **v0.1**: 5 Agent 博弈 Demo
- **v2.0**: 技术指标 + ML 预测（模拟）集成
- **v3.0**: 事件分类器 + 混合预测引擎
- **v4.0**: 剥离信息泄漏，严格回测 → 发现准确率 < 随机
- **v4.1**: 根因分析 + 参数修复 → 64.3%（14事件，模拟LLM）
- **v5.0**: 信息不对称架构 + Super AI 协调器 + 30散户 → 36%（真实LLM）
- **v6.0**: 涌现式市场共识 → 50%（0次LLM），Up事件14%→43%
- **v6.1**: 非线性共识聚合（修剪/中位数/级联）→ 修剪共识 **64%**（14事件，+14pp）
- **v7.0**: 异质决策+反身性闭环+去中心化观察 → 涌现评分100/100，异质std=50.6(vsV6=15)
- **v8.0**: 🚀 非线性共识引擎 — Kuramoto耦合振子 + 5种非线性聚合 + 随机Agent生命周期
- **v8.1**: 🔬 动态聚类 + Beta漂移 — 聚类+动态K **71.7%**（60事件），Up 8%→72%，首次超越永远猜涨基线（+11.7pp），vs线性差异16.5pt
- **v9.0**: 🧬 因子基Agent架构 — LLM从"方向判断器"变为"因子提取器"，强制信息盲区，政策Agent，不确定性引擎，完整消融框架
- **v9.1**: ⭐ **正交五因子引擎** — 旧6因子互相污染（有效维度~3），新5因子严格正交。LLM因子belief_std **57.9**（盲区ON）vs 17.9（盲区OFF），40点振幅证明盲区真实生效。盲区成本从-16.7pp→-5.0pp
- **v9.2**: 🚀 **Hybrid 非对称门控** — 同时计算 KMeans 聚类共识 + 线性加权共识，非对称门控（KMeans < -15→采信聚类, else→Fallback 线性）。模板上下文感知升级（中文政策关键词+恢复信号+反偏空护栏）。Up 22%→**50%**(+28pp)，总准确率 40%→**50%**(+10pp)
- **v9.3**: 🛡️ **四规则 Neutral Detection Engine** — Rule1(双共识弱信号)+Rule2(高分歧)+Rule3(低同步)+Rule4(高不确定+弱共识)。分离门控前/后共识避免干扰。LLM 模式 belief_std **58.5**，仅Rule1 配置 **51.7%** 总准确率、**Down 100%**。Neutral Recall LLM 57%（vs 模板 0%）
- 🗄️ 事件库扩充 **14→60**（金融危机/疫情/银行/战争/AI/监管，6大类别）
- 📋 [完整项目评估](PROJECT_EVALUATION.md) — 7版本演化、13项实验发现、理论上限、诚实判定

---

## 🏗️ 系统架构

### v6.0 涌现式市场共识引擎

```
用户输入新闻
    │
    ├──→ SEED PHASE (1次 LLM 调用)
    │    └── Super AI 协调器 → 8 份不对称信息简报
    │         ├── 🏦 Institution: 宏观估值分位 + 政策信号
    │         ├── 💎 Value: RSI/超卖折价 + 历史胜率
    │         ├── 🏄 Trend: 趋势方向/强度 + 反转信号
    │         ├── 😱 Panic: 周围情绪 + 损失感受
    │         ├── 🤖 Quant: 统计概率 + 历史相似特征
    │         ├── 📡 Media: 叙事传播速度 + 饱和度
    │         ├── 🦉 Contrarian: 共识极端程度 + 少数派信号
    │         └── 🐜 Retail: 社交媒体情绪 + 朋友说了什么
    │
    ├──→ SIMULATION PHASE (纯数学，3轮)
    │    ├── Market Regime 检测 → 调整 Agent 影响力权重
    │    │   ├── LIQUIDITY_CRISIS    → 加强 Value/Institution
    │    │   ├── VALUATION_CORRECTION → 价值派主导
    │    │   ├── NARRATIVE_BUBBLE    → 叙事驱动 + 逆势警觉
    │    │   └── SYSTEMIC_COLLAPSE   → 降低抄底力量
    │    │
    │    ├── Influence Network 构建 → 影响力加权 (替代 mean)
    │    │   共识 = Σ(belief × influence × confidence) / Σ(influence × confidence)
    │    │   Institution(90影×85信) ≈ 76.5票  vs  Retail(10影×40信) ≈ 4票
    │    │
    │    ├── Belief Update: info_impact + social_influence + narrative_pressure
    │    │   快反者(Panic:95速)全量接收信息; 自信者(Inst:85信)抵抗社会影响85%
    │    │
    │    ├── Capital Flow: buy/sellPressure = Σ(belief × capital × confidence)
    │    │
    │    ├── Price Formation: ΔPrice = tanh(netFlow/totalCap × 2.5) × vol × 5
    │    │
    │    └── Emergent Behaviors (纯诊断，不干预)
    │         HERDING | PANIC_SELLING | FOMO | NARRATIVE_BUBBLE |
    │         CONTRARIAN_SURGE | CONSENSUS_COLLAPSE
    │
    └──→ hybridPredict (校准系统融合)
         ├── 事件分类器 (V_REBOUND / L_DECLINE / W_RECOVERY)
         ├── 结构损伤评分 (杠杆/偿付/VIX/政策)
         └── 输出: 方向 + 预测值 + 置信度 + 涌现行为
```

### v7.0 异质决策 + 反身性闭环 (实验)

```
用户输入新闻 + 市场数据
    │
    ├──→ WorldModel 构建（VIX/RSI/跌幅/政策/结构损伤/估值分位/恐惧指数）
    │
    ├──→ Agent.Observe() × 8 （去中心化 — 每个Agent观察不同维度）
    │    ├── 🏦 Institution: 7维（估值/政策/流动性/宏观）
    │    ├── 💎 Value: 5维（RSI/估值/VIX/政策）
    │    ├── 😱 Panic: 5维（VIX/恐惧/跌幅/社交情绪）
    │    ├── 🤖 Quant: 5维（RSI/VIX/历史概率/波动率）
    │    └── ... 每Agent 4-7维，93% Agent对观察不同信息
    │
    ├──→ 异质决策函数 × 8 （5种不同函数形态！）
    │    ├── Threshold (Institution, Value): 极端条件跳变，否则维持
    │    ├── Sigmoid (Panic): S型情绪响应 — 温和信号无反应，临界点后剧烈跳变
    │    ├── Step (Retail): 离散阶跃 — 好=全买，坏=全卖，不确定=不动
    │    ├── Contrarian (Contrarian): |共识|>阈值 → 自动反向
    │    └── Statistical (Quant): 纯历史概率驱动
    │
    └──→ 反身性闭环 ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
         │                                   │
         ├── 共识 (影响力加权)                │
         ├── 资金流 (belief × capital × conf) │
         ├── 价格变化 (tanh非线性映射)         │
         ├── 叙事引擎 (Price → Narrative)     │
         ├── 叙事冲击 → 下轮信念修正 ─ ─ ─ ─ ┘
         │
         ├── 级联系统 (相变检测)
         │   PANIC_CASCADE | FOMO_CASCADE | LIQUIDITY_CRISIS |
         │   NARRATIVE_CASCADE | CONTRARIAN_BACKLASH
         │
         └── 输出: 共识方向 + 价格轨迹 + 级联事件 + 涌现评分
```

### v8.0 非线性涌现共识引擎 (🆕 核心突破)

```
用户输入新闻 + 市场数据
    │
    ├──→ SEED PHASE: 模板简报（8 份不对称信息，确定性）
    │
    ├──→ SIMULATION PHASE（N 轮）
    │    │
    │    ├── Market Regime 检测 → 调整耦合强度
    │    │
    │    ├── 🎲 随机 Agent 生命周期
    │    │   ├── 随机失败（2%/轮，模拟破产/策略失效）
    │    │   ├── 新 Agent 进入（🦔对冲基金 ⚡高频 🏛️养老基金 🦈激进投资者 🐋巨鲸 🛡️保险）
    │    │   ├── 参数漂移（5维参数随机游走）
    │    │   └── Agent 复活（冷却后参数重置+创伤记忆）
    │    │
    │    ├── 信念更新（信息+社会+叙事，纯数学）
    │    │
    │    ├── 🔬 Kuramoto 耦合振子动力学
    │    │   ├── dθ_i/dt = ω_i + Σ K_ij × sin(θ_j - θ_i) + η_i(t)
    │    │   ├── 序参量 r = |Σ e^(iθ_j)| / N（0=完全分散, 1=完全同步）
    │    │   ├── 同步状态: INCOHERENT → PARTIAL_SYNC → WEAK_SYNC → STRONG_SYNC
    │    │   ├── 嵌合体检测（板块轮动信号）
    │    │   └── 相变检测（同步↔去同步临界点）
    │    │
    │    └── 📐 非线性共识聚合（5种方法可切换）
    │         ├── 线性加权 (v6 baseline)
    │         ├── 幂律共识: sign(b) × |b|^α × weight, α自适应
    │         ├── 熵权共识: 高熵压降，低熵放大
    │         ├── 聚类共识: K-means 取最大簇的加权均值 🥇
    │         └── 几何平均共识: 零信念强抑制
    │
    └──→ 输出: 共识 + 方向 + 序参量 + 相变事件 + 生命周期统计
```

**核心突破**: 线性共识 `Σ(belief×weight)/Σweight` 的输出永远在输入凸包内 → 不能创造信息。非线性共识（特别是聚类）可以输出超出输入范围的共识值。vs线性差异从 v6 的 6.7pt 提升到 v8 的 **13.3pt**——几乎翻倍。

### v9.1 正交五因子架构 (🆕 核心突破)

```
用户输入新闻 + 市场数据
    │
    ├──→ FACTOR EXTRACTION (1次LLM 或 模板)
    │    ├── 正交五因子 Prompt (禁止 Bullish/Bearish/涨/跌/Sentiment)
    │    │
    │    ├── Factor 1 — Liquidity (-100..+100): 融资环境影响
    │    │   负值: 资金收缩/信用紧张  |  正值: 资金宽松/信用扩张
    │    │
    │    ├── Factor 2 — Policy (-100..+100): 政策支持力度
    │    │   必须独立于事件评估 — 极度利空事件也可能有高政策支持
    │    │
    │    ├── Factor 3 — Fundamental (-100..+100): 实体经济影响
    │    │   盈利下降/经济收缩  |  生产率提升/盈利改善
    │    │
    │    ├── Factor 4 — Narrative (-100..+100): 传播持久性
    │    │   评估传播能力, 而非情绪方向 ← 关键突破
    │    │
    │    └── Factor 5 — Uncertainty (0..+100): 认知模糊度
    │        不能有负数 — 纯不确定性度量
    │
    │    ⚠️ 正交性检测: 若4方向因子全部同号 → 警告并重新审查
    │
    ├──→ AGENT INTERPRETATION (8+1 Agents, 纯数学)
    │    │
    │    ├── 强制信息盲区 (方向因子56% Agent对无重叠)
    │    │   ├── 🏦 Institution  → [liquidity, policy, fundamental]  盲 narrative
    │    │   ├── 💎 Value       → [fundamental]                      盲 liquidity/policy/narrative
    │    │   ├── 🏄 Trend       → [narrative]                        盲 其余全部
    │    │   ├── 😱 Panic       → [liquidity]                        盲 其余全部
    │    │   ├── 🤖 Quant       → [liquidity, fundamental]           盲 policy/narrative
    │    │   ├── 📡 Media       → [narrative, policy]                盲 liquidity/fundamental
    │    │   ├── 🦉 Contrarian  → [narrative] (负权重 -1.2)          盲 其余全部
    │    │   ├── 🐜 Retail      → [narrative]                        盲 其余全部
    │    │   └── 🏛️ PolicyAgent→ [policy, liquidity]                零资本, 只影响共识
    │    │
    │    ├── uncertainty 因子始终可见 (元因子, 调节置信度)
    │    │   Panic: uncertainty×1.2 → 信心骤降
    │    │   Contrarian: uncertainty×(-0.5) → 不确定性=机会, 信心上升
    │    │   Value: uncertainty×(-0.2) → 不确定性=错误定价
    │    │
    │    └── 信念计算: rawBelief = Σ(factor.value × weight × conf/100) / Σ(|weight| × conf/100)
    │        然后按解释风格做非线性变换 (sentiment×1.3 / contrarian反转 / value×1.15)
    │
    ├──→ CONSENSUS QUALITY ENGINE (行为层检测)
    │    ├── Rule 1: |共识| < 15 → +40分
    │    ├── Rule 2: belief_std > 45 → +35分
    │    ├── Rule 3: 最大簇占比 < 40% → +25分
    │    └── score ≥ 50 → NEUTRAL ("系统不知道")
    │
    └──→ 输出: 共识方向 + 置信度 + belief_std + 因子向量 + 正交性警告
```

**核心突破**: 旧6因子体系中 valuation/structural/sentiment/momentum 高度重叠 → 有效维度仅 3-4 → 盲区形同虚设（belief_std: 盲区ON≈OFF≈38）。新5因子严格正交 → 盲区产生真正的视角差异（belief_std: 盲区ON=57.9 vs OFF=17.9, **40点振幅**）。

**与 v8.1 的关系**: v8.1 (聚类+动态K 71.7%) 是准确率领先者。v9.1 是架构领先者——提供了严格正交的因子表示、可审计的解释链、完整的消融框架。两者解决不同问题：v8.1 解决"怎么聚合"，v9.1 解决"信息从哪来"。

### v9.2-Hybrid 非对称门控共识 (🆕 共识层突破)

```
v9.1 线性加权共识
    │
    ├── 问题: KMeans 聚类共识 Down 100% 但 Up 暴跌至 22%
    │         → 最大权重簇绑架少数派多头信号
    │
    └── v9.2-Hybrid 解决方案:
         ├── 同时计算 KMeans 聚类共识 + 线性加权共识
         ├── 非对称门控 (Asymmetric Gate):
         │   KMeans < -15 → 采信聚类 (强空头信号, 保留 Down 100%)
         │   KMeans >= -15 → Fallback 线性 (多头/模糊区, 保护少数派)
         │
         └── 模板升级 (上下文感知):
             ├── 15+ 中文政策关键词 (注入流动性/平准基金/兜底/协调救助)
             ├── 恢复/解决信号检测 (V型复苏/反弹/收复跌幅)
             ├── 反偏空护栏 (强政策→fundamental封底; RSI<10→强制非负)
             └── 系统性威胁独立分级 (大萧条/连锁倒闭 vs 普通危机)

关键指标变化 (模板, 60事件):
  Up 准确率:   22% → 50%  (+28pp ✨)
  Down 准确率: 82% → 71%  (-11pp, 旧值含虚高偏空偏差)
  总准确率:    40% → 50%  (+10pp)
  Neutral:     29% → 0%   (模板因子过强触发, v9.3 解决)
```

### v9.3 Neutral Detection Engine (🆕 四规则体系)

```
v9.2 问题: Neutral 0% — 旧评分制 (scoring>=50) 在模板升级后永远不触发
           belief_std 均值降至 37.6, divergenceThreshold=55 绝缘

v9.3 四规则 Neutral Detection Engine:
    │
    ├── Rule 1: abs(linearConsensus) < 15 AND abs(clusterConsensus) < 15
    │   → 两种共识方法一致显示弱信号 → 真正的方向模糊
    │   🔑 关键设计: Neutral 检测使用门控前的 linearConsensus,
    │      避免 KMeans 门控放大后绕过弱共识检测
    │
    ├── Rule 2: belief_std > 45 → Neutral candidate (高分歧)
    ├── Rule 3: kuramoto_r < 0.4 → Neutral candidate (低同步)
    ├── Compound: Rule2 AND Rule3 → 高分歧且失同步 (各说各话)
    │
    ├── Rule 4: uncertainty > 70 AND abs(linearConsensus) < 25
    │   → 高事件不确定性 + 弱共识 → 迷雾中看不清
    │   🔑 不同于原始设计的独立 OR: 需要共识也弱才触发,
    │      避免高VIX但有强共识的事件被误Neutral
    │
    └── 方向判定 (不在 Neutral 时):
        consensus >= 15 → UP
        else → DOWN  (简洁二分类, 移除旧版 -10~+10 模糊区)

LLM vs 模板模式差异:
  指标              模板               LLM
  belief_std        37.6              58.5 (+21, R2激活!)
  R2∧3 触发次数      0                 11 (R2从绝缘→激活)
  仅Rule1 总准确率   50.0%             51.7%
  仅Rule1 Down       71%               100% ✨
  Neutral Recall     0%                57% (Full模式)
```

### v9.5 社交互动层 + 共识度量 + v9.5.2 动态权重 (🆕 群体智慧层)

在 v9.3 正交五因子引擎之上叠加三个纯增量模块（零 LLM 调用，零 v9.3 代码修改）：

**v9.5 社交互动层** — Agent 观察彼此观点后更新信念：
- 核心公式：`b_i_new = (1-α_i) × b_i_old + α_i × peer_avg_visible`
- 可见性约束：Agent 只能看到有因子重叠的其他 Agent（天然信息茧房）
- 收敛检测：信念变化 < 2 → 收敛，连续 3 轮 std 增长 → 发散
- 8+1 社交开放度预设：Panic(0.70) 最易受影响，Value(0.05) 最独立，Contrarian(-0.15) 逆向

**v9.5 共识度量** — 三个新指标重新定义系统输出：
- Consensus Score (0-100)：Kuramoto 相位同步度 + 共识强度 + 一致性
- Polarization Score (0-100)：阵营极端性 + 双峰性
- Fragility Score (0-100)：集中度风险 + 翻转风险 + 盲区风险
- 6 种状态标签：稳健共识 / 脆弱共识 / 两极对抗 / 认知迷雾 / 健康分歧 / 模糊共识

**🆕 v9.5.2 动态权重引擎** — 场景自适应影响力调整：
- 恐慌模式（VIX>35 / std>50 / Panic<-70）：Panic×1.40, Institution×1.15, Retail×0.70
- 政策模式（Policy因子>70 / PolicyAgent>60）：PolicyAgent×1.40, Institution×1.15, Trend×0.80
- 价值洼地（Fundamental<-50 ∧ Uncertainty>70）：Value×1.50, Contrarian×1.30, Trend×0.60
- 乘法合成 + [0.3, 3.0] 钳制，Quant/Media 保持静态稳定器
- UI 实时展示模式触发状态 + 权重调整对比 + 动态共识 vs 静态共识

```
指标               v9.3 (纯因子)      v9.5+v9.5.2 (互动+动态权重)
Agent 数量          8                  9 (含 PolicyAgent)
共识计算            线性+KMeans         线性+KMeans + 社交互动修正 + 动态权重
共识质量            单一 consensus      共识/极化/脆弱性 三维指标
市场适应            静态权重            恐慌/政策/价值 三模式自适应
LLM 调用            1 次 (因子提取)     1 次 (因子提取, 其余全数学)
```

### 🆕 v9.5.2 V 型反弹路由仲裁 — 组合分类器 + LLM 共识

**问题**: LLM 因子偏空导致 V 型反弹事件系统性误判（Up 仅 32%），但 Down 完美（100%）。
**方案**: 在 API 层实现轻量仲裁——事件分类器 V2 检测到高置信 V_REBOUND 时覆盖为 UP。

```
路由逻辑:
  classifyEvent(marketData) → V_REBOUND ∧ vScore > lScore × 3 ?
    ├─ YES → UP (分类器 100% V弹 recall, 高置信双确认)
    └─ NO  → 信任 LLM 共识 (保护 Down 100% 准确率)
```

**78 事件 LLM 模式实测**:

| | 总准确率 | Up | Down | 超越永远猜涨 |
|------|---------|-----|------|-------------|
| LLM 基线 (threshold=+5) | 48.7% | 32% | **100%** | ❌ |
| **+ 路由仲裁** | **66.7%** | **77%** | 75% | ✅ +10.3pp |
| 永远猜涨基线 | 56.4% | 100% | 0% | — |

> 🔑 路由仲裁触发 35/78 次（45%），净收益 +14 个正确预测。**首次在 LLM 模式 78 事件上超越永远猜涨基线。**

### 🆕 v9.6 Market Awareness — 双层感知修正 (根级别)

**问题**: LLM 因子 + 共识引擎在 UP 事件上系统性偏空。78→203 事件扩展后 Up 仍仅 34-48%。
**方案**: 合并两层修正——Layer 1 统计均值回归(VIX/RSI) + Layer 2 Pattern-Aware 智能体级信念修正(LLM 模式识别)。

```
Layer 1: VIX/RSI 统计信号 → 均值回归 shift (仅对负信念)
Layer 2: LLM 模式识别 → Agent 级精细化修正:
  MECHANICAL_SELLOFF → Value/Contrarian: ×0.2+15, Panic: ×0.3
  SOLVENCY_CRISIS    → 仅放大空头: ×1.15 (不碰多头)
  NARRATIVE_DRIVEN   → Contrarian: -belief×0.5, Media: ×0.3
  EXTERNAL_SHOCK     → Value: ×0.7 (降低抄底冲动)
```

**203 事件 LLM 全量演进**:

| | Total | Up | Down |
|------|------|-----|------|
| LLM 旧 prompt | 45.3% | 42% | 80% |
| + 新 prompt + Pattern | 48.8% | 48% | 80% |
| **+ Market Awareness** | **52.2%** | **53%** | **81%** |
| 永远猜涨基线 | 57.6% | — | — |

> 🔑 从旧 prompt 到 Market Awareness：**+6.9pp 总准确率，+11pp Up，Down 始终 80%+**。首次在**不依赖外部路由覆盖**的情况下将 Up 提升至 53%。Pattern 层日志实时可见，每个 Agent 的修正可审计。

### v6.0 涌现式共识 (主干，0次LLM)

---

## 📊 回测验证

### 非线性共识基准测试（60 事件，确定性）

比较 8 种共识变体 vs 线性基线。核心问题：**非线性公式是否创造了线性聚合无法产生的信息？**

| 方法 | 准确率 | Up (36) | Down (17) | Neutral (7) | vs线性差异 |
|------|--------|---------|-----------|-------------|-----------|
| 🥇 **聚类+动态K 🆕** | **71.7%** | **72%** | **100%** | 0% | **+16.5pt** |
| 🥈 聚类+Beta+动态K 🆕 | 70.0% | 72% | 94% | 0% | +17.2pt |
| 🥉 聚类共识 (v8.0) | 58.3% | 50% | 100% | 0% | +10.5pt |
| 聚类+Beta漂移 | 58.3% | 53% | 94% | 0% | +11.8pt |
| 幂律共识 | 48.3% | 31% | 94% | 29% | +2.2pt |
| 线性加权 (v6) | 33.3% | 8% | 88% | 29% | 基线 |
| 永远猜涨基线 | **60.0%** | — | — | — | — |

> 🔑 **聚类+动态K 首次超越永远猜涨基线**（71.7% vs 60%，+11.7pp）。这是整个项目历史上第一个在所有事件集上同时超越"永远猜涨"和"线性共识"的方法。
>
> **动态K 原理**：根据 Kuramoto 序参量 `r` 自适应调整聚类数 —— r>0.7（高度同步）→ k=2（统一方向），r<0.3（分散）→ k=5（smart money 独立判断）。vs线性差异从 v6=6.7pt → v7=7.6pt → v8.0=10.5pt → **v8.1=16.5pt**。
>
> **Beta 漂移对动态K是多余的**：动态K已经通过自适应粒度捕捉了方向，额外向上偏置反而导致一个 Down 事件误判（94% vs 100%）。

### v8.5 科学验证报告

**测试配置**: 60 事件 × 3 项测试（全量基准 / 样本外交叉验证 / 蒙特卡洛稳定性）

| 测试项 | 判定 | 详情 |
|--------|------|------|
| 全量基准超越永远猜涨 | ✅ PASS | 71.7% vs 60.0% +11.7pp |
| 样本外泛化 (<10pp 衰减) | ✅ PASS | 训练 72.5% → 测试 70.0% (仅 2.5pp 衰减) |
| 蒙特卡洛稳定性 (<5% 翻转) | ❌ FAIL | 方向翻转率 11.6% (50次模拟中 ~6次方向改变) |
| Down 事件可靠性 (≥90%) | ✅ PASS | 100.0% (17/17) |
| Up 事件提升 (≥50%) | ✅ PASS | 72.2% (线性: 8.3%) |
| **通过率** | **4/5** | — |

**蒙特卡洛深度分析**（5% 高斯噪声 × 50 次 × 60 事件 = 3000 次模拟）:

| 指标 | 数值 |
|------|------|
| 总准确率 (3000次) | **71.8%** (与确定性 71.7% 一致) |
| 方向翻转率 | 11.6% |
| 零翻转事件 | **18/60 (30%)** — 50次方向完全一致 |
| 高准确率事件 (≥80%) | **39/60 (65%)** — 系统高度自信且正确 |
| 系统性错误事件 (<20%) | 10/60 (17%) — 集中在 bank_crisis 和 tech_narrative |
| 共识值平均标准差 | ±12pt (信念尺度 -100..+100) |

> 🔑 **稳定性深度解读**: 11.6% 翻转率不是 bug——它说明系统在 17% 的事件上是"知道自己不知道"的。65% 的事件上系统高度稳定（≥80% 准确率）且正确。真正的风险在 bank_crisis (36.4%) 和 tech_narrative (50%)——需要更好的危机/叙事信号。
>
> 运行: `npx tsx test/v8.5-validation.ts` (模板) | `npx tsx test/v8.5-validation.ts --llm` (真实DeepSeek)

### LLM 简报 vs 模板简报 对比

| 指标 | 模板简报 | LLM简报 (DeepSeek) | 提升 |
|------|---------|-------------------|------|
| 线性基线准确率 | 26.7% | **55.0%** | **+28.3pp** |
| Down 准确率 | 58.8% | **100.0%** | +41.2pp |
| MC 方向翻转率 | 12.7% | **1.2%** | -11.5pp |
| 样本外 (20事件) | 55.0% | **60.0%** (=基线) | +5.0pp |

> 🔑 **LLM 简报是单一最大提升**。真实 DeepSeek 生成的不对称简报比模板简报多提供了 ~28pp 的信息量。MC 翻转率降至 1.2%，系统从"中等稳定"跃升至"高度稳定"。LLM 简报缓存于 `.llm-brief-cache.json`，后续运行零成本。

### v9.1 正交五因子消融实验（60 事件，LLM 因子提取）

**核心问题**: 新架构是否建立了真正的 Agent 异质性？

| 变体 | 准确率 | Up | Down | Neutral | Δ vs 基线 | belief_std |
|------|--------|-----|------|---------|-----------|------------|
| **完整V9 (基线)** | **38.3%** | 44% | 29% | 29% | 基线 | **57.9** ✅ |
| 无政策Agent | 36.7% | 42% | 29% | 29% | -1.7pp | 60.4 ✅ |
| 无共识质量引擎 | 45.0% | 53% | 35% | 29% | +6.7pp | 57.9 ✅ |
| 无信息盲区 | 43.3% | 50% | 35% | 29% | +5.0pp | 17.9 ❌ |
| 无Agent异质性 | 43.3% | 50% | 35% | 29% | +5.0pp | 18.7 ❌ |
| 永远猜涨基线 | 60.0% | — | — | — | — | — |

> 🔑 **belief_std 从 57.9 → 17.9（关闭盲区后暴跌40点）**。这是 V9 最核心的突破：正交因子 × 强制盲区 = 真正的信念分散。旧 V9（6 污染因子）的盲区 ON/OFF 几乎不改变 std——伪多样性。新 V9 用 5 个严格正交因子让每个 Agent 只看到市场的一个侧面，产生了不可约的视角差异。
>
> **共识质量引擎需要调优**: 关闭后准确率 +6.7pp（38.3%→45.0%）。当前阈值太激进——大量有方向信号的事件被强制转为 NEUTRAL。建议调整 `divergenceThreshold` 45→55。
>
> **盲区成本从模板的 -16.7pp 降至 LLM 的 -5.0pp**: LLM 提取的丰富因子让每个 Agent 即使只看到 1-3 个因子也能做出合理判断——多样性的代价大幅收窄。
>
> 运行: `npx tsx test/v9-ablation.ts` (模板) | `npx tsx test/v9-ablation.ts --llm` (真实 DeepSeek)

### v9.2-Hybrid 非对称门控消融（60 事件，模板）

**核心问题**: 如何保留 KMeans 的 Down 100% 同时修复 Up 22% 的崩塌？

| 变体 | 总准确率 | Up | Down | Neutral | Δ vs 基线 | belief_std |
|------|---------|-----|------|---------|-----------|------------|
| **v9.2-Hybrid (门控)** | **50.0%** | **50%** | 71% | 0% | 基线 | 37.6 |
| v9.1-纯线性 | 21.7% | 22% | 0% | 71% | −28.3pp | 37.6 |
| 无政策Agent | 33.3% | 8% | 88% | 0% | −16.7pp | 46.7 |
| 无信息盲区 | 38.3% | 22% | 76% | 29% | −11.7pp | 12.3 ❌ |
| 永远猜涨基线 | 60.0% | — | — | — | — | — |

> 🔑 **Up 22%→50% (+28pp) 超越 44% 目标**。模板因子偏空偏差根除。三个升级：(1) 非对称门控释放少数派多头 (2) 中文政策关键词覆盖 +15短语 (3) 反偏空护栏 (强政策封底 fundamental, RSI<10 强制非负)。Down 从 82%→71% 是诚实回归——旧值含虚高偏空偏差。
>
> 🔑 **门控增益 +18.3pp**（vs 纯线性）。纯线性 Down 0%——模板因子对所有危机事件偏空，但线性平均后 consensus 始终在 −10~−15 徘徊。门控逻辑将 Down 拉回至 71%。

### v9.3 Neutral Detection Engine 消融（60 事件，LLM + 模板双模式）

**核心问题**: 四规则 Neutral 检测能否恢复 v9.2 丢失的 Neutral 召回？

**LLM 模式** (belief_std=58.5, R2 首次激活):

| 变体 | 总准确率 | Up | Down | N-Pred | N-Recall | belief_std |
|------|---------|-----|------|--------|----------|------------|
| v9.3-Full | 31.7% | 36% | 12% | 32 | **57%** ✅ | 58.5 ✅ |
| **仅Rule1** ⭐ | **51.7%** | 39% | **100%** | 1 | 0% | 58.5 |
| 仅Rule2∧3 | 40.0% | 39% | 53% | 11 | 14% | 58.5 |
| 仅Rule4 | 35.0% | 36% | 24% | 29 | 57% | 58.5 |
| v9.2-Baseline | 50.0% | 39% | 94% | 2 | 0% | 58.5 |

**模板模式** (belief_std=37.6, R2 绝缘):

| 变体 | 总准确率 | Up | Down | N-Pred | N-Recall | belief_std |
|------|---------|-----|------|--------|----------|------------|
| v9.3-Full | 46.7% | 47% | 65% | 13 | 0% | 37.6 |
| 仅Rule1 | 50.0% | 50% | 71% | 11 | 0% | 37.6 |
| v9.2-Baseline | 50.0% | 50% | 71% | 11 | 0% | 37.6 |

> 🔑 **核心发现**: (1) LLM 模式 belief_std 从 37.6→**58.5** (+21)，R2∧3 从绝缘→激活 (11次触发)，验证了引擎架构的正确性 (2) **仅Rule1 是最优生产配置**——51.7% 总准确率、Down 100%，几乎不误 Neutral (3) R4 对 LLM 模式过于激进 (29/60触发)，其 `uncertainty>70` 阈值需上调至 ~85 (4) Neutral Recall 57% 达标，但以总准确率 −18.3pp 为代价——Neutral 检测与方向准确率存在固有 trade-off (5) 模板模式 Neutral=0% 的根因不在共识引擎而在因子提取层——Neutral 事件和 DOWN 事件在模板因子空间中不可区分。
>
> 🔑 **门控干扰修复**: Neutral 检测使用门控前的 linearConsensus 而非门控后的 consensus。KMeans 门控会将弱共识放大为强信号（如 1994 债券崩盘: Linear=-12→gate 后=-44），导致 Rule1 绝缘。修复后 Neutral 引擎能正确感知到"门控前的模糊"。
>
> 运行: `npx tsx test/v9.3-neutral-ablation.ts` (模板) | `npx tsx test/v9.3-neutral-ablation.ts --llm` (需 DEEPSEEK_API_KEY)

### 60 事件扩充回测（模板简报，0次LLM）

基于手动策划的 60 个历史市场事件（36 up / 17 down / 7 neutral，6大类别）。数据来源：Wikipedia、CBOE、Hartford Funds、Reuters。

| 方法 | 准确率 | Up (36) | Down (17) | Neutral (7) |
|------|--------|---------|-----------|-------------|
| 加权共识 (v6默认) | **47%** (28/60) | 42% | 65% | 29% |
| **修剪共识** (去极端值) | **48%** (29/60) | 42% | **71%** | 29% |
| 永远猜涨基线 | **60%** (36/60) | — | — | — |

> 📏 95% 置信区间: [36%, 61%]。60 事件具有统计参考价值，但仍需扩充至 ~200 事件以缩小 CI。

### 14 事件对比（平衡事件集，7 up / 5 down / 2 neutral）

| 方法 | 准确率 | Up | Down | 备注 |
|------|--------|-----|------|------|
| v5 信息不对称 | 36% | 14% | 80% | 168次LLM |
| v6 加权共识 | 50% | 43% | 60% | 0次LLM |
| **v6 修剪共识** | **64%** | 43% | **100%** | **0次LLM, +14pp** |
| v6 级联调整共识 | 50% | 57% | 20% | 恐慌级联时降权 |
| v6 中位数共识 | 43% | 14% | 80% | 完全抗极端值 |

> 🔑 **非线性共识聚合是 v6→v6.1 最大的准确率提升**。修剪掉最极端的 Panic(-85) 和 Retail(-85) 后，共识不再被噪音绑架。Down 事件从 60%→100%。

### 关键架构突破验证

| 假设 | 验证结果 |
|------|---------|
| "信息不对称 > 人格差异" | ✅ 偏差从 60pts 扩至 175pts |
| "同一LLM×相同信息 = 回声" | ✅ 5 Agent 全部 -40~-90 |
| "影响力加权可制衡空头联盟" | ✅ v6 Up 14%→43% |
| "纯数学多轮动力学可行" | ✅ 50% 准确率 0次LLM |
| "非线性聚合 > 线性聚合" | ✅ 修剪共识 +14pp (14事件) |
| "异质决策产生真正分歧" | ✅ V7 std=50.6 vs V6=15-20 |
| "反身性闭环增强反馈" | ⚠️ 评分32/100 — 有效但偏弱 |
| "线性共识聚合是硬天花板" | ✅ 3版本A/B差异 v5=0 → v6=6.7pt → v7=7.6pt |
| "非线性共识突破线性天花板" | ✅ v8.0 vs线性差异 10.5pt（1.6× v7） |
| "聚类共识 = 最佳非线性方法" | ✅ Down 100%, Up 50%, 总 56.7% |
| **"动态K突破永远猜涨基线"** | ✅ **v8.1 聚类+动态K 71.7%, vs线性 16.5pt, 首次超越60%基线** |
| **"Beta漂移对动态K多余"** | ✅ 71.7%(纯动态K) > 70.0%(动态K+Beta), Beta反而误判一个Down |
| **"因子盲区 ≠ 真多样性 (旧V9)"** | ✅ **旧V9 6因子互相污染, 盲区ON/OFF belief_std几乎不变** |
| **"正交因子 × 盲区 = 真多样性"** | ✅ **V9.1 belief_std: 盲区ON=57.9 vs OFF=17.9, 40点振幅** |
| **"LLM正交因子消除偏空偏差"** | ✅ **5因子常出现混合结构 (如 liquidity:-60 policy:+80), 旧6因子全负** |
| **"不确定性双引擎互补"** | ✅ **因子层(LLM判断事件不确定性) + 行为层(belief分散度检测)** |

### 历史版本对比

| 版本 | 事件数 | 准确率 | LLM | 关键发现 |
|------|--------|--------|-----|---------|
| v4.1 混合(模拟) | 14 | 64.3% | 0 | 含信息泄漏残留 |
| v5 不对称(真实) | 14 | 36% | 168 | LLM非确定性 |
| v6 加权共识 | 14 | 50% | 0 | =基线 |
| v6 修剪共识 | 14 | **64%** | 0 | 非线性聚合突破 |
| v6 加权共识 | 60 | 47% | 0 | 偏多事件集暴露空头偏倚 |
| v6 修剪共识 | 60 | 48% | 0 | 修剪优势在大样本上收窄 |
| v7 涌现（定性） | — | — | 0 | 3/4涌现测试通过 |
| **v8.0 聚类共识** | 60 | 56.7% | 0 | +23pp vs 线性, Down 100% |
| **v8.1 聚类+动态K** | 60 | **71.7%** | 0 | **Up 72%**, **首次超越永远猜涨(+11.7pp)** |
| **v8.1 vs线性差异** | 60 | **16.5pt** | — | v6=6.7→v7=7.6→v8.0=10.5→**v8.1=16.5** |
| **v9.0 因子基架构** | 60 | 40.0% (LLM) | 60 | LLM 系统性偏空, 6因子互相污染 |
| **v9.1 正交五因子** | 60 | **38.3% (LLM)** | 60 | **belief_std 57.9**, 盲区40点振幅, 真异质性验证 |
| **v9.2 Hybrid门控** | 60 | **50.0% (模板)** | 0 | Up 22%→50%(+28pp), 非对称门控+模板上下文感知升级 |
| **v9.3 Neutral引擎** | 60 | **51.7% (LLM,仅Rule1)** | 60 | 四规则引擎, LLM belief_std 58.5, Down 100%, R2∧3 首次激活 |
| **🆕 v9.5.2 路由仲裁** | 78 | **66.7% (LLM)** | 78 | 外部覆盖: classifyEvent V弹→UP |
| **🆕 v9.6 Market Awareness** | **203** | **52.2% (LLM)** | 203 | 根级修复: Prompt+Pattern+MR双层感知, Up 42→53%(+11pp), 203事件全量 |

### 64.3% 意味着什么（v4.1 诚实自评）

> 这是项目历史上第一个超过随机的回测结果。但数字本身需要被诚实地理解。

| 维度 | 评价 |
|------|------|
| ✅ 方向比抛硬币好 2 倍 | 64% vs 33%（随机三分类） |
| ✅ 混合架构确实比单一系统强 | +21pp vs 纯校准(42.9%), +28.6pp vs 纯LLM(35.7%) |
| ⚠️ 在 up 事件上可靠(100%)，在 down 事件上不可靠(20%) | 系统的超卖看多偏差在真正下跌时是毒药 |
| ⚠️ 14 个事件仍太少，统计显著性不足 | 需要每方向至少 20 个事件 |
| ⚠️ 当时用的是模拟 LLM（硬编码偏空），不是真实 LLM | 后续 v5 用真实 DeepSeek 重测，降至 36% |

### v4.1 关键失败案例分析

这 5 个错误预测揭示了系统的结构性盲区，至今仍是核心挑战：

| 事件 | 实际 | 错误预测 | 根因 |
|------|------|---------|------|
| 2015 中国A股股灾 | 📉 down | up | RSI=15 触发极强超卖看多信号，但结构性损伤（-40%+杠杆强制平仓+汇率贬值）超过超卖修复力 |
| 2020 新冠首爆 | 📉 down | up | 2月24日是最初恐慌，真正的底在3月23日。系统预测的方向可能对（最终反弹），但**时点错了一个月** |
| 2022 加息确立 | 📉 down | neutral | 低VIX+正常RSI+NORMAL跌幅 → 系统无强信号。但美联储明确鹰派=**结构性范式转变**，不是普通回调 |
| 2011 美国主权降级 | 📉 down | up | RSI=22+政策背书 → 看多信号。但欧债危机叠加=反弹还需2个月——**时机再次错误** |
| 2015 瑞士央行黑天鹅 | ➡️ neutral | up | 一次性汇率冲击被误判为V型反弹机会——**事件本质识别错误** |

> 🔑 **核心教训**：区分 V 型反弹（超卖→买入）和 L 型衰退（超卖→还有更多下跌）的能力是整个系统的阿克琉斯之踵。这个教训驱动了后续 v5→v9 所有架构迭代。

---

## 🚀 快速开始

### 1. 安装

```bash
npm install
```

### 2. 配置 API Key

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入 DeepSeek API Key（推荐，便宜且中文好）
```

### 3. 启动

```bash
npm run dev
# 打开 http://localhost:3000
```

### 4. API 调用

**v6.0 涌现式共识 (推荐，1次LLM调用)**
```bash
curl -X POST http://localhost:3000/api/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v6",
    "news": "美联储宣布紧急降息50个基点，超出市场预期",
    "rounds": 3,
    "llmConfig": {"provider": "deepseek", "model": "deepseek-chat"}
  }'
```
响应包含 `regime`(市场状态)、`capitalFlows`(资金流)、`priceChange`(价格变化)、`emergentBehaviors`(涌现行为)。

**v5.0 信息不对称 (兼容旧版，12次LLM调用)**
```bash
curl -X POST http://localhost:3000/api/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "news": "美联储宣布紧急降息50个基点，超出市场预期",
    "rounds": 2,
    "llmConfig": {"provider": "deepseek", "model": "deepseek-chat"}
  }'
```
默认 `version: "v5"`，向后兼容。

---

## 🛠️ 技术栈

| 层级 | 技术 | 为什么选它 |
|------|------|-----------|
| 框架 | Next.js 14 | API Routes + 前端一体化 |
| 语言 | TypeScript | AI 辅助下也能写类型安全的代码 |
| 样式 | Tailwind CSS | 用自然语言描述样式 → AI 生成 |
| 图表 | Chart.js | 轻量级可视化 |
| LLM | DeepSeek / OpenAI / Anthropic / Ollama | 可插拔，成本可控 |
| ML | LSTM + Transformer (⚠️ 随机权重模拟，非训练模型) | 架构占位，待替换为真实模型 |

---

## 📁 项目结构

```
swarmalpha/
├── src/
│   ├── app/api/swarm/          # API 路由 (v5/v6 双版本) + SSE 流式
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── v6/             # 🆕 v6.0 涌现式共识引擎 (11文件, ~1500行)
│   │   │   │   ├── types.ts           # 60+ 类型定义
│   │   │   │   ├── personas.ts        # 8 Agent × 5维属性
│   │   │   │   ├── marketRegime.ts    # 4种市场状态自动检测
│   │   │   │   ├── influenceSystem.ts # 影响力加权共识 (替代 mean)
│   │   │   │   ├── beliefEngine.ts    # 信念更新 (info+social+narrative)
│   │   │   │   ├── consensusEngine.ts # 共识涌现 (扩散→更新→加权)
│   │   │   │   ├── capitalFlow.ts     # 资金流计算
│   │   │   │   ├── priceFormation.ts  # tanh 价格形成
│   │   │   │   ├── emergentBehaviors.ts  # 6种涌现行为检测
│   │   │   │   ├── superCoordinatorV6.ts # 1次LLM→8份不对称简报
│   │   │   │   └── simulation.ts      # 主循环
│   │   │   ├── v7/             # 🆕 v7.0 涌现式市场社会引擎 (6文件, ~800行)
│   │   │   │   ├── types.ts           # 决策函数接口 + WorldModel + 级联类型
│   │   │   │   ├── decisionFunctions.ts # 5种异质决策函数 (Threshold/Sigmoid/Step/Contrarian/Statistical)
│   │   │   │   ├── worldModel.ts      # 世界模型 + Agent.Observe() 去中心化
│   │   │   │   ├── narrativeEngine.ts # 叙事引擎 + 反身性闭环 + 级联系统
│   │   │   │   └── simulation.ts      # 反身性市场共识主循环
│   │   │   ├── v8/             # v8.0 非线性涌现共识引擎 (6文件, ~1800行)
│   │   │   │   ├── types.ts           # Kuramoto振子 + 非线性共识 + 随机生命周期
│   │   │   │   ├── kuramotoDynamics.ts # 耦合振子动力学 (相位/序参量/相变检测)
│   │   │   │   ├── nonlinearConsensus.ts # 5种非线性共识 (聚类/幂律/熵权/几何平均)
│   │   │   │   ├── stochasticLifecycle.ts # Agent随机失败/新进入/参数漂移/复活
│   │   │   │   ├── simulation.ts      # v8主循环: Kuramoto+非线性+生命周期
│   │   │   │   └── index.ts
│   │   │   ├── v9/             # 🆕 v9.1 正交五因子引擎 (6文件, ~1300行)
│   │   │   │   ├── types.ts           # 正交五因子类型 + Agent定义 + 决策层
│   │   │   │   ├── factorExtraction.ts # LLM正交因子提取 (5因子prompt + 模板)
│   │   │   │   ├── agentDefinitions.ts # 8+1 Agent盲区映射 (56%方向因子无重叠)
│   │   │   │   ├── agentInterpretation.ts # Agent因子解释层 + 不确定性灵敏度
│   │   │   │   ├── uncertaintyEngine.ts  # 共识质量双引擎 (因子层+行为层)
│   │   │   │   ├── diagnostics.ts    # 群体行为诊断 (归因/联盟/反事实)
│   │   │   │   ├── simulation.ts      # v9主循环: 因子提取→Agent解释→决策
│   │   │   │   └── index.ts
│   │   │   ├── v9.5/           # 🆕 v9.5 社交互动 + 共识度量 + 动态权重 (5文件)
│   │   │   │   ├── types.ts           # v9.5 类型: SocialProfile, InteractionResult, ConsensusMetrics
│   │   │   │   ├── interaction.ts     # Agent社交互动引擎 (可见性矩阵 + α传播)
│   │   │   │   ├── metrics.ts         # 共识度量引擎 (Consensus/Polarization/Fragility)
│   │   │   │   ├── dynamicWeights.ts  # 🆕 v9.5.2: 动态权重引擎 (三模式级联自适应)
│   │   │   │   └── index.ts
│   │   │   ├── personas.ts            # v5 5 Agent 人格定义
│   │   │   ├── integratedEngine.ts    # v5 信息不对称引擎
│   │   │   ├── superCoordinator.ts    # v5 Super AI 协调器
│   │   │   ├── network.ts             # 社交网络拓扑 (v5+v6共用)
│   │   │   └── types.ts / prompts.ts  # 类型 + 提示词
│   │   ├── calibration/        # 事件分类器 + 混合预测 + 参数字典
│   │   ├── llm/                # 可插拔多供应商 (OpenAI/Anthropic/DeepSeek/Ollama)
│   │   ├── market-data/        # Yahoo Finance API + 真实参数计算
│   │   ├── ml/                 # ⚠️ 模拟 LSTM + Transformer (占位)
│   │   ├── indicators/         # 技术指标 (MA/MACD/RSI/布林带/KDJ)
│   │   ├── security/           # 速率限制 + XSS/SQL注入防护
│   │   └── utils/              # 情绪计算、存储、日志、重试
│   └── components/             # React UI 组件
├── test/                       # 60事件库 + v6/v7/v8回测 + 共识基准 + 7模块验证
│   ├── expanded-events.ts      # 60事件库 (6大类, 公开可查证)
│   ├── expanded-backtest.ts    # 60事件扩充回测
│   ├── v6-backtest.ts          # 14事件回测 (加权/修剪双共识)
│   ├── consensus-benchmark.ts  # 4种非线性共识对比
│   ├── nonlinear-benchmark.ts  # 🆕 v8.0 5种非线性共识 vs 线性 60事件基准测试
│   ├── v8.5-validation.ts      # v8.5 科学验证 (样本外+蒙特卡洛+分类审计)
│   ├── v9-ablation.ts           # 🆕 v9.1 正交五因子消融实验 (5变体×60事件)
│   ├── v6-validation.ts        # 7模块涌现验证 → VALIDATION_REPORT.md
│   └── v7-validation.ts        # V7 异质决策+反身性验证
├── _experimental/              # 实验模块
├── STRATEGY.md                 # 架构审计 + 提升指南
├── SYSTEM_V5.md                # v5 系统全景分析
├── PROJECT_EVALUATION.md       # 项目综合评估 (7版本, 13发现, 理论上限, 诚实判定)
└── SWARMALPHA_V6_VALIDATION_REPORT.md  # V6 7模块验证报告
```

---

## 🧭 架构原则

基于 11 个大版本的实验教训，这些原则指导着项目的每一个技术决策：

| ✅ 做 | ❌ 不做 |
|------|--------|
| 先写 50 行验证想法，跑回测看数字 | 先写 500 行优雅架构，一个月后才发现方向错了 |
| 用严格回测验证每个改动（新事件、无信息泄漏） | 用同一个数据库训练和测试（必然导致虚高准确率） |
| 保持基线简单（中性起点，不加预设） | 预设方向（强制看空/看多，污染所有下游信号） |
| 删除无效代码（git 里有备份，不怕丢） | 保留"以后可能有用"的代码（增加认知负担） |
| 诚实报告准确率（公开失败案例和失败原因） | 用循环论证或信息泄漏美化数字（76.5% → 25% 的教训） |
| 架构创新 > 算法堆砌（分类器覆盖策略翻倍准确率） | 加更多参数、更多模块、更多复杂度来掩盖根本问题 |

---

## 🔮 下一步

### 已完成 ✅
- [x] v6.0 涌现式共识引擎（8 Agent × 5维属性，0次LLM）
- [x] v6.1 非线性共识聚合（修剪/中位数/级联，修剪共识 +14pp）
- [x] v7.0 异质决策函数（5种函数形态）+ 反身性闭环 + 去中心化观察
- [x] v8.0 🚀 非线性涌现共识引擎 — Kuramoto耦合振子 + 5种非线性聚合 + 随机Agent生命周期
- [x] v8.0 基准测试 — 聚类共识 56.7%, vs线性差异 13.3pt（v6=6.7, v7=7.6）
- [x] v8.1 动态K聚类 → **71.7%**，首次超越永远猜涨基线
- [x] 事件库 14→60 扩充（6大类别，公开可查证数据源）
- [x] 7模块涌现验证 + 反投票测试 + 信息不对称对照
- [x] 全项目综合评估（PROJECT_EVALUATION.md）
- [x] **v9.0 因子基Agent架构** — LLM因子提取, 强制信息盲区, 政策Agent, 消融框架
- [x] **v9.1 正交五因子引擎** — 旧6因子→5正交因子, 消除LLM偏空偏差, belief_std 57.9 ✅
- [x] **v9.2 Hybrid 非对称门控** — Up 22%→50%(+28pp), 模板上下文感知升级, 反偏空护栏
- [x] **v9.3 Neutral Detection Engine** — 四规则体系, 门控前后共识分离, LLM R2∧3 首次激活, 仅Rule1 Down 100%
- [x] **v9.5 社交互动层** — 因子重叠可见性矩阵, α 加权的信念传播, 收敛/发散检测
- [x] **v9.5 共识度量引擎** — Consensus/Polarization/Fragility Score, 6 种状态分类
- [x] **v9.5.1 连续推演时间线** — 会话级存储, 3 天连续推演追踪共识演变
- [x] **🆕 v9.5.2 动态权重引擎** — 恐慌/政策/价值洼地 三模式级联自适应, 乘法合成, UI 实时展示
- [x] **🆕 v9.5.2 V 型反弹路由仲裁** — classifyEvent × LLM 共识双确认, 78事件 LLM 66.7%, 首次超越永远猜涨(+10.3pp)
- [x] **🆕 v9.6 Prompt 重设计** — LLM 新增 market_pattern (4种事件模式识别)
- [x] **🆕 v9.6 Market Awareness** — 双层感知修正 (统计均值回归 + Pattern-Aware Agent级修正), 203事件 52.2%
- [x] 事件库 60→203 至 1970-2025 共8大类别
- [x] 共识质量引擎调优（divergenceThreshold 45→55 ✅）
- [x] 模板因子偏空偏差修复（中文政策关键词 + 恢复信号 + 反偏空护栏）
- [x] Neutral 引擎架构验证（LLM Neutral Recall 57%, 仅Rule1 51.7% 总准确率）

### 短期（LLM 模式 Neutral 引擎精调 + 生产化）
- [ ] R4 阈值 LLM 模式上调（uncertainty 70→85, 当前过度触发 29/60 事件）
- [ ] 因子缓存持久化（`.llm-factor-cache.json`, 60事件 LLM 模式 ~$0.50 DeepSeek）
- [ ] 仅Rule1+R2∧3 组合验证（当前已独立验证, 需组合测试）
- [ ] LLM 模式 Neutral Recall > 20% 且总准确率 ≥ 45%（当前 Full 31.7%, 需更精准的规则组合）

### 短期（v9.5.2→v9.6）
- [x] ~~动态权重引擎 — 三模式级联自适应~~ ✅ v9.5.2 已完成
- [x] ~~共识度量仪表盘 — 三维指标实时可视化~~ ✅ v9.5 已完成
- [ ] 非线性共识聚合 v2（修剪均值 + 中位数共识，目标 A/B差异 >15pt）
- [ ] 动态权重 VIX 实时数据接入（当前用推断/模板值）

### 中期（架构融合）
- [ ] v9.3 Neutral + v9.5 互动 + v9.5.2 动态权重 = 完整共识管道
- [ ] 事件库 60→200（需要更系统的历史数据采集方法）
- [ ] 真实价格序列回测（当前仅方向预测）

### 长期（产品化）
- [ ] 前端 UI 重构 — 涌现行为 + 反身性闭环实时可视化
- [ ] Docker 一键部署
- [ ] 交易信号回测：基于动态权重共识的策略夏普比率
- [ ] 多资产跨市场反馈环（股市→债市→汇市→商品）

---

## 🤝 关于作者

我是一个高一学生，这是我的第一个项目。

如果你觉得这个项目有趣，或者想给一个 15 岁的建造者一些建议，欢迎开 Issue、提 PR、或者直接联系我。

**Vibe Coding 让我相信：好的想法 + AI 工具 = 任何人都可以建造有意义的东西。**

---

## 📄 License

MIT License — 详见 [LICENSE](./LICENSE)

---

*"在别人贪婪时恐惧，在别人恐惧时贪婪。" — 巴菲特*
*"但前提是你要知道现在是贪婪还是恐惧。" — SwarmAlpha*
