import type { StopEta } from './eta/eta-strategy.ts';

export type SignalStatus = 'AWAITING_FIX' | 'LIVE' | 'STALE' | 'LOST';
export type EtaConfidence = 'live' | 'approximate' | 'none';

export interface SignalThresholds {
  staleAfterMs: number;
  lostAfterMs: number;
}

export interface PresentedEta extends StopEta {
  confidence: EtaConfidence;
  /** The predicted arrival time has passed without a newer position (stale data). */
  overdue: boolean;
}

/**
 * State pattern for the GPS feed of an active trip.
 *
 * Each state decides (1) how it reacts to a new fix or to time passing and
 * (2) how much of the ETA information it is honest to show passengers.
 * The TripTracker (the context) simply delegates to its current state, so
 * there are no status `switch` statements spread through the code.
 *
 *   AWAITING_FIX --fix--> LIVE --(age > stale)--> STALE --(age > lost)--> LOST
 *        |                 ^                        |                       |
 *        +--(age > lost)---|--------fix-------------+----------fix----------+
 */
export interface SignalState {
  readonly status: SignalStatus;
  readonly etaConfidence: EtaConfidence;
  onFix(): SignalState;
  /** `ageMs` is the age of the newest accepted fix, or of the trip start if there is none. */
  onTick(ageMs: number, thresholds: SignalThresholds): SignalState;
  present(etas: StopEta[], now: number): PresentedEta[];
  message(ageMs: number): string;
}

class AwaitingFixState implements SignalState {
  readonly status = 'AWAITING_FIX';
  readonly etaConfidence = 'none';
  onFix(): SignalState {
    return LIVE;
  }
  onTick(ageMs: number, t: SignalThresholds): SignalState {
    return ageMs > t.lostAfterMs ? LOST : this;
  }
  present(): PresentedEta[] {
    return [];
  }
  message(): string {
    return 'Trip started · waiting for the first GPS position';
  }
}

class LiveState implements SignalState {
  readonly status = 'LIVE';
  readonly etaConfidence = 'live';
  onFix(): SignalState {
    return this;
  }
  onTick(ageMs: number, t: SignalThresholds): SignalState {
    if (ageMs > t.lostAfterMs) return LOST;
    if (ageMs > t.staleAfterMs) return STALE;
    return this;
  }
  present(etas: StopEta[]): PresentedEta[] {
    return etas.map((eta) => ({ ...eta, confidence: 'live', overdue: false }));
  }
  message(ageMs: number): string {
    return `Live · updated ${formatAge(ageMs)} ago`;
  }
}

class StaleState implements SignalState {
  readonly status = 'STALE';
  readonly etaConfidence = 'approximate';
  onFix(): SignalState {
    return LIVE;
  }
  onTick(ageMs: number, t: SignalThresholds): SignalState {
    return ageMs > t.lostAfterMs ? LOST : this;
  }
  present(etas: StopEta[], now: number): PresentedEta[] {
    return etas.map((eta) => ({ ...eta, confidence: 'approximate', overdue: eta.arrivalAt < now }));
  }
  message(ageMs: number): string {
    return `Location delayed · last update ${formatAge(ageMs)} ago · times are approximate`;
  }
}

class LostState implements SignalState {
  readonly status = 'LOST';
  readonly etaConfidence = 'none';
  onFix(): SignalState {
    return LIVE;
  }
  onTick(): SignalState {
    return this;
  }
  present(): PresentedEta[] {
    return [];
  }
  message(ageMs: number): string {
    return `GPS signal lost · last seen ${formatAge(ageMs)} ago`;
  }
}

const AWAITING_FIX: SignalState = new AwaitingFixState();
const LIVE: SignalState = new LiveState();
const STALE: SignalState = new StaleState();
const LOST: SignalState = new LostState();

export const SignalStates = { AWAITING_FIX, LIVE, STALE, LOST } as const;

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
