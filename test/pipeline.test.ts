/**
 * pipeline.test.ts — 生产 API 入口 runSwarmPipeline 的基础守护测试
 *
 * 使用 mock FrameworkAdapter 避免真实 LLM 调用，验证：
 * 1. 正常路径：管线完整执行并返回结构化输出
 * 2. 边界情况：不支持的框架抛出明确错误
 * 3. 输出结构：关键字段不为空
 */

import { describe, it, expect, beforeEach } from "vitest";
import { adapterRegistry } from "@/lib/adapters";
import type {
  FrameworkAdapter,
  AgentConfig,
  Agent,
  TaskInput,
  InteractionResult,
  AgentState,
} from "@/lib/adapters/types";
import { runSwarmPipeline, type PipelineInput } from "@/lib/pipeline";

// ---- Mock FrameworkAdapter --------------------------------------------------

class MockAdapter implements FrameworkAdapter {
  readonly framework = "custom" as const;

  async createAgents(configs: AgentConfig[]): Promise<Agent[]> {
    return configs.map(c => ({
      id: c.id,
      name: c.name,
      role: c.role,
      type: c.type,
      sendMessage: async (msg: string) => `Mock response to: ${msg.substring(0, 30)}`,
      getState: (): AgentState => ({
        agentId: c.id,
        belief: 0.5,
        confidence: 75,
        reasoning: "Mock reasoning",
        lastMessage: JSON.stringify({ reasoning: "Mock", emotion: 50 }),
      }),
    }));
  }

  async runInteraction(agents: Agent[], input: TaskInput): Promise<InteractionResult> {
    const content = typeof input.content === "string" ? input.content : JSON.stringify(input.content);
    const messages = agents.map(a => ({
      agentId: a.id,
      content: `Response from ${a.id} to: ${content.substring(0, 20)}`,
      timestamp: new Date().toISOString(),
    }));
    const agentStates = agents.map(a => ({
      agentId: a.id,
      belief: 0.6,
      confidence: 80,
      reasoning: "Mock analysis",
      lastMessage: JSON.stringify({ reasoning: "Mock analysis", emotion: 60 }),
    }));
    return {
      messages,
      agentStates,
      converged: true,
      finalDecision: "Mock consensus decision",
    };
  }

  getAgentInfo(agents: Agent[]): AgentConfig[] {
    return agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }));
  }

  async dispose(): Promise<void> {}
}

// ---- Tests ------------------------------------------------------------------

describe("runSwarmPipeline", () => {
  beforeEach(() => {
    // 用 MockAdapter 覆盖 "custom"，避免真实 LLM 调用
    adapterRegistry.register("custom", new MockAdapter());
  });

  it("正常路径：完整执行并返回结构化输出", async () => {
    const input: PipelineInput = {
      provider: "custom",
      agentCount: 3,
      llmConfig: { provider: "deepseek", model: "deepseek-chat" },
      input: {
        type: "question",
        content: "Should we invest in AI research?",
      },
    };

    const output = await runSwarmPipeline(input, "test");

    // output.output
    expect(output.output.finalDecision).toBe("Mock consensus decision");
    expect(output.output.confidence).toBeGreaterThanOrEqual(0);
    expect(output.output.confidence).toBeLessThanOrEqual(1);
    expect(output.output.steps).toHaveLength(3);
    expect(output.output.steps[0].agentId).toBe("agent_1");

    // evaluation
    expect(output.evaluation).toBeDefined();
    expect(typeof output.evaluation.overallScore).toBe("number");

    // governance
    expect(output.governance).toBeDefined();

    // agents
    expect(output.agents).toHaveLength(3);
    expect(output.agents[0].id).toBe("agent_1");

    // interactionHistory
    expect(output.interactionHistory).toHaveLength(1);
    expect(output.interactionHistory[0].round).toBe(1);
    expect(output.interactionHistory[0].messages).toHaveLength(3);

    // trace
    expect(output.trace.taskId).toMatch(/^test_\d+$/);
    expect(output.trace.startTime).toBeDefined();
    expect(output.trace.endTime).toBeDefined();
  });

  it("边界：不支持的框架抛出明确错误", async () => {
    const input: PipelineInput = {
      provider: "crewai", // 未注册
      llmConfig: { provider: "openai", model: "gpt-4" },
      input: { type: "text", content: "test" },
    };

    await expect(runSwarmPipeline(input)).rejects.toThrow(/Unsupported framework/i);
  });

  it("默认 agentCount 为 5", async () => {
    const input: PipelineInput = {
      provider: "custom",
      llmConfig: { provider: "deepseek", model: "deepseek-chat" },
      input: { type: "text", content: "test" },
    };

    const output = await runSwarmPipeline(input);
    expect(output.agents).toHaveLength(5);
    expect(output.output.steps).toHaveLength(5);
  });

  it("agentTypes 按索引循环分配角色", async () => {
    const input: PipelineInput = {
      provider: "custom",
      agentCount: 4,
      agentTypes: ["Expert", "Analyst"],
      llmConfig: { provider: "deepseek", model: "deepseek-chat" },
      input: { type: "text", content: "test" },
    };

    const output = await runSwarmPipeline(input);
    expect(output.agents[0].role).toBe("Expert");
    expect(output.agents[1].role).toBe("Analyst");
    expect(output.agents[2].role).toBe("Expert");
    expect(output.agents[3].role).toBe("Analyst");
  });
});
