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
  /** The CURRENT capture's room was refused (410/403). A refusal of an earlier room never reaches it. */
  onHardStop: () => void;
  onDropped: () => void;
  /** P1604 rule 8: the room the live capture is in now, or null when none. */
  currentRoomId: () => string | null;
  /** The seat's last chunk is done (uploaded, or dropped for good): nothing more will come from it. Lets the server start the clean pass early. */
  flushed?: (roomId: string) => void;
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
        if (job.isLast) io.flushed?.(record.roomId);
      } catch (err) {
        if (isHardStopError(err)) {
          if (record.roomId !== io.currentRoomId()) {
            // A chunk of an EARLIER room (Part 1) refused after the capture moved on: that audio is lost and said so, but the
            // live capture in the current room must not stop for it.
            console.error('[room-capture] archive chunk of an earlier room was refused and dropped:', err);
            io.onDropped();
            h.uploadQueue.shift();
            continue;
          }
          h.uploadQueue.length = 0;
          io.onHardStop();
          return;
        }
        job.attempts += 1;
        if (job.attempts >= UPLOAD_MAX_ATTEMPTS) {
          console.error('[room-capture] archive chunk dropped after retries:', err);
          io.onDropped();
          h.uploadQueue.shift();
          if (job.isLast) io.flushed?.(record.roomId);
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
