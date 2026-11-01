import { type GeoPoint, type XY, fromLocalXY, toLocalXY } from '../shared/geo.ts';
import { validationError } from '../shared/errors.ts';

export interface StopOffset {
  stopId: string;
  sequence: number;
  /** Distance from the start of the path to the stop, in metres. */
  distanceAlong: number;
}

export interface Projection {
  distanceAlong: number;
  /** Perpendicular distance between the raw GPS point and the route, in metres. */
  offsetMeters: number;
  point: GeoPoint;
}

export interface UpcomingStop {
  stopId: string;
  sequence: number;
  distanceAhead: number;
}

/** Range of along-route distances to search; `to` may exceed the length on loops. */
export interface AlongWindow {
  from: number;
  to: number;
}

/** Candidates closer than this to the best match count as ties; the earliest one forward wins. */
const TIE_METERS = 3;
/** Projections further apart than this along the route belong to different passes of the road. */
const SEPARATE_PASS_METERS = 50;
/** A stop further than this from the drawn path is almost certainly a data-entry error. */
const MAX_STOP_OFFSET_METERS = 60;

/**
 * Linear-referenced route geometry. Converts raw GPS positions into
 * "metres along the route", which is what ETA calculation needs.
 *
 * Routes may use the same road in both directions (out-and-back). A position
 * on such a road is ambiguous, so callers pass a search window around the
 * previous known progress and the projection prefers the earliest forward
 * match.
 */
export class RoutePath {
  readonly loop: boolean;
  readonly length: number;
  readonly stops: readonly StopOffset[];
  private readonly ref: GeoPoint;
  private readonly xy: XY[];
  private readonly cumulative: number[];

  constructor(path: readonly GeoPoint[], loop: boolean, stops: ReadonlyArray<{ id: string; lat: number; lng: number; name?: string }>) {
    if (path.length < 2) throw validationError('A route path needs at least two points.');
    const points = [...path];
    const first = points[0];
    const last = points[points.length - 1];
    if (loop && (first.lat !== last.lat || first.lng !== last.lng)) points.push(first);

    this.loop = loop;
    this.ref = first;
    this.xy = points.map((p) => toLocalXY(p, this.ref));
    this.cumulative = [0];
    for (let i = 1; i < this.xy.length; i++) {
      this.cumulative.push(this.cumulative[i - 1] + distance(this.xy[i - 1], this.xy[i]));
    }
    this.length = this.cumulative[this.cumulative.length - 1];
    if (!(this.length > 0)) throw validationError('A route path must have a positive length.');

    const offsets: StopOffset[] = [];
    let from = 0;
    stops.forEach((stop, sequence) => {
      const window = this.loop ? { from, to: from + this.length } : { from, to: this.length };
      const projection = this.project(stop, window);
      if (projection.offsetMeters > MAX_STOP_OFFSET_METERS) {
        throw validationError(
          `Stop "${stop.name ?? stop.id}" is ${Math.round(projection.offsetMeters)} m from the route path.`,
        );
      }
      offsets.push({ stopId: stop.id, sequence, distanceAlong: projection.distanceAlong });
      from = projection.distanceAlong;
    });
    this.stops = offsets;
  }

  /** Snap a GPS position onto the route, optionally restricted to a window of progress. */
  project(p: GeoPoint, window?: AlongWindow): Projection {
    const q = toLocalXY(p, this.ref);
    let best: { d: number; along: number; xy: XY; order: number } | null = null;

    for (let i = 0; i < this.xy.length - 1; i++) {
      if (window && !this.segmentInWindow(i, window)) continue;
      const a = this.xy[i];
      const b = this.xy[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t = len2 === 0 ? 0 : clamp(((q.x - a.x) * abx + (q.y - a.y) * aby) / len2, 0, 1);
      const px = a.x + t * abx;
      const py = a.y + t * aby;
      const d = Math.hypot(q.x - px, q.y - py);
      const along = this.cumulative[i] + t * Math.sqrt(len2);
      const order = window ? this.forwardFrom(window.from, along) : along;
      // Near-equal candidates on *different passes* of the route (e.g. the two lanes of an
      // out-and-back road) are ambiguous: take the earliest one forward. Candidates on the same
      // stretch of road (e.g. two segments meeting at a corner) are simply compared by distance.
      const separatePass = best !== null && Math.abs(along - best.along) > SEPARATE_PASS_METERS;
      const better = !best || (separatePass
        ? d < best.d - TIE_METERS || (Math.abs(d - best.d) <= TIE_METERS && order < best.order)
        : d < best.d);
      if (better) best = { d, along, xy: { x: px, y: py }, order };
    }

    if (!best) return this.project(p);
    const distanceAlong = this.loop && best.along >= this.length ? 0 : best.along;
    return { distanceAlong, offsetMeters: best.d, point: fromLocalXY(best.xy, this.ref) };
  }

  /** Position at a given progress along the route (wraps on loops, clamps otherwise). */
  pointAt(distanceAlong: number): GeoPoint {
    const d = this.normalize(distanceAlong);
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= d) lo = mid;
      else hi = mid;
    }
    const segLength = this.cumulative[hi] - this.cumulative[lo];
    const t = segLength === 0 ? 0 : (d - this.cumulative[lo]) / segLength;
    const a = this.xy[lo];
    const b = this.xy[hi];
    return fromLocalXY({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, this.ref);
  }

  /** Forward distance from one progress value to another; null when a linear route has already passed it. */
  distanceAhead(from: number, to: number): number | null {
    if (this.loop) return this.forwardFrom(from, to);
    return to >= from - 1e-9 ? Math.max(0, to - from) : null;
  }

  /** Signed movement between two progress values; on loops the shortest way round. */
  signedDelta(from: number, to: number): number {
    if (!this.loop) return to - from;
    let d = this.forwardFrom(from, to);
    if (d > this.length / 2) d -= this.length;
    return d;
  }

  /** Stops still to be visited, nearest first. On a loop every stop is upcoming exactly once. */
  upcomingStops(distanceAlong: number): UpcomingStop[] {
    const result: UpcomingStop[] = [];
    for (const stop of this.stops) {
      const ahead = this.distanceAhead(distanceAlong, stop.distanceAlong);
      if (ahead !== null) result.push({ stopId: stop.stopId, sequence: stop.sequence, distanceAhead: ahead });
    }
    return result.sort((a, b) => a.distanceAhead - b.distanceAhead);
  }

  /** Stops crossed when moving forward from `from` to `to`, plus any within `radius` ahead of `to`. */
  stopsReached(from: number | null, to: number, radius: number): string[] {
    const reached: string[] = [];
    const travelled = from === null ? 0 : this.distanceAhead(from, to) ?? 0;
    for (const stop of this.stops) {
      const fromPrev = from === null ? null : this.distanceAhead(from, stop.distanceAlong);
      const crossed = fromPrev !== null && fromPrev > 0 && fromPrev <= travelled;
      const ahead = this.distanceAhead(to, stop.distanceAlong);
      const behindRadius = this.loop ? this.length - this.forwardFrom(to, stop.distanceAlong) : to - stop.distanceAlong;
      const near = (ahead !== null && ahead <= radius) || (behindRadius >= 0 && behindRadius <= radius);
      if (crossed || near) reached.push(stop.stopId);
    }
    return reached;
  }

  /** The drawn geometry, for map rendering. */
  points(): GeoPoint[] {
    return this.xy.map((p) => fromLocalXY(p, this.ref));
  }

  private normalize(d: number): number {
    if (this.loop) return ((d % this.length) + this.length) % this.length;
    return clamp(d, 0, this.length);
  }

  private forwardFrom(from: number, to: number): number {
    if (!this.loop) return to - from;
    return (((to - from) % this.length) + this.length) % this.length;
  }

  private segmentInWindow(i: number, window: AlongWindow): boolean {
    const start = this.cumulative[i];
    const end = this.cumulative[i + 1];
    if (!this.loop) return start <= window.to && Math.max(0, window.from) <= end;
    if (window.to - window.from >= this.length) return true;
    const from = this.normalize(window.from);
    const to = from + (window.to - window.from);
    return (start <= to && from <= end) || (start + this.length <= to && from <= end + this.length);
  }
}

function distance(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
