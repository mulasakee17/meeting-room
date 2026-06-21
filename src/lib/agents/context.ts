/**
 * 社交上下文构建模块
 * 
 * 统一的 buildContext 和 buildHistoryPrompt 实现
 * 被 orchestrator.ts 和 engine.ts 共享使用
 */

import { AgentState, RoundState } from "@/types";

/**
 * buildContext() — 社交信号制造器
 * 将其他 Agent 的状态格式化为社交上下文
 * 
 * @param states 当前所有Agent的状态
 * @param currentAgentId 当前Agent的ID（排除自己）
 * @param shuffle 是否随机打乱顺序（避免位置偏见）
 * @returns 格式化的社交上下文文本
 */
export function buildContext(
  states: AgentState[] | Record<string, AgentState>,
  currentAgentId: string,
  shuffle: boolean = true
): string {
  // 转换为数组格式（兼容两种输入）
  const stateArray = Array.isArray(states) 
    ? states 
    : Object.entries(states).map(([id, state]) => ({ ...state, id }));

  // 过滤掉当前Agent
  let others = stateArray.filter(s => s.id !== currentAgentId);

  // 随机打乱顺序，避免位置偏见
  if (shuffle) {
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
  }

  // 格式化输出
  const formatted = others.map(state => {
    const emoji = state.emoji || '👤';
    const name = state.name || state.id;
    const role = state.role || '分析师';
    const sign = state.emotion > 0 ? "+" : "";
    const conviction = state.conviction ?? 50;
    const counterArgs = state.reasoning_detail?.counter_arguments || "未提供";

    return `${emoji} ${name}（${role}）
  情绪值: ${sign}${state.emotion}
  置信度: ${conviction}%
  核心观点: ${state.reasoning}
  保留意见: ${counterArgs}`;
  }).join("\n\n");

  return `## 其他分析师的观点

${formatted}`;
}

/**
 * buildHistoryPrompt() — 历史反思锚定
 * 展示当前 Agent 自己的历史决策轨迹，附反思指引
 * 
 * @param history 推演历史记录
 * @param agentId 当前Agent的ID
 * @returns 格式化的历史决策文本
 */
export function buildHistoryPrompt(
  history: RoundState[],
  agentId: string
): string {
  if (history.length === 0) return "";

  const myHistory = history.map((round, idx) => {
    const state = round.agents.find(a => a.id === agentId);
    if (!state) return "";
    const sign = state.emotion > 0 ? "+" : "";
    const conviction = state.conviction ?? 50;
    return `Round ${idx + 1}:
  情绪: ${sign}${state.emotion}
  置信度: ${conviction}%
  理由: ${state.reasoning}`;
  }).filter(Boolean).join("\n");

  return `## 你的历史决策

${myHistory}

## 反思指引
回顾你的决策轨迹：
- 你的情绪值变化是否反映了对新闻理解的逐步深化？
- 是否有明显的拐点？如果有，是什么驱动了这个转变？
- 你现在对这条新闻的理解与第一轮相比，最大的不同是什么？

重要：如果新证据支持调整立场，调整是理性的表现，而非不一致。关键是调整的理由是否充分。`;
}

/**
 * getDirection() — 情绪方向判定
 * 将情绪值转换为方向标签
 * 
 * @param emotion 情绪值（-100到+100）
 * @returns 方向标签
 */
export function getDirection(emotion: number): string {
  if (emotion > 20) return "strongly_bullish";
  if (emotion > 5) return "slightly_bullish";
  if (emotion < -20) return "strongly_bearish";
  if (emotion < -5) return "slightly_bearish";
  return "neutral";
}

/**
 * getDirectionLabel() — 方向中文标签
 * 
 * @param direction 方向标签
 * @returns 中文标签
 */
export function getDirectionLabel(direction: string): string {
  const labels: Record<string, string> = {
    "strongly_bullish": "强烈看多",
    "slightly_bullish": "略偏看多",
    "strongly_bearish": "强烈看空",
    "slightly_bearish": "略偏看空",
    "neutral": "中立",
  };
  return labels[direction] || "未知";
}

/**
 * getDirectionEmoji() — 方向表情符号
 * 
 * @param direction 方向标签
 * @returns 表情符号
 */
export function getDirectionEmoji(direction: string): string {
  const emojis: Record<string, string> = {
    "strongly_bullish": "📈",
    "slightly_bullish": "↗️",
    "strongly_bearish": "📉",
    "slightly_bearish": "↘️",
    "neutral": "➡️",
  };
  return emojis[direction] || "❓";
}