import { hashPassword } from '../identity/password-hasher.ts';
import { type Database, transaction } from '../persistence/database.ts';
import { SqliteDemandHistoryRepository } from '../persistence/sqlite-demand.ts';
import { SqliteUserRepository } from '../persistence/sqlite-identity.ts';
import { SqliteRouteRepository, SqliteShuttleRepository, SqliteStopRepository } from '../persistence/sqlite-network.ts';
import { addDays, localDateHour } from '../shared/clock.ts';
import { DEMO_ROUTES, DEMO_SHUTTLES, DEMO_STOPS, DEMO_USERS, SYNTHETIC_STOP_WEIGHTS } from './demo-data.ts';
import { generateSyntheticDemand } from './synthetic-demand.ts';

export interface SeedOptions {
  now: number;
  timezoneOffsetMinutes: number;
  serviceHours: { first: number; last: number };
  syntheticDays?: number;
}

export interface SeedSummary {
  stops: number;
  routes: number;
  shuttles: number;
  users: number;
  syntheticRows: number;
  syntheticFrom: string;
  syntheticTo: string;
}

/** Loads the demo network, demo accounts and 8 weeks of SYNTHETIC demand history. */
export async function seedDemoData(db: Database, options: SeedOptions): Promise<SeedSummary> {
  const users = await Promise.all(
    DEMO_USERS.map(async (u) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, passwordHash: await hashPassword(u.password) })),
  );
  const days = options.syntheticDays ?? 56;
  const yesterday = addDays(localDateHour(options.now, options.timezoneOffsetMinutes).date, -1);
  const synthetic = generateSyntheticDemand({ endDate: yesterday, days, stopWeights: SYNTHETIC_STOP_WEIGHTS, serviceHours: options.serviceHours });

  transaction(db, () => {
    const stops = new SqliteStopRepository(db);
    const routes = new SqliteRouteRepository(db);
    const shuttles = new SqliteShuttleRepository(db);
    const userRepo = new SqliteUserRepository(db);
    for (const s of DEMO_STOPS) stops.insert(s);
    for (const r of DEMO_ROUTES) routes.save({ ...r, updatedAt: options.now });
    for (const s of DEMO_SHUTTLES) shuttles.insert(s);
    for (const u of users) userRepo.insert(u);
    new SqliteDemandHistoryRepository(db, options.timezoneOffsetMinutes).replaceSynthetic(synthetic);
  });

  return {
    stops: DEMO_STOPS.length,
    routes: DEMO_ROUTES.length,
    shuttles: DEMO_SHUTTLES.length,
    users: users.length,
    syntheticRows: synthetic.length,
    syntheticFrom: addDays(yesterday, -(days - 1)),
    syntheticTo: yesterday,
  };
}

/** Deletes every row (keeps the schema). */
export function clearDatabase(db: Database): void {
  transaction(db, () => {
    for (const table of ['audit_log', 'demand_observations', 'waiting_requests', 'location_fixes', 'trips', 'route_stops', 'routes', 'shuttles', 'stops', 'users']) {
      db.exec(`DELETE FROM ${table}`);
    }
  });
}
