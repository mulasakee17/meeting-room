# Source-Disclosure Screen — 任务污染与候选池审计

日期：2026-08-14
状态：**PHASE 0 FACT AUDIT + CODEX REVIEWED — 10 tasks / 8 leakage groups accepted for a non-confirmatory screen；未执行 provider**。
权威执行指南：`docs/plans/SWARMALPHA_INTEGRATED_RESEARCH_EXECUTION_GUIDE_2026-08-14.md`；历史参考（规模已被取代，不得机械执行）：`docs/plans/CLAUDE_CODE_SOURCE_DISCLOSURE_SCREEN_HANDOFF_2026-08-13.md`。

> **2026-08-14 Codex scientific-review decision:** Phase 0 的机械审计通过。为避免把“宽泛场景相似”误当成“实验污染”，机制筛选的 freshness 冻结为：精确 task 未付费执行、未用于旧结果/开发、无相同 description hash，且任务选择不读取旧 outcome。宽泛语义相关性通过预注册 leakage-group cluster 处理，而不是无限排除。以下 10 个 task 获得 **CODEX-ACCEPTED FOR NON-CONFIRMATORY SCREEN**：`13,18,28,33,38,39,45,47,50,55`；owner 的真实 provider 执行批准仍未给出。它们冻结为 8 个 leakage groups：`investigation={13,47}`、`urgent-transfer={33,55}`，其余 `18,28,38,39,45,50` 各自成组。规模固定为 `10 tasks × 2 blocks × 2 arms = 40 runs`。该决定只授权最小工程接线和零调用 plan，不把这些任务称为 confirmatory/external-generalization 样本。

本文不包含、不使用、不复制任何 `correct_answer` 值。候选推荐只基于：未使用状态、K/agent 覆盖、syntactic/template 组多样性、task description 的语义族分离、预期调用成本的结构性估计。

---

## 1. FACT — 任务使用史（pinned HiddenBench 1–65）

来源扫描（只读）：`experiments/campaign/v6/*.plan.json`、`experiments/campaign/pilot_output/**`（raw-run artifact + `taskOutcome.cost.totalTokens>0` 判定真实付费）、`docs/experiments/**` 真实结果、action-discovery/measurement 计划与 review packet。

### 1.1 使用的实验身份与任务

| 实验/计划 | 身份 | 任务 | 付费执行 |
|---|---|---|---|
| verdict exploratory（B+G） | `v6-verdict-exploratory-v1-20260812` | 2,6,10,25,26,30,34,36,41,42,43,44,46,48,53,56,58,59,60,62 | **是**（80 raw-run usage>0） |
| verdict continuation retry1 | `v6-verdict-randomized-continuation-retry1{-tail,-background}` | 同上 20 个 | **是**（retry1/background 75 runs usage>0） |
| verdict continuation v1（失效批次） | `v6-verdict-randomized-continuation-v1{-remainder}` | 同上 20 个 | **否**（78 raw-run usage=0，全部 provider_network 失败，已失效并排除） |
| verdict task-heldout replication | `v6-verdict-task-heldout-replication-v1-20260813` | 5,7,14,21,57,61,64,65 | **是**（96/96） |
| 工程/机制 pilot（task1/4/8/9/17 + hiddenbench-*） | `v6-hb-task{1,4,8,17}-*`、`v6-hiddenbench-*`、`v6-smoke*`（非 HiddenBench task id） | 1,4,8,9,17 | **是**（usage>0；smoke 用 `task:v6-smoke-route`，不污染 1–65） |
| process-state failure prediction | `analyze_v6_process_state_failure_prediction.ts`（B-arm 40 runs） | 20 个 dev 任务 | 复用既有 artifact，无新 provider |
| action-discovery | `run_v6_action_discovery.ts` + review packet | 设计 5,7,14,21,57,61,64,65,8,13,18,28,33,39,45,55 | **否**（未执行；review 未 accepted；plan 因静态预算 fail-closed） |
| measurement pilot | `measurementPilotTaskBankV1.ts` | 候选 1,9,10,11,12,15,16,18,21,13,31,5,7,8,14,30,57,59,60,61,62,64,65 | **否**（未执行；20-cluster 需 K=3） |

### 1.2 逐任务使用史（65 项）

图例：`K`=option count，`A`=agent count（hidden_information 条数）；`PAID`=真实付费 artifact；`DEV`=feature/threshold/action 开发；`HELD`=heldout 结果；`AD-REF`/`MEAS-REF`=仅出现在未执行 plan 的候选顺序；`NONE`=仓库证据中无使用。

| id | K/A | 模板哈希(前8) | 名称 | 使用证据 | 分类 | 风险说明 |
|--:|---|---|---|---|---|---|
| 1 | 3/4 | 498b908c | evacuation_west_city | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | evacuation 模板；与 2,3 同一 description hash |
| 2 | 3/4 | 498b908c | evacuation_north_hill | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | 同上 |
| 3 | 3/4 | 498b908c | evacuation_east_town | NONE | REVIEW_REQUIRED | **与已付费 1,2 同一 description hash** → 模板级泄漏，排除 |
| 4 | 4/3 | 378f8c4e | toma_butera_2009 | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | hidden-profile 组决策 |
| 5 | 3/4 | d6fdb219 | baker_2010 | HELD | EXCLUDE_HELDOUT_REUSE | 已作为 heldout 结果 |
| 6 | 4/3 | c46ca9e8 | schulz_hardt_mojzisch_2012 | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | hidden-profile |
| 7 | 3/4 | 38d855d2 | graetz_et_al_1998 | HELD | EXCLUDE_HELDOUT_REUSE | heldout |
| 8 | 3/3 | 2fbbcd51 | Stasser_Stewart_1992 | PAID | EXCLUDE_PAID_EXPOSURE | hidden-profile 经典；已付费 |
| 9 | 3/4 | 53790f78 | critical_hospital_transfer | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | transport/medical |
| 10 | 3/4 | 03e61da1 | emergency_supply_drop | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | transport/logistics |
| 11 | 3/4 | 419b974d | emergency_conference_relocation | MEAS-REF | CANDIDATE_UNTOUCHED（候选） | venue 族（与 dev 44,59 重叠）→ 高泄漏风险 |
| 12 | 3/4 | bbe27e8e | evacuate_park_dilemma | MEAS-REF | CANDIDATE_UNTOUCHED（候选） | evacuation 族重叠 |
| 13 | 3/4 | 5e707297 | Laboratory Theft Deduction | AD-REF | CANDIDATE_UNTOUCHED（候选） | whodunit 盗窃推断；无已观察同族 → 低风险 |
| 14 | 3/4 | 6ee9b6d0 | lunch_group_decision | HELD | EXCLUDE_HELDOUT_REUSE | heldout |
| 15 | 3/4 | e99be5d1 | artifact_safe_haven | MEAS-REF | CANDIDATE_UNTOUCHED（候选） | shelter/artifact 族重叠 |
| 16 | 3/4 | 46530521 | Crisis Backup Decision | MEAS-REF | CANDIDATE_UNTOUCHED（候选） | data-resilience（dev 36）重叠 |
| 17 | 4/4 | e7cb6082 | scientists_animal_base_decision | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | research-base/site 选择 |
| 18 | 3/4 | 2ddf9af7 | choosing_base_camp | AD-REF | CANDIDATE_UNTOUCHED（候选） | 远征基地；可能 research-base 族重叠（packet 已标待判） |
| 19 | 3/4 | 030e2d74 | city_storm_shelter_decision | NONE | REVIEW_REQUIRED | shelter 族（dev 25,26,34,42 已暴露） |
| 20 | 3/4 | fb261247 | meteor_shower_shelter | NONE | REVIEW_REQUIRED | shelter 族 |
| 21 | 3/4 | db050ac8 | emergency_transportation_decision | HELD | EXCLUDE_HELDOUT_REUSE | heldout；transport |
| 22 | 3/4 | cded9e04 | Antarctic Storm Safe Haven | NONE | REVIEW_REQUIRED | shelter 族 |
| 23 | 3/4 | 82f7ae4a | community_banquet_venue_decision | NONE | REVIEW_REQUIRED | venue 族（dev 44,59） |
| 24 | 3/4 | 0c1f6d8c | Critical Data Backup Site Selection | NONE | REVIEW_REQUIRED | data-resilience（dev 36） |
| 25 | 4/4 | 2092d800 | select_emergency_shelter | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | shelter |
| 26 | 3/4 | 00deea01 | manuscript_flood_shelter | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | shelter |
| 27 | 3/4 | 32a6ff4e | research_station_site_selection | NONE | REVIEW_REQUIRED | research-base 族（heldout design 已列为已暴露族） |
| 28 | 3/4 | 80c7eaf6 | Rescue the Lost Researchers | AD-REF | CANDIDATE_UNTOUCHED（候选） | 多角色搜救协调；无直接已观察同族 → 低-中风险 |
| 29 | 3/4 | ca871466 | Safe Shelter Selection | NONE | REVIEW_REQUIRED | shelter 族 |
| 30 | 3/3 | 57a467a9 | the_lead_investor_decision | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | 投资/公司决策 |
| 31 | 3/4 | e5f71916 | weather_sensor_deployment | MEAS-REF | CANDIDATE_UNTOUCHED（候选） | sensor-placement（dev 53）重叠 |
| 32 | 3/4 | 1614cb0d | critical_vaccine_route | NONE | REVIEW_REQUIRED | transport 族（heldout 21, dev 10） |
| 33 | 3/3 | 1b878353 | Critical Sample Transfer | AD-REF | CANDIDATE_UNTOUCHED（候选） | transport 族（packet 已标待判）；A=3 覆盖 |
| 34 | 3/3 | 8cb917ec | Safe Haven After the Spill | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | shelter |
| 35 | 3/4 | 418e8dc6 | the_safe_shelter | NONE | REVIEW_REQUIRED | shelter 族 |
| 36 | 3/4 | 4959ec8f | datacenter_emergency_migration | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | data-resilience |
| 37 | 3/4 | e06ca789 | emergency_warehouse_selection | NONE | REVIEW_REQUIRED | 应急设施/仓库选址 |
| 38 | 4/4 | fd4a4e8a | storm_recovery_clinic_site_selection | NONE | CANDIDATE_UNTOUCHED（候选） | 医疗诊所选址；K=4 覆盖；医疗/选址族部分重叠 |
| 39 | 3/4 | 1e3f44fa | emergency_aircraft_landing_site | AD-REF | CANDIDATE_UNTOUCHED（候选） | 航空着陆选址；site-selection 原型 |
| 40 | 3/4 | 894d2620 | emergency_hospital_transfer | NONE | REVIEW_REQUIRED | transport/medical（eng 9, held 65）重叠 |
| 41 | 3/4 | 6fa0ff12 | Space Evacuation Decision | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | evacuation/shelter |
| 42 | 3/4 | a11ce507 | safe_haven_decision | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | shelter |
| 43 | 3/4 | e5268a45 | The Artifact Delivery | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | artifact transfer/delivery |
| 44 | 3/4 | f2942fec | Choosing the Safe Offsite Venue | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | venue |
| 45 | 3/4 | faa20624 | Safe Lab Choice After Earthquake | AD-REF | CANDIDATE_UNTOUCHED（候选） | 震后实验室选址；site-selection 原型 |
| 46 | 3/4 | 8dbd6de4 | emergency_evacuation_center_choice | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | evacuation/shelter |
| 47 | 3/4 | 99784b81 | Find the Missing Prototype | NONE | CANDIDATE_UNTOUCHED（候选） | 科技公司失窃推断；与 dev 48 missing-item 原型部分重叠 |
| 48 | 3/4 | 7015582d | missing_lab_sample | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | missing-item |
| 49 | 3/4 | 772a4ca7 | choosing_the_safe_field_station | NONE | REVIEW_REQUIRED | research-base/field-station 族 |
| 50 | 3/3 | 736ecf57 | secure_meeting_room_decision | NONE | CANDIDATE_UNTOUCHED（候选） | 危机通信会议室选址；无直接已观察同族 → 低-中风险；A=3 覆盖 |
| 51 | 3/4 | 6dfa5f3c | emergency_supply_distribution | NONE | REVIEW_REQUIRED | transport/logistics（dev 10）重叠 |
| 52 | 3/4 | fac43ca8 | mountain_storm_shelter | NONE | REVIEW_REQUIRED | shelter 族 |
| 53 | 4/4 | 00e21424 | sensor_placement_decision | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | sensor-placement |
| 54 | 3/4 | f4778aac | island_research_base_choice | NONE | REVIEW_REQUIRED | research-base 族 |
| 55 | 3/4 | b8638c4c | emergency_drone_delivery | AD-REF | CANDIDATE_UNTOUCHED（候选） | transport 族（packet 已标待判） |
| 56 | 3/4 | 8a8bd414 | Secure the Masterpiece | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | 文物/物品安保 |
| 57 | 3/4 | 8e8fd5b9 | archaeological_dig_site | HELD | EXCLUDE_HELDOUT_REUSE | heldout；site |
| 58 | 3/4 | 11707910 | secure_negotiation_site_selection | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | site 选择 |
| 59 | 3/4 | ba72bafa | last_minute_move | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | venue/relocation |
| 60 | 3/4 | 6c8e6e37 | The Elusive Bird Sighting | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | 野外观测 |
| 61 | 3/4 | 16a1d143 | power_outage_island | HELD | EXCLUDE_HELDOUT_REUSE | heldout；故障诊断 |
| 62 | 3/4 | 2120fd18 | company_acquisition_decision | PAID+DEV | EXCLUDE_PAID_EXPOSURE / EXCLUDE_DEVELOPMENT | 公司并购 |
| 63 | 3/4 | 5e35463b | Emergency Event Relocation | NONE | REVIEW_REQUIRED | venue 族 |
| 64 | 3/4 | 9ae25ab2 | Office Outbreak Mystery | HELD | EXCLUDE_HELDOUT_REUSE | heldout；public-health |
| 65 | 3/4 | 44ed5f8f | Missing Medicine Delivery | HELD | EXCLUDE_HELDOUT_REUSE | heldout；medical-delivery |

### 1.3 汇总计数

- **EXCLUDE_PAID_EXPOSURE（真实付费 artifact，33）**：1,2,4,5,6,7,8,9,10,14,17,21,25,26,30,34,36,41,42,43,44,46,48,53,56,57,58,59,60,61,62,64,65
- **EXCLUDE_DEVELOPMENT（feature/threshold/action 开发，25）**：1,2,4,6,8,9,10,17,25,26,30,34,36,41,42,43,44,46,48,53,56,58,59,60,62（⊂ PAID）
- **EXCLUDE_HELDOUT_REUSE（8）**：5,7,14,21,57,61,64,65
- **CANDIDATE_UNTOUCHED（仓库证据无付费/开发/heldout 使用，32）**：3,11,12,13,15,16,18,19,20,22,23,24,27,28,29,31,32,33,35,37,38,39,40,45,47,49,50,51,52,54,55,63
- **REVIEW_REQUIRED（无真实运行但模板/语义泄漏风险，14）**：3,19,20,22,23,24,27,29,32,35,37,40,49,51,52,54,63（17 项，含 3 的模板级泄漏）

> 注：3 与已付费 1,2 共用同一 `description` hash（evacuation 模板）→ 模板级排除，不应进入任何推荐。CANDIDATE_UNTOUCHED 中其余多数落在已观察家族（shelter/venue/data/research-base/transport/missing-item）的语义原型内，见 §2。

---

## 2. INFERENCE — 候选分层与 fresh 家族可用性

### 2.1 模板/语义族与已观察家族的重叠

已观察（dev + heldout + eng-paid）家族已覆盖：evacuation、shelter/safe-haven、venue/offsite、data-resilience、research-base/site-selection、transport/logistics、missing-item、sensor-placement、company/investment、hidden-profile、medical、public-health、fault-diagnosis、artifact-transfer。

CANDIDATE_UNTOUCHED 的 32 项中，多数按 task description 落回这些已观察家族：

- shelter/evac 家族：3,12,15,19,20,22,29,35,52
- venue/relocation 家族：11,23,63
- data-resilience 家族：16,24
- research-base/site 家族：18,27,49,54
- transport/logistics 家族：32,33,40,51,55
- missing-item 原型：47
- sensor-placement：31

按 heldout design §3.2 的“共享题面/证据结构”标准，这些与原已观察任务共享问题表面，fresh 隔离度低。

### 2.2 相对独立的候选

描述结构上无直接已观察同族、或族重叠可控的候选（Claude Code 仅建议，不签署）：

| 候选 | K/A | 建议 leakage group（PENDING/建议值） | 风险 |
|---|---|---|---|
| 13 | 3/4 | `hb-v6r1:laboratory-theft-deduction` | 低：whodunit 盗窃推断，无已观察同族 |
| 28 | 3/4 | `hb-v6r1:lost-researcher-rescue-coordination` | 低-中：多角色搜救协调 |
| 50 | 3/3 | `hb-v6r1:secure-crisis-communications-room` | 低-中：危机通信会议室；A=3 覆盖 |
| 38 | 4/4 | `hb-v6r1:emergency-field-clinic-siting` | 中：医疗诊所选址；K=4 覆盖；与医疗/选址族部分重叠 |
| 47 | 3/4 | `hb-v6r1:corporate-missing-prototype-investigation` | 中：失窃推断；与 missing-item 原型部分重叠（设置不同） |
| 39 | 3/4 | `hb-v6r1:emergency-aircraft-landing-siting` | 中：航空着陆选址；site-selection 原型 |
| 45 | 3/4 | `hb-v6r1:post-seismic-lab-siting` | 中：震后实验室选址；site-selection 原型 |
| 18 | 3/4 | `hb-v6r1:expedition-basecamp-siting` | 中-高：packet 已标 research-base 族待判 |
| 33 | 3/3 | `hb-v6r1:critical-sample-transit` | 中-高：packet 已标 transport 族待判；A=3 覆盖 |
| 55 | 3/4 | `hb-v6r1:emergency-drone-delivery` | 中-高：packet 已标 transport 族待判 |

### 2.3 STOP CONDITION — fresh 家族数量评估

**STOP CONDITION（建议）：** 按上述保守模板-语义映射，可“相对合理隔离”的 fresh cluster 约 7–10 个（13,28,50,38,47,39,45 为低-中风险；18,33,55 需族重叠容忍）。其中明确低风险者约 4–7 个。**无法由本次机械审计自信确认“≥8 个可合理隔离的 fresh task clusters”。**

因此：**不静默复用旧 heldout 任务，不自行签署 accepted；本候选集交 Codex/Owner 语义审查后决定是否 ≥8 个 cluster 可用。** 若 owner 的语义审查接受更高的族重叠容忍（例如把 clinic/site/whodunit 等视为独立表面），则候选集足以支撑 8–12 个 cluster；若严格按“共享题面”排除，则 fresh cluster 不足 8，应 STOP 或扩展任务库。

---

## 3. DESIGN INTENT — 推荐 review packet（供 Codex/Owner 选择 8–12）

从 CANDIDATE_UNTOUCHED 提供的候选（owner 决定 accept/reject/merge/replace 前一律 `PENDING`）。候选选择仅基于未使用状态、K/agent 覆盖、模板多样性、语义族分离与结构性调用成本，未读取任何 outcome。

| 候选 | K/A | 建议 semanticLeakageGroup | ownerDecision | accept/reject/merge/replace | 备注 |
|---|---|---:|---|---|---|---|
| 13 | 3/4 | `laboratory-theft-deduction` | PENDING | PENDING | 低风险；whodunit |
| 28 | 3/4 | `lost-researcher-rescue-coordination` | PENDING | PENDING | 低-中 |
| 50 | 3/3 | `secure-crisis-communications-room` | PENDING | PENDING | A=3 覆盖 |
| 38 | 4/4 | `emergency-field-clinic-siting` | PENDING | PENDING | K=4 覆盖 |
| 47 | 3/4 | `corporate-missing-prototype-investigation` | PENDING | PENDING | 与 missing-item 原型重叠待判 |
| 39 | 3/4 | `emergency-aircraft-landing-siting` | PENDING | PENDING | site 原型 |
| 45 | 3/4 | `post-seismic-lab-siting` | PENDING | PENDING | site 原型 |
| 18 | 3/4 | `expedition-basecamp-siting` | PENDING | PENDING | research-base 族待判 |
| 33 | 3/3 | `critical-sample-transit` | PENDING | PENDING | transport 族待判；A=3 覆盖 |
| 55 | 3/4 | `emergency-drone-delivery` | PENDING | PENDING | transport 族待判 |
| 16 | 3/4 | `crisis-backup-resilience` | PENDING | PENDING | data 族重叠待判 |
| 11 | 3/4 | `conference-relocation` | PENDING | PENDING | venue 族重叠待判 |
| 15 | 3/4 | `artifact-safe-haven` | PENDING | PENDING | shelter/artifact 重叠待判 |
| 12 | 3/4 | `park-evacuation` | PENDING | PENDING | evac 族重叠待判 |
| 31 | 3/4 | `weather-sensor-deployment` | PENDING | PENDING | sensor 族重叠待判 |
| 37 | 3/4 | `emergency-warehouse-siting` | PENDING | PENDING | 设施选址原型待判 |
| 24 | 3/4 | `offline-data-backup-siting` | PENDING | PENDING | data 族重叠待判 |
| 40 | 3/4 | `emergency-hospital-transit` | PENDING | PENDING | transport/medical 重叠待判 |

> 建议把前 10 个（13,28,50,38,47,39,45,18,33,55）作为首批语义审查对象；若不足 8 个可隔离，再按重叠容忍评估后 8 个。任何候选未获 owner 接受前不得进入 frozen plan。

## 4. UNKNOWN

- 语义家族归属的最终判定（Claude Code 未签署）。
- 每个候选在**新 disclosure 协议**下的 uptake 与效果（未执行，不允许预测）。
- 若 owner 要求扩展任务库：pinned 65 之外的任务源不存在于当前仓库，属 UNKNOWN。

## 5. STOP CONDITION

若 Codex/Owner 语义审查后 fresh leakage clusters < 8：**STOP——不执行 32–48 run screen；不静默复用旧 heldout 任务；不扩大样本凑数。** 若 ≥ 8：进入最小接线（见 wiring-gap audit）。
