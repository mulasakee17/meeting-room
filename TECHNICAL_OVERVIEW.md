# SwarmAlpha 技术架构深度剖析

> **更新日期**: 2026-07-03  |  **版本**: V3 Research Runtime

---

## 一、项目定位

SwarmAlpha 研究 LLM 多智能体如何形成高质量的集体决策——不是让 Agent 完成任务，而是确保 Agent **做出的决策经得起审视**。

核心洞察：LLM 多智能体系统会犯和人类群体相同的 4 种系统性决策错误（过早共识、权威偏差、回声室、群体极化），但目前没有任何框架检测或干预这些问题。SwarmAlpha 填补了这个空白。

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App Router                     │
│     POST /api/v3/execute  │  /task  │  /benchmark        │
├─────────────────────────────────────────────────────────┤
│              Pipeline (src/lib/pipeline.ts)              │
│       共享执行管线：Agent创建 → 讨论 → 评估 → 治理        │
├──────────┬──────────┬────────────┬──────────────────────┤
│ 讨论引擎  │ 评价引擎  │ 治理引擎    │ 观测 + 推理层         │
│ (多轮)   │ (7维)    │ (4偏差+干预) │ (LLM感知→数学演化)    │
├──────────┴──────────┴────────────┴──────────────────────┤
│          Agent 适配器 (Custom / AutoGen)                  │
├─────────────────────────────────────────────────────────┤
│      LLM Provider (DeepSeek / OpenAI / Anthropic)        │
└─────────────────────────────────────────────────────────┘
```

### 关键架构决策

**LLM-Perception / Math-Evolution 分离**：

- **观测层** (`observation/`) + **推理层** (`inference/`) 负责让 LLM 从自然语言中提取信念和情感——这是唯一需要 LLM 的地方
- **信念更新、影响力计算、偏差检测**全部使用数学方法（贝叶斯推断、Kuramoto 同步、信息熵）——快、便宜、可解释

这意味治理引擎可以作为**轻量级插件**嵌入任何多 Agent 框架，不需要额外 LLM 调用。

---

## 三、核心模块详解

### 3.1 讨论引擎 (`src/lib/discussion/`)

多轮 Agent 讨论的编排器。每次实验运行一个完整的 discuss → evaluate → govern → terminate 循环。

```
run()
 ├── initializeAgentStates()      快照初始状态
 ├── runMainLoop()                多轮循环
 │    ├── observeAgents()         LLM 并行调用
 │    ├── parseOpinion()          提取结构化观点
 │    ├── graphBuilder            构建影响图
 │    ├── computeCausalFactors()  因果分析
 │    ├── checkConvergence()      收敛判定
 │    ├── updateBeliefs()         信念演化
 │    └── applyGovernance()       治理介入
 └── buildDiscussionResult()      组装最终结果
```

**支持的策略**（全部可插拔）：

| 策略类型 | 默认实现 | 说明 |
|---------|---------|------|
| 信念更新 | RuleBasedBeliefUpdate | 高置信 Agent 权重更大 |
| 影响力 | RuleBasedInfluence | 4 种影响类型（一致/分歧/引用/说服） |
| 记忆 | InMemoryStrategy | 轮次历史、最近 N 条回溯 |

### 3.2 评价引擎 (`src/lib/evaluation/`)

7 维评分体系，超越简单的准确率：

| 维度 | 计算方式 | 权重 |
|------|---------|------|
| **共识度** | Kuramoto 序参数 + 信念标准差 + 一致率 + 收敛轨迹 | 15% |
| **可靠性** | 交叉验证 + Cronbach's α + 置信区间 + 可重复性 | 18% |
| **可解释性** | 推理长度 + 归因清晰度 + 步骤覆盖率 | 15% |
| **鲁棒性** | 输入噪声 + Agent 缺失 + 参数扰动测试 | 15% |
| **稳定性** | 轮次一致性 + 时间序列稳定性 | 12% |
| **抗操纵性** | 对抗测试 + 偏差检测分数 | 12% |
| **影响力分析** | Gini 系数 + 中心性 + 影响力路径 | 13% |

加权总分 → 等级：excellent (85+) / good (70+) / fair (55+) / poor (40+) / critical (<40)

### 3.3 治理引擎 (`src/lib/governance/`)

**4 种偏差检测**：

| 偏差 | 检测指标 | 默认阈值 |
|------|---------|---------|
| 回音室 | 信息冗余度 = (1-σ_norm)×0.5 + 内容相似度×0.5 | 0.70 |
| 权威偏差 | 影响力比率 = 最多发言 Agent 的发言占比 | 0.40 |
| 群体极化 | 极化指数 = 信念标准差 | 0.50 |
| 过早共识 | 轮次进度 < 阈值 && 共识水平 > 0.7 && σ < 0.15 | 0.50 |

**4 种干预策略**：

| 干预 | 触发条件 | 动作 |
|------|---------|------|
| reduce_weight | 权威偏差 | 削弱主导 Agent 的影响力权重 |
| introduce_diversity | 回音室 | 引入多样化信息源 |
| force_reflection | 极化 | 强制反思对立观点 |
| continue_discussion | 过早共识 | 追加讨论轮次 |

### 3.4 共享影响力计算 (`src/lib/discussion/influenceUtils.ts`)

消除 `discussion/influence.ts` 和 `inference/index.ts` 之间的重复，提供统一的：

| 函数 | 说明 |
|------|------|
| `determineInfluenceType()` | 根据信念差/引用/信心差判定影响力类型 |
| `computeInfluenceWeight()` | 4 种类型的一致权重公式 |
| `computeInfluenceImpact()` | 权重→信念和信心变化的映射 |

### 3.5 常量管理 (`src/lib/constants.ts`)

所有可调参数集中在一处，按模块分组：信念更新系数、影响力权重、治理阈值、评估权重、运行时参数。修改参数不再需要在多个文件中搜索替换。

### 3.6 集中管线 (`src/lib/pipeline.ts`)

消除 `execute/route.ts` 和 `task/route.ts` 之间的 ~120 行重复。两个路由现在都委托给 `runSwarmPipeline()`。

---

## 四、安全与限流

| 组件 | 文件 | 功能 |
|------|------|------|
| 速率限制 | `security/rateLimit.ts` | 6 种预设（strict/standard/relaxed/hourly/daily/experiment），基于 IP + User-Agent |
| 输入验证 | `security/validation.ts` | XSS、SQL 注入、命令注入、路径遍历模式检测 |
| 安全头 | `next.config.js` | CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy |

所有 API 路由均已接入限流和验证。

---

## 五、LLM 提供商适配

统一的多提供商接口 (`src/lib/llm/providers.ts`)：

| 提供商 | 模型列表 | 特性 |
|--------|---------|------|
| DeepSeek | deepseek-chat, deepseek-reasoner | 默认，支持 json_object |
| OpenAI | gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo | 支持 json_object |
| Anthropic | claude-3-haiku, claude-3-sonnet, claude-3-opus | Messages API |
| Local | llama3, mistral, qwen2 | Ollama 兼容 |

**响应解析器** (`parseLLMResponse`) 实现了 4 层容错：
1. 去除 markdown code fences
2. JSON 解析，支持 `emotion`/`belief` 字段互转
3. 正则提取残缺 JSON
4. 兜底：整个响应当 reasoning，emotion=0

**错误分类**：TIMEOUT / NETWORK / API_ERROR / PARSE_ERROR / AUTH_ERROR / RATE_LIMIT / INVALID_RESPONSE，每种标注 isRetryable。

---

## 六、前端

单页 React 组件 (`src/app/page.tsx`)，三种模式：

| 模式 | 数据来源 | 延迟 | 用途 |
|------|---------|------|------|
| **Demo** | `demo-data.ts` 预计算数据 | 0ms | 夏令营展示 / API 离线 |
| **Live** | `fetch(/api/v3/execute)` × 2 | 3-5s | 真实 DeepSeek 调用 |
| **Detail** | 同上 + 展开讨论轨迹 | — | 深入查看过程 |

**对比视图**：左侧单人 (1 Agent)，右侧 Swarm (5 Agent)，并排展示评分差异。

---

## 七、实验基础设施

### 7.1 Hidden Profile 实验

`experiments/lunar_survival/` 包含完整的实验框架：

- **3 个任务**：月球生存（经典）、企业并购（原创）、城市规划（原创）
- **4 组消融**：none / detect-only / random-intervene / full
- **10 次重复/组**，独立样本 t 检验 + Cohen's d
- **80 次实验已完成**，原始数据落盘

### 7.2 实验运行器

```
npx tsx experiments/lunar_survival/run.ts
```

自动完成：Agent 创建（独有信息注入）→ 多轮讨论 → 评估 → 治理 → 统计 → 保存 JSON。

---

## 八、数据流

一次完整的 API 调用 (`POST /api/v3/execute`)：

```
1. 限流检查 → 输入验证 → 清洗
2. Adapter.createAgents() → 5 个 Agent（含独有系统提示词）
3. Adapter.runInteraction()
   → DiscussionEngine.run()
     → Round 1: observeAgents (并行 LLM 调用) → parseOpinion → 更新图
     → Round 2: updateBeliefs → applyGovernance → 检测/干预
     → Round N: checkConvergence → break 或继续
4. EvaluationEngine.evaluate() → 7 维评分
5. GovernanceEngine.diagnose() → 偏差检测
6. 组装 PipelineOutput → NextResponse.json()
```

---

## 九、测试覆盖

| 测试文件 | 测试数 | 覆盖 |
|---------|--------|------|
| `test/evaluation.test.ts` | 12 | 7 维评价引擎 |
| `test/governance.test.ts` | 12 | 4 偏差检测 + 干预 |
| `test/benchmarks.test.ts` | 14 | 基准测试框架 |
| `test/discussion.test.ts` | 12 | 讨论引擎、信念、影响力 |
| `test/runtime.test.ts` | 3 | 观测→推理管线 |
| `test/llm-providers.test.ts` | 14 | LLM 调用、错误分类、超时 |
| `test/frontend.test.tsx` | 14 | 渲染、交互、API、Demo/Live |
| **合计** | **79** | |

---

## 十、可配置参数速查

| 参数 | 默认值 | 位置 |
|------|--------|------|
| 讨论轮数上限 | 5 | `DiscussionConfig.maxRounds` |
| 收敛阈值 | 0.06 | `DiscussionConfig.convergenceThreshold` |
| LLM 温度 | 0.2 | `LLMConfig.temperature` |
| LLM 超时 | 30s | `providers.ts` |
| 回音室阈值 | 0.70 | `constants.ts` |
| 权威偏差阈值 | 0.40 | `constants.ts` |
| 极化阈值 | 0.50 | `constants.ts` |
| 过早共识阈值 | 0.50 | `constants.ts` |
| 评估权重 | consensus:0.15, reliability:0.18, ... | `constants.ts` |
| 限流 (execute) | 10/min | `rateLimit.ts` |
| 限流 (task) | 10/min | `rateLimit.ts` |
| 限流 (benchmark) | 5/min | `rateLimit.ts` |

---

## 十一、技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | Next.js 14.2.5 (App Router) |
| 前端 | React 18.3.1 + Tailwind CSS 3.4 |
| 语言 | TypeScript 5.5 (strict mode) |
| 测试 | Vitest 4.1 + Testing Library |
| LLM | DeepSeek-V3 (主), OpenAI, Anthropic, Local |
| 数学 | Kuramoto 同步, 贝叶斯推断, 信息熵, KMeans |
| 安全 | 令牌桶限流, XSS/注入防护, CSP/HSTS |
| 包管理 | npm |

---

> **代码行数**: ~11,000 TypeScript  |  **测试**: 79  |  **实验**: 80 次  |  **文档**: 5 份核心
