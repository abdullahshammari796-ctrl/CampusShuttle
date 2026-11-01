import type { Route } from '../../network/model.ts';
import type { RoutePath } from '../../network/route-path.ts';

/** Everything an ETA strategy may use. Pure data, no I/O. */
export interface EtaContext {
  route: Route;
  path: RoutePath;
  /** Progress along the route at the moment of the last accepted fix. */
  distanceAlong: number;
  /** Smoothed speed observed while moving (m/s), or null if not yet known. */
  observedSpeedMps: number | null;
  speedSamples: number;
  /** Time the progress value refers to (epoch ms). */
  at: number;
}

export interface StopEta {
  stopId: string;
  sequence: number;
  distanceMeters: number;
  etaSeconds: number;
  arrivalAt: number;
}

/**
 * Strategy pattern: interchangeable ETA algorithms behind one interface.
 * The tracking service is configured with one strategy at composition time;
 * new algorithms (e.g. one using historical segment times) plug in without
 * touching the service.
 */
export interface EtaStrategy {
  readonly id: string;
  readonly description: string;
  estimate(ctx: EtaContext): StopEta[];
}

/** Shared arithmetic: travel time at a given speed plus dwell time at each intermediate stop. */
export function etasAtSpeed(ctx: EtaContext, speedMps: number): StopEta[] {
  const upcoming = ctx.path.upcomingStops(ctx.distanceAlong);
  return upcoming.map((stop, index) => {
    const etaSeconds = Math.round(stop.distanceAhead / speedMps + index * ctx.route.dwellSeconds);
    return {
      stopId: stop.stopId,
      sequence: stop.sequence,
      distanceMeters: Math.round(stop.distanceAhead),
      etaSeconds,
      arrivalAt: ctx.at + etaSeconds * 1000,
    };
  });
}

export const kmhToMps = (kmh: number): number => kmh / 3.6;
