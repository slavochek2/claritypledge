/**
 * P955 gate fixture (P1631): the Clarify thread's drafts in each state the server can put them in. PERMANENT RENDER SUBSTRATE, never pruned.
 * Obviously fake data only. Renders the real ClarifyDraftsView (no network).
 * ?phase=loading | thinking | draft | draft-cited | refused | failed | capped | load-failed | two-drafts
 */
import { useSearchParams } from 'react-router-dom';
import type { ClarifyDraft } from '@/app/data/clarify-service';
import { ClarifyDraftsView } from '@/app/pages/chat/ClarifyDrafts';

const POINT = { id: 'point-id-1234', statement: 'Example bet: owners of two cafes will pay for monthly books (fake data).', ownerPosition: null };
const base = (id: string, over: Partial<ClarifyDraft>): ClarifyDraft => ({ id, state: 'done', point: null, suggestions: [], errorCode: null, cited: [], ...over });
const DONE = base('draft-id-1', { point: POINT });
const CITED = base('draft-id-2', { point: POINT, cited: [{ id: 'row-id-1', text: 'Example line one (fake data).', at: null }, { id: 'row-id-2', text: 'Example line two (fake data).', at: null }] });

const PHASES: Record<string, { drafts: ClarifyDraft[]; loaded?: boolean; failed?: boolean }> = {
  loading: { drafts: [], loaded: false },
  thinking: { drafts: [base('draft-id-3', { state: 'running' })] },
  draft: { drafts: [DONE] },
  'draft-cited': { drafts: [CITED] },
  refused: { drafts: [base('draft-id-4', { state: 'refused', suggestions: ['Example suggestion one', 'Example suggestion two', 'Example suggestion three'] })] },
  failed: { drafts: [base('draft-id-5', { state: 'failed', errorCode: 'bad_output' })] },
  capped: { drafts: [base('draft-id-6', { state: 'capped', errorCode: 'cap' })] },
  'load-failed': { drafts: [], failed: true },
  'two-drafts': { drafts: [DONE, base('draft-id-7', { point: { ...POINT, id: 'point-id-5678' } })] },
};

const noop = () => undefined;

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = params.get('phase') ?? 'draft';
  const phase = requested in PHASES ? requested : 'draft';
  const { drafts, loaded = true, failed = false } = PHASES[phase] ?? { drafts: [] };
  return (
    <div className="flex flex-col px-4 pb-24 pt-3">
      <nav style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', flexWrap: 'wrap' }}>
        {Object.keys(PHASES).map((p) => (
          <a key={p} href={`/tree/_gate/clarify-thread?phase=${p}`}>{p}</a>
        ))}
      </nav>
      <ClarifyDraftsView
        drafts={drafts} loaded={loaded} failed={failed} name="Test Owner" userId="user-id-1234"
        onPick={noop} onRetry={noop} onAnother={noop} onChanged={noop} onReload={noop}
      />
    </div>
  );
}

export default GateFixture;
