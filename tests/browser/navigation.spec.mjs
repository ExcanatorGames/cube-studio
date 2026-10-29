import {test,expect,openApp} from './fixtures.mjs';

for (const viewport of [{width:390,height:844},{width:1280,height:900}]) {
  test(`combined analysis page and navigation settings work at ${viewport.width}px`,async({page,server})=>{
    await page.setViewportSize(viewport);
    await openApp(page,server);
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    await expect(nav.locator('[data-page]')).toHaveCount(5);
    await expect(nav.getByRole('button',{name:'Solves',exact:true})).toHaveCount(0);
    await expect(nav.getByRole('link',{name:'Settings',exact:true})).toBeVisible();
    await expect(page.locator('.app-bar')).toHaveCount(0);
    await nav.getByRole('link',{name:'Analysis',exact:true}).click();
    await expect(page.getByRole('tab',{name:'Analysis',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#insights-page')).toBeVisible();
    const solves=page.getByRole('tab',{name:'Solves',exact:true});
    await page.getByRole('tab',{name:'Analysis',exact:true}).focus();
    await page.keyboard.press('End');
    await expect(solves).toBeFocused();
    await expect(page.locator('#history-page')).toBeVisible();
    await expect(nav.getByRole('link',{name:'Analysis',exact:true})).toHaveAttribute('aria-current','page');
      await page.getByRole('button',{name:'Add time',exact:true}).click();
    await page.locator('#manual-time').fill('12.34');
    await page.locator('#save-manual').click();
    await expect(page.locator('#history-body [data-id]')).toHaveCount(1);
    await page.getByRole('searchbox',{name:'Search solves'}).fill('unmatched');
    await expect(page.locator('#history-body [data-id]')).toHaveCount(0);
    await page.getByRole('tab',{name:'Analysis',exact:true}).click();
    await expect(page.locator('#insight-stats')).toContainText('12.34');
    await solves.click();
    await expect(page.getByRole('searchbox',{name:'Search solves'})).toHaveValue('unmatched');
    await page.getByRole('searchbox',{name:'Search solves'}).fill('');
    await nav.getByRole('link',{name:'Analysis',exact:true}).click();
    await expect(solves).toHaveAttribute('aria-selected','true');
    await nav.getByRole('link',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
    await page.locator('#settings-dialog').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{}))));
    await expect(solves).toHaveAttribute('aria-selected','true');
    const dimensions=await page.evaluate(()=>({
      width:document.documentElement.scrollWidth,
      table:document.querySelector('.history-table-scroll').getBoundingClientRect().height,
      bottom:document.querySelector('.pagination').getBoundingClientRect().bottom,
      nav:document.querySelector('.sidebar').getBoundingClientRect().top,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(viewport.width);
    expect(dimensions.table).toBeGreaterThan(150);
    if(viewport.width<=740)expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.nav);
    await page.waitForFunction(()=>!document.documentElement.dataset.motion);
    await page.screenshot({path:`test-results/combined-solves-${viewport.width}.png`});
    await nav.getByRole('link',{name:'Timer',exact:true}).click();
    await expect(page.locator('#analysis-page')).toBeHidden();
    expect(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow)).not.toBe('hidden');
    await nav.getByRole('link',{name:'Analysis',exact:true}).click();
    await expect(page.getByRole('tab',{name:'Analysis',exact:true})).toHaveAttribute('aria-selected','true');
    await page.waitForFunction(()=>!document.documentElement.dataset.motion);
    const filter=await page.getByRole('combobox',{name:'Solve count',exact:true}).boundingBox();
    expect(filter.y).toBeLessThan(140);
    expect(filter.x+filter.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({path:`test-results/combined-analysis-${viewport.width}.png`});
  });
}

test('inline filters stay visible and preserve selections when a phone rotates',async({page,server})=>{
  await openApp(page,server);
  await page.getByRole('link',{name:'Analysis',exact:true}).click();
  await page.getByRole('combobox',{name:'Solve count',exact:true}).selectOption('50');
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
    await page.setViewportSize(viewport);
    const filter=page.getByRole('combobox',{name:'Solve count',exact:true});
    await expect(filter).toBeVisible();await expect(filter).toHaveValue('50');
    const box=await filter.boundingBox();
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThan(viewport.height);
  }
});

test('phone toolbar sits at the card top and sync details open in Settings',async({page,server})=>{
  await page.setViewportSize({width:390,height:844});await openApp(page,server);
  await expect(page.locator('#settings-sync-dot')).toBeVisible();await expect(page.locator('#mobile-sync')).toBeHidden();
  const card=await page.locator('#timer-card').boundingBox(),toolbar=await page.locator('.timer-toolbar').boundingBox();
  expect(toolbar.y-card.y).toBeLessThan(12);
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  await expect(page.locator('#mobile-sync')).toBeVisible();await expect(page.locator('#connect-sync')).toBeVisible();
  await expect(page.locator('#hold-duration')).toHaveValue('0.5');
  await page.locator('#hold-duration').fill('0.7');await page.locator('#save-settings').click();
  await page.reload();await page.getByRole('link',{name:'Settings',exact:true}).click();
  await expect(page.locator('#hold-duration')).toHaveValue('0.7');
});
