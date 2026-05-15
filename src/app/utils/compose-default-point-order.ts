/**
 * @file compose-default-point-order.ts
 * @description P837 fix: compute point_config.order writes the composer must
 * persist before sealing, so the sealed snapshot's leading-point matches what
 * the author saw in the draft.
 *
 * When point_config.order is empty/missing AND the story has 2+ displayed
 * points, snapshot the displayed point ids into `order`. The snapshot mapper
 * already honors non-empty order (P767), so persisting it makes composer and
 * sealed views agree by construction rather than by coincidence.
 *
 * Invariant: callers pass the same `stories` shape the composer renders —
 * already filtered by `point_config.hidden`. The emitted `order` therefore
 * lists visible point ids only. This is correct because the snapshot mapper
 * applies `hidden` before `order`, so hidden points never participate in the
 * leading-point sort.
 */

type StoryLike = {
  story_id: string;
  point_config: { order?: string[] | null } | null;
  story: { points: Array<{ id: string }> };
};

export type DefaultPointOrderUpdate = {
  storyId: string;
  order: string[];
};

export function computeDefaultPointOrderUpdates(
  stories: StoryLike[]
): DefaultPointOrderUpdate[] {
  const updates: DefaultPointOrderUpdate[] = [];
  for (const s of stories) {
    const existing = s.point_config?.order;
    if (Array.isArray(existing) && existing.length > 0) continue;
    const pointIds = s.story.points.map((p) => p.id);
    if (pointIds.length < 2) continue;
    updates.push({ storyId: s.story_id, order: pointIds });
  }
  return updates;
}
