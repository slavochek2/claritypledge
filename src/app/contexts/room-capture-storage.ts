/**
 * @file room-capture-storage.ts
 * @description P1307: the running capture, persisted per browser so a reload re-attaches and a
 * second tab observes; and the one error test that says a slice or upload was refused for good.
 * Split out of room-capture-context.tsx (its size limit), unchanged.
 */

import type { CaptureRoomInfo } from './room-capture-core';

/** The running capture, per browser, so a reload re-attaches and a second tab observes. */
export const CAPTURE_STORAGE_KEY = 'cp_room_capture';

export interface StoredCapture {
  userId: string;
  roomId: string;
  roomCode: string;
  memberId: string;
  eventId: string | null;
  /** P1604: the chat and the room's clock; absent on a capture stored by an older build. */
  conversationId?: string | null;
  roomCreatedAt?: string | null;
  joinedAt: string;
  displayName: string;
}

/** What a started capture remembers (P1604 adds the chat and the room's clock), and the room as callers see it. */
export function buildCaptureRecord(
  userId: string,
  room: CaptureRoomInfo & { createdAt?: string },
  member: { id: string; joinedAt?: string | null; displayName?: string },
  displayName: string,
): { record: StoredCapture; roomInfo: CaptureRoomInfo } {
  const roomInfo = {
    id: room.id, code: room.code, eventId: room.eventId,
    conversationId: room.conversationId ?? null, roomCreatedAt: room.roomCreatedAt ?? room.createdAt ?? null,
  };
  const record: StoredCapture = {
    userId, roomId: room.id, roomCode: room.code, memberId: member.id, eventId: room.eventId,
    joinedAt: member.joinedAt ?? '', displayName: member.displayName ?? displayName,
    conversationId: roomInfo.conversationId, roomCreatedAt: roomInfo.roomCreatedAt,
  };
  return { record, roomInfo };
}

export function readStoredCapture(): StoredCapture | null {
  try {
    const raw = localStorage.getItem(CAPTURE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCapture;
    return parsed.userId && parsed.roomId && parsed.memberId && parsed.roomCode ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredCapture(record: StoredCapture): void {
  try {
    localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(record));
  } catch { /* private browsing — reload resume is lost, capture itself is not */ }
}

export function clearStoredCapture(): void {
  try {
    localStorage.removeItem(CAPTURE_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function isHardStopError(err: unknown): boolean {
  // transcribe-slice: "transcribe-slice 410: …"; gcs-signed-url via api.ts:
  // "Failed to get signed URL: 410 …". A 403 means this person is no longer a consented member.
  const message = err instanceof Error ? err.message : String(err);
  return /(?:transcribe-slice|signed URL:) (?:403|410)\b/.test(message);
}
