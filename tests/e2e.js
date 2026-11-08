const { chromium } = require('/home/bibek/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/brave-origin', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8933/');
  const shot = n => page.screenshot({ path: `/tmp/opencode/things-${n}.png` });
  const text = s => page.locator(s).innerText();

  // 1. empty state, create top-level place
  console.log('EMPTY:', (await text('#list')).replace(/\n/g, ' | '));
  await page.click('#addBtn');
  await page.fill('#nameInput', 'Bedroom');
  await page.click('#form button[type=submit]');
  await page.waitForTimeout(300);
  console.log('AFTER BEDROOM:', (await text('#list')).replace(/\n/g, ' | '));

  // 2. open it, add subplaces
  await page.click('.row-item.place');
  await page.click('#addBtn');
  await page.click('#addPlaceBtn');
  await page.fill('#nameInput', 'Luga daraz');
  await page.click('#form button[type=submit]');
  await page.waitForTimeout(300);
  console.log('CRUMBS:', (await text('#crumbs')).replace(/\n/g, ' '));

  // 3. add things in Luga daraz
  await page.click('.row-item.place');
  await page.click('#addBtn');
  await page.click('#addThingsBtn');
  await page.fill('#addText', '- AA battery double a - 4pcs new\n- AAA battery triple a\n\nRed plastic: Raincover rain boot\n  * Pen drive black 16 gb');
  console.log('ADD BTN:', await text('#addSubmit'));
  await page.click('#addSubmit');
  await page.waitForTimeout(400);
  console.log('LIST:', (await text('#list')).replace(/\n/g, ' | '));
  await shot('place');

  // 4. add a box inside it with things
  await page.click('#addBtn');
  await page.click('#addPlaceBtn');
  await page.fill('#nameInput', 'Rawcut box A');
  await page.click('#form button[type=submit]');
  await page.waitForTimeout(300);
  await page.click('.row-item.place');
  await page.click('#addBtn');
  await page.click('#addThingsBtn');
  await page.fill('#addText', 'Soldering rod wire - 2\nSoldering paste\nRelay dc inside cream box');
  await page.click('#addSubmit');
  await page.waitForTimeout(300);

  // 5. search from anywhere
  await page.fill('#search', 'solder');
  await page.waitForTimeout(200);
  console.log('SEARCH solder:', (await text('#list')).replace(/\n/g, ' | '), '| CRUMBS:', (await text('#crumbs')).replace(/\n/g, ' '));
  await shot('search');
  await page.fill('#search', 'pendrive');
  console.log('SEARCH pendrive:', (await text('#list')).replace(/\n/g, ' | '));
  await page.fill('#search', 'bedroom battery');
  console.log('SEARCH bedroom battery:', (await text('#list')).replace(/\n/g, ' | '));
  await page.fill('#search', 'zzz');
  console.log('SEARCH zzz:', (await text('#list')).replace(/\n/g, ' | '));
  await page.fill('#search', '');

  // 6. go home via crumbs, make a 2nd top-level place "Store room"
  await page.click('#crumbs button[data-go=""]');
  await page.click('#addBtn');
  await page.fill('#nameInput', 'Store room');
  await page.click('#form button[type=submit]');
  await page.waitForTimeout(300);
  console.log('ROOT:', (await text('#list')).replace(/\n/g, ' | '));

  // 7. move Rawcut box A (place) into Store room via select mode
  await page.click('#crumbs button[data-go=""]');
  await page.click('.row-item.place >> text=Bedroom');
  await page.click('.row-item.place >> text=Luga daraz');
  await page.click('#selectBtn');
  await page.click('.row-item.place >> text=Rawcut box A');
  console.log('SELBAR:', (await text('#selTools')).replace(/\n/g, ' '));
  await shot('select');
  await page.click('#selMove');
  await shot('picker');
  await page.fill('#pickSearch', 'store');
  await page.click('#pickList .row-item');
  await page.waitForTimeout(400);
  console.log('AFTER MOVE CRUMBS:', (await text('#crumbs')).replace(/\n/g, ' '), '| LIST:', (await text('#list')).replace(/\n/g, ' | '));
  await shot('moved');

  // 8. search shows the new path
  await page.fill('#search', 'soldering paste');
  console.log('SEARCH after move:', (await text('#list')).replace(/\n/g, ' | '));
  await page.fill('#search', '');

  // 9. edit a thing: tap, rename, move
  await page.click('#crumbs button[data-go=""]');
  await page.click('.row-item.place >> text=Bedroom');
  await page.click('.row-item.place >> text=Luga daraz');
  await page.click('.row-item.thing >> text=AAA battery');
  await page.fill('#nameInput', 'AAA battery (triple a) x6');
  await shot('editor');
  await page.click('#form button[type=submit]');
  await page.waitForTimeout(300);
  console.log('RENAMED:', (await text('#list')).replace(/\n/g, ' | '));

  // 10. turn a thing into a place
  await page.click('.row-item.thing >> text=Red plastic');
  await page.click('#toPlaceBtn');
  await page.waitForTimeout(300);
  console.log('AFTER TOPLACE:', (await text('#list')).replace(/\n/g, ' | '));

  // 11. photo upload on a thing
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  require('fs').writeFileSync('/tmp/opencode/pix.png', png);
  await page.click('.row-item.thing >> text=Pen drive');
  await page.setInputFiles('#uploadInput', '/tmp/opencode/pix.png');
  await page.waitForTimeout(500);
  await page.click('#form button[type=submit]');
  await page.waitForSelector('#editor:not([open])', { state: 'attached' });
  await page.waitForTimeout(300);
  console.log('PHOTO THUMB IMG COUNT:', await page.locator('.row-item .ico img').count());

  // 12. export
  await page.click('#menuBtn');
  console.log('STATS:', await text('#stats'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  await dl.saveAs('/tmp/opencode/things-backup.zip');
  await page.click('#closeMenu');

  // 13. wipe by deleting Bedroom, then import
  await page.click('#crumbs button[data-go=""]');
  await page.click('.row-item.place >> text=Bedroom');
  await page.click('#editPlaceBtn');
  await page.click('#deleteBtn');
  await page.waitForTimeout(400);
  await page.click('#crumbs button[data-go=""]');
  console.log('AFTER DELETE ROOT:', (await text('#list')).replace(/\n/g, ' | '));
  await page.click('#menuBtn');
  await page.setInputFiles('#importFile', '/tmp/opencode/things-backup.zip');
  await page.waitForTimeout(1500);
  console.log('AFTER IMPORT ROOT:', (await text('#list')).replace(/\n/g, ' | '));
  await page.fill('#search', 'pen drive');
  console.log('SEARCH pen drive:', (await text('#list')).replace(/\n/g, ' | '), '| imgs', await page.locator('.row-item .ico img').count());
  await shot('final');
  console.log('ERRORS:', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
