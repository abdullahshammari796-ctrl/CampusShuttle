import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { NetworkReader } from '../../src/network/ports.ts';
import { RoutePath } from '../../src/network/route-path.ts';
import { InMemoryLocationFixRepository, InMemoryTripRepository } from '../../src/persistence/memory-tracking.ts';
import { DEMO_ROUTES, DEMO_SHUTTLES, DEMO_STOPS } from '../../src/seed/demo-data.ts';
import type { AuditEntry, AuditLog } from '../../src/shared/audit.ts';
import { ManualClock } from '../../src/shared/clock.ts';
import { AppError } from '../../src/shared/errors.ts';
import { EventBus } from '../../src/shared/event-bus.ts';
import type { DomainEvent } from '../../src/shared/events.ts';
import { BlendedSpeedEta } from '../../src/tracking/eta/blended-speed-eta.ts';
import { TrackingService, type TrackingConfig } from '../../src/tracking/tracking-service.ts';
import { DEFAULT_TRACKER_OPTIONS } from '../../src/tracking/trip-tracker.ts';

/** Fake network built from the demo data: the service only depends on the NetworkReader port. */
function fakeNetwork(): NetworkReader {
  const routes = DEMO_ROUTES.map((r) => ({ ...r, updatedAt: 0 }));
  const paths = new Map(routes.map((r) => [r.id, new RoutePath(r.path, r.loop, r.stopIds.map((id) => DEMO_STOPS.find((s) => s.id === id)!))]));
  return {
    getRoute: (id) => routes.find((r) => r.id === id) ?? null,
    getStop: (id) => DEMO_STOPS.find((s) => s.id === id) ?? null,
    getShuttle: (id) => DEMO_SHUTTLES.find((s) => s.id === id) ?? null,
    listStops: () => DEMO_STOPS,
    listRoutes: () => routes,
    pathFor: (id) => paths.get(id)!,
    serviceArea: () => ({ center: { lat: 25.2, lng: 55.26 }, radiusMeters: 8000 }),
  };
}

const CONFIG: TrackingConfig = {
  staleAfterMs: 20_000, lostAfterMs: 60_000, abandonAfterMs: 30 * 60_000, maxBatchSize: 100, maxFixAgeMs: 10 * 60_000, maxAccuracyM: 150,
  tracker: DEFAULT_TRACKER_OPTIONS,
};

let clock: ManualClock;
let events: DomainEvent[];
let trips: InMemoryTripRepository;
let fixes: InMemoryLocationFixRepository;
let network: NetworkReader;
let audit: AuditEntry[];
let service: TrackingService;

function build(): TrackingService {
  const bus = new EventBus<DomainEvent>();
  bus.subscribeAll((e) => events.push(e));
  const auditLog: AuditLog = { record: (e) => audit.push({ id: audit.length + 1, ...e }), recent: () => audit };
  return new TrackingService({
    trips, fixes, network, users: { displayName: (id) => `Name of ${id}` }, events: bus, clock, eta: new BlendedSpeedEta(), audit: auditLog, config: CONFIG,
  });
}

const along = (d: number, extra: Record<string, unknown> = {}) => {
  const p = network.pathFor('campus-loop').pointAt(d);
  return { lat: p.lat, lng: p.lng, recordedAt: clock.now(), accuracyM: 5, ...extra };
};
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return 'NO_ERROR';
};

beforeEach(() => {
  clock = new ManualClock();
  events = [];
  audit = [];
  trips = new InMemoryTripRepository();
  fixes = new InMemoryLocationFixRepository();
  network = fakeNetwork();
  service = build();
});

describe('TrackingService', () => {
  it('enforces one active trip per shuttle and per driver, and only on routes in service', () => {
    service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    assert.equal(codeOf(() => service.startTrip('d2', { routeId: 'campus-loop', shuttleId: 'sh-01' })), 'CONFLICT');
    assert.equal(codeOf(() => service.startTrip('d1', { routeId: 'metro-link', shuttleId: 'sh-02' })), 'CONFLICT');
    assert.equal(codeOf(() => service.startTrip('d3', { routeId: 'evening-express', shuttleId: 'sh-03' })), 'CONFLICT');
    assert.equal(codeOf(() => service.startTrip('d3', { routeId: 'nope', shuttleId: 'sh-03' })), 'NOT_FOUND');
    assert.equal(events.filter((e) => e.type === 'trip.started').length, 1);
  });

  it('only the owning driver can post positions', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    assert.equal(codeOf(() => service.recordFixes('d2', trip.id, [along(0)])), 'FORBIDDEN');
  });

  it('corrects device clock skew using sentAt', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    const deviceNow = clock.now() - 5 * 60_000; // phone clock 5 minutes slow
    const result = service.recordFixes('d1', trip.id, [along(0, { recordedAt: deviceNow })], deviceNow);
    assert.equal(result.accepted, 1);
    assert.equal(result.clockOffsetMs, 5 * 60_000);
    assert.equal(result.vehicle.signal.status, 'LIVE');
    assert.equal(fixes.fixes[0].recordedAt, clock.now());
  });

  it('rejects invalid, inaccurate, out-of-area and too-old positions with reasons', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    const result = service.recordFixes('d1', trip.id, [
      { lat: 'x', lng: 55, recordedAt: clock.now() },
      along(0, { accuracyM: 500 }),
      { lat: 0, lng: 0, recordedAt: clock.now() },
      along(0, { recordedAt: clock.now() - 11 * 60_000 }),
    ], clock.now());
    assert.deepEqual(result.rejected.map((r) => r.reason), ['INVALID', 'LOW_ACCURACY', 'OUT_OF_SERVICE_AREA', 'TOO_OLD']);
    assert.equal(result.accepted, 0);
    assert.equal(events.some((e) => e.type === 'trip.location'), false);
  });

  it('accepts a shuffled offline backlog in one call, in time order, with one location event', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    const start = clock.now();
    const backlog = Array.from({ length: 10 }, (_, i) => along(i * 15, { recordedAt: start + i * 3000 }));
    clock.advance(30_000);
    const shuffled = [backlog[3], backlog[9], backlog[0], backlog[5], backlog[1], backlog[8], backlog[2], backlog[7], backlog[4], backlog[6]];
    const result = service.recordFixes('d1', trip.id, shuffled, clock.now());
    assert.equal(result.accepted, 10);
    assert.equal(events.filter((e) => e.type === 'trip.location').length, 1);
    assert.ok(Math.abs(result.vehicle.distanceAlong! - 135) <= 1);
    const stored = fixes.listForTrip(trip.id).map((f) => f.recordedAt);
    assert.deepEqual(stored, [...stored].sort((a, b) => a - b));
  });

  it('a delivered backlog whose newest fix is already old is shown as delayed, not live', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    const old = clock.now();
    clock.advance(45_000);
    const result = service.recordFixes('d1', trip.id, [along(0, { recordedAt: old })], clock.now());
    assert.equal(result.vehicle.signal.status, 'STALE');
    assert.ok(result.vehicle.nextStops.every((s) => s.confidence === 'approximate'));
  });

  it('degrades LIVE → STALE → LOST over time, then recovers on the next fix', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    service.recordFixes('d1', trip.id, [along(0)], clock.now());
    clock.advance(21_000);
    service.checkSignals();
    assert.equal(service.vehicle(trip.id)!.signal.status, 'STALE');
    clock.advance(40_000);
    service.checkSignals();
    const lost = service.vehicle(trip.id)!;
    assert.equal(lost.signal.status, 'LOST');
    assert.deepEqual(lost.nextStops, []);
    service.recordFixes('d1', trip.id, [along(60)], clock.now());
    assert.equal(service.vehicle(trip.id)!.signal.status, 'LIVE');
    const transitions = events.filter((e) => e.type === 'trip.signal').map((e) => (e as { status: string }).status);
    assert.deepEqual(transitions, ['LIVE', 'STALE', 'LOST', 'LIVE']);
  });

  it('closes a trip automatically after 30 minutes without any position', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    clock.advance(31 * 60_000);
    assert.deepEqual(service.checkSignals(), { changed: 1, closed: 1 });
    assert.equal(trips.get(trip.id)!.status, 'TERMINATED');
    assert.equal(trips.get(trip.id)!.endReason, 'NO_SIGNAL_TIMEOUT');
    assert.equal(service.liveVehicles().length, 0);
  });

  it('publishes stop arrivals as the shuttle passes stops', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    const library = network.pathFor('campus-loop').stops.find((s) => s.stopId === 'library')!.distanceAlong;
    service.recordFixes('d1', trip.id, [along(100)], clock.now());
    clock.advance(60_000);
    service.recordFixes('d1', trip.id, [along(library + 60)], clock.now());
    const arrivals = events.filter((e) => e.type === 'stop.arrived').map((e) => (e as { stopId: string }).stopId);
    assert.deepEqual(arrivals, ['library']);
  });

  it('a terminated trip rejects further positions and is audited', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    assert.equal(codeOf(() => service.terminateTrip('office', trip.id, '')), 'VALIDATION');
    service.terminateTrip('office', trip.id, 'Breakdown');
    assert.equal(audit[0].action, 'trip.terminate');
    assert.equal(codeOf(() => service.recordFixes('d1', trip.id, [along(0)], clock.now())), 'CONFLICT');
  });

  it('recovers active trips and their last position from the repositories after a restart', () => {
    const trip = service.startTrip('d1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    service.recordFixes('d1', trip.id, [along(300)], clock.now());
    const restarted = build();
    assert.equal(restarted.recover(), 1);
    const vehicle = restarted.vehicle(trip.id)!;
    assert.ok(Math.abs(vehicle.distanceAlong! - 300) <= 1);
    assert.equal(vehicle.signal.status, 'LIVE');
  });

  it('public vehicle views never contain the driver identity', () => {
    // The id contains non-hex letters, so it cannot occur by chance inside the trip's random UUID.
    const driverId = 'driver-quokka';
    const trip = service.startTrip(driverId, { routeId: 'campus-loop', shuttleId: 'sh-01' });
    const view = JSON.stringify(service.vehicle(trip.id));
    assert.equal(view.includes(driverId), false);
    assert.equal(view.includes(`Name of ${driverId}`), false);
    assert.equal(service.officeTrips()[0].driverName, `Name of ${driverId}`);
  });
});
