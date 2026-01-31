import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { getVenueList, getVenueById, INTEGRATOR_TOKEN, Venue } from './config/venues.js';
import { initDatabase, getCustomerByPhone, getCustomerByName, upsertCustomers, addOfflineQueueEntry, getUnsyncedEntries, markEntrySynced, getTotalCustomerCount, searchCustomerByPhoneGlobal, getVenueIdsInDb, getSampleCustomers, getCustomersWithPhoneCount } from './services/database.js';
import { SyncService } from './services/sync.js';
import { PosabitService } from './services/posabit.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store schema type
interface StoreSchema {
  selectedVenue: string | null;
  lastSyncTime: string | null;
  kioskMode: boolean;
}

// Persistent settings store
const store = new Store<StoreSchema>({
  defaults: {
    selectedVenue: null,
    lastSyncTime: null,
    kioskMode: false
  }
});

let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;
let posabitService: PosabitService | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Auto-updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', () => {
  console.log('App is up to date');
});

autoUpdater.on('download-progress', (progress) => {
  console.log(`Download progress: ${progress.percent.toFixed(1)}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', progress);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
  // Show notification and install on next restart
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: `Version ${info.version} has been downloaded and will be installed when you restart the app.`,
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (error) => {
  console.error('Auto-updater error:', error);
});

function createWindow() {
  const kioskMode = store.get('kioskMode') as boolean;

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: kioskMode,
    frame: !kioskMode,
    kiosk: kioskMode,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize services when venue is selected
function initializeServices(venueId: string) {
  const venue = getVenueById(venueId);
  if (!venue) {
    console.error('Invalid venue:', venueId);
    return;
  }

  posabitService = new PosabitService(INTEGRATOR_TOKEN, venue.token);
  syncService = new SyncService(posabitService, store, venueId);

  // Start background sync
  syncService.startBackgroundSync();
}

// IPC Handlers
function setupIpcHandlers() {
  // Venue management
  ipcMain.handle('get-venues', () => getVenueList());

  ipcMain.handle('get-current-venue', () => {
    const venueId = store.get('selectedVenue') as string | null;
    return venueId ? getVenueById(venueId) : null;
  });

  ipcMain.handle('set-venue', async (_event, venueId: string) => {
    const venue = getVenueById(venueId);
    if (!venue) throw new Error('Invalid venue');

    store.set('selectedVenue', venueId);
    initializeServices(venueId);

    return venue;
  });

  // Customer lookup by phone (from local SQLite)
  ipcMain.handle('lookup-customer', async (_event, phone: string) => {
    const venueId = store.get('selectedVenue') as string;
    console.log('Looking up customer:', phone, 'in venue:', venueId);

    if (!venueId) {
      console.log('No venue selected for lookup');
      return { found: false };
    }

    const customer = getCustomerByPhone(phone, venueId);
    console.log('Lookup result:', customer ? `Found: ${customer.first_name} ${customer.last_name}` : 'Not found');

    return customer ? { found: true, customer } : { found: false };
  });

  // Customer lookup by name (from local SQLite) - for ID scan
  ipcMain.handle('lookup-customer-by-name', async (_event, firstName: string, lastName: string) => {
    const venueId = store.get('selectedVenue') as string;
    console.log('Looking up customer by name:', firstName, lastName, 'in venue:', venueId);

    if (!venueId) {
      console.log('No venue selected for lookup');
      return { found: false };
    }

    const customer = getCustomerByName(firstName, lastName, venueId);
    console.log('Name lookup result:', customer ? `Found: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})` : 'Not found');

    return customer ? { found: true, customer } : { found: false };
  });

  // Create customer in POSaBIT
  ipcMain.handle('create-customer', async (_event, data: any) => {
    if (!posabitService) throw new Error('No venue selected');
    return posabitService.createCustomer(data);
  });

  // Update customer in POSaBIT (e.g., to enable loyalty)
  ipcMain.handle('update-customer', async (_event, customerId: number, data: any) => {
    if (!posabitService) throw new Error('No venue selected');
    const venueId = store.get('selectedVenue') as string;

    console.log('Updating customer:', customerId, 'data:', data);

    // Update in POSaBIT
    const updatedCustomer = await posabitService.updateCustomer(customerId, data);

    // Also update local database
    upsertCustomers([updatedCustomer], venueId);
    console.log('Local database updated for customer:', customerId);

    return updatedCustomer;
  });

  // Queue operations
  ipcMain.handle('get-queue', async () => {
    if (!posabitService) throw new Error('No venue selected');
    return posabitService.getQueue();
  });

  ipcMain.handle('add-to-queue', async (_event, data: any) => {
    if (!posabitService) {
      // Store offline if no connection
      addOfflineQueueEntry(data);
      return { offline: true };
    }

    try {
      const result = await posabitService.addToQueue(data);
      return result;
    } catch (error) {
      // Store offline on failure
      addOfflineQueueEntry(data);
      return { offline: true, error: (error as Error).message };
    }
  });

  // Sync status
  ipcMain.handle('get-sync-status', () => {
    return {
      lastSync: store.get('lastSyncTime'),
      isSyncing: syncService?.isSyncing ?? false,
      customerCount: syncService?.customerCount ?? 0,
      progress: syncService?.progress ?? null,
    };
  });

  ipcMain.handle('force-sync', async () => {
    if (!syncService) throw new Error('No venue selected');
    await syncService.fullSync();
    return { success: true };
  });

  // Settings
  ipcMain.handle('set-kiosk-mode', (_event, enabled: boolean) => {
    store.set('kioskMode', enabled);
    if (mainWindow) {
      mainWindow.setKiosk(enabled);
      mainWindow.setFullScreen(enabled);
    }
    return enabled;
  });

  ipcMain.handle('get-kiosk-mode', () => store.get('kioskMode'));

  // Auto-update handlers
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
      console.log('Skipping update check in dev mode');
      return { updateAvailable: false, isDev: true };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { updateAvailable: !!result?.updateInfo, info: result?.updateInfo };
    } catch (error) {
      console.error('Update check failed:', error);
      return { error: (error as Error).message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  // Debug/Admin handlers
  ipcMain.handle('debug-search-global', async (_event, phone: string) => {
    console.log('Debug: Global search for phone:', phone);
    const customer = searchCustomerByPhoneGlobal(phone);
    const totalCount = getTotalCustomerCount();
    const venueIds = getVenueIdsInDb();
    return {
      found: !!customer,
      customer,
      totalCustomers: totalCount,
      venueIdsInDb: venueIds
    };
  });

  ipcMain.handle('debug-db-info', async () => {
    const totalCount = getTotalCustomerCount();
    const venueIds = getVenueIdsInDb();
    const selectedVenue = store.get('selectedVenue');
    const phoneCounts = getCustomersWithPhoneCount();
    const sampleCustomers = getSampleCustomers(5);

    console.log('=== DEBUG DB INFO ===');
    console.log('Total customers:', totalCount);
    console.log('Customers with phone:', phoneCounts.withPhone);
    console.log('Sample customers:', JSON.stringify(sampleCustomers, null, 2));
    console.log('======================');

    return {
      totalCustomers: totalCount,
      venueIdsInDb: venueIds,
      selectedVenue,
      customersWithPhone: phoneCounts.withPhone,
      sampleCustomers
    };
  });
}

app.whenReady().then(() => {
  // Initialize SQLite database
  initDatabase();

  // Setup IPC handlers
  setupIpcHandlers();

  // Create main window
  createWindow();

  // Initialize services if venue was previously selected
  const savedVenue = store.get('selectedVenue') as string | null;
  if (savedVenue) {
    initializeServices(savedVenue);
  }

  // Check for updates on startup (only in production)
  if (!isDev) {
    setTimeout(() => {
      console.log('Checking for updates...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Update check failed:', err);
      });
    }, 5000); // Wait 5 seconds after startup
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
