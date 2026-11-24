/** Step 3 of the /tree/meeting-stakes prototype: what the check costs against what a misunderstanding costs. */
import { compute, eur, whole, type Money } from "./model";
import { CARD, NumberField } from "./parts";

export function MoneySection({ money, setMoney, onSave }: { money: Money; setMoney: (update: (m: Money) => Money) => void; onSave: () => void }) {
  const { checkPerMeeting, checkPerYear, atRiskPerYear, breakEven } = compute(money);
  const everyN = Math.floor(breakEven);
  const set = (k: keyof Money) => (n: number) => setMoney((m) => ({ ...m, [k]: n }));
  return (
    <section className={`${CARD} mt-6`} aria-labelledby="s3">
      <h2 id="s3" className="text-xl font-semibold">3. Does the check pay for itself?</h2>
      <p className="mt-2 text-sm text-muted-foreground">Every number here is your own estimate. None of them comes from a study.</p>

      <h3 className="mt-5 font-medium">What the check costs</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <NumberField label="Meetings like this per year" value={money.perYear} onChange={set("perYear")} />
        <NumberField label="People in the meeting" value={money.people} onChange={set("people")} />
        <NumberField label="Cost of one person for one hour" value={money.hourly} onChange={set("hourly")} unit="€" />
        <NumberField label="Extra time the check adds" value={money.minutes} onChange={set("minutes")} unit="min" />
      </div>

      <h3 className="mt-6 font-medium">What a misunderstanding costs</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <NumberField label="Damage when one gets through" value={money.damage} onChange={set("damage")} unit="€" />
        <NumberField label="It gets through in one of every … meetings" value={money.oneIn} onChange={set("oneIn")} min={1} />
      </div>

      <dl className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">Checking costs, per year</dt>
          <dd className="text-2xl font-semibold tabular-nums">{eur(checkPerYear)}</dd>
          <dd className="text-sm text-muted-foreground">{eur(checkPerMeeting)} per meeting</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">At risk, per year</dt>
          <dd className="text-2xl font-semibold tabular-nums">{eur(atRiskPerYear)}</dd>
          <dd className="text-sm text-muted-foreground">{whole(money.perYear)} meetings, one in {whole(money.oneIn)} goes wrong</dd>
        </div>
      </dl>

      <p className="mt-5 text-lg font-medium">
        {checkPerMeeting <= 0
          ? "Enter what the check costs to see when it pays for itself."
          : everyN < 1
            ? "The check costs more than the damage it could prevent. Skip it."
            : `The check costs ${eur(checkPerMeeting)} a meeting and one misunderstanding costs ${eur(money.damage)}. So the check pays for itself if it catches a single misunderstanding in ${whole(everyN)} meetings like this.`}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        The check finds gaps in understanding. It does not make a decision right, and it will not catch every gap.
      </p>

      <div className="mt-6">
        <button type="button" onClick={onSave} className="min-h-11 rounded-md bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          Add to my meetings
        </button>
      </div>
    </section>
  );
}
