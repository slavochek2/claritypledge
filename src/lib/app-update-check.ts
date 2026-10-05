/**
 * @file app-update-check.ts
 * @description P1416: is a newer build live than the one this page is running — and when to ask.
 *
 * An installed PWA resumed from the background makes no navigation, so the browser never re-checks
 * `sw.js` and P838's NetworkOnly navigation never gets a chance to load the new shell: the page
 * keeps running the JS of its last cold start. The generated `registerSW.js` only registers.
 *
 * "Update available" is decided by comparing BUILDS, not by watching the service worker. At a cold
 * start after a deploy the page already loaded the new shell from the network, and the browser's
 * own update check swaps the worker a moment later — a worker change alone would prompt a page
 * that is already current. The live build is read from a `no-store` fetch of `/?__app_update=…`;
 * like `isAppServerReachable` (reachability.ts), no service-worker rule matches that request, so it
 * really goes to the network.
 *
 * What is compared is the app fingerprint, `<meta name="app-build">`, stamped by the build
 * (src/pwa/app-build-fingerprint.ts) over the files that change what users run. Not the entry
 * chunk: every deploy rehashes it (the Sentry release id is baked in), and most deploys are docs,
 * skills or tests only. The entry module (`/assets/index-<hash>.js`) is the fallback when either
 * side has no fingerprint (a shell built before it existed). Anything doubtful —
 * offline, a failed request, a shell with no `/assets/` entry (a captive portal's page) — is
 * "can't tell" and never prompts: a missed prompt costs one more check, a wrong one offers a reload
 * that loads nothing new. "Can't tell" also does not count against the throttle, so a resume that
 * caught the radio still waking up is retried on the next trigger instead of a minute later.
 */

/** Minimum gap between checks triggered by resume / the interval. App switching is frequent. */
export const APP_UPDATE_MIN_GAP_MS = 60_000;
/** While the app stays in the foreground, check this often. */
export const APP_UPDATE_POLL_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
/** Must equal APP_BUILD_META_NAME in src/pwa/app-build-fingerprint.ts (asserted by test). */
export const APP_BUILD_META_NAME = 'app-build';

/** The built entry: the module script under /assets/ — not merely the first module script. */
function entryScriptOf(doc: Document): string | null {
  for (const el of doc.querySelectorAll('script[type="module"][src]')) {
    try {
      const path = new URL(el.getAttribute('src') ?? '', window.location.origin).pathname;
      if (path.startsWith('/assets/')) return path;
    } catch {
      // not a URL — keep looking
    }
  }
  return null;
}

function fingerprintOf(doc: Document): string | null {
  return doc.querySelector(`meta[name="${APP_BUILD_META_NAME}"]`)?.getAttribute('content') || null;
}

interface BuildId {
  fingerprint: string | null;
  entry: string | null;
}

function buildIdOf(doc: Document): BuildId {
  return { fingerprint: fingerprintOf(doc), entry: entryScriptOf(doc) };
}

/** The built entry module a shell (`index.html` text) loads, or null. */
export function shellEntryScript(html: string): string | null {
  try {
    return entryScriptOf(new DOMParser().parseFromString(html, 'text/html'));
  } catch {
    return null;
  }
}

/** The shell the server serves right now, parsed, or null on any failure. */
async function fetchLiveShell(timeoutMs = FETCH_TIMEOUT_MS): Promise<Document | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/?__app_update=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** true / false when the builds were compared; null when it could not tell (offline, failed fetch). */
export async function isNewerBuildLive(): Promise<boolean | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const running = buildIdOf(document);
  if (!running.entry) return false; // not a built page (dev server)
  const shell = await fetchLiveShell();
  if (!shell) return null;
  const live = buildIdOf(shell);
  if (running.fingerprint && live.fingerprint) return live.fingerprint !== running.fingerprint;
  if (!live.entry) return null; // not our shell (captive portal, error page)
  return live.entry !== running.entry;
}

export interface AppUpdateWatcherOptions {
  /** Called when a newer build is live; called again on later online resumes (it may have been dismissed). */
  onUpdateAvailable: () => void;
  /** Called when an offer must go away: the connection dropped, or the server no longer has a newer build. */
  onUpdateHidden?: () => void;
  minGapMs?: number;
  pollMs?: number;
  /** Injectable for tests. */
  checkForNewerBuild?: () => Promise<boolean | null>;
}

type Trigger = 'resume' | 'poll' | 'online' | 'controllerchange';

/**
 * Checks on resume (`visibilitychange` → visible, plus `pageshow` / `focus` while visible, which is
 * what an iOS standalone app reliably fires), throttled; periodically while visible; when the
 * connection returns; and when a new service worker takes control. Each check also asks the service
 * worker to update, which keeps the offline shell current, whether or not an update is pending.
 *
 * A pending update is revalidated like any other check: if the server no longer has a newer build
 * (a rollback), it is withdrawn. Inside the throttle gap a resume re-offers it from memory. Never
 * reloads — the caller offers a reload and only a user tap performs it. Returns a stop function.
 */
export function startAppUpdateWatcher({
  onUpdateAvailable,
  onUpdateHidden,
  minGapMs = APP_UPDATE_MIN_GAP_MS,
  pollMs = APP_UPDATE_POLL_MS,
  checkForNewerBuild = isNewerBuildLive,
}: AppUpdateWatcherOptions): () => void {
  let stopped = false;
  let inFlight = false;
  let pending = false;
  let lastCheckAt = Number.NEGATIVE_INFINITY;

  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

  const askServiceWorkerToUpdate = () => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    void sw
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {});
  };

  const run = async (trigger: Trigger) => {
    // Never offer offline: the tap would boot the precached shell, not the new build.
    if (stopped || isOffline()) return;
    const throttled = trigger === 'resume' || trigger === 'poll';
    if (throttled && Date.now() - lastCheckAt < minGapMs) {
      // The user may have swiped it away or let it time out: re-offer from memory, no fetch.
      if (pending && trigger === 'resume') onUpdateAvailable();
      return;
    }
    if (inFlight) return;
    inFlight = true;
    askServiceWorkerToUpdate();
    try {
      const wasPending = pending;
      const newer = await checkForNewerBuild();
      if (stopped || newer === null) return;
      lastCheckAt = Date.now();
      if (newer) {
        pending = true;
        // The connection may have dropped while the request was out; a poll never re-offers.
        if (!isOffline() && !(trigger === 'poll' && wasPending)) onUpdateAvailable();
      } else if (pending) {
        pending = false;
        onUpdateHidden?.();
      }
    } catch {
      // A throwing check is "can't tell".
    } finally {
      inFlight = false;
    }
  };

  const onResumeSignal = () => {
    if (document.visibilityState === 'visible') void run('resume');
  };
  const onOnline = () => void run('online');
  const onOffline = () => {
    if (pending) onUpdateHidden?.();
  };
  const onControllerChange = () => void run('controllerchange');
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') void run('poll');
  }, pollMs);

  document.addEventListener('visibilitychange', onResumeSignal);
  window.addEventListener('pageshow', onResumeSignal);
  window.addEventListener('focus', onResumeSignal);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  sw?.addEventListener('controllerchange', onControllerChange);

  return () => {
    stopped = true;
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onResumeSignal);
    window.removeEventListener('pageshow', onResumeSignal);
    window.removeEventListener('focus', onResumeSignal);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    sw?.removeEventListener('controllerchange', onControllerChange);
  };
}
