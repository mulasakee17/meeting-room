# V6 Cross-Evidence-Exchange Mechanism Screen Results

**supports（吹捧）披露两轮 DEFER；attacks（打脸）披露两轮显示强效应但有保留；实验已停用（parked），--execute fail-closed**

状态：FACT REPORT — 只读分析，2026-08-15。分析器：`experiments/campaign/v6/analyze_v6_cross_evidence_exchange.ts`；runner：`experiments/campaign/v6/run_v6_cross_evidence_exchange.ts`。

---

## 0. 决策

- Round 1（supports，0.5/0.5 arms）：ITT 点估计 `-0.0204`，95% CI `[-0.3259, +0.3666]` 跨零 → **DEFER**。
- Round 2（supports，0.9/0.1 arms，提高暴露）：ITT 点估计 `+0.0929`，95% CI `[-0.2443, +0.4616]` 跨零 → **DEFER**（方向偏不利）。
- Round 3-4（**attacks**，0.9/0.1 arms）：触发场 n=18，均值 Brier **0.076**、准确率 **100%**，远优于 supports 触发场（n=17，Brier 0.582，准确率 58%）。但两处保留：0.8 阈值漏检（ineligible 场 Brier ~0.93）、臂内 holdout n=2 不足以排除选择效应。
- 实验标记为 **parked**：`CROSS_EVIDENCE_EXCHANGE_DISABLED = true`，`--execute` 在 `RUN_AUTHORIZED=yes` 下仍 fail-closed（exit 6）。
- 本报告不改动任何 runtime、schema、prompt、task、plan 或 artifact。

## 1. FACT

### 1.1 执行完整性

- 计划：8 任务 × 2 block × 2 臂 = 32 场；`contentHash = sha256:31758afc…`。
- 完成 32/32；provider 调用 372；token 366,056（预算 500 / 800,000）。
- 32/32 raw-run 通过 `verifyRawRunData`（`sealed_decision_replay_verified`）；无缺失、无多余 artifact。

### 1.2 臂分布

| 臂 | 场次 | 说明 |
|---|---|---|
| governance（16）| exchange 7 / holdout 7 / ineligible 2 | 合格场按冻结 seed 五五开；2 场 round-1 分歧 < 0.8 未触发 |
| no-governance（16）| ineligible 16 | always-ineligible，从未触发 exchange（firewall 通过）|

### 1.3 主估计（ITT：mean GOV Brier − mean NG Brier）

| 量 | 值 |
|---|---|
| GOV 均值 Brier | 0.6018（n=16，8 任务簇）|
| NG 均值 Brier | 0.6222（n=16，8 任务簇）|
| 点估计 | −0.0204 |
| bootstrap median / 95% CI | −0.0342 / [−0.3259, +0.3666]，validFraction 1.0000 |
| DEFER 原因 | bootstrap 95% 上界 ≥ 0 |

### 1.4 机制分解（exploratory；n 极小）

| 子组 | n | 均值 Brier | 均值 accuracy | invalidOrFailed |
|---|---|---|---|---|
| exchange | 7 | 0.4740 | 0.6000 | 5 |
| holdout | 7 | 0.5742 | 0.5714 | 3 |
| gov ineligible | 2 | 1.1458 | 0.5000 | 3 |
| no-governance | 16 | 0.6222 | 0.5833 | 16 |

### 1.5 逐任务 GOV−NG（descriptive）

`task13:+0.000 · task24:+0.192 · task28:−0.256 · task32:−0.126 · task33:−0.498 · task39:−0.619 · task45:+1.138 · task54:+0.006`

- task45 是主离群点：NG 0.139 vs GOV 1.278，单点把 CI 撑到跨零。

### 1.6 灾难场回溯（NG Brier > 1.0 的场）

灾难场共 4 场（task33 两场、task39 两场）。治理臂在这些场的实际行为：

| 场 | NG Brier | 治理臂行为 | GOV Brier |
|---|---|---|---|
| task33 b1 | 1.460 | holdout（检测到分歧但硬币抽中不投）| 1.542 |
| task33 b2 | 1.627 | **exchange（触发）** | **0.549** |
| task39 b1 | 1.625 | ineligible（round-1 分歧 0.000，与 NG 的 0.800 开局不同）| 0.292 |
| task39 b2 | 1.420 | holdout（硬币抽中不投）| 1.516 |

- 唯一一次 exchange 在灾难场触发（task33 b2）时，Brier 从 1.627 降至 0.549。
- 另两场合格但抽中 holdout，灾难原样保留。
- task39 b1 不可比：GOV 与 NG 的 round-1 分歧不同（0.000 vs 0.800），说明同任务两场 round-1 并非逐字一致。

### 1.7 探测器漏检

- task45 b2：治理臂 round-1 分歧 0.700（< 0.8 阈值）→ 判 ineligible → 未触发 → Brier 2.000（灾难）；同任务 NG 场分歧 0.900、Brier 0.000（满分）。

### 1.8 无治理基线

- 无治理 16 场均值 Brier 0.6222、accuracy 58.3%，但呈两极分化：半数近满分（0.000–0.139），两场灾难（1.42–1.63）。
- 无治理 16 场共 16 个 invalid/failed 最终报告（平均每场 1 个）。

## 2. INFERENCE

- ITT 点估计方向偏有利但幅度极小，且 CI 跨零、含一个强离群点（task45）→ **不足以宣称治理有效或无效**。
- 灾难场中 exchange 仅在 1/4 场被允许触发，且该场 Brier 大幅下降（1.627→0.549）；**方向上与"exchange 对高分歧灾难场有帮助"一致，但 n=1，不是证据**。
- 主 ITT 被两个设计因素稀释：(a) 合格场 50/50 holdout 硬币使治理臂一半时间"检测到也不投"；(b) 同任务 GOV/NG 两场 round-1 因 provider 非确定性而不同，配对不干净。
- 0.8 分歧阈值在 task45 b2 出现漏检（0.700 仍灾难），说明该阈值不是"会翻车"的可靠探测器。

## 3. LIMITATION

- n=16/臂、仅 8 任务簇；分层后 exchange/holdout 各仅 7 场。
- 仅 DeepSeek `deepseek-chat`、temperature 0（仍非逐字确定，且未传固定 seed）、单一 prompt/profile。
- 无治理基线自身含每场约 1 个 invalid 最终报告，数据质量未先治理。
- pooled Brier 是该协议下 final private belief report 的 proper loss，不测量 latent belief、detector validity 或现实部署价值。
- 本报告的机制分解与灾难回溯为 exploratory/descriptive，不构成因果或有效性证据。

## 4. 停用后设计问题（HYPOTHESIS / DESIGN INTENT，未实现）

1. 若目标是"该机制在灾难场是否有用"，合格场应让 exchange 大概率出手，而非 50/50 holdout 稀释。
2. 分歧阈值（0.8）需重新审视其作为"会翻车"探测器的有效性（task45 b2 漏检）。
3. 同任务两场 round-1 不逐字一致，未来配对设计需显式固定 provider seed 或改用相同 round-1 重放。

## 5. 命令与位置

- 分析器：`experiments/campaign/v6/analyze_v6_cross_evidence_exchange.ts`（只读，零 provider）。
- 禁用门：`CROSS_EVIDENCE_EXCHANGE_DISABLED = true`（`run_v6_cross_evidence_exchange.ts`），`--execute` exit 6。
- Round 1 artifact：`experiments/campaign/pilot_output/v6-cross-evidence-exchange-v1-20260815/`（32 raw-run）。
- Round 2 artifact：`experiments/campaign/pilot_output/v6-cross-evidence-exchange-v1-20260815-r2/`（32 raw-run）。
- 测试：`test/v6-cross-evidence-exchange.test.ts`（含 disable 门测试）。

---

## 6. Round 2（design amendment：0.9/0.1 arms）

设计变更（FACT）：合格场 exchange/holdout 从 0.5/0.5 改为 0.9/0.1（`CROSS_EVIDENCE_EXCHANGE_ARMS`），以消除 round 1 的 holdout 稀释；分歧阈值 0.8、任务集、plan contentHash 不变。

### 6.1 FACT

- 32/32 完成，32/32 通过 `verifyRawRunData`；provider 372 调用、370,885 token。
- 臂分布：governance=16（exchange 10 / holdout 2 / ineligible 4），no-governance=16（ineligible 16）。
- 主估计 ITT：GOV 均值 Brier 0.6879，NG 0.5950，点估计 **+0.0929**；bootstrap median +0.0913，95% CI [−0.2443, +0.4616]，validFraction 1.0000。
- DEFER 原因：点估计 ≥ 0 且 bootstrap 95% 上界 ≥ 0。
- 机制分解（exploratory）：exchange n=10 meanBrier 0.6573；holdout n=2 0.5237；gov ineligible n=4 0.8464；no-governance n=16 0.5950。
- 逐任务 GOV−NG：`task13:+0.017 · task24:+1.016 · task28:−0.248 · task32:−0.020 · task33:+0.687 · task39:+0.000 · task45:−0.731 · task54:+0.021`。

### 6.2 INFERENCE

- 提高 exchange 暴露（0.9/0.1）后，ITT 点估计由 round 1 的 −0.0204 变为 **+0.0929**（方向偏不利）。这与"exchange 有益"不一致，但两轮 CI 均跨零，不构成对任一方向的证据。
- exchange 子组（n=10）meanBrier 0.6573 高于 no-governance（0.5950），且高于 round 1 exchange 子组（0.4740）；方向不支持"exchange 改善决策质量"。
- 两轮合计：exchange 机制在 8 任务 × 2 轮下无任何可读的正向效应；round 2 的点估计方向反而偏负。

### 6.3 LIMITATION（在 §3 基础上追加）

- 两轮同任务、同 provider，round-1 非确定性仍存在；round 2 与 round 1 的 NG 基线本身不同（0.5950 vs 0.6222），说明跨轮对比亦含抽样噪声。
- n 仍为 16/臂、8 任务簇，任何一单任务（如 round 2 的 task24 +1.016 或 round 1 的 task45 +1.138）都能翻转点估计方向。
- 本结论仅适用于该 frozen 设计（DeepSeek deepseek-chat、temperature 0、该 8 任务集、该分歧阈值）；不推广到其他模型、任务或干预。

---

## 7. 机制级发现：exchange 会放大"最响的分歧"、漏掉"最安静的关键信息"

### 7.1 FACT

- 逐场追踪 round-1→round-2 最大分歧变化（dTV = r2 − r1）：
  - 收敛（dTV < 0）：task33 b2（−0.300，Brier 0.216）、task24 b1、task13 b1、task32 b1。
  - 放大（dTV > 0）：**task39 b1（+0.200，Brier 1.516）**、**task39 b2（+0.200，Brier 1.625）**、task13 b2（+0.200）、task45 b2（+0.100）。
- task39 的 exchange 消息原文只亮出「LZ Bravo」「LZ Charlie」两方的证据；**正确答案是「LZ Alpha」，其关键证据未被任何被亮出的 agent 持有，因此从未被讨论**。群体从"分歧"走向"更分歧"，最终自信地全错。
- task33 b2 的对照：exchange 消息里顺带出现了「Lab Nova（正确答案）最近翻修但接单少」这条线索，群体顺它收敛到 Lab Nova，Brier 0.216。
- Round 1 的 exchange **从未在 task39 上触发**（b1 分歧 0.000 判不合格、b2 抽中 holdout），故 round 1 exchange 子组均值 0.474 未包含 task39 这个最坏案例。

### 7.2 INFERENCE

- exchange 只把"最分歧双方各自已经相信的证据"互相投喂，是**确认偏误放大器**：它强化的是已经在讨论里最响的（且可能都错）的立场。
- 正确答案往往依赖**未被讨论的隐藏信息（hidden profile）**——它握在最安静/最独特的 agent 手里，而 max-disagreement pair 选择器恰恰忽略了这个 agent。
- 因此 round 1 的"好成绩"部分是幸存者偏差（机制从未在 task39 上被检验），round 2 提高暴露后才暴露其放大分歧的失效模式。
- 核查引擎（verification）是"单向权威纠错"，不会产生"双向回声放大"，故无此失效模式——两类干预的机制本质不同。

### 7.3 结论（HYPOTHESIS，待下一版干预检验）

- 若干预目标是"让证据充分讨论"，正确形式不是"亮出最分歧的双方"，而是"亮出**未被讨论**的证据"（引用覆盖最低的注册私有信息），以补上 hidden profile。

---

## 8. 根因修正 + attacks 披露（round 3-4）

§7.3 的"覆盖缺口"假设随后被数据**部分证伪**：回算 64 场，"未讨论证据占比"与最终 Brier 相关仅 `-0.112`（无预测力）。原因是"逐字哈希匹配"会把**改写引用**误判成"未讨论"。真正的根因在下一层。

### 8.1 FACT（根因：supports-only 过滤器）

- `crossEvidenceExchangeSelectorsV1.ts` 的 `selectCrossEvidenceV1` 曾硬编码 `filter(ref => ref.relation === "supports")`，**丢弃所有 `attacks`（证伪）证据**。
- 64 场 round-1 里 `supports=423`、`attacks=375`，**证伪证据本就大量存在、且已被引用**，只是被这个过滤器扔掉。
- task39 的证伪证据（"Charlie 应急电源故障"、"Bravo 跑道被淹"、"Charlie 侧风超限"）**全在 round-1 的 attacks 证据里**，supports 版 exchange 一条都没亮。

### 8.2 FACT（修复 + round 3-4 结果）

- 修复：`selectCrossEvidenceV1` 参数化 `relation`；新增 `createDisconfirmingEvidenceSelectorV1()`（亮全部 attacks，去重）；round 3-4 用 `CROSS_EVIDENCE_EXCHANGE_DISCLOSURE_MODE="attacks"`。
- 触发场对比（同任务、同触发、0.9/0.1 arms）：

| 披露 | n | 均值 Brier | 准确率 |
|---|---|---|---|
| attacks（r3+r4）| 18 | **0.0764** | **100%** |
| supports（r1+r2）| 17 | 0.5819 | 58.3% |

- attacks 触发场逐任务（r3+r4）：task39=0.000、task45=0.004、task24=0.000、task54=0.000、task33=0.030、task13=0.167、task32=0.200——旧灾难任务全部转满分。

### 8.3 INFERENCE

- "亮证伪证据"远优于"亮吹捧证据"，且 n=18 后差距未缩水——支持"supports-only 过滤器是 exchange 失效的根因"。
- task39 从 supports 灾难（1.5）到 attacks 满分（0.000），是机制级证据：补上证伪证据即纠正假共识。

### 8.4 保留（LIMITATION，未解决）

- **阈值漏检**：attacks 轮 10 个 ineligible 场（分歧 < 0.8）均值 Brier 0.93、准确率 30%，未被干预、继续翻车。0.8 阈值作为"该干预"探测器不可靠。
- **选择效应未排除**：臂内 holdout（合格但不披露）n=2，不足以排除"合格场本来就容易"的替代解释。
- **标注噪声**：attacks 证据里混有误标项（如"Charlie 主跑道仍开放"被标 attacks），披露内容非纯证伪信号。
- n=18 仍是小样本，跨轮 round-1 非确定性未消除。

### 8.5 下一步（HYPOTHESIS / DESIGN INTENT）

1. 修 0.8 阈值漏检（重新定义"该干预"的触发条件），让漏检场也被干预；
2. 加 holdout 样本，排除选择效应、钉死因果；
3. 或直接以"supports-only 过滤器 bug + attacks 修复的强效应"作为本轮机制发现的结论收口。

---

## 9. r5 补充 + 权威口径（2026-08-15）

r5（第 5 轮 attacks，32 runs）完成后，触发场合并口径更新：

| 披露 | n | 均值 Brier | 准确率 |
|---|---|---|---|
| attacks（r3+r4+r5）| **30** | **0.090** | **97%** |
| supports（r1+r2）| 17 | 0.582 | 58% |

- 权威 pooled 口径（仅 descriptive，confounded by NG 漂移）：attacks n=30、Brier 0.090、97%；supports n=17、Brier 0.582、58%。
- **主结论口径（within-round exchange−NG，不受跨轮漂移混杂）**：attacks 三轮 −0.344 / −0.546 / −0.525；supports 两轮 −0.148 / +0.062；LOO 全负（−0.331 ~ −0.539）；per-task 7/8 同号、0 正号。
- 以上 §8.2 的 n=18 是 r5 前口径，已被 n=30 取代。
