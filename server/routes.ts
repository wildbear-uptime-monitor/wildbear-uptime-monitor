import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { startMonitor } from "./monitor";
import { startBotPolling, registerBotCommands } from "./telegram-bot";

const DOMAINS = [
  "www.b35jtlxp.com",
  "www.sfbnvfn2trk.com",
  "www.shhefm9trk.com",
  "www.shhqmbf1trk.com",
  "www.ua9o7uoa.com",
];

export function registerRoutes(httpServer: Server, app: Express) {
  startMonitor();
  registerBotCommands();
  startBotPolling();

  // GET /api/domains — all domain summaries
  app.get("/api/domains", (_req, res) => {
    const result = DOMAINS.map((domain) => {
      const last = storage.getLastCheck(domain);
      const stats24h = storage.getUptimeStats(domain, 24);
      const stats7d = storage.getUptimeStats(domain, 168);
      return { domain, last: last ?? null, stats24h, stats7d };
    });
    res.json(result);
  });

  // GET /api/history/:domain?hours=24
  app.get("/api/history/:domain", (req, res) => {
    const domain = decodeURIComponent(req.params.domain);
    const hours = Math.min(Math.max(parseInt((req.query.hours as string) || "24", 10), 1), 720);
    const checks = storage.getRecentChecks(domain, hours);
    res.json(checks);
  });

  // POST /api/ping — manual trigger
  app.post("/api/ping", async (_req, res) => {
    const { pingAllDomains } = await import("./monitor");
    await pingAllDomains();
    res.json({ ok: true });
  });
}
