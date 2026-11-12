/**
 * The hero example of the /tree/landing-fable* explorations (P1667): the sentence a team agreed
 * on, everyone's yes, and what each person then did. It replaces an unlabelled drawing of
 * diverging lines that readers could not decode: every beat here is plain text, read top to
 * bottom, and the "Illustration" label says the example is invented.
 *
 * The marks are a checklist, because that needs no legend: a ticked circle is "did it", an empty
 * one is "did not". Direction arrows and minus signs were tried and read as generic UI icons.
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { CheckIcon, ThumbsUpIcon } from "lucide-react";
import type { AgreedExample } from "./fable-content";

// The beats land one after another, in reading order: sentence, yeses, each outcome, punchline.
const SEQUENCE: Variants = { hidden: {}, show: { transition: { delayChildren: 0.25, staggerChildren: 0.22 } } };
const BEAT: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };

function OutcomeMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? "bg-blue-600 text-white" : "border-[1.5px] border-foreground/30"}`}
    >
      {done && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

export function AgreedGraphic({ example, className = "" }: { example: AgreedExample; className?: string }) {
  // MotionConfig reducedMotion="user" drops the rise but would still fade each beat in over a
  // second and a half. With reduced motion the card is simply there.
  const reduce = useReducedMotion();
  return (
    // No aria-label: the figcaption (the closing line) already names the figure, and a label
    // would make a screen reader say that line twice. "Illustration" is read as visible text.
    <motion.figure
      data-testid="agreed-graphic"
      className={`rounded-2xl border border-border/70 bg-card p-5 text-left text-[0.9375rem] sm:p-6 ${className}`}
      variants={SEQUENCE}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/55">{example.when}</p>
        <span className="shrink-0 text-xs text-foreground/50">Illustration</span>
      </div>

      <motion.blockquote variants={BEAT} className="mt-3 rounded-xl bg-muted px-4 py-3 text-base leading-snug text-foreground/85">
        &ldquo;{example.said}&rdquo;
      </motion.blockquote>

      <motion.div variants={BEAT} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ul className="flex flex-wrap gap-x-2 text-sm text-foreground/60" aria-label="Who agreed">
          {example.people.map((p) => (
            <li key={p.name} className="inline-flex items-center gap-1">
              <ThumbsUpIcon className="h-3 w-3" aria-hidden />
              {p.name}
            </li>
          ))}
        </ul>
        <p className="text-sm text-foreground/60">{example.agreed}</p>
      </motion.div>

      {/* The turn of the story, so a step larger than the small-caps label at the top. */}
      <motion.p variants={BEAT} className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/55">
        {example.later}
      </motion.p>
      {/* The rail: one line coming down from the agreement, one branch per person. The list has no
          aria-label: the line above already introduces it, and a label would be read twice. */}
      <ol className="ml-2.5 mt-2 border-l border-foreground/10">
        {example.people.map((p) => (
          <motion.li key={p.name} variants={BEAT} className="relative flex items-center gap-3 py-1.5 pl-6">
            <span className="absolute left-0 top-1/2 h-px w-4 bg-foreground/10" aria-hidden />
            <OutcomeMark done={p.outcome !== "stalled"} />
            <span className={`leading-snug ${p.outcome === "stalled" ? "text-foreground/60" : "text-foreground"}`}>
              <span className="font-medium">{p.name}</span> {p.did}
            </span>
          </motion.li>
        ))}
      </ol>

      <motion.figcaption variants={BEAT} className="mt-4 border-t border-border pt-4 text-lg font-semibold leading-snug tracking-tight">
        {example.punchline}
      </motion.figcaption>
    </motion.figure>
  );
}
