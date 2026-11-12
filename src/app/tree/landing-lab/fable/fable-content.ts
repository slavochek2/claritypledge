/**
 * Copy and citations for the /tree/landing-fable* design explorations (P1665, P1667).
 * Builders copy is a verbatim copy of the constants in src/app/pages/build-right-thing-landing.tsx,
 * and change-managers copy of src/app/pages/change-managers-page.tsx and the shared sections it
 * renders; neither exports them. If this design is adopted, the pages read the originals and this
 * file goes. The hero examples (AGREED_*) exist only here.
 */
import { NEUTRAL_HIERARCHY_TEXT } from "@/app/components/landing/why-nobody-verifies";
import { NEUTRAL_MAINTAIN_TEXT } from "@/app/components/landing/team-norm-section";
import { TEAM_CAST, type ExchangeCast } from "@/app/content/exchange-casts";

/** The content column every section of these pages shares. */
export const SHELL = "container mx-auto max-w-6xl";

export type Reference = { n: number; label: string; url: string };
export type Reason = { title: string; text: string; refs: number[] };

export const REFERENCES: Reference[] = [
  { n: 1, label: "CB Insights — The Top Reasons Startups Fail (no market need: the #1 reason, cited in 35% of post-mortems)", url: "https://www.cbinsights.com/research/startup-failure-reasons-top/" },
  { n: 2, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 3, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 4, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 5, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 6, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 7, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

export const ASSUMED_STATS = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 2 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 2 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 3 },
];

export const REASONS_NOBODY_CHECKS: Reason[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", refs: [4] },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", refs: [5] },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", refs: [6, 7] },
];

/** /change-managers: only the citations that page uses, numbered in its reading order. */
export const CHANGE_REFERENCES: Reference[] = [
  { n: 1, label: "IBM Global Business Services (2008), Making Change Work (survey of 1,532 change practitioners)", url: "https://www.ibm.com/downloads/cas/ZGOKYPNL" },
  { n: 2, label: "Newton (1990), The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 3, label: "Camerer, Loewenstein & Weber (1989), The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
];

/** The three reasons as the shared WhyNobodyVerifiesSection words them; hierarchy carries no citation. */
export const CHANGE_REASONS: Reason[] = [
  { title: "Hierarchy", text: NEUTRAL_HIERARCHY_TEXT, refs: [] },
  { title: "Illusion of transparency", text: "We think our meaning is obvious. People tapping a song expect half of listeners to name it; 2.5% do.", refs: [2] },
  { title: "Curse of knowledge", text: "Once you know something, it is hard to feel what the other person is missing.", refs: [3] },
];

/** The five-step path of the shared TeamNormSection. `blue`: which of the five people have picked it up. */
export const NORM_PATH: { title: string; text: string; strip: { blue: number[]; questions?: number[]; plus?: boolean } }[] = [
  { title: "See the cost", text: "Where gaps cost the most.", strip: { blue: [], questions: [1, 3] } },
  { title: "Find champions", text: "People who naturally reveal gaps.", strip: { blue: [1] } },
  { title: "Spread", text: "In important meetings, with a simple structure.", strip: { blue: [1, 2, 3] } },
  { title: "Norm", text: "Verifying before important decisions is expected.", strip: { blue: [0, 1, 2, 3, 4] } },
  { title: "Maintain", text: NEUTRAL_MAINTAIN_TEXT, strip: { blue: [0, 1, 2, 3, 4], plus: true } },
];

/** The office cast of the gap exchange, under prototype event names so a dev view never counts as a production one. */
export const FABLE_CAST: ExchangeCast = { ...TEAM_CAST, viewEvent: "tree_landing_fable_exchange_viewed", surface: "tree-landing-fable-exchange" };

/**
 * The hero example: one sentence everyone agreed to, then what each person did.
 * `diverged`: shipped their own reading of the sentence (ticked). `stalled`: did not change (empty
 * circle). `changed`: did (ticked).
 * Invented, and labelled "Illustration" where it renders.
 * [FOUNDER DECISION: the example sentences, names and outcomes are drafted placeholders]
 */
export type AgreedOutcome = "diverged" | "stalled" | "changed";
export type AgreedExample = {
  when: string;
  said: string;
  agreed: string;
  later: string;
  people: { name: string; did: string; outcome: AgreedOutcome }[];
  punchline: string;
};

export const AGREED_BUILDERS: AgreedExample = {
  when: "Monday · planning",
  said: "Let's make onboarding simpler.",
  agreed: "4 of 4 agreed",
  later: "By Friday · what “simpler” meant",
  people: [
    // Two opposing pairs, each a fair reading of "simpler": fewer steps against more guidance,
    // fewer options against everything in one place.
    { name: "Maya", did: "shipped fewer steps", outcome: "diverged" },
    { name: "Jon", did: "shipped more guidance", outcome: "diverged" },
    { name: "Priya", did: "shipped fewer options", outcome: "diverged" },
    { name: "Sam", did: "shipped everything on one screen", outcome: "diverged" },
  ],
  // Says outright what the four ticks do not: everyone delivered, and no two delivered the same thing.
  punchline: "One sentence. Four meanings. All four shipped.",
};

export const AGREED_CHANGE: AgreedExample = {
  when: "Monday · team meeting",
  said: "From Monday we all use the AI assistant for weekly reports.",
  agreed: "5 of 5 said yes",
  later: "Three weeks later",
  people: [
    { name: "Marco", did: "still writes reports the old way", outcome: "stalled" },
    { name: "Lena", did: "tried it once, then stopped", outcome: "stalled" },
    { name: "Tom", did: "is still waiting for a walkthrough", outcome: "stalled" },
    { name: "Ana", did: "uses it for emails, not reports", outcome: "stalled" },
    { name: "Kim", did: "uses it for every report", outcome: "changed" },
  ],
  punchline: "Five said yes. One changed.",
};
