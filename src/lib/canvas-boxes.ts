/**
 * @file canvas-boxes.ts
 * @description P1508: the Clarity Canvas boxes in their layers, and the canvas tags.
 *
 * Box tags (`canvas:<box>`) and canvas tags (`canvas_<name>`, one per canvas) are SYSTEM tags
 * (`points.system_tags`), written only by the service role; the database refuses them from any
 * client write (migration 20261019120000). Neither can come from a typed hashtag: `:` is not a
 * word character, and `extractHashtags` drops every system tag, `canvas_…` included (sixth round
 * R9: the namespace is reserved).
 *
 * Keys and titles are founder-approved. P1535 replaced the Ikigai layer and dropped Unfair
 * Advantage and Cost Structure: nine boxes in three layers, core bet first. Renames are titles only
 * (keys unchanged), as in sixth round R1; a dropped key leaves the list like `canvas:uvp` and its
 * points show on no canvas. Adding a box is a founder decision (src.md — No Agent-Authored
 * Hashtags). No imports: feed-utils.ts reads this module.
 */

export const CANVAS_BOXES = [
  { tag: 'canvas:segments', title: 'Customer Segments' },
  { tag: 'canvas:problem', title: 'Problem' },
  { tag: 'canvas:solution', title: 'Solution' },
  { tag: 'canvas:channels', title: 'Go-to-market strategy' },
  { tag: 'canvas:revenue', title: 'Offers & Pricing' },
  { tag: 'canvas:metrics', title: 'My next milestone' },
  { tag: 'canvas:love', title: 'Guiding values' },
  { tag: 'canvas:good-at', title: 'My current biggest challenge' },
  { tag: 'canvas:world-needs', title: "Hypotheses I've falsified" },
] as const;

export type CanvasBoxTag = (typeof CANVAS_BOXES)[number]['tag'];

export const CANVAS_BOX_TAGS: readonly CanvasBoxTag[] = CANVAS_BOXES.map(b => b.tag);

/** The three rows, top to bottom (P1535, P1621 founder-approved order): the core bet first, the founder's own
 *  values and limits last. The rows carry no names or numbers on screen (P1621). Reading order is row by row, box by box;
 *  Previous / Next walk it. Display order only: points keep their boxes. */
export const CANVAS_LAYERS: readonly { boxes: readonly CanvasBoxTag[] }[] = [
  { boxes: ['canvas:segments', 'canvas:problem', 'canvas:solution'] },
  { boxes: ['canvas:revenue', 'canvas:channels', 'canvas:metrics'] },
  { boxes: ['canvas:good-at', 'canvas:world-needs', 'canvas:love'] },
];

const BOX_TAG_SET: ReadonlySet<string> = new Set(CANVAS_BOX_TAGS);

/** True for one of the box tags in the list (case-insensitive, like every system-tag check). */
export function isCanvasBoxTag(tag: string): boolean {
  return BOX_TAG_SET.has(tag.toLowerCase());
}

const CANVAS_TAG_PATTERN = /^canvas_(\w{1,64})$/i;

/**
 * Any canvas system tag: a box tag (also one no longer in the box list, such as the dropped
 * `canvas:uvp`, `canvas:advantage` or `canvas:cost`, so it never surfaces as a pill) or a canvas's own `canvas_<name>` tag.
 */
export function isCanvasTag(tag: string): boolean {
  return /^canvas:[\w-]+$/i.test(tag) || CANVAS_TAG_PATTERN.test(tag);
}

/** R14 (founder): a canvas lives under its owner's profile, `/p/<handle>/canvas/<name>`. */
export function canvasPath(handle: string, name: string): string {
  return `/p/${handle}/canvas/${encodeURIComponent(name)}`;
}

export function isCanvasPathname(pathname: string): boolean {
  return /^\/p\/[^/]+\/canvas\/[^/]+\/?$/.test(pathname);
}

/**
 * The title shown for a canvas everywhere (Artifacts rows, the canvas page, the chat share card):
 * its hashtag-shaped name with underscores read as spaces and the first letter capitalised
 * ("hiring_plan_for_q1" shows as "Hiring plan for q1").
 */
export function canvasTitle(name: string): string {
  const spaced = name.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** P1536 W8: the longest a canvas title can be (the database's own limit). */
export const CANVAS_TITLE_MAX = 60;

/** P1614: the longest a point's text can be on a draft (the same bound every engine path enforces). */
export const CANVAS_POINT_MAX = 300;

/** P1621: the most cards a box holds, the limit the drafting agent already has; hand-added cards count too (the server enforces it atomically). */
export const CANVAS_BOX_CARD_LIMIT = 3;

/**
 * P1536 W8: the title a canvas is SHOWN under, from the one place: the owner's rename (`canvases.title`) when there is one, else the name's
 * canvasTitle. The address tag and the version names never change; only this display does.
 */
export function canvasDisplayTitle(title: string | null | undefined, name: string): string {
  return title && title.trim() ? title : canvasTitle(name);
}

/** The system tag a canvas named `name` is identified by (its address uses the name alone). */
export function canvasTagFor(name: string): string {
  return `canvas_${name.toLowerCase()}`;
}

/** The canvas name in a `canvas_<name>` tag, or null for any other tag. */
export function canvasNameOf(tag: string): string | null {
  return CANVAS_TAG_PATTERN.exec(tag)?.[1]?.toLowerCase() ?? null;
}

/**
 * P1536: a version made by the draft flow is named `<canvas>_d<6 hex>` (an internal key, never shown). Its tag is
 * `canvas_<canvas>_d<hex>`, so a point's tag alone would list every draft version as a canvas of its own.
 */
const DRAFT_VERSION_SUFFIX = /_d[0-9a-f]{6}$/;

/** The canvas a version name belongs to: the name without its draft-flow suffix (any other name is its own canvas). */
export function canvasOfVersionName(version: string): string {
  return version.replace(DRAFT_VERSION_SUFFIX, '') || version;
}

/** The CANVAS a `canvas_<version>` tag belongs to, or null for any other tag (use this to list canvases, `canvasNameOf` for versions). */
export function canvasOfTag(tag: string): string | null {
  const version = canvasNameOf(tag);
  return version ? canvasOfVersionName(version) : null;
}

/** The box a point sits in: its first box tag. One box per point (v9 rule), so the first wins. */
export function canvasBoxOf(systemTags: readonly string[]): CanvasBoxTag | null {
  const tag = systemTags.find(isCanvasBoxTag);
  return tag ? (tag.toLowerCase() as CanvasBoxTag) : null;
}

/**
 * Points sorted into the boxes, input order kept inside each box. A point with no box tag
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
