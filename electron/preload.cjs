// Preload script - CommonJS format (required for Electron sandbox)
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('kiosk', {
  // Venue management
  getVenues: () => ipcRenderer.invoke('get-venues'),
  getCurrentVenue: () => ipcRenderer.invoke('get-current-venue'),
  setVenue: (venueId) => ipcRenderer.invoke('set-venue', venueId),

  // Customer operations
  lookupCustomer: (phone) => ipcRenderer.invoke('lookup-customer', phone),
  lookupCustomerByName: (firstName, lastName) => ipcRenderer.invoke('lookup-customer-by-name', firstName, lastName),
  createCustomer: (data) => ipcRenderer.invoke('create-customer', data),
  updateCustomer: (customerId, data) => ipcRenderer.invoke('update-customer', customerId, data),

  // Queue operations
  getQueue: () => ipcRenderer.invoke('get-queue'),
  addToQueue: (data) => ipcRenderer.invoke('add-to-queue', data),

  // Sync operations
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  forceSync: () => ipcRenderer.invoke('force-sync'),

  // Settings
  setKioskMode: (enabled) => ipcRenderer.invoke('set-kiosk-mode', enabled),
  getKioskMode: () => ipcRenderer.invoke('get-kiosk-mode'),

  // Blocked words
  getBlockedWords: () => ipcRenderer.invoke('get-blocked-words'),
  setBlockedWords: (words) => ipcRenderer.invoke('set-blocked-words', words),

  // Event listeners for sync progress
  onSyncProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('sync-progress', handler);
    return () => ipcRenderer.removeListener('sync-progress', handler);
  },

  onSyncComplete: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('sync-complete', handler);
    return () => ipcRenderer.removeListener('sync-complete', handler);
  },

  // Debug/Admin functions
  debugSearchGlobal: (phone) => ipcRenderer.invoke('debug-search-global', phone),
  debugDbInfo: () => ipcRenderer.invoke('debug-db-info'),

  // Auto-update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Update event listeners
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
});

console.log('Preload script loaded - window.kiosk API available');
