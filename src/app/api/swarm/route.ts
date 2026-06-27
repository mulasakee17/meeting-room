import { NextRequest, NextResponse } from "next/server";
import { runSwarmSimulation, runTechnicalSwarmSimulation, runMLSwarmSimulation } from "@/lib/agents/engine";
import { LLMConfig, LLMError, LLMErrorType } from "@/lib/llm/providers";
import { withRetry, RetryableError } from "@/lib/utils/retry";
import { checkRateLimit, getClientIdentifier, RATE_LIMIT_PRESETS } from "@/lib/security/rateLimit";
import { validateSwarmRequest, sanitizeString } from "@/lib/security/validation";

// 校准系统导入
import {
  calibratePrediction,
  MarketState,
  assessCrisisType,
} from "@/lib/calibration/predictionCalibrator";
import {
  hybridPredict,
  CalibrationPrediction,
  LLMPredictionInput,
  HybridPredictionResult,
} from "@/lib/calibration/hybridPredictor";
// 🆕 v9.5.2: V型反弹路由仲裁
import { classifyEvent, ClassifierInput } from "@/lib/calibration/eventClassifierV2";

// 真实市场数据
import { fetchRealMarketParams } from "@/lib/market-data/realMarketParams";

// 集成层 — 信息不对称引擎 + 30散户 + 社交网络 + 真实技术数据
import { runRetailLayer, getRealMarketSnapshot, runAsymmetricSwarm } from "@/lib/agents/integratedEngine";

// v6.0 涌现式市场共识引擎 — 按需动态导入, 避免缺失模块阻塞编译

// v9.3 正交五因子 + 诊断引擎
import { runSwarmV9 } from "@/lib/agents/v9";

// v9.5 共识度量引擎 + Agent 互动层
import { runInteraction, computeAllMetrics, computeInteractionEffect, formatInteractionSummary } from "@/lib/agents/v9.5";
// 🆕 v9.5.2: 动态权重引擎
import { computeDynamicWeights, formatDynamicWeightSummary } from "@/lib/agents/v9.5/dynamicWeights";

// 演示容灾兜底 — DEMO_MODE 下 LLM 失败时返回预计算完整响应
import { FALLBACK_RESPONSE } from "@/lib/demo-fallback";
import { getAllAgents } from "@/lib/agents/v9/agentDefinitions";

// v9.5.1: 连续推演时间线存储 (服务端内存, 会话级)
// ⚠️ Serverless 限制: 此 Map 在每次冷启动时被重置。
//    - 长驻 Node.js 服务器: 跨请求共享, 正常工作
//    - Vercel/Edge/AWS Lambda: 每次调用都是新的, 时间线数据不跨请求保留
//    - 建议: 生产环境中使用 Redis/Upstash 等外部存储替代
interface TimelineEntry {
  sequenceIndex: number;
  news: string;
  consensusScore: number;
  polarizationScore: number;
  fragilityScore: number;
  consensus: number;
  direction: string;
  beliefStd: number;
}
const timelineStore = new Map<string, TimelineEntry[]>();
/** 最大会话数 — 防止长时间运行的服务中内存泄漏 */
const MAX_TIMELINE_SESSIONS = 100;
/** 会话 TTL (毫秒) — 超时自动清理 */
const TIMELINE_SESSION_TTL_MS = 30 * 60 * 1000; // 30 分钟

/** 清理过期 timeline 会话 */
function pruneTimelineStore(): void {
  if (timelineStore.size > MAX_TIMELINE_SESSIONS) {
    const keys = Array.from(timelineStore.keys());
    const excess = timelineStore.size - MAX_TIMELINE_SESSIONS;
    // 删除最旧的会话
    for (let i = 0; i < excess && i < keys.length; i++) {
      timelineStore.delete(keys[i]);
    }
  }
}

// 错误消息映射
const ERROR_MESSAGES: Record<LLMErrorType, { title: string; suggestion: string }> = {
  [LLMErrorType.TIMEOUT]: {
    title: "请求超时",
    suggestion: "LLM API 响应时间过长，请检查网络或稍后重试"
  },
  [LLMErrorType.NETWORK]: {
    title: "网络错误",
    suggestion: "无法连接到 LLM 服务，请检查网络连接"
  },
  [LLMErrorType.API_ERROR]: {
    title: "API 服务错误",
    suggestion: "LLM 服务暂时不可用，请稍后重试"
  },
  [LLMErrorType.PARSE_ERROR]: {
    title: "响应格式错误",
    suggestion: "LLM 返回了无法解析的响应格式"
  },
  [LLMErrorType.AUTH_ERROR]: {
    title: "认证失败",
    suggestion: "API Key 无效或未配置，请检查环境变量"
  },
  [LLMErrorType.RATE_LIMIT]: {
    title: "请求过于频繁",
    suggestion: "触发了 API 速率限制，请稍后重试"
  },
  [LLMErrorType.INVALID_RESPONSE]: {
    title: "响应无效",
    suggestion: "LLM 返回了空或格式不正确的响应"
  },
  [LLMErrorType.UNKNOWN]: {
    title: "未知错误",
    suggestion: "发生了未知错误，请查看详细信息或联系支持"
  }
};

// ==================== 新闻特征提取（精简版） ====================

/**
 * 从新闻文本推断关键市场参数
 * 仅提取校准系统需要的少量字段
 */
function inferMarketParams(news: string): {
  vix: number;
  rsi: number;
  dropMagnitude: number;
  volatility: number;
  volumeSpike: number;
  sectorRotation: number;
  yieldCurveSpread: number;
  goldMomentum: number;
  oilMomentum: number;
  hasPolicyResponse: boolean;
  hasCentralBankAction: boolean;
  knownVulnerabilities: string[];
} {
  const text = news.toLowerCase();

  // 跌幅推断
  let dropMagnitude = 0;
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/g);
  if (pctMatch) {
    const pcts = pctMatch.map(p => parseFloat(p)).filter(p => p > 0.5 && p < 100);
    dropMagnitude = pcts.length > 0 ? Math.max(...pcts) : 0;
  }
  if (text.match(/熔断|崩盘|海啸|crash|meltdown/i) && dropMagnitude < 15) dropMagnitude = 15;
  if (text.match(/暴跌|恐慌|危机|crisis|panic/i) && dropMagnitude < 8) dropMagnitude = 8;

  // VIX 推断
  let vix = 20;
  const vixMatch = text.match(/vix.*?(\d+)/i);
  if (vixMatch) vix = parseInt(vixMatch[1]);
  else if (dropMagnitude > 20) vix = 55;
  else if (dropMagnitude > 10) vix = 35;
  else if (dropMagnitude > 5) vix = 28;

  // RSI 推断
  let rsi = 50;
  const rsiMatch = text.match(/rsi.*?(\d+)/i);
  if (rsiMatch) rsi = parseInt(rsiMatch[1]);
  else if (dropMagnitude > 15) rsi = 18;
  else if (dropMagnitude > 8) rsi = 24;
  else if (dropMagnitude > 3) rsi = 32;

  // 波动率推断
  let volatility = 0.015;
  if (dropMagnitude > 15) volatility = 0.04;
  else if (dropMagnitude > 8) volatility = 0.028;
  else if (dropMagnitude > 3) volatility = 0.02;

  // 政策响应
  const hasPolicyResponse = !!text.match(/注入|购债|QE|量化宽松|救助|bailout|纾困|降息|宽松|刺激|stimulus|紧急|立即|emergency|rate cut/);
  const hasCentralBankAction = !!text.match(/央行|美联储|fed\b|ECB|BOJ|英格兰银行|降息|利率|购债|QE|central bank/i);

  // 已知脆弱性
  const knownVulnerabilities: string[] = [];
  if (text.match(/杠杆|leverage|爆仓|强平/)) knownVulnerabilities.push("高杠杆");
  if (text.match(/违约|破产|倒闭/)) knownVulnerabilities.push("违约风险");
  if (text.match(/流动性|liquidity|保证金/)) knownVulnerabilities.push("流动性紧张");
  if (text.match(/系统性|systemic|传染|连锁/)) knownVulnerabilities.push("系统性风险");

  return {
    vix, rsi, dropMagnitude, volatility,
    volumeSpike: 1.0,
    sectorRotation: 0,
    yieldCurveSpread: -0.5,
    goldMomentum: 0,
    oilMomentum: 0,
    hasPolicyResponse, hasCentralBankAction, knownVulnerabilities,
  };
}

// ==================== API 路由 ====================

export async function POST(req: NextRequest) {
  try {
    // 1. 速率限制检查
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(clientId, RATE_LIMIT_PRESETS.standard);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "请求过于频繁",
          code: "RATE_LIMITED",
          suggestion: `请在 ${rateLimitResult.retryAfter} 秒后重试`,
          retryAfter: rateLimitResult.retryAfter,
          remaining: rateLimitResult.remaining,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
          }
        }
      );
    }

    // 2. 解析请求体
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "请求格式错误",
          code: "INVALID_JSON",
          suggestion: "请确保发送有效的 JSON 格式数据"
        },
        { status: 400 }
      );
    }

    // 3. 输入验证
    const validation = validateSwarmRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "输入验证失败",
          code: "VALIDATION_ERROR",
          suggestion: "请检查输入参数",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const { news, rounds, llmConfig, enableTechnicalAnalysis, enableML, symbol, mlOptions } = validation.sanitized!;

    // 4. 构建 LLM 配置
    const config: LLMConfig | undefined = llmConfig ? {
      provider: llmConfig.provider,
      model: llmConfig.model,
      timeout: llmConfig.timeout || 30000,
    } : undefined;

    // ── v6.0 路径: 涌现式市场共识引擎 ──
    const version = (body as any).version ?? "v5";
    if (version === "v6") {
      console.log(`[API] 🚀 启动 v6.0 涌现式市场共识引擎...`);
      try {
        const { runSwarmV6, analyzePowerBalance } = await import("@/lib/agents/v6");
        const { V6_PERSONAS } = await import("@/lib/agents/v6/personas");
        const v6Result = await runSwarmV6(news, config, rounds || 3);

        // 构建 v6 响应
        return NextResponse.json(
          {
            success: true,
            version: "v6.0",
            data: {
              news: v6Result.news,
              rounds: v6Result.rounds.map((r: any) => ({
                round: r.round,
                consensus: r.consensus,
                variance: r.variance,
                regime: r.regime,
                regimeDescription: r.regimeDescription,
                capitalFlows: {
                  buyPressure: r.capitalFlows.buyPressure,
                  sellPressure: r.capitalFlows.sellPressure,
                  netFlow: r.capitalFlows.netFlow,
                  dominantDirection: r.capitalFlows.dominantDirection,
                },
                priceChange: r.price.priceChange,
                newPrice: r.price.newPrice,
                emergentBehaviors: r.emergentBehaviors.map((b: any) => ({
                  type: b.type,
                  intensity: b.intensity,
                  description: b.description,
                })),
                agentSnapshots: r.agentSnapshots,
              })),
              final: {
                consensus: v6Result.finalConsensus,
                direction: v6Result.direction,
                totalRounds: v6Result.rounds.length,
                regime: v6Result.finalRegime,
                priceChange: v6Result.finalPrice.priceChange,
                netCapitalFlow: v6Result.finalCapitalFlows.netFlow,
              },
              emergentBehaviors: v6Result.emergentBehaviors.map((b: any) => ({
                type: b.type,
                intensity: b.intensity,
                description: b.description,
              })),
              powerBalance: analyzePowerBalance(
                v6Result.rounds[v6Result.rounds.length - 1].agents,
                V6_PERSONAS
              ),
            },
            // 兼容 hybridPredict 输入
            hybridCompatible: v6Result.llmInput,
            rateLimit: {
              remaining: rateLimitResult.remaining,
              resetTime: rateLimitResult.resetTime,
            },
          },
          {
            headers: {
              'X-RateLimit-Remaining': String(rateLimitResult.remaining),
              'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
            }
          }
        );
      } catch (v6Error) {
        console.error("[V6] 引擎失败:", v6Error);
        return NextResponse.json(
          {
            success: false,
            error: "v6.0 引擎运行失败",
            code: "V6_ERROR",
            suggestion: "请检查输入参数或稍后重试",
            details: v6Error instanceof Error ? v6Error.message : "未知错误",
          },
          { status: 500 }
        );
      }
    }

    if (version === "v9") {
      console.log(`[API] 🧬 启动 v9.3 正交五因子共识引擎...`);
      try {
        const marketSnapshot = await getRealMarketSnapshot();
        const marketData = (body as any).marketData ?? {};
        // 优先使用 fetchRealMarketParams 的丰富数据，降级到 marketSnapshot
        const enrichedParams = await fetchRealMarketParams(news).catch(() => null);
        const v9Config = {
          news,
          marketData: {
            vix: enrichedParams?.vix ?? marketSnapshot?.vix ?? marketData.vix ?? 20,
            rsi: enrichedParams?.rsi ?? marketSnapshot?.rsi ?? marketData.rsi ?? 50,
            dropMagnitude: enrichedParams?.dropMagnitude ?? marketSnapshot?.dropFromPeak ?? marketData.dropMagnitude ?? 5,
            volatility: enrichedParams?.volatility ?? marketSnapshot?.volatility ?? 0.015,
            volumeSpike: enrichedParams?.volumeSpike ?? marketSnapshot?.volumeSpike ?? 1.0,
            sectorRotation: enrichedParams?.sectorRotation ?? 0,
            yieldCurveSpread: enrichedParams?.yieldCurveSpread ?? -0.5,
            goldMomentum: enrichedParams?.goldMomentum ?? 0,
            oilMomentum: enrichedParams?.oilMomentum ?? 0,
            hasPolicyResponse: enrichedParams?.hasPolicyResponse ?? marketData.hasPolicyResponse ?? false,
            hasLeverageDamage: marketData.hasLeverageDamage ?? false,
            hasSolvencyDamage: marketData.hasSolvencyDamage ?? false,
          },
          rounds: rounds || 3,
          ablation: (body as any).ablation,
        };

        const v9Result = await runSwarmV9(v9Config, !!config);

        // ── 🆕 v9.5.2: V 型反弹路由仲裁 ──
        // 组合事件分类器 V2 (V_REBOUND 100% recall) + LLM 共识 (DOWN 100% recall)
        const enableVRoute = (body as any).enableVRoute !== false; // 默认开启
        let routingDecision: "classifier_v_rebound" | "consensus_llm_trusted" | "disabled" = "disabled";
        let routingDirection: string = v9Result.finalDecision.direction;
        let classifierLabel: string = "disabled";

        if (enableVRoute) {
          // 构建 ClassifierInput (从真实市场数据或事件推断)
          const classifierInput: ClassifierInput = {
            vix: v9Config.marketData.vix,
            rsi: v9Config.marketData.rsi,
            dropMagnitude: v9Config.marketData.dropMagnitude,
            volatility: v9Config.marketData.volatility ?? (
              v9Config.marketData.dropMagnitude > 15 ? 0.04 :
              v9Config.marketData.dropMagnitude > 8 ? 0.028 :
              v9Config.marketData.dropMagnitude > 3 ? 0.02 : 0.015
            ),
            volumeSpike: v9Config.marketData.volumeSpike ?? 1.0,
            hasPolicyResponse: v9Config.marketData.hasPolicyResponse,
            hasCentralBankAction: v9Config.marketData.hasPolicyResponse,
            hasLeverageDamage: v9Config.marketData.hasLeverageDamage,
            hasSolvencyDamage: v9Config.marketData.hasSolvencyDamage,
          };

          const cr = classifyEvent(classifierInput);
          classifierLabel = cr.pattern;

          // 🔑 双确认: V_REBOUND ∧ vScore > lScore × 3 → 高置信 V 弹
          if (cr.pattern === "V_REBOUND" && cr.vScore > cr.lScore * 3) {
            routingDirection = "UP";
            routingDecision = "classifier_v_rebound";
            console.log(
              `⚡ [ROUTER] V-REBOUND (vScore=${cr.vScore.toFixed(2)} lScore=${cr.lScore.toFixed(2)} ratio=${(cr.vScore / Math.max(0.01, cr.lScore)).toFixed(1)}x) → ${v9Result.finalDecision.direction}→UP | cons=${v9Result.finalDecision.consensus.toFixed(1)}`
            );
          } else {
            routingDecision = "consensus_llm_trusted";
          }
        }

        // ── v9.5: Agent 互动层 + 共识度量 ──
        const enableInteraction = (body as any).disableInteraction !== true;
        const finalRound = v9Result.rounds[v9Result.rounds.length - 1];
        const finalAgents = Object.values(finalRound.agents);

        // 用 v9 真实 Agent 定义 + 最后轮的 Agent 状态运行互动
        const v9Agents = getAllAgents(true);
        const agentStatesMap: Record<string, any> = {};
        for (const a of finalAgents) {
          agentStatesMap[a.agentId] = {
            agentId: a.agentId,
            belief: a.belief,
            confidence: a.confidence,
            visibleFactors: a.visibleFactors,
            interpretation: a.interpretation,
            previousBelief: 0,
          };
        }

        // ── 🆕 v9.5.2: 动态权重引擎 ──
        const enableDynamicWeights = (body as any).enableDynamicWeights === true;
        let dynamicWeightResult: ReturnType<typeof computeDynamicWeights> | undefined;

        if (enableDynamicWeights) {
          // 构建市场快照
          const marketSnapshot = {
            vix: v9Config.marketData.vix,
            rsi: v9Config.marketData.rsi,
            beliefStd: v9Result.finalDecision.beliefStd,
          };

          // 获取因子向量 (从第一轮结果)
          const factorVector = v9Result.rounds[0]?.factorVector;
          if (factorVector) {
            dynamicWeightResult = computeDynamicWeights(
              v9Agents,
              factorVector,
              marketSnapshot,
              agentStatesMap as Record<string, any>,
              true
            );

            // 控制台日志: 动态权重诊断
            const weightSummary = formatDynamicWeightSummary(dynamicWeightResult);
            console.log(weightSummary);

            // 将动态权重注入 agentStatesMap (用于互动层 + 后续度量)
            if (dynamicWeightResult.activeModes.length > 0) {
              console.log(
                `[V9.5.2] 🎯 动态权重已激活: ${dynamicWeightResult.activeModes.join(", ")} — ` +
                Object.values(dynamicWeightResult.adjustments)
                  .filter(a => a.contributingModes.length > 0)
                  .map(a => `${a.agentName}(${a.baseWeight}→${a.finalWeight})`)
                  .join(" ")
              );
            }
          } else {
            console.warn("[V9.5.2] ⚠️ 因子向量缺失, 动态权重退回静态模式");
          }
        }

        // 传入动态权重运行互动
        const interaction = enableInteraction
          ? runInteraction(v9Agents, agentStatesMap, {
              dynamicWeights: dynamicWeightResult?.weights,
            })
          : runInteraction(v9Agents, agentStatesMap, {
              disabled: true,
              dynamicWeights: dynamicWeightResult?.weights,
            });

        if (enableInteraction && interaction.totalRounds > 0) {
          console.log(`[V9.5] 🧬 Agent 互动: ${interaction.totalRounds} 轮, ${interaction.convergenceType}`);
        }

        // 计算共识度量 (基于互动后的信念)
        const finalStatesAfterInteraction: Record<string, any> = {};
        for (const a of finalAgents) {
          finalStatesAfterInteraction[a.agentId] = {
            ...agentStatesMap[a.agentId],
            belief: interaction.finalBeliefs[a.agentId] ?? a.belief,
          };
        }

        const metrics = computeAllMetrics(
          v9Agents,
          finalStatesAfterInteraction,
          v9Result.finalDecision.consensus,
          v9Result.finalDecision.beliefStd,
          undefined, // kuramotoR 从 metrics 内部估算
          v9Result.diagnostics
        );

        // 互动前后对比
        const comparison = enableInteraction && interaction.totalRounds > 0
          ? computeInteractionEffect(
              v9Result.finalDecision.beliefStd,
              interaction.rounds[interaction.rounds.length - 1].beliefStd,
              v9Result.finalDecision.consensus,
              interaction.rounds[interaction.rounds.length - 1].meanBelief
            )
          : undefined;

        // 🆕 v9.5.1: 连续推演时间线
        const sessionId = (body as any).sessionId as string | undefined;
        const sequenceIndex = (body as any).sequenceIndex as number | undefined;
        let timeline: TimelineEntry[] | undefined;

        if (sessionId && sequenceIndex !== undefined) {
          const entry: TimelineEntry = {
            sequenceIndex,
            news: news.slice(0, 60),
            consensusScore: metrics.consensusScore,
            polarizationScore: metrics.polarizationScore,
            fragilityScore: metrics.fragilityScore,
            consensus: v9Result.finalDecision.consensus,
            direction: v9Result.finalDecision.direction,
            beliefStd: v9Result.finalDecision.beliefStd,
          };

          let session = timelineStore.get(sessionId) || [];
          session[sequenceIndex] = entry;
          session = session.filter(Boolean); // 去空洞
          timelineStore.set(sessionId, session);
          pruneTimelineStore(); // 防止长驻服务中内存泄漏
          timeline = [...session];
        }

        // ── 🆕 v9.5.2: 动态共识 (用动态权重重新计算加权共识) ──
        let dynamicConsensus: number | undefined;
        if (dynamicWeightResult && dynamicWeightResult.activeModes.length > 0) {
          const finalInteractionBeliefs = interaction.finalBeliefs;
          let weightedSum = 0;
          let totalWeight = 0;
          for (const agent of v9Agents) {
            const belief = finalInteractionBeliefs[agent.id] ?? agentStatesMap[agent.id]?.belief ?? 0;
            const conf = agentStatesMap[agent.id]?.confidence ?? 50;
            const dw = dynamicWeightResult.weights[agent.id] ?? agent.influenceWeight;
            weightedSum += belief * dw * (conf / 100);
            totalWeight += dw * (conf / 100);
          }
          dynamicConsensus = totalWeight > 0
            ? Math.round((weightedSum / totalWeight) * 100) / 100
            : v9Result.finalDecision.consensus;
        }
        // ── end v9.5.2 dynamicConsensus ──

        const v9_5 = {
          interaction: enableInteraction && interaction.totalRounds > 0 ? {
            totalRounds: interaction.totalRounds,
            convergenceType: interaction.convergenceType,
            rounds: (() => {
              // 🆕 v9.5.1: rounds > 3 时压缩 — 只保留 0/3/5/last
              const allRounds = interaction.rounds;
              const totalReqRounds = rounds || 3;
              if (totalReqRounds > 3 && allRounds.length > 6) {
                const keepIndices = new Set([0, 3, 5, allRounds.length - 1]);
                return allRounds
                  .filter((_, i) => keepIndices.has(i))
                  .map(r => ({
                    round: r.round,
                    beliefs: r.beliefs,
                    beliefChanges: r.beliefChanges,
                    meanBelief: r.meanBelief,
                    beliefStd: r.beliefStd,
                    converged: r.converged,
                  }));
              }
              return allRounds.map(r => ({
                round: r.round,
                beliefs: r.beliefs,
                beliefChanges: r.beliefChanges,
                meanBelief: r.meanBelief,
                beliefStd: r.beliefStd,
                converged: r.converged,
              }));
            })(),
            beliefShift: interaction.beliefShift,
            consensusFormed: interaction.consensusFormed,
            polarizationIncreased: interaction.polarizationIncreased,
            socialProfiles: interaction.socialProfiles.map(p => ({
              agentId: p.agentId,
              alpha: p.alpha,
              visibleAgentIds: p.visibleAgentIds,
            })),
          } : null,
          metrics: {
            consensusScore: metrics.consensusScore,
            polarizationScore: metrics.polarizationScore,
            fragilityScore: metrics.fragilityScore,
            stateLabel: metrics.stateLabel,
            stateInterpretation: metrics.stateInterpretation,
          },
          comparison: comparison ?? undefined,
          timeline,  // 🆕 v9.5.1: 连续推演时间线
          // 🆕 v9.5.2: 动态权重扩展
          dynamicWeights: enableDynamicWeights ? {
            enabled: true,
            activeModes: dynamicWeightResult?.activeModes ?? [],
            modeDetails: dynamicWeightResult?.modeDetails ?? {
              panic: { triggered: false, reasons: [] },
              policy: { triggered: false, reasons: [] },
              value: { triggered: false, reasons: [] },
            },
            adjustments: dynamicWeightResult?.adjustments ?? {},
            dynamicConsensus: dynamicConsensus ?? v9Result.finalDecision.consensus,
          } : {
            enabled: false,
            activeModes: [],
            modeDetails: {
              panic: { triggered: false, reasons: [] },
              policy: { triggered: false, reasons: [] },
              value: { triggered: false, reasons: [] },
            },
            adjustments: {},
          },
        };

        return NextResponse.json(
          {
            success: true,
            version: "v9.5",
            data: {
              news: v9Result.news,
              factorVector: v9Result.rounds[0]?.factorVector,
              rounds: v9Result.rounds.map(r => ({
                round: r.round,
                consensus: r.decision.consensus,
                direction: r.decision.direction,
                confidence: r.decision.confidence,
                beliefStd: r.decision.beliefStd,
                neutralTrace: r.decision.neutralTrace,
                agents: Object.fromEntries(
                  Object.entries(r.agents).map(([id, state]) => [
                    id,
                    {
                      belief: state.belief,
                      confidence: state.confidence,
                      visibleFactors: state.visibleFactors?.map(f => f.category),
                      interpretation: state.interpretation,
                    },
                  ])
                ),
              })),
              final: {
                consensus: v9Result.finalDecision.consensus,
                direction: v9Result.finalDecision.direction,
                confidence: v9Result.finalDecision.confidence,
                beliefStd: v9Result.finalDecision.beliefStd,
                neutralTrace: v9Result.finalDecision.neutralTrace,
              },
              ablationMetrics: v9Result.ablationMetrics,
              // 🆕 v9.5.2: V 型反弹路由仲裁结果
              routing: {
                finalDirection: routingDirection,
                decision: routingDecision,
                classifierLabel,
                consensusRaw: v9Result.finalDecision.consensus,
              },
              diagnostics: v9Result.diagnostics,
              // 🆕 v9.5 扩展
              v9_5,
              // v9.5 Agent info for visualization
              v9_5Agents: v9Agents.map(a => ({
                id: a.id,
                name: a.name,
                emoji: a.emoji,
                role: a.role,
              })),
            },
            rateLimit: {
              remaining: rateLimitResult.remaining,
              resetTime: rateLimitResult.resetTime,
            },
          },
          {
            headers: {
              'X-RateLimit-Remaining': String(rateLimitResult.remaining),
              'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
            },
          }
        );
      } catch (v9Error) {
        console.error("[V9] 引擎失败:", v9Error);
        // 🆕 v9.5.1: DEMO_MODE 下使用预计算兜底数据
        if (process.env.DEMO_MODE === "true") {
          console.log("[V9] 🛡️ DEMO_MODE: 返回预计算兜底响应");
          return NextResponse.json(FALLBACK_RESPONSE, {
            headers: {
              "X-RateLimit-Remaining": String(rateLimitResult.remaining),
              "X-RateLimit-Reset": rateLimitResult.resetTime.toISOString(),
              "X-Demo-Fallback": "true",
            },
          });
        }
        return NextResponse.json(
          {
            success: false,
            error: "v9.3 引擎运行失败",
            code: "V9_ERROR",
            suggestion: "请检查输入参数或稍后重试",
            details: v9Error instanceof Error ? v9Error.message : "未知错误",
          },
          { status: 500 }
        );
      }
    }

    // ── v5.0 路径: 信息不对称 Agent 群 ──
    console.log(`[API] 启动信息不对称 Agent 群...`);
    const asymmetricResult = await runAsymmetricSwarm(news, config, rounds || 2);

    // 兼容旧接口：构建 result 对象（用新的共识覆盖）
    const result = {
      rounds: asymmetricResult.rounds.map(r => ({
        round: r.round,
        agents: r.agents,
        consensus: r.consensus,
        variance: 0,
      })),
      final: {
        consensus: asymmetricResult.finalConsensus,
        direction: asymmetricResult.finalConsensus > 10 ? "up" : asymmetricResult.finalConsensus < -10 ? "down" : "neutral",
        converged: asymmetricResult.rounds.length >= 2,
        total_rounds: asymmetricResult.rounds.length,
      },
    };

    // 6. 混合预测 — 校准为主 + LLM 辅助
    let hybridResult: HybridPredictionResult | null = null;
    let retailSignal: { emotion: number; greedFear: string } | null = null;
    let dataSourceLabel = "INFERRED";
    let marketParams: { vix: number; rsi: number; dropMagnitude: number; volatility: number; volumeSpike: number; sectorRotation: number; yieldCurveSpread: number; goldMomentum: number; oilMomentum: number } | null = null;

    try {
      // 6a. 获取市场参数 — 优先真实数据，失败降级为推断
      let params: ReturnType<typeof inferMarketParams> & { dataSource?: string };

      const realParams = await fetchRealMarketParams(news);
      if (realParams) {
        params = {
          vix: realParams.vix,
          rsi: realParams.rsi,
          dropMagnitude: realParams.dropMagnitude,
          volatility: realParams.volatility,
          volumeSpike: realParams.volumeSpike,
          sectorRotation: realParams.sectorRotation,
          yieldCurveSpread: realParams.yieldCurveSpread,
          goldMomentum: realParams.goldMomentum,
          oilMomentum: realParams.oilMomentum,
          hasPolicyResponse: realParams.hasPolicyResponse,
          hasCentralBankAction: realParams.hasCentralBankAction,
          knownVulnerabilities: realParams.knownVulnerabilities,
          dataSource: "YAHOO_FINANCE",
        };
        dataSourceLabel = "YAHOO_FINANCE";
      } else {
        params = { ...inferMarketParams(news), dataSource: "INFERRED" };
      }

      marketParams = {
        vix: params.vix, rsi: params.rsi, dropMagnitude: params.dropMagnitude,
        volatility: (params as any).volatility ?? 0.015,
        volumeSpike: (params as any).volumeSpike ?? 1.0,
        sectorRotation: (params as any).sectorRotation ?? 0,
        yieldCurveSpread: (params as any).yieldCurveSpread ?? -0.5,
        goldMomentum: (params as any).goldMomentum ?? 0,
        oilMomentum: (params as any).oilMomentum ?? 0,
      };
      console.log(`[API] Market data source: ${dataSourceLabel}`);

      // 6b. 构建 MarketState
      const basePrice = 3000;
      const dropRatio = params.dropMagnitude / 100;
      const marketState: MarketState = {
        price: basePrice * (1 - dropRatio),
        previousPrice: basePrice,
        priceHistory: [basePrice],
        volume: params.dropMagnitude > 5 ? 3e9 : 1.5e9,
        vix: params.vix,
        rsi: params.rsi,
        macd: -dropRatio * 50,
        macdSignal: -dropRatio * 40,
        momentum: -dropRatio * 10,
        volatility: params.volatility,
        sentiment: Math.max(-100, Math.min(100, -params.dropMagnitude * 2.5)),
      };

      // 6c. 运行校准系统
      const calibrated = calibratePrediction(marketState.sentiment, marketState);

      const calibrationPred: CalibrationPrediction = {
        prediction: calibrated.calibratedPrediction,
        confidence: calibrated.confidence,
        direction: calibrated.direction,
        source: "v4.0",
        reasoning: calibrated.reasoning,
      };

      // 6d1. 30 散户情绪层（v5.0 新增）— 与核心 Agent 并行
      try {
        const retailOutput = await runRetailLayer(
          news,
          result.final.consensus,
          -params.dropMagnitude / 100,  // price change rate
          marketState.price,
          config  // pass LLM config for API call
        );
        retailSignal = {
          emotion: retailOutput.retailEmotionSignal,
          greedFear: retailOutput.greedFearIndex,
        };
        console.log(`[Retail] 散户情绪: ${retailOutput.greedFearIndex} (${retailOutput.networkDiffusedSentiment}/100) → 信号: ${retailSignal.emotion}`);
      } catch (e) {
        console.warn("[Retail] 散户层跳过:", (e as Error).message);
      }

      // 6d2. LLM 输入（融合核心 Agent + 散户情绪）
      const blendedConsensus = retailSignal
        ? result.final.consensus * 0.7 + retailSignal.emotion * 0.3  // 70% 核心 + 30% 散户
        : result.final.consensus;

      const llmInput: LLMPredictionInput = {
        consensus: Math.round(blendedConsensus),
        direction: blendedConsensus > 10 ? "up" : blendedConsensus < -10 ? "down" : "neutral",
        converged: result.final.converged,
        totalRounds: result.final.total_rounds,
        roundDetails: result.rounds.map(r => ({
          round: r.round,
          consensus: r.consensus,
          variance: r.variance,
        })),
      };

      // 6e. 混合预测（校准优先）
      hybridResult = hybridPredict(
        calibrationPred,
        llmInput,
        marketState,
        {
          newsText: news,
          dropMagnitude: params.dropMagnitude,
          hasPolicyResponse: params.hasPolicyResponse,
          hasCentralBankAction: params.hasCentralBankAction,
          knownVulnerabilities: params.knownVulnerabilities,
        }
      );

      console.log(
        `[Calibration] 预测: ${calibrated.calibratedPrediction} (${calibrated.direction}) 理由: ${calibrated.reasoning.slice(0, 2).join("; ")}`
      );
      console.log(
        `[Hybrid] 最终: ${hybridResult.prediction} (${hybridResult.direction}) 质量: ${hybridResult.qualityScore}/100`
      );
    } catch (hybridError) {
      console.error("[Hybrid] 混合预测失败:", hybridError);
    }

    // 7. 返回响应
    return NextResponse.json(
      {
        success: true,
        data: result,
        // 新增：简化混合预测
        hybrid: hybridResult ? {
          prediction: hybridResult.prediction,
          direction: hybridResult.direction,
          confidence: hybridResult.confidence,
          calibration: hybridResult.calibration,
          llm: hybridResult.llm,
          crisisType: hybridResult.crisisAssessment?.type ?? null,
          vRecoveryProbability: hybridResult.crisisAssessment?.vRecoveryProbability ?? null,
          reasoning: hybridResult.reasoning,
          qualityScore: hybridResult.qualityScore,
          warnings: hybridResult.warnings,
        } : null,
        // v5.0: 集成层信号
        retail: retailSignal ? {
          emotion: retailSignal.emotion,
          greedFearIndex: retailSignal.greedFear,
        } : null,
        marketData: marketParams ? {
          source: dataSourceLabel,
          vix: marketParams.vix,
          rsi: marketParams.rsi,
          dropMagnitude: marketParams.dropMagnitude,
        } : null,
        rateLimit: {
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime,
        },
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
        }
      }
    );
  } catch (error) {
    console.error("Swarm simulation error:", error);

    // 处理重试错误
    if (error instanceof RetryableError) {
      const lastError = error.originalError;
      if (lastError instanceof LLMError) {
        const { title, suggestion } = ERROR_MESSAGES[lastError.type];
        return NextResponse.json(
          {
            success: false,
            error: title,
            code: lastError.type,
            suggestion,
            details: lastError.message,
            retryable: lastError.isRetryable,
          },
          { status: lastError.type === LLMErrorType.AUTH_ERROR ? 401 : 500 }
        );
      }
    }

    // 处理 LLM 错误
    if (error instanceof LLMError) {
      const { title, suggestion } = ERROR_MESSAGES[error.type];
      return NextResponse.json(
        {
          success: false,
          error: title,
          code: error.type,
          suggestion,
          details: error.message,
          retryable: error.isRetryable,
        },
        { status: error.type === LLMErrorType.AUTH_ERROR ? 401 : 500 }
      );
    }

    // 处理验证错误
    if (error instanceof Error && error.message.startsWith('输入验证失败')) {
      return NextResponse.json(
        {
          success: false,
          error: "输入验证失败",
          code: "VALIDATION_ERROR",
          suggestion: "请检查输入参数",
          details: error.message,
        },
        { status: 400 }
      );
    }

    // 处理未知错误
    return NextResponse.json(
      {
        success: false,
        error: "服务内部错误",
        code: "INTERNAL_ERROR",
        suggestion: "请稍后重试或联系管理员",
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const clientId = getClientIdentifier(req);
  const rateLimitStatus = checkRateLimit(clientId, RATE_LIMIT_PRESETS.standard);

  return NextResponse.json({
    name: "SwarmAlpha API",
    version: "9.7.0",
    description: "复杂系统中的 AI 群体认知形成机制 — 金融市场作为实验平台. v9 正交五因子 + v9.5 社交互动 + v9.7 非线性共识",
    features: [
      // v5 features
      "5 Agent 信息不对称 LLM 共识推演",
      "30 散户 + 社交网络扩散",
      "技术指标分析 + ML 增强预测",
      "校准引擎 (4规则, 75%方向准确率)",
      "危机类型检测 (流动性/偿付/外部冲击/技术性)",
      // v6 features
      "v6: 8 Agent 涌现式市场共识",
      "v6: 影响力加权共识 + 资金流 + 价格形成",
      "v6: 动态市场Regime检测",
      "v6: 涌现行为诊断 (Herding/Panic/FOMO/Bubble)",
      // v9.5 features
      "v9.5: Agent 社交互动层 + 共识度量 (Consensus/Polarization/Fragility Score)",
      "v9.5.2: 🆕 动态权重引擎 (恐慌/政策/价值洼地 三模式级联自适应)",
    ],
    usage: {
      v9_withOptions: {
        method: "POST",
        body: {
          version: "v9",
          news: "string",
          rounds: "number (1-10)",
          enableDynamicWeights: "boolean (optional, default false)",
          disableInteraction: "boolean (optional)",
          ablation: "{ nonlinearMethod?, disablePolicyAgent?, disableUncertainty?, disableBlindness?, ... }",
        },
        description: "v9.7 正交五因子 + 社交互动 + 动态权重 + 非线性共识聚合 (群体认知实验平台)",
      },
      withMarketData: {
        method: "POST",
        body: {
          version: "v5|v6|v9",
          news: "string",
          rounds: "number",
          marketData: {
            vix: "number (optional)",
            rsi: "number (optional)",
            dropMagnitude: "number (optional)",
            eventCategory: "string (optional)",
            policyResponseSpeed: "string (optional)",
          },
        },
        description: "提供真实市场数据获得更准确的分类和预测",
      },
    },
    calibrationEngine: {
      version: "4.0.0",
      description: "基于中性基线+逆向指标+危机分类的精简校准器",
      rules: [
        "中性基线 — 不预设恐慌",
        "超卖=买入 — RSI<30是逆向信号",
        "恐慌极值 — VIX>40+RSI<30往往是底部",
        "危机分类 — 流动性危机≠偿付危机",
      ],
      validatedAccuracy: "75% (6/8 全新事件严格回测)",
    },
    rateLimit: {
      windowMs: RATE_LIMIT_PRESETS.standard.windowMs,
      maxRequests: RATE_LIMIT_PRESETS.standard.maxRequests,
      remaining: rateLimitStatus.remaining,
      resetTime: rateLimitStatus.resetTime,
    },
    supportedProviders: ["openai", "anthropic", "deepseek", "local"],
    supportedModels: {
      openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
      anthropic: ["claude-3-haiku-20240307", "claude-3-sonnet-20240229"],
      deepseek: ["deepseek-chat", "deepseek-reasoner"],
      local: ["llama3", "mistral", "qwen2"],
    },
  });
}
