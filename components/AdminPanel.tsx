import React, { useState, useEffect } from 'react';
import {
  isElectron,
  getVenues,
  getCurrentVenue,
  setVenue,
  getSyncStatus,
  forceSync,
  lookupCustomer,
  setKioskMode,
  getKioskMode,
  getShowHomeInfoPanel,
  setShowHomeInfoPanel,
  getBlockedWords,
  setBlockedWords,
  getAppVersion,
  checkForUpdates,
  installUpdate,
  Venue,
  KioskCustomer
} from '../services/kioskApi';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; checkedAt: Date }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

interface AdminPanelProps {
  onClose: () => void;
  onVenueChange?: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, onVenueChange }) => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    lastSync: string | null;
    isSyncing: boolean;
    customerCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Customer search
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState<{
    searched: boolean;
    found: boolean;
    customer?: KioskCustomer;
    totalCustomers?: number;
    venueIdsInDb?: string[];
  } | null>(null);
  const [searching, setSearching] = useState(false);

  // Debug info
  const [dbInfo, setDbInfo] = useState<{
    totalCustomers: number;
    venueIdsInDb: string[];
    selectedVenue: string | null;
    customersWithPhone?: number;
    sampleCustomers?: any[];
  } | null>(null);

  // Kiosk mode
  const [kioskModeEnabled, setKioskModeEnabled] = useState(false);

  // Show Home Info Panel (portrait-only scanner/group cards)
  const [showHomeInfoPanel, setShowHomeInfoPanelState] = useState(true);

  // App version
  const [appVersion, setAppVersion] = useState<string>('');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Update state
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' });

  // Blocked words
  const [blockedWords, setBlockedWordsState] = useState<string[]>([]);
  const [newWord, setNewWord] = useState('');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Subscribe to auto-updater background events (reflects silent updates in UI)
  useEffect(() => {
    if (!isElectron() || !window.kiosk) return;
    const offAvail = window.kiosk.onUpdateAvailable?.((info: { version: string }) => {
      setUpdateState({ kind: 'downloading', version: info.version, percent: 0 });
    });
    const offProg = window.kiosk.onUpdateProgress?.((p: { percent: number }) => {
      setUpdateState((s) =>
        s.kind === 'downloading' || s.kind === 'available'
          ? { kind: 'downloading', version: (s as any).version ?? '', percent: Math.round(p.percent) }
          : s
      );
    });
    const offDone = window.kiosk.onUpdateDownloaded?.((info: { version: string }) => {
      setUpdateState({ kind: 'ready', version: info.version });
    });
    return () => {
      offAvail?.();
      offProg?.();
      offDone?.();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!isElectron()) return;
    setUpdateState({ kind: 'checking' });
    try {
      const result = await checkForUpdates();
      if (result.error) {
        setUpdateState({ kind: 'error', message: result.error });
        return;
      }
      if (result.updateAvailable && result.info?.version && result.info.version !== appVersion) {
        // Background handlers will flip to 'downloading' → 'ready' as autoUpdater progresses
        setUpdateState({ kind: 'available', version: result.info.version });
      } else {
        setUpdateState({ kind: 'up-to-date', checkedAt: new Date() });
      }
    } catch (err) {
      setUpdateState({ kind: 'error', message: (err as Error).message });
    }
  };

  const handleInstallUpdate = async () => {
    if (!isElectron()) return;
    try {
      await installUpdate();
    } catch (err) {
      setUpdateState({ kind: 'error', message: (err as Error).message });
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [venueList, venue, status] = await Promise.all([
        getVenues(),
        getCurrentVenue(),
        isElectron() ? getSyncStatus() : Promise.resolve(null)
      ]);
      setVenues(venueList);
      setCurrentVenue(venue);
      setSyncStatus(status);

      // Load debug info, kiosk mode, blocked words, and version if in Electron
      if (isElectron()) {
        if (window.kiosk?.debugDbInfo) {
          const info = await window.kiosk.debugDbInfo();
          setDbInfo(info);
        }
        const kioskMode = await getKioskMode();
        setKioskModeEnabled(kioskMode);
        const infoPanel = await getShowHomeInfoPanel();
        setShowHomeInfoPanelState(infoPanel);
        const words = await getBlockedWords();
        setBlockedWordsState(words);
        const version = await getAppVersion();
        setAppVersion(version);
        if (window.kiosk?.getFullscreen) {
          const fs = await window.kiosk.getFullscreen();
          setIsFullscreen(fs);
        }
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVenueChange = async (venueId: string) => {
    try {
      const venue = await setVenue(venueId);
      setCurrentVenue(venue);
      onVenueChange?.();
    } catch (err) {
      console.error('Failed to change venue:', err);
    }
  };

  const handleForceSync = async () => {
    if (!isElectron()) return;
    setSyncing(true);
    try {
      await forceSync();
      // Refresh status after sync
      const status = await getSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleKioskModeToggle = async () => {
    if (!isElectron()) return;
    const newValue = !kioskModeEnabled;
    await setKioskMode(newValue);
    setKioskModeEnabled(newValue);
  };

  const handleShowHomeInfoPanelToggle = async () => {
    if (!isElectron()) return;
    const newValue = !showHomeInfoPanel;
    await setShowHomeInfoPanel(newValue);
    setShowHomeInfoPanelState(newValue);
  };

  const handleAddBlockedWord = async () => {
    const word = newWord.trim().toLowerCase();
    if (!word || blockedWords.includes(word)) {
      setNewWord('');
      return;
    }
    const updated = [...blockedWords, word].sort();
    setBlockedWordsState(updated);
    await setBlockedWords(updated);
    setNewWord('');
  };

  const handleRemoveBlockedWord = async (word: string) => {
    const updated = blockedWords.filter(w => w !== word);
    setBlockedWordsState(updated);
    await setBlockedWords(updated);
  };

  const handleSearch = async () => {
    if (!searchPhone || searchPhone.length < 10) {
      alert('Please enter a valid 10-digit phone number');
      return;
    }

    setSearching(true);
    setSearchResult(null);

    try {
      // First try venue-specific lookup
      const result = await lookupCustomer(searchPhone.replace(/\D/g, ''));

      // Also try global search if in Electron (for debugging)
      let globalResult = null;
      if (isElectron() && window.kiosk?.debugSearchGlobal) {
        globalResult = await window.kiosk.debugSearchGlobal(searchPhone.replace(/\D/g, ''));
        console.log('Global search result:', globalResult);
      }

      setSearchResult({
        searched: true,
        found: result.found || (globalResult?.found || false),
        customer: result.customer || globalResult?.customer,
        totalCustomers: globalResult?.totalCustomers,
        venueIdsInDb: globalResult?.venueIdsInDb
      });
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResult({ searched: true, found: false });
    } finally {
      setSearching(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-gold border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 overflow-auto">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-craft font-bold text-gold uppercase tracking-wider">
              Admin Panel
            </h1>
            {appVersion && (
              <p className="text-zinc-500 text-sm mt-1">v{appVersion}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Venue Selection */}
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 mb-6">
          <h2 className="text-xl font-craft text-gold mb-4">Current Venue</h2>
          <div className="flex items-center gap-4">
            <select
              value={currentVenue?.id || ''}
              onChange={(e) => handleVenueChange(e.target.value)}
              className="flex-1 bg-zinc-800 text-white p-3 rounded-lg border border-zinc-700 focus:border-gold outline-none"
            >
              <option value="">Select a venue...</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>
          {currentVenue && (
            <p className="text-zinc-400 mt-2">
              Selected: <span className="text-white">{currentVenue.name}</span>
            </p>
          )}
        </div>

        {/* Sync Status (Electron only) */}
        {isElectron() && (
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 mb-6">
            <h2 className="text-xl font-craft text-gold mb-4">Sync Status</h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-800/50 p-4 rounded-lg">
                <p className="text-zinc-400 text-sm">Total Customers</p>
                <p className="text-3xl font-bold text-white">
                  {syncStatus?.customerCount?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-zinc-800/50 p-4 rounded-lg">
                <p className="text-zinc-400 text-sm">Last Sync</p>
                <p className="text-lg text-white">
                  {formatDate(syncStatus?.lastSync || null)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleForceSync}
                disabled={syncing || syncStatus?.isSyncing}
                className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                  syncing || syncStatus?.isSyncing
                    ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                    : 'bg-gold text-black hover:bg-[#d8c19d]'
                }`}
              >
                {syncing || syncStatus?.isSyncing ? 'Syncing...' : 'Force Full Sync'}
              </button>
              {syncStatus?.isSyncing && (
                <span className="text-gold animate-pulse">Sync in progress...</span>
              )}
            </div>
          </div>
        )}

        {/* Kiosk Mode (Electron only) */}
        {isElectron() && (
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 mb-6">
            <h2 className="text-xl font-craft text-gold mb-4">Display Settings</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold">Kiosk Mode</p>
                <p className="text-zinc-400 text-sm">Fullscreen, no window controls, no taskbar access</p>
              </div>
              <button
                onClick={handleKioskModeToggle}
                className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                  kioskModeEnabled
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                }`}
              >
                {kioskModeEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {kioskModeEnabled && (
              <p className="text-yellow-500 text-sm mt-4">
                Press F11 or Alt+F4 to exit kiosk mode if needed
              </p>
            )}

            <div className="flex items-center justify-between mt-6 pt-6 border-t border-zinc-800">
              <div>
                <p className="text-white font-bold">Full Screen</p>
                <p className="text-zinc-400 text-sm">Toggle window full screen mode</p>
              </div>
              <button
                onClick={async () => {
                  if (window.kiosk?.toggleFullscreen) {
                    const fs = await window.kiosk.toggleFullscreen();
                    setIsFullscreen(fs);
                  }
                }}
                className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                  isFullscreen
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                }`}
              >
                {isFullscreen ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between mt-6 pt-6 border-t border-zinc-800">
              <div>
                <p className="text-white font-bold">Home Screen Info Panel</p>
                <p className="text-zinc-400 text-sm">Shows "In a Group?" + "Barcode Scanner Below" cards (portrait screens only)</p>
              </div>
              <button
                onClick={handleShowHomeInfoPanelToggle}
                className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                  showHomeInfoPanel
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                }`}
              >
                {showHomeInfoPanel ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}

        {/* Blocked Words */}
        {isElectron() && (
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 mb-6">
            <h2 className="text-xl font-craft text-gold mb-4">
              Blocked Words
              <span className="text-zinc-500 text-sm font-normal ml-2">({blockedWords.length} words)</span>
            </h2>
            <p className="text-zinc-400 text-sm mb-4">
              Names containing these words will be rejected at check-in.
            </p>

            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddBlockedWord(); }}
                placeholder="Add a word..."
                className="flex-1 bg-zinc-800 text-white p-3 rounded-lg border border-zinc-700 focus:border-gold outline-none"
              />
              <button
                onClick={handleAddBlockedWord}
                disabled={!newWord.trim()}
                className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                  newWord.trim()
                    ? 'bg-gold text-black hover:bg-[#d8c19d]'
                    : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                }`}
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {blockedWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full text-sm border border-zinc-700"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveBlockedWord(word)}
                    className="ml-1 text-zinc-500 hover:text-red-400 transition-colors text-lg leading-none"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {blockedWords.length === 0 && (
                <p className="text-zinc-600 text-sm italic">No blocked words configured.</p>
              )}
            </div>
          </div>
        )}

        {/* Customer Search */}
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 mb-6">
          <h2 className="text-xl font-craft text-gold mb-4">Customer Search</h2>
          <p className="text-zinc-400 mb-4">
            Search for a customer by phone number to verify they exist in the local database.
          </p>

          <div className="flex gap-4 mb-4">
            <input
              type="tel"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Enter phone number (e.g., 5596769242)"
              className="flex-1 bg-zinc-800 text-white p-3 rounded-lg border border-zinc-700 focus:border-gold outline-none text-lg"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                searching
                  ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-gold text-black hover:bg-[#d8c19d]'
              }`}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          {searchResult && (
            <div className={`p-4 rounded-lg ${
              searchResult.found ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
            }`}>
              {searchResult.found && searchResult.customer ? (
                <div>
                  <p className="text-green-400 font-bold mb-2">Customer Found!</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="text-zinc-400">ID:</p>
                    <p className="text-white">{searchResult.customer.id}</p>
                    <p className="text-zinc-400">Name:</p>
                    <p className="text-white">
                      {searchResult.customer.first_name} {searchResult.customer.last_name}
                    </p>
                    <p className="text-zinc-400">Phone:</p>
                    <p className="text-white">{searchResult.customer.telephone || 'N/A'}</p>
                    <p className="text-zinc-400">Loyalty Member:</p>
                    <p className="text-white">
                      {searchResult.customer.loyalty_member ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-red-400 font-bold">Customer Not Found</p>
                  <p className="text-zinc-400 text-sm mt-1">
                    Phone {formatPhone(searchPhone)} is not in the local database.
                    Try running a full sync or verify the phone number in POSaBIT.
                  </p>
                  {searchResult.totalCustomers !== undefined && (
                    <p className="text-zinc-500 text-xs mt-2">
                      (Searched {searchResult.totalCustomers.toLocaleString()} total customers)
                    </p>
                  )}
                  {searchResult.venueIdsInDb && searchResult.venueIdsInDb.length > 0 && (
                    <p className="text-zinc-500 text-xs">
                      Venues in DB: {searchResult.venueIdsInDb.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* App Updates (Electron only) */}
        {isElectron() && (
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 mb-6">
            <h2 className="text-xl font-craft text-gold mb-4">App Updates</h2>
            <p className="text-zinc-400 text-sm mb-4">
              Current version: <span className="text-white font-mono">v{appVersion}</span>.
              Kiosk checks for updates automatically on startup and every 24 hours, and installs at 3 AM.
              Use this button to check immediately.
            </p>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleCheckForUpdates}
                disabled={updateState.kind === 'checking' || updateState.kind === 'downloading'}
                className={`px-6 py-3 rounded-lg font-craft font-bold transition-all ${
                  updateState.kind === 'checking' || updateState.kind === 'downloading'
                    ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                    : 'bg-gold text-black hover:bg-[#d8c19d]'
                }`}
              >
                {updateState.kind === 'checking' ? 'Checking...' : 'Check for Updates'}
              </button>

              {updateState.kind === 'ready' && (
                <button
                  onClick={handleInstallUpdate}
                  className="px-6 py-3 rounded-lg font-craft font-bold bg-green-600 text-white hover:bg-green-700 transition-all"
                >
                  Install v{updateState.version} &amp; Restart
                </button>
              )}
            </div>

            <div className="mt-4">
              {updateState.kind === 'up-to-date' && (
                <p className="text-green-400 text-sm">
                  ✓ Up to date (v{appVersion}) — checked {updateState.checkedAt.toLocaleTimeString()}
                </p>
              )}
              {updateState.kind === 'available' && (
                <p className="text-gold text-sm animate-pulse">
                  Update found: v{updateState.version} — preparing download...
                </p>
              )}
              {updateState.kind === 'downloading' && (
                <div>
                  <p className="text-gold text-sm mb-2">
                    Downloading v{updateState.version} — {updateState.percent}%
                  </p>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div
                      className="bg-gold h-2 rounded-full transition-all"
                      style={{ width: `${updateState.percent}%` }}
                    />
                  </div>
                </div>
              )}
              {updateState.kind === 'ready' && (
                <p className="text-green-400 text-sm">
                  v{updateState.version} downloaded. Click "Install &amp; Restart" to apply now, or the app will install it automatically at 3 AM.
                </p>
              )}
              {updateState.kind === 'error' && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <p className="text-red-400 text-sm font-bold">Update check failed</p>
                  <p className="text-zinc-400 text-xs mt-1 font-mono break-all">{updateState.message}</p>
                  <p className="text-zinc-500 text-xs mt-2">
                    Check internet connection. If this persists, contact support.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Debug Info */}
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-craft text-gold mb-4">System Info</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="text-zinc-400">Environment:</p>
            <p className="text-white">{isElectron() ? 'Electron (Desktop)' : 'Web Browser'}</p>
            <p className="text-zinc-400">window.kiosk:</p>
            <p className="text-white">{typeof window !== 'undefined' && window.kiosk ? 'Available' : 'Not available'}</p>
            <p className="text-zinc-400">Database Location:</p>
            <p className="text-white text-xs break-all">
              {isElectron() ? '%APPDATA%/craft-cannabis-kiosk/customers.db' : 'N/A (web mode)'}
            </p>
            {dbInfo && (
              <>
                <p className="text-zinc-400">Total Customers in DB:</p>
                <p className="text-white">{dbInfo.totalCustomers.toLocaleString()}</p>
                <p className="text-zinc-400">Customers WITH Phone:</p>
                <p className={`${dbInfo.customersWithPhone === 0 ? 'text-red-400' : 'text-white'}`}>
                  {(dbInfo.customersWithPhone || 0).toLocaleString()}
                  {dbInfo.customersWithPhone === 0 && ' (PROBLEM: No phones synced!)'}
                </p>
                <p className="text-zinc-400">Selected Venue ID:</p>
                <p className="text-white">{dbInfo.selectedVenue || 'None'}</p>
                <p className="text-zinc-400">Venue IDs in DB:</p>
                <p className="text-white text-xs">{dbInfo.venueIdsInDb.join(', ') || 'None'}</p>
              </>
            )}
          </div>

          {/* Sample Customers */}
          {dbInfo?.sampleCustomers && dbInfo.sampleCustomers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-700">
              <p className="text-zinc-400 text-sm mb-2">Sample Customers (first 5):</p>
              <div className="text-xs font-mono bg-black/30 p-2 rounded overflow-x-auto">
                {dbInfo.sampleCustomers.map((c, i) => (
                  <div key={i} className="text-zinc-300">
                    {c.id}: {c.first_name} {c.last_name} | Phone: {c.telephone || 'NULL'} | Loyalty: {c.loyalty_member ? 'Yes' : 'No'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
