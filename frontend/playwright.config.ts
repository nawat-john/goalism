import { defineConfig } from "@playwright/test";

// Assumes the app is already running (`pnpm dev` locally, or the
// build+start step CI's e2e job runs before `pnpm e2e` — see
// .github/workflows/ci.yml) rather than spawning servers itself, so the
// same config works against either a dev or production build.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  reporter: process.env.CI ? "html" : "list",
});
