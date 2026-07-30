/**
 * @file meeting-terms-page.tsx
 * @description P1016 — Clarity Meeting Terms at /terms.
 *
 * Terms for ONE conversation, agreed before it starts. Two people look at this on
 * one screen, pick a rung on the track, and one tap accepts for both.
 *
 * Uses the same certificate shell as the Clarity Organization Terms and the
 * bilateral Partner Agreement (certificate-frame.tsx) — one visual language for
 * every commitment. The level track is portaled into the shared nav's centre slot
 * so the document starts directly under a single bar; Accept is fixed to the
 * bottom in the certificate's navy.
 *
 * Deliberately has no backend: no auth, no email, no row written anywhere. The
 * acceptance is witnessed in the room, not recorded.
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
import {
  MEETING_TERMS_LADDER,
  sectionsForLevel,
  type MeetingTermsLevel,
} from "@/app/content/meeting-terms";

const STORAGE_KEY = "cp.meeting-terms.v1";

/**
 * Founder decision: the page opens on "Reveal the gap" — the middle rung. Which rung
 * the page opens on is an anchoring choice, not a neutral one; this one states a real
 * ask while leaving both the lighter and the heavier terms one visible tap away.
 */
const DEFAULT_LEVEL: MeetingTermsLevel = 3;

interface StoredState {
  level: MeetingTermsLevel;
  accepted: boolean;
}

function isLevel(value: unknown): value is MeetingTermsLevel {
  return value === 1 || value === 2 || value === 3;
}

/**
 * localStorage can throw (private browsing, disabled storage) or hold junk from a
 * hand-edit. Every access is guarded: the page must work for the duration of the
 * visit without state surviving a reload, rather than fail to render.
 */
function readStored(): StoredState {
  const fallback: StoredState = { level: DEFAULT_LEVEL, accepted: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const { level, accepted } = parsed as Record<string, unknown>;
    return {
      level: isLevel(level) ? level : DEFAULT_LEVEL,
      accepted: accepted === true,
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
  // Restore in an effect rather than a lazy initializer so the first paint matches
  // the prerendered HTML.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setLevel(stored.level);
    setAccepted(stored.accepted);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeStored({ level, accepted });
  }, [level, accepted, restored]);

  const handleSelect = useCallback(
    (next: MeetingTermsLevel) => {
      // The track is locked while a meeting runs: changing terms mid-meeting would
      // leave one party operating under terms they never agreed to.
      if (accepted) return;
      setLevel(next);
    },
    [accepted],
  );

  // The track rides in the nav's centre slot: this page's nav row is otherwise empty
  // (it renders `compact`), and a second row below it cost 44px on every viewport.
  // Resolved in a layout effect so the track never paints in one place and jumps.
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setNavSlot(document.getElementById(NAV_CENTER_SLOT_ID));
  }, []);

  const sections = sectionsForLevel(level);
  const track = <LevelTrack level={level} locked={accepted} onSelect={handleSelect} />;

  return (
    <div className="min-h-screen pb-28">
      <SEO
        title="Clarity Meeting Terms"
        description="Agree how much verification a conversation will carry, before it starts. Three levels, one tap, nothing stored."
        url="/terms"
      />
      {/* The certificate's own <h2> is the visible title. This keeps a single h1
          in the document outline without repeating the words on screen. */}
      <h1 className="sr-only">Clarity Meeting Terms</h1>

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
        <CertificateFrame
          ariaLabel="Clarity Meeting Terms"
          title="Clarity Meeting Terms"
          kicker="A commitment for this conversation"
          epigraph="We all crave being understood. Let's commit to listen."
        >
          <CertificateOathBody sections={sections} />
        </CertificateFrame>
      </div>

      {/* Accept is fixed to the bottom, not scrolled with the document: on the long
          levels the button would otherwise sit below the fold on arrival. Kept in the
          certificate's navy so it still reads as part of the document it accepts. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-xs px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* The confirmation sits with the button that produced it — an earlier
              placement below the terms body landed ~730px off-screen on the longest
              level at 320px, so accepting appeared to do nothing. */}
          {accepted && (
            <p
              data-testid="accepted-marker"
              className="pb-1.5 text-center text-[11px] text-muted-foreground"
            >
              Accepted — meeting in progress.
            </p>
          )}
          <Button
            onClick={() => setAccepted((prev) => !prev)}
            size="lg"
            className={cn(
              "w-full py-4 text-base font-semibold",
              accepted
                ? "border-2 border-[#002B5C] bg-transparent text-[#002B5C] hover:bg-[#002B5C]/10 dark:border-blue-400 dark:text-blue-400"
                : "bg-[#002B5C] text-white hover:bg-[#001f45]",
            )}
          >
            {accepted ? "End meeting" : "Accept and start meeting"}
          </Button>
        </div>
      </div>
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
