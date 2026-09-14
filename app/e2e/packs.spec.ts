import { expect, test } from "@playwright/test";

// Feature 2 DoD: "search the AI Act locally" works from the prod image — the
// pack is fetched same-origin, checksum-verified, indexed and searched in the
// browser; no request leaves the origin during search.

test("loads the EU AI Act pack and finds Article 26 for a deployer query", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:8081").origin;
  const offOrigin: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).origin !== origin) offOrigin.push(req.url());
  });

  await page.goto("/");
  await expect(page.getByTestId("pack-status")).toContainText("checksums verified", { timeout: 20_000 });

  const input = page.getByLabel("Search query");
  await input.fill("obligations of deployers of high-risk AI systems");
  await input.press("Enter");

  const first = page.getByRole("list", { name: "Search results" }).getByRole("listitem").first();
  await expect(first).toBeVisible();
  await expect(first.getByRole("link")).toHaveText(/Art\. 26/);
  await expect(first.getByRole("link")).toHaveAttribute("href", /eur-lex\.europa\.eu.*#art_26/);
  await expect(page.getByTestId("pack-attribution")).toContainText("European Union");
  expect(offOrigin).toEqual([]);
});

test("lists packs from the pipeline catalogue, not app code", async ({ page }) => {
  await page.goto("/");
  const options = page.getByLabel("Framework").locator("option");
  await expect(options).toHaveCount(2);
  await expect(options.nth(1)).toHaveText(/OWASP Top 10 for LLM Applications 2026/);
});

test("refuses to search when the pack is tampered with (fail closed)", async ({ page }) => {
  await page.route("**/packs/eu_ai_act/chunks.json", async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    await route.fulfill({ response: res, body: body.replace("\"text\": \"", "\"text\": \"TAMPERED ") });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Pack refused (integrity)", { timeout: 20_000 });
});

test("a missing pack file is a real 404, never the SPA shell", async ({ request }) => {
  const res = await request.get("/packs/does_not_exist/manifest.json");
  expect(res.status()).toBe(404);
  expect(res.headers()["content-type"] ?? "").not.toMatch(/html/);
  const real = await request.get("/packs/eu_ai_act/manifest.json");
  expect(real.status()).toBe(200);
  expect(real.headers()["content-type"]).toMatch(/json/);
  expect(real.headers()["cache-control"]).toMatch(/max-age=300/);
});
