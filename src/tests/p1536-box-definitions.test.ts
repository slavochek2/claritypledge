/**
 * P1536 Design v6, S2: one source for the nine Clarity Canvas box definitions.
 *   S2.1 the drafting prompt, the empty-box questions and the Copy prompt are byte-equal to the module, hold no box text
 *        of their own, and the module's titles equal CANVAS_BOXES;
 *   Customer Segments guidance forbids "I sell to"; Guiding values is written "X over Y" with no reason inside;
 *   the Copy prompt names "This canvas is about" and the nine headings in order.
 * The real-model checks (S2.2 to S2.5) are not here: they need the real model and the S1-edge output schema.
 */
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
    expect(def('canvas:solution').shape).toContain('A stance: "The business does not <Y>."'); // v8: Solution's good example is the steps, its stance form stays
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
    const mutated = { ...sol, shape: sol.shape.replace('"The business does not <Y>."', '"I do not <Y>."') };
    expect(mutated.shape).not.toBe(sol.shape);
    expect(pronounFields(mutated)).toEqual(['canvas:solution.shape']);
    const seg = def('canvas:segments');
    expect(pronounFields({ ...seg, good: seg.good.replace('The first customers are', 'Our first customers are') })).toEqual(['canvas:segments.good']);
  });

  /** A lead shape's text with its <a | b> choice slots taken out: a ranking word left after that is hard-coded. */
  const leadOfShape = (shape: string) => shape.slice(0, shape.indexOf(' Others: '));
  const bareRanking = (shape: string) => /\b(?:best|biggest)\b/i.test(leadOfShape(shape).replace(/<[^<>]*\|[^<>]*>/g, ''));

  it('P1658 revision 2: each ranked box opens with a lead point that names an alternative; the rest have no lead', () => {
    expect([...RANKED_BOXES]).toEqual(['canvas:segments', 'canvas:problem', 'canvas:revenue', 'canvas:metrics', 'canvas:good-at']);
    for (const b of BOX_DEFINITIONS) {
      const ranked = (RANKED_BOXES as readonly string[]).includes(b.tag);
      expect(b.shape.startsWith('Lead: "'), b.tag).toBe(ranked);
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

  /** The routing rule names the five customer-facing boxes, in canvas order. */
  const routesAllFive = (text: string) => {
    const names = ['Customer Segments', 'Problem', 'Solution', 'Go-to-market strategy', 'Offers & Pricing'];
    const at = names.map((n) => text.indexOf(n));
    return at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]!);
  };

  it('P1658 v8: a box never holds another box\'s point; the agent gets the map, the Copy prompt the founder\'s sentence', () => {
    expect(ROUTING_RULE.text.startsWith('A box never holds another box\'s point:')).toBe(true);
    expect(routesAllFive(ROUTING_RULE.text)).toBe(true);
    expect(ROUTING_RULE.plain).toBe('A heading never holds another heading\'s point.');
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
    expect(CANVAS_MATERIAL_RULE).toContain('quoting the owner\'s sentence as before');
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
    expect(sol.shape).toContain('<planned / piloted / live>');
    expect(sol.good.split(/,| then /).length).toBeGreaterThanOrEqual(4); // the example is itself a path of several steps
    expect(sol.good).not.toMatch(/\bbaht\b|\bper\b/);
    // CONTROL (gate 7d): the real shape back in v7's form, and with a price slipped in, both fail it
    expect(solutionIsSteps('"The business <does X>[, not <ruled-out Y>]." Status: planned / piloted / live.')).toBe(false);
    expect(solutionIsSteps(sol.shape.replace('<planned / piloted / live>', '<price + currency>; <planned / piloted / live>'))).toBe(false);
  });

  /** A Problem lead carries A with its cost, the contrast, and B and the obstacle. */
  const problemLeadWhole = (shape: string) => /<A \+ cost>, <ahead of\|not> <other problem>; they want <B>, but <obstacle>\."/.test(leadOfShape(shape));

  it('P1658 v8: the Problem lead keeps A + cost, B and the obstacle', () => {
    expect(problemLeadWhole(def('canvas:problem').shape)).toBe(true);
    expect(def('canvas:problem').good).toMatch(/^"The biggest problem[^"]*, ahead of [^"]*; they want [^"]*, but [^"]*\."/);
    // CONTROL (gate 7d): the real shape with v7's lead (A against another problem only) fails it
    const mutated = def('canvas:problem').shape.replace('; they want <B>, but <obstacle>." Others', '." Others');
    expect(mutated).not.toBe(def('canvas:problem').shape);
    expect(problemLeadWhole(mutated)).toBe(false);
  });

  /** The text a lead shape tells the model to write: the first quoted template after "Lead:". It must not itself contain "Lead:". */
  const leadTemplateWritesLabel = (shape: string) => /Lead:/.test((/^Lead: "([^"]*)"/.exec(shape) ?? ['', ''])[1]!);

  it('P1658 v8: "Lead:" marks the template only and is never written into a point', () => {
    for (const tag of RANKED_BOXES) expect(leadTemplateWritesLabel(def(tag).shape), tag).toBe(false);
    for (const b of BOX_DEFINITIONS) expect(b.good, b.tag).not.toMatch(/^"Lead:/);
    expect(LEAD_POINT_RULE.text).toContain('"Lead:" only marks the template: never write it in a point.');
    expect(LEAD_POINT_RULE.plain).toContain('Never write "Lead:" itself.');
    // CONTROL (gate 7d): a real lead shape whose template carries the label, as v7 wrote it ("- Lead: The first customers are …"), fails it
    const seg = def('canvas:segments').shape;
    const mutated = seg.replace('Lead: "The <first|best>', 'Lead: "Lead: The <first|best>');
    expect(mutated).not.toBe(seg);
    expect(leadTemplateWritesLabel(mutated)).toBe(true);
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
    expect(LEAD_POINT_RULE.plain).toContain('the option it beats ("not" only if I dropped or turned it down)');
    expect(THIRD_PERSON_RULE.text).toContain('Write ", not <Y>" only when the owner\'s words drop, turn down or deny Y; a later option is "ahead of <Y>".');
    expect(LEAD_POINT_RULE.text).not.toMatch(/dropped or turned down counts/); // the round-1 wording that put a dropped option behind "ahead of"
  });

  it('P1658 fix round: no rule forbids "will not"; a plan stays a plan', () => {
    const all = [LEAD_POINT_RULE.text, LEAD_POINT_RULE.plain!, THIRD_PERSON_RULE.text, THIRD_PERSON_RULE.plain!, ...BOX_DEFINITIONS.flatMap((b) => [b.voice, b.definition, b.shape])].join('\n');
    expect(all).not.toMatch(/never "will not"/);
    expect(THIRD_PERSON_RULE.text).toContain('a plan stays a plan ("The business plans not to sell hand-run sessions")');
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
    // the price sits after the contrast clause, never inside it, and the lead keeps every part of the terms
    expect(offer.shape).toContain('<ahead of|not> <other offer>; <price + currency> per <unit> <cadence>; <state>');
    expect(offer.good).toMatch(/, ahead of [^;\d]+; [\d,]+ baht per shop per month;/);
  });

  it('P1658 revision 2: a ranked box\'s gap asks for the missing part AND the ranking; its empty question asks the core fact with the ranking', () => {
    // the part each box's gap must still ask for (boxGuideEntry shows the gap "when the box is empty or only part is supported")
    const MISSING: Record<string, RegExp> = {
      'canvas:segments': /\btoday\b/, 'canvas:problem': /\bcost\b.*\bwant\b.*\bstops\b/, 'canvas:revenue': /\bcost\b.*\bper what unit\b.*\bhow often\b.*\bpaid\b/,
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
});
