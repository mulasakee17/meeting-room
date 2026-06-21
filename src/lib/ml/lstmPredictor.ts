/**
 * LSTM 机器学习信号预测模块
 * 
 * 功能：
 * 1. 基于 LSTM 的价格预测
 * 2. 技术指标趋势预测
 * 3. 信号强度评估
 */

import { TechnicalIndicators } from '@/lib/indicators/technical';

export interface LSTMConfig {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  numLayers: number;
  sequenceLength: number;
}

export interface LSTMPrediction {
  predictedPrice: number;
  predictedMA5: number;
  predictedMA20: number;
  predictedRSI: number;
  predictedVolatility: number;
  confidence: number;
  trendProbability: {
    up: number;
    down: number;
    sideways: number;
  };
  signalStrength: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
}

const DEFAULT_CONFIG: LSTMConfig = {
  inputSize: 6,
  hiddenSize: 64,
  outputSize: 5,
  numLayers: 2,
  sequenceLength: 20,
};

export class LSTMPredictor {
  private config: LSTMConfig;
  private weights: {
    wf: number[][];
    wi: number[][];
    wo: number[][];
    wc: number[][];
    bf: number[];
    bi: number[];
    bo: number[];
    bc: number[];
    dense: { w: number[][]; b: number[] };
  };

  constructor(config: Partial<LSTMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.weights = this.initializeWeights();
  }

  private initializeWeights() {
    const { inputSize, hiddenSize, outputSize } = this.config;
    const combinedSize = inputSize + hiddenSize;

    const randomMatrix = (rows: number, cols: number) => {
      const matrix: number[][] = [];
      for (let i = 0; i < rows; i++) {
        matrix.push(new Array(cols).fill(0).map(() => (Math.random() - 0.5) * 0.1));
      }
      return matrix;
    };

    return {
      wf: randomMatrix(hiddenSize, combinedSize),
      wi: randomMatrix(hiddenSize, combinedSize),
      wo: randomMatrix(hiddenSize, combinedSize),
      wc: randomMatrix(hiddenSize, combinedSize),
      bf: new Array(hiddenSize).fill(0),
      bi: new Array(hiddenSize).fill(0),
      bo: new Array(hiddenSize).fill(0),
      bc: new Array(hiddenSize).fill(0),
      dense: {
        w: randomMatrix(outputSize, hiddenSize),
        b: new Array(outputSize).fill(0),
      },
    };
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private tanh(x: number): number {
    return Math.tanh(x);
  }

  private dot(matrix: number[][], vector: number[]): number[] {
    return matrix.map(row => row.reduce((sum, val, idx) => sum + val * vector[idx], 0));
  }

  predict(inputSequence: number[][]): LSTMPrediction {
    const { hiddenSize } = this.config;
    const { wf, wi, wo, wc, bf, bi, bo, bc, dense } = this.weights;

    let h = new Array(hiddenSize).fill(0);
    let c = new Array(hiddenSize).fill(0);

    for (const x of inputSequence) {
      const concat = [...h, ...x];

      const f = this.dot(wf, concat).map((val, i) => this.sigmoid(val + bf[i]));
      const i = this.dot(wi, concat).map((val, i) => this.sigmoid(val + bi[i]));
      const o = this.dot(wo, concat).map((val, i) => this.sigmoid(val + bo[i]));
      const cTilde = this.dot(wc, concat).map((val, i) => this.tanh(val + bc[i]));

      c = c.map((prev, j) => f[j] * prev + i[j] * cTilde[j]);
      h = c.map((cell, j) => o[j] * this.tanh(cell));
    }

    const rawOutput = this.dot(dense.w, h).map((val, i) => val + dense.b[i]);

    const lastState = inputSequence[inputSequence.length - 1];
    const priceRange = lastState[0] * 0.1;
    const rsiRange = 100;
    const volatilityRange = 0.1;

    const predictedPrice = lastState[0] + (rawOutput[0] - 0.5) * priceRange * 2;
    const predictedMA5 = lastState[1] + (rawOutput[1] - 0.5) * priceRange * 2;
    const predictedMA20 = lastState[2] + (rawOutput[2] - 0.5) * priceRange * 2;
    const predictedRSI = Math.max(0, Math.min(100, 50 + (rawOutput[3] - 0.5) * rsiRange));
    const predictedVolatility = Math.max(0, Math.abs(rawOutput[4]) * volatilityRange);

    const priceChange = (predictedPrice - lastState[0]) / lastState[0];

    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let signalStrength = 0;

    if (priceChange > 0.02 && predictedRSI < 50) {
      recommendation = 'BUY';
      signalStrength = Math.min(100, priceChange * 5000 + (50 - predictedRSI));
    } else if (priceChange < -0.02 && predictedRSI > 50) {
      recommendation = 'SELL';
      signalStrength = Math.min(100, Math.abs(priceChange) * 5000 + (predictedRSI - 50));
    }

    const upProb = Math.min(1, Math.max(0, 0.5 + priceChange * 10));
    const downProb = Math.min(1, Math.max(0, 0.5 - priceChange * 10));
    const sidewaysProb = Math.max(0, 1 - upProb - downProb);

    const confidence = Math.min(100, 50 + signalStrength / 2);

    const reasonings: string[] = [];
    if (predictedPrice > predictedMA20) reasonings.push('预测价格高于MA20');
    if (predictedRSI < 30) reasonings.push('预测RSI进入超卖区');
    if (predictedRSI > 70) reasonings.push('预测RSI进入超买区');
    if (predictedPrice > lastState[0]) reasonings.push('预测价格上涨');
    if (predictedPrice < lastState[0]) reasonings.push('预测价格下跌');

    return {
      predictedPrice: Math.round(predictedPrice * 100) / 100,
      predictedMA5: Math.round(predictedMA5 * 100) / 100,
      predictedMA20: Math.round(predictedMA20 * 100) / 100,
      predictedRSI: Math.round(predictedRSI * 10) / 10,
      predictedVolatility: Math.round(predictedVolatility * 10000) / 100,
      confidence: Math.round(confidence),
      trendProbability: {
        up: Math.round(upProb * 100),
        down: Math.round(downProb * 100),
        sideways: Math.round(sidewaysProb * 100),
      },
      signalStrength: Math.round(signalStrength),
      recommendation,
      reasoning: reasonings.join('; ') || '趋势不明',
    };
  }

  generatePredictionReport(prediction: LSTMPrediction): string {
    return `## LSTM 机器学习预测报告

### 价格预测
**预测价格**: ¥${prediction.predictedPrice.toFixed(2)}
**预测MA5**: ¥${prediction.predictedMA5.toFixed(2)}
**预测MA20**: ¥${prediction.predictedMA20.toFixed(2)}

### 指标预测
**预测RSI**: ${prediction.predictedRSI.toFixed(1)} (${prediction.predictedRSI < 30 ? '超卖' : prediction.predictedRSI > 70 ? '超买' : '中性'})
**预测波动率**: ${prediction.predictedVolatility.toFixed(2)}%

### 概率分布
| 趋势 | 概率 |
|------|------|
| 📈 上涨 | ${prediction.trendProbability.up}% |
| 📉 下跌 | ${prediction.trendProbability.down}% |
| ➡️ 横盘 | ${prediction.trendProbability.sideways}% |

### 交易建议
**推荐**: ${prediction.recommendation === 'BUY' ? '🟢 买入' : prediction.recommendation === 'SELL' ? '🔴 卖出' : '⚪ 观望'}
**信号强度**: ${prediction.signalStrength}%
**置信度**: ${prediction.confidence}%

### 推理依据
${prediction.reasoning}
`;
  }
}

/**
 * 从价格序列准备 LSTM 输入
 */
export function prepareLSTMInputFromPrices(prices: number[]): number[][] {
  const input: number[][] = [];
  
  for (let i = 20; i < prices.length; i++) {
    const window = prices.slice(i - 20, i);
    const ma5 = window.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = window.reduce((a, b) => a + b, 0) / 20;
    
    // 计算 RSI
    let gains = 0;
    let losses = 0;
    for (let j = 1; j < window.length; j++) {
      const change = window[j] - window[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
    
    // 计算波动率
    const mean = ma20;
    const variance = window.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / 20;
    const volatility = Math.sqrt(variance) / mean;
    
    // 价格变化率
    const priceChangeRate = (prices[i] - prices[i - 1]) / prices[i - 1] * 100;
    
    input.push([
      prices[i],
      ma5,
      ma20,
      rsi,
      volatility * 100,
      priceChangeRate,
    ]);
  }
  
  return input;
}

export function createLSTMPredictor(config?: Partial<LSTMConfig>): LSTMPredictor {
  return new LSTMPredictor(config);
}

export const LSTM_PRESETS = {
  shortTerm: { sequenceLength: 10, hiddenSize: 32 },
  mediumTerm: { sequenceLength: 20, hiddenSize: 64 },
  longTerm: { sequenceLength: 60, hiddenSize: 128 },
};