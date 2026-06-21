# 🐜 SwarmAlpha

> 一个高一学生用两个月 Vibe Coding 打造的金融多智能体共识推演系统
>
> *Built by a 15-year-old in 2 months of AI-assisted coding*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8)](https://tailwindcss.com/)
[![Lines of Code](https://img.shields.io/badge/Code-14,000_lines-orange)]()
[![Accuracy](https://img.shields.io/badge/回测v4.1-64%25混合_14事件-brightgreen)]()
[![Status](https://img.shields.io/badge/Status-实验项目-blue)]()

---

## 🧑‍💻 谁在做这个？

我是一个**高一学生**。两个月前，我第一次打开 Cursor，写下了第一行 AI 辅助的代码。

在此之前，我没有系统学过编程。没有 CS 学位，没有金融背景，没有导师。

我有的只是：
- 对金融市场的强烈好奇心（索罗斯的《金融炼金术》读了三遍）
- 一个想法：**如果让 AI Agent 模拟市场中不同参与者的博弈，能不能推演出市场情绪的走向？**
- 以及 2026 年的 AI 工具——它让一个 15 岁的孩子可以建造过去需要整个量化团队才能建造的东西

两个月后，SwarmAlpha 诞生了。

---

## 🎯 这是什么？

输入一条金融新闻，**5 个拥有不同投资人格的 AI Agent** 进行多轮博弈——多头、空头、价值投资者、技术分析师、宏观策略师——各自发表观点、相互影响、逐步收敛。

这仍然是一个**实验项目**。v4.0 的严格回测曾揭示三个系统均低于随机——经过根因分析和参数修复，v4.1 混合预测在 14 个多样化事件上达到 **64.3%** 方向准确率（vs 随机 33%，+31pp）。**但 14 个事件的样本量仍不足以做统计推断**，且系统在 up 事件上可靠（100%）但在 down 事件上不可靠（20%）——这是需要解决的核心矛盾。详见[严格回测报告](test/STRICT_BACKTEST_RESULTS.md)。

```
输入："2020年3月，新冠疫情全球爆发，美股四次熔断..."

  🐂 Bull: "恐慌过度了，美联储已经出手"      情绪: -30
  🐻 Bear: "这才是开始，全球经济会崩溃"       情绪: -85
  ⚖️ Neutral: "估值已经回到合理区间"          情绪: -40
  📊 Tech: "RSI 8.0 极度超卖，反弹在即"       情绪: -55
  🌍 Macro: "无限QE将提供流动性支撑"           情绪: -20

  ↓ 3轮博弈后...

  LLM 共识: -56 (强烈看空)  ← 事后看错了，实际是 V 型反弹
  🎯 混合预测: +42 (看多)   ← v4.1 修复后，这类 V 型反弹的识别率大幅提升
```

**灵感来源：索罗斯的反思性理论（Reflexivity）**——市场参与者的认知会反过来影响市场本身。这个项目试图用 AI Agent 来模拟这个反馈循环。

---

## ✨ 为什么这件事值得关注？

### 1. AI-Native 开发者的崛起

我不需要理解 Transformer 的数学原理就能搭建一个使用 5 个 LLM Agent 的系统。我不需要学量化金融就能实现 LSTM 价格预测。AI 工具抹平了知识和执行之间的鸿沟。

**两个月、一个人、14000 行代码**。这在两年前是不可能的。

### 2. 诚实的实验精神

市面上大多数 AI 金融工具会夸大准确率。SwarmAlpha 的不同在于：

| 常见做法 | SwarmAlpha |
|---------|-----------|
| 用信息泄漏制造虚高数字 | 严格回测，剥离一切事后信息 |
| 隐藏失败案例 | 公开三个系统全部结果（0%、0%、25%） |
| 声称"AI 预测市场" | 坦诚"不如抛硬币，这是学习项目" |
| 准确率数字是营销 | 准确率数字是工程反馈 |

在严格回测中，混合预测准确率 25%（随机 33%）。旧版曾报告"76.5%"，经自查发现来自信息泄漏，已在 v4.0 中剥离并公开纠正。这个诚实的过程比虚高的数字更有价值。

### 3. 从"玩具"到"工具"的路径清晰

- **v0.1**: 5 Agent 博弈 Demo
- **v2.0**: 技术指标 + ML 预测（模拟）集成
- **v3.0**: 事件分类器 + 混合预测引擎
- **v4.0**: 剥离信息泄漏，严格回测 → 发现准确率 < 随机
- **v4.1**: 根因分析 + 参数修复 → 64.3%（14 事件），但 down 事件准确率仅 20%
- **下一个**: 修复 L 型下跌检测 → 真实 LLM 回测 → 更大样本验证

---

## 🏗️ 系统架构

```
用户输入新闻
    │
    ├──→ LLM Swarm 推演 (5 Agent × N轮博弈)
    │    ├── Bull (多头)  Bear (空头)  Neutral (价值)
    │    ├── Tech (技术)  Macro (宏观)
    │    └── 输出: 共识情绪值 + 每轮推理
    │
    ├──→ 新闻特征推断 (NLP关键词 → VIX/RSI/波动率/事件类型)
    │
    ├──→ 事件分类器 (V_REBOUND / L_DECLINE / W_RECOVERY / U_SLOW)
    │    ├── 8维评分: 政策响应/超卖深度/结构损伤/流动性/杠杆/...
    │    └── 输出: 反弹模式 + 路由建议
    │
    ├──→ 校准系统 (技术指标 + 8历史事件匹配)
    │
    └──→ 混合预测引擎 (分类器覆盖策略)
         ├── V型 → 信任校准系统 (历史V型反弹经验)
         ├── L型 → 信任LLM推演 (结构性危机识别)
         └── 输出: 最终预测 + 方向 + 置信度 + 风险因素
```

---

## 📊 回测验证

### v4.1 严格回测（无信息泄漏）

基于 **14 个全新多样化历史事件**（8 up + 5 down + 1 neutral），仅用事发当天已知信息：

| 系统 | 方向准确率 | vs 随机(33%) |
|------|-----------|-------------|
| 纯 LLM 推演(模拟) | **35.7%** (5/14) | +3pp |
| 纯校准系统 | **42.9%** (6/14) | +10pp |
| **混合预测** | **64.3%** (9/14) | **+31pp** |

按实际走势分解：

| 实际走势 | 事件数 | 混合预测准确率 |
|---------|--------|--------------|
| 📈 up (V型反弹) | 8 | **100%** (8/8) |
| 📉 down (继续下跌) | 5 | **20%** (1/5) |
| ➡️ neutral (横盘) | 1 | **100%** (1/1) |

> ⚠️ 核心矛盾：系统在 V 型反弹上出色，但在真正下跌时严重不可靠（0%→20%）。需要更强的结构损伤检测来区分 V 型 vs L 型。

### v4.0 → v4.1 修复历程

| 修复 | v4.0 (8事件) | v4.1 (14事件) | 根因 |
|------|-------------|--------------|------|
| 模拟 LLM 永远看空 | 0% | 35.7% | 起点 -40，无视超卖信号 |
| 校准跌幅惩罚过重 | 0% | 42.9% | `drop×3` 压制 RSI 奖励 |
| 分类器覆盖力度不足 | 25% | **64.3%** | 权重太低，安全机制缺失 |

### 宽松回测（17 事件，含信息泄漏）

| 系统 | 方向准确率 | vs 随机(33%) |
|------|-----------|-------------|
| 最佳版本 (Phase 3) | 35.3% | +2.3pp |

> 旧版"76.5%"的数字来自信息泄漏——分类器特征和"正确答案"共享了同一个事后数据库。

完整报告：[test/STRICT_BACKTEST_RESULTS.md](test/STRICT_BACKTEST_RESULTS.md)

---

## 🚀 快速开始

### 1. 安装

```bash
npm install
```

### 2. 配置 API Key

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入 DeepSeek API Key（推荐，便宜且中文好）
```

### 3. 启动

```bash
npm run dev
# 打开 http://localhost:3000
```

### 4. API 调用

```bash
curl -X POST http://localhost:3000/api/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "news": "美联储宣布紧急降息50个基点，超出市场预期",
    "rounds": 3,
    "llmConfig": {"provider": "deepseek", "model": "deepseek-chat"}
  }'
```

响应包含 `hybrid` 字段——事件分类 + 混合预测结果。

---

## 🛠️ 技术栈

| 层级 | 技术 | 为什么选它 |
|------|------|-----------|
| 框架 | Next.js 14 | API Routes + 前端一体化 |
| 语言 | TypeScript | AI 辅助下也能写类型安全的代码 |
| 样式 | Tailwind CSS | 用自然语言描述样式 → AI 生成 |
| 图表 | Chart.js | 轻量级可视化 |
| LLM | DeepSeek / OpenAI / Anthropic / Ollama | 可插拔，成本可控 |
| ML | LSTM + Transformer (⚠️ 随机权重模拟，非训练模型) | 架构占位，待替换为真实模型 |

---

## 📁 项目结构

```
swarmalpha/
├── src/
│   ├── app/api/swarm/          # API 路由 (混合预测集成) + SSE 流式
│   ├── lib/
│   │   ├── agents/             # 5 Agent 人格 + 博弈引擎 + 深度提示词工程
│   │   ├── calibration/        # 核心: 事件分类器 + 混合预测 (含旧版实验模块)
│   │   ├── llm/                # 可插拔多供应商架构 (OpenAI/Anthropic/DeepSeek/Ollama)
│   │   ├── ml/                 # ⚠️ 模拟 LSTM + Transformer (随机权重，占位)
│   │   ├── indicators/         # 完整技术指标计算 (MA/MACD/RSI/布林带/KDJ)
│   │   ├── security/           # 速率限制 + XSS/SQL注入防护 + 输入验证
│   │   └── utils/              # 情绪计算、存储、日志、重试/熔断器
│   └── components/             # 11 个 React UI 组件
├── test/                       # 严格回测 + 历史回测 + 综合测试
├── _experimental/              # 实验模块 (空)
└── SPEC.md                     # 原始设计文档
```

---

## 🔮 下一步

### 短期（工程修复 + down 事件能力）
- [ ] 删除 7 个旧版校准文件（~4,200 行死代码），精简项目
- [ ] 统一三个 Agent 引擎，消除 80% 重复代码
- [ ] 🔴 修复 L 型下跌检测：引入杠杆强制平仓、信贷利差、市场结构数据
- [ ] 用真实 DeepSeek API 替换模拟 LLM，重新跑严格回测（预期 up 事件略降，down 事件提升）

### 中期（准确率突破）
- [ ] 集成 Yahoo Finance API 获取真实价格数据
- [ ] 从 14 → 50+ 历史事件扩展严格回测数据库（每方向至少 20 个）
- [ ] 引入更多逆向指标（Put/Call ratio, VIX term structure, market breadth）
- [ ] 替换模拟 LSTM/Transformer 为真实 PyTorch/TensorFlow 模型

### 长期（产品化）
- [ ] 前端 UI 专业级重设计
- [ ] Docker 一键部署
- [ ] 30+ Agent 散户群体模拟
- [ ] 交易信号回测：基于修正架构的策略夏普比率

---

## 🤝 关于作者

我是一个高一学生，这是我的第一个项目。

如果你觉得这个项目有趣，或者想给一个 15 岁的建造者一些建议，欢迎开 Issue、提 PR、或者直接联系我。

**Vibe Coding 让我相信：好的想法 + AI 工具 = 任何人都可以建造有意义的东西。**

---

## 📄 License

MIT License — 详见 [LICENSE](./LICENSE)

---

*"在别人贪婪时恐惧，在别人恐惧时贪婪。" — 巴菲特*
*"但前提是你要知道现在是贪婪还是恐惧。" — SwarmAlpha*
