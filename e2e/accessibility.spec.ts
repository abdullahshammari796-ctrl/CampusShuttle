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
