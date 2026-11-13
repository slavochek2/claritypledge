/**
 * @file ClarifyComposer.tsx
 * @description P1631: the typing box of a Clarify thread, the product's own thread Composer: Enter sends, the in-field mic dictates words into the box, and the round blue voice button records,
 * transcribes and sends the words as the instruction, no paperclip, no +. A message posts in the thread and starts a run in one call. With a pill from "Mention in chat" it
 * refines THAT card; without one it refines the latest. While a draft is being made the send slot waits and the field keeps its text.
 */
import { useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { CANVAS_CHIP } from '@/app/components/canvas/canvas-pill-styles';
import { clarifyMessage } from '@/app/data/clarify-service';
import { transcribeClip } from '@/app/data/transcribe-clip-service';
import { cn } from '@/lib/utils';
import { Composer } from './Composer';
import { FOCUS_RING } from './chat-kit';
import { CLARIFY_BUSY_TOAST, CLARIFY_COMPOSER_HINT, CLARIFY_FAILED_TOAST, CLARIFY_MESSAGE_MAX, CLARIFY_NO_SPEECH_TOAST, CLARIFY_TOO_LONG_TOAST, CLARIFY_WAITING_TEXT, DRAFT_PILL } from './clarify-copy';
import { runClarifyDraft, touchClarifyThread } from './clarify-run';

/** The mention as a pill in the typing box, wearing the canvas pill's look: the card's words cut with an ellipsis, a 40px remove button. */
function MentionPill({ words, onRemove }: { words: string; onRemove: () => void }) {
  const name = `${DRAFT_PILL} · ${words}`;
  return (
    <ul className="flex flex-wrap items-center gap-1.5 px-2 pt-1" data-testid="clarify-mention-pills">
      <li className={cn(CANVAS_CHIP, 'flex min-w-0 max-w-full items-center gap-1 py-0 pl-2 pr-0')} data-testid="clarify-mention-pill">
        <span className="min-w-0 truncate" title={name}>{name}</span>
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', FOCUS_RING)}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </li>
    </ul>
  );
}

export function ClarifyComposer({ rootId, userId, working, mention, onClearMention, autoFocus = false }: {
  rootId: string;
  userId: string;
  working: boolean;
  /** The card mentioned in this box (its id and its words), or null. */
  mention?: { id: string; words: string } | null;
  onClearMention?: () => void;
  /** Takes focus on mount where a real pointer exists (the product's Composer rule): the Mirror's box, never the thread beside it (P1631). */
  autoFocus?: boolean;
}) {
  const targetId = mention?.id ?? null;
  // resolving false means nothing was sent and the composer gives the words back
  const sendText = useCallback(async (text: string): Promise<boolean> => {
    if (!text) return false;
    if (text.length > CLARIFY_MESSAGE_MAX) {
      toast.error(CLARIFY_TOO_LONG_TOAST);
      return false;
    }
    try {
      const r = await clarifyMessage(rootId, text, targetId);
      if (r.status !== 'started') {
        // busy: say so, and reread the thread so the send slot shows the draft being made
        toast(CLARIFY_BUSY_TOAST);
        touchClarifyThread(rootId);
        return false;
      }
      void runClarifyDraft(r.draftId);
      touchClarifyThread(rootId);
      onClearMention?.();
      return true;
    } catch {
      toast.error(CLARIFY_FAILED_TOAST);
      return false;
    }
  }, [rootId, targetId, onClearMention]);
  const onSend = useCallback((body: string | null) => sendText((body ?? '').trim()), [sendText]);
  // The round voice button: the recording is transcribed and the words go as the instruction, exactly as typed words do. A failure throws, so the recorder bar offers Retry / Discard.
  // Transcription is metered: nothing is transcribed while a draft is being made (the send would be refused), and a Retry of the same
  // recording reuses its words instead of transcribing it again.
  const heard = useRef(new WeakMap<Blob, string>());
  const onVoiceNote = useCallback(async (wav: Blob): Promise<void> => {
    if (working) {
      toast(CLARIFY_BUSY_TOAST);
      throw new Error('a draft is being made');
    }
    let words = heard.current.get(wav);
    if (words === undefined) {
      try {
        words = (await transcribeClip(new Uint8Array(await wav.arrayBuffer()))).trim();
      } catch (e) {
        toast.error(CLARIFY_FAILED_TOAST); // the recorder bar then offers Retry / Discard
        throw e;
      }
    }
    heard.current.set(wav, words);
    if (!words) {
      // the same words a silent voice message shows in the chat; Discard on the recorder bar clears it
      toast(CLARIFY_NO_SPEECH_TOAST);
      throw new Error('nothing was heard');
    }
    if (!(await sendText(words))) throw new Error('instruction not sent');
  }, [sendText, working]);
  return (
    <Composer
      draftKey={`${userId}:clarify:${rootId}`}
      placeholder={CLARIFY_COMPOSER_HINT}
      waiting={working ? CLARIFY_WAITING_TEXT : undefined}
      quote={mention ? <MentionPill words={mention.words} onRemove={() => onClearMention?.()} /> : undefined}
      onSend={onSend}
      onVoiceNote={onVoiceNote}
      autoFocus={autoFocus}
    />
  );
}
