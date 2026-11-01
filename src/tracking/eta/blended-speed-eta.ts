import { type EtaContext, type EtaStrategy, type StopEta, etasAtSpeed, kmhToMps } from './eta-strategy.ts';

export interface BlendedSpeedOptions {
  /** Weight of the observed speed once enough samples exist (0..1). */
  liveWeight: number;
  minSamples: number;
  minKmh: number;
  maxKmh: number;
}

const DEFAULTS: BlendedSpeedOptions = { liveWeight: 0.6, minSamples: 3, minKmh: 8, maxKmh: 50 };

/**
 * Default strategy: blends the shuttle's recently observed moving speed with
 * the planned speed, so one traffic jam or one fast stretch does not swing
 * every ETA. Falls back to the planned speed until enough samples exist.
 */
export class BlendedSpeedEta implements EtaStrategy {
  readonly id = 'blended-speed';
  readonly description = 'Planned speed blended 40/60 with the recently observed moving speed (clamped 8–50 km/h), plus dwell time per stop.';
  private readonly options: BlendedSpeedOptions;

  constructor(options: Partial<BlendedSpeedOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  speedFor(ctx: EtaContext): number {
    const nominal = kmhToMps(ctx.route.nominalSpeedKmh);
    if (ctx.observedSpeedMps === null || ctx.speedSamples < this.options.minSamples) return nominal;
    const w = this.options.liveWeight;
    const blended = w * ctx.observedSpeedMps + (1 - w) * nominal;
    return Math.min(kmhToMps(this.options.maxKmh), Math.max(kmhToMps(this.options.minKmh), blended));
  }

  estimate(ctx: EtaContext): StopEta[] {
    return etasAtSpeed(ctx, this.speedFor(ctx));
  }
}
