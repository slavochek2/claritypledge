/**
 * @file series-recipes.ts
 * @description P1542 — which prepare and close steps each event series uses.
 *
 * A recipe is an ordered list of step ids taken from the steps the two pages already have. A series
 * with no entry gets the Clarity Night recipe, so every existing event behaves exactly as before.
 * Keyed by the stored series key (`events.series_slug`), never the title (P1403's rule).
 *
 * Deliberately NOT a step engine: no editor, no per-event overrides, no new step types. A third
 * series (the sales mastermind) adds one entry here, and one condition only if it needs one.
 */
import type { Event } from '@/app/types';
import type { PersonalAsk } from '@/app/data/event-close-service';
import { ALL_STEPS, type PlanStep } from './prep/prep-plan';

/** The close steps a recipe can list. 'asks' stands for the personal asks Postgres still offers. */
export type CloseStepId = 'score' | 'topics' | 'positions' | 'stance' | 'improve' | 'appreciate';
export type CloseRecipeItem = CloseStepId | 'asks';

export interface SeriesRecipe {
  close: CloseRecipeItem[];
  /** The "what was good" step's words. */
  appreciate: {
    question: string; consent: string; placeholder: string; helper?: string;
    /** The step header's name; omitted = the shared "Feedback: what was good" (Clarity Night). */
    stepName?: string;
    /** Writing is optional (P1542 VQA round 4): Submit stays enabled, and an empty Submit just continues, saving no quote. */
    optional?: boolean;
  };
  /** The close opens on a "We need your feedback" screen with the agenda. False = the room's card is that screen,
   *  and its button lands on the first question (UAT 2026-10-23: one entry, one time estimate). */
  closeIntro: boolean;
  /** The CMP re-check as ONE step: the value-perception statements and the stance together (UAT 2026-10-23). */
  cmpOneStep: boolean;
  /** The event room's card once the event has ended. `title: null` = just the button, with `body` as small text under it. */
  roomClose: {
    title: string | null; body: string; /** With `title: null`: a heading above the lone button (visual review round 5). */ heading?: string;
    /** The button's words; omitted = "Give feedback". Round 6 (B): a hike says "Start now", so the card does not repeat the step's name. */
    cta?: string;
    /** Round 6 (B): once this person's feedback is finished, the card says so with no button. Omitted = the card is unchanged. */
    finished?: string;
  };
  /** The thank-you's invitation to the series' next event, and what the series' past guests are called.
   *  null = no next-event offer on the thank-you (a hike: often there is no next one, founder 2026-10-23). */
  next: { heading: string; seriesPeople: string } | null;
  /** The community ask ("Join … as member"). `named`: headed with the group's own name and offered only to someone
   *  who finished the learning (otherwise the thank-you's learning link stands in), with "Review group terms" →
   *  "Accept and join" / a "Not now" text link. Clarity Night keeps its wording (`named: false`). */
  joinOffer: { named: boolean };
  /** The caption under the group chat on the feedback thank-you (null = none). */
  afterChatCaption: string | null;
  /** The /close score step's header name; omitted = "How was it?". */
  scoreStepName?: string;
  /** Round 6 (decision 43): an offer the app knows is done is not advertised again — the group chat once this person
   *  opened it, the learning once learned, the join once a member. False = every surface is unchanged (Clarity Night). */
  smartOffers: boolean;
  prepare: {
    steps: PlanStep[];
    /** Offered from the event room, never required: no room gate, no `preparation_enabled` needed. */
    optional: boolean;
    /** P1542 founder decision (A): steps the person already finished elsewhere stay in the plan, shown finished, and
     *  can be opened again; the flow lands on the next unfinished step. Absent = Clarity Night's shortened plan (P1336). */
    keepFinished?: boolean;
    /** The room's, thank-you's and feedback-end's single quiet link to it (null = the "Preparation not started"
     *  status + CTA). Takes the community's name (the event's organising group, null when it has none). */
    offer: { start: (community: string | null) => string; resume: (community: string | null) => string } | null;
    /** The flow's own words where it is learning, not preparing (null = Clarity Night's "Preparation" words). */
    words: {
      planTitle: (community: string | null) => string;
      endTitle: (community: string | null) => string;
      /** Round 6 (F): the end of learning opened inside the room — what was learned, then the room's next step. */
      roomEnd: { title: string; nextOptIn: string; nextFeedback: string; toOptIn: string; toFeedback: string };
    } | null;
  };
  /** The start-time line: "We start at 18:30 sharp." or, for a hike, "We meet at 13:22 at <meeting point>." */
  timeLine: 'start-sharp' | 'meet';
  /** What the attendee's event room has. A hike room is the principle opt-in, the roster, the optional preparation and Feedback. */
  room: {
    /** The "how up for thinking are you" step before the room (and the Ready step in the bar). */
    readiness: boolean;
    /** The rounds: Table and Compare. */
    rounds: boolean;
    /** Feedback is open to anyone registered at any time — before, during and after the event — with no host
     *  "End the evening" (founder 2026-10-26: a hike's Give feedback is never greyed out). False = the host ends it. */
    feedbackAlwaysOpen: boolean;
    /** The principle decision's question, in the room and in the preparation. */
    principleQuestion: { room: string; prepare: string };
    /** The step bar's words where they differ from the shared ones, plus an optional "Learn" step first
     *  (the learning flow, done once it is complete). Founder 2026-10-23: a hike's bar is verbs. */
    steps: { learn: string | null; principle: string; close: string } | null;
    /** The principle certificate's eyebrow in the room (round 6b: a hike's says "this hike"). */
    principleKicker: string;
    /** The room's Transcribe bar (founder decision 2, round 6: a hike has none). */
    transcribe: boolean;
    /** Round 6 (G): one header on every room view — the shell's "← Back to the event", which always lands on the event
     *  page, then the step bar. False = the compact arrow inline with the step bar (Clarity Night). */
    backToEvent: boolean;
  };
}

/** Today's close and preparation, word for word. */
export const CLARITY_NIGHT_RECIPE: SeriesRecipe = {
  close: ['score', 'topics', 'positions', 'stance', 'improve', 'appreciate', 'asks'],
  appreciate: {
    question: "What did you like about today's event?",
    consent: 'You may quote me by name to invite new people to future events.',
    placeholder: 'Your experience in 2-3 sentences. Who do you think should come to our future events, and why?',
  },
  closeIntro: true,
  cmpOneStep: false,
  roomClose: { title: 'Thanks for coming', body: 'The evening has ended. Two minutes to tell us how it went?' },
  next: { heading: 'Join the next Clarity Night', seriesPeople: 'to Clarity Nights' },
  joinOffer: { named: false },
  afterChatCaption: null,
  smartOffers: false,
  prepare: { steps: ALL_STEPS, optional: false, offer: null, words: null },
  timeLine: 'start-sharp',
  room: {
    readiness: true,
    rounds: true,
    feedbackAlwaysOpen: false,
    principleQuestion: {
      room: 'Do you want to try this principle with the people at this event?',
      prepare: 'Do you want to follow this principle with the attendees at the event?',
    },
    steps: null,
    principleKicker: 'A commitment for this conversation',
    transcribe: true,
    backToEvent: false,
  },
};

export const SOCIAL_HIKE_RECIPE: SeriesRecipe = {
  // No topic vote after a hike. The CMP re-check only appears for someone who prepared.
  close: ['score', 'positions', 'stance', 'improve', 'appreciate', 'asks'],
  // Founder 2026-10-23: a recommendation, one helper line, the consent ticked by default.
  appreciate: {
    // Founder UAT round 5: the question asks for openness to share, and stands alone (no helper line).
    question: 'Are you open to sharing a recommendation for future hikers?',
    consent: 'Quote me by name to promote future hikes',
    placeholder: 'What would you tell someone joining their first hike?',
    stepName: 'Recommend',
    optional: true,
  },
  // UAT 2026-10-23: the room's card IS the feedback intro (one entry, one time estimate); the close starts at the score.
  closeIntro: false,
  cmpOneStep: true,
  // Founder 2026-10-23: just the button, "Takes 2 minutes" small under it; no "We need your feedback".
  // Visual review round 5 (F): a question above the lone button, so the step is not a button under its own name.
  // Round 6 (B): the button says what it does ("Start now"), not the step's name; finished, the card just says so.
  roomClose: { title: null, body: 'Takes 2 minutes', heading: 'How was the hike?', cta: 'Start now', finished: 'Thanks, your feedback is in.' },
  // Founder 2026-10-23: no next-hike offer on the thank-you (often there is no next hike).
  next: null,
  joinOffer: { named: true },
  // Founder 2026-10-26 (round 9).
  scoreStepName: 'How was the hike for you?',
  // Founder 2026-10-26 (round 9): two lines.
  afterChatCaption: 'Share photos from this hike\nGet info about the next one',
  smartOffers: true,
  // Optional, and shorter (founder, 2026-10-22): no "how this event is different", no R&D volunteering.
  // UAT 2026-10-23: for a hike it is not preparation, it is learning what this community is: one quiet link.
  prepare: {
    steps: ALL_STEPS.filter((s) => s !== 'welcome' && s !== 'research'),
    optional: true,
    keepFinished: true,
    offer: {
      start: (community) => `Learn about ${community ?? 'this community'}`,
      resume: (community) => `Continue learning about ${community ?? 'the community'}`,
    },
    // Founder round 3 (2026-10-23): learning language throughout, never "preparing".
    words: {
      // Visual review round 5: one heading on the plan, naming the community (the header no longer repeats it).
      planTitle: (community) => `Get to know ${community ?? 'the community'}`,
      endTitle: (community) => `Thanks for taking the time to learn about ${community ?? 'the community'}`,
      // Round 6 (F, decision 44): no community name in it, so nothing waits on the name and nothing shows a fallback.
      roomEnd: {
        title: "You've learned the clarity principle",
        nextOptIn: 'Next: decide whether to try the principle on this hike.',
        nextFeedback: 'Next: tell us how the hike went (2 minutes).',
        toOptIn: 'Continue',
        toFeedback: 'Continue',
      },
    },
  },
  // Founder round 3: "sharp" is Clarity Night's tone; a hike states the meeting time and place plainly.
  timeLine: 'meet',
  room: {
    readiness: false,
    rounds: false,
    feedbackAlwaysOpen: true,
    principleQuestion: {
      room: 'Do you want to try this principle with the people on this hike?',
      prepare: 'Do you want to follow this principle with the people on this hike?',
    },
    // Founder 2026-10-26: "Learn the principle" (no "(optional)"), "Decide" (was "Opt in"), "Give feedback".
    steps: { learn: 'Learn the principle', principle: 'Decide', close: 'Share feedback' },
    principleKicker: 'A commitment for this hike',
    transcribe: false,
    backToEvent: true,
  },
};

const RECIPES: Record<string, SeriesRecipe> = {
  'social-hike': SOCIAL_HIKE_RECIPE,
};

export function recipeFor(seriesSlug: string | null | undefined): SeriesRecipe {
  return (seriesSlug && RECIPES[seriesSlug]) || CLARITY_NIGHT_RECIPE;
}

export interface CloseConditions {
  /** The person answered the cmp7 statements (the preparation's positions). */
  prepared: boolean;
  /** How many of the three opt-in statements exist. */
  stanceCount: number;
  /** The personal asks that still apply, in the server's order. */
  asks: PersonalAsk[];
}

export type ResolvedCloseStep = CloseStepId | PersonalAsk;

/** The recipe's close, with its two conditions applied: "only if prepared" and "only while it applies". */
export function resolveCloseSteps(recipe: SeriesRecipe, c: CloseConditions): ResolvedCloseStep[] {
  const out: ResolvedCloseStep[] = [];
  for (const item of recipe.close) {
    if (item === 'asks') out.push(...c.asks);
    else if (item === 'positions') { if (c.prepared) out.push(item); }
    else if (item === 'stance') { if (c.prepared && c.stanceCount > 0 && !recipe.cmpOneStep) out.push(item); }
    else out.push(item);
  }
  return out;
}

/** Is this event's Feedback open regardless of the clock (a hike's, founder 2026-10-26)? Other recipes keep the host's
 *  "End the evening". Submitting early is fine: the submit time is recorded. */
export function feedbackAlwaysOpen(event: Pick<Event, 'seriesSlug'> | null | undefined): boolean {
  return !!event && recipeFor(event.seriesSlug).room.feedbackAlwaysOpen;
}

/** The room offers the preparation: required by the event's flag, or optional by the series' recipe. */
export function offersPreparation(event: Pick<Event, 'preparationEnabled' | 'seriesSlug'> | null | undefined): boolean {
  return !!event && (!!event.preparationEnabled || recipeFor(event.seriesSlug).prepare.optional);
}

/** The room stops people at the preparation gate only when it is required, never when the recipe makes it optional. */
export function gatesRoomOnPreparation(event: Pick<Event, 'preparationEnabled' | 'seriesSlug'> | null | undefined): boolean {
  return !!event?.preparationEnabled && !recipeFor(event.seriesSlug).prepare.optional;
}

/** How long before the planned end a hike room starts opening on "Give feedback" (founder 2026-10-23). */
export const FEEDBACK_DEFAULT_LEAD_MS = 30 * 60 * 1000;

/**
 * Founder 2026-10-23, one rule for every event: which step a room opens on (hikes and Clarity Night alike). Until (start + duration − 30 min) → the opt-in
 * ('principle'); from then on → 'close' (Give feedback). Never before the start (a hike shorter than 30 minutes
 * switches at its start), so the default is never a step that is still closed. People can always switch.
 */
export function defaultRoomStep(
  event: Pick<Event, 'datetime' | 'durationMinutes'>,
  now: number = Date.now(),
): 'main' | 'close' {
  const start = new Date(event.datetime).getTime();
  const switchAt = Math.max(start, start + (event.durationMinutes ?? 0) * 60 * 1000 - FEEDBACK_DEFAULT_LEAD_MS);
  // 'main' = the event's own landing step (a hike: Opt in; Clarity Night: where it lands today).
  return now >= switchAt ? 'close' : 'main';
}
