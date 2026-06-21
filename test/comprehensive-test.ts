/**
 * 全方位测试 - 测试所有核心功能模块
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { calibratePrediction } from "../src/lib/calibration/predictionCalibrator";
import { hybridPredict } from "../src/lib/calibration/hybridPredictor";
import { callLLM, LLMConfig } from "../src/lib/llm/providers";

// 测试事件数据
const testEvents = [
  {
    name: "1987年黑色星期一",
    peakPrice: 2746,
    eventPrice: 2016,
    vix: 150,
    rsi: 8,
    volumeMultiplier: 6,
    actualDirection: "up" as const,
    news: "道琼斯指数单日暴跌22.6%，历史最大单日跌幅",
  },
  {
    name: "2008年金融危机雷曼倒闭",
    peakPrice: 1450,
    eventPrice: 1160,
    vix: 40,
    rsi: 18,
    volumeMultiplier: 3,
    actualDirection: "up" as const,
    news: "雷曼兄弟破产触发全球金融危机",
  },
  {
    name: "2020年新冠疫情暴跌",
    peakPrice: 3386,
    eventPrice: 2386,
    vix: 82,
    rsi: 10,
    volumeMultiplier: 4,
    actualDirection: "up" as const,
    news: "新冠疫情全球爆发，标普500四次熔断",
  },
  {
    name: "2000年互联网泡沫破裂",
    peakPrice: 5048,
    eventPrice: 3321,
    vix: 35,
    rsi: 20,
    volumeMultiplier: 2.5,
    actualDirection: "down" as const,
    news: "纳斯达克单日暴跌9.7%，互联网泡沫开始破裂",
  },
  {
    name: "2022年俄乌冲突",
    peakPrice: 4800,
    eventPrice: 4200,
    vix: 38,
    rsi: 25,
    volumeMultiplier: 2.5,
    actualDirection: "down" as const,
    news: "俄罗斯入侵乌克兰，全球市场暴跌",
  },
];

const systemPrompt = `你是一个专业的金融市场分析师。请分析以下新闻事件对股市的影响，并输出JSON格式结果：
{
  "emotion": -100到100之间的数字，表示市场情绪（负数看空，正数看多）,
  "reasoning": "分析理由（中文）"
}`;

async function runAllTests() {
  console.log("=".repeat(80));
  console.log("          SwarmAlpha 全方位测试");
  console.log("=".repeat(80));
  console.log();

  let totalCorrect = 0;
  let calibrationCorrect = 0;
  let llmCorrect = 0;
  let hybridCorrect = 0;

  for (const event of testEvents) {
    console.log(`📊 测试事件: ${event.name}`);
    console.log("-".repeat(60));

    const dropFromPeak = ((event.peakPrice - event.eventPrice) / event.peakPrice) * 100;

    // 创建市场状态
    const marketState = {
      price: event.eventPrice,
      previousPrice: event.eventPrice * 0.99,
      priceHistory: [event.eventPrice * 1.1, event.eventPrice * 1.08, event.eventPrice * 1.05, event.eventPrice * 1.02, event.eventPrice],
      volume: 5e9 * event.volumeMultiplier,
      vix: event.vix,
      rsi: event.rsi,
      macd: event.rsi < 30 ? -30 : 10,
      macdSignal: event.rsi < 30 ? -25 : 8,
      momentum: -dropFromPeak,
      volatility: 0.025,
      sentiment: -dropFromPeak * 2,
    };

    // 1. 校准器测试
    const calResult = calibratePrediction(-dropFromPeak * 2, marketState);
    const calCorrect = calResult.direction === event.actualDirection;
    calibrationCorrect += calCorrect ? 1 : 0;

    console.log(`1. 校准器预测:`);
    console.log(`   预测值: ${calResult.calibratedPrediction.toFixed(1)}`);
    console.log(`   方向: ${calResult.direction}`);
    console.log(`   置信度: ${calResult.confidence}%`);
    console.log(`   准确: ${calCorrect ? "✅" : "❌"}`);

    // 2. 真实LLM测试
    let llmResult, llmCorrectTemp = false;
    try {
      const llmConfig: LLMConfig = { provider: "deepseek", model: "deepseek-chat" };
      llmResult = await callLLM(systemPrompt, `分析以下新闻对股市的影响：${event.news}`, llmConfig);
      const llmDirection = llmResult.emotion > 0 ? "up" : llmResult.emotion < 0 ? "down" : "neutral";
      llmCorrectTemp = llmDirection === event.actualDirection;
      llmCorrect += llmCorrectTemp ? 1 : 0;

      console.log(`\n2. LLM预测:`);
      console.log(`   情绪值: ${llmResult.emotion}`);
      console.log(`   方向: ${llmDirection}`);
      console.log(`   分析: ${llmResult.reasoning.slice(0, 80)}...`);
      console.log(`   准确: ${llmCorrectTemp ? "✅" : "❌"}`);
    } catch (error) {
      console.log(`\n2. LLM预测: ❌ 调用失败 - ${(error as Error).message}`);
      llmResult = null;
    }

    // 3. 混合预测测试
    let hybridResult, hybridCorrectTemp = false;
    if (llmResult) {
      const llmInput = {
        consensus: llmResult.emotion,
        direction: llmResult.emotion > 0 ? "up" : llmResult.emotion < 0 ? "down" : "neutral",
        converged: true,
        totalRounds: 5,
      };

      const crisisParams = {
        newsText: event.news,
        dropMagnitude: dropFromPeak,
        hasPolicyResponse: true,
        hasCentralBankAction: true,
        knownVulnerabilities: [],
      };

      hybridResult = hybridPredict(
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

      hybridCorrectTemp = hybridResult.direction === event.actualDirection;
      hybridCorrect += hybridCorrectTemp ? 1 : 0;

      console.log(`\n3. 混合预测:`);
      console.log(`   预测值: ${hybridResult.prediction.toFixed(1)}`);
      console.log(`   方向: ${hybridResult.direction}`);
      console.log(`   准确: ${hybridCorrectTemp ? "✅" : "❌"}`);
    }

    // 4. 汇总
    const overallCorrect = hybridResult ? hybridCorrectTemp : calCorrect;
    totalCorrect += overallCorrect ? 1 : 0;

    console.log(`\n📈 实际结果: ${event.actualDirection}`);
    console.log(`   跌幅: ${dropFromPeak.toFixed(1)}% | VIX: ${event.vix} | RSI: ${event.rsi}`);
    console.log();
  }

  // 最终统计
  console.log("=".repeat(80));
  console.log("          测试结果汇总");
  console.log("=".repeat(80));
  console.log();
  console.log(`总测试事件: ${testEvents.length}`);
  console.log(`校准器准确率: ${calibrationCorrect}/${testEvents.length} (${((calibrationCorrect / testEvents.length) * 100).toFixed(1)}%)`);
  console.log(`LLM准确率: ${llmCorrect}/${testEvents.length} (${((llmCorrect / testEvents.length) * 100).toFixed(1)}%)`);
  console.log(`混合预测准确率: ${hybridCorrect}/${testEvents.length} (${((hybridCorrect / testEvents.length) * 100).toFixed(1)}%)`);
  console.log(`整体准确率: ${totalCorrect}/${testEvents.length} (${((totalCorrect / testEvents.length) * 100).toFixed(1)}%)`);
  console.log();
  console.log("=".repeat(80));
}

runAllTests();