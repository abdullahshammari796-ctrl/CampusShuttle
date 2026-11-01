import { test as base, expect, type Page } from '@playwright/test';
import { buildContainer } from '../src/container.ts';
import { loadConfig } from '../src/config.ts';

export const test = base.extend<{ appURL: string }>({
  appURL: async ({}, use) => {
    const app = await buildContainer(loadConfig({}, {
      dbFile: ':memory:', port: 0,
      // Faster transitions in this isolated test server; production stays 20s/60s.
      monitorIntervalMs: 100,
    }));
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
      app.stop();
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
