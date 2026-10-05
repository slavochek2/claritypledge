/**
 * P1416: unit tests for src/lib/app-update-check.ts — when the watcher checks, how it decides a
 * newer build is live, and that it never re-fetches or reloads on its own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runtimeCaching, type RuntimeCachingRule } from '@/pwa/workbox-config';
import {
  startAppUpdateWatcher,
  shellEntryScript,
  isNewerBuildLive,
  APP_BUILD_META_NAME,
  APP_UPDATE_MIN_GAP_MS,
  APP_UPDATE_POLL_MS,
} from '@/lib/app-update-check';

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, writable: true, configurable: true });
}
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}
function fireVisible() {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
}

let swListeners: Record<string, EventListener[]>;
let update: ReturnType<typeof vi.fn>;

function installServiceWorker() {
  swListeners = {};
  update = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      getRegistration: vi.fn().mockResolvedValue({ update }),
      addEventListener: vi.fn((type: string, fn: EventListener) => {
        (swListeners[type] ??= []).push(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: EventListener) => {
        swListeners[type] = (swListeners[type] ?? []).filter((f) => f !== fn);
      }),
    },
  });
}

/** Let the watcher's awaited check settle under fake timers. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('startAppUpdateWatcher', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    setOnline(true);
    installServiceWorker();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it('does not check at start — the page just loaded the live shell', async () => {
    const check = vi.fn().mockResolvedValue(true);
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    await flush();
    expect(check).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('checks on resume and asks the service worker to update', async () => {
    const check = vi.fn().mockResolvedValue(false);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('ignores the hidden half of an app switch', async () => {
    const check = vi.fn().mockResolvedValue(false);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(check).not.toHaveBeenCalled();
  });

  it('throttles rapid resumes to one check per minimum gap', async () => {
    const check = vi.fn().mockResolvedValue(false);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    fireVisible();
    await flush();
    fireVisible();
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(APP_UPDATE_MIN_GAP_MS);
    fireVisible();
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('polls while visible, and not while hidden', async () => {
    const check = vi.fn().mockResolvedValue(false);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    vi.advanceTimersByTime(APP_UPDATE_POLL_MS);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    vi.advanceTimersByTime(APP_UPDATE_POLL_MS);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('checks when the connection returns and when a new worker takes control, unthrottled', async () => {
    const check = vi.fn().mockResolvedValue(false);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    fireVisible();
    await flush();
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(swListeners.controllerchange).toHaveLength(1);
    swListeners.controllerchange!.forEach((fn) => fn(new Event('controllerchange')));
    await flush();
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('never checks while offline', async () => {
    setOnline(false);
    const check = vi.fn().mockResolvedValue(true);
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    vi.advanceTimersByTime(APP_UPDATE_POLL_MS);
    await flush();
    expect(check).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('once found: a poll revalidates but never re-offers; a resume inside the gap re-offers from memory', async () => {
    const check = vi.fn().mockResolvedValue(true);
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(APP_UPDATE_POLL_MS);
    await flush();
    expect(check).toHaveBeenCalledTimes(2); // revalidated (review item 3)
    expect(onUpdate).toHaveBeenCalledTimes(1); // ...but a poll never re-offers
    fireVisible(); // within the throttle gap — re-offered from memory, no fetch
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('once found, does not re-offer while offline', async () => {
    const check = vi.fn().mockResolvedValue(true);
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    setOnline(false);
    fireVisible();
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("a check that could not tell does not use up the throttle — the next resume retries", async () => {
    const check = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(true);
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(onUpdate).not.toHaveBeenCalled();
    fireVisible(); // well within the minimum gap
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('stop() during an in-flight check suppresses the offer', async () => {
    let resolve!: (v: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const onUpdate = vi.fn();
    const stopNow = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    await flush();
    stopNow();
    resolve(true);
    await flush();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('treats a throwing check as no update', async () => {
    const check = vi.fn().mockRejectedValue(new Error('boom'));
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('does not start a second check while one is in flight', async () => {
    let resolve!: (v: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    fireVisible();
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    resolve(false);
    await flush();
  });

  it('stop() removes every listener and the interval', () => {
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const timersBefore = vi.getTimerCount();
    const stopNow = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: vi.fn() });
    expect(vi.getTimerCount()).toBe(timersBefore + 1);
    expect(swListeners.controllerchange).toHaveLength(1);
    stopNow();
    expect(vi.getTimerCount()).toBe(timersBefore);
    expect(docRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winRemove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(swListeners.controllerchange).toHaveLength(0);
    docRemove.mockRestore();
    winRemove.mockRestore();
  });
});

describe('review round: revalidation, offline, extra resume signals', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    setOnline(true);
    installServiceWorker();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it('item 3: a pending update that the server no longer has is cleared, and not offered again', async () => {
    const check = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const onUpdate = vi.fn();
    const onHidden = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, onUpdateHidden: onHidden, checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(APP_UPDATE_MIN_GAP_MS);
    fireVisible(); // past the gap: revalidate — the server now serves the running build (rollback)
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(onHidden).toHaveBeenCalledTimes(1);
    fireVisible(); // within the gap: nothing pending, nothing offered
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('item 3: the service worker is asked to update on every check, pending or not', async () => {
    const check = vi.fn().mockResolvedValue(true);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    fireVisible();
    await flush();
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(APP_UPDATE_MIN_GAP_MS);
    fireVisible();
    await flush();
    await flush();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("item 4: going offline hides a pending offer; coming back online offers it again", async () => {
    const check = vi.fn().mockResolvedValue(true);
    const onUpdate = vi.fn();
    const onHidden = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, onUpdateHidden: onHidden, checkForNewerBuild: check });
    fireVisible();
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(onHidden).toHaveBeenCalledTimes(1);
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('item 4: a check that answers after the connection dropped does not offer', async () => {
    let resolve!: (v: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const onUpdate = vi.fn();
    stop = startAppUpdateWatcher({ onUpdateAvailable: onUpdate, checkForNewerBuild: check });
    fireVisible();
    await flush();
    setOnline(false);
    resolve(true);
    await flush();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("item 6: 'pageshow' and 'focus' count as a resume — visible only, same throttle", async () => {
    const check = vi.fn().mockResolvedValue(false);
    stop = startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: check });
    setVisibility('hidden');
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(check).not.toHaveBeenCalled();
    setVisibility('visible');
    window.dispatchEvent(new Event('pageshow'));
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(APP_UPDATE_MIN_GAP_MS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('stop() also removes the pageshow, focus and offline listeners', () => {
    const winRemove = vi.spyOn(window, 'removeEventListener');
    startAppUpdateWatcher({ onUpdateAvailable: vi.fn(), checkForNewerBuild: vi.fn() })();
    for (const type of ['pageshow', 'focus', 'offline']) {
      expect(winRemove).toHaveBeenCalledWith(type, expect.any(Function));
    }
    winRemove.mockRestore();
  });
});

describe('shellEntryScript', () => {
  it('reads the entry module from a built index.html', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{}</script>
      <script type="text/javascript">window.x=1</script>
      <script type="module" crossorigin src="/assets/index-DUGwUkQF.js"></script>
      <script id="vite-plugin-pwa:register-sw" src="/registerSW.js" defer></script>
    </head><body></body></html>`;
    expect(shellEntryScript(html)).toBe('/assets/index-DUGwUkQF.js');
  });

  it('item 5: picks the /assets/ module script even when another module script comes first', () => {
    const html = `<head>
      <script type="module" src="https://cdn.example/widget.js"></script>
      <script type="module" crossorigin src="/assets/index-DUGwUkQF.js"></script>
    </head>`;
    expect(shellEntryScript(html)).toBe('/assets/index-DUGwUkQF.js');
  });

  it('returns null for a page with no built entry (captive portal, error page, dev shell)', () => {
    expect(shellEntryScript('<html><body>Sign in to Wi-Fi</body></html>')).toBeNull();
    expect(shellEntryScript('<script type="module" src="https://portal.example/app.js"></script>')).toBeNull();
    expect(shellEntryScript('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
  });
});

describe('isNewerBuildLive', () => {
  const RUNNING = '/assets/index-RUNNING1.js';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setOnline(true);
    document.head.querySelectorAll('script[data-p1416]').forEach((s) => s.remove());
    const s = document.createElement('script');
    s.type = 'module';
    s.setAttribute('src', RUNNING);
    s.setAttribute('data-p1416', '');
    document.head.appendChild(s);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const serve = (body: string, status = 200) =>
    fetchMock.mockResolvedValue(new Response(body, { status, headers: { 'content-type': 'text/html' } }));

  const metaShell = (build: string, entry: string) =>
    `<head><meta name="${APP_BUILD_META_NAME}" content="${build}"><script type="module" src="${entry}"></script></head>`;
  const setRunningBuild = (build: string | null) => {
    document.head.querySelectorAll(`meta[name="${APP_BUILD_META_NAME}"]`).forEach((m) => m.remove());
    if (build === null) return;
    const m = document.createElement('meta');
    m.name = APP_BUILD_META_NAME;
    m.content = build;
    document.head.appendChild(m);
  };

  it('item 1: same app fingerprint, different entry (a docs-only deploy) — not newer', async () => {
    setRunningBuild('aaaa1111aaaa1111');
    serve(metaShell('aaaa1111aaaa1111', '/assets/index-NEWBUILD.js'));
    expect(await isNewerBuildLive()).toBe(false);
    setRunningBuild(null);
  });

  it('item 1: different app fingerprint — newer, whatever the entry', async () => {
    setRunningBuild('aaaa1111aaaa1111');
    serve(metaShell('bbbb2222bbbb2222', RUNNING));
    expect(await isNewerBuildLive()).toBe(true);
    setRunningBuild(null);
  });

  it('item 1: fingerprint missing on either side — falls back to comparing entries', async () => {
    setRunningBuild(null);
    serve(metaShell('bbbb2222bbbb2222', '/assets/index-NEWBUILD.js'));
    expect(await isNewerBuildLive()).toBe(true);
    setRunningBuild('aaaa1111aaaa1111');
    serve(`<script type="module" src="${RUNNING}"></script>`);
    expect(await isNewerBuildLive()).toBe(false);
    setRunningBuild(null);
  });

  it('is true when the live shell names a different entry', async () => {
    serve('<script type="module" src="/assets/index-NEWBUILD.js"></script>');
    expect(await isNewerBuildLive()).toBe(true);
  });

  it('is false when the live shell names the running entry', async () => {
    serve(`<script type="module" src="${RUNNING}"></script>`);
    expect(await isNewerBuildLive()).toBe(false);
  });

  it("can't tell (null) on a non-OK response, a page without a built entry, or a failed request", async () => {
    serve('<script type="module" src="/assets/index-NEWBUILD.js"></script>', 503);
    expect(await isNewerBuildLive()).toBeNull();
    serve('<html><body>Sign in to Wi-Fi</body></html>');
    expect(await isNewerBuildLive()).toBeNull();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await isNewerBuildLive()).toBeNull();
  });

  it('bypasses every cache and every service-worker rule', async () => {
    serve(`<script type="module" src="${RUNNING}"></script>`);
    await isNewerBuildLive();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Not a navigation, not /assets/*.js, not the precached /index.html: no SW rule matches.
    expect(String(url)).toMatch(/^\/\?__app_update=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('fetches nothing when offline (null) or when the page has no built entry (dev, false)', async () => {
    setOnline(false);
    expect(await isNewerBuildLive()).toBeNull();
    setOnline(true);
    document.head.querySelectorAll('script[data-p1416]').forEach((s) => s.remove());
    expect(await isNewerBuildLive()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The probe must reach the network. Evaluate every runtimeCaching rule (src/pwa/workbox-config.ts)
 * against the probe exactly as Workbox would: a same-origin `fetch()` (mode `cors`), not a
 * navigation. Known-good controls prove the matcher is not blind (p1369-sw-config.test.ts pattern).
 */
describe('the version probe is matched by no service-worker rule', () => {
  const ORIGIN = 'https://claritypledge.com';
  const matches = (rule: RuntimeCachingRule, href: string, mode: RequestMode) => {
    const url = new URL(href);
    const pattern = rule.urlPattern;
    if (pattern instanceof RegExp) return pattern.test(url.href);
    if (typeof pattern === 'string') return url.href === new URL(pattern, ORIGIN).href;
    const request = { mode, method: 'GET', url: url.href } as unknown as Request;
    return Boolean(
      (pattern as (o: { url: URL; request: Request; sameOrigin: boolean }) => unknown)({
        url,
        request,
        sameOrigin: url.origin === ORIGIN,
      }),
    );
  };
  const handlers = (href: string, mode: RequestMode) =>
    runtimeCaching.filter((r) => matches(r, href, mode)).map((r) => r.handler);

  it('the probe matches nothing', () => {
    expect(handlers(`${ORIGIN}/?__app_update=1759650000000`, 'cors')).toEqual([]);
  });

  it('known-good controls: the same evaluation matches a navigation to / and an app chunk', () => {
    expect(handlers(`${ORIGIN}/`, 'navigate')).toEqual(['NetworkOnly']);
    expect(handlers(`${ORIGIN}/assets/index-abc123.js`, 'cors')).toEqual(['CacheFirst']);
  });
});
