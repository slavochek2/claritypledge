/** Step 3 of /tree/meeting-stakes: the impact, as a verdict and the five bars the host set. */
import { verdictCopy, type Levels } from "./model";
import { Bars } from "./parts";

export function ResultView({ name, levels }: { name: string; levels: Levels }) {
  const copy = verdictCopy(levels);
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="break-words text-sm text-muted-foreground">{name}</p>
      {/* Larger than the step heading above the card: the verdict is what the page is for. */}
      <p className="mt-1 text-3xl font-semibold tracking-tight">{copy.title}</p>
      <p className="mt-2">{copy.body}</p>
      <div className="mt-5 border-t border-border pt-5">
        <Bars levels={levels} />
      </div>
    </div>
  );
}
