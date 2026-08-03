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
 * It is asked OVER the principle, never instead of it: the question is about that
 * text, so the text stays on screen and scrolls behind the bar that asks.
 *
 * Deliberately has no backend: no auth, no email, no row written anywhere. The
 * agreement is witnessed in the room, not recorded.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { FixedBottomBar } from "@/app/components/shared/fixed-bottom-bar";
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
 * Filled certificate navy — the page's primary action, worn by "Opt in" and, one step
 * later, by "Start meeting". Never both at once: they live in different steps, so P955's
 * one-primary-per-view rule holds.
 *
 * Navy rather than the design system's `blue-600` because this page's palette is the
 * certificate's, established in P1016.
 *
 * The `border-2` is the SAME colour as the fill, so it is invisible. It exists only so
 * that "Opt in" and "Opt out" render identical boxes: these buttons are auto-height, and
 * under `box-sizing: border-box` a border still adds to an auto height. Without it the
 * outlined "Opt out" stands 4px taller than the filled "Opt in", which is exactly the
 * mismatch the equal-box e2e assertion catches.
 *
 * UAT reversal (P1024): "Opt in" was originally outlined and equal in weight to "Opt
 * out", on the reasoning that an opt-out styled as secondary is not really an opt-out.
 * The founder overrode that in favour of the design system's one-primary-CTA hierarchy.
 * The cost is real and accepted — the page now has a visibly expected answer on a consent
 * control — and "Opt out" keeps full size and a visible border to hold that cost down.
 * Do not weaken it further to a ghost or text button without revisiting the spec.
 */
const PRIMARY_BUTTON_CLASS =
  "min-h-[44px] py-4 text-base font-semibold border-2 border-[#002B5C] bg-[#002B5C] text-white hover:border-[#001f45] hover:bg-[#001f45]";

/**
 * The fade that tells the reader the principle CONTINUES above the bar rather than
 * ending there. Both bars carry it — visual QA caught it on only the rating one, and the
 * choosing step is where it matters most: that is the screen where a stranger is still
 * reading the text they are about to answer for, and a hard cut mid-sentence reads as
 * broken content rather than as "scroll for more".
 */
const BAR_FADE_CLASS =
  "before:content-[''] before:absolute before:inset-x-0 before:-top-16 before:h-16 before:bg-gradient-to-t before:from-background before:to-transparent before:pointer-events-none";

/**
 * Both bars share the certificate's own measure, so the action row lines up edge-to-edge
 * with the document above it instead of sitting on a narrower inset — visual QA caught the
 * choosing bar sitting at `max-w-xs` under a `max-w-2xl` certificate. The bars and the
 * certificate should read as one surface, not two. Horizontal padding is applied by each
 * caller, because the two bars pad differently (the rating bar pads on the bar itself, to
 * give the 0-10 row every pixel it can get at 320px).
 */
const BAR_INNER_CLASS = "mx-auto w-full max-w-2xl";

/**
 * The outlined navy treatment, shared by every non-committing action on this page:
 * "Opt out", the opt-out exit, and "End meeting". Identical box metrics to
 * PRIMARY_BUTTON_CLASS — only the fill differs.
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

  /**
   * The rating bar is FIXED, so the certificate scrolls behind it — without reserving
   * its height the last lines of the longest rung are unreachable, hidden under the bar
   * with no way to scroll further. Measured rather than guessed because the bar's height
   * changes within the step: it grows when "Start meeting" appears after a number, and
   * again on the opt-out path when the acknowledgement text lands above the exit button.
   *
   * Same approach as the letter's story-rate drawer (`letter-flow-content.tsx`), which is
   * why `FixedBottomBar` forwards a ref at all.
   */
  const [ratingBarHeight, setRatingBarHeight] = useState(0);
  const ratingBarObserver = useRef<ResizeObserver | null>(null);
  const setRatingBarRef = useCallback((node: HTMLDivElement | null) => {
    ratingBarObserver.current?.disconnect();
    ratingBarObserver.current = null;
    if (!node) {
      setRatingBarHeight(0);
      return;
    }
    setRatingBarHeight(node.getBoundingClientRect().height);
    // Guarded: jsdom has no ResizeObserver, and the unit tests render this page.
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        setRatingBarHeight(entry.target.getBoundingClientRect().height);
      });
      observer.observe(node);
      ratingBarObserver.current = observer;
    }
  }, []);
  useEffect(() => () => ratingBarObserver.current?.disconnect(), []);

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
    <div
      // NOT min-h-screen: this sits inside a <main> that is already flex-1 of a
      // min-h-screen column AND carries the nav's 4rem top offset. A 100vh minimum here
      // stacks on that offset, so the page overflowed by exactly the nav height on every
      // viewport — a scrollbar and a band of dead space under content that fits.
      className="pb-24"
      // pb-24 clears the short choosing/meeting bar. The rating bar is several times
      // taller and varies within the step, so its measured height wins when mounted —
      // without it the tail of the longest rung sits under the bar, unscrollable.
      style={ratingBarHeight > 0 ? { paddingBottom: ratingBarHeight + 16 } : undefined}
    >
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

      {/* The certificate stays mounted through EVERY step, including the rating one. The
          question asks how well the participant understood *this principle* — hiding the
          principle to ask it is the one thing the question cannot afford. */}
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <CertificateFrame
          ariaLabel={PRINCIPLE_TITLE}
          title={PRINCIPLE_TITLE}
          kicker="A commitment for this conversation"
          epigraph="We all crave being understood. Let's commit to listen."
        >
          <CertificateOathBody sections={sections} />
        </CertificateFrame>
      </div>

      {step === "rating" ? (
        /* The understanding question docks OVER the certificate rather than replacing it
           — the same layout the letter's story-rate phase uses, down to the shared
           `FixedBottomBar` and the gradient fade above it. Fixing the bar is what makes
           the 0-10 row reachable at 320px without hiding the principle: the row is
           pinned, the certificate scrolls behind it. (This reverses the first build,
           which swapped the certificate out to keep the row above the fold.)

           `FixedBottomBar` is NOT the shadcn/vaul `Drawer` used by /live and /chat — no
           modal, no scrim, no dismiss gesture. Nothing here is dismissible. */
        <FixedBottomBar
          ref={setRatingBarRef}
          // px-3 at mobile rather than the component's p-4: every horizontal pixel here
          // goes to the 0-10 row, which is the tightest element on the page at 320px.
          className={cn(
            "px-3 sm:px-4 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.10)]",
            BAR_FADE_CLASS,
          )}
        >
          {/* max-w-2xl matches the certificate's own container, so the bar's content sits
              on the same measure as the document above it instead of on a narrower one.
              px-3 trims the card's default p-5 at mobile, where the horizontal padding was
              eating the width the question needs; sm: restores it once there is room. */}
          <div className={BAR_INNER_CLASS}>
            <ComprehensionRatingCard
              question={UNDERSTANDING_QUESTION}
              onSelect={() => { /* unused: the action renders below, inside this bar */ }}
              onSelectionChange={setRating}
              hideSubmit
              className="px-3 sm:px-5"
              questionClassName="text-lg font-semibold text-center leading-snug"
            />

            {rating !== null && answer === "in" && (
              /* ABSENT until a number is chosen, never disabled — P955 forbids a
                 disabled primary rendered as decoration, and the p955-gate enforces it. */
              <Button
                onClick={() => setAccepted(true)}
                size="lg"
                className={cn(PRIMARY_BUTTON_CLASS, "mt-3 w-full")}
              >
                Start meeting
              </Button>
            )}

            {rating !== null && answer === "out" && (
              /* The opt-out path's counterpart to "Start meeting" — same shape, same
                 weight, same position, and tapped by the same person: the HOST, once the
                 phone has come back and they have read the number. That symmetry is the
                 point. An opt-out that ends in silence reads as a broken tap, and one
                 that ends in "Back to the principles" reads as pressure to revise the
                 answer just given; a plain Submit does neither.

                 It commits nothing — it clears the answer and the number, unlocks the
                 track, and returns to the ladder. There is no "Start meeting anyway":
                 with no principle there is nothing to lock, and what follows is a
                 conversation between two people, not a page state. */
              <Button
                onClick={resetToChoosing}
                size="lg"
                className={cn(PRIMARY_BUTTON_CLASS, "mt-3 w-full")}
              >
                Submit
              </Button>
            )}
          </div>
        </FixedBottomBar>
      ) : (
        /* The action is fixed to the bottom, not scrolled with the document: on the long
           levels it would otherwise sit below the fold on arrival. Kept in the
           certificate's navy so it still reads as part of the document it belongs to. */
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
            BAR_FADE_CLASS,
          )}
        >
          <div className={cn(BAR_INNER_CLASS, "px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>
            {step === "choosing" && (
              /* "Opt in" is the primary, "Opt out" the secondary at the SAME size — see
                 PRIMARY_BUTTON_CLASS for why that reverses this page's original design
                 and what the reversal costs. Neither is pre-selected. Only one filled
                 control renders here, so P955's one-primary-per-view rule holds. */
              <div className="flex gap-2">
                <Button
                  onClick={() => setAnswer("in")}
                  size="lg"
                  className={cn(PRIMARY_BUTTON_CLASS, "flex-1")}
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
