/**
 * FigureGenerator — 论文图表生成器
 *
 * 生成 SVG 图表（可转为 PDF），包含标题、轴标签、统计标注。
 * Phase 2: 使用纯文本 SVG 生成，不依赖外部图表库。
 */

import * as fs from "fs";
import * as path from "path";
import type { ExperimentMetrics, TestResult } from "../types";

// ============================================================================
// SVG Utilities
// ============================================================================

const CHART_WIDTH = 600;
const CHART_HEIGHT = 400;
const MARGIN = { top: 40, right: 30, bottom: 50, left: 60 };

function svgHeader(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
}

function svgFooter(): string {
  return "</svg>";
}

function svgText(x: number, y: number, text: string, opts?: { fontSize?: number; anchor?: string; fill?: string; fontWeight?: string }): string {
  const fontSize = opts?.fontSize ?? 12;
  const anchor = opts?.anchor ?? "start";
  const fill = opts?.fill ?? "#333";
  const fw = opts?.fontWeight ?? "normal";
  return `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${fontSize}" text-anchor="${anchor}" fill="${fill}" font-weight="${fw}">${escapeXml(text)}</text>`;
}

function svgRect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" />`;
}

function svgLine(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number = 1): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" />`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================================
// Fig 1: State Stability Comparison (Box Plot style → simplified bar chart)
// ============================================================================

function generateFig1(metrics: ExperimentMetrics, test: TestResult): string {
  const ss = metrics.stateStability!;
  const maxVal = Math.max(ss.sigmaSqDeltaB, ss.sigmaSqDeltaU) * 1.5;
  const plotW = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const barW = 60;
  const gap = 80;
  const startX = MARGIN.left + (plotW - 2 * barW - gap) / 2;

  const scaleB = (ss.sigmaSqDeltaB / maxVal) * plotH;
  const scaleU = (ss.sigmaSqDeltaU / maxVal) * plotH;

  let svg = svgHeader(CHART_WIDTH, CHART_HEIGHT + 100);
  svg += `<rect width="100%" height="100%" fill="white" />`;

  // Title
  svg += svgText(CHART_WIDTH / 2, 25, "Fig 1: State Stability Comparison", { fontSize: 14, anchor: "middle", fontWeight: "bold" });

  // Bars
  const barY = MARGIN.top + plotH;
  svg += svgRect(startX, barY - scaleB, barW, scaleB, "#E74C3C");
  svg += svgRect(startX + barW + gap, barY - scaleU, barW, scaleU, "#2ECC71");

  // Labels
  svg += svgText(startX + barW / 2, barY + 20, "Belief", { fontSize: 12, anchor: "middle" });
  svg += svgText(startX + barW + gap + barW / 2, barY + 20, "Utility", { fontSize: 12, anchor: "middle" });

  // Values
  svg += svgText(startX + barW / 2, barY - scaleB - 8, `σ²=${ss.sigmaSqDeltaB.toFixed(4)}`, { fontSize: 11, anchor: "middle", fill: "#E74C3C" });
  svg += svgText(startX + barW + gap + barW / 2, barY - scaleU - 8, `σ²=${ss.sigmaSqDeltaU.toFixed(4)}`, { fontSize: 11, anchor: "middle", fill: "#2ECC71" });

  // Y axis
  svg += svgLine(MARGIN.left, MARGIN.top, MARGIN.left, barY, "#999", 1);
  svg += svgText(MARGIN.left - 10, MARGIN.top, "σ²", { fontSize: 11, anchor: "end" });

  // Result annotation
  const ratio = ss.stabilityRatio;
  const pVal = test.pValue;
  svg += svgText(CHART_WIDTH / 2, barY + 55, `Stability Ratio = ${ratio.toFixed(2)}  |  p = ${pVal.toFixed(4)}  |  d = ${test.effectSize.toFixed(2)}`, {
    fontSize: 12, anchor: "middle", fontWeight: "bold",
  });

  svg += svgFooter();
  return svg;
}

// ============================================================================
// Fig 2: Evidence Explanatory Power
// ============================================================================

function generateFig2(metrics: ExperimentMetrics, test: TestResult): string {
  const ee = metrics.evidenceExplanatory!;
  const maxR2 = Math.max(ee.r2Cognitive, ee.r2Belief) * 1.5;
  const plotW = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const barW = 60;
  const gap = 80;
  const startX = MARGIN.left + (plotW - 2 * barW - gap) / 2;

  const scaleCog = (ee.r2Cognitive / maxR2) * plotH;
  const scaleBel = (ee.r2Belief / maxR2) * plotH;

  let svg = svgHeader(CHART_WIDTH, CHART_HEIGHT + 100);
  svg += `<rect width="100%" height="100%" fill="white" />`;

  svg += svgText(CHART_WIDTH / 2, 25, "Fig 2: Evidence Explanatory Power", { fontSize: 14, anchor: "middle", fontWeight: "bold" });

  const barY = MARGIN.top + plotH;
  svg += svgRect(startX, barY - scaleCog, barW, scaleCog, "#3498DB");
  svg += svgRect(startX + barW + gap, barY - scaleBel, barW, scaleBel, "#95A5A6");

  svg += svgText(startX + barW / 2, barY + 20, "Cognitive", { fontSize: 12, anchor: "middle" });
  svg += svgText(startX + barW + gap + barW / 2, barY + 20, "Belief", { fontSize: 12, anchor: "middle" });

  svg += svgText(startX + barW / 2, barY - scaleCog - 8, `R²=${ee.r2Cognitive.toFixed(3)}`, { fontSize: 11, anchor: "middle", fill: "#3498DB" });
  svg += svgText(startX + barW + gap + barW / 2, barY - scaleBel - 8, `R²=${ee.r2Belief.toFixed(3)}`, { fontSize: 11, anchor: "middle", fill: "#95A5A6" });

  svg += svgLine(MARGIN.left, MARGIN.top, MARGIN.left, barY, "#999", 1);
  svg += svgText(MARGIN.left - 10, MARGIN.top, "R²", { fontSize: 11, anchor: "end" });

  svg += svgText(CHART_WIDTH / 2, barY + 55, `ΔR² = ${ee.deltaR2.toFixed(3)}`, {
    fontSize: 12, anchor: "middle", fontWeight: "bold",
  });

  svg += svgFooter();
  return svg;
}

// ============================================================================
// Fig 6: State Decoupling (Correlation Heatmap)
// ============================================================================

function generateFig6(metrics: ExperimentMetrics, test: TestResult): string {
  const sd = metrics.stateDecoupling!;
  if (sd.status !== "computed"
    || sd.maxCorrCognitive === undefined
    || sd.maxCorrBelief === undefined) {
    throw new Error("Fig 6 requires a computed E6 result");
  }
  // 使用实际计算的相关矩阵，而非占位符
  const matrix = sd.correlationMatrix;
  const labels = sd.variableNames || ["U", "E", "I", "C", "Λ"];
  const n = labels.length;
  const size = 280;
  const cellSize = 50;
  const startX = (CHART_WIDTH - n * cellSize) / 2;
  const startY = 60;

  let svg = svgHeader(CHART_WIDTH, size + 160);
  svg += `<rect width="100%" height="100%" fill="white" />`;

  svg += svgText(CHART_WIDTH / 2, 25, "Fig 6: Cognitive State Correlation Matrix", { fontSize: 14, anchor: "middle", fontWeight: "bold" });

  // 使用实际相关矩阵生成热图
  if (matrix && matrix.length === n) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = startX + j * cellSize;
        const y = startY + i * cellSize;
        const r = matrix[i][j];
        const absR = Math.abs(r);
        // 蓝-白-红 色阶：负相关→蓝，零→白，正相关→红
        let color: string;
        if (r >= 0) {
          const intensity = Math.floor(255 - absR * 200);
          color = `rgb(255,${intensity},${intensity})`;
        } else {
          const intensity = Math.floor(255 - absR * 200);
          color = `rgb(${intensity},${intensity},255)`;
        }
        svg += svgRect(x, y, cellSize - 2, cellSize - 2, color);
        svg += svgText(x + cellSize / 2, y + cellSize / 2 + 4, r.toFixed(2), { fontSize: 10, anchor: "middle" });
      }
    }
  } else {
    // 回退：使用变量名标签但无实际数据时显示提示
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = startX + j * cellSize;
        const y = startY + i * cellSize;
        const r = i === j ? 1 : 0;
        const color = `rgb(235,235,235)`;
        svg += svgRect(x, y, cellSize - 2, cellSize - 2, color);
        svg += svgText(x + cellSize / 2, y + cellSize / 2 + 4, i === j ? "1.00" : "N/A", { fontSize: 10, anchor: "middle" });
      }
    }
  }

  // Row/col labels
  for (let i = 0; i < n; i++) {
    svg += svgText(startX - 15, startY + i * cellSize + cellSize / 2 + 4, labels[i], { fontSize: 12, anchor: "end" });
    svg += svgText(startX + i * cellSize + cellSize / 2, startY + n * cellSize + 20, labels[i], { fontSize: 12, anchor: "middle" });
  }

  svg += svgText(CHART_WIDTH / 2, startY + n * cellSize + 55,
    `max |r| = ${sd.maxCorrCognitive.toFixed(3)} (Cognitive) vs ${sd.maxCorrBelief.toFixed(3)} (Belief)  |  p = ${test.pValue.toFixed(4)}`,
    { fontSize: 11, anchor: "middle", fontWeight: "bold" });

  svg += svgFooter();
  return svg;
}

// ============================================================================
// Main
// ============================================================================

export function generateFigures(
  metrics: ExperimentMetrics,
  tests: TestResult[],
  outputDir: string,
): string[] {
  const figures: string[] = [];
  fs.mkdirSync(outputDir, { recursive: true });

  const testMap = new Map(tests.map(t => [t.experimentId, t]));

  switch (metrics.experimentId) {
    case "e1_stability":
    case "e1_native": {
      const test = testMap.get("e1_stability");
      if (test && metrics.stateStability) {
        const svg = generateFig1(metrics, test);
        const filePath = path.join(outputDir, "fig1_stability.svg");
        fs.writeFileSync(filePath, svg);
        figures.push(filePath);
      }
      break;
    }
    case "e2_evidence": {
      const test = testMap.get("e2_evidence");
      if (test && metrics.evidenceExplanatory) {
        const svg = generateFig2(metrics, test);
        const filePath = path.join(outputDir, "fig2_evidence.svg");
        fs.writeFileSync(filePath, svg);
        figures.push(filePath);
      }
      break;
    }
    case "e6_decoupling": {
      const test = testMap.get("e6_decoupling");
      // Non-computed confirmatory analyses intentionally produce no figure;
      // rendering a zero/placeholder heatmap would look like a scientific
      // result rather than an unavailable analysis.
      if (test && metrics.stateDecoupling?.status === "computed") {
        const svg = generateFig6(metrics, test);
        const filePath = path.join(outputDir, "fig6_decoupling.svg");
        fs.writeFileSync(filePath, svg);
        figures.push(filePath);
      }
      break;
    }
  }

  return figures;
}
