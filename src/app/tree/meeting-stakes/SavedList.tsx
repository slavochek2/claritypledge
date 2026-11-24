/** Step 4 of the /tree/meeting-stakes prototype: the visitor's collected meetings with yearly totals. */
import { VERDICT, eur, whole, type Saved } from "./model";
import { CARD } from "./parts";

export function SavedList({ saved, onRemove }: { saved: Saved[]; onRemove: (id: number) => void }) {
  const worthRows = saved.filter((s) => s.verdict === "worth" || s.verdict === "borderline");
  const totalCheck = worthRows.reduce((a, s) => a + s.checkPerYear, 0);
  const totalRisk = worthRows.reduce((a, s) => a + s.atRiskPerYear, 0);
  return (
    <section className={`${CARD} mt-6`} aria-labelledby="s4">
      <h2 id="s4" className="text-xl font-semibold">4. Your meetings, over a year</h2>
      <ul className="mt-4 divide-y divide-border">
        {saved.map((s) => (
          <li key={s.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3">
            <div className="min-w-0">
              <p className="break-words font-medium">{s.name}</p>
              <p className="text-sm text-muted-foreground">
                {VERDICT[s.verdict].title} · {whole(s.perYear)} a year · checking {eur(s.checkPerYear)} · at risk {eur(s.atRiskPerYear)}
              </p>
            </div>
            <button type="button" onClick={() => onRemove(s.id)} aria-label={`Remove ${s.name}`} className="min-h-11 self-center rounded-md border border-blue-500 px-3 text-sm font-medium text-blue-600 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Meetings worth a check</dt>
          <dd className="text-2xl font-semibold tabular-nums">{worthRows.length} of {saved.length}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Checking them costs, per year</dt>
          <dd className="text-2xl font-semibold tabular-nums">{eur(totalCheck)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">At risk in them, per year</dt>
          <dd className="text-2xl font-semibold tabular-nums">{eur(totalRisk)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">Totals count only the meetings rated worth a check or borderline.</p>
    </section>
  );
}
