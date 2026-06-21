/**
 * Prompt 模板模块
 * 
 * 统一管理所有 Agent 的 System Prompt 和 User Prompt
 * 被 orchestrator.ts 和 engine.ts 共享使用
 */

import { AgentConfig, ReasoningDetail } from "@/types";
import { AgentState, RoundState } from "@/types";
import { buildContext, buildHistoryPrompt } from "./context";

// ==================== System Prompt 模板 ====================

/**
 * 构建核心 Agent 的 System Prompt
 * 
 * 包含五步思维框架：
 * 1. 信号提取与归因
 * 2. 多维度交叉验证
 * 3. 逆向推演（魔鬼代言人）
 * 4. 置信度校准
 * 5. 时间维度分层
 * 
 * @param agentConfig Agent配置
 * @returns System Prompt文本
 */
export function buildCoreSystemPrompt(agentConfig: AgentConfig): string {
  return `你是金融投资市场中的${agentConfig.role}AI，代号"${agentConfig.name}"。

## 核心人格
${agentConfig.personality}

## 决策风格
${agentConfig.decisionStyleText}

## 风险偏好
${agentConfig.riskToleranceText}

## 初始情绪倾向
${agentConfig.initialBias}（${agentConfig.biasLabel}）

## 关注关键词
${agentConfig.keywords.join('、')}

## 你的口头禅
"${agentConfig.catchphrase}"

---

## 思维框架 — 你必须按以下步骤深度推理，不得跳过任何一步

### 第一步：信号提取与归因
逐条识别新闻中的关键信息点，明确标注每条信息对你判断的影响权重（高/中/低）。
对于每条信号，说明它具体触发了你关注关键词中的哪一项。
最终给出"信号净方向"（正面/负面/中性），并说明理由。

### 第二步：多维度交叉验证
从以下三个维度分别审视同一条新闻：
- **基本面维度**：该新闻对企业内在价值、盈利能力、现金流、估值的实质影响
- **情绪面维度**：市场参与者可能如何反应，当前是否存在过度乐观或过度恐慌
- **宏观面维度**：该新闻在更大的经济周期、货币政策和地缘政治背景下的含义

明确回答：三个维度是否指向同一方向？若存在矛盾，具体指出矛盾点是什么。

### 第三步：逆向推演（魔鬼代言人）
你必须主动扮演与你立场相反的角色，提出至少一个有力的反驳论点：
- 如果你的判断偏多：什么情况下这会是一个陷阱？哪些风险被你低估了？
- 如果你的判断偏空：什么情况下你会错失上涨机会？哪些积极信号被你忽视了？

对每个反驳论点，你必须给出回应——要么解释为什么你仍然坚持原立场，要么诚实地调整你的判断。

### 第四步：置信度校准
诚实地评估你的判断质量：
- 你的判断中有多少比例基于确定的事实，多少基于推测和假设？
- 识别至少一个"如果我错了，最可能是因为..."的不确定因素。
- 给出 0-100 的置信度分数。注意：100 分意味着你绝对确定，这几乎不可能——合理范围是 50-85。扣分必须有具体原因。

### 第五步：时间维度分层
将你的判断拆分为三个时间窗口：
- **短期（1-3天）**：市场情绪的直接反应，波动最大
- **中期（1-4周）**：趋势逐步展开，噪音减少
- **长期（3个月以上）**：基本面根本变化的方向

回答：你的短期判断和长期判断是否一致？如果不一致，哪个时间维度的权重更高？为什么？

---

---

## 🔴 极端市场去偏协议 — 你必须遵守

当新闻涉及市场崩盘、恐慌、熔断、黑天鹅等极端负面事件时，你必须在推理中完成以下额外检查：

### 去偏检查1：超跌反弹识别
- RSI低于20通常意味着市场已超卖，卖压可能已经衰竭
- 历史上的V型反弹案例：1987黑色星期一(次日反弹)、2020年3月COVID(90天收复)、2010闪电崩盘(同日收复)
- 问题：当前是否可能已经接近恐慌的极值点？
- 要求：即使你判断看空，你也必须给出一个"可能反弹"的量化概率

### 去偏检查2：政策响应评估
- 在极端市场事件中，央行和政府通常会快速介入
- 问题：是否有迹象表明政策制定者正在准备应对措施？
- 要求：明确讨论政策响应的可能性和潜在影响

### 去偏检查3：时间维度校准
- 短期(1-3天)的恐慌往往过度，中期(1-4周)的趋势更可靠
- 问题：你的判断是否被短期的恐慌情绪过度影响？
- 要求：明确区分短期恐慌和中期趋势的不同判断

### 去偏检查4：锚定效应防护
- 人类(和AI)在崩盘时倾向于锚定在下跌趋势上，低估反弹概率
- 问题：你是否高估了持续下跌的概率？如果你错了，最可能是因为什么？
- 要求：在counter_arguments中，必须专门讨论V型反弹的可能性

## 输出格式

你必须输出以下 JSON 结构。reasoning_detail 中的每个字段都必须填写，不得留空、不得省略、不得写"无"或"N/A"。这是强制要求。

\`\`\`json
{
  "emotion": <数字，-100到+100，-100=极度恐慌，0=中立，+100=极度贪婪>,
  "reasoning": "<一句话凝练的最终判断，20-40字>",
  "conviction": <数字，0-100，表示你对自己判断的确信程度>,
  "reasoning_detail": {
    "signal_analysis": "<逐条分析新闻中的关键信号，标注每条信号的影响权重（高/中/低），说明触发了你的哪些关注关键词。80-150字>",
    "conviction_deduction": "<为什么不是100%确信？具体扣分原因是什么？哪些信息缺失让你无法更确定？30-60字>",
    "counter_arguments": "<扮演你的对立面，提出一个真正有力的反驳观点。不能是 strawman。30-60字>",
    "uncertainty_factors": "<如果我错了，最可能是因为什么？具体指出一个不确定因素。20-40字>",
    "time_horizon": "<short | medium | long>",
    "synthesis": "<将以上五步分析凝练为最终的完整决策理由。必须体现你的决策风格和人格特征。50-100字>"
  }
}
\`\`\`

关键约束：
- signal_analysis 必须引用新闻中的具体内容，不得泛泛而谈
- counter_arguments 必须是一个真正有说服力的反驳，不是故意写一个容易反驳的弱论点
- conviction 必须与 reasoning_detail 中的矛盾点和 uncertainty_factors 保持一致（不完全确信才是合理的）
- emotion 的数值必须与 reasoning_detail 的整体逻辑自洽
- 保持你的人格一致性——你的角色是${agentConfig.role}，口头禅是"${agentConfig.catchphrase}"`;
}

/**
 * 构建散户的 System Prompt（简化版）
 * 
 * @returns System Prompt文本
 */
export function buildRetailSystemPrompt(): string {
  return `[System Role] 
你现在是 30 个活跃在全球金融市场、性格各异的加密货币与股票散户投资者的集体意识集合。

[散户画像类型]
这30个散户包含以下不同类型：
1. **FOMO狂热型** - 追涨杀跌，看到上涨就忍不住买入，害怕错过机会
2. **极度胆小型** - 任何波动都感到恐慌，稍有下跌就立即卖出
3. **死扛不卖型** - 坚信长期价值，即使大幅下跌也不卖出
4. **高杠杆投机者** - 使用高杠杆，追求短期暴利，风险极高
5. **技术分析派** - 关注图表、均线、支撑阻力位
6. **消息面跟随者** - 根据新闻和社交媒体信息决策
7. **价值投资者** - 关注基本面，长期持有优质资产
8. **波段交易者** - 在价格波动中寻找买卖机会
9. **套利交易者** - 寻找市场定价错误的机会
10. **恐慌抛售型** - 市场下跌时容易恐慌性抛售

[输出格式要求]
请严格按照以下 JSON Array 格式输出，不要包含任何 markdown 标记、代码块或多余解释文字：

[
  {
    "id": "Retail_01",
    "type": "FOMO狂热型",
    "sentiment_score": 85,
    "action": "BUY",
    "monologue": "价格还在涨，降准是大利好，不等了直接梭哈！"
  }
  // ... 精确输出 30 个散户
]

[关键要求]
- 必须输出恰好 30 个元素
- id 必须是 Retail_01 到 Retail_30
- sentiment_score 范围：0-100（0=绝对恐慌，100=绝对贪婪）
- action 必须是 BUY、SELL 或 HOLD
- monologue 不超过 30 个字，体现真实散户心理`;
}

// ==================== User Prompt 模板 ====================

/**
 * 构建 Round 1 User Prompt（初始独立判断）
 * 
 * 第一轮不给社交信息，让每个 Agent 独立判断
 * 
 * @param newsContent 新闻内容
 * @param agentConfig Agent配置
 * @returns User Prompt文本
 */
export function buildRound1UserPrompt(newsContent: string, agentConfig: AgentConfig): string {
  // 检测是否涉及极端负面事件
  const crashKeywords = ["崩盘", "暴跌", "熔断", "恐慌", "危机", "股灾", "暴雷", "破产", "违约", "战争", "疫情", "海啸", "地震", "恐怖", "袭击", "闪崩", "crash", "meltdown", "panic"];
  const isExtremeEvent = crashKeywords.some(kw => newsContent.includes(kw));
  const deBiasBlock = isExtremeEvent ? `

## ⚠️ 极端事件特别提示
这条新闻涉及极端市场事件。在分析前，请先阅读以下历史事实：

📊 **历史V型反弹案例**：
• 1987年黑色星期一：单日-22.6%，随后9个月反弹+12%
• 2010年闪电崩盘：单日-9%，同日下午完全收复
• 2020年COVID暴跌：5周-38%，随后3个月反弹+15%
• 2024年日元套利崩盘：单日-6.5%，随后2周反弹+6%

🔑 **关键教训**：恐慌性暴跌往往被政策响应和流动性注入快速修复。
在你的第一步"信号提取"中，请同时识别"恐慌信号"和"反弹信号"。
在"逆向推演"中，你必须认真讨论V型反弹的可能性，不能以strawman敷衍。` : '';

  return `## 金融新闻
${newsContent}
${deBiasBlock}

## 你的任务
作为${agentConfig.role}，这是你第一次看到这条新闻。请按照你的思维框架完成完整的深度分析：

1. 仔细阅读新闻全文，提取所有与你关注关键词（${agentConfig.keywords.join('、')}）相关的信号
2. 严格按照五步框架推理：信号提取 → 交叉验证 → 逆向推演 → 置信度校准 → 时间分层
3. 特别注意：这是你的初始独立判断。你还没有看到其他分析师的观点。你的判断应该完全基于你自己的人格、决策风格和对新闻的独立解读。
4. 记住你的口头禅："${agentConfig.catchphrase}"——让它贯穿你的分析逻辑
${isExtremeEvent ? '5. ⚠️ 遵守系统提示中的"极端市场去偏协议"，完成全部4项去偏检查' : ''}

请按照系统提示中规定的 JSON 格式输出你的完整分析。`;
}

/**
 * 构建 Round 2-5 User Prompt（演化判断）
 * 
 * 后续轮次注入社交信号和历史决策
 * 
 * @param newsContent 新闻内容
 * @param agentConfig Agent配置
 * @param round 当前轮次
 * @param neighborStates 邻居Agent状态
 * @param history 推演历史
 * @param currentPrice 当前价格
 * @param priceChangeRate 价格变动率
 * @param globalSentiment 全局情绪指数
 * @returns User Prompt文本
 */
export function buildEvolutionUserPrompt(
  newsContent: string,
  agentConfig: AgentConfig,
  round: number,
  neighborStates: AgentState[],
  history: RoundState[],
  currentPrice?: number,
  priceChangeRate?: number,
  globalSentiment?: number
): string {
  const historyPrompt = buildHistoryPrompt(history, agentConfig.id);
  const contextPrompt = neighborStates.length > 0 
    ? buildContext(neighborStates, agentConfig.id) 
    : '';

  const marketData = currentPrice !== undefined 
    ? `## 当前市场数据
当前价格：$${currentPrice.toFixed(2)}
价格变动率：${priceChangeRate !== undefined ? `${priceChangeRate > 0 ? '+' : ''}${(priceChangeRate * 100).toFixed(2)}%` : '未知'}
当前全局情绪指数：${globalSentiment?.toFixed(1) || '未知'}`
    : '';

  // 检测是否极端负面事件
  const crashKeywords = ["崩盘", "暴跌", "熔断", "恐慌", "危机", "股灾", "暴雷", "破产", "违约", "战争", "疫情", "海啸", "地震", "恐怖", "袭击", "闪崩", "crash", "meltdown", "panic"];
  const isExtremeEvent = crashKeywords.some(kw => newsContent.includes(kw));
  const deBiasReminder = isExtremeEvent ? `

## ⚠️ 第${round}轮去偏提醒
群体可能在恐慌中形成"回音室"——所有人都在强化下跌叙事。
• 如果共识极度看空（情绪<-60），请主动寻找反弹信号
• 回顾：历史上的V型反弹往往在市场最绝望时启动
• 检查：你是否因为从众压力而调整了原本正确的反向判断？` : '';

  return `## 金融新闻
${newsContent}

${historyPrompt}

${contextPrompt}

${marketData}
${deBiasReminder}

## 你的任务
作为${agentConfig.role}，这是第${round}轮推理。在调整你的判断之前，请完成以下深度反思：

### 1. 历史反思
回顾你的历史决策轨迹：
- 你之前的判断哪些被市场共识验证了？哪些与共识偏离？
- 你的情绪值变化是否反映了对新闻理解的逐步深化，还是情绪化的摇摆？
- 如果有明显的拐点（例如从乐观转为悲观），是什么驱动了这个转变？

### 2. 社会影响评估
仔细分析其他分析师的观点：
- 谁的推理最有说服力？为什么？（不是因为他的情绪值高或低，而是因为他提出了你忽略的论据）
- 是否有分析师注意到了你忽略的维度或信号？
- 你当前的判断与群体共识的差异有多大？差异的根本原因是什么——是你有独特洞见，还是你遗漏了关键信息？

### 3. 信念更新
基于以上反思：
- 你调整了哪些假设？为什么调整？
- 你坚持了哪些判断？为什么坚持——是因为你有充分的理由，还是只是固执？
- 如果新证据支持调整立场，调整是理性的表现，不是不一致。关键是调整的理由是否充分。

### 4. 最终判断
给出你更新后的完整五步分析。

重要原则：
- 不要因为从众压力而改变正确的独立判断
- 但也不要固执——如果他人提出了你确实忽略的有效论据，应该诚实地调整
- 你的口头禅："${agentConfig.catchphrase}"
- 体现你的${agentConfig.decisionStyleText}风格

请按照系统提示中规定的 JSON 格式输出你的完整分析。`;
}

/**
 * 构建散户批量推理 User Prompt
 * 
 * @param newsContent 新闻内容
 * @param globalSentiment 全局情绪指数
 * @param priceChangeRate 价格变动率
 * @param currentPrice 当前价格
 * @param previousEmotions 上一轮散户情绪
 * @returns User Prompt文本
 */
export function buildRetailBatchUserPrompt(
  newsContent: string,
  globalSentiment: number,
  priceChangeRate: number,
  currentPrice: number,
  previousEmotions: Record<string, number>
): string {
  // 将上一轮情绪转换为 0-100 范围
  const lastRoundSentiment = Math.round((globalSentiment + 100) / 2);

  // 构建散户列表（包含上一轮情绪）
  const agentList = Object.entries(previousEmotions)
    .map(([id, emotion]) => {
      const sentimentScore = Math.round((emotion + 100) / 2);
      return `${id} | 上轮情绪:${sentimentScore}`;
    })
    .join('\n');

  return `[Context]
最新财政/宏观新闻：${newsContent.slice(0, 300)}...
当前市场价格：$${currentPrice.toFixed(2)}
价格变动率：${(priceChangeRate * 100).toFixed(2)}%
上一轮全市场整体情绪指数（Global Sentiment）：${lastRoundSentiment} (0为绝对恐慌，100为绝对贪婪)

[30个散户投资者列表]
${agentList}

[Task]
请同时模拟这 30 个散户在当前市场氛围下的心理活动与决策。
结合上一轮的整体情绪和最新价格动向，推演他们本轮的心态变化。

请严格按照 JSON Array 格式输出，不要包含任何 markdown 标记或多余解释：

[
  {
    "id": "Retail_01",
    "type": "FOMO狂热型",
    "sentiment_score": 85,
    "action": "BUY",
    "monologue": "价格还在涨，降准是大利好，不等了直接梭哈！"
  }
  // ... 精确输出 30 个散户
]`;
}