/**
 * @file DictationControls.tsx
 * @description P1576 Part A: the composer's dictation UI, kept out of Composer.tsx so the composer
 * only has to place three pieces: the mic, the recorder bar that takes the field's place while
 * recording, and the status line under it. The wiring to the draft is `use-composer-dictation.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { levelFromTimeDomain } from '@/lib/audio/audio-level';
import type { Dictation } from '@/hooks/use-dictation';
import type { ComposerDictation } from './use-composer-dictation';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import { ErrorNotice, NoticeButton } from './ErrorNotice';

export function DictationMic({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label="Dictate a message"
      title="Dictate a message"
      disabled={disabled}
      onClick={onClick}
      className={cn(ROUND, 'absolute bottom-0 right-0 text-muted-foreground disabled:opacity-50', HOVER, FOCUS_RING)}
    >
      <Mic className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

const BARS = 24;
/** On a phone the row is tight: only the newest bars show, still enough to see the mic is live. */
const COMPACT_BARS = 10;

/** The recent input level as a row of bars. Silent (flat) where the browser cannot meter the stream. */
function LevelBars({ stream }: { stream: MediaStream | null }) {
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: BARS }, () => 0));
  useEffect(() => {
    if (!stream) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    let context: AudioContext;
    try {
      context = new Ctx();
    } catch {
      return;
    }
    void context.resume?.().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // never to the destination: the mic must not play through the speakers
    const data = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      const level = levelFromTimeDomain(data);
      setLevels((prev) => [...prev.slice(1), level]);
    }, 70);
    return () => {
      clearInterval(timer);
      source.disconnect();
      void context.close().catch(() => {});
    };
  }, [stream]);
  return (
    <div aria-hidden="true" className="flex h-6 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" data-testid="dictation-level">
      {levels.map((level, i) => (
        <span
          key={i}
          // shrink-0: a flex child with a fixed width still shrinks to nothing when the row is tight, which emptied the meter at 320 px.
          className={cn('w-[3px] shrink-0 rounded-full bg-blue-500/80', i < BARS - COMPACT_BARS && 'hidden sm:block')}
          style={{ height: `${Math.max(14, Math.round(level * 100))}%` }}
        />
      ))}
    </div>
  );
}

/** Takes the field's place while recording or transcribing: Listening… + level, ✕ cancel, ✓ done. */
export function DictationBar({ dictation }: { dictation: Dictation }) {
  const doneButton = useRef<HTMLButtonElement>(null);
  const recording = dictation.phase === 'recording';
  useEffect(() => {
    if (recording) doneButton.current?.focus();
  }, [recording]);
  // Escape cancels. On the document, not the bar: the bar is not an interactive element.
  const cancel = dictation.cancel;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      void cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [recording, cancel]);

  return (
    <div
      className="flex min-h-10 min-w-0 flex-1 items-center gap-1"
      data-testid="dictation-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3" role="status">
        <span className="shrink-0 text-base text-gray-600 md:text-[15px]">{recording ? 'Listening…' : 'Transcribing…'}</span>
        {recording && <LevelBars stream={dictation.stream} />}
      </div>
      {recording && (
        <button type="button" aria-label="Cancel dictation" title="Cancel" onClick={() => void dictation.cancel()} className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {recording ? (
        <button ref={doneButton} type="button" aria-label="Finish dictation" title="Done" onClick={() => void dictation.done()} className={cn(ROUND, 'border border-gray-400 bg-background text-foreground hover:bg-accent', FOCUS_RING)}>
          <Check className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" aria-label="Transcribing" disabled className={cn(ROUND, 'border border-gray-400 bg-background text-muted-foreground')}>
          <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** The recorder bar that replaces the row while dictating; nothing otherwise. */
export function DictationSlot({ slots, dict }: { slots: { bar: boolean }; dict: ComposerDictation }) {
  return slots.bar ? <DictationBar dictation={dict.dictation} /> : null;
}

/**
 * The mic inside the field's own frame, at its right edge (the field keeps a gutter so text never runs under it).
 * Disabled, never merely dead, while a prompt, a clip or a failed clip is waiting; `blocked`: a voice note is mid-way.
 */
export function FieldMic({ slots, dict, blocked }: { slots: { mic: boolean }; dict: ComposerDictation; blocked: boolean }) {
  return slots.mic ? <DictationMic onClick={dict.begin} disabled={dict.micBusy || blocked} /> : null;
}

/** Dictated words that did not fit this chat's draft: said plainly, kept, and offered again. */
export function DictationOverflow({ fits, onRetry, onDiscard }: { fits: boolean; onRetry: () => void; onDiscard: () => void }) {
  // Once the draft has room (it was sent, or cleared) "too long" is no longer true: the words are just waiting.
  return (
    <ErrorNotice testId="dictation-overflow" message={fits ? 'Dictated text is waiting.' : 'Too long to fit. Shorten your message, then retry.'}>
      {fits
        ? <NoticeButton label="Insert dictated text" primary onClick={onRetry}>Insert</NoticeButton>
        : <NoticeButton label="Retry" primary onClick={onRetry}>Retry</NoticeButton>}
      <NoticeButton label="Discard dictated text" onClick={onDiscard}>Discard</NoticeButton>
    </ErrorNotice>
  );
}

/** Under the field: a failed transcription (Retry / Discard) or a one-line notice (mic denied, nothing heard). */
export function DictationStatus({ dictation }: { dictation: Dictation }) {
  if (dictation.phase === 'error') {
    return (
      <ErrorNotice testId="dictation-status" message={dictation.errorText ?? "Couldn't transcribe."}>
        {dictation.canRetry && <NoticeButton label="Retry" primary onClick={() => void dictation.retry()}>Retry</NoticeButton>}
        <NoticeButton label="Discard recording" onClick={dictation.discard}>Discard</NoticeButton>
      </ErrorNotice>
    );
  }
  if (dictation.notice) {
    return (
      <p role="status" data-testid="dictation-status" className="px-3 pb-1 text-sm text-gray-700">
        {dictation.notice}
      </p>
    );
  }
  return null;
}
