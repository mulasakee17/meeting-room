# SwarmAlpha Measurement Validity Protocol v1

日期：2026-08-12

状态：NORMATIVE DESIGN；统计对象与 Gate 已冻结，生产 artifact 与分析实现尚未完成

适用范围：V6 binary/categorical reported-belief、统一 final private elicitation、后续 detector 与治理实验的测量资格

---

## 0. 决策摘要

SwarmAlpha 当前测量的不是 Agent 的潜在“真实信念”，而是：

> 在冻结的 claim、信息条件、elicitation contract、模型配置和时点下，Agent 生成的可审计概率报告。

该报告只有依次通过以下检验，才获得不同层级的研究用途：

1. **Q0 structural-qualified**：请求能闭合为唯一 terminal record，载体可解析、可重放；
2. **Q1 response-qualified**：对语义等价扰动稳定，对已知证据变化有方向正确且非平凡的响应；
3. **Q2 outcome-qualified**：在独立 held-out resolution 上相对冻结的非报告基线提供 proper-loss 增量；
4. **Q3 transport-characterized**：跨模型、任务族、K 和 protocol stratum 的适用域与失效域被报告。

Q0 不蕴含 Q1；Q1 不蕴含 Q2；Q3 不表示“普适”，只表示已测域内的 transport characterization。

资格按 `instrumentKind × beliefKind × K × model/config domain × task-family domain` 版本化。一个 domain 的通过不外推到另一个 domain。

三个直接后果：

- final private report 未达到 Q2，不得启动治理效果主张；
- interaction 中的 explicit report 未达到 Q1，不得作为 detector、mediator 或治理资格信号；
- 任一报告即使通过本协议，也不得称为 latent belief、真实内心状态或 calibrated mind state。

---

## 1. 验证对象必须拆成两个 instrument

### 1.1 Final-outcome instrument

对象：统一 final private elicitation 产生的 terminal belief report。

用途：I/T/B/G 之间的独立终局 outcome measurement，以及 operational pooled Brier 的输入。

最低资格：正式 I/T/B 实验前达到 Q2。

### 1.2 In-process explicit-report instrument

对象：B/G 互动过程中显式输出的 claim-relative probability report。

用途：描述 belief revision、构造 pre-action census、开发 detector、检验 propagation mediator。

最低资格：进入 detector development 前达到 Q1；进入治理资格规则还需单独通过 held-out detector validity，不能由 Q1 自动授权。

### 1.3 不得混淆的比较

- “final instrument 是否有效”是测量问题；
- “B 相对 T 是否改善 final outcome”是 protocol-arm treatment effect；
- “某个 G action 是否改善 outcome”是 G 内 governance-action effect；
- “B 中间报告是否预测 loss”是 detector/mediator validity。

测量资格不能用 B>T 或 G>B 的效果反向证明，否则形成循环论证。

---

## 2. 为什么不能只在 HiddenBench 上做全部测量效度

**FACT：**HiddenBench pinned data 提供固定 categorical task、分布式 private information 和独立 resolution，适合检验 option-order、paraphrase、final-outcome proper loss 与信息整合。

**LIMITATION：**其自然语言 profile 没有预先给定的 likelihood ratio 或证据强度刻度。把某段 profile 主观标成“强证据”会把研究者判断混入测量效度。

因此 v1 使用两个互补任务层：

| 层 | 用途 | 可支持的结论 |
|---|---|---|
| Controlled-evidence fixtures | 从已知生成分布或冻结 likelihood ladder 构造证据方向/强度 | evidence responsiveness、monotonicity、报告尺度响应 |
| HiddenBench task projection | 保留自然任务语义、私有信息与独立 resolution | paraphrase/order robustness、coverage、held-out proper loss、任务外推边界 |

不得用 controlled fixtures 的正结果声称自然任务效度；也不得用 HiddenBench 的 outcome accuracy 冒充已知证据强度响应。

---

## 3. 测量实验不是治理实验

### 3.1 术语

- `protocol-arm assignment`：I/T/B/G 的 run-level 分配；
- `governance-action assignment`：G 内 eligible event 的 apply/holdout/sham；
- `measurement-condition assignment`：本协议中对 evidence/paraphrase/order/repeat 条件的配对或分块分配。

第三种分配不获得治理权限，也不能触发 action。

### 3.2 防污染要求

每个 measurement response 必须来自独立请求或独立 run：

- 不得向模型展示同 block 的其他 variant；
- 不得展示前一次回答；
- 不得在失败后内部 retry；
- resolution 在 block 全部 terminal record 关闭前不可进入请求；
- variant 顺序应在 block 内随机化或平衡；
- modelRef、invocationConfig、prompt contract、task family 与 agent/view identity 必须冻结并进入 design hash。

---

## 4. 权威分析单位

### 4.1 Measurement block

最小配对单位为：

```text
<measurementDesignRef,
 baseSemanticTaskRef,
 leakageGroupId,
 instrumentKind,
 agentOrViewRef,
 modelRef,
 invocationConfigHash,
 replicateIndex>
```

同一 block 内只允许预注册的 measurement conditions 变化。其他字段变化意味着不是配对比较。

### 4.2 统计独立单位

- response-level 行不是独立样本；
- 同 run 的多个 Agent 不是独立样本；
- 同一 base task 的 paraphrase、option permutation、evidence level 不是独立样本；
- primary uncertainty 以 `leakageGroupId/baseSemanticTaskRef` 聚类；
- model/task family/K 是预注册 stratum，不得事后合并掩盖失效。

### 4.3 Canonical coordinates

categorical probability 必须先依据 design 中冻结的 bijection 映回 base claim 的 canonical option order，再计算任意距离、argmax 或 proper loss。映射缺失、非双射、选项增删或 claim 漂移时，整个 cell fail-closed。

tie 的 hard prediction 定义为所有最大概率选项的集合；不得通过选项顺序打破平局。

---

## 5. 扰动族与构念边界

### 5.1 `exact_repeat`

除独立 provider call identity 与 preregistered seed 外完全相同。用于估计生成与 provider 噪声，不是语义稳定性的替代。

### 5.2 `semantic_paraphrase`

只改变表达，不改变 claim、resolution、公开事实、私有事实、证据关系、选项集合或角色权限。每个科学 variant 必须有人类 semantic review；自动相似度只能筛查，不能批准等价性。

### 5.3 `option_permutation`

只改变展示顺序。base option 与 variant option 之间必须有冻结双射；resolution 和概率向量在分析时反向映射。

### 5.4 `evidence_strength`

只用于存在预先冻结 ordinal ladder 的 controlled-evidence family。每一级绑定：

- designated target outcome；
- evidence payload hash；
- ordinal level；
- 若可得，生成模型给出的 signed log-likelihood ratio。

不得把研究者事后认为“更有说服力”的自然语言当作强度刻度。

### 5.5 `evidence_direction`

使用同一生成机制、近似匹配的信息量和相反的 designated target。它验证报告是否随输入证据改变，不验证 Agent 是否相信真命题。

### 5.6 `information_add_remove`

增加或删除 private information 会改变认识条件，而非纯 nuisance。它只进入 information sensitivity 和 integration 分析，不进入 paraphrase stability。

### 5.7 `model_or_protocol_stratum`

模型、temperature、provider 或 I/T/B 上下文变化不是等价扰动。它们用于 transport/invariance 描述，不能与 exact repeat 合并估计噪声。

---

## 6. 冻结指标

令报告概率向量为 `p`，canonical outcome 数为 `K`。

### 6.1 Coverage 与 missingness

分母是 preregistered measurement requests，而不是成功解析的报告：

```text
terminal_coverage = terminal_record_count / registered_request_count
valid_coverage = valid_belief_report_count / registered_request_count
pair_coverage = complete_pair_or_block_count / registered_pair_or_block_count
```

`invalid_response`、`provider_error`、`timeout`、`unavailable` 分开计数。每个 request 恰好一个 terminal status；不重试。配对 estimand 只在 complete block 上计算，但必须同时报告 pair coverage；不得以 complete-case 结果替代 missingness 结论。

### 6.2 Jensen–Shannon distance

使用 base-2 logarithm：

```text
JSD(p, q) = 0.5 * KL_2(p || m) + 0.5 * KL_2(q || m)
m = 0.5 * (p + q)
```

因此 `JSD ∈ [0,1]`。零概率项按信息论极限处理，不做任意平滑。

### 6.3 Total-variation error

```text
TV(p, q) = 0.5 * Σ_k |p_k - q_k|
```

用于 option-order equivariance；JSD 作为共报指标。

### 6.4 Paraphrase stability

对同一 block 的 semantic paraphrase 计算：

- pairwise JSD 的 median 与 P90；
- tie-aware argmax-set agreement；
- 相对 exact-repeat noise 的 excess JSD。

不把“均值接近”当作个体稳定，因为相反漂移会相互抵消。

### 6.5 Directional evidence response

对 designated target `y*`：

```text
delta_direction = p_support(y*) - p_counter(y*)
```

若 categorical manipulation 指定 target/comparator pair，同时报告 canonical pairwise log-odds shift；概率在记录中保持原值，数值分析可使用预注册 epsilon 进行有限化，但 epsilon 必须进入 analysis contract。

### 6.6 Evidence-strength response

至少三级 ordinal ladder 才计算：

- level 与 `p(y*)` 的 Spearman correlation；
- 相邻等级 `p_{l+1}(y*) < p_l(y*)` 的 violation rate；
- 若 fixture 有 signed log-likelihood ratio，报告 probability/log-odds response slope。

理想斜率不预设为 1；v1 只检验方向、非平凡幅度和跨 block 一致性。

### 6.7 Signal-to-nuisance ratio

```text
SNR_measure = median(nonzero evidence-pair JSD)
              / max(median(paraphrase-pair JSD), epsilon_frozen)
```

`epsilon_frozen` 只防止除零，并进入 freeze artifact。SNR 必须与分子、分母原值共报，禁止只报告比值。

### 6.8 Criterion/predictive validity

主损失使用现有 claim geometry 下的 Brier proper loss。每个 scientific stratum 的 baseline 在 held-out 开封前冻结：

1. uniform distribution；
2. development split 上估计并锁定的 constant/climatology report；
3. 若任务设计允许，预注册的 task-family-only baseline。

primary comparator 是上述合法 baseline 中在 development 上最强、且不使用 held-out label 的一个。报告：

```text
delta_brier = Brier(report) - Brier(frozen_primary_baseline)
```

负值表示报告提供增量。不得只用不平衡任务上的 uniform baseline 宣称 predictive validity。

binary Brier 与 categorical multiclass-Brier-sum 不得直接跨 K 池化。primary predictive Gate 必须按 belief kind/K stratum 判定；若需要总览，只能聚合每个 task 相对自身冻结 baseline 的 `delta_brier`，使用预注册的 cluster 等权规则，并同时保留各 K 结果。

### 6.9 Calibration

reliability curve、calibration intercept/slope、ECE 只在 episode 数与概率支持足够时作为 secondary characterization。单个或少量 Brier 不等于 calibration；ECE 不作为 Gate primary metric。

---

## 7. 不确定性与多重性

### 7.1 Cluster bootstrap

primary interval 以 leakage/base-task cluster 重采样，保留 cluster 内所有 Agent、variant、level 与 replicate。先在每个 block 计算配对 estimand，再在 cluster 内等权平均，最后对 cluster 等权聚合；不得让 Agent 数、replicate 数或 variant 数更多的 task 获得更高权重。默认使用 10,000 次 deterministic percentile cluster bootstrap，seed 与实现版本进入 analysis contract。

任何要求 bootstrap Gate 的 overall/stratum 分析至少需要 20 个独立 leakage/base-task cluster。少于 20 时标记 `insufficient_cluster_support`，不得退化为 report-level 独立区间，也不得通过合并本应分层的 model/task/instrument 来凑数。

### 7.2 Gate 是非补偿式的

coverage、stability、evidence response、equivariance、predictive increment 分别判定。某项大幅成功不能抵消另一项失败；不创建 measurement validity 总分。

“不适用”必须由结构决定并在 Freeze 中预注册，不能由结果决定。例如 categorical option-permutation Gate 对没有可展示选项顺序的 binary contract 可标 `structurally_not_applicable`；它不算失败，也不能被伪装成通过。每个申请 Q1 的 belief-domain 仍必须拥有同域 controlled-evidence response 与 paraphrase/repeat 证据。G 的 in-process instrument 只有在 report 发生前与已通过的 B instrument 使用逐字相同的 elicitation contract、信息视图和 provider config 时，才可继承 B 的 Q1；否则单独验证。

### 7.3 探索与确认

- development 可画图、调 parser、选择候选 prompt 和估计噪声；
- freeze 后不得依据 held-out 结果改变阈值、variant、baseline、聚类单位或排除规则；
- held-out 只按冻结 contract 运行一次；失败后的新版本必须获得新 designRef/version 和新 held-out split。

---

## 8. Freeze artifact 与 v1 Gate

### 8.1 调用前 Freeze：只承诺设计与注册分母

在任何 sealed held-out 开封前，必须存在不可替换的 `MeasurementValidityFreezeV1`，至少绑定：

- designRef/version/contentHash；
- instrument kind；
- task-bank/split/semantic-review refs；
- model/config/prompt refs；
- registered blocks、conditions、replicates；
- canonical mappings 与 evidence ladders；
- missingness policy；
- cluster unit、bootstrap count/seed；
- baseline selection rule 与最终 baseline ref；
- 下表全部阈值；
- excluded metrics 与理由；
- createdAt，且早于 held-out provider call。

Freeze 不得预填尚未产生的 response、raw artifact 或 final-outcome hash。它承诺的是“准备测什么、应产生多少 cell、如何分析”，而不是未来结果。

### 8.2 调用后 Result index：只封存已发生结果

所有注册 cell 到达 terminal status 后，必须生成不可替换的 `MeasurementValidityResultIndexV1`，逐 cell 绑定：

- design/freeze contentHash；
- block/cell/condition/replicate identity；
- runId 与 terminal status；
- task-manifest、raw artifact、final-outcome/interaction-trace 的 content hash；
- firstProviderAt 与 terminalAt；
- sealedAt。

Result index 不能新增未注册 cell，也不能删除失败 cell；其 cell 集必须与 Freeze 的注册分母完全一致。它提供仓库内的 no-replace、跨 artifact 完整性锚定，**不提供外部时间戳、签名、防伪造或真实世界真实性**。若论文需要证明仓库外部的事前承诺，仍需 detached manifest / trusted timestamp / signature；v1 尚未实现。

### 8.3 首轮 scientific-candidate 阈值

以下数值是 **DESIGN DECISION v1**，用于首轮 measurement-candidate Gate，不是跨任务自然常数。development 只能证明它们可执行；若要改动，必须 version bump 且在 held-out 前完成。

| Gate | v1 判据 |
|---|---|
| Coverage | overall valid coverage ≥ 0.90，且按 leakage/base-task cluster bootstrap 的 one-sided 95% lower bound ≥ 0.80；每个预注册 model×task-family×instrument stratum valid coverage ≥ 0.80。request-level Wilson 只能作描述性敏感性分析 |
| Pair completeness | registered pair/block completeness ≥ 0.80；任一 terminal failure status 不得在某 stratum 超过 0.20 |
| Paraphrase stability | median JSD ≤ 0.05，P90 JSD ≤ 0.15，tie-aware argmax agreement ≥ 0.85 |
| Option equivariance | median TV ≤ 0.05，P90 TV ≤ 0.15，tie-aware argmax agreement ≥ 0.90 |
| Direction response | cluster-bootstrap one-sided 95% lower bound of mean paired `delta_direction` > 0，且 paired median ≥ 0.10 |
| Strength response | 先按 block 计算 Spearman，再按 cluster 聚合；聚合方向为正且 one-sided 95% lower bound > 0；adjacent monotonicity violation rate ≤ 0.20 |
| Signal-to-nuisance | point SNR ≥ 2.0，且 cluster-bootstrap one-sided 95% lower bound > 1.0 |
| Predictive increment | held-out mean `delta_brier < 0`，且 cluster-bootstrap one-sided 95% upper bound < 0，相对冻结的 strongest eligible baseline |

阈值选择有意偏向“能支撑后续治理研究”而非“让仪器容易过关”。若样本量不足以形成所需区间，判为 `DEFER/INSUFFICIENT`，不是 GO。

### 8.4 分级结论

| 结论 | 必须通过 | 获得的权限 |
|---|---|---|
| Q0 | structural + coverage | 仅工程采集/描述 |
| Q1 | Q0 + paraphrase + option + evidence response + SNR | 可作 response instrument；explicit report 可进入 detector development |
| Q2 | Q1 + predictive increment | final report 可作论文 primary outcome instrument |
| Q3 | Q2 且各预注册 stratum 无未解释方向反转 | 仅限所测域的 transport characterization |

### 8.5 GO / REVISE / STOP

- **GO**：相应 instrument 达到目标 Q 级；
- **REVISE**：Q0 通过但 response/predictive Gate 失败且存在明确、可版本化的 instrument 问题；只能在 development 修改后重新冻结；
- **STOP**：报告对已知证据无方向响应、主要输出模板常数、轻微 paraphrase 导致任意漂移，或 outcome 信息不超过冻结 baseline；停止依赖该 instrument 的治理效果实验；
- **DEFER/INSUFFICIENT**：cluster、coverage 或事件数不足。不得把它写成通过，也不得用 report 数代替独立 cluster 扩大 N。

---

## 9. 与后续研究 Gate 的连接

```text
final report Q2
  └─> 允许 I/T/B primary-outcome experiment

explicit report Q1
  └─> 允许 detector development
        └─> held-out detector validity
              └─> governance opportunity qualification
                    └─> action information-gain qualification
                          └─> 允许 G arm
```

`CollectiveEpistemicStateV1` 可在 Q1 后作为 development/held-out 的 secondary predictor；它仍为 `descriptive_macrostate_only`，通过 ST-1 前不获得控制权限。

---

## 10. 当前实现映射

### 10.1 已实现且可复用（FACT）

- binary/categorical claim 与 canonical probability geometry；
- belief report validation 与 proper scoring；
- task manifest、ground-truth commitment 与 task-bank leakage split；
- single-attempt provider boundary；
- final elicitation terminal statuses、prompt/config/content hash；
- operational analysis unit、pooled Brier 与 schema-5 source replay；
- binary/categorical detector-validation projection。

### 10.2 实现状态（2026-08-12）

**IMPLEMENTED（确定性测试）：**

- `MeasurementValidityDesignV1` / `MeasurementValidityFreezeV1` / `MeasurementValidityResultIndexV1`（`experiments/campaign/measurement/measurementValidity.ts`）；
- base-task ↔ variant 权威映射、option 双射、evidence ladder、condition assignment、registered cells/replicates；
- measurement-condition assignment 与 no-replace store / read isolation；
- 确定性分析内核（`measurementValidityAnalysis.ts`）：coverage、base-2 JSD、TV、tie-aware argmax、paraphrase stability、option equivariance、directional/strength response、SNR（含分子分母）、Brier delta、cluster-equal-weight percentile bootstrap、Gate Q0–Q3 与 GO/REVISE/STOP/DEFER_INSUFFICIENT；
- 45 项对抗测试（`test/measurement-validity.test.ts`，含 36 项测试矩阵与必需额外项）。

**NOT IMPLEMENTED / NOT RUN：**

- held-out one-time opening workflow（真实 held-out 未开封）；
- measurement-validity report/certificate 输出；
- real provider runs（零付费，全部确定性 fixture）；
- empirical validity（任何 Gate 均未在真实数据上判定）。

**NOT RUN / LIMITATION：**

- 尚未有任何真实 `MeasurementValidityFreezeV1` 被产出并用于 sealed held-out；
- raw schema-5 未修改（`EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`）；ResultIndex 只提供仓库内 no-replace 完整性，不提供外部时间戳、签名或真实性。

### 10.3 schema 决策

v1 不修改 raw schema-5。调用前的 measurement design/freeze 引用既有 base/variant task-manifest，并冻结注册 cell；调用后的 result index 再引用 runId、raw artifact hash、final-outcome/interaction-trace hash。两者共同建立 source binding。只有 gap audit 证明这条两阶段绑定仍不唯一时，才由 Codex 决定 carrier version bump。

measurement development 与 sealed measurement held-out 的角色由 `MeasurementValidityDesignV1` 授权，不复用 `threshold_calibration`、`held_out_detector` 或 `confirmatory` 的含义。进入这两个角色的 source task 必须具有 accepted semantic review；同一 leakage group 不得跨 measurement development/held-out，也不得跨入 detector held-out 或 confirmatory。该隔离规则尚未实现。

---

## 11. 实现顺序与停止边界

1. 只读 carrier/gap audit：验证现有 raw artifact 是否能唯一绑定 measurement cell；
2. 由 Codex 冻结 design/freeze/row 的 public contract；
3. 低风险模型实现 deterministic validators、stores、fixtures、analysis functions 与对抗测试；
4. Codex 审核 source authority、missingness、配对单位和数值实现；
5. 跑零付费 deterministic fixture；
6. 跑小规模 development pilot；
7. 生成并冻结真实 `MeasurementValidityFreezeV1`；
8. 仅在 owner 明确批准后运行 sealed held-out；
9. 全部 cell terminal 后封存 `MeasurementValidityResultIndexV1`，再运行冻结分析。

以下情况立即停止并返回 Codex：

- variant 无法唯一追溯到 base semantic task；
- option mapping 非双射；
- evidence strength 依赖事后主观标注；
- resolution 或同 block 回答泄漏给 provider；
- retry 改写 missingness；
- analysis 把 Agent/report 当独立样本；
- held-out 被读取后改变 Gate；
- 为接线而静默改变 belief、final-outcome 或 schema-5 语义。

---

## 12. Claim ceiling

通过本协议最多支持：

> 在指定 task/model/protocol domain 内，结构化 reported probability 对预注册的语义等价扰动具有有限稳定性，对已知证据操纵具有方向响应，并对独立 resolution 提供超出冻结基线的 proper-loss 信息。

它不支持：

- Agent 内心信念被读取；
- 跨模型天然可比较的绝对 confidence；
- detector 已有效；
- governance 已有效；
- 社会热力学定律成立；
- 未测试任务、语言、组织或 principal 上的普适性。
