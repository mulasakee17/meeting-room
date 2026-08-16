# FORK Confirmatory Results (45 unseen HiddenBench tasks)

状态：FACT REPORT — confirmatory 结果，2026-08-15。这是第一篇论文的 primary 证据，不再是 development 信号。

Runner：`run_v6_fork.ts`（3 臂 CONTROL/SUPPORTS/ATTACKS，全量披露）；analyzer：`analyze_v6_fork.ts`。
数据：`experiments/campaign/pilot_output/v6-fork-confirmatory-v2-20260815/`（45 task × 1 seed × 3 臂 = 135 rows，1239 calls，1.72M tokens）。
重放：`--replay` → `ok: true`（verified 45 files）。

---

## 1. Primary（冻结口径，task-level 配对 + 10k cluster bootstrap）

### H1（primary：Δ_dir = Brier_ATTACKS − Brier_SUPPORTS，负 = ATTACKS 优）

| 量 | 值 |
|---|---|
| mean | **−0.343** |
| median | −0.103 |
| 95% CI | **[−0.507, −0.193]**（完全 < 0）|
| negative / positive / zero | 24 / 9 / 12 |
| task count | 45 |
| verdict | **`direction effect detected in predicted direction`** |
| LOTO | full −0.343，min −0.367，max −0.309，**signChanges = false** |

### H2（secondary：Δ_disc = Brier_ATTACKS − Brier_CONTROL，负 = ATTACKS 优）

| 量 | 值 |
|---|---|
| mean | **−0.308** |
| median | −0.060 |
| 95% CI | **[−0.496, −0.147]**（完全 < 0）|
| negative / positive / zero | 26 / 5 / 14 |
| verdict | **`direction effect detected in predicted direction`** |
| LOTO | full −0.308，signChanges = **false** |

**结论（INFERENCE）**：在 45 个 development 之外、从未看过 ATTACKS/SUPPORTS outcome 的任务上，disconfirming（ATTACKS）披露同时优于 confirming（SUPPORTS）和优于不披露（CONTROL），CI 全负、LOTO 不变号。方向效应与披露效应**都通过**。

---

## 2. Secondary / robustness

### 2.1 accuracy（pooled argmax vs majority vote）

| arm | pooled accuracy | majority-vote accuracy |
|---|---|---|
| CONTROL | 0.667 | 0.644 |
| SUPPORTS | 0.556 | 0.533 |
| ATTACKS | **0.822** | **0.822** |

- **majority-vote 与 pooled 几乎一致**（ATTACKS 完全相同）。结论不依赖"个体平均 vs 共识收敛"的口径之争：无论哪种口径，ATTACKS 都最高。

### 2.2 H3（coupling moderation：ATTACKS−CONTROL 效应 × round-1 状态）

| moderator | split | n | ATTACKS−CONTROL |
|---|---|---|---|
| evidenceReuse_R1（证据耦合）| high | 23 | **−0.375** |
| evidenceReuse_R1 | low | 22 | −0.237 |
| alignment_R1（信念对齐）| high | 23 | −0.200 |
| alignment_R1 | low | 22 | **−0.420** |

- **证据耦合越高，ATTACKS 效应越强**（−0.375 vs −0.237）——符合 H3"耦合共识风险"方向。
- **信念对齐方向相反**（低对齐效应更强 −0.420 vs −0.200）。
- 合起来：**危险共识的关键 moderator 是"证据耦合"（重复引用），不是"信念对齐"（越一致）**。这比原 H3（高耦合+高对齐）更精确，指向 Coupled Consensus 的核心。

### 2.3 missingness（finalReportedCount，满分 4）

| arm | mean finalReported | zeroReported |
|---|---|---|
| CONTROL | 3.73 | 0 |
| SUPPORTS | 3.82 | 0 |
| ATTACKS | 3.87 | 0 |

- 三臂 missingness 接近满、无系统性偏差 → **排除"ATTACKS 更有效是因为 final 缺失更少"的 confound**。

### 2.4 per-task 集中度

- mean −0.343 vs median −0.103（右偏，被少数大负 task 拉低）。
- top-5 负 task 贡献了 mean 的 **47%**。
- 但 LOTO 不变号、24/45 负（非"全靠 2 个任务"）——集中度存在，但**不是 development 那种单点主导**。

---

## 3. LIMITATION（诚实，不粉饰）

1. **单模型、单 seed、单 temperature**：DeepSeek deepseek-chat，seed 0，temperature 0。
2. **relation 是模型自报标签**：supports/attacks 有误标风险（development 已见"Charlie 主跑道仍开放"被标 attacks）。"direction"的构念效度未经独立标注验证——这是当前最硬的科学缺口。
3. **evidenceReuse 是逐字复用**：只认哈希相等，不认同义改写/同源。语义级依赖（SCDG）已留数据口子（`round1/2EvidenceContents`），未实现。
4. **效应仍异质**：9/45 任务方向为正（ATTACKS 更差），12/45 为零。稳健的是"平均 + LOTO"，不是"逐任务全胜"。
5. **单 benchmark**：HiddenBench，hidden-profile 结构；不推广到其他任务类型。
6. **H3 是 exploratory secondary**：coupling 分层用中位数 split，未预注册阈值，不作 confirmatory 主结论。

---

## 4. 对论文的含义（DESIGN INTENT）

- H1 + H2 双通过 → 走"方向 + 披露治理有效"的结论路线（CHECKLIST 第 19 项的第一分叉）。
- 理论收拢点：**危险共识 = 证据耦合（而非信念对齐）**，disconfirming 曝光在其上最有效。这与 Epistemic Exposure Governance + Coupled Consensus 框架一致，且比"alignment"更精确地定位了危险信号。
- 编号证据池（protocol v3）与 SCDG 仍留作后续，本篇以"逐字复用"为 detector 的诚实边界。

---

## 5. "9 输"解剖：方向效应是条件性的，不是 universal（INFERENCE）

H1 的 24 负 / 9 正 / 12 零里，9 个正 task 必须诚实拆开——**它们的反号不是"ATTACKS 披露不够"，而是结构性的，且"补全"救不了它们。**

### 5.1 九个正 task = 2 个明显反号 + 7 个噪声

| 类别 | task | Δ_dir |
|---|---|---|
| 明显反号 | 17 | **+0.715** |
| 明显反号 | 23 | **+0.418** |
| 噪声（ATTACKS≈SUPPORTS）| 62 / 18 / 26 / 43 / 21 / 64 / 42 | +0.01 ~ +0.17 |

那 7 个噪声本质是"两臂打平、SUPPORTS 略好一点点"，不是方向反转。

### 5.2 两个真反号，机制完全不同（FACT，逐条证据核过）

**task 17（正确答案 Plateau Camp D，观察动物最佳地点）**：
- CONTROL 0.860（错）→ SUPPORTS **0.354（对）** → ATTACKS 1.068（错）。
- 决定性线索是 **supports 形式**："Plateau Camp 是唯一风不会把沼泽咬虫吹过来的地方"——这是 D 的**独有优点**（证实），不是"排除其他选项"。
- 而 9 条 attacks 里，有 3 条**把 D 也证伪了**（"最开阔、离动物最远、观察机会少"）。于是 ATTACKS 披露把 A/B/C/D 四个选项**全部证伪了一遍**，群体看到"每个选项都有缺点"，更困惑 → 答错。
- 根因：`attacks` 把"D 的 trade-off（开阔→观察少）"误当成了"排除 D 的理由"。这是 **relation 自报标签的语义噪声**——"开阔"到底算证伪 D，还是 D 的次要代价？模型标成了 attacks，但这不是决定性证伪。

**task 23（正确答案 Grand Oak Hotel）**：
- CONTROL **0.114（本来就对）** → SUPPORTS 0.566（错）→ ATTACKS 0.984（错）。
- 群体自己就能答对，**任何干预都添乱**。不是"方向反了"，是"这个任务不该干预"。
- 这是 AGENTS.md 那条铁律的活案例：**moving already-correct tasks is wasted intervention**。

### 5.3 为什么"补全"救不了它们

- task 17：补再多 attacks，也补不出那条"指向 D 的 supports 独有优点"——方向本身就反了；且 attacks 把正确项也误伤了。
- task 23：正确的干预是"不干预"，任何补全都是继续搅浑。
- 7 个噪声：它们本就是"ATTACKS ≈ SUPPORTS"，不是"差一点就能赢"。

### 5.4 结论（这是比"赢 9 个"更有价值的发现）

方向效应**不是 universal 的**，而是**条件性的**，取决于两个正交的问题：

1. **该不该干预**：有些任务群体自己能答对（task 23），干预有害。
2. **给哪个方向**：正确线索可能是"证实"（独有优点，如 task 17）也可能是"证伪"（排除错误选项，如灾难任务）。

ATTACKS 平均占优，是因为"群体要一起错"的灾难任务里，决定性线索**更常**是"排除错误选项"的证伪形式——**不是**因为证伪证据在所有任务上都更优。

因此 Epistemic Exposure Governance 真正的决策问题不是"永远上 ATTACKS"，而是：**truth-blind 地判断"该不该干预 + 给哪个方向"**。detector（coupling/reuse）的职责是识别前者（哪些任务处于耦合共识、需要证伪救场），而"给哪个方向"依赖对证据语义的更细测量（SCDG / 独立 relation 标注留作后续）。

---

## 6. 灾难/好任务分解 + detector 泛化失败（关键 negative result）

### 6.1 效应完全来自灾难任务，且 ATTACKS 不伤害好任务（FACT）

按 CONTROL（不干预）Brier 分三档：

| CONTROL 档位 | 数量 | CONTROL Brier | ATTACKS Brier | SUPPORTS Brier |
|---|---|---|---|---|
| 灾难（Brier>1.0）| **11** | 1.733 | **0.714** | 1.292 |
| 中间（0.3~1.0）| 8 | — | — | — |
| 好（Brier<0.3）| 26 | 0.075 | **0.058** | 0.220 |

- **灾难任务**：ATTACKS 把 Brier 从 1.733 砍到 0.714（大幅救回）；SUPPORTS 只到 1.292（救不动）。
- **好任务**：ATTACKS 几乎不添乱（0.075→0.058，略好）；SUPPORTS 搅浑 3 倍（0.075→0.220）。

**结论**：H1 的平均 −0.343 几乎全部来自"灾难任务被 ATTACKS 救回"，而 ATTACKS 在好任务上不动、SUPPORTS 在好任务上添乱。这是"targeted rescue, not universal booster"的最强实证：ATTACKS 精准、SUPPORTS 两头平庸。

### 6.2 detector 在 unseen 上未泛化（negative result，必须诚实）

confirmatory 45 × 1 seed 上：

- Pearson(round-1 evidenceReuse, final Brier) = **0.063**（≈0）
- Pearson(round-1 alignmentR, final Brier) = **0.079**（≈0）

而 development 的 detector 是 r=0.641（总）/0.388（within-task）。

**两点诚实结论**：

1. **"证据复用预测翻车"在 45 unseen 上未复现**——detector 从"发现"降级为"development 特定、未泛化"。
2. **存在 seed=1 造成的验证盲区**：development 的强相关是 **within-task**（同任务内 reuse 高的 run 更失败）；confirmatory 每 task 只 1 seed，**无法算 within-task 相关**，上面的 0.063 是"跨任务总相关"，与 development 的 0.388 不是同一个量。为省预算钉死 seed=1，牺牲了 detector 的 within-task 验证能力。

**对论文贡献的重新排序（DESIGN INTENT）**：

- **主贡献（硬）**：disconfirming 曝光的因果效应——H1/H2 双通过 + 灾难/好任务分解（ATTACKS 精准救场、不伤好任务）。
- **次贡献（降级）**：truth-blind detector——development r=0.641/0.388，**confirmatory 未泛化（0.063）**，且 within-task 验证因 seed=1 缺失。这是诚实的 negative result，暴露了"逐字复用 ≠ 耦合"的测量漏洞（正是 SCDG 要补的），可作为论文的 honest-boundary 贡献，而非"已建立的 detector"。

