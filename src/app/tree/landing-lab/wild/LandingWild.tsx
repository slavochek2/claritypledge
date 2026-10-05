/**
 * Landing lab, "Wild": two minds and the hidden number.
 *
 * Resting state: two luminous bodies seen end-on through fog, so they look like one
 * shape. Dragging the control turns the scene side-on and clears the fog: the gap was
 * there all along, and the hidden number shows, low. Dragging on sends pulses across
 * and back (explaining back); each round trip brings the bodies closer and the number
 * up, to 10 out of 10. They stay two bodies: understanding is not merging.
 *
 * The canvas is decoration. The state, the number and every line of text live in the
 * DOM, and the control is a native range input.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router-dom";
import {
  StoryVideoPlayer,
  type StoryVideoPlayerHandle,
} from "@/app/components/shared/story-video-player";
import { DRAFTS, FOUNDER, LINKS, MEDIA } from "../content";
import { Draft } from "../draft";
import { WILD_COPY } from "./copy";
import { createWildScene, type WildScene } from "./scene";
import { ROUND_TRIPS, sceneState, type Stage } from "./state";
import { WildFallback } from "./WildFallback";
import "./wild.css";

type Renderer = "pending" | "webgl" | "static";

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const clampUnit = (x: number) => Math.max(-1, Math.min(1, x));

/** The scene's base colour, also used for the page behind it. */
const BASE = "#03050b";

const LINES: { stage: Stage[]; text: string }[] = [
  { stage: ["pretending"], text: FOUNDER.hiddenNumber },
  { stage: ["revealed", "bridging"], text: FOUNDER.revealBridge },
  { stage: ["bridged"], text: FOUNDER.notAgreement },
];

export function LandingWild() {
  const [value, setValue] = useState(0);
  const [renderer, setRenderer] = useState<Renderer>("pending");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reducedMotion = usePrefersReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WildScene | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const s = sceneState(value / 100);

  // The page is dark from edge to edge: scrollbar track, overscroll and any gap below the
  // content must not flash the app's white. Restores whatever was there on unmount, so
  // StrictMode's mount, unmount, mount in development leaves the same end state.
  useEffect(() => {
    const root = document.documentElement;
    const before = {
      scheme: root.style.colorScheme,
      bg: root.style.backgroundColor,
      bodyBg: document.body.style.backgroundColor,
    };
    root.style.colorScheme = "dark";
    root.style.backgroundColor = BASE;
    document.body.style.backgroundColor = BASE;
    return () => {
      root.style.colorScheme = before.scheme;
      root.style.backgroundColor = before.bg;
      document.body.style.backgroundColor = before.bodyBg;
    };
  }, []);

  // Measure the hero for the static fallback, which draws in pixel units.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build the live scene. Runs twice under StrictMode in development; teardown frees
  // everything it made, and the second run rebuilds on the same canvas and context.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createWildScene(canvas, {
      animate: !reducedMotion,
      onUnavailable: () => setRenderer("static"),
      onAvailable: () => setRenderer("webgl"),
    });
    if (!scene) {
      setRenderer("static");
      return;
    }
    sceneRef.current = scene;
    setRenderer("webgl");
    scene.setValue(valueRef.current / 100);

    let onScreen = true;
    let tabVisible = !document.hidden;
    const sync = () => scene.setActive(onScreen && tabVisible);
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) onScreen = entry.isIntersecting;
      sync();
    });
    io.observe(canvas);
    const onVisibility = () => {
      tabVisible = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    sync();

    const onPointer = (e: PointerEvent) => {
      scene.setParallax(
        clampUnit((e.clientX / window.innerWidth) * 2 - 1),
        clampUnit(-((e.clientY / window.innerHeight) * 2 - 1)),
      );
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      scene.setParallax(clampUnit(e.gamma / 30), clampUnit(-(e.beta - 45) / 30));
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("deviceorientation", onTilt);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onTilt);
      scene.destroy();
      sceneRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    sceneRef.current?.setValue(value / 100);
  }, [value]);

  const numberShown = s.stage !== "pretending";
  const bridgingStarted = s.stage === "bridging" || s.stage === "bridged";
  const founderRef = useRef<HTMLElement>(null);
  const scrollToFounder = () =>
    founderRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  const status = numberShown ? `${s.score} ${WILD_COPY.outOf}` : WILD_COPY.hiddenValue;
  const fillStyle = { "--wild-fill": `${value}%` } as CSSProperties;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#03050b] text-white">
      <section
        ref={heroRef}
        className="relative isolate h-[calc(100svh-4rem)] min-h-[540px] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 motion-reduce:transition-none ${
            renderer === "webgl" ? "opacity-100" : "opacity-0"
          }`}
        />
        {renderer === "static" && <WildFallback value={value / 100} width={size.w} height={size.h} />}

        {/* Scrims keep the words readable over the brightest frame. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#03050b]/85 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-[#03050b] via-[#03050b]/55 to-transparent"
        />

        <div className="relative z-10 flex h-full flex-col justify-between px-4 pb-6 pt-10 sm:pt-14">
          <div className="mx-auto grid w-full max-w-xl text-center">
            {LINES.map((line) => {
              const on = line.stage.includes(s.stage);
              return (
                <p
                  key={line.text}
                  aria-hidden={!on}
                  className={`col-start-1 row-start-1 text-balance text-lg font-light leading-snug text-white/90 transition-opacity duration-700 motion-reduce:transition-none sm:text-2xl ${
                    on ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {line.text}
                </p>
              );
            })}
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-col items-center">
            {/* At rest the digit is there but cannot be read: blurred inside a glow, with a
                sharp "/10" beside it so it is plainly a score waiting to be revealed. */}
            <div aria-hidden="true" className="flex items-baseline gap-2 tabular-nums">
              <span
                className={`text-6xl font-extralight leading-none tracking-tight transition-[filter,opacity,color,text-shadow] duration-700 motion-reduce:transition-none sm:text-7xl ${
                  s.done ? "text-emerald-300" : numberShown ? "text-white" : "text-blue-100"
                }`}
                style={{
                  filter: numberShown ? "none" : "blur(6px)",
                  opacity: numberShown ? 1 : 0.85,
                  textShadow: numberShown ? "none" : "0 0 14px rgba(147,197,253,0.8), 0 0 36px rgba(96,165,250,0.6)",
                }}
              >
                {s.score}
              </span>
              <span className="text-xl font-light text-white/70 sm:text-2xl">/10</span>
            </div>
            <div
              aria-hidden="true"
              className={`mt-3 flex gap-2 transition-opacity duration-700 motion-reduce:transition-none ${
                bridgingStarted ? "opacity-100" : "opacity-0"
              }`}
            >
              {Array.from({ length: ROUND_TRIPS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${
                    i < s.trips ? (s.done ? "bg-emerald-300" : "bg-blue-300") : "bg-white/20"
                  }`}
                />
              ))}
            </div>

            <p className="sr-only" aria-live="polite">
              {status}
            </p>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              aria-label={WILD_COPY.controlLabel}
              aria-valuetext={status}
              data-idle={value === 0 ? "true" : "false"}
              data-stage={s.stage}
              className="wild-range mt-4 w-[calc(100%-2.5rem)]"
              style={fillStyle}
            />
            <div className="mt-1 flex min-h-11 items-start justify-center text-center text-sm text-white/80">
              {s.stage === "pretending" && <Draft>{WILD_COPY.dragHint}</Draft>}
              {(s.stage === "revealed" || s.stage === "bridging") && <Draft>{WILD_COPY.bridgeHint}</Draft>}
              {s.stage === "bridged" && (
                <button
                  type="button"
                  onClick={scrollToFounder}
                  aria-label={WILD_COPY.scrollCueLabel}
                  data-testid="wild-scroll-cue"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-blue-200 ring-1 ring-white/20 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 motion-safe:animate-bounce" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <Closing sectionRef={founderRef} />
    </main>
  );
}

function Closing({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const [watching, setWatching] = useState(false);
  const playerRef = useRef<StoryVideoPlayerHandle>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // One click plays: seeking mounts the embed and starts playback, skipping the facade.
  useEffect(() => {
    if (!watching) return;
    playerRef.current?.seekTo(0);
    frameRef.current?.focus();
  }, [watching]);

  return (
    <section ref={sectionRef} className="relative scroll-mt-6 px-4 pb-20 pt-10 sm:pb-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <img
          src={MEDIA.founderPhoto}
          alt={WILD_COPY.photoAlt}
          width={96}
          height={96}
          loading="lazy"
          className="h-24 w-24 rounded-full object-cover ring-1 ring-white/20"
        />
        <p className="mt-6 max-w-md text-balance text-xl font-light leading-snug text-white">
          <Draft>{DRAFTS.founderLine}</Draft>
        </p>
        <p className="mt-3 max-w-md text-balance text-base leading-relaxed text-white/75">{FOUNDER.activism}</p>

        <div
          ref={frameRef}
          tabIndex={-1}
          className={`mt-8 outline-none ${watching ? "w-full max-w-[720px]" : ""}`}
        >
          {watching ? (
            <StoryVideoPlayer
              ref={playerRef}
              videoUrl={MEDIA.st1VideoUrl}
              posterUrl={MEDIA.st1PosterUrl}
              className="ring-1 ring-white/15"
            />
          ) : (
            <button
              type="button"
              onClick={() => setWatching(true)}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-7 text-base font-medium text-white shadow-[0_0_32px_rgba(59,130,246,0.45)] transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#03050b]"
            >
              <Draft>{DRAFTS.watchCta}</Draft>
            </button>
          )}
        </div>

        <nav className="mt-8 flex flex-col items-center gap-1 sm:flex-row sm:gap-6">
          <Link
            to={LINKS.events}
            className="inline-flex min-h-10 items-center text-sm text-blue-200 underline-offset-4 hover:text-white hover:underline"
          >
            <Draft>{DRAFTS.eventCta}</Draft>
          </Link>
          <Link
            to={LINKS.community}
            className="inline-flex min-h-10 items-center text-sm text-blue-200 underline-offset-4 hover:text-white hover:underline"
          >
            <Draft>{DRAFTS.communityCta}</Draft>
          </Link>
        </nav>
        <Link
          to={LINKS.teams}
          className="mt-6 inline-flex min-h-10 items-center text-xs text-white/80 underline-offset-4 hover:text-white hover:underline"
        >
          <Draft>{DRAFTS.teamsLink}</Draft>
        </Link>
      </div>
    </section>
  );
}
