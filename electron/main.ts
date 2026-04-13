import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { getVenueList, getVenueById, INTEGRATOR_TOKEN, Venue } from './config/venues.js';
import { initDatabase, getCustomerByPhone, getCustomerByName, getCustomerByLicense, upsertCustomers, addOfflineQueueEntry, getUnsyncedEntries, markEntrySynced, getTotalCustomerCount, searchCustomerByPhoneGlobal, getVenueIdsInDb, getSampleCustomers, getCustomersWithPhoneCount } from './services/database.js';
import { SyncService } from './services/sync.js';
import { PosabitService } from './services/posabit.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default blocked words list
const DEFAULT_BLOCKED_WORDS: string[] = [
  // General profanity
  'ass', 'asshole', 'bastard', 'bitch', 'bullshit', 'cock', 'cunt',
  'damn', 'dick', 'douche', 'fuck', 'fucker', 'fucked', 'fucking',
  'goddamn', 'motherfucker', 'piss', 'prick', 'pussy', 'shit',
  'slut', 'twat', 'whore', 'wanker', 'tosser', 'bellend', 'knob',
  'arse', 'arsehole', 'bollocks', 'bugger', 'bloody', 'blowjob',
  'butthole', 'buttplug', 'circlejerk', 'clit', 'clitoris',
  'crap', 'dammit', 'dildo', 'dumbass', 'dumbfuck',
  'ejaculate', 'erection', 'fellatio', 'fingering', 'fisting',
  'gangbang', 'handjob', 'jackass', 'jackoff', 'jerkoff',
  'masturbate', 'orgasm', 'rimjob', 'scrotum', 'semen',
  'shithead', 'shitface', 'skank', 'smegma', 'spunk',
  'testicle', 'turd', 'vibrator',
  // F-word variations
  'fboy', 'fboi', 'fuk', 'fck', 'stfu', 'wtf', 'af', 'phuck',
  'phuk', 'fuq', 'effing', 'fking', 'fcking', 'fudge',
  // N-word and variations (comprehensive)
  'nigga', 'nigger', 'nigg', 'niga', 'nigah', 'niggah', 'niggas',
  'niggers', 'niggaz', 'n1gga', 'n1gger', 'niqqa', 'niqqer',
  // Other slurs
  'faggot', 'fag', 'fagot', 'fagg', 'retard', 'retarded',
  'dyke', 'tranny', 'shemale', 'chink', 'gook', 'spic',
  'wetback', 'beaner', 'kike', 'towelhead', 'raghead',
  'cracker', 'redneck', 'hillbilly', 'coon', 'darkie',
  'negro', 'chinaman', 'jap', 'paki',
  // Violence
  'shoot', 'shooter', 'shot', 'kill', 'bomb', 'isis',
  'murder', 'terrorist', 'jihad', 'cartel',
  // Political trolling (Sarah's additions)
  'maga', 'magatt', 'magatard', 'snowflake', 'libtard', 'ice',
  'trump', 'donaldtrump', 'biden', 'joebiden', 'scamala',
  'brandon', 'letsgobrandon',
  // Sexual / inappropriate
  'daddy', 'sugarbaby', 'milf', 'dilf', 'boobs', 'tits', 'penis',
  'vagina', 'sexy', 'horny', 'hoe', 'thot', 'hooker', 'stripper',
  'pornstar', 'onlyfans', 'simp', 'incel',
  // Sarah's specific additions
  'mami', 'papi', 'mommy', 'mom', 'dumb', 'stupid', 'fool',
  'cum', 'cumgoblin',
  // Meme / troll names
  'deez', 'ligma', 'sugma', 'bofa', 'problem', 'police',
  'yourmom', 'urmom', 'yomama', 'seymour', 'heywood',
  'imafraud', 'fakename', 'guest', 'test', 'admin',
  'null', 'undefined', 'anonymous',
];

// Store schema type
interface StoreSchema {
  selectedVenue: string | null;
  lastSyncTime: string | null;
  kioskMode: boolean;
  blockedWords: string[];
}

// Persistent settings store
const store = new Store<StoreSchema>({
  defaults: {
    selectedVenue: null,
    lastSyncTime: null,
    kioskMode: false,
    blockedWords: DEFAULT_BLOCKED_WORDS,
  }
});

// Reset blocked words to new defaults if the stored list is the old short list
const storedWords = store.get('blockedWords') as string[];
if (!storedWords || storedWords.length < DEFAULT_BLOCKED_WORDS.length) {
  store.set('blockedWords', DEFAULT_BLOCKED_WORDS);
}

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

let updateDownloaded = false;

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version, '- will install at 3 AM or on next quit');
  updateDownloaded = true;
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

autoUpdater.on('error', (error) => {
  console.error('Auto-updater error:', error);
});

// Schedule auto-restart at 3 AM if an update is pending
function scheduleNightlyRestart() {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) {
    next3am.setDate(next3am.getDate() + 1);
  }
  const msUntil3am = next3am.getTime() - now.getTime();
  console.log(`Next update check scheduled at 3:00 AM (in ${Math.round(msUntil3am / 60000)} minutes)`);

  setTimeout(() => {
    if (updateDownloaded) {
      console.log('3 AM: installing pending update and restarting...');
      autoUpdater.quitAndInstall(true, true);
    } else {
      console.log('3 AM: no pending update, scheduling next check');
      scheduleNightlyRestart();
    }
  }, msUntil3am);
}
scheduleNightlyRestart();

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

  // Prevent barcode scanner control characters from triggering OS shortcuts (Alt+Space = minimize)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.alt || (input.control && input.key === 'm')) {
      event.preventDefault();
    }
  });

  // Prevent window from being minimized when in kiosk mode
  if (kioskMode) {
    (mainWindow as any).on('minimize', () => {
      mainWindow?.restore();
    });
  }

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

  // Customer lookup by driver's license number (local SQLite first, then POSaBIT API fallback)
  ipcMain.handle('lookup-customer-by-license', async (_event, licenseNumber: string) => {
    const venueId = store.get('selectedVenue') as string;
    console.log('Looking up customer by DL:', licenseNumber, 'in venue:', venueId);

    if (!venueId || !licenseNumber) {
      return { found: false };
    }

    // Strategy 1: Local SQLite database (fast)
    const customer = getCustomerByLicense(licenseNumber, venueId);
    if (customer) {
      console.log('Local DB DL match:', customer.first_name, customer.last_name, '(ID:', customer.id, ')');
      return { found: true, customer };
    }

    // Strategy 2: POSaBIT API fallback
    if (posabitService) {
      console.log('Local DB DL miss — trying POSaBIT API for DL:', licenseNumber);
      try {
        const apiCustomer = await posabitService.searchCustomerByLicense(licenseNumber);
        if (apiCustomer) {
          console.log('API DL match:', apiCustomer.first_name, apiCustomer.last_name, '(ID:', apiCustomer.id, ')');
          // Cache in local DB for future lookups
          upsertCustomers([apiCustomer], venueId);
          return { found: true, customer: apiCustomer };
        }
      } catch (err) {
        console.error('API DL lookup failed:', err);
      }
    }

    console.log('Customer not found by DL:', licenseNumber);
    return { found: false };
  });

  // Fetch full customer record from POSaBIT API (for link account verification)
  ipcMain.handle('fetch-customer-by-id', async (_event, customerId: number) => {
    if (!posabitService) throw new Error('No venue selected');

    console.log('Fetching full customer record for ID:', customerId);
    const customer = await posabitService.fetchCustomerById(customerId);

    return customer ? { found: true, customer } : { found: false };
  });

  // Customer lookup by name (local SQLite first, then POSaBIT API fallback) - for ID scan
  ipcMain.handle('lookup-customer-by-name', async (_event, firstName: string, lastName: string) => {
    const venueId = store.get('selectedVenue') as string;
    console.log('Looking up customer by name:', firstName, lastName, 'in venue:', venueId);

    if (!venueId) {
      console.log('No venue selected for lookup');
      return { found: false };
    }

    // Strategy 1: Local SQLite database (fast)
    const customer = getCustomerByName(firstName, lastName, venueId);
    if (customer) {
      console.log('Local DB match:', customer.first_name, customer.last_name, '(ID:', customer.id, ')');
      return { found: true, customer };
    }

    // Strategy 2: POSaBIT API fallback (slower but comprehensive)
    if (posabitService) {
      console.log('Local DB miss — trying POSaBIT API for:', firstName, lastName);
      try {
        const apiCustomer = await posabitService.searchCustomerByName(firstName, lastName);
        if (apiCustomer) {
          console.log('API match:', apiCustomer.first_name, apiCustomer.last_name, '(ID:', apiCustomer.id, ')');
          // Cache in local DB for future lookups
          upsertCustomers([apiCustomer], venueId);
          return { found: true, customer: apiCustomer };
        }
      } catch (err) {
        console.error('API name lookup failed:', err);
      }
    }

    console.log('Customer not found anywhere:', firstName, lastName);
    return { found: false };
  });

  // Create customer in POSaBIT
  ipcMain.handle('create-customer', async (_event, data: any) => {
    if (!posabitService) throw new Error('No venue selected');
    const venueId = store.get('selectedVenue') as string;

    const newCustomer = await posabitService.createCustomer(data);

    // Sync newly created customer to local database so email and other fields persist
    if (venueId) {
      upsertCustomers([newCustomer], venueId);
      console.log('New customer synced to local DB:', newCustomer.id);
    }

    return newCustomer;
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
    const venueId = store.get('selectedVenue') as string;

    if (!posabitService) {
      // Store offline if no connection
      try {
        addOfflineQueueEntry({ ...data, venue_id: venueId });
      } catch (e) {
        console.error('Failed to store offline queue entry:', e);
      }
      return { offline: true };
    }

    try {
      const result = await posabitService.addToQueue(data);
      return result;
    } catch (error) {
      // Store offline on failure
      try {
        addOfflineQueueEntry({ ...data, venue_id: venueId });
      } catch (e) {
        console.error('Failed to store offline queue entry:', e);
      }
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

  // Blocked words
  ipcMain.handle('get-blocked-words', () => store.get('blockedWords'));

  ipcMain.handle('set-blocked-words', (_event, words: string[]) => {
    store.set('blockedWords', words);
    return words;
  });

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

  // Check for updates on startup and every 24 hours (only in production)
  if (!isDev) {
    const checkForUpdates = () => {
      console.log('Checking for updates...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Update check failed:', err);
      });
    };

    // Initial check 30 seconds after startup
    setTimeout(checkForUpdates, 30000);

    // Then check every 24 hours
    setInterval(checkForUpdates, 24 * 60 * 60 * 1000);
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
