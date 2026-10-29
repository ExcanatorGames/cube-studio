import {test, expect, openApp, storedState, startKeyboardSolve} from './fixtures.mjs';

async function chooseTimerSplit(page, name) {
  await page.getByRole('button', {name:'Choose timer split list',exact:true}).click();
  const menu = page.getByRole('menu', {name:'Timer split lists',exact:true});
  await expect(menu).toBeVisible();
  const control = await page.locator('#timer-split-control').boundingBox();
  const panel = await menu.boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(12);
  expect(panel.x + panel.width).toBeLessThanOrEqual(page.viewportSize().width - 12);
  expect(panel.x).toBeLessThanOrEqual(control.x);
  expect(panel.x + panel.width).toBeGreaterThanOrEqual(control.x + control.width - 1);
  expect(panel.width).toBeGreaterThanOrEqual(control.width);
  expect(panel.y).toBeGreaterThan(control.y + control.height);
  await page.getByRole('menuitemradio', {name,exact:true}).click();
  await expect(menu).toBeHidden();
}


test('cube preferences validate adjacent faces and persist after reload and offline reopening', async ({page, context, server}) => {
  await openApp(page, server);
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  await expect(page.locator('#preset')).toHaveCount(0);
  await page.getByRole('combobox', {name:'Color on top',exact:true}).selectOption('green');
  await expect(page.locator('#cube-front option')).toHaveCount(4);
  expect(await page.locator('#cube-front option').evaluateAll(options => options.map(option => option.value))).not.toContain('blue');
  await page.getByRole('combobox', {name:'Color in front',exact:true}).selectOption('red');
  await page.locator('#lesson-orientation').selectOption('white-top');
  await page.getByRole('combobox', {name:'Solving colors',exact:true}).selectOption('white-yellow');
  await page.locator('#save-settings').click();
  await expect(page.locator('#cube-preview svg')).toHaveAttribute('aria-label', /green on top and red in front/);
  await expect.poll(async () => (await storedState(page)).settings.orientation).toBe('green-red');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#new-scramble')).toBeEnabled();
  await expect(page.locator('#scramble-type')).toHaveText('Random state', {timeout:20000});
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  await expect(page.locator('#cube-top')).toHaveValue('green');
  await expect(page.locator('#cube-front')).toHaveValue('red');
  await expect(page.locator('#lesson-orientation')).toHaveValue('white-top');
  await expect(page.locator('#solve-colors')).toHaveValue('white-yellow');
  await page.locator('#solve-colors').selectOption('neutral');
  await page.locator('#save-settings').click();
  await expect.poll(async () => (await storedState(page)).settings.solveColors).toBe('neutral');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.sidebar [data-page="splits"]').click();
  await expect(page.locator('#splits-page')).toBeVisible();
  const navigation = await page.locator('.sidebar nav > button').evaluateAll(buttons => buttons.map(button => ({y:button.getBoundingClientRect().y,bottom:button.getBoundingClientRect().bottom})));
  expect(new Set(navigation.map(button => button.y)).size).toBe(1);
  expect(navigation.every(button => button.bottom <= 844)).toBe(true);
});

test('split lists drive the timer, preserve recorded steps after editing, and survive reload', async ({page, server}) => {
  await openApp(page, server);
  await page.locator('.sidebar [data-page="splits"]').click();
  await expect(page.getByRole('heading', {name:'CFOP',exact:true})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Roux',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'+ New split list',exact:true}).click();
  await page.getByLabel('List name', {exact:true}).fill('My phases');
  await page.getByLabel('Steps', {exact:true}).fill('Plan\nBuild, Finish');
  await page.getByRole('button', {name:'Save split list',exact:true}).click();
  const card = page.locator('.split-method-card').filter({has:page.getByRole('heading', {name:'My phases',exact:true})});
  await expect(page.locator('#split-editor-dialog')).not.toBeVisible();
  await page.getByRole('button', {name:'Timer',exact:true}).click();
  await expect(page.locator('#timer-page')).toBeVisible();
  await page.setViewportSize({width:320,height:700});
  const toolbarFits = await page.locator('.timer-toolbar').evaluate(toolbar => {
    const bounds = toolbar.getBoundingClientRect();
    return [...toolbar.children].every(control => {
      const box = control.getBoundingClientRect();
      return !box.width || (box.left >= bounds.left - 1 && box.right <= bounds.right + 1);
    });
  });
  expect(toolbarFits).toBe(true);
  const picker = page.getByRole('button', {name:'Choose timer split list',exact:true});
  await chooseTimerSplit(page,'My phases');
  await expect(page.locator('#fullscreen-track .split-selection-name')).toHaveText('My phases');
  await expect(page.locator('#fullscreen-track')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#fullscreen-splits')).toBeHidden();
  await page.locator('#fullscreen-track').click();
  await expect(page.locator('#fullscreen-splits .split-name')).toHaveText(['Plan','Build','Finish']);
  await chooseTimerSplit(page,'CFOP');
  await expect(page.locator('#fullscreen-track .split-selection-name')).toHaveText('CFOP');
  await expect(page.locator('#fullscreen-track')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#fullscreen-splits .split-name')).toHaveText(['Cross','F2L','OLL','PLL']);
  await chooseTimerSplit(page,'My phases');
  await expect.poll(async () => { const settings = (await storedState(page)).settings; return settings.splitMethods.find(method => method.id === settings.preset)?.name; }).toBe('My phases');
  await page.setViewportSize({width:1280,height:900});
  await page.reload();
  await expect(page.locator('#scramble-type')).toHaveText('Random state', {timeout:20000});
  await expect(picker).toHaveAttribute('title', /My phases/);
  await startKeyboardSolve(page);
  await expect(picker).toBeDisabled();
  await expect(page.locator('#fullscreen-track')).toBeDisabled();
  await expect(page.locator('#fullscreen-splits .split-name')).toHaveText(['Plan','Build','Finish']);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await storedState(page)).solves.length).toBe(1);
  await expect(picker).toBeEnabled();
  expect((await storedState(page)).solves[0].splits.map(step => step.name)).toEqual(['Plan','Build','Finish']);
  await page.getByRole('button', {name:'Toggle fullscreen timer',exact:true}).click();
  await page.locator('.sidebar [data-page="splits"]').click();
  await page.getByRole('button', {name:'Edit My phases',exact:true}).click();
  await page.getByLabel('Steps', {exact:true}).fill('Start\nEnd');
  await page.getByRole('button', {name:'Save split list',exact:true}).click();
  await expect(page.locator('#split-editor-dialog')).not.toBeVisible();
  await page.reload();
  await page.locator('.sidebar [data-page="splits"]').click();
  await expect(card.locator('li')).toHaveText(['Start','End']);
  await page.getByRole('button', {name:'Analysis',exact:true}).click();
  await page.getByRole('combobox', {name:'Split method',exact:true}).selectOption({label:'Recorded · Plan / Build / Finish'});
  await expect(page.locator('#split-progress-count')).toHaveText(/1/);
  await page.locator('.sidebar [data-page="splits"]').click();
  await page.getByRole('button', {name:'Delete My phases',exact:true}).click();
  await expect(card).toHaveCount(0);
});

for (const width of [320, 1280]) {
  test(`split menu supports keyboard selection and dismissal at ${width}px`, async ({page,server}) => {
    await page.setViewportSize({width,height:900});
    await openApp(page,server);
    const trigger = page.getByRole('button',{name:'Choose timer split list',exact:true});
    const menu = page.getByRole('menu',{name:'Timer split lists',exact:true});
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitemradio',{name:'Beginner',exact:true})).toBeFocused();
    await expect(page.getByRole('menuitemradio',{name:'Beginner',exact:true})).toHaveAttribute('aria-checked','true');
    await page.screenshot({path:`test-results/split-menu-${width}.png`});
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitemradio',{name:'Custom',exact:true})).toBeFocused();
    await page.getByRole('menuitemradio',{name:'Roux',exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(page.locator('#fullscreen-track .split-selection-name')).toHaveText('Roux');
    await expect(page.locator('#fullscreen-track')).toHaveAttribute('aria-pressed','false');
    await trigger.click();
    await expect(page.getByRole('menuitemradio',{name:'Roux',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded','false');
    await trigger.click();
    await page.locator('.sidebar [data-page="timer"]').click();
    await expect(menu).toBeHidden();
    expect((await storedState(page)).solves).toHaveLength(0);
  });
}
