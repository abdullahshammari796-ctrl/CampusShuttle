import { test, expect, login, startTrip } from './fixtures.ts';

test('UC2 4b: a reloaded device-GPS trip keeps device GPS and never switches to the simulator', async ({ browser, app, appURL }) => {
  const path = app.network.pathFor('campus-loop');
  const first = path.pointAt(100);
  const second = path.pointAt(130);
  const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: first.lat, longitude: first.lng, accuracy: 5 } });
  const page = await context.newPage();
  try {
    await login(page, appURL, 'driver');
    await page.locator('#route-select').selectOption('campus-loop');
    await page.locator('input[name=source][value=device]').check();
    await startTrip(page);
    const tripId = app.tracking.liveVehicles()[0].tripId;
    expect(app.tracking.lastFixSource(tripId)).toBe('device');

    await page.reload();
    await expect(page.locator('#log')).toContainText("Resumed your active trip after a page reload (this device's GPS)");
    await expect(page.locator('#sim-card')).toBeHidden();
    await expect(page.locator('#resume-source')).toBeHidden();

    // The resumed page follows the device's position, not a simulated route.
    await expect(page.locator('#gps-detail')).toContainText(/^[1-9]\d* positions/);
    await page.waitForTimeout(2500); // DeviceGps passes on at most one position per 2 s
    await context.setGeolocation({ latitude: second.lat, longitude: second.lng, accuracy: 5 });
    await expect.poll(() => app.tracking.vehicle(tripId)?.distanceAlong ?? 0).toBeGreaterThanOrEqual(120);
    const sources = app.db.prepare('SELECT DISTINCT source FROM location_fixes WHERE trip_id = ?').all(tripId).map((row) => row.source);
    expect(sources).toEqual(['device']);
  } finally { await context.close(); }
});

test('UC2 4b: with no accepted position, a reloaded trip shares nothing until the driver chooses a source', async ({ page, app, appURL }) => {
  await login(page, appURL, 'driver');
  // No geolocation permission in this context, so device GPS produces no position.
  await page.locator('input[name=source][value=device]').check();
  await page.getByRole('button', { name: 'Start trip', exact: true }).click();
  await expect(page.locator('#trip-card')).toBeVisible();
  const tripId = app.tracking.liveVehicles()[0].tripId;

  await page.reload();
  await expect(page.getByRole('group', { name: 'Choose how to continue sharing your location' })).toBeVisible();
  await expect(page.locator('#gps-state')).toHaveText('Not started');
  await expect(page.locator('#sim-card')).toBeHidden();
  await page.waitForTimeout(4000); // longer than the simulator's 3 s interval: proves no source was started
  expect(app.tracking.lastFixSource(tripId)).toBeNull();

  await page.getByRole('button', { name: 'Simulated GPS (demonstration)', exact: true }).click();
  await expect(page.locator('#resume-source')).toBeHidden();
  await expect(page.locator('#server-signal')).toContainText('Live');
  expect(app.tracking.lastFixSource(tripId)).toBe('simulator');
});
