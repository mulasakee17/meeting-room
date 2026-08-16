# Epistemic Exposure Governance — 理论收束 V1

状态：THEORY / DESIGN INTENT 收束草案，2026-08-15。本文把 confirmatory 结果与既有测量收成一个统一的理论骨架，作为第一篇论文 theory/discussion 章节的底稿。**本框架是"我们要研究的问题 + 构念"，不是"已建立的定律"**；所有因果主张以 `docs/experiments/FORK_CONFIRMATORY_RESULTS_2026-08-15.md` 的 FACT 为准。

---

## 1. 一句话定位

> **SwarmAlpha 研究：在有限公共注意力下，治理者如何分配"哪些证据进入群体的公共认知空间"，以及这种选择性证据曝光如何塑造证据依赖、共识形成与最终决策质量（proper loss）。**

上位抽象：**Epistemic Exposure Governance（认知曝光治理）**。它不是"永远披露反证证据"的规则，而是"决定曝光什么、曝光给谁、曝光多少"的**决策问题**。

## 2. 核心机制链（把三个发现收成一条）

```
有限公共注意力（bounded public attention, B）
  → 选择性证据曝光（exposure policy π）
  → 公共证据拓扑发生偏置与耦合（public evidence topology: 哪些证据被反复引用）
  → 群体在【非独立】证据上对齐 → Coupled Consensus（耦合共识）
  → 反证/新颖证据的定向曝光打散该耦合（disconfirming disclosure）
  → 最终 proper loss 改变（multiclass Brier）
```

三个发现不再是并列，而是**同一条链的三个观测点**：

| 发现 | 在链中的位置 |
|---|---|
| **evidenceReuse 预测失败**（detector，development r=0.641/0.388；**confirmatory 未泛化 r=0.063**）| 观测"公共证据拓扑的耦合程度"——但作为 predictor 未被 unseen 验证 |
| **disconfirming 披露有效**（H1/H2，confirmatory 通过）| 施加"打散耦合"的干预，观测 Brier 响应 |
| **semantic wall** | 声明可观测边界：耦合可测（但仍测不准），错对不可测 |

## 3. 核心构念：Coupled Consensus（而非 Aligned Consensus）

confirmatory 的 H3 给出关键区分：

- **证据耦合（evidenceReuse）高 → ATTACKS 效应更强**（−0.375 vs −0.237）。
- **信念对齐（alignment）方向相反**（低对齐 −0.420 vs 高对齐 −0.200）。

**含义**：危险共识的根不是"大家都同意"，而是"大家都在重复同一条（可能错的）证据"。这是 **Coupled Consensus** 与 **Aligned Consensus** 的区分：

|  | 低证据耦合 | 高证据耦合 |
|---|---|---|
| 低信念对齐 | 健康探索 / 分歧 | 共享偏见下的分裂 |
| 高信念对齐 | 独立证据支持的（健康）共识 | **耦合共识风险**（危险）|

- "独立证据支持的共识"是好的（4 个 agent 各自独立到达同一结论）。
- "耦合共识"是危险的（4 个 agent 都从同一条证据到达同一结论，而那条证据可能错）。

**危险信号是"耦合"，不是"对齐"**——这正是 detector 应该测的东西，也是 Epistemic Exposure Governance 想治理的对象。

**但必须区分两种"耦合"的作用（这是 §6.2 的关键 nuance）**：

- **moderation（成立）**：耦合高 → ATTACKS 干预效应更强（H3，−0.375 vs −0.237）。即"耦合状态是反证曝光更有效的条件"。
- **prediction（未泛化）**：耦合高 → 该任务更可能失败（CONTROL Brier 更高）——这个在 confirmatory 上 r=0.063，**不成立**。

所以"耦合共识导致失败"的因果叙事目前**站不住**；站得住的是更弱的一句："在耦合状态上，反证曝光更有价值"。Coupled Consensus 若要作为"危险信号"成立，需要补 within-task 验证（当前 seed=1 缺失）或语义级耦合（SCDG）。

## 4. 最小形式化

设：
- `E = ∪ᵢ Eᵢ`：所有 agent 的私有证据池；
- `P_t ⊆ E`：时刻 t 已公开的证据；
- `p_{i,t}`：agent i 的报告信念；
- `B`：公共信道的 token/证据预算；
- `π`：曝光策略；
- `X_t = π(P_t, {p_{i,t}}, E, B)`：治理者选择披露的证据集合。

离线评估（有 ground truth Y）：

```
Δ_π = E[ L(p_final^control, Y) − L(p_final^π, Y) ]   （L = multiclass Brier）
```

在线部署（无 Y，只能估计）：

```
V̂(e | S_t) = 估计的边际认知价值 − λ · cost(e)
```

这正是从"固定规则干预（supports/attacks）"升级为"在预算约束下决定下一条该公开什么"的理论入口——但**本篇不实现 V̂**，只声明这是 future work。

## 5. 曝光的五个正交维度（supports/attacks 只是其中一维）

1. **Polarity**：支持还是挑战当前候选（`supports`/`attacks` 只是它的工程实现）；
2. **Novelty**：是否提供公共证据图里没有的新信息；
3. **Dependence**：是否与已有证据同源（→ 这是 coupling 的根源）；
4. **Coverage**：覆盖多少候选、多少 agent、多少私有源；
5. **Cost**：token / 延迟 / provider 调用。

`attacks` 只是"高 challenge polarity"的一种标签，**不是理论构念本身**。

## 6. 条件性（9 输的诚实整合，不是缺陷）

H1 的 24 负 / 9 正 / 12 零表明方向效应是**条件性**的，由两个正交问题决定：

1. **该不该干预**：有些任务群体自己能答对（如 task 23，CONTROL 已对），干预有害 → "moving already-correct tasks is wasted intervention"。
2. **给哪个方向**：正确线索可能是"证实"（独有优点，如 task 17）也可能是"证伪"（排除错误，如灾难任务）。

因此理论命题不是"永远上 ATTACKS"，而是：**truth-blind 地判断"该不该干预 + 给哪个方向"**。detector 回答前者（识别耦合共识），后者依赖更细的证据语义测量（见 §7）。

## 7. 测量边界（诚实，不粉饰）

1. **relation 是模型自报标签**：`supports`/`attacks` 有误标（task 17 把"D 的开阔"标成 attacks，误伤正确项）。"direction"的构念效度未经独立标注验证。
2. **evidenceReuse 是逐字复用**：只认哈希相等，不认同义/同源。真正的"证据非独立"需要语义级依赖度量——**SCDG（Source-Conditioned Description-Length Gain）留作 future work**，数据口子已留（`round1/2EvidenceContents`）。
3. **detector 未泛化 + seed=1 验证盲区**：development 的 detector 是 within-task r=0.388；confirmatory 每 task 只 1 seed，无法算 within-task，跨任务总相关仅 0.063。**"证据复用预测失败"目前是 development 特定、未泛化，必须从"发现"降级为"未验证的假设"**。seed=1 省了预算，但牺牲了 detector 的 within-task 验证。
4. **2 轮讨论即形成耦合共识**：我们只有 2 轮（HiddenBench 是 15 轮顺序），说明耦合共识的形成**不需要长讨论**——这是信号强度的佐证，但也是"我们是否低估了讨论深度"的 limitation。

## 8. 未来路线（不阻塞第一篇）

- **protocol v3：编号证据池**（agent 引用编号，而非复述文本）→ 精确测耦合。
- **SCDG**：用冻结 LM 的 description-length gain 测语义级证据依赖。
- **该不该干预 + 给哪个方向**：把 detector 升级为"选择器"（which evidence to expose），而非"触发器"（whether to expose）。

---

## 一句话理论总结

> 有限公共注意力迫使治理者**选择性曝光证据**；错误的选择（supports-only、按哈希截断）让群体在**非独立的证据**上形成**耦合共识**并自信地错；**反证证据的定向曝光**能打散耦合、救回决策质量；而真正的科学问题是**truth-blind 地判断"该不该干预、给哪个方向"**——耦合（而非对齐）才是危险共识的可观测信号。
