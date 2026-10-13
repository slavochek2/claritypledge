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

import type { DocsService } from '@/app/data/docs-service.interface';
import type { DocPointConfig } from '@/app/types';

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

/**
 * P1427: persist the default `order` writes before sealing, merging `order`
 * into the CURRENT point_config rather than the copy the composer loaded.
 *
 * The seal owns `order` only. `hidden` / `lead_count` may have changed in
 * another tab since page load, and the seal RPC snapshots the row's whole
 * point_config — so writing a page-load copy back would republish a point the
 * author has since hidden.
 *
 * - Re-reads every story's point_config immediately before writing.
 * - Skips a story whose current `order` is already non-empty (someone set it
 *   after load; an explicit order wins, as in P767), or whose row is gone.
 * - Fails closed: a failed read or write rejects, so the caller never seals.
 *
 * Residual: read-then-write is not atomic. A change landing between this read
 * and the write (one round trip) is still overwritten; closing that needs a
 * server-side single-key update (jsonb_set in an RPC).
 */
export async function persistDefaultPointOrders(
  docId: string,
  stories: StoryLike[],
  service: Pick<DocsService, 'getPointConfigs' | 'updatePointConfig'>
): Promise<void> {
  const orderUpdates = computeDefaultPointOrderUpdates(stories);
  if (orderUpdates.length === 0) return;

  const current = await service.getPointConfigs(docId);
  await Promise.all(
    orderUpdates.map(({ storyId, order }) => {
      const fresh: DocPointConfig | undefined = current.get(storyId);
      if (!fresh) return undefined;
      if (Array.isArray(fresh.order) && fresh.order.length > 0) return undefined;
      return service.updatePointConfig(docId, storyId, { ...fresh, order });
    })
  );
}
