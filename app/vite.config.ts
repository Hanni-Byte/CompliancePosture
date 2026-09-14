import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import type { Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev/preview only: serve the repo-root `packs/` at `/packs/*` exactly the
 * way the prod Caddy image does (JSON content-type, real 404s). Packs are not
 * bundled (§7 L4) — the prod image COPYs them next to the built assets.
 */
function servePacks(): Plugin {
  const packsRoot = fileURLToPath(new URL("../packs/", import.meta.url));
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/packs/")) return next();
    const rel = normalize(decodeURIComponent(req.url.slice("/packs/".length).split("?")[0] ?? ""));
    if (rel.startsWith("..")) return next();
    const file = join(packsRoot, rel);
    // Read directly and treat any failure (missing, directory, …) as 404 —
    // no check-then-use window.
    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      return res.end("not found");
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-cache");
    res.end(body);
  };
  return {
    name: "complianceposture-serve-packs",
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), servePacks()],
  server: { port: 5173 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
