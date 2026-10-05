/**
 * Words this prototype needs that are not in the shared FOUNDER set. Every one of
 * them is an agent draft and a founder decision. Visible ones render through <Draft>;
 * the screen-reader-only ones are listed here so they can be reviewed the same way.
 */
export const WILD_COPY = {
  /** Visible hint under the control, before the reveal. */
  dragHint: "Drag to reveal",
  /** Visible hint under the control, between the reveal and 10 out of 10. */
  bridgeHint: "Keep going. Explain it back.",
  /** Screen-reader label of the control. */
  controlLabel: "Reveal the hidden number, then bridge the gap",
  /** Screen-reader value of the control while the number is still hidden. */
  hiddenValue: "Hidden. They look like they understood each other.",
  /** Screen-reader value once the number shows: "{n} out of 10". */
  outOf: "out of 10",
  /** Screen-reader label of the arrow shown at 10 out of 10, which scrolls to the founder. */
  scrollCueLabel: "Meet the founder",
  /** Alt text of the founder photo. */
  photoAlt: "The founder",
} as const;
