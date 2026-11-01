import { conflict } from '../shared/errors.ts';
import type { LocationFix, Trip, TripStatus } from '../tracking/model.ts';
import type { LocationFixRepository, TripRepository } from '../tracking/ports.ts';

/**
 * In-memory implementations of the tracking repositories. They demonstrate
 * that the service depends on the port, not on SQLite, and make unit tests
 * of TrackingService independent of a database.
 */
export class InMemoryTripRepository implements TripRepository {
  private readonly trips = new Map<string, Trip>();

  insert(trip: Trip): void {
    for (const t of this.trips.values()) {
      if (t.status === 'ACTIVE' && trip.status === 'ACTIVE' && (t.shuttleId === trip.shuttleId || t.driverId === trip.driverId)) {
        throw conflict('That shuttle or driver is already on an active trip.');
      }
    }
    this.trips.set(trip.id, { ...trip });
  }

  update(trip: Trip): void {
    this.trips.set(trip.id, { ...trip });
  }

  get(id: string): Trip | null {
    const trip = this.trips.get(id);
    return trip ? { ...trip } : null;
  }

  listActive(): Trip[] {
    return [...this.trips.values()].filter((t) => t.status === 'ACTIVE').map((t) => ({ ...t }));
  }

  listRecent(options: { limit: number; status?: TripStatus }): Trip[] {
    return [...this.trips.values()]
      .filter((t) => !options.status || t.status === options.status)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, options.limit)
      .map((t) => ({ ...t }));
  }
}

export class InMemoryLocationFixRepository implements LocationFixRepository {
  readonly fixes: LocationFix[] = [];

  appendMany(fixes: readonly LocationFix[]): void {
    this.fixes.push(...fixes.map((f) => ({ ...f })));
  }

  lastForTrip(tripId: string): LocationFix | null {
    const list = this.listForTrip(tripId);
    return list.length ? list[list.length - 1] : null;
  }

  listForTrip(tripId: string): LocationFix[] {
    return this.fixes.filter((f) => f.tripId === tripId).sort((a, b) => a.recordedAt - b.recordedAt);
  }

  purgeOlderThan(cutoffMs: number): number {
    const before = this.fixes.length;
    const keep = this.fixes.filter((f) => f.receivedAt >= cutoffMs);
    this.fixes.splice(0, this.fixes.length, ...keep);
    return before - keep.length;
  }
}
