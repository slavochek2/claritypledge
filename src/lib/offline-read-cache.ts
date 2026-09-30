/**
 * @file offline-read-cache.ts
 * @description P1369: read what you've already seen, offline.
 *
 * A small IndexedDB read-through cache that the offline-readable pages (story, point, event) put
 * in front of their service calls. Rules, each one a spec line:
 *
 *   - NETWORK FIRST. A read goes to the network exactly as before. The cache answers only when
 *     the network did not: the request failed, or it has not come back within a short deadline
 *     (offline, supabase-js can sit ~25 s retrying a token refresh before it even sends the read).
 *     Online reads are never answered from here, so an online page never shows stale data.
 *   - "Failed" means the request never reached the server (network-outcome.ts), NOT
 *     navigator.onLine — captive portals report online while nothing gets through.
 *   - PARTITIONED BY AUTH CONTEXT. The key is owner + resource, where the owner is the signed-in
 *     user id from the stored session (or `anon`) plus the room codes this tab presents. One
 *     person's rows are never readable under another person's key.
 *   - CLEARED on every sign-out path (api.ts signOut, AuthContext, any SIGNED_OUT event). A read
 *     that was in flight when the cache was cleared never writes its rows back (generation check).
 *   - A genuine "not found" from the network deletes the entry: revoked or deleted content is not
 *     kept around to be shown later.
 *   - Capped per resource type and aged out after 30 days. Nothing is ever pre-downloaded.
 *
 * The service worker never caches Supabase (Cache Storage keys by URL and would hand one
 * person's rows to another) — that is why this lives in the app, not in the SW.
 */
import { heldRoomCodes } from './room-capability';
import { isSupabaseUnreachable, networkFailureCount } from './network-outcome';

export type OfflineResourceType = 'story' | 'story-extras' | 'story-slug' | 'point' | 'point-slug' | 'event';

/** Entries kept per resource type; the oldest are evicted first. */
export const OFFLINE_CACHE_CAPS: Record<OfflineResourceType, number> = {
  story: 100,
  'story-extras': 100,
  'story-slug': 100,
  point: 150,
  'point-slug': 100,
  event: 50,
};

/** Older entries are treated as absent (and removed on the next write of their type). */
export const OFFLINE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a read waits for the network before answering from the cache, when there is a
 * cached copy. Offline, fetches fail at once and this never comes into play; it covers the
 * cases where the network hangs instead of failing.
 */
export const NETWORK_DEADLINE_MS = 4_000;

export type ReadResult<T> =
  | { source: 'network'; data: T | null }
  | { source: 'cache'; data: T; storedAt: number }
  | { source: 'offline' };

interface Entry {
  key: string;
  type: OfflineResourceType;
  data: unknown;
  storedAt: number;
}

/** The storage behind the cache — IndexedDB in the browser, memory where it is unavailable. */
export interface OfflineEntryStore {
  get(key: string): Promise<Entry | undefined>;
  put(entry: Entry): Promise<void>;
  delete(key: string): Promise<void>;
  listType(type: OfflineResourceType): Promise<Array<{ key: string; storedAt: number }>>;
  clear(): Promise<void>;
}

// ─── Stores ──────────────────────────────────────────────────────────────────

const DB_NAME = 'clarity-offline-reads';
const STORE = 'entries';

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IndexedDbEntryStore implements OfflineEntryStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('type', 'type');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('offline-read-cache: open blocked'));
      });
      // A failed open is retried on the next call rather than cached forever.
      this.db.catch(() => {
        this.db = null;
      });
    }
    return this.db;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string) {
    return requestToPromise((await this.tx('readonly')).get(key)) as Promise<Entry | undefined>;
  }

  async put(entry: Entry) {
    await requestToPromise((await this.tx('readwrite')).put(entry));
  }

  async delete(key: string) {
    await requestToPromise((await this.tx('readwrite')).delete(key));
  }

  async listType(type: OfflineResourceType) {
    const all = (await requestToPromise((await this.tx('readonly')).index('type').getAll(type))) as Entry[];
    return all.map((e) => ({ key: e.key, storedAt: e.storedAt }));
  }

  async clear() {
    await requestToPromise((await this.tx('readwrite')).clear());
  }
}

export class MemoryEntryStore implements OfflineEntryStore {
  private map = new Map<string, Entry>();
  async get(key: string) {
    return this.map.get(key);
  }
  async put(entry: Entry) {
    this.map.set(entry.key, entry);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async listType(type: OfflineResourceType) {
    return [...this.map.values()].filter((e) => e.type === type).map((e) => ({ key: e.key, storedAt: e.storedAt }));
  }
  async clear() {
    this.map.clear();
  }
}

let store: OfflineEntryStore =
  typeof indexedDB !== 'undefined' ? new IndexedDbEntryStore() : new MemoryEntryStore();

/** Test-only: swap the backing store. */
export function _setOfflineEntryStoreForTesting(next: OfflineEntryStore): void {
  store = next;
}

// ─── Owner (auth context) ────────────────────────────────────────────────────

function authStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    // supabase-js's default storage key.
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** FNV-1a — the key only needs to partition, but a raw room code is a capability and stays out of storage. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Whose cache this is, read synchronously from the session supabase-js has stored — the identity
 * the next request will be sent as. Synchronous on purpose: offline with an expired token,
 * `supabase.auth.getSession()` blocks for ~25 s retrying the refresh, and the cache must answer
 * before that.
 */
export function offlineCacheOwner(): string {
  let owner = 'anon';
  const key = authStorageKey();
  try {
    const raw = key ? localStorage.getItem(key) : null;
    if (raw) {
      const id = (JSON.parse(raw) as { user?: { id?: unknown } } | null)?.user?.id;
      // A session we cannot read is nobody's: it must never fall back to the anonymous cache.
      owner = typeof id === 'string' && id ? `u:${id}` : 'unknown';
    }
  } catch {
    owner = 'unknown';
  }
  const codes = [...heldRoomCodes()].sort();
  return codes.length ? `${owner}|rc:${fnv1a(codes.join(','))}` : owner;
}

// ─── Clearing ────────────────────────────────────────────────────────────────

let generation = 0;

/** Remove every cached read, for every owner. Called on every sign-out path. */
export async function clearOfflineReadCache(): Promise<void> {
  generation += 1;
  try {
    await store.clear();
  } catch (err) {
    console.error('[offline-read-cache] clear failed:', err);
  }
}

// ─── Read-through ────────────────────────────────────────────────────────────

function isFresh(e: Entry | undefined, now = Date.now()): e is Entry {
  return !!e && now - e.storedAt <= OFFLINE_CACHE_MAX_AGE_MS;
}

async function enforceCap(type: OfflineResourceType): Promise<void> {
  const rows = await store.listType(type);
  const now = Date.now();
  const expired = rows.filter((r) => now - r.storedAt > OFFLINE_CACHE_MAX_AGE_MS);
  const live = rows.filter((r) => now - r.storedAt <= OFFLINE_CACHE_MAX_AGE_MS).sort((a, b) => b.storedAt - a.storedAt);
  const evict = [...expired, ...live.slice(OFFLINE_CACHE_CAPS[type])];
  await Promise.all(evict.map((r) => store.delete(r.key)));
}

/** Strictly increasing, so eviction order ("oldest first") is defined even within a millisecond. */
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

async function write(key: string, type: OfflineResourceType, data: unknown, gen: number): Promise<void> {
  if (gen !== generation) return; // cleared (sign-out) while this read was in flight
  try {
    await store.put({ key, type, data, storedAt: stamp() });
    if (gen !== generation) {
      await store.delete(key);
      return;
    }
    await enforceCap(type);
  } catch (err) {
    // Quota, private mode, eviction: the page already has its data; only offline reading is lost.
    console.warn('[offline-read-cache] write failed:', err);
  }
}

type Outcome<T> = { ok: true; data: T | null } | { ok: false; error: unknown };

/**
 * Read `type:id` through the cache. `fetcher` is the page's existing service call; it may return
 * null for "not found" (the services swallow errors, which is why the failure is learned from
 * network-outcome instead).
 */
export async function readThrough<T>(
  type: OfflineResourceType,
  id: string,
  fetcher: () => Promise<T | null>,
  options: { deadlineMs?: number } = {},
): Promise<ReadResult<T>> {
  const deadlineMs = options.deadlineMs ?? NETWORK_DEADLINE_MS;
  const key = `${offlineCacheOwner()}|${type}|${id}`;
  const gen = generation;
  const failuresBefore = networkFailureCount();

  const cachedP: Promise<Entry | undefined> = store
    .get(key)
    .then((e) => (isFresh(e) ? e : undefined))
    .catch(() => undefined);

  const fetchP: Promise<Outcome<T>> = fetcher().then(
    (data) => ({ ok: true as const, data }),
    (error) => ({ ok: false as const, error }),
  );

  // A request failed during this read AND the most recent outcome is still a failure. The second
  // half matters because the counter is app-wide: an unrelated request failing alongside this one
  // must not turn a read that then succeeded into "offline" (a stale copy shown online).
  const networkTrouble = () => networkFailureCount() > failuresBefore && isSupabaseUnreachable();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const raced = await Promise.race([
    fetchP,
    new Promise<'deadline'>((resolve) => {
      timer = setTimeout(() => resolve('deadline'), deadlineMs);
    }),
  ]);
  clearTimeout(timer);

  if (raced === 'deadline') {
    const cached = await cachedP;
    if (cached) {
      // The late answer, if it ever arrives complete, still refreshes the cache.
      void fetchP.then((o) => {
        if (o.ok && o.data != null && !networkTrouble()) void write(key, type, o.data, gen);
      });
      return { source: 'cache', data: cached.data as T, storedAt: cached.storedAt };
    }
    if (networkTrouble()) return { source: 'offline' };
  }

  const outcome = raced === 'deadline' ? await fetchP : raced;
  const trouble = networkTrouble();

  if (!trouble) {
    if (!outcome.ok) throw outcome.error; // a real error, not connectivity
    if (outcome.data != null) void write(key, type, outcome.data, gen);
    else void store.delete(key).catch(() => undefined);
    return { source: 'network', data: outcome.data };
  }

  // The network failed somewhere in this read. A complete cached copy beats a partial live one.
  const cached = await cachedP;
  if (cached) return { source: 'cache', data: cached.data as T, storedAt: cached.storedAt };
  if (outcome.ok && outcome.data != null) return { source: 'network', data: outcome.data };
  return { source: 'offline' };
}
