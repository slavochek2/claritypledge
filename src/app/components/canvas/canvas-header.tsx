/**
 * @file canvas-header.tsx
 * @description The canvas page's header (R10, P1515, P1545, P1536): the canvas's own name as the title under a small "Clarity
 * Canvas" label, then the byline (whose it is and which version: a menu with several, a lone draft says "v1 · Draft"), then, on
 * a row of their own, Compare and Share (or New version), and under them the one line that says what the viewer is looking at: a
 * reader's "Shared with you through ...", or "Nothing published yet". The byline holds no buttons, so a long name never competes with
 * one (S3.6). A draft has no Compare and no Share (it cannot be shared, and it has no positions); its Publish lives in the
 * workspace bar (canvas-publish-spot), not here.
 */
import { Link } from 'react-router-dom';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import type { Person } from '@/app/components/compare/statement-row';
import { canvasPath, canvasTitle } from '@/lib/canvas-boxes';
import { CanvasOwnerSkeleton } from '@/app/pages/canvas-page-placeholders';
import { CanvasShareControl } from './canvas-share-control';
import { SharedIcon } from './canvas-audience';
import { ComparePicker } from './canvas-compare-picker';
import { NewVersionButton } from './canvas-new-version-button';
import { VersionSwitcher } from './canvas-version-switcher';
import { isViewingDraft, openVersionLabel, type CanvasPerson, type CanvasReady } from './canvas-page-data';

interface CanvasHeaderProps {
  /** null while loading */
  ready: CanvasReady | null;
  failed: boolean;
  handle: string | undefined;
  projectTag: string | null;
  ownerIsAgent: boolean;
  identityPending: boolean;
  compare: { base: Person | null; others: CanvasPerson[]; withPerson: CanvasPerson | null };
  sharedLabel: string | null;
  /** changes the address's query (`v`, `with`, `point`, `box`); `push` and `panel` as the page's own */
  onParams: (changes: Record<string, string | null>, push?: boolean, panel?: boolean) => void;
  /** a share, unshare or access change was confirmed: read the canvas again */
  onChanged: () => void;
}

export function CanvasHeader(props: CanvasHeaderProps) {
  const { ready, failed, handle, projectTag, ownerIsAgent, identityPending, compare, sharedLabel, onParams, onChanged } = props;
  const viewingDraft = !!ready && isViewingDraft(ready);
  return (
    <header className="mb-4 flex flex-col gap-2" data-testid="canvas-header-row">
      {/* P1545: the canvas's own name is the title; "Clarity Canvas" is the small label above it. */}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid="canvas-eyebrow">Clarity Canvas</p>
        <h1 className="break-words text-3xl font-bold text-foreground md:text-4xl" data-testid="canvas-title">{projectTag ? canvasTitle(projectTag) : 'Clarity Canvas'}</h1>
      </div>
      {/* Founder, sixth round: Compare sits right after the canvas name, so the line reads
          "by <owner> · <canvas> · Compare with someone…", not across the page. */}
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-2 text-base md:text-lg" data-testid="canvas-byline">
          {ready ? (
            // ml-1 on the photo: the pledge ring draws outside it; keep it inside the gutter.
            // Phones (P1545): with no version menu the line fills the row, so the share circle sits beside it.
            <span className="ml-1 flex min-w-0 max-w-full items-center gap-2.5" data-testid="canvas-owner">
              <GravatarAvatar
                name={ready.owner.name}
                photoUrl={ready.owner.photoUrl}
                avatarColor={ready.owner.avatarColor}
                isPledger={ready.owner.hasPledged}
                isAgent={ownerIsAgent}
                identityPending={identityPending}
                size="sm"
              />
              {/* S3.6: a name wraps between words only (break-normal), never inside one. */}
              <span className="min-w-0 break-normal text-foreground sm:truncate">
                by{' '}
                <Link
                  to={`/p/${handle}`}
                  className="rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  data-testid="canvas-owner-name"
                >
                  {ready.ownerName}
                </Link>
              </span>
            </span>
          ) : (
            !failed && <CanvasOwnerSkeleton />
          )}
          {ready && <VersionSlot ready={ready} viewingDraft={viewingDraft} onPick={v => onParams({ v, point: null, box: null }, true, false)} />}
        </div>
        {/* P1515: Share sits immediately right of Compare, in a row of its own under the byline. */}
        {ready && !isViewingDraft(ready) && (
          <CanvasHeaderActions
            ready={ready}
            handle={handle}
            projectTag={projectTag}
            compare={compare}
            onCompare={id => onParams({ with: id })}
            onChanged={onChanged}
          />
        )}
      </div>
      {ready && <CanvasStatusLines ready={ready} sharedLabel={sharedLabel} viewingDraft={viewingDraft} />}
    </header>
  );
}

/**
 * The actions row of a published version: Compare, Share (owner), New version (owner). A draft has none of them.
 */
function CanvasHeaderActions({ ready, handle, projectTag, compare, onCompare, onChanged }: {
  ready: CanvasReady;
  handle: string | undefined;
  projectTag: string | null;
  compare: CanvasHeaderProps['compare'];
  onCompare: (personId: string | null) => void;
  onChanged: () => void;
}) {
  const ownerCanShare = ready.isOwner && !ready.publishedNone;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2" data-testid="canvas-actions">
      <ComparePicker base={compare.base} others={compare.others} withPerson={compare.withPerson} onCompare={onCompare} />
      {projectTag && ownerCanShare && (
        <CanvasShareControl
          name={projectTag}
          visibility={ready.visibility}
          generalAccess={ready.generalAccess}
          link={`${window.location.origin}${canvasPath(handle ?? '', projectTag)}`}
          entries={ready.audience}
          onChanged={onChanged}
        />
      )}
      {ownerCanShare && <NewVersionButton version={ready.version} />}
    </div>
  );
}

/** Which version: the menu when the canvas has several; a lone draft says "v1 · Draft" (its number); a lone published version needs no label
 *  (the title above is the canvas). Founder, 2026-10-27: one fact once, no repeated text. */
function VersionSlot({ ready, viewingDraft, onPick }: { ready: CanvasReady; viewingDraft: boolean; onPick: (version: string) => void }) {
  if (ready.versions.length < 2 && !viewingDraft) return null;
  return (
    // A lone "Draft" label keeps its own width on a phone, so the owner's name gets the rest of the row; the version menu shares it.
    <span className="flex min-w-0 max-w-full items-center gap-2 max-sm:flex-none" data-testid="canvas-project-slot">
      <span aria-hidden className="hidden shrink-0 text-foreground/40 sm:inline">·</span>
      {ready.versions.length >= 2
        ? <VersionSwitcher versions={ready.versions} open={ready.version ?? ready.versions[0]?.name ?? ''} onPick={onPick} />
        : <span className="shrink-0 text-sm font-medium text-foreground/70" data-testid="canvas-version-label">{openVersionLabel(ready) ?? 'Draft'}</span>}
    </span>
  );
}

/** A reader of an unpublished canvas, shared by the owner as a person: the "nothing published" line already names them. */
function personSharedNothing(ready: CanvasReady): boolean {
  return ready.publishedNone && !isViewingDraft(ready) && ready.via?.kind === 'person';
}

/** The lines under the title row: how the viewer reaches this canvas, a draft with nothing in it, or why the canvas is empty. */
function CanvasStatusLines({ ready, sharedLabel, viewingDraft }: {
  ready: CanvasReady;
  sharedLabel: string | null;
  viewingDraft: boolean;
}) {
  return (
    <>
      {/* P1515: a reader's one line (the owner's Share button is in the title row above). */}
      {!ready.isOwner && (ready.via || ready.generalAccess === 'link') && !personSharedNothing(ready) && (
        <p className="flex min-w-0 items-center gap-2 text-sm text-foreground/80" data-testid="canvas-shared-with-you">
          <SharedIcon label={sharedLabel ?? 'Shared with you'} />
          <span className="min-w-0">
            {ready.via ? (
              <>
                {ready.via.kind === 'person' ? 'Shared with you by' : 'Shared with you through'}{' '}
                {ready.via.kind === 'event' && ready.via.slug ? (
                  <Link to={`/events/${ready.via.slug}`} className="rounded-sm font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" data-testid="canvas-shared-via">
                    {ready.via.name}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground" data-testid="canvas-shared-via">{ready.via.name}</span>
                )}
              </>
            ) : (
              <span data-testid="canvas-shared-link">Anyone with the link can see this canvas</span>
            )}
          </span>
        </p>
      )}
      {viewingDraft && ready.points.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="canvas-draft-empty">Nothing is drafted yet.</p>
      )}
      {ready.publishedNone && !viewingDraft && (
        <p className="text-sm text-muted-foreground" data-testid="canvas-nothing-published">
          {ready.isOwner ? 'Nothing published yet' : `${ready.ownerName} hasn't published this canvas yet.`}
        </p>
      )}
      {!ready.publishedNone && ready.points.length === 0 && (
        // The owner of a canvas that has a record but no current points: the share control above still works.
        <p className="text-sm text-muted-foreground" data-testid="canvas-empty-owner">
          This canvas has no points yet. You can still change who has access above.
        </p>
      )}
    </>
  );
}
