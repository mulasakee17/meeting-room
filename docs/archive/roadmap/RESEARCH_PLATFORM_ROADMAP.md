# SwarmAlpha 研究平台路线图（Research Platform Roadmap）

**角色：** Research Platform Architect
**状态：** 平台设计完成，待实施
**日期：** 2026-07-24

---

## 第一部分：推荐最终目录

```
swarmalpha/
│
├── packages/                          # Monorepo 核心包
│   │
│   ├── @swarmalpha/core/              # 核心引擎（零依赖）
│   │   ├── src/
│   │   │   ├── runtime/               # 唯一状态持有者
│   │   │   │   ├── CognitiveRuntime.ts
│   │   │   │   ├── BeliefRuntime.ts
│   │   │   │   ├── StateStore.ts
│   │   │   │   └── types.ts
│   │   │   ├── engine/                # 编排层（不持有状态）
│   │   │   │   ├── SimulationEngine.ts
│   │   │   │   ├── SyncLoop.ts
│   │   │   │   ├── AsyncLoop.ts
│   │   │   │   └── types.ts
│   │   │   ├── state/                 # 状态定义
│   │   │   │   ├── cognitive/         # 五维认知状态
│   │   │   │   │   ├── Utility.ts
│   │   │   │   │   ├── Evidence.ts
│   │   │   │   │   ├── Inertia.ts
│   │   │   │   │   ├── Confidence.ts
│   │   │   │   │   ├── Susceptibility.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── legacy/            # 向后兼容
│   │   │   │   │   ├── Belief.ts
│   │   │   │   │   └── types.ts
│   │   │   │   └── index.ts
│   │   │   ├── governance/            # 治理（纯函数）
│   │   │   │   ├── detectors/
│   │   │   │   │   ├── EchoChamber.ts
│   │   │   │   │   ├── AuthorityBias.ts
│   │   │   │   │   ├── Polarization.ts
│   │   │   │   │   ├── PrematureConsensus.ts
│   │   │   │   │   ├── InformationWithholding.ts
│   │   │   │   │   ├── IgnoredInput.ts
│   │   │   │   │   └── ReasoningActionMismatch.ts
│   │   │   │   ├── interventions/
│   │   │   │   │   ├── ReduceWeight.ts
│   │   │   │   │   ├── ForceReflection.ts
│   │   │   │   │   ├── IntroduceDiversity.ts
│   │   │   │   │   └── ContinueDiscussion.ts
│   │   │   │   ├── GovernanceEngine.ts
│   │   │   │   └── types.ts
│   │   │   ├── observation/           # LLM 交互
│   │   │   │   ├── PromptBuilder.ts
│   │   │   │   ├── OutputParser.ts
│   │   │   │   └── types.ts
│   │   │   ├── interaction/           # Agent 间交互
│   │   │   │   ├── InteractionGraph.ts
│   │   │   │   ├── InfluenceModel.ts
│   │   │   │   ├── CommunicationProtocol.ts
│   │   │   │   └── types.ts
│   │   │   ├── memory/                # 记忆系统（扩展点）
│   │   │   │   ├── MemoryManager.ts
│   │   │   │   ├── strategies/
│   │   │   │   │   ├── InMemory.ts
│   │   │   │   │   └── SlidingWindow.ts
│   │   │   │   └── types.ts
│   │   │   ├── thermodynamics/        # 热力学终止
│   │   │   │   ├── TerminationDecider.ts
│   │   │   │   └── types.ts
│   │   │   ├── llm/                   # LLM 适配器
│   │   │   │   ├── providers/
│   │   │   │   │   ├── OpenAI.ts
│   │   │   │   │   ├── Qwen.ts
│   │   │   │   │   └── types.ts
│   │   │   │   └── LLMClient.ts
│   │   │   └── index.ts               # 统一导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── @swarmalpha/sdk/               # 实验 SDK（面向研究者）
│   │   ├── src/
│   │   │   ├── experiment/
│   │   │   │   ├── ExperimentBuilder.ts
│   │   │   │   ├── ExperimentConfig.ts
│   │   │   │   ├── ExperimentRunner.ts
│   │   │   │   └── types.ts
│   │   │   ├── scenario/
│   │   │   │   ├── ScenarioBuilder.ts
│   │   │   │   ├── ScenarioLoader.ts
│   │   │   │   └── types.ts
│   │   │   ├── benchmark/
│   │   │   │   ├── BenchmarkRunner.ts
│   │   │   │   ├── BenchmarkConfig.ts
│   │   │   │   ├── comparators/
│   │   │   │   │   ├── RuntimeComparator.ts
│   │   │   │   │   ├── GovernanceComparator.ts
│   │   │   │   │   └── LLMComparator.ts
│   │   │   │   └── types.ts
│   │   │   ├── evaluation/
│   │   │   │   ├── MetricComputer.ts
│   │   │   │   ├── StatisticalTest.ts
│   │   │   │   └── types.ts
│   │   │   ├── visualization/
│   │   │   │   ├── FigureGenerator.ts
│   │   │   │   ├── templates/
│   │   │   │   │   ├── StabilityComparison.ts
│   │   │   │   │   ├── StateTrajectory.ts
│   │   │   │   │   ├── RadarChart.ts
│   │   │   │   │   ├── NetworkGraph.ts
│   │   │   │   │   ├── Heatmap.ts
│   │   │   │   │   └── Sankey.ts
│   │   │   │   └── types.ts
│   │   │   ├── export/
│   │   │   │   ├── PaperExporter.ts
│   │   │   │   ├── LaTeXGenerator.ts
│   │   │   │   ├── MarkdownGenerator.ts
│   │   │   │   └── types.ts
│   │   │   ├── registry/
│   │   │   │   ├── ExperimentRegistry.ts
│   │   │   │   ├── ManifestStore.ts
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── @swarmalpha/ui/                # Web UI（可选，Demo 用）
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── ...
│       ├── package.json
│       └── tsconfig.json
│
├── scenarios/                         # 场景库（独立于代码）
│   ├── financial/
│   │   ├── merger_acquisition/
│   │   │   ├── scenario.ts
│   │   │   ├── agents.ts
│   │   │   ├── ground_truth.ts
│   │   │   └── README.md
│   │   └── fraud_detection/
│   │       ├── scenario.ts
│   │       ├── agents.ts
│   │       ├── ground_truth.ts
│   │       └── README.md
│   ├── crisis/
│   │   ├── emergency_response/
│   │   │   ├── scenario.ts
│   │   │   ├── agents.ts
│   │   │   ├── ground_truth.ts
│   │   │   └── README.md
│   │   └── supplier_negotiation/
│   │       ├── scenario.ts
│   │       ├── agents.ts
│   │       ├── ground_truth.ts
│   │       └── README.md
│   ├── medical/
│   │   ├── er_triage/
│   │   │   ├── scenario.ts
│   │   │   ├── agents.ts
│   │   │   ├── ground_truth.ts
│   │   │   └── README.md
│   │   └── diagnosis_consensus/
│   │       ├── scenario.ts
│   │       ├── agents.ts
│   │       ├── ground_truth.ts
│   │       └── README.md
│   ├── survival/
│   │   └── lunar/
│   │       ├── scenario.ts
│   │       ├── agents.ts
│   │       ├── ground_truth.ts
│   │       └── README.md
│   ├── policy/
│   │   └── debate/
│   │       ├── scenario.ts
│   │       ├── agents.ts
│   │       ├── ground_truth.ts
│   │       └── README.md
│   └── strategic/
│       └── investment/
│           ├── scenario.ts
│           ├── agents.ts
│           ├── ground_truth.ts
│           └── README.md
│
├── benchmarks/                        # 基准测试定义
│   ├── runtime/
│   │   ├── belief_vs_cognitive.ts
│   │   └── sync_vs_async.ts
│   ├── governance/
│   │   ├── none_vs_full.ts
│   │   ├── reflection_vs_baseline.ts
│   │   ├── authority_vs_baseline.ts
│   │   └── diversity_vs_baseline.ts
│   ├── llm/
│   │   └── model_comparison.ts
│   └── prompt/
│       └── ablation.ts
│
├── experiments/                       # 实验定义与数据
│   ├── registry/                      # 实验注册表
│   │   ├── manifest.json
│   │   └── index.ts
│   ├── runs/                          # 实验运行
│   │   ├── 001_belief_baseline/
│   │   │   ├── config.ts
│   │   │   ├── run.ts
│   │   │   └── output/
│   │   │       ├── raw/
│   │   │       ├── metrics/
│   │   │       ├── figures/
│   │   │       └── report.md
│   │   ├── 002_cognitive_stability/
│   │   │   ├── config.ts
│   │   │   ├── run.ts
│   │   │   └── output/...
│   │   └── ...
│   ├── analysis/                      # 分析脚本
│   │   ├── analyze_stability.ts
│   │   ├── analyze_evidence.ts
│   │   ├── analyze_governance.ts
│   │   └── ...
│   └── legacy/                        # 历史实验数据（只读）
│       ├── v1_lunar/
│       └── v2_ablation/
│
├── docs/                              # 文档
│   ├── theory/
│   │   ├── THEORY_FREEZE_REPORT.md
│   │   └── THEORY_VALIDATION_REPORT.md
│   ├── architecture/
│   │   ├── ARCHITECTURE_FREEZE_REPORT.md
│   │   └── RESEARCH_PLATFORM_ROADMAP.md
│   ├── paper/
│   │   ├── PAPER_DRAFT.md
│   │   └── figures/
│   ├── api/
│   │   └── SDK_REFERENCE.md
│   └── guides/
│       ├── DEVELOPER_GUIDE.md
│       └── EXPERIMENTER_GUIDE.md
│
├── tests/                             # 单元测试
│   ├── unit/
│   │   ├── state/
│   │   ├── governance/
│   │   └── runtime/
│   └── integration/
│       └── pipeline.test.ts
│
├── package.json                       # Monorepo 根配置
├── tsconfig.base.json                 # 共享 TS 配置
├── turbo.json                         # Turborepo 配置
└── README.md
```

### 目录设计原则

| 原则 | 说明 |
|------|------|
| **packages/ 三包分离** | core（引擎）、sdk（实验工具）、ui（可选的 Web 界面）——三者独立版本、独立发布 |
| **scenarios/ 独立于代码** | 场景是数据，不是代码。新增场景不需要修改任何 packages |
| **benchmarks/ 声明式定义** | 基准测试是配置 + 比较逻辑，不是一次性脚本 |
| **experiments/ 结构化** | 每个实验有独立的 config、run、output 目录，按 ID 编号 |
| **legacy/ 只读** | 历史实验数据归档，不修改，不删除，仅供复现 |
| **docs/ 按主题分类** | theory / architecture / paper / api / guides —— 各司其职 |

---

## 第二部分：Research Pipeline（研究流水线）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESEARCH PIPELINE                                    │
│                                                                             │
│  [1] Scenario Definition                                                    │
│       │                                                                     │
│       └── scenarios/{domain}/{name}/                                        │
│           ├── scenario.ts   (任务描述、选项、ground truth)                    │
│           └── agents.ts     (Agent 角色、知识、初始立场)                     │
│                                                                             │
│  [2] Experiment Configuration                                                │
│       │                                                                     │
│       └── ExperimentConfig {                                                │
│             scenario, runtime, governance, llm,                             │
│             runs, seed, outputDir                                           │
│           }                                                                 │
│                                                                             │
│  [3] Simulation                                                             │
│       │                                                                     │
│       └── SimulationEngine.run(config)                                      │
│           ├── Runtime.initialize(agents, task)                              │
│           ├── Loop: observe → update → govern → record                     │
│           └── Runtime.exportResult()                                        │
│                                                                             │
│  [4] Raw Output                                                             │
│       │                                                                     │
│       └── output/raw/{run_id}.json                                          │
│           { scenario, config, rounds, stateLog,                             │
│             interventions, metrics }                                        │
│                                                                             │
│  [5] Metric Computation                                                     │
│       │                                                                     │
│       └── MetricComputer.compute(rawData)                                   │
│           ├── ConsensusQuality (Kendall τ)                                  │
│           ├── StateStability (σ²(ΔU), σ²(ΔB))                              │
│           ├── EvidenceExplanatory (ΔR²)                                     │
│           ├── DetectorAccuracy (F1)                                         │
│           ├── GovernanceEffect (有效干预比例)                                 │
│           └── ...                                                           │
│                                                                             │
│  [6] Statistical Test                                                       │
│       │                                                                     │
│       └── StatisticalTest.run(metrics)                                      │
│           ├── Permutation Test (p-value)                                    │
│           ├── Bootstrap CI (95% CI)                                         │
│           ├── Cohen's d (effect size)                                       │
│           ├── Mixed Effects Model                                           │
│           └── Granger Causality                                             │
│                                                                             │
│  [7] Visualization                                                          │
│       │                                                                     │
│       └── FigureGenerator.generate(metrics, tests)                          │
│           ├── fig1_stability.pdf                                            │
│           ├── fig2_evidence.pdf                                             │
│           ├── fig3_radar.pdf                                                │
│           └── ...                                                           │
│                                                                             │
│  [8] Evaluation                                                             │
│       │                                                                     │
│       └── EvaluationReport {                                                │
│             scenario, config, metrics, tests,                               │
│             figures, conclusions, limitations                               │
│           }                                                                 │
│                                                                             │
│  [9] Paper Export                                                           │
│       │                                                                     │
│       └── PaperExporter.export(report)                                      │
│           ├── report.md              (Markdown 报告)                        │
│           ├── report.tex             (LaTeX 论文片段)                        │
│           ├── figures/               (论文图表)                              │
│           └── tables/                (论文表格)                              │
│                                                                             │
│  [10] Experiment Registry                                                   │
│       │                                                                     │
│       └── ExperimentRegistry.register(experiment)                           │
│           └── manifest.json           (全局实验索引)                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 一键运行

```bash
# 完整流水线（单命令）
npx swarmalpha run \
  --scenario=financial/merger_acquisition \
  --runtime=cognitive \
  --governance=full \
  --runs=50 \
  --export=paper

# 输出：
#   experiments/runs/003_ma_cognitive/
#   ├── output/raw/           ← 50 个 JSON
#   ├── output/metrics/       ← 所有度量
#   ├── output/tests/         ← 统计检验
#   ├── output/figures/       ← 9 张论文图
#   ├── output/report.md      ← 完整报告
#   └── output/report.tex     ← LaTeX 导出
```

---

## 第三部分：Experiment SDK

```typescript
// ============================================================================
// @swarmalpha/sdk — 面向研究者的实验 SDK
// ============================================================================

import { 
  CognitiveRuntime, BeliefRuntime,
  GovernanceEngine,
  SimulationEngine,
  type Scenario, type AgentDefinition 
} from "@swarmalpha/core";
import {
  ExperimentBuilder, MetricComputer,
  StatisticalTest, FigureGenerator,
  PaperExporter, ExperimentRegistry,
} from "@swarmalpha/sdk";

// ============================================================================
// 1. 定义场景
// ============================================================================

const scenario: Scenario = {
  id: "financial/merger_acquisition",
  title: "M&A Target Selection",
  description: "5 agents must rank 5 acquisition targets...",
  options: ["Company A", "Company B", "Company C", "Company D", "Company E"],
  groundTruth: ["C", "A", "E", "B", "D"],  // 正确排序
  rounds: 5,
};

const agents: AgentDefinition[] = [
  { id: "a1", name: "Financial Analyst", role: "expert", 
    knowledge: [...], initialBelief: 0.3 },
  { id: "a2", name: "Legal Advisor", role: "critic", 
    knowledge: [...], initialBelief: -0.2 },
  // ...
];

// ============================================================================
// 2. 配置实验
// ============================================================================

const experiment = new ExperimentBuilder()
  .scenario(scenario)
  .agents(agents)
  .runtime(new CognitiveRuntime())        // 或 new BeliefRuntime()
  .governance(new GovernanceEngine({
    mode: "full",
    disabledInterventions: ["introduce_diversity", "continue_discussion"],
  }))
  .llm({ provider: "qwen", model: "qwen3.7-plus" })
  .runs(50)
  .seed(42)
  .outputDir("./experiments/runs/003_ma_cognitive/output")
  .build();

// ============================================================================
// 3. 运行实验
// ============================================================================

const results = await experiment.run();

// ============================================================================
// 4. 计算度量
// ============================================================================

const metrics = new MetricComputer()
  .add("consensusQuality")
  .add("stateStability")
  .add("evidenceExplanatory")
  .add("detectorAccuracy")
  .add("governanceEffect")
  .compute(results);

// ============================================================================
// 5. 统计检验
// ============================================================================

const tests = new StatisticalTest()
  .permutationTest({ nPerms: 10000, seed: 42 })
  .bootstrapCI({ nBoot: 10000 })
  .cohensD()
  .run(metrics);

// ============================================================================
// 6. 生成图表
// ============================================================================

const figures = new FigureGenerator()
  .stabilityComparison()
  .evidenceRegression()
  .radarChart()
  .stateTrajectory()
  .governanceMediation()
  .correlationMatrix()
  .generate(metrics, tests);

// ============================================================================
// 7. 导出论文
// ============================================================================

new PaperExporter()
  .markdown("./output/report.md")
  .latex("./output/report.tex")
  .figures("./output/figures/")
  .export(metrics, tests, figures);

// ============================================================================
// 8. 注册实验
// ============================================================================

ExperimentRegistry.register({
  id: "003_ma_cognitive",
  scenario: scenario.id,
  config: experiment.config,
  timestamp: new Date().toISOString(),
  metrics: metrics.summary(),
  figures: figures.list(),
  hash: experiment.hash(),  // 可复现性校验
});
```

### 关键设计原则

- **新增实验不需要修改 Engine。** 实验通过 `ExperimentBuilder` 声明式配置，Engine 接收配置运行。
- **场景是数据，不是代码。** 场景定义在 `scenarios/` 目录，通过 `ScenarioLoader` 加载。
- **所有配置可序列化。** `ExperimentConfig` 可导出为 JSON，确保可复现。

---

## 第四部分：Benchmark System

```typescript
// ============================================================================
// @swarmalpha/sdk/benchmark — 基准测试系统
// ============================================================================

// 基准测试是 "比较两个配置的 N 次运行" 的声明式定义

interface BenchmarkDefinition {
  id: string;
  name: string;
  description: string;
  /** 被比较的维度 */
  axis: "runtime" | "governance" | "llm" | "prompt" | "scenario";
  /** 对照组配置 */
  baseline: ExperimentConfig;
  /** 实验组配置列表 */
  variants: ExperimentConfig[];
  /** 运行次数 */
  runs: number;
  /** 比较的度量 */
  metrics: string[];
  /** 统计方法 */
  tests: ("permutation" | "bootstrap" | "cohens_d")[];
}

// ============================================================================
// 示例：Runtime Benchmark
// ============================================================================

const runtimeBenchmark: BenchmarkDefinition = {
  id: "runtime_belief_vs_cognitive",
  name: "Belief Runtime vs Cognitive Runtime",
  axis: "runtime",
  baseline: {
    runtime: "belief",
    governance: "none",
    scenario: "financial/merger_acquisition",
  },
  variants: [
    {
      runtime: "cognitive",
      governance: "none",
      scenario: "financial/merger_acquisition",
    },
  ],
  runs: 50,
  metrics: [
    "stateStability",
    "interpretability",
    "detectorAccuracy",
    "governanceEffect",
    "consensusQuality",
    "opinionDiversity",
    "explainability",
    "robustness",
    "reproducibility",
  ],
  tests: ["permutation", "bootstrap", "cohens_d"],
};

// ============================================================================
// 示例：Governance Benchmark
// ============================================================================

const governanceBenchmark: BenchmarkDefinition = {
  id: "governance_ablation",
  name: "Governance Ablation Study",
  axis: "governance",
  baseline: {
    runtime: "cognitive",
    governance: "none",
    scenario: "financial/merger_acquisition",
  },
  variants: [
    { governance: "full" },
    { governance: "reflection_only" },
    { governance: "authority_only" },
    { governance: "diversity_only" },
  ],
  runs: 50,
  metrics: ["consensusQuality", "governanceEffect"],
  tests: ["permutation", "bootstrap"],
};

// ============================================================================
// Benchmark Runner
// ============================================================================

const runner = new BenchmarkRunner();

// 运行单个基准测试
const report = await runner.run(runtimeBenchmark);

// 运行所有基准测试
const allReports = await runner.runAll();

// 生成对比报告
runner.compare(allReports).exportMarkdown("./benchmarks/report.md");
```

---

## 第五部分：Evaluation SDK

```typescript
// ============================================================================
// @swarmalpha/sdk/evaluation — 评估 SDK
// ============================================================================

// 每次实验自动输出：
//   metrics.json       — 结构化度量
//   metrics.csv        — 表格格式（Excel 可读）
//   figures/           — 论文图表
//   summary.json       — 摘要
//   report.md          — Markdown 报告
//   report.tex         — LaTeX 片段（论文直接引用）

interface EvaluationOutput {
  /** 结构化度量 */
  metrics: {
    consensusQuality: {
      mean: number;
      ci95: [number, number];
      pValue: number;
      effectSize: number;
    };
    stateStability: { /* ... */ };
    // ... 每个度量一个条目
  };
  
  /** 统计检验结果 */
  tests: {
    permutation: { pValue: number; nPerms: number };
    bootstrap: { ci95: [number, number]; nBoot: number };
    cohensD: { d: number; interpretation: string };
  };
  
  /** 图表引用 */
  figures: {
    stabilityComparison: { path: string; caption: string };
    evidenceRegression: { path: string; caption: string };
    // ...
  };
  
  /** 摘要 */
  summary: {
    keyFindings: string[];
    limitations: string[];
    recommendations: string[];
  };
}

// 自动生成论文引用
// 例如：\includegraphics[width=\textwidth]{figures/fig1_stability.pdf}
// 例如：\begin{table}...\end{table}
```

---

## 第六部分：Visualization Framework

```typescript
// ============================================================================
// @swarmalpha/sdk/visualization — 可视化框架
// ============================================================================

// 支持的可视化类型（全部自动生成）

type FigureType =
  // 状态演化
  | "utility_evolution"        // 每个 agent 的 Utility 逐轮变化
  | "evidence_evolution"       // Evidence coverage 逐轮增长
  | "inertia_evolution"        // Inertia 逐轮衰减
  | "confidence_evolution"     // Confidence 逐轮变化
  | "susceptibility_evolution" // Susceptibility 逐轮变化
  | "state_trajectory"         // 单 agent 所有状态变量的多面板图
  
  // 群体动力学
  | "consensus_curve"          // τ 逐轮收敛曲线
  | "polarization_curve"       // 双峰系数逐轮变化
  | "opinion_distribution"     // 每轮 Utility 分布的小提琴图
  
  // 治理
  | "governance_timeline"      // 干预事件时间线
  | "governance_effect"        // 干预前后 ΔU 的瀑布图
  | "governance_mediation"     // SEM 风格的中介路径图
  
  // 网络
  | "network_graph"            // 交互图（节点大小 = Inertia，边宽度 = 权重）
  | "network_evolution"        // 多帧网络图（动画）
  
  // 比较
  | "radar_chart"              // 9 维 Benchmark 雷达图
  | "heatmap"                  // 相关矩阵热力图
  | "sankey"                   // 信息流 Sankey 图
  | "boxplot_comparison"       // 两组对比的箱线图
  | "roc_curve"                // 检测器 ROC 曲线
  
  // 论文
  | "correlation_matrix"       // 论文级相关矩阵热力图
  | "stability_comparison"     // H1 稳定性对比图
  | "evidence_regression"      // H2 回归散点图
  ;

// 使用
const figures = new FigureGenerator()
  .add("state_trajectory", { agentId: "a1" })
  .add("radar_chart", { dimensions: ["stability", "interpretability", ...] })
  .add("governance_mediation", { intervention: "introduce_diversity" })
  .generate(metrics, tests);

// 输出：
//   figures/fig1_state_trajectory.pdf
//   figures/fig2_radar_chart.pdf
//   figures/fig3_governance_mediation.pdf
```

### 每个图表的论文标题和说明（自动生成）

```typescript
// 每张图自动附带 caption
const figure = figures.get("stability_comparison");
console.log(figure.caption);
// "Figure 1: State Stability Comparison between Belief and Cognitive Runtime.
//  (a) Distribution of per-round belief changes in Belief Runtime (σ² = 0.12).
//  (b) Distribution of per-round utility changes in Cognitive Runtime (σ² = 0.04).
//  (c) Stability ratio σ²(ΔB)/σ²(ΔU) = 3.0 (permutation test, p = 0.001).
//  Error bars represent 95% bootstrap confidence intervals."
```

---

## 第七部分：Scenario Library（场景库）

```
scenarios/
├── financial/                  # 金融决策
│   ├── merger_acquisition/     # 并购目标选择（已有）
│   ├── fraud_detection/        # 欺诈检测（已有）
│   └── portfolio_allocation/   # 投资组合分配（新增）
│
├── crisis/                     # 危机管理
│   ├── emergency_response/     # 应急响应（已有）
│   └── supplier_negotiation/   # 供应商谈判（已有）
│
├── medical/                    # 医疗诊断
│   ├── er_triage/              # 急诊分诊（已有）
│   └── diagnosis_consensus/    # 诊断共识（新增）
│
├── survival/                   # 生存决策
│   └── lunar/                  # 月球生存（已有）
│
├── policy/                     # 政策辩论
│   └── debate/                 # 政策辩论（新增）
│
└── strategic/                  # 战略规划
    └── investment/             # 投资决策（已有）
```

### 场景接口

```typescript
interface Scenario {
  id: string;                    // 唯一标识
  domain: string;                // 领域
  title: string;                 // 标题
  description: string;           // 任务描述
  options: string[];             // 可选方案
  groundTruth: string[];         // 正确排序（用于计算 τ）
  maxRounds: number;             // 最大轮次
  tags: string[];                // 标签（难度、领域等）
}

interface AgentDefinition {
  id: string;
  name: string;
  role: string;                  // expert | critic | analyst | diplomat | novice
  knowledge: string[];           // 独有信息条目
  initialBelief?: number;        // 初始立场（可选）
  personality?: {                // 扩展：人格参数
    openness: number;
    conscientiousness: number;
    // ...
  };
}
```

---

## 第八部分：Benchmark Library（基准测试库）

```
benchmarks/
├── runtime/
│   ├── belief_vs_cognitive.ts    # H1-H6: 全维度对比
│   └── sync_vs_async.ts          # 同步 vs 异步
│
├── governance/
│   ├── none_vs_full.ts           # 无治理 vs 全治理
│   ├── reflection_vs_baseline.ts # force_reflection 有效性
│   ├── authority_vs_baseline.ts  # reduce_weight 有效性
│   ├── diversity_vs_baseline.ts  # introduce_diversity 有效性
│   └── adaptive_vs_fixed.ts      # 自适应阈值 vs 固定阈值
│
├── llm/
│   ├── model_comparison.ts       # GPT-4 vs Qwen vs Claude
│   └── temperature_ablation.ts   # 温度参数消融
│
├── prompt/
│   ├── structured_vs_free.ts     # 结构化输出 vs 自由文本
│   └── cognitive_vs_belief.ts    # Cognitive prompt vs Belief prompt
│
└── scenario/
    └── cross_task.ts             # 跨任务鲁棒性
```

### 基准测试运行器

```bash
# 运行所有基准测试
npx swarmalpha benchmark --all

# 运行特定基准测试
npx swarmalpha benchmark --id=runtime_belief_vs_cognitive

# 输出：
#   benchmarks/output/
#   ├── runtime_belief_vs_cognitive/
#   │   ├── report.md
#   │   ├── figures/
#   │   └── data/
#   └── summary.json
```

---

## 第九部分：Experiment Registry（实验注册表）

```typescript
// ============================================================================
// 实验注册表 — 确保每个实验完全可复现
// ============================================================================

interface ExperimentRecord {
  id: string;                     // 唯一 ID
  scenario: string;               // 场景 ID
  runtime: string;                // "belief" | "cognitive"
  governance: string;             // "none" | "full" | "reflection_only" | ...
  llm: {
    provider: string;
    model: string;
    temperature: number;
  };
  prompt: {
    version: string;
    template: string;
  };
  seed: number;
  runs: number;
  timestamp: string;
  commitHash: string;             // Git commit（代码版本）
  metrics: Record<string, number>; // 摘要度量
  figures: string[];              // 图表路径
  dataHash: string;               // 数据完整性校验
  status: "completed" | "failed" | "running";
}

// 全局注册表
ExperimentRegistry.register(record);

// 查询
const allCognitive = ExperimentRegistry.query({ runtime: "cognitive" });
const byScenario = ExperimentRegistry.query({ scenario: "financial/merger_acquisition" });

// 复现
const config = ExperimentRegistry.getConfig("003_ma_cognitive");
const reproduced = await ExperimentBuilder.fromConfig(config).run();
```

---

## 第十部分：Paper Export（论文导出）

```typescript
// ============================================================================
// 论文导出 — 自动生成论文可直接引用的内容
// ============================================================================

const exporter = new PaperExporter();

// 导出 Markdown 报告
exporter.markdown({
  outputPath: "./output/report.md",
  sections: [
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
    "references",
  ],
});

// 导出 LaTeX
exporter.latex({
  outputPath: "./output/report.tex",
  template: "acl",  // ACL / NeurIPS / ICML 模板
  sections: ["results", "figures", "tables"],
});

// 自动生成的内容：
// 
// 1. Figure（论文图表）
//    \begin{figure}[ht]
//      \includegraphics[width=\columnwidth]{figures/fig1_stability.pdf}
//      \caption{State Stability Comparison. ...}
//      \label{fig:stability}
//    \end{figure}
//
// 2. Table（论文表格）
//    \begin{table}[ht]
//      \centering
//      \begin{tabular}{lccc}
//        \toprule
//        Dimension & Belief Runtime & Cognitive Runtime & p-value \\
//        \midrule
//        State Stability & 0.12 ± 0.03 & 0.04 ± 0.01 & 0.001 \\
//        ...
//        \bottomrule
//      \end{tabular}
//      \caption{Benchmark Comparison.}
//      \label{tab:benchmark}
//    \end{table}
//
// 3. Statistics（统计结果）
//    "The Cognitive Runtime showed significantly higher state stability
//     (σ²(ΔU) = 0.04, σ²(ΔB) = 0.12, permutation test, p = 0.001,
//     Cohen's d = 0.85, 95% CI [0.05, 0.11])."
```

---

## 第十一部分：SDK 设计（外部实验室使用）

```typescript
// ============================================================================
// SwarmAlpha SDK — 面向外部研究者的最小 API
// ============================================================================

// 最简示例：5 行代码运行一个实验
import { SwarmAlpha } from "@swarmalpha/sdk";

const swarm = new SwarmAlpha();

// 1. 加载场景
swarm.loadScenario("financial/merger_acquisition");

// 2. 配置运行
swarm.configure({
  runtime: "cognitive",
  governance: "full",
  llm: "qwen",
  runs: 50,
});

// 3. 运行
const result = await swarm.run();

// 4. 查看结果
console.log(result.summary());
// {
//   consensusQuality: { mean: 0.72, ci95: [0.65, 0.79] },
//   stateStability: { cognitive: 0.04, belief: 0.12, p: 0.001 },
//   ...
// }

// 5. 导出
swarm.export("paper", "./output/");
```

### API 稳定性承诺

| 版本 | 承诺 |
|------|------|
| `@swarmalpha/core@1.x` | Runtime API 稳定，不破坏向后兼容 |
| `@swarmalpha/sdk@1.x` | ExperimentBuilder API 稳定 |
| `scenarios/` | 场景格式稳定，新增场景不影响旧场景 |

---

## 第十二部分：架构评审（Architecture Review）

### 当前最薄弱的三项

| 排名 | 薄弱项 | 严重程度 | 说明 |
|------|--------|---------|------|
| **1** | **无 SDK 层** | 严重 | 当前所有实验脚本直接 `new DiscussionEngine()`。新增实验需要复制粘贴大量样板代码。无法被外部研究者使用。 |
| **2** | **实验数据散落** | 严重 | 数据分布在 `experiments/v2/data/`、`data_crisis/`、`data_fraud/`、`data_fraud_malicious/` 等 10+ 个目录中。没有统一的注册表，无法追溯实验配置。 |
| **3** | **可视化完全缺失** | 严重 | 零自动化图表生成。所有分析输出纯文本。无法直接用于论文。 |

### 次要问题

| 排名 | 薄弱项 | 说明 |
|------|--------|------|
| 4 | 无基准测试系统 | 每次对比需要手动编写脚本 |
| 5 | 无论文导出 | 分析结果无法自动转为 LaTeX/Markdown |
| 6 | 场景与代码耦合 | 场景定义散落在实验脚本中 |
| 7 | 无 Monorepo 结构 | 所有代码在一个 Next.js 项目中，无包分离 |

### Priority

| Priority | 模块 | 原因 |
|----------|------|------|
| **P0** | Monorepo 结构（packages/ 分离） | 所有后续工作依赖此基础 |
| **P0** | Experiment SDK（ExperimentBuilder） | 所有实验脚本的重写基础 |
| **P0** | 统一实验数据格式 | 确保新旧数据兼容 |
| **P1** | Scenario Library（场景库） | 将场景与代码分离 |
| **P1** | Metric Computer（度量计算） | 自动化度量提取 |
| **P1** | Statistical Test（统计检验） | 自动化统计推断 |
| **P2** | Visualization Framework（可视化） | 自动化图表生成 |
| **P2** | Benchmark System（基准测试） | 系统化对比 |
| **P2** | Paper Export（论文导出） | LaTeX/Markdown 自动生成 |
| **P3** | Experiment Registry（注册表） | 实验追溯与复现 |
| **P3** | 外部 SDK 封装 | 面向其他实验室的 API |

---

## 最终输出：一年路线图

### Phase 3.0：Platform Foundation（平台基础）— 第 1-2 月

- [ ] 建立 Monorepo 结构（`packages/core`, `packages/sdk`, `packages/ui`）
- [ ] 将核心引擎代码迁移到 `@swarmalpha/core`
- [ ] 定义统一的实验数据格式（`ExperimentResult` schema）
- [ ] 实现 `ExperimentBuilder` 和 `ExperimentRunner`
- [ ] 建立 `scenarios/` 目录，迁移现有场景

### Phase 3.1：Experiment SDK（实验 SDK）— 第 3-4 月

- [ ] 实现 `MetricComputer`（至少 8 种度量）
- [ ] 实现 `StatisticalTest`（置换检验、Bootstrap、Cohen's d）
- [ ] 实现 `ScenarioLoader`（自动发现场景）
- [ ] 重写现有实验脚本为新 SDK 格式
- [ ] 验证所有 445 个实验数据可被新格式加载

### Phase 3.2：Visualization & Paper（可视化与论文）— 第 5-6 月

- [ ] 实现 `FigureGenerator`（至少 9 种图表）
- [ ] 实现 `PaperExporter`（Markdown + LaTeX）
- [ ] 实现 `BenchmarkRunner`（至少 4 个基准测试）
- [ ] 生成第一批论文级图表
- [ ] 完成 `PAPER_DRAFT.md` 的图表引用

### Phase 3.3：Registry & External SDK（注册表与外部 SDK）— 第 7-8 月

- [ ] 实现 `ExperimentRegistry`
- [ ] 实现 `ManifestStore`（全局实验索引）
- [ ] 封装外部 SDK（`new SwarmAlpha().run()` 5 行 API）
- [ ] 编写 `SDK_REFERENCE.md`
- [ ] 编写 `EXPERIMENTER_GUIDE.md`

### Phase 3.4：Platform Hardening（平台稳定）— 第 9-12 月

- [ ] 跨任务验证（3+ 场景）
- [ ] 跨模型验证（GPT-4, Qwen, Claude）
- [ ] 性能优化（并行实验运行）
- [ ] 持续集成（CI 自动运行基准测试）
- [ ] 开源准备（LICENSE, CONTRIBUTING, CODE_OF_CONDUCT）

---

### 核心结论

**SwarmAlpha 当前是一个 Demo，不是一个 Research Platform。** 要成为真正的平台，必须完成以下转变：

| 从 | 到 |
|----|----|
| 实验脚本直接 `new Engine()` | 通过 `ExperimentBuilder` 声明式配置 |
| 场景定义在代码中 | 场景是独立的数据文件 |
| 分析输出纯文本 | 自动化生成论文级图表和 LaTeX |
| 数据散落在 10+ 个目录 | 统一注册表，完整追溯 |
| 只能自己使用 | 外部研究者 5 行代码即可运行 |
| 一个 Next.js 项目 | Monorepo 三包分离 |

**Phase 3 的核心目标不是增加功能，而是建立平台基础设施。** 一旦平台建立，未来的所有研究（Memory、Trust、Emotion、新的 Governance、新的 Detector）都可以在平台上快速实验，无需重构。

---

*本报告由 Research Platform Architect 撰写。所有设计遵循 Research First、Platform First、Theory Driven、Experiment Reproducible 原则。*