/** P1536: types shared by the canvas draft engine's modules. */

export interface CopyInput { label: string; lines: Array<{ by: 'owner' | 'other'; text: string }> }
/** The message that started this run: always carried whole, outside the material cap (a message is never cut away to fit older material). */
export interface TriggerInput { text: string; tagged?: string[] | null }
export interface MaterialInput {
  note?: string | null;
  trigger?: TriggerInput | null;
  /** The owner's own messages in the draft's thread, oldest first. */
  messages?: string[];
  /** Copies of other chats (Clarify): the owner's lines are owner words, everyone else's are not. */
  copies?: CopyInput[];
  links: Array<{ url: string; text: string }>;
  files: Array<{ name: string; text: string }>;
}
/** `owner` is true for text a quote may come from. */
export interface MaterialItem {
  kind: 'note' | 'link' | 'file' | 'other_person'; source: string; text: string; owner: boolean;
  /** The trigger message: the boxes the owner tagged it with (null when untagged). */
  trigger?: boolean;
  tagged?: string[] | null;
}
export interface Material { items: MaterialItem[]; tokens: number; truncated: boolean }

export interface BasePoint { id: string; box: string; statement: string; story?: string | null; is_head?: boolean }
/** A point the draft holds now (from `_canvas_draft_run_begin`). `reused` points are also current points. */
export interface DraftPoint {
  id: string; box: string; statement: string; story?: string | null; reused?: boolean;
  /** The base point an earlier run reworded or moved into this one (the recorded link), and which of the two. */
  from_point_id?: string | null;
  relation?: 'reword' | 'move' | null;
}
/** What one run is: its kind, the boxes the owner tagged, the focus now, a focus run's target, and the boxes it rebuilds. */
export interface RunFrame {
  kind: 'message' | 'focus' | 'fork_first';
  firstDraft: boolean;
  taggedBoxes: readonly string[] | null;
  focus: string | null;
  targetGroup: string | null;
  rebuild: readonly string[];
  /** The groups the canvas already has as offers (the focus itself is `focus`). */
  knownGroups?: readonly KnownGroup[];
  /** How the message arrived: an upload is read as what the owner is telling the agent, never as "no request". */
  inputKind?: 'text' | 'file' | 'voice';
}
/** A group the canvas already has (its focus or an offer), so a run says it in the same words and never adds it twice. */
export interface KnownGroup { group: string; state: string }
export interface DraftContext {
  frame?: RunFrame;
  material: Material;
  basePoints: BasePoint[];
  /** What the draft holds now: shown to a revision as context only (no ids to act on). */
  draftPoints?: DraftPoint[];
  baseLabel: string | null;
}

type FailureCode = 'blocked' | 'empty' | 'unparsable';
export type Failure = { ok: false; code: FailureCode; costUsd: number | null };

/**
 * What the write function applies. Reword and move name the OLD point; the write decides whether it may link.
 * A draft writes points only: `story` is always null, which the write reads as "create no story" (a moved point's
 * private stories still follow it, in the write).
 */
export type ResolvedAction =
  | { action: 'keep'; point_id: string }
  | { action: 'reword'; old_point_id: string; box: string; statement: string; story: null }
  | { action: 'move'; old_point_id: string; box: string; statement: string; story: null }
  | { action: 'new'; box: string; statement: string; story: null };

export interface OtherCanvas { group: string; why: string }
/** Why a first draft chose its group: the focus order of D9, as the model reports it. The engine turns each into fixed words. */
export const FOCUS_REASONS = ['stated', 'paid', 'most_boxes', 'narrower'] as const;
export type FocusReason = (typeof FOCUS_REASONS)[number];
export interface Decided { kind: 'conflict' | 'link' | 'drop'; text: string }
export interface DraftCounts { kept: number; reworded: number; moved: number; added: number; dropped: number }

export type DraftOutcome =
  | {
    ok: true; actions: ResolvedAction[]; decided: Decided[]; counts: DraftCounts; total: number;
    emptyBoxes: string[]; droppedUnverified: number; droppedNames: number; costUsd: number | null;
    /** The boxes this run may change (fixed by the run's kind or tags, else the model's own, validated). */
    scope: string[];
    /** Boxes at least one action wrote to or removed from: the "Updated:" chips. */
    changedBoxes: string[];
    /** Actions, moves and questions outside the scope: dropped, and counted. */
    droppedScope: number;
    /** New or moved points refused because their box was full once the points that stay were counted. */
    droppedCap: number;
    /** The business the canvas is about, after the names filter; null when absent or refused. */
    focus: string | null;
    /** Why the focus was chosen (a first draft only); null when absent or not one of the four. */
    focusReason: FocusReason | null;
    otherCanvases: OtherCanvas[];
    /** { box tag: question } for scoped boxes only. */
    questions: Record<string, string>;
    note: string;
  }
  | Failure;

export interface ParseContext {
  material: Material;
  basePoints: BasePoint[];
  baseLabel: string | null;
  otherNames: readonly string[];
  /** The draft so far: its numbers are the owner's already (an earlier run vetted them). */
  draftPoints?: DraftPoint[];
  /** The owner's own name: never learned as another person from a file or a link. */
  ownerName?: string | null;
  /** The run's scope: fixed boxes, or the model's own `scope` (an untagged message). */
  scope?: { mode: 'fixed'; boxes: readonly string[] } | { mode: 'model' };
  /** The focus the canvas has now. */
  currentFocus?: string | null;
  /** True only for a run that may set the focus (the first draft); every other run's own `focus` is ignored. Default true. */
  acceptFocus?: boolean;
  /** Boxes that are rebuilt (a focus run's customer-facing boxes): their current points are never kept. */
  rebuild?: readonly string[];
  /** Groups the canvas already holds (offers, in any state): a model group matching one is not an offer again. */
  knownGroups?: readonly string[];
  /** False for a focus run: the database records the old focus as an offer itself, so the run lists none. Default true. */
  listOffers?: boolean;
  /** True for an upload (J9, decided 2026-11-03): its offers are read, and sent to the write, even when the run's scope is empty. Typed and spoken input keep the rule. */
  offersOnEmptyScope?: boolean;
}
