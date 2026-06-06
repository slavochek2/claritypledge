/**
 * @file p898-lead-count.test.ts
 * @description P898: Author-controlled pre/post-story split — pure-function coverage.
 *
 * Covers:
 *  - clampLeadCount / getEffectiveLeadCount: fallback-to-1, valid 0, range clamp,
 *    malformed data (negative, non-integer, non-number) never breaks the reader
 *  - calculateStoryProgress: generalized N-lead screen math for lead counts
 *    0 / 1 (regression vs the previous hardcoded shape) / 2 / all-leads,
 *    plus the V=1 legacy walk and V=0 story-only walk
 *  - toggleLead / isLeadPoint: mark moves to END of lead group + increments,
 *    unmark moves to FRONT of post group + decrements, hidden ids interleaved
 *    in `order` keep their relative placement
 *  - docStoryToSnapshot: preview path carries lead_count (P749 lesson —
 *    preview/seal shape drift)
 *  - Seal RPC canary (P819 pattern): the most recent migration that redefines
 *    seal_and_send_letter must write 'lead_count' into point_config
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  clampLeadCount,
  getEffectiveLeadCount,
  calculateStoryProgress,
} from '@/app/utils/letter-reading-utils';
import { toggleLead, isLeadPoint } from '@/app/utils/lead-toggle';
import { docStoryToSnapshot } from '@/app/utils/letter-snapshot-mapper';
import type { DocStory } from '@/app/types';

// ── clampLeadCount / getEffectiveLeadCount ──────────────────────────────────

describe('P898 — clampLeadCount', () => {
  it('absent → 1 (the historical implicit single lead), bounded by visible count', () => {
    expect(clampLeadCount(undefined, 3)).toBe(1);
    expect(clampLeadCount(undefined, 1)).toBe(1);
    expect(clampLeadCount(undefined, 0)).toBe(0);
  });

  it('0 is a VALID authorial value, not malformed', () => {
    expect(clampLeadCount(0, 3)).toBe(0);
  });

  it('clamps out-of-range values to [0, visiblePointCount]', () => {
    expect(clampLeadCount(2, 3)).toBe(2);
    expect(clampLeadCount(99, 3)).toBe(3);
    expect(clampLeadCount(-1, 3)).toBe(0);
    expect(clampLeadCount(-99, 3)).toBe(0);
  });

  it('floors non-integer numbers', () => {
    expect(clampLeadCount(2.7, 3)).toBe(2);
    expect(clampLeadCount(0.9, 3)).toBe(0);
  });

  it('non-number / non-finite values fall back to 1', () => {
    expect(clampLeadCount('2', 3)).toBe(1);
    expect(clampLeadCount(null, 3)).toBe(1);
    expect(clampLeadCount(NaN, 3)).toBe(1);
    expect(clampLeadCount(Infinity, 3)).toBe(1);
    expect(clampLeadCount({}, 3)).toBe(1);
  });
});

describe('P898 — getEffectiveLeadCount', () => {
  it('reads lead_count from a point_config object', () => {
    expect(getEffectiveLeadCount({ lead_count: 2 }, 3)).toBe(2);
    expect(getEffectiveLeadCount({ lead_count: 0 }, 3)).toBe(0);
  });

  it('absent / null config falls back to 1', () => {
    expect(getEffectiveLeadCount({}, 3)).toBe(1);
    expect(getEffectiveLeadCount(null, 3)).toBe(1);
    expect(getEffectiveLeadCount(undefined, 3)).toBe(1);
  });

  it('malformed lead_count falls back to 1, out-of-range clamps', () => {
    expect(getEffectiveLeadCount({ lead_count: 'three' }, 2)).toBe(1);
    expect(getEffectiveLeadCount({ lead_count: 99 }, 2)).toBe(2);
  });
});

// ── calculateStoryProgress ──────────────────────────────────────────────────

describe('P898 — calculateStoryProgress', () => {
  it('REGRESSION: default leadCount (1) reproduces the previous hardcoded V=3 walk exactly', () => {
    // Old shape: total = 4 + 2*(V-1) = 8; point pair 0/1, story pair 2/3, remaining pairs 4..7
    const V = 3;
    expect(calculateStoryProgress('point-engage', 0, V)).toBe(0 / 8);
    expect(calculateStoryProgress('point-revealed', 0, V)).toBe(1 / 8);
    expect(calculateStoryProgress('story-rate', 0, V)).toBe(2 / 8);
    expect(calculateStoryProgress('story-revealed', 0, V)).toBe(3 / 8);
    expect(calculateStoryProgress('remaining-point-engage', 1, V)).toBe(4 / 8);
    expect(calculateStoryProgress('remaining-point-revealed', 1, V)).toBe(5 / 8);
    expect(calculateStoryProgress('remaining-point-engage', 2, V)).toBe(6 / 8);
    expect(calculateStoryProgress('remaining-point-revealed', 2, V)).toBe(7 / 8);
    expect(calculateStoryProgress('transition', 2, V)).toBe(1);
  });

  it('REGRESSION: V=1 legacy walk unchanged (story first, point after)', () => {
    expect(calculateStoryProgress('story-rate', 0, 1)).toBe(0);
    expect(calculateStoryProgress('story-revealed', 0, 1)).toBe(1 / 4);
    expect(calculateStoryProgress('point-engage', 0, 1)).toBe(2 / 4);
    expect(calculateStoryProgress('point-revealed', 0, 1)).toBe(3 / 4);
    expect(calculateStoryProgress('transition', 0, 1)).toBe(1);
  });

  it('REGRESSION: V=0 story-only walk unchanged', () => {
    expect(calculateStoryProgress('story-rate', 0, 0)).toBe(0);
    expect(calculateStoryProgress('story-revealed', 0, 0)).toBe(0.5);
    expect(calculateStoryProgress('transition', 0, 0)).toBe(1);
  });

  it('N=0 (story-first): story pair at screens 0/1, all points follow as remaining', () => {
    const V = 2; // total = 6
    expect(calculateStoryProgress('story-rate', 0, V, 0)).toBe(0 / 6);
    expect(calculateStoryProgress('story-revealed', 0, V, 0)).toBe(1 / 6);
    expect(calculateStoryProgress('remaining-point-engage', 0, V, 0)).toBe(2 / 6);
    expect(calculateStoryProgress('remaining-point-revealed', 0, V, 0)).toBe(3 / 6);
    expect(calculateStoryProgress('remaining-point-engage', 1, V, 0)).toBe(4 / 6);
    expect(calculateStoryProgress('remaining-point-revealed', 1, V, 0)).toBe(5 / 6);
    expect(calculateStoryProgress('transition', 1, V, 0)).toBe(1);
  });

  it('N=2 of V=3: two lead pairs, story pair after screen 2N=4, one remaining pair', () => {
    const V = 3; // total = 8
    expect(calculateStoryProgress('point-engage', 0, V, 2)).toBe(0 / 8);
    expect(calculateStoryProgress('point-revealed', 0, V, 2)).toBe(1 / 8);
    expect(calculateStoryProgress('point-engage', 1, V, 2)).toBe(2 / 8);
    expect(calculateStoryProgress('point-revealed', 1, V, 2)).toBe(3 / 8);
    expect(calculateStoryProgress('story-rate', 1, V, 2)).toBe(4 / 8);
    expect(calculateStoryProgress('story-revealed', 1, V, 2)).toBe(5 / 8);
    expect(calculateStoryProgress('remaining-point-engage', 2, V, 2)).toBe(6 / 8);
    expect(calculateStoryProgress('remaining-point-revealed', 2, V, 2)).toBe(7 / 8);
    expect(calculateStoryProgress('transition', 2, V, 2)).toBe(1);
  });

  it('all-leads (N=V=2): story pair is last before transition', () => {
    const V = 2; // total = 6
    expect(calculateStoryProgress('point-engage', 0, V, 2)).toBe(0 / 6);
    expect(calculateStoryProgress('point-revealed', 0, V, 2)).toBe(1 / 6);
    expect(calculateStoryProgress('point-engage', 1, V, 2)).toBe(2 / 6);
    expect(calculateStoryProgress('point-revealed', 1, V, 2)).toBe(3 / 6);
    expect(calculateStoryProgress('story-rate', 1, V, 2)).toBe(4 / 6);
    expect(calculateStoryProgress('story-revealed', 1, V, 2)).toBe(5 / 6);
    expect(calculateStoryProgress('transition', 1, V, 2)).toBe(1);
  });

  it('malformed leadCount clamps — progress is always within [0, 1]', () => {
    expect(calculateStoryProgress('story-rate', 0, 2, 99)).toBe(4 / 6); // clamped to all-leads
    expect(calculateStoryProgress('story-rate', 0, 2, -5)).toBe(0); // clamped to story-first
    for (const phase of ['point-engage', 'story-rate', 'story-revealed', 'transition'] as const) {
      const p = calculateStoryProgress(phase, 0, 2, 99);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(Number.isFinite(p)).toBe(true);
    }
  });
});

// ── toggleLead / isLeadPoint ────────────────────────────────────────────────

const NO_HIDDEN: ReadonlySet<string> = new Set();

describe('P898 — isLeadPoint', () => {
  it('default (lead_count absent): first visible point is the implicit lead', () => {
    expect(isLeadPoint(['A', 'B', 'C'], NO_HIDDEN, undefined, 'A')).toBe(true);
    expect(isLeadPoint(['A', 'B', 'C'], NO_HIDDEN, undefined, 'B')).toBe(false);
    expect(isLeadPoint(['A', 'B', 'C'], NO_HIDDEN, undefined, 'C')).toBe(false);
  });

  it('lead_count 2: first two visible points lead', () => {
    expect(isLeadPoint(['A', 'B', 'C'], NO_HIDDEN, 2, 'B')).toBe(true);
    expect(isLeadPoint(['A', 'B', 'C'], NO_HIDDEN, 2, 'C')).toBe(false);
  });

  it('hidden points are never leads; hidden leads do not consume the count eagerly', () => {
    const hidden = new Set(['A']);
    expect(isLeadPoint(['A', 'B', 'C'], hidden, 1, 'A')).toBe(false);
    // A hidden: visible = [B, C]; effective lead = min(1, 2) = 1 → B leads
    expect(isLeadPoint(['A', 'B', 'C'], hidden, 1, 'B')).toBe(true);
  });
});

describe('P898 — toggleLead', () => {
  it('mark: moves the point to the END of the lead group and increments lead_count', () => {
    const result = toggleLead({
      orderedPointIds: ['A', 'B', 'C'],
      hiddenIds: NO_HIDDEN,
      leadCount: undefined, // implicit 1 → lead group = [A]
      pointId: 'C',
    });
    expect(result.order).toEqual(['A', 'C', 'B']);
    expect(result.lead_count).toBe(2);
  });

  it('unmark: moves the point to the FRONT of the post group and decrements lead_count', () => {
    const result = toggleLead({
      orderedPointIds: ['A', 'C', 'B'],
      hiddenIds: NO_HIDDEN,
      leadCount: 2, // leads = [A, C]
      pointId: 'A',
    });
    expect(result.order).toEqual(['C', 'A', 'B']);
    expect(result.lead_count).toBe(1);
  });

  it('unmarking the last lead is allowed → lead_count 0 (story-first)', () => {
    const result = toggleLead({
      orderedPointIds: ['A', 'B'],
      hiddenIds: NO_HIDDEN,
      leadCount: 1,
      pointId: 'A',
    });
    expect(result.order).toEqual(['A', 'B']);
    expect(result.lead_count).toBe(0);
  });

  it('marking every point produces all-leads (story last)', () => {
    const step1 = toggleLead({
      orderedPointIds: ['A', 'B'],
      hiddenIds: NO_HIDDEN,
      leadCount: undefined,
      pointId: 'B',
    });
    expect(step1.order).toEqual(['A', 'B']);
    expect(step1.lead_count).toBe(2);
  });

  it('hidden ids interleaved in order keep their relative placement', () => {
    // H hidden between A (lead) and B/C. Mark C → C joins the lead group after A.
    const result = toggleLead({
      orderedPointIds: ['A', 'H', 'B', 'C'],
      hiddenIds: new Set(['H']),
      leadCount: undefined, // implicit 1 → visible leads = [A]
      pointId: 'C',
    });
    expect(result.order).toEqual(['A', 'C', 'H', 'B']);
    expect(result.lead_count).toBe(2);
  });

  it('unmark with hidden interleaved: point lands at the front of the post group', () => {
    const result = toggleLead({
      orderedPointIds: ['A', 'C', 'H', 'B'],
      hiddenIds: new Set(['H']),
      leadCount: 2, // visible leads = [A, C]
      pointId: 'A',
    });
    expect(result.order).toEqual(['C', 'A', 'H', 'B']);
    expect(result.lead_count).toBe(1);
  });

  it('round-trip: mark then unmark restores the original split size', () => {
    const marked = toggleLead({
      orderedPointIds: ['A', 'B', 'C'],
      hiddenIds: NO_HIDDEN,
      leadCount: 1,
      pointId: 'B',
    });
    const unmarked = toggleLead({
      orderedPointIds: marked.order,
      hiddenIds: NO_HIDDEN,
      leadCount: marked.lead_count,
      pointId: 'B',
    });
    expect(unmarked.lead_count).toBe(1);
    expect(unmarked.order).toEqual(['A', 'B', 'C']);
  });
});

// ── docStoryToSnapshot (preview path) ───────────────────────────────────────

function makeDocStory(pointConfig: DocStory['point_config']): DocStory {
  return {
    doc_id: 'd1',
    story_id: 's1',
    position: 0,
    created_at: '',
    point_config: pointConfig,
    story: {
      id: 's1',
      title: 'title',
      content: 'story',
      imageUrl: undefined,
      visibility: 'public',
      authorId: 'u1',
      currentVersion: 1,
      understoodCount: 0,
      createdAt: '',
      updatedAt: '',
      tags: [],
      systemTags: [],
      authorName: 'Author',
      authorSlug: '',
      authorEarsCount: 0,
      authorHasPledged: false,
      points: [
        { id: 'pA', statement: 'A', tags: [], systemTags: [], positionCounts: {}, userPosition: null, profileSubjectPosition: null, visibility: 'public' },
        { id: 'pB', statement: 'B', tags: [], systemTags: [], positionCounts: {}, userPosition: null, profileSubjectPosition: null, visibility: 'public' },
      ],
    },
  } as unknown as DocStory;
}

describe('P898 — docStoryToSnapshot carries lead_count (preview/seal shape parity)', () => {
  it('carries an explicit lead_count into the snapshot', () => {
    const snapshot = docStoryToSnapshot(makeDocStory({ order: ['pA', 'pB'], lead_count: 2 }));
    expect((snapshot.point_config as { lead_count?: number }).lead_count).toBe(2);
  });

  it('carries lead_count 0 (story-first is a valid authorial value)', () => {
    const snapshot = docStoryToSnapshot(makeDocStory({ lead_count: 0 }));
    expect((snapshot.point_config as { lead_count?: number }).lead_count).toBe(0);
  });

  it('absent lead_count stays absent — reader fallback owns the default', () => {
    const snapshot = docStoryToSnapshot(makeDocStory({}));
    expect((snapshot.point_config as { lead_count?: number }).lead_count).toBeUndefined();
  });
});

// ── Seal RPC canary (P819 pattern) ──────────────────────────────────────────

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const FUNCTION_DEF_PATTERN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?seal_and_send_letter\b/i;
const LEAD_COUNT_KEY_PATTERN = /'lead_count'\s*,/;

describe('P898 — seal_and_send_letter migrations preserve lead_count', () => {
  it('the most recent migration that redefines seal_and_send_letter writes lead_count into point_config', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let latestMigration: string | null = null;
    let latestBody = '';
    for (const file of files) {
      const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      if (FUNCTION_DEF_PATTERN.test(body)) {
        latestMigration = file;
        latestBody = body;
      }
    }

    expect(latestMigration, 'No migration redefines seal_and_send_letter — schema regression').not.toBeNull();
    expect(
      LEAD_COUNT_KEY_PATTERN.test(latestBody),
      `${latestMigration} redefines seal_and_send_letter but does not write 'lead_count' into ` +
        `point_config. The jsonb_build_object drops unlisted fields silently (the P819 imageUrl ` +
        `incident) — an author's pre/post-story split would vanish at seal, and the reader's ` +
        `fallback-to-1 makes the loss invisible.`,
    ).toBe(true);
  });
});
