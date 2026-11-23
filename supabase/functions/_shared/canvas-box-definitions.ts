/**
 * P1536 (Design v6, S2): the ONE source of what each Clarity Canvas box means. The drafting prompt
 * (canvas-prompt.ts), the empty-box questions (canvas-parse.ts questionsFor, canvas-reply.ts) and the owner's
 * Copy prompt (src/app/pages/chat/canvas-thread-copy.ts) all read this module and hold no box text of their own.
 *
 * BOX_DEFINITIONS is P1658's revision-2 test wording: every point a claim a reader can agree or disagree with, in third person about
 * "the business" (THIRD_PERSON_RULE), reasons left out of the point, and the five RANKED_BOXES opening with a lead point that names the
 * owner's choice against an alternative (LEAD_POINT_RULE). Founder-pending [FOUNDER DECISION: adopt, revise or drop, P1658]. GLOBAL_RULES,
 * ONE_SALE_LOOP_PLAIN and PRICE_GAP_QUESTION are still P1536's copy, unchanged, with one founder-approved exception (P1658 revision 3 / v9):
 * "Statement type per box" is scoped to the boxes that carry state, because Solution, Offers & Pricing and Go-to-market strategy describe
 * the intended model with no status.
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
  `Never use the names of other people or private companies; write their role ("a coffee supplier"). Public platforms and marketplaces (Facebook, LinkedIn, an app store) may be named.`;

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

/**
 * The boxes that carry where the business stands (P1658 v9). Everywhere else a present-tense sentence states the model the owner intends.
 * Rule 4 names them in both wordings; the routing rule sends status, blockers and an order of goals to the first two.
 */
const STATE_BOXES = `My next milestone, My current biggest challenge and Hypotheses I've falsified`;
const MODEL_BOXES = `Solution, Offers & Pricing and Go-to-market strategy`;

/**
 * The rules every point obeys, whatever the box (spec section 4, global rules 1-7). Rule 4 is the one exception to "word for word"
 * (P1658 v9, founder 2026-11-23: "It's not a state. It doesn't matter if it's untested, planned or whatever. State is something else."):
 * it is scoped to the state boxes, and the three model boxes carry no status and no traction counts.
 */
export const GLOBAL_RULES: readonly GlobalRule[] = [
  { name: 'Grounding', text: `Every factual clause traces to the owner's material. Never invent numbers, dates, prices, motives or obstacles.`, plain: `Every factual clause traces to what I told you or shared with you. Never invent numbers, dates, prices, motives or obstacles.` },
  { name: 'Specificity', text: `Name observable actors, conditions, actions or terms. Reject category words ("small businesses", "social media", "affordable", "integrity").` },
  { name: 'Differentiation only where claimed', text: `Write a competitive difference only when the owner claims one and gives evidence. A true sentence a competitor could also say is allowed.`, plain: `Write a competitive difference only when I claim one and give evidence. A true sentence a competitor could also say is allowed.` },
  { name: 'Statement type per box', text: `Only ${STATE_BOXES} carry state, where the business stands: a fact stays a fact, a target stays a target. ${MODEL_BOXES} describe the business model the owner intends, in the present tense, so a sentence there means "this is the model", never "this is happening": no status ("planned", "untested", "considering", "not tried yet", "none sold", "live", "piloted", "quoted", "paid by N") and no traction counts.`, plain: `Only ${STATE_BOXES} carry state: facts stay facts, targets targets. ${MODEL_BOXES} are the model I intend, in the present tense: no status (planned, considered, untested, not tried yet, none sold) or traction counts.` },
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
 * v9: no template carries a label. v8's shapes began `Lead: "…" Others: "…"` and the founder's own run wrote "Lead:" into four points although
 * the rule forbade it, because the model copies a template's words. The shapes are now plain sentences (`Open with "…" when the owner's words
 * ground it; then "…"`), this rule names the five boxes, and neither prompt holds the label (a "never write it" line only primed it).
 */
export const LEAD_POINT_RULE: GlobalRule = {
  name: 'Lead point',
  text: `Lead point: Customer Segments, Problem, Offers & Pricing, My next milestone and My current biggest challenge open with one point naming the owner's choice and the option it beats, both from the owner's words: "ahead of <Y>" for an option that comes later, ", not <Y>" for one the owner dropped or turned down. My next milestone's lead is always "ahead of <Y>": a later goal is never turned down. Write "best" or "biggest" only if the owner ranked them, else "first" or "chosen". Order of mention, effort or pursuit is no ranking. No other option in the owner's words, no lead: the box starts with its other points.`,
  plain: `An "Open with" point takes from my words the option it beats ("not" only if I dropped or turned it down; milestones: never). "Best" or "biggest" only if I ranked them, else "first" or "chosen"; order or effort is no ranking. No other option, skip it.`,
};

/**
 * P1658 v8 (founder, reading his own v7 run): a box never holds what belongs in another box. v7 put a problem and its trigger in Customer
 * Segments, and the offer and a channel in Solution. The drafting agent gets the full map for the five customer-facing boxes most often
 * mixed up; the Copy prompt gets the founder's sentence only (`plain`, decision 2026-11-19: the word cap), because each heading's definition
 * right below it already says what it holds. In the "For all boxes:" block of the drafting prompt, not in GLOBAL_RULES (P1536's seven).
 * v9: the founder's v8 run put status and waiting into Solution and Go-to-market. The map gains the two state destinations, and the
 * Copy prompt, within its word cap, gets where a blocker and an order of goals go.
 */
export const ROUTING_RULE: GlobalRule = {
  name: 'One box, one kind of point',
  text: `A box never holds another box's point: who the customer is goes in Customer Segments, the pain in Problem, how it is solved in Solution, how the business reaches them in Go-to-market strategy, what is sold and for how much in Offers & Pricing, where the business stands now and what blocks it in My current biggest challenge, the next customer result and the later goals it comes ahead of in My next milestone. Go-to-market strategy holds no waiting, conditions or dates (a cadence such as "weekly" stays, as does a step order inside Solution): a current blocker goes to My current biggest challenge, a sequence of customer goals the owner states goes to My next milestone as "ahead of", and other timing is left out.`,
  plain: `A heading never holds another heading's point: blockers belong under My current biggest challenge, an order of goals under My next milestone.`,
};

/**
 * P1658 v8e: material that is already a canvas does not get its points placed by its own headings. Sits right after ROUTING_RULE in the
 * drafting prompt's "For all boxes:" block; the Copy prompt does not carry it. The engine never ties a quote to a box (canvas-guess.ts
 * vetEvidence checks the owner's whole text), so moving a sentence to another box cannot get its quote refused.
 */
export const CANVAS_MATERIAL_RULE =
  `When the material is already a canvas (headings such as Customer Segments, Problem, Solution), its headings are not evidence of the box: place each point by the rule above, in that box's shape, keeping its quote as before.`;

/**
 * P1658 revision 2: no point says "I", "we", "my", "our", "us", "me" or "you" (the Copy prompt's line bans the same list). When the business acts, the point says "the business", never its
 * name (canvas-names.ts drops a point carrying a capitalised two-word name learned from an uploaded file); a box whose subject is the
 * customer or the offer keeps that subject. ", not <Y>" only where the owner's words drop, turn down or deny Y (negation parity in
 * canvas-support.ts); a later option is "ahead of <Y>". No rule forces "does not" over "will not". v9 removed the stance and "a plan stays a
 * plan" examples: the three model boxes state the intended model in the present tense (GLOBAL_RULES "Statement type per box"), and Solution
 * no longer holds "The business does not <Y>" stances. `plain` is the Copy prompt's one line.
 */
export const THIRD_PERSON_RULE: GlobalRule = {
  name: 'Third person',
  text: `Every point is third person: never "I", "we", "my", "our", "us", "me" or "you". When the business is the one acting, write "the business", never the business's or the owner's name. Write ", not <Y>" only when the owner's words drop, turn down or deny Y; a later option is "ahead of <Y>".`,
  plain: `Rules say "I" and "you"; a point never says "I", "we", "my", "our", "us", "me" or "you". When the business acts, say "the business", never its name.`,
};

export const BOX_DEFINITIONS: readonly BoxDefinition[] = [
  {
    tag: 'canvas:segments', title: 'Customer Segments',
    // P1658 v8: who the customer IS, never their problem. v7 wrote "Teams … stuck in a disagreement they feel today are the customers" from the old
    // definition ("people who have the problem") and shape ("<do X today> <when trigger>"). The problem, its trigger and its cost go in Problem.
    type: 'Claim about who the customer is (not their problem), and who comes first', voice: 'third-person',
    definition: `Who the customers are: a role, plus at least two of industry, company size, place (consumers: age, life stage), values, attitudes, what they buy or use today. Roles in one sale get one point each, starting "Pays:", "Uses:", "Approves:", without "are the customers".`,
    shape: `Open with "The <first|best> customers are <X>, <ahead of|not> <Y>." when grounded; then "<role + two qualifiers> are the customers[, not <ruled-out lookalike>]."`,
    good: `"The first customers are owners of 1-3 independent cafés in Bangkok who use no accountant, ahead of bakery owners." / "Owners of 1-3 independent cafés in Bangkok who file their own tax returns are the customers, not café chains with an in-house accountant."`,
    not: `"Owners of independent cafés." (a description nobody can disagree with) / "Café owners who lose evenings to receipts before the tax deadline are the customers." (a problem and its trigger: those go in Problem) / "The best customers are cafés, ahead of bakeries." (the owner never ranked them) / "I sell to small businesses"`,
    gap: `Who exactly is the customer (role, industry, size, place), what do they buy or use today, and which kind is best to start with, ahead of which other?`,
    empty: `Who exactly is the customer, and which kind is best to start with, ahead of which other?`,
  },
  {
    tag: 'canvas:problem', title: 'Problem',
    type: `Claim about the customer's problem, and which matters most`, voice: `third-person`,
    definition: `The customer's problem before they hear of you: where they are and its cost (A), what they want (B), what stops them (obstacle).`,
    // P1658 v8: the lead keeps A, B and the obstacle (v7's Problem lead had only A against another problem).
    shape: `Open with "The <first|biggest> problem for <customer> is <A + cost>, <ahead of|not> <other problem>; they want <B>, but <obstacle>." when grounded; then "For <customer> the problem is <A + cost>[, not <ruled-out problem>]; they want <B>, but <obstacle>." The obstacle is a barrier, not a missing product.`,
    good: `"The biggest problem for café owners is two evenings lost to receipts before each tax deadline, ahead of chasing late invoices; they want their books done without losing evenings, but receipts pile up in 14-hour shifts." (the owner ranked them) / "For café owners the problem is a late-filing fine, not the bookkeeping itself; they want to file on time, but the receipts are in three places."`,
    not: `"Café owners spend time on bookkeeping." (true, and nobody can disagree) / "The biggest problem for café owners is receipts, ahead of invoices." (the owner never ranked them) / "There is no simple bookkeeping app for cafés."`,
    gap: `What does the problem cost your customers, what do they want instead, what stops them, and which problem matters most, ahead of which other?`,
    empty: `Which problem do your customers have today, what stops them, and which problem matters most, ahead of which other?`,
  },
  {
    tag: 'canvas:solution', title: 'Solution',
    // P1658 v8 (founder: "I expect high level solution, for example, our five steps"): the path from the problem to what the customer wants, in
    // steps. v7's Solution listed the team package (Offers & Pricing) and the free mastermind (Go-to-market strategy).
    // P1658 v9 (founder: "a solution describes a solution and not the state of the solution"): the steps only, as the intended model, in the
    // present tense. No status (where the business stands goes in My current biggest challenge) and no "The business does not <Y>" stance: a
    // rule the business keeps goes to Guiding values only as "X over Y", else it is left out. An outcome the owner claims inside a disclaimer
    // ("does not claim to make a team correct … only to remove false confidence") stays, as a step.
    type: 'Claim about the path the business intends from the customer\'s problem to what they want', voice: 'third-person',
    definition: `The customer's path from the problem to what they want: up to five steps of what happens for them. Not the sale, package, price or channel. No rule the business keeps; a disclaimer's claimed outcome is a step.`,
    shape: `"<step 1>, then <step 2>[, then up to <step 5>]."`,
    good: `"An owner photographs each receipt into a chat thread, then the business logs it that night, matches it to the bank statement each week and files the return before the deadline."`,
    not: `"The business logs receipts nightly; piloted with two cafés." (status: where the business stands goes in My current biggest challenge) / "The business does not file a return the owner has not seen." (a rule the business keeps: Guiding values only if the owner says it as "X over Y", else left out) / "The business does not promise a perfect return, only one filed on time." (a disclaimer: its outcome is a step, "…, then files the return on time") / "The business sells monthly books for 2,500 baht per shop." (an offer: Offers & Pricing) / "The business answers questions in café-owner groups." (a channel: Go-to-market strategy) / "The business logs receipts the same night, which removes the deadline pile-up." (the reason is inside the point)`,
    // The gap asks for the part a steps point most often lacks (the steps); the empty-box question is the one the code had before.
    gap: `What steps take your customer from the problem to what they want?`,
    empty: `What do you do about it?`,
  },
  {
    tag: 'canvas:channels', title: 'Go-to-market strategy',
    // P1658 v9 (founder: "go-to-market strategy is what i plan and how i plan"): where and how the business reaches customers, as the intended
    // model. A grounded channel exclusion stays. Results, timing, waiting and conditions leave: a blocker goes to My current biggest challenge,
    // an owner-stated order of customer goals to My next milestone ("ahead of"); other timing is left out.
    type: 'Stance on where and how the business reaches them', voice: 'third-person',
    // /finish review of v9: name what is banned (waiting, conditions, dates) so a cadence ("weekly", the good example) stays; the naming rule
    // already allows public platforms in both prompts, so "Public platform names allowed." paid for the Offers wording.
    definition: `Where and how the business reaches this segment. No waiting, conditions or dates; a cadence stays.`,
    shape: `"The business <action> in <place>[, not <ruled-out path>]."`,
    good: `"The business answers tax questions weekly in two café-owner Facebook groups, not through paid ads."`,
    not: `"Social media and word of mouth." / "The business answers tax questions in café-owner groups; three clients came this way so far." (a traction count) / "The business posts in café-owner groups once the tax season starts." (timing: an order of goals goes in My next milestone, a blocker in My current biggest challenge) / "We post in café-owner groups because owners trust peers more than ads." (first person, with the reason inside)`,
    // v9: the box is the intended model, so its question asks for the plan, never for how past customers came (a result).
    gap: `Where do your customers gather, and how do you reach them there?`,
  },
  {
    tag: 'canvas:revenue', title: 'Offers & Pricing',
    // P1658 v9 (founder: "Install 4,500 euro once … but for what? It doesn't describe the offer"): what the customer gets, then the price per
    // unit per period ("once" is a period), as the intended model: no state slot. With no price stated, the deliverable stays and the gap
    // question asks for the terms (Partial beats empty). The lead's price stays out of its contrast clause (canvas-price.ts, Known limitations).
    type: 'Claim about what the customer gets and its terms, and which offer comes first', voice: 'third-person',
    // /finish review of v9: the Copy prompt lacked the drafting prompt's Offers rule, and the self-run wrote "…: paid, on terms agreed before it
    // starts" in the price slot. "Only as you stated them" covers price, unit and period (no invented "once"); Partial beats empty keeps the
    // deliverable alone when no price is stated; a price with nothing it buys ("Install: 4,500 EUR once") is no point.
    // Round 2: the self-run filled the price slot with "paid, on terms agreed before the first session". The price parts are bracketed (optional,
    // so nothing has to fill them) and "nothing else" keeps terms and conditions out.
    // Round 3: run 3 still wrote "with terms agreed before the first session" ("nothing else" read as allowing stated terms), so the definition
    // names it; and each price part is bracketed on its own, so a stated price with no unit or cadence never invites an invented one.
    definition: `What the customer gets, then price per unit per period or once, only as you stated them; no terms or conditions; no price without what it buys.`,
    shape: `Open with "The offer to sell first is <what is bought>, <ahead of|not> <other offer>[; <price + currency>[ per <unit>][ <cadence>]]." when grounded; then "<what is bought>[: <price + currency>[ per <unit>][ <cadence>]]."`,
    good: `"The offer to sell first is monthly books and tax filing, ahead of payroll; 2,500 baht per shop per month." / "A year-end tax return filed for the owner: 6,000 baht per shop once."`,
    not: `"Affordable packages." / "Setup: 6,000 baht once." (names no deliverable: what is set up?) / "Monthly books: 2,500 baht per shop per month; two shops pay it." (a traction count) / "I charge 2,500 baht a month because cafés cannot afford an accountant." (first person, with the reason inside)`,
    gap: `What does the customer get, what does it cost, per what unit, how often, and which offer do you sell first, ahead of which other?`,
    empty: `What does a customer buy, for how much, and which offer do you sell first, ahead of which other?`,
  },
  {
    tag: 'canvas:metrics', title: 'My next milestone',
    type: 'Target, and what comes first', voice: 'third-person',
    // P1658 v9: the next customer result and its order against later goals, where an owner-stated sequence moved out of Go-to-market lands.
    definition: `The next result customers produce (pay, renew, refer).`,
    // P1658 v8: "ahead of" only. A later goal is never rejected (v7: "…session 1 … (target), not 3-7 paid pilots").
    shape: `Open with "The next milestone is <target>, ahead of <later goal>." when grounded; then "<target>[; if missed, <stated change>]." A <target> is "<number> <customers> <action>[ by <date>] (target)".`,
    good: `"The next milestone is 10 cafés paying monthly by 31 March 2027 (target), ahead of opening a second city."`,
    not: `"I aim for 10 cafés paying monthly by 31 March 2027." (about the owner's aim, which nobody can dispute) / "Launch the new website and grow."`,
    gap: `What number, by what date, comes next, and which goal comes after it?`,
    empty: `What number, by what date, would show this is working, and what comes after it?`,
  },
  {
    tag: 'canvas:love', title: 'Guiding values',
    type: 'Decision policy', voice: 'as written',
    definition: `A rule your business and partners live by: which good thing you give up when two good things conflict. Both X and Y are good. Business culture, not a personal habit.`,
    shape: `"X over Y[, even when <what it costs>]."`,
    good: `"Filing on time over filing perfectly, even when a late receipt means correcting the return afterwards."`,
    not: `"Integrity and customer focus." / "I keep weekends for family." / "Accuracy over speed, because a wrong return costs the owner more." (the reason is inside the point)`,
    gap: `What does your business choose over something else it cares about, even when it costs you? Write it as 'X over Y'.`,
  },
  {
    tag: 'canvas:good-at', title: 'My current biggest challenge',
    // No guess marker (P1658 fix round): the old "I think" rule, turned into "probably", let the engine keep an invented cause, against
    // GLOBAL_RULES "Grounding" (never invent obstacles). The obstacle is written only as the owner states it; otherwise the gap question asks.
    type: `The business's constraint, and which is biggest`, voice: 'third-person',
    // P1658 v9: where the business stands now goes here, including what it waits on (v8 run: "invitations wait for a call that can run the
    // Listening Game"), now that Solution, Offers & Pricing and Go-to-market strategy carry no status.
    definition: `The obstacle most likely to stop this now: where you are (A), where you want to be (B). The obstacle only as you state it.`,
    // Round 2 Copy-prompt run: a bare <X> let "The chosen challenge is an online session …, not a one-to-one call campaign" in (a Go-to-market choice).
    shape: `Open with "The <chosen|biggest> challenge is <obstacle>, <ahead of|not> <other obstacle>." when grounded; then "The business is at <A> and wants <B>; the obstacle is <barrier>."`,
    good: `"The biggest challenge is getting first calls with café owners, ahead of setting a price." (the owner ranked them) / "The business is at 3 replies from its last 20 messages to café owners and wants 10 first calls this month; the obstacle is that strangers writing about money look like scams to them."`,
    not: `"Finding time." / "I think strangers see a scam." (first person) / "The business is at 3 replies; the obstacle is probably trust." (a cause the owner never stated) / a copy of the customer's Problem`,
    // No `empty`: the gap already asks for the core fact and the ranking, so emptyQuestionFor falls back to it (fix round 3).
    gap: `Where are you now, where do you want to be, what is in the way, and which challenge is biggest, ahead of which other?`,
  },
  {
    tag: 'canvas:world-needs', title: `Hypotheses I've falsified`,
    // P1658 v9 (founder: "I falsified so many hypotheses … it just shows one"): up to the box cap of falsified expectations, each with its
    // contrary evidence and the change only when stated. Selection when more qualify: the owner's weight, else what most changed the current
    // focus. Whole dropped directions still land here (ONE_SALE_LOOP_PLAIN), evidence or not, so the evidence slot is optional and never
    // invented; a single ruled-out detail with no evidence story is a "not" point in its own box (/finish review: the two read as one case).
    type: 'Evidence', voice: 'third-person, past',
    definition: `Up to ${MAX_POINTS_PER_BOX} expectations that evidence proved wrong (a test, event or prospect conversation). If more: those you weigh most, else those that most changed the current focus. Without evidence, a dropped direction still goes here; a single ruled-out detail is a "not" point in its box.`,
    shape: `"The business expected <X>[; <contrary evidence>][; so it <stated change>]."`,
    good: `"The business expected café owners to run a bookkeeping app themselves; 0 of 8 trial cafés still used it after a month, so it now does their books for them." / "The business expected café owners to pay yearly; the owners it asked all wanted to pay monthly." / "The business expected café chains to buy; so it now sells to independent cafés." (a dropped direction with no evidence still goes here)`,
    // /finish review round 2: a whole customer group is a direction (it lands here, evidence or not), so the "not" example is one detail; and a
    // reason or an estimate is not evidence (an organisations run wrote a projection as the contrary evidence).
    // Round 3: an "estimate is no evidence" example taken from a test pack's own material made both of its runs drop that pack's whole
    // falsified direction. Examples stay in the café domain, and a direction with no evidence is shown kept (good, above), never dropped.
    not: `"The business learned customers value relationships." / "The business expected owners to send receipts by email." (one detail with no evidence: a "not" point in its own box)`,
    gap: `Which expectations did a test, an event or a conversation with a prospect prove wrong, and what did you change?`,
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
