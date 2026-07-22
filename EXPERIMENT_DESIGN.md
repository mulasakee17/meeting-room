# SwarmAlpha 实验设计与技术路线文档

> **文档定位**：工程复盘用。面向项目开发者本人，用于梳理"做了什么、为什么这么做、哪里有问题"。
> **撰写原则**：所有结论须可追溯到代码或数据文件；不确定处明确标注"待确认"；不臆造接口或数据。
> **撰写日期**：2026-07-22
> **数据快照截止**：2026-07-20

---

## 目录

1. [项目技术路线总览](#1-项目技术路线总览)
2. [两套讨论引擎设计](#2-两套讨论引擎设计)
3. [社会热力学框架](#3-社会热力学框架)
4. [治理机制](#4-治理机制)
5. [评估指标与统计方法](#5-评估指标与统计方法)
6. [旧实验设计（lunar_survival）](#6-旧实验设计lunar_survival)
7. [新实验设计（v2）](#7-新实验设计v2)
8. [跨模型验证——诚实局限](#8-跨模型验证诚实局限)
9. [已知局限与下一步方向](#9-已知局限与下一步方向)
10. [附录：数据目录清单](#10-附录数据目录清单)

---

## 1. 项目技术路线总览

### 1.1 核心问题

多 agent 讨论系统中，如何让群体决策避免以下失效模式：
- **隐藏信息未充分曝光**（Hidden Profile 问题：agent 各持独有知识，但讨论中未充分分享）
- **过早共识**（premature consensus：第一个发言者锚定全场）
- **权威偏置**（authority bias：高置信度 agent 压制异见）
- **回音室效应**（echo chamber：相似观点互相强化）
- **极化**（polarization：观点向极端漂移）
- **恶意操纵**（单点攻击 / 共谋攻击）

### 1.2 技术路线演进

项目经历两代实验框架：

```
第一代（lunar_survival/）          第二代（v2/）
├── 同步引擎 DiscussionEngine      ├── 同步引擎（A组基线复用）
├── 3任务 × 4消融 × 10次 = 120     ├── 异步引擎 AsyncDiscussionEngine（核心创新）
├── 关键词匹配 accuracy            ├── ABCD四组对照 + EFG恶意组
├── t检验                          ├── Kendall τ-b + 热力学终止 + 治理
└── deepseek-chat                  ├── content_driven 发言意愿公式
                                   ├── DeGroot 被动倾听
                                   ├── 社会热力学 F=(1-R)+T·H
                                   ├── 7检测器 + 4干预 + F分解排序
                                   └── 配对置换检验 + Cohen's d_z
```

**第一代→第二代的核心跨越**：
- 发言机制：同步全员顺序 → 异步内容驱动（发言意愿公式决定谁发言）
- 信念更新：仅发言者更新 → 发言者更新 + 被动倾听者 DeGroot 更新
- 终止条件：固定5轮 → 热力学自适应终止（Kuramoto R + 温度 T + 熵 H）
- 评估指标：关键词匹配 accuracy → Kendall τ-b 排名相关
- 治理机制：4检测器+随机/固定干预 → 7检测器+F分解排序干预

---

## 2. 两套讨论引擎设计

### 2.1 同步引擎 DiscussionEngine

**源码位置**：[src/lib/discussion/index.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/index.ts)

**核心机制**：每轮所有 agent 按固定顺序依次发言，每个 agent 能看到本轮之前所有人的发言。

**关键方法**：

| 方法 | 行号 | 职责 |
|------|------|------|
| `observeAgents` | L565-622 | 顺序遍历 agent，累积 `currentRoundOpinions` 供后续 agent 参考 |
| `buildPrompt` | L624-699 | 拼接 memory + currentRoundOpinions + governance prompts |
| `applyGovernance` | L815-999 | none/detect-only/random-intervene/full 四种模式 |
| `updateBeliefs` | L728-766 | 通过 InferenceLayer 推断 StateDelta 更新信念 |
| `checkConvergence` | L702-726 | per-item 收敛判断（std < convergenceThreshold） |

**发言可见性**（已在阶段3验证）：
- 第 i 个 agent 发言时，能看到本轮第 0..i-1 个 agent 的发言（`currentRoundOpinions` 累积）
- 这是**顺序发言**，不是并发。每个 agent 看到前面人的实时发言。

**治理模式**（`applyGovernance` L815-999）：
- `none`：无检测无干预
- `detect-only`：检测但只记录不干预
- `random-intervene`：随机干预（对照组，验证"精准干预"的价值）
- `full`：检测 + F分解排序的精准干预

### 2.2 异步引擎 AsyncDiscussionEngine（核心创新）

**源码位置**：[src/lib/discussion/asyncEngine.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/asyncEngine.ts)

**核心机制**：取消"轮次"概念，改为"发言序列"。每一步通过发言意愿公式决定谁发言、发言几次，直到热力学终止条件触发或硬上限。

**默认配置**（`DEFAULT_ASYNC_CONFIG` L72-88）：

| 参数 | 值 | 说明 |
|------|------|------|
| `evalEveryKUtterances` | 2 | 每2次发言触发热力学评估 |
| `willingnessThreshold` | 0.40 | 意愿≥0.40 可能发言 |
| `strongWillingnessThreshold` | 0.82 | 意愿≥0.82 必须发言 |
| `recentSpeakPenalty` | 0.5 | 刚发过言扣分 |
| `recentSpeakWindow` | 2 | 最近2次发言窗口 |
| `hardCapUtterances` | 40 | 硬上限（在 TerminationDecider 中定义） |

**主循环**（`runAsyncMainLoop` L241-417）：
```
while (未终止):
    1. 为每个 agent 计算发言意愿分数
    2. 按意愿分组：mustSpeak(≥0.82) / maybe(0.40-0.82) / silent(<0.40)
    3. mustSpeak 全部发言，maybe 按意愿降序加权发言
    4. 兜底：若无人发言，选意愿最高的1人发言
    5. 更新发言者信念 + 被动倾听者信念
    6. 每 K=2 次发言触发热力学评估，决定是否终止
```

### 2.3 发言意愿公式（content_driven 模式）

**源码位置**：`computeWillingnessFactors` L664-718 + `computeWillingness` L760-783

**5个因子**：

| 因子 | 计算 | 权重 |
|------|------|------|
| `infoExposure` | 独有信息曝光度（agent 持有但他人未提及的信息） | ×0.6 |
| `beliefShift` | 信念变化幅度 | >0.3 → +0.4; >0.1 → +0.2 |
| `consensusDeviation` | 与群体共识的偏离 | >0.4 → +0.4; >0.2 → +0.2 |
| `dependencyTriggered` | 被他人@依赖触发 | +0.3 |
| `recentlySpoke` | 最近2次发言窗口内发过言 | -0.5 |

**合成公式**（`computeWillingness` L760-783）：
```typescript
w += f.infoExposure * 0.6;
if (f.beliefShift > 0.3) w += 0.4; else if (f.beliefShift > 0.1) w += 0.2;
if (f.consensusDeviation > 0.4) w += 0.4; else if (f.consensusDeviation > 0.2) w += 0.2;
if (f.dependencyTriggered) w += 0.3;
if (f.recentlySpoke) w -= this.asyncConfig.recentSpeakPenalty;  // -0.5
return (Math.tanh(w) + 1) / 2;  // tanh 归一化到 [0,1]
```

**意图**：让"有独有信息要分享"、"信念发生大变化"、"与共识有分歧"的 agent 更可能发言；让"刚发过言"的 agent 暂时沉默。

### 2.4 被动倾听 DeGroot 更新

**源码位置**：`updateListenerBeliefs` L440-497

未发言的 agent 不只是被动旁观，而是按 DeGroot 模型更新信念：

```
Δbelief_i = learning_rate × Σ(w_ij × (belief_j - belief_i)) / Σ(w_ij)
```

- `learning_rate = 0.15`
- `w_ij`：agent i 对 agent j 的信任权重
- confidence 按 agreement 程度调整（越同意越提高 confidence）

**这是异步引擎与同步引擎的关键差异**：同步引擎只有发言者更新信念，异步引擎让倾听者也持续更新。

---

## 3. 社会热力学框架

### 3.1 自由能 F 分解

**公式**：`F = (1 - R) + T · H`

| 量 | 定义 | 物理隐喻 |
|------|------|----------|
| R | Kuramoto 序参量 = \|Σ e^(iθ)\| / N，θ = belief × π/2 | 序参量（共识相干度） |
| T | 归一化温度 = 1 - mean(confidence) | 温度（不确定性） |
| H | Shannon 熵 = -Σ p·log(p) | 熵（观点多样性） |

**解读**：
- R→1：信念高度相干（共识强）
- T→0：置信度高（信念"冷"）
- H→0：观点集中（多样性低）
- F→0：系统"结晶"（低能态，高度有序且确定）

### 3.2 终止决策

**源码位置**：[src/lib/thermodynamics/TerminationDecider.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/thermodynamics/TerminationDecider.ts)

**阈值**（`DEFAULT_TERMINATION_THRESHOLDS` L100-121）：

| 参数 | 值 | 含义 |
|------|------|------|
| `crystallR` | 0.85 | 结晶态 R 阈值 |
| `crystallT` | 0.22 | 结晶态 T 阈值 |
| `crystallH` | 0.42 | 结晶态 H 阈值 |
| `consecutiveCrystallRequired` | 3 | 连续3次结晶才终止 |
| `strongCrystallT` | 0.10 | 强结晶 T 阈值 |
| `strongCrystallH` | 0.20 | 强结晶 H 阈值 |
| `hardCapUtterances` | 40 | 硬上限 |

**决策逻辑**（`evaluate` L152-207）：
1. 硬上限：发言数 ≥ 40 → 立即终止（`hard_cap`）
2. 强结晶：T<0.10 且 H<0.20 → 立即终止（`strong_crystallized`）
3. 普通结晶：R>0.85 且 T<0.22 且 H<0.42 → 连续3次才终止（`crystallized`）
4. 否则继续

**状态分类**（`classifyState` L217-242）：crystallized / quenched / chaotic / active

### 3.3 核心假设

> **H_thermo**：热力学自适应终止能在不损失决策质量的前提下，比固定轮次更早终止（节省 token）。
> **H_diag**：热力学终止决策优于随机终止（验证诊断价值，而非"早点停就好"）。

这两个假设通过 ABCD 四组对照实验验证（见第7节）。

---

## 4. 治理机制

### 4.1 7个检测器

**源码位置**：[src/lib/governance/index.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/governance/index.ts)

**4个原生检测器**：
| 检测器 | 检测目标 |
|--------|----------|
| Echo Chamber | 相似观点互相强化 |
| Authority Bias | 高置信度 agent 压制异见 |
| Polarization | 观点向极端漂移 |
| Premature Consensus | 过早达成共识 |

**3个 MAST 检测器**（Failure Mode 2.4/2.5/2.6）：
| 检测器 | 检测目标 |
|--------|----------|
| FM-2.4 信息隐藏 | agent 持有信息但未分享 |
| FM-2.5 忽略输入 | agent 忽略他人提供的信息 |
| FM-2.6 推理-行动不一致 | agent 说的与做的矛盾 |

**已知问题**（来自 project_memory）：
- Echo Chamber 检测器无效（separation 0.000），应从治理信号中排除
- Polarization 阈值从 0.30 降到 0.15 以最大化信号分离

### 4.2 4个干预

| 干预 | 作用 |
|------|------|
| `reduce_weight` | 降低问题 agent 的社会权重 |
| `introduce_diversity` | 引入多样性（重置部分信念） |
| `force_reflection` | 强制 agent 反思 |
| `continue_discussion` | 延续讨论 |

**已知问题**（来自 project_memory）：
- `introduce_diversity` 有效率仅 4.7%，应禁用
- `continue_discussion` 有效率 0%，应禁用
- 第3轮干预有效率 0%，应避免

### 4.3 F分解排序

**源码位置**：`rankInterventionsByFreeEnergy` L794-832

干预按"预期自由能下降量"排序，优先执行 F 下降最多的干预：

```typescript
case "force_reflection":   return thermal * (1 - structural);  // thermal=T, structural=R
case "reduce_weight":      return thermal;                      // = T
case "introduce_diversity": return R * (1 - H);
case "continue_discussion": return R * (1 - H) * (1 - F);
```

**意图**：高温（高不确定性）时优先 `force_reflection`/`reduce_weight`；高序参量低熵时优先 `introduce_diversity`。

---

## 5. 评估指标与统计方法

### 5.1 Kendall τ-b（排名相关系数）

**源码位置**：[experiments/v2/statsShared.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/statsShared.ts) L170-220

τ-b 含精确 tie 修正。衡量 agent 群体最终排名与 ground truth 排名的相关性。
- τ=1：完全一致
- τ=0：无关
- τ=-1：完全相反

**已修复的 bug**（来自 project_memory）：tie 修正公式曾用 `count*(count+1)/2`，应为 `count*(count-1)/2`，导致 ties≥2 时 τ 退化为 0。

### 5.2 Kuramoto R 与 Shannon H

**源码位置**：statsShared.ts L226-236

- `kuramotoR`：`|Σ e^(iθ)| / N`，θ = belief × π/2
- `shannonH`：标准 Shannon 熵

### 5.3 统计检验方法

**源码位置**：[experiments/v2/analyze_cross_model.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/analyze_cross_model.ts)

| 方法 | 位置 | 用途 |
|------|------|------|
| 配对置换检验 | L87-100 | sign-flip，`(count+1)/(nPerm+1)` 修正避免 p=0 假阳性 |
| Cohen's d_z | L106-110 | 配对效应量 = mean(diffs)/sampleStd(diffs) |
| 配对 95% CI | L115-130 | t 分布，df=n-1 |
| mulberry32 PRNG | statsShared.ts L92-100 | 确保可复现，PERMUTATION_SEED=42, BOOTSTRAP_SEED=42+0x5EED |

**关键约束**（来自 project_memory）：
- 所有置换检验必须用 `(count+1)/(nPerms+1)` 修正
- 所有脚本用统一 seed 确保跨脚本可复现

---

## 6. 旧实验设计（lunar_survival）

### 6.1 实验框架

**入口**：[experiments/lunar_survival/run.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/lunar_survival/run.ts)
**配置**：[experiments/lunar_survival/config.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/lunar_survival/config.ts)

**设计**：3任务 × 4消融 × 10次 = 120实验

**4消融模式**（config.ts L112-121）：
| 模式 | 检测 | 干预 |
|------|------|------|
| `none` | 全关 | 关 |
| `detect-only` | 全开 | 关 |
| `random-intervene` | 全关 | 随机 |
| `full` | 全开 | 精准 |

**实验参数**（config.ts L127-136）：
- maxRounds=5, convergenceThreshold=0.06, temperature=0.2
- provider=deepseek, model=deepseek-chat
- runsPerCondition=10

### 6.2 任务定义

**任务1：月球生存**（TASK_LUNAR, config.ts L39-52）
- 15物品排序（氧气瓶=1 ... 火柴=15）
- 5个 agent：医疗/导航/工程/生存/物理专家
- 经典 NASA Hidden Profile 任务

**任务2：企业并购**（TASK_MA, config.ts L66-79）
- 5公司排序（NeuraTech=1 ... PureFiber=5）
- 5个 agent：CFO/CTO/CMO/CSO/CRO
- 原创 Hidden Profile

**任务3：城市规划**（TASK_URBAN, config.ts L93-106）
- 5项目排序（防洪=1 ... 滨江公园=5）
- 5个 agent：市政/能源/交通/卫生/环境
- 原创 Hidden Profile

### 6.3 评估方法（旧）

**源码位置**：run.ts L50-74 `accuracyFromTask`

旧方法用**关键词匹配**计算 accuracy：
- 检查 ground truth 中每个 item 的关键词是否出现在讨论输出中
- 按 item 在讨论中首次出现的位置打分（越靠前越高）
- 归一化到 0-100

**局限**：关键词匹配无法准确反映排名质量，这是旧实验与新实验的关键差异。

### 6.4 实际执行情况（诚实记录）

**数据目录**：[experiments/lunar_survival/data/raw/](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/lunar_survival/data/raw)

✅ **已验证的执行情况**（通过 Glob 确认）：
- `lunar` 任务：4消融 × 10次 = 40 文件 ✓
- `ma` 任务：4消融 × 10次 = 40 文件 ✓（部分消融跑到了 run19，可能有过补跑）
- `urban` 任务：**0 文件** ✗ 未跑或未保存

⚠️ **结论**：旧实验设计是 3×4×10=120，但实际只执行了 2×4×10≈80 次。urban 任务数据缺失。

### 6.5 旧实验的统计方法

**源码位置**：run.ts L164-184 `tTest`

旧方法用**独立样本 t 检验**（pooled variance），p 值用查表近似（absT>3.5 → "<0.001" 等）。

**与新实验的差异**：新实验改用配对置换检验 + Cohen's d_z + t分布 CI，统计严谨度更高。

---

## 7. 新实验设计（v2）

### 7.1 ABCD 四组对照实验

**入口**：[experiments/v2/run_async_ab.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/run_async_ab.ts)

**组定义**（L4-7）：

| 组 | 引擎 | 发言模式 | 终止 | 干预 |
|----|------|----------|------|------|
| A | 同步 DiscussionEngine | 全员顺序 | 固定5轮 | F分解排序 |
| B | 异步 AsyncDiscussionEngine | 概率/内容驱动 | 固定5轮 | F分解排序 |
| C | 异步 AsyncDiscussionEngine | content_driven | 热力学自适应 | F分解驱动 |
| D | 异步 AsyncDiscussionEngine | content_driven | 随机终止（匹配C组分布） | F分解驱动 |

**核心对比**：
- A vs B：异步本身是否影响决策质量
- B vs C：热力学自适应终止是否优于固定轮次（**H_thermo**）
- C vs D：热力学终止决策是否优于随机终止（**H_diag**）

**关键参数**（已验证）：
- `evalEveryKUtterances=2`（L364，2026-07-19 修复：与 DEFAULT_ASYNC_CONFIG 一致）
- D组终止点从C组实际终止分布采样（L375-384）

**CLI 用法**：
```bash
npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --provider=deepseek --model=deepseek-chat
```

**provider/model 可配置**（L134-152）：
- 默认 deepseek/deepseek-chat
- 可通过 `--provider=zhipu --model=glm-4-flash` 切换

### 7.2 EFG 恶意实验

**入口**：[experiments/v2/run_malicious.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/run_malicious.ts)
**任务定义**：[experiments/v2/task_fraud_malicious.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/task_fraud_malicious.ts)

| 组 | 攻击类型 | 治理 |
|----|----------|------|
| E | 单点攻击 | 开 |
| F | 单点攻击 | 关 |
| G | 共谋攻击 | 开 |

- 所有组用 AsyncDiscussionEngine + content_driven + adaptive 终止
- 恶意变体任务包含：信息投毒 / 权威操纵 / 依赖劫持

### 7.3 任务定义

**欺诈调查任务**（[task_fraud.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/task_fraud.ts)）：
- 5线索排序，信息依赖链 A→B→C
- ABCD组使用

**危机管理任务**（[task_crisis.ts](file:///c:/Users/贺孟元/Desktop/swarmalpha/experiments/v2/task_crisis.ts)）：
- 5方案排序，5维度加权
- crisis 实验使用

**供应商任务**：
- supplier 实验使用（较简单，τ≈0.68 天花板效应）

### 7.4 实际执行情况（诚实记录）

✅ **已通过 Glob + Read 验证的数据目录**：

| 目录 | 内容 | 数量 | 时间戳 |
|------|------|------|--------|
| `data_fraud/` | A/B/C/D 各10 | 40 | 2026-07-15(A), 07-18(C) |
| `data_fraud_zhipu/` | B(4) + C(10) | 14 | 2026-07-19 |
| `data_fraud_malicious/` | E(0-9,101-105) + F(0,101-105) | 不完整 | 2026-07-20 |
| `data_fraud_malicious_backup_v1/` | E/F/G 各0-9 | 30 | 2026-07-20 |
| `data_crisis/` | full/none/shuffle 各24 + full_fixed(8) | 80 | — |
| `data_supplier/` | full/none/shuffle 各30 | 90 | — |
| `data/` (ma_*) | adaptive/detect/full/none 各15 + 消融各10 | ~100 | — |

⚠️ **恶意实验数据混乱**：
- `data_fraud_malicious/` 有 E(0-9,101-105) 和 F(0,101-105)，**F 组严重不全**（只有6个文件）
- `data_fraud_malicious_backup_v1/` 有完整的 E/F/G 各0-9
- 两套数据 codeVersion 不同（malicious vs malicious-v2），需明确哪套是当前有效数据

### 7.5 数据格式

**新实验 JSON 字段**（已验证，以 `fraud_C_content_driven_0.json` 为例）：

```json
{
  "runId": "fraud_C_content_driven_0",
  "group": "C",
  "runIndex": 0,
  "speakMode": "content_driven",
  "timestamp": "2026-07-18T14:02:55.582Z",
  "codeVersion": "...",  // 可选，DeepSeek数据无此字段，Zhipu有
  "kendallTau": 0.4,
  "decisionQuality": 70,
  "totalRounds": 7,
  "totalUtterances": 19,
  "converged": true,
  "terminationReason": "crystallized (...)",
  "thermoHistory": [{ "R":..., "T":..., "H":..., "F":..., "utteranceCount":..., "evalIndex":... }],
  "finalBeliefs": { "a1":..., "a2":..., ... }
}
```

⚠️ **JSON 中无 `provider`/`model` 字段**。模型身份只能从 `run_async_ab.ts` 的 CLI 参数和 `analyze_cross_model.ts` 的注释推断。

---

## 8. 跨模型验证——诚实局限

### 8.1 实验意图

验证框架的**模型无关性**：在不同 LLM 后端上，ABCD 四组的相对关系是否一致。

### 8.2 数据覆盖

| 模型 | A | B | C | D |
|------|---|---|---|---|
| DeepSeek-V3 (deepseek-chat) | n=10 ✓ | n=10 ✓ | n=10 ✓ | n=10 ✓ |
| Zhipu glm-4-flash | **缺失** | n=4 | n=10 ✓ | **缺失** |

⚠️ Zhipu 侧 A/D 组完全缺失，B 组仅 n=4。只有 C 组有 n=10 可做配对检验。

### 8.3 代码版本混淆问题（核心局限）

**问题**：DeepSeek 数据和 Zhipu 数据跨越了 `evalEveryKUtterances` 参数修改节点。

**已验证的事实**：
| 数据集 | 时间戳 | codeVersion | thermoHistory 评估间隔 |
|--------|--------|-------------|----------------------|
| DeepSeek C组 | 2026-07-18 | **无** | utteranceCount: 5,10,15,19（间隔≈5） |
| Zhipu C组 | 2026-07-19 | "2026-07-19" | utteranceCount: 5,10,12,17,20,24（间隔≈2） |

**根因**：`run_async_ab.ts` L364 注释明确写"2026-07-19 修复：与 DEFAULT_ASYNC_CONFIG 一致"，`evalEveryKUtterances` 从 5 改为 2。DeepSeek 数据(7-18)用的是旧值5，Zhipu数据(7-19)用的是新值2。

**影响**：评估间隔不同 → 热力学触发频率不同 → 终止时机不同 → τ 不可直接比较。

### 8.4 JSON 无 model 字段问题

**已验证**：所有 JSON 文件均无 `provider`/`model` 字段。模型身份来自：
1. `run_async_ab.ts` L140-141 默认值 `deepseek/deepseek-chat`
2. `analyze_cross_model.ts` L6 注释 "Zhipu glm-4-flash"
3. 数据目录名 `data_fraud_zhipu/` 的后缀

⚠️ 无法从数据文件本身100%确认实际调用的模型。这是数据记录的设计缺陷。

### 8.5 "未达显著"≠"证明无差异"

**统计常识**：p=0.86 只是"不拒绝原假设"，在 n=10 的低统计效力下，不能声称"证明无差异"。正确表述是"未发现显著差异"。

### 8.6 跨模型验证结论（诚实版）

> 截至当前数据，跨模型验证**不可靠**，原因如下：
> 1. 代码版本混淆（evalEveryKUtterances 5→2 跨节点）
> 2. Zhipu 侧 A/D 组缺失，B 组仅 n=4
> 3. JSON 无 model 字段，模型身份靠推断
> 4. n=10 统计效力低，"未达显著"不等于"无差异"
>
> **正确做法**：用相同代码版本重跑 DeepSeek 或 Zhipu 其中一组，使两组 codeVersion 一致后，再做配对检验。

---

## 9. 已知局限与下一步方向

### 9.1 已确认的局限

| # | 局限 | 影响 | 状态 |
|---|------|------|------|
| 1 | 跨模型数据代码版本混淆 | 跨模型结论不可靠 | 待重跑 |
| 2 | JSON 无 provider/model 字段 | 模型身份靠推断 | 设计缺陷 |
| 3 | urban 任务未执行 | 旧实验不完整 | 数据缺失 |
| 4 | 恶意实验 F 组数据不全 | EFG分析受影响 | 待补跑 |
| 5 | echo chamber 检测器无效 | 治理信号有冗余 | 已识别 |
| 6 | introduce_diversity/continue_discussion 低效 | 干预有效率低 | 已识别 |
| 7 | 单次实验数据波动大 | 信号不稳定 | 需增加轮次 |
| 8 | n=10 统计效力低 | "未显著"≠"无差异" | 需增加样本 |

### 9.2 已修复的问题（来自 project_memory）

- ✅ mulberry32 PRNG 替代 Math.random()（异步引擎可复现性）
- ✅ Kendall τ tie 修正公式 bug
- ✅ PromptInjector [GOV] 标签伪造漏洞
- ✅ DiscussionEngine.reset() 跨实验状态泄漏
- ✅ 实验文件名加 speakMode 防覆盖
- ✅ 配对置换检验 (count+1)/(nPerms+1) 修正

### 9.3 下一步方向

1. **跨模型验证重跑**：用当前代码版本（evalEveryKUtterances=2）重跑 DeepSeek C 组，与 Zhipu C 组配对比较
2. **JSON 格式增强**：在 run_async_ab.ts 输出中添加 provider/model 字段
3. **补跑 urban 任务**：完成旧实验设计的 3×4×10
4. **补跑 F 组恶意实验**：使 EFG 各组数据完整
5. **增加样本量**：关键字段实验从 n=10 提升到 n≥30
6. **轮换 Qwen API key**：之前会话中明文泄露，需立即轮换

---

## 10. 附录：数据目录清单

### 10.1 旧实验数据

```
experiments/lunar_survival/data/raw/
├── lunar_{none,detect-only,random-intervene,full}_run{1-10}.json  (40文件)
├── ma_{none,detect-only,random-intervene,full}_run{1-19}.json      (40+文件)
└── urban_*                                                         (缺失)
experiments/lunar_survival/data/stats.json
```

### 10.2 新实验数据

```
experiments/v2/
├── data_fraud/                          # DeepSeek ABCD组 (2026-07-15/18)
│   ├── fraud_{A,B}_{0-9}.json
│   └── fraud_{C,D}_content_driven_{0-9}.json
├── data_fraud_zhipu/                    # Zhipu BC组 (2026-07-19)
│   ├── fraud_B_{0-3}.json
│   └── fraud_C_content_driven_{0-9}.json
├── data_fraud_malicious/                # 恶意实验 v2 (2026-07-20, 不完整)
│   ├── fraud_E_malicious_content_driven_{0-9,101-105}.json
│   └── fraud_F_malicious_content_driven_{0,101-105}.json
├── data_fraud_malicious_backup_v1/      # 恶意实验 v1备份 (2026-07-20, 完整)
│   ├── fraud_E_malicious_content_driven_{0-9}.json
│   ├── fraud_F_malicious_content_driven_{0-9}.json
│   └── fraud_G_malicious_content_driven_{0-9}.json
├── data_fraud_old_thresholds/           # 旧阈值C组 (10文件)
├── data_fraud_pre_beliefshift_fix/      # beliefShift修复前C组 (10文件)
├── data_crisis/                         # crisis任务 (full/none/shuffle各24 + fixed 8)
├── data_supplier/                       # supplier任务 (full/none/shuffle各30)
├── data/                                # ma任务消融 (adaptive/detect/full/none各15 + 子消融各10)
├── data_invest/                         # invest任务 (2文件)
├── data_invest_3round/                  # invest 3轮 (8文件)
├── data_package/                        # package (1文件)
├── data_sensitivity/                    # 敏感性分析 (1文件)
└── _verify_*.ts, analyze_*.ts, ab_*.ts  # 分析脚本
```

### 10.3 分析脚本清单

| 脚本 | 用途 |
|------|------|
| `statsShared.ts` | 统一统计工具（mulberry32, kendallTau, kuramotoR, cohensD） |
| `analyze_async.ts` | ABCD 四组分析 |
| `analyze_cross_model.ts` | 跨模型配对检验 |
| `analyze_malicious.ts` | EFG 恶意实验分析 |
| `analyze_governance_effect.ts` | 治理效果分析 |
| `causalAnalysis.ts` | 因果效应估计 |
| `sensitivity.ts` | 敏感性分析 |
| `powerAnalysis.ts` | 统计效力分析 |
| `grid_search_thresholds.ts` | 阈值网格搜索 |
| `detector_validation.ts` | 检测器验证 |
| `quality_factor_validation.ts` | 质量因子验证 |
| `adaptive_validation.ts` | 自适应阈值验证 |

---

## 文档撰写说明

本文档所有内容均基于对以下源码的精读和数据文件的实际验证：

**已精读的源码文件**：
- `src/lib/discussion/index.ts`（同步引擎）
- `src/lib/discussion/asyncEngine.ts`（异步引擎）
- `src/lib/thermodynamics/TerminationDecider.ts`（终止决策）
- `src/lib/governance/index.ts`（治理机制）
- `experiments/v2/run_async_ab.ts`（ABCD实验入口）
- `experiments/v2/run_malicious.ts`（EFG实验入口）
- `experiments/v2/statsShared.ts`（统计工具）
- `experiments/v2/analyze_cross_model.ts`（跨模型分析）
- `experiments/lunar_survival/run.ts`（旧实验入口）
- `experiments/lunar_survival/config.ts`（旧实验配置）

**已验证的数据文件**（通过 Read 读取 JSON 字段）：
- `data_fraud/fraud_C_content_driven_0.json`（DeepSeek, 无codeVersion, 间隔5）
- `data_fraud_zhipu/fraud_C_content_driven_0.json`（Zhipu, codeVersion=2026-07-19, 间隔2）
- `data_fraud/fraud_A_0.json`（A组同步, thermoHistory空）
- `data_fraud_malicious/fraud_E_malicious_content_driven_0.json`（E组, codeVersion=2026-07-20-malicious-v2）
- `data_fraud_malicious_backup_v1/fraud_G_malicious_content_driven_0.json`（G组, codeVersion=2026-07-20-malicious）
- `lunar_survival/data/raw/ma_full_run1.json`（旧格式RunResult）

**已验证的目录内容**（通过 Glob/LS）：
- lunar_survival/data/raw/ 文件清单
- v2/ 各 data_* 目录文件清单
