/**
 * P1141 — the machine marker beside an agent byline.
 *
 * Level 2 of three attribution levels (byline, footer, explainer page). Always
 * visible, on every card and every feed — a reader has to be able to tell at a
 * glance which words a machine wrote.
 */
export function MachineChip({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="machine-chip"
      className={`inline-flex items-center rounded-full border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 dark:border-gray-600 dark:text-gray-400 ${className}`}
    >
      Machine
    </span>
  );
}

export default MachineChip;
