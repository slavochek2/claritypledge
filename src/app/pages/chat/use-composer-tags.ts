/**
 * @file use-composer-tags.ts
 * @description P1536 S4.2, P1621: the composer's half of Mention in chat. The stored value keeps the tag tokens at its start; this hook splits it into pills and the words the
 * field shows, takes tags from the bus (a repeat adds no second pill; focus moves to the field only when the tag asks), removes a pill (its button, or Backspace in an empty field),
 * tells the bus which tags the value holds (so a box can read "Mentioned"), and sends a voice note with the tags in the field (J5). Outside a workspace (no bus) the pills of a stored
 * value still show and remove; nothing is inserted, and `voice` is the caller's own sender.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import type { VoiceSender } from '@/hooks/use-voice-note';
import { ComposerTagContext } from './composer-tag-bus';
import { editStoredDraft } from './chat-hooks';
import { addTag, joinTagged, removeTag, removeTagTokens, splitTagged, tagCounts } from './composer-tags';

// [FOUNDER DECISION: said when a tag would take the message past its cap.]
export const TAG_TOO_LONG_TEXT = 'That message is too long to add another box.';

export function useComposerTags(field: RefObject<HTMLTextAreaElement | null>, draftKey: string, value: string, setValue: (v: string) => void, onVoiceNote: VoiceSender | undefined): {
  tags: string[];
  words: string;
  setWords: (words: string) => void;
  removePill: (tag: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  voice: VoiceSender | undefined;
} {
  const bus = useContext(ComposerTagContext);
  const { tags, words } = useMemo(() => splitTagged(value), [value]);
  const now = useRef({ value, setValue, onVoiceNote, key: draftKey });
  now.current = { value, setValue, onVoiceNote, key: draftKey };
  // Whether THIS composer is still on screen: a note that completes after the owner left and came back belongs to a composer that is gone, and its `setValue` would write its
  // old text over what the new one holds.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const setWords = useCallback((next: string) => {
    const v = joinTagged(splitTagged(now.current.value).tags, next);
    now.current.value = v;
    now.current.setValue(v);
  }, []);
  const removePill = useCallback((tag: string) => {
    const v = removeTag(now.current.value, tag);
    now.current.value = v;
    now.current.setValue(v);
    field.current?.focus();
  }, [field]);

  /** Sets the value, then focuses the field when asked (inside the tap handler when `sync`: a phone's keyboard needs that). The value the NEXT edit starts from is set at once, not when React renders: several tags queued together each land on the one before. */
  const place = useCallback((next: string, sync: boolean, focus: boolean) => {
    now.current.value = next;
    const settle = () => {
      const el = field.current;
      if (!el || !focus) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
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
    return bus.register((tag, sync, focus) => {
      const next = addTag(now.current.value, tag);
      if (next === null) toast.error(TAG_TOO_LONG_TEXT);
      else if (next !== now.current.value) place(next, sync, focus);
      else if (focus) field.current?.focus(); // already a pill: nothing to add, the tap still brings the cursor to the field
      bus.report(splitTagged(now.current.value).tags);
    });
  }, [bus, place, field]);

  // The bus learns which tags the value holds as it changes, and that there are none once this composer is gone (a hidden pane stays mounted: it keeps its tags).
  const tagKey = tags.join('|');
  useEffect(() => bus?.report(tagKey ? tagKey.split('|') : []), [bus, tagKey]);
  useEffect(() => () => bus?.report([]), [bus]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const el = e.currentTarget;
    const last = splitTagged(now.current.value).tags.at(-1);
    if (e.key !== 'Backspace' || e.nativeEvent.isComposing || !last || el.value !== '' || el.selectionStart !== 0 || el.selectionEnd !== 0) return false;
    e.preventDefault();
    removePill(last);
    return true;
  }, [removePill]);

  // J5: a voice note carries the tags in the field when it is submitted, and on success removes exactly those (a tag added since stays), from the composer slot it was
  // sent from (if the composer has moved to another chat, or was left, meanwhile, that slot's CURRENT stored draft is edited and the visible one is left alone). A failed note keeps them.
  const voice = useMemo<VoiceSender | undefined>(() => {
    if (!bus || !onVoiceNote) return onVoiceNote;
    return async (wav, opts) => {
      const counts = tagCounts(now.current.value);
      const key = now.current.key;
      const sent = await onVoiceNote(wav, { ...opts, boxRefs: Object.keys(counts).sort() });
      const without = (v: string) => { const r = removeTagTokens(v, counts); return r.trim() === '' ? '' : r; };
      // On screen, in the slot it was sent from: the visible text. Anywhere else (another chat, or this composer left): the slot's CURRENT stored draft, which may hold text typed since.
      if (alive.current && now.current.key === key) now.current.setValue(without(now.current.value));
      else editStoredDraft(key, without);
      return sent;
    };
  }, [bus, onVoiceNote]);
  return { tags, words, setWords, removePill, onKeyDown, voice };
}
