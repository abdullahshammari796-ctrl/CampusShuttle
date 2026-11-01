import { createHmac, timingSafeEqual } from 'node:crypto';
import { ROLES, type Principal, type Role, type Session } from './model.ts';

interface TokenPayload {
  sub: string;
  role: Role;
  name: string;
  exp: number;
}

/**
 * Stateless signed session tokens (HMAC-SHA256), carried in an HttpOnly
 * cookie. Equivalent to a minimal JWT without the algorithm-confusion risk.
 */
export class TokenService {
  private readonly secret: Buffer;
  private readonly ttlMs: number;

  constructor(secret: string, ttlMs: number) {
    if (secret.length < 32) throw new Error('Session secret must be at least 32 characters.');
    this.secret = Buffer.from(secret);
    this.ttlMs = ttlMs;
  }

  issue(principal: Principal, now: number): { token: string; expiresAt: number } {
    const payload: TokenPayload = { sub: principal.userId, role: principal.role, name: principal.displayName, exp: now + this.ttlMs };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return { token: `${body}.${this.sign(body)}`, expiresAt: payload.exp };
  }

  verify(token: string, now: number): Principal | null {
    return this.verifySession(token, now)?.principal ?? null;
  }

  /**
   * Checks signature and expiry. Tokens are stateless: there is no server-side
   * revocation list, so a token stays valid until `expiresAt` even after logout
   * (logout only deletes the cookie in that browser).
   */
  verifySession(token: string, now: number): Session | null {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
      if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
      if (!ROLES.includes(payload.role) || typeof payload.sub !== 'string') return null;
      return { principal: { userId: payload.sub, role: payload.role, displayName: String(payload.name ?? '') }, expiresAt: payload.exp };
    } catch {
      return null;
    }
  }

  /** Keyed hash used to pseudonymise user ids in stored demand data. */
  pseudonymize(purpose: string, value: string): string {
    return createHmac('sha256', this.secret).update(`${purpose}:${value}`).digest('base64url').slice(0, 22);
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
