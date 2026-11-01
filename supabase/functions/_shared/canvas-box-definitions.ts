/**
 * P1536 (Design v6, S2): the ONE source of what each Clarity Canvas box means. The drafting prompt
 * (canvas-prompt.ts), the empty-box questions (canvas-parse.ts questionsFor, canvas-reply.ts) and the owner's
 * Copy prompt (src/app/pages/chat/canvas-thread-copy.ts) all read this module and hold no box text of their own.
 *
 * The strings are the spec's section 4 table, copied as written. They are founder-pending copy
 * [FOUNDER DECISION: F1, S2.6 sign-off], so do not reword them here. (Customer Segments' last sentence is the spec's Q1 wording, section 3b, copied as written: [FOUNDER DECISION: wording, S2.6].) The spec's "(P1589)" source marks and "(D9)" label are
 * left out: they point at specs, and a model must not read them as text.
 *
 * Titles repeat CANVAS_BOXES (src/lib/canvas-boxes.ts) because edge code cannot import src/; a test pins the equality
 * (src/tests/p1536-box-definitions.test.ts). Pure: no imports, so vitest and the browser load it as it is.
 */

/** Points a box holds and the length of one point. Here (not in canvas-draft.ts) so the Copy prompt states the same limits; canvas-draft.ts re-exports them. */
export const MAX_POINTS_PER_BOX = 3;
export const MAX_STATEMENT_CHARS = 300;

/**
 * Who may be named, in the drafting rules and the owner's Copy prompt alike: private people and private companies never,
 * public platforms and marketplaces by name (the Go-to-market definition allows them). The server-side names filter
 * (canvas-names.ts) is unchanged by this.
 */
export const NAMING_RULE =
  `Never use the names of other people or private companies; write their role instead ("a coffee supplier"). Public platforms and marketplaces (Facebook, LinkedIn, an app store) may be named.`;

export interface BoxDefinition {
  tag: string;
  title: string;
  /** What kind of statement a point in this box is. */
  type: string;
  /** Whose voice the point is written in. */
  voice: string;
  definition: string;
  /** The form of a point. */
  shape: string;
  good: string;
  not: string;
  /** The question shown to the owner under the box when it is empty or only part is supported. */
  gap: string;
  /** Asked when the whole box is empty, if the gap question only fits a half-filled box. */
  empty?: string;
}

export interface GlobalRule {
  name: string;
  text: string;
  /** The same rule for the owner's own AI, where the agent's words ("the owner's material", "questions[box]") mean nothing. */
  plain?: string;
}

/**
 * The one-sale-loop rule in plain words, for the owner's own AI (D9). It is rule 7's owner wording, so the Copy prompt states the
 * rule once. [FOUNDER DECISION: F1, wording written from D9, not copied from the table.]
 */
export const ONE_SALE_LOOP_PLAIN =
  `One canvas is one sale loop. Groups of people share a canvas only if they are roles in one sale (who pays, who uses, who approves), or one segment described twice. If I sell to more than one kind of customer, give each its own canvas. An old direction I dropped goes under Hypotheses I've falsified, and people who never buy (a referrer, an investor) are not a customer segment.`;

/** The rules every point obeys, whatever the box (spec section 4, global rules 1-7). */
export const GLOBAL_RULES: readonly GlobalRule[] = [
  { name: 'Grounding', text: `Every factual clause traces to the owner's material. Never invent numbers, dates, prices, motives or obstacles.`, plain: `Every factual clause traces to what I told you or shared with you. Never invent numbers, dates, prices, motives or obstacles.` },
  { name: 'Specificity', text: `Name observable actors, conditions, actions or terms. Reject category words ("small businesses", "social media", "affordable", "integrity").` },
  { name: 'Differentiation only where claimed', text: `Write a competitive difference only when the owner claims one and gives evidence. A true sentence a competitor could also say is allowed.`, plain: `Write a competitive difference only when I claim one and give evidence. A true sentence a competitor could also say is allowed.` },
  { name: 'Statement type per box', text: `A fact stays a fact, a plan stays a plan, a target stays a target. Keep the owner's modality: considering, quoted, paid; planned, piloted, live.`, plain: `A fact stays a fact, a plan stays a plan, a target stays a target. Keep my modality: considering, quoted, paid; planned, piloted, live.` },
  { name: 'Partial beats empty', text: `Keep a supported part of a box and put the missing part in the box's gap question (\`questions[box]\`, shown to the owner under the box). A box is empty only when nothing in it is supported.`, plain: `Keep the part of a heading that my words support, even when the rest is missing. A heading is empty only when nothing in it is supported.` },
  { name: 'Voice per box', text: `Customer Segments describes the customer and never starts with "I", "We", "My customers" or "I sell to".` },
  { name: 'One sale loop', text: `Every customer-facing box is about this canvas's segment (or its roles). The three founder-fit boxes may hold business-wide points.`, plain: `${ONE_SALE_LOOP_PLAIN} The three founder-fit boxes (Guiding values, My current biggest challenge, Hypotheses I've falsified) may hold points about my whole business.` },
];

export const BOX_DEFINITIONS: readonly BoxDefinition[] = [
  {
    tag: 'canvas:segments', title: 'Customer Segments',
    type: 'Description', voice: 'noun phrase about the customer',
    definition: `The specific people who have the problem and pay (or will), named by role, size or stage, what they do today and what makes it urgent now. Roles in one sale get one point each, starting "Pays:", "Uses:", "Approves:". Each point needs a role or title, plus at least two of: industry, company size, demographics, psychographics.`,
    shape: `<role + qualifier> who <do X today> <when trigger>`,
    good: `"Owners of 1-3 independent cafés who do their own books after closing"`,
    not: `"I sell to small businesses"`,
    gap: `Who exactly has this problem, and what are they doing about it today?`,
  },
  {
    tag: 'canvas:problem', title: 'Problem',
    type: 'Observation about the customer', voice: 'their perspective',
    definition: `Where the customer is now and what it costs (A), what they want (B), and what stops them (obstacle), before they have heard of you.`,
    shape: `"Today <customer> <A + cost>; they want <B>, but <obstacle>." The obstacle is a barrier, not a missing product. A, B, obstacle may be partial.`,
    good: `"Today café owners sort a quarter of receipts in the week before the deadline; they want their books closed without losing evenings, but receipts pile up during 14-hour shifts."`,
    not: `"There is no simple bookkeeping app for cafés."`,
    gap: `Where are your customers stuck today, what do they want instead, and what stops them?`,
  },
  {
    tag: 'canvas:solution', title: 'Solution',
    type: 'Mechanism', voice: 'first person, with status',
    definition: `What you do or hand over, and how it removes the Problem's obstacle. Untested effect says "intended to".`,
    shape: `"I <do X>, which removes <obstacle> so they reach <B>." Status: planned / piloted / live.`,
    good: `"Owners photograph each receipt into a chat thread when they pay; I log it the same night, so nothing piles up before the deadline."`,
    not: `"Seamless AI-powered bookkeeping."`,
    // The spec gives only "Gap if the obstacle link is missing"; the empty-box question is the one the code had before.
    gap: `Which obstacle in the Problem does this remove?`,
    empty: `What do you do about it?`,
  },
  {
    tag: 'canvas:channels', title: 'Go-to-market strategy',
    type: 'Acquisition path', voice: 'first person',
    definition: `Where this segment can be reached, the first action you take there, and which paths have brought customers vs. which are plans. Public platform names allowed; private people and firms by role only.`,
    shape: `"<place> + <first action>; <result so far or 'not tried yet'>"`,
    good: `"I answer tax questions weekly in two café-owner Facebook groups; 4 of my 6 clients came via an espresso-machine technician who refers me."`,
    not: `"Social media and word of mouth."`,
    gap: `How did your last customer find you, and where do the next ones gather?`,
  },
  {
    tag: 'canvas:revenue', title: 'Offers & Pricing',
    type: 'Commercial terms', voice: `terms or "I charge"`,
    definition: `What the customer buys, for how much, per what unit, how often, and its state (considering / quoted / paid by N).`,
    shape: `"<offer>: <price + currency> per <unit> <cadence>; <state>"`,
    good: `"Monthly books and tax filing: 2,500 baht per shop per month; 6 shops pay this today."`,
    not: `"Affordable packages."`,
    gap: `What exactly does a customer buy, for how much, and has anyone paid it yet?`,
  },
  {
    tag: 'canvas:metrics', title: 'My next milestone',
    type: 'Target', voice: 'first person',
    definition: `The next result customers produce (pay, renew, refer), with a number and a date. What you will change if you miss it, only if the owner says.`,
    shape: `"I aim for <number> <customer action> by <date>[; if not, I <change>]."`,
    good: `"I aim for 10 cafés paying monthly by 31 March 2027."`,
    not: `"Launch the new website and grow."`,
    gap: `What number, by what date, would show this is working?`,
  },
  {
    tag: 'canvas:love', title: 'Guiding values',
    type: 'Decision policy', voice: 'as written',
    definition: `A rule your business and partners live by, saying which good thing you give up when two good things conflict, and why. Both X and Y are good. Business culture, not a personal habit.`,
    shape: `"X over Y, because Z."`,
    good: `"Intellectual honesty over winning the argument, because decisions built on hidden misunderstandings fail later."`,
    not: `"Integrity and customer focus." / "I keep weekends for family."`,
    gap: `What does your business choose over something else it cares about, and why? Write it as 'X over Y, because Z'.`,
  },
  {
    tag: 'canvas:good-at', title: 'My current biggest challenge',
    type: `Owner's constraint`, voice: 'first person',
    definition: `The obstacle you see as most likely to stop this working now: where you are (A, a number where the material has one), where you want to be (B), and what is in the way. Causes the material does not state are written as "I think".`,
    shape: `"I'm at <A>, I want <B>, and the obstacle is <barrier>."`,
    good: `"I'm at 3 replies from my last 20 messages to café owners, I want 10 first calls this month, and I think strangers writing about money look like scams to them."`,
    not: `"Finding time." / a copy of the customer's Problem`,
    gap: `Where are you now, where do you want to be, and what is in the way?`,
  },
  {
    tag: 'canvas:world-needs', title: `Hypotheses I've falsified`,
    type: 'Evidence', voice: 'first person, past',
    definition: `Something you expected, how you tested it, what happened against it, and what you changed (if you have). Old pivots land here only with what the owner says happened.`,
    shape: `"I expected <X>; I <test + sample>; <result>; so I <change>." Decision may be missing (gap).`,
    good: `"I expected owners to want per-receipt pricing; I offered both to 5 prospects; all 5 chose the flat fee, so I dropped per-receipt."`,
    not: `"I learned customers value relationships."`,
    gap: `What did you expect that turned out wrong, and how did you find out?`,
  },
];

/** The question shown to the owner under a box that is empty; null for a tag that is no box. */
export function emptyQuestionFor(tag: string): string | null {
  const b = BOX_DEFINITIONS.find((d) => d.tag === tag);
  return b ? (b.empty ?? b.gap) : null;
}

/** The global rules as numbered lines: for the drafting agent, or in the owner's own words for the Copy prompt. */
export function globalRulesText(audience: 'agent' | 'owner' = 'agent'): string {
  return GLOBAL_RULES.map((r, i) => `${i + 1}. ${r.name}. ${audience === 'owner' ? (r.plain ?? r.text) : r.text}`).join('\n');
}

/** One box as the drafting agent reads it. */
export function boxGuideEntry(b: BoxDefinition): string {
  return [
    `- ${b.tag} (${b.title}). Type: ${b.type}. Voice: ${b.voice}.`,
    `  ${b.definition}`,
    `  Shape: ${b.shape}`,
    `  A good point: ${b.good}`,
    `  Not this: ${b.not}`,
    `  Question for the owner when the box is empty or only part is supported: ${b.gap}`,
    ...(b.empty ? [`  Question for the owner when nothing in the box is supported: ${b.empty}`] : []),
  ].join('\n');
}

/** The nine boxes as the drafting agent reads them. */
export function boxGuideText(): string {
  return BOX_DEFINITIONS.map(boxGuideEntry).join('\n');
}

/** One box as a section of the Copy prompt's file: its heading, its definition, its voice and its shape. */
export function copyPromptSection(b: BoxDefinition): string {
  return `## ${b.title}\n${b.definition}\nVoice: ${b.voice}\nShape: ${b.shape}`;
}
