# SwarmAlpha

> **多智能体认知治理研究平台——观测、偏差检测、干预、评估，作为 a2a 协议上层的独立治理层。**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-310-green)](./test/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[English](./README.md) | **中文**

---

## 1. SwarmAlpha 是什么？

SwarmAlpha 是一个**多智能体认知治理研究平台**。它不创建智能体，也不管理工作流，而是提供一个独立的治理层：观测 agent 讨论、检测集体认知失效、施加干预——全部以**零额外 LLM 调用**完成（数学处理一切，LLM 仅负责感知）。

**长期愿景**：成为 [a2a 协议](https://github.com/google/A2A) 上层的治理层，详见 [AGENT_SOCIETY_VISION.md](AGENT_SOCIETY_VISION.md)。

---

## 2. 核心发现：治理边界条件

修复 4 个认知缺陷（D1-D4）后，169 次闭环实验在 2 个任务上揭示：

| 条件 | 治理有效时 | 治理中性时 | 治理有害时 |
|---|---|---|---|
| **困难任务**（Crisis，基线 τ=0.41） | ✅ d=0.92，p=0.005，τ +51% | — | — |
| **简单任务**（Supplier，基线 τ=0.68） | — | ⚠️ d=0.47，p=0.089（功效不足，43%） | 天花板效应：shuffle d=0.09 |
| **结构干预**（shuffle 洗牌） | ✅ d=1.44（Crisis，p<0.001） | d=0.09（Supplier，简单任务） | — |
| **过程干预**（force_reflection） | ✅ 79.4% 有效（27/34 次干预） | — | ⚠️ 极化状态下反火（F 分解分析） |
| **干预次数** | — | — | r=−0.55（依赖链级联反火） |

**三条跨任务发现**（169 次实验，Crisis 80 + Supplier 89）：

1. **虚假共识**——共识-质量相关性 r≈−0.10，跨任务复制。"高共识"不等于"好决策"。
2. **结构 > 过程**——重新分配 agent 知识（shuffle d=1.44）优于讨论内治理干预（governance d=0.92）。
3. **任务难度是总开关**——治理有效性受任务难度约束（简单任务天花板效应，困难任务显著有效）。

> **历史说明**：120 次早期实验在断裂治理环路（D1-D4）下收集。之前的"治理无效"结论是环路断裂的假象。这些数据保留以备溯源，明确标注为临时性。上述 169 次闭环实验是主要证据。

---

## 3. 快速开始

### 安装与配置

```bash
git clone https://github.com/mulasakee17/meeting-room.git
cd meeting-room
npm install
cp .env.local.example .env.local
# 编辑 .env.local，添加至少一个 API key（推荐 DeepSeek，约 ¥0.07/次实验）
```

### 30 秒跑起来

```bash
npm run demo          # 纯本地治理引擎演示（无需 API key）
npm run dev           # Web UI http://localhost:3000（demo 模式可离线运行）
npm test              # 310 测试（307 通过，3 网络依赖跳过）
```

### 运行实验

```bash
npm run experiment    # 完整消融矩阵（需 API key）
npm run analyze       # 统计分析结果（无需 API key）
npx tsx experiments/v2/verify_audit.ts   # 第三方审计验证（无需 API key）
```

### 作为 SDK 使用

```typescript
import { GovernanceRuntime } from "@/runtime";

const runtime = new GovernanceRuntime({ maxRounds: 5, governanceMode: "full" });
const result = runtime.processRound(messages);
if (result.hasIntervention) {
  await applyInterventionToYourAgents(result.interventions[0]);
}
```

| 提供商 | 模型 | 成本/次 |
|--------|------|---------|
| DeepSeek（默认） | deepseek-chat | ~¥0.07 |
| 智谱 | glm-4-flash | ~¥0.07 |
| OpenAI | gpt-4o-mini | ~¥0.70 |
| 本地（Ollama） | llama3, mistral | 免费 |

---

## 4. 治理运行时——能力一览

| 能力 | 说明 | 状态 |
|---|---|---|
| **7 种偏差检测器** | 回声室、权威偏差、极化、过早共识 + 3 种 MAST 检测器（信息隐瞒、输入忽视、推理-行动不一致） | ✅ 内置；MAST 检测器尚未在实验中触发 |
| **4 种干预策略** | 降权、强制反思、引入多样性、继续讨论；按自由能分解 F=(1−R)+T·H 排序 | ✅ 内置；diversity 和 continue 已默认禁用（低有效性） |
| **4 种治理模式 + 5 种扩展消融** | none / detect-only / full / random-intervene + shuffle / full_diversity 等 | ✅ 内置 |
| **自适应阈值** | 从任务上下文自动标定检测阈值 | 🔧 已实现，尚未实验验证 |
| **自适应剂量** | 干预强度随偏差程度缩放 | 🔧 已实现，尚未实验验证 |
| **五维决策评估** | 共识、可靠性、离散度、稳定性、影响力分析 | ✅ 内置；权重为启发式 |
| **交叉质证引擎** | PRO/CON 阵营 → 对抗辩论 → 裁决综合 | ✅ 内置 + 单元测试 |
| **因果效应估计** | 最近邻轨迹匹配 + 置换检验 + Bootstrap CI | ✅ 内置 |
| **审计基础设施** | SHA-256 清单 + 第三方可验证治理 trace（detectionMetrics、effectMetrics、parameters） | ✅ 内置；1 个实验含完整审计字段 |
| **自定义检测器 API** | 注册新偏差检测器，无需修改核心引擎 | ✅ 内置 |
| **可扩展拓扑** | Flat → Grouped → Committee 讨论结构 | 🔧 GroupedTopology 已实现，尚未测试 |

---

## 5. 关键实验证据

**445 次对照实验**（manifest 实测 2026-07-23 校准），2 个任务，3 种条件，9 种治理配置。

### 双任务对比（主要证据）

| 指标 | Crisis（困难，n=24/组） | Supplier（简单，n=30/组） | 跨任务 |
|------|------------------------|--------------------------|--------|
| **none** τ | 0.408 ± 0.182 | 0.680 ± 0.186 | — |
| **full** τ | 0.617 ± 0.263 | 0.767 ± 0.183 | — |
| **shuffle** τ | 0.717 ± 0.243 | 0.697 ± 0.204 | 任务依赖 |
| **治理 Δτ** | **+0.209** | **+0.087** | ✅ 方向一致 |
| **治理 d** | 0.92（p=0.005） | 0.47（p=0.089） | ✅ 方向一致 |
| **功效** | 88% ✅ | 43% ⚠️ | Supplier 需 n=72 达 80% |
| **共识-质量 r** | −0.137 | −0.107 | ✅ 均 ≈ 0 |

**异步引擎**（热力学终止）：C 组 τ=0.64 vs B 组 τ=0.42，d=1.09，p=0.028。跨模型：智谱 C 组 τ=0.76（+18.8% vs DeepSeek）。

**结论**：治理在困难任务上提升决策质量（统计确认），在简单任务上方向一致但功效不足，存在明确边界条件——任务难度是总开关。结构重排（shuffle）可优于过程治理。干预次数与决策质量负相关（r=−0.55），提示依赖链反火风险。

> 完整实验数据、统计方法、分干预类型拆解见 [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md)。因果效应估计见 [experiments/v2/causalAnalysis.ts](experiments/v2/causalAnalysis.ts)。

---

## 6. 架构

```
┌──────────────────────────────────────────────┐
│   多智能体讨论（自建 / A2A*）                    │
│                                               │
│   智能体1   智能体2   智能体3   ...             │
│      │          │         │                    │
│      └──────────┴─────────┘                    │
│                 │                              │
│           讨论消息流                              │
│                 │                              │
├─────────────────┼────────────────────────────┤
│   SwarmAlpha 治理运行时                          │
│                                               │
│   ┌─────────────────────────────────────┐    │
│   │  观测 → 信念建模                      │    │
│   │     ↓                                │    │
│   │  偏差检测（7 种）                     │    │
│   │     ↓                                │    │
│   │  自由能干预排序                       │    │
│   │     ↓                                │    │
│   │  决策评估（5 维度）                   │    │
│   └─────────────────────────────────────┘    │
│                                               │
│  框架无关 · 可嵌入 · 可复现                     │
└──────────────────────────────────────────────┘
```

---

## 7. 项目结构与文档索引

```
src/
├── runtime/              # 可嵌入治理运行时（SDK）
├── lib/
│   ├── governance/       # 7 种偏差检测器 + 4 种干预策略
│   ├── evaluation/       # 五维评分引擎
│   ├── observation/      # LLM 输出解析
│   ├── inference/        # 信念演化计算
│   ├── discussion/       # 同步 + 异步多轮讨论引擎
│   ├── analysis/         # 因果效应估计（轨迹匹配）
│   ├── llm/              # 多提供商 LLM 抽象
│   └── utils/            # 共享工具（PRNG、JSON、统计）
experiments/v2/           # 445 次实验 + 分析脚本 + 审计工具
test/                     # 310 自动化测试
```

### 文档索引

**教授 / 评审者（5 分钟路径）**：

| 顺序 | 文档 | 内容 |
|------|------|------|
| 第一 | [ONEPAGER.md](ONEPAGER.md) | 3 分钟概览：定位、问题、关键发现 |
| 第二 | [LIMITATIONS.md](LIMITATIONS.md) | 25 节已知边界——学术诚实 |
| 第三 | [PAPER_DRAFT.md](PAPER_DRAFT.md) | 学术论文草稿，含 13 项正式发现 |
| 第四 | [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) | 完整研究报告：设计、D1-D4 批判、贝叶斯重分析 |

**开发者**：

| 文档 | 内容 |
|------|------|
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | 架构、API 合约、Bug 修复史、扩展指南 |
| [EXPERIMENT_DESIGN.md](EXPERIMENT_DESIGN.md) | 技术路线：发言意愿公式、DeGroot 更新、统计方法 |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | SDK 集成指南 |

**深度阅读**：

| 文档 | 内容 |
|------|------|
| [THEORY.md](THEORY.md) | 理论分析：R、T、H、F 推导，干预不动点分析 |
| [ROADMAP.md](ROADMAP.md) | 开发路线图、学术 outreach 计划、自评 |
| [AGENT_SOCIETY_VISION.md](AGENT_SOCIETY_VISION.md) | 长期愿景：agent 社会治理基座 |
| [PAPER_PROFESSOR_VERSION.md](PAPER_PROFESSOR_VERSION.md) | 教授专用论文版本 |

---

## 8. 已知局限与诚实声明

### 本项目不宣称

- **不是生产系统**——445 次实验，单组样本量仅 24-30。统计显著性 ≠ 实际可靠性。
- **不是多框架适配器**——所有实验均基于内置 `CustomAgent`。AutoGenAdapter 仅作演示。CrewAI/LangGraph 已从路线图移除。
- **不是安全工具**——检测认知偏差，不检测安全威胁。不阻止 agent 执行有害操作。
- **未经验证校准**——自适应阈值/剂量代码存在但零实验验证。评估权重为启发式。

### 核心局限（详见 [LIMITATIONS.md](LIMITATIONS.md) 全部 25 节）

| 局限 | 影响 | 缓解 |
|---|---|---|
| 单模型偏差（391/445 DeepSeek） | 发现可能不泛化 | 54 次跨模型（智谱/Qwen）方向一致 |
| 小样本（n=24-30/组） | 统计功效有限 | Supplier 任务 43% 功效；需 n=72 达 80% |
| 仅 2 个任务 | 任务多样性有限 | 第 3 个任务待实验室执行 |
| 120 次历史实验治理环路断裂 | 干扰早期结论 | 明确标注为临时性；169 次闭环实验为主要证据 |
| MAST 检测器（FM-2.4/2.5/2.6）从未在实验中触发 | 0 次实证验证 | 待 v2 trace 实验触发 |
| 仅 1 个实验含完整审计字段 | 审计样本不足 | 需 10+ 次新实验才有统计意义 |
| `full_reflection` p=0.048 结论已撤回 | 断裂环路下的假象 | Crisis 重验证：79.4% 有效（27/34），方向逆转 |

### 学术诚信

- 所有实验数据保留在 `experiments/v2/data*/`，可通过 SHA-256 清单（`audit_manifest.json`）验证
- 第三方审计：`npx tsx experiments/v2/verify_audit.ts` 验证文件完整性和检测逻辑一致性
- 所有统计方法使用确定性 PRNG 种子（PERMUTATION_SEED=42，BOOTSTRAP_SEED=42+0x5EED）保证可复现
- 本文档中所有统计数字均可追溯到原始数据或源代码，无任何虚构

---

## 9. 作者与许可

**作者**：贺孟元——独立架构、实现与实验设计。

**许可**：MIT——详见 [LICENSE](LICENSE)。

**技术栈**：TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek / 智谱 / Qwen API

---

## 附录：详细历史

以下章节保留以备溯源，首次阅读非必需。它们记录了项目的自我修正过程——这本身可能是最有价值的研究贡献。

<details>
<summary><b>点击展开：认知缺陷诊断与修复（D1-D4）</b></summary>

诊断发现多智能体讨论范式的四个根因认知缺陷：

| # | 认知缺陷 | 症状 | 修复 |
|---|---------|------|------|
| **D1** | 状态感知缺失 | `buildPrompt` 未注入 belief/confidence → 干预对 LLM 不可见 | Prompt 注入当前状态 |
| **D2** | 无对话历史 | Agent 看不到自己之前的发言 | 个性化记忆：自身历史 + @-提及 |
| **D3** | 同步轮流发言 | `Promise.all` → agent 看不到同轮其他人 | 顺序 `for` 循环 |
| **D4** | 虚构影响网络 | 边从数值差异推断 → 幻影影响图 | 边仅从显式 `referencedAgents` 构建 |

**影响**：120 次历史实验在四个缺陷均存在时收集。状态修改干预从未到达 agent 感知。之前的"治理无效"结论是环路断裂的假象。详见 [TECHNICAL_REPORT.md §2](TECHNICAL_REPORT.md)。

</details>

<details>
<summary><b>点击展开：硬伤修复（H 系列）</b></summary>

六项硬伤（H2、H4、H6、H17、H18、H19）已识别并修复。值得注意：H4 将 Kuramoto 相位映射从 θ=π·b 修正为 θ=(π/2)·b——这是实质性修复，改变了极化状态下的共识检测。完整表格见 [DEVELOPER_GUIDE.md §5.3](DEVELOPER_GUIDE.md#53-数学-bug)。

</details>

<details>
<summary><b>点击展开：历史 120 次实验摘要</b></summary>

这些实验在 D1-D4 治理环路修复前收集。仅作对照保留，非主要证据。

- **投资 3 轮**：治理 d=+0.65（p=0.152，不显著）
- **投资 5 轮**：治理 d=+0.00（p=1.0）——完全无效
- **并购 5 轮**：治理 d=+0.41（p=0.36）；**shuffle d=+1.80（p=0.0009）**
- **`full_reflection` 投资 5 轮**：p=0.048（未校正）——⚠️ 已撤回（断裂环路）

完整消融表格见 [TECHNICAL_REPORT.md §2.5](TECHNICAL_REPORT.md)。

</details>

<details>
<summary><b>点击展开：异步自适应讨论引擎</b></summary>

异步引擎（`AsyncDiscussionEngine`）引入三项创新：

1. **内容驱动发言**——五因子加权意愿分数（信息曝光 ×0.6、信念变化、共识偏离、依赖触发、刚发言惩罚 −0.5）
2. **热力学自适应终止**——系统达结晶态时终止（R>0.85, T<0.22, H<0.42，持续 3 次评估）
3. **被动聆听**——未发言 agent 通过 DeGroot 平均更新信念

**关键结果**：C 组（热力学终止）τ=0.64 vs B 组（固定轮次）τ=0.42，d=1.09，p=0.028。跨模型验证：智谱 C 组 τ=0.76（+18.8%）。完整演进过程（Phase 1-5）见 [EXPERIMENT_DESIGN.md](EXPERIMENT_DESIGN.md)。

</details>

<details>
<summary><b>点击展开：干预有效性与成本分析</b></summary>

基于 169 次闭环实验的干预效果分析：

**四类干预性价比**：

| 干预类型 | 有效率 | 平均 Δτ | 适用场景 |
|---------|--------|---------|---------|
| reduce_weight | 81.8% | +0.31 | 权威偏差 |
| force_reflection | 79.4% | +0.24 | 极化/过早共识 |
| introduce_diversity | 4.7% | −0.02 | 已默认禁用 |
| continue_discussion | 0% | 0.00 | 已默认禁用 |

**干预时机**：早期干预（第 1-2 轮）更有效；第 3 轮干预有效率为 0%，应避免。

**Token 成本**：每次干预追加约 68 tokens（reduce_weight）、142 tokens（force_reflection），占总成本 <1%。

</details>

<details>
<summary><b>点击展开：因果效应估计</b></summary>

最近邻轨迹匹配（k=5）+ 逆距离加权反事实 + 10000 次置换检验 + 10000 次 Bootstrap CI。基于历史 120 次实验数据：

| 组别 | n_trt | 效应 | 95% CI | d | p |
|------|-------|------|--------|---|---|
| 投资 3 轮 | 15 | +0.193 | [+0.01, +0.37] | 0.69 | 0.199 |
| 投资 5 轮 | 15 | −0.111 | [−0.27, +0.04] | −0.49 | 0.414 |
| 并购 5 轮 | 15 | +0.135 | [+0.07, +0.20] | 0.96 | 0.067 |

注意：数据早于 D1-D4 修复。详见 [src/lib/analysis/causalEffect.ts](src/lib/analysis/causalEffect.ts)。

</details>