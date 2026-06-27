/**
 * P955 Fast-State Harness — Example Gate Fixture
 *
 * PERMANENT RENDER SUBSTRATE — NOT a throwaway prototype.
 * ---------------------------------------------------------------------------
 * This is the reference pattern for `/tree/_gate/*` fixtures. Each fixture
 * renders a REAL routed component with MOCK props and a URL-driven phase switch
 * (`?phase=`), so any gated UI state is reachable in ~1s with no auth and no DB
 * seed. The P955 deterministic gate re-renders these states on every future
 * change to the component, so fixtures under `/tree/_gate/` are MACHINE-OWNED
 * and must NOT be pruned (deleting one re-introduces the ~5-min state-reach
 * problem the harness exists to remove). This is distinct from the founder's
 * hand-built design explorations in `/tree/` root, which ARE throwaway.
 *
 * The first REAL surface-specific fixture attaches when the next UI feature
 * enters the pipeline. This example only establishes the pattern.
 *
 * Mock data uses OBVIOUSLY-FAKE values (`test@example.com`, `user-id-1234`)
 * per the P955 Security Review — never realistic production shapes.
 *
 * Convention for a real fixture:
 *   1. Import the REAL routed component (not a copy).
 *   2. Build a `PHASE_FIXTURES` map: phase name -> mock props for that state.
 *   3. Render `<RealComponent {...PHASE_FIXTURES[phase]} />`.
 *   4. Register the route in src/App.tsx under the `/tree/_gate/*` block.
 *
 * Reference: features/p955_ui_build_loop.md § Phase 1
 */

import { useSearchParams } from 'react-router-dom';

// Obviously-fake mock data — never realistic production shapes (Security Review).
const MOCK = {
  email: 'test@example.com',
  userId: 'user-id-1234',
  sessionId: 'session-id-5678',
} as const;

type Phase = 'default' | 'empty' | 'typed' | 'error';

const PHASES: Phase[] = ['default', 'empty', 'typed', 'error'];

/**
 * Placeholder "real component" stand-in. A real fixture imports the actual
 * routed component here instead. This stand-in deliberately renders a CLEAN
 * layout (a single full-width primary action, no dead disabled control) so the
 * example passes the deterministic gate — demonstrating a compliant baseline.
 */
function ExampleSurface({ phase }: { phase: Phase }) {
  return (
    <div style={{ maxWidth: '100%', padding: '1rem' }}>
      <h2>Example gated surface — phase: {phase}</h2>
      <p>
        Mock user {MOCK.email} ({MOCK.userId}), session {MOCK.sessionId}.
      </p>

      {phase === 'error' && (
        <div role="alert" style={{ color: 'crimson' }}>
          Something went wrong. Try again.
        </div>
      )}

      {phase === 'empty' && <p>No items yet.</p>}

      {phase === 'typed' && (
        <textarea
          aria-label="Draft"
          defaultValue="A typed-in draft state."
          style={{ width: '100%', minHeight: '4rem' }}
        />
      )}

      {/* Exactly one full-width primary action — the compliant baseline. */}
      <button
        className="btn-primary w-full"
        style={{ height: '48px' }}
        disabled={phase === 'empty'}
      >
        {phase === 'empty' ? 'Add your first item' : 'Continue'}
      </button>
    </div>
  );
}

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = (params.get('phase') ?? 'default') as Phase;
  const phase: Phase = PHASES.includes(requested) ? requested : 'default';

  return (
    <div>
      <nav style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', flexWrap: 'wrap' }}>
        {PHASES.map((p) => (
          <a key={p} href={`/tree/_gate/example?phase=${p}`}>
            {p}
          </a>
        ))}
      </nav>
      <ExampleSurface phase={phase} />
    </div>
  );
}

export default GateFixture;
