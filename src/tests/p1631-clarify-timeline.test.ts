/**
 * P1631 thread redesign: the Clarify thread is one conversation in time order. A draft is drawn right after the last message that is not newer than it;
 * a card is an earlier version when a newer done card names it as the one it refined; "Another point" belongs under the latest card only.
 */
import { describe, expect, it } from 'vitest';
import type { ClarifyDraft } from '@/app/data/clarify-service';
import { draftsByMessage, earlierDraftIds, mayAddAnother } from '@/app/pages/chat/clarify-timeline';

const d = (id: string, createdAt: string, over: Partial<ClarifyDraft> = {}): ClarifyDraft => ({
  id, state: 'done', point: { id: `p-${id}`, statement: id, ownerPosition: null }, suggestions: [], errorCode: null, cited: [], createdAt, refineTargetId: null, sourceKind: 'dm', published: [], ...over,
});
const msgs = [
  { id: 'root', createdAt: '2026-11-10T10:00:00Z' },
  { id: 'm1', createdAt: '2026-11-10T10:05:00Z' },
  { id: 'm2', createdAt: '2026-11-10T10:10:00Z' },
];

describe('draftsByMessage', () => {
  it('interleaves: the first draft follows the root, a refine follows the message that asked for it, and a draft before every message follows the root', () => {
    const placed = draftsByMessage(msgs, [d('a', '2026-11-10T10:00:30Z'), d('b', '2026-11-10T10:05:01Z', { refineTargetId: 'a' }), d('c', '2026-11-10T10:10:02Z'), d('early', '2026-11-10T09:00:00Z')]);
    expect(placed.get('root')?.map((x) => x.id)).toEqual(['early', 'a']);
    expect(placed.get('m1')?.map((x) => x.id)).toEqual(['b']);
    expect(placed.get('m2')?.map((x) => x.id)).toEqual(['c']);
  });
  it('two drafts after one message keep their own order, and a button-made draft (no message) follows the latest message before it', () => {
    const placed = draftsByMessage(msgs, [d('x', '2026-11-10T10:07:00Z'), d('y', '2026-11-10T10:06:00Z')]);
    expect(placed.get('m1')?.map((v) => v.id)).toEqual(['y', 'x']);
  });
  it('no messages: nothing is placed', () => {
    expect(draftsByMessage([], [d('a', '2026-11-10T10:00:30Z')]).size).toBe(0);
  });
});

describe('earlier versions and Another point', () => {
  it('a card a newer DONE card refined is earlier; a failed refine leaves the card current', () => {
    expect([...earlierDraftIds([d('a', '1'), d('b', '2', { refineTargetId: 'a' })])]).toEqual(['a']);
    expect([...earlierDraftIds([d('a', '1'), d('b', '2', { state: 'failed', point: null, refineTargetId: 'a' })])]).toEqual([]);
  });
  it('a target that is not in the thread (deleted: the column has no foreign key) marks nothing, and a card that is still being made marks nothing', () => {
    expect([...earlierDraftIds([d('b', '2', { refineTargetId: 'deleted-card' })])]).toEqual([]);
    expect([...earlierDraftIds([d('a', '1'), d('b', '2', { state: 'running', point: null, refineTargetId: 'a' })])]).toEqual([]);
    expect([...earlierDraftIds([d('a', '1'), d('b', '2', { state: 'refused', point: null, refineTargetId: 'a' })])]).toEqual([]);
  });
  it('a card with no target (an Another point run) marks nothing', () => {
    expect([...earlierDraftIds([d('a', '1'), d('b', '2')])]).toEqual([]);
  });
  it('a chain: only the newest card is current', () => {
    const chain = [d('a', '1'), d('b', '2', { refineTargetId: 'a' }), d('c', '3', { refineTargetId: 'b' })];
    expect([...earlierDraftIds(chain)].sort()).toEqual(['a', 'b']);
  });
  it('Another point shows under a latest card, and with no draft left; not under a failure, a refusal or a draft being made', () => {
    expect(mayAddAnother([])).toBe(true);
    expect(mayAddAnother([d('a', '1')])).toBe(true);
    for (const state of ['failed', 'refused', 'running', 'queued', 'capped'] as const) expect(mayAddAnother([d('a', '1'), d('b', '2', { state })]), state).toBe(false);
  });
});
