import {test, expect, openApp, startKeyboardSolve, finishKeyboardSolve, storedState} from './fixtures.mjs';

test('deleting a solve ignores an unsaved penalty and Undo restores the saved result', async ({page, server}) => {
  await openApp(page, server);
  await startKeyboardSolve(page);
  await finishKeyboardSolve(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Edit result', exact: true}).click();
  await page.locator('#solve-dialog [data-penalty="+2"]').click();
  await page.locator('#delete-solve').click();
  await expect.poll(async () => (await storedState(page)).solves[0]?.deleted).toBe(true);
  expect((await storedState(page)).solves[0].penalty).toBe('none');
  await page.locator('#toast button').click();
  await expect.poll(async () => (await storedState(page)).solves[0]?.deleted).toBe(false);
  expect((await storedState(page)).solves[0].penalty).toBe('none');
});

test('the lesson demo names its scramble position and keeps the animation speed between cases', async ({page, server}) => {
  await openApp(page, server);
  await page.goto(server.url + '/lessons/f2l/easy-inserts/lesson');
  await expect(page.locator('.lesson-cube svg')).toBeVisible({timeout: 20_000});
  await expect(page.locator('.lesson-demo-frame')).toHaveText('Scramble: white top · green front');
  await page.locator('#lesson-animation-speed').fill('2');
  await page.locator('[data-lesson-case]').nth(1).click();
  await expect(page.locator('.lesson-cube svg')).toBeVisible({timeout: 20_000});
  await expect(page.locator('#lesson-animation-speed')).toHaveValue('2');
  await expect(page.locator('.lesson-speed output')).toHaveText('2×');
  await page.reload();
  await expect(page.locator('.lesson-cube svg')).toBeVisible({timeout: 20_000});
  await expect(page.locator('#lesson-animation-speed')).toHaveValue('2');
});

test('practice cards count only the cases still turned on', async ({page, server}) => {
  await openApp(page, server);
  await page.getByRole('link', {name: 'Practice', exact: true}).click();
  await page.getByRole('link', {name: 'Practice F2L · Easy Inserts', exact: true}).click();
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout: 20_000});
  await page.locator('#practice-case-list [data-practice-case]').first().click();
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout: 20_000});
  await page.getByRole('link', {name: 'All practices', exact: true}).click();
  await expect(page.locator('[data-practice-count="f2l-0"]')).toHaveText('3 of 4 cases');
  await expect(page.locator('[data-practice-count="f2l-1"]')).toHaveText(/^\d+ cases$/);
});
