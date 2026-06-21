/**
 * 金融数据获取模块
 * 
 * 功能：
 * 1. 模拟历史股票数据
 * 2. 生成测试数据集
 * 3. 数据验证和清洗
 */

import { PriceData } from './technical';

export interface StockData {
  symbol: string;
  name: string;
  prices: PriceData[];
  lastPrice: number;
  change: number;
  changePercent: number;
}

// 常见股票列表
export const STOCK_UNIVERSE = [
  { symbol: '000001', name: '平安银行' },
  { symbol: '000002', name: '万科A' },
  { symbol: '600000', name: '浦发银行' },
  { symbol: '600036', name: '招商银行' },
  { symbol: '600519', name: '贵州茅台' },
  { symbol: '601318', name: '中国平安' },
  { symbol: '601398', name: '工商银行' },
  { symbol: '601857', name: '中国石油' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '002594', name: '比亚迪' },
];

/**
 * 生成模拟股票数据
 */
export function generateMockPriceData(
  basePrice: number = 100,
  days: number = 120,
  volatility: number = 0.02
): PriceData[] {
  const prices: PriceData[] = [];
  let currentPrice = basePrice;
  const startDate = Date.now() - days * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < days; i++) {
    // 生成随机价格变动
    const change = (Math.random() - 0.5) * 2 * volatility * currentPrice;
    currentPrice = Math.max(currentPrice * 0.5, currentPrice + change);
    
    // 生成 OHLC
    const dayVolatility = currentPrice * volatility * (0.5 + Math.random());
    const open = currentPrice + (Math.random() - 0.5) * dayVolatility;
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * dayVolatility;
    const low = Math.min(open, close) - Math.random() * dayVolatility;
    
    // 生成成交量
    const baseVolume = 1000000;
    const volume = baseVolume * (0.5 + Math.random() * 1.5);
    
    prices.push({
      timestamp: startDate + i * 24 * 60 * 60 * 1000,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
    });
  }
  
  return prices;
}

/**
 * 生成特定市场环境的股票数据
 */
export function generateMarketConditionData(
  condition: 'bull' | 'bear' | 'sideways' | 'volatile' | 'blackSwan',
  basePrice: number = 100,
  days: number = 120
): PriceData[] {
  const prices: PriceData[] = [];
  let currentPrice = basePrice;
  const startDate = Date.now() - days * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < days; i++) {
    let changePercent: number;
    let volatility: number;
    
    switch (condition) {
      case 'bull':
        // 牛市：持续上涨
        changePercent = 0.005 + Math.random() * 0.01; // 0.5% - 1.5% 上涨
        volatility = 0.015;
        break;
        
      case 'bear':
        // 熊市：持续下跌
        changePercent = -0.005 - Math.random() * 0.01; // 0.5% - 1.5% 下跌
        volatility = 0.02;
        break;
        
      case 'sideways':
        // 震荡：上下波动
        changePercent = (Math.random() - 0.5) * 0.01; // -0.5% - 0.5%
        volatility = 0.012;
        break;
        
      case 'volatile':
        // 高波动：剧烈波动
        changePercent = (Math.random() - 0.5) * 0.04; // -2% - 2%
        volatility = 0.03;
        break;
        
      case 'blackSwan':
        // 黑天鹅：先平稳，突然暴跌
        if (i < days * 0.8) {
          changePercent = (Math.random() - 0.5) * 0.005;
          volatility = 0.01;
        } else {
          // 最后 20% 时间发生暴跌
          changePercent = -0.03 - Math.random() * 0.05;
          volatility = 0.05;
        }
        break;
        
      default:
        changePercent = (Math.random() - 0.5) * 0.01;
        volatility = 0.02;
    }
    
    currentPrice = currentPrice * (1 + changePercent);
    currentPrice = Math.max(currentPrice * 0.3, currentPrice);
    
    const dayVolatility = currentPrice * volatility * (0.5 + Math.random());
    const open = currentPrice + (Math.random() - 0.5) * dayVolatility;
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * dayVolatility;
    const low = Math.min(open, close) - Math.random() * dayVolatility;
    
    const baseVolume = 1000000;
    const volume = baseVolume * (0.5 + Math.random() * 2);
    
    prices.push({
      timestamp: startDate + i * 24 * 60 * 60 * 1000,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
    });
  }
  
  return prices;
}

/**
 * 提取收盘价序列
 */
export function extractClosePrices(prices: PriceData[]): number[] {
  return prices.map(p => p.close);
}

/**
 * 提取成交量序列
 */
export function extractVolumes(prices: PriceData[]): number[] {
  return prices.map(p => p.volume);
}

/**
 * 计算涨跌幅
 */
export function calculateChange(prices: PriceData[]): { change: number; changePercent: number } {
  if (prices.length < 2) {
    return { change: 0, changePercent: 0 };
  }
  
  const latest = prices[prices.length - 1].close;
  const previous = prices[prices.length - 2].close;
  const change = latest - previous;
  const changePercent = (change / previous) * 100;
  
  return {
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
  };
}

/**
 * 数据验证
 */
export function validatePriceData(data: PriceData[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (data.length === 0) {
    errors.push('数据为空');
    return { valid: false, errors };
  }
  
  // 检查必要字段
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    
    if (typeof p.timestamp !== 'number') {
      errors.push(`行 ${i}: timestamp 缺失或无效`);
    }
    
    if (typeof p.open !== 'number' || p.open <= 0) {
      errors.push(`行 ${i}: open 价格无效`);
    }
    
    if (typeof p.high !== 'number' || p.high <= 0) {
      errors.push(`行 ${i}: high 价格无效`);
    }
    
    if (typeof p.low !== 'number' || p.low <= 0) {
      errors.push(`行 ${i}: low 价格无效`);
    }
    
    if (typeof p.close !== 'number' || p.close <= 0) {
      errors.push(`行 ${i}: close 价格无效`);
    }
    
    if (typeof p.volume !== 'number' || p.volume < 0) {
      errors.push(`行 ${i}: volume 无效`);
    }
    
    // 检查 OHLC 关系
    if (p.high < p.low) {
      errors.push(`行 ${i}: high < low`);
    }
    
    if (p.high < p.open || p.high < p.close) {
      errors.push(`行 ${i}: high < open 或 close`);
    }
    
    if (p.low > p.open || p.low > p.close) {
      errors.push(`行 ${i}: low > open 或 close`);
    }
  }
  
  // 检查时间序列
  for (let i = 1; i < data.length; i++) {
    if (data[i].timestamp <= data[i - 1].timestamp) {
      errors.push(`行 ${i}: timestamp 未递增`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 数据清洗
 */
export function cleanPriceData(data: PriceData[]): PriceData[] {
  const cleaned: PriceData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    
    // 修复 OHLC 关系
    const fixed: PriceData = {
      ...p,
      high: Math.max(p.high, p.open, p.close),
      low: Math.min(p.low, p.open, p.close),
    };
    
    // 过滤异常值（价格变化超过50%）
    if (i > 0) {
      const changePercent = Math.abs((p.close - data[i - 1].close) / data[i - 1].close);
      if (changePercent > 0.5) {
        // 跳过极端异常值
        continue;
      }
    }
    
    cleaned.push(fixed);
  }
  
  return cleaned;
}

/**
 * 获取模拟股票数据
 */
export function getMockStockData(
  symbol: string,
  condition: 'bull' | 'bear' | 'sideways' | 'volatile' | 'blackSwan' = 'sideways'
): StockData {
  const stock = STOCK_UNIVERSE.find(s => s.symbol === symbol) || {
    symbol,
    name: symbol,
  };
  
  const basePrice = 50 + Math.random() * 150;
  const prices = generateMarketConditionData(condition, basePrice, 120);
  const { change, changePercent } = calculateChange(prices);
  
  return {
    symbol: stock.symbol,
    name: stock.name,
    prices,
    lastPrice: prices[prices.length - 1].close,
    change,
    changePercent,
  };
}

/**
 * 生成技术分析摘要
 */
export function generateTechnicalSummary(data: StockData): string {
  const lines: string[] = [];
  
  lines.push(`📈 **${data.name} (${data.symbol})**`);
  lines.push('');
  lines.push(`当前价格: ¥${data.lastPrice.toFixed(2)}`);
  lines.push(`今日涨跌: ${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)`);
  lines.push('');
  lines.push(`数据点数: ${data.prices.length}`);
  lines.push(`时间范围: ${new Date(data.prices[0].timestamp).toLocaleDateString()} - ${new Date(data.prices[data.prices.length - 1].timestamp).toLocaleDateString()}`);
  
  return lines.join('\n');
}
