"use client";

import React, { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { RoundData } from "@/types";
import { personas } from "@/lib/agents/personas";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
);

interface EmotionChartProps {
  rounds: RoundData[];
}

function EmotionChart({ rounds }: EmotionChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const labels = rounds.map((r) => `Round ${r.round}`);
    const datasets = personas.map((persona) => ({
      label: `${persona.emoji} ${persona.name}`,
      data: rounds.map((r) => r.agents[persona.id]?.emotion ?? 0),
      borderColor: persona.color,
      backgroundColor: `${persona.color}20`,
      fill: false,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
    }));

    datasets.push({
      label: "⚖️ 共识",
      data: rounds.map((r) => r.consensus),
      borderColor: "#ffffff",
      backgroundColor: "#ffffff20",
      fill: true,
      tension: 0.4,
      pointRadius: 6,
      pointHoverRadius: 8,
      borderWidth: 3,
    } as any);

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutQuart" },
        scales: {
          y: {
            min: -100,
            max: 100,
            grid: { color: "#333" },
            ticks: { color: "#888" },
          },
          x: {
            grid: { color: "#222" },
            ticks: { color: "#888" },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#ccc", usePointStyle: true },
          },
          tooltip: {
            backgroundColor: "#111",
            titleColor: "#fff",
            bodyColor: "#ccc",
            borderColor: "#333",
            borderWidth: 1,
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [rounds]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-300 mb-4">情绪塌陷折线图</h2>
      <div className="h-80">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default React.memo(EmotionChart);
