/**
 * P1542 — per-series prepare and close recipes. The Clarity Night recipe must resolve to exactly the
 * list the close built inline before recipes existed; the Social Hike recipe drops the topic vote and
 * shows the CMP re-check only to someone who prepared.
 */
import { isOnEventPages } from '@/app/components/layout/app-shell/shell-nav';
import { meetLine } from '@/app/prototypes/events/arrival/arrival-text';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CLARITY_NIGHT_RECIPE,
  SOCIAL_HIKE_RECIPE,
  feedbackAlwaysOpen,
  defaultRoomStep,
  gatesRoomOnPreparation,
  offersPreparation,
  recipeFor,
  resolveCloseSteps,
} from '@/app/prototypes/events/series-recipes';
import { ALL_STEPS, buildPlan } from '@/app/prototypes/events/prep/prep-plan';
import type { PersonalAsk } from '@/app/data/event-close-service';

/** The close's step list exactly as EventClosePage built it before P1542. */
function legacyClarityNightSteps(positionCount: number, stanceCount: number, asks: PersonalAsk[]) {
  const s: string[] = ['score', 'topics'];
  if (positionCount > 0) s.push('positions');
  if (positionCount > 0 && stanceCount > 0) s.push('stance');
  s.push('improve', 'appreciate');
  if (asks.length) s.push(...asks);
  return s;
}

const ASK_SETS: PersonalAsk[][] = [[], ['community'], ['connect'], ['community', 'connect']];

describe('P1542 recipes: Clarity Night is unchanged', () => {
  it('resolves to the pre-recipe list for every combination of conditions', () => {
    for (const positions of [0, 7]) for (const stance of [0, 3]) for (const asks of ASK_SETS) {
      expect(resolveCloseSteps(CLARITY_NIGHT_RECIPE, { prepared: positions > 0, stanceCount: stance, asks }))
        .toEqual(legacyClarityNightSteps(positions, stance, asks));
    }
  });

  it('is the recipe for the clarity-night key, no key, and an unknown key', () => {
    expect(recipeFor('clarity-night')).toBe(CLARITY_NIGHT_RECIPE);
    expect(recipeFor(undefined)).toBe(CLARITY_NIGHT_RECIPE);
    expect(recipeFor(null)).toBe(CLARITY_NIGHT_RECIPE);
    expect(recipeFor('some-future-series')).toBe(CLARITY_NIGHT_RECIPE);
  });

  it('keeps the words people see today', () => {
    expect(CLARITY_NIGHT_RECIPE.appreciate.question).toBe("What did you like about today's event?");
    expect(CLARITY_NIGHT_RECIPE.appreciate.consent).toBe('You may quote me by name to invite new people to future events.');
    expect(CLARITY_NIGHT_RECIPE.roomClose).toEqual({ title: 'Thanks for coming', body: 'The evening has ended. Two minutes to tell us how it went?' });
    expect(CLARITY_NIGHT_RECIPE.next?.heading).toBe('Join the next Clarity Night');
    expect(CLARITY_NIGHT_RECIPE.joinOffer).toEqual({ named: false });
    expect(CLARITY_NIGHT_RECIPE.afterChatCaption).toBeNull();
    expect(CLARITY_NIGHT_RECIPE.room.steps).toBeNull();
    expect(CLARITY_NIGHT_RECIPE.closeIntro).toBe(true);
    expect(CLARITY_NIGHT_RECIPE.cmpOneStep).toBe(false);
  });

  it('keeps preparation required by the flag, with every step', () => {
    expect(CLARITY_NIGHT_RECIPE.prepare).toEqual({ steps: ALL_STEPS, optional: false, offer: null, words: null });
    expect(offersPreparation({ preparationEnabled: false, seriesSlug: 'clarity-night' })).toBe(false);
    expect(offersPreparation({ preparationEnabled: true, seriesSlug: 'clarity-night' })).toBe(true);
    expect(gatesRoomOnPreparation({ preparationEnabled: true, seriesSlug: 'clarity-night' })).toBe(true);
  });
});

describe('P1542 recipes: Social Hike', () => {
  const hike = recipeFor('social-hike');
  it('is selected by the stored series key', () => {
    expect(hike).toBe(SOCIAL_HIKE_RECIPE);
  });

  it('has no topic vote', () => {
    for (const asks of ASK_SETS) for (const prepared of [true, false]) {
      expect(resolveCloseSteps(hike, { prepared, stanceCount: 3, asks })).not.toContain('topics');
    }
  });

  it('shows the CMP re-check only to someone who prepared', () => {
    expect(resolveCloseSteps(hike, { prepared: true, stanceCount: 3, asks: [] }))
      .toEqual(['score', 'positions', 'improve', 'appreciate']); // UAT 2026-10-23: the stance is inside the positions step
    expect(resolveCloseSteps(hike, { prepared: false, stanceCount: 3, asks: [] }))
      .toEqual(['score', 'improve', 'appreciate']);
    // The three about opting in need the statements to exist.
    expect(resolveCloseSteps(hike, { prepared: true, stanceCount: 0, asks: [] }))
      .toEqual(['score', 'positions', 'improve', 'appreciate']);
  });

  it('puts the personal asks last, in the server order, only while they apply', () => {
    expect(resolveCloseSteps(hike, { prepared: false, stanceCount: 0, asks: ['community', 'connect'] }))
      .toEqual(['score', 'improve', 'appreciate', 'community', 'connect']);
  });

  it('uses the hike wording; the room card is the feedback intro (one entry, one time estimate)', () => {
    // Founder UAT round 5: the openness question, and no helper line under it.
    expect(hike.appreciate.question).toBe('Are you open to sharing a recommendation for future hikers?');
    expect(hike.appreciate.placeholder).toBe('What would you tell someone joining their first hike?');
    expect(hike.appreciate.helper).toBeUndefined();
    // Founder 2026-10-30: no box on a hike — writing is the consent, and one line under the text box says so.
    expect(hike.appreciate.consent).toBeUndefined();
    expect(hike.appreciate.consentLine).toBe('By sharing, you agree we may publish your words with your name on the series page.');
    expect(hike.appreciate.placeholder).not.toMatch(/next hike|2-3 sentences/);
    // Founder 2026-10-23: just the button with "Takes 2 minutes"; no "We need your feedback".
    // Round 5c (F) + round 6 (B): "Start now" (not the step's own name) and the finished state with no button.
    expect(hike.roomClose).toEqual({ title: null, body: 'Takes 2 minutes', heading: 'How was the hike?', cta: 'Start now', finished: 'Thanks, your feedback is in.' });
    // No next-hike offer; the post-hike caption; a named join offer gated on learning.
    expect(hike.next).toBeNull();
    expect(hike.afterChatCaption).toBe('Share photos from this hike\nGet info about the next one');
    expect(hike.joinOffer).toEqual({ named: true });
    // Founder 2026-10-26: "Learn the principle", "Decide", "Give feedback".
    expect(hike.room.steps).toEqual({ learn: 'Learn the principle', principle: 'Decide', close: 'Share feedback' });
    expect(hike.scoreStepName).toBe('How was the hike for you?');
    expect(hike.closeIntro).toBe(false);
    expect(hike.cmpOneStep).toBe(true);
    // Founder round 3: the link names the community (the event's organising group), with a fallback.
    expect(hike.prepare.offer?.start('Clarity Practice Community')).toBe('Learn about Clarity Practice Community');
    expect(hike.prepare.offer?.start(null)).toBe('Learn about this community');
    expect(hike.prepare.offer?.resume(null)).toBe('Continue learning about the community');
  });

  it('offers the preparation without requiring it: no flag needed, no room gate', () => {
    expect(offersPreparation({ preparationEnabled: false, seriesSlug: 'social-hike' })).toBe(true);
    expect(gatesRoomOnPreparation({ preparationEnabled: false, seriesSlug: 'social-hike' })).toBe(false);
    expect(gatesRoomOnPreparation({ preparationEnabled: true, seriesSlug: 'social-hike' })).toBe(false);
  });

  it('builds the prepare plan from the recipe (cmp7 included, the event positions only with a tag)', () => {
    const plan = buildPlan({ parts: [], startedAt: null, hasStatementTag: false, eventPointCount: null, steps: hike.prepare.steps });
    expect(plan).toContain('cmp7');
    expect(plan).not.toContain('stake');
    // No recipe steps passed = today's list.
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 5 })).toEqual(ALL_STEPS);
  });
});

describe('P1542 recipes: the hike room, the shorter preparation, the registration screen', () => {
  const hike = recipeFor('social-hike');
  it('a hike room has no readiness step and no rounds; Clarity Night keeps both', () => {
    expect(hike.room).toMatchObject({ readiness: false, rounds: false, feedbackAlwaysOpen: true });
    expect(CLARITY_NIGHT_RECIPE.room).toMatchObject({ readiness: true, rounds: true, feedbackAlwaysOpen: false });
  });

  it('the hike preparation drops the welcome clip and the R&D volunteering, keeps the rest', () => {
    expect(hike.prepare.steps).toEqual(['story', 'principle', 'cmp7', 'stake']);
    expect(CLARITY_NIGHT_RECIPE.prepare.steps).toEqual(ALL_STEPS);
    // The stake step still drops by itself when the event has no topic.
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: false, eventPointCount: null, steps: hike.prepare.steps }))
      .toEqual(['story', 'principle', 'cmp7']);
  });

  it('the principle question is recipe copy: hike words for hikes, today\'s words for Clarity Night', () => {
    expect(hike.room.principleQuestion).toEqual({
      room: 'Do you want to try this principle with the people on this hike?',
      prepare: 'Do you want to follow this principle with the people on this hike?',
    });
    expect(CLARITY_NIGHT_RECIPE.room.principleQuestion).toEqual({
      room: 'Do you want to try this principle with the people at this event?',
      prepare: 'Do you want to follow this principle with the attendees at the event?',
    });
  });

  it('learning words and a plain meeting time for a hike; Clarity Night keeps "preparing" and "sharp"', () => {
    expect(hike.prepare.words?.endTitle('Clarity Practice Community')).toBe('Thanks for taking the time to learn about Clarity Practice Community');
    for (const w of [hike.prepare.words!.planTitle(null), hike.prepare.words!.endTitle(null)]) expect(w).not.toMatch(/prepar/i);
    expect(hike.timeLine).toBe('meet');
    expect(CLARITY_NIGHT_RECIPE.prepare.words).toBeNull();
    expect(CLARITY_NIGHT_RECIPE.timeLine).toBe('start-sharp');
    expect(meetLine('2026-10-25T06:22:00Z', 'Into the Woods cafe', 'Asia/Bangkok')).toBe('We meet at 13:22 at Into the Woods cafe.');
    expect(meetLine('2026-10-25T06:22:00Z', null, 'Asia/Bangkok')).toBe('We meet at 13:22.');
  });

  it('a hike\'s feedback is always open (founder 2026-10-26: before, during and after); Clarity Night waits for the host', () => {
    expect(feedbackAlwaysOpen({ seriesSlug: 'social-hike' })).toBe(true);
    expect(feedbackAlwaysOpen({ seriesSlug: 'clarity-night' })).toBe(false);
    expect(feedbackAlwaysOpen(null)).toBe(false);
  });
});

describe('P1542 wiring and the review hand-off migration', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
  const migration = read('supabase/migrations/20261022120000_p1542_series_review_handoff.sql');

  it('the close page resolves its steps through the recipe and holds no inline topic list', () => {
    const page = read('src/app/prototypes/events/close/EventClosePage.tsx');
    expect(page).toContain('resolveCloseSteps(recipe');
    expect(page).not.toMatch(/\['score', 'topics'\]/);
  });

  it('the series content read asks for approved reviews only', () => {
    expect(read('src/app/data/events-service-real.ts')).toMatch(/\.eq\('status', 'approved'\)/);
  });

  it('pending and rejected reviews are not publicly readable, existing rows stay approved', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'/);
    expect(migration).toMatch(/USING \(status = 'approved'\)/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Series reviews are public"/);
  });

  it('holds exactly one review per person per close in the database', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS series_reviews_one_per_close/);
    expect(migration).toMatch(/ON CONFLICT \(source_event_id, author_profile_id\)[^;]*DO NOTHING/);
  });

  it('only the first arrival at the thank-you can create one (no backfill)', () => {
    expect(migration).toContain('IF NOT v_was_finished THEN');
  });
});

// P1542 VQA round 5: on today's event's own pages "Today's event" is the one active row; Events stands down.
describe('isOnEventPages (one active row in the sidebar)', () => {
  it('matches the event page and every page under it, never a lookalike or another event', () => {
    expect(isOnEventPages('/events/hike-1', 'hike-1')).toBe(true);
    expect(isOnEventPages('/events/hike-1/close', 'hike-1')).toBe(true);
    expect(isOnEventPages('/events/hike-1/prepare', 'hike-1')).toBe(true);
    expect(isOnEventPages('/events/hike-10/close', 'hike-1')).toBe(false);
    expect(isOnEventPages('/events/list', 'hike-1')).toBe(false);
    expect(isOnEventPages('/events/hike-1', null)).toBe(false);
  });
});

describe('P1542 founder 2026-10-23: the hike room\'s default step', () => {
  const MIN = 60 * 1000;
  const start = Date.parse('2026-10-25T09:00:00Z');
  const ev = { datetime: new Date(start).toISOString(), durationMinutes: 240 };
  const switchAt = start + 240 * MIN - 30 * MIN;
  it('opens on Opt in before the start and until 30 minutes before the planned end', () => {
    expect(defaultRoomStep(ev, start - 24 * 60 * MIN)).toBe('main');
    expect(defaultRoomStep(ev, start)).toBe('main');
    expect(defaultRoomStep(ev, switchAt - 1)).toBe('main');
  });
  it('opens on Give feedback from (start + duration − 30 min) on, and after the end', () => {
    expect(defaultRoomStep(ev, switchAt)).toBe('close');
    expect(defaultRoomStep(ev, start + 240 * MIN)).toBe('close');
    expect(defaultRoomStep(ev, start + 3 * 24 * 60 * MIN)).toBe('close');
  });
  it('never switches before the start (a hike of 30 minutes or less switches at its start)', () => {
    const short = { datetime: ev.datetime, durationMinutes: 20 };
    expect(defaultRoomStep(short, start - 1)).toBe('main');
    expect(defaultRoomStep(short, start)).toBe('close');
  });
});

describe('P1542 founder 2026-10-23: one default-step rule for every event (2h Clarity Night)', () => {
  const MIN = 60 * 1000;
  const start = Date.parse('2026-10-25T18:30:00Z');
  const night = { datetime: new Date(start).toISOString(), durationMinutes: 120 };
  it('lands on its main step until 30 minutes before the planned end, then on feedback', () => {
    expect(defaultRoomStep(night, start - MIN)).toBe('main');
    expect(defaultRoomStep(night, start + 90 * MIN - 1)).toBe('main');
    expect(defaultRoomStep(night, start + 90 * MIN)).toBe('close');
    expect(defaultRoomStep(night, start + 120 * MIN)).toBe('close');
  });
});

import { hasLearned, PART_VERSIONS } from '@/app/prototypes/events/prep/prep-plan';
import type { PrepPartRow } from '@/app/data/event-prep-service';

describe('P1542 round 5: learning counts wherever it was done', () => {
  const row = (part: PrepPartRow['part'], completed = true): PrepPartRow =>
    ({ part, contentVersion: PART_VERSIONS[part], completedAt: completed ? '2026-10-01T00:00:00Z' : null } as PrepPartRow);
  it('is learned when the account has the video and the cmp7 statements, from any event or /prepare', () => {
    expect(hasLearned([row('cognitive_video'), row('cmp7')], null)).toBe(true);
  });
  it('is not learned with only one of the two parts, or with a skipped one', () => {
    expect(hasLearned([row('cognitive_video')], null)).toBe(false);
    expect(hasLearned([row('cognitive_video'), row('cmp7', false)], null)).toBe(false);
    expect(hasLearned([], null)).toBe(false);
  });
  it("is learned when this event's learning is complete", () => {
    expect(hasLearned([], '2026-10-23T10:00:00Z')).toBe(true);
  });
});

describe('P1542 round 5: the thank-you invites to join instead of linking to learning', () => {
  const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
  const confirm = readFileSync(join(__dirname, '../app/prototypes/events/prep/PrepConfirm.tsx'), 'utf8');
  it('has no learning link on the feedback thank-you, and gates the terms on learning', () => {
    expect(close).not.toMatch(/PrepRoomBanner/);
    // Round 6b (Codex): only a DEFINITE non-member is invited; a failed membership read is unknown, not "no".
    expect(close).toMatch(/step === 'join' && community && learned && isMember === false/);
    // Round 7f: the read moved to useOrgMembership (visible-only); a failed read is still null there.
    // Round 9: the viewer's id is passed in (no extra auth round trip); the org gate is unchanged.
    expect(close).toMatch(/useOrgMembership\(recipe\.joinOffer\.named \? community\?\.org\.id : null, viewerId\)/);
    expect(close).toMatch(/prepare\?from=room&then=join/);
  });
  it('shows the learning invitation on the registration thank-you, not the quiet link', () => {
    // Round 6 (A): one calm centred invitation (LearnInvitation), 48px under the success block.
    expect(confirm).toMatch(/<LearnInvitation event=\{event\} className="mt-12" \/>/);
    expect(confirm).not.toMatch(/PrepRoomBanner/);
  });
});

describe('P1542 visual review round 5', () => {
  const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
  const prep = readFileSync(join(__dirname, '../app/prototypes/events/prep/EventPrepPage.tsx'), 'utf8');
  it('one plan heading, naming the community', () => {
    expect(SOCIAL_HIKE_RECIPE.prepare.words!.planTitle('Clarity Practice Community')).toBe('Get to know Clarity Practice Community');
    expect(SOCIAL_HIKE_RECIPE.prepare.words!.planTitle(null)).toBe('Get to know the community');
  });
  it('the Join offer has no "Not now" (round 6, E) and says the computed introduction length', () => {
    // Round 6c: said one way in the shared JoinOffer (the thank-you and the room both use it).
    const pieces = readFileSync(join(__dirname, '../app/prototypes/events/prep/PrepPieces.tsx'), 'utf8');
    expect(close).not.toMatch(/setJoinDismissed|joinDismissed/);
    expect(close).toMatch(/<JoinOffer[\s\S]*minutes=\{learning\.minutes\}/);
    expect(pieces).toMatch(/Starts with a \$\{minutes\}-minute introduction to how we meet\./);
    expect(pieces).toMatch(/About \$\{minutes\} \$\{minutes === 1 \? 'minute' : 'minutes'\} left of the introduction\./);
    // Round 6c (G) / round 7: "non‑binding" never splits — a non-breaking hyphen (U+2011) in plain text, so the line can balance.
    expect(close).toMatch(/'Members accept these non\u2011binding terms as a shared intention\.'/);
  });
  it('learning from Join shows the join context, not the room bar; per-step minutes only with the total', () => {
    expect(prep).toMatch(/Part 1 of 2 · Short introduction/);
    expect(prep).toMatch(/inRoom && !thenJoin/);
    expect(prep).toMatch(/state\.minutes !== null && \(\s*<span[^>]*agenda-minutes/);
  });
});

describe('P1542 visual review round 5c', () => {
  const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
  it('the room asks "How was the hike?" above its lone Give feedback button', () => {
    expect(SOCIAL_HIKE_RECIPE.roomClose.heading).toBe('How was the hike?');
    expect(CLARITY_NIGHT_RECIPE.roomClose.heading).toBeUndefined();
  });
  it('names the community button, keeps terms actions in the flow, and counts steps only after this flow\'s learning', () => {
    // Round 6 (E): one label for learners and non-learners, naming the community (supersedes "Join the community").
    expect(close).toMatch(/community=\{shortCommunityName\(community\.org\.name\)\}/);
    expect(readFileSync(join(__dirname, '../app/prototypes/events/prep/PrepPieces.tsx'), 'utf8')).toMatch(/label=\{`Join \$\{community\}`\}/);
    expect(close).not.toMatch(/'Join the community'|'Review group terms'/);
    expect(close).toMatch(/data-testid="terms-actions"/);
    expect(close).toMatch(/joinViaLearning === true/);
    // Founder UAT round: the close's header moved to CloseHeader.tsx (EventClosePage.tsx may not grow).
    expect(readFileSync(join(__dirname, '../app/prototypes/events/close/CloseHeader.tsx'), 'utf8')).toMatch(/label="Back to the event"/);
  });
});

describe('P1542 visual review round 5d', () => {
  const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
  const prep = readFileSync(join(__dirname, '../app/prototypes/events/prep/EventPrepPage.tsx'), 'utf8');
  it('the hike terms footer is pinned like every step bar (round 6b: no shift between top and scrolled)', () => {
    // Round 6d/7: with the shared pinned-footer treatment (fade, off at the end, flat on desktop), like the room's Opt in bar.
    expect(close).toMatch(/<StepActions ref=\{barRef\} className=\{cn\(PINNED_FADE_CLASS, atEnd && PINNED_FADE_OFF_CLASS, PINNED_FLAT_DESKTOP_CLASS\)\}>\s*<div className="flex w-full justify-center" data-testid="terms-actions">/);
    expect(close).not.toMatch(/sticky bottom-\[calc\(4rem/);
  });
  it('the thank-you title is page-heading size with the mark above it, no card (round 6, E)', () => {
    expect(close).toMatch(/<h1 className="mt-2 text-2xl font-bold leading-tight text-foreground \[text-wrap:balance\]" data-testid="step-question">Thank you for your feedback<\/h1>/);
    expect(close).not.toMatch(/end-thanks-card/);
  });
  it('the learn page in the room has the room\'s header: Back to the event, then the bar (round 6, G)', () => {
    // A hike has no Transcribe bar (founder decision 2), so there is nothing to reserve: no invisible spacer either.
    expect(prep).not.toMatch(/RoomTranscribeIdleBar/);
    expect(prep).not.toMatch(/className="invisible border-b px-4 py-2"/);
    expect(prep).toMatch(/\{roomRow && !embedded && <FocusHeader onBack=\{backToEvent\} label="Back to the event" aria-label="Back to the event" \/>\}/);
    // The join context (not a room view) keeps its inline arrow.
    expect(prep).toMatch(/data-testid="learn-join-context">\s*<FocusHeader compact/);
  });
});

describe('P1542 final review', () => {
  const prep = readFileSync(join(__dirname, '../app/prototypes/events/prep/EventPrepPage.tsx'), 'utf8');
  const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
  it('the room learning overview has no second way out (round 6, G: the header\'s Back to the event is it)', () => {
    // The old link said "Back to the event" but went to the room.
    expect(prep).not.toMatch(/label="Back to the event" variant="secondary" onClick=\{\(\) => navigate\(`\/events\/\$\{event\.slug\}\/room`\)\}/);
  });
  it('the join flow counts parts, not steps', () => {
    expect(prep).toMatch(/Part 1 of 2 · Short introduction/);
    expect(close).toMatch(/Part 2 of 2 · Group terms/);
    expect(prep + close).not.toMatch(/Step [12] of 2 ·/);
  });
});
