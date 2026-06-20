import type { PlanRequest } from "@study-planner/shared";

/**
 * Paired with `config: { responseMimeType: "application/json" }` (design
 * §6.2) so Gemini is constrained to JSON output matching `planSuggestionSchema`.
 */
export function buildPrompt(input: PlanRequest): string {
  return `You are a study planning assistant. Break the goal below into a concrete, actionable plan of cards (tasks) and optional milestones.

Goal: "${input.goalTitle}"
${input.context ? `Context: ${input.context}` : ""}

Respond with ONLY a JSON object (no markdown fences, no commentary) matching exactly this shape:
{
  "summary": string,
  "cards": [{ "title": string, "description"?: string, "dueDate"?: string (ISO date), "priority"?: "low" | "medium" | "high" | "urgent" }],
  "milestones": [{ "title": string, "type"?: "milestone" | "deadline" | "event", "date": string (ISO date) }]
}`;
}
