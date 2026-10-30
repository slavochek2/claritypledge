/**
 * P1536 Design v6, S2: one source for the nine Clarity Canvas box definitions.
 *   S2.1 the drafting prompt, the empty-box questions and the Copy prompt are byte-equal to the module, hold no box text
 *        of their own, and the module's titles equal CANVAS_BOXES;
 *   Customer Segments guidance forbids "I sell to"; Guiding values is written "X over Y, because Z";
 *   the Copy prompt names "This canvas is about" and the nine headings in order.
 * The real-model checks (S2.2 to S2.5) are not here: they need the real model and the S1-edge output schema.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANVAS_BOXES } from '../lib/canvas-boxes';
import {
  BOX_DEFINITIONS, GLOBAL_RULES, MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS, NAMING_RULE, ONE_SALE_LOOP_PLAIN, boxGuideEntry,
  copyPromptSection, emptyQuestionFor, globalRulesText,
} from '../../supabase/functions/_shared/canvas-box-definitions';
import { DRAFT_RULES, buildDraftRequest } from '../../supabase/functions/_shared/canvas-prompt';
import { questionsFor } from '../../supabase/functions/_shared/canvas-parse';
import { buildDraftReply } from '../../supabase/functions/_shared/canvas-reply';
import * as draft from '../../supabase/functions/_shared/canvas-draft';
import { BOX_TAGS, titleOf } from '../../supabase/functions/_shared/canvas-draft';
import { CANVAS_OWN_AI_PROMPT } from '../app/pages/chat/canvas-thread-copy';

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const def = (tag: string) => BOX_DEFINITIONS.find((b) => b.tag === tag)!;
const textFields = (b: (typeof BOX_DEFINITIONS)[number]) => [b.definition, b.shape, b.good, b.not, b.gap, b.empty ?? ''].filter(Boolean);

describe('S2.1 one source', () => {
  it('holds the nine boxes, titles and tags equal to CANVAS_BOXES, in order', () => {
    expect(BOX_DEFINITIONS.map((b) => ({ tag: b.tag, title: b.title }))).toEqual(CANVAS_BOXES.map((b) => ({ tag: b.tag, title: b.title })));
    expect([...BOX_TAGS]).toEqual(CANVAS_BOXES.map((b) => b.tag));
    for (const b of CANVAS_BOXES) expect(titleOf(b.tag)).toBe(b.title);
    expect(GLOBAL_RULES).toHaveLength(7);
  });

  it('every box carries every field of the spec table', () => {
    for (const b of BOX_DEFINITIONS) {
      for (const f of [b.type, b.voice, b.definition, b.shape, b.good, b.not, b.gap]) expect(f.trim().length, b.tag).toBeGreaterThan(5);
    }
  });

  it('the drafting prompt contains the global rules and each box entry byte for byte', () => {
    expect(DRAFT_RULES).toContain(globalRulesText());
    for (const b of BOX_DEFINITIONS) {
      expect(DRAFT_RULES, b.tag).toContain(boxGuideEntry(b));
      for (const f of [b.type, b.voice, b.definition, b.shape, b.good, b.not]) expect(DRAFT_RULES, `${b.tag}: ${f}`).toContain(f);
    }
    const sent = buildDraftRequest({ material: { items: [], truncated: false }, basePoints: [], baseLabel: null });
    expect(sent.systemInstruction.parts[0]!.text).toBe(DRAFT_RULES);
  });

  it('the empty-box questions are the module text: the gap question, or the empty question where the spec gives only a gap', () => {
    const all = BOX_DEFINITIONS.map((b) => b.tag);
    const asked = questionsFor(all);
    for (const b of BOX_DEFINITIONS) {
      expect(asked[b.tag], b.tag).toBe(b.empty ?? b.gap);
      expect(emptyQuestionFor(b.tag)).toBe(asked[b.tag]);
    }
    expect(Object.keys(asked)).toEqual(all);
    expect(questionsFor(['canvas:nope'])).toEqual({});
    // v6 (D13, S1.13): the empty-box questions sit under their boxes and are NOT repeated in chat, so the old assertion that the
    // reply lists "- Title: question" for each empty box is replaced by its opposite.
    const reply = buildDraftReply({ outcome: 'draft', total: 1, filledBoxes: 1, unreadable: [], droppedUnverified: 0, droppedNames: 0 });
    for (const b of BOX_DEFINITIONS.slice(1)) expect(reply, b.tag).not.toContain(asked[b.tag]!);
  });

  it('the Copy prompt contains the owner-worded rules, the one-sale-loop rule and each box section byte for byte', () => {
    expect(CANVAS_OWN_AI_PROMPT).toContain(globalRulesText('owner'));
    expect(CANVAS_OWN_AI_PROMPT).toContain(ONE_SALE_LOOP_PLAIN); // rule 7's owner wording
    for (const b of BOX_DEFINITIONS) expect(CANVAS_OWN_AI_PROMPT, b.tag).toContain(copyPromptSection(b));
  });

  it('no other source file holds box text: each definition, shape, example and question lives in the module alone', () => {
    const dirs = ['supabase/functions', 'src/app', 'src/lib'];
    const files: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(resolve(root, rel), { withFileTypes: true })) {
        const p = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && !p.endsWith('_shared/canvas-box-definitions.ts')) files.push(p);
      }
    };
    dirs.forEach(walk);
    expect(files.length).toBeGreaterThan(50); // CONTROL: the walk reaches the sources
    expect(files).toContain('supabase/functions/_shared/canvas-prompt.ts');
    expect(files).toContain('src/app/pages/chat/canvas-thread-copy.ts');
    const holders = new Map(files.map((f) => [f, read(f)]));
    for (const b of BOX_DEFINITIONS) {
      for (const f of textFields(b)) {
        const hit = [...holders].filter(([, src]) => src.includes(f)).map(([p]) => p);
        expect(hit, `${b.tag}: ${f}`).toEqual([]);
      }
    }
    for (const [p, src] of holders) expect(src, p).not.toMatch(/\bBOX_BRIEF\b|\bBOX_GUIDE\b/);
  });

  it('the module text has no em or en dash (the drafting prompt forbids them, so its own examples must not use them)', () => {
    const all = [...GLOBAL_RULES.flatMap((r) => [r.name, r.text, r.plain ?? '']), ONE_SALE_LOOP_PLAIN, ...BOX_DEFINITIONS.flatMap((b) => [b.type, b.voice, ...textFields(b)])];
    for (const t of all) expect(t).not.toMatch(/[–—]/);
    expect('a—b').toMatch(/[–—]/); // CONTROL
  });
});

describe('S2 review fixes', () => {
  const sections = CANVAS_OWN_AI_PROMPT.slice(CANVAS_OWN_AI_PROMPT.indexOf('## Customer Segments'));

  it('1. the drafting prompt shows each box\'s gap question, and the empty question where there is one; the response schema carries questions for the owner', () => {
    for (const b of BOX_DEFINITIONS) {
      expect(DRAFT_RULES, b.tag).toContain(`when the box is empty or only part is supported: ${b.gap}`);
      if (b.empty) expect(DRAFT_RULES, b.tag).toContain(`when nothing in the box is supported: ${b.empty}`);
    }
    expect(BOX_DEFINITIONS.filter((b) => b.empty).map((b) => b.tag)).toEqual(['canvas:solution']); // CONTROL: the empty branch is exercised
    const req = buildDraftRequest({ material: { items: [], truncated: false }, basePoints: [], baseLabel: null });
    // v6 (S1): the model's answer gains focus, other_canvases, scope, questions and note; `conflicts` is gone with "What I decided on my own"
    expect(Object.keys((req.generationConfig!.responseSchema as { properties: object }).properties)).toEqual(['focus', 'other_canvases', 'scope', 'actions', 'questions', 'note']);
  });

  it('2. every Copy prompt section carries its box voice, before its shape', () => {
    for (const b of BOX_DEFINITIONS) {
      const at = sections.indexOf(`## ${b.title}\n`);
      const block = sections.slice(at, sections.indexOf('\n\n', at));
      expect(block, b.tag).toContain(`\nVoice: ${b.voice}\n`);
      expect(block.indexOf('Voice: '), b.tag).toBeLessThan(block.indexOf('Shape: '));
    }
  });

  it('3. the Copy prompt bounds the output by the engine limits and says examples show the form only', () => {
    expect(MAX_POINTS_PER_BOX).toBe(draft.MAX_POINTS_PER_BOX);
    expect(MAX_STATEMENT_CHARS).toBe(draft.MAX_STATEMENT_CHARS);
    expect(CANVAS_OWN_AI_PROMPT).toContain(`up to ${draft.MAX_POINTS_PER_BOX} points, each one short sentence of at most ${draft.MAX_STATEMENT_CHARS} characters`);
    expect(CANVAS_OWN_AI_PROMPT).toContain('Examples inside a definition show the form only. Never reuse their businesses, numbers or claims.');
    expect(BOX_DEFINITIONS.some((b) => b.definition.includes('Facebook') || b.definition.includes('"Pays:"'))).toBe(true); // CONTROL: definitions do carry inline examples
  });

  it('4. the one-sale-loop rule is stated once, and the "you means me" line comes before the first box section', () => {
    expect(CANVAS_OWN_AI_PROMPT.split('Groups of people share a canvas only if').length - 1).toBe(1);
    expect(CANVAS_OWN_AI_PROMPT.split('roles in one sale').length - 1).toBe(1);
    const you = "In the definitions below, 'you' means me, the business owner.";
    expect(CANVAS_OWN_AI_PROMPT).toContain(you);
    expect(CANVAS_OWN_AI_PROMPT.indexOf(you)).toBeLessThan(CANVAS_OWN_AI_PROMPT.indexOf('## Customer Segments'));
    expect(CANVAS_OWN_AI_PROMPT.indexOf(you)).toBeGreaterThan(CANVAS_OWN_AI_PROMPT.indexOf('Rules:'));
  });

  it('5. both prompts carry the same naming rule: no private people or companies, public platforms allowed', () => {
    expect(DRAFT_RULES).toContain(NAMING_RULE);
    expect(CANVAS_OWN_AI_PROMPT).toContain(NAMING_RULE);
    expect(NAMING_RULE).toContain('Public platforms and marketplaces');
    for (const t of [DRAFT_RULES, CANVAS_OWN_AI_PROMPT]) expect(t).not.toMatch(/other people or companies|every company other than/);
    expect(def('canvas:channels').definition).toContain('Public platform names allowed'); // the definition the rule must agree with
  });
});

describe('S2 box guidance', () => {
  it('Customer Segments guidance forbids "I sell to": the box example, the rule, and the drafting prompt', () => {
    expect(def('canvas:segments').not).toContain('I sell to');
    const voice = GLOBAL_RULES.find((r) => r.name === 'Voice per box')!;
    expect(voice.text).toContain('never starts with "I", "We", "My customers" or "I sell to"');
    expect(DRAFT_RULES).toContain(voice.text);
    expect(CANVAS_OWN_AI_PROMPT).toContain(voice.text);
  });

  it('Guiding values is written "X over Y, because Z"', () => {
    const v = def('canvas:love');
    expect(v.shape).toBe('"X over Y, because Z."');
    expect(v.gap).toContain("'X over Y, because Z'");
    expect(v.good).toMatch(/^"\S.* over .*, because .*\."$/);
    expect(DRAFT_RULES).toContain('X over Y, because Z');
  });

  it('the Copy prompt says "This canvas is about" and lists the nine headings in order', () => {
    expect(CANVAS_OWN_AI_PROMPT).toContain('This canvas is about <group>.');
    const headings = CANVAS_OWN_AI_PROMPT.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
    expect(headings).toEqual(CANVAS_BOXES.map((b) => b.title));
    const at = CANVAS_BOXES.map((b) => CANVAS_OWN_AI_PROMPT.indexOf(`\n## ${b.title}\n`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(CANVAS_OWN_AI_PROMPT.indexOf('This canvas is about <group>.\n\n## Customer Segments')).toBeGreaterThan(0);
  });

  it('the Copy prompt is ONE text: the rules come first, then the nine sections', () => {
    expect(CANVAS_OWN_AI_PROMPT.indexOf('Rules:')).toBeLessThan(CANVAS_OWN_AI_PROMPT.indexOf('## Customer Segments'));
    expect(CANVAS_OWN_AI_PROMPT).toContain('one section per canvas');
    expect(CANVAS_OWN_AI_PROMPT).toContain('my main focus first');
  });
});
