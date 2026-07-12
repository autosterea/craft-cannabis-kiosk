/* CHECK-IN GUARDS — the v2.1.13 fixes (phone carry-over + false-success guard).
 * Serves the built dist/, drives real Chrome with a mocked window.kiosk whose addToQueue
 * can be flipped offline/success per scenario. Asserts:
 *   A. offline queue add NEVER shows a "checked in" card (Guest path)
 *   B. phone entered on the Phone screen carries into the ID-scan new-customer step
 *   C. new-customer "Just Check In" offline → failure, not fake success
 *   D. direct ID scan starts with a BLANK phone (no stale bleed)
 *   E. abandoned scan does not bleed the previous customer's phone (PII guard)
 *   F. returning-customer auto-checkin offline → failure, not fake success
 *   G. returning-customer auto-checkin online → real success card (happy path)
 *
 * Run: npm run build && node tests/runtime/checkin-guards.test.cjs
 * Needs Chrome (CHROME_PATH env overrides the default install location).
 */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const DIST = path.resolve(__dirname, '..', '..', 'dist');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`FATAL: ${DIST}\\index.html missing — run "npm run build" first.`); process.exit(1); }
if (!fs.existsSync(CHROME)) { console.error(`FATAL: Chrome not found at ${CHROME} — set CHROME_PATH.`); process.exit(1); }
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (n, p, d) => { results.push({ n, p }); console.log(`  [${p?'PASS':'FAIL'}] ${n}${d?'  — '+d:''}`); };

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]); if (rel === '/' ) rel = '/index.html';
  const segs = rel.replace(/^\/+/, '').split('/').filter(s => s && s !== '..');
  let fp = path.join(DIST, ...segs);
  try { if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) fp = path.join(DIST, 'index.html'); } catch { fp = path.join(DIST, 'index.html'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  const s = fs.createReadStream(fp); s.on('error', () => res.end()); s.pipe(res);
});

const MOCK = () => {
  window.__MOCK = { offline: false, found: false, foundCustomer: { id:777, first_name:'Tester', last_name:'Scanner', loyalty_member:true, drivers_license:'T9998887', telephone:'5559990000' } };
  window.kiosk = new Proxy({}, { get(_t, prop) {
    const name = String(prop);
    return (...args) => {
      if (name.startsWith('on')) return () => {};
      if (name === 'addToQueue') return Promise.resolve(window.__MOCK.offline ? { offline: true, error: 'mock offline' } : { customer_queue_id: 4242 });
      if (name === 'lookupCustomerByLicense') return Promise.resolve(window.__MOCK.found ? { found:true, customer: window.__MOCK.foundCustomer } : { found:false });
      const canned = {
        getCurrentVenue: { id:'andresen', name:'Craft Cannabis Andresen' },
        getBlockedWords: [], getKioskActive: true, getSyncStatus: { lastSync:'x', isSyncing:false, customerCount:5000 },
        getShowHomeInfoPanel: true, getOnlineOrderTill: '5', getIncogweedoEnabled: false, getAppVersion: '0.0.0-test',
        getQueue: { customer_queues: [] }, lookupIncomingOrder: null,
        lookupCustomer: { found:false }, lookupCustomerByName: { found:false }, lookupCustomerByLicense: { found:false },
        lookupCustomerByDobLastname: { found:false }, fetchCustomerById: { found:false },
        createCustomer: { id: 999, first_name:'Tester', last_name:'Scanner', loyalty_member:false },
        getFailedScans: [], getLoyaltyConsents: [], checkForUpdates: { updateAvailable:false },
      };
      return Promise.resolve(name in canned ? canned[name] : undefined);
    };
  }});
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  await page.setCacheEnabled(false); await page.setViewport({ width: 1280, height: 1000 });
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  await page.evaluateOnNewDocument(MOCK);
  const body = () => page.evaluate(() => document.body.innerText || '');
  const has = async (s) => (await body()).toLowerCase().includes(s.toLowerCase());
  const waitText = async (s, t=8000) => { const t0=Date.now(); while (Date.now()-t0<t){ if(await has(s)) return true; await sleep(150);} return false; };
  const click = async (sub, exact=false) => page.evaluate((sub, exact) => {
    const want = sub.toLowerCase();
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const m = els.filter(e => { const t=(e.innerText||'').trim().toLowerCase(); return exact ? t===want : t.includes(want); });
    m.sort((a,b)=>a.innerText.trim().length-b.innerText.trim().length);
    if (m[0]) { m[0].click(); return true; } return false;
  }, sub, exact);
  const clickLetter = async () => page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(e=>/^[A-Za-z]$/.test((e.innerText||'').trim())); if(b){b.click();return true;} return false; });
  const setOffline = (v) => page.evaluate((v) => { window.__MOCK.offline = v; }, v);
  const reset = async () => { await page.goto(BASE+'/', { waitUntil:'networkidle2' }); await waitText('Select Check-In Method', 15000); };
  const injectBarcode = (code) => page.evaluate((code) => {
    const inp = [...document.querySelectorAll('input')].find(i => i.className.includes('opacity-0'));
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, code); inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, code);
  const BARCODE = 'ANSI 636000 DL DCSScanner\nDACTester\nDBB01151980\nDBC1\nDAQT9998887\nDAG123 MAIN ST\nDAIVANCOUVER\nDAJWA\nDAK98661\nDCAC\nDCBNONE\nDCDNONE\nDDEN\nDDFN\nDDGN\n';

  try {
    // ===== TEST A: false-success guard via Guest path =====
    console.log('\n== TEST A: false "checked in" guard (Guest path) ==');
    await reset(); await setOffline(true);
    await click('Guest Check-In', true); await waitText('Enter your first name', 4000);
    await clickLetter(); await click('Next'); await waitText('last initial', 3000);
    await clickLetter(); await click('Continue'); await waitText('Sign Me Up', 4000);
    await click('No Thanks', true);
    await sleep(1500);
    const a1card = await has("You're All Checked In") || await has('Checked In!');
    const a1err = await has('see a budtender');
    rec('OFFLINE add → NO false "checked in" card', !a1card, a1card?'showed success card!':'no success card');
    rec('OFFLINE add → shows "see a budtender"', a1err, a1err?'error shown':'no error message');

    await reset(); await setOffline(false);
    await click('Guest Check-In', true); await waitText('Enter your first name', 4000);
    await clickLetter(); await click('Next'); await waitText('last initial', 3000);
    await clickLetter(); await click('Continue'); await waitText('Sign Me Up', 4000);
    await click('No Thanks', true);
    const a2card = await waitText('Checked In', 5000);
    rec('SUCCESS add → shows the real success card', a2card, a2card?'card shown':'no card');

    // ===== TEST B: phone carried from Phone screen into ID-scan new-customer step =====
    console.log('\n== TEST B: phone carry-over (Phone → not found → Scan ID) ==');
    await reset(); await setOffline(false);
    await click('Loyalty Members', true);
    await waitText('Enter your phone number', 4000);
    const PHONE = '3605551234';
    for (const d of PHONE) await click(d, true);
    await click('Go', true);
    const onName = await waitText("didn't find your phone", 5000) || await has('Scan My ID Instead');
    rec('Phone not-found → recommends Scan ID', onName, onName?'on name/scan screen':'did not reach');
    await click('Scan My ID Instead');
    const onScan = await waitText('Scan Your ID', 5000);
    rec('Handoff lands on ID Scan screen', onScan, onScan?'on scan screen':'not on scan');
    await injectBarcode(BARCODE);
    await sleep(600);
    const reachedNewPhone = await waitText('phone number', 5000);
    const showsPrefill = (await has('555') && await has('1234')) || await has('(360)');
    rec('Scan (new customer) → reaches phone step', reachedNewPhone, reachedNewPhone?'on new-customer phone step':'not reached');
    rec('Phone is PRE-FILLED (not blank)', showsPrefill, showsPrefill?'shows the entered phone':'phone NOT carried over');

    // ===== TEST C: new-customer false-success guard (offline → CHECKIN_FAILED) =====
    console.log('\n== TEST C: new-customer "Just Check In" with offline queue ==');
    await setOffline(true);
    await click('Next') || await click('Continue') || await click('→');
    await sleep(400);
    await waitText('Sign', 4000);
    await click('Just Check In') || await click('No Thanks') || await click('Skip');
    await sleep(1500);
    const cFailed = await has("Couldn't Check You In") || await has('see a budtender');
    const cFakeCard = await has("You're All Checked In");
    rec('OFFLINE new-customer → shows failure, not success', cFailed && !cFakeCard, `failed=${cFailed} fakeCard=${cFakeCard}`);

    // ===== TEST D: direct ID scan (no prior phone) must start BLANK (no stale-phone bleed) =====
    console.log('\n== TEST D: direct scan → phone blank (no stale bleed) ==');
    await reset(); await setOffline(false);
    await click('Quick ID Scan', true); await waitText('Scan Your ID', 5000);
    await injectBarcode(BARCODE);
    await sleep(700);
    await waitText('phone number', 5000);
    const stale = await has('1234') || await has('(360)');
    rec('Direct scan → phone BLANK (no prior-customer bleed)', !stale, stale ? 'STALE phone leaked!' : 'blank/placeholder');

    // ===== TEST E: same-mount bleed — handoff phone must NOT survive an abandoned (INVALID) scan =====
    console.log('\n== TEST E: stale-phone bleed via abandoned scan (same IDScan mount) ==');
    await reset(); await setOffline(false);
    await click('Loyalty Members', true); await waitText('Enter your phone number', 4000);
    for (const d of '3605551234') await click(d, true);
    await click('Go', true); await waitText('Scan My ID Instead', 5000);
    await click('Scan My ID Instead'); await waitText('Scan Your ID', 5000);
    await injectBarcode('999888777666555444333222111000XYZQWQWQWQW'); await sleep(700);
    await waitText('Scan Your ID', 6000);
    await sleep(300);
    await injectBarcode(BARCODE); await sleep(700);
    await waitText('phone number', 5000);
    const bled = await has('1234') || await has('(360)');
    rec('Abandoned-scan handoff phone does NOT bleed to next scan', !bled, bled ? 'A phone LEAKED to B!' : 'B is blank ✓');

    // ===== TEST F: found-customer (autoCheckIn) with offline queue → CHECKIN_FAILED, not fake green =====
    console.log('\n== TEST F: returning-customer auto-checkin with offline queue ==');
    await reset();
    await page.evaluate(() => { window.__MOCK.found = true; window.__MOCK.offline = true; });
    await click('Quick ID Scan', true); await waitText('Scan Your ID', 5000);
    await injectBarcode(BARCODE);
    const fFailed = await waitText("Couldn't Check You In", 9000) || await has('see a budtender');
    const fFakeCard = await has("You're All Checked In");
    rec('Found-customer OFFLINE → failure shown, not fake success', fFailed && !fFakeCard, `failed=${fFailed} fakeCard=${fFakeCard}`);

    // ===== TEST G: returning-customer auto-checkin HAPPY path (online) → real success card =====
    console.log('\n== TEST G: returning-customer auto-checkin online → success (regression) ==');
    await reset();
    await page.evaluate(() => { window.__MOCK.found = true; window.__MOCK.offline = false; });
    await click('Quick ID Scan', true); await waitText('Scan Your ID', 5000);
    await injectBarcode(BARCODE);
    const gCard = await waitText('Checked In', 9000);
    rec('Found-customer ONLINE → success card shows (happy path intact)', gCard, gCard ? 'card shown' : 'NO card — REGRESSION');
  } catch (e) {
    rec('harness exception', false, e.message);
  }
  console.log('\npageErrors:', pageErrors.length ? JSON.stringify(pageErrors) : 'NONE');
  const passed = results.filter(r => r.p).length;
  console.log(`\n==== checkin-guards: ${passed}/${results.length} passed; pageErrors=${pageErrors.length} ====`);
  await browser.close(); server.close();
  process.exit(passed === results.length && pageErrors.length === 0 ? 0 : 1);
})();
