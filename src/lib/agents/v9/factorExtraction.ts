/**
 * 因子提取层 — v9.2-Hybrid 上下文感知五因子引擎
 *
 * 核心转变 (v9.1):
 *   旧: 6因子 (valuation/momentum/sentiment/liquidity/policy/structural)
 *       → 互相污染, 有效维度 ~3-4, LLM 系统性偏空
 *   新: 5正交因子 (liquidity/policy/fundamental/narrative/uncertainty)
 *       → 严格正交, 强制混合方向, 禁止偏空偏差
 *
 * v9.2-Hybrid 模板升级:
 *   - 丰富中文政策关键词 (注入流动性/平准基金/兜底/协调救助 等)
 *   - 新增恢复/解决信号检测 (反弹/V型复苏/收复跌幅)
 *   - 系统性威胁独立分级 (大萧条/多米诺/连锁倒闭)
 *   - 反偏空护栏: 强政策托底 fundamental, RSI 极端超卖强制非负
 *   - 自动全负因子修复: 危机+政策博弈自动翻正 narrative
 *
 * LLM 不再被要求判断"涨还是跌"。
 * LLM 只提取正交因子 — 剩下由 Agent 各自的框架来解释。
 */

import { FactorVector, ExtractedFactor, FactorCategory } from "./types";
import crypto from "crypto";
import { systemLogger } from "../../utils/logger";

// ==================== 因子缓存 ====================
// 避免对同一事件的重复 API 调用 (消融实验 5 变体 × 60 事件 = 300 调用 → 60 调用)

const factorCache = new Map<string, FactorVector>();

function cacheKey(news: string, marketData: MarketContext): string {
  // SHA-256 全文本哈希 — 杜绝 news.slice(0,100) 截断导致的语义盲区
  const hash = crypto.createHash("sha256").update(news, "utf8").digest("hex").slice(0, 16);
  return `${hash}|V=${marketData.vix}|R=${marketData.rsi}|D=${marketData.dropMagnitude}|R=${marketData.sectorRotation}|S=${marketData.yieldCurveSpread}`;
}

/** DEMO 模式下跳过缓存 — 确保现场演示每次实时调用 */
function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

const FACTOR_PROMPT = `你是金融市场因子提取器。你的唯一任务是从新闻中提取五个正交因子的客观评分。

禁止输出: Bullish, Bearish, Up, Down, Sentiment, 涨, 跌, 看涨, 看跌
禁止预测市场方向。

========================
因子定义
========================

Factor 1 — Liquidity (流动性):
事件对市场流动性和融资环境的影响。

评分范围: -100 ~ +100
负值: 资金收缩、融资困难、信用紧张
正值: 资金宽松、融资改善、信用扩张

========================

Factor 2 — Policy Support (政策支持):
政府、央行、监管机构可能提供的支持力度。

评分范围: -100 ~ +100
负值: 政策收紧、监管打压
正值: 降息、救助、财政刺激、流动性注入

注意: 必须独立于事件本身评估。
即使事件极度利空，也可能出现高政策支持。

========================

Factor 3 — Fundamental Impact (基本面影响):
事件对未来经济活动和企业盈利能力的影响。

评分范围: -100 ~ +100
负值: 盈利下降、经济收缩
正值: 生产率提升、需求增长、盈利改善

========================

Factor 4 — Narrative Momentum (叙事动量):
事件形成持续传播叙事的能力。

评分范围: -100 ~ +100
负值: 缺乏传播性、快速被遗忘
正值: 形成长期热点、持续媒体关注、改变市场主题

注意: 评估传播能力，而非情绪方向。

========================

Factor 5 — Uncertainty (不确定性):
未来结果的不确定程度。

评分范围: 0 ~ 100
0: 结果高度确定
100: 高度未知

注意: Uncertainty 不能有负数。

========================
Step 1 — 市场事件模式 (market_pattern)
========================

将事件分类为以下四种模式之一:

"MECHANICAL_SELLOFF" — 程序化/算法/技术性机械抛售。基本面未受损，价格将均值回归。
  例: 1987黑色星期一、2010闪电崩盘、2018 Volmageddon

"SOLVENCY_CRISIS" — 偿付能力或结构性金融危机。违约/破产/系统性风险。基本面真实受损。
  例: 2008雷曼、2001安然、2023瑞信

"EXTERNAL_SHOCK" — 外来突发事件。非金融内生。取决于政策响应。
  例: 2001 911、2020 COVID、2022俄乌战争

"NARRATIVE_DRIVEN" — 叙事/情绪驱动。无流动性和偿付问题。由故事/FOMO/恐慌推动。
  例: 2021 GameStop、2025 DeepSeek冲击、1996非理性繁荣

========================
Step 2 — 五个正交因子
========================

Factor 1 — Liquidity (流动性): -100~+100。负=收紧, 正=宽松。
Factor 2 — Policy Support (政策支持): -100~+100。负=收紧, 正=降息/救助。
Factor 3 — Fundamental Impact (基本面): -100~+100。负=恶化, 正=改善。
  ⚠️ 如果 market_pattern 是 MECHANICAL_SELLOFF: fundamental 应接近0（基本面未受损）
  ⚠️ 如果 market_pattern 是 SOLVENCY_CRISIS: fundamental 可以大幅为负
Factor 4 — Narrative Momentum (叙事动量): -100~+100。负=无传播, 正=持续热点。
Factor 5 — Uncertainty (不确定性): 0~100。不能为负。

========================
输出格式
========================

{
  "market_pattern": "MECHANICAL_SELLOFF",
  "liquidity": -90,
  "policy": 80,
  "fundamental": -20,
  "narrative": 70,
  "uncertainty": 90,
  "reasoning": {
      "pattern": "程序化交易引发连锁抛售，基本面未受损",
      "liquidity": "...",
      "policy": "...",
      "fundamental": "...",
      "narrative": "...",
      "uncertainty": "..."
  }
}

返回严格 JSON (无 markdown 包裹):`;

export interface MarketContext {
  vix: number;
  rsi: number;
  dropMagnitude: number;
  volatility?: number;
  volumeSpike?: number;
  sectorRotation?: number;
  yieldCurveSpread?: number;
  goldMomentum?: number;
  oilMomentum?: number;
}

export async function extractFactors(
  news: string,
  marketData: MarketContext,
  apiKey?: string
): Promise<FactorVector> {
  // 优先: 模板因子提取 (确定性, 零成本)
  if (!apiKey) {
    return templateFactorExtraction(news, marketData);
  }

  // 缓存命中 (DEMO 模式跳过)
  const key = cacheKey(news, marketData);
  if (!isDemoMode()) {
    const cached = factorCache.get(key);
    if (cached) {
      systemLogger.debug(`[V9] 💾 缓存命中: ${key}`);
      return cached;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: FACTOR_PROMPT },
          { role: "user", content: `新闻: ${news}
市场快照: VIX=${marketData.vix} RSI=${marketData.rsi} 近期跌幅=${marketData.dropMagnitude}%${marketData.volatility != null ? ` 波动率=${(marketData.volatility * 100).toFixed(1)}%` : ""}${marketData.sectorRotation != null ? ` 板块轮动=${marketData.sectorRotation > 0 ? "Value走强" : "Growth走强"}(${marketData.sectorRotation.toFixed(1)})` : ""}${marketData.yieldCurveSpread != null ? ` 2Y-10Y利差=${marketData.yieldCurveSpread}bp` : ""}${marketData.goldMomentum != null ? ` 黄金月度=${marketData.goldMomentum > 0 ? "+" : ""}${marketData.goldMomentum}%` : ""}${marketData.oilMomentum != null ? ` 原油月度=${marketData.oilMomentum > 0 ? "+" : ""}${marketData.oilMomentum}%` : ""}${marketData.volumeSpike != null ? ` 成交量异常=${marketData.volumeSpike > 1.5 ? "显著放量" : "正常"}(${marketData.volumeSpike.toFixed(1)}x)` : ""}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) {
      const errText = await response.text().catch(() => "unreadable");
      throw new Error(`API ${response.status}: ${errText.slice(0, 300)}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response");

    const parsed = JSON.parse(content);

    // Validate and build factors
    const factors: ExtractedFactor[] = [];
    const reasoning = parsed.reasoning || {};

    // Factor 1: Liquidity (-100..+100)
    const liquidityVal = Number(parsed.liquidity);
    if (!isNaN(liquidityVal)) {
      factors.push({
        category: "liquidity",
        value: Math.max(-100, Math.min(100, liquidityVal)),
        confidence: 80,
        evidence: String(reasoning.liquidity || "").slice(0, 200),
      });
    }

    // Factor 2: Policy (-100..+100)
    const policyVal = Number(parsed.policy);
    if (!isNaN(policyVal)) {
      factors.push({
        category: "policy",
        value: Math.max(-100, Math.min(100, policyVal)),
        confidence: 80,
        evidence: String(reasoning.policy || "").slice(0, 200),
      });
    }

    // Factor 3: Fundamental (-100..+100)
    const fundamentalVal = Number(parsed.fundamental);
    if (!isNaN(fundamentalVal)) {
      factors.push({
        category: "fundamental",
        value: Math.max(-100, Math.min(100, fundamentalVal)),
        confidence: 80,
        evidence: String(reasoning.fundamental || "").slice(0, 200),
      });
    }

    // Factor 4: Narrative (-100..+100)
    const narrativeVal = Number(parsed.narrative);
    if (!isNaN(narrativeVal)) {
      factors.push({
        category: "narrative",
        value: Math.max(-100, Math.min(100, narrativeVal)),
        confidence: 75,
        evidence: String(reasoning.narrative || "").slice(0, 200),
      });
    }

    // Factor 5: Uncertainty (0..+100, CANNOT be negative)
    const uncertaintyVal = Number(parsed.uncertainty);
    if (!isNaN(uncertaintyVal)) {
      factors.push({
        category: "uncertainty",
        value: Math.max(0, Math.min(100, uncertaintyVal)), // clamp to 0-100
        confidence: 80,
        evidence: String(reasoning.uncertainty || "").slice(0, 200),
      });
    }

    // Fill any missing factors
    const requiredCategories: FactorCategory[] = ["liquidity", "policy", "fundamental", "narrative", "uncertainty"];
    for (const cat of requiredCategories) {
      if (!factors.find(f => f.category === cat)) {
        factors.push({
          category: cat,
          value: cat === "uncertainty" ? 50 : 0,
          confidence: 30,
          evidence: "LLM未返回此因子",
        });
      }
    }

    // 🆕 v9.6: 市场事件模式 (用于均值回归感知层)
    const marketPattern = String(parsed.market_pattern || "").trim();
    const validPatterns = ["MECHANICAL_SELLOFF", "SOLVENCY_CRISIS", "EXTERNAL_SHOCK", "NARRATIVE_DRIVEN"];
    const pattern = validPatterns.includes(marketPattern) ? marketPattern : undefined;

    const result: FactorVector = {
      factors,
      metadata: {
        newsSummary: parsed.newsSummary || news.slice(0, 100),
        detectedAnomalies: parsed.detectedAnomalies || [],
        timestamp: new Date().toISOString(),
        // 🆕 v9.6: LLM 识别的事件模式
        marketPattern: pattern,
      },
    };
    if (!isDemoMode()) {
      factorCache.set(key, result);
    }
    return result;
  } catch (e: any) {
    systemLogger.error(`[V9] LLM因子提取失败: ${e.message || e} — 回退到模板`);
    return templateFactorExtraction(news, marketData);
  }
}

/**
 * 模板因子提取 — v9.2-Hybrid 上下文感知版
 *
 * 设计目标:
 *   1. 消除 v9.1 模板的系统性偏空偏差
 *      - v9.1 对所有危机事件输出几乎相同的偏空因子 (liquidity=-70, fundamental=-50)
 *      - 无法区分 "1987黑色星期一 (实际涨)" 和 "2008雷曼 (实际跌)"
 *   2. 引入多维度上下文感知
 *      - 政策响应强度 → 减轻流动性冲击评分
 *      - RSI 极端超卖 → 释放基本面均值回归信号
 *      - 恢复/解决关键词 → 提升叙事动量
 *   3. 反偏空护栏
 *      - 强政策 + 危机 → fundamental 不能低于 -40
 *      - RSI < 10 → fundamental 强制非负
 *      - 全负方向因子 → 触发异常警告
 */
export function templateFactorExtraction(
  news: string,
  marketData: MarketContext
): FactorVector {
  const { vix, rsi, dropMagnitude: drop, sectorRotation, goldMomentum, oilMomentum } = marketData;

  // ── Phase 1: 丰富关键词检测 ──

  // 危机信号
  const crisisNews = /崩盘|暴跌|危机|熔断|恐慌|crash|collapse|panic|金融危机|股灾/i.test(news);

  // 强政策响应 (v9.2 新增 — 覆盖中文政策用语)
  const strongPolicyNews = /注入流动性|提供.*信贷|紧急.*干预|协调.*救助|无限量.*QE|兜底|政府.*担保|注入资金|救市|平准基金|whatever it takes|backstop|unlimited.*QE|liquidity.*injection|大规模.*刺激|万亿.*刺激|紧急.*降息|紧急.*注资|所有必要.*信贷/i.test(news);

  // 普通政策信号
  const policyNews = strongPolicyNews || /救助|QE|量化宽松|降息|刺激|bailout|stimulus|rate cut|emergency|宽松|财政.*支持|注入|央行.*声明|提供.*流动|干预/i.test(news);

  // 政策收紧
  const tighteningNews = /加息|紧缩|收紧|tightening|hawkish|缩减.*购债|taper/i.test(news);

  // 恢复/解决信号 (v9.2 新增)
  const recoveryNews = /反弹|V型.*复苏|快速.*恢复|收复.*跌幅|创.*新高|触底.*回升|见底|牛市|反弹.*超|强劲.*复苏|强势.*反弹|rebound|recovery|V.shaped|new.*high|bottom.*out|trough|bounce.*back|rally/i.test(news);

  // 杠杆问题
  const leverageNews = /杠杆|爆仓|强平|margin call|清算|liquidation/i.test(news);

  // 偿付/违约问题
  const solvencyNews = /违约|破产|倒闭|衰退|default|bankrupt|contagion|连锁.*反应|系统性.*风险/i.test(news);

  // 系统性威胁 (v9.2 新增 — 比普通危机更严重)
  const systemicThreat = /系统性|大萧条|全球性.*危机|depression|systemic|contagion.*global|多米诺|连锁.*倒闭/i.test(news);

  // 历史性事件
  const majorEvent = /历史|首次|史无前例|前所未有|震惊|unprecedented|historic|landmark|载入史册/i.test(news);

  // 低信息量事件
  const boringEvent = /例行|常规|符合预期|routine|as expected|小幅|微调/i.test(news);

  // ── Phase 2: 上下文感知因子评分 ──

  // ═══════════════════════════════════════════
  // Factor 1: Liquidity — 融资环境
  //
  // v9.2 改进: 不再对"危机+政策"一刀切给 -20。
  // 按政策强度分级: 强政策 → 流动性冲击被有效对冲 → 轻度负面至中性。
  // ═══════════════════════════════════════════
  let liquidity: number;
  if (strongPolicyNews && crisisNews) {
    // 强力政策干预正在修复流动性 → 轻度负面 (冲击已被对冲)
    liquidity = -15;
  } else if (policyNews && crisisNews) {
    // 有政策响应但力度一般 → 中度负面
    liquidity = -30;
  } else if (strongPolicyNews) {
    // 纯政策宽松 (非危机背景) → 明显正面
    liquidity = 65;
  } else if (policyNews) {
    liquidity = 50;
  } else if (crisisNews && systemicThreat) {
    // 系统性危机 + 无政策 → 极度收紧
    liquidity = -85;
  } else if (crisisNews) {
    // 普通危机无政策 → 显著收紧
    liquidity = -55;
  } else if (tighteningNews) {
    liquidity = -45;
  } else if (recoveryNews) {
    // 恢复中 → 流动性正常化
    liquidity = 35;
  } else {
    liquidity = 0;
  }

  // ═══════════════════════════════════════════
  // Factor 2: Policy — 政策力度
  //
  // v9.2 改进: 强政策关键词单独提级, 区分"口头声明"和"真金白银"。
  // 系统性威胁事件中政策预期更高 (大到不能倒逻辑)。
  // ═══════════════════════════════════════════
  let policy: number;
  if (strongPolicyNews) {
    // 真金白银的干预 (注入流动性/平准基金/无限QE)
    policy = 85;
  } else if (policyNews) {
    policy = 65;
  } else if (crisisNews && systemicThreat) {
    // 系统性危机 → 市场预期必有政策响应
    policy = 45;
  } else if (crisisNews && solvencyNews) {
    // 偿付危机 → 触发救助预期
    policy = 30;
  } else if (crisisNews) {
    // 普通危机 → 政策预期温和
    policy = 15;
  } else if (tighteningNews) {
    policy = -65;
  } else if (recoveryNews) {
    // 恢复中 → 政策刺激正在退坡
    policy = -5;
  } else {
    policy = 0;
  }

  // ═══════════════════════════════════════════
  // Factor 3: Fundamental — 实体经济影响
  //
  // v9.2 改进:
  //   - RSI 极端超卖 (统计上均值回归) → 释放正向信号
  //   - 强政策 + 危机 → fundamental 封底 (政策托底经济)
  //   - 恢复信号 → 直接正向
  //   - 区分系统性威胁 vs 普通危机
  // ═══════════════════════════════════════════
  let fundamental: number;

  // 恢复/解决信号 — 最强正向信号
  if (recoveryNews) {
    fundamental = 40;
  }
  // RSI 极端超卖: 统计上强烈均值回归 → 正向
  else if (rsi < 10) {
    fundamental = 35;
  }
  else if (rsi < 20) {
    fundamental = 15;
  }
  // 偿付/违约 → 严重经济冲击
  else if (solvencyNews && systemicThreat) {
    fundamental = -75;
  }
  else if (solvencyNews) {
    fundamental = -60;
  }
  // 系统性威胁
  else if (systemicThreat) {
    fundamental = -55;
  }
  // 杠杆问题
  else if (leverageNews) {
    fundamental = -30;
  }
  // 普通危机
  else if (crisisNews) {
    fundamental = -40;
  }
  // 非危机: 按跌幅/RSI 判断
  else if (rsi < 30) {
    fundamental = 10;
  }
  else if (drop > 10) {
    fundamental = -25;
  }
  else if (drop > 5) {
    fundamental = -10;
  }
  else {
    fundamental = 0;
  }

  // ── 反偏空护栏: 强政策托底 ──
  // 如果政策力度很强 (>70) 且市场处于危机中,
  // fundamental 不能低于 -40 (政策正在托底经济)
  if (strongPolicyNews && crisisNews && fundamental < -35) {
    fundamental = -35;
  }

  // ═══════════════════════════════════════════
  // Factor 4: Narrative — 传播持久性
  //
  // v9.2 改进:
  //   - 恢复叙事 = 高传播性 (V型复苏故事)
  //   - 史诗政策对决 → 极高传播性
  //   - 系统性威胁 + 无政策 → 恐慌叙事 (依然高传播)
  // ═══════════════════════════════════════════
  let narrative: number;
  if (majorEvent && recoveryNews) {
    // 历史性 V 型复苏 → 最强叙事 (如 1987, 2020 COVID)
    narrative = 90;
  } else if (majorEvent && strongPolicyNews) {
    // 历史性事件 + 史诗政策对决
    narrative = 85;
  } else if (majorEvent) {
    narrative = 75;
  } else if (crisisNews && strongPolicyNews) {
    // 危机 + 强政策博弈
    narrative = 70;
  } else if (recoveryNews) {
    // 恢复叙事
    narrative = 65;
  } else if (crisisNews && policyNews) {
    narrative = 60;
  } else if (systemicThreat) {
    // 系统性威胁 → 持续关注
    narrative = 55;
  } else if (crisisNews) {
    narrative = 45;
  } else if (boringEvent) {
    narrative = -50;
  } else if (policyNews) {
    narrative = 40;
  } else {
    narrative = -10;
  }

  // ═══════════════════════════════════════════
  // Factor 5: Uncertainty — 0到100
  //
  // v9.2 改进:
  //   - 恢复信号降低不确定性
  //   - 强政策略降低不确定性 (方向更明确)
  //   - 系统性威胁大幅增加不确定性
  // ═══════════════════════════════════════════
  let uncertainty: number;
  if (vix > 60) {
    uncertainty = 90;
  } else if (vix > 40) {
    uncertainty = 80;
  } else if (vix > 35) {
    uncertainty = 65;
  } else if (vix > 25) {
    uncertainty = 45;
  } else if (vix > 15) {
    uncertainty = 25;
  } else {
    uncertainty = 10;
  }

  // 上下文调整
  if (systemicThreat && !policyNews) uncertainty = Math.min(100, uncertainty + 20);

  // ── 富化市场数据调整（v9.8）──
  // 板块轮动信号：金融 vs 科技相对强弱
  if (sectorRotation && sectorRotation > 3) {
    // Value rotation → 资金从成长股撤出 → 流动性收紧信号
    liquidity = Math.max(-100, Math.min(100, liquidity - 10));
  } else if (sectorRotation && sectorRotation < -3) {
    // Growth rotation → 风险偏好 → 叙事增强
    narrative = Math.max(-100, Math.min(100, narrative + 10));
  }
  // 商品信号：Gold 上涨 = 避险情绪
  if (goldMomentum && goldMomentum > 3) {
    uncertainty = Math.min(100, uncertainty + 10);
  }
  // 商品信号：Oil 暴涨/暴跌 = 供给冲击
  if (oilMomentum && Math.abs(oilMomentum) > 8) {
    uncertainty = Math.min(100, uncertainty + 8);
    fundamental = Math.max(-100, Math.min(100, fundamental + (oilMomentum > 0 ? -10 : 5)));
  }
  if (solvencyNews) uncertainty = Math.min(100, uncertainty + 10);
  if (majorEvent) uncertainty = Math.min(100, uncertainty + 10);
  if (recoveryNews) uncertainty = Math.max(10, uncertainty - 15);   // 恢复降低不确定
  if (strongPolicyNews) uncertainty = Math.max(5, uncertainty - 10); // 强政策明确方向

  // ── Phase 3: 组装因子 ──

  const factors: ExtractedFactor[] = [
    {
      category: "liquidity",
      value: liquidity,
      confidence: 75,
      evidence: strongPolicyNews ? "强政策对冲, 融资环境收紧但可控"
        : policyNews && crisisNews ? "政策响应中, 信用仍紧"
        : `融资环境: ${liquidity > 0 ? "宽松" : liquidity < -50 ? "严重收紧" : "偏紧"}`
    },
    {
      category: "policy",
      value: policy,
      confidence: strongPolicyNews ? 85 : policyNews ? 75 : 50,
      evidence: strongPolicyNews ? "强力政策干预 (注入流动性/救市)"
        : policyNews ? "政策响应明确"
        : tighteningNews ? "政策收紧"
        : crisisNews ? "政策预期温和"
        : "无明显政策信号"
    },
    {
      category: "fundamental",
      value: fundamental,
      confidence: 75,
      evidence: recoveryNews ? `恢复信号 + RSI=${rsi}`
        : rsi < 10 ? `RSI=${rsi} 极端超卖, 均值回归信号`
        : rsi < 20 ? `RSI=${rsi} 深度超卖`
        : `RSI=${rsi}, 跌幅=${drop}%${solvencyNews ? ", 偿付风险" : ""}${systemicThreat ? ", 系统性威胁" : ""}`
    },
    {
      category: "narrative",
      value: narrative,
      confidence: 70,
      evidence: recoveryNews ? "恢复/复苏叙事, 高传播性"
        : majorEvent ? "历史性事件, 长期叙事"
        : narrative > 50 ? "高传播性事件"
        : narrative < -30 ? "低传播性事件"
        : "中等传播性"
    },
    {
      category: "uncertainty",
      value: uncertainty,
      confidence: 80,
      evidence: `VIX=${vix}${crisisNews ? ", 危机" : ""}${recoveryNews ? ", 恢复中" : ""}${strongPolicyNews ? ", 强政策" : ""}${systemicThreat ? ", 系统性威胁" : ""}`
    },
  ];

  // ── Phase 4: 正交性校验 + 反偏空护栏 ──

  const directionalFactors = factors.filter(f => f.category !== "uncertainty");
  const allPositive = directionalFactors.every(f => f.value > 0);
  const allNegative = directionalFactors.every(f => f.value < 0);
  const detectedAnomalies: string[] = [];

  if (allPositive) {
    detectedAnomalies.push("⚠️ 所有方向因子均为正 — 可能缺乏反向维度");
  }
  if (allNegative) {
    detectedAnomalies.push("⚠️ 所有方向因子均为负 — 系统性偏空偏差, 检查政策/恢复关键词覆盖");
  }

  // 自动修复: 如果全负且存在危机+政策, 将 narrative 翻正
  // (危机+政策博弈本身就是强叙事, 不应全盘看空)
  if (allNegative && crisisNews && policyNews) {
    const narrFactor = factors.find(f => f.category === "narrative")!;
    if (narrFactor.value < 0) {
      narrFactor.value = Math.abs(narrFactor.value);
      narrFactor.evidence = "修正: 危机+政策博弈产生正向叙事动量";
      detectedAnomalies.push("🔧 自动修正: narrative 翻正 (危机+政策博弈)");
    }
  }

  return {
    factors,
    metadata: {
      newsSummary: news.slice(0, 100),
      detectedAnomalies,
      timestamp: new Date().toISOString(),
    },
  };
}
