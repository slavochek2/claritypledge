/** P1506 — the 3-second exchange copy, from the hospital brochure (English page). The nurse
 *  explains and checks; the doctor receives, since paraphrasing is the harder side for them.
 *  The verified result, the time and the way to close the gap are system messages in the chat. */
export const EXCHANGE_COPY = {
  seconds: "3 seconds",
  m1: "From 0 to 10, how much do you think you understand my intended meaning?",
  m2: "8",
  m3: "Thanks. I’d guess you got about 4.",
  verified: "Verified understanding: 4, the lower number.",
  revealed: "Gap revealed in 3 seconds.",
  close: "To close it, the doctor explains back what they understood and the nurse corrects. Or move on if the stakes are low.",
} as const;
