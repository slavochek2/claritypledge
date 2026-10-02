/**
 * @file meeting-principle-view.tsx
 * @description The Clarity Meeting Principle as /meet shows it: the certificate, the fixed
 * opt in / opt out bar, then the 0-10 understanding question docked over the certificate.
 *
 * Extracted from meeting-terms-page.tsx (P1336) so /meet and the event-registration
 * onboarding render the SAME surface and cannot drift. State lives with the caller:
 * /meet keeps its storage, level ladder and meeting step; onboarding passes level 3 and
 * moves on after the number. The JSX and every class below are unchanged from /meet.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CertificateFrame,
  CertificateOathBody,
} from "@/app/components/agreements/certificate-frame";
import { ComprehensionRatingCard } from "@/app/components/shared/comprehension-rating-card";
import { FixedBottomBar } from "@/app/components/shared/fixed-bottom-bar";
import { sectionsForLevel, type MeetingTermsLevel } from "@/app/content/meeting-terms";

export const PRINCIPLE_TITLE = "Clarity Meeting Principle";

/** What the participant answered. `null` = they have not answered yet. */
export type PrincipleAnswer = "in" | "out" | null;

// Exported: the room's /meet asks the identical question from the identical component
// (founder, 2026-08-21: "lets reuse same component, content and behaviour please for event
// room!"). Exported rather than copied so the two surfaces cannot drift — a second literal
// is the failure this repo's Reference-Over-Duplication rule names.
export const UNDERSTANDING_QUESTION =
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
// Exported: P1077's /ready reuses this exact treatment for its own Continue button —
// one visual language for the commitment surfaces that lead into a clarity meeting.
export const PRIMARY_BUTTON_CLASS =
  "min-h-11 py-4 text-base font-semibold border-2 border-[#002B5C] bg-[#002B5C] text-white hover:border-[#001f45] hover:bg-[#001f45]";

/**
 * The fade that tells the reader the principle CONTINUES above the bar rather than
 * ending there. Both bars carry it — visual QA caught it on only the rating one, and the
 * choosing step is where it matters most: that is the screen where a stranger is still
 * reading the text they are about to answer for, and a hard cut mid-sentence reads as
 * broken content rather than as "scroll for more".
 */
// Exported: the room's /meet portals this in too (EventRoomMeet.tsx) — same fixed-bar-
// over-scrolling-content shape, same "hard cut reads as broken content" problem.
export const BAR_FADE_CLASS =
  "before:content-[''] before:absolute before:inset-x-0 before:-top-16 before:h-16 before:bg-gradient-to-t before:from-background before:to-transparent before:pointer-events-none";

/**
 * Both bars share the certificate's own measure, so their content lines up edge-to-edge with
 * the document above instead of sitting on a different inset — visual QA caught the choosing
 * bar at `max-w-xs` under a `max-w-2xl` certificate, and later caught the rating card
 * overhanging the certificate by 16px a side at desktop. The bars and the certificate should
 * read as one surface, not two.
 *
 * This is deliberately IDENTICAL to the certificate's own container
 * (`mx-auto max-w-2xl px-4`), which is the only way the two agree at every width: `max-w-2xl`
 * alone matches at desktop and drifts at mobile, and matching padding alone does the reverse.
 * The consequence is that neither bar may carry horizontal padding of its own — the inner
 * container owns it. `FixedBottomBar` ships `p-4`, so the rating bar cancels the horizontal
 * half with `px-0`.
 */
// Exported (value UNCHANGED — read the paragraph above before touching it): the room's
// /meet has the identical fixed-bar-over-certificate shape and had drifted 16px out of
// alignment by rolling its own bare `w-full max-w-2xl`, which does not cancel
// FixedBottomBar's `p-4`. Consumers must still pair it with `px-0` on the bar itself.
export const BAR_INNER_CLASS = "mx-auto w-full max-w-2xl px-4";

/**
 * Below this many pixels of remaining scroll, the cue has nothing useful left to point at.
 * Non-zero to absorb sub-pixel scroll heights, which would otherwise flicker it at the end.
 */
const SCROLL_CUE_THRESHOLD_PX = 8;

/**
 * The outlined navy treatment, shared by every non-committing action on this page:
 * "Opt out", the opt-out exit, and "End meeting". Identical box metrics to
 * PRIMARY_BUTTON_CLASS — only the fill differs.
 *
 * Exported: P1114's room /meet reuses this exact treatment for its own "Opt out" —
 * same identical decision, same identical page.
 */
export const ANSWER_BUTTON_CLASS =
  "min-h-11 py-4 text-base font-semibold border-2 border-[#002B5C] bg-transparent text-[#002B5C] hover:bg-[#002B5C]/10 dark:border-blue-400 dark:text-blue-400";

export interface MeetingPrincipleViewProps {
  level: MeetingTermsLevel;
  answer: PrincipleAnswer;
  rating: number | null;
  /** /meet only: the meeting is running. Onboarding never sets it. */
  accepted?: boolean;
  onAnswer: (answer: "in" | "out") => void;
  onRatingChange: (rating: number | null) => void;
  /** The rating card's own submit. */
  onRatingSubmit: () => void;
  submitLabel: string;
  /** /meet's "End meeting". */
  onEndMeeting?: () => void;
  /** Rendered first inside the page wrapper (SEO, h1, the level track). */
  lead?: ReactNode;
  /** Rendered above the certificate, inside its container (e.g. FocusHeader). */
  header?: ReactNode;
  /** Replaces the meeting-step footer when given. */
  meetingFooter?: ReactNode;
  /** P1336: the 0-10 question. Default: UNDERSTANDING_QUESTION (the /meet wording). */
  question?: string;
  /** P1336: rendered below the certificate, inside its container. Default: nothing. */
  afterCertificate?: ReactNode;
  /**
   * P1336: false removes the bouncing "more below" chevron from the bars. Default true — /meet
   * and the room keep it. Onboarding turns it off once its roster is showing, where the chevron
   * landed on the last visible row.
   */
  showScrollCue?: boolean;
  /** P1336: extra classes on the rating bar (e.g. the Drawer's slide-in). Default: none. */
  ratingBarClassName?: string;
  /** P1336: rendered inside the choosing bar, directly above Opt in / Opt out. Default: nothing. */
  aboveChoice?: ReactNode;
  /** P1336: rendered inside the rating bar, directly above the question. Default: nothing. */
  aboveRating?: ReactNode;
  /**
   * P1387: the rating step renders IN the page under the certificate (scrolled into view on
   * arrival) instead of docked over it. Default false — /meet and letters keep the docked bar.
   * The preparation sets it (founder, 2026-10-02: one page on a phone, nothing covering 70-88%
   * of the screen).
   */
  ratingInline?: boolean;
}

export function MeetingPrincipleView({
  level,
  answer,
  rating,
  accepted = false,
  onAnswer,
  onRatingChange,
  onRatingSubmit,
  submitLabel,
  onEndMeeting,
  lead,
  header,
  meetingFooter,
  question = UNDERSTANDING_QUESTION,
  afterCertificate,
  showScrollCue = true,
  ratingBarClassName,
  aboveChoice,
  aboveRating,
  ratingInline = false,
}: MeetingPrincipleViewProps) {
  /**
   * The rating bar is FIXED, so the certificate scrolls behind it — without reserving
   * its height the last lines of the longest rung are unreachable. Measured rather than
   * guessed because the bar's height changes within the step.
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
        if (entry) setRatingBarHeight(entry.target.getBoundingClientRect().height);
      });
      observer.observe(node);
      ratingBarObserver.current = observer;
    }
  }, []);
  useEffect(() => () => ratingBarObserver.current?.disconnect(), []);

  // Three steps. `choosing` reads the principle and answers; `rating` states the
  // number; `meeting` is /meet's accepted state.
  const step: "choosing" | "rating" | "meeting" =
    accepted ? "meeting" : answer === null ? "choosing" : "rating";
  const inlineRating = ratingInline && step === "rating";
  // On arrival at the inline rating, bring the question into view once; the certificate is
  // above it, one scroll up.
  const inlineRatingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inlineRating) inlineRatingRef.current?.scrollIntoView({ block: "end" });
  }, [inlineRating]);

  return (
    <div
      // NOT min-h-screen: this sits inside a <main> that is already flex-1 of a
      // min-h-screen column AND carries the nav's 4rem top offset. A 100vh minimum here
      // stacks on that offset, so the page overflowed by exactly the nav height on every
      // viewport — a scrollbar and a band of dead space under content that fits.
      className={inlineRating ? "pb-[max(1.5rem,env(safe-area-inset-bottom))]" : "pb-24"}
      // pb-24 clears the short choosing/meeting bar. The rating bar is several times
      // taller and varies within the step, so its measured height wins when mounted —
      // without it the tail of the longest rung sits under the bar, unscrollable.
      // The choosing bar is measured too (P1336: content above Opt in / Opt out makes it taller
      // than pb-24 clears); never less than pb-24.
      style={!inlineRating && ratingBarHeight > 0 ? { paddingBottom: Math.max(96, ratingBarHeight + 16) } : undefined}
    >
      {lead}

      {/* The certificate stays mounted through EVERY step, including the rating one. The
          question asks how well the participant understood *this principle* — hiding the
          principle to ask it is the one thing the question cannot afford. */}
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {header}
        <CertificateFrame
          ariaLabel={PRINCIPLE_TITLE}
          title={PRINCIPLE_TITLE}
          kicker="A commitment for this conversation"
          epigraph="We all crave being understood. Let's commit to listen."
        >
          <CertificateOathBody sections={sectionsForLevel(level)} />
        </CertificateFrame>
        {afterCertificate}
      </div>

      {inlineRating ? (
        <div ref={inlineRatingRef} className="mx-auto max-w-2xl px-4 pt-6" data-testid="principle-rating-inline">
          {aboveRating}
          <ComprehensionRatingCard
            question={question}
            initialValue={rating}
            onSelectionChange={onRatingChange}
            onSelect={onRatingSubmit}
            submitLabel={submitLabel}
            ctaClassName={cn(PRIMARY_BUTTON_CLASS, "mt-3 w-full")}
            className="px-2 sm:px-5"
            questionClassName="text-lg font-semibold text-center leading-snug"
          />
        </div>
      ) : step === "rating" ? (
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
          // px-0 cancels the component's own `p-4` horizontally: BAR_INNER_CLASS owns the
          // horizontal padding, because that is what makes it match the certificate.
          className={cn(
            "px-0 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.10)]",
            BAR_FADE_CLASS,
            ratingBarClassName,
          )}
        >
          {showScrollCue && <ScrollCue />}
          {/* px-3 trims the card's default p-5 at mobile, where the horizontal padding was
              eating the width the question needs; sm: restores it once there is room. */}
          <div className={BAR_INNER_CLASS}>
            {aboveRating}
            {/* The action is the CARD'S OWN submit — the same button the letter's
                story-rate phase renders, from the same component, in the same place
                relative to the row. Only the label and the palette differ.

                UAT reversal (P1024): this button used to be ABSENT until a number was
                picked, on P955's "no disabled primary as decoration" rule. The founder
                overrode that for cross-surface consistency: the letter asks the same
                question with the same component and shows its submit disabled from the
                first frame, so /meet showing nothing was the odd one out. Two things the
                reversal buys beyond consistency — the button states that a step remains
                after the number (a bar that ends at the row reads as finished), and the
                bar stops changing height mid-step, so the certificate no longer reflows
                under the reader at the moment they tap.

                What it costs: a disabled control on screen. Held down by the row directly
                above it being the only thing to tap, and by "decoration" not applying —
                this button is the step's actual next action, not an empty-state prop.

                On the opt-out path the same control reads "Submit". Same shape, weight and
                position, tapped by the same person: the HOST, once the phone is back and
                they have read the number. That symmetry is the point — an opt-out ending
                in silence reads as a broken tap, and one ending in "Back to the
                principles" reads as pressure to revise the answer just given. It commits
                nothing: it clears the answer and the number, unlocks the track, and
                returns to the ladder. There is no "Start meeting anyway" — with no
                principle there is nothing to lock. */}
            <ComprehensionRatingCard
              question={question}
              // Seeded so a reload mid-step restores the number VISIBLY. The page already
              // restored it into `rating`; without this the row rendered empty beside a
              // page that believed a number had been given.
              initialValue={rating}
              onSelectionChange={onRatingChange}
              onSelect={onRatingSubmit}
              submitLabel={submitLabel}
              ctaClassName={cn(PRIMARY_BUTTON_CLASS, "mt-3 w-full")}
              // px-2 trims the card's default p-5 at mobile. Aligning the card to the
              // certificate (BAR_INNER_CLASS) cost 10px of inner width, which pushed the
              // question from four wrapped lines to five — the wrong direction, since the
              // question being cramped is what started this round. Taking it back out of the
              // card's own padding keeps the alignment AND the four lines. sm: restores the
              // full padding once there is room for both.
              className="px-2 sm:px-5"
              questionClassName="text-lg font-semibold text-center leading-snug"
            />
          </div>
        </FixedBottomBar>
      ) : (
        /* The action is fixed to the bottom, not scrolled with the document: on the long
           levels it would otherwise sit below the fold on arrival. Kept in the
           certificate's navy so it still reads as part of the document it belongs to. */
        <div
          ref={setRatingBarRef}
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
            BAR_FADE_CLASS,
          )}
        >
          {showScrollCue && <ScrollCue />}
          <div className={cn(BAR_INNER_CLASS, "py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>
            {step === "choosing" && aboveChoice}
            {step === "choosing" && (
              /* "Opt in" is the primary, "Opt out" the secondary at the SAME size — see
                 PRIMARY_BUTTON_CLASS for why that reverses this page's original design
                 and what the reversal costs. Neither is pre-selected. Only one filled
                 control renders here, so P955's one-primary-per-view rule holds. */
              <div className="flex gap-2">
                <Button
                  onClick={() => onAnswer("in")}
                  size="lg"
                  className={cn(PRIMARY_BUTTON_CLASS, "flex-1")}
                >
                  Opt in
                </Button>
                <Button
                  onClick={() => onAnswer("out")}
                  size="lg"
                  className={cn(ANSWER_BUTTON_CLASS, "flex-1")}
                >
                  Opt out
                </Button>
              </div>
            )}

            {step === "meeting" && meetingFooter !== undefined ? meetingFooter : step === "meeting" && (
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
                  onClick={onEndMeeting}
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

/**
 * The letter's story-rate scroll cue (`letter-flow-content.tsx`), reused here for the same
 * reason: the document scrolls BEHIND a fixed bar, and the gradient fade alone does not say
 * so. Visual QA read the faded cut mid-sentence as broken content rather than as "there is
 * more" — on every viewport, and on the choosing step too, which is where a stranger is
 * still reading the text they are about to answer for.
 *
 * Two deliberate deviations from the letter's copy of this:
 *   - It hides at the bottom instead of bouncing forever with nothing left to point at.
 *   - It runs on both steps, not only the rating one. On /meet the principle is the thing
 *     being agreed to; unread tail text is a worse failure here than in a letter.
 *
 * Measured against the live document on a ResizeObserver, not once on mount. The page's
 * height SETTLES after mount — the certificate reflows, and the measured rating-bar height
 * lands as the page's bottom padding — and none of that fires scroll or resize. A first
 * build of this measured on mount alone and left the cue pointing down a page with zero
 * scroll remaining, which is worse than no cue: it promises content that does not exist.
 */
function ScrollCue() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      const remaining =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      setVisible(remaining > SCROLL_CUE_THRESHOLD_PX);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Guarded: jsdom has no ResizeObserver, and the unit tests render this page.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  if (!visible) return null;

  // Sits INSIDE the 64px fade band (BAR_FADE_CLASS), clear of the action row rather than
  // in the gap between the two buttons. It used to be a white drop-shadowed pill at -top-2,
  // straddling the bar's edge directly between Opt in and Opt out: it read as a third
  // button, and since it is (correctly) pointer-events-none, the space between the two
  // primary actions was a dead target — verified at 375px, a tap there produced no dialog,
  // no navigation, not even a scroll. The cue itself stays; a hard cut mid-sentence reads
  // as broken content, which is why it exists. Only its button costume goes: no pill, no
  // shadow, and out of the decision row.
  //
  // It does overlap the last partially-faded line, and that is accepted rather than
  // unnoticed. The offset is not the lever it looks like: the fade band is 64px and the
  // last line of text always sits inside it, so -top-5/-6/-7/-9 were measured and all
  // land on the SAME line — lower only dims the chevron against a heavier fade without
  // freeing the text, and higher puts it over a more legible line. The glyph is a thin
  // outline with letters visible around it, so the reading cost is small; losing the cue
  // into the fade is the larger failure. Fixing this properly means giving the chevron a
  // soft contrast backing with no hard edge or shadow — a real option, deliberately not
  // taken here to keep this change the narrow one the founder asked for.
  return (
    <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2">
      <ChevronDown
        className="h-5 w-5 animate-bounce text-[#1A1A1A]/70 [animation-duration:1.5s] dark:text-foreground/70"
        aria-hidden="true"
      />
    </div>
  );
}
