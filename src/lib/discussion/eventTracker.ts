import { DiscussionEvent, DiscussionEventType } from "./types";

export class EventTracker {
  private events: DiscussionEvent[] = [];
  private subscribers: Array<(event: DiscussionEvent) => void> = [];

  track(event: DiscussionEvent): void {
    const snapshot = structuredClone(event);
    this.events.push(snapshot);
    this.notify(snapshot);
  }

  getEvents(type?: DiscussionEventType): DiscussionEvent[] {
    if (!type) {
      return structuredClone(this.events);
    }
    return structuredClone(this.events.filter(e => e.type === type));
  }

  getEventsByRound(roundNumber: number): DiscussionEvent[] {
    return structuredClone(this.events.filter(e => e.roundNumber === roundNumber));
  }

  subscribe(callback: (event: DiscussionEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  private notify(event: DiscussionEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(structuredClone(event));
    }
  }

  clear(): void {
    this.events = [];
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const event of this.events) {
      stats[event.type] = (stats[event.type] || 0) + 1;
    }
    return stats;
  }
}
