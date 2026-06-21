/**
 * 社交网络拓扑模块
 * 
 * 实现三种预置网络拓扑：
 * 1. 小世界网络 - 信息传播有延迟，观点呈斑块状分布
 * 2. 回音室网络 - 群体极化，两个极端阵营互不沟通
 * 3. 层级网络 - 舆论瀑布，权威观点迅速放大
 */

// ==================== 类型定义 ====================

/**
 * 社交网络图结构
 */
export interface SocialGraph {
  nodes: string[];                          // Agent ID 列表
  edges: Record<string, Record<string, number>>;  // fromId → toId → 影响力权重
}

/**
 * 网络拓扑类型
 */
export type NetworkTopologyType = "small_world" | "echo_chamber" | "hierarchical" | "custom";

/**
 * 网络配置
 */
export interface NetworkConfig {
  type: NetworkTopologyType;
  agentIds: string[];
  customEdges?: Record<string, Record<string, number>>;  // 自定义边（仅 custom 类型使用）
  params?: {
    // 小世界网络参数
    clusteringCoeff?: number;   // 聚类系数（0-1）
    shortcutProb?: number;      // 短路概率（0-1）
    
    // 回音室网络参数
    campGroups?: Record<string, string[]>;  // 阵营分组
    
    // 层级网络参数
    authorities?: string[];     // 权威节点列表
    followers?: string[];       // 跟随者节点列表
  };
}

// ==================== 网络拓扑构建函数 ====================

/**
 * 构建社交网络图
 * 
 * @param config 网络配置
 * @returns 社交网络图
 */
export function buildSocialGraph(config: NetworkConfig): SocialGraph {
  switch (config.type) {
    case "small_world":
      return buildSmallWorldNetwork(config);
    case "echo_chamber":
      return buildEchoChamberNetwork(config);
    case "hierarchical":
      return buildHierarchicalNetwork(config);
    case "custom":
      return buildCustomNetwork(config);
    default:
      throw new Error(`未知的网络拓扑类型: ${config.type}`);
  }
}

/**
 * 小世界网络
 * 
 * 特点：
 * - 大部分 Agent 只连接邻近节点
 * - 少数"超级连接者"桥接不同群体
 * - 信息传播有延迟，观点呈斑块状分布
 */
function buildSmallWorldNetwork(config: NetworkConfig): SocialGraph {
  const nodes = config.agentIds;
  const edges: Record<string, Record<string, number>> = {};
  const clusteringCoeff = config.params?.clusteringCoeff ?? 0.6;
  const shortcutProb = config.params?.shortcutProb ?? 0.1;

  // 初始化边
  nodes.forEach(id => {
    edges[id] = {};
  });

  // 1. 构建局部连接（邻近节点）
  const n = nodes.length;
  const k = Math.floor(n * clusteringCoeff);  // 每个节点的邻居数量

  for (let i = 0; i < n; i++) {
    const nodeId = nodes[i];
    
    // 连接左右邻居（环形结构）
    for (let j = 1; j <= k / 2; j++) {
      const leftNeighbor = nodes[(i - j + n) % n];
      const rightNeighbor = nodes[(i + j) % n];
      
      // 影响力权重（邻居越近权重越高）
      const weight = 0.3 - (j * 0.05);
      edges[nodeId][leftNeighbor] = weight;
      edges[nodeId][rightNeighbor] = weight;
    }
  }

  // 2. 添加短路连接（跨群体桥接）
  for (let i = 0; i < n; i++) {
    if (Math.random() < shortcutProb) {
      const nodeId = nodes[i];
      // 随机选择一个远距离节点
      const distantIdx = Math.floor(Math.random() * n);
      if (distantIdx !== i) {
        const distantNode = nodes[distantIdx];
        edges[nodeId][distantNode] = 0.1;  // 短路连接权重较低
      }
    }
  }

  return { nodes, edges };
}

/**
 * 回音室网络
 * 
 * 特点：
 * - 同类 Agent 互相连接，异类隔离
 * - 群体极化，两个极端阵营互不沟通
 * - 信息在阵营内自我强化
 */
function buildEchoChamberNetwork(config: NetworkConfig): SocialGraph {
  const nodes = config.agentIds;
  const edges: Record<string, Record<string, number>> = {};
  const campGroups = config.params?.campGroups || defaultCampGroups(nodes);

  // 初始化边
  nodes.forEach(id => {
    edges[id] = {};
  });

  // 按阵营分组构建连接
  Object.entries(campGroups).forEach(([camp, campNodes]) => {
    // 同阵营内互相连接（高权重）
    campNodes.forEach(fromId => {
      campNodes.forEach(toId => {
        if (fromId !== toId) {
          // 同阵营影响力权重高
          edges[fromId][toId] = 0.4;
        }
      });
    });

    // 异阵营之间连接（低权重或负权重）
    const otherCamps = Object.entries(campGroups)
      .filter(([c]) => c !== camp)
      .flatMap(([_, nodes]) => nodes);

    campNodes.forEach(fromId => {
      otherCamps.forEach(toId => {
        // 异阵营影响力权重低或负（互不信任）
        const isOpposite = isOppositeCamp(camp, getCampByAgent(toId, campGroups));
        edges[fromId][toId] = isOpposite ? -0.1 : 0.05;
      });
    });
  });

  return { nodes, edges };
}

/**
 * 层级网络
 * 
 * 特点：
 * - 少数"权威"Agent 向多数"跟随者"单向传播
 * - 舆论瀑布，权威观点迅速放大
 * - 权威一旦判断失误，引发连锁踩踏
 */
function buildHierarchicalNetwork(config: NetworkConfig): SocialGraph {
  const nodes = config.agentIds;
  const edges: Record<string, Record<string, number>> = {};
  const authorities = config.params?.authorities || nodes.slice(0, 2);  // 默认前2个为权威
  const followers = config.params?.followers || nodes.slice(2);  // 其余为跟随者

  // 初始化边
  nodes.forEach(id => {
    edges[id] = {};
  });

  // 1. 权威之间的连接（互相影响）
  authorities.forEach(fromId => {
    authorities.forEach(toId => {
      if (fromId !== toId) {
        edges[fromId][toId] = 0.3;  // 权威之间中等影响力
      }
    });
  });

  // 2. 权威 → 跟随者（单向高影响力）
  authorities.forEach(authId => {
    followers.forEach(followerId => {
      edges[followerId][authId] = 0.5;  // 跟随者受权威高影响
      edges[authId][followerId] = 0.05;  // 权威几乎不受跟随者影响
    });
  });

  // 3. 跟随者之间的连接（弱连接）
  followers.forEach(fromId => {
    followers.forEach(toId => {
      if (fromId !== toId) {
        edges[fromId][toId] = 0.1;  // 跟随者之间弱影响
      }
    });
  });

  return { nodes, edges };
}

/**
 * 自定义网络
 * 
 * 使用用户提供的自定义边配置
 */
function buildCustomNetwork(config: NetworkConfig): SocialGraph {
  const nodes = config.agentIds;
  const edges = config.customEdges || {};

  // 确保所有节点都有边记录
  nodes.forEach(id => {
    if (!edges[id]) {
      edges[id] = {};
    }
  });

  return { nodes, edges };
}

// ==================== 辅助函数 ====================

/**
 * 默认阵营分组
 * 
 * @param agentIds Agent ID列表
 * @returns 阵营分组
 */
function defaultCampGroups(agentIds: string[]): Record<string, string[]> {
  const camps: Record<string, string[]> = {
    bull: [],
    bear: [],
    neutral: [],
    tech: [],
    macro: [],
  };

  agentIds.forEach(id => {
    // 根据ID推断阵营
    if (id.includes('bull') || id.includes('Bull')) {
      camps.bull.push(id);
    } else if (id.includes('bear') || id.includes('Bear')) {
      camps.bear.push(id);
    } else if (id.includes('neutral') || id.includes('Neutral')) {
      camps.neutral.push(id);
    } else if (id.includes('tech') || id.includes('Tech')) {
      camps.tech.push(id);
    } else if (id.includes('macro') || id.includes('Macro')) {
      camps.macro.push(id);
    } else {
      // 散户根据编号分配
      const num = parseInt(id.replace(/[^0-9]/g, '')) || 0;
      if (num % 5 === 0) camps.bull.push(id);
      else if (num % 5 === 1) camps.bear.push(id);
      else if (num % 5 === 2) camps.neutral.push(id);
      else if (num % 5 === 3) camps.tech.push(id);
      else camps.macro.push(id);
    }
  });

  return camps;
}

/**
 * 判断是否为对立阵营
 */
function isOppositeCamp(camp1: string, camp2: string): boolean {
  const opposites: Record<string, string> = {
    bull: 'bear',
    bear: 'bull',
  };
  return opposites[camp1] === camp2;
}

/**
 * 获取Agent所属阵营
 */
function getCampByAgent(agentId: string, campGroups: Record<string, string[]>): string {
  for (const [camp, agents] of Object.entries(campGroups)) {
    if (agents.includes(agentId)) return camp;
  }
  return 'neutral';
}

// ==================== 信息扩散函数 ====================

/**
 * 信息扩散模拟
 * 
 * 模拟信息在社交网络中的传播过程
 * 
 * @param graph 社交网络图
 * @param initialStates 初始状态（Agent的情绪值）
 * @param rounds 扩散轮次
 * @returns 每轮扩散后的状态
 */
export function simulateInformationDiffusion(
  graph: SocialGraph,
  initialStates: Record<string, number>,
  rounds: number = 3
): Record<string, number>[] {
  const history: Record<string, number>[] = [initialStates];
  let currentStates = { ...initialStates };

  for (let r = 0; r < rounds; r++) {
    const newStates: Record<string, number> = {};

    graph.nodes.forEach(agentId => {
      // 计算邻居的影响
      let influence = 0;
      const neighbors = graph.edges[agentId] || {};

      Object.entries(neighbors).forEach(([neighborId, weight]) => {
        const neighborEmotion = currentStates[neighborId] || 0;
        influence += weight * neighborEmotion;
      });

      // 更新状态（受邻居影响）
      const currentEmotion = currentStates[agentId] || 0;
      newStates[agentId] = currentEmotion + influence * 0.3;  // 30% 受邻居影响
    });

    currentStates = newStates;
    history.push(currentStates);
  }

  return history;
}

// ==================== 导出 ====================

export const NetworkPresets = {
  small_world: {
    name: "小世界网络",
    description: "大部分Agent只连接邻近节点，少数超级连接者桥接不同群体",
    params: { clusteringCoeff: 0.6, shortcutProb: 0.1 },
  },
  echo_chamber: {
    name: "回音室网络",
    description: "同类Agent互相连接，异类隔离，群体极化",
    params: {},
  },
  hierarchical: {
    name: "层级网络",
    description: "少数权威向多数跟随者单向传播，舆论瀑布",
    params: {},
  },
};