import type { GeoPoint } from '../shared/geo.ts';

/** A boarding point. Stops are shared between routes (e.g. Main Gate). */
export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
}

/**
 * A shuttle route: an ordered list of stops plus the road geometry the
 * shuttle follows. Loop routes return to their first stop and repeat.
 */
export interface Route {
  id: string;
  name: string;
  color: string;
  stopIds: string[];
  path: GeoPoint[];
  loop: boolean;
  nominalSpeedKmh: number;
  dwellSeconds: number;
  active: boolean;
  updatedAt: number;
}

export interface Shuttle {
  id: string;
  label: string;
  plate: string;
  capacity: number;
  active: boolean;
}

export type RoutePatch = Partial<Pick<Route, 'name' | 'color' | 'nominalSpeedKmh' | 'dwellSeconds' | 'active'>>;

export interface NewRouteInput {
  name: string;
  color: string;
  stopIds: string[];
  loop: boolean;
  nominalSpeedKmh: number;
  dwellSeconds: number;
}
