// Local benchmark of the real-time fan-out path (quality-attribute scenarios QA-1 and QA-2).
//
//   npm run load-test                 # 1000 viewers, 3 shuttles, 20 update rounds
//   npm run load-test -- --viewers 3000 --rounds 10
//
// What it does: starts an in-memory instance on 127.0.0.1, opens N Server-Sent
// Events connections over node:http, drives 3 shuttles through the real HTTP
// API, and measures, for each location upload, the time from just before the
// driver's POST until each viewer's parser has seen the matching 'vehicle'
// message (performance.now() in one process, so no clock skew).
//
// What it is NOT (read before quoting the numbers):
// * not a deployment test: server and all viewers share ONE Node process and
//   event loop (they compete for one CPU core) and talk over loopback (no Wi-Fi
//   or mobile latency, no TLS, no proxy);
// * not a browser test: no EventSource, DOM updates or map rendering;
// * not N distinct users: every viewer reuses ONE signed-in demo student
//   session (the hub's per-connection work does not depend on the user, but
//   sign-in load and per-user state are not exercised);
// * only 3 location updates per second in total, and no other API traffic.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpus, platform, release, totalmem } from 'node:os';
import { loadConfig } from '../src/config.ts';
import { buildContainer } from '../src/container.ts';
import { DEMO_USERS } from '../src/seed/demo-data.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const VIEWERS = option('viewers', 1000);
const ROUNDS = option('rounds', 20);

const container = await buildContainer(loadConfig({}, { dbFile: ':memory:' }));
const server = http.createServer(container.app);
server.maxConnections = VIEWERS + 100;
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function login(username: string): Promise<string> {
  const password = DEMO_USERS.find((u) => u.username === username)!.password;
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'campus-shuttle' },
    body: JSON.stringify({ username, password }),
  });
  return r.headers.get('set-cookie')!.split(';')[0];
}

const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const studentCookie = await login('student1');
const waiting = new Map<string, Array<(t: number) => void>>();
let connected = 0;

function openViewer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/stream`, { agent, headers: { Cookie: studentCookie } }, (res) => {
      res.setEncoding('utf8');
      let buffer = '';
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let i: number;
        while ((i = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          if (frame.includes('event: snapshot')) {
            connected++;
            resolve();
          }
          const m = frame.match(/event: vehicle\ndata: .*"tripId":"([^"]+)".*"distanceAlong":(\d+)/);
          if (m) {
            const key = `${m[1]}@${m[2]}`;
            for (const done of waiting.get(key) ?? []) done(performance.now());
          }
        }
      });
    });
    req.on('error', reject);
  });
}

console.log(`Opening ${VIEWERS} live connections…`);
const t0 = performance.now();
for (let i = 0; i < VIEWERS; i += 100) await Promise.all(Array.from({ length: Math.min(100, VIEWERS - i) }, openViewer));
console.log(`  ${connected} connected in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const drivers = await Promise.all(['driver1', 'driver2', 'driver3'].map(login));
const plans = [['campus-loop', 'sh-01'], ['metro-link', 'sh-02'], ['campus-loop', 'sh-03']];
const trips: string[] = [];
for (const [i, cookie] of drivers.entries()) {
  const r = await fetch(`${base}/api/driver/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'campus-shuttle', Cookie: cookie },
    body: JSON.stringify({ routeId: plans[i][0], shuttleId: plans[i][1] }),
  });
  trips.push(((await r.json()) as { trip: { id: string } }).trip.id);
}

const latencies: number[] = [];
const roundTimes: number[] = [];
const measureStart = performance.now();
for (let round = 0; round < ROUNDS; round++) {
  for (const [i, cookie] of drivers.entries()) {
    const routeId = plans[i][0];
    const distance = 50 + round * 20 + i; // unique per update so arrivals can be matched
    const p = container.network.pathFor(routeId).pointAt(distance);
    const key = `${trips[i]}@${distance}`;
    let received = 0;
    const sent = performance.now();
    const allReceived = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`only ${received}/${VIEWERS} viewers received update ${key} within 10 s`)), 10_000);
      waiting.set(key, [(t: number) => {
        latencies.push(t - sent);
        if (++received === VIEWERS) {
          clearTimeout(timer);
          resolve();
        }
      }]);
    });
    await fetch(`${base}/api/driver/trips/${trips[i]}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'campus-shuttle', Cookie: cookie },
      body: JSON.stringify({ fixes: [{ lat: p.lat, lng: p.lng, recordedAt: Date.now(), accuracyM: 5 }], sentAt: Date.now() }),
    });
    await allReceived;
    roundTimes.push(performance.now() - sent);
    waiting.delete(key);
  }
  await new Promise((r) => setTimeout(r, 1050)); // respect the 1 fix/second/trip limit
}

const measureSeconds = (performance.now() - measureStart) / 1000;
latencies.sort((a, b) => a - b);
const pct = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))].toFixed(1);
const stats = container.hub.stats();
const worstRound = Math.max(...roundTimes);
console.log(`\nResults (${VIEWERS} viewers × ${ROUNDS * drivers.length} location updates)`);
console.log(`  deliveries received ${latencies.length} of ${VIEWERS * ROUNDS * drivers.length} expected`);
console.log(`  delivery latency  p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · max ${latencies.at(-1)!.toFixed(1)} ms`);
console.log(`  time until ALL viewers had an update: worst ${worstRound.toFixed(1)} ms`);
console.log(`  throughput: ${Math.round(latencies.length / measureSeconds)} deliveries/s averaged over ${measureSeconds.toFixed(1)} s (paced: 3 uploads/s); at least ${Math.round(VIEWERS / (worstRound / 1000))} deliveries/s within the slowest single update`);
console.log(`  messages sent ${stats.messagesSent} · skipped for slow clients ${stats.messagesSkipped}`);
console.log(`  process memory (server + ${VIEWERS} test clients) ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
console.log(`  environment: node ${process.version} · ${platform()} ${release()} · ${cpus()[0]?.model.trim()} (${cpus().length} logical cores) · ${Math.round(totalmem() / 1073741824)} GB RAM`);
console.log('  method: server and all viewers in ONE Node process over loopback; one shared demo student session; no browsers, no TLS (see the header of scripts/load-test.ts)');

container.hub.close();
server.closeAllConnections();
server.close();
container.stop();
process.exit(0);
