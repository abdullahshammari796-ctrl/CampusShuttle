import type { GeoPoint } from '../shared/geo.ts';
import type { Route, Shuttle, Stop } from './model.ts';
import type { RoutePath } from './route-path.ts';

/** Repository ports implemented by the persistence layer. */
export interface StopRepository {
  list(): Stop[];
  get(id: string): Stop | null;
}

export interface RouteRepository {
  list(): Route[];
  get(id: string): Route | null;
  save(route: Route): void;
}

export interface ShuttleRepository {
  list(): Shuttle[];
  get(id: string): Shuttle | null;
}

/** Read-only view of the network used by the tracking and demand modules. */
export interface NetworkReader {
  getRoute(id: string): Route | null;
  getStop(id: string): Stop | null;
  getShuttle(id: string): Shuttle | null;
  listStops(): Stop[];
  listRoutes(options?: { includeInactive?: boolean }): Route[];
  pathFor(routeId: string): RoutePath;
  serviceArea(): { center: GeoPoint; radiusMeters: number };
}
