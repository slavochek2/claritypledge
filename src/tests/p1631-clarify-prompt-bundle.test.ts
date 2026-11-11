/**
 * P1631 D5: the Clarify prompt has ONE source of truth. The generated bundle the edge function imports must equal a fresh build of
 * prepare.md + story-point-model.md + the live adapter; this fails when a source changes and nobody rebuilt.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain .mjs build script, no types
import { buildClarifyPromptFile, OUT, SOURCES } from '../../scripts/build-clarify-prompt.mjs';

const ROOT = join(__dirname, '..', '..');

describe('P1631 clarify prompt bundle', () => {
  it('the generated file equals a fresh build of its sources', () => {
    expect(readFileSync(join(ROOT, OUT), 'utf8')).toBe(buildClarifyPromptFile());
  });
  it('carries all three sources, the adapter last so its overrides win, and no skill front matter', async () => {
    const { CLARIFY_SYSTEM_PROMPT } = await import('../../supabase/functions/clarify-draft/clarify-prompt.generated');
    expect(SOURCES).toHaveLength(3);
    const adapter = readFileSync(join(ROOT, SOURCES[2]), 'utf8').trim();
    expect(CLARIFY_SYSTEM_PROMPT.trim().endsWith(adapter)).toBe(true);
    expect(CLARIFY_SYSTEM_PROMPT).toContain('The Story / Point Model');
    expect(CLARIFY_SYSTEM_PROMPT).toContain('The approved axis is sharpenable');
    expect(CLARIFY_SYSTEM_PROMPT.startsWith('---')).toBe(false);
    expect(CLARIFY_SYSTEM_PROMPT).not.toContain('when_to_use:');
  });
  it('CONTROL: a changed source is detected as stale', () => {
    const fresh = buildClarifyPromptFile();
    expect(fresh.replace('The Story / Point Model', 'The Story / Point Model!')).not.toBe(readFileSync(join(ROOT, OUT), 'utf8'));
  });
});
