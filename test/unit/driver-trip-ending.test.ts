// Driver-app modules (public/js) run here unchanged; only `fetch` is replaced,
// so the tests exercise the real queue, retry and end-trip logic.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ApiError, api } from '../../public/js/api.js';
import { LocationUploader } from '../../public/js/gps.js';
import { endTripSafely } from '../../public/js/trip-ending.js';

type Handler = (url: string, body: any) => Response | Promise<Response>;

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; body: any }> = [];

function mockFetch(handler: Handler): void {
  calls = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body });
    return handler(String(url), body);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const accepted = (body: any) => json(200, { accepted: body.fixes.length, rejected: [], vehicle: {}, clockOffsetMs: 0 });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fix = (n: number) => ({ lat: 25.1 + n / 1e5, lng: 55.2, recordedAt: n * 1000, accuracyM: 5 });
const isEnd = (url: string) => url.endsWith('/end');
const sentFixes = () => calls.filter((c) => !isEnd(c.url)).flatMap((c) => c.body.fixes.map((f: { recordedAt: number }) => f.recordedAt / 1000));
const endRequest = (tripId: string) => api(`/api/driver/trips/${tripId}/end`, { method: 'POST' });

describe('LocationUploader (driver app)', () => {
  it('drain() waits for the upload in flight, then delivers the rest of the queue in order', async () => {
    mockFetch(async (_url, body) => {
      await delay(60);
      return accepted(body);
    });
    const uploader = new LocationUploader('trip-1', { batchSize: 2 });
    uploader.push(fix(1)); // sent at once
    uploader.push(fix(2));
    uploader.push(fix(3)); // queued behind the upload in flight
    assert.equal(uploader.inflight, true);
    assert.equal(await uploader.drain(2000), true);
    assert.deepEqual(sentFixes(), [1, 2, 3]);
    assert.equal(uploader.queue.length, 0);
  });

  it('keeps only the newest maxQueue positions while offline and counts the dropped ones (QA-4 bound)', async () => {
    mockFetch((_url, body) => accepted(body));
    const uploader = new LocationUploader('trip-1', { maxQueue: 3 });
    uploader.setNetworkDown(true);
    for (let n = 1; n <= 5; n++) uploader.push(fix(n));
    assert.equal(uploader.dropped, 2);
    assert.equal(await uploader.drain(200), false, 'nothing can be delivered while offline');
    assert.equal(calls.length, 0);
    uploader.setNetworkDown(false);
    assert.equal(await uploader.drain(2000), true);
    assert.deepEqual(sentFixes(), [3, 4, 5], 'the two oldest positions were lost to the queue limit');
  });

  it('holds positions while paused and sends them on resume', async () => {
    mockFetch((_url, body) => accepted(body));
    const uploader = new LocationUploader('trip-1');
    uploader.pause();
    uploader.push(fix(1));
    uploader.push(fix(2));
    await delay(30);
    assert.equal(calls.length, 0);
    assert.equal(uploader.status().state, 'paused');
    uploader.resume();
    assert.equal(await uploader.drain(2000), true);
    assert.deepEqual(sentFixes(), [1, 2]);
  });
});

describe('Ending a trip from the driver app', () => {
  it('delivers queued positions first, then ends the trip; positions recorded during the request are not sent', async () => {
    mockFetch(async (url, body) => {
      await delay(30);
      return isEnd(url) ? json(200, { trip: { status: 'COMPLETED' } }) : accepted(body);
    });
    const uploader = new LocationUploader('trip-1');
    uploader.push(fix(1)); // in flight when the driver presses "End trip"
    uploader.push(fix(2)); // still queued
    const result = await endTripSafely({
      tripId: 'trip-1',
      uploader,
      requestEnd: (id: string) => {
        uploader.push(fix(3)); // GPS keeps running while the request is pending
        return endRequest(id);
      },
    });
    assert.equal(result.outcome, 'ended');
    assert.deepEqual(calls.map((c) => (isEnd(c.url) ? 'end' : 'locations')), ['locations', 'locations', 'end'], 'no upload races the end request');
    assert.deepEqual(sentFixes(), [1, 2]);
    assert.equal(result.undelivered, 1);
  });

  it('keeps the trip active and resumes location sharing when the end request cannot reach the server', async () => {
    mockFetch((url, body) => {
      if (isEnd(url)) throw new TypeError('fetch failed'); // connection lost
      return accepted(body);
    });
    const uploader = new LocationUploader('trip-1');
    const result = await endTripSafely({
      tripId: 'trip-1',
      uploader,
      requestEnd: (id: string) => {
        uploader.push(fix(7));
        return endRequest(id);
      },
    });
    assert.equal(result.outcome, 'failed');
    assert.ok(result.error instanceof ApiError);
    assert.equal((result.error as ApiError).status, 0);
    assert.equal(uploader.paused, false, 'uploads resume');
    assert.equal(uploader.stopped, false, 'the uploader was not shut down');
    assert.equal(await uploader.drain(2000), true);
    assert.deepEqual(sentFixes(), [7], 'the position recorded during the failed attempt is still delivered');
  });

  it('treats an expired session (401) as a failure, not as an ended trip', async () => {
    mockFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }));
    const result = await endTripSafely({ tripId: 'trip-1', uploader: new LocationUploader('trip-1'), requestEnd: endRequest });
    assert.equal(result.outcome, 'failed');
    assert.equal((result.error as ApiError).status, 401);
  });

  it('recognises a trip that the server had already ended (409)', async () => {
    mockFetch(() => json(409, { error: { code: 'CONFLICT', message: 'Trip trip-1 is already terminated.' } }));
    const result = await endTripSafely({ tripId: 'trip-1', uploader: new LocationUploader('trip-1'), requestEnd: endRequest });
    assert.equal(result.outcome, 'already-ended');
  });

  it('does not wait forever when queued positions cannot be delivered', async () => {
    mockFetch((url) => (isEnd(url) ? json(200, { trip: {} }) : json(503, { error: { code: 'HTTP_503', message: 'unavailable' } })));
    const uploader = new LocationUploader('trip-1');
    uploader.push(fix(1)); // fails and waits for a retry
    const started = Date.now();
    const result = await endTripSafely({ tripId: 'trip-1', uploader, requestEnd: endRequest, drainTimeoutMs: 300 });
    assert.ok(Date.now() - started < 2000);
    assert.equal(result.outcome, 'ended');
    assert.equal(result.undelivered, 1, 'reported, not silently dropped');
    uploader.stop();
  });
});
