import { type EtaContext, type EtaStrategy, type StopEta, etasAtSpeed, kmhToMps } from './eta-strategy.ts';

/** Baseline: remaining distance at the route's timetabled average speed. */
export class NominalSpeedEta implements EtaStrategy {
  readonly id = 'nominal-speed';
  readonly description = "Remaining route distance at the route's planned average speed, plus dwell time per stop.";

  estimate(ctx: EtaContext): StopEta[] {
    return etasAtSpeed(ctx, kmhToMps(ctx.route.nominalSpeedKmh));
  }
}
