# SwarmAlpha V3 — API 契约

> 通用 LLM Multi-Agent 集体决策评价与治理研究平台的标准化接口

---

## 1. 核心概念

### 1.1 数据模型

平台以 **Decision Task** 为核心，包含：
- **Input**: 决策输入（文本、数据、问题等）
- **Agents**: 参与决策的 Agent 群体
- **Interaction**: Agent 间的互动过程
- **Evaluation**: 5 维度评价指标 (V3 重构后从 7 维精简)
- **Governance**: 治理干预结果
- **Output**: 最终决策结果

### 1.2 评价维度

| 维度 | 说明 | 范围 |
|------|------|------|
| Consensus | 共识强度 (Kuramoto序参数+信念方差+轨迹) | 0-100 |
| Reliability | 可靠性 (跨轮次Cronbach α+交叉验证+可重复性) | 0-100 |
| Dispersion | 离散度 (跨Agent信念/置信度方差+轮次波动) | 0-100 |
| Stability | 稳定性 (轮次一致性+时序平滑度) | 0-100 |
| InfluenceAnalysis | 影响力分析 (Gini系数+网络中心性+影响力路径) | 0-100 |

---

## 2. API 端点

### 2.1 创建决策任务

```
POST /api/v3/task
Content-Type: application/json
```

#### 请求体

```typescript
interface CreateTaskRequest {
  version: "v3";
  title: string;
  description: string;
  input: {
    type: "text" | "structured" | "question";
    content: string | Record<string, unknown>;
    context?: string;
  };
  agentConfig: {
    provider: "autogen" | "crewai" | "langgraph" | "custom";
    agentCount?: number;
    agentTypes?: string[];
    config?: Record<string, unknown>;
  };
  llmConfig: {
    provider: "openai" | "anthropic" | "gemini" | "deepseek" | "local";
    model: string;
    temperature?: number;
  };
  evaluationConfig?: {
    enableAll?: boolean;
    dimensions?: string[];
    customMetrics?: Record<string, {
      name: string;
      description: string;
      weight: number;
    }>;
  };
  governanceConfig?: {
    enableEchoChamberDetection?: boolean;
    enableAuthorityBiasDetection?: boolean;
    enablePolarizationDetection?: boolean;
    interventionLevel?: "none" | "light" | "medium" | "heavy";
  };
  maxRounds?: number;
  timeoutSeconds?: number;
}
```

#### 响应体

```typescript
interface CreateTaskResponse {
  success: boolean;
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
}
```

---

### 2.2 获取任务状态

```
GET /api/v3/task/:taskId
```

#### 响应体

```typescript
interface GetTaskResponse {
  success: boolean;
  task: {
    taskId: string;
    title: string;
    status: "pending" | "running" | "completed" | "failed";
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    input: TaskInput;
    output?: TaskOutput;
    evaluation?: EvaluationResult;
    governance?: GovernanceResult;
    agents?: AgentInfo[];
    interactionHistory?: InteractionRound[];
  };
}
```

---

### 2.3 执行决策（同步）

```
POST /api/v3/execute
Content-Type: application/json
```

#### 请求体

```typescript
interface ExecuteRequest {
  version: "v3";
  input: {
    type: "text" | "structured" | "question";
    content: string | Record<string, unknown>;
  };
  agentConfig: {
    provider: "autogen" | "crewai" | "langgraph" | "custom";
    agentCount?: number;
  };
  llmConfig: {
    provider: "openai" | "anthropic" | "gemini" | "deepseek" | "local";
    model: string;
  };
  evaluationConfig?: {
    dimensions?: string[];
  };
  governanceConfig?: {
    interventionLevel?: "none" | "light" | "medium" | "heavy";
  };
}
```

#### 响应体

```typescript
interface ExecuteResponse {
  success: boolean;
  data: {
    output: TaskOutput;
    evaluation: EvaluationResult;
    governance: GovernanceResult;
    agents: AgentInfo[];
    interactionHistory: InteractionRound[];
    trace: DecisionTrace;
  };
}
```

---

### 2.4 获取评价结果

```
GET /api/v3/task/:taskId/evaluation
```

#### 响应体

```typescript
interface EvaluationResponse {
  success: boolean;
  evaluation: EvaluationResult;
}
```

---

### 2.5 获取治理结果

```
GET /api/v3/task/:taskId/governance
```

#### 响应体

```typescript
interface GovernanceResponse {
  success: boolean;
  governance: GovernanceResult;
}
```

---

### 2.6 获取决策轨迹

```
GET /api/v3/task/:taskId/trace
```

#### 响应体

```typescript
interface TraceResponse {
  success: boolean;
  trace: DecisionTrace;
}
```

---

### 2.7 运行基准测试

```
POST /api/v3/benchmark
Content-Type: application/json
```

#### 请求体

```typescript
interface BenchmarkRequest {
  version: "v3";
  benchmarkType: "financial" | "medical" | "legal" | "business" | "custom";
  dataset?: string;
  scenarios?: string[];
  agentConfig: AgentConfig;
  llmConfig: LLMConfig;
}
```

#### 响应体

```typescript
interface BenchmarkResponse {
  success: boolean;
  benchmarkId: string;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
}
```

---

## 3. 数据类型定义

### 3.1 TaskInput

```typescript
interface TaskInput {
  type: "text" | "structured" | "question";
  content: string | Record<string, unknown>;
  context?: string;
  metadata?: Record<string, unknown>;
}
```

### 3.2 TaskOutput

```typescript
interface TaskOutput {
  finalDecision: string;
  confidence: number;
  reasoning: string;
  steps: DecisionStep[];
  agentContributions: Record<string, {
    contribution: string;
    confidence: number;
  }>;
}
```

### 3.3 DecisionStep

```typescript
interface DecisionStep {
  step: number;
  content: string;
  agentId: string;
  timestamp: string;
}
```

### 3.4 EvaluationResult

```typescript
interface EvaluationResult {
  overallScore: number;
  dimensions: {
    consensus: {
      score: number;
      details: string;
    };
    reliability: {
      score: number;
      details: string;
    };
    dispersion: {
      score: number;
      details: string;
    };
    stability: {
      score: number;
      details: string;
    };
    influenceAnalysis: {
      score: number;
      details: string;
    };
  };
  customMetrics?: Record<string, number>;
  summary: string;
}
```

### 3.5 GovernanceResult

```typescript
interface GovernanceResult {
  echoChamber: {
    detected: boolean;
    severity: "low" | "medium" | "high";
    agents: string[];
    interventionApplied?: string;
    effect?: string;
  };
  authorityBias: {
    detected: boolean;
    severity: "low" | "medium" | "high";
    dominantAgent?: string;
    interventionApplied?: string;
    effect?: string;
  };
  polarization: {
    detected: boolean;
    severity: "low" | "medium" | "high";
    groups: {
      label: string;
      agentIds: string[];
      belief: number;
    }[];
    interventionApplied?: string;
    effect?: string;
  };
  otherIssues: {
    type: string;
    severity: string;
    description: string;
  }[];
  summary: string;
}
```

### 3.6 AgentInfo

```typescript
interface AgentInfo {
  id: string;
  name: string;
  role: string;
  type: string;
  config: Record<string, unknown>;
}
```

### 3.7 InteractionRound

```typescript
interface InteractionRound {
  round: number;
  messages: {
    agentId: string;
    content: string;
    timestamp: string;
  }[];
  beliefs: Record<string, number>;
  beliefChanges: Record<string, number>;
  converged: boolean;
}
```

### 3.8 DecisionTrace

```typescript
interface DecisionTrace {
  taskId: string;
  startTime: string;
  endTime: string;
  steps: {
    phase: "input" | "agent_creation" | "interaction" | "evaluation" | "governance" | "output";
    timestamp: string;
    details: Record<string, unknown>;
  }[];
  fullLog: string;
}
```

### 3.9 BenchmarkResult

```typescript
interface BenchmarkResult {
  scenario: string;
  groundTruth?: string;
  agentDecision: string;
  evaluation: EvaluationResult;
  metrics: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1?: number;
  };
}
```

### 3.10 BenchmarkSummary

```typescript
interface BenchmarkSummary {
  totalScenarios: number;
  avgEvaluationScore: number;
  avgAccuracy?: number;
  bestDimension: string;
  worstDimension: string;
  insights: string[];
}
```

---

## 4. 错误响应

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
    suggestion?: string;
  };
}
```

---

## 5. 示例

### 5.1 创建决策任务

```json
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
    "model": "gpt-4o",
    "temperature": 0.7
  },
  "evaluationConfig": {
    "enableAll": true
  },
  "governanceConfig": {
    "interventionLevel": "medium"
  }
}
```

### 5.2 执行响应示例

```json
{
  "success": true,
  "data": {
    "output": {
      "finalDecision": "急性心肌梗死",
      "confidence": 0.85,
      "reasoning": "综合症状和病史，最可能的诊断是急性心肌梗死，建议立即进行心电图检查和心肌酶检测。",
      "steps": [
        {"step": 1, "content": "分析症状", "agentId": "specialist-1"},
        {"step": 2, "content": "评估风险因素", "agentId": "specialist-2"},
        {"step": 3, "content": "综合诊断", "agentId": "lead-doctor"}
      ]
    },
    "evaluation": {
      "overallScore": 82,
      "dimensions": {
        "consensus": {"score": 85, "details": "80%的Agent达成一致诊断"},
        "reliability": {"score": 88, "details": "诊断符合临床指南"},
        "dispersion": {"score": 75, "details": "Agent信念和置信度较集中"},
        "stability": {"score": 80, "details": "决策过程稳定"},
        "influenceAnalysis": {"score": 82, "details": "主导Agent影响适度"}
      },
      "summary": "决策质量良好，共识度高，推理清晰"
    },
    "governance": {
      "echoChamber": {"detected": false, "severity": "low"},
      "authorityBias": {"detected": false, "severity": "low"},
      "polarization": {"detected": false, "severity": "low"},
      "summary": "未检测到群体决策偏差"
    }
  }
}
```

---

## 6. 版本兼容性

| 版本 | 状态 | 说明 |
|------|------|------|
| v3 | ✅ 当前 | 通用接口 |
| v9 | ⚠️ 兼容 | 金融基准测试专用 |

---

## 7. 限流策略

| 端点 | 速率限制 |
|------|---------|
| `/api/v3/task` | 60次/分钟 |
| `/api/v3/execute` | 30次/分钟 |
| `/api/v3/benchmark` | 10次/分钟 |