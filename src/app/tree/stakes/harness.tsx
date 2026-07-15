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
import { TwinCountUps } from "./variants/twin-countups";
import { PersonTiles } from "./variants/person-tiles";
import { Receipt } from "./variants/receipt";
import { FloorBar } from "./variants/floor-bar";
import { REFS, DEFAULTS, BOUNDS, computeRisk, computeFloor, formatEur } from "./model";

const VARIANTS = [
  {
    id: "twin",
    name: "Twin count-ups",
    thesis: "The section already has two giant count-ups and they work. Change what the second number says, not how the section feels.",
    Component: TwinCountUps,
  },
  {
    id: "tiles",
    name: "Person tiles",
    thesis: "A percentage is abstract; people are not. 46% stops being a statistic and becomes 'these two, out of your five.'",
    Component: PersonTiles,
  },
  {
    id: "receipt",
    name: "The receipt",
    thesis: "A computed number the reader can't trace is a number they don't believe. Make the arithmetic the emotional object — a bill, not a formula.",
    Component: Receipt,
  },
  {
    id: "floor",
    name: "The floor that still hurts",
    thesis: "The argument isn't 'here's a scary number', it's 'even YOUR most conservative number is scary.' Make that visible rather than merely true.",
    Component: FloorBar,
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
              <strong className="text-foreground">Currently unresolved at hires=1.</strong> The
              resolution lives in <code className="rounded bg-muted px-1 py-0.5 text-xs">BOUNDS</code>,
              tuned against these rendered numbers.
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
