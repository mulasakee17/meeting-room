# 🐜 SwarmAlpha 开发者指南

> **本文是项目开发者的必读文档。** 涵盖架构理解、关键 bug 修复史、常见陷阱、实验基础设施和开发工作流。读完本文你就能独立修改和扩展这个项目。

---

## 1. 项目身份

**SwarmAlpha 是一个可嵌入的多智能体治理运行时——不是多智能体框架。**

| SwarmAlpha **是** | SwarmAlpha **不是** |
|---|---|
| 观察 agent 讨论、检测集体决策失败的中间层 | 创建 agent 的框架（不是 AutoGen/CrewAI 的替代品） |
| 框架无关的插件（通过适配器接入任何框架） | 工作流管理器 |
| 研究平台（运行对照实验、产出统计证据） | 对话生成器 |

**一句话**：SwarmAlpha 之于多智能体系统，如同 `eslint` 之于 JavaScript——它不写代码，它检查代码写得好不好。

---

## 2. 架构全景图

```
你的多智能体框架 (AutoGen / CrewAI / LangGraph / 自建)
         │  DiscussionMessage 流
         ▼
┌─────────────────────────────────────────────┐
│         SwarmAlpha 治理运行时                 │
│                                              │
│  观测层 (Observation)                         │
│    ↓ LLM 输出 → 结构化 AgentOpinion           │
│  推理层 (Inference)                           │
│    ↓ 三力信念演化（同伴拉力 + 多数效应 + 影响力扩散）│
│  治理引擎 (Governance)                        │
│    ↓ 4 种偏差检测 + 4 种干预策略               │
│  评估引擎 (Evaluation)                        │
│    ↓ 5 维评分 (共识/可靠性/离散度/稳定性/影响力)  │
│                                              │
│  + 热力学模块 (Thermodynamics)                 │
│    ↓ R/T/H/F 状态诊断 + 异步终止决策           │
│  + 讨论引擎 (Discussion)                      │
│    ↓ 同步/异步多轮讨论编排                     │
│  + 因果分析 (Analysis)                        │
│    ↓ 轨迹匹配 + 置换检验                       │
└─────────────────────────────────────────────┘
```

### 2.1 核心模块速查

| 模块 | 路径 | 一句话 |
|------|------|--------|
| **治理运行时 SDK** | `src/runtime/` | 可嵌入的公共 API，零框架依赖 |
| **治理引擎** | `src/lib/governance/` | 偏差检测 + 干预策略 + F 分解排序 |
| **讨论引擎** | `src/lib/discussion/` | 同步/异步多轮讨论 + 拓扑层 |
| **热力学** | `src/lib/thermodynamics/` | 社会自由能诊断 + 结晶检测 + 终止决策 |
| **评估引擎** | `src/lib/evaluation/` | 五维决策质量评分 |
| **观测层** | `src/lib/observation/` | LLM 输出 → 结构化信念/置信度/推理 |
| **推理层** | `src/lib/inference/` | 规则化信念更新（非 LLM 调用） |
| **LLM 抽象** | `src/lib/llm/` | 多提供商统一接口（DeepSeek/OpenAI/Anthropic） |
| **因果分析** | `src/lib/analysis/` | 最近邻轨迹匹配 + 反事实估计 |
| **共享工具** | `src/lib/utils/` | 统计、JSON 解析、注册表、干预 prompt |
| **安全** | `src/lib/security/` | 速率限制 + 输入验证 |

### 2.2 两条流水线

**流水线 A：治理运行时（同步讨论）**
```
Agent 发言 → observation 提取信念 → inference 更新信念
  → governance 检测偏差 → 干预注入 → evaluation 评分
  → 下一轮（最多 maxRounds 轮）
```

**流水线 B：异步引擎（content_driven 发言）**
```
Agent 发言 → 被动倾听（其他 agent 更新信念）
  → 发言意愿计算（infoExposure + beliefShift + consensusDeviation）
  → 意愿最高者发言 → thermodynamics 评估 R/T/H/F
  → TerminationDecider 判断是否终止
  → 循环直到 crystallized / strong_crystallized / hard_cap
```

---

## 3. 核心概念

### 3.1 信念 (belief)

每个 agent 对当前讨论议题持有一个 **belief ∈ [-1, 1]**：
- `-1`：强烈反对（如"方案 A 是最差选择"）
- `0`：中立
- `+1`：强烈支持

信念**不是** LLM 自由生成的——它通过观测层从 agent 的结构化输出中提取。如果 agent 未输出 `[GOV]` 标签，`StateInferenceBridge` 会用 LLM 推断（fallback，有成本）。

### 3.2 Kendall's τ（核心指标）

衡量 agent 的**方案排名**与**真实排名**之间的相关性。τ=1.0 表示完美排序，τ=0 表示随机。

```typescript
// 关键：τ 比较的是排名序列，不是信念值
// ground truth 排名：方案 A > B > C > D > E
// agent 输出排名：方案 A > C > B > E > D
// → τ ≈ 0.6（4 对中对了 3 对，错了 1 对）
```

**τ 为什么比准确率好**：二元准确率忽略了排序信息的丰富性。τ=0.6 意味着 agent 排名和真实排名有明确的相关性，即使没有精确选出"最佳"。

### 3.3 Kuramoto 序参量 R（共识度量）

将每个 agent 的 belief 映射到单位圆上的相位角：

```
θ = belief × π/2    // belief ∈ [-1,1] → θ ∈ [-π/2, π/2]
R = |Σ e^(iθ_j)| / N  // N 个相位向量的平均长度
```

- R→1：所有 belief 一致（完美的共识）
- R→0：belief 完全分散（包含随机和强极化）

**关键直觉**：极端极化（b=+1 和 b=−1）对应相位 +π/2 和 −π/2——在单位圆上正对，向量和接近 0，R≈0。这是正确的——**极化 ≠ 共识**。

> ⚠️ 这是 H4 修复的核心：旧映射 θ=b·π 会将 b=+0.99 和 b=−0.99 都放在单位圆同一侧（接近 (−1,0)），导致 R≈1 把极化误判为共识。

### 3.4 社会热力学变量

| 变量 | 含义 | 计算 | 低值含义 | 高值含义 |
|------|------|------|---------|---------|
| **R** | Kuramoto 序参量 | 见上 | 信念分散 | 信念同步 |
| **T** | 归一化温度 | std(beliefs) / ((max−min)/2) | 噪声小，agent 信念接近 | 噪声大，agent 信念分散 |
| **H** | Shannon 熵 | −Σ p·log₂(p), 5 bins, 除以 log₂(5) | 信念集中在少数 bin | 信念均匀分布在 5 个 bin |
| **F** | 社会自由能 | (1−R) + T·H | 系统有序 | 系统无序 |

**F 分解的直觉**：
- **(1−R)** = 结构性无序（"势能"）——agent 信念方向不一致带来的无序
- **T·H** = 热性无序（"耗散"）——agent 信念波动带来的无序

这两个是**正交的无序来源**。F 分解让干预可以针对性地降低正确的无序分量。

### 3.5 结晶态（异步引擎的终止信号）

异步引擎不按固定轮次终止。它检测系统是否进入"结晶态"：

| 状态 | 条件 | 含义 |
|------|------|------|
| **strong_crystallized** | T < 0.10 且 H < 0.20 | 不可逆收敛——agent 信念完全冻结，立即终止 |
| **crystallized** | R > 0.85 且 T < 0.22 且 H < 0.42，连续 3 次 eval | 系统已冻结，终止 |
| **quenched** | R 高 + T 骤降（>0.05）但 H 不低 | 伪结晶——agent 被强制同步但内心仍分散 |
| **hard_cap** | 发言数 ≥ 40 | 强制终止（讨论失败） |

**阈值标定史**（见 §5）：

| 参数 | 旧值 | 新值 |
|------|------|------|
| crystallH | 0.35 | **0.42** |
| crystallT | 0.20 | **0.22** |
| consecutiveCrystallRequired | 2 | **3** |
| strongCrystallH | 0.10 | **0.20** |
| evalEveryKUtterances | 3 | **2** |

### 3.6 内容驱动发言意愿（content_driven speak mode）

异步引擎中，每个 agent 的发言意愿由 5 个因子加权：

```
raw = infoExposure × 0.6           // agent 知道了多少新信息
    + beliefShift_bonus             // 信念变化了多少（被说服的信号）
    + consensusDeviation_bonus      // agent 离群多远（少数派需要发言）
    + dependencyTriggered × 0.3     // 其他人引用了这个 agent 的专业领域
    + recentlySpoke × (−0.5)        // 惩罚刚发过言的 agent

willingness = (tanh(raw) + 1) / 2   // 归一化到 [0, 1]
```

> ⚠️ **beliefShift 曾长期为零**（见 §5.2），导致这个最重要的信号完全失效。

### 3.7 四种治理偏差

| 偏差 | 检测指标 | 默认阈值 | 干预 |
|------|---------|---------|------|
| 回声室 | 信息冗余度 ρ = (1−σ)×0.5 + Jaccard×0.5 | 0.70 | introduce_diversity |
| 权威偏差 | 主导 agent 发言占比 | 0.40 | reduce_weight |
| 群体极化 | 信念标准差 | 0.50 | force_reflection |
| 过早共识 | 轮次进度 < 0.35 且共识 > 0.55 且 σ < 0.20 | 0.35 | continue_discussion（已禁用） |

---

## 4. 实验基础设施

### 4.1 两个实验运行器

| 脚本 | 用途 | 命令示例 |
|------|------|---------|
| `experiments/v2/run.ts` | 同步治理消融实验（核心线） | `npx tsx experiments/v2/run.ts` |
| `experiments/v2/run_async_ab.ts` | 异步引擎 ABCD 实验 | `npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --speakMode=content_driven` |

### 4.2 分析工具

| 脚本 | 功能 |
|------|------|
| `analyze.ts` | 同步实验统计（d, p, CI） |
| `analyze_async.ts` | 异步实验统计 + thermoHistory 分析 |
| `verifyFindings.ts` | 独立验证关键发现（如虚假共识 r≈0） |
| `causalAnalysis.ts` | 轨迹匹配因果效应估计 |
| `mechanismAnalysis.ts` | 干预类型拆解 |
| `interventionAnalysis.ts` | 单次干预有效性分析 |
| `bayesianAnalysis.ts` | 贝叶斯参数估计 |
| `powerAnalysis.ts` | 统计功效分析 |

### 4.3 任务定义

| 任务文件 | 场景 | 难度 | 特征 |
|---------|------|------|------|
| `task_crisis.ts` | 公共卫生危机响应（5 方案） | 困难 | 隐藏信息需跨角色交叉验证 |
| `task_supplier.ts` | 核心零部件供应商选择（5 供应商） | 简单 | 信息较透明 |
| `task_fraud.ts` | 金融欺诈调查（5 条线索） | 困难(v2) | 干扰项、信息盲区、对抗性偏见 |
| `task_invest.ts` | 投资决策 | 中 | 2×2 因子设计（3 轮 vs 5 轮） |
| `task_er_triage.ts` | 急诊分诊 | 中 | 医疗场景 |
| `auditTask.ts` | 审计任务 | 中 | 财务场景 |

### 4.4 实验数据位置

```
experiments/v2/
├── data/              # M&A 任务数据
├── data_invest/       # 投资任务数据
├── data_invest_3round/# 投资 3 轮数据
├── data_crisis/       # Crisis 任务数据
├── data_supplier/     # Supplier 任务数据
├── data_fraud/        # 欺诈调查任务数据（异步引擎 ABCD 4 组）
├── data_fraud_old_thresholds/          # 旧阈值 C 组备份
└── data_fraud_pre_beliefshift_fix/     # beliefShift 修复前 C 组备份
```

### 4.5 实验设计的关键注意事项

1. **被试间设计**：每组实验使用独立的新 agent 实例，不存在跨组污染
2. **洗牌对照**：将每个 agent 的独有知识旋转一个随机偏移（打破角色-信息一致性），测量信息整合的理论上限
3. **种子可复现**：所有随机性使用 mulberry32(seed)，不用 Math.random()
4. **callLLM 重试**：3 次指数退避重试（针对 API 瞬时故障），重试逻辑在 `src/lib/utils/retry.ts`

---

## 5. 关键 Bug 修复史

> **这是整个项目中最硬的知识。** 每个 bug 都曾经让实验结论偏了好几轮。理解它们可以避免重蹈覆辙。

### 5.1 统计方法修复

| Bug | 位置 | 旧代码 | 正确代码 | 影响 |
|-----|------|--------|---------|------|
| **Kendall's τ 平局修正公式错误** | `run_async_ab.ts` | `t*(t+1)/2`（t=平局对数） | `count*(count-1)/2`（count=平局组大小） | 平局修正量被高估，τ 被低估 |
| **Cohen's d 未使用 pooled SD** | `analyze_async.ts` | `sqrt((va+vb)/2)` | `sqrt(((n1-1)*va+(n2-1)*vb)/(n1+n2-2))` | 小样本下方差不均时 d 偏大 |
| **置换检验不可复现** | `analyze_async.ts` | `Math.random()` | `mulberry32(42)` | 每次运行 p 值不同 |
| **permutationTest 缺连续性校正** | `statsShared.ts` | `count/nPerm` | `(count+1)/(nPerm+1)` | 小样本下 p=0 假阳性 |

### 5.2 异步引擎 Bug

| Bug | 位置 | 问题 | 修复 | 影响 |
|-----|------|------|------|------|
| **beliefShift 始终为零** 🔥 | `asyncEngine.ts:310` | `prevCycleBeliefs` 在 belief 更新**后**从 `agentStates` 保存，导致下轮 `\|state.belief - prevBelief\| = 0` | 在 belief 更新**前**（line 275）用 `prevStates` 保存 | 发言意愿公式的 beliefShift 信号在所有 50 次异步实验中从未生效 |
| **consensusLevel = 1−2×std** | `run.ts` | 用线性公式近似共识 | 替换为真实 Kuramoto R | 虚假共识验证结果不受影响（r 仍 ≈ 0） |
| **JSON 模板英文→中文** | `run.ts` | system prompt 用 "CompanyX (行业A)" 示例 | 改为 "方案A-全城封锁" | 中文任务用英文示例，概念对齐失败 |
| **洗牌 rotation 固定 +2** | `run.ts` | 所有 run 用相同 rotation | `mulberry32(42 + runIndex)` 随机化 | 旧数据无法复现，仅影响未来实验 |

### 5.3 数学 Bug

| Bug | 位置 | 问题 | 修复 |
|-----|------|------|------|
| **Kuramoto 相位映射 (H4)** | 评估/治理引擎 | `θ = b·π`，b=±0.99 在单位圆上重合→R≈1 误判 | `θ = b·π/2`，b=±0.99 正对→R≈0 |
| **Cronbach's α 语义 (H5)** | 评估引擎 | 把轮次当 item 测一致性，实际测的不是可靠性 | 保留但标注争议 |
| **convergenceSpeed 注释方向写反 (H6)** | 自适应阈值 | 注释说"值大=快收敛"，实际"值大=慢收敛" | 纠正注释，公式方向本身正确 |

### 5.4 认知缺陷修复（D1-D4）

| ID | 缺陷 | 症状 | 修复 |
|----|------|------|------|
| D1 | buildPrompt 未注入 belief/confidence | 状态修改类干预对 LLM 不可见 | prompt 注入当前状态 |
| D2 | 无对话历史 | agent 不知道自己上轮说过什么 | 个性化 memory |
| D3 | Promise.all 并行发言 | 同轮 agent 互相不可见 | 顺序 for 循环 |
| D4 | 用 belief 差推断影响力 | 幻影影响力图 | 仅用显式 referencedAgents 建边 |

**修复时间线**：D1-D4 在 commit `08b20fb` 一次性修复。修复前所有实验结果含"治理环路断裂"——state-modification 类干预（reduce_weight、force_reflection）的效应被系统性低估。

---

## 6. 常见陷阱

### 6.1 运行实验

- **❌ 不要用 `ts-node`**：ESM 模块解析会失败（`Cannot find module .../adapters/custom`）。用 `tsx`。
- **❌ 不要用 `npm run experiment`**（如果 package.json 未更新为 tsx）。直接用 `npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --speakMode=content_driven`
- **❌ 不要在实验间不清理状态**：`GovernanceEngine` 的 `reset()` 必须在每次实验间调用，否则状态污染导致不可复现。

### 6.2 数据与统计

- **τ 是基于 ItemBeliefs 的排名相关性**：不要用 V1 的 keyword-matching 做 fallback——那是已废弃的旧指标，在 v2 中会抛错而非静默回退。
- **consensusLevel 就是 Kuramoto R**：不要在代码中混用 `1 - 2*std` 或 `CL` 公式——run.ts 和 analyze.ts 现在都直接用 R。
- **τ 和 R 是正交指标**：τ 测量正确性（vs ground truth），R 测量共识度（agent 之间的一致性）。已验证 r≈0——高共识保证不了高正确性。

### 6.3 随机性

- **所有随机数用 mulberry32**：`Math.random()` 在实验代码中应不存在。mulberry32 保证给定种子下的确定性输出。
- **种子策略**：`mulberry32(baseSeed + runIndex)`——不同 run 有不同但可复现的随机序列。

### 6.4 API 调用

- **callLLM 有重试逻辑**：3 次指数退避，覆盖 TIMEOUT/NETWORK/RATE_LIMIT。不要自己加额外重试——会指数爆炸。
- **API key 在 `.env.local`**：不在代码中硬编码。DeepSeek 是默认提供商（最便宜，约 ¥0.07/次实验）。

---

## 7. 关键文件速查

### 7.1 必须读的文件

| 优先级 | 文件 | 原因 |
|--------|------|------|
| 🔴 | `src/lib/discussion/asyncEngine.ts` | 异步引擎主循环，包含 beliefShift 修复 |
| 🔴 | `src/lib/thermodynamics/TerminationDecider.ts` | 终止逻辑 + 阈值配置 |
| 🔴 | `src/lib/governance/index.ts` | 治理引擎核心 + F 分解排序 |
| 🔴 | `experiments/v2/run_async_ab.ts` | 异步实验运行器 |
| 🔴 | `experiments/v2/analyze_async.ts` | 异步实验统计分析 |
| 🟡 | `src/lib/utils/statsUtils.ts` | 热力学函数 (R/T/H/F) |
| 🟡 | `src/lib/evaluation/index.ts` | 五维评估 |
| 🟡 | `experiments/v2/run.ts` | 同步实验运行器 |
| 🟡 | `src/lib/discussion/index.ts` | 同步讨论引擎 |
| 🟢 | `src/lib/analysis/causalEffect.ts` | 因果推断 |
| 🟢 | `src/lib/governance/adaptiveThresholds.ts` | 自适应阈值（已实现，未实验验证） |

### 7.2 必须读的文档

| 优先级 | 文件 | 原因 |
|--------|------|------|
| 🔴 | `DEVELOPER_GUIDE.md` | 本文档 |
| 🔴 | `README_CN.md` | 完整实验结果 + 实验设计 |
| 🔴 | `LIMITATIONS.md` | 已知局限——避免重复踩坑 |
| 🟡 | `MATHEMATICAL_FRAMEWORK.md` | 所有公式的完整定义 + 代码对应 |
| 🟡 | `THERMODYNAMICS_INTEGRATION.md` | R/T/H/F 公式 + 代码位置 |
| 🟢 | `ROADMAP.md` | 发展方向 + 待做事项 |
| 🟢 | `API_CONTRACT.md` | SDK API 规范 |

---

## 8. 开发工作流

### 8.1 添加新任务

1. 在 `experiments/v2/` 创建 `task_<name>.ts`
2. 导出一个函数返回 `TaskDefinition`：包含 `items`（方案列表，每个有 `name`/`summary`）、`groundTruthRanking`、`agentKnownItems`（每个 agent 的独有信息）
3. 在 `run.ts` 或 `run_async_ab.ts` 中 import 使用

```typescript
// 最小任务模板
export function createMyTask(): TaskDefinition {
  return {
    id: "my_task",
    name: "我的任务",
    description: "场景描述",
    items: [
      { id: "A", name: "方案 A", summary: "...", details: { dimension1: "..." } },
      // ... 5 个方案
    ],
    groundTruthRanking: ["C", "A", "E", "B", "D"],  // 正确排序
    agentKnownItems: {
      a1: ["A"],  // agent 1 只知道方案 A 的独有信息
      a2: ["B"],
      // ...
    },
  };
}
```

### 8.2 添加新检测器

```typescript
engine.registerDetector({
  type: "my_custom_bias",
  detect(agentBeliefs, messages, config) {
    // 自定义检测逻辑
    return {
      detected: true,
      severity: "medium",  // "low" | "medium" | "high"
      description: "检测到自定义偏差：...",
    };
  },
});
```

### 8.3 修改热力学阈值

阈值定义在 [TerminationDecider.ts](./src/lib/thermodynamics/TerminationDecider.ts) 的 `DEFAULT_TERMINATION_THRESHOLDS`：

```typescript
export const DEFAULT_TERMINATION_THRESHOLDS: TerminationThresholds = {
  crystallR: 0.85,
  crystallT: 0.22,        // 低于此值 = 低噪声
  crystallH: 0.42,        // 低于此值 = 低熵
  consecutiveCrystallRequired: 3,
  strongCrystallT: 0.10,
  strongCrystallH: 0.20,
  maxUtterances: 40,      // 硬上限
  evalEveryKUtterances: 2, // 每 2 次发言评估一次
  // ...
};
```

修改后需要重新运行 C 组实验验证效果（`npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --speakMode=content_driven`）。

### 8.4 运行完整测试套件

```bash
npm test                    # 229 个测试
npm run test:watch          # 监听模式
```

### 8.5 典型开发循环

```bash
# 1. 修改代码
# 2. 运行单元测试
npm test

# 3. 运行单次实验验证（C 组，1 次）
npx tsx experiments/v2/run_async_ab.ts --group=C --count=1 --speakMode=content_driven

# 4. 如果通过，运行完整 10 次
npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --speakMode=content_driven

# 5. 分析结果
npx tsx experiments/v2/analyze_async.ts

# 6. 对比旧数据
# 检查 experiments/v2/data_fraud_pre_beliefshift_fix/ 中的备份
```

---

## 9. 统计方法论速查

### 9.1 效应量 (Cohen's d)

```
d = (mean_a - mean_b) / pooled_sd
pooled_sd = sqrt(((n_a-1)*var_a + (n_b-1)*var_b) / (n_a + n_b - 2))
```

| d | 解释 |
|----|------|
| < 0.2 | 微不足道 |
| 0.2–0.5 | 小 |
| 0.5–0.8 | 中等 |
| > 0.8 | 大 |

### 9.2 置换检验

- 10000 次 Fisher-Yates 洗牌
- p = (count + 1) / (nPerm + 1)（连续性校正）
- 使用 mulberry32(42) 保证可复现

### 9.3 多重比较

当同时检验多个假设时（如 4 种干预 vs none）：
- **Bonferroni 校正**：p_adjusted = min(p × k, 1)，保守
- **Benjamini-Hochberg FDR**：更宽松，适合探索性分析
- 当前实验报告原始 p 值，同时标注 Bonferroni 校正后是否仍显著

### 9.4 统计功效

```
power = P(reject H0 | H1 true)
target: power ≥ 0.80
```

Crisis 任务 full vs none（n=24）功效 88%，已达目标。Supplier（n=30）功效 43%，需 n=72。

---

## 10. 实验结论的稳定性评估

### 10.1 可靠的结论

| 结论 | 证据强度 | 为什么可靠 |
|------|---------|-----------|
| 虚假共识存在（r≈0） | ★★★★★ | 跨 3 项任务 169 次实验复现，关闭了所有已知度量错误 |
| 治理有效（full > none） | ★★★★☆ | Crisis 统计确认（p=0.005），Supplier 方向一致，但未跨模型验证 |
| reduce_weight + force_reflection 是核心驱动 | ★★★★☆ | 机制消融在两任务方向一致 |
| 洗牌对照受任务难度调节 | ★★★☆☆ | Crisis 显著但 Supplier 无效应，仅 2 任务 |

### 10.2 不稳定的结论

| 结论 | 为什么不稳定 |
|------|------------|
| 热力学终止优于固定轮次 | 仅 30 次 C 组实验（3 轮阈值标定），n=10/组，且仅 DeepSeek-V3 |
| F 分解排序优于固定排序 | A/B 对照未支持（d=−0.354, p=0.378），n=40 |
| 单干预消融不显著 | 可能是 n=10 的功效不足，而非真实无效应 |

### 10.3 需要重新验证的实验

如果以下条件改变，需重做所有实验：

1. **切换 LLM 模型**（当前仅 DeepSeek-V3）——所有 τ 基准会变
2. **修改异步引擎 speak willingness 公式**——C 组 + D 组需重跑
3. **修改 beliefs 更新方程**——所有治理消融实验可能受影响
4. **修改热力学阈值**——C 组须重跑（A/B/D 组不受影响，它们不依赖热力学终止）

---

## 11. 当前待解决的已知问题

按优先级排序：

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | 异步引擎发言意愿缺少 quality_factor | Run 0 型的"噪音 agent 抢麦"导致的讨论失败无法防治 | P0 |
| 2 | 仅 DeepSeek-V3，无跨模型验证 | 结论可能模型特异 | P0 |
| 3 | n=10/组功效不足 | 小效应量（d<0.5）可能被漏掉 | P1 |
| 4 | 自适应阈值/剂量已实现但未实验对比 | 不知道固定参数 vs 自适应哪个更好 | P1 |
| 5 | 热力学阈值需手动标定 | 新任务需要重新分析确定阈值 | P2 |
| 6 | 评估权重为启发式设定 | 等权稳健性未检查 | P2 |
| 7 | GroupedTopology / CommitteeTopology 未实验验证 | 大规模场景下的治理效果未知 | P3 |

---

## 12. 项目关键数字

| 指标 | 数值 |
|------|------|
| 总实验次数 | **406**（历史 165 + 扩样 161 + 异步引擎 80） |
| 任务数量 | 6（Crisis / Supplier / Fraud / Invest / M&A / ER Triage） |
| 实验条件 | 7 种治理模式 + 4 种异步引擎组别 |
| 单元测试 | 229 个 |
| Claude Code 辅助开发会话 | ~10 次密集 session |
| 代码行数 | ~13,000 TypeScript |
| 文档 | 14 个 md 文件 |
| 发现的 bug 数 | 12（§5 记录了 8 个 + D1-D4） |
| 弃用的旧实验线 | 1（lunar_survival v1，keyword-matching 指标） |

---

> **最后更新**：2026-07-18
> **维护者**：贺孟元
> **下次更新触发条件**：跨模型验证完成 / 新任务添加 / 阈值重新标定
