# SwarmAlpha 技术介绍与综合评估

> **生成日期**: 2026-06-29  
> **分析方法**: 基于全部源代码（TypeScript/TSX/JSON/Config）的深度阅读，未参考任何现有 .md 文档  
> **当前版本**: V3（原 v9.7 演进）

---

## ⚠️ 当前架构 vs 目标架构

**重要说明**：本文档第 2-8 节描述的是当前代码库的实际实现状态（基于金融市场的 v9 架构），第 1 节和第 10 节描述的是 V3 目标架构（通用化的评价与治理平台）。两者之间存在以下差异：

| 维度 | 当前实现 (v9) | 目标架构 (V3) |
|------|-------------|-------------|
| **核心定位** | 金融市场预测 | 通用决策评价与治理 |
| **Agent 定义** | 金融角色（机构、价值、趋势等） | 通用角色，可配置 |
| **因子体系** | 5 个金融因子 | 通用因子体系，领域可扩展 |
| **评价引擎** | 诊断模块（归因/反事实） | 7 维度评价引擎 |
| **治理引擎** | 被动诊断 | 主动干预机制 |
| **Agent 框架** | 自定义引擎 | 多框架适配器（AutoGen/CrewAI/LangGraph） |
| **领域支持** | 金融单一领域 | 金融、医疗、法律、企业决策等 |

**V3 演进路线**：当前代码库是 V3 的基础，将逐步重构为通用架构。第 10 节"V3 新架构演进方向"详细描述了重构计划。

---

## 一、项目概览

**SwarmAlpha** 是一个 **LLM Multi-Agent 集体决策评价与治理研究平台**，研究和构建 LLM Multi-Agent 集体决策的评价与治理机制，使群体决策具备高质量、可解释、可复现和抗极化的特性。

平台以金融市场为初始实验环境，模拟具有不同人格、决策框架和信息不对称的 AI Agent 群体如何形成共识。其核心架构已设计为通用化，可扩展至医疗、法律、企业决策等多个领域。

### 核心研究问题

> 给定一个决策任务（金融、医疗、法律等），在信息不对称的条件下，多个 AI Agent 能否收敛到一个高质量的集体决策？共识形成的过程是怎样的？什么因素导致稳健共识、脆弱共识或群体极化？如何评价和治理多 Agent 集体决策，使其具备可解释性、鲁棒性和抗操纵性？

### 技术栈

| 层级 | 技术选型 |
|------|---------|
| **后端框架** | Next.js 14.2.5（App Router，纯 API 服务，无页面渲染） |
| **前端框架** | TanStack Start（Vite 8 + React 19），独立子项目 |
| **语言** | TypeScript 5.5 全栈 |
| **UI 样式** | Tailwind CSS 4 + Radix UI 基础组件（shadcn/ui 风格） |
| **状态管理** | Zustand v5 + persist 中间件（前端）；In-Memory Map（后端） |
| **数据获取** | TanStack Query（前端）、Yahoo Finance 免费 API（后端 12 标的） |
| **可视化** | Recharts（图表）、@xyflow/react（网络图）、Framer Motion（动画）、Canvas（相位圆/粒子背景） |
| **LLM 提供商** | DeepSeek（主）、OpenAI、Anthropic、Ollama 本地模型 |
| **数据库** | 无 — 纯内存架构（Prisma + SQLite 已声明但未实际使用） |
| **测试框架** | Vitest（仅 1 个正式测试）+ ~60 个独立 benchmark 脚本 |
| **包管理** | npm（package.json + package-lock.json） |

---

## 二、项目结构

```
swarmalpha/
├── src/                              # 后端 Next.js API 服务
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts       # GET 健康检查
│   │   │   ├── market-snapshot/route.ts  # GET 12标的实时行情快照
│   │   │   └── swarm/
│   │   │       ├── route.ts          # POST/GET 主入口（1054行，v5/v6/v9/v9.5路由）
│   │   │       ├── mock/route.ts     # POST Demo预计算数据（800ms模拟延迟）
│   │   │       ├── stream/route.ts   # POST v5 SSE流式端点
│   │   │       ├── v2/route.ts       # POST v2 可解释Agent决策框架
│   │   │       ├── v2/experiment/route.ts  # POST/GET v3 批量实验运行器
│   │   │       └── v9/stream/route.ts     # POST v9 SSE流式（因子提取直播）
│   │   ├── layout.tsx                # 根布局：深色主题 + 标题
│   │   └── page.tsx                  # API 端点目录页（v9.7）
│   ├── lib/
│   │   ├── agents/                   # 🧠 核心：多版本Agent模拟引擎
│   │   │   ├── v2/                   # v2: 可解释Agent决策框架（15模块）
│   │   │   │   ├── agent.ts, simulator.ts, reasoner.ts
│   │   │   │   ├── stateUpdater.ts, decisionMaker.ts, trustEngine.ts
│   │   │   │   ├── influenceEngine.ts, agentRegistry.ts
│   │   │   │   ├── crossValidator.ts, governanceEngine.ts
│   │   │   │   ├── evaluationEngine.ts, experimentRunner.ts, logger.ts
│   │   │   │   ├── index.ts, types.ts
│   │   │   ├── v6/                   # v6: 已废弃存根（调用即抛错）
│   │   │   ├── v9/                   # v9: 正交五因子+诊断引擎（11模块）
│   │   │   │   ├── simulation.ts     # 核心模拟管线
│   │   │   │   ├── agentDefinitions.ts, agentInterpretation.ts
│   │   │   │   ├── factorExtraction.ts, config.ts, types.ts
│   │   │   │   ├── uncertaintyEngine.ts, nonlinearConsensus.ts
│   │   │   │   ├── priceFeedback.ts, contextSnapshot.ts, diagnostics.ts
│   │   │   ├── v9.5/                 # v9.5: 社交互动+共识度量+动态权重
│   │   │   │   ├── interaction.ts, metrics.ts, dynamicWeights.ts
│   │   │   ├── personas.ts           # 5个核心Agent人格定义
│   │   │   ├── integratedEngine.ts   # v5集成引擎：3层融合
│   │   │   ├── superCoordinator.ts   # 超级协调器（生成非对称信息简报）
│   │   │   ├── network.ts            # 社交网络拓扑（小世界/回音室/层级）
│   │   │   ├── context.ts, memory.ts, prompts.ts
│   │   │   └── demo-fallback.ts      # COVID 2020.3预计算回退数据
│   │   ├── calibration/              # 预测校准引擎
│   │   │   ├── predictionCalibrator.ts   # v5.0 4规则校准器（75%准确率验证）
│   │   │   ├── hybridPredictor.ts        # 校准+LLM融合
│   │   │   ├── eventClassifier.ts / V2.ts # 事件分类（V/L/W/U形态）
│   │   │   └── extendedBlackSwanDatabase.ts
│   │   ├── indicators/               # 技术指标（MA/EMA/MACD/RSI/布林带/KDJ）
│   │   ├── llm/providers.ts          # 多提供商LLM抽象层
│   │   ├── market-data/              # Yahoo Finance集成
│   │   │   ├── yahoo.ts              # 12标的OHLCV获取+5min缓存
│   │   │   └── realMarketParams.ts   # 真实市场参数计算
│   │   ├── ml/                       # ML预测器（LSTM/Transformer均为存根）
│   │   ├── security/                 # 安全模块
│   │   │   ├── rateLimit.ts          # 内存令牌桶限流（6档预设）
│   │   │   └── validation.ts         # 输入验证与净化
│   │   └── utils/                    # 工具库
│   │       ├── logger.ts             # 结构化日志系统
│   │       ├── retry.ts              # 重试+熔断器
│   │       └── emotion.ts            # 数学工具函数
│   └── types/index.ts                # 共享类型定义
│
├── swarmalphy-main/                  # 前端 SPA 应用（独立子项目）
│   └── src/
│       ├── routes/
│       │   ├── __root.tsx            # 根布局（zh-CN, SEO meta）
│       │   └── index.tsx             # 主页面（13个Section组件）
│       ├── components/
│       │   ├── swarm/                # 14个核心可视化组件
│       │   │   ├── SwarmHeader.tsx, ExperimentConsole.tsx
│       │   │   ├── LiveDashboard.tsx, FactorAnalysis.tsx
│       │   │   ├── AgentSocietyNetwork.tsx, AgentDrawer.tsx
│       │   │   ├── ExplainableTimeline.tsx, ConsensusEvolution.tsx
│       │   │   ├── CounterfactualLab.tsx, Diagnostics.tsx
│       │   │   ├── Replay.tsx, MarketTicker.tsx, EvidencePanel.tsx
│       │   │   ├── CinematicLoading.tsx, RingGauge.tsx
│       │   │   ├── ParticleBackground.tsx, Section.tsx
│       │   │   └── ErrorBoundary.tsx
│       │   └── ui/                   # 40+ shadcn/ui 基础组件
│       └── lib/swarm/
│           ├── store.ts              # Zustand 全局状态
│           ├── client.ts             # API客户端（含SSE流式处理）
│           ├── colors.ts             # 语义色彩系统
│           ├── agents.ts             # Agent定义（前端副本）
│           └── mock.ts               # Mock数据生成器
│
├── experiments/                      # 16个V3实验日志JSON（其中6个为空存根）
├── test/                             # ~60个独立benchmark/验证脚本
├── .claude/                          # Claude Code 配置
├── .env.local                        # 环境变量（LLM API Keys）
├── next.config.js                    # Next.js配置
├── tailwind.config.ts                # 自定义色彩（bull/bear/neutral/tech/macro）
├── tsconfig.json                     # TypeScript配置（@/* → ./src/*）
└── package.json                      # 依赖与脚本
```

---

## 三、核心架构设计

### 3.1 Agent 引擎版本演化

SwarmAlpha 经历了四个主要架构迭代。每个版本代表了不同的设计哲学：

#### V2 — 认知状态机架构（多 LLM 调用）

**设计哲学**：LLM 负责感知与推理，数学负责状态演化，确定性映射保证可复现。

```
新闻 → [Perception感知] → [Judgment判断] → [Reflection反思] → [数学更新] → [社交互动] → [决策映射]
         LLM调用#1           LLM调用#2         LLM调用#3       贝叶斯+熵     Agent交换信念   BUY/SELL/HOLD
```

- 单个 Agent 每轮 3 次 LLM 调用（N 个 Agent × 3 次/轮）
- `CognitiveState` 结构：belief, confidence, uncertainty, openness
- 数学 `StateUpdater`：贝叶斯后验推理 + 信息熵 + 指数衰减
- `DecisionMaker`：确定性规则映射（confidence > 60 + bullish → BUY）
- 包含完整的信任引擎、影响力引擎、治理引擎、交叉验证器
- **15 个模块**，架构分层最完善

#### V5 — 非对称信息群体引擎

**设计哲学**：信息不对称是第一等公民，超级协调器主动制造认知盲区。

```
新闻 → [SuperCoordinator] → [5份非对称简报] → [5核心Agent独立判断]
        1次LLM调用          信息切片+盲区设定    各自看到不同信息子集
                             ↓
                      [30散户情绪层] → [社交网络扩散] → [校准] → 输出
                      1次批量LLM调用    小世界/回音室/层级   4规则校准器
```

- SuperCoordinator：LLM 生成针对每个 Agent 的信息简报，故意省略关键信息
- 30 散户通过一次批量 LLM 调用生成，经社交网络扩散
- 3 种网络拓扑：Small World、Echo Chamber、Hierarchical

#### V9 — 正交五因子引擎（当前主力，1 次 LLM 调用）

**设计哲学**：**LLM 不应该判断方向，应该提取不受情绪影响的正交因子。所有方向判断交给纯数学。**

这是 SwarmAlpha 最核心的架构创新。

```
新闻 → [因子提取] → [Agent盲区过滤] → [信念计算] → [共识聚合] → [中立仲裁] → [诊断]
      LLM或模板     信息不对称        非线性变换      7种方法       4规则门控     归因+反事实
```

**五因子体系**：

| 因子 | 范围 | 含义 | 设计要点 |
|------|------|------|---------|
| **Liquidity** (流动性) | -100 ~ +100 | 市场资金面松紧 | 正值=资金宽松，负值=信用收缩 |
| **Policy** (政策) | -100 ~ +100 | 政策支持力度 | 独立于事件本身的方向评估 |
| **Fundamental** (基本面) | -100 ~ +100 | 实体经济影响 | 盈利、增长、就业 |
| **Narrative** (叙事) | -100 ~ +100 | 传播持久性与影响力 | **不评估方向，只评估传播力** |
| **Uncertainty** (不确定性) | 0 ~ +100 | 认知模糊度（元因子） | 只能为正，不参与信念计算 |

**因子提取方式**：
- **LLM 模式**：DeepSeek/OpenAI/Anthropic，temperature=0.3，JSON 结构化输出
- **模板模式**：多语言关键词匹配 + 数字解析 + 实体识别 + 上下文感知规则

#### V9.5 — 增量增强层

在 V9 基础上增量添加（不修改 V9 代码）：
- **社交互动引擎**：基于因子共享度的 Agent 间信念传播
- **共识度量**：Consensus Score（共识度）、Polarization Score（极化度）、Fragility Score（脆弱性）
- **动态权重**：恐慌/政策/价值三种市场模式下的 Agent 权重级联调整

#### V6 — 已废弃

V6 是存根代码，调用时会抛出错误 "v6.0 engine is not available. Use version: 'v9' instead."

---

### 3.2 Agent 系统设计

#### 信息盲区机制

信息不对称是 SwarmAlpha 的核心设计特征，而非需要消除的缺陷。每个 Agent 只能看到 5 个因子中的 1~3 个方向因子 + 不确定性（元因子始终可见）。

| ID | Emoji | Agent | 可见因子 | 盲区 | 设计原理 |
|----|-------|-------|---------|------|---------|
| institution | 🏦 | 机构投资者 | liquidity, policy, fundamental | narrative | 机构基于硬数据，忽略市场故事 |
| value | 💎 | 价值投资者 | fundamental | 其余全部 | 深度价值，只看基本面 |
| trend | 🏄 | 趋势交易者 | narrative | policy, fundamental, uncertainty | 趋势跟随，追情绪和资金流 |
| panic | 😱 | 恐慌情绪 | narrative, uncertainty | liquidity, policy, fundamental | 只被情绪和不确定性驱动 |
| quant | 🤖 | 量化策略 | 全部4个方向因子 | — | 唯一信息对称的 Agent |
| media | 📡 | 媒体叙事 | narrative, policy | liquidity, fundamental, uncertainty | 放大叙事和政策信号 |
| contrarian | 🦉 | 逆向投资者 | fundamental, narrative, uncertainty | liquidity, policy | 看基本面+情绪，忽略政策 |
| retail | 🐜 | 散户群体 | narrative | 其余全部 | 只看市场故事 |
| policy | 🏛️ | 政策制定者 | policy, uncertainty, fundamental | liquidity, narrative | 关注政策和基本面 |

**关键设计指标**：56% 的 Agent 对之间方向因子零重叠。这最大化了信息不对称产生的视角差异。

#### Agent 属性

```typescript
interface AgentProfile {
  bias: number;        // 固有偏差：Panic=-25（悲观）, Policy=+8（乐观）
  sensitivity: number; // 因子灵敏度：Panic=1.6（放大）, Contrarian=-0.8（反转）
  influence: number;   // 共识权重：Institution=0.18, Retail=0.08
}
```

#### 信念计算

```
rawBelief = Σ(visibleFactor.value × factor.confidence/100) / |visibleFactors|
belief = clamp(rawBelief × sensitivity + bias + noise, -100, +100)
```

不确定性因子不参与信念计算，但调节置信度：
```
effectiveConfidence = baseConfidence × (1 - uncertainty/200)
Panic: effectiveConfidence ×= 0.8   // 不确定性加深恐慌的不自信
Contrarian: effectiveConfidence ×= 1.1  // 不确定性=逆向机会
```

#### 非线性解释风格

每个 Agent 对原始信念施加与人格一致的变换：
- **Value**：大胆看跌（×1.2），谨慎看涨（×0.9）— 左侧交易
- **Trend**：平方根压缩极端值 — 动量跟随
- **Contrarian**：强信号反转（>50 → -raw × 0.8）
- **Panic**：极端信号放大（×1.3）
- **Quant**：压缩极端值（×0.85）
- **Institution**：纯线性 — 最客观

---

### 3.3 共识引擎

SwarmAlpha 不满足于简单加权平均，实现了多层次的共识计算方法：

| 方法 | 原理 | 适用场景 |
|------|------|---------|
| **线性加权共识** | Σ(belief × influence × confidence) / Σ(influence × confidence) | 基线参照 |
| **KMeans 聚类共识** | 对信念聚类，取最大簇均值 | 发现隐藏的多数派 |
| **幂律共识 (Power Law)** | sign(b) × |b|^α × weight, α=1.5 | 放大极端信念 |
| **熵加权共识** | 权重 = 1/H(分布)，高熵压降 | 共识模糊时降噪 |
| **修剪均值** | 移除 k 个最极端 Agent 后平均 | 消除噪音 |
| **中位数共识** | 影响力加权中位数 | 完全免疫极端值 |
| **缩尾均值** | 极端值钳制到分位数边界 | 保留方向不保留幅度 |
| **几何均值** | (Π|b_i|)^(1/n) | 需要强信号才形成共识 |
| **动态集成** | 7 种方法按信号质量加权混合 | 生产环境推荐 |

**Kuramoto 同步化参数**：将 Agent 信念映射到相位空间 [−π, +π]，计算序参量 r = |Σ e^(iθ_j)| / N。

- r > 0.8：高度同步，共识可信
- r < 0.4：缺乏协调，共识可能是噪音平均

**非对称门控（Hybrid Gating）**：
```
if clusterConsensus < -15:  useCluster()   // 强空头→采信聚类
else:                        useLinear()    // 多头/模糊区→回退线性
```
效果：Up 准确率从 22% 提升到 50%，Down 保持 71-100%。

---

### 3.4 中立仲裁引擎

4 规则 OR 门控。任一触发即输出 NEUTRAL，不强制给出 UP/DOWN 方向：

```
R1: |linearConsensus| < 15           → 信号太弱
R2: belief_std > 45                  → 分歧太大
R3: kuramoto_r < 0.4                 → 缺乏同步
R4: uncertainty > 70 ∧ |consensus| < 25 → 不确定性迷雾
Compound: R2 ∧ R3                    → 高置信度 Neutral
```

设计关键：Neutral 检测使用门控**前**的 linearConsensus，避免门控放大效应使 Rule1 失效。

---

### 3.5 社交互动系统 (v9.5)

#### 可见性矩阵

基于因子共享度构建：两个 Agent 共享至少一个方向因子才能互相观察。

#### 信念传播公式

```
visibleMean = Σ(neighbor.belief × trust/100) / Σ(trust/100)
blendWeight = 0.15 + (α+1)/2 × 0.35    // 最小15%社会影响，最大50%
newBelief = oldBelief × (1 - blendWeight) + visibleMean × blendWeight
```

| Agent | α (开放度) | 特征 |
|-------|-----------|------|
| Panic | +0.70 | 最易受他人影响 |
| Retail | +0.60 | 跟风性强 |
| Trend | +0.50 | 顺势而为 |
| Media | +0.45 | 中等开放 |
| Institution | +0.15 | 独立思考 |
| Quant | +0.10 | 模型驱动 |
| Value | +0.05 | 最独立 |
| Contrarian | -0.15 | 逆向（反向采纳） |
| Policy | +0.20 | 略微开放 |

#### 收敛检测

```
信念标准差 < 12 → 收敛（停止迭代）
连续3轮标准差增加 → 发散（极化加剧）
```

---

### 3.6 诊断与反事实系统

#### 归因分解
每个 Agent 对最终共识的边际贡献 = belief × influence × confidence

#### 联盟分析
多头/空头阵营的影响力比、加权信念、紧张度（tension）

#### 反事实分析（4 类变体）

| 变体 | 方法 | 测量 |
|------|------|------|
| 移除 Agent X | 重算共识 | Δ共识、方向是否翻转 |
| 关闭信息盲区 | 全体 Agent 看到全部因子 | 盲区的因果效应 |
| 禁用社交互动 | 跳过交互，用初始信念 | 社会传播的因果效应 |
| 启用动态权重 | 应用恐慌/政策模式 | 权重调整的因果效应 |

影响级别：CRITICAL (>25) → SIGNIFICANT (>15) → MODERATE (>7) → MINIMAL (≤7)

---

### 3.7 预测校准系统

4 规则校准器（v5.0，75% 准确率已历史数据验证）：

1. **中性基线**：不假设恐慌，防止过度看跌
2. **超卖=买入信号**：RSI < 30 → 均值回归预期
3. **极端恐慌=底部信号**：VIX > 40 AND RSI < 30 → 强看涨
4. **危机分类**：流动性危机 vs 偿付能力危机 vs 外部冲击 vs 技术故障

V2 事件分类器：识别 V 型反弹、L 型衰退、W 型震荡、U 型底部等价格形态。

---

### 3.8 市场数据管道

12 个免费 Yahoo Finance 实时指标，并行获取：

| 类别 | Symbol | 指标 | 用途 |
|------|--------|------|------|
| 大盘 | ^GSPC, ^IXIC | S&P 500, Nasdaq | RSI, 跌幅, 波动率 |
| 恐慌 | ^VIX | VIX 波动率指数 | 不确定性校准 |
| 板块 | XLF, XLE, XLK, XLV | 金融/能源/科技/医疗 | 板块轮动检测 |
| 利率 | 2YY=F, 10Y=F | 2年/10年国债 | 收益率利差=衰退预警 |
| 商品 | GC=F, CL=F | 黄金, 原油 | 避险情绪, 供给冲击 |
| 汇率 | DX-Y.NYB | 美元指数 DXY | 美元强弱 |

缓存策略：内存缓存（TTL 5分钟）→ 命中则返回 → 未命中则调 Yahoo API（10s 超时）→ 写入缓存 → 失败则优雅降级为推断值。

---

## 四、API 设计

### 端点总览

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/market-snapshot` | GET | 12标的实时行情快照 |
| `/api/swarm` | POST | 主引擎（v5/v6/v9/v9.5 多版本路由） |
| `/api/swarm` | GET | API元信息（版本号、限流状态） |
| `/api/swarm/mock` | POST | 预计算Demo数据（COVID 2020.3场景） |
| `/api/swarm/stream` | POST | v5 SSE流式推演 |
| `/api/swarm/v2` | POST | v2 可解释Agent框架 |
| `/api/swarm/v2` | GET | v2 API元数据 |
| `/api/swarm/v2/experiment` | POST | v3 批量实验运行器 |
| `/api/swarm/v9/stream` | POST | v9 SSE流式（含因子提取直播） |

### 请求/响应类型

```typescript
interface SwarmRequest {
  version: "v9";
  news: string;                    // 新闻文本（5-10000字符）
  rounds?: number;                 // 轮次（默认3，最大10）
  llmConfig: LlmConfig;            // provider, model, apiKey, timeout
  sessionId?: string;              // 连续推理会话ID
  sequenceIndex?: number;          // 序列位置
  disableInteraction?: boolean;    // 禁用社交互动
  enableDynamicWeights?: boolean;  // 启用动态权重
  enableVRoute?: boolean;          // 启用V型反弹路由
  ablation?: AblationConfig;       // 消融实验配置
  // 市场数据字段（可选，用于真实数据锚定）
  symbol?: string; vix?: number; rsi?: number;
  dropFromPeak?: number; volatility?: number;
  sectorRotation?: number; yieldSpread?: number;
  goldMomentum?: number; oilMomentum?: number;
}

interface SwarmResponse {
  success: true;
  version: "v9.7";
  data: {
    news: string;
    factorVector: FactorVector;       // 五因子向量
    rounds: RoundData[];              // 每轮Agent状态
    final: FinalDecision;             // 最终决策
    diagnostics: Diagnostics;         // 归因+联盟+反事实
    ablationMetrics: AblationMetrics; // 消融对比指标
    v9_5: V9_5Data;                   // 社交互动数据
    v9_5Agents: AgentInfo[];          // Agent元信息
    routing: RoutingDecision;         // V型反弹路由决策
  };
  rateLimit: RateLimitInfo;
}
```

### SSE 流式事件

v9 流式端点的事件类型：

| 事件 | 触发时机 | UI 效果 |
|------|---------|---------|
| `start` | 连接建立 | 设置总轮次 |
| `factor_start` | 因子提取开始 | 等待指示器 |
| `factor_complete` | 五因子提取完成 | **立即可视化**：仪表盘+因子卡片出现 |
| `context_ready` | 情境快照就绪 | 更新状态标签 |
| `round_start` | 每轮开始 | 轮次进度条更新 |
| `round_complete` | 每轮完成 | Agent 状态+指标重算+增量渲染 |
| `complete` | 全流程完成 | 最终诊断+消融指标 |
| `error` | 引擎错误 | 错误信息传播 |

---

## 五、前端架构（swarmalphy-main）

### 组件全景（14 个核心可视化组件）

| 组件 | 功能 | 核心技术 |
|------|------|---------|
| **ExperimentConsole** | 实验配置面板（新闻输入、预设、参数、模块开关） | React表单 |
| **LiveDashboard** | 实时共识仪表盘（3个环形仪表+群体决策面板） | SVG动画 + Framer Motion |
| **FactorAnalysis** | 五因子动画卡片展示 | CSS动画 + 展开详情 |
| **AgentSocietyNetwork** | Agent社交网络力导向图（9节点） | @xyflow/react |
| **AgentDrawer** | Agent详情抽屉（信念/贡献/社交连接/历史） | Radix Sheet |
| **ExplainableTimeline** | Agent信念演化手风琴时间线 | 手风琴列表 |
| **ConsensusEvolution** | 共识/分歧/Kuramoto三线演化图 | Recharts |
| **CounterfactualLab** | 反事实分析卡片网格 | 卡片布局 |
| **Diagnostics** | 归因条+联盟分析+风险因子+摘要 | 2列网格 |
| **Replay** | 回放控制器（播放/暂停/速度0.5x-4x/滑块） | Radix Slider |
| **MarketTicker** | 实时行情条（SPX/VIX/利差/黄金/原油） | 30秒轮询 |
| **EvidencePanel** | 因子可见性矩阵+Kuramoto相位圆+消融对比 | Canvas + 表格 |
| **CinematicLoading** | 电影级加载动画（3阶段） | Framer Motion |
| **RingGauge** | SVG环形仪表（共识度/极化度/脆弱性） | SVG + spring动画 |

### 状态管理

```typescript
interface SwarmState {
  result: SwarmResponse | null;     // 当前实验结果
  loading: boolean;                 // 加载中
  streaming: boolean;               // 流式更新中
  progress: RunProgress | null;     // { current, total }
  error: string | null;             // 错误信息
  selectedAgentId: string | null;   // 选中Agent（用于抽屉）
  replayRound: number;              // 当前回放轮次
  history: HistoryEntry[];          // 历史记录（persist, max 50）
}
```

Zustand `persist` 中间件将 `history` 持久化到 `localStorage`，其余状态为瞬态。

### 色彩系统

语义化的 6 色体系：`bullish` (#34d399 绿)、`bearish` (#f87171 红)、`neutral` (#a1a1aa 灰)、`consensus` (#60a5fa 蓝)、`polarization` (#fb923c 橙)、`fragility` (#c084fc 紫)。

---

## 六、安全架构

| 模块 | 实现 |
|------|------|
| **限流** | 内存令牌桶，6 档预设（strict=5/min → daily=500/day），自动 5min 清理 |
| **客户端识别** | X-Forwarded-For → X-Real-IP → User-Agent 哈希 |
| **XSS 防护** | 模式检测：`<script>`、`javascript:`、`on*=`、`<iframe>`、`<object>` |
| **SQL 注入防护** | 关键词黑名单：SELECT/INSERT/UPDATE/DELETE/DROP/UNION |
| **命令注入防护** | 管道命令、`$()` 替换、模板注入 `{{}}`、反引号命令 |
| **路径穿越防护** | `../`、`..\\`、`~` |
| **LLM 提供商白名单** | openai / anthropic / deepseek / local |
| **模型白名单** | 每提供商独立的模型 ID 白名单 |

---

## 七、综合评估

### 7.1 架构设计 ⭐⭐⭐⭐☆（4/5）

**优势：**
- LLM（感知）与数学（状态演化）的分离哲学明确且贯彻一致
- 信息盲区作为核心机制（非缺陷）是多 Agent 系统设计的真正创新
- 7 种非线性共识方法 + 动态集成突破了线性平均的信息论上限
- 诊断层（归因/反事实/联盟分析）使系统可解释、可审计
- 多层次中立仲裁模拟了"不确定时不强行判断"的合理决策模式

**不足：**
- 多引擎版本共存（v2/v5/v6/v9/v9.5）增加了理解与维护成本
- v6 已是废弃存根但未清理
- v9.5 作为增量层叠加在 v9 之上，耦合度偏高
- API 版本策略不一致：URL 路径版本（`/v2/`、`/v9/`）与请求参数版本（`version: "v9"`）并存

### 7.2 代码质量 ⭐⭐⭐☆☆（3/5）

**优势：**
- TypeScript 全面使用，类型系统较完善
- 模块化组织良好，职责边界基本清晰
- 错误处理较全面：LLM 超时/重试/降级/熔断
- 输入验证和安全防护覆盖较全

**不足：**
- **测试覆盖率极低**：仅 1 个正式 vitest 测试文件（`cross-validation.test.ts`），其余 60+ 均为独立 benchmark 脚本
- 主路由文件 `route.ts` 1054 行，严重违反单一职责原则
- 大量内联魔数（信念阈值 60、标准差阈值 45、共识阈值 15），分散在多个文件中
- LSTM/Transformer ML 模块标注为 STUB（零权重存根），但对外暴露为可用 API
- `experiments/` 下 6 个最新实验日志为空存根（361 bytes），暗示代码存在 Bug
- 前端 Agent 定义（`agents.ts`）和后端（`agentDefinitions.ts`）独立维护，存在同步风险

### 7.3 可扩展性 ⭐⭐⭐☆☆（3/5）

**优势：**
- 多提供商 LLM 抽象层设计良好，添加新提供商成本低
- Agent 定义与引擎逻辑分离，添加新类型较容易
- 因子体系可扩展，新增因子只需修改配置

**不足：**
- **纯内存架构是最大瓶颈**：
  - 限流状态在内存中 → 多实例无法共享
  - 时间线存储（`TimelineStore`）在内存中 → 冷启动丢失全部会话
  - 市场数据缓存在内存中 → 无分布式缓存
  - 无 Redis/数据库抽象层
- 无消息队列 → 长时间 LLM 调用缺乏异步任务管理
- 无水平扩展能力 → 本质上是单实例应用

### 7.4 生产就绪度 ⭐⭐☆☆☆（2/5）

**缺失的关键生产基础设施：**

| 缺失项 | 严重度 | 影响 |
|--------|--------|------|
| **无 API Key 认证** | 🔴 严重 | 任何知晓端点的人均可无限制调用 |
| **无数据库持久化** | 🔴 严重 | 重启丢失全部数据，无法支持历史查询 |
| **无 CORS 配置** | 🟡 中等 | 跨域请求不受控 |
| **无请求体大小限制** | 🟡 中等 | 依赖 Next.js 默认 4MB，可被大请求攻击 |
| **无 Docker/容器化** | 🟡 中等 | 部署依赖手动环境配置 |
| **无 CI/CD** | 🟡 中等 | 无自动化测试/构建/部署流水线 |
| **.env.local 安全风险** | 🔴 严重 | 需确认未进入 Git，否则 API Key 泄露 |
| **无 WebSocket** | 🟢 低 | 仅 SSE（单向），不支持双向实时交互 |
| **结构化日志未落地** | 🟢 低 | `logger.ts` 有远程日志接口但未实现 |
| **ML 模块为存根** | 🟡 中等 | LSTM/Transformer 返回零权重，误导 API 使用者 |

### 7.5 创新能力 ⭐⭐⭐⭐⭐（5/5）

**SwarmAlpha 的 6 个真正创新点：**

1. **LLM 角色重定位**：将 LLM 从"方向判断者"重新定位为"因子提取者"，这是对 LLM 在多 Agent 系统中角色的深刻洞察。避免了 LLM 自身的情绪偏见和方向偏好。

2. **信息不对称作为特征**：在大多数系统试图消除信息不对称时，SwarmAlpha 主动制造它——因为真实市场的认知多样性正来源于此。56% 的 Agent 对之间方向因子零重叠是精心设计的结果。

3. **多视角共识检测**：不满足于单一加权平均，叠加了 Kuramoto 同步模型（物理学）、KMeans 聚类（统计学）、7 种非线性方法（数值分析）——从多个数学视角交叉验证共识质量。

4. **反事实因果推断**："移除 Agent X 会翻转共识方向吗？""关闭盲区会改变结果吗？"——这种因果思维在 Agent 系统研究中极为罕见。

5. **Agent 风格的认知偏差建模**：Value 的左侧交易（大胆看跌/谨慎看涨）、Panic 的情绪放大、Trend 的动量压缩——不是简单的线性加权，而是模拟了真实的心理学偏差。

6. **复合中立仲裁**：4 规则 OR 门控 + 复合条件模拟了"不确定时不强行判断"的人类决策智慧，避免了 Agent 系统"总要给个答案"的常见缺陷。

### 7.6 前端体验 ⭐⭐⭐⭐☆（4/5）

**优势：**
- 14 个组件覆盖从输入到诊断的完整实验流程
- 流式更新体验流畅：因子完成即刻渲染，逐轮渐进更新
- 回放功能（0.5x-4x 变速）适合演示和深度分析
- 独立 ErrorBoundary per Section，单组件崩溃不影响整体
- 语义化色彩体系，深色主题统一
- Zustand persist 提供轻量的历史持久化

**不足：**
- Mock 模式的客户端指标重算（`sliceResponse`）逻辑与后端不完全一致
- 无移动端适配
- 前端 Agent 定义与后端重复，存在同步维护成本

---

## 八、定位建议

| 适合场景 | 不适合场景 |
|---------|-----------|
| ✅ 学术研究工具（集体智能涌现机制） | ❌ 面向终端用户的金融预测产品 |
| ✅ 演示/教育平台（多 Agent 共识可视化） | ❌ 需要高可用性的生产服务 |
| ✅ 实验性 API（加认证后可对外提供） | ❌ 需要实时双向交互的应用 |
| ✅ 多 Agent 系统架构参考实现 | ❌ 需要持久化历史数据的分析平台 |

**一句话总结**：SwarmAlpha 是一个架构设计精巧、创新能力突出、但工程基础设施明显不足的多 Agent 集体智能研究平台。其学术研究价值可能远高于工程应用价值。

---

## 九、改进建议（按优先级）

### 🔴 高优先级（直接影响安全与可用性）

1. **添加 API Key 认证**：每个端点验证 `Authorization: Bearer <key>`
2. **确认 .env.local 不进 Git**：如已提交，立即轮换所有 API Key
3. **迁移到持久化存储**：Redis/Upstash 替换内存 Map
4. **修复空实验日志 Bug**：排查 V3 引擎为何产生 6 个空存根

### 🟡 中优先级（提升工程质量）

5. **拆分 1054 行 route.ts**：独立版本路由文件
6. **统一 API 版本策略**：URL 路径版本 vs 请求参数版本二选一
7. **建立正式测试套件**：关键验证逻辑转为 vitest 测试
8. **添加 Docker + CI/CD**：`Dockerfile` + GitHub Actions
9. **清理废弃代码**：移除 v6 存根
10. **提取共享类型包**：前后端 Agent 定义统一来源

### 🟢 低优先级（体验优化）

11. **WebSocket 支持**：替代 SSE 实现双向交互
12. **实现或移除 ML 存根**：ONNX Runtime 或删除 API
13. **移动端响应式适配**
14. **结构化日志落地**：对接可观测平台
15. **非金融领域 Demo**：展示通用化架构的跨领域能力

---

## 十、V3 新架构演进方向

### 10.1 评价引擎（Evaluation Engine）

V3 将评价作为系统核心，定义 7 个评价维度：

| 维度 | 说明 | 测量方法 |
|------|------|---------|
| **Consensus** | 共识强度 | Agent 信念一致性、Kuramoto 序参量 |
| **Reliability** | 可靠性 | 与基准答案的一致性、跨方法验证 |
| **Explainability** | 可解释性 | 推理链完整性、归因清晰度 |
| **Robustness** | 鲁棒性 | 输入扰动下的决策稳定性 |
| **Stability** | 稳定性 | 多轮推演中的决策一致性 |
| **ManipulationResistance** | 抗操纵性 | 对恶意 Agent 的抵抗力 |
| **InfluenceAnalysis** | 影响力分析 | 单个 Agent 对共识的边际贡献 |

### 10.2 治理引擎（Governance Engine）

主动干预机制，检测并缓解群体决策偏差：

| 干预类型 | 检测指标 | 干预策略 |
|---------|---------|---------|
| **Echo Chamber** | Agent 间信息冗余度 | 强制引入差异化信息源 |
| **Authority Bias** | 单一 Agent 影响力占比 | 动态调整权重、引入异议 Agent |
| **Group Polarization** | 信念标准差持续增大 | 随机配对对立观点、强制反思 |

### 10.3 架构重构计划

1. **Evaluation Engine 独立化**：评价逻辑从金融场景中剥离，成为通用模块
2. **Governance Engine 新建**：基于现有诊断系统扩展主动干预能力
3. **Agent 框架插件化**：支持 AutoGen、CrewAI、LangGraph 等多框架接入
4. **基准测试标准化**：金融、医疗、法律等领域基准测试的统一接口
5. **决策轨迹完整化**：从任务输入到最终输出的全生命周期记录

---

*本文档完全基于对 SwarmAlpha 全部源代码（TypeScript/TSX/JSON/Config）的深度阅读，未参考任何现有 .md 文档。*
