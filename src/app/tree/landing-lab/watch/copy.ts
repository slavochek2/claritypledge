/**
 * Words the "Watch" prototype needs that content.ts does not have.
 * Every entry is an agent draft and a founder decision. Visible entries render
 * through <Draft>. The alt text cannot carry a visible marker, so it is listed
 * here and in the builder's report instead.
 */
export const WATCH_COPY = {
  /** End-credit name under the founder's photo. The spelling already used in public source. */
  founderName: "Vyacheslav Ladischenski",
  /** Alt text for the founder photo. */
  founderPhotoAlt: "Vyacheslav Ladischenski, founder of Clarity Pledge",
} as const;
