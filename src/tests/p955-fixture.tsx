/**
 * P952 Defect Fixture
 *
 * Renders the exact defect pattern that P952 shipped:
 *   - Two competing full-width primary buttons in the same view
 *   - A disabled submit button in the initial/empty state
 *
 * Used by p955-gate.test.ts to prove the gate's assertion functions fire.
 * This is a test-only artifact — it never ships in the production bundle.
 *
 * IMPORTANT: All values here are obviously fake per the security review rule
 * (mock data must use fake identifiers, never realistic production shapes).
 */

import React from 'react';

/**
 * Simulates the P952 session-complete view defect:
 * - "Finish session" (btn-primary w-full) — the intended CTA
 * - "Start new session" (btn-primary w-full) — the competing secondary action
 *   that was incorrectly elevated to primary style
 * - A disabled submit button rendered in the initial empty state
 *
 * Mock data uses obviously-fake values per Security Review requirement.
 */
export function P952DefectFixture(): React.ReactElement {
  // Obviously fake values — never realistic production shapes
  const fakeSessionId = 'session-id-1234';
  const fakeUserId = 'user-id-5678';
  const fakeEmail = 'test@example.com';

  return (
    <div data-testid="p952-defect-fixture" data-session={fakeSessionId} data-user={fakeUserId}>
      <h2>Session complete — {fakeEmail}</h2>

      {/* DEFECT 1: Two competing full-width primary buttons */}
      <button className="btn-primary w-full" style={{ height: '48px' }}>
        Finish session
      </button>
      <button className="btn-primary w-full" style={{ height: '48px' }}>
        Start new session
      </button>

      {/* DEFECT 2: Disabled submit button in empty/initial state */}
      <form>
        <input
          type="text"
          placeholder="Enter feedback"
          defaultValue=""
          aria-label="Feedback"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled
          aria-disabled="true"
          style={{ height: '44px' }}
        >
          Submit feedback
        </button>
      </form>
    </div>
  );
}
