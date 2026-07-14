# 面试知识点备忘录

> 按教授提问概率从高到低排列。每个知识点标注：**是什么**、**为什么这样做**、**可能被追问什么**。
>
> 标注 [代码] 的表示有对应代码实现，标注 [文档] 的表示有对应文档。

---

## P0 — 教授必问（答不上来会严重扣分）

---

### 1. 项目一句话定位

**是什么**：为 LLM 多 agent 协作决策提供实时过程治理——在共识形成过程中检测极化、权威偏置、回声室、过早共识四类偏差并施加干预，确保少轮次讨论的决策质量。

**为什么**：现有 multi-agent 框架（AutoGen/CrewAI/LangGraph）只管 agent 怎么对话，不管对话过程是否健康。当 5 个 LLM agent 讨论 3-5 轮做投资决策时，可能在第 2 轮就因互相附和而过早收敛，或因某个 agent 发言过多而产生权威偏置。

**追问准备**：
- "这跟 moderation 有什么区别？" → Moderation 是事后过滤有害内容，过程治理是实时检测认知偏差并干预决策过程
- "这跟 RLHF 有什么区别？" → RLHF 训练阶段对齐单个模型，我们是推理阶段治理多个模型之间的交互

---

### 2. 四类认知缺陷及其检测方法 [代码: governance/index.ts]

| 缺陷 | 检测方法 | 阈值 | 干预策略 |
|------|---------|------|---------|
| **回音室** (Echo Chamber) | 信息冗余度 ρ = 0.5×(1-σ_norm) + 0.5×内容Jaccard相似度 | ρ ≥ 0.50 | introduce_diversity（注入差异化观点） |
| **权威偏置** (Authority Bias) | influenceRatio = max(被引用次数) / total(被引用次数) | ratio ≥ 0.25 | reduce_weight（降低该agent影响力权重） |
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

### 3. 实验设计：2×2 因子 + 7 消融 + 洗牌对照 [代码: experiments/v2/run.ts]

**2×2 因子设计**：
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

**为什么需要 shuffle 对照**：
- 治理改善可能只是因为"多做了点事"（Hawthorne 效应）或讨论自然改善（regression to mean）
- shuffle 打乱 agent 专业知识分配但不含治理逻辑——如果 shuffle 也改善，说明改善不来自治理
- 结果：M&A 任务 shuffle 显著优于 baseline（p=0.0009），但 full 不显著优于 shuffle，说明治理的边际贡献不确定

**追问准备**：
- "n=15 够吗？" → 不够。按 power analysis（α=0.05, power=0.8, d=0.5），每组需要 ~64 样本。15 只能检测 d>1.0 的大效应。这是已知局限
- "为什么不用交叉验证？" → 我们不是训练模型，是评估干预效果。实验设计的核心是组间对照，不是模型泛化
- "shuffle 和 full 不是同一个安慰剂" → 正确批评。shuffle 改变了信息结构，不是纯粹的"做了事但没治理"。理想对照应该是"随机触发干预"（random-intervene 模式，已实现但数据来自断裂环路）

---

### 4. 治理环路断裂（D1-D4）及其影响 [文档: LIMITATIONS.md]

**4 个认知缺陷**：
| 编号 | 缺陷 | 影响 |
|------|------|------|
| D1 | `buildPrompt` 未注入 agent 的 belief/confidence 状态 | reduce_weight / force_reflection / belief_perturbation 三类干预对 LLM 不可见 |
| D2 | `Promise.all` 并行发言导致本轮互不可见 | agent 只能看到上一轮的发言，无法实时回应 |
| D3 | 影响力网络从数值差推断边而非显式引用 | 虚假影响力连接，导致 reduce_weight 干预目标错误 |
| D4 | belief 更新规则过于简单（加权均值） | 信念演化不真实，影响检测器的输入数据质量 |

**关键影响**：
- **D1 是最严重的**：它意味着所有涉及 belief/confidence 注入的干预实际从未到达 LLM。agent 的 prompt 里没有自己的 belief 状态，所以"reduce_weight"和"force_reflection"实际上是空操作
- **不受影响的结论**：baseline τ 值（无干预）、shuffle 对照（不含治理）、检测器检测模式（纯数学）
- **受影响的结论**：所有"治理 vs 无治理"的对比、所有单干预消融效果、因果效应估计

**追问准备**：
- "你为什么现在才发现？" → D1 在代码审查阶段发现。buildPrompt 的参数列表在开发初期确定，后来添加了 belief/confidence 追踪但没回过头更新 prompt 构建器
- "修复了吗？" → 架构方案已设计（StateInferenceBridge + PromptInjector），代码已实现但实验未重跑
- "为什么不在修复后重跑？" → 需要 DeepSeek API 配额（165 次实验 × ~50 轮调用 = ~8000 次 API 调用），成本和时间限制

---

### 5. 统计方法选择：为什么用置换检验而非 t 检验 [代码: analyze.ts L121-L142]

**是什么**：置换检验（permutation test）是一种非参数假设检验方法。原理是在零假设下（两组来自同一分布），合并后随机分配到两组，计算均值差，重复 10000 次，p-value = 置换中 |diff| ≥ |观测diff| 的比例。

**为什么不用 t 检验**：
1. t 检验假设数据服从正态分布，但 Kendall's τ 的分布是高度偏态的（τ ∈ [0,1] 且在小样本下不近似正态）
2. n=15 属于极小样本，正态近似不可靠
3. 置换检验不需要分布假设，只依赖"可交换性"（exchangeability）——在零假设下两组标签可交换

**为什么不用 bootstrap p-value**：
- Bootstrap CI 用于估计置信区间是正确的
- 但 bootstrap p-value 存在循环推理问题：用数据本身生成分布来检验该数据的假设
- 正确做法：bootstrap CI + 置换检验 p-value（我们就是这样做的）

**(count+1)/(nPerms+1) 修正** [analyze.ts L141]：
- 如果不修正，当观测差比所有置换都极端时 p=0.000，这是假阳性
- Pesarin (2001) 证明正确公式是 (count+1)/(nPerms+1)，确保 p 永不为 0
- 10000 次置换下最小 p = 1/10001 ≈ 0.0001

**追问准备**：
- "exchangeability 假设是什么？" → 在零假设下，将样本标签打乱后的数据分布不变。对两组 τ 值，零假设是"治理没有效果"，此时 full 组和 none 组的 τ 值来自同一分布，标签可交换
- "为什么 10000 次？" → Pesarin 建议至少 1000 次以获得稳定估计，10000 次使 p 值精度到小数点后 4 位

---

### 6. Kendall's τ 作为决策质量指标 [代码: analyze.ts]

**是什么**：Kendall's τ-b 是一种秩相关系数，衡量两个排序的一致性。τ = (一致对数 - 不一致对数) / √((总对数-平局对数_x)(总对数-平局对数_y))。我们用它比较 agent 群体的最终排序与 ground truth 排序。

**为什么不用准确率**：
1. 排序任务没有"正确答案"的概念，只有"哪个比哪个好"
2. τ 惩罚顺序错误（把第 1 名排成第 3 名比排成第 2 名更严重）
3. τ-b 修正了平局情况，适合我们 5 选 5 的场景

**τ 范围**：[-1, 1]，但实际实验中 τ ∈ [0, 1]（agent 不会完全反向排序）

**追问准备**：
- "为什么不用 Spearman ρ？" → Spearman 用的是排序值的 Pearson 相关，对异常值更敏感。Kendall 用的是对偶比较，更稳健。在小样本（n=5 items）下 Kendall 的效率更高
- "τ 和 Spearman 的关系？" → τ ≈ (π/4) × ρ ≈ 0.79ρ。在大多数情况下两者方向一致但 τ 数值更小

---

### 7. 可复现性设计：mulberry32 PRNG + seed [代码: governance/index.ts, custom.ts, analyze.ts]

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
- 这样确保三组随机数流不重叠，避免相关性

**追问准备**：
- "为什么不用 crypto.randomBytes？" → 那是密码学安全的随机数，但不可复现。实验需要的是可复现性，不是密码学安全性
- "mulberry32 的统计性质够吗？" → 它通过了 TestU01 的 SmallCrush 浙试。对于实验中的蒙特卡洛模拟（10000 次重采样），足够。如果需要更高精度可以用 xorshift128+

---

### 8. 信念演化动力学 [文档: MATHEMATICAL_FRAMEWORK.md L108-L161]

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

## P1 — 教授很可能问

---

### 9. 5 维评估体系 [代码: constants.ts L160-L166, evaluation/index.ts]

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

### 10. Cohen's d 和效应量解释

**是什么**：Cohen's d = (μ_A - μ_B) / σ_pooled，其中 σ_pooled = √[((n_A-1)σ²_A + (n_B-1)σ²_B) / (n_A+n_B-2)]

**解释标准**（Cohen 1988）：
- d < 0.2：微小效应
- d ≈ 0.5：中等效应
- d > 0.8：大效应
- d > 1.3：极大效应

**项目中的关键效应量**：
- M&A shuffle vs baseline: d = +1.80（极大）
- Invest 3轮 full vs none: d = +0.65（中等，但不显著 p=0.37）
- Full vs shuffle: d ≈ 0.00（治理无边际效应）

**方向约定**：我们的代码中 cohensD(a, b) = (mean(a) - mean(b)) / pooled_sd，即正值表示 a > b。analyze.ts 中统一用 `cohensD(treatment, baseline)`，run.ts 也统一为 `ablation - baseline`。

**追问准备**：
- "d=0.65 但 p=0.37，怎么解释？" → 效应量中等但样本太小（n=15），统计功效不足。d=0.65 在 α=0.05 下需要 n≈30/组才能达到 power=0.8
- "为什么不用 Hedges' g？" → Hedges' g 对小样本有偏差校正，但校正量在 n=15 时仅约 5%。我们的 cohensD 用样本标准差（n-1 分母），已经是无偏估计

---

### 11. 多重比较校正 [代码: analyze.ts L461-L484]

**是什么**：当同时检验多个假设时，假阳性率膨胀。4 个单干预消融各做一次检验，α=0.05 时至少一个假阳性的概率 = 1-(0.95)^4 = 18.5%。

**两种校正方法**：
1. **Bonferroni**：α' = α/n。最保守，控制 FWER（族错误率）。4 个检验时 α' = 0.0125
2. **Benjamini-Hochberg (BH)**：按 p 值排序，第 k 大的 p 值与 (α×k)/n 比较。控制 FDR（假发现率），比 Bonferroni 宽松

**为什么同时报告两种**：
- Bonferroni 最保守，适合"不愿有假阳性"的场景
- BH 更平衡，适合探索性研究
- 同时报告让读者自行选择严格程度

**追问准备**：
- "FWER 和 FDR 的区别？" → FWER = 至少一个假阳性的概率；FDR = 被称为显著的结果中假阳性的期望比例。FDR 控制更宽松但更适合探索性研究
- "为什么不删掉不显著的检验？" → 那是 p-hacking。所有预设的检验都应该报告，无论是否显著

---

### 12. 影响力网络设计：仅显式引用 [代码: discussion/influence.ts]

**是什么**：影响力网络的边仅来源于 agent 输出中的 `referencedAgents` 字段（显式引用），不从信念差值推断边。

**为什么**：
- 信念差值大不等于有影响力——两个 agent 可能独立地持有不同观点
- 显式引用是 agent 自主表达"我受到了谁的影响"，语义更明确
- 从数值差推断边会导致虚假连接，使 reduce_weight 干预目标错误（D4 缺陷的根源）

**实现细节**：
- agent 输出 JSON 中必须包含 `referencedAgents: ["agent_1", "agent_2"]` 字段
- `agentReferencesAgent(agent, other)` 方法优先检查引用字段，回退到子串匹配
- `computeInfluencePaths` 只用显式引用边，不用信念差推断边

**追问准备**：
- "如果 agent 不输出 referencedAgents 怎么办？" → 网络中该 agent 没有出边，但仍可被其他 agent 引用（入边）。这是信息损失但不会产生虚假边
- "子串匹配回退会不会误判？" → 会。如果 agent 名字是 "A" 而推理文本中出现了 "Agent A"，子串匹配会误判。但这是回退策略，主路径是显式字段

---

### 13. 因果效应估计方法 [代码: analysis/causalEffect.ts]

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
2. 小样本（n=15/cell），统计功效不足
3. SUTVA 假设可能不成立（一个 agent 被干预可能影响其他 agent）
4. 历史数据来自断裂环路，处理组实际未受到有效干预

**追问准备**：
- "为什么不用 DID（双重差分）？" → DID 需要面板数据和对照组的平行趋势假设。我们只有 3-5 轮，且处理组和对照组的轨迹趋势不一定平行
- "为什么不用合成控制？" → 合成控制需要较大的 donor pool（对照组库）。我们每种条件只有 15 个实验，donor pool 太小
- "SUTVA 是什么？" → Stable Unit Treatment Value Assumption，假设一个个体的处理状态不影响另一个个体的结果。在多 agent 讨论中，干预一个 agent 会通过讨论传播影响其他 agent，所以 SUTVA 可能不成立

---

### 14. 洗牌对照的机制和局限

**是什么**：shuffle 模式打乱 agent 的专业知识分配——agent A 原来负责分析公司 1-2，洗牌后负责分析公司 3-4。

**结果**：M&A 任务 shuffle 显著优于 baseline（p=0.0009, d=+1.80）。

**两个可能机制**：
1. 破坏知识连贯性 → agent 无法独立判断 → 被迫倾听他人 → 信息聚合改善
2. 创造认知失调 → 偏见与知识不匹配 → agent 更可能修正初始偏见

**局限**：shuffle 同时改变了两个机制，无法区分哪个贡献了效应。此外 shuffle 只旋转了 knownItems，没旋转 initialBias，导致偏见与知识不匹配——这是设计缺陷。

**追问准备**：
- "d=1.80 太大了，是不是 bug？" → 不是。d=1.80 说明打乱知识分配极大改善了决策质量。机制是：当 agent 无法依赖自己的专业知识时，会更认真地倾听他人，形成更好的信息聚合。这跟"弱关系优势"（Granovetter 1973）理论一致
- "shuffle 改善了说明什么？" → 说明默认的知识分配方式（每个 agent 负责特定公司）反而限制了信息聚合。这是 hidden profile 问题的体现：每个 agent 掌握独有信息时，如果没有有效的信息共享机制，群体决策反而比信息打乱后更差

---

## P2 — 教授可能问

---

### 15. Kuramoto 序参量及 π 映射修复 [文档: MATHEMATICAL_FRAMEWORK.md L171-L186]

**是什么**：Kuramoto 序参量 R 衡量 agent 信念的"同步程度"。将信念 b ∈ [-1,1] 映射到单位圆上的相位角 θ，然后计算向量和的模：

$$R = \frac{1}{n}\left|\sum_{k=1}^{n} e^{i\phi_k}\right|$$

**H4 修复**：旧映射 θ = π·b 有严重缺陷。
- b = +0.99 → θ ≈ +0.99π（单位圆左侧 (-1, 0) 附近）
- b = -0.99 → θ ≈ -0.99π（同样在左侧 (-1, 0) 附近）
- 两个极端对立的信念在单位圆上几乎重合 → R ≈ 1（误判为高共识）

修复为 θ = (π/2)·b：
- b = -1 → θ = -π/2（正下方）
- b = +1 → θ = +π/2（正上方）
- 极端对立时相位差 = π → R ≈ 0（正确反映极化）
- 全部一致时相位重合 → R ≈ 1（正确反映共识）

**追问准备**：
- "Kuramoto 模型的原始用途是什么？" → Kuramoto (1975) 用于描述耦合振子的同步现象，如萤火虫闪烁同步、心跳起搏细胞同步。我们借用其数学框架来衡量信念"同步"
- "为什么要映射到单位圆？" → 信念是线性的 [-1,1]，但共识需要衡量"方向一致性"。映射到单位圆后用向量和的模可以自然地衡量方向一致性

---

### 16. GovernanceEngine.reset() 和实验隔离 [代码: governance/index.ts]

**是什么**：GovernanceEngine.reset() 清除三类状态：
1. `calibration`：自适应阈值的校准缓存
2. `interventionHistory`：历史干预记录
3. PRNG 状态：mulberry32 的内部 seed

**为什么需要 reset**：
- 实验批量运行时复用 GovernanceEngine 实例
- 如果不 reset，上一轮实验的校准数据会污染下一轮的检测阈值
- PRNG 状态不 reset 会导致干预序列不可复现（每次运行的随机序列不同）

**DiscussionEngine.reset() 必须调用 GovernanceEngine.reset()**：
- DiscussionEngine 持有 GovernanceEngine 引用
- 还需要清除：governancePrompts、agentKnowledge、eventTracker、roundDataArray、dropoutObservations

**追问准备**：
- "为什么不在构造函数里自动 reset？" → 构造函数本身就是全新的状态，reset 是为复用场景设计的。但如果不显式调用 reset，复用的实例会携带旧状态——这是 bug 的根源
- "PRNG reset 到什么值？" → 回到 GovernanceEngine 构造时传入的初始 seed。这保证每次实验的干预序列完全相同

---

### 17. 安全 JSON 解析 [代码: utils/jsonUtils.ts]

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

### 18. 框架适配器模式 [代码: adapters/index.ts, adapters/custom.ts]

**是什么**：定义统一的 `FrameworkAdapter` 接口，支持将治理运行时嵌入不同 multi-agent 框架：

```typescript
interface FrameworkAdapter {
  createAgents(configs: AgentConfig[], llmConfig?: LLMConfig): Promise<Agent[]>;
  runInteraction(agents: Agent[], input: TaskInput): Promise<InteractionResult>;
  getAgentInfo(agents: Agent[]): AgentConfig[];
  dispose(agents: Agent[]): Promise<void>;
}
```

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

### 19. StateInferenceBridge [代码: runtime/adapters/StateInferenceBridge.ts]

**是什么**：当 agent 输出中缺少结构化的 belief/confidence 字段时，StateInferenceBridge 提供三级提取：
1. **Level 1**：直接从 JSON 输出提取 belief/confidence 字段
2. **Level 2**：从 [GOV] 标签提取（agent 被要求在输出末尾附加 [GOV] 标签）
3. **Level 3**：回退到 LLM 推断（向 LLM 发送 agent 输出，请求推断 belief/confidence）

**为什么需要三级**：
- Level 1 覆盖正常情况（agent 遵守 JSON 格式）
- Level 2 覆盖 agent 被 PromptInjector 要求附加 [GOV] 标签的情况
- Level 3 是兜底方案，保证即使 agent 完全不输出结构化数据也能提取状态

**[GOV] 标签的安全问题**：agent 可以伪造 [GOV] 标签（prompt injection），这是已知局限，在 LIMITATIONS.md 中标注。

**追问准备**：
- "LLM 推断 belief 的准确率如何？" → 未验证。这是已知局限。理论上 Level 3 是最后手段，正常情况下 Level 1 应该覆盖 95%+ 的输出
- "为什么不让 agent 直接在 JSON 里输出 belief？" → 我们要求了，但不是所有 LLM 都遵守。StateInferenceBridge 是防御层

---

### 20. PromptInjector 和 [GOV] 标签机制 [代码: runtime/adapters/PromptInjector.ts]

**是什么**：PromptInjector 在 agent 的系统 prompt 末尾追加治理扩展指令，要求 agent 在输出中附加 [GOV] 标签：

```
[GOV] belief=0.65 confidence=80 referencedAgents=agent_2,agent_3
```

**为什么用标签而非 JSON 字段**：
- 不修改 agent 的原始系统 prompt（只追加）
- 标签格式简单，LLM 容易遵守
- 可被 StateInferenceBridge 的 Level 2 提取

**已知漏洞**：
1. [GOV] 标签可被伪造（agent 可以输出任意 belief 值）
2. agent 输出在被注入到其他 agent 的 prompt 前未做 sanitize
3. 这两个问题已在 LIMITATIONS.md 中标注，暂未修复

**追问准备**：
- "为什么不在输入侧防护？" → 可以加正则过滤，但攻击者可以用编码绕过。真正的解决方案是在 LLM 层面做输出验证，这超出了当前项目范围
- "这对实验结论有影响吗？" → 有。如果 agent 伪造 [GOV] 标签，StateInferenceBridge 提取的 belief 数据是错误的，会导致检测器误判和干预方向错误。但实验中未观测到明显的标签伪造行为

---

### 21. 自适应阈值（已实现但默认禁用）[代码: governance/adaptiveThresholds.ts]

**是什么**：`computeAdaptiveThresholds` 函数根据校准数据动态调整 4 个检测器的阈值，替代硬编码常量。

**为什么默认禁用**：
1. **校准逻辑缺陷**：使用真实任务的第一轮作为校准数据，但第一轮数据含有任务特性（如投资任务的天然保守倾向），会污染基线测量
2. **未经验证**：没有实验证明自适应阈值比固定阈值更好
3. **实验对照**：之前的 165 次实验都用固定阈值，混用会破坏可比性

**正确做法**：
- 应该用独立的校准轮次（简单的无争议问题）作为基线
- 或者用 A/B 测试对比固定 vs 自适应阈值的效果

**追问准备**：
- "为什么不在修复后直接启用？" → 需要重跑所有实验，API 成本限制。且需要先验证自适应阈值确实更好
- "自适应阈值的公式是什么？" → 基于校准数据的均值和标准差，用 z-score 调整阈值。但具体公式在代码中（adaptiveThresholds.ts），核心思想是：如果基线冗余度已经很高，检测阈值应该相应提高

---

### 22. 收敛条件的设计

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

### 23. 信息覆盖度估计

**是什么**：`estimateInformationCoverage` 估计群体讨论中信息的覆盖程度。

**旧方法（已弃用）**：用发言 agent 数量作为覆盖度近似——不准确，因为 5 个 agent 都发言不等于所有信息都被提及。

**新方法**：用实际的 item coverage metrics——统计讨论中被提及的不同信息项数量 / 总信息项数量。

**为什么重要**：覆盖度影响评估引擎的 reliability 维度和治理引擎的 premature consensus 判断。

**追问准备**：
- "怎么定义'信息项'？" → 在 Invest 任务中是公司名称，在 M&A 任务中是并购标的。通过解析 agent 推理文本中的关键词提取
- "覆盖度和决策质量的关系？" → 理论上覆盖度越高决策越好，但实验中未验证这个关系。这是假设

---

### 24. Gini 系数计算

**是什么**：影响力分布的 Gini 系数衡量影响力是否均匀分布在各 agent 之间。Gini → 0 表示均匀，Gini → 1 表示集中。

**实现**：O(n) 排序算法——先排序，然后累积计算。不需要 O(n²) 的两两比较。

**公式**：G = (2Σ_i i·x_i) / (n·Σ_i x_i) - (n+1)/n，其中 x 是排序后的值。

**为什么用逆 Gini**：评估引擎的 Influence Analysis 维度用 `1 - Gini` 作为分数——影响力越均匀分布得分越高。

**追问准备**：
- "Gini 系数原始用途？" → 经济学中衡量收入不平等。我们借用它衡量影响力不平等
- "O(n) 算法和标准算法的区别？" → 标准 Gini 需要两两比较 O(n²)。排序后用累积公式是 O(n log n)（排序主导）。对 n=5 来说没区别，但对大规模网络有意义

---

### 25. t 分布临界值表和线性插值

**是什么**：小样本 CI 用 t 分布而非正态近似。代码中有 df=1 到 120 的 t 临界值表，未列出的 df 用线性插值。

**为什么不用正态近似**：
- 正态近似在 n ≥ 30 时才可靠
- 我们 n=15，t 分布的尾部更厚，CI 更宽，更保守
- t 分布的 df = n-1 = 14，t_critical = 2.145（vs 正态的 1.96）

**线性插值**：如 df=14 直接查表得到 2.145，df=16 在 14(2.145)和19(2.093)之间插值得到 ~2.128。

**追问准备**：
- "为什么不用 scipy 的 t.ppf？" → 这是 TypeScript 项目，没有 scipy。手写查表+插值是合理替代方案
- "Welch 校正在哪？" → bootstrapMeanDiff 中用 Welch 近似计算 df：df = (s_A²/n_A + s_B²/n_B)² / [(s_A²/n_A)²/(n_A-1) + (s_B²/n_B)²/(n_B-1)]，不假设等方差

---

## 附：关键数值速记

| 参数 | 值 | 含义 |
|------|-----|------|
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
| n per cell | 15 | 每实验条件样本量 |
| 总实验数 | 165 | 含 3 个任务 × 7 模式 × ~8 重复 |
| 测试数 | 209 | 单元测试数量 |
