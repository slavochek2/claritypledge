/**
 * @file Composer.tsx
 * @description P1512: the message field. The textarea grows to about five lines and then scrolls
 * inside itself; Enter sends and Shift+Enter starts a new line on a desktop pointer (a touch
 * keyboard keeps Enter for the new line); the Send button appears once there is something to send,
 * so there is never a dead control. The draft survives switching to another chat.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import { ShareableCard } from './ShareableCard';
import { hasFinePointer, stashDraft, useDraft } from './chat-hooks';
import { matchMentions, mentionQuery, type MentionEntry } from './mention-picker';
import { DictationSlot, FieldMic } from './DictationControls';
import { ComposerStatus, VoiceSlot } from './VoiceControls';
import { useVoiceNote, type VoiceSender } from '@/hooks/use-voice-note';
import { composerSlots } from './composer-slots';
import { MentionPicker } from './MentionPicker';
import { PrivateModeBar } from './PrivateModeBar';
import { useComposerDictation } from './use-composer-dictation';

export type { MentionEntry };

/** Five 24px lines plus the field's 16px vertical padding. */
export const COMPOSER_MAX = 136;



interface Props {
  draftKey: string;
  placeholder: string;
  /** May return a promise: resolving false (or rejecting) means nothing was sent, and the draft comes back. */
  onSend: (body: string | null, attachment: Shareable | null) => unknown;
  onAttach?: () => void;
  staged?: Shareable | null;
  onUnstage?: () => void;
  /** The reply quote bar, shown inside the field's frame. */
  quote?: ReactNode;
  /** The pending quote is itself something to send (a Clarify), so Send shows with no text. */
  quoteSendable?: boolean;
  /** A send is under way that must not be doubled: Send and Enter wait. */
  sendDisabled?: boolean;
  /** Changing this value moves focus into the field (a Reply was pressed). */
  focusToken?: number;
  autoFocus?: boolean;
  /** P1520: what typing @ offers. Absent or empty: no picker. */
  mentions?: MentionEntry[];
  /** P1520: the private mode the composer is in (picked from the @ picker), or null. */
  privateTo?: MentionEntry | null;
  onPrivateChange?: (entry: MentionEntry | null) => void;
  /**
   * P1576: sends a recorded voice note to this conversation (or thread). Absent where voice notes are not
   * allowed: the round voice button is then never shown. Private @mirror asks (privateTo) never show it either.
   */
  onVoiceNote?: VoiceSender;
}

export function Composer({ draftKey, placeholder, onSend, onAttach, staged = null, onUnstage, quote, quoteSendable = false, sendDisabled = false, focusToken = 0, autoFocus = false, mentions, privateTo = null, onPrivateChange, onVoiceNote }: Props) {
  const [value, setValue] = useDraft(draftKey);
  const field = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(value);
  latest.current = value;
  const keyNow = useRef(draftKey);
  keyNow.current = draftKey;
  const [caret, setCaret] = useState(0);
  // P1576: dictation. The mic, the recorder bar that takes the field's place, and where the words go.
  const voice = useVoiceNote(draftKey, onVoiceNote);
  const dict = useComposerDictation(draftKey, field, latest, keyNow, setValue, setCaret, value);
  const [active, setActive] = useState(0);
  const [pickerClosed, setPickerClosed] = useState(false);
  const query = mentions?.length && !privateTo ? mentionQuery(value, caret) : null;
  const options = query === null ? [] : matchMentions(mentions ?? [], query);
  const pickerOpen = options.length > 0 && !pickerClosed;
  useEffect(() => {
    setActive(0);
    setPickerClosed(false);
  }, [query]);
  const listId = `${draftKey}-mentions`;

  const pick = (entry: MentionEntry) => {
    const el = field.current;
    const at = el?.selectionStart ?? value.length;
    const before = value.slice(0, at).replace(/@[^\s@]{0,30}$/, '');
    setValue((before + value.slice(at)).replace(/^\s+$/, ''));
    onPrivateChange?.(entry);
    requestAnimationFrame(() => field.current?.focus());
  };

  // Grow with the text up to ~5 lines, then scroll inside the field.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full || 40, COMPOSER_MAX)}px`;
    el.style.overflowY = full > COMPOSER_MAX ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    if (focusToken > 0 || (autoFocus && hasFinePointer())) field.current?.focus();
  }, [focusToken, autoFocus, draftKey]);

  const sendable = value.trim() !== '' || !!staged || quoteSendable;
  const send = () => {
    const text = value.trim();
    if ((!text && !staged && !quoteSendable) || sendDisabled) return;
    const before = value;
    const sentFrom = draftKey;
    // A failed send's text goes back to the slot it was written in. If the composer has since switched slot (left
    // private mode), it is stashed there, never shown in the slot now on screen: a private question must not
    // reappear in a channel's composer (P1520 review).
    const restore = (text: string) => {
      if (keyNow.current !== sentFrom) stashDraft(sentFrom, text);
      else if (latest.current === '') setValue(text);
    };
    setValue('');
    const result = onSend(text || null, staged);
    // A refusal that comes back at once (nothing was sent) gives the draft back before anything else.
    if (result === false) {
      setValue(before);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(
        (ok) => ok === false && restore(before),
        () => restore(before),
      );
    }
  };

  const slots = composerSlots(sendable, !!onAttach, !!privateTo, dict, voice);
  const hint = privateTo ? `Ask ${privateTo.label} privately` : placeholder;

  return (
    <footer className="relative shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 lg:px-3 lg:pb-3" data-testid="composer">
      {pickerOpen && <MentionPicker listId={listId} options={options} active={active} onPick={pick} />}
      <form
        className={cn(
          'relative mx-auto w-full max-w-3xl rounded-3xl border bg-background px-1.5 py-1',
          privateTo ? 'border-dashed border-blue-300 focus-within:border-blue-400' : 'border-gray-300 focus-within:border-gray-400',
        )}
        data-private={privateTo ? 'true' : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {privateTo && <PrivateModeBar entry={privateTo} onLeave={() => onPrivateChange?.(null)} />}
        {quote}
        {staged && (
          <div className="relative px-2 pt-1" data-testid="staged-attachment">
            <div className="max-h-24 overflow-hidden rounded-xl pr-10">
              <ShareableCard item={staged} announce />
            </div>
            <button type="button" aria-label={`Remove attachment: ${staged.title}`} onClick={onUnstage} className={cn(ROUND, 'absolute right-3 top-2 bg-background/90 text-muted-foreground shadow-sm', HOVER, FOCUS_RING)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-0.5">
          {slots.attach && (
            <button type="button" aria-label="Attach a point or story" title="Attach a point or story" onClick={onAttach} className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
              <Paperclip className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          {/* The hint is drawn by hand, not as a placeholder: a placeholder wraps (and grows the composer) at a narrow
              width, this one is a single line that ends in an ellipsis. */}
          <div className="relative min-w-0 flex-1" hidden={!slots.field}>
            {value === '' && (
              <span aria-hidden="true" data-testid="composer-hint" className="pointer-events-none absolute inset-x-0 top-0 block truncate py-2 pl-2 pr-10 text-base leading-6 text-gray-500 md:text-[15px]">
                {hint}
              </span>
            )}
            <textarea
              ref={field}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                dict.trackCaret(e.target.selectionStart ?? e.target.value.length);
              }}
              onSelect={(e) => dict.trackCaret(e.currentTarget.selectionStart ?? 0)}
              rows={1}
              aria-label={hint}
              aria-autocomplete={mentions?.length ? 'list' : undefined}
              aria-controls={pickerOpen ? listId : undefined}
              aria-activedescendant={pickerOpen && options[active] ? `${listId}-${options[active].id}` : undefined}
              maxLength={4000}
              onKeyDown={(e) => {
                if (pickerOpen) {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
                    return;
                  }
                  if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    const o = options[active];
                    if (o) pick(o);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setPickerClosed(true);
                    return;
                  }
                }
                if (privateTo && e.key === 'Escape') {
                  e.preventDefault();
                  onPrivateChange?.(null);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && hasFinePointer()) {
                  e.preventDefault();
                  send();
                }
              }}
              className="block max-h-[136px] min-h-10 w-full min-w-0 resize-none bg-transparent py-2 pl-2 pr-10 text-base leading-6 outline-none md:text-[15px]"
            />
            <FieldMic slots={slots} dict={dict} blocked={voice.busy} />
          </div>
          <DictationSlot slots={slots} dict={dict} />
          <VoiceSlot slots={slots} voice={voice} dict={dict} />
          {slots.send && (
            <button type="submit" aria-label="Send" title="Send" disabled={sendDisabled} className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50', FOCUS_RING)}>
              <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
        <ComposerStatus dict={dict} voice={voice} />
      </form>
    </footer>
  );
}
