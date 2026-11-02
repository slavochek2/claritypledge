/**
 * @file p1536-s1-11-version-origin.test.tsx
 * @description P1536 S1.11 (D8): every reader sees a published version's origin in the picker row, "v3 · {date} · from v1", from the ONE
 * get_canvas read (no extra request). A native <option> holds text. A version with no origin (a first version, a draft) reads as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(),
  throwDbError: (_what: string, error: { message?: string } | null, message: string) => { throw new Error(error?.message ?? message); },
}));

import { canvasService } from '@/app/data/canvas-service';
import { VersionSwitcher } from '@/app/components/canvas/canvas-version-switcher';

const answer = (isOwner: boolean, versions: unknown[]) => ({
  data: { points: [], stories: [], positions: [], visibility: 'private', access: { is_owner: isOwner, admitted: true, version: 'canvas_d333333', versions } },
  error: null,
});
const wire = [
  { name: 'canvas_d333333', seq: 3, published_at: '2026-10-29T10:00:00Z', created_at: '2026-10-29T10:00:00Z', from_seq: 1 },
  { name: 'canvas_d222222', seq: 2, published_at: '2026-10-10T10:00:00Z', created_at: '2026-10-10T10:00:00Z', from_seq: 1 },
  { name: 'canvas_d111111', seq: 1, published_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', from_seq: null },
];

beforeEach(() => rpc.mockReset());

describe('S1.11 version origin reaches the picker', () => {
  it('getCanvas maps from_seq per version, for a reader and for the owner, in the one read', async () => {
    for (const isOwner of [false, true]) {
      rpc.mockReset();
      rpc.mockResolvedValueOnce(answer(isOwner, wire));
      const view = await canvasService.getCanvas('o', 'canvas');
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(view.versions.map(v => v.fromSeq ?? null)).toEqual([1, 1, null]);
    }
  });

  it('the picker row reads "v3 · {date} · from v1"; a first version (no origin) adds no suffix', () => {
    const versions = wire.map(v => ({ name: v.name, createdAt: v.created_at, seq: v.seq, publishedAt: v.published_at, draft: false, fromSeq: v.from_seq }));
    render(<VersionSwitcher versions={versions} open="canvas_d333333" onPick={() => undefined} />);
    const rows = within(screen.getByTestId('canvas-version-select')).getAllByRole('option').map(o => o.textContent ?? '');
    expect(rows[0]).toMatch(/^v3 · Oct 29, 2026 · from v1$/);
    expect(rows[1]).toMatch(/^v2 · Oct 10, 2026 · from v1$/); // the origin shows to everyone, restarts included (D8)
    expect(rows[2]).toMatch(/^v1 · Oct 1, 2026$/);
  });

  it('CONTROL: an answer with no from_seq (before D8, or a draft) maps and reads exactly as before', async () => {
    rpc.mockResolvedValueOnce(answer(false, [{ name: 'canvas_d111111', seq: 1, published_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z' }]));
    const view = await canvasService.getCanvas('o', 'canvas');
    expect(view.versions[0]!.fromSeq ?? null).toBeNull();
    render(<VersionSwitcher versions={view.versions} open="canvas_d111111" onPick={() => undefined} />);
    expect(within(screen.getByTestId('canvas-version-select')).getAllByRole('option')[0]!.textContent).toBe('v1 · Oct 1, 2026');
  });
});
