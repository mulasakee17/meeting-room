/**
 * Overshoot_Score 可行性探针
 * 20 事件 (10 UP + 10 DOWN), 测试 LLM 能否区分"反应过度"和"真危机"
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const API_KEY = process.env.DEEPSEEK_API_KEY!;

const EVENTS = [
  // 10 UP (经典 V 型反弹)
  { name: "1987 黑色星期一", news: "1987年10月19日'黑色星期一'，道琼斯指数单日暴跌22.6%，创历史最大单日百分比跌幅。程序化交易和投资组合保险策略引发连锁抛售。全球股市同步暴跌。美联储紧急注入流动性。", actual: "up" },
  { name: "2020 COVID崩盘底", news: "2020年3月23日，标普500触及2191点底部，自高点暴跌34%。同日美联储宣布无限量QE+购买投资级公司债。国会正在谈判2万亿美元CARES法案。全球央行同步行动。", actual: "up" },
  { name: "2001 911袭击", news: "2001年9月11日恐袭后美股停市4天。9月17日重开道指暴跌684点(-7.1%)，航空股暴跌40%+。美联储紧急降息50bp并提供无限流动性。布什政府推出刺激计划。", actual: "up" },
  { name: "2008 TARP救市", news: "2008年10月3日，国会通过7000亿美元TARP救助计划。此前一周国会否决引发恐慌。全球六大央行联合降息。英国推出5000亿英镑银行救助。", actual: "up" },
  { name: "2010 闪电崩盘", news: "2010年5月6日，道指盘中暴跌约1000点(-9%)，部分股票瞬间跌至1美分，随后20分钟收复大部分失地。SEC和CFTC启动调查。算法交易和高频交易被确认为主因。", actual: "up" },
  { name: "2013 Taper恐慌", news: "2013年6月19日，伯南克在FOMC后表示可能今年晚些时候缩减QE。标普当日跌1.4%。他强调缩减≠紧缩。10年期美债收益率飙升。新兴市场货币暴跌。", actual: "up" },
  { name: "2016 英国脱欧", news: "2016年6月24日，英国公投51.9%支持脱欧。英镑暴跌8.1%至31年新低。标普500期货盘前一度跌超5%触发熔断。英格兰银行准备提供2500亿英镑流动性。", actual: "up" },
  { name: "2018 圣诞前夜", news: "2018年12月24日，美股圣诞前夜交易。标普收跌2.7%，自9月高点累计跌19.8%逼近熊市。纳指已入熊市。美联储12月19日刚加息25bp。财长姆努钦召集银行高管反而加剧恐慌。", actual: "up" },
  { name: "2022 英养老金危机", news: "2022年9月28日，英格兰银行紧急宣布无限量购买长期英国国债以遏制养老金LDI抵押品危机。此前减税计划引发国债和英镑暴跌。养老金面临大规模保证金追缴。", actual: "up" },
  { name: "2024 日元套利崩盘", news: "2024年8月5日，日本央行意外加息15bp触发全球日元套利交易大规模平仓。日经225暴跌12.4%。韩国Kospi暴跌8.8%触发熔断。VIX飙升至65。市场恐慌2008式连锁清算。", actual: "up" },

  // 10 DOWN (真危机/持续下跌)
  { name: "2000 互联网泡沫", news: "2000年4月，纳斯达克自3月历史高点5048已跌超17%。微软被裁定违反反垄断法。大量互联网公司盈利不及预期。美联储维持利率6.0%无降息信号。科技股估值达到荒谬水平。", actual: "down" },
  { name: "2007 次贷预警", news: "2007年8月9日，法国巴黎银行冻结三只次贷基金，声称'流动性完全蒸发'。欧洲央行紧急注入950亿欧元。道指暴跌387点。信贷市场开始冻结——这是全球金融危机的第一个明确信号。", actual: "down" },
  { name: "2008 雷曼破产", news: "2008年9月15日，雷曼兄弟申请破产保护——美国史上最大破产案。美国政府拒绝救助雷曼。美林被迫以500亿出售给美银。AIG次日被接管。全球信贷市场冻结。道指暴跌504点。", actual: "down" },
  { name: "2011 美债降级", news: "2011年8月5日盘后，标普将美国主权信用评级从AAA下调至AA+(美国史上首次)。8月8日周一，道指暴跌634点(-5.5%)，标普跌6.7%。欧洲债务危机同步恶化。", actual: "down" },
  { name: "2015 中国A股股灾", news: "2015年8月24日，中国上证综指暴跌8.5%。自6月高点以来已累计跌40%。中国政府连续出台救市措施但市场持续下跌。人民币8月11日突然贬值加剧恐慌。融资余额大幅下降。", actual: "down" },
  { name: "2018 中美贸易战", news: "2018年3月22日，特朗普签署备忘录对中国500亿美元商品加征关税。中国宣布对等反制。全球贸易战担忧爆发。标普500在随后两周跌6%。工业、科技、农业股领跌。", actual: "down" },
  { name: "2020 COVID大流行", news: "2020年3月11日，WHO宣布COVID-19为全球大流行。此前美股已跌14%。所有主要资产类别同步暴跌——债券、黄金、比特币无一幸免。流动性危机爆发。全球供应链中断。", actual: "down" },
  { name: "2022 俄乌战争", news: "2022年2月24日，俄罗斯对乌克兰发动全面军事行动。全球股市暴跌，欧洲股市跌超5%。原油飙升至105美元。欧洲天然气暴涨40%。西方对俄实施全面经济制裁。SWIFT制裁使俄金融体系与全球隔离。", actual: "down" },
  { name: "2022 6月CPI通胀", news: "2022年6月10日公布5月CPI同比8.6%创40年新高。6月13日周一，标普暴跌3.9%正式进入熊市。市场定价美联储可能加息75bp。VIX飙升至35。全球债券收益率集体飙升。", actual: "down" },
  { name: "2025 美国关税冲击", news: "2025年4月2日，美国宣布对所有进口商品征收10%基准关税，对60个贸易逆差国征收额外对等关税。次日全球股市暴跌，标普期货跌4%。VIX飙升至52——2020年3月以来最高。", actual: "down" },
];

const PROMPT = `你是金融市场因子提取器。你的任务是从新闻中提取五个正交因子 + 一个超调评分。

先输出 Overshoot_Score，再输出 5 个核心因子。

========================
Overshoot_Score (-100 ~ +100)
========================

"当前事件描述的市场状态，是否已经处于历史极端区间？市场定价是否已经充分反映了所有坏消息？"

+100：市场极度恐慌/狂热，价格已远远偏离公允价值。强烈的均值回归信号（历史胜率 > 70%）。
0：价格与公允价值基本一致，无显著超调。
-100：市场极度麻木/自满，价格已远远高于公允价值，泡沫破裂风险极高。

关键区分：
- 1987黑色星期一：VIX=150, 单日跌22%, 程序化交易引发机械性抛售 → +85（极度超卖，无基本面恶化）
- 2008雷曼破产：信贷冻结, 连锁违约, 系统性风险 → +20（基本面确实崩塌，不是单纯超调）
- 2020新冠底：无限QE+2万亿刺激, 央行兜底 → +40（恐慌但有政策锚）

约束：Overshoot_Score 描述"价格偏离公允价值的程度"，不是"事件严重程度"。

========================
五个核心因子 (-100 ~ +100)
========================

Factor 1 — Liquidity (流动性): 融资环境。负=收紧, 正=宽松。
Factor 2 — Policy Support (政策支持): 政府/央行支持力度。负=收紧/打压, 正=降息/救助/刺激。
Factor 3 — Fundamental (基本面): 实体经济影响。负=恶化, 正=改善。
Factor 4 — Narrative (叙事动量): 传播持久性(非情绪方向)。负=恐慌叙事主导, 正=乐观叙事主导。
Factor 5 — Uncertainty (不确定性): 0-100, 认知模糊度。

禁止输出: Bullish, Bearish, Sentiment, 涨, 跌, 看涨, 看跌
禁止预测市场方向。

========================
输出格式 (JSON)
========================

{
  "overshoot_score": <number -100~100>,
  "overshoot_reasoning": "<1句理由>",
  "factors": [
    { "category": "liquidity", "value": <number>, "confidence": <number 0-100>, "evidence": "<理由>" },
    { "category": "policy", "value": <number>, "confidence": <number>, "evidence": "<理由>" },
    { "category": "fundamental", "value": <number>, "confidence": <number>, "evidence": "<理由>" },
    { "category": "narrative", "value": <number>, "confidence": <number>, "evidence": "<理由>" },
    { "category": "uncertainty", "value": <number 0-100>, "confidence": <number>, "evidence": "<理由>" }
  ]
}`;

async function probe() {
  let upScores: number[] = [], downScores: number[] = [];
  const details: string[] = [];

  for (const ev of EVENTS) {
    try {
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: `新闻: ${ev.news}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3, max_tokens: 2048,
        }),
      });
      const data = await resp.json() as any;
      const content = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);
      const os = parsed.overshoot_score;
      const reason = parsed.overshoot_reasoning || "";

      if (ev.actual === "up") upScores.push(os);
      else downScores.push(os);

      const tag = ev.actual === "up" ? "UP " : "DN ";
      const bar = os > 0 ? "+".repeat(Math.round(os / 10)) : "-".repeat(Math.round(-os / 10));
      details.push(`${tag} ${ev.name.padEnd(22)} OS=${String(os).padStart(4)} ${bar} ${reason}`);
      console.log(details[details.length - 1]);
    } catch (e) {
      console.log(`💥 ${ev.name}: ${(e as Error).message}`);
    }
  }

  const upAvg = upScores.length > 0 ? upScores.reduce((a,b)=>a+b,0)/upScores.length : 0;
  const downAvg = downScores.length > 0 ? downScores.reduce((a,b)=>a+b,0)/downScores.length : 0;
  const upAbove50 = upScores.filter(s => s > 50).length;
  const downAbove50 = downScores.filter(s => s > 50).length;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`UP  事件 (${upScores.length}个): 平均 OS=${upAvg.toFixed(1)}  OS>50: ${upAbove50}/${upScores.length}  分布: [${upScores.join(", ")}]`);
  console.log(`DOWN事件 (${downScores.length}个): 平均 OS=${downAvg.toFixed(1)}  OS>50: ${downAbove50}/${downScores.length}  分布: [${downScores.join(", ")}]`);
  console.log(`\n分离度 = UP_avg - DOWN_avg = ${(upAvg - downAvg).toFixed(1)}`);
  if (upAvg > downAvg + 20) {
    console.log(`✅ Overshoot_Score 能有效区分 UP/DOWN!`);
  } else if (upAvg > downAvg + 5) {
    console.log(`⚠️ 有微弱区分度, 需要调整阈值`);
  } else {
    console.log(`❌ 无法区分, Overshoot_Score 不能解决偏空问题`);
  }
}
probe();
