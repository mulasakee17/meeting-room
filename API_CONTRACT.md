# SwarmAlpha v9.5.2 — 前端 API 契约

> 给前端 AI 的完整接口文档。照此实现即可，无需阅读引擎代码。

---

## 1. API 端点

```
POST /api/swarm
Content-Type: application/json
```

---

## 2. 请求体

```typescript
interface SwarmRequest {
  version: "v9";                        // 固定值
  news: string;                         // 新闻文本, 1-5000 字符
  rounds?: number;                      // 共识轮数, 1-10, 默认 3
  llmConfig: {                          // LLM 配置
    provider: "deepseek" | "openai" | "anthropic" | "local";
    model: string;                      // 如 "deepseek-chat"
  };

  // ── v9.5.1 新增 ──
  sessionId?: string;                   // 连续推演会话 ID (Date.now().toString())
  sequenceIndex?: number;               // 0 | 1 | 2 (第几天)
  disableInteraction?: boolean;         // 设为 true 跳过互动层 (回退 v9.3)
  enableDynamicWeights?: boolean;       // 设为 true 启用动态权重系统 (v9.5.2)
}
```

### 请求示例

```json
{
  "version": "v9",
  "news": "美联储紧急降息50个基点超出市场预期",
  "rounds": 2,
  "llmConfig": { "provider": "deepseek", "model": "deepseek-chat" }
}
```

---

## 3. 响应体

```typescript
interface SwarmResponse {
  success: true;
  version: "v9.5";                      // 版本标识
  data: {
    news: string;                       // 回显新闻
    factorVector: FactorVector;         // 5 个正交因子
    rounds: RoundData[];                // 共识演化轮次
    final: FinalDecision;               // 最终决策
    diagnostics: Diagnostics;           // 群体行为诊断
    ablationMetrics: {                  // 消融实验状态
      policyAgentActive: boolean;
      uncertaintyActive: boolean;
      blindnessActive: boolean;
      beliefStdHistory: number[];
    };
    v9_5: V9_5Data;                     // ★ 核心: 互动+指标+时间线
    v9_5Agents: AgentInfo[];            // Agent 元信息
  };
  rateLimit: {
    remaining: number;
    resetTime: string;
  };
}
```

---

## 4. 关键子类型

### FactorVector — 五个正交因子

```typescript
interface FactorVector {
  factors: {
    category: "liquidity" | "policy" | "fundamental" | "narrative" | "uncertainty";
    value: number;        // -100 ~ +100 (uncertainty: 0~100)
    confidence: number;   // 0-100
    evidence: string;     // LLM 解释原文
  }[];
  metadata: {
    newsSummary: string;
    detectedAnomalies: string[];
    timestamp: string;    // ISO 8601
  };
}
```

### RoundData — 单轮共识

```typescript
interface RoundData {
  round: number;
  consensus: number;           // 加权共识值 -100~+100
  direction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;          // 0-95
  beliefStd: number;           // Agent 信念标准差
  neutralTrace?: {             // Neutral 四规则追踪
    rule1_fired: boolean;      // 弱共识
    rule2_fired: boolean;      // 高分歧
    rule3_fired: boolean;      // 低同步
    rule4_fired: boolean;      // 高不确定+弱共识
    finalNeutral: boolean;     // 最终是否判 Neutral
    gatingReason: string;      // 判定理由文本
  };
  agents: Record<string, {     // key = agent id
    belief: number;            // -100~+100
    confidence: number;        // 0-100
    visibleFactors: string[];  // 该Agent可见的因子
    interpretation: string;    // 因子解释记录
  }>;
}
```

### FinalDecision — 最终决策

```typescript
interface FinalDecision {
  consensus: number;
  direction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  beliefStd: number;
  neutralTrace?: { /* 同上 */ };
}
```

### Diagnostics — 群体行为诊断

```typescript
interface Diagnostics {
  attribution: {                     // 归因分解
    agentId: string;
    agentName: string;
    emoji: string;
    belief: number;
    confidence: number;
    influenceWeight: number;
    contribution: number;            // 净贡献值
    contributionPct: number;         // 贡献占比 0-100
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    visibleFactors: string[];
  }[];

  coalition: {                       // 联盟分析
    bullishCoalition: {
      agentIds: string[];
      totalInfluence: number;
      totalCapital: number;
      weightedBelief: number;
    };
    bearishCoalition: { /* 同上 */ };
    neutralAgents: string[];
    powerRatio: number;              // 多头/空头影响力比
    dominantCoalition: "BULLISH" | "BEARISH" | "BALANCED";
    tension: number;                 // 0-100 对抗强度
    swingAgents: string[];           // 关键摇摆Agent
  };

  counterfactuals: {                 // 反事实分析
    baselineConsensus: number;
    mostInfluentialAgent: string;
    agentsToFlip: number;            // 需要移除几个Agent才能翻转方向
    variants: {
      label: string;                 // 如 "移除Panic"
      description: string;
      modifiedAgentId?: string;
      disableBlindness?: boolean;
      consensus: number;
      direction: string;
      deltaConsensus: number;        // 共识变化量
      directionFlipped: boolean;     // 方向是否翻转
      impact: "CRITICAL" | "SIGNIFICANT" | "MODERATE" | "MINIMAL";
    }[];
  };

  summary: {                         // 诊断摘要（自然语言，可直接展示）
    coreFinding: string;             // 核心发现
    consensusMechanism: string;      // 共识形成机制
    riskFactors: string[];           // 风险因素列表
    blindnessEffect: string;         // 盲区效应
  };
}
```

### V9_5Data — ★ 前端最关心的字段

```typescript
interface V9_5Data {
  interaction: {                     // Agent 社交互动 (可能 null)
    totalRounds: number;             // 互动总轮数
    convergenceType: "converged" | "diverged" | "max_rounds";
    rounds: {                        // 每轮状态
      round: number;
      beliefs: Record<string, number>;       // agentId → belief
      beliefChanges: Record<string, number>;  // agentId → Δbelief
      meanBelief: number;
      beliefStd: number;
      converged: boolean;
    }[];
    beliefShift: Record<string, number>;     // 最终-初始信念偏移
    consensusFormed: boolean;
    polarizationIncreased: boolean;
    socialProfiles: {                        // 社交可见性
      agentId: string;
      alpha: number;                         // 社交开放度 (-1~1)
      visibleAgentIds: string[];             // 该Agent能看到谁
    }[];
  } | null;

  metrics: {                         // ★★★ 三个核心指标
    consensusScore: number;          // 共识强度 0-100
    polarizationScore: number;       // 极化程度 0-100
    fragilityScore: number;          // 共识脆弱性 0-100
    stateLabel: string;              // 状态标签 (含emoji)
    stateInterpretation: string;     // 状态解读文本
  };

  comparison?: {                     // 互动前后对比
    consensusShift: number;          // 共识偏移
    stdChange: number;               // 分歧变化 (<-5=收敛, >+5=极化)
    effect: "convergence" | "polarization" | "minimal";
    description: string;
  } | null;

  dynamicWeights?: {                 // 动态权重系统
    enabled: boolean;                 // 是否启用动态权重
    activeModes: string[];            // 激活的模式 (e.g. ['panic', 'policy'])
    modeDetails: {
      panic: { triggered: boolean; reasons: string[] };
      policy: { triggered: boolean; reasons: string[] };
      value: { triggered: boolean; reasons: string[] };
    };
    adjustments: Record<string, {     // agentId → 权重调整详情
      baseWeight: number;             // 基础权重
      multiplier: number;             // 动态乘数
      finalWeight: number;            // 最终权重
      contributingModes: string[];    // 哪些模式贡献了调整
      reason: string;                 // 调整原因
    }>;
    dynamicConsensus?: number;        // 动态重新加权的共识值 (可对比静态共识)
  };

  timeline?: {                       // ★ 连续推演时间线 (3天趋势)
    sequenceIndex: number;           // 0|1|2
    news: string;                    // 当天新闻摘要
    consensusScore: number;
    polarizationScore: number;
    fragilityScore: number;
    consensus: number;
    direction: string;
    beliefStd: number;
  }[] | null;
}
```

### AgentInfo

```typescript
interface AgentInfo {
  id: string;       // "institution" | "value" | "trend" | "panic" | "quant" | "media" | "contrarian" | "retail" | "policy"
  name: string;     // "Institution" | "Value" | "Trend" | ...
  emoji: string;    // "🏦" | "💎" | "🏄" | "😱" | "🤖" | "📡" | "🦉" | "🐜" | "🏛️"
  role: string;     // 中文角色名
}
```

---

## 5. 颜色编码规则

Agent 信念值 → 颜色：

| belief 范围 | 颜色 | Tailwind | 含义 |
|------------|------|----------|------|
| > +15 | 绿色 | `text-emerald-400` / `bg-emerald-500` | 偏多 |
| < -15 | 红色 | `text-red-400` / `bg-red-500` | 偏空 |
| -15 ~ +15 | 黄色/灰色 | `text-zinc-400` | 中立 |

三指标颜色：

| 指标 | 低 (0-30) | 中 (30-60) | 高 (60-100) |
|------|----------|-----------|------------|
| Consensus | `#ef4444` 红 | `#f59e0b` 黄 | `#34d399` 绿 |
| Polarization | `#34d399` 绿 | `#f59e0b` 黄 | `#f87171` 红 |
| Fragility | `#34d399` 绿 | `#f59e0b` 黄 | `#ef4444` 红 |

---

## 6. 前端需要渲染的组件

### 6.1 ConsensusDashboard（核心新增）

Props 接口：

```typescript
interface ConsensusDashboardProps {
  metrics: {
    consensusScore: number;
    polarizationScore: number;
    fragilityScore: number;
    stateLabel: string;
    stateInterpretation: string;
  };
  interactionRounds?: { round: number; beliefs: Record<string,number>; beliefChanges: Record<string,number>; meanBelief: number; beliefStd: number; converged: boolean }[];
  socialProfiles?: { agentId: string; alpha: number; visibleAgentIds: string[] }[];
  comparison?: { consensusShift: number; stdChange: number; effect: string; description: string } | null;
  agents?: { id: string; name: string; emoji: string; role: string }[];
  finalConsensus?: number;
  finalDirection?: string;
  timeline?: { sequenceIndex: number; news: string; consensusScore: number; polarizationScore: number; fragilityScore: number; consensus: number; direction: string; beliefStd: number }[];
  loading?: boolean;
}
```

### 6.2 需要渲染的子组件

| 优先级 | 组件 | 数据来源 | 说明 |
|--------|------|---------|------|
| ★★★ | **三指标环形仪表盘** | `v9_5.metrics` | 三个 SVG/CSS 环形进度条, 带颜色分段和动画 |
| ★★★ | **状态解读卡片** | `v9_5.metrics.stateLabel` + `stateInterpretation` | 大号emoji标签 + 一段解释文字 |
| ★★★ | **互动演化柱状图** | `v9_5.interaction.rounds[]` | X轴=轮次, Y轴=belief_std, 每轮一个柱子 |
| ★★ | **Agent 信念对比条** | `v9_5.interaction.rounds[0].beliefs` vs `rounds[last].beliefs` | 水平条: 互动前(半透明) vs 互动后(实色), belief=0 在中间 |
| ★★ | **社交可见性迷你面板** | `v9_5.interaction.socialProfiles` | 卡片网格: Agent emoji + α值 + 可见人数 |
| ★★ | **互动效果总结** | `v9_5.comparison` | 三个数字: 共识偏移 / 分歧变化 / 效应 (收敛/极化/微效) |
| ★★ | **时间线折线图** | `v9_5.timeline[]` | 三条线(蓝=Consensus, 橙=Polarization, 红=Fragility), X轴=Day 1/2/3 |
| ★ | **反事实分析面板** | `diagnostics.counterfactuals.variants[]` | 列表: 每个变体显示 label + Δconsensus + 影响力等级(用颜色) |

### 6.3 旧组件（已有，可复用或重写）

| 组件 | 数据来源 |
|------|---------|
| **AgentPanel** — Agent 网格卡片 | `rounds[selected].agents` → 每个Agent: belief + confidence |
| **EmotionChart** — 情绪折线图 | `rounds[]` → 每轮每个Agent的belief |
| **RadarChart** — 雷达图 | `rounds[selected].agents` → 多维对比 |
| **ConsensusBadge** — 共识结果徽章 | `final` → direction + consensus |
| **GameLog** — 滚动日志 | `rounds[]` → 每轮每个Agent的interpretation |

---

## 7. 连续推演 3 天 — 调用方式

```typescript
const sessionId = Date.now().toString();
const variants = [
  "原始新闻文本",
  "原始新闻文本，市场开始消化预期",
  "原始新闻文本，机构开始重新定价",
];

for (let i = 0; i < 3; i++) {
  const res = await fetch("/api/swarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "v9",
      news: variants[i],
      rounds: 2,
      llmConfig,
      sessionId,
      sequenceIndex: i,  // 0, 1, 2
    }),
  });
}

// 最后一次响应的 data.v9_5.timeline 包含完整的 3 天数据
```

---

## 8. 预置事件（建议的演示用新闻）

```typescript
const PRESET_EVENTS = [
  {
    label: "📉 2008 雷曼",
    news: "2008年9月，雷曼兄弟破产，全球金融市场陷入恐慌，信贷市场冻结，道琼斯单日暴跌504点。美国政府随后推出7000亿美元TARP救助计划。",
  },
  {
    label: "🦠 2020 新冠崩盘",
    news: "2020年3月，新冠疫情全球爆发，美股10天4次熔断，VIX飙升至82，全球供应链断裂，多国封锁。美联储紧急降息至零并推出无限量QE。",
  },
  {
    label: "📈 2022 加息周期",
    news: "2022年，美联储为应对40年来最高通胀，连续四次加息75个基点，科技股暴跌，纳斯达克进入熊市，全球资本回流美元资产。",
  },
  {
    label: "💥 2024 日股崩盘",
    news: "2024年8月，日本央行意外加息，日元套息交易大规模平仓，日经225单日暴跌12.4%，全球股市恐慌性抛售，VIX飙升至65。",
  },
];
```

---

## 9. 页面布局建议

```
┌─────────────────────────────────────────────────────┐
│ 🐜 SwarmAlpha — Financial Collective Intelligence   │
│                   Laboratory                         │
│                                                     │
│ [DeepSeek ▼]  [历史记录 📋]                          │
├─────────────────────────────────────────────────────┤
│ [📉 2008雷曼] [🦠 2020新冠] [📈 2022加息] [💥 日股]  │  ← 预置事件
│                                                     │
│ [___________________输入新闻___________________]     │  ← NewsInput
│ [🚀 开始推演]  [📈 连续推演3天]                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ★ ConsensusDashboard (v9.5 核心)                    │
│  ┌─ 时间线折线图 (连续推演模式) ──────────────────┐  │
│  └──────────────────────────────────────────────┘  │
│  ┌ 42 ───┐ ┌ 73 ───┐ ┌ 47 ───┐                    │  ← 三个仪表盘
│  │Consensus│ │Polariz.│ │Fragility│                  │
│  └────────┘ └────────┘ └────────┘                    │
│  ┌ 🟡 模糊共识 ──────────────────────────────────┐  │  ← 状态解读
│  └──────────────────────────────────────────────┘  │
│  ┌ 📡 信念演化过程 (柱状图) ────────────────────-┐  │
│  └──────────────────────────────────────────────┘  │
│  ┌ 🎭 Agent 信念对比条 ───────────────────────-┐    │
│  └──────────────────────────────────────────────┘  │
│  ┌ 🔗 社交可见性 ────────────────────────────-┐     │
│  └──────────────────────────────────────────────┘  │
│  ┌ 📊 互动效果 ──────────────────────────────-┐     │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌ AgentPanel ───┐ ┌ EmotionChart ──────────────┐  │
│  │ 9张Agent卡片   │ │ 折线图                      │  │
│  └───────────────┘ └────────────────────────────┘  │
│                                                     │
│  ┌ ConsensusBadge ──┐ ┌ RadarChart ──────────────┐ │
│  │ 共识结果         │ │ 雷达图                     │  │
│  └─────────────────┘ └───────────────────────────┘ │
│                                                     │
│  ┌ GameLog (滚动日志) ──────────────────────────┐   │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 10. 注意事项

1. **所有数字字段都可能为负** — belief 是 -100~+100, consensus 也是
2. **interaction 可能为 null** — 如果 `disableInteraction: true` 或互动层禁用
3. **timeline 只在连续推演时存在** — 单次请求没有 timeline
4. **LLM 调用需 1-3 秒** — 要显示加载状态
5. **错误处理** — `success: false` 时显示 `data.error` + `data.suggestion`
6. **暗色主题** — 背景 `#0a0a0a`, 卡片 `bg-zinc-900/50 border-zinc-800`
