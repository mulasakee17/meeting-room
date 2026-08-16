# SwarmAlpha 文档清理 — 文件级 Manifest（只读，未执行任何移动/删除）

日期：2026-08-15
状态：**MANIFEST ONLY — 未移动、未删除**。规则：tracked 用 `git mv` 归档；untracked 先归档并纳入可恢复提交，绝不直接删；active 引用更新；历史引用指向 archive；建立 `docs/archive/README.md`；跑链接/TS/测试/build 检查；单独一次文档清理 commit。
建议规则（owner 2026-08-15）：**STRATEGIC_PLAN 暂时 KEEP**；SOT/旧理论/旧研究设计/theory closure **默认 ARCHIVE 而非 DELETE**；**untracked 一律不删**；DELETE 仅限 tracked + 无 active 引用 + 内容已被实现/测试/报告吸收 + 非预注册/审计记录 + 通过全仓链接检查，且需先做内容唯一性检查。

图例：`T/U`=tracked/untracked；`refs`=全仓引用它的文档数（docs+src+test+README，不含自身）。

## A. KEEP（active，不移动不删除）

| 文件 | T/U | refs | 唯一内容 | 替代文档 | 建议 |
|---|---|---|---|---|---|
| `docs/plans/SWARMALPHA_STRATEGIC_EXECUTION_PLAN_V1.md` | T | 2 | 低上下文证据驱动执行基线；**仍被白皮书+异构契约引用** | 集成指南(08-14) | **KEEP**（等白皮书/契约解除引用后再归档） |
| `docs/research/CURRENT_ROUTE_AND_METHODOLOGY.md` | U | 0 | 当前研究权威入口 | — | KEEP |
| `docs/plans/SWARMALPHA_INTEGRATED_RESEARCH_EXECUTION_GUIDE_2026-08-14.md` | U | 0 | 当前执行权威 | — | KEEP |
| Source Disclosure Phase1/2 文档（4 个） | U | 0–1 | 冻结实验设计/执行授权 | — | KEEP |
| `docs/strategy/SWARMALPHA_WHITEPAPER_V1.md` | T | 0 | 长期战略 | — | KEEP |
| 两个 research contract（theory/） | U/T | 0 | 规范性契约 | — | KEEP |

## B. ARCHIVE（历史价值，不删；含理论演化/预注册意图/审计证据）

| 文件 | T/U | refs | 唯一内容 | 替代文档 | 风险 |
|---|---|---|---|---|---|
| `docs/SOT.md` | T | 12 | 2026-08-05 数字快照（自声明过时） | WHITEPAPER + CURRENT_ROUTE | 12 处引用需改指向 archive |
| `docs/EXPERIMENT_DESIGN_V7.md` | T | 2 | pre-V6 设计稿（"待确认后执行"） | CURRENT_ROUTE | 低 |
| `docs/GOVERNANCE_DESIGN.md` | T | 6 | 已落地的治理设计(2026-07) | V6_GOVERNANCE_ENGINE | 6 处引用 |
| `docs/research/THEORY.md` | T | 15 | 旧理论叙事 | CURRENT_ROUTE + contracts | **15 处引用，最高** |
| `docs/research/EXPERIMENT_DESIGN.md` | T | 6 | 旧实验设计 | CURRENT_ROUTE | 中 |
| `docs/research/CONTRIBUTIONS.md` | T | 1 | 旧贡献主张 | CURRENT_ROUTE | 低 |
| `docs/theory/SWARMALPHA_V6_FOUNDATION.md` | T | 2 | 旧理论基底 | research contracts | 低 |
| `docs/theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md` | T | 11 | 理论收口(08-10) | research contracts | **11 处引用** |
| `docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md` | T | 4 | 08-08 施工合同 | 集成指南 | 中 |
| `docs/plans/SWARMALPHA_V6_FINAL_INTEGRATED_PLAN_2026-08-10.md` | T | 1 | 曾自称权威，已被 08-14 取代 | 集成指南 | 低 |
| `docs/plans/SWARMALPHA_V6_FOUNDATION_GOVERNANCE_AUDIT_2026-08-09.md` | T | 3 | 治理审计 | 集成指南 | 低 |
| `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md` | T | 7 | 执行进度(旧) | 集成指南 | 中 |
| D2 旧 handoff（8 个：SOURCE_DISCLOSURE_SCREEN_HANDOFF、POST_ROUND1_ACTION_DISCOVERY、MEASUREMENT_RUNNER、THREE_DAY、ACTIVE_INFORMATION+RESULT、MINIMAL_ACTIVE_CONTROL+RESULT） | 多 U | 0–2 | 执行顺序 + 预注册意图 + 审计 | 集成指南 | untracked 多，绝不直接删 |
| D2 旧 gap audit（TWO_STAGE_RANDOMIZATION、OPERATIONAL_OUTCOME_*、VERIFICATION_VERDICT_V2、HIDDENBENCH_V6_*、MEASUREMENT_VALIDITY_WIRING 等） | T | 0–2 | 功能实现前的 gap 审计 | 实现+测试 | 低-中 |
| `docs/INTEGRATION.md` / `docs/DATA_ANALYSIS_2026-08-07.md` / `docs/SWARMALPHA_TECHNICAL_DOCUMENTATION.md` / `docs/PROFESSOR_GUIDE.md` / `docs/COLLABORATION_GUIDE.md` | T | 0–7 | 旧指南/分析/技术文档 | CURRENT_ROUTE + architecture | 中 |

## C. DELETE 候选（仅当通过内容唯一性检查后；tracked + 0 active 引用 + 内容已吸收 + 非预注册/审计）

| 文件 | T/U | refs | 内容 | 建议 | 需检查 |
|---|---|---|---|---|---|
| `CLAUDE_CODE_CC6B_OPERATIONAL_OUTCOME_HANDOFF_2026-08-10.md` | T | 0 | 对抗测试执行 | 测试已吸收 | 检查是否含预注册意图 |
| `CLAUDE_CODE_CC7_SCHEMA5_OPERATIONAL_CARRIER_HANDOFF_2026-08-10.md` | T | 0 | schema5 carrier | 实现已吸收 | 同上 |
| `CLAUDE_CODE_HANDOFF_CONFIRMATORY_GUARDS.md` | T | 0 | 确认性护栏 | 测试已吸收 | 同上 |
| `CLAUDE_CODE_HANDOFF_F4_EDGE_AND_F5_PREP_2026-08-10.md` | T | 0 | F4/F5 边缘 | 测试已吸收 | 同上 |
| `CLAUDE_CODE_V6_AUTHORITY_EDGE_HANDOFF_2026-08-11.md` | T | 0 | 权威边界边缘验证 | 测试已吸收 | 同上 |
| `CLAUDE_CODE_V6_AUTHORITY_TRUTH_CLEANUP_2026-08-11.md` | T | 0 | truth 清理 | 实现已吸收 | 同上 |
| `CLAUDE_CODE_V6_DETECTION_VALIDATION_HANDOFF_2026-08-11.md` | T | 0 | detection 校验 | 测试已吸收 | 同上 |
| `SWARMALPHA_V6_ONE_WEEK_PLAN_2026-08-11.md` | T | 0 | 一周计划 | 集成指南 | 同上 |

> 上述 8 个均为 tracked、0 引用。**删除前必须逐文件确认不含唯一预注册/审计记录**；若含，改为 ARCHIVE。任何含唯一审计/预注册内容的文件一律不进 DELETE。

## D. 执行顺序（等 owner 审核本 manifest 后）

1. 确认 manifest；
2. tracked → `git mv` 到 `docs/archive/`；untracked → 归档 + 一次可恢复提交；
3. 更新 active 文档引用指向 archive；建 `docs/archive/README.md`（说明归档不代表当前事实）；
4. 跑链接检查、tsc、测试、build；
5. **单独一次文档清理 commit**，不与实验代码混合。
