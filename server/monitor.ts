import axios from "axios";
import cron from "node-cron";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";
import FormData from "form-data";

const DOMAINS = [
  "www.b35jtlxp.com",
  "www.sfbnvfn2trk.com",
  "www.shhefm9trk.com",
  "www.shhqmbf1trk.com",
  "www.ua9o7uoa.com",
];

const TELEGRAM_BOT_TOKEN = "8773464472:AAFSMhGxe297dFxQJzWqgt8V8sXiUTjIGiE";
const TELEGRAM_CHAT_ID = "7419898167";
const TIMEOUT_MS = 15000;
const SCREENSHOT_PATH = path.resolve("dashboard-screenshot.png");

const lastStatusMap = new Map<string, "up" | "down">();

async function sendTelegram(message: string) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" },
      { timeout: 10000 }
    );
  } catch (err) {
    console.error("[monitor] Telegram message error:", err);
  }
}

async function sendTelegramPhoto(photoPath: string, caption: string) {
  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    form.append("photo", fs.createReadStream(photoPath));
    form.append("caption", caption);
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      form,
      { headers: form.getHeaders(), timeout: 30000 }
    );
    console.log("[monitor] Telegram screenshot sent");
  } catch (err) {
    console.error("[monitor] Telegram photo error:", err);
  }
}

async function captureDashboardScreenshot(): Promise<boolean> {
  try {
    // Use Playwright if available (local), otherwise skip screenshot on Render free tier
    const { chromium } = await import("playwright").catch(() => ({ chromium: null }));
    if (!chromium) {
      console.log("[monitor] Playwright not available — skipping screenshot");
      return false;
    }
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5000", { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForSelector('[data-testid="domain-grid"]', { timeout: 10000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SCREENSHOT_PATH, type: "png" });
    await context.close();
    await browser.close();
    console.log("[monitor] Dashboard screenshot captured");
    return true;
  } catch (err) {
    console.error("[monitor] Screenshot error:", err);
    return false;
  }
}

async function pingDomain(domain: string): Promise<void> {
  const url = `https://${domain}`;
  const start = Date.now();
  let status: "up" | "down" = "down";
  let responseTime: number | null = null;
  let statusCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
      headers: { "User-Agent": "UptimeMonitor/1.0" },
    });
    responseTime = Date.now() - start;
    statusCode = res.status;
    status = res.status < 400 ? "up" : "down";
    if (status === "down") errorMessage = `HTTP ${res.status}`;
  } catch (err: any) {
    responseTime = Date.now() - start;
    errorMessage = err?.code || err?.message || "Unknown error";
    status = "down";
  }

  storage.insertPingCheck({
    domain,
    timestamp: Date.now(),
    status,
    responseTime: responseTime ?? undefined,
    statusCode: statusCode ?? undefined,
    errorMessage: errorMessage ?? undefined,
  });

  console.log(`[monitor] ${domain} — ${status.toUpperCase()} (${responseTime}ms) ${statusCode ?? errorMessage ?? ""}`);

  const ts = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
  const prev = lastStatusMap.get(domain);

  // Telegram alert on status change
  if (prev !== undefined && prev !== status) {
    if (status === "down") {
      await sendTelegram(
        `🔴 <b>OUTAGE DETECTED</b>\n\n` +
        `<b>Domain:</b> ${domain}\n` +
        `<b>Time:</b> ${ts} AEST\n` +
        `<b>Error:</b> ${errorMessage ?? `HTTP ${statusCode}`}\n\n` +
        `⚠️ Site is <b>DOWN</b>. Monitoring every 5 minutes.`
      );
    } else {
      await sendTelegram(
        `✅ <b>SITE RECOVERED</b>\n\n` +
        `<b>Domain:</b> ${domain}\n` +
        `<b>Time:</b> ${ts} AEST\n` +
        `<b>Response:</b> ${responseTime}ms | HTTP ${statusCode}\n\n` +
        `🟢 Site is back <b>ONLINE</b>.`
      );
    }
  } else if (prev === undefined && status === "down") {
    await sendTelegram(
      `🔴 <b>SITE IS DOWN</b>\n\n` +
      `<b>Domain:</b> ${domain}\n` +
      `<b>Time:</b> ${ts} AEST\n` +
      `<b>Error:</b> ${errorMessage ?? `HTTP ${statusCode}`}`
    );
  }

  lastStatusMap.set(domain, status);
}

export async function pingAllDomains(): Promise<void> {
  await Promise.all(DOMAINS.map((d) => pingDomain(d)));
}

export async function sendStatusScreenshot(): Promise<void> {
  const ts = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
  const lines = DOMAINS.map((d) => {
    const last = storage.getLastCheck(d);
    const emoji = last?.status === "up" ? "🟢" : "🔴";
    const rt = last?.responseTime != null ? `${last.responseTime}ms` : "—";
    const stats = storage.getUptimeStats(d, 24);
    return `${emoji} ${d} — ${rt} | ${stats.uptime}% uptime`;
  });

  const caption =
    `📊 WildBear Ads — Domain Status Report\n` +
    `🕐 ${ts} AEST\n\n` +
    lines.join("\n");

  const screenshotOk = await captureDashboardScreenshot();
  if (screenshotOk) {
    await sendTelegramPhoto(SCREENSHOT_PATH, caption);
  }
}

export function startMonitor() {
  console.log("[monitor] Starting multi-domain monitor for", DOMAINS.length, "domains");

  // Initial ping + screenshot on startup
  pingAllDomains().then(() => sendStatusScreenshot()).catch(console.error);

  // Ping every 5 minutes (health checks + outage alerts)
  cron.schedule("*/5 * * * *", () => {
    pingAllDomains().catch(console.error);
  });

  // Screenshot to Telegram every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    sendStatusScreenshot().catch(console.error);
  });

  console.log("[monitor] Scheduled — pings every 5min, screenshots every 30min");
}
