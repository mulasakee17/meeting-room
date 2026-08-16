# Measurement Validity v1 — Adversarial Test Matrix

日期：2026-08-12
状态：Work Package B — 测试规格（specification only，不写测试代码）；**已实现为确定性测试（IMPLEMENTED_BUT_NOT_CODEX_ACCEPTED，尚未经 Codex 审核验收）**
权威协议：[`MEASUREMENT_VALIDITY_PROTOCOL_V1.md`](../architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md)
配套审计：[`MEASUREMENT_VALIDITY_WIRING_GAP_AUDIT_2026-08-12.md`](../archive/plans/MEASUREMENT_VALIDITY_WIRING_GAP_AUDIT_2026-08-12.md)

> **实现状态（2026-08-12 晚，FACT）**：本矩阵已实现为 `test/measurement-validity.test.ts` 中的确定性对抗测试，共 **65 项**（36 项矩阵 + 9 项必需额外 + 20 项 Codex P0 红灯），全部通过（`npx.cmd vitest run test/measurement-validity.test.ts --maxWorkers=1`，65/65）。矩阵本身仍是规格；实现事实与逐项覆盖见 [`MEASUREMENT_VALIDITY_V1_IMPLEMENTATION_2026-08-12.md`](MEASUREMENT_VALIDITY_V1_IMPLEMENTATION_2026-08-12.md)。

## 0. 读法

- 本矩阵只给**测试规格**，不写测试代码，不选择/修改任何 Gate 阈值或 public API（协议 §8.3 阈值是冻结 DESIGN DECISION，测试不得改）。
- 每项含：fixture（预置对象）、单点篡改（只改一处）、预期（断言方向）、boundary（边界）、建议稳定 issue code、red-zone 标志。
- `RED-ZONE` 项命中即触发协议 §11 / 指南 §6 停止条件，必须显式 fail-closed，不得 REVISE 成 GO。
- issue code 采用 `mv<族>_<序号>_<slug>`，与族、编号、语义稳定绑定，供缺陷追踪复用。
- 预期遵循 REASONING_PROTOCOL：篡改后必须**拒绝**或**等价失败**，不得静默自洽通过。

## 1. B1 Design authority（被测对象：MeasurementValidityDesignV1 / FreezeV1）

| # | 篡改点（单点） | fixture | 预期 | boundary | issue code | red-zone |
|---|---|---|---|---|---|---|
| 1 | duplicate block identity：两个 block 具有同一冻结 block key 与 replicateIndex | 设计含 2 个 block 引用同一 taskDefinitionHash 与相同 identity | 拒绝注册；`registered_block_count` 不重复计数 | 同一 block 下不同预注册 condition 是合法 cell，不是重复 block | `mv_b1_dup_block_identity` | 否 |
| 2 | duplicate variant identity：两个 variant 映射到同一 variant taskId | variant→base 映射表含重复 variant 键 | 拒绝；映射必须单射 | 单射性在任意排列下保持 | `mv_b1_dup_variant_identity` | 否 |
| 3 | base task/variant manifest hash 漂移：design 引用的 `taskDefinitionHash` 与实际 task manifest 不符 | taskDefinitionHash + v6TaskManifest | 拒绝；design 引用必须命中权威 manifest（`validateV6TaskBankAdmissionV1` 语义） | 引用不存在或版本不符 | `mv_b1_manifest_hash_drift` | **是**（variant 无法唯一追溯 base） |
| 4 | model/config/prompt ref 漂移：design 冻结的 identity 与 collection/trace 不符 | design modelRef/configHash/promptRef vs carried identities | 拒绝；每一项必须精确匹配（协议 §3.2、§8.1） | 只改变 modelRef 也属于 drift | `mv_b1_model_config_prompt_drift` | 否 |
| 5 | condition assignment 晚于 provider call：`conditionAssignedAt > firstProviderAt` | 时间戳记录 | 拒绝；condition 必须早于首次 provider（协议 §8.1 createdAt） | 同 run 同条件复制 | `mv_b1_condition_after_provider` | **是**（冻结晚于调用） |
| 6 | exact retry 与新 replicate 混淆：design 把内部重试计数标为新 replicate | replicateIndex + retry 日志 | 拒绝；retry 不得计入 replicate（`retryPolicy:"none"` 单 attempt） | 恰一个 replicate 的独立 request | `mv_b1_retry_as_replicate` | **是**（改写 missingness） |
| 7 | unexpected field / NaN / Infinity / cycle / class instance / sparse array：向设计对象注入非常规 JSON | canonicalize 检查（参照 taskBank canonicalize 语义） | 拒绝；非有限数、非 plain object、循环、稀疏数组均拒绝 | 合法数值边界 ± 安全整数 | `mv_b1_abnormal_value` | 否 |
| 8 | no-replace store 与 read isolation：同路径二次写入被覆盖，或读取到被篡改缓存 | Freeze/Result-index no-replace store | 拒绝覆盖；已提交路径不可覆写；返回值与持久化内容隔离 | 首写（新建）合法；不声称外部真实性 | `mv_b1_no_replace_store` | **是**（封存后被改写） |

## 2. B2 Perturbation semantics（被测对象：variant/condition 语义）

| # | 篡改点（单点） | fixture | 预期 | boundary | issue code | red-zone |
|---|---|---|---|---|---|---|
| 1 | paraphrase 改变 option/truth/private fact：两个 variant 文本不同但 claim/options/groundTruth/privateHash 改变 | semantic paraphrase pair | 拒绝；paraphrase 不得改变 claim、resolution、public/private facts、选项集合（协议 §5.2） | 仅表达差异合法 | `mv_b2_paraphrase_semantic_drift` | **是**（破坏稳定估计） |
| 2 | option map 非双射、漏项、多项：map 把两个 variant option 映到同一 canonical，或漏掉一项 | canonical bijection | 拒绝；必须双射且覆盖全选项集 | K=1 退化（无 permutation） | `mv_b2_option_map_not_bijective` | **是**（非双射即停止） |
| 3 | option map 映回后 claim identity 漂移：variant option 被映到语义不同的 base option，或 resolution 未按同一映射回转 | variant/base claims + resolution opening | 拒绝 mapping/condition；映回后 option identity 与 resolution 必须等于冻结 base claim | 映回后的概率向量允许与 base response 不同，该差异是 equivariance estimand，不能因差异而拒绝 | `mv_b2_option_map_claim_drift` | **是** |
| 4 | evidence level 不连续、重复或 target 不一致：ladder 缺级 / 重复 / designated target 冲突 | ordinal ladder | 拒绝；level 严格单调、唯一，target 一致 | 至少 3 级才计 strength（协议 §6.6） | `mv_b2_evidence_ladder_invalid` | 否 |
| 5 | natural task 伪装成 known-strength fixture：把无 likelihood ratio 的 profile 标成强证据 | controlled-evidence vs HiddenBench 投影 | 拒绝；无冻结 ladder 的不能进 strength 分析（协议 §2、§5.4） | 天然任务只做 paraphrase/order | `mv_b2_natural_as_strength` | **是**（事后主观标注） |
| 6 | information add/remove 被误标成 nuisance：把认识条件改变归入 paraphrase noise | add/remove vs paraphrase | 拒绝；只能进 information sensitivity/integration（协议 §5.6） | 仅纯表达差异属 paraphrase | `mv_b2_add_remove_as_nuisance` | 否 |
| 7 | model/protocol stratum 被误合并为 repeat：不同 model/context 被当作 exact_repeat 估计噪声 | stratum vs exact_repeat | 拒绝；只能进 transport/invariance（协议 §5.7） | 同 model 同 config 同 prompt 才为 repeat | `mv_b2_stratum_as_repeat` | 否 |

## 3. B3 Missingness（被测对象：coverage / missingness policy）

| # | 篡改点（单点） | fixture | 预期 | boundary | issue code | red-zone |
|---|---|---|---|---|---|---|
| 1 | 一个 request 多个 terminal record | terminal status 记录 | 拒绝；每 request 恰一个 terminal（协议 §6.1；finalOutcome.ts:916-919） | 零个 terminal 也拒绝 | `mv_b3_multi_terminal` | **是**（改写 missingness） |
| 2 | registered request 无 terminal record | registered vs terminal | 拒绝；计入分母不算分子（coverage 下降，非静默通过） | 未注册请求不计分母 | `mv_b3_no_terminal` | 否 |
| 3 | invalid/unavailable 被移出分母 | missingness 计数 | 拒绝；invalid/provider_error/timeout/unavailable 分别计数且留在分母 | 分母=preregistered requests（协议 §6.1） | `mv_b3_invalid_off_denominator` | **是** |
| 4 | retry 覆盖原失败 | retry 日志 vs terminal | 拒绝；single-attempt，失败留痕不可被覆盖 | 无重试路径 | `mv_b3_retry_erases_failure` | **是** |
| 5 | incomplete pair 进入 paired effect | pair 完整性 | 拒绝该 block 进入 paired numerator；complete blocks 仍可计算并必须同时报告 pair_coverage | pair_coverage ≥ 0.80 是 Gate 判据，不是计算 complete-block estimand 的前提（协议 §8.3） | `mv_b3_incomplete_pair` | 否 |
| 6 | stratum failure 被 overall average 掩盖 | stratum coverage | 拒绝；任一 stratum 失败不得被整体掩盖（协议 §6.1、§4.2） | 每 model×task-family×instrument stratum ≥0.80 | `mv_b3_stratum_masked` | **是** |

## 4. B4 Analysis replay（被测对象：analysis/replay 实现）

| # | 篡改点（单点） | fixture | 预期 | boundary | issue code | red-zone |
|---|---|---|---|---|---|---|
| 1 | JSD 未用 log2 | 具有已知闭式值的非退化分布对 | replay 与 base-2 参考值不符即拒绝；不能只断言范围，因为 natural-log JSD 也可能位于 [0,1] | 零概率按信息论极限，不平滑 | `mv_b4_jsd_log_base` | 否 |
| 2 | categorical 未映回 canonical coordinates | 反演前距离计算 | 拒绝；先映回 canonical 再算 JSD/TV/argmax/proper-loss（协议 §4.3） | 无 canonical 映射即 fail-closed | `mv_b4_no_canonical_remap` | **是** |
| 3 | tie 被 option order 打破 | tie-aware argmax | 拒绝；hard prediction 为最大概率选项集合，不得按顺序破平（协议 §4.3） | 两个并列最大合法 | `mv_b4_tie_by_option_order` | 否 |
| 4 | TV 少乘/多乘 0.5 | TV 计算 | 拒绝；TV=0.5·Σ|Δ|（协议 §6.3） | 相同分布 TV=0 | `mv_b4_tv_factor` | 否 |
| 5 | evidence direction sign 反转 | delta_direction | 拒绝；`p_support(y*) − p_counter(y*)`（协议 §6.5）符号必须一致 | 均值 paired delta >0 下界 | `mv_b4_direction_sign` | 否 |
| 6 | SNR 只存比值不存分子分母 | SNR 输出 | 拒绝；必须共报 median evidence-pair JSD、median paraphrase-pair JSD 与 epsilon（协议 §6.7） | denominator=`max(median paraphrase JSD, epsilon_frozen)` | `mv_b4_snr_ratio_only` | 否 |
| 7 | baseline 使用 held-out label | baseline 选择 | 拒绝；baseline 在 held-out 开封前冻结，不得用 held-out label（协议 §6.8） | 主 baseline=development 最强且未用 held-out | `mv_b4_baseline_heldout_label` | **是** |
| 8 | report/Agent 被当独立 bootstrap unit | 聚类 bootstrap | 拒绝；以 leakage/base-task cluster 重采样，保留 cluster 内所有 Agent/variant（协议 §7.1） | 独立 cluster 数不足→insufficient_cluster_support | `mv_b4_unit_not_cluster` | **是** |
| 9 | threshold 或 bootstrap seed 在 held-out 后变化 | freeze vs 运行时参数 | 拒绝；seed/阈值在 freeze 后不可变（协议 §7.3、§8.1） | held-out 只开一次 | `mv_b4_post_heldout_change` | **是** |
| 10 | metric 篡改后自洽重算但与 sealed result index 不一致 | raw artifact vs 自洽重算链 | 拒绝；result index 的已封存 source hash 必须捕获后续整链重写 | 只证明封存后的仓库内一致性，不证明外部时间/身份/真实性 | `mv_b4_self_consistent_tamper` | **是** |

## 5. B5 Gate state（被测对象：Gate 判定机）

| # | 篡改点（单点） | fixture | 预期 | boundary | issue code | red-zone |
|---|---|---|---|---|---|---|
| 1 | Q0/Q1/Q2/Q3 越级：Q1 直接声称 Q2 | Gate 状态机 | 拒绝；`Q0 ⇏ Q1 ⇏ Q2`，Q3 仅 transport characterization（协议 §0、§8.4） | 逐级判定，无跨级授权 | `mv_b5_gate_skip_level` | **是**（治理主张越权） |
| 2 | insufficient cluster support 变 GO | cluster 数不足样本 | 拒绝；判 `DEFER/INSUFFICIENT`，不得用 report 数扩 N（协议 §7.1、§8.5） | 独立 cluster 数不足即非 GO | `mv_b5_insufficient_as_go` | **是** |
| 3 | 单项成功补偿另一项失败 | 非补偿式 Gate | 拒绝；每 Gate 独立判定，不建总分（协议 §7.2、§8.3） | 任一 Gate 失败即非目标级 | `mv_b5_noncompensatory_violation` | **是** |
| 4 | explicit Q1 自动授权 detector/control | Q1 结果 | 拒绝；Q1 只许 detector development，授权还需 held-out detector validity（协议 §1.2、§9） | 治理机会资格独立于 Q1 | `mv_b5_q1_grants_detector` | **是** |
| 5 | final Q2 声称 latent belief 或 governance effect | Q2 结果 | 拒绝；Q2 只支持 proper-loss 增量，不声称内心信念/治理效果（协议 §0、§12） | claim ceiling 不可越 | `mv_b5_q2_overclaim` | **是** |

## 6. 覆盖核对

- B1：8 项（dup identity ×2、hash/ref drift ×2、时序 ×1、retry ×1、异常值 ×1、no-replace ×1）。
- B2：7 项（paraphrase、option 非双射/漏项/claim 漂移、ladder、natural-as-strength、add-remove、stratum）。
- B3：6 项（multi/no terminal、denominator、retry 覆盖、incomplete pair、stratum 掩盖）。
- B4：10 项（JSD、canonical remap、tie、TV、direction sign、SNR、baseline、bootstrap unit、held-out 后改变、自洽篡改）。
- B5：5 项（越级、insufficient、非补偿、Q1 授权、Q2 过度主张）。
- 合计 **36 项**。全部为规格，无测试代码，无阈值/API/schema 改动。

red-zone 项：B1:3,5,6,8；B2:1,2,3,5；B3:1,3,4,6；B4:2,7,8,9,10；B5:1-5。共 19 项命中即停止（对应协议 §11 / 指南 §6），其余为可 REVISE 的规范缺陷。
