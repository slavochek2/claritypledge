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
 *   - Skipped on Save-Data, while offline/unreachable, and in a hidden tab.
 */
import { buildLinksMenu } from '@/app/data/event-links';
import { feedRead, groupsRead, stakeRead, type OfflineRead } from '@/app/data/offline-reads';
import { letterCodeRead, publicLetterRead } from '@/app/data/offline-reads-letters';
import { OFFLINE_PACK_STAMP_PREFIX, offlineCacheOwner, prefetchThrough } from '@/lib/offline-read-cache';
import { isSupabaseUnreachable } from '@/lib/network-outcome';

/** The last run's outcome (counts only), for diagnostics and the browser suite. */
export const OFFLINE_PACK_RESULT_KEY = `${OFFLINE_PACK_STAMP_PREFIX}result`;

/** "At most once every few hours." */
export const OFFLINE_PACK_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Test/ops switch: set this localStorage key to turn the pack off on a device. */
export const OFFLINE_PACK_DISABLED_KEY = `${OFFLINE_PACK_STAMP_PREFIX}disabled`;

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

function stampKey(owner: string): string {
  return `${OFFLINE_PACK_STAMP_PREFIX}${owner}`;
}

/** Whether a run is due now for the current owner (and the reason when it is not). */
export async function offlinePackDue(now = Date.now()): Promise<{ due: boolean; owner: string | null; reason?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { due: false, owner: null, reason: 'offline' };
  if (isSupabaseUnreachable()) return { due: false, owner: null, reason: 'unreachable' };
  if (saveData()) return { due: false, owner: null, reason: 'save-data' };
  try {
    if (localStorage.getItem(OFFLINE_PACK_DISABLED_KEY)) return { due: false, owner: null, reason: 'disabled' };
  } catch {
    return { due: false, owner: null, reason: 'no-storage' };
  }
  const owner = await offlineCacheOwner();
  if (owner === null || owner === 'unknown') return { due: false, owner: null, reason: 'no-partition' };
  let last = 0;
  try {
    last = Number(localStorage.getItem(stampKey(owner))) || 0;
  } catch {
    /* no stamp */
  }
  if (now - last < OFFLINE_PACK_REFRESH_MS) return { due: false, owner, reason: 'fresh' };
  return { due: true, owner };
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
  try {
    localStorage.setItem(stampKey(due.owner), String(Date.now()));
  } catch {
    return { ran: false, reason: 'no-storage', attempted: 0, stored: 0, files: 0 };
  }

  const result: OfflinePackResult = { ran: true, attempted: 0, stored: 0, files: 0 };
  const prefetch = async <T,>(r: OfflineRead<T>): Promise<T | null> => {
    result.attempted += 1;
    const out = await prefetchThrough(r.type, r.id, r.fetch);
    if (out.stored) result.stored += 1;
    return out.data;
  };
  // Stop early if the connection goes while the pack runs — never keep firing into the void.
  const stillOnline = () => navigator.onLine !== false && !isSupabaseUnreachable();

  for (const load of ROUTE_CHUNKS) {
    if (!stillOnline()) return finish(result);
    await load().catch(() => undefined);
  }

  // Exactly the links-menu entries, in menu order.
  for (const entry of buildLinksMenu(null)) {
    if (!stillOnline()) return finish(result);
    if (entry.group === 'points') {
      const tag = decodeURIComponent(entry.to.replace(/^\/stake\//, '').split('?')[0] ?? '');
      await prefetch(stakeRead(tag, viewerUserId));
    } else if (entry.group === 'letters') {
      const code = decodeURIComponent(entry.to.replace(/^\/letter\//, ''));
      const letterId = await prefetch(letterCodeRead(code));
      if (letterId) await prefetch(publicLetterRead(letterId));
    } else {
      for (const file of staticFilesFor(entry.to)) {
        try {
          const res = await fetch(file, { credentials: 'same-origin' });
          if (res.ok) result.files += 1;
        } catch {
          /* skipped, not retried */
        }
      }
    }
  }

  if (stillOnline()) await prefetch(feedRead(viewerUserId, false, undefined));
  if (stillOnline()) await prefetch(groupsRead());
  return finish(result);
}

function finish(result: OfflinePackResult): OfflinePackResult {
  try {
    localStorage.setItem(OFFLINE_PACK_RESULT_KEY, JSON.stringify({ ...result, at: Date.now() }));
  } catch {
    /* diagnostics only */
  }
  return result;
}
