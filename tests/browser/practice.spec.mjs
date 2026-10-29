import {test,expect,openApp,storedState,startKeyboardSolve,finishKeyboardSolve,pageControl} from './fixtures.mjs';

async function countTransitions(page) {
  await page.waitForFunction(() => !document.documentElement.dataset.motion);
  await page.evaluate(() => {
    globalThis.pageTransitions = 0;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      pageTransitions++;
      return original(...args);
    };
  });
}

async function holdPractice(page, id, touch = false) {
  const card=page.locator(`[data-practice-open="${id}"]`);
  if(!touch){await card.click({delay:650});return;}
  await page.waitForFunction(()=>!document.documentElement.dataset.motion);
  await card.click({trial:true});
  const rect=await card.boundingBox();
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2,id:1}]});
  await expect(page.locator(`[data-practice-select="${id}"]`)).toBeVisible();
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await session.detach();
}

test('desktop cube rows choose lesson demos and filter practice cases inside the solve box',async({page,server})=>{
  test.setTimeout(60_000);
  await openApp(page,server);
  await page.getByRole('button',{name:'Lessons',exact:true}).click();
  await page.locator('[data-lesson-group="f2l-1"]').click();
  await expect(page.locator('#lesson-case-row')).toBeVisible();
  await expect(page.locator('#lesson-case-dropdown')).toHaveCount(0);
  await expect(page.locator('#practice-lesson-group')).toHaveCount(0);
  await expect(page.locator('#lesson-case-row [data-lesson-case]')).toHaveCount(10);
  const row=page.locator('#lesson-case-list');
  expect(await row.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  const demoCase=page.locator('#lesson-case-row [data-lesson-case]').nth(3);
  await demoCase.click();
  await expect(demoCase).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#lesson-demo [data-action="play"]')).toBeEnabled({timeout:20_000});
  const demoLayout=await page.evaluate(()=>{
    const code=document.querySelector('.lesson-demo-setup code');
    const scramble=code.getBoundingClientRect();
    return {rowBottom:document.querySelector('#lesson-case-row').getBoundingClientRect().bottom,
      scrambleTop:scramble.top,scrambleBottom:scramble.bottom,fontSize:parseFloat(getComputedStyle(code).fontSize),
      layoutTop:document.querySelector('.lesson-demo-layout').getBoundingClientRect().top};
  });
  expect(demoLayout.rowBottom).toBeLessThanOrEqual(demoLayout.scrambleTop);
  expect(demoLayout.fontSize).toBeGreaterThanOrEqual(22);
  expect(demoLayout.layoutTop-demoLayout.scrambleBottom).toBeLessThanOrEqual(20);
  await page.setViewportSize({width:1920,height:1080});
  await expect.poll(()=>row.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/desktop-lesson-selectors.png'});
  await page.getByRole('tab',{name:'Practice',exact:true}).click();
  await expect(page.locator('#practice-case-picker')).toBeVisible();
  await expect(page.locator('#practice-case-list [data-practice-case]')).toHaveCount(10);
  const omitted=page.locator('#practice-case-list [data-practice-case]').nth(2);
  const omittedId=await omitted.getAttribute('data-practice-case');
  await omitted.click();
  await expect(omitted).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#practice-case-list [aria-pressed="true"]')).toHaveCount(9);
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout:20_000});
  expect(await page.locator('#practice-case-picker').evaluate(el=>document.querySelector('#timer-card').contains(el)&&!document.querySelector('#timer-pad').contains(el))).toBe(true);
  await page.screenshot({path:'test-results/desktop-practice-selectors.png'});
  await startKeyboardSolve(page);
  await expect(omitted).toBeDisabled();
  await finishKeyboardSolve(page);
  await expect.poll(async()=>(await storedState(page)).lessonAttempts.length).toBe(1);
  expect((await storedState(page)).lessonAttempts[0].caseId).not.toBe(omittedId);
  await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Lesson',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#lesson-case-row')).toBeVisible();
  expect(await row.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await expect(demoCase).toHaveAttribute('aria-pressed','true');
});

for (const viewport of [{width:390,height:844},{width:320,height:568}]) {
  test(`phone lesson cube strip and speed controls work at ${viewport.width}px`,async({page,server})=>{
    await page.setViewportSize(viewport);
    await openApp(page,server);
    await page.getByRole('button',{name:'Lessons',exact:true}).click();
    await page.locator('[data-lesson-group="f2l-1"]').click();
    const row=page.locator('#lesson-case-list');
    await expect(page.locator('#lesson-case-dropdown')).toHaveCount(0);
    expect(await row.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
    const lastCase=row.locator('[data-lesson-case]').last();
    await lastCase.click();
    await expect(lastCase).toHaveAttribute('aria-pressed','true');
    expect(await row.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    const speed=page.locator('#lesson-animation-speed');
    await expect(speed).toBeVisible({timeout:20_000});
    await speed.focus();
    await speed.press('End');
    await expect(page.locator('.lesson-speed output')).toHaveText('4×');
    const layout=await page.evaluate(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect();
      const heading=rect('.lesson-speed-heading'),value=rect('.lesson-speed output'),slider=rect('#lesson-animation-speed');
      return {headingTop:heading.top,headingBottom:heading.bottom,valueTop:value.top,
        sliderTop:slider.top,sliderBottom:slider.bottom,navTop:rect('.sidebar').top,
        playbackBottom:rect('.lesson-playback').bottom,speedTop:rect('.lesson-speed').top,
        cubeHeight:rect('.lesson-cube').height,pageWidth:document.documentElement.scrollWidth};
    });
    expect(Math.abs(layout.headingTop-layout.valueTop)).toBeLessThan(3);
    expect(layout.sliderTop).toBeGreaterThanOrEqual(layout.headingBottom);
    expect(layout.speedTop-layout.playbackBottom).toBeGreaterThanOrEqual(6);
    expect(layout.sliderBottom).toBeLessThanOrEqual(layout.navTop);
    expect(layout.cubeHeight).toBeGreaterThan(40);
    expect(layout.pageWidth).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({path:`test-results/mobile-lesson-controls-${viewport.width}.png`});
  });
}

for (const width of [390, 1920]) {
  test(`lesson and practice cards fill the width and show complete case previews at ${width}px`,async({page,server})=>{
    await page.setViewportSize({width,height:1080});
    await openApp(page,server);
    await page.getByRole('button',{name:'Practice',exact:true}).click();
    await expect(page.locator('#practice-list h2,#practice-list h3,#practice-list p,.lesson-card-arrow')).toHaveCount(0);
    await expect(page.locator('#practice-cards .catalog-case-preview')).toHaveCount(41);
    const inspect=()=>page.locator('.practice-card:visible,.catalog-lesson-card:visible').evaluateAll(cards=>cards.map(card=>{
      const rect=card.getBoundingClientRect(),parent=card.parentElement.getBoundingClientRect();
      const strip=card.querySelector('.catalog-case-previews').getBoundingClientRect();
      const previews=[...card.querySelectorAll('.catalog-case-preview')].map(item=>item.getBoundingClientRect());
      const visible=previews.filter(item=>item.top>=strip.top-.5&&item.bottom<=strip.bottom+.5&&item.right<=strip.right+.5);
      return {width:rect.width,parentWidth:parent.width,previews:previews.length,visible:visible.length,stripWidth:strip.width};
    }));
    const verify=rows=>{
      expect(rows).toHaveLength(6);
      for(const row of rows){
        expect(Math.abs(row.width-row.parentWidth)).toBeLessThan(2);
        expect(row.visible).toBeGreaterThan(0);
        if(width>740)expect(row.visible).toBe(row.previews);
        else if(row.visible<row.previews)expect((row.visible+1)*64+row.visible*8).toBeGreaterThan(row.stripWidth);
      }
    };
    verify(await inspect());
    await page.screenshot({path:`test-results/practice-cards-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Lessons',exact:true}).click();
    await expect(page.locator('[data-lesson-group]')).toHaveCount(6);
    await expect(page.locator('#lesson-cards .catalog-case-preview')).toHaveCount(41);
    verify(await inspect());
    await page.screenshot({path:`test-results/lesson-cards-${width}.png`,fullPage:true});
    await page.locator('[data-lesson-group="f2l-3"]').click();
    await expect(page.locator('#lesson-title')).toHaveText('F2L · Edge in Slot');
    await expect(page.locator('#lesson-group')).toBeHidden();
    await expect(page.locator('[data-lesson-case]')).toHaveCount(6);
    await pageControl(page,'All lessons');
    await page.locator('[data-lesson-group="f2l-1"]').click();
    await expect(page.locator('#lesson-title')).toHaveText('F2L · Disconnected Pairs');
    await expect(page.locator('[data-lesson-case]')).toHaveCount(10);
  });
}

test('Practice lists groups first, opens one directly, and ignores clicks on the active navigation',async({page,server})=>{
  await openApp(page,server);
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await expect(page.locator('#practice-list')).toBeVisible();
  await expect(page.locator('.practice-card')).toHaveCount(6);
  await expect(page.locator('#timer-card')).toBeHidden();
  await expect(page.locator('#start-practice-mix')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await countTransitions(page);
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  expect(await page.evaluate(()=>pageTransitions)).toBe(0);
  await page.getByRole('button',{name:'Practice F2L · Corner in Slot',exact:true}).click();
  await expect(page.locator('#practice-page #timer-card')).toBeVisible();
  await expect(page.locator('#lesson-title')).toHaveText('F2L · Corner in Slot');
  await expect(page.locator('#practice-list')).toBeHidden();
  await expect(page.locator('#lesson-detail input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('.lesson-practice-sidebar')).toHaveCount(0);
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout:20_000});
  const scramble=await page.locator('#fullscreen-scramble').innerText();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  expect(await page.evaluate(()=>pageTransitions)).toBe(0);
  expect(await page.locator('#fullscreen-scramble').innerText()).toBe(scramble);
  await expect(page.locator('#practice-list')).toBeHidden();
  await pageControl(page,'All practices');
  await expect(page.locator('#practice-list')).toBeVisible();
  await expect(page.locator('#timer-card')).toBeHidden();
});

test('desktop practice checkboxes are always available and open a saved mix without holding',async({page,server})=>{
  await openApp(page,server);
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  const corners=page.getByRole('checkbox',{name:'Include F2L · Corner in Slot',exact:true});
  const edges=page.getByRole('checkbox',{name:'Include F2L · Edge in Slot',exact:true});
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await corners.check();await edges.check();
  await corners.uncheck();await edges.uncheck();
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await corners.check();await edges.check();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.setViewportSize({width:1280,height:900});
  await expect(corners).toBeChecked();await expect(edges).toBeChecked();
  await page.reload();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await expect(corners).toBeChecked();await expect(edges).toBeChecked();
  await page.locator('[data-practice-open="f2l-2"]').click();
  await expect(page.locator('#timer-card #practice-case-list [aria-pressed="true"]')).toHaveCount(12);
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout:20_000});
  await page.waitForFunction(()=>!document.documentElement.dataset.motion);
  const layout=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect();
    return {picker:rect('#practice-case-picker').bottom,toolbar:rect('.timer-toolbar').top,
      timer:rect('#timer-pad').top,bottom:rect('#timer-card').bottom,height:innerHeight};
  });
  expect(layout.picker).toBeLessThanOrEqual(layout.toolbar);
  expect(layout.toolbar).toBeLessThan(layout.timer);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height);
  await page.screenshot({path:'test-results/desktop-practice-solve-box.png'});
  await pageControl(page,'All practices');
  await corners.uncheck();await edges.uncheck();
  await page.getByRole('button',{name:'Practice F2L · Easy Inserts',exact:true}).click();
  await expect(page.locator('#practice-case-list [aria-pressed="true"]')).toHaveCount(4);
  await page.getByRole('button',{name:'Timer',exact:true}).click();
  await expect(page.locator('#practice-case-picker')).toBeHidden();
});

test('selected practices persist, start an exact mix, and save the generated source case',async({page,server})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:390,height:844});
  await openApp(page,server);
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await holdPractice(page,'f2l-2');
  await expect(page.locator('#practice-list')).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Include F2L · Corner in Slot',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Include F2L · Edge in Slot',exact:true}).check();
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await expect(page.locator('#timer-card')).toBeHidden();
  await expect.poll(async()=> (await storedState(page)).settings.lessonCaseSelections?.mixed?.length).toBe(12);
  const selected=(await storedState(page)).settings.lessonCaseSelections.mixed;
  await page.reload();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // A direct single-practice session must not overwrite the saved mix.
  await page.getByRole('button',{name:'Practice F2L · Easy Inserts',exact:true}).click();
  await pageControl(page,'All practices');
  await holdPractice(page,'f2l-2');
  await expect(page.getByRole('checkbox',{name:'Include F2L · Edge in Slot',exact:true})).toBeChecked();
  await page.locator('[data-practice-open="f2l-2"]').click();
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout:20_000});
  const scramble=await page.locator('#fullscreen-scramble').innerText();
  await startKeyboardSolve(page);
  await expect(page.locator('#practice-back')).toBeDisabled();
  await expect(page.locator('[data-page="lessons"]')).toBeDisabled();
  await finishKeyboardSolve(page);
  await expect.poll(async()=> (await storedState(page)).lessonAttempts.length).toBe(1);
  const state=await storedState(page),attempt=state.lessonAttempts[0];
  expect(selected).toContain(attempt.caseId);
  expect(attempt.lessonId).toBe('f2l');
  expect(attempt.scramble.replace(/\s+/g,' ')).toBe(scramble.replace(/\s+/g,' '));
  expect(state.solves).toHaveLength(0);
  await page.keyboard.press('Escape');
  await pageControl(page,'All practices');
  await page.getByRole('checkbox',{name:'Include F2L · Corner in Slot',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'Include F2L · Edge in Slot',exact:true}).uncheck();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('#practice-cards')).not.toHaveClass(/practice-selecting/);
  await page.getByRole('button',{name:'Lessons',exact:true}).click();
  await page.locator('[data-lesson-group="f2l-5"]').click();
  await page.getByRole('tab',{name:'Practice',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Practice',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#new-scramble')).toBeEnabled();
  await expect(page.locator('.lesson-practice-sidebar')).toHaveCount(0);
  await page.getByRole('button',{name:'Timer',exact:true}).click();
  await expect(page.locator('#timer-page #timer-card')).toBeVisible();
  await expect(page.locator('#fullscreen-track')).toBeVisible();
});

test('mobile practices have a selectable list and a separate timer that fits above navigation',async({page,server})=>{
  await page.setViewportSize({width:390,height:844});
  await openApp(page,server);
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await expect(page.locator('#timer-card')).toBeHidden();
  await holdPractice(page,'f2l-0',true);
  await expect(page.locator('#practice-list')).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Include F2L · Easy Inserts',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Include F2L · Disconnected Pairs',exact:true}).check();
  await page.screenshot({path:'test-results/practice-list-mobile.png',fullPage:true});
  await page.locator('[data-practice-open="f2l-0"]').click();
  await expect(page.locator('#new-scramble')).toBeEnabled({timeout:20_000});
  const layout=await page.evaluate(()=>{
    const card=document.querySelector('#timer-card').getBoundingClientRect();
    const nav=document.querySelector('.sidebar').getBoundingClientRect();
    const clock=document.querySelector('#clock').getBoundingClientRect();
    return {width:document.documentElement.scrollWidth,bottom:card.bottom,navTop:nav.top,clockTop:clock.top,clockBottom:clock.bottom,cardTop:card.top};
  });
  expect(layout.width).toBeLessThanOrEqual(390);
  expect(layout.bottom).toBeLessThanOrEqual(layout.navTop);
  expect(layout.clockTop).toBeGreaterThanOrEqual(layout.cardTop);
  expect(layout.clockBottom).toBeLessThanOrEqual(layout.bottom);
  await page.screenshot({path:'test-results/practice-timer-mobile.png'});
  await pageControl(page,'All practices');
  await expect(page.getByRole('checkbox',{name:'Include F2L · Easy Inserts',exact:true})).toBeChecked();
  const tabs=await page.locator('.sidebar .nav').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().toJSON()));
  expect(new Set(tabs.map(tab=>Math.round(tab.top))).size).toBe(1);
});
