/**
 * P1653 TEMPORARY measurement (canvas-measure.ts): `actionsOf` counts the actions the model returned BEFORE any filtering, straight from the raw response,
 * and `parsedLine` is the one-line log statement. parseDraft itself is untouched; the parse suites pin that.
 */
import { describe, expect, it } from 'vitest';
import { parseDraft } from '../../supabase/functions/_shared/canvas-parse';
import { actionsOf, parsedLine } from '../../supabase/functions/_shared/canvas-measure';
import { assembleMaterial } from '../../supabase/functions/_shared/canvas-source';

const M = assembleMaterial({ note: 'We sell bookkeeping to cafe owners with one to three shops.', links: [], files: [] });
const gemini = (payload: unknown) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
});
const response = (actions: unknown[]) => gemini({ scope: ['canvas:segments'], actions, conflicts: [] });
const ctx = { material: M, basePoints: [], baseLabel: null, otherNames: [] };
const parse = (resp: unknown, over: Partial<Parameters<typeof parseDraft>[1]> = {}) => parseDraft(resp, { ...ctx, ...over });
const RUN = '030ea9b7-a964-4742-a7df-ee88c512cd39';

describe('P1653 actionsOf', () => {
  it('counts actions the parser skips (unknown action, bad box, drop of an unknown point, a non-object)', () => {
    const skipped = [
      { action: 'teleport', box: 'canvas:segments', statement: 'x' },
      { action: 'new', box: 'not-a-box', statement: 'Cafe owners with shops', quote: 'cafe owners' },
      { action: 'drop', point_id: 'no-such-point', why: 'x' },
      'not an object',
    ];
    const resp = response(skipped);
    expect(actionsOf(resp)).toEqual({ rawActions: 4, actionsForm: 'actions' });
    const out = parse(resp);
    expect(out.ok && out.total).toBe(0); // the parser wrote none of the four
  });

  it('counts a written action and a skipped one together, independent of what the parser keeps', () => {
    const written = { action: 'new', box: 'canvas:segments', statement: 'Cafe owners with one to three shops', story: '', quote: 'bookkeeping to cafe owners with one to three shops' };
    const resp = response([written, { action: 'teleport' }]);
    expect(actionsOf(resp).rawActions).toBe(2);
    const out = parse(resp);
    expect(out.ok && out.actions).toEqual([{ action: 'new', box: 'canvas:segments', statement: written.statement, story: null }]);
  });

  it('is 0 for an empty list, and does not depend on the parse context (a context with sections cannot change it)', () => {
    expect(actionsOf(response([]))).toEqual({ rawActions: 0, actionsForm: 'actions' });
    const resp = response([{ action: 'teleport' }, { action: 'teleport' }]);
    expect(actionsOf(resp).rawActions).toBe(2);
    const withSections = parse(resp, { sections: ['Cafe books', 'Pet shop'] });
    expect(withSections.ok).toBe(true); // the sections only add focus and offers; the measured count is read from the response alone
  });

  it('labels the form: an object where an array belongs is invalid, a missing key is none, no JSON is unreadable', () => {
    expect(actionsOf(gemini({ scope: [], actions: { not: 'an array' } }))).toEqual({ rawActions: 0, actionsForm: 'invalid' });
    expect(actionsOf(gemini({ scope: [] }))).toEqual({ rawActions: 0, actionsForm: 'none' });
    expect(actionsOf({})).toEqual({ rawActions: null, actionsForm: 'unreadable' });
  });
});

describe('P1653 parsedLine (the one-line measurement statement)', () => {
  it('is exactly one line with the run id on it, and the JSON after the prefix parses to counts only', () => {
    const resp = response([{ action: 'teleport' }, { action: 'new', box: 'canvas:segments', statement: 'Cafe owners', story: 'secret story text', quote: 'cafe owners' }]);
    const line = parsedLine(RUN, parse(resp), resp);
    expect(line.includes('\n')).toBe(false);
    expect(line.startsWith('canvas-draft: parsed {')).toBe(true);
    expect(line.includes(RUN)).toBe(true);
    const json = JSON.parse(line.slice('canvas-draft: parsed '.length));
    expect(json).toMatchObject({ run_id: RUN, ok: true, rawActions: 2, actionsForm: 'actions' });
    expect(Object.values(json).every((v) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && (v === RUN || v === 'actions')))).toBe(true);
    expect(line).not.toMatch(/secret story text|Cafe owners/);
  });

  it('a failure is one line too and carries the code and the form', () => {
    const resp = gemini({ scope: [] });
    const line = parsedLine(RUN, parse(resp), resp);
    expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(line.slice('canvas-draft: parsed '.length))).toEqual({ run_id: RUN, ok: false, code: 'unparsable', rawActions: 0, actionsForm: 'none' });
  });
});
