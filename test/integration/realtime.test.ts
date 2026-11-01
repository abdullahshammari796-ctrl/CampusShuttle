import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { SseHub } from '../../src/realtime/sse-hub.ts';
import { ManualClock } from '../../src/shared/clock.ts';
import { EventBus } from '../../src/shared/event-bus.ts';
import type { DomainEvent } from '../../src/shared/events.ts';
import { SseClient, type TestApp, TestClient, fixAt, sleep, startTestApp } from '../helpers.ts';

const VIEWERS = 200;

describe('Real-time push to many concurrent viewers (SSE)', () => {
  let app: TestApp;
  let driver: TestClient;
  let viewers: SseClient[];
  let tripId: string;

  before(async () => {
    app = await startTestApp();
    driver = await TestClient.as(app.baseUrl, 'driver1');
    const student = await TestClient.as(app.baseUrl, 'student1');
    viewers = await Promise.all(Array.from({ length: VIEWERS }, () => SseClient.open(app.baseUrl, student.cookie)));
    await Promise.all(viewers.map((v) => v.waitFor((e) => e.event === 'snapshot', 10_000)));
    tripId = (await driver.post('/api/driver/trips', { routeId: 'campus-loop', shuttleId: 'sh-01' })).body.trip.id;
  });
  after(async () => {
    for (const v of viewers) v.close();
    await app.close();
  });

  it(`delivers every location update to all ${VIEWERS} connected viewers within 1 s`, async (t) => {
    assert.equal(app.container.hub.stats().byRole.student, VIEWERS);
    const sentAt = performance.now();
    await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes: [fixAt(app, 'campus-loop', 0)], sentAt: app.clock.now() });
    const received = await Promise.all(viewers.map((v) => v.waitFor((e) => e.event === 'vehicle' && e.data.tripId === tripId && e.data.signal.status === 'LIVE', 5000)));
    const latencies = received.map((e) => e.receivedAt - sentAt).sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const max = latencies[latencies.length - 1];
    t.diagnostic(`fan-out to ${VIEWERS} viewers: p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms (includes the driver's HTTP round trip)`);
    assert.ok(max < 1000, `max latency ${max} ms`);
  });

  it('coalesces a batch of buffered fixes into one message per viewer', async () => {
    const before = viewers[0].events.length;
    app.clock.advance(60_000);
    const start = app.clock.now() - 30_000;
    const fixes = Array.from({ length: 10 }, (_, i) => fixAt(app, 'campus-loop', 20 + i * 12, { recordedAt: start + i * 3000 }));
    await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes, sentAt: app.clock.now() });
    await viewers[0].waitFor((e) => e.event === 'vehicle' && e.data.distanceAlong >= 120);
    await sleep(100);
    const newVehicleEvents = viewers[0].events.slice(before).filter((e) => e.event === 'vehicle');
    assert.equal(newVehicleEvents.length, 1);
  });

  it('pushes signal changes (delayed / lost) without any client polling', async () => {
    app.clock.advance(25_000);
    app.container.runJobs('signals');
    await viewers[VIEWERS - 1].waitFor((e) => e.event === 'vehicle' && e.data.signal.status === 'STALE');
  });

  it('pushes waiting counts and stop arrivals', async () => {
    const student = await TestClient.as(app.baseUrl, 'student2');
    await student.post('/api/student/waiting', { stopId: 'library' });
    await viewers[1].waitFor((e) => e.event === 'waiting' && e.data.stopId === 'library' && e.data.waiting === 1);
    app.clock.advance(5000);
    await driver.post(`/api/driver/trips/${tripId}/locations`, { fixes: [fixAt(app, 'campus-loop', 460)], sentAt: app.clock.now() });
    await viewers[2].waitFor((e) => e.event === 'arrival' && e.data.stopId === 'library');
    await viewers[2].waitFor((e) => e.event === 'waiting' && e.data.stopId === 'library' && e.data.waiting === 0);
  });

  it('removes ended trips from every viewer and forgets disconnected viewers', async () => {
    await driver.post(`/api/driver/trips/${tripId}/end`);
    await viewers[3].waitFor((e) => e.event === 'vehicle-removed' && e.data.tripId === tripId);
    for (const v of viewers.slice(0, 50)) v.close();
    await sleep(300);
    assert.equal(app.container.hub.stats().clients, VIEWERS - 50);
  });
});

describe('Session expiry on open live streams', () => {
  const TTL = 60_000;
  let app: TestApp;

  before(async () => {
    app = await startTestApp({ sessionTtlMs: TTL });
  });
  after(async () => {
    await app.close();
  });

  it('stops pushing updates to a stream whose session has expired, while fresher sessions keep receiving them', async () => {
    const early = await TestClient.as(app.baseUrl, 'student1'); // session valid until T0 + 60 s
    const earlyViewer = await SseClient.open(app.baseUrl, early.cookie);
    await earlyViewer.waitFor((e) => e.event === 'snapshot');
    app.clock.advance(30_000);
    const later = await TestClient.as(app.baseUrl, 'student2'); // valid until T0 + 90 s
    const laterViewer = await SseClient.open(app.baseUrl, later.cookie);
    await laterViewer.waitFor((e) => e.event === 'snapshot');

    app.clock.advance(30_001); // the first session has just expired; the stream is still open
    const driver = await TestClient.as(app.baseUrl, 'driver1');
    const tripId = (await driver.post('/api/driver/trips', { routeId: 'campus-loop', shuttleId: 'sh-01' })).body.trip.id;

    await laterViewer.waitFor((e) => e.event === 'vehicle' && e.data.tripId === tripId);
    await earlyViewer.waitFor((e) => e.event === 'session-expired');
    await sleep(100);
    assert.equal(earlyViewer.events.some((e) => e.event === 'vehicle'), false, 'no protected update after expiry');
    assert.equal(earlyViewer.ended, true, 'the server closed the stream');
    assert.equal(laterViewer.ended, false);

    const retry = await SseClient.open(app.baseUrl, early.cookie);
    assert.equal(retry.status, 401, 'reconnecting with the expired session is refused');
    retry.close();
    laterViewer.close();
  });

  it('closes idle expired streams on the heartbeat sweep, without waiting for an update', async () => {
    const student = await TestClient.as(app.baseUrl, 'student1');
    const viewer = await SseClient.open(app.baseUrl, student.cookie);
    await viewer.waitFor((e) => e.event === 'snapshot');
    assert.equal(app.container.hub.expireSessions(), 0, 'nothing expires early');
    app.clock.advance(TTL);
    assert.equal(app.container.hub.expireSessions(), 1);
    await viewer.waitFor((e) => e.event === 'session-expired');
    await sleep(50);
    assert.equal(viewer.ended, true);
    assert.equal(app.container.hub.stats().clients, 0);
    assert.ok(app.container.hub.stats().sessionsExpired >= 2);
  });
});

/** Fake socket that lets the test control back-pressure. */
class FakeResponse extends EventEmitter {
  writableLength = 0;
  frames: string[] = [];
  writeHead() {
    return this;
  }
  write(chunk: string) {
    this.frames.push(chunk);
    return true;
  }
  end() {}
}

describe('SseHub back-pressure handling', () => {
  it('skips incremental updates for a slow client and resynchronises it with a snapshot once drained', async () => {
    const bus = new EventBus<DomainEvent>();
    const source = { snapshot: () => ({ vehicles: [], waiting: {} }), vehicle: () => null };
    const hub = new SseHub(bus, source, new ManualClock(), { heartbeatMs: 60_000, maxBufferedBytes: 1000 });
    const req = new EventEmitter() as IncomingMessage;
    (req as unknown as { socket: object }).socket = { setNoDelay() {}, setKeepAlive() {} };
    const res = new FakeResponse();
    hub.attach(req, res as unknown as ServerResponse, 'student', Number.MAX_SAFE_INTEGER);
    assert.ok(res.frames.some((f) => f.includes('event: snapshot')));

    res.writableLength = 5000; // socket buffer full: the client is not keeping up
    bus.publish({ type: 'waiting.changed', stopId: 'a', waiting: 1, at: 0 });
    bus.publish({ type: 'waiting.changed', stopId: 'a', waiting: 2, at: 0 });
    assert.equal(hub.stats().messagesSkipped, 2);
    const snapshotsBefore = hub.stats().snapshotsSent;

    res.writableLength = 0;
    res.emit('drain');
    assert.equal(hub.stats().snapshotsSent, snapshotsBefore + 1);
    req.emit('close');
    assert.equal(hub.stats().clients, 0);
    hub.close();
  });
});
