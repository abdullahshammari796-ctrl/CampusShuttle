import { loadConfig } from './config.ts';
import { buildContainer } from './container.ts';

const config = loadConfig();
const container = await buildContainer(config);

if (container.seeded) {
  const s = container.seeded;
  console.log(`Seeded demo data: ${s.stops} stops, ${s.routes} routes, ${s.shuttles} shuttles, ${s.users} demo accounts.`);
  console.log(`Generated SYNTHETIC demand history ${s.syntheticFrom} → ${s.syntheticTo} (${s.syntheticRows} rows, demo only).`);
}
if (container.recoveredTrips > 0) console.log(`Recovered ${container.recoveredTrips} active trip(s) from the database.`);

if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
  console.warn(`WARNING: listening on ${config.host}, reachable from other devices. This is a course prototype: the demo accounts have PUBLIC passwords (README), and HTTPS is not configured. Use it only on a private network for a demonstration, never on a public or shared server.`);
}

container.startBackgroundJobs();
const server = container.app.listen(config.port, config.host, () => {
  console.log(`Campus Shuttle running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log('Demo accounts are listed in README.md. Press Ctrl+C to stop.');
});
server.keepAliveTimeout = 65_000;

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received, shutting down…`);
  container.hub.close();
  server.close(() => {
    container.stop();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
