/**
 * @file p798-jtu-min-height.test.ts
 * @description Canary: JourneyToUnderstanding outer container must NOT apply
 * min-h-[180px] — the constant creates visible blank space below round rows
 * when only 1-2 rounds are displayed.
 *
 * FAILS before fix (JOURNEY_MIN_HEIGHT is defined and applied).
 * PASSES after fix (constant removed, no min-height on outer container).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC_PATH = resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('p798: JtU card must not apply fixed min-height', () => {
  it('JOURNEY_MIN_HEIGHT constant is not present in live-mode-view (deleted after fix)', () => {
    expect(src).not.toMatch(/JOURNEY_MIN_HEIGHT/);
  });

  it('outer JtU container does not apply min-h-[180px]', () => {
    expect(src).not.toMatch(/min-h-\[180px\]/);
  });
});
