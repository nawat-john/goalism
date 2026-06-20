import { describe, expect, it } from "vitest";
import { parsePlan, PlanParseError } from "./parse-plan";

describe("parsePlan", () => {
  it("parses and validates a well-formed plan", () => {
    const plan = parsePlan(
      JSON.stringify({
        summary: "A 4-week plan",
        cards: [{ title: "Week 1", priority: "high" }],
        milestones: [{ title: "Exam", date: "2026-09-01" }],
      }),
    );
    expect(plan.summary).toBe("A 4-week plan");
    expect(plan.cards).toHaveLength(1);
    expect(plan.milestones).toHaveLength(1);
  });

  it("throws PlanParseError on empty text", () => {
    expect(() => parsePlan(undefined)).toThrow(PlanParseError);
    expect(() => parsePlan(null)).toThrow(PlanParseError);
    expect(() => parsePlan("")).toThrow(PlanParseError);
  });

  it("throws PlanParseError on invalid JSON", () => {
    expect(() => parsePlan("not json")).toThrow(PlanParseError);
  });

  it("throws PlanParseError when the shape doesn't match the schema", () => {
    expect(() => parsePlan(JSON.stringify({ summary: "missing cards" }))).toThrow(
      PlanParseError,
    );
  });
});
