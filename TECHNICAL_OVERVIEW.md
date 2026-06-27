# SwarmAlpha 技术架构白皮书

> **群体认知形成的可计算模型** — 信息不对称 × 社交互动 × 数学共识测量
>
> v9.7 · TypeScript 全栈 · ~20,000 行
>
> 作者：贺孟元 | MIT License

---

## 目录

1. [系统概述](#1-系统概述)
2. [正交五因子体系](#2-正交五因子体系)
3. [信息盲区与 Agent 系统](#3-信息盲区与-agent-系统)
4. [社会互动与信念传播](#4-社会互动与信念传播)
5. [共识引擎](#5-共识引擎)
6. [Neutral 仲裁引擎](#6-neutral-仲裁引擎)
7. [反事实推断](#7-反事实推断)
8. [市场数据管道](#8-市场数据管道)
9. [前端架构](#9-前端架构)
10. [API 设计](#10-api-设计)
11. [测试与验证](#11-测试与验证)
12. [技术栈总览](#12-技术栈总览)
13. [已知局限与路线图](#13-已知局限与路线图)

---

## 1. 系统概述

SwarmAlpha 是一个群体认知形成的计算模型。它的核心问题是：

> **在信息不对称的条件下，多个认知主体如何从相同的客观信号中提取不同的意义，并通过社会互动达成（或不达成）集体判断？**

系统将这个问题分解为五个可计算阶段：

```
新闻输入 → 因子提取 → Agent 信念形成 → 社交互动 → 共识聚合 → 诊断与反事实
```

每个阶段都是纯函数（给定相同输入，永远产生相同输出）。LLM 仅在因子提取阶段被调用一次。

### 设计原则

- **信息盲区是一等公民**：Agent 异质性来自因子可见性差异，不是 prompt 差异
- **数学可审计**：从因子 → 信念 → 共识的每一步都有明确的数学公式
- **LLM 最小化**：LLM 只做它擅长的事（语义分解），其余全部纯数学
- **类型安全全栈**：TypeScript 编译时验证从 API 契约到 UI 渲染的整个数据流

---

## 2. 正交五因子体系

任何市场相关事件都被分解为 5 个正交维度。每个维度独立评估，禁止交叉污染。

### 因子定义

| 因子 | 范围 | 含义 | 示例 |
|---|---|---|---|
| **Liquidity** (流动性) | [-100, +100] | 融资环境松紧。正值=资金宽松，负值=信用收缩。 | 降息→+30；信贷冻结→-70 |
| **Policy** (政策) | [-100, +100] | 政策支持力度。独立于事件本身评估。 | 政府救市→+85；加息→-65 |
| **Fundamental** (基本面) | [-100, +100] | 实体经济影响。盈利、增长、就业。 | 盈利超预期→+45；衰退→-60 |
| **Narrative** (叙事) | [-100, +100] | 传播持久性与影响力。**不评估方向，只评估传播力。** | 历史性事件→+70；常规新闻→-10 |
| **Uncertainty** (不确定性) | [0, +100] | 认知模糊度。不能为负。 | 方向明确→15；极端混乱→90 |

### 正交性保障

- Prompt 明确禁止 Bullish/Bearish/涨/跌/Sentiment 等方向性词汇
- 4 个方向因子全同号时触发正交性警告
- 旧版 6 因子（含 valuation/structural/sentiment/momentum）互相污染 → 有效维度仅 3-4 → 盲区形同虚设

### 提取方式

**LLM 模式**（Live API）：DeepSeek/OpenAI/Anthropic，temperature=0.3，JSON 结构化输出，含 12 个实时市场数据点作为上下文。

**模板模式**（Mock）：多语言关键词匹配 + 数字解析 + 实体识别 + 上下文感知规则（政策强度、RSI 极端值、恢复信号、板块轮动、商品动量）。

---

## 3. 信息盲区与 Agent 系统

### 3.1 因子可见性映射

每个 Agent 只能看到 5 个因子中的 2-4 个。不确定性因子（元因子）对所有 Agent 可见。

| Agent | 方向因子 | 盲区 | 设计原理 |
|---|---|---|---|
| 🏦 Institution | liquidity, policy, fundamental | narrative | 机构基于硬数据决策，不看市场故事 |
| 💎 Value | fundamental, policy | liquidity, narrative, uncertainty | 深度价值只看基本面与政策 |
| 🏄 Trend | narrative, liquidity | policy, fundamental, uncertainty | 趋势交易者追情绪和资金流 |
| 😱 Panic | narrative, uncertainty | liquidity, policy, fundamental | 恐慌只被情绪和不确定性驱动 |
| 🤖 Quant | 全部 4 个方向因子 | — | 唯一信息对称的 Agent |
| 📡 Media | narrative, policy | liquidity, fundamental, uncertainty | 媒体放大叙事和政策信号 |
| 🦉 Contrarian | fundamental, narrative, uncertainty | liquidity, policy | 逆向者看基本面和情绪，但不看政策 |
| 🐜 Retail | narrative | 其余全部 | 散户只看市场故事 |
| 🏛️ Policy | policy, uncertainty, fundamental | liquidity, narrative | 政策制定者关注政策和基本面 |

**56% 的 Agent 对之间方向因子零重叠**。这是设计目标——最大化信息不对称产生的视角差异。

### 3.2 Agent 属性

每个 Agent 有 3 个核心属性：

```typescript
interface AgentProfile {
  bias: number;        // 固有偏差。Panic=-25, Policy=+8, Institution=0
  sensitivity: number;  // 因子灵敏度。Panic=1.6(放大), Contrarian=-0.8(反转)
  influence: number;    // 共识影响力权重。Institution=0.18, Retail=0.08
}
```

### 3.3 信念计算公式

```
rawBelief = Σ(visibleFactor.value × factor.confidence/100) / |visibleFactors|
belief = clamp(rawBelief × sensitivity + bias + noise, -100, +100)
```

不确定性因子不参与信念计算，但用于调节置信度：

```
effectiveConfidence = baseConfidence × (1 - uncertainty/200)
Panic: effectiveConfidence ×= 0.8   // 不确定性放大恐慌的不自信
Contrarian: effectiveConfidence ×= 1.1  // 不确定性=机会
```

---

## 4. 社会互动与信念传播

### 4.1 社交网络

每个 Agent 有一个社交开放度 α ∈ [-1, +1] 和可见邻居列表：

```typescript
interface SocialProfile {
  agentId: string;
  alpha: number;           // -1(完全逆向) ~ +1(高度开放)
  visibleAgentIds: string[];  // 能观察到的邻居
  trust: Record<string, number>;  // 对每个邻居的信任度 [0, 100]
}
```

| Agent | α | 特征 |
|---|---|---|
| Panic | +0.70 | 最容易受他人影响 |
| Retail | +0.60 | 跟风性强 |
| Trend | +0.50 | 顺势而为 |
| Media | +0.45 | 中等开放 |
| Institution | +0.15 | 独立思考 |
| Quant | +0.10 | 模型驱动 |
| Value | +0.05 | 最独立 |
| Contrarian | -0.15 | 逆向（反向采纳） |
| Policy | +0.20 | 略微开放 |

### 4.2 交互公式

```
visibleMean = Σ(neighbor.belief × trust/100) / Σ(trust/100)
openness = (α + 1) / 2           // 映射到 [0, 1]
blendWeight = 0.15 + openness × 0.35  // 最小 15% 社会影响, 最大 50%
newBelief = oldBelief × (1 - blendWeight) + visibleMean × blendWeight
```

### 4.3 收敛检测

```
信念标准差 < 12 → 收敛
连续 3 轮标准差增长 → 发散（极化加剧）
```

---

## 5. 共识引擎

### 5.1 加权共识（基线）

```
consensus = Σ(belief_i × influence_i × confidence_i/100) / Σ(influence_i × confidence_i/100)
```

影响力加权：Institution(0.18) ≈ Retail(0.08) × 2.25。大资金的意见权重更高。

### 5.2 Kuramoto 同步化参数

将每个 Agent 的信念映射到相位空间：

```
θ_j = (belief_j / 100) × π          // 信念 [-100,+100] → 相位 [-π,+π]
r = |Σ e^(iθ_j)| / N                 // 序参量 ∈ [0, 1]
```

- `r > 0.8`：高度同步，共识可信
- `r < 0.4`：缺乏协调，共识可能是噪音平均
- 作为 Neutral 检测的输入和共识可信度的校准因子

### 5.3 非线性共识聚合（8 种方法）

线性共识的输出永远在输入凸包内——不能创造信息。非线性方法突破此限制：

| 方法 | 原理 | 适用场景 |
|---|---|---|
| **Power Law** | sign(b) × \|b\|^α × weight, α=1.5 | 放大极端信念（牛市狂热/恐慌） |
| **Entropy Weighted** | 权重 = 1/H(信念分布)。高熵压降，低熵放大。 | 共识模糊时降噪 |
| **Trimmed Mean** | 移除 k 个最极端 Agent 后平均 | 消除 Panic/Retail 噪音 |
| **Weighted Median** | 取影响力加权中位数 | 完全免疫极端值 |
| **Winsorized** | 极端值钳制到分位数阈值 | 保留方向但不保留幅度 |
| **Geometric Mean** | (Π\|b_i\|)^(1/n)。零信念强压制 | 需要强信号才形成共识 |
| **Dynamic Ensemble** | 6 种方法加权融合，权重由信号质量决定 | 生产环境推荐 |
| **Linear Baseline** | 标准加权平均 | 对照基线 |

### 5.4 Hybrid Gating（非对称门控）

KMeans 聚类共识 + 线性加权共识 并行计算 → 非对称决策：

```
if clusterConsensus < -15:
    useCluster()    // 强空头 → 采信聚类（保护 Down 检测）
else:
    useLinear()      // 多头/模糊区 → 回退线性（保护少数派多头）
```

**效果**：Up 准确率 22%→50%，Down 保持 71-100%。

---

## 6. Neutral 仲裁引擎

4 规则 OR 门。任一触发即输出 NEUTRAL——不强制给出 UP/DOWN。

```
R1: |linearConsensus| < 15     → 信号太弱
R2: belief_std > 45            → 分歧太大
R3: kuramoto_r < 0.4           → 缺乏同步
R4: uncertainty > 70 且 |linearConsensus| < 25  → 不确定性迷雾

Compound: R2 ∧ R3 → 分歧且失同步（高置信 Neutral）
```

**设计关键**：Neutral 检测使用门控**前**的 linearConsensus。门控会将弱共识放大为强信号（-12→-44），导致 Rule1 绝缘。

LLM 模式的 belief_std（58.5）远高于模板模式（37.6），R2∧R3 首次激活。

---

## 7. 反事实推断

### 7.1 反事实变体

系统自动生成 4 类反事实变体：

| 变体 | 方法 | 测量 |
|---|---|---|
| 移除 Agent X | 移除后重算共识 | Δ共识、方向是否翻转 |
| 关闭信息盲区 | 所有 Agent 看到全部因子 | 盲区的因果效应 |
| 禁用社交互动 | 跳过交互轮次，用初始信念 | 社会传播的因果效应 |
| 启用动态权重 | 应用 Panic/Policy 模式加权 | 权重调整的因果效应 |

### 7.2 影响评估

```
|Δ共识| > 25 → CRITICAL (关键影响)
|Δ共识| > 15 → SIGNIFICANT (显著影响)
|Δ共识| > 7  → MODERATE (中等影响)
|Δ共识| ≤ 7  → MINIMAL (轻微影响)

方向翻转 + |共识| > 10 → 标记为 Direction Flipped
```

### 7.3 诊断体系

- **贡献归因**：每个 Agent 的加权贡献 = belief × influence
- **联盟分析**：多头/空头阵营，影响力比，加权信念
- **紧张度**：min(多头影响力, 空头影响力) / max × 200 → [0, 100]
- **翻转阈值**：需要移除几个 Agent 才能翻转共识方向

---

## 8. 市场数据管道

### 8.1 数据源

12 个免费 Yahoo Finance 实时指标，并行获取：

| 类别 | Symbol | 指标 | 用途 |
|---|---|---|---|
| 大盘 | ^GSPC, ^IXIC | S&P 500, Nasdaq | RSI, 跌幅, 波动率 |
| 恐慌 | ^VIX | VIX | 不确定性校准 |
| 板块 | XLF, XLE, XLK, XLV | 金融/能源/科技/医疗 ETF | 板块轮动检测 |
| 利率 | 2YY=F, 10Y=F | 2Y/10Y Treasury | 利差 = 衰退预警 |
| 商品 | GC=F, CL=F | Gold, Crude Oil | 避险情绪, 供给冲击 |
| 汇率 | DX-Y.NYB | DXY | 美元强弱 |

### 8.2 缓存与降级

```
请求 → 内存缓存 (TTL 5min) → 命中? 
                                 ├→ Yes: 直接返回
                                 └→ No:  Yahoo API (10s 超时)
                                          ├→ 成功: 写入缓存
                                          └→ 失败: 返回 null → 上层降级为推断值
```

### 8.3 板块轮动信号

```
sectorRotation = XLF 月度收益 - XLK 月度收益
> +3 → Value Rotation (资金从成长股撤出 → 流动性收紧)
< -3 → Growth Rotation (风险偏好 → 叙事增强)
```

### 8.4 商品信号

```
goldMomentum > +3% → 避险升温 → 不确定性 +10
|oilMomentum| > 8% → 供给冲击 → 不确定性 +8, 基本面受影响
```

---

## 9. 前端架构

### 9.1 技术选型

| 层 | 技术 | 理由 |
|---|---|---|
| 框架 | TanStack Start (Vite + React 19) | 类型安全路由, SSR/CSR 混合 |
| 组件 | shadcn/ui (Radix 底层) | 无障碍、可定制、性能好 |
| 样式 | TailwindCSS v4 | 原子化 CSS, 暗色主题 |
| 动画 | Framer Motion v12 | 仪表盘动画, 流式过渡 |
| 图表 | Recharts v3 | React 原生, 声明式 API |
| 图可视化 | @xyflow/react v12 | Agent 网络力导向图 |
| 状态管理 | Zustand v5 + persist | 轻量, 类型安全, localStorage 持久化 |

### 9.2 9 面板架构

```
┌─────────────────────────────────────────────┐
│ SwarmHeader · 模式标签 · 历史 · 导出 · 运行  │
├─────────────────────────────────────────────┤
│ Hero · SwarmAlpha · Lab Run · YYYY-MM-DD    │
├─────────────────────────────────────────────┤
│ 01 实验控制台                                │
│ [新闻输入] [预设事件] │ [参数] [实验模块开关] │
├─────────────────────────────────────────────┤
│ 02 实时仪表盘                                │
│ [共识度 ◎] [极化度 ◎] [脆弱性 ◎] │ [共识决策] │
├─────────────────────────────────────────────┤
│ 03 因子分析 · 5 因子卡片                     │
├─────────────────────────────────────────────┤
│ 04 Agent 社会网络 [React Flow 力导向图]       │
│    [Agent 抽屉 · 侧边栏详情]                  │
├─────────────────────────────────────────────┤
│ 05 可解释时间线 · 9 Agent 折叠列表            │
├─────────────────────────────────────────────┤
│ 06 共识演化 · [Recharts 三线图]               │
├─────────────────────────────────────────────┤
│ 07 反事实实验室 · 4 变体卡片                  │
├─────────────────────────────────────────────┤
│ 08 诊断报告 · 归因│联盟│风险│摘要             │
├─────────────────────────────────────────────┤
│ 09 实验回放 · [滑块控制器] [播放/暂停]        │
└─────────────────────────────────────────────┘
```

### 9.3 流式推演

Mock 模式在客户端同步生成完整数据，然后通过 `setTimeout` 逐轮渐进式推送——模拟真实 API 的 SSE 体验。每轮推送触发 Zustand `set()`→ React 重渲染 → Framer Motion 动画。

Live 模式发送 POST `/api/swarm`，收到完整响应后用同样的逐轮推送逻辑。

### 9.4 全面板同步回放

`replayRound` 状态驱动 Agent 网络、时间线和演化图三个面板同步还原到任意轮次。`setInterval` + 速度选择器实现自动播放。

---

## 10. API 设计

### 10.1 端点

```
POST /api/swarm         — 运行实验
POST /api/swarm/mock    — Mock 模式（预计算数据）
POST /api/swarm/stream   — SSE 流式推演
GET  /api/health        — 健康检查
```

### 10.2 请求/响应契约

全栈 TypeScript 类型定义，API 契约编译时验证：

```typescript
interface SwarmRequest {
  version: "v9";
  news: string;
  rounds?: number;           // 默认 3
  llmConfig: LlmConfig;
  sessionId?: string;
  sequenceIndex?: number;
  disableInteraction?: boolean;
  enableDynamicWeights?: boolean;
  enableVRoute?: boolean;    // V 型反弹路由
  ablation?: AblationConfig;
}

interface SwarmResponse {
  success: true;
  version: "v9.7";
  data: {
    news: string;
    factorVector: FactorVector;
    rounds: RoundData[];
    final: FinalDecision;
    diagnostics: Diagnostics;
    ablationMetrics: AblationMetrics;
    v9_5: V9_5Data;
    v9_5Agents: AgentInfo[];
    routing: RoutingDecision;
  };
  rateLimit: RateLimitInfo;
}
```

### 10.3 安全措施

- **速率限制**：客户端 IP 层，可配置窗口/上限，返回 `Retry-After` 头
- **输入净化**：XSS/SQL 注入防护，`sanitizeString` 处理
- **错误分类**：8 种 LLM 错误类型（TIMEOUT/NETWORK/API_ERROR/PARSE_ERROR/AUTH_ERROR/RATE_LIMIT/INVALID_RESPONSE/UNKNOWN），每种含用户提示与重试策略
- **DEMO_MODE 降级**：LLM 全部失败时返回预计算完整响应

---

## 11. 测试与验证

### 11.1 事件库

203 个历史市场事件（1970-2025），8 大类别：金融危机、疫情、银行危机、战争、AI/科技、监管、央行政策、商品冲击。数据来源：Wikipedia、CBOE、Hartford Funds、Reuters。

### 11.2 关键指标

| 方法 | 事件数 | 准确率 | LLM |
|---|---|---|---|
| v9.6 Market Awareness | 203 | 52.2% | 203 |
| v9.5.2 路由仲裁 | 78 | 66.7% | 78 |
| v9.3 仅Rule1 | 60 | 51.7% (LLM) | 60 |
| v8.1 聚类+动态K | 60 | 71.7% (模板) | 0 |

### 11.3 验证方法

- 严格回测（无信息泄漏）
- 样本外交叉验证（<10pp 衰减）
- 蒙特卡洛稳定性测试（5% 噪声 × 50 次）
- 完整消融框架（5 变体 × 60 事件）

---

## 12. 技术栈总览

```
前端:  React 19 · TanStack Start · Vite 8 · shadcn/ui · TailwindCSS v4
       Framer Motion v12 · Recharts v3 · @xyflow/react v12 · Zustand v5
       
后端:  Next.js 14 · TypeScript · Zod · SSE Streaming

数据:  Yahoo Finance v8 (12 symbol) · 5-min Cache · Graceful Degradation

LLM:   DeepSeek (primary) · OpenAI · Anthropic · Local/Ollama

数学:  Kuramoto Synchronization · 8 Nonlinear Consensus Methods
       Hybrid Gating · 4-Rule Neutral Detection · Counterfactual Inference
       Entropy Weighting · Dynamic Ensemble · Geometric Mean · Power Law

测试:  203 Historical Events · Monte Carlo (50 runs) · Cross-Validation
       Ablation Framework (5 variants) · Deterministic PRNG for Reproducibility
```

---

## 13. 已知局限与路线图

### 当前局限

- **没有实时联网搜索**：因子提取仅基于输入新闻文本 + 市场数据。不会搜索相关新闻获取额外上下文。
- **Mock 模式关键词有限**：中文约 30 个关键词，英文约 20 个。复杂语义场景依赖 LLM。
- **Agent 数量固定为 9**：架构支持参数化生成更多 Agent，但当前为固定配置。
- **仅做方向预测**：输出 UP/DOWN/NEUTRAL，不做数值预测或时间预测。
- **单市场聚焦**：当前仅美股相关数据源。缺乏 A 股/港股/加密货币支持。
- **单人项目**：缺乏团队、缺乏商务验证、缺乏企业客户反馈。

### 路线图

**短期（v9.8）**
- [ ] 联网搜索上下文增强因子提取
- [ ] Mock 模式多语言关键词扩展（英文 50+，中文 80+）
- [ ] 数字解析器（"降息 50 个基点" → 识别 50bp vs 25bp 预期的差异）
- [ ] 事件类型自动分类（宏观/财报/地缘/监管）

**中期（v10.0）**
- [ ] 历史类比引擎（匹配 50+ 历史事件）
- [ ] A 股/港股市场数据源
- [ ] 参数化 Agent 生成（不限于 9 个固定角色）

**长期**
- [ ] 多资产跨市场反馈环（股市→债市→汇市→商品）
- [ ] 企业级功能：SSO、SLA、审计日志
- [ ] 白标 API 嵌入 Bloomberg/东方财富

---

## 引用与致谢

- **Kuramoto, Y. (1975)** — *Self-entrainment of a population of coupled non-linear oscillators*
- **Grossman, S. & Stiglitz, J. (1980)** — *On the Impossibility of Informationally Efficient Markets*
- **Hong, H. & Stein, J. (1999)** — *A Unified Theory of Underreaction, Momentum Trading, and Overreaction*
- **Tauric Research** — TradingAgents 多 Agent 交易框架（竞品参考）
- **CUHK-Shenzhen** — TwinMarket 金融市场多 Agent 仿真（竞品参考）
- **CAMEL-AI** — OASIS 社交仿真引擎（MiroFish 使用的底层引擎）

---

*"群体智能的价值不在于每个个体的智慧——而在于不同视角之间的张力。"*
