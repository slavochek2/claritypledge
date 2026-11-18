/**
 * @file RoleCards.tsx
 * @description P1706 — the printed speaker/listener lanyard card (docs/events/badges/, decisions.md
 * "The role card says I am speaker") drawn on screen, both sides next to each other. Proportions and
 * positions come from docs/events/badges/card.css (54 x 85 mm), converted to container units so it scales with width.
 */
import { ROLE_CARDS } from './listening-game';

function RoleCard({ side }: { side: (typeof ROLE_CARDS.sides)[number] }) {
  return (
    <div
      className="relative aspect-[54/85] w-full overflow-hidden rounded-xl border border-transparent text-white shadow-md [container-type:inline-size]"
      style={{ backgroundColor: side.color }}
      data-testid={`role-card-${side.id}`}
    >
      <p className="absolute inset-x-[11.1%] top-[16.5%] text-[8.9cqw] font-bold leading-none tracking-wide">
        I AM <span className="sr-only">{side.role}</span>
      </p>
      <div aria-hidden="true" className="absolute inset-x-[11.1%] top-[23.3%] whitespace-nowrap text-[18cqw] font-extrabold leading-none tracking-tight">{side.role}</div>
      <div aria-hidden="true" className="absolute inset-x-[11.1%] top-[42.4%] h-[0.75cqw] min-h-px bg-white" />
      <div className="absolute inset-x-[11.1%] top-[48.2%] text-[6.85cqw] font-medium uppercase leading-none tracking-[0.05em]">Your job:</div>
      <div className="absolute inset-x-[11.1%] top-[55.3%] space-y-[6.5cqw] text-[8.6cqw] font-semibold leading-[1.31]">
        {side.job.map((line) => <p key={line}>{line}</p>)}
      </div>
    </div>
  );
}

export function RoleCards() {
  return (
    <figure className="space-y-3" data-testid="role-cards">
      {/* Card width in rem, not a share of the screen: the cqw text inside then follows the reader's font-size
          setting, and on a narrow phone the cards stack instead of shrinking to ~12px text. */}
      <div className="flex flex-wrap justify-center gap-4">
        {ROLE_CARDS.sides.map((side) => (
          <div key={side.id} role="group" aria-label={side.label} className="flex w-[13rem] flex-col-reverse gap-1.5">
            <RoleCard side={side} />
            <p aria-hidden="true" className="text-center text-sm text-muted-foreground">{side.label}</p>
          </div>
        ))}
      </div>
      <figcaption className="text-base leading-relaxed text-foreground">{ROLE_CARDS.caption}</figcaption>
    </figure>
  );
}
