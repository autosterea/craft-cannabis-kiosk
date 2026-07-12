// Native (Capacitor / Android) backend — the equivalent of what Electron provides via
// window.kiosk. Talks to POSaBIT V3 directly using CapacitorHttp (a NATIVE HTTP request,
// so there is no browser CORS block and Basic-auth tokens are sent cleanly).
//
// Phase 1 (this file): functional ONLINE check-in — venue selection, customer lookups,
// create/update customer (with email + demographics, same payload the Electron service
// sends), queue add (with customer_id so the till links the account), incoming-order check.
// Phase 2 (next): SQLite offline cache + delta sync via @capacitor-community/sqlite, so
// lookups hit a local mirror first and a dropped connection still queues the customer.
//
// SECURITY NOTE: venue tokens are embedded in the app bundle here (same posture as the
// Electron kiosk, which ships them in its app files). For a controlled retail device this
// is acceptable for v1. Hardening path: route POSaBIT through a small backend proxy so the
// tokens live server-side. Tracked as a follow-up.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { INTEGRATOR_TOKEN, VENUE_TOKENS } from '../electron/config/tokens';
import type { KioskCustomer, QueueItem, Venue } from './kioskApi';
import { findByPhone, findByLicense, findByDobLastname, customerCount, getMeta } from './nativeDb';
import { syncCustomers, isSyncing } from './nativeSync';

const BASE_URL = 'https://app.posabit.com/api/v3';

export const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

const VENUE_NAMES: Record<string, string> = {
  tacoma: 'Craft Cannabis Tacoma',
  andresen: 'Craft Cannabis Andresen',
  millPlain: 'Craft Cannabis Mill Plain',
  southWenatchee: 'Craft Cannabis Wenatchee South',
  wenatchee: 'Craft Cannabis Wenatchee North',
};
const VENUE_KEY = 'kiosk_selected_venue';

function selectedVenueId(): string | null {
  try { return localStorage.getItem(VENUE_KEY); } catch { return null; }
}
function authHeader(venueId: string): string {
  const token = (VENUE_TOKENS as Record<string, string>)[venueId] || '';
  return 'Basic ' + btoa(`${INTEGRATOR_TOKEN}:${token}`);
}
function requireVenue(): string {
  const v = selectedVenueId();
  if (!v) throw new Error('No venue selected on this device');
  return v;
}
const unwrap = (c: any) => (c && c.customer ? c.customer : c);
const normPhone = (p: string) => String(p || '').replace(/\D/g, '').slice(-10);
const WIDE = 'start_date=2015-01-01&end_date=2035-01-01';

async function api(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  const venueId = requireVenue();
  const res = await CapacitorHttp.request({
    method,
    url: `${BASE_URL}${path}`,
    headers: { Authorization: authHeader(venueId), 'Content-Type': 'application/json' },
    ...(body ? { data: body } : {}),
  });
  return { status: res.status, data: res.data };
}

// Map a POSaBIT customer record to the app's KioskCustomer shape. POSaBIT returns the
// loyalty flag as `loyalty` (not `loyalty_member`) — normalize it so the UI reads it right.
function toKioskCustomer(raw: any): KioskCustomer {
  const c = unwrap(raw);
  return {
    id: c.id,
    first_name: c.first_name || '',
    last_name: c.last_name || '',
    telephone: c.telephone || undefined,
    email: c.email || undefined,
    loyalty_member: !!(c.loyalty ?? c.loyalty_member),
    birthday: c.birthday || undefined,
    drivers_license: c.drivers_license || undefined,
  };
}

async function searchOne(query: string): Promise<KioskCustomer | null> {
  const { status, data } = await api('GET', `/venue/customers?per_page=5&${WIDE}&${query}`);
  if (status < 200 || status >= 300) return null;
  const list = (data?.customers || []).map(unwrap);
  return list.length ? toKioskCustomer(list[0]) : null;
}

export const nativeKiosk = {
  // ---- venue / config ----
  getVenues: async (): Promise<Venue[]> =>
    Object.entries(VENUE_NAMES).map(([id, name]) => ({ id, name })),
  getCurrentVenue: async (): Promise<Venue | null> => {
    const id = selectedVenueId();
    return id ? { id, name: VENUE_NAMES[id] || id } : null;
  },
  setVenue: async (venueId: string): Promise<Venue> => {
    localStorage.setItem(VENUE_KEY, venueId);
    // Kick off the customer-cache sync for this venue in the background (fire-and-forget).
    syncCustomers(venueId).catch((e) => console.error('[native] sync failed:', e));
    return { id: venueId, name: VENUE_NAMES[venueId] || venueId };
  },

  // ---- lookups: local SQLite cache first (fast + offline), live POSaBIT as fallback ----
  lookupCustomer: async (phone: string): Promise<{ found: boolean; customer?: KioskCustomer }> => {
    const p = normPhone(phone);
    if (p.length !== 10) return { found: false };
    try { const local = await findByPhone(p); if (local) return { found: true, customer: local }; } catch { /* fall through to live */ }
    const c = await searchOne(`q[telephone_eq]=${encodeURIComponent(p)}`);
    return c ? { found: true, customer: c } : { found: false };
  },
  lookupCustomerByLicense: async (dl: string): Promise<{ found: boolean; customer?: KioskCustomer }> => {
    const v = (dl || '').trim().toUpperCase();
    if (!v) return { found: false };
    try { const local = await findByLicense(v); if (local) return { found: true, customer: local }; } catch { /* fall through to live */ }
    const c = await searchOne(`q[drivers_license_eq]=${encodeURIComponent(v)}`);
    return c ? { found: true, customer: c } : { found: false };
  },
  lookupCustomerByDobLastname: async (birthday: string, lastName: string): Promise<{ found: boolean; customer?: KioskCustomer }> => {
    if (!birthday || !lastName) return { found: false };
    try { const local = await findByDobLastname(birthday, lastName); if (local) return { found: true, customer: local }; } catch { /* fall through to live */ }
    const c = await searchOne(`q[birthday_eq]=${encodeURIComponent(birthday)}&q[last_name_i_cont]=${encodeURIComponent(lastName)}`);
    return c ? { found: true, customer: c } : { found: false };
  },
  lookupCustomerByName: async (firstName: string, lastName: string): Promise<{ found: boolean; customer?: KioskCustomer }> => {
    if (!firstName || !lastName) return { found: false };
    const c = await searchOne(`q[first_name_i_cont]=${encodeURIComponent(firstName)}&q[last_name_i_cont]=${encodeURIComponent(lastName)}`);
    return c ? { found: true, customer: c } : { found: false };
  },
  fetchCustomerById: async (customerId: number): Promise<{ found: boolean; customer?: KioskCustomer }> => {
    const { status, data } = await api('GET', `/venue/customers/${customerId}`);
    if (status < 200 || status >= 300 || !data) return { found: false };
    return { found: true, customer: toKioskCustomer(data) };
  },

  // ---- create / update (same payload shape as electron/services/posabit.ts) ----
  createCustomer: async (data: any): Promise<KioskCustomer> => {
    const customer: any = {
      first_name: data.firstName,
      last_name: data.lastName || '',
      telephone: data.telephone,
      loyalty_member: data.loyaltyOptIn,
      marketing_opt_in: data.loyaltyOptIn,
    };
    if (data.email) customer.email = data.email;
    if (data.termsAgreed) customer.terms_agreed = 1;
    if (data.address1) customer.address_1 = data.address1;
    if (data.city) customer.city = data.city;
    if (data.state) customer.state = data.state;
    if (data.zipCode) customer.zip_code = data.zipCode;
    if (data.dateOfBirth && data.dateOfBirth.length === 8) {
      const d = data.dateOfBirth;
      customer.date_of_birth = `${d.substring(4, 8)}-${d.substring(0, 2)}-${d.substring(2, 4)}`;
    }
    if (data.gender) customer.gender = data.gender === 'M' ? 'male' : data.gender === 'F' ? 'female' : 'other';
    if (data.driversLicense) customer.drivers_license = data.driversLicense.trim().toUpperCase();

    const { status, data: res } = await api('POST', '/venue/customers', { customer });
    if (status < 200 || status >= 300) {
      // Duplicate DL → fall back to the existing record, mirroring the Electron service.
      if (data.driversLicense) {
        const existing = await nativeKiosk.lookupCustomerByLicense(data.driversLicense);
        if (existing.found && existing.customer) return existing.customer;
      }
      throw new Error(`Failed to create customer: ${status}`);
    }
    return toKioskCustomer(res);
  },
  updateCustomer: async (customerId: number, data: any): Promise<KioskCustomer> => {
    const customer: any = {};
    if (data.loyaltyMember !== undefined) customer.loyalty_member = data.loyaltyMember;
    if (data.termsAgreed) customer.terms_agreed = 1;
    if (data.marketingOptIn !== undefined) customer.marketing_opt_in = data.marketingOptIn;
    if (data.email !== undefined) customer.email = data.email;
    if (data.telephone !== undefined) customer.telephone = data.telephone;
    if (data.address1) customer.address_1 = data.address1;
    if (data.city) customer.city = data.city;
    if (data.state) customer.state = data.state;
    if (data.zipCode) customer.zip_code = data.zipCode;
    if (data.gender) customer.gender = data.gender === 'M' ? 'male' : data.gender === 'F' ? 'female' : 'other';
    if (data.driversLicense) customer.drivers_license = data.driversLicense.trim().toUpperCase();

    const { status, data: res } = await api('PUT', `/venue/customers/${customerId}`, { customer });
    if (status < 200 || status >= 300) throw new Error(`Failed to update customer: ${status}`);
    return toKioskCustomer(res);
  },

  // ---- queue ----
  getQueue: async (): Promise<{ customer_queues: QueueItem[] }> => {
    const { status, data } = await api('GET', '/venue/customer_queues?per_page=100');
    if (status < 200 || status >= 300) return { customer_queues: [] };
    const items = (data?.customer_queues || []).map((q: any) => (q.customer_queue ? q.customer_queue : q));
    return { customer_queues: items };
  },
  addToQueue: async (data: {
    name: string; phone?: string; customerId?: number;
    source?: 'walk_in' | 'order_ahead'; pickup?: boolean; incomingOrderId?: number;
  }): Promise<any> => {
    const customer_queue: any = { source: data.source || 'walk_in', name: data.name };
    if (data.phone) customer_queue.telephone = data.phone;
    if (data.customerId) customer_queue.customer_id = data.customerId;
    if (data.pickup) customer_queue.pickup = true;
    if (data.incomingOrderId) customer_queue.incoming_order_id = data.incomingOrderId;
    try {
      const { status, data: res } = await api('POST', '/venue/customer_queues', { customer_queue });
      if (status < 200 || status >= 300) return { offline: true, error: `HTTP ${status}` };
      return unwrap(res);
    } catch (e: any) {
      // No network → signal offline so the UI shows "see a budtender" (v2.1.13 guard) rather than a fake success.
      return { offline: true, error: e?.message || 'network' };
    }
  },
  lookupIncomingOrder: async (customerId: number): Promise<any | null> => {
    try {
      const { status, data } = await api('GET', `/incoming_orders?q[customer_id_eq]=${customerId}&q[delivered_at_null]=1&per_page=5`);
      if (status < 200 || status >= 300) return null;
      const orders = (data?.incoming_orders || []).map((o: any) => (o.incoming_order ? o.incoming_order : o));
      return orders[0] || null;
    } catch { return null; }
  },

  // ---- sync status (real, backed by the local SQLite cache) ----
  getSyncStatus: async () => {
    let count = 0; let last: string | null = null;
    try { count = await customerCount(); last = await getMeta('lastSync'); } catch { /* db not ready */ }
    return { lastSync: last, isSyncing: isSyncing(), customerCount: count };
  },
  forceSync: async () => {
    const v = selectedVenueId();
    if (v) syncCustomers(v).catch((e) => console.error('[native] forceSync failed:', e));
    return { success: true };
  },
};
