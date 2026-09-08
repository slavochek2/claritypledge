import { Bot } from 'lucide-react';

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
 * Same mark, same palette in both — a reader must read them as one marker at two
 * sizes, never as two different marks.
 *
 * NOT A PILL, since 2026-09-08. It was `rounded-full border border-gray-300`, and
 * the founder read that on the profile header exactly as it renders: *"this thing,
 * agent, looks like a button now. But it's not a button."* He is describing a real
 * defect — `e2e/p1104-agent-marker.spec.ts` already asserts, in its own words, that
 * "a status marker must not navigate", and a marker drawn in the page's button
 * language invites the click it then refuses.
 *
 * WHY REMOVING THE BORDER DOES NOT COST AN ACCESSIBILITY CHANNEL, which the previous
 * comment in `p1141-agent-story-chrome.test.tsx` claimed it would ("must stay a
 * bordered pill: index.css counts it as one of three non-colour WCAG 1.4.1
 * channels"). That overstated the argument it cites. `index.css` names the CHANNELS
 * as "the square avatar, the MACHINE chip and the footer disclosure" — the chip, not
 * the chip's border. The channel is the WORD "Agent", and a word is the strongest
 * non-colour signal available; it survives the restyle untouched. The icon added
 * here makes the shape channel stronger than the border was, not weaker: a 1px grey
 * outline is the first thing lost to a low-contrast display, and it carried no
 * meaning a reader could name.
 */
const SIZES = {
  sm: { text: 'text-[10px]', icon: 10 },
  lg: { text: 'text-xs', icon: 12 },
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
      className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${SIZES[size].text} ${className}`}
    >
      <Bot size={SIZES[size].icon} aria-hidden="true" className="shrink-0" />
      Agent
    </span>
  );
}

export default MachineChip;
