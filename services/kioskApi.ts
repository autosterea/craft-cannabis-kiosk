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
// Tokens loaded from .env.local (gitignored) via Vite env vars
const WEB_API_BASE = '/api/posabit';
const INTEGRATOR_TOKEN = import.meta.env.VITE_POSABIT_INTEGRATOR_TOKEN || '';
const DEFAULT_VENUE_TOKEN = import.meta.env.VITE_POSABIT_VENUE_TOKEN || '';

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

// Check if a customer has a pending online order in the queue
export async function checkForOnlineOrder(customerName: string, customerId?: number): Promise<QueueItem | null> {
  try {
    const response = await getQueue();
    if (!response?.customer_queues) return null;

    // Only check open/processing order_ahead entries
    const onlineOrders = response.customer_queues.filter(
      q => q.source === 'order_ahead' && (q.aasm_state === 'open' || q.aasm_state === 'processing')
    );

    // Match by customer_id first (most reliable)
    if (customerId) {
      const match = onlineOrders.find(q => q.customer_id === customerId);
      if (match) return match;
    }

    // Fallback: match by name (case-insensitive)
    const normalizedName = customerName.trim().toUpperCase();
    const nameMatch = onlineOrders.find(q => {
      const queueName = q.name.trim().toUpperCase();
      return queueName === normalizedName || queueName.startsWith(normalizedName + ' ');
    });

    return nameMatch || null;
  } catch (err) {
    console.error('Failed to check for online orders:', err);
    return null;
  }
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

// Blocked words
export async function getBlockedWords(): Promise<string[]> {
  if (isElectron()) {
    return window.kiosk.getBlockedWords();
  }
  return [];
}

export async function setBlockedWords(words: string[]): Promise<void> {
  if (isElectron()) {
    await window.kiosk.setBlockedWords(words);
  }
}

// Validation helper — checks whole words + substring matching for key patterns
export function isNameBlocked(name: string, blockedWords: string[]): boolean {
  // Strip everything except letters and spaces, then normalize
  const cleaned = name.replace(/[^a-zA-Z\s]/g, '').toLowerCase().trim();
  if (!cleaned) return false;

  const nameParts = cleaned.split(/\s+/);
  const nameJoined = nameParts.join(''); // "your mom" → "yourmom"
  const nameFull = cleaned; // keeps spaces for multi-word phrase check

  // Also decode common leet-speak substitutions
  const leetDecoded = cleaned
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/@/g, 'a')
    .replace(/\$/g, 's');
  const leetParts = leetDecoded.split(/\s+/);

  // Words that should substring-match (block "magatt", "magatard", etc.)
  const substringPatterns = [
    'maga', 'fuck', 'fuk', 'fck', 'nigg', 'fagg', 'retard',
    'libtard', 'shoot', 'bomb',
  ];

  for (const word of blockedWords) {
    const w = word.toLowerCase();

    // Exact whole-word match
    if (nameParts.includes(w) || leetParts.includes(w)) return true;

    // Multi-word joined match ("deez nuts" → check "deeznuts", "yourmom", etc.)
    if (w.length > 3 && nameJoined.includes(w)) return true;
  }

  // Substring pattern matching (catches variations like "magatt", "fuckyou", etc.)
  for (const pattern of substringPatterns) {
    if (nameFull.includes(pattern) || leetDecoded.includes(pattern)) return true;
  }

  // Check full joined string for multi-word blocked phrases
  const multiWordBlocked = ['deeznuts', 'yourmom', 'urmom', 'bigdick', 'sugarbaby'];
  if (multiWordBlocked.some(phrase => nameJoined.includes(phrase))) return true;

  return false;
}
