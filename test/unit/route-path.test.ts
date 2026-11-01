import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoutePath } from '../../src/network/route-path.ts';
import { DEMO_ROUTES, DEMO_STOPS } from '../../src/seed/demo-data.ts';
import { AppError } from '../../src/shared/errors.ts';
import { fromLocalXY } from '../../src/shared/geo.ts';

const ORIGIN = { lat: 25.2, lng: 55.26 };
const at = (x: number, y: number) => fromLocalXY({ x, y }, ORIGIN);
const stop = (id: string, x: number, y: number) => ({ id, ...at(x, y) });

// A 400 m × 400 m square loop with a stop at each corner.
const square = new RoutePath([at(0, 0), at(400, 0), at(400, 400), at(0, 400)], true, [
  stop('a', 0, 0), stop('b', 400, 0), stop('c', 400, 400), stop('d', 0, 400),
]);

describe('RoutePath (linear referencing)', () => {
  it('closes loops and measures their length', () => {
    assert.ok(Math.abs(square.length - 1600) < 0.5, `length ${square.length}`);
    assert.deepEqual(square.stops.map((s) => Math.round(s.distanceAlong)), [0, 400, 800, 1200]);
  });

  it('snaps an off-route GPS point onto the route and reports the offset', () => {
    const p = square.project(at(200, 12));
    assert.ok(Math.abs(p.distanceAlong - 200) < 0.5);
    assert.ok(Math.abs(p.offsetMeters - 12) < 0.5);
  });

  it('projects points just past a corner exactly (regression: found by the load test)', () => {
    for (const d of [399, 400, 401, 405, 1201]) assert.ok(Math.abs(square.project(square.pointAt(d)).distanceAlong - d) < 1e-6, `at ${d} m`);
  });

  it('lists upcoming stops nearest first, wrapping around a loop', () => {
    const upcoming = square.upcomingStops(1000);
    assert.deepEqual(upcoming.map((u) => u.stopId), ['d', 'a', 'b', 'c']);
    assert.ok(Math.abs(upcoming[0].distanceAhead - 200) < 0.5);
    assert.ok(Math.abs(upcoming[1].distanceAhead - 600) < 0.5);
  });

  it('detects stops crossed between two positions, including across the loop seam', () => {
    assert.deepEqual(square.stopsReached(350, 450, 10), ['b']);
    assert.deepEqual(square.stopsReached(1550, 50, 10).sort(), ['a']);
    assert.deepEqual(square.stopsReached(100, 150, 10), []);
  });

  it('interpolates positions and wraps on loops', () => {
    const p = square.pointAt(1600 + 200);
    const q = at(200, 0);
    assert.ok(Math.abs(p.lat - q.lat) < 1e-7 && Math.abs(p.lng - q.lng) < 1e-7);
  });

  it('treats passed stops on a linear route as not upcoming', () => {
    const line = new RoutePath([at(0, 0), at(1000, 0)], false, [stop('s1', 0, 0), stop('s2', 500, 0), stop('s3', 1000, 0)]);
    assert.deepEqual(line.upcomingStops(600).map((u) => u.stopId), ['s3']);
    assert.equal(line.distanceAhead(600, 500), null);
  });

  it('uses the search window to stay on the correct lane of an out-and-back road', () => {
    const metro = DEMO_ROUTES.find((r) => r.id === 'metro-link')!;
    const stops = metro.stopIds.map((id) => DEMO_STOPS.find((s) => s.id === id)!);
    const path = new RoutePath(metro.path, true, stops);
    const outbound = path.stops.find((s) => s.stopId === 'innovation-out')!.distanceAlong;
    const inbound = path.stops.find((s) => s.stopId === 'innovation-in')!.distanceAlong;
    assert.ok(inbound > outbound + 1000, 'inbound stop is placed on the return leg');

    // A GPS point between the two lanes (≈4 m from each) is ambiguous without context.
    const between = at(597, -563);
    const onReturn = path.project(between, { from: inbound - 200, to: inbound + 200 });
    const onOutbound = path.project(between, { from: outbound - 200, to: outbound + 200 });
    assert.ok(Math.abs(onReturn.distanceAlong - inbound) < 20);
    assert.ok(Math.abs(onOutbound.distanceAlong - outbound) < 20);
  });

  it('rejects a stop that is far away from the drawn path', () => {
    assert.throws(
      () => new RoutePath([at(0, 0), at(1000, 0)], false, [stop('x', 0, 0), stop('far', 500, 300)]),
      (e: unknown) => e instanceof AppError && e.code === 'VALIDATION',
    );
  });

  it('places every stop of every demo route on its path', () => {
    for (const route of DEMO_ROUTES) {
      const stops = route.stopIds.map((id) => DEMO_STOPS.find((s) => s.id === id)!);
      const path = new RoutePath(route.path, route.loop, stops);
      assert.equal(path.stops.length, route.stopIds.length, route.id);
      for (let i = 1; i < path.stops.length; i++) assert.ok(path.stops[i].distanceAlong > path.stops[i - 1].distanceAlong, `${route.id} stop order`);
    }
  });
});
