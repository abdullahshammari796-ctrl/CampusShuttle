import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimulatedGps } from '../../public/js/gps.js';

const path = [{ lat: 25, lng: 55 }, { lat: 25.002, lng: 55 }, { lat: 25.004, lng: 55 }];
const make = (options = {}) => new SimulatedGps({ path, loop: false, stops: [path[1]], dwellSeconds: 10,
  noiseMeters: 0, speedKmh: 36, intervalMs: 1000, startAlong: 0, ...options });

describe('SimulatedGps', () => {
  it('projects a stop onto the correct segment instead of a nearby endpoint', () => {
    const gps = make();
    assert.ok(Math.abs(gps.stopOffsets[0] - 222.39) < 0.1);
    assert.ok(Math.abs(gps.pointAt(gps.stopOffsets[0]).lat - path[1].lat) < 1e-9);
  });
  it('clamps a non-loop route and wraps a loop at the route boundary', () => {
    const straight = make();
    assert.ok(Math.abs(straight.pointAt(straight.length + 50).lat - path[2].lat) < 1e-9);
    const loop = make({ loop: true });
    assert.deepEqual(loop.pointAt(loop.length + 50), loop.pointAt(50));
  });
  it('dwells at a crossed stop and resumes after the dwell duration', (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
    const gps = make({ startAlong: 220 });
    const fixes: any[] = [];
    gps.start((fix: any) => fixes.push(fix));
    t.mock.timers.tick(1000);
    const stoppedAt = gps.along;
    assert.ok(gps.dwelling);
    assert.equal(fixes.at(-1).speedKmh, 0);
    t.mock.timers.tick(9000);
    assert.equal(gps.along, stoppedAt);
    t.mock.timers.tick(1000);
    assert.ok(gps.along > stoppedAt);
    gps.stop();
  });
  it('moves during an outage, emits nothing, then resumes from the current position', (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
    const gps = make({ stops: [] });
    const fixes: any[] = [];
    gps.start((fix: any) => fixes.push(fix));
    gps.setOutage(true);
    t.mock.timers.tick(3000);
    assert.equal(fixes.length, 1);
    assert.ok(gps.along > 0);
    gps.setOutage(false);
    t.mock.timers.tick(1000);
    assert.equal(fixes.length, 2);
    assert.ok(fixes[1].lat > fixes[0].lat);
    assert.equal(fixes[1].recordedAt, 104_000);
    gps.stop();
    t.mock.timers.tick(5000);
    assert.equal(fixes.length, 2);
  });
});
