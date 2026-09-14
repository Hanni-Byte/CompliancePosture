import { describe, expect, it } from "vitest";
import { Bm25Index, tokenize } from "./bm25";
import type { Chunk } from "../../domain/entities/pack";

const chunks: Chunk[] = [
  { id: "art_26_1", ref: "Art. 26(1)", title: "Article 26 — Obligations of deployers", text: "Deployers of high-risk AI systems shall take appropriate technical and organisational measures.", url: "https://x/#art_26" },
  { id: "art_26_2", ref: "Art. 26(2)", title: "Article 26 — Obligations of deployers", text: "Deployers shall assign human oversight to natural persons who have the necessary competence.", url: "https://x/#art_26" },
  { id: "art_50_1", ref: "Art. 50(1)", title: "Article 50 — Transparency obligations", text: "Providers shall ensure that AI systems intended to interact directly with natural persons inform them they are interacting with an AI system.", url: "https://x/#art_50" },
  { id: "art_4", ref: "Art. 4", title: "Article 4 — AI literacy", text: "Providers and deployers shall take measures to ensure a sufficient level of AI literacy of their staff.", url: "https://x/#art_4" },
];

describe("tokenize", () => {
  it("lowercases, strips diacritics and stopwords, drops 1-char tokens", () => {
    expect(tokenize("The Déployers' oversight, of AI!")).toEqual(["deployers", "oversight", "ai"]);
  });
});

describe("Bm25Index", () => {
  const index = new Bm25Index(chunks);

  it("ranks the chunk about human oversight first for an oversight query", () => {
    const hits = index.search("human oversight competence", 3);
    expect(hits[0]?.chunk.id).toBe("art_26_2");
  });

  it("finds an article by its number via the indexed title/ref", () => {
    expect(index.search("Article 50", 1)[0]?.chunk.id).toBe("art_50_1");
  });

  it("returns nothing for empty or stopword-only queries", () => {
    expect(index.search("", 5)).toEqual([]);
    expect(index.search("the of and", 5)).toEqual([]);
  });

  it("is deterministic across runs and instances", () => {
    const a = index.search("deployers measures", 4).map((h) => h.chunk.id);
    const b = new Bm25Index(chunks).search("deployers measures", 4).map((h) => h.chunk.id);
    expect(a).toEqual(b);
  });

  it("respects k", () => {
    expect(index.search("deployers", 1)).toHaveLength(1);
  });
});
