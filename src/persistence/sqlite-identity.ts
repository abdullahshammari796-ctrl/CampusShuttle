import type { Role, User } from '../identity/model.ts';
import type { UserRepository } from '../identity/ports.ts';
import type { AuditEntry, AuditLog } from '../shared/audit.ts';
import { type Database, withConflict } from './database.ts';

type Row = Record<string, unknown>;

export class SqliteUserRepository implements UserRepository {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  findByUsername(username: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as Row | undefined;
    return row ? toUser(row) : null;
  }

  get(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return row ? toUser(row) : null;
  }

  insert(user: User): void {
    withConflict(`Username ${user.username} is taken.`, () => {
      this.db
        .prepare('INSERT INTO users (id, username, display_name, role, password_hash) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, user.username, user.displayName, user.role, user.passwordHash);
    });
  }
}

export class SqliteAuditLog implements AuditLog {
  private readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  record(entry: Omit<AuditEntry, 'id'>): void {
    this.db.prepare('INSERT INTO audit_log (at, actor_id, action, target, details) VALUES (?, ?, ?, ?, ?)').run(entry.at, entry.actorId, entry.action, entry.target, entry.details);
  }

  recent(limit: number): AuditEntry[] {
    const rows = this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as Row[];
    return rows.map((r) => ({
      id: r.id as number,
      at: r.at as number,
      actorId: r.actor_id as string,
      action: r.action as string,
      target: r.target as string,
      details: r.details as string,
    }));
  }
}

function toUser(row: Row): User {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    role: row.role as Role,
    passwordHash: row.password_hash as string,
  };
}
