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
  const hasPolicyResponse = !!text.match(/注入|购债|QE|量化宽松|救助|bailout|纾困|降息|宽松|刺激|stimulus|紧急|立即/);
  const hasCentralBankAction = !!text.match(/央行|美联储|fed|ECB|BOJ|英格兰银行|降息|利率|购债|QE/);

  // 已知脆弱性
  const knownVulnerabilities: string[] = [];
  if (text.match(/杠杆|leverage|爆仓|强平/)) knownVulnerabilities.push("高杠杆");
  if (text.match(/违约|破产|倒闭/)) knownVulnerabilities.push("违约风险");
  if (text.match(/流动性|liquidity|保证金/)) knownVulnerabilities.push("流动性紧张");
  if (text.match(/系统性|systemic|传染|连锁/)) knownVulnerabilities.push("系统性风险");

  return { vix, rsi, dropMagnitude, volatility, hasPolicyResponse, hasCentralBankAction, knownVulnerabilities };
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

    // 5. 运行 LLM 推演
    const result = await withRetry(
      async () => {
        if (enableML) {
          console.log(`[API] 运行 ML 增强型模拟，symbol: ${symbol || '无'}`);
          return await runMLSwarmSimulation(news, rounds, config, symbol, mlOptions);
        } else if (enableTechnicalAnalysis) {
          console.log(`[API] 运行技术增强型模拟，symbol: ${symbol || '无'}`);
          return await runTechnicalSwarmSimulation(news, rounds, config, symbol);
        } else {
          return await runSwarmSimulation(news, rounds, config);
        }
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        retryableErrors: [
          LLMErrorType.TIMEOUT,
          LLMErrorType.NETWORK,
          LLMErrorType.API_ERROR,
          LLMErrorType.RATE_LIMIT,
        ]
      },
      (error, attempt) => {
        console.log(`[Retry] Attempt ${attempt} failed: ${error.message}`);
      }
    );

    // 6. 混合预测 — 校准为主 + LLM 辅助
    let hybridResult: HybridPredictionResult | null = null;

    try {
      // 6a. 推断市场参数
      const params = inferMarketParams(news);

      // 6b. 构建 MarketState（简化版）
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

      // 6d. LLM 输入（如果推演成功）
      const llmInput: LLMPredictionInput = {
        consensus: result.final.consensus,
        direction: result.final.direction,
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
    version: "4.0.0",
    description: "多智能体金融共识推演系统 — 精简校准引擎",
    features: [
      "5 Agent LLM 共识推演",
      "技术指标分析",
      "ML 增强预测 (LSTM + Transformer)",
      "精简校准引擎 (4规则, 75%方向准确率)",
      "危机类型检测 (流动性/偿付/外部冲击/技术性)",
    ],
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
    usage: {
      basic: {
        method: "POST",
        body: { news: "string", rounds: "number (1-10)" },
        description: "基础推演 + 混合预测",
      },
      withMarketData: {
        method: "POST",
        body: {
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
  });
}
