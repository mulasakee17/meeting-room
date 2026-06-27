/**
 * Mock API 路由 — 返回预计算的完整 SwarmAlpha v9.7 响应数据。
 * 用于前端开发和演示，无需 LLM API Key。
 *
 * 使用: POST /api/swarm/mock
 */
import { NextResponse } from "next/server";
import mockData from "./mock-data.json";

export async function POST() {
  // 模拟 1 秒延迟以展示加载状态
  await new Promise((resolve) => setTimeout(resolve, 800));
  return NextResponse.json(mockData);
}

export async function GET() {
  return NextResponse.json({
    name: "SwarmAlpha Mock API",
    description: "返回预计算演示数据，无需 API Key",
    usage: "POST /api/swarm/mock",
  });
}
