/**
 * P750: Drift-poll must detect partner slider changes (missed-Realtime catch-up).
 *
 * When Supabase Realtime drops a `freeSliderCreator`/`freeSliderJoiner` event
 * (Brave shield, tab throttling, flaky WSS), the 1 s drift-poll fallback is the
 * only channel that can bring the client back in sync. Before this fix, the
 * comparator in clarity-live-page.tsx did not compare slider fields — so the
 * poll found no drift and local state stayed stale until session restart.
 *
 * Sibling to P741 (in-flight merge race — already fixed). P741 covered the
 * Realtime handler path; this canary covers the drift-poll fallback path.
 *
 * Canary: this test FAILS on current code (before the fix adds
 * freeSliderCreatorDrift / freeSliderJoinerDrift to serverHasUpdate) and
 * PASSES once both fields appear in the drift comparator block.
 *
 * Technique mirrors p637-drift-detection-completeness.test.ts: static source
 * inspection of the drift block. Direct behavioral testing would require
 * extracting the comparator to a pure function; the plan flagged that as
 * optional cleanup, not blocking.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readLivePageSource(): string {
  return readFileSync(
    resolve(__dirname, '../app/pages/clarity-live-page.tsx'),
    'utf-8',
  );
}

function locateDriftBlock(source: string): { start: number; end: number } {
  const start = source.indexOf('Detect liveState drift');
  if (start === -1) {
    throw new Error(
      'Cannot find "Detect liveState drift" in clarity-live-page.tsx — was the block renamed?',
    );
  }
  const end = source.indexOf('const serverHasUpdate', start);
  if (end === -1) {
    throw new Error(
      'Cannot find "const serverHasUpdate" after drift block start — was the block restructured?',
    );
  }
  return { start, end };
}

function extractDriftCheckedFields(): string[] {
  const source = readLivePageSource();
  const { start, end } = locateDriftBlock(source);
  const block = source.slice(start, end);

  const pattern = /serverState\.(\w+)/g;
  const fields = new Set<string>();
  for (const match of block.matchAll(pattern)) {
    fields.add(match[1]);
  }
  return Array.from(fields);
}

function extractServerHasUpdateExpression(): string {
  const source = readLivePageSource();
  const { end } = locateDriftBlock(source);
  const lineEnd = source.indexOf('\n', end);
  return source.slice(end, lineEnd === -1 ? source.length : lineEnd);
}

describe('P750: drift-poll slider catch-up', () => {
  // Code-shape layer: the drift variables must EXIST in the comparator block
  // (otherwise they cannot contribute to serverHasUpdate).
  it('freeSliderCreator is compared in drift-poll so missed Realtime events get caught', () => {
    const driftChecked = extractDriftCheckedFields();
    expect(
      driftChecked,
      'freeSliderCreator must be in the drift-poll comparator — without it, a missed Realtime slider event leaves local state stale until session restart (P750).',
    ).toContain('freeSliderCreator');
  });

  it('freeSliderJoiner is compared in drift-poll so missed Realtime events get caught', () => {
    const driftChecked = extractDriftCheckedFields();
    expect(
      driftChecked,
      'freeSliderJoiner must be in the drift-poll comparator — without it, a missed Realtime slider event leaves local state stale until session restart (P750).',
    ).toContain('freeSliderJoiner');
  });

  // Wiring layer: the drift variables must be ORed into serverHasUpdate.
  // Without this assertion, a regression that declares the drift var but forgets
  // to OR it into serverHasUpdate would pass the code-shape checks above yet
  // reintroduce the original P750 bug silently.
  it('freeSliderCreatorDrift is included in serverHasUpdate', () => {
    expect(
      extractServerHasUpdateExpression(),
      'freeSliderCreatorDrift must be ORed into serverHasUpdate — otherwise the drift var is dead code and the bug returns (P750).',
    ).toContain('freeSliderCreatorDrift');
  });

  it('freeSliderJoinerDrift is included in serverHasUpdate', () => {
    expect(
      extractServerHasUpdateExpression(),
      'freeSliderJoinerDrift must be ORed into serverHasUpdate — otherwise the drift var is dead code and the bug returns (P750).',
    ).toContain('freeSliderJoinerDrift');
  });
});
