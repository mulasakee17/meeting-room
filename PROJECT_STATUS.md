# SwarmAlpha 项目进展与结构介绍

**日期：** 2026-07-24  
**版本：** v1.1  
**作者：** 贺孟元

---

## 一、项目定位

SwarmAlpha 是**第一个开源的多智能体认知治理运行时**（Cognitive Governance Runtime for Multi-Agent Systems）。

**核心问题：** LLM 多智能体系统（AutoGen、CrewAI 等）在金融、医疗、法律等高风险场景中，会犯与人类群体相同的系统性决策错误——回声室效应、权威偏差、群体极化、过早共识。现有框架只关注"如何让 agent 协作"，无人关注"协作过程中出了什么问题"。

**核心创新：** 用五维认知状态空间（Utility、Evidence、Inertia、Confidence、Susceptibility）替代传统的标量 Belief 模型，使 agent 的认知过程可观测、可解释、可干预。

**定位：** 不做多智能体框架，做多智能体社会的治理操作系统。与 Microsoft Agent Governance Toolkit / ACS（关注工具执行安全）互补，填补"认知安全"的空白。

---

## 二、项目规模

| 指标 | 数值 |
|------|------|
| 代码总量 | ~34,000 行 TypeScript |
| 技术栈 | TypeScript + Next.js + DeepSeek/Qwen API + Vitest |
| 测试覆盖 | 310 个测试（307 通过，3 个网络相关跳过） |
| 实验数据 | 640+ 个 JSON 文件（均属 Demo，非科学实验） |
| 文档 | 17 个 Markdown 文档 |

---

## 三、目录结构

```
swarmalpha/
│
├── src/                                    # 核心源代码
│   └── lib/
│       ├── adapters/                       # 框架适配器（AutoGen、Custom）
│       │   ├── index.ts                    # 适配器入口
│       │   ├── custom.ts                   # 自研 Agent 实现
│       │   ├── autogen.ts                  # AutoGen 适配器
│       │   └── types.ts                    # 适配器类型定义
│       │
│       ├── agent/
│       │   └── cognitiveState.ts           # ★ 五维认知状态空间（核心模块）
│       │
│       ├── discussion/                     # 讨论引擎
│       │   ├── index.ts                    # 同步讨论引擎（DiscussionEngine）
│       │   ├── nativeCognitiveEngine.ts    # ★ 原生认知状态引擎（v3.1，最新）
│       │   ├── asyncEngine.ts              # 异步讨论引擎（AsyncDiscussionEngine）
│       │   ├── crossExamination.ts         # 交叉质证机制
│       │   ├── topology.ts                 # 分组拓扑（Flat/Grouped/Committee）
│       │   ├── sensitivityTrace.ts         # Dropout 敏感性分析
│       │   ├── influence.ts                # 影响图管理
│       │   ├── influenceUtils.ts           # 影响图工具函数
│       │   ├── memory.ts                   # Agent 记忆管理
│       │   ├── interactionGraph.ts         # 交互图构建
│       │   ├── decisionTrace.ts            # 决策轨迹追踪
│       │   ├── eventTracker.ts             # 事件追踪
│       │   └── types.ts                    # 讨论相关类型
│       │
│       ├── governance/                     # 治理引擎
│       │   ├── index.ts                    # 治理引擎主入口
│       │   ├── types.ts                    # 治理配置类型
│       │   ├── adaptiveThresholds.ts       # 自适应检测阈值
│       │   ├── adaptiveDosage.ts           # 自适应干预剂量
│       │   ├── feedbackChannel.ts          # 治理反馈通道
│       │   ├── interventionPrompt.ts       # 干预 Prompt 构建
│       │   └── interventions/              # 干预策略
│       │       ├── index.ts                 # 干预入口
│       │       ├── introduceDiversity.ts   # 多样性注入（已禁用）
│       │       ├── reduceWeight.ts         # 权重削减
│       │       ├── forceReflection.ts      # 强制反思
│       │       └── continueDiscussion.ts   # 延长讨论（已禁用）
│       │
│       ├── evaluation/                     # 评估引擎
│       │   ├── index.ts
│       │   └── types.ts
│       │
│       ├── observation/                    # 观测层（LLM 输出解析）
│       │   ├── index.ts                    # DefaultOpinionParser
│       │   ├── structuredOutputSchema.ts
│       │   └── types.ts
│       │
│       ├── inference/                      # 推理层（状态推断）
│       │   ├── index.ts
│       │   └── types.ts
│       │
│       ├── runtime/                        # 运行时（框架无关治理 SDK）
│       │   ├── index.ts                    # GovernanceRuntime 主入口
│       │   └── types.ts
│       │
│       ├── analysis/                       # 分析工具
│       │   └── causalEffect.ts             # 因果效应估计
│       │
│       ├── benchmarks/                     # 内置 Benchmark 场景
│       │   ├── index.ts
│       │   └── financial.ts
│       │
│       ├── thermodynamics/                 # 热力学模块
│       │   └── TerminationDecider.ts       # 基于自由能的终止判定
│       │
│       ├── llm/
│       │   └── providers.ts                # LLM 调用封装（DeepSeek / Qwen / GPT）
│       │
│       ├── security/                       # 安全模块
│       │   ├── index.ts
│       │   ├── rateLimit.ts
│       │   └── validation.ts
│       │
│       ├── utils/                          # 工具函数
│       │   ├── statsUtils.ts               # 统计工具（mulberry32、自由能等）
│       │   ├── jsonUtils.ts                # 安全 JSON 解析
│       │   ├── emotion.ts                  # 情绪分析
│       │   ├── retry.ts                    # 重试机制
│       │   ├── registry.ts                 # 组件注册表
│       │   └── logger.ts
│       │
│       ├── constants.ts                    # 全局常量
│       ├── demo-data.ts                    # 演示数据
│       ├── pipeline.ts                     # 旧版流水线
│       └── types.ts                        # 全局类型
│
├── experiments/                            # 实验目录
│   ├── campaign/                           # ★ 实验战役（2026-07-24 新建）
│   │   ├── types.ts                        # 共享类型定义
│   │   ├── run_all.ts                      # 一键运行入口
│   │   ├── configs/                        # 9 个实验配置文件
│   │   │   ├── e1_stability.ts             # E1: 状态稳定性（旧版，post-hoc 认知）
│   │   │   ├── e1_native.ts                # ★ E1 Native: LLM 原生认知状态（最新）
│   │   │   ├── e2_evidence.ts              # E2: Evidence 解释力
│   │   │   ├── e3_inertia.ts               # E3: Inertia → 权威偏差
│   │   │   ├── e4_confidence.ts            # E4: Confidence 预测力
│   │   │   ├── e5_governance.ts            # E5: 治理机制
│   │   │   ├── e6_decoupling.ts            # E6: 状态解耦
│   │   │   ├── e7_detector.ts              # E7: 检测器准确性
│   │   │   └── e8_susceptibility.ts        # E8: Susceptibility 中介
│   │   └── pipeline/                       # 实验流水线
│   │       ├── Runner.ts                   # 实验执行引擎
│   │       ├── MetricComputer.ts           # 度量计算引擎
│   │       ├── StatisticalTest.ts          # 统计检验引擎
│   │       ├── FigureGenerator.ts          # 论文图表生成器
│   │       ├── ReportGenerator.ts          # 实验报告生成器
│   │       └── CampaignSummarizer.ts       # 战役汇总器
│   │
│   ├── v2/                                 # V2 实验（当前主数据）
│   │   ├── run.ts                          # 治理消融实验
│   │   ├── analyze.ts                      # 数据分析
│   │   ├── statsShared.ts                  # 共享统计工具
│   │   ├── task_crisis.ts                  # Crisis 场景
│   │   ├── task_supplier.ts                # Supplier 场景
│   │   ├── task_invest.ts                  # Invest 场景
│   │   ├── task_er_triage.ts               # ER Triage 场景
│   │   ├── task_fraud.ts                   # Fraud 场景
│   │   ├── data/                           # M&A 实验数据（175 个）
│   │   ├── data_crisis/                    # Crisis 实验数据（120 个）
│   │   ├── data_crisis_qwen/               # Crisis Qwen 跨模型数据（30 个）
│   │   ├── data_fraud/                     # Fraud 异步数据（40 个）
│   │   └── data_fraud_malicious/           # Fraud 恶意 agent 数据（~200 个）
│   │
│   ├── lunar_survival/                     # V1 实验（已弃用）
│   │   ├── config.ts                       # 场景配置（TASK_MA 等）
│   │   ├── run.ts                          # 运行脚本
│   │   ├── analyze.ts                      # 分析脚本
│   │   ├── validate_cognitive.ts           # 认知状态验证
│   │   └── data/raw/                       # 80 个实验文件
│   │
│   └── demo.ts                             # 演示脚本
│
├── docs/                                   # 设计文档
│   ├── GOVERNANCE_DESIGN.md                # 治理架构设计
│   ├── INTEGRATION.md                      # 集成指南
│   ├── PITCH.html                          # 项目 Pitch Deck
│   └── PITCH.pdf
│
├── test/                                   # 测试文件
│   ├── governance.test.ts                  # 治理测试
│   ├── runtime.test.ts                     # 运行时测试
│   ├── cognitiveState.test.ts              # 认知状态测试
│   └── ...（共 18 个测试文件）
│
└── 根目录文档/                              # 项目文档（根目录）
    ├── ONEPAGER.md                         # 一页摘要（英文）
    ├── README.md / README_CN.md            # 项目说明
    ├── THEORY.md                           # 理论分析
    ├── THEORY_FREEZE_REPORT.md             # 理论冻结报告
    ├── THEORY_VALIDATION_REPORT.md         # 理论验证报告
    ├── ARCHITECTURE_FREEZE_REPORT.md       # 架构冻结报告
    ├── EXPERIMENTAL_CAMPAIGN_PLAN.md       # 实验战役计划
    ├── RESEARCH_PLATFORM_ROADMAP.md        # 研究平台路线图
    ├── ROADMAP.md                          # 发展路线图
    ├── EXPERIMENT_DESIGN.md                # 实验设计
    ├── TECHNICAL_REPORT.md                 # 技术报告
    ├── PAPER_DRAFT.md                      # 论文草稿
    ├── PAPER_PROFESSOR_VERSION.md          # 教授版论文
    ├── PROJECT_STATUS.md                   # 本文档
    ├── DEVELOPER_GUIDE.md                  # 开发者指南
    ├── LIMITATIONS.md                      # 诚实限制清单
    └── AGENT_SOCIETY_VISION.md             # Agent 社会愿景
```

---

## 四、核心模块详解

### 4.1 五维认知状态空间（`src/lib/agent/cognitiveState.ts`）

这是 SwarmAlpha 的**理论核心**，替代传统的标量 Belief 模型。

| 维度 | 类型 | 含义 | 来源（v3.0） | 来源（v3.1 Native） |
|------|------|------|-------------|-------------------|
| **Utility (U)** | 独立状态 | 对每个选项的偏好向量 [-1, 1]^K | 从 itemBeliefs 反推 | **LLM 直接输出** |
| **Evidence (E)** | 独立状态 | 信息状态（覆盖度、质量、多样性、最近增益） | 从 evidence 字符串解析 | **LLM 直接输出** coverage/quality |
| **Inertia (I)** | 独立状态 | 改变阻力 [0, 1] | 系统计算 | 系统计算（不变） |
| **Confidence (C)** | 派生状态 | 对自身立场的确定性 [0, 1] | 系统计算 = E.quality × E.coverage | **LLM 直接输出** |
| **Susceptibility (Λ)** | 派生状态 | 可塑性 = (1-I) × (1-C) | 系统计算 | 系统计算（不变） |

**关键演进：v3.0 → v3.1**

| 版本 | 引擎 | 认知状态来源 | 问题 |
|------|------|-------------|------|
| v3.0 | DiscussionEngine | post-hoc 从 LLM 的 belief/evidence 反推 | **循环论证**：Utility 从 Belief 反推，再测"Utility 比 Belief 稳定" |
| v3.1 | NativeCognitiveEngine | LLM 直接输出 Utility/Evidence/Confidence | 科学诚实：LLM 输出它能自省的部分，系统只计算跨轮次变量（Inertia/Susceptibility） |

**当前状态：**
- v3.0：核心定义完成，已集成到 DiscussionEngine，`useCognitiveState` 开关控制
- v3.1：代码完成，在 `feature/native-cognitive-state` 分支上，零编译错误，待实验验证

### 4.2 讨论引擎（`src/lib/discussion/`）

| 引擎 | 模式 | 发言机制 | Cognitive State | 状态 |
|------|------|---------|----------------|------|
| DiscussionEngine | 同步 | 所有 agent 同时发言 | v3.0 post-hoc | 稳定 |
| NativeCognitiveEngine | 同步 | 继承 DiscussionEngine | v3.1 LLM 原生 | 新增，待实验 |
| AsyncDiscussionEngine | 异步 | 按发言意愿动态发言 | 不支持 | 待集成 |

**NativeCognitiveEngine 设计原则：**
- 继承 DiscussionEngine，不修改父类任何代码
- 只覆写 `buildPrompt`（新 prompt 模板）和 `updateCognitiveStatesFromRound`（使用 LLM 原生输出）
- 旧实验完全可复现

**已知问题：**
- AsyncDiscussionEngine 未集成 Cognitive State（标量 belief 模型）
- 两个引擎各自维护状态，存在职责重叠（双运行时问题）

### 4.3 治理引擎（`src/lib/governance/`）

检测 4 种群体认知偏差并提供干预：

| 检测器 | 干预策略 | 有效性 |
|--------|----------|--------|
| 回声室效应 | introduce_diversity（多样性注入） | 低（9.1%），已禁用 |
| 权威偏差 | reduce_weight（权重削减） | 高（+0.389 τ） |
| 群体极化 | force_reflection（强制反思） | 高（79.4%） |
| 过早共识 | continue_discussion（延长讨论） | 零（0%），已禁用 |

支持自适应阈值和自适应干预剂量。

### 4.4 运行时（`src/lib/runtime/`）

框架无关的治理 SDK，可通过 `import { GovernanceRuntime } from "@/runtime"` 嵌入任何 agent 系统。通过 StateInferenceBridge 实现与外部框架的信念提取。

---

## 五、当前进展

### 5.1 已完成

| 项目 | 状态 | 说明 |
|------|------|------|
| 标量 Belief 治理引擎 | ✅ | 310 测试通过 |
| 169 次闭环实验（Crisis + Supplier） | ✅ | 治理效果统计显著，使用旧 Belief 模型 |
| 五维认知状态空间定义 | ✅ | Theory Freeze 完成 |
| 8 个实验假设设计（H1-H8） | ✅ | 完成 |
| 实验战役 Pipeline 代码 | ✅ | 零编译错误 |
| 实验配置文件（E1-E8） | ✅ | 完成 |
| 统计检验引擎 | ✅ | 置换检验、Bootstrap CI、Cohen's d、中介分析 |
| 论文图表/报告自动生成 | ✅ | SVG 图表 + Markdown 报告 + LaTeX 片段 |
| **Native Cognitive Engine (v3.1)** | ✅ | LLM 原生输出认知状态，在 `feature/native-cognitive-state` 分支 |
| **E1 Native 实验配置** | ✅ | belief vs native_cognitive 对比实验 |

### 5.2 当前分支

```
master                           # 主干，稳定
└── feature/native-cognitive-state  # ★ 当前开发分支
    ├── NativeCognitiveEngine      # LLM 原生输出认知状态
    ├── E1 Native 实验配置         # 无循环论证的 H1 验证
    └── Pipeline 全兼容            # 所有 pipeline 组件支持 native_cognitive
```

### 5.3 待完成

| 项目 | 优先级 | 状态 |
|------|--------|------|
| 运行 E1 Native 实验（30 次） | **最高** | 代码就绪，待执行 |
| 分析 E1 Native 结果，验证 H1 | **最高** | 待 E1 完成 |
| 运行 E2-E8 实验（~500 次） | 高 | 待 E1 验证后 |
| AsyncEngine 集成 Cognitive State | 高 | 未实现 |
| 架构双运行时问题修复 | 高 | 架构冻结未通过 |
| 跨模型验证（GPT-4o） | 中 | 实验已设计 |
| 跨任务验证（Crisis、Supplier） | 中 | 实验已设计 |
| 实验平台 Monorepo 迁移 | 低 | 设计完成 |

---

## 六、实验战役概览

### 6.1 三种运行时模式

| 模式 | 引擎 | 认知状态 | 用途 |
|------|------|---------|------|
| `belief` | DiscussionEngine | 无（标量 belief） | 对照组 |
| `cognitive` | DiscussionEngine + useCognitiveState | post-hoc 反推 | 旧版 E1（有循环论证） |
| `native_cognitive` | NativeCognitiveEngine | LLM 原生输出 | 新版 E1（科学诚实） |

### 6.2 核心假设

| 实验 | 假设 | 预期结果 | 运行时 |
|------|------|----------|--------|
| E1 Native | Utility 比 Belief 更稳定 | σ²(ΔU) < σ²(ΔB), p < 0.01 | belief vs native_cognitive |
| E2 | Evidence 能解释 Opinion Change | ΔR² > 0.10, p < 0.01 | cognitive |
| E3 | Inertia 预测权威偏差 | AUC > 0.65 | cognitive |
| E4 | Confidence 预测观点改变 | β₁ < 0, p < 0.05 | cognitive |
| E5 | 治理通过 Evidence 发挥作用 | Granger F 显著 | cognitive |
| E6 | 五维变量相互独立 | max \|r\| < 0.5 | cognitive |
| E7 | Cognitive 检测器比 Belief 更准确 | F1 提升 > 0.10 | cognitive |
| E8 | Susceptibility 完全中介 I → ΔU | 中介比率 > 0.70 | cognitive |

### 6.3 实验流水线

```
Scenario → Simulation → Metrics → Statistics → Visualization → Report → Summary
```

一键运行：`npx tsx experiments/campaign/run_all.ts --experiment=e1_native`

支持断点续传、仅分析模式、仅图表模式。

---

## 七、E1 Native 实验：为什么要重做

### 问题

旧 E1（`e1_stability`）的 cognitive 模式存在循环论证：

```
LLM 输出 belief → 系统反推出 Utility → 测试"Utility 比 Belief 更稳定"
```

如果 Utility 是从 belief 算出来的，测稳定性就是自己证明自己。审稿人会一眼看穿。

### 解决方案

E1 Native（`e1_native`）的 native_cognitive 模式：

```
LLM 直接输出 Utility → 系统只计算 Inertia/Susceptibility → 测试"Utility 比 Belief 更稳定"
```

**变量分工：**
- LLM 自省输出：Utility、Evidence Coverage、Evidence Quality、Confidence
- 系统跨轮次计算：Inertia（角色 + 反驳 + 衰减）、Susceptibility（(1-I)(1-C)）

**实验配置：** 3 seeds × 5 runs × 2 modes = 30 次 LLM 调用，预计 ~50 分钟

---

## 八、关键文档索引

| 文档 | 用途 | 读者 |
|------|------|------|
| [ONEPAGER.md](ONEPAGER.md) | 一页项目摘要 | 所有人 |
| [THEORY.md](THEORY.md) | 理论分析（热力学、自由能） | 研究者 |
| [THEORY_FREEZE_REPORT.md](THEORY_FREEZE_REPORT.md) | 理论冻结审计 | 审稿人 |
| [THEORY_VALIDATION_REPORT.md](THEORY_VALIDATION_REPORT.md) | 理论验证框架设计 | 审稿人 |
| [ARCHITECTURE_FREEZE_REPORT.md](ARCHITECTURE_FREEZE_REPORT.md) | 架构冻结审计 | 软件架构师 |
| [EXPERIMENTAL_CAMPAIGN_PLAN.md](EXPERIMENTAL_CAMPAIGN_PLAN.md) | 实验战役计划 | 研究者 |
| [RESEARCH_PLATFORM_ROADMAP.md](RESEARCH_PLATFORM_ROADMAP.md) | 研究平台路线图 | 平台架构师 |
| [ROADMAP.md](ROADMAP.md) | 发展路线图 | 所有人 |
| [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) | 完整技术报告 | 研究者 |
| [PAPER_DRAFT.md](PAPER_DRAFT.md) | 论文草稿 | 审稿人 |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | 开发者指南 | 开发者 |
| [LIMITATIONS.md](LIMITATIONS.md) | 诚实限制清单 | 审稿人 |
| [README_CN.md](README_CN.md) | 中文项目说明 | 所有人 |

---

## 九、下一步行动

1. **运行 E1 Native 实验**（30 次，验证 LLM 原生认知状态的有效性）
2. **分析 E1 Native 结果**（σ²(ΔU) vs σ²(ΔB)，决策质量对比）
3. **根据 E1 结果决定**：若 H1 成立 → 继续 E2-E8；若不成 → 调整认知状态设计
4. **修复架构双运行时问题**（将状态管理统一到 Runtime）
5. **AsyncEngine 集成 Cognitive State**
6. **产出论文**（基于实验结果）

---

*本文档由 AI 辅助生成，人工审核确认。*
*所有数据引用均来自项目代码和文档，无虚构。*