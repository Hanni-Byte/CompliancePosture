import { describe, expect, it } from "vitest";
import { PACK_SCHEMA_VERSION, assertPackInvariants, isSupportedSchemaVersion, type KnowledgePack } from "./pack";

function pack(over: Partial<KnowledgePack> = {}, manifestOver: Partial<KnowledgePack["manifest"]> = {}): KnowledgePack {
  return {
    manifest: {
      schemaVersion: PACK_SCHEMA_VERSION,
      id: "p",
      framework: "EU_AI_ACT",
      name: "n",
      version: "v",
      sources: [{ url: "https://s", revision: "r", sha256: "a".repeat(64) }],
      license: "l",
      chunkCount: 1,
      topicCount: 1,
      files: { "chunks.json": "a".repeat(64), "topics.json": "a".repeat(64) },
      ...manifestOver,
    },
    chunks: [{ id: "art_1", ref: "Art. 1", title: "t", text: "x", url: "https://u" }],
    topics: [{ id: "llm01_x", title: "t", seedQueries: ["q"], dependsOnSlots: [] }],
    ...over,
  };
}

/** Truth table for the domain invariants (constitution quality gates). */
describe("assertPackInvariants", () => {
  it("accepts a consistent pack", () => {
    expect(() => assertPackInvariants(pack())).not.toThrow();
  });

  it.each<[string, () => KnowledgePack, RegExp]>([
    ["schema version mismatch", () => pack({}, { schemaVersion: 99 }), /schemaVersion 99/],
    ["chunkCount mismatch", () => pack({}, { chunkCount: 3 }), /chunkCount 3 ≠ 1 chunks/],
    ["topicCount mismatch", () => pack({}, { topicCount: 0 }), /topicCount 0 ≠ 1 topics/],
    ["duplicate chunk id", () => pack({ chunks: [pack().chunks[0]!, pack().chunks[0]!] }, { chunkCount: 2 }), /duplicate chunk id art_1/],
    ["empty ref", () => pack({ chunks: [{ ...pack().chunks[0]!, ref: "" }] }), /chunk art_1 has no ref/],
    ["empty url", () => pack({ chunks: [{ ...pack().chunks[0]!, url: "" }] }), /chunk art_1 has no url/],
    ["empty text", () => pack({ chunks: [{ ...pack().chunks[0]!, text: "" }] }), /chunk art_1 has no text/],
    ["duplicate topic id", () => pack({ topics: [pack().topics[0]!, pack().topics[0]!] }, { topicCount: 2 }), /duplicate topic id/],
    ["crosswalk listed but absent", () => pack({}, { files: { "chunks.json": "a".repeat(64), "topics.json": "a".repeat(64), "crosswalk.json": "a".repeat(64) } }), /crosswalk\.json listed/],
    ["crosswalk present but not listed", () => pack({ crosswalk: [] }), /crosswalk\.json listed/],
    [
      "crosswalk entry without topic",
      () => pack({ crosswalk: [{ entryId: "llm09", name: "n", sourceUrl: "https://x", links: [], incidents: [] }] }, { files: { "chunks.json": "a".repeat(64), "topics.json": "a".repeat(64), "crosswalk.json": "a".repeat(64) } }),
      /crosswalk entry llm09 has no matching topic/,
    ],
    [
      "self-referencing crosswalk chunk id that does not exist",
      () => pack({ crosswalk: [{ entryId: "llm01", name: "n", sourceUrl: "https://x", links: [{ framework: "f", ref: "r", title: "t", packId: "p", chunkIds: ["nope"] }], incidents: [] }] }, { files: { "chunks.json": "a".repeat(64), "topics.json": "a".repeat(64), "crosswalk.json": "a".repeat(64) } }),
      /unknown chunk nope/,
    ],
  ])("rejects %s", (_name, make, message) => {
    expect(() => assertPackInvariants(make())).toThrow(message);
  });
});

describe("isSupportedSchemaVersion", () => {
  it("accepts exactly the current version", () => {
    expect(isSupportedSchemaVersion(PACK_SCHEMA_VERSION)).toBe(true);
    expect(isSupportedSchemaVersion(PACK_SCHEMA_VERSION + 1)).toBe(false);
    expect(isSupportedSchemaVersion(0)).toBe(false);
  });
});
