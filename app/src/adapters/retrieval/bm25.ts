import type { Chunk } from "../../domain/entities/pack";
import type { RetrievedChunk } from "../../application/ports/retrieval";

/**
 * Pure-TS BM25 over a pack's chunks, built in the browser at load time (D21).
 * Deterministic by construction: fixed tokenizer, fixed parameters, stable
 * tie-break on chunk id. No stemming — predictable beats clever here.
 */
const K1 = 1.2;
const B = 0.75;
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "their", "this",
  "to", "was", "were", "which", "with", "shall", "such", "any", "all", "not",
]);

export function tokenize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

interface Posting {
  doc: number;
  tf: number;
}

export class Bm25Index {
  private readonly chunks: readonly Chunk[];
  private readonly postings = new Map<string, Posting[]>();
  private readonly docLength: number[];
  private readonly avgDocLength: number;

  constructor(chunks: readonly Chunk[]) {
    this.chunks = chunks;
    this.docLength = new Array<number>(chunks.length).fill(0);
    chunks.forEach((chunk, doc) => {
      // Title and ref are indexed with the body so "Article 26" finds Art. 26.
      const tokens = tokenize(`${chunk.title} ${chunk.ref} ${chunk.text}`);
      this.docLength[doc] = tokens.length;
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [term, tf] of counts) {
        const list = this.postings.get(term);
        if (list) list.push({ doc, tf });
        else this.postings.set(term, [{ doc, tf }]);
      }
    });
    const total = this.docLength.reduce((a, b) => a + b, 0);
    this.avgDocLength = chunks.length ? total / chunks.length : 0;
  }

  search(query: string, k: number): RetrievedChunk[] {
    const terms = [...new Set(tokenize(query))];
    if (terms.length === 0 || k <= 0) return [];
    const n = this.chunks.length;
    const scores = new Map<number, number>();
    for (const term of terms) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = Math.log(1 + (n - list.length + 0.5) / (list.length + 0.5));
      for (const { doc, tf } of list) {
        const len = this.docLength[doc] ?? 0;
        const norm = tf + K1 * (1 - B + (B * len) / (this.avgDocLength || 1));
        const partial = idf * ((tf * (K1 + 1)) / norm);
        scores.set(doc, (scores.get(doc) ?? 0) + partial);
      }
    }
    return [...scores.entries()]
      .map(([doc, score]) => ({ chunk: this.chunks[doc]!, score }))
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, k);
  }
}
