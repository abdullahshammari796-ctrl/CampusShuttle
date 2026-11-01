import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoutePath } from '../../src/network/route-path.ts';
import { fromLocalXY } from '../../src/shared/geo.ts';
import type { LocationFix, Trip } from '../../src/tracking/model.ts';
import { SignalStates } from '../../src/tracking/signal-state.ts';
import { TripTracker } from '../../src/tracking/trip-tracker.ts';

const ORIGIN = { lat: 25.2, lng: 55.26 };
const at = (x: number, y: number) => fromLocalXY({ x, y }, ORIGIN);
const path = new RoutePath([at(0, 0), at(400, 0), at(400, 400), at(0, 400)], true, [
  { id: 'a', ...at(0, 0) }, { id: 'b', ...at(400, 0) }, { id: 'c', ...at(400, 400) }, { id: 'd', ...at(0, 400) },
]);
const trip: Trip = {
  id: 't1', routeId: 'r', shuttleId: 's', driverId: 'd', status: 'ACTIVE', occupancy: 'SEATS_AVAILABLE', startedAt: 0, endedAt: null, endReason: null,
};
const fix = (x: number, y: number, t: number): LocationFix => ({
  tripId: 't1', ...at(x, y), speedKmh: null, headingDeg: null, accuracyM: 5, recordedAt: t, receivedAt: t, source: 'simulator',
});

function tracker(): TripTracker {
  return new TripTracker(trip, path);
}

describe('TripTracker', () => {
  it('rejects out-of-order, duplicate, too-frequent and physically impossible fixes', () => {
    const t = tracker();
    t.apply(fix(0, 0, 10_000));
    const result = t.validateSequence([
      { fix: fix(50, 0, 9_000) }, // older than last accepted
      { fix: fix(50, 0, 10_000) }, // duplicate timestamp
      { fix: fix(55, 0, 10_500) }, // 0.5 s later
      { fix: fix(390, 0, 13_000) }, // 390 m in 3 s = 468 km/h
      { fix: fix(30, 0, 16_000) }, // fine
    ]);
    assert.deepEqual(result.rejected.map((r) => r.reason), ['OUT_OF_ORDER', 'OUT_OF_ORDER', 'TOO_FREQUENT', 'IMPLAUSIBLE_JUMP']);
    assert.equal(result.accepted.length, 1);
  });

  it('validates a batch against its own earlier members, not only the last stored fix', () => {
    const t = tracker();
    const { accepted, rejected } = t.validateSequence([{ fix: fix(0, 0, 1000) }, { fix: fix(10, 0, 1500) }, { fix: fix(20, 0, 4000) }]);
    assert.equal(accepted.length, 2);
    assert.equal(rejected[0].reason, 'TOO_FREQUENT');
  });

  it('smooths the observed moving speed and ignores standing still', () => {
    const t = tracker();
    t.apply(fix(0, 0, 0));
    t.apply(fix(50, 0, 10_000)); // 5 m/s
    assert.ok(Math.abs(t.speedMps! - 5) < 0.05);
    t.apply(fix(50, 0, 20_000)); // dwelling: not a speed sample
    assert.equal(t.speedSamples, 1);
    t.apply(fix(150, 0, 30_000)); // 10 m/s
    assert.ok(Math.abs(t.speedMps! - (0.3 * 10 + 0.7 * 5)) < 0.05);
  });

  it('never moves backwards because of small GPS jitter', () => {
    const t = tracker();
    t.apply(fix(200, 0, 0));
    t.apply(fix(185, 0, 5000));
    assert.ok(Math.abs(t.distanceAlong! - 200) < 0.5);
  });

  it('reports each stop reached once, including stops passed between two fixes', () => {
    const t = tracker();
    assert.deepEqual(t.apply(fix(0, 0, 0)), ['a']);
    assert.deepEqual(t.apply(fix(380, 0, 30_000)), ['b'], 'within the 35 m arrival radius');
    assert.deepEqual(t.apply(fix(400, 20, 40_000)), [], 'already reported');
    assert.deepEqual(t.apply(fix(390, 400, 140_000)), ['c'], 'passed the corner between fixes');
  });

  it('drives the signal state machine through its context', () => {
    const t = tracker();
    const thresholds = { staleAfterMs: 20_000, lostAfterMs: 60_000 };
    assert.equal(t.signal, SignalStates.AWAITING_FIX);
    t.apply(fix(0, 0, 1000));
    assert.equal(t.signal, SignalStates.LIVE);
    assert.equal(t.tick(25_000, thresholds), true);
    assert.equal(t.signal, SignalStates.STALE);
    assert.equal(t.tick(70_000, thresholds), true);
    assert.equal(t.signal, SignalStates.LOST);
    t.apply(fix(10, 0, 71_000));
    assert.equal(t.signal, SignalStates.LIVE);
  });
});
