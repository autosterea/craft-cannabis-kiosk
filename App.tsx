
import React, { useState, useEffect, useCallback } from 'react';
import { AppView, Customer } from './types';
import KioskHome from './components/Kiosk/KioskHome';
import QueueDisplay from './components/TV/QueueDisplay';
import VenueSelector from './components/VenueSelector';
import AdminPanel from './components/AdminPanel';
import {
  isElectron,
  getQueue,
  addToQueue,
  getCurrentVenue,
  forceSync,
  getSyncStatus,
  Venue,
  QueueItem
} from './services/kioskApi';
// Keep old posabit import for web fallback
import { initializeCustomerCache } from './services/posabit';

// Convert queue item to app Customer type
const mapQueueItemToCustomer = (item: QueueItem): Customer => {
  const nameParts = item.name.trim().split(' ');
  const firstName = nameParts[0] || 'Guest';
  const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '';

  return {
    id: item.customer_queue_id.toString(),
    name: firstName,
    lastNameInitial: lastInitial,
    checkInTime: new Date(item.created_at),
    method: item.source === 'order_ahead' ? 'APP' : 'GUEST',
    loyaltyStatus: item.customer_id ? 'Member' : 'Guest',
    status: item.aasm_state === 'open' ? 'Waiting' :
            item.aasm_state === 'processing' ? 'Being Served' : 'Completed',
  };
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('KIOSK');
  const [queue, setQueue] = useState<Customer[]>([]);
  const [lastCheckIn, setLastCheckIn] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Electron-specific state
  const [venueSelected, setVenueSelected] = useState<boolean>(!isElectron());
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Sync status
  const [syncStatus, setSyncStatus] = useState<{
    lastSync: string | null;
    isSyncing: boolean;
    customerCount: number;
    progress?: { current: number; total: number };
  } | null>(null);
  const [showSyncBanner, setShowSyncBanner] = useState(true);
  const [wasSyncing, setWasSyncing] = useState(false);

  // Check for existing venue selection on startup
  useEffect(() => {
    const checkVenue = async () => {
      if (isElectron()) {
        const venue = await getCurrentVenue();
        if (venue) {
          setCurrentVenue(venue);
          setVenueSelected(true);
        }
      }
      setInitializing(false);
    };

    checkVenue();
  }, []);

  // Poll sync status in Electron mode
  useEffect(() => {
    if (!isElectron() || !venueSelected) return;

    const fetchSyncStatus = async () => {
      try {
        const status = await getSyncStatus();
        setSyncStatus(status);

        // Track sync state changes to auto-hide banner
        if (status.isSyncing) {
          setWasSyncing(true);
          setShowSyncBanner(true);
        } else if (wasSyncing && !status.isSyncing && status.customerCount > 0) {
          // Sync just finished successfully - hide banner after 3 seconds
          setTimeout(() => {
            setShowSyncBanner(false);
            setWasSyncing(false);
          }, 3000);
        }
      } catch (err) {
        console.error('Failed to get sync status:', err);
      }
    };

    // Initial fetch
    fetchSyncStatus();

    // Poll every 2 seconds while syncing, every 30 seconds otherwise
    const interval = setInterval(fetchSyncStatus, syncStatus?.isSyncing ? 2000 : 30000);
    return () => clearInterval(interval);
  }, [venueSelected, syncStatus?.isSyncing, wasSyncing]);

  // Fetch queue (only used for TV display mode)
  const fetchQueue = useCallback(async () => {
    if (!venueSelected) return;

    try {
      const response = await getQueue();
      // Handle various response formats
      if (response && response.customer_queues) {
        const customers = response.customer_queues.map(mapQueueItemToCustomer);
        setQueue(customers);
        setError(null);
      } else if (response && response.total_records === 0) {
        // Valid empty queue
        setQueue([]);
        setError(null);
      } else {
        setQueue([]);
      }
    } catch (err) {
      console.error('Failed to fetch queue:', err);
      setError('Failed to load queue');
    }
  }, [venueSelected]);

  // Only poll queue when in TV view (queue display mode)
  useEffect(() => {
    if (!venueSelected || view !== 'TV') return;

    fetchQueue();
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, [fetchQueue, venueSelected, view]);

  // Initialize customer cache (web mode only)
  useEffect(() => {
    if (!venueSelected) return;
    if (isElectron()) return; // Electron handles this in main process

    const initCache = async () => {
      try {
        console.log('Initializing customer cache...');
        await initializeCustomerCache();
        console.log('Customer cache ready');
      } catch (err) {
        console.error('Failed to initialize customer cache:', err);
      }
    };

    initCache();
  }, [venueSelected]);

  const handleVenueSelected = (venue: Venue) => {
    setCurrentVenue(venue);
    setVenueSelected(true);
  };

  // Reset venue selection to show venue selector
  const handleChangeVenue = () => {
    setVenueSelected(false);
    setCurrentVenue(null);
    setQueue([]);
  };

  const handleCheckIn = useCallback(async (customerData: Partial<Customer>) => {
    setLoading(true);

    try {
      const fullName = customerData.lastNameInitial
        ? `${customerData.name} ${customerData.lastNameInitial}`
        : customerData.name || 'Guest';

      const result = await addToQueue({
        name: fullName,
        phone: customerData.phone,
        method: customerData.method || 'GUEST',
        customerId: customerData.customerId,
      });

      // Handle offline mode
      if (result.offline) {
        console.log('Check-in stored offline, will sync later');
      }

      const newCustomer: Customer = {
        id: result.customer_queue_id?.toString() || Date.now().toString(),
        name: customerData.name || 'Guest',
        lastNameInitial: customerData.lastNameInitial || '',
        checkInTime: new Date(),
        method: customerData.method || 'GUEST',
        loyaltyStatus: customerData.loyaltyStatus || 'Guest',
        status: 'Waiting',
      };

      setLastCheckIn(newCustomer);
      // Only refresh queue if in TV view
      if (view === 'TV') {
        await fetchQueue();
      }
      setTimeout(() => setLastCheckIn(null), 3000);
    } catch (err) {
      console.error('Failed to check in:', err);
      setError('Check-in failed. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  }, [fetchQueue, view]);

  // Show loading during initialization
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
        <div className="animate-spin w-12 h-12 border-4 border-gold border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Show venue selector if in Electron and no venue selected
  if (isElectron() && !venueSelected) {
    return <VenueSelector onVenueSelected={handleVenueSelected} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden">
      {/* View Switcher Overlay */}
      <div className="fixed top-2 right-2 z-50 flex gap-2 opacity-20 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setView('KIOSK')}
          className={`px-3 py-1 rounded text-xs ${view === 'KIOSK' ? 'bg-gold text-black' : 'bg-zinc-800 text-white'}`}
        >
          Kiosk Mode
        </button>
        <button
          onClick={() => setView('TV')}
          className={`px-3 py-1 rounded text-xs ${view === 'TV' ? 'bg-gold text-black' : 'bg-zinc-800 text-white'}`}
        >
          TV Queue
        </button>
        <button
          onClick={fetchQueue}
          className="px-3 py-1 rounded text-xs bg-zinc-700 text-white hover:bg-zinc-600"
        >
          Refresh
        </button>
        {currentVenue && (
          <button
            onClick={handleChangeVenue}
            className="px-3 py-1 text-xs text-zinc-500 hover:text-gold hover:underline"
            title="Click to change venue"
          >
            {currentVenue.name}
          </button>
        )}
        {isElectron() && (
          <button
            onClick={() => setShowAdminPanel(true)}
            className="px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          >
            Admin
          </button>
        )}
      </div>

      {/* Sync Status Banner - only show when syncing, just finished, or has problem */}
      {isElectron() && syncStatus && showSyncBanner && (syncStatus.isSyncing || syncStatus.customerCount === 0 || wasSyncing) && (
        <div className={`fixed top-12 left-1/2 -translate-x-1/2 z-40 px-6 py-3 rounded-lg shadow-lg transition-opacity duration-500 ${
          syncStatus.isSyncing
            ? 'bg-blue-600/90 text-white'
            : syncStatus.customerCount > 0
              ? 'bg-green-600/80 text-white'
              : 'bg-yellow-600/90 text-white'
        }`}>
          {syncStatus.isSyncing ? (
            <div className="flex items-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
              <span className="font-bold">
                Syncing customers...
                {syncStatus.progress && (
                  <span className="ml-2">
                    {syncStatus.progress.current.toLocaleString()} / {syncStatus.progress.total.toLocaleString()}
                  </span>
                )}
              </span>
            </div>
          ) : syncStatus.customerCount > 0 ? (
            <div className="text-sm">
              {syncStatus.customerCount.toLocaleString()} customers synced
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-bold">No customers synced yet - waiting for sync to start...</span>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center">
          <div className="bg-zinc-800 p-8 rounded-2xl text-center">
            <div className="animate-spin w-12 h-12 border-4 border-gold border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gold font-craft">Adding to queue...</p>
          </div>
        </div>
      )}

      {view === 'KIOSK' ? (
        <KioskHome onCheckIn={handleCheckIn} lastCheckIn={lastCheckIn} />
      ) : (
        <QueueDisplay queue={queue} />
      )}

      {/* Admin Panel */}
      {showAdminPanel && (
        <AdminPanel
          onClose={() => setShowAdminPanel(false)}
          onVenueChange={() => {
            setShowAdminPanel(false);
            fetchQueue();
          }}
        />
      )}
    </div>
  );
};

export default App;
