// Sync Service - Handles customer sync and offline queue sync

import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { PosabitService } from './posabit.js';
import { upsertCustomers, getCustomerCount, getUnsyncedEntries, markEntrySynced } from './database.js';

// Store schema type (must match main.ts StoreSchema)
interface StoreSchema {
  selectedVenue: string | null;
  lastSyncTime: string | null;
  kioskMode: boolean;
  blockedWords: string[];
}

export class SyncService {
  private posabit: PosabitService;
  private store: Store<StoreSchema>;
  private venueId: string;
  private syncInterval: NodeJS.Timeout | null = null;
  private _isSyncing: boolean = false;
  private _customerCount: number = 0;
  private _progress: { current: number; total: number } | null = null;

  constructor(posabit: PosabitService, store: Store<StoreSchema>, venueId: string) {
    this.posabit = posabit;
    this.store = store;
    this.venueId = venueId;
    this._customerCount = getCustomerCount(venueId);
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  get customerCount(): number {
    return this._customerCount;
  }

  get progress(): { current: number; total: number } | null {
    return this._progress;
  }

  // Send progress to renderer
  private sendProgress(current: number, total: number): void {
    this._progress = { current, total };
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('sync-progress', { current, total });
    }
  }

  // Send sync complete to renderer
  private sendComplete(): void {
    this._progress = null;
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('sync-complete');
    }
  }

  // Full sync - fetches all customers (for first install or manual resync)
  async fullSync(): Promise<void> {
    if (this._isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this._isSyncing = true;
    console.log('Starting full customer sync...');

    try {
      const customers = await this.posabit.fetchAllCustomers((current, total) => {
        this.sendProgress(current, total);
        if (current % 1000 === 0) {
          console.log(`Sync progress: ${current}/${total}`);
        }
      });

      // Log sample of what we got from API
      if (customers.length > 0) {
        console.log('=== SAMPLE CUSTOMER FROM API ===');
        console.log(JSON.stringify(customers[0], null, 2));
        const withPhone = customers.filter(c => c.telephone).length;
        console.log(`Customers with phone from API: ${withPhone}/${customers.length}`);
        console.log('================================');
      }

      const inserted = upsertCustomers(customers, this.venueId);
      this._customerCount = getCustomerCount(this.venueId);

      this.store.set('lastSyncTime', new Date().toISOString());

      console.log(`Full sync complete: ${inserted} customers`);
      this.sendComplete();
    } catch (error) {
      console.error('Full sync failed:', error);
      throw error;
    } finally {
      this._isSyncing = false;
    }
  }

  // Incremental sync - only fetches customers updated since last sync
  async incrementalSync(): Promise<void> {
    if (this._isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    const lastSync = this.store.get('lastSyncTime') as string | null;
    if (!lastSync) {
      // No previous sync, do full sync
      return this.fullSync();
    }

    this._isSyncing = true;
    console.log(`Starting incremental sync since ${lastSync}...`);

    try {
      // Fetch only updated customers
      let page = 1;
      let totalUpdated = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await this.posabit.fetchCustomers({
          page,
          perPage: 100,
          updatedSince: lastSync,
        });

        if (response.customers.length > 0) {
          // POSaBIT wraps each customer in a { customer: {...} } object - unwrap it
          const unwrappedCustomers = response.customers.map((item: any) =>
            item.customer ? item.customer : item
          );
          upsertCustomers(unwrappedCustomers, this.venueId);
          totalUpdated += unwrappedCustomers.length;
        }

        hasMore = page < response.total_pages;
        page++;
      }

      this._customerCount = getCustomerCount(this.venueId);
      this.store.set('lastSyncTime', new Date().toISOString());

      console.log(`Incremental sync complete: ${totalUpdated} customers updated`);
    } catch (error) {
      console.error('Incremental sync failed:', error);
    } finally {
      this._isSyncing = false;
    }
  }

  // Sync offline queue entries to POSaBIT
  async syncOfflineQueue(): Promise<void> {
    const unsyncedEntries = getUnsyncedEntries(this.venueId);

    if (unsyncedEntries.length === 0) {
      return;
    }

    console.log(`Syncing ${unsyncedEntries.length} offline queue entries...`);

    for (const entry of unsyncedEntries) {
      try {
        await this.posabit.addToQueue({
          name: entry.name,
          telephone: entry.phone || undefined,
          customerId: entry.customer_id || undefined,
        });

        markEntrySynced(entry.id!);
        console.log(`Synced offline entry ${entry.id}`);
      } catch (error) {
        console.error(`Failed to sync offline entry ${entry.id}:`, error);
        // Continue with other entries
      }
    }
  }

  // Start background sync (called after venue selection)
  startBackgroundSync(): void {
    // Do initial sync in background (non-blocking)
    const lastSync = this.store.get('lastSyncTime') as string | null;

    if (!lastSync) {
      // First install - full sync in background
      console.log('First install detected, starting background full sync...');
      this.fullSync().catch(err => console.error('Background sync error:', err));
    } else {
      // Incremental sync
      this.incrementalSync().catch(err => console.error('Background sync error:', err));
    }

    // Also sync any offline queue entries
    this.syncOfflineQueue().catch(err => console.error('Offline sync error:', err));

    // Setup periodic sync (every 15 minutes)
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.incrementalSync().catch(err => console.error('Periodic sync error:', err));
      this.syncOfflineQueue().catch(err => console.error('Offline sync error:', err));
    }, 15 * 60 * 1000); // 15 minutes

    console.log('Background sync started (15 minute interval)');
  }

  // Stop background sync
  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}
