import { planSuggestionSchema, type PlanSuggestion } from "@study-planner/shared";

/** Gemini's JSON output didn't parse or didn't match `planSuggestionSchema`. */
export class PlanParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PlanParseError";
  }
}

/** Validate Gemini's response against `planSuggestionSchema` before it's shown to the user (design §6.4). */
export function parsePlan(text: string | undefined | null): PlanSuggestion {
  if (!text) throw new PlanParseError("Gemini returned an empty response.");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new PlanParseError("Gemini did not return valid JSON.", err);
  }

  const result = planSuggestionSchema.safeParse(json);
  if (!result.success) {
    throw new PlanParseError(
      "Gemini's response didn't match the expected plan shape.",
      result.error,
    );
  }
  return result.data;
}
