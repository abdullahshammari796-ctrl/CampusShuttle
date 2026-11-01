import type { HourlyDemand, WaitingRequest, WaitingStatus } from '../demand/model.ts';
import type { DemandHistoryRepository, WaitingRequestRepository } from '../demand/ports.ts';
import { addDays } from '../shared/clock.ts';
import { type Database, transaction, withConflict } from './database.ts';

type Row = Record<string, unknown>;

export class SqliteWaitingRequestRepository implements WaitingRequestRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  insert(r: WaitingRequest): void {
    withConflict('You already have an open waiting request.', () => {
      this.db
        .prepare('INSERT INTO waiting_requests (id, stop_id, route_id, requester_ref, status, created_at, expires_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.id, r.stopId, r.routeId, r.requesterRef, r.status, r.createdAt, r.expiresAt, r.closedAt);
    });
  }

  update(r: WaitingRequest): void {
    this.db.prepare('UPDATE waiting_requests SET status = ?, closed_at = ?, requester_ref = ? WHERE id = ?').run(r.status, r.closedAt, r.requesterRef, r.id);
  }

  get(id: string): WaitingRequest | null {
    const row = this.db.prepare('SELECT * FROM waiting_requests WHERE id = ?').get(id) as Row | undefined;
    return row ? toRequest(row) : null;
  }

  findActiveByRequester(requesterRef: string): WaitingRequest | null {
    const row = this.db.prepare("SELECT * FROM waiting_requests WHERE requester_ref = ? AND status = 'WAITING'").get(requesterRef) as Row | undefined;
    return row ? toRequest(row) : null;
  }

  latestByRequester(requesterRef: string): WaitingRequest | null {
    const row = this.db.prepare('SELECT * FROM waiting_requests WHERE requester_ref = ? ORDER BY created_at DESC LIMIT 1').get(requesterRef) as Row | undefined;
    return row ? toRequest(row) : null;
  }

  listActive(): WaitingRequest[] {
    return (this.db.prepare("SELECT * FROM waiting_requests WHERE status = 'WAITING' ORDER BY created_at").all() as Row[]).map(toRequest);
  }

  countCreatedSince(requesterRef: string, since: number): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM waiting_requests WHERE requester_ref = ? AND created_at >= ?').get(requesterRef, since) as { n: number };
    return row.n;
  }

  deidentifyClosedBefore(cutoff: number): number {
    const result = this.db
      .prepare("UPDATE waiting_requests SET requester_ref = NULL WHERE status <> 'WAITING' AND requester_ref IS NOT NULL AND closed_at < ?")
      .run(cutoff);
    return Number(result.changes);
  }
}

/** Demand history = synthetic demo rows + live waiting requests aggregated per local hour. */
export class SqliteDemandHistoryRepository implements DemandHistoryRepository {
  private readonly db: Database;
  private readonly offsetSeconds: number;

  constructor(db: Database, timezoneOffsetMinutes: number) {
    this.db = db;
    this.offsetSeconds = timezoneOffsetMinutes * 60;
  }

  load(fromDate: string, toDate: string): { rows: HourlyDemand[]; coveredDates: string[] } {
    const stored = this.db
      .prepare('SELECT stop_id, date, hour, count, source FROM demand_observations WHERE date BETWEEN ? AND ?')
      .all(fromDate, toDate) as Row[];
    const fromMs = Date.parse(`${fromDate}T00:00:00Z`) - this.offsetSeconds * 1000;
    const toMs = Date.parse(`${addDays(toDate, 1)}T00:00:00Z`) - this.offsetSeconds * 1000;
    const live = this.db
      .prepare(
        `SELECT stop_id,
                strftime('%Y-%m-%d', created_at / 1000 + ?, 'unixepoch') AS date,
                CAST(strftime('%H', created_at / 1000 + ?, 'unixepoch') AS INTEGER) AS hour,
                COUNT(*) AS count
         FROM waiting_requests WHERE created_at >= ? AND created_at < ?
         GROUP BY stop_id, date, hour`,
      )
      .all(this.offsetSeconds, this.offsetSeconds, fromMs, toMs) as Row[];
    const operatingDays = this.db
      .prepare(`SELECT DISTINCT strftime('%Y-%m-%d', started_at / 1000 + ?, 'unixepoch') AS date FROM trips WHERE started_at >= ? AND started_at < ?`)
      .all(this.offsetSeconds, fromMs, toMs) as Row[];

    const rows: HourlyDemand[] = [
      ...stored.map((r) => ({ stopId: r.stop_id as string, date: r.date as string, hour: r.hour as number, count: r.count as number, source: r.source as HourlyDemand['source'] })),
      ...live.map((r) => ({ stopId: r.stop_id as string, date: r.date as string, hour: r.hour as number, count: r.count as number, source: 'live' as const })),
    ];
    const covered = new Set<string>(rows.map((r) => r.date));
    for (const r of operatingDays) covered.add(r.date as string);
    return { rows, coveredDates: [...covered].sort() };
  }

  replaceSynthetic(rows: readonly HourlyDemand[]): void {
    transaction(this.db, () => {
      this.db.prepare("DELETE FROM demand_observations WHERE source = 'synthetic'").run();
      const insert = this.db.prepare('INSERT INTO demand_observations (stop_id, date, hour, count, source) VALUES (?, ?, ?, ?, ?)');
      for (const r of rows) insert.run(r.stopId, r.date, r.hour, r.count, 'synthetic');
    });
  }
}

function toRequest(row: Row): WaitingRequest {
  return {
    id: row.id as string,
    stopId: row.stop_id as string,
    routeId: (row.route_id as string | null) ?? null,
    requesterRef: (row.requester_ref as string | null) ?? null,
    status: row.status as WaitingStatus,
    createdAt: row.created_at as number,
    expiresAt: row.expires_at as number,
    closedAt: (row.closed_at as number | null) ?? null,
  };
}
