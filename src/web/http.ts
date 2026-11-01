import type { NextFunction, Request, Response } from 'express';
import type { Principal, Role } from '../identity/model.ts';
import { AppError, type ErrorCode, unauthenticated, validationError } from '../shared/errors.ts';

export const SESSION_COOKIE = 'cs_session';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

export function principalOf(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw unauthenticated();
  return principal;
}

/** When the caller's session token expires (epoch ms). */
export function sessionExpiryOf(res: Response): number {
  const expiresAt = res.locals.sessionExpiresAt as number | undefined;
  if (expiresAt === undefined) throw unauthenticated();
  return expiresAt;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}

/** Request body as a plain object (express.json leaves it undefined for empty bodies). */
export function bodyOf(req: Request): Record<string, unknown> {
  const body = req.body as unknown;
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) throw validationError('Request body must be a JSON object.');
  return body as Record<string, unknown>;
}

export function queryString(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function queryInt(req: Request, name: string, fallback: number, min: number, max: number): number {
  const raw = queryString(req, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw validationError(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) throw validationError(`Invalid ${name}.`);
  return value;
}

export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const principal = res.locals.principal as Principal | undefined;
    if (!principal) return void sendError(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
    if (!roles.includes(principal.role)) return void sendError(res, 403, 'FORBIDDEN', 'Your role cannot use this feature.');
    next();
  };
}

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (error instanceof AppError) return sendError(res, STATUS[error.code], error.code, error.message, error.details);
  const e = error as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') return sendError(res, 400, 'VALIDATION', 'Malformed JSON body.');
  if (e?.type === 'entity.too.large') return sendError(res, 413, 'VALIDATION', 'Request body too large.');
  console.error('[web] unexpected error:', error);
  sendError(res, 500, 'INTERNAL', 'Something went wrong on the server.');
}
