/**
 * Cursor-based pagination (design §7.3). Services fetch `limit + 1` rows so we
 * can tell whether another page exists without a second count query; the cursor
 * is the id of the last row on the page.
 */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** Build the `take`/`cursor`/`skip` args for a Prisma `findMany`. */
export function pageArgs(limit: number, cursor?: string) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/** Slice the over-fetched rows into a page and compute the next cursor. */
export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return { data, nextCursor: hasMore && last ? last.id : null };
}
