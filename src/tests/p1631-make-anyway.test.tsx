/**
 * P1631 "Make one anyway": the extra choice on a refusal ("no other disagreement here"). It sends the instruction "Make one anyway" through the
 * same path as a suggestion (clarify_another with p_instruction), shows with or without suggestions, only on the newest answer, never on a done card.
 * The real view and the real button actions run; only the database rpc is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClarifyDraft } from '@/app/data/clarify-service';

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));

import { ClarifyDraftsView } from '@/app/pages/chat/ClarifyDrafts';
import { useClarifyActions } from '@/app/pages/chat/use-clarify-actions';
import { resetClarifyRuns } from '@/app/pages/chat/clarify-run';
import { MAKE_ANYWAY_INSTRUCTION, MAKE_ANYWAY_LABEL } from '@/app/pages/chat/clarify-copy';

const draft = (over: Partial<ClarifyDraft> = {}): ClarifyDraft => ({
  id: 'd1',
  state: 'refused',
  point: null,
  suggestions: [],
  errorCode: null,
  cited: [],
  createdAt: '2026-11-10T10:00:00Z',
  refineTargetId: null,
  sourceKind: 'dm',
  published: [],
  ...over,
});

function Harness({ drafts }: { drafts: ClarifyDraft[] }) {
  const actions = useClarifyActions('root-1');
  return (
    <ClarifyDraftsView
      drafts={drafts} all={drafts} loaded failed={false} name="Mirror" userId="user-id-1234"
      mentionedId={null} onMention={() => undefined} actions={actions} onReload={() => undefined} first last
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetClarifyRuns();
});
afterEach(cleanup);

describe('Make one anyway', () => {
  it('is worded exactly as the founder settled it', () => {
    expect(MAKE_ANYWAY_LABEL).toBe('Make one anyway');
  });

  it('the instruction is the phrase the drafting adapter keys on, a constant apart from the label', () => {
    expect(MAKE_ANYWAY_INSTRUCTION).toBe('Make one anyway');
    expect(readFileSync(join(__dirname, '..', '..', 'supabase', 'functions', 'clarify-draft', 'clarify-adapter.md'), 'utf8')).toContain(`"${MAKE_ANYWAY_INSTRUCTION}"`);
  });

  it('shows on a refusal that carries no suggestions', () => {
    render(<Harness drafts={[draft()]} />);
    expect(screen.getByTestId('clarify-make-anyway').textContent).toBe('Make one anyway');
    expect(screen.queryAllByTestId('clarify-suggestion')).toHaveLength(0);
  });

  it('shows beside the suggestions on a refusal that has them', () => {
    render(<Harness drafts={[draft({ suggestions: ['one', 'two'] })]} />);
    expect(screen.getAllByTestId('clarify-suggestion')).toHaveLength(2);
    expect(screen.getByTestId('clarify-make-anyway')).toBeTruthy();
  });

  it('a tap calls clarify_another with the instruction "Make one anyway"', async () => {
    rpc.mockResolvedValue({ data: { status: 'started', draft_id: 'd2' }, error: null });
    render(<Harness drafts={[draft()]} />);
    fireEvent.click(screen.getByTestId('clarify-make-anyway'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('clarify_another', { p_thread_root: 'root-1', p_instruction: MAKE_ANYWAY_INSTRUCTION }));
  });

  it('does not show on a done card', () => {
    render(<Harness drafts={[draft({ state: 'done', point: { id: 'pt1', statement: 'S', ownerPosition: null } })]} />);
    expect(screen.queryByTestId('clarify-make-anyway')).toBeNull();
  });

  it('shows only on the newest refusal of the thread', () => {
    render(<Harness drafts={[draft({ id: 'old' }), draft({ id: 'new', createdAt: '2026-11-10T11:00:00Z' })]} />);
    expect(screen.getAllByTestId('clarify-make-anyway')).toHaveLength(1);
    expect(screen.getByTestId('clarify-refused-new').querySelector('[data-testid="clarify-make-anyway"]')).toBeTruthy();
  });
});
