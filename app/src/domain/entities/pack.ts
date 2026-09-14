/**
 * Knowledge packs — the framework texts the assessment cites (HANDOFF §8).
 * Types mirror the pack schema (pydantic in tools/packs, zod at the L3 edge);
 * this module owns the invariants and stays dependency-free.
 */

export type Framework =
  | "EU_AI_ACT"
  | "GDPR"
  | "OWASP_LLM_TOP_10"
  | "OWASP_AGENTIC_TOP_10"
  | "NIST_AI_RMF";

/** Bump when an app built for version N can no longer read a pack. */
export const PACK_SCHEMA_VERSION = 1;

export type PackFileName = "chunks.json" | "topics.json" | "crosswalk.json";

export interface Chunk {
  id: string;
  /** Human citation anchor, e.g. "Art. 26(1)" or "LLM01:2026 — Description". */
  ref: string;
  title: string;
  text: string;
  /** Primary-source deep link (EUR-Lex anchor, OWASP file at a pinned commit). */
  url: string;
}

export interface Topic {
  id: string;
  title: string;
  seedQueries: string[];
  dependsOnSlots: string[];
  /** ISO date the obligations apply from; absent = not date-gated. */
  appliesFrom?: string;
  notes?: string;
}

export interface CrosswalkLink {
  framework: string;
  frameworkId?: Framework;
  ref: string;
  title: string;
  tier?: string;
  url?: string;
  notes?: string;
  /** Target pack when the reference resolves to one of our packs. */
  packId?: string;
  chunkIds: string[];
}

export interface Incident {
  name: string;
  year?: number;
  incidentId?: string;
}

export interface CrosswalkEntry {
  entryId: string;
  name: string;
  severity?: string;
  sourceUrl: string;
  links: CrosswalkLink[];
  incidents: Incident[];
}

export interface SourceRef {
  url: string;
  revision: string;
  sha256: string;
}

export interface PackManifest {
  schemaVersion: number;
  id: string;
  framework: Framework;
  name: string;
  /** Consolidated-version string shown in reports (reproducibility). */
  version: string;
  sources: SourceRef[];
  /** Attribution text that MUST be rendered wherever pack content is shown. */
  license: string;
  chunkCount: number;
  topicCount: number;
  /** sha256 per sibling file; the loader fails closed on mismatch. */
  files: Partial<Record<PackFileName, string>>;
}

export interface KnowledgePack {
  manifest: PackManifest;
  chunks: Chunk[];
  topics: Topic[];
  crosswalk?: CrosswalkEntry[];
}

/** One row of the pipeline-emitted catalogue (`/packs/index.json`). */
export interface PackSummary {
  id: string;
  framework: Framework;
  name: string;
  version: string;
  license: string;
  chunkCount: number;
}

/**
 * A citation can only be built from a chunk retrieval actually returned
 * (§2.3). Feature 4 adds the constructor that enforces it.
 */
export interface Citation {
  packId: string;
  chunkId: string;
  ref: string;
  url: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Invariants re-asserted after edge validation (§2.9). Throws on violation. */
export function assertPackInvariants(pack: KnowledgePack): void {
  const { manifest, chunks, topics } = pack;
  assert(
    manifest.schemaVersion === PACK_SCHEMA_VERSION,
    `pack ${manifest.id}: schemaVersion ${manifest.schemaVersion} ≠ ${PACK_SCHEMA_VERSION}`,
  );
  assert(manifest.chunkCount === chunks.length, `pack ${manifest.id}: chunkCount ${manifest.chunkCount} ≠ ${chunks.length} chunks`);
  assert(manifest.topicCount === topics.length, `pack ${manifest.id}: topicCount ${manifest.topicCount} ≠ ${topics.length} topics`);
  assert(
    ("crosswalk.json" in manifest.files) === (pack.crosswalk !== undefined),
    `pack ${manifest.id}: crosswalk.json listed in manifest but missing, or vice versa`,
  );

  const chunkIds = new Set<string>();
  for (const chunk of chunks) {
    assert(chunk.id !== "", `pack ${manifest.id}: chunk with empty id`);
    assert(!chunkIds.has(chunk.id), `pack ${manifest.id}: duplicate chunk id ${chunk.id}`);
    chunkIds.add(chunk.id);
    assert(chunk.ref !== "", `pack ${manifest.id}: chunk ${chunk.id} has no ref`);
    assert(chunk.url !== "", `pack ${manifest.id}: chunk ${chunk.id} has no url`);
    assert(chunk.text !== "", `pack ${manifest.id}: chunk ${chunk.id} has no text`);
  }

  const topicIds = new Set<string>();
  for (const topic of topics) {
    assert(!topicIds.has(topic.id), `pack ${manifest.id}: duplicate topic id ${topic.id}`);
    topicIds.add(topic.id);
  }

  for (const entry of pack.crosswalk ?? []) {
    const matched = [...topicIds].some((t) => t === entry.entryId || t.startsWith(entry.entryId + "_"));
    assert(matched, `pack ${manifest.id}: crosswalk entry ${entry.entryId} has no matching topic`);
    for (const link of entry.links) {
      if (link.packId === manifest.id) {
        for (const id of link.chunkIds) {
          assert(chunkIds.has(id), `pack ${manifest.id}: crosswalk ${entry.entryId} → unknown chunk ${id}`);
        }
      }
    }
  }
}

/** Version gate used by loaders to distinguish "newer than me" from "invalid". */
export function isSupportedSchemaVersion(version: number): boolean {
  return version === PACK_SCHEMA_VERSION;
}
