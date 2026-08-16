# SwarmAlpha 平台能力简报（Platform Capability Brief）

> 本文用途：给外部"更擅长搜索的 AI"一份自包含的平台能力说明，让它去检索**前沿相关工作**——即哪些近期工作的"可复现贡献"（一个机制、一个测量、一个 benchmark、一个理论量）可以放到我们这个更严谨、可审计的实验机器上，得出**更干净/更强**的结论。本文只陈述平台**已实现**的能力（FACT），不夸大结论。

---

## 0. 一句话定位

SwarmAlpha 是一个**可审计、可复现的 multi-agent LLM 集体决策实验引擎**，核心科学问题是：

> **在有限公共注意力下，治理哪些证据进入群体的公共认知空间，以及这种选择性证据曝光如何塑造证据依赖（coupling）、共识形成（consensus）和最终决策质量（proper loss）。**

上位抽象：**Epistemic Exposure Governance（认知曝光治理）**。关键构念：**Coupled Consensus（耦合共识）**——群体在重复、非独立的证据上达成一致，而非在独立证据上收敛。

---

## 1. 平台已实现的能力（FACT）

### 1.1 实验协议（可复现）

- **Hidden-profile 任务**：pinned HiddenBench 65 任务（canonical content hash 锁数据），每个 agent 持有部分证据、无人持有全部。
- **2 轮讨论 + private final elicitation**，temperature 0。
- **证据模型**：每 agent 产出 `supports`/`attacks` 证据 + 内容哈希（content hash），进入可审计的证据池（evidence registry）。
- **治理干预 = 证据曝光（evidence disclosure）**：在 round-1 与 round-2 之间向公共信道注入证据。
- **fork 设计**：从**完全相同的 round-1 状态**分支出多臂（CONTROL / SUPPORTS / ATTACKS），唯一差异是曝光哪些证据——这是干净的**反事实干预**，不是跨批次对比。

### 1.2 严格纪律（可审计）

- **Truth firewall**：在线治理代码与策略**不读** `groundTruth` / `correctAnswer` / resolver 结果；outcome 只用于离线打分。
- **确定性 + 重放**：replay、contentHash、stateHash、frozen manifest、single-attempt no-retry、deterministic clock。
- **Proper loss**：multiclass Brier（primary）+ accuracy（secondary）。

### 1.3 真相盲测量（truth-blind quantities）

| 量 | 定义 | 测量对象 |
|---|---|---|
| exact evidence reuse | `1 − U/N`（U=不同内容哈希数，N=证据引用总数）| 证据耦合（逐字）|
| alignment R | `1 − mean pairwise JSD` | 信念对齐 |
| maxPairwiseTV | 最大成对 total variation | 分歧 |
| evidence entropy H_E | 归一化证据身份熵 | 证据多样性 |

### 1.4 统计

- **task-level 配对**（同 task 内跨 seed 平均，每 task 等权）。
- **task-cluster bootstrap**（10k resamples，resample unit = task）。
- **Leave-One-Task-Out（LOTO）** robustness。

### 1.5 基础设施

- 多模型 provider 层就绪（DeepSeek / Qwen / GLM / Zhipu），当前仅 DeepSeek 接线。
- 预算闸门、落盘 + resume、manifest + 内容哈希重放校验。

---

## 2. 我们相比已有工作的"更硬"之处

1. **哈希级证据耦合**（vs 用输出相似度 / 相关性近似）。
2. **随机化 fork 反事实**（同一状态多臂，vs 跨批次/跨 run 对比）。
3. **truth firewall 严格执行**（在线无 ground truth）。
4. **检测 → 干预 → 救回 的闭环**：detector（evidenceReuse 预测失败）→ disconfirming disclosure → 灾难任务被救回。

---

## 3. 已知基线（避免重复检索，供判断"是否已有"）

- Hidden-profile 经典：Stasser & Titus (1985)。
- HiddenBench（arXiv 2505.11556）——多 agent LLM 在 hidden-profile 上掉到 ~30% accuracy。
- Multi-agent debate：MAD、CHAL。
- Emergent consensus 的 "coupling gain / validity diagnostic"（arXiv 2606.22203）。
- Bayesian Persuasion / information design。
- Information Cascades / Social Learning。
- Bipolar Argumentation（support/attack 图）。

---

## 4. 我们要找的前沿相关工作（给搜索 AI 的检索指令）

请检索**近期（近 1–2 年）**、且满足以下任一条件的可复现贡献：

### 4.1 机制类（Mechanism）

- multi-agent LLM 中的 **evidence disclosure / information sharing / selective exposure** 机制。
- 针对 **false consensus / emergent consensus / coupled consensus** 的干预。
- 用 **disconfirming / contradicting evidence** 打破错误收敛的方法。

### 4.2 测量类（Measurement）

- **truth-blind** 的群体失败预测器（不需要 ground truth）。
- 证据**依赖/独立性**（dependence / source independence）的测量，而非逐字重复。
- LLM 群体 **calibration / proper scoring** 诊断。

### 4.3 理论/构念类（Construct）

- 证据曝光策略的形式化（exposure policy / attention allocation）。
- "耦合共识"或等价构念（群体在非独立证据上对齐）。
- 社会学习中的 **cascade / 信息瀑布** 在 LLM 群体中的可操作化。

### 4.4 判断标准（什么算"有价值"）

- 它有**可复现的核心贡献**（一个机制/测量/理论量），不是只有叙述。
- 它**在公开证据上可运行**（不需要我们无法获取的私有数据）。
- 把它放到我们平台（hash 级证据、randomized fork、truth firewall、proper loss）上，能得出**更干净或更强**的结论。

---

## 5. 期望输出

对每个找到的相关工作，请给出：

1. 标题 + 链接（arXiv/venue）。
2. 它的**可复现核心贡献**是什么（一句话）。
3. 它与我们平台**哪一项能力**能结合（对应 §1）。
4. 结合后能回答的**更严谨的具体问题**是什么（可证伪、有 independent outcome）。

---

## 6. 边界声明（避免误用本文）

- 本文描述的是**平台能力**，不代表"治理已被证明有效"。
- 当前最硬的结论仍是**development 信号 + 两个已定位修复的 bug**；confirmatory 45-task 尚未完成。
- 平台严谨性 ≠ 测量效度：`supports/attacks` 是模型自报标签（有误标），`evidenceReuse` 只测逐字复用（非"证据非独立"）——这两点是有待解决的科学缺口，不是已解决。
