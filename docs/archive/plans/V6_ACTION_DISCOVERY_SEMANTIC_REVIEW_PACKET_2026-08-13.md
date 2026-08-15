# V6 Action Discovery — Semantic Review Packet

日期：2026-08-13
状态：**OWNER REVIEW REQUIRED — Claude Code 未签署任何 accepted semantic review。** 计划仅在恰好 16 个唯一 semantic leakage groups 被外部标记 accepted 后生成（否则 fail-closed、provider zero calls）。

权威设计：[`CLAUDE_CODE_POST_ROUND1_ACTION_DISCOVERY_HANDOFF_2026-08-13.md`](CLAUDE_CODE_POST_ROUND1_ACTION_DISCOVERY_HANDOFF_2026-08-13.md)

## 0. 用途与 Gate

- 任务必须与已观察开发 IDs `2,6,10,25,26,30,34,36,41,42,43,44,46,48,53,56,58,59,60,62` 分离；
- 已人工审过但从未执行的 `5,7,14,21,57,61,64,65` 可进入候选；
- 额外候选按 task description/template/leakage group 审查，**不按 correct_answer 选择**；
- 全部候选标 `OWNER REVIEW REQUIRED`；
- `buildActionDiscoveryPlanV1` 只接受 16 个 accepted group 且每组映射到冻结 task 的建议 group id；否则抛错 fail-closed。

## 1. 候选清单（16）

前 8 条（task 5,7,14,21,57,61,64,65）为设计 §3.2 已人工审阅、从未执行；后 8 条为本次生成的新候选。**全部需 owner 复核。**

| task | 名称 | 建议 leakage group | 语义理由（供 reviewer 判断） |
|---|---|---:|---|---|
| 5 | baker_2010 | `hb-v6r1:academic-leadership-selection` | 多属性人事候选评估；已审 |
| 7 | graetz_et_al_1998 | `hb-v6r1:requirements-proposal-evaluation` | 显式 RFP requirement matrix + 分布式 checklist；已审 |
| 14 | lunch_group_decision | `hb-v6r1:everyday-constraint-choice` | 餐饮安全/可达性约束的日常选择；已审 |
| 21 | emergency_transportation_decision | `hb-v6r1:emergency-transport-routing` | 路线可达性与时效；已审（唯一 transport 代表） |
| 57 | archaeological_dig_site | `hb-v6r1:archaeological-site-preservation` | 文物抢救地点选择，独立环境/施工约束；已审 |
| 61 | power_outage_island | `hb-v6r1:infrastructure-fault-diagnosis` | 分布式观测下的故障源诊断；已审 |
| 64 | (public-health) | `hb-v6r1:public-health-causal-diagnosis` | 分布式证据下的疾病来源诊断；已审 |
| 65 | (medical-delivery) | `hb-v6r1:medical-delivery-location-trace` | 已知投递物去向定位；已审 |
| 8 | Stasser_Stewart_1992 | `hb-v6r1:hidden-profile-discussion-integration` | 经典 hidden-profile 群体信息整合；与已观察 family 不同 |
| 13 | (lab theft) | `hb-v6r1:laboratory-theft-deduction` | 盗窃推断（whodunit）；非地点/路线选择 |
| 18 | choosing_base_camp | `hb-v6r1:expedition-basecamp-selection` | 远征基地选择，环境约束；**可能与 research-station 族重叠，请 reviewer 判断** |
| 28 | (lost-researcher rescue) | `hb-v6r1:lost-researcher-rescue-coordination` | 搜救协调，多角色信息拼合；非设施选址 |
| 33 | (critical sample transfer) | `hb-v6r1:critical-sample-transfer` | 实验室样本转运（时间/温度约束）；**可能与 transport 族重叠，请判断** |
| 39 | emergency_aircraft_landing_site | `hb-v6r1:emergency-aircraft-landing-site` | 航空紧急着陆点；非公路/路线 |
| 45 | (post-seismic lab) | `hb-v6r1:post-seismic-lab-selection` | 震后实验室选址；非安全设施模板 |
| 55 | emergency_drone_delivery | `hb-v6r1:emergency-drone-delivery` | 无人机投递路由；**可能与 transport 族重叠，请判断** |

> 标"请判断"的三条（18/33/55）是刻意标出的族重叠风险；owner 若认为与既有族冲突，可 reject/merge，届时不足 16 个 accepted → plan fail-closed（DEFER），这正是设计意图。

## 2. Reviewer 决定表（回填后作为 owner 决定）

| taskId | leakageGroup | accept | reject | merge | revise | 备注 |
|---|---:|---|---|---|---|---|
| 5 | `hb-v6r1:academic-leadership-selection` | [ ] | [ ] | [ ] | [ ] | |
| 7 | `hb-v6r1:requirements-proposal-evaluation` | [ ] | [ ] | [ ] | [ ] | |
| 14 | `hb-v6r1:everyday-constraint-choice` | [ ] | [ ] | [ ] | [ ] | |
| 21 | `hb-v6r1:emergency-transport-routing` | [ ] | [ ] | [ ] | [ ] | |
| 57 | `hb-v6r1:archaeological-site-preservation` | [ ] | [ ] | [ ] | [ ] | |
| 61 | `hb-v6r1:infrastructure-fault-diagnosis` | [ ] | [ ] | [ ] | [ ] | |
| 64 | `hb-v6r1:public-health-causal-diagnosis` | [ ] | [ ] | [ ] | [ ] | |
| 65 | `hb-v6r1:medical-delivery-location-trace` | [ ] | [ ] | [ ] | [ ] | |
| 8 | `hb-v6r1:hidden-profile-discussion-integration` | [ ] | [ ] | [ ] | [ ] | |
| 13 | `hb-v6r1:laboratory-theft-deduction` | [ ] | [ ] | [ ] | [ ] | |
| 18 | `hb-v6r1:expedition-basecamp-selection` | [ ] | [ ] | [ ] | [ ] | 族重叠待判 |
| 28 | `hb-v6r1:lost-researcher-rescue-coordination` | [ ] | [ ] | [ ] | [ ] | |
| 33 | `hb-v6r1:critical-sample-transfer` | [ ] | [ ] | [ ] | [ ] | 族重叠待判 |
| 39 | `hb-v6r1:emergency-aircraft-landing-site` | [ ] | [ ] | [ ] | [ ] | |
| 45 | `hb-v6r1:post-seismic-lab-selection` | [ ] | [ ] | [ ] | [ ] | |
| 55 | `hb-v6r1:emergency-drone-delivery` | [ ] | [ ] | [ ] | [ ] | 族重叠待判 |

回填时给每个 accepted 项 `reviewedAt`（须早于 plan createdAt `2026-08-13T10:00:00.000Z`）。

## 3. 免责与纪律

- 本 packet 由确定性生成器产生，**不构成已接受的 semantic review**；owner 未显式接受前，`buildActionDiscoveryPlanV1` 对任何缺失/不一致项 fail-closed。
- 选择依据是 description/template/leakage group，**不按 correct_answer**。
- 候选泄漏 group 是建议；owner 可 merge 同族、拒绝语义不保持的变体。
