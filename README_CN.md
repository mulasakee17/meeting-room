# 🐜 SwarmAlpha

> **用对照实验证明：LLM 多智能体系统需要治理——但仅在它们真正需要协作的时候。**
>
> *首个以统计严格性论证 AI 治理部署边界条件的受控实验。*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/tests-124%20passed-green)](./test/)
[![Framework-Agnostic](https://img.shields.io/badge/framework-agnostic-purple)]()
[![Embeddable](https://img.shields.io/badge/embeddable-SDK-orange)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[English](./README.md) | **中文**

---

## 核心发现

**治理能提升 LLM 智能体的决策质量——但仅当任务具有高度相互依赖性时。**

| | 投资决策（强相互依赖） | 企业并购（弱相互依赖） |
|---|---|---|
| **无治理 τ** | 0.022（接近随机） | 0.533（本身就不错） |
| **完整治理 τ** | 0.556 | 0.640 |
| **组内 Δτ** | **+0.84** ✓（CI [+0.27, +1.38]） | **−0.12** ✗（CI [−0.25, −0.02]） |
| **洗牌 τ** * | 0.000（随机） | 0.900（比完整治理更好！） |
| **结论** | 治理不可或缺 | 治理多此一举 |

*\*洗牌对照：打乱智能体知识以破坏信息连贯性，检验治理提升是否为均值回归伪影。*

### 四条证据链支撑这一结论：

**1. Δτ 方法揭示了 Cohen's d 掩盖的真相。** 标准效应量显示两个任务都在"改善"（d=+0.71 和 +0.58）。只有组内轨迹分析——追踪同一批智能体在多轮讨论中的变化——才揭示出它们走向了相反的方向。

**2. 洗牌对照排除了均值回归。** 在投资任务中，当智能体知识被打乱后，即便施加完整治理，τ 也跌至 0.000。这证明治理带来的提升确实来自对正确信息的整合，而非"多讨论了几轮"或统计假象。

**3. 多样性注入是唯一有效的单干预机制，权重削减反而有害。** 投资任务的单干预消融揭示：`full_diversity`（仅注入多样性）单独达到 τ=0.667（ΔQ=+32.2，p=0.003）——*唯一*统计显著的单干预，效果甚至略超完整治理。`full_weight`（削减高影响力智能体的发言权）使 τ 跌至 −0.267——在相互依赖任务上，削弱权威就是在摧毁独特信息。`full_reflection`（τ=0.333）和 `full_continue`（τ=0.200）方向为正但不显著。机制清晰：回声室检测 → 多样性注入 → 迫使隐藏信息浮出水面。不是多聊几轮。不是反思。不是削权。就是让智能体说出只有自己知道的东西。

**反直觉发现（并购洗牌）**：在弱相互依赖任务上，打乱智能体知识反而让表现超越了完整治理（τ=0.900 vs 0.613）。为什么？并购任务中的智能体本身就掌握了全部 5 家公司的数据——他们不需要彼此也能做出合理判断。洗牌打破了他们的专业过度自信：CFO 手里拿的不再是财务数据而是陌生的技术数据，于是变得不那么确定，开始真正倾听他人的意见。结果是在没有任何治理干预的情况下实现了更好的信息聚合。这进一步强化了边界条件：在弱相互依赖任务上，治理不仅多余——打破过度自信（无论用什么手段，包括随机知识轮换）可以胜过定向干预。

> **核心洞察**：组间效应量高估了治理的影响。治理并非"总是更好"——其价值取决于任务结构。而且其机制不在于强制执行流程，而在于让那些本来不会被提及的信息浮出水面。

---

## SwarmAlpha 是什么？

SwarmAlpha 是用于生成上述证据的**治理运行时**——一个可嵌入的中间层，观察、检测并干预多智能体系统中的集体决策失效。

它**不创建**智能体，也**不管理**工作流。它通过插件形式接入现有框架，提供：

- 🔍 **观测**——从自然语言中提取智能体的信念和情绪
- 📊 **信念建模**——追踪信念演化与影响力传播
- 🚨 **偏差检测**——回声室、权威偏差、群体极化、过早共识
- 🛡️ **干预**——向智能体讨论中注入定向提示
- 📈 **评估**——五维评分，附 Bootstrap 置信区间

**核心原则**：LLM 只负责感知（从语言中提取信念）。数学处理其余一切——共识计算、偏差检测、信念动力学。这意味着治理运行时可以作为一个**快速、廉价、可解释**的插件运行，零额外 LLM 调用。

---

## 为什么治理很重要？

当 5 个 AI 智能体讨论一个问题时，它们会陷入和人类群体相同的陷阱：

| 失效模式 | 表现 | 后果 |
|---------|------|------|
| **过早共识** | 第一轮就达成一致，关键信息从未被讨论 | 次优决策 |
| **权威偏差** | 一个过度自信的智能体主导全组 | 羊群效应 |
| **回声室** | 观点相似的智能体互相印证偏见 | 集体盲点 |
| **群体极化** | 分歧固化为僵局 | 决策瘫痪 |

**现有所有多智能体框架都不检测、也不干预这些失效。** SwarmAlpha 填补了这一空白——作为一个可插拔的治理层。

---

## 架构

```
┌──────────────────────────────────────────────┐
│   你的多智能体框架                              │
│   （AutoGen / CrewAI / LangGraph / 自建）       │
│                                               │
│   智能体1   智能体2   智能体3   ...              │
│      │          │         │                    │
│      └──────────┴─────────┘                    │
│                 │                              │
│           讨论消息流                              │
│                 │                              │
├─────────────────┼────────────────────────────┤
│   SwarmAlpha 治理运行时                          │
│                                               │
│   ┌─────────────────────────────────────┐    │
│   │  观测 → 信念建模                       │    │
│   │     ↓                                │    │
│   │  偏差检测（4 种）                       │    │
│   │     ↓                                │    │
│   │  自适应治理（干预）                      │    │
│   │     ↓                                │    │
│   │  决策评估（5 维度）                     │    │
│   └─────────────────────────────────────┘    │
│                                               │
│**框架无关 · 可嵌入 · 自适应 · 可扩展**             │
└──────────────────────────────────────────────┘
```

---

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/mulasakee17/meeting-room.git
cd meeting-room
npm install
```

### 2. 添加 API Key

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`——至少添加一个 LLM API key：

```bash
# 必填：至少一个
DEEPSEEK_API_KEY=sk-your-key-here     # 从 https://platform.deepseek.com/ 获取
# OPENAI_API_KEY=sk-your-key-here      # 从 https://platform.openai.com/ 获取
# ANTHROPIC_API_KEY=sk-ant-your-key    # 从 https://console.anthropic.com/ 获取
```

**费用参考**：DeepSeek 约 0.07 元/次实验（5 智能体 × 5 轮）。OpenAI 约 0.7 元。Anthropic 约 1 元。

### 3. 运行

```bash
# Web 界面（演示模式无需 API key）
npm run dev                # → http://localhost:3000

# 运行实验（需要 API key）
npm run experiment          # 完整消融矩阵

# 分析结果（不需要 API key）
npm run analyze             # Bootstrap 置信区间 + 统计推断

# 参数敏感性分析（需要 API key）
npm run sensitivity         # 5 参数 × 5 值扫描

# 运行测试（不需要 API key）
npm test                    # 124 个测试
```

**演示模式**：打开 http://localhost:3000，点击"Run Comparison"——使用预计算场景，零 API 费用。"Live"模式发送真实 LLM 请求。

### 4. 作为 SDK 在你自己的项目中使用

```typescript
import { GovernanceRuntime, CustomAdapter } from "@/runtime";

const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",           // "none" | "detect-only" | "full"
});

// 将你的智能体消息传入治理管线
const result = runtime.processRound(messages);

if (result.hasIntervention) {
  await applyInterventionToYourAgents(result.interventions[0]);
}

const evaluation = runtime.getSessionResult(finalDecision);
console.log(`决策质量：${evaluation.overallScore}/100`);
```

### 支持的 LLM 提供商

| 提供商 | 模型 | 配置 |
|--------|------|------|
| **DeepSeek**（默认） | deepseek-chat | 在 `.env.local` 中设置 `DEEPSEEK_API_KEY` |
| OpenAI | gpt-4o-mini | 在 `.env.local` 中设置 `OPENAI_API_KEY` |
| Anthropic | claude-3-haiku | 在 `.env.local` 中设置 `ANTHROPIC_API_KEY` |
| 本地（Ollama） | llama3, mistral | `LOCAL_LLM_URL=http://localhost:11434` |

在 `experiments/v2/run.ts` 第 112 行切换提供商：将 `provider: "deepseek"` 改为 `"openai"` 或 `"anthropic"`。

---

## 治理运行时

### 4 种治理模式 + 扩展消融

| 模式 | 检测 | 干预 | 用途 |
|------|------|------|------|
| `none` | ❌ | ❌ | 基线对照 |
| `detect-only` | ✅ | ❌ | 霍桑效应检验 |
| `random-intervene` | ❌ | ✅ 随机 | 消融实验："精准度是否必要？" |
| `full` | ✅ | ✅ 定向 | 生产使用 |
| **扩展模式** | | | |
| `shuffle` | ✅ | ✅ | 均值回归对照：打乱智能体知识 |
| `full_diversity` | 仅回声室 | 仅多样性 | 单干预消融 |
| `full_weight` | 仅权威偏差 | 仅削减权重 | 单干预消融 |
| `full_reflection` | 仅极化 | 仅反思 | 单干预消融 |
| `full_continue` | 仅过早共识 | 仅延长讨论 | 单干预消融 |

### 自适应治理

阈值和干预强度根据任务上下文自适应调整：

- **自适应阈值**：先跑一轮校准讨论 → 测量收敛速度、基础冗余度、影响力集中度 → 按任务自动缩放检测阈值
- **自适应剂量**：干预强度随偏差严重度、信息覆盖率和历史干预效果动态调整
- **交叉质证引擎**：当智能体出现分歧，自动分为正反阵营，进行对抗性辩论，综合裁决并保留少数派报告

### 五维决策评估

| 维度 | 测量的内容 | 权重 |
|------|-----------|------|
| **共识度** | Kuramoto 序参数 + 信念方差 + 收敛轨迹 | 20% |
| **可靠性** | 跨轮次 Cronbach's α + 交叉验证 + 可重复性 | 25% |
| **离散度** | 跨智能体信念/置信度方差 + 轮次波动 | 20% |
| **稳定性** | 轮次一致性 + 时序平滑度 | 17% |
| **影响力分析** | 基尼系数 + 网络中心性 + 影响路径 | 18% |

---

## 框架兼容性

SwarmAlpha **不绑定任何框架**。通过标准化适配器接口，它可以与任何多智能体系统协同工作：

| 框架 | 适配器 | 状态 |
|------|--------|------|
| **自建**（内置） | `CustomAdapter` | ✅ 完整集成 |
| **AutoGen**（微软） | `AutoGenAdapter` | 🔧 TypeScript 桥接（完整集成需 Python sidecar） |
| **CrewAI** | 计划中 | 🗓️ 路线图 |
| **LangGraph** | 计划中 | 🗓️ 路线图 |

每个适配器将框架原生消息翻译为标准的 `DiscussionMessage` 格式，并将治理干预回注到框架中。

### 可扩展检测与共享工具

治理引擎支持通过注册 API 添加**自定义偏差检测器**——无需修改核心引擎即可扩展检测能力：

```typescript
engine.registerDetector({
  type: "groupthink",
  detect(agentBeliefs, messages, config) {
    // 自定义检测逻辑
    return { detected: true, severity: "medium", description: "..." };
  },
});
```

共享工具模块（`src/lib/utils/`）消除了代码库中的重复代码：
- **`Registry<K,V>`** — 泛型注册表基类，供适配器/策略注册使用
- **`jsonUtils.ts`** — 统一 JSON 解析（stripCodeFences、safeJsonParse、extract 系列）
- **`statsUtils.ts`** — 统计工具（mean、std、variance、normalize）
- **`interventionPrompt.ts`** — 统一干预提示词格式化

---

## 实验证据

**220+ 次对照实验**（2 任务 × 9 消融模式 × n=10-15）。主要指标：Kendall's τ + **组内 τ 轨迹（Δτ）**——追踪同一批智能体在多轮讨论中的变化。

### 为什么 Δτ + 洗牌对照很重要

| 方法 | 测量什么 | 陷阱 |
|------|---------|------|
| **Cohen's d**（组间） | 不同组之间的平均差异 | 不同智能体、不同初始条件 |
| **Δτ**（组内） | 同一批智能体跨轮次改进 | — |
| **洗牌对照** | 知识被打乱后的治理效果 | 检验均值回归 |

### 任务 1：相互依赖的投资决策（需要强协作）

没有单个智能体能独立得出正确答案。无治理 τ = 0.022。

| 消融模式 | τ（μ±σ） | Q（μ±σ） | Δτ | d vs none |
|----------|-----------|-----------|-----|-----------|
| 无治理 | 0.022±0.791 | 51.3±39.6 | +0.40 | — |
| **完整治理** | **0.556±0.698** | **77.9±34.9** | **+0.84** ✓ | +0.71 |
| 洗牌 | −0.000±0.720 | 50.2±36.1 | −0.33 | −0.03 |
| **full_diversity** | **0.667±0.351** | **83.5±17.4** | **+1.13** ★ | +0.98 |
| full_reflection | 0.333±0.943 | 66.7±47.1 | +0.67 | +0.36 |
| full_continue | 0.200±1.033 | 60.0±51.6 | +0.67 | +0.20 |
| full_weight | −0.267±0.966 | 36.7±48.3 | +0.07 | −0.34 |

- **Δτ = +0.84，95% CI [+0.27, +1.38]**——显著为正
- **洗牌 τ = 0.000**——知识被打乱 → 治理无法发挥作用 → **均值回归被排除**
- **full_diversity 是唯一显著的单干预**（ΔQ=+32.2，p=0.003）——回声室检测是核心机制
- **full_weight 适得其反**（τ=−0.267）——在相互依赖任务上，削减权重是在摧毁信息

### 任务 2：企业并购目标选择（弱协作需求）

智能体可以独立推理。无治理 τ = 0.533。

| 消融模式 | τ（μ±σ） | Q（μ±σ） | Δτ | d vs none |
|----------|-----------|-----------|-----|-----------|
| 无治理 | 0.533±0.209 | 76.7±10.5 | 0.00 | — |
| **完整治理** | **0.613±0.177** | **80.7±8.8** | **−0.12** ✗ | +0.41 |
| 洗牌 | **0.900±0.194** | **95.0±9.7** | −0.11 | +1.80 |
| 仅延长讨论 | 0.620±0.063 | 81.0±3.2 | −0.14 | +0.52 |

- **Δτ = −0.12，95% CI [−0.25, −0.02]**——显著为*负*
- **洗牌 τ = 0.900 > 完整治理 τ = 0.613**——打乱知识反而*提升*了表现。打破专业过度自信迫使智能体倾听。
- **完整治理 vs 无治理 ΔQ=+4.0，p=0.280**——统计上不显著

### 边界条件（附证据）

| 论断 | 证据 |
|------|------|
| 治理对相互依赖任务有效 | 投资 Δτ=+0.84，CI 不含 0 |
| 治理对弱相互依赖任务无效 | 并购 Δτ=−0.12，p=0.28 |
| 效果不是均值回归 | 洗牌 τ=0.000（投资），洗牌 τ>完整治理（并购） |
| 回声室检测是核心机制 | full_diversity 唯一显著单干预（p=0.003），其余均不显著 |
| 权重削减在相互依赖任务上适得其反 | full_weight τ=−0.267——削减权威即摧毁独特信息 |
| 在简单任务上打破过度自信胜过治理 | 并购洗牌 τ=0.900 > 完整治理 τ=0.613 |

**统计严格性**：Bootstrap 95% 置信区间（10,000 次重采样，确定性种子）。9 种消融模式。参数敏感性基础设施（5×5×5 扫描）。所有原始数据保存在 `experiments/v2/data*/`。

---

## 为什么这很重要

多智能体系统正被部署到高风险领域——金融、医疗、法律。当 5 个 AI 智能体讨论一个关键决策时，它们会犯和人类群体**相同的系统性错误**。现有框架（AutoGen、CrewAI、LangGraph）提供零治理能力。

SwarmAlpha 证明了：

1. **治理是必要的**——未经治理的智能体无法整合分布式信息（τ=0.022）
2. **治理有边界**——当智能体本身就足够胜任时，干预不会带来改善
3. **你不能用简单的组间平均值来衡量治理效果**——我们的 Δτ 方法论是区分真实效果和统计伪影的必要手段

**对 AI 部署的启示**：不要给每个多智能体系统都加上治理。先测量任务相互依赖性。在智能体*真正需要*彼此的地方部署治理。在不需要的地方跳过它。

---

## 可扩展架构：从 5 个智能体到 500 个

SwarmAlpha 的讨论拓扑层让同一套治理引擎能在任意规模下运行：

| 规模 | 拓扑 | 行为 |
|------|------|------|
| **5 智能体** | `FlatTopology` | 圆桌讨论——所有智能体看到所有观点 |
| **40 智能体** | `GroupedTopology(8)` | 5 组 × 8 智能体，每轮重新洗牌——交叉授粉 |
| **500 智能体** | `CommitteeTopology` | 分组 → 代表 → 全体会议——联邦治理 |

治理引擎本身**在所有规模下保持不变**。只有讨论结构发生变化。偏差检测器和干预策略操作的是全局信念状态——它们不关心信念是在扁平讨论还是分组讨论中形成的。

```typescript
// 一行配置扩展到 40 个智能体：
const engine = new DiscussionEngine({
  governanceMode: "full",
  topology: new GroupedTopology(8),  // ← 唯一需要改的地方
});
```

> *"不是构建智能体的框架，而是治理智能体的操作系统。"*

---

## 项目结构

```
src/
├── runtime/                      # 🆕 可嵌入治理运行时（SDK）
│   ├── GovernanceRuntime.ts      # 核心治理编排器
│   ├── types.ts                  # 框架无关类型
│   ├── index.ts                  # 公开 API 入口
│   └── adapters/                 # 框架桥接
│       ├── CustomAdapter.ts      # 内置智能体框架
│       └── AutoGenAdapter.ts     # AutoGen 桥接
├── lib/
│   ├── governance/               # 偏差检测器 + 干预策略
│   ├── evaluation/               # 五维评分引擎
│   ├── observation/              # LLM 输出解析
│   ├── inference/                # 信念演化计算
│   ├── discussion/               # 内置多轮讨论引擎
│   ├── llm/                      # 多提供商 LLM 抽象
│   ├── utils/                    # 🆕 共享工具（Registry、JSON、统计）
│   ├── benchmarks/               # 基准测试框架
│   └── security/                 # 速率限制 + 输入验证
├── app/                          # Next.js Web 界面 + REST API
│   ├── page.tsx                  # 演示/实时对比视图
│   └── api/v3/                   # API 端点
experiments/                      # Hidden Profile 实验框架
└── test/                         # 112 个自动化测试
```

---

## 运行测试

```bash
npm test              # 112 个测试，覆盖 11 个文件
npm run test:watch    # 监听模式
```

---

## 文档

| 文档 | 内容 |
|------|------|
| [ONEPAGER.md](ONEPAGER.md) | 一页摘要 |
| [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) | 深度技术架构 |
| [API_CONTRACT.md](API_CONTRACT.md) | REST API + SDK API 规范 |
| [MATHEMATICAL_FRAMEWORK.md](MATHEMATICAL_FRAMEWORK.md) | 完整形式化数学定义 |
| [RESEARCH_STATEMENT.md](RESEARCH_STATEMENT.md) | 研究贡献与实验结论 |
| [experiments/v2/analyze.ts](experiments/v2/analyze.ts) | Bootstrap 置信区间分析脚本 |
| [experiments/v2/sensitivity.ts](experiments/v2/sensitivity.ts) | 参数敏感性扫描 |

---

## 技术栈

TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek API

---

## 作者

**贺孟元**——高中生，独立完成架构设计、代码实现与实验设计。

AI 辅助开发（Claude Code）。架构决策与实验设计完全自主。

---

> *"不是取代智能体如何决策——而是确保它们的决策经得起审视。"*