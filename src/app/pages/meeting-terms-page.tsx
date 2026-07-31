/**
 * @file meeting-terms-page.tsx
 * @description P1016 + P1024 — Clarity Meeting Principle at /meet.
 *
 * A commitment for ONE conversation, entered before it starts. The host picks a
 * rung on the track and hands the phone over; the participant opts in or out, then
 * says how much they think they understood; the phone comes back and the host
 * starts the meeting.
 *
 * The button ordering IS the choreography — the participant never taps "Start
 * meeting", so the phone has to return to the host before the meeting begins. No
 * "hand the phone back" screen is needed.
 *
 * Uses the same certificate shell as the Clarity Organization Terms and the
 * bilateral Partner Agreement (certificate-frame.tsx) — one visual language for
 * every commitment. The level track is portaled into the shared nav's centre slot
 * so the document starts directly under a single bar; the action is fixed to the
 * bottom in the certificate's navy.
 *
 * The understanding number exists to GENERATE A SPOKEN QUESTION while the host is
 * standing right there — a 4 earns "which part is unclear?", a 9 earns "then tell
 * me what my intention is". Nothing gates on it: every number 0-10 proceeds, on
 * both the opt-in and the opt-out path. It is asked AFTER the answer on purpose —
 * before it, a low number reads as refusal and the pressure runs toward inflation.
 *
 * Deliberately has no backend: no auth, no email, no row written anywhere. The
 * agreement is witnessed in the room, not recorded.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SEO } from "@/app/components/seo";
import { NAV_CENTER_SLOT_ID } from "@/app/components/layout/simple-navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CertificateFrame,
  CertificateOathBody,
} from "@/app/components/agreements/certificate-frame";
import { ComprehensionRatingCard } from "@/app/components/shared/comprehension-rating-card";
import {
  MEETING_TERMS_LADDER,
  sectionsForLevel,
  type MeetingTermsLevel,
} from "@/app/content/meeting-terms";

/**
 * Key is UNCHANGED at v1 across P1024. The two new fields are additive and optional:
 * a visitor holding the old `{level, accepted}` shape restores exactly as before,
 * with no answer and no number. Bumping the key would have discarded their level for
 * no gain.
 */
const STORAGE_KEY = "cp.meeting-terms.v1";

/** What the participant answered. `null` = they have not answered yet. */
type Answer = "in" | "out" | null;

const PRINCIPLE_TITLE = "Clarity Meeting Principle";

const UNDERSTANDING_QUESTION =
  "How much do you think you understand your conversation partner's intended meaning behind this principle?";

/**
 * The outlined navy treatment, shared by every non-committing action on this page:
 * both answers, the opt-out exit, and "End meeting". Only "Start meeting" is filled —
 * it is the single action that changes what the two people are about to do, and
 * keeping it the lone filled control satisfies P955's one-primary-per-view rule.
 */
const ANSWER_BUTTON_CLASS =
  "min-h-[44px] py-4 text-base font-semibold border-2 border-[#002B5C] bg-transparent text-[#002B5C] hover:bg-[#002B5C]/10 dark:border-blue-400 dark:text-blue-400";

/**
 * Founder decision: the page opens on "Reveal the gap" — the middle rung. Which rung
 * the page opens on is an anchoring choice, not a neutral one; this one states a real
 * ask while leaving both the lighter and the heavier terms one visible tap away.
 */
const DEFAULT_LEVEL: MeetingTermsLevel = 3;

interface StoredState {
  level: MeetingTermsLevel;
  accepted: boolean;
  answer: Answer;
  rating: number | null;
}

function isLevel(value: unknown): value is MeetingTermsLevel {
  return value === 1 || value === 2 || value === 3;
}

/**
 * The ladder used to open at 0 ("Just talk"), which has since been cut. A visitor who
 * chose it still has `{"level":0}` in storage.
 *
 * Their stored choice was the LIGHTEST terms on offer; resolving it to the default
 * would silently move them to the heaviest, which is the one direction a consent
 * control must never drift on its own. Map it to the lightest surviving rung instead.
 */
const LEGACY_LEVEL_0 = 0;
const LIGHTEST_LEVEL: MeetingTermsLevel = 1;

function coerceLevel(value: unknown): MeetingTermsLevel {
  if (isLevel(value)) return value;
  if (value === LEGACY_LEVEL_0) return LIGHTEST_LEVEL;
  return DEFAULT_LEVEL;
}

/**
 * localStorage can throw (private browsing, disabled storage) or hold junk from a
 * hand-edit. Every access is guarded: the page must work for the duration of the
 * visit without state surviving a reload, rather than fail to render.
 */
function coerceAnswer(value: unknown): Answer {
  return value === "in" || value === "out" ? value : null;
}

/** Only a whole 0-10 counts. Anything else — including a hand-edited 11 — reads as unanswered. */
function coerceRating(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10
    ? value
    : null;
}

function readStored(): StoredState {
  const fallback: StoredState = {
    level: DEFAULT_LEVEL,
    accepted: false,
    answer: null,
    rating: null,
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const { level, accepted, answer, rating } = parsed as Record<string, unknown>;
    return {
      level: coerceLevel(level),
      accepted: accepted === true,
      answer: coerceAnswer(answer),
      rating: coerceRating(rating),
    };
  } catch {
    return fallback;
  }
}

function writeStored(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — the session still works, it just won't survive a reload.
  }
}

export function MeetingTermsPage() {
  const [level, setLevel] = useState<MeetingTermsLevel>(DEFAULT_LEVEL);
  const [accepted, setAccepted] = useState(false);
  const [answer, setAnswer] = useState<Answer>(null);
  const [rating, setRating] = useState<number | null>(null);
  // Restore in an effect rather than a lazy initializer so the first paint matches
  // the prerendered HTML.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setLevel(stored.level);
    setAccepted(stored.accepted);
    setAnswer(stored.answer);
    setRating(stored.rating);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeStored({ level, accepted, answer, rating });
  }, [level, accepted, answer, rating, restored]);

  // The track is locked once the participant has answered — not only once the meeting
  // runs. Changing the rung after someone opted in would leave them committed to terms
  // they never read, which is the same hazard the in-meeting lock exists to prevent.
  const trackLocked = accepted || answer !== null;

  const handleSelect = useCallback(
    (next: MeetingTermsLevel) => {
      if (trackLocked) return;
      setLevel(next);
    },
    [trackLocked],
  );

  /** Return to the ladder with the rung intact — the opt-out exit, and "End meeting". */
  const resetToChoosing = useCallback(() => {
    setAccepted(false);
    setAnswer(null);
    setRating(null);
  }, []);

  // The track rides in the nav's centre slot: this page's nav row is otherwise empty
  // (it renders `compact`), and a second row below it cost 44px on every viewport.
  // Resolved in a layout effect so the track never paints in one place and jumps.
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setNavSlot(document.getElementById(NAV_CENTER_SLOT_ID));
  }, []);

  const sections = sectionsForLevel(level);
  const track = <LevelTrack level={level} locked={trackLocked} onSelect={handleSelect} />;

  // Three steps. `choosing` reads the principle and answers; `rating` states the
  // number; `in meeting` is P1016's accepted state, unchanged.
  const step: "choosing" | "rating" | "meeting" =
    accepted ? "meeting" : answer === null ? "choosing" : "rating";

  return (
    <div className="min-h-screen pb-28">
      <SEO
        title={PRINCIPLE_TITLE}
        description="Agree how much verification a conversation will carry, before it starts. Three levels, one tap, nothing stored."
        url="/meet"
      />
      {/* The certificate's own <h2> is the visible title. This keeps a single h1
          in the document outline without repeating the words on screen. */}
      <h1 className="sr-only">{PRINCIPLE_TITLE}</h1>

      {/* Fallback: if the nav isn't on screen (a chrome-free embed, or the slot
          renamed), the track still renders here rather than vanishing. */}
      {navSlot ? (
        createPortal(track, navSlot)
      ) : (
        <div className="sticky top-16 lg:top-20 z-30 border-b border-border bg-background/95 px-4 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-2xl">{track}</div>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {step === "rating" ? (
          /* The question REPLACES the certificate rather than sitting below it. The
             decision is already made at this point, and stacking the two put the 0-10
             row below the fold at 320px — the one viewport where this page is used. */
          <ComprehensionRatingCard
            question={UNDERSTANDING_QUESTION}
            onSelect={() => { /* unused: the action lives in the sticky bar below */ }}
            onSelectionChange={setRating}
            hideSubmit
            questionClassName="text-base font-semibold text-center"
          />
        ) : (
          <CertificateFrame
            ariaLabel={PRINCIPLE_TITLE}
            title={PRINCIPLE_TITLE}
            kicker="A commitment for this conversation"
            epigraph="We all crave being understood. Let's commit to listen."
          >
            <CertificateOathBody sections={sections} />
          </CertificateFrame>
        )}
      </div>

      {/* The action is fixed to the bottom, not scrolled with the document: on the long
          levels it would otherwise sit below the fold on arrival. Kept in the
          certificate's navy so it still reads as part of the document it belongs to.
          Skipped entirely while the participant is mid-rating and no action exists yet —
          the bar draws a top border and a backdrop, so keeping it mounted leaves an
          empty bordered strip across the bottom of the screen. */}
      {!(step === "rating" && rating === null) && (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-xs px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step === "choosing" && (
            <>
              {/* Two answers of EQUAL weight. Neither is pre-selected and neither is
                  styled as the expected one: an opt-out that looks like a mistake is
                  not an opt-out. Both are outlined rather than filled, so P955's
                  one-full-width-primary rule holds — there is no primary here. */}
              <div className="flex gap-2">
                <Button
                  onClick={() => setAnswer("in")}
                  size="lg"
                  className={cn(ANSWER_BUTTON_CLASS, "flex-1")}
                >
                  Opt in
                </Button>
                <Button
                  onClick={() => setAnswer("out")}
                  size="lg"
                  className={cn(ANSWER_BUTTON_CLASS, "flex-1")}
                >
                  Opt out
                </Button>
              </div>
              <p className="pt-1.5 text-center text-xs text-muted-foreground">
                Not legally binding
              </p>
            </>
          )}

          {step === "rating" && rating !== null && answer === "in" && (
            /* ABSENT until a number is chosen, never disabled — P955 forbids a
               disabled primary rendered as decoration, and the p955-gate enforces it. */
            <Button
              onClick={() => setAccepted(true)}
              size="lg"
              className="w-full bg-[#002B5C] py-4 text-base font-semibold text-white hover:bg-[#001f45]"
            >
              Start meeting
            </Button>
          )}

          {step === "rating" && rating !== null && answer === "out" && (
            <>
              {/* Names what happened and closes the loop. It does NOT auto-return and
                  does NOT snap back: an instant bounce reads as the app rejecting the
                  answer, which is the opposite of what an opt-out should feel like.
                  There is no "Start meeting anyway" — with no principle there is
                  nothing to lock, and the conversation that follows is between two
                  people, not a page state. */}
              <p
                data-testid="opted-out-marker"
                role="status"
                className="pb-2 text-center text-xs font-medium text-foreground"
              >
                Noted. Nothing agreed.
              </p>
              <Button
                onClick={resetToChoosing}
                size="lg"
                className={cn(ANSWER_BUTTON_CLASS, "w-full")}
              >
                Back to the principles
              </Button>
            </>
          )}

          {step === "meeting" && (
            <>
              {/* The confirmation sits with the button that produced it — an earlier
                  placement below the principle body landed ~730px off-screen on the
                  longest level at 320px, so accepting appeared to do nothing. */}
              <p
                data-testid="accepted-marker"
                // Announced, not merely drawn: this is the only textual confirmation
                // that the shared commitment took effect, and the button's own label
                // change is the sole other signal.
                role="status"
                className="pb-1.5 text-center text-xs font-medium text-foreground"
              >
                Accepted — meeting in progress.
              </p>
              <Button
                onClick={resetToChoosing}
                size="lg"
                className={cn(ANSWER_BUTTON_CLASS, "w-full")}
              >
                End meeting
              </Button>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function LevelTrack({
  level,
  locked,
  onSelect,
}: {
  level: MeetingTermsLevel;
  locked: boolean;
  onSelect: (level: MeetingTermsLevel) => void;
}) {
  return (
    <fieldset disabled={locked}>
      <legend className="sr-only">How much verification this conversation carries</legend>

      {/* Four stops on one line. Native radios in a shared group give arrow-key
          navigation and screen-reader semantics without hand-rolled key handling;
          each stop's tap target is its whole label column, not just the dot. */}
      <div className="relative pt-1">
        {/* Connecting line, inset by half a column so it spans dot-centre to dot-centre. */}
        <div
          aria-hidden="true"
          className="absolute top-[0.75rem] left-[12.5%] right-[12.5%] h-0.5 bg-border dark:bg-zinc-600"
        />
        <div className="relative flex">
          {MEETING_TERMS_LADDER.map((rung) => {
            const selected = rung.level === level;
            return (
              <label
                key={rung.level}
                data-testid={`terms-stop-${rung.level}`}
                className={cn(
                  // Compact but still a real target: the whole column is the tap
                  // area, not the 16px dot.
                  "flex-1 flex flex-col items-center gap-1 pt-0.5 pb-0.5 min-h-[40px]",
                  locked ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <input
                  type="radio"
                  name="meeting-terms-level"
                  value={rung.level}
                  checked={selected}
                  disabled={locked}
                  onChange={() => onSelect(rung.level)}
                  className="sr-only peer"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-4 h-4 rounded-full border-2 bg-background transition-colors",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                    selected
                      ? "border-[#002B5C] bg-[#002B5C] dark:border-blue-400 dark:bg-blue-400"
                      // An unselected ring at border-token strength is near-invisible
                      // on dark; the ladder has to stay readable across a room.
                      : "border-border dark:border-zinc-500",
                    locked && "opacity-60",
                  )}
                />
                <span
                  className={cn(
                    // One line at every width. The label was previously allowed to
                    // wrap, which forced a reserved second line on all four columns
                    // to keep the row's baseline even — ~14px of empty band above
                    // the terms on every viewport for a case that only occurs at
                    // 320px. Sizing the type to fit instead removes both.
                    "text-[10px] sm:text-xs leading-tight text-center px-0.5 whitespace-nowrap",
                    selected ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {rung.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

    </fieldset>
  );
}
