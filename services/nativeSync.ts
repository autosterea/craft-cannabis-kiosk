// Customer sync for the Android kiosk. Full sync once (when the cache is empty), then
// delta sync (only customers changed since lastSync). Uses per_page=250 (POSaBIT honors
// it — ~60% fewer calls than 100) and throttles between pages to avoid burst rate limits.
//   Tacoma (54k) full sync ≈ 217 calls; delta ≈ 1-few calls. Tiny vs the ~300k/mo budget.
import { CapacitorHttp } from '@capacitor/core';
import { INTEGRATOR_TOKEN, VENUE_TOKENS } from '../electron/config/tokens';
import { upsertCustomers, customerCount, getMeta, setMeta } from './nativeDb';

const BASE = 'https://app.posabit.com/api/v3';
const PER_PAGE = 250;
const THROTTLE_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unwrap = (c: any) => (c && c.customer ? c.customer : c);

let syncing = false;
let progress = { current: 0, total: 0 };
export const isSyncing = () => syncing;
export const syncProgress = () => progress;

function auth(venueId: string): string {
  const token = (VENUE_TOKENS as Record<string, string>)[venueId] || '';
  return 'Basic ' + btoa(`${INTEGRATOR_TOKEN}:${token}`);
}

async function fetchPage(venueId: string, page: number, updatedSince?: string): Promise<any> {
  let url = `${BASE}/venue/customers?page=${page}&per_page=${PER_PAGE}&start_date=2015-01-01&end_date=2035-01-01`;
  if (updatedSince) url += `&q[updated_at_gt]=${encodeURIComponent(updatedSince)}`;
  const res = await CapacitorHttp.request({
    method: 'GET', url,
    headers: { Authorization: auth(venueId), 'Content-Type': 'application/json' },
  });
  if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status);
  return res.data;
}

// Full sync when the cache is empty; otherwise a delta since lastSync. Fire-and-forget safe
// (guards against concurrent runs). Returns the number of records upserted.
export async function syncCustomers(venueId: string, onProgress?: (cur: number, total: number) => void): Promise<number> {
  if (syncing || !venueId) return 0;
  syncing = true;
  progress = { current: 0, total: 0 };
  let upserted = 0;
  try {
    const have = await customerCount();
    const lastSync = await getMeta('lastSync');
    const lastVenue = await getMeta('venue');
    // Delta only if we already have a cache for THIS venue; otherwise full.
    const updatedSince = have > 0 && lastSync && lastVenue === venueId ? lastSync : undefined;
    const startedAt = new Date().toISOString();
    console.log(`[native] sync START venue=${venueId} mode=${updatedSince ? 'delta' : 'FULL'} (have ${have} cached)`);
    let page = 1, totalPages = 1;
    do {
      const data = await fetchPage(venueId, page, updatedSince);
      const list = (data.customers || []).map(unwrap);
      await upsertCustomers(list);
      upserted += list.length;
      totalPages = data.total_pages || 1;
      progress = { current: page, total: totalPages };
      onProgress?.(page, totalPages);
      if (page === 1 || page % 25 === 0 || page === totalPages) {
        console.log(`[native] sync page ${page}/${totalPages} (${upserted} records so far)`);
      }
      page++;
      if (page <= totalPages) await sleep(THROTTLE_MS);
    } while (page <= totalPages);
    await setMeta('lastSync', startedAt);
    await setMeta('venue', venueId);
    console.log(`[native] sync DONE: ${upserted} upserted, ${await customerCount()} total cached`);
  } finally {
    syncing = false;
  }
  return upserted;
}
