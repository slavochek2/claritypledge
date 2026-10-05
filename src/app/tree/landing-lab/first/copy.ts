/**
 * Landing lab "Go first": every visitor-facing string this prototype renders.
 *
 * Three sources, kept apart on purpose:
 *
 *  - FOUNDER lines come from ../content, verbatim. Story beats are whole sentences cut
 *    out of FOUNDER.st1 by omission only, never retyped (see `sentences` below).
 *  - FOUNDER_DECK holds the founder's own slide wording, copied verbatim.
 *  - PROPOSALS holds every line an agent wrote. None of it is approved. It is one flat
 *    list so the founder can read it top to bottom and accept, change or strike each one.
 *    No draft marker is rendered on the page, at the founder's request, so this list is
 *    the only place the difference is visible.
 *
 * Components never render these objects directly. They render the display versions at the
 * bottom of this file (TEXT, STORY_TEXT, DECK_TEXT), which only change typography: straight
 * apostrophes become curly, and “I don’t is kept on one line. The words stay the source's.
 *
 * No component may write a visitor-facing string inline.
 */
import { FOUNDER } from "../content";
import type { Route } from "./machine";

/** Splits a paragraph into its sentences, keeping each one byte for byte. */
export function sentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.?!])\s+/);
}

/** One sentence by position. Fails loudly if the founder's paragraph ever changes shape. */
function sentence(paragraph: string, index: number): string {
  const found = sentences(paragraph)[index];
  if (found === undefined) throw new Error(`landing-first: sentence ${index} missing from "${paragraph.slice(0, 40)}"`);
  return found;
}

/** Founder text as the journey uses it. Every value is a slice of FOUNDER, never a rewrite. */
export const STORY = {
  /** Screen 1 headline, from the current homepage. */
  headline: FOUNDER.normalToAdmit,
  /** Screen 1, story beat 1: "I asked them if they think I understand them." */
  askedThem: sentence(FOUNDER.st1[0], 1),
  /** Screen 2, beat 2: "They said: yes." */
  saidYes: sentence(FOUNDER.st1[0], 2),
  /** Screen 2, beat 3: "Days later, they said I didn't understand them." */
  daysLater: sentence(FOUNDER.st1[0], 3),
  /** Screen 3: the sentence that ends "has at least three meanings." */
  threeMeanings: sentence(FOUNDER.st1[1], 2),
  /** Screen 3, the three definitions, in the founder's order. */
  meanings: [FOUNDER.st1[2], FOUNDER.st1[3], FOUNDER.st1[4]] as const,
  /** Screen 6: disrespect, seeming stupid, then the pretending. */
  norm: FOUNDER.norm,
  /** Screen 7, the line above the fork: the community's earlier blurb. */
  hiddenNumber: FOUNDER.hiddenNumber,
} as const;

/**
 * Verbatim wording from the founder's talk deck, `public/presi3/index.html`.
 * Slide 8 is the "Why almost nobody verifies" slide. Slide 48 is the Point A to Point B
 * diagram; only its two endpoint labels are used, and its obstacle list is not.
 */
export const FOUNDER_DECK = {
  /** Slide 8, kicker. */
  whyNobodyVerifies: "Why almost nobody verifies cognitive understanding",
  /** Slide 8, headline. */
  noSocialNorm: "No social norm to admit “I don’t understand”",
  /** Slide 48, endpoint names and their captions. */
  pointA: "Point A",
  pointAText: "you can't reveal the gaps in understanding",
  pointB: "Point B",
  pointBText: "you can reveal and bridge the gaps",
  /** Slide 48, the heading of the block between the two points. */
  obstacle: "OBSTACLE",
} as const;

/**
 * Every agent-written line on the page. NOT APPROVED. Founder decisions, all of them.
 * Lines quoted from JOURNEY.md are here too: the journey document is agent-written.
 * Terms: one explain-back attempt is a "try"; a two-person practice is a "session";
 * a group meetup is an "event". Labels and buttons carry no full stop; sentences do.
 */
export const PROPOSALS = {
  // Chrome, every screen
  skip: "Skip to main site",
  logoLabel: "ClarityPledge home",
  next: "Next",
  back: "Back",
  progressLabel: "Your place in the story",

  // Screen 2, the chip where the two bodies meet
  slotYes: "Yes",
  slotNeverVerified: "Never verified",

  // Screen 4, how a rating reads
  outOf: "out of 10",

  // Screen 4, the demonstration
  demoLabel: "One person speaks. The other explains it back. The speaker rates it out of 10.",
  /** The same idea in one line, for the pinned header when the demonstration scrolls. */
  demoLabelCompact: "Speak, explain back, rate it",
  demoPending: "Made-up example",
  demoSpeaker: "Speaker",
  demoExplainBack: "Listener explains back",
  demoRating: "Speaker's rating",
  demoSecondExplainBack: "Listener explains back again",
  demoRound1: "First try",
  demoRound2: "Second try",
  demoGuessPrompt: "How would the speaker rate this?",
  demoYourGuess: "Your guess",
  demoSampleStatement: "I need more time for the launch.",
  demoSampleExplainBack1: "So you're behind schedule, and you need a few more days to catch up.",
  demoSampleMissed: "I'm not behind. I found a problem, and I won't ship it.",
  demoSampleExplainBack2: "The extra time is to fix a problem, not to catch up.",
  mirrorLink: "Try it on something of your own with an AI rehearsal",

  // Screen 6, the adapted obstacle between Point A and Point B (the founder asked for it)
  normObstacle: "no social norm",

  // Screen 7, the fork. The line above it is the founder's (STORY.hiddenNumber).
  forkLineAlt: "Making it safe to admit misunderstanding starts when someone goes first.",
  forkQuestion: "Where would you like to start?",
  routeWork: "Use it on a stuck conversation at work",
  routeOne: "Try it with one person you know",
  routeRoom: "Join a group event",
  routeExamples: "Watch or read first",

  // Ending: work
  workQuestion: "Can you invite everyone in that conversation?",
  workYes: "Yes, I can",
  workNo: "No, someone else would",
  workFormTitle: "Ask for a first session at work",
  workNoNames: "Leave out names and confidential details.",
  workWhoReads: "What you write goes to the founder. It is never published.",
  workRetention: "In this preview nothing is sent and nothing is kept.",
  workFieldConversation: "What is the stuck conversation about?",
  workFieldRoles: "Who would take part? Roles, not names",
  workFieldRolesHint: "For example: two engineers and their product lead",
  workFieldContact: "How to reach you",
  workFieldSize: "About how many people work there?",
  workSizeNone: "Choose one",
  workSize1: "Fewer than 10 people",
  workSize2: "10 to 50 people",
  workSize3: "51 to 250 people",
  workSize4: "251 to 1,000 people",
  workSize5: "More than 1,000 people",
  workVoluntary: "Everyone you invite must be free to say no.",
  workPersonal: "Each session is prepared with you before it starts.",

  // Ending: work, when the visitor cannot invite the people themselves
  workNoIntro: "Then send this invitation to the person who could bring everyone together.",
  inviteMessage: "I found a way to check what we really understood from each other. Could you take a look?",
  inviteNoTopic: "The invitation says nothing about your conversation.",
  inviteShare: "Share the invitation",
  inviteCopy: "Copy the invitation",
  inviteCopied: "Copied. Paste it wherever you talk to them.",
  inviteFailed: "Copying did not work here. Select the text above and copy it by hand.",

  // Previews, for the forms that submit nowhere in the prototype
  previewButton: "Preview what would be sent",
  previewTitle: "This is what would be sent. Nothing has been sent.",
  previewEmpty: "(left empty)",

  // Ending: one person
  oneIntro: "Open a session, then send the link to the person you have in mind. It uses your microphone.",
  oneCta: "Open a session for two",

  // Ending: room
  roomQuestion: "Are you in Chiang Mai?",
  roomChiangMai: "Yes, show me the next event",
  roomElsewhere: "No, I am somewhere else",
  roomElsewhereIntro: "Leave your email to hear about future events.",
  roomEmail: "Email",

  // Ending: examples
  examplesFilm: "Watch the founder's story",
  examplesFeed: "Read more stories",

  // Screen 5, the mirror
  mirrorTitle: "The mirror",
  mirrorIntro:
    "Write one or two sentences you want understood. The mirror tries to explain them back. Then you rate it.",
  mirrorNoNames: "Leave out names and confidential details.",
  mirrorInputLabel: "What you want to say",
  mirrorSubmit: "Explain it back",
  mirrorWaiting: "The mirror is reading.",
  mirrorNotAvailable: "The mirror is not available yet.",
  mirrorFailed: "The mirror did not answer. Try once more.",
  mirrorExplainBackLabel: "The mirror's explain-back",
  mirrorQuestion: "How well did the mirror understand what you meant? Rate it out of 10.",
  /** Accessible name of the rating buttons only. Not visible. */
  mirrorRatingLabel: "Your rating of the mirror's explain-back",
  mirrorYourRating: "Your rating",
  mirrorFeedbackLabel: "What did the mirror miss?",
  mirrorRetry: "Try again",
  mirrorAttempt: "Try",
  mirrorAttemptOf: "of",
  mirrorLastAttempt: "That was your last try.",
  mirrorClosing: "The mirror covers one step. The real practice is between two people.",
  mirrorReturn: "Continue",
} as const;

export type ProposalKey = keyof typeof PROPOSALS;

/** Render-time typography: straight apostrophes become curly ones. */
export function curly(text: string): string {
  return text.replace(/'/g, "’");
}

/**
 * Render-time only: joins the opening quote and "I" to the next word with a no-break
 * space, so a line never breaks inside “I don’t. The stored founder text is unchanged.
 */
export function keepQuoteTogether(text: string): string {
  return text.replace("“I don’t", "“I don’t");
}

/** Everything a component shows passes through this, and only this. */
export function display(text: string): string {
  return keepQuoteTogether(curly(text));
}

function displayAll<T extends Record<string, string>>(source: T): { readonly [K in keyof T]: string } {
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, display(v)])) as { [K in keyof T]: string };
}

/** PROPOSALS as shown on the page. */
export const TEXT = displayAll(PROPOSALS);

/** Founder story text as shown on the page. */
export const STORY_TEXT = {
  headline: display(STORY.headline),
  askedThem: display(STORY.askedThem),
  saidYes: display(STORY.saidYes),
  daysLater: display(STORY.daysLater),
  threeMeanings: display(STORY.threeMeanings),
  meanings: STORY.meanings.map(display),
  norm: STORY.norm.map(display),
  hiddenNumber: display(STORY.hiddenNumber),
} as const;

/** "OBSTACLE" becomes "Obstacle": card labels are sentence case. Display only. */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** Founder deck text as shown on the page. */
export const DECK_TEXT = { ...displayAll(FOUNDER_DECK), obstacle: sentenceCase(FOUNDER_DECK.obstacle) };

/** A link as shown to a reader: no protocol, and a line may break only after a slash. */
export function displayUrlParts(url: string): string[] {
  return url.replace(/^[a-z]+:\/\//i, "").split("/").map((part, i, all) => (i < all.length - 1 ? `${part}/` : part));
}

/** The fork's four route labels, by route, as shown. */
export const ROUTE_LABEL: Readonly<Record<Route, string>> = {
  work: TEXT.routeWork,
  one: TEXT.routeOne,
  room: TEXT.routeRoom,
  examples: TEXT.routeExamples,
};
