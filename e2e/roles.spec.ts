import { test, expect, login, startTrip, endTrip } from './fixtures.ts';

test('the sign-in form never puts credentials into a URL, even before its script has run', async ({ browser, appURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(appURL);
    await page.getByLabel('Username', { exact: true }).fill('student1');
    await page.getByLabel('Password', { exact: true }).fill('student-demo');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    await page.getByLabel('Password', { exact: true }).press('Enter'); // implicit submission is blocked by the disabled button
    await page.waitForTimeout(500);
    expect(page.url()).toBe(`${appURL}/`);
  } finally { await context.close(); }
});

test('student selects and remembers a stop, registers and cancels a waiting request', async ({ page, appURL }) => {
  await login(page, appURL, 'student');
  const select = page.getByLabel('Your stop');
  await select.selectOption({ label: 'Library & Learning Commons' });
  await page.getByRole('button', { name: "I'm waiting here", exact: true }).click();
  await expect(page.locator('#waiting-card')).toContainText("You're on the waiting list at Library");
  await page.reload();
  await expect(select.locator('option:checked')).toHaveText('Library & Learning Commons');
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.locator('#waiting-card')).toContainText('cancelled');
});

test('driver keeps an offline trip active, sends queued fixes and ends after recovery', async ({ page, appURL }) => {
  await login(page, appURL, 'driver');
  await startTrip(page);
  await page.getByRole('button', { name: 'Simulate network loss', exact: true }).click();
  await expect(page.locator('#upload-state')).toContainText('Offline');
  await expect(page.locator('#upload-detail')).toContainText(/[1-9]\d* queued/, { timeout: 10_000 });
  await endTrip(page);
  await expect(page.locator('#log')).toContainText('Trip NOT ended');
  await expect(page.locator('#trip-card')).toBeVisible();
  await page.getByRole('button', { name: 'Simulate network loss', exact: true }).click();
  await expect(page.locator('#upload-state')).toHaveText('Up to date');
  await endTrip(page);
  await expect(page.locator('#start-card')).toBeVisible();
  await expect(page.locator('#log')).toContainText('Trip ended. Location sharing stopped.');
});

test('office terminates a live driver trip with an audited reason', async ({ browser, page, appURL }) => {
  await login(page, appURL, 'driver');
  await startTrip(page);
  const officeContext = await browser.newContext();
  const office = await officeContext.newPage();
  try {
    await login(office, appURL, 'office');
    await office.locator('#active-table').getByRole('button', { name: 'End', exact: true }).click();
    await office.getByLabel('Reason (recorded in the audit log)').fill('Browser test vehicle breakdown');
    await office.locator('#terminate-dialog').getByRole('button', { name: 'End trip', exact: true }).click();
    await expect(page.locator('#start-card')).toBeVisible({ timeout: 15_000 });
    await office.getByRole('tab', { name: 'System', exact: true }).click();
    await expect(office.locator('#audit-table')).toContainText('Browser test vehicle breakdown');
  } finally { await officeContext.close(); }
});

test('office selects the fourth forecast model and inspects its actual explanation', async ({ page, appURL }) => {
  await login(page, appURL, 'office');
  await page.getByRole('tab', { name: 'Demand & forecast', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('same-weekday-median');
  await expect(page.locator('#model-description')).toContainText('Median');
  await page.locator('#forecast-heat td[data-stop]').first().click();
  await expect(page.locator('#explain')).toContainText('Median of');
  await expect(page.locator('#eval-table')).toContainText('Same-weekday median (6 weeks)');
  await expect(page.locator('#demand-notice')).toContainText(/synthetic/i);
});

test('student receives driver updates and remote removal over a real live stream', async ({ browser, page, appURL }) => {
  await login(page, appURL, 'student');
  await expect(page.locator('#conn')).toContainText('Live updates');
  const driverContext = await browser.newContext();
  const driver = await driverContext.newPage();
  try {
    await login(driver, appURL, 'driver');
    await startTrip(driver);
    await expect(page.locator('#fleet')).toContainText('Live');
    await driver.getByRole('button', { name: 'Full', exact: true }).click();
    await expect(page.locator('#fleet')).toContainText('Full');
    await endTrip(driver);
    await expect(page.locator('#fleet')).toContainText('No shuttles are running');
  } finally { await driverContext.close(); }
});
