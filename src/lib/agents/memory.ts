/**
 * Agent 记忆系统模块
 * 
 * 功能：
 * 1. 短期记忆：当前推演中的逐轮决策
 * 2. 长期记忆：跨推演的统计模式
 * 3. 关系记忆：对其他 Agent 的信任度
 * 
 * 存储方式：localStorage
 */

import { AgentState, RoundState } from "@/types";

// ==================== 类型定义 ====================

/**
 * 单次推演决策记录
 */
export interface EpisodeDecision {
  newsId: string;
  newsContent: string;
  timestamp: number;
  rounds: {
    round: number;
    emotion: number;
    reasoning: string;
    conviction: number;
  }[];
  finalEmotion: number;
  finalConviction: number;
  converged: boolean;
  accuracy?: number;  // 准确率（回测后填充）
}

/**
 * 人格特质统计
 */
export interface PersonalityTraits {
  avgConviction: number;           // 平均置信度
  swayability: number;             // 被他人影响程度（低=固执，高=墙头草）
  accuracyHistory: number[];      // 历史准确率
  favoriteKeywords: string[];      // 最常触发的关键词
  emotionVolatility: number;       // 情绪波动率
  consensusRate: number;            // 与共识一致的比例
}

/**
 * Agent 记忆结构
 */
export interface AgentMemory {
  agentId: string;
  agentName: string;
  agentRole: string;
  
  // 短期记忆：当前推演中的逐轮决策
  episodeDecisions: EpisodeDecision[];
  
  // 长期记忆：跨推演的统计模式
  personalityTraits: PersonalityTraits;
  
  // 关系记忆：对其他 Agent 的信任度
  trustScores: Record<string, number>;  // agentId → 0-100
  
  // 统计信息
  stats: {
    totalSimulations: number;      // 总推演次数
    avgConvergenceRounds: number;   // 平均收敛轮次
    lastSimulationTime: number;     // 上次推演时间
  };
}

// ==================== 常量配置 ====================

const MEMORY_KEY_PREFIX = "swarmalpha_agent_memory_";
const MAX_EPISODE_MEMORIES = 50;  // 最多保存50次推演记忆

// ==================== 记忆存储函数 ====================

/**
 * 获取 Agent 的记忆
 * 
 * @param agentId Agent ID
 * @returns Agent 记忆（如果不存在则返回初始化的空记忆）
 */
export function getAgentMemory(agentId: string): AgentMemory {
  if (typeof window === "undefined") {
    return createEmptyMemory(agentId);
  }

  const key = MEMORY_KEY_PREFIX + agentId;
  const stored = localStorage.getItem(key);
  
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return createEmptyMemory(agentId);
    }
  }
  
  return createEmptyMemory(agentId);
}

/**
 * 保存 Agent 的记忆
 * 
 * @param memory Agent 记忆
 */
export function saveAgentMemory(memory: AgentMemory): void {
  if (typeof window === "undefined") return;
  
  const key = MEMORY_KEY_PREFIX + memory.agentId;
  localStorage.setItem(key, JSON.stringify(memory));
}

/**
 * 创建空记忆
 */
function createEmptyMemory(agentId: string, agentName?: string, agentRole?: string): AgentMemory {
  return {
    agentId,
    agentName: agentName || agentId,
    agentRole: agentRole || "未知",
    episodeDecisions: [],
    personalityTraits: {
      avgConviction: 50,
      swayability: 0.5,
      accuracyHistory: [],
      favoriteKeywords: [],
      emotionVolatility: 0,
      consensusRate: 0.5,
    },
    trustScores: {},
    stats: {
      totalSimulations: 0,
      avgConvergenceRounds: 0,
      lastSimulationTime: 0,
    },
  };
}

/**
 * 删除 Agent 的记忆
 * 
 * @param agentId Agent ID
 */
export function deleteAgentMemory(agentId: string): void {
  if (typeof window === "undefined") return;
  
  const key = MEMORY_KEY_PREFIX + agentId;
  localStorage.removeItem(key);
}

/**
 * 清除所有 Agent 的记忆
 */
export function clearAllMemories(): void {
  if (typeof window === "undefined") return;
  
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(MEMORY_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// ==================== 记忆更新函数 ====================

/**
 * 更新 Agent 的短期记忆（添加一次推演记录）
 * 
 * @param agentId Agent ID
 * @param agentName Agent 名称
 * @param agentRole Agent 角色
 * @param newsContent 新闻内容
 * @param rounds 推演轮次数据
 * @param converged 是否收敛
 */
export function updateShortTermMemory(
  agentId: string,
  agentName: string,
  agentRole: string,
  newsContent: string,
  rounds: RoundState[],
  converged: boolean
): void {
  const memory = getAgentMemory(agentId);
  
  // 生成新闻ID（基于内容哈希）
  const newsId = generateNewsId(newsContent);
  
  // 提取该Agent的决策轨迹
  const decisionRounds = rounds.map(round => {
    const state = round.agents.find(a => a.id === agentId);
    return {
      round: round.round,
      emotion: state?.emotion ?? 0,
      reasoning: state?.reasoning ?? "",
      conviction: state?.conviction ?? 50,
    };
  });
  
  const finalState = decisionRounds[decisionRounds.length - 1];
  
  // 创建新的推演记录
  const episodeDecision: EpisodeDecision = {
    newsId,
    newsContent: newsContent.slice(0, 100),
    timestamp: Date.now(),
    rounds: decisionRounds,
    finalEmotion: finalState?.emotion ?? 0,
    finalConviction: finalState?.conviction ?? 50,
    converged,
  };
  
  // 添加到记忆开头（最新优先）
  memory.episodeDecisions.unshift(episodeDecision);
  
  // 限制记忆数量
  if (memory.episodeDecisions.length > MAX_EPISODE_MEMORIES) {
    memory.episodeDecisions = memory.episodeDecisions.slice(0, MAX_EPISODE_MEMORIES);
  }
  
  // 更新统计
  memory.stats.totalSimulations++;
  memory.stats.avgConvergenceRounds = 
    (memory.stats.avgConvergenceRounds * (memory.stats.totalSimulations - 1) + rounds.length) 
    / memory.stats.totalSimulations;
  memory.stats.lastSimulationTime = Date.now();
  
  saveAgentMemory(memory);
}

/**
 * 更新 Agent 的长期记忆（人格特质统计）
 * 
 * 基于历史推演数据计算人格特质
 * 
 * @param agentId Agent ID
 */
export function updateLongTermMemory(agentId: string): void {
  const memory = getAgentMemory(agentId);
  
  if (memory.episodeDecisions.length < 2) {
    return;  // 需要至少2次推演才能计算特质
  }
  
  const decisions = memory.episodeDecisions;
  
  // 计算平均置信度
  const totalConviction = decisions.reduce((sum, d) => sum + d.finalConviction, 0);
  memory.personalityTraits.avgConviction = totalConviction / decisions.length;
  
  // 计算情绪波动率（标准差）
  const emotions = decisions.map(d => d.finalEmotion);
  const meanEmotion = emotions.reduce((a, b) => a + b, 0) / emotions.length;
  const variance = emotions.reduce((sum, e) => sum + Math.pow(e - meanEmotion, 2), 0) / emotions.length;
  memory.personalityTraits.emotionVolatility = Math.sqrt(variance);
  
  // 计算 swayability（与共识一致的比例变化程度）
  const emotionChanges = decisions.slice(1).map((d, i) => {
    const prev = decisions[i].finalEmotion;
    const curr = d.finalEmotion;
    return Math.abs(curr - prev) > 20 ? 1 : 0;  // 情绪大幅变化记为1
  });
  const changeRate = emotionChanges.reduce((a: number, b: number) => a + b, 0) / Math.max(1, emotionChanges.length);
  memory.personalityTraits.swayability = Math.min(1, changeRate);
  
  // 提取最常触发的关键词
  const keywordCounts: Record<string, number> = {};
  decisions.forEach(d => {
    d.rounds.forEach(r => {
      // 简单的关键词提取（实际应用中应该用NLP）
      const words = r.reasoning.split(/[，,。.]/);
      words.forEach(word => {
        if (word.length >= 2 && word.length <= 6) {
          keywordCounts[word] = (keywordCounts[word] || 0) + 1;
        }
      });
    });
  });
  
  const sortedKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
  
  memory.personalityTraits.favoriteKeywords = sortedKeywords;
  
  // 计算与共识一致的比例
  const consensusAlignments = decisions.filter(d => {
    // 简化判断：如果情绪在 -20 到 +20 之间认为与共识一致
    return d.finalEmotion >= -20 && d.finalEmotion <= 20;
  });
  memory.personalityTraits.consensusRate = consensusAlignments.length / decisions.length;
  
  saveAgentMemory(memory);
}

/**
 * 更新 Agent 对其他 Agent 的信任度
 * 
 * @param agentId 当前 Agent ID
 * @param otherAgentId 其他 Agent ID
 * @param trustScore 信任度变化（增量，可以是正数或负数）
 */
export function updateTrustScore(
  agentId: string,
  otherAgentId: string,
  trustScore: number
): void {
  const memory = getAgentMemory(agentId);
  
  // 初始化信任度
  if (!memory.trustScores[otherAgentId]) {
    memory.trustScores[otherAgentId] = 50;  // 默认50
  }
  
  // 更新信任度（限制在 0-100 范围内）
  memory.trustScores[otherAgentId] = Math.max(0, Math.min(100, 
    memory.trustScores[otherAgentId] + trustScore
  ));
  
  saveAgentMemory(memory);
}

/**
 * 基于准确率更新信任度
 * 
 * @param agentId 当前 Agent ID
 * @param otherAgentId 其他 Agent ID
 * @param wasAccurate 其他 Agent 的判断是否准确
 */
export function updateTrustBasedOnAccuracy(
  agentId: string,
  otherAgentId: string,
  wasAccurate: boolean
): void {
  const trustChange = wasAccurate ? 10 : -5;  // 准确+10，不准确-5
  updateTrustScore(agentId, otherAgentId, trustChange);
}

// ==================== 辅助函数 ====================

/**
 * 生成新闻ID（基于内容哈希）
 */
function generateNewsId(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `news_${Math.abs(hash).toString(36)}`;
}

/**
 * 获取所有 Agent 的记忆
 * 
 * @returns 所有 Agent 记忆的数组
 */
export function getAllAgentMemories(): AgentMemory[] {
  if (typeof window === "undefined") return [];
  
  const memories: AgentMemory[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(MEMORY_KEY_PREFIX)) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          memories.push(JSON.parse(stored));
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
  
  return memories;
}

/**
 * 计算 Agent 的影响力（基于历史准确率和信任度）
 * 
 * @param agentId Agent ID
 * @param otherAgentId 其他 Agent ID
 * @returns 影响力分数（0-100）
 */
export function calculateInfluence(
  agentId: string,
  otherAgentId?: string
): number {
  const memory = getAgentMemory(agentId);
  
  // 基础影响力 = 平均置信度
  let influence = memory.personalityTraits.avgConviction;
  
  // 如果有指定其他Agent，加上信任度因素
  if (otherAgentId && memory.trustScores[otherAgentId]) {
    influence = influence * 0.7 + memory.trustScores[otherAgentId] * 0.3;
  }
  
  // 准确率高会增加影响力
  if (memory.personalityTraits.accuracyHistory.length > 0) {
    const avgAccuracy = memory.personalityTraits.accuracyHistory.reduce((a, b) => a + b, 0) 
      / memory.personalityTraits.accuracyHistory.length;
    influence = influence * (0.8 + avgAccuracy * 0.2);
  }
  
  return Math.max(0, Math.min(100, influence));
}