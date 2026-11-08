// v8: "How many" can be 0 (all used up). Row − and the editor − stop at 0.
const { chromium } = require('/home/bibek/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/brave-origin', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8933/');
  const save = async () => { await page.click('#form button[type=submit]'); await page.waitForTimeout(300); };
  const badge = () => page.locator('.row-item.thing:has-text("Tape") .qty').innerText();

  await page.click('#addBtn'); await page.fill('#nameInput', 'Drawer'); await save();
  await page.click('.row-item.place');
  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Tape\nGlue'); await page.click('#addSubmit'); await page.waitForTimeout(300);

  // editor: − from 1 goes to 0, and stops there
  await page.click('.row-item.thing >> text=Tape');
  await page.click('#qtyMinus'); await page.click('#qtyMinus');
  console.log('EDITOR after 2× − from 1 (want 0):', await page.inputValue('#qtyInput'));
  await save();
  console.log('ROW badge (want ×0):', await badge(), '| − dimmed:', await page.locator('.row-item.thing:has-text("Tape") .dec.off').count(),
    '| zero style:', await page.locator('.row-item.zero:has-text("Tape")').count());

  // row: + then − back to 0, − again stays at 0
  await page.click('.row-item.thing:has-text("Tape") .inc');
  await page.click('.row-item.thing:has-text("Tape") .dec');
  await page.click('.row-item.thing:has-text("Tape") .dec');
  await page.waitForTimeout(200);
  console.log('ROW after + − − (want ×0):', await badge());

  // survives a reload; editor shows 0
  await page.reload(); await page.waitForTimeout(300);
  await page.click('.row-item.place');
  console.log('AFTER RELOAD (want ×0):', await badge());
  await page.click('.row-item.thing >> text=Tape');
  console.log('EDITOR shows (want 0):', await page.inputValue('#qtyInput'));

  // empty box saves as 1
  await page.fill('#qtyInput', ''); await save();
  console.log('EMPTY saved as (want no badge):', await page.locator('.row-item.thing:has-text("Tape") .qty').count());

  // 0 with a minimum is low
  await page.click('.row-item.thing >> text=Glue');
  await page.click('#qtyMinus'); await page.click('#minPlus'); await save();
  console.log('GLUE low:', await page.locator('.row-item.thing.low:has-text("Glue") .qty').innerText(), '| ⚠ button:', await page.locator('#lowBtn').innerText());

  await page.click('#addBtn'); await page.click('#addThingsBtn');
  await page.fill('#addText', 'Scissors'); await page.click('#addSubmit'); await page.waitForTimeout(300);
  await page.click('.row-item.thing >> text=Tape');
  await page.click('#qtyMinus'); await save();
  await page.screenshot({ path: '/tmp/opencode/things-zero.png' });
  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
