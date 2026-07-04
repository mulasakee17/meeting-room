# SwarmAlpha V3 — API Contract

> Standardized interfaces for the embeddable governance runtime — both REST API (research platform) and TypeScript SDK (embeddable mode).

---

## Part A: TypeScript SDK API (Embeddable Governance Runtime)

### A.1 `GovernanceRuntime`

The main entry point for embedding governance into any multi-agent system.

```typescript
import { GovernanceRuntime } from "@/runtime";

const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",           // "none" | "detect-only" | "random-intervene" | "full"
  governanceConfig: {
    enableEchoChamberDetection: true,
    enableAuthorityBiasDetection: true,
    enablePolarizationDetection: true,
    enablePrematureConsensusDetection: true,
    interventionLevel: "medium",    // "none" | "light" | "medium" | "heavy"
  },
});
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `processRound` | `(messages: DiscussionMessage[]) => GovernanceRoundResult` | Process one round of discussion |
| `onMessage` | `(message: DiscussionMessage) => void` | Process an incremental message (streaming) |
| `evaluate` | `(decisions, agents, history, finalDecision) => EvaluationResult` | Evaluate decision quality |
| `evaluateFromState` | `(finalDecision: string) => EvaluationResult` | Evaluate from accumulated runtime state |
| `getSessionResult` | `(finalDecision: string) => GovernanceSessionResult` | Get complete session result |
| `getState` | `() => GovernanceRuntimeState` | Get current runtime state |
| `isActive` | `() => boolean` | Check if discussion still active |
| `finish` | `() => void` | Mark discussion as complete |
| `reset` | `() => void` | Reset for a new session |
| `configure` | `(config: Partial<RuntimeConfig>) => void` | Update config at runtime |

#### Event Hooks

| Hook | Handler Signature | Fires When |
|------|------------------|------------|
| `onBiasDetected` | `(event: { roundNumber, biasType, severity, agents }) => void` | A bias is detected |
| `onIntervention` | `(event: { roundNumber, intervention, effectMetrics }) => void` | An intervention is applied |
| `onRoundComplete` | `(event: { roundNumber, converged, governanceIssues, interventionsApplied }) => void` | A round completes |

### A.2 `DiscussionMessage`

Framework-agnostic message format:

```typescript
interface DiscussionMessage {
  agentId: string;
  agentName: string;
  agentRole: string;
  content: string;
  belief: number;          // [-1, 1]
  confidence: number;      // [0, 100]
  timestamp: string;        // ISO 8601
  referencedAgents?: string[];
  reasoning?: string;
  roundNumber: number;
}
```

### A.3 `GovernanceRoundResult`

```typescript
interface GovernanceRoundResult {
  roundNumber: number;
  issues: Array<{
    type: string;           // "echo_chamber" | "authority_bias" | "polarization" | "premature_consensus"
    severity: "low" | "medium" | "high";
    description: string;
    agents?: string[];
  }>;
  interventions: Intervention[];
  hasIntervention: boolean;
  effectMetrics?: Record<string, number>;
}
```

### A.4 `GovernanceSessionResult`

```typescript
interface GovernanceSessionResult {
  rounds: GovernanceRoundResult[];
  evaluation: EvaluationResult;       // 5-dimension scores
  governance: GovernanceResult;       // Aggregate diagnostic
  timeline: TimelineEntry[];
  totalInterventions: number;
  summary: string;
}
```

### A.5 `FrameworkAdapter` Interface

```typescript
interface FrameworkAdapter {
  readonly framework: string;
  adaptMessages(raw: FrameworkMessage[], roundNumber: number): DiscussionMessage[];
  applyIntervention(intervention: Intervention, context: unknown): Promise<boolean>;
  extractBeliefs(context: unknown): Array<{ agentId: string; belief: number; confidence: number }>;
}
```

---

## Part B: REST API (Research Platform)

### B.1 Execute Decision (Sync)

```
POST /api/v3/execute
Content-Type: application/json
```

**Request:**
```typescript
{
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
    provider: "openai" | "anthropic" | "deepseek" | "local";
    model: string;
  };
  evaluationConfig?: { dimensions?: string[] };
  governanceConfig?: { interventionLevel?: "none" | "light" | "medium" | "heavy" };
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    output: {
      finalDecision: string;
      confidence: number;
      reasoning: string;
      steps: DecisionStep[];
      agentContributions: Record<string, { contribution: string; confidence: number }>;
    };
    evaluation: EvaluationResult;
    governance: GovernanceResult;
    agents: AgentInfo[];
    interactionHistory: InteractionRound[];
    trace: DecisionTrace;
  };
}
```

### B.2 Create Task (Async)

```
POST /api/v3/task
```

### B.3 Get Task Status

```
GET /api/v3/task/:taskId
```

### B.4 Run Benchmark

```
POST /api/v3/benchmark
```

### B.5 Error Response

```typescript
{
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

## Part C: Data Types

### EvaluationResult

```typescript
interface EvaluationResult {
  overallScore: number;        // 0-100
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
  dimensions: {
    consensus: { score: number; details: string };
    reliability: { score: number; details: string };
    dispersion: { score: number; details: string };
    stability: { score: number; details: string };
    influenceAnalysis: { score: number; details: string };
  };
  summary: string;
}
```

### GovernanceResult

```typescript
interface GovernanceResult {
  echoChamber: { detected: boolean; severity: "low" | "medium" | "high"; redundantAgents: string[]; ... };
  authorityBias: { detected: boolean; severity: "low" | "medium" | "high"; dominantAgent?: string; ... };
  polarization: { detected: boolean; severity: "low" | "medium" | "high"; groups: Array<{...}>; ... };
  prematureConsensus: { detected: boolean; severity: "low" | "medium" | "high"; ... };
  otherIssues: Array<{ type: string; severity: string; description: string }>;
  summary: string;
  interventionCount: number;
}
```

---

## Rate Limits

| Endpoint | Rate |
|----------|------|
| `/api/v3/task` | 60/min |
| `/api/v3/execute` | 10/min |
| `/api/v3/benchmark` | 5/min |

The embedded SDK (`GovernanceRuntime`) has no rate limits — it runs in-process.

---

## Version Compatibility

| Version | Status | Notes |
|---------|--------|-------|
| v3 | ✅ Current | REST API + SDK |
