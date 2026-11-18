/**
 * @file RoleCards.tsx
 * @description P1706 (exploration) — the printed speaker/listener lanyard card (docs/events/badges/, decisions.md
 * 2026-11-09 "The role card says I am speaker") drawn on screen, both sides next to each other. Proportions and
 * positions come from docs/events/badges/card.css (54 x 85 mm), converted to container units so it scales with width.
 */
import { ROLE_CARDS } from './listening-game';

function RoleCard({ side }: { side: (typeof ROLE_CARDS.sides)[number] }) {
  return (
    <div
      className="relative aspect-[54/85] w-full overflow-hidden rounded-xl text-white shadow-md [container-type:inline-size]"
      style={{ backgroundColor: side.color }}
      data-testid={`role-card-${side.id}`}
    >
      <div className="absolute inset-x-[11.1%] top-[16.5%] text-[8.9cqw] font-bold leading-none tracking-wide">I AM</div>
      <div className="absolute inset-x-[11.1%] top-[23.3%] whitespace-nowrap text-[18cqw] font-extrabold leading-none tracking-tight">{side.role}</div>
      <div className="absolute inset-x-[11.1%] top-[42.4%] h-[0.75cqw] min-h-px bg-white" />
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
      <div className="mx-auto grid max-w-sm grid-cols-2 gap-4">
        {ROLE_CARDS.sides.map((side) => (
          <div key={side.id} className="space-y-1.5">
            <RoleCard side={side} />
            <p className="text-center text-sm text-muted-foreground">{side.label}</p>
          </div>
        ))}
      </div>
      <figcaption className="text-base leading-relaxed text-foreground">{ROLE_CARDS.caption}</figcaption>
    </figure>
  );
}
