import { stripAgentPrefix } from '@/lib/utils';
import { MachineChip } from './machine-chip';

const SIZES = {
  /** Card and feed bylines, point rows, stance rows — 14px-ish body chrome. */
  sm: { chip: 'sm', connective: 'text-sm', name: 'text-sm' },
  /** The profile header, beside/instead of the 20px bold `h2`. */
  // The connective is deliberately SMALLER than the name at lg. Set to text-xl it matched the
  // name's weight-class and, at 320px, pushed the byline to three lines with the chip stranded
  // alone on the first — the marker reading as a floating tag rather than as the sentence's
  // subject. Dropping it one step keeps the name dominant and packs `[MACHINE] reading of` onto
  // one line.
  lg: { chip: 'lg', connective: 'text-base', name: 'text-xl' },
} as const;

interface AgentBylineProps {
  /** The profile name as stored, with or without the baked-in "Agent · " prefix. */
  name: string;
  /**
   * Navigates to the account's profile. Owned by THIS component rather than by a
   * wrapping button at the call site — see the nesting note below. The handler
   * receives the event and must stop propagation; the card root is itself clickable.
   *
   * OMIT IT where the name is not independently navigable — most rows inside a
   * card, where the card itself is the link. The name then renders as a `<span>`,
   * not a dead `<button>`. See the interactivity note below.
   */
  onNameClick?: (e: React.MouseEvent) => void;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * P1141 — `[MACHINE] reading of {Full Name}`, with the NAME as the only link.
 *
 * THE ONE PLACE AN AGENT ACCOUNT IS NAMED. Every surface that shows an agent's
 * name renders this: story bylines, the profile header, point stance rows,
 * quoted-card rows. Before 2026-08-24 those surfaces disagreed — the feed said
 * `Machine reading of X` while the profile header and every stance row said
 * `Agent · X`, the raw stored name. Same account, two identities, decided by
 * which file a reader happened to be looking at. If you are about to render an
 * agent's name anywhere new, render THIS.
 *
 * Four things here are deliberate and each has cost a round to get right.
 *
 * 1. THE CHIP IS NOT A LINK. Every call site used to wrap this whole component in
 *    the profile-navigation button, which made the machine marker clickable and
 *    sent a reader to a profile page they had not asked for. A status marker that
 *    navigates invites a click that answers no question. So the button lives HERE,
 *    around the name alone, and the call sites pass `onNameClick` instead of
 *    wrapping. A button inside a button is also invalid HTML and makes
 *    `getByRole('button')` match two elements.
 *
 * 2. NO HANDLER MEANS NO BUTTON. Rendering a `<button>` with nothing behind it is
 *    the dead-control defect the visual-QA checklist blocks by name: it invites a
 *    click that does nothing and it adds a phantom stop to keyboard tab order on
 *    rows that already have a real one. Most call sites are inside a card that is
 *    itself the link, so the span branch is the common one.
 *
 * 3. `stopPropagation` IS THE CALLER'S JOB AND IS NOT OPTIONAL when a handler IS
 *    passed. The card root is clickable on every surface that renders this.
 *    Without it, clicking the name navigates twice — once to the profile, once to
 *    the story.
 *
 * 4. NOT `Agent · {Name}`. "Agent" reads in English as *representative of*, which
 *    is the one implication an account bearing a real person's name must never
 *    carry. The STORED name keeps its `Agent ·` marker — the database enforces it,
 *    and it is what reaches off-platform surfaces and aria-labels, which is why
 *    `stripAgentPrefix` is applied here at render rather than at the source.
 *
 * And `reading of` is not trimmable, at any size. Dropped, the marker lands on the
 * PERSON — `[Machine] Daniel Bar-Tal` reads as *Daniel Bar-Tal, who is a machine*
 * rather than as an account that reads him. That misread is worst on the profile
 * header, the one surface whose whole job is identity and the one most likely to
 * be mistaken for the subject's own account, which is why `lg` carries the same
 * three parts as `sm` rather than a shortened form.
 *
 * The full name (never a pronoun) is load-bearing beyond tone: the pipeline reads
 * auto-captions and has no reliable information about any subject's pronouns, so a
 * guess would misgender a real person under an account bearing their own name.
 */
export function AgentByline({ name, onNameClick, size = 'sm', className = '' }: AgentBylineProps) {
  const fullName = stripAgentPrefix(name);
  const s = SIZES[size];
  const nameClass = `min-w-0 truncate text-left font-semibold text-foreground ${s.name}`;

  return (
    // `flex` + `min-w-0` + `max-w-full`, not `inline-flex`: an inline-flex box
    // does not shrink below its content, so at 320px the name held its full
    // width and pushed the chip 19px past the card's right border — measured,
    // not inferred (chip right=308 vs card right=289). The chip is the element
    // carrying the authorship claim, so it is the worst one to lose off-screen.
    // It now leads, so it is also the last thing a squeeze can reach.
    //
    // `flex-wrap` is the fix for what leading the chip COST. With the chip and
    // "reading of" both shrink-0 ahead of it, the name was the only flexible item
    // left and absorbed the whole squeeze: measured at 375px it truncated to
    // "Daniel Bar-…" (scrollWidth 107 vs clientWidth 102) and at 320px to "Dan…".
    // Two blind reviewers independently called that the worst thing on the page —
    // WHOSE reading this is, is the one fact the byline exists to carry, and it was
    // the only element being sacrificed. Wrapping to a second line keeps the chip,
    // the connective and the whole name; `truncate` stays as the backstop for a name
    // too long for even a full line.
    <span
      className={`flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}
      data-testid="agent-byline"
      data-byline-size={size}
    >
      <MachineChip size={s.chip} className="shrink-0" />
      <span className={`shrink-0 font-normal text-muted-foreground ${s.connective}`}>reading of</span>
      {onNameClick ? (
        <button
          type="button"
          onClick={onNameClick}
          data-testid="agent-byline-name"
          className={`${nameClass} hover:underline`}
          title={fullName}
        >
          {fullName}
        </button>
      ) : (
        <span data-testid="agent-byline-name" className={nameClass} title={fullName}>
          {fullName}
        </span>
      )}
    </span>
  );
}

export default AgentByline;
