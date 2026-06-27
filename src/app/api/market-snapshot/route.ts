import { NextResponse } from "next/server";
import { fetchMarketSnapshot } from "@/lib/market-data/yahoo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await fetchMarketSnapshot();

    // 计算派生指标
    const spxPrice = snap.sp500?.closes.slice(-1)[0];
    const spxChange = snap.sp500
      ? (((snap.sp500.closes.slice(-1)[0] ?? 0) / (snap.sp500.closes.slice(-22)[0] ?? 1)) - 1) * 100
      : null;
    const vix = snap.vix?.closes.slice(-1)[0];
    const t10y = snap.treasury10Y?.closes.slice(-1)[0];
    const t2y = snap.treasury2Y?.closes.slice(-1)[0];
    const spread = t10y != null && t2y != null ? Math.round((t10y - t2y) * 1000) / 10 : null;
    const gold = snap.gold?.closes.slice(-1)[0];
    const oil = snap.oil?.closes.slice(-1)[0];

    // 统计哪些数据源可用
    const available = [
      snap.sp500 && "SPX", snap.nasdaq && "NDX", snap.vix && "VIX",
      snap.financials && "XLF", snap.energy && "XLE", snap.tech && "XLK",
      snap.treasury2Y && "2Y", snap.treasury10Y && "10Y",
      snap.gold && "Gold", snap.oil && "Oil", snap.dxy && "DXY",
    ].filter(Boolean);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        spx: spxPrice ? { price: Math.round(spxPrice), changePct: spxChange?.toFixed(1) } : null,
        vix: vix ? Math.round(vix * 10) / 10 : null,
        treasury: {
          t2y: t2y != null ? t2y.toFixed(2) : null,
          t10y: t10y != null ? t10y.toFixed(2) : null,
          spread2s10s: spread,
        },
        gold: gold ? Math.round(gold) : null,
        oil: oil ? Math.round(oil * 100) / 100 : null,
      },
      availableSources: available,
      allFailed: available.length === 0,
    });
  } catch {
    return NextResponse.json({
      success: false,
      allFailed: true,
      timestamp: new Date().toISOString(),
      data: null,
      availableSources: [],
    });
  }
}
