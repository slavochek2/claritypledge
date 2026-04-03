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
  const driftBlockEnd = source.indexOf('const serverHasUpdate', driftBlockStart);
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
const UI_AFFECTING_FIELDS = [
  'celebrationAcknowledgedBy',
  'celebrationAcknowledgedByCreator',
  'celebrationAcknowledgedByJoiner',
  'checkerName',
  'checkerRating',
  'checkerSubmitted',
  'checksCount',
  'clarificationPhase',
  'explainBackDone',
  'livePositions',
  'ratingInitiatedBy',
  'ratingPhase',
  'responderRating',
  'responderSubmitted',
  'roleSwitchNegotiation',
  'selectedContentTitle',
  'selectedStoryData',
  'selectedStoryId',
].sort();

describe('Drift detection completeness', () => {
  it('covers all UI-affecting live_state fields', () => {
    const driftChecked = extractDriftCheckedFields();
    const missing = UI_AFFECTING_FIELDS.filter(f => !driftChecked.includes(f));

    expect(
      missing,
      `These UI-affecting fields are NOT in drift detection: ${missing.join(', ')}. ` +
      `Add drift checks to clarity-live-page.tsx or remove from UI_AFFECTING_FIELDS if no longer UI-affecting.`
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
});
