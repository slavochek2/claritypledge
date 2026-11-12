/**
 * The hero example of the /tree/landing-fable* explorations (P1667): the sentence a team agreed
 * on, everyone's yes, and what each person then did. It replaces an unlabelled drawing of
 * diverging lines that readers could not decode: every beat here is plain text, read top to
 * bottom, and the "Illustration" label says the example is invented.
 *
 * The marks are a checklist, because that needs no legend: a ticked circle is "did it", an empty
 * one is "did not". Direction arrows and minus signs were tried and read as generic UI icons.
 */
import { motion, type Variants } from "framer-motion";
import { CheckIcon, ThumbsUpIcon } from "lucide-react";
import type { AgreedExample } from "./fable-content";

// The beats land one after another, in reading order: sentence, yeses, each outcome, punchline.
const SEQUENCE: Variants = { hidden: {}, show: { transition: { delayChildren: 0.25, staggerChildren: 0.22 } } };
const BEAT: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };

function OutcomeMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-blue-600 text-white" : "border-2 border-foreground/30"}`}
    >
      {done && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

export function AgreedGraphic({ example, className = "" }: { example: AgreedExample; className?: string }) {
  return (
    <motion.figure
      data-testid="agreed-graphic"
      aria-label={`Illustration. ${example.punchline}`}
      className={`rounded-2xl border border-border bg-card p-5 text-left shadow-sm sm:p-6 ${className}`}
      variants={SEQUENCE}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/70">{example.when}</p>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground/70">Illustration</span>
      </div>

      <motion.blockquote variants={BEAT} className="mt-3 rounded-2xl rounded-tl-md bg-slate-950 px-4 py-3.5 text-lg font-semibold leading-snug text-white">
        &ldquo;{example.said}&rdquo;
      </motion.blockquote>

      <motion.div variants={BEAT} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ul className="flex flex-wrap gap-1.5" aria-label="Who agreed">
          {example.people.map((p) => (
            <li key={p.name} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/10 px-2.5 py-1 text-sm font-medium text-blue-800">
              <ThumbsUpIcon className="h-3.5 w-3.5" aria-hidden />
              {p.name}
            </li>
          ))}
        </ul>
        <p className="text-sm font-semibold">{example.agreed}</p>
      </motion.div>

      <motion.p variants={BEAT} className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/70">
        {example.later}
      </motion.p>
      {/* The rail: one line coming down from the agreement, one branch per person. */}
      <ol className="ml-3 mt-3 border-l-2 border-foreground/15">
        {example.people.map((p) => (
          <motion.li key={p.name} variants={BEAT} className="relative flex items-center gap-3 py-2 pl-6">
            <span className="absolute left-0 top-1/2 h-0.5 w-4 bg-foreground/15" aria-hidden />
            <OutcomeMark done={p.outcome !== "stalled"} />
            <span className={`leading-snug ${p.outcome === "stalled" ? "text-foreground/70" : "text-foreground"}`}>
              <b className="font-semibold text-foreground">{p.name}</b> {p.did}
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
