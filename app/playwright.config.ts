import { defineConfig } from "@playwright/test";

// E2E runs against the REAL prod container (Caddy + generated CSP headers),
// never against the Vite dev server — the headers are the thing under test.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8081";
const host = new URL(baseURL).hostname;
// Pack verification needs Web Crypto, which browsers expose only in secure
// contexts (https or localhost). Inside docker compose the app is reached as
// http://e2e-app, so the test browser must be told to treat it as secure —
// this flag affects the test runner only, never the shipped app.
const insecureOrigin = host === "localhost" || host === "127.0.0.1" ? null : new URL(baseURL).origin;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    ...(insecureOrigin
      ? { launchOptions: { args: [`--unsafely-treat-insecure-origin-as-secure=${insecureOrigin}`] } }
      : {}),
  },
});
