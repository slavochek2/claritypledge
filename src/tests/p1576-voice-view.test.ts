/**
 * P1576 Part B (client): the pure rules behind the voice bubble, the list preview and the
 * Realtime merge. The bubble and recorder are tested through the DOM elsewhere; these are the
 * decisions they depend on, each shown to fail without its rule.
 */
import { describe, it, expect } from 'vitest';
import type { ChatAudio, ChatMessage } from '@/app/data/chat-mappers';
import { listBody } from '@/app/data/chat-mappers';
import { newerVersion, upsertMessage, replaceLoaded } from '@/app/pages/chat/chat-view-model';
import { messageSummary, chatErrorText } from '@/app/pages/chat/chat-view-model';
import { formatClock, formatDuration, transcriptView, TRANSCRIPT_STALE_MS } from '@/app/pages/chat/voice-view';
import { samplesToWav16k } from '@/lib/audio/clip-wav';
import { parseWavHeader } from '../../supabase/functions/_shared/gemini-transcribe';

const audio = (over: Partial<ChatAudio> = {}): ChatAudio => ({ durationMs: 5000, transcript: null, transcriptStatus: 'pending', hasAudio: true, audioWaveform: null, ...over });
const voice = (over: Partial<ChatMessage> = {}, a: Partial<ChatAudio> = {}): ChatMessage => ({
  id: 'm1', conversationId: 'c1', authorId: 'user-id-1234', body: null, createdAt: '2026-01-01T10:00:00.000Z', editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null,
  forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null,
  audio: audio(a), ...over,
});

describe('formatClock / formatDuration', () => {
  it('formats m:ss, flooring a running timer', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(999)).toBe('0:00');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(125_000)).toBe('2:05');
  });

  it('a stored duration never shows 0:00 for a real clip (rounds up to the next second)', () => {
    expect(formatDuration(400)).toBe('0:01');
    expect(formatDuration(5000)).toBe('0:05');
    expect(formatDuration(5001)).toBe('0:06');
    expect(formatDuration(120_000)).toBe('2:00');
  });

  it('clamps nonsense to 0:00', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('transcriptView', () => {
  const created = '2026-01-01T10:00:00.000Z';
  const at = (ms: number) => new Date(Date.parse(created) + ms);

  it('pending shows Transcribing…', () => {
    expect(transcriptView(audio(), created, at(60_000))).toEqual({ kind: 'transcribing' });
  });

  it('pending for longer than 10 minutes reads as unavailable', () => {
    expect(transcriptView(audio(), created, at(TRANSCRIPT_STALE_MS - 1))).toEqual({ kind: 'transcribing' });
    expect(transcriptView(audio(), created, at(TRANSCRIPT_STALE_MS + 1))).toEqual({ kind: 'unavailable' });
  });

  it('failed is unavailable at any age', () => {
    expect(transcriptView(audio({ transcriptStatus: 'failed' }), created, at(1000))).toEqual({ kind: 'unavailable' });
  });

  it('done with text offers the text', () => {
    expect(transcriptView(audio({ transcriptStatus: 'done', transcript: 'hello there' }), created, at(1000))).toEqual({ kind: 'text', text: 'hello there' });
  });

  it('done with an empty transcript is a silent clip, not a failure', () => {
    expect(transcriptView(audio({ transcriptStatus: 'done', transcript: '' }), created, at(1000))).toEqual({ kind: 'silent' });
  });

  it('done but a null transcript is treated as unavailable rather than shown as empty text', () => {
    expect(transcriptView(audio({ transcriptStatus: 'done', transcript: null }), created, at(1000))).toEqual({ kind: 'unavailable' });
  });

  it('an unparseable created_at never claims the transcript is stale', () => {
    expect(transcriptView(audio(), 'garbage', at(0))).toEqual({ kind: 'transcribing' });
  });
});

describe('newerVersion keeps the more advanced voice state (caveat 1)', () => {
  it('a late refetch that still says pending does not overwrite done', () => {
    const done = voice({}, { transcriptStatus: 'done', transcript: 'words' });
    const stale = voice({}, { transcriptStatus: 'pending' });
    expect(newerVersion(done, stale)).toBe(done);
  });

  it('nor failed', () => {
    const failed = voice({}, { transcriptStatus: 'failed' });
    expect(newerVersion(failed, voice({}, { transcriptStatus: 'pending' }))).toBe(failed);
  });

  it('CONTROL: done after pending still wins, as before', () => {
    const pending = voice({}, { transcriptStatus: 'pending' });
    const done = voice({}, { transcriptStatus: 'done', transcript: 'words' });
    expect(newerVersion(pending, done)).toBe(done);
  });

  it('a stale copy that still has audio does not undo retention', () => {
    const expired = voice({}, { transcriptStatus: 'done', transcript: 'w', hasAudio: false });
    const stale = voice({}, { transcriptStatus: 'done', transcript: 'w', hasAudio: true });
    expect(newerVersion(expired, stale)).toBe(expired);
  });

  it('a delete still beats everything', () => {
    const done = voice({}, { transcriptStatus: 'done', transcript: 'w' });
    const gone = voice({ isDeleted: true, audio: null });
    expect(newerVersion(done, gone)).toBe(gone);
  });

  it('holds through the list merges that call it', () => {
    const done = voice({}, { transcriptStatus: 'done', transcript: 'w' });
    const stale = voice({}, { transcriptStatus: 'pending' });
    expect(upsertMessage([done], stale)[0]).toBe(done);
    expect(replaceLoaded([done], stale)[0]).toBe(done);
  });

  it('messages without audio behave exactly as before (an edit still wins by time)', () => {
    const a = voice({ body: 'a', audio: null });
    const b = voice({ body: 'b', audio: null, editedAt: '2026-01-01T10:05:00.000Z' });
    expect(newerVersion(a, b)).toBe(b);
    expect(newerVersion(b, a)).toBe(b);
  });
});

describe('list preview and quote text (caveat 2)', () => {
  it('a voice note previews as Voice message in the chat list, matching the server', () => {
    expect(listBody(voice())).toBe('Voice message');
  });

  it('an ordinary message previews as its body, a deleted one as Message deleted', () => {
    expect(listBody(voice({ body: 'hi', audio: null }))).toBe('hi');
    expect(listBody(voice({ isDeleted: true, audio: null }))).toBe('Message deleted');
  });

  it('a quote bar says Voice message for a voice note', () => {
    expect(messageSummary(voice())).toBe('Voice message');
    expect(messageSummary(voice({ body: 'hi', audio: null }))).toBe('hi');
  });

  it('CONTROL: existing summaries are unchanged', () => {
    expect(messageSummary(voice({ isDeleted: true, audio: null }))).toBe('Message deleted');
    expect(messageSummary(voice({ audio: null, attachmentKind: 'point' }))).toBe('A point');
    expect(chatErrorText(new Error('chat: message too long'))).toMatch(/too long/);
  });
});

describe('clip length is trimmed to the server cap', () => {
  it('a 121 s capture is cut to exactly 120 s so the server can never see a clip over its cap', () => {
    const wav = samplesToWav16k(new Float32Array(48_000 * 121), 48_000, 120_000);
    expect(parseWavHeader(wav)?.durationMs).toBe(120_000);
  });

  it('a shorter capture is untouched', () => {
    expect(parseWavHeader(samplesToWav16k(new Float32Array(48_000 * 5), 48_000, 120_000))?.durationMs).toBe(5000);
  });

  it('with no cap given, nothing is trimmed (dictation path unchanged)', () => {
    expect(parseWavHeader(samplesToWav16k(new Float32Array(16_000 * 7), 16_000))?.durationMs).toBe(7000);
  });
});
