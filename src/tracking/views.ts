import type { GeoPoint } from '../shared/geo.ts';
import type { OccupancyLevel, Trip } from './model.ts';
import type { EtaConfidence, PresentedEta, SignalStatus } from './signal-state.ts';

/** What every signed-in user may see about a running shuttle. No driver identity. */
export interface VehicleView {
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  shuttleId: string;
  shuttleLabel: string;
  capacity: number;
  occupancy: OccupancyLevel;
  startedAt: number;
  /** Route-snapped position at the last accepted fix. */
  position: GeoPoint | null;
  headingDeg: number | null;
  distanceAlong: number | null;
  routeLength: number;
  speedKmh: number | null;
  offRoute: boolean;
  signal: {
    status: SignalStatus;
    lastFixAt: number | null;
    message: string;
    etaConfidence: EtaConfidence;
  };
  nextStops: PresentedEta[];
}

export interface ArrivalView {
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  shuttleLabel: string;
  occupancy: OccupancyLevel;
  signalStatus: SignalStatus;
  confidence: EtaConfidence;
  etaSeconds: number;
  arrivalAt: number;
  distanceMeters: number;
  overdue: boolean;
}

/** Transport-office view: adds the accountable driver. */
export interface OfficeTripView extends VehicleView {
  driverId: string;
  driverName: string;
}

export interface TripHistoryItem extends Trip {
  routeName: string;
  shuttleLabel: string;
  driverName: string;
}

export interface TripTrack {
  trip: TripHistoryItem;
  points: Array<{ lat: number; lng: number; recordedAt: number }>;
  stats: {
    fixes: number;
    distanceMeters: number;
    durationSeconds: number;
    longestGapSeconds: number;
    gapsOverStaleThreshold: number;
  };
}
