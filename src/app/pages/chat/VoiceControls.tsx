/**
 * @file VoiceControls.tsx
 * @description P1576 Part B: the composer's voice-note UI. The round mic that takes the send slot when
 * there is nothing to send, and the recorder bar that replaces the row while a note is being made:
 * red dot, timer, bin and send. State lives in `useVoiceNote`; this file only draws it.
 */
import { useEffect, useRef } from 'react';
import { AudioLines, Loader2, SendHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoiceNote } from '@/hooks/use-voice-note';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import { DictationOverflow, DictationStatus } from './DictationControls';
import { ErrorNotice, NoticeButton } from './ErrorNotice';
import type { ComposerDictation } from './use-composer-dictation';
import { formatClock } from './voice-view';

export function VoiceMic({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label="Record a voice message"
      title="Record a voice message"
      disabled={disabled}
      onClick={onClick}
      className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50', FOCUS_RING)}
    >
      <AudioLines className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

/** Failure in the bar's place: the plain sentence in the error colour, Retry when the same clip could still go, and Discard. */
function VoiceFailed({ voice }: { voice: VoiceNote }) {
  return (
    <ErrorNotice testId="voice-failed" message={voice.errorText}>
      {voice.canRetry && <NoticeButton label="Retry" primary onClick={() => void voice.retry()}>Retry</NoticeButton>}
      <NoticeButton label="Discard voice message" onClick={voice.discard}>Discard</NoticeButton>
    </ErrorNotice>
  );
}

/** Takes the row while recording, sending or holding a clip at the limit. */
export function VoiceBar({ voice }: { voice: VoiceNote }) {
  const sendButton = useRef<HTMLButtonElement>(null);
  const live = voice.phase === 'recording' || voice.phase === 'ready';
  const dismissible = live || voice.phase === 'error';
  const recording = voice.phase === 'recording';
  useEffect(() => {
    if (recording) sendButton.current?.focus();
  }, [recording]);
  // Escape discards (a failed clip too: the bar can always be left). On the document, not the bar: the bar is not an interactive element.
  const cancel = voice.cancel;
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      void cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismissible, cancel]);

  if (voice.phase === 'error') return <VoiceFailed voice={voice} />;
  return (
    <div className="flex min-h-10 min-w-0 flex-1 items-center gap-1" data-testid="voice-bar">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 px-3">
        <span data-testid="voice-dot" aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full bg-red-600', recording && 'animate-pulse motion-reduce:animate-none')} />
        <span data-testid="voice-timer" className="text-base tabular-nums text-foreground md:text-[15px]">{formatClock(voice.elapsedMs)}</span>
        {voice.phase === 'ready' && <span role="status" className="min-w-0 text-sm text-gray-600">2-min limit reached</span>}
      </div>
      {live && (
        <button type="button" aria-label="Discard voice message" title="Discard" onClick={() => void voice.cancel()} className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {live ? (
        <button ref={sendButton} type="button" aria-label="Send voice message" title="Send" onClick={() => void voice.submit()} className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700', FOCUS_RING)}>
          <SendHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" aria-label="Sending" disabled className={cn(ROUND, 'bg-blue-600 text-white opacity-70')}>
          <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

interface SlotProps {
  slots: { voice: boolean; voiceBar: boolean };
  voice: VoiceNote;
  /** Dictation is mid-way (a prompt, a clip, an error): only one microphone at a time. */
  dict: ComposerDictation;
}

/** The round mic in the send slot, or the recorder bar that replaces the row; nothing otherwise. */
export function VoiceSlot({ slots, voice, dict }: SlotProps) {
  if (slots.voiceBar) return <VoiceBar voice={voice} />;
  return slots.voice ? <VoiceMic onClick={() => void voice.start()} disabled={voice.busy || dict.dictation.phase !== 'idle'} /> : null;
}

/** Under the field: every message that is true now, none hiding another (dictation's, the voice microphone's, held words). */
export function ComposerStatus({ dict, voice }: { dict: ComposerDictation; voice: VoiceNote }) {
  return (
    <>
      <DictationStatus dictation={dict.dictation} />
      {voice.notice && (
        <p role="status" data-testid="voice-status" className="px-3 pb-1 text-sm text-gray-700">
          {voice.notice}
        </p>
      )}
      {dict.overflow && <DictationOverflow fits={dict.overflowFits} onRetry={dict.retryOverflow} onDiscard={dict.discardOverflow} />}
    </>
  );
}
