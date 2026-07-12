/* SCAN-SAFETY GATE — guards against the v2.1.14 wrong-account regression (2026-07-11 incident).
 *
 * THE RULE THIS ENFORCES: no always-on scanner input may auto-act on short numeric input.
 * v2.1.14 let the HOME screen treat any 4-12 digit number as a POSaBIT customer id and
 * silently check that customer in — stray digits (a phone number typed at the wrong moment,
 * a partial scan) checked in the WRONG person at Tacoma. Customer-id / loyalty-QR check-in
 * is only allowed on the dedicated opt-in QR Code Entry screen.
 *
 * Serves the built dist/, drives real Chrome with a mocked window.kiosk that records
 * addToQueue + fetchCustomerById calls, and asserts:
 *   1. numeric scan on HOME is ignored (no lookup, no queue add, stays on Home)
 *   2. QR Code Entry screen: numeric scan → linked check-in (opt-in path works)
 *   3. QR Code Entry not-found → "see a budtender", never a fake success
 *   4. DL barcode via Quick ID Scan → DL flow (regression)
 *   5. DL barcode on HOME → auto-routes to DL flow (regression)
 *   6. numeric on the ID Scan screen → "Wrong Barcode", no lookup, no check-in
 *   7. non-numeric garbage on HOME is ignored
 *
 * Run: npm run build && node tests/runtime/scan-safety.test.cjs
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
  let rel = decodeURIComponent(req.url.split('?')[0]); if (rel === '/') rel = '/index.html';
  const segs = rel.replace(/^\/+/, '').split('/').filter(s => s && s !== '..');
  let fp = path.join(DIST, ...segs);
  try { if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) fp = path.join(DIST, 'index.html'); } catch { fp = path.join(DIST, 'index.html'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  const s = fs.createReadStream(fp); s.on('error', () => res.end()); s.pipe(res);
});

const MOCK = () => {
  window.__CALLS = { addToQueue: [], fetchById: [] };
  window.__MOCK = { offline: false, found: true, dlFound: false };
  window.kiosk = new Proxy({}, { get(_t, prop) {
    const name = String(prop);
    return (...args) => {
      if (name.startsWith('on')) return () => {};
      if (name === 'addToQueue') { window.__CALLS.addToQueue.push(args[0]); return Promise.resolve(window.__MOCK.offline ? { offline:true } : { customer_queue_id: 4242 }); }
      if (name === 'fetchCustomerById') { const id = args[0]; window.__CALLS.fetchById.push(id); return Promise.resolve(window.__MOCK.found ? { found:true, customer:{ id, first_name:'Tester', last_name:'Scanner', loyalty_member:true } } : { found:false }); }
      if (name === 'lookupCustomerByLicense') return Promise.resolve(window.__MOCK.dlFound ? { found:true, customer:{ id:555, first_name:'DL', last_name:'Person', loyalty_member:true, drivers_license:'T9998887' } } : { found:false });
      const canned = {
        getCurrentVenue:{ id:'andresen', name:'Craft Cannabis Andresen' }, getBlockedWords:[], getKioskActive:true,
        getSyncStatus:{ lastSync:'x', isSyncing:false, customerCount:5000 }, getShowHomeInfoPanel:true, getOnlineOrderTill:'5',
        getIncogweedoEnabled:false, getAppVersion:'0.0.0-test', getQueue:{ customer_queues:[] }, lookupIncomingOrder:null,
        lookupCustomer:{ found:false }, lookupCustomerByName:{ found:false }, lookupCustomerByDobLastname:{ found:false },
        createCustomer:{ id:999, first_name:'Tester', last_name:'Scanner', loyalty_member:false },
        getFailedScans:[], getLoyaltyConsents:[], checkForUpdates:{ updateAvailable:false }, logFailedScan:undefined,
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
  const inject = (code) => page.evaluate((code) => {
    const inp = [...document.querySelectorAll('input')].find(i => i.className.includes('opacity-0'));
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, code); inp.dispatchEvent(new Event('input', { bubbles: true })); return true;
  }, code);
  const calls = () => page.evaluate(() => window.__CALLS);
  const clearCalls = () => page.evaluate(() => { window.__CALLS = { addToQueue: [], fetchById: [] }; });
  const setMock = (m) => page.evaluate((m) => { Object.assign(window.__MOCK, m); }, m);
  const waitCall = async (t=7000) => { const t0=Date.now(); while(Date.now()-t0<t){ const c=await calls(); if(c.addToQueue.length) return c; await sleep(150);} return await calls(); };
  const reset = async () => { await page.goto(BASE+'/', { waitUntil:'networkidle2' }); await waitText('Select Check-In Method', 15000); await clearCalls(); };

  const DOPE = '1234567'; // synthetic id — the mock echoes whatever id is looked up
  const BARCODE = 'ANSI 636000 DL DCSScanner\nDACTester\nDBB01151980\nDBC1\nDAQT9998887\nDAG123 MAIN ST\nDAIVANCOUVER\nDAJWA\nDAK98661\nDCAC\nDCBNONE\nDCDNONE\nDDEN\nDDFN\nDDGN\n';

  try {
    // ===== TEST 1: THE GUARD — numeric scan on HOME must be IGNORED (v2.1.14 regression) =====
    console.log('\n== TEST 1: Home numeric scan is IGNORED (wrong-account guard) ==');
    await reset(); await setMock({ found:true, offline:false });
    await inject(DOPE);
    await sleep(3000);
    const c1 = await calls();
    const stillHome1 = await has('Select Check-In Method');
    rec('Home numeric scan → NO fetchCustomerById', c1.fetchById.length === 0, 'fetchById=' + JSON.stringify(c1.fetchById));
    rec('Home numeric scan → NO check-in (addToQueue never fired)', c1.addToQueue.length === 0, 'addToQueue calls=' + c1.addToQueue.length);
    rec('Home numeric scan → stays on home screen', stillHome1, stillHome1?'still home':'LEFT HOME');

    // ===== TEST 2: QR Code Entry screen scan works (the only allowed customer-id path) =====
    console.log('\n== TEST 2: QR Code Entry screen scan → check in ==');
    await reset(); await setMock({ found:true, offline:false });
    await click('QR Code Entry', true); await waitText('Scan QR Code', 5000);
    await inject(DOPE);
    const c2 = await waitCall(6000);
    const confirmed2 = await has('Welcome') || await waitText('Checked In', 3000) || await has('browse');
    rec('QR screen scan → checked in (addToQueue fired)', c2.addToQueue.length === 1, 'calls=' + c2.addToQueue.length);
    rec('QR screen scan → queue linked to scanned id', String(c2.addToQueue[0]?.customerId) === DOPE, 'customerId=' + c2.addToQueue[0]?.customerId);
    rec('QR screen shows a success confirmation', confirmed2, confirmed2?'confirmation shown':'no confirmation');

    // ===== TEST 3: QR screen, NO matching account → NO fake check-in =====
    console.log('\n== TEST 3: QR screen, account not found → no check-in ==');
    await reset(); await setMock({ found:false, offline:false });
    await click('QR Code Entry', true); await waitText('Scan QR Code', 5000);
    await inject(DOPE);
    // NOT_FOUND card auto-resets to READY after 4s — catch the message while it's up.
    const budtender3 = await waitText("couldn't find that account", 3500) || await has('see a budtender');
    await sleep(1500);
    const c3 = await calls();
    const noFake3 = c3.addToQueue.length === 0;
    rec('QR not-found → does NOT check in', noFake3, 'addToQueue calls=' + c3.addToQueue.length);
    rec('QR not-found → shows a not-found/budtender message', budtender3, budtender3?'message shown':'no message');

    // ===== TEST 4: REGRESSION — a real DL barcode still goes through the DL flow =====
    console.log('\n== TEST 4: DL barcode still works (regression) ==');
    await reset(); await setMock({ found:true, dlFound:false, offline:false });
    await click('Quick ID Scan', true); await waitText('Scan Your ID', 5000);
    await inject(BARCODE);
    const reached4 = await waitText('phone number', 6000);
    const c4 = await calls();
    rec('DL barcode → routed to DL flow (new-customer phone step), NOT id lookup', reached4 && c4.fetchById.length === 0, `phoneStep=${reached4} fetchById=${c4.fetchById.length}`);

    // ===== TEST 5: REGRESSION — long DL barcode scanned on HOME still routes to ID Scan =====
    console.log('\n== TEST 5: DL barcode on HOME still auto-routes ==');
    await reset(); await setMock({ found:true, dlFound:false, offline:false });
    await inject(BARCODE);
    const reached5 = await waitText('phone number', 8000);
    rec('Home DL barcode → auto-routed into DL flow', reached5, reached5?'reached phone step':'did not route');

    // ===== TEST 6: numeric scan on the ID SCAN screen → Wrong Barcode, no lookup, no check-in =====
    console.log('\n== TEST 6: numeric on ID Scan screen → rejected ==');
    await reset(); await setMock({ found:true, offline:false });
    await click('Quick ID Scan', true); await waitText('Scan Your ID', 5000);
    await inject(DOPE);
    const wrong6 = await waitText('Wrong Barcode', 5000);
    const c6 = await calls();
    rec('ID Scan numeric → "Wrong Barcode", NO fetchCustomerById, NO check-in', wrong6 && c6.fetchById.length === 0 && c6.addToQueue.length === 0, `wrongBarcode=${wrong6} fetchById=${c6.fetchById.length} queue=${c6.addToQueue.length}`);

    // ===== TEST 7: non-numeric garbage on home is ignored =====
    console.log('\n== TEST 7: non-numeric garbage on home is ignored ==');
    await reset(); await setMock({ found:true, offline:false });
    await inject('ABZ12QX');
    await sleep(600);
    const stillHome7 = await has('Select Check-In Method');
    const c7 = await calls();
    rec('Garbage scan → stays on home, no check-in', stillHome7 && c7.addToQueue.length === 0, `home=${stillHome7} calls=${c7.addToQueue.length}`);
  } catch (e) {
    rec('harness exception', false, e.message + '\n' + (e.stack||''));
  }
  console.log('\npageErrors:', pageErrors.length ? JSON.stringify(pageErrors) : 'NONE');
  const passed = results.filter(r => r.p).length;
  console.log(`\n==== scan-safety: ${passed}/${results.length} passed; pageErrors=${pageErrors.length} ====`);
  await browser.close(); server.close();
  process.exit(passed === results.length && pageErrors.length === 0 ? 0 : 1);
})();
