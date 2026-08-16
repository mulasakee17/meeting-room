# V6 Social-Thermodynamic Response Audit

**STOP — 当前 H_E/κ V1 macrostate degeneracy；response-effect 证据 DEFER；政策授权 NO-GO**

状态：FACT REPORT — 只读零 provider 分析，2026-08-14。权威契约：`docs/theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`；执行指南：`docs/plans/CLAUDE_CODE_SOCIAL_THERMODYNAMIC_RESPONSE_AUDIT_HANDOFF_2026-08-14.md`。

结果：**STOP（针对当前 H_E/κ V1 macrostate degeneracy）；response-effect 证据 DEFER；政策授权 NO-GO**。在冻结的 development-to-heldout 规则下，当前证据不足以支持"高 κ 状态中 apply 相对 holdout 有方向稳定收益"的状态响应假设；也不构成对其的反证（heldout 高/低臂 point 均为负、interaction 方向与假设一致，但支持量远低于冻结 gate）。本次 STOP 仅针对当前 H_E/κ V1 macrostate degeneracy 下的状态响应评估，**不停止更广泛的 social-thermodynamics 研究计划**。

---

## 1. FACT

### 1.1 范围与边界

- 只读分析：复用现有 verdict artifact loader、`verifyRawRunData` replay、task-cluster bootstrap 与 heldout DEFER gate；未新建框架、未添加依赖。
- 全过程 **0 provider calls、0 凭据访问、0 git 写操作**。
- 新增文件仅三个：`experiments/campaign/v6/analyze_v6_social_thermodynamic_response.ts`、`test/v6-social-thermodynamic-response.test.ts`、本文件。
- 未修改 runtime、`src/**`、schema、prompt、task、plan、manifest、现有 artifact 或其他文档。

### 1.2 数据源与加载（复用 combined-analyzer 规则）

| source | plan | roots | 规划 G runs | 实际加载 |
|---|---|---|---|---|
| development-original | `buildVerdictExploratoryPlan` | `v6-verdict-exploratory-v1-20260812` | 40 | 40（requireAll） |
| development-retry1 | `buildRetry1Plan` | retry1 + retry1-tail + retry1-background | 80 | 75（requireAll=false；5 因宿主中断缺失，multi-root 去重，重复即拒绝） |
| heldout | `buildVerdictTaskHeldoutReplicationPlan` | `v6-verdict-task-heldout-replication-v1-20260813` | 96 | 96（96/96，无多余 artifact，`assertHeldoutNoExtrasV1` 通过） |

所有加载 artifact 均通过 `verifyRawRunData` 且 `governanceAuditStatus = sealed_decision_replay_verified`。

### 1.3 状态完整性（missingness）

| 数据集 | eligible | valid-state | 主要缺失原因 |
|---|---:|---:|---|
| development | 73 | 55 | 18 个 eligible run 的 round-1 报告不完整（对应 agent 的 discussion provider 响应为 invalid，无 `belief_reported`）；另有 3 个 ineligible run 不完整 |
| heldout | 53 | 21 | 32 个 eligible run round-1 不完整；1 个 ineligible run 无 `decisions[0].decidedAt`（`no_assignment_cutoff`） |

全部缺失原因为 `agent_report_count_mismatch`（round-1 agent 覆盖不足）或 `no_assignment_cutoff`。在 round-1 覆盖完整的 run 中，**未发现**选项漂移、悬挂或多重绑定的证据引用。

### 1.4 冻结公式（contract §4）

- `R = 1 − mean_pairwise(JSD_2(p_i, p_j))`（base-2，`[0,1]`；单 agent 状态不支持）。
- 证据规范身份：**始终使用精确 `provenance.contentHash`**；模型输出的 `lineageId` 缺失 item 权威（观测到的 `lineageId ∈ {private, shared}` 仅为可见性标签），不作为身份依据。
- `H_E = −sum(q_j·log2 q_j)/log2(m)`，`m≥2`；`m=1` 时 `H_E=0`；`m=0`（无证据引用）时 `H_E=null`，**不用证据条数替代**。
- `κ = R·(1−H_E)`，仅当两者均有限。`κ` 为描述性指标，无控制权威。

### 1.5 宏变量表征（RQ1）

- development（55 个 valid state）：`corr(R,H_E)=0.365`，`corr(R,κ)=−0.137`，`corr(H_E,κ)=−0.960`；`H_E∈[0.8988, 1.0000]`，`κ∈[−0.0000, 0.0662]`，median 0.0272。
- heldout（21 个 valid state）：`corr(R,H_E)=0.265`，`corr(R,κ)=0.042`，`corr(H_E,κ)=−0.925`；`H_E∈[0.8988, 1.0000]`，`κ∈[0.0000, 0.0593]`，median 0.0226。
- **`H_E` 近退化**：证据 content hash 几乎全部唯一 → `H_E` 几乎恒为最大熵；`κ` 被 `H_E` 主导并落在极小区间。

### 1.6 冻结的 development median κ cutoff

- 基于 development 全部 73 个 eligible event 中 55 个有限 `κ`（不分臂、不读 outcome）取中位数：**`κ_cut = 0.0272`**。
- 未读 treatment assignment 与 outcome（状态投影输入不含任何臂/结果字段）。

### 1.7 Heldout 分层响应（主评估）

| stratum | apply n / meanBrier | holdout n / meanBrier | sham | applyClusters / holdoutClusters | naive Δ | bootstrap median | 95% CI | validFraction | DEFER |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---|
| low | 9 / 1.3523 | 2 / 1.7307 | 3 | 5 / 1 | −0.3784 | −0.2906 | [−0.6261, −0.1331] | 0.6610 | true |
| high | 4 / 0.8723 | 2 / 1.7332 | 1 | 2 / 1 | −0.8610 | −0.8610 | [−1.1881, +0.1205] | 0.5804 | true |

- Interaction `Δ_high − Δ_low = −0.4826`（方向与假设一致：高 κ 中 apply 相对帮助更多；但两臂 n、簇数、valid fraction 均不达 gate）。
- 按冻结 gate：任一臂 <10、任务簇 <6、point ≥0、upper ≥0、valid fraction <0.95 即 DEFER。两 stratum 均 DEFER。

### 1.8 Development 分层响应（诊断，非主评估）

| stratum | apply n / meanBrier | holdout n / meanBrier | naive Δ | 95% CI | DEFER |
|---|---|---:|---:|---:|---:|---|
| low | 14 / 0.5557 | 4 / 0.9372 | −0.3815 | [−0.7499, −0.1356] | true（holdout n<10、clusters<6） |
| high | 17 / 0.5713 | 4 / 0.7360 | −0.1648 | [−0.7596, +0.6218] | true |

- Interaction `Δ_high − Δ_low = +0.2167`（**方向与假设相反**：高 κ 中 apply 相对帮助更少）。未建立。

### 1.9 机制表（RQ3，exploratory）

- apply verdict 分布（全部 30 个 apply）：`supported=4, contradicted=7, insufficient_evidence=19`。
- outcome-direction concordance（仅 valid-state apply）：`supported:discordant=3`；`contradicted:discordant=1, contradicted:concordant=1`；`insufficient_evidence` 不评分。
  - 即 valid-state 的 supported 全部与最终 resolution 方向不一致。**这不是 verifier accuracy 声明**（verdict 评估的是公开 claim/message，不等价于 top-option 命题）。
- pre→final 移动（valid-state，mean）：`supported` n=3，truth-mass +0.208、Brier −0.063；`contradicted` n=2，truth-mass −0.125、Brier +0.407；`insufficient_evidence` n=8，truth-mass +0.073、Brier +0.064；`holdout` n=4，truth-mass −0.053、Brier +0.272；`sham` n=4，truth-mass −0.050、Brier +0.341。
- task 级 apply−holdout（全 runs，descriptive，n 极小）：task5 无 holdout；task14 +0.732、task21 +1.006、task57 +0.131、task61 −0.131、task64 +0.087、task65 0.000。

### 1.10 Red-zone / 偏离

- 无 red-zone：无 provider 调用、无凭据访问、无 git 写操作、无 threshold/subgroup/composite 搜索、无 missing-identity 到 raw count 的静默回退。
- 无执行偏离。

---

## 2. INFERENCE

- Heldout 两 stratum 的 apply−holdout point 均为负、interaction 方向与 RQ2 假设一致，但支持量（holdout 每 stratum n=2、1 个簇、valid fraction <0.95）远低于冻结 gate；**任何收益声明都不成立**，只能 DEFER。
- `H_E` 近退化（几乎恒为最大熵），`κ` 被 `H_E` 主导、跨距极小，development median cut（0.0272）把近零范围一分为二，该分裂的判别权威有限。这对应 RQ1 的塌缩关切：宏变量未形成良好分离的二维状态。
- 在 valid-state 中，`supported` verdict 全部与最终 resolution 方向不一致；这与"apply 机制携带较少结果相关信息"一致（机制分解视角），但不构成 verifier accuracy 或机制无效的证明。
- Development 与 heldout 的 interaction 方向相反（+0.2167 vs −0.4826），均未建立。RQ2 的状态响应方向**未在 heldout 上获得可读支持**。

---

## 3. HYPOTHESIS

- RQ2 `χ(high-κ) < χ(low-κ)` 在本审计中保持未证：heldout 方向一致但支持不足；development 方向相反但同样未建立。按 contract §9.3，状态响应关系未达到 GO gate，不授权 state-conditioned pilot 或政策。

---

## 4. LIMITATION

- 状态完整性低：heldout eligible 中仅 21/53 有完整 round-1 状态；缺失主因是 round-1 provider invalid 响应（无 belief report），属协议层数据缺失，非选择偏差补正所能修复。
- `H_E` 近退化使 `κ` 判别力受限；证据 content hash 几乎全部唯一是本协议下 evidence 生成的特性。
- 分层后样本极小（apply 4–17、holdout 2–4），任务簇 1–10，bootstrap valid fraction <0.95；不能作为 confirmatory 证据（heldout 聚合结果此前已观察，本次为 secondary）。
- 仅 DeepSeek `deepseek-chat`、单一 prompt/profile/阈值、单一 heldout batch。
- pooled Brier 是该协议下 final private belief report 的 proper loss，不测量 agent 内在信念、detector validity、通用可靠性或现实部署价值。
- `κ` 为描述性指标，无控制权威；本审计不授权任何状态条件政策。

---

## 5. 命令与位置

- 分析器：`experiments/campaign/v6/analyze_v6_social_thermodynamic_response.ts`（CLI：`npx tsx ... --` 默认执行；零 provider）。
- 测试：`test/v6-social-thermodynamic-response.test.ts`（31 tests，覆盖 guide §9 fail-closed 条件 1–10 与用户四项保证）。
- 输入 artifact：`experiments/campaign/pilot_output/v6-verdict-exploratory-v1-20260812/`、`v6-verdict-randomized-continuation-retry1-{,tail,background}-20260813/`、`v6-verdict-task-heldout-replication-v1-20260813/`。
- 验收：`npx tsc --noEmit` 通过；`npx vitest run test/v6-social-thermodynamic-response.test.ts`（31 tests）通过。analyzer CLI rerun（`npx tsx ... --`）**未完成**：`uv_os_get_passwd` ENOMEM 发生两次；故本更新不重报全量 `npx vitest run`/`npm run build` 结果。

---

## 6. Evidence observability census（2026-08-14 追加）

测量可行性普查：判断现有 artifacts 能否支持比 H_E 更直接的证据观测量。**只读、零 provider**；不评估治理效果，不构造新 κ/F，不改变总体 STOP、response-effect DEFER 与政策 NO-GO。

### 6.1 新增描述量（不构成 detector / governance-useful / policy-ready）

- **A1 exact content reuse**：对一个已通过 pre-action projection 校验的 run，`N_ref` = round-1 report-to-evidence references 总数；`U_hash` = 这些引用解析到的不同 contentHash 数；`exactReuseFraction = 1 − U_hash/N_ref`（`N_ref=0` 时为 null）。
  - 只测量精确内容哈希的重复引用；不识别 paraphrase、语义同源、共同上游来源或证据质量；0 表示"没有精确哈希重复"，不代表证据彼此独立。
  - 复用已有 pre-action projection 的 content-hash 身份绑定与 dangling/multiply-bound fail-closed 语义，无新 loader。
- **A2 verbatim private-commitment coverage**：从 `v6TaskManifest.orderedAgentCommitments` 读 `agentId`/`privateInformationHash`；只检查被 round-1 reports 实际引用的 contentHash 是否与某个 `privateInformationHash` 精确相等。`coverage = matchedCommittedAgentCount / registeredAgentCount`。
  - hash 相等只说明模型证据文本逐字对应已承诺私有信息；hash 不相等不能推断模型未使用该私有信息。
  - manifest 缺失、roster 与注册 agent 不一致、重复 commitment hash 导致来源身份有歧义时 fail-closed（missing/reason），不猜测。

### 6.2 FACT（development 55 / heldout 21 个 valid-state eligible runs）

| 数据集 | runCount | R (min/median/max/distinct) | exactReuseFraction (missing/min/median/max/distinct) | verbatimPrivateCommitmentCoverage (missing/min/median/max/distinct) | N_ref / U_hash 范围 |
|---|---:|---|---|---|---|
| development | 55 | 0.367 / 0.695 / 0.990 / 45 | 0 / 0.000 / 0.333 / 0.579 / 27 | 0 / 0.000 / 0.750 / 1.000 / 6 | N_ref [9,19]，U_hash [6,15] |
| heldout | 21 | 0.325 / 0.983 / 1.000 / 14 | 0 / 0.000 / 0.154 / 0.533 / 15 | 0 / 0.000 / 0.500 / 1.000 / 4 | N_ref [10,24]，U_hash [7,24] |

机械判读：所有量在两批次内均有多个有限取值 → **`descriptive_variation_observed`**（无 `descriptively_degenerate`，无 `unreconstructable_from_current_artifacts`）。本 census 未按 arm 分组、未读 final Brier/truth/resolution/verdict、未算相关性/回归/p-value/bootstrap/效应量、未搜索阈值或子群。

### 6.3 INFERENCE

- 当前 artifacts 中，exact content reuse 与 verbatim private-commitment coverage **存在可重建的描述性变化**（即比近退化的 H_E 更直接的证据观测量在数据层面可计算且有变化）。
- 这仅是测量可行性信号：**不**意味着任一量是有效 detector、可预测治理效果、或 policy-ready。总体 STOP / response-effect DEFER / policy NO-GO 不变。

### 6.4 LIMITATION

- A1 只识别精确哈希重复，无法识别 paraphrase、语义同源或共同上游来源；`exactReuseFraction=0` 不表示证据独立。
- A2 只统计逐字匹配；hash 不相等不能推断模型未使用私有信息；coverage 的分子分母仅针对已通过 roster/歧义校验的 run。
- census 仅在 valid-state eligible runs 上计算；heldout 仅 21/53，缺失主因仍为 round-1 provider invalid。
- 本 census 不改变任何冻结判定。

### 6.5 本追加的执行状态

- `npx tsc --noEmit` 通过；`npx vitest run test/v6-social-thermodynamic-response.test.ts`（41 tests，含 10 项 census 确定性测试）通过。
- analyzer CLI（`npx tsx experiments/campaign/v6/analyze_v6_social_thermodynamic_response.ts`）本轮**成功执行**并输出 census（exit code 4 = 冻结 STOP 状态的正常返回，非错误）；stdout 确认 `status: STOP`、`response-effect evidence: DEFER`、`policy authorization: NO-GO`。先前记录的 `uv_os_get_passwd` ENOMEM 为瞬时机器阻断，本轮未复现。
