import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Play, RotateCcw } from "lucide-react";
import { Draft } from "../draft";
import { FOUNDER, LINKS } from "../content";
import { DO_ARIA, DO_COPY } from "./copy";
import { guessMatches, type SharedTaps } from "./share";
import { ListenPad, OUTLINE_BTN, PRIMARY_BTN, QUIET_BTN, RhythmStrip } from "./parts";

const LEAD_IN_SEC = 0.35;

/**
 * Listener mode: someone opened a shared link. The page plays the taps back as knocks
 * and pulses, asks for the song, then shows what it was. The song name arrives from a
 * URL anyone can write, so it is only ever rendered as a React text node.
 */
export function ListenerFlow({
  shared,
  knock,
  silence,
}: {
  shared: SharedTaps;
  knock: (delaySec?: number) => void;
  silence: () => void;
}) {
  const { pathname } = useLocation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const [lit, setLit] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [guess, setGuess] = useState("");
  const [revealed, setRevealed] = useState(false);
  const tapCount = shared.intervals.length + 1;

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const play = () => {
    clearTimers();
    silence();
    setLit(0);
    setPlaying(true);
    const offsets = [LEAD_IN_SEC];
    for (const gap of shared.intervals) offsets.push((offsets[offsets.length - 1] ?? 0) + gap / 1000);
    offsets.forEach((sec, i) => {
      knock(sec);
      timers.current.push(window.setTimeout(() => setLit(i + 1), sec * 1000));
    });
    const end = (offsets[offsets.length - 1] ?? 0) + 0.6;
    const firstTime = !played;
    timers.current.push(
      window.setTimeout(() => {
        setPlaying(false);
        setPlayed(true);
        if (firstTime) window.setTimeout(() => inputRef.current?.focus(), 50);
      }, end * 1000),
    );
  };

  const reveal = (e: FormEvent) => {
    e.preventDefault();
    clearTimers();
    setPlaying(false);
    setLit(tapCount);
    setRevealed(true);
  };

  const trimmed = guess.trim();
  const matched = trimmed ? guessMatches(trimmed, shared.song) : false;

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center px-4 pb-16 pt-20 sm:pt-24">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl">
          <Draft>{DO_COPY.listenIntro}</Draft>
        </h1>

        {/* Before the first play the circle IS the primary action and says so. Once the
            taps have played it turns pale (the guess form owns the primary) but stays a
            real button that replays them. */}
        <div className="mt-10 sm:mt-12">
          {!played && !playing ? (
            <ListenPad count={lit} tone="strong" onPlay={play} ariaLabel={DO_COPY.listenPlay}>
              <Play className="h-10 w-10 fill-current" aria-hidden="true" />
              <span className="px-6 text-base font-semibold">
                <Draft>{DO_COPY.listenPlay}</Draft>
              </span>
            </ListenPad>
          ) : (
            <ListenPad count={lit} tone="soft" onPlay={playing ? undefined : play} ariaLabel={DO_ARIA.replay} />
          )}
        </div>

        <div className="mt-8 h-12 w-full max-w-md">
          <RhythmStrip intervals={shared.intervals} lit={lit} />
        </div>

        <AnimatePresence mode="wait">
          {played && !revealed && (
            <motion.form
              key="guess"
              onSubmit={reveal}
              className="mt-6 w-full max-w-md text-left"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <label htmlFor={inputId} className="block text-center text-lg font-medium text-neutral-900">
                <Draft>{DO_COPY.listenGuessLabel}</Draft>
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                autoComplete="off"
                maxLength={80}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                className="mt-3 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button type="submit" className={PRIMARY_BTN}>
                  <Draft>{DO_COPY.listenReveal}</Draft>
                </button>
                {!playing && (
                  <button type="button" onClick={play} className={QUIET_BTN}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <Draft>{DO_COPY.listenReplay}</Draft>
                  </button>
                )}
              </div>
            </motion.form>
          )}

          {revealed && (
            <motion.div
              key="revealed"
              className="mt-8 w-full max-w-md"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-600">
                <Draft>{DO_COPY.listenTheirSong}</Draft>
              </p>
              {/* Two lines at most; the whole name stays in the tooltip. */}
              <p
                title={shared.song}
                className="mt-2 line-clamp-2 text-3xl font-semibold leading-tight tracking-tight text-neutral-900 [overflow-wrap:anywhere] sm:text-4xl"
              >
                {shared.song}
              </p>

              {trimmed && (
                <div className="mt-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-600">
                    <Draft>{DO_COPY.listenYourGuess}</Draft>
                  </p>
                  <p title={trimmed} className="mt-1 line-clamp-2 text-lg text-neutral-700 [overflow-wrap:anywhere]">
                    {trimmed}
                  </p>
                  {matched && (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-4 py-2 text-sm font-semibold text-green-800">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <Draft>{DO_COPY.listenMatch}</Draft>
                    </p>
                  )}
                </div>
              )}

              <p className="mx-auto mt-8 max-w-md text-balance text-lg leading-relaxed text-neutral-900">{FOUNDER.tapper}</p>
              <p className="mt-3 text-xs leading-relaxed text-neutral-600">{LINKS.tapperStudy}</p>

              <div className="mt-8">
                <Link to={{ pathname, hash: "" }} className={OUTLINE_BTN}>
                  <Draft>{DO_COPY.listenOwn}</Draft>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
