/**
 * @file canvas-share-list.tsx
 * @description P1650: the dropdown of the Share field (people, then events, then groups; one heading per section).
 * Split out of canvas-share-control.tsx. Rows wrap their text to at most two lines, so a long title never runs into the
 * next row at 320px. Keyboard use stays on the combobox input (ArrowUp/ArrowDown/Enter), which owns focus.
 */
import { Fragment } from 'react';
import { CalendarDays, Loader2, Users, type LucideIcon } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { SECTION_HEADING, type Option } from './canvas-share-options';

const KIND_ICON: Record<'event' | 'group', LucideIcon> = { event: CalendarDays, group: Users };

/** The leading mark of a row: a person's avatar, or an icon tile for an event or a group. */
export function RowMark({ kind, name, avatar }: { kind: Option['kind']; name: string; avatar?: Option['avatar'] }) {
  if (kind === 'person') {
    return <GravatarAvatar name={name} size="sm" avatarColor={avatar?.color} photoUrl={avatar?.photoUrl} isPledger={false} showRing={false} />;
  }
  const Icon = KIND_ICON[kind];
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
      <Icon className="h-4 w-4" />
    </span>
  );
}

interface Props {
  options: Option[];
  listId: string;
  optionId: (index: number) => string;
  activeIndex: number;
  busy: boolean;
  /** `kind:id` of the row whose change is in flight */
  pending: string | null;
  isSearching: boolean;
  /** what to say when there is no row and nothing is searching; null: say nothing */
  emptyText: string | null;
  onPick: (option: Option) => void;
}

export function CanvasShareList({ options, listId, optionId, activeIndex, busy, pending, isSearching, emptyText, onPick }: Props) {
  return (
    // A dropdown over the sections below, never pushing them: closing it (the field loses focus on a pointer
    // press elsewhere) must not shift what the press was aimed at.
    <div
      role="presentation"
      className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-border bg-background shadow-md"
      data-testid="canvas-share-list"
      // Keeps the field focused through a pointer pick, so the list does not close under the click.
      onMouseDown={e => e.preventDefault()}
    >
      <ul
        id={listId}
        role="listbox"
        className="flex max-h-56 flex-col overflow-y-auto p-1"
        aria-label="People, events and groups you can add"
        data-testid="canvas-share-options"
      >
        {options.map((o, i) => {
          const key = `${o.kind}:${o.id}`;
          return (
            <Fragment key={key}>
              {options[i - 1]?.kind !== o.kind && (
                <li role="presentation" className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground" data-testid="canvas-share-section">{SECTION_HEADING[o.kind]}</li>
              )}
              {/* Keyboard users act on options through the combobox, which keeps focus in the field. */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
              <li
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                aria-disabled={busy || undefined}
                onClick={() => { if (!busy) onPick(o); }}
                className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-muted ${i === activeIndex ? 'bg-muted' : ''} ${busy ? 'opacity-50' : ''}`}
                data-testid="canvas-share-option"
              >
                <RowMark kind={o.kind} name={o.label} avatar={o.avatar} />
                {/* At most two lines, then an ellipsis: a long title never runs into the next row. */}
                <span className="line-clamp-2 min-w-0 flex-1 break-words font-medium text-foreground" title={o.label} data-testid="canvas-share-option-label">{o.label}</span>
                {/* A long @handle gives way (ellipsis), never the name. */}
                <span className="max-w-[45%] shrink truncate text-xs text-muted-foreground" title={o.sub} data-testid="canvas-share-option-sub">{o.sub}</span>
                {pending === key && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" data-testid="canvas-share-row-spinner" />}
              </li>
            </Fragment>
          );
        })}
      </ul>
      {isSearching && <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="canvas-share-searching">Searching…</p>}
      {options.length === 0 && !isSearching && emptyText !== null && (
        <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="canvas-share-nothing-to-add">{emptyText}</p>
      )}
    </div>
  );
}
