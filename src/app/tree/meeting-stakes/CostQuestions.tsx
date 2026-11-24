/** Step 3 of /tree/meeting-stakes: the host's own cost estimates. Inputs only; every figure is worked out on Result. */
import type { Money } from "./model";
import { NumberField } from "./parts";

export function CostQuestions({ money, onMoney }: { money: Money; onMoney: (k: keyof Money, n: number | null) => void }) {
  const set = (k: keyof Money) => (n: number | null) => onMoney(k, n);
  return (
    <div className="grid gap-8">
      <fieldset>
        <legend className="font-medium">What the check costs</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField label="People in the meeting" value={money.people} onChange={set("people")} />
          <NumberField label="Cost of one person for one hour" value={money.hourly} onChange={set("hourly")} unit="€" />
          <NumberField label="Time the check adds" value={money.minutes} onChange={set("minutes")} unit="min" />
          <NumberField label="Meetings like this per year" value={money.perYear} onChange={set("perYear")} />
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-medium">What a misunderstanding costs</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField label="Cost of one misunderstanding" value={money.damage} onChange={set("damage")} unit="€" />
          <NumberField label="Without a check, one misunderstanding in every" value={money.oneIn} onChange={set("oneIn")} unit="meetings" min={1} />
        </div>
      </fieldset>
    </div>
  );
}
