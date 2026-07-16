# 面试知识点备忘录

> 按作者必须掌握的优先级排列。三层优先级：
>
> - **P0 答辩必答** — 答不上来严重扣分，作者必须能流利答出
> - **P1 诚信底线** — 被问到必须能答，涉及数据可靠性与诚实性
> - **P2 可委托/教授可能追问** — 可委托实验室同学深入，作者应有大致了解
>
> 每个知识点标注：**是什么**、**为什么这样做**、**可能被追问什么**。
> 标注 [代码] 表示有对应代码实现，[文档] 表示有对应文档。

---

## §0 开发流程时间线（2026-07-03 → 2026-07-15）

让作者能回答"这个项目是怎么做出来的"。完整时间线见 [THERMODYNAMICS_INTEGRATION.md](./THERMODYNAMICS_INTEGRATION.md) 与 [LIMITATIONS.md](./LIMITATIONS.md)。

| 阶段 | 时间 | 关键事件 | 产出 |
|------|------|---------|------|
| **V1 初版** | 07-03 ~ 07-05 | lunar_survival 早期实验，2×2 因子设计 | 165 历史实验（环路断裂） |
| **V1→V2 重构** | 07-06 ~ 07-08 | 发现并修复 6 bugs（system prompt 答案泄漏、authority bias 检测器断裂） | V2 修正管线 |
| **D1-D4 诊断** | 07-09 | 4 个认知缺陷诊断：状态感知缺失/无历史/并行发言/虚构影响网络 | StateInferenceBridge + PromptInjector 架构 |
| **H 系列硬伤修复** | 07-10 ~ 07-11 | H1-H19 硬伤修复（Kuramoto θ=πb→(π/2)b、cache 污染、Math.random 不可复现等） | 229 测试全过 |
| **161 环路闭环实验** | 07-12 | Crisis 72 + Supplier 89，环路修复后重跑 | 治理显著有效（Crisis d=0.92, p=0.005） |
| **社会热力学整合** | 07-13 ~ 07-14 | F 分解驱动干预排序（层 1 实现），H1-H4 假设回测 | H1 证伪+修正，H2 方向支持但不显著 |
| **文档去冗余** | 07-15 | 17→15 文件，2 归档，RESEARCH_STATEMENT 瘦身 35% | ONEPAGER.md 作为唯一概述 |

**关键诚实声明**：README.md 上的 2×2 因子设计数据（Invest 3 轮 d=+0.65 等）来自**环路断裂时代**的 165 实验，已标注 caveat。可靠结论来自 161 环路闭环实验（Crisis + Supplier）。

---

## P0 — 答辩必答

---

### 1. 项目一句话定位

**是什么**：为 LLM 多 agent 协作决策提供实时过程治理——在共识形成过程中检测极化、权威偏置、回声室、过早共识四类偏差并施加干预，确保少轮次讨论的决策质量。

**为什么**：现有 multi-agent 框架（AutoGen/CrewAI/LangGraph）只管 agent 怎么对话，不管对话过程是否健康。5 个 LLM agent 讨论 3-5 轮做投资决策时，可能在第 2 轮就因互相附和而过早收敛，或因某个 agent 发言过多产生权威偏置。

**追问准备**：
- "这跟 moderation 有什么区别？" → Moderation 是事后过滤有害内容，过程治理是实时检测认知偏差并干预决策过程
- "这跟 RLHF 有什么区别？" → RLHF 训练阶段对齐单个模型，我们是推理阶段治理多个模型之间的交互
- "跟 Microsoft Agent Governance Toolkit 的关系？" → 互补。他们管 security governance（防 agent 做坏事：未授权工具调用、预算超支），我们管 cognitive governance（防 agent 想错事：极化、回声室）。StateInferenceBridge 设计为可对接 ACS 标准 middleware hook

---

### 2. 四类认知缺陷及其检测方法 [代码: governance/index.ts]

| 缺陷 | 检测方法 | 阈值 | 干预策略 |
|------|---------|------|---------|
| **回音室** (Echo Chamber) | 信息冗余度 ρ = 0.5×(1-σ_norm) + 0.5×内容Jaccard相似度 | ρ ≥ 0.50 | introduce_diversity（注入差异化观点） |
| **权威偏置** (Authority Bias) | influenceRatio = max(被引用次数) / total(被引用次数) | ratio ≥ 0.25 | reduce_weight（降低该 agent 影响力权重） |
| **极化** (Polarization) | 信念标准差 σ + 双峰系数 BC | σ ≥ 0.30 且 BC > 0.555，或 σ ≥ 0.45 | force_reflection（强制信念反思） |
| **过早共识** (Premature Consensus) | 三条件：进度 < 0.35 ∧ 共识度 > 0.55 ∧ σ < 0.20 | 全部满足 | continue_discussion（追加讨论轮次） |

**为什么用这些指标**：
- 回音室：信息冗余度同时衡量"信念趋同"和"内容趋同"，单独用任一都会误判
- 权威偏置：用引用网络的基尼系数思想，一个 agent 被引用超过 25% 说明话语权过度集中
- 极化：标准差单独不够——均匀高方差不是极化，所以加双峰系数 BC > 0.555（Bates 定理的常用阈值）
- 过早共识：三个条件缺一不可，否则会误判"正常快速收敛"

**追问准备**：
- "阈值怎么来的？" → 启发式设定，未经标注数据校准。这是已知局限，计划用 Transformer 分类器替代
- "双峰系数 0.555 是什么？" → Bates & Lettenmaier (1978) 的经验阈值，BC = (skewness² + 1) / kurtosis，> 0.555 表示分布偏离单峰
- "为什么 authority bias 阈值是 0.25？" → 5 个 agent 均匀引用时每人 20%，25% 意味着比均匀高 25%。这是启发式，不是统计推断

---

### 3. 治理环路断裂（D1-D4）及其修复 [文档: LIMITATIONS.md]

**4 个认知缺陷**：

| 编号 | 缺陷 | 影响 |
|------|------|------|
| D1 | `buildPrompt` 未注入 agent 的 belief/confidence 状态 | reduce_weight / force_reflection / belief_perturbation 三类干预对 LLM 不可见 |
| D2 | `Promise.all` 并行发言导致本轮互不可见 | agent 只能看到上一轮的发言，无法实时回应 |
| D3 | 影响力网络从数值差推断边而非显式引用 | 虚假影响力连接，导致 reduce_weight 干预目标错误 |
| D4 | belief 更新规则过于简单（加权均值） | 信念演化不真实，影响检测器输入数据质量 |

**关键影响**：
- **D1 是最严重的**：所有涉及 belief/confidence 注入的干预实际从未到达 LLM。"reduce_weight"和"force_reflection"实际上是空操作
- **不受影响的结论**：baseline τ 值（无干预）、shuffle 对照（不含治理）、检测器检测模式（纯数学）
- **受影响的结论**：所有"治理 vs 无治理"的对比、所有单干预消融效果、因果效应估计

**追问准备**：
- "你为什么现在才发现？" → D1 在代码审查阶段发现。buildPrompt 的参数列表在开发初期确定，后来添加了 belief/confidence 追踪但没回过头更新 prompt 构建器
- "修复了吗？" → 架构方案已设计（StateInferenceBridge + PromptInjector），代码已实现并在 161 环路闭环实验中验证
- "为什么不在修复后重跑 V1 实验？" → 161 实验已是修复后重跑的 Crisis+Supplier，V1 的 Invest/M&A 任务重跑需实验室资源

---

### 4. 社会热力学 F 分解（核心创新点）[代码: governance/index.ts L554, utils/statsUtils.ts L110]

**是什么**：用社会自由能 F = (1-R) + T·H 将系统状态分解为两个正交的无序来源，驱动多检测器并发时的干预优先级排序。

**3 个状态变量**：

| 变量 | 物理含义 | 系统含义 | 计算 |
|------|---------|---------|------|
| R（序参量） | Kuramoto 同步度 | 信念方向同步程度 | `computeKuramotoOrder` |
| T（温度） | 热运动幅度 | 信念分散程度（标准差） | `normalizeTemperature(computeStd)` |
| H（熵） | 信息无序度 | 信念分布的不确定性 | `shannonEntropy` |

**F 分解的物理意义**：
- **(1-R) 结构性无序**：agent 信念方向未对齐。即使幅度很小（T 低），只要方向不同步，(1-R) 就高
- **T·H 热性无序**：agent 信念既分散（T 高）又分布广（H 高）。即使方向大致对齐（R 高），仍可能是噪声驱动的伪同步
- 两个分量**正交**：可同时高（极化+噪声）、同时低（真共识）、或一高一低（伪共识/伪极化）

**F 分解 → 干预映射**（层 1 已实现，回测状态见 §P1-11/12）：

| 干预类型 | 评分公式 | 对应无序分量 |
|---------|---------|------------|
| force_reflection | `thermal·(1-structural)`（原 `structural`，H1 证伪后修正） | 热性主导且非极化 |
| reduce_weight | `thermal` | 热性无序 |
| introduce_diversity | `R·(1-H)` | 虚假共识（高同步低熵） |
| continue_discussion | `R·(1-H)·(1-F)` | 过早收敛（H4 已证伪，已禁用） |

**核心代码**：

```typescript
private rankInterventionsByFreeEnergy(interventions, beliefs): Intervention[] {
  const R = this.computeKuramotoOrder(beliefs);
  const T = normalizeTemperature(this.computeStd(beliefs));
  const H = shannonEntropy(beliefs);
  const structural = 1 - R;
  const thermal = T * H;
  const alignmentScore = (type) => ({
    force_reflection: thermal * (1 - structural),
    reduce_weight: thermal,
    introduce_diversity: R * (1 - H),
    continue_discussion: R * (1 - H) * (1 - socialFreeEnergy(R, T, H)),
  }[type] ?? 0);
  return [...interventions].sort((a, b) => alignmentScore(b.type) - alignmentScore(a.type));
}
```

**追问准备**：
- "F 公式是推导的还是设计的？" → 借用 Helmholtz 自由能 F = U - TS 的形式，但**干预映射是设计假设**，不是推导结果。每个公式背后是可证伪的假设，已在 §3.1 THERMODYNAMICS_INTEGRATION.md 声明
- "为什么 F 分解能解决多检测器并发？" → 4 个检测器只识别"症状"（信念分散），无法识别"病机"（结构性 vs 热性无序）。F 分解提供"系统状态坐标系"，按病机匹配度排序干预
- "层 2/3 呢？" → 层 2（任务难度感知门控）和层 3（在线干预效果反馈）留实验室。层 2 原设计已推翻（"F 低→收紧阈值"会加剧天花板效应），改为 τ₁+ΔF 门控

---

### 5. H1 假设证伪数据链 [代码: experiments/v2/backtest_weight_assumption.ts]

**是什么**：原假设"force_reflection 主要作用于结构性无序"。回测证伪，修正为"force_reflection 是降噪干预"。

**数据链**（必须能背）：
- 事件总数：**97 次** force_reflection
- 结构性主导（1-R > T·H）：n=?，平均 Δτ = **-0.033**（有害）
- 热性主导（T·H ≥ 1-R）：n=?，平均 Δτ = **+0.115**（有益）
- 置换检验 p = **0.041**（< 0.05，显著）
- Cohen's d = **-0.49**（负值表示结构性组更差）

**物理解释**：
- force_reflection 强制 agent 反思自己的信念
- 在**结构性主导**（agent 方向不同步）时，反思会强化对立立场 → 加剧极化 → Δτ 为负
- 在**热性主导**（agent 信念分散但方向大致对齐）时，反思降低噪声 → Δτ 为正
- 因此 force_reflection 是**降噪干预**，不是**对齐方向干预**

**修正**：评分公式从 `structural` 改为 `thermal·(1-structural)`（热性主导且非极化时优先）

**追问准备**：
- "为什么 H1 证伪了还保留 F 分解？" → 证伪的是"force_reflection 对应结构性无序"这个假设，不是 F 分解本身。F 分解作为状态坐标系仍有效，只是修正了干预映射
- "回测是因果证据吗？" → 不是。观察性研究（agent 在不同 F-state 非随机分配），存在混杂。但方向性证据足够修正错误假设
- "97 事件够吗？" → 检验力有限，但 p=0.041 已达显著。Cohen's d=-0.49 是中等效应

---

### 6. Crisis 治理有效性证据（核心结论）

**是什么**：161 环路闭环实验中，Crisis 任务治理显著有效，Supplier 任务因天花板效应无效。

**Crisis 任务**（n=24/cell，扩展后）：
- full vs none：d = **0.92**（大效应），p = **0.005**（显著）
- power = **88%**（充分）
- τ 提升 **+51%**

**Supplier 任务**（n=30）：
- full vs none：d = **0.47**（中等），p = **0.089**（不显著）
- power = **43%**（不足）
- 方向一致但未达显著

**天花板效应解释**：
- Supplier 基线 τ = 0.68，已接近 full τ = 0.767
- 治理空间太小，任何干预都难以提升
- 这是**任务边界条件**，不是治理失败

**追问准备**：
- "为什么 Crisis 有效 Supplier 无效？" → 任务难度差异。Crisis（τ=0.41，难）有治理空间；Supplier（τ=0.68，易）已接近最优，治理无空间。这是 shuffle 边界条件的一致现象（见 §P0-7）
- "d=0.92 太大了，是不是 bug？" → 不是。Crisis 是困难任务，治理收益大。这跟 V1 时代 M&A shuffle d=1.80 的"破除专业过度自信"机制类似
- "为什么不在 Supplier 上停止干预？" → 这正是层 2（任务难度感知门控）要解决的：τ₁ 高 → dosage_scale 低 → 抑制干预

---

### 7. Shuffle 边界条件（Crisis 有效 vs Supplier 无效）[代码: experiments/v2/run.ts L322]

**是什么**：shuffle 模式对 agent knownItems 做**确定性 +2 旋转**（role 标签固定），作为安慰剂对照。在 Crisis 任务上有效，Supplier 任务上无效。

**结果**：
- **Crisis**：shuffle 显著有效，d = **1.44**（极大效应）
- **Supplier**：shuffle 无效，d = **0.09**（天花板效应）

**为什么任务依赖**：
- Crisis 任务难（τ=0.41），agent 专业知识分配不合理时决策差，shuffle 打乱知识 → 强制信息聚合 → 改善
- Supplier 任务易（τ=0.68 已接近 full），shuffle 无法突破天花板

**机制**（Crisis 上有效的两个可能解释）：
1. 破坏知识连贯性 → agent 无法独立判断 → 被迫倾听他人 → 信息聚合改善
2. 创造认知失调 → 偏见与知识不匹配 → agent 更可能修正初始偏见

**追问准备**：
- "shuffle 和 full 不是同一个安慰剂" → 正确批评。shuffle 改变了信息结构，不是纯粹的"做了事但没治理"。理想对照应该是"随机触发干预"（random-intervene 模式，已实现但数据来自断裂环路）
- "+2 旋转是什么？" → agent A 原 knownItems=[1,2,3]，shuffle 后=[3,1,2]。确定性（不是随机）保证可复现
- "为什么不旋转 initialBias？" → 已知设计缺陷。shuffle 只旋转 knownItems，没旋转 initialBias，导致偏见与知识不匹配——这可能是 shuffle 在 Crisis 上有效的部分原因

---

### 8. 161 vs 165 实验的关系

**是什么**：项目有两批实验数据，必须能区分。

| 批次 | 数量 | 环路状态 | 用途 |
|------|------|---------|------|
| **165 历史实验** | 165 | **断裂**（D1-D4 未修复） | V1 时代数据，README 上的 2×2 因子设计（Invest/M&A） |
| **161 环路闭环** | 161（Crisis 72 + Supplier 89） | **闭环**（D1-D4 已修复） | V2 可靠结论，Crisis d=0.92 p=0.005 |

**关键诚实声明**：
- README.md 上 Invest 3 轮 d=+0.65、M&A shuffle p=0.0009 等数据**全部来自 165 断裂实验**
- 这些数据已标注 caveat："These data were collected before the governance loop was fully repaired"
- 可靠结论来自 161 闭环实验（Crisis + Supplier）

**追问准备**：
- "为什么不把 V1 数据删掉？" → 科学诚信。保留断裂数据作为 provenance，标注 caveat 让读者自行判断。删掉等于隐瞒
- "161 实验够吗？" → Crisis n=24/cell 达到 power=88%，Supplier n=30 因天花板效应 power=43%。Supplier 的不足是任务特性，不是样本量
- "为什么 161 不是 165？" → 161 是 Crisis+Supplier 两个任务重跑。V1 的 Invest/M&A 任务因 API 成本未重跑，留实验室

---

### 9. 置换检验 (count+1)/(nPerms+1) 修正 [代码: analyze.ts L141]

**是什么**：置换检验是非参数假设检验。在零假设下（两组来自同一分布），合并后随机分配到两组，计算均值差，重复 10000 次，p-value = 置换中 |diff| ≥ |观测 diff| 的比例。

**为什么不用 t 检验**：
1. t 检验假设正态分布，但 Kendall's τ 高度偏态（τ ∈ [0,1] 且小样本下不近似正态）
2. n=15-30 属于极小样本，正态近似不可靠
3. 置换检验不需要分布假设，只依赖"可交换性"（exchangeability）

**(count+1)/(nPerms+1) 修正**（必须能答）：
- 如果不修正，当观测差比所有置换都极端时 p=0.000，这是**假阳性**
- Pesarin (2001) 证明正确公式是 `(count+1)/(nPerms+1)`，确保 p 永不为 0
- 10000 次置换下最小 p = 1/10001 ≈ 0.0001

**为什么不用 bootstrap p-value**：
- Bootstrap CI 用于估计置信区间在因果效应模块中是合理的（causalEffect.ts 使用 Bootstrap CI）
- 但主分析（analyze.ts）使用 t 分布 CI（小样本下更准确）+ 置换检验 p-value
- bootstrap p-value 存在循环推理问题：用数据本身生成分布来检验该数据的假设

**追问准备**：
- "exchangeability 假设是什么？" → 在零假设下，将样本标签打乱后的数据分布不变。对两组 τ 值，零假设是"治理没有效果"，此时 full 组和 none 组的 τ 值来自同一分布，标签可交换
- "为什么 10000 次？" → Pesarin 建议至少 1000 次以获得稳定估计，10000 次使 p 值精度到小数点后 4 位

---

### 10. Kendall's τ-b 与 tie 修正 [代码: analyze.ts, dataPackage.ts]

**是什么**：Kendall's τ-b 是秩相关系数，衡量两个排序的一致性。τ = (一致对数 - 不一致对数) / √((总对数-平局对数_x)(总对数-平局对数_y))。用它比较 agent 群体的最终排序与 ground truth 排序。

**为什么不用准确率**：
1. 排序任务没有"正确答案"的概念，只有"哪个比哪个好"
2. τ 惩罚顺序错误（把第 1 名排成第 3 名比排成第 2 名更严重）
3. τ-b 修正了平局情况，适合 5 选 5 的场景

**τ-a vs τ-b**（必须能答）：
- **τ-a**：分母是总对数 n(n-1)/2，不修正平局。当存在平局时 τ-a 被低估
- **τ-b**：分母是 √((n-平局_x)(n-平局_y))，修正平局。项目统一用 τ-b
- 项目曾混用 τ-a 和 τ-b，已在 dataPackage.ts 统一为 τ-b 保持一致性

**τ 范围**：[-1, 1]，但实际实验中 τ ∈ [0, 1]（agent 不会完全反向排序）

**追问准备**：
- "为什么不用 Spearman ρ？" → Spearman 用排序值的 Pearson 相关，对异常值更敏感。Kendall 用对偶比较，更稳健。小样本（n=5 items）下 Kendall 效率更高
- "τ 和 Spearman 的关系？" → τ ≈ (π/4) × ρ ≈ 0.79ρ。大多数情况方向一致但 τ 数值更小

---

## P1 — 诚信底线

---

### 11. H2 假设回测结果（方向支持但不显著）

**是什么**：假设"reduce_weight 主要作用于热性无序"。回测方向支持但**未达显著**，已诚实降级。

**数据链**：
- 事件总数：**85 次** reduce_weight
- 热性主导：n=67，平均 Δτ = **+0.182**（有益）
- 结构性主导：n=18，平均 Δτ = **+0.067**（弱益）
- 置换检验 p = **0.100**（> 0.05，**不显著**）
- Cohen's d = **+0.448**（正方向支持）

**为什么未显著**：
- 样本不均衡：85 事件中仅 18 个结构性主导，检验力被拉低
- 方向一致（热性 Δτ > 结构性 Δτ）但抽样波动未排除

**文档状态**：所有文档已从"✅ 方向支持"降级为"⚠️ 方向支持但不显著（p=0.100）"。**不能称为"证实"**，仅"方向一致"。

**追问准备**：
- "为什么还保留 reduce_weight↔thermal 映射？" → 方向一致是弱证据，p=0.100 接近 0.05。保留映射但标注未证实，待实验室重跑更大样本
- "是不是 p-hacking？" → 不是。我们在 H1 证伪后主动对 H2 做同等标准回测，发现未显著后诚实降级。这是诚信，不是 p-hacking

---

### 12. H3-H4 假设状态

| 假设 | 状态 | 数据 |
|------|------|------|
| H1 force_reflection↔structural | ❌ 证伪+修正 | 97 events, p=0.041, d=-0.49 |
| H2 reduce_weight↔thermal | ⚠️ 方向支持不显著 | 85 events, p=0.100, d=+0.448 |
| H3 introduce_diversity↔R·(1-H) | ⏳ 未回测 | echo chamber 难触发，样本不足 |
| H4 continue_discussion↔R·(1-H)·(1-F) | ❌ 证伪+禁用 | 0% 有效率，Δτ=-0.400 |

**H4 证伪细节**：
- continue_discussion 在 Crisis 任务上 **0% 有效率**
- 平均 τ 变化 **-0.400**（有害）
- 已通过 `disabledInterventions` **硬编码禁用**
- 层 3（在线反馈）将替代硬编码为自适应降权

**H3 未回测原因**：
- introduce_diversity 触发依赖 echo chamber 检测器
- echo chamber 在 161 实验中难触发，样本不足
- 这是已知局限，留实验室

**追问准备**：
- "H3 没回测就保留映射，是不是偏见？" → 是诚实标注。H3 的盲区已在 THERMODYNAMICS_INTEGRATION.md §3.1 声明：R·(1-H) 无法区分真共识与虚假共识，需层 3 解决
- "为什么 H4 直接禁用而不是降权？" → 0% 有效率 + 负 Δτ 是强证据。硬编码禁用是保守决策，层 3 会替代为按 F-state 自适应

---

### 13. normalizeTemperature 显式化修复 [代码: utils/statsUtils.ts L100]

**是什么**：新增 `normalizeTemperature` 函数，将 T 的隐式归一化显式化。

**为什么需要**：
- F = (1-R) + T·H 中，R∈[0,1]、H∈[0,1] 已归一化，T 必须同量纲才能让两个无序分量可比
- **关键细节**：在当前 belief 范围 [-1,1] 下，T（总体标准差）**数学上已经在 [0,1] 内**——因为 var ≤ E[X²] ≤ 1（|X|≤1）
- 所以"T·H 远大于 (1-R) 的量纲失衡"在当前 belief 范围下**实际不会发生**
- 缺陷在于：归一化是**隐式的**（依赖 belief 边界），代码未显式化、未文档化，belief 范围一变就失控

**修复代码**：

```typescript
export function normalizeTemperature(
  std: number,
  beliefRange: [number, number] = [-1, 1]
): number {
  const maxStd = (beliefRange[1] - beliefRange[0]) / 2;
  if (maxStd <= 0) return 0;
  return Math.min(1, Math.max(0, std / maxStd));
}
```

**定性**：这是**健壮性修复**（隐式→显式 + 防御范围扩展），**不是**正在导致结果偏差的硬伤——当前 belief∈[-1,1] 下归一化前后数值不变（上界=1.0）。但显式化是必要的：测试已默认 T∈[0,1]（如 `socialFreeEnergy(0, 0.8, 1)`），生产代码若不显式归一化则与测试假设脱耦。

**追问准备**：
- "这是硬伤吗？" → 不是。是健壮性修复。当前 belief 范围下数值不变，但显式化避免 belief 范围扩展时失控
- "调用点在哪？" → governance/index.ts:561 和 evaluation/index.ts:104

---

### 14. PromptInjector [GOV] 伪造漏洞修复

**是什么**：agent 可在输出中伪造 [GOV] 标签（prompt injection），导致 StateInferenceBridge 提取错误 belief 数据。

**原漏洞**：
- PromptInjector 要求 agent 在输出末尾附加 `[GOV] belief=0.65 confidence=80 referencedAgents=agent_2,agent_3`
- agent 可输出任意 belief 值（伪造）
- 原代码用 `/\[GOV\]/g` 匹配，会提取 agent 推理文本中**任何位置**的 [GOV] 标签
- 攻击者可在推理中引用 `[GOV] belief=1.0` 来欺骗检测器

**修复**：正则改为 `/(^|\n)[ \t]*\[GOV\]/g`，只匹配**行首**的 [GOV] 标签
- agent 推理文本中的 [GOV] 不会被误提取
- 只有 agent 真正在行首输出的 [GOV] 标签才被解析

**追问准备**：
- "这对实验结论有影响吗？" → 有。如果 agent 伪造 [GOV] 标签，StateInferenceBridge 提取的 belief 数据是错误的，会导致检测器误判和干预方向错误。但实验中未观测到明显的标签伪造行为
- "为什么不在输入侧防护？" → 可以加正则过滤，但攻击者可用编码绕过。真正解决方案是在 LLM 层面做输出验证，超出当前项目范围

---

### 15. H4 Kuramoto 相位映射修复 [文档: MATHEMATICAL_FRAMEWORK.md L171-L186]

**是什么**：Kuramoto 序参量 R 衡量 agent 信念的"同步程度"。将信念 b ∈ [-1,1] 映射到单位圆上的相位角 θ，计算向量和的模。

**H4 修复**（必须能答）：
- **旧映射** `θ = π·b`：
  - b = +0.99 → θ ≈ +0.99π（单位圆左侧 (-1, 0) 附近）
  - b = -0.99 → θ ≈ -0.99π（同样在左侧 (-1, 0) 附近）
  - 两个极端对立的信念在单位圆上几乎重合 → R ≈ 1（**误判为高共识**）
- **修复后** `θ = (π/2)·b`：
  - b = -1 → θ = -π/2（正下方）
  - b = +1 → θ = +π/2（正上方）
  - 极端对立时相位差 = π → R ≈ 0（正确反映极化）
  - 全部一致时相位重合 → R ≈ 1（正确反映共识）

**追问准备**：
- "Kuramoto 模型的原始用途是什么？" → Kuramoto (1975) 用于描述耦合振子的同步现象，如萤火虫闪烁同步、心跳起搏细胞同步。我们借用其数学框架衡量信念"同步"
- "为什么要映射到单位圆？" → 信念是线性的 [-1,1]，但共识需要衡量"方向一致性"。映射到单位圆后用向量和的模可以自然地衡量方向一致性

---

### 16. 实验设计：2×2 + 7 消融 + shuffle 对照 [代码: experiments/v2/run.ts]

**2×2 因子设计**（V1 时代，165 实验）：
- 因子 1：任务类型（Invest 投资排序 vs M&A 并购决策）
- 因子 2：讨论轮数（3 轮 vs 5 轮）
- 每格 n = 15

**7 种消融模式**：

| 模式 | 含义 |
|------|------|
| none | 无治理（基线） |
| full | 全部 4 种检测器 + 4 种干预 |
| shuffle | 洗牌知识分配（安慰剂对照） |
| full_diversity | 仅 echo chamber 检测 + diversity 干预 |
| full_weight | 仅 authority bias 检测 + weight 干预 |
| full_reflection | 仅 polarization 检测 + reflection 干预 |
| full_continue | 仅 premature consensus 检测 + continue 干预 |

**161 闭环实验设计**（V2，Crisis + Supplier）：
- Crisis 72 实验：n=24/cell，full vs none vs shuffle
- Supplier 89 实验：n=30，full vs none vs shuffle
- 环路修复后重跑

**为什么需要 shuffle 对照**：
- 治理改善可能只是因为"多做了点事"（Hawthorne 效应）或讨论自然改善（regression to mean）
- shuffle 打乱 agent 专业知识分配但不含治理逻辑——如果 shuffle 也改善，说明改善不来自治理

**追问准备**：
- "n=15 够吗？" → 不够。按 power analysis（α=0.05, power=0.8, d=0.5），每组需要 ~64 样本。15 只能检测 d>1.0 的大效应。这是已知局限。V2 的 Crisis n=24 达到 power=88%
- "shuffle 和 full 不是同一个安慰剂" → 正确批评。shuffle 改变了信息结构，不是纯粹的"做了事但没治理"。理想对照应该是"随机触发干预"（random-intervene 模式，已实现但数据来自断裂环路）

---

### 17. mulberry32 PRNG + seed [代码: governance/index.ts, custom.ts, analyze.ts]

**是什么**：项目中有三处需要随机数，全部使用 mulberry32 PRNG 替代 Math.random()：
1. GovernanceEngine 的干预序列生成（seed 来自 GovernanceRuntime）
2. CustomAgent 的初始信念（seed 来自 llmConfig.seed + hashAgentId）
3. Bootstrap/置换检验（固定 seed=42）

**为什么用 mulberry32**：
- `Math.random()` 基于 V8 的 PRNG，不可通过种子复现
- mulberry32 是确定性 PRNG：相同 seed 永远产生相同序列
- 选择 mulberry32 而非更复杂的算法（如 xorshift128+）是因为：代码极短（8 行）、速度足够、统计性质满足实验需求

**三组 bootstrap seed 分离**：
- `bootstrapCI`: seed = 42
- `bootstrapMeanDiff`: seed = 42 + 0x5EED
- `permutationTest`: seed = 42 + 0x50E8
- 确保三组随机数流不重叠，避免相关性

**追问准备**：
- "为什么不用 crypto.randomBytes？" → 那是密码学安全的随机数，但不可复现。实验需要的是可复现性，不是密码学安全性
- "mulberry32 的统计性质够吗？" → 它通过了 TestU01 的 SmallCrush 浙试。对于实验中的蒙特卡洛模拟（10000 次重采样），足够

---

### 18. 信念演化动力学 [文档: MATHEMATICAL_FRAMEWORK.md L108-L161]

**是什么**：agent 的信念每轮按三股力量更新：

$$b_i^{(t)} = \text{clip}_{[-1,1]}\left(b_i^{(t-1)} + \Delta b_i^{\text{peer}} + \Delta b_i^{\text{maj}} + \Delta b_i^{\text{inf}}\right)$$

| 力量 | 公式 | 参数 | 含义 |
|------|------|------|------|
| 同伴均值拉力 | Δb_peer = (b̄_H - b_i)·β_H + (b̄_L - b_i)·β_L | β_H=0.3, β_L=0.1 | 高置信同伴（>70）拉力更强 |
| 多数效应 | Δb_maj = b̄_{-i}·γ + δ | γ_agr=0.1, δ_agr=5 | 从众效应的简化模型 |
| 影响力扩散 | Δb_inf = Σ w_{s→i}·(b_s - b_i)·κ | κ_ref=0.5, κ_per=0.6 | 图中每条入边施加的信念拉力 |

**为什么用三股力量而非简单加权均值**：
- 同伴拉力模拟"高置信者更有说服力"的社会心理学发现（Asch 从众实验）
- 多数效应模拟群体压力
- 影响力扩散模拟信息在社交网络中的传播
- 但这是**启发式模型**，不是基于实证数据拟合的

**追问准备**：
- "这些参数怎么来的？" → 启发式设定。β_H/β_L 的比例参考了社会影响力研究中的"信源可信度"效应，但具体数值未经拟合
- "收敛性证明了吗？" → 没有。三股力量的组合可能发散，但 clip 到 [-1,1] 保证有界。实际实验中 5 轮内都会收敛到 σ < 0.06

---

### 19. BH FDR 校正 [代码: analyze.ts L461-L484]

**是什么**：当同时检验多个假设时，假阳性率膨胀。4 个单干预消融各做一次检验，α=0.05 时至少一个假阳性的概率 = 1-(0.95)^4 = 18.5%。

**两种校正方法**：
1. **Bonferroni**：α' = α/n。最保守，控制 FWER（族错误率）。4 个检验时 α' = 0.0125
2. **Benjamini-Hochberg (BH)**：标准 step-down procedure。按 p 值排序，第 k 大的 p 值与 (α×k)/n 比较。控制 FDR（假发现率），比 Bonferroni 宽松

**BH step-down 标准流程**（必须能答）：
1. 将 m 个 p 值按升序排列：p(1) ≤ p(2) ≤ ... ≤ p(m)
2. 找到最大的 i 使得 p(i) ≤ (i/m)·q
3. 拒绝所有 j ≤ i 的假设（即 p(1), p(2), ..., p(i) 全部拒绝）

**为什么同时报告两种**：
- Bonferroni 最保守，适合"不愿有假阳性"的场景
- BH 更平衡，适合探索性研究
- 同时报告让读者自行选择严格程度

**追问准备**：
- "FWER 和 FDR 的区别？" → FWER = 至少一个假阳性的概率；FDR = 被称为显著的结果中假阳性的期望比例。FDR 控制更宽松但更适合探索性研究
- "为什么不删掉不显著的检验？" → 那是 p-hacking。所有预设的检验都应该报告，无论是否显著

---

## P2 — 可委托/教授可能追问

---

### 20. 5 维评估体系 [代码: constants.ts L160-L166, evaluation/index.ts]

| 维度 | 权重 | 核心方法 |
|------|------|---------|
| Consensus (共识度) | 0.20 | Kuramoto 序参量 R + 信念标准差 + Jaccard 一致率 |
| Reliability (可靠性) | 0.25 | 平均置信度 + 一致性 + Cronbach's α + 可重复性 |
| Dispersion (离散度) | 0.20 | 信念离散度 + 置信度离散度 + 回合间变动 |
| Stability (稳定性) | 0.17 | 回合间一致性 + 时间序列稳定性 |
| Influence Analysis (影响力) | 0.18 | 逆 Gini 系数 + 影响力密度 + 逆路径长度 |

**为什么从 7 维减到 5 维**：原 7 维中有两个被移除：
- Explainability（可解释性）：基于推理长度启发式，无学术依据
- Manipulation Resistance（抗操纵性）：将一致性误判为抗操纵性，逻辑缺陷

**追问准备**：
- "Cronbach's α 在这里的语义是什么？" → 原始定义是心理测量学中量表内部一致性，我们用轮次作为 item 测量 agent 决策的跨轮次一致性。这个概念迁移有争议——轮次不是量表 item，α 的语义在这里不是严格的"内部一致性"
- "权重为什么是这些值？" → 启发式。Reliability 权重最高(0.25)因为我们认为决策可靠性最重要。权重未经因子分析或专家排序校准

---

### 21. Cohen's d 和效应量解释

**是什么**：Cohen's d = (μ_A - μ_B) / σ_pooled，其中 σ_pooled = √[((n_A-1)σ²_A + (n_B-1)σ²_B) / (n_A+n_B-2)]

**解释标准**（Cohen 1988）：
- d < 0.2：微小效应
- d ≈ 0.5：中等效应
- d > 0.8：大效应
- d > 1.3：极大效应

**项目中的关键效应量**：
- Crisis full vs none: d = +0.92（大，p=0.005 显著）
- Supplier full vs none: d = +0.47（中等，p=0.089 不显著）
- Crisis shuffle: d = +1.44（极大）
- H1 force_reflection: d = -0.49（中等，证伪方向）
- H2 reduce_weight: d = +0.448（中等，方向支持但不显著）

**方向约定**：代码中 cohensD(a, b) = (mean(a) - mean(b)) / pooled_sd，即正值表示 a > b。analyze.ts 中统一用 `cohensD(treatment, baseline)`

**追问准备**：
- "d=0.92 但 p=0.005，怎么解释？" → 大效应且显著。Crisis n=24 达到 power=88%，结论可靠
- "为什么不用 Hedges' g？" → Hedges' g 对小样本有偏差校正，但校正量在 n=24 时仅约 3%。我们的 cohensD 用样本标准差（n-1 分母），已经是无偏估计

---

### 22. 影响力网络设计：仅显式引用 [代码: discussion/influence.ts]

**是什么**：影响力网络的边仅来源于 agent 输出中的 `referencedAgents` 字段（显式引用），不从信念差值推断边。

**为什么**：
- 信念差值大不等于有影响力——两个 agent 可能独立地持有不同观点
- 显式引用是 agent 自主表达"我受到了谁的影响"，语义更明确
- 从数值差推断边会导致虚假连接，使 reduce_weight 干预目标错误（D4 缺陷的根源）

**追问准备**：
- "如果 agent 不输出 referencedAgents 怎么办？" → 网络中该 agent 没有出边，但仍可被其他 agent 引用（入边）。这是信息损失但不会产生虚假边
- "子串匹配回退会不会误判？" → 会。如果 agent 名字是 "A" 而推理文本中出现了 "Agent A"，子串匹配会误判。但这是回退策略，主路径是显式字段

---

### 23. 因果效应估计方法 [代码: analysis/causalEffect.ts]

**是什么**：使用最近邻轨迹匹配 + 置换检验 + Bootstrap CI 估计干预的因果效应。

**方法步骤**：
1. 对每个被干预的实验（处理组），在未被干预的实验中找轨迹最相似的对照组（最近邻，距离 = 前置轮次 τ 轨迹的欧氏距离）
2. 计算处理组 vs 对照组的 τ 差值（ATT: Average Treatment Effect on Treated）
3. 置换检验计算 p 值
4. Bootstrap 计算 95% CI

**为什么不直接用组间均值差**：
- 处理组和对照组的基线 τ 可能不同（选择性偏差）
- 轨迹匹配控制了前置轮次的趋势，更接近因果效应

**已知局限**（文档已标注）：
1. 前置期太短（仅 1-2 轮），轨迹匹配质量差
2. 小样本（n=15-30/cell），统计功效不足
3. SUTVA 假设可能不成立（一个 agent 被干预可能影响其他 agent）
4. 历史数据来自断裂环路，处理组实际未受到有效干预

**追问准备**：
- "为什么不用 DID（双重差分）？" → DID 需要面板数据和对照组的平行趋势假设。我们只有 3-5 轮，且处理组和对照组的轨迹趋势不一定平行
- "SUTVA 是什么？" → Stable Unit Treatment Value Assumption，假设一个个体的处理状态不影响另一个个体的结果。在多 agent 讨论中，干预一个 agent 会通过讨论传播影响其他 agent，所以 SUTVA 可能不成立

---

### 24. 框架适配器模式 [代码: adapters/index.ts, adapters/custom.ts]

**是什么**：定义统一的 `FrameworkAdapter` 接口，支持将治理运行时嵌入不同 multi-agent 框架。

**已实现**：CustomAdapter（完整实现）、AutoGenAdapter（部分实现）
**未实现**：CrewAIAdapter、LangGraphAdapter（文档标注为 planned）

**设计原则**：
- 适配器层将不同框架的消息格式转换为 SwarmAlpha 的 `DiscussionMessage` 格式
- 治理逻辑只依赖 DiscussionMessage，不依赖具体框架
- 不支持的框架返回明确错误，不静默降级为 CustomAdapter

**追问准备**：
- "AutoGen 适配器实现了多少？" → 消息格式转换已实现，但 agent 生命周期管理和轮次切分策略未完成
- "为什么不用 AutoGen 原生的治理机制？" → AutoGen 没有过程治理机制。它有 `ConversableAgent` 的 `human_input_mode`，但那是人机交互不是认知偏差检测

---

### 25. StateInferenceBridge [代码: runtime/adapters/StateInferenceBridge.ts]

**是什么**：当 agent 输出中缺少结构化的 belief/confidence 字段时，StateInferenceBridge 提供三级提取：
1. **Level 1**：直接从 JSON 输出提取 belief/confidence 字段
2. **Level 2**：从 [GOV] 标签提取（agent 被要求在输出末尾附加 [GOV] 标签）
3. **Level 3**：回退到 LLM 推断（向 LLM 发送 agent 输出，请求推断 belief/confidence）

**为什么需要三级**：
- Level 1 覆盖正常情况（agent 遵守 JSON 格式）
- Level 2 覆盖 agent 被 PromptInjector 要求附加 [GOV] 标签的情况
- Level 3 是兜底方案，保证即使 agent 完全不输出结构化数据也能提取状态

**关键修复**：当未提供 callback 时返回 false 并触发 alerts，而非静默失败

**追问准备**：
- "LLM 推断 belief 的准确率如何？" → 未验证。这是已知局限。理论上 Level 3 是最后手段，正常情况下 Level 1 应该覆盖 95%+ 的输出
- "为什么不让 agent 直接在 JSON 里输出 belief？" → 我们要求了，但不是所有 LLM 都遵守。StateInferenceBridge 是防御层

---

### 26. 自适应阈值（已实现但默认禁用）[代码: governance/adaptiveThresholds.ts]

**是什么**：`computeAdaptiveThresholds` 函数根据校准数据动态调整 4 个检测器的阈值，替代硬编码常量。

**为什么默认禁用**：
1. **校准逻辑缺陷**：使用真实任务的第一轮作为校准数据，但第一轮数据含有任务特性（如投资任务的天然保守倾向），会污染基线测量
2. **未经验证**：没有实验证明自适应阈值比固定阈值更好
3. **实验对照**：之前的 161 次实验都用固定阈值，混用会破坏可比性

**正确做法**：
- 应该用独立的校准轮次（简单的无争议问题）作为基线
- 或者用 A/B 测试对比固定 vs 自适应阈值的效果

**追问准备**：
- "为什么不在修复后直接启用？" → 需要重跑所有实验，API 成本限制。且需要先验证自适应阈值确实更好
- "层 2 的 τ₁ 门控和自适应阈值是一回事吗？" → 不是。自适应阈值调"检测到什么"，层 2 调"是否该干预"。层 2 的 τ₁ 是门控信号不是校准数据，避开了原缺陷

---

### 27. 收敛条件的设计

**是什么**：讨论在以下任一条件满足时终止：
1. 达到最大轮数 T_max（3 或 5）
2. 信念标准差 σ(b) < θ_conv = 0.06

**为什么 θ_conv = 0.06**：
- 5 个 agent 的信念标准差，如果全部在 0.1 的窄带内（如 [0.7, 0.8]），σ ≈ 0.05
- 0.06 比这稍宽松，允许轻微分歧时仍判为收敛
- 但实际实验中，由于低温度（0.2）和从众效应，σ 几乎总是快速降到 0.06 以下

**局限**：θ_conv = 0.06 非常低，导致实验几乎总是跑满 5 轮。好处是轮数一致消除混淆，坏处是 premature consensus 检测器失去意义——如果永远不提前收敛，"过早共识"不会触发。

**追问准备**：
- "为什么不设高一点？" → 设高（如 0.15）会导致 2 轮就收敛，信息交换不充分。0.06 是在"足够讨论"和"不浪费时间"之间的折中
- "premature consensus 检测器还有用吗？" → 在 3 轮实验中，第 2 轮可能触发。在 5 轮实验中几乎不会触发。这是设计局限

---

### 28. t 分布临界值表 [代码: analyze.ts, powerAnalysis.ts, mechanismAnalysis.ts]

**是什么**：小样本 CI 用 t 分布而非正态近似。代码中有 df=1 到 30 的 t 临界值表（已完全填充，消除线性插值误差）。

**为什么不用正态近似**：
- 正态近似在 n ≥ 30 时才可靠
- 我们 n=15-30，t 分布的尾部更厚，CI 更宽，更保守
- t 分布的 df = n-1，t_critical = 2.145（vs 正态的 1.96）

**Welch 校正**（小样本精度）：
- bayesianAnalysis.ts 中 Welch p-values 包含 t_critical/z_critical 修正因子
- df = (s_A²/n_A + s_B²/n_B)² / [(s_A²/n_A)²/(n_A-1) + (s_B²/n_B)²/(n_B-1)]，不假设等方差

**追问准备**：
- "为什么不用 scipy 的 t.ppf？" → 这是 TypeScript 项目，没有 scipy。手写查表是合理替代方案
- "为什么 1-30 整数填充？" → 原代码用线性插值，但 t 分布在低 df 区非线性强，插值误差大。1-30 整数填充消除插值误差

---

### 29. 安全 JSON 解析 [代码: utils/jsonUtils.ts]

**是什么**：`safeJsonParse` 函数处理 LLM 输出的 JSON 格式问题：
1. 先尝试直接 `JSON.parse`
2. 失败则移除 markdown 代码块标记（```json ... ```）
3. 失败则尝试提取第一个 `{...}` 块
4. 全部失败返回 null

**为什么需要**：
- LLM 经常在 JSON 外面包 markdown 代码块
- LLM 可能在 JSON 前后加解释性文字
- LLM 可能生成不完整的 JSON（截断）

**使用位置**：observation/index.ts（解析 agent 输出）、providers.ts（解析 LLM 响应）、pipeline.ts（解析配置）

**追问准备**：
- "为什么不强制 LLM 输出合法 JSON？" → 我们在 prompt 中要求了 JSON 格式，但 temperature=0.2 下仍有约 5% 的输出不合规。safeJsonParse 是防御性编程
- "返回 null 不会导致后续崩溃吗？" → 调用方检查 null 后回退到默认值（如当前 belief 保持不变）。ObservationLayer 的 parseOpinion 有完整的 catch 分支

---

## 附：关键数值速记

| 参数 | 值 | 含义 |
|------|-----|------|
| **测试数** | **229** | 单元测试数量（全过） |
| **161 实验数** | 161（Crisis 72 + Supplier 89） | 环路闭环实验 |
| **165 实验数** | 165 | V1 历史实验（环路断裂） |
| **Crisis d** | 0.92（p=0.005） | 治理显著有效 |
| **Supplier d** | 0.47（p=0.089） | 天花板效应，不显著 |
| **Crisis shuffle d** | 1.44 | 极大效应 |
| **Supplier shuffle d** | 0.09 | 天花板效应，无效 |
| **H1** | p=0.041, d=-0.49, n=97 | 证伪+修正 |
| **H2** | p=0.100, d=+0.448, n=85 | 方向支持不显著 |
| **H4** | 0%有效率, Δτ=-0.400 | 证伪+禁用 |
| θ_conv | 0.06 | 收敛阈值（信念标准差） |
| θ_echo | 0.50 | 回音室检测阈值 |
| θ_auth | 0.25 | 权威偏置检测阈值 |
| θ_pol | 0.30 | 极化检测阈值 |
| θ_premature | 0.35 | 过早共识进度阈值 |
| BC_threshold | 0.555 | 双峰系数阈值 |
| β_H / β_L | 0.3 / 0.1 | 高/低置信同伴拉力系数 |
| η | 0.3 | 影响力图衰减因子 |
| α_agr / α_dis / α_ref / α_per | 0.8 / 0.5 / 0.7 / 0.6 | 四种影响力权重系数 |
| κ_agr / κ_dis / κ_ref / κ_per | 0.4 / 0.2 / 0.5 / 0.6 | 信念更新中的影响力系数 |
| temperature | 0.2 | LLM 采样温度 |
| N_BOOT | 10000 | Bootstrap 重采样次数 |
| N_PERM | 10000 | 置换检验次数 |
| RNG_SEED | 42 | 统计分析随机种子 |
| **Kuramoto θ** | **(π/2)·b** | H4 修复后（原 π·b） |
| **F 公式** | **(1-R) + T·H** | 社会自由能 |
| **shuffle 机制** | **+2 旋转 knownItems** | 确定性，role 固定 |

---

## 引用文档

- [THERMODYNAMICS_INTEGRATION.md](./THERMODYNAMICS_INTEGRATION.md) — 社会热力学三层联合架构详解
- [LIMITATIONS.md](./LIMITATIONS.md) — 已知局限与诚实声明
- [MATHEMATICAL_FRAMEWORK.md](./MATHEMATICAL_FRAMEWORK.md) — 数学框架
- [RESEARCH_STATEMENT.md](./RESEARCH_STATEMENT.md) — 研究声明（90 行精简版）
- [SCIENTIFIC_CONTRIBUTIONS.md](./SCIENTIFIC_CONTRIBUTIONS.md) — 科学贡献
- [ROADMAP.md](./ROADMAP.md) — 实验室路线图
- [ONEPAGER.md](./ONEPAGER.md) — 项目概述（唯一）
