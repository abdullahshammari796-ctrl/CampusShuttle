export type WaitingStatus = 'WAITING' | 'CANCELLED' | 'EXPIRED' | 'SERVED';

/**
 * "I am waiting at this stop." Linked to the student only through a
 * pseudonymous reference (HMAC of the user id), which is erased 24 h after
 * the request closes so the remaining row is non-personal demand data.
 */
export interface WaitingRequest {
  id: string;
  stopId: string;
  routeId: string | null;
  requesterRef: string | null;
  status: WaitingStatus;
  createdAt: number;
  expiresAt: number;
  closedAt: number | null;
}

/**
 * Where a demand number came from. Synthetic rows are generated demo data
 * and must always be labelled as such wherever they are shown.
 */
export type DemandSource = 'synthetic' | 'live';

/** Number of waiting requests at one stop in one local clock hour. */
export interface HourlyDemand {
  stopId: string;
  date: string;
  hour: number;
  count: number;
  source: DemandSource;
}
