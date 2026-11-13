/**
 * @file table-card-parts.tsx
 * @description P1529: the pieces of the participant's Table card, apart from the round poll that feeds them: the header (table left, time right, the part bar under), my role (bold, with an (i) button), everyone at the table (avatar, name, role), and the canvas actions (a real button, primary
 * only while reading; "See other canvases" as a blue link). Wording is a draft: [FOUNDER DECISION: copy].
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { formatClock, type RoundClock, type RoundPhase, type RoundTiming } from '@/lib/round-clock';
import { SCREEN_PART_NAME } from './mastermind-host-helpers';
import { partLeftMs } from './screen-time-left';
import { PhaseStrip } from './host-screen-parts';
import type { PersonRef, EventRoomMember } from '@/app/types';
import type { RoundSeat } from '@/app/data/event-rounds-service';
import { MISSING_NAME, ROLE_EXPLAINER, ROLE_WORD, tableFaces, type MastermindRole, type RoleStep } from './mastermind-round-helpers';

/** Table name large on the left, the time left on the right; under them the projector's own part bar (no labels). */
export function TableStatus({ table, clock, timing, hasObserver }: { table: number; clock: RoundClock | null; timing: RoundTiming; hasObserver: boolean }) {
  return (
    <div data-testid="round-card-status">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold" data-testid="round-card-table">Table {table}</h2>
          {clock && clock.phase !== 'over' && <p className="text-base font-medium text-muted-foreground" data-testid="round-card-part">{SCREEN_PART_NAME[clock.phase as Exclude<RoundPhase, 'over'>]}</p>}
        </div>
        {clock && <p className="text-3xl font-semibold tabular-nums" data-testid="round-card-time">{clock.phase === 'over' ? 'Time\u2019s up' : formatClock(partLeftMs(clock, timing))}</p>}
      </div>
      {clock && <div className="mt-2" data-testid="round-card-parts"><PhaseStrip clock={clock} timing={timing} hasObserver={hasObserver} noLabels /></div>}
    </div>
  );
}

export interface TableFace { id: string; you: boolean; role: MastermindRole; name: string; person: PersonRef }

/** The table's seats as faces (me first, kept for the card's own use), each with the roster's avatar and pledge ring. */
export function buildFaces(seats: RoundSeat[], mineId: string, roster: EventRoomMember[], nameOf: (id: string) => string): TableFace[] {
  return tableFaces(seats, mineId).map(f => {
    const m = roster.find(r => r.id === f.seat.id);
    const person = { name: m?.displayName || MISSING_NAME, slug: m?.profileSlug ?? undefined, avatarColor: m?.profileAvatarColor ?? undefined, avatarUrl: m?.profileAvatarUrl, hasPledged: m?.profileHasPledged ?? false };
    return { id: f.seat.id, you: f.you, role: f.role, name: nameOf(f.seat.id), person };
  });
}

/** My own role, bold on one line; the (i) is a small icon button that opens the role's explanation. */
export function MyRole({ role }: { role: MastermindRole }) {
  return (
    <p className="mt-2 flex items-center gap-1 text-lg font-bold" data-testid="round-card-my-role">
      <span>You&rsquo;re the {ROLE_WORD[role]}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`What the ${ROLE_WORD[role]} does`} className="h-10 w-10 text-muted-foreground" data-testid="role-info">
            <Info className="h-4 w-4" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="text-sm font-normal" data-testid="role-info-text">{ROLE_EXPLAINER[role]}</PopoverContent>
      </Popover>
    </p>
  );
}

/** Every step of my role as a numbered list; the steps of the current part are highlighted (blue, aria-current). */
export function InstructionBox({ steps }: { steps: RoleStep[] }) {
  return (
    <div className="mt-3 rounded-lg border border-blue-100 p-3 text-base" data-testid="round-card-instruction">
      <ol className="list-decimal space-y-2 pl-5 marker:font-semibold">
        {steps.map(st => (
          <li
            key={st.text}
            aria-current={st.current ? 'step' : undefined}
            data-current={st.current ? 'true' : 'false'}
            className={st.current ? 'rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-900 ring-1 ring-blue-200' : 'px-2 py-1 text-muted-foreground'}
          >
            {st.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The others at the table (no "You" row, P1529 G8: my own role is the line above): a 32px avatar (pledge ring), the name and the role word, muted. */
export function TablePeople({ faces }: { faces: TableFace[] }) {
  return (
    <ul className="mt-2 space-y-2" data-testid="round-card-others">
      {faces.filter(f => !f.you).map(f => (
        <li key={f.id} className="flex items-center gap-2 text-base" data-testid="round-card-person" data-name={f.name} data-role={f.role}>
          <PersonAvatar person={f.person} size="sm" className="!h-8 !w-8" />
          <span className="font-medium">{f.name}</span>
          <span className="text-sm text-muted-foreground">{ROLE_WORD[f.role]}</span>
        </li>
      ))}
    </ul>
  );
}

export interface CanvasTarget { to: string | null; label: string; onOpen?: () => void }

/** The table's canvas: the primary filled button (outline while seated in a live round with the mic not running), centred; nothing for the observer in their own part. */
export function CanvasOpen({ offer, target, linkState, micFirst = false }: { micFirst?: boolean; offer: 'primary' | 'none'; target: CanvasTarget; linkState: unknown }) {
  if (!target.to || offer === 'none') return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button asChild variant={micFirst ? "outline" : "default"} className="min-h-12 w-full text-base sm:w-auto">
        <Link data-variant={micFirst ? "outline" : "primary"} to={target.to} state={linkState} onClick={target.onOpen} data-testid="round-canvas-link">{target.label}</Link>
      </Button>
    </div>
  );
}

export interface OtherLink { id: string; label: string; to: string | null }

const LINK = 'inline-flex min-h-10 items-center text-sm font-medium text-blue-600 underline';

/** "See other canvases": a centred blue text link that opens a list; each row is its own blue underlined link. The main button never changes. */
export function OtherCanvases({ others, linkState }: { others: OtherLink[]; linkState: unknown }) {
  const [open, setOpen] = useState(false);
  const linkable = others.filter(o => o.to);
  if (linkable.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col items-center">
      <button type="button" className={LINK} aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="round-canvas-others-toggle">
        See other Clarity Canvases &rarr;
      </button>
      {open && (
        <ul className="mt-1 w-full space-y-1 text-center" data-testid="round-canvas-others">
          {linkable.map(o => (
            <li key={o.id}><Link to={o.to!} state={linkState} className={LINK} data-testid="round-canvas-other-link">{o.label}</Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
