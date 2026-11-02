/**
 * @file canvas-header-model.ts
 * @description P1536 3c X4: THE header table, as one pure function. "The main action is the furthest-right button, filled blue": Publish on a draft, Share
 * on a published version. Given what the owner's bar is showing, `headerRow` returns the whole row: the tag beside the name, whether the version picker
 * is there, the secondary items left to right, and what sits in the spot (the last item, the only filled one). The bar (canvas-owner-bar) and the
 * reader's header read it and decide nothing of their own; src/tests/p1536-x4-header-model.test.ts holds the table. Where two rows fit, the more
 * specific wins: "At the cap, nothing to publish" overrides the no-points and no-difference rows, because Start over (in the composer) replaces Discard.
 */
import { isViewingDraft, type CanvasReady } from './canvas-page-data';
import { REVISION_CAP_RUNS } from '@/app/pages/chat/canvas-thread-copy';

/** The one label of the way back to the open draft: the header's item on a phone (X13) and the thread panel's line say it the same. */
export const GO_TO_DRAFT_LABEL = 'Go to draft';

/** The secondary items left of the spot: the one named secondary pill (clone, thread, go-to-draft), rule 3 ghost (cancel) or rule 5 red text (discard). */
export type HeaderItem = 'clone' | 'thread' | 'go-to-draft' | 'cancel' | 'discard';
/** What sits in the spot: Share and Publish are the filled main action; a status says why there is none; none draws no spot at all. */
export type HeaderSpotKind = 'share' | 'publish' | 'status' | 'none';

export interface HeaderInput {
  /** The viewer owns this canvas (false: a reader or a signed-out visitor, who gets the reader header). */
  owner: boolean;
  /** Canvas drafting is on for this owner. */
  drafting: boolean;
  /** What is on screen: a published version, the open draft, or a pending Clone (nothing written yet). */
  onScreen: 'published' | 'draft' | 'pending';
  /** At least one version is published. */
  hasPublished: boolean;
  /** The draft on screen was started from a published version. */
  hasBase: boolean;
  /** The workspace is on (`ws=1`). */
  workspace: boolean;
  /** The owner has a draft open on this canvas (on screen or not). */
  draftOpen: boolean;
  /** The spot's own answer (publishSpotState): Publish can run, there is nothing to publish, a run is going, or the read is not in. */
  spot: 'loading' | 'updating' | 'publish' | 'nothing';
  /** A run or a Publish is going on this draft (or a pending Clone's first Send). */
  busy: boolean;
  /** The draft is at its update cap. */
  atCap: boolean;
  /** The Thread button would show: the workspace is on and the panel is closed (the bar itself shows it from 1280px only). */
  threadButton: boolean;
  /** A phone's second row adds Go to draft (X13). */
  goToDraft: boolean;
}

export interface HeaderRow {
  tag: 'draft' | 'new-draft' | null;
  picker: boolean;
  /** left to right, before the spot */
  items: HeaderItem[];
  spot: HeaderSpotKind;
  /** the one filled item, if any: always the spot */
  filled: 'share' | 'publish' | null;
}

export function headerRow(i: HeaderInput): HeaderRow {
  // A reader: published versions only (a picker once there is one), and nothing filled.
  if (!i.owner) return { tag: null, picker: i.hasPublished, items: [], spot: 'none', filled: null };

  if (i.onScreen === 'published') {
    // In the workspace a published view is a version picked from an open draft, or the moment after a Clone's first Send, when the address has moved to the
    // new draft and the last read is still the old published one (no draft in it yet): either way the owner is editing.
    const editing = i.drafting && i.workspace;
    const items: HeaderItem[] = [];
    if (editing) {
      if (i.threadButton) items.push('thread');
      if (i.goToDraft) items.push('go-to-draft');
    } else if (i.drafting) items.push('clone');
    // "Only Updating… and Publishing… replace the main action": the draft the owner is editing is being written (the first Send of a Clone moves the page from
    // the published view to its draft a moment later, while the page reads again), so the status (or the reading skeleton) holds the spot rather than flashing Share in between.
    if (editing && (i.busy || i.spot === 'loading')) return { tag: null, picker: true, items, spot: 'status', filled: null };
    return { tag: null, picker: true, items, spot: 'share', filled: 'share' };
  }

  const draftTag = i.onScreen === 'pending' ? 'new-draft' : 'draft';
  // Drafting off: a draft is only named (and its version beside it), with nothing to do.
  if (!i.drafting) return { tag: 'draft', picker: i.hasBase, items: [], spot: 'none', filled: null };

  const thread: HeaderItem[] = i.threadButton ? ['thread'] : [];
  // A pending Clone has no number or picker until its first Send creates the draft; Cancel is what leaves it (not while that Send is in flight).
  if (i.onScreen === 'pending') {
    return { tag: draftTag, picker: false, items: i.busy ? thread : [...thread, 'cancel'], spot: 'status', filled: null };
  }
  const picker = i.hasBase;
  // Updating or Publishing: no Discard (the RPC refuses busy), the status in the spot.
  if (i.busy) return { tag: draftTag, picker, items: thread, spot: 'status', filled: null };
  if (i.spot === 'publish') return { tag: draftTag, picker, items: [...thread, 'discard'], spot: 'publish', filled: 'publish' };
  // Nothing to publish. At the cap Start over replaces Discard and lives in the composer only (the more specific row wins).
  return { tag: draftTag, picker, items: i.atCap ? thread : [...thread, 'discard'], spot: 'status', filled: null };
}

/** The input the owner's bar hands `headerRow`, from the page's read and the workspace's flags. Pure, so the rows can be built without a page. */
export function headerInputOf(args: {
  ready: CanvasReady;
  drafting: boolean;
  workspace: boolean;
  /** the number of the version a Clone is pending on (null: none) */
  pendingSeq: number | null;
  spot: HeaderInput['spot'];
  publishing: boolean;
  threadButton: boolean;
  goToDraft: boolean;
}): HeaderInput {
  const { ready, pendingSeq } = args;
  const onScreen = pendingSeq !== null ? 'pending' : isViewingDraft(ready) ? 'draft' : 'published';
  const draft = ready.draft;
  return {
    owner: ready.isOwner,
    drafting: args.drafting,
    onScreen,
    hasPublished: ready.versions.some(v => !v.draft && v.seq !== null),
    hasBase: onScreen === 'draft' && !!draft && draft.baseSeq !== null,
    workspace: args.workspace,
    draftOpen: !!draft,
    spot: args.spot,
    busy: args.publishing || args.spot === 'updating',
    atCap: onScreen === 'draft' && !!draft && draft.runCount >= REVISION_CAP_RUNS,
    threadButton: args.threadButton,
    goToDraft: args.goToDraft,
  };
}
