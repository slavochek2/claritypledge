/** P1549 decision 13: the why, on the screen that lists the steps. Text lives in prep-why.ts or the series recipe. */
export function PrepWhy({ paragraphs }: { paragraphs: readonly string[] }) {
  return (
    <div className="space-y-2 text-base leading-relaxed text-muted-foreground" data-testid="prepare-why">
      {paragraphs.map((p) => <p key={p}>{p}</p>)}
    </div>
  );
}
