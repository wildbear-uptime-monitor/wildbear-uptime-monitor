import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { pingChecks, type PingCheck, type InsertPingCheck } from "@shared/schema";
import { desc, gte, eq, and } from "drizzle-orm";

const sqlite = new Database("uptime.db");
const db = drizzle(sqlite);

// Migrate — add domain column if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS ping_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL DEFAULT 'legacy',
    timestamp INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('up','down')),
    response_time INTEGER,
    status_code INTEGER,
    error_message TEXT
  )
`);
// Add domain column to old tables that don't have it
try {
  sqlite.exec(`ALTER TABLE ping_checks ADD COLUMN domain TEXT NOT NULL DEFAULT 'legacy'`);
} catch (_) { /* column already exists */ }

export interface UptimeStats {
  uptime: number;
  totalChecks: number;
  downChecks: number;
  avgResponseTime: number | null;
}

export interface IStorage {
  insertPingCheck(check: InsertPingCheck): PingCheck;
  getRecentChecks(domain: string, limitHours?: number): PingCheck[];
  getLastCheck(domain: string): PingCheck | undefined;
  getUptimeStats(domain: string, hours: number): UptimeStats;
  getAllDomainLastChecks(): PingCheck[];
}

export const storage: IStorage = {
  insertPingCheck(check: InsertPingCheck): PingCheck {
    return db.insert(pingChecks).values(check).returning().get();
  },

  getRecentChecks(domain: string, limitHours = 24): PingCheck[] {
    const since = Date.now() - limitHours * 60 * 60 * 1000;
    return db
      .select()
      .from(pingChecks)
      .where(and(eq(pingChecks.domain, domain), gte(pingChecks.timestamp, since)))
      .orderBy(desc(pingChecks.timestamp))
      .all();
  },

  getLastCheck(domain: string): PingCheck | undefined {
    return db
      .select()
      .from(pingChecks)
      .where(eq(pingChecks.domain, domain))
      .orderBy(desc(pingChecks.timestamp))
      .limit(1)
      .get();
  },

  getAllDomainLastChecks(): PingCheck[] {
    // Get the most recent check per domain using a subquery approach
    const allRecent = db
      .select()
      .from(pingChecks)
      .orderBy(desc(pingChecks.timestamp))
      .all();
    const seen = new Set<string>();
    const result: PingCheck[] = [];
    for (const row of allRecent) {
      if (!seen.has(row.domain)) {
        seen.add(row.domain);
        result.push(row);
      }
    }
    return result;
  },

  getUptimeStats(domain: string, hours: number): UptimeStats {
    const since = Date.now() - hours * 60 * 60 * 1000;
    const checks = db
      .select()
      .from(pingChecks)
      .where(and(eq(pingChecks.domain, domain), gte(pingChecks.timestamp, since)))
      .all();

    const totalChecks = checks.length;
    const downChecks = checks.filter((c) => c.status === "down").length;
    const upChecks = totalChecks - downChecks;
    const uptime = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

    const responseTimes = checks
      .filter((c) => c.responseTime != null)
      .map((c) => c.responseTime as number);
    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

    return {
      uptime: Math.round(uptime * 100) / 100,
      totalChecks,
      downChecks,
      avgResponseTime,
    };
  },
};
