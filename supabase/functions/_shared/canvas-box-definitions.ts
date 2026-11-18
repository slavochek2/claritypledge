/**
 * P1536 (Design v6, S2): the ONE source of what each Clarity Canvas box means. The drafting prompt
 * (canvas-prompt.ts), the empty-box questions (canvas-parse.ts questionsFor, canvas-reply.ts) and the owner's
 * Copy prompt (src/app/pages/chat/canvas-thread-copy.ts) all read this module and hold no box text of their own.
 *
 * BOX_DEFINITIONS is P1658's revision-2 test wording: every point a claim a reader can agree or disagree with, in third person about
 * "the business" (THIRD_PERSON_RULE), reasons left out of the point, and the five RANKED_BOXES opening with a lead point that names the
 * owner's choice against an alternative (LEAD_POINT_RULE). Founder-pending [FOUNDER DECISION: adopt, revise or drop, P1658]. GLOBAL_RULES,
 * ONE_SALE_LOOP_PLAIN and PRICE_GAP_QUESTION are still P1536's copy, unchanged.
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

/**
 * P1658 revision 2: the boxes that open with a ranked lead point, in canvas order. The lead is the box's first point and counts toward
 * MAX_POINTS_PER_BOX; LEAD_POINT_RULE says when one may be written.
 */
export const RANKED_BOXES = ['canvas:segments', 'canvas:problem', 'canvas:revenue', 'canvas:metrics', 'canvas:good-at'] as const;

/**
 * P1658 revision 2: when a ranked box may open with a lead point. The chosen X, the other option Y and the ranking all trace to the owner's
 * words; "best" or "biggest" only when the owner ranked, "first" or "chosen" when they chose without ranking; no invented Y, and no lead
 * when nothing grounds one (round 1 review: an invented "costliest"). A later option is "ahead of <Y>"; an option the owner dropped or
 * turned down is ", not <Y>" ("ahead of" would say it comes later). The lead shapes write both the choice word and the contrast as slots
 * (<first|biggest>, <ahead of|not>), never a bare ranking word or a bare "ahead of", because the model copies a template's words (rev2 A/B:
 * an invented "best"; fix round 3: a template with only "ahead of" never shows the dropped form). `plain` is the owner's wording.
 */
export const LEAD_POINT_RULE: GlobalRule = {
  name: 'Lead point',
  text: `Lead point: a box whose shape has "Lead:" (Customer Segments, Problem, Offers & Pricing, My next milestone, My current biggest challenge) opens with one point naming the owner's choice and the option it beats, both from the owner's words: "ahead of <Y>" for an option that comes later, ", not <Y>" for one the owner dropped or turned down. Write "best" or "biggest" only if the owner ranked them, else "first" or "chosen". Order of mention, effort or pursuit is no ranking. No other option in the owner's words, no lead.`,
  plain: `A "Lead:" point names my choice and, from my words, the option it beats ("not" only if I dropped it). "Best" or "biggest" only if I ranked them, else "first" or "chosen"; order or effort is no ranking. No other option, no lead.`,
};

/**
 * P1658 revision 2: no point says "I", "we", "my", "our", "us", "me" or "you" (the Copy prompt's line bans the same list). When the business acts, the point says "the business", never its
 * name (canvas-names.ts drops a point carrying a capitalised two-word name learned from an uploaded file); a box whose subject is the
 * customer or the offer keeps that subject. ", not <Y>" only where the owner's words drop, turn down or deny Y (negation parity in
 * canvas-support.ts); a later option is "ahead of <Y>". A plan stays a plan (GLOBAL_RULES "Statement type per box"): no rule forces
 * "does not" over "will not" or "plans not to", which would turn a plan into a present fact. `plain` is the Copy prompt's one line.
 */
export const THIRD_PERSON_RULE: GlobalRule = {
  name: 'Third person',
  text: `Every point is third person: never "I", "we", "my", "our", "us", "me" or "you". When the business is the one acting, write "the business", never the business's or the owner's name. A stance stays a stance ("The business does not sell hand-run sessions") and a plan stays a plan ("The business plans not to sell hand-run sessions"). Write ", not <Y>" only when the owner's words drop, turn down or deny Y; a later option is "ahead of <Y>".`,
  plain: `Rules say "I" and "you"; a point never says "I", "we", "my", "our", "us", "me" or "you". When the business acts, a point says "the business", never its name.`,
};

export const BOX_DEFINITIONS: readonly BoxDefinition[] = [
  {
    tag: 'canvas:segments', title: 'Customer Segments',
    type: 'Claim about who the customer is, and who comes first', voice: 'third person',
    definition: `The specific people who have the problem and pay (or will). Roles in one sale get one point each, starting "Pays:", "Uses:", "Approves:". Each point needs a role or title, plus at least two of: industry, company size, demographics, psychographics.`,
    shape: `Lead: "The <first|best> customers are <X>, <ahead of|not> <Y>." Others: "<role + qualifier> who <do X today> <when trigger> are the customers[, not <ruled-out lookalike>]." Role points leave out "are the customers".`,
    good: `"The first customers are owners of 1-3 independent cafés who do their own books after closing, ahead of bakery owners." / "Owners of 1-3 independent cafés who file their own tax returns are the customers, not café chains with an in-house accountant."`,
    not: `"Owners of independent cafés." (a description nobody can disagree with) / "The best customers are cafés, ahead of bakeries." (the owner never ranked them) / "I sell to small businesses"`,
    gap: `Who exactly is the customer, what do they do about the problem today, and which kind is best to start with, ahead of which other?`,
    empty: `Who exactly is the customer, and which kind is best to start with, ahead of which other?`,
  },
  {
    tag: 'canvas:problem', title: 'Problem',
    type: `Claim about the customer's problem, and which matters most`, voice: `third person`,
    definition: `The problem this customer has, before they hear of you: where they are and its cost (A), what they want (B), what stops them (obstacle). Leave out why.`,
    shape: `Lead: "The <first|biggest> problem for <customer> is <A>, <ahead of|not> <other problem>." Others: "For <customer> the problem is <A + cost>[, not <ruled-out problem>]; they want <B>, but <obstacle>." The obstacle is a barrier, not a missing product.`,
    good: `"The biggest problem for café owners is the receipt pile-up in the week before the tax deadline, ahead of chasing late invoices." (the owner ranked them) / "For café owners the problem is sorting a quarter of receipts in the week before the deadline, not the bookkeeping itself; they want their books closed without losing evenings, but receipts pile up during 14-hour shifts."`,
    not: `"Café owners spend time on bookkeeping." (true, and nobody can disagree) / "The biggest problem for café owners is receipts, ahead of invoices." (the owner never ranked them) / "There is no simple bookkeeping app for cafés."`,
    gap: `What does the problem cost your customers, what do they want instead, what stops them, and which problem matters most, ahead of which other?`,
    empty: `Which problem do your customers have today, what stops them, and which problem matters most, ahead of which other?`,
  },
  {
    tag: 'canvas:solution', title: 'Solution',
    type: 'Stance on what the business does', voice: 'third person, with status',
    definition: `What you do or hand over, as a rule a reader could hold you to. Leave out why.`,
    shape: `"The business <does X>[, not <ruled-out Y>]." or "The business does not <Y>." Status: planned / piloted / live.`,
    good: `"The business logs every receipt the night an owner photographs it into a chat thread, not at month end; live for 6 cafés."`,
    not: `"The business logs receipts the same night, which removes the deadline pile-up so owners close their books on time." (the reason is inside the point) / "I log receipts nightly." (first person) / "Seamless AI-powered bookkeeping."`,
    // The gap asks for the part a stance point most often lacks (what exactly, and its status); the empty-box question is the one the code had before.
    gap: `What exactly do you do or hand over, and is it planned, piloted or live?`,
    empty: `What do you do about it?`,
  },
  {
    tag: 'canvas:channels', title: 'Go-to-market strategy',
    type: 'Stance on how the business reaches them', voice: 'third person',
    definition: `Where this segment can be reached and your first action there. Leave out why. Public platform names allowed.`,
    shape: `"The business <first action> in <place>[, not <ruled-out path>]; <result so far, or 'not tried yet'>."`,
    good: `"The business answers tax questions weekly in two café-owner Facebook groups, not through paid ads; 4 of its 6 clients came via an espresso-machine technician who refers it."`,
    not: `"Social media and word of mouth." / "We post in café-owner groups because owners trust peers more than ads." (first person, with the reason inside)`,
    gap: `How did your last customer find you, and where do the next ones gather?`,
  },
  {
    tag: 'canvas:revenue', title: 'Offers & Pricing',
    type: 'Claim about the terms, and which offer comes first', voice: 'third person',
    definition: `What the customer buys, for how much, per what unit, how often, and its state (considering / quoted / paid by N).`,
    shape: `Lead: "The offer to sell first is <offer>, <ahead of|not> <other offer>; <price + currency> per <unit> <cadence>; <state>." Others: "<offer>: <price + currency> per <unit> <cadence>; <state>."`,
    good: `"The offer to sell first is monthly books and tax filing, ahead of payroll; 2,500 baht per shop per month; 6 shops pay it today."`,
    not: `"Affordable packages." / "I charge 2,500 baht a month because cafés cannot afford an accountant." (first person, with the reason inside)`,
    gap: `What does it cost, per what unit, how often, has anyone paid it yet, and which offer do you sell first, ahead of which other?`,
    empty: `What does a customer buy, for how much, and which offer do you sell first, ahead of which other?`,
  },
  {
    tag: 'canvas:metrics', title: 'My next milestone',
    type: 'Target, and what comes first', voice: 'third person',
    definition: `The next result customers produce (pay, renew, refer).`,
    shape: `Lead: "The next milestone is <target>, <ahead of|not> <other goal>." Others: "<target>[; if missed, <change the owner stated>]." Target: <number> <customers> <action> by <date> (target).`,
    good: `"The next milestone is 10 cafés paying monthly by 31 March 2027 (target), ahead of opening a second city."`,
    not: `"I aim for 10 cafés paying monthly by 31 March 2027." (about the owner's aim, which nobody can dispute) / "Launch the new website and grow."`,
    gap: `What number, by what date, comes next, and which goal comes after it?`,
    empty: `What number, by what date, would show this is working, and what comes after it?`,
  },
  {
    tag: 'canvas:love', title: 'Guiding values',
    type: 'Decision policy', voice: 'as written',
    definition: `A rule your business and partners live by, saying which good thing you give up when two good things conflict. Both X and Y are good. Business culture, not a personal habit. Leave out why you hold it.`,
    shape: `"X over Y[, even when <what it costs>]."`,
    good: `"Filing on time over filing perfectly, even when a late receipt means correcting the return afterwards."`,
    not: `"Integrity and customer focus." / "I keep weekends for family." / "Accuracy over speed, because a wrong return costs the owner more." (the reason is inside the point)`,
    gap: `What does your business choose over something else it cares about, even when it costs you? Write it as 'X over Y'.`,
  },
  {
    tag: 'canvas:good-at', title: 'My current biggest challenge',
    // No guess marker (P1658 fix round): the old "I think" rule, turned into "probably", let the engine keep an invented cause, against
    // GLOBAL_RULES "Grounding" (never invent obstacles). The obstacle is written only as the owner states it; otherwise the gap question asks.
    type: `The business's constraint, and which is biggest`, voice: 'third person',
    definition: `The obstacle most likely to stop this working now: where you are (A, with a number if you have one), where you want to be (B). The obstacle only as you state it.`,
    shape: `Lead: "The <chosen|biggest> challenge is <X>, <ahead of|not> <Y>." Others: "The business is at <A> and wants <B>; the obstacle is <barrier>."`,
    good: `"The biggest challenge is getting first calls with café owners, ahead of setting a price." (the owner ranked them) / "The business is at 3 replies from its last 20 messages to café owners and wants 10 first calls this month; the obstacle is that strangers writing about money look like scams to them."`,
    not: `"Finding time." / "I think strangers see a scam." (first person) / "The business is at 3 replies; the obstacle is probably trust." (a cause the owner never stated) / a copy of the customer's Problem`,
    // No `empty`: the gap already asks for the core fact and the ranking, so emptyQuestionFor falls back to it (fix round 3).
    gap: `Where are you now, where do you want to be, what is in the way, and which challenge is biggest, ahead of which other?`,
  },
  {
    tag: 'canvas:world-needs', title: `Hypotheses I've falsified`,
    type: 'Evidence', voice: 'third person, past',
    definition: `A whole direction you dropped (a customer group, an offer, a way of selling). One wrong detail is a "not" point in its own box; a dropped price form stays here.`,
    shape: `"The business expected <X>; <test + sample>; <result>; so it <change>."`,
    good: `"The business expected café owners to run a bookkeeping app themselves; 0 of 8 trial cafés still used it after a month, so it now does their books for them."`,
    not: `"The business learned customers value relationships." / "The business expected café chains to buy; none did." (a lookalike group: a "not" point in Customer Segments)`,
    gap: `Which direction (a customer group, an offer, a way of selling) did you drop, and what showed you it was wrong?`,
  },
];

/**
 * The gap question of an Offers & Pricing point that holds a price with no unit or cadence (S2.3: "the gap question asks for the missing part"). The engine raises it, not the model.
 * [FOUNDER DECISION: wording, S2.6; a default written for the fixture, not from the spec's table.]
 */
export const PRICE_GAP_QUESTION = `What is that price per, and how often is it paid?`;

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
