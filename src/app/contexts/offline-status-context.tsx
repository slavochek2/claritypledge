/**
 * @file offline-status-context.tsx
 * @description P1369: the one place the offline strip and the session bars learn "offline".
 *
 * Two inputs, deliberately separate:
 *
 *   1. PAGE REPORTS. A page that rendered from the offline read cache reports `cached` with the
 *      `storedAt` of that data; a page that could not load reports `needs-connection`. The strip
 *      shows the OLDEST cached age across the reports and never infers staleness itself — the
 *      invariant is "cached data is never shown as current", and only the page knows what it
 *      rendered from.
 *   2. CONNECTIVITY — `navigator.onLine`, OR the last request to Supabase failed
 *      (network-outcome.ts). Used by the session bars, /ready and /meet, and to show a bare
 *      "Offline" strip. Captive portals report online, so the request outcome counts too.
 *
 * `reconnectTick` bumps when connectivity comes back (the browser's `online` event, or the
 * first successful Supabase response after a failure). Pages that show cached data or the
 * needs-connection body re-read on it, which is what makes the strip disappear "once back
 * online and the page has refreshed". While unreachable, a light probe checks Supabase every
 * 20 s so that a captive-portal recovery (no `online` event) is noticed too.
 */
/* eslint-disable react-refresh/only-export-components -- provider + its hooks and copy live together */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  isSupabaseUnreachable,
  recordNetworkFailure,
  recordNetworkSuccess,
  subscribeNetworkOutcome,
} from '@/lib/network-outcome';
import { formatSeenAge } from '@/lib/format-seen-age';

/** `slow`: the copy is on screen because the network was slow, not because a request failed
 * (P1337) — the page replaces it when the late answer arrives. */
export type OfflinePageReport = { kind: 'cached'; storedAt: number; slow?: boolean } | { kind: 'needs-connection' };

interface OfflineStatusValue {
  reports: ReadonlyMap<number, OfflinePageReport>;
  setReport: (id: number, report: OfflinePageReport | null) => void;
  offline: boolean;
  reconnectTick: number;
}

const OfflineStatusContext = createContext<OfflineStatusValue | null>(null);

/** Copy — UI Contract. [FOUNDER DECISION: copy — PROPOSED] */
export const STRIP_OFFLINE_TEXT = 'Offline';
/** [FOUNDER DECISION 2026-09-30] "Offline · saved copy from {age}"; under a minute: "Offline · saved copy". */
/** A saved copy shown because the network is slow, not down (P1337): never called offline. */
export const STRIP_SLOW_TEXT = 'Saved copy · updating…';
export const stripCachedText = (age: string) => (age === 'just now' ? 'Offline · saved copy' : `Offline · saved copy from ${age}`);

const PROBE_INTERVAL_MS = 20_000;
/** A reconnect within this long of the previous one means the refresh it caused failed again. */
const RECONNECT_RECOVERY_WINDOW_MS = 30_000;
/** Refresh delay after such a repeat: doubles from the base up to the max; resets once stable. */
const RECONNECT_BACKOFF_BASE_MS = 2_000;
const RECONNECT_BACKOFF_MAX_MS = 60_000;

function useNavigatorOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
    () => true,
  );
}

function useSupabaseUnreachable(): boolean {
  return useSyncExternalStore(subscribeNetworkOutcome, isSupabaseUnreachable, () => false);
}

const PROBE_TIMEOUT_MS = 8_000;

/**
 * One request that answers "can Supabase be reached?"; any HTTP response means yes. Exported for
 * P1420: a write blocked only by an earlier failure probes first instead of refusing outright. Bounded: on a
 * network that hangs instead of failing, no answer in time is a "no" (and the next probe asks again).
 */
/** P1420: after a failed probe, callers within this window reuse its answer instead of asking again. */
export const PROBE_FAILURE_COOLDOWN_MS = 2_000;
let probeInFlight: Promise<boolean> | null = null;
let lastProbeFailedAt = 0;

export function probeSupabase(timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  // One shared probe: several writes (or the 20s timer) asking at once send ONE request.
  if (probeInFlight) return probeInFlight;
  if (lastProbeFailedAt && Date.now() - lastProbeFailedAt < PROBE_FAILURE_COOLDOWN_MS) return Promise.resolve(false);
  const probe = runProbe(timeoutMs).then((ok) => {
    lastProbeFailedAt = ok ? 0 : Date.now();
    return ok;
  });
  probeInFlight = probe.finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

/** Test-only. */
export function _resetProbeForTesting(): void {
  probeInFlight = null;
  lastProbeFailedAt = 0;
}

async function runProbe(timeoutMs: number): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, { cache: 'no-store', signal: controller.signal });
    recordNetworkSuccess();
    return true;
  } catch {
    recordNetworkFailure();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function OfflineStatusProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<ReadonlyMap<number, OfflinePageReport>>(new Map());
  const navigatorOnline = useNavigatorOnline();
  const supabaseUnreachable = useSupabaseUnreachable();
  const offline = !navigatorOnline || supabaseUnreachable;
  const [reconnectTick, setReconnectTick] = useState(0);

  // Reconnect: offline → online, by either signal. Edge-triggered, and backed off while the
  // connection keeps dropping again right after a reconnect (the re-read it caused failed again):
  // a persistently failing request must not turn every reconnect into an immediate re-read.
  const wasOffline = useRef(offline);
  const lastTickAt = useRef(0);
  const backoffMs = useRef(0);
  const pendingTick = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (offline && pendingTick.current) {
      // Dropped again before the refresh was due: the next reconnect schedules a new one.
      clearTimeout(pendingTick.current);
      pendingTick.current = null;
    }
    if (wasOffline.current && !offline && !pendingTick.current) {
      const now = Date.now();
      backoffMs.current =
        lastTickAt.current && now - lastTickAt.current < RECONNECT_RECOVERY_WINDOW_MS
          ? Math.min(Math.max(backoffMs.current * 2, RECONNECT_BACKOFF_BASE_MS), RECONNECT_BACKOFF_MAX_MS)
          : 0;
      pendingTick.current = setTimeout(() => {
        pendingTick.current = null;
        lastTickAt.current = Date.now();
        setReconnectTick((t) => t + 1);
      }, backoffMs.current);
    }
    wasOffline.current = offline;
  }, [offline]);
  useEffect(() => () => {
    if (pendingTick.current) clearTimeout(pendingTick.current);
  }, []);

  // The browser says we are back: check Supabase right away rather than waiting for a page.
  useEffect(() => {
    const onOnline = () => {
      if (isSupabaseUnreachable()) void probeSupabase();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // While unreachable (and the browser thinks it is online), probe now and then.
  useEffect(() => {
    if (!supabaseUnreachable || !navigatorOnline) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void probeSupabase();
    }, PROBE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [supabaseUnreachable, navigatorOnline]);

  const setReport = useCallback((id: number, report: OfflinePageReport | null) => {
    setReports((prev) => {
      const current = prev.get(id);
      if (report === null ? current === undefined : sameReport(current, report)) return prev;
      const next = new Map(prev);
      if (report === null) next.delete(id);
      else next.set(id, report);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ reports, setReport, offline, reconnectTick }),
    [reports, setReport, offline, reconnectTick],
  );
  return <OfflineStatusContext.Provider value={value}>{children}</OfflineStatusContext.Provider>;
}

function sameReport(a: OfflinePageReport | undefined, b: OfflinePageReport): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind !== 'cached' || b.kind !== 'cached') return true;
  return a.storedAt === b.storedAt && !!a.slow === !!b.slow;
}

/** Outside the provider (isolated component tests): online, nothing reported. */
const FALLBACK: OfflineStatusValue = {
  reports: new Map(),
  setReport: () => {},
  offline: false,
  reconnectTick: 0,
};

function useOfflineStatus(): OfflineStatusValue {
  return useContext(OfflineStatusContext) ?? FALLBACK;
}

let nextReporterId = 1;

/**
 * A page says what it rendered: `cached` (with its data's `storedAt`), `needs-connection`, or
 * null for live data. Cleared when the page unmounts.
 */
export function useOfflinePageReport(report: OfflinePageReport | null): void {
  const { setReport } = useOfflineStatus();
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextReporterId++;
  const kind = report?.kind ?? null;
  const storedAt = report?.kind === 'cached' ? report.storedAt : null;
  const slow = report?.kind === 'cached' && !!report.slow;
  useEffect(() => {
    const id = idRef.current;
    setReport(id, kind === null ? null : kind === 'cached' ? { kind, storedAt: storedAt as number, slow } : { kind });
  }, [kind, storedAt, slow, setReport]);
  useEffect(() => {
    const id = idRef.current;
    return () => setReport(id, null);
  }, [setReport]);
}

/** Connectivity for components that cannot work offline (session bars, /ready, /meet). */
export function useConnectivity(): { offline: boolean; reconnectTick: number } {
  const { offline, reconnectTick } = useOfflineStatus();
  return { offline, reconnectTick };
}

/** Re-render every minute so "5 min ago" stays true while the strip is up. */
function useMinuteClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** What the strip says, or null when it is hidden. */
export function useOfflineStripText(): string | null {
  const { reports, offline } = useOfflineStatus();
  let oldestCached: number | null = null;
  let needsConnection = false;
  let allSlow = true;
  for (const r of reports.values()) {
    if (r.kind === 'cached') {
      oldestCached = oldestCached === null ? r.storedAt : Math.min(oldestCached, r.storedAt);
      if (!r.slow) allSlow = false;
    } else needsConnection = true;
  }
  const now = useMinuteClock(oldestCached !== null);
  // P1337: slow is not offline. Only when every copy on screen is there for slowness, and no
  // request is failing right now, does the strip say so instead of "Offline".
  if (oldestCached !== null) return allSlow && !offline ? STRIP_SLOW_TEXT : stripCachedText(formatSeenAge(oldestCached, now));
  if (needsConnection || offline) return STRIP_OFFLINE_TEXT;
  return null;
}

/** True while the strip is on screen — for chrome that must make room for it (the fixed nav). */
export function useOfflineStripShown(): boolean {
  return useOfflineStripText() !== null;
}
