/**
 * @file p1427-seal-fresh-point-config.test.ts
 * @description P1427 regression — sealing a letter must not write back the
 * point_config captured when the composer loaded.
 *
 * Bug: the seal handler persisted the default point `order` as
 * `{ ...pageLoadConfig, order }`. If the author hid a point (or changed
 * `lead_count`) in another tab after the composer opened, the seal restored
 * the page-load `hidden` / `lead_count`, and the seal RPC — which snapshots
 * `doc_stories.point_config` (order, hidden, lead_count) at seal time — then
 * published the hidden point to recipients.
 *
 * Invariant (P1425, generalised): the seal owns `order` only. It must merge
 * `order` into the CURRENT point_config, never into a page-load copy.
 *
 * The fake service below models the doc_stories rows as a mutable store, so
 * the "other tab" is a real second writer between page load and seal.
 */

import { describe, it, expect } from 'vitest';
import { persistDefaultPointOrders } from '@/app/utils/compose-default-point-order';
import type { DocPointConfig } from '@/app/types';

const DOC = 'doc-1';

function makeStore(initial: Record<string, DocPointConfig>) {
  const rows = new Map<string, DocPointConfig>(
    Object.entries(initial).map(([k, v]) => [k, structuredClone(v)])
  );
  const writes: Array<{ storyId: string; config: DocPointConfig }> = [];
  const service = {
    async getPointConfigs(docId: string) {
      expect(docId).toBe(DOC);
      return new Map([...rows].map(([k, v]) => [k, structuredClone(v)]));
    },
    async updatePointConfig(docId: string, storyId: string, config: DocPointConfig) {
      expect(docId).toBe(DOC);
      writes.push({ storyId, config });
      if (rows.has(storyId)) rows.set(storyId, structuredClone(config));
    },
  };
  return { rows, writes, service };
}

/** The composer's page-load view: visible points only, config as read at load. */
function composerStory(storyId: string, pointIds: string[], config: DocPointConfig | null) {
  return {
    story_id: storyId,
    point_config: config,
    story: { points: pointIds.map((id) => ({ id })) },
  };
}

describe('P1427 — seal writes only `order` into the current point_config', () => {
  it('AC1: a point hidden in another tab after load stays hidden after seal', async () => {
    // Composer (tab 1) loads: nothing hidden, no order.
    const store = makeStore({ s1: { order: [], hidden: [] } });
    const pageLoad = [composerStory('s1', ['p1', 'p2', 'p3'], { order: [], hidden: [] })];

    // Tab 2 hides p2 (doc-detail page writes the whole config).
    store.rows.set('s1', { order: [], hidden: ['p2'] });

    // Tab 1 seals.
    await persistDefaultPointOrders(DOC, pageLoad, store.service);

    expect(store.rows.get('s1')?.hidden).toEqual(['p2']);
  });

  it('AC1: a lead_count changed in another tab after load survives the seal', async () => {
    const store = makeStore({ s1: { order: [], lead_count: 1 } });
    const pageLoad = [composerStory('s1', ['p1', 'p2'], { order: [], lead_count: 1 })];

    store.rows.set('s1', { order: [], lead_count: 0 });

    await persistDefaultPointOrders(DOC, pageLoad, store.service);

    expect(store.rows.get('s1')?.lead_count).toBe(0);
  });

  it('AC2: seal still persists the displayed order', async () => {
    const store = makeStore({ s1: { order: [], hidden: [] } });
    const pageLoad = [composerStory('s1', ['p3', 'p1', 'p2'], { order: [], hidden: [] })];

    store.rows.set('s1', { order: [], hidden: ['p2'] });

    await persistDefaultPointOrders(DOC, pageLoad, store.service);

    expect(store.rows.get('s1')).toEqual({ order: ['p3', 'p1', 'p2'], hidden: ['p2'] });
  });

  it('AC2: persists order when the row had no point_config at all', async () => {
    const store = makeStore({ s1: {} });
    const pageLoad = [composerStory('s1', ['p1', 'p2'], null)];

    await persistDefaultPointOrders(DOC, pageLoad, store.service);

    expect(store.rows.get('s1')).toEqual({ order: ['p1', 'p2'] });
  });

  it('does not overwrite an order another tab set after load (P767: an author order wins)', async () => {
    const store = makeStore({ s1: { order: [] } });
    const pageLoad = [composerStory('s1', ['p1', 'p2'], { order: [] })];

    store.rows.set('s1', { order: ['p2', 'p1'] });

    await persistDefaultPointOrders(DOC, pageLoad, store.service);

    expect(store.rows.get('s1')).toEqual({ order: ['p2', 'p1'] });
    expect(store.writes).toEqual([]);
  });

  it('skips a story removed from the doc in another tab', async () => {
    const store = makeStore({});
    const pageLoad = [composerStory('gone', ['p1', 'p2'], { order: [] })];

    await persistDefaultPointOrders(DOC, pageLoad, store.service);

    expect(store.writes).toEqual([]);
  });

  it('no read and no write when no story needs a default order', async () => {
    let reads = 0;
    const store = makeStore({ s1: { order: ['p2', 'p1'] } });
    const service = {
      ...store.service,
      async getPointConfigs(docId: string) {
        reads += 1;
        return store.service.getPointConfigs(docId);
      },
    };
    const pageLoad = [composerStory('s1', ['p2', 'p1'], { order: ['p2', 'p1'] })];

    await persistDefaultPointOrders(DOC, pageLoad, service);

    expect(reads).toBe(0);
    expect(store.writes).toEqual([]);
  });

  it('fails closed: a failed fresh read rejects and writes nothing', async () => {
    const store = makeStore({ s1: { order: [] } });
    const service = {
      ...store.service,
      async getPointConfigs(): Promise<Map<string, DocPointConfig>> {
        throw new Error('read failed');
      },
    };
    const pageLoad = [composerStory('s1', ['p1', 'p2'], { order: [] })];

    await expect(persistDefaultPointOrders(DOC, pageLoad, service)).rejects.toThrow('read failed');
    expect(store.writes).toEqual([]);
  });
});
