/**
 * 技术指标上下文生成器
 * 
 * 将技术指标转换为 Agent 可理解的上下文信息
 */

import {
  TechnicalIndicators,
  TechnicalSignal,
  generateTechnicalSignals,
  formatIndicators,
  PriceData,
  calculateAllIndicators,
} from './technical';

export interface TechnicalContext {
  summary: string;
  signals: TechnicalSignal[];
  bullishSignals: number;
  bearishSignals: number;
  overallBias: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  warnings: string[];
}

/**
 * 生成技术分析上下文
 */
export function generateTechnicalContext(
  prices: number[],
  volumes: number[] = []
): TechnicalContext {
  const indicators = calculateAllIndicators(prices, volumes);
  const signals = generateTechnicalSignals(prices, volumes);
  
  // 统计信号
  const bullishSignals = signals.filter(s => s.signal === 'buy').length;
  const bearishSignals = signals.filter(s => s.signal === 'sell').length;
  
  // 计算总体偏向
  let overallBias: 'bullish' | 'bearish' | 'neutral';
  const totalSignals = bullishSignals + bearishSignals;
  
  if (totalSignals === 0) {
    overallBias = 'neutral';
  } else if (bullishSignals > bearishSignals * 1.5) {
    overallBias = 'bullish';
  } else if (bearishSignals > bullishSignals * 1.5) {
    overallBias = 'bearish';
  } else {
    overallBias = 'neutral';
  }
  
  // 计算置信度
  const signalStrength = signals.reduce((sum, s) => sum + s.strength, 0);
  const confidence = Math.min(1, signalStrength / 3); // 归一化到 0-1
  
  // 生成警告
  const warnings: string[] = [];
  
  // RSI 超买超卖警告
  if (indicators.rsi.overbought) {
    warnings.push('⚠️ RSI 处于超买区域，注意回调风险');
  } else if (indicators.rsi.oversold) {
    warnings.push('⚠️ RSI 处于超卖区域，关注反弹机会');
  }
  
  // 布林带警告
  if (indicators.bollingerBands.position > 0.9) {
    warnings.push('⚠️ 价格逼近布林带上轨，警惕回调');
  } else if (indicators.bollingerBands.position < 0.1) {
    warnings.push('⚠️ 价格逼近布林带下轨，关注支撑');
  }
  
  // 成交量警告
  if (indicators.volumeAnalysis.volumeRatio > 2) {
    warnings.push('⚠️ 成交量异常放大，谨慎追涨');
  } else if (indicators.volumeAnalysis.volumeRatio < 0.5) {
    warnings.push('⚠️ 成交量极度萎缩，可能变盘在即');
  }
  
  // 高波动警告
  if (indicators.bollingerBands.bandwidth > 0.1) {
    warnings.push('⚠️ 布林带开口扩大，市场波动加剧');
  }
  
  // 生成摘要
  const summary = generateSummary(indicators, signals, overallBias);
  
  return {
    summary,
    signals,
    bullishSignals,
    bearishSignals,
    overallBias,
    confidence,
    warnings,
  };
}

/**
 * 生成技术分析摘要
 */
function generateSummary(
  indicators: TechnicalIndicators,
  signals: TechnicalSignal[],
  bias: 'bullish' | 'bearish' | 'neutral'
): string {
  const lines: string[] = [];
  
  // 标题
  lines.push('## 📊 技术指标综合分析\n');
  
  // 趋势判断
  const trendEmoji = bias === 'bullish' ? '🐂' : bias === 'bearish' ? '🐻' : '➡️';
  const trendText = bias === 'bullish' ? '看多' : bias === 'bearish' ? '看空' : '中性';
  lines.push(`**市场趋势**: ${trendEmoji} ${trendText}`);
  lines.push(`**信号强度**: ${(indicators.strength * 100).toFixed(0)}%`);
  lines.push(`**置信度**: ${(indicators.strength * 100).toFixed(0)}%\n`);
  
  // 关键指标
  lines.push('**核心指标:**');
  lines.push(`- RSI(14): ${indicators.rsi.value.toFixed(2)} ${indicators.rsi.oversold ? '(超卖)' : indicators.rsi.overbought ? '(超买)' : ''}`);
  lines.push(`- MACD: ${indicators.macd.histogram >= 0 ? '🔴' : '🟢'} ${indicators.macd.histogram.toFixed(2)}`);
  lines.push(`- KDJ: K=${indicators.kdj.k.toFixed(1)}, D=${indicators.kdj.d.toFixed(1)} ${indicators.kdj.crossover === 'bullish' ? '(金叉)' : indicators.kdj.crossover === 'bearish' ? '(死叉)' : ''}`);
  lines.push(`- 布林带位置: ${(indicators.bollingerBands.position * 100).toFixed(0)}%\n`);
  
  // 信号统计
  const buySignals = signals.filter(s => s.signal === 'buy');
  const sellSignals = signals.filter(s => s.signal === 'sell');
  
  lines.push('**技术信号:**');
  lines.push(`- 买入信号: ${buySignals.length} 个`);
  lines.push(`- 卖出信号: ${sellSignals.length} 个\n`);
  
  // 重要信号详情
  if (buySignals.length > 0) {
    lines.push('**强势买入信号:**');
    buySignals
      .filter(s => s.strength >= 0.7)
      .forEach(s => {
        lines.push(`- ${s.indicator}: ${s.description}`);
      });
    lines.push('');
  }
  
  if (sellSignals.length > 0) {
    lines.push('**警示卖出信号:**');
    sellSignals
      .filter(s => s.strength >= 0.7)
      .forEach(s => {
        lines.push(`- ${s.indicator}: ${s.description}`);
      });
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 生成简化的技术指标摘要（用于 Agent Prompt）
 */
export function generateBriefTechnicalSummary(
  prices: number[],
  volumes: number[] = []
): string {
  const context = generateTechnicalContext(prices, volumes);
  
  const lines: string[] = [];
  
  lines.push('## 📈 技术面分析\n');
  
  // 趋势判断
  const trendEmoji = context.overallBias === 'bullish' ? '🐂' : context.overallBias === 'bearish' ? '🐻' : '➡️';
  lines.push(`当前趋势: ${trendEmoji} ${context.overallBias === 'bullish' ? '偏多' : context.overallBias === 'bearish' ? '偏空' : '中性'}`);
  lines.push(`技术信号: ${context.bullishSignals} 个看多 vs ${context.bearishSignals} 个看空`);
  lines.push('');
  
  // 关键信号
  if (context.signals.length > 0) {
    lines.push('重要信号:');
    context.signals
      .filter(s => s.strength >= 0.6)
      .slice(0, 3)
      .forEach(s => {
        const emoji = s.signal === 'buy' ? '✅' : s.signal === 'sell' ? '❌' : '➡️';
        lines.push(`${emoji} ${s.indicator}: ${s.description}`);
      });
    lines.push('');
  }
  
  // 风险提示
  context.warnings.forEach(w => {
    lines.push(w);
  });
  
  return lines.join('\n');
}

/**
 * 为 Agent 生成完整的技术分析上下文
 */
export function generateAgentTechnicalContext(
  prices: number[],
  volumes: number[] = [],
  includeDetails: boolean = false
): string {
  const briefSummary = generateBriefTechnicalSummary(prices, volumes);
  
  if (includeDetails) {
    const indicators = calculateAllIndicators(prices, volumes);
    const detailedAnalysis = formatIndicators(indicators);
    return `${briefSummary}\n\n${detailedAnalysis}`;
  }
  
  return briefSummary;
}

/**
 * 计算技术面情绪调整值 (-10 到 +10)
 */
export function calculateTechnicalSentiment(
  prices: number[],
  volumes: number[] = []
): number {
  const context = generateTechnicalContext(prices, volumes);
  
  // 将信号强度转换为情绪值
  let sentiment = 0;
  
  // 基于趋势
  if (context.overallBias === 'bullish') {
    sentiment += 5;
  } else if (context.overallBias === 'bearish') {
    sentiment -= 5;
  }
  
  // 基于信号数量
  const signalDiff = context.bullishSignals - context.bearishSignals;
  sentiment += Math.max(-3, Math.min(3, signalDiff * 0.5));
  
  // 基于置信度
  sentiment *= (0.5 + context.confidence * 0.5);
  
  return Math.round(sentiment * 10) / 10;
}

/**
 * 生成技术面决策建议
 */
export interface TechnicalAdvice {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasons: string[];
  risks: string[];
}

export function generateTechnicalAdvice(
  prices: number[],
  volumes: number[] = []
): TechnicalAdvice {
  const context = generateTechnicalContext(prices, volumes);
  
  const reasons: string[] = [];
  const risks: string[] = [];
  
  // 分析买入理由
  context.signals
    .filter(s => s.signal === 'buy' && s.strength >= 0.6)
    .forEach(s => {
      reasons.push(s.description);
    });
  
  // 分析风险
  context.warnings.forEach(w => {
    risks.push(w);
  });
  
  // 判断操作
  let action: 'buy' | 'sell' | 'hold';
  let confidence: number;
  
  if (context.bullishSignals >= 3 && context.bearishSignals <= 1) {
    action = 'buy';
    confidence = Math.min(0.9, 0.5 + context.confidence);
  } else if (context.bearishSignals >= 3 && context.bullishSignals <= 1) {
    action = 'sell';
    confidence = Math.min(0.9, 0.5 + context.confidence);
  } else {
    action = 'hold';
    confidence = 0.4 + context.confidence * 0.3;
  }
  
  return {
    action,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    risks,
  };
}
