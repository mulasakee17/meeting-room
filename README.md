# 🐜 SwarmAlpha

> **LLM Multi-Agent 集体决策评价与治理研究平台** — 研究和构建 LLM Multi-Agent 集体决策的评价与治理机制，使群体决策具备高质量、可解释、可复现和抗极化的特性。
>
> 金融市场仅作为 Benchmark，而不是项目本身。真正保持不变的是集体决策形成机制。

<p align="center">
  <img src="https://img.shields.io/badge/version-11.0-purple" alt="version">
  <img src="https://img.shields.io/badge/TypeScript-全栈-blue" alt="typescript">
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="react">
  <img src="https://img.shields.io/badge/V3-Research Runtime-orange" alt="v3">
  <img src="https://img.shields.io/badge/领域-通用化-green" alt="domain">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="license">
</p>

---

## 这是什么？

SwarmAlpha 是一个用于研究 **AI Agent 群体决策形成、评价与治理（Collective Decision Formation, Evaluation & Governance）** 的实验平台。

核心问题：**不是研究"Agent 如何完成任务"，而是研究"多个 Agent 如何形成高质量、可信、可解释、可治理的集体决策"。**

```
输入: "央行宣布降息25个基点"

🏦 Policy       → 信念: bullish (强度: 72) 置信度: 85
💎 Value        → 信念: bullish (强度: 58) 置信度: 70
🔥 Momentum     → 信念: bullish (强度: 65) 置信度: 78
🔄 Contrarian   → 信念: bearish (强度: 35) 置信度: 60
📊 Quantitative → 信念: bullish (强度: 68) 置信度: 82

↓ 社交互动 × 3 轮 (动态信任传播)

群体共识: bullish (+61.8)
共识质量: 78/100
鲁棒性: 65/100
多样性: 35/100
```

**不是投票。不是平均。是从个体认知到群体智能的涌现。**

### 核心价值

- **决策质量评价**：测量共识的质量、鲁棒性、多样性、稳定性
- **可解释性**：完整的 Decision Trace 记录每步推理过程
- **可复现性**：确定性映射保证相同输入产生相同输出
- **通用化架构**：核心机制 domain-agnostic，可适配任何多Agent场景
- **治理机制**：研究如何干预群体决策，防止群体极化和错误共识
- **统一运行时**：V3 Runtime 作为稳定主干，协调所有模块的生命周期

---

## 立刻体验

```bash
# 启动开发服务器 (端口 3000)
cd swarmalpha
npm install
cp .env.local.example .env.local   # 可选: 填入 DeepSeek API Key
npm run dev

# 打开 http://localhost:3000
```

**Mock 模式**默认开启——无需 API Key，无需网络，零成本体验完整功能。

---

## V3 Research Runtime 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Runtime Layer                                  │
│  统一运行时调度器，协调所有模块的生命周期：                            │
│  · RuntimeScheduler (核心循环调度)                                   │
│  · RuntimeContext (统一状态容器)                                     │
│  · EventBus (事件发布订阅)                                          │
│  · TerminationChecker (可插拔终止策略)                               │
│  · ObservationLayer (意见观测提取)                                   │
│  · InferenceLayer (影响力推理与信念更新)                             │
│  · Adapters (模块适配层)                                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Discussion     │  │  Evaluation     │  │  Governance     │
│  Engine         │  │  Engine         │  │  Engine         │
│  (意见交换)      │  │  (质量评价)      │  │  (决策治理)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Cognitive State Layer                          │
│  系统底座，定义认知状态变量：                                          │
│  · belief, confidence, uncertainty, trust, openness, memory        │
│  · Decision Trace                                                   │
│  · FactorImportance                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Agent Layer                                    │
│  负责接入各种 Agent（GPT、Claude、Gemini、企业Agent、私人Agent）      │
│  重点：接口统一                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### V3 Runtime 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| RuntimeScheduler | `src/lib/runtime/scheduler.ts` | 核心循环调度器，协调讨论→观测→推理→评价→治理→终止检查 |
| RuntimeContext | `src/lib/runtime/context.ts` | 统一状态容器，管理 experiment、session、task、round、state、metrics |
| EventBus | `src/lib/runtime/eventBus.ts` | 事件发布订阅系统，支持生命周期、讨论、状态、分析、终止事件 |
| TerminationChecker | `src/lib/runtime/termination.ts` | 可插拔终止策略：最大轮数、共识稳定、无状态变化、置信度收敛、治理限制、超时 |
| ObservationLayer | `src/lib/observation/index.ts` | 意见观测层：提示构建、响应解析、原始观测提取 |
| InferenceLayer | `src/lib/inference/index.ts` | 推理层：影响力计算、信念更新、状态增量推断 |
| Adapters | `src/lib/runtime/adapters.ts` | 模块适配层：将 RuntimeContext 转换为各模块所需参数 |
| SwarmAlphaRuntime | `src/lib/runtime/researchRuntime.ts` | 统一入口：任务提交、实验管理、报告生成 |

### Runtime 核心循环

```
Discussion → Observation → Inference → State Update → Evaluation → Governance → Termination Check → Repeat or Complete
```

### 研究数据采集

Runtime 自动收集以下研究产物（Research Artifact）：

- **RoundSnapshot**: 每轮讨论的原始意见和状态
- **EvaluationSnapshot**: 评价结果快照
- **GovernanceSnapshot**: 治理干预记录
- **StateSnapshot**: 完整状态快照序列
- **DecisionSnapshot**: 最终决策和决策轨迹

---

## V2 可解释决策框架（历史实现）

V2 实现了"LLM 只感知不判断"的可解释决策框架，作为 V3 Runtime 的基础模块保留。

### 架构原则

| 原则 | 说明 |
|------|------|
| **LLM 只感知不判断** | LLM 负责提取证据和识别因子重要性，不做最终方向判断 |
| **数学唯一负责演化** | 数学模型更新信念强度、信任关系、开放度等所有数值状态 |
| **确定性决策映射** | 预定义规则将认知状态映射到 BUY/SELL/HOLD，保证实验可复现 |
| **Decision Trace 可观测** | 完整记录每步推理过程，用于分析和解释 |

### V2 API

```bash
POST /api/swarm/v2

# 请求示例
{
  "news": "央行宣布降息25个基点",
  "rounds": 3,
  "useLLM": false,
  "enableCommunication": true
}
```

---

## 研究路线

### 第一阶段（已完成）：Agent Cognitive Simulation

关键词：Belief、Trust、Communication、Memory、Decision Trace

目标：完成实验平台 ✅

### 第二阶段（已完成）：Collective Decision Evaluation

关键词：Consensus Quality、Collective Intelligence、Robustness、Stability

目标：建立评价体系 ✅

### 第三阶段（已完成）：Research Runtime

关键词：Lifecycle、Scheduler、EventSystem、Termination、Artifact

目标：建立统一运行时作为系统主干 ✅

### 第四阶段：Multi-Agent Governance

关键词：Trust Evolution、Influence、Diversity、Governance

目标：建立治理机制（进行中）

### 第五阶段：Agent Society

关键词：Institution、Organization、Market、Society

目标：研究 Agent 群体长期演化

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 19 · TanStack Start · Vite 8 |
| UI | shadcn/ui (Radix) · TailwindCSS v4 · Framer Motion |
| 图表与网络 | Recharts v3 · @xyflow/react v12 |
| 状态管理 | Zustand v5 · TanStack Query |
| 后端 | Next.js 14 API Routes |
| 类型安全 | TypeScript 全栈 · Zod 验证 |
| LLM | DeepSeek / OpenAI / Anthropic / Local (可插拔) |
| 数学引擎 | 贝叶斯定理 · 信息熵 · 指数衰减 · Kuramoto 同步化 |

---

## 版本历史

经过 15+ 个大版本的假设驱动迭代：

- **v11.0 当前**: V3 Research Runtime — 统一运行时架构完成
  - Runtime Layer 作为系统主干，协调 Discussion/Evaluation/Governance 三大模块
  - 6 层架构：Runtime → Discussion/Evaluation/Governance → Cognitive State → Agent
  - 7 个核心 Runtime 模块：Scheduler、Context、EventBus、TerminationChecker、ObservationLayer、InferenceLayer、Adapters
  - 可插拔终止策略：6 种终止条件（最大轮数、共识稳定、无状态变化、置信度收敛、治理限制、超时）
  - 研究数据采集：自动收集 RoundSnapshot、EvaluationSnapshot、GovernanceSnapshot、StateSnapshot、DecisionSnapshot
- **v10.0**: V3 定位升级 — 从"多Agent金融市场模拟"升级为"LLM Multi-Agent集体决策评价与治理研究平台"
  - 重新定义项目定位：金融仅作为 Benchmark
  - 7 维度评价体系：Consensus、Reliability、Explainability、Robustness、Stability、Manipulation Resistance、Influence Analysis
  - 主动治理机制：Echo Chamber、Authority Bias、Polarization 检测与干预
- **v9.7**: 非线性共识 8 方法动态集成 · 反事实实验室 · 12 符号市场数据
- **v9.6**: Market Awareness 双层感知修正 · 203 事件库
- **v9.5**: 社交互动层 · 共识三维度量 · 动态权重引擎 · V 型反弹路由仲裁
- **v9.3**: 四规则 Neutral Detection Engine
- **v9.1**: 正交五因子架构 — 旧 6 因子互相污染 → 新 5 因子严格正交
- **v8.1**: 聚类+动态K 71.7% — 首次超越永远猜涨基线
- **v6-v7**: 涌现式共识 · 异质决策函数 · 反身性闭环

[完整演化历史与技术评估 →](PROJECT_EVALUATION.md)

---

## 关于作者

我是一个高一学生。这个项目是用 AI 辅助完成的。

**Vibe Coding 让我相信：好的想法 + AI 工具 = 一个人可以建造过去需要一个团队才能建造的东西。**

---

## License

MIT License — 详见 [LICENSE](./LICENSE)