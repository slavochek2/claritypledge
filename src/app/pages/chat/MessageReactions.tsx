/**
 * @file MessageReactions.tsx
 * @description P1652: the pills under a message (one per emoji with its count, blue when the viewer's own) and the emoji picker.
 * Tapping a pill toggles the viewer's reaction. Hover or a long press on a pill says who reacted (the shared MobileTooltip); the click that ends a long press does NOT toggle.
 * Pills are 40px tall (touch target). People with no loaded profile show as "Unknown member".
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { REACTION_EMOJI, type ChatReaction } from '@/app/data/chat-reactions-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { FOCUS_RING, HOVER } from './chat-kit';
import { useMenuBehavior } from './chat-hooks';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import type { MessageReactionsState } from './use-message-reactions';

const LONG_PRESS_MS = 500;

interface Group {
  emoji: string;
  people: string[];
  mine: boolean;
}

/** Pills in the order of the emoji set, then any other emoji by first appearance. */
function groupReactions(reactions: readonly ChatReaction[], viewerId: string, authors: Record<string, ChatAuthor>): Group[] {
  const order: string[] = [...REACTION_EMOJI];
  for (const r of reactions) if (!order.includes(r.emoji)) order.push(r.emoji);
  return order
    .map((emoji) => {
      const mine = reactions.filter((r) => r.emoji === emoji);
      return {
        emoji,
        mine: mine.some((r) => r.profileId === viewerId),
        people: mine.map((r) => (r.profileId === viewerId ? 'You' : authors[r.profileId]?.name ?? 'Unknown member')),
      };
    })
    .filter((g) => g.people.length > 0);
}

function Pill({ group, onToggle }: { group: Group; onToggle: () => void }) {
  /** When the current touch went down. A click that ends a press held past the long-press time is the end of "who reacted", not a tap. */
  const downAt = useRef<number | null>(null);
  const names = group.people.join(', ');
  return (
    <MobileTooltip content={names}>
      <button
        type="button"
        data-testid="reaction-pill"
        data-emoji={group.emoji}
        aria-pressed={group.mine}
        aria-label={`${group.emoji} ${group.people.length}, ${names}`}
        onClick={() => {
          // Read and cleared on every click, so a long press that fires no click can never swallow a LATER tap (its pointerdown resets this).
          const held = downAt.current !== null && Date.now() - downAt.current >= LONG_PRESS_MS;
          downAt.current = null;
          if (!held) onToggle();
        }}
        onPointerDown={(e) => {
          downAt.current = e.pointerType === 'mouse' ? null : Date.now();
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-full border px-2.5 text-sm',
          group.mine ? 'border-blue-500 bg-blue-50 text-blue-700' : 'bg-muted/40 text-foreground',
          HOVER,
          FOCUS_RING,
        )}
      >
        <span aria-hidden="true">{group.emoji}</span>
        <span className="tabular-nums">{group.people.length}</span>
      </button>
    </MobileTooltip>
  );
}

/** The message row the picker belongs to: where focus goes when the control that opened it is gone. */
const rowFocusTarget = (messageId: string | undefined) => (): HTMLElement | null =>
  messageId ? document.querySelector<HTMLElement>(`[data-msg="${messageId}"] button, [data-msg="${messageId}"] a`) : null;

function Picker({ at, mine, messageId, onPick, onClose }: { at: { x: number; y: number }; mine: ReadonlySet<string>; messageId: string | undefined; onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useMenuBehavior(ref, onClose, rowFocusTarget(messageId));
  // A fixed picker would stay put while the message moves away: any scroll closes it.
  useEffect(() => {
    window.addEventListener('scroll', onClose, true);
    return () => window.removeEventListener('scroll', onClose, true);
  }, [onClose]);
  const width = REACTION_EMOJI.length * 40 + 12;
  const x = Math.max(8, Math.min(at.x, window.innerWidth - width - 8));
  const y = Math.max(8, Math.min(at.y, window.innerHeight - 56));
  return (
    <div ref={ref} role="menu" tabIndex={-1} aria-label="Add a reaction" onKeyDown={onKeyDown} style={{ left: x, top: y }} className="fixed z-50 flex gap-0 rounded-xl border bg-popover p-1 shadow-xl">
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          aria-label={mine.has(emoji) ? `Remove ${emoji}` : `React ${emoji}`}
          data-emoji={emoji}
          onClick={() => { onClose(); onPick(emoji); }}
          className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-xl', mine.has(emoji) && 'bg-blue-50', HOVER, FOCUS_RING)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function MessageReactions({ rx, authors }: { rx: MessageReactionsState; authors: Record<string, ChatAuthor> }) {
  if (!rx.enabled) return null;
  const groups = groupReactions(rx.reactions, rx.viewerId, authors);
  const mine = new Set(groups.filter((g) => g.mine).map((g) => g.emoji));
  return (
    <>
      {groups.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="reactions">
          {groups.map((g) => (
            <Pill key={g.emoji} group={g} onToggle={() => rx.toggle(g.emoji)} />
          ))}
        </div>
      )}
      {rx.pickerAt && <Picker at={rx.pickerAt} mine={mine} messageId={rx.messageId} onPick={rx.toggle} onClose={rx.closePicker} />}
    </>
  );
}
