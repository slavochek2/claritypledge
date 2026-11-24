/** The money half of the /tree/meeting-stakes result: the break-even, from whichever estimates the host gave. */
import { cents, compute, count, eur, every, list, percent, rate, shownInCents, type Money } from "./model";

/** The three figures the check's price needs, named as on the cost step. */
const CHECK_INPUTS: ReadonlyArray<{ key: keyof Money; label: string }> = [
  { key: "people", label: "the people in the meeting" },
  { key: "hourly", label: "the cost of one person for one hour" },
  { key: "minutes", label: "the time the check adds" },
];

/** Different, yet equal to the cent: the result reads them as the same amount, in both sentences. */
const centTie = (check: number, damage: number | null) => damage !== null && check !== damage && cents(check) === cents(damage);

const LINK = "min-h-11 font-medium text-blue-700 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function MoneyResult({ money, onAddEstimates }: { money: Money; onAddEstimates: () => void }) {
  const { checkPerMeeting, breakEvenEvery, mustPrevent: share, checkPerYear, atRiskPerYear } = compute(money);
  // When the first sentence calls the two amounts equal, the second must agree: prevent all of them if one is expected per meeting.
  const mustPrevent = checkPerMeeting !== null && centTie(checkPerMeeting, money.damage) && money.oneIn !== null ? money.oneIn : share;
  // Back to the cost step from every state, so a host can always correct a figure.
  const edit = (label: string) => (
    <button type="button" onClick={onAddEstimates} className={LINK}>
      {label}
    </button>
  );
  if (checkPerMeeting === null) {
    // Name what is missing, so a host who filled in some figures sees why nothing was worked out.
    const missing = CHECK_INPUTS.filter((f) => money[f.key] === null).map((f) => f.label);
    // "Your estimates" only when nothing was entered; once some figures are in, name the ones still missing.
    const none = Object.values(money).every((v) => v === null);
    return (
      <div className="mt-6 grid justify-items-start gap-1 border-t border-border pt-5">
        {/* What can be worked out without the check's price is still shown, as it is in the list of meetings. */}
        {atRiskPerYear !== null && <p className="mb-2">Over a year of {count(money.perYear ?? 0, "meeting")}, misunderstandings put {eur(atRiskPerYear)} at risk.</p>}
        <p className="text-muted-foreground">
          Does the check pay for itself? To work it out, add {none ? "your estimates" : list(missing)}.
        </p>
        {edit("Add estimates")}
      </div>
    );
  }
  return (
    <div className="mt-6 grid justify-items-start gap-3 border-t border-border pt-5">
      <h3 className="font-semibold">Does the check pay for itself?</h3>
      <p>{breakEven(checkPerMeeting, money.damage, breakEvenEvery)}</p>
      {mustPrevent !== null && money.oneIn !== null && (
        <p>
          You expect one misunderstanding in {rate(money.oneIn)}
          {mustPrevent === 1
            ? ", so the check has to prevent every one of them."
            : mustPrevent > 1
              ? ". Even preventing every one of them would not cover the check."
              : percent(mustPrevent) === "100%"
                ? ", so the check has to prevent nearly every one of them."
                : `, so the check has to prevent ${percent(mustPrevent).startsWith("under") ? "" : "about "}${percent(mustPrevent)} of them.`}
        </p>
      )}
      {checkPerYear !== null && (
        <p>
          Over a year of {count(money.perYear ?? 0, "meeting")}, checking costs {eur(checkPerYear)}
          {atRiskPerYear !== null && `, and misunderstandings put ${eur(atRiskPerYear)} at risk`}.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Every number is your own estimate. The check finds gaps in understanding. It does not make a decision right, and it will not catch every gap.
      </p>
      {edit("Change estimates")}
    </div>
  );
}

/** The first sentence. A zero is an answer the host gave, never read as a missing figure. */
function breakEven(check: number, damage: number | null, every_: number | null): string {
  if (check === 0) return "With these figures the check costs nothing, so in money it always pays for itself.";
  if (damage === null) return `The check costs ${eur(check)} a meeting. Add what one misunderstanding costs to see when it pays for itself.`;
  if (damage === 0) return `The check costs ${eur(check)} a meeting and a misunderstanding costs nothing, so in money it never pays for itself.`;
  // Different, yet equal to the cent: no comparison a reader could follow.
  if (centTie(check, damage)) return `The check costs about as much as one misunderstanding (${Number.isInteger(damage) ? eur(damage) : cents(damage)}), so in money it pays for itself only if it prevents one in every meeting.`;
  // Whole euros, unless two different amounts would round to the same figure and the comparison would read as nonsense.
  // Also both in cents when only one of them would be, so the two figures read on the same scale.
  const bothCents = check !== damage && (eur(check) === eur(damage) || shownInCents(check) !== shownInCents(damage));
  const [c, d] = bothCents ? [cents(check), cents(damage)] : [eur(check), eur(damage)];
  if (every_ === null || every_ < 1) return `The check costs ${c} a meeting, more than one misunderstanding costs (${d}). In money, it does not pay for itself.`;
  return `The check costs ${c} a meeting and one misunderstanding costs ${d}. It pays for itself if it prevents one misunderstanding in ${every(every_)} like this.`;
}
