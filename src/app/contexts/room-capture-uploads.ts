/**
 * @file room-capture-uploads.ts
 * @description The archive upload queue of a room capture: one chunk at a time, in order, each retried a few times
 * with a growing wait, then dropped and said so (onDropped) instead of blocking the chunks behind it.
 */
import { isHardStopError, type StoredCapture } from './room-capture-storage';

const UPLOAD_MAX_ATTEMPTS = 3;

export interface UploadJob {
  blob: Blob;
  isLast: boolean;
  attempts: number;
  /** The capture this chunk belongs to, bound when it is queued. End clears storedRef before
   *  the tap's stop flush hands over the tail after that, so reading storedRef at upload time
   *  dropped the last chunk — and a stale job could upload under the NEXT capture's record. */
  record: StoredCapture;
  /** Reserved once, on the first attempt, and reused by every retry. Reserving per attempt
   *  (the first version) turned one transient upload failure into a permanent gap in the chunk
   *  sequence, which the whole-recording pass reads as missing audio (external review). */
  chunkNumber?: number;
}

export interface UploadQueueHandles {
  uploadQueue: UploadJob[];
  uploading: boolean;
}

export interface UploadIo {
  reserve: (roomId: string) => Promise<number>;
  upload: (roomCode: string, displayName: string, memberId: string, blob: Blob, chunkNumber: number, isLast: boolean) => Promise<void>;
  onHardStop: () => void;
  onDropped: () => void;
}

/** Drains the queue; a second call while one is running returns at once. */
export async function pumpUploadQueue(h: UploadQueueHandles, io: UploadIo): Promise<void> {
  if (h.uploading) return;
  h.uploading = true;
  try {
    for (let job = h.uploadQueue[0]; job; job = h.uploadQueue[0]) {
      const { record } = job;
      try {
        // Decision 6: the number is issued by the server, so a reload, a pause/resume or a
        // second visit can never overwrite an earlier chunk.
        if (job.chunkNumber === undefined) job.chunkNumber = await io.reserve(record.roomId);
        await io.upload(record.roomCode, record.displayName, record.memberId, job.blob, job.chunkNumber, job.isLast);
        h.uploadQueue.shift();
      } catch (err) {
        if (isHardStopError(err)) {
          h.uploadQueue.length = 0;
          io.onHardStop();
          return;
        }
        job.attempts += 1;
        if (job.attempts >= UPLOAD_MAX_ATTEMPTS) {
          console.error('[room-capture] archive chunk dropped after retries:', err);
          io.onDropped();
          h.uploadQueue.shift();
        } else {
          await new Promise((r) => setTimeout(r, 2_000 * job.attempts));
        }
      }
    }
  } finally {
    h.uploading = false;
  }
}

/** The "audio lost" notice lives for a minute after the latest loss (see the hook). */
export { useExpiringFlag } from '@/lib/use-expiring-flag';
