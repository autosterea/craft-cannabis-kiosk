// Kiosk API - Abstracts Electron IPC vs Web API calls
// Detects if running in Electron and uses appropriate method

// Check if running in Electron (with working kiosk API)
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && typeof window.kiosk !== 'undefined';
};

// Check if we're in Electron environment (even if preload failed)
export const isElectronEnvironment = (): boolean => {
  return typeof window !== 'undefined' &&
    (navigator.userAgent.includes('Electron') || typeof window.kiosk !== 'undefined');
};

// Customer type
export interface KioskCustomer {
  id: number;
  first_name: string;
  last_name: string;
  telephone?: string;
  email?: string;
  loyalty_member: boolean;
}

// Queue item type
export interface QueueItem {
  customer_queue_id: number;
  name: string;
  telephone?: string;
  source: 'walk_in' | 'order_ahead';
  aasm_state: 'open' | 'processing' | 'completed';
  created_at: string;
  customer_id?: number;
}

// Venue type
export interface Venue {
  id: string;
  name: string;
}

// Web API fallback (for development without Electron)
const WEB_API_BASE = '/api/posabit';
const INTEGRATOR_TOKEN = '2HaQ1k3XZoX_xswGQHG6hw';
const DEFAULT_VENUE_TOKEN = '5NJA0xyWr1RlPTVwi37xNg'; // Tacoma

function getWebAuthHeader(): string {
  return `Basic ${btoa(`${INTEGRATOR_TOKEN}:${DEFAULT_VENUE_TOKEN}`)}`;
}

// API Functions

export async function getVenues(): Promise<Venue[]> {
  if (isElectron()) {
    return window.kiosk.getVenues();
  }

  // Web fallback - return static list
  return [
    { id: 'tacoma', name: 'Craft Cannabis Tacoma' },
    { id: 'andresen', name: 'Craft Cannabis Andresen' },
    { id: 'leavenworth', name: 'Craft Cannabis Leavenworth' },
    { id: 'millPlain', name: 'Craft Cannabis Mill Plain' },
    { id: 'southWenatchee', name: 'Craft Cannabis South Wenatchee' },
    { id: 'wenatchee', name: 'Craft Cannabis Wenatchee' },
  ];
}

export async function getCurrentVenue(): Promise<Venue | null> {
  if (isElectron()) {
    return window.kiosk.getCurrentVenue();
  }
  // Web fallback - return default venue
  return { id: 'tacoma', name: 'Craft Cannabis Tacoma' };
}

export async function setVenue(venueId: string): Promise<Venue> {
  if (isElectron()) {
    return window.kiosk.setVenue(venueId);
  }
  // Web fallback
  return { id: venueId, name: `Craft Cannabis ${venueId}` };
}

export async function lookupCustomer(phone: string): Promise<{ found: boolean; customer?: KioskCustomer }> {
  if (isElectron()) {
    return window.kiosk.lookupCustomer(phone);
  }

  // Web fallback - use in-memory cache (from original posabit.ts)
  const { lookupCustomerByPhone } = await import('./posabit');
  return lookupCustomerByPhone(phone);
}

export async function lookupCustomerByName(firstName: string, lastName: string): Promise<{ found: boolean; customer?: KioskCustomer }> {
  if (isElectron()) {
    return window.kiosk.lookupCustomerByName(firstName, lastName);
  }

  // Web fallback - not supported, return not found
  return { found: false };
}

export async function createCustomer(data: {
  firstName: string;
  lastName?: string;
  telephone: string;
  email?: string;
  loyaltyOptIn: boolean;
  // Demographics
  address1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: string;
  gender?: 'M' | 'F' | 'X';
}): Promise<KioskCustomer> {
  if (isElectron()) {
    return window.kiosk.createCustomer(data);
  }

  // Web fallback
  const { createCustomer: webCreateCustomer } = await import('./posabit');
  return webCreateCustomer(data);
}

export async function updateCustomer(customerId: number, data: {
  loyaltyMember?: boolean;
  marketingOptIn?: boolean;
  email?: string;
  // Demographics
  address1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: string;
  gender?: 'M' | 'F' | 'X';
}): Promise<KioskCustomer> {
  if (isElectron()) {
    return window.kiosk.updateCustomer(customerId, data);
  }

  // Web fallback - not supported
  throw new Error('Update customer not supported in web mode');
}

export async function getQueue(): Promise<{ customer_queues: QueueItem[] }> {
  if (isElectron()) {
    return window.kiosk.getQueue();
  }

  // Web fallback
  const { getQueue: webGetQueue } = await import('./posabit');
  return webGetQueue();
}

export async function addToQueue(data: {
  name: string;
  phone?: string;
  method: string;
  customerId?: number;
}): Promise<any> {
  if (isElectron()) {
    return window.kiosk.addToQueue(data);
  }

  // Web fallback
  const { addToQueue: webAddToQueue } = await import('./posabit');
  return webAddToQueue(data.name, 'walk_in', data.phone);
}

export async function getSyncStatus(): Promise<{
  lastSync: string | null;
  isSyncing: boolean;
  customerCount: number;
}> {
  if (isElectron()) {
    return window.kiosk.getSyncStatus();
  }

  // Web fallback
  return {
    lastSync: new Date().toISOString(),
    isSyncing: false,
    customerCount: 0,
  };
}

export async function forceSync(): Promise<{ success: boolean }> {
  if (isElectron()) {
    return window.kiosk.forceSync();
  }

  // Web fallback - trigger cache refresh
  const { initializeCustomerCache } = await import('./posabit');
  await initializeCustomerCache();
  return { success: true };
}

export async function setKioskMode(enabled: boolean): Promise<boolean> {
  if (isElectron()) {
    return window.kiosk.setKioskMode(enabled);
  }
  // Web fallback - no-op
  return enabled;
}

export async function getKioskMode(): Promise<boolean> {
  if (isElectron()) {
    return window.kiosk.getKioskMode();
  }
  // Web fallback
  return false;
}

// Auto-update functions
export async function checkForUpdates(): Promise<{ updateAvailable: boolean; info?: any; error?: string }> {
  if (isElectron()) {
    return window.kiosk.checkForUpdates();
  }
  return { updateAvailable: false };
}

export async function installUpdate(): Promise<void> {
  if (isElectron()) {
    return window.kiosk.installUpdate();
  }
}

export async function getAppVersion(): Promise<string> {
  if (isElectron()) {
    return window.kiosk.getAppVersion();
  }
  return '1.0.0';
}
