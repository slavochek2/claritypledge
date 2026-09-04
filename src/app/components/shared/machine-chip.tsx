/**
 * P1141 — the machine marker beside an agent byline.
 *
 * Level 2 of three attribution levels (byline, footer, explainer page). Always
 * visible, on every card and every feed — a reader has to be able to tell at a
 * glance which words a machine wrote.
 *
 * SIZES. The chip is not decoration that can be scaled freely: it is the
 * grammatical subject of the sentence it leads (`[Agent] on {Name}`),
 * so it has to sit on the same optical line as the text beside it. `sm` is
 * tuned to 14px byline text; `lg` to the 20px bold `h2` in the profile header.
 * Same border, same palette, same radius in both — a reader must read them as
 * one marker at two sizes, never as two different marks.
 */
const SIZES = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  lg: 'px-2 py-0.5 text-xs',
} as const;

export function MachineChip({
  size = 'sm',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      data-testid="machine-chip"
      data-chip-size={size}
      className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-gray-300 font-medium uppercase tracking-wide text-gray-600 dark:border-gray-600 dark:text-gray-400 ${SIZES[size]} ${className}`}
    >
      Agent
    </span>
  );
}

export default MachineChip;
