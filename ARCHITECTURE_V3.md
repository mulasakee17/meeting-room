# SwarmAlpha v3.0 架构设计文档

> **状态**: 设计阶段，待评审
> **日期**: 2026-07-25
> **原则**: 设计先行，编码在后。以社会热力学为不变核心，四个维度独立可插拔。

---

## 0. 项目分支脉络总览

在进入架构设计之前，先梳理清楚当前项目的分支维度，确保重构方向正确。

### 0.1 讨论模式维度

| 模式 | 实现位置 | 发言机制 | 终止条件 | 当前状态 |
|------|---------|---------|---------|---------|
| **sync** (同步圆桌) | `DiscussionEngine.run()` | 每轮全体发言，顺序发言 | 固定轮次 / 信念收敛 | 主力，所有实验使用 |
| **async_content_driven** (异步内容驱动) | `AsyncDiscussionEngine.runAsync()` | 意愿分数筛选，≤ maxSpeakers | 固定轮次 / 热力学终止 | 已实现，未被 Runner 调用 |
| **async_adaptive** (异步自适应) | `AsyncDiscussionEngine` + `TerminationDecider` | 同上 | 热力学终止 (R/T/H 判定) | 已实现，未被 Runner 调用 |

**关键发现**: `Runner.ts` 第 272 行只调用 `engine.run()` (sync)，`runAsync()` 从未被实验 pipeline 调用。这意味着异步引擎完整实现但零使用。

### 0.2 拓扑结构维度

| 拓扑 | 实现位置 | 规模 | 分组方式 | 当前状态 |
|------|---------|------|---------|---------|
| **flat** (圆桌) | `FlatTopology` | n ≤ 10 | 全体一组 | 默认，所有实验使用 |
| **grouped** (分组) | `GroupedTopology` | n ≤ 100 | 每轮随机重分组 | 已实现，未被 Runner 配置 |
| **committee** (委员会) | `CommitteeTopology` | n ≤ 500 | 分组→代表→全会 | 骨架实现，Phase 2/3 未完成 |

**关键发现**: `DiscussionEngine.runMainLoop()` 第 213-214 行已支持 topology 参数，但 `Runner.ts` 创建引擎时从未设置 `topology` 字段。

### 0.3 治理策略维度

| 策略 | 实现位置 | 检测器 | 干预类型 | 效果 |
|------|---------|--------|---------|------|
| **none** | `DiscussionEngine.applyGovernance` mode="none" | 无 | 无 | 基线 |
| **detect_only** | 同上 mode="detect-only" | 4 旧 + 3 MAST | 仅记录 | 观测模式 |
| **belief** (v2.0) | 同上 mode="full" | 4 旧检测器 | reduce_weight, force_reflection, introduce_diversity, continue_discussion | 破坏性 Δτ=-0.267 |
| **cognitive** (v2.1) | `NativeCognitiveEngine.applyCognitiveGovernance` | 6 认知检测器 | inject_evidence, rebalance_attention, shuffle_knowledge | 非破坏性 Δτ=+0.533 |
| **random-intervene** | `DiscussionEngine.applyGovernance` mode="random-intervene" | 运行检测但不用于干预 | 随机选择干预类型 | 对照组 |
| **diversity_only** | `DiscussionEngine.applyGovernance` + 禁用旧检测器 | 仅 diversity 相关 | introduce_diversity | 消融实验 |

**关键发现**: `governanceMode` 字段语义混乱——"cognitive" 和 "full" 重叠，靠 `useCognitiveGovernance` flag 区分，在 `Runner.ts` 第 226-230 行有特殊映射逻辑。

### 0.4 任务维度

| 维度 | 当前值 | 问题 |
|------|--------|------|
| **类型** | ranking（全部实验） | 无 binary / consensus 类型 |
| **难度** | 隐含在 scenario 中 | 无显式 difficulty 字段 |
| **场景** | ma, crisis, supplier, invest, er_triage, fraud | 6 个场景，但 crisis 和 ma 有答案泄露问题 |

**任务难度基准** (基于 none 治理模式的 baseline τ):

| 场景 | 难度 | baseline τ | 说明 |
|------|------|-----------|------|
| supplier | easy | ~0.67 | 简单排序，信息充分 |
| crisis | medium | ~0.55 | 中等难度，但选项泄露需修复 |
| invest | medium | ~0.50 | 投资决策 |
| fraud | hard | ~0.40 | 欺诈检测 |
| ma | hard | ~0.35 | 并购分析，但选项泄露需修复 |
| er_triage | hard | ~0.30 | 急诊分诊 |

### 0.5 运行时模式维度

| 模式 | 引擎 | LLM 输出 | 认知状态来源 |
|------|------|---------|------------|
| **belief** | `DiscussionEngine` + `useCognitiveState=false` | belief + confidence | 无（仅标量信念） |
| **cognitive** | `DiscussionEngine` + `useCognitiveState=true` | belief + confidence + itemBeliefs | 系统 post-hoc 反推 |
| **native_cognitive** | `NativeCognitiveEngine` | cognitiveState (utility, evidenceCoverage, evidenceQuality) | LLM 原生自省输出 |

---

## 1. 当前架构诊断（v2.x）

### 1.1 引擎继承链

```
DiscussionEngine (sync, roundtable, ~1570 lines)
├── AsyncDiscussionEngine (async, ~900 lines, override: mainLoop, reset)
└── NativeCognitiveEngine (sync, cognitive, ~830 lines, override: buildPrompt, updateCognitiveStatesFromRound, applyGovernance, observeAgents, reset)
```

### 1.2 致命问题清单

| # | 问题 | 严重度 | 代码证据 |
|---|------|--------|---------|
| 1 | NativeCognitiveEngine 不兼容 AsyncDiscussionEngine | **P0** | 两个独立继承分支，无法组合 native_cognitive + async |
| 2 | 热力学变量 (R,T,H,F) 绑定在 AsyncDiscussionEngine 私有方法中 | **P0** | `asyncEngine.ts:833 computeThermoState()` 是 private，sync 引擎无法访问 |
| 3 | Runner 只调用 `engine.run()` (sync) | **P1** | `Runner.ts:272` 只调用 `engine.run()`，`runAsync()` 从未被 pipeline 调用 |
| 4 | 发言优先级 (rebalance_attention) 在 NativeCognitiveEngine 中通过覆写 observeAgents 实现 | **P1** | `nativeCognitiveEngine.ts:761-784` 与 asyncEngine 的意愿分数机制完全独立 |
| 5 | ExperimentConfig 缺少 discussionMode、topology、taskDifficulty 维度 | **P2** | 这些维度隐含在引擎选择和 scenario 中 |
| 6 | governanceMode 语义混乱 | **P2** | "cognitive" 和 "full" 重叠，`Runner.ts:226-230` 有特殊映射逻辑 |
| 7 | NativeCognitive + Async 组合不可实现 | **P0** | 认知治理只工作在 sync 下，无法验证异步场景的治理效果 |

### 1.3 不变的部分（测量层）

以下组件在任何讨论模式下都正确运行，无需修改：

- **认知状态变量**: Utility, Evidence, Inertia, Confidence, Susceptibility (`src/lib/agent/cognitiveState.ts`)
- **6 个认知检测器**: Echo Chamber, Polarization, Premature Consensus, Authority Bias, Evidence Imbalance, Cognitive Action Mismatch (`src/lib/governance/cognitiveDetectors.ts`)
- **认知干预生成**: `generateCognitiveInterventions()` → `CognitiveStateModification` (`src/lib/governance/cognitiveInterventions.ts`)
- **社会热力学**: R, T, H, F（当前仅在 `AsyncDiscussionEngine.computeThermoState()` 中，需提升到公共层）

---

## 2. 目标架构：单引擎 + 四维可插拔

### 2.1 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                   UnifiedEngine                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  测量层（MeasurementLayer）— INVARIANT                │   │
│  │  - SocialThermodynamics: R, T, H, F                  │   │
│  │  - CognitiveStateTracker: U, E, I, C, S              │   │
│  │  - CognitiveDetectors: 6 detectors                   │   │
│  │  - 零额外 LLM 成本，确定性计算                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ 提供信号给                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  治理层（GovernanceStrategy）— PLUGGABLE              │   │
│  │  - NoneStrategy                                       │   │
│  │  - DetectOnlyStrategy                                 │   │
│  │  - BeliefBasedStrategy (v2.0, destructive)           │   │
│  │  - CognitiveStrategy (v2.1, non-destructive)         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ 应用到                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  讨论层（DiscussionOrchestrator）— PLUGGABLE          │   │
│  │  ┌───────────────┐  ┌───────────────┐                │   │
│  │  │ SyncMode      │  │ AsyncMode     │                │   │
│  │  │ (all speak)   │  │ (willingness) │                │   │
│  │  └───────────────┘  └───────────────┘                │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────┐ │   │
│  │  │ FlatTopology  │  │ GroupedTopo   │  │ Committee │ │   │
│  │  │ (n≤10)        │  │ (n≤100)        │  │ (n≤500)   │ │   │
│  │  └───────────────┘  └───────────────┘  └──────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ 运行在                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  任务层（TaskConfig）— PLUGGABLE                      │   │
│  │  - type: ranking | binary | consensus                │   │
│  │  - difficulty: easy | medium | hard                  │   │
│  │  - scenario: supplier | crisis | ma | invest | ...   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **测量层是唯一的不变层**。无论 sync/async、flat/grouped、none/cognitive，R/T/H/F 和认知状态变量始终计算。
2. **四个维度彼此正交**。讨论模式的选择不影响治理策略的正确性，拓扑结构的选择不影响测量层的计算。
3. **旧实验完全兼容**。现有的 445 组 JSON 数据和 307/310 测试必须通过。
4. **零侵入旧代码**。新建文件，旧引擎标记 deprecated 但保留，迁移期过后再删除。

---

## 3. 接口定义

### 3.1 测量层接口

```typescript
// src/lib/thermodynamics/MeasurementLayer.ts

interface ThermoState {
  R: number;   // Kuramoto 序参量 [0, 1]
  T: number;   // 归一化温度 [0, 1]
  H: number;   // Shannon 熵 [0, 1]
  F: number;   // Helmholtz 自由能 F = (1-R) + T·H
}

interface MeasurementLayer {
  /** 从 agent beliefs 计算热力学状态 */
  computeThermoState(beliefs: number[]): ThermoState;

  /** 获取当前所有 agent 的认知状态 */
  getCognitiveStates(): Map<string, AgentCognitiveState>;

  /** 获取指定轮次的认知状态快照 */
  getCognitiveStateHistory(round: number): Map<string, AgentCognitiveState>;

  /**
   * 更新一轮的认知状态（由引擎每轮调用）。
   * 
   * 支持两种模式：
   * - belief/cognitive: 从 opinions 的 itemBeliefs + evidence 中 post-hoc 反推
   * - native_cognitive: 使用 LLM 原生 cognitiveState 输出
   */
  updateCognitiveStates(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
    options?: {
      mode: "posthoc" | "native";
      influenceWeights?: Map<string, Map<string, number>>;
      pendingModifications?: Map<string, CognitiveStateModification>;
    },
  ): Map<string, CognitiveStateModification>;  // 返回未被消费的修改

  /** 运行认知检测器 */
  runDetectors(
    round: number,
    maxRounds: number,
    config?: GovernanceConfig,
  ): CognitiveDetectionResult;

  /** 重置 */
  reset(): void;
}
```

**代码来源映射**:

| 方法 | 旧代码位置 | 提取逻辑 |
|------|-----------|---------|
| `computeThermoState` | `asyncEngine.ts:833-854` (private) | 直接提取，无修改 |
| `getCognitiveStates` | `DiscussionEngine.getCognitiveStates()` (index.ts:898) | 提取到测量层 |
| `getCognitiveStateHistory` | `NativeCognitiveEngine.getCognitiveStateHistory()` (nativeCognitiveEngine.ts:206) | 提取到测量层 |
| `updateCognitiveStates` (posthoc) | `DiscussionEngine.updateCognitiveStatesFromRound()` (index.ts:823-893) | 提取到测量层 |
| `updateCognitiveStates` (native) | `NativeCognitiveEngine.updateCognitiveStatesFromRound()` (nativeCognitiveEngine.ts:348-534) | 提取到测量层 |
| `runDetectors` | `NativeCognitiveEngine.applyCognitiveGovernance()` (nativeCognitiveEngine.ts:577-626) + `cognitiveDetectors.ts` | 提取到测量层 |

**关键决策**: 将 `computeThermoState` 从 `AsyncDiscussionEngine` 的 private 方法提升为 `MeasurementLayer` 的公共方法。热力学状态在任何讨论模式下都可计算。

### 3.2 讨论模式接口

```typescript
// src/lib/discussion/DiscussionMode.ts

interface DiscussionMode {
  readonly name: string;

  /** 选择本轮发言的 agent（sync 返回全部，async 按意愿筛选） */
  selectSpeakers(
    agents: DiscussionAgent[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    context: SpeakerSelectionContext,
  ): DiscussionAgent[];

  /** 是否需要热力学终止判断（sync 不需要，async_adaptive 需要） */
  needsTerminationCheck(): boolean;

  /** 判断是否应该终止（仅 async_adaptive 实现） */
  shouldTerminate(
    thermoState: ThermoState,
    utteranceCount: number,
  ): TerminationDecision | null;
}

interface SpeakerSelectionContext {
  round: number;
  memory: DiscussionMemoryEntry[];
  dependencyMap?: Map<string, string[]>;
  infoKeywordsMap?: Map<string, string[]>;
  lastSpokeCycle: Map<string, number>;
  prevCycleBeliefs: Map<string, number>;
  prng: () => number;
  /** v2.1: governance 注入的发言优先级 */
  speakingPriority?: Map<string, number>;
  /** 最多发言人数 */
  maxSpeakers: number;
}
```

**具体实现**:

| 实现 | 行为 | 旧代码来源 |
|------|------|-----------|
| `SyncMode` | 返回全部 agent，按 speakingPriority 排序 | `DiscussionEngine.observeAgents()` (index.ts:596-653) |
| `AsyncContentDrivenMode` | 意愿分数驱动，≤ maxSpeakers 人发言 | `AsyncDiscussionEngine.selectSpeakersContentDriven()` (asyncEngine.ts:605-668) |
| `AsyncAdaptiveMode` | 同上 + 热力学终止判断 | 同上 + `TerminationDecider` |

**关键决策**: 将 `speakingPriority`（`rebalance_attention` 干预的输出）整合到 `SpeakerSelectionContext` 中，让 `SyncMode` 通过排序、`AsyncContentDrivenMode` 通过调整意愿分数来消费优先级。

**统一消费逻辑**:

```
SyncMode: priority > 0 → 排在前面（先发言，后面的人能看到）
           priority < 0 → 排在后面（后发言，能看到前面的观点）
           
AsyncContentDrivenMode: 
  priority > 0 → willingness += 0.15（提高概率被选中）
  priority < 0 → willingness -= 0.15（降低概率被选中）
```

### 3.3 治理策略接口

```typescript
// src/lib/governance/GovernanceStrategy.ts

interface GovernanceStrategy {
  readonly name: string;

  /** 运行治理检测和干预 */
  apply(
    round: number,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[],
    measurement: MeasurementLayer,
    context: GovernanceContext,
  ): GovernanceOutcome;
}

interface GovernanceContext {
  maxRounds: number;
  config: GovernanceConfig;
  agentKnowledge?: Map<string, string[]>;
  governancePrompts: Map<string, string[]>;
}

interface GovernanceOutcome {
  hasIntervention: boolean;
  interventions: Intervention[];
  issues: GovernanceIssue[];
  /** 认知状态修改（下一轮生效） */
  cognitiveModifications: Map<string, CognitiveStateModification>;
  /** 发言优先级调整（下一轮 selectSpeakers 消费） */
  speakingPriority: Map<string, number>;
  /** 是否触发知识重排 */
  shuffleKnowledge: boolean;
  /** 干预效果度量（审计用） */
  effectMetrics?: Record<string, number>;
}
```

**具体实现**:

| 实现 | 行为 | 旧代码来源 |
|------|------|-----------|
| `NoneStrategy` | 不检测，不干预 | `DiscussionEngine.applyGovernance` mode="none" |
| `DetectOnlyStrategy` | 运行检测器，记录但不干预 | `DiscussionEngine.applyGovernance` mode="detect-only" |
| `BeliefBasedStrategy` | 旧 belief-based 治理（v2.0） | `DiscussionEngine.applyGovernance` mode="full" (index.ts:937-1128) |
| `CognitiveStrategy` | 认知治理（v2.1, 非破坏性干预） | `NativeCognitiveEngine.applyCognitiveGovernance()` (nativeCognitiveEngine.ts:577-626) |

### 3.4 新 ExperimentConfig

```typescript
// experiments/campaign/types.ts (扩展)

interface ExperimentConfig {
  // ── 实验元数据（保持兼容）──
  id: string;
  hypothesis: string;
  title: string;
  description: string;
  isMain: boolean;

  // ── 旧字段（保持兼容，逐渐废弃）──
  /** @deprecated 使用 task.scenario */
  scenario: ScenarioId;
  /** @deprecated 使用 experiment.runtimeMode */
  runtimeModes: RuntimeMode[];
  /** @deprecated 使用 governance.strategy */
  governanceMode: GovernanceMode;
  /** @deprecated 使用 discussion.agentCount */
  agentCount: number;
  /** @deprecated 使用 discussion.maxRounds */
  maxRounds: number;
  /** @deprecated 使用 experiment.runsPerSeed */
  runsPerSeed: number;
  /** @deprecated 使用 experiment.seeds */
  seeds: number[];
  /** @deprecated 使用 experiment.llmModel */
  llmModel: string;
  /** @deprecated 使用 experiment.temperature */
  temperature: number;

  // ── 任务维度（新增）──
  task?: {
    type: "ranking" | "binary" | "consensus";
    difficulty: "easy" | "medium" | "hard";
    scenario: ScenarioId;
  };

  // ── 讨论维度（新增）──
  discussion?: {
    mode: "sync" | "async_content_driven" | "async_adaptive";
    topology: "flat" | "grouped" | "committee";
    agentCount: number;
    maxRounds: number;
    groupSize?: number;
    /** async 特有配置 */
    asyncConfig?: {
      evalEveryKUtterances?: number;
      maxSpeakersPerEval?: number;
      willingnessThreshold?: number;
      strongWillingnessThreshold?: number;
      terminationMode?: "adaptive" | "fixed_rounds" | "random_terminate";
    };
  };

  // ── 治理维度（新增）──
  governance?: {
    strategy: "none" | "detect_only" | "belief" | "cognitive_v2.1" | "random_intervene";
    config?: Partial<GovernanceConfig>;
  };

  // ── 实验维度（新增）──
  experiment?: {
    runtimeMode: RuntimeMode;
    seeds: number[];
    runsPerSeed: number;
    llmModel: string;
    temperature: number;
  };
}
```

**向后兼容映射** (`Runner.ts` 中的 `mapLegacyConfig()`):

```typescript
function mapLegacyConfig(config: ExperimentConfig): ResolvedExperimentConfig {
  return {
    id: config.id,
    hypothesis: config.hypothesis,
    title: config.title,
    description: config.description,
    isMain: config.isMain,
    task: config.task ?? {
      type: "ranking",
      difficulty: inferDifficulty(config.scenario),
      scenario: config.scenario,
    },
    discussion: config.discussion ?? {
      mode: "sync",
      topology: "flat",
      agentCount: config.agentCount,
      maxRounds: config.maxRounds,
    },
    governance: config.governance ?? {
      strategy: mapLegacyGovernanceMode(config.governanceMode),
      config: getDefaultGovernanceConfig(config.governanceMode),
    },
    experiment: config.experiment ?? {
      runtimeMode: config.runtimeModes[0],
      seeds: config.seeds,
      runsPerSeed: config.runsPerSeed,
      llmModel: config.llmModel,
      temperature: config.temperature,
    },
  };
}

function mapLegacyGovernanceMode(mode: GovernanceMode): string {
  switch (mode) {
    case "none": return "none";
    case "detect-only": return "detect_only";
    case "full": return "belief";
    case "cognitive": return "cognitive_v2.1";
    case "diversity_only": return "belief";  // 通过 config 禁用其他检测器
    default: return "none";
  }
}
```

---

## 4. 迁移策略

### 4.1 新建文件清单

| 文件 | 内容 | 代码来源 |
|------|------|---------|
| `src/lib/thermodynamics/MeasurementLayer.ts` | 测量层实现 | 从 `asyncEngine.ts:833-854`, `DiscussionEngine` 认知状态方法, `NativeCognitiveEngine` 认知状态方法提取 |
| `src/lib/discussion/DiscussionMode.ts` | 讨论模式接口 + SyncMode / AsyncContentDriven / AsyncAdaptive 实现 | 从 `DiscussionEngine.observeAgents()`, `AsyncDiscussionEngine.selectSpeakers*()` 提取 |
| `src/lib/governance/GovernanceStrategy.ts` | 治理策略接口 + 四种策略实现 | 从 `DiscussionEngine.applyGovernance()`, `NativeCognitiveEngine.applyCognitiveGovernance()` 提取 |
| `src/lib/discussion/UnifiedEngine.ts` | 统一引擎，组合以上三层 | 新的主循环，聚合 MeasurementLayer + DiscussionMode + GovernanceStrategy |

### 4.2 修改文件清单

| 文件 | 变更 | 影响范围 |
|------|------|---------|
| `experiments/campaign/types.ts` | 新增 `task`/`discussion`/`governance`/`experiment` 可选字段，旧字段标记 `@deprecated` | 所有实验配置 |
| `experiments/campaign/pipeline/Runner.ts` | 新增 `mapLegacyConfig()` 适配器，使用 `UnifiedEngine` 替代旧引擎 | 所有实验执行 |
| `src/lib/discussion/index.ts` | `DiscussionEngine` 添加 `@deprecated` JSDoc 注释 | 零行为变更 |
| `src/lib/discussion/asyncEngine.ts` | `AsyncDiscussionEngine` 添加 `@deprecated` JSDoc 注释 | 零行为变更 |
| `src/lib/discussion/nativeCognitiveEngine.ts` | `NativeCognitiveEngine` 添加 `@deprecated` JSDoc 注释 | 零行为变更 |

### 4.3 不修改的文件

- 所有测试文件（307/310 测试继续使用旧引擎）
- 所有实验 JSON 数据文件（445 个文件保持不变）
- `RawRunData` 接口（数据格式不变）
- 所有分析脚本（analyze.ts, statsShared.ts 等）
- `src/lib/governance/` 下的检测器和干预实现（作为测量层和治理策略的底层依赖，不修改）

### 4.4 兼容性保证

1. **旧引擎不删除**：`DiscussionEngine`、`AsyncDiscussionEngine`、`NativeCognitiveEngine` 标记 `@deprecated` 但保留，所有旧测试继续通过。
2. **旧实验 JSON 不变**：`RawRunData` 接口不变，只是 `ExperimentConfig` 新增可选字段。
3. **迁移 adapter**：`Runner.ts` 中 `mapLegacyConfig()` 将旧 `ExperimentConfig` 映射为 `ResolvedExperimentConfig`，旧格式无需修改即可运行。
4. **渐进式替换**：新实验用新格式，旧实验继续用旧格式直到全部迁移。

### 4.5 迁移顺序

```
Phase A: 新建 MeasurementLayer
  ├── 从 asyncEngine.ts:833-854 提取 computeThermoState → MeasurementLayer
  ├── 从 DiscussionEngine + NativeCognitiveEngine 提取认知状态方法 → MeasurementLayer
  └── 验证: 旧测试通过，sync 模式下也可计算热力学状态

Phase B: 新建 DiscussionMode 接口 + SyncMode 实现
  ├── 从 DiscussionEngine.observeAgents() 提取发言逻辑 → SyncMode
  ├── 实现 selectSpeakers（按 speakingPriority 排序）
  └── 验证: SyncMode 行为与 DiscussionEngine.runRound 完全一致

Phase C: 新建 GovernanceStrategy 接口 + 四种策略实现
  ├── NoneStrategy: 直接返回空
  ├── DetectOnlyStrategy: 运行检测器，不应用干预
  ├── BeliefBasedStrategy: 从 DiscussionEngine.applyGovernance 提取
  ├── CognitiveStrategy: 从 NativeCognitiveEngine.applyCognitiveGovernance 提取
  └── 验证: 每种策略行为与旧代码完全一致

Phase D: 新建 UnifiedEngine，组合以上三层
  ├── 实现主循环：selectSpeakers → observeRound → updateBeliefs → 
  │   updateCognitiveStates → runDetectors → applyGovernance → record
  ├── 支持配置化选择 DiscussionMode + GovernanceStrategy + Topology
  └── 验证: UnifiedEngine(sync, cognitive) 与 NativeCognitiveEngine 表现一致

Phase E: 扩展 ExperimentConfig + Runner 适配
  ├── types.ts: 新增 task/discussion/governance/experiment 可选字段
  ├── Runner.ts: 新增 mapLegacyConfig() + UnifiedEngine 创建逻辑
  ├── 新 run_all.ts 入口支持新格式
  └── 验证: 旧实验配置可正常映射运行，新实验配置可直接运行

Phase F: 旧引擎标记 deprecated，文档更新
  ├── 旧引擎添加 @deprecated JSDoc
  ├── README.md 更新架构说明
  └── 验证: 307/310 测试通过，E9 smoke test 结果一致
```

---

## 5. 关键设计决策

### 5.1 为什么是单引擎而非多引擎？

| 方案 | 优点 | 缺点 |
|------|------|------|
| 多引擎继承（当前） | 修改隔离 | 维度正交性无法保证，交叉组合爆炸 |
| **单引擎 + 策略模式（推荐）** | 维度独立可插拔，任意组合 | 重构工作量大（但一次性的） |

选择单引擎的理由：四个维度（讨论模式 × 拓扑 × 治理 × 任务）的笛卡尔积 = 3×3×5×6 = 270 种组合。如果用继承，需要 270 个类。

### 5.2 为什么测量层是独立接口而非基类方法？

当前 `computeThermoState` 在 `AsyncDiscussionEngine` 中是 private 方法。如果放在基类，sync 和 async 都能访问，但基类会越来越臃肿。独立接口的好处：

1. **可测试**：`MeasurementLayer` 可以独立单元测试，不需要完整引擎
2. **可替换**：未来更换热力学模型（如用 Tsallis 熵替代 Shannon 熵），只需替换实现
3. **清晰边界**：测量层不知道讨论模式、治理策略、任务类型

### 5.3 rebalance_attention 在 sync 和 async 下的统一处理

当前问题：sync 和 async 的发言选择机制完全不同。

| 模式 | 发言选择 | rebalance_attention 实现 |
|------|---------|------------------------|
| sync | agents 数组顺序 | 重排 agents 数组（`nativeCognitiveEngine.ts:761-784`） |
| async (content_driven) | 意愿分数排序 | 调整意愿分数（+bonus / -penalty） |

统一方案：`GovernanceStrategy` 输出 `speakingPriority: Map<string, number>`，各 `DiscussionMode` 自行消费：

- `SyncMode`: 按 priority 降序排列 agents
- `AsyncContentDrivenMode`: priority 作为意愿分数的 bias（+0.15 / -0.15）

### 5.4 不做的

- **不删除旧代码**：标记 deprecated 但保留，确保旧实验可复现
- **不修改旧实验 JSON**：445 个文件保持不变
- **不改变旧测试**：307/310 测试不做任何修改
- **不做 `shuffle_knowledge` 的完整实现**：接口预留，实现留待后续
- **不做 CommitteeTopology 的 Phase 2/3**：接口预留，实现留待后续
- **不改变 RawRunData 格式**：分析脚本依赖此格式

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 合并后行为不一致 | 中 | 高 | Phase A-D 每一步都跑 E9 smoke test 对比 |
| 旧实验兼容性破坏 | 低 | 高 | 旧引擎保留，旧配置通过 adapter 映射 |
| 性能退化 | 低 | 中 | 测量层和当前实现逻辑完全一致，无额外开销 |
| 测试回归 | 低 | 中 | 不修改旧测试，新测试独立添加 |
| NativeCognitive 的 buildPrompt 迁移 | 中 | 中 | 测量层只负责状态计算，prompt 构建留在 UnifiedEngine |
| 认知状态更新时序问题 | 低 | 高 | 保持当前时序：先 applyModifications → 再 updateStates → 最后存快照 |

---

## 7. 下一步

1. **评审此设计文档**，确认以下关键决策：
   - 新旧 ExperimentConfig 的兼容方案是否合理
   - Phase A-F 的迁移顺序是否可以接受
   - 接口定义是否满足所有实验需求
2. **Phase A 实现**：提取 MeasurementLayer
3. **Phase B-E 逐步实现**，每步验证
4. **Phase F**：标记 deprecated，更新文档