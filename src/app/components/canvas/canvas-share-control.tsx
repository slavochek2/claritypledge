/**
 * @file canvas-share-control.tsx
 * @description P1515: the owner's control at the top of a canvas, and the panel behind it.
 *
 * ONE VISIBILITY IDEA: a canvas is Private, and the owner chooses who else sees it. There is no
 * "Shared" setting and no public switch; the control reads "Private · only you" or "Private · shared
 * with <entries>", and everything inside the canvas follows it.
 *
 * The panel lists each entry (an event or a group) with how many people it admits, their names for
 * an event or a public group, and a count only for a private group (members cannot see each other
 * there). The owner adds an entry from their own events and groups, or removes one. A failed change
 * shows an error and leaves the list as it was: the list only ever changes to what the server
 * confirmed. Copy is [FOUNDER DECISION] (spec UI Contract).
 */
import { useCallback, useState } from 'react';
import { CalendarDays, Lock, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { canvasService, type AudienceEntry, type CanvasVisibility, type ShareTargets } from '@/app/data/canvas-service';
import { ownerLockLabel } from '@/lib/canvas-audience-copy';

const NAMES_SHOWN = 12;

function peopleText(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

export function CanvasShareControl({ name, visibility, entries, onChanged }: {
  /** the canvas's name (the part after canvas_) */
  name: string;
  visibility: CanvasVisibility;
  /** the audience as last read with the canvas; null when that read failed */
  entries: AudienceEntry[] | null;
  /** told after a share or unshare the server confirmed, so the page re-reads */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<{ entries: AudienceEntry[]; targets: ShareTargets } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [audience, targets] = await Promise.all([canvasService.getAudience(name), canvasService.getShareTargets()]);
      setPanel({ entries: audience, targets });
    } catch {
      setLoadError(true);
    }
  }, [name]);

  const openPanel = () => {
    setError(null);
    setPick('');
    setPanel(null);
    setOpen(true);
    void load();
  };

  const change = async (run: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      const [audience, targets] = await Promise.all([canvasService.getAudience(name), canvasService.getShareTargets()]);
      setPanel({ entries: audience, targets });
      setPick('');
      onChanged();
    } catch {
      // The list stays as it was: it only ever shows what the server confirmed.
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const addable = panel
    ? [
      ...panel.targets.events
        .filter(e => !panel.entries.some(x => x.kind === 'event' && x.id === e.id))
        .map(e => ({ value: `event:${e.id}`, label: e.title, group: 'Events' })),
      ...panel.targets.groups
        .filter(g => !panel.entries.some(x => x.kind === 'group' && x.id === g.id))
        .map(g => ({ value: `group:${g.id}`, label: g.name, group: 'Groups' })),
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
        <span className="min-w-0 break-words" data-testid="canvas-share-label">{ownerLockLabel(entries, visibility)}</span>
        {visibility === 'shared' && <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" data-testid="canvas-share-panel">
          <DialogHeader>
            <DialogTitle>Who can see this canvas</DialogTitle>
            <DialogDescription>
              It is private: only you, until you share it. Everything in it follows, and you can stop at any time.
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
              {panel.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="canvas-share-empty">Only you can see it.</p>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="canvas-share-entries">
                  {panel.entries.map(entry => {
                    const Icon = entry.kind === 'event' ? CalendarDays : Users;
                    const shown = entry.names?.slice(0, NAMES_SHOWN) ?? [];
                    const more = (entry.names?.length ?? 0) - shown.length;
                    return (
                      <li key={`${entry.kind}:${entry.id}`} className="rounded-lg border border-border p-3" data-testid="canvas-share-entry">
                        <div className="flex items-start gap-2">
                          <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium text-foreground">{entry.name}</p>
                            <p className="text-sm text-muted-foreground" data-testid="canvas-share-entry-count">
                              {!entry.ownerAdmitted
                                ? 'You are no longer part of this, so it shows no one your canvas.'
                                : `${peopleText(entry.count)} can see it${entry.names === null ? ' (names are private)' : ''}`}
                            </p>
                            {entry.ownerAdmitted && entry.names !== null && shown.length > 0 && (
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
              )}

              {addable.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="canvas-share-nothing-to-add">
                  {panel.entries.length === 0
                    ? 'You have no events or groups to share with yet. Register for an event or join a group first.'
                    : 'That is all of your events and groups.'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <label htmlFor="canvas-share-pick" className="text-sm font-medium text-foreground">Share with</label>
                  <div className="flex items-center gap-2">
                    <select
                      id="canvas-share-pick"
                      value={pick}
                      onChange={e => setPick(e.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base md:text-sm"
                      data-testid="canvas-share-pick"
                    >
                      <option value="">Choose an event or group</option>
                      {(['Events', 'Groups'] as const).map(group => {
                        const options = addable.filter(a => a.group === group);
                        return options.length > 0 && (
                          <optgroup key={group} label={group}>
                            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                    {pick && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const [kind, id] = pick.split(':') as ['event' | 'group', string];
                          void change(() => canvasService.shareCanvas(name, kind, id), 'Could not share. Nothing changed.');
                        }}
                        className="min-h-10 bg-blue-600 text-white hover:bg-blue-700/90"
                        data-testid="canvas-share-add"
                      >
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {error && <p role="alert" className="text-sm text-red-600" data-testid="canvas-share-error">{error}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
