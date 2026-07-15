/**
 * @file harness.tsx
 * P992 stakes-section prototype harness — DEV ONLY, route /tree/stakes.
 *
 * Stacks every variant on one page so comparing them is a single screenshot per
 * viewport instead of four navigations. All variants import the same model.ts,
 * so any difference you see here is a difference in VISUAL TREATMENT, never in
 * math or copy.
 *
 * EPHEMERAL. Per .claude/rules/src.md this whole directory and its route are
 * removed at integration — gating never strips a static import, so explicit
 * removal is the only reliable strip. Not a /tree/_gate fixture; do prune it.
 *
 * Spec: features/p992_key_hire_risk_calculator.md
 */
import { Receipt } from "./variants/receipt";
import { R2Gamble } from "./variants/r2-gamble";
import { R2Direct } from "./variants/r2-direct";
import { R2Clock } from "./variants/r2-clock";
import { R2Wild } from "./variants/r2-wild";
import { R2Synth } from "./variants/r2-synth";
import { REFS, DEFAULTS, BOUNDS, computeRisk, computeFloor, formatEur } from "./model";

/**
 * Round 2. Each variant's thesis is its OWN — quoted from the file it describes,
 * never the orchestrator's paraphrase, so the comparison judges what each author
 * actually argued.
 *
 * Round 1's twin-countups / person-tiles / floor-bar are dropped from the compare
 * page (their files remain on the branch). Receipt stays: it won round 1's blind
 * review and is the benchmark round 2 has to beat.
 */
const VARIANTS = [
  {
    id: "r2-synth",
    name: "R2 · Synthesis (the pick)",
    thesis:
      "THE FOUNDER'S PICK — r2-direct's structure, r2-clock's named sources, r2-wild's tinted variables. Scrub 46% and \"(Leadership IQ)\" becomes \"(yours)\": r2-direct's citation gate was epistemically exact and communicatively silent — a 4×13px [1] vanishing is below the threshold of attention. A source's NAME being replaced is not. Same gate, now legible; and a name cannot be misread as an exponent.",
    Component: R2Synth,
  },
  {
    id: "r2-gamble",
    name: "R2 · The gamble",
    thesis:
      "Keeping the odds and the price as two numbers that never multiply removes the compound claim from the headline figure entirely — no variant showing €110,400 can do that. Drag the rate down and the money does not move: the rate was never a discount on the amount.",
    Component: R2Gamble,
  },
  {
    id: "r2-direct",
    name: "R2 · Direct",
    thesis:
      "A slider is a form control wearing a costume — it asks the founder to fill in a field about people. No sliders, no inputs: the visualization and the input are the same object. The citation is bound to the cited VALUE, not the slot — scrub off the published number and the superscript detaches.",
    Component: R2Direct,
  },
  {
    id: "r2-clock",
    name: "R2 · The window",
    thesis:
      "The sources give time one piece of structure — an 18-month window — and say nothing about where inside it. So the honest temporal object is a window of ignorance, not a cost curve. Scrub the cursor; the money never moves. The flatness is shown, never claimed.",
    Component: R2Clock,
  },
  {
    id: "r2-wild",
    name: "R2 · The ad",
    thesis:
      "The other variants argue about the hire. This one argues about the founder. The object is their own job ad — a skill document with nothing on it about the thing that decides. That gap is the silence, drawn as a blank requirement at the bottom of the list.",
    Component: R2Wild,
  },
  {
    id: "receipt",
    name: "R1 · The receipt (benchmark)",
    thesis:
      "ROUND 1 WINNER — the thing round 2 must beat. A computed number the reader can't trace is a number they don't believe. Make the arithmetic the emotional object — a bill, not a formula.",
    Component: Receipt,
  },
];

export default function StakesHarness() {
  const defaultRisk = computeRisk(DEFAULTS);
  const defaultFloor = computeFloor(DEFAULTS);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-8">
        <div className="container mx-auto max-w-3xl space-y-4">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            P992 · dev-only prototype · /tree/stakes
          </p>
          <h1 className="text-2xl font-bold">Key-hire stakes section — variants</h1>
          <p className="text-sm text-muted-foreground">
            Four visual treatments of one settled structure. Every variant imports the same{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">model.ts</code> — identical math,
            identical copy. Differences below are visual only.
          </p>

          {/* The section's own pass/fail, stated up front so it can be checked
              against every variant rather than rediscovered per variant. */}
          <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-2">
            <p className="font-semibold">The floor test — the pass/fail for the whole section</p>
            <p className="text-muted-foreground">
              At the defaults ({DEFAULTS.hires} hire × {formatEur(DEFAULTS.salary)}), the figure is{" "}
              <strong className="text-foreground">{formatEur(defaultRisk)}</strong>. Dragging both
              research multipliers to their most conservative bound ({BOUNDS.failureRate.min * 100}% ·{" "}
              {BOUNDS.replacementMultiple.min}×) floors it at{" "}
              <strong className="text-foreground">{formatEur(defaultFloor)}</strong>.
            </p>
            <p className="text-muted-foreground">
              If that floor is a number the founder shrugs at, the section has <em>disarmed</em> them
              instead of priming them — worse than the static stat it replaces.{" "}
              <strong className="text-foreground">Unresolved at hires=1</strong> for any variant that
              multiplies the rate into the money.
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Round 2 caveat — this box does not describe every
              variant below.</strong>{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">computeFloor()</code> multiplies
              by <code className="rounded bg-muted px-1 py-0.5 text-xs">failureRate.min</code>, so it
              only applies where the rate is a factor of the amount. A variant that keeps the odds and
              the price apart has no such factor and a structurally different floor — read each
              variant&apos;s own note rather than this number. Variants may also expose a narrower
              input range than{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">BOUNDS</code>, which raises their
              floor corner and flatters them; that is a variant-level choice, not a model change.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2 pt-2">
            {VARIANTS.map((v) => (
              <a
                key={v.id}
                href={`#${v.id}`}
                className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-blue-500 hover:text-blue-500 transition-colors"
              >
                {v.name}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {VARIANTS.map((v) => (
        <section key={v.id} id={v.id} className="border-b border-border scroll-mt-4">
          <div className="container mx-auto max-w-3xl px-4 pt-8">
            <p className="text-xs font-mono uppercase tracking-widest text-blue-500">{v.name}</p>
            <p className="mt-2 text-sm text-muted-foreground italic">{v.thesis}</p>
          </div>
          <v.Component />
        </section>
      ))}

      {/* The variants render superscript refs; the harness has to terminate them
          or every citation is a dead link and the mitigation can't be reviewed. */}
      <footer id="references" className="px-4 py-12 scroll-mt-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-sm font-semibold">References</h2>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            {Object.entries(REFS).map(([n, ref]) => (
              <li key={n} id={`ref-${n}`} className="flex gap-2">
                <span className="shrink-0">[{n}]</span>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 underline underline-offset-2 break-words"
                >
                  {ref.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </footer>
    </div>
  );
}
