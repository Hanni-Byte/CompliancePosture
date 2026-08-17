import { expect, test } from "@playwright/test";

// Feature 1 DoD: the CSP served by the prod container must block any origin
// that is not a registered provider (§2.8). The canary is a real, reachable
// origin that is deliberately NOT in the registry.
const CANARY_ORIGIN = "https://example.com";
const ALLOWLISTED_ORIGIN = "https://api.mistral.ai";

declare global {
  interface Window {
    cspViolations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.cspViolations.push(event.blockedURI);
    });
  });
});

test("fetch to a non-allowlisted canary origin is blocked by CSP", async ({ page }) => {
  const outcome = await page.evaluate(async (origin) => {
    try {
      await fetch(`${origin}/`, { method: "GET" });
      return "resolved";
    } catch {
      return "rejected";
    }
  }, CANARY_ORIGIN);

  expect(outcome).toBe("rejected");
  const violations = await page.evaluate(() => window.cspViolations);
  expect(violations.some((uri) => uri.startsWith(CANARY_ORIGIN))).toBe(true);
});

test("fetch to a registered provider origin is NOT blocked by CSP", async ({ page }) => {
  // The request may fail for network/auth reasons in CI — what must never
  // happen is a CSP violation for a registered provider origin.
  await page.evaluate(async (origin) => {
    try {
      await fetch(`${origin}/v1/models`, { method: "GET" });
    } catch {
      /* network/auth failures are acceptable here */
    }
  }, ALLOWLISTED_ORIGIN);

  const violations = await page.evaluate(() => window.cspViolations);
  expect(violations.filter((uri) => uri.startsWith(ALLOWLISTED_ORIGIN))).toEqual([]);
});

test("security headers are present on the document response", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("connect-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
});