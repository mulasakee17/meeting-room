/**
 * 前端页面测试 — V2 (对比模式 + Demo/Live 切换)
 *
 * 覆盖：
 * 1. 组件渲染 — 标题、Demo/Live 切换、场景选择、空状态
 * 2. Demo 模式 — 运行按钮触发 mock 数据展示
 * 3. 对比视图 — 左右两列展示单人 vs Swarm 结果
 * 4. 评分增量 — 集体智慧增益显示
 * 5. 场景切换 — 3 个预设场景
 * 6. Live 模式 — 显示自定义输入框
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import Home from "@/app/page";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const buildSuccessResponse = () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      data: {
        output: { finalDecision: "测试结论", confidence: 0.82, reasoning: "",
          steps: [], agentContributions: {} },
        evaluation: {
          overallScore: 78, grade: "good", summary: "测试摘要",
          dimensions: {
            consensus: { score: 80 }, reliability: { score: 70 },
            dispersion: { score: 72 },
            stability: { score: 78 },
            influenceAnalysis: { score: 82 },
          },
        },
        governance: {
          echoChamber: { detected: false, severity: "low", redundantAgents: [], infoRedundancyScore: 0, intervention: { type: "none", applied: false } },
          authorityBias: { detected: false, severity: "low", influenceRatio: 0.2, intervention: { type: "none", applied: false } },
          polarization: { detected: false, severity: "low", groups: [], polarizationIndex: 0.1, intervention: { type: "none", applied: false } },
          prematureConsensus: { detected: false, severity: "low", roundNumber: 1, maxRounds: 3, beliefStd: 0.1, consensusLevel: 0.8, intervention: { type: "none", applied: false } },
          otherIssues: [], summary: "未检测到异常", interventionCount: 0,
        },
        agents: [
          { id: "a1", name: "Agent 1", role: "Expert", type: "default" },
          { id: "a2", name: "Agent 2", role: "Critic", type: "default" },
        ],
        interactionHistory: [], trace: { taskId: "t1", startTime: "", endTime: "", phases: [], fullLog: "" },
      },
    }),
  } as unknown as Response);

describe("Home 页面 — 新对比模式", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // -- 1. 基础渲染 -----------------------------------------------------------
  it("应该渲染 SwarmAlpha 标题", () => {
    render(<Home />);
    expect(screen.getByText("SwarmAlpha")).toBeDefined();
  });

  it("应该渲染 Demo/Live 切换按钮", () => {
    render(<Home />);
    expect(screen.getByText("⚡ Demo")).toBeDefined();
    expect(screen.getByText("🔗 Live")).toBeDefined();
  });

  it("Demo 模式应该有运行按钮", () => {
    render(<Home />);
    expect(screen.getByText("🚀 Run Governance Comparison")).toBeDefined();
  });

  it("应该显示三个预设场景", () => {
    render(<Home />);
    expect(screen.getByText("🏗️ 技术架构评审: 微服务 vs 单体")).toBeDefined();
    expect(screen.getByText("💼 董事会投资决策: 是否收购 AI 初创公司")).toBeDefined();
    expect(screen.getByText("🏥 多学科会诊: 复杂病例诊断")).toBeDefined();
  });

  it("空状态应该显示功能介绍卡片", () => {
    render(<Home />);
    expect(screen.getByText("多视角分析")).toBeDefined();
    expect(screen.getByText("偏差治理")).toBeDefined();
    expect(screen.getByText("5 维评估")).toBeDefined();
  });

  // -- 2. Demo 模式 — 运行后展示结果 ----------------------------------------
  it("点击运行对比实验后应该显示治理对比结果", async () => {
    render(<Home />);
    const button = screen.getByText("🚀 Run Governance Comparison");
    await act(async () => { fireEvent.click(button); });

    await waitFor(() => {
      expect(screen.getByText("🧑 Without Governance")).toBeDefined();
      expect(screen.getByText("🐜 With SwarmAlpha Governance")).toBeDefined();
    });
  });

  it("Demo 结果应该显示评分增量", async () => {
    render(<Home />);
    await act(async () => { fireEvent.click(screen.getByText("🚀 Run Governance Comparison")); });

    await waitFor(() => {
      expect(screen.getByText("集体智慧增益")).toBeDefined();
    });
  });

  it("Swarm 卡应该显示治理检测", async () => {
    render(<Home />);
    await act(async () => { fireEvent.click(screen.getByText("🚀 Run Governance Comparison")); });

    await waitFor(() => {
      expect(screen.getByText("回音室")).toBeDefined();
      expect(screen.getByText("权威偏见")).toBeDefined();
      expect(screen.getByText("群体极化")).toBeDefined();
    });
  });

  // -- 3. 场景切换 ----------------------------------------------------------
  it("切换场景应该更新活动按钮样式", async () => {
    render(<Home />);
    const scenario2 = screen.getByText("💼 董事会投资决策: 是否收购 AI 初创公司");
    await act(async () => { fireEvent.click(scenario2); });

    // 第二个按钮应该变成蓝色
    expect(scenario2.className).toContain("bg-blue-600");
  });

  // -- 4. Live 模式切换 -----------------------------------------------------
  it("切换到 Live 模式应该隐藏运行对比实验按钮", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("🔗 Live"));

    // Live 模式没有"运行对比实验"按钮
    expect(() => screen.getByText("🚀 Run Governance Comparison")).toThrow();
  });

  it("Live 模式应该显示自定义输入框", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("🔗 Live"));

    expect(screen.getByPlaceholderText("一个电商平台正在规划技术架构升级。评估是否应从现有单体架构迁移到微服务架构，考虑因素包括团队规模 15 人、日活 50 万、峰值 QPS 5000。")).toBeDefined();
  });

  it("Live 模式应该显示开始决策按钮", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("🔗 Live"));
    expect(screen.getByText("🚀 开始决策")).toBeDefined();
  });

  // -- 5. 详情模式切换 ------------------------------------------------------
  it("切换到详情模式应该显示讨论过程", async () => {
    render(<Home />);
    await act(async () => { fireEvent.click(screen.getByText("🚀 Run Governance Comparison")); });

    await waitFor(() => { expect(screen.getByText("详情模式")).toBeDefined(); });

    await act(async () => { fireEvent.click(screen.getByText("详情模式")); });

    await waitFor(() => {
      expect(screen.getByText("🧑 Without Governance — Decision Trace")).toBeDefined();
      expect(screen.getByText("🐜 With Governance — Discussion & Intervention Trace")).toBeDefined();
    });
  });

  // -- 6. Live API 调用 -----------------------------------------------------
  it("Live 模式点击开始决策应该发送两次 fetch（1 agent + 5 agent）", async () => {
    mockFetch.mockResolvedValue(buildSuccessResponse());
    render(<Home />);
    fireEvent.click(screen.getByText("🔗 Live"));

    const button = screen.getByText("🚀 开始决策");
    await act(async () => { fireEvent.click(button); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
