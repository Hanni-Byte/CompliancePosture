import { defineConfig } from "@playwright/test";

// E2E runs against the REAL prod container (Caddy + generated CSP headers),
// never against the Vite dev server — the headers are the thing under test.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8081",
    browserName: "chromium",
  },
});
