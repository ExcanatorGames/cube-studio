import {test, expect, openApp, startKeyboardSolve, finishKeyboardSolve, showHistory, storedState} from './fixtures.mjs';

test('keyboard timing saves one solve and restores it after reload', async ({page, server}) => {
  await openApp(page, server);
  await startKeyboardSolve(page);
  await finishKeyboardSolve(page);
  await expect.poll(async () => (await storedState(page)).solves.length).toBe(1);
  const {solves} = await storedState(page);
  expect(solves).toHaveLength(1);
  expect(solves[0].ms).toBeGreaterThanOrEqual(350);
  expect(solves[0].scramble).not.toBe('');
  await showHistory(page);
  const time = await page.locator('#history-body .history-time').innerText();
  await page.reload();
  await showHistory(page);
  await expect(page.locator('#history-body [data-id]')).toHaveCount(1);
  await expect(page.locator('#history-body .history-time')).toHaveText(time);
  expect((await storedState(page)).solves).toEqual(solves);
});

test('releasing Space before ready and Escape cancellation do not save solves', async ({page, server}) => {
  await openApp(page, server);
  await page.locator('#timer-pad').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#timer-card')).not.toHaveClass(/\b(arming|armed|running)\b/);
  await startKeyboardSolve(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#toast')).toHaveText('Cancelled.');
  expect((await storedState(page)).solves || []).toHaveLength(0);
});

test.describe('Chromium native touch input', () => {
  test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

  test('two independent touch contacts arm, start only after both lift, and stop once', async ({page, context, server}) => {
    await openApp(page, server);
    const client = await context.newCDPSession(page);
    await page.evaluate(() => {
      window.observedTouches = [];
      document.querySelector('#timer-pad').addEventListener('pointerdown', event => {
        window.observedTouches.push({id: event.pointerId, trusted: event.isTrusted, type: event.pointerType});
      });
    });
    const box = await page.locator('#clock').boundingBox();
    const left = {id: 1, x: box.x + box.width * 0.3, y: box.y + box.height / 2};
    const right = {id: 2, x: box.x + box.width * 0.7, y: box.y + box.height / 2};
    const touch = (type, touchPoints) => client.send('Input.dispatchTouchEvent', {type, touchPoints});
    await touch('touchStart', [left]);
    await expect(page.locator('#timer-card')).not.toHaveClass(/\b(arming|armed|running)\b/);
    await touch('touchStart', [left, right]);
    await expect(page.locator('#timer-card')).toHaveClass(/\barmed\b/);
    await touch('touchEnd', [right]);
    await expect(page.locator('#timer-card')).toHaveClass(/\barmed\b/);
    await touch('touchEnd', []);
    await expect(page.locator('#timer-card')).toHaveClass(/\brunning\b/);
    await expect.poll(async () => Number(await page.locator('#clock').innerText())).toBeGreaterThanOrEqual(0.4);
    const stopBox = await page.locator('#clock').boundingBox();
    await touch('touchStart', [{id: 3, x: stopBox.x + stopBox.width / 2, y: stopBox.y + stopBox.height / 2}]);
    await touch('touchEnd', []);
    await expect(page.locator('#timer-card')).not.toHaveClass(/\brunning\b/);
    await expect.poll(async () => (await storedState(page)).solves.length).toBe(1);
    const events = await page.evaluate(() => window.observedTouches);
    expect(events).toHaveLength(3);
    expect(events.every(event => event.trusted && event.type === 'touch')).toBe(true);
    expect(events[0].id).not.toBe(events[1].id);
    await client.detach();
  });
});
