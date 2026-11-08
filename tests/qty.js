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
  await page.click('#addBtn'); await page.fill('#nameInput', 'Shelf'); await page.click('#form button[type=submit]');
  await page.click('.row-item.place');
  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Power socket\nAllen key\nBulb');
  await page.click('#addSubmit'); await page.waitForTimeout(300);
  console.log('QTY BOX hidden for place editor:', await (async () => { await page.click('#editPlaceBtn'); const h = await page.locator('#qtyBox').isHidden(); await page.click('#cancelBtn'); return h; })());
  // power socket: tap + 4 times -> 5
  await page.click('.row-item.thing >> text=Power socket');
  console.log('default qty:', await page.inputValue('#qtyInput'));
  for (let i = 0; i < 4; i++) await page.click('#qtyPlus');
  await page.click('#form button[type=submit]'); await page.waitForTimeout(300);
  // allen key: type 12
  await page.click('.row-item.thing >> text=Allen key');
  await page.fill('#qtyInput', '12');
  await page.click('#form button[type=submit]'); await page.waitForTimeout(300);
  // bulb: 0 is allowed since v8 (shows ×0)
  await page.click('.row-item.thing >> text=Bulb');
  await page.click('#qtyMinus'); await page.fill('#qtyInput', '0');
  await page.click('#form button[type=submit]'); await page.waitForTimeout(300);
  console.log('LIST:', await list());
  await page.screenshot({ path: '/tmp/opencode/things-qty.png' });
  // export, wipe, import
  await page.click('#menuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  await dl.saveAs('/tmp/opencode/qty.zip'); await page.click('#closeMenu');
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('things'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await page.reload();
  await page.click('#menuBtn');
  await page.setInputFiles('#importFile', '/tmp/opencode/qty.zip');
  await page.waitForTimeout(1200);
  await page.click('.row-item.place');
  console.log('AFTER IMPORT:', await list());
  // existing data from before the feature (no qty field) still loads
  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
