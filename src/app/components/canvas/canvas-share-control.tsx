/**
 * @file canvas-share-control.tsx
 * @description P1515: the owner's Share button at the top right of a canvas, and the panel behind it.
 *
 * ONE VISIBILITY IDEA: a canvas is Private, and the owner chooses who else sees it; everything inside
 * the canvas follows it.
 *
 * PHASE 4 (founder UAT): the panel is modelled on a Claude artifact's and Notion's share panels. One
 * invite field ("Add people, events or groups") whose list opens on focus with the owner's own events and
 * groups and narrows as the owner types (people come from the relationship-scoped `search_profiles`,
 * through useProfileSearch, never a new search); "People with access" (you first, then each entry with a
 * subline and a remove control); "General access" (Only people added / Anyone with the link, the second
 * after a confirmation); a footer with the current reach and "Copy link". Every change saves at once: a
 * change in flight shows a spinner on its row, a failure says so and restores the row.
 *
 * Anchored under the button on desktop (Popover); a bottom sheet below 640px (Dialog). The invite list is a
 * dropdown over the sections below, opened by focusing the field (never on open, so it never covers the list).
 *
 * A failed change leaves the list as it was: the list only ever changes to what the server confirmed.
 * Copy is [FOUNDER DECISION] (spec UI Contract).
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, CalendarDays, Globe, Link2, Loader2, Lock, Users, X, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import {
  canvasService, type AudienceEntry, type CanvasGeneralAccess, type CanvasVisibility, type ShareTargets,
} from '@/app/data/canvas-service';
import { useProfileSearch } from '@/app/hooks/use-profile-search';
import { ownerLockLabel } from '@/lib/canvas-audience-copy';

/** "Copied" shows this long, then the button reads "Copy link" again. */
const COPIED_MS = 2000;
const SHEET_QUERY = '(max-width: 639px)';

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Below 640px the panel is a bottom sheet; above, a popover under the button. */
function useIsSheet(): boolean {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;
  const [sheet, setSheet] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SHEET_QUERY);
    const on = () => setSheet(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return sheet;
}

interface Option {
  kind: 'person' | 'event' | 'group';
  id: string;
  label: string;
  sub: string;
  avatar?: { photoUrl?: string; color?: string };
}

const KIND_ICON: Record<'event' | 'group', LucideIcon> = { event: CalendarDays, group: Users };

/** The leading mark of a row: a person's avatar, or an icon tile for an event or a group. */
function RowMark({ kind, name, avatar }: { kind: Option['kind']; name: string; avatar?: Option['avatar'] }) {
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

const SHEET_CLASS =
  'left-0 top-auto bottom-0 flex max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-2xl border-x-0 border-b-0 p-0 pb-[env(safe-area-inset-bottom)] ' +
  'data-[state=open]:!zoom-in-100 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 ' +
  'data-[state=closed]:!zoom-out-100 data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0 [&>*]:min-w-0';

export function CanvasShareControl({ name, visibility, generalAccess = 'restricted', entries, link, onChanged }: {
  /** the canvas's name (the part after canvas_) */
  name: string;
  visibility: CanvasVisibility;
  /** who may open it besides the entries, as last read with the canvas */
  generalAccess?: CanvasGeneralAccess;
  /** the audience as last read with the canvas; null when that read failed */
  entries: AudienceEntry[] | null;
  /** the canvas's address, for "Copy link" */
  link: string;
  /** told after a share, unshare or access change the server confirmed, so the page re-reads */
  onChanged: () => void;
}) {
  const sheet = useIsSheet();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<{ entries: AudienceEntry[]; generalAccess: CanvasGeneralAccess; linkToken: string | null; targets: ShareTargets } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which row a change in flight belongs to (`kind:id`, or 'general'): it wears the spinner.
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [listFocused, setListFocused] = useState(false);
  // The list was closed on purpose (a pick, Escape): it stays closed until the owner types, clicks or presses ArrowDown.
  const [listDismissed, setListDismissed] = useState(false);
  // The highlighted option, by key: the list changes under it (the people search answers late and prepends), a position would not stay put.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Where focus goes once a removal's re-read has rendered: the next row's remove button, else the invite input.
  const focusAfter = useRef<{ index: number } | null>(null);
  const entriesRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const stateId = useId();
  const titleId = useId();
  const inviteId = useId();
  const peopleId = useId();
  const generalId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The owner has just switched the link off in this panel: the line says the old link stops working.
  const [linkClosed, setLinkClosed] = useState(false);
  // Which address the last copy attempt was for ('' = none could be built): its status shows only while that is still the address to copy.
  const [copied, setCopied] = useState<{ ok: boolean; target: string } | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteRef = useRef<HTMLInputElement>(null);
  const { results: found, isSearching, hasSearched } = useProfileSearch(open ? query : '');
  const access = panel?.generalAccess ?? generalAccess;

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  // Each read is numbered; only the newest may set the panel, so a slow earlier read (an open, then
  // a change) never puts back the list from before the change.
  const latestRead = useRef(0);
  const load = useCallback(async () => {
    const read = ++latestRead.current;
    setLoadError(false);
    try {
      const [access, targets] = await Promise.all([canvasService.getAccess(name), canvasService.getShareTargets()]);
      if (read === latestRead.current) setPanel({ entries: access.entries, generalAccess: access.generalAccess, linkToken: access.linkToken, targets });
    } catch {
      if (read === latestRead.current) setLoadError(true);
    }
  }, [name]);

  const openPanel = () => {
    setError(null);
    setQuery('');
    setCopied(null);
    setLinkClosed(false);
    setListFocused(false);
    setListDismissed(false);
    setActiveKey(null);
    focusAfter.current = null;
    setPanel(null);
    setOpen(true);
    void load();
  };

  const change = async (key: string, run: () => Promise<void>, failure: string, onConfirmed?: () => void): Promise<boolean> => {
    setBusy(true);
    setPending(key);
    setError(null);
    try {
      await run();
    } catch {
      // The list stays as it was: it only ever shows what the server confirmed.
      setError(failure);
      setBusy(false);
      setPending(null);
      return false;
    }
    // The change is confirmed: the page re-reads now, whatever the panel's own re-read does. If that
    // re-read fails the panel says it could not load the list, never that nothing changed.
    onConfirmed?.();
    onChanged();
    await load();
    setBusy(false);
    setPending(null);
    return true;
  };

  // Focus back in the field without popping the list open (a programmatic return is not a request for it).
  const focusInvite = () => {
    setListDismissed(true);
    inviteRef.current?.focus();
  };

  const pick = async (o: Option) => {
    // The list closes with the pick (the new entry is then in view under it); a failure leaves it open to try again.
    const ok = await change(`${o.kind}:${o.id}`, () => canvasService.shareCanvas(name, o.kind, o.id), 'Could not share. Nothing changed.');
    if (ok) {
      setQuery('');
      setActiveKey(null);
      focusInvite();
    }
  };

  const remove = async (entry: AudienceEntry, index: number) => {
    // The focus target is set as soon as the removal is confirmed, before the re-read and before busy clears.
    await change(`${entry.kind}:${entry.id}`, () => canvasService.unshareCanvas(name, entry.kind, entry.id), 'Could not stop sharing. Nothing changed.', () => { focusAfter.current = { index }; });
  };

  // After a removal has rendered: focus the row that took its place, or the field when it was the last one.
  useEffect(() => {
    if (busy || !focusAfter.current || !panel) return;
    const { index } = focusAfter.current;
    focusAfter.current = null;
    const buttons = entriesRef.current?.querySelectorAll<HTMLButtonElement>('[data-testid="canvas-share-remove"]');
    if (buttons && index < buttons.length) buttons[index]?.focus();
    else focusInvite();
  }, [busy, panel]);

  const chooseAccess = (next: CanvasGeneralAccess) => {
    if (next === access) return;
    // Opening the canvas to anyone asks first; narrowing it back needs no confirmation.
    if (next === 'link') { setConfirmOpen(true); return; }
    void change('general', async () => { await canvasService.setGeneralAccess(name, next); }, 'Could not change who has access. Nothing changed.')
      .then(ok => { if (ok) setLinkClosed(true); });
  };

  const confirmLink = () => {
    setConfirmOpen(false);
    void change('general', async () => { await canvasService.setGeneralAccess(name, 'link'); }, 'Could not change who has access. Nothing changed.')
      .then(ok => { if (ok) setLinkClosed(false); });
  };

  // The address "Copy link" would copy. While the canvas is open to anyone with the link, the address carries the
  // token in its FRAGMENT (`#k=`, never sent to a server); if the token is not known (the panel has not read it, or the read failed) there is NO address to
  // copy: a tokenless address would not open the canvas for the people it is sent to.
  const copyTarget = access === 'link' ? (panel?.linkToken ? `${link}#k=${panel.linkToken}` : null) : link;
  const copyLink = async () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    const settle = (value: { ok: boolean; target: string }) => {
      setCopied(value);
      if (value.ok) copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
    };
    if (!copyTarget) { settle({ ok: false, target: '' }); return; }
    try {
      await navigator.clipboard.writeText(copyTarget);
      settle({ ok: true, target: copyTarget });
    } catch {
      settle({ ok: false, target: copyTarget });
    }
  };
  // A status belongs to the address it was for: once access (or the token) changes, it is gone.
  const copyStatus = copied && copied.target === (copyTarget ?? '') ? (copied.ok ? 'yes' : 'no') : null;

  const has = (kind: Option['kind'], id: string) => !!panel?.entries.some(x => x.kind === kind && x.id === id);
  const needle = query.trim().toLowerCase();
  // The owner's own events and groups, narrowed by what is typed; people come from the search.
  const options: Option[] = panel
    ? [
      ...found
        .filter(p => !has('person', p.profileId))
        .map(p => ({ kind: 'person' as const, id: p.profileId, label: p.name, sub: p.slug ? `@${p.slug}` : 'Person', avatar: { photoUrl: p.avatarUrl ?? undefined, color: p.avatarColor } })),
      ...panel.targets.events
        .filter(e => !has('event', e.id) && e.title.toLowerCase().includes(needle))
        .map(e => ({ kind: 'event' as const, id: e.id, label: e.title, sub: 'Event' })),
      ...panel.targets.groups
        .filter(g => !has('group', g.id) && g.name.toLowerCase().includes(needle))
        .map(g => ({ kind: 'group' as const, id: g.id, label: g.name, sub: 'Group' })),
    ]
    : [];
  const listOpen = !!panel && !listDismissed && (listFocused || needle !== '');
  const optionKey = (o: Option) => `${o.kind}:${o.id}`;
  const activeIndex = activeKey === null ? -1 : options.findIndex(o => optionKey(o) === activeKey);
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const onInviteKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!panel) return;
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      if (!listOpen) {
        setListDismissed(false);
        const first = down ? options[0] : options[options.length - 1];
        setActiveKey(first ? optionKey(first) : null);
        return;
      }
      if (options.length === 0) return;
      const next = activeIndex < 0 ? (down ? 0 : options.length - 1) : (activeIndex + (down ? 1 : -1) + options.length) % options.length;
      setActiveKey(optionKey(options[next] as Option));
    } else if (e.key === 'Enter' && listOpen && !busy && activeIndex >= 0) {
      e.preventDefault();
      void pick(options[activeIndex] as Option);
    }
  };
  // The highlighted option left the list (the search changed it): the highlight clears rather than moving to another option.
  useEffect(() => {
    if (activeKey !== null && activeIndex < 0) setActiveKey(null);
  }, [activeKey, activeIndex]);
  // Arrow keys keep the highlighted option in view inside the scrolling list.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the list first, the confirmation before the panel: only then does it close the panel.
  const onEscape = (e: { preventDefault: () => void }) => {
    if (confirmOpen) { e.preventDefault(); return; }
    if (listOpen) { e.preventDefault(); setListDismissed(true); setActiveKey(null); }
  };
  const shownAccess = access;

  const button = (
    <button
      type="button"
      onClick={sheet ? openPanel : undefined}
      aria-haspopup="dialog"
      data-testid="canvas-share-control"
      aria-label="Share"
      aria-describedby={stateId}
      title="Share"
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full max-sm:order-3 bg-blue-600 px-3 py-2 sm:px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      {/* Open to anyone with the link: a globe, never a lock (a lock says "restricted"). */}
      {shownAccess === 'link'
        ? <Globe aria-hidden className="h-4 w-4 shrink-0" data-testid="canvas-share-open-icon" />
        : <Lock aria-hidden className="h-4 w-4 shrink-0" data-testid="canvas-share-lock-icon" />}
      <span className="hidden sm:inline">Share</span>
      {/* The state, for assistive technology: who can open the canvas right now. */}
      <span id={stateId} className="sr-only" data-testid="canvas-share-label">{ownerLockLabel(entries, visibility, shownAccess)}</span>
    </button>
  );

  const body = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="canvas-share-body">
      {/* The header stays put: only the body scrolls, and the footer stays pinned under it. */}
      <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-2 pt-4" data-testid="canvas-share-header">
        {sheet
          ? <DialogTitle className="min-w-0 break-words text-base font-semibold text-foreground" data-testid="canvas-share-title">{name}</DialogTitle>
          : <h2 id={titleId} className="min-w-0 break-words text-base font-semibold text-foreground" data-testid="canvas-share-title">{name}</h2>}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4" data-testid="canvas-share-scroll">
      {/* One invite field. Focusing it opens the list at once (the owner's events and groups); typing narrows it. */}
      <div
        role="presentation"
        className="relative flex flex-col gap-1"
        onFocus={() => setListFocused(true)}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setListFocused(false); setListDismissed(false); } }}
      >
        <label htmlFor={inviteId} className="sr-only">Add people, events or groups</label>
        <input
          ref={inviteRef}
          id={inviteId}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setListDismissed(false); setActiveKey(null); }}
          onClick={() => setListDismissed(false)}
          onKeyDown={onInviteKeyDown}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          placeholder="Add people, events or groups"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:text-sm"
          data-testid="canvas-share-invite"
        />
        {listOpen && (
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
                const key = optionKey(o);
                return (
                  // Keyboard users act on options through the combobox (ArrowUp/ArrowDown/Enter), which keeps focus in the field.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    aria-disabled={busy || undefined}
                    onClick={() => { if (!busy) void pick(o); }}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted ${i === activeIndex ? 'bg-muted' : ''} ${busy ? 'opacity-50' : ''}`}
                    data-testid="canvas-share-option"
                  >
                    <RowMark kind={o.kind} name={o.label} avatar={o.avatar} />
                    <span className="min-w-0 flex-1 break-words font-medium text-foreground" data-testid="canvas-share-option-label">{o.label}</span>
                    {/* A long @handle gives way (ellipsis), never the name. */}
                    <span className="max-w-[45%] shrink truncate text-xs text-muted-foreground" title={o.sub} data-testid="canvas-share-option-sub">{o.sub}</span>
                    {pending === key && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" data-testid="canvas-share-row-spinner" />}
                  </li>
                );
              })}
            </ul>
            {isSearching && <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="canvas-share-searching">Searching…</p>}
            {options.length === 0 && !isSearching && (
              <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="canvas-share-nothing-to-add">
                {needle !== ''
                  ? (hasSearched ? 'No one found. You can add people you already have a letter or an agreement with.' : 'Nothing matches yet.')
                  : panel.targets.events.length === 0 && panel.targets.groups.length === 0
                    ? 'You have no events or groups to share with yet. Register for an event or join a group first, or type a name to add a person.'
                    : 'That is all of your events and groups. Type a name to add a person.'}
              </p>
            )}
          </div>
        )}
      </div>

      {loadError ? (
        <div role="alert" className="py-2 text-center text-sm">
          <p className="mb-2 text-muted-foreground">Could not load who this canvas is shared with.</p>
          <button type="button" onClick={() => void load()} className="min-h-10 font-medium text-blue-600 hover:text-blue-700">Retry</button>
        </div>
      ) : !panel ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" aria-hidden />
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-labelledby={peopleId}>
            <h3 id={peopleId} className="text-sm font-medium text-foreground">People with access</h3>
            <ul ref={entriesRef} className="flex flex-col" data-testid="canvas-share-entries">
              <li className="flex min-h-12 items-center gap-3 py-1" data-testid="canvas-share-owner">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">You</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">You <span className="font-normal text-muted-foreground">(owner)</span></p>
                  {panel.entries.length === 0 && access === 'restricted' && (
                    <p className="text-sm text-muted-foreground" data-testid="canvas-share-empty">Only you can see it.</p>
                  )}
                </div>
              </li>
              {panel.entries.map((entry, index) => {
                const key = `${entry.kind}:${entry.id}`;
                const date = entry.kind === 'event' ? shortDate(panel.targets.events.find(e => e.id === entry.id)?.datetime ?? '') : '';
                return (
                  <li key={key} className="flex items-start gap-3 py-1" data-testid="canvas-share-entry">
                    <span className="mt-1"><RowMark kind={entry.kind} name={entry.name} /></span>
                    <div className="min-w-0 flex-1 py-1">
                      <p className="break-words text-sm font-medium text-foreground">{entry.name}</p>
                      {entry.kind === 'person' && entry.slug && (
                        <p className="truncate text-sm text-muted-foreground" title={`@${entry.slug}`} data-testid="canvas-share-entry-handle">@{entry.slug}</p>
                      )}
                      {date !== '' && <p className="text-sm text-muted-foreground" data-testid="canvas-share-entry-date">{date}</p>}
                      {/* Only the warning that matters: an entry the owner has left admits no one. */}
                      {entry.kind !== 'person' && !entry.ownerAdmitted && (
                        <p className="text-sm text-muted-foreground" data-testid="canvas-share-entry-warning">You are no longer part of this, so it shows no one your canvas.</p>
                      )}
                    </div>
                    {pending === key && <Loader2 aria-hidden className="mt-3 h-4 w-4 shrink-0 animate-spin text-muted-foreground" data-testid="canvas-share-row-spinner" />}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(entry, index)}
                      aria-label={`Stop sharing with ${entry.name}`}
                      className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                      data-testid="canvas-share-remove"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor={generalId} className="text-sm font-medium text-foreground">General access</label>
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                {access === 'link' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <select
                id={generalId}
                value={access}
                disabled={busy}
                onChange={e => chooseAccess(e.target.value as CanvasGeneralAccess)}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:text-sm"
                data-testid="canvas-share-general"
              >
                <option value="restricted">Only people added</option>
                <option value="link">Anyone with the link</option>
              </select>
              {pending === 'general' && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" data-testid="canvas-share-row-spinner" />}
            </div>
            <p className="text-sm text-muted-foreground" data-testid="canvas-share-general-note">
              {access === 'link'
                ? 'Anyone with the link can read it. Signed-in people can also take positions and add stories. Turning it off and on again makes a new link, and the old one stops working.'
                : `Only the people, events and groups above can open it.${linkClosed ? ' The old link stops working.' : ''}`}
            </p>
          </section>

          {error && <p role="alert" className="text-sm text-red-600" data-testid="canvas-share-error">{error}</p>}
          {copyStatus === 'no' && <p role="alert" className="text-sm text-red-600" data-testid="canvas-share-copy-error">Could not copy the link.</p>}
        </>
      )}
      </div>

      {panel && !loadError && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-testid="canvas-share-footer">
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:text-sm" data-testid="canvas-share-reach">
              {access === 'link' ? <Globe aria-hidden className="h-4 w-4 shrink-0" /> : <Lock aria-hidden className="h-4 w-4 shrink-0" />}
              <span className="min-w-0">{access === 'link' ? 'Anyone with the link can open this canvas' : 'Only people added can open this canvas'}</span>
            </p>
            <Button
              type="button"
              onClick={() => void copyLink()}
              // Not while a change or the re-read after it is in flight: the address would be the old one.
              disabled={busy}
              variant="outline"
              className="min-h-11 w-full shrink-0 gap-2 border-blue-600 bg-background text-blue-700 hover:bg-blue-50 hover:text-blue-700 sm:w-auto"
              data-testid="canvas-share-copy"
            >
              {copyStatus === 'yes'
                ? <><Check aria-hidden className="h-4 w-4" /><span role="status" data-testid="canvas-share-copied">Copied</span></>
                : <><Link2 aria-hidden className="h-4 w-4" /> Copy link</>}
            </Button>
          </div>
      )}
    </div>
  );

  return (
    <>
      {sheet ? (
        <>
          {button}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent hideCloseButton className={SHEET_CLASS} data-testid="canvas-share-panel" onEscapeKeyDown={onEscape} onInteractOutside={e => { if (confirmOpen) e.preventDefault(); }}>
              <DialogDescription className="sr-only">Who can open this canvas, and how to share it.</DialogDescription>
              {body}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={next => { if (next) openPanel(); else setOpen(false); }}>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
          <PopoverContent
            align="end"
            collisionPadding={16}
            aria-labelledby={titleId}
            className="flex max-h-[min(80vh,640px)] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-background p-0 shadow-lg [&>*]:min-w-0"
            data-testid="canvas-share-panel"
            // The confirmation sits outside the popover: interacting with it is not an outside click.
            onInteractOutside={e => { if (confirmOpen) e.preventDefault(); }}
            onEscapeKeyDown={onEscape}
          >
            {body}
          </PopoverContent>
        </Popover>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Share with anyone who has the link?"
        description="Anyone with this link can read this canvas, even without signing in. Signed-in people can also add positions and stories."
        confirmLabel="Share with link"
        cancelLabel="Cancel"
        variant="default"
        confirmClassName="bg-blue-600 text-white hover:bg-blue-700"
        onConfirm={confirmLink}
      />
    </>
  );
}
