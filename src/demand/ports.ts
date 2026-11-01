import type { HourlyDemand, WaitingRequest } from './model.ts';

export interface WaitingRequestRepository {
  /** Must reject a second WAITING request for the same requester with a CONFLICT error. */
  insert(request: WaitingRequest): void;
  update(request: WaitingRequest): void;
  get(id: string): WaitingRequest | null;
  findActiveByRequester(requesterRef: string): WaitingRequest | null;
  latestByRequester(requesterRef: string): WaitingRequest | null;
  listActive(): WaitingRequest[];
  countCreatedSince(requesterRef: string, since: number): number;
  /** Erases the pseudonymous link on requests closed before the cutoff. */
  deidentifyClosedBefore(cutoff: number): number;
}

export interface DemandHistoryRepository {
  /**
   * Hourly demand between two local dates (inclusive), from synthetic demo
   * rows and from live waiting requests, plus the dates for which data was
   * being collected (a missing stop-hour on such a date means zero demand).
   */
  load(fromDate: string, toDate: string): { rows: HourlyDemand[]; coveredDates: string[] };
  replaceSynthetic(rows: readonly HourlyDemand[]): void;
}
