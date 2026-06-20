import { generateKeyBetween } from "fractional-indexing";

/** Midpoint key strictly between two existing keys (either side may be null). */
export function positionBetween(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before, after);
}
