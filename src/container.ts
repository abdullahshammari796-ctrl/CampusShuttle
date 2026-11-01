import type { AppConfig } from './config.ts';
import { DemandService } from './demand/demand-service.ts';
import { HourOfDayMeanPredictor, SeasonalAveragePredictor, WeightedSeasonalPredictor } from './demand/prediction/predictors.ts';
import { SameWeekdayMedianPredictor } from './demand/prediction/same-weekday-median.ts';
import { WaitingService } from './demand/waiting-service.ts';
import { AuthService } from './identity/auth-service.ts';
import { TokenService } from './identity/token-service.ts';
import { NetworkService } from './network/network-service.ts';
import { type Database, isEmpty, openDatabase } from './persistence/database.ts';
import { SqliteDemandHistoryRepository, SqliteWaitingRequestRepository } from './persistence/sqlite-demand.ts';
import { SqliteAuditLog, SqliteUserRepository } from './persistence/sqlite-identity.ts';
import { SqliteRouteRepository, SqliteShuttleRepository, SqliteStopRepository } from './persistence/sqlite-network.ts';
import { SqliteLocationFixRepository, SqliteTripRepository } from './persistence/sqlite-tracking.ts';
import { LiveView } from './realtime/live-view.ts';
import { SseHub } from './realtime/sse-hub.ts';
import { type SeedSummary, seedDemoData } from './seed/seed.ts';
import { type Clock, systemClock } from './shared/clock.ts';
import { EventBus } from './shared/event-bus.ts';
import type { DomainEvent } from './shared/events.ts';
import { BlendedSpeedEta } from './tracking/eta/blended-speed-eta.ts';
import type { EtaStrategy } from './tracking/eta/eta-strategy.ts';
import { NominalSpeedEta } from './tracking/eta/nominal-speed-eta.ts';
import { TrackingService } from './tracking/tracking-service.ts';
import { createApp } from './web/app.ts';

export interface Container {
  config: AppConfig;
  clock: Clock;
  db: Database;
  bus: EventBus<DomainEvent>;
  auth: AuthService;
  network: NetworkService;
  tracking: TrackingService;
  waiting: WaitingService;
  demand: DemandService;
  hub: SseHub;
  app: ReturnType<typeof createApp>;
  seeded: SeedSummary | null;
  recoveredTrips: number;
  /** Runs one round of every periodic job (used by tests and by the timers). */
  runJobs(kind: 'signals' | 'expiry' | 'retention'): void;
  startBackgroundJobs(): void;
  stop(): void;
}

/**
 * Composition root: the only place that knows concrete classes. Every
 * module receives its collaborators through constructor injection, which is
 * what lets tests swap the clock, the database file or an ETA strategy.
 */
export async function buildContainer(config: AppConfig, options: { clock?: Clock } = {}): Promise<Container> {
  const clock = options.clock ?? systemClock;
  const db = openDatabase(config.dbFile);
  const seeded = config.seedOnEmpty && isEmpty(db)
    ? await seedDemoData(db, { now: clock.now(), timezoneOffsetMinutes: config.timezoneOffsetMinutes, serviceHours: config.serviceHours })
    : null;

  const bus = new EventBus<DomainEvent>();
  const audit = new SqliteAuditLog(db);
  const tokens = new TokenService(config.sessionSecret, config.sessionTtlMs);
  const auth = new AuthService(new SqliteUserRepository(db), tokens, clock, config.auth);

  const network = new NetworkService({
    stops: new SqliteStopRepository(db),
    routes: new SqliteRouteRepository(db),
    shuttles: new SqliteShuttleRepository(db),
    events: bus,
    clock,
    audit,
  });

  const eta: EtaStrategy = config.etaStrategy === 'nominal-speed' ? new NominalSpeedEta() : new BlendedSpeedEta();
  const tracking = new TrackingService({
    trips: new SqliteTripRepository(db),
    fixes: new SqliteLocationFixRepository(db),
    network,
    users: { displayName: (id) => auth.displayName(id) },
    events: bus,
    clock,
    eta,
    audit,
    config: config.tracking,
  });

  const waiting = new WaitingService({
    waiting: new SqliteWaitingRequestRepository(db),
    network,
    events: bus,
    clock,
    pseudonymize: (userId) => tokens.pseudonymize('waiting', userId),
    config: config.waiting,
  });

  const demand = new DemandService({
    history: new SqliteDemandHistoryRepository(db, config.timezoneOffsetMinutes),
    network,
    predictors: [new SeasonalAveragePredictor(), new WeightedSeasonalPredictor(), new HourOfDayMeanPredictor(), new SameWeekdayMedianPredictor()],
    clock,
    timezoneOffsetMinutes: config.timezoneOffsetMinutes,
    serviceHours: config.serviceHours,
  });

  // Cross-module reaction wired through the event bus (Observer): a shuttle
  // reaching a stop closes the waiting requests there.
  bus.subscribe('stop.arrived', (e) => waiting.markServed(e.stopId, e.routeId));

  const hub = new SseHub(bus, new LiveView(tracking, waiting), clock, config.sse);
  const recoveredTrips = tracking.recover();
  const startedAt = clock.now();

  const app = createApp({
    auth,
    network,
    tracking,
    waiting,
    demand,
    hub,
    audit,
    clock,
    settings: { publicDir: config.publicDir, secureCookies: config.secureCookies, sessionTtlMs: config.sessionTtlMs },
    systemInfo: () => ({
      serverTime: clock.now(),
      uptimeSeconds: Math.round((clock.now() - startedAt) / 1000),
      etaStrategy: { id: eta.id, description: eta.description },
      thresholds: { staleAfterSeconds: config.tracking.staleAfterMs / 1000, lostAfterSeconds: config.tracking.lostAfterMs / 1000, abandonAfterMinutes: config.tracking.abandonAfterMs / 60_000 },
      retention: config.retention,
      waitingTtlMinutes: config.waiting.ttlMinutes,
      eventBus: bus.stats(),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    }),
  });

  const timers: NodeJS.Timeout[] = [];
  const runJobs = (kind: 'signals' | 'expiry' | 'retention') => {
    if (kind === 'signals') tracking.checkSignals();
    if (kind === 'expiry') waiting.expireDue();
    if (kind === 'retention') {
      tracking.purgeFixesOlderThan(config.retention.locationFixDays);
      waiting.deidentifyClosed(config.retention.waitingDeidentifyHours * 3600_000);
    }
  };

  return {
    config, clock, db, bus, auth, network, tracking, waiting, demand, hub, app, seeded, recoveredTrips, runJobs,
    startBackgroundJobs() {
      const every = (ms: number, kind: 'signals' | 'expiry' | 'retention') => {
        const timer = setInterval(() => {
          try {
            runJobs(kind);
          } catch (error) {
            console.error(`[jobs] ${kind} failed:`, error);
          }
        }, ms);
        timer.unref();
        timers.push(timer);
      };
      every(config.monitorIntervalMs, 'signals');
      every(15_000, 'expiry');
      every(3600_000, 'retention');
      runJobs('retention');
      hub.startHeartbeat();
    },
    stop() {
      for (const t of timers) clearInterval(t);
      hub.close();
      db.close();
    },
  };
}
