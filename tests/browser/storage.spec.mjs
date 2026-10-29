import {
  test,
  expect,
  openApp,
  startKeyboardSolve,
  finishKeyboardSolve,
  showHistory,
  storedState,
} from './fixtures.mjs';

test('migration preserves history, tombstones, pending lessons and settings; later saves write only changed records', async ({
  page,
  server,
}) => {
  const solves = Array.from({ length: 1000 }, (_, i) => ({
    id: `legacy-${i}`,
    date: '2026-01-01T12:00:00Z',
    ms: 12340 + i,
    scramble: 'R U',
    penalty: 'none',
    splits: [],
    updatedAt: i + 1,
    ...(i === 0 ? { deleted: true } : {}),
  }));
  const lesson = {
    ...solves[1],
    id: 'lesson',
    lessonId: '13',
    caseId: 'ready-right',
    completion: 'insertion',
  };
  const raw = JSON.stringify({
    solves,
    pending: [solves[0]],
    lessonAttempts: [lesson],
    pendingLessons: [lesson],
    lessonSyncVersion: 1,
    settings: { hold: 1000, orientation: 'white-bottom' },
  });
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('cube-studio-v1', raw);
      sessionStorage.setItem('seeded', 'true');
    }
  }, raw);
  await openApp(page, server);
  const migrated = await storedState(page);
  expect(migrated.solves).toHaveLength(1000);
  expect(migrated.solves.find((s) => s.id === 'legacy-0').deleted).toBe(true);
  expect(migrated.pending).toHaveLength(1);
  expect(migrated.pendingLessons[0].caseId).toBe('ready-right');
  expect(migrated.settings.hold).toBe(1000);
  expect(migrated.settings.orientation).toBe('white-bottom');
  await page.evaluate(() => {
    window.recordWrites = [];
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'solves') window.recordWrites.push(value.id);
      return put.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Hold to start').selectOption('300');
  await page.locator('#save-settings').click();
  await expect
    .poll(async () => (await storedState(page)).settings.hold)
    .toBe(300);
  expect(await page.evaluate(() => window.recordWrites)).toEqual([]);
  await showHistory(page);
  await page.locator('#history-body [data-id]').first().click();
  await page.locator('#solve-note').fill('Only this record changes');
  await page.locator('#save-solve').click();
  await expect
    .poll(
      async () =>
        (await storedState(page)).solves.filter(
          (s) => s.note === 'Only this record changes',
        ).length,
    )
    .toBe(1);
  expect(await page.evaluate(() => window.recordWrites.length)).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem('cube-studio-v1')),
  ).toBe(raw);
  await page.reload();
  await expect(page.locator('#new-scramble')).toBeEnabled();
  const reopened = await storedState(page);
  expect(reopened.settings.hold).toBe(300);
  expect(
    reopened.solves.filter((s) => s.note === 'Only this record changes'),
  ).toHaveLength(1);
});

test('discarding an invalid split-list draft allows the next solve to persist', async ({
  page,
  server,
}) => {
  await openApp(page, server);
  await page.locator('.sidebar [data-page="splits"]').click();
  await page.getByRole('button', { name: '+ New split list', exact: true }).click();
  await page.getByLabel('List name', { exact: true }).fill('Invalid draft');
  await page.getByLabel('Steps', { exact: true }).fill(Array.from({ length: 13 }, (_, i) => `Step ${i + 1}`).join(', '));
  await page.getByRole('button', { name: 'Save split list', exact: true }).click();
  await expect(page.locator('#split-editor-error')).toContainText('12 steps');
  await page.getByRole('button', { name: 'Close split editor', exact: true }).click();
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  await expect(page.locator('#timer-page')).toBeVisible();
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
    window.restoreStorage = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'solves')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.restoreStorage.call(this, value, key);
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
    IDBObjectStore.prototype.put = window.restoreStorage;
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
