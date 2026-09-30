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
 *   - A genuine "not found" deletes the entry: revoked or deleted content is not kept around to
 *     be shown later. Genuine means THIS read reached the server — no request it started failed —
 *     judged per read, never from the app-wide last outcome (a sibling's success proves nothing).
 *   - Nothing hangs forever: with no cached copy, a network that hangs without failing ends in
 *     `offline` (needs-connection) after UNCACHED_DEADLINE_MS.
 *   - Capped per resource type and aged out after 30 days. Nothing is ever pre-downloaded.
 *
 * The service worker never caches Supabase (Cache Storage keys by URL and would hand one
 * person's rows to another) — that is why this lives in the app, not in the SW.
 */
import { heldRoomCodes } from './room-capability';
import { isSupabaseUnreachable, networkFailedSince, networkMark, recordNetworkTrouble } from './network-outcome';

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

/**
 * With nothing cached, how long a read waits before giving up on a network that hangs without
 * failing (no error ever arrives). It then resolves to the needs-connection state; if the answer
 * comes later, that success is a reconnect and the page re-reads.
 */
export const UNCACHED_DEADLINE_MS = 10_000;

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

/**
 * The room-code part of the owner: a SHA-256 of the held codes. Collision-resistant, so two codes
 * never share a partition (a 32-bit hash did: A9GZ2X and 29ONUL collided), and the raw code — a
 * capability — stays out of storage. Null when no digest is available (crypto.subtle needs a
 * secure context): the read then skips the cache rather than share a partition.
 */
async function roomCodeDigest(codes: readonly string[]): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const bytes = new TextEncoder().encode(`clarity-offline-read-cache|${codes.join(',')}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Whose cache this is: the signed-in user id from the session supabase-js has stored (or `anon`),
 * plus the room codes this tab presents. The session and the codes are read SYNCHRONOUSLY, at the
 * call — the identity the next request will be sent as; only the code digest is awaited. Not
 * `supabase.auth.getSession()`: offline with an expired token it blocks for ~25 s retrying the
 * refresh, and the cache must answer before that. Null means "no safe partition" (see above).
 */
export async function offlineCacheOwner(): Promise<string | null> {
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
  if (!codes.length) return owner;
  const digest = await roomCodeDigest(codes);
  return digest ? `${owner}|rc:${digest}` : null;
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

/**
 * Clear, but never wait longer than `ms` for it: a wedged IndexedDB open must not hold a
 * sign-out. The clear keeps running if it overruns (and in-flight reads are already fenced off by
 * the generation bump, which happens at once). Resolves true when the clear finished in time.
 */
export async function clearOfflineReadCacheWithin(ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    clearOfflineReadCache().then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]);
  clearTimeout(timer);
  if (!finished) console.warn(`[offline-read-cache] clear still running after ${ms} ms; not waiting for it`);
  return finished;
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

/** A lookup in a wedged IndexedDB must not hold the read: after this long it counts as a miss. */
const CACHE_LOOKUP_TIMEOUT_MS = 2_000;

function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Read `type:id` through the cache. `fetcher` is the page's existing service call; it may return
 * null for "not found". The services swallow network errors (a failed fetch comes back as null
 * or an empty list), so whether THIS read reached the server is learned from network-outcome:
 * did a request that started during this read fail? Never from the app-wide last outcome — a
 * sibling request succeeding afterwards does not make this read's null a real "not found".
 *
 * Only a read that reached the server without a network failure may delete the cached copy or
 * report "not found" (`{ source: 'network', data: null }`). Whenever the answer comes from the
 * cache, or is `offline`, the app is marked unreachable (recordNetworkTrouble) so that the next
 * successful request is a reconnect and the page refreshes itself.
 */
export async function readThrough<T>(
  type: OfflineResourceType,
  id: string,
  fetcher: () => Promise<T | null>,
  options: { deadlineMs?: number; uncachedDeadlineMs?: number } = {},
): Promise<ReadResult<T>> {
  const deadlineMs = options.deadlineMs ?? NETWORK_DEADLINE_MS;
  const uncachedDeadlineMs = Math.max(options.uncachedDeadlineMs ?? UNCACHED_DEADLINE_MS, deadlineMs);
  const gen = generation;
  const mark = networkMark();
  // The owner is read synchronously here (the identity this read is sent as); only the room-code
  // digest is awaited, and the network request does not wait for it.
  const keyP: Promise<string | null> = offlineCacheOwner().then((owner) => (owner === null ? null : `${owner}|${type}|${id}`));

  const fetchP: Promise<Outcome<T>> = fetcher().then(
    (data) => ({ ok: true as const, data }),
    (error) => ({ ok: false as const, error }),
  );

  const cachedP: Promise<Entry | undefined> = keyP
    .then((key) => (key ? within(store.get(key), CACHE_LOOKUP_TIMEOUT_MS, undefined) : undefined))
    .then((e) => (isFresh(e) ? e : undefined))
    .catch(() => undefined);

  /** A request that started during this read never reached the server. */
  const failed = () => networkFailedSince(mark);

  const storeLate = () => {
    // A late answer, if it ever arrives complete and clean, still refreshes the cache.
    void fetchP.then(async (o) => {
      if (!o.ok || o.data == null || failed()) return;
      const key = await keyP;
      if (key) void write(key, type, o.data, gen);
    });
  };

  const fromCache = (cached: Entry): ReadResult<T> => {
    recordNetworkTrouble();
    return { source: 'cache', data: cached.data as T, storedAt: cached.storedAt };
  };
  const offline = (): ReadResult<T> => {
    recordNetworkTrouble();
    return { source: 'offline' };
  };

  let outcome = await within<Outcome<T> | 'deadline'>(fetchP, deadlineMs, 'deadline');

  if (outcome === 'deadline') {
    const cached = await cachedP;
    if (cached) {
      storeLate();
      return fromCache(cached);
    }
    if (failed()) return offline();
    // Nothing to show instead: give the network longer, but not forever — a network that hangs
    // without failing must still end in the needs-connection state.
    outcome = await within<Outcome<T> | 'deadline'>(fetchP, uncachedDeadlineMs - deadlineMs, 'deadline');
    if (outcome === 'deadline') {
      storeLate();
      return offline();
    }
  }

  if (!failed()) {
    if (!outcome.ok) throw outcome.error; // a real error, not connectivity
    const key = await keyP;
    if (key) {
      if (outcome.data != null) void write(key, type, outcome.data, gen);
      else void store.delete(key).catch(() => undefined); // a real not-found: don't keep it around
    }
    return { source: 'network', data: outcome.data };
  }

  // Part of this read never reached the server, so its result may be partial (or a false null).
  // It is never stored, and a null is never "not found".
  if (outcome.ok && outcome.data != null && !isSupabaseUnreachable()) {
    // The main answer arrived and the network is answering again: show it live, like before P1369.
    return { source: 'network', data: outcome.data };
  }
  const cached = await cachedP;
  if (cached) return fromCache(cached); // a complete copy beats a partial live one
  if (outcome.ok && outcome.data != null) return { source: 'network', data: outcome.data };
  return offline();
}
