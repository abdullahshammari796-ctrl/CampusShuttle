import type { LocationFix, Trip, TripStatus } from '../tracking/model.ts';
import type { LocationFixRepository, TripRepository } from '../tracking/ports.ts';
import { type Database, transaction, withConflict } from './database.ts';

type Row = Record<string, unknown>;

export class SqliteTripRepository implements TripRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  insert(trip: Trip): void {
    withConflict('That shuttle or driver is already on an active trip.', () => {
      this.db
        .prepare('INSERT INTO trips (id, route_id, shuttle_id, driver_id, status, occupancy, started_at, ended_at, end_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(trip.id, trip.routeId, trip.shuttleId, trip.driverId, trip.status, trip.occupancy, trip.startedAt, trip.endedAt, trip.endReason);
    });
  }

  update(trip: Trip): void {
    this.db
      .prepare('UPDATE trips SET status = ?, occupancy = ?, ended_at = ?, end_reason = ? WHERE id = ?')
      .run(trip.status, trip.occupancy, trip.endedAt, trip.endReason, trip.id);
  }

  get(id: string): Trip | null {
    const row = this.db.prepare('SELECT * FROM trips WHERE id = ?').get(id) as Row | undefined;
    return row ? toTrip(row) : null;
  }

  listActive(): Trip[] {
    return (this.db.prepare("SELECT * FROM trips WHERE status = 'ACTIVE' ORDER BY started_at").all() as Row[]).map(toTrip);
  }

  listRecent(options: { limit: number; status?: TripStatus }): Trip[] {
    const rows = options.status
      ? this.db.prepare('SELECT * FROM trips WHERE status = ? ORDER BY started_at DESC LIMIT ?').all(options.status, options.limit)
      : this.db.prepare('SELECT * FROM trips ORDER BY started_at DESC LIMIT ?').all(options.limit);
    return (rows as Row[]).map(toTrip);
  }
}

export class SqliteLocationFixRepository implements LocationFixRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  appendMany(fixes: readonly LocationFix[]): void {
    transaction(this.db, () => {
      const insert = this.db.prepare(
        'INSERT INTO location_fixes (trip_id, lat, lng, speed_kmh, heading_deg, accuracy_m, recorded_at, received_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const f of fixes) insert.run(f.tripId, f.lat, f.lng, f.speedKmh, f.headingDeg, f.accuracyM, f.recordedAt, f.receivedAt, f.source);
    });
  }

  lastForTrip(tripId: string): LocationFix | null {
    const row = this.db.prepare('SELECT * FROM location_fixes WHERE trip_id = ? ORDER BY recorded_at DESC LIMIT 1').get(tripId) as Row | undefined;
    return row ? toFix(row) : null;
  }

  listForTrip(tripId: string): LocationFix[] {
    return (this.db.prepare('SELECT * FROM location_fixes WHERE trip_id = ? ORDER BY recorded_at').all(tripId) as Row[]).map(toFix);
  }

  purgeOlderThan(cutoffMs: number): number {
    const result = this.db.prepare('DELETE FROM location_fixes WHERE received_at < ?').run(cutoffMs);
    return Number(result.changes);
  }
}

function toTrip(row: Row): Trip {
  return {
    id: row.id as string,
    routeId: row.route_id as string,
    shuttleId: row.shuttle_id as string,
    driverId: row.driver_id as string,
    status: row.status as TripStatus,
    occupancy: row.occupancy as Trip['occupancy'],
    startedAt: row.started_at as number,
    endedAt: (row.ended_at as number | null) ?? null,
    endReason: (row.end_reason as string | null) ?? null,
  };
}

function toFix(row: Row): LocationFix {
  return {
    tripId: row.trip_id as string,
    lat: row.lat as number,
    lng: row.lng as number,
    speedKmh: (row.speed_kmh as number | null) ?? null,
    headingDeg: (row.heading_deg as number | null) ?? null,
    accuracyM: (row.accuracy_m as number | null) ?? null,
    recordedAt: row.recorded_at as number,
    receivedAt: row.received_at as number,
    source: row.source as LocationFix['source'],
  };
}
