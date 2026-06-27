import type {
  AgentInfo,
  AttributionItem,
  CounterfactualVariant,
  Direction,
  FactorCategory,
  RoundData,
  SocialProfile,
  SwarmRequest,
  SwarmResponse,
} from "./types";
import { AGENTS } from "./agents";

// ---- deterministic PRNG seeded from string ----
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const FACTOR_CATEGORIES: FactorCategory[] = [
  "liquidity",
  "policy",
  "fundamental",
  "narrative",
  "uncertainty",
];

const FACTOR_LABELS: Record<FactorCategory, string> = {
  liquidity: "流动性",
  policy: "政策",
  fundamental: "基本面",
  narrative: "市场叙事",
  uncertainty: "不确定性",
};

// Agent visible-factor profiles (information blind spots)
const AGENT_FACTOR_VISIBILITY: Record<string, FactorCategory[]> = {
  institution: ["liquidity", "policy", "fundamental", "uncertainty"],
  value: ["fundamental", "policy"],
  trend: ["narrative", "liquidity"],
  panic: ["narrative", "uncertainty"],
  quant: ["liquidity", "fundamental", "uncertainty", "policy", "narrative"],
  media: ["narrative", "policy"],
  contrarian: ["fundamental", "narrative", "uncertainty"],
  retail: ["narrative"],
  policy: ["policy", "uncertainty", "fundamental"],
};

// Base agent personalities: bias multiplier per factor, plus inherent bias
const AGENT_BIAS: Record<string, { bias: number; sensitivity: number }> = {
  institution: { bias: 0, sensitivity: 0.9 },
  value: { bias: 5, sensitivity: 0.6 },
  trend: { bias: 0, sensitivity: 1.4 },
  panic: { bias: -25, sensitivity: 1.6 },
  quant: { bias: 0, sensitivity: 1.0 },
  media: { bias: 0, sensitivity: 1.2 },
  contrarian: { bias: 0, sensitivity: -0.8 },
  retail: { bias: 5, sensitivity: 1.3 },
  policy: { bias: 8, sensitivity: 0.7 },
};

const AGENT_INFLUENCE: Record<string, number> = {
  institution: 0.18,
  value: 0.1,
  trend: 0.12,
  panic: 0.1,
  quant: 0.13,
  media: 0.1,
  contrarian: 0.07,
  retail: 0.08,
  policy: 0.12,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function classifyDirection(consensus: number, beliefStd: number): Direction {
  if (beliefStd > 45 && Math.abs(consensus) < 25) return "NEUTRAL";
  if (consensus > 12) return "UP";
  if (consensus < -12) return "DOWN";
  return "NEUTRAL";
}

export function runSwarmMock(req: SwarmRequest): SwarmResponse {
  const rng = makeRng(hashString(req.news + "::" + (req.rounds ?? 3)));
  const rounds = req.rounds ?? 3;
  const ablation = req.ablation ?? {};
  const includePolicy = !ablation.disablePolicyAgent;
  const useBlindness = !ablation.disableBlindness;

  const activeAgents: AgentInfo[] = AGENTS.filter(
    (a) => includePolicy || a.id !== "policy",
  );

  // ---- 1. Factor vector from news ----
  // Use keyword heuristics + rng noise
  const news = req.news;
  const sentimentTokens: { tokens: string[]; weight: number }[] = [
    { tokens: ["崩盘", "暴跌", "破产", "恐慌", "熔断", "衰退", "战争", "危机"], weight: -45 },
    { tokens: ["下跌", "下滑", "走弱", "回调", "亏损", "裁员"], weight: -22 },
    { tokens: ["上涨", "走强", "反弹", "增长", "盈利", "扩张"], weight: 22 },
    { tokens: ["暴涨", "突破", "繁荣", "牛市", "创新高"], weight: 40 },
    { tokens: ["降息", "宽松", "刺激", "救助", "QE"], weight: 28 },
    { tokens: ["加息", "紧缩", "缩表"], weight: -18 },
  ];
  let baseSentiment = 0;
  for (const t of sentimentTokens) {
    for (const tok of t.tokens) if (news.includes(tok)) baseSentiment += t.weight;
  }
  baseSentiment = clamp(baseSentiment + (rng() - 0.5) * 20, -90, 90);

  const factors = FACTOR_CATEGORIES.map((cat) => {
    if (cat === "uncertainty") {
      const v = clamp(20 + Math.abs(baseSentiment) * 0.4 + (rng() - 0.5) * 25, 0, 100);
      return {
        category: cat,
        value: Math.round(v),
        confidence: Math.round(50 + rng() * 40),
        evidence: `根据新闻语义检测到的不确定性水平: ${v.toFixed(0)}/100`,
      };
    }
    const noise = (rng() - 0.5) * 30;
    const bias =
      cat === "policy" ? (news.includes("降息") ? 30 : news.includes("加息") ? -25 : 0) : 0;
    const v = clamp(baseSentiment * (0.7 + rng() * 0.5) + bias + noise, -95, 95);
    return {
      category: cat,
      value: Math.round(v),
      confidence: Math.round(55 + rng() * 35),
      evidence: `${FACTOR_LABELS[cat]}维度: 从新闻文本中检测到${v >= 0 ? "正面" : "负面"}信号 (${v.toFixed(0)})`,
    };
  });

  const factorMap: Record<string, number> = Object.fromEntries(
    factors.map((f) => [f.category, f.value]),
  );

  // ---- 2. Initial beliefs per agent ----
  function initialBelief(agentId: string): number {
    const visible = useBlindness
      ? AGENT_FACTOR_VISIBILITY[agentId]
      : FACTOR_CATEGORIES;
    let sum = 0;
    let n = 0;
    for (const cat of visible) {
      if (cat === "uncertainty") continue;
      sum += factorMap[cat] ?? 0;
      n++;
    }
    const avg = n ? sum / n : 0;
    const profile = AGENT_BIAS[agentId];
    const b = avg * profile.sensitivity + profile.bias + (rng() - 0.5) * 18;
    return clamp(b, -100, 100);
  }

  // ---- 3. Build social profiles ----
  const socialProfiles: SocialProfile[] = activeAgents.map((a) => {
    const alpha = clamp((rng() - 0.5) * 1.6, -1, 1);
    const others = activeAgents.filter((o) => o.id !== a.id);
    const visibleCount = Math.max(2, Math.floor(others.length * (0.4 + rng() * 0.5)));
    const shuffled = [...others].sort(() => rng() - 0.5);
    const visibleAgentIds = shuffled.slice(0, visibleCount).map((o) => o.id);
    const trust: Record<string, number> = {};
    for (const id of visibleAgentIds) trust[id] = Math.round(40 + rng() * 60);
    return { agentId: a.id, alpha, visibleAgentIds, trust };
  });
  const profileMap = Object.fromEntries(socialProfiles.map((p) => [p.agentId, p]));

  // ---- 4. Run consensus rounds with social interaction ----
  const initialBeliefs: Record<string, number> = {};
  for (const a of activeAgents) initialBeliefs[a.id] = initialBelief(a.id);
  const confidences: Record<string, number> = {};
  for (const a of activeAgents) confidences[a.id] = Math.round(55 + rng() * 35);

  const beliefsHistory: Record<string, number>[] = [{ ...initialBeliefs }];
  const interactionRounds: V9_5InteractionRound[] = [];

  // First snapshot (round 0) -> interaction round
  let prev = { ...initialBeliefs };
  for (let r = 1; r <= Math.max(rounds, 2); r++) {
    const next: Record<string, number> = {};
    const changes: Record<string, number> = {};
    for (const a of activeAgents) {
      const profile = profileMap[a.id];
      const visible = profile.visibleAgentIds;
      let socialMean = 0;
      let wSum = 0;
      for (const vid of visible) {
        const w = (profile.trust[vid] ?? 50) / 100;
        socialMean += prev[vid] * w;
        wSum += w;
      }
      socialMean = wSum ? socialMean / wSum : prev[a.id];
      const openness = (profile.alpha + 1) / 2;
      const blendW = 0.15 + openness * 0.35;
      const noise = (rng() - 0.5) * 12;
      const newBelief = clamp(prev[a.id] * (1 - blendW) + socialMean * blendW + noise, -100, 100);
      next[a.id] = newBelief;
      changes[a.id] = newBelief - prev[a.id];
    }
    const arr = Object.values(next);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    interactionRounds.push({
      round: r,
      beliefs: { ...next },
      beliefChanges: changes,
      meanBelief: mean,
      beliefStd: std,
      converged: std < 12,
    });
    beliefsHistory.push({ ...next });
    prev = next;
  }

  // ---- 5. Compute per-round consensus (weighted by influence) ----
  function weightedConsensus(beliefs: Record<string, number>): {
    consensus: number;
    beliefStd: number;
    kuramotoR: number;
  } {
    let wsum = 0;
    let total = 0;
    for (const a of activeAgents) {
      const w = AGENT_INFLUENCE[a.id];
      total += beliefs[a.id] * w;
      wsum += w;
    }
    const consensus = total / wsum;
    const arr = Object.values(beliefs);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    // Kuramoto order parameter on belief sign phases
    let sx = 0,
      sy = 0;
    for (const v of arr) {
      const phase = (v / 100) * Math.PI;
      sx += Math.cos(phase);
      sy += Math.sin(phase);
    }
    const r = Math.sqrt(sx * sx + sy * sy) / arr.length;
    return { consensus, beliefStd: std, kuramotoR: r };
  }

  const roundsData: RoundData[] = [];
  for (let r = 0; r < rounds; r++) {
    const beliefs = beliefsHistory[Math.min(r, beliefsHistory.length - 1)];
    const { consensus, beliefStd, kuramotoR } = weightedConsensus(beliefs);
    const direction = classifyDirection(consensus, beliefStd);
    const agentsObj: Record<string, AgentStateLike> = {};
    for (const a of activeAgents) {
      const profile = profileMap[a.id];
      const visible = useBlindness
        ? AGENT_FACTOR_VISIBILITY[a.id]
        : FACTOR_CATEGORIES;
      agentsObj[a.id] = {
        belief: beliefs[a.id],
        confidence: confidences[a.id],
        visibleFactors: visible,
        interpretation: `第${r + 1}轮: ${a.name} 综合${visible.length}个因子，信念=${beliefs[
          a.id
        ].toFixed(1)}，社交开放度=${profile.alpha.toFixed(2)}`,
      };
    }
    roundsData.push({
      round: r + 1,
      consensus,
      direction,
      confidence: Math.round(50 + kuramotoR * 45),
      beliefStd,
      kuramotoR,
      agents: agentsObj,
      neutralTrace: {
        rule1_fired: Math.abs(consensus) < 15,
        rule2_fired: beliefStd > 40,
        rule3_fired: kuramotoR < 0.4,
        rule4_fired: factorMap.uncertainty > 60 && Math.abs(consensus) < 20,
        finalNeutral: direction === "NEUTRAL",
        gatingReason:
          direction === "NEUTRAL"
            ? "弱共识 + 高分歧，触发 Neutral 仲裁"
            : "通过 gating 阈值，方向明确",
      },
    });
  }

  // ---- 6. Final ----
  const finalRound = roundsData[roundsData.length - 1];
  const finalDecision = {
    consensus: finalRound.consensus,
    direction: finalRound.direction,
    confidence: finalRound.confidence,
    beliefStd: finalRound.beliefStd,
  };

  // ---- 7. v9_5 metrics ----
  const consensusScore = Math.round(
    clamp(100 - finalRound.beliefStd * 1.2, 0, 100),
  );
  const polarizationScore = Math.round(clamp(finalRound.beliefStd * 1.5, 0, 100));
  const fragilityScore = Math.round(
    clamp(60 - finalRound.kuramotoR * 50 + factorMap.uncertainty * 0.3, 0, 100),
  );

  const stateLabel =
    finalRound.direction === "UP"
      ? "📈 一致看多"
      : finalRound.direction === "DOWN"
        ? "📉 一致看空"
        : "⚖️ 共识分裂";
  const stateInterpretation =
    finalRound.direction === "UP"
      ? `群体形成${consensusScore > 60 ? "较强" : "中等"}的一致性看多共识（共识=${consensusScore}，脆弱性=${fragilityScore}）。`
      : finalRound.direction === "DOWN"
        ? `群体形成${consensusScore > 60 ? "较强" : "中等"}的一致性看空共识（共识=${consensusScore}，脆弱性=${fragilityScore}）。`
        : `Agent 信念高度分散（极化=${polarizationScore}），群体未能形成稳定共识。`;

  // ---- 8. Attribution ----
  const attribution: AttributionItem[] = activeAgents.map((a) => {
    const b = finalRound.agents[a.id].belief;
    const influence = AGENT_INFLUENCE[a.id];
    return {
      agentId: a.id,
      agentName: a.name,
      emoji: a.emoji,
      belief: b,
      confidence: finalRound.agents[a.id].confidence,
      influenceWeight: influence,
      contribution: b * influence,
      contributionPct: 0,
      direction: b > 15 ? "BULLISH" : b < -15 ? "BEARISH" : "NEUTRAL",
      visibleFactors: finalRound.agents[a.id].visibleFactors,
    };
  });
  const absSum = attribution.reduce((s, x) => s + Math.abs(x.contribution), 0) || 1;
  for (const x of attribution) {
    x.contributionPct = Math.round((Math.abs(x.contribution) / absSum) * 100);
  }

  // ---- 9. Coalitions ----
  const bullish = attribution.filter((x) => x.direction === "BULLISH");
  const bearish = attribution.filter((x) => x.direction === "BEARISH");
  const neutralAgs = attribution.filter((x) => x.direction === "NEUTRAL");
  function coal(arr: typeof attribution) {
    const totalInfluence = arr.reduce((s, x) => s + x.influenceWeight, 0);
    const wb = totalInfluence
      ? arr.reduce((s, x) => s + x.belief * x.influenceWeight, 0) / totalInfluence
      : 0;
    return {
      agentIds: arr.map((x) => x.agentId),
      totalInfluence,
      totalCapital: arr.length * 100,
      weightedBelief: wb,
    };
  }
  const bullCo = coal(bullish);
  const bearCo = coal(bearish);
  const powerRatio = bearCo.totalInfluence
    ? bullCo.totalInfluence / bearCo.totalInfluence
    : bullCo.totalInfluence > 0
      ? 99
      : 1;
  const dominantCoalition: "BULLISH" | "BEARISH" | "BALANCED" =
    powerRatio > 1.3 ? "BULLISH" : powerRatio < 0.77 ? "BEARISH" : "BALANCED";
  const tension = Math.round(
    clamp(Math.min(bullCo.totalInfluence, bearCo.totalInfluence) * 200, 0, 100),
  );

  // ---- 10. Counterfactuals ----
  const variants: CounterfactualVariant[] = [];
  function variant(label: string, description: string, mutate: () => number, opts?: { modifiedAgentId?: string }) {
    const c = mutate();
    const delta = c - finalRound.consensus;
    const flipped =
      Math.sign(c) !== Math.sign(finalRound.consensus) &&
      Math.abs(c) > 10 &&
      Math.abs(finalRound.consensus) > 10;
    const abs = Math.abs(delta);
    const impact: CounterfactualVariant["impact"] =
      flipped || abs > 25
        ? "CRITICAL"
        : abs > 15
          ? "SIGNIFICANT"
          : abs > 7
            ? "MODERATE"
            : "MINIMAL";
    variants.push({
      label,
      description,
      modifiedAgentId: opts?.modifiedAgentId,
      consensus: c,
      direction: classifyDirection(c, finalRound.beliefStd),
      deltaConsensus: delta,
      directionFlipped: flipped,
      impact,
    });
  }
  // remove panic
  variant("移除 Panic", "如果不存在恐慌情绪 Agent", () => {
    const others = activeAgents.filter((a) => a.id !== "panic");
    let t = 0,
      w = 0;
    for (const a of others) {
      const ww = AGENT_INFLUENCE[a.id];
      t += finalRound.agents[a.id].belief * ww;
      w += ww;
    }
    return t / w;
  }, { modifiedAgentId: "panic" });
  variant("关闭信息盲区", "所有 Agent 看到全部因子", () => {
    let t = 0,
      w = 0;
    for (const a of activeAgents) {
      let sum = 0,
        n = 0;
      for (const cat of FACTOR_CATEGORIES) {
        if (cat === "uncertainty") continue;
        sum += factorMap[cat] ?? 0;
        n++;
      }
      const avg = sum / n;
      const b = clamp(avg * AGENT_BIAS[a.id].sensitivity + AGENT_BIAS[a.id].bias, -100, 100);
      const ww = AGENT_INFLUENCE[a.id];
      t += b * ww;
      w += ww;
    }
    return t / w;
  });
  variant("禁用社交互动", "跳过 Agent 间信息传播", () => {
    let t = 0,
      w = 0;
    for (const a of activeAgents) {
      const ww = AGENT_INFLUENCE[a.id];
      t += initialBeliefs[a.id] * ww;
      w += ww;
    }
    return t / w;
  });
  variant("启用动态权重", "Panic / Policy 模式触发动态加权", () => {
    let t = 0,
      w = 0;
    for (const a of activeAgents) {
      const boost = a.id === "policy" ? 1.5 : a.id === "panic" ? 1.3 : 1;
      const ww = AGENT_INFLUENCE[a.id] * boost;
      t += finalRound.agents[a.id].belief * ww;
      w += ww;
    }
    return t / w;
  });

  const mostInfluential = [...attribution].sort(
    (a, b) => b.contributionPct - a.contributionPct,
  )[0];

  // ---- 11. Belief shift ----
  const beliefShift: Record<string, number> = {};
  for (const a of activeAgents)
    beliefShift[a.id] = finalRound.agents[a.id].belief - initialBeliefs[a.id];

  const stdHistory = roundsData.map((r) => r.beliefStd);
  const polarizationIncreased = stdHistory[stdHistory.length - 1] > stdHistory[0];

  // ---- Build response ----
  const response: SwarmResponse = {
    success: true,
    version: "v9.7",
    data: {
      news: req.news,
      factorVector: {
        factors,
        metadata: {
          newsSummary: req.news.slice(0, 80) + (req.news.length > 80 ? "…" : ""),
          detectedAnomalies:
            Math.abs(baseSentiment) > 50 ? ["极端情绪信号", "高波动事件"] : [],
          timestamp: new Date().toISOString(),
        },
      },
      rounds: roundsData,
      final: finalDecision,
      diagnostics: {
        attribution,
        coalition: {
          bullishCoalition: bullCo,
          bearishCoalition: bearCo,
          neutralAgents: neutralAgs.map((x) => x.agentId),
          powerRatio,
          dominantCoalition,
          tension,
          swingAgents: neutralAgs.map((x) => x.agentId).slice(0, 2),
        },
        counterfactuals: {
          baselineConsensus: finalRound.consensus,
          mostInfluentialAgent: mostInfluential?.agentId ?? "",
          agentsToFlip: Math.max(1, Math.round(2 + rng() * 2)),
          variants,
        },
        summary: {
          coreFinding:
            finalRound.direction === "NEUTRAL"
              ? "群体未形成主导方向，分歧显著"
              : `${dominantCoalition === "BULLISH" ? "多头" : "空头"}联盟主导，共识方向 ${finalRound.direction}`,
          consensusMechanism: `通过 ${rounds} 轮社交传播，信念标准差从 ${stdHistory[0].toFixed(1)} 演化到 ${stdHistory[stdHistory.length - 1].toFixed(1)}`,
          riskFactors: [
            fragilityScore > 60 ? "共识脆弱，易被新信息扰动" : "共识较稳健",
            polarizationScore > 60 ? "群体高度极化" : "极化程度可控",
            factorMap.uncertainty > 60 ? "因子不确定性高" : "因子信号清晰",
          ],
          blindnessEffect: useBlindness
            ? "Panic / Retail 等 Agent 因信息盲区放大了情绪驱动"
            : "已关闭信息盲区，所有 Agent 信息对称",
        },
      },
      ablationMetrics: {
        policyAgentActive: includePolicy,
        uncertaintyActive: !ablation.disableUncertainty,
        blindnessActive: useBlindness,
        beliefStdHistory: stdHistory,
      },
      v9_5: {
        interaction: req.disableInteraction
          ? null
          : {
              totalRounds: interactionRounds.length,
              convergenceType: interactionRounds[interactionRounds.length - 1].converged
                ? "converged"
                : polarizationIncreased
                  ? "diverged"
                  : "max_rounds",
              rounds: interactionRounds,
              beliefShift,
              consensusFormed: consensusScore > 55,
              polarizationIncreased,
              socialProfiles,
            },
        metrics: {
          consensusScore,
          polarizationScore,
          fragilityScore,
          stateLabel,
          stateInterpretation,
        },
        comparison: {
          consensusShift: finalRound.consensus - roundsData[0].consensus,
          stdChange: stdHistory[stdHistory.length - 1] - stdHistory[0],
          effect:
            stdHistory[stdHistory.length - 1] - stdHistory[0] < -5
              ? "convergence"
              : stdHistory[stdHistory.length - 1] - stdHistory[0] > 5
                ? "polarization"
                : "minimal",
          description:
            stdHistory[stdHistory.length - 1] < stdHistory[0]
              ? "社交互动促进信念收敛"
              : "社交互动加剧了观点极化",
        },
      },
      v9_5Agents: activeAgents,
      routing: {
        finalDirection: finalRound.direction,
        decision: req.enableVRoute === false ? "disabled" : "consensus_llm_trusted",
        classifierLabel: finalRound.direction === "UP" ? "V_REBOUND" : "L_DECLINE",
        consensusRaw: finalRound.consensus,
      },
    },
    rateLimit: {
      remaining: 99,
      resetTime: new Date(Date.now() + 3600_000).toISOString(),
    },
  };

  return response;
}

interface V9_5InteractionRound {
  round: number;
  beliefs: Record<string, number>;
  beliefChanges: Record<string, number>;
  meanBelief: number;
  beliefStd: number;
  converged: boolean;
}
interface AgentStateLike {
  belief: number;
  confidence: number;
  visibleFactors: string[];
  interpretation: string;
}
