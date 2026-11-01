import { conflict } from '../shared/errors.ts';

export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

export const OCCUPANCY_LEVELS = ['SEATS_AVAILABLE', 'FILLING_UP', 'FULL'] as const;
export type OccupancyLevel = (typeof OCCUPANCY_LEVELS)[number];

export type FixSource = 'device' | 'simulator';

/** One shuttle run on one route by one driver. */
export interface Trip {
  id: string;
  routeId: string;
  shuttleId: string;
  driverId: string;
  status: TripStatus;
  occupancy: OccupancyLevel;
  startedAt: number;
  endedAt: number | null;
  endReason: string | null;
}

/** A GPS position accepted for a trip. Times are server-corrected epoch ms. */
export interface LocationFix {
  tripId: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  recordedAt: number;
  receivedAt: number;
  source: FixSource;
}

/** A GPS position as submitted by the driver app (device clock). */
export interface FixInput {
  lat: number;
  lng: number;
  speedKmh?: number | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
  recordedAt: number;
  source?: FixSource;
}

export type TripEndReason = 'DRIVER_ENDED' | 'OFFICE_TERMINATED' | 'NO_SIGNAL_TIMEOUT';

/** Trip lifecycle rules: only an ACTIVE trip can change, and it ends exactly once. */
export function assertActive(trip: Trip): void {
  if (trip.status !== 'ACTIVE') throw conflict(`Trip ${trip.id} is already ${trip.status.toLowerCase()}.`);
}

export function endTrip(trip: Trip, at: number, reason: TripEndReason): Trip {
  assertActive(trip);
  return {
    ...trip,
    status: reason === 'DRIVER_ENDED' ? 'COMPLETED' : 'TERMINATED',
    endedAt: at,
    endReason: reason,
  };
}
