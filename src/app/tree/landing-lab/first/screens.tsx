/**
 * The linear screens of the journey: 1, 2, 3, 4, 6 and the fork. Each renders the text for
 * its current beat; the shell supplies the layout, the scene and the footer.
 *
 * Layout contract with the shell:
 *  - `data-first` marks the screen's title or lead, which every beat must show whole
 *    (see ./Heading, which pins it on a compact screen).
 *  - `data-newest` marks the element the shell scrolls fully into view after every change.
 *  - `data-card` marks blocks the shell must never leave cut by the panel's top edge.
 *  - `data-sticky` marks the pinned header of a compact screen.
 *  - `data-demo` marks the statement, the current explain-back and the current rating,
 *    which must be in view together on every demo beat.
 *
 * Every string comes from the display versions in ./copy, or from ./demo.
 */
import { useEffect, useId, useState } from "react";
import { ArrowDown } from "lucide-react";
import { DECK_TEXT, ROUTE_LABEL, STORY_TEXT, TEXT } from "./copy";
import { demoView, ratingForDisplay, type RatingStep, type Try } from "./demo";
import { Heading } from "./Heading";
import { ROUTES, type Route } from "./machine";
import { BODY, CAPTION, CARD, CARD_LABEL, LEAD, choiceButton, enter } from "./ui";

export function PromiseScreen() {
  return (
    <div data-newest className="first-enter space-y-4">
      <Heading role="title" text={STORY_TEXT.headline} />
      <p className={LEAD}>{STORY_TEXT.askedThem}</p>
    </div>
  );
}

export function StoryScreen({ beat }: { beat: number }) {
  return (
    <div data-newest={beat === 0 ? "" : undefined} className={`space-y-4 ${enter(beat === 0)}`}>
      <Heading role="lead" text={STORY_TEXT.saidYes} />
      {beat >= 1 && (
        <p data-newest className={`${LEAD} ${enter(true)}`}>
          {STORY_TEXT.daysLater}
        </p>
      )}
    </div>
  );
}

/** Splits "Term: rest" at the first colon, keeping the colon with the term. */
function splitTerm(line: string): [string, string] {
  const i = line.indexOf(":");
  return i < 0 ? ["", line] : [line.slice(0, i + 1), line.slice(i + 1)];
}

/** Screen 3: the founder's sentence, then the three meanings as a list, the third in full white. */
export function MeaningsScreen() {
  const last = STORY_TEXT.meanings.length - 1;
  return (
    <div data-newest className="first-enter space-y-4">
      <Heading role="lead" text={STORY_TEXT.threeMeanings} />
      <ul className="list-disc space-y-3 pl-5 marker:text-slate-500">
        {STORY_TEXT.meanings.map((line, i) => {
          const [term, rest] = splitTerm(line);
          return (
            <li
              key={line}
              data-meaning={i + 1}
              className={`text-[17px] leading-snug ${i === last ? "text-white" : "text-white/70"}`}
            >
              <strong className="font-semibold">{term}</strong>
              {rest}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A rating numeral: 28px, weight 600, the page's font. */
const NUMERAL = "text-[28px] font-semibold leading-none tabular-nums";

/** One cell of the rating row: who gave the number, then the number out of 10. */
function Cell({
  label,
  value,
  tone,
  hidden = false,
  testId,
  rater,
}: {
  label: string;
  value: number;
  tone: string;
  hidden?: boolean;
  testId: string;
  rater?: string;
}) {
  return (
    <div data-testid={testId} data-rater={rater} aria-live={testId === "demo-rating" ? "polite" : undefined}>
      <p className={CAPTION}>{label}</p>
      <p className="mt-1 whitespace-nowrap">
        <span className={`${NUMERAL} ${tone} transition-opacity duration-200 motion-reduce:transition-none ${hidden ? "opacity-0" : "opacity-100"}`}>
          {value}
        </span>{" "}
        <span className={CAPTION}>{TEXT.outOf}</span>
      </p>
    </div>
  );
}

/**
 * The game moment. With a guess: the visitor's number and the speaker's side by side, the
 * same size, the speaker's shown 400ms later (at once under reduced motion). Without a
 * guess: the speaker's rating alone. No right, no wrong, no colour judgement.
 */
function RatingRow({ step, guess, delay }: { step: RatingStep; guess: number | null; delay: boolean }) {
  const [shown, setShown] = useState(!delay);
  useEffect(() => {
    if (!delay) return;
    const t = window.setTimeout(() => setShown(true), 400);
    return () => window.clearTimeout(t);
  }, [delay]);
  const rating = ratingForDisplay(step.rating);
  if (!rating) {
    if (import.meta.env.DEV) console.error("[landing-first] refused to render a rating without a rater:", step.id);
    return null;
  }
  return (
    <div className={`grid gap-3 ${guess === null ? "grid-cols-1" : "grid-cols-2"}`}>
      {guess !== null && <Cell label={TEXT.demoYourGuess} value={guess} tone="text-slate-300" testId="demo-guess" />}
      <Cell
        label={step.label}
        value={rating.value}
        tone="text-white"
        hidden={!shown}
        testId="demo-rating"
        rater={rating.rater}
      />
    </div>
  );
}

/** A finished earlier try, folded to one line at every width: label left, rating right. */
function TrySummary({ t }: { t: Try }) {
  const rating = ratingForDisplay(t.rating.rating);
  return (
    <div data-card data-summary className={`${CARD} flex items-baseline justify-between gap-2 whitespace-nowrap`}>
      <p className={CARD_LABEL}>{t.label}</p>
      {rating && (
        <p data-testid="demo-rating" data-rater={rating.rater} className="flex items-baseline gap-1">
          <span className={CAPTION}>{t.rating.label}</span>
          <span className={`${NUMERAL} text-white`}>{rating.value}</span>
          <span className={CAPTION}>{TEXT.outOf}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The try card's one label: which try, then who is speaking. On one line with a dot when
 * the two parts are short enough to fit a phone; otherwise on two lines with no dot, so the
 * dot can never dangle at a line end.
 */
function TryLabel({ t }: { t: Try }) {
  const oneLine = t.label.length + t.explainBack.label.length <= 32;
  if (!oneLine) {
    return (
      <div className={CARD_LABEL}>
        <p>{t.label}</p>
        <p>{t.explainBack.label}</p>
      </div>
    );
  }
  return (
    <p className={`${CARD_LABEL} flex items-center gap-x-2 whitespace-nowrap`}>
      <span>{t.label}</span>
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-500" />
      <span>{t.explainBack.label}</span>
    </p>
  );
}

const ROW_ONE = [0, 1, 2, 3, 4, 5];
const ROW_TWO = [6, 7, 8, 9, 10];

/** The guess: 0 to 5 on one row, 6 to 10 on the next, each row the full width. */
function GuessChips({ guess, onGuess }: { guess: number | null; onGuess: (value: number) => void }) {
  const id = useId();
  const chip = (n: number) => (
    <button
      key={n}
      type="button"
      aria-pressed={guess === n}
      onClick={() => onGuess(n)}
      className="h-11 min-w-11 rounded-lg border border-slate-500 text-[17px] tabular-nums text-slate-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      {n}
    </button>
  );
  return (
    <div data-guess className="space-y-2">
      <p id={id} className={BODY}>
        {TEXT.demoGuessPrompt}
      </p>
      <div role="group" aria-labelledby={id} className="space-y-1">
        <div className="grid grid-cols-6 gap-1">{ROW_ONE.map(chip)}</div>
        <div className="grid grid-cols-5 gap-1">{ROW_TWO.map(chip)}</div>
      </div>
    </div>
  );
}

/** The try being revealed: its label, the explain-back, then the rating row once revealed. */
function TryCard({
  t,
  ratingShown,
  guess,
  delay,
  isNewest,
}: {
  t: Try;
  ratingShown: boolean;
  guess: number | null;
  delay: boolean;
  isNewest: boolean;
}) {
  return (
    <div data-card data-newest={isNewest ? "" : undefined} className={`${CARD} space-y-2`}>
      <div data-demo="explain-back">
        <TryLabel t={t} />
        <p className={`mt-1 ${BODY}`}>{t.explainBack.text}</p>
      </div>
      {ratingShown && (
        <div data-demo="rating" className={`space-y-2 ${enter(true)}`}>
          <RatingRow step={t.rating} guess={t.round === 1 ? guess : null} delay={delay} />
          {t.rating.missed && <p className={BODY}>{t.rating.missed}</p>}
        </div>
      )}
    </div>
  );
}

export function DemoScreen({
  beat,
  guess,
  onGuess,
  revealDelay = false,
  mirrorLink,
  onOpenMirror,
}: {
  beat: number;
  guess: number | null;
  onGuess: (value: number) => void;
  /** The visitor just guessed: show the speaker's number 400ms after theirs. */
  revealDelay?: boolean;
  mirrorLink: boolean;
  onOpenMirror: () => void;
}) {
  const view = demoView(beat);
  const finished = view.current?.round === 2 && view.ratingShown;

  return (
    <div className={`space-y-2 ${enter(beat === 0)}`}>
      <Heading
        role="lead"
        text={TEXT.demoLabel}
        compactText={TEXT.demoLabelCompact}
        extra={
          <p data-pending className={`${CAPTION} mt-0.5`}>
            {TEXT.demoPending}
          </p>
        }
      />
      <div data-card data-demo="statement" data-newest={beat === 0 ? "" : undefined} className={CARD}>
        <p className={CARD_LABEL}>{view.statement.label}</p>
        <p className={`mt-1 ${BODY}`}>{view.statement.text}</p>
      </div>
      {view.summaries.map((t) => (
        <TrySummary key={t.round} t={t} />
      ))}
      {/* On the guess beat the card and the chips arrive together, so the panel brings both
          into view: the game moment is never half below the fold. */}
      <div data-newest={view.guessing ? "" : undefined} className="space-y-2">
        {view.current && (
          <TryCard
            key={view.current.round}
            t={view.current}
            ratingShown={view.ratingShown}
            guess={guess}
            delay={revealDelay}
            isNewest={!view.guessing}
          />
        )}
        {view.guessing && <GuessChips guess={guess} onGuess={onGuess} />}
      </div>
      {/* Not the newest element: bringing it into view must never push the statement off
          the top, so the current try stays the one the panel scrolls to. */}
      {finished && mirrorLink && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onOpenMirror}
            className="inline-flex min-h-11 items-center text-left text-[17px] text-blue-200 underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            {TEXT.mirrorLink}
          </button>
        </div>
      )}
    </div>
  );
}

function Between() {
  return (
    <span aria-hidden="true" className="flex justify-center text-slate-400">
      <ArrowDown className="h-5 w-5" />
    </span>
  );
}

/** Point A, the obstacle, Point B: stacked at every width, the full column wide. */
function PointDiagram() {
  return (
    <div className="grid gap-2">
      <div data-card className={CARD}>
        <p className={CARD_LABEL}>{DECK_TEXT.pointA}</p>
        <p className={`mt-1 ${BODY}`}>{DECK_TEXT.pointAText}</p>
      </div>
      <Between />
      <div data-card className={`${CARD} border-dashed border-slate-400 bg-transparent`}>
        <p className={CARD_LABEL}>{DECK_TEXT.obstacle}</p>
        <p className={`mt-1 ${BODY} text-white`}>{TEXT.normObstacle}</p>
      </div>
      <Between />
      <div data-card data-newest className={CARD}>
        <p className={CARD_LABEL}>{DECK_TEXT.pointB}</p>
        <p className={`mt-1 ${BODY}`}>{DECK_TEXT.pointBText}</p>
      </div>
    </div>
  );
}

/** Screen 6: the title with the two founder sentences, then the pretending, then the diagram. */
export function NormScreen({ beat }: { beat: number }) {
  if (beat >= 2) {
    return (
      <div className={`space-y-4 ${enter(true)}`}>
        <Heading role="title" level={2} text={DECK_TEXT.noSocialNorm} />
        <PointDiagram />
      </div>
    );
  }
  const [disrespect, stupid, pretend] = STORY_TEXT.norm;
  return (
    <div className={`space-y-4 ${enter(beat === 0)}`}>
      <Heading role="title" level={2} text={DECK_TEXT.whyNobodyVerifies} />
      <div data-newest={beat === 0 ? "" : undefined} className="space-y-3">
        <p className={BODY}>{disrespect}</p>
        <p className={BODY}>{stupid}</p>
      </div>
      {beat >= 1 && (
        <p data-newest className={`${BODY} ${enter(true)}`}>
          {pretend}
        </p>
      )}
    </div>
  );
}

export function ForkScreen({
  onChoose,
  onFocusIndex,
}: {
  onChoose: (route: Route) => void;
  onFocusIndex: (index: number | null) => void;
}) {
  return (
    <div data-newest className="first-enter space-y-3">
      <Heading role="lead" text={STORY_TEXT.hiddenNumber} />
      <h2 className={LEAD}>{TEXT.forkQuestion}</h2>
      <ul className="space-y-2">
        {ROUTES.map((route, i) => (
          <li key={route}>
            <button
              type="button"
              className={choiceButton}
              onClick={() => onChoose(route)}
              onFocus={() => onFocusIndex(i)}
              onBlur={() => onFocusIndex(null)}
            >
              {ROUTE_LABEL[route]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
