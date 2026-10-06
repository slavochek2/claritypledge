/**
 * Landing lab "Go first": a dev-only prototype of the journey in ../JOURNEY.md.
 *
 * One accurate insight and one fitting next action for a visitor who arrives cold on a
 * phone. The journey is a pure state machine (./machine); this shell maps it onto browser
 * history, the keyboard, the scene and the screens. Every screen change is a history
 * entry, so the browser's Back steps one screen.
 *
 * One shell for every screen: top bar, scene, text panel, and a solid footer holding the
 * progress line, Back on the left and the screen's one primary action on the right.
 *
 * Fitting is decided once per screen from the tallest of its beats, measured offscreen.
 * Below 1024px the scene takes the largest size that leaves the text its room: the hero
 * on screens 1 and 2; elsewhere the band, else a 72px strip, else nothing. A screen whose
 * text still does not fit becomes compact: its title or lead is pinned as a small sticky
 * header, and the rest scrolls under it. The panel's bottom edge never cuts a line.
 *
 * From 1024px the scene takes the left half; the text's first line is anchored at 22
 * percent of the column's height.
 *
 * No draft markers are rendered, at the founder's request. Every agent-written line lives
 * in PROPOSALS (./copy) for review.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { useGoBack } from "@/app/hooks/use-go-back";
import { TEXT } from "./copy";
import { CompactContext } from "./compact";
import { EMPTY_PILOT, canShare, composeHostInvite, sendInvite, type InviteOutcome, type PilotDraft } from "./invite";
import {
  START,
  answerWork,
  back,
  beatCount,
  choose,
  chooseElsewhere,
  hasBack,
  hasNext,
  historyOp,
  isDemoComplete,
  isOffJourney,
  journeyProgress,
  next,
  openMirror,
  parseEntry,
  returnFromMirror,
  sceneSize,
  SCREEN_NUMBER,
  type HistoryEntry,
  type JourneyState,
  type Route,
} from "./machine";
import { mirrorLinkVisible } from "./mirror";
import { focusTarget, keyAction } from "./keys";
import { Scene, type SceneControl } from "./SceneLayer";
import { projectPair, sceneTarget } from "./sceneState";
import { TRANSITION_MS } from "./scene";
import { DemoScreen, ForkScreen, MeaningsScreen, NormScreen, PromiseScreen, StoryScreen } from "./screens";
import { MirrorScreen, type MirrorPrimary } from "./MirrorScreen";
import { demoView } from "./demo";
import {
  Examples,
  FEED_PATH,
  ForwardInvite,
  OnePerson,
  PilotRequest,
  RoomElsewhere,
  RoomQuestion,
  WorkQuestion,
} from "./endings";
import { FORM_ID } from "./formIds";
import { bottomCut, lineBoxes, revealNewest } from "./reveal";
import { track } from "./track";
import { BASE, COLUMN, primaryButton, quietButton } from "./ui";
import "./first.css";

/** The existing two-person practice room. */
const ROOM_PATH = "/live";
const QUERY = "(prefers-reduced-motion: reduce)";
const DESKTOP = 1024;
/** Top and bottom padding of the panel's content, in px (pt-3 and pb-4). */
const PANEL_PAD = 28;
/** The compact scene, for phones where the band would crowd the text. */
export const STRIP = 72;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** The band's height for a viewport of this height: clamp(96, 22vh, 220). */
function bandHeight(viewportHeight: number): number {
  return Math.min(220, Math.max(96, 0.22 * viewportHeight));
}

const START_ENTRY: HistoryEntry = { ...START, below: null };

interface BodyProps {
  state: JourneyState;
  guess: number | null;
  revealDelay: boolean;
  mirrorLink: boolean;
  pilot: PilotDraft;
  inviteMessage: string;
  inviteUrl: string;
  inviteOutcome: InviteOutcome | null;
  watching: boolean;
  onGuess: (value: number) => void;
  onOpenMirror: () => void;
  onReveal: () => void;
  onMirrorPrimary: (p: MirrorPrimary) => void;
  onChoose: (route: Route) => void;
  onForkFocus: (index: number | null) => void;
  onWork: (canInvite: boolean) => void;
  onElsewhere: () => void;
  onEvents: () => void;
  onPilot: (draft: PilotDraft) => void;
  onWatch: () => void;
}

/** The panel content of one screen at one beat. Used live, and offscreen for measuring. */
function ScreenBody(p: BodyProps) {
  const { state } = p;
  switch (state.screen) {
    case "promise":
      return <PromiseScreen />;
    case "story":
      return <StoryScreen beat={state.beat} />;
    case "meanings":
      return <MeaningsScreen />;
    case "demo":
      return (
        <DemoScreen
          beat={state.beat}
          guess={p.guess}
          onGuess={p.onGuess}
          revealDelay={p.revealDelay}
          mirrorLink={p.mirrorLink}
          onOpenMirror={p.onOpenMirror}
        />
      );
    case "mirror":
      return <MirrorScreen onReveal={p.onReveal} onPrimary={p.onMirrorPrimary} />;
    case "norm":
      return <NormScreen beat={state.beat} />;
    case "fork":
      return <ForkScreen onChoose={p.onChoose} onFocusIndex={p.onForkFocus} />;
    case "work":
      return <WorkQuestion onAnswer={p.onWork} />;
    case "work-yes":
      return <PilotRequest draft={p.pilot} onChange={p.onPilot} onPreview={p.onReveal} />;
    case "work-no":
      return <ForwardInvite message={p.inviteMessage} url={p.inviteUrl} outcome={p.inviteOutcome} />;
    case "one":
      return <OnePerson />;
    case "room":
      return <RoomQuestion onElsewhere={p.onElsewhere} onEvents={p.onEvents} />;
    case "room-elsewhere":
      return <RoomElsewhere onPreview={p.onReveal} />;
    case "examples":
      return <Examples watching={p.watching} onWatch={p.onWatch} />;
  }
}

const noop = () => {};

interface Fit {
  screen: string;
  sceneH: number;
  compact: boolean;
}

export function LandingFirst() {
  const location = useLocation();
  const navigate = useNavigate();
  // Back inside the journey pops one history entry. The shared hook owns every pop in this
  // app (P1364): if there is nothing to pop to, it lands on the start of this page instead.
  const popOrRestart = useGoBack("/tree/landing-first");
  const reducedMotion = usePrefersReducedMotion();
  // One history entry, one parsed state: stable identities until the entry changes.
  const parsed = useMemo(() => parseEntry(location.state), [location.state]);
  const entry = parsed ?? START_ENTRY;
  const state = useMemo<JourneyState>(() => ({ screen: entry.screen, beat: entry.beat }), [entry.screen, entry.beat]);
  const key = `${state.screen}:${state.beat}`;

  // A change is unsettled for TRANSITION_MS. Derived in the same render as the change, so
  // every change starts unsettled; a Next press inside the window settles it at once.
  const [settledKey, setSettledKey] = useState(key);
  const settled = reducedMotion || settledKey === key;

  const [forkFocus, setForkFocus] = useState<number | null>(null);
  const [pilot, setPilot] = useState<PilotDraft>(EMPTY_PILOT);
  const [inviteOutcome, setInviteOutcome] = useState<InviteOutcome | null>(null);
  const [watching, setWatching] = useState(false);
  const [guess, setGuess] = useState<number | null>(null);
  const [arrivedByGuess, setArrivedByGuess] = useState(false);
  const [mirrorPrimary, setMirrorPrimary] = useState<MirrorPrimary>(null);
  const [revealTick, setRevealTick] = useState(0);
  const [fit, setFit] = useState<Fit | null>(null);
  const [liveCompact, setLiveCompact] = useState<string | null>(null);
  const [cut, setCut] = useState(0);
  const [sceneBox, setSceneBox] = useState({ w: 0, h: 0 });
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= DESKTOP);

  const sceneControl = useRef<SceneControl | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const logged = useRef(new Set<string>());

  const once = useCallback((name: string, fn: () => void) => {
    if (logged.current.has(name)) return;
    logged.current.add(name);
    fn();
  }, []);

  // Seed the first history entry so every later screen has one below it.
  const needsSeed = parsed === null;
  useEffect(() => {
    if (needsSeed) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: START_ENTRY });
    }
  }, [needsSeed, navigate, location.pathname, location.search]);

  useEffect(() => {
    once("journey_started", () => track({ name: "journey_started" }));
  }, [once]);

  useEffect(() => {
    if (isDemoComplete(state)) once("demonstration_completed", () => track({ name: "demonstration_completed" }));
    if (state.screen === "fork") once("fork_reached", () => track({ name: "fork_reached" }));
  }, [state, once]);

  // The page is dark to its edges, and takes the whole width: the app reserves a
  // scrollbar gutter on <html>, which this page never needs. Restored on leave.
  useEffect(() => {
    const root = document.documentElement;
    const before = {
      scheme: root.style.colorScheme,
      bg: root.style.backgroundColor,
      gutter: root.style.scrollbarGutter,
      body: document.body.style.backgroundColor,
    };
    root.style.colorScheme = "dark";
    root.style.backgroundColor = BASE;
    root.style.scrollbarGutter = "auto";
    document.body.style.backgroundColor = BASE;
    return () => {
      root.style.colorScheme = before.scheme;
      root.style.backgroundColor = before.bg;
      root.style.scrollbarGutter = before.gutter;
      document.body.style.backgroundColor = before.body;
    };
  }, []);

  useEffect(() => {
    if (settledKey === key) return;
    const t = window.setTimeout(() => setSettledKey(key), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [key, settledKey]);

  // Per-screen state resets on a screen change; off-journey screens take focus for
  // screen readers, the journey keeps it on Next.
  useEffect(() => {
    setForkFocus(null);
    setInviteOutcome(null);
    setWatching(false);
    setMirrorPrimary(null);
    if (isOffJourney(state.screen)) scrollerRef.current?.focus({ preventScroll: true });
  }, [state.screen]);

  const size = sceneSize(state.screen);

  // Decide this screen's scene height and whether it is compact: measure every beat
  // offscreen, take the tallest, and give the scene the largest size that leaves it room.
  const fitScreen = useCallback(() => {
    const isDesktop = window.innerWidth >= DESKTOP;
    setDesktop(isDesktop);
    const body = bodyRef.current;
    const footer = footerRef.current;
    const measure = measureRef.current;
    if (!body || !footer || !measure) return;
    const tallest = Math.max(
      0,
      ...[...measure.querySelectorAll<HTMLElement>("[data-measure-beat]")].map((el) => el.offsetHeight),
    );
    const needed = tallest + PANEL_PAD;
    if (isDesktop) {
      // The text starts 22 percent down the column; the top bar overlays the first 56px.
      const room = body.clientHeight - footer.offsetHeight - (0.22 * window.innerHeight - 56);
      setFit({ screen: state.screen, sceneH: 0, compact: size !== "none" && needed > room });
      return;
    }
    const room = body.clientHeight - footer.offsetHeight;
    let sceneH = 0;
    if (size === "hero") sceneH = Math.max(0, room - needed);
    else if (size === "band") sceneH = [bandHeight(window.innerHeight), STRIP].find((h) => room - h >= needed) ?? 0;
    setFit({ screen: state.screen, sceneH: Math.round(sceneH), compact: size !== "none" && needed > room - sceneH });
  }, [size, state.screen]);

  useLayoutEffect(() => {
    fitScreen();
  }, [fitScreen, state.screen]);

  // Re-measure on resize and when fonts or wrapping change the beats' heights.
  useEffect(() => {
    const measure = measureRef.current;
    const body = bodyRef.current;
    if (!measure || !body) return;
    const ro = new ResizeObserver(() => fitScreen());
    ro.observe(body);
    for (const el of measure.querySelectorAll("[data-measure-beat]")) ro.observe(el);
    return () => ro.disconnect();
  }, [fitScreen, state.screen]);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSceneBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const current = fit?.screen === state.screen ? fit : null;
  const compact = (current?.compact ?? false) || liveCompact === state.screen;

  // The panel's bottom edge may not cut a line: raise it into the gap above the first line
  // it would cut. Recomputed after every change and when scrolling comes to rest.
  const cutRef = useRef(0);
  cutRef.current = cut;
  const applyCut = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const edge = el.getBoundingClientRect().bottom + cutRef.current;
    setCut(bottomCut(lineBoxes(el), edge));
  }, []);

  // After every change, bring the newest beat fully into view without cutting a card at
  // the top. A screen opens at its top. Screens with no scene measure live: when their
  // content outgrows the panel they turn compact, and stay so for the visit.
  const openedScreen = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (openedScreen.current !== state.screen) {
      openedScreen.current = state.screen;
      el.scrollTop = 0;
    }
    if (size === "none" && el.scrollHeight > el.clientHeight + cutRef.current + 1) setLiveCompact(state.screen);
    revealNewest(el);
    applyCut();
  }, [key, settled, revealTick, current?.sceneH, compact, state.screen, size, applyCut]);

  const scrollTimer = useRef<number>(0);
  const onScroll = () => {
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(applyCut, 120);
  };

  const go = useCallback(
    (target: JourneyState, direction: "forward" | "back") => {
      const op = historyOp(entry, target, direction);
      const to = { pathname: location.pathname, search: location.search };
      if (op.kind === "pop") popOrRestart();
      else if (op.kind === "replace") navigate(to, { replace: true, state: op.entry });
      else if (op.kind === "push") navigate(to, { state: op.entry });
    },
    [entry, location.pathname, location.search, navigate, popOrRestart],
  );

  const pressNext = useCallback(() => {
    if (!settled) {
      sceneControl.current?.finish();
      setSettledKey(key);
      return;
    }
    setArrivedByGuess(false);
    // Next on the guess beat reveals the rating without a guess.
    if (state.screen === "demo" && demoView(state.beat).guessing) setGuess(null);
    go(next(state), "forward");
  }, [settled, key, go, state]);

  const pressBack = () => {
    setArrivedByGuess(false);
    go(back(state), "back");
  };

  // Keyboard: Space, Enter and the down arrow advance only from the page body or Next.
  const pressNextRef = useRef(pressNext);
  pressNextRef.current = pressNext;
  const canAdvance = hasNext(state);
  useEffect(() => {
    if (!canAdvance) return;
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction({
        key: e.key,
        focus: focusTarget(document.activeElement, document, nextRef.current),
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        repeat: e.repeat,
      });
      if (action !== "advance") return;
      e.preventDefault();
      pressNextRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAdvance]);

  const target = useMemo(() => sceneTarget(state, forkFocus), [state, forkFocus]);
  const skip = (via: "skip" | "logo") => track({ name: "skip_pressed", screen: SCREEN_NUMBER[state.screen], via });
  const reveal = () => setRevealTick((n) => n + 1);
  const invite = composeHostInvite(window.location.origin, pilot);
  const progress = journeyProgress(state);

  const bodyProps: BodyProps = {
    state,
    guess,
    revealDelay: arrivedByGuess && !reducedMotion,
    mirrorLink: mirrorLinkVisible(location.search),
    pilot,
    inviteMessage: TEXT.inviteMessage,
    inviteUrl: invite.url,
    inviteOutcome,
    watching,
    onGuess: (value) => {
      setGuess(value);
      track({ name: "demo_guess", value });
      if (demoView(state.beat).guessing) {
        setArrivedByGuess(true);
        go(next(state), "forward");
      }
    },
    onOpenMirror: () => {
      track({ name: "mirror_opened" });
      go(openMirror(state), "forward");
    },
    onReveal: reveal,
    onMirrorPrimary: setMirrorPrimary,
    onChoose: (route) => {
      track({ name: "route_chosen", route });
      go(choose(state, route), "forward");
    },
    onForkFocus: setForkFocus,
    onWork: (yes) => go(answerWork(state, yes), "forward"),
    onElsewhere: () => go(chooseElsewhere(state), "forward"),
    onEvents: () => track({ name: "primary_action_completed", ending: "room-events" }),
    onPilot: setPilot,
    onWatch: () => {
      setWatching(true);
      reveal();
      track({ name: "primary_action_completed", ending: "examples" });
    },
  };

  // Offscreen copies of every beat of this screen, for measuring only. The guess is
  // assumed made, so the tallest demo beat is measured. The forms and the mirror are
  // measured live instead (see the reveal effect).
  const measureBeats =
    size === "none" ? [] : Array.from({ length: beatCount(state.screen) }, (_, beat) => ({ screen: state.screen, beat }));

  // The one primary action of the screen, in the footer's right slot.
  const primary = (() => {
    if (hasNext(state)) {
      return (
        <button ref={nextRef} type="button" onClick={pressNext} className={primaryButton}>
          {TEXT.next}
        </button>
      );
    }
    switch (state.screen) {
      case "mirror":
        if (!mirrorPrimary) return null;
        if (mirrorPrimary.kind === "continue") {
          return (
            <button type="button" onClick={() => go(returnFromMirror(state), "forward")} className={primaryButton}>
              {TEXT.mirrorReturn}
            </button>
          );
        }
        return (
          <button type="submit" form={mirrorPrimary.formId} className={primaryButton}>
            {mirrorPrimary.label === "explain" ? TEXT.mirrorSubmit : TEXT.mirrorRetry}
          </button>
        );
      case "work-yes":
        return (
          <button type="submit" form={FORM_ID.pilot} className={primaryButton}>
            {TEXT.previewButton}
          </button>
        );
      case "room-elsewhere":
        return (
          <button type="submit" form={FORM_ID.notify} className={primaryButton}>
            {TEXT.previewButton}
          </button>
        );
      case "work-no":
        return (
          <button
            type="button"
            className={primaryButton}
            onClick={async () => {
              const outcome = await sendInvite(invite.text);
              setInviteOutcome(outcome);
              if (outcome === "shared" || outcome === "copied") {
                track({ name: "primary_action_completed", ending: "work-no" });
              }
            }}
          >
            {canShare() ? TEXT.inviteShare : TEXT.inviteCopy}
          </button>
        );
      case "one":
        return (
          <Link to={ROOM_PATH} className={primaryButton} onClick={() => track({ name: "primary_action_completed", ending: "one" })}>
            {TEXT.oneCta}
          </Link>
        );
      case "examples":
        return (
          <Link to={FEED_PATH} className={primaryButton}>
            {TEXT.examplesFeed}
          </Link>
        );
      default:
        return null;
    }
  })();

  const logo = (
    <Link
      to="/"
      aria-label={TEXT.logoLabel}
      onClick={() => skip("logo")}
      className="-ml-2.5 inline-flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      <ClarityLogo size="sm" iconOnly />
    </Link>
  );

  return (
    <main
      data-settled={settled ? "true" : "false"}
      data-screen={state.screen}
      data-beat={state.beat}
      data-compact={compact ? "true" : "false"}
      className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#03050b] text-slate-50"
    >
      <header className="z-20 shrink-0 bg-[#03050b] pt-[env(safe-area-inset-top)] lg:absolute lg:inset-x-0 lg:top-0 lg:grid lg:grid-cols-2 lg:bg-transparent">
        {/* Desktop: the logo sits at the viewport's top-left, over the scene. */}
        <div className="hidden h-14 items-center pl-6 lg:flex">{logo}</div>
        <div className={`${COLUMN} flex h-14 items-center justify-between gap-2 lg:justify-end [@media(max-height:619px)]:h-12`}>
          <span className="lg:hidden">{logo}</span>
          <Link to="/" onClick={() => skip("skip")} className={`${quietButton} -mr-3 text-[15px] underline`}>
            {TEXT.skip}
          </Link>
        </div>
      </header>

      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={sceneRef}
          data-scene
          data-size={size}
          className="first-scene"
          style={desktop ? undefined : { height: current?.sceneH ?? 0 }}
        >
          <Scene target={target} animate={!reducedMotion} control={sceneControl} />
          <SceneSlot state={state} view={target.view} box={sceneBox} />
        </div>

        <div data-column className="relative flex min-h-0 flex-1 flex-col lg:w-1/2 lg:pt-14">
          <div
            ref={scrollerRef}
            data-panel
            tabIndex={-1}
            onScroll={onScroll}
            aria-live={isOffJourney(state.screen) ? undefined : "polite"}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none"
            style={{ marginBottom: cut }}
          >
            <div className={`${COLUMN} pb-4 pt-3 lg:pt-[calc(22dvh-3.5rem)]`}>
              <div data-content>
                <CompactContext.Provider value={compact}>
                  <ScreenBody {...bodyProps} />
                </CompactContext.Provider>
              </div>
              <div data-spacer aria-hidden="true" />
            </div>
          </div>

          <div ref={footerRef} data-footer className="shrink-0 bg-[#03050b] pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className={COLUMN}>
              {progress && <ProgressLine index={progress.index} total={progress.total} />}
              <div data-bar className="flex min-h-14 items-center justify-between gap-2 border-t border-white/15 pt-2">
                <div data-slot="back" className="-ml-3 flex min-w-0">
                  {hasBack(state) && (
                    <button type="button" onClick={pressBack} className={quietButton}>
                      {TEXT.back}
                    </button>
                  )}
                </div>
                <div data-slot="primary" className="flex">
                  {primary}
                </div>
              </div>
            </div>
          </div>

          {/* Measuring only: every beat of this screen at the panel's width, never seen. */}
          <div
            ref={measureRef}
            aria-hidden="true"
            inert
            className="pointer-events-none invisible absolute inset-x-0 top-0 -z-10 overflow-hidden"
            style={{ height: 0 }}
          >
            {measureBeats.map((s) => (
              <div key={s.beat} data-measure-beat className={COLUMN}>
                <ScreenBody
                  {...bodyProps}
                  state={s}
                  guess={0}
                  revealDelay={false}
                  onGuess={noop}
                  onOpenMirror={noop}
                  onReveal={noop}
                  onMirrorPrimary={noop}
                  onChoose={noop}
                  onForkFocus={noop}
                  onWork={noop}
                  onElsewhere={noop}
                  onEvents={noop}
                  onPilot={noop}
                  onWatch={noop}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/** One segment per beat of the main journey. Not interactive; hidden off the journey. */
function ProgressLine({ index, total }: { index: number; total: number }) {
  return (
    <div
      data-progress
      role="progressbar"
      aria-label={TEXT.progressLabel}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={index + 1}
      className="flex gap-1 pb-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] flex-1 rounded-full ${
            i < index ? "bg-white" : i === index ? "first-pulse bg-white" : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Screen 2 only: a chip below the two bodies, never on top of one. First "Yes" alone,
 * because nobody gave a number; then the same "Yes" struck through, captioned "Never
 * verified". Screen 1 has no chip. The chip sits on solid ground, never on the mist.
 */
function SceneSlot({ state, view, box }: { state: JourneyState; view: 0 | 1; box: { w: number; h: number } }) {
  if (state.screen !== "story" || box.w === 0 || box.h === 0) return null;
  const never = state.beat >= 1;
  const discs = projectPair(view, 0, box.w, box.h);
  const below = Math.max(...discs.map((d) => d.y + d.r)) + 10;
  const chipH = never ? 60 : 40;
  if (below + chipH > box.h) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: below }}>
      <div key={state.beat} className="first-enter flex flex-col items-center rounded-2xl border border-white/25 bg-[#03050b] px-5 py-1.5">
        <span className={`text-2xl leading-tight text-white ${never ? "line-through opacity-60" : ""}`}>{TEXT.slotYes}</span>
        {never && <span className="text-[13px] text-slate-200">{TEXT.slotNeverVerified}</span>}
      </div>
    </div>
  );
}
