const { chromium, devices } = require('/home/bibek/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/brave-origin', headless: true });
  const ctx = await browser.newContext({ ...devices['Pixel 5'], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8933/');
  await page.evaluate(() => indexedDB.deleteDatabase('things'));
  await page.reload();
  const list = async () => (await page.locator('#list').innerText()).replace(/\n/g, ' | ');
  const crumbs = async () => (await page.locator('#crumbs').innerText()).replace(/\n/g, ' ');
  const save = async () => { await page.click('#form button[type=submit]'); await page.waitForTimeout(300); };
  const makePlace = async name => { await page.click('#addBtn'); await page.fill('#nameInput', name); await save(); };

  await makePlace('Kitchen');
  await page.click('.row-item.place >> text=Kitchen');
  await page.click('#addBtn'); await page.click('#addPlaceBtn');
  await page.fill('#nameInput', 'Cupboard'); await save();
  await page.click('.row-item.place >> text=Cupboard');
  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Caustic soda\nBatteries AA\nTape\nBulb');
  await page.click('#addSubmit'); await page.waitForTimeout(300);
  console.log('LOW BUTTON before any minimum hidden:', await page.locator('#lowBtn').isHidden());

  // Caustic soda: have 2, need 5  (low)
  await page.click('.row-item.thing >> text=Caustic soda');
  await page.fill('#qtyInput', '2'); await page.fill('#minInput', '5'); await save();
  // Batteries: have 10, need 4 (fine)
  await page.click('.row-item.thing >> text=Batteries AA');
  await page.fill('#qtyInput', '10');
  for (let i = 0; i < 4; i++) await page.click('#minPlus');
  console.log('MIN after 4 plus:', await page.inputValue('#minInput'));
  await save();
  // Tape: have 1, need 2 (low, only 1 short)
  await page.click('.row-item.thing >> text=Tape');
  await page.fill('#minInput', '2'); await save();
  // Bulb: no minimum
  console.log('LIST:', await list());
  const lowRows = await page.locator('.row-item.low').allInnerTexts();
  console.log('RED ROWS:', lowRows.map(t => t.replace(/\n/g, ' ')));
  const bg = await page.locator('.row-item.low').first().evaluate(e => getComputedStyle(e).backgroundColor);
  console.log('RED BG:', bg);
  console.log('LOW BUTTON:', await page.locator('#lowBtn').innerText());
  await page.screenshot({ path: '/tmp/opencode/things-low-list.png' });

  // the ⚠ page, from a different place (top level)
  await page.click('#crumbs button[data-go=""]');
  await page.click('#lowBtn');
  console.log('LOW PAGE:', await crumbs(), '||', await list());
  console.log('LOW BUTTON hidden on low page:', await page.locator('#lowBtn').isHidden());
  await page.screenshot({ path: '/tmp/opencode/things-low-page.png' });

  // search still shows red rows
  await page.fill('#search', 'tape');
  console.log('SEARCH tape red:', await page.locator('.row-item.low').count());
  await page.fill('#search', '');

  // back button leaves the low page
  await page.goBack();
  console.log('AFTER BACK:', await crumbs(), '||', await list());
  await page.goForward();

  // fix Tape: set how many to 2 -> no longer low, drops off the page
  await page.click('.row-item.thing >> text=Tape');
  await page.fill('#qtyInput', '2'); await save();
  console.log('AFTER FIX TAPE:', await crumbs(), '||', await list());

  // select + move on the low page keeps min/qty
  await page.click('#selectBtn'); await page.click('.row-item.thing');
  await page.click('#selMove');
  await page.fill('#pickSearch', 'kitchen');
  await page.click('#pickList .row-item >> nth=0');
  await page.waitForTimeout(400);
  console.log('AFTER MOVE:', await crumbs(), '||', await list());
  await page.click('#selDone').catch(() => {});

  // export / wipe / import keeps min
  await page.click('#menuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  await dl.saveAs('/tmp/opencode/low.zip'); await page.click('#closeMenu');
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('things'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await page.reload();
  await page.click('#menuBtn');
  await page.setInputFiles('#importFile', '/tmp/opencode/low.zip');
  await page.waitForTimeout(1200);
  console.log('AFTER IMPORT LOW BUTTON:', await page.locator('#lowBtn').innerText());
  await page.click('#lowBtn');
  console.log('AFTER IMPORT LOW PAGE:', await list());
  // min of 0 / empty clears it
  await page.click('.row-item.thing');
  await page.fill('#minInput', ''); await save();
  console.log('CLEARED MIN:', await crumbs(), '||', await list());
  await page.fill('#search', 'caustic');
  await page.click('.row-item.thing');
  await page.click('#minPlus'); console.log('MIN plus from empty:', await page.inputValue('#minInput'));
  await page.click('#minMinus'); console.log('MIN minus from 1:', JSON.stringify(await page.inputValue('#minInput')));
  await page.click('#minMinus'); console.log('MIN minus again:', JSON.stringify(await page.inputValue('#minInput')));
  await page.click('#cancelBtn');
  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
