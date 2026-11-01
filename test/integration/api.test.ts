import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../../src/config.ts';
import { buildContainer } from '../../src/container.ts';
import { ManualClock } from '../../src/shared/clock.ts';
import { T0, type TestApp, TestClient, fixAt, startTestApp } from '../helpers.ts';

const ALL = ['student', 'driver', 'office'] as const;
const ENDPOINTS: Array<[string, string, readonly string[]]> = [
  ['GET', '/api/network', ALL],
  ['GET', '/api/live', ALL],
  ['GET', '/api/stops/main-gate/arrivals', ALL],
  ['GET', '/api/student/waiting', ['student']],
  ['POST', '/api/student/waiting', ['student']],
  ['DELETE', '/api/student/waiting/x', ['student']],
  ['GET', '/api/driver/options', ['driver']],
  ['GET', '/api/driver/trip', ['driver']],
  ['POST', '/api/driver/trips', ['driver']],
  ['POST', '/api/driver/trips/x/locations', ['driver']],
  ['POST', '/api/driver/trips/x/occupancy', ['driver']],
  ['POST', '/api/driver/trips/x/end', ['driver']],
  ['GET', '/api/office/overview', ['office']],
  ['GET', '/api/office/trips/active', ['office']],
  ['GET', '/api/office/trips', ['office']],
  ['GET', '/api/office/trips/x/track', ['office']],
  ['POST', '/api/office/trips/x/terminate', ['office']],
  ['GET', '/api/office/routes', ['office']],
  ['PATCH', '/api/office/routes/campus-loop', ['office']],
  ['POST', '/api/office/routes', ['office']],
  ['GET', '/api/office/demand/models', ['office']],
  ['GET', '/api/office/demand/history', ['office']],
  ['GET', '/api/office/demand/forecast', ['office']],
  ['GET', '/api/office/demand/explain?stopId=main-gate&hour=8', ['office']],
  ['GET', '/api/office/demand/evaluation', ['office']],
  ['GET', '/api/office/system', ['office']],
];

describe('Security: authentication, role-based access and HTTP hardening', () => {
  let app: TestApp;
  const clients: Record<string, TestClient> = {};
  before(async () => {
    app = await startTestApp();
    clients.student = await TestClient.as(app.baseUrl, 'student1');
    clients.driver = await TestClient.as(app.baseUrl, 'driver1');
    clients.office = await TestClient.as(app.baseUrl, 'office1');
  });
  after(() => app.close());

  it(`enforces the role matrix on all ${ENDPOINTS.length} protected endpoints`, async () => {
    const anonymous = new TestClient(app.baseUrl);
    for (const [method, path, allowed] of ENDPOINTS) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {};
      assert.equal((await anonymous.request(method, path, body)).status, 401, `anonymous ${method} ${path}`);
      for (const role of ALL) {
        const status = (await clients[role].request(method, path, body)).status;
        if (allowed.includes(role)) assert.ok(status !== 401 && status !== 403, `${role} ${method} ${path} → ${status}`);
        else assert.equal(status, 403, `${role} ${method} ${path}`);
      }
    }
    assert.equal((await anonymous.get('/api/stream')).status, 401, 'live stream requires sign-in');
  });

  it('rejects wrong passwords and locks out after 5 failed attempts', async () => {
    const c = new TestClient(app.baseUrl);
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { username: 'student2', password: 'wrong' })).status, 401);
    const locked = await c.post('/api/auth/login', { username: 'student2', password: 'student-demo' });
    assert.equal(locked.status, 429);
    app.clock.advance(5 * 60_000 + 1);
    assert.equal((await c.post('/api/auth/login', { username: 'student2', password: 'student-demo' })).status, 200);
  });

  it('issues an HttpOnly SameSite=Strict session cookie and expires sessions', async () => {
    const c = new TestClient(app.baseUrl);
    const reply = await c.post('/api/auth/login', { username: 'driver2', password: 'driver-demo' });
    const cookie = reply.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal((await c.get('/api/auth/me')).body.user.role, 'driver');
    app.clock.advance(8 * 3600_000 + 1);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    app.clock.set(T0);
  });

  it('blocks state-changing requests without the anti-CSRF header', async () => {
    const reply = await clients.student.request('POST', '/api/student/waiting', { stopId: 'library' }, { csrf: false });
    assert.equal(reply.status, 403);
  });

  it('sends security headers (CSP, frame denial, no caching of API data)', async () => {
    const page = await fetch(`${app.baseUrl}/`);
    assert.match(page.headers.get('content-security-policy')!, /default-src 'self'.*script-src 'self'/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('x-powered-by'), null);
    assert.equal((await clients.student.get('/api/live')).headers.get('cache-control'), 'no-store');
  });

  it('answers malformed input with 400, not 500', async () => {
    const r = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'campus-shuttle' }, body: '{bad json' });
    assert.equal(r.status, 400);
    assert.equal((await clients.office.get('/api/office/demand/forecast?date=2026-13-45')).status, 400);
    assert.equal((await clients.driver.post('/api/driver/trips/x/locations', { fixes: 'nope' })).status, 404);
  });
});

describe('Use case: run a trip (driver) and track it (student)', () => {
  let app: TestApp;
  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());

  it('start → live position and ETAs for students → end → removed', async () => {
    const driver = await TestClient.as(app.baseUrl, 'driver1');
    const student = await TestClient.as(app.baseUrl, 'student1');
    const office = await TestClient.as(app.baseUrl, 'office1');

    const started = await driver.post('/api/driver/trips', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    assert.equal(started.status, 201);
    const tripId = started.body.trip.id;
    assert.equal(started.body.vehicle.signal.status, 'AWAITING_FIX');

    await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes: [fixAt(app, 'campus-loop', 0)], sentAt: app.clock.now() });
    app.clock.advance(10_000);
    const sent = await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes: [fixAt(app, 'campus-loop', 60)], sentAt: app.clock.now() });
    assert.equal(sent.body.accepted, 1);

    const live = await student.get('/api/live');
    const vehicle = live.body.vehicles.find((v: { tripId: string }) => v.tripId === tripId);
    assert.equal(vehicle.signal.status, 'LIVE');
    assert.equal(vehicle.shuttleLabel, 'Shuttle 01');
    assert.equal('driverId' in vehicle || 'driverName' in vehicle, false, 'students never see who drives');
    const library = vehicle.nextStops.find((s: { stopId: string }) => s.stopId === 'library');
    assert.ok(library.etaSeconds > 30 && library.etaSeconds < 200, `ETA ${library.etaSeconds}`);

    const arrivals = await student.get('/api/stops/library/arrivals');
    assert.equal(arrivals.body.arrivals[0].tripId, tripId);

    const officeView = await office.get('/api/office/trips/active');
    assert.equal(officeView.body.trips[0].driverName, 'Demo Driver 1');

    const ended = await driver.post(`/api/driver/trips/${tripId}/end`);
    assert.equal(ended.body.trip.status, 'COMPLETED');
    assert.equal((await student.get('/api/live')).body.vehicles.length, 0);
    const history = await office.get('/api/office/trips?status=COMPLETED');
    assert.equal(history.body.trips[0].endReason, 'DRIVER_ENDED');
    const track = await office.get(`/api/office/trips/${tripId}/track`);
    assert.equal(track.body.stats.fixes, 2);
  });

  it('keeps shuttles and drivers to one active trip each (409)', async () => {
    const d1 = await TestClient.as(app.baseUrl, 'driver1');
    const d2 = await TestClient.as(app.baseUrl, 'driver2');
    assert.equal((await d1.post('/api/driver/trips', { routeId: 'campus-loop', shuttleId: 'sh-02' })).status, 201);
    assert.equal((await d2.post('/api/driver/trips', { routeId: 'metro-link', shuttleId: 'sh-02' })).status, 409);
    assert.equal((await d1.post('/api/driver/trips', { routeId: 'metro-link', shuttleId: 'sh-03' })).status, 409);
    const options = await d2.get('/api/driver/options');
    assert.equal(options.body.shuttles.find((s: { id: string }) => s.id === 'sh-02').busy, true);
  });

  it('degrades to delayed / lost when GPS stops, and recovers when it resumes', async () => {
    const driver = await TestClient.as(app.baseUrl, 'driver3');
    const student = await TestClient.as(app.baseUrl, 'student2');
    const { body } = await driver.post('/api/driver/trips', { routeId: 'metro-link', shuttleId: 'sh-04' });
    const tripId = body.trip.id;
    await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes: [fixAt(app, 'metro-link', 0)], sentAt: app.clock.now() });
    const view = async () => (await student.get('/api/live')).body.vehicles.find((v: { tripId: string }) => v.tripId === tripId);

    app.clock.advance(25_000);
    app.container.runJobs('signals');
    const stale = await view();
    assert.equal(stale.signal.status, 'STALE');
    assert.ok(stale.nextStops.length > 0 && stale.nextStops.every((s: { confidence: string }) => s.confidence === 'approximate'));

    app.clock.advance(40_000);
    app.container.runJobs('signals');
    const lost = await view();
    assert.equal(lost.signal.status, 'LOST');
    assert.deepEqual(lost.nextStops, [], 'no ETA is better than a wrong one');

    // The driver app now flushes positions it buffered, plus a duplicate and an out-of-order one.
    const t = app.clock.now();
    const fixes = [fixAt(app, 'metro-link', 300, { recordedAt: t - 2000 }), fixAt(app, 'metro-link', 200, { recordedAt: t - 9000 }), fixAt(app, 'metro-link', 300, { recordedAt: t - 2000 })];
    const result = await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes, sentAt: t });
    assert.equal(result.body.accepted, 2);
    assert.deepEqual(result.body.rejected, [{ index: 2, reason: 'OUT_OF_ORDER' }]);
    assert.equal((await view()).signal.status, 'LIVE');
  });
});

describe('Use case: "I\'m waiting here" (student) and demand signal', () => {
  let app: TestApp;
  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());

  it('registers, is idempotent, switches stop, cancels, and never exposes the pseudonym', async () => {
    const student = await TestClient.as(app.baseUrl, 'student1');
    const office = await TestClient.as(app.baseUrl, 'office1');
    const first = await student.post('/api/student/waiting', { stopId: 'library' });
    assert.equal(first.status, 201);
    assert.equal(first.body.request.status, 'WAITING');
    assert.equal('requesterRef' in first.body.request, false);
    assert.equal((await student.post('/api/student/waiting', { stopId: 'library' })).body.request.id, first.body.request.id);
    assert.equal((await office.get('/api/office/overview')).body.waiting.library, 1);

    const moved = await student.post('/api/student/waiting', { stopId: 'engineering' });
    assert.notEqual(moved.body.request.id, first.body.request.id);
    const overview = (await office.get('/api/office/overview')).body;
    assert.equal(overview.waiting.library ?? 0, 0);
    assert.equal(overview.waiting.engineering, 1);

    assert.equal((await student.delete(`/api/student/waiting/${moved.body.request.id}`)).body.request.status, 'CANCELLED');
    assert.equal((await student.delete(`/api/student/waiting/${moved.body.request.id}`)).status, 404);
    assert.equal((await student.post('/api/student/waiting', { stopId: 'library', routeId: 'metro-link' })).status, 400, 'route does not serve stop');
  });

  it('closes requests as SERVED when a shuttle reaches the stop', async () => {
    const student = await TestClient.as(app.baseUrl, 'student2');
    const driver = await TestClient.as(app.baseUrl, 'driver1');
    await student.post('/api/student/waiting', { stopId: 'library', routeId: 'campus-loop' });
    const { body } = await driver.post('/api/driver/trips', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    for (const d of [0, 120, 240, 360, 480]) {
      await driver.post(`/api/driver/trips/${body.trip.id}/locations`, { fixes: [fixAt(app, 'campus-loop', d)], sentAt: app.clock.now() });
      app.clock.advance(15_000);
    }
    const mine = await student.get('/api/student/waiting');
    assert.equal(mine.body.request.status, 'SERVED');
  });

  it('expires unattended requests and rate-limits abuse', async () => {
    const student = await TestClient.as(app.baseUrl, 'student1');
    await student.post('/api/student/waiting', { stopId: 'sports' });
    app.clock.advance(21 * 60_000);
    app.container.runJobs('expiry');
    assert.equal((await student.get('/api/student/waiting')).body.request.status, 'EXPIRED');

    const stops = ['main-gate', 'library', 'engineering', 'residences', 'sports', 'metro', 'innovation-out'];
    const statuses = [];
    for (const stopId of stops) statuses.push((await student.post('/api/student/waiting', { stopId })).status);
    assert.equal(statuses.at(-1), 429);
  });

  it('erases the pseudonymous link 24 h after a request closes (retention job)', async () => {
    const count = () => (app.container.db.prepare('SELECT COUNT(*) AS n FROM waiting_requests WHERE requester_ref IS NOT NULL AND status <> \'WAITING\'').get() as { n: number }).n;
    assert.ok(count() > 0);
    app.clock.advance(25 * 3600_000);
    app.container.runJobs('retention');
    assert.equal(count(), 0);
  });
});

describe('Use case: transport office operations', () => {
  let app: TestApp;
  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());

  it('ends a trip with an audited reason; the driver app is told the trip is over', async () => {
    const driver = await TestClient.as(app.baseUrl, 'driver1');
    const office = await TestClient.as(app.baseUrl, 'office1');
    const { body } = await driver.post('/api/driver/trips', { routeId: 'campus-loop', shuttleId: 'sh-01' });
    assert.equal((await office.post(`/api/office/trips/${body.trip.id}/terminate`, { reason: '' })).status, 400);
    assert.equal((await office.post(`/api/office/trips/${body.trip.id}/terminate`, { reason: 'Breakdown reported' })).body.trip.status, 'TERMINATED');
    const next = await driver.post(`/api/driver/trips/${body.trip.id}/locations`, { fixes: [fixAt(app, 'campus-loop', 0)] });
    assert.equal(next.status, 409);
    const audit = (await office.get('/api/office/system')).body.audit;
    assert.equal(audit[0].action, 'trip.terminate');
    assert.equal(audit[0].details, 'Breakdown reported');
  });

  it('validates and audits route changes; out-of-service routes cannot start trips', async () => {
    const office = await TestClient.as(app.baseUrl, 'office1');
    const driver = await TestClient.as(app.baseUrl, 'driver2');
    assert.equal((await office.patch('/api/office/routes/metro-link', { color: 'red' })).status, 400);
    assert.equal((await office.patch('/api/office/routes/metro-link', { nominalSpeedKmh: 500 })).status, 400);
    assert.equal((await office.patch('/api/office/routes/metro-link', { active: false })).body.route.active, false);
    const refused = await driver.post('/api/driver/trips', { routeId: 'metro-link', shuttleId: 'sh-03' });
    assert.equal(refused.status, 409);
    assert.equal((await driver.get('/api/network')).body.routes.some((r: { id: string }) => r.id === 'metro-link'), false);

    const created = await office.post('/api/office/routes', { name: 'Library Express', color: '#0f766e', stopIds: ['main-gate', 'library'], loop: true, nominalSpeedKmh: 20, dwellSeconds: 15 });
    assert.equal(created.status, 201);
    assert.equal(created.body.route.active, false, 'new routes start inactive for review');
    assert.equal((await office.post('/api/office/routes', { name: 'Bad', color: '#0f766e', stopIds: ['main-gate'], loop: true, nominalSpeedKmh: 20, dwellSeconds: 15 })).status, 400);
    const actions = (await office.get('/api/office/system')).body.audit.map((a: { action: string }) => a.action);
    assert.deepEqual(actions.slice(0, 2), ['route.create', 'route.update']);
  });

  it('serves explainable forecasts and an evaluation clearly labelled as synthetic', async () => {
    const office = await TestClient.as(app.baseUrl, 'office1');
    const forecast = (await office.get('/api/office/demand/forecast?date=2026-10-05&model=seasonal-average')).body;
    assert.equal(forecast.weekday, 'Monday');
    assert.deepEqual(forecast.dataSources, ['synthetic']);
    assert.equal(forecast.stops.length, 9);
    assert.equal(forecast.hours.length, 15);
    assert.ok(forecast.peak.expected > 0);

    const explain = (await office.get('/api/office/demand/explain?stopId=metro&date=2026-10-05&hour=8&model=seasonal-average')).body;
    assert.equal(explain.basis.length, 4);
    assert.ok(explain.basis.every((b: { date: string }) => b.date < '2026-10-05'));
    assert.match(explain.explanation, /Average of 4 previous Mondays/);

    const evaluation = (await office.get('/api/office/demand/evaluation?days=14')).body;
    assert.deepEqual(evaluation.results.map((r: { predictorId: string }) => r.predictorId), ['seasonal-average', 'weighted-seasonal', 'hour-of-day-mean']);
    assert.ok(evaluation.results.every((r: { samples: number; mae: number }) => r.samples > 0 && r.mae >= 0));
    assert.ok(evaluation.dataSources.includes('synthetic'));
    assert.equal((await office.get('/api/office/demand/forecast?model=crystal-ball')).status, 400);
  });
});

describe('Persistence: restart recovery', () => {
  it('recovers active trips and waiting requests from the database file after a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'campus-shuttle-test-'));
    try {
      const clock = new ManualClock(T0);
      const config = loadConfig({ SESSION_SECRET: 'x'.repeat(40) }, { dbFile: join(dir, 'test.db') });
      const first = await buildContainer(config, { clock });
      const trip = first.tracking.startTrip('u-driver-1', { routeId: 'campus-loop', shuttleId: 'sh-01' });
      const p = first.network.pathFor('campus-loop').pointAt(250);
      first.tracking.recordFixes('u-driver-1', trip.id, [{ ...p, recordedAt: clock.now() }], clock.now());
      first.waiting.create('u-student-1', { stopId: 'residences' });
      first.stop();

      clock.advance(5000);
      const second = await buildContainer(config, { clock });
      assert.equal(second.seeded, null, 'existing database is not re-seeded');
      assert.equal(second.recoveredTrips, 1);
      const vehicle = second.tracking.vehicle(trip.id)!;
      assert.ok(Math.abs(vehicle.distanceAlong! - 250) <= 1);
      assert.equal(vehicle.signal.status, 'LIVE');
      assert.equal(second.waiting.countsByStop().residences, 1);
      second.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
