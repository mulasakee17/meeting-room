import { SwarmResult } from "@/types";

const STORAGE_KEY = "swarmalpha_history";
const MAX_HISTORY_ITEMS = 20;

export interface HistoryItem {
  id: string;
  timestamp: string;
  news: string;
  result: SwarmResult;
}

export function saveToHistory(result: SwarmResult): HistoryItem {
  const history = getHistory();
  
  const newItem: HistoryItem = {
    id: `swarm_${Date.now()}`,
    timestamp: new Date().toISOString(),
    news: result.news,
    result,
  };

  const updatedHistory = [newItem, ...history].slice(0, MAX_HISTORY_ITEMS);
  
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
  }

  return newItem;
}

export function getHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function deleteHistoryItem(id: string): void {
  const history = getHistory();
  const updatedHistory = history.filter((item) => item.id !== id);
  
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
  }
}

export function clearHistory(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}