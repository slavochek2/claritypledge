/**
 * @file Composer.tsx
 * @description P1512: the message field. The textarea grows to about five lines and then scrolls
 * inside itself; Enter sends and Shift+Enter starts a new line on a desktop pointer (a touch
 * keyboard keeps Enter for the new line); the Send button appears once there is something to send,
 * so there is never a dead control. The draft survives switching to another chat.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';
import { hasFinePointer, useDraft } from './chat-hooks';

/** Five 24px lines plus the field's 16px vertical padding. */
export const COMPOSER_MAX = 136;

const ROUND = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full';

interface Props {
  draftKey: string;
  placeholder: string;
  onSend: (body: string | null, attachment: Shareable | null) => void;
  onAttach?: () => void;
  staged?: Shareable | null;
  onUnstage?: () => void;
  /** The reply quote bar, shown inside the field's frame. */
  quote?: ReactNode;
  /** Changing this value moves focus into the field (a Reply was pressed). */
  focusToken?: number;
  autoFocus?: boolean;
}

export function Composer({ draftKey, placeholder, onSend, onAttach, staged = null, onUnstage, quote, focusToken = 0, autoFocus = false }: Props) {
  const [value, setValue] = useDraft(draftKey);
  const field = useRef<HTMLTextAreaElement>(null);

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

  const sendable = value.trim() !== '' || !!staged;
  const send = () => {
    const text = value.trim();
    if (!text && !staged) return;
    setValue('');
    onSend(text || null, staged);
  };

  return (
    <footer className="relative shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 lg:px-3 lg:pb-3" data-testid="composer">
      <form
        className="relative mx-auto w-full max-w-3xl rounded-3xl border border-gray-300 bg-background px-1.5 py-1 focus-within:border-gray-400"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {quote}
        {staged && (
          <div className="flex items-center gap-2 px-2 pt-1" data-testid="staged-attachment">
            <p className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              <span className="font-semibold">{staged.kind === 'point' ? 'Point' : 'Story'}: </span>
              {staged.title}
            </p>
            <button type="button" aria-label="Remove attachment" onClick={onUnstage} className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-0.5">
          {onAttach && (
            <button type="button" aria-label="Attach a point or story" title="Attach a point or story" onClick={onAttach} className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
              <Paperclip className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          {/* The hint is drawn by hand, not as a placeholder: a placeholder wraps (and grows the composer) at a narrow
              width, this one is a single line that ends in an ellipsis. */}
          <div className="relative min-w-0 flex-1">
            {value === '' && (
              <span aria-hidden="true" data-testid="composer-hint" className="pointer-events-none absolute inset-x-0 top-0 block truncate px-2 py-2 text-base leading-6 text-gray-500 md:text-[15px]">
                {placeholder}
              </span>
            )}
            <textarea
              ref={field}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={1}
              aria-label={placeholder}
              maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && hasFinePointer()) {
                  e.preventDefault();
                  send();
                }
              }}
              className="block max-h-[136px] min-h-10 w-full min-w-0 resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none md:text-[15px]"
            />
          </div>
          {sendable && (
            <button type="submit" aria-label="Send" title="Send" className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700', FOCUS_RING)}>
              <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </footer>
  );
}
