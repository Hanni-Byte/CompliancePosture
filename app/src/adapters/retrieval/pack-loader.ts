import type { ZodType } from "zod";
import type { KnowledgePack, PackSummary } from "../../domain/entities/pack";
import { assertPackInvariants, isSupportedSchemaVersion } from "../../domain/entities/pack";
import type { PackError, RetrievalPort, RetrievedChunk } from "../../application/ports/retrieval";
import type { Result } from "../../application/result";
import { err, ok } from "../../application/result";
import { Bm25Index } from "./bm25";
import {
  chunksFileSchema,
  crosswalkFileSchema,
  manifestSchema,
  packIndexSchema,
  topicsFileSchema,
} from "./pack-schema";

export interface PackLoaderOptions {
  /** Same-origin by default: packs are served from /packs/<id>/… (CSP 'self'). */
  baseUrl?: string;
  fetchFn?: typeof fetch;
  /** Injectable for tests; defaults to WebCrypto SHA-256. */
  sha256?: (bytes: Uint8Array) => Promise<string>;
  /** How long a failed load is remembered before refetching (ms). */
  failureTtlMs?: number;
  now?: () => number;
}

interface LoadedPack {
  pack: KnowledgePack;
  index: Bm25Index;
}

export async function webCryptoSha256(bytes: Uint8Array): Promise<string> {
  // Browsers expose Web Crypto only in secure contexts (https or localhost).
  // Without it a pack cannot be verified, so it must not be used (fail closed).
  const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is unavailable: packs can only be verified in a secure context (HTTPS or localhost)");
  }
  const digest = await subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetches a pack on demand, validates every file against the zod mirror of
 * the pack schema, verifies sha256 against the manifest, re-asserts domain
 * invariants, then indexes it in memory. Any failure fails closed: nothing
 * from a bad pack is ever cached or searchable. The whole edge is wrapped in
 * one Result envelope — this adapter never rejects (D20).
 */
export class PackLoader implements RetrievalPort {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sha256: (bytes: Uint8Array) => Promise<string>;
  private readonly failureTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, LoadedPack>();
  private readonly failures = new Map<string, { at: number; error: PackError }>();
  private readonly inflight = new Map<string, Promise<Result<LoadedPack, PackError>>>();
  private catalogue: PackSummary[] | null = null;

  constructor(options: PackLoaderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/packs").replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.sha256 = options.sha256 ?? webCryptoSha256;
    this.failureTtlMs = options.failureTtlMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  async listPacks(): Promise<Result<PackSummary[], PackError>> {
    if (this.catalogue) return ok(this.catalogue);
    try {
      const bytes = await this.fetchBytes("index", `${this.baseUrl}/index.json`, "index.json", "no-cache");
      if (!bytes.ok) return bytes;
      const parsed = this.parseJson("index", "index.json", bytes.value, packIndexSchema);
      if (!parsed.ok) return parsed;
      if (!isSupportedSchemaVersion(parsed.value.schemaVersion)) {
        return err({ kind: "unsupported_version", packId: "index", message: `index schemaVersion ${parsed.value.schemaVersion}` });
      }
      this.catalogue = parsed.value.packs;
      return ok(this.catalogue);
    } catch (cause) {
      return err({ kind: "network", packId: "index", message: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  async loadPack(packId: string): Promise<Result<KnowledgePack, PackError>> {
    const loaded = await this.loadOrCached(packId);
    return loaded.ok ? ok(loaded.value.pack) : loaded;
  }

  async search(packId: string, query: string, k: number): Promise<Result<RetrievedChunk[], PackError>> {
    const loaded = await this.loadOrCached(packId);
    return loaded.ok ? ok(loaded.value.index.search(query, k)) : loaded;
  }

  private loadOrCached(packId: string): Promise<Result<LoadedPack, PackError>> {
    const hit = this.cache.get(packId);
    if (hit) return Promise.resolve(ok(hit));
    const recent = this.failures.get(packId);
    if (recent && this.now() - recent.at < this.failureTtlMs) return Promise.resolve(err(recent.error));
    const pending = this.inflight.get(packId);
    if (pending) return pending;
    const task = this.load(packId).finally(() => this.inflight.delete(packId));
    this.inflight.set(packId, task);
    return task;
  }

  /** Single Result envelope: nothing below may escape as a rejection. */
  private async load(packId: string): Promise<Result<LoadedPack, PackError>> {
    let result: Result<LoadedPack, PackError>;
    try {
      result = await this.loadUnsafe(packId);
    } catch (cause) {
      result = err({ kind: "network", packId, message: cause instanceof Error ? cause.message : String(cause) });
    }
    if (result.ok) {
      this.failures.delete(packId);
      this.cache.set(packId, result.value);
    } else {
      this.failures.set(packId, { at: this.now(), error: result.error });
    }
    return result;
  }

  private async loadUnsafe(packId: string): Promise<Result<LoadedPack, PackError>> {
    // The manifest is the one file that must always be revalidated; the
    // siblings it lists are content-addressed by sha256 and may be cached.
    const manifestBytes = await this.fetchBytes(packId, this.url(packId, "manifest.json"), "manifest.json", "no-cache");
    if (!manifestBytes.ok) return manifestBytes;
    const manifest = this.parseJson(packId, "manifest.json", manifestBytes.value, manifestSchema);
    if (!manifest.ok) return manifest;
    if (manifest.value.id !== packId) {
      return err({ kind: "invalid", packId, message: `manifest id "${manifest.value.id}" ≠ requested "${packId}"` });
    }
    if (!isSupportedSchemaVersion(manifest.value.schemaVersion)) {
      return err({ kind: "unsupported_version", packId, message: `pack schemaVersion ${manifest.value.schemaVersion} is not supported by this app` });
    }

    const entries = Object.entries(manifest.value.files);
    const fetched = await Promise.all(entries.map(([name, expected]) => this.fetchVerified(packId, name, expected)));
    const files: Record<string, Uint8Array> = {};
    for (const [i, result] of fetched.entries()) {
      if (!result.ok) return result;
      files[entries[i]![0]] = result.value;
    }

    const chunks = this.parseJson(packId, "chunks.json", files["chunks.json"]!, chunksFileSchema);
    if (!chunks.ok) return chunks;
    const topics = this.parseJson(packId, "topics.json", files["topics.json"]!, topicsFileSchema);
    if (!topics.ok) return topics;

    let crosswalk: KnowledgePack["crosswalk"];
    const crosswalkBytes = files["crosswalk.json"];
    if (crosswalkBytes) {
      const parsed = this.parseJson(packId, "crosswalk.json", crosswalkBytes, crosswalkFileSchema);
      if (!parsed.ok) return parsed;
      crosswalk = parsed.value as NonNullable<KnowledgePack["crosswalk"]>;
    }

    // zod types optional keys as `T | undefined`; absent keys are never
    // emitted at runtime, so the domain's exact-optional types hold.
    const pack: KnowledgePack = {
      manifest: manifest.value,
      chunks: chunks.value,
      topics: topics.value as KnowledgePack["topics"],
      ...(crosswalk ? { crosswalk } : {}),
    };
    try {
      assertPackInvariants(pack);
    } catch (cause) {
      return err({ kind: "invalid", packId, message: cause instanceof Error ? cause.message : String(cause) });
    }
    return ok({ pack, index: new Bm25Index(pack.chunks) });
  }

  /** Fetch a sha256-pinned sibling; on mismatch retry once bypassing caches. */
  private async fetchVerified(packId: string, name: string, expected: string): Promise<Result<Uint8Array, PackError>> {
    let bytes = await this.fetchBytes(packId, this.url(packId, name), name, "default");
    if (!bytes.ok) return bytes;
    if ((await this.sha256(bytes.value)) === expected) return bytes;
    bytes = await this.fetchBytes(packId, this.url(packId, name), name, "reload");
    if (!bytes.ok) return bytes;
    const actual = await this.sha256(bytes.value);
    if (actual !== expected) {
      return err({ kind: "integrity", packId, message: `${name}: sha256 ${actual} ≠ manifest ${expected}` });
    }
    return bytes;
  }

  private url(packId: string, name: string): string {
    return `${this.baseUrl}/${packId}/${name}`;
  }

  private async fetchBytes(packId: string, url: string, name: string, cache: RequestCache): Promise<Result<Uint8Array, PackError>> {
    let response: Response;
    try {
      response = await this.fetchFn(url, { cache });
    } catch {
      return err({ kind: "network", packId, message: `Could not fetch ${name}` });
    }
    if (response.status === 404) return err({ kind: "not_found", packId, message: `${name} not found` });
    if (!response.ok) return err({ kind: "network", packId, message: `${name}: HTTP ${response.status}` });
    // A static host with an SPA fallback answers missing files with 200 +
    // text/html; treat anything not served as JSON as absent.
    const type = response.headers.get("content-type") ?? "";
    if (!/json/i.test(type)) {
      return err({ kind: "not_found", packId, message: `${name} not served as JSON (${type || "no content-type"})` });
    }
    return ok(new Uint8Array(await response.arrayBuffer()));
  }

  private parseJson<T>(packId: string, name: string, bytes: Uint8Array, schema: ZodType<T>): Result<T, PackError> {
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return err({ kind: "invalid", packId, message: `${name} is not valid JSON` });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return err({ kind: "invalid", packId, message: `${name}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "schema violation"}`.trim() });
    }
    return ok(parsed.data);
  }
}
