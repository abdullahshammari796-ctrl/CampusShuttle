import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { conflict } from '../shared/errors.ts';

export type Database = DatabaseSync;

/** Ordered schema migrations; PRAGMA user_version records how many have run. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'driver', 'office')),
    password_hash TEXT NOT NULL
  );

  CREATE TABLE stops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    path_json TEXT NOT NULL,
    loop INTEGER NOT NULL,
    nominal_speed_kmh REAL NOT NULL,
    dwell_seconds INTEGER NOT NULL,
    active INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE route_stops (
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    stop_id TEXT NOT NULL REFERENCES stops(id),
    PRIMARY KEY (route_id, seq)
  );

  CREATE TABLE shuttles (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    plate TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id),
    shuttle_id TEXT NOT NULL REFERENCES shuttles(id),
    driver_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'TERMINATED')),
    occupancy TEXT NOT NULL CHECK (occupancy IN ('SEATS_AVAILABLE', 'FILLING_UP', 'FULL')),
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    end_reason TEXT
  );
  -- Consistency rules enforced by the database itself:
  -- a shuttle and a driver can each be on at most one active trip.
  CREATE UNIQUE INDEX ux_trips_active_shuttle ON trips(shuttle_id) WHERE status = 'ACTIVE';
  CREATE UNIQUE INDEX ux_trips_active_driver ON trips(driver_id) WHERE status = 'ACTIVE';
  CREATE INDEX ix_trips_started ON trips(started_at);

  CREATE TABLE location_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id TEXT NOT NULL REFERENCES trips(id),
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed_kmh REAL,
    heading_deg REAL,
    accuracy_m REAL,
    recorded_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('device', 'simulator'))
  );
  CREATE INDEX ix_fixes_trip_time ON location_fixes(trip_id, recorded_at);
  CREATE INDEX ix_fixes_received ON location_fixes(received_at);

  CREATE TABLE waiting_requests (
    id TEXT PRIMARY KEY,
    stop_id TEXT NOT NULL REFERENCES stops(id),
    route_id TEXT REFERENCES routes(id),
    requester_ref TEXT,
    status TEXT NOT NULL CHECK (status IN ('WAITING', 'CANCELLED', 'EXPIRED', 'SERVED')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    closed_at INTEGER
  );
  -- One open request per (pseudonymous) student.
  CREATE UNIQUE INDEX ux_waiting_active ON waiting_requests(requester_ref) WHERE status = 'WAITING';
  CREATE INDEX ix_waiting_status ON waiting_requests(status);
  CREATE INDEX ix_waiting_created ON waiting_requests(created_at);

  CREATE TABLE demand_observations (
    stop_id TEXT NOT NULL REFERENCES stops(id),
    date TEXT NOT NULL,
    hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
    count INTEGER NOT NULL CHECK (count >= 0),
    source TEXT NOT NULL CHECK (source IN ('synthetic', 'live')),
    PRIMARY KEY (stop_id, date, hour, source)
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT NOT NULL
  );
  `,
];

export function openDatabase(file: string): Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let i = version; i < MIGRATIONS.length; i++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

/** Runs `work` atomically. Nested calls join the outer transaction. */
export function transaction<T>(db: Database, work: () => T): T {
  if (db.isTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Translates SQLite unique-constraint failures into domain CONFLICT errors. */
export function withConflict<T>(message: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw conflict(message);
    throw error;
  }
}

export function isEmpty(db: Database): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  return row.n === 0;
}
