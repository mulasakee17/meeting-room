import {
  FrameworkAdapter,
  AgentFrameworkType,
  AgentConfig,
  Agent,
  TaskInput,
  InteractionResult,
  AgentState,
  FrameworkAdapterOptions,
} from "./types";

import { AutoGenAdapter } from "./autogen";
import { CustomAdapter } from "./custom";

export class AdapterRegistry {
  private adapters: Map<AgentFrameworkType, FrameworkAdapter> = new Map();

  constructor() {
    this.register("custom", new CustomAdapter());
    this.register("autogen", new AutoGenAdapter());
  }

  register(framework: AgentFrameworkType, adapter: FrameworkAdapter): void {
    this.adapters.set(framework, adapter);
  }

  get(framework: AgentFrameworkType): FrameworkAdapter {
    const adapter = this.adapters.get(framework);
    if (!adapter) {
      const supported = Array.from(this.adapters.keys()).join(", ");
      throw new Error(
        `Unsupported framework: "${framework}". Supported frameworks: ${supported}. ` +
        `If you intended to use a custom agent implementation, explicitly pass "custom".`
      );
    }
    return adapter;
  }

  has(framework: AgentFrameworkType): boolean {
    return this.adapters.has(framework);
  }

  list(): AgentFrameworkType[] {
    return Array.from(this.adapters.keys());
  }
}

export const adapterRegistry = new AdapterRegistry();

export * from "./types";

export { CustomAdapter };