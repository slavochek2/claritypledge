/**
 * @file canvas-header.tsx
 * @description The canvas page's own header (R10, P1515, P1545, P1536). For a READER (and any page mounted outside the owner's route): the canvas's
 * name as the title, then the byline (whose it is and which version: a menu with several), then, on a row of their own, Compare, and under them the one
 * line that says what the viewer is looking at: a reader's "Shared with you through ...", or "Nothing published yet". The byline holds no buttons, so a
 * long name never competes with one (S3.6). There is no "Clarity Canvas" label (W8). A reader sees published versions only and no Draft state.
 * For the OWNER, inside the route element (W8): the name, version, state, Share and Clone live in the owner's bar (canvas-owner-bar), drawn above
 * the page; this header then keeps only Compare and the status lines. A draft has no Compare (it has no positions); its Publish lives in the bar's spot.
 */
import { Link } from 'react-router-dom';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import type { Person } from '@/app/components/compare/statement-row';
import { canvasDisplayTitle, canvasPath } from '@/lib/canvas-boxes';
import { CanvasOwnerSkeleton } from '@/app/pages/canvas-page-placeholders';
import { CanvasShareControl } from './canvas-share-control';
import { SharedIcon } from './canvas-audience';
import { ComparePicker } from './canvas-compare-picker';
import { CloneButton } from './canvas-clone-button';
import { useCanvasWorkspace } from './canvas-workspace-context';
import { CanvasStateTag } from './canvas-state-tag';
import { CanvasVersionSlot } from './canvas-version-switcher';
import { isViewingDraft, type CanvasPerson, type CanvasReady } from './canvas-page-data';

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
  const { cloneSeq, ownerBar } = useCanvasWorkspace();
  const actions = ready && !viewingDraft && (
    <CanvasHeaderActions ready={ready} handle={handle} projectTag={projectTag} compare={compare} ownerBar={ownerBar} onCompare={id => onParams({ with: id })} onChanged={onChanged} />
  );
  return (
    <header className="mb-4 flex flex-col gap-2 empty:hidden" data-testid="canvas-header-row">
      {!ownerBar && (
        <div className="flex flex-col gap-3">
          <h1 className="break-words text-3xl font-bold text-foreground md:text-4xl" data-testid="canvas-title">{projectTag ? canvasDisplayTitle(ready?.title, projectTag) : 'Canvas'}</h1>
          {/* Founder, sixth round: Compare sits right after the canvas name, so the line reads "by <owner> · <canvas> · Compare with someone…", not across the page. */}
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-2 text-base md:text-lg" data-testid="canvas-byline">
            {ready ? (
              <CanvasByline ready={ready} handle={handle} ownerIsAgent={ownerIsAgent} identityPending={identityPending} />
            ) : (
              !failed && <CanvasOwnerSkeleton />
            )}
            {ready && <CanvasVersionSlot ready={ready} viewingDraft={viewingDraft} onPick={v => onParams({ v, point: null, box: null }, true, false)} />}
            {/* W4: Draft or Published is always named next to the version; a pending Clone (W3) names what it will make. */}
            {ready && <CanvasStateTag ready={ready} cloneSeq={cloneSeq} />}
          </div>
          {/* P1515: Share sits immediately right of Compare, in a row of its own under the byline. */}
          {actions}
        </div>
      )}
      {ownerBar && actions}
      {ready && <CanvasStatusLines ready={ready} sharedLabel={sharedLabel} viewingDraft={viewingDraft} />}
    </header>
  );
}

/** "by <owner>" with the photo. */
function CanvasByline({ ready, handle, ownerIsAgent, identityPending }: { ready: CanvasReady; handle: string | undefined; ownerIsAgent: boolean; identityPending: boolean }) {
  return (
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
  );
}

/**
 * The actions row of a published version: Compare, and (outside the owner's route only) Share and Clone for the owner; inside it Share and Clone
 * are in the owner's bar. A draft has none of them.
 */
function CanvasHeaderActions({ ready, handle, projectTag, compare, ownerBar, onCompare, onChanged }: {
  ready: CanvasReady;
  handle: string | undefined;
  projectTag: string | null;
  compare: CanvasHeaderProps['compare'];
  ownerBar: boolean;
  onCompare: (personId: string | null) => void;
  onChanged: () => void;
}) {
  const ownerCanShare = ready.isOwner && !ready.publishedNone && !ownerBar;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 empty:hidden" data-testid="canvas-actions">
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
      {ownerCanShare && <CloneButton ready={ready} />}
    </div>
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
