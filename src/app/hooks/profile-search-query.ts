/**
 * @file profile-search-query.ts
 * @description P878: the one rule for when a typed query may go to `search_profiles`: 3 or more trimmed characters and
 * no '@' (anything with '@' is an email and belongs to the first-contact email path). Shared by use-profile-search.ts
 * and the Share field's list (P1650), so the two cannot disagree about when people are searched.
 */
export const MIN_QUERY_LENGTH = 3;

export function isSearchableQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= MIN_QUERY_LENGTH && !trimmed.includes('@');
}
