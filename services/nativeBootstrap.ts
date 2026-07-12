// On Android (Capacitor) there is no Electron preload, so window.kiosk doesn't exist.
// Install a shim built from nativeKiosk BEFORE React renders. The whole app already routes
// backend calls through `if (isElectron()) window.kiosk.X()` — isElectron() just checks that
// window.kiosk is defined — so populating it makes every existing code path work unchanged.
import { isNative, nativeKiosk } from './nativeKiosk';
import { initDb } from './nativeDb';
import { syncCustomers } from './nativeSync';

const APP_VERSION = '2.1.14';
// isNameBlocked() carries built-in substring patterns for the worst cases; the configurable
// list is synced from the server in Phase 2. Empty default is safe for v1.
const DEFAULT_BLOCKED_WORDS: string[] = [];

export function installNativeKioskShim(): void {
  if (!isNative()) return;
  if (typeof window === 'undefined' || (window as any).kiosk) return;

  const noop = async () => {};
  const base: any = {
    ...nativeKiosk,
    // --- config / feature flags (on-device defaults; admin/sync extends later) ---
    getKioskMode: async () => true,
    setKioskMode: async (v: boolean) => v,
    getShowHomeInfoPanel: async () => true,
    setShowHomeInfoPanel: async (v: boolean) => v,
    getIncogweedoEnabled: async () => false,
    setIncogweedoEnabled: async (v: boolean) => v,
    getOnlineOrderTill: async () => '5',
    getKioskActive: async () => true,
    setKioskActive: async (v: boolean) => ({ success: true, active: v }),
    getBlockedWords: async () => DEFAULT_BLOCKED_WORDS,
    setBlockedWords: noop,
    // --- telemetry / compliance stores (Phase 2 persists these in SQLite) ---
    logFailedScan: noop,
    getFailedScans: async () => [],
    saveLoyaltyConsent: noop,
    getLoyaltyConsents: async () => [],
    // --- updates (handled by the app store / MDM on Android, not electron-updater) ---
    checkForUpdates: async () => ({ updateAvailable: false }),
    installUpdate: noop,
    getAppVersion: async () => APP_VERSION,
    // --- event subscriptions the Electron preload exposes (on*) — no-op unsubscribers ---
    onKioskActiveChanged: () => () => {},
    onSyncProgress: () => () => {},
    onSyncComplete: () => () => {},
    onShowHomeInfoPanelChanged: () => () => {},
    onIncogweedoEnabledChanged: () => () => {},
    onUpdateAvailable: () => () => {},
    onUpdateProgress: () => () => {},
    onUpdateDownloaded: () => () => {},
  };
  // Safety net: any bridge method we didn't implement resolves gracefully instead of throwing
  // "not a function" and crashing the app. on* → no-op unsubscribe; anything else → async no-op.
  (window as any).kiosk = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return Reflect.get(target, prop);
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      if (prop.startsWith('on')) return () => () => {};
      return async () => undefined;
    },
  });
  console.log('[native] window.kiosk shim installed (Capacitor)');

  // Bring up the local SQLite cache and start a background sync (full the first time for a
  // venue, delta after). Fire-and-forget so the UI renders immediately.
  initDb()
    .then((ok) => {
      if (!ok) return;
      let venue: string | null = null;
      try { venue = localStorage.getItem('kiosk_selected_venue'); } catch { venue = null; }
      if (venue) syncCustomers(venue).catch((e) => console.error('[native] initial sync failed:', e));
    })
    .catch((e) => console.error('[native] DB init failed:', e));
}
