/**
 * @file movement-charts.tsx
 * @description P1061: the drawings of position movement: where everyone stood first and latest on a point (a
 * larger cousin of the product's seven-bar spread), a story's groups as bars, and one person's positions over
 * time. Each drawing is hidden from screen readers, which get the same facts as text. Blue marks "latest" or a
 * change, never "good". Every SVG text is drawn at 12px at least: the drawing keeps its own width and scrolls
 * inside its own container instead of shrinking.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Ear } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PositionBadge } from '@/app/components/shared/PositionBadge';
import { POSITION_LABELS } from '@/app/types';
import { entryIndexAt, positionOfLevel, totalOf, type PositionEntry, type StrengthCounts } from '@/lib/position-movement';
import { Hint } from './movement-bits';
import { chartHint } from './movement-copy';
import { STRENGTH_PARTS } from './movement-palette';
import { countsOfLevels, dayLabelOf } from './movement-scope';

const LEVELS = [-3, -2, -1, 0, 1, 2, 3];
const BAR = 13;
const BAR_MAX = 60;
const AXIS = 78;
const CHART_WIDTH = 300;
const levelX = (value: number) => 30 + (value + 3) * 40;

function describeLevels(values: number[]) {
  const counts = countsOfLevels(values);
  return Object.values(counts)
    .map((n, i) => (n > 0 ? `${n} at ${POSITION_LABELS[positionOfLevel(i - 3)]}` : null))
    .filter(Boolean)
    .join(', ');
}

/** How a set of people stood on one point, level by level: their first position against their latest. */
export function BeforeAfterChart({ readings, label, dated }: {
  readings: { before: number; after: number }[];
  label: string;
  /** a pair of dates is set: first and latest are then the first and the latest inside them */
  dated: boolean;
}) {
  if (readings.length === 0) {
    return <p className="py-3 text-center text-sm text-muted-foreground" data-testid="chart-empty">No one here has a position before and after yet</p>;
  }
  const before = readings.map(r => r.before);
  const after = readings.map(r => r.after);
  const was = Object.values(countsOfLevels(before));
  const now = Object.values(countsOfLevels(after));
  const tallest = Math.max(1, ...was, ...now);
  const height = (n: number) => (n === 0 ? 0 : Math.max(3, (n / tallest) * BAR_MAX));
  return (
    <figure aria-label={label} data-testid="before-after-chart">
      {/* The drawing scales to its box (never scrolls: seven bars are one picture). Its words are 14 units, so
          they render at 12px or more down to a 260px box: the narrowest one, a 320px phone. */}
      <svg viewBox={`0 0 ${CHART_WIDTH} 100`} className="mx-auto block h-auto w-full max-w-[340px]" aria-hidden="true">
        {LEVELS.map((value, i) => (
          <g key={value}>
            <rect data-bar="before" data-count={was[i] ?? 0} x={levelX(value) - BAR - 1} y={AXIS - height(was[i] ?? 0)} width={BAR} height={height(was[i] ?? 0)} className="fill-white stroke-gray-500" strokeWidth={1.5} />
            <rect data-bar="after" data-count={now[i] ?? 0} x={levelX(value) + 1} y={AXIS - height(now[i] ?? 0)} width={BAR} height={height(now[i] ?? 0)} className="fill-blue-600" />
            {(was[i] ?? 0) > 0 && <text x={levelX(value) - BAR / 2 - 1} y={AXIS - height(was[i] ?? 0) - 3} textAnchor="middle" className="fill-gray-600 text-[14px]">{was[i]}</text>}
            {(now[i] ?? 0) > 0 && <text x={levelX(value) + BAR / 2 + 1} y={AXIS - height(now[i] ?? 0) - 3} textAnchor="middle" className="fill-blue-700 text-[14px] font-semibold">{now[i]}</text>}
          </g>
        ))}
        <line x1={8} y1={AXIS} x2={292} y2={AXIS} className="stroke-gray-300" />
        <text x={8} y={96} className="fill-gray-500 text-[14px]">Disagree</text>
        <text x={292} y={96} textAnchor="end" className="fill-gray-500 text-[14px]">Agree</text>
      </svg>
      <p className="sr-only">First: {describeLevels(before)}. Latest: {describeLevels(after)}.</p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-gray-500 bg-white" aria-hidden />first</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-blue-600" aria-hidden />latest</span>
        <Hint label="How to read this chart">{chartHint(dated)}</Hint>
      </div>
    </figure>
  );
}

/** One group on one point as one bar: each part as wide as its share of the group, with its count written in it. */
export function StrengthBar({ name, counts, testId }: { name: string; counts: StrengthCounts; testId: string }) {
  const total = totalOf(counts);
  return (
    <div
      role="img"
      data-testid={testId}
      aria-label={`${name}: ${total} ${total === 1 ? 'person' : 'people'}. ${counts.switched} switched sides, ${counts.other} other change, ${counts.same} same.`}
    >
      <div className="flex items-baseline justify-between text-sm" aria-hidden>
        <span className="text-foreground">{name}</span>
        <span className="tabular-nums text-muted-foreground">{total}</span>
      </div>
      {total === 0
        ? <div className="mt-1 h-6 rounded-sm border border-dashed border-border" aria-hidden />
        : (
          <div className="mt-1 flex h-6 gap-px overflow-hidden rounded-sm" aria-hidden>
            {STRENGTH_PARTS.filter(part => counts[part.id] > 0).map(part => (
              // A small part keeps room for its number, so no count is ever left unwritten.
              <span key={part.id} data-part={part.id} data-count={counts[part.id]} style={{ flexGrow: counts[part.id] }} className={`flex min-w-6 basis-0 items-center justify-center text-xs font-semibold ${part.bar}`}>
                {counts[part.id]}
              </span>
            ))}
          </div>
        )}
    </div>
  );
}

/** Where the second bar would be, when it is withheld: the reason in a few words, and no number at all. */
export function WithheldBar({ name, reason }: { name: string; reason: string }) {
  return (
    <div role="img" data-testid="strength-withheld" aria-label={`${name}: ${reason}.`}>
      <div className="text-sm text-foreground" aria-hidden>{name}</div>
      <div className="mt-1 flex min-h-6 items-center justify-center rounded-sm border border-dashed border-border px-2 text-center text-xs text-muted-foreground" aria-hidden>{reason}</div>
    </div>
  );
}

/** One key for every bar of the story's panel, with the explanation behind the info button at its end. */
export function StrengthKey({ hint }: { hint: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="strength-key">
      {STRENGTH_PARTS.map((part, i) => (
        <span key={part.id} className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${part.bar}`} aria-hidden />{part.word}
          {/* The last word and the info button wrap as one piece, so the button never sits on a line of its own. */}
          {i === STRENGTH_PARTS.length - 1 && hint}
        </span>
      ))}
    </div>
  );
}

const LEFT = 62;
const COL = 56;
const RIGHT = 70;
const LABEL_MAX = 12;
const stepX = (i: number) => LEFT + 22 + i * COL;
const levelY = (value: number) => 22 + (3 - value) * 18;
// On the levels the badges call Agrees, Unsure and Disagrees; the lines beyond are the strong forms.
const AXIS_WORDS: Record<number, string> = { 2: 'Agree', 0: 'Unsure', [-2]: 'Disagree' };

export interface LogVerification { storyId: string; authorName: string; at: string }

const shortName = (name: string) => (name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1)}…` : name);

/** One person's positions on one point, oldest first, with a dotted line wherever a story's author verified them. */
function LogChart({ entries, verifications }: { entries: PositionEntry[]; verifications: LogVerification[] }) {
  const width = LEFT + 22 + Math.max(1, entries.length - 1) * COL + RIGHT;
  // A history wider than its box opens at its latest end: the latest position is what the row is about.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box) box.scrollLeft = box.scrollWidth;
  }, [width]);
  return (
    // Hidden from screen readers as a whole: the dated list under it says the same, position by position.
    // Drawn at 1:1 so no text renders under 12px. The scale's words stay put in their own column while a long
    // history scrolls beside them: the drawing keeps one coordinate system, the second view starting at LEFT.
    <div aria-hidden="true" data-testid="log-chart" className="flex">
      <svg viewBox={`0 0 ${LEFT} 166`} width={LEFT} height={166} className="block shrink-0">
        {LEVELS.map(value => AXIS_WORDS[value] && (
          <text key={value} x={LEFT - 8} y={levelY(value) + 4} textAnchor="end" className="fill-gray-500 text-[12px]">{AXIS_WORDS[value]}</text>
        ))}
      </svg>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto" data-testid="log-chart-scroll">
      <svg viewBox={`${LEFT} 0 ${width - LEFT} 166`} width={width - LEFT} height={166} className="block">
        {LEVELS.map(value => (
          <line key={value} x1={LEFT} y1={levelY(value)} x2={width} y2={levelY(value)} className={value === 0 ? 'stroke-gray-400' : 'stroke-gray-100'} strokeDasharray={value === 0 ? '3 3' : undefined} />
        ))}
        {verifications.map(v => {
          // After the position held when verified (before the first one when there was none).
          const x = stepX(entryIndexAt(entries, v.at) + 0.5);
          return (
            <g key={v.storyId} data-verified-by={v.authorName}>
              <line x1={x} y1={16} x2={x} y2={138} className="stroke-blue-400" strokeWidth={1.5} strokeDasharray="2 3" />
              <text x={x + 4} y={12} className="fill-blue-700 text-[12px] font-medium">{shortName(v.authorName)}</text>
            </g>
          );
        })}
        <polyline points={entries.map((e, i) => `${stepX(i)},${levelY(e.level)}`).join(' ')} fill="none" className="stroke-blue-600" strokeWidth={2} />
        {entries.map((e, i) => (
          <g key={i}>
            <circle cx={stepX(i)} cy={levelY(e.level)} r={4.5} className="fill-blue-600" />
            {/* Every point carries its date, also when two fall on the same day. */}
            <text x={stepX(i)} y={158} textAnchor="middle" className="fill-gray-700 text-[12px]">{dayLabelOf(e.at)}</text>
          </g>
        ))}
      </svg>
      </div>
    </div>
  );
}

function VerificationLine({ v, name }: { v: LogVerification; name: string }) {
  return (
    // The whole line is the link, at least 44px tall; only the story's name looks like a link.
    <Link to={`/story/${v.storyId}`} data-testid="verification" className="group flex min-h-11 items-center py-1.5 text-xs text-muted-foreground focus-visible:outline-none">
      <span className="flex min-w-0 items-start gap-1.5">
        <Ear size={12} className="mt-0.5 shrink-0 text-blue-700" aria-hidden />
        <span className="min-w-0">
          {v.authorName} verified {name}’s understanding of{' '}
          <span className="rounded-sm font-medium text-blue-700 underline underline-offset-2 group-hover:text-blue-800 group-focus-visible:ring-2 group-focus-visible:ring-blue-500" data-testid="verification-story">{v.authorName}’s story</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * The whole log: the drawing, and under it each verification as a line of its own, naming whose story it was
 * and leading to that story. The dated list is for screen readers alone, where each verification still comes
 * right after the position the person held then.
 */
export function PersonLog({ entries, verifications, name }: { entries: PositionEntry[]; verifications: LogVerification[]; name: string }) {
  const at = (index: number) => verifications.filter(v => entryIndexAt(entries, v.at) === index);
  return (
    <div data-testid="person-log">
      {/* A holder with no position in the history has nothing to draw or list: only their verifications, as text. */}
      {entries.length > 0 && <LogChart entries={entries} verifications={verifications} />}
      {/* A verification before every position leads the list. */}
      {at(-1).map(v => <VerificationLine key={v.storyId} v={v} name={name} />)}
      {entries.length > 0 && (
        <ol aria-label={`${name}’s positions, oldest first`}>
          {entries.map((e, i) => (
            <li key={i}>
              <div className="sr-only" data-testid="log-position">
                <span>{dayLabelOf(e.at)}:</span> <PositionBadge position={positionOfLevel(e.level)} />
              </div>
              {at(i).map(v => <VerificationLine key={v.storyId} v={v} name={name} />)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
