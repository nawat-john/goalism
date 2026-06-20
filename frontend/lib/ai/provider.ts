import type { PlanRequest, PlanSuggestion } from "@study-planner/shared";

export type { PlanRequest, PlanSuggestion };

/** `planRequestSchema.model` has a zod default, so callers may omit it; this is what providers fall back to. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export interface GeneratePlanOptions {
  /** Lets the caller cancel an in-flight request (design §6.5). */
  signal?: AbortSignal;
}

/** Thrown when Gemini reports the user's free-tier quota/rate limit is exhausted (HTTP 429). */
export class AiQuotaError extends Error {
  constructor(message = "Gemini quota exceeded — try again later.") {
    super(message);
    this.name = "AiQuotaError";
  }
}

/**
 * Pluggable AI layer (design §6.2): one interface, two swappable
 * implementations (direct vs. proxy) selected by a user setting, so the rest
 * of the app never knows which mode produced the suggestion.
 */
export interface AIProvider {
  generatePlan(
    input: PlanRequest,
    options?: GeneratePlanOptions,
  ): Promise<PlanSuggestion>;
}
