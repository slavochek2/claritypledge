/**
 * @file dictation-text.ts
 * @description P1576: where dictated text lands in a draft. Pure, so the hook, the Composer and the
 * "chat I have since left" path all merge the same way.
 */

/** The composer's message cap (the textarea's `maxLength`, which a programmatic insert bypasses). */
export const DICTATION_BODY_MAX = 4000;

export interface MergedDictation {
  value: string;
  /** Just after the inserted text (or where it would have gone). */
  caret: number;
  /** False when the text would pass `max`: nothing was inserted and `value` is the draft unchanged. */
  fits: boolean;
}

/**
 * Inserts `text` into `draft` at `caret`, adding a space on a side only when the neighbouring
 * character is not already whitespace. A stale caret is clamped.
 *
 * Never cuts the dictated words. If the result would pass the message cap the draft is returned
 * unchanged with `fits: false`, so the caller can tell the person and keep the words for a retry.
 */
export function mergeDictation(draft: string, text: string, caret: number, max = DICTATION_BODY_MAX): MergedDictation {
  const said = text.trim();
  const at = Math.max(0, Math.min(Number.isFinite(caret) ? caret : draft.length, draft.length));
  if (!said) return { value: draft, caret: at, fits: true };

  const before = draft.slice(0, at);
  const after = draft.slice(at);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^\s/.test(after) ? ' ' : '';
  const value = before + lead + said + trail + after;
  if (value.length > max) return { value: draft, caret: at, fits: false };
  return { value, caret: before.length + lead.length + said.length, fits: true };
}
