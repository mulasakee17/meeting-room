# SwarmAlpha V3 前端开发提示

> LLM Multi-Agent 集体决策评价与治理研究平台的前端开发指南

---

## 一、项目定位

**SwarmAlpha V3** 是一个通用的 LLM Multi-Agent 集体决策评价与治理研究平台。前端需要展示：
- 决策任务的完整执行流程
- 7 维度评价结果
- 治理干预结果
- 决策轨迹追溯

---

## 二、技术栈

| 层级 | 技术选型 |
|------|---------|
| **框架** | TanStack Start (Vite 8 + React 19) |
| **语言** | TypeScript 5.5 |
| **UI 样式** | Tailwind CSS 4 + Radix UI |
| **状态管理** | Zustand v5 + persist |
| **数据获取** | TanStack Query |
| **可视化** | Recharts、@xyflow/react、Framer Motion |

---

## 三、页面结构

### 3.1 主页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│ 🐜 SwarmAlpha — LLM Multi-Agent 集体决策评价与治理研究平台       │
│                                                                 │
│ [框架选择 ▼]  [LLM提供商 ▼]  [历史记录 📋]  [高级设置 ⚙️]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 【任务输入区域】                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 任务标题: [___________________________]                    │   │
│  │ 任务描述: [___________________________]                    │   │
│  │ 输入类型: [text ▼] [structured ▼] [question ▼]            │   │
│  │ 输入内容: [____________________________________________]   │   │
│  │  [🚀 开始执行]  [📋 创建任务]                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ 【评价仪表盘区域】                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 综合评分: 82/100                                            │   │
│  │  ┌── 共识 85 ──┐ ┌── 可靠 88 ──┐ ┌── 可解释 78 ──┐        │   │
│  │  │             │ │             │ │             │           │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │   │
│  │  ┌── 鲁棒 75 ──┐ ┌── 稳定 80 ──┐ ┌── 抗操纵 85 ──┐        │   │
│  │  │             │ │             │ │             │           │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │   │
│  │  ┌── 影响力分析 82 ──┐                                      │   │
│  │  │                  │                                       │   │
│  │  └──────────────────┘                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ 【治理面板区域】                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 回音室检测: ✅ 未检测                                      │   │
│  │ 权威偏见: ✅ 未检测                                         │   │
│  │ 群体极化: ✅ 未检测                                         │   │
│  │ 治理摘要: 未检测到群体决策偏差                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ 【Agent 状态区域】                                                │
│  ┌──────────────────────┐ ┌────────────────────────────────┐   │
│  │ Agent 卡片网格        │ │ Agent 社交网络图                │   │
│  │ 每个卡片显示:         │ │ 力导向图展示 Agent 间连接       │   │
│  │ - 名称/角色           │ │                                 │   │
│  │ - 信念值/置信度       │ │                                 │   │
│  │ - 贡献度              │ │                                 │   │
│  └──────────────────────┘ └────────────────────────────────┘   │
│                                                                 │
│ 【决策轨迹区域】                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 时间线: [←] [▶] [⏸] [→] [滑块]                            │   │
│  │ ┌─ input ──┐ ┌─ agent ──┐ ┌─ interact ─┐ ┌─ eval ──┐    │   │
│  │ │ 10:00:00 │ │ 10:00:01 │ │ 10:00:02   │ │ 10:00:03│    │   │
│  │ └──────────┘ └──────────┘ └─────────────┘ └──────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ 【结果摘要区域】                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 最终决策: 急性心肌梗死                                       │   │
│  │ 置信度: 85%                                                 │   │
│  │ 推理过程: 综合症状和病史...                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、核心组件

### 4.1 TaskInputPanel

**功能**：任务输入配置

**Props**：

```typescript
interface TaskInputPanelProps {
  onSubmit: (data: CreateTaskRequest) => void;
  loading?: boolean;
}
```

**子组件**：
- 标题输入
- 描述输入
- 输入类型选择（text/structured/question）
- 输入内容区域
- Agent 框架选择（autogen/crewai/langgraph/custom）
- LLM 配置（provider/model/temperature）
- 评价配置开关
- 治理干预级别选择

### 4.2 EvaluationDashboard

**功能**：7 维度评价仪表盘

**Props**：

```typescript
interface EvaluationDashboardProps {
  evaluation: EvaluationResult;
  loading?: boolean;
}
```

**子组件**：
- 综合评分展示
- 7 个维度的环形仪表盘
- 评价摘要卡片
- 详细评价指标展开

### 4.3 GovernancePanel

**功能**：治理干预结果展示

**Props**：

```typescript
interface GovernancePanelProps {
  governance: GovernanceResult;
}
```

**子组件**：
- 回音室检测结果
- 权威偏见检测结果
- 群体极化检测结果
- 治理干预详情
- 治理摘要

### 4.4 AgentPanel

**功能**：Agent 状态展示

**Props**：

```typescript
interface AgentPanelProps {
  agents: AgentInfo[];
  beliefs?: Record<string, number>;
  contributions?: Record<string, number>;
}
```

**子组件**：
- Agent 卡片网格
- 每个卡片显示名称、角色、信念值、置信度、贡献度

### 4.5 AgentSocietyNetwork

**功能**：Agent 社交网络力导向图

**Props**：

```typescript
interface AgentSocietyNetworkProps {
  agents: AgentInfo[];
  connections?: { source: string; target: string }[];
}
```

### 4.6 InteractionTimeline

**功能**：互动演化时间线

**Props**：

```typescript
interface InteractionTimelineProps {
  rounds: InteractionRound[];
  replayRound?: number;
  onReplayChange?: (round: number) => void;
}
```

### 4.7 DecisionTraceViewer

**功能**：决策轨迹查看器

**Props**：

```typescript
interface DecisionTraceViewerProps {
  trace: DecisionTrace;
}
```

### 4.8 ResultSummary

**功能**：最终决策摘要

**Props**：

```typescript
interface ResultSummaryProps {
  output: TaskOutput;
}
```

---

## 五、状态管理

### 5.1 全局状态

```typescript
interface SwarmState {
  taskId: string | null;
  status: "idle" | "loading" | "running" | "completed" | "failed";
  result: ExecuteResponse | null;
  error: string | null;
  history: HistoryEntry[];
  selectedAgentId: string | null;
  replayRound: number;
}
```

### 5.2 状态持久化

- `history` 通过 Zustand `persist` 中间件持久化到 localStorage
- 最多保存 50 条历史记录

---

## 六、API 客户端

### 6.1 客户端方法

```typescript
interface SwarmClient {
  createTask(data: CreateTaskRequest): Promise<CreateTaskResponse>;
  getTask(taskId: string): Promise<GetTaskResponse>;
  execute(data: ExecuteRequest): Promise<ExecuteResponse>;
  getEvaluation(taskId: string): Promise<EvaluationResponse>;
  getGovernance(taskId: string): Promise<GovernanceResponse>;
  getTrace(taskId: string): Promise<TraceResponse>;
  runBenchmark(data: BenchmarkRequest): Promise<BenchmarkResponse>;
}
```

### 6.2 错误处理

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
    suggestion?: string;
  };
}
```

---

## 七、色彩系统

### 7.1 语义色彩

| 语义 | 颜色 | Tailwind |
|------|------|----------|
| 成功/稳健 | `#34d399` | `text-emerald-400` |
| 警告/脆弱 | `#f59e0b` | `text-amber-400` |
| 错误/极化 | `#f87171` | `text-red-400` |
| 中性 | `#a1a1aa` | `text-zinc-400` |
| 共识 | `#60a5fa` | `text-blue-400` |
| 可靠 | `#34d399` | `text-emerald-400` |
| 可解释 | `#fbbf24` | `text-amber-300` |
| 鲁棒 | `#8b5cf6` | `text-violet-400` |
| 稳定 | `#06b6d4` | `text-cyan-400` |
| 抗操纵 | `#ec4899` | `text-pink-400` |
| 影响力 | `#f97316` | `text-orange-400` |

### 7.2 主题配置

```typescript
const theme = {
  dark: {
    background: "#0a0a0a",
    card: "bg-zinc-900/50",
    border: "border-zinc-800",
  },
};
```

---

## 八、交互设计

### 8.1 加载状态

- 全局加载动画
- 各组件独立加载状态
- 流式更新进度展示

### 8.2 响应式设计

- 桌面端：完整布局
- 平板端：两列布局
- 移动端：单列布局，折叠面板

### 8.3 错误处理

- 独立 ErrorBoundary 包裹各区域
- 错误信息友好提示
- 重试按钮

---

## 九、开发规范

### 9.1 代码风格

- TypeScript 严格模式
- ESLint + Prettier
- 组件命名：PascalCase
- 文件命名：kebab-case

### 9.2 组件结构

```
components/
├── ui/              # 基础 UI 组件
├── swarm/           # 业务组件
│   ├── TaskInputPanel.tsx
│   ├── EvaluationDashboard.tsx
│   ├── GovernancePanel.tsx
│   ├── AgentPanel.tsx
│   ├── AgentSocietyNetwork.tsx
│   ├── InteractionTimeline.tsx
│   ├── DecisionTraceViewer.tsx
│   └── ResultSummary.tsx
└── layout/          # 布局组件
```

### 9.3 类型定义

```
lib/
├── swarm/
│   ├── types.ts     # API 类型定义
│   ├── client.ts    # API 客户端
│   ├── store.ts     # Zustand 状态管理
│   └── colors.ts    # 色彩系统
```

---

## 十、部署建议

### 10.1 构建命令

```bash
npm run build
```

### 10.2 环境变量

```bash
VITE_API_BASE_URL=http://localhost:3000/api/v3
```

### 10.3 静态资源

- 部署到 Vercel / Netlify / GitHub Pages
- 配置 CORS 允许 API 访问

---

## 十一、注意事项

1. **异步加载**：LLM 调用可能需要 1-3 秒，显示加载状态
2. **错误边界**：每个区域独立错误处理，单组件崩溃不影响整体
3. **暗色主题**：默认深色主题，支持亮色主题切换
4. **数据持久化**：历史记录使用 localStorage
5. **响应式**：适配不同屏幕尺寸
6. **可访问性**：遵循 WCAG 标准