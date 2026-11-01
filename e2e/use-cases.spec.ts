import { test, expect, login, startTrip } from './fixtures.ts';

test('UC1/UC2: real stream shows delayed, lost without ETA, and recovered GPS', async ({ browser, page, appURL, app, clock }) => {
  await login(page, appURL, 'student');
  await page.getByLabel('Your stop').selectOption('library');
  const context = await browser.newContext();
  const driver = await context.newPage();
  try {
    await login(driver, appURL, 'driver');
    await startTrip(driver);
    await expect(page.locator('#arrivals')).toContainText('Live');
    await driver.getByRole('button', { name: 'Simulate GPS outage', exact: true }).click();
    clock.advance(21_000); app.runJobs('signals');
    await expect(page.locator('#arrivals')).toContainText('location delayed');
    clock.advance(40_000); app.runJobs('signals');
    await expect(page.locator('#arrivals')).toContainText('GPS signal lost');
    await expect(page.locator('#arrivals')).toContainText('no estimate');
    await driver.getByRole('button', { name: 'Simulate GPS outage', exact: true }).click();
    await expect(page.locator('#arrivals')).toContainText('Live');
    await expect(page.locator('#arrivals')).not.toContainText('no estimate');
  } finally { await context.close(); }
});

test('UC3: a waiting request visibly expires without a reload', async ({ page, appURL, app, clock }) => {
  await login(page, appURL, 'student');
  await page.getByRole('button', { name: "I'm waiting here", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toBeVisible();
  clock.advance(21 * 60_000); app.runJobs('expiry');
  await expect(page.locator('#waiting-card')).toContainText('expired after 20 minutes');
  await expect(page.getByRole('button', { name: "I'm waiting here", exact: true })).toBeVisible();
});

test('UC3: other students joining the same stop do not make a waiting student re-fetch its request', async ({ page, appURL, app }) => {
  await login(page, appURL, 'student');
  await page.getByLabel('Your stop').selectOption('library');
  await page.getByRole('button', { name: "I'm waiting here", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toBeVisible();
  let refetches = 0;
  page.on('request', (r) => { if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/student/waiting') refetches++; });

  const others = [1, 2, 3, 4, 5].map((i) => app.waiting.create(`u-e2e-other-${i}`, { stopId: 'library' }));
  await expect(page.locator('#stop-info')).toContainText('6 people are waiting here');
  await page.waitForTimeout(500);
  expect(refetches).toBe(0);

  // A falling count may mean this student's own request closed, so it is reconciled once.
  app.waiting.cancel('u-e2e-other-1', others[0].id);
  await expect(page.locator('#stop-info')).toContainText('5 people are waiting here');
  await expect.poll(() => refetches).toBe(1);
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toBeVisible();
});

test('UC1: expired sessions stop an already-open real browser stream', async ({ page, appURL, app, clock }) => {
  await login(page, appURL, 'student');
  await expect(page.locator('#conn')).toContainText('Live updates');
  clock.advance(8 * 3600_000 + 1000);
  expect(app.hub.expireSessions()).toBe(1);
  await expect(page.locator('#notice')).toContainText('Your session has expired');
  await expect(page.locator('#notice').getByRole('link', { name: 'Sign in again' })).toBeVisible();
});

test('UC3: served request is reconciled after the student reconnects', async ({ page, appURL, app, context, appServer }) => {
  await login(page, appURL, 'student');
  await page.getByLabel('Your stop').selectOption('library');
  await page.getByRole('button', { name: "I'm waiting here", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toBeVisible();
  await context.setOffline(true);
  // Offline emulation alone can leave an existing EventSource socket open.
  appServer.disconnectClients();
  await expect(page.locator('#conn')).toContainText('Reconnecting');
  expect(app.waiting.markServed('library', 'campus-loop')).toBe(1);
  await context.setOffline(false);
  await expect(page.locator('#conn')).toContainText('Live updates');
  await expect(page.locator('#waiting-card')).toContainText('A shuttle reached', { timeout: 15_000 });
});


test('UC5: an empty historical period produces no invented forecast', async ({ page, appURL }) => {
  await login(page, appURL, 'office');
  await expect(page.locator('#conn')).toContainText('Live updates');
  await page.getByRole('tab', { name: 'Demand & forecast', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('same-weekday-median');
  await page.getByLabel('Date', { exact: true }).fill('2000-01-03');
  await expect(page.locator('#forecast-hint')).toContainText('2000-01-03');
  await expect(page.locator('#forecast-heat td.nodata')).toHaveCount(135);
  await page.locator('#forecast-heat td[data-stop]').first().click();
  await expect(page.locator('#explain')).toContainText('no forecast');
});

test('UC2: reload resumes a trip, a GPS glitch is rejected, and prolonged loss closes it', async ({ page, appURL, app, clock }) => {
  await login(page, appURL, 'driver');
  await startTrip(page);
  const title = await page.locator('#trip-title').textContent();
  await page.reload();
  await expect(page.locator('#trip-title')).toHaveText(title!);
  await expect(page.locator('#log')).toContainText('Resumed your active trip');
  await page.getByRole('button', { name: 'Inject GPS glitch', exact: true }).click();
  await expect(page.locator('#log')).toContainText('Server rejected');
  await page.getByRole('button', { name: 'Simulate GPS outage', exact: true }).click();
  clock.advance(31 * 60_000); app.runJobs('signals');
  await expect(page.locator('#start-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#log')).toContainText('long signal loss');
});

test('UC4: office edits and disables a route through the real form', async ({ page, appURL }) => {
  await login(page, appURL, 'office');
  await expect(page.locator('#conn')).toContainText('Live updates');
  await page.getByRole('tab', { name: 'Routes', exact: true }).click();
  const row = page.locator('#routes-table tbody tr').filter({ hasText: 'Campus Loop' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#route-dialog').getByLabel('Name', { exact: true }).fill('Campus Loop Reviewed');
  await page.locator('#route-dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row).toContainText('Campus Loop Reviewed');
  await row.getByRole('button', { name: /Take out of service|Deactivate|Disable|Out of service/ }).click();
  await expect(row).toContainText(/Inactive|Out of service/i);
});
