import type { Variants } from "framer-motion";

/** Shared scroll-in motion + section spacing for the use-case landings (/hospitals, /change-managers). */
export const STAGGER_CONTAINER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
export const STAGGER_ITEM: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };
// The path steps light up one after another, slower than the tiles: the norm spreading.
export const PATH_CONTAINER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.3 } } };
export const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;
export const SECTION = "px-4 py-20 lg:py-28 border-t border-border";
export const MUTED = "bg-muted/30";
