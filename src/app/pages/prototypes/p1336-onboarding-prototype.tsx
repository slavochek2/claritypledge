/**
 * @file p1336-onboarding-prototype.tsx
 * @description DEV-only clickable prototype of P1336 registration onboarding (/tree/p1336),
 * round 14 (tmp-journey/round14-brief.md; built on round 12): production components reused as they are.
 *
 * Real components, not copies:
 *  - Header: the letter prepare flow's header (letter-prediction-walk.tsx): back arrow on the
 *    left, then the agenda step's name over LetterProgressBar ("Step N of 6", one segment per
 *    agenda step). Forward = the primary CTA.
 *  - Why prepare's agenda: ProgramTimelineSection's numbered-badge timeline (the plan, not a
 *    checklist), with per-step minutes from the same stepSeconds math as the prep question.
 *  - Bottom bars: the letter's bar — FixedBottomBar + LetterPrimaryCta (primary pill) +
 *    LetterPrimaryCta variant="secondary" (text link). The principle step keeps /meet's bar.
 *  - Confirmation: RsvpConfirm's success card (compact); who already prepared = EventCard's
 *    AttendeeAvatarStack; AddToCalendarMenu once "Remind me by email" is tapped.
 *  - Clips (Why prepare, the principle, research): Mp4VideoFacade — founder-credibility's
 *    click-to-play mp4 player, in StoryVideoPlayer's look (PosterPlayButton, pulsing on Why
 *    prepare) so they match the story video. Served from public/p1336-clips/ (not committed).
 *  - Story (ST1): LetterFlowContent + useLetterReadingState (preview, reveals off, no points),
 *    wired like letter-preview-page.tsx; the bar is handed to this page (renderStoryConfirm)
 *    so it can say "Play video" until the video plays; its own one-row rating drawer.
 *  - Principle: its clip, then MeetingPrincipleView at /meet's standard level (3, DEFAULT_LEVEL).
 *  - Statements: StakePage `embedded pointsOnly onlyUnstaked` — the real /stake point cards,
 *    reading the real cmp7 / ikigai1 points from whichever Supabase the dev server points at.
 *    A card opens /point/:id exactly as on /stake; Back returns to the same step (?step=).
 *  - Research: the recording clip; letter bar Yes / No thanks; the Q&A in the product's Dialog.
 *  - End: GroupChatBlock + AddToCalendarMenu, as RsvpConfirm renders them; the letter bar's
 *    one primary goes back to the event page.
 *
 * Writes: none as an anonymous visitor — a position is kept in localStorage (P502) exactly as
 * on /stake. A SIGNED-IN viewer's positions are real writes to that database, as on /stake.
 * Still mock: the event record, the ST1 story snapshot, the "who prepared" avatars.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, CheckCircle2, FileText, Link2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { cn, shareOrCopy } from '@/lib/utils';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAuth } from '@/auth';
import type { PointWithUserPosition } from '@/app/types';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Mp4VideoFacade } from '@/app/components/shared/mp4-video-facade';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { BAR_INNER_CLASS, MeetingPrincipleView, type PrincipleAnswer } from '@/app/components/agreements/meeting-principle-view';
import { Button } from '@/components/ui/button';
import { LetterStatusBadge } from '@/app/components/letters/letter-status-badge';
import { sectionsForLevel, type MeetingTermsLevel } from '@/app/content/meeting-terms';
import { StakePage } from '@/app/pages/stake-page';
import { pointsService } from '@/app/data/points-service';
import { getAnonPosition, setAnonPosition } from '@/app/hooks/useAnonPosition';
import { TELEGRAM_GLYPH, WHATSAPP_GLYPH } from '@/app/prototypes/events/components/GroupChatBlock';
import { AddToCalendarMenu } from '@/app/prototypes/events/components/AddToCalendarMenu';
import { AttendeeAvatarStack } from '@/app/prototypes/events/components/AttendeeAvatarStack';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

// ─── mock event ────────────────────────────────────────────────────────────────────────

const EVENT = {
  title: 'Clarity Night #2',
  dateLabel: 'Tue 6 Oct',
  timeLabel: '19:00 – 21:30 [mock]',
  location: '[mock venue]',
  /** The event record's topic; the statements heading is templated from it. */
  topic: 'AI and your ikigai',
};
/** Round 17: brand glyphs (Simple Icons shapes, 24×24, fill=currentColor — no icon set with
 *  brand marks is installed; WhatsApp/Telegram are GroupChatBlock's own paths). */
const LINE_GLYPH =
  'M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314';
const FACEBOOK_GLYPH =
  'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z';
/** Round 16: the four networks' standard web share URLs. */
const shareTargets = (url: string, text: string) => {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(`${text} ${url}`);
  return [
    { name: 'LINE', glyph: LINE_GLYPH, href: `https://line.me/R/msg/text/?${t}` },
    { name: 'WhatsApp', glyph: WHATSAPP_GLYPH, href: `https://wa.me/?text=${t}` },
    { name: 'Telegram', glyph: TELEGRAM_GLYPH, href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}` },
    { name: 'Facebook', glyph: FACEBOOK_GLYPH, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];
};
/** The founder photo the product already shows for Slava (landing certificate). */
const FOUNDER_PHOTO = '/founder-photo.jpg';
const GROUP_CHAT_URL = 'https://chat.whatsapp.com/example-invite-p1336';
const CALENDAR_EVENT = {
  id: 'event-id-p1336',
  title: EVENT.title,
  description: 'Clarity Night',
  location: EVENT.location,
  slug: 'clarity-night-2-ai-and-your-ikigai-sinek-tan-naval-watts-and-brooks-2026-10-06-ijjx',
  startDate: new Date('2026-10-06T19:00:00'),
  endDate: new Date('2026-10-06T21:30:00'),
};
/** The event's public page — what the end screen shares (not this prototype's URL). */
const EVENT_PAGE_URL = `${window.location.origin}/events/${CALENDAR_EVENT.slug}`;

// ─── clips (founder-approved Night #1 edits; public/p1336-clips/, git-excluded) ─────────
// Round 17: durations are the served files' own (ffprobe, public/p1336-clips): 139.40, 84.40,
// 50.03, 60.13 s. At 1.15x: 121, 73, 44, 52 s shown.
const CLIP_DIR = '/p1336-clips';
/**
 * The editor re-renders these files under the SAME names (round 12: slide overlays, blurred
 * names). A per-page-load query string makes the browser fetch the current file instead of a
 * cached earlier render. Durations below are the round-11 renders' and need re-checking when
 * a new render lands.
 */
const CLIP_BUST = `v=${Date.now()}`;
const CLIPS = {
  welcome: { name: 'why-clarity-night', seconds: 139.4, label: 'Play the How we are different video', rate: 1.15 },
  // Round 15: ST1 self-hosted too — the render uploaded as youtu.be/k4zpMYIKK5A (84.4 s), 1x.
  story: { name: 'cognitive-understanding', seconds: 84.4, label: 'Play the cognitive understanding video', rate: 1.15 },
  principle: { name: 'principle', seconds: 50.03, label: 'Play the principle video', rate: 1.15 },
  research: { name: 'research-recording', seconds: 60.13, label: 'Play the recording video', rate: 1.15 },
} as const;
/** Round 15: real watching time — the file's seconds at its playback rate (why, principle and
 *  research play at 1.15x). The poster badge and the minutes math both use it. */
const watchSeconds = (clip: keyof typeof CLIPS) => Math.round(CLIPS[clip].seconds / CLIPS[clip].rate);

/**
 * Round 17: each clip's own words, from the Night #1 whisper transcript at render.py's IN/OUT
 * points (ST1: the v2 edit's transcript-readable.md). Whisper errors cleaned lightly only.
 */
const TRANSCRIPTS: Record<keyof typeof CLIPS, string[]> = {
  welcome: [
    "So when I invited people to this event, I got some rejections, and I asked for feedback. Generally speaking, people don't come to public discussions about global things because they think it's a waste of time.",
    "It's because of these three things. First, people have monologues and don't listen to each other. Second, disagreements split the room, and nobody learns anything. And last but not least, at some point, if events are repeating, people just agree, for example, with the host, or hate the host.",
    "If you say, how come, what is the crux? Why is it that discussions are not meaningful, or unproductive, or not effective, in public discussions like the one we will have today, or in personal discussions, or professional meetings? I suggest one of the main reasons is a social norm. In many social environments, admitting that you don't understand cognitively, revealing that there is a gap in understanding, is not tolerated, usually punished, because people think: oh, so what are you saying, you're stupid? Or didn't you pay attention?",
    "And if we reflect on how it affects the dynamic of the discussion: if we don't reveal the gap, we cannot bridge the gap. And I suggest that all of the things I said at the beginning, why people have bad discussions, not meaningful discussions, can be traced to this reason. So today, it's part of the experiment, meaning I developed some tools to see if I can help create this environment, where it's rewarding to reveal the gap in cognitive understanding, so we can bridge it and have a more meaningful discussion, so we can learn from each other.",
  ],
  story: [
    'Now, I tell you quickly the story. This is a person I love, and we had a conflict. And I wanted, because of my focus, I wanted to verify that I understand her. So I repeated back, I explained back, I said, is that what you meant? And she told me, yes, that\'s what I mean. That\'s what I mean. And after a few days, the conflict escalated and she wrote me, I don\'t want to speak to you anymore, because I didn\'t feel understood.',
    'So is it a lie, a memory issue, or a misunderstanding? Empirically, I found that the word understanding has three meanings. One, there are people who will say, you don\'t understand me until you agree. Okay, this is how you know: when they say you don\'t understand me, or you understand me, they mean agreement. Other people, they mean you don\'t feel what I feel. This is emotional understanding.',
    'Cognitive understanding means I repeat back your intended meaning, and then I ask you from zero to 10, how much do you think I understand you? Or you ask me how much I understand you. And if it\'s 10, if we both say 10, then we verified, we know exactly that I understood you, right? Because we verified. We might still disagree, and I might not feel what you feel, but we know that I have exactly the mental model that you have.',
  ],
  principle: [
    "This is a lot of text, but the text is not the important thing. It's super simple, it has three parts. I will introduce it. It's a Clarity Meeting Principle, I call it that, and then you can either opt in or opt out. Both are completely fine.",
    "So what is it? There is your right, my promise, and the exception. Basically, it says we allow each other to ask one specific question. The other person promises to answer. If you opt in, you promise to answer that question. If you, for some very specific reason, cannot answer, you explain why.",
    'The question is: how much, from 0 to 10, do you think you understand me cognitively?',
  ],
  research: [
    "So this is optional. If there are volunteers, then I'd like to suggest that I have microphones. Because there will be discussions, and for me it would be helpful for research and development to take the context of your discussion, analyze it with AI, and see if I can improve for the next event, and also personalize the experience for the future, if you opt into this. And if you don't like it, I can always delete the file.",
    "So we will have discussions with each other in pairs. And when you have a discussion, if both of you are part of this, then you are both being recorded, and it's diarized, so we identify you as the speakers. And I will use the context of your discussion, which I cannot hear, I cannot be there, to see if I'm actually succeeding to create these meaningful discussions, or maybe not.",
  ],
};

/** Round 17: "Read the transcript" under every clip — expands inline, no page, no dialog. */
function Transcript({ clip }: { clip: keyof typeof CLIPS }) {
  const [open, setOpen] = useState(false);
  const id = `transcript-${clip}`;
  return (
    <div data-testid={id}>
      {/* Round 18: StoryMedia's "Read video summary" link (P1349) — icon + label, right-aligned,
          directly under the video. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-text`}
        className="ml-auto flex h-10 w-fit items-center gap-1 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {open ? 'Hide the transcript' : 'Read the transcript'}
      </button>
      {open && (
        <div id={`${id}-text`} className="mt-1 space-y-3 text-base leading-relaxed text-muted-foreground animate-in fade-in duration-300">
          {TRANSCRIPTS[clip].map((para) => (
            <p key={para.slice(0, 32)}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** One clip in the story video's look; the poster is a frame where Slava is on screen. */
function Clip({
  clip,
  pulse = false,
  onPlay,
  playRequest = 0,
}: {
  clip: keyof typeof CLIPS;
  pulse?: boolean;
  onPlay?: () => void;
  /** Round 13: the bar's "Play the video" bumps this; the poster's own button starts it. */
  playRequest?: number;
}) {
  const { name, label, rate } = CLIPS[clip];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (playRequest > 0) ref.current?.querySelector<HTMLButtonElement>('button')?.click();
  }, [playRequest]);
  return (
    <div>
    <div ref={ref} data-testid={`clip-${clip}`}>
      <Mp4VideoFacade
        look="story"
        src={`${CLIP_DIR}/${name}.mp4?${CLIP_BUST}`}
        poster={`${CLIP_DIR}/${name}-poster.jpg?${CLIP_BUST}`}
        posterAlt={clip === 'story' ? 'The cognitive understanding video' : 'Slava speaking at Clarity Night #1'}
        playLabel={label}
        durationSeconds={watchSeconds(clip)}
        pulse={pulse}
        onPlay={onPlay}
        playbackRate={rate}
      />
    </div>
    <Transcript clip={clip} />
    </div>
  );
}

// ─── statements: the real points of two tags ───────────────────────────────────────────

const EVENT_TAG = 'ikigai1';
/** Round 19: the agents with ikigai1 stories (stories.tags, queried 2026-09-30), minus "Brett Codes". */
const EVENT_EXPERTS = ['Simon Sinek', 'Garry Tan', 'Naval Ravikant', 'Alan Watts', 'Arthur Brooks'];
const CMP7_TAG = 'cmp7';
const STATEMENT_TAGS = [CMP7_TAG, EVENT_TAG] as const;
type StatementTag = (typeof STATEMENT_TAGS)[number];
/** Same page size as StakePage (STAKE_LIMIT). */
const TAG_POINTS_LIMIT = 50;

type TagPoints = Record<StatementTag, PointWithUserPosition[] | null>;

/** Answered = a position held: signed in (the fetched row) or anonymous (localStorage, P502). */
const isAnswered = (p: PointWithUserPosition) => !!p.userPosition || !!getAnonPosition(p.id);

interface Count { answered: number; total: number }

/**
 * The real StakePage for one tag (`onlyUnstaked`: the points this viewer has no position on,
 * decided at load). Reports "N of M answered" for the cards it shows: the ids are decided once,
 * like onlyUnstaked itself, from the same read of the tag the page itself makes.
 */
function StakeStep({
  tag,
  points,
  askedIds,
  onPointsChanged,
  onCountChange,
}: {
  tag: StatementTag;
  points: PointWithUserPosition[];
  /** Round 17: the session's snapshot of what this step first showed (see shownIds). */
  askedIds: string[];
  onPointsChanged: () => void;
  onCountChange: (c: Count) => void;
}) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const answered = askedIds.filter((id) => {
    const p = byId.get(id);
    return p ? isAnswered(p) : !!getAnonPosition(id);
  }).length;

  useEffect(() => {
    onCountChange({ answered, total: askedIds.length });
  }, [answered, askedIds.length, onCountChange]);

  return (
    // An anonymous click writes localStorage synchronously; a signed-in one writes the row.
    // Either way, re-read after the card handled it.
    <div onClickCapture={() => { setTimeout(onPointsChanged, 400); }}>
      <StakePage tag={tag} embedded pointsOnly onlyIds={askedIds} linksInNewTab />
    </div>
  );
}

// ─── "who already prepared" (mock) ─────────────────────────────────────────────────────

const PREPARED = ['Anna', 'Ben', 'Chiara', 'Dmitri', 'Elena', 'Farid', 'Greta'].map((name, i) => ({
  profileId: `profile-id-prepared-${i + 1}`,
  name,
  slug: `prepared-${i + 1}`,
  hasPledged: false,
}));
/** Round 14 mock counts: the last event's number keeps the line from ever being empty. */
const LAST_EVENT_PREPARED = 12;
const LAST_EVENT_OPTED_IN = 12;
const THIS_EVENT_OPTED_IN = 1;
const OPTED_IN = PREPARED.slice(0, 5);
const RESEARCH_PLACES_LEFT = 4;
const RESEARCH_PLACES = 6;
/** Variant D (founder): places never read zero — overbooking is accepted. */
const researchPlacesShown = Math.max(1, RESEARCH_PLACES_LEFT);

// ─── copy ──────────────────────────────────────────────────────────────────────────────

/**
 * The research dialog's Q&A (founder, round 10, option B). The deletion address is the one
 * the privacy policy lists (src/app/content/privacy.md L19 "Data protection contact"),
 * written the way that page writes it.
 */
const PRIVACY_CONTACT = 'privacy AT claritypledge DOT com';
const RESEARCH_QA: { q: string; a: ReactNode }[] = [
  {
    q: 'Who sees the audio recording?',
    a: "All people who are part of the recorded conversation at the event. The event organiser analyses the conversation transcripts with AI for research, and doesn't listen to the audio.",
  },
  {
    q: 'Will my partner be recorded too?',
    a: 'Your microphone is a directional lavalier microphone. It picks up mostly you, but it can record some background sound around you.',
  },
  {
    q: 'Can I ask you to delete my data?',
    a: (
      <>
        Yes. Email us and we delete your recording and transcript.{' '}
        <span className="whitespace-nowrap">({PRIVACY_CONTACT})</span>
      </>
    ),
  },
];
type VideoKey = 'welcome' | 'story' | 'principle';
const RESEARCH_PROGRAMME_URL = 'https://github.com/slavochek2/claritypledge/blob/main/docs/research-programme.md';

const PRINCIPLE_QUESTION = "How much do you think you understand Slava's intended meaning behind this principle?";
/**
 * /meet's STANDARD level (round 12 B, reverting round 10's shortest): the level /meet opens
 * on, DEFAULT_LEVEL = 3 "Reveal the gap" in meeting-terms-page.tsx (not exported: a page
 * module). Keep the two in step.
 */
const PRINCIPLE_LEVEL: MeetingTermsLevel = 3;

// ─── steps + agenda ────────────────────────────────────────────────────────────────────

type Step = 'confirm' | 'plan' | 'welcome' | 'story' | 'principle' | 'cmp7' | 'stake' | 'research' | 'end';
type OnboardingStep = Exclude<Step, 'confirm' | 'end'>;
const ONBOARDING_STEPS: OnboardingStep[] = ['plan', 'welcome', 'story', 'principle', 'cmp7', 'stake', 'research'];
const isOnboardingStep = (s: string | null): s is OnboardingStep =>
  !!s && (ONBOARDING_STEPS as string[]).includes(s);

/**
 * The six agenda steps (round 12 A, founder's list). Step 5's name is templated from the
 * event record in earlier rounds; round 16 made every name generic.
 */
const AGENDA: { label: string; steps: OnboardingStep[] }[] = [
  // Round 14: "Your preparation" (the plan) is its own screen, before the video.
  // Round 15: the founder's step names, used on the plan AND in the header.
  // Round 16: the plan is not a step — no header on it; the header starts at step 1.
  // Round 17: imperative, no question marks; step 5 is templated again (agendaLabel).
  { label: 'See how this event is different', steps: ['welcome'] },
  { label: 'Learn the definition of cognitive understanding', steps: ['story'] },
  { label: 'Decide about your participation in a new social norm', steps: ['principle'] },
  { label: 'Share your view on the expected benefits', steps: ['cmp7'] },
  { label: 'Set your positions on the points we discuss', steps: ['stake'] },
  { label: "Decide if you'd like to volunteer in R&D", steps: ['research'] },
];
/** Round 17: step 5 names the event's point count and topic (N = the event tag's points). */
const agendaLabel = (i: number, eventPoints: number | null) =>
  AGENDA[i]?.steps.includes('stake') && eventPoints
    ? `Set your positions on ${eventPoints} points about “${EVENT.topic}”`
    : (AGENDA[i]?.label ?? '');
const agendaIndexOf = (s: OnboardingStep) => AGENDA.findIndex((a) => a.steps.includes(s));
/** Returning attendees who finished onboarding have the last two agenda steps only. */
const stepsFor = (returning: boolean): OnboardingStep[] =>
  returning ? ['stake', 'research'] : ONBOARDING_STEPS;

// ─── "Do you have N minutes": computed from what this person still has to do ─────────────

const SECONDS_PER_DECISION = 20; // one statement position, one 0–10 answer, one choice, one tap
const READING_WORDS_PER_MINUTE = 200;
const PRINCIPLE_WORDS = sectionsForLevel(PRINCIPLE_LEVEL)
  .map((s) => `${s.heading} ${s.text}`)
  .join(' ')
  .split(/\s+/)
  .filter(Boolean).length;

/**
 * Seconds per step, from real durations:
 * Round 15: clips count real watching time, seconds / playback rate (watchSeconds).
 *   welcome   = the why clip at 1.15x: 139 / 1.15                                 = 121
 *   story     = the ST1 video at 1.15x (round 16): 84 / 1.15                     =  73
 *   principle = its clip at 1.15x + the level-3 text at 200 wpm + opt-in choice + 0–10 answer
 *               (PRINCIPLE_WORDS counted from the live /meet copy: 122 → 37 s)
 *                                                                  = 43 + 37 + 40 = 120
 *   cmp7      = unanswered cmp7 points × 20 (new: 7 × 20)                        = 140
 *   stake     = unanswered event points × 20 (new: 6 × 20)                       = 120
 *   research  = its clip at 1.15x + one tap                                = 52 + 20 =  72
 * The agenda shows each step's own seconds as whole minutes, at least 1 (stepMinutes); the
 * prep question is the sum of those rows (minutesFor), so the two always agree.
 * New registrant: every card counted, answered or not, so the number never changes between loads.
 * Returning: only the rows still to do, counting unanswered cards.
 */
function stepSeconds(s: OnboardingStep, tagPoints: TagPoints, full = false): number {
  // full: a new registrant's plan counts every card, so the promise never shrinks between loads.
  const unanswered = (tag: StatementTag) =>
    (tagPoints[tag] ?? []).filter((p) => full || !isAnswered(p)).length;
  switch (s) {
    case 'plan': return 0;
    case 'welcome': return watchSeconds('welcome');
    case 'story': return watchSeconds('story');
    case 'principle':
      return (
        watchSeconds('principle') +
        Math.round((PRINCIPLE_WORDS / READING_WORDS_PER_MINUTE) * 60) +
        2 * SECONDS_PER_DECISION
      );
    case 'cmp7': return unanswered(CMP7_TAG) * SECONDS_PER_DECISION;
    case 'stake': return unanswered(EVENT_TAG) * SECONDS_PER_DECISION;
    case 'research': return watchSeconds('research') + SECONDS_PER_DECISION;
  }
}
/** One agenda row's "N min": its steps' seconds, rounded, never below 1. */
const stepMinutes = (steps: OnboardingStep[], tagPoints: TagPoints, full = false) =>
  Math.max(1, Math.round(steps.reduce((sum, s) => sum + stepSeconds(s, tagPoints, full), 0) / 60));
/** The prep question's minutes: the sum of the plan rows that cover `remaining`, so the
 *  question always equals what the plan shows. */
const minutesFor = (remaining: OnboardingStep[], tagPoints: TagPoints, full = false) =>
  AGENDA.filter((a) => a.steps.some((s) => remaining.includes(s))).reduce(
    (sum, a) => sum + stepMinutes(a.steps, tagPoints, full),
    0,
  );

// ─── automatic resume (prototype: localStorage; real build: the registration record) ───

const RESUME_KEY = 'p1336-proto-resume';
/**
 * Round 17: which cards each statements step showed on first entry, for this session. Back
 * shows the same cards, answered ones included; skipping answered steps applies only on a
 * later visit. sessionStorage, so a round trip through /point/:id keeps it.
 */
const SHOWN_KEY = 'p1336-proto-shown';
type ShownIds = Partial<Record<StatementTag, string[]>>;
function readShown(): ShownIds {
  try {
    return JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '{}') as ShownIds;
  } catch {
    return {};
  }
}
function writeShown(shown: ShownIds) {
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
  } catch { /* storage unavailable: the snapshot lasts until reload */ }
}

interface Saved {
  step: OnboardingStep;
  returning: boolean;
  answer: PrincipleAnswer;
  principleRating: number | null;
  furthest: number;
  /** Mic follow-up after "Yes, sure": on that screen, and what was answered. Volunteer = usbc|own. */
  micAsked?: boolean;
  micSetup?: MicSetup;
}
type MicSetup = 'usbc' | 'own' | 'none' | null;

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : null;
    return parsed && isOnboardingStep(parsed.step) ? { ...parsed, furthest: parsed.furthest ?? 0 } : null;
  } catch {
    return null;
  }
}
function writeSaved(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(RESUME_KEY, JSON.stringify(saved));
    else localStorage.removeItem(RESUME_KEY);
  } catch { /* storage unavailable: resume simply won't survive a reload */ }
}
/** Variant D: "Prepared ✓" must survive a reload, like the resume point does. */
const FINISHED_KEY = `${RESUME_KEY}:finished`;
function readFinished(): boolean {
  try { return localStorage.getItem(FINISHED_KEY) === '1'; } catch { return false; }
}
function writeFinished(done: boolean) {
  try {
    if (done) localStorage.setItem(FINISHED_KEY, '1');
    else localStorage.removeItem(FINISHED_KEY);
  } catch { /* storage unavailable */ }
}

// ─── small pieces ──────────────────────────────────────────────────────────────────────

/** Height of a fixed element, kept current (same approach as MeetingPrincipleView's bar). */
function useMeasuredHeight(): [(node: HTMLDivElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) {
      setHeight(0);
      return;
    }
    setHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver !== 'undefined') {
      const o = new ResizeObserver(([entry]) => {
        if (entry) setHeight(entry.target.getBoundingClientRect().height);
      });
      o.observe(node);
      observer.current = o;
    }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, height];
}

function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold leading-tight text-foreground">{children}</h1>;
}

/** Returning attendees open on the event, not on a task. */
function EventLine() {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid="event-line">
      <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {EVENT.title} · {EVENT.dateLabel}
    </p>
  );
}

/** RsvpConfirm's event details block (confirmation card and the end screen). */
function EventDetails() {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-left" data-testid="event-details">
      <h2 className="mb-2 font-semibold">{EVENT.title}</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-3">
          <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <p>
            {EVENT.dateLabel} <span className="text-muted-foreground">· {EVENT.timeLabel}</span>
          </p>
        </div>
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span>{EVENT.location}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Round 17: the ONE event box, used for "You're Registered!" and at the end — event details,
 * Add to calendar / Join WhatsApp group as two equal small outline buttons, GroupChatBlock's
 * why line, then the share row. Centred.
 */
function EventBox({ title, testId, note }: { title: ReactNode; testId: string; note?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  /** EventDetail's handleShare, sharing the event page (not this prototype's URL). */
  const copyLink = async () => {
    const result = await shareOrCopy(EVENT.title, EVENT_PAGE_URL);
    if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (result === 'failed') {
      toast.error('Could not copy link');
    }
  };
  const iconButton =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted';
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-center shadow-sm" data-testid={testId}>
      {title}
      <EventDetails />
      {note}
      <div
        // AddToCalendarMenu's own outline Button, sized down to sit beside the group button.
        className="grid grid-cols-2 gap-2 [&_button]:h-auto [&_button]:min-h-10 [&_button]:whitespace-normal [&_button]:px-2 [&_button]:text-sm"
        data-testid={`${testId}-actions`}
      >
        <AddToCalendarMenu event={CALENDAR_EVENT} />
        <Button asChild variant="outline" className="h-auto min-h-10 gap-2 whitespace-normal px-2 text-sm">
          <a href={GROUP_CHAT_URL} target="_blank" rel="noopener noreferrer" data-testid="group-chat-link">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
              <path d={WHATSAPP_GLYPH} />
            </svg>
            Join WhatsApp group
          </a>
        </Button>
      </div>
      {/* GroupChatBlock's own line (founder-authored). */}
      <p className="text-xs text-muted-foreground">
        WhatsApp group: last-minute changes, questions, and getting there. If you need a lift, ask in the group.
      </p>
      <div className="space-y-1 border-t border-border pt-3" data-testid={`${testId}-share`}>
        <p className="text-sm font-medium text-muted-foreground">Share</p>
        <div className="flex flex-wrap justify-center gap-2">
          {shareTargets(EVENT_PAGE_URL, EVENT.title).map(({ name, glyph, href }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Share on ${name}`}
              title={name}
              className={iconButton}
              data-testid={`share-${name.toLowerCase()}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d={glyph} />
              </svg>
            </a>
          ))}
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
            data-testid="share-event"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Avatars + one line of social proof, stacked and centred. */
function SocialProof({
  line,
  testId,
  people = PREPARED,
  large = false,
}: {
  line: string;
  testId: string;
  people?: typeof PREPARED;
  /** Round 18: the confirmation's avatars a step bigger (the stack itself is EventCard's, unchanged). */
  large?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pt-1 text-center" data-testid={testId}>
      <div className={large ? 'my-1 scale-125' : undefined}>
        <AttendeeAvatarStack attendees={people} />
      </div>
      <span className="text-sm text-muted-foreground">{line}</span>
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────────────────

// ─── Variant C: a mock registration step before "You're Registered!" ─────────────────────
type PrepChoice = 'prepare' | 'early';
const HEARD_FROM = ['Facebook', 'Luma', 'todo.today', 'Sola', 'WhatsApp', 'Telegram', 'A friend', 'Other'];

/** Mock of the event page top (EventDetail's title card + its "Reserve a seat" button). On
 *  Reserve, a Drawer asks the prep question; Register confirms with the chosen answer. */
function MockRegisterStep({ onRegistered }: { onRegistered: (choice: PrepChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PrepChoice | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-8" data-testid="mock-register">
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <h1 className="text-2xl font-bold mb-4">{EVENT.title}</h1>
        <div className="space-y-3 text-sm text-foreground mb-6">
          <p className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {EVENT.dateLabel} · {EVENT.timeLabel}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {EVENT.location}
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white"
          size="lg"
          data-testid="rsvp-button"
        >
          Reserve a seat
        </Button>
      </div>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent data-testid="register-sheet">
          <DrawerHeader>
            <DrawerTitle className="text-xl">Will you take 10 minutes to prepare before the event?</DrawerTitle>
            <DrawerDescription className="sr-only">Choose how you will get ready, then register.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-5 px-4">
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Preparation">
              {([
                ['prepare', "Yes, I'll prepare"],
                ['early', "I can't — I'll arrive 15 minutes early"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={choice === value}
                  onClick={() => setChoice(value)}
                  data-testid={`prep-choice-${value}`}
                  className={cn(
                    'min-h-12 rounded-lg border px-4 py-3 text-left text-base font-medium transition-colors',
                    choice === value ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100' : 'border-border',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">How did you hear about the event? (optional)</p>
              <div className="flex flex-wrap gap-2" data-testid="heard-from">
                {HEARD_FROM.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={heard === h}
                    onClick={() => setHeard(heard === h ? null : h)}
                    className={cn(
                      'min-h-10 rounded-full border px-3 text-sm',
                      heard === h ? 'border-blue-500 bg-blue-500 text-white' : 'border-border text-foreground',
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DrawerFooter>
            {choice && (
              <Button
                size="lg"
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                onClick={() => onRegistered(choice)}
                data-testid="register-confirm"
              >
                Register
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

export function P1336OnboardingPrototype({ variant }: { variant?: 'c' | 'd' } = {}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const viewerUserId = session?.user?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const [saved, setSaved] = useState<Saved | null>(() => readSaved());
  // Back from a point card (/point/:id) lands here again with ?step= — resume that step.
  const [restoreFromUrl] = useState(() => {
    const s = searchParams.get('step');
    return isOnboardingStep(s) && saved ? saved : null;
  });
  const [returning, setReturning] = useState(restoreFromUrl?.returning ?? false);
  const [step, setStep] = useState<Step>(restoreFromUrl?.step ?? 'confirm');
  const [furthest, setFurthest] = useState(restoreFromUrl?.furthest ?? 0);
  const [run, setRun] = useState(0);
  const [emailReminder, setEmailReminder] = useState(false);
  // Variant C: the answer given at registration (null = not registered yet).
  const [prepChoice, setPrepChoice] = useState<PrepChoice | null>(null);
  // Variant D: finished the flow at least once; and the mock event-room arrival screens.
  const [finished, setFinished] = useState(() => readFinished());
  useEffect(() => { writeFinished(finished); }, [finished]);
  const [arrival, setArrival] = useState<'gate' | 'room' | null>(null);
  const [answer, setAnswer] = useState<PrincipleAnswer>(restoreFromUrl?.answer ?? null);
  const [principleRating, setPrincipleRating] = useState<number | null>(restoreFromUrl?.principleRating ?? null);
  const [stakeCount, setStakeCount] = useState<Count>({ answered: 0, total: 0 });
  const [cmp7Count, setCmp7Count] = useState<Count>({ answered: 0, total: 0 });
  // Round 13: every video step's bar is "Play the video" until played, then "Continue".
  const [clipPlayed, setClipPlayed] = useState<Record<VideoKey, boolean>>({ welcome: false, story: false, principle: false });
  // Round 14: after opting in, a "Try it now" moment before the 0–10 question.
  const [tryAsked, setTryAsked] = useState(restoreFromUrl?.principleRating != null);
  const [playRequest, setPlayRequest] = useState(0);
  // Round 13: the principle is two screens — (a) intro + clip, (b) the principle itself.
  const [principleIntroDone, setPrincipleIntroDone] = useState(restoreFromUrl?.answer != null);
  const [researchInfoOpen, setResearchInfoOpen] = useState(false);
  const [micAsked, setMicAsked] = useState(restoreFromUrl?.micAsked ?? false);
  const [micSetup, setMicSetup] = useState<MicSetup>(restoreFromUrl?.micSetup ?? null);
  const [tagPoints, setTagPoints] = useState<TagPoints>({ cmp7: null, ikigai1: null });
  const [shownIds, setShownIds] = useState<ShownIds>(() => readShown());
  useEffect(() => { writeShown(shownIds); }, [shownIds]);
  const [headerRef, headerHeight] = useMeasuredHeight();
  const [barRef, barHeight] = useMeasuredHeight();

  // The same read StakePage makes for each tag (points + this viewer's positions). Read-only.
  const loadTagPoints = useCallback(() => {
    STATEMENT_TAGS.forEach((tag) => {
      pointsService
        .getPublicPointsFeed(TAG_POINTS_LIMIT, 0, tag, viewerUserId, true, true)
        .then((points) => setTagPoints((prev) => ({ ...prev, [tag]: points })))
        .catch(() => setTagPoints((prev) => ({ ...prev, [tag]: [] })));
    });
  }, [viewerUserId]);
  useEffect(() => { loadTagPoints(); }, [loadTagPoints]);
  const pointsReady = STATEMENT_TAGS.every((t) => tagPoints[t] !== null);
  const eventPointCount = tagPoints.ikigai1?.length ?? null;
  const pointsChanged = useCallback(() => {
    if (viewerUserId) loadTagPoints();
    else setTagPoints((prev) => ({ ...prev })); // anonymous: localStorage already holds it
  }, [viewerUserId, loadTagPoints]);

  const steps = stepsFor(returning);
  const stepIndex = isOnboardingStep(step) ? steps.indexOf(step) : -1;

  /** A statements step with nothing left to answer is skipped (decided when moving to it) —
   *  unless it already showed cards this session (round 17: Back returns to them). */
  const isSkippable = (s: OnboardingStep) => {
    const tag = s === 'cmp7' ? CMP7_TAG : s === 'stake' ? EVENT_TAG : null;
    if (!tag) return false;
    if ((shownIds[tag]?.length ?? 0) > 0) return false;
    return (tagPoints[tag] ?? []).every(isAnswered);
  };
  /** First entry into a statements step snapshots the unanswered cards it shows. */
  useEffect(() => {
    const tag = step === 'cmp7' ? CMP7_TAG : step === 'stake' ? EVENT_TAG : null;
    const points = tag ? tagPoints[tag] : null;
    if (!tag || !points || shownIds[tag]) return;
    setShownIds((prev) => ({ ...prev, [tag]: points.filter((p) => !isAnswered(p)).map((p) => p.id) }));
  }, [step, tagPoints, shownIds]);

  const go = useCallback((nextStep: Step) => {
    setStep(nextStep);
    setPlayRequest(0);
    setPrincipleIntroDone(false);
    setTryAsked(false);
    setMicAsked(false);
    if (isOnboardingStep(nextStep)) {
      setFurthest((f) => Math.max(f, ONBOARDING_STEPS.indexOf(nextStep)));
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (isOnboardingStep(nextStep)) params.set('step', nextStep);
        else params.delete('step');
        return params;
      },
      { replace: true },
    );
    window.scrollTo(0, 0);
  }, [setSearchParams]);

  // Automatic resume: every onboarding step is remembered; finishing clears it.
  useEffect(() => {
    if (isOnboardingStep(step)) {
      const s: Saved = { step, returning, answer, principleRating, furthest, micAsked, micSetup };
      writeSaved(s);
      setSaved(s);
    } else if (step === 'end') {
      setFinished(true);
      writeSaved(null);
      setSaved(null);
    }
  }, [step, returning, answer, principleRating, furthest, micAsked, micSetup]);

  const next = () => {
    const rest = steps.slice(stepIndex + 1);
    go(rest.find((s) => !isSkippable(s)) ?? 'end');
  };
  const back = () => {
    const before = steps.slice(0, Math.max(stepIndex, 0)).reverse();
    const target = before.find((s) => !isSkippable(s)) ?? 'confirm';
    go(target);
    // Back into the principle lands on its second screen (the one just before).
    if (target === 'principle') {
      setPrincipleIntroDone(true);
      setTryAsked(principleRating != null);
    }
  };
  const start = () => {
    if (saved) {
      setReturning(saved.returning);
      setAnswer(saved.answer);
      setPrincipleRating(saved.principleRating);
      setFurthest(saved.furthest);
      setMicSetup(saved.micSetup ?? null);
      go(saved.step);
      setMicAsked(saved.micAsked ?? false);
      return;
    }
    go(steps.find((s) => !isSkippable(s)) ?? 'end');
  };

  /** Clears the prototype's state and this browser's anonymous positions on these points.
   *  A signed-in viewer's positions are database rows and are left alone. */
  const reset = (asReturning: boolean) => {
    // Round 14 (item 0): clear every point of both tags, including ones not in tagPoints yet,
    // then re-read so the prep question and the stake steps count them as unanswered again.
    STATEMENT_TAGS.forEach((t) => (tagPoints[t] ?? []).forEach((p) => setAnonPosition(p.id, null)));
    Promise.all(
      STATEMENT_TAGS.map((t) =>
        pointsService
          .getPublicPointsFeed(TAG_POINTS_LIMIT, 0, t, viewerUserId, true, true)
          .then((points) => points.forEach((p) => setAnonPosition(p.id, null)))
          .catch(() => undefined),
      ),
    ).then(loadTagPoints);
    writeSaved(null);
    setSaved(null);
    setReturning(asReturning);
    setRun((n) => n + 1);
    setEmailReminder(false);
    setPrepChoice(null);
    setFinished(false);
    setArrival(null);
    setAnswer(null);
    setPrincipleRating(null);
    setFurthest(0);
    setStakeCount({ answered: 0, total: 0 });
    setCmp7Count({ answered: 0, total: 0 });
    setResearchInfoOpen(false);
    setMicSetup(null);
    setShownIds({});
    setClipPlayed({ welcome: false, story: false, principle: false });
    setTryAsked(false);
    go('confirm');
  };

  const principleBack = () => {
    // In-flow: step back within the principle first (the choice is how you change it).
    if (answer !== null && tryAsked) {
      setTryAsked(false);
      setPrincipleRating(null);
      window.scrollTo(0, 0);
    } else if (answer !== null) {
      setAnswer(null);
      setPrincipleRating(null);
      window.scrollTo(0, 0);
    } else if (principleIntroDone) {
      setPrincipleIntroDone(false);
      window.scrollTo(0, 0);
    } else {
      back();
    }
  };

  // Variant D confirmation: pin the prep block only when, inline, it would end below the fold.
  const prepRef = useRef<HTMLElement>(null);
  const cardEndRef = useRef<HTMLDivElement>(null);
  const [prepPinned, setPrepPinned] = useState(false);
  useEffect(() => {
    const measure = () => {
      const end = cardEndRef.current;
      const prep = prepRef.current;
      if (!end || !prep) return;
      const inlineBottom = end.getBoundingClientRect().top + window.scrollY + 32 + prep.offsetHeight;
      setPrepPinned(inlineBottom > window.innerHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
  const contentPadding = { paddingBottom: barHeight > 0 ? barHeight + 24 : 24 };

  /**
   * The letter's position-required bar for a step with several statements: Continue is
   * disabled until every card shown has a position; the founder's "Skip and proceed" is the
   * letter's secondary text link and goes once nothing is left to skip. The count is the
   * letter's own tick bar (LetterProgressBar, one tick per card).
   */
  const statementsBar = (count: Count, loaded: boolean) => {
    const allSet = count.answered >= count.total;
    return (
      <FixedBottomBar ref={barRef}>
        {/* Round 17: re-keyed on each increment, so the count zooms in briefly (tailwindcss-animate).
            Hidden until the cards have loaded, so "0 of 0" never stands alone. */}
        {loaded && <div
          key={count.answered}
          className={cn('mb-3 w-full max-w-sm', count.answered > 0 && 'animate-in zoom-in-95 duration-300')}
          aria-live="polite"
          data-testid="answered-count"
        >
          <LetterProgressBar
            currentChapter={0}
            totalChapters={1}
            stepCount={Math.max(count.total, 1)}
            committedSteps={count.answered}
            label={`${count.answered} of ${count.total} answered`}
            // Lighter than the step header's bar above, so the two don't compete (round 12 C).
            tone="subtle"
          />
        </div>}
        <LetterPrimaryCta label="Continue" onClick={next} disabled={!allSet} />
        {!allSet && <LetterPrimaryCta label="Skip and proceed" onClick={next} variant="secondary" />}
      </FixedBottomBar>
    );
  };

  /** Round 13/14: every video step — "Play the video" / "Continue without video", then "Continue". */
  const videoBar = (clip: VideoKey, onContinue: () => void) => (
    <FixedBottomBar ref={barRef}>
      {clipPlayed[clip] ? (
        <LetterPrimaryCta label="Continue" onClick={onContinue} />
      ) : (
        <>
          <LetterPrimaryCta label="Play the video" onClick={() => setPlayRequest((n) => n + 1)} />
          <LetterPrimaryCta label="Continue without video" onClick={onContinue} variant="secondary" />
        </>
      )}
    </FixedBottomBar>
  );
  const markPlayed = (clip: VideoKey) => () => setClipPlayed((p) => ({ ...p, [clip]: true }));
  const choosePrinciple = (a: PrincipleAnswer) => {
    // Round 15: both answers go to the founder's screen (opt in: "Try it now"; opt out:
    // "can I ask you one question?"), then the same 0–10 card.
    setAnswer(a);
    setTryAsked(false);
    window.scrollTo(0, 0);
  };

  // The prep question counts what is left: from the saved step when resuming, else every
  // step this person has (a returning attendee's list is the last two agenda steps only).
  const remainingSteps = (saved ? steps.slice(Math.max(steps.indexOf(saved.step), 0)) : steps).filter(
    (s) => !isSkippable(s),
  );
  // A new registrant is always promised the full flow; a returning attendee what is left.
  const prepMinutes = returning ? minutesFor(remainingSteps, tagPoints) : minutesFor(steps, tagPoints, true);

  // Header: agenda step N of 6. Returning attendees start at "Your positions" (5 of 6).
  const agendaIndex = isOnboardingStep(step) ? agendaIndexOf(step) : -1;
  const agendaItem = AGENDA[agendaIndex];
  // On the confirmation screen after a reload, progress lives only in the saved record: the
  // live state starts at 0, which is what showed "0 of 6" to someone part-way through.
  const progress = step === 'confirm' && saved ? saved : { returning, furthest };
  const agendaDone = (i: number) =>
    progress.returning
      ? i < agendaIndexOf('stake')
      : !!AGENDA[i]?.steps.every((s) => ONBOARDING_STEPS.indexOf(s) < progress.furthest);
  const preparedCount = finished ? AGENDA.length : AGENDA.filter((_, i) => agendaDone(i)).length;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Prototype chrome + (on onboarding steps) the letter's back + progress header. */}
      <div
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2 border-b border-dashed border-border px-4 py-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Prototype · P1336</span>
          <div className="ml-auto flex gap-1" role="group" aria-label="Attendee state">
            {([false, true] as const).map((r) => (
              <button
                key={String(r)}
                type="button"
                onClick={() => reset(r)}
                aria-pressed={returning === r && arrival === null}
                className={cn(
                  'min-h-10 rounded px-2',
                  returning === r && arrival === null ? 'bg-foreground text-background' : 'border border-border bg-background text-foreground',
                )}
              >
                {r ? 'Returning' : 'New registrant'}
              </button>
            ))}
            {variant === 'd' && (
              <button
                type="button"
                onClick={() => { reset(false); setArrival('gate'); }}
                aria-pressed={arrival !== null}
                data-testid="arrival-toggle"
                className={cn(
                  'min-h-10 rounded px-2',
                  arrival !== null ? 'bg-foreground text-background' : 'border border-border bg-background text-foreground',
                )}
              >
                Arriving (not prepared)
              </button>
            )}
          </div>
        </div>
        {agendaItem && isOnboardingStep(step) && arrival === null && (
          // letter-prediction-walk.tsx's header: back arrow left, then label + progress bar.
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2" data-testid="step-header">
            <button
              type="button"
              onClick={step === 'principle' ? principleBack : step === 'research' && micAsked ? () => { setMicAsked(false); setMicSetup(null); window.scrollTo(0, 0); } : back}
              aria-label="Back"
              data-testid="header-back"
              className="flex-shrink-0 -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              {/* Wraps rather than truncates: step 5's templated name is longer than one line at 320. */}
              <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">
                {agendaLabel(agendaIndex, eventPointCount)}
              </p>
              <LetterProgressBar
                currentChapter={agendaIndex}
                totalChapters={AGENDA.length}
                // The principle is one plan step with two screens (round 13).
                stepCount={step === 'principle' ? 3 : agendaItem.steps.length}
                committedSteps={
                  step === 'principle'
                    ? (principleIntroDone ? 1 : 0) + (answer !== null ? 1 : 0)
                    : agendaItem.steps.indexOf(step)
                }
                label={`Step ${agendaIndex + 1} of ${AGENDA.length}`}
              />
            </div>
          </div>
        )}
      </div>
      <div style={{ height: headerHeight }} aria-hidden />

      {arrival !== null ? (
        <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4 pb-6">
          {arrival === 'gate' ? (
            <section className="space-y-6 pt-8 text-center" data-testid="arrival-gate">
              {/* [DRAFT] mock event-room gate */}
              <h1 className="text-2xl font-bold leading-snug text-foreground">You haven&apos;t prepared yet</h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                The discussion uses a special structure. Ten minutes of preparation lets you take part fully.
              </p>
              <div className="flex flex-col items-center gap-1">
                <LetterPrimaryCta label="Prepare now" onClick={() => { setArrival(null); start(); }} />
                <LetterPrimaryCta label="Join the room without preparing" onClick={() => setArrival('room')} variant="secondary" />
                {/* [DRAFT] consequence line — no confirmation dialog on skip */}
                <p className="text-sm text-muted-foreground" data-testid="arrival-skip-consequence">
                  You&apos;ll miss the shared definitions and the meeting principle. You can catch up any time.
                </p>
              </div>
            </section>
          ) : (
            <section className="space-y-6" data-testid="arrival-room">
              <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-border px-3 py-1" data-testid="finish-prep-link">
                <span className="text-sm text-muted-foreground">{preparedCount === 0 ? "Preparation not started" : `Preparation: ${preparedCount} of ${AGENDA.length} steps`}</span>
                <button
                  type="button"
                  onClick={() => { setArrival(null); start(); }}
                  className="min-h-10 text-sm font-medium text-blue-600 hover:underline"
                >
                  {preparedCount === 0 ? 'Start your preparation' : 'Finish your preparation'}
                </button>
              </div>
              {/* Mock room: stands in for the live event screen. */}
              <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center">
                <h1 className="text-xl font-semibold text-foreground">Event room (mock)</h1>
                <p className="text-base text-muted-foreground">The host is about to start the first round.</p>
              </div>
            </section>
          )}
        </main>
      ) : step === 'principle' && principleIntroDone && !(answer !== null && !tryAsked) ? (
        <MeetingPrincipleView
          level={PRINCIPLE_LEVEL}
          answer={answer}
          rating={principleRating}
          onAnswer={choosePrinciple}
          onRatingChange={setPrincipleRating}
          onRatingSubmit={next}
          submitLabel="Confirm"
          question={PRINCIPLE_QUESTION}
          // Round 17: the question above the certificate; who opted in sits in the fixed bar,
          // directly above Opt in / Opt out; the rating bar slides up like the Drawer.
          header={
            answer === null ? (
              <h1 className="text-xl font-semibold leading-snug text-foreground" data-testid="principle-decision-question">
                Do you want to follow this principle with the attendees at the event?
              </h1>
            ) : undefined
          }
          aboveChoice={
            <div className="pb-3" data-testid="opted-in-proof-bar">
              <SocialProof
                testId="opted-in-proof"
                people={OPTED_IN}
                line={`${LAST_EVENT_OPTED_IN} opted in at the last event · ${THIS_EVENT_OPTED_IN} for this event`}
              />
            </div>
          }
          ratingBarClassName="animate-in slide-in-from-bottom duration-300"
          aboveRating={
            <div className="flex items-center gap-3 px-2 pb-2 sm:px-5" data-testid="rating-host">
              <GravatarAvatar name="Slava" photoUrl={FOUNDER_PHOTO} isPledger size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Slava <span className="font-normal text-muted-foreground">· event host</span>
                </p>
                <p className="text-sm text-foreground" data-testid="rating-context">
                  {answer === 'in'
                    ? 'Thanks for trying it. Here is the question:'
                    : 'Thanks for letting me ask. Here is the question:'}
                </p>
              </div>
            </div>
          }
        />
      ) : (
        <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
          {step === 'confirm' && variant === 'c' && prepChoice === null && (
            <MockRegisterStep onRegistered={setPrepChoice} />
          )}
          {step === 'confirm' && !(variant === 'c' && prepChoice === null) && (
            <>
              <EventBox
                testId="registered-card"
                title={
                  // Variant D: once prepared, the badge sits under the title, as on the end screen.
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                      <h1 className="text-lg font-semibold">You&apos;re Registered!</h1>
                    </div>
                    {variant === 'd' && finished && (
                      <span data-testid="prep-status"><LetterStatusBadge status="completed" label="Prepared ✓" /></span>
                    )}
                  </div>
                }
              />

              {variant === 'c' && prepChoice === 'early' && (
                <p className="text-center text-base text-foreground" data-testid="arrive-early-line">
                  See you 15 minutes early. You can still prepare here any time.
                </p>
              )}
              <div ref={cardEndRef} className="!mt-0 h-0" aria-hidden />
              {variant === 'd' && !finished && (() => {
                // One block in every state: the why always stays; the question while nothing is
                // done, progress once part-way. Inline under the card by default; pinned to the
                // bottom bar only when inline it would end below the fold (e.g. 320x640).
                const block = (
                <section className="space-y-2 text-center" data-testid="prep-block" ref={prepRef}>
                  {/* [DRAFT] founder copy: why before the question. */}
                  <div className="space-y-0.5" data-testid="prep-why">
                    <p className="text-base font-semibold text-foreground">Our events are different</p>
                    <p className="text-sm leading-snug text-muted-foreground">
                      We use a special structure, and we ask every participant to prepare.
                    </p>
                  </div>
                  {preparedCount === 0 ? (
                    <h2 className="text-xl font-bold leading-snug text-foreground" data-testid="prep-question">
                      Do you have {pointsReady ? prepMinutes : 10} minutes to prepare now?
                    </h2>
                  ) : (
                    <h2 className="text-xl font-bold leading-snug text-foreground" data-testid="prep-progress">
                      {preparedCount} of {AGENDA.length} steps done
                    </h2>
                  )}
                  <div className="flex flex-col items-center gap-1" data-testid="confirm-actions">
                    <LetterPrimaryCta
                      label={preparedCount === 0 ? 'Prepare now' : 'Continue your preparation'}
                      onClick={start}
                    />
                    {emailReminder ? (
                      <p
                        aria-live="polite"
                        className="flex min-h-11 items-center py-1 text-center text-sm font-medium text-green-600"
                        data-testid="reminder-confirmation"
                      >
                        ✓ We&apos;ll email you a reminder
                      </p>
                    ) : (
                      <LetterPrimaryCta label="Remind me by email" onClick={() => setEmailReminder(true)} variant="secondary" />
                    )}
                  </div>
                </section>
                );
                return prepPinned ? <FixedBottomBar ref={barRef}>{block}</FixedBottomBar> : <div className="!mt-8">{block}</div>;
              })()}
              {variant !== 'c' && variant !== 'd' && (
              <section className="space-y-3 !mt-12 text-center" data-testid="prep-block">
                {/* Rendered at once (founder: no delayed question). Until the points load, the
                    full-preparation estimate stands in; it rounds to the same 10 for a new registrant. */}
                <h2 className="text-2xl font-bold leading-snug text-foreground" data-testid="prep-question">
                  Do you have {pointsReady ? prepMinutes : 10} minutes to prepare for the event?
                </h2>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Your short preparation will make the event discussions more meaningful.
                </p>
                <SocialProof
                  large
                  testId="prepared-proof"
                  line={`${LAST_EVENT_PREPARED} prepared for the last event · ${PREPARED.length} for this event`}
                />
              </section>
              )}

              {/* Round 14: the actions sit in the content, right under the prep block. */}
              {variant !== 'd' && <div className="flex flex-col items-center gap-1" data-testid="confirm-actions">
                <LetterPrimaryCta
                  label={saved ? 'Continue where you left off' : variant === 'c' && prepChoice === 'prepare' ? 'Start preparing' : 'Prepare now'}
                  onClick={start}
                  variant={variant === 'c' && prepChoice === 'early' ? 'secondary' : undefined}
                />
                {emailReminder ? (
                  <p
                    aria-live="polite"
                    className="flex min-h-11 items-center py-1 text-center text-sm font-medium text-green-600"
                    data-testid="reminder-confirmation"
                  >
                    ✓ We&apos;ll email you a reminder
                  </p>
                ) : (
                  <LetterPrimaryCta label="Remind me by email" onClick={() => setEmailReminder(true)} variant="secondary" />
                )}
              </div>}
            </>
          )}

          {step === 'plan' && (
            <section className="space-y-5">
              {/* [DRAFT] round 12 A */}
              <Title>Your preparation · {AGENDA.length} steps</Title>
              <ol data-testid="agenda">
                {AGENDA.map((a, i) => {
                  // Round 15: no "You are here" — on this screen the person is before step 1.
                  const done = agendaDone(i);
                  const last = i === AGENDA.length - 1;
                  return (
                    <li key={a.label} className="flex gap-3" data-testid={`agenda-step-${i + 1}`}>
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                            done ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {done ? <Check className="h-4 w-4" aria-label="Done" /> : i + 1}
                        </span>
                        {!last && <span className="my-1 w-px flex-1 bg-border" aria-hidden="true" />}
                      </div>
                      <div className={cn('flex min-w-0 flex-1 items-start justify-between gap-3 pt-1', !last && 'pb-6')}>
                        <p className={cn('min-w-0 text-base font-medium leading-snug text-foreground', done && 'text-muted-foreground')}>
                          {agendaLabel(i, eventPointCount)}
                        </p>
                        <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
                          {stepMinutes(a.steps, tagPoints, !returning)} min
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <FixedBottomBar ref={barRef}>
                <LetterPrimaryCta label="Start now" onClick={next} />
              </FixedBottomBar>
            </section>
          )}

          {step === 'welcome' && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>How this event is different</Title>
                {/* Founder copy, round 15 item 3. */}
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="welcome-intro">
                  In our events, we reward revealing gaps in cognitive understanding.
                </p>
              </div>
              <Clip clip="welcome" pulse onPlay={markPlayed('welcome')} playRequest={playRequest} />
              {videoBar('welcome', next)}
            </section>
          )}

          {step === 'story' && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>What is cognitive understanding?</Title>
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="story-intro">
                  I explain back your intended meaning, and you rate me 10 out of 10: verified cognitive understanding.
                  It&apos;s not agreement, and it&apos;s not feeling what you feel.
                </p>
              </div>
              {/* Round 15: self-hosted (Mp4VideoFacade), no YouTube chrome or exits. */}
              <Clip clip="story" pulse onPlay={markPlayed('story')} playRequest={playRequest} />
              {videoBar('story', next)}
            </section>
          )}

          {step === 'principle' && !principleIntroDone && (
            // Round 13 screen (a): the intro + clip; screen (b) is MeetingPrincipleView above.
            <section className="space-y-5">
              <div className="space-y-2">
                {/* Round 17: the one title; the header already carries the step name. */}
                <Title>Introducing the Clarity Meeting Principle</Title>
                {/* [DRAFT] round 14 item 5 */}
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="principle-intro">
                  It makes the conversations at the event more meaningful. Every attendee can opt in or opt out, both
                  are completely fine. Watch the video, then decide.
                </p>
              </div>
              <Clip clip="principle" onPlay={markPlayed('principle')} playRequest={playRequest} />
              {videoBar('principle', () => { setPrincipleIntroDone(true); window.scrollTo(0, 0); })}
            </section>
          )}

          {step === 'principle' && principleIntroDone && answer !== null && !tryAsked && (
            // Round 15 items 6–7: the founder asks, in person — opt in: "Try it now"; opt out:
            // one question, which the person may decline. Either way the same 0–10 card follows.
            <section className="flex flex-col items-center space-y-4 pt-8 text-center" data-testid={answer === 'in' ? 'try-it-now' : 'opt-out-ask'}>
              <div className="flex flex-col items-center gap-1">
                <GravatarAvatar name="Slava" photoUrl={FOUNDER_PHOTO} isPledger size="xl" />
                <p className="text-base font-semibold text-foreground" data-testid="host-caption">
                  Slava <span className="text-sm font-normal text-muted-foreground">· event host</span>
                </p>
              </div>
              <p className="text-lg leading-relaxed text-foreground">
                {answer === 'in'
                  ? "Thank you for opting in. You promised that anybody at the event can ask you a specific question, right? Let's try it now, to show how it works."
                  : "Thank you. It's completely okay to opt out. It usually means something is unclear, or you disagree. Before you continue, can I ask you one question?"}
              </p>
              <FixedBottomBar ref={barRef}>
                <LetterPrimaryCta
                  label={answer === 'in' ? 'Try it now' : 'Yes'}
                  onClick={() => { setTryAsked(true); window.scrollTo(0, 0); }}
                />
                {answer === 'out' && <LetterPrimaryCta label="No, continue" onClick={next} variant="secondary" />}
              </FixedBottomBar>
            </section>
          )}

          {step === 'cmp7' && (
            <section className="space-y-4">
              <div className="space-y-2">
                <Title>What is your value perception of the Clarity Meeting Principle?</Title>
              </div>
              {tagPoints.cmp7 && shownIds.cmp7 && (
                <StakeStep
                  key={`cmp7-${run}`}
                  tag={CMP7_TAG}
                  points={tagPoints.cmp7}
                  askedIds={shownIds.cmp7}
                  onPointsChanged={pointsChanged}
                  onCountChange={setCmp7Count}
                />
              )}
              {statementsBar(cmp7Count, !!(tagPoints.cmp7 && shownIds.cmp7))}
            </section>
          )}

          {step === 'stake' && (
            <section className="space-y-4">
              {returning && stepIndex === 0 && <EventLine />}
              <div className="space-y-2">
                {/* Templated from the event record: N = the cards this step shows. */}
                <Title>
                  Set your positions on{' '}
                  {shownIds.ikigai1?.length ?? (tagPoints.ikigai1 ?? []).filter((p) => !isAnswered(p)).length} points about
                  “{EVENT.topic}”
                </Title>
                {/* [DRAFT] founder copy, round 10 */}
                <p className="text-base text-muted-foreground">
                  Your positions help us pair you with someone who sees it differently at the event.
                </p>
              </div>
              {tagPoints.ikigai1 && shownIds.ikigai1 && (
                <StakeStep
                  key={`stake-${run}`}
                  tag={EVENT_TAG}
                  points={tagPoints.ikigai1}
                  askedIds={shownIds.ikigai1}
                  onPointsChanged={pointsChanged}
                  onCountChange={setStakeCount}
                />
              )}
              {statementsBar(stakeCount, !!(tagPoints.ikigai1 && shownIds.ikigai1))}
            </section>
          )}

          {step === 'research' && micAsked && (
            <section className="space-y-5" data-testid="mic-question">
              <div className="space-y-2">
                <Title>Does your phone have a USB-C port?</Title>
                <p className="text-base text-muted-foreground">iPhone 15 and newer, and most Android phones, do.</p>
              </div>
              {micSetup === 'none' && (
                <p className="text-base text-foreground" data-testid="mic-none-note">
                  Thanks. You can still take part in the discussion without recording.
                </p>
              )}
              <FixedBottomBar ref={barRef} className="px-0">
                <div className={BAR_INNER_CLASS}>
                {/* Stacked equal outline answers (the research answers' style). */}
                <div className="grid w-full grid-cols-1 gap-2" data-testid="mic-answers">
                  {([
                    ['usbc', 'Yes, USB-C'],
                    ['own', "No, I'll bring my own microphone"],
                    ['none', "No, and I don't have a microphone"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      onClick={() => {
                        setMicSetup(value);
                        if (value !== 'none') next();
                      }}
                      size="lg"
                      variant="outline"
                      aria-pressed={micSetup === value}
                      className={cn(
                        'h-12 min-w-0 rounded-full px-2 text-base',
                        // /meet's selected treatment: filled navy, semibold (meeting-terms-page ladder).
                        micSetup === value &&
                          'border-2 border-[#002B5C] bg-[#002B5C] font-semibold text-white hover:bg-[#002B5C] hover:text-white dark:border-blue-400 dark:bg-blue-400',
                      )}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {micSetup === 'none' && (
                  <div className="mt-3 flex w-full justify-center">
                    <LetterPrimaryCta label="Continue" onClick={next} />
                  </div>
                )}
                </div>
              </FixedBottomBar>
            </section>
          )}

          {step === 'research' && !micAsked && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>
                  Are you open to be one of six volunteers who record their conversations at the event, to contribute to
                  our R&amp;D?
                </Title>
              </div>
              <p className="text-base text-foreground">
                We provide you with a USB-C lavalier microphone, or you can bring your own mic.
              </p>
              <Clip clip="research" />
              {/* Round 14: Yes = primary blue, No thanks = secondary; side by side, same height.
                  Round 15: "places left" sits directly above them. */}
              <FixedBottomBar ref={barRef} className="px-0">
                <div className={cn(BAR_INNER_CLASS, 'flex flex-col items-center')}>
                <p className="mb-2 text-base font-medium text-foreground" data-testid="places-left">
                  {researchPlacesShown} of {RESEARCH_PLACES} volunteer places left
                </p>
                {/* Founder: directly under "places left", above the answers. */}
                <div className="mb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setResearchInfoOpen(true)}
                    aria-haspopup="dialog"
                    className="inline-flex min-h-10 items-center text-sm text-blue-600 underline underline-offset-4"
                    data-testid="learn-more"
                  >
                    Learn how we use your data
                  </button>
                </div>
                <div className="grid w-full grid-cols-2 gap-2" data-testid="research-answers">
                  <Button onClick={() => { setMicAsked(true); window.scrollTo(0, 0); }} size="lg" className="h-12 min-w-0 rounded-full bg-blue-600 px-2 text-base text-white hover:bg-blue-700">
                    Yes, sure
                  </Button>
                  <Button onClick={() => { setMicSetup(null); next(); }} size="lg" variant="outline" className="h-12 min-w-0 rounded-full px-2 text-base">
                    No, thanks
                  </Button>
                </div>
                </div>
              </FixedBottomBar>
            </section>
          )}

          {step === 'end' && (
            <section className="pt-4">
              <EventBox
                testId="end-card"
                title={
                  variant === 'd' ? (
                    <div className="flex flex-col items-center gap-2">
                      <Title>Thank you for preparing</Title>
                      <LetterStatusBadge status="completed" label="Prepared ✓" />
                    </div>
                  ) : (
                    <Title>Thank you for preparing</Title>
                  )
                }
                note={
                  (micSetup === 'usbc' || micSetup === 'own') && (
                    <p className="text-sm text-muted-foreground" data-testid="volunteer-note">
                      You&apos;re a recording volunteer.{' '}
                      {micSetup === 'usbc' ? "We'll bring a USB-C mic for you." : 'Please bring your own microphone.'}
                    </p>
                  )
                }
              />
              {/* Round 15 item 11: the event's stories (StakePage reads ?tab=stories, P1296). */}
              <div className="mt-12 flex flex-col items-center gap-3 text-center" data-testid="end-stories">
                {/* Round 17, founder copy. */}
                <h2 className="text-xl font-semibold text-foreground">Interested in enriching your perspective before the event?</h2>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Our AI agents predicted how {EVENT_EXPERTS.slice(0, -1).join(', ')} and {EVENT_EXPERTS[EVENT_EXPERTS.length - 1]} would
                  answer the {eventPointCount ?? ''} points{' '}
                  {(tagPoints.ikigai1 ?? []).some(isAnswered) ? 'you took a position on' : "we'll discuss"}. Each position comes with a story that explains it.
                </p>
                <LetterPrimaryCta label="Read their stories" onClick={() => navigate(`/stake/${EVENT_TAG}?tab=stories`)} />
              </div>
            </section>
          )}
        </main>
      )}

      {/* The research Q&A in the product's Dialog — what every info/terms modal in the app
          uses at every width (letter-stale-terms-modal, intensity-tutorial-modal, ...). */}
      <Dialog open={researchInfoOpen} onOpenChange={setResearchInfoOpen}>
        {/* Header and links stay put; only the Q&A scrolls — at 320×640 the whole dialog does
            not fit, and a single scroll box cut the links off with no sign there was more. */}
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md" data-testid="research-dialog">
          <DialogHeader>
            <DialogTitle>How we use your data</DialogTitle>
            <DialogDescription className="sr-only">Questions and answers about the voice recording.</DialogDescription>
          </DialogHeader>
          <dl className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto border-y border-border px-6 py-4" data-testid="research-qa">
            {RESEARCH_QA.map(({ q, a }) => (
              <div key={q} className="space-y-1">
                <dt className="text-sm font-semibold text-foreground">{q}</dt>
                <dd className="text-sm text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground" data-testid="research-legal">
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Terms
            </a>
            {' · '}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Privacy
            </a>
            {' · '}
            <a href={RESEARCH_PROGRAMME_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Read more about our research program
            </a>
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
