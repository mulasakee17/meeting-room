# SwarmAlpha V3 运行时逻辑详解

> 一次完整决策任务的逐层拆解：从任务输入到最终输出，涵盖评价与治理全流程

---

## 目录

1. [第一层：任务输入](#第一层任务输入)
2. [第二层：API 路由门禁](#第二层api-路由门禁)
3. [第三层：Agent 框架初始化](#第三层agent-框架初始化)
4. [第四层：决策流程执行](#第四层决策流程执行)
5. [第五层：评价引擎](#第五层评价引擎)
6. [第六层：治理引擎](#第六层治理引擎)
7. [第七层：决策轨迹](#第七层决策轨迹)
8. [第八层：响应与前端](#第八层响应与前端)

---

## 第一层：任务输入

用户通过 API 提交决策任务：

```json
POST /api/v3/task
{
  "version": "v3",
  "title": "医疗诊断决策",
  "description": "基于患者症状进行疾病诊断",
  "input": {
    "type": "structured",
    "content": {
      "patient": "45岁男性",
      "symptoms": ["胸痛", "呼吸困难", "头晕"],
      "medicalHistory": ["高血压", "糖尿病"]
    }
  },
  "agentConfig": {
    "provider": "autogen",
    "agentCount": 5
  },
  "llmConfig": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "evaluationConfig": {
    "enableAll": true
  },
  "governanceConfig": {
    "interventionLevel": "medium"
  }
}
```

| 字段 | 说明 |
|------|------|
| `input.type` | 输入类型：`text` / `structured` / `question` |
| `agentConfig.provider` | Agent 框架：`autogen` / `crewai` / `langgraph` / `custom` |
| `evaluationConfig` | 评价维度配置 |
| `governanceConfig` | 治理干预级别：`none` / `light` / `medium` / `heavy` |

---

## 第二层：API 路由门禁

`src/app/api/v3/task/route.ts` → `POST()` 函数。

**四步门禁**：
1. **速率限制** — 基于 IP+UA 的令牌桶限流
2. **JSON 解析** — 捕获非法 JSON 返回 400
3. **输入验证** — XSS/SQL注入/命令注入防护 + 长度检查
4. **权限验证** — API Key 认证（V3 新增）

通过后进入任务处理流程。

---

## 第三层：Agent 框架初始化

根据 `agentConfig.provider` 选择对应的 Agent 框架适配器：

```typescript
interface AgentFrameworkAdapter {
  createAgents(config: AgentConfig): Agent[];
  runInteraction(agents: Agent[], input: TaskInput): InteractionResult;
  getAgentInfo(agents: Agent[]): AgentInfo[];
}
```

**支持的框架**：

| 框架 | 特点 |
|------|------|
| **AutoGen** | 微软开源，支持对话模式，适合复杂协作 |
| **CrewAI** | 任务导向，支持角色分配和工具使用 |
| **LangGraph** | 图结构工作流，支持状态持久化 |
| **Custom** | 自定义 Agent 实现 |

**Agent 创建流程**：
1. 根据任务类型和配置生成 Agent 角色定义
2. 分配 Agent 权限和可见信息范围
3. 初始化 Agent 的认知状态（信念、置信度、开放度）

---

## 第四层：决策流程执行

### 4.1 输入处理

将原始输入转换为 Agent 可理解的格式：

```typescript
interface ProcessedInput {
  content: string | Record<string, unknown>;
  context: string;
  constraints?: string[];
  expectedOutput?: string;
}
```

### 4.2 Agent 独立判断

每个 Agent 基于其可见信息独立做出判断：

```typescript
interface AgentDecision {
  agentId: string;
  content: string;
  confidence: number;
  reasoning: string;
  belief?: number;
}
```

### 4.3 互动与共识形成

Agent 间进行多轮互动，逐步收敛到共识：

```typescript
interface InteractionRound {
  round: number;
  messages: AgentMessage[];
  beliefs: Record<string, number>;
  beliefChanges: Record<string, number>;
  converged: boolean;
}
```

**共识聚合方法**：

| 方法 | 原理 | 适用场景 |
|------|------|---------|
| 线性加权 | Σ(belief × influence) / Σ(influence) | 基线参照 |
| K-Means 聚类 | 发现隐藏的多数派 | 群体分裂检测 |
| 幂律共识 | 放大极端信念 | 信号明确时 |
| 修剪均值 | 移除极端值后平均 | 消除噪音 |
| 动态集成 | 多方法信号质量加权 | 生产环境 |

### 4.4 最终决策生成

基于共识结果生成最终决策：

```typescript
interface FinalDecision {
  content: string;
  confidence: number;
  reasoning: string;
  steps: DecisionStep[];
}
```

---

## 第五层：评价引擎

评价引擎是 V3 的核心，对决策结果进行 7 维度评价：

### 5.1 Consensus（共识强度）

```typescript
interface ConsensusMetric {
  score: number;
  kuramotoOrder: number;      // 0-1，同步度
  beliefStd: number;          // Agent 信念标准差
  agreementRate: number;      // 一致率
}
```

### 5.2 Reliability（可靠性）

```typescript
interface ReliabilityMetric {
  score: number;
  crossValidationScore: number;  // 跨方法验证分数
  consistencyScore: number;      // 一致性分数
}
```

### 5.3 Explainability（可解释性）

```typescript
interface ExplainabilityMetric {
  score: number;
  reasoningLength: number;       // 推理链长度
  attributionClarity: number;    // 归因清晰度
  stepCoverage: number;          // 步骤覆盖率
}
```

### 5.4 Robustness（鲁棒性）

```typescript
interface RobustnessMetric {
  score: number;
  perturbationTests: {
    inputNoise: number;          // 输入扰动测试
    agentDropout: number;        // Agent 丢失测试
    parameterVariation: number;  // 参数变化测试
  };
}
```

### 5.5 Stability（稳定性）

```typescript
interface StabilityMetric {
  score: number;
  roundConsistency: number;      // 多轮一致性
  timeSeriesStability: number;   // 时间序列稳定性
}
```

### 5.6 ManipulationResistance（抗操纵性）

```typescript
interface ManipulationResistanceMetric {
  score: number;
  adversarialTest: number;       // 对抗性测试
  biasDetection: number;         // 偏见检测
}
```

### 5.7 InfluenceAnalysis（影响力分析）

```typescript
interface InfluenceAnalysisMetric {
  score: number;
  attribution: {
    agentId: string;
    contribution: number;
    influenceWeight: number;
  }[];
  dominantAgent?: string;        // 主导 Agent
}
```

### 5.8 综合评价

```typescript
interface EvaluationResult {
  overallScore: number;
  dimensions: {
    consensus: ConsensusMetric;
    reliability: ReliabilityMetric;
    explainability: ExplainabilityMetric;
    robustness: RobustnessMetric;
    stability: StabilityMetric;
    manipulationResistance: ManipulationResistanceMetric;
    influenceAnalysis: InfluenceAnalysisMetric;
  };
  summary: string;
}
```

---

## 第六层：治理引擎

治理引擎主动检测并干预群体决策偏差：

### 6.1 Echo Chamber（回音室效应）

```typescript
interface EchoChamberDetection {
  detected: boolean;
  severity: "low" | "medium" | "high";
  redundantAgents: string[];
  intervention: {
    type: "introduce_diversity" | "break_connections";
    applied: boolean;
    effect: string;
  };
}
```

**检测指标**：Agent 间信息冗余度 > 阈值

**干预策略**：强制引入差异化信息源或打破连接

### 6.2 Authority Bias（权威偏见）

```typescript
interface AuthorityBiasDetection {
  detected: boolean;
  severity: "low" | "medium" | "high";
  dominantAgent: string;
  influenceRatio: number;
  intervention: {
    type: "reduce_weight" | "introduce_dissent";
    applied: boolean;
    effect: string;
  };
}
```

**检测指标**：单一 Agent 影响力占比 > 阈值

**干预策略**：动态调整权重或引入异议 Agent

### 6.3 Group Polarization（群体极化）

```typescript
interface PolarizationDetection {
  detected: boolean;
  severity: "low" | "medium" | "high";
  groups: {
    label: string;
    agentIds: string[];
    belief: number;
  }[];
  intervention: {
    type: "pair_opposites" | "force_reflection";
    applied: boolean;
    effect: string;
  };
}
```

**检测指标**：信念标准差持续增大

**干预策略**：随机配对对立观点或强制反思

### 6.4 治理结果

```typescript
interface GovernanceResult {
  echoChamber: EchoChamberDetection;
  authorityBias: AuthorityBiasDetection;
  polarization: PolarizationDetection;
  otherIssues: GovernanceIssue[];
  summary: string;
}
```

---

## 第七层：决策轨迹

完整记录从任务输入到最终输出的全生命周期：

```typescript
interface DecisionTrace {
  taskId: string;
  startTime: string;
  endTime: string;
  phases: {
    phase: "input" | "agent_creation" | "interaction" | "evaluation" | "governance" | "output";
    timestamp: string;
    durationMs: number;
    details: Record<string, unknown>;
  }[];
  fullLog: string;
  artifacts: {
    agentMessages: AgentMessage[];
    intermediateDecisions: IntermediateDecision[];
    evaluationMetrics: EvaluationResult;
    governanceActions: GovernanceAction[];
  };
}
```

**轨迹用途**：
- 可复现性：重新运行相同任务验证结果
- 可解释性：追溯决策形成过程
- 审计：合规性检查
- 调试：问题排查

---

## 第八层：响应与前端

### API 响应结构

```json
{
  "success": true,
  "taskId": "abc123",
  "status": "completed",
  "data": {
    "output": {
      "finalDecision": "急性心肌梗死",
      "confidence": 0.85,
      "reasoning": "综合症状和病史...",
      "steps": [...]
    },
    "evaluation": {
      "overallScore": 82,
      "dimensions": {
        "consensus": {"score": 85, ...},
        "reliability": {"score": 88, ...},
        ...
      },
      "summary": "决策质量良好..."
    },
    "governance": {
      "echoChamber": {"detected": false, ...},
      "authorityBias": {"detected": false, ...},
      "polarization": {"detected": false, ...},
      "summary": "未检测到群体决策偏差"
    },
    "agents": [...],
    "interactionHistory": [...],
    "trace": {...}
  }
}
```

### 前端渲染层级

```
page.tsx
├── TaskInputPanel          ← 任务输入配置
├── EvaluationDashboard     ← 7维度评价仪表盘
├── GovernancePanel         ← 治理干预结果
├── AgentPanel              ← Agent 状态展示
├── InteractionTimeline     ← 互动演化时间线
├── DecisionTraceViewer     ← 决策轨迹查看器
└── ResultSummary           ← 最终决策摘要
```

---

## 附录：关键数字

| 指标 | 值 |
|------|-----|
| 评价维度 | 7 |
| 治理干预类型 | 3 |
| 支持的 Agent 框架 | 4 |
| 共识聚合方法 | 5 |
| 速率限制 | 60次/分钟 (任务) / 30次/分钟 (执行) |

---

## 核心设计原则

1. **评价为中心** — 评价引擎是系统核心，独立于 LLM 和 Agent 框架
2. **治理主动干预** — 检测并缓解群体决策偏差，而非被动接受结果
3. **框架无关** — 支持多 Agent 框架接入，通过抽象接口解耦
4. **决策可追溯** — 完整的决策轨迹，确保可复现和可解释
5. **多维度评价** — 从共识、可靠、可解释、鲁棒等多角度评价决策质量