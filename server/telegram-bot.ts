import axios from "axios";
import { storage } from "./storage";
import type { UptimeStats } from "./storage";
import { sendStatusScreenshot, pingAllDomains } from "./monitor";

const TELEGRAM_BOT_TOKEN = "8773464472:AAFSMhGxe297dFxQJzWqgt8V8sXiUTjIGiE";
const TELEGRAM_CHAT_ID = "7419898167";
const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const DOMAINS = [
  "www.b35jtlxp.com",
  "www.sfbnvfn2trk.com",
  "www.shhefm9trk.com",
  "www.shhqmbf1trk.com",
  "www.ua9o7uoa.com",
];

let lastUpdateId = 0;

async function sendMessage(chatId: string | number, text: string) {
  await axios.post(`${BASE_URL}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  }, { timeout: 10000 }).catch(console.error);
}

async function handleCommand(text: string, chatId: number) {
  const cmd = text.split(" ")[0].toLowerCase().replace(`@wildbearads_bot`, "");

  if (cmd === "/screenshot" || cmd === "/snap") {
    await sendMessage(chatId, "📸 Capturing dashboard screenshot, please wait…");
    await sendStatusScreenshot();
  } else if (cmd === "/status") {
    const lines = DOMAINS.map((d) => {
      const last = storage.getLastCheck(d);
      const emoji = last?.status === "up" ? "🟢" : "🔴";
      const rt = last?.responseTime != null ? `${last.responseTime}ms` : "—";
      const code = last?.statusCode ?? "—";
      const stats = storage.getUptimeStats(d, 24);
      return `${emoji} <b>${d}</b>\n   ↳ ${rt} | HTTP ${code} | ${stats.uptime}% uptime (24h)`;
    });
    const ts = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
    await sendMessage(chatId,
      `📊 <b>WildBear Ads — Live Status</b>\n🕐 ${ts} AEST\n\n` + lines.join("\n\n")
    );
  } else if (cmd === "/ping") {
    await sendMessage(chatId, "🔄 Pinging all domains now…");
    await pingAllDomains();
    const lines = DOMAINS.map((d) => {
      const last = storage.getLastCheck(d);
      const emoji = last?.status === "up" ? "🟢" : "🔴";
      const rt = last?.responseTime != null ? `${last.responseTime}ms` : "—";
      return `${emoji} ${d} — ${rt}`;
    });
    const ts = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
    await sendMessage(chatId,
      `✅ <b>Ping complete</b> — ${ts} AEST\n\n` + lines.join("\n")
    );
  } else if (cmd === "/help" || cmd === "/start") {
    await sendMessage(chatId,
      `🤖 <b>WildBear Ads Uptime Bot</b>\n\n` +
      `Available commands:\n\n` +
      `/screenshot — Send a fresh dashboard screenshot\n` +
      `/status — Show live status of all 5 domains\n` +
      `/ping — Ping all domains right now\n` +
      `/help — Show this message\n\n` +
      `📡 Auto-reports every 30 minutes\n` +
      `⚡ Outage alerts sent instantly`
    );
  }
}

async function pollUpdates() {
  try {
    const res = await axios.get(`${BASE_URL}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 30, allowed_updates: ["message"] },
      timeout: 35000,
    });

    const updates = res.data.result ?? [];
    for (const update of updates) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;

      // Only respond to the authorised chat
      if (String(msg.chat.id) !== TELEGRAM_CHAT_ID) {
        await sendMessage(msg.chat.id, "⛔ Unauthorised.");
        continue;
      }

      if (msg.text.startsWith("/")) {
        await handleCommand(msg.text, msg.chat.id);
      }
    }
  } catch (err: any) {
    // Ignore timeout errors (normal for long-polling)
    if (err?.code !== "ECONNABORTED") {
      console.error("[bot] Poll error:", err?.message);
    }
  }
}

export async function registerBotCommands() {
  try {
    await axios.post(`${BASE_URL}/setMyCommands`, {
      commands: [
        { command: "screenshot", description: "Send a fresh dashboard screenshot" },
        { command: "status", description: "Show live status of all 5 domains" },
        { command: "ping", description: "Ping all domains right now" },
        { command: "help", description: "Show available commands" },
      ],
    });
    console.log("[bot] Commands registered with Telegram");
  } catch (err) {
    console.error("[bot] Failed to register commands:", err);
  }
}

export function startBotPolling() {
  console.log("[bot] Starting Telegram bot long-polling…");

  // Poll continuously
  const poll = async () => {
    await pollUpdates();
    setImmediate(poll); // immediately restart — no fixed delay, long-polling handles waits
  };

  poll().catch(console.error);
}
