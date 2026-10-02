/**
 * @file p1337-host-controls-prototype.tsx
 * @description DEV-only prototype (/tree/host-controls). P1337 — the host's override control.
 *
 * The real situation this is designed against: the host is STANDING, one-handed, in a dim
 * room, with people waiting, and has ~20 seconds before the room notices the pause. It
 * happens 0-3 times per round, not constantly. 15 people, 5 numbered tables.
 *
 * Three approaches, same mock room, switchable at the top so the comparison is about the
 * interaction and not about who styled which one. Scored before they were chosen, against:
 * thumb reach at 375, taps per change, can you see + undo a mistake, legible at a glance in
 * dim light, whole room visible, 15 names without scrolling.
 *
 * A — TWO-TAP TRADE: tap a name, tap who it trades with. Fewest taps, whole room always on
 *     screen, the grid is its own confirmation. Blind spot: "trade" cannot say arrived/left.
 * B — WHO, THEN WHERE: two full-screen steps, huge targets. Best in dim light by a distance.
 *     Blind spot: loses the whole-room view mid-change, so three in a row disorients.
 * C — STATE THE FACT: no seating chart. Declare "keep apart", "already met", "left",
 *     "arrived" and press Regroup; facts persist across all three rounds, so a fact is
 *     stated once instead of re-fixed at every bell. Blind spot: satisfying one constraint
 *     can reshuffle five uninvolved people.
 *
 * REJECTED before building, with reasons (brainstorm pass 2026-10-01):
 * - Drag a chip across a room map: the only approach needing sustained precision contact,
 *   and five legible clusters do not fit at 320px.
 * - Voice ("Ana away from Erin"): spoken aloud in a quiet room it names both people and
 *   tells everyone there was a problem — the override exists to be invisible.
 * - Shake to redraw: throws away 14 correct placements to fix 1.
 * - Ask the person (push a request to their phone): routes through phones that are away by
 *   design, and cannot reach the person who just walked in.
 *
 * NOT an interface, kept separately: move the work OFF the bell — tap notes while seated
 * during the round, one button applies them all at the bell. Wraps any of A/B/C.
 *
 * Render-only: mock data, no api.ts / auth imports.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, RotateCcw, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'trade' | 'whowhere' | 'facts';

const TABLES = [1, 2, 3, 4, 5] as const;

/**
 * seats[tableIndex] = three names. Index 0 of each table is the observer.
 *
 * Deliberately NOT alphabetical and NOT in name order across tables: the first fixture was
 * both (Ana-Ben-Chloe = 1, Dev-Erin-Finn = 2 …), which let a reader infer table membership
 * from the alphabet and hid whether the grouping is legible on its own (review H2). Long
 * names are in on purpose too — the 52px tile with a second "observer" line is where they
 * break (H11).
 */
const INITIAL: string[][] = [
  ['Aleksandra', 'Ben', 'Noa'],
  ['Somchai', 'Kim', 'Erin'],
  ['Gia', 'Muhammad', 'Lars'],
  ['Jan', 'Haru', 'Chloe'],
  ['Mia', 'Dev', 'Oskar'],
];

type FactKind = 'apart' | 'met' | 'arrived' | 'left';

interface Fact {
  id: number;
  kind: FactKind;
  who: string[];
}

const FACT_LABEL: Record<FactKind, string> = {
  apart: 'keep apart',
  met: 'already met',
  arrived: 'just arrived',
  left: 'left',
};

function useRoom() {
  const [seats, setSeats] = useState<string[][]>(() => INITIAL.map(t => [...t]));
  const [history, setHistory] = useState<{ seats: string[][]; label: string }[]>([]);

  const swap = (a: string, b: string, label: string) => {
    setHistory(h => [...h, { seats: seats.map(t => [...t]), label }]);
    setSeats(prev =>
      prev.map(table => table.map(n => (n === a ? b : n === b ? a : n))),
    );
  };

  const moveTo = (person: string, tableIdx: number, label: string) => {
    const from = seats.findIndex(t => t.includes(person));
    if (from === -1 || from === tableIdx) return;
    // Move in, and send the table's last occupant back to the vacated seat.
    const displaced = seats[tableIdx][seats[tableIdx].length - 1];
    swap(person, displaced, label);
  };

  const undo = () => {
    setHistory(h => {
      if (h.length === 0) return h;
      setSeats(h[h.length - 1].seats);
      return h.slice(0, -1);
    });
  };

  return { seats, setSeats, history, swap, moveTo, undo };
}

function RoomGrid({
  seats,
  lifted,
  onName,
}: {
  seats: string[][];
  lifted?: string | null;
  onName?: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {/* The number column is labelled once: an unlabelled 1-5 chip reads as a row or a
          round, not a table (review H9). */}
      <p className="text-[10px] uppercase tracking-widest text-slate-500">Table</p>
      {seats.map((table, i) => (
        <div key={i} className="flex items-stretch gap-1.5">
          <div className="w-7 shrink-0 grid place-items-center rounded-lg bg-slate-200 text-[13px] font-semibold text-slate-600">
            {TABLES[i]}
          </div>
          {table.map((name, j) => (
            <button
              key={name}
              type="button"
              disabled={!onName}
              onClick={() => onName?.(name)}
              className={cn(
                'flex-1 min-w-0 min-h-[52px] rounded-lg px-1 text-[14px] font-medium leading-tight',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500',
                lifted === name
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-border text-slate-900',
                !onName && 'cursor-default',
              )}
            >
              <span className="block truncate">{name}</span>
              {j === 0 && (
                <span
                  className={cn(
                    'block text-[10px] font-normal',
                    lifted === name ? 'text-white/60' : 'text-slate-400',
                  )}
                >
                  observer
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── A ─────────────────────────────────────────────────────────────────────── */

function TradeVariant() {
  const { seats, history, swap, undo } = useRoom();
  const [lifted, setLifted] = useState<string | null>(null);

  const onName = (name: string) => {
    if (!lifted) {
      setLifted(name);
      return;
    }
    if (lifted === name) {
      setLifted(null);
      return;
    }
    swap(lifted, name, `${lifted} ↔ ${name}`);
    setLifted(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-500">
        {lifted ? (
          <>
            <span className="font-semibold text-slate-900">{lifted}</span> lifted — tap who it
            trades with
          </>
        ) : (
          'Tap a name, then tap who it trades with'
        )}
      </p>

      <RoomGrid seats={seats} lifted={lifted} onName={onName} />

      <div className="flex items-center gap-2 min-h-[44px]">
        {lifted && (
          <button
            type="button"
            onClick={() => setLifted(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2.5 text-[13px]"
          >
            <X size={14} /> Cancel
          </button>
        )}
        {history.length > 0 && (
          <button
            type="button"
            onClick={undo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2.5 text-[13px]"
          >
            <Undo2 size={14} /> Undo {history[history.length - 1].label}
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Cannot express “just arrived” or “left” — a trade always needs two people already seated.
      </p>
    </div>
  );
}

/* ── B ─────────────────────────────────────────────────────────────────────── */

function WhoWhereVariant() {
  const { seats, history, moveTo, undo } = useRoom();
  const [picked, setPicked] = useState<string | null>(null);

  const everyone = useMemo(
    () => seats.flatMap((t, i) => t.map(n => ({ name: n, table: TABLES[i] }))),
    [seats],
  );

  if (picked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2.5 text-[13px] min-h-[44px]"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <p className="text-[15px] font-semibold text-slate-900">{picked} goes to…</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {seats.map((table, i) => {
            const isHome = table.includes(picked);
            return (
              <button
                key={i}
                type="button"
                disabled={isHome}
                onClick={() => {
                  moveTo(picked, i, `${picked} → table ${TABLES[i]}`);
                  setPicked(null);
                }}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left min-h-[88px]',
                  isHome
                    ? 'border-dashed border-slate-300 bg-slate-100'
                    : 'border-border bg-white',
                )}
              >
                <p className="text-[16px] font-semibold text-slate-900">Table {TABLES[i]}</p>
                <p className="mt-1 text-[12px] text-slate-500 leading-snug">
                  {table.filter(n => n !== picked).join(', ')}
                </p>
                {isHome && <p className="mt-1 text-[11px] text-slate-400">already here</p>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-500">Who moves?</p>
      <ul className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
        {everyone.map(p => (
          <li key={p.name}>
            <button
              type="button"
              onClick={() => setPicked(p.name)}
              className="w-full flex items-center justify-between px-4 min-h-[52px] text-left"
            >
              <span className="text-[15px] text-slate-900">{p.name}</span>
              <span className="text-[13px] text-slate-400">table {p.table}</span>
            </button>
          </li>
        ))}
      </ul>

      {history.length > 0 && (
        <button
          type="button"
          onClick={undo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2.5 text-[13px] min-h-[44px]"
        >
          <Undo2 size={14} /> Undo {history[history.length - 1].label}
        </button>
      )}

      <p className="text-[11px] text-slate-400">
        The list scrolls past 15 names, and the room is not visible while choosing a destination.
      </p>
    </div>
  );
}

/* ── C ─────────────────────────────────────────────────────────────────────── */

function FactsVariant() {
  const { seats, setSeats } = useRoom();
  const [facts, setFacts] = useState<Fact[]>([
    { id: 1, kind: 'met', who: ['Haru', 'Kim'] },
  ]);
  const [drafting, setDrafting] = useState<FactKind | null>(null);
  const [pickedNames, setPickedNames] = useState<string[]>([]);
  const [regrouped, setRegrouped] = useState(false);

  const names = useMemo(() => seats.flat(), [seats]);
  const needsTwo = drafting === 'apart' || drafting === 'met';

  const commit = (kind: FactKind, who: string[]) => {
    setFacts(f => [...f, { id: Date.now(), kind, who }]);
    setDrafting(null);
    setPickedNames([]);
    setRegrouped(false);
  };

  const onPick = (name: string) => {
    if (!drafting) return;
    if (!needsTwo) {
      commit(drafting, [name]);
      return;
    }
    const next = [...pickedNames, name];
    if (next.length === 2) commit(drafting, next);
    else setPickedNames(next);
  };

  const regroup = () => {
    // Prototype stand-in: shuffle deterministically so the effect is visible.
    const flat = seats.flat();
    const rotated = [...flat.slice(4), ...flat.slice(0, 4)];
    setSeats([0, 1, 2, 3, 4].map(i => rotated.slice(i * 3, i * 3 + 3)));
    setRegrouped(true);
  };

  if (drafting) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDrafting(null);
              setPickedNames([]);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2.5 text-[13px] min-h-[44px]"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <p className="text-[15px] font-semibold text-slate-900">
            {FACT_LABEL[drafting]} — who?
            {needsTwo && pickedNames.length === 1 && (
              <span className="font-normal text-slate-500"> {pickedNames[0]} and…</span>
            )}
          </p>
        </div>
        <ul className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
          {names
            .filter(n => !pickedNames.includes(n))
            .map(n => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => onPick(n)}
                  className="w-full px-4 min-h-[52px] text-left text-[15px] text-slate-900"
                >
                  {n}
                </button>
              </li>
            ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-500">What’s true right now?</p>

      <div className="grid grid-cols-2 gap-2">
        {(['apart', 'met', 'arrived', 'left'] as FactKind[]).map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setDrafting(k)}
            className="rounded-xl border border-border bg-white px-3 min-h-[56px] text-[14px] font-medium text-slate-900"
          >
            {FACT_LABEL[k]}
          </button>
        ))}
      </div>

      {facts.length > 0 && (
        <ul className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
          {facts.map(f => (
            <li key={f.id} className="flex items-center justify-between px-3 min-h-[48px]">
              <span className="text-[14px] text-slate-900 truncate">
                {f.who.join(' / ')}
                <span className="text-slate-400"> — {FACT_LABEL[f.kind]}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setFacts(x => x.filter(y => y.id !== f.id));
                  setRegrouped(false);
                }}
                aria-label={`remove ${f.who.join(' and ')}`}
                className="shrink-0 ml-2 w-9 h-9 grid place-items-center text-slate-400"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={regroup}
        className="w-full rounded-xl bg-slate-900 text-white min-h-[56px] text-[15px] font-semibold inline-flex items-center justify-center gap-2"
      >
        {regrouped ? <Check size={18} /> : <RotateCcw size={18} />}
        {regrouped
          ? 'Regrouped'
          : `Regroup — ${facts.length} ${facts.length === 1 ? 'fact' : 'facts'}`}
      </button>

      <RoomGrid seats={seats} />

      <p className="text-[11px] text-slate-400">
        Facts persist across all three rounds. But satisfying one can move people who had
        nothing to do with it — compare the grid before and after Regroup.
      </p>
    </div>
  );
}

/* ── shell ─────────────────────────────────────────────────────────────────── */

const VARIANTS: { id: Variant; label: string }[] = [
  { id: 'trade', label: 'A · Trade' },
  { id: 'whowhere', label: 'B · Who/Where' },
  { id: 'facts', label: 'C · Facts' },
];

export function HostControlsPrototype() {
  const [variant, setVariant] = useState<Variant>('trade');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-md px-4 py-5">
        <header className="mb-3">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">Host · round 2 of 3</p>
          <h1 className="mt-1 text-[20px] font-semibold text-slate-900">Override the grouping</h1>
        </header>

        <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-200 p-1">
          {VARIANTS.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v.id)}
              className={cn(
                'rounded-lg min-h-[40px] text-[13px] font-medium',
                variant === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {variant === 'trade' && <TradeVariant key="trade" />}
        {variant === 'whowhere' && <WhoWhereVariant key="whowhere" />}
        {variant === 'facts' && <FactsVariant key="facts" />}
      </div>
    </div>
  );
}

export default HostControlsPrototype;
