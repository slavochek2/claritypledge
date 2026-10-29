/** P1536: types shared by the canvas draft engine's modules. */

export interface CopyInput { label: string; lines: Array<{ by: 'owner' | 'other'; text: string }> }
export interface MaterialInput {
  note?: string | null;
  /** The owner's own messages in the draft's thread, oldest first. */
  messages?: string[];
  /** Copies of other chats (Clarify): the owner's lines are owner words, everyone else's are not. */
  copies?: CopyInput[];
  links: Array<{ url: string; text: string }>;
  files: Array<{ name: string; text: string }>;
}
/** `owner` is true for text a quote may come from. */
export interface MaterialItem { kind: 'note' | 'link' | 'file' | 'other_person'; source: string; text: string; owner: boolean }
export interface Material { items: MaterialItem[]; tokens: number; truncated: boolean }

export interface BasePoint { id: string; box: string; statement: string; story?: string | null; is_head?: boolean }
/** A point the draft holds now (from `_canvas_draft_run_begin`). `reused` points are also current points. */
export interface DraftPoint {
  id: string; box: string; statement: string; story?: string | null; reused?: boolean;
  /** The base point an earlier run reworded or moved into this one (the recorded link), and which of the two. */
  from_point_id?: string | null;
  relation?: 'reword' | 'move' | null;
}
export interface DraftContext {
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

export interface Decided { kind: 'conflict' | 'link' | 'drop'; text: string }
export interface DraftCounts { kept: number; reworded: number; moved: number; added: number; dropped: number }

export type DraftOutcome =
  | {
    ok: true; actions: ResolvedAction[]; decided: Decided[]; counts: DraftCounts; total: number;
    emptyBoxes: string[]; droppedUnverified: number; droppedNames: number; costUsd: number | null;
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
}
