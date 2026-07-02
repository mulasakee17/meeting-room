import { DiscussionMemoryEntry, MemoryStrategy } from "./types";

export class InMemoryStrategy implements MemoryStrategy {
  name: string = "in_memory";
  private entries: DiscussionMemoryEntry[] = [];

  store(entry: DiscussionMemoryEntry): void {
    this.entries.push(entry);
  }

  getByRound(roundNumber: number): DiscussionMemoryEntry[] {
    return this.entries.filter(e => e.roundNumber === roundNumber);
  }

  getByAgent(agentId: string): DiscussionMemoryEntry[] {
    return this.entries.filter(e => e.agentId === agentId);
  }

  getAll(): DiscussionMemoryEntry[] {
    return [...this.entries];
  }

  getRecent(n: number): DiscussionMemoryEntry[] {
    return [...this.entries].reverse().slice(0, n).reverse();
  }

  clear(): void {
    this.entries = [];
  }
}

export class MemoryManager {
  private strategies: Map<string, MemoryStrategy> = new Map();
  private currentStrategy: MemoryStrategy;

  constructor(strategy: MemoryStrategy = new InMemoryStrategy()) {
    this.strategies.set(strategy.name, strategy);
    this.currentStrategy = strategy;
  }

  register(strategy: MemoryStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  use(strategyName: string): void {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Memory strategy ${strategyName} not found`);
    }
    this.currentStrategy = strategy;
  }

  store(entry: DiscussionMemoryEntry): void {
    this.currentStrategy.store(entry);
  }

  getByRound(roundNumber: number): DiscussionMemoryEntry[] {
    return this.currentStrategy.getByRound(roundNumber);
  }

  getByAgent(agentId: string): DiscussionMemoryEntry[] {
    return this.currentStrategy.getByAgent(agentId);
  }

  getAll(): DiscussionMemoryEntry[] {
    return this.currentStrategy.getAll();
  }

  getRecent(n: number): DiscussionMemoryEntry[] {
    return this.currentStrategy.getRecent(n);
  }
}
