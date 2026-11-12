/** Scroll-in motion shared by the /tree/landing-fable* pages (P1667). One definition, three users. */
import type { Variants } from "framer-motion";

export const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;
/** A group whose children rise in one after another. */
export const STAGGER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
/** One child of a STAGGER group. */
export const RISE: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };

/**
 * The hero example's single pass (fable-agreed.tsx). `reset`: the people, saying nothing yet.
 * `agree`: everyone says yes, together. `later`: what each of them has in mind shows, one by one.
 * `close`: the final frame, held for good.
 */
export type AgreedPhase = "reset" | "agree" | "later" | "close";
/**
 * How long each phase lasts before the next, in ms: about three and a half seconds from the
 * first yes to the final frame. `close` has no dwell: the graphic plays once.
 */
export const AGREED_DWELL_MS: Record<Exclude<AgreedPhase, "close">, number> = { reset: 900, agree: 1400, later: 2100 };
