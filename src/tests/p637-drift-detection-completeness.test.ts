/**
 * P637: Verifies every live_state field that affects UI rendering is covered
 * by the drift detection polling fallback in clarity-live-page.tsx.
 *
 * When you add a new field to live_state that changes what users see,
 * add it to UI_AFFECTING_FIELDS. If you forget to also add it to
 * drift detection, this test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Extract drift-checked fields by reading the source code directly.
// This is more robust than maintaining a manual list — if someone adds
// a drift check variable, this test picks it up automatically.
function extractDriftCheckedFields(): string[] {
  const source = readFileSync(
    resolve(__dirname, '../app/pages/clarity-live-page.tsx'),
    'utf-8'
  );

  // Only scan the drift detection block (between "Detect liveState drift" and "serverHasUpdate")
  const driftBlockStart = source.indexOf('Detect liveState drift');
  if (driftBlockStart === -1) {
    throw new Error(
      'Cannot find "Detect liveState drift" comment in clarity-live-page.tsx. ' +
      'Was the drift detection block moved or renamed?'
    );
  }
  const driftBlockEnd = source.indexOf('const serverHasUpdate', driftBlockStart);
  if (driftBlockEnd === -1) {
    throw new Error(
      'Cannot find "const serverHasUpdate" after drift block start. ' +
      'Was the drift detection block restructured?'
    );
  }
  const driftBlock = source.slice(driftBlockStart, driftBlockEnd);

  // Match patterns like: serverState.fieldName
  const fieldPattern = /serverState\.(\w+)/g;
  const fields = new Set<string>();
  let match;

  while ((match = fieldPattern.exec(driftBlock)) !== null) {
    fields.add(match[1]);
  }

  return Array.from(fields).sort();
}

// Fields that affect what users SEE — if these change and the partner
// doesn't get the update, they see stale/wrong UI.
// Add new fields here as they're introduced to live_state.
//
// P644: expanded to cover all UI-affecting fields from LiveSessionState,
// including Free mode (P562), role determination, and explain-back state.
const UI_AFFECTING_FIELDS = [
  // V7 check/prove model
  'ratingPhase',
  'checkerName',
  'checkerIsCreator',
  'proverName',
  'checkerRating',
  'responderRating',
  'checkerSubmitted',
  'responderSubmitted',
  'explainBackRound',
  'explainBackRatings',
  'skippedBy',
  'explainBackDone',
  'speakerSawExplainBackDone',
  'clarificationPhase',
  'celebrationAcknowledgedByCreator',
  'celebrationAcknowledgedByJoiner',
  'celebrationAcknowledgedBy',
  'perspectiveRequestedBy',
  'roleSwitchNegotiation',

  // Content selection
  'selectedStoryId',
  'selectedStoryData',
  'selectedContentTitle',
  'sessionHistory',
  'ratingInitiatedBy',

  // Positions
  'livePositions',
  'livePositionsCreator',
  'livePositionsJoiner',

  // Counts
  'checksCount',

  // Free mode (P562)
  'sessionMode',
  'freePhase',
  'freeSliderCreator',
  'freeSliderJoiner',
  'freeRounds',
  'freeRerating',
].sort();

// P644: Fields known to be missing from drift detection. Each must have a reason.
// When drift detection is added for a field, remove it from here — the test will
// enforce that it stays in both UI_AFFECTING_FIELDS and the drift block.
// TODO: File a follow-up bug to add drift detection for these fields.
const KNOWN_UNCOVERED: Record<string, string> = {
  checkerIsCreator: 'Role determination — rarely changes mid-session',
  proverName: 'Listener-initiated check — different flow, needs investigation',
  explainBackRound: 'Round counter — UI impact is secondary to explainBackDone',
  explainBackRatings: 'History array — display only, not interactive state',
  skippedBy: 'Toast notification — transient, not persistent UI state',
  speakerSawExplainBackDone: 'Speaker-side flag — prevents drawer flicker',
  perspectiveRequestedBy: 'Role swap dialog — triggers on partner side',
  sessionHistory: 'Journey display — grows monotonically, low drift risk',
  livePositionsCreator: 'P562 replacement for nested livePositions',
  livePositionsJoiner: 'P562 replacement for nested livePositions',
  sessionMode: 'Free mode switch — entire UI changes, critical to add',
  freePhase: 'Free mode phase transitions — no drift coverage at all',
  freeRounds: 'Journey display — grows monotonically',
  freeRerating: 'Speaker re-rated belief — transient per round',
};

describe('Drift detection completeness', () => {
  it('covers all UI-affecting live_state fields (excluding known uncovered)', () => {
    const driftChecked = extractDriftCheckedFields();
    const knownUncoveredFields = Object.keys(KNOWN_UNCOVERED);
    const shouldBeCovered = UI_AFFECTING_FIELDS.filter(f => !knownUncoveredFields.includes(f));
    const missing = shouldBeCovered.filter(f => !driftChecked.includes(f));

    expect(
      missing,
      `These UI-affecting fields are NOT in drift detection: ${missing.join(', ')}. ` +
      `Add drift checks to clarity-live-page.tsx or add to KNOWN_UNCOVERED with a reason.`
    ).toEqual([]);
  });

  it('known uncovered fields are still actually uncovered', () => {
    // When drift detection is added for a field, this test fails —
    // prompting removal from KNOWN_UNCOVERED (keeping the list accurate).
    const driftChecked = extractDriftCheckedFields();
    const nowCovered = Object.keys(KNOWN_UNCOVERED).filter(f => driftChecked.includes(f));

    expect(
      nowCovered,
      `These fields are in KNOWN_UNCOVERED but now HAVE drift detection: ${nowCovered.join(', ')}. ` +
      `Remove them from KNOWN_UNCOVERED.`
    ).toEqual([]);
  });

  it('does not check fields that are not in the UI_AFFECTING_FIELDS list', () => {
    const driftChecked = extractDriftCheckedFields();
    const extra = driftChecked.filter(f => !UI_AFFECTING_FIELDS.includes(f));

    expect(
      extra,
      `These fields are drift-checked but not in UI_AFFECTING_FIELDS: ${extra.join(', ')}. ` +
      `Add them to UI_AFFECTING_FIELDS to keep lists in sync.`
    ).toEqual([]);
  });

  it('reports known uncovered fields count for visibility', () => {
    // Not a failure — just makes the gap visible in test output.
    // When this reaches 0, remove the KNOWN_UNCOVERED mechanism entirely.
    const count = Object.keys(KNOWN_UNCOVERED).length;
    console.log(`[P644] ${count} UI-affecting fields known to lack drift detection coverage.`);
    expect(count).toBeGreaterThanOrEqual(0); // always passes
  });
});
