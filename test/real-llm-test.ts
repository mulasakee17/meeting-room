/**
 * 使用真实DeepSeek API进行测试
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { calibratePrediction } from "../src/lib/calibration/predictionCalibrator";
import { hybridPredict } from "../src/lib/calibration/hybridPredictor";
import { callLLM, LLMConfig } from "../src/lib/llm/providers";

async function runTest() {
  const eventName = "2020年新冠疫情暴跌";
  const peakPrice = 3386;
  const eventPrice = 2386;
  const dropFromPeak = ((peakPrice - eventPrice) / peakPrice) * 100;

  console.log(`测试事件: ${eventName}`);
  console.log(`跌幅: ${dropFromPeak.toFixed(1)}%`);
  console.log("=".repeat(60));

  const marketState = {
    price: eventPrice,
    previousPrice: eventPrice * 0.99,
    priceHistory: [eventPrice * 1.1, eventPrice * 1.08, eventPrice * 1.05, eventPrice * 1.02, eventPrice],
    volume: 5e9 * 4,
    vix: 82,
    rsi: 10,
    macd: -30,
    macdSignal: -25,
    momentum: -dropFromPeak,
    volatility: 0.025,
    sentiment: -dropFromPeak * 2,
  };

  const calResult = calibratePrediction(-dropFromPeak * 2, marketState);
  console.log("\n【校准器预测】");
  console.log(`预测值: ${calResult.calibratedPrediction.toFixed(1)}`);
  console.log(`方向: ${calResult.direction}`);
  console.log(`置信度: ${calResult.confidence}%`);

  console.log("\n【真实LLM分析】");
  const newsText = "新冠疫情全球爆发，标普500四次熔断，各国央行紧急降息，美联储推出无限QE政策";

  const systemPrompt = `你是一个专业的金融市场分析师。请分析以下新闻事件对股市的影响，并输出JSON格式结果：
  {
    "emotion": -100到100之间的数字，表示市场情绪（负数看空，正数看多）,
    "reasoning": "分析理由（中文）"
  }`;

  const userPrompt = `分析以下新闻对股市的影响：${newsText}`;

  try {
    const llmConfig: LLMConfig = {
      provider: "deepseek",
      model: "deepseek-chat",
    };

    const llmResult = await callLLM(systemPrompt, userPrompt, llmConfig);
    console.log(`LLM情绪值: ${llmResult.emotion}`);
    console.log(`LLM分析: ${llmResult.reasoning.slice(0, 100)}...`);

    const llmInput = {
      consensus: llmResult.emotion,
      direction: llmResult.emotion > 0 ? "up" : llmResult.emotion < 0 ? "down" : "neutral",
      converged: true,
      totalRounds: 5,
    };

    const crisisParams = {
      newsText: newsText,
      dropMagnitude: dropFromPeak,
      hasPolicyResponse: true,
      hasCentralBankAction: true,
      knownVulnerabilities: [],
    };

    const hybridResult = hybridPredict(
      {
        prediction: calResult.calibratedPrediction,
        confidence: calResult.confidence,
        direction: calResult.direction,
        source: "calibration",
        reasoning: calResult.reasoning,
      },
      llmInput,
      marketState,
      crisisParams
    );

    console.log("\n【混合预测结果】");
    console.log(`最终预测: ${hybridResult.prediction.toFixed(1)}`);
    console.log(`预测方向: ${hybridResult.direction}`);
    console.log(`实际结果: up（反弹50%）`);
    console.log(`预测准确: ${hybridResult.direction === "up" ? "✅" : "❌"}`);
    
  } catch (error: any) {
    console.error("LLM调用失败:", error.message);
    console.log("请检查DEEPSEEK_API_KEY配置是否正确");
  }
}

runTest();