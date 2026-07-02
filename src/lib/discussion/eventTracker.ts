import { DiscussionEvent, DiscussionEventType } from "./types";

export class EventTracker {
  private events: DiscussionEvent[] = [];
  private subscribers: Array<(event: DiscussionEvent) => void> = [];

  track(event: DiscussionEvent): void {
    this.events.push(event);
    this.notify(event);
  }

  getEvents(type?: DiscussionEventType): DiscussionEvent[] {
    if (!type) {
      return [...this.events];
    }
    return this.events.filter(e => e.type === type);
  }

  getEventsByRound(roundNumber: number): DiscussionEvent[] {
    return this.events.filter(e => e.roundNumber === roundNumber);
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
      subscriber(event);
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
