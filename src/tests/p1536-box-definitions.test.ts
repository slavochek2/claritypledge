/**
 * P1536 Design v6, S2: one source for the nine Clarity Canvas box definitions.
 *   S2.1 the drafting prompt, the empty-box questions and the Copy prompt are byte-equal to the module, hold no box text
 *        of their own, and the module's titles equal CANVAS_BOXES;
 *   Customer Segments guidance forbids "I sell to"; Guiding values is written "X over Y" with no reason inside;
 *   the Copy prompt names "This canvas is about" and the nine headings in order.
 * The real-model checks (S2.2 to S2.5) are not here: they need the real model and the S1-edge output schema.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANVAS_BOXES } from '../lib/canvas-boxes';
import {
  BOX_DEFINITIONS, CANVAS_MATERIAL_RULE, GLOBAL_RULES, LEAD_POINT_RULE, MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS, NAMING_RULE, ONE_SALE_LOOP_PLAIN, RANKED_BOXES, ROUTING_RULE,
  THIRD_PERSON_RULE, boxGuideEntry, copyPromptSection, emptyQuestionFor, globalRulesText,
} from '../../supabase/functions/_shared/canvas-box-definitions';
import { DRAFT_RULES, ROUND_RULES, buildDraftRequest } from '../../supabase/functions/_shared/canvas-prompt';
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
    // CONTROL: the empty branch is exercised (P1658 revision 2: four ranked boxes ask for the core fact and the ranking together when empty;
    // the challenge box's gap already does, so it has none, fix round 3)
    expect(BOX_DEFINITIONS.filter((b) => b.empty).map((b) => b.tag)).toEqual(['canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:revenue', 'canvas:metrics']);
    const req = buildDraftRequest({ material: { items: [], truncated: false }, basePoints: [], baseLabel: null });
    // v6 (S1): the model's answer gains focus (S5: and focus_reason), other_canvases, scope, questions and note; `conflicts` is gone with "What I decided on my own"
    expect(Object.keys((req.generationConfig!.responseSchema as { properties: object }).properties)).toEqual(['focus', 'focus_reason', 'other_canvases', 'scope', 'actions', 'questions', 'note']);
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

  it('Guiding values is written "X over Y", with no reason inside', () => {
    const v = def('canvas:love');
    expect(v.shape).toBe('"X over Y[, even when <what it costs>]."');
    expect(v.gap).toContain("'X over Y'");
    expect(v.good).toMatch(/^"\S.* over .*\."$/);
    expect(v.good).not.toMatch(/\bbecause\b/i);
    expect(DRAFT_RULES).toContain('"X over Y[, even when <what it costs>]."');
  });

  it('P1658 revision 2: every box is third person, stance boxes say "The business", no good example carries a reason', () => {
    for (const tag of ['canvas:channels', 'canvas:world-needs']) expect(def(tag).good.startsWith('"The business '), tag).toBe(true);
    expect(def('canvas:solution').shape).not.toContain('The business does not <Y>'); // v9: the stance form left Solution (it held v8.md's rules, not steps)
    for (const b of BOX_DEFINITIONS) expect(b.good, b.tag).not.toMatch(/\bbecause\b/i);
  });

  // The text of a box that reaches a prompt and shapes a point (voice, definition, shape, good example), with box titles taken out:
  // "Hypotheses I've falsified" is a label, not point text. Definitions may say "you" (the owner); a point never says I/we/my/our/us/me.
  const PRONOUN = /\b(?:I|we|my|our|us|me)\b/i;
  const TITLES = new RegExp(BOX_DEFINITIONS.map((b) => b.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const pronounFields = (b: (typeof BOX_DEFINITIONS)[number]) =>
    (['voice', 'definition', 'shape', 'good'] as const).filter((f) => PRONOUN.test(b[f].replace(TITLES, ''))).map((f) => `${b.tag}.${f}`);

  it('P1658 revision 2: no voice, definition, shape or good example of any box says "I", "we", "my", "our", "us" or "me"', () => {
    expect(BOX_DEFINITIONS.flatMap(pronounFields)).toEqual([]);
    // CONTROL (gate 7d): the check is fed a REAL entry with its shape put back in the first person, and must name it
    const sol = def('canvas:solution');
    const mutated = { ...sol, shape: sol.shape.replace('"<step 1>,', '"I <step 1>,') };
    expect(mutated.shape).not.toBe(sol.shape);
    expect(pronounFields(mutated)).toEqual(['canvas:solution.shape']);
    const seg = def('canvas:segments');
    expect(pronounFields({ ...seg, good: seg.good.replace('The first customers are', 'Our first customers are') })).toEqual(['canvas:segments.good']);
  });

  /**
   * A ranked shape is a plain sentence (v9, no label): `Open with "<lead>" when grounded; then "<other>"`. The lead is the
   * text before that separator; a ranking word left after the <a | b> choice slots are taken out is hard-coded. "Grounded", not "the owner's
   * words": the shape reaches the owner's own Copy prompt, which says "owner" only in its "'you' means me" line (review round 4).
   */
  const LEAD_SEP = ' when grounded; then ';
  const leadOfShape = (shape: string) => shape.slice(0, shape.indexOf(LEAD_SEP));
  const bareRanking = (shape: string) => /\b(?:best|biggest)\b/i.test(leadOfShape(shape).replace(/<[^<>]*\|[^<>]*>/g, ''));

  it('P1658 revision 2: each ranked box opens with a lead point that names an alternative; the rest have no lead', () => {
    expect([...RANKED_BOXES]).toEqual(['canvas:segments', 'canvas:problem', 'canvas:revenue', 'canvas:metrics', 'canvas:good-at']);
    for (const b of BOX_DEFINITIONS) {
      const ranked = (RANKED_BOXES as readonly string[]).includes(b.tag);
      expect(b.shape.startsWith('Open with "'), b.tag).toBe(ranked);
      expect(b.shape.includes(LEAD_SEP), b.tag).toBe(ranked);
      if (!ranked) continue;
      const lead = leadOfShape(b.shape);
      expect(lead, b.tag).toMatch(/\b(best|biggest|first|next)\b/);
      expect(b.good, b.tag).toMatch(/^"The (first|biggest|offer to sell first|next milestone)\b[^"]*, ahead of /);
    }
  });

  /** A lead names its alternative through the contrast slot, so the dropped form (", not <Y>") is in every template the model copies. */
  const hasContrastSlot = (shape: string) => /, <ahead of\|not> <[^<>]+>/.test(leadOfShape(shape));

  it('P1658 fix round 3: every lead except the milestone writes its contrast as the slot <ahead of|not>, never a bare "ahead of"', () => {
    for (const tag of RANKED_BOXES.filter((t) => t !== 'canvas:metrics')) {
      expect(hasContrastSlot(def(tag).shape), tag).toBe(true);
      expect(leadOfShape(def(tag).shape).replace('<ahead of|not>', ''), tag).not.toMatch(/\bahead of\b/);
    }
    // CONTROL (gate 7d): a real lead shape with the slot written back as the bare "ahead of" fails it
    const seg = def('canvas:segments').shape;
    const mutated = seg.replace('<ahead of|not>', 'ahead of');
    expect(mutated).not.toBe(seg);
    expect(hasContrastSlot(mutated)).toBe(false);
  });

  /** A milestone lead's contrast is "ahead of" only: a later goal is never rejected. */
  const milestoneLeadOk = (shape: string) => { const lead = leadOfShape(shape); return /, ahead of <later goal>\."/.test(lead) && !/\bnot\b/.test(lead); };

  it('P1658 v8: the milestone lead never uses "not" (a later goal comes after; it is not turned down)', () => {
    expect(milestoneLeadOk(def('canvas:metrics').shape)).toBe(true);
    // CONTROL (gate 7d): the real milestone shape with the round-3 slot put back fails it
    const mutated = def('canvas:metrics').shape.replace('ahead of <later goal>', '<ahead of|not> <later goal>');
    expect(mutated).not.toBe(def('canvas:metrics').shape);
    expect(milestoneLeadOk(mutated)).toBe(false);
  });

  /** Segments names who the customer is: its definition and shape never speak of the problem, its trigger, pain or cost (that is Problem). */
  const segmentsSpeaksOfProblem = (b: { definition: string; shape: string }) => /\b(problem|trigger|pain|cost)\b/i.test(`${b.definition} ${b.shape}`);

  it('P1658 v8: Customer Segments is defined by who the customer is, never by the problem', () => {
    const seg = def('canvas:segments');
    expect(segmentsSpeaksOfProblem(seg)).toBe(false);
    for (const v of ['a role', 'industry', 'company size', 'place', 'age, life stage', 'values', 'attitudes', 'what they buy or use today']) expect(seg.definition, v).toContain(v);
    expect(seg.not).toContain('(a problem and its trigger: those go in Problem)');
    // CONTROL (gate 7d): the real entry with the old definition and shape put back fails it
    expect(segmentsSpeaksOfProblem({ ...seg, definition: seg.definition.replace('Who the customers are:', 'The specific people who have the problem and pay (or will):') })).toBe(true);
    expect(segmentsSpeaksOfProblem({ ...seg, shape: seg.shape.replace('<role + two qualifiers>', '<role + qualifier> who <do X today> <when trigger>') })).toBe(true);
  });

  /**
   * The routing rule's map (its first sentence) names the five customer-facing boxes, in canvas order. v9 adds a second sentence that
   * names the three model boxes again, so the probe reads the map only (else the control below cannot fail).
   */
  const routesAllFive = (text: string) => {
    const names = ['Customer Segments', 'Problem', 'Solution', 'Go-to-market strategy', 'Offers & Pricing'];
    const map = text.slice(0, text.indexOf('. ') < 0 ? text.length : text.indexOf('. '));
    const at = names.map((n) => map.indexOf(n));
    return at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]!);
  };

  it('P1658 v8: a box never holds another box\'s point; the agent gets the map, the Copy prompt the founder\'s sentence', () => {
    expect(ROUTING_RULE.text.startsWith('A box never holds another box\'s point:')).toBe(true);
    expect(routesAllFive(ROUTING_RULE.text)).toBe(true);
    // v9 extends the founder's sentence with the two state destinations (spec: "within the word cap, the Copy prompt"); its opening stays
    expect(ROUTING_RULE.plain!.startsWith('A heading never holds another heading\'s point')).toBe(true);
    expect(DRAFT_RULES).toContain(`For all boxes:\n${ROUTING_RULE.text}\n`);
    expect(ROUND_RULES).toContain(`For all boxes:\n${ROUTING_RULE.text}\n`);
    expect(CANVAS_OWN_AI_PROMPT).toContain(`- ${ROUTING_RULE.plain}\n`);
    expect(GLOBAL_RULES.map((r) => r.name)).not.toContain(ROUTING_RULE.name); // a shared rule, not an eighth global rule
    // CONTROL (gate 7d): the real rule text with one box taken out of the map fails it
    const mutated = ROUTING_RULE.text.replace(', what is sold and for how much in Offers & Pricing', '');
    expect(mutated).not.toBe(ROUTING_RULE.text);
    expect(routesAllFive(mutated)).toBe(false);
  });

  it('P1658 v8e: canvas-shaped material is placed by the routing rule, not its own headings; the agent gets it, the Copy prompt does not', () => {
    const follows = (rules: string) => rules.includes(`${ROUTING_RULE.text}\n${CANVAS_MATERIAL_RULE}\n`);
    expect(CANVAS_MATERIAL_RULE).toContain('its headings are not evidence of the box');
    expect(CANVAS_MATERIAL_RULE).toContain('keeping its quote as before');
    expect(follows(DRAFT_RULES)).toBe(true);
    expect(follows(ROUND_RULES)).toBe(true);
    expect(CANVAS_OWN_AI_PROMPT).not.toContain(CANVAS_MATERIAL_RULE);
    expect(CANVAS_OWN_AI_PROMPT).not.toContain('not evidence of the box');
    // CONTROL (gate 7d): the real DRAFT_RULES with the line taken out fails the check
    const mutated = DRAFT_RULES.replace(`${CANVAS_MATERIAL_RULE}\n`, '');
    expect(mutated).not.toBe(DRAFT_RULES);
    expect(follows(mutated)).toBe(false);
  });

  /** Solution is the customer's path in steps: no package, price, unit or channel in its shape. */
  const solutionIsSteps = (shape: string) => /"<step 1>, then <step 2>/.test(shape) && !/\b(price|package|per <unit>|channel|offer)\b/i.test(shape);

  it('P1658 v8: Solution is up to five steps from the problem to what the customer wants, with no package, price or channel', () => {
    const sol = def('canvas:solution');
    expect(solutionIsSteps(sol.shape)).toBe(true);
    expect(sol.definition).toContain('up to five steps of what happens for them');
    expect(sol.definition).toContain('Not the package, price or channel.');
    expect(sol.shape).not.toContain('<planned / piloted / live>'); // v9: the status slot is gone (the intended model carries no status)
    expect(sol.good.split(/,| then /).length).toBeGreaterThanOrEqual(4); // the example is itself a path of several steps
    expect(sol.good).not.toMatch(/\bbaht\b|\bper\b/);
    // CONTROL (gate 7d): the real shape back in v7's form, and with a price slipped in, both fail it
    expect(solutionIsSteps('"The business <does X>[, not <ruled-out Y>]." Status: planned / piloted / live.')).toBe(false);
    const priced = sol.shape.replace('<step 2>', '<step 2>; <price + currency>');
    expect(priced).not.toBe(sol.shape);
    expect(solutionIsSteps(priced)).toBe(false);
  });

  /** A Problem lead carries A with its cost, the contrast, and B and the obstacle. */
  const problemLeadWhole = (shape: string) => /<A \+ cost>, <ahead of\|not> <other problem>; they want <B>, but <obstacle>\."/.test(leadOfShape(shape));

  it('P1658 v8: the Problem lead keeps A + cost, B and the obstacle', () => {
    expect(problemLeadWhole(def('canvas:problem').shape)).toBe(true);
    expect(def('canvas:problem').good).toMatch(/^"The biggest problem[^"]*, ahead of [^"]*; they want [^"]*, but [^"]*\."/);
    // CONTROL (gate 7d): the real shape with v7's lead (A against another problem only) fails it
    const mutated = def('canvas:problem').shape.replace(`; they want <B>, but <obstacle>."${LEAD_SEP}`, `."${LEAD_SEP}`);
    expect(mutated).not.toBe(def('canvas:problem').shape);
    expect(problemLeadWhole(mutated)).toBe(false);
  });

  /** A template label ("Lead:", "Others:", "Other:") anywhere in a text the model reads. The sale-role prefixes (Pays:, Uses:, Approves:) are point forms, not labels. */
  const hasTemplateLabel = (text: string) => /\b(?:Lead|Others?):/.test(text);

  it('P1658 v9: no template carries a label; "Lead:" appears nowhere in either prompt, and the lead rule names the five boxes', () => {
    // v8.md wrote "Lead:" into four points although the rule forbade it: the shapes began `Lead: "…" Others: "…"` and the model copies a template.
    for (const b of BOX_DEFINITIONS) expect(hasTemplateLabel(b.shape), b.tag).toBe(false);
    for (const b of BOX_DEFINITIONS) expect(b.good, b.tag).not.toMatch(/^"Lead:/);
    for (const [name, t] of [['DRAFT_RULES', DRAFT_RULES], ['ROUND_RULES', ROUND_RULES], ['Copy prompt', CANVAS_OWN_AI_PROMPT]] as const) {
      expect(t, name).not.toContain('Lead:');
      expect(hasTemplateLabel(t), name).toBe(false);
    }
    for (const t of [LEAD_POINT_RULE.text, LEAD_POINT_RULE.plain!]) expect(t).not.toMatch(/never write "?Lead/i); // the "never write it" line only primed it
    const named = ['Customer Segments', 'Problem', 'Offers & Pricing', 'My next milestone', 'My current biggest challenge'];
    for (const n of named) expect(LEAD_POINT_RULE.text, n).toContain(n);
    expect(LEAD_POINT_RULE.text).toContain('My next milestone\'s lead is always "ahead of <Y>"'); // the milestone restriction stays
    expect(LEAD_POINT_RULE.plain).toContain('An "Open with" point'); // keyed on the shapes' own words, which only the five ranked shapes carry
    // CONTROL (gate 7d): the real Segments shape and the real Copy prompt with v8's label put back both fail it
    const seg = def('canvas:segments').shape;
    const mutated = seg.replace('Open with "', 'Lead: "').replace(LEAD_SEP, ' Others: ');
    expect(mutated).not.toBe(seg);
    expect(hasTemplateLabel(mutated)).toBe(true);
    const prompt = CANVAS_OWN_AI_PROMPT.replace(copyPromptSection(def('canvas:segments')), copyPromptSection({ ...def('canvas:segments'), shape: mutated }));
    expect(prompt).not.toBe(CANVAS_OWN_AI_PROMPT);
    expect(prompt).toContain('Lead:');
  });

  it('P1658 fix round: no lead shape hard-codes "best" or "biggest" outside a <first|biggest> slot', () => {
    for (const tag of RANKED_BOXES) expect(bareRanking(def(tag).shape), tag).toBe(false);
    expect(leadOfShape(def('canvas:segments').shape)).toContain('<first|best>');
    expect(leadOfShape(def('canvas:problem').shape)).toContain('<first|biggest>');
    expect(leadOfShape(def('canvas:good-at').shape)).toContain('<chosen|biggest>'); // "the first challenge" reads oddly; the box title says biggest
    // CONTROL (gate 7d): the real Problem and challenge shapes with the slot written back as the bare word fail it
    for (const [tag, slot] of [['canvas:problem', '<first|biggest>'], ['canvas:good-at', '<chosen|biggest>']] as const) {
      const mutated = def(tag).shape.replace(slot, 'biggest');
      expect(mutated, tag).not.toBe(def(tag).shape);
      expect(bareRanking(mutated), tag).toBe(true);
    }
  });

  it('P1658 fix round: a later option is "ahead of", a dropped one ", not"; the lead and third-person rules agree', () => {
    expect(LEAD_POINT_RULE.text).toContain('"ahead of <Y>" for an option that comes later, ", not <Y>" for one the owner dropped or turned down');
    expect(LEAD_POINT_RULE.plain).toContain('the option it beats ("not" only if I dropped or turned it down; milestones: never)');
    expect(LEAD_POINT_RULE.text).toContain('My next milestone\'s lead is always "ahead of <Y>": a later goal is never turned down.');
    expect(THIRD_PERSON_RULE.text).toContain('Write ", not <Y>" only when the owner\'s words drop, turn down or deny Y; a later option is "ahead of <Y>".');
    expect(LEAD_POINT_RULE.text).not.toMatch(/dropped or turned down counts/); // the round-1 wording that put a dropped option behind "ahead of"
  });

  it('P1658 fix round: no rule forbids "will not"; v9: the third-person rule no longer carries the "a plan stays a plan" or stance examples', () => {
    const all = [LEAD_POINT_RULE.text, LEAD_POINT_RULE.plain!, THIRD_PERSON_RULE.text, THIRD_PERSON_RULE.plain!, ...BOX_DEFINITIONS.flatMap((b) => [b.voice, b.definition, b.shape])].join('\n');
    expect(all).not.toMatch(/never "will not"/);
    // v9 (spec: superseded) the model boxes state the intended model, so the plan example went; the "does not" stance example went with
    // Solution's stance form. The rule's function stays: no pronoun, "the business" never its name, ", not <Y>" only on a drop or denial.
    expect(THIRD_PERSON_RULE.text).not.toMatch(/a plan stays a plan|plans not to|does not sell/);
    expect(THIRD_PERSON_RULE.text).toContain('When the business is the one acting, write "the business", never the business\'s or the owner\'s name.');
  });

  /** The quoted words a rule bans: the "never …" sentence's quoted words, up to its end. */
  const bannedWords = (rule: string) => {
    const at = rule.indexOf('never ');
    return [...rule.slice(at, rule.indexOf('.', at)).matchAll(/"(\w+)"/g)].map((m) => m[1]);
  };

  it('P1658 fix round 3: "the business" is for the actor; the Copy prompt line bans the same words as the agent rule', () => {
    expect(THIRD_PERSON_RULE.text).toContain('When the business is the one acting, write "the business"');
    expect(THIRD_PERSON_RULE.text).not.toMatch(/Its subject is "the business"/);
    expect(bannedWords(THIRD_PERSON_RULE.text)).toEqual(['I', 'we', 'my', 'our', 'us', 'me', 'you']);
    expect(bannedWords(THIRD_PERSON_RULE.plain!)).toEqual(bannedWords(THIRD_PERSON_RULE.text));
    // CONTROL (gate 7d): the real plain line with one banned word taken out no longer matches the agent rule
    const mutated = THIRD_PERSON_RULE.plain!.replace('"my", ', '');
    expect(mutated).not.toBe(THIRD_PERSON_RULE.plain);
    expect(bannedWords(mutated)).not.toEqual(bannedWords(THIRD_PERSON_RULE.text));
  });

  it('P1658 fix round: the challenge box writes no unstated cause; "probably" is only in what it rejects', () => {
    const c = def('canvas:good-at');
    for (const f of [c.voice, c.definition, c.shape, c.good]) expect(f).not.toMatch(/\bprobably\b|\bI think\b/);
    expect(c.definition).toContain('The obstacle only as you state it.');
    expect(c.not).toContain('(a cause the owner never stated)');
  });

  it('P1658 fix round: role points drop "are the customers"; the Copy prompt names who the canvas is for; the shared rules stand apart from the last box', () => {
    // v8: the exception sits in the one sentence that names the role points, so it can never read as a second order next to "are the customers"
    expect(def('canvas:segments').definition).toContain('Roles in one sale get one point each, starting "Pays:", "Uses:", "Approves:", without "are the customers".');
    expect(def('canvas:segments').shape).toMatch(/are the customers\[, not <ruled-out lookalike>\]\."$/);
    expect(CANVAS_OWN_AI_PROMPT).toContain('"This canvas is about <group>." naming who it is for.');
    const block = `\n\nFor all boxes:\n${ROUTING_RULE.text}\n${CANVAS_MATERIAL_RULE}\n${LEAD_POINT_RULE.text}\n${THIRD_PERSON_RULE.text}\n`;
    expect(DRAFT_RULES).toContain(`${boxGuideEntry(BOX_DEFINITIONS[BOX_DEFINITIONS.length - 1]!)}${block}`);
    expect(ROUND_RULES).toContain(block);
  });

  it('P1658 revision 2: the milestone and offer leads keep their parts; a milestone\'s "if missed" is only one the owner stated', () => {
    expect(def('canvas:metrics').shape).toContain('(target)');
    expect(def('canvas:metrics').shape).toContain('[; if missed, <stated change>]');
    expect(def('canvas:metrics').good).toContain('(target), ahead of');
    const offer = def('canvas:revenue');
    // the price sits after the contrast clause, never inside it, and the lead keeps every part of the terms (v9: no <state> slot after them)
    expect(offer.shape).toContain('<ahead of|not> <other offer>; <price + currency> per <unit> <cadence>."');
    expect(offer.good).toMatch(/, ahead of [^;\d]+; [\d,]+ baht per shop per month\."/);
  });

  it('P1658 revision 2: a ranked box\'s gap asks for the missing part AND the ranking; its empty question asks the core fact with the ranking', () => {
    // the part each box's gap must still ask for (boxGuideEntry shows the gap "when the box is empty or only part is supported")
    const MISSING: Record<string, RegExp> = {
      // v9: the offer's gap asks what the customer gets and the terms, no longer "has anyone paid it yet" (status leaves Offers & Pricing)
      'canvas:segments': /\btoday\b/, 'canvas:problem': /\bcost\b.*\bwant\b.*\bstops\b/, 'canvas:revenue': /\bget\b.*\bcost\b.*\bper what unit\b.*\bhow often\b/,
      'canvas:metrics': /\bnumber\b.*\bdate\b/, 'canvas:good-at': /\bwhere are you now\b.*\bin the way\b/i,
    };
    for (const tag of RANKED_BOXES) {
      const b = def(tag);
      expect(b.gap, tag).toMatch(MISSING[tag]!);
      expect(b.gap, tag).toMatch(/\b(best|most|biggest|first|next)\b/);
      expect(b.gap, tag).toMatch(/\b(after|other)\b/);
      expect(emptyQuestionFor(tag), tag).toMatch(/\b(best|most|biggest|first)\b|comes after/);
    }
    for (const tag of ['canvas:problem', 'canvas:good-at']) expect(emptyQuestionFor(tag), tag).toContain('ahead of which other');
    // fix round 3: the challenge box's gap already asks the core fact and the ranking, so it has no separate, identical empty question
    const c = def('canvas:good-at');
    expect(c.empty).toBeUndefined();
    expect(emptyQuestionFor('canvas:good-at')).toBe(c.gap);
  });

  it('P1658 fix round 3: Guiding values keeps "Both X and Y are good." (out of revision-2 scope)', () => {
    expect(def('canvas:love').definition).toContain('two good things conflict. Both X and Y are good. Business culture');
  });

  it('P1658 revision 2: the lead rule and the third-person rule reach both prompts, the Copy prompt in the owner\'s words', () => {
    expect(DRAFT_RULES).toContain(LEAD_POINT_RULE.text);
    expect(DRAFT_RULES).toContain(THIRD_PERSON_RULE.text);
    expect(CANVAS_OWN_AI_PROMPT).toContain(LEAD_POINT_RULE.plain!);
    expect(CANVAS_OWN_AI_PROMPT).toContain(THIRD_PERSON_RULE.plain!);
    expect(THIRD_PERSON_RULE.plain).toMatch(/^Rules say "I" and "you"; a point never says "I"/);
    expect(THIRD_PERSON_RULE.plain).toContain('"the business"');
    expect(LEAD_POINT_RULE.text).toMatch(/only if the owner ranked/);
    expect(LEAD_POINT_RULE.plain).toMatch(/only if I ranked/);
    expect(`${LEAD_POINT_RULE.text} ${THIRD_PERSON_RULE.text}`).not.toMatch(/the owner believes/i);
  });

  it('P1658 review: Offers & Pricing has no "not" form, and Problem does not rank problems by cost', () => {
    const r = def('canvas:revenue');
    expect(r.shape).not.toContain(', not ');
    expect(r.good).not.toContain(', not ');
    const p = def('canvas:problem');
    for (const s of [p.shape, p.good, p.definition]) expect(s).not.toContain('costliest');
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

  it('P1658 v8f: the Problem "then" form keeps B and the obstacle; every good example point fits MAX_STATEMENT_CHARS; Segments in canvas-prompt asks values, not feelings', () => {
    expect(def('canvas:problem').shape).toContain(`${LEAD_SEP}"For <customer> the problem is <A + cost>[, not <ruled-out problem>]; they want <B>, but <obstacle>."`); // v9: "then", no "Others:" label
    const points = BOX_DEFINITIONS.flatMap((b) => [...b.good.matchAll(/"([^"]+)"/g)].map((m) => ({ tag: b.tag, p: m[1] })));
    expect(points.length).toBeGreaterThan(BOX_DEFINITIONS.length - 1);
    for (const { tag, p } of points) expect(p.length, `${tag}: ${p}`).toBeLessThanOrEqual(MAX_STATEMENT_CHARS);
    expect(Math.max(...points.map((x) => x.p.length))).toBeLessThanOrEqual(220); // the reviewed bound, tighter than the cap
    expect(DRAFT_RULES).toContain('their values or attitudes; never how they feel about the problem');
  });
});

/**
 * P1658 revision 3 / v9 (founder, 2026-11-23, reading his own Copy-prompt run v8.md): Solution, Offers & Pricing and Go-to-market describe
 * the intended model with no status; Solution is steps only; an offer names what is bought; Go-to-market holds no timing; up to 3 falsified
 * expectations; no label in any template; the Copy prompt stays within 1100 words.
 */
describe('P1658 revision 3 / v9', () => {
  const STATE_NAMES = ['My next milestone', 'My current biggest challenge', 'Hypotheses I\'ve falsified'];
  const MODEL_NAMES = ['Solution', 'Offers & Pricing', 'Go-to-market strategy'];
  const MODEL = ['canvas:solution', 'canvas:revenue', 'canvas:channels'];
  const rule4 = () => GLOBAL_RULES.find((r) => r.name === 'Statement type per box')!;
  /** A status word or a traction count, as v8.md wrote them into the model boxes ("planned, no session run", "considered, none sold"). */
  const STATUS = /\b(?:planned|piloted|live|untested|considering|considered|not tried yet|none sold|quoted|paid by|pay it|being drafted|so far)\b|<state>|\b\d+ of (?:its|the) \d+\b/i;
  /** The fields of a box that tell the model what to write (its `not` examples show status as the thing to avoid). */
  const statusIn = (b: (typeof BOX_DEFINITIONS)[number]) => [b.definition, b.shape, b.good, b.gap, b.empty ?? ''].filter((f) => STATUS.test(f));
  const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

  it('a. "Statement type per box" is scoped to the three state boxes in both wordings; the other six global rules and ONE_SALE_LOOP_PLAIN are byte for byte as before', () => {
    const r = rule4();
    for (const t of [r.text, r.plain!]) {
      expect(t.startsWith(`Only ${STATE_NAMES[0]}, ${STATE_NAMES[1]} and ${STATE_NAMES[2]} carry state`), t).toBe(true);
      for (const n of MODEL_NAMES) expect(t, n).toContain(n);
      expect(t).not.toMatch(/modality/);
    }
    expect(globalRulesText()).toContain(`4. Statement type per box. ${r.text}`);
    expect(globalRulesText('owner')).toContain(`4. Statement type per box. ${r.plain}`);
    // the six other rules and rule 7's owner wording, fingerprinted from HEAD 38ae2addf before v9 (only rule 4 may change)
    const keep = GLOBAL_RULES.filter((x) => x.name !== r.name);
    expect(keep).toHaveLength(6);
    expect(hashOf([keep, ONE_SALE_LOOP_PLAIN])).toBe('1928db35d70c8292d40359376521d7a923a9e59b21859935e8b3d48faa7dac5f');
    // CONTROL (gate 7d): one added space in a real kept rule changes the fingerprint
    expect(hashOf([keep.map((x, i) => (i === 0 ? { ...x, text: `${x.text} ` } : x)), ONE_SALE_LOOP_PLAIN])).not.toBe('1928db35d70c8292d40359376521d7a923a9e59b21859935e8b3d48faa7dac5f');
  });

  it('b. the three model boxes carry no status or traction count; both prompts frame them as the intended model; where the business stands goes to the challenge and the milestone', () => {
    for (const tag of MODEL) expect(statusIn(def(tag)), tag).toEqual([]);
    const r = rule4();
    expect(r.text).toContain('describe the business model the owner intends, in the present tense, so a sentence there means "this is the model", never "this is happening"');
    expect(r.text).toContain('no status ("planned", "untested", "considering", "not tried yet", "none sold", "live", "piloted", "quoted", "paid by N") and no traction counts');
    expect(r.plain).toContain('are the model I intend, in the present tense: no status (planned, untested, not tried yet, none sold) or traction counts');
    expect(DRAFT_RULES).toContain(r.text);
    expect(CANVAS_OWN_AI_PROMPT).toContain(r.plain!);
    // "Keep how sure" and "Offers & Pricing" in DRAFT_RULES no longer pull status into the model boxes
    expect(DRAFT_RULES).toContain('their present tense means "this is the model", never "this is happening", so they take no status word and no traction count');
    expect(DRAFT_RULES).not.toMatch(/with its state/);
    expect(ROUTING_RULE.text).toContain('where the business stands now and what blocks it in My current biggest challenge');
    expect(ROUTING_RULE.text).toContain('the next customer result and the later goals it comes ahead of in My next milestone');
    // CONTROL (gate 7d): the real boxes with v8's status put back each fail it
    const sol = def('canvas:solution');
    expect(statusIn({ ...sol, shape: sol.shape.replace(']."', ']; <planned / piloted / live>."') })).toHaveLength(1);
    const off = def('canvas:revenue');
    expect(statusIn({ ...off, good: off.good.replace('per month."', 'per month; 6 shops pay it today."') })).toHaveLength(1);
    const gtm = def('canvas:channels');
    expect(statusIn({ ...gtm, shape: gtm.shape.replace(']."', `]; <result so far, or 'not tried yet'>."`) })).toHaveLength(1);
  });

  /** A "The business does not <Y>" stance anywhere the Solution box tells the model what to write. */
  const solutionStance = (b: (typeof BOX_DEFINITIONS)[number]) => [b.definition, b.shape, b.good, b.gap, b.empty ?? ''].some((f) => /\bdoes not\b/.test(f));

  it('c. Solution holds only the customer\'s steps: no "does not" stance; a kept rule goes to Guiding values only as "X over Y"; a disclaimer\'s outcome stays as a step', () => {
    const sol = def('canvas:solution');
    expect(solutionStance(sol)).toBe(false);
    expect(sol.definition).toContain('No rule the business keeps; a disclaimer\'s claimed outcome is a step.');
    expect(sol.not).toContain('(a rule the business keeps: Guiding values only as "X over Y", else left out)');
    expect(sol.not).toContain('(a disclaimer: its outcome is a step');
    // CONTROL (gate 7d): the real shape with v8's stance form put back fails it
    expect(solutionStance({ ...sol, shape: `${sol.shape} A stance: "The business does not <Y>."` })).toBe(true);
  });

  /** Every quoted template of the offer shape names what is bought before its price. */
  const deliverableFirst = (shape: string) => {
    const t = [...shape.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    return t.length === 2 && t.every((x) => x.includes('<what is bought>') && x.indexOf('<what is bought>') < x.indexOf('<price + currency>'));
  };

  it('d. Offers & Pricing names what the customer gets, then the price per unit per period ("once" is one); a price with no deliverable fails; no state slot', () => {
    const o = def('canvas:revenue');
    expect(deliverableFirst(o.shape)).toBe(true);
    expect(o.definition).toBe('What the customer gets, then its price per unit per period or once.');
    expect(o.shape).not.toContain('<state>');
    expect(o.good).toMatch(/ once\."$/);
    expect(o.not).toContain('(names no deliverable: what is set up?)');
    expect(o.gap).toMatch(/^What does the customer get, /);
    expect(DRAFT_RULES).toContain('every point names what the customer gets before its price');
    expect(DRAFT_RULES).toContain('when they state no price, write what is bought alone. Either way the box\'s question asks for the missing terms.');
    expect(DRAFT_RULES).not.toContain('write the price alone');
    // CONTROL (gate 7d): the real shape with v8's offer-name template ("Install: 4,500 EUR once" names nothing bought) fails it
    const v8 = o.shape.replace('then "<what is bought>:', 'then "<offer>:');
    expect(v8).not.toBe(o.shape);
    expect(deliverableFirst(v8)).toBe(false);
  });

  /** A timing, waiting or result slot in a Go-to-market shape. */
  const gtmTiming = (s: string) => /\b(?:until|once|when|wait|waits|waiting|after|before|first action|so far|not tried yet)\b/i.test(s);

  it('e. Go-to-market is where and how the business reaches customers: a grounded exclusion stays, timing leaves, and the routing rule names both destinations in both prompts', () => {
    const g = def('canvas:channels');
    expect(gtmTiming(g.shape)).toBe(false);
    expect(g.shape).toContain('[, not <ruled-out path>]');
    expect(g.good).toContain(', not through paid ads');
    expect(g.definition).toContain('Where and how the business reaches this segment. No timing, waiting or conditions.');
    expect(ROUTING_RULE.text).toContain('a current blocker goes to My current biggest challenge, a sequence of customer goals the owner states goes to My next milestone as "ahead of", and other timing is left out');
    expect(ROUTING_RULE.plain).toContain('blockers belong under My current biggest challenge, an order of goals under My next milestone');
    expect(DRAFT_RULES).toContain(ROUTING_RULE.text);
    expect(CANVAS_OWN_AI_PROMPT).toContain(`- ${ROUTING_RULE.plain}\n`);
    // CONTROL (gate 7d): v8's shape fails it
    expect(gtmTiming(`"The business <first action> in <place>[, not <ruled-out path>]; <result so far, or 'not tried yet'>."`)).toBe(true);
  });

  it('f. Hypotheses I\'ve falsified holds up to 3 falsified expectations: contrary evidence, the change only when stated, a selection rule, no sample size', () => {
    const h = def('canvas:world-needs');
    expect(MAX_POINTS_PER_BOX).toBe(3);
    expect(h.definition).toContain('Up to 3 expectations that evidence proved wrong (a test, event or prospect conversation).');
    expect(h.definition).toContain('If more: those you weigh most, else those that most changed the current focus.');
    expect(h.definition).toContain('Without such evidence, a ruled-out option is a "not" point in its box.');
    expect(h.shape).toBe('"The business expected <X>; <contrary evidence>[; so it <stated change>]."');
    expect(ONE_SALE_LOOP_PLAIN).toContain('An old direction I dropped goes under Hypotheses I\'ve falsified'); // whole directions still land here (Copy prompt)
    expect(DRAFT_RULES).toContain('Hypotheses I\'ve falsified: a whole direction the owner dropped (a customer group, an offer, a way of selling) is one of its falsified expectations'); // and for the agent, whose rule 7 does not say it
    expect(ROUND_RULES).toContain('a whole direction the owner dropped');
    const goods = [...h.good.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(goods.length).toBeGreaterThanOrEqual(2);
    expect(goods.some((p) => !/\bso\b/.test(p))).toBe(true); // an example with no change: the change is written only when stated
    // CONTROL (gate 7d): v8's shape, which demanded a sample and a change, is not the shape
    expect(h.shape).not.toBe('"The business expected <X>; <test + sample>; <result>; so it <change>."');
    expect(h.shape).not.toMatch(/sample/);
  });

  it('i. no gap or example asks for or shows status or traction in the three model boxes (the superseded v8 strings are gone from the module and both prompts)', () => {
    const gone = ['has anyone paid it yet', 'result so far', '\'not tried yet\'', '4 of its 6 clients came via', '6 shops pay it today', 'live for 6 cafés', 'is each planned, piloted or live'];
    const all = [DRAFT_RULES, ROUND_RULES, CANVAS_OWN_AI_PROMPT, ...BOX_DEFINITIONS.flatMap((b) => [b.type, b.voice, ...textFields(b)])].join('\n');
    for (const s of gone) expect(all, s).not.toContain(s);
    expect(all).toContain(def('canvas:revenue').gap); // CONTROL: the probe reads text the module really holds
  });

  it('j. reasons stay out through one Copy-prompt line, and no box definition repeats "Leave out why"', () => {
    expect(CANVAS_OWN_AI_PROMPT).toContain('\n- A point never says why.\n');
    for (const b of BOX_DEFINITIONS) expect(b.definition, b.tag).not.toMatch(/Leave out why/);
    expect(DRAFT_RULES).toContain('Write the point alone: no explanation or reasoning behind it.'); // the drafting agent's own line
  });

  it('the Copy prompt stays within its 1100-word cap', () => {
    const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
    expect(words(CANVAS_OWN_AI_PROMPT)).toBeLessThanOrEqual(1100);
    expect(words(`${CANVAS_OWN_AI_PROMPT} one`)).toBe(words(CANVAS_OWN_AI_PROMPT) + 1); // CONTROL: the counter counts
  });

  it('the Copy prompt is in the owner\'s voice: "owner" only in its "\'you\' means me" line (review round 4)', () => {
    const ownerLines = (t: string) => t.split('\n').filter((l) => /\bowner/i.test(l));
    expect(ownerLines(CANVAS_OWN_AI_PROMPT)).toEqual(["In the definitions below, 'you' means me, the business owner."]);
    // CONTROL: the v9 draft wording of a ranked shape is caught
    expect(ownerLines(`${CANVAS_OWN_AI_PROMPT}\nShape: Open with "x" when the owner's words ground it; then "y".`)).toHaveLength(2);
  });

  it('the three model boxes are framed as the intended model in the present tense, in both prompts', () => {
    expect(CANVAS_OWN_AI_PROMPT).toContain('are the model I intend, in the present tense: no status');
    expect(DRAFT_RULES).toContain('their present tense means "this is the model", never "this is happening"');
  });
});

