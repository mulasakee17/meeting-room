/**
 * ⚠️ STUB MODEL — 未经过训练的占位模型
 *
 * 此模块实现了标准的 LSTM 前向传播架构，但权重使用零初始化
 * （而非 Math.random()），原因:
 *   - 项目中没有训练数据管道
 *   - 没有预训练权重文件
 *   - 随机权重输出的预测值看起来"合理"但实际上毫无意义
 *
 * 当前行为: 所有预测返回"无变化"中性信号 (HOLD, confidence=0)
 * 用于保持 API 接口兼容性，同时明确标记预测不可靠。
 *
 * 未来计划:
 *   - ONNX Runtime 加载预训练模型
 *   - 或基于历史回测数据的增量训练
 *   - 或替换为简单的统计基线 (EWMA)
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
  /** ⚠️ 始终为 true — 此模型未训练 */
  isStubModel: true;
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
    if (typeof console !== 'undefined') {
      console.warn('[LSTM] ⚠️ STUB MODEL instantiated — 模型未训练, 预测不可靠。仅作 API 兼容占位。');
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.weights = this.initializeWeights();
  }

  /**
   * ⚠️ 零权重初始化 — STUB MODEL
   *
   * 所有权重初始化为 0。由于没有训练步骤，零权重确保:
   *   1. LSTM 前向传播输出始终为 0
   *   2. 预测结果 = "无变化" (中性信号)
   *   3. 不产生随机噪声伪装的"预测"
   *
   * 当加载预训练权重时，用 loadWeights() 替换。
   */
  private initializeWeights() {
    const { inputSize, hiddenSize, outputSize } = this.config;
    const combinedSize = inputSize + hiddenSize;

    const zeroMatrix = (rows: number, cols: number): number[][] => {
      const matrix: number[][] = [];
      for (let i = 0; i < rows; i++) {
        matrix.push(new Array(cols).fill(0));
      }
      return matrix;
    };

    return {
      wf: zeroMatrix(hiddenSize, combinedSize),
      wi: zeroMatrix(hiddenSize, combinedSize),
      wo: zeroMatrix(hiddenSize, combinedSize),
      wc: zeroMatrix(hiddenSize, combinedSize),
      bf: new Array(hiddenSize).fill(0),
      bi: new Array(hiddenSize).fill(0),
      bo: new Array(hiddenSize).fill(0),
      bc: new Array(hiddenSize).fill(0),
      dense: {
        w: zeroMatrix(outputSize, hiddenSize),
        b: new Array(outputSize).fill(0),
      },
    };
  }

  /** 加载预训练权重 (未来实现) */
  loadWeights(_weights: typeof this.weights): void {
    this.weights = _weights;
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
      isStubModel: true as const,
      predictedPrice: Math.round(predictedPrice * 100) / 100,
      predictedMA5: Math.round(predictedMA5 * 100) / 100,
      predictedMA20: Math.round(predictedMA20 * 100) / 100,
      predictedRSI: Math.round(predictedRSI * 10) / 10,
      predictedVolatility: Math.round(predictedVolatility * 10000) / 100,
      confidence: 0, // ⚠️ 未训练模型 — 置信度始终为 0
      trendProbability: {
        up: 33,
        down: 33,
        sideways: 34,
      },
      signalStrength: 0,
      recommendation: 'HOLD' as const,
      reasoning: '⚠️ STUB MODEL: 模型未训练, 预测不可靠。仅作 API 兼容占位。',
    };
  }

  generatePredictionReport(prediction: LSTMPrediction): string {
    return `## ⚠️ LSTM 预测报告 (STUB MODEL — 未训练)

> **警告: 此模型未经过训练, 所有权重为零。预测结果不可用于实际交易决策。**

### 预测详情

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