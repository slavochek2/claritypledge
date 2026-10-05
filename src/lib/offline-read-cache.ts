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
 *     person's rows are never readable under another person's key. Resource ids never contain
 *     the React auth user (null until the profile loads, and it never loads offline); a read
 *     that depends on the viewer passes `viewerId` so it is stored only for the matching owner.
 *   - SERVER TROUBLE IS NOT AN ANSWER. A 5xx / 429 / status-0 response during a read counts like
 *     a network failure here: it never deletes or overwrites the cached copy and is never cached.
 *   - A FAILED CLEAR BLOCKS THE CACHE. Until a clear succeeds (retried at startup) nothing is
 *     read from or written to it.
 *   - CLEARED on every sign-out path (api.ts signOut, AuthContext, any SIGNED_OUT event). A read
 *     that was in flight when the cache was cleared never writes its rows back (generation check).
 *   - A genuine "not found" deletes the entry: revoked or deleted content is not kept around to
 *     be shown later. Genuine means THIS read reached the server — no request it started failed —
 *     judged per read, never from the app-wide last outcome (a sibling's success proves nothing).
 *   - Nothing hangs forever: with no cached copy, a network that hangs without failing ends in
 *     `offline` (needs-connection) after UNCACHED_DEADLINE_MS (Scope v2: "within a few seconds").
 *   - Capped per resource type and aged out after 30 days. The only pre-download is the fixed
 *     offline pack (offline-pack.ts, Scope v2), written through `prefetchThrough` under the same
 *     keys the pages read.
 *
 * The service worker never caches Supabase (Cache Storage keys by URL and would hand one
 * person's rows to another) — that is why this lives in the app, not in the SW.
 */
import { heldRoomCodes } from './room-capability';
import {
  isSupabaseUnreachable,
  networkFailedSince,
  networkMark,
  recordNetworkSuccess,
  recordNetworkTrouble,
  serverTroubleSince,
} from './network-outcome';

export type OfflineResourceType =
  | 'story'
  | 'story-extras'
  | 'story-slug'
  | 'point'
  | 'point-slug'
  | 'event'
  // Scope v2 (2026-09-30): the links-menu destinations, the feed's first page, groups, event room.
  | 'stake'
  | 'letter'
  | 'letter-code'
  | 'feed'
  | 'groups'
  // P1407: the home page's groups + next events.
  | 'home'
  | 'event-access'
  | 'event-self';

/** Entries kept per resource type; the oldest are evicted first. */
export const OFFLINE_CACHE_CAPS: Record<OfflineResourceType, number> = {
  story: 100,
  'story-extras': 100,
  'story-slug': 100,
  point: 150,
  'point-slug': 100,
  event: 50,
  stake: 30,
  letter: 30,
  'letter-code': 30,
  feed: 10,
  groups: 5,
  home: 2,
  'event-access': 30,
  'event-self': 30,
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
export const UNCACHED_DEADLINE_MS = 4_500;

export type ReadResult<T> =
  | { source: 'network'; data: T | null }
  | { source: 'cache'; data: T; storedAt: number; slow?: boolean }
  | { source: 'offline' };

/**
 * P1337: a cached copy shown only because the network was SLOW (no request failed) is not
 * "offline" (founder, 2026-10-05: "it says saved copy from 40 minutes ago but the internet
 * works"). The read keeps waiting in the background, and its own late, complete answer goes to
 * the page that asked (`ReadOptions.onLate`) — no re-read, so a network that stays slow cannot
 * turn it into a loop, and the answer keeps that read's place in the page's own ordering. Only an
 * answer that never comes within SLOW_GIVE_UP_MS counts as unreachable.
 */
export const SLOW_GIVE_UP_MS = 15_000;

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
  /** Last resort when `clear` fails: remove the whole backing database. */
  destroy?(): Promise<void>;
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
      const opening: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('type', 'type');
        };
        req.onsuccess = () => {
          const db = req.result;
          // Another tab deleting the cache (sign-out clear fallback) must never be blocked by
          // this connection: close it and reopen lazily on the next read (/finish review, P1369).
          db.onversionchange = () => {
            db.close();
            if (this.db === opening) this.db = null; // never drop a newer connection
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('offline-read-cache: open blocked'));
      });
      this.db = opening;
      // A failed open is retried on the next call rather than cached forever.
      opening.catch(() => {
        if (this.db === opening) this.db = null;
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

  /** indexedDB.deleteDatabase — needs no open connection, so it also works when `open` is broken. */
  async destroy() {
    const open = this.db;
    this.db = null;
    if (open) {
      try {
        (await open).close();
      } catch {
        /* an open that failed has nothing to close */
      }
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      // onblocked: only a connection without the versionchange close (an old build) can block;
      // the delete then completes when that tab closes, and clear-pending keeps reads off meanwhile.
    });
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

/** localStorage keys that belong to the offline cache (the offline pack's per-owner stamps). */
export const OFFLINE_PACK_STAMP_PREFIX = 'clarity-offline-pack:';

function clearPackStamps(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(OFFLINE_PACK_STAMP_PREFIX) && k !== `${OFFLINE_PACK_STAMP_PREFIX}disabled`) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/**
 * Set while a clear has been asked for and has not yet succeeded. While it is set NOTHING is read
 * from or written to the cache — rows a sign-out meant to remove are never served — and the next
 * app start retries the clear (`retryPendingOfflineClear`). Kept in localStorage, not in the
 * database it guards, so a broken database cannot hide it. Not under the pack-stamp prefix, which
 * a clear itself removes.
 */
export const OFFLINE_CLEAR_PENDING_KEY = 'clarity-offline-reads:clear-pending';

/** Fallback for a browser where localStorage cannot be written (set only when writing it failed). */
let clearPendingInMemory = false;

export function isOfflineClearPending(): boolean {
  try {
    return localStorage.getItem(OFFLINE_CLEAR_PENDING_KEY) !== null || clearPendingInMemory;
  } catch {
    return clearPendingInMemory;
  }
}

function setClearPending(pending: boolean): void {
  clearPendingInMemory = false;
  try {
    if (pending) localStorage.setItem(OFFLINE_CLEAR_PENDING_KEY, String(Date.now()));
    else localStorage.removeItem(OFFLINE_CLEAR_PENDING_KEY);
  } catch {
    clearPendingInMemory = pending; // storage unwritable: this tab still holds the block
  }
}

/**
 * Remove every cached read, for every owner. Called on every sign-out path. Resolves true when
 * the rows are gone: `clear()`, or failing that, deleting the whole database. When both fail it
 * resolves false and leaves the clear-pending flag set, so the rows stay unreadable until a later
 * clear succeeds.
 */
export async function clearOfflineReadCache(): Promise<boolean> {
  generation += 1;
  setClearPending(true); // before anything else: a tab that dies mid-clear stays blocked
  // The pack's "already pre-loaded" stamps describe rows that are gone now.
  clearPackStamps();
  try {
    await store.clear();
    setClearPending(false);
    return true;
  } catch (err) {
    console.error('[offline-read-cache] clear failed, deleting the database instead:', err);
  }
  try {
    if (!store.destroy) throw new Error('store cannot be deleted');
    await store.destroy();
    setClearPending(false);
    return true;
  } catch (err) {
    console.error('[offline-read-cache] deleting the database failed; cached reads stay blocked until a clear succeeds:', err);
    return false;
  }
}

/** At startup: finish a clear that an earlier session could not. Resolves true when none is pending after it. */
export async function retryPendingOfflineClear(): Promise<boolean> {
  if (!isOfflineClearPending()) return true;
  return clearOfflineReadCache();
}

/**
 * Clear, but never wait longer than `ms` for it: a wedged IndexedDB open must not hold a
 * sign-out. The clear keeps running if it overruns (and in-flight reads are already fenced off by
 * the generation bump, which happens at once). Resolves true only when the clear finished in
 * time AND succeeded; false otherwise (the clear-pending flag then keeps cached rows unreadable).
 */
export async function clearOfflineReadCacheWithin(ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    clearOfflineReadCache(),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]);
  clearTimeout(timer);
  if (!finished) console.warn(`[offline-read-cache] clear not done after ${ms} ms, or failed; cached reads stay blocked until it is`);
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

// ─── Own writes (P1420) ──────────────────────────────────────────────────────

/**
 * A change the viewer's own write made to rows this cache may hold, as a pure, idempotent
 * function of the stored data (applying it twice must equal applying it once).
 */
export type OwnWritePatch = (data: unknown) => unknown;

interface OwnWriteRecord {
  seq: number;
  at: number;
  type: OfflineResourceType;
  /** Keys this write may touch: `u:<userId>|` — the writer's own partition, any room codes. */
  ownerPrefix: string;
  fn: OwnWritePatch;
  /** What the write is about (e.g. one point) and when it was MADE — not when it arrived. */
  order?: OwnWriteOrder;
}

/**
 * P1420 round 3: patches arrive in completion order, which is not click order. A patch whose write
 * is older than another recorded write on the same scope (same viewer and point) is never applied:
 * arriving later must not let an older Disagree overwrite a newer Unsure.
 */
export interface OwnWriteOrder {
  scope: string;
  generation: number;
}


/** Reads slower than this are not patched; they are far past every deadline in this file. */
export const OWN_WRITE_PATCH_TTL_MS = 120_000;

let ownWriteSeq = 0;
let ownWrites: OwnWriteRecord[] = [];

function isSuperseded(w: OwnWriteRecord): boolean {
  if (!w.order) return false;
  const { scope, generation } = w.order;
  return ownWrites.some((o) => o !== w && o.order?.scope === scope && o.order.generation > generation);
}

/** The own-write sequence now; a read records it when it starts. */
export function ownWriteMark(): number {
  return ownWriteSeq;
}

/** `data`, with every own write recorded after `sinceMark` for this key applied in order. */
export function applyOwnWrites<T>(type: OfflineResourceType, key: string, data: T, sinceMark: number): T {
  const now = Date.now();
  ownWrites = ownWrites.filter((w) => now - w.at < OWN_WRITE_PATCH_TTL_MS);
  let out: unknown = data;
  for (const w of ownWrites) {
    if (w.seq > sinceMark && w.type === type && key.startsWith(w.ownerPrefix) && !isSuperseded(w)) out = w.fn(out);
  }
  return out as T;
}

/**
 * Record a write the server confirmed, so no cached or in-flight copy of `type` in the writer's
 * own partition shows the state from before it. Patches every stored entry now (keeping its
 * `storedAt`: the strip still states the copy's real age) and every read still in flight when
 * its rows arrive. Errors are swallowed: losing this costs offline accuracy, never the write.
 */
export async function recordOwnWrite(
  type: OfflineResourceType,
  userId: string,
  fn: OwnWritePatch,
  order?: OwnWriteOrder,
): Promise<void> {
  const ownerPrefix = `u:${userId}|`;
  const record: OwnWriteRecord = { seq: ++ownWriteSeq, at: Date.now(), type, ownerPrefix, fn, order };
  ownWrites.push(record);
  if (isSuperseded(record)) return; // a newer write on this scope is already recorded
  if (isOfflineClearPending()) return;
  const gen = generation;
  try {
    const keys = (await store.listType(type)).map((e) => e.key).filter((k) => k.startsWith(ownerPrefix));
    await Promise.all(
      keys.map((key) =>
        withKeyLock(key, async () => {
          // Re-checked inside the lock: a newer write may have been recorded while this one waited.
          if (isSuperseded(record)) return;
          const entry = await store.get(key);
          if (!entry || gen !== generation) return;
          await store.put({ ...entry, data: fn(entry.data) });
        }),
      ),
    );
  } catch (err) {
    console.warn('[offline-read-cache] own-write patch failed:', err);
  }
}

/**
 * P1420: every read-modify-write and every write of one key runs in order. Without it, two own
 * writes patching the same cached feed (two different points) each read the entry, patched their
 * point and put it back — the second put erased the first patch.
 */
const keyLocks = new Map<string, Promise<void>>();
function withKeyLock(key: string, task: () => Promise<void>): Promise<void> {
  const run = (keyLocks.get(key) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => undefined);
  keyLocks.set(key, tail);
  void tail.then(() => {
    if (keyLocks.get(key) === tail) keyLocks.delete(key);
  });
  return run;
}

/** Test-only: forget recorded own writes. */
export function _resetOwnWritesForTesting(): void {
  ownWrites = [];
}

async function write(key: string, type: OfflineResourceType, data: unknown, gen: number, patchMark?: number): Promise<void> {
  return withKeyLock(key, () => writeLocked(key, type, data, gen, patchMark));
}

async function writeLocked(key: string, type: OfflineResourceType, data: unknown, gen: number, patchMark?: number): Promise<void> {
  if (gen !== generation) return; // cleared (sign-out) while this read was in flight
  if (isOfflineClearPending()) return; // a clear is outstanding: nothing new goes in until it lands
  try {
    // P1420: own writes recorded after this read started are applied HERE, inside the key's lock,
    // so a patch recorded between the read and this put is never lost.
    const stored = patchMark === undefined ? data : applyOwnWrites(type, key, data, patchMark);
    await store.put({ key, type, data: stored, storedAt: stamp() });
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

export interface ReadOptions<T = unknown> {
  deadlineMs?: number;
  uncachedDeadlineMs?: number;
  /**
   * The viewer the fetcher fetched FOR (their user id, undefined when anonymous), when the result
   * depends on who is asking (their own position, their registration). The key never contains
   * it — the owner already partitions the cache by the stored session — but a result fetched for
   * a different viewer than the stored session's (the profile has not loaded yet, a sign-in is
   * mid-flight) is shown and never stored, so it cannot overwrite the owner's own copy.
   */
  viewerId?: string | null;
  /** How long a read answered from the cache for slowness may stay unanswered before the app
   * counts as unreachable. Default SLOW_GIVE_UP_MS. */
  slowGiveUpMs?: number;
  /**
   * When this read is answered from the cache for slowness (`{ source: 'cache', slow: true }`),
   * its own late answer — clean, same viewer, no sign-out meanwhile — is delivered here, so the
   * page replaces the saved copy with it and the strip clears. `null` is a late "not found"
   * (deleted, or no longer visible to this viewer): the saved copy is gone, the page shows what
   * it shows for not found. Never called after a network failure, or when the read was answered
   * live.
   */
  onLate?: (data: T | null) => void;
}

/** Whether a result fetched for `options.viewerId` may be stored under `owner` (see ReadOptions). */
function viewerMatchesOwner(owner: string, options: ReadOptions<never>): boolean {
  if (!('viewerId' in options)) return true;
  const base = owner.split('|rc:')[0];
  return base === (options.viewerId ? `u:${options.viewerId}` : 'anon');
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
  options: ReadOptions<T> = {},
): Promise<ReadResult<T>> {
  // P1420: a read that started before one of the viewer's own writes landed carries the
  // pre-write rows. Whatever it shows or stores gets that write applied, so a slow read can
  // never bring a removed position back.
  const patchMark = ownWriteMark();
  const result = await readThroughInner(type, id, fetcher, options, patchMark);
  if (result.source === 'offline' || result.data == null) return result;
  const owner = await offlineCacheOwner();
  if (owner === null) return result;
  return { ...result, data: applyOwnWrites(type, `${owner}|${type}|${id}`, result.data, patchMark) } as ReadResult<T>;
}

async function readThroughInner<T>(
  type: OfflineResourceType,
  id: string,
  fetcher: () => Promise<T | null>,
  options: ReadOptions<T>,
  patchMark: number,
): Promise<ReadResult<T>> {
  const deadlineMs = options.deadlineMs ?? NETWORK_DEADLINE_MS;
  const uncachedDeadlineMs = Math.max(options.uncachedDeadlineMs ?? UNCACHED_DEADLINE_MS, deadlineMs);
  const gen = generation;
  const mark = networkMark();
  const startedAt = Date.now();
  // The owner is read synchronously here (the identity this read is sent as); only the room-code
  // digest is awaited, and the network request does not wait for it.
  const blocked = isOfflineClearPending(); // a failed sign-out clear: no cached rows at all
  const ownerP = offlineCacheOwner();
  const keyP: Promise<string | null> = ownerP.then((owner) => (owner === null || blocked ? null : `${owner}|${type}|${id}`));
  /** The key this read's result may be WRITTEN under (null: show it, never store it). */
  const writeKeyP: Promise<string | null> = Promise.all([keyP, ownerP]).then(([key, owner]) =>
    key && owner !== null && viewerMatchesOwner(owner, options) ? key : null,
  );

  const fetchP: Promise<Outcome<T>> = fetcher().then(
    (data) => ({ ok: true as const, data }),
    (error) => ({ ok: false as const, error }),
  );

  const cachedP: Promise<Entry | undefined> = keyP
    .then((key) => (key ? within(store.get(key), CACHE_LOOKUP_TIMEOUT_MS, undefined) : undefined))
    .then((e) => (isFresh(e) ? e : undefined))
    .catch(() => undefined);

  /** A request that started during this read never reached the server, or got a 5xx/429/0. */
  const failed = () => networkFailedSince(mark) || serverTroubleSince(mark);

  /** Set when this read's give-up bound marked the app unreachable (fromCacheSlow). */
  let gaveUp = false;

  const storeLate = (deliver = false) => {
    // A late answer, if it ever arrives complete and clean, still refreshes the cache — and, when
    // the page is showing a copy only because the network was slow, it goes to the page (P1337).
    void fetchP.then(async (o) => {
      if (!o.ok || failed()) {
        // The page is showing its copy as "updating" and nothing is coming: that is offline after
        // all (a swallowed 5xx, a failure). Say so, so the strip is honest and the page re-reads on
        // the next reconnect.
        if (deliver && gen === generation) recordNetworkTrouble();
        return;
      }
      if (o.data == null && !deliver) return; // a stray late null decides nothing
      const key = await writeKeyP;
      if (gen !== generation) return; // signed out meanwhile: neither stored nor shown
      // The answer came after this read gave up: the server is reachable after all.
      if (gaveUp) recordNetworkSuccess();
      if (key) {
        // A clean late "not found" (deleted, or no longer visible) removes the saved copy, just
        // as an on-time one does — but only for a read made as the cache owner (writeKey).
        if (o.data == null) void store.delete(key).catch(() => undefined);
        else void write(key, type, o.data, gen, patchMark);
      }
      // Same rule as storing: a result fetched for another viewer than the stored session's is
      // not delivered either (the page has moved on to a different identity).
      if (!deliver || !options.onLate || !viewerMatchesOwner((await ownerP) ?? '', options)) return;
      // P1420: the page gets the late rows with the viewer's own writes since this read began
      // applied, exactly as an on-time answer does — a slow read never brings a removed position back.
      const owner = await ownerP;
      const shown = o.data != null && owner ? applyOwnWrites(type, `${owner}|${type}|${id}`, o.data, patchMark) : o.data;
      try {
        options.onLate(shown);
      } catch (err) {
        console.error('[offline-read-cache] onLate failed:', err);
      }
    });
  };

  /** Served from the cache for slowness: unreachable only if no answer comes within the longer bound. */
  const fromCacheSlow = (cached: Entry): ReadResult<T> => {
    storeLate(true);
    let settled = false;
    const timer = setTimeout(() => {
      // A timer from before a sign-out never marks the next session unreachable.
      if (settled || gen !== generation) return;
      gaveUp = true;
      recordNetworkTrouble();
    }, Math.max(0, (options.slowGiveUpMs ?? SLOW_GIVE_UP_MS) - (Date.now() - startedAt))); // from the read's start
    void fetchP.finally(() => {
      settled = true;
      clearTimeout(timer);
    });
    return { source: 'cache', data: cached.data as T, storedAt: cached.storedAt, slow: true };
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
      if (!failed()) return fromCacheSlow(cached);
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
    const writeKey = await writeKeyP;
    if (outcome.data != null) {
      if (writeKey) void write(writeKey, type, outcome.data, gen, patchMark);
    } else if (writeKey) {
      // Only a read made AS the owner may conclude "not found" for the owner's copy (a private
      // row read before the profile loaded is "not found" for anon, not for its owner).
      void store.delete(writeKey).catch(() => undefined); // a real not-found: don't keep it around
    }
    return { source: 'network', data: outcome.data };
  }

  // Part of this read never reached the server, so its result may be partial (or a false null).
  // It is never stored, and a null is never "not found".
  // Server trouble (5xx/429/0) is excluded: the services turn it into a plausible-looking answer
  // ("not registered", an empty list), so a stored copy is the better answer whenever there is one.
  if (outcome.ok && outcome.data != null && !isSupabaseUnreachable() && !serverTroubleSince(mark)) {
    // The main answer arrived and the network is answering again: show it live, like before P1369.
    return { source: 'network', data: outcome.data };
  }
  const cached = await cachedP;
  if (cached) return fromCache(cached); // a complete copy beats a partial live one
  if (outcome.ok && outcome.data != null) return { source: 'network', data: outcome.data };
  return offline();
}

/**
 * The offline pack's write path (Scope v2): fetch `type:id` now and store it under exactly the key
 * a page's readThrough would use, so a pre-loaded page opens offline. Never answers from the
 * cache, never marks the app unreachable (a failed pre-load is not "offline" — nobody is looking
 * at it), never retries. Stores only a complete, clean answer: nothing failed during the fetch,
 * the data is not null, and no sign-out happened meanwhile. Bounded by `timeoutMs`.
 */
export async function prefetchThrough<T>(
  type: OfflineResourceType,
  id: string,
  fetcher: () => Promise<T | null>,
  timeoutMs = 15_000,
  options: Pick<ReadOptions, 'viewerId'> = {},
): Promise<{ stored: boolean; data: T | null }> {
  const skipped = { stored: false, data: null };
  const gen = generation;
  const mark = networkMark();
  const owner = await offlineCacheOwner();
  if (owner === null || isOfflineClearPending()) return skipped;
  if (!viewerMatchesOwner(owner, options)) return skipped;
  const key = `${owner}|${type}|${id}`;
  const outcome = await within<Outcome<T> | 'deadline'>(
    fetcher().then(
      (data) => ({ ok: true as const, data }),
      (error) => ({ ok: false as const, error }),
    ),
    timeoutMs,
    'deadline',
  );
  if (outcome === 'deadline' || !outcome.ok || outcome.data == null || networkFailedSince(mark) || serverTroubleSince(mark)) {
    return skipped;
  }
  // The owner may have changed while the fetch ran (sign-in/out): never file rows under another key.
  if ((await offlineCacheOwner()) !== owner) return skipped;
  await write(key, type, outcome.data, gen);
  return { stored: gen === generation, data: outcome.data };
}

/**
 * The cached copy of `type:id` for the current owner, without touching the network. For a page
 * whose own load path cannot be wrapped in one readThrough (the letter page's auth branches) and
 * that must still never spin: after its own deadline it shows this, or needs-connection.
 */
export async function peekOfflineCache<T>(type: OfflineResourceType, id: string): Promise<{ data: T; storedAt: number } | null> {
  try {
    const owner = await offlineCacheOwner();
    if (owner === null || isOfflineClearPending()) return null;
    const e = await within(store.get(`${owner}|${type}|${id}`), CACHE_LOOKUP_TIMEOUT_MS, undefined);
    return isFresh(e) ? { data: e.data as T, storedAt: e.storedAt } : null;
  } catch {
    return null;
  }
}

/**
 * Store data a page already loaded live, under the current owner — for a page whose load path
 * has several branches (the letter page) and whose live answer arrived through one that is not a
 * single readThrough. The same rules as a readThrough write: current owner's partition, fenced
 * by the sign-out generation, capped.
 */
export async function rememberOffline(type: OfflineResourceType, id: string, data: unknown): Promise<void> {
  const gen = generation;
  const owner = await offlineCacheOwner();
  if (owner === null || data == null) return;
  await write(`${owner}|${type}|${id}`, type, data, gen);
}
