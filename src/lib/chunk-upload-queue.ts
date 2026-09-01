/**
 * @file chunk-upload-queue.ts
 * @description P566: Upload queue with state machine for reliable audio chunk uploads.
 *
 * Processes chunks sequentially with exponential backoff retry.
 * The queue is agnostic of GCS/signed URLs — the caller provides the upload function.
 */

import type { ChunkStore, ChunkMetadata } from './chunk-store';
import { analytics } from './mixpanel';

/** Queue processing state */
export type QueueState = 'idle' | 'uploading' | 'retrying' | 'stalled';

/** Connection health derived from success/failure patterns */
export type UploadHealth = 'healthy' | 'degraded' | 'critical';

/** Progress callback payload */
export interface UploadProgress {
  uploaded: number;
  total: number;
}

/** Upload function signature — caller provides this */
export type UploadFn = (chunkKey: string, blob: Blob, metadata: ChunkMetadata) => Promise<void>;

/** Retry config */
const MAX_ATTEMPTS = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30000;

/** Health transition thresholds */
const DEGRADED_THRESHOLD = 3; // consecutive failures → degraded
const HEALTHY_THRESHOLD = 3;  // consecutive successes → healthy

export class ChunkUploadQueue {
  private queue: string[] = [];
  private uploadedCount = 0;
  private totalCount = 0;
  private state: QueueState = 'idle';
  private health: UploadHealth = 'healthy';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private processing = false;
  private uploadFn: UploadFn | null = null;
  private store: ChunkStore;

  private drainResolvers: Array<() => void> = [];
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

  /** Callbacks */
  onHealthChange: ((health: UploadHealth) => void) | null = null;
  onProgress: ((progress: UploadProgress) => void) | null = null;

  constructor(store: ChunkStore) {
    this.store = store;
  }

  /** Add a chunk key to the upload queue */
  enqueue(chunkKey: string): void {
    this.queue.push(chunkKey);
    this.totalCount++;
    this.emitProgress();
    this.updateBeforeUnload();
    this.processNext();
  }

  /** Begin processing with the provided upload function */
  start(uploadFn: UploadFn): void {
    this.uploadFn = uploadFn;
    this.processNext();
  }

  /** Returns a promise that resolves when the queue is empty */
  drain(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  /** Number of chunks still pending */
  getPendingCount(): number {
    return this.queue.length;
  }

  /** Total chunks enqueued (uploaded + pending) */
  getTotalCount(): number {
    return this.totalCount;
  }

  /** Current queue state */
  getState(): QueueState {
    return this.state;
  }

  /** Current health */
  getHealth(): UploadHealth {
    return this.health;
  }

  /**
   * Static method: scan IndexedDB for orphaned chunks from previous sessions.
   * Uploads chunks younger than maxAgeMs, deletes chunks older than maxAgeMs.
   */
  static async uploadOrphanedChunks(
    store: ChunkStore,
    maxAgeMs: number,
    uploadFn: UploadFn,
  ): Promise<void> {
    try {
      const keys = await store.getAllChunkKeys();
      if (keys.length === 0) return;

      // eslint-disable-next-line no-console -- P566 orphan-recovery diagnostic; dev-only (P1200)
      if (import.meta.env.DEV) console.log(`[UploadQueue] Found ${keys.length} orphaned chunks`);
      const now = Date.now();

      for (const key of keys) {
        const chunk = await store.getChunk(key);
        if (!chunk) continue;

        const age = now - chunk.metadata.createdAt;
        if (age > maxAgeMs) {
          // eslint-disable-next-line no-console -- P566 orphan-recovery diagnostic; dev-only (P1200)
          if (import.meta.env.DEV) console.log(`[UploadQueue] Deleting expired orphan: ${key} (age: ${Math.round(age / 1000)}s)`);
          await store.deleteChunk(key);
        } else {
          try {
            // eslint-disable-next-line no-console -- P566 orphan-recovery diagnostic; dev-only (P1200)
            if (import.meta.env.DEV) console.log(`[UploadQueue] Uploading orphan: ${key}`);
            await uploadFn(key, chunk.blob, chunk.metadata);
            await store.deleteChunk(key);
            analytics.track('audio_chunk_recovered', {
              session_code: chunk.metadata.sessionCode,
              chunk_number: chunk.metadata.chunkNumber,
              recovery_source: 'indexeddb',
            });
          } catch (err) {
            console.error(`[UploadQueue] Failed to upload orphan ${key}:`, err);
            // Leave in store for next attempt
          }
        }
      }
    } catch (err) {
      console.error('[UploadQueue] Error processing orphaned chunks:', err);
    }
  }

  /** Cleanup listeners and resolve drain promises */
  destroy(): void {
    this.removeBeforeUnload();
    // Resolve any pending drain promises
    for (const resolve of this.drainResolvers) {
      resolve();
    }
    this.drainResolvers = [];
    this.onHealthChange = null;
    this.onProgress = null;
  }

  // ---- Internal ----

  private async processNext(): Promise<void> {
    if (this.processing || !this.uploadFn || this.queue.length === 0) return;

    this.processing = true;
    const chunkKey = this.queue[0];

    let attempts = 0;
    let uploaded = false;

    while (attempts < MAX_ATTEMPTS && !uploaded) {
      attempts++;
      this.setState(attempts === 1 ? 'uploading' : 'retrying');

      // Hoisted out of the try so the catch block can reference it (P861:
      // a `const chunk` inside try was out of scope in catch → ReferenceError
      // at runtime on the failure path, masked by a no-op pre-commit type gate).
      let chunk: { blob: Blob; metadata: ChunkMetadata } | null = null;

      try {
        chunk = await this.store.getChunk(chunkKey);
        if (!chunk) {
          // Chunk was already deleted (e.g., by orphan cleanup)
          console.warn(`[UploadQueue] Chunk ${chunkKey} not found in store, skipping`);
          uploaded = true;
          break;
        }

        await this.uploadFn(chunkKey, chunk.blob, chunk.metadata);
        await this.store.deleteChunk(chunkKey);
        uploaded = true;

        // Track recovery if this succeeded after at least one retry
        if (attempts > 1) {
          analytics.track('audio_chunk_recovered', {
            session_code: chunk.metadata.sessionCode,
            chunk_number: chunk.metadata.chunkNumber,
            recovery_source: 'retry',
          });
        }

        // Update health on success
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        if (this.health === 'critical') {
          this.setHealth('degraded');
        } else if (this.health === 'degraded' && this.consecutiveSuccesses >= HEALTHY_THRESHOLD) {
          this.setHealth('healthy');
        }
      } catch (err) {
        console.error(`[UploadQueue] Upload attempt ${attempts}/${MAX_ATTEMPTS} for ${chunkKey}:`, err);

        analytics.track('audio_chunk_upload_failed', {
          session_code: chunk?.metadata.sessionCode ?? 'unknown',
          chunk_number: chunk?.metadata.chunkNumber ?? -1,
          error_type: err instanceof Error ? err.message : 'unknown',
          retry_count: attempts - 1,
        });

        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        // Health transitions on failure
        if (this.health === 'healthy' && this.consecutiveFailures >= DEGRADED_THRESHOLD) {
          this.setHealth('degraded');
        }

        if (attempts < MAX_ATTEMPTS) {
          const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempts - 1), BACKOFF_CAP_MS);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!uploaded) {
      // All retries exhausted for this chunk
      console.error(`[UploadQueue] Giving up on chunk ${chunkKey} after ${MAX_ATTEMPTS} attempts`);
      this.setHealth('critical');
      this.setState('stalled');
    }

    // Remove from queue regardless (don't block on permanently failing chunks)
    this.queue.shift();
    this.uploadedCount++;
    this.processing = false;
    this.emitProgress();
    this.updateBeforeUnload();

    if (this.queue.length === 0) {
      this.setState('idle');
      // Resolve drain promises
      for (const resolve of this.drainResolvers) {
        resolve();
      }
      this.drainResolvers = [];
    } else {
      // Process next chunk
      this.processNext();
    }
  }

  private setState(state: QueueState): void {
    this.state = state;
  }

  private setHealth(health: UploadHealth): void {
    if (this.health !== health) {
      this.health = health;
      this.onHealthChange?.(health);
    }
  }

  private emitProgress(): void {
    this.onProgress?.({
      uploaded: this.uploadedCount,
      total: this.totalCount,
    });
  }

  private updateBeforeUnload(): void {
    if (this.queue.length > 0 && !this.beforeUnloadHandler) {
      this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    } else if (this.queue.length === 0 && this.beforeUnloadHandler) {
      this.removeBeforeUnload();
    }
  }

  private removeBeforeUnload(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }
}
