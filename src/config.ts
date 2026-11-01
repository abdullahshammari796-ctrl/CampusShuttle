import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WaitingConfig } from './demand/waiting-service.ts';
import type { AuthConfig } from './identity/auth-service.ts';
import type { SseHubOptions } from './realtime/sse-hub.ts';
import { DEFAULT_TRACKER_OPTIONS } from './tracking/trip-tracker.ts';
import type { TrackingConfig } from './tracking/tracking-service.ts';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface AppConfig {
  host: string;
  port: number;
  dbFile: string;
  publicDir: string;
  sessionSecret: string;
  sessionTtlMs: number;
  secureCookies: boolean;
  seedOnEmpty: boolean;
  etaStrategy: 'blended-speed' | 'nominal-speed';
  /** Campus local time is UTC+4 (Gulf Standard Time, no daylight saving). */
  timezoneOffsetMinutes: number;
  serviceHours: { first: number; last: number };
  tracking: TrackingConfig;
  monitorIntervalMs: number;
  waiting: WaitingConfig;
  retention: { locationFixDays: number; waitingDeidentifyHours: number };
  sse: SseHubOptions;
  auth: AuthConfig;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${key} must be a number.`);
  return value;
}

/** Reads SESSION_SECRET or creates a random one next to the database on first start. */
function sessionSecret(env: NodeJS.ProcessEnv, dbFile: string): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (dbFile === ':memory:') return randomBytes(48).toString('base64url');
  const file = resolve(dirname(dbFile), 'session-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dirname(file), { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const dbFile = overrides.dbFile ?? env.DB_FILE ?? resolve(PROJECT_ROOT, 'data', 'campus-shuttle.db');
  const staleAfterMs = num(env, 'STALE_AFTER_SECONDS', 20) * 1000;
  const lostAfterMs = num(env, 'LOST_AFTER_SECONDS', 60) * 1000;
  if (lostAfterMs <= staleAfterMs) throw new Error('LOST_AFTER_SECONDS must be greater than STALE_AFTER_SECONDS.');
  const config: AppConfig = {
    host: env.HOST ?? '127.0.0.1',
    port: num(env, 'PORT', 3000),
    dbFile,
    publicDir: resolve(PROJECT_ROOT, 'public'),
    sessionSecret: sessionSecret(env, dbFile),
    sessionTtlMs: 8 * 3600_000,
    secureCookies: env.SECURE_COOKIES === 'true',
    seedOnEmpty: env.SEED_ON_EMPTY !== 'false',
    etaStrategy: env.ETA_STRATEGY === 'nominal-speed' ? 'nominal-speed' : 'blended-speed',
    timezoneOffsetMinutes: 240,
    serviceHours: { first: 7, last: 21 },
    tracking: {
      staleAfterMs,
      lostAfterMs,
      abandonAfterMs: num(env, 'ABANDON_AFTER_MINUTES', 30) * 60_000,
      maxBatchSize: 100,
      maxFixAgeMs: 10 * 60_000,
      maxAccuracyM: 150,
      tracker: DEFAULT_TRACKER_OPTIONS,
    },
    monitorIntervalMs: 2000,
    waiting: { ttlMinutes: 20, maxPerHour: 6 },
    retention: { locationFixDays: num(env, 'LOCATION_RETENTION_DAYS', 30), waitingDeidentifyHours: 24 },
    sse: { heartbeatMs: 15_000, maxBufferedBytes: 256 * 1024 },
    auth: { maxFailedAttempts: 5, lockoutMs: 5 * 60_000 },
  };
  return { ...config, ...overrides };
}
