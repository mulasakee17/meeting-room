export type LLMProvider = "openai" | "anthropic" | "deepseek" | "local";

// LLM 错误类型（从 providers.ts 导出）
export { LLMErrorType } from "@/lib/llm/providers";

export interface ReasoningDetail {
  signal_analysis: string;
  conviction_deduction: string;
  counter_arguments: string;
  uncertainty_factors: string;
  time_horizon: "short" | "medium" | "long";
  synthesis: string;
}

export interface RetailProfile {
  type: string;
  riskAppetite: "aggressive" | "moderate" | "conservative";
  investmentHorizon: "short" | "medium" | "long";
  attentionFocus: string[];
  personalityTraits: string[];
}

export interface AgentState {
  emotion: number;
  reasoning: string;
  conviction?: number;
  reasoning_detail?: ReasoningDetail;
  id?: string;
  name?: string;
  emoji?: string;
  role?: string;
  cash?: number;
  holdings?: number;
  wealth?: number;
  previousEmotion?: number;
  previousCash?: number;
  previousHoldings?: number;
  isRetail?: boolean;
  tradeAction?: "BUY" | "SELL" | "HOLD";
  tradeAmount?: number;
  strength?: number;
  influenceBias?: number;
  neighbors?: { agentId: string; weight: number }[];
}

export interface RoundData {
  round: number;
  agents: Record<string, AgentState>;
  consensus: number;
  variance: number;
}

export interface RoundState {
  round: number;
  agents: AgentState[];
  coreAgents: AgentState[];
  retailAgents: AgentState[];
  retailStats: {
    meanEmotion: number;
    variance: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    avgWealth: number;
  };
  globalSentiment: number;
  variance: number;
  marketPrice: number;
  previousPrice: number;
  priceChange: number;
  priceChangeRate: number;
  totalVolume: number;
  netBuyPressure: number;
  timestamp: string;
}

export interface SwarmResult {
  news: string;
  rounds: RoundData[];
  final: {
    consensus: number;
    direction: string;
    converged: boolean;
    total_rounds: number;
  };
}

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  role: string;
  personality: string;
  initialBias: number;
  color: string;
  riskTolerance: "high" | "medium" | "low";
  decisionStyle: "momentum" | "contrarian" | "fundamental" | "technical" | "macro";
  keywords: string[];
  catchphrase: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  emoji: string;
  personality: string;
  initialEmotion: number;
  initialBias: number;
  biasLabel: string;
  riskTolerance: "high" | "medium" | "low";
  riskToleranceText: string;
  decisionStyle: string;
  decisionStyleText: string;
  keywords: string[];
  catchphrase: string;
  color: string;
  camp?: "bull" | "bear" | "neutral" | "tech" | "macro";
  isRetail?: boolean;
  retailProfile?: RetailProfile;
  systemPrompt?: string;
}

export interface Agent {
  persona: Persona;
  generateEmotion: (news: string) => Promise<AgentState>;
  evolveEmotion: (news: string, context: string) => Promise<AgentState>;
}