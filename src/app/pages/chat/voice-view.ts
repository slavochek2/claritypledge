/**
 * @file voice-view.ts
 * @description P1576 Part B: the pure decisions behind a voice note on screen: clock text, what the
 * transcript line says, and which of two copies of a voice note is further along.
 */
import type { ChatAudio, ChatMessage } from '@/app/data/chat-mappers';

/** A transcript still "pending" this long after the note was sent is not coming. */
export const TRANSCRIPT_STALE_MS = 10 * 60_000;

/** m:ss, flooring the second (a running timer). */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** m:ss for a stored length, rounding UP so a real clip never reads 0:00. */
export function formatDuration(ms: number): string {
  return formatClock(Math.ceil(ms / 1000) * 1000);
}

export type TranscriptView =
  | { kind: 'transcribing' }
  | { kind: 'unavailable' }
  | { kind: 'silent' }
  | { kind: 'text'; text: string };

/** What the line under a voice note says, from the server's transcript state and the note's age. */
export function transcriptView(audio: ChatAudio, createdAt: string, now: Date = new Date()): TranscriptView {
  if (audio.transcriptStatus === 'failed') return { kind: 'unavailable' };
  if (audio.transcriptStatus === 'pending') {
    const age = now.getTime() - Date.parse(createdAt);
    return age > TRANSCRIPT_STALE_MS ? { kind: 'unavailable' } : { kind: 'transcribing' };
  }
  if (audio.transcript === null) return { kind: 'unavailable' };
  return audio.transcript === '' ? { kind: 'silent' } : { kind: 'text', text: audio.transcript };
}

/** How far a voice note's server-side life has gone: transcript settled, then audio removed. -1 for no audio. */
function voiceProgress(m: Pick<ChatMessage, 'audio'>): number {
  const a = m.audio;
  if (!a) return -1;
  return (a.transcriptStatus === 'pending' ? 0 : 1) + (a.hasAudio ? 0 : 2);
}

/**
 * Of two copies of one voice note, the one that is further along, or null when neither is (or it is
 * not a voice note). A late refetch that began before the transcript landed must never send a note
 * back to "Transcribing…", nor bring back audio retention already removed.
 */
export function moreAdvancedVoice<T extends Pick<ChatMessage, 'audio'>>(have: T, incoming: T): T | null {
  const ahead = voiceProgress(incoming) - voiceProgress(have);
  if (!have.audio || !incoming.audio || ahead === 0) return null;
  return ahead > 0 ? incoming : have;
}
