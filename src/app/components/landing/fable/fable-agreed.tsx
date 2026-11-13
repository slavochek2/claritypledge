/**
 * The hero example of the fable layout (P1670), as a picture with no words:
 * people agree, yet they do not mean the same thing.
 *
 * One person per row of the example, drawn in line. What each of them SAID is a speech bubble
 * with a tick: the same bubble for everyone, and the only blue. What each of them MEANT is a
 * shape inside their head, and no two heads hold the same shape. Same on the outside, different
 * on the inside.
 *
 * One pass, never a loop (WCAG 2.2.2), then the final frame is held:
 *   reset  the people
 *   agree  every bubble pops, almost at once: a unanimous yes
 *   later  the shapes show inside the heads, one after another
 *   close  nothing new: the final frame
 *
 * Screen readers get the story as text instead, in order: the sentence, who agreed, what each
 * person did, the closing line. The drawing is hidden from them.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, type Transition } from "framer-motion";
import type { AgreedExample } from "./fable-content";
import { AGREED_DWELL_MS, type AgreedPhase } from "./fable-motion";

type Person = AgreedExample["people"][number];

/** Outlines first: these are told apart before they are looked at. A sixth different picture would reuse the first. */
const SHAPES = ["triangle", "circle", "square", "diamond", "half"] as const;
type Shape = (typeof SHAPES)[number];

/** The shape in each person's head: the same picture is always the same shape, in order of first appearance. */
function shapesFor(people: Person[]): Shape[] {
  const byPicture = new Map<string, Shape>();
  return people.map((p) => {
    const shape = byPicture.get(p.picture) ?? SHAPES[byPicture.size % SHAPES.length] ?? "circle";
    byPicture.set(p.picture, shape);
    return shape;
  });
}

// The stage is drawn in viewBox units and scales to its column, so nothing here is a pixel.
// One person is drawn in a 56 x 80 box; with fewer people each one is drawn a little larger.
const W = 280;
const BOX = { width: 56, height: 80 };
const HEAD = { y: 40, r: 14 };
const sizeFor = (count: number) => Math.min(1.25, W / count / BOX.width);

const STILL: Transition = { duration: 0 };

/** Plays the phases once while the graphic is on screen. With reduced motion it is the final frame from the start, and no timer is ever set. */
function usePhase(inView: boolean, reduce: boolean): AgreedPhase {
  const [live, setLive] = useState<AgreedPhase>("reset");
  useEffect(() => {
    if (reduce || !inView || live === "close") return;
    const next: AgreedPhase = live === "reset" ? "agree" : live === "agree" ? "later" : "close";
    const timer = window.setTimeout(() => setLive(next), AGREED_DWELL_MS[live]);
    return () => window.clearTimeout(timer);
  }, [reduce, inView, live]);
  return reduce ? "close" : live;
}

/** What one person has in mind, centred on their head. The stroke only rounds the corners. */
function Meaning({ shape }: { shape: Shape }) {
  const soft = { fill: "currentColor", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" as const };
  if (shape === "circle") return <circle r={6} {...soft} />;
  if (shape === "square") return <rect x={-5} y={-5} width={10} height={10} rx={1} {...soft} />;
  if (shape === "half") return <path d="M-7.2 3.6a7.2 7.2 0 0 1 14.4 0z" {...soft} />;
  return <polygon points={shape === "triangle" ? "0,-6 6.4,4.6 -6.4,4.6" : "0,-6.8 6.8,0 0,6.8 -6.8,0"} {...soft} />;
}

/** What everyone said: yes. One blue speech bubble with a tick, the same for each person. */
function Yes() {
  return (
    <g transform="translate(15 15)" className="text-blue-600">
      <rect x={-9} y={-7} width={18} height={14} rx={5} fill="currentColor" />
      <path d="M-7 5.5-9.5 11.5-2.5 6.5z" fill="currentColor" />
      <path d="M-3.6 0.3l2.4 2.4 4.6-5" fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="stroke-white" />
    </g>
  );
}

type Beat = { said: boolean; seen: boolean; still: boolean };

function PersonMark({ person, shape, x, size, index, beat }: { person: Person; shape: Shape; x: number; size: number; index: number; beat: Beat }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const };
  // The yeses land almost together; the meanings are given time to be seen as different.
  const say: Transition = beat.still ? STILL : { duration: 0.4, delay: index * 0.07, ease: "backOut" };
  const show: Transition = beat.still ? STILL : { duration: 0.55, delay: 0.1 + index * 0.28, ease: [0.2, 0.8, 0.2, 1] };
  return (
    <g
      transform={`translate(${x} 0) scale(${size})`}
      data-figure={person.name}
      data-outcome={person.outcome}
      data-picture={person.picture}
      data-shape={shape}
      data-reveal={beat.seen ? "shown" : "hidden"}
    >
      {/* Meaning-carrying greys stay at or above 3:1 on the page: the foreground colour at half strength and up. */}
      <g className="text-foreground" opacity={0.5}>
        <circle cy={HEAD.y} r={HEAD.r} {...line} />
        <path d="M-19 77a19 19 0 0 1 38 0" {...line} />
      </g>
      <g transform={`translate(0 ${HEAD.y})`} className="text-foreground" opacity={0.6}>
        <motion.g initial={false} animate={{ opacity: beat.seen ? 1 : 0, scale: beat.seen ? 1 : 0.5 }} transition={show}>
          <Meaning shape={shape} />
        </motion.g>
      </g>
      <motion.g data-yes initial={false} animate={{ opacity: beat.said ? 1 : 0, scale: beat.said ? 1 : 0.6 }} transition={say}>
        <Yes />
      </motion.g>
    </g>
  );
}

/** Everything a screen reader needs, in story order. Each string is in the DOM once, so nothing is said twice. */
function Story({ example }: { example: AgreedExample }) {
  return (
    <div className="sr-only">
      <p>{example.when}</p>
      <blockquote>{`“${example.said}”`}</blockquote>
      <p>{example.agreed}</p>
      <ul aria-label="Who agreed">
        {example.people.map((p) => (
          <li key={p.name}>{p.name}</li>
        ))}
      </ul>
      <p>{example.later}</p>
      {/* No aria-label: the line above already introduces the list, and a label would be read twice. */}
      <ol>
        {example.people.map((p) => (
          <li key={p.name}>
            <span>{p.name}</span> {p.did}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AgreedGraphic({ example, className = "" }: { example: AgreedExample; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  // MotionConfig reducedMotion="user" only drops transforms; the fades would still run.
  const reduce = useReducedMotion() ?? false;
  const phase = usePhase(inView, reduce);
  const beat: Beat = { said: phase !== "reset", seen: phase === "later" || phase === "close", still: reduce };
  const { people } = example;
  const size = sizeFor(people.length);
  const shapes = shapesFor(people);

  return (
    // No aria-label: the figcaption (the closing line) already names the figure, and a label
    // would make a screen reader say that line twice.
    <figure ref={ref} data-testid="agreed-graphic" data-phase={phase} className={`relative ${className}`}>
      <Story example={example} />
      <svg viewBox={`0 0 ${W} ${Math.ceil(BOX.height * size)}`} className="mx-auto block h-auto w-full max-w-[26rem]" aria-hidden focusable="false">
        {people.map((p, i) => (
          <PersonMark key={p.name} person={p} shape={shapes[i] ?? "circle"} x={(W / people.length) * (i + 0.5)} size={size} index={i} beat={beat} />
        ))}
      </svg>
      <figcaption className="sr-only">{example.punchline}</figcaption>
    </figure>
  );
}
