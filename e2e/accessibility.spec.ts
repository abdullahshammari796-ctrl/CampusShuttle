import AxeBuilder from '@axe-core/playwright';
import { test, expect, login, startTrip, endTrip } from './fixtures.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const role of ['student', 'driver'] as const) {
    test(`${role} ${colorScheme}: automated WCAG checks, mobile layout and named dialog`, async ({ page, appURL }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page, appURL, role);
      if (role === 'driver') await startTrip(page);
      else await expect(page.locator('#conn')).toContainText('Live updates');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const mapBounds = await page.locator('.map-wrap').first().evaluate(el => {
        const svg = el.querySelector('svg')!.getBoundingClientRect();
        const legend = el.querySelector('.map-legend')?.getBoundingClientRect();
        const note = el.querySelector('.map-note')!.getBoundingClientRect();
        return { mapBottom: svg.bottom, legendTop: legend?.top ?? svg.bottom, legendBottom: legend?.bottom ?? svg.bottom, noteTop: note.top };
      });
      expect(mapBounds.legendTop).toBeGreaterThanOrEqual(mapBounds.mapBottom);
      expect(mapBounds.noteTop).toBeGreaterThanOrEqual(mapBounds.legendBottom);
      if (role === 'driver') {
        await page.locator('#end-trip').click();
        await expect(page.getByRole('dialog', { name: 'End this trip?' })).toBeVisible();
        const dialogResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(dialogResults.violations.map(v => v.id)).toEqual([]);
        await page.getByRole('button', { name: 'Keep driving', exact: true }).click();
        await endTrip(page);
      }
    });
  }
}

test('student keyboard focus survives the periodic waiting-request refresh', async ({ page, appURL }) => {
  await page.clock.install();
  await login(page, appURL, 'student');
  await page.getByRole('button', { name: "I'm waiting here", exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancel request', exact: true });
  await cancel.focus();
  // Advance only the browser's UI timers; the server remains on real time.
  await page.clock.runFor(5100);
  await expect(cancel).toBeFocused();
  await cancel.press('Enter');
  await expect(page.locator('#waiting-card')).toContainText('cancelled');
});

test('student can skip navigation and choose a map stop using only keyboard activation', async ({ page, appURL }) => {
  await login(page, appURL, 'student');
  await expect(page.locator('#conn')).toContainText('Live updates');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const stop = page.getByRole('button', { name: 'Stop: Library & Learning Commons', exact: true });
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    if (await stop.evaluate(el => el === document.activeElement)) break;
  }
  await expect(stop).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Your stop')).toHaveValue('library');
});

// The office page had no automated accessibility check. Its forecast heat map failed WCAG 1.4.3 (white numbers on a
// mid-blue cell, about 3.6:1) and, at phone width, 2.1.1 (scrollable tables that no key could reach).
const OFFICE_TABS = [
  { name: 'Live operations', ready: '#kpi-active' },
  { name: 'Demand & forecast', ready: '#eval-table tbody tr' },
  { name: 'Routes', ready: '#routes-table tbody tr' },
  { name: 'Trip history', ready: '#trips-table tbody tr' },
  { name: 'System', ready: '#audit-table tbody tr' },
] as const;
for (const colorScheme of ['light', 'dark'] as const) {
  test(`office ${colorScheme}: automated WCAG checks on every tab at phone width`, async ({ page, appURL }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, appURL, 'office');
    // One audited change, so the audit table has a real (wide) row to scroll, as it does in use.
    const update = await page.request.patch(`${appURL}/api/office/routes/campus-loop`, {
      headers: { 'X-Requested-With': 'campus-shuttle' },
      data: { name: 'Campus Loop', color: '#2563eb', nominalSpeedKmh: 18, dwellSeconds: 20 },
    });
    expect(update.status()).toBe(200);
    for (const tab of OFFICE_TABS) {
      await page.getByRole('tab', { name: tab.name, exact: true }).click();
      await expect(page.locator(tab.ready).first()).toBeVisible();
      if (tab.name === 'Demand & forecast') await expect(page.locator('#forecast-heat td.clickable').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map(v => ({ tab: tab.name, id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    }
  });
}

test('office can open a forecast explanation (UC5 step 3) using only the keyboard', async ({ page, appURL }) => {
  await login(page, appURL, 'office');
  await page.getByRole('tab', { name: 'Demand & forecast', exact: true }).click();
  await expect(page.locator('#forecast-heat td.clickable').first()).toBeVisible();
  await page.locator('#forecast-model').focus();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => Boolean(document.activeElement?.closest('#forecast-heat')))) break;
  }
  const cell = page.locator('#forecast-heat :focus');
  await expect(cell).toHaveCount(1);
  const label = (await cell.getAttribute('aria-label')) ?? '';
  const [, stop, hour] = /^(.+) (\d\d:\d\d):/.exec(label) ?? [];
  await page.keyboard.press('Enter');
  await expect(page.locator('#explain')).toContainText(`${stop} · ${hour}–`);
  await expect(page.locator('#explain')).toHaveAttribute('aria-live', 'polite');
});
