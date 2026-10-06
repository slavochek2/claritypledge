import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { Draft } from "../draft";
import { FOUNDER, LINKS } from "../content";
import { DO_ARIA, DO_COPY } from "./copy";
import { MAX_NAME_CHARS, MAX_TAPS, MIN_TAPS, clampInterval, encodeShareHash } from "./share";
import { DotField, OUTLINE_BTN, PRIMARY_BTN, QUIET_BTN, RhythmStrip, STUDY_PERCENT, TapPad } from "./parts";

type Stage = "tap" | "guess" | "reveal";

const stageMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: "easeOut" },
} as const;

/** Moves keyboard and screen-reader focus to a stage when it arrives after a step. */
function useFocusOnMount(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    ref.current?.focus();
  }, [ref]);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return Boolean(el.closest("button, a, input, textarea, select, [contenteditable='true']"));
}

export function TapperFlow({ knock, brokenLink }: { knock: (delaySec?: number) => void; brokenLink: boolean }) {
  const [stage, setStage] = useState<Stage>("tap");
  const [count, setCount] = useState(0);
  const [intervals, setIntervals] = useState<number[]>([]);
  const lastTapRef = useRef<number | null>(null);
  // Starts empty so the visitor lights the listeners themselves.
  const [guess, setGuess] = useState(0);

  const tap = useCallback(() => {
    if (count >= MAX_TAPS) return;
    const now = performance.now();
    const last = lastTapRef.current;
    if (last !== null) setIntervals((iv) => [...iv, clampInterval(now - last)]);
    lastTapRef.current = now;
    setCount((c) => c + 1);
    knock();
  }, [count, knock]);

  const reset = () => {
    lastTapRef.current = null;
    setCount(0);
    setIntervals([]);
  };

  // Space bar anywhere on the page taps, except where space already means something.
  useEffect(() => {
    if (stage !== "tap") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, tap]);

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center px-4 pb-16 pt-20 sm:pt-24">
      <AnimatePresence mode="wait" initial={false}>
        {stage === "tap" && (
          <TapStage
            key="tap"
            count={count}
            intervals={intervals}
            onTap={tap}
            onReset={reset}
            onDone={() => setStage("guess")}
            brokenLink={brokenLink}
          />
        )}
        {stage === "guess" && (
          <GuessStage key="guess" guess={guess} setGuess={setGuess} onDone={() => setStage("reveal")} />
        )}
        {stage === "reveal" && <RevealStage key="reveal" guess={guess} intervals={intervals} />}
      </AnimatePresence>
    </section>
  );
}

/* ── 1. Tap ───────────────────────────────────────────────────────────────────── */
function TapStage({
  count,
  intervals,
  onTap,
  onReset,
  onDone,
  brokenLink,
}: {
  count: number;
  intervals: number[];
  onTap: () => void;
  onReset: () => void;
  onDone: () => void;
  brokenLink: boolean;
}) {
  const enough = count >= MIN_TAPS;

  return (
    <motion.div {...stageMotion} className="flex w-full max-w-xl flex-col items-center text-center">
      {brokenLink && count === 0 && (
        <p role="status" className="mb-6 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700">
          <Draft>{DO_COPY.linkBroken}</Draft>
        </p>
      )}
      <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl">
        <Draft>{DO_COPY.tapPrompt}</Draft>
      </h1>
      <p className="mt-3 text-sm text-neutral-600">
        <Draft>{DO_COPY.tapHint}</Draft>
      </p>

      <div className="mt-10 sm:mt-12">
        {/* Pale once "That's my song" appears, so only one saturated primary is on screen. */}
        <TapPad count={count} onTap={onTap} tone={enough ? "soft" : "strong"}>
          {count === 0 && (
            <span className="text-lg font-semibold uppercase tracking-[0.3em]">
              <Draft>{DO_COPY.padWord}</Draft>
            </span>
          )}
        </TapPad>
      </div>

      {/* The minimum, as slots that fill. Words would only slow the drummer down. */}
      <div aria-hidden="true" className="mt-8 flex gap-2">
        {Array.from({ length: MIN_TAPS }, (_, i) => (
          <motion.span
            key={i}
            className="h-2.5 w-2.5 rounded-full"
            initial={false}
            animate={{ backgroundColor: i < count ? (enough ? "#2563eb" : "#171717") : "#d4d4d4" }}
            transition={{ duration: 0.15 }}
          />
        ))}
      </div>

      <div className="mt-4 h-12 w-full max-w-md">
        {count > 0 && <RhythmStrip intervals={intervals} lit={count} />}
      </div>

      <p className="sr-only" aria-live="polite">
        {count > 0 ? `${DO_ARIA.tapCount}: ${count}` : ""}
      </p>

      <div className="mt-4 flex min-h-12 flex-wrap items-center justify-center gap-2">
        <AnimatePresence>
          {enough && (
            <motion.button
              key="done"
              type="button"
              onClick={onDone}
              className={PRIMARY_BTN}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <Draft>{DO_COPY.tapDone}</Draft>
            </motion.button>
          )}
        </AnimatePresence>
        {count > 0 && (
          <button type="button" onClick={onReset} className={QUIET_BTN}>
            <Draft>{DO_COPY.tapReset}</Draft>
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── 2. Guess ─────────────────────────────────────────────────────────────────── */
function GuessStage({
  guess,
  setGuess,
  onDone,
}: {
  guess: number;
  setGuess: (n: number) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusOnMount(ref);
  const labelId = useId();
  const [touched, setTouched] = useState(false);
  const set = (n: number) => {
    setTouched(true);
    setGuess(Math.min(100, Math.max(0, Math.round(n))));
  };

  const stepBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-800 transition hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300";

  return (
    <motion.div ref={ref} tabIndex={-1} {...stageMotion} className="flex w-full max-w-xl flex-col items-center text-center outline-none">
      <h2 id={labelId} className="text-balance text-[1.6rem] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
        <Draft>{DO_COPY.guessPrompt}</Draft>
      </h2>

      <div className="mt-8 w-full">
        <DotField lit={guess} phase="guess" />
      </div>

      <p className="mt-6 text-6xl font-semibold tabular-nums tracking-tight text-blue-600" aria-hidden="true">
        {guess}
        <span className="text-2xl font-medium text-neutral-500">/100</span>
      </p>

      <div className="mt-4 flex w-full max-w-sm items-center gap-3">
        <button type="button" aria-label={DO_ARIA.minus} onClick={() => set(guess - 1)} className={stepBtn}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={guess}
          aria-labelledby={labelId}
          aria-valuetext={`${guess} / 100`}
          onChange={(e) => set(Number(e.target.value))}
          className="h-11 min-w-0 flex-1 cursor-pointer rounded-full accent-blue-600 outline-none focus-visible:ring-4 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-100"
        />
        <button type="button" aria-label={DO_ARIA.plus} onClick={() => set(guess + 1)} className={stepBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-6 flex min-h-12 items-center justify-center">
        <AnimatePresence>
          {touched && (
            <motion.button
              key="show"
              type="button"
              onClick={onDone}
              className={PRIMARY_BTN}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Draft>{DO_COPY.guessSubmit}</Draft>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── 3. Reveal ────────────────────────────────────────────────────────────────── */
function RevealStage({ guess, intervals }: { guess: number; intervals: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusOnMount(ref);
  // Under reduced motion nothing here fades: each part is either absent or fully there,
  // so no frame ever shows a half-transparent card that reads as disabled.
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"guess" | "study">("guess");
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    const collapse = window.setTimeout(() => setPhase("study"), 1100);
    const share = window.setTimeout(() => setShowShare(true), 2900);
    return () => {
      window.clearTimeout(collapse);
      window.clearTimeout(share);
    };
  }, []);

  const studied = phase === "study";
  const unit = <span className="ml-0.5 text-xl font-medium text-neutral-500">/100</span>;

  return (
    <motion.div ref={ref} tabIndex={-1} {...stageMotion} className="flex w-full max-w-xl flex-col items-center text-center outline-none">
      <div className="w-full">
        <DotField lit={guess} phase={phase} />
      </div>

      {/* Both columns exist from the first frame; the study's shows "?" until the collapse. */}
      <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-600">
            <Draft>{DO_COPY.revealYou}</Draft>
          </p>
          <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight text-blue-600">
            {guess}
            {unit}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-600">
            <Draft>{DO_COPY.revealStudy}</Draft>
          </p>
          <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight text-neutral-900">
            {studied ? (
              <motion.span key="n" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.5 }}>
                {STUDY_PERCENT}
                {unit}
              </motion.span>
            ) : (
              <span className="text-neutral-500">?</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-8 min-h-[12rem] max-w-md" aria-live="polite">
        {studied && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1 }}
          >
            <p className="text-balance text-lg leading-relaxed text-neutral-900">{FOUNDER.tapper}</p>
            <p className="mt-3 text-xs leading-relaxed text-neutral-600">{LINKS.tapperStudy}</p>
            <p className="mt-3 text-sm text-neutral-700">
              <Draft>{DO_COPY.revealHonest}</Draft>
            </p>
          </motion.div>
        )}
      </div>

      {showShare && (
        <motion.div
          key="share"
          className="mt-8 w-full max-w-md"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <ShareCard intervals={intervals} />
        </motion.div>
      )}
    </motion.div>
  );
}

/* ── 4. Share ─────────────────────────────────────────────────────────────────── */
function ShareCard({ intervals }: { intervals: number[] }) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const url = hash ? `${window.location.origin}${window.location.pathname}${hash}` : "";

  const make = (e: FormEvent) => {
    e.preventDefault();
    setHash(encodeShareHash(intervals, name));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permissions, insecure context): leave the link selected to copy by hand.
      linkRef.current?.focus();
      linkRef.current?.select();
    }
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 text-left shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold leading-snug tracking-tight text-neutral-900">
        <Draft>{DO_COPY.shareTitle}</Draft>
      </h2>

      <form onSubmit={make} className="mt-5">
        <label htmlFor={inputId} className="block text-sm font-medium text-neutral-700">
          <Draft>{DO_COPY.shareNameLabel}</Draft>
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          maxLength={MAX_NAME_CHARS}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setHash(null);
            setCopied(false);
          }}
          className="mt-2 h-12 w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 text-base text-neutral-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
        />
        {!hash && !name.trim() && (
          <p className="mt-3 text-sm text-neutral-700">
            <Draft>{DO_COPY.shareBefore}</Draft>
          </p>
        )}
        {name.trim() && !hash && (
          <button type="submit" className={`${PRIMARY_BTN} mt-4`}>
            <Draft>{DO_COPY.shareMake}</Draft>
          </button>
        )}
      </form>

      {hash && (
        <div className="mt-5">
          <input
            ref={linkRef}
            readOnly
            value={url}
            aria-label={DO_ARIA.shareLink}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full truncate rounded-xl border border-neutral-200 bg-neutral-100 px-3 font-mono text-base text-neutral-600 md:text-xs outline-none focus:ring-4 focus:ring-blue-100"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy} className={PRIMARY_BTN}>
              {copied ? <Draft>{DO_COPY.shareCopied}</Draft> : <Draft>{DO_COPY.shareCopy}</Draft>}
            </button>
            <Link to={{ hash }} className={OUTLINE_BTN}>
              <Draft>{DO_COPY.sharePreview}</Draft>
            </Link>
          </div>
          <p className="mt-3 text-sm text-neutral-700">
            <Draft>{DO_COPY.shareHint}</Draft>
          </p>
        </div>
      )}
    </div>
  );
}
