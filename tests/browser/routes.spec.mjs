import { test, expect, openApp, startKeyboardSolve } from './fixtures.mjs';

test('direct page links and refresh restore the page and selected Analysis tab', async ({ page, server }) => {
  for (const [path, selector] of [
    ['/timer', '#timer-page'], ['/analysis', '#insights-page'],
    ['/analysis/solves', '#history-page'], ['/lessons', '#lesson-list'],
    ['/practice', '#practice-list'], ['/settings?tab=splits', '#settings-panel-splits'], ['/settings?tab=app', '#settings-panel-app'],
  ]) {
    const response = await page.goto(server.url + path);
    expect(response.status()).toBe(200);
    await expect(page.locator(selector)).toBeVisible();
    await page.reload();
    await expect(page.locator(selector)).toBeVisible();
    await expect(page).toHaveURL(server.url + path);
  }
  await expect(page.getByRole('link', { name: 'Analysis', exact: true })).toHaveAttribute('href', '/analysis');
});

test('the old Splits URL opens the Splits settings tab', async ({page,server}) => {
  await page.goto(server.url+'/splits');
  await expect(page.locator('#settings-panel-splits')).toBeVisible();
  await expect(page).toHaveURL(server.url+'/settings?tab=splits');
});

test('lesson group, case, and practice tab survive refresh and browser history', async ({ page, server }) => {
  await openApp(page, server);
  await page.getByRole('link', { name: 'Lessons', exact: true }).click();
  await page.locator('[data-lesson-group="f2l-1"]').click();
  await expect(page).toHaveURL(server.url + '/lessons/f2l/disconnected-pairs/lesson');
  const selected = page.locator('[data-lesson-case]').nth(3);
  const id = await selected.getAttribute('data-lesson-case');
  await selected.click();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  const path = `/lessons/f2l/disconnected-pairs/practice?case=${id}`;
  await expect(page).toHaveURL(server.url + path);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Practice', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#lesson-title')).toHaveText('F2L · Disconnected Pairs');
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Lesson', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`[data-lesson-case="${id}"]`)).toHaveAttribute('aria-current', 'true');
  await page.goForward();
  await expect(page).toHaveURL(server.url + path);
  await expect(page.getByRole('tab', { name: 'Practice', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('mixed practice links preserve scope and selected cases after reload and offline reopening', async ({ page, server, context }) => {
  await openApp(page, server);
  await page.getByRole('link', { name: 'Practice', exact: true }).click();
  await page.locator('[data-practice-select="f2l-0"]').check();
  await page.locator('[data-practice-select="f2l-1"]').check();
  await page.locator('[data-practice-open="f2l-0"]').click();
  await page.locator('[data-practice-case]').first().click();
  const path = new URL(page.url()).pathname + new URL(page.url()).search;
  const selected = await page.locator('[data-practice-case][aria-pressed="true"]').count();
  const scope = await page.locator('[data-practice-case]').count();
  expect(path).toContain('/practice/mixed?groups=');
  await page.reload();
  await expect(page.locator('[data-practice-case][aria-pressed="true"]')).toHaveCount(selected);
  await expect(page.locator('[data-practice-case]')).toHaveCount(scope);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto(server.url + path);
  await expect(offline.locator('[data-practice-case][aria-pressed="true"]')).toHaveCount(selected);
  await expect(offline.locator('#lesson-title')).toHaveText('Mixed practice');
});

test('Settings has a direct URL and Back, Forward, Save and close restore its background', async ({ page, server }) => {
  await page.goto(server.url + '/analysis/solves');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(server.url + '/settings?from=%2Fanalysis%2Fsolves');
  await page.goBack();
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
  await expect(page.locator('#history-page')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.reload();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.locator('#save-settings').click();
  await expect(page).toHaveURL(server.url + '/analysis/solves');
  await expect(page.locator('#history-page')).toBeVisible();
  await page.goto(server.url + '/settings');
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(page).toHaveURL(server.url + '/timer');
});

test('Back during an active attempt preserves its URL and timer until cancelled', async ({ page, server }) => {
  await openApp(page, server);
  await page.getByRole('link', { name: 'Analysis', exact: true }).click();
  await page.getByRole('link', { name: 'Timer', exact: true }).click();
  await startKeyboardSolve(page);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(server.url + '/timer');
  await expect(page.locator('#timer-card')).toHaveClass(/\brunning\b/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#timer-card')).not.toHaveClass(/\brunning\b/);
  await page.goBack();
  await expect(page).toHaveURL(server.url + '/analysis');
  await expect(page.locator('#insights-page')).toBeVisible();
});

test('unknown routes and cases show a usable missing page', async ({ page, server }) => {
  for (const path of ['/missing', '/lessons/f2l/easy-inserts/lesson?case=missing']) {
    await page.goto(server.url + path);
    await expect(page.locator('#not-found-page')).toBeVisible();
    await page.getByRole('button', { name: 'Go to timer', exact: true }).click();
    await expect(page).toHaveURL(server.url + '/timer');
    await expect(page.locator('#timer-page')).toBeVisible();
  }
});
