import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Route } from '../../src/network/model.ts';
import { RoutePath } from '../../src/network/route-path.ts';
import { fromLocalXY } from '../../src/shared/geo.ts';
import { BlendedSpeedEta } from '../../src/tracking/eta/blended-speed-eta.ts';
import type { EtaContext } from '../../src/tracking/eta/eta-strategy.ts';
import { NominalSpeedEta } from '../../src/tracking/eta/nominal-speed-eta.ts';

const ORIGIN = { lat: 25.2, lng: 55.26 };
const at = (x: number, y: number) => fromLocalXY({ x, y }, ORIGIN);
// Straight 3 km line with stops every kilometre.
const path = new RoutePath([at(0, 0), at(3000, 0)], false, [
  { id: 's0', ...at(0, 0) }, { id: 's1', ...at(1000, 0) }, { id: 's2', ...at(2000, 0) }, { id: 's3', ...at(3000, 0) },
]);
const route: Route = {
  id: 'r', name: 'Test', color: '#000000', stopIds: ['s0', 's1', 's2', 's3'], path: [], loop: false,
  nominalSpeedKmh: 36, dwellSeconds: 30, active: true, updatedAt: 0,
};
const ctx = (over: Partial<EtaContext> = {}): EtaContext => ({
  route, path, distanceAlong: 500, observedSpeedMps: null, speedSamples: 0, at: 1_000_000, ...over,
});

describe('ETA strategies (Strategy pattern)', () => {
  it('nominal speed: distance / planned speed plus dwell at each intermediate stop', () => {
    const etas = new NominalSpeedEta().estimate(ctx());
    // 36 km/h = 10 m/s. s1: 500 m → 50 s. s2: 1500 m → 150 s + 1 dwell (30) = 180 s. s3: 2500 m → 250 + 60 = 310 s.
    assert.deepEqual(etas.map((e) => [e.stopId, e.etaSeconds]), [['s1', 50], ['s2', 180], ['s3', 310]]);
    assert.equal(etas[0].arrivalAt, 1_000_000 + 50_000);
  });

  it('blended speed falls back to the planned speed until it has enough samples', () => {
    const strategy = new BlendedSpeedEta();
    assert.equal(strategy.speedFor(ctx({ observedSpeedMps: 2, speedSamples: 2 })), 10);
  });

  it('blended speed mixes 60 % observed with 40 % planned speed', () => {
    const strategy = new BlendedSpeedEta();
    const v = strategy.speedFor(ctx({ observedSpeedMps: 5, speedSamples: 5 }));
    assert.ok(Math.abs(v - (0.6 * 5 + 0.4 * 10)) < 1e-9);
    assert.equal(strategy.estimate(ctx({ observedSpeedMps: 5, speedSamples: 5 }))[0].etaSeconds, Math.round(500 / 7));
  });

  it('blended speed is clamped so a traffic jam or a GPS spike cannot produce absurd ETAs', () => {
    const strategy = new BlendedSpeedEta({ liveWeight: 1 }); // isolate the clamp from the blending
    const kmh = (mps: number) => mps * 3.6;
    assert.ok(Math.abs(kmh(strategy.speedFor(ctx({ observedSpeedMps: 0.1, speedSamples: 9 }))) - 8) < 1e-9);
    assert.ok(Math.abs(kmh(strategy.speedFor(ctx({ observedSpeedMps: 60, speedSamples: 9 }))) - 50) < 1e-9);
  });
});
