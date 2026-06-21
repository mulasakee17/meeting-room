"use client";

import React, { useEffect, useRef } from "react";
import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { RoundData } from "@/types";
import { personas } from "@/lib/agents/personas";

Chart.register(
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface RadarChartProps {
  rounds: RoundData[];
  selectedRound?: number;
}

function RadarChart({ rounds, selectedRound }: RadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || rounds.length === 0) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const targetRound = selectedRound ?? rounds.length;
    const roundData = rounds.find((r) => r.round === targetRound) || rounds[rounds.length - 1];

    const labels = personas.map((p) => `${p.emoji} ${p.name}`);
    const data = personas.map((p) => roundData.agents[p.id]?.emotion ?? 0);

    chartRef.current = new Chart(ctx, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: `Round ${roundData.round}`,
            data,
            backgroundColor: "rgba(34, 197, 94, 0.2)",
            borderColor: "#22c55e",
            borderWidth: 2,
            pointBackgroundColor: personas.map((p) => p.color),
            pointBorderColor: personas.map((p) => p.color),
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        scales: {
          r: {
            min: -100,
            max: 100,
            beginAtZero: false,
            grid: { color: "#333" },
            angleLines: { color: "#333" },
            pointLabels: { color: "#ccc", font: { size: 12 } },
            ticks: {
              color: "#888",
              stepSize: 25,
              backdropColor: "transparent",
            },
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
            callbacks: {
              label: (context) => {
                const value = context.raw as number;
                return `情绪值: ${value > 0 ? "+" : ""}${value}`;
              },
            },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [rounds, selectedRound]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-300 mb-4">Agent 状态蛛网图</h2>
      <div className="h-64">
        <canvas ref={canvasRef} />
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {rounds.map((r) => (
          <button
            key={r.round}
            onClick={() => {}}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              (selectedRound ?? rounds.length) === r.round
                ? "bg-emerald-500 text-black"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            Round {r.round}
          </button>
        ))}
      </div>
    </div>
  );
}

export default React.memo(RadarChart);