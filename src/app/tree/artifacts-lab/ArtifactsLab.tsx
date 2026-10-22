/**
 * P1545 Phase 1: /tree/artifacts — three Artifacts + menu variants on mock data, for the founder's pick.
 * ?v=a|b|c picks the variant, ?state= picks a scenario so every state is one link away.
 */
import { useSearchParams } from 'react-router-dom';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';

export const STATES = ['full', 'shared', 'menu-open', 'search-open', 'empty-yours', 'empty-shared', 'events-empty', 'events-some'] as const;
export type LabState = (typeof STATES)[number];

const VARIANTS = { a: VariantA, b: VariantB, c: VariantC } as const;
type VariantKey = keyof typeof VARIANTS;

export function ArtifactsLab() {
  const [params, setParams] = useSearchParams();
  const v = (params.get('v') ?? 'a') as VariantKey;
  const state = (params.get('state') ?? 'full') as LabState;
  const Variant = VARIANTS[v] ?? VariantA;
  const set = (k: string, val: string) => {
    const next = new URLSearchParams(params);
    next.set(k, val);
    setParams(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-[60] flex flex-wrap items-center gap-2 border-b border-dashed border-slate-400 bg-slate-100 px-3 py-1.5 text-xs text-slate-900">
        <span className="font-semibold">P1545 lab</span>
        {(Object.keys(VARIANTS) as VariantKey[]).map(k => (
          <button key={k} onClick={() => set('v', k)} className={`rounded px-2 py-0.5 ${k === v ? 'bg-slate-900 text-slate-100' : 'hover:bg-slate-200'}`}>
            {k.toUpperCase()}
          </button>
        ))}
        <span className="mx-1 opacity-50">|</span>
        <select value={state} onChange={e => set('state', e.target.value)} className="rounded border border-slate-300 bg-white px-1 py-0.5">
          {STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Variant state={state} />
    </div>
  );
}
