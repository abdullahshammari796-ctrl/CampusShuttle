import type { DemandService } from '../demand/demand-service.ts';
import type { WaitingService } from '../demand/waiting-service.ts';
import type { AuthService } from '../identity/auth-service.ts';
import type { NetworkService } from '../network/network-service.ts';
import type { SseHub } from '../realtime/sse-hub.ts';
import type { AuditLog } from '../shared/audit.ts';
import type { Clock } from '../shared/clock.ts';
import type { TrackingService } from '../tracking/tracking-service.ts';

/** Application services the HTTP adapter is allowed to call. */
export interface WebDeps {
  auth: AuthService;
  network: NetworkService;
  tracking: TrackingService;
  waiting: WaitingService;
  demand: DemandService;
  hub: SseHub;
  audit: AuditLog;
  clock: Clock;
  systemInfo: () => Record<string, unknown>;
  settings: {
    publicDir: string;
    secureCookies: boolean;
    sessionTtlMs: number;
  };
}
