/**
 * @file p1536-pill-assert.ts
 * @description P1536 W7: "one shared secondary variant (Compare's pill, named in code as one constant)". A control wears the constant when its class list
 * holds every token of CANVAS_SECONDARY_PILL, except the spacing and justification a caller may legitimately tune (px/pl/pr/gap/justify). One helper so a
 * test never hand-types the look it is checking.
 */
import { CANVAS_DESTRUCTIVE_PILL, CANVAS_PILL_SHAPE, CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';

const TUNABLE = /^(?:px|pl|pr|gap|justify|w)-|^(?:hover|focus-within|max-sm|sm):|^(?:inline-flex|hidden|xl:inline-flex)$/;
const tokens = (cls: string): string[] => cls.split(/\s+/).filter(Boolean);
const missing = (el: Element, from: string): string[] => tokens(from).filter(t => !TUNABLE.test(t)).filter(t => !tokens(el.getAttribute('class') ?? '').includes(t));

/** the tokens of CANVAS_SECONDARY_PILL this element lacks (empty: it wears the constant) */
export const lacksSecondaryPill = (el: Element): string[] => missing(el, CANVAS_SECONDARY_PILL);
/** the tokens of the shared SHAPE this element lacks (Discard: same shape, destructive colours) */
export const lacksPillShape = (el: Element): string[] => missing(el, CANVAS_PILL_SHAPE);
export const lacksDestructivePill = (el: Element): string[] => missing(el, CANVAS_DESTRUCTIVE_PILL);
/** a filled-blue primary (the default Button) */
export const isFilledBlue = (el: Element): boolean => tokens(el.getAttribute('class') ?? '').includes('bg-blue-600');
