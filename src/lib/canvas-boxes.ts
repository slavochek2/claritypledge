/**
 * @file canvas-boxes.ts
 * @description P1508: the twelve Clarity Canvas boxes — the lean canvas's nine plus three ikigai.
 *
 * Box tags are SYSTEM tags (`points.system_tags`), written only by the service role; the database
 * refuses them from any client write (migration 20261019120000). They can never come from a typed
 * hashtag: `extractHashtags` matches `#(\w+)`, and `:` is not a word character.
 *
 * Keys and titles are founder-approved (P1508 spec, box table). Adding a box is a founder decision
 * (src.md — No Agent-Authored Hashtags). No imports: feed-utils.ts reads this module.
 */

export const CANVAS_BOXES = [
  { tag: 'canvas:problem', title: 'Problem' },
  { tag: 'canvas:segments', title: 'Customer Segments' },
  { tag: 'canvas:uvp', title: 'Unique Value Proposition' },
  { tag: 'canvas:solution', title: 'Solution' },
  { tag: 'canvas:channels', title: 'Channels' },
  { tag: 'canvas:revenue', title: 'Revenue Streams' },
  { tag: 'canvas:cost', title: 'Cost Structure' },
  { tag: 'canvas:metrics', title: 'Key Metrics' },
  { tag: 'canvas:advantage', title: 'Unfair Advantage' },
  { tag: 'canvas:love', title: 'What I love' },
  { tag: 'canvas:good-at', title: "What I'm good at" },
  { tag: 'canvas:world-needs', title: 'What the world needs' },
] as const;

export type CanvasBoxTag = (typeof CANVAS_BOXES)[number]['tag'];

export const CANVAS_BOX_TAGS: readonly CanvasBoxTag[] = CANVAS_BOXES.map(b => b.tag);

const BOX_TAG_SET: ReadonlySet<string> = new Set(CANVAS_BOX_TAGS);

/** True for one of the twelve box tags (case-insensitive, like every system-tag check). */
export function isCanvasBoxTag(tag: string): boolean {
  return BOX_TAG_SET.has(tag.toLowerCase());
}

/** The box a point sits in: its first box tag. One box per point (v9 rule), so the first wins. */
export function canvasBoxOf(systemTags: readonly string[]): CanvasBoxTag | null {
  const tag = systemTags.find(isCanvasBoxTag);
  return tag ? (tag.toLowerCase() as CanvasBoxTag) : null;
}

/**
 * Points sorted into the twelve boxes, input order kept inside each box. A point with no box tag
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

/** The project-tag segment of a canvas address: one hashtag-shaped word, compared lower-case. */
export function normalizeProjectTag(raw: string | undefined): string | null {
  if (!raw) return null;
  const tag = raw.toLowerCase();
  return /^\w{1,64}$/.test(tag) ? tag : null;
}
