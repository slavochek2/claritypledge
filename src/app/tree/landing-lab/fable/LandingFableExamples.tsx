/**
 * /tree/landing-fable-examples — dev-only side-by-side of the wordless hero drawing for four
 * stories, with each story printed beside it, so the founder can pick two by looking (P1674).
 */
import { useState } from "react";
import { AgreedGraphic } from "@/app/components/landing/fable/fable-agreed";
import { AGREED_BUILDERS, AGREED_CHANGE, AGREED_COMMUNITIES, AGREED_HOSPITALS, type AgreedExample } from "@/app/components/landing/fable/fable-content";

const PANELS: { title: string; example: AgreedExample }[] = [
  { title: "/hospitals — draft for approval", example: AGREED_HOSPITALS },
  { title: "/communities — draft for approval", example: AGREED_COMMUNITIES },
  { title: "/builders — live, for comparison", example: AGREED_BUILDERS },
  { title: "/change-managers — live, for comparison", example: AGREED_CHANGE },
];

function Panel({ title, example }: { title: string; example: AgreedExample }) {
  const [run, setRun] = useState(0);
  return (
    <section className="grid items-center gap-6 rounded-xl border border-border bg-muted/40 p-4 sm:p-6 md:grid-cols-2">
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={() => setRun((n) => n + 1)} className="min-h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-background">
          Replay
        </button>
      </div>
      <AgreedGraphic key={run} example={example} className="mx-auto w-full max-w-md" />
      <div className="rounded-lg border border-border bg-background p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground/60">{example.when}</p>
        <p className="mt-2 text-base font-medium">“{example.said}”</p>
        <p className="mt-1 text-foreground/70">{example.agreed}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-foreground/60">{example.later}</p>
        <ul className="mt-2 space-y-1">
          {example.people.map((p) => (
            <li key={p.name}>
              <span className="font-medium">{p.name}:</span> {p.did}
            </li>
          ))}
        </ul>
        <p className="mt-4 font-semibold">{example.punchline}</p>
      </div>
    </section>
  );
}

export function LandingFableExamples() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Hero drawing: four stories</h1>
      <p className="text-foreground/70">Visitors see only the drawing. The words are what screen readers announce and what the drawing means.</p>
      {PANELS.map((p) => (
        <Panel key={p.title} {...p} />
      ))}
    </main>
  );
}
