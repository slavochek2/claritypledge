/**
 * @file p1536-x10-card-by-thread.test.ts
 * @description P1536 §3c X10 (S3c.7), the read behind a mirror-chat card: a canvas thread root's card takes its state from the draft whose
 * `thread_root_id` is that message, never from the version the root attaches (a clone's root attaches its BASE, so a live draft's card used to read
 * "v1 · Published"). A root with no draft row uses the attached version as before.
 *  - Clone v1, Send: the root attaches v1, the draft is open => the card is the OPEN draft, numbered v2, going to the workspace
 *  - after Publish: the card is v2 (the version the draft became), going to `?v=<v2>` with no `ws=1`, also while another draft is open
 *  - two threads cloned from one base, one discarded and one published, each show their own state
 *  - a root with no draft row: the attached version's card as today (and it says it owns no thread)
 * The Supabase client is faked; every filter the read applies is recorded, so "by thread_root_id" is asserted, not assumed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: sb.rpc, from: sb.from, functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import { getCanvasRootCard } from '@/app/data/canvas-draft-service';

const ME = 'user-id-1234';
const ROOT_A = 'root-a';
const ROOT_B = 'root-b';

type Filters = Record<string, unknown>;
const state = {
  drafts: {} as Record<string, Record<string, unknown> | null>,
  versions: [] as Array<Record<string, unknown>>,
  filters: [] as Array<{ table: string; filters: Filters }>,
  openDraftName: null as string | null,
};

/** A from(t).select().eq()...maybeSingle() chain that remembers every eq() and answers by table and filter. */
function chain(table: string) {
  const filters: Filters = {};
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (col: string, val: unknown) => {
    filters[col] = val;
    return q;
  };
  q.maybeSingle = async () => {
    state.filters.push({ table, filters: { ...filters } });
    if (table === 'profiles') return { data: { slug: 'test-user' }, error: null };
    if (table === 'canvas_drafts') {
      if ('thread_root_id' in filters) return { data: state.drafts[String(filters.thread_root_id)] ?? null, error: null };
      if ('version_id' in filters) return { data: null, error: null };
      if (filters.state === 'open') return { data: state.openDraftName ? { version_name: state.openDraftName } : null, error: null };
    }
    return { data: null, error: null };
  };
  return q;
}

const version = (over: Record<string, unknown>) => ({
  id: 'ver-1', canvas_id: 'cv-1', canvas_name: 'canvas', name: 'canvas_d1', seq: 1, published_at: '2026-10-01T10:00:00Z', has_open_draft: false, ...over,
});
const draftRow = (over: Record<string, unknown>) => ({
  id: 'draft-a', version_id: 'ver-d2', canvas_id: 'cv-1', base_version_id: 'ver-1', conversation_id: 'conv-1', thread_root_id: ROOT_A, state: 'open',
  run_count: 1, revision: 3, closed_at: null, canvas_name: 'canvas', version_name: 'canvas_dd2', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.drafts = {};
  state.versions = [version({})];
  state.filters = [];
  state.openDraftName = null;
  sb.from.mockImplementation((t: string) => chain(t));
  sb.rpc.mockImplementation(async (name: string) => ({ data: name === 'list_my_canvas_versions' ? state.versions : [], error: null }));
});

describe('X10: a card says what its thread is', () => {
  it('Clone v1, Send: the root attaches v1 but the card is the OPEN DRAFT, numbered v2, going to the workspace', async () => {
    state.drafts[ROOT_A] = draftRow({});
    const card = await getCanvasRootCard(ROOT_A, 'ver-1', ME);
    expect(card).toMatchObject({ state: 'draft', draft: true, nextSeq: 2, title: 'Canvas', hasThread: true, draftId: 'draft-a', openHref: '/p/test-user/canvas/canvas?v=canvas_dd2&ws=1' });
    // it asked the database for the draft of THIS thread
    expect(state.filters.some((f) => f.table === 'canvas_drafts' && f.filters.thread_root_id === ROOT_A)).toBe(true);
  });

  it('after Publish: v2 and its date, View is v2 plain (no ws=1), even while another draft is open on the canvas', async () => {
    state.drafts[ROOT_A] = draftRow({ state: 'published', closed_at: '2026-10-05T10:00:00Z' });
    state.versions = [
      version({ id: 'ver-d2', name: 'canvas_dd2', seq: 2, published_at: '2026-10-05T10:00:00Z', has_open_draft: true }),
      version({ has_open_draft: true }),
    ];
    state.openDraftName = 'canvas_dother'; // another draft of the same canvas is open
    const card = await getCanvasRootCard(ROOT_A, 'ver-1', ME);
    expect(card).toMatchObject({ state: 'published', draft: false, seq: 2, hasThread: true, href: '/p/test-user/canvas/canvas?v=canvas_dd2', openHref: '/p/test-user/canvas/canvas?v=canvas_dd2' });
    expect(card?.label).toMatch(/^v2 · /);
    expect(card?.openHref).not.toContain('ws=1');
  });

  it('two threads cloned from one base, one discarded and one published: each shows its own state', async () => {
    state.drafts[ROOT_A] = draftRow({ id: 'draft-a', state: 'discarded', closed_at: '2026-10-03T10:00:00Z', version_id: 'ver-dA', version_name: 'canvas_ddA' });
    state.drafts[ROOT_B] = draftRow({ id: 'draft-b', thread_root_id: ROOT_B, state: 'published', closed_at: '2026-10-05T10:00:00Z', version_id: 'ver-dB', version_name: 'canvas_ddB' });
    state.versions = [version({ id: 'ver-dB', name: 'canvas_ddB', seq: 2, published_at: '2026-10-05T10:00:00Z' }), version({})];
    const [a, b] = await Promise.all([getCanvasRootCard(ROOT_A, 'ver-1', ME), getCanvasRootCard(ROOT_B, 'ver-1', ME)]);
    expect(a).toMatchObject({ state: 'discarded', hasThread: true, draftId: 'draft-a' });
    expect(a?.label).not.toMatch(/^v/);
    expect(b).toMatchObject({ state: 'published', seq: 2, hasThread: true, openHref: '/p/test-user/canvas/canvas?v=canvas_ddB' });
  });

  it('a discarded draft: it says so, and carries the canvas title (no button is drawn for it)', async () => {
    state.drafts[ROOT_A] = draftRow({ state: 'discarded', closed_at: '2026-10-03T10:00:00Z' });
    const card = await getCanvasRootCard(ROOT_A, 'ver-1', ME);
    expect(card).toMatchObject({ state: 'discarded', title: 'Canvas', hasThread: true });
  });

  it('a root with no draft row uses the attached version, as before, and owns no thread', async () => {
    const card = await getCanvasRootCard(ROOT_A, 'ver-1', ME);
    expect(card).toMatchObject({ state: 'published', draft: false, openHref: '/p/test-user/canvas/canvas?v=canvas_d1' });
    expect(card?.label).toMatch(/^v1 · /);
    expect(card?.hasThread).toBeFalsy();
  });

  it('CONTROL: a root whose draft is not readable and whose version is not the viewer\'s is unavailable (null)', async () => {
    state.versions = [];
    await expect(getCanvasRootCard(ROOT_A, 'ver-x', ME)).resolves.toBeNull();
  });

  it('a published card\'s View does not depend on another draft: the attached-version fallback also stays plain (W1 is superseded)', async () => {
    state.versions = [version({ has_open_draft: true })];
    state.openDraftName = 'canvas_dother';
    const card = await getCanvasRootCard(ROOT_A, 'ver-1', ME);
    expect(card?.openHref).toBe('/p/test-user/canvas/canvas?v=canvas_d1');
  });
});
