# Document Cleanup Whitelist (冻结保护清单)

Status: normative for any document-cleanup task. Date: 2026-08-16.

本清单列出**禁止删除、禁止移动、禁止改写**的路径。任何清理任务（冗杂文档清理、
归档、去重）在动手前必须先读本清单，并在清理报告中逐条声明"未触碰白名单"。

清理范围**只限文档（.md/.tex/.py 等文本或产物）**，且默认行为是**移动到
`docs/archive/` 而非硬删除**。凡拿不准的，一律留原处并在报告中列为
"UNCERTAIN"，不得自行判定删除。

---

## Tier 0 — 顶层指令与密钥（绝对禁区，碰都不要碰）

- `AGENTS.md`
- `CLAUDE.md`
- `.env*`（含密钥，任何情况下不得读内容、不得移动、不得删除、不得写进报告）
- `package.json`、`tsconfig.json`、`next.config.*`、`.gitignore`、`.git/**`

## Tier 1 — 第一篇论文（active deliverable，不可动）

- `paper_rewriting_output/final_paper/paper.en.md` —— 论文正文（唯一权威稿）
- `paper_rewriting_output/final_paper/CHANGELOG_PRE_SUBMISSION.md`
- `paper_rewriting_output/final_paper/main.tex`（及将来同步的任何 LaTeX 版）
- `paper_rewriting_output/claim_register.md`
- `paper_rewriting_output/source_inventory.md`
- `paper_rewriting_output/section_blueprints.md`
- `paper_rewriting_output/figure_asset_map.md`
- `paper_rewriting_output/confirmed_contribution.md`
- `paper_rewriting_output/results_validation.md`、`results_validation_check.md`
- `paper_rewriting_output/paper_spine_config.json`

## Tier 2 — 论文证据链（实验结果与理论，不可动）

- `docs/experiments/FORK_CONFIRMATORY_RESULTS_2026-08-15.md` —— 主结果（FACT）
- `docs/experiments/FORK_CONFIRMATORY_CHECKLIST.md`
- `docs/experiments/HIDDENBENCH_PROTOCOL_COMPARISON.md`
- `docs/experiments/EXPERIMENT_LOG.md`
- `docs/experiments/V6_FALSE_CONSENSUS_DETECTOR_2026-08-15.md`
- `docs/experiments/V6_CROSS_EVIDENCE_EXCHANGE_RESULTS_2026-08-15.md`
- `docs/experiments/REPLAY_VERIFICATION.md`
- `docs/theory/EPISTEMIC_EXPOSURE_GOVERNANCE_THEORY_V1.md`
- `docs/theory/COVERAGE_GAP_GOVERNANCE_RESEARCH_CONTRACT_V1.md`
- `docs/PLATFORM_CAPABILITY_BRIEF.md`

## Tier 3 — 规范/导航文档（normative，不可动）

- `docs/REASONING_PROTOCOL.md`
- `docs/ACTIVE_RESEARCH_SURFACE.md`
- `docs/AUDIT_CLAIM_VERIFICATION.md`
- `docs/architecture/**`（所有 V1 契约：EPISTEMIC_QUANTITY_SEMANTICS、PRIMARY_ASSIGNMENT_V1、
  FINAL_PRIVATE_OUTCOME_V1、GOVERNANCE_AUDIT_TRAIL_V1、OPERATIONAL_OUTCOME_V1、
  V6_PRODUCTION_VERTICAL_SLICE_V1、MEASUREMENT_VALIDITY_PROTOCOL_V1、
  ACTIVE_INFORMATION_GOVERNANCE_V1、HIDDENBENCH_V6_INTEGRATION_CONTRACT_V1、
  COLLECTIVE_EPISTEMIC_STATE_V1、GOVERNANCE_QUALITY_MEASUREMENT_V1、
  V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1 等）

## Tier 4 — 当前工作表面代码（不可动）

- `src/lib/epistemic/**`
- `src/lib/governance/**`
- `src/lib/experimentation/**`
- `src/lib/utils/**`
- `experiments/campaign/v6/**`（含 `run_v6_fork.ts`、`analyze_v6_fork.ts`、
  `pre_submission_analysis.mjs`、`post_submission_v3_analysis.mjs`、
  全部 `v6_*.plan.json` / `v6_*.manifest.json`）
- `experiments/campaign/measurement/**`
- `experiments/campaign/replayVerifier.ts`、`verify_replay.ts`
- `test/**`（所有测试）

## Tier 5 — 冻结实验数据（不可动，重放审计依据）

- `experiments/campaign/pilot_output/**`
  （尤其 `v6-fork-confirmatory-v2-20260815/` 与 `v6-fork-confirmatory-v3-20260816/`）

## Tier 6 — LEGACY_READ_ONLY（历史隔离，不可删除/不可改写）

- `experiments/v2/**`
- `experiments/lunar_survival/**`
- `src/lib/discussion/asyncEngine.ts`
- legacy runtime / thermodynamics 相关路径
- `experiments/campaign/run_e12*.ts` 及对应历史分析
- `docs/experiments/E12_PROTOCOL_COMPARISON.md`

> 说明：Tier 6 是"保留作为出处/对比/旧 artifact 重放"，不是当前证据，也不得被
> 清理任务当作"冗余"删除或改动。可考虑未来整体归档到独立 repo，但本清理任务不碰。

---

## 清理范围（候选，允许保守处理）

以下路径**允许**进入清理评估，但必须遵守三条铁律：

1. **默认移动、不硬删**：移到 `docs/archive/`（保留原名），报告里给出一对一来源→去向映射。
2. **去重要有证据**：删除/移动前必须确认"被另一份白名单内文档完全覆盖或已被取代"，
   并在报告里写明"取代者是谁"。纯"看起来旧"不是删除理由。
3. **拿不准→不动**：任何不确定的文件，原样保留并列入 UNCERTAIN。

候选范围：

- `docs/archive/**` —— 已隔离的历史文档，允许内部去重/合并，但**不得**把 Tier 0–5 里的东西搬进来。
- `docs/plans/**` —— 带日期的 handoff / gap-audit / implementation 计划，多数已被实现取代，允许归档。
- `docs/paper/**` —— 旧论文草稿（PAPER_DRAFT.md、PAPER_PROFESSOR_VERSION.md、
  TECHNICAL_APPENDIX.md、ABLATION_PLAN.md、PAPER_OPTIMIZATION_GUIDE.md 等），
  已被 `paper_rewriting_output/final_paper/paper.en.md` 取代，允许归档。
  例外：`AAMAS_SUBMISSION_CHECKLIST.md` 若与投稿直接相关，列为 UNCERTAIN。
- `docs/roadmap/**`、`docs/roadmap/ROADMAP_V6.md` —— 旧路线图，允许归档。
- `docs/strategy/SWARMALPHA_WHITEPAPER_V1.md` —— 长期设计叙事，UNCERTAIN（被导航文档引用，默认保留）。
- `docs/research/**` —— 见 `ACTIVE_RESEARCH_SURFACE.md` 引用关系，UNCERTAIN。
- `paper_rewriting_output/**`（**排除** Tier 1 列出的文件）—— 中间产物允许清理：
  dossier/matrix/audit/report 等草稿、`pdf_qa/**` 与 `aamas_cut_pdf_qa/**` 的 PNG、
  `__pycache__/**`、`*.pyc`、`*.bak*`、`*.zh.*`（中文版若不再需要）、
  `aamas_cut.*`（若已被 paper.en.md 取代）。这些是典型的"冗杂"目标。

---

## 清理任务必须产出的报告格式

完成后输出 `docs/cleanup_report.md`，包含：

1. **Moved**（来源 → `docs/archive/` 去向，逐条）
2. **Deleted**（硬删除的文件 + 为什么安全：被谁取代）
3. **Kept / Whitelist untouched**（明确声明 Tier 0–6 全部未动）
4. **UNCERTAIN**（没动但需要人来判断的文件清单）
5. **No-touch violations**（若发现白名单文件被误动，立刻停止并报告）

凡无法给出第 2 项"被谁取代"证据的文件，一律不得硬删除。
