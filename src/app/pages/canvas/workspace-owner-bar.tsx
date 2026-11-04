/**
 * @file workspace-owner-bar.tsx
 * @description P1536 W8, 3c X4: the route's owner bar (canvas-owner-bar) with what only the route can give it: Discard (rule 5, behind its confirm and its navigation), Cancel for a
 * pending Clone (rule 3) and the way to the open draft. The table that decides which of them draw is canvas-header-model; this only supplies the pieces.
 */
import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import type { PublishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { useAuth } from '@/auth';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useCompareSetup } from './canvas-page-read';
import { DiscardDraftButton } from './discard-draft-button';

export function WorkspaceOwnerBar(props: {
  ready: CanvasReady | null;
  handle: string | undefined;
  projectTag: string | null;
  rename: { title: string; canRename: boolean; save: (next: string) => void };
  onPick: (version: string) => void;
  onChanged: () => void;
  onBack: () => void;
  active: boolean;
  view: WorkspaceView;
  onView: (v: WorkspaceView) => void;
  panelOpen: boolean;
  onOpenPanel: () => void;
  spot: { state: PublishSpotState; publishing: boolean; onPublish: () => void };
  onCancelClone: () => void;
  /** shows the open draft's version (the Canvas tab) */
  onGoToDraft: (versionName: string) => void;
}) {
  const { user } = useAuth();
  const { ready, projectTag, rename, spot, onCancelClone, onGoToDraft, ...rest } = props;
  const draft = ready?.draft ?? null;
  // P1613: Compare beside the version. The same setup the page reads (so the bar and the boxes agree on what compares), and picking someone writes `with` like the page did.
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = useLocation();
  const { basePerson, others, withPerson } = useCompareSetup(ready, user?.id, props.handle, searchParams.get('with'));
  const onCompare = (id: string | null) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (id) next.set('with', id); else next.delete('with');
    return next;
  }, { replace: true, state });
  return (
    <CanvasOwnerBar
      {...rest}
      ready={ready}
      projectTag={projectTag}
      title={rename.title}
      canRename={rename.canRename}
      onRename={rename.save}
      spotState={spot.state}
      publishing={spot.publishing}
      onPublish={spot.onPublish}
      discard={ready && draft && user?.slug && projectTag ? <DiscardDraftButton ready={ready} ownerSlug={user.slug} canvasName={projectTag} /> : null}
      compare={{ base: ready ? basePerson : null, others, withPerson, onCompare }}
      cancel={<button type="button" className={CANVAS_SECONDARY_PILL} onClick={onCancelClone} data-testid="canvas-cancel-clone">Cancel</button>}
      onGoToDraft={draft ? () => onGoToDraft(draft.version) : undefined}
    />
  );
}
