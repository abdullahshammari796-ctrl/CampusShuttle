// Driver-side location pipeline.
//
//   GpsSource (Adapter)  ──fix──▶  LocationUploader (queue + retry)  ──batch──▶  POST /locations
//
// Two interchangeable GPS sources share one interface — start(onFix, onError),
// stop() — so the rest of the driver app does not care whether positions come
// from the phone's GPS or from the simulator used in demonstrations.

import { ApiError, api } from './api.js';

const R = 6371008.8;
const RAD = Math.PI / 180;

function toXY(p, ref) {
  return { x: (p.lng - ref.lng) * RAD * R * Math.cos(ref.lat * RAD), y: (p.lat - ref.lat) * RAD * R };
}
function fromXY(p, ref) {
  return { lat: ref.lat + p.y / (RAD * R), lng: ref.lng + p.x / (RAD * R * Math.cos(ref.lat * RAD)) };
}

/** Real device GPS via the browser Geolocation API (needs HTTPS or localhost). */
export class DeviceGps {
  constructor({ minIntervalMs = 2000 } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.watchId = null;
    this.lastAt = 0;
    this.kind = 'device';
  }

  start(onFix, onError) {
    if (!('geolocation' in navigator)) {
      onError(new Error('This browser has no GPS/geolocation support.'));
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.timestamp - this.lastAt < this.minIntervalMs) return;
        this.lastAt = pos.timestamp;
        const c = pos.coords;
        onFix({
          lat: c.latitude,
          lng: c.longitude,
          speedKmh: Number.isFinite(c.speed) && c.speed !== null ? c.speed * 3.6 : null,
          headingDeg: Number.isFinite(c.heading) && c.heading !== null ? c.heading : null,
          accuracyM: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
          recordedAt: pos.timestamp,
          source: 'device',
        });
      },
      (err) => onError(err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

/**
 * Drives a virtual shuttle along the route geometry at a chosen speed, pauses
 * at stops, adds GPS noise, and can simulate a GPS outage. Makes the whole
 * system demonstrable without vehicles.
 */
export class SimulatedGps {
  constructor({ path, loop, stops, dwellSeconds, speedKmh = 25, intervalMs = 3000, startAlong = 0, noiseMeters = 4 }) {
    this.kind = 'simulator';
    this.ref = path[0];
    const pts = [...path];
    if (loop && (pts[0].lat !== pts[pts.length - 1].lat || pts[0].lng !== pts[pts.length - 1].lng)) pts.push(pts[0]);
    this.xy = pts.map((p) => toXY(p, this.ref));
    this.cum = [0];
    for (let i = 1; i < this.xy.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.xy[i].x - this.xy[i - 1].x, this.xy[i].y - this.xy[i - 1].y));
    this.length = this.cum[this.cum.length - 1];
    this.loop = loop;
    this.stopOffsets = this.placeStops(stops);
    this.dwellMs = dwellSeconds * 1000;
    this.speedKmh = speedKmh;
    this.intervalMs = intervalMs;
    this.noiseMeters = noiseMeters;
    this.along = startAlong;
    this.outage = false;
    this.dwellUntil = 0;
    this.timer = null;
  }

  start(onFix) {
    this.onFix = onFix;
    this.lastStepAt = Date.now();
    this.emit(Date.now());
    this.timer = setInterval(() => this.step(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  setSpeed(kmh) {
    this.speedKmh = kmh;
  }

  setOutage(on) {
    this.outage = on;
  }

  get dwelling() {
    return Date.now() < this.dwellUntil;
  }

  /** A position 1.5 km off the route, to demonstrate server-side glitch filtering. */
  glitchFix() {
    const p = this.pointAt(this.along);
    return { lat: p.lat + 0.0135, lng: p.lng, speedKmh: this.speedKmh, headingDeg: null, accuracyM: 8, recordedAt: Date.now(), source: 'simulator' };
  }

  step() {
    const now = Date.now();
    const dt = (now - this.lastStepAt) / 1000;
    this.lastStepAt = now;
    if (now >= this.dwellUntil) {
      const before = this.along;
      let after = before + (this.speedKmh / 3.6) * dt;
      const crossed = this.stopOffsets.find((s) => this.isBetween(before, after, s));
      if (crossed !== undefined) {
        after = crossed;
        this.dwellUntil = now + this.dwellMs;
      }
      if (this.loop) after %= this.length;
      else after = Math.min(after, this.length);
      this.along = after;
    }
    if (!this.outage) this.emit(now);
  }

  emit(now) {
    const p = this.pointAt(this.along);
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.random() * this.noiseMeters;
    const noisy = fromXY({ x: toXY(p, this.ref).x + r * Math.cos(angle), y: toXY(p, this.ref).y + r * Math.sin(angle) }, this.ref);
    this.onFix({
      lat: Math.round(noisy.lat * 1e7) / 1e7,
      lng: Math.round(noisy.lng * 1e7) / 1e7,
      speedKmh: this.dwelling ? 0 : this.speedKmh,
      headingDeg: null,
      accuracyM: 5 + Math.round(Math.random() * 6),
      recordedAt: now,
      source: 'simulator',
    });
  }

  isBetween(before, after, stop) {
    if (after <= this.length) return stop > before && stop <= after;
    return stop > before || stop <= after - this.length;
  }

  pointAt(d) {
    const dd = this.loop ? ((d % this.length) + this.length) % this.length : Math.min(Math.max(d, 0), this.length);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < dd) i++;
    const seg = this.cum[i] - this.cum[i - 1];
    const t = seg === 0 ? 0 : (dd - this.cum[i - 1]) / seg;
    const a = this.xy[i - 1];
    const b = this.xy[i];
    return fromXY({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, this.ref);
  }

  /** Stops lie on the path; find each one's distance along it, searching forward from the previous stop. */
  placeStops(stops) {
    const offsets = [];
    let from = 0;
    for (const stop of stops) {
      const q = toXY(stop, this.ref);
      let best = null;
      for (let i = 0; i < this.xy.length - 1; i++) {
        const a = this.xy[i];
        const b = this.xy[i + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby;
        const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((q.x - a.x) * abx + (q.y - a.y) * aby) / len2));
        const d = Math.hypot(q.x - (a.x + t * abx), q.y - (a.y + t * aby));
        const along = this.cum[i] + t * Math.sqrt(len2);
        const order = (((along - from) % this.length) + this.length) % this.length;
        // Same rule as the server's RoutePath: earliest-forward only between separate passes of the road.
        const separatePass = best && Math.abs(along - best.along) > 50;
        const better = !best || (separatePass ? d < best.d - 3 || (Math.abs(d - best.d) <= 3 && order < best.order) : d < best.d);
        if (better) best = { d, along, order };
      }
      offsets.push(best.along);
      from = best.along;
    }
    // On a loop the first stop (offset 0) is reached again at the end of each lap.
    return offsets.map((o) => (this.loop && o < 0.5 ? this.length : o)).filter((o) => o > 0);
  }
}

/**
 * Store-and-forward uploader: fixes are queued locally, sent in batches, and
 * retried with exponential backoff when the network fails. The server
 * re-orders, de-duplicates and corrects device clock skew using `sentAt`.
 *
 * Bounded guarantee (QA-4): the queue lives in this page's memory and keeps
 * the newest `maxQueue` fixes. Fixes are lost if the page is closed or
 * reloaded, if the queue overflows (oldest dropped, counted in `dropped`), and
 * the server rejects fixes that are more than 10 minutes old when they arrive.
 */
export class LocationUploader {
  constructor(tripId, { onResult, onStatus, onEnded, batchSize = 50, maxQueue = 500 } = {}) {
    this.tripId = tripId;
    this.onResult = onResult || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onEnded = onEnded || (() => {});
    this.batchSize = batchSize;
    this.maxQueue = maxQueue;
    this.queue = [];
    this.inflight = false;
    this.networkDown = false;
    this.paused = false;
    this.backoffMs = 0;
    this.retryAt = 0;
    this.retryTimer = null;
    this.dropped = 0;
    this.stopped = false;
    this.lastError = null;
  }

  push(fix) {
    if (this.stopped) return;
    this.queue.push(fix);
    if (this.queue.length > this.maxQueue) {
      this.dropped += this.queue.length - this.maxQueue;
      this.queue.splice(0, this.queue.length - this.maxQueue);
    }
    this.flush();
  }

  /** Simulates losing mobile data (fixes keep being recorded and queued). */
  setNetworkDown(down) {
    this.networkDown = down;
    this.report();
    if (!down) {
      this.backoffMs = 0;
      this.flush();
    }
  }

  /** Keeps queueing fixes but sends nothing (used while the end-trip request is pending). */
  pause() {
    this.paused = true;
    this.report();
  }

  resume() {
    this.paused = false;
    this.report();
    this.flush();
  }

  /**
   * Resolves true once every queued fix has been delivered (an upload already
   * in flight is waited for), or false if that is not possible within
   * `timeoutMs` (network down, uploader stopped or paused, still retrying).
   */
  async drain(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (!this.inflight && this.queue.length === 0) return true;
      if (this.stopped || this.networkDown || this.paused || Date.now() >= deadline) return false;
      if (!this.inflight && !this.retryTimer) this.flush();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  status() {
    let state = 'idle';
    if (this.stopped) state = 'stopped';
    else if (this.networkDown) state = 'offline';
    else if (this.paused) state = 'paused';
    else if (this.retryTimer) state = 'retrying';
    else if (this.inflight) state = 'sending';
    return { state, queued: this.queue.length, dropped: this.dropped, retryInMs: Math.max(0, this.retryAt - Date.now()), lastError: this.lastError };
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  async flush() {
    if (this.stopped || this.inflight || this.networkDown || this.paused || this.retryTimer || this.queue.length === 0) return this.report();
    const batch = this.queue.slice(0, this.batchSize);
    this.inflight = true;
    this.report();
    try {
      const result = await api(`/api/driver/trips/${encodeURIComponent(this.tripId)}/locations`, {
        method: 'POST',
        body: { fixes: batch, sentAt: Date.now() },
      });
      this.queue.splice(0, batch.length);
      this.backoffMs = 0;
      this.lastError = null;
      this.onResult(result, batch.length);
    } catch (e) {
      this.lastError = e.message;
      if (e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 403)) {
        this.stop();
        this.onEnded(e);
      } else if (e instanceof ApiError && e.status === 400) {
        this.queue.splice(0, batch.length); // malformed batch: retrying would fail forever
      } else {
        this.backoffMs = Math.min(15_000, this.backoffMs ? this.backoffMs * 2 : 1000);
        this.retryAt = Date.now() + this.backoffMs;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.flush();
        }, this.backoffMs);
      }
    } finally {
      this.inflight = false;
    }
    this.report();
    if (this.queue.length > 0 && !this.retryTimer && !this.networkDown && !this.paused && !this.stopped) this.flush();
  }

  report() {
    this.onStatus(this.status());
  }
}
