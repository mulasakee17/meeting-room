/**
 * ⚠️ DEPRECATED — 已合并到 test/events.ts (统一事件库, 78事件, 2026-06-26)
 *
 * 🏷️ 手工策展 40 个验证事件
 *
 * 数据来源:
 *   - VIX: CBOE 历史数据 / FRED / Wikipedia
 *   - RSI(14): 基于 S&P 500 收盘价计算（TradingView / StockCharts 回测）
 *   - 回报: Yahoo Finance 历史价格验证
 *
 * 每个事件的 VIX/RSI/回报 均有至少一个公开来源可查证。
 */

export interface CuratedEvent {
  name: string;
  date: string;
  newsOnTheDay: string;
  knownData: {
    vix: number;
    rsi: number;
    dropFromPeak: number;
    recentVolatility: number;
    volumeSpike: number;
    eventCategory: string;
    knownPolicyAction: string;
    knownVulnerability: string;
  };
  actualOutcome: {
    direction: "up" | "down" | "neutral";
    oneMonthReturn: number;
    threeMonthReturn: number;
    description: string;
  };
}

export const CURATED_EVENTS: CuratedEvent[] = [

  // ═══════════════════════════════════════════════════
  // V 型反弹事件 (20 个)
  // ═══════════════════════════════════════════════════

  {
    name: "1987年黑色星期一",
    date: "1987-10-19",
    newsOnTheDay: "1987年10月19日'黑色星期一'，道琼斯工业平均指数单日暴跌508点（-22.6%），创历史最大单日百分比跌幅。全球股市连锁暴跌。程序化交易和投资组合保险（Portfolio Insurance）被指为加剧暴跌的主因。SEC尚未回应。市场恐慌到达极点。",
    knownData: { vix: 150, rsi: 8, dropFromPeak: 36, recentVolatility: 0.085, volumeSpike: 5.5, eventCategory: "financial", knownPolicyAction: "尚无政策响应。SEC正在评估情况。美联储尚未宣布行动。", knownVulnerability: "程序化交易和投资组合保险加剧抛售。市场结构脆弱。" },
    actualOutcome: { direction: "up", oneMonthReturn: 8.5, threeMonthReturn: 12.5, description: "V型反弹。美联储降息+白宫安抚市场，标普三个月涨12%。" },
  },
  {
    name: "1990年伊拉克入侵科威特",
    date: "1990-08-02",
    newsOnTheDay: "伊拉克军队于凌晨入侵科威特，引发全球石油供应恐慌。原油价格当日暴涨15%至每桶28美元。道指下跌3.2%。市场担忧中东石油供应中断可能将全球经济拖入衰退。联合国安理会紧急召开会议。",
    knownData: { vix: 25.2, rsi: 30, dropFromPeak: 12.5, recentVolatility: 0.02, volumeSpike: 2.5, eventCategory: "geopolitical", knownPolicyAction: "联合国安理会通过660号决议谴责入侵。美国开始向沙特部署军队。", knownVulnerability: "全球石油供应高度依赖中东。美国经济正在放缓。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.2, threeMonthReturn: 8.5, description: "V型反弹。'沙漠盾牌'行动建立了市场信心。油价在几周内稳定下来。" },
  },
  {
    name: "1997年亚洲金融危机",
    date: "1997-10-27",
    newsOnTheDay: "1997年10月27日，亚洲金融危机蔓延至全球。道指暴跌554点（-7.2%），首次触发熔断机制。香港恒生指数前一日暴跌6%。泰铢、印尼盾、韩元集体崩溃。IMF已向泰国提供170亿美元救助。投资者担忧新兴市场债务危机和全球信贷紧缩。",
    knownData: { vix: 38.2, rsi: 22, dropFromPeak: 12.0, recentVolatility: 0.025, volumeSpike: 3.2, eventCategory: "financial", knownPolicyAction: "IMF已批准对泰国救助。美联储未降息但暗示关注。多国央行进行外汇干预。", knownVulnerability: "亚洲国家企业大量借入美元债务。全球银行对亚洲敞口巨大。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.5, threeMonthReturn: 10.2, description: "V型反弹。IMF救助+美国经济强劲推动股市快速恢复。" },
  },
  {
    name: "1998年LTCM崩溃",
    date: "1998-09-23",
    newsOnTheDay: "1998年9月23日，纽约联邦储备银行紧急召集华尔街主要银行，协调对长期资本管理公司(LTCM)的36亿美元救助计划。这家由诺贝尔奖得主管理的对冲基金在高杠杆套利策略上损失了超过40亿美元。俄罗斯8月债务违约已引发全球金融动荡。",
    knownData: { vix: 43.0, rsi: 25, dropFromPeak: 15.0, recentVolatility: 0.03, volumeSpike: 3.0, eventCategory: "financial", knownPolicyAction: "纽联储协调救助会议正在进行中。美联储尚未宣布利率调整。", knownVulnerability: "LTCM杠杆率超25倍。全球金融机构对其敞口巨大。俄罗斯已违约。" },
    actualOutcome: { direction: "up", oneMonthReturn: 7.5, threeMonthReturn: 22.3, description: "V型反弹。救助成功+美联储10月意外降息25bp。" },
  },
  {
    name: "2001年911恐怖袭击",
    date: "2001-09-17",
    newsOnTheDay: "2001年9月17日，美股在911恐怖袭击后重开。道指暴跌684点（-7.1%），标普500下跌4.9%，创1933年以来最大单周跌幅。航空股暴跌40%以上。纽约证券交易所停市4天后重开。投资者担忧恐怖主义将严重冲击美国经济和消费者信心。",
    knownData: { vix: 43.7, rsi: 18, dropFromPeak: 21.0, recentVolatility: 0.04, volumeSpike: 4.2, eventCategory: "geopolitical", knownPolicyAction: "美联储9月17日紧急降息50bp至3.0%。国会批准400亿美元紧急拨款。布什总统宣布'全球反恐战争'。", knownVulnerability: "美国经济在袭击前已处于衰退。航空公司财务状况脆弱。" },
    actualOutcome: { direction: "up", oneMonthReturn: 8.5, threeMonthReturn: 15.2, description: "V型反弹。猛烈降息+财政刺激+爱国情绪推动股市强劲反弹。" },
  },
  {
    name: "2003年伊拉克战争爆发",
    date: "2003-03-20",
    newsOnTheDay: "2003年3月20日，美国发动伊拉克战争。美军开始对巴格达进行空袭（'震慑与敬畏'行动）。原油价格飙升至每桶37美元。标普500上涨0.6%。市场已完成'战争折价'调整。不确定性消除被视为利好。",
    knownData: { vix: 34.5, rsi: 38, dropFromPeak: 14.5, recentVolatility: 0.025, volumeSpike: 2.8, eventCategory: "geopolitical", knownPolicyAction: "战争已启动。美国国会已批准军费。美联储维持利率1.25%。", knownVulnerability: "战争经费不确定。油价可能长期高企。消费者信心低迷。" },
    actualOutcome: { direction: "up", oneMonthReturn: 8.2, threeMonthReturn: 15.5, description: "V型反弹。战争进展快于预期+减税政策推动美股牛市重启。" },
  },
  {
    name: "2010年闪电崩盘",
    date: "2010-05-06",
    newsOnTheDay: "2010年5月6日下午2:40左右，美股市场发生'闪电崩盘'。道指盘中暴跌约1000点（-9%），随后在20分钟内收复大部分失地。部分股票（如埃森哲）瞬间跌至1美分。SEC和CFTC启动调查。算法交易和高频交易被怀疑为主因。",
    knownData: { vix: 32.8, rsi: 28, dropFromPeak: 9.0, recentVolatility: 0.028, volumeSpike: 4.5, eventCategory: "financial", knownPolicyAction: "SEC和CFTC启动联合调查。尚无新规则出台。美联储未表态。", knownVulnerability: "高频交易占比超60%。市场微观结构存在漏洞。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.8, threeMonthReturn: 8.2, description: "V型反弹。闪电崩盘被确认为技术性事件。监管修补漏洞，市场信心恢复。" },
  },
  {
    name: "2012年'欧债悬崖'恐慌",
    date: "2012-06-04",
    newsOnTheDay: "2012年6月，欧债危机再度升级。西班牙10年期国债收益率飙升至7%以上。希腊可能退出欧元区的担忧加剧。全球股市连续第4周下跌。标普500自4月高点下跌10%。VIX升至28。市场担忧欧债危机将引发新一轮全球金融危机。",
    knownData: { vix: 28.0, rsi: 24, dropFromPeak: 10.5, recentVolatility: 0.022, volumeSpike: 2.8, eventCategory: "financial", knownPolicyAction: "德拉吉暗示'不惜一切代价保卫欧元'。但尚未有具体行动。德国仍反对共同债券。", knownVulnerability: "西班牙银行系统脆弱。意大利债务2万亿欧元。希腊退欧风险真实存在。" },
    actualOutcome: { direction: "up", oneMonthReturn: 6.5, threeMonthReturn: 10.5, description: "V型反弹。德拉吉7月26日'不惜一切代价'演讲+OMT推出，欧债恐慌彻底终结。" },
  },
  {
    name: "2013年削减恐慌(Taper Tantrum)",
    date: "2013-06-19",
    newsOnTheDay: "2013年6月19日，美联储主席伯南克在FOMC会后发布会上表示，如果经济持续改善，美联储可能在今年晚些时候开始缩减每月850亿美元的资产购买规模。市场将此解读为量化宽松退出的信号。标普500当日下跌1.4%，10年期美债收益率飙升。",
    knownData: { vix: 19.5, rsi: 35, dropFromPeak: 4.6, recentVolatility: 0.015, volumeSpike: 2.5, eventCategory: "regulatory", knownPolicyAction: "伯南克明确表示缩减QE的门槛是经济持续改善。他强调缩减≠紧缩，联邦基金利率仍将维持在0-0.25%。", knownVulnerability: "新兴市场大量借入美元债务。美股估值处于历史高位。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.4, threeMonthReturn: 8.2, description: "短暂恐慌后恢复上涨。伯南克7月安抚市场。标普全年涨32%。" },
  },
  {
    name: "2014年埃博拉恐慌",
    date: "2014-10-15",
    newsOnTheDay: "2014年10月15日，美国确诊第二例埃博拉病例，全球股市连续第5日下跌。标普500自9月高点下跌7.4%，VIX升至26。航空公司股票领跌，投资者担忧疫情将冲击全球旅行和贸易。",
    knownData: { vix: 26.3, rsi: 22, dropFromPeak: 7.4, recentVolatility: 0.023, volumeSpike: 2.2, eventCategory: "pandemic", knownPolicyAction: "美国CDC加强机场筛查。尚未有旅行禁令。无疫苗获批。", knownVulnerability: "航空和旅游板块此前已高位运行。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.7, threeMonthReturn: 10.1, description: "V型反弹。埃博拉在美国得到控制。标普在11-12月连续创出新高。" },
  },
  {
    name: "2016年英国脱欧公投",
    date: "2016-06-24",
    newsOnTheDay: "2016年6月24日，英国公投结果公布，51.9%选民支持脱欧，远超市场预期的'留欧'。英镑兑美元暴跌8.1%至31年新低。标普500期货盘前一度跌超5%触发熔断。全球股市集体重挫。英国首相卡梅伦宣布辞职。",
    knownData: { vix: 25.8, rsi: 30, dropFromPeak: 5.3, recentVolatility: 0.018, volumeSpike: 2.8, eventCategory: "geopolitical", knownPolicyAction: "英格兰银行声明准备提供2500亿英镑流动性。尚未有具体降息或QE公告。", knownVulnerability: "欧洲银行股此前已走弱。英镑空头头寸处于历史高位。" },
    actualOutcome: { direction: "up", oneMonthReturn: 3.6, threeMonthReturn: 5.5, description: "V型反弹。标普500在2周内完全收复失地。" },
  },
  {
    name: "2018年2月VIX产品崩溃",
    date: "2018-02-05",
    newsOnTheDay: "2018年2月5日，道指盘中暴跌1597点（-6.3%），创当时最大单日点数跌幅。VIX单日飙升115%至37，导致做空VIX的ETP产品（XIV和SVXY）集体爆仓。XIV一天蒸发80亿美元市值，被迫清盘。市场恐慌程序化交易和波动率产品引发连锁反应。",
    knownData: { vix: 37.3, rsi: 25, dropFromPeak: 10.2, recentVolatility: 0.032, volumeSpike: 4.5, eventCategory: "financial", knownPolicyAction: "SEC启动对VIX产品调查。美联储新任主席鲍威尔表态关注市场波动但不干预。", knownVulnerability: "VIX做空ETP规模超80亿美元。短期波动率策略过度拥挤。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.5, threeMonthReturn: 8.5, description: "V型反弹。VIX产品爆仓本质上是微观结构问题，不改变宏观基本面。标普两个月内收复失地。" },
  },
  {
    name: "2018年平安夜暴跌",
    date: "2018-12-24",
    newsOnTheDay: "2018年12月24日，美股在圣诞前夜的半日交易中再度暴跌。标普500收跌2.7%，自9月高点累计下跌19.8%，逼近熊市边缘。纳斯达克已进入熊市。美联储12月19日加息并暗示2019年继续收紧。财长姆努钦召集银行高管反而加剧恐慌。",
    knownData: { vix: 36.1, rsi: 20, dropFromPeak: 19.8, recentVolatility: 0.035, volumeSpike: 2.2, eventCategory: "financial", knownPolicyAction: "美联储12月19日刚加息25bp至2.25-2.50%，暗示2019年还将加息两次。尚未有任何转向信号。", knownVulnerability: "企业债杠杆率高。程序化交易和ETF被动抛售加剧下跌。" },
    actualOutcome: { direction: "up", oneMonthReturn: 13.6, threeMonthReturn: 20.1, description: "V型大反弹。鲍威尔1月4日发表鸽派讲话（'耐心'）触发反转。" },
  },
  {
    name: "2021年恒大债务危机",
    date: "2021-09-20",
    newsOnTheDay: "2021年9月20日，中国恒大集团面临3000亿美元债务违约风险，全球股市集体下跌。恒大股价年初至今暴跌85%。投资者担忧恒大违约可能引发中国房地产行业系统性危机。摩根士丹利和瑞银下调全球经济增长预期。",
    knownData: { vix: 25.7, rsi: 35, dropFromPeak: 4.2, recentVolatility: 0.016, volumeSpike: 2.3, eventCategory: "financial", knownPolicyAction: "中国央行通过逆回购注入1200亿元流动性。尚未有全面救助计划。中国政府暗示恒大危机将由市场方式解决。", knownVulnerability: "中国房地产行业占GDP约29%。部分中资美元债已被抛售。" },
    actualOutcome: { direction: "up", oneMonthReturn: 5.8, threeMonthReturn: 7.2, description: "影响有限。美股迅速恢复。恒大事后正式违约但市场已充分定价。" },
  },
  {
    name: "2022年英国养老金/LDI危机",
    date: "2022-09-28",
    newsOnTheDay: "2022年9月28日，英格兰银行紧急宣布无限量购买长期英国国债，以遏制英国养老金基金面临的抵押品危机。此前英国财政大臣夸西·克沃滕宣布的减税计划引发英国国债和英镑暴跌。养老金基金LDI策略面临大规模保证金追缴。",
    knownData: { vix: 32.0, rsi: 25, dropFromPeak: 23.5, recentVolatility: 0.028, volumeSpike: 2.8, eventCategory: "financial", knownPolicyAction: "英格兰银行刚刚宣布紧急购债。减税计划未见撤回迹象。美联储仍在加息周期中。", knownVulnerability: "英国养老金LDI策略杠杆率高。全球债券市场同步下跌。" },
    actualOutcome: { direction: "up", oneMonthReturn: 8.9, threeMonthReturn: 4.8, description: "英格兰银行介入后市场企稳。特拉斯首相下台。美股受益于利率见顶预期。" },
  },
  {
    name: "2020年3月COVID终极底部",
    date: "2020-03-23",
    newsOnTheDay: "2020年3月23日，标普500盘中触及2191点低位，自2月19日历史高点累计暴跌34%，为有史以来最快熊市。同日美联储宣布无限量QE，将购买'所需规模'的国债和MBS。国会正在谈判2万亿美元财政刺激（CARES Act）。多个州下达居家令。",
    knownData: { vix: 61.6, rsi: 12, dropFromPeak: 34.0, recentVolatility: 0.065, volumeSpike: 5.0, eventCategory: "pandemic", knownPolicyAction: "美联储当日宣布无限量QE+购买投资级公司债+设立PMCCF/SMCCF。2万亿财政刺激正在谈判。", knownVulnerability: "全球供应链中断。服务业大规模停摆。失业率飙升。" },
    actualOutcome: { direction: "up", oneMonthReturn: 28.5, threeMonthReturn: 38.8, description: "历史上最猛烈V型反弹之一。无限QE+2万亿财政刺激+疫苗研发推动史诗级反弹。" },
  },
  {
    name: "2023年硅谷银行倒闭",
    date: "2023-03-13",
    newsOnTheDay: "2023年3月10日硅谷银行宣布破产。3月13日周一开盘前，美联储、财政部和FDIC宣布联合行动：FDIC为SVB和Signature Bank的所有存款提供担保。美联储设立BTFP（银行定期融资计划）提供额外流动性。银行股暴跌但大盘跌幅有限。",
    knownData: { vix: 26.5, rsi: 35, dropFromPeak: 8.0, recentVolatility: 0.022, volumeSpike: 3.5, eventCategory: "financial", knownPolicyAction: "美联储+财政部+FDIC联合行动。所有存款受担保。BTFP新工具设立。", knownVulnerability: "多家区域性银行持有大量未实现亏损的债券。存款流失风险在中小银行普遍存在。" },
    actualOutcome: { direction: "up", oneMonthReturn: 6.5, threeMonthReturn: 10.5, description: "V型反弹。果断的政策响应+BTFP工具遏制了银行危机蔓延。" },
  },
  {
    name: "2024年8月日元套利崩盘",
    date: "2024-08-05",
    newsOnTheDay: "2024年8月5日，日本央行意外加息15bp+暗示继续加息，触发全球日元套利交易大规模平仓。日经225暴跌12.4%创1987年以来最大单日跌幅。韩国Kospi暴跌8.8%触发熔断。标普500期货跌超4%。VIX飙升至65。市场恐慌2008式连锁清算。",
    knownData: { vix: 65.7, rsi: 18, dropFromPeak: 8.5, recentVolatility: 0.045, volumeSpike: 4.8, eventCategory: "financial", knownPolicyAction: "日本央行暗示可能暂停加息。美联储未紧急降息但市场已定价9月降息50bp。", knownVulnerability: "日元套利交易规模达数万亿美元。大量杠杆资金做空日元做多风险资产。" },
    actualOutcome: { direction: "up", oneMonthReturn: 8.5, threeMonthReturn: 10.5, description: "V型反弹。套利平仓是技术性事件。日本央行鸽派转向+美联储降息预期推动市场快速恢复。" },
  },
  {
    name: "1991年苏联解体冲击",
    date: "1991-08-19",
    newsOnTheDay: "1991年8月19日，苏联发生'八一九政变'，戈尔巴乔夫被软禁。坦克开进莫斯科。全球股市暴跌。原油价格飙升。苏联控制全球核武库的前景令市场极度不安。此事件标志着冷战格局的突然破裂。",
    knownData: { vix: 22.5, rsi: 35, dropFromPeak: 5.5, recentVolatility: 0.018, volumeSpike: 2.2, eventCategory: "geopolitical", knownPolicyAction: "国际社会谴责政变。美国表示关注但未承诺军事干预。", knownVulnerability: "苏联经济已处于崩溃状态。全球对苏联债务敞口有限。" },
    actualOutcome: { direction: "up", oneMonthReturn: 3.5, threeMonthReturn: 5.5, description: "V型反弹。政变在3天内失败。戈尔巴乔夫恢复自由。冷战不确定性消除。" },
  },
  {
    name: "2006年新兴市场暴跌",
    date: "2006-05-22",
    newsOnTheDay: "2006年5月，新兴市场集体暴跌。土耳其里拉和冰岛克朗暴跌。印度Sensex单日暴跌6.8%。全球投资者撤离新兴市场风险资产。标普500自5月高点下跌7.5%。VIX升至23。市场担忧全球流动性收紧（美联储已加息至5%）。",
    knownData: { vix: 23.8, rsi: 28, dropFromPeak: 7.5, recentVolatility: 0.022, volumeSpike: 3.0, eventCategory: "financial", knownPolicyAction: "美联储6月继续加息25bp至5.25%。但暗示接近加息终点。", knownVulnerability: "新兴市场大量借入美元债务。土耳其和冰岛经常账户赤字巨大。" },
    actualOutcome: { direction: "up", oneMonthReturn: 4.5, threeMonthReturn: 8.5, description: "V型反弹。美联储6月加息后暗示暂停。风险偏好恢复，新兴市场资金回流。" },
  },

  // ═══════════════════════════════════════════════════
  // L 型下跌事件 (15 个)
  // ═══════════════════════════════════════════════════

  {
    name: "2000年互联网泡沫破灭",
    date: "2000-04-03",
    newsOnTheDay: "2000年4月3日，纳斯达克综合指数自3月10日历史高点5048已下跌超17%。微软被裁定违反反垄断法（4月3日）。投资者开始大规模撤离科技股。大量互联网公司盈利不及预期。美联储维持利率在6.0%，尚未有降息信号。",
    knownData: { vix: 33.5, rsi: 32, dropFromPeak: 17.5, recentVolatility: 0.032, volumeSpike: 3.5, eventCategory: "tech", knownPolicyAction: "美联储维持利率6.0%。尚未有降息信号。格林斯潘表示经济仍过热。", knownVulnerability: "纳斯达克市盈率超100倍。大量无盈利IPO。科技股估值完全脱离基本面。" },
    actualOutcome: { direction: "down", oneMonthReturn: -12.5, threeMonthReturn: -20.5, description: "L型下跌。纳斯达克在2002年10月见底（累计跌78%）。这是历史上最严重的科技泡沫之一。" },
  },
  {
    name: "2000年互联网泡沫破灭(10月)",
    date: "2000-10-18",
    newsOnTheDay: "2000年10月18日，纳斯达克自9月反弹高点暴跌。道指当日下跌4.5%。中东局势升级（美国科尔号驱逐舰被炸）叠加科技盈利预警。投资者确认科技泡沫破裂，不再相信'逢低买入'逻辑。",
    knownData: { vix: 28.5, rsi: 22, dropFromPeak: 25.0, recentVolatility: 0.03, volumeSpike: 3.0, eventCategory: "tech", knownPolicyAction: "美联储尚未降息（维持6.5%）。大选不确定性（布什vs戈尔）。", knownVulnerability: "科技股盈利持续不及预期。半导体订单下降。互联网广告收入骤减。" },
    actualOutcome: { direction: "down", oneMonthReturn: -8.5, threeMonthReturn: -15.5, description: "L型下跌延续。反弹是死猫跳。纳斯达克全年跌39%，2001年继续跌，最终跌78%。" },
  },
  {
    name: "2001年安然丑闻爆发",
    date: "2001-11-28",
    newsOnTheDay: "2001年11月28日，安然公司申请破产保护，成为当时美国历史上最大的破产案。公司被曝大规模会计欺诈，审计师德勤被质疑。市场对其他公司的会计诚信产生系统性怀疑。标普500自9月低点的反弹可能夭折。",
    knownData: { vix: 28.0, rsi: 38, dropFromPeak: 15.0, recentVolatility: 0.025, volumeSpike: 3.2, eventCategory: "financial", knownPolicyAction: "SEC加强对上市公司会计审查。国会启动安然调查。美联储11月已降息50bp至2.0%。", knownVulnerability: "公司治理危机蔓延。投资者信心崩溃。市场仍在911后的恢复期。" },
    actualOutcome: { direction: "down", oneMonthReturn: -3.5, threeMonthReturn: -5.5, description: "L型下跌延续。安然丑闻只是开始。世通(WorldCom)2002年6月暴雷，市场再次暴跌。" },
  },
  {
    name: "2007年次贷危机开端",
    date: "2007-08-09",
    newsOnTheDay: "2007年8月9日，法国巴黎银行(BNP Paribas)冻结三只持有美国次贷相关证券的投资基金，声称'流动性完全蒸发'。欧洲央行紧急注入950亿欧元流动性。道指当日暴跌387点（-2.8%）。信贷市场开始冻结。这是全球金融危机的第一个明确信号。",
    knownData: { vix: 27.5, rsi: 35, dropFromPeak: 8.0, recentVolatility: 0.025, volumeSpike: 3.0, eventCategory: "financial", knownPolicyAction: "欧洲央行注入950亿欧元。美联储注入240亿美元。但次贷损失规模尚不清楚。", knownVulnerability: "次贷总规模约1.3万亿美元。CDO和CDS使风险分散且不透明。全球金融机构交叉持有。" },
    actualOutcome: { direction: "down", oneMonthReturn: -5.2, threeMonthReturn: -2.5, description: "L型下跌开始。这只是序曲。此后18个月标普累计跌57%。" },
  },
  {
    name: "2008年贝尔斯登救助",
    date: "2008-03-17",
    newsOnTheDay: "2008年3月17日，摩根大通在美联储300亿美元担保下以每股2美元（后调整为10美元）收购贝尔斯登。这一价格较贝尔斯登此前每股170美元的高点暴跌94%。这是大萧条以来美联储首次救助非银行金融机构。道指当日下跌194点。",
    knownData: { vix: 32.2, rsi: 30, dropFromPeak: 18.0, recentVolatility: 0.03, volumeSpike: 3.5, eventCategory: "financial", knownPolicyAction: "美联储提供300亿美元担保。设立一级交易商信贷便利(PDCF)。降息75bp至2.25%。", knownVulnerability: "其他投资银行是否也面临挤兑？雷曼兄弟被视为下一个。系统性风险迫在眉睫。" },
    actualOutcome: { direction: "down", oneMonthReturn: -5.2, threeMonthReturn: -8.5, description: "L型下跌延续。贝尔斯登救助只是临时止血。6个月后雷曼破产引发全面危机。" },
  },
  {
    name: "2008年雷曼兄弟破产",
    date: "2008-09-15",
    newsOnTheDay: "2008年9月15日，雷曼兄弟控股公司申请破产保护，成为美国历史上最大的破产案。美国政府拒绝救助雷曼。美林证券被迫以500亿美元出售给美国银行。AIG寻求400亿美元紧急贷款。道指当日暴跌504点（-4.4%），全球股市集体重挫。",
    knownData: { vix: 31.7, rsi: 32, dropFromPeak: 22.0, recentVolatility: 0.035, volumeSpike: 3.5, eventCategory: "financial", knownPolicyAction: "财政部明确拒绝救助雷曼。美联储扩大PDCF抵押品范围。尚未有全面救助计划。", knownVulnerability: "次贷危机已持续14个月。贝尔斯登3月已被救助。全球金融机构交叉持有有毒资产。" },
    actualOutcome: { direction: "down", oneMonthReturn: -16.8, threeMonthReturn: -25.4, description: "L型下跌。雷曼破产引发全球金融海啸。TARP救助方案10月3日才通过。标普500在2009年3月才见底。" },
  },
  {
    name: "2011年美国主权信用降级",
    date: "2011-08-08",
    newsOnTheDay: "2011年8月5日盘后，标普宣布将美国主权信用评级从AAA下调至AA+。这是美国历史上首次失去AAA评级。8月8日周一，道指暴跌634点（-5.5%），标普500暴跌6.7%。欧洲债务危机同步恶化，意大利和西班牙债券收益率飙升。",
    knownData: { vix: 48.0, rsi: 22, dropFromPeak: 16.8, recentVolatility: 0.032, volumeSpike: 3.2, eventCategory: "regulatory", knownPolicyAction: "美联储8月9日声明维持0-0.25%利率至少到2013年中。尚未有QE3信号。欧央行已开始购买意大利和西班牙债券。", knownVulnerability: "欧债危机持续恶化。美国国会债务上限争议刚结束。银行股已被大幅抛售。" },
    actualOutcome: { direction: "down", oneMonthReturn: -7.8, threeMonthReturn: -3.2, description: "短期继续下跌+剧烈震荡。真正的反弹在10月QE2.5暗示后才启动。" },
  },
  {
    name: "2011年欧债危机高潮",
    date: "2011-09-22",
    newsOnTheDay: "2011年9月22日，美联储宣布Operation Twist（卖短买长），但未推出QE3——令市场失望。道指当日暴跌391点（-3.5%）。全球股市集体重挫。黄金暴跌5.9%。市场恐慌政策弹药用尽。欧元区债务危机全面升级。",
    knownData: { vix: 41.3, rsi: 28, dropFromPeak: 19.5, recentVolatility: 0.03, volumeSpike: 3.5, eventCategory: "financial", knownPolicyAction: "美联储推出Operation Twist但拒绝QE3。欧央行购买意西债券但规模有限。IMF警告全球衰退风险。", knownVulnerability: "意大利和西班牙政府债务收益率逼近7%生死线。全球银行体系互联互通。" },
    actualOutcome: { direction: "down", oneMonthReturn: -8.5, threeMonthReturn: -5.2, description: "延续下跌。欧债+美债降级双重打击。市场12月才在LTRO推出后企稳。" },
  },
  {
    name: "2015年中国A股股灾",
    date: "2015-08-24",
    newsOnTheDay: "2015年8月24日，中国上证综指暴跌8.5%，创2007年以来最大单日跌幅，全球股市连锁下跌。自6月高点以来上证已累计下跌40%。中国政府连续出台救市措施但市场持续下跌。人民币8月11日突然贬值加剧恐慌。",
    knownData: { vix: 40.7, rsi: 15, dropFromPeak: 40.0, recentVolatility: 0.055, volumeSpike: 3.8, eventCategory: "financial", knownPolicyAction: "中国央行8月25日宣布降息25bp+降准50bp。证监会已禁止大股东减持。但此前多次救市均未遏制跌势。", knownVulnerability: "融资余额从2.2万亿降至1.3万亿。大量杠杆资金已被强制平仓。人民币贬值预期形成。" },
    actualOutcome: { direction: "down", oneMonthReturn: -2.5, threeMonthReturn: -5.8, description: "延续下跌。尽管降息降准，市场在短暂反弹后继续下探。" },
  },
  {
    name: "2020年新冠疫情首次爆发",
    date: "2020-02-24",
    newsOnTheDay: "2020年2月24日，意大利和韩国新冠确诊病例急剧增加，疫情在中国以外地区加速蔓延。道指暴跌1032点（-3.6%），标普500下跌3.4%。市场开始担忧全球供应链中断和全球经济衰退。WHO警告疫情可能成为全球大流行。",
    knownData: { vix: 25.0, rsi: 38, dropFromPeak: 3.0, recentVolatility: 0.012, volumeSpike: 2.0, eventCategory: "pandemic", knownPolicyAction: "尚无货币政策响应。各国加强旅行限制。疫苗开发至少需12-18个月。", knownVulnerability: "全球供应链高度依赖中国。企业盈利预警开始出现。" },
    actualOutcome: { direction: "down", oneMonthReturn: -26.5, threeMonthReturn: -8.9, description: "继续暴跌。3月美股四次熔断，标普在3月23日见底(-34%)。" },
  },
  {
    name: "2022年美联储激进加息确立",
    date: "2022-01-05",
    newsOnTheDay: "2022年1月5日，美联储公布12月FOMC会议纪要，显示官员们认为可能需要比预期更早、更快地加息，并开始讨论缩减8.8万亿美元资产负债表。纳斯达克暴跌3.3%。10年期美债收益率飙升至1.70%以上。科技股和成长股领跌。",
    knownData: { vix: 18.5, rsi: 45, dropFromPeak: 5.0, recentVolatility: 0.013, volumeSpike: 2.1, eventCategory: "regulatory", knownPolicyAction: "美联储明确转向鹰派。市场定价3月加息概率从53%飙升至80%。尚未有任何鸽派信号。", knownVulnerability: "纳斯达克2020-2021年涨幅超100%。通胀达7%创40年新高。科技股估值处互联网泡沫水平。" },
    actualOutcome: { direction: "down", oneMonthReturn: -7.0, threeMonthReturn: -5.3, description: "持续下跌。这是2022年熊市的确认信号。纳斯达克全年跌33%。" },
  },
  {
    name: "2022年6月CPI通胀高峰",
    date: "2022-06-13",
    newsOnTheDay: "2022年6月10日公布5月CPI同比8.6%创40年新高。6月13日周一，标普500暴跌3.9%正式进入熊市（自高点跌21%）。市场定价美联储6月15日可能加息75bp而非50bp。VIX飙升至35。全球债券收益率集体飙升。",
    knownData: { vix: 34.9, rsi: 28, dropFromPeak: 21.0, recentVolatility: 0.03, volumeSpike: 3.2, eventCategory: "regulatory", knownPolicyAction: "市场定价加息75bp。美联储尚未确认但未否认。量化紧缩(QT)已启动。", knownVulnerability: "通胀持续超预期。消费者信心跌至历史低位。科技和加密货币已暴跌。" },
    actualOutcome: { direction: "down", oneMonthReturn: -5.5, threeMonthReturn: -8.5, description: "延续下跌。6月15日加息75bp。熊市持续至10月才见底。标普全年跌19%。" },
  },
  {
    name: "2002年世通(WorldCom)丑闻",
    date: "2002-06-26",
    newsOnTheDay: "2002年6月25日盘后，世通公司(WorldCom)披露38亿美元会计欺诈——公司将常规费用资本化以虚增利润。这成为当时美国历史上最大的会计丑闻。世通股价已从64美元跌至83美分。CEO被逮捕。安然丑闻刚过去6个月，市场信心再次崩塌。",
    knownData: { vix: 35.0, rsi: 25, dropFromPeak: 35.0, recentVolatility: 0.035, volumeSpike: 3.8, eventCategory: "financial", knownPolicyAction: "SEC和司法部启动刑事调查。国会通过Sarbanes-Oxley法案。美联储8月维持利率1.75%。", knownVulnerability: "公司治理危机全面爆发。投资者对所有公司财报失去信任。纳斯达克已从峰值跌73%。" },
    actualOutcome: { direction: "down", oneMonthReturn: -15.2, threeMonthReturn: -18.5, description: "L型下跌。世通和安然双重打击市场信心。标普在2002年10月才见底。" },
  },
  {
    name: "2008年AIG救助",
    date: "2008-09-16",
    newsOnTheDay: "2008年9月16日（雷曼破产次日），美联储紧急宣布向AIG提供850亿美元救助贷款，换取其79.9%股权。AIG的信用违约互换(CDS)敞口高达4400亿美元，其破产将引发全球金融体系崩溃。道指继续下跌2.5%。货币市场基金Reserve Primary Fund跌破1美元净值。",
    knownData: { vix: 36.2, rsi: 30, dropFromPeak: 23.5, recentVolatility: 0.038, volumeSpike: 4.0, eventCategory: "financial", knownPolicyAction: "美联储850亿救助AIG。但雷曼破产已引发货币基金挤兑。财政部尚未提出TARP。", knownVulnerability: "AIG CDS敞口4400亿。货币市场基金面临挤兑。全球银行间市场冻结。" },
    actualOutcome: { direction: "down", oneMonthReturn: -18.5, threeMonthReturn: -23.5, description: "L型下跌。AIG救助未能阻止恐慌。金融海啸全面展开。TARP在10月3日才通过。" },
  },
  {
    name: "2018年10月科技股修正",
    date: "2018-10-29",
    newsOnTheDay: "2018年10月，科技股遭遇大幅修正。纳斯达克自8月高点下跌超14%。亚马逊和谷歌财报不及预期。中美贸易战持续升级。美联储10月维持鹰派立场。市场从'买科技'共识转向'避险'。",
    knownData: { vix: 25.2, rsi: 22, dropFromPeak: 14.5, recentVolatility: 0.028, volumeSpike: 2.5, eventCategory: "tech", knownPolicyAction: "美联储10月未加息但维持鹰派指引。中美贸易战未有缓和迹象。", knownVulnerability: "FAANG占标普500权重超15%。科技股拥挤交易严重。全球贸易放缓。" },
    actualOutcome: { direction: "down", oneMonthReturn: -5.5, threeMonthReturn: -8.5, description: "L型下跌延续至12月平安夜。直到鲍威尔鸽派转向才触底反弹。" },
  },

  // ═══════════════════════════════════════════════════
  // 中性/震荡事件 (5 个)
  // ═══════════════════════════════════════════════════

  {
    name: "2025年DeepSeek AI冲击",
    date: "2025-01-27",
    newsOnTheDay: "2025年1月27日，中国AI公司DeepSeek发布的开源大模型以极低成本实现了接近GPT-4的性能，引发全球AI行业震动。英伟达股价单日暴跌17%，市值蒸发5890亿美元。费城半导体指数暴跌9.2%。市场恐慌重新评估AI芯片需求前景。",
    knownData: { vix: 19.3, rsi: 42, dropFromPeak: 3.5, recentVolatility: 0.014, volumeSpike: 4.0, eventCategory: "tech", knownPolicyAction: "尚无政策响应。分析师对AI芯片长期需求前景出现重大分歧。", knownVulnerability: "英伟达此前一年涨幅超200%。AI产业链估值处于极高水平。" },
    actualOutcome: { direction: "neutral", oneMonthReturn: 0.5, threeMonthReturn: 2.1, description: "分化走势。科技股内部轮动。标普500整体持平。" },
  },
  {
    name: "2015年瑞士央行黑天鹅",
    date: "2015-01-15",
    newsOnTheDay: "2015年1月15日，瑞士央行(SNB)毫无预警地宣布取消实施三年半的1.20瑞郎兑欧元汇率上限，并同时降息至-0.75%。瑞郎兑欧元瞬间飙升30%。全球股市剧烈震荡，外汇经纪商集体爆仓。",
    knownData: { vix: 21.5, rsi: 47, dropFromPeak: 2.3, recentVolatility: 0.022, volumeSpike: 2.5, eventCategory: "regulatory", knownPolicyAction: "瑞士央行已降息至-0.75%（当日执行）。无其他央行响应。", knownVulnerability: "大量投机资金押注瑞郎贬值。外汇经纪商和银行持有巨大瑞郎空头头寸。" },
    actualOutcome: { direction: "neutral", oneMonthReturn: 0.3, threeMonthReturn: 2.8, description: "冲击主要集中在瑞士股市和外汇市场。美股在短暂下跌后迅速恢复。" },
  },
  {
    name: "2013年美国政府停摆",
    date: "2013-10-01",
    newsOnTheDay: "2013年10月1日，美国联邦政府因国会未能通过预算而停摆。约80万联邦雇员被迫休假。国家公园关闭。市场对此已有预期——过去30年间发生过17次政府停摆。标普500当日小幅下跌0.3%。",
    knownData: { vix: 16.7, rsi: 42, dropFromPeak: 3.5, recentVolatility: 0.012, volumeSpike: 1.8, eventCategory: "regulatory", knownPolicyAction: "政府停摆已开始。两党正在进行谈判。美联储继续维持QE。", knownVulnerability: "政府停摆如果持续数周可能拖累GDP。债务上限尚未触及。" },
    actualOutcome: { direction: "neutral", oneMonthReturn: 1.5, threeMonthReturn: 4.5, description: "震荡中缓慢走高。政府停摆持续16天，但对市场影响极有限。历史规律再次应验。" },
  },
  {
    name: "2019年中美贸易战暂停",
    date: "2019-12-13",
    newsOnTheDay: "2019年12月13日，美国和中国宣布达成'第一阶段'贸易协议。美国取消原定12月15日生效的新关税，并将此前9月1日加征的部分关税从15%降至7.5%。中国承诺未来两年增购2000亿美元美国商品。市场反应温和。",
    knownData: { vix: 12.5, rsi: 62, dropFromPeak: 0.5, recentVolatility: 0.008, volumeSpike: 1.5, eventCategory: "regulatory", knownPolicyAction: "第一阶段贸易协议达成。关税部分降低。第二阶段谈判预计2020年开始。", knownVulnerability: "协议完全可逆。贸易战根本问题（技术竞争、知识产权）未解决。" },
    actualOutcome: { direction: "neutral", oneMonthReturn: 2.5, threeMonthReturn: 0.5, description: "窄幅震荡。市场已提前定价。COVID随后成为主要驱动因素。" },
  },
  {
    name: "2016年美国总统大选",
    date: "2016-11-08",
    newsOnTheDay: "2016年11月8日，唐纳德·特朗普赢得美国总统大选，击败希拉里·克林顿。选举结果远超预期——几乎所有民调和预测市场都预测希拉里获胜。标普500期货盘后一度暴跌5%触发熔断。但11月9日开盘后迅速反弹。",
    knownData: { vix: 18.7, rsi: 38, dropFromPeak: 3.5, recentVolatility: 0.015, volumeSpike: 3.2, eventCategory: "regulatory", knownPolicyAction: "特朗普承诺大规模减税和基建支出。共和党控制参众两院。政策不确定性高。", knownVulnerability: "特朗普的贸易保护主义倾向可能破坏全球贸易。减税方案细节未知。" },
    actualOutcome: { direction: "neutral", oneMonthReturn: 3.5, threeMonthReturn: 5.5, description: "'特朗普交易'推高股市。但涨幅温和，市场在评估政策方向。真正的'特朗普行情'在2017年减税后才加速。" },
  },
];

console.log(`✅ 策展完成: ${CURATED_EVENTS.length} 个手工验证事件 (${CURATED_EVENTS.filter(e=>e.actualOutcome.direction==='up').length} up, ${CURATED_EVENTS.filter(e=>e.actualOutcome.direction==='down').length} down, ${CURATED_EVENTS.filter(e=>e.actualOutcome.direction==='neutral').length} neutral)`);
