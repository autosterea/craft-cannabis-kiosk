// Kiosk telemetry service — heartbeats fleet stats to the queue web app every 5 minutes.
// Best-effort, fail-silent: telemetry errors must never affect check-in workflow.

import { app } from 'electron';
import { randomUUID } from 'crypto';
import os from 'os';

interface DailyCounter {
  date: string;
  count: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

class CounterStore {
  private state: DailyCounter = { date: todayStr(), count: 0 };

  increment(): void {
    const today = todayStr();
    if (this.state.date !== today) {
      this.state = { date: today, count: 0 };
    }
    this.state.count += 1;
  }

  todayCount(): number {
    const today = todayStr();
    if (this.state.date !== today) {
      this.state = { date: today, count: 0 };
    }
    return this.state.count;
  }
}

export class TelemetryService {
  private kioskId: string;
  private endpoint: string;
  private secret: string;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private getVenueId: () => string | null;
  private getLastSync: () => { at: string | null; count: number | null };

  // Cumulative (all-time) check-ins handled in-memory; daily counters reset at midnight.
  public checkIns = new CounterStore();
  public failedScans = new CounterStore();
  public allTimeCheckIns = 0;

  constructor(opts: {
    kioskId: string;
    endpoint: string;
    secret: string;
    intervalMs?: number;
    getVenueId: () => string | null;
    getLastSync: () => { at: string | null; count: number | null };
    initialAllTimeCheckIns?: number;
  }) {
    this.kioskId = opts.kioskId;
    this.endpoint = opts.endpoint;
    this.secret = opts.secret;
    this.intervalMs = opts.intervalMs ?? 5 * 60 * 1000;
    this.getVenueId = opts.getVenueId;
    this.getLastSync = opts.getLastSync;
    this.allTimeCheckIns = opts.initialAllTimeCheckIns ?? 0;
  }

  start(): void {
    if (this.timer) return;
    // First heartbeat 30 seconds after boot, then every interval
    setTimeout(() => this.send().catch(() => {}), 30_000);
    this.timer = setInterval(() => this.send().catch(() => {}), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  recordCheckIn(): void {
    this.checkIns.increment();
    this.allTimeCheckIns += 1;
  }

  recordFailedScan(): void {
    this.failedScans.increment();
  }

  async send(): Promise<void> {
    if (!this.endpoint || !this.secret) return;
    const venueId = this.getVenueId();
    if (!venueId) return; // Don't heartbeat until a venue is selected
    const lastSync = this.getLastSync();

    const payload = {
      kioskId: this.kioskId,
      venueId,
      hostname: os.hostname(),
      appVersion: app.getVersion(),
      osInfo: `${os.type()} ${os.release()}`,
      checkInsToday: this.checkIns.todayCount(),
      checkInsAllTime: this.allTimeCheckIns,
      failedScansToday: this.failedScans.todayCount(),
      lastSyncAt: lastSync.at,
      lastSyncCustomerCount: lastSync.count,
    };

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Secret': this.secret,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[telemetry] heartbeat failed: ${res.status}`);
      }
    } catch (e: any) {
      console.warn(`[telemetry] heartbeat error: ${e.message}`);
    }
  }
}

// Generate or load a stable per-kiosk UUID (called once during app init)
export function getOrCreateKioskId(store: { get: (k: string) => unknown; set: (k: string, v: unknown) => void }): string {
  const existing = store.get('kioskId') as string | undefined;
  if (existing && typeof existing === 'string' && existing.length > 0) return existing;
  const fresh = randomUUID();
  store.set('kioskId', fresh);
  return fresh;
}
