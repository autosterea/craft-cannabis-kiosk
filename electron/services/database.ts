import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

// Customer type
export interface DbCustomer {
  id: number;
  first_name: string;
  last_name: string;
  telephone: string | null;
  email: string | null;
  loyalty_member: number; // SQLite uses 0/1 for boolean
  venue_id: string;
  synced_at: string;
}

// Offline queue entry type
export interface OfflineQueueEntry {
  id?: number;
  name: string;
  phone: string | null;
  method: string;
  customer_id: number | null;
  venue_id: string;
  created_at: string;
  synced: number;
}

// Get database path in user's AppData
function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'customers.db');
}

// Initialize database and create tables
export function initDatabase(): void {
  const dbPath = getDbPath();
  console.log('Database path:', dbPath);

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT,
      telephone TEXT,
      email TEXT,
      loyalty_member INTEGER DEFAULT 0,
      venue_id TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(id, venue_id)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(telephone);
    CREATE INDEX IF NOT EXISTS idx_customers_venue ON customers(venue_id);
  `);

  // Create offline queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      method TEXT NOT NULL,
      customer_id INTEGER,
      venue_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);

  console.log('Database initialized successfully');
}

// Normalize phone number (strip non-digits, take last 10)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// Get customer by phone number
export function getCustomerByPhone(phone: string, venueId: string): DbCustomer | null {
  if (!db) throw new Error('Database not initialized');

  const normalizedPhone = normalizePhone(phone);

  const stmt = db.prepare(`
    SELECT * FROM customers
    WHERE telephone LIKE ? AND venue_id = ?
    LIMIT 1
  `);

  const result = stmt.get(`%${normalizedPhone}`, venueId) as DbCustomer | undefined;
  return result || null;
}

// Bulk upsert customers
export function upsertCustomers(customers: any[], venueId: string): number {
  if (!db) throw new Error('Database not initialized');

  const syncedAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO customers (id, first_name, last_name, telephone, email, loyalty_member, venue_id, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const customer of items) {
      stmt.run(
        customer.id,
        customer.first_name || '',
        customer.last_name || '',
        customer.telephone || null,
        customer.email || null,
        customer.loyalty_member ? 1 : 0,
        venueId,
        syncedAt
      );
    }
    return items.length;
  });

  return insertMany(customers);
}

// Get customer count for venue
export function getCustomerCount(venueId: string): number {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT COUNT(*) as count FROM customers WHERE venue_id = ?');
  const result = stmt.get(venueId) as { count: number };
  return result.count;
}

// Get total customer count (all venues)
export function getTotalCustomerCount(): number {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT COUNT(*) as count FROM customers');
  const result = stmt.get() as { count: number };
  return result.count;
}

// Search customer by phone globally (all venues) - for debugging
export function searchCustomerByPhoneGlobal(phone: string): DbCustomer | null {
  if (!db) throw new Error('Database not initialized');

  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
  console.log('Global search for phone:', normalizedPhone);

  const stmt = db.prepare(`
    SELECT * FROM customers
    WHERE telephone LIKE ?
    LIMIT 1
  `);

  const result = stmt.get(`%${normalizedPhone}%`) as DbCustomer | undefined;
  if (result) {
    console.log('Found customer globally:', result.first_name, result.last_name, 'venue:', result.venue_id);
  } else {
    console.log('No customer found with phone:', normalizedPhone);
  }
  return result || null;
}

// Get all unique venue IDs in database
export function getVenueIdsInDb(): string[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT DISTINCT venue_id FROM customers');
  const results = stmt.all() as { venue_id: string }[];
  return results.map(r => r.venue_id);
}

// Debug: Get sample customers to see what data looks like
export function getSampleCustomers(limit: number = 10): DbCustomer[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM customers LIMIT ?');
  return stmt.all(limit) as DbCustomer[];
}

// Debug: Get count of customers with phone numbers
export function getCustomersWithPhoneCount(): { total: number; withPhone: number } {
  if (!db) throw new Error('Database not initialized');

  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM customers');
  const phoneStmt = db.prepare("SELECT COUNT(*) as count FROM customers WHERE telephone IS NOT NULL AND telephone != ''");

  const total = (totalStmt.get() as { count: number }).count;
  const withPhone = (phoneStmt.get() as { count: number }).count;

  return { total, withPhone };
}

// Search customer by first name and last name
export function getCustomerByName(firstName: string, lastName: string, venueId: string): DbCustomer | null {
  if (!db) throw new Error('Database not initialized');

  // Case-insensitive search
  const normalizedFirst = firstName.trim().toUpperCase();
  const normalizedLast = lastName.trim().toUpperCase();

  console.log('Searching for customer by name:', normalizedFirst, normalizedLast, 'venue:', venueId);

  const stmt = db.prepare(`
    SELECT * FROM customers
    WHERE UPPER(first_name) = ? AND UPPER(last_name) = ? AND venue_id = ?
    LIMIT 1
  `);

  const result = stmt.get(normalizedFirst, normalizedLast, venueId) as DbCustomer | undefined;

  if (result) {
    console.log('Found customer by name:', result.first_name, result.last_name, 'ID:', result.id);
  } else {
    console.log('No customer found with name:', normalizedFirst, normalizedLast);
  }

  return result || null;
}

// Add offline queue entry
export function addOfflineQueueEntry(data: Omit<OfflineQueueEntry, 'id' | 'synced'>): number {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO offline_queue (name, phone, method, customer_id, venue_id, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  const result = stmt.run(
    data.name,
    data.phone || null,
    data.method,
    data.customer_id || null,
    data.venue_id,
    data.created_at || new Date().toISOString()
  );

  return result.lastInsertRowid as number;
}

// Get unsynced offline entries
export function getUnsyncedEntries(venueId: string): OfflineQueueEntry[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT * FROM offline_queue
    WHERE venue_id = ? AND synced = 0
    ORDER BY created_at ASC
  `);

  return stmt.all(venueId) as OfflineQueueEntry[];
}

// Mark entry as synced
export function markEntrySynced(id: number): void {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE offline_queue SET synced = 1 WHERE id = ?');
  stmt.run(id);
}

// Clear all customers for venue (for full resync)
export function clearCustomers(venueId: string): void {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM customers WHERE venue_id = ?');
  stmt.run(venueId);
}

// Close database connection
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
