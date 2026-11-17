/**
 * P1691: read every row of a query, page by page, keyed on a unique column.
 *
 * One read returns at most one page, and the server may return fewer rows than asked (its own row
 * cap can be lower than the page size), so only an empty read ends the list. A caller that treats
 * the first page as the whole answer acts on a silently truncated set: mail held back for good, or
 * a response's answers dropped.
 *
 * Each read asks for the rows AFTER the last key received, never for an offset. The sets read this
 * way change under concurrent requests (a delivery leaves the un-notified set when another request
 * claims it), and an offset into a shrinking set skips rows; a key does not move.
 *
 * `readPage(after, size)` runs the caller's query ordered by the key column, filtered to keys
 * greater than `after` when it is not null, and limited to `size` rows. `keyOf` returns that key
 * from a row. Returns null when a read fails or `maxReads` is reached; the caller decides what
 * that means (and logs it with its own name).
 */

/** Rows asked for per read. */
export const PAGE_SIZE = 1000;
/** Upper bound on reads for one call; past it the caller gets null, never a partial list. */
export const MAX_READS = 500;

export type PageResult<T> = { data: T[] | null; error: unknown };

export async function readAllPages<T>(
  readPage: (after: string | null, size: number) => PromiseLike<PageResult<T>>,
  keyOf: (row: T) => string,
  maxReads: number = MAX_READS,
): Promise<T[] | null> {
  const rows: T[] = [];
  let after: string | null = null;
  for (let read = 0; read < maxReads; read++) {
    const { data, error } = await readPage(after, PAGE_SIZE);
    if (error || !data) return null;
    if (data.length === 0) return rows;
    rows.push(...data);
    after = keyOf(data[data.length - 1]);
  }
  return null;
}
