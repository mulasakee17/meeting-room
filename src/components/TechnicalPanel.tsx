/**
 * 技术分析面板组件
 * 
 * 显示技术指标分析结果和建议
 */

"use client";

import React from 'react';

interface TechnicalSignal {
  indicator: string;
  signal: 'buy' | 'sell' | 'neutral';
  strength: number;
  description: string;
}

interface TechnicalAnalysis {
  summary: string;
  signals: TechnicalSignal[];
  bullishSignals: number;
  bearishSignals: number;
  overallBias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  warnings: string[];
}

interface TechnicalPanelProps {
  analysis: TechnicalAnalysis | null;
}

export default function TechnicalPanel({ analysis }: TechnicalPanelProps) {
  if (!analysis) {
    return null;
  }

  const getBiasColor = (bias: string) => {
    switch (bias) {
      case 'bullish':
        return 'text-emerald-400';
      case 'bearish':
        return 'text-red-400';
      default:
        return 'text-zinc-400';
    }
  };

  const getBiasBgColor = (bias: string) => {
    switch (bias) {
      case 'bullish':
        return 'bg-emerald-500/20 border-emerald-500/30';
      case 'bearish':
        return 'bg-red-500/20 border-red-500/30';
      default:
        return 'bg-zinc-500/20 border-zinc-500/30';
    }
  };

  const getBiasEmoji = (bias: string) => {
    switch (bias) {
      case 'bullish':
        return '🐂';
      case 'bearish':
        return '🐻';
      default:
        return '➡️';
    }
  };

  const getSignalEmoji = (signal: string) => {
    switch (signal) {
      case 'buy':
        return '✅';
      case 'sell':
        return '❌';
      default:
        return '➡️';
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'buy':
        return 'text-emerald-400';
      case 'sell':
        return 'text-red-400';
      default:
        return 'text-zinc-400';
    }
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6 space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">📊</span>
        <h3 className="text-lg font-semibold text-zinc-100">技术面分析</h3>
      </div>

      {/* 综合判断 */}
      <div className={`p-4 rounded-lg border ${getBiasBgColor(analysis.overallBias)}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{getBiasEmoji(analysis.overallBias)}</span>
            <div>
              <div className={`text-xl font-bold ${getBiasColor(analysis.overallBias)}`}>
                {analysis.overallBias === 'bullish' ? '看多' : analysis.overallBias === 'bearish' ? '看空' : '中性'}
              </div>
              <div className="text-sm text-zinc-400">
                置信度: {(analysis.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          
          {/* 信号统计 */}
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{analysis.bullishSignals}</div>
              <div className="text-xs text-zinc-500">买入信号</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{analysis.bearishSignals}</div>
              <div className="text-xs text-zinc-500">卖出信号</div>
            </div>
          </div>
        </div>
      </div>

      {/* 技术信号列表 */}
      {analysis.signals.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-300 mb-3">关键信号</h4>
          <div className="space-y-2">
            {analysis.signals
              .filter(s => s.strength >= 0.6)
              .slice(0, 5)
              .map((signal, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg"
                >
                  <span className="text-lg">{getSignalEmoji(signal.signal)}</span>
                  <div className="flex-1">
                    <div className={`font-medium ${getSignalColor(signal.signal)}`}>
                      {signal.indicator}
                    </div>
                    <div className="text-sm text-zinc-400 mt-1">
                      {signal.description}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            signal.signal === 'buy'
                              ? 'bg-emerald-500'
                              : signal.signal === 'sell'
                              ? 'bg-red-500'
                              : 'bg-zinc-500'
                          }`}
                          style={{ width: `${signal.strength * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500">
                        {(signal.strength * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 风险提示 */}
      {analysis.warnings.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-300 mb-3">风险提示</h4>
          <div className="space-y-2">
            {analysis.warnings.map((warning, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
              >
                <span className="text-amber-400">⚠️</span>
                <span className="text-sm text-amber-200">{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 详细信息 */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          <span className="text-zinc-500 group-open:rotate-90 transition-transform">▶</span>
          完整分析报告
        </summary>
        <div className="mt-3 p-4 bg-zinc-800/30 rounded-lg">
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
            {analysis.summary}
          </pre>
        </div>
      </details>
    </div>
  );
}
