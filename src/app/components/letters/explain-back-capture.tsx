/**
 * @file explain-back-capture.tsx
 * @description P904: Audio-first "explain back" capture surface for letter receivers.
 *
 * R2 (2026-06-17): Capture surface is a Dialog (modal), not FixedBottomBar.
 * The dialog is non-dismissible while recording is active — guards against orphaned
 * MediaRecorder sessions. Idle/preview/text states are dismissible.
 *
 * Four-state machine: idle → recording → preview → (text-fallback is a sibling of idle).
 * Audio is the default; "Explain in text instead" is a de-emphasized fallback (no mic / a11y).
 * R1 (2026-06-17): Inline consent checkbox removed — TOS already covers voice recording
 * (tos.md:23-38). Passive notice under Send buttons instead.
 *
 * Copy rule: user-facing verb is "explain back" / "explanation", never "paraphrase".
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Mic } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';

const MAX_DURATION_MS = 3 * 60 * 1000; // Confirmed 2026-06-10: 3-minute cap.

type CaptureState = 'idle' | 'recording' | 'preview' | 'text';

export interface ExplainBackSubmitPayload {
  medium: 'audio' | 'text';
  blob?: Blob;
  text?: string;
}

interface ExplainBackCaptureProps {
  /** Story title shown as passive context above the controls. */
  storyTitle: string;
  /** Letter author's first name — used in the "Send to {name}" CTA. */
  authorName: string;
  /** Persist the explanation. Resolves when stored; rejects on failure. */
  onSubmit: (payload: ExplainBackSubmitPayload) => Promise<void>;
  /** Close the panel without submitting. */
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ExplainBackCapture({ storyTitle, authorName, onSubmit, onCancel }: ExplainBackCaptureProps) {
  const [state, setState] = useState<CaptureState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // maxDurationMs: 0 DISABLES the hook's internal auto-stop. We own the cap here so the
  // capped blob is captured by OUR handleStop — the hook's auto-stop would call its own
  // stopRecording() and the resolved blob would be unobservable to this component.
  const { startRecording, stopRecording, error: recorderError } = useAudioRecorder({
    maxDurationMs: 0,
  });
  const { requestPermission, error: permissionError } = useMicrophonePermission();

  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<() => void>(() => {});

  // Revoke object URLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleStartRecording = useCallback(async () => {
    setLocalError(null);
    const granted = await requestPermission();
    if (!granted) return; // permissionError surfaces the reason
    await startRecording();
    setState('recording');
  }, [requestPermission, startRecording]);

  const handleStop = useCallback(async () => {
    const result = await stopRecording();
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (!result || result.size === 0) {
      setLocalError('Recording was empty. Please try again.');
      setState('idle');
      return;
    }
    setBlob(result);
    setBlobUrl(URL.createObjectURL(result));
    setState('preview');
  }, [stopRecording]);

  const handleCancelRecording = useCallback(async () => {
    await stopRecording(); // discard
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    setState('idle');
  }, [stopRecording]);

  // Keep the cap's stop target current (handleStop changes identity across renders).
  useEffect(() => {
    stopRef.current = handleStop;
  }, [handleStop]);

  // Drive the elapsed timer; auto-stop at the cap so the blob is captured by handleStop.
  useEffect(() => {
    if (state !== 'recording') return;
    const startedAt = Date.now();
    setElapsedMs(0);
    elapsedTimerRef.current = setInterval(() => {
      const e = Date.now() - startedAt;
      setElapsedMs(e);
      if (e >= MAX_DURATION_MS) {
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        stopRef.current();
      }
    }, 250);
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [state]);

  const handleReRecord = useCallback(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(null);
    setBlobUrl(null);
    setState('idle');
  }, [blobUrl]);

  const handleSendAudio = useCallback(async () => {
    if (!blob) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSubmit({ medium: 'audio', blob });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not send. Please try again.');
      setSubmitting(false);
    }
  }, [blob, onSubmit]);

  const handleSendText = useCallback(async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSubmit({ medium: 'text', text });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not send. Please try again.');
      setSubmitting(false);
    }
  }, [text, onSubmit]);

  const errorText = localError ?? recorderError ?? permissionError;
  const progressPct = Math.min(100, (elapsedMs / MAX_DURATION_MS) * 100);

  const isRecording = state === 'recording';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isRecording) onCancel(); }}>
      <DialogContent
        className="max-w-sm [--tw-enter-translate-x:0] [--tw-enter-translate-y:0] [--tw-exit-translate-x:0] [--tw-exit-translate-y:0]"
        hideCloseButton={isRecording}
        onPointerDownOutside={isRecording ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isRecording ? (e) => e.preventDefault() : undefined}
      >
      <div data-testid="explain-back-capture-panel" className="w-full max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground mb-1 truncate">{storyTitle}</p>

        {state === 'idle' && (
          <>
            <p className="text-base font-medium text-foreground">Explain back what you understood</p>
            <Button
              variant="default"
              className="w-full max-w-sm min-h-11 gap-2 bg-[#0044CC] hover:bg-[#0033AA] text-white"
              onClick={handleStartRecording}
            >
              <Mic size={16} aria-hidden="true" />
              Record voice message
            </Button>
            <button
              type="button"
              className="block text-sm text-muted-foreground hover:text-foreground min-h-11 underline underline-offset-4"
              onClick={() => setState('text')}
            >
              Explain in text instead
            </button>
          </>
        )}

        {state === 'recording' && (
          <>
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
              <span className="text-sm text-foreground font-medium">Recording…</span>
              <span className="text-sm tabular-nums text-muted-foreground">{formatElapsed(elapsedMs)}</span>
            </div>
            <div className="h-1.5 w-full max-w-sm bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground/20 rounded-full transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <Button
              variant="default"
              className="w-full max-w-sm min-h-11"
              onClick={handleStop}
            >
              Stop recording
            </Button>
            <Button
              variant="ghost"
              className="w-full max-w-sm min-h-11 text-muted-foreground"
              onClick={handleCancelRecording}
            >
              Cancel
            </Button>
          </>
        )}

        {state === 'preview' && blobUrl && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user voice recording; transcript deferred (P904) */}
            <audio controls src={blobUrl} className="w-full max-w-sm h-10" />
            <Button
              variant="default"
              className="w-full max-w-sm min-h-11 bg-[#0044CC] hover:bg-[#0033AA] text-white"
              disabled={submitting}
              onClick={handleSendAudio}
            >
              {submitting ? 'Sending…' : 'Send'}
            </Button>
            <p className="-mt-1 text-xs text-muted-foreground">By sending, your voice is shared with {authorName}.</p>
            <Button
              variant="ghost"
              className="text-sm text-muted-foreground min-h-11 underline underline-offset-4"
              disabled={submitting}
              onClick={handleReRecord}
            >
              Re-record
            </Button>
          </>
        )}

        {state === 'text' && (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Explain back what you understood…"
              className="w-full max-w-sm"
              rows={4}
            />
            <Button
              variant="default"
              className="w-full max-w-sm min-h-11 bg-[#0044CC] hover:bg-[#0033AA] text-white"
              disabled={submitting || !text.trim()}
              onClick={handleSendText}
            >
              {submitting ? 'Sending…' : 'Send'}
            </Button>
            <p className="text-xs text-muted-foreground">By sending, your explanation is shared with {authorName}.</p>
            <button
              type="button"
              className="block text-sm text-muted-foreground hover:text-foreground min-h-11 underline underline-offset-4"
              onClick={() => setState('idle')}
            >
              Record instead
            </button>
          </>
        )}

        {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      </div>
      </DialogContent>
    </Dialog>
  );
}
