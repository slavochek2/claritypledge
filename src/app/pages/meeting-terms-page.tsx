/**
 * @file meeting-terms-page.tsx
 * @description P1016 — Clarity Meeting Terms at /terms.
 *
 * Terms for ONE conversation, agreed before it starts. Two people look at this on
 * one screen, pick a rung on a four-level ladder, and one tap accepts for both.
 *
 * Deliberately has no backend: no auth, no email, no row written anywhere. The
 * acceptance is witnessed in the room, not recorded. Known limitation (P1016 spec):
 * if the link is opened separately, neither party can see the other's acceptance.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MEETING_TERMS_LADDER,
  sectionsForLevel,
  type MeetingTermsLevel,
} from "@/app/content/meeting-terms";

const STORAGE_KEY = "cp.meeting-terms.v1";

/**
 * [FOUNDER DECISION — UNCONFIRMED] Which rung the page opens on is an anchoring
 * choice, not a neutral one. Opening on 3 states the ask honestly (this is the
 * conversation the facilitator wants) and leaves stepping down one visible tap away.
 * Opening on 0 would make verification the thing that has to be argued up for.
 */
const DEFAULT_LEVEL: MeetingTermsLevel = 3;

interface StoredState {
  level: MeetingTermsLevel;
  accepted: boolean;
}

function isLevel(value: unknown): value is MeetingTermsLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
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
  // Restore in an effect rather than a lazy initializer so the first paint is
  // identical on server-rendered/prerendered HTML and in the browser.
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
      // The track is locked while a meeting is running: changing terms mid-meeting
      // would leave one party operating under terms they never agreed to.
      if (accepted) return;
      setLevel(next);
    },
    [accepted],
  );

  const rung = MEETING_TERMS_LADDER.find((r) => r.level === level) ?? MEETING_TERMS_LADDER[0];
  const sections = sectionsForLevel(level);

  return (
    <>
      <SEO
        title="Clarity Meeting Terms"
        description="Agree how much verification a conversation will carry, before it starts. Four levels, one tap, nothing stored."
        url="/terms"
      />
      {/* No min-h-screen here: the layout's flex column already pins the footer to
          the bottom, and stacking a second 100vh minimum on top of pb-32 opened a
          screen-tall dead gap under the short levels. pb-32 clears the sticky bar. */}
      <div className="px-4 pt-10 pb-32">
        <div className="container mx-auto max-w-2xl space-y-8">
          <header className="space-y-3 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold">Clarity Meeting Terms</h1>
            <p className="text-muted-foreground">
              Terms for one conversation. Nothing is signed, nothing is stored, and
              either of us can pick a lower level.
            </p>
          </header>

          <LevelTrack level={level} locked={accepted} onSelect={handleSelect} />

          <section
            aria-live="polite"
            className="rounded-xl border border-border bg-card p-5 sm:p-7 space-y-5"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-bold">
                {rung.level}. {rung.label}
              </h2>
              <p className="text-sm text-muted-foreground">{rung.tradeoff}</p>
            </div>

            <p className="text-sm font-medium">Each of us says this to the other:</p>

            <div className="space-y-5">
              {sections.map((section) => (
                <div key={section.heading} className="space-y-1.5">
                  <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">
                    {section.heading}
                  </h3>
                  <p className="leading-relaxed">{section.body}</p>
                </div>
              ))}
            </div>

            {accepted && (
              <div
                data-testid="accepted-marker"
                className="flex items-center gap-2 pt-4 border-t border-border text-green-600 dark:text-green-400 font-medium"
              >
                <CheckCircle2Icon className="w-5 h-5 shrink-0" />
                <span>Accepted — meeting in progress</span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Sticky primary action — the only primary on the page (P955). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-2xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            className={cn(
              "w-full h-12 text-base",
              // Design system: blue is the colour for a CTA that starts a flow.
              !accepted && "bg-blue-500 hover:bg-blue-600 text-white",
            )}
            variant={accepted ? "outline" : "default"}
            onClick={() => setAccepted((prev) => !prev)}
          >
            {accepted ? "End meeting" : "Accept and start meeting"}
          </Button>
        </div>
      </div>
    </>
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
    <fieldset disabled={locked} className="space-y-3">
      <legend className="sr-only">How much verification this conversation carries</legend>

      {/* Four stops on one line. Native radios in a shared group give arrow-key
          navigation and screen-reader semantics without hand-rolled key handling;
          each stop's tap target is its whole label column, not just the dot. */}
      <div className="relative pt-2">
        {/* Connecting line, inset by half a column so it spans dot-centre to dot-centre. */}
        <div
          aria-hidden="true"
          className="absolute top-[1.125rem] left-[12.5%] right-[12.5%] h-0.5 bg-border dark:bg-zinc-600"
        />
        <div className="relative flex">
          {MEETING_TERMS_LADDER.map((rung) => {
            const selected = rung.level === level;
            return (
              <label
                key={rung.level}
                data-testid={`terms-stop-${rung.level}`}
                className={cn(
                  "flex-1 flex flex-col items-center gap-2 pt-0.5 pb-1 min-h-[44px]",
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
                    "w-5 h-5 rounded-full border-2 bg-background transition-colors",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                    selected
                      ? "border-blue-600 dark:border-blue-400 bg-blue-600 dark:bg-blue-400"
                      // An unselected ring at border-token strength is near-invisible on
                      // the dark background; the ladder has to stay readable across a room.
                      : "border-border dark:border-zinc-500",
                    locked && "opacity-60",
                  )}
                />
                <span
                  className={cn(
                    // Two lines are reserved for every label: at 320px "Reveal the gap"
                    // wraps while its three siblings don't, and without a reserved height
                    // the row's baseline goes ragged and the last stop reads as a
                    // differently-shaped item instead of one rung among four.
                    "text-[11px] sm:text-xs leading-tight text-center px-0.5 hyphens-auto",
                    "min-h-[2.2em] sm:min-h-0",
                    selected
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {rung.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between text-[11px] sm:text-xs text-muted-foreground">
        <span>comfortable, fast</span>
        <span>uncomfortable, clear</span>
      </div>

      <p className="text-sm text-muted-foreground">
        {locked
          ? "Terms are locked while the meeting runs. End the meeting to change level."
          : "How regulated do you feel right now? How much cognitive effort do you have?"}
      </p>
    </fieldset>
  );
}
