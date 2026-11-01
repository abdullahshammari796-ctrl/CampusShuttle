import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig, type AppConfig } from '../src/config.ts';
import { type Container, buildContainer } from '../src/container.ts';
import { DEMO_USERS } from '../src/seed/demo-data.ts';
import { ManualClock } from '../src/shared/clock.ts';

/** Monday 2026-10-05 09:00 campus time (05:00 UTC). */
export const T0 = Date.UTC(2026, 9, 5, 5, 0, 0);

export interface TestApp {
  container: Container;
  clock: ManualClock;
  baseUrl: string;
  close(): Promise<void>;
}

export async function startTestApp(overrides: Partial<AppConfig> = {}, start = T0): Promise<TestApp> {
  const clock = new ManualClock(start);
  const config = loadConfig({}, { dbFile: ':memory:', ...overrides });
  const container = await buildContainer(config, { clock });
  const server = http.createServer(container.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    container,
    clock,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      container.hub.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      container.stop();
    },
  };
}

export function passwordOf(username: string): string {
  const user = DEMO_USERS.find((u) => u.username === username);
  if (!user) throw new Error(`unknown demo user ${username}`);
  return user.password;
}

export interface Reply<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export class TestClient {
  cookie = '';
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  static async as(baseUrl: string, username: string): Promise<TestClient> {
    const client = new TestClient(baseUrl);
    const reply = await client.post('/api/auth/login', { username, password: passwordOf(username) });
    if (reply.status !== 200) throw new Error(`login failed for ${username}: ${reply.status}`);
    return client;
  }

  async request<T = any>(method: string, path: string, body?: unknown, options: { csrf?: boolean } = {}): Promise<Reply<T>> {
    const headers: Record<string, string> = {};
    if (options.csrf !== false) headers['X-Requested-With'] = 'campus-shuttle';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const response = await fetch(this.baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as T, headers: response.headers };
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  patch<T = any>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T = any>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export interface SseEvent {
  event: string;
  data: any;
  receivedAt: number;
}

/** Minimal SSE client over node:http (one socket per client, like a browser tab). */
export class SseClient {
  readonly events: SseEvent[] = [];
  private request: http.ClientRequest | null = null;
  private waiters: Array<() => void> = [];
  status = 0;
  /** True once the server has closed the stream. */
  ended = false;

  static open(baseUrl: string, cookie: string): Promise<SseClient> {
    const client = new SseClient();
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/stream`, { headers: { Cookie: cookie, Accept: 'text/event-stream' } }, (res) => {
        client.status = res.statusCode ?? 0;
        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            let event = 'message';
            let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event: ')) event = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            if (data) {
              client.events.push({ event, data: JSON.parse(data), receivedAt: performance.now() });
              for (const w of client.waiters.splice(0)) w();
            }
          }
        });
        res.on('end', () => {
          client.ended = true;
          for (const w of client.waiters.splice(0)) w();
        });
        resolve(client);
      });
      req.on('error', (e) => {
        if (!client.request) reject(e);
      });
      client.request = req;
    });
  }

  async waitFor(predicate: (e: SseEvent) => boolean, timeoutMs = 3000): Promise<SseEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.events.find(predicate);
      if (found) return found;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for SSE event; got: ${this.events.map((e) => e.event).join(', ')}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.request?.destroy();
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A fix at a given distance along a route, stamped with the (manual) clock. */
export function fixAt(app: TestApp, routeId: string, distanceAlong: number, extra: Record<string, unknown> = {}) {
  const p = app.container.network.pathFor(routeId).pointAt(distanceAlong);
  return { lat: p.lat, lng: p.lng, recordedAt: app.clock.now(), accuracyM: 6, ...extra };
}
