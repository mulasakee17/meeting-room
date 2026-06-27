/**
 * SwarmAlpha v10 — 价格反馈闭环引擎
 *
 * 核心机制:
 *   信念 → 订单 → 撮合 → 价格变动 → Agent 感知 → 调整信念
 *
 * 流程:
 *   1. 信念 + 信心 → 订单 (信念强=大单)
 *   2. 多空订单撮合 → 净订单流 → 价格变动
 *   3. 持仓更新 → 浮动盈亏 → 最大回撤
 *   4. Agent 感知价格变动 → 调整下一轮信念
 *
 * 设计原则:
 *   - 信念不是行动：需要足够强的信心才会产生交易
 *   - 头寸有成本：持仓会影响后续决策
 *   - 价格是信息：变动会反馈到下一轮的因子解读中
 *
 * 纯数学，零 LLM 调用。
 */

import {
  V9AgentDefinition,
  V9AgentState,
  AgentPosition,
  PriceState,
  OrderItem,
  OrderMatchResult,
  PriceFeedbackState,
} from "./types";

// ==================== 配置 ====================

const CONFIG = {
  /** 基准价格 */
  BASE_PRICE: 100,
  /** 每轮最大价格变动 (%) */
  MAX_PRICE_MOVE: 5,
  /** 触发交易的最低信念强度阈值 */
  TRADE_THRESHOLD: 15,
  /** 基础订单量 = belief * confidence/100 * capitalWeight */
  ORDER_BASE_MULTIPLIER: 0.1,
  /** 持仓上限 */
  MAX_POSITION: 100,
  /** 止损线 (回撤超过此值强制平仓) */
  STOP_LOSS_DRAWDOWN: 20,
  /** 止盈线 (盈利超过此值部分获利了结) */
  TAKE_PROFIT: 30,
  /** Agent 类型对价格信号的响应系数 */
  PRICE_SIGNAL_RESPONSE: {
    trend: 0.25,     // 趋势跟踪者，响应价格动量 (降低以避免正反馈爆炸)
    quant: 0.15,    // 量化，响应技术信号
    value: 0.08,    // 价值投资者，对短期价格不敏感
    panic: 0.3,     // 恐慌投资者，最敏感 (大幅降低)
    retail: 0.2,    // 散户，随大流 (降低)
    institution: 0.1, // 机构，稳重
    media: 0.15,    // 媒体，放大叙事
    contrarian: -0.1, // 逆向投资者，反向响应 (降低)
    policy: 0.05,   // 政策，响应有限
  },
};

// ==================== 辅助函数 ====================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeStd(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

// ==================== 订单生成 ====================

/**
 * 从 Agent 信念生成订单
 *
 * 规则:
 *   - 信念强度 >= TRADE_THRESHOLD → 产生交易
 *   - 订单方向由信念正负决定
 *   - 订单大小 = |belief| * confidence/100 * capitalWeight
 *   - HOLD 区间 (-TRADE_THRESHOLD, +TRADE_THRESHOLD) → 不交易
 */
export function generateOrders(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  positions: Record<string, AgentPosition>
): OrderItem[] {
  const orders: OrderItem[] = [];

  for (const agent of agents) {
    const state = states[agent.id];
    if (!state) continue;

    const belief = state.belief;
    const confidence = state.confidence;
    const capitalWeight = agent.capitalWeight;

    // 持仓状态检查
    const position = positions[agent.id];

    // 如果已有持仓，检查是否触发止损/止盈
    if (position && position.position !== 0) {
      const pnl = position.unrealizedPnL;
      const drawdown = position.maxDrawdown;

      // 止损：回撤超过阈值，强制平仓
      if (drawdown >= CONFIG.STOP_LOSS_DRAWDOWN) {
        orders.push({
          agentId: agent.id,
          direction: position.position > 0 ? "SELL" : "BUY",
          size: Math.abs(position.position),
          belief: belief,
          confidence: confidence,
        });
        continue;
      }

      // 止盈：盈利超过阈值，部分了结
      if (pnl >= CONFIG.TAKE_PROFIT && Math.abs(belief) < CONFIG.TRADE_THRESHOLD) {
        const closeSize = Math.abs(position.position) * 0.5; // 了结50%
        orders.push({
          agentId: agent.id,
          direction: position.position > 0 ? "SELL" : "BUY",
          size: closeSize,
          belief: belief,
          confidence: confidence,
        });
        continue;
      }
    }

    // 正常交易信号
    if (Math.abs(belief) >= CONFIG.TRADE_THRESHOLD) {
      const size = Math.abs(belief) * (confidence / 100) * capitalWeight * CONFIG.ORDER_BASE_MULTIPLIER;
      orders.push({
        agentId: agent.id,
        direction: belief > 0 ? "BUY" : "SELL",
        size: clamp(size, 0, CONFIG.MAX_POSITION),
        belief: belief,
        confidence: confidence,
      });
    } else {
      // 弱信号：可以持仓不动，不产生新订单
      orders.push({
        agentId: agent.id,
        direction: "HOLD",
        size: 0,
        belief: belief,
        confidence: confidence,
      });
    }
  }

  return orders;
}

// ==================== 订单撮合 ====================

/**
 * 订单撮合 → 价格变动
 *
 * 规则:
 *   - 净订单流 = 买入总量 - 卖出总量
 *   - 净订单流为正 → 价格上涨
 *   - 净订单流为负 → 价格下跌
 *   - 价格变动幅度受波动率限制
 */
export function matchOrders(
  orders: OrderItem[],
  currentPrice: number,
  volatility: number
): { orderMatch: OrderMatchResult; newPrice: number } {
  let buyPressure = 0;
  let sellPressure = 0;

  for (const order of orders) {
    if (order.direction === "BUY") {
      buyPressure += order.size;
    } else if (order.direction === "SELL") {
      sellPressure += order.size;
    }
  }

  const netOrderFlow = buyPressure - sellPressure;
  const totalVolume = buyPressure + sellPressure;

  // 价格变动 = 净订单流占比 * 波动率系数
  // 限制最大变动
  const rawImpact = totalVolume > 0 ? (netOrderFlow / totalVolume) : 0;
  const volatilityAdjusted = Math.max(volatility, 0.01); // 最低1%波动
  const priceImpact = clamp(rawImpact * volatilityAdjusted * 100, -CONFIG.MAX_PRICE_MOVE, CONFIG.MAX_PRICE_MOVE);

  // 新价格
  const newPrice = currentPrice * (1 + priceImpact / 100);

  const orderMatch: OrderMatchResult = {
    netOrderFlow,
    buyPressure,
    sellPressure,
    priceImpact,
  };

  return { orderMatch, newPrice };
}

// ==================== 持仓更新 ====================

/**
 * 更新所有 Agent 的持仓状态
 */
export function updatePositions(
  agents: V9AgentDefinition[],
  positions: Record<string, AgentPosition>,
  orders: OrderItem[],
  currentPrice: number,
  newPrice: number
): Record<string, AgentPosition> {
  const newPositions: Record<string, AgentPosition> = { ...positions };

  for (const agent of agents) {
    const order = orders.find(o => o.agentId === agent.id);
    if (!order) continue;

    const prev = newPositions[agent.id] || {
      agentId: agent.id,
      position: 0,
      avgCost: currentPrice,
      maxDrawdown: 0,
      unrealizedPnL: 0,
    };

    let newPosition = prev.position;
    let newAvgCost = prev.avgCost;
    let newMaxDrawdown = prev.maxDrawdown;
    let newUnrealizedPnL = prev.unrealizedPnL;

    if (order.direction === "BUY" && order.size > 0) {
      // 买入：增加多头
      const totalCost = prev.position * prev.avgCost + order.size * newPrice;
      const totalPosition = prev.position + order.size;
      newAvgCost = totalPosition !== 0 ? totalCost / totalPosition : newPrice;
      newPosition = totalPosition;
    } else if (order.direction === "SELL" && order.size > 0) {
      // 卖出：减少持仓（可以是平多或开空）
      newPosition = prev.position - order.size;
      // 如果从空头变多头，或反过来，avgCost重置
      if (Math.sign(prev.position) !== Math.sign(newPosition)) {
        newAvgCost = newPrice;
      }
    }

    // 限制持仓范围
    newPosition = clamp(newPosition, -CONFIG.MAX_POSITION, CONFIG.MAX_POSITION);

    // 计算浮动盈亏 (相对于成本)
    if (newPosition !== 0) {
      newUnrealizedPnL = newPosition > 0
        ? ((newPrice - newAvgCost) / newAvgCost) * 100  // 多头：盈利率
        : ((newAvgCost - newPrice) / newAvgCost) * 100;  // 空头：做空收益
    } else {
      newUnrealizedPnL = 0;
      newAvgCost = currentPrice; // 平仓后重置成本
    }

    // 更新最大回撤
    if (newPosition > 0 && newUnrealizedPnL < 0) {
      // 多头持仓更新最大回撤
      const drawdown = -newUnrealizedPnL;
      newMaxDrawdown = Math.max(prev.maxDrawdown, drawdown);
    } else if (newPosition < 0 && newUnrealizedPnL < 0) {
      const drawdown = -newUnrealizedPnL;
      newMaxDrawdown = Math.max(prev.maxDrawdown, drawdown);
    } else if (newPosition === 0) {
      // 平仓后重置回撤记录
      newMaxDrawdown = 0;
    }

    newPositions[agent.id] = {
      agentId: agent.id,
      position: newPosition,
      avgCost: newAvgCost,
      maxDrawdown: newMaxDrawdown,
      unrealizedPnL: Math.round(newUnrealizedPnL * 100) / 100,
    };
  }

  return newPositions;
}

// ==================== 价格信号 → Agent 信念调整 ====================

/**
 * 计算 Agent 对价格变动的响应
 *
 * 不同类型的 Agent 对价格信号的响应不同:
 *   - Trend: 追涨杀跌，价格涨 → 更看好
 *   - Contrarian: 逆向投资者，价格跌 → 更看好
 *   - Value: 对短期价格不敏感
 *   - Panic: 对价格波动极度敏感
 *
 * @param currentBelief - 当前信念
 * @param agentId - Agent ID
 * @param priceChange - 价格变动百分比
 * @param confidence - 当前信心
 * @returns 调整后的信念偏移量
 */
export function computePriceSignalAdjustment(
  currentBelief: number,
  agentId: string,
  priceChange: number,  // 百分比，可正可负
  confidence: number
): number {
  const responseCoeff = CONFIG.PRICE_SIGNAL_RESPONSE[agentId] ?? 0.3;
  const confidenceFactor = confidence / 100;

  // 价格信号的影响因子 = 系数 * 波动幅度 * 信心
  // 限制最大调整幅度为 ±8 (降低以避免正反馈爆炸)
  const adjustment = responseCoeff * priceChange * confidenceFactor * 1;

  return clamp(adjustment, -8, 8);
}

// ==================== 主入口 ====================

/**
 * 运行一轮价格反馈
 *
 * @param agents - Agent 定义
 * @param states - Agent 当前状态 (信念)
 * @param priceState - 当前价格状态
 * @param positions - 当前持仓
 * @returns 完整的价格反馈状态
 */
export function runPriceFeedback(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  priceState: PriceState,
  positions: Record<string, AgentPosition>
): PriceFeedbackState {
  const isFeedbackRound = Object.values(positions).some(p => p.position !== 0);
  const feedbackRound = isFeedbackRound
    ? Object.values(positions).filter(p => p.position !== 0).length
    : 0;

  // 1. 生成订单
  const orders = generateOrders(agents, states, positions);

  // 2. 撮合订单 → 新价格
  const { orderMatch, newPrice } = matchOrders(
    orders,
    priceState.currentPrice,
    priceState.volatility
  );

  // 3. 更新持仓
  const newPositions = updatePositions(
    agents,
    positions,
    orders,
    priceState.currentPrice,
    newPrice
  );

  // 4. 更新价格状态
  const priceChange = ((newPrice - priceState.currentPrice) / priceState.currentPrice) * 100;
  const newPriceState: PriceState = {
    currentPrice: newPrice,
    previousPrice: priceState.currentPrice,
    priceChange: Math.round(priceChange * 100) / 100,
    cumulativeReturn: priceState.cumulativeReturn + priceChange,
    volatility: priceState.volatility,
  };

  return {
    price: newPriceState,
    positions: newPositions,
    orders,
    orderMatch,
    isFeedbackRound,
    feedbackRound,
  };
}

/**
 * 获取 Agent 的价格反馈信号强度
 *
 * 用于在 simulation.ts 中将价格信号传递给 Agent
 */
export function getPriceFeedbackSignal(
  priceState: PriceState,
  agentId: string
): {
  priceChange: number;
  momentumSignal: number;
  meanReversionSignal: number;
} {
  const { priceChange, currentPrice } = priceState;

  // 动量信号：短期涨跌趋势
  const momentumSignal = clamp(priceChange * 2, -20, 20);

  // 均值回归信号：
  // 价格跌幅大 + RSI 超卖 → 反弹信号强
  // 价格涨幅大 + RSI 超买 → 回调信号强
  // 这里简化处理：cumulativeReturn 偏离 0 越多，均值回归压力越大
  const meanReversionSignal = clamp(-priceState.cumulativeReturn * 0.5, -20, 20);

  return {
    priceChange,
    momentumSignal,
    meanReversionSignal,
  };
}

// ==================== 格式化输出 ====================

/**
 * 格式化价格反馈结果为可读字符串
 */
export function formatPriceFeedbackSummary(state: PriceFeedbackState): string {
  const lines: string[] = [];
  lines.push("━━━━ 价格反馈 ━━━━");
  lines.push(`价格: ${state.price.previousPrice.toFixed(2)} → ${state.price.currentPrice.toFixed(2)} (${state.price.priceChange > 0 ? "+" : ""}${state.price.priceChange.toFixed(2)}%)`);
  lines.push(`累计涨跌: ${state.price.cumulativeReturn > 0 ? "+" : ""}${state.price.cumulativeReturn.toFixed(2)}%`);
  lines.push(`波动率: ${(state.price.volatility * 100).toFixed(2)}%`);
  lines.push("");

  lines.push("订单流:");
  lines.push(`  买入压力: ${state.orderMatch.buyPressure.toFixed(2)}`);
  lines.push(`  卖出压力: ${state.orderMatch.sellPressure.toFixed(2)}`);
  lines.push(`  净订单流: ${state.orderMatch.netOrderFlow > 0 ? "+" : ""}${state.orderMatch.netOrderFlow.toFixed(2)}`);
  lines.push("");

  lines.push("持仓状态:");
  const activePositions = Object.values(state.positions).filter(p => p.position !== 0);
  if (activePositions.length === 0) {
    lines.push("  (无持仓)");
  } else {
    for (const pos of activePositions) {
      const emoji = pos.position > 0 ? "📈" : "📉";
      const pnlEmoji = pos.unrealizedPnL >= 0 ? "🟢" : "🔴";
      lines.push(`  ${emoji} ${pos.agentId}: ${pos.position > 0 ? "多头" : "空头"}${Math.abs(pos.position).toFixed(1)}手 | 成本${pos.avgCost.toFixed(2)} | ${pnlEmoji} PnL: ${pos.unrealizedPnL >= 0 ? "+" : ""}${pos.unrealizedPnL.toFixed(2)}% | 回撤: ${pos.maxDrawdown.toFixed(1)}%`);
    }
  }

  return lines.join("\n");
}
