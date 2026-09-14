import { describe, expect, it } from "vitest";
import { PackLoader, webCryptoSha256 } from "./pack-loader";

const enc = new TextEncoder();
const json = (o: unknown) => enc.encode(JSON.stringify(o));

interface FixtureOptions {
  tamperChunks?: boolean;
  badManifest?: boolean;
  missing?: string;
  wrongId?: boolean;
  schemaVersion?: number;
  spaFallback?: boolean;
  throwOnArrayBuffer?: boolean;
}

/** Builds a tiny, internally consistent pack served from memory. */
async function fixture(opts: FixtureOptions = {}) {
  const chunks = [
    { id: "art_4", ref: "Art. 4", title: "Article 4 — AI literacy", text: "Providers and deployers shall ensure AI literacy of their staff.", url: "https://eur-lex.europa.eu/x#art_4" },
    { id: "art_50", ref: "Art. 50", title: "Article 50 — Transparency", text: "Inform natural persons that they interact with an AI system.", url: "https://eur-lex.europa.eu/x#art_50" },
  ];
  const topics = [{ id: "ai_literacy", title: "AI literacy", seedQueries: ["AI literacy staff"], dependsOnSlots: [], appliesFrom: "2025-02-02" }];
  const crosswalk = [{ entryId: "ai_literacy", name: "x", sourceUrl: "https://x", links: [{ framework: "EU AI Act", ref: "Art. 4", title: "t", packId: "eu_ai_act", chunkIds: ["art_4"] }], incidents: [] }];
  const chunksBytes = json(chunks);
  const topicsBytes = json(topics);
  const crosswalkBytes = json(crosswalk);
  const manifest = {
    schemaVersion: opts.schemaVersion ?? 1,
    id: opts.wrongId ? "other" : "eu_ai_act",
    framework: "EU_AI_ACT",
    name: "EU AI Act",
    version: "OJ L 2024/1689",
    sources: [{ url: "https://publications.europa.eu/x", revision: "OJ", sha256: "a".repeat(64) }],
    license: "© EU",
    chunkCount: 2,
    topicCount: 1,
    files: {
      "chunks.json": await webCryptoSha256(chunksBytes),
      "topics.json": await webCryptoSha256(topicsBytes),
      "crosswalk.json": await webCryptoSha256(crosswalkBytes),
    },
  };
  const index = { schemaVersion: 1, packs: [{ id: "eu_ai_act", framework: "EU_AI_ACT", name: "EU AI Act", version: "OJ", license: "© EU", chunkCount: 2 }] };
  const files = new Map<string, Uint8Array>([
    ["index.json", json(index)],
    ["manifest.json", json(opts.badManifest ? { ...manifest, framework: "NOPE" } : manifest)],
    ["chunks.json", opts.tamperChunks ? json([...chunks, { ...chunks[0], id: "injected" }]) : chunksBytes],
    ["topics.json", topicsBytes],
    ["crosswalk.json", crosswalkBytes],
  ]);
  if (opts.missing) files.delete(opts.missing);
  let requests = 0;
  const fetchFn: typeof fetch = (input) => {
    requests += 1;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const name = url.split("/").pop() ?? "";
    const body = files.get(name);
    if (!body) {
      return Promise.resolve(
        opts.spaFallback
          ? new Response("<!doctype html><title>app</title>", { status: 200, headers: { "content-type": "text/html" } })
          : new Response("nope", { status: 404 }),
      );
    }
    const response = new Response(body as BodyInit, { status: 200, headers: { "content-type": "application/json" } });
    if (opts.throwOnArrayBuffer && name === "chunks.json") {
      response.arrayBuffer = () => Promise.reject(new TypeError("stream broke"));
    }
    return Promise.resolve(response);
  };
  return { loader: new PackLoader({ baseUrl: "/packs", fetchFn }), fetchFn, requests: () => requests };
}

describe("PackLoader", () => {
  it("loads, verifies checksums, attaches the crosswalk, and searches a valid pack", async () => {
    const { loader } = await fixture();
    const pack = await loader.loadPack("eu_ai_act");
    expect(pack.ok).toBe(true);
    if (pack.ok) {
      expect(pack.value.chunks).toHaveLength(2);
      expect(pack.value.crosswalk?.[0]?.links[0]?.chunkIds).toEqual(["art_4"]);
    }
    const hits = await loader.search("eu_ai_act", "AI literacy staff", 5);
    expect(hits.ok).toBe(true);
    if (hits.ok) expect(hits.value[0]?.chunk.id).toBe("art_4");
  });

  it("lists packs from the pipeline-emitted catalogue", async () => {
    const { loader } = await fixture();
    const list = await loader.listPacks();
    expect(list).toEqual({ ok: true, value: [{ id: "eu_ai_act", framework: "EU_AI_ACT", name: "EU AI Act", version: "OJ", license: "© EU", chunkCount: 2 }] });
  });

  it("fails closed with an integrity error when a file was tampered with", async () => {
    const { loader } = await fixture({ tamperChunks: true });
    const result = await loader.search("eu_ai_act", "literacy", 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("integrity");
    const again = await loader.loadPack("eu_ai_act");
    expect(again.ok).toBe(false);
  });

  it("rejects a manifest that violates the schema", async () => {
    const { loader } = await fixture({ badManifest: true });
    const result = await loader.loadPack("eu_ai_act");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid");
  });

  it("rejects a manifest whose id differs from the requested pack", async () => {
    const { loader } = await fixture({ wrongId: true });
    const result = await loader.loadPack("eu_ai_act");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/manifest id "other"/);
  });

  it("reports unsupported_version, not invalid, for a newer pack schema", async () => {
    const { loader } = await fixture({ schemaVersion: 2 });
    const result = await loader.loadPack("eu_ai_act");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unsupported_version");
  });

  it("reports not_found for a missing pack file (404)", async () => {
    const { loader } = await fixture({ missing: "topics.json" });
    const result = await loader.loadPack("eu_ai_act");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not_found");
  });

  it("reports not_found when an SPA fallback answers 200 text/html instead of the file", async () => {
    const { loader } = await fixture({ missing: "manifest.json", spaFallback: true });
    const result = await loader.loadPack("eu_ai_act");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_found");
      expect(result.error.message).toMatch(/not served as JSON/);
    }
  });

  it("never rejects: a body-stream failure becomes a network error", async () => {
    const { loader } = await fixture({ throwOnArrayBuffer: true });
    const result = await loader.loadPack("eu_ai_act");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("network");
  });

  it("caches a loaded pack and dedupes concurrent loads", async () => {
    const { loader, requests } = await fixture();
    await Promise.all([loader.loadPack("eu_ai_act"), loader.loadPack("eu_ai_act")]);
    await loader.search("eu_ai_act", "transparency", 1);
    expect(requests()).toBe(4); // manifest + chunks + topics + crosswalk, once
  });

  it("remembers a failure for the TTL instead of hammering the origin", async () => {
    let clock = 0;
    const { fetchFn, requests } = await fixture({ missing: "topics.json" });
    const loader = new PackLoader({ baseUrl: "/packs", fetchFn, failureTtlMs: 1000, now: () => clock });
    expect((await loader.loadPack("eu_ai_act")).ok).toBe(false);
    const afterFirst = requests();
    expect((await loader.search("eu_ai_act", "x", 1)).ok).toBe(false);
    expect(requests()).toBe(afterFirst); // served from the failure memo
    clock = 5000;
    expect((await loader.loadPack("eu_ai_act")).ok).toBe(false);
    expect(requests()).toBeGreaterThan(afterFirst); // TTL elapsed → refetched
  });
});
