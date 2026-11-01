/**
 * @file p1536-s2-eval-rules.test.ts
 * @description P1536 S2.2 and §3b Q1: the rules the real-model eval applies to every point the drafting agent writes, as one pure checker
 * (supabase/functions/_shared/canvas-eval-rules.ts), proven here on LABELLED fixtures: each rule has a known-good and a known-bad case, and the Q1 rule
 * has a case per dimension. The real-model eval itself is NOT run here (it needs the model and a budget); this proves the checker that will judge it.
 *
 * Q1: a Customer Segments point needs a role or title, plus at least two of: industry, company size, demographics, psychographics.
 * The detector is a small, documented lexicon: it flags points for the eval's report (and a human read); it is not a language model.
 */
import { describe, expect, it } from 'vitest';
import {
  checkEvalPoints, classifySegment, isGuidingValueShape, numbersNotInMaterial, segmentSpecificity, startsWithBannedOpening,
} from '../../supabase/functions/_shared/canvas-eval-rules';
import { BOX_DEFINITIONS, boxGuideEntry, copyPromptSection } from '../../supabase/functions/_shared/canvas-box-definitions';
import { DRAFT_RULES } from '../../supabase/functions/_shared/canvas-prompt';
import { CANVAS_OWN_AI_PROMPT } from '../app/pages/chat/canvas-thread-copy';

type Dim = 'industry' | 'size' | 'demographics' | 'psychographics';
interface Fixture { name: string; text: string; role: boolean; dims: Dim[]; ok: boolean }

/** Labelled: `role` and `dims` are what a person reading the point finds in it; `ok` is the rule's verdict (role + at least two dimensions). */
const SEGMENTS: Fixture[] = [
  // known-good: every dimension appears in at least one passing point
  { name: 'role + industry + size', text: 'Owners of 1-3 independent cafés who do their own books after closing', role: true, dims: ['industry', 'size'], ok: true },
  { name: 'role + industry + demographics', text: 'Head chefs at restaurants in Tallinn who are in their 30s', role: true, dims: ['industry', 'demographics'], ok: true },
  { name: 'role + size + psychographics', text: 'Operations managers at companies of 20 to 200 staff who distrust new tools', role: true, dims: ['size', 'psychographics'], ok: true },
  { name: 'role + industry + psychographics', text: 'Practice managers at dental clinics who worry about missed appointments', role: true, dims: ['industry', 'psychographics'], ok: true },
  { name: 'role + demographics + psychographics', text: 'Freelance designers aged 25-35 who prefer fixed monthly pricing', role: true, dims: ['demographics', 'psychographics'], ok: true },
  { name: 'a roles-in-one-sale prefix is not part of the point', text: 'Pays: finance directors at logistics companies with 50 employees', role: true, dims: ['industry', 'size'], ok: true },
  // known-bad: missing role
  { name: 'no role (only dimensions)', text: 'Companies of 20 to 200 staff in logistics in Tallinn', role: false, dims: ['industry', 'size', 'demographics'], ok: false },
  { name: 'a category word is no role', text: 'Small businesses who value speed', role: false, dims: ['psychographics'], ok: false },
  // known-bad: a role with fewer than two other dimensions, one case per dimension
  { name: 'role only', text: 'Owners who need better bookkeeping', role: true, dims: [], ok: false },
  { name: 'role + industry only', text: 'Bookkeepers at cafés', role: true, dims: ['industry'], ok: false },
  { name: 'role + size only', text: 'Managers at companies with 50 employees', role: true, dims: ['size'], ok: false },
  { name: 'role + demographics only', text: 'Teachers aged 30-40', role: true, dims: ['demographics'], ok: false },
  { name: 'role + psychographics only', text: 'Founders who value speed', role: true, dims: ['psychographics'], ok: false },
];

describe('Q1: the Customer Segments specificity rule', () => {
  it.each(SEGMENTS)('$name', ({ text, role, dims, ok }) => {
    const c = classifySegment(text);
    expect(c.role, 'role').toBe(role);
    expect([...c.dimensions].sort(), 'dimensions').toEqual([...dims].sort());
    expect(segmentSpecificity(text).ok, `verdict for: ${text}`).toBe(ok);
  });

  it('CONTROL: the labelled set holds every dimension in a passing case and every failure kind (probe is not blind both ways)', () => {
    const passing = SEGMENTS.filter((f) => f.ok);
    for (const d of ['industry', 'size', 'demographics', 'psychographics'] as const) expect(passing.some((f) => f.dims.includes(d)), d).toBe(true);
    expect(SEGMENTS.some((f) => !f.ok && !f.role)).toBe(true);
    for (const d of ['industry', 'size', 'demographics', 'psychographics'] as const) expect(SEGMENTS.some((f) => !f.ok && f.role && f.dims.length === 1 && f.dims[0] === d), d).toBe(true);
    expect(SEGMENTS.some((f) => !f.ok && f.role && f.dims.length === 0)).toBe(true);
  });

  it('names what is missing, so the eval report says why', () => {
    expect(segmentSpecificity('Companies of 20 to 200 staff in logistics').missing).toBe('role');
    expect(segmentSpecificity('Founders who value speed').missing).toBe('dimensions');
    expect(segmentSpecificity('Owners of 1-3 independent cafés who do their own books after closing').missing).toBeNull();
  });

  it('the spec\'s own good example for the box passes (the definition does not contradict its rule)', () => {
    const good = BOX_DEFINITIONS.find((b) => b.tag === 'canvas:segments')!.good.replace(/^"|"$/g, '');
    expect(segmentSpecificity(good).ok).toBe(true);
  });
});

describe('Q1: the one module carries the rule into the prompt, the Copy prompt and the box guide', () => {
  const seg = BOX_DEFINITIONS.find((b) => b.tag === 'canvas:segments')!;
  const RULE = 'Each point needs a role or title, plus at least two of: industry, company size, demographics, psychographics.';

  it('the Customer Segments definition says it, once', () => {
    expect(seg.definition).toContain(RULE);
    expect(seg.definition.split(RULE)).toHaveLength(2);
  });

  it('the drafting prompt and the Copy prompt carry it byte for byte (S2.1), and no other box does', () => {
    expect(DRAFT_RULES).toContain(boxGuideEntry(seg));
    expect(DRAFT_RULES).toContain(RULE);
    expect(CANVAS_OWN_AI_PROMPT).toContain(copyPromptSection(seg));
    expect(CANVAS_OWN_AI_PROMPT).toContain(RULE);
    for (const b of BOX_DEFINITIONS.filter((x) => x.tag !== seg.tag)) expect(b.definition).not.toContain('psychographics');
  });
});

describe('S2.2: the three existing rules, each with a known-good and a known-bad case', () => {
  it('no Customer Segments point starts with "I", "We", "My customers" or "I sell to"', () => {
    for (const bad of ['I sell to small businesses', 'We help cafés', 'My customers are cafés', 'I run a bakery', 'we serve owners']) expect(startsWithBannedOpening(bad), bad).toBe(true);
    for (const good of ['Owners of 1-3 independent cafés', 'Pays: finance directors', 'Independent bakers', 'Weavers in Tartu']) expect(startsWithBannedOpening(good), good).toBe(false);
  });

  it('every Guiding values point matches "X over Y, because Z"', () => {
    expect(isGuidingValueShape('Intellectual honesty over winning the argument, because decisions built on hidden misunderstandings fail later.')).toBe(true);
    for (const bad of ['Integrity and customer focus.', 'I keep weekends for family.', 'Honesty over winning.', 'Honesty, because it matters.']) expect(isGuidingValueShape(bad), bad).toBe(false);
  });

  it('every number in a point appears in the material', () => {
    const material = 'I sell monthly books to 6 shops for 2,500 baht. Two shops left in March 2027. I aim for 10 cafés.';
    expect(numbersNotInMaterial('Monthly books: 2,500 baht per shop; 6 shops pay this today.', material)).toEqual([]);
    expect(numbersNotInMaterial('I aim for 10 cafés paying by March 2027', material)).toEqual([]);
    expect(numbersNotInMaterial('Monthly books: 3,000 baht per shop; 9 shops pay.', material)).toEqual(['3,000', '9']);
  });

  it('checkEvalPoints reports each violation with its rule and box, and nothing for clean points', () => {
    const material = 'Owners of 2 cafés in Tallinn, in their 30s, pay 40 euros.';
    const clean = checkEvalPoints([
      { box: 'canvas:segments', text: 'Owners of 2 cafés in Tallinn who are in their 30s' },
      { box: 'canvas:love', text: 'Honesty over speed, because trust compounds.' },
    ], material);
    expect(clean).toEqual([]);
    const dirty = checkEvalPoints([
      { box: 'canvas:segments', text: 'I sell to small businesses' },
      { box: 'canvas:segments', text: 'Cafés' },
      { box: 'canvas:love', text: 'Integrity.' },
      { box: 'canvas:revenue', text: '99 euros per month' },
    ], material);
    expect(dirty.map((v) => `${v.box}:${v.rule}`)).toEqual([
      'canvas:segments:voice', 'canvas:segments:segment-specificity', 'canvas:segments:segment-specificity', 'canvas:love:values-shape', 'canvas:revenue:number-grounding',
    ]);
  });
});
