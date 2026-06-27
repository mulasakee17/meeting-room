/**
 * ⚠️ STUB MODEL — 未经过训练的占位模型
 *
 * 此模块实现了 TFT 多头注意力架构，但所有权重使用零初始化
 * （而非随机初始化），原因:
 *   - 项目中没有训练数据管道
 *   - 没有预训练权重文件
 *   - 随机权重输出的预测值看起来"合理"但实际上毫无意义
 *
 * 当前行为: 所有预测返回"无变化"中性信号 (confidence=0)
 * 用于保持 API 接口兼容性，同时明确标记预测不可靠。
 *
 * 未来计划:
 *   - ONNX Runtime 加载预训练模型
 *   - 或基于历史回测数据的增量训练
 *   - 或替换为简单的统计基线 (EWMA)
 */

export interface TransformerConfig {
  inputSize: number;
  hiddenSize: number;
  numLayers: number;
  numHeads: number;
  sequenceLength: number;
  forecastLength: number;
  dropout: number;
}

export interface TransformerPrediction {
  /** ⚠️ 始终为 true — 此模型未训练 */
  isStubModel: true;
  predictedPrice: number;
  priceRange: [number, number];
  upProbability: number;
  downProbability: number;
  confidence: number;
  indicators: PredictedIndicators;
}

export interface PredictedIndicators {
  ma5: number;
  ma20: number;
  rsi: number;
  volatility: number;
}

const DEFAULT_CONFIG: TransformerConfig = {
  inputSize: 6,
  hiddenSize: 128,
  numLayers: 3,
  numHeads: 4,
  sequenceLength: 60,
  forecastLength: 7,
  dropout: 0.1,
};

class MultiHeadAttention {
  private Wq: number[][];
  private Wk: number[][];
  private Wv: number[][];
  private Wo: number[][];
  private dk: number;

  constructor(inputSize: number, numHeads: number) {
    this.dk = Math.floor(inputSize / numHeads);
    
    this.Wq = this.initializeMatrix(inputSize, inputSize);
    this.Wk = this.initializeMatrix(inputSize, inputSize);
    this.Wv = this.initializeMatrix(inputSize, inputSize);
    this.Wo = this.initializeMatrix(inputSize, inputSize);
  }

  /** ⚠️ 零权重初始化 — STUB MODEL */
  private initializeMatrix(rows: number, cols: number): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < rows; i++) {
      matrix.push(new Array(cols).fill(0));
    }
    return matrix;
  }

  private matMul(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = B[0].length;
    const result: number[][] = [];
    for (let i = 0; i < rows; i++) {
      result.push(new Array(cols).fill(0));
      for (let j = 0; j < cols; j++) {
        for (let k = 0; k < B.length; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  private transpose(matrix: number[][]): number[][] {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result: number[][] = [];
    for (let i = 0; i < cols; i++) {
      result.push(new Array(rows).fill(0));
      for (let j = 0; j < rows; j++) {
        result[i][j] = matrix[j][i];
      }
    }
    return result;
  }

  private softmax(row: number[]): number[] {
    // 数值稳定性：减去最大值防止溢出
    const maxVal = Math.max(...row);
    const exp = row.map(x => Math.exp(x - maxVal));
    const sum = exp.reduce((a, b) => a + b, 0);
    // 防止除零
    if (sum === 0) {
      return row.map(() => 1 / row.length);
    }
    return exp.map(x => x / sum);
  }

  forward(Q: number[][], K: number[][], V: number[][]): number[][] {
    const Q_prime = this.matMul(Q, this.Wq);
    const K_prime = this.matMul(K, this.Wk);
    const V_prime = this.matMul(V, this.Wv);

    const scores = this.matMul(Q_prime, this.transpose(K_prime));
    const scaledScores = scores.map(row => row.map(x => x / Math.sqrt(this.dk)));
    
    const attention = scaledScores.map(this.softmax);
    const output = this.matMul(attention, V_prime);
    
    return this.matMul(output, this.Wo);
  }
}

class TransformerBlock {
  private attention: MultiHeadAttention;
  private hiddenSize: number;
  private dropout: number;

  constructor(hiddenSize: number, numHeads: number, dropout: number) {
    this.attention = new MultiHeadAttention(hiddenSize, numHeads);
    this.hiddenSize = hiddenSize;
    this.dropout = dropout;
  }

  private layerNorm(x: number[], eps: number = 1e-6): number[] {
    // NaN保护
    if (x.some(v => isNaN(v))) {
      return x.map(() => 0);
    }
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const variance = x.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / x.length;
    return x.map(val => (val - mean) / Math.sqrt(variance + eps));
  }

  /** ⚠️ 零权重 Feed-Forward — STUB MODEL */
  private feedForward(x: number[], hiddenSize: number): number[] {
    // NaN保护
    if (x.some(v => isNaN(v))) {
      return new Array(hiddenSize).fill(0);
    }
    // 零权重 → 输出始终为 0 (未训练)
    return new Array(hiddenSize).fill(0);
  }

  /** ⚠️ 前向传播 — STUB MODEL (dropout=1.0, 无随机性) */
  forward(x: number[][]): number[][] {
    const attentionOutput = this.attention.forward(x, x, x);

    const residual1 = x.map((row, i) =>
      row.map((val, j) => val + attentionOutput[i][j])
    );

    const norm1 = residual1.map(this.layerNorm);

    const ffOutput = norm1.map(row => this.feedForward(row, this.hiddenSize));

    const residual2 = norm1.map((row, i) =>
      row.map((val, j) => val + (ffOutput[i]?.[j] ?? 0))
    );

    return residual2.map(this.layerNorm);
  }
}

export class TransformerTimeSeries {
  private config: TransformerConfig;
  private blocks: TransformerBlock[];
  private projection: number[][];
  private embedding: number[][]; // 嵌入层：inputSize -> hiddenSize

  constructor(config: Partial<TransformerConfig> = {}) {
    if (typeof console !== 'undefined') {
      console.warn('[Transformer] ⚠️ STUB MODEL instantiated — 模型未训练, 预测不可靠。仅作 API 兼容占位。');
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.blocks = [];

    // 嵌入层：将输入从 inputSize 映射到 hiddenSize (零权重)
    this.embedding = this.initializeMatrix(this.config.inputSize, this.config.hiddenSize);
    
    for (let i = 0; i < this.config.numLayers; i++) {
      this.blocks.push(new TransformerBlock(
        this.config.hiddenSize,
        this.config.numHeads,
        this.config.dropout
      ));
    }

    this.projection = this.initializeMatrix(this.config.hiddenSize, this.config.forecastLength);
  }

  /** 加载预训练权重 (未来实现) */
  loadWeights(_embedding: number[][], _projection: number[][]): void {
    this.embedding = _embedding;
    this.projection = _projection;
  }

  /** ⚠️ 零权重初始化 — STUB MODEL */
  private initializeMatrix(rows: number, cols: number): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < rows; i++) {
      matrix.push(new Array(cols).fill(0));
    }
    return matrix;
  }

  private matMul(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = B[0].length;
    const result: number[][] = [];
    for (let i = 0; i < rows; i++) {
      result.push(new Array(cols).fill(0));
      for (let j = 0; j < cols; j++) {
        for (let k = 0; k < B.length; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  private prepareInput(prices: number[]): number[][] {
    const input: number[][] = [];
    const basePrice = prices[0];
    
    // NaN保护
    if (basePrice === 0 || isNaN(basePrice)) {
      return input;
    }
    
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
      const volatility = mean === 0 ? 0 : Math.sqrt(variance) / mean;
      
      // 价格变化率
      const prevPrice = prices[i - 1];
      const priceChangeRate = prevPrice === 0 ? 0 : (prices[i] - prevPrice) / prevPrice * 100;
      
      // 归一化
      input.push([
        (prices[i] - basePrice) / basePrice,
        (ma5 - basePrice) / basePrice,
        (ma20 - basePrice) / basePrice,
        (rsi - 50) / 50,
        volatility,
        priceChangeRate / 10,
      ]);
    }
    
    return input;
  }

  predict(prices: number[]): TransformerPrediction {
    const input = this.prepareInput(prices);
    
    if (input.length < this.config.sequenceLength) {
      // 数据不足，返回默认预测
      const lastPrice = prices[prices.length - 1];
      return {
        isStubModel: true as const,
        predictedPrice: lastPrice,
        priceRange: [lastPrice * 0.97, lastPrice * 1.03],
        upProbability: 50,
        downProbability: 50,
        confidence: 0, // ⚠️ 未训练模型
        indicators: {
          ma5: lastPrice,
          ma20: lastPrice,
          rsi: 50,
          volatility: 0.02,
        },
      };
    }
    
    // 嵌入：将输入从 inputSize 映射到 hiddenSize
    let output = input.slice(-this.config.sequenceLength).map(row => {
      // row: [6个特征] -> embedded: [hiddenSize个特征]
      const embedded: number[] = new Array(this.config.hiddenSize).fill(0);
      for (let i = 0; i < row.length; i++) {
        for (let j = 0; j < this.config.hiddenSize; j++) {
          embedded[j] += row[i] * this.embedding[i][j];
        }
      }
      return embedded;
    });
    
    for (const block of this.blocks) {
      output = block.forward(output);
    }

    const lastHidden = output[output.length - 1];
    const predictions = this.matMul([lastHidden], this.projection)[0];
    
    const lastPrice = prices[prices.length - 1];
    const predictedPrice = predictions[0] * lastPrice * 0.1 + lastPrice;
    const priceRange: [number, number] = [
      predictedPrice - Math.abs(predictedPrice * 0.03),
      predictedPrice + Math.abs(predictedPrice * 0.03),
    ];

    const upProbability = Math.min(95, Math.max(5, 50 + predictions[0] * 100));
    const confidence = Math.min(90, 60 + Math.abs(predictions[0]) * 30);

    return {
      isStubModel: true as const,
      predictedPrice: lastPrice, // ⚠️ 零权重 → 预测无变化
      priceRange: [Math.round(lastPrice * 0.97 * 100) / 100, Math.round(lastPrice * 1.03 * 100) / 100],
      upProbability: 50,
      downProbability: 50,
      confidence: 0, // ⚠️ 未训练模型 — 置信度始终为 0
      indicators: {
        ma5: lastPrice,
        ma20: lastPrice,
        rsi: 50,
        volatility: 0.02,
      },
    };
  }

  /**
   * 多步预测
   */
  /**
   * ⚠️ 多步预测 — STUB MODEL
   * 未训练模型无法进行有意义的序列预测。
   * 返回单个 stub 预测 (而非 N 步级联伪预测)。
   */
  predictMultiple(prices: number[], steps: number = 7): TransformerPrediction[] {
    const stub = this.predict(prices);
    return [stub]; // 仅返回一个 stub 预测, 避免级联误差扩散
  }

  generatePredictionReport(prediction: TransformerPrediction): string {
    return `## ⚠️ Transformer 预测报告 (STUB MODEL — 未训练)

> **警告: 此模型未经过训练, 所有权重为零。预测结果不可用于实际交易决策。**

### 预测详情

### 价格预测
**预测价格**: ¥${prediction.predictedPrice.toFixed(2)}
**价格区间**: ¥${prediction.priceRange[0].toFixed(2)} - ¥${prediction.priceRange[1].toFixed(2)}

### 趋势概率
| 方向 | 概率 |
|------|------|
| 📈 上涨 | ${prediction.upProbability}% |
| 📉 下跌 | ${prediction.downProbability}% |

### 指标预测
**MA5**: ¥${prediction.indicators.ma5.toFixed(2)}
**MA20**: ¥${prediction.indicators.ma20.toFixed(2)}
**RSI**: ${prediction.indicators.rsi.toFixed(1)}
**波动率**: ${prediction.indicators.volatility.toFixed(2)}%

### 置信度
**整体置信度**: ${prediction.confidence}%
`;
  }
}

export function createTransformer(config?: Partial<TransformerConfig>): TransformerTimeSeries {
  return new TransformerTimeSeries(config);
}

export const TRANSFORMER_PRESETS = {
  shortTerm: { sequenceLength: 30, forecastLength: 3, hiddenSize: 64 },
  mediumTerm: { sequenceLength: 60, forecastLength: 7, hiddenSize: 128 },
  longTerm: { sequenceLength: 120, forecastLength: 30, hiddenSize: 256 },
};