import { contextBridge, ipcRenderer } from 'electron';

// Customer data type
export interface KioskCustomer {
  id: number;
  first_name: string;
  last_name: string;
  telephone?: string;
  email?: string;
  loyalty_member: boolean;
}

// Queue entry type
export interface QueueEntry {
  name: string;
  phone?: string;
  method: string;
  customerId?: number;
}

// Venue type
export interface KioskVenue {
  id: string;
  name: string;
}

// Sync status type
export interface SyncStatus {
  lastSync: string | null;
  isSyncing: boolean;
  customerCount: number;
}

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('kiosk', {
  // Venue management
  getVenues: (): Promise<KioskVenue[]> =>
    ipcRenderer.invoke('get-venues'),

  getCurrentVenue: (): Promise<KioskVenue | null> =>
    ipcRenderer.invoke('get-current-venue'),

  setVenue: (venueId: string): Promise<KioskVenue> =>
    ipcRenderer.invoke('set-venue', venueId),

  // Customer operations
  lookupCustomer: (phone: string): Promise<{ found: boolean; customer?: KioskCustomer }> =>
    ipcRenderer.invoke('lookup-customer', phone),

  createCustomer: (data: {
    firstName: string;
    lastName?: string;
    telephone: string;
    loyaltyOptIn: boolean;
  }): Promise<KioskCustomer> =>
    ipcRenderer.invoke('create-customer', data),

  // Queue operations
  getQueue: (): Promise<any> =>
    ipcRenderer.invoke('get-queue'),

  addToQueue: (data: QueueEntry): Promise<any> =>
    ipcRenderer.invoke('add-to-queue', data),

  // Sync operations
  getSyncStatus: (): Promise<SyncStatus> =>
    ipcRenderer.invoke('get-sync-status'),

  forceSync: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('force-sync'),

  // Settings
  setKioskMode: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-kiosk-mode', enabled),

  getKioskMode: (): Promise<boolean> =>
    ipcRenderer.invoke('get-kiosk-mode'),

  // Event listeners for sync progress
  onSyncProgress: (callback: (progress: { current: number; total: number }) => void) => {
    const handler = (_event: any, progress: { current: number; total: number }) => callback(progress);
    ipcRenderer.on('sync-progress', handler);
    return () => ipcRenderer.removeListener('sync-progress', handler);
  },

  onSyncComplete: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('sync-complete', handler);
    return () => ipcRenderer.removeListener('sync-complete', handler);
  },
});

// TypeScript declaration for window.kiosk
declare global {
  interface Window {
    kiosk: {
      getVenues: () => Promise<KioskVenue[]>;
      getCurrentVenue: () => Promise<KioskVenue | null>;
      setVenue: (venueId: string) => Promise<KioskVenue>;
      lookupCustomer: (phone: string) => Promise<{ found: boolean; customer?: KioskCustomer }>;
      createCustomer: (data: any) => Promise<KioskCustomer>;
      getQueue: () => Promise<any>;
      addToQueue: (data: QueueEntry) => Promise<any>;
      getSyncStatus: () => Promise<SyncStatus>;
      forceSync: () => Promise<{ success: boolean }>;
      setKioskMode: (enabled: boolean) => Promise<boolean>;
      getKioskMode: () => Promise<boolean>;
      getBlockedWords: () => Promise<string[]>;
      setBlockedWords: (words: string[]) => Promise<string[]>;
      onSyncProgress: (callback: (progress: { current: number; total: number }) => void) => () => void;
      onSyncComplete: (callback: () => void) => () => void;
      // Debug/Admin
      debugSearchGlobal: (phone: string) => Promise<any>;
      debugDbInfo: () => Promise<any>;
      // Auto-update
      lookupCustomerByName: (firstName: string, lastName: string) => Promise<{ found: boolean; customer?: KioskCustomer }>;
      updateCustomer: (customerId: number, data: any) => Promise<KioskCustomer>;
      checkForUpdates: () => Promise<any>;
      installUpdate: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      onUpdateAvailable: (callback: (info: any) => void) => () => void;
      onUpdateProgress: (callback: (progress: any) => void) => () => void;
      onUpdateDownloaded: (callback: (info: any) => void) => () => void;
    };
  }
}
