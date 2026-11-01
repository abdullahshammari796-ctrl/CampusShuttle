/**
 * Application error with a transport-neutral code. The web adapter maps codes
 * to HTTP status codes; services never know about HTTP.
 */
export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'UNAUTHENTICATED' | 'RATE_LIMITED';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export const validationError = (message: string, details?: unknown) => new AppError('VALIDATION', message, details);
export const notFound = (message: string) => new AppError('NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) => new AppError('CONFLICT', message, details);
export const forbidden = (message: string) => new AppError('FORBIDDEN', message);
export const unauthenticated = (message = 'Please sign in.') => new AppError('UNAUTHENTICATED', message);
export const rateLimited = (message: string) => new AppError('RATE_LIMITED', message);
