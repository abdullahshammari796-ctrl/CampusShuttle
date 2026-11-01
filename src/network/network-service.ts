import type { AuditLog } from '../shared/audit.ts';
import type { Clock } from '../shared/clock.ts';
import type { EventPublisher } from '../shared/event-bus.ts';
import type { DomainEvent } from '../shared/events.ts';
import { notFound, validationError } from '../shared/errors.ts';
import { type GeoPoint, haversineMeters } from '../shared/geo.ts';
import type { NewRouteInput, Route, RoutePatch, Shuttle, Stop } from './model.ts';
import type { NetworkReader, RouteRepository, ShuttleRepository, StopRepository } from './ports.ts';
import { RoutePath } from './route-path.ts';

export interface NetworkServiceDeps {
  stops: StopRepository;
  routes: RouteRepository;
  shuttles: ShuttleRepository;
  events: EventPublisher<DomainEvent>;
  clock: Clock;
  audit: AuditLog;
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SERVICE_AREA_MARGIN_M = 5_000;

/** Route and stop management (transport office) plus the read model other modules use. */
export class NetworkService implements NetworkReader {
  private readonly deps: NetworkServiceDeps;
  private readonly pathCache = new Map<string, { updatedAt: number; path: RoutePath }>();

  constructor(deps: NetworkServiceDeps) {
    this.deps = deps;
  }

  listStops(): Stop[] {
    return this.deps.stops.list();
  }

  getStop(id: string): Stop | null {
    return this.deps.stops.get(id);
  }

  listRoutes(options: { includeInactive?: boolean } = {}): Route[] {
    const routes = this.deps.routes.list();
    return options.includeInactive ? routes : routes.filter((r) => r.active);
  }

  getRoute(id: string): Route | null {
    return this.deps.routes.get(id);
  }

  listShuttles(): Shuttle[] {
    return this.deps.shuttles.list().filter((s) => s.active);
  }

  getShuttle(id: string): Shuttle | null {
    return this.deps.shuttles.get(id);
  }

  pathFor(routeId: string): RoutePath {
    const route = this.deps.routes.get(routeId);
    if (!route) throw notFound(`Route ${routeId} not found.`);
    const cached = this.pathCache.get(routeId);
    if (cached && cached.updatedAt === route.updatedAt) return cached.path;
    const path = new RoutePath(route.path, route.loop, this.resolveStops(route.stopIds));
    this.pathCache.set(routeId, { updatedAt: route.updatedAt, path });
    return path;
  }

  serviceArea(): { center: GeoPoint; radiusMeters: number } {
    const stops = this.deps.stops.list();
    if (stops.length === 0) return { center: { lat: 0, lng: 0 }, radiusMeters: Number.POSITIVE_INFINITY };
    const center = {
      lat: stops.reduce((s, p) => s + p.lat, 0) / stops.length,
      lng: stops.reduce((s, p) => s + p.lng, 0) / stops.length,
    };
    let radius = 0;
    for (const route of this.deps.routes.list()) {
      for (const p of route.path) radius = Math.max(radius, haversineMeters(center, p));
    }
    return { center, radiusMeters: radius + SERVICE_AREA_MARGIN_M };
  }

  updateRoute(actorId: string, id: string, patch: RoutePatch): Route {
    const route = this.deps.routes.get(id);
    if (!route) throw notFound(`Route ${id} not found.`);
    const next: Route = { ...route, updatedAt: this.deps.clock.now() };
    if (patch.name !== undefined) next.name = requireName(patch.name);
    if (patch.color !== undefined) next.color = requireColor(patch.color);
    if (patch.nominalSpeedKmh !== undefined) next.nominalSpeedKmh = requireSpeed(patch.nominalSpeedKmh);
    if (patch.dwellSeconds !== undefined) next.dwellSeconds = requireDwell(patch.dwellSeconds);
    if (patch.active !== undefined) next.active = Boolean(patch.active);
    this.deps.routes.save(next);
    this.deps.audit.record({ at: next.updatedAt, actorId, action: 'route.update', target: id, details: JSON.stringify(patch) });
    this.deps.events.publish({ type: 'network.changed', routeId: id, at: next.updatedAt });
    return next;
  }

  /** Creates a route whose geometry follows straight lines between its stops. */
  createRoute(actorId: string, input: NewRouteInput): Route {
    const name = requireName(input.name);
    if (!Array.isArray(input.stopIds) || input.stopIds.length < 2) throw validationError('A route needs at least two stops.');
    if (new Set(input.stopIds).size !== input.stopIds.length) throw validationError('A stop can appear only once in a route.');
    const stops = this.resolveStops(input.stopIds);
    const now = this.deps.clock.now();
    const route: Route = {
      id: this.uniqueId(name),
      name,
      color: requireColor(input.color),
      stopIds: [...input.stopIds],
      path: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      loop: Boolean(input.loop),
      nominalSpeedKmh: requireSpeed(input.nominalSpeedKmh),
      dwellSeconds: requireDwell(input.dwellSeconds),
      active: false,
      updatedAt: now,
    };
    new RoutePath(route.path, route.loop, stops); // validates geometry before saving
    this.deps.routes.save(route);
    this.deps.audit.record({ at: now, actorId, action: 'route.create', target: route.id, details: JSON.stringify({ name, stopIds: route.stopIds }) });
    this.deps.events.publish({ type: 'network.changed', routeId: route.id, at: now });
    return route;
  }

  private resolveStops(stopIds: readonly string[]): Stop[] {
    return stopIds.map((id) => {
      const stop = this.deps.stops.get(id);
      if (!stop) throw validationError(`Unknown stop ${id}.`);
      return stop;
    });
  }

  private uniqueId(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'route';
    let id = base;
    for (let n = 2; this.deps.routes.get(id); n++) id = `${base}-${n}`;
    return id;
  }
}

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 60) {
    throw validationError('Route name must be 3–60 characters.');
  }
  return value.trim();
}

function requireColor(value: unknown): string {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) throw validationError('Colour must look like #1a2b3c.');
  return value.toLowerCase();
}

function requireSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 5 || value > 80) {
    throw validationError('Nominal speed must be between 5 and 80 km/h.');
  }
  return value;
}

function requireDwell(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 600) {
    throw validationError('Dwell time must be a whole number of seconds between 0 and 600.');
  }
  return value;
}
