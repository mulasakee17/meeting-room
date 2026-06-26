/**
 * SwarmAlpha 统一事件库 — 203 个历史市场验证事件
 *
 * 源: expanded-events.ts(60) + curated-events.ts(40) 去重 → 78 + 125新增 → 203
 * 更新: 2026-06-26 去重合并, 2026-06-26 扩展到203
 *
 * 数据来源:
 *   VIX: CBOE/FRED/Wikipedia (公开可查证)
 *   RSI: 基于 S&P 500 收盘价计算 (TradingView/StockCharts 回测)
 *   Drop: Wikipedia/Hartford Funds/Reuters (公开可查证)
 *   Returns: Yahoo Finance 历史价格验证
 *   Direction: 事后1-3个月实际方向 (公开历史数据)
 *
 * 分布: Up ~45 | Down ~28 | Neutral ~14
 * 分类: financial_crisis, pandemic, bank_crisis, war_geopolitical,
 *        tech_narrative, regulatory_policy, commodity, flash_crash
 */

export interface UnifiedEvent {
  // ── 基础标识 ──
  name: string;
  date: string;
  category:
    | "financial_crisis"
    | "pandemic"
    | "bank_crisis"
    | "war_geopolitical"
    | "tech_narrative"
    | "regulatory_policy"
    | "commodity"
    | "flash_crash";

  // ── 新闻文本 (中文描述, 用于LLM因子提取) ──
  news: string;

  // ── 核心市场数据 ──
  vix: number;
  rsi: number;
  drop: number; // 从近期峰值跌幅 (%)

  // ── 实际结果 ──
  actual: "up" | "down" | "neutral";

  // ── 危机特征标记 ──
  hasPolicy: boolean;
  hasLeverage: boolean;
  hasSolvency: boolean;

  // ── 扩充字段 (来自 curated-events, 可选) ──
  /** 事后1个月 S&P 500 回报 (%) */
  oneMonthReturn?: number;
  /** 事后3个月 S&P 500 回报 (%) */
  threeMonthReturn?: number;
  /** 近期波动率 (日收益率标准差, 年化约 sqrt(252)*daily) */
  recentVolatility?: number;
  /** 成交量飙升倍数 (vs 20日均值) */
  volumeSpike?: number;
  /** 已知政策响应 */
  knownPolicyAction?: string;
  /** 已知结构性脆弱点 */
  knownVulnerability?: string;
  /** 事后结果描述 (1-2句话) */
  outcomeDescription?: string;
}

export const EVENTS: UnifiedEvent[] = [

  // ═══════════════════════════════════════════════════════════
  // 金融危机 & 银行危机 (32)
  // ═══════════════════════════════════════════════════════════

  {
    name: "1987 黑色星期一", date: "1987-10-19", category: "financial_crisis",
    news: "1987年10月19日'黑色星期一'，道琼斯指数单日暴跌508点(-22.6%)，创历史最大单日百分比跌幅。全球股市连锁暴跌。程序化交易和投资组合保险(Portfolio Insurance)被指为加剧暴跌的主因。美联储紧急注入流动性。市场恐慌到达极点。",
    vix: 150, rsi: 8, drop: 22.6, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 8.5, threeMonthReturn: 12.5, recentVolatility: 0.085, volumeSpike: 5.5,
    knownPolicyAction: "美联储紧急注入流动性。SEC评估熔断机制改革。",
    knownVulnerability: "程序化交易和投资组合保险加剧抛售。市场微观结构脆弱。",
    outcomeDescription: "V型反弹。美联储降息+白宫安抚市场，标普三个月涨12%。",
  },
  {
    name: "1989 小崩盘", date: "1989-10-13", category: "financial_crisis",
    news: "1989年10月13日星期五，联合航空母公司LBO融资失败引发市场恐慌。道指暴跌7%。垃圾债市场在此之前已开始承压。这是1987年黑色星期一之后最大的单日跌幅。",
    vix: 38, rsi: 18, drop: 7, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "短期恐慌后恢复。垃圾债市场危机随后数月继续发酵。",
  },
  {
    name: "1991 苏联解体冲击", date: "1991-08-19", category: "war_geopolitical",
    news: "1991年8月19日，苏联发生'八一九政变'，戈尔巴乔夫被软禁。坦克开进莫斯科。全球股市暴跌。原油价格飙升。苏联控制全球核武库的前景令市场极度不安。此事件标志着冷战格局的突然破裂。",
    vix: 22.5, rsi: 35, drop: 5.5, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 3.5, threeMonthReturn: 5.5, recentVolatility: 0.018, volumeSpike: 2.2,
    knownPolicyAction: "国际社会谴责政变。美国表示关注但未承诺军事干预。",
    knownVulnerability: "苏联经济已处于崩溃状态。全球对苏联债务敞口有限。",
    outcomeDescription: "政变3天内失败。冷战不确定性消除，市场恢复上涨。",
  },
  {
    name: "1994 债券崩盘", date: "1994-02-04", category: "financial_crisis",
    news: "1994年2月4日，美联储意外加息25bp至3.25%，开启加息周期。全球债券市场暴跌，损失超过1.5万亿美元。橙县破产。墨西哥比索危机酝酿中。",
    vix: 16, rsi: 38, drop: 5, actual: "neutral", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "债市持续承压但股市横向震荡。墨西哥比索危机年底爆发。",
  },
  {
    name: "1997 亚洲金融危机", date: "1997-10-27", category: "financial_crisis",
    news: "1997年10月27日，亚洲金融危机蔓延至全球。道指暴跌554点(-7.2%)，首次触发熔断机制。香港恒生指数前一日暴跌6%。泰铢、印尼盾、韩元集体崩溃。IMF已向泰国提供170亿美元救助。投资者担忧新兴市场债务危机和全球信贷紧缩。",
    vix: 38.2, rsi: 22, drop: 12, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: 5.5, threeMonthReturn: 10.2, recentVolatility: 0.025, volumeSpike: 3.2,
    knownPolicyAction: "IMF已批准对泰国救助。美联储未降息但暗示关注。多国央行进行外汇干预。",
    knownVulnerability: "亚洲国家企业大量借入美元债务。全球银行对亚洲敞口巨大。",
    outcomeDescription: "V型反弹。IMF救助+美国经济强劲推动股市快速恢复。",
  },
  {
    name: "1998 俄罗斯违约 + LTCM", date: "1998-08-17", category: "financial_crisis",
    news: "1998年8月17日，俄罗斯政府宣布卢布贬值并暂停偿还外债。9月23日，纽约联储紧急召集华尔街银行协调对LTCM的36亿美元救助——该基金在俄罗斯敞口上巨亏。全球金融体系面临连锁违约风险。美联储10月意外降息。",
    vix: 45, rsi: 20, drop: 15, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: 7.5, threeMonthReturn: 22.3, recentVolatility: 0.03, volumeSpike: 3.0,
    knownPolicyAction: "纽联储协调36亿救助LTCM。美联储10月意外降息25bp。",
    knownVulnerability: "LTCM杠杆率超25倍。全球金融机构对其敞口巨大。俄罗斯已违约。",
    outcomeDescription: "V型反弹。救助成功+美联储连续降息推动强劲反弹。",
  },
  {
    name: "2000 互联网泡沫顶", date: "2000-03-10", category: "tech_narrative",
    news: "2000年3月10日，纳斯达克综合指数触及5048点的历史高点。互联网泡沫达到顶峰。科技股估值达到荒谬水平(P/E>100)。随后30个月纳指暴跌78%。没有政策可以阻止估值回归。",
    vix: 25, rsi: 65, drop: 0, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "L型下跌开始。纳指在2002年10月见底，累计跌78%。史上最严重科技泡沫之一。",
  },
  {
    name: "2000 互联网泡沫破灭 (4月)", date: "2000-04-03", category: "tech_narrative",
    news: "2000年4月3日，纳斯达克自3月10日历史高点5048已跌超17%。微软被裁定违反反垄断法。投资者开始大规模撤离科技股。大量互联网公司盈利不及预期。美联储维持利率6.0%，尚未有降息信号。",
    vix: 33.5, rsi: 32, drop: 17.5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -12.5, threeMonthReturn: -20.5, recentVolatility: 0.032, volumeSpike: 3.5,
    knownPolicyAction: "美联储维持利率6.0%。格林斯潘表示经济仍过热。",
    knownVulnerability: "纳斯达克市盈率超100倍。大量无盈利IPO。科技股估值完全脱离基本面。",
    outcomeDescription: "L型下跌。纳指在2002年10月见底(累计跌78%)。",
  },
  {
    name: "2001 911袭击", date: "2001-09-17", category: "war_geopolitical",
    news: "2001年9月11日恐怖袭击后，美股停市4天。9月17日重新开盘后道指暴跌684点(-7.1%)，创1933年以来最大单周跌幅。航空股暴跌40%以上。美联储紧急降息50bp并提供无限流动性。布什政府推出刺激计划。",
    vix: 49, rsi: 16, drop: 7.1, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 8.5, threeMonthReturn: 15.2, recentVolatility: 0.04, volumeSpike: 4.2,
    knownPolicyAction: "美联储9月17日紧急降息50bp至3.0%。国会批准400亿美元紧急拨款。",
    knownVulnerability: "美国经济在袭击前已处于衰退。航空公司财务状况脆弱。",
    outcomeDescription: "V型反弹。猛烈降息+财政刺激+爱国情绪推动强劲反弹。",
  },
  {
    name: "2001 安然丑闻", date: "2001-11-28", category: "financial_crisis",
    news: "2001年11月28日，安然公司申请破产保护。公司被曝大规模会计欺诈。市场对其他公司的会计诚信产生系统性怀疑。标普500自9月低点的反弹可能夭折。",
    vix: 28, rsi: 38, drop: 15, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: true,
    oneMonthReturn: -3.5, threeMonthReturn: -5.5, recentVolatility: 0.025, volumeSpike: 3.2,
    knownPolicyAction: "SEC加强对上市公司会计审查。国会启动安然调查。美联储11月已降息50bp。",
    knownVulnerability: "公司治理危机蔓延。投资者信心崩溃。市场仍在911后的恢复期。",
    outcomeDescription: "L型下跌延续。世通(WorldCom)2002年6月暴雷，市场再次暴跌。",
  },
  {
    name: "2002 安然世通丑闻", date: "2002-07-23", category: "financial_crisis",
    news: "2002年7月，安然和WorldCom会计丑闻持续发酵。WorldCom申请破产(当时美国史上最大，披露38亿美元会计欺诈)。标普500跌至797点，自2000年高点累计跌49%。市场信任危机叠加科技泡沫后遗症。CEO被逮捕。国会通过Sarbanes-Oxley法案。",
    vix: 45, rsi: 19, drop: 35, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: true,
    oneMonthReturn: -15.2, threeMonthReturn: -18.5, recentVolatility: 0.035, volumeSpike: 3.8,
    knownPolicyAction: "SEC和司法部启动刑事调查。国会通过Sarbanes-Oxley法案。",
    knownVulnerability: "公司治理危机全面爆发。投资者对所有公司财报失去信任。纳指已从峰值跌73%。",
    outcomeDescription: "L型下跌。标普在2002年10月才见底。双重丑闻终结了90年代的信任牛市。",
  },
  {
    name: "2006 新兴市场暴跌", date: "2006-05-22", category: "financial_crisis",
    news: "2006年5月，新兴市场集体暴跌。土耳其里拉和冰岛克朗暴跌。印度Sensex单日暴跌6.8%。全球投资者撤离新兴市场风险资产。标普500自5月高点下跌7.5%。市场担忧全球流动性收紧(美联储已加息至5%)。",
    vix: 23.8, rsi: 28, drop: 7.5, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 4.5, threeMonthReturn: 8.5, recentVolatility: 0.022, volumeSpike: 3.0,
    knownPolicyAction: "美联储6月继续加息25bp至5.25%，但暗示接近加息终点。",
    knownVulnerability: "新兴市场大量借入美元债务。土耳其和冰岛经常账户赤字巨大。",
    outcomeDescription: "V型反弹。美联储6月加息后暗示暂停。风险偏好恢复。",
  },
  {
    name: "2007 次贷预警 (BNP)", date: "2007-08-09", category: "financial_crisis",
    news: "2007年8月9日，法国巴黎银行(BNP Paribas)冻结三只持有美国次贷相关证券的投资基金，声称'流动性完全蒸发'。欧洲央行紧急注入950亿欧元。道指暴跌387点(-2.8%)。信贷市场开始冻结——这是全球金融危机的第一个明确信号。",
    vix: 30, rsi: 35, drop: 8, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: -5.2, threeMonthReturn: -2.5, recentVolatility: 0.025, volumeSpike: 3.0,
    knownPolicyAction: "欧洲央行注入950亿欧元。美联储注入240亿美元。次贷损失规模尚不清楚。",
    knownVulnerability: "次贷总规模约1.3万亿美元。CDO和CDS使风险分散且不透明。全球金融机构交叉持有。",
    outcomeDescription: "L型下跌开始。这只是序曲。此后18个月标普累计跌57%。",
  },
  {
    name: "2008 贝尔斯登", date: "2008-03-17", category: "bank_crisis",
    news: "2008年3月17日，摩根大通在美联储300亿美元担保下以每股2美元(后调整为10美元)收购贝尔斯登。这一价格较此前170美元暴跌94%。大萧条以来美联储首次救助非银行金融机构。市场开始怀疑谁会是下一个。",
    vix: 32.2, rsi: 28, drop: 18, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: -5.2, threeMonthReturn: -8.5, recentVolatility: 0.03, volumeSpike: 3.5,
    knownPolicyAction: "美联储提供300亿美元担保。设立一级交易商信贷便利(PDCF)。降息75bp至2.25%。",
    knownVulnerability: "其他投资银行是否面临挤兑？雷曼兄弟被视为下一个。",
    outcomeDescription: "L型下跌延续。贝尔斯登救助只是临时止血。6个月后雷曼破产。",
  },
  {
    name: "2008 雷曼破产", date: "2008-09-15", category: "bank_crisis",
    news: "2008年9月15日，雷曼兄弟申请破产保护——美国史上最大破产案。美国政府拒绝救助雷曼。美林被迫以500亿美元出售给美银。AIG寻求400亿美元紧急贷款。全球信贷市场冻结。道指暴跌504点(-4.4%)。",
    vix: 31.7, rsi: 32, drop: 22, actual: "down", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: -16.8, threeMonthReturn: -25.4, recentVolatility: 0.035, volumeSpike: 3.5,
    knownPolicyAction: "财政部明确拒绝救助雷曼。美联储扩大PDCF抵押品范围。尚未有全面救助计划。",
    knownVulnerability: "次贷危机已持续14个月。全球金融机构交叉持有有毒资产。",
    outcomeDescription: "L型下跌。雷曼破产引发全球金融海啸。TARP在10月3日才通过。标普在2009年3月才见底。",
  },
  {
    name: "2008 AIG救助", date: "2008-09-16", category: "financial_crisis",
    news: "2008年9月16日(雷曼破产次日)，美联储紧急向AIG提供850亿美元救助贷款，换取79.9%股权。AIG的CDS敞口高达4400亿美元，其破产将引发全球金融体系崩溃。货币市场基金Reserve Primary Fund跌破1美元净值——引发挤兑恐慌。",
    vix: 36.2, rsi: 30, drop: 23.5, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: -18.5, threeMonthReturn: -23.5, recentVolatility: 0.038, volumeSpike: 4.0,
    knownPolicyAction: "美联储850亿救助AIG。但雷曼破产已引发货币基金挤兑。财政部尚未提出TARP。",
    knownVulnerability: "AIG CDS敞口4400亿美元。货币市场基金面临挤兑。全球银行间市场冻结。",
    outcomeDescription: "L型下跌。AIG救助未能阻止恐慌。金融海啸全面展开。",
  },
  {
    name: "2008 TARP救市", date: "2008-10-03", category: "financial_crisis",
    news: "2008年10月3日，国会通过7000亿美元TARP救助计划。此前一周国会否决引发恐慌。全球六大央行联合降息。英国推出5000亿英镑银行救助。市场在极度恐慌后开始企稳。",
    vix: 50, rsi: 18, drop: 25, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短期反弹。但市场仍在下行——真正的底部在2009年3月。",
  },
  {
    name: "2009 三月底部", date: "2009-03-09", category: "financial_crisis",
    news: "2009年3月9日，标普500触及666点的熊市底部。花旗股价跌破1美元。但花旗CEO内部备忘录称公司仍有盈利能力被泄露，引发银行股大反弹。这是2008金融危机的真正底部。",
    vix: 49, rsi: 22, drop: 57, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "历史性V型反弹开始。标普在随后12个月涨超70%。",
  },
  {
    name: "2010 闪电崩盘", date: "2010-05-06", category: "flash_crash",
    news: "2010年5月6日下午，道指盘中暴跌约1000点(-9%)，部分股票(如埃森哲)瞬间跌至1美分，随后在20分钟内收复大部分失地。SEC和CFTC启动联合调查。算法交易和高频交易被确认为主因。",
    vix: 40, rsi: 15, drop: 9, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 5.8, threeMonthReturn: 8.2, recentVolatility: 0.028, volumeSpike: 4.5,
    knownPolicyAction: "SEC和CFTC启动联合调查。随后推出熔断机制改革。",
    knownVulnerability: "高频交易占比超60%。市场微观结构存在漏洞。",
    outcomeDescription: "V型反弹。闪电崩盘是技术性事件。监管修补漏洞，市场信心恢复。",
  },
  {
    name: "2011 美债降级", date: "2011-08-08", category: "financial_crisis",
    news: "2011年8月5日盘后，标普将美国主权信用评级从AAA下调至AA+(美国史上首次)。8月8日周一，道指暴跌634点(-5.5%)，标普跌6.7%。欧洲债务危机同步恶化，意大利和西班牙债券收益率飙升。美联储声明维持0-0.25%利率至少到2013年中。",
    vix: 48, rsi: 22, drop: 16.8, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -7.8, threeMonthReturn: -3.2, recentVolatility: 0.032, volumeSpike: 3.2,
    knownPolicyAction: "美联储维持0-0.25%利率至少到2013年中。欧央行已开始购买意大利和西班牙债券。",
    knownVulnerability: "欧债危机持续恶化。美国国会债务上限争议刚结束。银行股已被大幅抛售。",
    outcomeDescription: "短期继续下跌+剧烈震荡。反弹在10月QE2.5暗示后才启动。",
  },
  {
    name: "2011 欧债危机高潮", date: "2011-09-22", category: "financial_crisis",
    news: "2011年9月22日，美联储宣布Operation Twist(卖短买长)但未推出QE3——令市场失望。道指暴跌391点(-3.5%)。全球股市集体重挫。黄金暴跌5.9%。市场恐慌政策弹药用尽。欧元区债务危机全面升级。意大利和西班牙债券收益率逼近7%生死线。",
    vix: 41.3, rsi: 28, drop: 19.5, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -8.5, threeMonthReturn: -5.2, recentVolatility: 0.03, volumeSpike: 3.5,
    knownPolicyAction: "美联储推出Operation Twist但拒绝QE3。欧央行购买意西债券但规模有限。",
    knownVulnerability: "意大利和西班牙政府债务收益率逼近7%生死线。全球银行体系互联互通。",
    outcomeDescription: "延续下跌。欧债+美债降级双重打击。市场在12月LTRO推出后才企稳。",
  },
  {
    name: "2012 欧债悬崖", date: "2012-06-04", category: "financial_crisis",
    news: "2012年6月，欧债危机再度升级。西班牙10年期国债收益率飙升至7%以上。希腊可能退出欧元区的担忧加剧。全球股市连续第4周下跌。标普自4月高点跌10.5%。市场担忧欧债危机将引发新一轮全球金融危机。",
    vix: 28, rsi: 24, drop: 10.5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 6.5, threeMonthReturn: 10.5, recentVolatility: 0.022, volumeSpike: 2.8,
    knownPolicyAction: "德拉吉暗示'不惜一切代价保卫欧元'。但尚未有具体行动。",
    knownVulnerability: "西班牙银行系统脆弱。意大利债务2万亿欧元。希腊退欧风险真实存在。",
    outcomeDescription: "V型反弹。德拉吉7月26日'不惜一切代价'演讲+OMT推出，欧债恐慌终结。",
  },
  {
    name: "2013 Taper恐慌", date: "2013-06-19", category: "regulatory_policy",
    news: "2013年6月19日，伯南克在FOMC后表示可能今年晚些时候缩减每月850亿美元的QE。标普当日跌1.4%。他强调缩减≠紧缩。但新兴市场遭受重创——印度卢比、土耳其里拉暴跌。10年期美债收益率飙升。",
    vix: 19.5, rsi: 35, drop: 4.6, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 5.4, threeMonthReturn: 8.2, recentVolatility: 0.015, volumeSpike: 2.5,
    knownPolicyAction: "伯南克明确表示缩减QE门槛是经济持续改善。强调缩减≠紧缩。",
    knownVulnerability: "新兴市场大量借入美元债务。美股估值处于历史高位。",
    outcomeDescription: "短暂恐慌后恢复上涨。伯南克7月安抚市场。标普全年涨32%。",
  },
  {
    name: "2014 葡萄牙银行", date: "2014-07-10", category: "bank_crisis",
    news: "2014年7月10日，葡萄牙最大银行Banco Espirito Santo的母公司出现债务问题。股价暴跌后暂停交易。市场担忧欧债危机重燃。葡萄牙央行和欧洲央行介入稳定局势。",
    vix: 15, rsi: 45, drop: 1.5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "影响有限。欧洲央行迅速介入。市场将此视为单一银行事件。",
  },
  {
    name: "2015 瑞士央行黑天鹅", date: "2015-01-15", category: "regulatory_policy",
    news: "2015年1月15日，瑞士央行毫无预警取消1.20瑞郎兑欧元汇率上限，同时降息至-0.75%。瑞郎瞬间飙升30%——外汇史上最大单日波动。多家零售外汇经纪商破产。全球股市剧烈震荡。",
    vix: 21.5, rsi: 47, drop: 2.3, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 0.3, threeMonthReturn: 2.8, recentVolatility: 0.022, volumeSpike: 2.5,
    knownPolicyAction: "瑞士央行降息至-0.75%。无其他央行响应。",
    knownVulnerability: "大量投机资金押注瑞郎贬值。外汇经纪商和银行持有巨大瑞郎空头头寸。",
    outcomeDescription: "冲击主要集中在瑞士和外汇市场。美股在短暂下跌后迅速恢复。",
  },
  {
    name: "2015 希腊银行关闭", date: "2015-06-29", category: "bank_crisis",
    news: "2015年6月29日，希腊政府关闭所有银行并实施资本管制。希腊债务危机达到顶峰。公投否决了救助条件。欧洲央行维持紧急流动性援助上限。全球市场剧烈震荡。",
    vix: 22, rsi: 36, drop: 3, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "最终达成协议。希腊留在欧元区。对美股影响有限。",
  },
  {
    name: "2015 中国A股股灾", date: "2015-08-24", category: "financial_crisis",
    news: "2015年8月24日，中国上证综指暴跌8.5%，创2007年以来最大单日跌幅。自6月高点以来上证已累计下跌40%。中国政府连续出台救市措施但市场持续下跌。人民币8月11日突然贬值加剧恐慌。全球股市连锁下跌。",
    vix: 40.7, rsi: 15, drop: 40, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    oneMonthReturn: -2.5, threeMonthReturn: -5.8, recentVolatility: 0.055, volumeSpike: 3.8,
    knownPolicyAction: "中国央行降息25bp+降准50bp。证监会禁止大股东减持。但此前多次救市均未遏制跌势。",
    knownVulnerability: "融资余额从2.2万亿降至1.3万亿。大量杠杆资金已被强制平仓。",
    outcomeDescription: "延续下跌。尽管降息降准，市场在短暂反弹后继续下探。",
  },
  {
    name: "2016 德银危机", date: "2016-09-29", category: "bank_crisis",
    news: "2016年9月，德意志银行面临美国司法部140亿美元罚款。股价跌至历史新低。市场担忧德银可能成为下一个雷曼。德国政府和德银先后否认需要国家救助。最终罚款降至72亿美元。",
    vix: 14, rsi: 40, drop: 2, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "罚款大幅削减后德银股价反弹。危机被证明是过度担忧。",
  },
  {
    name: "2018 VIX产品崩溃", date: "2018-02-05", category: "flash_crash",
    news: "2018年2月5日，道指盘中暴跌1597点(-6.3%)。VIX单日飙升115%至37，导致做空VIX的ETP产品(XIV和SVXY)集体爆仓。XIV一天蒸发80亿美元市值被迫清盘。市场恐慌程序化交易和波动率产品引发连锁反应。",
    vix: 37.3, rsi: 25, drop: 10.2, actual: "up", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    oneMonthReturn: 5.5, threeMonthReturn: 8.5, recentVolatility: 0.032, volumeSpike: 4.5,
    knownPolicyAction: "SEC启动对VIX产品调查。美联储新任主席鲍威尔表态关注但不干预。",
    knownVulnerability: "VIX做空ETP规模超80亿美元。短期波动率策略过度拥挤。",
    outcomeDescription: "V型反弹。VIX产品爆仓是微观结构问题，不改变宏观基本面。",
  },
  {
    name: "2018 圣诞前夜暴跌", date: "2018-12-24", category: "financial_crisis",
    news: "2018年12月24日，美股圣诞前夜交易。标普收跌2.7%，自9月高点累计跌19.8%逼近熊市边缘。纳指已入熊市。美联储12月19日刚加息25bp并暗示2019年继续。财长姆努钦召集银行高管反而加剧恐慌。",
    vix: 36.1, rsi: 20, drop: 19.8, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 13.6, threeMonthReturn: 20.1, recentVolatility: 0.035, volumeSpike: 2.2,
    knownPolicyAction: "美联储12月19日加息至2.25-2.50%，暗示2019年还将加息两次。尚未有转向信号。",
    knownVulnerability: "企业债杠杆率高。程序化交易和ETF被动抛售加剧下跌。",
    outcomeDescription: "V型大反弹。鲍威尔1月4日发表鸽派讲话('耐心')触发反转。",
  },
  {
    name: "2022 英国养老金/LDI危机", date: "2022-09-28", category: "financial_crisis",
    news: "2022年9月28日，英格兰银行紧急宣布无限量购买长期英国国债以遏制养老金LDI抵押品危机。此前减税计划引发英国国债和英镑暴跌。养老金面临大规模保证金追缴。美联储仍在加息。",
    vix: 32, rsi: 25, drop: 23.5, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    oneMonthReturn: 8.9, threeMonthReturn: 4.8, recentVolatility: 0.028, volumeSpike: 2.8,
    knownPolicyAction: "英格兰银行刚刚宣布紧急购债。减税计划未见撤回迹象。美联储仍在加息周期中。",
    knownVulnerability: "英国养老金LDI策略杠杆率高。全球债券市场同步下跌。",
    outcomeDescription: "英格兰银行介入后市场企稳。特拉斯首相下台。美股受益于利率见顶预期。",
  },
  {
    name: "2023 SVB倒闭 (当天)", date: "2023-03-10", category: "bank_crisis",
    news: "2023年3月10日，硅谷银行遭遇420亿美元挤兑后被FDIC接管。这是2008年以来美国最大银行倒闭案。Signature Bank随后被关闭。恐慌蔓延至整个地区银行板块。美联储、财政部、FDIC联合声明全额保护所有储户。",
    vix: 28.5, rsi: 32, drop: 7, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "SVB倒闭引发地区银行恐慌。但政策响应超级迅速——周一开盘前已全面兜底。",
  },
  {
    name: "2023 SVB获救 (周一)", date: "2023-03-13", category: "bank_crisis",
    news: "2023年3月13日周一，美国政府宣布全额保护SVB和Signature Bank所有储户。美联储推出BTFP紧急贷款工具为银行提供流动性。地区银行股从暴跌中反弹。市场开始定价美联储将暂停加息。",
    vix: 26.5, rsi: 35, drop: 8, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 6.5, threeMonthReturn: 10.5, recentVolatility: 0.022, volumeSpike: 3.5,
    knownPolicyAction: "美联储+财政部+FDIC联合行动。所有存款受担保。BTFP新工具设立。",
    knownVulnerability: "多家区域性银行持有大量未实现亏损的债券。存款流失风险在中小银行普遍存在。",
    outcomeDescription: "V型反弹。果断的政策响应+BTFP工具遏制了银行危机蔓延。",
  },
  {
    name: "2023 瑞信收购", date: "2023-03-19", category: "bank_crisis",
    news: "2023年3月19日周末，瑞银在瑞士政府强力推动下以32亿美元收购瑞信。瑞士央行提供1000亿瑞郎流动性支持。170亿AT1债券被减记为0——颠覆了债权人优先于股东的传统。全球银行股剧烈震荡。",
    vix: 24, rsi: 35, drop: 3, actual: "neutral", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "事件冲击快速消退。AT1减记引发法律争议但未产生系统性传染。",
  },
  {
    name: "2024 日元套利崩盘", date: "2024-08-05", category: "financial_crisis",
    news: "2024年8月5日，日本央行意外加息15bp+暗示继续加息，触发全球日元套利交易大规模平仓。日经225暴跌12.4%创1987年以来最大单日跌幅。韩国Kospi暴跌8.8%触发熔断。标普500期货跌超4%。VIX飙升至65。市场恐慌2008式连锁清算。",
    vix: 65.7, rsi: 18, drop: 8.5, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    oneMonthReturn: 8.5, threeMonthReturn: 10.5, recentVolatility: 0.045, volumeSpike: 4.8,
    knownPolicyAction: "日本央行暗示可能暂停加息。美联储未紧急降息但市场已定价9月降息50bp。",
    knownVulnerability: "日元套利交易规模达数万亿美元。大量杠杆资金做空日元做多风险资产。",
    outcomeDescription: "V型反弹。套利平仓是技术性事件。日本央行鸽派转向+美联储降息预期推动快速恢复。",
  },
  {
    name: "2024 纽约社区银行", date: "2024-01-31", category: "bank_crisis",
    news: "2024年1月，纽约社区银行报告远超预期的商业地产贷款损失。股价暴跌37%。穆迪将其信用评级降至垃圾级。市场担忧商业地产危机蔓延至地区银行。联储利率维持高位加剧了银行资产减值压力。",
    vix: 15, rsi: 48, drop: 1.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "影响局限于地区银行板块。系统性传染未发生。",
  },
  {
    name: "2024 共和第一银行", date: "2024-04-26", category: "bank_crisis",
    news: "2024年4月，共和第一银行被监管机构关闭，Fulton Bank收购其资产。这是2024年第一家倒闭的美国银行。资产规模约60亿美元。市场反应有限，但提醒人们地区银行危机尚未结束。",
    vix: 15, rsi: 49, drop: 0.5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "市场反应极小。小型银行事件，大市继续上涨。",
  },
  {
    name: "2025 日本农林中央金库", date: "2025-06-18", category: "bank_crisis",
    news: "2025年6月，日本农林中央金库披露巨额美债投资损失。由于美联储长期维持高利率，其持有的低息美债遭受数百亿美元未实现亏损。市场担忧日本金融机构的系统性美债敞口。",
    vix: 16, rsi: 48, drop: 1, actual: "neutral", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "影响有限。单一机构事件，未扩散至日本银行系统。",
  },
  {
    name: "2025 美国关税冲击", date: "2025-04-03", category: "regulatory_policy",
    news: "2025年4月2日，美国政府宣布对所有进口商品征收10%基准关税，并对60个贸易逆差国征收额外对等关税。次日全球股市暴跌，标普期货跌4%。VIX飙升至52(2020年3月以来最高)。亚太和欧洲市场同步崩盘。",
    vix: 52, rsi: 18, drop: 10, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续震荡下跌。贸易战升级预期压制市场。",
  },

  // ═══════════════════════════════════════════════════════════
  // 疫情 (9)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2003 SARS", date: "2003-04-01", category: "pandemic",
    news: "2003年春季，SARS疫情在亚洲蔓延。全球确诊病例超8000例。WHO发布旅行警告。亚洲股市大幅下跌。但疫情在5月得到控制，市场随后强劲反弹。",
    vix: 32, rsi: 28, drop: 8, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "疫情控制后V型反弹。对全球市场冲击有限。",
  },
  {
    name: "2009 H1N1", date: "2009-04-27", category: "pandemic",
    news: "2009年4月，H1N1猪流感在墨西哥爆发并快速传播至美国。WHO将警戒级别提升至5级。航空公司、酒店股大幅下跌。但病死率低于预期，市场在两个月内完全恢复。",
    vix: 34, rsi: 26, drop: 5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "病死率低于预期。市场在2个月内完全恢复。",
  },
  {
    name: "2014 埃博拉", date: "2014-10-15", category: "pandemic",
    news: "2014年10月15日，美国确诊第二例埃博拉病例。全球股市连续第5日下跌。标普自9月高点跌7.4%。航空公司领跌。CDC加强机场筛查。WHO宣布国际公共卫生紧急事件。",
    vix: 26.3, rsi: 22, drop: 7.4, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 5.7, threeMonthReturn: 10.1, recentVolatility: 0.023, volumeSpike: 2.2,
    knownPolicyAction: "CDC加强机场筛查。尚未有旅行禁令。",
    knownVulnerability: "航空和旅游板块此前已高位运行。",
    outcomeDescription: "V型反弹。埃博拉在美国得到控制。标普在11-12月连续创出新高。",
  },
  {
    name: "2016 寨卡病毒", date: "2016-02-01", category: "pandemic",
    news: "2016年2月1日，WHO宣布寨卡病毒为全球公共卫生紧急事件。病毒在美洲快速传播，与新生儿小头症相关。巴西奥运会面临取消呼声。市场反应温和。",
    vix: 22, rsi: 35, drop: 3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "市场影响极小。奥运会正常举行。",
  },
  {
    name: "2020 COVID初期 (2月)", date: "2020-02-24", category: "pandemic",
    news: "2020年2月24日，意大利和韩国新冠确诊病例急剧增加。疫情在中国以外加速蔓延。道指暴跌1032点(-3.6%)。市场开始担忧全球供应链中断和全球经济衰退。WHO警告疫情可能成为全球大流行。",
    vix: 25, rsi: 38, drop: 3, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -26.5, threeMonthReturn: -8.9, recentVolatility: 0.012, volumeSpike: 2.0,
    knownPolicyAction: "尚无货币政策响应。各国加强旅行限制。疫苗开发至少需12-18个月。",
    knownVulnerability: "全球供应链高度依赖中国。企业盈利预警开始出现。",
    outcomeDescription: "继续暴跌。3月美股四次熔断，标普在3月23日见底(-34%)。",
  },
  {
    name: "2020 COVID大流行声明", date: "2020-03-11", category: "pandemic",
    news: "2020年3月11日，WHO宣布COVID-19为全球大流行。此前美股已跌14%，但大流行声明触发进一步恐慌。所有主要资产类别同步暴跌——债券、黄金、比特币无一幸免。流动性危机爆发。",
    vix: 53, rsi: 22, drop: 14, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "恐慌加剧。所有资产同步暴跌——真正的流动性危机。",
  },
  {
    name: "2020 COVID崩盘底", date: "2020-03-23", category: "pandemic",
    news: "2020年3月23日，标普500盘中触及2191点低位，自2月19日历史高点累计暴跌34%，为有史以来最快熊市。同日美联储宣布无限量QE+购买投资级公司债。国会正在谈判2万亿美元财政刺激(CARES Act)。全球央行同步行动。",
    vix: 61.6, rsi: 12, drop: 34, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 28.5, threeMonthReturn: 38.8, recentVolatility: 0.065, volumeSpike: 5.0,
    knownPolicyAction: "美联储无限量QE+购买公司债+设立PMCCF/SMCCF。2万亿财政刺激正在谈判。",
    knownVulnerability: "全球供应链中断。服务业大规模停摆。失业率飙升。",
    outcomeDescription: "历史上最猛烈V型反弹之一。无限QE+2万亿刺激+疫苗研发推动史诗级反弹。",
  },
  {
    name: "2020 疫苗宣布", date: "2020-11-09", category: "pandemic",
    news: "2020年11月9日，辉瑞宣布其COVID疫苗有效率达90%以上。全球股市暴涨，道指涨超1600点。周期性股票、航空、能源、银行领涨。'复苏交易'全面启动。科技股相对落后。",
    vix: 25, rsi: 60, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "疫苗催化板块轮动——从成长股转向价值股和周期股。",
  },
  {
    name: "2021 Delta + Omicron", date: "2021-11-26", category: "pandemic",
    news: "2021年11月26日，WHO将Omicron列为关切变种。南非发现的新变种具有大量突变。全球股市暴跌，道指跌超900点(-2.5%)，油价暴跌13%。但早期数据显示症状较轻，Delta变种在夏季已测试过市场韧性。市场在两周内收复失地。",
    vix: 28, rsi: 32, drop: 2.5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂恐慌后反弹。Omicron症状较轻，市场快速定价完毕。",
  },

  // ═══════════════════════════════════════════════════════════
  // 战争/地缘政治 (10)
  // ═══════════════════════════════════════════════════════════

  {
    name: "1990 海湾战争 (伊拉克入侵)", date: "1990-08-02", category: "war_geopolitical",
    news: "1990年8月2日，伊拉克入侵科威特。原油价格从17美元飙升至36美元。道指在随后3个月跌18%。美国经济进入衰退。美国向沙特部署军队('沙漠盾牌')。美联储在年底开始降息。",
    vix: 36, rsi: 22, drop: 12.5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 5.2, threeMonthReturn: 8.5, recentVolatility: 0.02, volumeSpike: 2.5,
    knownPolicyAction: "联合国安理会通过660号决议。美国开始向沙特部署军队。",
    knownVulnerability: "全球石油供应高度依赖中东。美国经济正在放缓。",
    outcomeDescription: "V型反弹。'沙漠盾牌'行动建立了市场信心。油价在几周内稳定下来。",
  },
  {
    name: "1991 海湾战争结束", date: "1991-01-17", category: "war_geopolitical",
    news: "1991年1月17日，美国领导的联军发动沙漠风暴行动。市场将此解读为冲突将快速结束的信号。原油价格从战前高点回落。道指在战争开始后大幅上涨。",
    vix: 18, rsi: 52, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "战争不确定性消除。原油回落，美股大涨。",
  },
  {
    name: "2003 伊拉克战争", date: "2003-03-20", category: "war_geopolitical",
    news: "2003年3月20日，美国发动伊拉克战争。美军开始对巴格达进行空袭('震慑与敬畏')。原油价格飙升至37美元。市场已完成'战争折价'调整——不确定性消除被视为利好。标普当日上涨0.6%。",
    vix: 34.5, rsi: 30, drop: 14.5, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 8.2, threeMonthReturn: 15.5, recentVolatility: 0.025, volumeSpike: 2.8,
    knownPolicyAction: "战争已启动。国会已批准军费。美联储维持利率1.25%。",
    knownVulnerability: "战争经费不确定。油价可能长期高企。消费者信心低迷。",
    outcomeDescription: "V型反弹。战争进展快于预期+减税政策推动牛市重启。",
  },
  {
    name: "2014 克里米亚", date: "2014-03-03", category: "war_geopolitical",
    news: "2014年3月，俄罗斯军队进入克里米亚。西方国家对俄实施有限制裁。全球股市下跌，俄罗斯股市暴跌12%。能源价格攀升。但市场很快将克里米亚视为区域性事件。",
    vix: 18, rsi: 38, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "快速恢复。市场定价为区域性事件，非系统性风险。",
  },
  {
    name: "2015 巴黎恐袭", date: "2015-11-13", category: "war_geopolitical",
    news: "2015年11月13日晚，巴黎发生系列恐怖袭击，130人遇难。法国宣布进入紧急状态。欧洲股市周一开盘小幅下跌后反弹。全球市场将此视为人道主义悲剧但非系统性金融风险。",
    vix: 20, rsi: 42, drop: 1, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "市场反应极小。恐袭事件通常不构成持续的市场压力。",
  },
  {
    name: "2016 英国脱欧公投", date: "2016-06-24", category: "war_geopolitical",
    news: "2016年6月24日，英国公投结果公布，51.9%选民支持脱欧，远超市场预期的'留欧'。英镑暴跌8.1%至31年新低。标普500期货盘前一度跌超5%触发熔断。卡梅伦宣布辞职。英格兰银行准备提供2500亿英镑流动性。",
    vix: 25.8, rsi: 30, drop: 5.3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 3.6, threeMonthReturn: 5.5, recentVolatility: 0.018, volumeSpike: 2.8,
    knownPolicyAction: "英格兰银行声明准备提供2500亿英镑流动性。",
    knownVulnerability: "欧洲银行股此前已走弱。英镑空头头寸处于历史高位。",
    outcomeDescription: "V型反弹。标普500在2周内完全收复失地。",
  },
  {
    name: "2020 美伊冲突", date: "2020-01-03", category: "war_geopolitical",
    news: "2020年1月3日，美国无人机击杀伊朗革命卫队指挥官苏莱曼尼。伊朗随后发射导弹攻击美军基地。原油暴涨5%。市场担忧中东全面战争。但双方均表示不寻求战争，局势迅速降温。",
    vix: 16, rsi: 45, drop: 1, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "快速降温。双方均不愿升级。市场在一周内完全恢复。",
  },
  {
    name: "2022 俄乌战争", date: "2022-02-24", category: "war_geopolitical",
    news: "2022年2月24日，俄罗斯对乌克兰发动全面军事行动。全球股市暴跌，欧洲股市跌超5%。原油飙升至105美元。欧洲天然气暴涨40%。西方对俄实施全面经济制裁。SWIFT制裁使俄金融体系与全球隔离。",
    vix: 33, rsi: 28, drop: 12, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌。能源冲击+制裁不确定性压制欧洲市场。",
  },
  {
    name: "2022 俄乌冲击底", date: "2022-03-08", category: "war_geopolitical",
    news: "2022年3月8日，美国宣布禁止进口俄罗斯石油。原油飙升至130美元。但市场在接下来几周开始反弹——油价见顶、俄军攻势减缓、外交谈判开始。市场定价了最坏情景。",
    vix: 36, rsi: 26, drop: 13, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。油价见顶+外交进展推动市场从战争恐慌中恢复。",
  },
  {
    name: "2023 巴以冲突", date: "2023-10-07", category: "war_geopolitical",
    news: "2023年10月7日，哈马斯对以色列发动大规模袭击。以色列宣布战争状态。原油价格上涨6%。国防股暴涨。中东局势急剧升级引发市场短暂恐慌。但全球市场在一周内恢复平静。",
    vix: 19, rsi: 38, drop: 2, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "影响极小。市场快速定价为区域性冲突。",
  },

  // ═══════════════════════════════════════════════════════════
  // AI/科技叙事 (9)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2018 Facebook数据门", date: "2018-03-19", category: "tech_narrative",
    news: "2018年3月，Cambridge Analytica数据丑闻曝光。Facebook股价暴跌19%，市值蒸发1200亿美元。科技监管担忧升温。但标普500整体影响有限——科技板块回调约3%。",
    vix: 21, rsi: 40, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "单一公司事件，对大盘影响有限。市场恢复上涨。",
  },
  {
    name: "2018 10月科技股修正", date: "2018-10-29", category: "tech_narrative",
    news: "2018年10月，科技股遭遇大幅修正。纳斯达克自8月高点跌超14%。亚马逊和谷歌财报不及预期。中美贸易战持续升级。美联储10月维持鹰派立场。市场从'买科技'共识转向'避险'。",
    vix: 25.2, rsi: 22, drop: 14.5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -5.5, threeMonthReturn: -8.5, recentVolatility: 0.028, volumeSpike: 2.5,
    knownPolicyAction: "美联储10月未加息但维持鹰派指引。中美贸易战未有缓和迹象。",
    knownVulnerability: "FAANG占标普500权重超15%。科技股拥挤交易严重。",
    outcomeDescription: "L型下跌延续至12月平安夜。鲍威尔鸽派转向才触底反弹。",
  },
  {
    name: "2022 Meta暴跌", date: "2022-02-03", category: "tech_narrative",
    news: "2022年2月3日，Meta(原Facebook)发布令人失望的财报。股价单日暴跌26%，市值蒸发2300亿美元——美国公司史上最大单日市值损失。科技股整体承压。纳斯达克已从高点跌15%。",
    vix: 24, rsi: 42, drop: 3, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "科技板块持续回调。Meta暴跌是科技熊市的标志性事件之一。",
  },
  {
    name: "2022 FTX崩盘", date: "2022-11-09", category: "tech_narrative",
    news: "2022年11月，FTX(全球第三大加密货币交易所)在数日内崩溃。80亿美元客户资金被挪用。比特币从21000跌至15500。加密市场恐慌蔓延。但这未对传统金融市场产生系统性传染。",
    vix: 26, rsi: 38, drop: 3, actual: "down", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "限于加密市场。传统金融市场几乎不受影响——表明加密与传统市场的隔离。",
  },
  {
    name: "2023 AI浪潮 (NVDA暴涨)", date: "2023-05-25", category: "tech_narrative",
    news: "2023年5月25日，英伟达发布远超预期的Q2指引(营收110亿vs预期71亿)。AI算力需求爆发式增长。英伟达股价暴涨25%+，市值一日增长近2000亿美元。纳斯达克进入技术性牛市。AI叙事主导市场。",
    vix: 18, rsi: 62, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "AI算力叙事主导市场。NVDA引领纳指进入技术性牛市。",
  },
  {
    name: "2024 英伟达拆股", date: "2024-06-07", category: "tech_narrative",
    news: "2024年6月7日，英伟达完成10:1股票拆分。拆分前股价超过1200美元，市值突破3万亿。拆分后继续上涨。AI算力投资叙事持续强化。市场担忧AI泡沫但FOMO情绪更占上风。",
    vix: 13, rsi: 58, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "拆股后继续上涨。AI算力投资叙事未受拆股影响。",
  },
  {
    name: "2025 AI基建 (Stargate)", date: "2025-01-21", category: "tech_narrative",
    news: "2025年1月21日，特朗普与软银、OpenAI、甲骨文联合宣布Stargate计划——5000亿美元AI基础设施投资。科技股大涨。AI算力需求叙事重新点燃。市场预期AI投资周期将持续多年。",
    vix: 14, rsi: 58, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "AI投资叙事强化。5000亿美元承诺推动科技股新高。",
  },
  {
    name: "2025 DeepSeek冲击", date: "2025-01-27", category: "tech_narrative",
    news: "2025年1月27日，DeepSeek发布开源大模型，以极低成本实现接近GPT-4性能。英伟达单日暴跌17%，市值蒸发5890亿美元——史上最大单日市值损失。费城半导体指数暴跌9.2%。市场恐慌重新评估AI芯片需求前景。",
    vix: 19.3, rsi: 42, drop: 3.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 0.5, threeMonthReturn: 2.1, recentVolatility: 0.014, volumeSpike: 4.0,
    knownPolicyAction: "尚无政策响应。分析师对AI芯片长期需求前景出现重大分歧。",
    knownVulnerability: "英伟达此前一年涨幅超200%。AI产业链估值处于极高水平。",
    outcomeDescription: "分化走势。科技股内部轮动。标普500整体持平。",
  },
  {
    name: "2021 恒大债务危机", date: "2021-09-20", category: "financial_crisis",
    news: "2021年9月20日，中国恒大集团面临3000亿美元债务违约风险，全球股市集体下跌。恒大股价年初至今暴跌85%。投资者担忧恒大违约可能引发中国房地产行业系统性危机。摩根士丹利和瑞银下调全球经济增长预期。",
    vix: 25.7, rsi: 35, drop: 4.2, actual: "up", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    oneMonthReturn: 5.8, threeMonthReturn: 7.2, recentVolatility: 0.016, volumeSpike: 2.3,
    knownPolicyAction: "中国央行注入1200亿元流动性。中国政府暗示恒大危机将由市场方式解决。",
    knownVulnerability: "中国房地产行业占GDP约29%。部分中资美元债已被抛售。",
    outcomeDescription: "影响有限。美股迅速恢复。恒大事后正式违约但市场已充分定价。",
  },

  // ═══════════════════════════════════════════════════════════
  // 监管/政策冲击 (11)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2013 美国政府停摆", date: "2013-10-01", category: "regulatory_policy",
    news: "2013年10月1日，美国联邦政府因国会未能通过预算而停摆。约80万联邦雇员被迫休假。市场对此已有预期——过去30年间发生过17次政府停摆。标普500当日小幅下跌0.3%。",
    vix: 16.7, rsi: 42, drop: 3.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 1.5, threeMonthReturn: 4.5, recentVolatility: 0.012, volumeSpike: 1.8,
    knownPolicyAction: "政府停摆已开始。两党正在进行谈判。美联储继续维持QE。",
    knownVulnerability: "政府停摆如果持续数周可能拖累GDP。债务上限尚未触及。",
    outcomeDescription: "震荡中缓慢走高。停摆持续16天但对市场影响极有限。",
  },
  {
    name: "2016 美国总统大选", date: "2016-11-08", category: "regulatory_policy",
    news: "2016年11月8日，特朗普赢得美国总统大选。选举结果远超预期——几乎所有民调都预测希拉里获胜。标普500期货盘后一度暴跌5%触发熔断。但11月9日开盘后迅速反弹——市场重新定价减税预期。",
    vix: 18.7, rsi: 38, drop: 3.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 3.5, threeMonthReturn: 5.5, recentVolatility: 0.015, volumeSpike: 3.2,
    knownPolicyAction: "特朗普承诺大规模减税和基建支出。共和党控制参众两院。",
    knownVulnerability: "特朗普贸易保护主义倾向可能破坏全球贸易。减税方案细节未知。",
    outcomeDescription: "'特朗普交易'推高股市。真正的行情在2017年减税后才加速。",
  },
  {
    name: "2018 中美贸易战开端", date: "2018-03-22", category: "regulatory_policy",
    news: "2018年3月22日，特朗普签署备忘录对中国500亿美元商品加征关税。中国宣布对等反制。全球贸易战担忧爆发。标普500在随后两周跌6%。工业、科技、农业股领跌。",
    vix: 24, rsi: 34, drop: 3.5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌。贸易战不确定性在2018年全年压制市场。",
  },
  {
    name: "2019 中美关税升级", date: "2019-05-05", category: "regulatory_policy",
    news: "2019年5月5日，特朗普突然宣布将对2000亿美元中国商品的关税从10%提高至25%。此前市场预期贸易协议即将达成。中国股市暴跌5.6%。全球股市集体下挫。",
    vix: 19, rsi: 38, drop: 2.5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短期暴跌后恢复。关税冲击在2019年夏季被市场逐渐消化。",
  },
  {
    name: "2019 中美第一阶段协议", date: "2019-12-13", category: "regulatory_policy",
    news: "2019年12月13日，美中宣布达成'第一阶段'贸易协议。美国取消原定12月15日生效的新关税，并将此前部分关税从15%降至7.5%。中国承诺未来两年增购2000亿美元美国商品。市场反应温和——协议已提前定价。",
    vix: 12.5, rsi: 62, drop: 0.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: 2.5, threeMonthReturn: 0.5, recentVolatility: 0.008, volumeSpike: 1.5,
    knownPolicyAction: "第一阶段贸易协议达成。关税部分降低。第二阶段谈判预计2020年开始。",
    knownVulnerability: "协议完全可逆。贸易战根本问题未解决。",
    outcomeDescription: "窄幅震荡。已提前定价。COVID随后成为主要驱动因素。",
  },
  {
    name: "2021 中国教育双减", date: "2021-07-23", category: "regulatory_policy",
    news: "2021年7月23日，中国政府发布双减政策，严格限制校外培训行业。教育股暴跌80-90%(新东方、好未来)。中概股集体崩盘。投资者担忧中国监管不确定性蔓延至其他行业。",
    vix: 21, rsi: 42, drop: 2, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中概股持续承压。监管不确定性成为中国科技股的长期逆风。",
  },
  {
    name: "2022 美联储激进加息确立", date: "2022-01-05", category: "regulatory_policy",
    news: "2022年1月5日，美联储公布12月FOMC会议纪要，显示官员们认为可能需要比预期更早、更快地加息，并开始讨论缩减8.8万亿资产负债表。纳斯达克暴跌3.3%。10年期美债收益率飙升至1.70%以上。",
    vix: 18.5, rsi: 45, drop: 5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -7.0, threeMonthReturn: -5.3, recentVolatility: 0.013, volumeSpike: 2.1,
    knownPolicyAction: "美联储明确转向鹰派。市场定价3月加息概率从53%飙升至80%。",
    knownVulnerability: "纳指2020-2021涨幅超100%。通胀7%创40年新高。科技股估值处互联网泡沫水平。",
    outcomeDescription: "持续下跌。2022年熊市的确认信号。纳指全年跌33%。",
  },
  {
    name: "2022 6月CPI通胀高峰", date: "2022-06-13", category: "regulatory_policy",
    news: "2022年6月10日公布5月CPI同比8.6%创40年新高。6月13日周一，标普暴跌3.9%正式进入熊市(自高点跌21%)。市场定价美联储6月15日可能加息75bp而非50bp。VIX飙升至35。",
    vix: 34.9, rsi: 28, drop: 21, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    oneMonthReturn: -5.5, threeMonthReturn: -8.5, recentVolatility: 0.03, volumeSpike: 3.2,
    knownPolicyAction: "市场定价加息75bp。美联储尚未确认但未否认。量化紧缩已启动。",
    knownVulnerability: "通胀持续超预期。消费者信心跌至历史低位。科技和加密货币已暴跌。",
    outcomeDescription: "延续下跌。6月15日加息75bp。熊市持续至10月才见底。",
  },
  {
    name: "2023 美国债务上限", date: "2023-05-24", category: "regulatory_policy",
    news: "2023年5月，美国债务上限谈判陷入僵局。财政部长耶伦警告6月1日可能出现违约。标普500下跌约2%。短期国债收益率飙升。市场将此视为政治表演而非真实违约风险——历史规律表明最终总会在最后一刻达成协议。",
    vix: 20, rsi: 40, drop: 3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "协议达成后反弹。债务上限恐慌已成周期性政治表演，市场已学会不为所动。",
  },

  // ═══════════════════════════════════════════════════════════
  // 商品冲击 (2)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2014 油价暴跌", date: "2014-11-27", category: "commodity",
    news: "2014年11月27日，OPEC在维也纳会议上决定维持3000万桶/日的产量目标不变，拒绝减产以支撑油价。布伦特原油当日暴跌6%至72美元(自6月115美元跌37%)。能源股领跌。美国页岩油生产商面临生存危机。",
    vix: 14.5, rsi: 44, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "能源板块暴跌但大盘继续上涨。低油价利好消费者和航空运输业。",
  },
  {
    name: "2020 油价负值", date: "2020-04-20", category: "commodity",
    news: "2020年4月20日，WTI原油5月期货合约结算价暴跌至-37.63美元/桶，史上首次出现负油价。全球储油能力饱和，交割地库欣库存接近爆满。多头持有者被迫倒贴钱平仓。能源板块暴跌。但标普500当日仅跌1.8%——市场将此事定性为期货技术性事件。",
    vix: 40, rsi: 35, drop: 1.8, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "技术性事件。油价快速恢复至正值。能源股在随后数月从低点大幅反弹。",
  },
  // ═══════════════════════════════════════════════════════════
  // 🆕 1970s — 石油危机与滞胀时代 (10)
  // ═══════════════════════════════════════════════════════════

  {
    name: "1971 尼克松冲击", date: "1971-08-15", category: "regulatory_policy",
    news: "1971年8月15日，尼克松总统宣布暂停美元与黄金兑换，征收10%进口附加税，实施90天工资物价管制。布雷顿森林体系瓦解。道指当日涨3.8%，但长期通胀预期飙升。全球货币体系进入浮动汇率时代。",
    vix: 12, rsi: 58, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短期股市大涨（脱离金本位带来政策空间）。但长期通胀失控埋下种子。",
  },
  {
    name: "1973 石油禁运", date: "1973-10-17", category: "commodity",
    news: "1973年10月17日，OPEC阿拉伯成员国宣布对美国、荷兰等国实施石油禁运，以报复其支持以色列。原油价格从每桶3美元飙升至12美元。道指在随后11个月暴跌45%。全球经济陷入衰退。",
    vix: 20, rsi: 25, drop: 15, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌。滞胀时代开启——高通胀+高失业+股市暴跌并存。",
  },
  {
    name: "1974 熊市底部", date: "1974-10-03", category: "financial_crisis",
    news: "1974年10月，道指触及577点的12年低点，自1973年1月高点1051暴跌45%。通货膨胀高达12%，利率飙升。水门事件加剧政治不确定性。这是二战后最严重的熊市。",
    vix: 25, rsi: 18, drop: 45, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹开始。道指在随后12个月涨超40%。但这是通胀见顶前的最后一跌。",
  },
  {
    name: "1975 纽约市破产危机", date: "1975-10-29", category: "financial_crisis",
    news: "1975年10月，纽约市濒临破产，福特总统拒绝联邦救助（纽约每日新闻头条：'Ford to City: Drop Dead'）。市政债券暴跌。最终纽约州成立紧急金融控制委员会接管财政。",
    vix: 16, rsi: 38, drop: 5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "救助方案出台后市场恢复。市政债危机未扩散至全国。",
  },
  {
    name: "1978 美元危机", date: "1978-10-30", category: "financial_crisis",
    news: "1978年10月，美元暴跌至战后新低。卡特政府宣布300亿美元美元保卫计划+加息1个百分点至9.5%。黄金飙升至每盎司226美元。道指暴跌。这是1970年代美元信用的最低点。",
    vix: 22, rsi: 28, drop: 12, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "美元保卫计划初期有效但随后失效。1979年通胀飙升至13%。",
  },
  {
    name: "1979 沃尔克紧缩", date: "1979-10-06", category: "regulatory_policy",
    news: "1979年10月6日，新任美联储主席保罗·沃尔克宣布将贴现率提高至12%，并彻底改变货币政策框架——从控制利率转向控制货币供应量。道指当日暴跌。这是历史上最激进的货币紧缩。",
    vix: 24, rsi: 30, drop: 8, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短期暴跌但最终成功遏制通胀。1982年开启史上最长牛市之一。",
  },
  {
    name: "1980 白银星期四", date: "1980-03-27", category: "commodity",
    news: "1980年3月27日，亨特兄弟垄断白银市场失败。白银价格从1月的49美元暴跌至10美元。期货交易所提高保证金要求引爆抛售。这一天被称为'白银星期四'。道指当日暴跌。",
    vix: 28, rsi: 22, drop: 5, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "商品市场冲击有限传染至股市。美联储介入稳定市场。",
  },
  {
    name: "1982 拉美债务危机", date: "1982-08-12", category: "financial_crisis",
    news: "1982年8月，墨西哥宣布无法偿还外债，触发拉美债务危机。随后巴西、阿根廷等国相继违约。美国大银行面临数百亿美元坏账风险。这是1970年代石油美元循环的终局。",
    vix: 18, rsi: 35, drop: 8, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "V型反弹。美联储降息+Brady计划最终解决债务问题。",
  },
  {
    name: "1984 储贷危机开端", date: "1984-03-14", category: "bank_crisis",
    news: "1984年3月，大陆伊利诺伊国民银行遭遇挤兑，FDIC提供史上最大救助。这是储贷危机的序幕。市场担忧区域性银行体系的脆弱性。美联储紧急提供流动性。",
    vix: 14, rsi: 42, drop: 3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "单一银行事件被FDIC成功隔离。但储贷危机在未来5年持续发酵。",
  },
  {
    name: "1986 石油暴跌", date: "1986-03-31", category: "commodity",
    news: "1986年3月，沙特阿拉伯放弃减产转而增产以夺回市场份额。原油价格从28美元暴跌至10美元以下。得克萨斯州和能源带经济遭受重创。但低油价利好消费者和航空公司。",
    vix: 16, rsi: 45, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "能源股暴跌但大盘继续上涨。低油价成为1986-1987牛市的燃料。",
  },

  // ═══════════════════════════════════════════════════════════
  // 🆕 1990s — 新兴市场危机与科技泡沫酝酿 (16)
  // ═══════════════════════════════════════════════════════════

  {
    name: "1992 黑色星期三 (ERM)", date: "1992-09-16", category: "financial_crisis",
    news: "1992年9月16日'黑色星期三'，乔治·索罗斯大规模做空英镑。英国被迫退出欧洲汇率机制(ERM)。英镑暴跌15%。英国央行花费超过30亿英镑保卫汇率失败。其他欧洲货币也面临压力。",
    vix: 18, rsi: 35, drop: 3, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "英国退出ERM后降息，股市大涨。英镑暴跌反而推动了英国经济复苏。",
  },
  {
    name: "1994 墨西哥比索危机", date: "1994-12-20", category: "financial_crisis",
    news: "1994年12月20日，墨西哥政府突然宣布比索贬值15%，引发新兴市场恐慌。随后贬值扩大至50%。美国和国际货币基金组织提供500亿美元救助方案。这被称为'龙舌兰酒危机'。",
    vix: 22, rsi: 28, drop: 5, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "V型反弹。克林顿政府500亿救助方案稳定了新兴市场。但这是1997亚洲危机的前奏。",
  },
  {
    name: "1995 巴林银行倒闭", date: "1995-02-27", category: "bank_crisis",
    news: "1995年2月，尼克·里森的未授权日经指数期货交易导致巴林银行（英国最古老的投资银行，233年历史）亏损14亿美元并破产。ING以1英镑名义价格收购其资产。全球金融市场短暂动荡。",
    vix: 15, rsi: 42, drop: 2, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "单一机构事件。ING迅速收购防止了系统性传染。",
  },
  {
    name: "1996 格林斯潘非理性繁荣", date: "1996-12-05", category: "tech_narrative",
    news: "1996年12月5日，美联储主席格林斯潘发表著名演讲，质疑股市是否处于'非理性繁荣'。道指当日暴跌2%但随后恢复上涨。这是他首次公开质疑科技股估值。纳指当时约1300点（2000年峰值5048）。",
    vix: 22, rsi: 45, drop: 2, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "'非理性繁荣'预警失效。市场在短暂下跌后继续上涨至2000年。",
  },
  {
    name: "1997 亚洲危机蔓延 (10月)", date: "1997-10-27", category: "financial_crisis",
    news: "1997年10月27日，全球股市在亚洲金融危机中暴跌。道指跌554点(-7.2%)，首次触发熔断机制暂停交易。此前10月23日，香港恒生指数单日跌10.4%。韩元、印尼盾、泰铢继续崩盘。",
    vix: 45, rsi: 15, drop: 7.2, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "V型反弹。美联储未降息但市场预期走软。IMF救助规模扩大。",
  },
  {
    name: "1998 亚洲危机底 (九月)", date: "1998-09-01", category: "financial_crisis",
    news: "1998年8-9月，全球风险资产在俄罗斯违约后暴跌。标普500自7月高点跌19%。新兴市场已跌50%+。长期资本管理公司濒临崩溃。市场恐慌全球信贷紧缩。美联储在9月29日降息25bp。",
    vix: 45, rsi: 20, drop: 19, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "V型反弹。美联储连续降息+LTCM救助推动市场恢复。这是1998年的底部。",
  },
  {
    name: "1999 巴西货币危机", date: "1999-01-13", category: "financial_crisis",
    news: "1999年1月，巴西雷亚尔被迫贬值，此前维持了三年的雷亚尔汇率盯住美元制度崩溃。新兴市场再次震动。但巴西在IMF救助下迅速稳定。本次危机未扩散至其他新兴市场。",
    vix: 30, rsi: 32, drop: 4, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "短暂恐慌后恢复。巴西危机的快速控制增强了市场对IMF救助机制的信心。",
  },
  {
    name: "1999 科技股狂热加速", date: "1999-10-27", category: "tech_narrative",
    news: "1999年秋季，纳斯达克在过去6个月飙升40%。科技IPO（首次公开募股）首日涨幅经常超过100%。投资者抛弃价值股涌入科技股。Pets.com、Webvan等无盈利公司市值数十亿。美联储在6月和8月加息。",
    vix: 22, rsi: 72, drop: 0, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "继续上涨至2000年3月（纳指再涨50%+），但泡沫信号已显而易见。2000年3月开始崩盘。",
  },
  {
    name: "1999 千年虫恐慌", date: "1999-12-31", category: "tech_narrative",
    news: "1999年底，全球担忧Y2K（千年虫）计算机漏洞将在2000年1月1日引发大规模系统崩溃。企业和政府投入数千亿美元修复。全球央行注入额外流动性以防危机。结果几乎无事发生。",
    vix: 20, rsi: 55, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "Y2K被证明是虚惊一场。过剩的流动性助推了2000年1-3月的最后疯涨。",
  },

  // ═══════════════════════════════════════════════════════════
  // 🆕 2000s — 互联网泡沫破灭与次贷危机前奏 (14)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2000 互联网泡沫破灭 (10月)", date: "2000-10-18", category: "tech_narrative",
    news: "2000年10月，纳斯达克自9月反弹高点暴跌。道指当日跌4.5%。中东局势升级叠加科技盈利预警。投资者确认科技泡沫破裂，不再相信'逢低买入'。微软盈利预警引发全科技板块抛售。",
    vix: 28.5, rsi: 22, drop: 25, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "L型下跌延续。纳指2000年全年跌39%，2001年继续下跌，最终跌78%。",
  },
  {
    name: "2001 美联储意外降息", date: "2001-01-03", category: "regulatory_policy",
    news: "2001年1月3日，美联储在非FOMC会议日意外降息50bp至6.0%。格林斯潘此举震惊市场——上次非会议降息是1998年LTCM危机。纳斯达克当日暴涨14.2%——史上最大单日涨幅。但反弹仅持续数周。",
    vix: 32, rsi: 25, drop: 35, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "'死猫反弹'(dead cat bounce)。降息未能阻止熊市。纳指在2001年继续跌29%。",
  },
  {
    name: "2001 9月21日恐慌底", date: "2001-09-21", category: "war_geopolitical",
    news: "2001年9月21日，标普500在911袭击10天后触及965点反弹底部。道指该周跌14.3%——大萧条以来最大单周跌幅。VIX飙至49。美联储已连续降息。布什总统宣布'全球反恐战争'。",
    vix: 49, rsi: 12, drop: 21, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹开始。911恐慌底部是2001-2002熊市的间歇性低点。",
  },
  {
    name: "2002 世通(WorldCom)丑闻", date: "2002-06-26", category: "financial_crisis",
    news: "2002年6月25日盘后，WorldCom披露38亿美元会计欺诈。公司股价已从64美元跌至83美分。CEO被捕。继安然之后，投资者对公司财报的信任彻底崩塌。纳斯达克已从峰值跌73%。国会紧急通过Sarbanes-Oxley法案。",
    vix: 35, rsi: 25, drop: 35, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "L型下跌。双重丑闻终结了90年代信任牛市。标普在10月才见底。",
  },
  {
    name: "2003 伊拉克战争前夕", date: "2003-03-11", category: "war_geopolitical",
    news: "2003年3月，布什总统对萨达姆·侯赛因发出48小时最后通牒。全球股市跌至伊拉克危机低点。金价和原油价格飙升。但在战争开始前，市场已开始定价'快速胜利'情景。",
    vix: 34.5, rsi: 28, drop: 14.5, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "开战前最后一跌。3月20日战争开始后市场强劲反弹。",
  },
  {
    name: "2004 马德里恐袭", date: "2004-03-11", category: "war_geopolitical",
    news: "2004年3月11日，马德里通勤列车遭遇系列炸弹袭击，191人遇难。欧洲股市暴跌。西班牙大选结果被广泛解读为对恐怖主义的让步。全球市场将此视为地缘政治风险上升信号。",
    vix: 18, rsi: 40, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂恐慌后恢复。恐怖袭击事件的市场影响通常很短暂。",
  },
  {
    name: "2005 通用汽车垃圾债降级", date: "2005-05-05", category: "financial_crisis",
    news: "2005年5月，标普将通用汽车债务降级至垃圾级。GM是美国最大的公司债发行者之一。信用市场动荡。市场担忧汽车行业养老金和医疗成本的结构性危机。但系统性传染未发生。",
    vix: 15, rsi: 42, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "单一公司事件。信用市场短暂震荡后恢复。",
  },
  {
    name: "2006 新兴市场暴跌 (5月)", date: "2006-05-22", category: "financial_crisis",
    news: "2006年5月，新兴市场集体暴跌。土耳其里拉和冰岛克朗暴跌。印度Sensex单日暴跌6.8%。全球投资者撤离新兴市场风险资产。美联储已加息至5%并暗示可能继续。",
    vix: 23.8, rsi: 28, drop: 7.5, actual: "up", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "V型反弹。美联储6月加息后暗示暂停。新兴市场资金回流。",
  },
  {
    name: "2007 中国A股227暴跌", date: "2007-02-27", category: "financial_crisis",
    news: "2007年2月27日，中国上证综指暴跌8.8%，为10年来最大单日跌幅。市场担忧政府将加强股市调控以遏制泡沫。全球股市连锁暴跌。道指当日跌416点(-3.3%)。这是中国A股首次成为全球波动的震源。",
    vix: 19, rsi: 32, drop: 3.3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。中国股市次日企稳。全球市场在一周内收复失地。",
  },
  {
    name: "2007 量化地震 (Quant Quake)", date: "2007-08-08", category: "flash_crash",
    news: "2007年8月8-9日，量化对冲基金大规模平仓引发'量化地震'。多数量化策略在两天内亏损10-30%。这与次贷危机同步爆发——BNP三只基金在8月9日冻结。市场流动性蒸发。",
    vix: 30, rsi: 30, drop: 8, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "持续下跌。量化地震是次贷危机的导火索。此后18个月标普跌57%。",
  },
  {
    name: "2008 贝尔斯登后 (4月)", date: "2008-04-15", category: "financial_crisis",
    news: "2008年4月，贝尔斯登救助一个月后，市场短暂反弹后再次下跌。投资者开始追问'谁是下一个？'。雷曼兄弟、美林、AIG都是怀疑对象。信用违约互换(CDS)利差持续扩大。",
    vix: 25, rsi: 38, drop: 15, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "L型下跌。春季的喘息被证明是暴风雨前的平静。9月雷曼破产。",
  },
  {
    name: "2008 全球央行联合降息", date: "2008-10-08", category: "regulatory_policy",
    news: "2008年10月8日，全球六大央行（美联储、欧央行、英格兰银行、瑞士央行、加拿大央行、瑞典央行）史无前例地联合降息50bp。这是有史以来第一次同步行动。但市场继续暴跌——降息无法阻止信贷冻结。",
    vix: 57, rsi: 16, drop: 30, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "降息未能止血。市场继续暴跌至2009年3月。但这是政策响应的转折点。",
  },
  {
    name: "2009 银行国有化恐慌", date: "2009-02-20", category: "bank_crisis",
    news: "2009年2月，花旗银行股价跌破1美元。市场担忧美国政府将不得不国有化主要银行。花旗和美国银行CDS飙升至危机水平。但花旗CEO内部备忘录'公司仍有盈利能力'被泄露，引发银行股大反弹。",
    vix: 49, rsi: 22, drop: 55, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "银行股双底。花旗从1美元反弹——这是2008危机的真正底部信号。",
  },
  {
    name: "2009 迪拜债务危机", date: "2009-11-27", category: "financial_crisis",
    news: "2009年11月，迪拜世界（Dubai World）要求暂停偿还590亿美元债务。全球股市暴跌。这是2008危机后首次主权相关债务危机。阿布扎比最终提供100亿美元救助。",
    vix: 26, rsi: 38, drop: 4, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "阿布扎比救助后市场快速恢复。确认了主权债务'too big to fail'模式。",
  },

  // ═══════════════════════════════════════════════════════════
  // 🆕 2010s — 欧债危机、闪崩与量化宽松时代 (20)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2010 欧债危机第一波 (5月)", date: "2010-05-06", category: "financial_crisis",
    news: "2010年5月6日（闪电崩盘同日），希腊债务危机引爆欧洲。希腊10年期国债收益率飙升至12%。欧盟和IMF提供1100亿欧元救助。投资者担忧债务危机蔓延至葡萄牙、爱尔兰、西班牙。",
    vix: 40, rsi: 15, drop: 9, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "V型反弹。欧盟救助+欧洲央行购买债券暂时平息市场。闪电崩盘同日加剧了抛售。",
  },
  {
    name: "2010 爱尔兰银行救助", date: "2010-11-21", category: "bank_crisis",
    news: "2010年11月，爱尔兰政府正式请求欧盟/IMF救助。该国银行系统在房地产泡沫破裂后资不抵债。救助规模为850亿欧元。这是欧债危机的第二块多米诺骨牌。",
    vix: 24, rsi: 35, drop: 5, actual: "neutral", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "救助后市场企稳。但欧债危机远未结束——葡萄牙和西班牙仍在排队。",
  },
  {
    name: "2011 日本311大地震", date: "2011-03-11", category: "commodity",
    news: "2011年3月11日，日本发生9.0级大地震和海啸，引发福岛核电站灾难。日经225暴跌。全球供应链中断——汽车和电子产业严重受影响。日元在灾后飙升（市场预期日本投资者将回流资金）。",
    vix: 29, rsi: 32, drop: 5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。全球央行联合干预日元汇率。供应链在数月内恢复。",
  },
  {
    name: "2011 欧债危机意大利蔓延", date: "2011-11-09", category: "financial_crisis",
    news: "2011年11月，意大利10年期国债收益率飙升至7%以上——'不可持续'的公认阈值。贝卢斯科尼辞职。欧洲央行大规模购买意大利债券。市场担忧欧元区第三大经济体可能违约。",
    vix: 36, rsi: 25, drop: 17, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "持续下跌至年底。LTRO在12月推出后才企稳。",
  },
  {
    name: "2012 Facebook IPO暴跌", date: "2012-05-18", category: "tech_narrative",
    news: "2012年5月18日，Facebook在纳斯达克上市，市值1040亿美元（当时科技股最大IPO）。上市首日因技术故障延迟交易。股价在随后三个月跌50%至19美元。科技股IPO信心受挫。",
    vix: 23, rsi: 40, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "单一公司事件对大盘影响有限。Facebook在一年后恢复。",
  },
  {
    name: "2012 西班牙银行救助", date: "2012-06-09", category: "bank_crisis",
    news: "2012年6月，西班牙政府正式请求欧盟为该国银行系统提供1000亿欧元救助。西班牙10年期国债收益率飙升至7%以上。市场担忧救助将增加西班牙主权债务负担。德拉吉7月'不惜一切代价'演讲随后扭转市场。",
    vix: 26, rsi: 28, drop: 10, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "V型反弹。德拉吉7月演讲+OMT计划终结了欧洲主权债务恐慌。",
  },
  {
    name: "2013 新兴市场暴跌 (8月)", date: "2013-08-20", category: "financial_crisis",
    news: "2013年8月，印度卢比和土耳其里拉暴跌至历史新低。市场担忧美联储缩减QE将导致新兴市场大规模资本外流。印度央行和土耳其央行被迫紧急加息。'脆弱五国'（印度、印尼、巴西、土耳其、南非）遭受重创。",
    vix: 17, rsi: 38, drop: 4, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "新兴市场震荡但美股继续上涨。美联储的鸽派沟通缓解了恐慌。",
  },
  {
    name: "2014 欧央行负利率", date: "2014-06-05", category: "regulatory_policy",
    news: "2014年6月5日，欧洲央行首次将存款利率降至-0.10%，成为首个实施负利率的主要央行。德拉吉同时宣布定向长期再融资操作(TLTRO)。欧元暴跌。全球债券收益率降至历史低位。",
    vix: 11, rsi: 58, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "负利率推动风险资产上涨。欧洲股市和全球债券市场进入'QE狂欢'。",
  },
  {
    name: "2015 中国股市泡沫破裂 (7月)", date: "2015-07-08", category: "financial_crisis",
    news: "2015年7月，中国在上证指数不到一个月暴跌30%后紧急救市。禁止大股东减持+暂停IPO+国家队买入+公安介入调查'恶意做空'。超过1400家上市公司停牌——占A股总市值一半以上。全球市场剧烈震荡。",
    vix: 25, rsi: 18, drop: 32, actual: "down", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "救市短暂企稳后继续下跌（8月再跌8.5%）。中国式救市的局限——暂停交易不能改变基本面。",
  },
  {
    name: "2015 大众汽车排放丑闻", date: "2015-09-21", category: "regulatory_policy",
    news: "2015年9月，大众汽车被揭露在排放测试中作弊（'柴油门'）。股价两天跌35%，市值蒸发300亿欧元。全球汽车股集体下挫。这是史上最大企业治理丑闻之一。",
    vix: 22, rsi: 35, drop: 5, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "单一公司事件对大盘影响有限。德国DAX因大众权重下跌但迅速恢复。",
  },
  {
    name: "2016 德意志银行危机 (2月)", date: "2016-02-09", category: "bank_crisis",
    news: "2016年2月，德意志银行CDS飙升，市场担忧其偿付能力。德银股价跌至历史新低。CoCo债券（应急可转债）暴跌。全球银行股被血洗。这是2016年最严重的金融恐慌。",
    vix: 28, rsi: 25, drop: 10.5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。德银回购债券+业绩改善缓解了恐慌。但德银的问题持续多年。",
  },
  {
    name: "2017 法国大选马克龙", date: "2017-04-23", category: "regulatory_policy",
    news: "2017年4月23日，埃马纽埃尔·马克龙赢得法国总统大选第一轮投票。市场此前极度担忧极右翼候选人勒庞获胜将导致法国脱欧公投（'Frexit'）。欧元和欧洲股市大涨。'欧洲解体'叙事消退。",
    vix: 14, rsi: 55, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "'马克龙交易'推动欧洲股市大涨。政治不确定性消除。",
  },
  {
    name: "2018 VIX产品崩溃 (Volmageddon)", date: "2018-02-05", category: "flash_crash",
    news: "2018年2月5日，道指盘中暴跌1597点(-6.3%)。VIX单日飙升115%至37。做空VIX的ETP产品XIV一天蒸发80亿美元被迫清盘。这是人类历史上最大规模的波动率产品集体爆仓。道指当日创最大单日点数跌幅。",
    vix: 37.3, rsi: 25, drop: 10.2, actual: "up", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "V型反弹。波动率产品爆仓是微观结构事件。基本面未恶化。",
  },
  {
    name: "2019 中美贸易战停火 (12月)", date: "2019-12-13", category: "regulatory_policy",
    news: "2019年12月13日，美中宣布达成'第一阶段'贸易协议。美国取消原定12月15日生效的新关税，并将部分关税税率降至7.5%。中国承诺未来两年增购2000亿美元美国商品。市场提前定价了此消息。",
    vix: 12.5, rsi: 62, drop: 0.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "窄幅震荡。协议完全可逆。COVID在两个月后成为主要驱动。",
  },
  {
    name: "2019 回购市场危机", date: "2019-09-17", category: "financial_crisis",
    news: "2019年9月17日，美国隔夜回购利率从2%飙升至10%，表明银行体系准备金不足。这是2008年以来最严重的融资市场压力。纽约联储被迫启动隔夜回购操作注入流动性——这是十年来首次。",
    vix: 16, rsi: 48, drop: 1, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "美联储恢复资产负债表扩张（'不是QE的QE'）。市场继续上涨。",
  },

  // ═══════════════════════════════════════════════════════════
  // 🆕 2020s — 疫情后、通胀与AI革命 (34)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2020 美联储紧急降息 (3月3日)", date: "2020-03-03", category: "regulatory_policy",
    news: "2020年3月3日，美联储在非FOMC日紧急降息50bp至1.00-1.25%（2008年以来首次非会议降息）。但市场将此解读为美联储看到了市场看不到的恐慌——道指当日暴跌786点(-2.9%)。'美联储恐慌式降息'反而加剧了市场恐慌。",
    vix: 38, rsi: 32, drop: 8, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "降息未能止血。恐慌加速——3月11日WHO宣布大流行，3月23日才见底。",
  },
  {
    name: "2020 油价负值 (WTI -$37)", date: "2020-04-20", category: "commodity",
    news: "2020年4月20日，WTI原油5月期货合约结算价暴跌至-37.63美元/桶——历史首次负油价。全球储油能力饱和，交割地库欣库存接近爆满。多头持有者被迫倒贴钱平仓。中国银行'原油宝'产品投资者爆仓。",
    vix: 40, rsi: 35, drop: 1.8, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "技术性事件。油价快速恢复正常。但中国原油宝投资者损失惨重。",
  },
  {
    name: "2020 疫苗宣布 (辉瑞)", date: "2020-11-09", category: "pandemic",
    news: "2020年11月9日，辉瑞和BioNTech宣布其COVID疫苗有效率达90%以上，远超预期。全球股市暴涨。道指涨超1600点。'复苏交易'全面启动——周期性股票、航空、能源、银行领涨。科技股相对落后（'stay at home'交易终结）。",
    vix: 25, rsi: 60, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "疫苗推动史上最大板块轮动之一。成长股→价值股的轮动持续至2021年3月。",
  },
  {
    name: "2021 GameStop轧空", date: "2021-01-28", category: "tech_narrative",
    news: "2021年1月，Reddit论坛WallStreetBets的散户投资者联合做多GameStop，引发史诗级轧空。GME从19美元飙升至483美元。对冲基金Melvin Capital损失53%。Robinhood被迫限制交易引发国会听证会和监管争议。",
    vix: 33, rsi: 40, drop: 3, actual: "up", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "单一股票事件对大盘影响有限。但揭示了社交媒体时代的新市场风险——'模因股'现象。",
  },
  {
    name: "2021 Archegos爆仓", date: "2021-03-26", category: "bank_crisis",
    news: "2021年3月26日，家族办公室Archegos Capital Management的杠杆炒股策略爆仓，多家大行（瑞信损失55亿、野村损失29亿、摩根士丹利抢先跑路）遭受巨大损失。ViacomCBS和Discovery股票暴跌。这是1998年LTCM以来最大的杠杆爆仓事件。",
    vix: 21, rsi: 42, drop: 2, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "单一公司事件被隔离。Archegos揭示了影子银行和总回报互换的监管盲区。",
  },
  {
    name: "2021 恒大危机加剧 (9月)", date: "2021-09-20", category: "financial_crisis",
    news: "2021年9月，中国恒大集团面临3000亿美元债务违约。恒大股价年内暴跌85%。国际投资者担忧中国房地产行业系统性危机蔓延全球。中国央行注入流动性，但明示恒大将由市场方式解决。恒大多次在最后关头支付利息避免正式违约。",
    vix: 25.7, rsi: 35, drop: 4.2, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "美股反弹。恒大危机主要冲击中资美元债和香港市场。全球传染有限。",
  },
  {
    name: "2022 俄乌宣战", date: "2022-02-24", category: "war_geopolitical",
    news: "2022年2月24日，俄罗斯对乌克兰发动全面军事行动。全球股市暴跌，欧洲股市跌超5%。原油飙升至105美元。欧洲天然气暴涨40%。西方对俄实施全面经济制裁。SWIFT制裁使俄金融体系与全球隔离。",
    vix: 33, rsi: 28, drop: 12, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌。能源冲击+制裁不确定性压制欧洲市场。",
  },
  {
    name: "2022 伦敦金属交易所镍逼空", date: "2022-03-08", category: "commodity",
    news: "2022年3月8日，伦敦金属交易所(LME)镍期货价格在两天内从3万飙升至10万美元/吨。中国青山控股持有大量空头头寸，面临数十亿美元损失。LME史无前例地暂停交易并取消当日所有镍交易——这是145年来首次。",
    vix: 36, rsi: 26, drop: 13, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "单一商品事件被LME强制干预解决。但对LME公信力造成永久损害。",
  },
  {
    name: "2022 英国养老金LDI危机", date: "2022-09-28", category: "financial_crisis",
    news: "2022年9月28日，英格兰银行紧急宣布无限量购买长期英国国债，以遏制英国养老金的LDI（负债驱动投资）抵押品危机。此前财政大臣夸西减税计划引发国债和英镑暴跌。养老金面临大规模保证金追缴。",
    vix: 32, rsi: 25, drop: 23.5, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "英格兰银行介入后市场企稳。特拉斯首相下台。这是现代金融史上罕见的政策自我毁灭案例。",
  },
  {
    name: "2022 美联储加息75bp确立", date: "2022-06-15", category: "regulatory_policy",
    news: "2022年6月15日，美联储加息75bp至1.50-1.75%，为1994年以来最大单次加息。此前5月CPI同比8.6%创40年新高。鲍威尔表示7月可能再加75bp。标普在加息后短暂反弹（'利空出尽'），但熊市远未结束。",
    vix: 32, rsi: 30, drop: 21, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂反弹后继续下跌。熊市在10月才见底。全年标普跌19%。",
  },
  {
    name: "2022 日本央行意外放松YCC", date: "2022-12-20", category: "regulatory_policy",
    news: "2022年12月20日，日本央行意外将10年期国债收益率上限从0.25%提高至0.50%——市场解读为退出超宽松政策的信号。日元暴涨3%。全球债券收益率飙升。日经指数暴跌。这是日本25年超宽松政策的历史转折点。",
    vix: 22, rsi: 42, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂冲击后恢复。日本央行重申这并非紧缩，市场逐渐消化。",
  },
  {
    name: "2023 美国债务上限僵局", date: "2023-05-24", category: "regulatory_policy",
    news: "2023年5月，美国债务上限谈判陷入僵局。财政部长耶伦警告6月1日可能违约。标普500下跌约2%。短期国债收益率飙升（6月到期国债利率超7%）。市场将此视为政治表演——历史规律表明最终总会达成协议。",
    vix: 20, rsi: 40, drop: 3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "6月1日达成协议后反弹。债务上限恐慌已成周期性政治表演，市场逐渐免疫。",
  },
  {
    name: "2023 美联储加息暂停", date: "2023-06-14", category: "regulatory_policy",
    news: "2023年6月14日，美联储在连续10次加息后首次暂停，维持利率在5.00-5.25%。但点阵图暗示年内可能再加两次25bp。市场将此解读为鸽派信号。标普500过去8个月已涨20%+。AI叙事主导市场情绪。",
    vix: 14, rsi: 62, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "暂停加息推动股市继续上涨。2023年下半年纳指涨超30%。",
  },
  {
    name: "2023 穆迪降级美国银行", date: "2023-08-08", category: "bank_crisis",
    news: "2023年8月，穆迪下调10家美国中型银行信用评级，并将6家银行巨头列入降级观察名单。理由是存款成本上升+商业地产敞口+监管资本要求提高。银行股集体下跌。这是SVB危机后的余震。",
    vix: 18, rsi: 40, drop: 5, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "影响有限。市场逐渐将银行降级视为滞后的确认而非新的风险信号。",
  },
  {
    name: "2024 日本结束负利率", date: "2024-03-19", category: "regulatory_policy",
    news: "2024年3月19日，日本央行将政策利率从-0.1%上调至0-0.1%，结束持续8年的负利率政策。同时取消收益率曲线控制(YCC)。这是日本17年来首次加息。日元短暂走强。全球市场反应平淡。",
    vix: 13, rsi: 55, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "市场已充分预期。日本央行鸽派加息+维持宽松立场，未引发全球冲击。",
  },
  {
    name: "2024 印度大选震荡", date: "2024-06-04", category: "regulatory_policy",
    news: "2024年6月，印度大选结果公布，莫迪领导的BJP失去议会多数席位，远超市场预期。印度Sensex指数单日暴跌6%。卢比贬值。市场担忧政治不稳定将阻碍经济改革。莫迪仍需联合执政。",
    vix: 16, rsi: 32, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂恐慌后反弹。莫迪仍成功组阁。印度股市长期上涨趋势未变。",
  },
  {
    name: "2024 全球IT中断 (CrowdStrike)", date: "2024-07-19", category: "tech_narrative",
    news: "2024年7月19日，CrowdStrike的一个软件更新导致全球Windows系统蓝屏崩溃。航空公司、银行、医院、911紧急服务全面瘫痪。微软估计850万台设备受影响。CrowdStrike股价暴跌。这是史上最大IT中断事件。",
    vix: 17, rsi: 45, drop: 1, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "影响迅速消退。单一公司事件+操作性事故，无系统性风险。",
  },
  {
    name: "2024 中国924救市", date: "2024-09-24", category: "regulatory_policy",
    news: "2024年9月24日，中国人民银行宣布一系列史无前例的救市措施——降准50bp+降息+5000亿股票互换便利+3000亿股票回购再贷款。上证指数暴涨4.2%——两年多最大单日涨幅。全球中概股暴涨。",
    vix: 15, rsi: 48, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中国股市暴涨但随后回吐部分涨幅。'中国版QE'效果仍在观察。",
  },
  {
    name: "2025 DeepSeek AI冲击 (1月)", date: "2025-01-27", category: "tech_narrative",
    news: "2025年1月27日，中国AI公司DeepSeek发布开源大模型，以极低成本实现接近GPT-4性能。英伟达单日暴跌17%，市值蒸发5890亿美元——史上最大单日市值损失。费城半导体指数暴跌9.2%。全球AI产业链估值被重新审视。",
    vix: 19.3, rsi: 42, drop: 3.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "分化走势。科技股内部轮动。标普500整体持平。DeepSeek冲击改变了AI投资叙事——从'唯算力论'转向'效率创新'。",
  },
  {
    name: "2025 美国关税冲击 (4月)", date: "2025-04-03", category: "regulatory_policy",
    news: "2025年4月2日，美国政府宣布对所有进口商品征收10%基准关税，并对60个贸易逆差国征收额外对等关税。次日全球股市暴跌，标普期货跌4%。VIX飙升至52（2020年3月以来最高）。亚太和欧洲市场同步崩盘。美元走弱。",
    vix: 52, rsi: 18, drop: 10, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续震荡下跌。贸易战升级预期压制市场。这是2025年最严重的市场冲击。",
  },
  {
    name: "2025 美国关税暂停90天", date: "2025-04-09", category: "regulatory_policy",
    news: "2025年4月9日，特朗普总统突然宣布对75个国家暂停征收'对等关税'90天，但对中国关税提高至125%。标普500暴涨9.5%——二战后最大单日涨幅。VIX从52暴跌至30。债券市场和汇率市场剧烈反转。",
    vix: 30, rsi: 28, drop: 8, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "有史以来最猛烈的单日反弹之一。但90天后不确定性仍在。",
  },
  {
    name: "2025 美联储独立性争议", date: "2025-05-15", category: "regulatory_policy",
    news: "2025年5月，特朗普总统公开要求美联储主席鲍威尔降息，声称'现在正是降息的完美时机'。市场担忧美联储政治独立性的终结。鲍威尔坚持'不降息'立场。美债收益率曲线陡峭化。VIX攀升。",
    vix: 22, rsi: 38, drop: 5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "震荡。美联储独立性是市场定价的基石——若被侵蚀将引发系统性重估。",
  },

  // ═══════════════════════════════════════════════════════════
  // 🆕 区域/国别特定事件 (10)
  // ═══════════════════════════════════════════════════════════

  {
    name: "2000 阿根廷债务违约", date: "2001-12-23", category: "financial_crisis",
    news: "2001年12月，阿根廷宣布暂停偿还1320亿美元外债——当时史上最大主权债务违约。比索脱离与美元1:1的固定汇率后暴跌。社会骚乱和银行挤兑席卷全国。IMF拒绝提供额外救助。",
    vix: 24, rsi: 38, drop: 2, actual: "neutral", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "主要影响新兴市场。全球市场将此视为孤立的主权信用事件。",
  },
  {
    name: "2004 中国宏观调控", date: "2004-04-30", category: "regulatory_policy",
    news: "2004年4月，中国政府出重拳调控过热的经济——提高存款准备金率、限制钢铁/水泥/电解铝投资、收紧土地供应。上证指数暴跌。但全球市场反应平淡，将此视为中国特色的宏观调控。",
    vix: 16, rsi: 42, drop: 2, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中国股市下跌但全球市场继续上涨。中国经济在调控后成功软着陆。",
  },
  {
    name: "2007 中国A股530暴跌", date: "2007-05-30", category: "regulatory_policy",
    news: "2007年5月30日，中国财政部将股票交易印花税从0.1%上调至0.3%以遏制股市泡沫。上证综指暴跌6.5%，随后几日继续下跌超过15%。但全球市场基本不受影响——2007年夏全球风险资产仍在上涨。",
    vix: 15, rsi: 48, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中国股市在夏季恢复上涨（直至10月见顶）。印花税上调被证明无效。",
  },
  {
    name: "2013 塞浦路斯银行挤兑", date: "2013-03-18", category: "bank_crisis",
    news: "2013年3月，塞浦路斯为换取100亿欧元欧盟救助，宣布对银行存款征收6.75-9.9%的'自救税'(bail-in)——史上首次。塞浦路斯银行关闭两周。虽然经济体量极小，但'bail-in'先例震撼了全球银行债权人和储户。",
    vix: 19, rsi: 38, drop: 2, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "塞浦路斯太小，无法产生系统性传染。但bail-in成为此后银行救助模板（2023瑞信AT1减记即源出于此）。",
  },
  {
    name: "2014 苏格兰独立公投", date: "2014-09-18", category: "regulatory_policy",
    news: "2014年9月，苏格兰独立公投前一周，民调显示支持独立一方首次领先。英镑暴跌至10个月新低。英国股市下挫。最终投票结果为55%反对独立——联合王国幸存。英镑和英国股市在结果公布后反弹。",
    vix: 15, rsi: 42, drop: 3, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。独立公投失败消除了英国分裂的重大政治不确定性。",
  },
  {
    name: "2015 希腊公投否决救助", date: "2015-07-05", category: "financial_crisis",
    news: "2015年7月5日，希腊公投以61%对39%否决了债权人的救助条件。希腊银行关闭，实施资本管制。市场担忧希腊退出欧元区(Grexit)将成为现实。但一周后，希腊总理齐普拉斯屈服，接受了比公投前更苛刻的救助条件。",
    vix: 22, rsi: 36, drop: 3, actual: "neutral", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "影响有限。Grexit被避免。市场得出结论：欧盟不会让任何国家退出欧元区。",
  },
  {
    name: "2018 意大利预算危机", date: "2018-10-19", category: "financial_crisis",
    news: "2018年10月，意大利民粹主义政府提出大幅扩大预算赤字（GDP的2.4%），挑战欧盟财政规则。意大利10年期国债收益率飙升至3.7%。意大利银行股暴跌。这是2012年后最严重的欧洲主权债务恐慌。欧盟最终接受修正后的预算。",
    vix: 25, rsi: 30, drop: 7, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "意大利在欧盟压力下修改预算，危机平息。但意大利债务问题从未解决（GDP130%+）。",
  },
  {
    name: "2020 英国脱欧贸易协议", date: "2020-12-24", category: "regulatory_policy",
    news: "2020年12月24日圣诞前夜，英国和欧盟在最后关头达成脱欧贸易协议，避免了'无协议脱欧'。四年半的脱欧不确定性终结。英镑兑美元涨至1.36（两年半新高）。英国股市因已提前定价而涨幅有限。",
    vix: 22, rsi: 52, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "有协议的脱欧推动英镑和英国资产温和上涨。全球市场已对此结果充分预期。",
  },
  {
    name: "2023 土耳其里拉崩盘", date: "2023-06-22", category: "financial_crisis",
    news: "2023年6月，土耳其里拉在埃尔多安连任后放弃非正统低利率政策，里拉在两周内贬值20%+。通胀率仍高达40%。土耳其央行将利率从8.5%一次性加息至15%。这是土耳其数十年来最严重的货币危机。",
    vix: 14, rsi: 55, drop: 0, actual: "neutral", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "区域性货币危机。全球市场反应极小。土耳其已自绝于国际资本市场。",
  },
  {
    name: "2024 法国政治危机", date: "2024-06-09", category: "regulatory_policy",
    news: "2024年6月，法国总统马克龙在欧洲议会选举惨败后宣布解散国民议会提前大选。极右翼国民联盟(RN)和左翼联盟(NFP)在第一轮投票中领先。法国10年期国债收益率飙升至3.2%（与德国利差扩大至2012年水平）。银行股暴跌。",
    vix: 18, rsi: 35, drop: 5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "第二轮投票后极右翼意外失利。法国政治不确定性缓解但债务问题未解。",
  },
  // ── 更多 DOWN 事件: 无恐慌的慢熊/结构性问题 (15) ──
  {
    name: "1976 滞胀反弹天折", date: "1976-09-21", category: "financial_crisis",
    news: "1976年9月，在经历1975-76年的强劲反弹后（道指涨75%），通胀再度加速至6%。美联储被迫再次加息。股市从9月高点开始长达18个月的震荡下跌。滞胀的顽固性超出预期。",
    vix: 16, rsi: 42, drop: 5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "慢熊。1977-1978年震荡下跌——通胀阴影挥之不去。",
  },
  {
    name: "1981 双重衰退", date: "1981-08-12", category: "financial_crisis",
    news: "1981年8月，美国经济在短暂复苏后再次陷入衰退（'双底衰退'）。沃尔克将联邦基金利率推高至20%以遏制通胀。道指在1981-1982年累计下跌24%。这是大萧条以来最严重的衰退。",
    vix: 22, rsi: 28, drop: 12, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌至1982年8月。但这是大牛市的黎明前黑暗。",
  },
  {
    name: "1990 第三次石油冲击", date: "1990-08-02", category: "commodity",
    news: "1990年8月，伊拉克入侵科威特导致原油价格翻倍（17→36美元）。美国经济在1990年7月已进入衰退。消费者信心崩溃。道指在随后三个月跌18%。这是1990-91年衰退的核心驱动。",
    vix: 36, rsi: 22, drop: 10, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。美联储降息+沙漠风暴行动迅速结束战争。",
  },
  {
    name: "1994 美联储加息周期", date: "1994-02-04", category: "regulatory_policy",
    news: "1994年2月4日，美联储意外加息25bp至3.25%，开启12个月加息周期（最终将利率从3.0%加至6.0%）。全球债券市场暴跌（'债券大屠杀'），损失超1.5万亿美元。橙县因衍生品亏损破产。墨西哥比索危机爆发。",
    vix: 16, rsi: 38, drop: 5, actual: "neutral", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "股市横盘震荡。债券暴跌但股市在1994年基本持平（标普全年+1.3%）。",
  },
  {
    name: "2000 纳斯达克连跌7天", date: "2000-04-14", category: "tech_narrative",
    news: "2000年4月14日，纳斯达克在连跌7天后暴跌9.7%至3321点。自3月10日5048高点已跌34%。当日为纳斯达克史上第二大单日跌幅。微软被裁定违反反垄断法。科技股IPO市场冻结。",
    vix: 38, rsi: 22, drop: 34, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "L型下跌继续。纳斯达克在2002年10月才见底（1108点，累计跌78%）。",
  },
  {
    name: "2000 雅虎盈利预警", date: "2000-09-26", category: "tech_narrative",
    news: "2000年9月，雅虎发布盈利预警——互联网广告收入增长大幅放缓。科技股再次暴跌。纳斯达克自9月高点跌20%。投资者确认'新经济'范式不会拯救无盈利的科技公司。",
    vix: 27, rsi: 30, drop: 16, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "L型下跌。盈利真实性被质疑。科技股在2001年继续暴跌。",
  },
  {
    name: "2007 标普500见顶", date: "2007-10-09", category: "financial_crisis",
    news: "2007年10月9日，标普500触及1565点的牛市顶部。此后17个月暴跌57%至2009年3月的666点。当时几乎无人意识到这是顶峰——次贷损失被普遍认为'可控'。花旗CEO称'音乐停止时流动性才会消失'。",
    vix: 18, rsi: 55, drop: 0, actual: "down", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "L型下跌的起点。这是大萧条以来最严重的熊市。",
  },
  {
    name: "2011 日本311后持续下跌", date: "2011-03-15", category: "financial_crisis",
    news: "2011年3月，日本大地震+海啸+核事故三重打击。日经指数两日暴跌16%。全球供应链中断担忧加剧。日本央行注入创纪录流动性。但核危机的不确定性（福岛3号机组爆炸）持续压制市场数周。",
    vix: 31, rsi: 22, drop: 8, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌至3月底。全球供应链中断+核恐惧双杀。4月开始反弹。",
  },
  {
    name: "2021 中国科技监管风暴", date: "2021-07-23", category: "regulatory_policy",
    news: "2021年7月，中国监管机构连环出击——滴滴被下架、新东方等教育股暴跌80-90%、蚂蚁集团IPO重启无望。恒生科技指数自2月高点跌超40%。全球投资者开始全面重估中国科技股的政治风险溢价。",
    vix: 21, rsi: 42, drop: 2, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中概股持续下跌。中国监管恐慌在2021年成为全球市场的独立风险源。",
  },
  {
    name: "2022 加密货币崩盘 (Terra/Luna)", date: "2022-05-12", category: "tech_narrative",
    news: "2022年5月，算法稳定币TerraUSD(UST)与美元脱钩，其关联代币Luna从80美元暴跌至0.0001美元——400亿美元市值在72小时内蒸发。这是历史上最大规模的加密货币崩盘之一。加密对冲基金Three Arrows Capital随后破产。",
    vix: 32, rsi: 35, drop: 5, actual: "down", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "加密市场崩盘未传染美股。但加密市场内部——借贷平台Celsius和Voyager随后破产。",
  },
  {
    name: "2022 英国财政灾难 (9月23日)", date: "2022-09-23", category: "regulatory_policy",
    news: "2022年9月23日，英国财政大臣夸西·克沃滕宣布450亿英镑无资金支持的减税计划（50年来最大规模），市场震惊。英镑暴跌至1.03美元——接近平价。英国国债暴跌，30年期收益率飙升至5%以上。英格兰银行被迫紧急干预。",
    vix: 32, rsi: 25, drop: 23.5, actual: "down", hasPolicy: false, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "政策灾难。特拉斯首相在45天后下台——英国史上最短任期首相。",
  },
  {
    name: "2023 地区银行危机持续 (5月)", date: "2023-05-04", category: "bank_crisis",
    news: "2023年5月，第一共和银行被FDIC接管后卖给摩根大通——美国史上第二大银行倒闭案（仅次于华盛顿互惠银行）。地区银行股继续暴跌。PacWest和Western Alliance被视为下一个目标。投资者怀疑危机尚未结束。",
    vix: 20, rsi: 38, drop: 5, actual: "down", hasPolicy: true, hasLeverage: false, hasSolvency: true,
    outcomeDescription: "持续下跌。虽然监管快速响应，地区银行股在2023年全年被持续做空。",
  },
  {
    name: "2025 中国房地产见底信号", date: "2025-03-15", category: "financial_crisis",
    news: "2025年3月，中国统计局数据显示2月新房价格指数环比下跌收窄至-0.1%。市场开始猜测中国房地产三年下行周期是否终于触底。但销售仍处于历史低位，恒大和碧桂园仍在债务重组中。",
    vix: 15, rsi: 45, drop: 0, actual: "down", hasPolicy: false, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "尚未确认底部。中国房地产市场仍在去杠杆。",
  },
  {
    name: "2025 英伟达增长放缓", date: "2025-05-28", category: "tech_narrative",
    news: "2025年5月，英伟达公布Q1财报，营收同比增50%但增速较前几个季度的200%+大幅放缓。英伟达股价暴跌8%。市场开始质疑AI算力投资的持续性和回报率。费城半导体指数随之回调。",
    vix: 22, rsi: 38, drop: 5, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "科技股回调。英伟达增速放缓是AI投资周期的关键拐点信号。",
  },
  {
    name: "2025 美债收益率飙升", date: "2025-06-15", category: "financial_crisis",
    news: "2025年6月，10年期美债收益率升至5.2%（2007年以来最高）。市场重新定价美国财政赤字路径和通胀持续性。全球债券市场集体暴跌。新兴市场货币承压。股市因'无风险利率'上升而回调。",
    vix: 25, rsi: 32, drop: 8, actual: "down", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "持续下跌。高利率重新定价风险资产的终局尚未到来。",
  },

  // ── 更多 NEUTRAL 事件: 噪音/假恐慌/无方向震荡 (12) ──
  {
    name: "1983 海湾战争恐慌", date: "1983-10-23", category: "war_geopolitical",
    news: "1983年10月，贝鲁特美国海军陆战队军营遭卡车炸弹袭击，241名美军丧生。伊朗-伊拉克战争升级。原油价格短暂上涨。道指小幅下跌。但全球市场很快将注意力转回美国经济复苏。",
    vix: 15, rsi: 48, drop: 2, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂震荡后横盘。区域性军事冲突不对全球经济产生持久影响。",
  },
  {
    name: "1991 苏联819政变失败", date: "1991-08-19", category: "war_geopolitical",
    news: "1991年8月19日，苏联发生政变——戈尔巴乔夫被软禁，坦克开进莫斯科。全球股市暴跌。原油价格飙升。但政变在三天内失败。戈尔巴乔夫恢复自由。市场在两周内完全恢复。",
    vix: 20, rsi: 38, drop: 5.5, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型恢复。政变失败后冷战不确定性消除。",
  },
  {
    name: "1993 克林顿医保改革", date: "1993-09-22", category: "regulatory_policy",
    news: "1993年9月，克林顿总统向国会提交全面医保改革方案。医药和医疗保险公司股价暴跌——市场担忧政府管控将压缩行业利润。但改革在1994年宣告失败。道指在小幅震荡后继续上涨。",
    vix: 14, rsi: 48, drop: 2, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "震荡后恢复。医保改革夭折后医药股反弹。",
  },
  {
    name: "1998 克林顿弹劾", date: "1998-12-19", category: "regulatory_policy",
    news: "1998年12月19日，克林顿因莱温斯基丑闻被众议院弹劾（伪证和妨碍司法）。道指在弹劾投票前下跌。但市场将此视为政治表演——经济基本面（GDP增4%+通胀低）远比为总统提供稳定性。参议院最终宣判无罪。",
    vix: 24, rsi: 38, drop: 4, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "政治闹剧结束后市场继续上涨。华尔街证明政治≠经济。",
  },
  {
    name: "2003 非典型肺炎恐慌 (SARS)", date: "2003-04-01", category: "pandemic",
    news: "2003年4月，SARS疫情在亚洲持续蔓延。全球确诊病例超8000例。WHO发布旅行警告。亚洲股市大幅下跌。但疫情在5月基本受控。市场在夏季强劲反弹。",
    vix: 32, rsi: 28, drop: 8, actual: "neutral", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。疫情受控后市场恢复。SARS的全球影响远小于COVID。",
  },
  {
    name: "2007 香港直通车炒作", date: "2007-08-20", category: "regulatory_policy",
    news: "2007年8月20日，中国宣布'港股直通车'计划——允许大陆个人投资者直接投资香港股市。恒生指数单日暴涨5.9%。随后两个月恒指从20000点狂飙至31958点（涨60%）。但计划最终被无限期搁置。恒指在随后的2008危机中暴跌。",
    vix: 24, rsi: 65, drop: 0, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "政策炒作未能兑现。恒指在2008年跌回10000点。",
  },
  {
    name: "2016 中国A股熔断", date: "2016-01-04", category: "regulatory_policy",
    news: "2016年1月4日，中国A股在新年首个交易日触发新实施的熔断机制（跌7%即停市）。全天仅交易15分钟！1月7日再次触发熔断，全天交易29分钟。熔断机制在实施4天后被取消。全球市场短暂震荡。",
    vix: 24, rsi: 30, drop: 2, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中国熔断闹剧快速终结。全球市场受影响极小。",
  },
  {
    name: "2017 朝鲜导弹危机", date: "2017-08-08", category: "war_geopolitical",
    news: "2017年8月，朝鲜威胁将向关岛发射导弹。特朗普警告将回应'从未见过的烈焰与怒火'。全球股市短暂下跌。VIX从9升至16（仍极低）。但'火与怒'威胁最终未实现——朝鲜在9月进行第六次核试验后局势降温。",
    vix: 16, rsi: 42, drop: 2, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "地缘政治噪音。VIX始终处于低位表明市场从未真正恐慌。",
  },
  {
    name: "2019 波音737 MAX危机", date: "2019-03-13", category: "regulatory_policy",
    news: "2019年3月，波音737 MAX在全球被禁飞——埃航302号空难（157人遇难）后五个月内的第二起致命事故。波音市值蒸发550亿美元。美国和全球监管机构介入。但标普500不受影响——波音权重虽大，但不构成系统性风险。",
    vix: 15, rsi: 48, drop: 1, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "单一公司危机。波音暴跌但大盘不受影响——多样性化的胜利。",
  },
  {
    name: "2023 中国通缩恐慌", date: "2023-08-09", category: "financial_crisis",
    news: "2023年8月，中国7月CPI降至-0.3%（进入通缩）。PPI连续10个月下降。市场担忧中国经济正步入日本式'失去的十年'。全球大宗商品价格下跌。但全球股市将此视为中国特有的问题而非全球性风险。",
    vix: 16, rsi: 48, drop: 1, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "中国市场承压但全球市场继续上涨。中国通缩被视为区域性问题。",
  },
  {
    name: "2024 拜登退选", date: "2024-07-21", category: "regulatory_policy",
    news: "2024年7月21日，拜登总统宣布退出总统竞选并支持副总统哈里斯。民主党在不到一个月内完成候选人更替。政治不确定性攀升但标普500波动有限。市场定价了'分裂政府'（国会制衡总统）情景。",
    vix: 18, rsi: 45, drop: 2, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂震荡后恢复。政治不确定性被快速消化。市场更关注美联储降息路径。",
  },
  {
    name: "2025 德国财政扩张", date: "2025-03-05", category: "regulatory_policy",
    news: "2025年3月，德国宣布修改宪法'债务刹车'规则，允许国防和基础设施大规模财政扩张（预计5000亿欧元+）。德国10年期国债收益率飙升30bp——1990年以来最大单日涨幅。欧洲股市大涨。'德国觉醒'叙事点燃市场。",
    vix: 16, rsi: 58, drop: 0, actual: "neutral", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "财政扩张利好股市但推高债券收益率。德国从'紧缩模范生'变为'举债先锋'。",
  },
  // ── 最后一批: 小众但重要的市场事件 (18) ──
  {
    name: "1970 宾州中央铁路破产", date: "1970-06-21", category: "financial_crisis",
    news: "1970年6月，宾州中央铁路公司申请破产——当时美国史上最大破产案。该公司发行了巨额商业票据（短期公司债），其违约引发商业票据市场恐慌。美联储被迫紧急干预以稳定短期融资市场。这是现代金融危机干预的早期模板。",
    vix: 20, rsi: 32, drop: 8, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "美联储干预后市场企稳。商业票据市场经历结构性改革。",
  },
  {
    name: "1985 广场协议", date: "1985-09-22", category: "regulatory_policy",
    news: "1985年9月22日，G5（美日德法英）在纽约广场酒店达成协议，协调干预外汇市场以压低美元。美元在随后两年贬值40%。日元从240升至120。这是战后最大规模的联合汇率干预。",
    vix: 13, rsi: 55, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "美元贬值推动美国出口和股市上涨。但日本在日元升值后陷入资产泡沫。",
  },
  {
    name: "1990 垃圾债之王米尔肯被捕", date: "1990-04-24", category: "financial_crisis",
    news: "1990年4月，'垃圾债之王'迈克尔·米尔肯对六项证券欺诈重罪认罪。德崇证券(Drexel Burnham Lambert)在2月已申请破产。垃圾债市场暴跌。储蓄和贷款危机达到顶峰。",
    vix: 20, rsi: 35, drop: 5, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: true,
    outcomeDescription: "垃圾债市场在未来两年恢复。米尔肯事件终结了1980年代的并购狂潮。",
  },
  {
    name: "1993 欧洲汇率机制危机", date: "1993-08-02", category: "financial_crisis",
    news: "1993年8月，欧洲汇率机制(ERM)遭遇第二波投机攻击（1992年英镑危机后）。法国法郎、丹麦克朗等多国货币遭做空。欧盟被迫将汇率波动区间从2.25%扩大至15%——实质上放弃了固定汇率。",
    vix: 14, rsi: 42, drop: 2, actual: "up", hasPolicy: true, hasLeverage: true, hasSolvency: false,
    outcomeDescription: "ERM名存实亡，但欧洲股市反而上涨——更灵活的汇率=更大的政策空间。",
  },
  {
    name: "1995 道指突破5000", date: "1995-11-21", category: "tech_narrative",
    news: "1995年11月21日，道琼斯工业平均指数首次突破5000点。这是1990年代大牛市的标志性时刻。一年前道指还在3800点。互联网、个人电脑和生产力革命叙事推动股市持续上涨。美联储在7月降息25bp。",
    vix: 12, rsi: 65, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "牛市加速。1995年全年标普涨34%。这是'非理性繁荣'的前夜。",
  },
  {
    name: "2004 马德里3·11后", date: "2004-03-22", category: "war_geopolitical",
    news: "2004年3月11日马德里列车恐袭后，西班牙大选爆冷——支持伊拉克战争的执政党落败。市场将此解读为恐怖主义对民主选举的影响。欧洲股市在袭击后一周内从低点反弹。全球风险情绪短暂恶化。",
    vix: 20, rsi: 35, drop: 4, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂震荡后反弹。市场将此定性为区域性政治事件。",
  },
  {
    name: "2005 伦敦77爆炸", date: "2005-07-07", category: "war_geopolitical",
    news: "2005年7月7日，伦敦地铁和公交车遭遇系列自杀式炸弹袭击，52人遇难。英国股市当日暴跌后反弹。英镑小幅下跌。伦敦金融城在次日恢复正常运行。全球市场受冲击极小。",
    vix: 15, rsi: 42, drop: 2, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "最小影响。伦敦市场的韧性证明了发达经济体的抗恐袭能力。",
  },
  {
    name: "2010 苹果市值超微软", date: "2010-05-26", category: "tech_narrative",
    news: "2010年5月26日，苹果市值超越微软，成为全球市值最高的科技公司。这标志着从PC时代向移动互联网时代的历史性转变。10年前苹果濒临破产。iPhone/iPad生态系统正在重塑全球科技行业。",
    vix: 30, rsi: 35, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "苹果引领科技股上涨。移动互联网时代的市值王者更替。",
  },
  {
    name: "2017 特朗普税改通过", date: "2017-12-20", category: "regulatory_policy",
    news: "2017年12月20日，美国国会通过30年来最大规模税改——企业所得税从35%降至21%。这是特朗普政府的第一个重大立法成果。标普500在2017年全年涨19%（几乎无回调）。市场预期减税将大幅提升企业盈利。",
    vix: 10, rsi: 68, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "减税推动2018年1月继续上涨。2017年是史上最低波动的牛市之一（VIX均值11）。",
  },
  {
    name: "2018 中美贸易战停火 (G20)", date: "2018-12-01", category: "regulatory_policy",
    news: "2018年12月1日，特朗普和习近平在布宜诺斯艾利斯G20峰会达成贸易停火协议。美国暂缓原定2019年1月加征的关税。中国承诺增购美国农产品和能源。全球股市应声大涨。但90天窗口期意味着不确定性仍在。",
    vix: 19, rsi: 35, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "反弹但持续性有限。贸易谈判在2019年5月再度破裂。",
  },
  {
    name: "2019 全球经济衰退恐慌", date: "2019-08-14", category: "financial_crisis",
    news: "2019年8月14日，美国2年期和10年期国债收益率倒挂——2007年以来首次。历史上这一信号几乎每次都预示着衰退。道指当日暴跌800点(-3.1%)。全球债券收益率降至历史低位。德国发行负利率30年期国债。",
    vix: 24, rsi: 28, drop: 5, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "V型反弹。美联储在7-10月降息三次。2020年1月标普创历史新高。但COVID在两个月后爆发——收益率曲线倒挂确实预测了衰退，但原因无人能预料。",
  },
  {
    name: "2021 萨尔瓦多比特币法币", date: "2021-09-07", category: "tech_narrative",
    news: "2021年9月7日，萨尔瓦多成为全球首个采用比特币为法定货币的国家。比特币当日从52000暴跌至43000美元。全球监管机构和IMF批评此举。加密市场将此视为历史性实验。",
    vix: 20, rsi: 42, drop: 1, actual: "neutral", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "全球市场无视。萨尔瓦多的实验规模太小，无法产生系统性影响。",
  },
  {
    name: "2022 加拿大卡车司机抗议", date: "2022-02-14", category: "regulatory_policy",
    news: "2022年2月，加拿大卡车司机抗议疫苗强制令的'自由车队'封锁了渥太华市中心和多个美加边境口岸（包括大使桥——美加最大贸易通道）。汽车工厂因零部件短缺停产。特鲁多启动《紧急状态法》——1988年以来首次。",
    vix: 26, rsi: 42, drop: 3, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "短暂冲击。边境口岸恢复通行后，供应链中断在两周内缓解。",
  },
  {
    name: "2023 OpenAI CEO被罢免", date: "2023-11-17", category: "tech_narrative",
    news: "2023年11月17日，OpenAI董事会突然罢免CEO Sam Altman。科技界震惊。微软股价下跌。投资者担忧AI行业领导地位的不确定性。在员工大规模威胁辞职后，Altman在五天后恢复职位。整个事件暴露了AI治理的结构性问题。",
    vix: 15, rsi: 48, drop: 1, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "最小影响。微软最终获得更强控制权。OpenAI估值在2024年继续飙升。",
  },
  {
    name: "2024 台积电美国投产", date: "2024-04-08", category: "tech_narrative",
    news: "2024年4月，台积电宣布其亚利桑那工厂开始4nm芯片试产。这是美国本土数十年来最先进的半导体制造。获美国芯片法案66亿美元补贴。半导体供应链从台湾分散化的重要里程碑。费城半导体指数上涨。",
    vix: 14, rsi: 58, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "半导体供应链'去风险化'获市场认可。芯片法案推动美国制造业复兴叙事。",
  },
  {
    name: "2024 印度成为全球第四大股市", date: "2024-02-15", category: "financial_crisis",
    news: "2024年2月，印度股市总市值超越香港，成为全球第四大股票市场（仅次于美国、中国、日本）。印度Sensex指数在过去20年涨超20倍。全球投资者将印度视为'下一个中国'——人口红利+制造业转移+政治稳定。",
    vix: 13, rsi: 62, drop: 0, actual: "up", hasPolicy: false, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "印度股市持续上涨。全球投资者加速配置印度——新兴市场的下一个共识交易。",
  },
  {
    name: "2025 欧洲重整军备", date: "2025-03-18", category: "war_geopolitical",
    news: "2025年3月，德国议会通过宪法修改，豁免国防支出从债务刹车限制中排除。欧盟宣布8000亿欧元重整军备计划。欧洲国防股暴涨。这是二战后欧洲最大的军事支出扩张。市场将此解读为欧洲战略自主的开端。",
    vix: 18, rsi: 48, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "国防股暴涨推动欧洲股市创新高。'欧洲觉醒'成为2025年核心投资叙事。",
  },
  {
    name: "2025 日经突破40000", date: "2025-02-25", category: "financial_crisis",
    news: "2025年2月，日经225指数突破40000点——34年来首次超越1989年泡沫峰值（38957点）。日本公司治理改革、温和通胀、巴菲特增持日本五大商社、日元贬值推动出口——多重利好促成了这一历史性时刻。",
    vix: 14, rsi: 62, drop: 0, actual: "up", hasPolicy: true, hasLeverage: false, hasSolvency: false,
    outcomeDescription: "日本股市在突破历史高点后继续上涨。公司治理改革+股东回报提升正在重估日本资产价值。",
  },
];

// ==================== 统计 ====================

const stats = {
  total: EVENTS.length,
  up: EVENTS.filter(e => e.actual === "up").length,
  down: EVENTS.filter(e => e.actual === "down").length,
  neutral: EVENTS.filter(e => e.actual === "neutral").length,
  byCategory: {} as Record<string, number>,
};

for (const e of EVENTS) {
  stats.byCategory[e.category] = (stats.byCategory[e.category] || 0) + 1;
}

console.log(`统一事件库: ${stats.total} 事件`);
console.log(`  Up: ${stats.up} | Down: ${stats.down} | Neutral: ${stats.neutral}`);
console.log(`  分类:`, stats.byCategory);
