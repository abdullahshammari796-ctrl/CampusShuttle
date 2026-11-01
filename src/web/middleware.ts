import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../identity/auth-service.ts';
import { SESSION_COOKIE, parseCookies, sendError } from './http.ts';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Resolves the session cookie to a principal (if valid) for later middleware. */
export function authenticate(auth: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const session = auth.authenticate(token);
    if (session) {
      res.locals.principal = session.principal;
      res.locals.sessionExpiresAt = session.expiresAt;
    }
    next();
  };
}

export function requireAuth(_req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.principal) return void sendError(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  next();
}

/**
 * CSRF defence in depth (on top of SameSite=Strict cookies): state-changing
 * API calls must carry a custom header, which a cross-site form or image
 * cannot add without a CORS preflight that this server never approves.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  const unsafe = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  if (unsafe && req.headers['x-requested-with'] !== 'campus-shuttle') {
    return void sendError(res, 403, 'FORBIDDEN', 'Missing request header.');
  }
  next();
}
