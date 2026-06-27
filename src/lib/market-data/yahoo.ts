/**
 * Yahoo Finance 非官方 API 数据获取模块（增强版）
 *
 * 支持多资产类别：
 * - 股指: S&P 500, Nasdaq, Russell 2000
 * - 恐慌: VIX
 * - 板块: XLF(金融), XLE(能源), XLK(科技), XLV(医疗)
 * - 利率: 2Y, 10Y Treasury
 * - 商品: Gold, Crude Oil
 * - 汇率: DXY (美元指数)
 *
 * 特点：
 * - 免费、无需 API Key
 * - 内置内存缓存（TTL 5分钟）
 * - 优雅降级：API 失败返回 null
 */

export interface YahooChartResult {
  symbol: string;
  timestamps: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

// ==================== 缓存 ====================

interface CacheEntry {
  data: YahooChartResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

function getCached(symbol: string): YahooChartResult | null {
  const entry = cache.get(symbol);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(symbol);
    return null;
  }
  return entry.data;
}

function setCache(symbol: string, data: YahooChartResult): void {
  cache.set(symbol, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ==================== 数据获取 ====================

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * 获取单个 symbol 的 OHLCV 历史数据
 */
export async function fetchYahooChart(
  symbol: string,
  range: string = "3mo",
  interval: string = "1d"
): Promise<YahooChartResult | null> {
  const cacheKey = `${symbol}:${range}:${interval}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SwarmAlpha/1.0)",
        "Accept": "application/json",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Yahoo] ${symbol} returned ${response.status}`);
      return null;
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      console.warn(`[Yahoo] ${symbol} no chart data in response`);
      return null;
    }

    const { timestamp, indicators } = result;
    const quote = indicators?.quote?.[0];
    if (!timestamp || !quote) {
      console.warn(`[Yahoo] ${symbol} missing timestamp or quote data`);
      return null;
    }

    // 过滤 null 值
    const valid: YahooChartResult = {
      symbol,
      timestamps: [],
      opens: [],
      highs: [],
      lows: [],
      closes: [],
      volumes: [],
    };

    for (let i = 0; i < timestamp.length; i++) {
      if (quote.close?.[i] != null && quote.open?.[i] != null) {
        valid.timestamps.push(timestamp[i]);
        valid.opens.push(quote.open[i] ?? quote.close[i]);
        valid.highs.push(quote.high[i] ?? quote.close[i]);
        valid.lows.push(quote.low[i] ?? quote.close[i]);
        valid.closes.push(quote.close[i]);
        valid.volumes.push(quote.volume[i] ?? 0);
      }
    }

    if (valid.closes.length < 10) {
      console.warn(`[Yahoo] ${symbol} only ${valid.closes.length} valid points`);
      return null;
    }

    setCache(cacheKey, valid);
    console.log(`[Yahoo] ${symbol}: ${valid.closes.length}pts range=${range}`);
    return valid;
  } catch (err) {
    const msg = err instanceof DOMException && err.name === "AbortError"
      ? "timeout"
      : (err as Error).message;
    console.warn(`[Yahoo] ${symbol} error: ${msg}`);
    return null;
  }
}

// ==================== 便捷函数 ====================

/** S&P 500 — 大盘基准 */
export async function getSP500Data(): Promise<YahooChartResult | null> {
  return fetchYahooChart("^GSPC", "3mo", "1d");
}

/** Nasdaq Composite — 科技权重 */
export async function getNasdaqData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("^IXIC", "3mo", "1d");
}

/** VIX — 恐慌指数 */
export async function getVIXData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("^VIX", "3mo", "1d");
}

/** 金融板块 ETF */
export async function getFinancialsData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("XLF", "3mo", "1d");
}

/** 能源板块 ETF */
export async function getEnergyData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("XLE", "3mo", "1d");
}

/** 科技板块 ETF */
export async function getTechData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("XLK", "3mo", "1d");
}

/** 医疗板块 ETF */
export async function getHealthcareData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("XLV", "3mo", "1d");
}

/** 2 年期美债收益率 */
export async function getTreasury2YData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("2YY=F", "3mo", "1d");
}

/** 10 年期美债收益率 */
export async function getTreasury10YData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("10Y=F", "3mo", "1d");
}

/** 黄金期货 */
export async function getGoldData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("GC=F", "3mo", "1d");
}

/** 原油期货 */
export async function getOilData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("CL=F", "3mo", "1d");
}

/** 美元指数 */
export async function getDXYData(): Promise<YahooChartResult | null> {
  return fetchYahooChart("DX-Y.NYB", "3mo", "1d");
}

// ==================== 批量获取 ====================

export interface MarketSnapshot {
  sp500: YahooChartResult | null;
  nasdaq: YahooChartResult | null;
  vix: YahooChartResult | null;
  financials: YahooChartResult | null;
  energy: YahooChartResult | null;
  tech: YahooChartResult | null;
  healthcare: YahooChartResult | null;
  treasury2Y: YahooChartResult | null;
  treasury10Y: YahooChartResult | null;
  gold: YahooChartResult | null;
  oil: YahooChartResult | null;
  dxy: YahooChartResult | null;
}

/**
 * 并行获取所有市场数据
 * 单个 symbol 失败不影响其他
 */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const [sp500, nasdaq, vix, financials, energy, tech, healthcare,
         treasury2Y, treasury10Y, gold, oil, dxy] = await Promise.all([
    getSP500Data(), getNasdaqData(), getVIXData(),
    getFinancialsData(), getEnergyData(), getTechData(), getHealthcareData(),
    getTreasury2YData(), getTreasury10YData(),
    getGoldData(), getOilData(), getDXYData(),
  ]);

  return {
    sp500, nasdaq, vix,
    financials, energy, tech, healthcare,
    treasury2Y, treasury10Y,
    gold, oil, dxy,
  };
}

// ==================== 历史数据 ====================

/**
 * 获取指定历史日期附近的市场数据
 */
export async function fetchHistoricalData(
  targetDate: string
): Promise<{ sp500: YahooChartResult; vix: YahooChartResult } | null> {
  const target = new Date(targetDate + "T00:00:00Z");
  const start = new Date(target);
  start.setMonth(start.getMonth() - 6);
  const end = new Date(target);
  end.setMonth(end.getMonth() + 3);

  const period1 = Math.floor(start.getTime() / 1000);
  const period2 = Math.floor(end.getTime() / 1000);

  const fetchOne = async (symbol: string): Promise<YahooChartResult | null> => {
    const cacheKey = `${symbol}:${targetDate}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SwarmAlpha/1.0)",
          "Accept": "application/json",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) return null;

      const json = await response.json();
      const result = json?.chart?.result?.[0];
      if (!result?.timestamp || !result?.indicators?.quote?.[0]) return null;

      const { timestamp, indicators: ind } = result;
      const quote = ind.quote[0];

      const valid: YahooChartResult = {
        symbol,
        timestamps: [], opens: [], highs: [], lows: [], closes: [], volumes: [],
      };

      for (let i = 0; i < timestamp.length; i++) {
        if (quote.close?.[i] != null && quote.open?.[i] != null) {
          valid.timestamps.push(timestamp[i]);
          valid.opens.push(quote.open[i] ?? quote.close[i]);
          valid.highs.push(quote.high[i] ?? quote.close[i]);
          valid.lows.push(quote.low[i] ?? quote.close[i]);
          valid.closes.push(quote.close[i]);
          valid.volumes.push(quote.volume[i] ?? 0);
        }
      }

      if (valid.closes.length < 30) return null;

      setCache(cacheKey, valid);
      return valid;
    } catch {
      return null;
    }
  };

  const [sp500, vix] = await Promise.all([fetchOne("^GSPC"), fetchOne("^VIX")]);
  if (!sp500) return null;
  return { sp500, vix: vix ?? sp500 };
}

/** 清除所有缓存 */
export function clearCache(): void {
  cache.clear();
  console.log("[Yahoo] Cache cleared");
}
