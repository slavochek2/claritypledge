/**
 * @file lead-toggle.ts
 * @description P898: Pure helpers for the per-point "lead" toggle on doc point rows.
 *
 * The toggle is UI sugar over (order, lead_count) — `order` remains the single
 * source of truth for sequence (P837), `lead_count` only marks where the
 * pre/post-story split falls among VISIBLE points:
 * - Marking a point as lead moves it to the END of the lead group in `order`
 *   (relative order of other points preserved) and increments `lead_count`.
 * - Unmarking moves it to the FRONT of the post group and decrements `lead_count`.
 *
 * `order` may interleave hidden point ids (doc-detail's move arrows write the
 * full list). The lead boundary is therefore expressed in VISIBLE terms and
 * mapped back into the full list, leaving hidden ids' relative placement intact.
 */

import { clampLeadCount } from '@/app/utils/letter-reading-utils';

export interface LeadToggleInput {
  /** Full display order, hidden ids included */
  orderedPointIds: string[];
  /** Ids currently hidden via point_config.hidden */
  hiddenIds: ReadonlySet<string>;
  /** Raw stored point_config.lead_count (may be absent/malformed) */
  leadCount: number | undefined;
  /** The visible point being toggled */
  pointId: string;
}

export interface LeadToggleResult {
  order: string[];
  lead_count: number;
}

/**
 * Index in `fullOrder` immediately after the n-th visible element.
 * n = 0 → 0 (front of the list, before any visible point).
 */
function boundaryIndex(fullOrder: string[], hiddenIds: ReadonlySet<string>, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < fullOrder.length; i++) {
    if (!hiddenIds.has(fullOrder[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return fullOrder.length;
}

/** Whether `pointId` is currently within the lead group (first N visible points). */
export function isLeadPoint(
  orderedPointIds: string[],
  hiddenIds: ReadonlySet<string>,
  leadCount: number | undefined,
  pointId: string,
): boolean {
  const visible = orderedPointIds.filter((id) => !hiddenIds.has(id));
  const idx = visible.indexOf(pointId);
  if (idx < 0) return false; // hidden points are never leads
  return idx < clampLeadCount(leadCount, visible.length);
}

/**
 * Toggle `pointId`'s lead membership. Returns the new full `order` array and
 * `lead_count` to persist via updatePointConfig.
 */
export function toggleLead({ orderedPointIds, hiddenIds, leadCount, pointId }: LeadToggleInput): LeadToggleResult {
  const visible = orderedPointIds.filter((id) => !hiddenIds.has(id));
  const effective = clampLeadCount(leadCount, visible.length);
  const isLead = (() => {
    const idx = visible.indexOf(pointId);
    return idx >= 0 && idx < effective;
  })();

  const without = orderedPointIds.filter((id) => id !== pointId);
  if (!isLead) {
    // Mark: insert at the end of the lead group (boundary after the N-th visible point)
    const at = boundaryIndex(without, hiddenIds, effective);
    return {
      order: [...without.slice(0, at), pointId, ...without.slice(at)],
      lead_count: effective + 1,
    };
  }
  // Unmark: insert at the front of the post group (boundary after the remaining N-1 leads)
  const at = boundaryIndex(without, hiddenIds, effective - 1);
  return {
    order: [...without.slice(0, at), pointId, ...without.slice(at)],
    lead_count: effective - 1,
  };
}
