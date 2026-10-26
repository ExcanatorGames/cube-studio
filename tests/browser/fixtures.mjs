import {test as base, expect} from '@playwright/test';
import {startBrowserServer, SYNC_CODE} from './server.mjs';

export const test = base.extend({
  server: async ({}, use) => {
    const server = await startBrowserServer();
    try { await use(server); }
    finally { await server.close(); }
    expect(server.errors, 'test server errors').toEqual([]);
  },
  context: async ({context, server}, use) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === server.url ? route.continue() : route.abort());
    await use(context);
  },
  pageErrors: [async ({context}, use) => {
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await use();
    expect(errors, 'uncaught browser errors').toEqual([]);
  }, {auto: true}],
});
export {expect};

export async function openApp(page, server) {
  await page.goto(server.url);
  await expect(page.locator('#new-scramble')).toBeEnabled();
  await expect(page.locator('#scramble-type')).toHaveText('25-move practice');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

export async function startKeyboardSolve(page) {
  await page.locator('#timer-pad').focus();
  await page.keyboard.down('Space');
  await expect(page.locator('#timer-card')).toHaveClass(/\barmed\b/);
  await page.keyboard.up('Space');
  await expect(page.locator('#timer-card')).toHaveClass(/\brunning\b/);
}

export async function finishKeyboardSolve(page) {
  const minimumStoppableSeconds = 0.4;
  await expect.poll(async () => Number(await page.locator('#clock').innerText())).toBeGreaterThanOrEqual(minimumStoppableSeconds);
  await page.keyboard.press('Space');
  await expect(page.locator('#timer-card')).not.toHaveClass(/\brunning\b/);
}

export async function showHistory(page) {
  if (await page.locator('body').evaluate(body => body.classList.contains('focus-mode'))) {
    await page.getByRole('button', {name: 'Toggle fullscreen timer'}).click();
  }
  await page.getByRole('button', {name: 'Solves', exact: true}).click();
}

export function storedState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cube-studio-v1') || '{}'));
}

export async function connect(page) {
  await page.locator('#connect-sync').click();
  await page.getByLabel('Sync code', {exact: true}).fill(SYNC_CODE);
  await page.locator('#save-connection').click();
  await expect(page.locator('#connect-dialog')).not.toBeVisible();
  await expect(page.locator('#sync-attention')).toBeHidden();
}
