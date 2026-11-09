/**
 * P1652: Copy text. Which words a message offers, and the clipboard result (success toast, or an error when the browser refuses).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { copyableText, copyMessageText } from '@/app/pages/chat/message-copy';

const base = { isDeleted: false, body: null, forwardSnapshot: null, audio: null, createdAt: new Date().toISOString() } as unknown as Parameters<typeof copyableText>[0];
const msg = (o: Record<string, unknown>) => ({ ...base, ...o }) as Parameters<typeof copyableText>[0];

describe('copyableText', () => {
  it('own words first, exactly as stored (no trimming)', () => {
    expect(copyableText(msg({ body: '  hello\nworld  ' }))).toBe('  hello\nworld  ');
  });
  it('a pure forward offers the copied words', () => {
    expect(copyableText(msg({ forwardSnapshot: { body: 'copied words' } }))).toBe('copied words');
  });
  it('own words win over a forward note below', () => {
    expect(copyableText(msg({ body: 'my note', forwardSnapshot: { body: 'copied' } }))).toBe('my note');
  });
  it('a voice note offers its transcript once ready, nothing before', () => {
    const ready = { durationMs: 1000, transcript: 'spoken words', transcriptStatus: 'done', hasAudio: true, audioWaveform: null };
    expect(copyableText(msg({ audio: ready }))).toBe('spoken words');
    expect(copyableText(msg({ audio: { ...ready, transcript: null, transcriptStatus: 'pending' } }))).toBeNull();
    expect(copyableText(msg({ audio: { ...ready, transcript: '' } }))).toBeNull();
  });
  it('nothing for a deleted message or one with no words', () => {
    expect(copyableText(msg({ isDeleted: true, body: 'x' }))).toBeNull();
    expect(copyableText(msg({}))).toBeNull();
    expect(copyableText(msg({ body: '   ' }))).toBeNull();
  });
});

describe('copyMessageText', () => {
  beforeEach(() => vi.clearAllMocks());
  it('puts the exact words on the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copyMessageText('exact words')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('exact words');
    expect(toast).toHaveBeenCalledWith('Copied');
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('reports an error when the browser refuses (control: the success case above)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    expect(await copyMessageText('x')).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
  it('reports an error when there is no clipboard at all', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    expect(await copyMessageText('x')).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });
});
