import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StopEta } from '../../src/tracking/eta/eta-strategy.ts';
import { SignalStates } from '../../src/tracking/signal-state.ts';

const T = { staleAfterMs: 20_000, lostAfterMs: 60_000 };
const etas: StopEta[] = [
  { stopId: 'a', sequence: 0, distanceMeters: 100, etaSeconds: 20, arrivalAt: 1_020_000 },
  { stopId: 'b', sequence: 1, distanceMeters: 900, etaSeconds: 180, arrivalAt: 1_180_000 },
];

describe('GPS signal state machine (State pattern)', () => {
  it('starts awaiting a fix and becomes LIVE on the first fix', () => {
    assert.equal(SignalStates.AWAITING_FIX.onFix(), SignalStates.LIVE);
  });

  it('a trip that never sends a position is eventually LOST', () => {
    assert.equal(SignalStates.AWAITING_FIX.onTick(30_000, T), SignalStates.AWAITING_FIX);
    assert.equal(SignalStates.AWAITING_FIX.onTick(61_000, T), SignalStates.LOST);
  });

  it('LIVE → STALE → LOST as the newest fix ages, exactly at the thresholds', () => {
    assert.equal(SignalStates.LIVE.onTick(20_000, T), SignalStates.LIVE);
    assert.equal(SignalStates.LIVE.onTick(20_001, T), SignalStates.STALE);
    assert.equal(SignalStates.STALE.onTick(60_000, T), SignalStates.STALE);
    assert.equal(SignalStates.STALE.onTick(60_001, T), SignalStates.LOST);
    assert.equal(SignalStates.LIVE.onTick(90_000, T), SignalStates.LOST, 'can skip STALE after a long silence');
  });

  it('recovers to LIVE from any degraded state when a fix arrives', () => {
    assert.equal(SignalStates.STALE.onFix(), SignalStates.LIVE);
    assert.equal(SignalStates.LOST.onFix(), SignalStates.LIVE);
    assert.equal(SignalStates.LOST.onTick(999_999, T), SignalStates.LOST);
  });

  it('each state presents ETAs honestly', () => {
    const live = SignalStates.LIVE.present(etas, 1_000_000);
    assert.ok(live.every((e) => e.confidence === 'live' && !e.overdue));

    const stale = SignalStates.STALE.present(etas, 1_030_000);
    assert.deepEqual(stale.map((e) => [e.confidence, e.overdue]), [['approximate', true], ['approximate', false]]);

    assert.deepEqual(SignalStates.LOST.present(etas, 1_000_000), [], 'no ETA without a position');
    assert.deepEqual(SignalStates.AWAITING_FIX.present(etas, 1_000_000), []);
    assert.match(SignalStates.LOST.message(125_000), /lost.*2 min/);
  });
});
