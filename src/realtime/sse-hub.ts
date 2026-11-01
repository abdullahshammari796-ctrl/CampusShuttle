import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Role } from '../identity/model.ts';
import type { Clock } from '../shared/clock.ts';
import type { EventBus } from '../shared/event-bus.ts';
import type { DomainEvent } from '../shared/events.ts';
import type { LiveDataSource } from './live-view.ts';

export interface SseHubOptions {
  heartbeatMs: number;
  /** A client whose socket buffer exceeds this is "slow": it skips incremental updates and is resynchronised later. */
  maxBufferedBytes: number;
}

interface Client {
  id: number;
  role: Role;
  res: ServerResponse;
  connectedAt: number;
  /** The session token's expiry: the stream is closed then, so no update outlives the session. */
  expiresAt: number;
  resyncPending: boolean;
}

/**
 * Real-time gateway using Server-Sent Events.
 *
 * Subscribes (Observer) to domain events and pushes them to every connected
 * browser. Each message is serialised once and written to all clients.
 * Location updates are coalesced per trip within one event-loop turn, so a
 * batch of 20 buffered GPS fixes produces one message, not 20.
 *
 * Authorisation is checked when a stream opens; the session's expiry is then
 * re-checked before every write and on every heartbeat, and an expired stream
 * receives `session-expired` and is closed.
 */
export class SseHub {
  private readonly clients = new Map<number, Client>();
  private readonly pendingVehicles = new Set<string>();
  private readonly source: LiveDataSource;
  private readonly clock: Clock;
  private readonly options: SseHubOptions;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private flushScheduled = false;
  private closed = false;
  private nextClientId = 1;
  private sequence = 0;
  private readonly counters = { connectionsTotal: 0, messagesSent: 0, messagesSkipped: 0, snapshotsSent: 0, sessionsExpired: 0 };

  constructor(bus: EventBus<DomainEvent>, source: LiveDataSource, clock: Clock, options: SseHubOptions) {
    this.source = source;
    this.clock = clock;
    this.options = options;
    const queue = (e: { tripId: string }) => this.queueVehicle(e.tripId);
    bus.subscribe('trip.started', queue);
    bus.subscribe('trip.location', queue);
    bus.subscribe('trip.signal', queue);
    bus.subscribe('trip.occupancy', queue);
    bus.subscribe('trip.ended', (e) => {
      this.pendingVehicles.delete(e.tripId);
      this.broadcast('vehicle-removed', { tripId: e.tripId, status: e.status, reason: e.reason });
    });
    bus.subscribe('waiting.changed', (e) => this.broadcast('waiting', { stopId: e.stopId, waiting: e.waiting }));
    bus.subscribe('stop.arrived', (e) => this.broadcast('arrival', { tripId: e.tripId, routeId: e.routeId, stopId: e.stopId, at: e.at }));
    bus.subscribe('network.changed', (e) => this.broadcast('network', { routeId: e.routeId }));
  }

  attach(req: IncomingMessage, res: ServerResponse, role: Role, sessionExpiresAt: number): void {
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const client: Client = { id: this.nextClientId++, role, res, connectedAt: this.clock.now(), expiresAt: sessionExpiresAt, resyncPending: false };
    this.clients.set(client.id, client);
    this.counters.connectionsTotal++;
    this.sendSnapshot(client);
    const remove = () => this.clients.delete(client.id);
    req.on('close', remove);
    res.on('error', remove);
  }

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.expireSessions();
      this.broadcast('heartbeat', {});
    }, this.options.heartbeatMs);
    this.heartbeatTimer.unref();
  }

  /** Closes every stream whose session has expired (also catches idle streams); returns how many. */
  expireSessions(): number {
    const now = this.clock.now();
    let closed = 0;
    for (const client of [...this.clients.values()]) {
      if (this.endIfExpired(client, now)) closed++;
    }
    return closed;
  }

  /** Sends any coalesced vehicle updates now (normally runs on the next event-loop turn). */
  flush(): void {
    this.flushScheduled = false;
    const tripIds = [...this.pendingVehicles];
    this.pendingVehicles.clear();
    if (this.closed || this.clients.size === 0) return; // nobody to tell: skip building views
    for (const tripId of tripIds) {
      const vehicle = this.source.vehicle(tripId);
      if (vehicle) this.broadcast('vehicle', vehicle);
    }
  }

  stats(): { clients: number; byRole: Record<Role, number>; connectionsTotal: number; messagesSent: number; messagesSkipped: number; snapshotsSent: number; sessionsExpired: number } {
    const byRole: Record<Role, number> = { student: 0, driver: 0, office: 0 };
    for (const c of this.clients.values()) byRole[c.role]++;
    return { clients: this.clients.size, byRole, ...this.counters };
  }

  close(): void {
    this.closed = true;
    this.pendingVehicles.clear();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const client of this.clients.values()) client.res.end();
    this.clients.clear();
  }

  private queueVehicle(tripId: string): void {
    this.pendingVehicles.add(tripId);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      setImmediate(() => this.flush());
    }
  }

  private broadcast(event: string, payload: object): void {
    if (this.clients.size === 0) return;
    const now = this.clock.now();
    const frame = this.frame(event, { ...payload, serverTime: now });
    for (const client of [...this.clients.values()]) {
      if (!this.endIfExpired(client, now)) this.write(client, frame);
    }
  }

  private endIfExpired(client: Client, now: number): boolean {
    if (client.expiresAt > now) return false;
    this.clients.delete(client.id);
    this.counters.sessionsExpired++;
    client.res.end(this.frame('session-expired', { serverTime: now }));
    return true;
  }

  private write(client: Client, frame: string): void {
    if (client.res.writableLength > this.options.maxBufferedBytes) {
      this.counters.messagesSkipped++;
      if (!client.resyncPending) {
        client.resyncPending = true;
        client.res.once('drain', () => {
          client.resyncPending = false;
          if (this.clients.has(client.id) && !this.endIfExpired(client, this.clock.now())) this.sendSnapshot(client);
        });
      }
      return;
    }
    client.res.write(frame);
    this.counters.messagesSent++;
  }

  private sendSnapshot(client: Client): void {
    client.res.write(this.frame('snapshot', { ...this.source.snapshot(client.role), serverTime: this.clock.now() }));
    this.counters.snapshotsSent++;
  }

  private frame(event: string, data: object): string {
    return `id: ${++this.sequence}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
