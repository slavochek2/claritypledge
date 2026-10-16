/** P1506 — the 3-second exchange copy, verbatim from the hospital brochure (English page). */
export const EXCHANGE_COPY = {
  heading: "Revealing a gap: does B understand A?",
  seconds: "3 seconds",
  roles: "Two colleagues: A has just explained something, B listened",
  m1: "From 0 to 10, how much do you think you understand my intended meaning?",
  m2: "8",
  m3: "Thanks. I’d guess you got about 4.",
  verifiedLabel: "verified",
  outcomeLine: "Verified understanding = the lower number",
  outcomeText: "In three seconds both see the gap: the 8 was only assumed.",
  then: "Then they choose:",
  moveOn: "Move on",
  moveOnCost: "Cost: three seconds.",
  close: "Close the gap",
  // Brochure: "B explains back what A meant." The page names the two colleagues (see gap-exchange.tsx).
  closeCost: "Cost: a minute or more. Mai explains back what the doctor meant.",
} as const;
