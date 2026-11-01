import { randomUUID } from 'node:crypto';
import type { NetworkReader } from '../network/ports.ts';
import type { Clock } from '../shared/clock.ts';
import { forbidden, notFound, rateLimited, validationError } from '../shared/errors.ts';
import type { EventPublisher } from '../shared/event-bus.ts';
import type { DomainEvent } from '../shared/events.ts';
import type { WaitingRequest } from './model.ts';
import type { WaitingRequestRepository } from './ports.ts';

export interface WaitingConfig {
  ttlMinutes: number;
  maxPerHour: number;
}

export interface WaitingServiceDeps {
  waiting: WaitingRequestRepository;
  network: NetworkReader;
  events: EventPublisher<DomainEvent>;
  clock: Clock;
  /** Maps a user id to a stable pseudonymous reference (keyed hash). */
  pseudonymize: (userId: string) => string;
  config: WaitingConfig;
}

/** "I'm waiting here" requests: live demand signal for drivers and the office. */
export class WaitingService {
  private readonly deps: WaitingServiceDeps;

  constructor(deps: WaitingServiceDeps) {
    this.deps = deps;
  }

  current(userId: string): WaitingRequest | null {
    return this.deps.waiting.findActiveByRequester(this.deps.pseudonymize(userId));
  }

  /** The open request, or one that closed recently (so the student can see "served" / "expired"). */
  latest(userId: string, recentMs = 15 * 60_000): WaitingRequest | null {
    const request = this.deps.waiting.latestByRequester(this.deps.pseudonymize(userId));
    if (!request) return null;
    if (request.status === 'WAITING') return request;
    return request.closedAt !== null && this.deps.clock.now() - request.closedAt <= recentMs ? request : null;
  }

  /** Registers the student at a stop. Asking again for the same stop is idempotent; a different stop replaces the old request. */
  create(userId: string, input: { stopId: unknown; routeId?: unknown }): WaitingRequest {
    const stop = typeof input.stopId === 'string' ? this.deps.network.getStop(input.stopId) : null;
    if (!stop) throw validationError('Choose a valid stop.');
    let routeId: string | null = null;
    if (input.routeId !== undefined && input.routeId !== null && input.routeId !== '') {
      const route = typeof input.routeId === 'string' ? this.deps.network.getRoute(input.routeId) : null;
      if (!route || !route.active) throw validationError('Choose a route that is in service.');
      if (!route.stopIds.includes(stop.id)) throw validationError(`${route.name} does not serve ${stop.name}.`);
      routeId = route.id;
    }

    const ref = this.deps.pseudonymize(userId);
    const now = this.deps.clock.now();
    const existing = this.deps.waiting.findActiveByRequester(ref);
    if (existing && existing.stopId === stop.id && existing.routeId === routeId) return existing;
    if (this.deps.waiting.countCreatedSince(ref, now - 3600_000) >= this.deps.config.maxPerHour) {
      throw rateLimited('Too many waiting requests in the last hour. Please try again later.');
    }
    if (existing) this.close(existing, 'CANCELLED', now);

    const request: WaitingRequest = {
      id: randomUUID(),
      stopId: stop.id,
      routeId,
      requesterRef: ref,
      status: 'WAITING',
      createdAt: now,
      expiresAt: now + this.deps.config.ttlMinutes * 60_000,
      closedAt: null,
    };
    this.deps.waiting.insert(request);
    this.publishCount(stop.id, now);
    return request;
  }

  cancel(userId: string, requestId: string): WaitingRequest {
    const request = this.deps.waiting.get(requestId);
    if (!request || request.status !== 'WAITING') throw notFound('No active waiting request with that id.');
    if (request.requesterRef !== this.deps.pseudonymize(userId)) throw forbidden('You can only cancel your own request.');
    return this.close(request, 'CANCELLED', this.deps.clock.now());
  }

  /** Called when a shuttle reaches a stop: everybody waiting there for that route (or any route) has been served. */
  markServed(stopId: string, routeId: string): number {
    const now = this.deps.clock.now();
    let served = 0;
    for (const request of this.deps.waiting.listActive()) {
      if (request.stopId !== stopId) continue;
      if (request.routeId !== null && request.routeId !== routeId) continue;
      this.close(request, 'SERVED', now, false);
      served++;
    }
    if (served > 0) this.publishCount(stopId, now);
    return served;
  }

  expireDue(): number {
    const now = this.deps.clock.now();
    const touched = new Set<string>();
    for (const request of this.deps.waiting.listActive()) {
      if (request.expiresAt <= now) {
        this.close(request, 'EXPIRED', now, false);
        touched.add(request.stopId);
      }
    }
    for (const stopId of touched) this.publishCount(stopId, now);
    return touched.size;
  }

  /** Active waiting requests per stop (aggregate only; no identities leave this module). */
  countsByStop(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const request of this.deps.waiting.listActive()) counts[request.stopId] = (counts[request.stopId] ?? 0) + 1;
    return counts;
  }

  deidentifyClosed(olderThanMs: number): number {
    return this.deps.waiting.deidentifyClosedBefore(this.deps.clock.now() - olderThanMs);
  }

  private close(request: WaitingRequest, status: 'CANCELLED' | 'EXPIRED' | 'SERVED', at: number, publish = true): WaitingRequest {
    const closed: WaitingRequest = { ...request, status, closedAt: at };
    this.deps.waiting.update(closed);
    if (publish) this.publishCount(request.stopId, at);
    return closed;
  }

  private publishCount(stopId: string, at: number): void {
    const waiting = this.deps.waiting.listActive().filter((r) => r.stopId === stopId).length;
    this.deps.events.publish({ type: 'waiting.changed', stopId, waiting, at });
  }
}
