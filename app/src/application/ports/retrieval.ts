import type { Chunk, KnowledgePack, PackSummary } from "../../domain/entities/pack";
import type { Result } from "../result";

export type PackError = { packId: string; message: string } & (
  | { kind: "not_found" }             // pack or file absent, or not served as JSON
  | { kind: "network" }               // could not fetch / read
  | { kind: "invalid" }               // schema or invariant violation (fail closed)
  | { kind: "integrity" }             // sha256 mismatch against the manifest (fail closed)
  | { kind: "unsupported_version" }   // pack schema newer/older than this app
);

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
}

/**
 * Local retrieval over knowledge packs (D3/D21): packs are fetched on demand,
 * verified, and indexed in the browser. Implementations must never expose a
 * pack that failed verification.
 */
export interface RetrievalPort {
  /** The pipeline-emitted catalogue of available packs. */
  listPacks(): Promise<Result<PackSummary[], PackError>>;
  loadPack(packId: string): Promise<Result<KnowledgePack, PackError>>;
  /** Top-`k` chunks for `query`, best first; deterministic for equal inputs. */
  search(packId: string, query: string, k: number): Promise<Result<RetrievedChunk[], PackError>>;
}
