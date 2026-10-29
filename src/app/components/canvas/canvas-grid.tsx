/**
 * @file canvas-grid.tsx
 * @description The canvas's nine boxes in three layers (P1535). P1536: on the owner's draft, an empty box shows the question
 * the drafting agent left for the owner (owner only: readers, and the owner on a published version, see a plain empty box).
 */
import type { ReactNode } from 'react';
import { CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import { CanvasBoxPlaceholder } from '@/app/pages/canvas-page-placeholders';
import { BoxIcon } from './canvas-box-icon';
import { BOX_TITLES } from './canvas-page-data';
import { useCanvasPaneShown } from './canvas-pane-context';

/** The canvas stays small: a box shows this many cards, and says how many more it holds (R2).
 * P1535 (founder): one card per box, so the whole canvas fits one screen at the event. */
const BOX_LIMIT = 1;

/**
 * P1535: the three layers of three boxes, each under its label, in one grid — three columns from
 * 1024px, two from 640px, one below. Every box is shown, filled or not, so the grid keeps its
 * shape. A row is as tall as its tallest box.
 */
export function CanvasGrid({ boxes, renderCard, onMore, questions }: {
  /** null while loading (skeletons) */
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]> | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  onMore: (box: CanvasBoxTag) => void;
  /** P1536, owner's draft only: the question for each empty box, by box tag */
  questions?: Record<string, string>;
}) {
  // With the draft's thread beside the page the column is about 590px at 1280px: two boxes across, three from 1536px.
  const columns = useCanvasPaneShown() ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={`grid grid-cols-1 gap-2 ${columns}`} data-testid="canvas-grid" aria-busy={boxes === null}>
      {CANVAS_LAYERS.map((layer, i) => (
        <section key={layer.title} aria-label={layer.title} className="contents" data-testid="canvas-layer">
          {/* Founder, sixth round: the layers did not read as groups — a rule above, a bigger title,
              and more room between layers than between boxes. */}
          <h2 className={`col-span-full flex items-baseline gap-2.5 text-base font-semibold tracking-tight text-foreground md:text-lg ${i === 0 ? '' : 'mt-6'}`} data-testid="canvas-layer-title">
            {/* Founder, sixth round: the rules between layers read oddly — whitespace groups them,
                and a number says they are read in order (founder: plain grey, the blue pill distracted). */}
            <span aria-hidden className="font-mono text-sm font-medium text-foreground/40" data-testid="canvas-layer-number">{String(i + 1).padStart(2, '0')}</span>
            <span data-testid="canvas-layer-name">{layer.title}</span>
          </h2>
          {layer.boxes.map(tag => (
            <CanvasBox
              key={tag}
              tag={tag}
              title={BOX_TITLES.get(tag) ?? tag}
              points={boxes ? boxes.get(tag) ?? [] : null}
              renderCard={renderCard}
              onMore={() => onMore(tag)}
              question={questions?.[tag]}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * D3, R2: a sentence-case title with its outline icon, no count; one card (P1535) and "See all N",
 * which opens the whole box in the panel. An empty box reads "Empty" to everyone (owners change the
 * canvas through their agent, so there is nothing to offer here), except on the owner's draft, where it shows the question.
 */
function CanvasBox({ tag, title, points, renderCard, onMore, question }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  onMore: () => void;
  question?: string;
}) {
  const headingId = `canvas-box-${tag.replace(':', '-')}`;
  const empty = points !== null && points.length === 0;
  // Founder, sixth round: "1 more" promised one card and opened all of them — the label now says
  // what opens.
  const hidden = points ? Math.max(0, points.length - BOX_LIMIT) : 0;
  const titleColour = empty ? 'text-foreground/60' : 'text-foreground';

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`canvas-box-${tag}`}
      data-empty={empty || undefined}
      // Founder (fifth round): white on white hid everything — a grey box holds white cards.
      className={`flex min-w-0 flex-col rounded-xl border border-border bg-muted/60 p-2 sm:p-2.5`}
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        {/* The icon in a small tinted circle, like the pin on every point card. */}
        <BoxIcon tag={tag} className={empty ? 'opacity-60' : ''} />
        <h3 id={headingId} className={`text-sm font-semibold ${titleColour}`}>{title}</h3>
      </div>
      {points === null ? (
        <CanvasBoxPlaceholder empty={false} />
      ) : empty ? (
        // P1536: the owner's draft says what it could not fill and asks; everyone else reads "Empty". Muted italic: a
        // question to answer must not read like an answer (visual QA).
        question ? (
          <p className="break-words rounded-md border border-dashed border-blue-300 bg-background p-2 text-sm italic text-foreground/70" data-testid="canvas-box-question">
            {question}
          </p>
        ) : <CanvasBoxPlaceholder empty />
      ) : (
        <div className="flex flex-col gap-2" data-testid="canvas-box-list">
          {points.slice(0, BOX_LIMIT).map(point => renderCard(point))}
          {hidden > 0 && (
            <button
              type="button"
              id={`canvas-more-${tag.replace(':', '-')}`}
              onClick={onMore}
              aria-haspopup="dialog"
              data-testid="canvas-box-more"
              className="min-h-10 self-end rounded-sm text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              See all {points.length}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
