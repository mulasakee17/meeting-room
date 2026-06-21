/**
 * 扩展版历史黑天鹅事件库
 * 
 * 包含更多历史事件，用于提高历史相似度匹配的准确性
 */

// ==================== 类型定义 ====================

export interface ExtendedBlackSwan {
  name: string;
  date: string;
  severity: 'catastrophic' | 'extreme' | 'high' | 'medium';
  category: 'financial' | 'geopolitical' | 'pandemic' | 'natural_disaster' | 'regulatory' | 'tech' | 'commodity';
  // 市场数据
  initialDrop: number;
  totalDrop: number;
  recoveryDays: number;
  // 技术指标
  vixPeak: number;
  rsiLow: number;
  rsiRecoveryDays: number;
  atrRatio: number; // ATR/价格的比率
  // 反弹特征
  reboundProbability: number;
  reboundMagnitude: number;
  reboundPattern: 'V型' | 'W型' | 'U型' | 'L型';
  // 成交量
  volumeSpikeRatio: number;
  volumePattern: '持续放大' | '脉冲式' | '萎缩';
  // 信号特征
  reversalPatterns: string[];
  leadingIndicators: string[];
  laggingIndicators: string[];
  // 政策响应
  policyResponse: 'strong' | 'moderate' | 'weak';
  policyDelay: number; // 政策响应延迟天数
}

// ==================== 扩展的历史事件库 ====================

export const EXTENDED_BLACK_SWAN_DATABASE: ExtendedBlackSwan[] = [
  // ============ 金融危机类 ============
  {
    name: '1987年黑色星期一',
    date: '1987-10-19',
    severity: 'catastrophic',
    category: 'financial',
    initialDrop: -22.6,
    totalDrop: -38.0,
    recoveryDays: 90,
    vixPeak: 150,
    rsiLow: 8,
    rsiRecoveryDays: 20,
    atrRatio: 0.08,
    reboundProbability: 0.85,
    reboundMagnitude: 12,
    reboundPattern: 'V型',
    volumeSpikeRatio: 5.5,
    volumePattern: '脉冲式',
    reversalPatterns: ['程序化止损', '程序化买入'],
    leadingIndicators: ['过度杠杆', '估值过高', '量化拥挤'],
    laggingIndicators: ['VIX暴涨', '成交量异常'],
    policyResponse: 'strong',
    policyDelay: 1,
  },
  {
    name: '2000年互联网泡沫破裂',
    date: '2000-03-10',
    severity: 'catastrophic',
    category: 'financial',
    initialDrop: -8.0,
    totalDrop: -78.0,
    recoveryDays: 2520, // 10年
    vixPeak: 45,
    rsiLow: 15,
    rsiRecoveryDays: 365,
    atrRatio: 0.03,
    reboundProbability: 0.25,
    reboundMagnitude: 5,
    reboundPattern: 'U型',
    volumeSpikeRatio: 2.5,
    volumePattern: '持续放大',
    reversalPatterns: ['估值回归', '基本面恶化'],
    leadingIndicators: ['市盈率过高', 'IPO狂热', '非理性繁荣'],
    laggingIndicators: ['业绩下滑', '盈利下调'],
    policyResponse: 'weak',
    policyDelay: 180,
  },
  {
    name: '2008年雷曼兄弟破产',
    date: '2008-09-15',
    severity: 'catastrophic',
    category: 'financial',
    initialDrop: -4.7,
    totalDrop: -56.8,
    recoveryDays: 1500, // 6年
    vixPeak: 80.86,
    rsiLow: 10,
    rsiRecoveryDays: 120,
    atrRatio: 0.06,
    reboundProbability: 0.35,
    reboundMagnitude: 10,
    reboundPattern: 'W型',
    volumeSpikeRatio: 4.2,
    volumePattern: '脉冲式',
    reversalPatterns: ['流动性危机', '信用紧缩'],
    leadingIndicators: ['次贷危机', '房地产泡沫', '过度杠杆'],
    laggingIndicators: ['银行倒闭', '信贷紧缩'],
    policyResponse: 'strong',
    policyDelay: 7,
  },
  {
    name: '2020年新冠疫情爆发',
    date: '2020-03-09',
    severity: 'catastrophic',
    category: 'pandemic',
    initialDrop: -12.9,
    totalDrop: -38.0,
    recoveryDays: 90,
    vixPeak: 82.69,
    rsiLow: 8,
    rsiRecoveryDays: 14,
    atrRatio: 0.05,
    reboundProbability: 0.70,
    reboundMagnitude: 15,
    reboundPattern: 'V型',
    volumeSpikeRatio: 4.2,
    volumePattern: '脉冲式',
    reversalPatterns: ['政策底', '流动性注入', '超跌反弹'],
    leadingIndicators: ['疫情扩散', '供应链中断'],
    laggingIndicators: ['VIX暴涨', 'RSI超卖'],
    policyResponse: 'strong',
    policyDelay: 3,
  },

  // ============ 地缘政治类 ============
  {
    name: '2022年俄乌战争爆发',
    date: '2022-02-24',
    severity: 'extreme',
    category: 'geopolitical',
    initialDrop: -4.6,
    totalDrop: -25.0,
    recoveryDays: 60,
    vixPeak: 37.5,
    rsiLow: 22,
    rsiRecoveryDays: 15,
    atrRatio: 0.025,
    reboundProbability: 0.75,
    reboundMagnitude: 8,
    reboundPattern: 'V型',
    volumeSpikeRatio: 2.8,
    volumePattern: '脉冲式',
    reversalPatterns: ['地缘缓和', '能源价格稳定'],
    leadingIndicators: ['地缘紧张', '能源危机'],
    laggingIndicators: ['股市下跌', '黄金上涨'],
    policyResponse: 'moderate',
    policyDelay: 14,
  },
  {
    name: '2001年911恐怖袭击',
    date: '2001-09-11',
    severity: 'extreme',
    category: 'geopolitical',
    initialDrop: -7.1,
    totalDrop: -15.0,
    recoveryDays: 30,
    vixPeak: 48,
    rsiLow: 18,
    rsiRecoveryDays: 10,
    atrRatio: 0.04,
    reboundProbability: 0.80,
    reboundMagnitude: 8,
    reboundPattern: 'V型',
    volumeSpikeRatio: 4.5,
    volumePattern: '脉冲式',
    reversalPatterns: ['政策响应', '爱国主义买盘'],
    leadingIndicators: ['地缘冲突升级'],
    laggingIndicators: ['VIX暴涨', '成交量异常'],
    policyResponse: 'strong',
    policyDelay: 1,
  },

  // ============ 市场技术故障类 ============
  {
    name: '2010年闪电崩盘',
    date: '2010-05-06',
    severity: 'extreme',
    category: 'financial',
    initialDrop: -9.2,
    totalDrop: -9.2,
    recoveryDays: 1,
    vixPeak: 40,
    rsiLow: 20,
    rsiRecoveryDays: 1,
    atrRatio: 0.035,
    reboundProbability: 0.90,
    reboundMagnitude: 5,
    reboundPattern: 'V型',
    volumeSpikeRatio: 3.5,
    volumePattern: '脉冲式',
    reversalPatterns: ['程序化反弹', '监管介入'],
    leadingIndicators: ['量化拥挤', '高频交易'],
    laggingIndicators: ['价格异动', '流动性枯竭'],
    policyResponse: 'strong',
    policyDelay: 0,
  },
  {
    name: '2024年日元套利交易崩盘',
    date: '2024-08-05',
    severity: 'extreme',
    category: 'financial',
    initialDrop: -6.5,
    totalDrop: -10.0,
    recoveryDays: 14,
    vixPeak: 65,
    rsiLow: 15,
    rsiRecoveryDays: 5,
    atrRatio: 0.045,
    reboundProbability: 0.65,
    reboundMagnitude: 6,
    reboundPattern: 'V型',
    volumeSpikeRatio: 3.8,
    volumePattern: '脉冲式',
    reversalPatterns: ['日元走弱', '套利平仓'],
    leadingIndicators: ['日元加息', '利差收窄'],
    laggingIndicators: ['VIX暴涨', '全球股市下跌'],
    policyResponse: 'moderate',
    policyDelay: 3,
  },

  // ============ 主权利好类 ============
  {
    name: '2011年美国主权降级',
    date: '2011-08-05',
    severity: 'extreme',
    category: 'regulatory',
    initialDrop: -6.5,
    totalDrop: -19.0,
    recoveryDays: 120,
    vixPeak: 48,
    rsiLow: 18,
    rsiRecoveryDays: 30,
    atrRatio: 0.035,
    reboundProbability: 0.60,
    reboundMagnitude: 8,
    reboundPattern: 'W型',
    volumeSpikeRatio: 3.2,
    volumePattern: '脉冲式',
    reversalPatterns: ['QE3推出', '政策宽松'],
    leadingIndicators: ['债务危机', '评级下调'],
    laggingIndicators: ['信用利差扩大'],
    policyResponse: 'strong',
    policyDelay: 14,
  },

  // ============ 中国市场特殊事件 ============
  {
    name: '2015年中国A股股灾',
    date: '2015-06-12',
    severity: 'catastrophic',
    category: 'financial',
    initialDrop: -8.5,
    totalDrop: -52.0,
    recoveryDays: 480, // 约2年
    vixPeak: 45,
    rsiLow: 12,
    rsiRecoveryDays: 90,
    atrRatio: 0.06,
    reboundProbability: 0.30,
    reboundMagnitude: 5,
    reboundPattern: 'L型',
    volumeSpikeRatio: 5.0,
    volumePattern: '持续放大',
    reversalPatterns: ['政策救市', '国家队入场'],
    leadingIndicators: ['杠杆泡沫', '估值过高', '场外配资'],
    laggingIndicators: ['强制平仓', '流动性枯竭'],
    policyResponse: 'strong',
    policyDelay: 30,
  },
  {
    name: '2015年人民币811汇改',
    date: '2015-08-11',
    severity: 'high',
    category: 'commodity',
    initialDrop: -6.0,
    totalDrop: -12.0,
    recoveryDays: 45,
    vixPeak: 35,
    rsiLow: 25,
    rsiRecoveryDays: 20,
    atrRatio: 0.02,
    reboundProbability: 0.55,
    reboundMagnitude: 4,
    reboundPattern: 'V型',
    volumeSpikeRatio: 2.5,
    volumePattern: '脉冲式',
    reversalPatterns: ['汇率稳定', '政策表态'],
    leadingIndicators: ['经济放缓', '资本外流'],
    laggingIndicators: ['汇率贬值', '外汇储备下降'],
    policyResponse: 'moderate',
    policyDelay: 7,
  },

  // ============ 其他极端事件 ============
  {
    name: '2023年硅谷银行倒闭',
    date: '2023-03-10',
    severity: 'high',
    category: 'financial',
    initialDrop: -4.6,
    totalDrop: -8.0,
    recoveryDays: 30,
    vixPeak: 32,
    rsiLow: 25,
    rsiRecoveryDays: 14,
    atrRatio: 0.02,
    reboundProbability: 0.80,
    reboundMagnitude: 6,
    reboundPattern: 'V型',
    volumeSpikeRatio: 2.8,
    volumePattern: '脉冲式',
    reversalPatterns: ['存款保险', '银行救助'],
    leadingIndicators: ['利率上升', '债券亏损'],
    laggingIndicators: ['银行股下跌', '流动性担忧'],
    policyResponse: 'strong',
    policyDelay: 3,
  },
  {
    name: '2020年负油价事件',
    date: '2020-04-20',
    severity: 'high',
    category: 'commodity',
    initialDrop: -35.0,
    totalDrop: -35.0,
    recoveryDays: 60,
    vixPeak: 40,
    rsiLow: 10,
    rsiRecoveryDays: 20,
    atrRatio: 0.08,
    reboundProbability: 0.85,
    reboundMagnitude: 20,
    reboundPattern: 'V型',
    volumeSpikeRatio: 6.0,
    volumePattern: '脉冲式',
    reversalPatterns: ['供需改善', '减产协议'],
    leadingIndicators: ['需求暴跌', '存储危机'],
    laggingIndicators: ['负价格', '期货合约崩盘'],
    policyResponse: 'moderate',
    policyDelay: 5,
  },
  {
    name: '2018年中美贸易战',
    date: '2018-07-06',
    severity: 'high',
    category: 'geopolitical',
    initialDrop: -2.5,
    totalDrop: -20.0,
    recoveryDays: 365,
    vixPeak: 28,
    rsiLow: 28,
    rsiRecoveryDays: 60,
    atrRatio: 0.015,
    reboundProbability: 0.45,
    reboundMagnitude: 5,
    reboundPattern: 'W型',
    volumeSpikeRatio: 2.2,
    volumePattern: '持续放大',
    reversalPatterns: ['贸易协议', '关税暂停'],
    leadingIndicators: ['贸易摩擦', '关税升级'],
    laggingIndicators: ['出口下降', '企业盈利下调'],
    policyResponse: 'weak',
    policyDelay: 60,
  },
  {
    name: '2011年日本大地震',
    date: '2011-03-11',
    severity: 'extreme',
    category: 'natural_disaster',
    initialDrop: -6.0,
    totalDrop: -20.0,
    recoveryDays: 90,
    vixPeak: 35,
    rsiLow: 22,
    rsiRecoveryDays: 25,
    atrRatio: 0.04,
    reboundProbability: 0.70,
    reboundMagnitude: 10,
    reboundPattern: 'V型',
    volumeSpikeRatio: 4.0,
    volumePattern: '脉冲式',
    reversalPatterns: ['重建需求', '政策支持'],
    leadingIndicators: ['地震海啸', '核危机'],
    laggingIndicators: ['供应链中断', '核泄漏'],
    policyResponse: 'strong',
    policyDelay: 7,
  },

  // ============ 科技行业特殊事件 ============
  {
    name: '2022年Meta暴跌',
    date: '2022-02-03',
    severity: 'high',
    category: 'tech',
    initialDrop: -26.4,
    totalDrop: -50.0,
    recoveryDays: 180,
    vixPeak: 30,
    rsiLow: 18,
    rsiRecoveryDays: 45,
    atrRatio: 0.035,
    reboundProbability: 0.55,
    reboundMagnitude: 15,
    reboundPattern: 'U型',
    volumeSpikeRatio: 3.5,
    volumePattern: '脉冲式',
    reversalPatterns: ['元宇宙故事', 'AI驱动'],
    leadingIndicators: ['用户增长停滞', '广告收入下滑'],
    laggingIndicators: ['财报失望', '估值重估'],
    policyResponse: 'weak',
    policyDelay: 30,
  },
  {
    name: '2023年ChatGPT引发的AI热潮',
    date: '2023-01-23',
    severity: 'medium',
    category: 'tech',
    initialDrop: 0,
    totalDrop: 0,
    recoveryDays: 0,
    vixPeak: 20,
    rsiLow: 50,
    rsiRecoveryDays: 0,
    atrRatio: 0.01,
    reboundProbability: 0.90,
    reboundMagnitude: 25,
    reboundPattern: 'V型',
    volumeSpikeRatio: 1.8,
    volumePattern: '持续放大',
    reversalPatterns: ['AI革命', '业绩兑现'],
    leadingIndicators: ['AI突破', '产品发布'],
    laggingIndicators: ['股价上涨', '估值提升'],
    policyResponse: 'moderate',
    policyDelay: 0,
  },
];

// ==================== 辅助函数 ====================

/**
 * 根据市场状态查找最相似的事件
 */
export function findMostSimilarEvent(
  marketState: {
    vix: number;
    rsi: number;
    volatility: number;
    volume: number;
    priceDrop?: number;
  },
  historicalEvents: ExtendedBlackSwan[] = EXTENDED_BLACK_SWAN_DATABASE
): {
  event: ExtendedBlackSwan;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
} {
  let bestMatch: ExtendedBlackSwan | null = null;
  let bestSimilarity = 0;

  for (const event of historicalEvents) {
    // 计算多维度相似度
    const vixSimilarity = calculateVIXSimilarity(marketState.vix, event.vixPeak);
    const rsiSimilarity = calculateRSISimilarity(marketState.rsi, event.rsiLow);
    const volatilitySimilarity = calculateVolatilitySimilarity(marketState.volatility, event.atrRatio);
    const volumeSimilarity = calculateVolumeSimilarity(marketState.volume, marketState.volume / 3, event.volumeSpikeRatio);

    // 加权平均
    const totalSimilarity = (
      vixSimilarity * 0.35 +
      rsiSimilarity * 0.30 +
      volatilitySimilarity * 0.20 +
      volumeSimilarity * 0.15
    );

    if (totalSimilarity > bestSimilarity) {
      bestSimilarity = totalSimilarity;
      bestMatch = event;
    }
  }

  // 确定置信度
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (bestSimilarity > 0.75) {
    confidence = 'high';
  } else if (bestSimilarity > 0.55) {
    confidence = 'medium';
  }

  return {
    event: bestMatch || EXTENDED_BLACK_SWAN_DATABASE[0], // 安全回退
    similarity: bestSimilarity,
    confidence,
  };
}

/**
 * 计算VIX相似度
 */
function calculateVIXSimilarity(currentVIX: number, eventVIX: number): number {
  if (currentVIX === 0 || eventVIX === 0) return 0.5;
  
  const ratio = Math.min(currentVIX, eventVIX) / Math.max(currentVIX, eventVIX);
  return Math.pow(ratio, 0.5); // 使用平方根增加差异敏感度
}

/**
 * 计算RSI相似度
 */
function calculateRSISimilarity(currentRSI: number, eventRSI: number): number {
  const diff = Math.abs(currentRSI - eventRSI);
  
  // RSI越低，相似度衰减越快
  if (diff <= 5) return 1.0;
  if (diff <= 10) return 0.85;
  if (diff <= 15) return 0.70;
  if (diff <= 20) return 0.55;
  if (diff <= 30) return 0.40;
  return 0.25;
}

/**
 * 计算波动率相似度
 */
function calculateVolatilitySimilarity(
  currentVolatility: number,
  eventATR: number
): number {
  if (currentVolatility === 0 || eventATR === 0) return 0.5;
  
  const ratio = Math.min(currentVolatility, eventATR) / Math.max(currentVolatility, eventATR);
  return ratio;
}

/**
 * 计算成交量相似度
 */
function calculateVolumeSimilarity(
  currentVolume: number,
  avgVolume: number,
  eventSpikeRatio: number
): number {
  if (currentVolume === 0 || avgVolume === 0) return 0.5;
  
  const currentSpikeRatio = currentVolume / avgVolume;
  const ratio = Math.min(currentSpikeRatio, eventSpikeRatio) / Math.max(currentSpikeRatio, eventSpikeRatio);
  return ratio;
}

/**
 * 根据相似事件预测反弹概率
 */
export function predictReboundFromSimilarEvents(
  marketState: {
    vix: number;
    rsi: number;
    volatility: number;
    volume: number;
  },
  daysSinceDrop: number
): {
  probability: number;
  magnitude: number;
  pattern: string;
  confidence: number;
} {
  const { event, similarity, confidence } = findMostSimilarEvent(marketState);

  // 基于相似度调整反弹概率
  const adjustedProbability = event.reboundProbability * similarity;
  
  // 基于时间衰减调整
  let timeDecay = 1.0;
  if (daysSinceDrop > event.recoveryDays) {
    // 超过历史恢复时间，降低反弹概率
    timeDecay = Math.max(0.5, 1 - (daysSinceDrop - event.recoveryDays) / event.recoveryDays);
  }

  return {
    probability: adjustedProbability * timeDecay,
    magnitude: event.reboundMagnitude * similarity,
    pattern: event.reboundPattern,
    confidence: similarity * (confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.7 : 0.5),
  };
}

/**
 * 获取事件分类的统计信息
 */
export function getEventCategoryStats(
  category: ExtendedBlackSwan['category']
): {
  count: number;
  avgRecoveryDays: number;
  avgReboundProbability: number;
  avgReboundMagnitude: number;
} {
  const events = EXTENDED_BLACK_SWAN_DATABASE.filter(e => e.category === category);
  
  if (events.length === 0) {
    return { count: 0, avgRecoveryDays: 0, avgReboundProbability: 0, avgReboundMagnitude: 0 };
  }

  const avgRecoveryDays = events.reduce((sum, e) => sum + e.recoveryDays, 0) / events.length;
  const avgReboundProbability = events.reduce((sum, e) => sum + e.reboundProbability, 0) / events.length;
  const avgReboundMagnitude = events.reduce((sum, e) => sum + e.reboundMagnitude, 0) / events.length;

  return {
    count: events.length,
    avgRecoveryDays,
    avgReboundProbability,
    avgReboundMagnitude,
  };
}

/**
 * 获取所有类别的统计摘要
 */
export function getCategorySummary(): Array<{
  category: ExtendedBlackSwan['category'];
  count: number;
  avgRecoveryDays: number;
  avgReboundProbability: number;
  avgReboundMagnitude: number;
}> {
  const categories: ExtendedBlackSwan['category'][] = [
    'financial',
    'geopolitical',
    'pandemic',
    'natural_disaster',
    'regulatory',
    'tech',
    'commodity',
  ];

  return categories.map(category => ({
    category,
    ...getEventCategoryStats(category),
  }));
}

// 导出
export type { ExtendedBlackSwan };
