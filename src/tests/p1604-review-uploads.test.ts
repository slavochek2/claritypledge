/**
 * P1604 review finding 2: a queued chunk of an EARLIER room that is refused (410) after the capture moved on to Part 2 must be
 * dropped and said so, never hard-stop the live capture. Only the CURRENT room's refusal reaches the caller.
 */
import { describe, it, expect, vi } from 'vitest';
import { pumpUploadQueue, type UploadJob } from '@/app/contexts/room-capture-uploads';
import type { StoredCapture } from '@/app/contexts/room-capture-storage';

const rec = (roomId: string): StoredCapture => ({
  userId: 'u1', roomId, roomCode: `C-${roomId}`, memberId: `m-${roomId}`, eventId: null, joinedAt: 'x', displayName: 'A',
});
const job = (roomId: string): UploadJob => ({ blob: new Blob(['x']), isLast: false, attempts: 0, record: rec(roomId) });
const refused = () => new Error('Failed to get signed URL: 410 This room has ended');

function io(over: Partial<Parameters<typeof pumpUploadQueue>[1]> = {}) {
  return {
    reserve: vi.fn().mockResolvedValue(0),
    upload: vi.fn().mockResolvedValue(undefined),
    onHardStop: vi.fn(),
    onDropped: vi.fn(),
    currentRoomId: () => 'room-2',
    ...over,
  };
}

describe('the upload queue after a move to Part 2', () => {
  it('drops a refused chunk of the earlier room, says audio was lost, and keeps going with the current room\'s chunks', async () => {
    const h = { uploadQueue: [job('room-1'), job('room-2')], uploading: false };
    const upload = vi.fn()
      .mockRejectedValueOnce(refused())
      .mockResolvedValue(undefined);
    const i = io({ upload });
    await pumpUploadQueue(h, i);
    expect(i.onHardStop, 'a refusal of an old room never stops the live capture').not.toHaveBeenCalled();
    expect(i.onDropped).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][0]).toBe('C-room-2');
    expect(h.uploadQueue).toHaveLength(0);
  });

  it('a refusal for the CURRENT room still reaches the caller, and clears the queue', async () => {
    const h = { uploadQueue: [job('room-2'), job('room-2')], uploading: false };
    const i = io({ upload: vi.fn().mockRejectedValue(refused()) });
    await pumpUploadQueue(h, i);
    expect(i.onHardStop).toHaveBeenCalledTimes(1);
    expect(h.uploadQueue).toHaveLength(0);
  });

  it('with no current room (the capture ended) an old room\'s refusal is dropped, not a stop', async () => {
    const h = { uploadQueue: [job('room-1')], uploading: false };
    const i = io({ upload: vi.fn().mockRejectedValue(refused()), currentRoomId: () => null });
    await pumpUploadQueue(h, i);
    expect(i.onHardStop).not.toHaveBeenCalled();
    expect(i.onDropped).toHaveBeenCalled();
  });
});

describe('final-look batch: the last chunk reports that the seat has finished uploading', () => {
  const last = (roomId: string): UploadJob => ({ ...job(roomId), isLast: true });

  it('after the isLast chunk uploads, flushed(room) is called once, after the upload', async () => {
    const order: string[] = [];
    const h = { uploadQueue: [job('room-2'), last('room-2')], uploading: false };
    const i = io({
      upload: vi.fn().mockImplementation(async () => { order.push('upload'); }),
      flushed: vi.fn().mockImplementation(() => { order.push('flushed'); }),
    });
    await pumpUploadQueue(h, i);
    expect(i.flushed).toHaveBeenCalledTimes(1);
    expect(i.flushed).toHaveBeenCalledWith('room-2');
    expect(order).toEqual(['upload', 'upload', 'flushed']);
  });

  it('a middle chunk reports nothing (control)', async () => {
    const h = { uploadQueue: [job('room-2')], uploading: false };
    const i = io({ flushed: vi.fn() });
    await pumpUploadQueue(h, i);
    expect(i.flushed).not.toHaveBeenCalled();
  });

  it('a last chunk that is dropped after its retries still reports: nothing more is coming from this seat', async () => {
    vi.useFakeTimers();
    const h = { uploadQueue: [last('room-2')], uploading: false };
    const i = io({ upload: vi.fn().mockRejectedValue(new Error('network')), flushed: vi.fn() });
    const run = pumpUploadQueue(h, i);
    await vi.advanceTimersByTimeAsync(20_000);
    await run;
    vi.useRealTimers();
    expect(i.onDropped).toHaveBeenCalled();
    expect(i.flushed).toHaveBeenCalledWith('room-2');
  });
});
