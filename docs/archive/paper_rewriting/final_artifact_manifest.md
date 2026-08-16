# Final Artifact Manifest

| Artifact | Category | Status | Purpose |
|---|---|---|---|
| `final_paper/paper.zh.md` | required | UPDATED CONTENT DRAFT | 2026-08-13 更新后的权威中文正文，便于后续版本控制与修改 |
| `final_paper/paper.zh.docx` | optional-word | STALE — REGENERATE | 基于更新前正文的教授/合作者审阅版 Word；不可与当前 Markdown 混称为同版本 |
| `final_paper/paper.zh.pdf` | required | STALE — REGENERATE + VISUAL QA | 基于更新前正文的 11 页中文白皮书 PDF；不可与当前 Markdown 混称为同版本 |
| `final_paper/main.tex` | required | UPDATED, NOT COMPILED | 2026-08-13 更新后的中文 LaTeX 源；`latex_guard` 通过，本机无 XeLaTeX |
| `citation_support_bank.md` | pro-extra | PASS | 60 条候选引用与逐句授权 |
| `research_dossier.md` | pro-extra | COMPLETE | AAMAS 场景与论文证据档案 |
| `exemplar_learning_dossier.md` | pro-extra | COMPLETE | AAMAS/领域范文结构学习 |
| `sota_gap_map.md` | pro-extra | COMPLETE | 贡献到 SOTA 的缺口映射 |
| `confirmed_motivation.md` | required | CONFIRMED A | 用户选定的 measurement-first 动机 |
| `confirmed_contribution.md` | required | PASS | 单一贡献与 claim ceiling |
| `writing_rationale_matrix.md` | required | INTERNAL PLANNING | 18 个写作单元的论证计划 |
| `results_validation.md` | required | PASS | 结果到贡献映射 |
| `integrity_audit.md` | required | READY | 无过程语言泄漏，证据链通过 |

## 交付边界

这是研究白皮书/中文论文初稿，不是可立即提交的 AAMAS camera-ready 稿。投稿前仍需完成 measurement validity sealed pilot、detector held-out validation、足量治理随机实验、英文翻译、AAMAS 双栏 8 页压缩与最终匿名化检查。
