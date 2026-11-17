/**
 * @file movement-filter.tsx
 * @description P1061: one button that opens a dialog to choose whose positions the Changes view counts: a
 * search over people, events and groups (the list of the canvas Share field) and two date fields. An event
 * or a group is a set of people: its row says how many. Events and groups are offered to a signed-in viewer only.
 */
import { useId, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { RowMark } from '@/app/components/canvas/canvas-share-list';
import { SECTION_HEADING, sectionsOf, type Option } from '@/app/components/canvas/canvas-share-options';
import type { PointMovementRows } from '@/app/data/movement-service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { chosenPeople, datesCrossed, EVERYONE, isEveryone, readingsOf, type MovementScope } from '@/lib/position-movement';
import { chosenTargets, describeScope, toggleTarget } from './movement-scope';
import { DIALOG_HEAD, QUIET_DIALOG } from './quiet-dialog';

const PEOPLE_SHOWN_UNTYPED = 4;

const sized = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** The rows on offer: the holders listed in Changes (by the start of the name), then events and groups when signed in. */
function optionsFor(query: string, scope: MovementScope, data: PointMovementRows, signedIn: boolean): Option[] {
  const needle = query.trim().toLowerCase();
  const holders = readingsOf(data.history, data.current, data.agentIds)
    .map(r => ({ id: r.userId, person: data.people.get(r.userId) }))
    .map(h => ({ id: h.id, name: h.person?.name ?? 'Someone', person: h.person }))
    .filter(h => !scope.people.includes(h.id) && h.name.toLowerCase().startsWith(needle));
  const people = needle === '' ? holders.slice(0, PEOPLE_SHOWN_UNTYPED) : holders;
  return [
    ...people.map(h => ({
      kind: 'person' as const, id: h.id, label: h.name, sub: 'Person',
      avatar: { photoUrl: h.person?.avatarUrl ?? undefined, color: h.person?.avatarColor ?? undefined },
    })),
    ...(signedIn ? data.events.filter(e => !scope.events.includes(e.id) && e.title.toLowerCase().includes(needle))
      .map(e => ({ kind: 'event' as const, id: e.id, label: e.title, sub: `Event · ${sized(e.memberIds.length)}` })) : []),
    ...(signedIn ? data.groups.filter(g => !scope.groups.includes(g.id) && g.name.toLowerCase().includes(needle))
      .map(g => ({ kind: 'group' as const, id: g.id, label: g.name, sub: sized(g.memberIds.length) })) : []),
  ];
}

function Chosen({ scope, data, onChange }: { scope: MovementScope; data: PointMovementRows; onChange: (scope: MovementScope) => void }) {
  const targets = chosenTargets(scope, data);
  if (targets.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people, events and groups">
      {targets.map(t => (
        <li key={`${t.kind}:${t.id}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 text-sm text-foreground">
          <span className="break-words">{t.label}</span>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" aria-label={`Remove ${t.label}`} onClick={() => onChange(toggleTarget(scope, t.kind, t.id))}>
            <X size={14} aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Picker({ scope, data, signedIn, onChange, id }: { scope: MovementScope; data: PointMovementRows; signedIn: boolean; onChange: (scope: MovementScope) => void; id: string }) {
  const [query, setQuery] = useState('');
  const options = optionsFor(query, scope, data, signedIn);
  return (
    <div>
      <Label htmlFor={`${id}-search`}>People, events, groups</Label>
      <Input id={`${id}-search`} className="mt-1 h-11" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a name" autoComplete="off" />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border p-1">
        {sectionsOf(options).map(({ kind, items }) => (
          <div key={kind} role="group" aria-label={SECTION_HEADING[kind]}>
            <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{SECTION_HEADING[kind]}</p>
            {items.map(({ o }) => (
              <Button key={`${o.kind}:${o.id}`} variant="ghost" aria-label={`${o.label}, ${o.sub}`} className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-2 py-1 text-left" onClick={() => { onChange(toggleTarget(scope, o.kind, o.id)); setQuery(''); }}>
                <span aria-hidden="true" className="shrink-0"><RowMark kind={o.kind} name={o.label} avatar={o.avatar} /></span>
                {/* The name over its second line, never beside it: on a phone a long event title would crush the name. */}
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-foreground">{o.label}</span>
                  <span className="block break-words text-xs font-normal text-muted-foreground">{o.sub}</span>
                </span>
              </Button>
            ))}
          </div>
        ))}
        {options.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nothing matches</p>}
      </div>
    </div>
  );
}

/**
 * When the positions were taken: two native date fields. A date typed by hand passes through half-typed
 * values, so neither field ever rewrites the other; a pair in the wrong order counts nobody and says why.
 */
function Dates({ scope, onChange, id }: { scope: MovementScope; onChange: (scope: MovementScope) => void; id: string }) {
  // A year typed past four digits is no date at all.
  const whole = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">When the positions were taken</legend>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-from`} className="font-normal text-muted-foreground">From</Label>
          <Input id={`${id}-from`} type="date" className="mt-1 h-11" value={scope.from} max={scope.to || undefined} onChange={e => onChange({ ...scope, from: whole(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor={`${id}-to`} className="font-normal text-muted-foreground">To</Label>
          <Input id={`${id}-to`} type="date" className="mt-1 h-11" value={scope.to} min={scope.from || undefined} onChange={e => onChange({ ...scope, to: whole(e.target.value) })} />
        </div>
        {datesCrossed(scope) && <p role="status" className="text-sm text-foreground sm:col-span-2" data-testid="dates-crossed">The first date is after the last one</p>}
      </div>
    </fieldset>
  );
}

/** How many people the filter selects now: those with two positions, after people, events, groups and dates. */
function selectedCount(data: PointMovementRows, scope: MovementScope): number {
  const chosen = chosenPeople(scope, data.events, data.groups);
  return readingsOf(data.history, data.current, data.agentIds, { from: scope.from, to: scope.to }).filter(r => chosen === null || chosen.has(r.userId)).length;
}

/**
 * Closed: one small button. Open: a dialog to change the filter, with the number of people it now selects,
 * "Reset" and "Done". Every change counts at once; "Done" only closes.
 */
export function MovementFilter({ data, scope, onChange, signedIn, defaultOpen = false }: {
  data: PointMovementRows;
  scope: MovementScope;
  onChange: (s: MovementScope) => void;
  signedIn: boolean;
  /** open on first render (the P955 gate fixture) */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const selected = selectedCount(data, scope);
  return (
    <div data-testid="scope-control">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {/* A blue-bordered pill, never a white bar; tinted while a filter is on. */}
          <button
            type="button"
            aria-label={`Filter people: ${describeScope(scope, data)}`}
            data-filtered={!isEveryone(scope)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isEveryone(scope) ? 'border-blue-200 bg-card' : 'border-blue-600 bg-blue-50'}`}
          >
            <SlidersHorizontal size={16} className="shrink-0" aria-hidden />
            <span className="max-[359px]:sr-only">Filter</span>
          </button>
        </DialogTrigger>
        <DialogContent {...QUIET_DIALOG} data-testid="scope-dialog">
          <DialogHeader className={DIALOG_HEAD}>
            <DialogTitle>Filter people</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <Chosen scope={scope} data={data} onChange={onChange} />
            <Picker scope={scope} data={data} signedIn={signedIn} onChange={onChange} id={id} />
            <Dates scope={scope} onChange={onChange} id={id} />
          </div>
          <div className="flex items-center gap-2 border-t border-border p-4">
            <span className="mr-auto text-sm text-muted-foreground" role="status" data-testid="scope-count">{sized(selected)}</span>
            {!isEveryone(scope) && <Button variant="outline" className="min-h-11 rounded-full" onClick={() => onChange(EVERYONE)}>Reset</Button>}
            <DialogClose asChild><Button className="min-h-11">Done</Button></DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
