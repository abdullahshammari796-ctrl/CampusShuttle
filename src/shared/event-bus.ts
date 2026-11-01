/**
 * Observer pattern: an in-process publish/subscribe bus.
 *
 * Modules publish domain events without knowing who listens (the SSE hub,
 * the waiting-request service, ...). Dispatch is synchronous and each handler
 * is isolated, so one failing subscriber cannot break the publisher or the
 * other subscribers. Replacing this class with a Redis/NATS adapter is the
 * documented path to running more than one server instance.
 */
export type EventHandler<E> = (event: E) => void;

export interface EventPublisher<E extends { type: string }> {
  publish(event: E): void;
}

export class EventBus<E extends { type: string }> implements EventPublisher<E> {
  private readonly handlers = new Map<string, Set<EventHandler<E>>>();
  private readonly onHandlerError: (error: unknown, event: E) => void;
  private published = 0;
  private handlerErrors = 0;

  constructor(onHandlerError: (error: unknown, event: E) => void = (error, event) => {
    console.error(`[event-bus] handler failed for ${event.type}:`, error);
  }) {
    this.onHandlerError = onHandlerError;
  }

  subscribe<T extends E['type']>(type: T, handler: EventHandler<Extract<E, { type: T }>>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = handler as EventHandler<E>;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  subscribeAll(handler: EventHandler<E>): () => void {
    return this.subscribe('*' as E['type'], handler as never);
  }

  publish(event: E): void {
    this.published++;
    for (const key of [event.type, '*']) {
      const set = this.handlers.get(key);
      if (!set) continue;
      for (const handler of [...set]) {
        try {
          handler(event);
        } catch (error) {
          this.handlerErrors++;
          this.onHandlerError(error, event);
        }
      }
    }
  }

  stats(): { published: number; handlerErrors: number; subscriptions: number } {
    let subscriptions = 0;
    for (const set of this.handlers.values()) subscriptions += set.size;
    return { published: this.published, handlerErrors: this.handlerErrors, subscriptions };
  }
}
