# Claude Code 三日执行契约：Measurement Validity Development Pilot v1

日期：2026-08-13 至 2026-08-15  
状态：**CODEx-FROZEN EXECUTION PLAN / DEVELOPMENT ONLY**  
基线提交：`ae132df7b6e086f82131a99beeb5bab1119ce263`  
执行者：Claude Code / DeepSeek  
最终科学与集成审核：Codex  

---

## 0. 三天只回答什么

本工作包只回答一个问题：

> SwarmAlpha 当前显式概率报告，在 K=3 categorical 任务上，是否同时具备足够的采集完整性、语义等价扰动稳定性、选项置换等变性，以及对受控证据方向和强度的非平凡响应？

这是 **measurement development**，不是治理效果实验，也不是 confirmatory experiment。

三天结束时必须得到以下三种结论之一：

- `Q1_CANDIDATE_GO`：development 数据满足冻结的 Q0/Q1 Gate，可进入独立 detector development；
- `REVISE`：采集可用，但某一测量性质失败，必须版本化修改 instrument 后重跑；
- `STOP_OR_DEFER`：报告不响应证据、对轻微语义扰动任意漂移，或独立 cluster / coverage 不足；停止基于该 instrument 推进治理效果实验。

不得把 engineering replay、成功产出数、共识、ECE 或漂亮个例写成 measurement validity。

---

## 1. 当前事实基线

### FACT

- `MeasurementValidityDesignV1`、`FreezeV1`、`ResultIndexV1`、no-replace store、deterministic analysis 与 Q0-Q3 Gate 已实现并有确定性测试。
- `measurementValidityRunner.ts` 已能在 provider 前持久化 Design/Freeze，并在全部 cell terminal 后封存 ResultIndex。
- `v6MeasurementDevelopment.ts` 当前只有两个 `exact_repeat`，且 purpose 明确是 `wiring_only_not_measurement_evidence`；它不能直接升级成科学证据。
- V6 single-attempt provider boundary、categorical authority、schema-5 replay 与 final outcome 已存在，应复用。
- 最近 80-run exploratory 数据显示显式概率报告存在严重过度自信，并且 `certainty >= 0.7` 在该样本中可能反预测错误；因此不得直接把旧阈值升级为治理资格规则。
- 现行协议要求 bootstrap Gate 至少有 20 个独立 leakage/base-task clusters；report 行数不能替代 cluster 数。
- 全量测试曾出现 Node 24 / tsx 子进程的 `uv_os_get_passwd ENOMEM`，已被判定为机器资源性间歇；不得通过跳过、删测试或修改业务代码隐藏。

### UNKNOWN

- 当前概率报告是否保持语义稳定和选项等变；
- 它是否对受控证据方向、强度具有正确且非平凡的响应；
- 这些性质能否跨任务语义簇成立；
- 它能否达到 Q1；
- 治理是否有效。

---

## 2. 冻结的科学设计

Claude Code 不得重定义以下设计。

### 2.1 域与 instrument

- belief domain：`categorical / K=3 only`；
- instrument：复用当前 V6 显式 categorical probability report；
- model、provider、prompt、invocation config、round 数和 agent roster：整个 pilot 内逐字冻结；
- 每次 provider adapter 调用至多一次；`retryPolicy = none`；
- terminal failure 保留在注册分母中，不补样本、不换任务、不换模型、不重抽 seed。

K=4 只有 6 个 HiddenBench 任务，三天内不得用于 Q1 Gate；最多在结果报告中作为既有工程能力说明。

### 2.2 两个互补 study，不混为一个构念

#### Study N：nuisance stability / natural-task study

用途：检验轻微 nuisance transformation 是否改变同一语义下的概率报告。

每个 base semantic cluster 冻结四个 cells：

1. `exact_repeat:r0`；
2. `exact_repeat:r1`；
3. `semantic_paraphrase:p0`；
4. `option_permutation:o0`。

总目标：20 clusters × 4 = 80 registered cells。

数据来源优先复用 pinned HiddenBench K=3 task content，但本工作不声称复现官方 HiddenBench protocol。adapter/reference 必须使用 `hiddenbench-data-3be6ca16` 的数据来源语义，而非 `official-protocol-reproduction`。

#### Study E：controlled evidence response study

用途：检验报告是否对已知方向与强度的证据产生正确、单调且大于 nuisance 的响应。

每个 base semantic cluster 冻结四个 cells：

1. `evidence_strength:weak`；
2. `evidence_strength:medium`；
3. `evidence_strength:strong`；
4. `evidence_direction:counter`。

总目标：20 clusters × 4 = 80 registered cells。

三个 strength cells 必须：

- 指向同一个 `designatedTarget`；
- payload 不直接写出“正确答案”“ground truth”“resolver outcome”等元标签；
- 由冻结的 ordinal evidence ladder 给出 weak < medium < strong；
- 在 20 clusters 中把 designatedTarget 是否等于最终 resolution 预先平衡，避免把“响应目标”偷换成“预测正确”。

`counter` cell 必须是对同一 designatedTarget 的反向证据，不是另一个任意题目。

Study N 与 Study E 可以共享题目表面场景，但若共享同一生成模板或语义结构，必须使用同一个 leakage group；不能把模板实例伪装成独立 clusters。

### 2.3 20-cluster 规则

在任何 provider call 前冻结候选池、语义簇和选择顺序。

HiddenBench K=3 候选优先顺序冻结为：

```text
1, 9, 10, 11, 12, 15, 16, 18, 21, 13, 31,
5, 7, 8, 14, 30, 57, 59, 60, 61, 62, 64, 65
```

选择规则：

1. 只按上述顺序处理；
2. semantic reviewer 可合并同族、拒绝语义不保持的 variant，但不能根据模型输出选择；
3. 每个 accepted leakage group 只取列表中最先出现的 task；
4. 达到 20 个 accepted distinct groups 即停止；
5. 若列表结束仍不足 20，不得临时补题，结果直接标记 `DEFER_INSUFFICIENT_CLUSTER_SUPPORT`。

这条规则用于防止看过输出后挑任务。

### 2.4 语义审查是人工 Gate

Claude 可以生成候选 paraphrase、option map 和 evidence ladder，但**不能为自己生成的内容签署 accepted semantic review**。

Day 1 必须生成一个简洁 review packet，每个 cluster 一行或一小节，至少包含：

- source task ID 与 normalized public scenario；
- base / paraphrase 差异；
- canonical option map；
- weak / medium / strong / counter evidence payload；
- designated target 与是否等于 resolution（这一列只供 reviewer，绝不进入 provider request）；
- 建议 leakage group；
- reviewer 的 `accept / reject / merge / revise` 空位。

只有 owner 完成独立检查并显式给出接受结果后，Claude 才能写入 `status: "accepted"`、review protocol ref 和 reviewedAt。

若三天内没有 owner 审查：只允许完成 plan/mock，不允许真实 provider run；不得伪造 accepted review。

### 2.5 冻结指标与 Gate

必须直接复用 `MEASUREMENT_VALIDITY_PROTOCOL_V1.md` 与 `measurementValidityAnalysis.ts`，不得调阈值。

Primary Q1 components：

- overall/stratum valid coverage 与 pair completeness；
- exact-repeat stability；
- paraphrase median/P90 base-2 JSD 与 tie-aware argmax agreement；
- option permutation median/P90 TV 与 tie-aware argmax agreement；
- paired direction response；
- evidence-strength cluster Spearman 与 adjacent violation rate；
- `SNR = median(nonzero evidence-pair JSD) / max(median(paraphrase-pair JSD), epsilon_frozen)`；
- cluster-level bootstrap，不能 report-level bootstrap。

Secondary characterization：

- terminal status 分布；
- Brier / ECE / certainty-error relationship；
- designatedTarget=true 与 designatedTarget=false 两个 strata；
- task-family、agent-count 等已预注册 strata。

Secondary 结果不能补偿 primary Gate，ECE 不能作为 Gate primary metric。

### 2.6 三天内明确禁止

- 不打开 `sealed_measurement_heldout`；
- 不做 Q2 predictive-increment 认证；
- 不重新校准或修改 `certainty >= 0.7` 阈值；
- 不跑治理 apply/sham/holdout 效应；
- 不修改 raw schema-5；
- 不引入 WAL、恢复状态机、外部签名、Web3、信誉、路由或新治理内核；
- 不把结果写成 latent belief、general calibration、general governance efficacy 或 AAMAS-ready。

---

## 3. 分工

### Codex 已完成并负责

- 科学问题、构念边界、两-study 结构、cluster 规则、Gate、停止条件；
- 核心语义与最终审查；
- 是否接受结果进入论文主张。

### Claude Code 负责

- 按冻结设计机械地产生候选 variants 和 review packet；
- 使用现有 public APIs 编写 pilot 侧 adapter、plan、CLI、analyzer；
- 确定性测试、mock、真实 development run、replay；
- 生成不夸大的结果表和执行报告。

### Owner 只需做一次

- Day 1 末审查 review packet，填写 accept/reject/merge/revise；预计 20-40 分钟。

---

## 4. 文件白名单

允许新建：

1. `experiments/campaign/measurement/measurementPilotTaskBankV1.ts`
2. `experiments/campaign/measurement/measurementPilotExecutionV1.ts`
3. `experiments/campaign/measurement/run_measurement_validity_pilot.ts`
4. `experiments/campaign/measurement/analyze_measurement_validity_pilot.ts`
5. `experiments/campaign/measurement/measurement_validity_pilot_v1.plan.json`
6. `test/measurement-validity-pilot.test.ts`
7. `test/measurement-validity-pilot-analysis.test.ts`
8. `docs/plans/MEASUREMENT_VALIDITY_PILOT_SEMANTIC_REVIEW_PACKET_2026-08-13.md`
9. `docs/plans/MEASUREMENT_VALIDITY_PILOT_V1_EXECUTION_REPORT_2026-08-15.md`
10. `docs/experiments/MEASUREMENT_VALIDITY_PILOT_V1_RESULTS_2026-08-15.md`

允许生成且不得提交为源码的 artifact 目录：

- `experiments/campaign/pilot_output/measurement-validity-n-v1-20260814/`
- `experiments/campaign/pilot_output/measurement-validity-e-v1-20260814/`

允许只读：

- `docs/REASONING_PROTOCOL.md`
- `docs/ACTIVE_RESEARCH_SURFACE.md`
- `docs/architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md`
- `docs/plans/HIDDENBENCH_V6_SCIENTIFIC_SPLIT_GAP_AUDIT_2026-08-11.md`
- `experiments/campaign/measurement/measurementValidity.ts`
- `experiments/campaign/measurement/measurementValidityAnalysis.ts`
- `experiments/campaign/measurement/measurementValidityRunner.ts`
- `experiments/campaign/measurement/v6MeasurementDevelopment.ts`
- `experiments/campaign/v6/hiddenBenchTaskAdapter.ts`
- `experiments/campaign/v6/productionVerticalSlice.ts`
- `experiments/campaign/v6/providerAdapters.ts`
- `experiments/campaign/v6/run_v6_verdict_exploratory.ts`
- 与上述 public API 直接关联的现有测试。

禁止修改：

- `src/**`；
- 任何既有 V6 / measurement core 文件；
- `package.json`、schema 常量、provider 核心、`.env*`；
- 既有 experiment artifact；
- legacy、scratch、v2、runtime 目录；
- 本三日计划文件。

如现有 API 无法在白名单内完成，不得绕过 authority；写最小失败测试或 gap report，然后停下交还 Codex。

---

## 5. Day 1 — 任务银行、语义审查与冻结前检查

目标：在零 provider call 下得到可审查、可哈希、可 mock 的完整候选设计。

### 上午：事实核对与最小实现

1. 记录：
   - branch；
   - `git rev-parse HEAD`；
   - `git status --short`；
   - Node/npm/tsx 版本。
2. 只读核对 public APIs；不得重新设计 measurement core。
3. 实现 `measurementPilotTaskBankV1.ts`：
   - candidate order 固定；
   - K=3 only；
   - base/paraphrase/option/evidence payload 分离；
   - truth metadata 只存在 authority/reviewer side；
   - provider projection 不含 resolution、groundTruth、correct_answer、review verdict；
   - canonical hashes、clone/freeze、exact-key validation；
   - 同一 base/variant 的 identity 确定性。
4. 实现两个 Study 的 plan builder；Study N 和 E 使用不同 designRef/freezeRef/resultIndexRef/outputDir。

### 下午：review packet 与对抗测试

至少覆盖：

- candidate order / K=3 / 20-cluster 规则不可漂移；
- paraphrase 不能改变 options、resolution policy 或信息集合；
- option map 必须是 canonical bijection；
- strength ladder 必须严格有序、同 target、至少 3 级；
- counter 必须与同 target 反向；
- target=true/false 预先平衡；
- truth/reviewer metadata 不进入 discussion/final/verification request；
- plan 创建前 semantic review 未接受时 fail-closed；
- plan/hash 自洽重算篡改被拒绝；
- duplicate leakage group 不增加 independent N；
- no-replace 与 path sanitation；
- 不导入 retrying `callLLM` 路径。

随后生成 review packet，暂停等待 owner。

### Day 1 验收

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/measurement-validity.test.ts test/measurement-validity-runner.test.ts test/measurement-validity-pilot.test.ts --reporter=dot --maxWorkers=1
```

Day 1 报告必须写明：0 paid calls、0 credentials read、0 accepted review self-issued。

---

## 6. Day 2 — 冻结、mock、真实 development run

前提：owner 已返回明确 semantic review 决定；否则 Day 2 只能 plan/mock。

### 上午：冻结与 preflight

1. 只把 owner 接受的 reviewer decisions 写入 authority；拒绝项不能静默改写后自动接受。
2. 按候选顺序重新计算 distinct accepted cluster 数；不足 20 立即 `DEFER`，不补题。
3. 生成 no-replace `measurement_validity_pilot_v1.plan.json`，包含：
   - 两个 Design/Freeze 全量内容或其不可歧义引用与 hash；
   - 160 个预注册 cells；
   - model/prompt/config/provider refs；
   - seeds、clock policy、retry none；
   - expected calls/tokens 与 hard caps；
   - task/variant/leakage mappings；
   - analysis version 与冻结 Gate refs。
4. 运行 `--plan` 两次，输出与 hashes 必须完全相同。
5. 使用 mock invoker 跑完整 160-cell 流程并 replay；mock 结果不得写入真实 output dirs。

### 真实调用预算

- Study N：80 runs；
- Study E：80 runs；
- 总计：160 runs；
- hard cap：2,400 provider calls；
- hard cap：3,000,000 total tokens；
- 顺序执行；无内部 retry；无补样本；
- 若 frozen plan 估计超过任一 hard cap，不得执行，返回 Codex；
- Claude Code 自身编排预算和 provider 实验预算是两个概念，不得混写。

### 下午/晚间：真实 development run

运行顺序固定：Study N 后 Study E。

Study E 只在 Study N 满足以下**安全/可用性条件**时启动：

- 80/80 cells 均形成唯一 terminal record；
- schema/replay/hash/truth-firewall 零 red-zone；
- valid coverage ≥ 0.75。

该条件只用于避免在采集系统明显失效时继续花预算；它不是 measurement Gate，也不得根据 JSD、TV 或效应方向决定是否运行 Study E。

每个 study 完成后立即执行：

- raw/schema-5 replay；
- ResultIndex cross-source replay；
- call/token 预算核对；
- truth/private leakage 检查；
- terminal denominator 核对。

### 部分态规则

现有 runner 没有跨进程 cell-level resumer。若进程在 ResultIndex seal 前中断：

- 保留原目录；
- 不删除、不覆盖、不自动补 cell；
- 不把再次运行称为 exact retry；
- 记录已发生调用数和已存在 artifacts；
- 停止并交还 Codex 决定新 execution identity。

### Day 2 验收

- 计划文件已冻结且 no-replace；
- 两个 study 各有完整 ResultIndex，或明确记录停止原因；
- 所有 terminal failure 保留在分母；
- 精确 paid calls/tokens 可核对；
- 无 retry、无替换、无 seed shopping、无 provider fallback。

---

## 7. Day 3 — 重放、冻结分析、结果纪律

### 上午：authority 与 replay

1. 从磁盘重新读取，不复用进程内对象。
2. 对每个 raw run 执行 schema-5 replay。
3. 对两个 ResultIndex 执行 source binding replay。
4. 校验 registered cells、terminal rows、run IDs、task/variant hashes 一一对应。
5. 任何 replay failure 都先报告，不进入统计聚合。

### 中午：primary analysis

使用现有 analysis kernel，按 cluster 计算并保留：

- coverage / completeness / failure strata；
- exact-repeat JSD 与 agreement；
- paraphrase JSD 与 agreement；
- option-permutation remapped TV 与 agreement；
- direction delta；
- strength Spearman 与 monotonicity violation；
- SNR 的分子、分母与比值；
- cluster bootstrap 区间与 valid bootstrap fraction；
- Q0/Q1 每个 component 的 pass/fail/insufficient；
- 非补偿式总结果。

禁止：

- run/report-level 伪独立 bootstrap；
- 看结果后改 epsilon、threshold、stratum、cluster、option map；
- 丢弃 invalid/unavailable/provider_error；
- 只报告 median 不报告 P90/coverage；
- 把 exact repeat 写成 paraphrase validity；
- 把 response validity 写成 predictive validity。

### 下午：secondary analysis 与结果文档

Secondary 只作 characterization：

- certainty / Brier / ECE；
- designatedTarget truth-status strata；
- task family / roster strata；
- 与 2026-08-12 exploratory result 的定性对照。

除非事先就在 plan 中，否则不得新增分析。新增想法写入 `POST_HOC HYPOTHESIS`，不混入 primary。

结果文档必须分层：

- `FACT`：artifact、replay、样本量、预注册指标；
- `INFERENCE`：在本 development domain 内的解释；
- `HYPOTHESIS`：下一轮 detector 或治理机制候选；
- `LIMITATION`：语义审查、单模型、K=3、任务族、内部 hash、无 held-out；
- `DECISION`：Q1 candidate GO / REVISE / STOP_OR_DEFER。

即使 Q1 全部通过，也只能写：

> The explicit categorical report is a Q1 candidate response instrument in the tested K=3 development domain.

不能写 calibrated、validated generally、latent belief、governance effective、confirmatory-ready 或 AAMAS-ready。

---

## 8. Red-zone / 立即停止条件

发现任一项，创建最小复现或事实记录后停止，不自行改 core：

1. provider request 含 ground truth、resolver outcome、correct answer、他 agent private view 或 reviewer-only metadata；
2. adapter 内发生 retry、provider fallback 或 malformed response 二次调用；
3. plan 后能换 task/model/config/prompt/seed 而 hash/replay 仍通过；
4. option permutation 后 truth 或 canonical coordinate 漂移；
5. evidence variant 通过元语言直接泄漏正确答案；
6. 同一 leakage group 被计作多个独立 clusters；
7. terminal failure 可从注册分母消失；
8. ResultIndex 缺 cell 仍可 seal；
9. replay failure、schema mismatch 或 source hash mismatch；
10. 真实调用需要修改 `src/**`、schema-5、measurement core 或 provider core；
11. partial run 被静默覆盖或自动补样本；
12. owner 未审查却写入 accepted semantic review。

Node/tsx `uv_os_get_passwd ENOMEM`：先单线程重跑目标命令并记录机器状态；若业务测试单独通过，分类为环境故障。不得跳过测试或修改断言。

---

## 9. 最终验收命令

按顺序执行并保留精确输出：

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/measurement-validity.test.ts test/measurement-validity-runner.test.ts test/measurement-validity-pilot.test.ts test/measurement-validity-pilot-analysis.test.ts --reporter=dot --maxWorkers=1
npm.cmd run test:measurement
npm.cmd run test:v6
npm.cmd run build
git status --short
```

全量 vitest 可以运行一次；若仅有已知 ENOMEM 类 CLI 子进程失败，必须逐文件单线程复核并如实报告，不得把全量写成 pass。

---

## 10. 交还 Codex 的最小审查包

Claude 最终只需交还：

1. 基线 commit 与 `git status --short`；
2. 修改/新增文件清单；
3. semantic review 决定与 20 clusters 清单；
4. frozen plan contentHash、两个 Design/Freeze/ResultIndex hashes；
5. 精确 runs / provider calls / tokens / terminal status；
6. replay 成功数与全部 issue codes；
7. Q0/Q1 component 表，不只给总判定；
8. blocked / insufficient gates；
9. red-zone 与所有偏离；
10. 精确测试/build 输出；
11. 明确声明是否读取凭据、是否运行付费调用、是否发生 retry/补样本/换任务/换 seed；
12. 不执行 `git add/commit/reset/checkout/clean`。

Codex 将重点审核：构念是否被偷换、cluster 是否伪独立、truth firewall、Gate 是否事后改变、失败样本是否被删除、结论是否超过证据。

---

## 11. 给 Claude Code 的可直接粘贴提示词

```text
你正在执行 SwarmAlpha 的三日 Measurement Validity Development Pilot v1。

唯一权威指南：
docs/plans/CLAUDE_CODE_THREE_DAY_MEASUREMENT_PILOT_PLAN_2026-08-13.md

基线 commit：ae132df7b6e086f82131a99beeb5bab1119ce263。

先完整阅读：
1) docs/REASONING_PROTOCOL.md
2) 上述三日指南
3) 指南白名单中列出的 measurement public APIs 与协议

严格执行 Day 1 → owner semantic-review gate → Day 2 → Day 3。不要重新设计科学问题，不要修改 Gate，不要扩展工程内核。只允许修改指南列出的白名单文件；src/**、现有 V6/measurement core、schema、provider core、package.json、.env* 全部禁止。

Day 1 先生成 semantic review packet，然后停下等待 owner 明确接受/拒绝/合并决定。你不能给自己生成的 paraphrase/evidence variant 签署 accepted semantic review。没有 owner 决定时，只能 plan/mock，禁止真实 provider call。

真实 execution 仅限 measurement_development；K=3；Study N 80 cells + Study E 80 cells；无 retry、无补样本、无换任务、无换 seed。硬上限 2,400 provider calls / 3,000,000 tokens。Study E 的启动条件和 partial-state 处理按指南执行。

命中任何 red-zone：写最小复现或事实记录，立即停止，不自行修改 core。不要隐藏 Node/tsx ENOMEM，不要跳过失败测试。

最终按指南 §10 返回最小 Codex 审查包；结果必须区分 FACT / INFERENCE / HYPOTHESIS / LIMITATION / DECISION。不要执行任何 git 写操作。
```

