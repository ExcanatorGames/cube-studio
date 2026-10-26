import {
  test,
  expect,
  openApp,
  startKeyboardSolve,
  finishKeyboardSolve,
  showHistory,
} from './fixtures.mjs';

test('discarding an invalid custom-step draft allows the next solve to persist', async ({
  page,
  server,
}) => {
  await openApp(page, server);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .locator('#settings-dialog')
    .getByLabel('Split method')
    .selectOption('custom');
  await page
    .getByLabel('Splits, separated by commas')
    .fill(Array.from({ length: 13 }, (_, i) => `Step ${i + 1}`).join(', '));
  await page
    .locator('#settings-dialog')
    .getByLabel('Split method')
    .selectOption('beginner');
  await page.locator('#save-settings').click();
  await startKeyboardSolve(page);
  await finishKeyboardSolve(page);
  await expect(page.locator('#storage-warning')).toBeHidden();
  await page.reload();
  await showHistory(page);
  await expect(page.locator('#history-body [data-id]')).toHaveCount(1);
});

test('failed local writes show an unsaved warning and retry preserves the solve after reopening', async ({
  page,
  server,
}) => {
  await openApp(page, server);
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cube-studio-v1')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
  });
  await startKeyboardSolve(page);
  await finishKeyboardSolve(page);
  await expect(page.locator('#storage-warning')).toBeVisible();
  await expect(page.locator('#storage-message')).toContainText(
    /not saved|could not save/i,
  );
  await expect(page.locator('#mobile-sync')).not.toContainText(
    /saved offline|saved on device|saved ·/,
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.restoreStorage;
  });
  await page.locator('#retry-storage').click();
  await expect(page.locator('#storage-warning')).toBeHidden();
  await page.reload();
  await showHistory(page);
  await expect(page.locator('#history-body [data-id]')).toHaveCount(1);
});

test('damaged saved data can be downloaded intact while recovered history remains usable', async ({
  page,
  server,
}) => {
  const raw = JSON.stringify({
    solves: [
      {
        id: 'known-solve',
        date: '2026-01-01T12:00:00Z',
        ms: 12340,
        scramble: 'R U',
        penalty: 'none',
        splits: [],
        updatedAt: 1,
      },
      null,
    ],
    pending: [],
    lessonAttempts: [],
    settings: {},
  });
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('cube-studio-v1', value);
      sessionStorage.setItem('seeded', 'true');
    }
  }, raw);
  await openApp(page, server);
  await expect(page.locator('#storage-warning')).toBeVisible();
  await showHistory(page);
  await expect(page.locator('#history-body [data-id]')).toHaveCount(1);
  await expect(page.locator('#history-body')).toContainText('12.34');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-recovery').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const recovery = JSON.parse(Buffer.concat(chunks).toString());
  expect(recovery.original).toBe(raw);
  expect(recovery.current.solves).toHaveLength(1);
});

test('retry after a blocked startup merges existing history with newly timed solves', async ({
  page,
  server,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'cube-studio-v1',
      JSON.stringify({
        solves: [
          {
            id: 'existing',
            date: '2026-01-01T12:00:00Z',
            ms: 12340,
            scramble: 'R U',
            penalty: 'none',
            splits: [],
            updatedAt: 1,
          },
        ],
        pending: [],
        lessonAttempts: [],
        settings: {},
      }),
    );
    window.restoreStorageRead = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'cube-studio-v1')
        throw new DOMException('Synthetic blocked read', 'SecurityError');
      return window.restoreStorageRead.call(this, key);
    };
  });
  await openApp(page, server);
  await expect(page.locator('#storage-message')).toContainText(
    'Could not read saved data',
  );
  await startKeyboardSolve(page);
  await finishKeyboardSolve(page);
  await page.evaluate(() => {
    Storage.prototype.getItem = window.restoreStorageRead;
  });
  await page.locator('#retry-storage').click();
  await expect(page.locator('#storage-warning')).toBeHidden();
  await showHistory(page);
  await expect(page.locator('#history-body [data-id]')).toHaveCount(2);
  await expect(page.locator('#history-body')).toContainText('12.34');
});
