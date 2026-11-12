// v14: swipe a row left to show Edit / Move / Delete.
const { chromium } = require('/home/bibek/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/brave-origin', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8933/');
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('things'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await page.reload();
  const save = async () => { await page.click('#form button[type=submit]'); await page.waitForTimeout(300); };
  const list = async () => (await page.locator('#list').innerText()).replace(/\n/g, ' | ');
  const row = name => page.locator('.row-item', { hasText: name }).first();
  const swipe = async (name, dx) => {
    const b = await row(name).boundingBox();
    const y = b.y + b.height / 2, x = b.x + b.width - 60;
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y);
    await page.mouse.up(); await page.waitForTimeout(300);
  };
  const shift = name => row(name).evaluate(el => el.style.transform || 'none');

  for (const p of ['Kitchen', 'Garage']) { await page.click('#addBtn'); await page.fill('#nameInput', p); await save(); }
  await row('Kitchen').click();
  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Tape\nBulb\nSoda');
  await page.click('#addSubmit'); await page.waitForTimeout(300);

  await swipe('Tape', -200);
  console.log('OPEN after swipe:', await shift('Tape'), '| editor open?', await page.locator('#editor[open]').count());
  await page.screenshot({ path: '/tmp/opencode/things-swipe-open.png' });
  await row('Bulb').click(); await page.waitForTimeout(300);
  console.log('Tap other row closes, no editor:', await shift('Tape'), await page.locator('#editor[open]').count());

  await swipe('Tape', -200); await swipe('Tape', 150);
  console.log('Swipe back right closes:', await shift('Tape'));

  await swipe('Bulb', -20 * 0 - 30);
  console.log('Short swipe stays closed:', await shift('Bulb'));

  await swipe('Bulb', -200); await row('Bulb').locator('.act-edit').click(); await page.waitForTimeout(300);
  console.log('Edit opens editor with:', await page.inputValue('#nameInput'));
  await page.click('#cancelBtn');

  await swipe('Tape', -200); await row('Tape').locator('.act-move').click(); await page.waitForTimeout(300);
  console.log('Picker title:', await page.locator('#pickTitle').innerText());
  await page.click('#pickCrumbs button[data-go=""]');
  await page.locator('#pickList .row-item', { hasText: 'Garage' }).locator('.pick').click(); await page.waitForTimeout(500);
  console.log('After move, now in:', await page.locator('#crumbs').innerText(), '| list:', await list());

  await page.click('#crumbs button[data-go=""]'); await row('Kitchen').click();
  await swipe('Soda', -200); await row('Soda').locator('.act-del').click(); await page.waitForTimeout(400);
  console.log('After delete:', await list(), '| toast:', await page.locator('#toastText').innerText());
  await page.click('#toastBtn'); await page.waitForTimeout(400);
  console.log('After undo:', await list());

  await page.click('#selectBtn');
  console.log('Select mode has no swipe buttons:', await page.locator('#list .acts').count());
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
