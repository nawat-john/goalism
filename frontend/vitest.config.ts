import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // e2e/ holds Playwright specs (a separate runner — `pnpm e2e`), not Vitest ones.
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      // Scoped to modules that are pure logic with dedicated unit tests (AI
      // plan parsing, key-store storage contract, API client). `resources.ts`
      // is mostly thin fetch wrappers exercised by the Playwright e2e suite
      // instead (only its one piece of real logic, `applyCardMove`, has a
      // unit test) — same convention noted in progress.md for
      // milestonesApi/timelineApi, so it's left out of the threshold here.
      include: [
        "lib/ai/parse-plan.ts",
        "lib/ai/key-store.ts",
        "lib/api/client.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90,
      },
    },
  },
});
