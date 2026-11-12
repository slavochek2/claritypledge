/** Scroll-in motion shared by the /tree/landing-fable* pages (P1667). One definition, three users. */
import type { Variants } from "framer-motion";

export const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;
/** A group whose children rise in one after another. */
export const STAGGER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
/** One child of a STAGGER group. */
export const RISE: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };
