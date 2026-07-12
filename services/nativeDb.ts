// Local SQLite cache for the Android kiosk — the offline mirror of POSaBIT customers,
// so lookups hit the device first (fast + works if the network drops), matching the
// Windows kiosk's better-sqlite3 cache. Uses @capacitor-community/sqlite.
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type { KioskCustomer } from './kioskApi';

const DB_NAME = 'craftkiosk';
let sqlite: SQLiteConnection | null = null;
let dbConn: SQLiteDBConnection | null = null;
let ready = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  first_name TEXT, last_name TEXT,
  telephone TEXT, phone10 TEXT,
  email TEXT, loyalty INTEGER DEFAULT 0,
  drivers_license TEXT, birthday TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cust_phone ON customers(phone10);
CREATE INDEX IF NOT EXISTS idx_cust_dl ON customers(drivers_license);
CREATE INDEX IF NOT EXISTS idx_cust_last ON customers(last_name);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`;

const norm10 = (p: any) => String(p || '').replace(/\D/g, '').slice(-10);

export async function initDb(): Promise<boolean> {
  if (ready) return true;
  if (!Capacitor.isNativePlatform()) return false;
  sqlite = new SQLiteConnection(CapacitorSQLite);
  try { await sqlite.checkConnectionsConsistency(); } catch { /* first run */ }
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  dbConn = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await dbConn.open();
  await dbConn.execute(SCHEMA);
  ready = true;
  return true;
}

function rowToCustomer(r: any): KioskCustomer {
  return {
    id: r.id,
    first_name: r.first_name || '',
    last_name: r.last_name || '',
    telephone: r.telephone || undefined,
    email: r.email || undefined,
    loyalty_member: !!r.loyalty,
    drivers_license: r.drivers_license || undefined,
    birthday: r.birthday || undefined,
  };
}

export async function upsertCustomers(list: any[]): Promise<void> {
  if (!dbConn || !list.length) return;
  const set = list.map((c) => ({
    statement:
      'INSERT OR REPLACE INTO customers (id,first_name,last_name,telephone,phone10,email,loyalty,drivers_license,birthday,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    values: [
      c.id, c.first_name || '', c.last_name || '', c.telephone || null, norm10(c.telephone),
      c.email || null, (c.loyalty ?? c.loyalty_member) ? 1 : 0,
      (c.drivers_license || '').trim().toUpperCase() || null, c.birthday || null, c.updated_at || null,
    ],
  }));
  await dbConn.executeSet(set);
}

export async function customerCount(): Promise<number> {
  if (!dbConn) return 0;
  const r = await dbConn.query('SELECT COUNT(*) AS n FROM customers');
  return r.values?.[0]?.n || 0;
}

export async function findByPhone(phone: string): Promise<KioskCustomer | null> {
  if (!dbConn) return null;
  const p = norm10(phone);
  if (p.length !== 10) return null;
  const r = await dbConn.query('SELECT * FROM customers WHERE phone10=? LIMIT 1', [p]);
  return r.values?.length ? rowToCustomer(r.values[0]) : null;
}
export async function findByLicense(dl: string): Promise<KioskCustomer | null> {
  if (!dbConn) return null;
  const v = (dl || '').trim().toUpperCase();
  if (!v) return null;
  const r = await dbConn.query('SELECT * FROM customers WHERE drivers_license=? LIMIT 1', [v]);
  return r.values?.length ? rowToCustomer(r.values[0]) : null;
}
export async function findByDobLastname(birthday: string, lastName: string): Promise<KioskCustomer | null> {
  if (!dbConn) return null;
  const r = await dbConn.query(
    'SELECT * FROM customers WHERE birthday=? AND LOWER(last_name)=LOWER(?) LIMIT 1',
    [birthday, lastName]
  );
  return r.values?.length ? rowToCustomer(r.values[0]) : null;
}

export async function getMeta(k: string): Promise<string | null> {
  if (!dbConn) return null;
  const r = await dbConn.query('SELECT v FROM meta WHERE k=?', [k]);
  return r.values?.length ? r.values[0].v : null;
}
export async function setMeta(k: string, v: string): Promise<void> {
  if (!dbConn) return;
  await dbConn.run('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)', [k, v]);
}
