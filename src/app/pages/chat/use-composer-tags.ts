/**
 * @file use-composer-tags.ts
 * @description P1536 S4.2: the composer's half of Add to chat. Inside a canvas workspace (a tag bus above it) it takes tags from the bus at the saved caret and
 * focuses the field, keeps a caret out of the middle of a token, makes Backspace remove a whole token, and sends a voice note with the tags in the field
 * (J5). Outside a workspace it does nothing: `voice` is the caller's own sender and `onKeyDown` never handles a key.
 *
 * The caret is the one the field last reported while it was focused (a tap on the canvas blurs it, and its own selection is not trusted after a hidden pane
 * or a remount); a field never touched takes the tag at the end.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import type { VoiceSender } from '@/hooks/use-voice-note';
import { ComposerTagContext } from './composer-tag-bus';
import { decodeTagged, insertTagAt, removeTagBefore, snapOutOfTag, stripTags } from './composer-tags';

// [FOUNDER DECISION: said when a tag would take the message past its cap.]
export const TAG_TOO_LONG_TEXT = 'That message is too long to add another box.';

export function useComposerTags(field: RefObject<HTMLTextAreaElement | null>, value: string, setValue: (v: string) => void, onVoiceNote: VoiceSender | undefined): {
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  voice: VoiceSender | undefined;
} {
  const bus = useContext(ComposerTagContext);
  const now = useRef({ value, setValue, onVoiceNote });
  now.current = { value, setValue, onVoiceNote };
  const caret = useRef<number | null>(null);
  useEffect(() => {
    if (value === '') caret.current = null;
  }, [value]);

  /** Sets the value, then puts the caret after the edit and focuses the field (inside the tap handler when `sync`: a phone's keyboard needs that). */
  const place = useCallback((next: string, at: number, sync: boolean) => {
    const settle = () => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
      caret.current = at;
    };
    if (sync) {
      flushSync(() => now.current.setValue(next));
      settle();
    } else {
      now.current.setValue(next);
      requestAnimationFrame(settle);
    }
  }, [field]);

  useEffect(() => {
    if (!bus) return;
    return bus.register((tag, sync) => {
      const v = now.current.value;
      const r = insertTagAt(v, caret.current ?? v.length, tag);
      if (!r) toast.error(TAG_TOO_LONG_TEXT);
      else place(r.value, r.caret, sync);
    });
  }, [bus, place]);

  // The caret as the field reports it; one that lands inside a token goes to the token's edge.
  useEffect(() => {
    const el = field.current;
    if (!bus || !el) return;
    const track = () => {
      const at = el.selectionStart ?? 0;
      const prev = caret.current ?? at;
      const snapped = el.selectionEnd === at ? snapOutOfTag(el.value, at, prev) : null;
      if (snapped !== null) el.setSelectionRange(snapped, snapped);
      caret.current = snapped ?? at;
    };
    const events = ['select', 'keyup', 'click', 'input'] as const;
    events.forEach(n => el.addEventListener(n, track));
    return () => events.forEach(n => el.removeEventListener(n, track));
  }, [bus, field]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!bus || e.key !== 'Backspace' || e.nativeEvent.isComposing || e.currentTarget.selectionStart !== e.currentTarget.selectionEnd) return false;
    const r = removeTagBefore(now.current.value, e.currentTarget.selectionStart ?? 0);
    if (!r) return false;
    e.preventDefault();
    place(r.value, r.caret, false);
    return true;
  }, [bus, place]);

  // J5: a voice note carries the tags in the field and clears them once it is sent; a failed note keeps them (its Retry sends the same field).
  const voice = useMemo<VoiceSender | undefined>(() => {
    if (!bus || !onVoiceNote) return onVoiceNote;
    return async (wav, opts) => {
      const sent = await onVoiceNote(wav, { ...opts, boxRefs: decodeTagged(now.current.value).refs });
      now.current.setValue(stripTags(now.current.value).trim());
      return sent;
    };
  }, [bus, onVoiceNote]);
  return { onKeyDown, voice };
}
