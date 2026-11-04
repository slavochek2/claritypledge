/**
 * @file room-capture-upload-io.ts
 * @description The live capture's upload wiring (server-issued chunk numbers, the upload, the report that the last chunk is done),
 * split out of room-capture-context.tsx (its size limit). Kept apart from room-capture-uploads.ts so that module stays free of the
 * data layer and its tests need none of it.
 */
import { reserveRoomChunkNumber } from '@/app/data/transcribe-service';
import { reportAudioFlushed } from '@/app/data/transcribe-capture-status';
import { uploadRoomAudioChunk } from '@/app/data/api';
import type { UploadIo } from './room-capture-uploads';

/** The live capture's upload wiring: server-issued chunk numbers, the upload itself, and the report that the last chunk is done. */
export function makeUploadIo(handlers: { onHardStop: () => void; onDropped: () => void; currentRoomId: () => string | null }): UploadIo {
  return {
    reserve: reserveRoomChunkNumber,
    upload: uploadRoomAudioChunk,
    ...handlers,
    flushed: (roomId) => { try { void reportAudioFlushed(roomId); } catch { /* the pass then waits its full bound */ } },
  };
}
