/**
 * @file canvas-boxes.ts
 * @description P1508: the eleven Clarity Canvas boxes in four layers, and the canvas tags.
 *
 * Box tags (`canvas:<box>`) and canvas tags (`canvas_<name>`, one per canvas) are SYSTEM tags
 * (`points.system_tags`), written only by the service role; the database refuses them from any
 * client write (migration 20261019120000). Neither can come from a typed hashtag: `:` is not a
 * word character, and `extractHashtags` drops every system tag, `canvas_…` included (sixth round
 * R9: the namespace is reserved).
 *
 * Keys and titles are founder-approved (P1508 spec, box table; sixth round R1 renamed two titles
 * and dropped Unique Value Proposition, keys unchanged). Adding a box is a founder decision
 * (src.md — No Agent-Authored Hashtags). No imports: feed-utils.ts reads this module.
 */

export const CANVAS_BOXES = [
  { tag: 'canvas:love', title: 'What I love' },
  { tag: 'canvas:good-at', title: "What I'm good at" },
  { tag: 'canvas:world-needs', title: 'What the world needs' },
  { tag: 'canvas:segments', title: 'Customer Segments' },
  { tag: 'canvas:problem', title: 'Problem' },
  { tag: 'canvas:solution', title: 'Solution' },
  { tag: 'canvas:advantage', title: 'Unfair Advantage' },
  { tag: 'canvas:channels', title: 'Distribution' },
  { tag: 'canvas:metrics', title: 'Key Metrics' },
  { tag: 'canvas:revenue', title: 'Offers & Pricing' },
  { tag: 'canvas:cost', title: 'Cost Structure' },
] as const;

export type CanvasBoxTag = (typeof CANVAS_BOXES)[number]['tag'];

export const CANVAS_BOX_TAGS: readonly CanvasBoxTag[] = CANVAS_BOXES.map(b => b.tag);

/** The four layers, top to bottom, in the founder's words (sixth round R1). Reading order is
 *  layer by layer, box by box; Previous / Next walk it. */
export const CANVAS_LAYERS: readonly { title: string; boxes: readonly CanvasBoxTag[] }[] = [
  { title: 'Why I do this', boxes: ['canvas:love', 'canvas:good-at', 'canvas:world-needs'] },
  { title: 'The core bet', boxes: ['canvas:segments', 'canvas:problem', 'canvas:solution'] },
  { title: 'How we win', boxes: ['canvas:advantage', 'canvas:channels', 'canvas:metrics'] },
  { title: 'How it pays', boxes: ['canvas:revenue', 'canvas:cost'] },
];

const BOX_TAG_SET: ReadonlySet<string> = new Set(CANVAS_BOX_TAGS);

/** True for one of the eleven box tags (case-insensitive, like every system-tag check). */
export function isCanvasBoxTag(tag: string): boolean {
  return BOX_TAG_SET.has(tag.toLowerCase());
}

const CANVAS_TAG_PATTERN = /^canvas_(\w{1,64})$/i;

/**
 * Any canvas system tag: a box tag (also one no longer in the box list, such as the dropped
 * `canvas:uvp`, so it never surfaces as a pill) or a canvas's own `canvas_<name>` tag.
 */
export function isCanvasTag(tag: string): boolean {
  return /^canvas:[\w-]+$/i.test(tag) || CANVAS_TAG_PATTERN.test(tag);
}

/** R14 (founder): a canvas lives under its owner's profile, `/p/<handle>/canvas/<name>`. */
export function canvasPath(handle: string, name: string): string {
  return `/p/${handle}/canvas/${encodeURIComponent(name)}`;
}

export function isCanvasPathname(pathname: string): boolean {
  return /^\/p\/[^/]+\/canvas\/[^/]+/.test(pathname);
}

/** The system tag a canvas named `name` is identified by (its address uses the name alone). */
export function canvasTagFor(name: string): string {
  return `canvas_${name.toLowerCase()}`;
}

/** The canvas name in a `canvas_<name>` tag, or null for any other tag. */
export function canvasNameOf(tag: string): string | null {
  return CANVAS_TAG_PATTERN.exec(tag)?.[1]?.toLowerCase() ?? null;
}

/** The box a point sits in: its first box tag. One box per point (v9 rule), so the first wins. */
export function canvasBoxOf(systemTags: readonly string[]): CanvasBoxTag | null {
  const tag = systemTags.find(isCanvasBoxTag);
  return tag ? (tag.toLowerCase() as CanvasBoxTag) : null;
}

/**
 * Points sorted into the eleven boxes, input order kept inside each box. A point with no box tag
 * is dropped (spec: not shown); every box is present, empty or not.
 */
export function groupPointsByBox<T extends { systemTags: readonly string[] }>(
  points: readonly T[],
): Map<CanvasBoxTag, T[]> {
  const boxes = new Map<CanvasBoxTag, T[]>(CANVAS_BOX_TAGS.map(tag => [tag, []]));
  for (const point of points) {
    const box = canvasBoxOf(point.systemTags);
    if (box) boxes.get(box)?.push(point);
  }
  return boxes;
}

/** The canvas-name segment of a canvas address: one hashtag-shaped word, compared lower-case. */
export function normalizeProjectTag(raw: string | undefined): string | null {
  if (!raw) return null;
  const tag = raw.toLowerCase();
  return /^\w{1,64}$/.test(tag) ? tag : null;
}
