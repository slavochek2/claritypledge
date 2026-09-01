/**
 * @file chunk-store.ts
 * @description P566: IndexedDB wrapper for persisting audio chunks before upload.
 *
 * Provides two implementations:
 * - IndexedDBChunkStore: Primary store using IndexedDB
 * - InMemoryChunkStore: Fallback for Safari Private Browsing (no IndexedDB)
 *
 * Key format: {sessionCode}_{userName}_{chunkNumber}
 */

/** Metadata attached to each stored chunk */
export interface ChunkMetadata {
  sessionCode: string;
  userName: string;
  chunkNumber: number;
  createdAt: number;
  blobSize: number;
  mimeType: string;
}

/** Wrapper object stored in IndexedDB (holds both blob and metadata) */
interface ChunkRecord {
  key: string;
  blob: Blob;
  metadata: ChunkMetadata;
}

/** Interface for chunk persistence */
export interface ChunkStore {
  saveChunk(key: string, blob: Blob, metadata: ChunkMetadata): Promise<void>;
  getChunk(key: string): Promise<{ blob: Blob; metadata: ChunkMetadata } | null>;
  deleteChunk(key: string): Promise<void>;
  getAllChunkKeys(): Promise<string[]>;
  getChunkMetadata(key: string): Promise<ChunkMetadata | null>;
}

const DB_NAME = 'claritypledge-audio-chunks';
const STORE_NAME = 'chunks';
const DB_VERSION = 1;

/**
 * Primary chunk store using IndexedDB.
 * Survives page refreshes and tab closes.
 */
export class IndexedDBChunkStore implements ChunkStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.openDB();
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveChunk(key: string, blob: Blob, metadata: ChunkMetadata): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: ChunkRecord = { key, blob, metadata };
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getChunk(key: string): Promise<{ blob: Blob; metadata: ChunkMetadata } | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result as ChunkRecord | undefined;
        if (record) {
          resolve({ blob: record.blob, metadata: record.metadata });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteChunk(key: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllChunkKeys(): Promise<string[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  async getChunkMetadata(key: string): Promise<ChunkMetadata | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result as ChunkRecord | undefined;
        resolve(record ? record.metadata : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * In-memory fallback for environments without IndexedDB (Safari Private Browsing).
 * Data is lost on page close — acceptable since the upload queue processes chunks quickly.
 */
export class InMemoryChunkStore implements ChunkStore {
  private store = new Map<string, { blob: Blob; metadata: ChunkMetadata }>();

  async saveChunk(key: string, blob: Blob, metadata: ChunkMetadata): Promise<void> {
    this.store.set(key, { blob, metadata });
  }

  async getChunk(key: string): Promise<{ blob: Blob; metadata: ChunkMetadata } | null> {
    return this.store.get(key) ?? null;
  }

  async deleteChunk(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getAllChunkKeys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async getChunkMetadata(key: string): Promise<ChunkMetadata | null> {
    const entry = this.store.get(key);
    return entry ? entry.metadata : null;
  }
}

/**
 * Detects whether IndexedDB is available and functional.
 * Safari Private Browsing throws on open; some browsers disable it entirely.
 */
export async function isIndexedDBAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;

  try {
    const testName = '__idb_test__';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(testName, 1);
      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase(testName);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Factory: returns IndexedDB store if available, otherwise in-memory fallback.
 */
export async function createChunkStore(): Promise<ChunkStore> {
  const available = await isIndexedDBAvailable();
  if (available) {
    return new IndexedDBChunkStore();
  }
  console.warn('[ChunkStore] IndexedDB unavailable, using in-memory fallback');
  return new InMemoryChunkStore();
}
