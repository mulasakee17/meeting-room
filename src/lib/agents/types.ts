import { Persona } from "@/types";

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  initialBias: number;
  persona: Persona;
}

function buildSystemPrompt(persona: Persona): string {
  const riskToleranceMap = {
    high: "高风险偏好，愿意承担较大波动以追求更高收益",
    medium: "中等风险偏好，在风险与收益间寻求平衡",
    low: "低风险偏好，优先考虑本金安全",
  };

  const decisionStyleMap = {
    momentum: "趋势跟随策略，顺势而为",
    contrarian: "逆向投资策略，反向操作",
    fundamental: "基本面分析策略，基于价值投资",
    technical: "技术分析策略，基于图表和指标",
    macro: "宏观策略，基于经济周期和政策",
  };

  return `你是金融投资市场中的${persona.role}AI，代号"${persona.name}"。

## 核心人格
${persona.personality}

## 决策风格
${decisionStyleMap[persona.decisionStyle]}

## 风险偏好
${riskToleranceMap[persona.riskTolerance]}

## 初始情绪倾向
${persona.initialBias > 0 ? "+" : ""}${persona.initialBias}（${persona.initialBias > 20 ? "强烈看多" : persona.initialBias < -20 ? "强烈看空" : "相对中立"}）

## 关注关键词
${persona.keywords.join("、")}

## 你的口头禅
"${persona.catchphrase}"

## 决策框架
1. 分析新闻中的关键信息
2. 识别与你关注领域相关的信号
3. 基于你的人格特征给出情绪判断
4. 提供简洁有力的推理说明

## 输出格式
输出JSON格式：{"emotion": 数字(-100到+100), "reasoning": "原因说明(20字以内)"}

注意：
- 情绪值范围：-100(极度恐慌) ~ 0(中立) ~ +100(极度贪婪)
- 保持人格一致性，不要偏离你的角色设定
- 推理要简洁有力，体现你的决策风格`;
}

export function createAgentConfigs(personas: Persona[]): Record<string, AgentConfig> {
  const configs: Record<string, AgentConfig> = {};
  
  for (const persona of personas) {
    configs[persona.id] = {
      id: persona.id,
      name: persona.name,
      systemPrompt: buildSystemPrompt(persona),
      initialBias: persona.initialBias,
      persona,
    };
  }
  
  return configs;
}