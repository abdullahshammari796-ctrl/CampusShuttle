import type { Route, Shuttle, Stop } from '../network/model.ts';
import type { RouteRepository, ShuttleRepository, StopRepository } from '../network/ports.ts';
import { type Database, transaction } from './database.ts';

type Row = Record<string, unknown>;

export class SqliteStopRepository implements StopRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  list(): Stop[] {
    return (this.db.prepare('SELECT * FROM stops ORDER BY name').all() as Row[]).map(toStop);
  }

  get(id: string): Stop | null {
    const row = this.db.prepare('SELECT * FROM stops WHERE id = ?').get(id) as Row | undefined;
    return row ? toStop(row) : null;
  }

  insert(stop: Stop): void {
    this.db.prepare('INSERT INTO stops (id, name, lat, lng, description) VALUES (?, ?, ?, ?, ?)').run(stop.id, stop.name, stop.lat, stop.lng, stop.description);
  }
}

export class SqliteRouteRepository implements RouteRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  list(): Route[] {
    const rows = this.db.prepare('SELECT * FROM routes ORDER BY name').all() as Row[];
    return rows.map((row) => this.toRoute(row));
  }

  get(id: string): Route | null {
    const row = this.db.prepare('SELECT * FROM routes WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toRoute(row) : null;
  }

  save(route: Route): void {
    transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO routes (id, name, color, path_json, loop, nominal_speed_kmh, dwell_seconds, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, path_json = excluded.path_json,
             loop = excluded.loop, nominal_speed_kmh = excluded.nominal_speed_kmh, dwell_seconds = excluded.dwell_seconds,
             active = excluded.active, updated_at = excluded.updated_at`,
        )
        .run(route.id, route.name, route.color, JSON.stringify(route.path), route.loop ? 1 : 0, route.nominalSpeedKmh, route.dwellSeconds, route.active ? 1 : 0, route.updatedAt);
      this.db.prepare('DELETE FROM route_stops WHERE route_id = ?').run(route.id);
      const insert = this.db.prepare('INSERT INTO route_stops (route_id, seq, stop_id) VALUES (?, ?, ?)');
      route.stopIds.forEach((stopId, seq) => insert.run(route.id, seq, stopId));
    });
  }

  private toRoute(row: Row): Route {
    const stops = this.db.prepare('SELECT stop_id FROM route_stops WHERE route_id = ? ORDER BY seq').all(row.id as string) as Row[];
    return {
      id: row.id as string,
      name: row.name as string,
      color: row.color as string,
      stopIds: stops.map((s) => s.stop_id as string),
      path: JSON.parse(row.path_json as string),
      loop: row.loop === 1,
      nominalSpeedKmh: row.nominal_speed_kmh as number,
      dwellSeconds: row.dwell_seconds as number,
      active: row.active === 1,
      updatedAt: row.updated_at as number,
    };
  }
}

export class SqliteShuttleRepository implements ShuttleRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  list(): Shuttle[] {
    return (this.db.prepare('SELECT * FROM shuttles ORDER BY label').all() as Row[]).map(toShuttle);
  }

  get(id: string): Shuttle | null {
    const row = this.db.prepare('SELECT * FROM shuttles WHERE id = ?').get(id) as Row | undefined;
    return row ? toShuttle(row) : null;
  }

  insert(shuttle: Shuttle): void {
    this.db.prepare('INSERT INTO shuttles (id, label, plate, capacity, active) VALUES (?, ?, ?, ?, ?)').run(shuttle.id, shuttle.label, shuttle.plate, shuttle.capacity, shuttle.active ? 1 : 0);
  }
}

function toStop(row: Row): Stop {
  return { id: row.id as string, name: row.name as string, lat: row.lat as number, lng: row.lng as number, description: row.description as string };
}

function toShuttle(row: Row): Shuttle {
  return { id: row.id as string, label: row.label as string, plate: row.plate as string, capacity: row.capacity as number, active: row.active === 1 };
}
