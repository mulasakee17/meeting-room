# SwarmAlpha V3 Research & Architecture Refactor Report

> **研究方向重构 + 架构重新设计**
>
> 日期: 2026-07-01
> 版本: V3 Phase 1 + Phase 2

---

## 目录

1. [研究方向重构](#一研究方向重构)
   - [1.1 当前问题分析](#11-当前问题分析)
   - [1.2 新 Mission Statement](#12-新-mission-statement)
   - [1.3 新 Research Question](#13-新-research-question)
   - [1.4 新 Contribution](#14-新-contribution)
   - [1.5 新项目定位](#15-新项目定位)
   - [1.6 新 README 结构](#16-新-readme-结构)
   - [1.7 建议修改内容](#17-建议修改内容)

2. [架构重新设计](#二架构重新设计)
   - [2.1 现有架构分析](#21-现有架构分析)
   - [2.2 新总体架构](#22-新总体架构)
   - [2.3 模块重新划分](#23-模块重新划分)
   - [2.4 Evaluation Engine 设计](#24-evaluation-engine-设计)
   - [2.5 Governance Engine 设计](#25-governance-engine-设计)
   - [2.6 新目录结构](#26-新目录结构)
   - [2.7 接口统一](#27-接口统一)
   - [2.8 Decision Trace 重新设计](#28-decision-trace-重新设计)
   - [2.9 插件化设计](#29-插件化设计)

---

## 一、研究方向重构

### 1.1 当前问题分析

#### 1.1.1 当前项目真正研究的问题

SwarmAlpha 实际上研究的是：

> **如何在不完全信息和认知异质性条件下，构建可评价、可治理的 LLM Multi-Agent 集体决策机制。**

核心要素：
- **不完全信息**：56% Agent 对在方向因子上共享 0 个重叠（强制信息盲区）
- **认知异质性**：不同 Agent 具有不同的因子重要性偏好和解释函数
- **可评价**：7 维度共识质量度量
- **可治理**：自动干预机制（重新讨论、引入新 Agent、保护少数派、降低异常 Agent 影响力）

#### 1.1.2 当前 README 存在的问题

| 问题类型 | 具体表现 | 影响 |
|---------|---------|------|
| **过于强调金融** | 大量使用金融术语（降息、买卖、VIX、RSI），示例全部为金融场景 | 掩盖了项目的通用研究价值 |
| **过于强调数学模型** | 过多强调 Bayesian、Entropy、Decay 等数学方法 | 混淆了"实现手段"与"核心贡献" |
| **过于强调 Agent 自身** | 详细描述 Agent 角色（Policy、Value、Momentum） | 偏离了"集体决策"的核心 |
| **没有回答研究动机** | 缺少"为什么要研究这个问题"的阐述 | 无法建立研究的学术价值 |
| **Research Question 不聚焦** | 当前没有明确的单一研究问题 | 无法指导后续研究方向 |

### 1.2 新 Mission Statement

> **研究和构建 LLM Multi-Agent 集体决策的评价与治理机制，使群体决策具备高质量、可解释、可复现和抗极化的特性。**

### 1.3 新 Research Question

> **在 LLM Multi-Agent 系统中，如何通过认知状态的数学建模和治理干预，实现高质量、可解释且抗极化的集体决策？具体而言：(1) 如何量化评价群体决策的质量和稳定性？(2) 如何设计有效的治理机制防止群体极化和虚假共识？(3) 如何在保证可复现性的同时保留认知多样性？**

**为什么这个问题值得研究？**
- **现实紧迫性**：LLM Multi-Agent 系统正在广泛应用，但缺乏对其集体决策质量的评价方法和治理手段
- **理论空白**：现有研究缺乏对"认知状态演化→集体决策涌现→治理干预"完整链条的系统研究
- **实践需求**：企业和组织需要确保 AI 辅助决策的可靠性

**为什么别人没有很好解决？**
- **缺乏统一框架**：现有研究分散在不同领域，缺乏统一的理论框架
- **忽视评价维度**：多数研究只关注决策结果的准确性，忽视了多样性、稳定性、可追溯性等关键维度
- **治理机制缺失**：现有系统很少设计主动干预机制来防止群体极化和虚假共识

### 1.4 新 Contribution

#### Contribution 1：集体决策质量多维评价框架

提出 7 维度的共识质量度量体系（Quality、Robustness、Diversity、Stability、Traceability、MinorityProtection、InfluenceDistribution），并给出可操作的计算方法和权重分配。

**为什么重要**：填补了集体决策评价的理论空白，提供了量化指标，使不同 Multi-Agent 系统的决策质量可以比较。

#### Contribution 2：基于认知状态的治理机制

设计基于共识健康度评估的自动干预机制，包括虚假共识检测、群体极化识别、少数派保护和异常 Agent 降级。

**为什么重要**：首次提出了完整的 Multi-Agent 决策治理框架，解决了群体极化和虚假共识这两个关键问题。

#### Contribution 3：可解释决策轨迹（Decision Trace）

记录每个 Agent 的完整推理过程（Step Name、Input、Reasoning、Output、State Update），实现决策过程的全链路可追溯。

**为什么重要**：使黑箱决策过程变得透明可解释，支持失败案例的根因分析，为审计和合规提供了技术基础。

#### Contribution 4：实验平台与可复现性保证

构建开放的实验平台，支持多种 Agent 类型，通过确定性映射保证相同输入产生相同输出。

**为什么重要**：降低了研究门槛，通过多 LLM 交叉验证提高了结果的可靠性。

### 1.5 新项目定位

#### 一句话定义

> **SwarmAlpha 是一个研究 LLM Multi-Agent 集体决策评价与治理的实验平台。**

#### 一段简介

SwarmAlpha 致力于解决 LLM Multi-Agent 系统中的核心问题：如何评价群体决策的质量？如何治理群体决策过程？如何在保证可复现性的同时保留认知多样性？通过构建认知状态数学模型、多维度评价体系和主动治理机制，SwarmAlpha 为研究集体决策提供了一个可扩展、可复现、可解释的实验环境。

#### 详细介绍

SwarmAlpha 是一个通用的 LLM Multi-Agent 集体决策研究平台，核心功能包括：

1. **认知状态建模**：定义并建模 Agent 的核心认知状态变量（信念、置信度、不确定性、信任、开放度、记忆）
2. **群体决策评价**：提供 7 维度的共识质量度量
3. **决策治理机制**：实现基于共识健康度评估的自动干预
4. **可解释决策轨迹**：记录完整的决策推理过程
5. **多 Agent 支持**：支持 GPT、Claude、Gemini、DeepSeek 等多种 LLM Agent
6. **实验可复现性**：通过确定性映射保证相同输入产生相同输出

#### 三个版本定位

| 版本 | 定位 | 重点 |
|------|------|------|
| **当前版本（V3）** | 实验平台 | 构建核心评价和治理机制 |
| **下一版本（V4）** | 研究工具 | 提供完整的实验框架和分析工具 |
| **未来版本（V5）** | 开放平台 | 支持第三方 Agent 和实验插件 |

### 1.6 新 README 结构

```
1. Introduction
2. Research Background
3. Research Question
4. Motivation
5. Framework
6. Architecture
7. Evaluation
8. Governance
9. Decision Trace
10. Experimental Results
11. Benchmarks
12. Roadmap
13. Future Work
14. References
```

### 1.7 建议修改内容

#### 需要删除的概念

| 概念 | 原因 |
|------|------|
| **金融预测相关术语** | 如"涨跌判断"、"买卖决策"、"市场数据"等，是 Benchmark 场景的产物 |
| **特定 Agent 角色名称** | 如 Policy、Value、Momentum、Contrarian 等金融领域的 Agent 角色 |
| **金融技术指标** | 如 VIX、RSI、MACD 等，应降级为 Benchmark 数据的一部分 |

#### 需要降级的概念

| 概念 | 当前位置 | 建议降级为 |
|------|---------|-----------|
| **贝叶斯定理** | 核心理论基础 | 实现细节（数学方法之一） |
| **信息熵** | 核心理论基础 | 实现细节（数学方法之一） |
| **指数衰减** | 核心理论基础 | 实现细节（数学方法之一） |
| **Kuramoto 同步化** | 核心理论基础 | 实现细节（数学方法之一） |
| **金融回测** | 核心验证方法 | Benchmark 验证方法之一 |

#### 需要重命名的概念

| 当前名称 | 建议新名称 | 原因 |
|---------|-----------|------|
| **swarm** | **collective** | 更准确地表达"集体"而非"蜂群"的含义 |
| **consensus score** | **collective decision quality** | 更准确地表达评价对象 |
| **beliefStrength** | **positionStrength** | 更通用，不局限于"信念"概念 |
| **trust decay** | **trust dynamics** | 更全面地表达信任的动态变化 |
| **influence propagation** | **social influence** | 更简洁明确 |

---

## 二、架构重新设计

### 2.1 现有架构分析

#### 2.1.1 模块价值评估

| 模块 | 当前位置 | 价值评估 | 建议处理 |
|------|---------|---------|---------|
| **Reasoner** | `src/lib/agents/v2/reasoner.ts` | ✅ 高价值 | 保留，作为 Agent Layer 的核心组件 |
| **CrossValidator** | `src/lib/agents/v2/crossValidator.ts` | ✅ 高价值 | 保留，作为 Agent Layer 的可靠性保障 |
| **StateUpdater** | `src/lib/agents/v2/stateUpdater.ts` | ⚠️ 中等价值 | 降级为 Interaction Strategy |
| **DecisionMaker** | `src/lib/agents/v2/decisionMaker.ts` | ✅ 高价值 | 保留，作为 Execution Layer 的核心组件 |
| **Logger** | `src/lib/agents/v2/logger.ts` | ✅ 高价值 | 升级为 Decision Trace Layer |
| **TrustEngine** | `src/lib/agents/v2/trustEngine.ts` | ✅ 高价值 | 保留，作为 Interaction Layer 的核心组件 |
| **InfluenceEngine** | `src/lib/agents/v2/influenceEngine.ts` | ✅ 高价值 | 保留，作为 Interaction Layer 的核心组件 |
| **EvaluationEngine** | `src/lib/agents/v2/evaluationEngine.ts` | ✅✅ 核心价值 | 升级为系统中心模块 |
| **GovernanceEngine** | `src/lib/agents/v2/governanceEngine.ts` | ✅✅ 核心价值 | 升级为系统中心模块 |
| **AgentRegistry** | `src/lib/agents/v2/agentRegistry.ts` | ✅ 高价值 | 保留，作为 Agent Layer 的插件管理 |
| **v9 模块** | `src/lib/agents/v9/` | ⚠️ 领域特定 | 降级为 benchmark/financial 插件 |

#### 2.1.2 架构问题识别

1. **Evaluation 不是中心**：当前 EvaluationEngine 只是众多模块之一
2. **模块耦合度高**：v9 模块与金融领域紧密耦合
3. **缺少抽象接口**：没有定义核心抽象接口
4. **插件化不足**：Agent 类型和 Benchmark 类型不够灵活
5. **Decision Trace 不完整**：缺少 Evaluation 和 Governance 的完整记录

### 2.2 新总体架构

#### 2.2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Task Layer                                        │
│  定义决策任务：输入、目标、约束条件                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Multi-Agent Layer                                  │
│  Agent Adapter + Agent Registry + Cross Validator                           │
│  支持：GPT / Claude / Gemini / Qwen / DeepSeek / Open Source / AutoGen /   │
│        CrewAI / LangGraph                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Interaction Layer                                  │
│  Trust Engine + Influence Engine + Communication Strategy                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Decision Trace Layer                               │
│  完整记录从输入到输出的整个生命周期                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ╔══════════════════════════════════════╗              │
│                      ║        EVALUATION ENGINE             ║              │
│                      ║     (系统中心 - 核心评价引擎)          ║              │
│                      ╚══════════════════════════════════════╝              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ╔══════════════════════════════════════╗              │
│                      ║       GOVERNANCE ENGINE              ║              │
│                      ║     (主动治理引擎)                    ║              │
│                      ╚══════════════════════════════════════╝              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Execution Layer                                    │
│  Decision Maker + Action Executor                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Benchmark Layer                                    │
│  Financial / Medical / Legal / Enterprise / Scientific Discussion           │
│  领域特定数据和验证方法，全部共享同一套 Evaluation/Governance/Experiment      │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 各层职责说明

| 层级 | 职责 | 核心组件 | 关键特性 |
|------|------|---------|---------|
| **Task Layer** | 定义决策任务 | Task Definition | 领域无关，结构化输入 |
| **Multi-Agent Layer** | 管理 Agent 实例 | Agent Adapter, Registry, CrossValidator | 插件化，多 LLM 支持 |
| **Interaction Layer** | 管理 Agent 互动 | Trust Engine, Influence Engine, Communication | 动态信任，影响力传播 |
| **Decision Trace Layer** | 记录完整决策轨迹 | Trace Recorder, Trace Storage, Trace Analyzer | 全生命周期记录，可追溯 |
| **Evaluation Engine** | **评价集体决策质量** | Consensus Evaluator, Reliability Evaluator, etc. | **系统中心，领域无关** |
| **Governance Engine** | **主动治理决策过程** | Echo Chamber Detector, Polarization Detector, etc. | **主动干预，动态调整** |
| **Execution Layer** | 执行最终决策 | Decision Maker, Action Executor | 确定性映射，可复现 |
| **Benchmark Layer** | 提供领域验证 | Domain Data, Ground Truth, Metrics | 插件化，可替换 |

### 2.3 模块重新划分

#### 2.3.1 模块处理方案

| 原模块 | 处理方式 | 新名称 | 新位置 |
|--------|---------|--------|--------|
| **Reasoner** | 保留 | Reasoner | `agent/reasoner.ts` |
| **CrossValidator** | 保留 | CrossValidator | `agent/crossValidator.ts` |
| **StateUpdater** | 降级为策略 | InteractionStrategy | `interaction/strategies/` |
| **DecisionMaker** | 保留 | DecisionMaker | `execution/decisionMaker.ts` |
| **Logger** | 升级 | TraceRecorder | `trace/traceRecorder.ts` |
| **TrustEngine** | 保留 | TrustEngine | `interaction/trustEngine.ts` |
| **InfluenceEngine** | 保留 | InfluenceEngine | `interaction/influenceEngine.ts` |
| **EvaluationEngine** | **升级为核心** | EvaluationEngine | `evaluation/engine.ts` |
| **GovernanceEngine** | **升级为核心** | GovernanceEngine | `governance/engine.ts` |
| **AgentRegistry** | 保留 | AgentRegistry | `agent/registry.ts` |
| **v9 模块** | 降级 | Financial Benchmark | `benchmarks/financial/` |

#### 2.3.2 模块关系图

```
                    ┌─────────────────────┐
                    │   ExperimentManager │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌────────────────┐    ┌─────────────────┐
│ Task Layer    │    │ Benchmark Layer│    │ Visualization   │
└──────────┬────┘    └────────┬───────┘    └────────┬────────┘
           │                  │                      │
           ▼                  ▼                      │
┌──────────────────────────────────┐                 │
│        Multi-Agent Layer         │                 │
│  ┌────────┬────────┬─────────┐  │                 │
│  │Adapter │Registry│CrossVal │  │                 │
│  └────────┼────────┼─────────┘  │                 │
└───────────┼────────┼─────────────┘                 │
            ▼        ▼                               │
┌──────────────────────────────────┐                 │
│       Interaction Layer          │                 │
│  ┌──────────┬──────────┬───────┐ │                 │
│  │TrustEng  │InfluEng  │Strategy│ │                 │
│  └──────────┼──────────┼───────┘ │                 │
└─────────────┼──────────┼─────────┘                 │
              ▼          ▼                           │
┌──────────────────────────────────┐                 │
│      Decision Trace Layer        │                 │
│  ┌──────────┬──────────┬───────┐ │                 │
│  │Recorder  │Storage   │Analyzer│ │                 │
│  └──────────┼──────────┼───────┘ │                 │
└─────────────┼──────────┼─────────┘                 │
              ▼          ▼                           │
       ┌─────┴─────┐ ┌───┴──────┐                    │
       ▼           ▼ ▼          ▼                    │
┌───────────────┐ ┌───────────────┐                  │
│ EVALUATION    │◄────►│  GOVERNANCE   │             │
│ ENGINE        │      │ ENGINE        │             │
└───────┬───────┘      └───────┬───────┘             │
        │                      │                     │
        └───────────┬──────────┘                     │
                    ▼                                │
┌──────────────────────────────────┐                 │
│       Execution Layer            │                 │
│  ┌──────────┬──────────┐        │                 │
│  │Decision  │Action    │        │                 │
│  │Maker     │Executor  │        │                 │
│  └──────────┴──────────┘        │                 │
└──────────────────────────────────┘                 │
                    │                                │
                    └────────────────────────────────┘
```

### 2.4 Evaluation Engine 设计

#### 2.4.1 核心接口

```typescript
export interface EvaluationEngine {
  evaluate(trace: DecisionTrace, options?: EvaluationOptions): EvaluationResult;
  
  evaluateConsensus(trace: DecisionTrace): ConsensusEvaluation;
  evaluateReliability(trace: DecisionTrace): ReliabilityEvaluation;
  evaluateExplainability(trace: DecisionTrace): ExplainabilityEvaluation;
  evaluateRobustness(trace: DecisionTrace): RobustnessEvaluation;
  evaluateStability(trace: DecisionTrace): StabilityEvaluation;
  evaluateManipulationResistance(trace: DecisionTrace): ManipulationEvaluation;
  evaluateInfluence(trace: DecisionTrace): InfluenceEvaluation;
}
```

#### 2.4.2 评价维度

| 维度 | 描述 | 核心指标 |
|------|------|---------|
| **Consensus** | 共识质量 | 一致程度、信念分布 |
| **Reliability** | 决策可靠性 | 一致性、可复现性、置信度 |
| **Explainability** | 可解释性 | 轨迹完整性、推理清晰度、证据质量 |
| **Robustness** | 鲁棒性 | 敏感性分析、扰动抵抗、边界处理 |
| **Stability** | 稳定性 | 收敛速率、振荡检测、长期行为 |
| **Manipulation Resistance** | 抗操纵性 | 回声室风险、权威偏见、群体思维 |
| **Influence Analysis** | 影响力分析 | 影响力分布、意见领袖检测、权力集中度 |

#### 2.4.3 关键特性

- **领域无关**：只依赖 `DecisionTrace` 接口
- **可扩展**：支持自定义评价维度和权重
- **可解释**：每个评价维度都提供详细的解释和推理
- **治理导向**：评价结果直接生成治理建议

### 2.5 Governance Engine 设计

#### 2.5.1 核心接口

```typescript
export interface GovernanceEngine {
  assessHealth(trace: DecisionTrace): ConsensusHealth;
  
  detectEchoChamber(trace: DecisionTrace): DetectionResult;
  detectAuthorityBias(trace: DecisionTrace): DetectionResult;
  detectHallucinationCascade(trace: DecisionTrace): DetectionResult;
  detectPrematureConsensus(trace: DecisionTrace): DetectionResult;
  detectPolarization(trace: DecisionTrace): DetectionResult;
  
  decideIntervention(health: ConsensusHealth, trace: DecisionTrace): Intervention;
  applyIntervention(intervention: Intervention, agentStates: Record<string, CognitiveState>): Record<string, CognitiveState>;
  protectMinority(trace: DecisionTrace, agentStates: Record<string, CognitiveState>): Record<string, CognitiveState>;
}
```

#### 2.5.2 检测能力

| 检测器 | 描述 | 检测方法 |
|--------|------|---------|
| **Echo Chamber** | 回声室检测 | 检测观点同质化和信息闭环 |
| **Authority Bias** | 权威偏见检测 | 检测少数高影响力 Agent 主导决策 |
| **Hallucination Cascade** | 幻觉级联检测 | 检测虚假信息在群体中的传播 |
| **Premature Consensus** | 过早共识检测 | 检测缺乏充分讨论的共识 |
| **Group Polarization** | 群体极化检测 | 检测观点向极端方向移动 |

#### 2.5.3 干预策略

| 干预类型 | 描述 | 适用场景 |
|---------|------|---------|
| **introduce_agent** | 引入新 Agent | 观点过于同质化 |
| **boost_minority** | 提升少数派影响力 | 少数派被压制 |
| **reduce_influence** | 降低异常 Agent 影响力 | 权威偏见或异常行为 |
| **add_evidence** | 添加新证据 | 证据不足或片面 |
| **restart_discussion** | 重新讨论 | 虚假共识或过早共识 |
| **diversify_perspective** | 多样化视角 | 群体极化 |

#### 2.5.4 模块关系

```
Evaluation Engine ◄──► Governance Engine
         │                   │
         │ 评价结果          │ 健康度评估
         ▼                   ▼
  生成治理建议          决定干预策略
         │                   │
         └───────────────────┘
              双向反馈
```

### 2.6 新目录结构

#### 2.6.1 目录设计

```
src/
├── core/                          # 核心类型和接口（系统基础）
│   ├── types.ts                   # 核心类型定义
│   ├── interfaces.ts              # 抽象接口定义
│   └── constants.ts               # 常量和配置
│
├── agent/                         # Agent 层（插件化）
│   ├── adapter.ts                 # Agent Adapter 接口
│   ├── registry.ts                # Agent Registry
│   ├── crossValidator.ts          # 多 LLM 交叉验证
│   ├── reasoner.ts                # 推理器
│   └── providers/                 # LLM Provider 实现
│
├── interaction/                   # 互动层
│   ├── trustEngine.ts             # 动态信任引擎
│   ├── influenceEngine.ts         # 影响力引擎
│   ├── communication.ts           # 通信策略
│   └── strategies/                # 互动策略
│
├── trace/                         # 决策轨迹层
│   ├── recorder.ts                # 轨迹记录器
│   ├── storage.ts                 # 轨迹存储
│   ├── analyzer.ts                # 轨迹分析器
│   └── exporter.ts                # 轨迹导出
│
├── evaluation/                    # 评价引擎（系统中心）
│   ├── engine.ts                  # 评价引擎核心
│   ├── dimensions/                # 评价维度实现
│   │   ├── consensus.ts
│   │   ├── reliability.ts
│   │   ├── explainability.ts
│   │   ├── robustness.ts
│   │   ├── stability.ts
│   │   ├── manipulation.ts
│   │   └── influence.ts
│   └── metrics.ts                 # 评价指标计算
│
├── governance/                    # 治理引擎
│   ├── engine.ts                  # 治理引擎核心
│   ├── detectors/                 # 问题检测器
│   │   ├── echoChamber.ts
│   │   ├── authorityBias.ts
│   │   ├── hallucinationCascade.ts
│   │   ├── prematureConsensus.ts
│   │   └── polarization.ts
│   └── interventions/             # 干预策略
│
├── execution/                     # 执行层
│   ├── decisionMaker.ts           # 决策映射器
│   └── executor.ts                # 动作执行器
│
├── benchmarks/                    # 基准测试层（领域特定）
│   ├── index.ts                   # 基准测试接口
│   ├── financial/                 # 金融基准
│   ├── medical/                   # 医疗基准
│   ├── legal/                     # 法律基准
│   ├── enterprise/                # 企业基准
│   └── scientific/                # 科学讨论基准
│
├── experiments/                   # 实验管理
│   ├── manager.ts                 # 实验管理器
│   ├── runner.ts                  # 实验运行器
│   ├── config.ts                  # 实验配置
│   └── results.ts                 # 实验结果分析
│
├── visualization/                 # 可视化层
│   ├── dashboard.ts               # 仪表盘组件
│   ├── charts.ts                  # 图表组件
│   └── traceViewer.ts             # 轨迹查看器
│
└── index.ts                       # 统一导出
```

#### 2.6.2 目录职责说明

| 目录 | 职责 | 关键特性 |
|------|------|---------|
| **core/** | 核心类型和接口定义 | 领域无关，所有模块依赖 |
| **agent/** | Agent 插件管理 | 支持多种 LLM 和 Agent Framework |
| **interaction/** | Agent 互动管理 | 动态信任、影响力传播 |
| **trace/** | 决策轨迹记录 | 全生命周期记录，可追溯 |
| **evaluation/** | **评价引擎（系统中心）** | **领域无关，核心评价** |
| **governance/** | **治理引擎** | **主动干预，动态调整** |
| **execution/** | 决策执行 | 确定性映射，可复现 |
| **benchmarks/** | 领域验证 | 插件化，可替换 |
| **experiments/** | 实验管理 | 可复现，可扩展 |
| **visualization/** | 结果展示 | 实时监控，可视化分析 |

### 2.7 接口统一

#### 2.7.1 核心抽象接口

所有 Benchmark 必须共享以下接口：

```typescript
export interface Task {
  id: string;
  input: string;
  goal: string;
  constraints: string[];
  expectedOutput: string;
  domain: DomainType;
}

export type DomainType = 
  | 'financial' 
  | 'medical' 
  | 'legal' 
  | 'enterprise' 
  | 'scientific'
  | 'other';

export interface CognitiveState {
  agentId: string;
  belief: BeliefDirection;
  beliefStrength: number;
  confidence: number;
  uncertainty: number;
  openness: number;
  evidence: EvidenceItem[];
  trust: TrustRelation[];
  memory: MemoryState;
}

export interface AgentDecision {
  agentId: string;
  action: DecisionAction;
  belief: BeliefDirection;
  beliefStrength: number;
  confidence: number;
  reasoning: string;
  traceId: string;
}

export interface DecisionTrace {
  traceId: string;
  task: Task;
  agentStates: Record<string, CognitiveState>;
  agentDecisions: Record<string, AgentDecision>;
  interactions: CommunicationResult[];
  evaluation: EvaluationResult;
  governanceActions: Intervention[];
  finalDecision: AgentDecision;
}
```

#### 2.7.2 Benchmark 接口约束

```typescript
export interface Benchmark {
  name: string;
  domain: DomainType;
  getTasks(): Task[];
  getGroundTruth(taskId: string): any;
  validateResult(result: ExperimentResult): ValidationResult;
  getMetrics(): BenchmarkMetrics;
}
```

**关键原则：**
- Benchmark 只负责提供数据和验证方法
- 评价逻辑由 Evaluation Engine 统一处理
- 治理逻辑由 Governance Engine 统一处理
- 实验框架由 Experiments Layer 统一管理

### 2.8 Decision Trace 重新设计

#### 2.8.1 完整生命周期记录

```typescript
export interface DecisionTrace {
  traceId: string;
  
  // 阶段 1: 任务输入
  task: Task;
  timestamp: string;
  
  // 阶段 2: Agent 观察
  observations: ObservationStep[];
  
  // 阶段 3: Agent 推理
  reasoningSteps: ReasoningStep[];
  
  // 阶段 4: Agent 决策
  agentDecisions: Record<string, AgentDecision>;
  
  // 阶段 5: 社交互动
  interactions: InteractionStep[];
  
  // 阶段 6: 评价
  evaluation: EvaluationResult;
  evaluationTimestamp: string;
  
  // 阶段 7: 治理
  governanceActions: GovernanceAction[];
  
  // 阶段 8: 最终决策
  finalDecision: AgentDecision;
  finalDecisionTimestamp: string;
  
  // 元数据
  completed: boolean;
  error?: string;
  durationMs: number;
}
```

#### 2.8.2 关键特性

- **全生命周期**：从任务输入到最终决策的完整记录
- **可追溯**：每个步骤都有时间戳和输入输出
- **可解释**：每个决策都有推理过程和证据支持
- **可分析**：支持事后分析和失败案例研究

### 2.9 插件化设计

#### 2.9.1 Agent Adapter 接口

```typescript
export interface AgentAdapter {
  id: string;
  name: string;
  type: AgentType;
  
  observe(input: string, context?: Record<string, any>): Promise<ObservationResult>;
  decide(state: CognitiveState): Promise<DecisionResult>;
  communicate(content: CommunicationContent, context?: Record<string, any>): Promise<CommunicationResult>;
  
  validate?(): Promise<boolean>;
  getReliability?(): number;
}

export type AgentType = 
  | 'gpt' 
  | 'claude' 
  | 'gemini' 
  | 'qwen' 
  | 'deepseek' 
  | 'open-source'
  | 'autogen'
  | 'crewai'
  | 'langgraph';
```

#### 2.9.2 Plugin Manager 接口

```typescript
export interface PluginManager {
  loadPlugin(plugin: Plugin): void;
  unloadPlugin(pluginId: string): void;
  
  loadAgentPlugin(plugin: AgentPlugin): void;
  loadBenchmarkPlugin(plugin: BenchmarkPlugin): void;
  loadEvaluationPlugin(plugin: EvaluationPlugin): void;
  loadGovernancePlugin(plugin: GovernancePlugin): void;
}

export type PluginType = 
  | 'agent' 
  | 'benchmark' 
  | 'evaluation' 
  | 'governance' 
  | 'visualization';
```

---

## 三、总结

### 3.1 架构核心变化

| 变化维度 | 旧架构 | 新架构 |
|---------|--------|--------|
| **中心模块** | Agent 层 | Evaluation Engine |
| **依赖方向** | 无明确方向 | 严格向下流动 |
| **领域耦合** | 强耦合金融 | 领域无关 |
| **治理方式** | 被动规则 | 主动干预 |
| **可追溯性** | 部分记录 | 全生命周期记录 |
| **插件化** | 有限支持 | 完整插件体系 |

### 3.2 关键架构原则

1. **Evaluation 为中心**：Evaluation Engine 是整个系统的核心
2. **领域无关**：核心模块不依赖任何特定领域
3. **抽象接口优先**：通过抽象接口解耦，实现真正的插件化
4. **可追溯性**：完整记录决策生命周期，支持可解释性
5. **主动治理**：Governance Engine 主动检测问题并干预

### 3.3 实施路径

1. **Phase 1**：定义核心抽象接口（core/types.ts, core/interfaces.ts）
2. **Phase 2**：重构 Evaluation Engine，使其依赖抽象接口
3. **Phase 3**：重构 Governance Engine，实现主动治理机制
4. **Phase 4**：实现 Decision Trace 的完整生命周期记录
5. **Phase 5**：实现 Agent Adapter 和 Registry 的插件化
6. **Phase 6**：将 v9 降级为 benchmark/financial 插件
7. **Phase 7**：实现新的目录结构和统一导出

---

**文档版本**: V1.0  
**创建日期**: 2026-07-01  
**适用范围**: SwarmAlpha V3 Research & Architecture Refactor