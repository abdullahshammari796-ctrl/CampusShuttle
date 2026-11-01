/** Port for the accountability trail of privileged (office) actions. */
export interface AuditEntry {
  id: number;
  at: number;
  actorId: string;
  action: string;
  target: string;
  details: string;
}

export interface AuditLog {
  record(entry: Omit<AuditEntry, 'id'>): void;
  recent(limit: number): AuditEntry[];
}
