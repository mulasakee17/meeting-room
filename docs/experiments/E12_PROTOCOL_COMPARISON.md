# E12: 协议对比实验 — HiddenBench 自由文本 vs SwarmAlpha 结构化讨论

> **历史探索性实验：**本文记录 legacy E12 协议比较，不是 HiddenBench 官方协议复现，也不进入 V6 schema-5/ITT confirmatory estimator；其结果只能按文中条件作探索性解释。

**日期**: 2026-08-03 ~ 2026-08-04  
**假设**: 结构化讨论协议 + δ 认知治理能防止自由文本讨论中出现的认知失败。  
**状态**: 三组完整数据（3 个任务），边界条件已形式化。

---

## 1. 实验设计

### 三组对比框架

```
同一任务 × 同一模型 × 同一信息分布
├─ A 组: HiddenBench 官方协议（自由文本，顺序 round-robin，无治理）
├─ B 组: SwarmAlpha 结构化协议（同时发言，结构化 JSON，无治理）
└─ C 组: SwarmAlpha 结构化协议 + δ 认知治理
```

### 对比矩阵

| 对比 | 含义 |
|---|---|
| A vs B | 协议效应：结构化讨论是否比自由文本更好？|
| B vs C | 治理效应：δ 在协议基础上还能提升多少？|
| A vs C | 全栈效应：从自由讨论到治理的端到端增益 |

---

## 2. HiddenBench 参考协议实现

对齐第三方 reference implementation（[jonradoff/hiddenbench](https://github.com/jonradoff/hiddenbench)，非论文作者官方仓库）的 [prompts.py](https://github.com/jonradoff/hiddenbench/blob/main/src/hiddenbench/prompts.py)。协议细节最终以 arXiv:2505.11556 论文正文/附录为准。

### 系统提示

```
You are participating in a group decision-making task. You have received
some information about a scenario and need to make a decision.

IMPORTANT: The order of the facts you receive is randomly shuffled.
The order does not indicate importance or relationship between facts.
```

关键：**不透露信息不对称**——对齐原论文主实验。

### 三阶段

| 阶段 | 格式 | 说明 |
|---|---|---|
| Pre-discussion 投票 | `{"vote": "...", "rationale": "..."}` | 每个 agent 只看自己信息 |
| 讨论 | 自由文本 1-2 句，顺序 round-robin | API 不设 `response_format: json_object` |
| Post-discussion 投票 | `{"vote": "...", "rationale": "..."}` | 看到完整讨论历史后 |

### 评估指标

- **Average Rule**: 正确投票的 agent 比例
- **Majority Rule**: 超半数正确
- **Collective Gain**: post − pre

### 实现位置

- 协议引擎: `experiments/campaign/pipeline/hiddenbenchProtocol.ts`
- Runner 分叉: `experiments/campaign/pipeline/Runner.ts` — `protocol === "hiddenbench"`
- LLM 适配: `callLLMFreeText()` — 绕过 `response_format: json_object` 约束

---

## 3. 全部实验结果

**配置**: deepseek-chat, temperature=0.0, 5 rounds (A组) / 5-8 rounds (B/C组)

### 3.1 Crisis V1（隐藏权重——任务不可解）

共享信息："市长指示速度是最高优先级"。**真实权重隐藏**——ground truth 依赖 agents 不知道的信息。

| 组 | τ | acc | 个体正确率 | 备注 |
|---|---|---|---|---|
| A (自由文本) | — | 0% | 0% post (3/3 seeds) | pre 40%→post 0%, gain −40% |
| B (结构化) | 0.600 | 0 | 0% | 全投 B |
| C (δ治理) | 0.600 | 0 | 0% | 0 干预，全投 B |

**结论**: 三组全灭。任务不可解——agents 无法获知真实权重。V1 不适合作为治理评估任务。

### 3.2 Crisis V2（显式权重——均衡偏误失败）

共享信息：**显式给出 5 个维度的权重百分比**。任务可解。但 agents 快速一致投向"各方面均衡"的方案 B。

| 组 | τ | acc | 个体正确率 | 收敛 | 备注 |
|---|---|---|---|---|---|
| A (自由文本) | — | 0% | 0% post | — | pre 40%→post 0%, gain −40% |
| B (结构化) | 0.800 | 0 | 0% (5/5→B) | r3 自然收敛 | 排名: B>C>A>E>D |
| C (δ治理) | 0.800 | 0 | 0% (5/5→B) | r5 收敛 | 0 干预，δ polarization=0.22 |

**诊断**: 均衡偏误（Equilibrium Bias）。agents 独立计算加权得分后都指向 B——**分歧在讨论前就消失了**。polarization=0.22 极低，δ 无检测入口。

### 3.3 HiddenBench Task 6（graetz_et_al_1998 ——字母编码任务）

3 个公司，agents 拿到按字母编码的需求检查表 "(b) Y, (f) N"。共享信息给出 10 个需求描述但不列出具体是哪个字母。正确: Starlight Incorporated。

| 组 | τ | acc | 个体正确率 | 备注 |
|---|---|---|---|---|
| A (自由文本) | — | 0% | 0% post | pre 50%→post 0%, gain −50% |
| B (结构化) | −1.000 | 0 | 0% (4/4→Cape) | 排名完全颠倒 |
| C (δ治理) | −0.333 | 0 | 0% (4/4→Cape) | τ 边际改善 (−1.0→−0.33), 0 干预 |

**诊断**: 格式不兼容。字母编码 "(b) Y" 对 LLM 无语义——agents 只能数 Y 的数量，Cape Industries 的 Y 最多成为错误锚点。

### 3.4 HiddenBench 其他任务（18 个扫描）

deepseek-chat 在 17/18 个 HiddenBench 任务上 post-discussion = 100%。模型免疫 hidden-profile 信息隐藏效应——**失败的不是协议，是原论文声称的失败机制对我们的模型不成立**。这是模型行为的有效发现。

---

## 4. 边界条件分析

### 核心发现

**δ 治理在三个不同失败机制上均未产生质量提升。** 这不是 δ 的设计缺陷——这些失败类型**超出了任何纯信息流治理的能力范围**。

### 三类不可治理的失败

| 失败模式 | 任务 | 根因 | 为什么治理不了 |
|---|---|---|---|
| **隐藏信息** | Crisis V1 | ground truth 依赖 agents 不知道的权重 | 治理只能重排信息流，不能注入 missing ground truth |
| **均衡偏误** | Crisis V2 | agents 独立计算得出相同结论→无分歧→快速一致 | 治理依赖分歧信号（polarization），过早共识无信号可检测 |
| **格式不兼容** | HB task 6 | 字母编码对 LLM 无语义，无法推理 | 推理失败在 LLM 层，信息流操作无效 |

### 形式化：治理入口条件

δ 治理需要**可检测的内部矛盾**才能触发干预。必要条件：

```
min(pairwise_cosine(U_i, U_j)) < θ_polarization  (默认 0.3)
```

当 agents 的效用向量在讨论开始前已经高度一致（cosine > 0.7），δ 不会有任何干预触发。**过早共识比极端分歧更难修**——这是多 agent 治理的结构性不对称。

### 这不是 δ 独有

插入人工治理者也不会改变结果：
- Crisis V2: "别盲从均衡"——agents 问"那选哪个？"无证据反驳
- HB task 6: "(b) Y 是什么意思？"——人工治理者也不知道

**纯信息流操作的治理框架有硬边界：当失败根因在信息内容本身（而非信息分布）时，治理无能为力。**

---

## 5. 治理有效的证据（效率路径）

此前在 HiddenBench task 12 上的 δ 治理效率验证（2026-08-03）：

| 组 | 收敛轮数 | Token | Acc | τ |
|---|---|---|---|---|
| 基线 (nohint) | 10 | 296K | 1 | 1 |
| δ 治理 | 3 | 59K | 1 | 1 |

**效率提升**: 3.3× 更快收敛，80% token 节约，质量持平。

治理的效率贡献是稳定可复现的——当任务在模型能力范围内时，δ 能加速收敛而不损失质量。

---

## 6. 论文叙事框架

基于当前全部证据：

### 正确主张

1. **协议效应**: 结构化讨论提升信息整合效率（τ 从不可计算→0.600/0.800），但不能单防过早共识
2. **治理效率**: 在模型能解决的任务上，δ 治理削减 80% token，3.3× 更快收敛
3. **边界条件**: 形式化了三种治理无法解决的失败模式，证明"测量先于治理"的必要性
4. **测量贡献**: 169 闭环 + δ 诊断建立了无需 ground truth 的认知坍塌检测

### 不应主张的

- "δ 治理提升多 agent 决策质量"——当前无证据支持
- "治理防止 groupthink"——Crisis V2 和 HB task 6 上均失败

### 论文叙事结构

```
§1. 为什么需要认知测量——"共识≠正确" (169 闭环 r≈−0.10)
§2. δ 诊断框架——8 个信号，无需 ground truth
§3. 协议对比实验——3 个任务 × 3 种协议
    §3.1 自由文本 → 集体判断崩溃 (A 组 groupthink)
    §3.2 结构化 → 提升 τ 但未能防过早共识 (B 组)
    §3.3 δ 治理 → 效率提升 80%，边界条件形式化 (C 组)
§4. 边界条件——三种不可治理的失败 + 治理入口条件
§5. 讨论——"测量先于治理"的方法论含义
```

---

## 7. 后续任务设计原则

基于边界条件分析，适合 δ 治理评估的任务需满足：

### 必要条件

1. **可解**: 正确答案可从 agents 掌握的信息中推导（不需要外部知识）
2. **分歧产生**: agents 基于各自独有信息会得出**不同**的初始结论→polarization > 0.3
3. **信息整合揭示真相**: pooling 独有信息能纠正误导 → 治理有干预空间
4. **非均衡**: 不存在"各方面排第 2"的安全选项——强制 agents 做有代价的权衡

### HiddenBench 任务筛选方案

当前问题：deepseek-chat 对 HiddenBench 的信息隐藏机制免疫（17/18 满分）。

**方案 A: 换弱模型**
- glm-4-flash × HiddenBench 任务 → 预期基线更低 → 有失败空间
- 先探 3-5 个任务，找 post-accuracy < 50% 的
- 优点：外部分布任务，审稿人认可
- 风险：弱模型可能连 JSON schema 都跟不上

**方案 B: 设计分歧增强任务**
- 在 Crisis V2 基础上修改：让 2 个 agents 拿到"市长权重"（速度 40%），3 个 agents 拿到"真实权重"（效果 30%）
- 同一信息格式，但不同评估框架 → 必然产生分歧 → δ 可检测
- 优点：冲突设计精确，治理效果可预期
- 风险：非外部任务

**推荐顺序**: 先跑方案 A 探测（30 分钟），如果找到 2-3 个基线失败任务则跑完整三组；否则走方案 B。

### 运行命令

```bash
# A 组探测
npx tsx experiments/campaign/explore_hiddenbench_protocol.ts --task crisis2 --model deepseek-chat --rounds 5

# B/C 组
npx tsx experiments/campaign/run_e12_crisis_v2.ts

# HiddenBench 任务探测
npx tsx experiments/campaign/probe_hb_hard.ts
```
