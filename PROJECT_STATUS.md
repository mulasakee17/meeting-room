# SwarmAlpha V3 - 项目状态报告

## 项目概述

SwarmAlpha 是一个 **LLM Multi-Agent 集体决策评估与治理平台**，从最初的金融预测工具重构而来。项目的核心价值在于：通过多 Agent 协作产生决策，并对决策过程进行多维度评估与智能治理。

## 当前版本

| 属性 | 值 |
|------|-----|
| 版本号 | v0.1.0 |
| 架构版本 | V3 |
| 构建状态 | ✅ 通过 |
| 测试状态 | ✅ 38/38 通过 |
| 运行状态 | ✅ 开发服务器正常运行 |

## 技术栈

| 层次 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 14.2.5 |
| 前端 | React | 18.3.1 |
| 语言 | TypeScript | 5.5.3 |
| 样式 | Tailwind CSS | 3.4.6 |
| 测试 | Vitest | 4.1.9 |
| 数据库 | SQLite3 | 6.0.1 |

## 核心模块

### 1. 评价引擎 (`src/lib/evaluation/`)

7 维度评估框架，对多 Agent 决策进行全面分析：

- **Consensus（一致性）**: 衡量 Agent 之间的共识程度 ✅ 功能正常
- **Reliability（可靠性）**: 评估决策的可重复性和稳定性 ⚠️ 当前输入数据不足，评分接近 0
- **Explainability（可解释性）**: 分析决策过程的透明度 ✅ 功能正常
- **Robustness（鲁棒性）**: 测试决策对扰动的抵抗能力 ✅ 功能正常
- **Stability（稳定性）**: 检测跨轮次决策的一致性 ✅ 功能正常
- **ManipulationResistance（抗操纵性）**: 识别潜在的偏见和操纵 ✅ 功能正常
- **InfluenceAnalysis（影响力分析）**: 分析各 Agent 的影响力分布 ✅ 功能正常

### 2. 治理引擎 (`src/lib/governance/`)

主动干预机制，识别并纠正群体决策偏差：

- **Echo Chamber（回音室效应）**: 检测信息冗余和观点同质化 ✅ 功能正常
- **Authority Bias（权威偏见）**: 识别主导 Agent 的过度影响 ✅ 功能正常
- **Polarization（极化现象）**: 检测群体分裂和极端化倾向 ✅ 功能正常

### 3. Agent 框架适配器 (`src/lib/adapters/`)

插件式架构，支持多种 Agent 框架：

- **CustomAdapter**: 内置的轻量级 Agent 框架，支持真实 LLM 调用 ✅ 功能正常
- **AutoGenAdapter**: AutoGen 框架适配器（预留接口，当前为模拟实现）

### 4. LLM 提供者 (`src/lib/llm/providers.ts`)

统一的 LLM 调用接口，支持：

- **DeepSeek**: deepseek-chat, deepseek-reasoner ✅ 已配置 API Key
- **OpenAI**: gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo ⚠️ 需配置 API Key
- **Anthropic**: claude-3-haiku, claude-3-sonnet, claude-3-opus ⚠️ 需配置 API Key
- **Local**: llama3, mistral, qwen2（通过本地 API） ⚠️ 需运行本地模型

### 5. 基准测试插件 (`src/lib/benchmarks/`)

模块化的场景测试框架：

- **Financial Benchmark**: 5 个金融场景测试用例 ✅ 功能正常

## API 端点

| 端点 | 方法 | 功能 | 状态 |
|------|------|------|------|
| `/api/v3/execute` | POST | 同步执行决策任务 | ✅ 功能正常 |
| `/api/v3/task` | POST | 异步创建决策任务 | ⚠️ 预留接口 |
| `/api/v3/benchmark` | POST/GET | 运行基准测试 | ✅ 功能正常 |
| `/api/health` | GET | 健康检查 | ✅ 功能正常 |

## 项目结构

```
swarmalpha/
├── src/
│   ├── app/
│   │   ├── api/            # API 路由
│   │   └── page.tsx        # 前端页面
│   ├── lib/
│   │   ├── adapters/       # Agent 框架适配器
│   │   ├── benchmarks/     # 基准测试插件
│   │   ├── evaluation/     # 评价引擎
│   │   ├── governance/     # 治理引擎
│   │   ├── llm/            # LLM 提供者
│   │   ├── security/       # 安全模块
│   │   └── utils/          # 工具函数
│   └── types/              # 类型定义
├── test/                   # 测试文件
└── experiments/            # 实验数据（可清理）
```

## 数据流

```
用户请求 → V3 API → CustomAdapter → Promise.all(独立LLM调用) 
    → 评价引擎 → 治理引擎 → 返回结果
```

## 关键特性

### 真实 LLM 集成

CustomAdapter 已接入 DeepSeek API，每个 Agent 独立调用 LLM 生成推理和决策。使用 `Promise.all` 并行调用多个 Agent，提升响应速度。

> **重要说明**: 当前所有 Agent 独立响应同一用户输入，**不支持 Agent 之间的多轮协商和信息交换**。这是一个简化的单轮交互模式，而非真正的多 Agent 协作系统。

### 情感感知

每个 Agent 响应包含 emotion 字段（-100~100），用于：
- 计算 Agent 的 belief 值（归一化到 -1~1）
- 评估决策的情感倾向
- 支持治理引擎的偏见检测

### 多角色支持

Agent 支持多种角色类型，每种角色有不同的系统提示词：
- Expert（专家）
- Analyst（分析师）
- Critic（批判者）
- Synthesizer（综合者）
- Visionary（远见者）

## 当前限制

### 1. 无多轮交互
Agent 之间不能看到彼此的推理，无法进行辩论、协商或信息交换。这是当前系统最主要的功能缺口。

### 2. Reliability 评分无效
评价引擎的可靠性维度（Reliability）当前评分接近 0，因为：
- 缺乏跨验证数据
- 一致性计算需要多轮交互数据
- 需要实现真正的重复测试逻辑

### 3. 前端页面基础
当前前端页面为基础版本，仅展示 API 调用结果，缺乏：
- 可视化的 Agent 交互过程
- 实时数据流展示
- 用户友好的任务管理界面

### 4. 数据库未使用
SQLite3 已安装但未配置，任务结果和交互历史未持久化。

## 测试覆盖

| 测试文件 | 测试数量 | 状态 |
|----------|---------|------|
| `evaluation.test.ts` | 12 | ✅ |
| `governance.test.ts` | 12 | ✅ |
| `benchmarks.test.ts` | 14 | ✅ |
| **总计** | **38** | **✅** |

## 环境配置

需要在 `.env.local` 中配置 API Key：

```bash
DEEPSEEK_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key (可选)
ANTHROPIC_API_KEY=your-api-key (可选)
LOCAL_LLM_URL=http://localhost:11434 (可选)
```

## 运行命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 构建生产版本
npx vitest run     # 运行测试
```

## 待完成事项

### 高优先级
1. **实现多轮 Agent 交互**: 让 Agent 能够看到并响应彼此的推理，这是集体决策系统的核心功能
2. **修复 Reliability 评分**: 实现真正的跨验证和一致性计算逻辑
3. **数据库持久化**: 配置 Prisma + SQLite，存储任务结果和交互历史

### 中优先级
4. **前端页面优化**: 完善 UI/UX，添加可视化组件
5. **AutoGen 集成**: 接入真实的 AutoGen 框架
6. **实时数据流**: 支持 WebSocket 实时推送

### 低优先级
7. **更多基准测试**: 扩展医疗、法律、商业等领域的基准测试插件

## 项目优化历史

- 删除了 `.next/` 构建缓存（约 77.6MB）
- 删除了旧版 API 路由（`src/app/api/swarm/` 下的 mock、stream、v2、v9）
- 删除了旧版 Agent 引擎（`src/lib/agents/v2/`, `v6/`, `v9/`, `v9.5/`）
- 删除了金融特定模块（`src/lib/calibration/`, `ml/`, `indicators/`, `market-data/`）
- 删除了独立的旧版前端项目 `swarmalphy-main/`（约 305MB）
