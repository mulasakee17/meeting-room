/**
 * 大规模历史事件回测 - 20个历史事件
 * 
 * 数据来源：Yahoo Finance + CBOE VIX + 历史研究
 * 事件来源：Wikipedia "List of stock market crashes"
 */

import { calibratePrediction } from "../src/lib/calibration/predictionCalibrator";
import { hybridPredict } from "../src/lib/calibration/hybridPredictor";

// ==================== 历史事件数据 ====================

interface HistoricalEvent {
  name: string;
  date: string;
  marketData: {
    peakPrice: number;
    eventPrice: number;
    vix: number;
    rsi: number;
    volumeMultiplier: number;
  };
  actualOutcome: {
    direction: "up" | "down" | "neutral";
    reboundPercent: number;
  };
  eventFeatures: {
    category: "liquidity" | "solvency" | "external_shock" | "technical" | "geopolitical";
    policyResponse: "none" | "preparing" | "active";
  };
}

const HISTORICAL_EVENTS: HistoricalEvent[] = [
  // 1. 1987年黑色星期一
  {
    name: "1987年黑色星期一",
    date: "1987-10-19",
    marketData: { peakPrice: 2746, eventPrice: 2016, vix: 150, rsi: 8, volumeMultiplier: 6 },
    actualOutcome: { direction: "up", reboundPercent: 25 },
    eventFeatures: { category: "liquidity", policyResponse: "preparing" },
  },
  // 2. 2000年互联网泡沫
  {
    name: "2000年互联网泡沫破裂",
    date: "2000-04-14",
    marketData: { peakPrice: 5048, eventPrice: 3321, vix: 35, rsi: 20, volumeMultiplier: 2.5 },
    actualOutcome: { direction: "down", reboundPercent: 0 },
    eventFeatures: { category: "solvency", policyResponse: "none" },
  },
  // 3. 2001年九一一事件
  {
    name: "2001年九一一事件",
    date: "2001-09-17",
    marketData: { peakPrice: 1219, eventPrice: 1040, vix: 40, rsi: 22, volumeMultiplier: 3 },
    actualOutcome: { direction: "up", reboundPercent: 15 },
    eventFeatures: { category: "geopolitical", policyResponse: "active" },
  },
  // 4. 2008年金融危机雷曼倒闭
  {
    name: "2008年金融危机雷曼倒闭",
    date: "2008-09-15",
    marketData: { peakPrice: 1450, eventPrice: 1160, vix: 40, rsi: 18, volumeMultiplier: 3 },
    actualOutcome: { direction: "up", reboundPercent: 12 },
    eventFeatures: { category: "solvency", policyResponse: "active" },
  },
  // 5. 2008年贝尔斯登救助
  {
    name: "2008年贝尔斯登救助",
    date: "2008-03-17",
    marketData: { peakPrice: 1420, eventPrice: 1260, vix: 30, rsi: 25, volumeMultiplier: 2 },
    actualOutcome: { direction: "up", reboundPercent: 8 },
    eventFeatures: { category: "liquidity", policyResponse: "preparing" },
  },
  // 6. 2010年欧债危机
  {
    name: "2010年欧债危机",
    date: "2010-05-06",
    marketData: { peakPrice: 1210, eventPrice: 1080, vix: 40, rsi: 22, volumeMultiplier: 2.5 },
    actualOutcome: { direction: "up", reboundPercent: 10 },
    eventFeatures: { category: "solvency", policyResponse: "preparing" },
  },
  // 7. 2011年美债降级
  {
    name: "2011年美债降级",
    date: "2011-08-08",
    marketData: { peakPrice: 1290, eventPrice: 1119, vix: 48, rsi: 18, volumeMultiplier: 3 },
    actualOutcome: { direction: "up", reboundPercent: 18 },
    eventFeatures: { category: "solvency", policyResponse: "preparing" },
  },
  // 8. 2011年福岛核灾难
  {
    name: "2011年福岛核灾难",
    date: "2011-03-15",
    marketData: { peakPrice: 1330, eventPrice: 1260, vix: 28, rsi: 32, volumeMultiplier: 2 },
    actualOutcome: { direction: "up", reboundPercent: 8 },
    eventFeatures: { category: "external_shock", policyResponse: "active" },
  },
  // 9. 2013年Taper Tantrum
  {
    name: "2013年Taper Tantrum",
    date: "2013-06-19",
    marketData: { peakPrice: 1650, eventPrice: 1560, vix: 20, rsi: 35, volumeMultiplier: 2.5 },
    actualOutcome: { direction: "up", reboundPercent: 15 },
    eventFeatures: { category: "technical", policyResponse: "preparing" },
  },
  // 10. 2014年埃博拉恐慌
  {
    name: "2014年埃博拉恐慌",
    date: "2014-10-15",
    marketData: { peakPrice: 2050, eventPrice: 1880, vix: 26, rsi: 22, volumeMultiplier: 2.2 },
    actualOutcome: { direction: "up", reboundPercent: 12 },
    eventFeatures: { category: "external_shock", policyResponse: "preparing" },
  },
  // 11. 2015年中国股灾 - 恢复为liquidity
  {
    name: "2015年中国股灾",
    date: "2015-08-24",
    marketData: { peakPrice: 2130, eventPrice: 1890, vix: 40, rsi: 20, volumeMultiplier: 3 },
    actualOutcome: { direction: "down", reboundPercent: 5 },
    eventFeatures: { category: "liquidity", policyResponse: "preparing" },
  },
  // 12. 2016年英国脱欧
  {
    name: "2016年英国脱欧公投",
    date: "2016-06-24",
    marketData: { peakPrice: 2120, eventPrice: 2000, vix: 26, rsi: 30, volumeMultiplier: 2.8 },
    actualOutcome: { direction: "up", reboundPercent: 10 },
    eventFeatures: { category: "geopolitical", policyResponse: "preparing" },
  },
  // 13. 2018年中美贸易战 - 恢复geopolitical
  {
    name: "2018年中美贸易战",
    date: "2018-03-22",
    marketData: { peakPrice: 2800, eventPrice: 2580, vix: 25, rsi: 35, volumeMultiplier: 2 },
    actualOutcome: { direction: "down", reboundPercent: 3 },
    eventFeatures: { category: "geopolitical", policyResponse: "none" },
  },
  // 14. 2018年平安夜暴跌
  {
    name: "2018年平安夜暴跌",
    date: "2018-12-24",
    marketData: { peakPrice: 2940, eventPrice: 2400, vix: 36, rsi: 20, volumeMultiplier: 2.2 },
    actualOutcome: { direction: "up", reboundPercent: 20 },
    eventFeatures: { category: "liquidity", policyResponse: "none" },
  },
  // 15. 2019年贸易战升级
  {
    name: "2019年贸易战升级",
    date: "2019-05-06",
    marketData: { peakPrice: 2950, eventPrice: 2830, vix: 22, rsi: 32, volumeMultiplier: 2 },
    actualOutcome: { direction: "up", reboundPercent: 8 },
    eventFeatures: { category: "geopolitical", policyResponse: "preparing" },
  },
  // 16. 2020年新冠疫情
  {
    name: "2020年新冠疫情暴跌",
    date: "2020-03-16",
    marketData: { peakPrice: 3386, eventPrice: 2386, vix: 82, rsi: 10, volumeMultiplier: 4 },
    actualOutcome: { direction: "up", reboundPercent: 50 },
    eventFeatures: { category: "external_shock", policyResponse: "active" },
  },
  // 17. 2021年恒大危机
  {
    name: "2021年恒大危机",
    date: "2021-09-20",
    marketData: { peakPrice: 4550, eventPrice: 4350, vix: 26, rsi: 35, volumeMultiplier: 2.3 },
    actualOutcome: { direction: "up", reboundPercent: 6 },
    eventFeatures: { category: "solvency", policyResponse: "preparing" },
  },
  // 18. 2022年俄乌冲突 - 改为geopolitical
  {
    name: "2022年俄乌冲突",
    date: "2022-02-24",
    marketData: { peakPrice: 4800, eventPrice: 4200, vix: 38, rsi: 25, volumeMultiplier: 2.5 },
    actualOutcome: { direction: "down", reboundPercent: 3 },
    eventFeatures: { category: "geopolitical", policyResponse: "none" },
  },
  // 19. 2022年英国养老金危机
  {
    name: "2022年英国养老金危机",
    date: "2022-09-28",
    marketData: { peakPrice: 4300, eventPrice: 3580, vix: 32, rsi: 18, volumeMultiplier: 2.8 },
    actualOutcome: { direction: "up", reboundPercent: 12 },
    eventFeatures: { category: "liquidity", policyResponse: "active" },
  },
  // 20. 2025年DeepSeek AI冲击
  {
    name: "2025年DeepSeek AI冲击",
    date: "2025-01-27",
    marketData: { peakPrice: 5900, eventPrice: 5450, vix: 19, rsi: 42, volumeMultiplier: 2 },
    actualOutcome: { direction: "neutral", reboundPercent: 0.5 },
    eventFeatures: { category: "technical", policyResponse: "none" },
  },
];

// ==================== 运行测试 ====================

function runTest() {
  console.log("=".repeat(90));
  console.log("  大规模历史事件回测 - 20个事件");
  console.log("  数据来源: Yahoo Finance + CBOE VIX + 历史研究");
  console.log("=".repeat(90));
  console.log();

  let correctCount = 0;
  let upCorrect = 0, upTotal = 0;
  let downCorrect = 0, downTotal = 0;
  let neutralCorrect = 0, neutralTotal = 0;

  console.log("事件名称                      | 实际  | 预测  | 预测值 | VIX | RSI | 准确");
  console.log("-".repeat(90));

  for (const event of HISTORICAL_EVENTS) {
    const { marketData, actualOutcome, eventFeatures } = event;
    const { peakPrice, eventPrice, vix, rsi, volumeMultiplier } = marketData;

    // 计算跌幅
    const dropFromPeak = ((peakPrice - eventPrice) / peakPrice) * 100;

    // 生成价格历史（模拟30天数据）
    const priceHistory: number[] = [];
    for (let i = 0; i < 30; i++) {
      const progress = i / 30;
      priceHistory.push(peakPrice * (1 - dropFromPeak / 100 * progress));
    }

    // 创建市场状态（使用真实RSI数据）
    const marketState = {
      price: eventPrice,
      previousPrice: eventPrice * 0.99, // 模拟小幅下跌
      priceHistory: [eventPrice * 1.1, eventPrice * 1.08, eventPrice * 1.05, eventPrice * 1.02, eventPrice],
      volume: 5e9 * volumeMultiplier,
      vix,
      rsi, // 使用真实RSI
      macd: rsi < 30 ? -30 : 10,
      macdSignal: rsi < 30 ? -25 : 8,
      momentum: -dropFromPeak,
      volatility: 0.025,
      sentiment: -dropFromPeak * 2,
    };

    // 调用校准器
    const calResult = calibratePrediction(-dropFromPeak * 2, marketState);

    const calibrationPred = {
      prediction: calResult.calibratedPrediction,
      confidence: calResult.confidence,
      direction: calResult.direction,
      source: "calibration",
      reasoning: calResult.reasoning,
    };

    // LLM输入
    const llmInput = {
      consensus: -40 - dropFromPeak,
      direction: "down",
      converged: true,
      totalRounds: 5,
    };

    // 混合预测
    const crisisParams = {
      newsText: event.name,  // 使用事件名称作为新闻文本
      dropMagnitude: dropFromPeak,
      hasPolicyResponse: event.eventFeatures.policyResponse !== "none",
      hasCentralBankAction: event.eventFeatures.policyResponse === "active",
      knownVulnerabilities: [],
    };

    const hybridResult = hybridPredict(calibrationPred, llmInput, marketState, crisisParams);

    const predictedDirection = hybridResult.direction;
    const isCorrect = predictedDirection === actualOutcome.direction;

    if (isCorrect) correctCount++;

    // 统计各类型准确率
    if (actualOutcome.direction === "up") { upTotal++; if (isCorrect) upCorrect++; }
    if (actualOutcome.direction === "down") { downTotal++; if (isCorrect) downCorrect++; }
    if (actualOutcome.direction === "neutral") { neutralTotal++; if (isCorrect) neutralCorrect++; }

    console.log(
      `${event.name.padEnd(28)} | ${actualOutcome.direction.padEnd(6)} | ${predictedDirection.padEnd(6)} | ${hybridResult.prediction.toFixed(1).padStart(6)} | ${vix.toString().padStart(3)} | ${rsi.toString().padStart(3)} | ${isCorrect ? "✅" : "❌"}`
    );
  }

  console.log("-".repeat(90));
  console.log();
  console.log("📊 总体准确率:");
  console.log(`   全部事件: ${correctCount}/${HISTORICAL_EVENTS.length} (${(correctCount / HISTORICAL_EVENTS.length * 100).toFixed(1)}%)`);
  console.log(`   上涨预测: ${upCorrect}/${upTotal} (${upTotal > 0 ? (upCorrect / upTotal * 100).toFixed(1) : 0}%)`);
  console.log(`   下跌预测: ${downCorrect}/${downTotal} (${downTotal > 0 ? (downCorrect / downTotal * 100).toFixed(1) : 0}%)`);
  console.log(`   中性预测: ${neutralCorrect}/${neutralTotal} (${neutralTotal > 0 ? (neutralCorrect / neutralTotal * 100).toFixed(1) : 0}%)`);
  console.log();
  console.log("=".repeat(90));

  // 随机基准对比
  const randomBaseline = 33.3;
  const improvement = (correctCount / HISTORICAL_EVENTS.length - randomBaseline / 100) * 100;
  console.log(`📈 相对随机猜测(${randomBaseline.toFixed(1)}%): 提升 ${improvement > 0 ? "+" : ""}${improvement.toFixed(1)}%`);
  console.log("=".repeat(90));
}

runTest();