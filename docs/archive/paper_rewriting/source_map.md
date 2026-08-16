# 论文证据源映射

## 1. 证据优先级

本文遵循 `docs/REASONING_PROTOCOL.md`：当前实现与可重放 artifact 高于测试，测试高于 schema/配置，技术文档高于研究叙事，旧 PDF 只作为历史初稿。

## 2. 本地核心证据

| 证据类 | 权威来源 | 允许支持的主张 | 不允许支持的主张 |
|---|---|---|---|
| 研究定位 | `docs/ACTIVE_RESEARCH_SURFACE.md`；`docs/strategy/SWARMALPHA_WHITEPAPER_V1.md` | 当前研究问题、实现/历史/未来边界 | 治理有效、普适性已建立 |
| 量的语义 | `docs/architecture/EPISTEMIC_QUANTITY_SEMANTICS.md`；`src/lib/epistemic/` | reported/derived/telemetry/outcome/governance state 的定义与代码存在性 | 直接访问 latent belief、跨任务校准 |
| 宏观态 | `docs/architecture/COLLECTIVE_EPISTEMIC_STATE_V1.md` | claim-relative 描述性投影、重放与禁止权限 | 物理热力学规律、预测或控制效度 |
| 测量效度 | `docs/architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md`；`experiments/campaign/measurement/` | Q0-Q3、Gate、实现与待验证对象 | 真实 measurement validity 已通过 |
| 治理质量 | `docs/architecture/GOVERNANCE_QUALITY_MEASUREMENT_V1.md` | ITT estimand、六层 scorecard、旧量复用边界 | 用共识/触发率代替 outcome improvement |
| 异构治理理论 | `docs/theory/HETEROGENEOUS_EPISTEMIC_GOVERNANCE_RESEARCH_CONTRACT_V1.md` | CEC/MCV 的 DESIGN INTENT、未来实验 | 在线估计器已经有效或已实现 |
| 当前真实实验 | `docs/experiments/V6_VERDICT_EXPLORATORY_RESULTS_2026-08-12.md`；对应 frozen plan/artifacts | 80/80 replay、coverage、repeat、Brier/ECE、DEFER | governance effect、general calibration、confirmatory claim |
| 历史初稿 | `PAPER_PROFESSOR_VERSION.pdf` | 早期问题意识、旧实验线索、社会热力学历史叙事 | 当前方法定义或未经新 authority 验证的数字 |

## 3. 外部证据主题

1. 多智能体辩论、异构协作与共识聚合；
2. 多智能体系统失败分类与任务验证；
3. verbalized confidence、prompt dependence、calibration 与 selective prediction；
4. proper scoring rules、有限样本可靠性与 performative reports；
5. LLM routing、cascade、verification 与固定预算计算配置；
6. trust/reputation、制度治理与 MAS 组织；
7. opinion dynamics、隐藏档案与错误相关性；
8. AAMAS 会议论文的定义、机制、评估和可复现性要求。

## 4. 本稿结果边界

本稿是一篇测量优先的研究白皮书/论文初稿。它可以完整提出方法、研究合同和待检验假设，并报告已有 80-run 探索结果；在三日 Measurement Validity pilot 完成前，摘要和结论必须使用“初步表征”“候选仪器”“待验证治理”，不得使用“已验证”“改善治理”或“通用运行时”。
