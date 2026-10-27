export type Reference = { n: number; label: string; url: string };

/** The standard landing References section (anchor #references). */
export function ReferencesList({ references }: { references: readonly Reference[] }) {
  return (
    <section id="references" className="px-4 py-10 border-t border-border scroll-mt-16">
      <div className="container mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">References</p>
        <ol className="text-xs text-muted-foreground space-y-1.5">
          {references.map((r) => (
            <li key={r.n} className="flex gap-1.5">
              <span className="shrink-0">{r.n}.</span>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2">
                {r.label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
