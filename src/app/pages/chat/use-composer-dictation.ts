/**
 * @file use-composer-dictation.ts
 * @description P1576 Part A: wires `useDictation` to the composer's draft: where the words go, and
 * what happens if the chat has changed (or the composer is gone) by the time they arrive.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { isDictationSupported, useDictation, type Dictation, type DictationOrigin } from '@/hooks/use-dictation';
import { insertIntoDraft } from './chat-hooks';
import { mergeDictation, type MergedDictation } from './dictation-text';
import { clearPending, getPending, holdPending, usePending, type PendingDictation } from './pending-dictation';

export interface ComposerDictation {
  dictation: Dictation;
  supported: boolean;
  /** The recorder bar is up: the field, attach, mic and Send step aside. Only in the chat the
   *  recording belongs to: after a switch the visible chat keeps its field while the late text is
   *  still on its way to the other one. */
  recording: boolean;
  /** The in-field mic is disabled: a prompt, a clip in flight or a failed one waiting for Retry / Discard. */
  micBusy: boolean;
  /** Dictated words for THIS chat that did not fit the draft, waiting for room. */
  overflow: PendingDictation | null;
  /** The held words fit the draft as it is now (it was sent, or cleared, or trimmed). */
  overflowFits: boolean;
  retryOverflow: () => void;
  discardOverflow: () => void;
  /** Report the caret from the field's change / select events: remembered here, then passed to `onCaret`. */
  trackCaret: (caret: number) => void;
  begin: () => void;
}

/**
 * Positional on purpose: the call site is inside `Composer`, whose size is ratcheted, and an object
 * literal costs a line per property there.
 *
 * @param draftKey the draft on screen
 * @param field the textarea (to focus it and place the caret after dictated text)
 * @param latest the visible draft, always current
 * @param keyNow the draft key on screen, always current
 * @param setValue replaces the visible draft
 * @param onCaret the composer's own caret tracking (mention picker); `trackCaret` forwards to it
 * @param value the draft as rendered, so "do the held words fit now" re-evaluates as it changes
 */
export function useComposerDictation(
  draftKey: string,
  field: RefObject<HTMLTextAreaElement | null>,
  latest: RefObject<string>,
  keyNow: RefObject<string>,
  setValue: (value: string) => void,
  onCaret: (caret: number) => void,
  value: string,
): ComposerDictation {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The caret as the field last reported it. A tap on the mic blurs the field, so `selectionStart`
  // at click time is not the user's position; null means the field was never touched in this chat
  // (the words then go at the end of whatever the draft holds).
  const caretRef = useRef<number | null>(null);
  useEffect(() => {
    caretRef.current = null;
  }, [draftKey]);
  const trackCaret = useCallback((caret: number) => {
    caretRef.current = caret;
    onCaret(caret);
  }, [onCaret]);

  /** The merged draft on screen, with the caret just after the new words. */
  const land = useCallback((merged: MergedDictation) => {
    setValue(merged.value);
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(merged.caret, merged.caret);
    });
  }, [field, setValue]);

  const onText = useCallback((text: string, origin: DictationOrigin) => {
    const onScreen = mounted.current && keyNow.current === origin.draftKey;
    if (!onScreen) {
      // The composer has moved to another chat (or is gone): the words go to the draft they were spoken in,
      // or wait for that chat when the draft has no room.
      if (!insertIntoDraft(origin.draftKey, text, origin.caret)) holdPending(origin.draftKey, text, origin.caret);
      return;
    }
    const merged = mergeDictation(latest.current ?? '', text, origin.caret);
    if (merged.fits) land(merged);
    else holdPending(origin.draftKey, text, origin.caret);
  }, [keyNow, latest, land]);

  const overflow = usePending(draftKey);
  const overflowFits = overflow ? mergeDictation(value, overflow.text, overflow.caret).fits : false;
  const retryOverflow = useCallback(() => {
    const held = getPending(keyNow.current ?? '');
    if (!held) return;
    const merged = mergeDictation(latest.current ?? '', held.text, held.caret);
    if (!merged.fits) return;
    clearPending(keyNow.current ?? '');
    land(merged);
  }, [keyNow, latest, land]);
  const discardOverflow = useCallback(() => clearPending(keyNow.current ?? ''), [keyNow]);

  const dictation = useDictation({ draftKey, onText });
  const supported = isDictationSupported();
  const begin = () => {
    const text = latest.current ?? '';
    void dictation.start(caretRef.current ?? text.length);
  };
  return {
    dictation,
    supported,
    recording: (dictation.phase === 'recording' || dictation.phase === 'transcribing') && dictation.originKey === draftKey,
    micBusy: dictation.phase !== 'idle',
    overflow,
    overflowFits,
    retryOverflow,
    discardOverflow,
    trackCaret,
    begin,
  };
}
