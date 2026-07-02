import { DiscussionStrategy, StrategyConfig, StrategyFactory } from "./types";

export class StrategyRegistry<T extends DiscussionStrategy> {
  private strategies: Map<string, T> = new Map();
  private factories: Map<string, StrategyFactory<T>> = new Map();

  register(strategy: T): void {
    this.strategies.set(strategy.name, strategy);
  }

  registerFactory(name: string, factory: StrategyFactory<T>): void {
    this.factories.set(name, factory);
  }

  get(name: string): T {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Strategy ${name} not found`);
    }
    return strategy;
  }

  create(name: string, config?: StrategyConfig): T {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Strategy factory ${name} not found`);
    }
    return factory.create(config);
  }

  list(): string[] {
    return Array.from(this.strategies.keys());
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }

  getFactoryNames(): string[] {
    return Array.from(this.factories.keys());
  }

  hasFactory(name: string): boolean {
    return this.factories.has(name);
  }
}
