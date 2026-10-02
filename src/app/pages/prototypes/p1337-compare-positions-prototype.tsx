/**
 * @file p1337-compare-positions-prototype.tsx
 * @description DEV-only prototype (/tree/compare-positions). P1337 — the compare view.
 *
 * Job: two people at a table, ONE phone between them, 10 seconds to find what to talk
 * about. "Where do we disagree most on tonight's statements?"
 *
 * Why a separate surface and not the profile points tab: on a profile the other person's
 * position is a small static badge in the quote header and the viewer's is the highlighted
 * button row further down (point-card-with-links.tsx:384 vs :423). Same quantity, two
 * visual languages, separated by the quote text — you compare them in your head, per point.
 * The letters flow already concluded this doesn't work: letter-reveal-ordinal.tsx:101
 * ("Where you each stand") gives two labelled columns for a SINGLE point.
 *
 * Decisions this encodes (conversation 2026-10-01/02):
 * - A plain list, sorted biggest gap first. No swiping, no cards to dismiss, no enter/exit
 *   mode: two people share one screen, so a one-person gesture excludes the other, and
 *   hiding the non-current rows is wrong when the job is choosing together.
 * - Agreements stay visible, sorted last — that is where false agreement hides.
 * - The round screen links in here with partner + event tag preset. The observer gets the
 *   same view for the pair in front of them, so they hear the real disagreement.
 *
 * Real build: one tag-filtered query (points.tags/system_tags contains the event's
 * statement_tag), not the unbounded profile fetch (points-service-real.ts:666-675).
 *
 * Render-only: mock data, no api.ts / auth imports.
 */
import { useMemo } from "react";
import { cn } from '@/lib/utils';

/** -3..+3, the app's seven-point scale. 0 = unsure / no view. */
type Level = -3 | -2 | -1 | 0 | 1 | 2 | 3;

interface Statement {
  id: string;
  text: string;
  mine: Level;
  theirs: Level;
}

const LABELS: Record<Level, string> = {
  [-3]: 'Strongly disagree',
  [-2]: 'Disagree',
  [-1]: 'Somewhat disagree',
  [0]: 'Unsure',
  [1]: 'Somewhat agree',
  [2]: 'Agree',
  [3]: 'Strongly agree',
};

const SHORT: Record<Level, string> = {
  [-3]: 'Strongly\ndisagree',
  [-2]: 'Disagree',
  [-1]: 'Somewhat\ndisagree',
  [0]: 'Unsure',
  [1]: 'Somewhat\nagree',
  [2]: 'Agree',
  [3]: 'Strongly\nagree',
};

/** Mock: the Ikigai 1 statement set, with a realistic spread incl. one exact agreement. */
const STATEMENTS: Statement[] = [
  {
    id: 's1',
    text: 'Work that pays well but means nothing to you is a worse life than work that means something and pays badly.',
    mine: 3,
    theirs: -3,
  },
  {
    id: 's2',
    text: 'Most people who say they have found their purpose have simply stopped asking the question.',
    mine: -2,
    theirs: 2,
  },
  {
    id: 's3',
    text: 'You discover what you are for by doing things, not by reflecting on yourself.',
    mine: 2,
    theirs: -1,
  },
  {
    id: 's4',
    text: 'A person who needs their work to be meaningful is asking too much of work.',
    mine: -1,
    theirs: 1,
  },
  {
    id: 's5',
    text: 'If an AI could do your work better than you, the work was never your purpose.',
    mine: 1,
    theirs: 2,
  },
  {
    id: 's6',
    text: 'Purpose is something a community gives you, not something you find alone.',
    mine: 2,
    theirs: 2,
  },
];

const ME = { name: 'You', initials: 'YO' };
const THEM = { name: 'Ben Tan', initials: 'BT' };

function gapOf(s: Statement) {
  return Math.abs(s.mine - s.theirs);
}

/** Opposite sides of the midpoint, both with a real view: the rows worth a round. */
function isOpposed(s: Statement) {
  return s.mine !== 0 && s.theirs !== 0 && Math.sign(s.mine) !== Math.sign(s.theirs);
}

function StanceColumn({
  name,
  initials,
  level,
  tone,
}: {
  name: string;
  initials: string;
  level: Level;
  tone: 'mine' | 'theirs';
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'w-8 h-8 rounded-full grid place-items-center text-[11px] font-semibold shrink-0',
          tone === 'mine' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700',
        )}
        aria-hidden
      >
        {initials}
      </div>
      <span className="text-[11px] text-slate-500 truncate max-w-full">{name}</span>
      <span
        className={cn(
          'text-[13px] font-semibold leading-tight text-center whitespace-pre-line',
          level > 0 && 'text-green-700',
          level < 0 && 'text-red-700',
          level === 0 && 'text-slate-400',
        )}
      >
        {SHORT[level]}
      </span>
    </div>
  );
}

function StatementRow({ s, rank }: { s: Statement; rank: number }) {
  const gap = gapOf(s);

  return (
    <li className="border border-border rounded-xl overflow-hidden bg-white">
      {/* No truncation and no expander: the statements are short enough to show whole.
          An expander that appears only past a character threshold produces exactly one
          orphan control in a list of six (review finding C3, cause verified in page). */}
      <div className="px-4 pt-3.5 pb-3">
        <p className="text-[14px] leading-snug text-slate-900">
          {rank === 0 && (
            <span className="mr-1.5 align-[1px] inline-block rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Start here
            </span>
          )}
          {s.text}
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-start gap-3">
          <StanceColumn name={ME.name} initials={ME.initials} level={s.mine} tone="mine" />
          <div className="w-px self-stretch bg-slate-200" />
          <StanceColumn name={THEM.name} initials={THEM.initials} level={s.theirs} tone="theirs" />
        </div>

        <p className="mt-3 text-[11px] text-center text-slate-500">
          {gap === 0 ? (
            <>You both said <span className="font-medium text-slate-700">{LABELS[s.mine]}</span></>
          ) : (
            <>
              {gap} {gap === 1 ? 'step' : 'steps'} apart
              {isOpposed(s) && <span className="text-slate-700 font-medium"> · opposite sides</span>}
            </>
          )}
        </p>
      </div>
    </li>
  );
}

export function ComparePositionsPrototype() {
  const sorted = useMemo(
    () => [...STATEMENTS].sort((a, b) => gapOf(b) - gapOf(a)),
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-md px-4 py-5">
        {/* Who, and which set of statements */}
        <header className="mb-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">
            Where you each stand
          </p>
          <h1 className="mt-1 text-[20px] font-semibold text-slate-900 leading-tight">
            You and {THEM.name}
          </h1>
          <div className="mt-2 inline-flex items-center rounded-full bg-white border border-border px-2.5 py-1 text-[12px] text-slate-600">
            Ikigai 1 · {STATEMENTS.length} statements
          </div>
        </header>

        {/* The orientation line sits ABOVE the list: the sort it describes is then ahead
            of the reader, not 1600px behind them (review C2). The suggestion is a badge
            on the first row rather than a dark banner repeating its sentence (C1). */}
        <p className="mb-3 text-[12px] leading-snug text-slate-600">
          Furthest apart first — start at the top. Where you agree is at the bottom, worth a
          look because you may agree for different reasons.
        </p>

        <ul className="space-y-2.5">
          {sorted.map((s, i) => (
            <StatementRow key={s.id} s={s} rank={i} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ComparePositionsPrototype;
