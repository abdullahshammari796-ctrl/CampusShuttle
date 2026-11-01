// Headless fleet simulator for demonstrations.
//
// Logs in as demo drivers and drives shuttles along their routes through the
// SAME public HTTP API the driver app uses, so the server cannot tell it
// apart from real drivers. Usage:
//
//   npm run simulate                       # 2 shuttles, 25 km/h
//   npm run simulate -- --speed 40 --outage
//   npm run simulate -- --outage --outage-at 30 --outage-for 75
//
// --outage makes the first shuttle (Campus Loop) lose GPS in every 4-minute
// cycle, starting --outage-at seconds into the cycle (default 120) for
// --outage-for seconds (default 75). Each start and end is printed with the
// time, so a presenter knows exactly when students will see "location
// delayed" (after 20 s) → "GPS lost" (after 60 s) → recovery.
import { RoutePath } from '../src/network/route-path.ts';
import { DEMO_USERS } from '../src/seed/demo-data.ts';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const SPEED_KMH = option('speed', 25);
const INTERVAL_MS = 3000;
const OUTAGE_CYCLE_MS = 240_000;
const OUTAGE_AT_MS = option('outage-at', 120) * 1000;
const OUTAGE_FOR_MS = option('outage-for', 75) * 1000;
if (!(OUTAGE_AT_MS >= 0 && OUTAGE_FOR_MS > 0 && OUTAGE_AT_MS + OUTAGE_FOR_MS <= OUTAGE_CYCLE_MS)) {
  console.error('--outage-at and --outage-for (seconds) must fit inside the 240 s cycle.');
  process.exit(1);
}
const clockTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const PLAN = [
  { username: 'driver2', routeId: 'campus-loop' },
  { username: 'driver3', routeId: 'metro-link' },
];

interface NetworkDto {
  stops: Array<{ id: string; name: string; lat: number; lng: number }>;
  routes: Array<{ id: string; name: string; loop: boolean; path: Array<{ lat: number; lng: number }>; stopIds: string[]; dwellSeconds: number; active: boolean }>;
}

class Client {
  private cookie = '';
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(BASE + path, {
      method,
      headers: { 'X-Requested-With': 'campus-shuttle', 'Content-Type': 'application/json', Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(data)}`);
    return data as T;
  }
}

async function runDriver(index: number, plan: { username: string; routeId: string }, network: NetworkDto) {
  const account = DEMO_USERS.find((u) => u.username === plan.username);
  if (!account) throw new Error(`No demo account ${plan.username}`);
  const client = new Client();
  await client.request('/api/auth/login', 'POST', { username: account.username, password: account.password });

  const route = network.routes.find((r) => r.id === plan.routeId && r.active);
  if (!route) {
    console.log(`[${plan.username}] route ${plan.routeId} not in service; skipping.`);
    return undefined;
  }
  const stops = route.stopIds.map((id) => network.stops.find((s) => s.id === id)!);
  const path = new RoutePath(route.path, route.loop, stops);

  let trip = (await client.request<{ vehicle: { tripId: string; distanceAlong: number | null } | null }>('/api/driver/trip')).vehicle;
  if (!trip) {
    const options = await client.request<{ shuttles: Array<{ id: string; busy: boolean; label: string }> }>('/api/driver/options');
    const shuttle = options.shuttles.slice().reverse().find((s) => !s.busy);
    if (!shuttle) {
      console.log(`[${plan.username}] no free shuttle.`);
      return undefined;
    }
    trip = (await client.request<{ vehicle: { tripId: string; distanceAlong: number | null } }>('/api/driver/trips', 'POST', { routeId: route.id, shuttleId: shuttle.id })).vehicle;
    console.log(`[${plan.username}] started ${route.name} with ${shuttle.label}`);
  } else {
    console.log(`[${plan.username}] resuming existing trip on ${route.name}`);
  }

  // Start each shuttle at a different point so the map is interesting.
  let along = trip.distanceAlong ?? (index * path.length) / 3;
  let dwellUntil = 0;
  let last = Date.now();
  const startedAt = Date.now();
  let inOutage = false;
  const stopOffsets = path.stops.map((s) => (route.loop && s.distanceAlong < 0.5 ? path.length : s.distanceAlong));

  const timer = setInterval(async () => {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    if (now >= dwellUntil) {
      const next = along + (SPEED_KMH / 3.6) * dt;
      const crossed = stopOffsets.find((o) => (next <= path.length ? o > along && o <= next : o > along || o <= next - path.length));
      along = crossed !== undefined ? crossed : next;
      if (crossed !== undefined) dwellUntil = now + route.dwellSeconds * 1000;
      along = route.loop ? along % path.length : Math.min(along, path.length);
    }
    const cycle = (now - startedAt) % OUTAGE_CYCLE_MS;
    const outageNow = flag('outage') && index === 0 && cycle >= OUTAGE_AT_MS && cycle < OUTAGE_AT_MS + OUTAGE_FOR_MS;
    if (outageNow !== inOutage) {
      inOutage = outageNow;
      console.log(outageNow
        ? `[${plan.username}] ${clockTime()} GPS outage STARTED for ${OUTAGE_FOR_MS / 1000} s — students see "Location delayed" in ~20 s and "GPS lost" in ~60 s`
        : `[${plan.username}] ${clockTime()} GPS outage ENDED — students see "Live" again with the next position`);
    }
    if (outageNow) return; // GPS outage window: no position is produced
    const p = path.pointAt(along);
    const jitter = () => (Math.random() - 0.5) * 0.00006;
    try {
      await client.request(`/api/driver/trips/${trip!.tripId}/locations`, 'POST', {
        sentAt: Date.now(),
        fixes: [{ lat: p.lat + jitter(), lng: p.lng + jitter(), speedKmh: now < dwellUntil ? 0 : SPEED_KMH, accuracyM: 6, recordedAt: now, source: 'simulator' }],
      });
    } catch (error) {
      console.log(`[${plan.username}] ${(error as Error).message}`);
      if (/404|409/.test((error as Error).message)) {
        clearInterval(timer);
        console.log(`[${plan.username}] trip ended elsewhere; stopping.`);
      }
    }
  }, INTERVAL_MS);

  const stop = async () => {
    clearInterval(timer);
    try {
      await client.request(`/api/driver/trips/${trip!.tripId}/end`, 'POST');
      console.log(`[${plan.username}] trip ended`);
    } catch {
      /* already ended */
    }
  };
  return stop;
}

const office = new Client();
await office.request('/api/auth/login', 'POST', { username: 'office1', password: DEMO_USERS.find((u) => u.username === 'office1')!.password });
const network = await office.request<NetworkDto>('/api/network');
// Start trips one after another so each driver sees the shuttles already taken.
const stops: Array<(() => Promise<void>) | undefined> = [];
for (const [i, plan] of PLAN.slice(0, option('drivers', 2)).entries()) stops.push(await runDriver(i, plan, network));
console.log(`Simulating ${stops.filter(Boolean).length} shuttle(s) at ${SPEED_KMH} km/h${flag('outage') ? `; ${PLAN[0].username}'s shuttle loses GPS ${OUTAGE_AT_MS / 1000}–${(OUTAGE_AT_MS + OUTAGE_FOR_MS) / 1000} s into every 240 s cycle (first outage at about ${new Date(Date.now() + OUTAGE_AT_MS).toLocaleTimeString()})` : ''}. Ctrl+C ends the trips.`);

process.on('SIGINT', async () => {
  await Promise.all(stops.map((s) => s && s()));
  process.exit(0);
});
