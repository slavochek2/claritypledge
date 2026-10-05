/**
 * @file RoleBadge.tsx
 * @description P1337 — the role mark every round surface shares, taken from the printed role
 * cards people hold at the table (the founder's print sheet): a white capital on the card's
 * colour — S on burnt orange (#C2410C), L on blue (#1864AB). Observer has no printed card; it
 * gets a neutral O.
 *
 * The orange is a deliberate exception to the design system's "no orange in UI" rule, on the
 * founder's instruction (2026-10-04: "respect how we design speaker and listener in terms of
 * cards"): the screen must match the card in people's hands. It lives here and nowhere else.
 */
import { cn } from '@/lib/utils';
import type { LiveRole } from '@/lib/round-clock';

const CARD = {
  speaker: { letter: 'S', word: 'Speaker', className: 'bg-[#C2410C] text-white' },
  listener: { letter: 'L', word: 'Listener', className: 'bg-[#1864AB] text-white' },
  observer: { letter: 'O', word: 'Observer', className: 'bg-neutral-700 text-white' },
} as const satisfies Record<LiveRole, { letter: string; word: string; className: string }>;

export const ROLE_WORD: Record<LiveRole, string> = {
  speaker: CARD.speaker.word,
  listener: CARD.listener.word,
  observer: CARD.observer.word,
};

/** The square letter. Size comes from the caller (font-size and box), so it scales with a screen. */
export function RoleBadge({ role, className, style }: { role: LiveRole; className?: string; style?: React.CSSProperties }) {
  const card = CARD[role];
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-md font-extrabold leading-none', card.className, className)}
      style={style}
      aria-label={card.word}
      data-role-badge={role}
    >
      {card.letter}
    </span>
  );
}

/**
 * P1337 (founder walkthrough 6): a round with no swap at half time assigns no starter — the pair
 * hold both cards and decide who starts. Both cards, side by side, the same size as one badge
 * per card.
 */
export function PairBadge({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className="inline-flex shrink-0 gap-0.5" aria-label="Speaker and listener: you two decide who starts" data-role-badge="pair">
      <span className={cn('inline-grid place-items-center rounded-md font-extrabold leading-none', CARD.speaker.className, className)} style={style} aria-hidden>
        {CARD.speaker.letter}
      </span>
      <span className={cn('inline-grid place-items-center rounded-md font-extrabold leading-none', CARD.listener.className, className)} style={style} aria-hidden>
        {CARD.listener.letter}
      </span>
    </span>
  );
}
