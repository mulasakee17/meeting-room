# SwarmAlpha 冗杂文档清理报告

日期：2026-08-16
执行依据：`docs/CLEANUP_WHITELIST.md`（2026-08-16 版）、`docs/REASONING_PROTOCOL.md`、`AGENTS.md`。
方式：默认移动（MOVE）至 `docs/archive/`；硬删除仅 1 项（可再生字节码缓存）。
前置事实：上一轮清理 Manifest（`docs/plans/DOCUMENTATION_CLEANUP_MANIFEST_2026-08-15.md`）的 ARCHIVE 项已全部在 `docs/archive/` 中，本轮未重复处理；其 KEEP 决策（集成指南、战略执行计划、Source Disclosure 系列）本轮逐一复核后维持。

---

## 1. Moved（来源 → docs/archive/ 去向，共 63 个文件）

### docs/paper/ → docs/archive/paper/（5）
被 `paper_rewriting_output/final_paper/paper.en.md`（Tier 1 唯一权威稿）取代（白名单 §docs/paper/** 明示）：

1. `docs/paper/PAPER_DRAFT.md` → `docs/archive/paper/PAPER_DRAFT.md`
2. `docs/paper/PAPER_PROFESSOR_VERSION.md` → `docs/archive/paper/PAPER_PROFESSOR_VERSION.md`
3. `docs/paper/TECHNICAL_APPENDIX.md` → `docs/archive/paper/TECHNICAL_APPENDIX.md`
4. `docs/paper/ABLATION_PLAN.md` → `docs/archive/paper/ABLATION_PLAN.md`
5. `docs/paper/PAPER_OPTIMIZATION_GUIDE.md` → `docs/archive/paper/PAPER_OPTIMIZATION_GUIDE.md`

### docs/roadmap/ → docs/archive/roadmap/（2）
旧路线图，白名单 §docs/roadmap/** 明示允许归档：

6. `docs/roadmap/ROADMAP_V6.md` → `docs/archive/roadmap/ROADMAP_V6.md`
7. `docs/roadmap/future.md` → `docs/archive/roadmap/future.md`

### docs/plans/ → docs/archive/plans/（9）
带日期计划；逐文件核实无活跃引用（全仓 md + src/test/experiments 代码）。被取代者见"取代证据"列：

8. `docs/plans/V6_CALIBRATION_PILOT_TABLE_2026-08-11.md` → `docs/archive/plans/`（0 引用；Pilot 已执行，`V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1` 为现行权威）
9. `docs/plans/V6_PRE_PILOT_FREEZE_2026-08-11.md` → `docs/archive/plans/`（0 引用；冻结已由实际 Pilot 取代）
10. `docs/plans/MEASUREMENT_VALIDITY_V1_IMPLEMENTATION_2026-08-12.md` → `docs/archive/plans/`（实现已落地于 `experiments/campaign/measurement/`，Tier 4；文件自述"已实现"）
11. `docs/plans/MEASUREMENT_VALIDITY_RUNNER_V1_IMPLEMENTATION_2026-08-13.md` → `docs/archive/plans/`（Runner 已实现，Tier 4 代码在位）
12. `docs/plans/V6_VERDICT_MECHANISM_INTERPRETABILITY_AUDIT_2026-08-13.md` → `docs/archive/plans/`（0 引用；机制审计已被 `V6_PROCESS_STATE_FAILURE_PREDICTION_AUDIT_2026-08-13` 等结果文档取代）
13. `docs/plans/V6_VERDICT_TASK_HELDOUT_REPLICATION_DESIGN_2026-08-13.md` → `docs/archive/plans/`（设计已执行，结果在 `V6_VERDICT_TASK_HELDOUT_REPLICATION_RESULTS_2026-08-13.md`；实施报告已在 archive。注意：`experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts` 注释中引用此设计文档，归档后该注释路径失效，不影响代码运行）
14. `docs/plans/MEASUREMENT_VALIDITY_PILOT_SEMANTIC_REVIEW_PACKET_2026-08-13.md` → `docs/archive/plans/`（其所属 THREE_DAY_PILOT 计划已归档，08-14 集成指南取代该路线；无活跃引用）
15. `docs/plans/MEASUREMENT_VALIDITY_TEST_MATRIX_V1.md` → `docs/archive/plans/`（文件自述"已实现为 `test/measurement-validity.test.ts` 65 项确定性对抗测试"，测试为 Tier 4 现行证据）
16. `docs/plans/DOCUMENTATION_CLEANUP_MANIFEST_2026-08-15.md` → `docs/archive/plans/`（上一轮清理 Manifest，其决策已全部执行；被本报告取代）

### paper_rewriting_output/ → docs/archive/paper_rewriting/（25）
白名单 §paper_rewriting_output/**（排除 Tier 1）中间产物：dossier / matrix / audit / report / check / 映射 / 清单 / 草稿：

17. `paper_rewriting_output/source_map.md` → `docs/archive/paper_rewriting/source_map.md`
18. `paper_rewriting_output/sota_gap_map.md` → `docs/archive/paper_rewriting/sota_gap_map.md`
19. `paper_rewriting_output/exemplar_learning_dossier.md` → `docs/archive/paper_rewriting/exemplar_learning_dossier.md`
20. `paper_rewriting_output/research_dossier.md` → `docs/archive/paper_rewriting/research_dossier.md`
21. `paper_rewriting_output/style_profile.md` → `docs/archive/paper_rewriting/style_profile.md`
22. `paper_rewriting_output/motivation_options_after_research.md` → `docs/archive/paper_rewriting/motivation_options_after_research.md`
23. `paper_rewriting_output/citation_support_bank.md` → `docs/archive/paper_rewriting/citation_support_bank.md`
24. `paper_rewriting_output/contribution_check.md` → `docs/archive/paper_rewriting/contribution_check.md`
25. `paper_rewriting_output/original_logic_map.md` → `docs/archive/paper_rewriting/original_logic_map.md`
26. `paper_rewriting_output/rewrite_matrix.md` → `docs/archive/paper_rewriting/rewrite_matrix.md`
27. `paper_rewriting_output/humanize_matrix.md` → `docs/archive/paper_rewriting/humanize_matrix.md`
28. `paper_rewriting_output/humanize_report.md` → `docs/archive/paper_rewriting/humanize_report.md`
29. `paper_rewriting_output/integrity_audit.md` → `docs/archive/paper_rewriting/integrity_audit.md`
30. `paper_rewriting_output/word_report.zh.md` → `docs/archive/paper_rewriting/word_report.zh.md`（*.zh.*，Word 生成过程报告）
31. `paper_rewriting_output/citation_quality_audit.md` → `docs/archive/paper_rewriting/citation_quality_audit.md`
32. `paper_rewriting_output/writing_rationale_matrix.md` → `docs/archive/paper_rewriting/writing_rationale_matrix.md`
33. `paper_rewriting_output/artifact_check.md` → `docs/archive/paper_rewriting/artifact_check.md`
34. `paper_rewriting_output/citation_bank_check.md` → `docs/archive/paper_rewriting/citation_bank_check.md`
35. `paper_rewriting_output/evidence_bank.md` → `docs/archive/paper_rewriting/evidence_bank.md`
36. `paper_rewriting_output/logic_transfer_audit.md` → `docs/archive/paper_rewriting/logic_transfer_audit.md`
37. `paper_rewriting_output/final_artifact_manifest.md` → `docs/archive/paper_rewriting/final_artifact_manifest.md`（中间产物清单；其"required/STALE"判定作为本报告 paper.zh.docx/pdf 归档的证据，随文件一并保留于 archive）
38. `paper_rewriting_output/confirmed_motivation.md` → `docs/archive/paper_rewriting/confirmed_motivation.md`（Tier 1 仅保护 confirmed_contribution.md，未保护本文件）
39. `paper_rewriting_output/latex_report.md` → `docs/archive/paper_rewriting/latex_report.md`
40. `paper_rewriting_output/progress.md` → `docs/archive/paper_rewriting/progress.md`
41. `paper_rewriting_output/paper_spine_config.md` → `docs/archive/paper_rewriting/paper_spine_config.md`（Tier 1 仅保护 `paper_spine_config.json`；package.json 无对 paper_rewriting 路径的引用）
42. `paper_rewriting_output/reference_materials/source_index.md` → `docs/archive/paper_rewriting/reference_materials/source_index.md`

### paper_rewriting_output/pdf_qa/ → docs/archive/paper_rewriting/pdf_qa/（11）
QA 页面渲染 PNG（白名单点名"典型冗杂"；源 PDF 已随 paper.zh.pdf 归档，可再生渲染物）：

43. `paper_rewriting_output/pdf_qa/page-01.png` … `page-11.png` → `docs/archive/paper_rewriting/pdf_qa/`（11 个文件，逐一对应）

### paper_rewriting_output/aamas_cut_pdf_qa/ → docs/archive/paper_rewriting/aamas_cut_pdf_qa/（6）

44. `paper_rewriting_output/aamas_cut_pdf_qa/page-1.png` … `page-6.png` → `docs/archive/paper_rewriting/aamas_cut_pdf_qa/`（6 个文件，逐一对应）

### paper_rewriting_output/final_paper/ → docs/archive/paper_rewriting/final_paper/（4）

45. `paper_rewriting_output/final_paper/paper.zh.docx` → `docs/archive/paper_rewriting/final_paper/paper.zh.docx`（final_artifact_manifest.md 声明 STALE — REGENERATE；由 build_outputs.py 从 paper.zh.md 再生成，二者均在位/在档）
46. `paper_rewriting_output/final_paper/paper.zh.pdf` → `docs/archive/paper_rewriting/final_paper/paper.zh.pdf`（同上，manifest 声明 STALE — REGENERATE + VISUAL QA）
47. `paper_rewriting_output/final_paper/main.tex.bak_measurement_governance` → `docs/archive/paper_rewriting/final_paper/main.tex.bak_measurement_governance`（*.bak*；被在位 Tier 1 `main.tex` 取代）
48. `paper_rewriting_output/final_paper/aamas_cut.zh.docx.bak_fonts` → `docs/archive/paper_rewriting/final_paper/aamas_cut.zh.docx.bak_fonts`（*.bak*；被仍在位的 `aamas_cut.zh.docx` 取代）

### 目录清理（随移动产生的空目录，已移除）

- `paper_rewriting_output/__pycache__/`（删文件后为空）
- `paper_rewriting_output/reference_materials/`（唯一文件移出后为空）
- `paper_rewriting_output/pdf_qa/`、`paper_rewriting_output/aamas_cut_pdf_qa/`（移出后为空）
- `docs/roadmap/`（两个文件移出后为空）

---

## 2. Deleted（硬删除，共 1 项）

| 文件 | 被谁取代的证据 |
|---|---|
| `paper_rewriting_output/__pycache__/build_outputs.cpython-312.pyc` | Python 字节码缓存，由仍在位的源码 `paper_rewriting_output/build_outputs.py` 在下次运行/导入时自动再生成；缓存非证据、非实验数据，删除无信息损失 |

除上述 1 项外，本轮无任何硬删除。所有其余文件均以移动归档处理。

---

## 3. Whitelist untouched（Tier 0–6 逐 Tier 确认）

移动与删除全部使用显式文件名清单，无通配符触及白名单路径；执行后逐项在场核验（Test-Path）：

- **Tier 0（顶层指令与密钥）**：`AGENTS.md`、`CLAUDE.md`、`package.json`、`tsconfig.json`、`next.config.js`、`.gitignore` 全部在位，未读未动 `.env*`，未执行任何 git 命令（不碰 `.git/`）。✅
- **Tier 1（第一篇论文）**：`final_paper/paper.en.md`、`final_paper/CHANGELOG_PRE_SUBMISSION.md`、`final_paper/main.tex`、`claim_register.md`、`source_inventory.md`、`section_blueprints.md`、`figure_asset_map.md`、`confirmed_contribution.md`、`results_validation.md`、`results_validation_check.md`、`paper_spine_config.json` —— 11 项逐一在场核验通过。✅
- **Tier 2（证据链）**：`FORK_CONFIRMATORY_RESULTS_2026-08-15.md`、`FORK_CONFIRMATORY_CHECKLIST.md`、`HIDDENBENCH_PROTOCOL_COMPARISON.md`、`EXPERIMENT_LOG.md`、`V6_FALSE_CONSENSUS_DETECTOR_2026-08-15.md`、`V6_CROSS_EVIDENCE_EXCHANGE_RESULTS_2026-08-15.md`、`REPLAY_VERIFICATION.md`、`EPISTEMIC_EXPOSURE_GOVERNANCE_THEORY_V1.md`、`COVERAGE_GAP_GOVERNANCE_RESEARCH_CONTRACT_V1.md`、`PLATFORM_CAPABILITY_BRIEF.md` 全部在位。✅
- **Tier 3（规范/导航）**：`REASONING_PROTOCOL.md`、`ACTIVE_RESEARCH_SURFACE.md`、`AUDIT_CLAIM_VERIFICATION.md`、`CLEANUP_WHITELIST.md` 在位；`docs/architecture/**` 12 个 V1 契约逐一在场核验通过。✅
- **Tier 4（代码）**：`src/lib/epistemic|governance|experimentation|utils/**`、`experiments/campaign/v6/**`（含 `run_v6_fork.ts`、`analyze_v6_fork.ts`、`pre_submission_analysis.mjs`、`post_submission_v3_analysis.mjs`）、`experiments/campaign/measurement/**`、`replayVerifier.ts`、`verify_replay.ts`、`test/**` 均未触碰；核验抽查通过。✅
- **Tier 5（冻结实验数据）**：`experiments/campaign/pilot_output/**` 未触碰。✅
- **Tier 6（LEGACY_READ_ONLY）**：`experiments/v2/**`、`experiments/lunar_survival/**`、`src/lib/discussion/asyncEngine.ts`、`run_e12*.ts`、`docs/experiments/E12_PROTOCOL_COMPARISON.md` 全部在位。✅

**结论：Tier 0–6 全部未动（不删、不移、不改、不重命名）。**

---

## 4. UNCERTAIN（未动，需人来判断）

| 文件 | 原因 |
|---|---|
| `docs/paper/AAMAS_SUBMISSION_CHECKLIST.md` | 白名单例外条款：与投稿直接相关（README 与 source_index 均将其列为 AAMAS 审稿清单），按白名单列 UNCERTAIN，未动 |
| `paper_rewriting_output/final_paper/paper.zh.md` | `final_artifact_manifest.md`（已归档）声明其为"权威中文正文 / required"。paper.en.md 是唯一权威稿，但中文版是否仍需要由 owner 决定，故未动 |
| `paper_rewriting_output/final_paper/aamas_cut.zh.md`、`aamas_cut.zh.docx`、`aamas_cut.zh.pdf`、`aamas_cut.main.tex` | `aamas_cut_manifest.md` 自证"当前仍是中文切片初稿…仍需补强；AAMAS 投稿版需要英文改写和官方双栏 8 页排版"——**未被 paper.en.md 取代**，白名单"若已被取代"条件不成立；切片工作仍在进行，未动 |
| `paper_rewriting_output/aamas_cut_manifest.md`、`build_aamas_cut.py` | 同上：属进行中的 AAMAS 切片工作（manifest 为切片说明，脚本为切片构建工具），未动 |
| `paper_rewriting_output/build_outputs.py` | 生成保留中的 `paper.zh.md` 的 docx/pdf 的构建脚本；中文管线是否继续由 owner 决定，未动 |
| `docs/plans/CLAUDE_CODE_SOCIAL_THERMODYNAMIC_RESPONSE_AUDIT_HANDOFF_2026-08-14.md` | 被活的 FACT 报告 `docs/experiments/V6_SOCIAL_THERMODYNAMIC_RESPONSE_AUDIT_2026-08-14.md` 引用为"执行指南"；归档会断其链接，未动 |
| `docs/plans/MEASUREMENT_GOVERNANCE_CLOSED_LOOP_PROTOCOL_V1.md` | V1 协议（非带日期计划）；顶部 08-14 注已声明让位集成指南，但协议性质可能仍规范；无活跃引用，未动 |
| `docs/PITCH.pdf`、`docs/PITCH.html`、`docs/PITCH_preview.png` | 项目展示物（PITCH deck），不在白名单候选范围内；疑似过时（旧产品展示），是否归档由 owner 决定 |
| `out/PAPER_DRAFT.pdf`、`out/PAPER_PROFESSOR_VERSION.pdf`、`out/PROFESSOR_GUIDE.pdf`、`out/TECHNICAL_APPENDIX.pdf`、根目录 `PAPER_PROFESSOR_VERSION.pdf` | 旧论文草稿的 PDF 产物，内容上已被 paper.en.md 取代，但位于根目录 `out/` 与根目录，**不在白名单候选范围**（仅 docs/** 与 paper_rewriting_output/**），按"拿不准→不动"保留 |
| 根目录 `tsconfig.tsbuildinfo` | 可再生构建缓存产物，位于根目录、不在白名单候选范围，未动 |
| 移动引发的引用失效（未修改任何文档） | 按任务规则"不做内容修正"，被移动文件的旧路径引用未更新，涉及：`README.md`、`README_CN.md`、`docs/README.md`、`docs/architecture/CODE_MAP.md`、`docs/architecture/ARCHITECTURE.md`、`docs/AUDIT_CLAIM_VERIFICATION.md`、根目录 `PROJECT_AUDIT_REPORT.md`、`experiments/v2/detector_validation_report.md`（以上引用 docs/paper/*、docs/roadmap/* 旧路径）；`experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts` 注释引用 docs/plans 设计文档。是否更新这些引用由 owner 决定 |
| `docs/archive/` 内部去重 | 对 `docs/archive/**` 全量 SHA-256 扫描：**未发现任何完全相同的重复文件**，故无内部去重动作 |

---

## 5. Violations（白名单误动检查）

**未发现。** 执行前未发现任何白名单文件处于被误动状态；执行中所有操作使用显式路径清单；执行后 Tier 0–6 逐项核验通过（见第 3 节）。本报告第 2 节唯一硬删除项（`.pyc` 缓存）不在白名单任何 Tier 内。

---

## 附注（FACT）

- 本轮净效果：63 个文件移动归档，1 个缓存文件删除，5 个空目录移除；未修改任何代码、任何 `.ts` 文件、`experiments/campaign/pilot_output/` 及任何实验数据。
- 归档目标目录 `docs/archive/` 内新增 `paper_rewriting/` 子树（47 个文件，含 17 个 PNG），其余并入既有 `paper/`、`roadmap/`、`plans/` 子目录，无文件名冲突。
- 本报告由 `docs/plans/DOCUMENTATION_CLEANUP_MANIFEST_2026-08-15.md`（已归档）所取代，成为当前清理任务的唯一记录。
