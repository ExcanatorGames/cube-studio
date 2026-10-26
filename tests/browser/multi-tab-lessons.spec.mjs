import {
  test,
  expect,
  openApp,
  showHistory,
  storedState,
  connect,
  startKeyboardSolve,
  finishKeyboardSolve,
} from './fixtures.mjs';

async function manual(page, value) {
  await showHistory(page);
  await page.getByRole('button', { name: 'Add time', exact: true }).click();
  await page.locator('#manual-time').fill(value);
  await page.locator('#save-manual').click();
}

for (const fallback of [false, true]) {
  test(`two offline tabs retain concurrent saves, settings and deletion (${fallback ? 'IndexedDB' : 'Web Locks'})`, async ({
    page,
    context,
    server,
  }) => {
    if (fallback)
      await context.addInitScript(() =>
        Object.defineProperty(navigator, 'locks', { value: undefined }),
      );
    await openApp(page, server);
    const other = await context.newPage();
    await openApp(other, server);
    await context.setOffline(true);
    await Promise.all([manual(page, '12.34'), manual(other, '23.45')]);
    await expect
      .poll(async () => (await storedState(page)).solves.length)
      .toBe(2);
    await expect(page.locator('#history-body [data-id]')).toHaveCount(2);
    await expect(other.locator('#history-body [data-id]')).toHaveCount(2);
    expect((await storedState(page)).pending).toHaveLength(2);
    await page.locator('#history-body [data-id]').first().click();
    await page.locator('#delete-solve').click();
    await expect(other.locator('#history-body [data-id]')).toHaveCount(1);
    await manual(other, '34.56');
    await page.reload();
    await showHistory(page);
    await expect(page.locator('#history-body [data-id]')).toHaveCount(2);
    const saved = await storedState(page);
    expect(saved.solves).toHaveLength(3);
    expect(saved.solves.filter((s) => s.deleted)).toHaveLength(1);
    expect(saved.pending).toHaveLength(3);
  });
}

test('lesson attempts survive offline reload, sync to another device, and round-trip through CSV', async ({
  page,
  context,
  browser,
  server,
}) => {
  test.setTimeout(60_000);
  await openApp(page, server);
  await connect(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Lessons', exact: true }).click();
  await page.locator('[data-lesson="13"]').click();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.locator('#new-scramble')).toBeEnabled({ timeout: 20_000 });
  await startKeyboardSolve(page);
  await finishKeyboardSolve(page);
  await expect
    .poll(async () => (await storedState(page)).pendingLessons?.length)
    .toBe(1);
  const original = (await storedState(page)).lessonAttempts[0];
  await page.reload();
  expect((await storedState(page)).lessonAttempts).toEqual([original]);
  await context.setOffline(false);
  await expect.poll(() => server.lessonAttempts()).toEqual([original]);
  await expect
    .poll(async () => (await storedState(page)).pendingLessons)
    .toEqual([]);
  expect(server.solves()).toEqual([]);

  const device = await browser.newContext();
  await device.route('**/*', (route) =>
    new URL(route.request().url()).origin === server.url
      ? route.continue()
      : route.abort(),
  );
  try {
    const remote = await device.newPage();
    await openApp(remote, server);
    await connect(remote);
    await expect
      .poll(async () => (await storedState(remote)).lessonAttempts)
      .toEqual([original]);
    await showHistory(remote);
    await expect(remote.locator('#history-body [data-id]')).toHaveCount(0);
    await remote.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloadPromise = remote.waitForEvent('download');
    await remote.locator('#export').click();
    const download = await downloadPromise,
      stream = await download.createReadStream(),
      chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks);
    expect(csv.toString()).toContain('Lesson ID');
    expect(csv.toString()).toContain(original.caseId);
    const importedDevice = await browser.newContext();
    await importedDevice.route('**/*', (route) =>
      new URL(route.request().url()).origin === server.url
        ? route.continue()
        : route.abort(),
    );
    try {
      const imported = await importedDevice.newPage();
      await openApp(imported, server);
      await imported
        .getByRole('button', { name: 'Settings', exact: true })
        .click();
      await imported.locator('#open-import').click();
      await imported
        .locator('#csv-file')
        .setInputFiles({
          name: 'backup.csv',
          mimeType: 'text/csv',
          buffer: csv,
        });
      await expect(imported.locator('#confirm-import')).toBeEnabled();
      await imported.locator('#confirm-import').click();
      await expect
        .poll(async () => (await storedState(imported)).lessonAttempts?.length)
        .toBe(1);
      const restored = (await storedState(imported)).lessonAttempts[0];
      for (const key of [
        'id',
        'ms',
        'lessonId',
        'caseId',
        'completion',
        'scramble',
      ])
        expect(restored[key]).toEqual(original[key]);
      expect((await storedState(imported)).solves).toEqual([]);
      await showHistory(imported);
      await imported.locator('#history-import').click();
      await imported
        .locator('#csv-file')
        .setInputFiles({
          name: 'backup.csv',
          mimeType: 'text/csv',
          buffer: csv,
        });
      await expect(imported.locator('#import-preview')).toContainText(
        '1 already in your history',
      );
      await expect(imported.locator('#confirm-import')).toBeDisabled();
    } finally {
      await importedDevice.close();
    }
  } finally {
    await device.close();
  }
});
