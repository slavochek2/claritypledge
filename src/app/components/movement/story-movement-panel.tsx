/**
 * @file story-movement-panel.tsx
 * @description P1061: the story page's count ("17 moved") as a chip that opens a panel: for each point of the
 * story, the people the author verified beside the people not verified, by how far they went. The panel
 * compares everyone and names nobody.
 */
import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { drawsNotVerified, totalOf, type StoryMovement, type StoryPointMovement } from '@/lib/position-movement';
import { Chip, CountFace, Hint } from './movement-bits';
import { StrengthBar, StrengthKey, WithheldBar } from './movement-charts';
import { storyHint, strengthHint } from './movement-copy';
import { DIALOG_HEAD, QUIET_DIALOG } from './quiet-dialog';

const NO_COUNTS = { switched: 0, other: 0, same: 0 };

/** One point of the story: its statement, then the two bars or the reason there is none. */
function PanelPoint({ statement, movement, pointId }: { statement: string; movement: StoryPointMovement | undefined; pointId: string }) {
  const verified = movement?.verified ?? NO_COUNTS;
  const notVerified = movement?.notVerified ?? NO_COUNTS;
  // The second group is a number, never names: withheld when the number itself could point at one person.
  const drawn = drawsNotVerified(totalOf(notVerified));
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={`panel-point-${pointId}`}>
      <h3 id={id} className="break-words text-sm font-medium text-foreground">{statement}</h3>
      {totalOf(verified) === 0 && !drawn
        ? <p className="mt-2 text-sm text-muted-foreground" data-testid="strength-empty">No one here changed or kept a position after the story</p>
        : (
          <div className="mt-2 space-y-2">
            <StrengthBar name="Verified" counts={verified} testId="strength-verified" />
            {drawn
              ? <StrengthBar name="Not verified" counts={notVerified} testId="strength-not-verified" />
              : <WithheldBar name="Not verified" reason="not shown for fewer than 5 people" />}
          </div>
        )}
    </section>
  );
}

/**
 * The story's own figure on its page. Nothing at all until someone the author verified has moved; the chip
 * opens the comparison, with the one-sentence explanation behind the info button beside the title.
 */
export function StoryMovementPanel({ movement, authorName, points, defaultOpen = false }: {
  movement: StoryMovement;
  authorName: string;
  points: { id: string; statement: string }[];
  /** open on first render (the P955 gate fixture) */
  defaultOpen?: boolean;
}) {
  if (movement.moved === 0) return null;
  const share = { verified: movement.verifiedCount, moved: movement.moved };
  // Only the points that were counted: a point whose history the viewer cannot read whole is not counted, and the
  // panel must not say "no one changed" about it.
  const counted = points.filter(point => movement.points.some(p => p.pointId === point.id));
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        {/* The feed's chip opens one sentence; this one opens a panel, and the chevron is how it says so. */}
        <Chip testId="count-chip" aria-label={`${share.moved} of ${share.verified} verified people moved. Show by point`}>
          <CountFace moved={share.moved} /><ChevronRight size={12} className="-ml-0.5 -mr-0.5 shrink-0 text-foreground/70" aria-hidden />
        </Chip>
      </DialogTrigger>
      <DialogContent {...QUIET_DIALOG} data-testid="story-panel">
        <DialogHeader className={DIALOG_HEAD}>
          <DialogTitle>{share.moved} moved</DialogTitle>
          <Hint label="What this counts">{storyHint(share, authorName, counted.length)}</Hint>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* The key comes first, so the colours are named before the first bar. */}
          <StrengthKey hint={<Hint label="How to read these bars">{strengthHint(authorName)}</Hint>} />
          {counted.map(point => (
            <PanelPoint key={point.id} pointId={point.id} statement={point.statement} movement={movement.points.find(p => p.pointId === point.id)} />
          ))}
        </div>
        <div className="flex justify-end border-t border-border p-4">
          <DialogClose asChild><Button className="min-h-11">Done</Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
