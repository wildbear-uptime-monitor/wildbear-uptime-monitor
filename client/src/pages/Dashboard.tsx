import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PingCheck {
  id: number;
  domain: string;
  timestamp: number;
  status: "up" | "down";
  responseTime: number | null;
  statusCode: number | null;
  errorMessage: string | null;
}

interface UptimeStats {
  uptime: number;
  totalChecks: number;
  downChecks: number;
  avgResponseTime: number | null;
}

interface DomainSummary {
  domain: string;
  last: PingCheck | null;
  stats24h: UptimeStats;
  stats7d: UptimeStats;
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <svg aria-label="WildBear Uptime Monitor" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="34" height="34">
      <rect width="40" height="40" rx="8" fill="currentColor" className="text-green-500" opacity="0.15"/>
      <path d="M8 26 Q14 14 20 20 Q26 26 32 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"/>
      <circle cx="20" cy="20" r="3" fill="currentColor" className="text-green-400"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: number) { return format(new Date(ts), "HH:mm"); }
function formatDate(ts: number) { return format(new Date(ts), "dd MMM HH:mm"); }

function uptimeColor(u: number) {
  if (u >= 99) return "text-green-400";
  if (u >= 95) return "text-yellow-400";
  return "text-red-400";
}

// ─── Uptime bar (last 48 checks per domain) ───────────────────────────────────

function UptimeBar({ checks }: { checks: PingCheck[] }) {
  const sorted = [...checks].reverse().slice(0, 48);
  const filled = [...sorted].reverse();
  return (
    <div className="flex gap-[2px] items-end h-6">
      {Array.from({ length: 48 }).map((_, i) => {
        const check = filled[i - (48 - filled.length)];
        if (!check) return <div key={i} className="flex-1 h-6 rounded-sm bg-border opacity-20" />;
        return (
          <div
            key={check.id}
            className={`flex-1 h-6 rounded-sm ${check.status === "up" ? "bg-green-500" : "bg-red-500"}`}
            title={`${formatDate(check.timestamp)} — ${check.status.toUpperCase()}${check.responseTime ? ` (${check.responseTime}ms)` : ""}`}
          />
        );
      })}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-muted-foreground mb-1">{label}</div>
      <div className="font-mono font-semibold text-green-400">{payload[0]?.value}ms</div>
    </div>
  );
}

// ─── Domain Card ──────────────────────────────────────────────────────────────

function DomainCard({ summary }: { summary: DomainSummary }) {
  const { domain, last, stats24h, stats7d } = summary;
  const isUp = last?.status === "up";
  const [expanded, setExpanded] = useState(false);

  const { data: history } = useQuery<PingCheck[]>({
    queryKey: ["/api/history", domain],
    queryFn: () => apiRequest("GET", `/api/history/${encodeURIComponent(domain)}?hours=24`).then((r) => r.json()),
    refetchInterval: 30000,
    enabled: expanded,
  });

  const chartData = history
    ? [...history].reverse().map((c) => ({
        time: formatTs(c.timestamp),
        responseTime: c.status === "up" ? c.responseTime : null,
      }))
    : [];

  const { data: historyBar } = useQuery<PingCheck[]>({
    queryKey: ["/api/history/bar", domain],
    queryFn: () => apiRequest("GET", `/api/history/${encodeURIComponent(domain)}?hours=4`).then((r) => r.json()),
    refetchInterval: 30000,
  });

  return (
    <div
      className={`bg-card border rounded-xl overflow-hidden transition-colors ${
        isUp ? "border-green-500/20" : "border-red-500/40"
      }`}
      data-testid={`domain-card-${domain}`}
    >
      {/* Card Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Status dot */}
        <div className={`relative flex-shrink-0`}>
          <div className={`w-3 h-3 rounded-full ${isUp ? "bg-green-500" : "bg-red-500"}`} />
          {isUp && (
            <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-40" />
          )}
        </div>

        {/* Domain name */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-semibold text-foreground truncate">{domain}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {last ? `Checked ${formatDate(last.timestamp)}` : "Awaiting first check…"}
          </div>
        </div>

        {/* Status badge */}
        <div className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono flex-shrink-0 ${
          isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
        }`}>
          {isUp ? "UP" : "DOWN"}
        </div>

        {/* Response time */}
        <div className="text-right flex-shrink-0 hidden sm:block">
          <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {last?.responseTime != null ? `${last.responseTime}ms` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            HTTP {last?.statusCode ?? "—"}
          </div>
        </div>

        {/* Uptime 24h */}
        <div className="text-right flex-shrink-0 hidden md:block">
          <div className={`font-mono text-sm font-bold tabular-nums ${uptimeColor(stats24h.uptime)}`}>
            {stats24h.uptime}%
          </div>
          <div className="text-xs text-muted-foreground">24h uptime</div>
        </div>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Uptime bar (always visible) */}
      <div className="px-4 pb-3">
        {historyBar ? <UptimeBar checks={historyBar} /> : (
          <div className="h-6 bg-muted rounded animate-pulse" />
        )}
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>4h ago</span>
          <span>Now</span>
        </div>
      </div>

      {/* Expanded — response time chart + stats */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Uptime 24h", value: `${stats24h.uptime}%`, color: uptimeColor(stats24h.uptime) },
              { label: "Uptime 7d", value: `${stats7d.uptime}%`, color: uptimeColor(stats7d.uptime) },
              { label: "Avg Response", value: stats24h.avgResponseTime != null ? `${stats24h.avgResponseTime}ms` : "—", color: "text-foreground" },
              { label: "Incidents 24h", value: `${stats24h.downChecks}`, color: stats24h.downChecks > 0 ? "text-red-400" : "text-green-400" },
            ].map((s) => (
              <div key={s.label} className="bg-secondary/50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</div>
                <div className={`font-mono font-bold tabular-nums text-lg ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Response time chart */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">Response Time — last 24h</div>
            <div className="h-40">
              {history ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 16%)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(215 20% 55%)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(215 20% 55%)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} unit="ms" width={42} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="responseTime" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#22c55e" }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full bg-muted rounded animate-pulse" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Header ───────────────────────────────────────────────────────────

function SummaryHeader({ domains }: { domains: DomainSummary[] }) {
  const upCount = domains.filter((d) => d.last?.status === "up").length;
  const downCount = domains.length - upCount;
  const allUp = downCount === 0;

  return (
    <div className={`rounded-2xl border p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
      allUp ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
    }`} data-testid="summary-header">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`w-5 h-5 rounded-full ${allUp ? "bg-green-500" : "bg-red-500"}`} />
          {allUp && <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-40" />}
        </div>
        <div>
          <div className={`text-2xl font-bold font-mono ${allUp ? "text-green-400" : "text-red-400"}`}>
            {allUp ? "ALL SYSTEMS UP" : `${downCount} DOMAIN${downCount > 1 ? "S" : ""} DOWN`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {upCount} of {domains.length} domains operational
          </div>
        </div>
      </div>
      <div className="sm:ml-auto flex gap-4">
        <div className="text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Online</div>
          <div className="text-xl font-mono font-bold text-green-400">{upCount}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Offline</div>
          <div className="text-xl font-mono font-bold text-red-400">{downCount}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Total</div>
          <div className="text-xl font-mono font-bold text-foreground">{domains.length}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: domains, isLoading } = useQuery<DomainSummary[]>({
    queryKey: ["/api/domains"],
    queryFn: () => apiRequest("GET", "/api/domains").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const allUp = domains?.every((d) => d.last?.status === "up") ?? true;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-base font-semibold text-foreground leading-tight">WildBear Ads</h1>
            <p className="text-xs text-muted-foreground font-mono">Uptime Monitor — 5 Domains</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Auto-refresh every 30s
          </span>
          <div className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1">
            <span className={`w-2 h-2 rounded-full ${allUp ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
            <span className="text-xs font-medium text-muted-foreground">LIVE</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Summary */}
        {isLoading ? (
          <div className="h-28 bg-card border border-border rounded-2xl animate-pulse" />
        ) : domains ? (
          <SummaryHeader domains={domains} />
        ) : null}

        {/* Domain legend */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> Up</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> Down</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-border opacity-40 inline-block" /> No data</span>
          <span className="ml-auto">Click a domain to expand details</span>
        </div>

        {/* Domain cards */}
        <div className="space-y-3" data-testid="domain-grid">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
            ))
          ) : (
            domains?.map((summary) => (
              <DomainCard key={summary.domain} summary={summary} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pb-4 pt-2">
          <span>Pinging every 5 minutes · Telegram alerts active</span>
          <span className="font-mono">{format(new Date(), "dd MMM yyyy HH:mm")} AEST</span>
        </div>

      </main>
    </div>
  );
}
