/**
 * 从真实市场数据计算校准参数（增强版）
 *
 * 数据源：Yahoo Finance（主）+ 降级推断（备）
 *
 * 计算指标：
 * - VIX: 直接读取
 * - RSI(14): S&P 500 收盘价
 * - dropFromPeak: 近期高点跌幅
 * - volatility: 5 日波动率
 * - 板块轮动信号: XLF vs XLK 相对强弱
 * - 利率环境: 2Y/10Y 利差
 * - 商品信号: Gold/Oil 近期趋势
 *
 * API 失败时优雅降级为 inferMarketParams()
 */

import { calculateRSI } from "@/lib/indicators/technical";
import {
  fetchMarketSnapshot,
  type MarketSnapshot,
  type YahooChartResult,
} from "./yahoo";

export interface RealMarketParams {
  vix: number;
  rsi: number;
  dropMagnitude: number;
  volatility: number;
  volumeSpike: number;
  hasPolicyResponse: boolean;
  hasCentralBankAction: boolean;
  knownVulnerabilities: string[];
  /** 板块轮动：金融 vs 科技相对强弱 (>0 = value rotation, <0 = growth) */
  sectorRotation: number;
  /** 2Y-10Y 利差（bp） */
  yieldCurveSpread: number;
  /** Gold 近期趋势 (MoM %) */
  goldMomentum: number;
  /** Oil 近期趋势 (MoM %) */
  oilMomentum: number;
  /** 数据来源 */
  dataSource: "YAHOO_FINANCE" | "INFERRED";
}

// ==================== 技术指标计算 ====================

function calcDropFromPeak(closes: number[]): number {
  if (closes.length < 5) return 0;
  const recent = closes.slice(-60);
  const peak = Math.max(...recent);
  const current = closes[closes.length - 1];
  if (peak <= 0) return 0;
  return ((peak - current) / peak) * 100;
}

function calcRecentVolatility(closes: number[], days: number = 5): number {
  if (closes.length < days + 1) return 0.015;
  const recent = closes.slice(-days - 1);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

function calcVolumeSpike(volumes: number[]): number {
  if (volumes.length < 21) return 1.0;
  const recent = volumes.slice(-21);
  const latest = recent[recent.length - 1];
  const avg20 = recent.slice(0, 20).reduce((a, b) => a + (b || 0), 0) / 20;
  if (avg20 <= 0) return 1.0;
  return latest / avg20;
}

/** 计算两个 symbol 的相对强弱（近期收益差） */
function calcSectorRotation(
  a: YahooChartResult | null,
  b: YahooChartResult | null
): number {
  if (!a || !b || a.closes.length < 22 || b.closes.length < 22) return 0;
  // 比较近一个月收益
  const aReturn = (a.closes[a.closes.length - 1] / a.closes[a.closes.length - 22] - 1) * 100;
  const bReturn = (b.closes[b.closes.length - 1] / b.closes[b.closes.length - 22] - 1) * 100;
  return Math.round((aReturn - bReturn) * 10) / 10;
}

/** 计算利差 (10Y - 2Y) */
function calcYieldSpread(
  t10y: YahooChartResult | null,
  t2y: YahooChartResult | null
): number {
  if (!t10y || !t2y || !t10y.closes.length || !t2y.closes.length) return -0.5;
  const t10 = t10y.closes[t10y.closes.length - 1];
  const t2 = t2y.closes[t2y.closes.length - 1];
  return Math.round((t10 - t2) * 1000) / 10; // 转换为 bp，保留 1 位小数
}

/** 计算月度动量 */
function calcMomentum(data: YahooChartResult | null): number {
  if (!data || data.closes.length < 22) return 0;
  const current = data.closes[data.closes.length - 1];
  const monthAgo = data.closes[data.closes.length - 22];
  return Number(((current / monthAgo - 1) * 100).toFixed(1));
}

// ==================== 政策/脆弱性推断 ====================

function inferPolicyAndVulnerability(news: string): {
  hasPolicyResponse: boolean;
  hasCentralBankAction: boolean;
  knownVulnerabilities: string[];
} {
  const text = news.toLowerCase();

  const hasPolicyResponse = !!text.match(
    /注入|购债|QE|量化宽松|救助|bailout|纾困|降息|宽松|刺激|stimulus|紧急|立即|emergency|rate cut|fiscal|财政/
  );
  const hasCentralBankAction = !!text.match(
    /央行|美联储|fed\b|ECB|BOJ|英格兰银行|降息|利率|购债|QE|central bank|PBoC|PBOC/i
  );

  const knownVulnerabilities: string[] = [];
  if (text.match(/杠杆|leverage|爆仓|强平|margin call/)) knownVulnerabilities.push("高杠杆");
  if (text.match(/违约|破产|倒闭|default|bankruptcy/)) knownVulnerabilities.push("违约风险");
  if (text.match(/流动性|liquidity|保证金|credit crunch/)) knownVulnerabilities.push("流动性紧张");
  if (text.match(/系统性|systemic|传染|连锁|contagion/)) knownVulnerabilities.push("系统性风险");
  if (text.match(/通胀|inflation|CPI|PPI|物价/)) knownVulnerabilities.push("通胀压力");
  if (text.match(/衰退|recession|负增长|contraction/)) knownVulnerabilities.push("衰退风险");

  return { hasPolicyResponse, hasCentralBankAction, knownVulnerabilities };
}

// ==================== 主入口 ====================

/**
 * 从真实市场数据计算校准参数
 *
 * 并行获取 12 个 symbol，计算技术指标。
 * 单个 symbol 失败不影响其他——缺失值用默认/推断值填充。
 *
 * @param news 新闻文本（用于政策/脆弱性推断）
 * @returns 市场参数 + 数据来源标记；全部 API 失败返回 null
 */
export async function fetchRealMarketParams(
  news: string
): Promise<RealMarketParams | null> {
  const snap = await fetchMarketSnapshot();

  // 至少需要 S&P 500 数据
  if (!snap.sp500 || snap.sp500.closes.length < 15) {
    console.warn("[MarketData] S&P 500 unavailable → falling back to inference");
    return null;
  }

  // ── 核心指标 ──

  const rsi = calculateRSI(snap.sp500.closes, 14).value;
  const dropMagnitude = calcDropFromPeak(snap.sp500.closes);
  const volatility = calcRecentVolatility(snap.sp500.closes, 5);
  const volumeSpike = calcVolumeSpike(snap.sp500.volumes);

  // ── VIX ──
  let vix = 20;
  if (snap.vix && snap.vix.closes.length > 0) {
    const last = snap.vix.closes[snap.vix.closes.length - 1];
    if (last > 5 && last < 100) vix = Math.round(last * 10) / 10;
  } else {
    vix = Math.round(volatility * Math.sqrt(252) * 100);
  }

  // ── 板块轮动 ──
  const sectorRotation = calcSectorRotation(snap.financials, snap.tech);

  // ── 利率 ──
  const yieldCurveSpread = calcYieldSpread(snap.treasury10Y, snap.treasury2Y);

  // ── 商品 ──
  const goldMomentum = calcMomentum(snap.gold);
  const oilMomentum = calcMomentum(snap.oil);

  // ── 政策/脆弱性（仍从新闻推断）──
  const { hasPolicyResponse, hasCentralBankAction, knownVulnerabilities } =
    inferPolicyAndVulnerability(news);

  // ── 汇总日志 ──
  const available = [
    snap.sp500 && "SPX", snap.nasdaq && "NDX", snap.vix && "VIX",
    snap.financials && "XLF", snap.energy && "XLE", snap.tech && "XLK",
    snap.treasury2Y && "2Y", snap.treasury10Y && "10Y",
    snap.gold && "Gold", snap.oil && "Oil", snap.dxy && "DXY",
  ].filter(Boolean).join(" ");

  console.log(
    `[MarketData] VIX=${vix} RSI=${rsi} drop=${dropMagnitude.toFixed(1)}% ` +
    `vol=${(volatility * 100).toFixed(2)}% rotation=${sectorRotation > 0 ? "Value" : "Growth"} ` +
    `spread=${yieldCurveSpread}bp gold=${goldMomentum > 0 ? "+" : ""}${goldMomentum}% ` +
    `oil=${oilMomentum > 0 ? "+" : ""}${oilMomentum}% | ${available}`
  );

  return {
    vix,
    rsi,
    dropMagnitude: Math.round(dropMagnitude * 10) / 10,
    volatility,
    volumeSpike: Math.round(volumeSpike * 100) / 100,
    hasPolicyResponse,
    hasCentralBankAction,
    knownVulnerabilities,
    sectorRotation,
    yieldCurveSpread,
    goldMomentum,
    oilMomentum,
    dataSource: "YAHOO_FINANCE",
  };
}
