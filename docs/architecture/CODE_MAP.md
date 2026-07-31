# SwarmAlpha 代码地图

> 本文档介绍项目各代码文件的作用，便于快速定位。按目录组织，标注当前状态（核心/历史/归档）。
>
- **核心路径**：当前在用，构成生产与实验主线
- **历史路径**：早期实验数据与脚本，保留用于复现，不再扩展
- **归档文档**：已废弃的文档快照，仅供历史查阅

---

## 一、项目根目录

| 文件 | 作用 |
|------|------|
| [README.md](../../README.md) | 英文 README：研究平台定位、核心发现、快速开始 |
| [README_CN.md](../../README_CN.md) | 中文 README：多智能体认知治理研究平台介绍 |
| [PROJECT_AUDIT_REPORT.md](../../PROJECT_AUDIT_REPORT.md) | 2026-07-28 自主科研审计与 SOT 报告 |
| [package.json](../../package.json) | npm 依赖与脚本（test/build/demo/lint） |
| [tsconfig.json](../../tsconfig.json) | TypeScript 配置 |
| [vitest.config.ts](../../vitest.config.ts) | 测试框架配置 |

---

## 二、src/lib/ — 核心库（生产路径）

### 2.1 顶层共享文件

| 文件 | 行数 | 作用 |
|------|------|------|
| [pipeline.ts](../../src/lib/pipeline.ts) | 438 | 共享执行管线 `runSwarmPipeline`，串联 agent 创建→交互→评估→治理→输出 |
| [types.ts](../../src/lib/types.ts) | 230 | 共享类型（UnifiedAgent/ExperimentResult/StrategyDescriptor 等），re-export discussion/types |
| [constants.ts](../../src/lib/constants.ts) | 220 | 跨模块共享常量（阈值、系数、配置值，按模块分组） |
| [demo-data.ts](../../src/lib/demo-data.ts) | 218 | Demo 模式预计算数据，零 API 调用离线展示 |

### 2.2 agent/ — 智能体认知状态

| 文件 | 行数 | 作用 |
|------|------|------|
| [cognitiveState.ts](../../src/lib/agent/cognitiveState.ts) | 823 | v3.0 五维认知状态空间（Utility/Evidence/Inertia/Confidence/Susceptibility）及状态更新规则 |

### 2.3 analysis/ — 因果效应分析

| 文件 | 行数 | 作用 |
|------|------|------|
| [causalEffect.ts](../../src/lib/analysis/causalEffect.ts) | 856 | 基于最近邻轨迹匹配+置换检验的干预因果效应估计 |

### 2.4 llm/ — LLM 提供商抽象

| 文件 | 行数 | 作用 |
|------|------|------|
| [providers.ts](../../src/lib/llm/providers.ts) | 858 | LLM 抽象层，支持 openai/anthropic/deepseek/zhipu/qwen/local，含错误分类与超时 |

### 2.5 observation/ & inference/ — 观察与推理层

| 文件 | 行数 | 作用 |
|------|------|------|
| [observation/index.ts](../../src/lib/observation/index.ts) | 161 | 观察层：从 LLM 输出提取结构化认知状态（DefaultPromptBuilder/DefaultOpinionParser） |
| [inference/index.ts](../../src/lib/inference/index.ts) | 198 | 推理层：基于规则的影响力计算器与信念推断器 |

### 2.6 security/ — 安全模块

| 文件 | 行数 | 作用 |
|------|------|------|
| [index.ts](../../src/lib/security/index.ts) | 11 | 入口，re-export rateLimit 和 validation |
| [rateLimit.ts](../../src/lib/security/rateLimit.ts) | 167 | API 速率限制（全局/用户/IP 级别） |
| [validation.ts](../../src/lib/security/validation.ts) | 379 | 输入验证、XSS 防护、注入攻击防护 |

### 2.7 utils/ — 通用工具

| 文件 | 行数 | 作用 |
|------|------|------|
| [jsonUtils.ts](../../src/lib/utils/jsonUtils.ts) | 140 | 统一 JSON 容错解析（safeJsonParse/stripCodeFences/extractNumber 等） |
| [logger.ts](../../src/lib/utils/logger.ts) | 272 | 结构化分级日志系统 |
| [retry.ts](../../src/lib/utils/retry.ts) | 208 | 指数退避重试 + 熔断器模式 |
| [statsUtils.ts](../../src/lib/utils/statsUtils.ts) | 166 | 统计计算（mean/std/cohensD/mulberry32/shannonEntropy/socialFreeEnergy 等） |
| [emotion.ts](../../src/lib/utils/emotion.ts) | 28 | 情绪指标计算（均值/方差/收敛检测） |

### 2.8 adapters/ — 框架适配器

| 文件 | 行数 | 作用 |
|------|------|------|
| [types.ts](../../src/lib/adapters/types.ts) | 67 | 框架适配器接口（Agent/FrameworkAdapter） |
| [index.ts](../../src/lib/adapters/index.ts) | 52 | 适配器注册表 |
| [autogen.ts](../../src/lib/adapters/autogen.ts) | 97 | AutoGen 框架适配器 |
| [custom.ts](../../src/lib/adapters/custom.ts) | 282 | 自定义框架适配器（集成 LLM + 讨论 + 治理，含 token 统计） |

### 2.9 benchmarks/ — 基准测试

| 文件 | 行数 | 作用 |
|------|------|------|
| [financial.ts](../../src/lib/benchmarks/financial.ts) | 281 | 金融决策基准场景 |
| [index.ts](../../src/lib/benchmarks/index.ts) | 105 | 基准测试管理器（financial/medical/legal/business） |

### 2.10 discussion/ — 讨论引擎（项目最大模块）

| 文件 | 行数 | 作用 |
|------|------|------|
| [index.ts](../../src/lib/discussion/index.ts) | 1648 | **核心讨论引擎**：观察→信念更新→治理→评估→决策追踪全流程 |
| [types.ts](../../src/lib/discussion/types.ts) | 436 | 讨论模块所有类型定义 |
| [asyncEngine.ts](../../src/lib/discussion/asyncEngine.ts) | 926 | 异步讨论引擎（部分发言+热力学自适应终止+信息依赖链） |
| [nativeCognitiveEngine.ts](../../src/lib/discussion/nativeCognitiveEngine.ts) | 799 | **v3.2 原生认知引擎**：LLM 直接输出 U/E/C，系统计算 I/Λ，覆写 applyGovernance |
| [crossExamination.ts](../../src/lib/discussion/crossExamination.ts) | 373 | 对立阵营交叉质证（五阶段：检测→阵营→论点→质证→裁决） |
| [decisionTrace.ts](../../src/lib/discussion/decisionTrace.ts) | 621 | 决策追踪构建器（信念变化/影响力/共识事件） |
| [eventTracker.ts](../../src/lib/discussion/eventTracker.ts) | 50 | 讨论事件追踪器（订阅通知） |
| [influence.ts](../../src/lib/discussion/influence.ts) | 132 | 基于规则的影响力策略与影响力管理器 |
| [influenceUtils.ts](../../src/lib/discussion/influenceUtils.ts) | 125 | 共享影响力计算工具 |
| [interactionGraph.ts](../../src/lib/discussion/interactionGraph.ts) | 103 | 交互图构建器（agent 节点 + 影响力边） |
| [memory.ts](../../src/lib/discussion/memory.ts) | 72 | 讨论记忆管理（InMemoryStrategy） |
| [sensitivityTrace.ts](../../src/lib/discussion/sensitivityTrace.ts) | 346 | 基于 Dropout 的敏感性分析 |
| [topology.ts](../../src/lib/discussion/topology.ts) | 191 | 讨论拓扑（Flat/Grouped/Committee，支持 n≥20） |

### 2.11 evaluation/ — 评估引擎（LEGACY）

| 文件 | 行数 | 作用 |
|------|------|------|
| [index.ts](../../src/lib/evaluation/index.ts) | 808 | 五维评估引擎（共识/可靠性/分散度/稳定性/影响力），服务旧 UI/API |
| [types.ts](../../src/lib/evaluation/types.ts) | 195 | 评估模块类型 |

> **状态**：LEGACY，保留服务旧 UI/API，不在 Campaign Pipeline 中使用。

### 2.12 governance/ — 治理引擎（项目核心）

| 文件 | 行数 | 作用 |
|------|------|------|
| [index.ts](../../src/lib/governance/index.ts) | 1527 | **核心治理引擎**：偏见检测→自适应干预→决策评估全流程 |
| [types.ts](../../src/lib/governance/types.ts) | 394 | 治理模块类型（GovernanceIssue/Intervention/BiasDetector 等） |
| [cognitiveDetectors.ts](../../src/lib/governance/cognitiveDetectors.ts) | 609 | Phase 4B 认知状态驱动检测器（6 种失败模式） |
| [cognitiveInterventions.ts](../../src/lib/governance/cognitiveInterventions.ts) | 661 | v2.1 非破坏性认知干预（inject_evidence/rebalance_attention/shuffle_knowledge） |
| [adaptiveDosage.ts](../../src/lib/governance/adaptiveDosage.ts) | 202 | 自适应剂量治理（根据偏差/覆盖度/历史效果动态调整强度） |
| [adaptiveThresholds.ts](../../src/lib/governance/adaptiveThresholds.ts) | 528 | 自适应系统参数（运行时校准 16 个参数） |
| [feedbackChannel.ts](../../src/lib/governance/feedbackChannel.ts) | 468 | 评估→治理反馈通道（修复 5 维评估未反馈到治理循环） |
| [interventionPrompt.ts](../../src/lib/governance/interventionPrompt.ts) | 18 | 统一干预 prompt 格式化 |
| [systemDesignDetectors.ts](../../src/lib/governance/systemDesignDetectors.ts) | 348 | FC1（MAST）系统设计检测器（角色违规/步骤重复） |
| [taskVerificationDetectors.ts](../../src/lib/governance/taskVerificationDetectors.ts) | 237 | FC3（MAST）任务验证检测器（过早终止） |
| [interventions/index.ts](../../src/lib/governance/interventions/index.ts) | 4 | 干预策略统一导出 |
| [interventions/continueDiscussion.ts](../../src/lib/governance/interventions/continueDiscussion.ts) | 98 | 继续讨论干预 |
| [interventions/forceReflection.ts](../../src/lib/governance/interventions/forceReflection.ts) | 59 | 强制反思干预 |
| [interventions/introduceDiversity.ts](../../src/lib/governance/interventions/introduceDiversity.ts) | 55 | 引入多样性干预 |
| [interventions/reduceWeight.ts](../../src/lib/governance/interventions/reduceWeight.ts) | 59 | 降低权重干预 |

### 2.13 thermodynamics/ — 热力学与认知测量

| 文件 | 行数 | 作用 |
|------|------|------|
| [index.ts](../../src/lib/thermodynamics/index.ts) | 19 | 模块入口 |
| [MeasurementLayer.ts](../../src/lib/thermodynamics/MeasurementLayer.ts) | 1673 | **v5 双层测量架构**：群体动态筛查（R/T/H/F）+ 认知状态追踪（U/E/I/C/Λ）+ δ 诊断 |
| [ProgressiveEstimator.ts](../../src/lib/thermodynamics/ProgressiveEstimator.ts) | 468 | I/C/Λ 渐进融合估计器（短对话靠 LLM 自报，长对话靠行为追踪） |
| [SemanticTool.ts](../../src/lib/thermodynamics/SemanticTool.ts) | 289 | v6 Tier 3 LLM 语义传感器（evidence_dedup/gap_analysis/intervention_generation） |
| [TerminationDecider.ts](../../src/lib/thermodynamics/TerminationDecider.ts) | 257 | 热力学终止决策器（基于 R/T/H/F 判断异步讨论终止） |
| [computeDelta.ts](../../src/lib/thermodynamics/computeDelta.ts) | 661 | v6 δ 诊断层（6 个 δ 信号，自适应阈值，不需要 ground truth） |

---

## 三、src/runtime/ — 治理运行时（生产路径）

| 文件 | 行数 | 作用 |
|------|------|------|
| [GovernanceRuntime.ts](../../src/runtime/GovernanceRuntime.ts) | 1112 | **治理运行时核心**：框架无关可嵌入运行时 |
| [types.ts](../../src/runtime/types.ts) | 242 | 运行时类型（框架无关接口） |
| [index.ts](../../src/runtime/index.ts) | 72 | 公共 API 入口 |
| [adapters/AutoGenAdapter.ts](../../src/runtime/adapters/AutoGenAdapter.ts) | 140 | AutoGen 框架桥接器 |
| [adapters/CustomAdapter.ts](../../src/runtime/adapters/CustomAdapter.ts) | 161 | CustomAgent 框架桥接器 |
| [adapters/PromptInjector.ts](../../src/runtime/adapters/PromptInjector.ts) | 278 | Prompt 约束生成与干预转译器 |
| [adapters/StateInferenceBridge.ts](../../src/runtime/adapters/StateInferenceBridge.ts) | 320 | 通用框架桥接器（三级状态提取策略） |
| [adapters/index.ts](../../src/runtime/adapters/index.ts) | 85 | 桥接器注册表 |
| [adapters/types.ts](../../src/runtime/adapters/types.ts) | 123 | 桥接器接口定义 |

> **注**：`src/lib/runtime/` 是历史残留（孤儿代码已移除，仅 types.ts 残留），以 `src/runtime/` 为权威。

---

## 四、src/app/ — Next.js 前端与 API

| 文件 | 行数 | 作用 |
|------|------|------|
| [page.tsx](../../src/app/page.tsx) | 564 | 前端主页面（Demo 模式 + Live 模式） |
| [layout.tsx](../../src/app/layout.tsx) | 21 | 根布局 |
| [api/health/route.ts](../../src/app/api/health/route.ts) | 8 | 健康检查端点 |
| [api/v3/task/route.ts](../../src/app/api/v3/task/route.ts) | 246 | 任务创建 API（含速率限制+输入验证） |
| [api/v3/execute/route.ts](../../src/app/api/v3/execute/route.ts) | 137 | 执行 API |
| [api/v3/benchmark/route.ts](../../src/app/api/v3/benchmark/route.ts) | 134 | 基准测试 API |

---

## 五、experiments/campaign/ — 科学实验战役（当前主线）

### 5.1 pipeline/ — 实验流水线核心

| 文件 | 行数 | 作用 |
|------|------|------|
| [Runner.ts](../../experiments/campaign/pipeline/Runner.ts) | 661 | **实验执行引擎**：根据 ExperimentConfig 运行单次实验并保存原始数据 |
| [MetricComputer.ts](../../experiments/campaign/pipeline/MetricComputer.ts) | 1410 | **度量计算引擎**：从 RawRunData 计算 E1-E9 专属指标 + Global Metrics |
| [StatisticalTest.ts](../../experiments/campaign/pipeline/StatisticalTest.ts) | 1072 | **统计检验引擎**：置换检验/Bootstrap CI/Cohen's d/Holm-Bonferroni 校正 |
| [FigureGenerator.ts](../../experiments/campaign/pipeline/FigureGenerator.ts) | 261 | 论文 SVG 图表生成器 |
| [ReportGenerator.ts](../../experiments/campaign/pipeline/ReportGenerator.ts) | 265 | Markdown 报告 + LaTeX 片段生成器 |
| [CampaignSummarizer.ts](../../experiments/campaign/pipeline/CampaignSummarizer.ts) | 93 | 战役汇总器 |

### 5.2 configs/ — 实验配置（H1-H9 假设）

| 文件 | 作用 |
|------|------|
| [e1_stability.ts](../../experiments/campaign/configs/e1_stability.ts) | E1: State Stability (H1) — Utility 比 Belief 稳定 |
| [e1_native.ts](../../experiments/campaign/configs/e1_native.ts) | E1 Native — Native Cognitive vs Belief |
| [e1_native_lite.ts](../../experiments/campaign/configs/e1_native_lite.ts) | E1 精简版验证 |
| [e2_evidence.ts](../../experiments/campaign/configs/e2_evidence.ts) | E2: Evidence Explanatory Power (H2) |
| [e3_inertia.ts](../../experiments/campaign/configs/e3_inertia.ts) | E3: Inertia → Authority Bias (H3) |
| [e4_confidence.ts](../../experiments/campaign/configs/e4_confidence.ts) | E4: Confidence Prediction (H4) |
| [e5_governance.ts](../../experiments/campaign/configs/e5_governance.ts) | E5: Governance Mechanism (H5) |
| [e6_decoupling.ts](../../experiments/campaign/configs/e6_decoupling.ts) | E6: State Decoupling (H6) |
| [e7_detector.ts](../../experiments/campaign/configs/e7_detector.ts) | E7: Detector Accuracy (H7) |
| [e8_susceptibility.ts](../../experiments/campaign/configs/e8_susceptibility.ts) | E8: Susceptibility Mediation (H8) |
| [e9_cognitive_governance.ts](../../experiments/campaign/configs/e9_cognitive_governance.ts) | E9: Cognitive Governance (H9) — v6 Phase 3 主实验（4 组 A/B/C/D × 50 runs） |
| [e9_medium_scale.ts](../../experiments/campaign/configs/e9_medium_scale.ts) | E9 中等规模验证（2 场景 × 3 治理模式） |

### 5.3 根目录 — 运行入口与工具

| 文件 | 作用 |
|------|------|
| [types.ts](../../experiments/campaign/types.ts) | Campaign 共享类型（ExperimentConfig/RawRunData/ExperimentMetrics/TestResult） |
| [run_all.ts](../../experiments/campaign/run_all.ts) | 一键运行入口（支持 --experiment/--analyze-only/--figures-only/--resume） |
| [dry_run.ts](../../experiments/campaign/dry_run.ts) | Dry Run：最小配置验证完整 Pipeline |
| [analyze_dry_run.ts](../../experiments/campaign/analyze_dry_run.ts) | Dry Run 数据分析 |
| [generate_manifest.ts](../../experiments/campaign/generate_manifest.ts) | 审计清单生成器（SHA-256 + codeVersion） |
| [generate_mock_data.ts](../../experiments/campaign/generate_mock_data.ts) | Mock 数据生成器（无需 LLM 调用） |
| [pilot_v6.ts](../../experiments/campaign/pilot_v6.ts) | V6 Pilot：验证 university 任务 + δ 治理全链路 |

### 5.4 analysis/ — 分析脚本

| 文件 | 作用 |
|------|------|
| [e9_cross_comparison.ts](../../experiments/campaign/analysis/e9_cross_comparison.ts) | E9 三组对照（none/belief/cognitive）跨组比较 |
| [e9_medium_scale.ts](../../experiments/campaign/analysis/e9_medium_scale.ts) | E9 中等规模运行器 |
| [e9_minimal.ts](../../experiments/campaign/analysis/e9_minimal.ts) | E9 单次运行端到端链路验证 |
| [e9_smoke_test.ts](../../experiments/campaign/analysis/e9_smoke_test.ts) | E9 烟雾测试（Supplier 场景） |
| [hidden_anchors_ols.ts](../../experiments/campaign/analysis/hidden_anchors_ols.ts) | Hidden Anchors OLS 系统辨识（FJ 模型锚点恢复） |
| [phase1_5_probe.ts](../../experiments/campaign/analysis/phase1_5_probe.ts) | Phase 1.5 探测实验（三个关键假设最小成本验证） |

### 5.5 tasks/ — 任务定义

| 文件 | 作用 |
|------|------|
| [task_university.ts](../../experiments/campaign/tasks/task_university.ts) | 大学排名任务（v6 Phase 3 主实验，8 大学 × 6 维度 hidden-profile） |

---

## 六、experiments/lunar_survival/ — 早期 Hidden Profile 实验（历史路径）

| 文件 | 作用 |
|------|------|
| [config.ts](../../experiments/lunar_survival/config.ts) | 3 任务 × 4 消融 × 10 runs = 120 次实验配置 |
| [run.ts](../../experiments/lunar_survival/run.ts) | 主运行器 |
| [analyze.ts](../../experiments/lunar_survival/analyze.ts) | Bootstrap 分析与统计功效 |
| [continue.ts](../../experiments/lunar_survival/continue.ts) | 续跑脚本（从中断点继续） |
| [finish_ma.ts](../../experiments/lunar_survival/finish_ma.ts) | 补充 MA 任务缺失运行 |
| [rerun_key.ts](../../experiments/lunar_survival/rerun_key.ts) | 重跑关键实验 |
| [validate_cognitive.ts](../../experiments/lunar_survival/validate_cognitive.ts) | 5 维认知状态模型验证（H1-H5） |
| [verify_cross_exam.ts](../../experiments/lunar_survival/verify_cross_exam.ts) | 交叉质证端到端验证 |
| [verify_fix.ts](../../experiments/lunar_survival/verify_fix.ts) | 干预应用最小验证 |

> **状态**：历史路径，84 个 raw JSON 数据保留用于复现，不再扩展。

---

## 七、experiments/v2/ — V2 实验主目录（历史路径）

### 7.1 核心运行入口与共享工具

| 文件 | 作用 |
|------|------|
| [statsShared.ts](../../experiments/v2/statsShared.ts) | 实验脚本共享统计工具（mulberry32/cohensD/PERMUTATION_SEED 等） |
| [run.ts](../../experiments/v2/run.ts) | V2 主运行器（1 task × 7 ablation × 15 runs = 105 experiments） |
| [analyze.ts](../../experiments/v2/analyze.ts) | V2 主分析脚本 |
| [dataPackage.ts](../../experiments/v2/dataPackage.ts) | 完整 JSON 数据包生成器（含逐轮对话日志） |

### 7.2 任务定义（task_*.ts）

| 文件 | 作用 |
|------|------|
| [task_supplier.ts](../../experiments/v2/task_supplier.ts) | 供应商选择任务（5 方案 × 5 维度） |
| [task_crisis.ts](../../experiments/v2/task_crisis.ts) | 危机响应优先级排序任务 |
| [task_fraud.ts](../../experiments/v2/task_fraud.ts) | 金融欺诈调查任务（v2 难度增强版） |
| [task_fraud_malicious.ts](../../experiments/v2/task_fraud_malicious.ts) | 欺诈任务恶意 agent 变体（单点/共谋/诚实） |
| [task_invest.ts](../../experiments/v2/task_invest.ts) | 投资决策任务（Hidden Profile V2） |
| [task_er_triage.ts](../../experiments/v2/task_er_triage.ts) | 急诊分诊任务 |

### 7.3 运行器（run_*.ts）

| 文件 | 作用 |
|------|------|
| [run_async_ab.ts](../../experiments/v2/run_async_ab.ts) | 异步自适应 A/B/C/D 四组对照 |
| [run_malicious.ts](../../experiments/v2/run_malicious.ts) | 恶意 agent 实验 E/F/G 三组 |
| [run_cross_exam.ts](../../experiments/v2/run_cross_exam.ts) | 交叉质证 A/B/C/D 四组对照 |

### 7.4 通用分析脚本（17 个）

包括：[analyze.ts](../../experiments/v2/analyze.ts)、[auditTask.ts](../../experiments/v2/auditTask.ts)、[bayesianAnalysis.ts](../../experiments/v2/bayesianAnalysis.ts)、[causalAnalysis.ts](../../experiments/v2/causalAnalysis.ts)、[ab_fdecomposition_paired.ts](../../experiments/v2/ab_fdecomposition_paired.ts)、[adaptive_validation.ts](../../experiments/v2/adaptive_validation.ts)、[backtest_weight_assumption.ts](../../experiments/v2/backtest_weight_assumption.ts)、[analyzeSupplierFull.ts](../../experiments/v2/analyzeSupplierFull.ts)、[data_mining_analysis.ts](../../experiments/v2/data_mining_analysis.ts)、[detector_validation.ts](../../experiments/v2/detector_validation.ts)、[generate_manifest.ts](../../experiments/v2/generate_manifest.ts)、[generateSupplierSummary.ts](../../experiments/v2/generateSupplierSummary.ts)、[grid_search_thresholds.ts](../../experiments/v2/grid_search_thresholds.ts)、[interventionAnalysis.ts](../../experiments/v2/interventionAnalysis.ts)、[mechanismAnalysis.ts](../../experiments/v2/mechanismAnalysis.ts)、[powerAnalysis.ts](../../experiments/v2/powerAnalysis.ts)、[quality_factor_validation.ts](../../experiments/v2/quality_factor_validation.ts)、[recalc_consensus_corr.ts](../../experiments/v2/recalc_consensus_corr.ts)、[sensitivity.ts](../../experiments/v2/sensitivity.ts)、[test_theory_propositions.ts](../../experiments/v2/test_theory_propositions.ts)、[trajectory_analysis.ts](../../experiments/v2/trajectory_analysis.ts)、[weight_robustness.ts](../../experiments/v2/weight_robustness.ts)。

### 7.5 专项分析脚本（analyze_*.ts，19 个）

涵盖：5D 凸包逃逸、异步实验、交叉质证、跨模型（DeepSeek/Zhipu/Qwen）、δ 分布、E 组深度、增强评估、ε 观测模型、F 临界验证、F 自由能稳健性、Fraud δ-FJ、治理效应、H2-δ 扩展、恶意 agent、恶意锚点机制、多维凸包、社会热力学、热力学相关性等。

### 7.6 验证脚本（verify*.ts / _verify_*.ts，7 个）

包括：[_verify_all_conclusions.ts](../../experiments/v2/_verify_all_conclusions.ts)、[_verify_force_reflection.ts](../../experiments/v2/_verify_force_reflection.ts)、[verify_findings_9_10.ts](../../experiments/v2/verify_findings_9_10.ts)、[verifyFindings.ts](../../experiments/v2/verifyFindings.ts)、[verify_self_contamination.ts](../../experiments/v2/verify_self_contamination.ts)、[verify_audit.ts](../../experiments/v2/verify_audit.ts)、[verifyBlindSpot.ts](../../experiments/v2/verifyBlindSpot.ts)。

> **状态**：历史路径，~150 个 JSON 数据 + 59 个 .ts 脚本保留用于复现，不再扩展。当前权威路径是 `experiments/campaign/`。

---

## 八、experiments/demo.ts — 项目演示

| 文件 | 作用 |
|------|------|
| [demo.ts](../../experiments/demo.ts) | 30 秒演示治理引擎核心能力（`npm run demo`，纯本地无需 LLM API） |

---

## 九、test/ — 测试套件（28 个文件，629 tests passed）

| 文件 | 测试模块 |
|------|---------|
| [adapters.test.ts](../../test/adapters.test.ts) | runtime/adapters（CustomAdapter/AutoGenAdapter/StateInferenceBridge/PromptInjector） |
| [adaptive-dosage.test.ts](../../test/adaptive-dosage.test.ts) | governance/adaptiveDosage |
| [adaptive-thresholds.test.ts](../../test/adaptive-thresholds.test.ts) | governance/adaptiveThresholds + Dropout 敏感性 |
| [async-engine.test.ts](../../test/async-engine.test.ts) | discussion/asyncEngine |
| [benchmarks.test.ts](../../test/benchmarks.test.ts) | benchmarks/financial |
| [causalEffect.test.ts](../../test/causalEffect.test.ts) | analysis/causalEffect |
| [cognitive-detectors.test.ts](../../test/cognitive-detectors.test.ts) | governance/cognitiveDetectors（6 检测器） |
| [cognitive-interventions.test.ts](../../test/cognitive-interventions.test.ts) | governance/cognitiveInterventions（v2.1 非破坏性） |
| [cognitive-state.test.ts](../../test/cognitive-state.test.ts) | agent/cognitiveState（五维状态） |
| [cross-examination.test.ts](../../test/cross-examination.test.ts) | discussion/crossExamination |
| [delta-diagnosis.test.ts](../../test/delta-diagnosis.test.ts) | thermodynamics/computeDelta + ProgressiveEstimator |
| [discussion.test.ts](../../test/discussion.test.ts) | discussion/index + influence + decisionTrace |
| [evaluation.test.ts](../../test/evaluation.test.ts) | evaluation（LEGACY） |
| [frontend.test.tsx](../../test/frontend.test.tsx) | app/page.tsx 前端组件 |
| [governance.test.ts](../../test/governance.test.ts) | governance/index |
| [interventions.test.ts](../../test/interventions.test.ts) | governance/interventions/*（4 种干预） |
| [json-utils.test.ts](../../test/json-utils.test.ts) | utils/jsonUtils |
| [llm-providers.test.ts](../../test/llm-providers.test.ts) | llm/providers |
| [measurement-layer.test.ts](../../test/measurement-layer.test.ts) | thermodynamics/MeasurementLayer |
| [native-cognitive-engine.test.ts](../../test/native-cognitive-engine.test.ts) | discussion/nativeCognitiveEngine（v3.2 核心） |
| [pipeline.test.ts](../../test/pipeline.test.ts) | lib/pipeline（runSwarmPipeline） |
| [runtime.test.ts](../../test/runtime.test.ts) | observation + inference + runtime/types |
| [security.test.ts](../../test/security.test.ts) | security/rateLimit + validation |
| [statistical-test-significance.test.ts](../../test/statistical-test-significance.test.ts) | campaign/pipeline/StatisticalTest（E4/E5/E6/E8 显著性） |
| [stats-corrections.test.ts](../../test/stats-corrections.test.ts) | campaign/pipeline（M1/M2/M3 数学修复：grangerCausality/bimodalityCoefficient/tDistribution） |
| [stats-utils.test.ts](../../test/stats-utils.test.ts) | utils/statsUtils |
| [system-design-task-verification-detectors.test.ts](../../test/system-design-task-verification-detectors.test.ts) | governance/systemDesignDetectors + taskVerificationDetectors（MAST） |
| [termination-decider.test.ts](../../test/termination-decider.test.ts) | thermodynamics/TerminationDecider |

---

## 十、docs/ — 文档（34 个 .md）

### 10.1 核心文档

| 文件 | 主题 |
|------|------|
| [SOT.md](../SOT.md) | 单一真相源：所有文档引用数字的基准 |
| [COLLABORATION_GUIDE.md](../COLLABORATION_GUIDE.md) | 协作者指南（面向本科生/研究生） |
| [INTEGRATION.md](../INTEGRATION.md) | 集成指南（面向嵌入治理运行时的开发者） |
| [GOVERNANCE_DESIGN.md](../GOVERNANCE_DESIGN.md) | 治理引擎架构设计（ADR） |

### 10.2 研究文档

| 文件 | 主题 |
|------|------|
| [research/THEORY.md](../research/THEORY.md) | 理论分析 v0.4（FJ 信念动力学 + 承诺度本体） |
| [research/EXPERIMENT_DESIGN.md](../research/EXPERIMENT_DESIGN.md) | 实验设计文档（H1-H9 假设、统计方法） |

### 10.3 论文文档

| 文件 | 主题 |
|------|------|
| [paper/PAPER_DRAFT.md](../paper/PAPER_DRAFT.md) | 英文论文草稿（Social Thermodynamics） |
| [paper/PAPER_PROFESSOR_VERSION.md](../paper/PAPER_PROFESSOR_VERSION.md) | 中文论文教授版 |
| [paper/LIMITATIONS.md](../paper/LIMITATIONS.md) | 局限性记录（1900+ 行，含 F1-F16 发现、学术诚信审计） |

### 10.4 路线图文档

| 文件 | 主题 |
|------|------|
| [roadmap/ROADMAP_V5.md](../roadmap/ROADMAP_V5.md) | v5 路线规划（belief 本体论分析） |
| [roadmap/ROADMAP_V6.md](../roadmap/ROADMAP_V6.md) | v6 路线（确定性治理 + 语义传感器混合范式） |
| [roadmap/ROADMAP_V6_OPTIMIZED.md](../roadmap/ROADMAP_V6_OPTIMIZED.md) | v6 验收报告与优化方案 |
| [roadmap/PIPELINE_AUDIT.md](../roadmap/PIPELINE_AUDIT.md) | 检测-诊断-干预管线审计 |
| [roadmap/future.md](../roadmap/future.md) | 未来战略路线图 |

### 10.5 架构文档

| 文件 | 主题 |
|------|------|
| [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) | v6 混合范式治理架构（核心） |
| [architecture/AGENT_SIMULATION.md](../architecture/AGENT_SIMULATION.md) | Agent 对话模拟机制 |
| [architecture/AGENT_SOCIETY_VISION.md](../architecture/AGENT_SOCIETY_VISION.md) | Agent Society Vision（治理底座愿景） |
| [architecture/CODE_MAP.md](../architecture/CODE_MAP.md) | 本文档：代码地图 |

### 10.6 归档文档（docs/archive/，17 个）

包括历史架构（ARCHITECTURE_FREEZE_REPORT/ARCHITECTURE_V3/DEVELOPER_GUIDE）、审计报告（academic_integrity_audit/data_mining_report/paper_audit_report/project_optimization_audit）、技术报告（TECHNICAL_REPORT）、实验计划（EXPERIMENTAL_CAMPAIGN_PLAN/EXPERIMENT_READINESS_REPORT）、理论报告（THEORY_FREEZE_REPORT/THEORY_VALIDATION_REPORT）、路线图（ONEPAGER/PROJECT_STATUS/RESEARCH_PLATFORM_ROADMAP/ROADMAP/SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT）。

> **状态**：归档文档，仅供历史查阅，内容可能已过时。

---

## 十一、数据目录

### 11.1 experiments/campaign/output/ — Campaign 实验输出

| 子目录 | 内容 |
|--------|------|
| `dry_run/` | Dry Run 数据（含 P0 bug 残留，未重跑） |
| `e1_native_lite/` | E1 Native Lite（3 paired runs，有完整分析） |
| `e1_stability/` | E1 Stability（不完整，缺 metrics/tests） |
| `e9_medium_scale/` | E9 中等规模（6 runs，无分析产物） |
| `e9_smoke_supplier/` | E9 烟雾测试（6 runs，裸数据） |
| `phase1_5_probe/` | Phase 1.5 探测（3 runs，未审计） |
| `smoke/` | 烟雾测试（2 runs） |
| `audit_manifest.json` | 审计清单（28 文件，2026-07-25 生成） |
| `campaign_summary.json` | 战役汇总（有 bug，仅报 1 实验/6 runs） |

### 11.2 experiments/lunar_survival/data/raw/ — 早期实验数据（84 文件）

- `lunar_*`（40 文件）：4 治理模式 × 10 runs
- `ma_*`（44 文件）：4 治理模式 × 10-14 runs（`ma_full` 缺 run6-10）

### 11.3 experiments/v2/data* — V2 实验数据（~150 文件）

- `data/`（51 文件）：MA 任务 5 消融 × 10 runs
- `data_crisis/`（81 文件）：Crisis 任务 4 条件 × 8-24 runs
- `data_supplier/`、`data_fraud_malicious/`、`data_crisis_qwen/` 等：各任务/模型变体

> **注**：v2/data 下有多个 `*_backup_v1`/`*_old_thresholds`/`*_pre_*_fix` 目录，是历史修复快照，可清理。

---

## 十二、快速定位指南

### 我想看核心架构

→ [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) + [src/runtime/GovernanceRuntime.ts](../../src/runtime/GovernanceRuntime.ts)

### 我想看实验流水线

→ [experiments/campaign/pipeline/](../../experiments/campaign/pipeline/)（6 个文件）

### 我想看理论框架

→ [research/THEORY.md](../research/THEORY.md) + [src/lib/thermodynamics/](../../src/lib/thermodynamics/)

### 我想看 v6 核心创新

→ [src/lib/discussion/nativeCognitiveEngine.ts](../../src/lib/discussion/nativeCognitiveEngine.ts) + [src/lib/thermodynamics/computeDelta.ts](../../src/lib/thermodynamics/computeDelta.ts) + [src/lib/thermodynamics/SemanticTool.ts](../../src/lib/thermodynamics/SemanticTool.ts)

### 我想看已知局限

→ [paper/LIMITATIONS.md](../paper/LIMITATIONS.md)

### 我想跑实验

→ `npx tsx experiments/campaign/run_all.ts --experiment=e1_stability`

### 我想跑测试

→ `npm test`

---

*最后更新：2026-07-31*
