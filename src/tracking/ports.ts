import type { LocationFix, Trip, TripStatus } from './model.ts';

/** Persistence ports for the tracking module (Repository pattern). */
export interface TripRepository {
  /** Must reject a second ACTIVE trip for the same shuttle or driver with a CONFLICT error. */
  insert(trip: Trip): void;
  update(trip: Trip): void;
  get(id: string): Trip | null;
  listActive(): Trip[];
  listRecent(options: { limit: number; status?: TripStatus }): Trip[];
}

export interface LocationFixRepository {
  appendMany(fixes: readonly LocationFix[]): void;
  lastForTrip(tripId: string): LocationFix | null;
  listForTrip(tripId: string): LocationFix[];
  purgeOlderThan(cutoffMs: number): number;
}

/** Resolves display names for office views without coupling to the identity module. */
export interface UserDirectory {
  displayName(userId: string): string | null;
}
