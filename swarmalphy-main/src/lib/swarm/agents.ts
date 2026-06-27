import type { AgentInfo } from "./types";

export const AGENTS: AgentInfo[] = [
  { id: "institution", name: "Institution", emoji: "🏦", role: "机构投资者" },
  { id: "value", name: "Value", emoji: "💎", role: "价值投资者" },
  { id: "trend", name: "Trend", emoji: "🏄", role: "趋势交易者" },
  { id: "panic", name: "Panic", emoji: "😱", role: "恐慌情绪" },
  { id: "quant", name: "Quant", emoji: "🤖", role: "量化策略" },
  { id: "media", name: "Media", emoji: "📡", role: "媒体叙事" },
  { id: "contrarian", name: "Contrarian", emoji: "🦉", role: "逆向投资" },
  { id: "retail", name: "Retail", emoji: "🐜", role: "散户群体" },
  { id: "policy", name: "Policy", emoji: "🏛️", role: "政策制定" },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
