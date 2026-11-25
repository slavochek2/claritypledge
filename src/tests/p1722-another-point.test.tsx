/**
 * P1722 item 2: "Another point" in a New point thread shows only once the owner has replied in it. A thread whose drafts were all deleted after a reply still
 * shows it; any other Clarify thread with all drafts deleted keeps it. The real useClarifyParts and ClarifyDraftsView; only the thread read is answered here.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import type { ClarifyDraft } from '@/app/data/clarify-service';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));
const getClarifyThread = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/clarify-service', async () => ({ ...(await vi.importActual<object>('@/app/data/clarify-service')), getClarifyThread }));
vi.mock('@/app/pages/chat/ClarifyComposer', () => ({ ClarifyComposer: () => <div data-testid="composer" /> }));

import { useClarifyParts } from '@/app/pages/chat/use-clarify-parts';
import { resetClarifyRuns } from '@/app/pages/chat/clarify-run';

const ME = 'user-id-me';
const MIRROR = { kind: 'mirror', title: 'Mira', other: null } as unknown as ChatSummary;
const root = (newPoint: boolean) => ({
  id: 'root-1', kind: 'clarify', threadRootId: null, isDeleted: false, createdAt: '2026-11-25T08:00:00.000Z', authorId: ME,
  forwardSnapshot: { scope: 'chat', newPoint },
}) as unknown as ChatMessage;
const reply = { id: 'r1', kind: 'message', threadRootId: 'root-1', authorId: ME, isDeleted: false, createdAt: '2026-11-25T08:01:00.000Z' } as unknown as ChatMessage;
const done = { id: 'd1', state: 'done', createdAt: '2026-11-25T08:02:00.000Z', point: { id: 'p1', statement: 'A point', ownerPosition: null }, suggestions: [], cited: [], refineTargetId: null, published: [], errorCode: null } as unknown as ClarifyDraft;

function Thread({ rootMsg, messages }: { rootMsg: ChatMessage; messages: ChatMessage[] }) {
  const parts = useClarifyParts(MIRROR, rootMsg, ME, messages);
  return <>{Object.entries(parts.after ?? {}).map(([id, node]) => <div key={id}>{node as ReactNode}</div>)}</>;
}
const another = () => screen.queryByTestId('clarify-another');

beforeEach(() => { resetClarifyRuns(); getClarifyThread.mockReset(); });
afterEach(cleanup);

describe('Another point', () => {
  it('a New point thread with no reply and no draft: none (the composer is the action)', async () => {
    getClarifyThread.mockResolvedValue([]);
    render(<Thread rootMsg={root(true)} messages={[root(true)]} />);
    await waitFor(() => expect(getClarifyThread).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(another()).toBeNull();
  });

  it('a New point thread after the owner replied and every draft was deleted: shown', async () => {
    getClarifyThread.mockResolvedValue([]);
    render(<Thread rootMsg={root(true)} messages={[root(true), reply]} />);
    expect(await screen.findByTestId('clarify-another')).toBeInTheDocument();
  });

  it('Y2: a New point thread whose only owner reply was deleted, no drafts: none', async () => {
    getClarifyThread.mockResolvedValue([]);
    const gone = { ...reply, isDeleted: true } as ChatMessage;
    render(<Thread rootMsg={root(true)} messages={[root(true), gone]} />);
    await waitFor(() => expect(getClarifyThread).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(another()).toBeNull();
  });

  it('a New point thread with a done draft: shown', async () => {
    getClarifyThread.mockResolvedValue([done]);
    render(<Thread rootMsg={root(true)} messages={[root(true), reply]} />);
    expect(await screen.findByTestId('clarify-another')).toBeInTheDocument();
  });

  it('another Clarify thread with all drafts deleted keeps it', async () => {
    getClarifyThread.mockResolvedValue([]);
    render(<Thread rootMsg={root(false)} messages={[root(false)]} />);
    expect(await screen.findByTestId('clarify-another')).toBeInTheDocument();
  });
});
