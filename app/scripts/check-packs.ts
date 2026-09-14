// Citation-resolvability gate (constitution quality gates). Reuses the app's
// own PackLoader (zod mirror + sha256 + domain invariants) against the
// committed packs on disk, then adds what only CI can check:
//   (1) the catalogue lists exactly the packs on disk,
//   (2) crosswalk chunk ids exist in their target pack,
//   (3) every unique citation URL resolves live — EUR-Lex by confirming the
//       #anchor exists in the Cellar document (D25), others by HTTP status.
//
//   npm run packs:check            # full, needs network
//   npm run packs:check:offline    # (1)+(2) plus schema/checksums/invariants
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { KnowledgePack } from "../src/domain/entities/pack";
import { PackLoader } from "../src/adapters/retrieval/pack-loader";

const offline = process.argv.includes("--offline");
const packsRoot = fileURLToPath(new URL("../../packs/", import.meta.url));
const UA = "CompliancePosture-citation-check/0.2";
let failures = 0;
const fail = (msg: string): void => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};

/** Serves the committed packs directory to PackLoader as if over HTTP. */
const fsFetch: typeof fetch = (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = join(packsRoot, url.replace(/^packs\//, ""));
  if (!existsSync(path)) return Promise.resolve(new Response("not found", { status: 404 }));
  return Promise.resolve(new Response(readFileSync(path), { status: 200, headers: { "content-type": "application/json" } }));
};
const nodeSha256 = (bytes: Uint8Array): Promise<string> => Promise.resolve(createHash("sha256").update(bytes).digest("hex"));
const loader = new PackLoader({ baseUrl: "packs", fetchFn: fsFetch, sha256: nodeSha256 });

const onDisk = readdirSync(packsRoot).filter((d) => existsSync(join(packsRoot, d, "manifest.json"))).sort();
const catalogue = await loader.listPacks();
if (!catalogue.ok) {
  fail(`index.json: ${catalogue.error.kind} ${catalogue.error.message}`);
} else {
  const listed = catalogue.value.map((p) => p.id).sort();
  if (JSON.stringify(listed) !== JSON.stringify(onDisk)) fail(`index.json lists [${listed.join(", ")}] but packs on disk are [${onDisk.join(", ")}]`);
}

const loaded: Record<string, KnowledgePack> = {};
for (const packId of onDisk) {
  const result = await loader.loadPack(packId);
  if (!result.ok) {
    fail(`${packId}: ${result.error.kind} ${result.error.message}`);
    continue;
  }
  loaded[packId] = result.value;
  console.log(`ok ${packId}: schema + checksums + invariants (${result.value.chunks.length} chunks)`);
}

for (const [packId, pack] of Object.entries(loaded)) {
  for (const entry of pack.crosswalk ?? []) {
    for (const link of entry.links) {
      if (!link.packId) continue;
      const target = loaded[link.packId];
      if (!target) {
        fail(`${packId}: crosswalk ${entry.entryId} → unknown pack ${link.packId}`);
        continue;
      }
      const ids = new Set(target.chunks.map((c) => c.id));
      for (const id of link.chunkIds) if (!ids.has(id)) fail(`${packId}: crosswalk ${entry.entryId} → ${link.packId}/${id} does not exist`);
    }
  }
}

// EUR-Lex's HTML front-end challenges non-browser clients; the Cellar
// document (https, no redirects) is the same text with the same anchor ids.
// Keep in sync with tools/packs/packs/sources/eu_ai_act.py.
const CELLAR_DOCUMENTS: Record<string, string> = {
  "32024R1689": "https://publications.europa.eu/resource/cellar/dc8116a1-3fe6-11ef-865a-01aa75ed71a1.0006.03/DOC_1",
};

if (!offline) {
  const urls = new Set(Object.values(loaded).flatMap((p) => p.chunks.map((c) => c.url)));
  const cellarCache = new Map<string, string>();
  const eurlex = /^https:\/\/eur-lex\.europa\.eu\/legal-content\/EN\/TXT\/HTML\/\?uri=CELEX:(\w+)#(\w+)$/;
  let checked = 0;
  for (const url of [...urls].sort()) {
    const m = eurlex.exec(url);
    try {
      if (m) {
        const [, celex, anchor] = m as unknown as [string, string, string];
        const document = CELLAR_DOCUMENTS[celex];
        if (!document) throw new Error(`no Cellar document pinned for CELEX ${celex}`);
        if (!cellarCache.has(celex)) {
          const res = await fetch(document, {
            headers: { Accept: "application/xhtml+xml", "Accept-Language": "eng", "User-Agent": UA },
            redirect: "error",
          });
          if (!res.ok) throw new Error(`Cellar HTTP ${res.status}`);
          cellarCache.set(celex, await res.text());
        }
        if (!cellarCache.get(celex)!.includes(`id="${anchor}"`)) fail(`${url}: anchor #${anchor} not found in Cellar document`);
      } else {
        const res = await fetch(url, { method: "GET", headers: { "User-Agent": UA }, redirect: "follow" });
        if (!res.ok) fail(`${url}: HTTP ${res.status}`);
      }
      checked += 1;
    } catch (e) {
      fail(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`checked ${checked} unique citation URLs`);
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`citation-resolvability: PASS${offline ? " (offline)" : ""}`);
