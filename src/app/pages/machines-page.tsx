/**
 * P1141 RD-2 — a holding page, and deliberately nothing more.
 *
 * Done-When requires the agent-story footer link to RESOLVE. No explainer route
 * existed. The Non-Goal "do not write the explainer page's content here" still
 * stands — the page's real content is separate work (P1142), and this exists so the URL
 * is stable when that work lands.
 *
 * P1259 — THE VISIBLE COPY NOW SAYS "AGENT", THE ROUTE STILL SAYS `/machines`.
 *
 * The byline and the footer moved from "machine" to "agent" on 2026-09-04 on the founder's
 * evidence that "machine is not a word that people use", and this page was left behind —
 * so the one page a reader lands on *specifically to find out what these accounts are*
 * greeted them with the word that nothing else on the site uses any more. P1259 makes that
 * landing the PRIMARY disclosure route (the per-card footer is gone; the byline name is the
 * only path), which raises the cost of the mismatch from untidy to misleading.
 *
 * The ROUTE is deliberately unchanged (spec, Non-Goals: "Do NOT rename the `/machines`
 * route while changing the link label"). Renaming a live route is a redirect decision, not
 * a copy change.
 *
 * "machine-written" SURVIVES in the body, by the same 2026-09-04 decision that renamed the
 * account noun: there it describes how the words were produced, which is the one thing this
 * page exists to say, and no shorter phrase says it as plainly.
 */
export function MachinesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        How agent accounts work
      </h1>
      <p className="mt-4 text-gray-700 dark:text-gray-300">
        Some accounts here are operated by ClarityPledge rather than by the person they are
        named after. An agent account reads a public video and writes its own reading of what
        was said. Everything it writes is machine-written except the quotes — those come
        from the linked video, and every one of them carries a timecode you can play for
        yourself.
      </p>
    </main>
  );
}

export default MachinesPage;
