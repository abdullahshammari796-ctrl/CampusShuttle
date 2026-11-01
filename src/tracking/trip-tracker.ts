import type { Route } from '../network/model.ts';
import type { AlongWindow, RoutePath } from '../network/route-path.ts';
import { type GeoPoint, haversineMeters } from '../shared/geo.ts';
import type { EtaContext } from './eta/eta-strategy.ts';
import type { LocationFix, Trip } from './model.ts';
import { type SignalState, type SignalThresholds, SignalStates } from './signal-state.ts';

export interface TrackerOptions {
  /** Movement implying more than this speed between two fixes is treated as a GPS glitch. */
  maxSpeedKmh: number;
  /** Fixes closer together than this (device time) are rejected to protect the server. */
  minFixIntervalMs: number;
  /** A stop counts as reached when the shuttle passes it or comes this close. */
  arrivalRadiusMeters: number;
  /** Small backwards movements up to this size are GPS jitter, not reversing. */
  backwardToleranceMeters: number;
  /** Exponential smoothing factor for the observed moving speed. */
  speedSmoothing: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  maxSpeedKmh: 110,
  minFixIntervalMs: 1000,
  arrivalRadiusMeters: 35,
  backwardToleranceMeters: 40,
  speedSmoothing: 0.3,
};

export type SequenceRejection = 'OUT_OF_ORDER' | 'TOO_FREQUENT' | 'IMPLAUSIBLE_JUMP';

const MOVING_THRESHOLD_MPS = 1;
const JUMP_MIN_DISTANCE_M = 50;
const ARRIVAL_DEDUPE_MS = 180_000;

/**
 * Live state of one active trip and the context object of the SignalState
 * pattern. Pure in-memory logic: no I/O, so it is fully unit-testable.
 */
export class TripTracker {
  trip: Trip;
  signal: SignalState = SignalStates.AWAITING_FIX;
  lastFix: LocationFix | null = null;
  distanceAlong: number | null = null;
  snapped: GeoPoint | null = null;
  offRouteMeters: number | null = null;
  speedMps: number | null = null;
  speedSamples = 0;
  readonly path: RoutePath;
  private readonly options: TrackerOptions;
  private readonly recentArrivals = new Map<string, number>();

  constructor(trip: Trip, path: RoutePath, options: TrackerOptions = DEFAULT_TRACKER_OPTIONS) {
    this.trip = trip;
    this.path = path;
    this.options = options;
  }

  /**
   * Checks fixes (sorted by time) against the last accepted fix and each other
   * without changing state, so they can be persisted before memory is updated.
   */
  validateSequence<T extends { fix: LocationFix }>(candidates: T[]): { accepted: T[]; rejected: Array<T & { reason: SequenceRejection }> } {
    const accepted: T[] = [];
    const rejected: Array<T & { reason: SequenceRejection }> = [];
    let previous = this.lastFix;
    for (const candidate of candidates) {
      const reason = previous ? this.sequenceProblem(previous, candidate.fix) : null;
      if (reason) {
        rejected.push({ ...candidate, reason });
      } else {
        accepted.push(candidate);
        previous = candidate.fix;
      }
    }
    return { accepted, rejected };
  }

  /** Applies an already-validated fix. Returns the ids of stops reached. */
  apply(fix: LocationFix): string[] {
    const previousAlong = this.distanceAlong;
    const projection = this.path.project(fix, this.searchWindow(fix));
    let along = projection.distanceAlong;

    if (previousAlong !== null && this.lastFix) {
      const delta = this.path.signedDelta(previousAlong, along);
      if (delta < 0 && -delta <= this.options.backwardToleranceMeters) along = previousAlong;
      const seconds = (fix.recordedAt - this.lastFix.recordedAt) / 1000;
      const moved = Math.max(0, this.path.signedDelta(previousAlong, along));
      if (seconds > 0) {
        const speed = moved / seconds;
        if (speed >= MOVING_THRESHOLD_MPS) {
          const a = this.options.speedSmoothing;
          this.speedMps = this.speedMps === null ? speed : a * speed + (1 - a) * this.speedMps;
          this.speedSamples++;
        }
      }
    }

    const reached = this.path
      .stopsReached(previousAlong, along, this.options.arrivalRadiusMeters)
      .filter((stopId) => {
        const last = this.recentArrivals.get(stopId);
        if (last !== undefined && fix.recordedAt - last < ARRIVAL_DEDUPE_MS) return false;
        this.recentArrivals.set(stopId, fix.recordedAt);
        return true;
      });

    this.lastFix = fix;
    this.distanceAlong = along;
    this.snapped = this.path.pointAt(along);
    this.offRouteMeters = projection.offsetMeters;
    this.signal = this.signal.onFix();
    return reached;
  }

  /** Restores position after a server restart (no speed history is available). */
  restore(fix: LocationFix): void {
    const projection = this.path.project(fix);
    this.lastFix = fix;
    this.distanceAlong = projection.distanceAlong;
    this.snapped = this.path.pointAt(projection.distanceAlong);
    this.offRouteMeters = projection.offsetMeters;
    this.signal = SignalStates.LIVE;
  }

  /** Lets time pass; returns true when the signal state changed. */
  tick(now: number, thresholds: SignalThresholds): boolean {
    const next = this.signal.onTick(this.ageMs(now), thresholds);
    const changed = next !== this.signal;
    this.signal = next;
    return changed;
  }

  ageMs(now: number): number {
    return Math.max(0, now - (this.lastFix?.recordedAt ?? this.trip.startedAt));
  }

  etaContext(route: Route): EtaContext | null {
    if (this.distanceAlong === null || !this.lastFix) return null;
    return {
      route,
      path: this.path,
      distanceAlong: this.distanceAlong,
      observedSpeedMps: this.speedMps,
      speedSamples: this.speedSamples,
      at: this.lastFix.recordedAt,
    };
  }

  private sequenceProblem(previous: LocationFix, fix: LocationFix): SequenceRejection | null {
    if (fix.recordedAt <= previous.recordedAt) return 'OUT_OF_ORDER';
    const ms = fix.recordedAt - previous.recordedAt;
    if (ms < this.options.minFixIntervalMs) return 'TOO_FREQUENT';
    const meters = haversineMeters(previous, fix);
    if (meters > JUMP_MIN_DISTANCE_M && (meters / (ms / 1000)) * 3.6 > this.options.maxSpeedKmh) return 'IMPLAUSIBLE_JUMP';
    return null;
  }

  private searchWindow(fix: LocationFix): AlongWindow | undefined {
    if (this.distanceAlong === null || !this.lastFix) return undefined;
    const seconds = Math.max(0, (fix.recordedAt - this.lastFix.recordedAt) / 1000);
    const reach = (this.options.maxSpeedKmh / 3.6) * seconds + 100;
    return {
      from: this.distanceAlong - this.options.backwardToleranceMeters - 20,
      to: this.distanceAlong + Math.min(reach, this.path.length),
    };
  }
}
