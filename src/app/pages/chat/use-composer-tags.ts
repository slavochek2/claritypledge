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
import { editStoredDraft } from './chat-hooks';
import { insertTagAt, removeTagBefore, removeTagTokens, snapOutOfTag, tagCounts } from './composer-tags';

// [FOUNDER DECISION: said when a tag would take the message past its cap.]
export const TAG_TOO_LONG_TEXT = 'That message is too long to add another box.';

export function useComposerTags(field: RefObject<HTMLTextAreaElement | null>, draftKey: string, value: string, setValue: (v: string) => void, onVoiceNote: VoiceSender | undefined): {
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  voice: VoiceSender | undefined;
} {
  const bus = useContext(ComposerTagContext);
  const now = useRef({ value, setValue, onVoiceNote, key: draftKey });
  now.current = { value, setValue, onVoiceNote, key: draftKey };
  const caret = useRef<number | null>(null);
  useEffect(() => {
    if (value === '') caret.current = null;
  }, [value]);

  /**
   * Sets the value, then puts the caret after the edit and focuses the field (inside the tap handler when `sync`: a phone's keyboard needs that). The value and caret
   * the NEXT edit starts from are set at once, not when React renders: several tags queued together each land on the one before.
   */
  const place = useCallback((next: string, at: number, sync: boolean) => {
    now.current.value = next;
    caret.current = at;
    const settle = () => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
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

  // The caret as the field reports it; one that lands inside a token goes to the token's edge. Attached to whatever textarea the ref holds NOW, checked after every
  // render, so a field that mounts later (or is replaced) is listened to as well.
  const listening = useRef<{ el: HTMLTextAreaElement; off: () => void } | null>(null);
  useEffect(() => {
    const el = field.current;
    if (!bus || listening.current?.el === el) return;
    listening.current?.off();
    listening.current = null;
    if (!el) return;
    const track = () => {
      const at = el.selectionStart ?? 0;
      const prev = caret.current ?? at;
      const snapped = el.selectionEnd === at ? snapOutOfTag(el.value, at, prev) : null;
      if (snapped !== null) el.setSelectionRange(snapped, snapped);
      caret.current = snapped ?? at;
    };
    const events = ['select', 'keyup', 'click', 'input'] as const;
    events.forEach(n => el.addEventListener(n, track));
    listening.current = { el, off: () => events.forEach(n => el.removeEventListener(n, track)) };
  });
  useEffect(() => () => listening.current?.off(), []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!bus || e.key !== 'Backspace' || e.nativeEvent.isComposing || e.currentTarget.selectionStart !== e.currentTarget.selectionEnd) return false;
    const r = removeTagBefore(now.current.value, e.currentTarget.selectionStart ?? 0);
    if (!r) return false;
    e.preventDefault();
    place(r.value, r.caret, false);
    return true;
  }, [bus, place]);

  // J5: a voice note carries the tags in the field when it is submitted, and on success removes exactly those (a tag added since stays), from the composer slot it was
  // sent from (if the composer has moved to another chat meanwhile, that slot's stored draft is edited and the visible one is left alone). A failed note keeps them.
  const voice = useMemo<VoiceSender | undefined>(() => {
    if (!bus || !onVoiceNote) return onVoiceNote;
    return async (wav, opts) => {
      const counts = tagCounts(now.current.value);
      const key = now.current.key;
      const sent = await onVoiceNote(wav, { ...opts, boxRefs: Object.keys(counts).sort() });
      const without = (v: string) => { const r = removeTagTokens(v, counts); return r.trim() === '' ? '' : r; };
      if (now.current.key === key) now.current.setValue(without(now.current.value));
      else editStoredDraft(key, without);
      return sent;
    };
  }, [bus, onVoiceNote]);
  return { onKeyDown, voice };
}
