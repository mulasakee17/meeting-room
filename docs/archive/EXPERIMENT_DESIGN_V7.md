# SwarmAlpha 实验设计文档 v7

> **状态**: 设计稿(待确认后执行)
> **日期**: 2026-08-04
> **目标**: 建立可与前沿工作对比的实验配置,论证 SwarmAlpha 的核心结论
> **原则**: 与现有项目解耦,不修改任何已有代码

---

## 1. 核心定位(重新校准)

### 1.1 SwarmAlpha 不是什么

SwarmAlpha **不是**:
- 不是"更好的 HiddenBench"(HiddenBench 是 benchmark,SwarmAlpha 是 monitor)
- 不是"治理方法"(治理是监测的下游应用,不是主卖点)
- 不是"多 agent 决策框架"(不做通用决策,做运行时监测)

### 1.2 SwarmAlpha 是什么

SwarmAlpha **是** LLM 多 agent 系统的**运行时社会状态监测层**:

```
HiddenBench 回答的问题(事后):
  "集体推理是否失败了?" → 需要 ground truth,只能事后评估

SwarmAlpha 回答的问题(事中):
  "集体认知状态如何演化?正在形成哪种异常?" → 不需要 ground truth,运行时检测
```

### 1.3 与 HiddenBench 的关系

**不是竞争,是叠加**:

| 层次 | HiddenBench | SwarmAlpha |
|---|---|---|
| **角色** | Benchmark(评估工具) | Monitor(监测框架) |
| **时机** | 事后(pre/post accuracy) | 事中(每轮 R/T/H/F + δ) |
| **需要 GT** | 需要(correct_answer) | 不需要(δ 检测行为矛盾) |
| **覆盖异常** | 信息不对称(hidden profile) | 6 种(信息不对称 + 均衡偏误 + 伪共识 + 权威集中 + 立场翻转 + 自报矛盾) |
| **干预** | prompt 层面静态协议 | 运行时动态干预(δ 触发) |

**正确叙事**:在 HiddenBench 任务上运行 SwarmAlpha 监测,展示监测指标如何反映集体认知过程,并在失败发生前提供预警。

---

## 2. HiddenBench 论文精华汲取

### 2.1 论文核心设计(arXiv:2505.11556, ICML 2026)

**三个参考点**(方法论核心,必须借鉴):

```
1. Initial decision(沟通前基线)
   → 评估沟通效果(pre-discussion accuracy)

2. Complete-profile decision(完整信息上界)
   → 单 agent 拥有全部信息,评估个体推理能力上界
   → 区分"集体失败"和"个体能力不足"

3. Final decision(沟通后)
   → 评估集体推理实际表现(post-discussion accuracy)
```

**两种聚合规则**(必须补充):

```
Average rule: Y = (1/N) Σ 1[d_i = o*]     → 群体中正确 agent 比例(连续值 0-1)
Majority rule: Y = 1[Σ 1[d_i = o*] > N/2]  → 多数是否正确(二值 0/1)
```

SwarmAlpha 当前只有 Kendall τ,**必须补充 average rule 和 majority rule**,才能与 HiddenBench 直接对比。

### 2.2 cooperation-contradiction spectrum

HiddenBench 的 mitigation 探索:在 prompt 层面调整 agent 的合作/对抗倾向。

**发现**:
- Cooperative agents → over-coordination(过度协调,倾向一致而非信息分享)
- Contradiction → 破坏收敛(引入分歧但无法达成共识)

**SwarmAlpha 的对比**:δ 治理是**运行时动态**的(按需触发),不是 prompt 层面**静态**的(全程统一)。这是层次差异。

### 2.3 HiddenBench 的 9 个任务 vs benchmark.json 的 65 个

论文正文是 **9 个任务**(含 Stasser_Stewart_1992 等经典人类研究改编)。benchmark.json 的 65 个任务是扩展集(含自动生成场景)。论文 v4 报告 6 个模型(v1)或 15 个模型(v4 摘要)。

---

## 3. seed 究竟有没有用(深度分析)

### 3.1 seed 的传递路径(代码核查)

**路径 1: PRNG → 初始信念**

```
Runner.ts:98   rng = mulberry32(seed)
Runner.ts:113  initialBelief = initialBias ? initialBias/100 : rng()*0.6-0.3
Runner.ts:114  initialConfidence = 50 + rng()*20
```

- HiddenBench 任务:adapter 生成中性 `initialBias`(不注入偏差)→ `initialBias` 是 number → `initialBelief = initialBias/100`,**不调用 rng** → **seed 不影响 initialBelief**
- `initialConfidence` 调用 rng → seed 影响,但在 native_cognitive 模式下被 LLM 输出的 confidence 覆盖

**路径 2: PRNG → 发言顺序 shuffle**

```
nativeCognitiveEngine.ts:834-841
  if (governanceMode === "none") {
    seed = (config.seed ?? 42) + roundNumber * 0x9E3779B9
    rng = mulberry32(seed)
    // Fisher-Yates shuffle 发言顺序
  }
```

- **仅 governanceMode === "none" 时**shuffle 发言顺序
- governanceMode === "cognitive" 或 "full" 时,按 speakingPriority 排序(不 shuffle)
- **这是 seed 唯一有实际影响的路径**

**路径 3: LLM API**

```
Runner.ts:400-405
  llmConfig = { provider, model, temperature, timeout }
  // ⚠ seed 没有传给 llmConfig!
```

- providers.ts:458 支持 `seed` 参数,但 **Runner.ts 没有传**
- LLM API 不接收 seed → **LLM 输出与 seed 无关**
- temperature=0.0 → LLM 输出近似确定(API 层面有轻微非确定性)

### 3.2 seed 影响汇总

| 路径 | seed 影响? | 实际影响程度 |
|---|---|---|
| initialBelief | ❌ 不影响(HiddenBench 任务 initialBias 是 number) | 无 |
| initialConfidence | ✅ 影响 | 小(被 LLM 覆盖) |
| 发言顺序 shuffle | ✅ 影响(仅 none 模式) | **中等**(顺序影响信息暴露序列) |
| LLM API 输出 | ❌ 不影响(seed 没传给 API) | 无 |

### 3.3 发言顺序的实际影响

SwarmAlpha 协议下 agent 是**顺序发言**的(非同时),后面的 agent 能看到前面 agent 的发言。因此:

- 第一个发言的 agent:只看到自己的独有信息
- 后面发言的 agent:看到前面 agent 的独有信息 + 自己的独有信息
- 不同顺序 → 不同信息暴露序列 → 可能影响讨论走向

**但**:在足够轮次(5 轮)下,所有 agent 最终都会分享独有信息,顺序影响可能被抹平。

### 3.4 结论

**seed 有用,但作用有限**:
1. seed 通过发言顺序 shuffle 影响实验结果(仅 governanceMode === "none" 时)
2. seed 不影响 LLM API 输出(没传给 API)
3. temperature=0.0 下 LLM 输出近似确定,但不完全确定(API 层面非确定性)

**建议**:
- **3 个 seed 足够**(42, 123, 456),不需要 5 个
- 论文需诚实说明:seed 主要影响发言顺序(PRNG),LLM 输出的可复现性依赖 temperature=0
- 如果要增强 LLM 可复现性,**应把 seed 传给 llmConfig**(代码改动:Runner.ts:400-405 加 `...(config.seed !== undefined ? { seed: config.seed } : {})`)

### 3.5 是否应该把 seed 传给 LLM API?

**支持**:
- DeepSeek API 支持 seed 参数(providers.ts:458)
- 增强可复现性

**反对**:
- DeepSeek 官方不保证 seed 完全确定输出
- 即使传了,API 层面仍有非确定性(缓存、负载均衡)
- 增加复杂度但收益不确定

**建议**:暂不传。论文中说明"seed 用于 PRNG 可复现性,LLM 输出依赖 temperature=0 的近似确定性"。如果评审要求,再补传。

---

## 4. 模型选择分析

### 4.1 核心矛盾

| 模型 | 速度 | HiddenBench 失败率 | 成本 | 问题 |
|---|---|---|---|---|
| deepseek-chat | 快 | 17/18 满分(天花板) | 低 | 太强,大部分任务满分 |
| GLM-4-flash | 慢 | 9/11 失败 | 低(免费?) | 慢,但有失败率 |

### 4.2 为什么 deepseek 大部分满分

**关键洞察**:SwarmAlpha 的结构化 JSON 输出(require itemBeliefs + evidence + cognitiveState)**本身就是一种结构化通信协议**——跟 HiddenBench 论文的 mitigation(structured communication)类似。

这意味着:
- SwarmAlpha 协议 + "hint" 模式 → agent 被迫结构化分享所有独有信息 → hidden profile 问题被暴力解决
- 用 **nohint 模式**可以保留 hidden profile 难度(不提示信息不对称,agent 不主动分享)

**但**:即使 nohint,SwarmAlpha 的结构化 JSON 仍然让信息共享效率高于自由文本。所以 deepseek + nohint + SwarmAlpha 协议可能仍然大部分满分。

### 4.3 deepseek 在什么任务上会失败

从现有数据(全量扫描):

| 任务 | 协议 | 失败原因 | 失败类型 |
|---|---|---|---|
| HB task 6 (graetz) | SwarmAlpha nohint | 字母编码对 LLM 无语义 | 格式不兼容 |
| Crisis V2 | SwarmAlpha | 5/5 agent 投同一错误答案 | 均衡偏误 |
| Crisis V1 修复版 | SwarmAlpha | 归一化问题 | 数据问题 |
| crisis(自由文本协议) | HiddenBench 官方 | post=0%(群体思维) | 群体思维 |

**关键发现**:deepseek 在 SwarmAlpha 协议下的失败**不是 hidden profile 问题**,而是**其他类型的认知异常**(均衡偏误、格式不兼容等)。这正好支持 SwarmAlpha 的定位:监测 hidden profile 之外的集体认知异常。

### 4.4 模型选择方案

| 模型 | 角色 | 用途 |
|---|---|---|
| **deepseek-chat** | 主力 | 65 任务全量扫描(快,找出失败任务) |
| **GLM-4-flash** | 对照 | 65 任务全量(有失败率,验证监测预测力) |

**2 个模型足够**。SwarmAlpha 的卖点不是"跨模型评估"(那是 HiddenBench 的事),而是"监测指标跨模型稳定"。

### 4.5 GLM 慢的问题

GLM-4-flash 慢,65 任务 × 3 seed × 3 组 = 585 runs 可能需要 10+ 小时。

**缓解**:
- 先跑 deepseek 全量(2-3 小时),找出失败任务
- GLM 只在 deepseek 失败的任务上跑(减少到 ~10 任务 × 3 组 × 3 seed = 90 runs,2-3 小时)
- 如果用户坚持 GLM 全量,可以分批跑(每天跑一部分)

---

## 5. 信息分配分析

### 5.1 HiddenBench 的信息分配设计

从论文 Table 1 和 benchmark.json:

```
shared_information: 4-9 条,所有人可见
  → 倾向于支持错误选项(制造"表面赢家")

hidden_information: 3-4 条,每人独有 1 条
  → 合并后才指向正确选项
  → 无单 agent 能独立解出
```

### 5.2 SwarmAlpha adapter 的分配

```
adapter.ts:88
  myHidden = hidden.filter((_, hi) => hi % agentCount === i)
```

循环分配,每条 hidden 归一个 agent。与 HiddenBench 协议一致。

### 5.3 hint vs nohint 的差异

| 模式 | prompt 措辞 | 效果 |
|---|---|---|
| hint | "你的独有专业知识(其他成员不知道)" + "主动分享" | agent 第一轮就暴露所有独有信息 → hidden profile 被暴力解决 |
| nohint | "你掌握的信息" + "仔细考虑你掌握的所有信息" | 不提示信息不对称 → 依赖讨论自然揭示 → 保留 hidden profile 难度 |

**决策**:用 **nohint** 模式(对齐 HiddenBench 原论文主实验)。

---

## 6. 三阶段实验设计

### Phase 1: 快速扫描(deepseek only, ~2-3 小时)

**目标**:找出 deepseek 在 nohint + SwarmAlpha 协议下会失败的任务

```
配置:
  ├─ 模型:deepseek-chat
  ├─ 任务:HiddenBench 65 任务全量
  ├─ 协议:SwarmAlpha engine, nohint
  ├─ 治理:none
  ├─ Seeds:[42](1 个,快速扫描)
  ├─ 规模:65 runs
  └─ 输出:每个任务的 finalAccuracy + R/T/H/F 轨迹 + δ 触发情况
```

**预期结果**:
- 大部分任务满分(deepseek 强 + 结构化协议)
- 少数任务失败(格式不兼容、均衡偏误等)
- 失败任务 + 满分任务(对照)→ Phase 2 的样本

**解耦**:新建 `configs/e13_scan.ts`,不修改现有代码。

### Phase 2: 核心验证(deepseek + GLM, ~5-8 小时)

**目标**:验证监测预测力 + 治理效果

```
配置:
  ├─ 模型:deepseek-chat(主) + GLM-4-flash(对照,全量)
  ├─ 任务:
  │   ├─ Phase 1 失败任务(~10 个)
  │   └─ Phase 1 满分任务采样(~10 个对照)
  ├─ 协议:SwarmAlpha engine, nohint
  ├─ Groups:
  │   ├─ A:无治理(复现失败/成功)
  │   ├─ B:δ 治理(Tier 1→2 同步)
  │   └─ C:δ+SemanticTool(Tier 1→2→3 异步)
  ├─ Seeds:[42, 123, 456](3 个)
  ├─ 规模:
  │   ├─ deepseek: 20 任务 × 3 组 × 3 seed = 180 runs
  │   └─ GLM: 65 任务 × 3 组 × 3 seed = 585 runs(全量)
  └─ 验证:
      ├─ 监测预测力:第 1-2 轮 R/T/H/F 预测最终失败(AUC)
      ├─ δ 触发率:失败组 vs 成功组(Cohen's d)
      ├─ 治理效果:Δτ, Δaccuracy(A vs B vs C)
      ├─ 跨模型稳定:deepseek vs GLM 的监测指标一致性
      └─ Full Profile 对照:单 agent 拥有全部信息的 accuracy(上界)
```

**Full Profile 对照组**(新增):
- 把所有 shared + hidden information 合并给单个 agent
- 单 agent 直接决策(无讨论)
- accuracy = 个体推理能力上界
- 与集体 accuracy 对比,区分"集体失败"和"个体能力不足"

**解耦**:新建 `configs/e14_core_validate.ts` + `runFullProfile.ts`(独立脚本)。

### Phase 3: 异常类型覆盖(自写任务, ~1-2 小时)

**目标**:验证 δ 信号覆盖 HiddenBench 无法触发的异常

```
配置:
  ├─ 模型:deepseek-chat
  ├─ 任务:
  │   ├─ university(权威集中:a1 学术顾问 > a3 学生代表)
  │   └─ crisis_v2(均衡偏误:全投同一错误答案)
  ├─ Groups:A(无治理) vs B(δ) vs C(δ+Semantic)
  ├─ Seeds:[42, 123, 456]
  ├─ 规模:2 任务 × 3 组 × 3 seed = 18 runs
  └─ 验证:
      ├─ δ_concentration 触发率(university 的权威集中)
      ├─ δ_polarization 触发率(crisis_v2 的均衡偏误)
      └─ δ_1d_mask 触发率(如有伪共识)
```

**自写任务的正当性**:
- HiddenBench 只覆盖信息不对称(hidden profile)
- δ 信号还覆盖权威集中、伪共识、均衡偏误等异常
- 这些异常需要特定任务结构才能触发
- 每个自写任务有明确的"目标异常类型",引用社会心理学文献

**解耦**:新建 `configs/e15_anomaly_cover.ts`,不修改现有任务。

---

## 7. 需要补充的指标(从 HiddenBench 汲取)

### 7.1 必须补充的指标

| 指标 | 当前状态 | 补充方式 |
|---|---|---|
| **average rule** | ❌ 缺失 | Runner.ts 已有 finalAccuracy(=average rule),但需确认计算正确 |
| **majority rule** | ❌ 缺失 | 新增:统计 itemBeliefs rank=1 的多数票 |
| **pre-discussion accuracy** | ❌ 缺失 | 新增:第 1 轮前让 agent 独立投票(不看他人) |
| **Full Profile accuracy** | ❌ 缺失 | 新增:单 agent 拥有全部信息的 accuracy |
| **collective gain** | ❌ 缺失 | 新增:post-accuracy - pre-accuracy |

### 7.2 已有但需要确认的指标

| 指标 | 当前状态 | 确认点 |
|---|---|---|
| finalKendallTau | ✅ 有 | tie 修正是否正确(t_i(t_i-1)/2) |
| finalAccuracy | ✅ 有 | 是否等于 average rule |
| R/T/H/F 轨迹 | ✅ 有 | thermoHistory 已落盘 |
| δ 触发率 | ✅ 有 | deltaDiagnosis 已落盘 |

---

## 8. 实验配置与项目解耦方案

### 8.1 新增文件(不修改现有代码)

```
experiments/campaign/
  ├─ configs/
  │   ├─ e13_scan.ts              # Phase 1: 65 任务快速扫描
  │   ├─ e14_core_validate.ts     # Phase 2: 核心验证(A/B/C + Full Profile)
  │   └─ e15_anomaly_cover.ts     # Phase 3: 自写任务异常覆盖
  ├─ runFullProfile.ts            # Full Profile 独立脚本(单 agent 全信息)
  ├─ run_e13_scan.ts              # Phase 1 执行脚本
  ├─ run_e14_validate.ts          # Phase 2 执行脚本
  ├─ run_e15_anomaly.ts           # Phase 3 执行脚本
  └─ analyze_monitor_predictive.ts # 监测预测力分析(AUC, Cohen's d)
```

### 8.2 配置文件设计

每个配置文件导出 ExperimentConfig,注册到 run_all.ts(但不修改 run_all.ts 的现有逻辑,只新增 case)。

### 8.3 分析脚本设计

`analyze_monitor_predictive.ts` 独立运行,读取 output/ 下的 RawRunData,计算:
- 监测预测力:第 1-2 轮 R/T/H/F 预测最终失败的 AUC
- δ 触发率:失败组 vs 成功组的 Cohen's d
- 跨模型一致性:deepseek vs GLM 的指标相关性

---

## 9. 成本与可行性

| Phase | 模型 | Runs | 预估时间 | 预估成本 |
|---|---|---|---|---|
| Phase 1 | deepseek | 65 | 2-3 小时 | ~¥10 |
| Phase 2 (deepseek) | deepseek | 180 | 4-6 小时 | ~¥30 |
| Phase 2 (GLM) | GLM-4-flash | 585 | 10-15 小时 | ~¥20(免费?) |
| Phase 2 (Full Profile) | deepseek | 65 | 1 小时 | ~¥5 |
| Phase 3 | deepseek | 18 | 1 小时 | ~¥5 |
| **总计** | - | **913** | **18-25 小时** | **~¥70** |

GLM 全量是最耗时的部分(585 runs)。如果太慢,可以降到只在失败任务上跑(~90 runs,2-3 小时)。

---

## 10. 预期论文叙事

### 10.1 核心叙事

> 在 HiddenBench(ICML 2026)的 hidden profile 任务上,我们发现 LLM 多 agent 集体推理存在多种可检测的认知异常(不止信息不对称)。我们提出 SwarmAlpha,一个无需 ground truth 的运行时社会状态监测框架:通过 R/T/H/F 热力学指标和 8 个 δ 一致性信号,在每轮实时检测集体认知状态。实验表明:
>
> 1. **监测预测力**:第 2 轮的 R/T/H/F 能预测最终失败(AUC=X.XX),比 HiddenBench 的事后评估提前 Y 轮
> 2. **异常覆盖**:δ 信号检测到 6 种认知异常(HiddenBench 只覆盖信息不对称 1 种)
> 3. **治理效果**:非破坏性干预将失败任务的 accuracy 从 X% 提升到 Y%
> 4. **跨模型稳定**:监测指标在 deepseek 和 GLM 上一致(r=X.XX)

### 10.2 与 HiddenBench 的对比(不是竞争)

| 维度 | HiddenBench | SwarmAlpha |
|---|---|---|
| 评估时机 | 事后(pre/post) | 事中(每轮) |
| 需要 GT | 需要 | 不需要(δ) |
| 异常类型 | 1 种(信息不对称) | 6 种 |
| 干预 | prompt 静态协议 | 运行时动态干预 |
| 模型数 | 6-15 个 | 2 个(deepseek + GLM) |
| 任务数 | 9(论文)/ 65(扩展) | 65(HiddenBench)+ 2(自写补充) |

---

## 11. 待确认问题

1. **GLM 全量 vs 部分**:GLM 跑 65 任务全量(585 runs,10-15 小时)还是只在 deepseek 失败的任务上跑(90 runs,2-3 小时)?
2. **Full Profile 实现**:新建 `runFullProfile.ts` 还是复用现有 Runner(加一个 fullProfile 模式)?
3. **pre-discussion accuracy**:是否需要在第 1 轮前加一个独立投票环节?这需要修改 prompt 流程。
4. **seed 传给 LLM API**:是否在 Runner.ts 中把 seed 传给 llmConfig?当前没传。
5. **自写任务定位**:university 和 crisis_v2 作为"异常类型补充"放在附录,还是作为主实验一部分?

---

*本文档基于 2026-08-04 代码核查和 HiddenBench 论文阅读,所有结论可逐行核查。*
