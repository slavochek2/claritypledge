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
 *
 * REBUILT 2026-10-02 on founder feedback: *"why don't we reuse the same patterns that we
 * have in Clarity Letter? now you put design system completely different, no icons, no
 * pictures, invented stuff, not clickable."* So this uses the real letter-reveal vocabulary
 * rather than an invented one:
 *   - StanceColumn's shape from letter-reveal-ordinal.tsx:50-83 — GravatarAvatar at 24px,
 *     name in text-xs at 50% opacity, the stance as a BLUE pill (text-blue-700/bg-blue-100,
 *     rounded-full px-4 py-2) carrying the full-word label.
 *   - Blue for BOTH sides, never green/red. The letters flow is deliberate about this, and it
 *     also answers the review finding that red-vs-green reads as "the app says he is wrong".
 *   - The statement in StatementPointCard's treatment (letter-point-card.tsx:33-45) — pin
 *     icon in a blue circle, gray-50 contained card, text-lg.
 *   - POSITION_FULL_LABELS wording, not invented short labels.
 *
 * Also on that feedback: the "N steps apart · opposite sides" meta line is GONE — *"this is
 * weird. don't do that."* The sort carries the comparison; it does not need narrating. Rows
 * are now clickable through to the point.
 *
 * A plain list, sorted biggest gap first. No swiping, no cards to dismiss, no enter/exit
 * mode: two people share one screen, so a one-person gesture excludes the other.
 *
 * Real build: /compare/:person?tag=<tag>, reached from a control on any profile — one
 * tag-filtered query, not the unbounded profile fetch (points-service-real.ts:666-675).
 *
 * Render-only: mock data, no api.ts / auth imports.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Pin } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { cn } from '@/lib/utils';

type PositionKey =
  | 'strongly_agree'
  | 'agree'
  | 'somewhat_agree'
  | 'unsure'
  | 'somewhat_disagree'
  | 'disagree'
  | 'strongly_disagree';

/** letter-reveal-ordinal.tsx:23-31 — third person, because the column describes someone. */
const POSITION_FULL_LABELS: Record<PositionKey, string> = {
  strongly_agree: 'Strongly agrees',
  agree: 'Agrees',
  somewhat_agree: 'Somewhat agrees',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagrees',
  disagree: 'Disagrees',
  strongly_disagree: 'Strongly disagrees',
};

/** First person for the viewer's own column — "You strongly agrees" reads wrong. */
const POSITION_FIRST_PERSON: Record<PositionKey, string> = {
  strongly_agree: 'Strongly agree',
  agree: 'Agree',
  somewhat_agree: 'Somewhat agree',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagree',
  disagree: 'Disagree',
  strongly_disagree: 'Strongly disagree',
};

const ORDER: PositionKey[] = [
  'strongly_disagree',
  'disagree',
  'somewhat_disagree',
  'unsure',
  'somewhat_agree',
  'agree',
  'strongly_agree',
];

interface Statement {
  id: string;
  text: string;
  mine: PositionKey;
  theirs: PositionKey;
}

const STATEMENTS: Statement[] = [
  {
    id: 's1',
    text: 'Work that pays well but means nothing to you is a worse life than work that means something and pays badly.',
    mine: 'strongly_agree',
    theirs: 'strongly_disagree',
  },
  {
    id: 's2',
    text: 'Most people who say they have found their purpose have simply stopped asking the question.',
    mine: 'disagree',
    theirs: 'agree',
  },
  {
    id: 's3',
    text: 'You discover what you are for by doing things, not by reflecting on yourself.',
    mine: 'agree',
    theirs: 'somewhat_disagree',
  },
  {
    id: 's4',
    text: 'A person who needs their work to be meaningful is asking too much of work.',
    mine: 'somewhat_disagree',
    theirs: 'somewhat_agree',
  },
  {
    id: 's5',
    text: 'If an AI could do your work better than you, the work was never your purpose.',
    mine: 'somewhat_agree',
    theirs: 'agree',
  },
  {
    id: 's6',
    text: 'Purpose is something a community gives you, not something you find alone.',
    mine: 'agree',
    theirs: 'agree',
  },
];

const ME = { name: 'You', avatarColor: '#1E40AF', hasPledged: true };
const THEM = { name: 'Ben Tan', avatarColor: '#B45309', hasPledged: false };

/** The sets you can compare on: an event's statements, or a standing system tag. */
const TAGS = [
  { id: 'ikigai1', label: 'Ikigai 1' },
  { id: 'understanding', label: 'Understanding' },
  { id: 'cmp', label: 'Clarity Meeting Principle' },
];

function gapOf(s: Statement) {
  return Math.abs(ORDER.indexOf(s.mine) - ORDER.indexOf(s.theirs));
}

/** letter-reveal-ordinal.tsx:50-83 — avatar + name above, blue stance pill as the hero. */
function StanceColumn({
  name,
  avatarColor,
  hasPledged,
  label,
}: {
  name: string;
  avatarColor: string;
  hasPledged: boolean;
  label: string;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
        <GravatarAvatar
          name={name}
          photoUrl={undefined}
          avatarColor={avatarColor}
          isPledger={hasPledged}
          size="sm"
          className="!w-6 !h-6 !text-[10px]"
        />
        <span className="text-xs text-[#1A1A1A]/50 truncate">{name}</span>
      </div>
      <span className="inline-block text-base font-semibold text-blue-700 bg-blue-100 rounded-full px-4 py-2 text-center leading-snug">
        {label}
      </span>
    </div>
  );
}

function StatementRow({ s }: { s: Statement }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          /* real build: navigate to the point */
        }}
        className="w-full text-left bg-white rounded-xl border border-border p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {/* letter-point-card.tsx:33-45 — the statement, pinned, in its own contained card */}
        <div className="rounded-lg border border-border bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
              <Pin size={12} className="rotate-45" />
            </div>
            <p className="text-lg font-medium text-[#1A1A1A] flex-1 min-w-0 break-words leading-snug">
              {s.text}
            </p>
            <ChevronRight size={18} className="shrink-0 mt-1 text-[#1A1A1A]/30" aria-hidden />
          </div>
        </div>

        <div className="mt-4 flex items-start gap-4">
          <StanceColumn
            name={ME.name}
            avatarColor={ME.avatarColor}
            hasPledged={ME.hasPledged}
            label={POSITION_FIRST_PERSON[s.mine]}
          />
          <div className="w-px self-stretch bg-gray-200" />
          <StanceColumn
            name={THEM.name}
            avatarColor={THEM.avatarColor}
            hasPledged={THEM.hasPledged}
            label={POSITION_FULL_LABELS[s.theirs]}
          />
        </div>
      </button>
    </li>
  );
}

export function ComparePositionsPrototype() {
  const [tag, setTag] = useState(TAGS[0].id);
  const sorted = useMemo(() => [...STATEMENTS].sort((a, b) => gapOf(b) - gapOf(a)), []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-lg px-4 py-5">
        <header className="mb-4">
          <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/50">Where you each stand</p>
          <h1 className="mt-1 text-xl font-semibold text-[#1A1A1A] leading-tight">
            You and {THEM.name}
          </h1>
        </header>

        {/* The tag is a CHOICE, not a label: this is how you compare yourself with anyone on
            any set — an event's statements, or a standing tag like Understanding. */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {TAGS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTag(t.id)}
              className={cn(
                'shrink-0 rounded-full px-3 min-h-[36px] text-sm border',
                tag === t.id
                  ? 'bg-blue-100 border-blue-200 text-blue-700 font-medium'
                  : 'bg-white border-border text-[#1A1A1A]/60',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mb-3 text-sm text-[#1A1A1A]/60">
          Furthest apart first. Where you agree is at the bottom — worth a look, because you may
          agree for different reasons.
        </p>

        <ul className="space-y-3">
          {sorted.map(s => (
            <StatementRow key={s.id} s={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ComparePositionsPrototype;
