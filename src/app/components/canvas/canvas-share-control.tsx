/**
 * @file canvas-share-control.tsx
 * @description P1515: the owner's control at the top of a canvas, and the panel behind it.
 *
 * ONE VISIBILITY IDEA: a canvas is Private, and the owner chooses who else sees it. The control reads
 * "Private · only you", "Private · shared with <entries>" or, while general access is open,
 * "Anyone with the link"; everything inside the canvas follows it.
 *
 * PHASE 3 (founder, 2026-10-21): the panel is one invite field ("Add a person, event or group"), one
 * "Who has access" list (you, then people, events and groups, each removable with ×), a "General
 * access" choice (Only people added / Anyone with the link) and "Copy link". People come from the
 * existing relationship-scoped `search_profiles` (through useProfileSearch, never a new search);
 * events and groups are the owner's own (get_canvas_share_targets). A person entry needs the person
 * to be one the search would return, and the database refuses anyone else.
 *
 * A failed change shows an error and leaves the list as it was: the list only ever changes to what the
 * server confirmed. Copy is [FOUNDER DECISION] (spec UI Contract).
 */
import { useCallback, useRef, useState } from 'react';
import { CalendarDays, Link2, Lock, User, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  canvasService, type AudienceEntry, type CanvasGeneralAccess, type CanvasVisibility, type ShareTargets,
} from '@/app/data/canvas-service';
import { useProfileSearch } from '@/app/hooks/use-profile-search';
import { ownerLockLabel } from '@/lib/canvas-audience-copy';

const NAMES_SHOWN = 12;

function peopleText(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

const KIND_ICON = { person: User, event: CalendarDays, group: Users } as const;

interface Option {
  kind: 'person' | 'event' | 'group';
  id: string;
  label: string;
  sub: string;
}

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
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<{ entries: AudienceEntry[]; generalAccess: CanvasGeneralAccess; linkToken: string | null; targets: ShareTargets } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const { results: found, isSearching, hasSearched } = useProfileSearch(open ? query : '');
  const access = panel?.generalAccess ?? generalAccess;

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
    setPanel(null);
    setOpen(true);
    void load();
  };

  const change = async (run: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch {
      // The list stays as it was: it only ever shows what the server confirmed.
      setError(failure);
      setBusy(false);
      return;
    }
    // The change is confirmed: the page re-reads now, whatever the panel's own re-read does. If that
    // re-read fails the panel says it could not load the list, never that nothing changed.
    setQuery('');
    onChanged();
    await load();
    setBusy(false);
  };

  const copyLink = async () => {
    try {
      // While the canvas is open to anyone with the link, the link carries its token (`?k=`); otherwise it
      // is the plain address, which only the people, events and groups added can open.
      await navigator.clipboard.writeText(access === 'link' && panel?.linkToken ? `${link}?k=${panel.linkToken}` : link);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };

  const has = (kind: Option['kind'], id: string) => !!panel?.entries.some(x => x.kind === kind && x.id === id);
  const needle = query.trim().toLowerCase();
  // The owner's own events and groups, narrowed by what is typed; people come from the search.
  const options: Option[] = panel
    ? [
      ...found
        .filter(p => !has('person', p.profileId))
        .map(p => ({ kind: 'person' as const, id: p.profileId, label: p.name, sub: p.slug ? `@${p.slug}` : 'Person' })),
      ...panel.targets.events
        .filter(e => !has('event', e.id) && e.title.toLowerCase().includes(needle))
        .map(e => ({ kind: 'event' as const, id: e.id, label: e.title, sub: 'Event' })),
      ...panel.targets.groups
        .filter(g => !has('group', g.id) && g.name.toLowerCase().includes(needle))
        .map(g => ({ kind: 'group' as const, id: g.id, label: g.name, sub: 'Group' })),
    ]
    : [];

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        data-testid="canvas-share-control"
        // The label wraps rather than truncates: who the canvas is shared with is the point of the control.
        className="inline-flex min-h-10 min-w-0 max-w-full items-start gap-2 rounded-2xl border border-border bg-muted px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words" data-testid="canvas-share-label">{ownerLockLabel(entries, visibility, generalAccess)}</span>
        {visibility === 'shared' && <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" data-testid="canvas-share-panel">
          <DialogHeader>
            <DialogTitle>Who can see this canvas</DialogTitle>
            <DialogDescription>
              {access === 'link'
                ? 'Anyone with the link can open it. Switch it back to "Only people added" at any time.'
                : 'It is private: only you, until you share it. Everything in it follows, and you can stop at any time.'}
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <div role="alert" className="py-4 text-center text-sm">
              <p className="mb-2 text-muted-foreground">Could not load who this canvas is shared with.</p>
              <button type="button" onClick={() => void load()} className="min-h-10 font-medium text-blue-600 hover:text-blue-700">Retry</button>
            </div>
          ) : !panel ? (
            <div className="h-20 animate-pulse rounded-md bg-muted" aria-hidden />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor="canvas-share-invite" className="text-sm font-medium text-foreground">Add a person, event or group</label>
                <input
                  id="canvas-share-invite"
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                  placeholder="Name, event or group"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-base md:text-sm"
                  data-testid="canvas-share-invite"
                />
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="People, events and groups you can add" data-testid="canvas-share-options">
                  {options.map(o => {
                    const Icon = KIND_ICON[o.kind];
                    return (
                      <li key={`${o.kind}:${o.id}`}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void change(() => canvasService.shareCanvas(name, o.kind, o.id), 'Could not share. Nothing changed.')}
                          className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                          data-testid="canvas-share-option"
                        >
                          <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 break-words font-medium text-foreground">{o.label}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{o.sub}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {isSearching && <p className="text-sm text-muted-foreground" data-testid="canvas-share-searching">Searching…</p>}
                {options.length === 0 && !isSearching && (
                  <p className="text-sm text-muted-foreground" data-testid="canvas-share-nothing-to-add">
                    {needle !== ''
                      ? (hasSearched ? 'No one found. You can add people you already have a letter or an agreement with.' : 'Nothing matches yet.')
                      : panel.entries.length === 0
                        ? 'You have no events or groups to share with yet. Register for an event or join a group first, or type a name to add a person.'
                        : 'That is all of your events and groups. Type a name to add a person.'}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">Who has access</h3>
                <ul className="flex flex-col gap-2" data-testid="canvas-share-entries">
                  <li className="rounded-lg border border-border p-3" data-testid="canvas-share-owner">
                    <p className="text-sm font-medium text-foreground">You (owner)</p>
                    {panel.entries.length === 0 && access === 'restricted' && (
                      <p className="text-sm text-muted-foreground" data-testid="canvas-share-empty">Only you can see it.</p>
                    )}
                  </li>
                  {panel.entries.map(entry => {
                    const Icon = KIND_ICON[entry.kind];
                    const shown = entry.names?.slice(0, NAMES_SHOWN) ?? [];
                    const more = (entry.names?.length ?? 0) - shown.length;
                    return (
                      <li key={`${entry.kind}:${entry.id}`} className="rounded-lg border border-border p-3" data-testid="canvas-share-entry">
                        <div className="flex items-start gap-2">
                          <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium text-foreground">{entry.name}</p>
                            <p className="text-sm text-muted-foreground" data-testid="canvas-share-entry-count">
                              {entry.kind === 'person'
                                ? 'Can read it and add to it'
                                : !entry.ownerAdmitted
                                  ? 'You are no longer part of this, so it shows no one your canvas.'
                                  : `${peopleText(entry.count)} can see it${entry.names === null ? ' (names are private)' : ''}`}
                            </p>
                            {/* Self-admission: anyone who registers or joins gets in through it. */}
                            {entry.kind !== 'person' && entry.ownerAdmitted && entry.public && (
                              <p className="mt-1 text-xs text-muted-foreground" data-testid="canvas-share-entry-note">
                                {entry.kind === 'event' ? 'Anyone who registers in time can see it.' : 'Anyone who joins can see it.'}
                              </p>
                            )}
                            {entry.kind !== 'person' && entry.ownerAdmitted && entry.names !== null && shown.length > 0 && (
                              <p className="mt-1 break-words text-xs text-muted-foreground" data-testid="canvas-share-entry-names">
                                {shown.map(n => n.name).join(', ')}{more > 0 ? ` and ${more} more` : ''}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void change(() => canvasService.unshareCanvas(name, entry.kind, entry.id), 'Could not stop sharing. Nothing changed.')}
                            aria-label={`Stop sharing with ${entry.name}`}
                            className="-mr-1 flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                            data-testid="canvas-share-remove"
                          >
                            <X aria-hidden className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="canvas-share-general" className="text-sm font-medium text-foreground">General access</label>
                <select
                  id="canvas-share-general"
                  value={access}
                  disabled={busy}
                  onChange={e => void change(() => canvasService.setGeneralAccess(name, e.target.value as CanvasGeneralAccess), 'Could not change who has access. Nothing changed.')}
                  className="h-10 w-full rounded-md border border-border bg-background px-2 text-base md:text-sm"
                  data-testid="canvas-share-general"
                >
                  <option value="restricted">Only people added</option>
                  <option value="link">Anyone with the link</option>
                </select>
                <p className="text-sm text-muted-foreground" data-testid="canvas-share-general-note">
                  {access === 'link'
                    ? 'Anyone with the link can read it. Signed-in people can also take positions and add stories. Turning it off and on again makes a new link, and the old one stops working.'
                    : 'Only the people, events and groups above can open it.'}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyLink()}
                    className="min-h-10 gap-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    data-testid="canvas-share-copy"
                  >
                    <Link2 aria-hidden className="h-4 w-4" /> Copy link
                  </Button>
                  {copied === 'yes' && <span role="status" className="text-sm text-muted-foreground" data-testid="canvas-share-copied">Link copied</span>}
                  {copied === 'no' && <span role="alert" className="text-sm text-red-600" data-testid="canvas-share-copy-error">Could not copy the link.</span>}
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-red-600" data-testid="canvas-share-error">{error}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
