/** The meetings checked so far on /tree/meeting-stakes, with yearly totals. Shown on Result once there are two. */
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/app/components/shared/confirm-dialog";
import { VERDICT_TITLE, eur, whole, worthChecking, type Saved } from "./model";

export function SavedList({ saved, currentId, onRemove }: { saved: Saved[]; currentId: number; onRemove: (id: number) => void }) {
  const toCheck = saved.filter((s) => worthChecking(s.verdict));
  const costed = toCheck.filter((s) => s.checkPerYear !== null);
  const totalCheck = costed.reduce((a, s) => a + (s.checkPerYear ?? 0), 0);
  const risked = toCheck.filter((s) => s.atRiskPerYear !== null);
  const totalRisk = risked.reduce((a, s) => a + (s.atRiskPerYear ?? 0), 0);
  const [asking, setAsking] = useState<Saved | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <section className="mt-10" aria-labelledby="saved-title">
      <h2 id="saved-title" ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">Your meetings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Kept on this page only. Reloading clears the list.</p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card px-4">
        {saved.map((s) => (
          <li key={s.id} className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-x-4 py-3">
            <div className="min-w-0">
              <p className="break-words font-medium">{s.name}{s.id === currentId && <span className="font-normal text-muted-foreground"> (this one)</span>}</p>
              <p className="text-sm text-muted-foreground">
                {VERDICT_TITLE[s.verdict]}
                {worthChecking(s.verdict) && s.checkPerYear !== null && ` · a check costs ${eur(s.checkPerYear)} a year`}
                {worthChecking(s.verdict) && s.atRiskPerYear !== null && ` · ${eur(s.atRiskPerYear)} at risk`}
              </p>
            </div>
            {s.id !== currentId && (
              // Losing something (Button Decision Rules, 5): red text, then a confirmation.
              <button type="button" onClick={() => setAsking(s)} aria-label={removeLabel(saved, s, currentId)} className="min-h-11 rounded-md px-2 text-sm font-medium text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Worth a check or borderline</dt>
          <dd className="text-xl font-semibold tabular-nums">{whole(toCheck.length)} of {whole(saved.length)}</dd>
        </div>
        {costed.length > 0 && (
          <div>
            <dt className="text-sm text-muted-foreground">Checks cost, per year</dt>
            <dd className="text-xl font-semibold tabular-nums">{eur(totalCheck)}</dd>
            {costed.length < toCheck.length && <dd className="text-sm text-muted-foreground">from {costed.length} of {toCheck.length} meetings; the rest have no estimates</dd>}
          </div>
        )}
        {risked.length > 0 && (
          <div>
            <dt className="text-sm text-muted-foreground">At risk, per year</dt>
            <dd className="text-xl font-semibold tabular-nums">{eur(totalRisk)}</dd>
            {risked.length < toCheck.length && <dd className="text-sm text-muted-foreground">from {risked.length} of {toCheck.length} meetings; the rest have no estimates</dd>}
          </div>
        )}
      </dl>
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(o) => { if (!o) setAsking(null); }}
        title="Remove this meeting?"
        description={asking ? `${asking.name} leaves the list and the totals.` : undefined}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (asking) onRemove(asking.id);
          setAsking(null);
          // The removed row took its button with it, so focus goes to the list's heading, or to the step's when
          // the list is gone (it shows from two meetings). After the dialog's own focus return, which aims at that button.
          setTimeout(() => (heading.current ?? document.getElementById("step-title"))?.focus(), 0);
        }}
      />
    </section>
  );
}

/** "Remove Project kickoff", with the row number when two removable rows share a name, so each button has its own name. */
function removeLabel(saved: Saved[], s: Saved, currentId: number): string {
  const twin = saved.filter((m) => m.id !== currentId && m.name === s.name).length > 1;
  return twin ? `Remove ${s.name}, row ${saved.indexOf(s) + 1}` : `Remove ${s.name}`;
}
