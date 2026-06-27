import type { SwarmRequest, SwarmResponse } from "./types";
import { runSwarmMock } from "./mock";

// ── Mock mode flag ──
let globalMockMode = true;
export function setMockMode(on: boolean) {
  globalMockMode = on;
}
export function getMockMode() {
  return globalMockMode;
}

// ── Live API call ──
export async function runSwarmLive(req: SwarmRequest): Promise<SwarmResponse> {
  const res = await fetch("/api/swarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: "v9",
      news: req.news,
      rounds: req.rounds ?? 3,
      llmConfig: req.llmConfig,
      sessionId: req.sessionId,
      sequenceIndex: req.sequenceIndex,
      disableInteraction: req.disableInteraction,
      enableDynamicWeights: req.enableDynamicWeights,
      enableVRoute: req.enableVRoute,
      ablation: req.ablation,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `API error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.success && data.error) {
    throw new Error(data.error);
  }

  // Normalize the response to our frontend types
  return data as SwarmResponse;
}

// ── Unified runner ──
export async function runSwarmExperiment(req: SwarmRequest): Promise<SwarmResponse> {
  if (globalMockMode) {
    const delay = 700 + Math.random() * 800;
    await new Promise((r) => setTimeout(r, delay));
    return runSwarmMock(req);
  }
  return runSwarmLive(req);
}

export interface StreamProgress {
  current: number;
  total: number;
  partial: SwarmResponse;
  done: boolean;
}

/**
 * Streaming experiment runner. In mock mode, computes data synchronously and
 * progressively emits partial snapshots round-by-round. In live mode, calls
 * the API once then simulates progressive reveal for the UI.
 */
export async function streamSwarmExperiment(
  req: SwarmRequest,
  onUpdate: (p: StreamProgress) => void,
  opts: { roundDelayMs?: number; startDelayMs?: number } = {},
): Promise<SwarmResponse> {
  const startDelay = opts.startDelayMs ?? 600;
  const roundDelay = opts.roundDelayMs ?? 1200;

  await new Promise((r) => setTimeout(r, startDelay));

  // Fetch full result (mock or live)
  const full = globalMockMode
    ? runSwarmMock(req)
    : await runSwarmLive(req);

  const total = full.data.rounds.length;

  for (let k = 1; k <= total; k++) {
    const partial = sliceResponse(full, k);
    onUpdate({ current: k, total, partial, done: k === total });
    if (k < total) await new Promise((r) => setTimeout(r, roundDelay));
  }
  return full;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function sliceResponse(full: SwarmResponse, k: number): SwarmResponse {
  const rounds = full.data.rounds.slice(0, k);
  const last = rounds[rounds.length - 1];
  const stdHistory = full.data.ablationMetrics.beliefStdHistory.slice(0, k);

  const interaction = full.data.v9_5.interaction
    ? {
        ...full.data.v9_5.interaction,
        rounds: full.data.v9_5.interaction.rounds.slice(0, k),
        totalRounds: k,
      }
    : null;

  // 每轮重新计算指标（而非用最终值）
  const uncFactor = full.data.factorVector.factors.find(f => f.category === "uncertainty")?.value ?? 30;
  const consensusScore = Math.round(clamp(100 - last.beliefStd * 1.2, 0, 100));
  const polarizationScore = Math.round(clamp(last.beliefStd * 1.5, 0, 100));
  const fragilityScore = Math.round(clamp(60 - last.kuramotoR * 50 + uncFactor * 0.3, 0, 100));

  const stateLabel =
    last.direction === "UP" ? "📈 一致看多"
    : last.direction === "DOWN" ? "📉 一致看空"
    : "⚖️ 共识分裂";
  const stateInterpretation =
    last.direction !== "NEUTRAL"
      ? `第${k}轮: 群体形成${consensusScore > 60 ? "较强" : "中等"}的${last.direction === "UP" ? "看多" : "看空"}共识（共识=${consensusScore}，脆弱性=${fragilityScore}）`
      : `第${k}轮: Agent信念分散（极化=${polarizationScore}），群体未形成稳定共识`;

  return {
    ...full,
    data: {
      ...full.data,
      rounds,
      final: {
        consensus: last.consensus,
        direction: last.direction,
        confidence: last.confidence,
        beliefStd: last.beliefStd,
      },
      ablationMetrics: {
        ...full.data.ablationMetrics,
        beliefStdHistory: stdHistory,
      },
      v9_5: {
        ...full.data.v9_5,
        interaction,
        metrics: { consensusScore, polarizationScore, fragilityScore, stateLabel, stateInterpretation },
      },
      routing: {
        ...full.data.routing,
        finalDirection: last.direction,
        consensusRaw: last.consensus,
      },
    },
  };
}
