/**
 * 技术增强型 Swarm 模拟引擎
 * 
 * 在原有共识机制基础上集成技术指标分析和机器学习预测
 */

import { createAgentConfigs } from "./types";
import { personas } from "./personas";
import { callLLM, LLMConfig } from "@/lib/llm/providers";
import { calculateMean, calculateVariance, checkConvergence, clampEmotion } from "@/lib/utils/emotion";
import { AgentState, RoundData, SwarmResult } from "@/types";
import {
  generateTechnicalContext,
  generateBriefTechnicalSummary,
  calculateTechnicalSentiment,
  generateAgentTechnicalContext,
  generateTechnicalAdvice,
} from "@/lib/indicators";
import { extractClosePrices, extractVolumes, getMockStockData } from "@/lib/indicators/marketData";
import { LSTMPredictor, createLSTMPredictor, LSTMPrediction } from "@/lib/ml/lstmPredictor";
import { TransformerTimeSeries, createTransformer, TransformerPrediction } from "@/lib/ml/transformer";

const agentConfigs = createAgentConfigs(personas);

/**
 * 构建包含技术指标的交易上下文
 */
function buildTradingContext(
  news: string,
  prices: number[],
  volumes: number[],
  technicalSummary: string
): string {
  return `## 金融新闻
${news}

## 技术面分析
${technicalSummary}`;
}

/**
 * 构建 Agent 交易决策 Prompt
 */
function buildTradingPrompt(
  persona: any,
  news: string,
  technicalContext: string,
  otherAgentsContext: string,
  historyContext: string,
  technicalAdvice: any
): string {
  const decisionStyle = persona.decisionStyle as string;
  const strategyText = {
    momentum: "趋势跟随",
    contrarian: "逆向思维",
    fundamental: "价值投资",
    technical: "技术分析",
    macro: "宏观视角",
  }[decisionStyle] || "综合分析";

  return `## 金融新闻
${news}

${technicalContext}

## 其他交易员的观点
${otherAgentsContext}

${historyContext}

## 你的角色
你是${persona.role}，你的口头禅是："${persona.catchphrase}"

## 交易风格
你的核心交易风格是"${strategyText}"，风险偏好为${persona.riskTolerance}。

## 重要提示
1. 技术指标给出了客观的市场分析，请结合你的交易风格做出判断
2. 如果技术面与你的直觉一致，可以加强信心
3. 如果技术面与你的直觉相反，需要谨慎考虑是否调整
4. 给出情绪值时，请参考技术信号的强度和置信度

## 输出要求
请以JSON格式输出你的决策：
{
  "emotion": 数字（-100到100，正数表示看多，负数表示看空）,
  "reasoning": "详细的决策理由（请结合技术面和个人风格）"
}

注意：emotion值应该综合考虑基本面新闻和技术面信号。`;
}

function buildContext(
  states: Record<string, AgentState>,
  agentId: string
): string {
  const otherAgents = Object.entries(states)
    .filter(([id]) => id !== agentId)
    .map(([id, state]) => {
      const persona = personas.find(p => p.id === id);
      return `${persona?.emoji || id} ${persona?.name || id}: 情绪值${state.emotion > 0 ? "+" : ""}${state.emotion}（${state.reasoning}）`;
    })
    .join("\n");

  return `## 其他Agent的观点\n${otherAgents}`;
}

function buildHistoryPrompt(
  history: RoundData[],
  agentId: string
): string {
  if (history.length === 0) return "";
  
  const myHistory = history.map((round, idx) => {
    const state = round.agents[agentId];
    return `Round ${idx + 1}: 情绪值${state.emotion > 0 ? "+" : ""}${state.emotion}，理由：${state.reasoning}`;
  }).join("\n");

  return `## 你的历史决策\n${myHistory}\n\n注意：保持决策一致性，不要剧烈反转。`;
}

/**
 * 技术增强型 Swarm 模拟
 */
export async function runTechnicalSwarmSimulation(
  news: string,
  maxRounds: number = 5,
  llmConfig?: LLMConfig,
  symbol?: string // 可选：指定股票代码以获取真实技术数据
): Promise<SwarmResult & { technicalAnalysis?: any }> {
  const rounds: RoundData[] = [];
  let currentStates: Record<string, AgentState> = {};
  let converged = false;

  // 获取或生成技术数据
  let prices: number[] = [];
  let volumes: number[] = [];

  if (symbol) {
    // 使用真实数据（模拟）
    const stockData = getMockStockData(symbol);
    prices = extractClosePrices(stockData.prices);
    volumes = extractVolumes(stockData.prices);
  } else {
    // 生成模拟数据
    const basePrice = 100 + Math.random() * 100;
    for (let i = 0; i < 60; i++) {
      const change = (Math.random() - 0.5) * 2;
      prices.push(basePrice + change);
      volumes.push(1000000 * (0.5 + Math.random()));
    }
  }

  // 生成初始技术分析
  const initialTechnicalContext = generateBriefTechnicalSummary(prices, volumes);
  const initialAdvice = generateTechnicalAdvice(prices, volumes);

  for (let round = 1; round <= maxRounds; round++) {
    const roundStates: Record<string, AgentState> = {};

    // 动态更新技术指标（使用最新数据）
    const roundPrices = prices.slice(0, -maxRounds + round);
    const roundVolumes = volumes.slice(0, -maxRounds + round);
    const technicalContext = generateAgentTechnicalContext(roundPrices, roundVolumes, false);
    const technicalAdvice = generateTechnicalAdvice(roundPrices, roundVolumes);

    const promises = Object.entries(agentConfigs).map(async ([agentId, config]) => {
      const persona = config.persona;
      
      // 第一轮：基于新闻和技术指标
      if (round === 1) {
        const tradingContext = buildTradingContext(news, prices, volumes, technicalContext);
        const userPrompt = buildTradingPrompt(
          persona,
          tradingContext,
          '', // 已经在 tradingContext 中包含了
          '', // 第一轮没有其他 Agent
          '', // 第一轮没有历史
          technicalAdvice
        );
        
        try {
          const result = await callLLM(config.systemPrompt, userPrompt, llmConfig);
          
          // 技术指标情绪调整
          let emotion = clampEmotion(result.emotion);
          const technicalSentiment = calculateTechnicalSentiment(prices, volumes);
          
          // 根据 Agent 风格调整技术指标权重
          let techWeight = 0.2; // 默认权重
          if (persona.decisionStyle === 'technical') {
            techWeight = 0.4;
          } else if (persona.decisionStyle === 'fundamental') {
            techWeight = 0.1;
          } else if (persona.decisionStyle === 'momentum') {
            techWeight = 0.3;
          }
          
          // 综合情绪值
          const adjustedEmotion = emotion * (1 - techWeight) + technicalSentiment * techWeight;
          
          return { 
            agentId, 
            state: { 
              emotion: clampEmotion(adjustedEmotion), 
              reasoning: `${result.reasoning}\n\n[技术面参考：${technicalContext.split('\n')[2] || '暂无'}]`
            } 
          };
        } catch (error) {
          console.error(`Agent ${agentId} 调用失败:`, error);
          return { agentId, state: { emotion: 0, reasoning: 'API调用失败' } };
        }
      }

      // 后续轮次：结合技术指标、其他 Agent 观点和历史
      const otherAgentsContext = buildContext(currentStates, agentId);
      const history = buildHistoryPrompt(rounds, agentId);
      
      const tradingContext = buildTradingContext(news, roundPrices, roundVolumes, technicalContext);
      const userPrompt = buildTradingPrompt(
        persona,
        news,
        technicalContext,
        otherAgentsContext,
        history,
        technicalAdvice
      );

      try {
        const result = await callLLM(config.systemPrompt, userPrompt, llmConfig);
        
        // 技术指标情绪调整
        let emotion = clampEmotion(result.emotion);
        const technicalSentiment = calculateTechnicalSentiment(roundPrices, roundVolumes);
        
        // 根据 Agent 风格调整技术指标权重
        let techWeight = 0.15;
        if (persona.decisionStyle === 'technical') {
          techWeight = 0.35;
        } else if (persona.decisionStyle === 'fundamental') {
          techWeight = 0.05;
        }
        
        // 综合情绪值
        const adjustedEmotion = emotion * (1 - techWeight) + technicalSentiment * techWeight;
        
        return { 
          agentId, 
          state: { 
            emotion: clampEmotion(adjustedEmotion), 
            reasoning: result.reasoning 
          } 
        };
      } catch (error) {
        console.error(`Agent ${agentId} 调用失败:`, error);
        return { agentId, state: { emotion: 0, reasoning: 'API调用失败' } };
      }
    });

    const results = await Promise.all(promises);
    results.forEach(({ agentId, state }) => {
      roundStates[agentId] = state;
    });

    currentStates = roundStates;

    const emotions = Object.values(roundStates).map((s) => s.emotion);
    const consensus = calculateMean(emotions);
    const variance = calculateVariance(emotions);

    rounds.push({ round, agents: roundStates, consensus, variance });

    if (checkConvergence(emotions)) {
      converged = true;
      break;
    }

    // 模拟价格变动
    if (round < maxRounds) {
      const priceChange = consensus / 100 * 0.5;
      for (let i = 0; i < prices.length; i++) {
        prices[i] *= (1 + priceChange / 100);
      }
    }
  }

  const finalEmotions = Object.values(currentStates).map((s) => s.emotion);
  const finalConsensus = calculateMean(finalEmotions);

  const getDirection = (e: number): string => {
    if (e > 20) return "strongly_bullish";
    if (e > 5) return "slightly_bullish";
    if (e < -20) return "strongly_bearish";
    if (e < -5) return "slightly_bearish";
    return "neutral";
  };

  const finalTechnicalAnalysis = generateTechnicalContext(prices, volumes);

  const finalResult: SwarmResult["final"] = {
    consensus: finalConsensus,
    direction: getDirection(finalConsensus),
    converged,
    total_rounds: rounds.length,
  };

  return { 
    news, 
    rounds, 
    final: finalResult,
    technicalAnalysis: finalTechnicalAnalysis 
  };
}

/**
 * 原始 Swarm 模拟（保持向后兼容）
 */
export async function runSwarmSimulation(
  news: string,
  maxRounds: number = 5,
  llmConfig?: LLMConfig
): Promise<SwarmResult> {
  const rounds: RoundData[] = [];
  let currentStates: Record<string, AgentState> = {};
  let converged = false;

  for (let round = 1; round <= maxRounds; round++) {
    const roundStates: Record<string, AgentState> = {};

    const promises = Object.entries(agentConfigs).map(async ([agentId, config]) => {
      const persona = config.persona;
      
      if (round === 1) {
        const userPrompt = `## 金融新闻\n${news}\n\n作为${persona.role}，基于你的决策风格和风险偏好，给出你的初始情绪判断。`;
        const result = await callLLM(config.systemPrompt, userPrompt, llmConfig);
        return { agentId, state: { emotion: clampEmotion(result.emotion), reasoning: result.reasoning } };
      }

      const context = buildContext(currentStates, agentId);
      const history = buildHistoryPrompt(rounds, agentId);
      
      const evolvePrompt = `## 金融新闻
${news}

${history}

${context}

## 你的任务
作为${persona.role}，参考其他Agent的观点和你的历史决策，调整你的情绪判断。
记住你的口头禅："${persona.catchphrase}"
保持人格一致性，体现你的${persona.decisionStyle === "momentum" ? "趋势跟随" : persona.decisionStyle === "contrarian" ? "逆向思维" : persona.decisionStyle === "fundamental" ? "价值投资" : persona.decisionStyle === "technical" ? "技术分析" : "宏观视角"}风格。

输出JSON格式：{"emotion": 数字, "reasoning": "原因说明(体现你的决策风格)"}`;

      const result = await callLLM(config.systemPrompt, evolvePrompt, llmConfig);
      return { agentId, state: { emotion: clampEmotion(result.emotion), reasoning: result.reasoning } };
    });

    const results = await Promise.all(promises);
    results.forEach(({ agentId, state }) => {
      roundStates[agentId] = state;
    });

    currentStates = roundStates;

    const emotions = Object.values(roundStates).map((s) => s.emotion);
    const consensus = calculateMean(emotions);
    const variance = calculateVariance(emotions);

    rounds.push({ round, agents: roundStates, consensus, variance });

    if (checkConvergence(emotions)) {
      converged = true;
      break;
    }
  }

  const finalEmotions = Object.values(currentStates).map((s) => s.emotion);
  const finalConsensus = calculateMean(finalEmotions);

  const getDirection = (e: number): string => {
    if (e > 20) return "strongly_bullish";
    if (e > 5) return "slightly_bullish";
    if (e < -20) return "strongly_bearish";
    if (e < -5) return "slightly_bearish";
    return "neutral";
  };

  const finalResult: SwarmResult["final"] = {
    consensus: finalConsensus,
    direction: getDirection(finalConsensus),
    converged,
    total_rounds: rounds.length,
  };

  return { news, rounds, final: finalResult };
}

/**
 * ML 增强型 Swarm 模拟
 * 
 * 集成 LSTM 和 Transformer 机器学习预测
 */
export async function runMLSwarmSimulation(
  news: string,
  maxRounds: number = 5,
  llmConfig?: LLMConfig,
  symbol?: string,
  options?: {
    enableLSTM?: boolean;
    enableTransformer?: boolean;
    mlWeight?: number; // ML 预测权重 (0-1)
  }
): Promise<SwarmResult & { 
  technicalAnalysis?: any;
  mlPredictions?: {
    lstm: LSTMPrediction | null;
    transformer: TransformerPrediction | null;
  };
}> {
  const { enableLSTM = true, enableTransformer = true, mlWeight = 0.25 } = options || {};
  
  const rounds: RoundData[] = [];
  let currentStates: Record<string, AgentState> = {};
  let converged = false;

  // 获取或生成技术数据
  let prices: number[] = [];
  let volumes: number[] = [];

  if (symbol) {
    const stockData = getMockStockData(symbol);
    prices = extractClosePrices(stockData.prices);
    volumes = extractVolumes(stockData.prices);
  } else {
    const basePrice = 100 + Math.random() * 100;
    for (let i = 0; i < 60; i++) {
      const change = (Math.random() - 0.5) * 2;
      prices.push(basePrice + change);
      volumes.push(1000000 * (0.5 + Math.random()));
    }
  }

  // ML 预测
  let lstmPrediction: LSTMPrediction | null = null;
  let transformerPrediction: TransformerPrediction | null = null;

  if (enableLSTM && prices.length >= 20) {
    const lstmPredictor = createLSTMPredictor();
    const lstmInput = prepareLSTMInputFromPrices(prices);
    if (lstmInput.length >= 20) {
      lstmPrediction = lstmPredictor.predict(lstmInput.slice(-20));
    }
  }

  if (enableTransformer && prices.length >= 60) {
    const transformer = createTransformer();
    transformerPrediction = transformer.predict(prices);
  }

  // 计算 ML 综合情绪值
  const mlSentiment = calculateMLSentiment(lstmPrediction, transformerPrediction);

  // 生成技术分析
  const technicalContext = generateAgentTechnicalContext(prices, volumes, false);
  const technicalAdvice = generateTechnicalAdvice(prices, volumes);

  for (let round = 1; round <= maxRounds; round++) {
    const roundStates: Record<string, AgentState> = {};

    const roundPrices = prices.slice(0, prices.length - maxRounds + round);
    const roundVolumes = volumes.slice(0, volumes.length - maxRounds + round);
    const roundTechnicalContext = generateAgentTechnicalContext(roundPrices, roundVolumes, false);

    const promises = Object.entries(agentConfigs).map(async ([agentId, config]) => {
      const persona = config.persona;
      
      // 构建 ML 预测上下文
      const mlContext = buildMLContext(lstmPrediction, transformerPrediction);
      
      // 第一轮
      if (round === 1) {
        const userPrompt = buildMLTradingPrompt(
          persona,
          news,
          roundTechnicalContext,
          mlContext,
          '', '', ''
        );
        
        try {
          const result = await callLLM(config.systemPrompt, userPrompt, llmConfig);
          
          // 综合情绪值计算
          let emotion = clampEmotion(result.emotion);
          const technicalSentiment = calculateTechnicalSentiment(roundPrices, roundVolumes);
          
          // 根据风格调整权重
          let techWeight = 0.15;
          let mlWeightAdjusted = mlWeight;
          
          if (persona.decisionStyle === 'technical') {
            techWeight = 0.25;
            mlWeightAdjusted = mlWeight * 1.5; // 技术型 Agent 更信任 ML
          } else if (persona.decisionStyle === 'fundamental') {
            techWeight = 0.05;
            mlWeightAdjusted = mlWeight * 0.5; // 基本面型 Agent 较少信任 ML
          }
          
          // 综合情绪值 = LLM情绪 × (1 - techWeight - mlWeight) + 技术情绪 × techWeight + ML情绪 × mlWeight
          const llmWeight = 1 - techWeight - mlWeightAdjusted;
          const adjustedEmotion = emotion * llmWeight + technicalSentiment * techWeight + mlSentiment * mlWeightAdjusted;
          
          return { 
            agentId, 
            state: { 
              emotion: clampEmotion(adjustedEmotion), 
              reasoning: `${result.reasoning}\n\n[ML预测参考: ${mlContext.slice(0, 100)}...]`
            } 
          };
        } catch (error) {
          console.error(`Agent ${agentId} 调用失败:`, error);
          return { agentId, state: { emotion: mlSentiment, reasoning: 'ML预测替代' } };
        }
      }

      // 后续轮次
      const otherAgentsContext = buildContext(currentStates, agentId);
      const history = buildHistoryPrompt(rounds, agentId);
      
      const userPrompt = buildMLTradingPrompt(
        persona,
        news,
        roundTechnicalContext,
        mlContext,
        otherAgentsContext,
        history,
        ''
      );

      try {
        const result = await callLLM(config.systemPrompt, userPrompt, llmConfig);
        
        let emotion = clampEmotion(result.emotion);
        const technicalSentiment = calculateTechnicalSentiment(roundPrices, roundVolumes);
        
        let techWeight = 0.1;
        let mlWeightAdjusted = mlWeight * 0.8;
        
        if (persona.decisionStyle === 'technical') {
          techWeight = 0.2;
          mlWeightAdjusted = mlWeight * 1.2;
        } else if (persona.decisionStyle === 'fundamental') {
          techWeight = 0.03;
          mlWeightAdjusted = mlWeight * 0.3;
        }
        
        const llmWeight = 1 - techWeight - mlWeightAdjusted;
        const adjustedEmotion = emotion * llmWeight + technicalSentiment * techWeight + mlSentiment * mlWeightAdjusted;
        
        return { 
          agentId, 
          state: { 
            emotion: clampEmotion(adjustedEmotion), 
            reasoning: result.reasoning 
          } 
        };
      } catch (error) {
        console.error(`Agent ${agentId} 调用失败:`, error);
        return { agentId, state: { emotion: 0, reasoning: 'API调用失败' } };
      }
    });

    const results = await Promise.all(promises);
    results.forEach(({ agentId, state }) => {
      roundStates[agentId] = state;
    });

    currentStates = roundStates;

    const emotions = Object.values(roundStates).map((s) => s.emotion);
    const consensus = calculateMean(emotions);
    const variance = calculateVariance(emotions);

    rounds.push({ round, agents: roundStates, consensus, variance });

    if (checkConvergence(emotions)) {
      converged = true;
      break;
    }

    // 模拟价格变动
    if (round < maxRounds) {
      const priceChange = consensus / 100 * 0.5;
      for (let i = 0; i < prices.length; i++) {
        prices[i] *= (1 + priceChange / 100);
      }
    }
  }

  const finalEmotions = Object.values(currentStates).map((s) => s.emotion);
  const finalConsensus = calculateMean(finalEmotions);

  const getDirection = (e: number): string => {
    if (e > 20) return "strongly_bullish";
    if (e > 5) return "slightly_bullish";
    if (e < -20) return "strongly_bearish";
    if (e < -5) return "slightly_bearish";
    return "neutral";
  };

  const finalTechnicalAnalysis = generateTechnicalContext(prices, volumes);

  const finalResult: SwarmResult["final"] = {
    consensus: finalConsensus,
    direction: getDirection(finalConsensus),
    converged,
    total_rounds: rounds.length,
  };

  return { 
    news, 
    rounds, 
    final: finalResult,
    technicalAnalysis: finalTechnicalAnalysis,
    mlPredictions: {
      lstm: lstmPrediction,
      transformer: transformerPrediction,
    }
  };
}

/**
 * 构建 ML 预测上下文
 */
function buildMLContext(
  lstmPrediction: LSTMPrediction | null,
  transformerPrediction: TransformerPrediction | null
): string {
  const lines: string[] = [];
  
  lines.push('## 🤖 机器学习预测');
  
  if (lstmPrediction) {
    lines.push('\n### LSTM 预测');
    lines.push(`- 预测价格: ¥${lstmPrediction.predictedPrice.toFixed(2)}`);
    lines.push(`- 上涨概率: ${lstmPrediction.trendProbability.up}%`);
    lines.push(`- 下跌概率: ${lstmPrediction.trendProbability.down}%`);
    lines.push(`- 推荐: ${lstmPrediction.recommendation}`);
    lines.push(`- 置信度: ${lstmPrediction.confidence}%`);
    lines.push(`- 信号强度: ${lstmPrediction.signalStrength}%`);
  }
  
  if (transformerPrediction) {
    lines.push('\n### Transformer 预测');
    lines.push(`- 预测价格: ¥${transformerPrediction.predictedPrice.toFixed(2)}`);
    lines.push(`- 价格区间: ¥${transformerPrediction.priceRange[0].toFixed(2)} - ¥${transformerPrediction.priceRange[1].toFixed(2)}`);
    lines.push(`- 上涨概率: ${transformerPrediction.upProbability}%`);
    lines.push(`- 下跌概率: ${transformerPrediction.downProbability}%`);
    lines.push(`- 置信度: ${transformerPrediction.confidence}%`);
  }
  
  if (!lstmPrediction && !transformerPrediction) {
    lines.push('\n⚠️ ML 预测数据不足');
  }
  
  return lines.join('\n');
}

/**
 * 构建 ML 增强型交易 Prompt
 */
function buildMLTradingPrompt(
  persona: any,
  news: string,
  technicalContext: string,
  mlContext: string,
  otherAgentsContext: string,
  historyContext: string,
  technicalAdvice: string
): string {
  const decisionStyle = persona.decisionStyle as string;
  const strategyText = {
    momentum: "趋势跟随",
    contrarian: "逆向思维",
    fundamental: "价值投资",
    technical: "技术分析",
    macro: "宏观视角",
  }[decisionStyle] || "综合分析";

  return `## 金融新闻
${news}

${technicalContext}

${mlContext}

## 其他交易员的观点
${otherAgentsContext}

${historyContext}

## 你的角色
你是${persona.role}，你的口头禅是："${persona.catchphrase}"

## 交易风格
你的核心交易风格是"${strategyText}"，风险偏好为${persona.riskTolerance}。

## 重要提示
1. 机器学习模型给出了基于历史数据的预测，请参考但不要完全依赖
2. 技术指标给出了客观的市场分析，请结合你的交易风格做出判断
3. 如果 ML 预测与技术面一致，可以加强信心
4. 如果 ML 预测与技术面相反，需要谨慎考虑
5. 给出情绪值时，请综合考虑基本面、技术面和 ML 预测

## 输出要求
请以JSON格式输出你的决策：
{
  "emotion": 数字（-100到100，正数表示看多，负数表示看空）,
  "reasoning": "详细的决策理由（请结合基本面、技术面和ML预测）"
}`;
}

/**
 * 计算 ML 综合情绪值 (-10 到 +10)
 */
function calculateMLSentiment(
  lstmPrediction: LSTMPrediction | null,
  transformerPrediction: TransformerPrediction | null
): number {
  if (!lstmPrediction && !transformerPrediction) {
    return 0;
  }
  
  let sentiment = 0;
  let count = 0;
  
  if (lstmPrediction) {
    // LSTM 情绪值基于趋势概率
    const lstmSentiment = (lstmPrediction.trendProbability.up - lstmPrediction.trendProbability.down) / 10;
    const lstmConfidenceFactor = lstmPrediction.confidence / 100;
    sentiment += lstmSentiment * lstmConfidenceFactor;
    count++;
  }
  
  if (transformerPrediction) {
    // Transformer 情绪值基于上涨概率
    const transformerSentiment = (transformerPrediction.upProbability - 50) / 5;
    const transformerConfidenceFactor = transformerPrediction.confidence / 100;
    sentiment += transformerSentiment * transformerConfidenceFactor;
    count++;
  }
  
  if (count > 0) {
    sentiment = sentiment / count;
  }
  
  return Math.round(sentiment * 10) / 10;
}

/**
 * 从价格序列准备 LSTM 输入（辅助函数）
 */
function prepareLSTMInputFromPrices(prices: number[]): number[][] {
  const input: number[][] = [];
  
  for (let i = 20; i < prices.length; i++) {
    const window = prices.slice(i - 20, i);
    const ma5 = window.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = window.reduce((a, b) => a + b, 0) / 20;
    
    let gains = 0;
    let losses = 0;
    for (let j = 1; j < window.length; j++) {
      const change = window[j] - window[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
    
    const mean = ma20;
    const variance = window.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / 20;
    const volatility = Math.sqrt(variance) / mean;
    
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
