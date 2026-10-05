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
 * every commitment. On desktop the level track is portaled into the shared nav's centre slot
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
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { NAV_CENTER_SLOT_ID } from "@/app/components/layout/simple-navigation";
import { useOfflineStripShown } from "@/app/contexts/offline-status-context";
import { cn } from "@/lib/utils";
import { FocusHeader } from "@/app/components/layout/focus-header";
import {
  MEETING_TERMS_LADDER,
  type MeetingTermsLevel,
} from "@/app/content/meeting-terms";
import {
  MeetingPrincipleView,
  PRINCIPLE_TITLE,
  type PrincipleAnswer,
} from "@/app/components/agreements/meeting-principle-view";

// P1336: the certificate + bars live in MeetingPrincipleView; the shared class/question
// constants are imported from there directly (a re-export here breaks fast refresh).

/**
 * Key is UNCHANGED at v1 across P1024. The two new fields are additive and optional:
 * a visitor holding the old `{level, accepted}` shape restores exactly as before,
 * with no answer and no number. Bumping the key would have discarded their level for
 * no gain.
 */
const STORAGE_KEY = "cp.meeting-terms.v1";

/** What the participant answered. `null` = they have not answered yet. */
type Answer = PrincipleAnswer;

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
  const navigate = useNavigate();
  const location = useLocation();
  // P1083: /ready sets this on the Continue navigation. Route state, not referrer —
  // referrers are unreliable (stripped by privacy settings, absent on a fresh tab)
  // and this is the one narrow reversal of P1077's "do NOT modify /meet" non-goal.
  const arrivedFromReady = Boolean(
    (location.state as { fromReady?: boolean } | null)?.fromReady,
  );
  const [level, setLevel] = useState<MeetingTermsLevel>(DEFAULT_LEVEL);
  const [accepted, setAccepted] = useState(false);
  const [answer, setAnswer] = useState<Answer>(null);
  const [rating, setRating] = useState<number | null>(null);
  // Restore in an effect rather than a lazy initializer so the first paint matches
  // the prerendered HTML.
  const [restored, setRestored] = useState(false);
  // P1369 (founder, 2026-09-30): /meet has no backend and works fully offline — no gate.

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
      if (next !== level) {
        analytics.track('meeting_terms_level_changed', { from_level: level, to_level: next });
      }
      setLevel(next);
    },
    [trackLocked, level],
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
  // P1422: desktop only. Below lg the nav row also carries the labeled Tools button, and
  // the third stop ran under it (29px at 375, 56px at 320) — there the track drops to its
  // own sticky row beneath the nav (below), as the founder suggested.
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  const offlineStripShown = useOfflineStripShown();
  useLayoutEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const sync = () => setNavSlot(desktop.matches ? document.getElementById(NAV_CENTER_SLOT_ID) : null);
    sync();
    desktop.addEventListener("change", sync);
    return () => desktop.removeEventListener("change", sync);
  }, []);

  const track = <LevelTrack level={level} locked={trackLocked} onSelect={handleSelect} />;

  return (
    <MeetingPrincipleView
      level={level}
      answer={answer}
      rating={rating}
      accepted={accepted}
      onAnswer={setAnswer}
      onRatingChange={setRating}
      onRatingSubmit={
        answer === "in"
          ? () => {
              // Guard against a double-tap firing twice before `accepted` re-renders
              // and unmounts this card (common on the handoff moment this card exists for).
              if (accepted) return;
              analytics.track('meeting_terms_accepted', { level });
              setAccepted(true);
            }
          : resetToChoosing
      }
      submitLabel={answer === "in" ? "Start meeting" : "Submit"}
      onEndMeeting={resetToChoosing}
      lead={
        <>
          <SEO
            title={PRINCIPLE_TITLE}
            description="Agree how much verification a conversation will carry, before it starts. Three levels, one tap, nothing stored."
            url="/meet"
          />
          {/* The certificate's own <h2> is the visible title. This keeps a single h1
              in the document outline without repeating the words on screen. */}
          <h1 className="sr-only">{PRINCIPLE_TITLE}</h1>

          {/* Below lg (P1422), and whenever the slot is missing, the track gets its own row
              stuck under the fixed nav. Its offset follows the nav's own: the iOS status-bar
              inset, and 1.75rem more while the offline strip pushes the nav down (P1369) —
              the same offsets as room-capture-bar.tsx. */}
          {navSlot ? (
            createPortal(track, navSlot)
          ) : (
            <div className={`sticky ${offlineStripShown
              ? "top-[calc(5.75rem+env(safe-area-inset-top))] lg:top-[calc(6.75rem+env(safe-area-inset-top))]"
              : "top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))]"} z-30 border-b border-border bg-background/95 px-4 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80`}>
              <div className="mx-auto max-w-2xl">{track}</div>
            </div>
          )}

        </>
      }
      header={
        arrivedFromReady && (
          // Returns to /ready — the view re-fetches there and may now reflect this
          // visit's own submission (P1083). Never rendered on a direct /meet visit.
          <FocusHeader onBack={() => navigate("/ready")} />
        )
      }
    />
  );
}


// Exported: P1114's room /meet portals this into the same nav slot, locked at level 3
// and never interactive — the room has no level picker, but the track is still what
// makes the page read as /meet rather than a bespoke document. Blind review caught
// its absence reading as "a different page," not merely "a missing control."
export function LevelTrack({
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
                  "flex-1 flex flex-col items-center gap-1 pt-0.5 pb-0.5 min-h-10",
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
                      ? "border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400"
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
