import type { WaitingService } from '../demand/waiting-service.ts';
import type { Role } from '../identity/model.ts';
import type { TrackingService } from '../tracking/tracking-service.ts';
import type { VehicleView } from '../tracking/views.ts';

/** What the real-time gateway needs to know about current state. */
export interface LiveDataSource {
  snapshot(role: Role): { vehicles: VehicleView[]; waiting: Record<string, number> };
  vehicle(tripId: string): VehicleView | null;
}

/** Read model combining the tracking and demand modules for live clients. */
export class LiveView implements LiveDataSource {
  private readonly tracking: TrackingService;
  private readonly waiting: WaitingService;

  constructor(tracking: TrackingService, waiting: WaitingService) {
    this.tracking = tracking;
    this.waiting = waiting;
  }

  snapshot(): { vehicles: VehicleView[]; waiting: Record<string, number> } {
    return { vehicles: this.tracking.liveVehicles(), waiting: this.waiting.countsByStop() };
  }

  vehicle(tripId: string): VehicleView | null {
    return this.tracking.vehicle(tripId);
  }
}
