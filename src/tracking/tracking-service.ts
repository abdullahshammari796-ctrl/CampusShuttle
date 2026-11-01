import { randomUUID } from 'node:crypto';
import type { NetworkReader } from '../network/ports.ts';
import type { AuditLog } from '../shared/audit.ts';
import type { Clock } from '../shared/clock.ts';
import { conflict, forbidden, notFound, validationError } from '../shared/errors.ts';
import type { EventPublisher } from '../shared/event-bus.ts';
import type { DomainEvent } from '../shared/events.ts';
import { haversineMeters, isValidCoordinate } from '../shared/geo.ts';
import type { EtaStrategy } from './eta/eta-strategy.ts';
import {
  type FixSource, type LocationFix, OCCUPANCY_LEVELS, type OccupancyLevel, type Trip, type TripEndReason, type TripStatus,
  assertActive, endTrip,
} from './model.ts';
import type { LocationFixRepository, TripRepository, UserDirectory } from './ports.ts';
import type { SignalStatus, SignalThresholds } from './signal-state.ts';
import { type TrackerOptions, TripTracker } from './trip-tracker.ts';
import type { ArrivalView, OfficeTripView, TripHistoryItem, TripTrack, VehicleView } from './views.ts';

export interface TrackingConfig extends SignalThresholds {
  /** An active trip with no fix for this long is closed automatically. */
  abandonAfterMs: number;
  maxBatchSize: number;
  /** Buffered fixes older than this are no longer useful and are dropped. */
  maxFixAgeMs: number;
  maxAccuracyM: number;
  tracker: TrackerOptions;
}

export interface TrackingDeps {
  trips: TripRepository;
  fixes: LocationFixRepository;
  network: NetworkReader;
  users: UserDirectory;
  events: EventPublisher<DomainEvent>;
  clock: Clock;
  eta: EtaStrategy;
  audit: AuditLog;
  config: TrackingConfig;
}

export type FixRejectionReason =
  | 'INVALID' | 'TOO_OLD' | 'LOW_ACCURACY' | 'OUT_OF_SERVICE_AREA'
  | 'OUT_OF_ORDER' | 'TOO_FREQUENT' | 'IMPLAUSIBLE_JUMP';

export interface RecordFixesResult {
  accepted: number;
  rejected: Array<{ index: number; reason: FixRejectionReason }>;
  clockOffsetMs: number;
  vehicle: VehicleView;
}

const MAX_CLOCK_CORRECTION_MS = 24 * 3600_000;

/**
 * Application service for the "run a trip" and "track a shuttle" use cases.
 * Owns the in-memory live state (one TripTracker per active trip); the
 * database is the system of record and is written before memory changes.
 */
export class TrackingService {
  private readonly deps: TrackingDeps;
  private readonly trackers = new Map<string, TripTracker>();

  constructor(deps: TrackingDeps) {
    this.deps = deps;
  }

  /** Rebuilds live state from the database after a restart. Returns the number of trips recovered. */
  recover(): number {
    const now = this.deps.clock.now();
    for (const trip of this.deps.trips.listActive()) {
      const tracker = new TripTracker(trip, this.deps.network.pathFor(trip.routeId), this.deps.config.tracker);
      const last = this.deps.fixes.lastForTrip(trip.id);
      if (last) tracker.restore(last);
      tracker.tick(now, this.deps.config);
      this.trackers.set(trip.id, tracker);
    }
    return this.trackers.size;
  }

  startTrip(driverId: string, input: { routeId: unknown; shuttleId: unknown }): Trip {
    const route = typeof input.routeId === 'string' ? this.deps.network.getRoute(input.routeId) : null;
    if (!route) throw notFound('Route not found.');
    if (!route.active) throw conflict(`${route.name} is not in service.`);
    const shuttle = typeof input.shuttleId === 'string' ? this.deps.network.getShuttle(input.shuttleId) : null;
    if (!shuttle || !shuttle.active) throw notFound('Shuttle not found.');
    for (const tracker of this.trackers.values()) {
      if (tracker.trip.driverId === driverId) throw conflict('You already have an active trip. End it before starting another.');
      if (tracker.trip.shuttleId === shuttle.id) throw conflict(`${shuttle.label} is already on an active trip.`);
    }

    const now = this.deps.clock.now();
    const trip: Trip = {
      id: randomUUID(),
      routeId: route.id,
      shuttleId: shuttle.id,
      driverId,
      status: 'ACTIVE',
      occupancy: 'SEATS_AVAILABLE',
      startedAt: now,
      endedAt: null,
      endReason: null,
    };
    this.deps.trips.insert(trip); // unique indexes are the final guard against races
    this.trackers.set(trip.id, new TripTracker(trip, this.deps.network.pathFor(route.id), this.deps.config.tracker));
    this.deps.events.publish({ type: 'trip.started', tripId: trip.id, routeId: route.id, shuttleId: shuttle.id, at: now });
    return trip;
  }

  /**
   * Accepts a batch of GPS fixes (live or flushed from the driver app's
   * offline queue). `sentAt` is the device clock at upload time; the
   * difference to server time corrects device clock skew for every fix.
   */
  recordFixes(driverId: string, tripId: string, inputs: unknown, sentAt?: unknown): RecordFixesResult {
    const tracker = this.ownedTracker(driverId, tripId);
    if (!Array.isArray(inputs) || inputs.length === 0) throw validationError('fixes must be a non-empty array.');
    if (inputs.length > this.deps.config.maxBatchSize) {
      throw validationError(`At most ${this.deps.config.maxBatchSize} fixes per request.`);
    }

    const now = this.deps.clock.now();
    const offset = typeof sentAt === 'number' && Number.isFinite(sentAt) && Math.abs(now - sentAt) < MAX_CLOCK_CORRECTION_MS ? now - sentAt : 0;
    const area = this.deps.network.serviceArea();
    const rejected: RecordFixesResult['rejected'] = [];
    const candidates: Array<{ index: number; fix: LocationFix }> = [];

    inputs.forEach((raw, index) => {
      const parsed = parseFix(raw);
      if (!parsed) return void rejected.push({ index, reason: 'INVALID' });
      const recordedAt = Math.min(now, Math.round(parsed.recordedAt + offset));
      if (now - recordedAt > this.deps.config.maxFixAgeMs) return void rejected.push({ index, reason: 'TOO_OLD' });
      if (parsed.accuracyM !== null && parsed.accuracyM > this.deps.config.maxAccuracyM) {
        return void rejected.push({ index, reason: 'LOW_ACCURACY' });
      }
      if (haversineMeters(area.center, parsed) > area.radiusMeters) return void rejected.push({ index, reason: 'OUT_OF_SERVICE_AREA' });
      candidates.push({ index, fix: { ...parsed, tripId, recordedAt, receivedAt: now } });
    });

    candidates.sort((a, b) => a.fix.recordedAt - b.fix.recordedAt);
    const sequence = tracker.validateSequence(candidates);
    for (const r of sequence.rejected) rejected.push({ index: r.index, reason: r.reason });

    if (sequence.accepted.length > 0) {
      this.deps.fixes.appendMany(sequence.accepted.map((c) => c.fix));
      const previousSignal = tracker.signal.status;
      const reached: string[] = [];
      for (const { fix } of sequence.accepted) reached.push(...tracker.apply(fix));
      tracker.tick(now, this.deps.config); // a flushed backlog can already be stale
      this.deps.events.publish({ type: 'trip.location', tripId, at: now });
      if (tracker.signal.status !== previousSignal) {
        this.deps.events.publish({ type: 'trip.signal', tripId, status: tracker.signal.status, previous: previousSignal, at: now });
      }
      for (const stopId of reached) {
        this.deps.events.publish({ type: 'stop.arrived', tripId, routeId: tracker.trip.routeId, stopId, at: now });
      }
    }

    rejected.sort((a, b) => a.index - b.index);
    return { accepted: sequence.accepted.length, rejected, clockOffsetMs: offset, vehicle: this.view(tracker, now) };
  }

  setOccupancy(driverId: string, tripId: string, level: unknown): Trip {
    const tracker = this.ownedTracker(driverId, tripId);
    if (!OCCUPANCY_LEVELS.includes(level as OccupancyLevel)) throw validationError(`level must be one of ${OCCUPANCY_LEVELS.join(', ')}.`);
    const trip = { ...tracker.trip, occupancy: level as OccupancyLevel };
    this.deps.trips.update(trip);
    tracker.trip = trip;
    this.deps.events.publish({ type: 'trip.occupancy', tripId, level: trip.occupancy, at: this.deps.clock.now() });
    return trip;
  }

  endTrip(driverId: string, tripId: string): Trip {
    const tracker = this.ownedTracker(driverId, tripId);
    return this.close(tracker, 'DRIVER_ENDED');
  }

  terminateTrip(actorId: string, tripId: string, reason: unknown): Trip {
    const tracker = this.trackers.get(tripId);
    if (!tracker) {
      const stored = this.deps.trips.get(tripId);
      if (!stored) throw notFound('Trip not found.');
      assertActive(stored);
      throw notFound('Trip not found.');
    }
    const note = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
    if (note.length < 3) throw validationError('Please give a short reason (at least 3 characters).');
    const ended = this.close(tracker, 'OFFICE_TERMINATED');
    this.deps.audit.record({ at: ended.endedAt ?? this.deps.clock.now(), actorId, action: 'trip.terminate', target: tripId, details: note });
    return ended;
  }

  /** Periodic job: advances every signal state machine and closes abandoned trips. */
  checkSignals(): { changed: number; closed: number } {
    const now = this.deps.clock.now();
    let changed = 0;
    let closed = 0;
    for (const tracker of [...this.trackers.values()]) {
      const previous = tracker.signal.status;
      if (tracker.tick(now, this.deps.config)) {
        changed++;
        this.deps.events.publish({ type: 'trip.signal', tripId: tracker.trip.id, status: tracker.signal.status, previous, at: now });
      }
      if (tracker.ageMs(now) > this.deps.config.abandonAfterMs) {
        this.close(tracker, 'NO_SIGNAL_TIMEOUT');
        closed++;
      }
    }
    return { changed, closed };
  }

  liveVehicles(): VehicleView[] {
    const now = this.deps.clock.now();
    return [...this.trackers.values()].map((t) => this.view(t, now));
  }

  vehicle(tripId: string): VehicleView | null {
    const tracker = this.trackers.get(tripId);
    return tracker ? this.view(tracker, this.deps.clock.now()) : null;
  }

  /** Source of the trip's latest accepted position (null before the first), so a reloaded driver page resumes the same source. */
  lastFixSource(tripId: string): FixSource | null {
    return this.trackers.get(tripId)?.lastFix?.source ?? null;
  }

  activeTripFor(driverId: string): VehicleView | null {
    for (const tracker of this.trackers.values()) {
      if (tracker.trip.driverId === driverId) return this.view(tracker, this.deps.clock.now());
    }
    return null;
  }

  isShuttleBusy(shuttleId: string): boolean {
    return [...this.trackers.values()].some((t) => t.trip.shuttleId === shuttleId);
  }

  /** Upcoming arrivals at one stop across all routes, soonest first. */
  arrivalsAt(stopId: string): ArrivalView[] {
    if (!this.deps.network.getStop(stopId)) throw notFound('Stop not found.');
    const arrivals: ArrivalView[] = [];
    for (const vehicle of this.liveVehicles()) {
      const eta = vehicle.nextStops.find((s) => s.stopId === stopId);
      if (!eta) continue;
      arrivals.push({
        tripId: vehicle.tripId,
        routeId: vehicle.routeId,
        routeName: vehicle.routeName,
        routeColor: vehicle.routeColor,
        shuttleLabel: vehicle.shuttleLabel,
        occupancy: vehicle.occupancy,
        signalStatus: vehicle.signal.status,
        confidence: eta.confidence,
        etaSeconds: eta.etaSeconds,
        arrivalAt: eta.arrivalAt,
        distanceMeters: eta.distanceMeters,
        overdue: eta.overdue,
      });
    }
    return arrivals.sort((a, b) => a.arrivalAt - b.arrivalAt);
  }

  officeTrips(): OfficeTripView[] {
    const now = this.deps.clock.now();
    return [...this.trackers.values()].map((t) => ({
      ...this.view(t, now),
      driverId: t.trip.driverId,
      driverName: this.deps.users.displayName(t.trip.driverId) ?? 'Unknown driver',
    }));
  }

  signalSummary(): Record<SignalStatus, number> {
    const summary: Record<SignalStatus, number> = { AWAITING_FIX: 0, LIVE: 0, STALE: 0, LOST: 0 };
    for (const t of this.trackers.values()) summary[t.signal.status]++;
    return summary;
  }

  tripHistory(options: { limit: number; status?: TripStatus }): TripHistoryItem[] {
    return this.deps.trips.listRecent(options).map((trip) => this.historyItem(trip));
  }

  tripTrack(tripId: string): TripTrack {
    const trip = this.deps.trips.get(tripId);
    if (!trip) throw notFound('Trip not found.');
    const fixes = this.deps.fixes.listForTrip(tripId);
    let distanceMeters = 0;
    let longestGap = 0;
    let gaps = 0;
    for (let i = 1; i < fixes.length; i++) {
      distanceMeters += haversineMeters(fixes[i - 1], fixes[i]);
      const gap = fixes[i].recordedAt - fixes[i - 1].recordedAt;
      longestGap = Math.max(longestGap, gap);
      if (gap > this.deps.config.staleAfterMs) gaps++;
    }
    const end = trip.endedAt ?? this.deps.clock.now();
    return {
      trip: this.historyItem(trip),
      points: fixes.map((f) => ({ lat: f.lat, lng: f.lng, recordedAt: f.recordedAt })),
      stats: {
        fixes: fixes.length,
        distanceMeters: Math.round(distanceMeters),
        durationSeconds: Math.round((end - trip.startedAt) / 1000),
        longestGapSeconds: Math.round(longestGap / 1000),
        gapsOverStaleThreshold: gaps,
      },
    };
  }

  /** Privacy retention: raw GPS traces are deleted after the retention period. */
  purgeFixesOlderThan(days: number): number {
    return this.deps.fixes.purgeOlderThan(this.deps.clock.now() - days * 86_400_000);
  }

  private historyItem(trip: Trip): TripHistoryItem {
    return {
      ...trip,
      routeName: this.deps.network.getRoute(trip.routeId)?.name ?? trip.routeId,
      shuttleLabel: this.deps.network.getShuttle(trip.shuttleId)?.label ?? trip.shuttleId,
      driverName: this.deps.users.displayName(trip.driverId) ?? 'Unknown driver',
    };
  }

  private ownedTracker(driverId: string, tripId: string): TripTracker {
    const tracker = this.trackers.get(tripId);
    if (!tracker) {
      const stored = this.deps.trips.get(tripId);
      if (stored && stored.driverId === driverId) assertActive(stored);
      throw notFound('Active trip not found.');
    }
    if (tracker.trip.driverId !== driverId) throw forbidden('This trip belongs to another driver.');
    return tracker;
  }

  private close(tracker: TripTracker, reason: TripEndReason): Trip {
    const now = this.deps.clock.now();
    const ended = endTrip(tracker.trip, now, reason);
    this.deps.trips.update(ended);
    this.trackers.delete(ended.id);
    this.deps.events.publish({ type: 'trip.ended', tripId: ended.id, routeId: ended.routeId, status: ended.status, reason, at: now });
    return ended;
  }

  private view(tracker: TripTracker, now: number): VehicleView {
    const trip = tracker.trip;
    const route = this.deps.network.getRoute(trip.routeId);
    const shuttle = this.deps.network.getShuttle(trip.shuttleId);
    const context = route ? tracker.etaContext(route) : null;
    const etas = context ? this.deps.eta.estimate(context) : [];
    const age = tracker.ageMs(now);
    return {
      tripId: trip.id,
      routeId: trip.routeId,
      routeName: route?.name ?? trip.routeId,
      routeColor: route?.color ?? '#64748b',
      shuttleId: trip.shuttleId,
      shuttleLabel: shuttle?.label ?? trip.shuttleId,
      capacity: shuttle?.capacity ?? 0,
      occupancy: trip.occupancy,
      startedAt: trip.startedAt,
      position: tracker.snapped,
      headingDeg: tracker.lastFix?.headingDeg ?? null,
      distanceAlong: tracker.distanceAlong === null ? null : Math.round(tracker.distanceAlong),
      routeLength: Math.round(tracker.path.length),
      speedKmh: tracker.speedMps === null ? null : Math.round(tracker.speedMps * 3.6 * 10) / 10,
      offRoute: (tracker.offRouteMeters ?? 0) > 100,
      signal: {
        status: tracker.signal.status,
        lastFixAt: tracker.lastFix?.recordedAt ?? null,
        message: tracker.signal.message(age),
        etaConfidence: tracker.signal.etaConfidence,
      },
      nextStops: tracker.signal.present(etas, now),
    };
  }
}

function parseFix(raw: unknown): Omit<LocationFix, 'tripId' | 'receivedAt'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isValidCoordinate({ lat: r.lat, lng: r.lng })) return null;
  if (typeof r.recordedAt !== 'number' || !Number.isFinite(r.recordedAt) || r.recordedAt <= 0) return null;
  const speedKmh = optionalNumber(r.speedKmh, 0, 250);
  const headingDeg = optionalNumber(r.headingDeg, 0, 360);
  const accuracyM = optionalNumber(r.accuracyM, 0, 100_000);
  if (speedKmh === undefined || headingDeg === undefined || accuracyM === undefined) return null;
  const source: FixSource = r.source === 'simulator' ? 'simulator' : 'device';
  return { lat: r.lat as number, lng: r.lng as number, speedKmh, headingDeg, accuracyM, recordedAt: r.recordedAt, source };
}

/** null = absent; undefined = present but invalid. */
function optionalNumber(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}
