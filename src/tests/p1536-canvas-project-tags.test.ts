/**
 * @file p1536-canvas-project-tags.test.ts
 * @description P1536: a version made by the draft flow is named `<canvas>_d<6 hex>` and its points carry
 * `canvas_<canvas>_d<hex>`. `getCanvasProjectTags` lists CANVASES, so a draft version (or any version of the draft flow)
 * must fold into its canvas and never appear as a canvas of its own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };
const rows = vi.hoisted(() => ({ points: [] as Array<{ system_tags: string[] }> }));

function chain() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'overlaps']) q[m] = () => q;
  q.then = (resolve: (r: Result) => unknown) => Promise.resolve({ data: rows.points, error: null }).then(resolve);
  return q;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => chain() } }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({ getBannerUrl: () => null }));

import { realPointsService } from '@/app/data/points-service-real';
import { canvasNameOf, canvasOfTag, canvasOfVersionName } from '@/lib/canvas-boxes';

beforeEach(() => { rows.points = []; });

describe('canvasOfTag', () => {
  it('folds a draft-flow version into its canvas, and leaves every other name alone', () => {
    expect(canvasOfVersionName('canvas_2_d1a2b3c')).toBe('canvas_2');
    expect(canvasOfTag('canvas_canvas_d1a2b3c')).toBe('canvas');
    expect(canvasOfTag('canvas_sales_v2')).toBe('sales_v2'); // an older, hand-named version keeps its own name
    expect(canvasOfTag('canvas__d1a2b3c')).toBe('_d1a2b3c'); // never an empty name
    expect(canvasOfTag('canvas:problem')).toBeNull();
    expect(canvasOfTag('claritypledge')).toBeNull();
  });
});

describe('getCanvasProjectTags', () => {
  it('lists each canvas once, never an internal draft version name', async () => {
    rows.points = [
      { system_tags: ['canvas:problem', 'canvas_canvas_dabc123'] }, // a draft's point
      { system_tags: ['canvas:solution', 'canvas_canvas_d111111'] }, // a published version of the same canvas
      { system_tags: ['canvas:problem', 'canvas_canvas_2_d222222'] }, // a second canvas, drafted
      { system_tags: ['canvas:problem', 'canvas_sales'] }, // an older canvas, named by hand
    ];
    const tags = await realPointsService.getCanvasProjectTags('owner-1', 'owner-1');
    expect(tags).toEqual(['canvas', 'canvas_2', 'sales']);
    expect(tags.some(t => /_d[0-9a-f]{6}$/.test(t))).toBe(false);
  });

  it('CONTROL: the version-name reader (what listed canvases before) lists the very same rows as three draft versions', () => {
    const tags = ['canvas_canvas_dabc123', 'canvas_canvas_d111111', 'canvas_canvas_2_d222222'];
    expect(tags.map(canvasNameOf)).toEqual(['canvas_dabc123', 'canvas_d111111', 'canvas_2_d222222']);
  });
});
