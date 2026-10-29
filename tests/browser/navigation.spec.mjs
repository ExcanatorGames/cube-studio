import {test,expect,openApp,openControls,startKeyboardSolve,finishKeyboardSolve} from './fixtures.mjs';

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
    await openControls(page);
    await page.getByRole('button',{name:'Add time',exact:true}).click();
    await page.locator('#manual-time').fill('12.34');
    await page.locator('#save-manual').click();
    await expect(page.locator('#history-body [data-id]')).toHaveCount(1);
    await openControls(page);
    await page.getByRole('searchbox',{name:'Search solves'}).fill('unmatched');
    await expect(page.locator('#history-body [data-id]')).toHaveCount(0);
    await page.getByRole('tab',{name:'Analysis',exact:true}).click();
    await expect(page.locator('#insight-stats')).toContainText('12.34');
    await solves.click();
    await openControls(page);
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
    await openControls(page);
    const controls=await page.locator('#app-controls').boundingBox();
    if(viewport.width>740){
      const settings=await page.locator('#open-settings').boundingBox();
      expect(controls.y+controls.height).toBeLessThanOrEqual(settings.y+1);
    }else{
      expect(controls.x).toBeGreaterThan(20);
      expect(controls.y).toBeLessThan(80);
      await page.screenshot({path:'test-results/phone-controls-popup.png'});
      await page.keyboard.press('Escape');
      await expect(page.locator('#app-controls')).toBeHidden();
      await openControls(page);
      await page.getByRole('tab',{name:'Solves',exact:true}).click();
      await expect(page.locator('#app-controls')).toBeHidden();
      await page.getByRole('tab',{name:'Analysis',exact:true}).click();
      await page.waitForFunction(()=>!document.documentElement.dataset.motion);
    }
    await page.screenshot({path:`test-results/combined-analysis-${viewport.width}.png`});
  });
}

test('controls follow the viewport without resetting filters, including a rotated phone',async({page,server})=>{
  await openApp(page,server);
  await page.getByRole('link',{name:'Analysis',exact:true}).click();
  await page.getByRole('combobox',{name:'Solve count',exact:true}).selectOption('50');
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await expect(page.locator('#app-controls')).toBeHidden();
    await openControls(page);
    await expect(page.getByRole('combobox',{name:'Solve count',exact:true})).toHaveValue('50');
    const panel=await page.locator('#app-controls').boundingBox();
    expect(panel.x+panel.width).toBeLessThanOrEqual(viewport.width);
    expect(panel.y+panel.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-controls')).toBeHidden();
  }
  await page.setViewportSize({width:1280,height:900});
  await expect(page.locator('#app-controls')).toBeVisible();
  await expect(page.locator('#open-controls')).toBeHidden();
  await expect(page.getByRole('combobox',{name:'Solve count',exact:true})).toHaveValue('50');
});

test('keyboard actions in the phone controls popup do not stop or cancel a running solve',async({page,server})=>{
  await page.setViewportSize({width:390,height:844});
  await openApp(page,server);
  await startKeyboardSolve(page);
  await page.getByRole('button',{name:'Toggle fullscreen timer'}).click();
  await openControls(page);
  await page.locator('#open-controls').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app-controls')).toBeHidden();
  await expect(page.locator('#timer-card')).toHaveClass(/\brunning\b/);
  await openControls(page);
  await page.locator('#open-controls').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-controls')).toBeHidden();
  await expect(page.locator('#timer-card')).toHaveClass(/\brunning\b/);
  await page.locator('#timer-pad').focus();
  await finishKeyboardSolve(page);
});
