import { StrategyDescriptor, StrategyConfig, StrategyInfo } from "./types";
import { StrategyRegistry } from "./discussion/strategyRegistry";
import { BeliefUpdateStrategy, InfluenceStrategy, MemoryStrategy } from "./discussion/types";
import { InterventionStrategy } from "./governance/types";

export class StrategyManager {
  private beliefUpdateRegistry = new StrategyRegistry<BeliefUpdateStrategy>();
  private influenceRegistry = new StrategyRegistry<InfluenceStrategy>();
  private memoryRegistry = new StrategyRegistry<MemoryStrategy>();
  private interventionRegistry = new StrategyRegistry<InterventionStrategy>();
  private descriptors: Map<string, StrategyDescriptor> = new Map();

  registerBeliefUpdateStrategy(strategy: BeliefUpdateStrategy, descriptor?: Partial<StrategyDescriptor>): void {
    this.beliefUpdateRegistry.register(strategy);
    this.descriptors.set(strategy.name, {
      name: strategy.name,
      type: "belief_update",
      description: descriptor?.description || "",
      configSchema: descriptor?.configSchema,
    });
  }

  registerInfluenceStrategy(strategy: InfluenceStrategy, descriptor?: Partial<StrategyDescriptor>): void {
    this.influenceRegistry.register(strategy);
    this.descriptors.set(strategy.name, {
      name: strategy.name,
      type: "influence",
      description: descriptor?.description || "",
      configSchema: descriptor?.configSchema,
    });
  }

  registerMemoryStrategy(strategy: MemoryStrategy, descriptor?: Partial<StrategyDescriptor>): void {
    this.memoryRegistry.register(strategy);
    this.descriptors.set(strategy.name, {
      name: strategy.name,
      type: "memory",
      description: descriptor?.description || "",
      configSchema: descriptor?.configSchema,
    });
  }

  registerInterventionStrategy(strategy: InterventionStrategy, descriptor?: Partial<StrategyDescriptor>): void {
    this.interventionRegistry.register(strategy);
    this.descriptors.set(strategy.name, {
      name: strategy.name,
      type: "intervention",
      description: descriptor?.description || "",
      configSchema: descriptor?.configSchema,
    });
  }

  getBeliefUpdateStrategy(name: string): BeliefUpdateStrategy {
    return this.beliefUpdateRegistry.get(name);
  }

  getInfluenceStrategy(name: string): InfluenceStrategy {
    return this.influenceRegistry.get(name);
  }

  getMemoryStrategy(name: string): MemoryStrategy {
    return this.memoryRegistry.get(name);
  }

  getInterventionStrategy(name: string): InterventionStrategy {
    return this.interventionRegistry.get(name);
  }

  listStrategies(type?: StrategyDescriptor["type"]): StrategyInfo[] {
    return Array.from(this.descriptors.values())
      .filter(d => !type || d.type === type)
      .map(d => ({
        name: d.name,
        type: d.type,
        description: d.description,
      }));
  }

  getStrategyInfo(name: string): StrategyInfo | undefined {
    const descriptor = this.descriptors.get(name);
    if (!descriptor) return undefined;
    return {
      name: descriptor.name,
      type: descriptor.type,
      description: descriptor.description,
    };
  }

  hasStrategy(name: string): boolean {
    return this.descriptors.has(name);
  }

  getStrategyDescriptor(name: string): StrategyDescriptor | undefined {
    return this.descriptors.get(name);
  }
}