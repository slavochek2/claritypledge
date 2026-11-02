/**
 * @file workspace-owner-bar.tsx
 * @description P1536 W8, 3c X4: the route's owner bar (canvas-owner-bar) with what only the route can give it: Discard (rule 5, behind its confirm and its navigation), Cancel for a
 * pending Clone (rule 3) and the way to the open draft. The table that decides which of them draw is canvas-header-model; this only supplies the pieces.
 */
import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CANVAS_CANCEL_TEXT } from '@/app/components/canvas/canvas-pill-styles';
import type { PublishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { useAuth } from '@/auth';
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
      cancel={<button type="button" className={CANVAS_CANCEL_TEXT} onClick={onCancelClone} data-testid="canvas-cancel-clone">Cancel</button>}
      onGoToDraft={draft ? () => onGoToDraft(draft.version) : undefined}
    />
  );
}
