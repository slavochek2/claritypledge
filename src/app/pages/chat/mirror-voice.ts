/**
 * @file mirror-voice.ts
 * @description P1576: what a voice note in the mirror chat shows. The SERVER answers a voice note once its transcript
 * is done, so the browser only displays: transcribing, thinking, or "could not transcribe". It never asks.
 */
import type { ChatMessage, ChatTranscriptStatus } from '@/app/data/chat-mappers';
import type { MirrorReplyStatus } from './mirror-state';
import { TRANSCRIPT_STALE_MS } from './voice-view';

/** A finished transcript with nothing in it (a silent clip): the mirror has nothing to answer. */
export const isBlankTranscript = (t: string | null | undefined): boolean => !(t ?? '').trim();

/** The status line for a voice note's transcript state. `done` with words means the server is answering now. */
export function voiceStatus(audio: NonNullable<ChatMessage['audio']>): MirrorReplyStatus | undefined {
  switch (audio.transcriptStatus) {
    case 'pending':
      return 'transcribing';
    case 'failed':
      return 'transcript_failed';
    default:
      return isBlankTranscript(audio.transcript) ? 'transcript_failed' : 'thinking';
  }
}

/**
 * Of these ids (the owner's messages with no reply), the voice notes whose transcript state is shown on open: failed
 * or blank-done ones ('failed', so the reason shows) and pending ones young enough to still finish ('pending').
 * A done note with words needs nothing here: its mirror job (or the reply itself) says what is happening.
 */
export function voiceStatesToResume(rows: ChatMessage[], ids: string[], now: number = Date.now()): Record<string, ChatTranscriptStatus> {
  const want = new Set(ids);
  const out: Record<string, ChatTranscriptStatus> = {};
  for (const m of rows) {
    if (!want.has(m.id) || !m.audio) continue;
    const t = m.audio.transcriptStatus;
    if (t === 'failed' || (t === 'done' && isBlankTranscript(m.audio.transcript))) out[m.id] = 'failed';
    else if (t === 'pending' && now - Date.parse(m.createdAt) <= TRANSCRIPT_STALE_MS) out[m.id] = 'pending';
  }
  return out;
}
