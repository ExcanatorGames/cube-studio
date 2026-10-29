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
  await expect(page.locator('#scramble-type')).toHaveText('Random state', {timeout: 20000});
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

export async function pageControl(page, name) {
  await page.getByRole(/All (lessons|practices)/.test(String(name)) ? 'link' : 'button', {name}).click();
}

export async function showHistory(page) {
  if (await page.locator('body').evaluate(body => body.classList.contains('focus-mode'))) {
    await page.getByRole('button', {name: 'Toggle fullscreen timer'}).click();
  }
  await page.getByRole('link', {name: 'Analysis', exact: true}).click();
  await page.getByRole('tab', {name: 'Solves', exact: true}).click();
}

export function storedState(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cube-studio-history', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = ['solves', 'pending', 'lessonAttempts', 'pendingLessons'];
      const tx = db.transaction([...names, 'meta'], 'readonly');
      const read = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const values = await Promise.all([...names.map(name => read(tx.objectStore(name).getAll())), read(tx.objectStore('meta').get('state'))]);
      return {...values[4], ...Object.fromEntries(names.map((name, i) => [name, values[i]]))};
    } finally { db.close(); }
  });
}

export async function connect(page) {
  await page.getByRole('link', {name:'Settings',exact:true}).click();
  await page.locator('#connect-sync').click();
  await page.getByLabel('Sync code', {exact: true}).fill(SYNC_CODE);
  await page.locator('#save-connection').click();
  await expect(page.locator('#connect-dialog')).not.toBeVisible();
  await expect(page.locator('#sync-attention')).toBeHidden();
  await page.getByRole('button', {name:'Close settings',exact:true}).click();
}
