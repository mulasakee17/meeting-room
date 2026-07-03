# 🐜 SwarmAlpha V3

> LLM Multi-Agent 集体决策评估与治理研究平台
>
> **让 AI 群体讨论不仅有结论，还有质量保证。**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/tests-79%20passed-green)](./test/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## 这是什么？

SwarmAlpha 研究 LLM 多智能体如何做集体决策——不是如何完成任务，而是如何**高质量地**达成共识。

当 5 个 AI Agent 讨论一个问题时，它们会像人类一样犯错误：
- 有人太强势 → 其他人跟风
- 第一轮就一致 → 关键信息没讨论
- 观点相似的互相确认 → 越聊越偏
- 分歧太大 → 无法达成共识

**SwarmAlpha 的治理引擎实时检测这些问题，并主动干预——就像人类团队中的主持人。**

---

## 快速开始

```bash
# 1. 安装
git clone git@github.com:mulasakee17/meeting-room.git
cd meeting-room
npm install

# 2. 配置 API Key (可选 — Demo 模式不需要)
cp .env.local.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY

# 3. 启动
npm run dev
# 打开 http://localhost:3000
```

**Demo 模式**：不需要 API Key，打开页面直接点"运行对比实验"即可看到效果。

---

## 架构

```
┌─────────────────────────────────────────────────┐
│               Next.js App Router                  │
│      POST /api/v3/execute | task | benchmark      │
├─────────────────────────────────────────────────┤
│            Pipeline (共享执行管线)                │
├────────┬──────────┬───────────┬─────────────────┤
│ 讨论引擎 │ 评价引擎  │ 治理引擎   │ 观测+推理层      │
│ (多轮)  │ (7维评分) │ (4偏差检测) │ (LLM感知→数学演化) │
├────────┴──────────┴───────────┴─────────────────┤
│   Agent 适配器 ← DeepSeek / OpenAI / Anthropic   │
└─────────────────────────────────────────────────┘
```

**核心理念**: LLM 只做感知（提取信念/情感），数学负责演化（共识计算、偏差检测）。快、便宜、可解释。

---

## 实验结果

80 次对照实验，消融分析 + t 检验 + Cohen's d。

详见 [`experiments/lunar_survival/REPORT.md`](experiments/lunar_survival/REPORT.md)

关键发现：
- **随机干预显著降低准确率** (d=-1.41, p<.005) — 精准检测是前提
- **过早共识是主要失效模式** (83-93%)
- **治理在信息不对称时有效，信息充足时静默**

---

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 前端（对比模式 + Demo/Live）
│   └── api/v3/               # API 端点
├── lib/
│   ├── discussion/           # 讨论引擎（多轮 Agent 交互）
│   ├── evaluation/           # 评价引擎（7 维评分）
│   ├── governance/           # 治理引擎（4 偏差检测 + 干预）
│   ├── inference/            # 推理层（信念推断）
│   ├── observation/          # 观测层（LLM 输出解析）
│   ├── runtime/              # 运行时（调度、上下文、终止）
│   ├── adapters/             # Agent 框架适配器
│   ├── llm/                  # 多 LLM 提供商抽象
│   ├── security/             # 输入验证 + 速率限制
│   ├── benchmarks/           # 基准测试
│   ├── pipeline.ts           # 共享执行管线
│   ├── constants.ts          # 集中管理参数
│   └── demo-data.ts          # Demo 模式预计算数据
experiments/
└── lunar_survival/           # Hidden Profile 实验
    ├── REPORT.md             # 完整实验报告
    ├── run.ts                # 实验运行器
    └── data/raw/             # 80 个 JSON 数据文件
```

---

## 运行测试

```bash
npx vitest run          # 79 tests, 7 files
npx vitest              # watch mode
```

---

## 文档

| 文档 | 内容 |
|------|------|
| [ONEPAGER.md](ONEPAGER.md) | 一页项目摘要（导师/评委用） |
| [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) | 技术架构深度剖析 |
| [API_CONTRACT.md](API_CONTRACT.md) | V3 API 规范 |
| [experiments/lunar_survival/REPORT.md](experiments/lunar_survival/REPORT.md) | 消融实验完整报告 |

---

## 技术栈

TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek API

---

## 作者

**贺孟元** — 高一学生，独立完成架构、实现、实验。

AI 辅助开发（Claude Code），架构决策和实验设计完全自主。

---

> *"不是让 AI 做决定，而是确保 AI 做的决定经得起审视。"*
