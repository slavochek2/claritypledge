/**
 * @file feed-utils.ts
 * P602: Utility functions for feed multi-tag and version filtering.
 * P630: System tag separation — feed logic reads from systemTags field.
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

/** Internal tag patterns — hidden from public tag cloud */
const ST_TAG_PATTERN = /^st\d+$/i;
const V_TAG_PATTERN = /^v\d+$/i;

/** P630: System tag patterns and explicit values */
const SYSTEM_TAG_PATTERNS = [ST_TAG_PATTERN, V_TAG_PATTERN];
const SYSTEM_TAG_VALUES = new Set(['understanding', 'misunderstanding']);

/** P630: Check if a tag is a system tag (st-tags, v-tags, understanding, misunderstanding). */
export function isSystemTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return SYSTEM_TAG_PATTERNS.some(p => p.test(lower)) || SYSTEM_TAG_VALUES.has(lower);
}

/** @deprecated Use isSystemTag(). Backwards-compatible alias. */
export const isInternalTag = isSystemTag;

/**
 * Filter items matching ANY of the given tags (OR logic). Empty tags = no filter.
 * P630: Checks both tags (user) and systemTags (system) arrays.
 */
export function filterByTags<T extends { tags: string[]; systemTags: string[] }>(items: T[], tags: string[]): T[] {
  if (tags.length === 0) return items;
  return items.filter(item =>
    item.tags.some(t => tags.includes(t)) ||
    item.systemTags.some(t => tags.includes(t))
  );
}

/** P630: Extract st-group number from systemTags. Returns null if no st-tag. */
export function getStGroup(systemTags: string[]): number | null {
  const stTag = systemTags.find(t => ST_TAG_PATTERN.test(t));
  if (!stTag) return null;
  return parseInt(stTag.slice(2), 10);
}

/** P630: Extract version number from systemTags. Returns 1 if no v-tag (BR-9). */
export function getVersion(systemTags: string[]): number {
  const vTag = systemTags.find(t => V_TAG_PATTERN.test(t));
  if (!vTag) return 1;
  return parseInt(vTag.slice(1), 10);
}

/** P630: Collapse to latest version per st-group using systemTags. Points without st-tag pass through (BR-9). */
export function collapseToLatest<T extends { tags: string[]; systemTags: string[] }>(items: T[]): T[] {
  const stGroups = new Map<number, T>();
  const noStTag: T[] = [];

  for (const item of items) {
    const stGroup = getStGroup(item.systemTags);
    if (stGroup === null) {
      noStTag.push(item);
      continue;
    }
    const existing = stGroups.get(stGroup);
    if (!existing || getVersion(item.systemTags) > getVersion(existing.systemTags)) {
      stGroups.set(stGroup, item);
    }
  }

  const sorted = [...stGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, item]) => item);
  return [...sorted, ...noStTag];
}
