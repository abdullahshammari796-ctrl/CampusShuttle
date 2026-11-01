// Re-creates the demo data set: `npm run seed` (wipes the local database first).
import { loadConfig } from '../src/config.ts';
import { isEmpty, openDatabase } from '../src/persistence/database.ts';
import { clearDatabase, seedDemoData } from '../src/seed/seed.ts';

const config = loadConfig();
const db = openDatabase(config.dbFile);
const reset = process.argv.includes('--reset');

if (!reset && !isEmpty(db)) {
  console.log('Database already contains data. Run with --reset to wipe and re-seed.');
  process.exit(0);
}
if (reset) clearDatabase(db);
const summary = await seedDemoData(db, { now: Date.now(), timezoneOffsetMinutes: config.timezoneOffsetMinutes, serviceHours: config.serviceHours });
db.close();
console.log(`Database: ${config.dbFile}`);
console.log(`Seeded ${summary.stops} stops, ${summary.routes} routes, ${summary.shuttles} shuttles, ${summary.users} demo accounts.`);
console.log(`SYNTHETIC demand history ${summary.syntheticFrom} → ${summary.syntheticTo}: ${summary.syntheticRows} rows (demonstration data only).`);
