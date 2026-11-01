import type { Clock } from '../shared/clock.ts';
import { rateLimited, unauthenticated, validationError } from '../shared/errors.ts';
import type { Principal, Session } from './model.ts';
import { verifyPassword } from './password-hasher.ts';
import type { UserRepository } from './ports.ts';
import type { TokenService } from './token-service.ts';

export interface AuthConfig {
  maxFailedAttempts: number;
  lockoutMs: number;
}

/** Sign-in with throttling of repeated failures per username. */
export class AuthService {
  private readonly users: UserRepository;
  private readonly tokens: TokenService;
  private readonly clock: Clock;
  private readonly config: AuthConfig;
  private readonly failures = new Map<string, { count: number; firstAt: number }>();

  constructor(users: UserRepository, tokens: TokenService, clock: Clock, config: AuthConfig) {
    this.users = users;
    this.tokens = tokens;
    this.clock = clock;
    this.config = config;
  }

  async login(usernameInput: unknown, passwordInput: unknown): Promise<{ principal: Principal; token: string; expiresAt: number }> {
    if (typeof usernameInput !== 'string' || typeof passwordInput !== 'string' || !usernameInput || !passwordInput) {
      throw validationError('Username and password are required.');
    }
    const username = usernameInput.trim().toLowerCase().slice(0, 64);
    const now = this.clock.now();
    const record = this.failures.get(username);
    if (record && now - record.firstAt < this.config.lockoutMs && record.count >= this.config.maxFailedAttempts) {
      throw rateLimited('Too many failed sign-in attempts. Wait a few minutes and try again.');
    }

    const user = this.users.findByUsername(username);
    const ok = user ? await verifyPassword(passwordInput, user.passwordHash) : false;
    if (!user || !ok) {
      const fresh = !record || now - record.firstAt >= this.config.lockoutMs;
      this.failures.set(username, fresh ? { count: 1, firstAt: now } : { count: record.count + 1, firstAt: record.firstAt });
      throw unauthenticated('Incorrect username or password.');
    }

    this.failures.delete(username);
    const principal: Principal = { userId: user.id, role: user.role, displayName: user.displayName };
    const { token, expiresAt } = this.tokens.issue(principal, now);
    return { principal, token, expiresAt };
  }

  authenticate(token: string | undefined): Session | null {
    if (!token) return null;
    const session = this.tokens.verifySession(token, this.clock.now());
    if (!session) return null;
    // The account must still exist (e.g. not removed since the token was issued).
    return this.users.get(session.principal.userId) ? session : null;
  }

  displayName(userId: string): string | null {
    return this.users.get(userId)?.displayName ?? null;
  }
}
