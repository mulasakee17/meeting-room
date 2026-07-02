import type { RuntimeEvent, EventHandler, Subscription, EventBus } from "./types";

class RuntimeEventBus implements EventBus {
  private subscriptions: Map<string, Map<string, EventHandler>> = new Map();
  private events: RuntimeEvent[] = [];

  publish(event: RuntimeEvent): void {
    this.events.push(event);

    const eventSubscriptions = this.subscriptions.get(event.type);
    if (eventSubscriptions) {
      eventSubscriptions.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error handling event ${event.type}:`, error);
        }
      });
    }
  }

  subscribe(eventType: string, handler: EventHandler): Subscription {
    const subscriptionId = `${eventType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Map());
    }

    this.subscriptions.get(eventType)!.set(subscriptionId, handler);

    return {
      id: subscriptionId,
      eventType,
      unsubscribe: () => {
        this.unsubscribe({ id: subscriptionId, eventType } as Subscription);
      },
    };
  }

  unsubscribe(subscription: Subscription): void {
    const eventSubscriptions = this.subscriptions.get(subscription.eventType);
    if (eventSubscriptions) {
      eventSubscriptions.delete(subscription.id);
    }
  }

  getEvents(type?: string): RuntimeEvent[] {
    if (type) {
      return this.events.filter((event) => event.type === type);
    }
    return [...this.events];
  }

  clear(): void {
    this.subscriptions.clear();
    this.events = [];
  }
}

export { RuntimeEventBus };
