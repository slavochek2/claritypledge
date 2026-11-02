/**
 * @file canvas-owner-bar.tsx
 * @description P1536 W8, 3c X4/X5/X6/X13: the owner's ONE canvas header, for a draft, a pending Clone and a published version alike. The whole row is
 * decided by `headerRow` (canvas-header-model, the spec's table): this component only draws what it says. From 1280px, one line:
 * ← · name ✎ · [vN ▾] · (Draft) · secondary items · the spot. The spot is the furthest-right control and the only filled one: Share on a published
 * version, Publish on a draft, otherwise a status ("Nothing to publish yet", "Updating…"), all in one fixed box so nothing beside it moves.
 * Below 1280px, row 1: ← · name ✎ (it shrinks first) · [vN ▾] · (Draft); row 2: the Canvas | Thread switcher (workspace only), then the items and the
 * spot, right-aligned and labelled down to 320. No "Published" word (X5: a version with no Draft tag is published), no "from vN", no Share on a draft.
 * Sticky under the shell's top bar. Inside the workspace box it is the box's first child (the panes take the rest); on a published view
 * with nothing being edited it sits above the page. Anyone but the owner gets the reader header (canvas-header) instead; this bar is
 * not drawn for them. Pure layout over the page's read: the real canvas and chat are not its business, so the P955 gate fixture renders it too.
 */
import type { ReactNode } from 'react';
import { useCanvasDraftsOff } from '@/app/pages/chat/use-canvas-availability';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { cn } from '@/lib/utils';
import { BarActions, BarRow1, ViewSwitch } from './canvas-bar-parts';
import { headerInputOf, headerRow } from './canvas-header-model';
import type { CanvasReady } from './canvas-page-data';
import type { PublishSpotState } from './canvas-publish-spot-state';
import { CANVAS_WORKSPACE_WIDE_QUERY, useCanvasWorkspace } from './canvas-workspace-context';
import { STICKY_TOP, type WorkspaceView } from './canvas-workspace-layout';

/** The bar is two rows below 1280px (the second holds the switcher, the items and the spot) and one line from it. */
const BAR = 'z-30 flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b bg-background px-2 py-1 sm:px-3 xl:flex-nowrap';

/** The table's row for what the bar shows (null while the page is still reading), with the width and drafting facts it needs. */
function useBarRow(args: { ready: CanvasReady | null; active: boolean; panelOpen: boolean; canOpenPanel: boolean; canGoToDraft: boolean; spotState: PublishSpotState; publishing: boolean }) {
  const { ready, active, panelOpen, canOpenPanel, canGoToDraft, spotState, publishing } = args;
  const { cloneSeq, cloning } = useCanvasWorkspace();
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  const drafting = !useCanvasDraftsOff();
  if (!ready) return null;
  return headerRow(headerInputOf({
    ready, drafting, workspace: active, pendingSeq: cloneSeq, cloning, spot: spotState.kind, publishing,
    threadButton: active && wide && !panelOpen && canOpenPanel, goToDraft: active && !wide && canGoToDraft,
  }));
}

export function CanvasOwnerBar({ ready, handle, projectTag, title, canRename, onRename, onPick, onChanged, onBack, active, view, onView, panelOpen = true, onOpenPanel, spotState, publishing = false, onPublish, discard, cancel, onGoToDraft }: {
  /** null while the page is reading */
  ready: CanvasReady | null;
  handle: string | undefined;
  projectTag: string | null;
  /** The name shown (the owner's rename, else the name's canvasTitle) */
  title: string;
  canRename: boolean;
  onRename: (next: string) => void;
  /** a version was picked in the menu */
  onPick: (version: string) => void;
  /** a share, unshare or access change was confirmed: read the canvas again */
  onChanged: () => void;
  onBack: () => void;
  /** The workspace (`?ws=1`) is on: the switcher below 1280px and the Thread button from it exist. */
  active: boolean;
  view: WorkspaceView;
  onView: (v: WorkspaceView) => void;
  /** From 1280px: the thread panel is open. While it is closed the bar offers the Thread button. */
  panelOpen?: boolean;
  onOpenPanel?: () => void;
  /** The Publish spot's answer (publishSpotState) and whether a Publish is in flight; `onPublish` is what its button does. */
  spotState: PublishSpotState;
  publishing?: boolean;
  onPublish: () => void;
  /** Discard (rule 5) and Cancel (rule 3), drawn where the table puts them. The route hands them over; they are nodes because they own a confirm and a navigation. */
  discard?: ReactNode;
  cancel?: ReactNode;
  /** A published version picked from a draft, on a phone: Go to draft before Share (X13). */
  onGoToDraft?: () => void;
}) {
  const row = useBarRow({ ready, active, panelOpen, canOpenPanel: !!onOpenPanel, canGoToDraft: !!onGoToDraft, spotState, publishing });
  // X13: an owner with drafting off (nothing but the spot to show: `← · name ✎ · [vN ▾] · Share`) is ONE row; any item, or the workspace's switcher, makes a second.
  // While the page is still reading nothing is known, so the second row's room is kept (most owners have one): the bar does not grow when the read lands.
  const oneRow = !!row && row.items.length === 0 && !active;
  const actions = (
    <BarActions
      oneRow={oneRow} row={row} ready={ready} slots={{ onOpenPanel, onGoToDraft, cancel, discard }}
      handle={handle} projectTag={projectTag} title={title} onChanged={onChanged} spotState={spotState} publishing={publishing} onPublish={onPublish}
    />
  );
  return (
    <div className={cn(BAR, !active && STICKY_TOP)} data-testid="workspace-bar" data-owner-bar="">
      <BarRow1 ready={ready} row={row} title={title} canRename={canRename} onRename={onRename} onPick={onPick} onBack={onBack}>{oneRow && actions}</BarRow1>
      {!oneRow && (
        <>
          {active && <ViewSwitch view={view} onView={onView} />}
          {actions}
        </>
      )}
    </div>
  );
}
