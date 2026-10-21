/**
 * @file offline-pack.ts
 * @description P1369 Scope v2 — the offline pack. While online and idle, pre-load exactly the
 * links-menu entries (`buildLinksMenu`: the point lists, the letters, the tools — of which only
 * the slides have content to fetch), the feed's first page and the groups directory (with the
 * signed-in user's memberships), so they open offline without having been visited.
 *
 * Rules, each one a spec line:
 *   - TEXT DATA ONLY: the same rows the pages read, plus the slides' HTML/JS and the route code
 *     the pages need. No images, no video, no audio.
 *   - SAME CACHE THE PAGES READ: every data entry goes through `prefetchThrough` with the read
 *     definitions in offline-reads*.ts — the very keys the pages' readThrough uses — so it is
 *     partitioned by auth context and cleared on sign-out like everything else.
 *   - BOUNDED: a fixed list, run sequentially, each fetch once with a timeout; a failure skips
 *     that entry and is never retried. At most once per OFFLINE_PACK_REFRESH_MS per owner (the
 *     stamp is written BEFORE the run, so a run that dies half-way does not re-run on reload).
 *   - PER BUILD: the stamp records the build it ran on (the entry script URL, which changes with
 *     every deploy). A new build within the refresh window re-runs the route-chunk step only —
 *     the old build's chunks are useless to it, the data is still fresh — once per build.
 *   - Skipped on Save-Data, while offline/unreachable, and in a hidden tab.
 *   - RESUMES, never restarts (P1532): a run cut short by hiding the tab records when its cycle
 *     began, and the next run of that cycle takes every entry stored since then from the cache
 *     instead of fetching it again. Before, each hide/show restarted at the first entry.
 */
import { buildLinksMenu } from '@/app/data/event-links';
import { feedRead, groupsRead, homeRead, stakeRead, type OfflineRead } from '@/app/data/offline-reads';
import { letterCodeRead, publicLetterRead } from '@/app/data/offline-reads-letters';
import { OFFLINE_PACK_STAMP_PREFIX, offlineCacheOwner, peekOfflineCache, prefetchThrough } from '@/lib/offline-read-cache';
import { isSupabaseUnreachable } from '@/lib/network-outcome';

/** The last run's outcome (counts only), for diagnostics and the browser suite. */
export const OFFLINE_PACK_RESULT_KEY = `${OFFLINE_PACK_STAMP_PREFIX}result`;

/** "At most once every few hours." */
export const OFFLINE_PACK_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Test/ops switch: set this localStorage key to turn the pack off on a device. */
export const OFFLINE_PACK_DISABLED_KEY = `${OFFLINE_PACK_STAMP_PREFIX}disabled`;

/**
 * P1522: the pack does not run under browser automation (navigator.webdriver): every e2e context
 * and headless crawler is a fresh browser, and the pack was most of their Supabase requests. A
 * test that exercises the pack sets this localStorage key to opt back in.
 */
// Deliberately outside OFFLINE_PACK_STAMP_PREFIX: sign-out clears every key under that prefix, and
// readers of the prefix treat its keys as stamps.
export const OFFLINE_PACK_ALLOW_AUTOMATION_KEY = 'clarity-offline-pack-allow-automation';

function underAutomation(): boolean {
  if (typeof navigator === 'undefined' || !navigator.webdriver) return false;
  try {
    return !localStorage.getItem(OFFLINE_PACK_ALLOW_AUTOMATION_KEY);
  } catch {
    return true;
  }
}

const tabHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

function stampKey(owner: string): string {
  return `${OFFLINE_PACK_STAMP_PREFIX}${owner}`;
}

/**
 * This build's identity: the module entry script's URL (its hash changes with every deploy). In
 * dev it is the constant /src/main.tsx, which is right — there is no new build to warm.
 */
export function currentBuildId(): string {
  if (typeof document === 'undefined') return '';
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const entry = scripts.find((s) => /\/assets\//.test(s.getAttribute('src') ?? '')) ?? scripts[scripts.length - 1];
  return entry?.getAttribute('src') ?? '';
}

interface PackStamp {
  /** When the data was last pre-loaded. */
  at: number;
  /** The build whose route chunks were last warmed. */
  build: string;
  /**
   * P1532: set when a run was cut short by hiding the tab — when that cycle began. Entries stored
   * since then are taken from the cache by the next run instead of being fetched again.
   */
  resumeFrom?: number;
}

function readStamp(owner: string): PackStamp {
  try {
    const raw = localStorage.getItem(stampKey(owner));
    if (!raw) return { at: 0, build: '' };
    const parsed = JSON.parse(raw) as unknown;
    // A stamp from before builds were recorded is a bare number: its chunks count as unknown.
    if (typeof parsed === 'number') return { at: parsed, build: '' };
    const p = parsed as Partial<PackStamp>;
    const stamp: PackStamp = { at: Number(p.at) || 0, build: typeof p.build === 'string' ? p.build : '' };
    if (Number(p.resumeFrom) > 0) stamp.resumeFrom = Number(p.resumeFrom);
    return stamp;
  } catch {
    return { at: 0, build: '' };
  }
}

function writeStamp(owner: string, stamp: PackStamp): void {
  localStorage.setItem(stampKey(owner), JSON.stringify(stamp));
}

/** Whether a run is due now for the current owner (and the reason when it is not). */
export async function offlinePackDue(
  now = Date.now(),
): Promise<{ due: boolean; owner: string | null; reason?: string; chunksOnly?: boolean; stamp?: PackStamp }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { due: false, owner: null, reason: 'offline' };
  if (isSupabaseUnreachable()) return { due: false, owner: null, reason: 'unreachable' };
  if (saveData()) return { due: false, owner: null, reason: 'save-data' };
  if (tabHidden()) return { due: false, owner: null, reason: 'hidden' };
  if (underAutomation()) return { due: false, owner: null, reason: 'automation' };
  try {
    if (localStorage.getItem(OFFLINE_PACK_DISABLED_KEY)) return { due: false, owner: null, reason: 'disabled' };
  } catch {
    return { due: false, owner: null, reason: 'no-storage' };
  }
  const owner = await offlineCacheOwner();
  if (owner === null || owner === 'unknown') return { due: false, owner: null, reason: 'no-partition' };
  const stamp = readStamp(owner);
  if (now - stamp.at < OFFLINE_PACK_REFRESH_MS) {
    if (stamp.build === currentBuildId()) return { due: false, owner, reason: 'fresh' };
    return { due: true, owner, chunksOnly: true, stamp };
  }
  return { due: true, owner, stamp };
}

/** The route code the pack's pages need offline (cached by the service worker as fetched). */
const ROUTE_CHUNKS: Array<() => Promise<unknown>> = [
  () => import('@/app/pages/stake-page'),
  () => import('@/app/pages/letter-reading-page'),
  () => import('@/app/pages/feed-page'),
  () => import('@/app/pages/org-directory-page'),
];

/** Static files a tool entry needs (only the slides have any). Same-origin, via the SW. */
function staticFilesFor(path: string): string[] {
  const deck = path.match(/^\/(presi\d*)$/);
  return deck ? [`/${deck[1]}/`, `/${deck[1]}/gsap.min.js`] : [];
}

export interface OfflinePackResult {
  ran: boolean;
  reason?: string;
  /** Data entries attempted / stored, static files fetched. */
  attempted: number;
  stored: number;
  files: number;
}

/**
 * Run the pack once, if due. `viewerUserId` is the signed-in user (the reads carry it in their
 * resource id exactly as the pages do).
 */
export async function runOfflinePack(viewerUserId: string | undefined): Promise<OfflinePackResult> {
  const due = await offlinePackDue();
  if (!due.due || !due.owner) return { ran: false, reason: due.reason, attempted: 0, stored: 0, files: 0 };
  const owner = due.owner;
  const now = Date.now();
  // P1532: a cycle interrupted by hiding the tab less than a refresh period ago is continued.
  const resumeFrom = due.stamp?.resumeFrom;
  const resuming = !!resumeFrom && now - resumeFrom < OFFLINE_PACK_REFRESH_MS;
  const cycleStart = resuming ? resumeFrom : now;
  try {
    writeStamp(due.owner, { at: due.chunksOnly && due.stamp ? due.stamp.at : now, build: currentBuildId() });
  } catch {
    return { ran: false, reason: 'no-storage', attempted: 0, stored: 0, files: 0 };
  }

  const result: OfflinePackResult = { ran: true, attempted: 0, stored: 0, files: 0 };
  const prefetch = async <T,>(r: OfflineRead<T>): Promise<T | null> => {
    if (resuming) {
      // Resuming: an entry this cycle already stored is not fetched again. A local read only.
      const cached = await peekOfflineCache<T>(r.type, r.id);
      if (cached && cached.storedAt >= cycleStart) return cached.data;
    }
    result.attempted += 1;
    const out = await prefetchThrough(r.type, r.id, r.fetch, undefined, r.options);
    if (out.stored) result.stored += 1;
    return out.data;
  };
  // Stop early if the connection goes while the pack runs — never keep firing into the void —
  // or if the tab is hidden (P1522: a hidden tab issues no repeating requests).
  const stillOnline = () => navigator.onLine !== false && !isSupabaseUnreachable() && !tabHidden();
  // A run cut short by hiding the tab puts the previous stamp back, so the pack is due again the
  // next time the tab is visible rather than six hours later with half its entries missing, and
  // records when this cycle began so that next run resumes instead of starting over (P1532).
  const stop = (): OfflinePackResult => {
    if (tabHidden()) {
      try {
        const previous = due.stamp && due.stamp.at > 0 ? due.stamp : { at: 0, build: '' };
        writeStamp(owner, { at: previous.at, build: previous.build, resumeFrom: cycleStart });
      } catch {
        /* the stamp stays; the pack is merely late */
      }
    }
    return finish(result);
  };

  for (const load of ROUTE_CHUNKS) {
    if (!stillOnline()) return stop();
    await load().catch(() => undefined);
  }
  if (due.chunksOnly) return finish(result);

  // Exactly the links-menu entries, in menu order.
  for (const entry of buildLinksMenu(null)) {
    if (!stillOnline()) return stop();
    if (entry.group === 'points') {
      const tag = decodeURIComponent(entry.to.replace(/^\/stake\//, '').split('?')[0] ?? '');
      await prefetch(stakeRead(tag, viewerUserId));
    } else if (entry.group === 'letters') {
      const code = decodeURIComponent(entry.to.replace(/^\/letter\//, ''));
      const letterId = await prefetch(letterCodeRead(code));
      if (letterId) {
        if (!stillOnline()) return stop();
        await prefetch(publicLetterRead(letterId));
      }
    } else {
      for (const file of staticFilesFor(entry.to)) {
        if (!stillOnline()) return stop();
        try {
          const res = await fetch(file, { credentials: 'same-origin' });
          if (res.ok) result.files += 1;
        } catch {
          /* skipped, not retried */
        }
      }
    }
  }

  if (!stillOnline()) return stop();
  await prefetch(feedRead(viewerUserId, false, undefined));
  if (!stillOnline()) return stop();
  await prefetch(groupsRead());
  if (!stillOnline()) return stop();
  await prefetch(homeRead()); // P1408: home's groups + next events
  return finish(result); // complete: keep the stamp even if the tab hid during the last read
}

function finish(result: OfflinePackResult): OfflinePackResult {
  try {
    localStorage.setItem(OFFLINE_PACK_RESULT_KEY, JSON.stringify({ ...result, at: Date.now() }));
  } catch {
    /* diagnostics only */
  }
  return result;
}
