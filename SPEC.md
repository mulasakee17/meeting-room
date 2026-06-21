# SwarmAlpha - 金融多智能体共识推演沙盒

## 1. 项目概述

**SwarmAlpha** 是一个基于多智能体博弈的金融情绪推演系统。用户输入金融新闻，系统触发多个具有不同投资人格（Persona）的 AI Agent 进行 5 轮情绪演化博弈，最终输出共识情绪塌陷轨迹的可视化图表。

### 核心特性
- **多 Agent 博弈**: 5 个差异化投资人格的 AI Agent
- **情绪演化**: 5 轮迭代博弈，模拟真实市场情绪扩散
- **共识塌陷**: 展示从分歧到最终共识的动态过程
- **实时可视化**: 前端面板展示折线图动画

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (Next.js App Router)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  NewsInput  │  │ AgentPanel  │  │   EmotionCollapseChart  │  │
│  │   新闻输入   │  │  Agent状态   │  │     情绪塌陷折线图      │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                       │
│                    ┌─────▼─────┐                                │
│                    │  API 路由  │                                │
│                    │ /api/chat │                                │
│                    └─────┬─────┘                                │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       后端逻辑层                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Agent 调度引擎                            ││
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐          ││
│  │  │Bull   │ │Bear   │ │Neutral│ │Tech   │ │Macro  │          ││
│  │  │多头Agent│ │空头Agent│ │中立Agent│ │技术分析│ │宏观策略 │          ││
│  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘          ││
│  │                          │                                   ││
│  │                    ┌─────▼─────┐                             ││
│  │                    │ 情绪演化引擎 │                            ││
│  │                    │ (5轮博弈)  │                             ││
│  │                    └─────┬─────┘                             ││
│  └──────────────────────────┼───────────────────────────────────┘│
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────────┐│
│  │                    LLM 接口层 (OpenAI)                       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据流转逻辑

### 3.1 完整流程

```
[1] 用户输入金融新闻
        │
        ▼
[2] API 接收新闻文本
        │
        ▼
[3] Agent 调度引擎初始化
        │
        ▼
[4] 5个Agent并行生成初始情绪 ──────────────┐
        │                                   │
        ▼                                   │
[5] 第1轮博弈开始                            │
   - 每个Agent读取其他Agent的观点             │
   - 基于他人观点调整自身情绪值 (-100 ~ +100) │
        │                                   │
        ▼                                   │
[6] 情绪收敛检测                             │
   - 方差 < 阈值? → 提前结束                 │
   - 达到第5轮? → 强制结束                   │
        │                                   │
        └─────────── ◄── 循环 5 次 ─────────┘
        │
        ▼
[7] 生成情绪塌陷数据
   - 每轮每个Agent的情绪值
   - 平均情绪共识线
   - 波动性指标
        │
        ▼
[8] 返回前端渲染
```

### 3.2 情绪值计算

```
情绪值范围: -100 (极度恐慌) ~ 0 (中立) ~ +100 (极度贪婪)
收敛阈值: 当所有Agent情绪值的标准差 < 10 时，认为达成共识
```

---

## 4. Agent 人格定义

| Agent | 角色 | 初始倾向 | 特征描述 |
|-------|------|---------|---------|
| **Bull** | 多头主力 | +60 | 乐观激进，看多做多倾向于忽视风险 |
| **Bear** | 空头主力 | -60 | 悲观激进，看跌做空倾向于放大利空 |
| **Neutral** | 理性中立 | 0 | 价值投资派，基于基本面分析 |
| **Tech** | 技术分析 | +20 | 图表派，趋势跟随 |
| **Macro** | 宏观策略 | +10 | 关注货币政策、地缘政治 |

### 4.1 Agent 系统提示词模板

```
你是一个金融投资市场中的{role}人格AI。

## 你的特征
{personality}

## 当前任务
给定以下金融新闻，输出你的情绪判断（-100到+100）和简短理由。

## 输出格式
{"emotion": 数字, "reasoning": "原因说明"}
```

---

## 5. API 接口定义

### 5.1 情绪推演接口

**POST** `/api/swarm`

**Request:**
```json
{
  "news": "比特币ETF获批点燃市场热情，机构资金大幅流入",
  "rounds": 5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "news": "比特币ETF获批点燃市场热情，机构资金大幅流入",
    "rounds": [
      {
        "round": 1,
        "agents": {
          "bull": { "emotion": 75, "reasoning": "..." },
          "bear": { "emotion": -45, "reasoning": "..." },
          "neutral": { "emotion": 15, "reasoning": "..." },
          "tech": { "emotion": 40, "reasoning": "..." },
          "macro": { "emotion": 25, "reasoning": "..." }
        },
        "consensus": 22,
        "variance": 1840
      }
    ],
    "final": {
      "consensus": 8,
      "direction": "slightly_bullish",
      "converged": false,
      "total_rounds": 5
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "LLM API调用失败",
  "code": "LLM_ERROR"
}
```

### 5.2 健康检查接口

**GET** `/api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 6. 前端页面结构

### 6.1 主页面 `/`

```
┌─────────────────────────────────────────────────────────┐
│  🐜 SwarmAlpha                    [金融多智能体博弈沙盒]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  📰 输入金融新闻                                  │   │
│  │  ┌───────────────────────────────────────────┐  │   │
│  │  │                                           │  │   │
│  │  │                                           │  │   │
│  │  └───────────────────────────────────────────┘  │   │
│  │                              [开始推演] Button  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │   Agent 状态面板     │  │   情绪塌陷折线图          │  │
│  │                     │  │                         │  │
│  │  🐂 Bull: +75      │  │     📈 Chart.js         │  │
│  │  🐻 Bear: -45      │  │       动画渲染           │  │
│  │  ⚖️ Neutral: +15   │  │                         │  │
│  │  📊 Tech: +40      │  │                         │  │
│  │  🌍 Macro: +25     │  │                         │  │
│  └─────────────────────┘  └─────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  博弈日志 (实时滚动)                              │   │
│  │  Round 1: Bull 认为...                           │   │
│  │  Round 2: Bear 调整至...                         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.2 组件清单

| 组件 | 路径 | 描述 |
|------|------|------|
| `NewsInput` | `components/NewsInput.tsx` | 新闻文本输入区 |
| `AgentPanel` | `components/AgentPanel.tsx` | 5个Agent状态卡片 |
| `AgentCard` | `components/AgentCard.tsx` | 单个Agent状态 |
| `EmotionChart` | `components/EmotionChart.tsx` | Chart.js 折线图 |
| `GameLog` | `components/GameLog.tsx` | 博弈日志滚动区 |
| `ConsensusBadge` | `components/ConsensusBadge.tsx` | 共识结果徽章 |

---

## 7. 项目目录结构

```
swarmalpha/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # 根布局
│   │   ├── page.tsx             # 主页面
│   │   ├── globals.css          # 全局样式
│   │   └── api/
│   │       ├── health/
│   │       │   └── route.ts     # 健康检查API
│   │       └── swarm/
│   │           └── route.ts     # 核心推演API
│   ├── components/
│   │   ├── NewsInput.tsx
│   │   ├── AgentPanel.tsx
│   │   ├── AgentCard.tsx
│   │   ├── EmotionChart.tsx
│   │   ├── GameLog.tsx
│   │   └── ConsensusBadge.tsx
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── types.ts         # Agent类型定义
│   │   │   ├── personas.ts      # 5种人格配置
│   │   │   └── engine.ts         # Agent调度引擎
│   │   ├── llm/
│   │   │   └── openai.ts        # OpenAI接口封装
│   │   └── utils/
│   │       └── emotion.ts       # 情绪计算工具
│   └── types/
│       └── index.ts             # 全局类型定义
├── public/
│   └── favicon.ico
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── SPEC.md
```

---

## 8. 技术栈选型

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| 框架 | Next.js 14 (App Router) | SSR/CSR 兼顾，API Routes 内置 |
| 样式 | Tailwind CSS v3 | 快速构建，响应式友好 |
| 图表 | Chart.js + react-chartjs-2 | 轻量级，动画流畅 |
| LLM | OpenAI GPT-4o-mini | 成本低，推理快 |
| 状态 | React useState + useReducer | 轻量级，无需 Redux |
| 部署 | Vercel | 与 Next.js 原生集成 |

---

## 9. 核心算法伪代码

### 9.1 Agent 调度引擎

```typescript
async function runSwarm(news: string, rounds: number = 5) {
  // 1. 初始化5个Agent
  const agents = createAgents(personas);

  // 2. 并行获取初始情绪
  let states = await Promise.all(
    agents.map(agent => agent.generateEmotion(news))
  );

  const history = [{ round: 0, states: {...states} }];

  // 3. 博弈循环
  for (let i = 1; i <= rounds; i++) {
    // 构建上下文：包含上一轮所有Agent的观点
    const context = buildContext(states, history);

    // 并行获取本轮情绪
    states = await Promise.all(
      agents.map(agent => agent.evolveEmotion(news, context))
    );

    history.push({ round: i, states: {...states} });

    // 检查收敛
    if (checkConvergence(states)) break;
  }

  return { history, finalStates: states };
}
```

### 9.2 收敛检测

```typescript
function checkConvergence(states: AgentState[]): boolean {
  const emotions = Object.values(states).map(s => s.emotion);
  const stdDev = calculateStdDev(emotions);
  return stdDev < 10; // 阈值
}
```

---

## 10. 环境变量

```env
# .env.local
OPENAI_API_KEY=sk-xxx
```

---

## 11. 开发阶段建议

### Phase 1: 核心基建
1. 初始化 Next.js 项目 + Tailwind
2. 搭建目录结构
3. 实现 Agent 人格配置

### Phase 2: 后端逻辑
1. 实现 OpenAI 接口封装
2. 开发 Agent 调度引擎
3. 调试 5 轮博弈算法

### Phase 3: 前端界面
1. 开发新闻输入组件
2. 开发 Agent 状态面板
3. 集成 Chart.js 情绪折线图

### Phase 4: 集成与优化
1. 前后端联调
2. 动画效果增强
3. 响应式适配

---

## 12. 验收标准

- [ ] 输入新闻后，5个Agent生成差异化初始情绪
- [ ] 5轮博弈后，情绪值趋向收敛
- [ ] 折线图平滑动画展示塌陷过程
- [ ] 日志面板实时滚动显示博弈过程
- [ ] 移动端可正常访问
