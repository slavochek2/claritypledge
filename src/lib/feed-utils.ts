/**
 * @file feed-utils.ts
 * P602: Utility functions for feed multi-tag and version filtering.
 * Pure functions — no side effects, no React dependencies.
 */

/** Parse comma-separated tag param into array. Empty/null → empty array. */
export function parseTags(tagParam: string | null): string[] {
  if (!tagParam) return [];
  return tagParam.split(',').map(t => t.trim()).filter(Boolean);
}

/** Serialize tag array to comma-separated URL param. Empty → null. */
export function serializeTags(tags: string[]): string | null {
  if (tags.length === 0) return null;
  return tags.join(',');
}

/** Filter items matching ANY of the given tags (OR logic). Empty tags = no filter. */
export function filterByTags<T extends { tags: string[] }>(items: T[], tags: string[]): T[] {
  if (tags.length === 0) return items;
  return items.filter(item => item.tags.some(t => tags.includes(t)));
}

/** Internal tag patterns — hidden from public tag cloud */
const ST_TAG_PATTERN = /^st\d+$/i;
const V_TAG_PATTERN = /^v\d+$/i;

/** Check if a tag is internal (st-tags or v-tags). */
export function isInternalTag(tag: string): boolean {
  return ST_TAG_PATTERN.test(tag) || V_TAG_PATTERN.test(tag);
}

/** Extract st-group number from tags. Returns null if no st-tag. */
export function getStGroup(tags: string[]): number | null {
  const stTag = tags.find(t => ST_TAG_PATTERN.test(t));
  if (!stTag) return null;
  return parseInt(stTag.slice(2), 10);
}

/** Extract version number from tags. Returns 1 if no v-tag (BR-9). */
export function getVersion(tags: string[]): number {
  const vTag = tags.find(t => V_TAG_PATTERN.test(t));
  if (!vTag) return 1;
  return parseInt(vTag.slice(1), 10);
}

/** Collapse to latest version per st-group. Points without st-tag pass through (BR-9). */
export function collapseToLatest<T extends { tags: string[] }>(items: T[]): T[] {
  const stGroups = new Map<number, T>();
  const noStTag: T[] = [];

  for (const item of items) {
    const stGroup = getStGroup(item.tags);
    if (stGroup === null) {
      noStTag.push(item);
      continue;
    }
    const existing = stGroups.get(stGroup);
    if (!existing || getVersion(item.tags) > getVersion(existing.tags)) {
      stGroups.set(stGroup, item);
    }
  }

  const sorted = [...stGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, item]) => item);
  return [...sorted, ...noStTag];
}
