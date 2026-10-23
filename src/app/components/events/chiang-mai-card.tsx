/**
 * @file chiang-mai-card.tsx
 * @description P1545 decision 6: the Chiang Mai calendar card on the events list. Taps are counted
 * (`cm_calendar_card_clicked`); many taps are the evidence for a custom Chiang Mai list later.
 *
 * Yellow on purpose: a founder-decided exception to the no-yellow rule in .claude/rules/src.md
 * (features/p1545_menu_and_artifacts.md, Resolved Decisions: "Yellow Chiang Mai banner stays").
 * `quiet` is the one-level-down version for when events are listed, so Join stays the primary action.
 *
 * [FOUNDER DECISION: the card copy is a placeholder taken from the founder's round-2 brief.]
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { analytics } from '@/lib/mixpanel';

const CM_CARD = {
  title: 'Chiang Mai events',
  body: 'One calendar, collected from 75 sources',
  cta: 'Open the calendar',
  href: '/cm',
};

export type ChiangMaiCardPlacement = 'events_list_main' | 'events_list_below';

interface Props {
  /** Quieter variant, used below a list that has events. */
  quiet?: boolean;
  /** Whether our own list has events: sent with the tap so empty-list taps can be told apart. */
  hasEvents: boolean;
}

export function ChiangMaiCard({ quiet = false, hasEvents }: Props) {
  const placement: ChiangMaiCardPlacement = quiet ? 'events_list_below' : 'events_list_main';
  return (
    <section
      aria-label={CM_CARD.title}
      data-testid="chiang-mai-card"
      className={
        quiet
          ? 'rounded-xl border border-yellow-500 bg-yellow-100 p-4 text-neutral-900'
          : 'rounded-2xl border-2 border-yellow-500 bg-yellow-300 p-5 text-neutral-900 shadow-sm sm:p-7'
      }
    >
      {quiet ? (
        <h2 className="text-lg font-bold leading-tight">{CM_CARD.title}</h2>
      ) : (
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{CM_CARD.title}</h2>
      )}
      <p className={quiet ? 'mt-1 text-sm' : 'mt-2 text-lg font-medium sm:text-xl'}>{CM_CARD.body}</p>
      <Link
        to={CM_CARD.href}
        onClick={() => analytics.track('cm_calendar_card_clicked', { placement, has_events: hasEvents })}
        className={
          quiet
            ? 'mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900'
            : 'mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-6 text-base font-semibold text-yellow-300 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-yellow-300 sm:w-auto'
        }
      >
        {CM_CARD.cta}
        <ArrowRight aria-hidden className={quiet ? 'h-4 w-4' : 'h-5 w-5'} />
      </Link>
    </section>
  );
}
