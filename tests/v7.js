// v7: row − / +, undo delete, tappable path, search only here, picker "New place",
// discard check, turn-into-place warning, backup reminder, import check, save errors.
const { chromium } = require('/home/bibek/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/brave-origin', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  // Answers: prompt -> next name in promptAnswers; confirm -> nextConfirm (default yes).
  const promptAnswers = [];
  let nextConfirm = true;
  page.on('dialog', d => {
    dialogs.push(`${d.type()}: ${d.message().replace(/\n/g, ' ')}`);
    if (d.type() === 'prompt') d.accept(promptAnswers.shift() ?? '');
    else if (d.type() === 'confirm') { d[nextConfirm ? 'accept' : 'dismiss'](); nextConfirm = true; }
    else d.accept();
  });
  await page.goto('http://127.0.0.1:8933/');
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('things'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await page.evaluate(() => localStorage.removeItem('things-lastExport'));
  await page.reload();
  const list = async () => (await page.locator('#list').innerText()).replace(/\n/g, ' | ');
  const save = async () => { await page.click('#form button[type=submit]'); await page.waitForTimeout(300); };
  const shot = n => page.screenshot({ path: `/tmp/opencode/things-v7-${n}.png` });

  console.log('SELECT LABEL:', await page.locator('#selectBtn').innerText());
  console.log('MENU DOT (no data):', await page.locator('#menuBtn.due').count());

  // Setup: Kitchen › Cupboard with things
  await page.click('#addBtn'); await page.fill('#nameInput', 'Kitchen'); await save();
  console.log('MENU DOT (data, never backed up):', await page.locator('#menuBtn.due').count());
  await page.click('.row-item.place');
  await page.click('#addBtn'); await page.click('#addPlaceBtn'); await page.fill('#nameInput', 'Cupboard'); await save();
  await page.click('.row-item.place');
  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Caustic soda\nTape\nBulb');
  await page.click('#addSubmit'); await page.waitForTimeout(300);

  // 1. row − / +
  await page.click('.row-item.thing >> text=Tape');
  await page.click('#qtyPlus'); await page.click('#qtyPlus'); await save();
  console.log('ROWS:', await list());
  console.log('STEPPERS:', await page.locator('.step').count(), '(only Tape)');
  await page.click('.row-item.thing:has-text("Tape") .inc');
  await page.click('.row-item.thing:has-text("Tape") .inc');
  await page.click('.row-item.thing:has-text("Tape") .dec');
  await page.waitForTimeout(200);
  console.log('EDITOR OPEN after taps (want false):', await page.locator('#editor[open]').count() > 0);
  await page.reload(); await page.waitForTimeout(300);
  await page.click('.row-item.place'); await page.click('.row-item.place');
  console.log('TAPE after reload (want ×4):', await page.locator('.row-item.thing:has-text("Tape") .qty').innerText());
  await shot('stepper');

  // 7. discard check
  await page.click('.row-item.thing >> text=Bulb');
  await page.click('#cancelBtn');
  console.log('UNCHANGED CANCEL closes, no popup:', await page.locator('#editor[open]').count() === 0, dialogs.length === 0);
  await page.click('.row-item.thing >> text=Bulb');
  await page.fill('#nameInput', 'Bulb LED');
  nextConfirm = false;
  await page.click('#cancelBtn');
  console.log('DIRTY CANCEL, said no -> still open:', await page.locator('#editor[open]').count() === 1, '|', dialogs.at(-1));
  await page.click('#cancelBtn');
  console.log('DIRTY CANCEL, said yes -> closed:', await page.locator('#editor[open]').count() === 0);
  console.log('NAME not saved:', await list());

  // 8. turn into place warns about the count
  await page.click('.row-item.thing >> text=Tape');
  nextConfirm = false;
  await page.click('#toPlaceBtn');
  console.log('TOPLACE warning:', dialogs.at(-1), '| still open:', await page.locator('#editor[open]').count() === 1);
  await page.click('#cancelBtn');

  // 12 + 5. search only here, tap path to open place
  await page.click('#crumbs button[data-go=""]');
  await page.click('#addBtn'); await page.fill('#nameInput', 'Garage'); await save();
  await page.click('.row-item.place >> text=Garage');
  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Tape measure'); await page.click('#addSubmit'); await page.waitForTimeout(300);
  await page.fill('#search', 'tape');
  console.log('SEARCH everywhere:', await list());
  await page.click('.scope');
  console.log('SEARCH only here:', await list());
  await page.click('.scope');
  await page.click('.row-item.thing:has-text("Tape") >> nth=0 >> .where');
  await page.waitForTimeout(300);
  console.log('AFTER TAP PATH crumbs:', (await page.locator('#crumbs').innerText()).replace(/\n/g, ' '),
    '| flashed:', await page.locator('.row-item.flash').innerText().catch(() => 'none'));

  // 6. picker: new place, then move there
  await page.click('#selectBtn');
  await page.click('.row-item.thing >> text=Bulb');
  await page.click('#selMove');
  promptAnswers.push('Top shelf');
  await page.click('#pickList .new-place');
  await page.waitForTimeout(400);
  console.log('AFTER NEW PLACE IN PICKER:', (await page.locator('#crumbs').innerText()).replace(/\n/g, ' '), '||', await list());
  await shot('picker-new');

  // 4. delete with undo
  await page.click('#crumbs button[data-go=""]');
  const before = dialogs.length;
  await page.click('.row-item.place >> text=Kitchen');
  await page.click('#editPlaceBtn');
  await page.click('#deleteBtn');
  await page.waitForTimeout(400);
  console.log('DELETE popups (want 0):', dialogs.length - before, '| toast:', await page.locator('#toastText').innerText());
  console.log('AFTER DELETE:', (await page.locator('#crumbs').innerText()).replace(/\n/g, ' '), '||', await list());
  await shot('undo');
  await page.click('#toastBtn');
  await page.waitForTimeout(400);
  console.log('AFTER UNDO:', await list());
  await page.fill('#search', 'top shelf bulb');
  console.log('NESTED BACK:', await list());
  await page.fill('#search', '');

  // 3. backup reminder
  await page.click('#menuBtn');
  console.log('BACKUP INFO before:', await page.locator('#backupInfo').innerText());
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  await dl.saveAs('/tmp/opencode/v7.zip');
  console.log('BACKUP INFO after:', await page.locator('#backupInfo').innerText(), '| dot:', await page.locator('#menuBtn.due').count());

  // 11. importing a file that is not a Things backup
  require('fs').writeFileSync('/tmp/opencode/notzip.zip', 'hello');
  await page.setInputFiles('#importFile', '/tmp/opencode/notzip.zip');
  await page.waitForTimeout(400);
  console.log('BAD FILE:', dialogs.at(-1));
  await page.click('#menuBtn').catch(() => {});
  const zip = await page.evaluate(async () => {
    const z = await Zip.create([{ name: 'data.json', data: new Blob(['[{"id":"x","category":"Shirt"}]']) }]);
    return Array.from(new Uint8Array(await z.arrayBuffer()));
  });
  require('fs').writeFileSync('/tmp/opencode/clothes.zip', Buffer.from(zip));
  await page.setInputFiles('#importFile', '/tmp/opencode/clothes.zip');
  await page.waitForTimeout(400);
  console.log('OTHER APP BACKUP:', dialogs.at(-1));

  // 2. a failed save shows a message
  await page.evaluate(() => { DB.save = () => Promise.reject(new Error('QuotaExceededError')); });
  await page.click('#menu #closeMenu').catch(() => {});
  await page.click('.row-item.place >> text=Garage');
  await page.click('.row-item.thing >> text=Tape measure');
  await page.fill('#nameInput', 'Tape measure 5m');
  await save();
  console.log('SAVE FAIL:', dialogs.at(-1));

  // photo thumb shows right after save
  await page.reload(); await page.waitForTimeout(300);
  require('fs').writeFileSync('/tmp/opencode/pix.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  await page.click('.row-item.place >> text=Garage');
  await page.click('.row-item.thing >> text=Tape measure');
  await page.setInputFiles('#uploadInput', '/tmp/opencode/pix.png');
  await page.waitForSelector('#photoStrip img');
  await page.click('#form button[type=submit]');
  await page.waitForSelector('#editor:not([open])', { state: 'attached' });
  await page.waitForTimeout(300);
  console.log('PHOTO THUMB right after save:', await page.locator('.row-item .ico img').count());

  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
