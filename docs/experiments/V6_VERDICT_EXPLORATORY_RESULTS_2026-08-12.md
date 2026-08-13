# v6 Verification Verdict V2 — Medium-Scale Exploratory Results

日期：2026-08-12
状态：FINAL（确定性执行 + 全量 replay + 冻结分析完成；探索性结论，非确认性）
冻结方案：[`v6_verdict_exploratory_plan_v1.json`](../../experiments/campaign/v6/v6_verdict_exploratory_plan_v1.json)
执行器：[`run_v6_verdict_exploratory.ts`](../../experiments/campaign/v6/run_v6_verdict_exploratory.ts)
分析器：[`analyze_v6_verdict_exploratory.ts`](../../experiments/campaign/v6/analyze_v6_verdict_exploratory.ts)
输出目录：`experiments/campaign/pilot_output/v6-verdict-exploratory-v1-20260812`（80 个 raw-run.v5.json）

按 [`docs/REASONING_PROTOCOL.md`](../REASONING_PROTOCOL.md) 纪律，本文严格区分 FACT / INFERENCE / HYPOTHESIS / LIMITATION；探索性结果不写成确认性结论。

---

## 1. 冻结计划（FACT）

- experimentRef：`swarmalpha.experiment.v6-verdict-exploratory-v1@1.0.0`
- 冻结 task 顺序（20 题，排除开发题 {1,4,8,9,17}，按 `swarmalpha-v2-exploratory-v1:${taskId}` 的 SHA-256 在 stratum 内排序）：
  43, 41, 10, 36, 46, 62, 59, 56, 2, 42, 44, 48, 60, 26, 58, 6, 30, 34, 25, 53
- profile：`mechanism-verdict-v2-v1`；certainty threshold = 0.7
- 每 task：B-arm `explicit_belief_v1` ×2、G-arm `epistemic_governance_v1` ×2；交错 B-r1 → G-r1 → B-r2 → G-r2
- 总 run：80（B=40，G=40）
- Stage-2：apply 0.50 / sham 0.25 / holdout 0.25
- verification response contract：`verdict_json_v2`；provider `deepseek:deepseek-chat@1.0.0`，temperature 0
- 硬预算：maxProviderCalls = 1200，maxTotalTokens = 1,500,000
- 计划 contentHash：`sha256:9cdc494f55eda29bb1c6594ad3d3c8de5a151e6af15ffbb326ec392f84251e93`

## 2. 运行数量与停止状态（FACT）

- 计划 run：80；实际完成：**80/80**，执行进程 exit 0。
- provider calls（实际，authoritative）：**948** / 1200
- total tokens（实际）：**1,005,975** / 1,500,000
- 停止状态：正常完成（未触发预算中断 / 结构性中断 / provider≥5 失败）。
- 重试 / 补样本 / 换任务 / 挑 seed：**无**。单次调用、顺序执行、无内部 retry。

## 3. Artifact / replay 完整性（FACT）

- raw-run artifact 数：**80 / 80**
- `verifyRawRunData` 零 issue 且 `sealed_decision_replay_verified`：**80 / 80**
- V2 安全检查：**全部通过**（apply=17、sham=7、holdout=2；详见 §7）
- 分析层发现并修正一处分类 bug（见 §11 偏离），修正后重放与分析基于冻结 artifact，未改动执行结果。

## 4. RQ-M：B-arm round-1 explicit belief 报告（FACT）

> 只使用 B-arm round-1 报告，避免治理处理污染。以下只支持 preliminary repeat stability / calibration characterization / predictive utility。

### 4.1 Coverage

- expected reports：**154**；valid：**142**；invalid：**11**；unavailable：**1**
- overall valid coverage：**0.9221**
- task-level coverage：min **0.625** / median **1.000** / max **1.000**（无 task < 0.5）

### 4.2 Exact-repeat stability（B-r1 vs B-r2，同 task 同 agent role）

- registered pairs：**77**；complete pairs：**66**；pair coverage：**0.8571**
- base-2 JSD：median **0.0050**；P90 **0.1348**
- argmax agreement（精确集合）：**0.7727**
- **exact repeat 不称为 paraphrase validity。**

### 4.3 Calibration / predictive（按 categorical K 分层）

| 指标 | K=3（n=121） | K=4（n=21） |
|---|---|---|
| multiclass Brier mean | 0.9275 | 1.0776 |
| reported certainty（max prob）flag rate（≥0.7）| 0.6446 | 0.6190 |
| unique-argmax correct / incorrect / tie | 40 / 79 / 2 | 3 / 18 / 0 |
| P(error \| flagged) | 0.7436 | 0.9231 |
| P(error \| unflagged) | 0.4884 | 0.7500 |
| flagged − unflagged Brier gap | +0.4217 | +0.3293 |
| precision / recall / specificity | 0.7436 / 0.7342 / 0.5238 | 0.9231 / 0.6667 / 0.6667 |
| reliability（固定 bins）+ ECE（secondary）| ECE **0.4046** | — |

Reliability bins（certainty）：[0.4,0.5) n=6 conf .408 acc .333；[0.5,0.6) n=16 conf .500 acc .563；[0.6,0.7) n=29 conf .602 acc .379；[0.7,0.8) n=48 conf .700 acc **.208**；[0.8,0.9) n=27 conf .802 acc .333；[0.9,1.0] n=16 conf **.956** acc **.125**。→ 高置信 bin 显著过度自信。

**INFERENCE（preliminary）**：在本工程 task 样本中，B-arm round-1 报告的 mean Brier（K=3 为 0.93）高于均匀基线（K=3 为 0.667）；certainty≥0.7 的 flag 与错误**正相关**（P(error|flagged) > P(error|unflagged)），即初步表现为反预测。这是对显式信念报告仪器的初步校准描述，不是有效性结论。

## 5. RQ-G：eligible randomized G events（FACT，estimand）

> Primary estimand：mean(final pooled operational Brier | apply) − mean(… | holdout)。lower is better，负值利好 apply。
> **本批 primary 判定为 DEFER_INSUFFICIENT**（冻结规则，见 §5.4）。不得将 B 与 G 作因果对比。

### 5.1 arm 构成

- planned G runs：**40**；eligible：**26**；ineligible：**14**
- arm n：apply **17**（12 task clusters）／ sham **7**（5 clusters）／ holdout **2**（2 clusters）

### 5.2 每臂 pooled Brier

| arm | n | mean | median | SD | mean accuracy | total tokens | invalidOrFailed/run |
|---|---|---|---|---|---|---|---|
| apply | 17 | 0.6548 | 0.6667 | 0.5922 | 0.4667 | 233,907 | 0.76 |
| sham | 7 | 0.5233 | 0.7425 | 0.4091 | 0.4286 | 88,679 | 1.57 |
| holdout | 2 | 0.8906 | 0.8906 | 1.2595 | 0.5000 | 23,355 | 0.00 |

### 5.3 Primary estimand（apply − holdout）

- naive mean difference：**−0.2358**（apply 更低 = 利好 apply 方向）
- 10,000 次 task-cluster bootstrap：median **−0.2081**；95% CI **[−1.2626, +0.7565]**
- bootstrap valid fraction：**0.8775**

### 5.4 DEFER_INSUFFICIENT（冻结规则触发）

> 触发条件（任一即 DEFER，不得补样本）：holdout n=2<5；holdout task clusters=2<5；bootstrap valid fraction 0.8775<0.95。→ **RQ-G primary 不解释**，不写任何 exploratory effect。

### 5.5 Secondary（描述性，不构成主张）

- apply − sham：+0.1315；sham − holdout：−0.3674
- apply verdict 分布：**insufficient_evidence=12、supported=4、contradicted=1**；apply insufficient_evidence 比例 **0.7059**
- 全部 missing/invalid terminal 保留在 ITT 分母（operational outcome missingness contract）。

## 6. Task-level raw table（FACT，G 臂 eligible 事件）

| task | run | arm | pooled Brier | accuracy | verdict |
|---|---|---|---|---|---|
| 43 | G:r1 | apply | 0.5000 | — | insufficient_evidence |
| 43 | G:r2 | apply | 0.0000 | 1 | insufficient_evidence |
| 10 | G:r2 | apply | 0.1517 | 1 | insufficient_evidence |
| 36 | G:r1 | holdout | 0.0000 | 1 | — |
| 46 | G:r1 | holdout | 1.7813 | 0 | — |
| 46 | G:r2 | apply | **2.0000** | 0 | supported |
| 59 | G:r1 | apply | 0.0000 | 1 | insufficient_evidence |
| 56 | G:r1 | apply | 0.6667 | — | insufficient_evidence |
| 56 | G:r2 | apply | 0.9817 | 0 | insufficient_evidence |
| 2 | G:r1 | sham | 0.0000 | 1 | — |
| 2 | G:r2 | apply | 0.0000 | 1 | supported |
| 44 | G:r1 | sham | 0.0087 | 1 | — |
| 44 | G:r2 | apply | 0.9950 | 0 | supported |
| 48 | G:r1 | apply | 1.2950 | 0 | supported |
| 48 | G:r2 | apply | 0.8600 | 0 | insufficient_evidence |
| 60 | G:r1 | sham | 0.7462 | 0 | — |
| 60 | G:r2 | sham | 0.8138 | 0 | — |
| 26 | G:r1 | apply | 0.8213 | 0 | insufficient_evidence |
| 26 | G:r2 | apply | 0.8150 | 0 | insufficient_evidence |
| 58 | G:r1 | sham | 0.3317 | 1 | — |
| 30 | G:r1 | apply | 0.1267 | 1 | insufficient_evidence |
| 34 | G:r1 | apply | 0.1867 | 1 | contradicted |
| 34 | G:r2 | apply | 0.1867 | 1 | insufficient_evidence |
| 25 | G:r1 | sham | 0.7425 | 0 | — |
| 25 | G:r2 | sham | 1.0200 | 0 | — |
| 53 | G:r2 | apply | 1.5450 | 0 | insufficient_evidence |

（task 41、62、6、30:G:r2、53:G:r1 等 14 个 G run 无 eligible 事件，不入表。）

## 7. V2 verdict 分布与安全检查（FACT）

- apply（17）：全部 verification-result event v2.0.0；evidenceScope=`public_only`；verdict ∈ {supported, contradicted, insufficient_evidence}；无 alternativeOutcome/correctAnswer/recommendedAnswer 字段；source event 与 governance transcript 逐字段一致；`sealed_decision_replay_verified`；`verifyRawRunData` 零 issue。
- sham（7）：matched-attention provider call 存在；event 为 V1 control carrier（固定文本 "Matched control completed; no new evidence was introduced."）；无 verdict / evidenceScope authority；无 task evidence 进入固定 control 内容。
- holdout（2）：无 verification-result source event；`eligible → held_out` terminal。
- ineligible（14）：无 eligible 随机化事件，不入 RQ-G 分析。

## 8. 失败 / 缺失情况（FACT）

- RQ-M coverage：11 invalid + 1 unavailable（154 期望报告中），已计入分母。
- G 臂验证投递：**全部 26 个 assigned 事件投递成功**（无 queued→failed）；17 apply + 7 sham 均 delivered→completed。
- 无 run 无法完成；无结构性异常；无预算中断。

## 9. 什么已经建立（INFERENCE，受 LIMITATION 约束）

- RQ-M：在冻结工程 task 样本上，显式信念报告表现出初步的**重复稳定性**（同 task 同 role 的 exact-repeat median JSD 0.005、argmax 一致率 0.77，pair coverage 0.857）；初步**校准刻画**显示显著过度自信（ECE 0.40，高置信 bin 实证准确率远低于置信度）；certainty≥0.7 flag 初步为**反预测**（K=3：P(error|flagged) 0.74 > P(error|unflagged) 0.49）。这些只是表征，不是有效性证明。
- RQ-G：**未建立任何 apply−holdout 效应**——primary 因 holdout 支持不足判定 DEFER_INSUFFICIENT，任何方向数字（naive −0.24、bootstrap CI [−1.26, +0.76]）都不可解释为效应。
- V2 机制层：80 个 artifact 全量 replay 通过、apply/sham/holdout 语义与冻结契约一致，机制在工程样本上可执行。

## 10. 什么仍未建立（LIMITATION）

- **非 confirmatory、非 general governance efficacy、非 AAMAS-ready。**
- RQ-G primary 不可解释（DEFER）；不写 "apply 改善/损害 pooled Brier"。
- latent belief validity、semantic paraphrase validity、universal detector validity、"测量精准"无条件结论均未建立。
- RQ-M 的反预测 flag 仅限本工程样本；exact repeat ≠ paraphrase validity；ECE 为 secondary。
- apply 中出现 verdict=supported 但 pooled Brier=2.0 的案例（task-46:G:r2）——仅作机制观察记录，n 不足，不构成因果或 verifier-accuracy 结论。

## 11. 偏离与修正（FACT）

- **分析层 bug（已修正）**：初版 `armOf` 以 action instance 判断臂，而每个 eligible 事件都携带候选 action instance（含被 hold out 的事件），导致 task-36/46 G:r1 被误标为 apply。修正为：先判 `held_out` 再判 `assigned`+actionRef。此 bug 仅在分析/重放层，未改动冻结计划、执行或任何 artifact；修正后 80/80 replay 通过、臂计数为 apply=17/sham=7/holdout=2/ineligible=14。
- **repeat-pair 分母修正（已修正）**：初版分析只从至少出现过一次合法报告的观察集合注册 pair，使双侧均失败的一个 `<task, agent role>` 从分母消失。现改为从冻结 task roster 注册分母；registered pairs 由 76 修正为 77，complete pairs 保持 66，pair coverage 由 0.8684 修正为 0.8571。JSD 与 argmax 只在 complete pairs 上计算，数值不变。
- **token 计划口径失准（LIMITATION）**：冻结计划中的 `totalEstimatedTokens=14,340` 只按极小的预期输出长度近似，没有计入长输入上下文；实际用量为 1,005,975（约为估计的 70.2 倍）。硬上限 1,500,000 仍正确阻止预算越界，但该 estimate 不具备成本预测效度。不得回写已执行计划或改变其 content hash；下一批计划必须以本批实测 usage 的 run-level 分布及安全分位数设预算，不再复用该估算公式。
- 无其他偏离：未改白名单外文件；未重试、补样本、换任务、挑 seed。

## 12. 是否建议扩大实验

**建议（HYPOTHESIS / SPECULATION，供 Codex 决定）**：
- RQ-M 的反预测 flag 与高 Brier 值得一次更大规模的、预注册的信念校准检验（更多 task、更多 K、可能更多模型），以区分是任务样本偏差还是仪器系统性问题。
- RQ-G primary 本批因 holdout 支持不足 DEFER；若继续，需预注册更大 eligible 样本（或调整 stage-2 分配使 holdout 达到 ≥5 cluster），且不得把本批 DEFER 结果当 pilot 依据。
- 在 RQ-G 可解释前，不应启动任何 confirmatory 治理主张或论文级结论。

---

## 附：关键 red-zone / 停止条件核对（FACT）

| 条件 | 判定 |
|---|---|
| artifact replay failure | **无**（80/80 verifyRawRunData 零 issue） |
| study/profile/contract/hash mismatch | **无**（计划 no-replace 一致；replay 一致） |
| truth/private leakage | **无**（验证请求 public-only；prompt 无 hidden 子句，FACT） |
| V2 apply 仍产生 V1 event | **无**（apply 全部 v2.0.0） |
| apply 携带替代答案字段 | **无**（17/17 无 alternativeOutcome/correctAnswer/recommendedAnswer） |
| sham 获得 verdict authority | **无**（sham 7/7 为 V1 control carrier） |
| provider 错误累计 5 run 无法完成 | **无**（0 run 无法完成） |
