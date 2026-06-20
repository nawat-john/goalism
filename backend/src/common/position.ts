import { generateKeyBetween } from "fractional-indexing";

/**
 * Fractional/lexicographic ordering keys (design: ordering uses LexoRank-style
 * `position` strings, never sequential ints). Inserting between two items
 * computes a midpoint key and updates a single row.
 *
 * Phase 2 only appends to the end; Phase 3's card-move reuses
 * {@link positionBetween} for arbitrary reordering.
 */

/** Key for appending after the current last item (or the first key if empty). */
export function appendPosition(lastKey: string | null): string {
  return generateKeyBetween(lastKey, null);
}

/** Midpoint key strictly between two existing keys (either side may be null). */
export function positionBetween(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before, after);
}
