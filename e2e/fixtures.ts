import { test as base, expect, type Page } from '@playwright/test';
import { buildContainer, type Container } from '../src/container.ts';
import { loadConfig } from '../src/config.ts';

type TestClock = { now(): number; advance(ms: number): void };
export const test = base.extend<{ appURL: string; app: Container; clock: TestClock }>({
  clock: async ({}, use) => {
    let offset = 0;
    await use({ now: () => Date.now() + offset, advance: ms => { offset += ms; } });
  },
  app: async ({ clock }, use) => {
    const app = await buildContainer(loadConfig({}, { dbFile: ':memory:', port: 0 }), { clock });
    try { await use(app); } finally { app.stop(); }
  },
  appURL: async ({ app }, use) => {
    const server = app.app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    app.startBackgroundJobs();
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server port');
    try { await use(`http://127.0.0.1:${address.port}`); }
    finally {
      app.hub.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
});
export { expect };
export async function login(page: Page, appURL: string, role: 'student' | 'driver' | 'office') {
  await page.goto(appURL);
  await page.getByLabel('Username', { exact: true }).fill(`${role}1`);
  await page.getByLabel('Password', { exact: true }).fill(`${role}-demo`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}\\.html$`));
}
export async function startTrip(page: Page) {
  await page.getByRole('button', { name: 'Start trip', exact: true }).click();
  await expect(page.locator('#trip-card')).toBeVisible();
  await expect(page.locator('#server-signal')).toContainText('Live');
}
export async function endTrip(page: Page) {
  await page.locator('#end-trip').click();
  await page.locator('#end-dialog').getByRole('button', { name: 'End trip', exact: true }).click();
}
