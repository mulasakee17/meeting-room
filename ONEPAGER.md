# SwarmAlpha — One Pager

> **用对照实验界定 LLM 多智能体系统治理的边界条件。**
> 治理在何时有效、何时无效、何时有害——以统计严格性回答。

---

## 一句话

SwarmAlpha 是一个**框架无关的 LLM 多智能体治理运行时**，通过 376 次对照实验 + 置换检验 + 效应量，系统性回答"治理是否有用"及其边界条件。

---

## 核心结果

### 治理有效性（跨任务确认）

| | Crisis (n=24/cell) | Supplier (n=30/cell) |
|---|---|---|
| 无治理 τ | 0.408 | 0.680 |
| 完整治理 τ | **0.617** | **0.767** |
| Cohen's d | **+0.92** (p=0.005) | +0.47 (p=0.089) |
| 统计功效 | 88% ✅ | 43% ⚠️ |

**治理在两个独立任务上方向一致有效。** 洗牌对照（信息完全流通的理论天花板）在困难任务中 d=1.44，在容易任务中出现天花板效应——信息整合的边界收益受任务难度调节。

### 异步引擎 + 热力学终止（两轮标定）

| 指标 | 第一轮（旧阈值） | 第二轮（新阈值） |
|------|----------------|----------------|
| C 组硬截断率 | 40% → H_thermo 被证伪 | **10%** |
| C 组平均 τ | 0.34 | **0.46** (+35%) |
| C 组最高 τ | 0.6 | **0.8** |
| 平均发言数 | 28.2 | **22.4** (−20%) |

**热力学诊断逻辑正确，阈值需要任务难度感知。** 旧阈值针对低难度任务标定，v2 难度增强后 H/T 衰减变慢，旧阈值过于严格。5 参数重新标定（H 0.35→0.42, T 0.20→0.22, 连续次数 2→3 等）将硬截断率压到 10%。剩余 10% 是发言质量问题——发言意愿公式缺乏质量维度。

### 实验总览

| 实验线 | 实验次数 | 关键发现 |
|--------|---------|---------|
| 治理消融矩阵 | 165 | 治理干预类型差异化效果 |
| 跨任务验证（Crisis + Supplier） | 161 | 治理效果方向跨任务一致 |
| 异步引擎 ABCD + 阈值标定 | 50 (40+10) | 热力学终止可行，阈值需标定 |
| **总计** | **376** | — |

---

## 架构

```
你的多智能体框架 (AutoGen / CrewAI / LangGraph / 自建)
         │
         ▼ 讨论消息流
┌─────────────────────────────┐
│  SwarmAlpha 治理运行时        │
│                              │
│  观测 → 信念建模 → 4种偏差检测  │
│    → 自适应干预 → 5维决策评估  │
│                              │
│  框架无关 · 可嵌入 · 自适应    │
└─────────────────────────────┘
```

**四种治理模式**：`none`（基线）/ `detect-only`（霍桑效应）/ `full`（定向干预）/ `random-intervene`（消融：精准度是否必要）

**四种检测器**：回声室 / 权威偏差 / 群体极化 / 过早共识

**热力学隐喻**：Kuramoto 序参量 R → Shannon 熵 H → 归一化温度 T → 社会自由能 F = (1−R) + T·H。F 分解驱动干预优先级排序。

---

## 快速开始

```bash
git clone https://github.com/mulasakee17/meeting-room.git && cd meeting-room && npm install
cp .env.local.example .env.local  # 添加 DEEPSEEK_API_KEY
npm run dev                        # http://localhost:3000（演示模式无需 key）
npm run experiment                 # 完整消融矩阵（需 key，DeepSeek ≈ ¥0.07/次）
npm test                           # 229 个测试
```

**作为 SDK 嵌入**：

```typescript
import { GovernanceRuntime } from "@/runtime";
const runtime = new GovernanceRuntime({ maxRounds: 5, governanceMode: "full" });
const result = runtime.processRound(messages);
if (result.hasIntervention) applyIntervention(result.interventions[0]);
```

---

## 当前状态与下一步

| 已完成 | 进行中 / 待做 |
|--------|-------------|
| ✅ 治理有效性跨任务统计确认 | ⚡ 发言意愿公式增加 `quality_factor`（抑制噪音 agent） |
| ✅ 热力学终止阈值标定（硬截断 40%→10%） | ⚡ 阈值任务难度自适应（当前需手动标定） |
| ✅ callLLM 重试逻辑（3 次指数退避） | ⚡ 跨模型验证（当前仅 DeepSeek-V3） |
| ✅ 框架无关适配器接口 | ⚡ 被动倾听学习率敏感性分析 |
| ✅ 229 单元测试 + 32 热力学测试 | ⚡ n=10 扩样至 n=30 |

---

## 文档导航

- [**开发者指南**](./DEVELOPER_GUIDE.md) 🔴 — 架构、关键 bug 修复史、常见陷阱、工作流（新开发者必读）
- [完整中文文档](./README_CN.md) — 实验设计、治理运行时、SDK 使用
- [已知局限](./LIMITATIONS.md) — 22 个模块的已知边界和未解决问题
- [热力学集成](./THERMODYNAMICS_INTEGRATION.md) — F 分解驱动的干预优先级排序
- [C 组阈值尸检](./experiments/v2/analysis_c_group_thermo.md) — 4 例硬截断的逐轮 R/T/H 轨迹分析
