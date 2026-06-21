/**
 * 技术指标系统测试脚本
 */

import {
  calculateAllIndicators,
  generateTechnicalSignals,
  formatIndicators,
} from '../src/lib/indicators/technical';
import {
  generateTechnicalContext,
  generateBriefTechnicalSummary,
  calculateTechnicalSentiment,
  generateTechnicalAdvice,
} from '../src/lib/indicators/context';
import {
  generateMockPriceData,
  generateMarketConditionData,
  extractClosePrices,
  extractVolumes,
} from '../src/lib/indicators/marketData';

console.log('🧪 技术指标系统测试\n');

// 测试 1：正常市场数据
console.log('=' .repeat(50));
console.log('测试 1: 正常市场数据\n');

const normalPrices = generateMockPriceData(100, 120, 0.02);
const normalClosePrices = extractClosePrices(normalPrices);
const normalVolumes = extractVolumes(normalPrices);

const normalIndicators = calculateAllIndicators(normalClosePrices, normalVolumes);
console.log(formatIndicators(normalIndicators));

const normalSignals = generateTechnicalSignals(normalClosePrices, normalVolumes);
console.log('\n📊 生成的信号:');
normalSignals.forEach(signal => {
  const emoji = signal.signal === 'buy' ? '✅' : signal.signal === 'sell' ? '❌' : '➡️';
  console.log(`${emoji} ${signal.indicator}: ${signal.description} (强度: ${signal.strength})`);
});

const normalAdvice = generateTechnicalAdvice(normalClosePrices, normalVolumes);
console.log('\n💡 交易建议:');
console.log(`操作: ${normalAdvice.action.toUpperCase()}`);
console.log(`置信度: ${(normalAdvice.confidence * 100).toFixed(0)}%`);
console.log('理由:', normalAdvice.reasons);
console.log('风险:', normalAdvice.risks);

// 测试 2：牛市数据
console.log('\n' + '=' .repeat(50));
console.log('测试 2: 牛市市场数据\n');

const bullPrices = generateMarketConditionData('bull', 100, 120);
const bullClosePrices = extractClosePrices(bullPrices);
const bullIndicators = calculateAllIndicators(bullClosePrices);
console.log(`趋势: ${bullIndicators.trend}`);
console.log(`强度: ${(bullIndicators.strength * 100).toFixed(0)}%`);
console.log(`RSI: ${bullIndicators.rsi.value.toFixed(2)}`);

const bullContext = generateTechnicalContext(bullClosePrices);
console.log('\n📊 牛市分析:');
console.log(`买入信号: ${bullContext.bullishSignals} 个`);
console.log(`卖出信号: ${bullContext.bearishSignals} 个`);
console.log(`总体偏向: ${bullContext.overallBias}`);
console.log(`置信度: ${(bullContext.confidence * 100).toFixed(0)}%`);

// 测试 3：熊市数据
console.log('\n' + '=' .repeat(50));
console.log('测试 3: 熊市市场数据\n');

const bearPrices = generateMarketConditionData('bear', 100, 120);
const bearClosePrices = extractClosePrices(bearPrices);
const bearIndicators = calculateAllIndicators(bearClosePrices);
console.log(`趋势: ${bearIndicators.trend}`);
console.log(`强度: ${(bearIndicators.strength * 100).toFixed(0)}%`);
console.log(`RSI: ${bearIndicators.rsi.value.toFixed(2)}`);

const bearContext = generateTechnicalContext(bearClosePrices);
console.log('\n📊 熊市分析:');
console.log(`买入信号: ${bearContext.bullishSignals} 个`);
console.log(`卖出信号: ${bearContext.bearishSignals} 个`);
console.log(`总体偏向: ${bearContext.overallBias}`);

// 测试 4：黑天鹅事件
console.log('\n' + '=' .repeat(50));
console.log('测试 4: 黑天鹅事件数据\n');

const blackSwanPrices = generateMarketConditionData('blackSwan', 100, 120);
const blackSwanClosePrices = extractClosePrices(blackSwanPrices);
const blackSwanIndicators = calculateAllIndicators(blackSwanClosePrices);
console.log(`趋势: ${blackSwanIndicators.trend}`);
console.log(`强度: ${(blackSwanIndicators.strength * 100).toFixed(0)}%`);
console.log(`RSI: ${blackSwanIndicators.rsi.value.toFixed(2)}`);
console.log(`布林带宽度: ${blackSwanIndicators.bollingerBands.bandwidth.toFixed(4)}`);

const blackSwanContext = generateTechnicalContext(blackSwanClosePrices);
console.log('\n📊 黑天鹅分析:');
console.log(`买入信号: ${blackSwanContext.bullishSignals} 个`);
console.log(`卖出信号: ${blackSwanContext.bearishSignals} 个`);
console.log(`风险提示:`);
blackSwanContext.warnings.forEach(w => console.log(`  ${w}`));

// 测试 5：Agent 上下文生成
console.log('\n' + '=' .repeat(50));
console.log('测试 5: Agent 技术上下文生成\n');

const briefSummary = generateBriefTechnicalSummary(normalClosePrices, normalVolumes);
console.log(briefSummary);

// 测试 6：情绪值计算
console.log('\n' + '=' .repeat(50));
console.log('测试 6: 技术面情绪值计算\n');

const sentimentNormal = calculateTechnicalSentiment(normalClosePrices, normalVolumes);
const sentimentBull = calculateTechnicalSentiment(bullClosePrices);
const sentimentBear = calculateTechnicalSentiment(bearClosePrices);
const sentimentBlackSwan = calculateTechnicalSentiment(blackSwanClosePrices);

console.log(`正常市场情绪: ${sentimentNormal > 0 ? '+' : ''}${sentimentNormal.toFixed(1)}`);
console.log(`牛市情绪: ${sentimentBull > 0 ? '+' : ''}${sentimentBull.toFixed(1)}`);
console.log(`熊市情绪: ${sentimentBear > 0 ? '+' : ''}${sentimentBear.toFixed(1)}`);
console.log(`黑天鹅情绪: ${sentimentBlackSwan > 0 ? '+' : ''}${sentimentBlackSwan.toFixed(1)}`);

console.log('\n✅ 所有测试完成！\n');
